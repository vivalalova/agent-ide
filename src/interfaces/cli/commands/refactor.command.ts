/**
 * Refactor 命令
 * 重構程式碼 (extract-function | extract-closure | inline-function)
 */

import type { Command } from 'commander';
import * as path from 'path';
import { convertRefactorPreview } from '../../../infrastructure/formatters/index.js';
import { createOutputHandler, type OutputFormatOption } from '../preview-output-handler.js';
import type { CommandContext } from './types.js';

/** Refactor 命令選項 */
interface RefactorOptions {
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
 * 設定 refactor 命令
 */
export function setupRefactorCommand(program: Command, context: CommandContext): void {
  program
    .command('refactor <action>')
    .description('重構程式碼 (extract-function | extract-closure | inline-function)')
    .option('-f, --file <file>', '檔案路徑')
    .option('--path <path>', '檔案路徑（--file 的別名）')
    .option('-s, --start-line <line>', '起始行號')
    .option('-e, --end-line <line>', '結束行號')
    .option('-n, --function-name <name>', '函式名稱')
    .option('--new-name <name>', '新名稱（--function-name 的別名）')
    .option('-t, --target-file <file>', '目標檔案路徑（跨檔案提取）')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (action: string, options: RefactorOptions) => {
      await handleRefactorCommand(action, options, context);
    });
}

/**
 * 處理 refactor 命令
 */
async function handleRefactorCommand(
  action: string,
  options: RefactorOptions,
  context: CommandContext
): Promise<void> {
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

  const isJsonFormat = options.format === 'json';

  if (!isJsonFormat) {
    console.log(`   重構: ${action}`);
  }

  try {
    const filePath = path.resolve(fileOption);

    if (action === 'extract-function' || action === 'extract-closure') {
      await handleExtractAction(action, filePath, functionNameOption, options, context, isJsonFormat);
    } else if (action === 'inline-function') {
      await handleInlineAction(filePath, functionNameOption, options, context, isJsonFormat);
    } else {
      console.error(`   未知的重構操作: ${action}`);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
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
  options: RefactorOptions,
  context: CommandContext,
  isJsonFormat: boolean
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
    await handleSwiftExtract(action, filePath, code, range, functionNameOption, options, context, isJsonFormat);
  } else {
    await handleTsJsExtract(action, filePath, code, range, functionNameOption, options, context, isJsonFormat);
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
  options: RefactorOptions,
  context: CommandContext,
  isJsonFormat: boolean
): Promise<void> {
  const { SwiftExtractor } = await import('../../../core/refactor/swift-extractor.js');
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

      const outputHandler = createOutputHandler();
      outputHandler.output(previewInput, (options.format || 'diff') as OutputFormatOption);
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
  options: RefactorOptions,
  context: CommandContext,
  isJsonFormat: boolean
): Promise<void> {
  const { FunctionExtractor } = await import('../../../core/refactor/extract-function.js');
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

    console.log('   重構完成');
    console.log(`   提取的函式: ${functionSignature}`);
    console.log(functionSignature);

    if (!options.dryRun) {
      // 寫入原始檔案
      await context.fileSystem.writeFile(filePath, modifiedCode);
      console.log(`   已更新 ${filePath}`);

      // 如果是跨檔案提取，寫入目標檔案
      if (result.targetFileContent && options.targetFile) {
        const targetPath = path.resolve(options.targetFile);
        // 確保目標目錄存在
        const targetDir = path.dirname(targetPath);
        await context.fileSystem.createDirectory(targetDir, true);
        // 寫入目標檔案
        await context.fileSystem.writeFile(targetPath, result.targetFileContent);
        console.log(`   已建立/更新目標檔案 ${targetPath}`);
        if (result.importStatement) {
          console.log(`   已加入 import: ${result.importStatement}`);
        }
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
        result.targetFileContent,
        options.targetFile ? path.resolve(options.targetFile) : undefined,
        { functionName: functionNameOption }
      );

      const outputHandler = createOutputHandler();
      outputHandler.output(previewInput, (options.format || 'diff') as OutputFormatOption);
    }
  } else {
    console.error('   重構失敗:', result.errors.join(', '));
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
  options: RefactorOptions,
  context: CommandContext,
  isJsonFormat: boolean
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
  const { FunctionInliner } = await import('../../../core/refactor/inline-function.js');
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

      const outputHandler = createOutputHandler();
      outputHandler.output(previewInput, (options.format || 'diff') as OutputFormatOption);
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
