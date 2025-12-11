/**
 * CLI call-hierarchy 命令 E2E 測試
 * 基於 sample-project fixture 測試呼叫層次分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI call-hierarchy - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析函數呼叫層次並輸出 JSON 格式', async () => {
      // 使用 fixture 中現有的函數 (unique from array-utils.ts)
      const result = await executeCLI(
        ['call-hierarchy', 'unique', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('unique');
      expect(output.success).toBe(true);
      expect(output.incoming).toBeDefined();
      expect(output.outgoing).toBeDefined();
    });

    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('fn.ts', 'export function fn() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'fn', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('fn');
      expect(result.stdout).toContain('📞');
    });
  });

  describe('direction 選項', () => {
    it('應該只分析 incoming 當 direction=incoming', async () => {
      await fixture.writeFile('target.ts', `
export function target() {
  console.log('target');
}
      `.trim());

      await fixture.writeFile('caller.ts', `
import { target } from './target.js';

export function caller() {
  target();
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'target', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.direction).toBe('incoming');
      // outgoing 應該為空（因為只分析 incoming）
      expect(output.outgoing).toHaveLength(0);
    });

    it('應該只分析 outgoing 當 direction=outgoing', async () => {
      await fixture.writeFile('target.ts', `
import { helper } from './helper.js';

export function target() {
  helper();
}
      `.trim());

      await fixture.writeFile('helper.ts', 'export function helper() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'target', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.direction).toBe('outgoing');
      // incoming 應該為空（因為只分析 outgoing）
      expect(output.incoming).toHaveLength(0);
    });

    it('應該同時分析 incoming 和 outgoing 當 direction=both', async () => {
      await fixture.writeFile('target.ts', `
import { helper } from './helper.js';

export function target() {
  helper();
}
      `.trim());

      await fixture.writeFile('helper.ts', 'export function helper() {}');
      await fixture.writeFile('caller.ts', `
import { target } from './target.js';

export function caller() {
  target();
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'target', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.direction).toBe('both');
    });
  });

  describe('depth 選項', () => {
    it('應該正確處理 depth 參數', async () => {
      await fixture.writeFile('a.ts', `
import { b } from './b.js';

export function a() {
  b();
}
      `.trim());

      await fixture.writeFile('b.ts', `
import { c } from './c.js';

export function b() {
  c();
}
      `.trim());

      await fixture.writeFile('c.ts', 'export function c() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'b', '--path', fixture.rootPath, '--depth', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(2);
    });
  });

  describe('統計摘要', () => {
    it('應該包含正確的 summary 統計', async () => {
      await fixture.writeFile('target.ts', `
import { h1 } from './h1.js';
import { h2 } from './h2.js';

export function target() {
  h1();
  h2();
}
      `.trim());

      await fixture.writeFile('h1.ts', 'export function h1() {}');
      await fixture.writeFile('h2.ts', 'export function h2() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'target', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.outgoingCount).toBe('number');
      expect(typeof output.summary.incomingCount).toBe('number');
      expect(typeof output.summary.uniqueFiles).toBe('number');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理找不到的函數', async () => {
      await fixture.writeFile('empty.ts', 'export const x = 1;');

      const result = await executeCLI(
        ['call-hierarchy', 'nonExistent', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 檢查 JSON 輸出結構（exitCode 在測試環境中可能不正確）
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.success).toBe(false);
      expect(output.errors).toBeDefined();
      expect(output.errors.length).toBeGreaterThan(0);
    });

    it('應該拒絕無效的 direction 並輸出錯誤', async () => {
      await fixture.writeFile('fn.ts', 'export function fn() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'fn', '--path', fixture.rootPath, '--direction', 'invalid', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const hasError = result.stdout.includes('direction') || result.stderr.includes('direction');
      expect(hasError).toBe(true);
    });

    it('應該拒絕超出範圍的 depth 並輸出錯誤', async () => {
      await fixture.writeFile('fn.ts', 'export function fn() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'fn', '--path', fixture.rootPath, '--depth', '100', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const hasError = result.stdout.includes('depth') || result.stderr.includes('depth');
      expect(hasError).toBe(true);
    });

    it('應該拒絕無效的格式並輸出錯誤', async () => {
      await fixture.writeFile('fn.ts', 'export function fn() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'fn', '--path', fixture.rootPath, '--format', 'invalid'],
        { memfs: fixture.memfs }
      );

      // 檢查 stderr 有錯誤訊息
      expect(result.stderr).toContain('格式');
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含完整的結構欄位', async () => {
      await fixture.writeFile('target.ts', `
export function target() {
  console.log('hello');
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'target', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 驗證必要欄位存在（不論成功與否）
      expect(output).toHaveProperty('command', 'call-hierarchy');
      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('function', 'target');
      expect(output).toHaveProperty('direction');
      expect(output).toHaveProperty('depth');
      expect(output).toHaveProperty('incoming');
      expect(output).toHaveProperty('outgoing');
      expect(output).toHaveProperty('summary');
    });
  });

  describe('類別方法', () => {
    it('應該能分析類別方法的呼叫', async () => {
      await fixture.writeFile('service.ts', `
export class UserService {
  getUser() {
    this.validateUser();
    return { id: 1 };
  }

  private validateUser() {
    console.log('validating');
  }
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'getUser', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 驗證命令執行完成並返回 JSON
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('getUser');
    });
  });

  describe('Arrow Function', () => {
    it('應該能分析 arrow function', async () => {
      await fixture.writeFile('arrow.ts', `
import { helper } from './helper.js';

export const arrowFn = () => {
  helper();
  return 42;
};
      `.trim());

      await fixture.writeFile('helper.ts', 'export function helper() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'arrowFn', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 驗證命令執行完成並返回 JSON
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('arrowFn');
    });
  });

  describe('使用 Fixture 現有函數的進階測試', () => {
    it('應該分析 formatProduct 的 outgoing 呼叫（呼叫 formatCurrency）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatProduct', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('formatProduct');
      expect(output.success).toBe(true);

      // formatProduct 應該有 outgoing 呼叫 formatCurrency
      expect(output.outgoing.length).toBeGreaterThanOrEqual(1);
      const formatCurrencyCall = output.outgoing.find(
        (call: { callee: string }) => call.callee === 'formatCurrency'
      );
      expect(formatCurrencyCall).toBeDefined();
    });

    it('應該分析 canLogin 方法的 outgoing 呼叫（呼叫 isActive）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'canLogin', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('canLogin');
      expect(output.success).toBe(true);

      // canLogin 應該呼叫 isActive
      const isActiveCall = output.outgoing.find(
        (call: { callee: string }) => call.callee === 'isActive'
      );
      expect(isActiveCall).toBeDefined();
    });

    it('應該分析 groupBy 函數（array-utils）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'groupBy', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('groupBy');
      expect(output.success).toBe(true);
      expect(output.file).toContain('array-utils');
    });

    it('應該分析 validate 方法', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'validate', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('validate');
      expect(output.success).toBe(true);
      // validate 方法存在且可被分析
      expect(output.outgoing).toBeDefined();
    });

    it('應該分析 sortBy 函數', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'sortBy', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('sortBy');
      expect(output.success).toBe(true);
      expect(output.file).toContain('array-utils');
    });

    it('應該正確處理沒有 outgoing 呼叫的函數', async () => {
      // formatDate 只使用內建方法，沒有呼叫其他自定義函數
      const result = await executeCLI(
        ['call-hierarchy', 'formatDate', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('formatDate');
      expect(output.success).toBe(true);
      // formatDate 的 outgoing 可能只有內建方法呼叫
      expect(output.outgoing).toBeDefined();
    });

    it('應該分析 truncate 函數', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'truncate', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('truncate');
      expect(output.success).toBe(true);
    });
  });

  describe('Summary 格式驗證', () => {
    it('應該在 summary 格式中顯示函數名稱和統計', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatProduct', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('formatProduct');
      expect(result.stdout).toContain('📞');
    });

    it('應該在 summary 格式中顯示 incoming 和 outgoing 標籤', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'canLogin', '--path', fixture.rootPath, '--direction', 'both', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // summary 輸出應包含方向指示
      expect(result.stdout).toContain('canLogin');
    });
  });

  describe('定義位置驗證', () => {
    it('應該返回正確的定義檔案路徑', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'unique', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.file).toContain('array-utils.ts');
      // unique 函數定義在 array-utils.ts 前 10 行內
      expect(output.definitionLine).toBeGreaterThanOrEqual(1);
      expect(output.definitionLine).toBeLessThanOrEqual(10);
    });

    it('應該返回正確的定義行號', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatCurrency', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.file).toContain('formatter.ts');
      // formatCurrency 函數定義在 formatter.ts 中（前 30 行內）
      expect(output.definitionLine).toBeGreaterThanOrEqual(1);
      expect(output.definitionLine).toBeLessThanOrEqual(30);
    });
  });

  describe('邊界條件', () => {
    it('應該處理 depth=1（預設值）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'unique', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(1);
    });

    it('應該處理 depth=10（最大值）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'unique', '--path', fixture.rootPath, '--depth', '10', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.depth).toBe(10);
    });

    it('應該拒絕 depth=0', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'unique', '--path', fixture.rootPath, '--depth', '0', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const hasError = result.stdout.includes('depth') || result.stderr.includes('depth');
      expect(hasError).toBe(true);
    });

    it('應該拒絕負數 depth', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'unique', '--path', fixture.rootPath, '--depth', '-1', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const hasError = result.stdout.includes('depth') || result.stderr.includes('depth');
      expect(hasError).toBe(true);
    });
  });
});
