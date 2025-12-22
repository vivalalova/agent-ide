/**
 * Changeset 轉換器
 * 將 Changeset 轉換為 PreviewInput 格式，用於統一輸出
 */

import type { Changeset, FileTextChange, TextEdit, FileOperation } from './types.js';
import type {
  PreviewInput,
  FileChangeInput,
  LineChange,
  ConflictInfo
} from '@infrastructure/formatters/types.js';
import { PreviewCommand } from '@infrastructure/formatters/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

/**
 * 將 Changeset 命令類型映射到 PreviewCommand
 */
function mapCommandType(command: Changeset['command']): PreviewCommand {
  switch (command) {
    case 'rename':
      return PreviewCommand.Rename;
    case 'move':
    case 'move-member':
      return PreviewCommand.Move;
    case 'deadcode':
      return PreviewCommand.DeadCodeRemoval;
    case 'change-signature':
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

  // 1. 分離單行編輯和跨行編輯，並按行號分組單行編輯
  const singleLineEditsByLine = new Map<number, TextEdit[]>();
  const multiLineEdits: TextEdit[] = [];

  for (const edit of edits) {
    const startLine = edit.range.start.line;
    const endLine = edit.range.end.line;

    if (startLine === endLine) {
      // 單行編輯：按行號分組
      if (!singleLineEditsByLine.has(startLine)) {
        singleLineEditsByLine.set(startLine, []);
      }
      singleLineEditsByLine.get(startLine)!.push(edit);
    } else {
      // 跨行編輯：單獨處理
      multiLineEdits.push(edit);
    }
  }

  // 2. 處理單行編輯（一次處理同行所有編輯）
  for (const [lineNum, lineEdits] of singleLineEditsByLine) {
    const originalLine = originalLines[lineNum - 1] ?? '';
    const newLine = applyEditsToLine(originalLine, lineEdits);

    // 只在內容真的改變時記錄
    if (originalLine !== newLine) {
      changes.push({
        line: lineNum,
        oldContent: originalLine,
        newContent: newLine
      });
    }
  }

  // 3. 處理跨行編輯
  const processedLines = new Set<number>(singleLineEditsByLine.keys());

  for (const edit of multiLineEdits) {
    const startLine = edit.range.start.line;
    const endLine = edit.range.end.line;
    const startCol = edit.range.start.column;
    const endCol = edit.range.end.column;

    // 跳過已處理的行（避免與單行編輯衝突）
    if (processedLines.has(startLine)) {
      continue;
    }

    // 跨行編輯：刪除多行並插入新內容
    for (let lineNum = startLine; lineNum <= endLine && lineNum <= originalLines.length; lineNum++) {
      const lineContent = originalLines[lineNum - 1] ?? '';

      if (lineNum === startLine) {
        // 第一行：保留 startCol 之前的部分 + 新內容
        const prefix = lineContent.substring(0, startCol - 1);
        const newContent = prefix + edit.newText;
        changes.push({
          line: lineNum,
          oldContent: lineContent,
          newContent: newContent.split('\n')[0] ?? ''
        });

        // 處理新增的多行
        const newLines = newContent.split('\n');
        for (let i = 1; i < newLines.length; i++) {
          changes.push({
            line: lineNum + i,
            oldContent: null,
            newContent: newLines[i]
          });
        }
      } else if (lineNum === endLine) {
        // 最後一行：保留 endCol 之後的部分
        const suffix = lineContent.substring(endCol - 1);
        if (suffix) {
          // 將 suffix 附加到上一個新增行
          const lastChange = changes[changes.length - 1];
          if (lastChange && lastChange.newContent !== null) {
            lastChange.newContent += suffix;
          }
        }
        changes.push({
          line: lineNum,
          oldContent: lineContent,
          newContent: null
        });
      } else {
        // 中間行：完全刪除
        changes.push({
          line: lineNum,
          oldContent: lineContent,
          newContent: null
        });
      }
      processedLines.add(lineNum);
    }
  }

  // 按行號排序
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
    case 'create': {
      const content = operation.content ?? '';
      return {
        filePath: operation.targetPath ?? operation.sourcePath,
        originalContent: '',
        changes: convertCreateToLineChanges(content)
      };
    }

    case 'delete': {
      const originalContent = await readOriginalContent(operation.sourcePath, fileSystem);
      return {
        filePath: operation.sourcePath,
        originalContent,
        changes: convertDeleteToLineChanges(originalContent)
      };
    }

    case 'move': {
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
  const fileChanges: FileChangeInput[] = [];

  // 轉換文字變更
  for (const textChange of changeset.textChanges) {
    const converted = await convertFileTextChange(textChange, fileSystem);
    // 只加入有實際變更的檔案
    if (converted.changes.length > 0) {
      fileChanges.push(converted);
    }
  }

  // 轉換檔案操作
  for (const operation of changeset.fileOperations) {
    const converted = await convertFileOperation(operation, fileSystem);
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
