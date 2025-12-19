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
  const baseSummary = calculateSummary(files);
  const fileSummaries = generateFileSummaries(files, getDefaultChangeType(input.command));

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
 * 展開多行變更為單行變更列表
 * Bug #34 修復：處理 oldContent/newContent 包含多行的情況
 */
function expandMultilineChanges(changes: LineChange[]): LineChange[] {
  const expanded: LineChange[] = [];

  for (const change of changes) {
    // 檢查 oldContent 是否為多行
    if (change.oldContent !== null && change.oldContent.includes('\n')) {
      const oldLines = change.oldContent.split('\n');
      for (let i = 0; i < oldLines.length; i++) {
        expanded.push({
          line: change.line + i,
          oldContent: oldLines[i],
          newContent: null // 刪除操作的每行都是刪除
        });
      }
      // 如果有 newContent，單獨處理（替換操作）
      if (change.newContent !== null) {
        const newLines = change.newContent.split('\n');
        for (let i = 0; i < newLines.length; i++) {
          expanded.push({
            line: change.line + i,
            oldContent: null,
            newContent: newLines[i]
          });
        }
      }
    }
    // 檢查 newContent 是否為多行（純新增操作）
    else if (change.newContent !== null && change.newContent.includes('\n') && change.oldContent === null) {
      const newLines = change.newContent.split('\n');
      for (let i = 0; i < newLines.length; i++) {
        expanded.push({
          line: change.line + i,
          oldContent: null,
          newContent: newLines[i]
        });
      }
    }
    // 單行變更，直接保留
    else {
      expanded.push(change);
    }
  }

  return expanded;
}

/**
 * 從一組變更建立 hunk
 */
function createHunk(originalLines: string[], changes: LineChange[], contextLines: number): DiffHunk {
  // Bug #34 修復：展開多行變更
  const expandedChanges = expandMultilineChanges(changes);

  const firstChange = expandedChanges[0];
  const lastChange = expandedChanges[expandedChanges.length - 1];

  // 計算 hunk 範圍（包含 context）
  // 注意：endLine 不限制在 originalLines.length，因為可能有新增行超出原始範圍
  const startLine = Math.max(1, firstChange.line - contextLines);
  const endLine = lastChange.line + contextLines;
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
    const hasDelete = deleteMap.has(lineNum);
    const hasAdd = addMap.has(lineNum);

    if (hasDelete || hasAdd) {
      // 有變更的行
      // 先輸出刪除
      if (hasDelete) {
        for (const content of deleteMap.get(lineNum)!) {
          lines.push({
            type: ChangeLineType.Delete,
            lineNumber: lineNum,
            content
          });
          oldLineCount++;
        }
      }
      // 再輸出新增
      if (hasAdd) {
        for (const content of addMap.get(lineNum)!) {
          lines.push({
            type: ChangeLineType.Add,
            lineNumber: lineNum,
            content
          });
          newLineCount++;
        }
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

/**
 * 從 FileChange 生成檔案變更摘要列表
 */
function generateFileSummaries(files: FileChange[], defaultChangeType: string): FileChangeSummary[] {
  return files.map(file => {
    let additions = 0;
    let deletions = 0;

    file.hunks.forEach(hunk => {
      hunk.lines.forEach(line => {
        if (line.type === ChangeLineType.Add) {additions++;}
        if (line.type === ChangeLineType.Delete) {deletions++;}
      });
    });

    return {
      filePath: file.filePath,
      changeType: defaultChangeType,
      additions,
      deletions
    };
  });
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
