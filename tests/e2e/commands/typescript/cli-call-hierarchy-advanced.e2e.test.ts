/**
 * CLI call-hierarchy 進階路徑 E2E 測試
 *
 * 目標：覆蓋 call-hierarchy-analyzer.ts 的進階路徑：
 * - depth>1 遞迴呼叫鏈
 * - 多層 outgoing 鏈
 * - language-service 路徑
 * - TypeScript 類別繼承場景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI call-hierarchy - 進階路徑覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - depth>1 遞迴呼叫鏈

  describe('depth>1 呼叫鏈', () => {
    it('depth=2 outgoing：應找到兩層呼叫鏈', async () => {
      await fixture.writeFile('src/ch2-top.ts', `
import { ch2Mid } from './ch2-mid.js';
export function ch2Top() {
  return ch2Mid();
}
      `.trim());
      await fixture.writeFile('src/ch2-mid.ts', `
import { ch2Bottom } from './ch2-bottom.js';
export function ch2Mid() {
  return ch2Bottom();
}
      `.trim());
      await fixture.writeFile('src/ch2-bottom.ts', `
export function ch2Bottom() {
  return 42;
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'ch2Top', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.function).toBe('ch2Top');
      expect(output.depth).toBe(2);
      // outgoing 應找到 ch2Mid
      const callees = output.outgoing.map((c: { callee: string }) => c.callee);
      expect(callees).toContain('ch2Mid');
    });

    it('depth=3 incoming：應找到三層呼叫者鏈', async () => {
      await fixture.writeFile('src/ch3-base.ts', `
export function ch3Base() { return 1; }
      `.trim());
      await fixture.writeFile('src/ch3-mid.ts', `
import { ch3Base } from './ch3-base.js';
export function ch3Mid() { return ch3Base() + 1; }
      `.trim());
      await fixture.writeFile('src/ch3-top.ts', `
import { ch3Mid } from './ch3-mid.js';
export function ch3Top() { return ch3Mid() + 1; }
      `.trim());
      await fixture.writeFile('src/ch3-caller.ts', `
import { ch3Top } from './ch3-top.js';
export function ch3Caller() { return ch3Top() + 1; }
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'ch3Base', '--path', fixture.rootPath, '--direction', 'incoming', '--depth', '3', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.depth).toBe(3);
      // 應找到 ch3Mid（直接 caller）
      const callers = output.incoming.map((c: { caller: string }) => c.caller);
      expect(callers).toContain('ch3Mid');
    });
  });

  // MARK: - TypeScript 類別方法進階

  describe('TypeScript 類別方法進階', () => {
    it('應該分析繼承類別方法的 incoming 呼叫', async () => {
      await fixture.writeFile('src/cls-base.ts', `
export class ClsBase {
  baseMethod(): string {
    return 'base';
  }
}
      `.trim());
      await fixture.writeFile('src/cls-derived.ts', `
import { ClsBase } from './cls-base.js';
export class ClsDerived extends ClsBase {
  derivedMethod(): string {
    return this.baseMethod() + '-derived';
  }
}
      `.trim());
      await fixture.writeFile('src/cls-caller.ts', `
import { ClsDerived } from './cls-derived.js';
export function callDerived(): string {
  const obj = new ClsDerived();
  return obj.derivedMethod();
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'derivedMethod', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('derivedMethod');
    });

    it('應該分析 async 函數的呼叫層次', async () => {
      await fixture.writeFile('src/async-target.ts', `
export async function asyncTarget(): Promise<number> {
  return Promise.resolve(42);
}
      `.trim());
      await fixture.writeFile('src/async-caller.ts', `
import { asyncTarget } from './async-target.js';
export async function asyncCaller(): Promise<string> {
  const result = await asyncTarget();
  return String(result);
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'asyncTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該分析 both direction 的 summary 格式（有 incoming 和 outgoing）', async () => {
      await fixture.writeFile('src/both-helper.ts', 'export function bothHelper() { return 1; }');
      await fixture.writeFile('src/both-target.ts', `
import { bothHelper } from './both-helper.js';
export function bothTarget() {
  return bothHelper();
}
      `.trim());
      await fixture.writeFile('src/both-caller.ts', `
import { bothTarget } from './both-target.js';
export function bothCaller() {
  return bothTarget();
}
      `.trim());

      const result = await executeCLI(
        ['call-hierarchy', 'bothTarget', '--path', fixture.rootPath, '--direction', 'both', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bothTarget');
      // summary 應包含 incoming/outgoing 資訊
      expect(result.stdout.length).toBeGreaterThan(10);
    });
  });

  // MARK: - 使用 Fixture 現有函數的進階測試

  describe('Fixture 現有函數 depth 測試', () => {
    it('應該分析 createOrder 的 incoming 呼叫（depth=2）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'createOrder', '--path', fixture.rootPath, '--direction', 'incoming', '--depth', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // createOrder 可能不存在，但命令應正常執行
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
    });

    it('應該分析 UserModel 的 outgoing 呼叫（depth=2）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'UserModel', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.depth).toBe(2);
    });

    it('應該正確統計 both direction 的 summary（fixture 函數）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatCurrency', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.incomingCount).toBeDefined();
      expect(output.summary.outgoingCount).toBeDefined();
      expect(output.summary.uniqueFiles).toBeDefined();
    });
  });

  // MARK: - --at 過濾器丟棄前向引用 regression

  describe('--at 過濾器不應丟棄前向引用（非提升宣告的真實 caller）regression', () => {
    it('arrow function const 定義在後：--at 鎖定定義時，定義前的 caller 不應從 incoming 消失', async () => {
      await fixture.writeFile('src/ch-forward-ref-arrow.ts', [
        'export function callArrow() { return handler(); }',
        'export const handler = () => 1;'
      ].join('\n'));

      // 不帶 --at：baseline 應找到 callArrow 這個 incoming caller
      const baseline = await executeCLI(
        ['call-hierarchy', 'handler', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const baselineOutput: any = JSON.parse(baseline.stdout);
      expect(baselineOutput.incoming.map((c: any) => c.caller)).toContain('callArrow');

      // 帶 --at 鎖定 handler 的定義位置（line 2, column 14）
      const result = await executeCLI(
        [
          'call-hierarchy',
          'handler',
          '--path',
          fixture.rootPath,
          '--at',
          'src/ch-forward-ref-arrow.ts:2:14',
          '--direction',
          'incoming',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);

      // Bug：--at 鎖定後 callArrow 這個定義前的真實 caller 從 incoming 消失
      expect(output.incoming.map((c: any) => c.caller)).toContain('callArrow');
    });
  });

  // MARK: - barrel re-export 鏈路 regression
  //
  // 缺陷：call-hierarchy 不跟 barrel re-export 鏈（`export { x } from './real'`，
  // barrel 檔本身無本地宣告）：
  // - outgoing：findCalleeDefinition 只在 import 目標檔（barrel 檔）內找符號的本地宣告，
  //   barrel 檔沒有本地宣告 → 解析失敗 → depth 展開在 barrel 處斷掉，下游函式消失
  // - incoming：isCallSiteAnchoredToDefinition 用單跳 resolvedFile === targetDefinitionFile
  //   比對，caller 經 barrel import 時 resolvedFile 是 barrel 檔而非真正定義檔 → 合法 caller 被漏掉
  describe('barrel re-export 鏈路（call-hierarchy 不跟 re-export）regression', () => {
    beforeEach(async () => {
      await fixture.writeFile('src/ch-barrel-real.ts', [
        'export function chBarrelHelper() {',
        '  return 1;',
        '}',
        '',
        'export function chBarrelTarget() {',
        '  return chBarrelHelper();',
        '}'
      ].join('\n'));
      await fixture.writeFile(
        'src/ch-barrel-index.ts',
        'export { chBarrelTarget } from \'./ch-barrel-real.js\';'
      );
      await fixture.writeFile('src/ch-barrel-caller.ts', [
        'import { chBarrelTarget } from \'./ch-barrel-index.js\';',
        '',
        'export function chBarrelCaller() {',
        '  return chBarrelTarget();',
        '}'
      ].join('\n'));
      await fixture.writeFile('src/ch-barrel-direct-caller.ts', [
        'import { chBarrelTarget } from \'./ch-barrel-real.js\';',
        '',
        'export function chBarrelDirectCaller() {',
        '  return chBarrelTarget();',
        '}'
      ].join('\n'));
    });

    it('incoming: 經 barrel re-export 匯入的 caller 不應從 incoming 消失（對照：直接 import 的 caller 現為綠燈）', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'chBarrelTarget', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      const callers = output.incoming.map((c: any) => c.caller);

      // 對照組：直接 import 定義檔的 caller，目前應已正確出現
      expect(callers).toContain('chBarrelDirectCaller');
      // Bug：經 barrel re-export 匯入的 caller 應同樣出現，但目前被漏掉
      expect(callers).toContain('chBarrelCaller');
    });

    it('outgoing: 經 barrel 匯入呼叫時，depth=2 應能穿透 barrel 找到下游 helper（對照：直接 import 現為綠燈）', async () => {
      const directResult = await executeCLI(
        [
          'call-hierarchy',
          'chBarrelDirectCaller',
          '--path',
          fixture.rootPath,
          '--direction',
          'outgoing',
          '--depth',
          '2',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );
      expect(directResult.exitCode).toBe(0);
      const directOutput: any = JSON.parse(directResult.stdout);
      const directCallees = directOutput.outgoing.map((c: any) => c.callee);
      // 對照組：直接 import 時，depth=2 目前應已正確穿透找到 chBarrelHelper
      expect(directCallees).toContain('chBarrelTarget');
      expect(directCallees).toContain('chBarrelHelper');

      const result = await executeCLI(
        [
          'call-hierarchy',
          'chBarrelCaller',
          '--path',
          fixture.rootPath,
          '--direction',
          'outgoing',
          '--depth',
          '2',
          '--format',
          'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output: any = JSON.parse(result.stdout);
      const callees = output.outgoing.map((c: any) => c.callee);

      expect(callees).toContain('chBarrelTarget');
      // Bug：經 barrel 匯入時，depth=2 展開在 barrel 處斷掉，chBarrelHelper 應出現但目前消失
      expect(callees).toContain('chBarrelHelper');
    });
  });
});
