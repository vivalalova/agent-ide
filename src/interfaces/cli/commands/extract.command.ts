/**
 * Extract 命令
 * 提取函式 (extract-function | extract-closure)
 */

import type { Command } from 'commander';
import * as path from 'path';
import { convertRefactorPreview } from '@infrastructure/formatters/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Extract 命令選項 */
interface ExtractOptions {
  file?: string;
  path?: string;
  startLine?: string;
  endLine?: string;
  functionName?: string;
  newName?: string;
  targetFile?: string;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 extract 命令（包含 extract-function 和 extract-closure）
 */
export function setupExtractCommand(program: Command, context: CommandContext): void {
  // extract-function 命令
  program
    .command('extract-function')
    .description('提取程式碼為函式')
    .option('-f, --file <file>', '檔案路徑')
    .option('--path <path>', '檔案路徑（--file 的別名）')
    .option('-s, --start-line <line>', '起始行號')
    .option('-e, --end-line <line>', '結束行號')
    .option('-n, --function-name <name>', '函式名稱')
    .option('--new-name <name>', '新名稱（--function-name 的別名）')
    .option('-t, --target-file <file>', '目標檔案路徑（跨檔案提取）')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (options: ExtractOptions) => {
      await handleExtractCommand('extract-function', options, context);
    });

  // extract-closure 命令（Swift 專用）
  program
    .command('extract-closure')
    .description('提取程式碼為閉包（Swift）')
    .option('-f, --file <file>', '檔案路徑')
    .option('--path <path>', '檔案路徑（--file 的別名）')
    .option('-s, --start-line <line>', '起始行號')
    .option('-e, --end-line <line>', '結束行號')
    .option('-n, --function-name <name>', '閉包名稱')
    .option('--new-name <name>', '新名稱（--function-name 的別名）')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (options: ExtractOptions) => {
      await handleExtractCommand('extract-closure', options, context);
    });
}

/**
 * 處理 extract 命令
 */
