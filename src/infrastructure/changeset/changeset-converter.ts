/**
 * Changeset 轉換器
 * 將 Changeset 轉換為 PreviewInput 格式，用於統一輸出
 */

import { ChangesetCommand, FileOperationType, type Changeset, type FileTextChange, type TextEdit, type FileOperation } from './types.js';
import type {
  PreviewInput,
  FileChangeInput,
  LineChange,
  ConflictInfo
} from '@infrastructure/formatters/types.js';
import { PreviewCommand } from '@infrastructure/formatters/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

/**
 * 建立修改行的 LineChange
 * @param line - 1-based 行號
 * @param oldContent - 原始內容
 * @param newContent - 新內容
 */
function createModifyLineChange(line: number, oldContent: string, newContent: string): LineChange {
  return { line, oldContent, newContent };
}

/**
 * 建立新增行的 LineChange
 * @param line - 1-based 行號
 * @param newContent - 新內容
 */
function createInsertLineChange(line: number, newContent: string): LineChange {
  return { line, oldContent: null, newContent };
}

/**
 * 建立刪除行的 LineChange
 * @param line - 1-based 行號
 * @param oldContent - 原始內容
 */
function createDeleteLineChange(line: number, oldContent: string): LineChange {
  return { line, oldContent, newContent: null };
}

/**
 * 將 Changeset 命令類型映射到 PreviewCommand
 */
function mapCommandType(command: ChangesetCommand): PreviewCommand {
  switch (command) {
    case ChangesetCommand.Rename:
      return PreviewCommand.Rename;
    case ChangesetCommand.Move:
    case ChangesetCommand.MoveMember:
      return PreviewCommand.Move;
    case ChangesetCommand.Deadcode:
      return PreviewCommand.DeadCodeRemoval;
    case ChangesetCommand.ChangeSignature:
      return PreviewCommand.Refactor;
  }
}

/**
 * 讀取檔案原始內容
 * @param filePath - 檔案路徑
 * @param fileSystem - 檔案系統介面
 * @returns 檔案內容，檔案不存在時回傳空字串
 */
async function readOriginalContent(
  filePath: string,
  fileSystem: IFileSystem
): Promise<string> {
  const exists = await fileSystem.exists(filePath);
  if (!exists) {
    return '';
  }
  const content = await fileSystem.readFile(filePath, 'utf-8');
  return typeof content === 'string' ? content : content.toString('utf-8');
}

/**
 * 應用單行的編輯操作，產生新內容
 * @param originalLine - 原始行內容
 * @param edits - 該行的編輯操作（已按列號排序）
 * @returns 編輯後的行內容
 */
function applyEditsToLine(originalLine: string, edits: TextEdit[]): string {
  // 按列號降序排序，從後往前應用避免偏移問題
  const sortedEdits = [...edits].sort((a, b) => b.range.start.column - a.range.start.column);

  let result = originalLine;
  for (const edit of sortedEdits) {
    const startCol = edit.range.start.column - 1; // 轉為 0-based
    const endCol = edit.range.end.column - 1;
    result = result.substring(0, startCol) + edit.newText + result.substring(endCol);
  }

  return result;
}

/**
 * 處理單行編輯
 * 將同一行的多個編輯操作合併後產生 LineChange
 * @param lineNum - 1-based 行號
 * @param lineEdits - 該行的編輯操作列表
 * @param originalLines - 原始檔案各行
 * @returns LineChange 或 null（內容未改變時）
 */
function processSingleLineEdit(
  lineNum: number,
  lineEdits: TextEdit[],
  originalLines: string[]
): LineChange | null {
  // 取得原始行內容（1-based 轉 0-based 索引）
  const originalLine = originalLines[lineNum - 1] ?? '';
  // 應用所有編輯產生新內容
  const newLine = applyEditsToLine(originalLine, lineEdits);

  // 內容未改變時不產生 change
  if (originalLine === newLine) {
    return null;
  }

  return createModifyLineChange(lineNum, originalLine, newLine);
}

/**
 * 處理跨行編輯的起始行
 * 保留 startCol 之前的部分，接上新內容
 * @param lineNum - 1-based 行號
 * @param lineContent - 原始行內容
 * @param startCol - 1-based 起始列號
 * @param newText - 要插入的新文字
 * @returns 起始行的 LineChange 陣列（可能包含新增行）
 */
function processMultiLineEditStart(
  lineNum: number,
  lineContent: string,
  startCol: number,
  newText: string
): LineChange[] {
  const changes: LineChange[] = [];

  // startCol 是 1-based，substring 是 0-based
  // 範例：startCol=3 表示從第 3 列開始刪除，保留 0~2（即前 2 個字元）
  const prefix = lineContent.substring(0, startCol - 1);
  const newContent = prefix + newText;

  // 起始行：原內容被替換為 prefix + newText 的第一行
  const newLines = newContent.split('\n');
  changes.push(createModifyLineChange(lineNum, lineContent, newLines[0] ?? ''));

  // 若 newText 包含換行，後續行為新增行
  for (let i = 1; i < newLines.length; i++) {
    changes.push(createInsertLineChange(lineNum + i, newLines[i]));
  }

  return changes;
}

