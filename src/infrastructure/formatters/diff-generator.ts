/**
 * Unified Diff 生成器
 * 從變更資料生成標準 unified diff 格式
 */

import {
  ChangeLineType,
  PreviewCommand,
  type ChangeLine,
  type DiffHunk,
  type FileChange,
  type FileChangeInput,
  type FileChangeSummary,
  type LineChange,
  type PreviewInput,
  type PreviewResult,
  type PreviewSummary
} from './types.js';

/**
 * 將 PreviewInput 轉換為 PreviewResult
 * 生成 diff hunks 並計算統計資訊
 */
export function generatePreviewResult(input: PreviewInput, contextLines: number = 3): PreviewResult {
  const files: FileChange[] = input.fileChanges.map(fc => generateFileChange(fc, contextLines));
  // 單次遍歷同時計算總統計和檔案級統計
  const { baseSummary, fileSummaries } = calculateSummaryAndFileSummaries(files, getDefaultChangeType(input.command));

  // 擴展 summary 以包含 rename 專用欄位
  const conflictCount = input.conflicts?.length ?? 0;
  const summary = {
    ...baseSummary,
    totalReferences: baseSummary.totalChanges,
    estimatedTime: baseSummary.totalChanges * 10, // 預估每個操作 10ms
    conflictCount
  };

  return {
    command: input.command,
    success: input.success,
    files,
    summary,
    operations: summary.totalChanges,
    affectedFiles: summary.totalFiles,
    fileSummaries,
    operationDescription: input.operationDescription,
    conflicts: input.conflicts,
    errors: input.errors
  };
}

/**
 * 為單一檔案生成 diff hunks
 */
function generateFileChange(input: FileChangeInput, contextLines: number): FileChange {
  const originalLines = input.originalContent.split('\n');
  const hunks = generateHunks(originalLines, input.changes, contextLines);

  return {
    filePath: input.filePath,
    hunks
  };
}

/**
 * 生成 diff hunks
 * 將相鄰的變更合併為單一 hunk，加入上下文行
 */
function generateHunks(originalLines: string[], changes: LineChange[], contextLines: number): DiffHunk[] {
  if (changes.length === 0) {
    return [];
  }

  // 按行號排序變更
  const sortedChanges = [...changes].sort((a, b) => a.line - b.line);

  // 將相鄰變更分組
  const groups = groupAdjacentChanges(sortedChanges, contextLines);

  return groups.map(group => createHunk(originalLines, group, contextLines));
}

/**
 * 將相鄰的變更分組
 * 如果兩個變更之間的距離 <= 2 * contextLines，則合併為同一組
 */
function groupAdjacentChanges(changes: LineChange[], contextLines: number): LineChange[][] {
  if (changes.length === 0) {
    return [];
  }

  const groups: LineChange[][] = [];
  let currentGroup: LineChange[] = [changes[0]];

  for (let i = 1; i < changes.length; i++) {
    const prev = changes[i - 1];
    const curr = changes[i];
    const gap = curr.line - prev.line;

    // 如果間距小於等於 2 倍 context，合併到同一組
    if (gap <= contextLines * 2 + 1) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }

  groups.push(currentGroup);
  return groups;
}

/**
 * 修剪 old/new 行陣列的共同前綴與後綴，只留中間真正相異的區段。
 *
 * Bug：舊實作依相同 index 配對 old[i]/new[i]（見下方呼叫端修復前版本），
 * 「刪 N 行＋增 M 行」（N≠M）時，行數位移導致內容完全未變的行也被
 * 依 index 錯位配對成「刪除舊值＋新增新值」，全被誤判為變更。
 * 改為先比對內容修剪共同前後綴，只有中段真正相異的內容才輸出 -/+，
 * 未變的前後綴留給 createHunk 既有的 context fallback（讀 originalLines）處理。
 */
