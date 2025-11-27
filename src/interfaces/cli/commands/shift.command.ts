/**
 * Shift 命令
 * 移動檔案中的指定行到目標位置
 */

import type { Command } from 'commander';
import * as path from 'path';
import { ShiftService } from '../../../core/shift/index.js';
import { convertShiftPreview } from '../../../infrastructure/formatters/index.js';
import { createOutputHandler, type OutputFormatOption } from '../preview-output-handler.js';
import type { CommandContext } from './types.js';

/** Shift 命令選項 */
interface ShiftOptions {
  from: string;
  to: string;
  position: string;
  target?: string;
  path: string;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 shift 命令
 */
export function setupShiftCommand(program: Command, context: CommandContext): void {
  program
    .command('shift <file>')
    .description('移動檔案中的指定行到目標位置')
    .requiredOption('--from <number>', '起始行號（1-based，包含）')
    .requiredOption('--to <number>', '結束行號（1-based，包含）')
    .requiredOption('--position <number>', '目標位置行號（1-based，插入到此行之前）')
    .option('--target <file>', '目標檔案路徑（選填，預設為來源檔案）')
    .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (file: string, options: ShiftOptions) => {
      await handleShiftCommand(file, options, context);
    });
}

/**
 * 處理 shift 命令
 */
async function handleShiftCommand(
  file: string,
  options: ShiftOptions,
  context: CommandContext
): Promise<void> {
  const isJsonFormat = options.format === 'json';

  try {
    // 解析參數
    const fromLine = parseInt(options.from, 10);
    const toLine = parseInt(options.to, 10);
    const position = parseInt(options.position, 10);

    // 驗證參數
    if (isNaN(fromLine) || isNaN(toLine) || isNaN(position)) {
      outputError('行號和位置必須為有效數字', isJsonFormat);
      return;
    }

    // 解析檔案路徑（支援相對路徑）
    const sourceFile = path.resolve(options.path || process.cwd(), file);
    const targetFile = options.target ? path.resolve(options.path || process.cwd(), options.target) : undefined;

    if (!isJsonFormat) {
      const targetDesc = targetFile ? ` → ${path.basename(targetFile)}` : '（同檔案內）';
      console.log(`✂️  移動行 ${fromLine}-${toLine} 到位置 ${position}${targetDesc}`);
    }

    // 建立服務（每次使用 context 的 fileSystem 確保測試隔離）
    const shiftService = new ShiftService(context.fileSystem);

    // 執行行移動操作
    const shiftOptions = {
      sourceFile,
      fromLine,
      toLine,
      targetFile,
      position,
      preview: options.dryRun,
      projectRoot: options.path || process.cwd()
    };

    const result = await shiftService.shift(shiftOptions);

    if (result.success) {
      if (options.dryRun) {
        await handleDryRunOutput(sourceFile, targetFile, result, fromLine, toLine, position, options, context);
      } else {
        printSuccess(result, isJsonFormat);
      }
    } else {
      outputError(result.error || '未知錯誤', isJsonFormat);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputError(errorMsg, isJsonFormat);
  }
}

/**
 * 處理 dry-run 輸出
 */
async function handleDryRunOutput(
  sourceFile: string,
  targetFile: string | undefined,
  result: any,
  fromLine: number,
  toLine: number,
  position: number,
  options: ShiftOptions,
  context: CommandContext
): Promise<void> {
  // 讀取原始檔案內容
  const sourceOriginalContent = await context.fileSystem.readFile(sourceFile, 'utf-8') as string;
  const targetOriginalContent = targetFile && targetFile !== sourceFile
    ? await context.fileSystem.readFile(targetFile, 'utf-8').catch(() => null) as string | null
    : null;

  // 轉換為統一的 PreviewInput 格式
  const previewInput = convertShiftPreview(
    sourceFile,
    result.targetFile,
    fromLine,
    toLine,
    position,
    sourceOriginalContent,
    targetOriginalContent,
    result.movedLines || []
  );

  // 使用統一輸出處理器
  const outputHandler = createOutputHandler();
  outputHandler.output(previewInput, (options.format || 'diff') as OutputFormatOption);
}

/**
 * 印出成功訊息
 */
function printSuccess(result: any, isJsonFormat: boolean): void {
  if (isJsonFormat) {
    console.log(JSON.stringify({
      success: true,
      operationType: result.operationType,
      sourceFile: result.sourceFile,
      targetFile: result.targetFile,
      fromLine: result.fromLine,
      toLine: result.toLine,
      position: result.position,
      linesCount: result.linesCount,
      executed: result.executed,
      message: result.message
    }, null, 2));
  } else {
    console.log('✅ 行移動成功!');
    console.log(`📊 統計: 移動了 ${result.linesCount} 行`);
    console.log(`📝 來源檔案: ${path.relative(process.cwd(), result.sourceFile)}`);
    console.log(`📝 目標檔案: ${path.relative(process.cwd(), result.targetFile)}`);
  }
}

/**
 * 輸出錯誤
 */
function outputError(message: string, isJsonFormat: boolean): void {
  if (isJsonFormat) {
    console.log(JSON.stringify({ success: false, error: message }, null, 2));
  } else {
    console.error(`❌ ${message}`);
  }
  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}
