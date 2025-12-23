/**
 * Rename 命令
 * 重新命名程式碼元素
 */

import type { Command } from 'commander';
import * as path from 'path';
import { IndexEngine } from '@core/shared/indexing/index-engine.js';
import { createIndexConfig } from '@core/shared/indexing/types.js';
import { RenameEngine } from '@core/rename/rename-engine.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { ChangeApplicator, convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
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
  at?: string;
  dryRun?: boolean;
  format: string;
}

/** 解析後的位置資訊 */
interface ParsedLocation {
  filePath: string;
  line?: number;
  column?: number;
}

/**
 * 解析 --at 參數 (file:line:column 格式)
 * 支援格式：
 * - src/file.ts
 * - src/file.ts:42
 * - src/file.ts:42:10
 */
function parseAtLocation(at: string, basePath: string): ParsedLocation {
  // 從後往前找冒號，因為 Windows 路徑可能有 C: 開頭
  const parts = at.split(':');

  // 檢查最後兩個部分是否為數字
  let filePath: string;
  let line: number | undefined;
  let column: number | undefined;

  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const secondLastPart = parts[parts.length - 2];

    if (/^\d+$/.test(lastPart) && /^\d+$/.test(secondLastPart)) {
      // file:line:column
      column = parseInt(lastPart, 10);
      line = parseInt(secondLastPart, 10);
      filePath = parts.slice(0, -2).join(':');
    } else if (/^\d+$/.test(lastPart)) {
      // file:line (Windows path like C:\path:42)
      line = parseInt(lastPart, 10);
      filePath = parts.slice(0, -1).join(':');
    } else {
      // 全部都是路徑
      filePath = at;
    }
  } else if (parts.length === 2) {
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
      // file:line
      line = parseInt(lastPart, 10);
      filePath = parts[0];
    } else {
      // Windows path like C:\path
      filePath = at;
    }
  } else {
    filePath = at;
  }

  // 轉換為絕對路徑
  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(basePath, filePath);
  }

  return { filePath, line, column };
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
    .option('-a, --at <location>', '指定符號位置 (file:line:column)，用於區分同名符號')
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
    outputHandler.outputError('必須指定符號名稱和新名稱。使用方式: agent-ide rename --symbol <name> --new-name <name>', format, 'rename');
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  // 如果 from 和 to 相同，直接返回成功但無操作
  if (from === to) {
    if (isJsonFormat) {
      console.log(JSON.stringify({
        command: 'rename',
        success: true,
        files: [],
        summary: { totalFiles: 0, totalChanges: 0, additions: 0, deletions: 0 },
        operations: 0,
        affectedFiles: 0,
        operationDescription: `No changes needed: '${from}' is already named '${to}'`
      }));
    } else {
      console.log(`   沒有變更需要：'${from}' 已經是 '${to}'`);
    }
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
        if (hasPackageJson || hasGit) {
          workspacePath = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }
    }

    // 初始化索引引擎（每次都重新索引以確保資料是最新的）
    const config = createIndexConfig(workspacePath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx'],
      excludePatterns: ['node_modules/**', '*.test.*']
    });
    const indexEngine = new IndexEngine(config, context.fileSystem);

    try {
      await indexEngine.indexProject(workspacePath);

      // 初始化重新命名引擎（傳入 fileSystem）
      const renameEngine = new RenameEngine(undefined, context.fileSystem);

    // 1. 查找符號
    if (!isJsonFormat) {
      console.log(`   查找符號 "${from}"...`);
    }
    const searchResults = await indexEngine.findSymbol(from);

    if (searchResults.length === 0) {
      outputHandler.outputError(`找不到符號 "${from}"`, format, 'rename');
      process.exitCode = 1;
      return;
    }

    // 2. 處理多符號情況
    let targetSymbol;

    if (searchResults.length > 1) {
      // 有指定 --at 時，過濾到指定位置
      if (options.at) {
        const location = parseAtLocation(options.at, workspacePath);
        const filtered = searchResults.filter(result => {
          const symbolPath = result.symbol.location.filePath;
          const symbolLine = result.symbol.location.range.start.line;
          const symbolColumn = result.symbol.location.range.start.column;

          // 檔案路徑必須匹配
          if (symbolPath !== location.filePath) return false;

          // 行號匹配（如果指定）
          if (location.line !== undefined && symbolLine !== location.line) return false;

          // 列號匹配（如果指定）
          if (location.column !== undefined && symbolColumn !== location.column) return false;

          return true;
        });

        if (filtered.length === 0) {
          const locationStr = options.at;
          outputHandler.outputError(
            `在指定位置 "${locationStr}" 找不到符號 "${from}"`,
            format,
            'rename'
          );
          process.exitCode = 1;
          return;
        }

        if (filtered.length > 1) {
          // 同一位置還有多個（理論上不太可能，但以防萬一）
          const lines = filtered.map((result, index) => {
            const loc = result.symbol.location;
            const relPath = path.relative(workspacePath, loc.filePath);
            return `   ${index + 1}. ${relPath}:${loc.range.start.line}:${loc.range.start.column}`;
          });
          outputHandler.outputError(
            `找到 ${filtered.length} 個符號 "${from}" 在指定位置，請更精確指定：\n\n${lines.join('\n')}`,
            format,
            'rename'
          );
          process.exitCode = 1;
          return;
        }

        targetSymbol = filtered[0].symbol;
      } else {
        // 沒有指定 --at，報錯並列出所有符號
        const lines = searchResults.map((result, index) => {
          const loc = result.symbol.location;
          const relPath = path.relative(workspacePath, loc.filePath);
          const symbolType = result.symbol.type || 'symbol';
          return `   ${index + 1}. ${relPath}:${loc.range.start.line}:${loc.range.start.column}  (${symbolType})`;
        });

        outputHandler.outputError(
          `找到 ${searchResults.length} 個同名符號 "${from}"，請用 --at 指定位置：\n\n${lines.join('\n')}\n\n` +
          `用法: agent-ide rename --from ${from} --to ${to} --at <file:line:column>`,
          format,
          'rename'
        );
        process.exitCode = 1;
        return;
      }
    } else {
      targetSymbol = searchResults[0].symbol;
    }

    // 取得所有專案檔案
    const allProjectFiles = await getAllProjectFiles(workspacePath, context);

    // 2. 使用新的 Changeset 流程
    const applicator = new ChangeApplicator(context.fileSystem);

    // 生成 Changeset
    const changeset = await renameEngine.generateChangeset({
      symbol: targetSymbol,
      newName: to,
      filePaths: allProjectFiles
    });

    if (!changeset.success) {
      outputHandler.outputError(changeset.errors?.join(', ') ?? '生成變更失敗', format, 'rename');
      process.exitCode = 1;
      return;
    }

    // 轉換為 PreviewInput
    const previewInput = await convertChangesetToPreviewInput(changeset, context.fileSystem);

    // 3. Dry-run 模式只輸出預覽
    if (options.dryRun) {
      outputHandler.outputMutation(previewInput, format);
      return;
    }

    // 4. 執行重新命名（處理跨檔案引用）
    if (!isJsonFormat) {
      console.log('   執行重新命名...');
    }

    // 應用變更（帶回滾）
    const result = await applicator.apply(changeset, {
      atomic: true,
      rollbackOnError: true
    });

    if (result.success) {
      outputHandler.outputMutation(previewInput, format);
    } else {
      outputHandler.outputError(result.errors?.join(', ') ?? '執行失敗', format, 'rename');
      process.exitCode = 1;
    }
    } finally {
      indexEngine.dispose();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(`重新命名失敗: ${errorMsg}`, format, 'rename');
    process.exitCode = 1;
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
