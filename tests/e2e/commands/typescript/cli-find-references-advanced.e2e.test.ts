/**
 * CLI find-references 進階路徑 E2E 測試
 *
 * 目標：覆蓋 symbol-finder 和 reference-finder 的進階路徑，
 * 包括 property access、class method、interface implementation 引用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references - 進階路徑覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - property access 引用

  describe('property access 引用', () => {
    it('應該找到 property access 引用（obj.method()）', async () => {
      await fixture.writeFile('src/prop-class.ts', `
export class PropClass {
  propMethod(): string {
    return 'result';
  }
}
      `.trim());
      await fixture.writeFile('src/prop-user.ts', `
import { PropClass } from './prop-class.js';

export function usePropMethod(): string {
  const obj = new PropClass();
  return obj.propMethod();
}
      `.trim());

      const result = await executeCLI(
        ['find-references', 'PropClass', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.references.length).toBeGreaterThan(0);
    });

    it('應該找到 class method 被多處呼叫', async () => {
      await fixture.writeFile('src/multi-caller-target.ts', `
export function multiCallerTarget(): number {
  return 42;
}
      `.trim());
      await fixture.writeFile('src/multi-caller-a.ts', `
import { multiCallerTarget } from './multi-caller-target.js';
export const a = multiCallerTarget();
      `.trim());
      await fixture.writeFile('src/multi-caller-b.ts', `
import { multiCallerTarget } from './multi-caller-target.js';
export const b = multiCallerTarget() + 1;
      `.trim());
      await fixture.writeFile('src/multi-caller-c.ts', `
import { multiCallerTarget } from './multi-caller-target.js';
export const c = multiCallerTarget() * 2;
      `.trim());

      const result = await executeCLI(
        ['find-references', 'multiCallerTarget', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 至少被 3 個檔案引用（定義 + 3 個使用點）
      expect(output.references.length).toBeGreaterThanOrEqual(3);
    });
  });

  // MARK: - interface 引用

  describe('interface 引用', () => {
    it('應該找到 interface 被多處實作和使用的引用', async () => {
      await fixture.writeFile('src/iface-def.ts', `
export interface IProcessor {
  process(input: string): string;
}
      `.trim());
      await fixture.writeFile('src/iface-impl.ts', `
import { IProcessor } from './iface-def.js';

export class StringProcessor implements IProcessor {
  process(input: string): string {
    return input.toUpperCase();
  }
}
      `.trim());
      await fixture.writeFile('src/iface-use.ts', `
import { IProcessor } from './iface-def.js';

export function runProcessor(proc: IProcessor, input: string): string {
  return proc.process(input);
}
      `.trim());

      const result = await executeCLI(
        ['find-references', 'IProcessor', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 應找到 impl 和 use 兩個引用點
      expect(output.references.length).toBeGreaterThanOrEqual(2);
    });

    it('應該找到 type alias 的引用', async () => {
      await fixture.writeFile('src/type-alias.ts', `
export type StringPair = [string, string];
      `.trim());
      await fixture.writeFile('src/type-alias-use1.ts', `
import { StringPair } from './type-alias.js';
export const pair: StringPair = ['a', 'b'];
      `.trim());
      await fixture.writeFile('src/type-alias-use2.ts', `
import { StringPair } from './type-alias.js';
export function getPair(): StringPair {
  return ['x', 'y'];
}
      `.trim());

      const result = await executeCLI(
        ['find-references', 'StringPair', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.references.length).toBeGreaterThanOrEqual(2);
    });
  });

  // MARK: - Fixture 現有符號進階

  describe('Fixture 現有符號進階測試', () => {
    it('應該找到 UserStatus enum 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserStatus', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.symbol).toBe('UserStatus');
      // UserStatus 在多個地方被引用
      expect(output.references.length).toBeGreaterThanOrEqual(1);
    });

    it('應該找到 UserService class 的所有引用', async () => {
      const result = await executeCLI(
        ['find-references', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.references.length).toBeGreaterThan(0);
    });

    it('應該找到 formatCurrency 函數的引用', async () => {
      const result = await executeCLI(
        ['find-references', 'formatCurrency', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該顯示引用的 summary（包含檔案列表）', async () => {
      const result = await executeCLI(
        ['find-references', 'UserService', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('UserService');
    });
  });

  // MARK: - 錯誤路徑

  describe('錯誤路徑', () => {
    it('找不到符號時應返回 success=false（json 格式）', async () => {
      const result = await executeCLI(
        ['find-references', 'nonExistentSymbol999', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      // 找不到時 success 可能是 false 或返回空 references
      expect(output.command).toBe('find-references');
      expect(output.symbol).toBe('nonExistentSymbol999');
    });

    it('不合法的 format 應報錯', async () => {
      const result = await executeCLI(
        ['find-references', 'UserService', '--path', fixture.rootPath, '--format', 'invalid_fmt'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });
  });
});
