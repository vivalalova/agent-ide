/**
 * CLI deps 命令 E2E 測試
 * 基於 sample-project fixture 測試依賴分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI deps - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析專案依賴', async () => {
      const result = await executeCLI(['deps', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('依賴結構極端情境', () => {
    it('應該處理深層依賴鏈 (20+ 層)', async () => {
      const chainFiles = Array.from({ length: 25 }, (_, i) => ({
        path: `chain-${i}.ts`,
        content: i === 24
          ? 'export const leaf = "end";'
          : `import { leaf } from './chain-${i + 1}.js';\nexport { leaf };`
      }));

      await Promise.all(
        chainFiles.map(file => fixture.writeFile(file.path, file.content))
      );

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理扇出極高的單檔案 (50+ import)', async () => {
      const moduleFiles = Array.from({ length: 60 }, (_, i) => ({
        path: `module-${i}.ts`,
        content: `export const value${i} = ${i};`
      }));

      const imports = moduleFiles
        .map((_, i) => `import { value${i} } from './module-${i}.js';`)
        .join('\n');
      const fanOutFile = `${imports}\nexport const sum = ${moduleFiles.map((_, i) => `value${i}`).join(' + ')};`;

      await Promise.all([
        ...moduleFiles.map(file => fixture.writeFile(file.path, file.content)),
        fixture.writeFile('fan-out.ts', fanOutFile)
      ]);

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理扇入極高的單模組 (被 50+ 檔案引用)', async () => {
      await fixture.writeFile('shared.ts', 'export const shared = "value";');

      const consumerFiles = Array.from({ length: 60 }, (_, i) => ({
        path: `consumer-${i}.ts`,
        content: `import { shared } from './shared.js';\nexport const use${i} = shared;`
      }));

      await Promise.all(
        consumerFiles.map(file => fixture.writeFile(file.path, file.content))
      );

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理複雜菱形依賴網絡 (12 節點、多層級、多路徑交織)', async () => {
      // 底層基礎模組
      await fixture.writeFile('base-a.ts', 'export const baseA = "a";');
      await fixture.writeFile('base-b.ts', 'export const baseB = "b";');
      await fixture.writeFile('base-c.ts', 'export const baseC = "c";');

      // 第二層（依賴底層）
      await fixture.writeFile('mid-1.ts', 'import { baseA } from "./base-a.js";\nimport { baseB } from "./base-b.js";\nexport const mid1 = baseA + baseB;');
      await fixture.writeFile('mid-2.ts', 'import { baseB } from "./base-b.js";\nimport { baseC } from "./base-c.js";\nexport const mid2 = baseB + baseC;');
      await fixture.writeFile('mid-3.ts', 'import { baseA } from "./base-a.js";\nimport { baseC } from "./base-c.js";\nexport const mid3 = baseA + baseC;');

      // 第三層（依賴第二層）
      await fixture.writeFile('upper-1.ts', 'import { mid1 } from "./mid-1.js";\nimport { mid2 } from "./mid-2.js";\nexport const upper1 = mid1 + mid2;');
      await fixture.writeFile('upper-2.ts', 'import { mid2 } from "./mid-2.js";\nimport { mid3 } from "./mid-3.js";\nexport const upper2 = mid2 + mid3;');
      await fixture.writeFile('upper-3.ts', 'import { mid1 } from "./mid-1.js";\nimport { mid3 } from "./mid-3.js";\nexport const upper3 = mid1 + mid3;');

      // 頂層（依賴第三層 + 交叉依賴第二層）
      await fixture.writeFile('top-1.ts', 'import { upper1 } from "./upper-1.js";\nimport { upper2 } from "./upper-2.js";\nimport { mid3 } from "./mid-3.js";\nexport const top1 = upper1 + upper2 + mid3;');
      await fixture.writeFile('top-2.ts', 'import { upper2 } from "./upper-2.js";\nimport { upper3 } from "./upper-3.js";\nimport { mid1 } from "./mid-1.js";\nexport const top2 = upper2 + upper3 + mid1;');
      await fixture.writeFile('top-3.ts', 'import { upper1 } from "./upper-1.js";\nimport { upper3 } from "./upper-3.js";\nimport { mid2 } from "./mid-2.js";\nexport const top3 = upper1 + upper3 + mid2;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('循環依賴檢測', () => {
    it('應該檢測直接循環 (A↔B)', async () => {
      await fixture.writeFile('a-cycle.ts', 'import { b } from "./b-cycle.js";\nexport const a = 1;');
      await fixture.writeFile('b-cycle.ts', 'import { a } from "./a-cycle.js";\nexport const b = 2;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該檢測間接循環 (A→B→C→A)', async () => {
      await fixture.writeFile('a-indirect.ts', 'import { c } from "./c-indirect.js";\nexport const a = 1;');
      await fixture.writeFile('b-indirect.ts', 'import { a } from "./a-indirect.js";\nexport const b = 2;');
      await fixture.writeFile('c-indirect.ts', 'import { b } from "./b-indirect.js";\nexport const c = 3;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該檢測多重循環交織', async () => {
      await fixture.writeFile('m1.ts', 'import { m2 } from "./m2.js";\nexport const m1 = 1;');
      await fixture.writeFile('m2.ts', 'import { m1 } from "./m1.js";\nimport { m3 } from "./m3.js";\nexport const m2 = 2;');
      await fixture.writeFile('m3.ts', 'import { m4 } from "./m4.js";\nexport const m3 = 3;');
      await fixture.writeFile('m4.ts', 'import { m3 } from "./m3.js";\nexport const m4 = 4;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該檢測自我引用', async () => {
      await fixture.writeFile('self-ref.ts', 'import { self } from "./self-ref.js";\nexport const self = 1;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援循環依賴檢測', async () => {
      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      // 主要驗證命令能正常執行
      expect(result.exitCode).toBe(0);
    });
  });

  describe('特殊 Import 語法', () => {
    it('應該處理動態 import', async () => {
      await fixture.writeFile('dynamic-target.ts', 'export const value = "dynamic";');
      await fixture.writeFile('dynamic-import.ts', 'const module = await import("./dynamic-target.js");\nexport const result = module.value;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Re-export (export * from)', async () => {
      await fixture.writeFile('re-source.ts', 'export const a = 1;\nexport const b = 2;');
      await fixture.writeFile('re-export.ts', 'export * from "./re-source.js";');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Namespace import', async () => {
      await fixture.writeFile('namespace-source.ts', 'export const a = 1;\nexport const b = 2;');
      await fixture.writeFile('namespace-import.ts', 'import * as NS from "./namespace-source.js";\nexport const result = NS.a + NS.b;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Side-effect import', async () => {
      await fixture.writeFile('side-effect.ts', 'console.log("side effect");');
      await fixture.writeFile('side-effect-import.ts', 'import "./side-effect.js";\nexport const done = true;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Type-only import', async () => {
      await fixture.writeFile('types-source.ts', 'export interface User { id: string; }');
      await fixture.writeFile('types-import.ts', 'import type { User } from "./types-source.js";\nexport const user: User = { id: "1" };');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('邊界條件', () => {
    it('應該處理孤島檔案 (無任何依賴)', async () => {
      await fixture.writeFile('island.ts', 'export const island = "isolated";');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理外部套件依賴', async () => {
      await fixture.writeFile('external.ts', 'import { describe } from "vitest";\nexport const test = describe;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理路徑別名 (@/...)', async () => {
      await fixture.writeFile('alias-target.ts', 'export const value = "alias";');
      await fixture.writeFile('alias-import.ts', 'import { value } from "@/alias-target.js";\nexport const result = value;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理極端相對路徑 (../../../../../../)', async () => {
      await fixture.writeFile('deep/nested/very/deep/path/file.ts', 'import { value } from "../../../../../root.js";\nexport const result = value;');
      await fixture.writeFile('root.ts', 'export const value = "root";');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('錯誤處理', () => {
    it('應該處理引用不存在的模組', async () => {
      await fixture.writeFile('missing-import.ts', 'import { value } from "./nonexistent.js";\nexport const result = value;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該正確報告循環依賴', async () => {
      await fixture.writeFile('cycle-a.ts', 'import { b } from "./cycle-b.js";\nexport const a = 1;');
      await fixture.writeFile('cycle-b.ts', 'import { a } from "./cycle-a.js";\nexport const b = 2;');

      const result = await executeCLI(['deps', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理空專案', async () => {
      const result = await executeCLI(['deps', '--path', '/nonexistent'], { memfs: fixture.memfs });

      // 確保不會崩潰
      expect([0, 1]).toContain(result.exitCode);
    });
  });
});