function trimCommonEdges(
  oldLines: string[],
  newLines: string[]
): { prefixLength: number; oldMiddle: string[]; newMiddle: string[] } {
  const maxTrim = Math.min(oldLines.length, newLines.length);

  let prefixLength = 0;
  while (prefixLength < maxTrim && oldLines[prefixLength] === newLines[prefixLength]) {
    prefixLength++;
  }

  let suffixLength = 0;
  while (
    suffixLength < maxTrim - prefixLength &&
    oldLines[oldLines.length - 1 - suffixLength] === newLines[newLines.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }

  return {
    prefixLength,
    oldMiddle: oldLines.slice(prefixLength, oldLines.length - suffixLength),
    newMiddle: newLines.slice(prefixLength, newLines.length - suffixLength)
  };
}

/**
 * 展開多行變更為單行變更列表
 * Bug #34 修復：處理 oldContent/newContent 包含多行的情況
 */
function expandMultilineChanges(changes: LineChange[]): LineChange[] {
  return changes.flatMap(change => {
    // oldContent 為多行：拆分為刪除行
    if (change.oldContent !== null && change.oldContent.includes('\n')) {
      const oldLines = change.oldContent.split('\n');
      const newLines = change.newContent !== null ? change.newContent.split('\n') : [];

      // 先修剪共同前後綴，只對中段真正相異內容輸出刪除/新增
      const { prefixLength, oldMiddle, newMiddle } = trimCommonEdges(oldLines, newLines);

      const oldChanges = oldMiddle.map((content, i): LineChange => ({
        line: change.line + prefixLength + i,
        oldContent: content,
        newContent: null
      }));

      const newChanges = newMiddle.map((content, i): LineChange => ({
        line: change.line + prefixLength + i,
        oldContent: null,
        newContent: content
      }));

      return [...oldChanges, ...newChanges];
    }

    // newContent 為多行（純新增操作）
    if (change.newContent !== null
        && change.newContent.includes('\n')
        && change.oldContent === null) {
      return change.newContent
        .split('\n')
        .map((content, i): LineChange => ({
          line: change.line + i,
          oldContent: null,
          newContent: content
        }));
    }

    // 單行變更，直接保留
    return [change];
  });
}

/**
 * 抵銷同一行號上內容相同的 delete/add 配對。
 * 多行編輯的首尾邊界行常被拆成「刪除原內容 + 新增相同內容」，
 * 兩者相消後實際未變更，應視為 context（不計入增刪統計），
 * 避免預覽出現假變更行、以及統計數字灌水。
 */
function cancelIdenticalLineChanges(
  deletedContents: string[],
  addedContents: string[]
): { unchanged: string[]; remainingDeletes: string[]; remainingAdds: string[] } {
  const remainingAdds = [...addedContents];
  const remainingDeletes: string[] = [];
  const unchanged: string[] = [];
  for (const deleted of deletedContents) {
    const matchIndex = remainingAdds.indexOf(deleted);
    if (matchIndex !== -1) {
      remainingAdds.splice(matchIndex, 1);
      unchanged.push(deleted);
    } else {
      remainingDeletes.push(deleted);
    }
  }
  return { unchanged, remainingDeletes, remainingAdds };
}

/**
 * 從一組變更建立 hunk
 */
function createHunk(originalLines: string[], changes: LineChange[], contextLines: number): DiffHunk {
  // Bug #34 修復：展開多行變更
  const expandedChanges = expandMultilineChanges(changes);

  // Bug (G5) 修復：不能只看 expandedChanges 的第一/最後元素算範圍。
  // expandMultilineChanges 展開單一多行變更時排列為 [...oldLines, ...newLines]，
  // 刪多於增時陣列最後一個元素會是某個 newLine，其 .line 遠小於最大的
  // oldLine，導致用「最後元素」算 endLine 會把尾端刪除行漏算。改用所有
  // 元素的最小/最大 .line 計算範圍。
  // 注意：禁用 Math.min(...lineNumbers) / Math.max(...lineNumbers)，
  // spread 大量參數會超過 V8 函式參數上限並拋出 RangeError（R2-8），改單迴圈一次遍歷取兩值
  //
  // trimCommonEdges 修剪共同前後綴後，若整組多行變更 old/new 完全相同（無實際差異），
  // expandedChanges 可能為空陣列；此時退回用原始 changes（該 group 一定非空）算範圍，
  // 避免 expandedChanges[0] 存取空陣列噴錯。
  const lineNumberSource = expandedChanges.length > 0 ? expandedChanges : changes;
  let minLine = lineNumberSource[0].line;
  let maxLine = lineNumberSource[0].line;
  for (const c of lineNumberSource) {
    if (c.line < minLine) { minLine = c.line; }
    if (c.line > maxLine) { maxLine = c.line; }
  }

  // 計算 hunk 範圍（包含 context）
  // 注意：endLine 不限制在 originalLines.length，因為可能有新增行超出原始範圍
  const startLine = Math.max(1, minLine - contextLines);
  const endLine = maxLine + contextLines;
  // 原始檔案的最大可用行號
  const maxOriginalLine = originalLines.length;

  const lines: ChangeLine[] = [];
  let oldLineCount = 0;
  let newLineCount = 0;

  // 建立變更行的 Map 以便快速查找（支援同一行多個變更）
  // 分別追蹤刪除和新增，以正確處理行號
  const deleteMap = new Map<number, string[]>();
  const addMap = new Map<number, string[]>();

  for (const c of expandedChanges) {
    if (c.oldContent !== null) {
      const existing = deleteMap.get(c.line) || [];
      existing.push(c.oldContent);
      deleteMap.set(c.line, existing);
    }
    if (c.newContent !== null) {
      const existing = addMap.get(c.line) || [];
      existing.push(c.newContent);
      addMap.set(c.line, existing);
    }
  }

  // 遍歷範圍內的每一行
  for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
    const deletedContents = deleteMap.get(lineNum) ?? [];
    const addedContents = addMap.get(lineNum) ?? [];

    if (deletedContents.length > 0 || addedContents.length > 0) {
      const { unchanged, remainingDeletes, remainingAdds } = cancelIdenticalLineChanges(deletedContents, addedContents);

      for (const content of remainingDeletes) {
        lines.push({ type: ChangeLineType.Delete, lineNumber: lineNum, content });
        oldLineCount++;
      }
      for (const content of unchanged) {
        lines.push({ type: ChangeLineType.Context, lineNumber: lineNum, content });
        oldLineCount++;
        newLineCount++;
      }
      for (const content of remainingAdds) {
        lines.push({ type: ChangeLineType.Add, lineNumber: lineNum, content });
        newLineCount++;
      }
    } else if (lineNum <= maxOriginalLine) {
      // Context 行（只有在原始檔案範圍內才輸出 context）
      const content = originalLines[lineNum - 1] ?? '';
      lines.push({
        type: ChangeLineType.Context,
        lineNumber: lineNum,
        content
      });
      oldLineCount++;
      newLineCount++;
    }
    // 超出原始範圍且無變更的行跳過
  }

  // 生成 hunk header
  const header = formatHunkHeader(startLine, oldLineCount, startLine, newLineCount);

  return {
    header,
    oldStart: startLine,
    oldCount: oldLineCount,
    newStart: startLine,
    newCount: newLineCount,
    lines
  };
}

