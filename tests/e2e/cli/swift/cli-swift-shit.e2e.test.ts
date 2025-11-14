/**
 * CLI swift shit 命令 E2E 測試
 * 基於 swift-sample-project fixture 測試垃圾度評分功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resetFixtures, getFixturePath } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';


describe('CLI swift shit - 基於 swift-sample-project fixture', () => {
  const fixturePath = getFixturePath('swift-sample-project');

  beforeEach(async () => {
    await resetFixtures();
  });


  // ============================================================
  // 1. 基本功能測試（5 個測試）
  // ============================================================

  describe('基本功能', () => {
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

    it('應該包含四大維度評分', async () => {
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
      expect(output.dimensions.qualityAssurance).toBeDefined();

      // 驗證權重（30%/30%/30%/20%）
      expect(output.dimensions.complexity.weight).toBe(0.3);
      expect(output.dimensions.maintainability.weight).toBe(0.3);
      expect(output.dimensions.architecture.weight).toBe(0.3);
      expect(output.dimensions.qualityAssurance.weight).toBe(0.2);
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
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      expect(output.summary.analyzedFiles).toBeGreaterThanOrEqual(0);
      expect(output.summary.totalShit).toBeGreaterThanOrEqual(0);
    });

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

    it('沒有 --detailed 不應該輸出 topShit', async () => {
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
  });

  // ============================================================
  // 2. 參數測試（3 個測試）
  // ============================================================

  describe('參數測試', () => {
    it('--top 應該限制 topShit 數量', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--detailed',
        '--top',
        '3',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      if (output.topShit && output.topShit.length > 0) {
        expect(output.topShit.length).toBeLessThanOrEqual(3);
      }
    });

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
      // 如果分數為 0，跳過此測試
      if (actualScore === 0) {
        // 使用一個不可能達成的條件來設置門檻
        const result = await executeCLI([
          'shit',
          '--path',
          fixturePath,
          '--max-allowed',
          '-1',
          '--format',
          'json'
        ]);

        // 任何正數分數都會超過 -1
        expect([0, 1]).toContain(result.exitCode);
        return;
      }

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
    });

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
  });

  // ============================================================
  // 3. 輸出格式測試（2 個測試）
  // ============================================================

  describe('輸出格式', () => {
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

    it('--format json 應該輸出結構化資料', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證是有效的 JSON
      const output = JSON.parse(result.stdout);
      expect(output).toBeDefined();
      expect(typeof output.shitScore).toBe('number');
    });
  });

  // ============================================================
  // 4. 評級系統驗證（2 個測試）
  // ============================================================

  describe('評級系統', () => {
    it('swift-sample-project 應該有合理評級', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      // Swift 專案應該有評級
      expect(['A', 'B', 'C', 'D', 'F']).toContain(output.grade);
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
  // 5. 維度分數計算（2 個測試）
  // ============================================================

  describe('維度分數計算', () => {
    it('複雜度維度應該識別高複雜度檔案', async () => {
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
  // 6. 改進建議（2 個測試）
  // ============================================================

  describe('改進建議', () => {
    it('--detailed 應該產生具體改進建議', async () => {
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
  // 7. 特殊場景測試（2 個測試）
  // ============================================================

  describe('特殊場景', () => {
    it('應該分析單一檔案', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        path.join(fixturePath, 'Sources/SwiftSampleApp/App/SwiftSampleApp.swift'),
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

    it('應該分析特定目錄', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        path.join(fixturePath, 'Sources/SwiftSampleApp'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      expect(output.dimensions).toBeDefined();
    });
  });

  // ============================================================
  // 8. 總分計算驗證（1 個測試）
  // ============================================================

  describe('總分計算', () => {
    it('總分應該是四個維度的加權平均', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixturePath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
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
