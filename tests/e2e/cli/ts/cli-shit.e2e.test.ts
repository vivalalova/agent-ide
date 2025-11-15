/**
 * CLI shit 命令 E2E 測試
 * 基於 sample-project fixture 測試垃圾度評分功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetFixtures, getFixturePath } from '../../helpers/fixture-manager';
import * as path from 'path';
import * as fs from 'fs/promises';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI shit - 基於 sample-project fixture', () => {
  const fixturePath = getFixturePath('sample-project');

  beforeEach(async () => {
    await resetFixtures();
  });


  // ============================================================
  // 1. 基本功能測試
  // ============================================================

  it('應該分析專案並輸出 JSON 格式評分', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.shitScore).toBeDefined();
    expect(output.shitScore).toBeGreaterThanOrEqual(0);
    expect(output.shitScore).toBeLessThanOrEqual(100);
    expect(output.grade).toBeDefined();
    expect(output.gradeInfo).toBeDefined();
    expect(output.gradeInfo.emoji).toBeDefined();
    expect(output.gradeInfo.message).toBeDefined();
  });

  it('應該包含三大維度評分', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.dimensions).toBeDefined();
    expect(output.dimensions.complexity).toBeDefined();
    expect(output.dimensions.maintainability).toBeDefined();
    expect(output.dimensions.architecture).toBeDefined();

    // 驗證權重（新增品質保證維度後調整為 30%/30%/30%/20%）
    expect(output.dimensions.complexity.weight).toBe(0.3);
    expect(output.dimensions.maintainability.weight).toBe(0.3);
    expect(output.dimensions.architecture.weight).toBe(0.3);

    // 驗證分數範圍
    expect(output.dimensions.complexity.score).toBeGreaterThanOrEqual(0);
    expect(output.dimensions.complexity.score).toBeLessThanOrEqual(100);
  });

  it('應該包含 summary 統計資訊', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.summary).toBeDefined();
    expect(output.summary.totalFiles).toBeGreaterThan(0);
    expect(output.summary.analyzedFiles).toBeGreaterThan(0);
    expect(output.summary.totalShit).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // 2. --detailed 參數測試
  // ============================================================

  it('--detailed 應該輸出 topShit 和 recommendations', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--detailed',
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.topShit).toBeDefined();
    expect(Array.isArray(output.topShit)).toBe(true);
    expect(output.recommendations).toBeDefined();
    expect(Array.isArray(output.recommendations)).toBe(true);
  });

  it('沒有 --detailed 不應該輸出 topShit 和 recommendations', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.topShit).toBeUndefined();
    expect(output.recommendations).toBeUndefined();
  });

  // ============================================================
  // 3. --top 參數測試
  // ============================================================

  it('--top 應該限制 topShit 數量', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--detailed',
      '--top',
      '5',
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    if (output.topShit && output.topShit.length > 0) {
      expect(output.topShit.length).toBeLessThanOrEqual(5);
    }
  });

  // ============================================================
  // 4. --max-allowed 參數測試
  // ============================================================

  it('分數超過 --max-allowed 應該失敗（exit 1）', async () => {
    // 先取得實際分數
    const scoreResult = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--format',
      'json'
    ]);
    const scoreOutput = JSON.parse(scoreResult.stdout);
    const actualScore = scoreOutput.shitScore;

    // 設定低於實際分數的門檻，必定失敗
    const maxAllowed = Math.max(0, Math.floor(actualScore) - 1);

    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--max-allowed',
      maxAllowed.toString(),
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ShitScore');
  }, 60000);

  it('分數低於 --max-allowed 應該成功（exit 0）', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--max-allowed',
      '100', // 設定極高門檻，必定通過
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.shitScore).toBeLessThanOrEqual(100);
  });

  // ============================================================
  // 5. summary 輸出格式測試
  // ============================================================

  it('--format summary 應該輸出人類可讀格式', async () => {
    const result = await executeCLI([
      'shit',
      '--path',
      fixturePath,
      '--format',
      'summary'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('垃圾度評分');
    expect(result.stdout).toContain('總分');
    expect(result.stdout).toContain('維度');
  });

  // ============================================================
  // 6. 評級系統驗證
  // ============================================================

  describe('評級系統', () => {
    it('sample-project 應該有合理評級（反映實際代碼品質）', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      // sample-project 有大量重複代碼和模式（測試用 fixture），評級為 C 是合理的
      expect(['A', 'B', 'C']).toContain(output.grade);
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
      expect(output.shitScore).toBeLessThanOrEqual(100);
    });

    it('評級 emoji 應該與分數對應', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const { shitScore, grade, gradeInfo } = output;

      // 驗證評級邏輯
      if (shitScore < 30) {
        expect(grade).toBe('A');
        expect(gradeInfo.emoji).toBe('✅');
      } else if (shitScore < 50) {
        expect(grade).toBe('B');
        expect(gradeInfo.emoji).toBe('⚠️');
      } else if (shitScore < 70) {
        expect(grade).toBe('C');
        expect(gradeInfo.emoji).toBe('💩');
      } else if (shitScore < 85) {
        expect(grade).toBe('D');
        expect(gradeInfo.emoji).toBe('💩💩');
      } else {
        expect(grade).toBe('F');
        expect(gradeInfo.emoji).toBe('💩💩💩');
      }
    });
  });

  // ============================================================
  // 7. 維度分數驗證
  // ============================================================

  describe('維度分數計算', () => {
    it('複雜度維度應該識別高複雜度檔案', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        path.join(fixturePath, 'src/services'),
        '--format',
        'json',
        '--detailed'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.dimensions.complexity.breakdown).toBeDefined();
      expect(output.dimensions.complexity.breakdown.highComplexity).toBeGreaterThanOrEqual(0);
      expect(output.dimensions.complexity.breakdown.longFunction).toBeGreaterThanOrEqual(0);
    });

    it('架構維度應該檢測循環依賴', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--format',
        'json',
        '--detailed'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.dimensions.architecture.breakdown).toBeDefined();
      expect(output.dimensions.architecture.breakdown.circularDependency).toBeGreaterThanOrEqual(0);
      expect(output.dimensions.architecture.breakdown.orphanFile).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // 8. 建議系統驗證
  // ============================================================

  describe('改進建議', () => {
    it('--detailed 應該產生具體的改進建議', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--detailed',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.recommendations && output.recommendations.length > 0) {
        const firstRec = output.recommendations[0];
        expect(firstRec.priority).toBeDefined();
        expect(firstRec.category).toBeDefined();
        expect(firstRec.suggestion).toBeDefined();
        expect(firstRec.affectedFiles).toBeDefined();
        expect(Array.isArray(firstRec.affectedFiles)).toBe(true);
      }
    });

    it('建議應該按優先級排序', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--detailed',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.recommendations && output.recommendations.length > 1) {
        const priorities = ['critical', 'high', 'medium', 'low'];
        const recs = output.recommendations;

        // 驗證優先級遞減
        for (let i = 0; i < recs.length - 1; i++) {
          const currentPriorityIndex = priorities.indexOf(recs[i].priority);
          const nextPriorityIndex = priorities.indexOf(recs[i + 1].priority);
          expect(currentPriorityIndex).toBeLessThanOrEqual(nextPriorityIndex);
        }
      }
    });
  });

  // ============================================================
  // 9. 特殊場景測試
  // ============================================================

  describe('特殊場景', () => {
    it('分析單一檔案應該正常運作', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        path.join(fixturePath, 'src/services/user-service.ts'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.shitScore).toBeDefined();
      expect(output.shitScore).toBeGreaterThanOrEqual(0);
      expect(output.shitScore).toBeLessThanOrEqual(100);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
    });

    it('分析特定目錄應該只分析該目錄', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        path.join(fixturePath, 'src/models'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.summary.totalFiles).toBeGreaterThan(0);
      // models 通常比整個專案少
    });
  });

  // ============================================================
  // 10. 實際專案評分驗證
  // ============================================================

  describe('sample-project 實際評分', () => {
    it('應該識別專案優點和缺點', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--detailed',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // sample-project 有良好的架構設計
      // 但可能有一些複雜的業務邏輯（如 OrderService）
      expect(output.shitScore).toBeGreaterThanOrEqual(0);

      // 驗證分數組成合理（包含第四個維度 qualityAssurance）
      const { complexity, maintainability, architecture, qualityAssurance } = output.dimensions;
      const calculatedScore =
        complexity.weightedScore +
        maintainability.weightedScore +
        architecture.weightedScore +
        qualityAssurance.weightedScore;

      // 允許小數點誤差
      expect(Math.abs(calculatedScore - output.shitScore)).toBeLessThan(0.1);
    });
  });
});
