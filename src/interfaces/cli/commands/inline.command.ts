/**
 * Inline 命令
 * 內聯函式 (inline-function)
 */

import type { Command } from 'commander';
import * as path from 'path';
import { convertRefactorPreview } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Inline 命令選項 */
interface InlineOptions {
  file?: string;
  path?: string;
  functionName?: string;
  newName?: string;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 inline 命令
 */
export function setupInlineCommand(program: Command, context: CommandContext): void {
  program
    .command('inline-function')
    .description('內聯函式呼叫')
    .option('-f, --file <file>', '檔案路徑')
    .option('--path <path>', '檔案路徑（--file 的別名）')
    .option('-n, --function-name <name>', '函式名稱')
    .option('--new-name <name>', '函式名稱（--function-name 的別名）')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (options: InlineOptions) => {
      await handleInlineCommand(options, context);
    });
}

/**
 * 處理 inline 命令
 */
async function handleInlineCommand(
  options: InlineOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, true);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary, diff', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  // 支援 --path 作為 --file 的別名
  const fileOption = options.file || options.path;

  if (!fileOption) {
    console.error('必須指定 --file 或 --path 參數');
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  // 支援 --new-name 作為 --function-name 的別名
  const functionNameOption = options.functionName || options.newName;

  const isJsonFormat = format === OutputFormat.Json;

  if (!isJsonFormat) {
    console.log('   重構: inline-function');
  }

  try {
    const filePath = path.resolve(fileOption);
    await handleInlineAction(filePath, functionNameOption, options, context, isJsonFormat, format, outputHandler);
  } catch (error) {
    console.error('   重構失敗:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 處理 inline-function 動作
 */
async function handleInlineAction(
  filePath: string,
  functionNameOption: string | undefined,
  options: InlineOptions,
  context: CommandContext,
  isJsonFormat: boolean,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  if (!functionNameOption) {
    console.error('   inline-function 缺少必要參數: --function-name (或 --new-name)');
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  // 檢查檔案是否存在
  const fileExists = await context.fileSystem.exists(filePath);
  if (!fileExists) {
    console.error(`   找不到檔案: ${filePath}`);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  const code = await context.fileSystem.readFile(filePath, 'utf-8') as string;

  // 使用 FunctionInliner
  const { FunctionInliner } = await import('../../../core/transform/structure/inline/inline-function');
  const inliner = new FunctionInliner();

  // 執行內聯
  const inlineConfig = {
    removeFunction: true,
    preserveComments: true,
    validateInlining: true,
    inlineAllCalls: true
  };

  const result = await inliner.inline(code, functionNameOption, inlineConfig);

  if (result.success) {
    // 套用編輯（按位置順序從後往前套用，避免位置偏移）
    let modifiedCode = code;
    const sortedEdits = [...result.edits].sort((a, b) => {
      const aStart = rangeToOffset(code, a.range.start);
      const bStart = rangeToOffset(code, b.range.start);
      return bStart - aStart; // 從後往前
    });

    for (const edit of sortedEdits) {
      modifiedCode = applyEditCorrectly(modifiedCode, edit);
    }

    if (!options.dryRun) {
      // 實際執行模式：輸出結果並寫入檔案
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          functionName: result.functionName,
          inlinedCallsCount: result.inlinedCallsCount,
          removedFunction: result.removedFunction,
          warnings: result.warnings
        }, null, 2));
      } else {
        console.log('   內聯完成');
        console.log(`   函式名稱: ${result.functionName}`);
        console.log(`   已內聯 ${result.inlinedCallsCount} 個呼叫`);
        if (result.removedFunction) {
          console.log('   已移除原函式');
        }
        if (result.warnings.length > 0) {
          console.log('   警告:');
          result.warnings.forEach(w => console.log(`   - ${w}`));
        }
      }

      await context.fileSystem.writeFile(filePath, modifiedCode);
      if (!isJsonFormat) {
        console.log(`   已更新 ${filePath}`);
      }
    } else {
      // Dry-run 模式：使用統一輸出處理器
      const previewInput = convertRefactorPreview(
        result.edits.map(e => ({
          range: e.range,
          newText: e.newText
        })),
        filePath,
        code,
        undefined,
        undefined,
        {
          functionName: functionNameOption,
          action: `Inlined function (${result.inlinedCallsCount} calls, ${result.removedFunction ? 'function removed' : 'function kept'})`
        }
      );

      outputHandler.outputMutation(previewInput, format);
    }
  } else {
    if (isJsonFormat) {
      console.log(JSON.stringify({ success: false, errors: result.errors }, null, 2));
    } else {
      console.error('   內聯失敗:', result.errors.join(', '));
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

// Helper functions

/**
 * 正確套用程式碼編輯
 */
function applyEditCorrectly(
  code: string,
  edit: {
    type: 'replace' | 'insert' | 'delete';
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    newText: string;
  }
): string {
  const lines = code.split('\n');

  switch (edit.type) {
  case 'replace': {
    const startOffset = positionToOffset(lines, edit.range.start);
    const endOffset = positionToOffset(lines, edit.range.end);
    return code.substring(0, startOffset) + edit.newText + code.substring(endOffset);
  }

  case 'insert': {
    const offset = positionToOffset(lines, edit.range.start);
    return code.substring(0, offset) + edit.newText + code.substring(offset);
  }

  case 'delete': {
    const startOffset = positionToOffset(lines, edit.range.start);
    const endOffset = positionToOffset(lines, edit.range.end);
    return code.substring(0, startOffset) + code.substring(endOffset);
  }

  default:
    return code;
  }
}

/**
 * 將行列位置轉換為字元偏移量
 */
function positionToOffset(lines: string[], position: { line: number; column: number }): number {
  let offset = 0;

  for (let i = 0; i < position.line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }

  offset += position.column;
  return Math.min(offset, lines.join('\n').length);
}

/**
 * 將範圍位置轉換為偏移量
 */
function rangeToOffset(code: string, position: { line: number; column: number }): number {
  const lines = code.split('\n');
  return positionToOffset(lines, position);
}
