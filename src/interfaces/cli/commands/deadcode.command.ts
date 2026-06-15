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
import { PreviewCommand } from '@infrastructure/formatters/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import {
  createEmptyMutationPreviewInput,
  ensureDirectoryPath,
  outputMutationWithLegacyFields,
  tryParseOutputFormat,
  executeMutationCommand
} from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** deadcode 命令選項 */
interface DeadCodeOptions {
  path: string;
  format: string;
  includeExports: boolean;
  includePublicMembers: boolean;
  dryRun?: boolean;
  apply?: boolean;
  exclude: string[];
}

/**
 * 設定 deadcode 命令
 */
export function setupDeadCodeCommand(program: Command, context: CommandContext): void {
  program
    .command('deadcode')
    .description('檢測未使用的程式碼（dead code）；刪除需明確 --apply')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary|diff)', 'summary')
    .option('--include-exports', '包含 export 的符號（預設排除）', false)
    .option('--include-public-members', '包含 public class members（預設排除）', false)
    .option('--dry-run', '預覽變更而不執行（即使同時指定 --apply）')
    .option('--apply', '實際刪除 dead code 並清理 import')
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
  const willApply = options.apply === true && options.dryRun !== true;
  const deadCodeExecutionFields = createDeadCodeExecutionFields(willApply);

  if (!isJsonFormat) {
    console.log(willApply ? '   檢測並刪除 Dead Code...' : '   檢測 Dead Code（預覽模式）...');
  }

  const projectPath = options.path || process.cwd();

  const pathIsDirectory = await ensureDirectoryPath(projectPath, context.fileSystem, outputHandler, format);
  if (!pathIsDirectory) {
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
        outputMutationWithLegacyFields(
          outputHandler,
          createEmptyMutationPreviewInput(PreviewCommand.DeadCodeRemoval, '沒有檢測到 dead code'),
          format,
          {
            message: '沒有檢測到 dead code',
            ...deadCodeExecutionFields,
            removals: []
          }
        );
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
        outputMutationWithLegacyFields(
          outputHandler,
          createEmptyMutationPreviewInput(PreviewCommand.DeadCodeRemoval, '符合條件的 dead code 已被過濾'),
          format,
          {
            message: '符合條件的 dead code 已被過濾',
            ...deadCodeExecutionFields,
            warnings: changeset.warnings,
            removals: []
          }
        );
      }
      return;
    }

    // 4. 執行變更類命令統一流程
    if (!isJsonFormat && willApply) {
      console.log('   執行刪除...');
    }

    const result = await executeMutationCommand(changeset, {
      fileSystem: context.fileSystem,
      format,
      dryRun: !willApply,
      outputHandler,
      commandName: 'deadcode',
      legacyFields: deadCodeExecutionFields,
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

    // preview 提示
    if (!willApply && result.success && !isJsonFormat) {
      console.log('\n   加上 --apply 實際執行刪除');
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const action = willApply ? '刪除' : '檢測';
    outputHandler.outputError(`Dead code ${action}失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    await indexEngine.disposeAsync();
  }
}

function createDeadCodeExecutionFields(willApply: boolean): Record<string, unknown> {
  return {
    mode: willApply ? 'apply' : 'preview',
    previewOnly: !willApply,
    applied: willApply
  };
}
