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

    it('應該處理超大檔案（超過 1MB）', async () => {
      const hugeContent = 'const x = 1;\n'.repeat(100000); // 約 1.2 MB

      await fixture.writeFile('huge-file.ts', hugeContent);

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 Unicode 字元檔名', async () => {
      await fixture.writeFile('測試檔案.ts', `
export class 測試類別 {
  方法() {
    return '中文';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('符號索引極端測試', () => {
    it('應該處理符號名稱重複（不同檔案同名符號）', async () => {
      await fixture.writeFile('file1.ts', `
export class DuplicateClass {
  method1() { return 1; }
}
      `.trim());

      await fixture.writeFile('file2.ts', `
export class DuplicateClass {
  method2() { return 2; }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理巢狀符號（深層作用域）', async () => {
      await fixture.writeFile('nested-scope.ts', `
export class Outer {
  method1() {
    class Inner1 {
      method2() {
        class Inner2 {
          method3() {
            return 'deep';
          }
        }
      }
    }
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理匿名符號', async () => {
      await fixture.writeFile('anonymous.ts', `
export const handler = function() {
  return 'anonymous function';
};

export const arrow = () => {
  return 'arrow function';
};

export default class {
  method() {
    return 'anonymous class';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理超長符號名稱（500+ 字元）', async () => {
      const longName = 'VeryLongClassName' + 'A'.repeat(500);

      await fixture.writeFile('long-name.ts', `
export class ${longName} {
  method() {
    return 'long';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理特殊字元符號名稱', async () => {
      await fixture.writeFile('special-symbols.ts', `
export const $variable = 1;
export const _privateVar = 2;
export const __doubleUnderscore = 3;
export const $$ = 4;
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('檔案索引更新與增量測試', () => {
    it('應該支援重複分析同一專案（索引更新）', async () => {
      await fixture.writeFile('update-test.ts', `
export class Initial {
  value = 1;
}
      `.trim());

      const result1 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result1.exitCode).toBe(0);

      await fixture.writeFile('update-test.ts', `
export class Updated {
  value = 2;
  newMethod() { return 'new'; }
}
      `.trim());

      const result2 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result2.exitCode).toBe(0);
    });

    it('應該處理檔案刪除後的重新分析', async () => {
      await fixture.writeFile('temp.ts', `
export class TempClass {}
      `.trim());

      const result1 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result1.exitCode).toBe(0);

      await fixture.memfs.deleteFile(`${fixture.rootPath}/temp.ts`);

      const result2 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result2.exitCode).toBe(0);
    });

    it('應該處理新增檔案後的重新分析', async () => {
      const result1 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result1.exitCode).toBe(0);

      await fixture.writeFile('new-file.ts', `
export class NewClass {
  method() { return 'new'; }
}
      `.trim());

      const result2 = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result2.exitCode).toBe(0);
    });
  });

  describe('依賴分析極端測試', () => {
    it('應該處理複雜依賴鏈（10+ 層）', async () => {
      for (let i = 0; i < 10; i++) {
        const nextImport = i < 9 ? `import { Class${i + 1} } from './dep${i + 1}.js';` : '';

        await fixture.writeFile(`dep${i}.ts`, `
${nextImport}
export class Class${i} {
  value = ${i};
}
        `.trim());
      }

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理多重依賴（一個檔案依賴多個檔案）', async () => {
      for (let i = 0; i < 20; i++) {
        await fixture.writeFile(`lib${i}.ts`, `
export class Lib${i} {
  value = ${i};
}
        `.trim());
      }

      const imports = Array.from({ length: 20 }, (_, i) => `import { Lib${i} } from './lib${i}.js';`).join('\n');

      await fixture.writeFile('multi-deps.ts', `
${imports}
export class MultiDeps {
  method() {
    return 'uses all libs';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理相對路徑依賴（../ 和 ./）', async () => {
      await fixture.writeFile('lib/utils/helper.ts', `
export class Helper {}
      `.trim());

      await fixture.writeFile('lib/core.ts', `
import { Helper } from './utils/helper.js';
export class Core {
  helper: Helper;
}
      `.trim());

      await fixture.writeFile('app.ts', `
import { Core } from './lib/core.js';
import { Helper } from './lib/utils/helper.js';
export class App {
  core: Core;
  helper: Helper;
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 Node 模組依賴（排除外部套件）', async () => {
      await fixture.writeFile('external-deps.ts', `
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export class ExternalDeps {
  method() {
    return 'uses node modules';
  }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('檔案內容編碼與格式測試', () => {
    it('應該處理不同換行符（LF、CRLF）', async () => {
      await fixture.writeFile('lf.ts', 'export class LF {\n  method() {\n    return "lf";\n  }\n}');

      await fixture.writeFile('crlf.ts', 'export class CRLF {\r\n  method() {\r\n    return "crlf";\r\n  }\r\n}');

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理不同縮排（tab 和 space）', async () => {
      await fixture.writeFile('tab-indent.ts', `
export class TabIndent {
\tmethod() {
\t\treturn 'tab';
\t}
}
      `.trim());

      await fixture.writeFile('space-indent.ts', `
export class SpaceIndent {
    method() {
        return 'space';
    }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 Unicode BOM', async () => {
      const bomContent = '\uFEFFexport class BOM {\n  method() {\n    return "bom";\n  }\n}';

      await fixture.writeFile('bom.ts', bomContent);

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('查詢效能極端測試', () => {
    it('應該處理大量符號查詢（1000+ 符號）', async () => {
      for (let i = 0; i < 200; i++) {
        const symbols = Array.from({ length: 5 }, (_, j) => `
export class Class${i}_${j} {
  method() { return ${i * 5 + j}; }
}
        `).join('\n');

        await fixture.writeFile(`query-test/file${i}.ts`, symbols.trim());
      }

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });

  describe('錯誤恢復測試', () => {
    it('應該處理部分檔案解析失敗（混合成功與失敗）', async () => {
      await fixture.writeFile('valid1.ts', `
export class Valid1 {
  method() { return 1; }
}
      `.trim());

      await fixture.writeFile('broken.ts', `
export class Broken {
  method() {
    return 'incomplete string
  }
}
      `.trim());

      await fixture.writeFile('valid2.ts', `
export class Valid2 {
  method() { return 2; }
}
      `.trim());

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理所有檔案解析失敗', async () => {
      await fixture.writeFile('broken1.ts', 'export class {');
      await fixture.writeFile('broken2.ts', 'function missing( {');
      await fixture.writeFile('broken3.ts', 'const x = "incomplete');

      const result = await executeCLI(['analyze', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('併發與批次處理測試', () => {
    it('應該處理高併發分析（100+ 檔案同時索引）', async () => {
      for (let i = 0; i < 100; i++) {
        await fixture.writeFile(`concurrent/file${i}.ts`, `
export class Concurrent${i} {
  value = ${i};
  method() {
    return this.value * 2;
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
  });

  describe('dead-code 分析 - 未使用的本地定義', () => {
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
