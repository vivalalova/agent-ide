/**
 * undo 命令
 * 還原上一次變更
 */

import type { Command } from 'commander';
import * as path from 'node:path';

import { UndoEngine } from '@core/undo/index.js';
import { HistoryManager } from '@infrastructure/history/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat, executeMutationCommand } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** undo 命令選項 */
interface UndoOptions {
  path: string;
  format: string;
  list: boolean;
  id?: string;
  dryRun: boolean;
}

/**
 * 設定 undo 命令
 */
export function setupUndoCommand(program: Command, context: CommandContext): void {
  program
    .command('undo')
    .description('還原上一次變更（支援多層 undo）')
    .option('-p, --path <path>', '專案路徑', '.')
    .option('--format <format>', '輸出格式 (json|summary|diff)', 'summary')
    .option('--list', '列出可還原的歷史記錄')
    .option('--id <id>', '指定要還原的歷史記錄 ID')
    .option('--dry-run', '預覽還原內容而不執行')
    .action(async (options: UndoOptions) => {
      await handleUndoCommand(options, context);
    });
}

/**
 * 處理 undo 命令
 */
async function handleUndoCommand(
  options: UndoOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, true, outputHandler);
  if (!formatResult.success) { return; }
  const format = formatResult.format;

  const isJsonFormat = format === OutputFormat.Json;
  const projectPath = path.resolve(options.path || process.cwd());

  // 檢查路徑是否存在
  const exists = await context.fileSystem.exists(projectPath);
  if (!exists) {
    outputHandler.outputError(`路徑不存在: ${projectPath}`, format);
    process.exitCode = 1;
    return;
  }

  try {
    // 列出歷史記錄模式
    if (options.list) {
      await handleListHistory(projectPath, format, outputHandler);
      return;
    }

    // 執行還原
    await handleUndo(options, projectPath, format, isJsonFormat, outputHandler, context);
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    outputHandler.outputError(`還原失敗: ${errorMsg}`, format, 'undo');
    process.exitCode = 1;
  }
}

/**
 * 列出歷史記錄
 */
async function handleListHistory(
  projectPath: string,
  format: OutputFormat,
  _outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const historyManager = new HistoryManager({ projectPath });
  const { entries, total } = await historyManager.listHistory();

  if (format === OutputFormat.Json) {
    console.log(JSON.stringify({
      success: true,
      total,
      entries: entries.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        date: new Date(e.timestamp).toISOString(),
        command: e.command,
        description: e.description,
        files: e.backups.length
      }))
    }, null, 2));
  } else {
    if (total === 0) {
      console.log('沒有可還原的變更');
      return;
    }

    console.log(`\n共 ${total} 筆可還原的變更:\n`);
    for (const entry of entries) {
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      console.log(`  ${entry.id.substring(0, 8)}  ${dateStr}  [${entry.command}]  ${entry.description}`);
      console.log(`             影響 ${entry.backups.length} 個檔案`);
    }
    console.log('\n使用 --id <id> 還原特定版本');
  }
}

/**
 * 執行還原
 */
async function handleUndo(
  options: UndoOptions,
  projectPath: string,
  format: OutputFormat,
  isJsonFormat: boolean,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>,
  context: CommandContext
): Promise<void> {
  if (!isJsonFormat && !options.dryRun) {
    console.log('   準備還原...');
  }

  // 1. 使用 UndoEngine 生成反向 Changeset
  const undoEngine = new UndoEngine(context.fileSystem);
  const undoResult = await undoEngine.generateUndoChangeset({
    projectPath,
    entryId: options.id
  });

  if (!undoResult.success) {
    outputHandler.outputError(undoResult.error ?? '生成還原變更失敗', format, 'undo');
    process.exitCode = 1;
    return;
  }

  const { changeset, entry } = undoResult;

  if (!changeset || !entry) {
    outputHandler.outputError('無法生成還原變更', format, 'undo');
    process.exitCode = 1;
    return;
  }

  // 2. 顯示還原目標資訊
  if (!isJsonFormat) {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleString('zh-TW');
    console.log(`   還原目標: [${entry.command}] ${entry.description}`);
    console.log(`   時間: ${dateStr}`);
    console.log(`   影響 ${entry.backups.length} 個檔案`);
    if (!options.dryRun) {
      console.log('   執行還原...');
    }
  }

  // 3. 執行變更類命令統一流程（skipHistory 避免循環）
  const result = await executeMutationCommand(changeset, {
    fileSystem: context.fileSystem,
    format,
    dryRun: options.dryRun ?? false,
    outputHandler,
    commandName: 'undo',
    projectPath,
    skipHistory: true // undo 不產生新的歷史記錄
  });

  // 4. 成功時刪除已還原的歷史記錄
  if (result.success && !options.dryRun) {
    await undoEngine.deleteHistoryEntry(projectPath, entry.id);

    if (!isJsonFormat) {
      console.log('\n   ✓ 已成功還原變更');
    }
  }
}
