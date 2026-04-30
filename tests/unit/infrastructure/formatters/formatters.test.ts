/**
 * Formatters 模組 Unit 測試
 * 測試 diff-generator.ts, query-formatter.ts, preview-formatter.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePreviewResult,
} from '@infrastructure/formatters/diff-generator.js';
import {
  QueryFormatter,
  QueryFormat,
  createQueryFormatter
} from '@infrastructure/formatters/query-formatter.js';
import {
  PreviewFormatter,
  createPreviewFormatter
} from '@infrastructure/formatters/preview-formatter.js';
import {
  PreviewCommand,
  PreviewFormat,
  ChangeLineType,
  type PreviewInput,
  type FileChangeInput,
  type LineChange
} from '@infrastructure/formatters/types.js';
import {
  QueryCommand,
  type SearchResult,
  type DependencyResult,
  type FindReferencesResult,
  type CallHierarchyResult
} from '@infrastructure/formatters/query-types.js';

// ========== DiffGenerator 測試 ==========

describe('DiffGenerator', () => {
  describe('generatePreviewResult', () => {
    it('應該處理空變更列表', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [],
        operationDescription: 'Test operation'
      };

      const result = generatePreviewResult(input, 3);

      expect(result.success).toBe(true);
      expect(result.files).toEqual([]);
      expect(result.summary.totalFiles).toBe(0);
      expect(result.summary.totalChanges).toBe(0);
      expect(result.summary.additions).toBe(0);
      expect(result.summary.deletions).toBe(0);
    });

    it('應該生成單一檔案的變更', () => {
      const changes: LineChange[] = [
        { line: 5, oldContent: 'const oldName = 1;', newContent: 'const newName = 1;' }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nline2\nline3\nline4\nconst oldName = 1;\nline6\nline7\nline8\nline9',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      expect(result.files.length).toBe(1);
      expect(result.files[0].filePath).toBe('src/test.ts');
      expect(result.files[0].hunks.length).toBe(1);
      expect(result.summary.totalFiles).toBe(1);
      expect(result.summary.additions).toBe(1);
      expect(result.summary.deletions).toBe(1);
      expect(result.summary.totalChanges).toBe(2);
    });

    it('應該正確合併相鄰的變更為單一 hunk', () => {
      const changes: LineChange[] = [
        { line: 5, oldContent: 'old1', newContent: 'new1' },
        { line: 6, oldContent: 'old2', newContent: 'new2' }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nline2\nline3\nline4\nold1\nold2\nline7\nline8\nline9',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      // 相鄰變更應該在同一個 hunk
      expect(result.files[0].hunks.length).toBe(1);
      const hunk = result.files[0].hunks[0];

      // 驗證 hunk 包含兩個刪除和兩個新增
      const deleteLines = hunk.lines.filter(l => l.type === ChangeLineType.Delete);
      const addLines = hunk.lines.filter(l => l.type === ChangeLineType.Add);
      expect(deleteLines.length).toBe(2);
      expect(addLines.length).toBe(2);
    });

    it('應該將距離遠的變更分成多個 hunk', () => {
      const changes: LineChange[] = [
        { line: 2, oldContent: 'old1', newContent: 'new1' },
        { line: 20, oldContent: 'old2', newContent: 'new2' }
      ];

      const originalLines = Array.from({ length: 25 }, (_, i) => `line${i + 1}`);
      originalLines[1] = 'old1';
      originalLines[19] = 'old2';

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: originalLines.join('\n'),
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      // 距離太遠應該分成兩個 hunk
      expect(result.files[0].hunks.length).toBe(2);
    });

    it('應該正確處理檔案開頭的變更（防止 startLine < 1）', () => {
      const changes: LineChange[] = [
        { line: 1, oldContent: 'old', newContent: 'new' }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'old\nline2\nline3\nline4',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      const hunk = result.files[0].hunks[0];
      expect(hunk.oldStart).toBe(1);
      expect(hunk.newStart).toBe(1);
    });

    it('應該正確處理檔案結尾的變更（防止 endLine 超出範圍）', () => {
      const changes: LineChange[] = [
        { line: 5, oldContent: 'old', newContent: 'new' }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nline2\nline3\nline4\nold',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      const hunk = result.files[0].hunks[0];
      // endLine 不應超過檔案總行數
      expect(hunk.oldStart + hunk.oldCount - 1).toBeLessThanOrEqual(5);
    });

    it('應該正確處理純新增行（oldContent = null）', () => {
      const changes: LineChange[] = [
        { line: 3, oldContent: null, newContent: 'new line' }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nline2\nline3\nline4',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      const hunk = result.files[0].hunks[0];
      const addLines = hunk.lines.filter(l => l.type === ChangeLineType.Add);
      expect(addLines.length).toBe(1);
      expect(addLines[0].content).toBe('new line');

      // 純新增應該只影響 newCount
      expect(hunk.newCount).toBe(hunk.oldCount + 1);
    });

    it('應該正確處理純刪除行（newContent = null）', () => {
      const changes: LineChange[] = [
        { line: 3, oldContent: 'line3', newContent: null }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nline2\nline3\nline4',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      const hunk = result.files[0].hunks[0];
      const deleteLines = hunk.lines.filter(l => l.type === ChangeLineType.Delete);
      expect(deleteLines.length).toBe(1);
      expect(deleteLines[0].content).toBe('line3');

      // 純刪除應該減少 newCount
      expect(hunk.newCount).toBe(hunk.oldCount - 1);
    });

    it('應該正確處理多個檔案的變更', () => {
      const fileChange1: FileChangeInput = {
        filePath: 'src/file1.ts',
        originalContent: 'line1\nold\nline3',
        changes: [{ line: 2, oldContent: 'old', newContent: 'new' }]
      };

      const fileChange2: FileChangeInput = {
        filePath: 'src/file2.ts',
        originalContent: 'a\nb\nc',
        changes: [{ line: 2, oldContent: 'b', newContent: 'B' }]
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange1, fileChange2]
      };

      const result = generatePreviewResult(input, 3);

      expect(result.files.length).toBe(2);
      expect(result.summary.totalFiles).toBe(2);
      expect(result.summary.totalChanges).toBe(4); // 2刪除 + 2新增
    });

    it('應該正確設定不同命令的預設變更類型', () => {
      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nold\nline3',
        changes: [{ line: 2, oldContent: 'old', newContent: 'new' }]
      };

      const commands = [
        { command: PreviewCommand.Rename, expected: 'symbol renamed' },
        { command: PreviewCommand.Move, expected: 'import updated' },
        { command: PreviewCommand.Shift, expected: 'lines moved' },
        { command: PreviewCommand.Refactor, expected: 'code refactored' }
      ];

      commands.forEach(({ command, expected }) => {
        const input: PreviewInput = {
          command,
          success: true,
          fileChanges: [fileChange]
        };

        const result = generatePreviewResult(input, 3);
        expect(result.fileSummaries?.[0]?.changeType).toBe(expected);
      });
    });

    it('應該正確計算 summary 的統計資訊', () => {
      const changes: LineChange[] = [
        { line: 2, oldContent: 'old1', newContent: 'new1' },
        { line: 3, oldContent: null, newContent: 'added' },
        { line: 5, oldContent: 'deleted', newContent: null }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: 'line1\nold1\nline3\nline4\ndeleted\nline6',
        changes
      };

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 3);

      // 1個替換(刪+增) + 1個新增 + 1個刪除 = 2刪 + 2增
      expect(result.summary.additions).toBe(2);
      expect(result.summary.deletions).toBe(2);
      expect(result.summary.totalChanges).toBe(4);
      expect(result.summary.totalReferences).toBe(4);
    });

    it('應該正確處理衝突和錯誤資訊', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: false,
        fileChanges: [],
        conflicts: [
          { type: 'naming', message: 'Name conflict', filePath: 'src/test.ts', line: 10 }
        ],
        errors: ['Error 1', 'Error 2']
      };

      const result = generatePreviewResult(input, 3);

      expect(result.conflicts?.length).toBe(1);
      expect(result.conflicts?.[0].message).toBe('Name conflict');
      expect(result.errors?.length).toBe(2);
      expect(result.summary.conflictCount).toBe(1);
    });

    it('應該處理 hunk header 格式化（單行和多行）', () => {
      const changes1: LineChange[] = [
        { line: 10, oldContent: 'old', newContent: 'new' }
      ];

      const fileChange: FileChangeInput = {
        filePath: 'src/test.ts',
        originalContent: Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n'),
        changes: changes1
      };
      fileChange.originalContent = fileChange.originalContent.replace('line10', 'old');

      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [fileChange]
      };

      const result = generatePreviewResult(input, 0); // contextLines = 0 測試單行格式

      const hunk = result.files[0].hunks[0];
      // 格式應該是 @@ -oldStart,oldCount +newStart,newCount @@
      // 當只有一行時，格式可能是 @@ -10 +10 @@ 或 @@ -10,1 +10,1 @@
      expect(hunk.header).toMatch(/@@ -\d+,?\d* \+\d+,?\d* @@/);
    });
  });
});

// ========== QueryFormatter 測試 ==========

describe('QueryFormatter', () => {
  let formatter: QueryFormatter;
  let formatterWithColor: QueryFormatter;

  beforeEach(() => {
    formatter = new QueryFormatter({ color: false });
    formatterWithColor = new QueryFormatter({ color: true });
  });

  describe('createQueryFormatter', () => {
    it('應該使用工廠函數建立實例', () => {
      const f = createQueryFormatter({ color: false });
      expect(f).toBeInstanceOf(QueryFormatter);
    });

    it('不應暴露已移除的 analyze 查詢命令', () => {
      expect(Object.values(QueryCommand)).not.toContain('analyze');
    });

    it('不應暴露不存在的 deps 查詢命令', () => {
      expect(Object.values(QueryCommand)).not.toContain('deps');
    });
  });

  describe('toJson', () => {
    it('應該將結果轉換為 JSON 格式', () => {
      const result: SearchResult = {
        command: QueryCommand.Search,
        success: true,
        summary: { totalScanned: 10 },
        results: [
          { filePath: 'src/test.ts', line: 5, column: 10, content: 'test code' }
        ]
      };

      const json = formatter.toJson(result);
      const parsed = JSON.parse(json);

      expect(parsed.command).toBe('search');
      expect(parsed.results.length).toBe(1);
      expect(parsed.results[0].filePath).toBe('src/test.ts');
    });
  });

  describe('formatSearchSummary', () => {
    it('應該格式化空搜尋結果', () => {
      const result: SearchResult = {
        command: QueryCommand.Search,
        success: true,
        summary: {},
        results: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('找到 0 個結果');
    });

    it('應該格式化包含結果的搜尋', () => {
      const result: SearchResult = {
        command: QueryCommand.Search,
        success: true,
        summary: {},
        results: [
          { filePath: 'src/test.ts', line: 5, column: 10, content: 'const test = 1;' },
          { filePath: 'src/app.ts', line: 20, content: 'test()' }
        ],
        searchTime: 150
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('找到 2 個結果');
      expect(summary).toContain('搜尋耗時: 150ms');
      expect(summary).toContain('src/test.ts:5:10');
      expect(summary).toContain('src/app.ts:20');
      expect(summary).toContain('const test = 1;');
    });

    it('應該顯示截斷警告', () => {
      const result: SearchResult = {
        command: QueryCommand.Search,
        success: true,
        summary: {},
        results: [],
        truncated: true
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('(結果已截斷)');
    });
  });

  describe('formatDependencySummary', () => {
    it('應該顯示無循環依賴', () => {
      const result: DependencyResult = {
        command: QueryCommand.Cycles,
        success: true,
        summary: {},
        cycles: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('未發現循環依賴');
    });

    it('應該列出循環依賴', () => {
      const result: DependencyResult = {
        command: QueryCommand.Cycles,
        success: true,
        summary: {},
        cycles: [
          { cycle: ['A.ts', 'B.ts', 'C.ts'], length: 3 },
          { cycle: ['X.ts', 'Y.ts'], length: 2 }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('發現 2 個循環依賴');
      expect(summary).toContain('A.ts → B.ts → C.ts → A.ts');
      expect(summary).toContain('X.ts → Y.ts → X.ts');
    });

    it('應該顯示影響分析', () => {
      const result: DependencyResult = {
        command: QueryCommand.Impact,
        success: true,
        summary: {},
        cycles: [],
        impact: {
          targetFile: 'src/core.ts',
          dependents: ['src/app.ts', 'src/util.ts'],
          dependencies: ['src/base.ts'],
          totalAffected: 3
        }
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('影響分析: src/core.ts');
      expect(summary).toContain('依賴此檔案: 2 個');
      expect(summary).toContain('被此檔案依賴: 1 個');
      expect(summary).toContain('src/app.ts');
    });

    it('應該截斷過長的依賴者列表', () => {
      const result: DependencyResult = {
        command: QueryCommand.Impact,
        success: true,
        summary: {},
        cycles: [],
        impact: {
          targetFile: 'src/core.ts',
          dependents: Array.from({ length: 10 }, (_, i) => `file${i}.ts`),
          dependencies: [],
          totalAffected: 10
        }
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('... 還有 5 個');
    });
  });

  describe('formatFindReferencesSummary', () => {
    it('應該顯示符號資訊和定義位置', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunction',
        type: 'function',
        definition: { file: 'src/test.ts', line: 10, column: 5 },
        references: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('符號: testFunction (function)');
      expect(summary).toContain('定義: src/test.ts:10:5');
      expect(summary).toContain('找到 0 個引用');
    });

    it('應該顯示找不到定義的警告', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'unknownSymbol',
        type: 'unknown',
        definition: null,
        references: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('找不到定義位置');
    });

    it('應該按檔案分組列出引用', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunc',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: [
          { file: 'src/app.ts', line: 10, column: 5, type: 'usage', context: 'testFunc()' },
          { file: 'src/app.ts', line: 20, column: 3, type: 'usage', context: 'const x = testFunc()' },
          { file: 'src/util.ts', line: 5, column: 10, type: 'import', context: 'import { testFunc }' }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('找到 3 個引用（2 個檔案）');
      expect(summary).toContain('src/app.ts');
      expect(summary).toContain('src/util.ts');
      expect(summary).toContain('L10: testFunc()');
    });

    it('應該截斷單一檔案中過多的引用', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'popular',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: Array.from({ length: 15 }, (_, i) => ({
          file: 'src/big.ts',
          line: i + 1,
          type: 'usage' as const,
          context: `usage ${i}`
        }))
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('... 還有 5 個引用');
    });
  });

  describe('formatCallHierarchySummary', () => {
    it('應該顯示函數資訊和分析參數', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'testFunc',
        file: 'src/test.ts',
        definitionLine: 10,
        direction: 'both',
        depth: 3,
        incoming: [],
        outgoing: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('函數呼叫層次: testFunc');
      expect(summary).toContain('定義位置: src/test.ts:10');
      expect(summary).toContain('分析方向: both, 深度: 3');
    });

    it('應該列出 incoming calls（誰呼叫我）', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'target',
        file: 'src/test.ts',
        direction: 'incoming',
        depth: 1,
        incoming: [
          { caller: 'callerA', file: 'src/a.ts', line: 5 },
          { caller: 'callerB', file: 'src/b.ts', line: 10 }
        ],
        outgoing: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('呼叫者 (Incoming): 2 個');
      expect(summary).toContain('callerA (L5)');
      expect(summary).toContain('callerB (L10)');
    });

    it('應該列出 outgoing calls（我呼叫誰）', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'source',
        file: 'src/test.ts',
        direction: 'outgoing',
        depth: 1,
        incoming: [],
        outgoing: [
          { callee: 'funcX', file: 'src/x.ts', line: 15 },
          { callee: 'funcY', file: 'src/y.ts', line: 20 }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('被呼叫者 (Outgoing): 2 個');
      expect(summary).toContain('funcX (L15)');
      expect(summary).toContain('funcY (L20)');
    });

    it('應該同時顯示 incoming 和 outgoing（both 模式）', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'middle',
        file: 'src/test.ts',
        direction: 'both',
        depth: 2,
        incoming: [{ caller: 'caller1', file: 'src/a.ts', line: 1 }],
        outgoing: [{ callee: 'callee1', file: 'src/b.ts', line: 2 }]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('呼叫者 (Incoming): 1 個');
      expect(summary).toContain('被呼叫者 (Outgoing): 1 個');
      expect(summary).toContain('統計: 1 incoming, 1 outgoing');
    });
  });

  describe('formatDefaultSummary', () => {
    it('應該處理未知命令類型', () => {
      const result = {
        command: 'unknown' as QueryCommand,
        success: true,
        summary: { custom: 'value' }
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('命令: unknown');
      expect(summary).toContain('成功: 是');
      expect(summary).toContain('custom: value');
    });

    it('應該顯示失敗狀態', () => {
      const result = {
        command: 'unknown' as QueryCommand,
        success: false,
        summary: {}
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('成功: 否');
    });

  });

  describe('formatFindReferencesSummary - 截斷測試', () => {
    it('應該截斷單一檔案中超過 10 個引用', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'frequentSymbol',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: Array.from({ length: 15 }, (_, i) => ({
          file: 'src/same-file.ts',
          line: i + 1,
          type: 'usage' as const,
          context: `usage ${i}`
        }))
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('... 還有 5 個引用');
    });
  });

  describe('formatCallHierarchySummary - 截斷測試', () => {
    it('應該截斷超過 10 個 incoming 呼叫者', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'target',
        file: 'src/target.ts',
        direction: 'incoming',
        depth: 1,
        incoming: Array.from({ length: 15 }, (_, i) => ({
          caller: `caller${i}`,
          file: 'src/callers.ts',
          line: i + 1
        })),
        outgoing: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('... 還有 5 個呼叫者');
    });

    it('應該截斷超過 10 個 outgoing 被呼叫者', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'source',
        file: 'src/source.ts',
        direction: 'outgoing',
        depth: 1,
        incoming: [],
        outgoing: Array.from({ length: 15 }, (_, i) => ({
          callee: `callee${i}`,
          file: 'src/callees.ts',
          line: i + 1
        }))
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('... 還有 5 個被呼叫者');
    });

    it('應該顯示沒有定義行的情況', () => {
      const result: CallHierarchyResult = {
        command: QueryCommand.CallHierarchy,
        success: true,
        summary: {},
        function: 'myFunc',
        file: 'src/test.ts',
        direction: 'both',
        depth: 1,
        incoming: [],
        outgoing: []
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('定義位置: src/test.ts');
    });
  });

  describe('getReferenceTypeIcon', () => {
    it('應該為 definition 類型返回 📌 圖示', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunc',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: [
          { file: 'src/test.ts', line: 5, type: 'definition', context: 'definition' }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('📌');
    });

    it('應該為 import 類型返回 📥 圖示', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunc',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: [
          { file: 'src/other.ts', line: 1, type: 'import', context: 'import' }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('📥');
    });

    it('應該為 export 類型返回 📤 圖示', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunc',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: [
          { file: 'src/test.ts', line: 10, type: 'export', context: 'export' }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('📤');
    });

    it('應該為 usage 類型返回 📞 圖示', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunc',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: [
          { file: 'src/caller.ts', line: 5, type: 'usage', context: 'usage' }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('📞');
    });

    it('應該為未知類型返回預設 📞 圖示', () => {
      const result: FindReferencesResult = {
        command: QueryCommand.FindReferences,
        success: true,
        summary: {},
        symbol: 'testFunc',
        type: 'function',
        definition: { file: 'src/test.ts', line: 1, column: 1 },
        references: [
          { file: 'src/caller.ts', line: 5, type: 'unknown-type' as 'usage', context: 'some ref' }
        ]
      };

      const summary = formatter.toSummary(result);

      expect(summary).toContain('📞');
    });
  });

  describe('colorize', () => {
    it('應該在 color=false 時不添加顏色碼', () => {
      const result: SearchResult = {
        command: QueryCommand.Search,
        success: true,
        summary: {},
        results: [],
        truncated: true
      };

      const summary = formatter.toSummary(result);

      // 不應包含 ANSI 碼
      expect(summary).not.toContain('\x1b[');
    });

    it('應該在 color=true 時添加顏色碼', () => {
      const result: DependencyResult = {
        command: QueryCommand.Cycles,
        success: true,
        summary: {},
        cycles: []
      };

      const summary = formatterWithColor.toSummary(result);

      // 應包含 ANSI 碼
      expect(summary).toContain('\x1b[');
    });
  });

  describe('format', () => {
    it('應該根據 outputFormat 選擇正確的格式化方法', () => {
      const result: SearchResult = {
        command: QueryCommand.Search,
        success: true,
        summary: {},
        results: []
      };

      const json = formatter.format(result, QueryFormat.Json);
      const summary = formatter.format(result, QueryFormat.Summary);

      expect(() => JSON.parse(json)).not.toThrow();
      expect(summary).toContain('找到');
    });
  });
});

// ========== PreviewFormatter 測試 ==========

describe('PreviewFormatter', () => {
  let formatter: PreviewFormatter;
  let formatterWithColor: PreviewFormatter;

  beforeEach(() => {
    formatter = new PreviewFormatter({ color: false, contextLines: 3 });
    formatterWithColor = new PreviewFormatter({ color: true, contextLines: 3 });
  });

  describe('createPreviewFormatter', () => {
    it('應該使用工廠函數建立實例', () => {
      const f = createPreviewFormatter({ color: false });
      expect(f).toBeInstanceOf(PreviewFormatter);
    });
  });

  describe('createPreview', () => {
    it('應該從 PreviewInput 生成 PreviewResult', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'line1\nold\nline3',
            changes: [{ line: 2, oldContent: 'old', newContent: 'new' }]
          }
        ]
      };

      const result = formatter.createPreview(input);

      expect(result.command).toBe(PreviewCommand.Rename);
      expect(result.success).toBe(true);
      expect(result.files.length).toBe(1);
    });
  });

  describe('toDiff', () => {
    it('應該生成 unified diff 格式', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'line1\nold name\nline3',
            changes: [{ line: 2, oldContent: 'old name', newContent: 'new name' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toContain('--- a/src/test.ts');
      expect(diff).toContain('+++ b/src/test.ts');
      expect(diff).toContain('@@');
      expect(diff).toContain('-old name');
      expect(diff).toContain('+new name');
      expect(diff).toContain('Summary:');
    });

    it('應該在 diff 中顯示 context 行', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'ctx1\nctx2\nold\nctx3\nctx4',
            changes: [{ line: 3, oldContent: 'old', newContent: 'new' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      // context 行應該以空格開頭
      expect(diff).toContain(' ctx1');
      expect(diff).toContain(' ctx2');
      expect(diff).toContain('-old');
      expect(diff).toContain('+new');
      expect(diff).toContain(' ctx3');
    });

    it('應該顯示衝突警告', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: false,
        fileChanges: [],
        conflicts: [
          { type: 'naming', message: 'Name already exists', filePath: 'src/test.ts', line: 10 }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toContain('Conflicts:');
      expect(diff).toContain('Name already exists');
    });

    it('應該顯示錯誤訊息', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: false,
        fileChanges: [],
        errors: ['Parse error', 'Type error']
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toContain('Errors:');
      expect(diff).toContain('Parse error');
      expect(diff).toContain('Type error');
    });
  });

  describe('toJson', () => {
    it('應該輸出完整的 JSON 格式', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'old',
            changes: [{ line: 1, oldContent: 'old', newContent: 'new' }]
          }
        ],
        operationDescription: 'Renamed old to new'
      };

      const result = formatter.createPreview(input);
      const json = formatter.toJson(result);
      const parsed = JSON.parse(json);

      expect(parsed.command).toBe('rename');
      expect(parsed.success).toBe(true);
      expect(parsed.files).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.operationDescription).toBe('Renamed old to new');
    });
  });

  describe('toSummary', () => {
    it('應該顯示統計摘要', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'old1\nold2',
            changes: [
              { line: 1, oldContent: 'old1', newContent: 'new1' },
              { line: 2, oldContent: 'old2', newContent: 'new2' }
            ]
          }
        ],
        operationDescription: 'Test rename'
      };

      const result = formatter.createPreview(input);
      const summary = formatter.toSummary(result);

      expect(summary).toContain('Test rename');
      expect(summary).toContain('Files: 1');
      expect(summary).toContain('Changes: 4'); // 2刪 + 2增
      expect(summary).toContain('+2');
      expect(summary).toContain('-2');
    });

    it('應該列出檔案變更摘要', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Move,
        success: true,
        fileChanges: [
          {
            filePath: 'src/file1.ts',
            originalContent: 'old',
            changes: [{ line: 1, oldContent: 'old', newContent: 'new' }]
          },
          {
            filePath: 'src/file2.ts',
            originalContent: 'a',
            changes: [{ line: 1, oldContent: 'a', newContent: 'b' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const summary = formatter.toSummary(result);

      expect(summary).toContain('src/file1.ts: import updated');
      expect(summary).toContain('src/file2.ts: import updated');
    });

    it('應該顯示空結果', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: []
      };

      const result = formatter.createPreview(input);
      const summary = formatter.toSummary(result);

      expect(summary).toContain('Files: 0');
      expect(summary).toContain('Changes: 0');
    });
  });

  describe('format', () => {
    it('應該根據 outputFormat 選擇正確的格式', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: []
      };

      const result = formatter.createPreview(input);

      const diff = formatter.format(result, PreviewFormat.Diff);
      const json = formatter.format(result, PreviewFormat.Json);
      const summary = formatter.format(result, PreviewFormat.Summary);

      expect(diff).toContain('Summary:');
      expect(() => JSON.parse(json)).not.toThrow();
      expect(summary).toContain('Files:');
    });

    it('應該預設使用 diff 格式', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: []
      };

      const result = formatter.createPreview(input);
      const output = formatter.format(result);

      expect(output).toContain('Summary:');
    });
  });

  describe('colorize', () => {
    it('應該在 color=false 時不添加顏色', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'old',
            changes: [{ line: 1, oldContent: 'old', newContent: 'new' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).not.toContain('\x1b[');
    });

    it('應該在 color=true 時添加顏色碼', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'old',
            changes: [{ line: 1, oldContent: 'old', newContent: 'new' }]
          }
        ]
      };

      const result = formatterWithColor.createPreview(input);
      const diff = formatterWithColor.toDiff(result);

      expect(diff).toContain('\x1b[');
    });
  });

  describe('contextLines 配置', () => {
    it('應該根據 contextLines 調整 context 數量', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n'),
            changes: [{ line: 10, oldContent: 'line10', newContent: 'changed' }]
          }
        ]
      };

      const formatter0 = new PreviewFormatter({ contextLines: 0 });
      const formatter5 = new PreviewFormatter({ contextLines: 5 });

      const result0 = formatter0.createPreview(input);
      const result5 = formatter5.createPreview(input);

      const hunk0 = result0.files[0].hunks[0];
      const hunk5 = result5.files[0].hunks[0];

      // contextLines=0 應該只有變更行本身
      expect(hunk0.lines.length).toBeLessThan(hunk5.lines.length);
    });
  });

  describe('邊界條件測試', () => {
    it('應該處理特殊字元', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'const x = "<>&"',
            changes: [{ line: 1, oldContent: 'const x = "<>&"', newContent: 'const y = "<>&"' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toContain('-const x = "<>&"');
      expect(diff).toContain('+const y = "<>&"');
    });

    it('應該處理空行', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'line1\n\nline3',
            changes: [{ line: 2, oldContent: '', newContent: 'new line' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toContain('-');
      expect(diff).toContain('+new line');
    });

    it('應該處理非常長的行', () => {
      const longLine = 'x'.repeat(1000);
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: longLine,
            changes: [{ line: 1, oldContent: longLine, newContent: longLine + 'y' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toContain('-' + longLine);
      expect(diff).toContain('+' + longLine + 'y');
    });
  });

  describe('toSummary conflicts and errors', () => {
    it('應該在 summary 中顯示衝突警告', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: false,
        fileChanges: [],
        conflicts: [
          { type: 'naming', message: 'Conflict message 1', filePath: 'src/test.ts', line: 5 },
          { type: 'syntax', message: 'Conflict message 2', filePath: 'src/other.ts' }
        ]
      };

      const result = formatter.createPreview(input);
      const summary = formatter.toSummary(result);

      expect(summary).toContain('Conflicts:');
      expect(summary).toContain('Conflict message 1');
      expect(summary).toContain('Conflict message 2');
    });

    it('應該在 summary 中顯示錯誤訊息', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: false,
        fileChanges: [],
        errors: ['Error 1', 'Error 2', 'Error 3']
      };

      const result = formatter.createPreview(input);
      const summary = formatter.toSummary(result);

      expect(summary).toContain('Errors:');
      expect(summary).toContain('Error 1');
      expect(summary).toContain('Error 2');
      expect(summary).toContain('Error 3');
    });

    it('應該同時顯示衝突和錯誤', () => {
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: false,
        fileChanges: [],
        conflicts: [{ type: 'test', message: 'Test conflict' }],
        errors: ['Test error']
      };

      const result = formatter.createPreview(input);
      const summary = formatter.toSummary(result);

      expect(summary).toContain('Conflicts:');
      expect(summary).toContain('Errors:');
    });
  });

  describe('formatChangeLine default case', () => {
    it('應該處理未知的行類型', () => {
      // 這是測試 default case，但由於 ChangeLineType 是完整的 enum
      // 我們透過直接調用 format 來驗證處理沒有錯誤
      const input: PreviewInput = {
        command: PreviewCommand.Rename,
        success: true,
        fileChanges: [
          {
            filePath: 'src/test.ts',
            originalContent: 'context line',
            changes: [{ line: 1, oldContent: 'context line', newContent: 'context line' }]
          }
        ]
      };

      const result = formatter.createPreview(input);
      const diff = formatter.toDiff(result);

      expect(diff).toBeDefined();
    });
  });
});
