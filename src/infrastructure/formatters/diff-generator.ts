/**
 * Unified Diff 生成器
 * 從變更資料生成標準 unified diff 格式
 */

import {
  ChangeLineType,
  type ChangeLine,
  type DiffHunk,
  type FileChange,
  type FileChangeInput,
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
  const summary = calculateSummary(files);

  return {
    command: input.command,
    success: input.success,
    files,
    summary,
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
 * 從一組變更建立 hunk
 */
function createHunk(originalLines: string[], changes: LineChange[], contextLines: number): DiffHunk {
  const firstChange = changes[0];
  const lastChange = changes[changes.length - 1];

  // 計算 hunk 範圍（包含 context）
  const startLine = Math.max(1, firstChange.line - contextLines);
  const endLine = Math.min(originalLines.length, lastChange.line + contextLines);

  const lines: ChangeLine[] = [];
  let oldLineCount = 0;
  let newLineCount = 0;

  // 建立變更行的 Map 以便快速查找
  const changeMap = new Map<number, LineChange>();
  changes.forEach(c => changeMap.set(c.line, c));

  // 遍歷範圍內的每一行
  for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
    const change = changeMap.get(lineNum);

    if (change) {
      // 有變更的行
      if (change.oldContent !== null) {
        // 刪除行
        lines.push({
          type: ChangeLineType.Delete,
          lineNumber: lineNum,
          content: change.oldContent
        });
        oldLineCount++;
      }
      if (change.newContent !== null) {
        // 新增行
        lines.push({
          type: ChangeLineType.Add,
          lineNumber: lineNum,
          content: change.newContent
        });
        newLineCount++;
      }
    } else {
      // Context 行
      const content = originalLines[lineNum - 1] ?? '';
      lines.push({
        type: ChangeLineType.Context,
        lineNumber: lineNum,
        content
      });
      oldLineCount++;
      newLineCount++;
    }
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
 * 計算變更統計摘要
 */
function calculateSummary(files: FileChange[]): PreviewSummary {
  let totalChanges = 0;
  let additions = 0;
  let deletions = 0;

  files.forEach(file => {
    file.hunks.forEach(hunk => {
      hunk.lines.forEach(line => {
        if (line.type === ChangeLineType.Add) {
          additions++;
          totalChanges++;
        } else if (line.type === ChangeLineType.Delete) {
          deletions++;
          totalChanges++;
        }
      });
    });
  });

  return {
    totalFiles: files.length,
    totalChanges,
    additions,
    deletions
  };
}
