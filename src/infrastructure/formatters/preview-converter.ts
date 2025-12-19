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
  /** 引用所在行的完整程式碼（用於 diff 輸出顯示完整行） */
  readonly context?: string;
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

/** Rename 操作選項 */
export interface RenamePreviewOptions {
  /** 原始符號名稱 */
  oldName?: string;
  /** 新符號名稱 */
  newName?: string;
}

/**
 * 從 Rename 模組的 preview 結果轉換為 PreviewInput
 */
export function convertRenamePreview(
  operations: readonly OperationLike[],
  conflicts: readonly ConflictLike[],
  originalContents: Map<string, string>,
  options?: RenamePreviewOptions
): PreviewInput {
  const baseInput = convertOperationsToPreviewInput(
    PreviewCommand.Rename,
    operations,
    originalContents,
    convertRenameConflicts(conflicts)
  );

  return {
    ...baseInput,
    operationDescription: options?.oldName && options?.newName
      ? `Renamed '${options.oldName}' to '${options.newName}'`
      : undefined
  };
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

  // 從路徑提取檔名
  const sourceFileName = sourceFile.split('/').pop() ?? sourceFile;
  const targetFileName = targetFile.split('/').pop() ?? targetFile;

  return {
    command: PreviewCommand.Move,
    success: true,
    fileChanges,
    operationDescription: `Moved '${sourceFileName}' to '${targetFileName}'`
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

  // 生成操作描述
  const linesCount = toLine - fromLine + 1;
  const operationDescription = isSameFile
    ? `Moved ${linesCount} line${linesCount > 1 ? 's' : ''} within file (${fromLine}-${toLine} → ${position})`
    : `Moved ${linesCount} line${linesCount > 1 ? 's' : ''} to '${targetFile.split('/').pop()}'`;

  return {
    command: PreviewCommand.Shift,
    success: true,
    fileChanges,
    operationDescription
  };
}

/** Refactor 操作選項 */
export interface RefactorPreviewOptions {
  /** 提取的函數名稱 */
  functionName?: string;
  /** 操作類型 */
  action?: string;
}

/**
 * 從 Refactor/Extract 模組的結果轉換為 PreviewInput
 */
export function convertRefactorPreview(
  edits: Array<{ range: { start: { line: number }; end: { line: number } }; newText: string }>,
  filePath: string,
  originalContent: string,
  targetFileContent?: string,
  targetFilePath?: string,
  options?: RefactorPreviewOptions
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

  // 生成操作描述
  let operationDescription: string | undefined;
  if (options?.functionName) {
    operationDescription = `Extracted function '${options.functionName}'`;
  } else if (options?.action) {
    operationDescription = options.action;
  }

  return {
    command: PreviewCommand.Refactor,
    success: true,
    fileChanges,
    operationDescription
  };
}

/**
 * 通用操作轉換函數
 *
 * 當操作包含 context（完整行內容）時，會使用 context 來生成 diff，
 * 這樣 diff 輸出會顯示完整的程式碼行，而非只有被替換的符號名稱。
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

    // ⚠️ 重要：按行號分組，合併同一行的多個操作
    // 場景：同一行有多個相同符號時（如 `const foo = foo + foo;`）
    // rename 會產生多個獨立 operation，若不合併會導致 diff 重複顯示該行
    const lineOpsMap = new Map<number, OperationLike[]>();
    for (const op of ops) {
      const line = op.range.start.line;
      const existing = lineOpsMap.get(line) ?? [];
      existing.push(op);
      lineOpsMap.set(line, existing);
    }

    const changes: LineChange[] = [];
    for (const [line, lineOps] of lineOpsMap) {
      const firstOp = lineOps[0];

      if (firstOp.context) {
        // ⚠️ 重要：使用 replace（不是 replaceAll）依次替換
        // 每個 op 對應一個符號位置，依次 replace 可正確處理：
        // "const foo = foo + foo;" → replace → "const bar = foo + foo;"
        //                         → replace → "const bar = bar + foo;"
        //                         → replace → "const bar = bar + bar;"
        let newContext = firstOp.context;
        for (const op of lineOps) {
          newContext = newContext.replace(op.oldText, op.newText);
        }
        changes.push({
          line,
          oldContent: firstOp.context,
          newContent: newContext
        });
      } else {
        // 無 context：每個操作單獨處理（降級為只顯示符號名稱）
        for (const op of lineOps) {
          changes.push({
            line,
            oldContent: op.oldText,
            newContent: op.newText
          });
        }
      }
    }

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

// ============================================================================
// Dead Code Removal 轉換
// ============================================================================

/**
 * Dead Code 刪除操作介面
 */
interface RemovalOperationLike {
  readonly filePath: string;
  readonly range: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
  readonly originalCode: string;
  readonly symbolName: string;
  readonly symbolType: string;
}

/**
 * Import 清理操作介面
 */
interface ImportCleanupLike {
  readonly filePath: string;
  readonly range: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
  readonly originalImport: string;
  readonly unusedSymbols: readonly string[];
  readonly cleanupType: 'delete' | 'partial';
  readonly newImport?: string;
}

/**
 * Dead Code 刪除預覽介面
 */
interface DeadCodeRemovalPreviewLike {
  readonly success: boolean;
  readonly removals: readonly RemovalOperationLike[];
  readonly importCleanups: readonly ImportCleanupLike[];
  readonly affectedFiles: readonly string[];
  readonly summary: {
    readonly totalRemovals: number;
    readonly byType: Record<string, number>;
    readonly filesAffected: number;
    readonly linesRemoved: number;
    readonly importsCleanedUp: number;
  };
  readonly warnings?: readonly string[];
  readonly errors?: readonly string[];
}

/**
 * 從 DeadCodeRemover 的 preview 結果轉換為 PreviewInput
 */
export function convertDeadCodeRemovalPreview(
  preview: DeadCodeRemovalPreviewLike,
  originalContents: Map<string, string>
): PreviewInput {
  const fileChanges: FileChangeInput[] = [];

  // 按檔案分組所有操作
  const groupedOps = new Map<string, Array<{ line: number; oldContent: string }>>();

  // 處理刪除操作
  for (const removal of preview.removals) {
    const existing = groupedOps.get(removal.filePath) ?? [];
    existing.push({
      line: removal.range.start.line,
      oldContent: removal.originalCode
    });
    groupedOps.set(removal.filePath, existing);
  }

  // 處理 import 清理（包含部分清理）
  const importCleanups = new Map<string, Array<{ line: number; oldContent: string; newContent: string | null }>>();

  for (const cleanup of preview.importCleanups) {
    const existing = importCleanups.get(cleanup.filePath) ?? [];
    existing.push({
      line: cleanup.range.start.line,
      oldContent: cleanup.originalImport,
      newContent: cleanup.cleanupType === 'partial' && cleanup.newImport ? cleanup.newImport : null
    });
    importCleanups.set(cleanup.filePath, existing);
  }

  // 轉換為 FileChangeInput
  // 先處理刪除操作
  for (const [filePath, ops] of groupedOps) {
    const originalContent = originalContents.get(filePath) ?? '';
    const changes: LineChange[] = ops.map(op => ({
      line: op.line,
      oldContent: op.oldContent,
      newContent: null // 刪除操作
    }));

    // 合併同檔案的 import 清理操作
    const importOps = importCleanups.get(filePath);
    if (importOps) {
      for (const importOp of importOps) {
        changes.push({
          line: importOp.line,
          oldContent: importOp.oldContent,
          newContent: importOp.newContent
        });
      }
      importCleanups.delete(filePath);
    }

    fileChanges.push({ filePath, originalContent, changes });
  }

  // 處理只有 import 清理的檔案
  for (const [filePath, ops] of importCleanups) {
    const originalContent = originalContents.get(filePath) ?? '';
    const changes: LineChange[] = ops.map(op => ({
      line: op.line,
      oldContent: op.oldContent,
      newContent: op.newContent
    }));

    fileChanges.push({ filePath, originalContent, changes });
  }

  // 生成操作描述
  const { totalRemovals, importsCleanedUp, byType } = preview.summary;
  let operationDescription = `Removed ${totalRemovals} dead code item${totalRemovals !== 1 ? 's' : ''}`;

  // 加入類型細節
  const typeDetails = Object.entries(byType)
    .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
    .join(', ');
  if (typeDetails) {
    operationDescription += ` (${typeDetails})`;
  }

  // 加入 import 清理資訊
  if (importsCleanedUp > 0) {
    operationDescription += ` and cleaned up ${importsCleanedUp} import${importsCleanedUp !== 1 ? 's' : ''}`;
  }

  return {
    command: PreviewCommand.DeadCodeRemoval,
    success: preview.success,
    fileChanges,
    operationDescription,
    errors: preview.errors ? [...preview.errors] : undefined
  };
}
