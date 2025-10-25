/**
 * CLI swift search 命令 E2E 測試
 * 基於 swift-sample-project fixture 測試搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, type FixtureProject } from '../../helpers/fixture-manager.js';
import { executeCLI } from '../../helpers/cli-executor.js';

describe('CLI swift search - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 符號搜尋測試（10 個測試）
  // ============================================================

  describe('symbol', () => {
    it('應該搜尋 class 符號並輸出 JSON 格式', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'OrderViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBeGreaterThan(0);

      const match = output.results[0];
      expect(match.name).toBe('OrderViewModel');
      expect(match.type).toBe('class');
      expect(match.filePath).toContain('OrderViewModel.swift');
    });

    it('應該搜尋 protocol 符號', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'NetworkServiceProtocol',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      const match = output.results[0];
      expect(match.name).toBe('NetworkServiceProtocol');
      expect(match.type).toBe('protocol');
    });

    it('應該搜尋 struct 符號', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'Product',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      const productStruct = output.results.find(
        (r: { name: string; type: string }) => r.name === 'Product' && r.type === 'struct'
      );
      expect(productStruct).toBeDefined();
    });

    it('應該搜尋 enum 符號', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'OrderStatus',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      const match = output.results[0];
      expect(match.name).toBe('OrderStatus');
      expect(match.type).toBe('enum');
    });

    it('應該搜尋 @Published 屬性', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'orders',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      // 檢查是否有帶有 @Published 的屬性
      const publishedProperty = output.results.find(
        (r: { name: string; type: string; attributes?: string[] }) =>
          r.name === 'orders' &&
          r.type === 'property' &&
          r.attributes &&
          r.attributes.includes('@Published')
      );
      expect(publishedProperty).toBeDefined();
    });

    it('應該支援模糊搜尋（wildcard）', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'Order*',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(3);

      // 應該包含多個 Order 開頭的符號
      const names = output.results.map((r: { name: string }) => r.name);
      expect(names.some((n: string) => n === 'OrderViewModel')).toBe(true);
      expect(names.some((n: string) => n === 'Order')).toBe(true);
      expect(names.some((n: string) => n === 'OrderService')).toBe(true);
    });

    it('應該搜尋方法符號', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'loadOrders',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      const method = output.results[0];
      expect(method.name).toBe('loadOrders');
      expect(method.type).toBe('function');
    });

    it('應該提供符號的位置資訊', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'OrderViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const match = output.results[0];

      expect(match.filePath).toBeDefined();
      expect(match.line).toBeGreaterThan(0);
      expect(match.column).toBeGreaterThan(0);
    });

    it('應該限制搜尋結果數量', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        '*',
        '--path',
        fixture.tempPath,
        '--limit',
        '10',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeLessThanOrEqual(10);
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI([
        'search',
        'symbol',
        '--query',
        'OrderViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'summary'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('OrderViewModel');
    });
  });

  // ============================================================
  // 2. 文字搜尋測試（8 個測試）
  // ============================================================

  describe('text', () => {
    it('應該搜尋文字 "async/await"', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        'async',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // NetworkService 和其他多處使用 async
      expect(output.results.length).toBeGreaterThan(10);
    });

    it('應該搜尋 "@Published"', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        '@Published',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 多個 ViewModel 使用 @Published
      expect(output.results.length).toBeGreaterThan(20);
    });

    it('應該支援正則表達式搜尋', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        '@[A-Z]\\w+',
        '--regex',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 應該找到 @Published、@State、@ObservedObject 等
      expect(output.results.length).toBeGreaterThan(0);
    });

    it('應該搜尋 "guard let"', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        'guard let',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // AuthService 和其他檔案使用 guard let
      expect(output.results.length).toBeGreaterThan(5);
    });

    it('應該支援大小寫不敏感搜尋', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        'VIEWMODEL',
        '--case-insensitive',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);
    });

    it('應該提供匹配的上下文行', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        'OrderViewModel',
        '--context',
        '2',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const match = output.results[0];

      expect(match.contextBefore).toBeDefined();
      expect(match.contextAfter).toBeDefined();
    });

    it('應該過濾檔案類型', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        'ViewModel',
        '--path',
        fixture.tempPath,
        '--file-pattern',
        '**/*ViewModel.swift',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 所有結果應該來自 ViewModel 檔案
      output.results.forEach((result: { filePath: string }) => {
        expect(result.filePath).toContain('ViewModel.swift');
      });
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI([
        'search',
        'text',
        '--query',
        'async',
        '--path',
        fixture.tempPath,
        '--format',
        'summary'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('找到');
      expect(result.stdout).toContain('async');
    });
  });

  // ============================================================
  // 3. 結構化搜尋測試（9 個測試）
  // ============================================================

  describe('structural', () => {
    it('應該搜尋所有 ViewModel 類別', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--pattern',
        '*ViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(5);

      // 所有結果都應該是 ViewModel
      output.results.forEach((result: { name: string; type: string }) => {
        expect(result.name).toContain('ViewModel');
        expect(result.type).toBe('class');
      });
    });

    it('應該搜尋所有 Protocol', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'protocol',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(3);

      output.results.forEach((result: { type: string }) => {
        expect(result.type).toBe('protocol');
      });
    });

    it('應該搜尋所有 Service 類別', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--pattern',
        '*Service',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(3);

      // 應該包含 NetworkService、AuthService、ProductService 等
      const names = output.results.map((r: { name: string }) => r.name);
      expect(names.some((n: string) => n === 'NetworkService')).toBe(true);
      expect(names.some((n: string) => n === 'AuthService')).toBe(true);
    });

    it('應該搜尋帶有特定屬性的類別', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--with-attribute',
        '@MainActor',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      // 所有結果都應該有 @MainActor 屬性
      output.results.forEach((result: { attributes?: string[] }) => {
        expect(result.attributes).toBeDefined();
        expect(result.attributes).toContain('@MainActor');
      });
    });

    it('應該搜尋 async 函式', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'function',
        '--with-modifier',
        'async',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(10);

      output.results.forEach((result: { modifiers?: string[] }) => {
        expect(result.modifiers).toBeDefined();
        expect(result.modifiers).toContain('async');
      });
    });

    it('應該搜尋實作特定協定的類別', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--implements',
        'NetworkServiceProtocol',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      // NetworkService 應該實作 NetworkServiceProtocol
      const networkService = output.results.find(
        (r: { name: string }) => r.name === 'NetworkService'
      );
      expect(networkService).toBeDefined();
    });

    it('應該搜尋繼承特定類別的子類別', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--extends',
        'BaseViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(5);

      // 所有 ViewModel 都應該繼承 BaseViewModel
      output.results.forEach((result: { superclass?: string }) => {
        expect(result.superclass).toBe('BaseViewModel');
      });
    });

    it('應該組合多個條件搜尋', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--pattern',
        '*ViewModel',
        '--with-attribute',
        '@MainActor',
        '--extends',
        'BaseViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.results.length).toBeGreaterThan(0);

      // 所有結果都應該滿足所有條件
      output.results.forEach(
        (result: { name: string; attributes?: string[]; superclass?: string }) => {
          expect(result.name).toContain('ViewModel');
          expect(result.attributes).toContain('@MainActor');
          expect(result.superclass).toBe('BaseViewModel');
        }
      );
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI([
        'search',
        'structural',
        '--type',
        'class',
        '--pattern',
        '*ViewModel',
        '--path',
        fixture.tempPath,
        '--format',
        'summary'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ViewModel');
      expect(result.stdout).toContain('class');
    });
  });
});
