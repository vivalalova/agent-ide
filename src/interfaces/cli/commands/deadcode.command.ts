/**
 * deadcode 命令
 * 檢測與刪除未使用的程式碼
 */

import type { Command } from 'commander';
import { IndexEngine, createIndexConfig, CLI_INDEX_DEFAULTS } from '@core/shared/indexing/index.js';
import {
  createDeadCodeDetector,
  createDeadCodeRemover,
  type DeadCodeDetectionResult
} from '@core/deadcode/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { ChangeApplicator, convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
import {
  createUnifiedOutputHandler,
  parseOutputFormat,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

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
    .action(async (options: DeadCodeOptions) => {
      await handleDeadCodeCommand(options, context);
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
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 使用者指定的格式
  const formatStr = options.format;
  let format: OutputFormat;

  try {
    format = parseOutputFormat(formatStr, true); // 允許 diff
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary, diff', OutputFormat.Summary);
    process.exitCode = 1;
    throw new Error('不支援的輸出格式');
  }

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
    throw new Error(`路徑不存在: ${projectPath}`);
  }

  // 建立索引引擎
  const indexConfig = createIndexConfig(projectPath, CLI_INDEX_DEFAULTS);
  const indexEngine = new IndexEngine(indexConfig, context.fileSystem);

  const parserRegistry = ParserRegistry.getInstance();

  try {
    // 索引專案
    await indexEngine.indexProject(projectPath);

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

    // 3. 使用新的 Changeset 流程
    const changeset = await remover.generateChangeset(detectionResult.items);

    if (!changeset.success) {
      outputHandler.outputError(changeset.errors?.join(', ') ?? '生成變更失敗', format, 'deadcode');
      process.exitCode = 1;
      return;
    }

    // 無變更時的處理
    if (changeset.textChanges.length === 0) {
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

    // 4. 轉換為 PreviewInput
    const previewInput = await convertChangesetToPreviewInput(changeset, context.fileSystem);

    // 5. Dry-run 模式只輸出預覽
    if (options.dryRun) {
      outputHandler.outputMutation(previewInput, format);
      if (!isJsonFormat) {
        console.log('\n   移除 --dry-run 實際執行刪除');
      }
      return;
    }

    // 6. 應用變更（帶回滾）
    if (!isJsonFormat) {
      console.log('   執行刪除...');
    }

    const applicator = new ChangeApplicator(context.fileSystem);
    const result = await applicator.apply(changeset, {
      atomic: true,
      rollbackOnError: true
    });

    if (result.success) {
      outputHandler.outputMutation(previewInput, format);

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
    } else {
      outputHandler.outputError(result.errors?.join(', ') ?? '執行失敗', format, 'deadcode');
      process.exitCode = 1;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(`Dead code 刪除失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    indexEngine.dispose();
  }
}
