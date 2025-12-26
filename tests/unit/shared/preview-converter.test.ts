/**
 * PreviewConverter 測試
 * 測試 Preview 輸入轉換器的所有功能
 */

import { describe, it, expect } from 'vitest';
import {
  convertRenamePreview,
  convertMovePreview,
  convertShiftPreview,
  convertRefactorPreview,
} from '@infrastructure/formatters/preview-converter.js';
import { PreviewCommand } from '@infrastructure/formatters/types.js';

// ============================================================================
// convertRenamePreview Tests
// ============================================================================

describe('convertRenamePreview', () => {
  it('應該轉換空操作列表', () => {
    const result = convertRenamePreview([], [], new Map());

    expect(result.command).toBe(PreviewCommand.Rename);
    expect(result.success).toBe(true);
    expect(result.fileChanges).toEqual([]);
  });

  it('應該轉換單一操作', () => {
    const operations = [
      {
        filePath: '/src/a.ts',
        oldText: 'foo',
        newText: 'bar',
        range: {
          start: { line: 1, column: 5 },
          end: { line: 1, column: 8 },
        },
      },
    ];
    const originalContents = new Map([
      ['/src/a.ts', 'const foo = 1;'],
    ]);

    const result = convertRenamePreview(operations, [], originalContents);

    expect(result.command).toBe(PreviewCommand.Rename);
    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].filePath).toBe('/src/a.ts');
    expect(result.fileChanges[0].changes[0].oldContent).toBe('foo');
    expect(result.fileChanges[0].changes[0].newContent).toBe('bar');
  });

  it('應該轉換多個檔案的操作', () => {
    const operations = [
      {
        filePath: '/src/a.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 5 }, end: { line: 1, column: 8 } },
      },
      {
        filePath: '/src/b.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 2, column: 10 }, end: { line: 2, column: 13 } },
      },
    ];
    const originalContents = new Map([
      ['/src/a.ts', 'const foo = 1;'],
      ['/src/b.ts', 'import { foo } from "./a";'],
    ]);

    const result = convertRenamePreview(operations, [], originalContents);

    expect(result.fileChanges).toHaveLength(2);
  });

  it('應該合併同一檔案的多個操作', () => {
    const operations = [
      {
        filePath: '/src/a.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 5 }, end: { line: 1, column: 8 } },
      },
      {
        filePath: '/src/a.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 3, column: 10 }, end: { line: 3, column: 13 } },
      },
    ];
    const originalContents = new Map([
      ['/src/a.ts', 'const foo = 1;\nconst x = 2;\nreturn foo;'],
    ]);

    const result = convertRenamePreview(operations, [], originalContents);

    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].changes).toHaveLength(2);
  });

  it('應該轉換衝突資訊', () => {
    const conflicts = [
      {
        type: 'naming_conflict',
        message: 'Symbol already exists',
        location: {
          filePath: '/src/a.ts',
          range: { start: { line: 5 } },
        },
      },
    ];

    const result = convertRenamePreview([], conflicts, new Map());

    const actualConflicts = result.conflicts ?? [];
    expect(actualConflicts).toHaveLength(1);
    expect(actualConflicts[0].type).toBe('naming_conflict');
    expect(actualConflicts[0].message).toBe('Symbol already exists');
    expect(actualConflicts[0].filePath).toBe('/src/a.ts');
    expect(actualConflicts[0].line).toBe(5);
  });

  it('應該處理沒有位置資訊的衝突', () => {
    const conflicts = [
      {
        type: 'unknown_error',
        message: 'Something went wrong',
      },
    ];

    const result = convertRenamePreview([], conflicts, new Map());

    const actualConflicts = result.conflicts ?? [];
    expect(actualConflicts).toHaveLength(1);
    expect(actualConflicts[0].filePath).toBeNull();
    expect(actualConflicts[0].line).toBeNull();
  });

  it('應該設定操作描述', () => {
    const result = convertRenamePreview([], [], new Map(), {
      oldName: 'oldFunc',
      newName: 'newFunc',
    });

    expect(result.operationDescription).toBe('Renamed \'oldFunc\' to \'newFunc\'');
  });

  it('應該在缺少選項時不設定操作描述', () => {
    const result = convertRenamePreview([], [], new Map());

    expect(result.operationDescription).toBeUndefined();
  });

  it('應該在只有 oldName 時不設定操作描述', () => {
    const result = convertRenamePreview([], [], new Map(), {
      oldName: 'oldFunc',
    });

    expect(result.operationDescription).toBeUndefined();
  });
});

