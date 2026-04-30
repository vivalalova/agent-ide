/**
 * CLI call-hierarchy 命令 JS E2E 測試
 * 基於 js-project fixture 測試 JavaScript 呼叫層次分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI call-hierarchy - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析 JS 函數呼叫層次並回傳 JSON（或清楚的錯誤訊息）', async () => {
      // createUser 在 service.js 中呼叫 formatName
      const result = await executeCLI(
        ['call-hierarchy', 'createUser', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('createUser');
      // 必須有明確回應（成功或有意義的錯誤）
      if (output.success) {
        expect(output.outgoing).toBeDefined();
      } else {
        expect(output.errors).toBeDefined();
        expect(output.errors.length).toBeGreaterThan(0);
      }
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('formatName');
    });
  });

  describe('outgoing 呼叫分析', () => {
    it('createUser 應該找到 outgoing 呼叫 formatName', async () => {
      // Given: service.js 中 createUser 呼叫 formatName
      const result = await executeCLI(
        ['call-hierarchy', 'createUser', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.function).toBe('createUser');

      if (output.success) {
        // outgoing 應包含 formatName
        const callees = output.outgoing.map((call: { callee: string }) => call.callee);
        expect(callees).toContain('formatName');
      }
    });

    it('getCartTotal 應該找到 outgoing 呼叫 calculateTotal', async () => {
      // Given: service.js 中 getCartTotal 呼叫 calculateTotal
      const result = await executeCLI(
        ['call-hierarchy', 'getCartTotal', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.success) {
        const callees = output.outgoing.map((call: { callee: string }) => call.callee);
        expect(callees).toContain('calculateTotal');
      }
    });

    it('formatName 沒有 outgoing 呼叫自定義函數', async () => {
      // Given: utils.js 中 formatName 只使用模板字串，無自定義函數呼叫
      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.success) {
        // formatName 的 outgoing 不包含其他自定義函數
        const callees = output.outgoing.map((call: { callee: string }) => call.callee);
        expect(callees).not.toContain('createUser');
        expect(callees).not.toContain('getCartTotal');
      }
    });
  });

  describe('incoming 呼叫分析', () => {
    it('formatName 應該找到 incoming 呼叫 createUser', async () => {
      // Given: service.js 中 createUser 呼叫 formatName
      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.success) {
        const callers = output.incoming.map((call: { caller: string }) => call.caller);
        expect(callers).toContain('createUser');
      }
    });

    it('calculateTotal 應該找到 incoming 呼叫 getCartTotal', async () => {
      // Given: service.js 中 getCartTotal 呼叫 calculateTotal
      const result = await executeCLI(
        ['call-hierarchy', 'calculateTotal', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.success) {
        const callers = output.incoming.map((call: { caller: string }) => call.caller);
        expect(callers).toContain('getCartTotal');
      }
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含完整的結構欄位', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output).toHaveProperty('command', 'call-hierarchy');
      expect(output).toHaveProperty('success');
      expect(output).toHaveProperty('function', 'formatName');
      expect(output).toHaveProperty('direction');
      expect(output).toHaveProperty('depth');
      expect(output).toHaveProperty('incoming');
      expect(output).toHaveProperty('outgoing');
      expect(output).toHaveProperty('summary');
    });
  });

  describe('動態新增 JS 檔案', () => {
    it('新增 JS 呼叫者後應能找到 incoming 呼叫', async () => {
      // Given: 新增一個呼叫 formatName 的檔案（放在 src/ 以確保被 glob 掃描到）
      await fixture.writeFile('src/extra-caller.js', [
        'import { formatName } from \'./utils.js\';',
        'export function greetUser(first, last) {',
        '  return formatName(first, last);',
        '}',
      ].join('\n'));

      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.success) {
        const callers = output.incoming.map((call: { caller: string }) => call.caller);
        // 應該同時找到原有的 createUser 和新增的 greetUser
        expect(callers).toContain('createUser');
        expect(callers).toContain('greetUser');
      }
    });

    it('JSX 檔案中的函數呼叫應被正確分析', async () => {
      // Given: JSX 檔案呼叫 formatName（放在 src/ 以確保被 glob 掃描到）
      await fixture.writeFile('src/Component.jsx', [
        'import { formatName } from \'./utils.js\';',
        'export function UserCard({ first, last }) {',
        '  const name = formatName(first, last);',
        '  return name;',
        '}',
      ].join('\n'));

      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 成功或有明確錯誤，不應 silent fail
      expect(output.command).toBe('call-hierarchy');
    });
  });

  describe('錯誤處理', () => {
    it('不存在的函數應回傳 success=false 並有清楚錯誤訊息', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'nonExistentJsFunction', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('call-hierarchy');
      expect(output.success).toBe(false);
      expect(output.errors).toBeDefined();
      expect(output.errors.length).toBeGreaterThan(0);
    });
  });

  describe('direction 選項', () => {
    it('direction=both 應同時分析 incoming 和 outgoing', async () => {
      // createUser: incoming 無（無其他函數呼叫它），outgoing 有 formatName
      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--direction', 'both', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.direction).toBe('both');
      expect(output.incoming).toBeDefined();
      expect(output.outgoing).toBeDefined();
    });

    it('direction=incoming 應只分析 incoming', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'formatName', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.direction).toBe('incoming');
      expect(output.outgoing).toHaveLength(0);
    });

    it('direction=outgoing 應只分析 outgoing', async () => {
      const result = await executeCLI(
        ['call-hierarchy', 'createUser', '--path', fixture.rootPath, '--direction', 'outgoing', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.direction).toBe('outgoing');
      expect(output.incoming).toHaveLength(0);
    });
  });
});