/**
 * 格式化 hunk header
 * 格式: @@ -oldStart,oldCount +newStart,newCount @@
 */
function formatHunkHeader(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  const oldPart = oldCount === 1 ? `${oldStart}` : `${oldStart},${oldCount}`;
  const newPart = newCount === 1 ? `${newStart}` : `${newStart},${newCount}`;
  return `@@ -${oldPart} +${newPart} @@`;
}

/**
 * 單次遍歷同時計算總統計和檔案級統計
 */
function calculateSummaryAndFileSummaries(
  files: FileChange[],
  defaultChangeType: string
): { baseSummary: PreviewSummary; fileSummaries: FileChangeSummary[] } {
  let totalChanges = 0;
  let totalAdditions = 0;
  let totalDeletions = 0;
  const fileSummaries: FileChangeSummary[] = [];

  for (const file of files) {
    let fileAdditions = 0;
    let fileDeletions = 0;

    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === ChangeLineType.Add) {
          fileAdditions++;
          totalAdditions++;
          totalChanges++;
        } else if (line.type === ChangeLineType.Delete) {
          fileDeletions++;
          totalDeletions++;
          totalChanges++;
        }
      }
    }

    fileSummaries.push({
      filePath: file.filePath,
      changeType: defaultChangeType,
      additions: fileAdditions,
      deletions: fileDeletions
    });
  }

  return {
    baseSummary: {
      totalFiles: files.length,
      totalChanges,
      additions: totalAdditions,
      deletions: totalDeletions
    },
    fileSummaries
  };
}

/**
 * 根據命令類型取得預設變更描述
 */
function getDefaultChangeType(command: PreviewCommand): string {
  switch (command) {
    case PreviewCommand.Rename:
      return 'symbol renamed';
    case PreviewCommand.Move:
      return 'import updated';
    case PreviewCommand.Shift:
      return 'lines moved';
    case PreviewCommand.Refactor:
      return 'code refactored';
    default:
      return 'modified';
  }
}