// ============================================================================
// convertMovePreview Tests
// ============================================================================

describe('convertMovePreview', () => {
  it('應該轉換檔案移動預覽', () => {
    const result = convertMovePreview(
      '/src/old/file.ts',
      '/src/new/file.ts',
      [],
      new Map()
    );

    expect(result.command).toBe(PreviewCommand.Move);
    expect(result.success).toBe(true);
    expect(result.operationDescription).toBe('Moved \'file.ts\' to \'file.ts\'');
  });

  it('應該處理 import 路徑更新', () => {
    const pathUpdates = [
      { filePath: '/src/a.ts', oldImport: './old/file', newImport: './new/file', line: 1 },
      { filePath: '/src/b.ts', oldImport: '../old/file', newImport: '../new/file', line: 2 },
    ];
    const originalContents = new Map([
      ['/src/a.ts', 'import { foo } from "./old/file";'],
      ['/src/b.ts', 'import { bar } from "../old/file";'],
    ]);

    const result = convertMovePreview(
      '/src/old/file.ts',
      '/src/new/file.ts',
      pathUpdates,
      originalContents
    );

    expect(result.fileChanges).toHaveLength(2);
    expect(result.fileChanges[0].changes[0].oldContent).toBe('./old/file');
    expect(result.fileChanges[0].changes[0].newContent).toBe('./new/file');
  });

  it('應該合併同一檔案的多個 import 更新', () => {
    const pathUpdates = [
      { filePath: '/src/a.ts', oldImport: './old/file', newImport: './new/file', line: 1 },
      { filePath: '/src/a.ts', oldImport: './old/other', newImport: './new/other', line: 2 },
    ];
    const originalContents = new Map([
      ['/src/a.ts', 'import { foo } from "./old/file";\nimport { bar } from "./old/other";'],
    ]);

    const result = convertMovePreview(
      '/src/old/file.ts',
      '/src/new/file.ts',
      pathUpdates,
      originalContents
    );

    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].changes).toHaveLength(2);
  });

  it('應該處理沒有路徑分隔符的檔案名', () => {
    const result = convertMovePreview(
      'source.ts',
      'target.ts',
      [],
      new Map()
    );

    expect(result.operationDescription).toBe('Moved \'source.ts\' to \'target.ts\'');
  });

  it('應該處理空的 originalContents', () => {
    const pathUpdates = [
      { filePath: '/src/a.ts', oldImport: './old', newImport: './new', line: 1 },
    ];

    const result = convertMovePreview(
      '/src/old/file.ts',
      '/src/new/file.ts',
      pathUpdates,
      new Map()
    );

    expect(result.fileChanges[0].originalContent).toBe('');
  });
});

// ============================================================================
// convertShiftPreview Tests
// ============================================================================