async function handleExtractCommand(
  action: string,
  options: ExtractOptions,
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
    console.log(`   重構: ${action}`);
  }

  try {
    const filePath = path.resolve(fileOption);
    await handleExtractAction(action, filePath, functionNameOption, options, context, isJsonFormat, format, outputHandler);
  } catch (error) {
    console.error('   重構失敗:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 處理 extract-function / extract-closure 動作
 */
async function handleExtractAction(
  action: string,
  filePath: string,
  functionNameOption: string | undefined,
  options: ExtractOptions,
  context: CommandContext,
  isJsonFormat: boolean,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  if (!options.startLine || !options.endLine || !functionNameOption) {
    console.error(`   ${action} 缺少必要參數: --start-line, --end-line 和 --function-name (或 --new-name)`);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  // 驗證行號範圍
  const startLine = parseInt(options.startLine);
  const endLine = parseInt(options.endLine);
  if (startLine > endLine) {
    console.error(`   無效的行號範圍: 起始行號 (${startLine}) 大於結束行號 (${endLine})`);
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

  // 建立範圍
  const range = {
    start: { line: startLine, column: 0 },
    end: { line: endLine, column: 0 }
  };

  // 檢測檔案類型
  const isSwift = filePath.endsWith('.swift');

  if (isSwift) {
    await handleSwiftExtract(action, filePath, code, range, functionNameOption, options, context, isJsonFormat, format, outputHandler);
  } else {
    await handleTsJsExtract(action, filePath, code, range, functionNameOption, options, context, isJsonFormat, format, outputHandler);
  }
}

/**
 * 處理 Swift 提取
 */
async function handleSwiftExtract(
  action: string,
  filePath: string,
  code: string,
  range: { start: { line: number; column: number }; end: { line: number; column: number } },
  functionNameOption: string,
  options: ExtractOptions,
  context: CommandContext,
  isJsonFormat: boolean,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {
  const { SwiftExtractor } = await import('../../../core/transform/structure/extract/swift-extractor');
  const extractor = new SwiftExtractor();

  const extractConfig = {
    functionName: functionNameOption,
    generateComments: true,
    preserveFormatting: true
  };

  const result = action === 'extract-closure'
    ? await extractor.extractClosure(code, range, extractConfig)
    : await extractor.extractFunction(code, range, extractConfig);

  if (result.success) {
    if (isJsonFormat) {
      console.log(JSON.stringify({
        success: true,
        extractedFunction: result.extractedFunction
      }, null, 2));
    } else {
      console.log('   重構完成');
      console.log(`   提取的函式: ${result.extractedFunction.signature}`);
    }

    if (!options.dryRun) {
      await context.fileSystem.writeFile(filePath, result.modifiedCode);
      if (!isJsonFormat) {
        console.log(`   已更新 ${filePath}`);
      }
    } else {
      // Dry-run 模式：使用統一輸出處理器
      const previewInput = convertRefactorPreview(
        [{ range: { start: { line: 1 }, end: { line: code.split('\n').length } }, newText: result.modifiedCode }],
        filePath,
        code,
        undefined,
        undefined,
        { action: 'Swift code refactored' }
      );

      outputHandler.outputMutation(previewInput, format);
    }
  } else {
    if (isJsonFormat) {
      console.error(JSON.stringify({ success: false, errors: result.errors }));
    } else {
      console.error('   重構失敗:', result.errors.join(', '));
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 處理 TypeScript/JavaScript 提取
 */
async function handleTsJsExtract(
  action: string,
  filePath: string,
  code: string,
  range: { start: { line: number; column: number }; end: { line: number; column: number } },
  functionNameOption: string,
  options: ExtractOptions,
  context: CommandContext,
  isJsonFormat: boolean,
  format: OutputFormat,
  outputHandler: ReturnType<typeof createUnifiedOutputHandler>
): Promise<void> {

  void action; // 目前 TS/JS 只支援 extract-function

  const { FunctionExtractor } = await import('../../../core/transform/structure/extract/extract-function');
  const extractor = new FunctionExtractor();

  // 執行提取
  const extractConfig = {
    functionName: functionNameOption,
    generateComments: true,
    preserveFormatting: true,
    validateExtraction: true,
    ...(options.targetFile ? {
      targetFile: path.resolve(options.targetFile),
      sourceFile: filePath
    } : {})
  };

  const result = await extractor.extract(code, range, extractConfig);

  if (result.success) {
    // 套用編輯（按正確順序）
    let modifiedCode = code;

    // 先處理所有 insert 類型（在檔案開頭插入函式定義）
    const insertEdits = result.edits.filter(e => e.type === 'insert');
    const replaceEdits = result.edits.filter(e => e.type === 'replace');

    // 先應用 replace（替換選取範圍為函式呼叫）
    for (const edit of replaceEdits) {
      modifiedCode = applyEditCorrectly(modifiedCode, edit);
    }

    // 再應用 insert（插入函式定義）
    for (const edit of insertEdits) {
      modifiedCode = applyEditCorrectly(modifiedCode, edit);
    }

    // 提取函式簽名（從修改後的程式碼中）
    const functionSignatureMatch = modifiedCode.match(new RegExp(`(async\\s+)?function\\s+${result.functionName}\\s*\\([^)]*\\)`));
    const functionSignature = functionSignatureMatch ? functionSignatureMatch[0] : `function ${result.functionName}`;

    // Dry-run 模式：使用統一輸出處理器，不輸出額外訊息
    if (options.dryRun) {
      const previewInput = convertRefactorPreview(
        result.edits.map(e => ({
          range: e.range,
          newText: e.newText
        })),
        filePath,
        code,
        result.targetFileContent,
        options.targetFile ? path.resolve(options.targetFile) : undefined,
        { functionName: functionNameOption }
      );

      outputHandler.outputMutation(previewInput, format);
      return;
    }

    // 非 dry-run 模式：執行實際變更並輸出結果
    if (!isJsonFormat) {
      console.log('   重構完成');
      console.log(`   提取的函式: ${functionSignature}`);
    }

    // 寫入原始檔案
    await context.fileSystem.writeFile(filePath, modifiedCode);
    if (!isJsonFormat) {
      console.log(`   已更新 ${filePath}`);
    }

    // 如果是跨檔案提取，寫入目標檔案
    if (result.targetFileContent && options.targetFile) {
      const targetPath = path.resolve(options.targetFile);
      // 確保目標目錄存在
      const targetDir = path.dirname(targetPath);
      await context.fileSystem.createDirectory(targetDir, true);
      // 寫入目標檔案
      await context.fileSystem.writeFile(targetPath, result.targetFileContent);
      if (!isJsonFormat) {
        console.log(`   已建立/更新目標檔案 ${targetPath}`);
        if (result.importStatement) {
          console.log(`   已加入 import: ${result.importStatement}`);
        }
      }
    }

    // JSON 格式輸出結果
    if (isJsonFormat) {
      console.log(JSON.stringify({
        success: true,
        functionName: result.functionName,
        signature: functionSignature,
        affectedFiles: options.targetFile ? 2 : 1,
        targetFile: options.targetFile ? path.resolve(options.targetFile) : undefined
      }, null, 2));
    }
  } else {
    if (isJsonFormat) {
      console.log(JSON.stringify({ success: false, errors: result.errors }, null, 2));
    } else {
      console.error('   重構失敗:', result.errors.join(', '));
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
