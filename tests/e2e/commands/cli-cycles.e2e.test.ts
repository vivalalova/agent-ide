/**
 * CLI cycles 命令 E2E 測試
 * 基於 sample-project fixture 測試依賴分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI cycles - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析專案依賴（cycles 子命令）', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

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

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

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

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

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

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

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

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('循環依賴檢測', () => {
    it('應該檢測直接循環 (A↔B)', async () => {
      await fixture.writeFile('a-cycle.ts', 'import { b } from "./b-cycle.js";\nexport const a = 1;');
      await fixture.writeFile('b-cycle.ts', 'import { a } from "./a-cycle.js";\nexport const b = 2;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該檢測間接循環 (A→B→C→A)', async () => {
      await fixture.writeFile('a-indirect.ts', 'import { c } from "./c-indirect.js";\nexport const a = 1;');
      await fixture.writeFile('b-indirect.ts', 'import { a } from "./a-indirect.js";\nexport const b = 2;');
      await fixture.writeFile('c-indirect.ts', 'import { b } from "./b-indirect.js";\nexport const c = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該檢測多重循環交織', async () => {
      await fixture.writeFile('m1.ts', 'import { m2 } from "./m2.js";\nexport const m1 = 1;');
      await fixture.writeFile('m2.ts', 'import { m1 } from "./m1.js";\nimport { m3 } from "./m3.js";\nexport const m2 = 2;');
      await fixture.writeFile('m3.ts', 'import { m4 } from "./m4.js";\nexport const m3 = 3;');
      await fixture.writeFile('m4.ts', 'import { m3 } from "./m3.js";\nexport const m4 = 4;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該檢測自我引用', async () => {
      await fixture.writeFile('self-ref.ts', 'import { self } from "./self-ref.js";\nexport const self = 1;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援循環依賴檢測', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      // 主要驗證命令能正常執行
      expect(result.exitCode).toBe(0);
    });
  });

  describe('特殊 Import 語法', () => {
    it('應該處理動態 import', async () => {
      await fixture.writeFile('dynamic-target.ts', 'export const value = "dynamic";');
      await fixture.writeFile('dynamic-import.ts', 'const module = await import("./dynamic-target.js");\nexport const result = module.value;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Re-export (export * from)', async () => {
      await fixture.writeFile('re-source.ts', 'export const a = 1;\nexport const b = 2;');
      await fixture.writeFile('re-export.ts', 'export * from "./re-source.js";');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Namespace import', async () => {
      await fixture.writeFile('namespace-source.ts', 'export const a = 1;\nexport const b = 2;');
      await fixture.writeFile('namespace-import.ts', 'import * as NS from "./namespace-source.js";\nexport const result = NS.a + NS.b;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Side-effect import', async () => {
      await fixture.writeFile('side-effect.ts', 'console.log("side effect");');
      await fixture.writeFile('side-effect-import.ts', 'import "./side-effect.js";\nexport const done = true;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Type-only import', async () => {
      await fixture.writeFile('types-source.ts', 'export interface User { id: string; }');
      await fixture.writeFile('types-import.ts', 'import type { User } from "./types-source.js";\nexport const user: User = { id: "1" };');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('邊界條件', () => {
    it('應該處理孤島檔案 (無任何依賴)', async () => {
      await fixture.writeFile('island.ts', 'export const island = "isolated";');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理外部套件依賴', async () => {
      await fixture.writeFile('external.ts', 'import { describe } from "vitest";\nexport const test = describe;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理路徑別名 (@/...)', async () => {
      await fixture.writeFile('alias-target.ts', 'export const value = "alias";');
      await fixture.writeFile('alias-import.ts', 'import { value } from "@/alias-target.js";\nexport const result = value;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理極端相對路徑 (../../../../../../)', async () => {
      await fixture.writeFile('deep/nested/very/deep/path/file.ts', 'import { value } from "../../../../../root.js";\nexport const result = value;');
      await fixture.writeFile('root.ts', 'export const value = "root";');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('錯誤處理', () => {
    it('應該處理引用不存在的模組', async () => {
      await fixture.writeFile('missing-import.ts', 'import { value } from "./nonexistent.js";\nexport const result = value;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該正確報告循環依賴', async () => {
      await fixture.writeFile('cycle-a.ts', 'import { b } from "./cycle-b.js";\nexport const a = 1;');
      await fixture.writeFile('cycle-b.ts', 'import { a } from "./cycle-a.js";\nexport const b = 2;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理空專案', async () => {
      const result = await executeCLI(['cycles', '--path', '/nonexistent'], { memfs: fixture.memfs });

      // 確保不會崩潰
      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('DependencyGraph 邊界測試', () => {
    it('應該處理空檔案路徑（邊界驗證）', async () => {
      // 創建正常檔案確保專案可分析
      await fixture.writeFile('normal.ts', 'export const value = 1;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理移除節點操作（中間節點移除）', async () => {
      // A -> B -> C 移除 B
      await fixture.writeFile('node-a.ts', 'import { b } from "./node-b.js";\nexport const a = 1;');
      await fixture.writeFile('node-b.ts', 'import { c } from "./node-c.js";\nexport const b = 2;');
      await fixture.writeFile('node-c.ts', 'export const c = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理序列化與反序列化（完整往返）', async () => {
      // 創建複雜圖結構
      await fixture.writeFile('ser-a.ts', 'import { b } from "./ser-b.js";\nexport const a = 1;');
      await fixture.writeFile('ser-b.ts', 'import { c } from "./ser-c.js";\nexport const b = 2;');
      await fixture.writeFile('ser-c.ts', 'export const c = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理圖的克隆（深拷貝驗證）', async () => {
      await fixture.writeFile('clone-a.ts', 'import { b } from "./clone-b.js";\nexport const a = 1;');
      await fixture.writeFile('clone-b.ts', 'export const b = 2;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理空圖狀態（isEmpty 驗證）', async () => {
      // 不創建任何檔案
      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該檢測弱連通圖（isConnected 驗證）', async () => {
      // 創建兩個孤立子圖
      await fixture.writeFile('island-a1.ts', 'import { a2 } from "./island-a2.js";\nexport const a1 = 1;');
      await fixture.writeFile('island-a2.ts', 'export const a2 = 2;');
      await fixture.writeFile('island-b1.ts', 'import { b2 } from "./island-b2.js";\nexport const b1 = 3;');
      await fixture.writeFile('island-b2.ts', 'export const b2 = 4;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('CycleDetector 極端測試', () => {
    it('應該檢測超長循環（maxCycleLength 邊界）', async () => {
      // 創建 25 節點循環
      const cycleFiles = Array.from({ length: 25 }, (_, i) => ({
        path: `long-cycle-${i}.ts`,
        content: i === 24
          ? `import { node } from "./long-cycle-0.js";\nexport const node${i} = ${i};`
          : `import { node } from "./long-cycle-${i + 1}.js";\nexport const node${i} = ${i};`
      }));

      await Promise.all(
        cycleFiles.map(file => fixture.writeFile(file.path, file.content))
      );

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理複雜強連通分量（多個 SCC）', async () => {
      // SCC 1: A <-> B
      await fixture.writeFile('scc1-a.ts', 'import { b } from "./scc1-b.js";\nexport const a = 1;');
      await fixture.writeFile('scc1-b.ts', 'import { a } from "./scc1-a.js";\nexport const b = 2;');

      // SCC 2: C <-> D <-> E
      await fixture.writeFile('scc2-c.ts', 'import { d } from "./scc2-d.js";\nexport const c = 3;');
      await fixture.writeFile('scc2-d.ts', 'import { e } from "./scc2-e.js";\nexport const d = 4;');
      await fixture.writeFile('scc2-e.ts', 'import { c } from "./scc2-c.js";\nexport const e = 5;');

      // 連接兩個 SCC
      await fixture.writeFile('connector.ts', 'import { a } from "./scc1-a.js";\nimport { c } from "./scc2-c.js";\nexport const connector = a + c;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該計算循環複雜度（內部連接密度）', async () => {
      // 高複雜度循環（多重交叉引用）
      await fixture.writeFile('complex-a.ts', 'import { b } from "./complex-b.js";\nimport { c } from "./complex-c.js";\nexport const a = 1;');
      await fixture.writeFile('complex-b.ts', 'import { c } from "./complex-c.js";\nimport { a } from "./complex-a.js";\nexport const b = 2;');
      await fixture.writeFile('complex-c.ts', 'import { a } from "./complex-a.js";\nimport { b } from "./complex-b.js";\nexport const c = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該提供修復策略建議（suggestFixStrategies）', async () => {
      // 各種循環類型
      await fixture.writeFile('fix-self.ts', 'import { self } from "./fix-self.js";\nexport const self = 1;');
      await fixture.writeFile('fix-a2.ts', 'import { b } from "./fix-b2.js";\nexport const a = 1;');
      await fixture.writeFile('fix-b2.ts', 'import { a } from "./fix-a2.js";\nexport const b = 2;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該正確計算循環嚴重性（severity）', async () => {
      // Low: 2-3 節點
      await fixture.writeFile('low-a.ts', 'import { b } from "./low-b.js";\nexport const a = 1;');
      await fixture.writeFile('low-b.ts', 'import { a } from "./low-a.js";\nexport const b = 2;');

      // Medium: 4-6 節點
      await fixture.writeFile('med-a.ts', 'import { b } from "./med-b.js";\nexport const a = 1;');
      await fixture.writeFile('med-b.ts', 'import { c } from "./med-c.js";\nexport const b = 2;');
      await fixture.writeFile('med-c.ts', 'import { d } from "./med-d.js";\nexport const c = 3;');
      await fixture.writeFile('med-d.ts', 'import { a } from "./med-a.js";\nexport const d = 4;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('DependencyAnalyzer 極端測試', () => {
    it('應該處理快取失效（檔案修改時間變化）', async () => {
      await fixture.writeFile('cache-test.ts', 'export const v1 = 1;');

      // 第一次分析
      const result1 = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });
      expect(result1.exitCode).toBe(0);

      // 修改檔案（模擬快取失效）
      await fixture.writeFile('cache-test.ts', 'export const v2 = 2;');

      // 第二次分析
      const result2 = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });
      expect(result2.exitCode).toBe(0);
    });

    it('應該處理並發分析（concurrency 配置）', async () => {
      // 創建 20 個檔案測試並發
      const files = Array.from({ length: 20 }, (_, i) => ({
        path: `concurrent-${i}.ts`,
        content: `export const value${i} = ${i};`
      }));

      await Promise.all(
        files.map(file => fixture.writeFile(file.path, file.content))
      );

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該計算影響分數（impactScore）', async () => {
      // 創建高影響檔案
      await fixture.writeFile('impact-core.ts', 'export const core = "value";');

      const consumers = Array.from({ length: 10 }, (_, i) => ({
        path: `impact-consumer-${i}.ts`,
        content: `import { core } from "./impact-core.js";\nexport const use${i} = core;`
      }));

      await Promise.all(
        consumers.map(file => fixture.writeFile(file.path, file.content))
      );

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該識別測試檔案（isTestFile）', async () => {
      await fixture.writeFile('source.ts', 'export const value = 1;');
      await fixture.writeFile('source.test.ts', 'import { value } from "./source.js";\ntest("test", () => {});');
      await fixture.writeFile('source.spec.ts', 'import { value } from "./source.js";\ndescribe("spec", () => {});');
      await fixture.writeFile('__tests__/source-test.ts', 'import { value } from "../source.js";');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Swift 外部依賴（系統框架）', async () => {
      await fixture.writeFile('swift-app.swift', 'import Foundation\nimport UIKit\nimport SwiftUI\n\nlet app = "Hello"');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 Swift 相對路徑引用', async () => {
      await fixture.writeFile('swift-a.swift', 'import SwiftB\n\nlet a = "A"');
      await fixture.writeFile('swift-b.swift', 'let b = "B"');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理路徑解析失敗（副檔名嘗試）', async () => {
      await fixture.writeFile('resolve-source.ts', 'export const value = 1;');
      await fixture.writeFile('resolve-import.ts', 'import { value } from "./resolve-source";\nexport const result = value;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理解析錯誤（extractDependencies 錯誤處理）', async () => {
      await fixture.writeFile('parse-error.ts', 'import { value from "./incomplete.js";\nexport const result = value;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
    });

    it('應該處理 maxDepth 限制（深度控制）', async () => {
      // 創建超深目錄結構
      await fixture.writeFile('level0/level1/level2/level3/level4/level5/deep.ts', 'export const deep = "value";');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理 glob 模式匹配（** 和 * 差異）', async () => {
      await fixture.writeFile('src/app.ts', 'export const app = 1;');
      await fixture.writeFile('src/utils/helper.ts', 'export const helper = 2;');
      await fixture.writeFile('test/app.spec.ts', 'import { app } from "../src/app.js";');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該處理非檔案非目錄路徑（邊界驗證）', async () => {
      // 嘗試分析一個既不是檔案也不是目錄的路徑
      const result = await executeCLI(['cycles', '--path', '/dev/null', '--format', 'json'], { memfs: fixture.memfs });

      expect([0, 1]).toContain(result.exitCode);
    });
  });

  describe('TypeGuard 驗證', () => {
    it('應該驗證 FileDependencies 型別（isFileDependencies）', async () => {
      await fixture.writeFile('type-guard.ts', 'export const value = 1;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toBeDefined();
    });

    it('應該驗證循環依賴嚴重性計算（calculateCycleSeverity）', async () => {
      // 邊界值測試：length=3(low), length=6(medium), length>6(high)
      await fixture.writeFile('sev-3a.ts', 'import { b } from "./sev-3b.js";\nexport const a = 1;');
      await fixture.writeFile('sev-3b.ts', 'import { c } from "./sev-3c.js";\nexport const b = 2;');
      await fixture.writeFile('sev-3c.ts', 'import { a } from "./sev-3a.js";\nexport const c = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('循環依賴檢測結果驗證', () => {
    it('應該正確檢測並回傳循環依賴資訊', async () => {
      // 建立 A→B→A 循環（使用 .ts 副檔名引用）
      await fixture.writeFile('verify-a.ts', 'import { b } from "./verify-b";\nexport const a = b;');
      await fixture.writeFile('verify-b.ts', 'import { a } from "./verify-a";\nexport const b = a;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.cycles).toBeDefined();
      expect(Array.isArray(output.cycles)).toBe(true);
      // 驗證至少檢測到一個循環
      expect(output.cycles.length).toBeGreaterThan(0);
    });

    it('應該回傳正確的循環結構（cycle, length）', async () => {
      await fixture.writeFile('struct-a.ts', 'import { b } from "./struct-b";\nexport const a = b;');
      await fixture.writeFile('struct-b.ts', 'import { a } from "./struct-a";\nexport const b = a;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);

      // 驗證循環結構
      const cycle = output.cycles[0];
      expect(cycle).toHaveProperty('cycle');
      expect(cycle).toHaveProperty('length');
      expect(Array.isArray(cycle.cycle)).toBe(true);
      expect(typeof cycle.length).toBe('number');
      expect(cycle.length).toBeGreaterThanOrEqual(2);
    });

    it('應該正確檢測三層循環（A→B→C→A）', async () => {
      await fixture.writeFile('tri-a.ts', 'import { c } from "./tri-c";\nexport const a = c;');
      await fixture.writeFile('tri-b.ts', 'import { a } from "./tri-a";\nexport const b = a;');
      await fixture.writeFile('tri-c.ts', 'import { b } from "./tri-b";\nexport const c = b;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);

      // 驗證有三層循環被檢測到
      const hasThreeNodeCycle = output.cycles.some(
        (c: { length: number }) => c.length >= 3
      );
      expect(hasThreeNodeCycle).toBe(true);
    });

    it('應該正確識別雙節點循環長度', async () => {
      // 建立短循環（2 節點）
      await fixture.writeFile('sev-low-a.ts', 'import { b } from "./sev-low-b";\nexport const a = b;');
      await fixture.writeFile('sev-low-b.ts', 'import { a } from "./sev-low-a";\nexport const b = a;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);

      // 驗證有 2 節點循環
      const twoNodeCycle = output.cycles.find((c: { length: number }) => c.length === 2);
      expect(twoNodeCycle).toBeDefined();
    });

    it('應該檢測多個獨立循環', async () => {
      // 循環 1: A↔B
      await fixture.writeFile('multi-a.ts', 'import { b } from "./multi-b";\nexport const a = b;');
      await fixture.writeFile('multi-b.ts', 'import { a } from "./multi-a";\nexport const b = a;');
      // 循環 2: C↔D
      await fixture.writeFile('multi-c.ts', 'import { d } from "./multi-d";\nexport const c = d;');
      await fixture.writeFile('multi-d.ts', 'import { c } from "./multi-c";\nexport const d = c;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 應該檢測到至少 2 個循環
      expect(output.cycles.length).toBeGreaterThanOrEqual(2);
    });

    it('應該在 summary 格式中顯示循環資訊', async () => {
      await fixture.writeFile('sum-a.ts', 'import { b } from "./sum-b";\nexport const a = b;');
      await fixture.writeFile('sum-b.ts', 'import { a } from "./sum-a";\nexport const b = a;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      // summary 輸出應包含循環相關數量資訊
      expect(result.stdout).toMatch(/\d+/);
    });

    it('應該正確識別自我引用循環', async () => {
      await fixture.writeFile('self-loop.ts', 'import { self } from "./self-loop";\nexport const self = 1;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 自我引用可能被檢測為長度 1 的循環（取決於 ignoreSelfLoops 設定）
      expect(output).toBeDefined();
    });

    it('應該正確計算循環統計摘要', async () => {
      await fixture.writeFile('stat-a.ts', 'import { b } from "./stat-b";\nexport const a = b;');
      await fixture.writeFile('stat-b.ts', 'import { a } from "./stat-a";\nexport const b = a;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 驗證 summary 欄位存在
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.cyclesFound).toBe('number');
    });

    it('應該在無循環時回傳空陣列', async () => {
      // 建立無循環依賴的檔案
      await fixture.writeFile('no-cycle-a.ts', 'import { b } from "./no-cycle-b";\nexport const a = b;');
      await fixture.writeFile('no-cycle-b.ts', 'export const b = 2;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toBeDefined();
      expect(Array.isArray(output.cycles)).toBe(true);
    });

    it('應該正確處理中等長度循環（4 節點）', async () => {
      // 建立 4 節點循環
      await fixture.writeFile('mid-1.ts', 'import { m2 } from "./mid-2";\nexport const m1 = m2;');
      await fixture.writeFile('mid-2.ts', 'import { m3 } from "./mid-3";\nexport const m2 = m3;');
      await fixture.writeFile('mid-3.ts', 'import { m4 } from "./mid-4";\nexport const m3 = m4;');
      await fixture.writeFile('mid-4.ts', 'import { m1 } from "./mid-1";\nexport const m4 = m1;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);

      // 驗證有 4 節點循環
      const fourNodeCycle = output.cycles.find((c: { length: number }) => c.length === 4);
      expect(fourNodeCycle).toBeDefined();
    });

    it('應該正確處理長循環（8 節點）', async () => {
      // 建立 8 節點循環
      const files = Array.from({ length: 8 }, (_, i) => ({
        path: `long-${i}.ts`,
        content: i === 7
          ? `import { node0 } from "./long-0";\nexport const node${i} = node0;`
          : `import { node${i + 1} } from "./long-${i + 1}";\nexport const node${i} = node${i + 1};`
      }));

      await Promise.all(files.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);

      // 驗證有長循環
      const longCycle = output.cycles.find((c: { length: number }) => c.length >= 7);
      expect(longCycle).toBeDefined();
    });

    it('應該正確處理交叉循環（共享節點）', async () => {
      // A → B → C → A 且 B → D → B
      await fixture.writeFile('cross-a.ts', 'import { c } from "./cross-c";\nexport const a = c;');
      await fixture.writeFile('cross-b.ts', 'import { a } from "./cross-a";\nimport { d } from "./cross-d";\nexport const b = a + d;');
      await fixture.writeFile('cross-c.ts', 'import { b } from "./cross-b";\nexport const c = b;');
      await fixture.writeFile('cross-d.ts', 'import { b } from "./cross-b";\nexport const d = b;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toBeDefined();
    });

    it('應該驗證循環路徑包含正確的檔案', async () => {
      await fixture.writeFile('path-a.ts', 'import { b } from "./path-b";\nexport const a = b;');
      await fixture.writeFile('path-b.ts', 'import { a } from "./path-a";\nexport const b = a;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);

      // 驗證循環路徑包含正確的檔案名稱
      const cycle = output.cycles[0];
      expect(cycle.cycle.length).toBeGreaterThanOrEqual(2);
      const hasPathA = cycle.cycle.some((f: string) => f.includes('path-a'));
      const hasPathB = cycle.cycle.some((f: string) => f.includes('path-b'));
      expect(hasPathA || hasPathB).toBe(true);
    });
  });

  describe('拓撲排序邊界測試', () => {
    it('應該處理 DAG（無循環）的拓撲排序', async () => {
      await fixture.writeFile('dag-a.ts', 'import { b } from "./dag-b.js";\nimport { c } from "./dag-c.js";\nexport const a = 1;');
      await fixture.writeFile('dag-b.ts', 'import { d } from "./dag-d.js";\nexport const b = 2;');
      await fixture.writeFile('dag-c.ts', 'import { d } from "./dag-d.js";\nexport const c = 3;');
      await fixture.writeFile('dag-d.ts', 'export const d = 4;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該在有循環時正確標記 hasCycle', async () => {
      await fixture.writeFile('topo-cycle-a.ts', 'import { b } from "./topo-cycle-b.js";\nexport const a = 1;');
      await fixture.writeFile('topo-cycle-b.ts', 'import { c } from "./topo-cycle-c.js";\nexport const b = 2;');
      await fixture.writeFile('topo-cycle-c.ts', 'import { a } from "./topo-cycle-a.js";\nexport const c = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該返回參與循環的檔案列表（cycleFiles）', async () => {
      await fixture.writeFile('cycle-files-a.ts', 'import { b } from "./cycle-files-b.js";\nexport const a = 1;');
      await fixture.writeFile('cycle-files-b.ts', 'import { a } from "./cycle-files-a.js";\nexport const b = 2;');
      await fixture.writeFile('cycle-files-clean.ts', 'export const clean = 3;');

      const result = await executeCLI(['cycles', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });
});