describe('convertShiftPreview', () => {
  describe('同檔案移動', () => {
    it('應該處理同檔案內的行移動', () => {
      const sourceContent = 'line1\nline2\nline3\nline4\nline5';
      const movedLines = ['line2', 'line3'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/a.ts',
        2,
        3,
        5,
        sourceContent,
        null,
        movedLines
      );

      expect(result.command).toBe(PreviewCommand.Shift);
      expect(result.success).toBe(true);
      expect(result.fileChanges).toHaveLength(1);
      expect(result.operationDescription).toContain('within file');
    });

    it('應該標記刪除的行', () => {
      const sourceContent = 'line1\nline2\nline3';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/a.ts',
        2,
        2,
        3,
        sourceContent,
        null,
        movedLines
      );

      const deleteChanges = result.fileChanges[0].changes.filter(
        c => c.newContent === null
      );
      expect(deleteChanges).toHaveLength(1);
    });

    it('應該標記插入的行', () => {
      const sourceContent = 'line1\nline2\nline3';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/a.ts',
        2,
        2,
        3,
        sourceContent,
        null,
        movedLines
      );

      const insertChanges = result.fileChanges[0].changes.filter(
        c => c.oldContent === null
      );
      expect(insertChanges).toHaveLength(1);
    });

    it('應該正確計算插入位置（往後移動）', () => {
      const sourceContent = 'line1\nline2\nline3\nline4\nline5';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/a.ts',
        2,
        2,
        5,
        sourceContent,
        null,
        movedLines
      );

      const insertChange = result.fileChanges[0].changes.find(
        c => c.oldContent === null
      );
      expect(insertChange?.line).toBe(4); // 5 - 1 = 4
    });

    it('應該正確處理單行操作', () => {
      const sourceContent = 'line1\nline2\nline3';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/a.ts',
        2,
        2,
        1,
        sourceContent,
        null,
        movedLines
      );

      expect(result.operationDescription).toContain('1 line');
      expect(result.operationDescription).not.toContain('lines');
    });

    it('應該正確處理多行操作', () => {
      const sourceContent = 'line1\nline2\nline3\nline4';
      const movedLines = ['line2', 'line3'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/a.ts',
        2,
        3,
        1,
        sourceContent,
        null,
        movedLines
      );

      expect(result.operationDescription).toContain('2 lines');
    });
  });

  describe('跨檔案移動', () => {
    it('應該處理跨檔案的行移動', () => {
      const sourceContent = 'line1\nline2\nline3';
      const targetContent = 'target1\ntarget2';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/b.ts',
        2,
        2,
        2,
        sourceContent,
        targetContent,
        movedLines
      );

      expect(result.fileChanges).toHaveLength(2);
      expect(result.operationDescription).toContain('\'b.ts\'');
    });

    it('應該在來源檔案標記刪除', () => {
      const sourceContent = 'line1\nline2\nline3';
      const targetContent = 'target1';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/b.ts',
        2,
        2,
        1,
        sourceContent,
        targetContent,
        movedLines
      );

      const sourceChanges = result.fileChanges.find(
        fc => fc.filePath === '/src/a.ts'
      );
      expect(sourceChanges?.changes[0].newContent).toBeNull();
    });

    it('應該在目標檔案標記插入', () => {
      const sourceContent = 'line1\nline2';
      const targetContent = 'target1';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/b.ts',
        2,
        2,
        1,
        sourceContent,
        targetContent,
        movedLines
      );

      const targetChanges = result.fileChanges.find(
        fc => fc.filePath === '/src/b.ts'
      );
      expect(targetChanges?.changes[0].oldContent).toBeNull();
      expect(targetChanges?.changes[0].newContent).toBe('line2');
    });

    it('應該處理空的目標檔案內容', () => {
      const sourceContent = 'line1\nline2';
      const movedLines = ['line2'];

      const result = convertShiftPreview(
        '/src/a.ts',
        '/src/b.ts',
        2,
        2,
        1,
        sourceContent,
        null,
        movedLines
      );

      const targetChanges = result.fileChanges.find(
        fc => fc.filePath === '/src/b.ts'
      );
      expect(targetChanges?.originalContent).toBe('');
    });
  });
});

// ============================================================================
// convertRefactorPreview Tests
// ============================================================================

