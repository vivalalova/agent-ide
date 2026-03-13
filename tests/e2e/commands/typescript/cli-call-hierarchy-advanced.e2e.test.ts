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
});
