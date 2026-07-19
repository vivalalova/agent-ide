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
import { applyTextEdits } from './apply-text-edits.js';
import { getErrorMessage } from '@shared/errors/index.js';

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
 *
 * 直接委派 applyTextEdits（ChangeApplicator 實寫的同一份權威套用邏輯：dedupe 重複
 * edit → 重疊檢查 → 由後往前套用），而非自行重排 substring。原本這裡自帶一份「按
 * column 降序後往前套」的簡化實作，遇到同一行有兩筆 range 與 newText 完全相同的
 * edit（例如 CJS 解構 shorthand `{ helper }` 同時命中 binding 的 key 與 value 兩處
 * AST 節點、產生座標相同的重複 edit）時，因為沒有 dedupe，會把新名稱疊加套用兩次
 * 產生 `doubleItIt` 這類損壞文字；但 ChangeApplicator 走 applyTextEdits 有 dedupe，
 * 實際落盤是正確的。改為直接重用同一函式，讓預覽與實寫恆等，消滅雙套用邏輯。
 *
 * 呼叫端保證 edits 皆屬同一行（startLine === endLine === 該行行號），此處把 range
 * 歸一化為虛擬第 1 行、保留原始 column：對單行字串而言 column-1 即是 offset，
 * 與 applyTextEdits 的 calculateOffset 對「第 1 行」的計算結果完全一致。
 *
 * @param originalLine - 原始行內容（或呼叫端傳入的前綴片段）
 * @param edits - 該行（或該片段）的編輯操作
 * @returns 編輯後的內容
 */
function applyEditsToLine(originalLine: string, edits: TextEdit[]): string {
  const normalizedEdits: TextEdit[] = edits.map(edit => ({
    range: {
      start: { line: 1, column: edit.range.start.column },
      end: { line: 1, column: edit.range.end.column }
    },
    newText: edit.newText
  }));

  return applyTextEdits(originalLine, normalizedEdits);
}

/**
 * 合併「offset 相鄰、不重疊」的編輯
 *
 * 兩筆編輯 [a,b) 與 [b,c)（前一筆結束位置 === 後一筆起始位置）在套用結果上完全等同於
 * 單筆 [a,c) 且 newText 為兩者串接——這是 ChangeApplicator 實寫時本就成立的等價關係。
 *
 * 逐筆的 line-based 預覽組裝把每一「行」歸給單一編輯（processedLines 以行號標記），
 * 因此當兩筆跨行編輯共用一條邊界行（前一筆的結束行 === 後一筆的起始行）時，後一筆會被
 * 誤判為「該行已處理」而整筆丟棄，且前一筆會把該行本應被後一筆取代的 suffix 錯誤保留，
 * 導致預覽與實寫分歧。先在此把相鄰編輯融合成單筆連續替換，該邊界行就只屬於一筆編輯，
 * 預覽與實寫回到一致（此即 C6 場景）。
 *
 * 僅融合「嚴格相鄰」的編輯（座標相接）；有間隙或分屬不同區塊的編輯不融合，維持各自獨立呈現，
 * 不影響 change-signature reorder（同位置換行）或 deadcode 多段刪除（段間保留行）的粒度。
 *
 * @param edits 原始編輯列表
 * @returns 融合相鄰編輯後的列表（保序）
 */
