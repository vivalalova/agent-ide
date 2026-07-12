/**
 * Rename 命令
 * 重新命名程式碼元素
 */

import type { Command } from 'commander';
import * as path from 'path';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';
import { RenameEngine } from '@core/rename/rename-engine.js';
import { ConflictType } from '@core/rename/types.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { PreviewCommand } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import {
  createEmptyMutationPreviewInput,
  outputMutationWithLegacyFields,
  tryParseOutputFormat,
  executeMutationCommand
} from '@interfaces/cli/command-utils.js';
import { parsePathLocationAbsolute } from '@interfaces/cli/path-location-parser.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/index.js';
import type { Symbol as CodeSymbol } from '@shared/types/symbol.js';

/** Rename 命令選項 */
interface RenameOptions {
  symbol?: string;
  from?: string;
  newName?: string;
  to?: string;
  path: string;
  at?: string;
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
    .option('-s, --symbol <name>', '要重新命名的符號')
    .option('-f, --from <name>', '原始名稱（--symbol 的別名）')
    .option('-n, --new-name <name>', '新名稱')
    .option('-o, --to <name>', '新名稱（--new-name 的別名）')
    .option('-p, --path <path>', '檔案或目錄路徑', '.')
    .option('-a, --at <location>', '指定符號位置 (file:line:column)，用於區分同名符號')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (options: RenameOptions, command: Command) => {
      await handleRenameCommand(options, context, command);
    });
}

/**
 * 處理 rename 命令
 */
async function handleRenameCommand(options: RenameOptions, context: CommandContext, command: Command): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, true, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  // 支援多種參數名稱
  const from = options.symbol || options.from;
  const to = options.newName || options.to;
  const isJsonFormat = format === OutputFormat.Json;

  if (!from || !to) {
    outputHandler.outputError('必須指定符號名稱和新名稱。使用方式: agent-ide rename --symbol <name> --new-name <name>', format, 'rename');
    process.exitCode = 1;
    return;
  }

  // 如果 from 和 to 相同，直接返回成功但無操作
  if (from === to) {
    if (isJsonFormat) {
      outputMutationWithLegacyFields(
        outputHandler,
        createEmptyMutationPreviewInput(
          PreviewCommand.Rename,
          `No changes needed: '${from}' is already named '${to}'`
        ),
        format
      );
    } else {
      console.log(`   沒有變更需要：'${from}' 已經是 '${to}'`);
    }
    return;
  }

  if (!isJsonFormat) {
    process.stderr.write(`   重新命名 ${from}   ${to}\n`);
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

    const globalOpts = command.optsWithGlobals() as { cache?: boolean; cacheDir?: string };
    const noCache = globalOpts.cache === false;

    const indexEngine = await createAndIndexWithCache(
      workspacePath,
      context.fileSystem,
      {
        includeExtensions: CLI_INDEX_DEFAULTS.includeExtensions,
        excludePatterns: ['node_modules/**', '*.test.*']
      },
      { noCache, cacheDir: globalOpts.cacheDir }
    );

    try {

    // 1. 查找符號
    if (!isJsonFormat) {
      process.stderr.write(`   查找符號 "${from}"...\n`);
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
        const location = parsePathLocationAbsolute(options.at, workspacePath);
        const filtered = searchResults.filter(result => {
          const symbolPath = result.symbol.location.filePath;
          const symbolLine = result.symbol.location.range.start.line;
          const symbolColumn = result.symbol.location.range.start.column;

          // 檔案路徑必須匹配
          if (symbolPath !== location.filePath) {return false;}

          // 行號匹配（如果指定）
          if (location.line !== undefined && symbolLine !== location.line) {return false;}

          // 列號匹配（如果指定）
          if (location.column !== undefined && symbolColumn !== location.column) {return false;}

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

    targetSymbol = await resolveParserBackedSymbol(targetSymbol, context, ParserRegistry.getInstance(), Boolean(options.at));
    // 無條件注入 ParserRegistry：讓所有符號（含非 function-local 的頂層 const/function/class）
    // 的引用查找都走 AST 感知路徑（SymbolFinder → Language Service），而非降級為 `\bname\b`
    // 純文字匹配。純文字匹配會誤改同名的 interface 屬性鍵、object literal 鍵與成員存取（缺陷 R2）。
    const renameEngine = new RenameEngine(
      ParserRegistry.getInstance(),
      context.fileSystem
    );

    // 生成 Changeset
    const changeset = await renameEngine.generateChangeset({
      symbol: targetSymbol,
      newName: to,
      filePaths: allProjectFiles
    });

    // 執行變更類命令統一流程
    if (!isJsonFormat && !options.dryRun) {
      process.stderr.write('   執行重新命名...\n');
    }

    if (!options.dryRun) {
      // 驗證衝突以 type:message warning 傳遞；未知 warning 維持原本可套用語意。
      const conflictWarnings = (changeset.warnings ?? []).filter(warning =>
        Object.values(ConflictType).some(type => warning.startsWith(`${type}:`))
      );

      if (conflictWarnings.length > 0) {
        outputHandler.outputError(
          `重新命名存在衝突，無法套用：\n${conflictWarnings.map(warning => `   ${warning}`).join('\n')}`,
          format,
          'rename'
        );
        process.exitCode = 1;
        return;
      }
    }

    await executeMutationCommand(changeset, {
      fileSystem: context.fileSystem,
      format,
      dryRun: options.dryRun ?? false,
      outputHandler,
      commandName: 'rename'
    });
    } finally {
      await indexEngine.disposeAsync();
    }
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    outputHandler.outputError(`重新命名失敗: ${errorMsg}`, format, 'rename');
    process.exitCode = 1;
  }
}

async function resolveParserBackedSymbol(
  symbol: CodeSymbol,
  context: CommandContext,
  registry: ParserRegistry,
  strict: boolean
): Promise<CodeSymbol> {
  const filePath = symbol.location.filePath;
  const parser = registry.getParser(path.extname(filePath));

  if (!parser) {
    return symbol;
  }

  const content = await context.fileSystem.readFile(filePath, 'utf-8') as string;
  const ast = await parser.parse(content, filePath);
  const symbols = await parser.extractSymbols(ast);
  const resolved = symbols.find(candidate =>
    candidate.name === symbol.name
    && candidate.type === symbol.type
    && candidate.location.filePath === symbol.location.filePath
    && candidate.location.range.start.line === symbol.location.range.start.line
    && candidate.location.range.start.column === symbol.location.range.start.column
  );

  if (!resolved && strict) {
    throw new Error(`無法從 AST 解析指定位置的符號 "${symbol.name}"`);
  }

  return resolved ?? symbol;
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
    // graceful-degradation: tab completion 路徑/目錄不可用時靜默跳過
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
      // graceful-degradation: tab completion 路徑/目錄不可用時靜默跳過
    }
  }

  await walkDir(projectPath);
  return files;
}
