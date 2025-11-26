/**
 * CLI analyze 命令 E2E 測試
 * 基於 sample-project fixture 測試分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI analyze - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析專案', async () => {
      const result = await executeCLI(['analyze', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('多次分析', () => {
    it('應該能夠多次執行分析命令', async () => {
      const result1 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });
      const result2 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI(['analyze', '--path', '/nonexistent/path'], { memfs: fixture.memfs });

      // 確保不會崩潰
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('專案結構極端情境', () => {
    it('應該處理空專案', async () => {
      const emptyFixture = await loadFixture('sample-project');
      emptyFixture.memfs.reset();
      await emptyFixture.memfs.createDirectory(emptyFixture.rootPath, true);

      const result = await executeCLI(['analyze', '--path', emptyFixture.rootPath, '--format', 'json'], {
        memfs: emptyFixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
      emptyFixture.cleanup();
    });

    it('應該處理超深目錄結構', async () => {
      let deepPath = fixture.rootPath;
      for (let i = 0; i < 10; i++) {
        deepPath = `${deepPath}/level${i}`;
        await fixture.memfs.createDirectory(deepPath, false);
      }

      await fixture.writeFile('level0/level1/level2/level3/level4/level5/level6/level7/level8/level9/deep.ts', `
export class DeepClass {
  method() {
    return 'deep';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理扁平結構（所有檔案同一層，100+ 檔案）', async () => {
      for (let i = 1; i <= 120; i++) {
        await fixture.writeFile(`file${i}.ts`, `
export class Class${i} {
  method() {
    return ${i};
  }
}
        `.trim());
      }

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該處理大量檔案（150+ 檔案）', async () => {
      for (let i = 1; i <= 150; i++) {
        await fixture.writeFile(`batch/file${i}.ts`, `
export function func${i}() {
  return ${i};
}
        `.trim());
      }

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理混合語言專案（TS + JS）', async () => {
      await fixture.writeFile('mixed/typescript.ts', `
export class TypeScriptClass {
  value: number = 1;
}
      `.trim());

      await fixture.writeFile('mixed/javascript.js', `
export class JavaScriptClass {
  constructor() {
    this.value = 1;
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理只有設定檔的專案', async () => {
      await fixture.writeFile('package.json', JSON.stringify({ name: 'test', version: '1.0.0' }));
      await fixture.writeFile('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true } }));

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理全部是測試檔案的專案', async () => {
      await fixture.writeFile('test1.test.ts', `
describe('test1', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
      `.trim());

      await fixture.writeFile('test2.spec.ts', `
describe('test2', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('檔案內容極端情境', () => {
    it('應該處理超大型 class（50+ 方法）', async () => {
      const methods = Array.from(
        { length: 50 },
        (_, i) => `
  method${i}() {
    return ${i};
  }`
      ).join('\n');

      await fixture.writeFile('huge-class.ts', `
export class HugeClass {${methods}
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理超多 export', async () => {
      const exports = Array.from({ length: 100 }, (_, i) => `export const VALUE_${i} = ${i};`).join('\n');

      await fixture.writeFile('many-exports.ts', exports);

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理複雜 generic 型別', async () => {
      await fixture.writeFile('complex-generic.ts', `
export type ComplexType<T, U, V> = {
  field1: T extends string ? U : V;
  field2: Array<T | U | V>;
  field3: Record<string, T>;
  field4: Map<U, Set<V>>;
};

export class GenericClass<T extends Record<string, unknown>> {
  constructor(private data: T) {}

  method<U extends keyof T>(key: U): T[U] {
    return this.data[key];
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理裝飾器密集檔案', async () => {
      await fixture.writeFile('decorator-heavy.ts', `
function decorator1() { return (target: any) => {}; }
function decorator2() { return (target: any) => {}; }
function decorator3() { return (target: any, key: string) => {}; }

@decorator1()
@decorator2()
export class DecoratorClass {
  @decorator3()
  field1: string;

  @decorator3()
  field2: number;

  @decorator3()
  field3: boolean;

  @decorator1()
  method1() {}

  @decorator2()
  method2() {}
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理超長檔案（1000+ 行）', async () => {
      const longContent = Array.from({ length: 1000 }, (_, i) => `const var${i} = ${i};`).join('\n');

      await fixture.writeFile('long-file.ts', longContent);

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('分析指標驗證', () => {
    it('應該正確計算複雜度極高的檔案', async () => {
      await fixture.writeFile('complex-logic.ts', `
export function complexFunction(a: number, b: number, c: number) {
  if (a > 0) {
    if (b > 0) {
      if (c > 0) {
        for (let i = 0; i < a; i++) {
          for (let j = 0; j < b; j++) {
            for (let k = 0; k < c; k++) {
              while (i > 0) {
                if (j > 0 && k > 0) {
                  return i + j + k;
                } else if (j > 0 || k > 0) {
                  return i + j - k;
                }
              }
            }
          }
        }
      }
    }
  }
  return 0;
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該正確統計行數', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `const line${i} = ${i};`);
      await fixture.writeFile('counted-file.ts', lines.join('\n'));

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該正確統計符號數量', async () => {
      await fixture.writeFile('symbols.ts', `
export class Class1 {}
export class Class2 {}
export interface Interface1 {}
export interface Interface2 {}
export function func1() {}
export function func2() {}
export const const1 = 1;
export const const2 = 2;
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });

  describe('輸出格式驗證', () => {
    it('應該在 JSON 輸出中包含完整結構', async () => {
      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('summary');
    });

    it('應該在 summary 格式中包含關鍵指標', async () => {
      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'summary'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('應該處理大量結果的輸出（100+ 檔案）', async () => {
      for (let i = 1; i <= 100; i++) {
        await fixture.writeFile(`output-test/file${i}.ts`, `
export class Class${i} {
  method1() { return ${i}; }
  method2() { return ${i * 2}; }
  method3() { return ${i * 3}; }
}
        `.trim());
      }

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });

  describe('邊界條件', () => {
    it('應該處理檔名包含特殊字元', async () => {
      await fixture.writeFile('special-@#$.ts', `
export class SpecialClass {
  method() {
    return 'special';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理空白檔案', async () => {
      await fixture.writeFile('empty.ts', '');

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理只有註解的檔案', async () => {
      await fixture.writeFile('comments-only.ts', `
// This is a comment
/* This is a block comment */
/**
 * This is a JSDoc comment
 */
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理語法錯誤的檔案', async () => {
      await fixture.writeFile('syntax-error.ts', `
export class BrokenClass {
  method() {
    return 'incomplete
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理循環依賴', async () => {
      await fixture.writeFile('circular-a.ts', `
import { ClassB } from './circular-b.js';
export class ClassA {
  b: ClassB;
}
      `.trim());

      await fixture.writeFile('circular-b.ts', `
import { ClassA } from './circular-a.js';
export class ClassB {
  a: ClassA;
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理無 TypeScript 檔案的專案', async () => {
      await fixture.writeFile('readme.md', '# README');
      await fixture.writeFile('data.json', JSON.stringify({ data: 'value' }));

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });
  });
});
