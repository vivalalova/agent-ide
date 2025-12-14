/**
 * deadcode 命令
 * 檢測與刪除未使用的程式碼
 */

import type { Command } from 'commander';
import { IndexEngine, createIndexConfig, CLI_INDEX_DEFAULTS } from '@core/indexing/index.js';
import {
  createDeadCodeDetector,
  createDeadCodeRemover,
  type DeadCodeDetectionResult
} from '@core/dead-code/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { convertDeadCodeRemovalPreview } from '@infrastructure/formatters/preview-converter.js';
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
  dryRun: boolean;
  minConfidence: string;
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
    .option('--dry-run', '預覽變更而不執行')
    .option('--min-confidence <number>', '最小信心度門檻 (0-1)', '0.9')
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
  indexEngine: IndexEngine
): Promise<DeadCodeDetectionResult> {
  const parserRegistry = ParserRegistry.getInstance();
  const detector = createDeadCodeDetector(
    indexEngine,
    parserRegistry,
    context.fileSystem,
    {
      includeExports: options.includeExports
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

  // autofix 模式預設使用 diff 格式
  const formatStr = options.format === 'summary' ? 'diff' : options.format;
  let format: OutputFormat;

  try {
    format = parseOutputFormat(formatStr, true); // 允許 diff
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary, diff', OutputFormat.Summary);
    process.exitCode = 1;
    throw new Error('不支援的輸出格式');
  }

  if (format !== OutputFormat.Json) {
    console.log('🔍 檢測並準備刪除 Dead Code...');
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

  try {
    // 索引專案
    await indexEngine.indexProject(projectPath);

    // 1. 先執行 dead code 檢測
    const detectionResult = await runDeadCodeDetection(options, context, indexEngine);

    if (!detectionResult.success) {
      outputHandler.outputError(`檢測失敗: ${detectionResult.error}`, format);
      process.exitCode = 1;
      return;
    }

    if (detectionResult.items.length === 0) {
      if (format !== OutputFormat.Json) {
        console.log('✅ 沒有檢測到 dead code');
      } else {
        console.log(JSON.stringify({ success: true, message: '沒有檢測到 dead code', removals: [] }));
      }
      return;
    }

    // 2. 建立 DeadCodeRemover
    const parserRegistry = ParserRegistry.getInstance();
    const minConfidence = parseFloat(options.minConfidence);

    const remover = createDeadCodeRemover(
      parserRegistry,
      context.fileSystem,
      {
        minConfidence: isNaN(minConfidence) ? 0.9 : minConfidence,
        excludeSymbols: options.exclude || [],
        cleanupImports: true
      }
    );

    // 3. 產生預覽
    const preview = await remover.preview(detectionResult.items);

    if (!preview.success) {
      outputHandler.outputError(`預覽失敗: ${preview.errors?.join(', ')}`, format);
      process.exitCode = 1;
      return;
    }

    if (preview.removals.length === 0) {
      if (format !== OutputFormat.Json) {
        console.log('✅ 符合條件的 dead code 已被過濾（信心度或排除規則）');
        if (preview.warnings && preview.warnings.length > 0) {
          console.log('\n⚠️  警告:');
          for (const warning of preview.warnings) {
            console.log(`   ${warning}`);
          }
        }
      } else {
        console.log(JSON.stringify({
          success: true,
          message: '符合條件的 dead code 已被過濾',
          warnings: preview.warnings,
          removals: []
        }));
      }
      return;
    }

    // 4. 讀取原始檔案內容
    const originalContents = new Map<string, string>();
    for (const filePath of preview.affectedFiles) {
      const content = await context.fileSystem.readFile(filePath, 'utf-8');
      originalContents.set(filePath, typeof content === 'string' ? content : content.toString('utf-8'));
    }

    // 5. 轉換為 PreviewInput
    const previewInput = convertDeadCodeRemovalPreview(preview, originalContents);

    // 6. 輸出或執行
    const isDryRun = options.dryRun === true;

    if (isDryRun) {
      // Dry-run 模式：只輸出預覽
      outputHandler.outputMutation(previewInput, format);

      if (format !== OutputFormat.Json) {
        console.log('\n💡 移除 --dry-run 實際執行刪除');
      }
    } else {
      // 實際執行刪除
      const result = await remover.execute(preview);

      if (result.success) {
        outputHandler.outputMutation(previewInput, format);

        if (format !== OutputFormat.Json) {
          console.log(`\n✅ 已刪除 ${preview.summary.totalRemovals} 個 dead code`);
          if (preview.summary.importsCleanedUp > 0) {
            console.log(`   並清理 ${preview.summary.importsCleanedUp} 個未使用的 import`);
          }
        }
      } else {
        outputHandler.outputError(result.errors?.join(', ') || '刪除失敗', format);
        process.exitCode = 1;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(`Autofix 失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  } finally {
    indexEngine.dispose();
  }
}