describe('convertRefactorPreview', () => {
  it('應該轉換重構預覽', () => {
    const edits = [
      {
        range: { start: { line: 1 }, end: { line: 3 } },
        newText: 'extractedFunction();',
      },
    ];
    const originalContent = 'line1\nline2\nline3\nline4';

    const result = convertRefactorPreview(edits, '/src/a.ts', originalContent);

    expect(result.command).toBe(PreviewCommand.Refactor);
    expect(result.success).toBe(true);
    expect(result.fileChanges).toHaveLength(1);
  });

  it('應該組合多行原始內容', () => {
    const edits = [
      {
        range: { start: { line: 2 }, end: { line: 4 } },
        newText: 'newCode();',
      },
    ];
    const originalContent = 'line1\nline2\nline3\nline4\nline5';

    const result = convertRefactorPreview(edits, '/src/a.ts', originalContent);

    expect(result.fileChanges[0].changes[0].oldContent).toBe('line2\nline3\nline4');
  });

  it('應該處理跨檔案提取', () => {
    const edits = [
      {
        range: { start: { line: 1 }, end: { line: 1 } },
        newText: 'import { extracted } from "./extracted";',
      },
    ];
    const originalContent = 'const x = 1 + 2;';
    const targetFileContent = 'export function extracted() { return 1 + 2; }';

    const result = convertRefactorPreview(
      edits,
      '/src/a.ts',
      originalContent,
      targetFileContent,
      '/src/extracted.ts'
    );

    expect(result.fileChanges).toHaveLength(2);
    expect(result.fileChanges[1].filePath).toBe('/src/extracted.ts');
    expect(result.fileChanges[1].originalContent).toBe('');
  });

  it('應該設定函數名稱的操作描述', () => {
    const edits = [
      { range: { start: { line: 1 }, end: { line: 1 } }, newText: 'x()' },
    ];

    const result = convertRefactorPreview(
      edits,
      '/src/a.ts',
      'original',
      undefined,
      undefined,
      { functionName: 'extractedFunc' }
    );

    expect(result.operationDescription).toBe('Extracted function \'extractedFunc\'');
  });

  it('應該設定自訂操作描述', () => {
    const edits = [
      { range: { start: { line: 1 }, end: { line: 1 } }, newText: 'x()' },
    ];

    const result = convertRefactorPreview(
      edits,
      '/src/a.ts',
      'original',
      undefined,
      undefined,
      { action: 'Custom refactoring action' }
    );

    expect(result.operationDescription).toBe('Custom refactoring action');
  });

  it('應該優先使用 functionName 而非 action', () => {
    const edits = [
      { range: { start: { line: 1 }, end: { line: 1 } }, newText: 'x()' },
    ];

    const result = convertRefactorPreview(
      edits,
      '/src/a.ts',
      'original',
      undefined,
      undefined,
      { functionName: 'myFunc', action: 'Some action' }
    );

    expect(result.operationDescription).toBe('Extracted function \'myFunc\'');
  });

  it('應該處理多個編輯', () => {
    const edits = [
      { range: { start: { line: 1 }, end: { line: 1 } }, newText: 'new1' },
      { range: { start: { line: 3 }, end: { line: 3 } }, newText: 'new3' },
    ];
    const originalContent = 'line1\nline2\nline3';

    const result = convertRefactorPreview(edits, '/src/a.ts', originalContent);

    expect(result.fileChanges[0].changes).toHaveLength(2);
  });

  it('應該正確設定新檔案的插入變更', () => {
    const edits = [
      { range: { start: { line: 1 }, end: { line: 1 } }, newText: 'import' },
    ];
    const targetFileContent = 'export function newFunc() {}';

    const result = convertRefactorPreview(
      edits,
      '/src/a.ts',
      'original',
      targetFileContent,
      '/src/new.ts'
    );

    const targetChange = result.fileChanges[1].changes[0];
    expect(targetChange.line).toBe(1);
    expect(targetChange.oldContent).toBeNull();
    expect(targetChange.newContent).toBe(targetFileContent);
  });

  it('應該在沒有選項時不設定操作描述', () => {
    const edits = [
      { range: { start: { line: 1 }, end: { line: 1 } }, newText: 'x' },
    ];

    const result = convertRefactorPreview(edits, '/src/a.ts', 'original');

    expect(result.operationDescription).toBeUndefined();
  });

  it('應該處理空的編輯列表', () => {
    const result = convertRefactorPreview([], '/src/a.ts', 'original');

    expect(result.command).toBe(PreviewCommand.Refactor);
    expect(result.fileChanges[0].changes).toEqual([]);
  });
});

// ============================================================================
// convertDeadCodeRemovalPreview Tests
// ============================================================================

import { convertDeadCodeRemovalPreview } from '@infrastructure/formatters/preview-converter.js';

