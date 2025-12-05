/**
 * CLI complexity 命令 E2E 測試 - 索引功能
 * 測試符號索引、依賴分析、效能、併發等底層功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI complexity indexing - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result1 = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result1.exitCode).toBe(0);

      await fixture.writeFile('update-test.ts', `
export class Updated {
  value = 2;
  newMethod() { return 'new'; }
}
      `.trim());

      const result2 = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result2.exitCode).toBe(0);
    });

    it('應該處理檔案刪除後的重新分析', async () => {
      await fixture.writeFile('temp.ts', `
export class TempClass {}
      `.trim());

      const result1 = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result1.exitCode).toBe(0);

      await fixture.memfs.deleteFile(`${fixture.rootPath}/temp.ts`);

      const result2 = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result2.exitCode).toBe(0);
    });

    it('應該處理新增檔案後的重新分析', async () => {
      const result1 = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result1.exitCode).toBe(0);

      await fixture.writeFile('new-file.ts', `
export class NewClass {
  method() { return 'new'; }
}
      `.trim());

      const result2 = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
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

      const result = await executeCLI(['complexity', '--path', fixture.rootPath, '--format', 'json'], {
        memfs: fixture.memfs,
      });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });
  });
});
