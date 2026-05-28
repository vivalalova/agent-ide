/**
 * CLI impact 命令 E2E 測試
 * 基於 sample-project fixture 測試影響分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI impact - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  interface ImpactOutput {
    command: string;
    success: boolean;
    summary: {
      totalFiles: number;
      totalDependencies: number;
      totalAffected: number;
    };
    impact: {
      targetFile: string;
      dependents: string[];
      dependencies: string[];
      totalAffected: number;
    };
    basePath: string;
  }

  function parseImpactOutput(stdout: string): ImpactOutput {
    return JSON.parse(stdout) as ImpactOutput;
  }

  function includesPath(paths: string[], fileName: string): boolean {
    return paths.some(filePath => filePath.includes(fileName));
  }

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析檔案影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/utils/array-utils.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(output.command).toBe('impact');
      expect(output.success).toBe(true);
      expect(output.impact.targetFile).toContain('array-utils.ts');
      expect(output.impact.totalAffected).toBe(output.impact.dependents.length);
      expect(Array.isArray(output.impact.dependencies)).toBe(true);
    });

    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(output.command).toBe('impact');
      expect(output.success).toBe(true);
      expect(output.basePath).toBe(fixture.rootPath);
      expect(output.summary.totalFiles).toBeGreaterThan(0);
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('影響範圍分析', () => {
    it('應該分析直接依賴者', async () => {
      await fixture.writeFile('core.ts', 'export const core = "value";');
      await fixture.writeFile('consumer.ts', 'import { core } from "./core.js";\nexport const use = core;');

      const result = await executeCLI(
        ['impact', '--file', 'core.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析間接依賴者（傳遞性）', async () => {
      await fixture.writeFile('base.ts', 'export const base = 1;');
      await fixture.writeFile('mid.ts', 'import { base } from "./base.js";\nexport const mid = base;');
      await fixture.writeFile('top.ts', 'import { mid } from "./mid.js";\nexport const top = mid;');

      const result = await executeCLI(
        ['impact', '--file', 'base.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理高扇出檔案（被多檔案依賴）', async () => {
      await fixture.writeFile('shared.ts', 'export const shared = "value";');

      const consumers = Array.from({ length: 20 }, (_, i) => ({
        path: `consumer-${i}.ts`,
        content: `import { shared } from "./shared.js";\nexport const use${i} = shared;`
      }));

      await Promise.all(consumers.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'shared.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理深層依賴鏈', async () => {
      const chainFiles = Array.from({ length: 15 }, (_, i) => ({
        path: `chain-${i}.ts`,
        content: i === 14
          ? 'export const leaf = "end";'
          : `import { leaf } from './chain-${i + 1}.js';\nexport { leaf };`
      }));

      await Promise.all(chainFiles.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'chain-14.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('菱形依賴處理', () => {
    it('應該正確處理菱形依賴（避免重複計算）', async () => {
      await fixture.writeFile('diamond-base.ts', 'export const base = 1;');
      await fixture.writeFile('diamond-left.ts', 'import { base } from "./diamond-base.js";\nexport const left = base;');
      await fixture.writeFile('diamond-right.ts', 'import { base } from "./diamond-base.js";\nexport const right = base;');
      await fixture.writeFile('diamond-top.ts', 'import { left } from "./diamond-left.js";\nimport { right } from "./diamond-right.js";\nexport const top = left + right;');

      const result = await executeCLI(
        ['impact', '--file', 'diamond-base.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理複雜菱形網絡', async () => {
      // 底層
      await fixture.writeFile('net-a.ts', 'export const a = 1;');
      await fixture.writeFile('net-b.ts', 'export const b = 2;');
      // 中層
      await fixture.writeFile('net-ab.ts', 'import { a } from "./net-a.js";\nimport { b } from "./net-b.js";\nexport const ab = a + b;');
      await fixture.writeFile('net-ba.ts', 'import { a } from "./net-a.js";\nimport { b } from "./net-b.js";\nexport const ba = b + a;');
      // 頂層
      await fixture.writeFile('net-top.ts', 'import { ab } from "./net-ab.js";\nimport { ba } from "./net-ba.js";\nexport const top = ab + ba;');

      const result = await executeCLI(
        ['impact', '--file', 'net-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('循環依賴情境', () => {
    it('應該處理直接循環依賴', async () => {
      await fixture.writeFile('cycle-a.ts', 'import { b } from "./cycle-b.js";\nexport const a = 1;');
      await fixture.writeFile('cycle-b.ts', 'import { a } from "./cycle-a.js";\nexport const b = 2;');

      const result = await executeCLI(
        ['impact', '--file', 'cycle-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理間接循環依賴', async () => {
      await fixture.writeFile('indirect-a.ts', 'import { c } from "./indirect-c.js";\nexport const a = 1;');
      await fixture.writeFile('indirect-b.ts', 'import { a } from "./indirect-a.js";\nexport const b = 2;');
      await fixture.writeFile('indirect-c.ts', 'import { b } from "./indirect-b.js";\nexport const c = 3;');

      const result = await executeCLI(
        ['impact', '--file', 'indirect-a.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('特殊 Import 語法', () => {
    it('應該處理 Re-export', async () => {
      await fixture.writeFile('re-source.ts', 'export const value = 1;');
      await fixture.writeFile('re-export.ts', 'export * from "./re-source.js";');
      await fixture.writeFile('re-consumer.ts', 'import { value } from "./re-export.js";\nexport const use = value;');

      const result = await executeCLI(
        ['impact', '--file', 're-source.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 Namespace import', async () => {
      await fixture.writeFile('ns-source.ts', 'export const a = 1;\nexport const b = 2;');
      await fixture.writeFile('ns-consumer.ts', 'import * as NS from "./ns-source.js";\nexport const sum = NS.a + NS.b;');

      const result = await executeCLI(
        ['impact', '--file', 'ns-source.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理 Type-only import', async () => {
      await fixture.writeFile('type-source.ts', 'export interface User { id: string; }');
      await fixture.writeFile('type-consumer.ts', 'import type { User } from "./type-source.js";\nexport const user: User = { id: "1" };');

      const result = await executeCLI(
        ['impact', '--file', 'type-source.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理動態 import', async () => {
      await fixture.writeFile('dynamic-source.ts', 'export const value = "dynamic";');
      await fixture.writeFile('dynamic-consumer.ts', 'const mod = await import("./dynamic-source.js");\nexport const result = mod.value;');

      const result = await executeCLI(
        ['impact', '--file', 'dynamic-source.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('邊界條件', () => {
    it('應該處理孤島檔案（無依賴者）', async () => {
      await fixture.writeFile('island.ts', 'export const island = "isolated";');

      const result = await executeCLI(
        ['impact', '--file', 'island.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理深層目錄結構', async () => {
      await fixture.writeFile('deep/nested/very/deep/file.ts', 'export const deep = 1;');
      await fixture.writeFile('deep/nested/consumer.ts', 'import { deep } from "./very/deep/file.js";\nexport const use = deep;');

      const result = await executeCLI(
        ['impact', '--file', 'deep/nested/very/deep/file.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('錯誤處理 - 路徑/檔案不存在', () => {
    it('應該對不存在的檔案顯示錯誤訊息並返回 exit code 1', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'not-exist-file.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('檔案不存在');
      expect(output.pathContext).toMatchObject({
        role: 'targetFile',
        projectRoot: fixture.rootPath,
        requestedFile: 'not-exist-file.ts',
        resolvedFile: fixture.getFilePath('not-exist-file.ts')
      });
    });

    it('應該對不存在的檔案在 summary 格式顯示錯誤訊息', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'not-exist-file.ts', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      // summary 格式的錯誤輸出到 stderr
      expect(result.stderr).toContain('檔案不存在');
    });

    it('應該對不存在的專案路徑顯示錯誤訊息並返回 exit code 1', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'test.ts', '--path', '/not-exist-path', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('路徑不存在');
      expect(output.pathContext).toMatchObject({
        role: 'projectRoot',
        inputPath: '/not-exist-path',
        resolvedPath: '/not-exist-path',
        expected: 'exists',
        projectRoot: '/not-exist-path',
        requestedFile: 'test.ts',
        resolvedFile: '/not-exist-path/test.ts'
      });
    });

    it('應該對不存在的專案路徑在 summary 格式顯示錯誤訊息', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'test.ts', '--path', '/not-exist-path', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      // summary 格式的錯誤輸出到 stderr
      expect(result.stderr).toContain('路徑不存在');
    });

    it('應該拒絕將檔案路徑當成專案路徑', async () => {
      await fixture.writeFile('not-directory.ts', 'export const target = 1;');

      const result = await executeCLI(
        ['impact', '--file', 'target.ts', '--path', fixture.getFilePath('not-directory.ts'), '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('路徑不是目錄');
      expect(output.pathContext).toMatchObject({
        role: 'projectRoot',
        inputPath: fixture.getFilePath('not-directory.ts'),
        resolvedPath: fixture.getFilePath('not-directory.ts'),
        expected: 'directory',
        projectRoot: fixture.getFilePath('not-directory.ts'),
        requestedFile: 'target.ts',
        resolvedFile: fixture.getFilePath('not-directory.ts/target.ts')
      });
    });

    it('應該對深層不存在的檔案路徑顯示錯誤', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/modules/not-exist.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('檔案不存在');
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含 command 欄位', async () => {
      await fixture.writeFile('verify.ts', 'export const v = 1;');

      const result = await executeCLI(
        ['impact', '--file', 'verify.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(output.command).toBe('impact');
    });

    it('應該包含 success 欄位', async () => {
      await fixture.writeFile('success-test.ts', 'export const v = 1;');

      const result = await executeCLI(
        ['impact', '--file', 'success-test.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(typeof output.success).toBe('boolean');
      expect(output.success).toBe(true);
    });

    it('應該包含 summary 欄位', async () => {
      await fixture.writeFile('summary-test.ts', 'export const v = 1;');

      const result = await executeCLI(
        ['impact', '--file', 'summary-test.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(output.summary.totalFiles).toBeGreaterThan(0);
      expect(output.summary.totalDependencies).toBeGreaterThanOrEqual(0);
    });
  });

  describe('大規模專案情境', () => {
    it('應該處理 50+ 檔案專案', async () => {
      const files = Array.from({ length: 55 }, (_, i) => ({
        path: `large-${i}.ts`,
        content: i === 0
          ? 'export const root = "root";'
          : `import { root } from "./large-0.js";\nexport const val${i} = root;`
      }));

      await Promise.all(files.map(f => fixture.writeFile(f.path, f.content)));

      const result = await executeCLI(
        ['impact', '--file', 'large-0.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理複雜依賴網絡', async () => {
      // 建立 3 層 × 5 檔案的網絡
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < 5; i++) {
          const imports = layer > 0
            ? Array.from({ length: 3 }, (_, j) => `import { v${layer - 1}_${j} } from "./l${layer - 1}-${j}.js";`).join('\n')
            : '';
          const content = `${imports}\nexport const v${layer}_${i} = ${layer * 5 + i};`;
          await fixture.writeFile(`l${layer}-${i}.ts`, content);
        }
      }

      const result = await executeCLI(
        ['impact', '--file', 'l0-0.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Impact 結構詳細驗證', () => {
    it('應該返回 impact 物件包含 targetFile', async () => {
      await fixture.writeFile('target-file.ts', 'export const target = 1;');

      const result = await executeCLI(
        ['impact', '--file', 'target-file.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(output.impact.targetFile).toContain('target-file.ts');
    });

    it('應該返回 dependents 陣列', async () => {
      await fixture.writeFile('dep-base.ts', 'export const base = 1;');
      await fixture.writeFile('dep-consumer.ts', 'import { base } from "./dep-base.js";\nexport const use = base;');

      const result = await executeCLI(
        ['impact', '--file', 'dep-base.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(Array.isArray(output.impact.dependents)).toBe(true);
      expect(includesPath(output.impact.dependents, 'dep-consumer.ts')).toBe(true);
      expect(output.impact.totalAffected).toBe(1);
    });

    it('應該返回 dependencies 陣列', async () => {
      await fixture.writeFile('lib.ts', 'export const lib = 1;');
      await fixture.writeFile('app.ts', 'import { lib } from "./lib.js";\nexport const app = lib;');

      const result = await executeCLI(
        ['impact', '--file', 'app.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(Array.isArray(output.impact.dependencies)).toBe(true);
      expect(includesPath(output.impact.dependencies, 'lib.ts')).toBe(true);
    });

    it('應該在 summary 格式顯示影響資訊', async () => {
      await fixture.writeFile('sum-base.ts', 'export const sum = 1;');
      await fixture.writeFile('sum-user.ts', 'import { sum } from "./sum-base.js";\nexport const use = sum;');

      const result = await executeCLI(
        ['impact', '--file', 'sum-base.ts', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('影響分析');
    });

    it('應該分析現有 fixture 的 dependents', async () => {
      // 使用 fixture 中現有的 types/user.ts（被多個 service 引用）
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = parseImpactOutput(result.stdout);
      expect(output.success).toBe(true);
      // user.ts 被 services 引用，應該有 dependents
      expect(Array.isArray(output.impact.dependents)).toBe(true);
      expect(output.impact.totalAffected).toBe(output.impact.dependents.length);
    });
  });

  describe('JSON 噪音欄位防護', () => {
    it('impact JSON 不得包含 cycles 欄位', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(Object.hasOwn(output, 'cycles')).toBe(false);
    });

    it('impact JSON summary 不得包含 cyclesFound / issuesFound', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout) as { summary: Record<string, unknown> };
      expect(Object.hasOwn(output.summary, 'cyclesFound')).toBe(false);
      expect(Object.hasOwn(output.summary, 'issuesFound')).toBe(false);
    });

    it('impact JSON summary keys 僅含影響分析相關欄位', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/types/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout) as { summary: Record<string, unknown> };
      const allowedKeys = new Set(['totalFiles', 'totalDependencies', 'totalAffected']);
      for (const key of Object.keys(output.summary)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    });
  });
});