describe('convertDeadCodeRemovalPreview', () => {
  it('應該轉換空的 preview 結果', () => {
    const preview = {
      success: true,
      removals: [],
      importCleanups: [],
      affectedFiles: [],
      summary: {
        totalRemovals: 0,
        byType: {},
        filesAffected: 0,
        linesRemoved: 0,
        importsCleanedUp: 0,
      },
    };

    const result = convertDeadCodeRemovalPreview(preview, new Map());

    expect(result.command).toBe(PreviewCommand.DeadCodeRemoval);
    expect(result.success).toBe(true);
    expect(result.fileChanges).toEqual([]);
    expect(result.operationDescription).toContain('Removed 0 dead code items');
  });

  it('應該轉換刪除操作', () => {
    const preview = {
      success: true,
      removals: [
        {
          filePath: '/src/a.ts',
          range: { start: { line: 5, column: 1 }, end: { line: 7, column: 1 } },
          originalCode: 'function unused() {}',
          symbolName: 'unused',
          symbolType: 'function',
        },
      ],
      importCleanups: [],
      affectedFiles: ['/src/a.ts'],
      summary: {
        totalRemovals: 1,
        byType: { function: 1 },
        filesAffected: 1,
        linesRemoved: 3,
        importsCleanedUp: 0,
      },
    };
    const originalContents = new Map([['/src/a.ts', 'line1\nline2\nline3\nline4\nfunction unused() {}\nline6']]);

    const result = convertDeadCodeRemovalPreview(preview, originalContents);

    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].filePath).toBe('/src/a.ts');
    expect(result.fileChanges[0].changes[0].oldContent).toBe('function unused() {}');
    expect(result.fileChanges[0].changes[0].newContent).toBeNull();
    expect(result.operationDescription).toContain('1 function');
  });

  it('應該轉換 import 刪除操作', () => {
    const preview = {
      success: true,
      removals: [],
      importCleanups: [
        {
          filePath: '/src/b.ts',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } },
          originalImport: 'import { unused } from \'./a\';',
          unusedSymbols: ['unused'],
          cleanupType: 'delete' as const,
        },
      ],
      affectedFiles: ['/src/b.ts'],
      summary: {
        totalRemovals: 0,
        byType: {},
        filesAffected: 1,
        linesRemoved: 1,
        importsCleanedUp: 1,
      },
    };
    const originalContents = new Map([['/src/b.ts', 'import { unused } from \'./a\';\nconst x = 1;']]);

    const result = convertDeadCodeRemovalPreview(preview, originalContents);

    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].changes[0].oldContent).toBe('import { unused } from \'./a\';');
    expect(result.fileChanges[0].changes[0].newContent).toBeNull();
    expect(result.operationDescription).toContain('cleaned up 1 import');
  });

  it('應該轉換 import 部分清理操作', () => {
    const preview = {
      success: true,
      removals: [],
      importCleanups: [
        {
          filePath: '/src/c.ts',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } },
          originalImport: 'import { used, unused } from \'./a\';',
          unusedSymbols: ['unused'],
          cleanupType: 'partial' as const,
          newImport: 'import { used } from \'./a\';',
        },
      ],
      affectedFiles: ['/src/c.ts'],
      summary: {
        totalRemovals: 0,
        byType: {},
        filesAffected: 1,
        linesRemoved: 0,
        importsCleanedUp: 1,
      },
    };
    const originalContents = new Map([['/src/c.ts', 'import { used, unused } from \'./a\';\nused();']]);

    const result = convertDeadCodeRemovalPreview(preview, originalContents);

    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].changes[0].oldContent).toBe('import { used, unused } from \'./a\';');
    expect(result.fileChanges[0].changes[0].newContent).toBe('import { used } from \'./a\';');
  });

  it('應該合併同一檔案的刪除和 import 清理操作', () => {
    const preview = {
      success: true,
      removals: [
        {
          filePath: '/src/d.ts',
          range: { start: { line: 5, column: 1 }, end: { line: 5, column: 20 } },
          originalCode: 'const unused = 1;',
          symbolName: 'unused',
          symbolType: 'variable',
        },
      ],
      importCleanups: [
        {
          filePath: '/src/d.ts',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 30 } },
          originalImport: 'import { helper } from \'./b\';',
          unusedSymbols: ['helper'],
          cleanupType: 'delete' as const,
        },
      ],
      affectedFiles: ['/src/d.ts'],
      summary: {
        totalRemovals: 1,
        byType: { variable: 1 },
        filesAffected: 1,
        linesRemoved: 2,
        importsCleanedUp: 1,
      },
    };
    const originalContents = new Map([['/src/d.ts', 'import { helper } from \'./b\';\nline2\nline3\nline4\nconst unused = 1;']]);

    const result = convertDeadCodeRemovalPreview(preview, originalContents);

    expect(result.fileChanges).toHaveLength(1);
    expect(result.fileChanges[0].changes).toHaveLength(2);
  });

  it('應該處理多種類型的統計', () => {
    const preview = {
      success: true,
      removals: [
        {
          filePath: '/src/e.ts',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } },
          originalCode: 'function fn() {}',
          symbolName: 'fn',
          symbolType: 'function',
        },
        {
          filePath: '/src/e.ts',
          range: { start: { line: 2, column: 1 }, end: { line: 2, column: 20 } },
          originalCode: 'class MyClass {}',
          symbolName: 'MyClass',
          symbolType: 'class',
        },
      ],
      importCleanups: [],
      affectedFiles: ['/src/e.ts'],
      summary: {
        totalRemovals: 2,
        byType: { function: 1, class: 1 },
        filesAffected: 1,
        linesRemoved: 2,
        importsCleanedUp: 0,
      },
    };
    const originalContents = new Map([['/src/e.ts', 'function fn() {}\nclass MyClass {}']]);

    const result = convertDeadCodeRemovalPreview(preview, originalContents);

    expect(result.operationDescription).toContain('2 dead code items');
    expect(result.operationDescription).toContain('1 function');
    expect(result.operationDescription).toContain('1 class');
  });

  it('應該處理錯誤訊息', () => {
    const preview = {
      success: false,
      removals: [],
      importCleanups: [],
      affectedFiles: [],
      summary: {
        totalRemovals: 0,
        byType: {},
        filesAffected: 0,
        linesRemoved: 0,
        importsCleanedUp: 0,
      },
      errors: ['Parse error in file.ts'],
    };

    const result = convertDeadCodeRemovalPreview(preview, new Map());

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['Parse error in file.ts']);
  });

  it('應該處理空的 originalContents', () => {
    const preview = {
      success: true,
      removals: [
        {
          filePath: '/src/f.ts',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } },
          originalCode: 'const x = 1;',
          symbolName: 'x',
          symbolType: 'variable',
        },
      ],
      importCleanups: [],
      affectedFiles: ['/src/f.ts'],
      summary: {
        totalRemovals: 1,
        byType: { variable: 1 },
        filesAffected: 1,
        linesRemoved: 1,
        importsCleanedUp: 0,
      },
    };

    const result = convertDeadCodeRemovalPreview(preview, new Map());

    expect(result.fileChanges[0].originalContent).toBe('');
  });
});

