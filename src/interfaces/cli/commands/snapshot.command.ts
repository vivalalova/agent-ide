/**
 * Snapshot 命令
 * 產生模組快照供 AI 理解
 */

import type { Command } from 'commander';
import * as path from 'path';
import { SnapshotGenerator, isProjectSnapshot } from '@core/snapshot/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import { QueryCommand, type SnapshotResult, type ModuleSnapshotData, type ProjectSnapshotData } from '@infrastructure/formatters/query-types.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Snapshot 命令選項 */
interface SnapshotOptions {
  path: string;
  format: string;
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
    .action(async (options: SnapshotOptions) => {
      await handleSnapshotCommand(options, context);
    });
}

/**
 * 處理 snapshot 命令
 */
async function handleSnapshotCommand(options: SnapshotOptions, context: CommandContext): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, false);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

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

