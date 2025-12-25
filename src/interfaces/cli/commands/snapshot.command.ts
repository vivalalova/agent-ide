/**
 * Snapshot 命令
 * 產生模組快照供 AI 理解
 */

import type { Command } from 'commander';
import * as path from 'path';
import { SnapshotGenerator, isProjectSnapshot } from '@core/snapshot/index.js';
import { createUnifiedOutputHandler } from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import { QueryCommand, type SnapshotResult, type ModuleSnapshotData, type ProjectSnapshotData, type IncrementalSnapshotData } from '@infrastructure/formatters/query-types.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Snapshot 命令選項 */
interface SnapshotOptions {
  path: string;
  format: string;
  since?: string;
  refresh?: boolean;
}

/**
 * 設定 snapshot 命令
 */
export function setupSnapshotCommand(program: Command, context: CommandContext): void {
  program
    .command('snapshot')
    .description('產生模組快照供 AI 理解')
    .option('-p, --path <path>', '目標路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary)', 'json')
    .option('--since <version>', '增量快照基準 (last | ISO timestamp)')
    .option('--refresh', '強制刷新快取並生成完整快照')
    .action(async (options: SnapshotOptions) => {
      await handleSnapshotCommand(options, context);
    });
}

/**
 * 處理 snapshot 命令
 */
async function handleSnapshotCommand(options: SnapshotOptions, context: CommandContext): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, false, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format!;

  const targetPath = path.resolve(options.path);

  // 檢查路徑是否存在
  const exists = await context.fileSystem.exists(targetPath);
  if (!exists) {
    outputHandler.outputError(`路徑不存在: ${targetPath}`, format);
    process.exitCode = 1;
    return;
  }

  try {
    const generator = new SnapshotGenerator(context.fileSystem);

    // 處理增量快照
    if (options.since || options.refresh) {
      const since = options.refresh ? 'refresh' : (options.since || 'last');
      const incrementalResult = await generator.generateIncremental(targetPath, since);

      const result: SnapshotResult = {
        command: QueryCommand.Snapshot,
        success: true,
        summary: {
          totalScanned: Object.keys(incrementalResult.delta.added.modules).length +
            incrementalResult.delta.modified.modules.length
        },
        snapshotType: 'incremental',
        snapshot: incrementalResult as IncrementalSnapshotData
      };

      outputHandler.outputQuery(result, format);
      return;
    }

    // 完整快照
    const rawResult = await generator.generate(targetPath);

    // 建構 SnapshotResult
    const isProject = isProjectSnapshot(rawResult);
    const result: SnapshotResult = {
      command: QueryCommand.Snapshot,
      success: true,
      summary: {
        totalScanned: isProject
          ? Object.keys(rawResult.modules).length
          : 1
      },
      snapshotType: isProject ? 'project' : 'module',
      snapshot: rawResult as ModuleSnapshotData | ProjectSnapshotData
    };

    outputHandler.outputQuery(result, format);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤';
    outputHandler.outputError(`產生快照失敗: ${message}`, format);
    process.exitCode = 1;
  }
}