/**
 * 處理跨行編輯的結束行
 * 保留 endCol 之後的部分，附加到前一個 change
 * @param lineNum - 1-based 行號
 * @param lineContent - 原始行內容
 * @param endCol - 1-based 結束列號（此列開始被刪除）
 * @param changes - 累積的 changes 陣列（會原地修改）
 */
function processMultiLineEditEnd(
  lineNum: number,
  lineContent: string,
  endCol: number,
  changes: LineChange[]
): void {
  // endCol 是 1-based，表示「從第 endCol 列開始被刪除」
  // 範例：endCol=5 表示刪除第 5 列及之後，保留第 5 列之後的內容
  // substring(endCol-1) = substring(4) 取得索引 4 開始的字元
  // 但實際上 endCol 指向「被刪除範圍的結束位置」，該位置的字元應保留
  // 因此 suffix = lineContent.substring(endCol - 1) 是正確的
  const suffix = lineContent.substring(endCol - 1);

  // 將 suffix 附加到「最後一個帶有新內容的 change」（即新內容的最後一行）。
  // 不能直接用 changes[changes.length - 1]：跨行編輯的中間行刪除會被 push 在
  // 起始行的 insert 之後，導致陣列尾端是 newContent=null 的刪除，suffix 會被靜默丟棄，
  // 使預覽的新內容缺漏結尾字元（例如 `);` 掉成 `)`）。
  if (suffix) {
    for (let i = changes.length - 1; i >= 0; i--) {
      if (changes[i].newContent !== null) {
        changes[i].newContent += suffix;
        break;
      }
    }
  }

  // 結束行本身被刪除（原內容消失）
  changes.push(createDeleteLineChange(lineNum, lineContent));
}

/**
 * 處理跨行編輯的中間行
 * 完全刪除該行
 * @param lineNum - 1-based 行號
 * @param lineContent - 原始行內容
 * @returns 刪除行的 LineChange
 */
function processMultiLineEditMiddle(lineNum: number, lineContent: string): LineChange {
  return createDeleteLineChange(lineNum, lineContent);
}

/**
 * 處理跨行編輯
 * 刪除多行並插入新內容
 * @param edit - 跨行編輯操作
 * @param originalLines - 原始檔案各行
 * @param processedLines - 已處理的行號集合（會原地修改）
 * @returns LineChange 陣列
 */
function processMultiLineEdit(
  edit: TextEdit,
  originalLines: string[],
  processedLines: Set<number>
): LineChange[] {
  const changes: LineChange[] = [];
  const { start, end } = edit.range;

  // 跳過起始行已被單行編輯處理的情況
  if (processedLines.has(start.line)) {
    return [];
  }

  // 逐行處理：起始行 → 中間行 → 結束行
  for (let lineNum = start.line; lineNum <= end.line && lineNum <= originalLines.length; lineNum++) {
    const lineContent = originalLines[lineNum - 1] ?? '';

    if (lineNum === start.line) {
      // 起始行：保留 startCol 之前 + 新內容
      const startChanges = processMultiLineEditStart(lineNum, lineContent, start.column, edit.newText);
      changes.push(...startChanges);
    } else if (lineNum === end.line) {
      // 結束行：保留 endCol 之後，附加到前一個 change
      processMultiLineEditEnd(lineNum, lineContent, end.column, changes);
    } else {
      // 中間行：完全刪除
      changes.push(processMultiLineEditMiddle(lineNum, lineContent));
    }

    processedLines.add(lineNum);
  }

  return changes;
}

/**
 * 將 TextEdit 列表轉換為 LineChange 列表
 * @param originalContent - 原始檔案內容
 * @param edits - 文字編輯操作列表
 * @returns LineChange 陣列
 */
function convertEditsToLineChanges(
  originalContent: string,
  edits: readonly TextEdit[]
): LineChange[] {
  if (edits.length === 0) {
    return [];
  }

  const originalLines = originalContent.split('\n');
  const changes: LineChange[] = [];

  // 第一步：分類編輯 — 單行編輯按行號分組，跨行編輯獨立收集
  const singleLineEditsByLine = new Map<number, TextEdit[]>();
  const multiLineEdits: TextEdit[] = [];

  for (const edit of edits) {
    const { line: startLine } = edit.range.start;
    const { line: endLine } = edit.range.end;

    if (startLine === endLine) {
      // 單行編輯：同一行可能有多個編輯，按行號分組
      if (!singleLineEditsByLine.has(startLine)) {
        singleLineEditsByLine.set(startLine, []);
      }
      singleLineEditsByLine.get(startLine)?.push(edit);
    } else {
      // 跨行編輯：需特殊處理起始/中間/結束行
      multiLineEdits.push(edit);
    }
  }

  // 第二步：處理單行編輯 — 同行多編輯合併處理
  for (const [lineNum, lineEdits] of singleLineEditsByLine) {
    const change = processSingleLineEdit(lineNum, lineEdits, originalLines);
    if (change) {
      changes.push(change);
    }
  }

  // 第三步：處理跨行編輯 — 避免與已處理的單行編輯衝突
  const processedLines = new Set<number>(singleLineEditsByLine.keys());

  for (const edit of multiLineEdits) {
    const multiChanges = processMultiLineEdit(edit, originalLines, processedLines);
    changes.push(...multiChanges);
  }

  // 按行號排序確保輸出順序一致
  return changes.sort((a, b) => a.line - b.line);
}

