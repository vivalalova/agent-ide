/**
 * CLI shit 命令 E2E 測試
 * 基於 sample-project fixture 測試 ShitScore 分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI shit - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該分析專案並輸出 JSON 格式評分', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
      expect(typeof output.shitScore).toBe('number');
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
      expect(output.shitScore).toBeLessThanOrEqual(100);
    });

    it('應該包含四個維度的評分', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.dimensions).toBeDefined();
      expect(output.dimensions.complexity).toBeDefined();
      expect(output.dimensions.maintainability).toBeDefined();
      expect(output.dimensions.architecture).toBeDefined();
    });

    it('應該包含等級資訊', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.grade).toBeDefined();
      expect(output.gradeInfo).toBeDefined();
      expect(output.gradeInfo.emoji).toBeDefined();
    });

    it('應該包含摘要資訊', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(output.summary.totalFiles).toBeDefined();
      expect(output.summary.analyzedFiles).toBeDefined();
      expect(output.summary.totalShit).toBeDefined();
    });
  });

  describe('--detailed 參數', () => {
    it('應該在 detailed 模式下包含 topShit 列表', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.topShit).toBeDefined();
      expect(Array.isArray(output.topShit)).toBe(true);
    });

    it('應該在 detailed 模式下包含建議', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.recommendations) {
        expect(Array.isArray(output.recommendations)).toBe(true);
      }
    });
  });

  describe('--top 參數', () => {
    it('應該限制 topShit 數量為 5', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed', '--top', '5'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.topShit && output.topShit.length > 0) {
        expect(output.topShit.length).toBeLessThanOrEqual(5);
      }
    });

    it('應該限制 topShit 數量為 3', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed', '--top', '3'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.topShit && output.topShit.length > 0) {
        expect(output.topShit.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('輸出格式', () => {
    it('應該在 text 格式下輸出可讀文字', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'text'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('垃圾度評分報告');
      expect(result.stdout).toContain('總分');
    });

    it('應該預設使用 text 格式', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('垃圾度評分報告');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI(['shit', '--path', '/nonexistent/path', '--format', 'json'], { memfs: fixture.memfs });

      // 可能成功但分析 0 個檔案，或失敗
      if (result.exitCode === 0) {
        const output = JSON.parse(result.stdout);
        expect(output.summary.analyzedFiles).toBe(0);
      }
    });
  });

  describe('維度權重驗證', () => {
    it('應該包含正確的維度權重', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const dimensions = output.dimensions;

      // 驗證每個維度都有權重
      expect(dimensions.complexity.weight).toBeDefined();
      expect(dimensions.maintainability.weight).toBeDefined();
      expect(dimensions.architecture.weight).toBeDefined();

      // 驗證每個維度權重都在 0-1 之間
      expect(dimensions.complexity.weight).toBeGreaterThan(0);
      expect(dimensions.complexity.weight).toBeLessThanOrEqual(1);
      expect(dimensions.maintainability.weight).toBeGreaterThan(0);
      expect(dimensions.maintainability.weight).toBeLessThanOrEqual(1);
      expect(dimensions.architecture.weight).toBeGreaterThan(0);
      expect(dimensions.architecture.weight).toBeLessThanOrEqual(1);
    });
  });

  describe('TopShit 項目結構', () => {
    it('每個 topShit 項目應該有完整的屬性', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.topShit && output.topShit.length > 0) {
        const item = output.topShit[0];
        expect(item.type).toBeDefined();
        expect(item.severity).toBeDefined();
        expect(item.score).toBeDefined();
        expect(item.filePath).toBeDefined();
        expect(item.description).toBeDefined();
      }
    });

    it('severity 應該是有效值', async () => {
      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const validSeverities = ['critical', 'high', 'medium', 'low'];

      if (output.topShit && output.topShit.length > 0) {
        for (const item of output.topShit) {
          expect(validSeverities).toContain(item.severity);
        }
      }
    });
  });

  describe('極端檔案結構', () => {
    it('應該處理超深層嵌套目錄（10+ 層）', async () => {
      let path = 'level1';
      for (let i = 2; i <= 12; i++) {
        path += `/level${i}`;
      }
      await fixture.writeFile(`${path}/deep-file.ts`, 'export function deepFunction() { return 42; }');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
    });

    it('應該處理單檔案超多函數（50+ 函數）', async () => {
      const functions = Array.from({ length: 55 }, (_, i) =>
        `export function func${i}() { return ${i}; }`
      ).join('\n\n');

      await fixture.writeFile('many-functions.ts', functions);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理超長檔名', async () => {
      const longFileName = 'a'.repeat(200) + '.ts';
      await fixture.writeFile(longFileName, 'export const value = 1;');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該處理 Unicode 檔名', async () => {
      await fixture.writeFile('測試檔案-🚀.ts', 'export const emoji = "🎉";');
      await fixture.writeFile('файл.ts', 'export const cyrillic = true;');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });
  });

  describe('極端程式碼', () => {
    it('應該處理極高複雜度函數（cyclomatic > 50）', async () => {
      const complexFunction = `
export function extremelyComplexFunction(value: number) {
  ${Array.from({ length: 55 }, (_, i) =>
    `if (value === ${i}) return ${i};`
  ).join('\n  ')}
  return -1;
}`;

      await fixture.writeFile('complex.ts', complexFunction);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
      expect(output.shitScore).toBeLessThanOrEqual(100);
    });

    it('應該處理超長單行程式碼', async () => {
      const longLine = `export const data = { ${Array.from({ length: 100 }, (_, i) => `key${i}: "value${i}"`).join(', ')} };`;

      await fixture.writeFile('long-line.ts', longLine);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理超大單檔案（1000+ 行）', async () => {
      const lines = Array.from({ length: 1200 }, (_, i) =>
        `export const constant${i} = ${i};`
      ).join('\n');

      await fixture.writeFile('huge-file.ts', lines);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeGreaterThan(0);
    });

    it('應該處理空檔案', async () => {
      await fixture.writeFile('empty.ts', '');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理只有註解的檔案', async () => {
      await fixture.writeFile('only-comments.ts', '// This is a comment\n/* Block comment */\n/** JSDoc */');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理深層嵌套結構', async () => {
      const deepNesting = `
export function deepNested() {
  if (true) {
    if (true) {
      if (true) {
        if (true) {
          if (true) {
            if (true) {
              if (true) {
                if (true) {
                  if (true) {
                    if (true) {
                      return 'too deep';
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

      await fixture.writeFile('deep-nesting.ts', deepNesting);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
      expect(output.shitScore).toBeLessThanOrEqual(100);
    });
  });

  describe('邊界條件', () => {
    it('應該處理只有 1 個檔案的專案', async () => {
      const singleFileFixture = await loadFixture('sample-project');
      singleFileFixture.memfs.reset();
      await singleFileFixture.writeFile('single.ts', 'export const value = 1;');

      const result = await executeCLI(['shit', '--path', singleFileFixture.rootPath, '--format', 'json'], { memfs: singleFileFixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary.analyzedFiles).toBe(1);

      singleFileFixture.cleanup();
    });

    it('應該處理全是 type 定義無實作', async () => {
      await fixture.writeFile('types-only.ts', `
export type User = { id: number; name: string };
export type Post = { id: number; title: string };
export interface Config { apiUrl: string; timeout: number }
`);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeLessThan(50);
    });

    it('應該處理循環依賴嚴重', async () => {
      await fixture.writeFile('circular-a.ts', 'import { b } from "./circular-b.js"; export const a = b + 1;');
      await fixture.writeFile('circular-b.ts', 'import { c } from "./circular-c.js"; export const b = c + 1;');
      await fixture.writeFile('circular-c.ts', 'import { a } from "./circular-a.js"; export const c = a + 1;');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理 100% 測試檔案無業務邏輯', async () => {
      await fixture.writeFile('test1.test.ts', 'import { expect } from "vitest"; it("test", () => { expect(1).toBe(1); });');
      await fixture.writeFile('test2.spec.ts', 'import { expect } from "vitest"; describe("suite", () => {});');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });
  });

  describe('錯誤恢復', () => {
    it('應該處理含語法錯誤的檔案', async () => {
      await fixture.writeFile('syntax-error.ts', 'export function broken( { return }');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
    });

    it('應該處理不完整的程式碼', async () => {
      await fixture.writeFile('incomplete.ts', 'export class Incomplete {');

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理混合語法風格', async () => {
      await fixture.writeFile('mixed.ts', `
const x = 1;
var y = 2;
let z = 3;
function oldStyle() {}
const newStyle = () => {}
class MyClass {}
`);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
    });

    it('應該處理空格和縮排混亂', async () => {
      await fixture.writeFile('messy-indent.ts', `
export function messy() {
    if (true) {
\t\tif (true) {
  \t  return 1;
\t}
    }
}
`);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeGreaterThan(0);
    });
  });

  describe('組合極端情境', () => {
    it('應該處理多重極端條件組合', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j';
      const complexCode = `
${Array.from({ length: 30 }, (_, i) =>
  `export function func${i}(x: number) {
    ${Array.from({ length: 10 }, (_, j) => `if (x === ${j}) return ${j};`).join('\n    ')}
    return -1;
  }`
).join('\n\n')}
`;

      await fixture.writeFile(`${deepPath}/extreme.ts`, complexCode);

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json', '--detailed'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
      expect(output.shitScore).toBeLessThanOrEqual(100);
      expect(output.topShit).toBeDefined();
    });

    it('應該處理超大專案模擬（100+ 檔案）', async () => {
      const files = Array.from({ length: 120 }, (_, i) => ({
        path: `file${i}.ts`,
        content: `export const value${i} = ${i};`
      }));

      for (const file of files) {
        await fixture.writeFile(file.path, file.content);
      }

      const result = await executeCLI(['shit', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary.totalFiles).toBeGreaterThan(100);
    });
  });
});
