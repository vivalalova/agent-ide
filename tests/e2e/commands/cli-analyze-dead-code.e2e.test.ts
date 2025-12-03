/**
 * CLI analyze dead-code 命令 E2E 測試
 * 基於 sample-project fixture 測試死碼分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI analyze dead-code - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('未使用的本地定義', () => {
    it('應該檢測未使用的本地變數和函式', async () => {
      await fixture.writeFile('dead-code-local/test.ts', `
// 未使用的本地變數
const unusedVariable = 'never used';

// 未使用的本地函式
function unusedLocalFunction(): void {
  console.log('never called');
}

// 使用的本地變數
const usedVariable = 'used';

// 使用的本地函式
function usedLocalFunction(): string {
  return 'called';
}

// 實際使用
console.log(usedVariable);
usedLocalFunction();
      `.trim());

      const result = await executeCLI(
        ['analyze', 'dead-code', '--path', `${fixture.rootPath}/dead-code-local`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 從 issues 中提取 dead code 名稱（使用完整匹配避免 unusedVariable 包含 usedVariable）
      const deadCodeMessages = output.issues?.map((i: { message: string }) => i.message) || [];

      // 未使用的本地符號應該被報為 dead code
      expect(deadCodeMessages.some((m: string) => m.includes(': unusedVariable'))).toBe(true);
      expect(deadCodeMessages.some((m: string) => m.includes(': unusedLocalFunction'))).toBe(true);
      // 使用的本地符號不應該被報（使用精確匹配，排除 unusedVariable）
      expect(deadCodeMessages.some((m: string) => /: usedVariable$/.test(m))).toBe(false);
      expect(deadCodeMessages.some((m: string) => /: usedLocalFunction$/.test(m))).toBe(false);
    });

    it('應該檢測未使用的本地 Interface（非 export）', async () => {
      await fixture.writeFile('dead-code-interface/test.ts', `
// 未使用的本地 Interface
interface UnusedLocalInterface {
  name: string;
}

// 使用的本地 Interface（用於類型標註）
interface UsedLocalInterface {
  id: number;
}

// 使用的本地 Interface（用於 extends）
interface BaseInterface {
  base: string;
}

interface ChildInterface extends BaseInterface {
  child: string;
}

// 實際使用
const obj: UsedLocalInterface = { id: 1 };
const child: ChildInterface = { base: 'base', child: 'child' };
console.log(obj, child);
      `.trim());

      const result = await executeCLI(
        ['analyze', 'dead-code', '--path', `${fixture.rootPath}/dead-code-interface`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const deadCodeMessages = output.issues?.map((i: { message: string }) => i.message) || [];

      // 未使用的 Interface 應該被報為 dead code
      expect(deadCodeMessages.some((m: string) => m.includes('UnusedLocalInterface'))).toBe(true);
      // 使用的 Interface 不應該被報
      expect(deadCodeMessages.some((m: string) => m.includes('UsedLocalInterface'))).toBe(false);
      expect(deadCodeMessages.some((m: string) => m.includes('BaseInterface'))).toBe(false);
      expect(deadCodeMessages.some((m: string) => m.includes('ChildInterface'))).toBe(false);
    });

    it('應該檢測未使用的本地 Type alias', async () => {
      await fixture.writeFile('dead-code-type/test.ts', `
// 未使用的 Type alias
type UnusedType = string | number;

// 使用的 Type alias
type UsedType = boolean | null;

// 實際使用
const value: UsedType = true;
console.log(value);
      `.trim());

      const result = await executeCLI(
        ['analyze', 'dead-code', '--path', `${fixture.rootPath}/dead-code-type`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const deadCodeMessages = output.issues?.map((i: { message: string }) => i.message) || [];

      expect(deadCodeMessages.some((m: string) => m.includes('UnusedType'))).toBe(true);
      expect(deadCodeMessages.some((m: string) => m.includes('UsedType'))).toBe(false);
    });

    it('應該檢測未使用的本地 Enum', async () => {
      await fixture.writeFile('dead-code-enum/test.ts', `
// 未使用的 Enum
enum UnusedEnum {
  A = 'a',
  B = 'b'
}

// 使用的 Enum
enum UsedEnum {
  X = 'x',
  Y = 'y'
}

// 實際使用
const value = UsedEnum.X;
console.log(value);
      `.trim());

      const result = await executeCLI(
        ['analyze', 'dead-code', '--path', `${fixture.rootPath}/dead-code-enum`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const deadCodeMessages = output.issues?.map((i: { message: string }) => i.message) || [];

      expect(deadCodeMessages.some((m: string) => m.includes('UnusedEnum'))).toBe(true);
      expect(deadCodeMessages.some((m: string) => m.includes('UsedEnum'))).toBe(false);
    });

    it('export 的符號不應該被報為 dead code', async () => {
      await fixture.writeFile('dead-code-export/test.ts', `
// export 的符號（可能在其他檔案使用）
export interface ExportedInterface {
  name: string;
}

export function exportedFunction(): void {
  console.log('exported');
}

export const exportedVariable = 'exported';

export type ExportedType = string;

export enum ExportedEnum {
  A = 'a'
}
      `.trim());

      const result = await executeCLI(
        ['analyze', 'dead-code', '--path', `${fixture.rootPath}/dead-code-export`, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const deadCodeMessages = output.issues?.map((i: { message: string }) => i.message) || [];

      // export 的符號不應該被報為 dead code
      expect(deadCodeMessages.some((m: string) => m.includes('ExportedInterface'))).toBe(false);
      expect(deadCodeMessages.some((m: string) => m.includes('exportedFunction'))).toBe(false);
      expect(deadCodeMessages.some((m: string) => m.includes('exportedVariable'))).toBe(false);
      expect(deadCodeMessages.some((m: string) => m.includes('ExportedType'))).toBe(false);
      expect(deadCodeMessages.some((m: string) => m.includes('ExportedEnum'))).toBe(false);
    });
  });
});
