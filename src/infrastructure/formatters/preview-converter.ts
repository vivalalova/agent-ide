/**
 * Preview 輸入轉換器
 * 將各 Core 模組的 preview 結果轉換為統一的 PreviewInput 格式
 */

import {
  PreviewCommand,
  type PreviewInput,
  type FileChangeInput,
  type LineChange,
  type ConflictInfo
} from './types.js';

/**
 * 操作介面 - 所有模組的操作都符合此結構
 */
interface OperationLike {
  readonly filePath: string;
  readonly oldText: string;
  readonly newText: string;
  readonly range: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
}

/**
 * 衝突介面 - rename 模組的衝突結構
 */
interface ConflictLike {
  readonly type: string;
  readonly message: string;
  readonly location?: {
    readonly filePath?: string;
    readonly range?: {
      readonly start: { readonly line: number };
    };
  };
}

/**
 * 從 Rename 模組的 preview 結果轉換為 PreviewInput
 */
export function convertRenamePreview(
  operations: readonly OperationLike[],
  conflicts: readonly ConflictLike[],
  originalContents: Map<string, string>
): PreviewInput {
  return convertOperationsToPreviewInput(
    PreviewCommand.Rename,
    operations,
    originalContents,
    convertRenameConflicts(conflicts)
  );
}

/**
 * 從 Move 模組的結果轉換為 PreviewInput
 */
export function convertMovePreview(
  sourceFile: string,
  targetFile: string,
  pathUpdates: Array<{ filePath: string; oldImport: string; newImport: string; line: number }>,
  originalContents: Map<string, string>
): PreviewInput {
  const fileChanges: FileChangeInput[] = [];

  // 處理 import 更新
  const groupedUpdates = new Map<string, Array<{ oldImport: string; newImport: string; line: number }>>();

  for (const update of pathUpdates) {
    const existing = groupedUpdates.get(update.filePath) ?? [];
    existing.push({ oldImport: update.oldImport, newImport: update.newImport, line: update.line });
    groupedUpdates.set(update.filePath, existing);
  }

  for (const [filePath, updates] of groupedUpdates) {
    const originalContent = originalContents.get(filePath) ?? '';
    const changes: LineChange[] = updates.map(u => ({
      line: u.line,
      oldContent: u.oldImport,
      newContent: u.newImport
    }));

    fileChanges.push({ filePath, originalContent, changes });
  }

  return {
    command: PreviewCommand.Move,
    success: true,
    fileChanges
  };
}

/**
 * 從 Shift 模組的結果轉換為 PreviewInput
 */
export function convertShiftPreview(
  sourceFile: string,
  targetFile: string,
  fromLine: number,
  toLine: number,
  position: number,
  sourceOriginalContent: string,
  targetOriginalContent: string | null,
  movedLines: readonly string[]
): PreviewInput {
  const fileChanges: FileChangeInput[] = [];
  const isSameFile = sourceFile === targetFile;

  if (isSameFile) {
    // 同檔案移動
    const changes: LineChange[] = [];

    // 標記刪除的行
    for (let line = fromLine; line <= toLine; line++) {
      const originalLines = sourceOriginalContent.split('\n');
      changes.push({
        line,
        oldContent: originalLines[line - 1] ?? '',
        newContent: null
      });
    }

    // 標記插入的行
    const insertPosition = position > toLine ? position - (toLine - fromLine + 1) : position;
    movedLines.forEach((content, index) => {
      changes.push({
        line: insertPosition + index,
        oldContent: null,
        newContent: content
      });
    });

    fileChanges.push({
      filePath: sourceFile,
      originalContent: sourceOriginalContent,
      changes
    });
  } else {
    // 跨檔案移動
    // Source: 刪除行
    const sourceChanges: LineChange[] = [];
    for (let line = fromLine; line <= toLine; line++) {
      const originalLines = sourceOriginalContent.split('\n');
      sourceChanges.push({
        line,
        oldContent: originalLines[line - 1] ?? '',
        newContent: null
      });
    }
    fileChanges.push({
      filePath: sourceFile,
      originalContent: sourceOriginalContent,
      changes: sourceChanges
    });

    // Target: 插入行
    const targetChanges: LineChange[] = movedLines.map((content, index) => ({
      line: position + index,
      oldContent: null,
      newContent: content
    }));
    fileChanges.push({
      filePath: targetFile,
      originalContent: targetOriginalContent ?? '',
      changes: targetChanges
    });
  }

  return {
    command: PreviewCommand.Shift,
    success: true,
    fileChanges
  };
}

/**
 * 從 Refactor/Extract 模組的結果轉換為 PreviewInput
 */
export function convertRefactorPreview(
  edits: Array<{ range: { start: { line: number }; end: { line: number } }; newText: string }>,
  filePath: string,
  originalContent: string,
  targetFileContent?: string,
  targetFilePath?: string
): PreviewInput {
  const fileChanges: FileChangeInput[] = [];
  const originalLines = originalContent.split('\n');

  // 主檔案變更
  const changes: LineChange[] = edits.map(edit => {
    const startLine = edit.range.start.line;
    const endLine = edit.range.end.line;

    // 組合原始內容
    const oldContent = originalLines.slice(startLine - 1, endLine).join('\n');

    return {
      line: startLine,
      oldContent,
      newContent: edit.newText
    };
  });

  fileChanges.push({ filePath, originalContent, changes });

  // 目標檔案（跨檔案提取）
  if (targetFilePath && targetFileContent) {
    fileChanges.push({
      filePath: targetFilePath,
      originalContent: '', // 新檔案
      changes: [{
        line: 1,
        oldContent: null,
        newContent: targetFileContent
      }]
    });
  }

  return {
    command: PreviewCommand.Refactor,
    success: true,
    fileChanges
  };
}

/**
 * 通用操作轉換函數
 */
function convertOperationsToPreviewInput(
  command: PreviewCommand,
  operations: readonly OperationLike[],
  originalContents: Map<string, string>,
  conflicts?: ConflictInfo[],
  errors?: string[]
): PreviewInput {
  // 按檔案分組操作
  const groupedOps = new Map<string, OperationLike[]>();

  for (const op of operations) {
    const existing = groupedOps.get(op.filePath) ?? [];
    existing.push(op);
    groupedOps.set(op.filePath, existing);
  }

  const fileChanges: FileChangeInput[] = [];

  for (const [filePath, ops] of groupedOps) {
    const originalContent = originalContents.get(filePath) ?? '';

    const changes: LineChange[] = ops.map(op => ({
      line: op.range.start.line,
      oldContent: op.oldText,
      newContent: op.newText
    }));

    fileChanges.push({ filePath, originalContent, changes });
  }

  return {
    command,
    success: true,
    fileChanges,
    conflicts,
    errors
  };
}

/**
 * 轉換 rename 模組的衝突格式
 */
function convertRenameConflicts(conflicts: readonly ConflictLike[]): ConflictInfo[] {
  return conflicts.map(c => ({
    type: c.type,
    message: c.message,
    filePath: c.location?.filePath ?? null,
    line: c.location?.range?.start.line ?? null
  }));
}
