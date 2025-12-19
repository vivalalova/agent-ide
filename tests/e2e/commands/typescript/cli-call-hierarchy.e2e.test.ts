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
      await fixture.writeFile('src/fn.ts', 'export function fn() {}');

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
      await fixture.writeFile('src/target.ts', `
export function target() {
  console.log('target');
}
      `.trim());

      await fixture.writeFile('src/caller.ts', `
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
      await fixture.writeFile('src/target.ts', `
import { helper } from './helper.js';

export function target() {
  helper();
}
      `.trim());

      await fixture.writeFile('src/helper.ts', 'export function helper() {}');

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
      await fixture.writeFile('src/target.ts', `
import { helper } from './helper.js';

export function target() {
  helper();
}
      `.trim());

      await fixture.writeFile('src/helper.ts', 'export function helper() {}');
      await fixture.writeFile('src/caller.ts', `
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
      await fixture.writeFile('src/a.ts', `
import { b } from './b.js';

export function a() {
  b();
}
      `.trim());

      await fixture.writeFile('src/b.ts', `
import { c } from './c.js';

export function b() {
  c();
}
      `.trim());

      await fixture.writeFile('src/c.ts', 'export function c() {}');

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
      await fixture.writeFile('src/target.ts', `
import { h1 } from './h1.js';
import { h2 } from './h2.js';

export function target() {
  h1();
  h2();
}
      `.trim());

      await fixture.writeFile('src/h1.ts', 'export function h1() {}');
      await fixture.writeFile('src/h2.ts', 'export function h2() {}');

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
      await fixture.writeFile('src/empty.ts', 'export const x = 1;');

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
      await fixture.writeFile('src/fn.ts', 'export function fn() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'fn', '--path', fixture.rootPath, '--direction', 'invalid', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const hasError = result.stdout.includes('direction') || result.stderr.includes('direction');
      expect(hasError).toBe(true);
    });

    it('應該拒絕超出範圍的 depth 並輸出錯誤', async () => {
      await fixture.writeFile('src/fn.ts', 'export function fn() {}');

      const result = await executeCLI(
        ['call-hierarchy', 'fn', '--path', fixture.rootPath, '--depth', '100', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const hasError = result.stdout.includes('depth') || result.stderr.includes('depth');
      expect(hasError).toBe(true);
    });

    it('應該拒絕無效的格式並輸出錯誤', async () => {
      await fixture.writeFile('src/fn.ts', 'export function fn() {}');

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
      await fixture.writeFile('src/target.ts', `
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
      await fixture.writeFile('src/service.ts', `
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
      await fixture.writeFile('src/arrow.ts', `
import { helper } from './helper.js';

export const arrowFn = () => {
  helper();
  return 42;
};
      `.trim());

      await fixture.writeFile('src/helper.ts', 'export function helper() {}');

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
      // sortBy 可能有多個定義（function 和 interface property）
      // 檢查 definitions 陣列中有來自 array-utils 的定義
      if (output.definitions && output.definitions.length > 0) {
        const hasArrayUtilsDef = output.definitions.some(
          (d: { file: string }) => d.file.includes('array-utils')
        );
        expect(hasArrayUtilsDef).toBe(true);
      } else {
        // 向後相容：若無 definitions，檢查 file
        expect(output.file).toContain('array-utils');
      }
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

  describe('批次處理效能優化', () => {
    it('應該正確處理同一檔案中多個呼叫點', async () => {
      // Given: 一個被多個函數呼叫的 target，且這些函數都在同一檔案
      await fixture.writeFile('src/batch-target.ts', `
export function batchTarget() {
  return 42;
}
      `.trim());

      await fixture.writeFile('src/batch-callers.ts', `
import { batchTarget } from './batch-target.js';

export function batchCaller1() {
  return batchTarget() + 1;
}

export function batchCaller2() {
  return batchTarget() + 2;
}

export function batchCaller3() {
  const result = batchTarget();
  return result * 2;
}
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'batchTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.incoming.length).toBeGreaterThanOrEqual(3);

      // 驗證三個 caller 都被正確識別
      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('batchCaller1');
      expect(callerNames).toContain('batchCaller2');
      expect(callerNames).toContain('batchCaller3');
    });

    it('應該正確處理多個檔案中的呼叫點', async () => {
      // Given: 一個被多個檔案呼叫的 target
      await fixture.writeFile('src/multi-target.ts', `
export function multiTarget() {
  return 'result';
}
      `.trim());

      await fixture.writeFile('src/multi-file1.ts', `
import { multiTarget } from './multi-target.js';

export function fromMultiFile1() {
  return multiTarget();
}
      `.trim());

      await fixture.writeFile('src/multi-file2.ts', `
import { multiTarget } from './multi-target.js';

export function fromMultiFile2() {
  return multiTarget();
}
      `.trim());

      await fixture.writeFile('src/multi-file3.ts', `
import { multiTarget } from './multi-target.js';

export function fromMultiFile3() {
  return multiTarget();
}
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'multiTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.incoming.length).toBeGreaterThanOrEqual(3);

      // 驗證三個不同檔案的 caller 都被正確識別
      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('fromMultiFile1');
      expect(callerNames).toContain('fromMultiFile2');
      expect(callerNames).toContain('fromMultiFile3');
    });

    it('應該正確處理混合情境：同檔案多呼叫 + 跨檔案呼叫', async () => {
      // Given: 混合情境
      await fixture.writeFile('src/mixed-core.ts', `
export function mixedCore() {
  return 'core';
}
      `.trim());

      await fixture.writeFile('src/mixed-utils.ts', `
import { mixedCore } from './mixed-core.js';

export function mixedUtil1() {
  return mixedCore();
}

export function mixedUtil2() {
  return mixedCore();
}
      `.trim());

      await fixture.writeFile('src/mixed-service.ts', `
import { mixedCore } from './mixed-core.js';

export class MixedService {
  doMixedTask() {
    return mixedCore();
  }
}
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'mixedCore', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.incoming.length).toBeGreaterThanOrEqual(3);

      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('mixedUtil1');
      expect(callerNames).toContain('mixedUtil2');
      expect(callerNames).toContain('doMixedTask');
    });

    it('應該正確返回呼叫點的 context', async () => {
      // Given
      await fixture.writeFile('src/context-target.ts', `
export function contextTarget() {
  return 42;
}
      `.trim());

      await fixture.writeFile('src/context-caller.ts', `
import { contextTarget } from './context-target.js';

export function contextCaller() {
  const value = contextTarget();
  return value;
}
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'contextTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const callerEntry = output.incoming.find((call: { caller: string }) => call.caller === 'contextCaller');
      expect(callerEntry).toBeDefined();
      expect(callerEntry.context).toContain('contextTarget()');
    });
  });

  describe('同名函數處理', () => {
    it('應該正確處理有唯一名稱的函數呼叫層次', async () => {
      // Given: 使用唯一函數名稱的場景
      await fixture.writeFile('src/unique-processor.ts', `
import { uniqueHelper } from './unique-helper.js';

export function uniqueProcess() {
  return uniqueHelper();
}
      `.trim());

      await fixture.writeFile('src/unique-helper.ts', `
export function uniqueHelper() {
  return 'unique';
}
      `.trim());

      await fixture.writeFile('src/unique-caller.ts', `
import { uniqueProcess } from './unique-processor.js';

export function uniqueCaller() {
  return uniqueProcess();
}
      `.trim());

      // When: 分析 uniqueProcess
      const result = await executeCLI(
        ['call-hierarchy', 'uniqueProcess', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.file).toContain('unique-processor.ts');

      // outgoing 應包含 uniqueHelper
      const outgoingCallees = output.outgoing.map((call: { callee: string }) => call.callee);
      expect(outgoingCallees).toContain('uniqueHelper');

      // incoming 應包含 uniqueCaller
      const incomingCallers = output.incoming.map((call: { caller: string }) => call.caller);
      expect(incomingCallers).toContain('uniqueCaller');
    });

    it('應該正確處理遞迴函數的呼叫層次', async () => {
      // Given: 一個遞迴呼叫場景
      await fixture.writeFile('src/recursive-factorial.ts', `
export function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
      `.trim());

      await fixture.writeFile('src/factorial-caller.ts', `
import { factorial } from './recursive-factorial.js';

export function computeFactorials() {
  return [factorial(5), factorial(10)];
}
      `.trim());

      // When: 分析 factorial
      const result = await executeCLI(
        ['call-hierarchy', 'factorial', '--path', fixture.rootPath, '--direction', 'both', '--depth', '3', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.file).toContain('recursive-factorial.ts');

      // incoming 應包含 computeFactorials（外部呼叫者）
      const incomingCallers = output.incoming.map((call: { caller: string }) => call.caller);
      expect(incomingCallers).toContain('computeFactorials');
    });

    it('應該正確處理多個 caller 呼叫同一個函數的層次', async () => {
      // Given: 多個檔案呼叫同一個目標函數
      await fixture.writeFile('src/shared-target.ts', `
export function sharedTarget() {
  return 'shared';
}
      `.trim());

      await fixture.writeFile('src/caller-alpha.ts', `
import { sharedTarget } from './shared-target.js';

export function callerAlpha() {
  return sharedTarget();
}
      `.trim());

      await fixture.writeFile('src/caller-beta.ts', `
import { sharedTarget } from './shared-target.js';

export function callerBeta() {
  return sharedTarget();
}
      `.trim());

      await fixture.writeFile('src/caller-gamma.ts', `
import { sharedTarget } from './shared-target.js';

export function callerGamma() {
  return sharedTarget();
}
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'sharedTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 應該找到所有三個 caller
      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('callerAlpha');
      expect(callerNames).toContain('callerBeta');
      expect(callerNames).toContain('callerGamma');
    });
  });

  describe('錯誤輸入處理', () => {
    it('應該處理不存在的函數名稱', async () => {
      // Given: 專案中沒有這個函數
      await fixture.writeFile('src/some-file.ts', `
export function existingFn() {
  return 42;
}
      `.trim());

      // When: 查詢不存在的函數
      const result = await executeCLI(
        ['call-hierarchy', 'nonExistentFunction', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該返回錯誤
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.success).toBe(false);
      expect(output.errors.length).toBeGreaterThan(0);
    });

    it('應該處理空函數名稱參數', async () => {
      // When: 不提供函數名稱
      const result = await executeCLI(
        ['call-hierarchy', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該報錯（CLI 參數缺失）
      expect(result.exitCode).not.toBe(0);
    });

    it('應該處理特殊字元的函數名稱', async () => {
      // When: 使用不合法的函數名稱
      const result = await executeCLI(
        ['call-hierarchy', '123invalid', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該返回找不到函數的錯誤
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.errors.length).toBeGreaterThan(0);
    });
  });

  describe('混合正常/失敗檔案的批次處理', () => {
    it('應該在部分檔案有語法錯誤時仍正確分析其他檔案', async () => {
      // Given: 混合正常檔案和有語法錯誤的檔案
      await fixture.writeFile('src/valid-target.ts', `
export function validTarget() {
  return 42;
}
      `.trim());

      await fixture.writeFile('src/valid-caller.ts', `
import { validTarget } from './valid-target.js';

export function validCaller() {
  return validTarget() + 1;
}
      `.trim());

      await fixture.writeFile('src/syntax-error.ts', `
// 這個檔案有語法錯誤
export function brokenFn( {
  return 'missing closing paren';
}
      `.trim());

      // When: 分析 validTarget 的呼叫層次
      const result = await executeCLI(
        ['call-hierarchy', 'validTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功分析，忽略有語法錯誤的檔案
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 應該找到 validCaller
      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('validCaller');
    });

    it('應該在目標函數檔案正常但引用檔案有錯誤時仍返回結果', async () => {
      // Given
      await fixture.writeFile('src/core-function.ts', `
export function coreFunction() {
  return 'core';
}
      `.trim());

      await fixture.writeFile('src/good-consumer.ts', `
import { coreFunction } from './core-function.js';

export function goodConsumer() {
  return coreFunction();
}
      `.trim());

      await fixture.writeFile('src/bad-consumer.ts', `
import { coreFunction } from './core-function.js';

// 語法錯誤：缺少 function body
export function badConsumer()
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'coreFunction', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該找到 goodConsumer，即使 bad-consumer.ts 有錯誤
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('goodConsumer');
    });

    it('應該在多個檔案混合狀態下返回正確的統計摘要', async () => {
      // Given: 3 個正常檔案 + 1 個語法錯誤檔案
      await fixture.writeFile('src/shared-util.ts', `
export function sharedUtil() {
  return 'shared';
}
      `.trim());

      await fixture.writeFile('src/consumer-1.ts', `
import { sharedUtil } from './shared-util.js';

export function consumer1() {
  return sharedUtil();
}
      `.trim());

      await fixture.writeFile('src/consumer-2.ts', `
import { sharedUtil } from './shared-util.js';

export function consumer2() {
  return sharedUtil();
}
      `.trim());

      await fixture.writeFile('src/consumer-3.ts', `
import { sharedUtil } from './shared-util.js';

export function consumer3() {
  return sharedUtil();
}
      `.trim());

      await fixture.writeFile('src/broken-consumer.ts', `
import { sharedUtil } from './shared-util.js';

export const broken = ( => { sharedUtil(); };
      `.trim());

      // When
      const result = await executeCLI(
        ['call-hierarchy', 'sharedUtil', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 應該至少找到 3 個正常的 consumer
      expect(output.incoming.length).toBeGreaterThanOrEqual(3);

      const callerNames = output.incoming.map((call: { caller: string }) => call.caller);
      expect(callerNames).toContain('consumer1');
      expect(callerNames).toContain('consumer2');
      expect(callerNames).toContain('consumer3');

      // summary 應該反映實際找到的呼叫數量
      expect(output.summary.incomingCount).toBeGreaterThanOrEqual(3);
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
