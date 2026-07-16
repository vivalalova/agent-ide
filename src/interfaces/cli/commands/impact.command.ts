/**
 * Impact 命令
 * 影響分析
 */

import * as path from 'path';
import type { Command } from 'commander';
import { ImpactAnalyzer } from '@core/impact/index.js';
import { QueryCommand, type ImpactResult } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import { ensureDirectoryPath, outputErrorWithDetails, tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { loadTsconfigPathConfigOrWarn } from '@plugins/typescript/tsconfig-loader.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** Impact 命令選項 */
interface ImpactOptions {
  path: string;
  file: string;
  format: string;
}

/**
 * 設定 impact 命令
 */
export function setupImpactCommand(program: Command, context: CommandContext): void {
  program
    .command('impact')
    .description('分析檔案影響範圍')
    .requiredOption('-f, --file <file>', '要分析的檔案')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .action(async (options: ImpactOptions) => {
      await handleImpactCommand(options, context);
    });
}

/**
 * 處理 impact 命令
 */
async function handleImpactCommand(
  options: ImpactOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, false, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  const projectRootInput = options.path || process.cwd();
  const analyzePath = path.resolve(process.cwd(), projectRootInput);
  const targetFile = path.isAbsolute(options.file)
    ? options.file
    : path.join(analyzePath, options.file);
  const pathContext = createImpactPathContext(analyzePath, options.file, targetFile);

  const pathIsDirectory = await ensureDirectoryPath(analyzePath, context.fileSystem, outputHandler, format, {
    role: 'projectRoot',
    inputPath: projectRootInput,
    projectRoot: analyzePath,
    command: 'impact',
    extraContext: pathContext
  });
  if (!pathIsDirectory) {
    return;
  }

  // 檢查目標檔案是否存在（在進度訊息前檢查）
  const fileExists = await context.fileSystem.exists(targetFile);
  if (!fileExists) {
    outputErrorWithDetails(
      outputHandler,
      format,
      `檔案不存在: ${targetFile}`,
      {
        pathContext: {
          role: 'targetFile',
          ...pathContext
        }
      },
      'impact'
    );
    process.exitCode = 1;
    return;
  }

  // 目標存在但為目錄時拒絕（--file 必須是檔案）
  const targetIsDirectory = await context.fileSystem.isDirectory(targetFile);
  if (targetIsDirectory) {
    outputErrorWithDetails(
      outputHandler,
      format,
      `路徑不是檔案: ${targetFile}`,
      {
        pathContext: {
          role: 'targetFile',
          ...pathContext
        }
      },
      'impact'
    );
    process.exitCode = 1;
    return;
  }

  if (format !== OutputFormat.Json) {
    process.stderr.write('💥 影響分析...\n');
  }

  try {
    // 讀取 tsconfig 路徑設定（paths + baseUrl，會向上查找 tsconfig.json）
    const tsconfigPathConfig = await loadTsconfigPathConfigOrWarn(analyzePath, context.fileSystem);

    // 初始化影響分析器（傳入 paths + baseUrl）
    const impactAnalyzer = new ImpactAnalyzer(context.fileSystem, {
      pathAliases: tsconfigPathConfig.pathAliases,
      baseUrl: tsconfigPathConfig.baseUrl
    });

    // 分析專案依賴
    await impactAnalyzer.analyzeProject(analyzePath);

    // 獲取統計資訊
    const stats = impactAnalyzer.getStats();

    // 取得影響分析資訊
    const dependents = impactAnalyzer.getImpactedFiles(targetFile);
    const dependencies = impactAnalyzer.getDependencies(targetFile);

    const result: ImpactResult = {
      command: QueryCommand.Impact,
      success: true,
      summary: {
        totalFiles: stats.totalFiles,
        totalDependencies: stats.totalDependencies,
        totalAffected: dependents.length
      },
      impact: {
        targetFile,
        dependents,
        dependencies,
        totalAffected: dependents.length
      },
      basePath: analyzePath
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    outputHandler.outputError(`依賴分析失敗: ${errorMessage}`, format);
    process.exitCode = 1;
  }
}

function createImpactPathContext(
  projectRoot: string,
  requestedFile: string,
  resolvedFile: string
): Record<string, unknown> {
  return {
    projectRoot,
    requestedFile,
    resolvedFile
  };
}
