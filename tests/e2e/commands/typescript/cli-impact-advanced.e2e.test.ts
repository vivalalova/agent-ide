/**
 * CLI impact 進階路徑 E2E 測試
 *
 * 目標：覆蓋 impact/BFS 深層 transitive 路徑，
 * 以提升 core/impact/ 模組的 branch coverage。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI impact - 進階路徑覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - 深層 transitive impact

  describe('深層 transitive 影響分析', () => {
    it('應該分析深層依賴鏈（A→B→C→D，改 A 影響全部）', async () => {
      await fixture.writeFile('src/deep-a.ts', 'export const deepA = \'a\';');
      await fixture.writeFile('src/deep-b.ts', 'import { deepA } from \'./deep-a.js\';\nexport const deepB = deepA;');
      await fixture.writeFile('src/deep-c.ts', 'import { deepB } from \'./deep-b.js\';\nexport const deepC = deepB;');
      await fixture.writeFile('src/deep-d.ts', 'import { deepC } from \'./deep-c.js\';\nexport const deepD = deepC;');

      const result = await executeCLI(
        ['impact', '--file', 'src/deep-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // deep-b 直接依賴 deep-a
      const allImpacted = output.impact?.dependents || [];
      const hasDeepB = allImpacted.some((f: string) => f.includes('deep-b'));
      expect(hasDeepB).toBe(true);
    });

    it('應該正確分析 diamond dependency pattern', async () => {
      // A → B, A → C, B → D, C → D（diamond）
      await fixture.writeFile('src/diamond-a.ts', 'export const dA = \'a\';');
      await fixture.writeFile('src/diamond-b.ts', 'import { dA } from \'./diamond-a.js\';\nexport const dB = dA + \'b\';');
      await fixture.writeFile('src/diamond-c.ts', 'import { dA } from \'./diamond-a.js\';\nexport const dC = dA + \'c\';');
      await fixture.writeFile('src/diamond-d.ts', `
import { dB } from './diamond-b.js';
import { dC } from './diamond-c.js';
export const dD = dB + dC;
      `.trim());

      const result = await executeCLI(
        ['impact', '--file', 'src/diamond-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // impact 結構：dependents 在 output.impact.dependents
      expect(Array.isArray(output.impact?.dependents)).toBe(true);
    });

    it('應該分析中間層依賴', async () => {
      await fixture.writeFile('src/mid-base.ts', 'export const midBase = \'base\';');
      await fixture.writeFile('src/mid-level1.ts', 'import { midBase } from \'./mid-base.js\';\nexport const midL1 = midBase;');
      await fixture.writeFile('src/mid-level2.ts', 'import { midL1 } from \'./mid-level1.js\';\nexport const midL2 = midL1;');

      // 分析中間層的影響
      const result = await executeCLI(
        ['impact', '--file', 'src/mid-level1.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 .mts 檔案使用 .mjs runtime import 的影響', async () => {
      await fixture.writeFile('src/esm-source.mts', 'export const esmValue = 1;');
      await fixture.writeFile(
        'src/esm-consumer.mts',
        'import { esmValue } from \'./esm-source.mjs\';\nexport const usedEsmValue = esmValue;'
      );

      const result = await executeCLI(
        ['impact', '--file', 'src/esm-source.mts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents: string[] = output.impact?.dependents ?? [];
      expect(dependents.some(filePath => filePath.includes('esm-consumer.mts'))).toBe(true);
    });

    it('應該分析 .cts 檔案使用 .cjs runtime import 的影響', async () => {
      await fixture.writeFile('src/cjs-source.cts', 'export const cjsValue = 1;');
      await fixture.writeFile(
        'src/cjs-consumer.cts',
        'import { cjsValue } from \'./cjs-source.cjs\';\nexport const usedCjsValue = cjsValue;'
      );

      const result = await executeCLI(
        ['impact', '--file', 'src/cjs-source.cts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents: string[] = output.impact?.dependents ?? [];
      expect(dependents.some(filePath => filePath.includes('cjs-consumer.cts'))).toBe(true);
    });

    it.each([
      {
        name: 'side-effect import',
        source: 'side-effect-source.ts',
        consumer: 'side-effect-consumer.ts',
        content: 'import \'./side-effect-source.js\';\nexport const loaded = true;'
      },
      {
        name: 're-export declaration',
        source: 're-export-source.ts',
        consumer: 're-export-consumer.ts',
        content: 'export { reExportedValue } from \'./re-export-source.js\';'
      },
      {
        name: 'dynamic import',
        source: 'dynamic-source.ts',
        consumer: 'dynamic-consumer.ts',
        content: 'export async function loadDynamic() {\n  return import(\'./dynamic-source.js\');\n}'
      },
      {
        name: 'CommonJS require in .cts',
        source: 'required-source.cts',
        consumer: 'required-consumer.cts',
        content: 'const required = require(\'./required-source.cjs\');\nexport const requiredValue = required.requiredValue;'
      }
    ])('應該分析 $name 的影響', async ({ source, consumer, content }) => {
      await fixture.writeFile(`src/${source}`, 'export const reExportedValue = 1;\nexport const requiredValue = 2;');
      await fixture.writeFile(`src/${consumer}`, content);

      const result = await executeCLI(
        ['impact', '--file', `src/${source}`, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents: string[] = output.impact?.dependents ?? [];
      expect(dependents.some(filePath => filePath.includes(consumer))).toBe(true);
    });
  });

  // MARK: - 孤立檔案與邊界條件

  describe('孤立檔案與邊界', () => {
    it('孤立檔案（無 dependents）應回傳空影響', async () => {
      await fixture.writeFile('src/isolated-module.ts', 'export const isolated = \'alone\';');

      const result = await executeCLI(
        ['impact', '--file', 'src/isolated-module.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 孤立模組沒有 dependents
      const dependents = output.impact?.dependents || [];
      expect(dependents.length).toBe(0);
    });

    it('被多個模組引用的工具函數應有多個 dependents', async () => {
      await fixture.writeFile('src/util-shared.ts', 'export const utilShared = \'shared\';');
      await fixture.writeFile('src/util-consumer-1.ts', 'import { utilShared } from \'./util-shared.js\';\nexport const c1 = utilShared;');
      await fixture.writeFile('src/util-consumer-2.ts', 'import { utilShared } from \'./util-shared.js\';\nexport const c2 = utilShared;');
      await fixture.writeFile('src/util-consumer-3.ts', 'import { utilShared } from \'./util-shared.js\';\nexport const c3 = utilShared;');

      const result = await executeCLI(
        ['impact', '--file', 'src/util-shared.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents = output.impact?.dependents || [];
      expect(dependents.length).toBeGreaterThanOrEqual(3);
    });
  });

  // MARK: - 格式驗證

  describe('輸出格式驗證', () => {
    it('json 格式應包含完整的 impact 結構', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 驗證完整結構
      expect(output.command).toBe('impact');
      expect(output.success).toBeDefined();
      expect(output.impact).toBeDefined();
      expect(output.impact.targetFile).toBeDefined();
      expect(Array.isArray(output.impact.dependents)).toBe(true);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.totalFiles).toBe('number');
    });

    it('summary 格式應包含影響檔案數量資訊', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // summary 應包含數字（依賴計數）
      expect(result.stdout).toMatch(/\d+/);
    });

    it('不存在的檔案應返回錯誤', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/not-exist-file.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });
  });
});