function mergeAdjacentEdits(edits: readonly TextEdit[]): TextEdit[] {
  if (edits.length < 2) {
    return [...edits];
  }

  // 依起始座標排序，讓相鄰編輯前後相接
  const sorted = [...edits].sort((a, b) =>
    a.range.start.line !== b.range.start.line
      ? a.range.start.line - b.range.start.line
      : a.range.start.column - b.range.start.column
  );

  const merged: TextEdit[] = [];
  for (const edit of sorted) {
    const prev = merged[merged.length - 1];
    // 前一筆的結束座標 === 這一筆的起始座標 ⇒ 兩者字元範圍相接、可安全融合
    if (
      prev &&
      prev.range.end.line === edit.range.start.line &&
      prev.range.end.column === edit.range.start.column
    ) {
      merged[merged.length - 1] = {
        range: { start: prev.range.start, end: edit.range.end },
        newText: prev.newText + edit.newText
      };
    } else {
      merged.push(edit);
    }
  }

  return merged;
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
 * @param composableSingleEdits - 同起始行、範圍不重疊（可安全合成）的單行編輯；
 *   例如 move-member M4 在行首補的零寬 import 插入。這些編輯的結束列 <= startCol，
 *   代表它們只動到 prefix 之前的字元，與本次跨行編輯消費的範圍互不重疊，
 *   ChangeApplicator 實際寫入時兩者都會套用，預覽須合成後一併呈現，不能只留一筆
 * @returns 起始行的 LineChange 陣列（可能包含新增行）
 */
function processMultiLineEditStart(
  lineNum: number,
  lineContent: string,
  startCol: number,
  newText: string,
  composableSingleEdits?: readonly TextEdit[]
): LineChange[] {
  const changes: LineChange[] = [];

  // startCol 是 1-based，substring 是 0-based
  // 範例：startCol=3 表示從第 3 列開始刪除，保留 0~2（即前 2 個字元）
  let prefix = lineContent.substring(0, startCol - 1);

  // 合成同起始行的可組合單行編輯：它們的範圍全落在 prefix 之內（見上方參數說明），
  // 直接對 prefix 套用即可得到「兩者都寫入後」的正確前綴
  if (composableSingleEdits && composableSingleEdits.length > 0) {
    prefix = applyEditsToLine(prefix, [...composableSingleEdits]);
  }

  const newContent = prefix + newText;

  // 起始行：原內容被替換為 prefix + newText 的第一行
  const newLines = newContent.split('\n');
  const firstLine = newLines[0] ?? '';

  // 沒有插入新行、且該行的新內容為空字串：代表這行完全被吃掉、沒有任何內容留下
  // （例如整行連同換行一起刪除）。此時應表示為純刪除，而非「修改成空字串」——
  // 後者會讓 diff 統計把它同時算成一筆刪除與一筆新增（假新增），造成統計虛增。
  if (newLines.length === 1 && firstLine === '') {
    changes.push(createDeleteLineChange(lineNum, lineContent));
    return changes;
  }

  changes.push(createModifyLineChange(lineNum, lineContent, firstLine));

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
  //
  // 純刪除範圍（newText 為空）時，整個 changes 陣列可能全是 newContent=null 的
  // delete（起始行也整行被吃掉、轉成 createDeleteLineChange，見 processMultiLineEditStart），
  // 此時找不到可附掛對象。suffix 非空代表結尾行實際上有內容會被保留下來，
  // 不能沿用「找不到就丟棄」；改為將結尾行本身轉為 modify（oldContent 為原整行、
  // newContent 為保留的 suffix），避免預覽把實際會保留的片段誤顯示成已刪除。
  let attached = false;
  if (suffix) {
    for (let i = changes.length - 1; i >= 0; i--) {
      if (changes[i].newContent !== null) {
        changes[i].newContent += suffix;
        attached = true;
        break;
      }
    }
  }

  if (suffix && !attached) {
    changes.push(createModifyLineChange(lineNum, lineContent, suffix));
    return;
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
 * @param processedLines - 已處理的行號集合（會原地修改，供其他跨行編輯避免重複處理同一行）
 * @param composableSingleEdits - 呼叫端已判定與本次編輯起始行不衝突、可安全合成的同行單行編輯
 * @returns LineChange 陣列
 */
function processMultiLineEdit(
  edit: TextEdit,
  originalLines: string[],
  processedLines: Set<number>,
  composableSingleEdits?: readonly TextEdit[]
): LineChange[] {
  const changes: LineChange[] = [];
  const { start, end } = edit.range;

  // end.column === 1 是 LSP exclusive end：end 行完全在刪除範圍之外
  // （代表「刪除到 end 行開頭之前」，即整行連同換行一起刪除），
  // 該行本身不屬於此次編輯、不應產生任何 change，需整行保留在 context。
  // 因此遍歷範圍需排除 end.line，實際刪除只涵蓋 start.line 到 end.line - 1。
  const isEndLineExcluded = end.column === 1;
  const lastLineToProcess = isEndLineExcluded ? end.line - 1 : end.line;

  // 逐行處理：起始行 → 中間行 → 結束行
  for (let lineNum = start.line; lineNum <= lastLineToProcess && lineNum <= originalLines.length; lineNum++) {
    const lineContent = originalLines[lineNum - 1] ?? '';

    if (lineNum === start.line) {
      // 起始行：保留 startCol 之前 + 新內容（若有可合成的同行單行編輯一併套用）
      const startChanges = processMultiLineEditStart(
        lineNum, lineContent, start.column, edit.newText, composableSingleEdits
      );
      changes.push(...startChanges);
    } else if (lineNum === end.line) {
      // 結束行：保留 endCol 之後，附加到前一個 change
      // （isEndLineExcluded 時 lastLineToProcess < end.line，此分支不會被執行）
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
 *
 * 先融合 offset 相鄰的編輯（見 mergeAdjacentEdits），確保沒有任兩筆編輯共用同一條邊界行，
 * 逐筆的 line-based 組裝才不會把後一筆整段丟棄（C6）；再依既有的單行 / 跨行分類處理。
 * 逐筆組裝（而非「算出終態再做行級 diff」）是刻意保留的：它以「編輯範圍」為粒度，
 * 能區分 change-signature reorder（同位置換內容 → 兩行都顯示）與 deadcode 多段刪除
 * （段間保留行 → context），這是 edit-agnostic 的行級 diff 無法同時滿足的。
 *
 * @param originalContent - 原始檔案內容
 * @param edits - 文字編輯操作列表
 * @returns LineChange 陣列
 */
function convertEditsToLineChanges(
  originalContent: string,
  rawEdits: readonly TextEdit[]
): LineChange[] {
  if (rawEdits.length === 0) {
    return [];
  }

  const edits = mergeAdjacentEdits(rawEdits);

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

  // 第二步：處理跨行編輯 — 與同起始行的單行編輯有兩種關係：
  // 1. 真衝突（範圍重疊）：單行編輯的結束列 > 跨行編輯的起始列，兩者搶同一段字元
  //    → 維持原行為，捨棄整筆跨行編輯，只留單行編輯自己的呈現
  // 2. 可合成（範圍不重疊，如零寬 import 插入接在整檔替換前）
  //    → ChangeApplicator 實寫時兩者都會套用，預覽需合成後一併顯示，不能只留一筆；
  //      該行的單行編輯改由跨行編輯的起始行處理吸收，稍後跳過其獨立輸出
  // processedLines 只追蹤「已被某個跨行編輯的起始/中間/結束行佔用」，供後續跨行編輯
  // 之間彼此避讓（例如某編輯的中間/結束行剛好是另一編輯的起始行）
  const processedLines = new Set<number>();
  const mergedSingleLineKeys = new Set<number>();

  for (const edit of multiLineEdits) {
    const { start } = edit.range;
    if (processedLines.has(start.line)) {
      continue;
    }

    const sameLineEdits = singleLineEditsByLine.get(start.line);
    let composableSingleEdits: TextEdit[] | undefined;

    if (sameLineEdits) {
      const hasRealConflict = sameLineEdits.some(e => e.range.end.column > start.column);
      if (hasRealConflict) {
        // 真衝突：照舊捨棄此跨行編輯，該行單行編輯維持獨立呈現
        continue;
      }
      composableSingleEdits = sameLineEdits;
      mergedSingleLineKeys.add(start.line);
    }

    const multiChanges = processMultiLineEdit(edit, originalLines, processedLines, composableSingleEdits);
    changes.push(...multiChanges);
  }

  // 第三步：處理單行編輯 — 同行多編輯合併處理；已併入跨行編輯起始行的合成結果者跳過，
  // 避免同一行被重複輸出兩筆 change
  for (const [lineNum, lineEdits] of singleLineEditsByLine) {
    if (mergedSingleLineKeys.has(lineNum)) {
      continue;
    }
    const change = processSingleLineEdit(lineNum, lineEdits, originalLines);
    if (change) {
      changes.push(change);
    }
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
      const filePath = operation.targetPath ?? operation.sourcePath;
      // 目標已存在時讀真實原文，讓 dry-run 能顯示將被覆蓋的內容（非空字串假裝新建）
      const originalContent = await readOriginalContent(filePath, fileSystem);
      return {
        filePath,
        originalContent,
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
  // 先以 apply 同源規則驗證 TextEdit（含跨行 overlap）：
  // applyTextEdits 會 throw，preview 必須同樣 fail，禁止 silent success 產出殘缺 diff
  try {
    for (const textChange of changeset.textChanges) {
      if (textChange.edits.length === 0) {
        continue;
      }
      const originalContent = await readOriginalContent(textChange.filePath, fileSystem);
      applyTextEdits(originalContent, textChange.edits);
    }
  } catch (error) {
    const message = getErrorMessage(error);
    const empty: FileChangeInput[] = [];
    return {
      command: mapCommandType(changeset.command),
      success: false,
      fileChanges: empty,
      files: empty,
      operationDescription: changeset.description,
      conflicts: convertWarningsToConflicts(changeset.warnings),
      errors: [
        ...(changeset.errors ? [...changeset.errors] : []),
        message
      ]
    };
  }

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
    // files 與 fileChanges 同內容：相容以 PreviewResult 形狀讀 .files 的呼叫端
    files: fileChanges,
    operationDescription: changeset.description,
    conflicts,
    errors: changeset.errors ? [...changeset.errors] : undefined
  };
}
