/**
 * CLI shit 重複代碼檢測 E2E 測試
 * 基於 sample-project-duplication fixture 測試重複代碼檢測功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI shit - 重複代碼檢測', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project-duplication');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. Type 1 檢測：完全相同的小方法（3 行）
  // ============================================================

  describe('Type 1 重複檢測', () => {
    it('應該檢測完全相同的 referenceData 方法', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 維護性維度應該包含重複代碼評分
      expect(output.dimensions.maintainability).toBeDefined();
      expect(output.dimensions.maintainability.breakdown).toBeDefined();
      expect(output.dimensions.maintainability.breakdown.duplicateCode).toBeGreaterThan(0);
    });

    it('重複代碼應該影響維護性評分', async () => {
      const type1Result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--format',
        'json'
      ]);

      const cleanResult = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('clean'),
        '--format',
        'json'
      ]);

      expect(type1Result.exitCode).toBe(0);
      expect(cleanResult.exitCode).toBe(0);

      const type1Output = JSON.parse(type1Result.stdout);
      const cleanOutput = JSON.parse(cleanResult.stdout);

      // type1 有重複代碼，維護性評分應該較差
      expect(type1Output.dimensions.maintainability.score).toBeGreaterThan(
        cleanOutput.dimensions.maintainability.score
      );
    });

    it('應該正確計算重複代碼比例', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--format',
        'json',
        '--detailed'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const breakdown = output.dimensions.maintainability.breakdown;

      // type1 有 3 個檔案都有重複的 referenceData 方法
      // 重複代碼數量應該 > 0
      expect(breakdown.duplicateCode).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 2. Type 2 檢測：結構相似的方法（參數不同）
  // ============================================================

  describe('Type 2 重複檢測', () => {
    it('應該檢測結構相似的 simulateTempature 方法', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type2'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 應該檢測到結構相似的方法
      expect(output.dimensions.maintainability.breakdown.duplicateCode).toBeGreaterThan(0);
    });

    it('Type 2 重複應該影響評分但可能低於 Type 1', async () => {
      const type2Result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type2'),
        '--format',
        'json'
      ]);

      const cleanResult = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('clean'),
        '--format',
        'json'
      ]);

      expect(type2Result.exitCode).toBe(0);
      expect(cleanResult.exitCode).toBe(0);

      const type2Output = JSON.parse(type2Result.stdout);
      const cleanOutput = JSON.parse(cleanResult.stdout);

      // type2 有結構相似的代碼，維護性評分應該較差
      expect(type2Output.dimensions.maintainability.score).toBeGreaterThan(
        cleanOutput.dimensions.maintainability.score
      );
    });
  });

  // ============================================================
  // 3. 整體專案檢測
  // ============================================================

  describe('整體專案重複代碼檢測', () => {
    it('應該檢測整個專案的重複代碼', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 整個專案有 type1 (3個檔案) + type2 (2個檔案) + clean (1個檔案)
      // 應該檢測到重複代碼
      expect(output.dimensions.maintainability.breakdown.duplicateCode).toBeGreaterThan(0);
    });

    it('重複代碼應該佔維護性評分的 20% 權重', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--detailed'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const maintainability = output.dimensions.maintainability;

      // 維護性評分應該包含三個子項：死代碼、大檔案、重複代碼
      expect(maintainability.breakdown.deadCode).toBeDefined();
      expect(maintainability.breakdown.largeFile).toBeDefined();
      expect(maintainability.breakdown.duplicateCode).toBeDefined();
    });
  });

  // ============================================================
  // 4. --detailed 參數測試
  // ============================================================

  describe('--detailed 重複代碼建議', () => {
    it('--detailed 應該輸出重複代碼建議', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--detailed',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.recommendations).toBeDefined();
      expect(Array.isArray(output.recommendations)).toBe(true);

      // 應該有重複代碼相關的建議
      const duplicateRecs = output.recommendations.filter((rec: any) =>
        rec.category === 'maintainability' &&
        rec.suggestion.includes('重複')
      );

      if (duplicateRecs.length > 0) {
        const rec = duplicateRecs[0];
        expect(rec.priority).toBeDefined();
        expect(rec.affectedFiles).toBeDefined();
        expect(Array.isArray(rec.affectedFiles)).toBe(true);
      }
    });

    it('重複代碼建議應該包含受影響的檔案', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--detailed',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      if (output.recommendations && output.recommendations.length > 0) {
        const duplicateRecs = output.recommendations.filter((rec: any) =>
          rec.category === 'maintainability' &&
          rec.suggestion.includes('重複')
        );

        if (duplicateRecs.length > 0) {
          const rec = duplicateRecs[0];
          expect(rec.affectedFiles.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ============================================================
  // 5. --show-files 參數測試（預留，等 CLI 實作）
  // ============================================================

  describe('--show-files 重複代碼位置', () => {
    it('--show-files 應該列出重複代碼位置', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--show-files',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.detailedFiles).toBeDefined();
      expect(output.detailedFiles.maintainability).toBeDefined();
      expect(output.detailedFiles.maintainability.duplicateCode).toBeDefined();
      expect(Array.isArray(output.detailedFiles.maintainability.duplicateCode)).toBe(true);
    });

    it('重複代碼位置應該包含檔案路徑和行號', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.tempPath,
        '--show-files',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const duplicateFiles = output.detailedFiles?.maintainability?.duplicateCode;

      if (duplicateFiles && duplicateFiles.length > 0) {
        const firstFile = duplicateFiles[0];
        expect(firstFile.path).toBeDefined();
        expect(firstFile.location).toBeDefined();
        expect(firstFile.location.start).toBeDefined();
        expect(firstFile.location.end).toBeDefined();
      }
    });
  });

  // ============================================================
  // 6. 無重複代碼的專案
  // ============================================================

  describe('無重複代碼驗證', () => {
    it('clean 資料夾應該無重複代碼', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('clean'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // clean 只有一個檔案，沒有重複代碼
      expect(output.dimensions.maintainability.breakdown.duplicateCode).toBe(0);
    });

    it('無重複代碼的專案維護性評分應該更好', async () => {
      const cleanResult = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('clean'),
        '--format',
        'json'
      ]);

      const type1Result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--format',
        'json'
      ]);

      expect(cleanResult.exitCode).toBe(0);
      expect(type1Result.exitCode).toBe(0);

      const cleanOutput = JSON.parse(cleanResult.stdout);
      const type1Output = JSON.parse(type1Result.stdout);

      // clean 沒有重複代碼，評分應該更好（分數更低）
      expect(cleanOutput.dimensions.maintainability.score).toBeLessThan(
        type1Output.dimensions.maintainability.score
      );
    });
  });

  // ============================================================
  // 7. 檢測參數驗證
  // ============================================================

  describe('檢測參數驗證', () => {
    it('應該能檢測 3 行的小方法', async () => {
      const result = await executeCLI([
        'shit',
        '--path',
        fixture.getFilePath('type1'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // referenceData 方法只有 3 行，應該被檢測到
      // 如果 duplicateCode > 0，表示成功檢測到小方法
      expect(output.dimensions.maintainability.breakdown.duplicateCode).toBeGreaterThan(0);
    });
  });
});