// ============================================================================
// convertOperationsToPreviewInput context 處理測試
// ============================================================================

describe('convertRenamePreview - context 處理', () => {
  it('應該使用 context 合併同一行的多個替換', () => {
    const operations = [
      {
        filePath: '/src/test.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 7 }, end: { line: 1, column: 10 } },
        context: 'const foo = foo + foo;',
      },
      {
        filePath: '/src/test.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 13 }, end: { line: 1, column: 16 } },
        context: 'const foo = foo + foo;',
      },
      {
        filePath: '/src/test.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 19 }, end: { line: 1, column: 22 } },
        context: 'const foo = foo + foo;',
      },
    ];
    const originalContents = new Map([['/src/test.ts', 'const foo = foo + foo;']]);

    const result = convertRenamePreview(operations, [], originalContents);

    expect(result.fileChanges).toHaveLength(1);
    // 同一行的多個操作應該合併為一個變更
    expect(result.fileChanges[0].changes).toHaveLength(1);
    expect(result.fileChanges[0].changes[0].oldContent).toBe('const foo = foo + foo;');
    expect(result.fileChanges[0].changes[0].newContent).toBe('const bar = bar + bar;');
  });

  it('應該在沒有 context 時分別處理每個操作', () => {
    const operations = [
      {
        filePath: '/src/test.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 7 }, end: { line: 1, column: 10 } },
      },
      {
        filePath: '/src/test.ts',
        oldText: 'foo',
        newText: 'bar',
        range: { start: { line: 1, column: 13 }, end: { line: 1, column: 16 } },
      },
    ];
    const originalContents = new Map([['/src/test.ts', 'const foo = foo;']]);

    const result = convertRenamePreview(operations, [], originalContents);

    expect(result.fileChanges).toHaveLength(1);
    // 沒有 context 時，每個操作單獨處理
    expect(result.fileChanges[0].changes).toHaveLength(2);
  });
});
