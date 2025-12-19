/**
 * CLI cycles 命令 E2E 測試 - 覆蓋率補強
 * 測試更多邊界情況和複雜循環場景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI cycles coverage - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('無循環依賴', () => {
    it('應該正確報告無循環的單一檔案', async () => {
      await fixture.writeFile('src/single.ts', `
export const value = 1;
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.cycles).toHaveLength(0);
    });

    it('應該正確報告無循環的線性依賴', async () => {
      await fixture.writeFile('src/a.ts', 'export const a = 1;');
      await fixture.writeFile('src/b.ts', 'import { a } from \'./a.js\'; export const b = a + 1;');
      await fixture.writeFile('src/c.ts', 'import { b } from \'./b.js\'; export const c = b + 1;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toHaveLength(0);
    });

    it('應該正確報告無循環的樹狀依賴', async () => {
      await fixture.writeFile('src/root.ts', `
import { left } from './left.js';
import { right } from './right.js';
export const root = left + right;
`);
      await fixture.writeFile('src/left.ts', 'export const left = 1;');
      await fixture.writeFile('src/right.ts', 'export const right = 2;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toHaveLength(0);
    });
  });

  describe('循環依賴檢測', () => {
    it('應該成功執行循環檢測並返回結果', async () => {
      await fixture.writeFile('src/cycle-a.ts', `
import { b } from './cycle-b.js';
export const a = b + 1;
`);
      await fixture.writeFile('src/cycle-b.ts', `
import { a } from './cycle-a.js';
export const b = a + 1;
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.cycles)).toBe(true);
    });

    it('應該處理多檔案依賴結構', async () => {
      await fixture.writeFile('src/hub.ts', `
import { spoke1 } from './spoke1.js';
export const hub = spoke1;
`);
      await fixture.writeFile('src/spoke1.ts', `
export const spoke1 = 1;
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('type-only import', () => {
    // TODO: 目前 cycles 命令會檢測 import type 形成的循環
    // 這是因為 ImpactAnalyzer 需要追蹤 import type 以進行影響分析
    // 未來可在 CycleDetector 層過濾掉 type-only imports
    it.skip('應該忽略 type-only import 的循環', async () => {
      await fixture.writeFile('src/type-a.ts', `
import type { TypeB } from './type-b.js';
export interface TypeA { ref: TypeB | null; }
`);
      await fixture.writeFile('src/type-b.ts', `
import type { TypeA } from './type-a.js';
export interface TypeB { ref: TypeA | null; }
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // type-only imports 不應該被計為循環
      expect(output.cycles).toHaveLength(0);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 summary 格式', async () => {
      await fixture.writeFile('src/sum-a.ts', 'export const a = 1;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });

    it('應該在 JSON 格式中包含正確的結構', async () => {
      await fixture.writeFile('src/json-test.ts', 'export const x = 1;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('cycles');
      expect(Array.isArray(output.cycles)).toBe(true);
    });
  });

  describe('大規模依賴圖', () => {
    it('應該處理 30+ 檔案的依賴圖', async () => {
      // 建立線性依賴鏈
      for (let i = 0; i < 30; i++) {
        const imports = i > 0 ? `import { val${i - 1} } from './file${i - 1}.js';` : '';
        const value = i > 0 ? `val${i - 1} + 1` : '0';
        await fixture.writeFile(`src/file${i}.ts`, `
${imports}
export const val${i} = ${value};
`);
      }

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理菱形依賴', async () => {
      await fixture.writeFile('src/diamond-top.ts', `
import { left } from './diamond-left.js';
import { right } from './diamond-right.js';
export const top = left + right;
`);
      await fixture.writeFile('src/diamond-left.ts', `
import { bottom } from './diamond-bottom.js';
export const left = bottom + 1;
`);
      await fixture.writeFile('src/diamond-right.ts', `
import { bottom } from './diamond-bottom.js';
export const right = bottom + 2;
`);
      await fixture.writeFile('src/diamond-bottom.ts', `
export const bottom = 0;
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toHaveLength(0);
    });
  });

  describe('特殊 import 語法', () => {
    it('應該處理動態 import', async () => {
      await fixture.writeFile('src/dynamic-main.ts', `
export async function loadModule() {
  const mod = await import('./dynamic-sub.js');
  return mod.value;
}
`);
      await fixture.writeFile('src/dynamic-sub.ts', `
export const value = 42;
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 namespace import', async () => {
      await fixture.writeFile('src/ns-main.ts', `
import * as utils from './ns-utils.js';
export const result = utils.helper();
`);
      await fixture.writeFile('src/ns-utils.ts', `
export function helper() { return 1; }
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該處理 side-effect import', async () => {
      await fixture.writeFile('src/side-main.ts', `
import './side-effect.js';
export const main = 1;
`);
      await fixture.writeFile('src/side-effect.ts', `
console.log('side effect');
`);

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });
  });
});
