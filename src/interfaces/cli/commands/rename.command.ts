/**
 * Rename 命令
 * 重新命名程式碼元素
 */

import type { Command } from 'commander';
import * as path from 'path';
import { IndexEngine } from '@core/indexing/index-engine.js';
import { createIndexConfig } from '@core/indexing/types.js';
import { RenameEngine } from '@core/rename/rename-engine.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { convertRenamePreview } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Rename 命令選項 */
interface RenameOptions {
  type: string;
  symbol?: string;
  from?: string;
  newName?: string;
  to?: string;
  path: string;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 rename 命令
 */
export function setupRenameCommand(program: Command, context: CommandContext): void {
  program
    .command('rename')
    .description('重新命名程式碼元素')
    .option('-t, --type <type>', '符號類型 (variable|function|class|interface)', 'variable')
    .option('-s, --symbol <name>', '要重新命名的符號')
    .option('-f, --from <name>', '原始名稱（--symbol 的別名）')
    .option('-n, --new-name <name>', '新名稱')
    .option('-o, --to <name>', '新名稱（--new-name 的別名）')
    .option('-p, --path <path>', '檔案或目錄路徑', '.')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (options: RenameOptions) => {
      await handleRenameCommand(options, context);
    });
}

/**
 * 處理 rename 命令
 */
async function handleRenameCommand(options: RenameOptions, context: CommandContext): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, true);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary, diff', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  // 支援多種參數名稱
  const from = options.symbol || options.from;
  const to = options.newName || options.to;
  const isJsonFormat = format === OutputFormat.Json;

  if (!from || !to) {
    if (isJsonFormat) {
      console.error(JSON.stringify({ error: '必須指定符號名稱和新名稱' }));
    } else {
      console.error('必須指定符號名稱和新名稱');
      console.error('   使用方式: agent-ide rename --symbol <name> --new-name <name>');
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  if (!isJsonFormat) {
    console.log(`   重新命名 ${from}   ${to}`);
  }

  try {
    let workspacePath = options.path || process.cwd();

    // 如果路徑指向檔案，取其所在目錄
    const isFile = await context.fileSystem.isFile(workspacePath);
    if (isFile) {
      workspacePath = path.dirname(workspacePath);
      // 往上查找專案根目錄（包含 package.json、.git 等）
      let currentDir = workspacePath;
      while (currentDir !== path.dirname(currentDir)) {
        const hasPackageJson = await context.fileSystem.exists(path.join(currentDir, 'package.json'));
        const hasGit = await context.fileSystem.exists(path.join(currentDir, '.git'));
        const hasSwiftPackage = await context.fileSystem.exists(path.join(currentDir, 'Package.swift'));
        if (hasPackageJson || hasGit || hasSwiftPackage) {
          workspacePath = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }
    }

    // 初始化索引引擎（每次都重新索引以確保資料是最新的）
    const config = createIndexConfig(workspacePath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*']
    });
    const indexEngine = new IndexEngine(config, context.fileSystem);
    await indexEngine.indexProject(workspacePath);

    // 初始化重新命名引擎
    const renameEngine = new RenameEngine();

    // 1. 查找符號
    if (!isJsonFormat) {
      console.log(`   查找符號 "${from}"...`);
    }
    const searchResults = await indexEngine.findSymbol(from);

    if (searchResults.length === 0) {
      if (isJsonFormat) {
        console.error(JSON.stringify({ error: `找不到符號 "${from}"` }));
      } else {
        console.log(`   找不到符號 "${from}"`);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    if (searchResults.length > 1 && !isJsonFormat) {
      console.log('   找到多個符號，使用第一個:');
      searchResults.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.symbol.name} 在 ${result.symbol.location.filePath}:${result.symbol.location.range.start.line}`);
      });
    }

    const targetSymbol = searchResults[0].symbol;

    // 2. Dry-run 預覽變更
    if (options.dryRun) {
      try {
        const allProjectFiles = await getAllProjectFiles(workspacePath, context);

        const preview = await renameEngine.previewRename({
          symbol: targetSymbol,
          newName: to,
          filePaths: allProjectFiles
        });

        // 讀取受影響檔案的原始內容
        const originalContents = new Map<string, string>();
        for (const filePath of preview.affectedFiles) {
          try {
            const content = await context.fileSystem.readFile(filePath, 'utf-8') as string;
            originalContents.set(filePath, content);
          } catch {
            // 忽略無法讀取的檔案
          }
        }

        // 轉換為統一的 PreviewInput 格式
        const previewInput = convertRenamePreview(
          preview.operations,
          preview.conflicts,
          originalContents,
          { oldName: from, newName: to }
        );

        // 使用統一輸出處理器
        outputHandler.outputMutation(previewInput, format);
        return;
      } catch (previewError) {
        const errorMsg = previewError instanceof Error ? previewError.message : String(previewError);
        if (isJsonFormat) {
          console.error(JSON.stringify({ error: errorMsg }));
        } else {
          console.error('   預覽失敗:', errorMsg);
        }
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }
    }

    // 3. 執行重新命名（處理跨檔案引用）
    if (!isJsonFormat) {
      console.log('   執行重新命名...');
    }

    // 取得所有專案檔案（使用與 preview 相同的邏輯）
    const allProjectFiles = await getAllProjectFiles(workspacePath, context);

    // 使用 renameEngine 執行重新命名（與 preview 使用相同的引擎）
    const renameResult = await renameEngine.rename({
      symbol: targetSymbol,
      newName: to,
      filePaths: allProjectFiles
    });

    if (renameResult.success) {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          affectedFiles: renameResult.affectedFiles.length,
          operations: renameResult.operations.length,
          files: renameResult.affectedFiles
        }, null, 2));
      } else {
        console.log('   重新命名成功!');
        console.log(`   統計: ${renameResult.affectedFiles.length} 檔案, ${renameResult.operations.length} 變更`);

        renameResult.operations.forEach(operation => {
          console.log(`      ${operation.filePath}: "${operation.oldText}"   "${operation.newText}"`);
        });
      }
    } else {
      if (isJsonFormat) {
        console.error(JSON.stringify({
          success: false,
          errors: renameResult.errors || ['重新命名失敗']
        }));
      } else {
        console.error('   重新命名失敗:');
        renameResult.errors?.forEach(error => {
          console.error(`   - ${error}`);
        });
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }

  } catch (error) {
    if (isJsonFormat) {
      console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error('   重新命名失敗:', error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 取得所有專案檔案
 */
async function getAllProjectFiles(projectPath: string, context: CommandContext): Promise<string[]> {
  const files: string[] = [];
  // 從 ParserRegistry 獲取所有支援的副檔名
  const registry = ParserRegistry.getInstance();
  const allowedExtensions = registry.getSupportedExtensions();
  const excludePatterns = ['node_modules', 'dist', '.git', 'coverage'];

  // 檢查路徑是檔案還是目錄
  try {
    const isFile = await context.fileSystem.isFile(projectPath);

    if (isFile) {
      // 如果是單一檔案，直接返回
      if (allowedExtensions.some(ext => projectPath.endsWith(ext))) {
        return [projectPath];
      }
      return [];
    }
  } catch {
    // 路徑不存在
    return [];
  }

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await context.fileSystem.readDirectory(dir);

      for (const entry of entries) {
        const fullPath = entry.path;

        if (entry.isDirectory) {
          // 跳過排除的目錄
          if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
            continue;
          }
          await walkDir(fullPath);
        } else if (entry.isFile) {
          // 只包含支援的副檔名
          if (allowedExtensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // 忽略無法存取的目錄
    }
  }

  await walkDir(projectPath);
  return files;
}