/**
 * 將檔案建立操作轉換為 LineChange（全部新增）
 * @param content - 新檔案內容
 * @returns LineChange 陣列
 */
function convertCreateToLineChanges(content: string): LineChange[] {
  const lines = content.split('\n');
  return lines.map((line, index) => ({
    line: index + 1,
    oldContent: null,
    newContent: line
  }));
}

/**
 * 將檔案刪除操作轉換為 LineChange（全部刪除）
 * @param content - 原始檔案內容
 * @returns LineChange 陣列
 */
function convertDeleteToLineChanges(content: string): LineChange[] {
  const lines = content.split('\n');
  return lines.map((line, index) => ({
    line: index + 1,
    oldContent: line,
    newContent: null
  }));
}

/**
 * 處理單一 FileTextChange 轉換為 FileChangeInput
 */
async function convertFileTextChange(
  change: FileTextChange,
  fileSystem: IFileSystem
): Promise<FileChangeInput> {
  const originalContent = await readOriginalContent(change.filePath, fileSystem);
  const lineChanges = convertEditsToLineChanges(originalContent, change.edits);

  return {
    filePath: change.filePath,
    originalContent,
    changes: lineChanges
  };
}

/**
 * 處理檔案操作轉換為 FileChangeInput
 */
async function convertFileOperation(
  operation: FileOperation,
  fileSystem: IFileSystem
): Promise<FileChangeInput | null> {
  switch (operation.type) {
    case FileOperationType.Create: {
      const content = operation.content ?? '';
      return {
        filePath: operation.targetPath ?? operation.sourcePath,
        originalContent: '',
        changes: convertCreateToLineChanges(content)
      };
    }

    case FileOperationType.Delete: {
      const originalContent = await readOriginalContent(operation.sourcePath, fileSystem);
      return {
        filePath: operation.sourcePath,
        originalContent,
        changes: convertDeleteToLineChanges(originalContent)
      };
    }

    case FileOperationType.Move: {
      // Move 操作由 CLI 層處理，這裡不轉換
      return null;
    }
  }
}

/**
 * 將 Changeset 的 warnings 轉換為 ConflictInfo 格式
 * warnings 格式：type:message（如 "reserved_keyword:'function' 是保留字"）
 *
 * 永遠返回陣列（可能為空），確保 JSON 輸出包含 conflicts 欄位
 *
 * @param warnings - 警告訊息列表
 * @returns ConflictInfo 陣列（永遠不為 undefined）
 */
function convertWarningsToConflicts(warnings: readonly string[] | undefined): ConflictInfo[] {
  if (!warnings || warnings.length === 0) {
    return [];
  }

  return warnings.map(warning => {
    // 解析格式：type:message
    const colonIndex = warning.indexOf(':');
    if (colonIndex > 0) {
      return {
        type: warning.substring(0, colonIndex),
        message: warning.substring(colonIndex + 1),
        filePath: null,
        line: null
      };
    }
    // 無法解析時，使用 unknown 類型
    return {
      type: 'unknown',
      message: warning,
      filePath: null,
      line: null
    };
  });
}

/**
 * 將 Changeset 轉換為 PreviewInput
 * @param changeset - 變更集
 * @param fileSystem - 檔案系統介面
 * @returns PreviewInput 物件
 */
export async function convertChangesetToPreviewInput(
  changeset: Changeset,
  fileSystem: IFileSystem
): Promise<PreviewInput> {
  // 批次處理文字變更
  const textChangePromises = changeset.textChanges.map(tc =>
    convertFileTextChange(tc, fileSystem)
  );

  // 批次處理檔案操作
  const fileOpPromises = changeset.fileOperations.map(op =>
    convertFileOperation(op, fileSystem)
  );

  // 並行執行所有 I/O
  const [textResults, opResults] = await Promise.all([
    Promise.all(textChangePromises),
    Promise.all(fileOpPromises)
  ]);

  const fileChanges: FileChangeInput[] = [];

  for (const converted of textResults) {
    if (converted.changes.length > 0) {
      fileChanges.push(converted);
    }
  }

  for (const converted of opResults) {
    if (converted !== null && converted.changes.length > 0) {
      fileChanges.push(converted);
    }
  }

  // 轉換 warnings 為 conflicts
  const conflicts = convertWarningsToConflicts(changeset.warnings);

  return {
    command: mapCommandType(changeset.command),
    success: changeset.success,
    fileChanges,
    operationDescription: changeset.description,
    conflicts,
    errors: changeset.errors ? [...changeset.errors] : undefined
  };
}
