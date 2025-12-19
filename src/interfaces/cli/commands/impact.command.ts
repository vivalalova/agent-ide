/**
 * Impact 命令
 * 影響分析（從 deps impact 攤平而來）
 */

import * as path from 'path';
import type { Command } from 'commander';
import { ImpactAnalyzer } from '@core/impact/index.js';
import { QueryCommand, type DepsResult } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';

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
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  if (format !== OutputFormat.Json) {
    console.log('💥 影響分析...');
  }

  try {
    const analyzePath = path.resolve(options.path || process.cwd());
    // 將相對路徑轉為絕對路徑
    const targetFile = path.isAbsolute(options.file)
      ? options.file
      : path.join(analyzePath, options.file);

    // 讀取 tsconfig.json 路徑別名
    const pathAliases = await loadPathAliases(analyzePath, context.fileSystem);

    // 初始化影響分析器（傳入路徑別名）
    const impactAnalyzer = new ImpactAnalyzer(context.fileSystem, { pathAliases });

    // 分析專案依賴
    await impactAnalyzer.analyzeProject(analyzePath);

    // 獲取統計資訊
    const stats = impactAnalyzer.getStats();

    // 取得影響分析資訊
    const dependents = impactAnalyzer.getDependents(targetFile);
    const dependencies = impactAnalyzer.getDependencies(targetFile);

    // Impact 命令不輸出循環依賴（改用 cycles 命令獲取）
    const result: DepsResult = {
      command: QueryCommand.Deps,
      success: true,
      cycles: [],
      summary: {
        totalScanned: stats.totalFiles,
        issuesFound: 0,
        totalFiles: stats.totalFiles,
        totalDependencies: stats.totalDependencies,
        cyclesFound: 0
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(`依賴分析失敗: ${errorMessage}`, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 讀取 tsconfig.json 路徑別名
 * @param projectRoot 專案根目錄
 * @param fileSystem 檔案系統
 * @returns 路徑別名映射
 */
async function loadPathAliases(
  projectRoot: string,
  fileSystem: IFileSystem
): Promise<Record<string, string>> {
  const pathAliases: Record<string, string> = {};

  try {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfigContent = await fileSystem.readFile(tsconfigPath, 'utf-8') as string;
    const tsconfig = JSON.parse(tsconfigContent);

    if (tsconfig.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
      const basePath = path.resolve(projectRoot, baseUrl);

      for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
        if (Array.isArray(paths) && paths.length > 0) {
          // 移除 /* 後綴
          const cleanAlias = alias.replace(/\/\*$/, '');
          const cleanPath = (paths[0] as string).replace(/\/\*$/, '');
          // 轉換為絕對路徑
          pathAliases[cleanAlias] = path.resolve(basePath, cleanPath);
        }
      }
    }
  } catch {
    // tsconfig.json 不存在或解析失敗，使用空的路徑別名
  }

  return pathAliases;
}
