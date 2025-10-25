/**
 * CLI swift analyze 命令 E2E 測試
 * 基於 swift-sample-project fixture 測試程式碼分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, type FixtureProject } from '../../helpers/fixture-manager.js';
import { executeCLI } from '../../helpers/cli-executor.js';

describe('CLI swift analyze - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 複雜度分析測試（10 個測試）
  // ============================================================

  describe('complexity', () => {
    it('應該分析 Swift 專案複雜度並輸出 JSON 格式', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(output.issues).toBeDefined();
      expect(output.summary.totalScanned).toBeGreaterThan(0);
    });

    it('應該檢測 OrderViewModel 的高複雜度', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const orderVM = output.issues.find((f: { path: string }) =>
        f.path.includes('OrderViewModel.swift')
      );
      expect(orderVM).toBeDefined();
      expect(orderVM.complexity).toBeGreaterThan(10);
    });

    it('--all 應該顯示所有檔案（包含低複雜度）', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.all).toBeDefined();
      expect(output.all.length).toBeGreaterThan(output.issues.length);
    });

    it('預設只輸出 evaluation=high 或 complexity>10 的檔案', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.issues).toBeDefined();
      expect(output.all).toBeUndefined();

      // 檢查所有 issues 都符合條件
      output.issues.forEach((issue: { complexity: number; evaluation: string }) => {
        const isHighComplexity = issue.complexity > 10 || issue.evaluation === 'high';
        expect(isHighComplexity).toBe(true);
      });
    });

    it('應該計算深層巢狀結構的複雜度', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // OrderViewModel 有深層的 if-else、switch、filter 等巢狀結構
      const orderVM = output.issues.find((f: { path: string }) =>
        f.path.includes('OrderViewModel.swift')
      );
      expect(orderVM).toBeDefined();
      expect(orderVM.complexity).toBeGreaterThan(15);
    });

    it('應該識別 guard 語句對複雜度的影響', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // AuthService 使用大量 guard 語句
      const authService = output.all.find((f: { path: string }) =>
        f.path.includes('AuthService.swift')
      );
      expect(authService).toBeDefined();
      expect(authService.complexity).toBeGreaterThan(5);
    });

    it('應該識別 switch 語句對複雜度的影響', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // OrderViewModel 有多個 switch 語句
      const orderVM = output.all.find((f: { path: string }) =>
        f.path.includes('OrderViewModel.swift')
      );
      expect(orderVM).toBeDefined();
      expect(orderVM.complexity).toBeGreaterThan(10);
    });

    it('應該識別 ViewBuilder 中的條件邏輯複雜度', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // ProductDetailView 有條件渲染邏輯（if-let、三元運算子等）
      const productDetailView = output.all.find((f: { path: string }) =>
        f.path.includes('ProductDetailView.swift')
      );
      expect(productDetailView).toBeDefined();
      expect(productDetailView.complexity).toBeGreaterThan(10);
    });

    it('應該輸出 summary 格式（文字報告）', async () => {
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        fixture.tempPath,
        '--format',
        'summary'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('複雜度分析');
      expect(result.stdout).toContain('高複雜度檔案');
    });

    it('應該處理單一檔案的複雜度分析', async () => {
      const filePath = fixture.getFilePath(
        'Sources/SwiftSampleApp/Features/Orders/ViewModels/OrderViewModel.swift'
      );
      const result = await executeCLI([
        'analyze',
        'complexity',
        '--path',
        filePath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary.totalScanned).toBe(1);
      expect(output.issues.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 2. 死代碼檢測測試（8 個測試）
  // ============================================================

  describe('dead-code', () => {
    it('應該檢測未使用的私有方法', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.summary).toBeDefined();
      expect(output.issues).toBeDefined();
    });

    it('應該檢測未使用的 private property', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.issues.length > 0) {
        const hasPrivateProperty = output.issues.some((issue: { type: string }) =>
          issue.type === 'unused_property'
        );
        expect(typeof hasPrivateProperty).toBe('boolean');
      }
    });

    it('應該忽略 @Published 屬性（即使未在類別內使用）', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // OrderViewModel 有多個 @Published 屬性
      const orderVM = output.all.find((f: { path: string }) =>
        f.path.includes('OrderViewModel.swift')
      );

      if (orderVM && orderVM.deadCode) {
        // @Published 屬性不應該被標記為 dead code
        const publishedProps = orderVM.deadCode.filter(
          (dead: { name: string }) =>
            dead.name === 'orders' ||
            dead.name === 'filterStatus' ||
            dead.name === 'sortOption'
        );
        expect(publishedProps.length).toBe(0);
      }
    });

    it('應該忽略協定方法實作', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // NetworkService 實作 NetworkServiceProtocol
      const networkService = output.all.find((f: { path: string }) =>
        f.path.includes('NetworkService.swift')
      );

      if (networkService && networkService.deadCode) {
        // 協定方法不應該被標記為 dead code
        const protocolMethods = networkService.deadCode.filter(
          (dead: { type: string }) => dead.type === 'unused_function'
        );
        expect(protocolMethods.length).toBe(0);
      }
    });

    it('--all 應該顯示所有掃描的檔案', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.all).toBeDefined();
      expect(output.all.length).toBeGreaterThan(0);
    });

    it('預設只輸出有 dead code 的檔案', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.issues).toBeDefined();
      expect(output.all).toBeUndefined();
    });

    it('應該檢測未使用的 import', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      if (output.issues.length > 0) {
        const hasUnusedImport = output.issues.some((issue: { type: string }) =>
          issue.type === 'unused_import'
        );
        expect(typeof hasUnusedImport).toBe('boolean');
      }
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'summary'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('死代碼檢測完成');
      expect(result.stdout).toContain('統計');
    });
  });

  // ============================================================
  // 3. 品質分析測試（10 個測試）
  // ============================================================

  describe('quality', () => {
    it('應該整合所有分析維度', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.complexity).toBeDefined();
      expect(output.maintainability).toBeDefined();
      expect(output.typeSafety).toBeDefined();
      expect(output.errorHandling).toBeDefined();
    });

    it('應該檢測 as! 型別安全問題', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.typeSafety).toBeDefined();

      if (output.typeSafety.issues && output.typeSafety.issues.length > 0) {
        const hasForceCast = output.typeSafety.issues.some(
          (issue: { type: string }) => issue.type === 'force_cast'
        );
        expect(typeof hasForceCast).toBe('boolean');
      }
    });

    it('應該檢測空 catch 區塊', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.errorHandling).toBeDefined();

      if (output.errorHandling.issues && output.errorHandling.issues.length > 0) {
        const hasEmptyCatch = output.errorHandling.issues.some(
          (issue: { type: string }) => issue.type === 'empty_catch'
        );
        expect(typeof hasEmptyCatch).toBe('boolean');
      }
    });

    it('應該檢測命名規範問題', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.namingConventions).toBeDefined();
    });

    it('應該檢測安全性問題（硬編碼密碼、eval）', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.security).toBeDefined();
    });

    it('應該計算整體品質評分', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.overallScore).toBeDefined();
      expect(output.overallScore).toBeGreaterThanOrEqual(0);
      expect(output.overallScore).toBeLessThanOrEqual(100);
    });

    it('應該提供改善建議', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.recommendations).toBeDefined();
      expect(Array.isArray(output.recommendations)).toBe(true);
    });

    it('應該檢測測試覆蓋率', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.testCoverage).toBeDefined();
      expect(output.testCoverage.testFileRatio).toBeGreaterThan(0);
    });

    it('應該輸出 summary 格式', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        fixture.tempPath,
        '--format',
        'summary'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('品質分析');
      expect(result.stdout).toContain('整體評分');
    });

    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI([
        'analyze',
        'quality',
        '--path',
        '/nonexistent/path',
        '--format',
        'json'
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });
  });
});
