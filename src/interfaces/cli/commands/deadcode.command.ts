/**
 * deadcode 命令
 * 檢測與刪除未使用的程式碼
 */

import type { Command } from 'commander';
import { IndexEngine, CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/index.js';
import { createAndIndexWithCache } from '@interfaces/cli/cached-index-engine.js';
import {
  createDeadCodeDetector,
  createDeadCodeRemover,
  type DeadCodeDetectionResult
} from '@core/deadcode/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat, executeMutationCommand } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** deadcode 命令選項 */
interface DeadCodeOptions {
  path: string;
  format: string;
  includeExports: boolean;
  includePublicMembers: boolean;
  dryRun: boolean;
  exclude: string[];
}

/**
 * 設定 deadcode 命令
 */
export function setupDeadCodeCommand(program: Command, context: CommandContext): void {
  program
    .command('deadcode')
    .description('檢測並刪除未使用的程式碼（dead code）')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary|diff)', 'summary')
    .option('--include-exports', '包含 export 的符號（預設排除）', false)
    .option('--include-public-members', '包含 public class members（預設排除）', false)
    .option('--dry-run', '預覽變更而不執行')
    .option('--exclude <patterns...>', '排除的檔案/符號模式')
    .action(async (options: DeadCodeOptions, command: Command) => {
      await handleDeadCodeCommand(options, context, command);
    });
}


/**
 * 執行 dead code 檢測並回傳結果
 */
async function runDeadCodeDetection(
  options: DeadCodeOptions,
  context: CommandContext,
  indexEngine: IndexEngine,
  parserRegistry: ParserRegistry
): Promise<DeadCodeDetectionResult> {
  const detector = createDeadCodeDetector(
    indexEngine,
    parserRegistry,
    context.fileSystem,
    {
      includeExports: options.includeExports,
      includePublicMembers: options.includePublicMembers
    }
  );

  return detector.detect();
}

/**
 * 處理 deadcode 命令
 */
async function handleDeadCodeCommand(
  options: DeadCodeOptions,
  context: CommandContext,
  command: Command
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, true, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  const isJsonFormat = format === OutputFormat.Json;

  if (!isJsonFormat) {
    console.log('   檢測並準備刪除 Dead Code...');
  }

  const projectPath = options.path || process.cwd();

  // 檢查路徑是否存在
  const exists = await context.fileSystem.exists(projectPath);
  if (!exists) {
    outputHandler.outputError(`路徑不存在: ${projectPath}`, format);
    process.exitCode = 1;
    return;
  }

  const globalOpts = command.optsWithGlobals() as { cache?: boolean; cacheDir?: string };
  const noCache = globalOpts.cache === false;

  const indexEngine = await createAndIndexWithCache(
    projectPath,
    context.fileSystem,
    CLI_INDEX_DEFAULTS,
    { noCache, cacheDir: globalOpts.cacheDir }
  );

  const parserRegistry = ParserRegistry.getInstance();

  try {

    // 1. 執行 dead code 檢測
    const detectionResult = await runDeadCodeDetection(options, context, indexEngine, parserRegistry);

    if (!detectionResult.success) {
      outputHandler.outputError(`檢測失敗: ${detectionResult.error}`, format);
      process.exitCode = 1;
      return;
    }

    if (detectionResult.items.length === 0) {
      if (!isJsonFormat) {
        console.log('   沒有檢測到 dead code');
      } else {
        console.log(JSON.stringify({ success: true, message: '沒有檢測到 dead code', removals: [] }));
      }
      return;
    }

    // 2. 建立 DeadCodeRemover
    // 區分 --exclude 參數中的檔案模式和符號名稱
    const excludePatterns = options.exclude || [];
    const excludeFiles = excludePatterns.filter(p =>
      p.includes('/') || p.includes('*') || p.includes('?') || p.startsWith('.')
    );
    const excludeSymbols = excludePatterns.filter(p =>
      !p.includes('/') && !p.includes('*') && !p.includes('?') && !p.startsWith('.')
    );

    const remover = createDeadCodeRemover(
      context.fileSystem,
      parserRegistry,
      {
        excludeFiles,
        excludeSymbols,
        cleanupImports: true
      }
    );

    // 3. 生成 Changeset
    const changeset = await remover.generateChangeset(detectionResult.items);

    // 無變更時的處理（changeset.success 但無 textChanges）
    if (changeset.success && changeset.textChanges.length === 0) {
      if (!isJsonFormat) {
        console.log('   符合條件的 dead code 已被過濾（排除規則）');
        if (changeset.warnings && changeset.warnings.length > 0) {
          console.log('\n   警告:');
          for (const warning of changeset.warnings) {
            console.log(`   ${warning}`);
          }
        }
      } else {
        console.log(JSON.stringify({
          success: true,
          message: '符合條件的 dead code 已被過濾',
          warnings: changeset.warnings,
          removals: []
        }));
      }
      return;
    }

    // 4. 執行變更類命令統一流程
    if (!isJsonFormat && !options.dryRun) {
      console.log('   執行刪除...');
    }

    const result = await executeMutationCommand(changeset, {
      fileSystem: context.fileSystem,
      format,
      dryRun: options.dryRun,
      outputHandler,
      commandName: 'deadcode',
      onSuccess: () => {
        if (!isJsonFormat) {
          const totalRemovals = changeset.textChanges
            .flatMap(tc => tc.edits)
            .filter(e => e.description?.startsWith('Remove ')).length;
          const importsCleanedUp = changeset.textChanges
            .flatMap(tc => tc.edits)
            .filter(e => e.description?.includes('import')).length;

          console.log(`\n   已刪除 ${totalRemovals} 個 dead code`);
          if (importsCleanedUp > 0) {
            console.log(`   並清理 ${importsCleanedUp} 個未使用的 import`);
          }
        }
      }
    });

    // dry-run 提示
    if (options.dryRun && result.success && !isJsonFormat) {
      console.log('\n   移除 --dry-run 實際執行刪除');
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    outputHandler.outputError(`Dead code 刪除失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    indexEngine.dispose();
  }
}
