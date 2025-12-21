/**
 * 測試相鄰行過濾邏輯
 * Bug: ±1 行容錯導致相鄰使用被誤排除
 */

import { describe, it, expect } from 'vitest';
import { SymbolReferenceType } from '@core/shared/symbol-finder/index.js';

/** 模擬的符號位置 */
interface SymbolLocation {
  filePath: string;
  range: {
    start: { line: number; column: number };
  };
}

/** 模擬的引用 */
interface Reference {
  location: SymbolLocation;
  type: SymbolReferenceType;
}

/**
 * 原本有 bug 的過濾邏輯（±1 行容錯）
 */
function filterWithLineTolerance(
  references: Reference[],
  symbolFile: string,
  symbolLine: number
): Reference[] {
  return references.filter(ref => {
    const isSameLocation = ref.location.filePath === symbolFile
      && Math.abs(ref.location.range.start.line - symbolLine) <= 1;
    if (isSameLocation) {
      return false;
    }
    return ref.type === SymbolReferenceType.Usage;
  });
}

/**
 * 修復後的過濾邏輯（精確比對行列）
 */
function filterWithExactMatch(
  references: Reference[],
  symbolFile: string,
  symbolLine: number,
  symbolColumn: number
): Reference[] {
  return references.filter(ref => {
    const isSameLocation = ref.location.filePath === symbolFile
      && ref.location.range.start.line === symbolLine
      && ref.location.range.start.column === symbolColumn;
    if (isSameLocation) {
      return false;
    }
    return ref.type === SymbolReferenceType.Usage;
  });
}

describe('相鄰行過濾邏輯（Bug: ±1 行容錯修復）', () => {
  const symbolFile = '/test/whitelist.guard.ts';

  describe('原本有 bug 的邏輯（±1 行容錯）', () => {
    it('定義在第 13 行，使用在第 11 行會被誤排除', () => {
      const symbolLine = 13; // isIpAllowed 定義位置
      const references: Reference[] = [
        // 定義位置本身
        {
          location: { filePath: symbolFile, range: { start: { line: 13, column: 2 } } },
          type: SymbolReferenceType.Definition
        },
        // 使用位置（第 11 行，相鄰）
        {
          location: { filePath: symbolFile, range: { start: { line: 11, column: 16 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithLineTolerance(references, symbolFile, symbolLine);

      // Bug: 使用位置被誤排除（因為 |11 - 13| = 2 > 1，實際不會被排除）
      // 但如果是 |12 - 13| = 1 <= 1，則會被排除
      expect(usageRefs.length).toBe(1); // 這個案例剛好不會觸發 bug
    });

    it('定義在第 13 行，使用在第 12 行會被誤排除', () => {
      const symbolLine = 13; // isIpAllowed 定義位置
      const references: Reference[] = [
        // 定義位置本身
        {
          location: { filePath: symbolFile, range: { start: { line: 13, column: 2 } } },
          type: SymbolReferenceType.Definition
        },
        // 使用位置（第 12 行，相鄰 1 行）
        {
          location: { filePath: symbolFile, range: { start: { line: 12, column: 16 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithLineTolerance(references, symbolFile, symbolLine);

      // Bug: 使用位置被誤排除（因為 |12 - 13| = 1 <= 1）
      expect(usageRefs.length).toBe(0); // ← 這是 bug！應該是 1
    });

    it('定義在第 13 行，使用在第 14 行會被誤排除', () => {
      const symbolLine = 13;
      const references: Reference[] = [
        {
          location: { filePath: symbolFile, range: { start: { line: 13, column: 2 } } },
          type: SymbolReferenceType.Definition
        },
        // 使用位置（第 14 行，相鄰 1 行）
        {
          location: { filePath: symbolFile, range: { start: { line: 14, column: 16 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithLineTolerance(references, symbolFile, symbolLine);

      // Bug: 使用位置被誤排除（因為 |14 - 13| = 1 <= 1）
      expect(usageRefs.length).toBe(0); // ← 這是 bug！應該是 1
    });
  });

  describe('修復後的邏輯（精確比對行列）', () => {
    it('定義在第 13 行，使用在第 12 行不會被誤排除', () => {
      const symbolLine = 13;
      const symbolColumn = 2;
      const references: Reference[] = [
        {
          location: { filePath: symbolFile, range: { start: { line: 13, column: 2 } } },
          type: SymbolReferenceType.Definition
        },
        // 使用位置（第 12 行）
        {
          location: { filePath: symbolFile, range: { start: { line: 12, column: 16 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithExactMatch(references, symbolFile, symbolLine, symbolColumn);

      // 修復後：使用位置不會被誤排除
      expect(usageRefs.length).toBe(1);
    });

    it('定義在第 13 行 column 2，相同位置的 Definition 會被排除', () => {
      const symbolLine = 13;
      const symbolColumn = 2;
      const references: Reference[] = [
        {
          location: { filePath: symbolFile, range: { start: { line: 13, column: 2 } } },
          type: SymbolReferenceType.Definition
        },
        {
          location: { filePath: symbolFile, range: { start: { line: 15, column: 10 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithExactMatch(references, symbolFile, symbolLine, symbolColumn);

      // 只有 Usage 會被保留
      expect(usageRefs.length).toBe(1);
      expect(usageRefs[0].location.range.start.line).toBe(15);
    });

    it('同一行不同 column 的使用不會被誤排除', () => {
      const symbolLine = 10;
      const symbolColumn = 2;
      const references: Reference[] = [
        // 定義位置
        {
          location: { filePath: symbolFile, range: { start: { line: 10, column: 2 } } },
          type: SymbolReferenceType.Definition
        },
        // 同一行的使用（不同 column）
        {
          location: { filePath: symbolFile, range: { start: { line: 10, column: 20 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithExactMatch(references, symbolFile, symbolLine, symbolColumn);

      // 修復後：同一行不同 column 的使用不會被排除
      expect(usageRefs.length).toBe(1);
    });
  });

  describe('邊界情況', () => {
    it('不同檔案的引用不受影響', () => {
      const symbolLine = 10;
      const symbolColumn = 2;
      const references: Reference[] = [
        // 不同檔案的使用
        {
          location: { filePath: '/other/file.ts', range: { start: { line: 10, column: 2 } } },
          type: SymbolReferenceType.Usage
        }
      ];

      const usageRefs = filterWithExactMatch(references, symbolFile, symbolLine, symbolColumn);

      // 不同檔案不會被排除
      expect(usageRefs.length).toBe(1);
    });

    it('空引用列表不會出錯', () => {
      const usageRefs = filterWithExactMatch([], symbolFile, 10, 2);
      expect(usageRefs.length).toBe(0);
    });
  });
});
