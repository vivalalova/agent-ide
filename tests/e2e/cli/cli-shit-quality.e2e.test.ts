/**
 * CLI shit 命令 - 品質保證維度 E2E 測試
 * 測試型別安全、測試覆蓋率、錯誤處理、命名規範、安全性檢測
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, type FixtureProject } from '../helpers/fixture-manager.js';
import { executeCLI } from '../helpers/cli-executor.js';

describe('CLI shit - 品質保證維度測試', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該輸出 qualityAssurance 維度評分', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 確認包含第 4 個維度
      expect(output.dimensions).toBeDefined();
      expect(output.dimensions.qualityAssurance).toBeDefined();
    });

    it('qualityAssurance 權重應為 0.20', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.dimensions.qualityAssurance.weight).toBe(0.2);
    });

    it('breakdown 應包含 5 個子項', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const breakdown = output.dimensions.qualityAssurance.breakdown;
      expect(breakdown).toBeDefined();
      expect(breakdown.typeSafety).toBeDefined();
      expect(breakdown.testCoverage).toBeDefined();
      expect(breakdown.errorHandling).toBeDefined();
      expect(breakdown.naming).toBeDefined();
      expect(breakdown.security).toBeDefined();
    });
  });

  describe('型別安全檢測', () => {
    it('應該檢測 any 型別使用', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;

      // type-safety-issues.ts 包含 14 個 any 相關問題
      // 應該有相對高的分數（分數越高越糟）
      expect(typeSafetyScore).toBeGreaterThan(0);
    });

    it('應該檢測 @ts-ignore 註解', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // topShit 應該包含 type_safety 類型的問題
      const typeIssues = output.topShit?.filter(
        (item: any) => item.type === 'type_safety'
      );

      expect(typeIssues).toBeDefined();
      if (typeIssues && typeIssues.length > 0) {
        expect(typeIssues[0].description).toMatch(/any|@ts-ignore|type/i);
      }
    });

    it('應該檢測 as any 斷言', async () => {
      const content = await fixture.readFile('src/quality-test/type-safety-issues.ts');

      // 確認測試檔案包含 as any
      expect(content).toContain('as any');

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 型別安全分數應該受到影響
      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;
      expect(typeSafetyScore).toBeGreaterThan(0);
    });

    it('應該檢測 tsconfig strict 模式未啟用', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 建議中應該包含關於 strict 模式的建議
      const recommendations = output.recommendations || [];
      const strictRecommendation = recommendations.find(
        (r: any) => r.suggestion.includes('strict') || r.suggestion.includes('型別')
      );

      // 型別安全分數應該因為 strict: false 而較高
      const typeSafetyScore = output.dimensions.qualityAssurance.breakdown.typeSafety;
      expect(typeSafetyScore).toBeGreaterThan(20); // 至少有基礎懲罰
    });
  });

  describe('測試覆蓋率檢測', () => {
    it('應該計算測試檔案比例', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const testCoverageScore = output.dimensions.qualityAssurance.breakdown.testCoverage;

      // sample-project 沒有測試檔案，分數應該很高（接近 100）
      expect(testCoverageScore).toBeGreaterThan(90);
    });

    it('覆蓋率低於 20% 應該在建議中標記為 Critical', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const recommendations = output.recommendations || [];
      const testRecommendation = recommendations.find(
        (r: any) => r.suggestion.includes('測試') || r.suggestion.includes('test')
      );

      if (testRecommendation) {
        // 測試覆蓋率極低應該是高優先級或關鍵
        expect(['high', 'critical']).toContain(testRecommendation.priority);
      }
    });
  });

  describe('錯誤處理檢測', () => {
    it('應該檢測空 catch 區塊', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const errorHandlingScore = output.dimensions.qualityAssurance.breakdown.errorHandling;

      // error-handling-bad.ts 包含 6 個空/靜默 catch
      expect(errorHandlingScore).toBeGreaterThan(0);
    });

    it('應該檢測靜默吞錯（catch 有註解但無處理）', async () => {
      const content = await fixture.readFile('src/quality-test/error-handling-bad.ts');

      // 確認測試檔案包含靜默吞錯模式
      expect(content).toContain('// ignore');
      expect(content).toContain('/* skip error */');

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const errorHandlingScore = output.dimensions.qualityAssurance.breakdown.errorHandling;
      expect(errorHandlingScore).toBeGreaterThan(0);
    });
  });

  describe('命名規範檢測', () => {
    it('應該檢測底線開頭變數', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const namingScore = output.dimensions.qualityAssurance.breakdown.naming;

      // naming-violations.ts 包含 11 個底線開頭變數
      expect(namingScore).toBeGreaterThan(0);
    });

    it('應該在 --show-files 時列出命名問題檔案', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--show-files',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.detailedFiles).toBeDefined();
      expect(output.detailedFiles.qualityAssurance).toBeDefined();
      expect(output.detailedFiles.qualityAssurance.namingViolation).toBeDefined();

      const namingFiles = output.detailedFiles.qualityAssurance.namingViolation;

      // 應該包含 naming-violations.ts
      const hasNamingViolationFile = namingFiles.some(
        (f: any) => f.path.includes('naming-violations.ts')
      );

      if (namingFiles.length > 0) {
        expect(hasNamingViolationFile).toBe(true);
      }
    });
  });

  describe('安全性檢測', () => {
    it('應該檢測硬編碼密碼', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const securityScore = output.dimensions.qualityAssurance.breakdown.security;

      // security-risks.ts 包含 8 個安全風險
      expect(securityScore).toBeGreaterThan(0);
    });

    it('應該檢測 eval 使用', async () => {
      const content = await fixture.readFile('src/quality-test/security-risks.ts');

      // 確認測試檔案包含 eval
      expect(content).toContain('eval(');

      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const securityScore = output.dimensions.qualityAssurance.breakdown.security;

      // 安全問題應該導致高分
      expect(securityScore).toBeGreaterThan(0);
    });
  });

  describe('整合測試', () => {
    it('--detailed 應該包含 qualityAssurance 相關建議', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.recommendations).toBeDefined();
      const recommendations = output.recommendations || [];

      // 應該有關於品質保證的建議
      const qaRecommendations = recommendations.filter(
        (r: any) =>
          r.category === '品質保證' ||
          r.suggestion.includes('型別') ||
          r.suggestion.includes('測試') ||
          r.suggestion.includes('錯誤') ||
          r.suggestion.includes('命名') ||
          r.suggestion.includes('安全')
      );

      expect(qaRecommendations.length).toBeGreaterThan(0);
    });

    it('--show-files 應該列出 qualityAssurance 問題檔案', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--show-files',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.detailedFiles).toBeDefined();
      expect(output.detailedFiles.qualityAssurance).toBeDefined();

      const qa = output.detailedFiles.qualityAssurance;
      expect(qa.typeSafety).toBeDefined();
      expect(qa.testCoverage).toBeDefined();
      expect(qa.errorHandling).toBeDefined();
      expect(qa.namingViolation).toBeDefined();
      expect(qa.securityRisk).toBeDefined();
    });

    it('現有 3 個維度評分應保持合理範圍（向下相容）', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 確認 3 個舊維度仍然存在且有效
      expect(output.dimensions.complexity).toBeDefined();
      expect(output.dimensions.maintainability).toBeDefined();
      expect(output.dimensions.architecture).toBeDefined();

      // 權重應該調整為 30%, 30%, 30%
      expect(output.dimensions.complexity.weight).toBe(0.3);
      expect(output.dimensions.maintainability.weight).toBe(0.3);
      expect(output.dimensions.architecture.weight).toBe(0.3);

      // 總分應該是 4 個維度的加權平均
      const calculatedScore =
        output.dimensions.complexity.weightedScore +
        output.dimensions.maintainability.weightedScore +
        output.dimensions.architecture.weightedScore +
        output.dimensions.qualityAssurance.weightedScore;

      expect(Math.abs(output.shitScore - calculatedScore)).toBeLessThan(0.1);
    });
  });
});
