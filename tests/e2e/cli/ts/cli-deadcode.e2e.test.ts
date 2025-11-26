/**
 * CLI dead-code 命令 E2E 測試
 * 測試各種 deadcode 檢測情況
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadReadOnlyFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI dead-code - 基於 deadcode-test fixture', () => {
  let fixture: FixtureProject;

  beforeAll(async () => {
    fixture = await loadReadOnlyFixture('deadcode-test');
  });

  // ============================================================
  // 1. 真正的 deadcode 檢測
  // ============================================================

  describe('真正的 deadcode 檢測', () => {
    it('應該檢測出未使用的函式', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/true-deadcode.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const trueDeadcodeFile = files.find((f: any) => f.path.includes('true-deadcode.ts'));

      expect(trueDeadcodeFile).toBeDefined();
      const deadCode = trueDeadcodeFile.deadCode || [];

      // 應該檢測到 unusedFunction
      const hasUnusedFunction = deadCode.some((dc: any) =>
        (dc.name === 'unusedFunction' || dc.symbol === 'unusedFunction') &&
        (dc.type === 'function' || dc.kind === 'function')
      );
      expect(hasUnusedFunction).toBe(true);
    });

    it('應該檢測出未使用的變數', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/true-deadcode.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const trueDeadcodeFile = files.find((f: any) => f.path.includes('true-deadcode.ts'));

      expect(trueDeadcodeFile).toBeDefined();
      const deadCode = trueDeadcodeFile.deadCode || [];

      // 應該檢測到 unusedVariable
      const hasUnusedVariable = deadCode.some((dc: any) =>
        (dc.name === 'unusedVariable' || dc.symbol === 'unusedVariable') &&
        (dc.type === 'variable' || dc.kind === 'variable')
      );
      expect(hasUnusedVariable).toBe(true);
    });

    it('應該檢測出未使用的類別', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/true-deadcode.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const trueDeadcodeFile = files.find((f: any) => f.path.includes('true-deadcode.ts'));

      expect(trueDeadcodeFile).toBeDefined();
      const deadCode = trueDeadcodeFile.deadCode || [];

      // 應該檢測到 UnusedClass
      const hasUnusedClass = deadCode.some((dc: any) =>
        (dc.name === 'UnusedClass' || dc.symbol === 'UnusedClass') &&
        (dc.type === 'class' || dc.kind === 'class')
      );
      expect(hasUnusedClass).toBe(true);
    });

    it('應該檢測出未使用的常數', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/true-deadcode.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const trueDeadcodeFile = files.find((f: any) => f.path.includes('true-deadcode.ts'));

      expect(trueDeadcodeFile).toBeDefined();
      const deadCode = trueDeadcodeFile.deadCode || [];

      // 應該檢測到 UNUSED_CONSTANT
      const hasUnusedConstant = deadCode.some((dc: any) =>
        (dc.name === 'UNUSED_CONSTANT' || dc.symbol === 'UNUSED_CONSTANT')
      );
      expect(hasUnusedConstant).toBe(true);
    });
  });

  // ============================================================
  // 2. 不應該誤報的情況
  // ============================================================

  describe('不應該誤報的情況', () => {
    it('不應該將 export 的符號標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/false-positive-cases.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const falsePosFile = files.find((f: any) => f.path.includes('false-positive-cases.ts'));

      if (falsePosFile && falsePosFile.deadCode) {
        const deadCode = falsePosFile.deadCode;

        // 不應該包含 exported 符號
        const hasExportedFunction = deadCode.some((dc: any) =>
          dc.name === 'exportedFunction' || dc.symbol === 'exportedFunction'
        );
        expect(hasExportedFunction).toBe(false);

        const hasExportedVariable = deadCode.some((dc: any) =>
          dc.name === 'exportedVariable' || dc.symbol === 'exportedVariable'
        );
        expect(hasExportedVariable).toBe(false);

        const hasExportedClass = deadCode.some((dc: any) =>
          dc.name === 'ExportedClass' || dc.symbol === 'ExportedClass'
        );
        expect(hasExportedClass).toBe(false);
      }
    });

    it('不應該將內部使用的 helper 函式標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/true-deadcode.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('true-deadcode.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // internalHelper 被 publicFunction 使用，不應該是 deadcode
        const hasInternalHelper = deadCode.some((dc: any) =>
          dc.name === 'internalHelper' || dc.symbol === 'internalHelper'
        );
        expect(hasInternalHelper).toBe(false);
      }
    });

    it('不應該將 callback 函式標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/false-positive-cases.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('false-positive-cases.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // dataHandler 被用作 callback，不應該是 deadcode
        const hasDataHandler = deadCode.some((dc: any) =>
          dc.name === 'dataHandler' || dc.symbol === 'dataHandler'
        );
        expect(hasDataHandler).toBe(false);
      }
    });

    it('不應該將遞迴函式標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/false-positive-cases.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('false-positive-cases.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // recursiveFunction 被 factorial 使用，不應該是 deadcode
        const hasRecursive = deadCode.some((dc: any) =>
          dc.name === 'recursiveFunction' || dc.symbol === 'recursiveFunction'
        );
        expect(hasRecursive).toBe(false);
      }
    });
  });

  // ============================================================
  // 3. 類別成員的檢測
  // ============================================================

  describe('類別成員的 deadcode 檢測', () => {
    it('不應該將 public 成員標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/class-members.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('class-members.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // public 成員不應該被標記為 deadcode
        const hasPublicMethod = deadCode.some((dc: any) =>
          dc.name === 'publicMethod' || dc.symbol === 'publicMethod'
        );
        expect(hasPublicMethod).toBe(false);
      }
    });

    it('不應該將 protected 成員標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/class-members.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('class-members.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // protected 成員不應該被標記為 deadcode
        const hasProtectedMethod = deadCode.some((dc: any) =>
          dc.name === 'protectedMethod' || dc.symbol === 'protectedMethod'
        );
        expect(hasProtectedMethod).toBe(false);
      }
    });

    it('應該檢測未使用的 private 成員', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/class-members.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('class-members.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // unusedPrivateMethod 應該被檢測為 deadcode
        const hasUnusedPrivate = deadCode.some((dc: any) =>
          dc.name === 'unusedPrivateMethod' || dc.symbol === 'unusedPrivateMethod'
        );
        expect(hasUnusedPrivate).toBe(true);
      }
    });

    it('不應該將已使用的 private 成員標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/class-members.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('class-members.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // usedPrivateMethod 被 callPrivate 使用，不應該是 deadcode
        const hasUsedPrivate = deadCode.some((dc: any) =>
          dc.name === 'usedPrivateMethod' || dc.symbol === 'usedPrivateMethod'
        );
        expect(hasUsedPrivate).toBe(false);
      }
    });
  });

  // ============================================================
  // 4. 複雜引用關係的檢測
  // ============================================================

  describe('複雜引用關係的檢測', () => {
    it('不應該將物件屬性引用的函式標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/complex-references.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('complex-references.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // helperFunction 透過物件屬性引用，不應該是 deadcode
        const hasHelperFunction = deadCode.some((dc: any) =>
          dc.name === 'helperFunction' || dc.symbol === 'helperFunction'
        );
        expect(hasHelperFunction).toBe(false);
      }
    });

    it('不應該將陣列元素引用的函式標記為 deadcode', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/complex-references.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('complex-references.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // arrayHelper 作為陣列元素，不應該是 deadcode
        const hasArrayHelper = deadCode.some((dc: any) =>
          dc.name === 'arrayHelper' || dc.symbol === 'arrayHelper'
        );
        expect(hasArrayHelper).toBe(false);
      }
    });

    it('應該檢測從未被引用的函式', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.getFilePath('src/complex-references.ts'),
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      const files = output.all || [];
      const file = files.find((f: any) => f.path.includes('complex-references.ts'));

      if (file && file.deadCode) {
        const deadCode = file.deadCode;

        // neverReferencedFunction 應該被檢測為 deadcode
        const hasNeverReferenced = deadCode.some((dc: any) =>
          dc.name === 'neverReferencedFunction' || dc.symbol === 'neverReferencedFunction'
        );
        expect(hasNeverReferenced).toBe(true);
      }
    });
  });

  // ============================================================
  // 5. 輸出格式測試
  // ============================================================

  describe('輸出格式測試', () => {
    it('預設應該只輸出有 deadcode 的檔案', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
        // 不加 --all
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // 預設應該只有 issues，沒有 all
      expect(output.issues).toBeDefined();
      expect(output.all).toBeUndefined();
      expect(output.summary).toBeDefined();

      // issues 只包含有 deadcode 的檔案
      for (const file of output.issues) {
        expect(file.deadCode.length).toBeGreaterThan(0);
      }
    });

    it('--all 應該輸出所有掃描的檔案', { timeout: 30000 }, async () => {
      const result = await executeCLI([
        'analyze',
        'dead-code',
        '--path',
        fixture.tempPath,
        '--format',
        'json',
        '--all'
      ], { timeout: 25000 });

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);

      // --all 應該有 all 和 issues
      expect(output.all).toBeDefined();
      expect(output.issues).toBeDefined();
      expect(output.summary).toBeDefined();

      // all 包含所有檔案（包括沒有 deadcode 的）
      expect(output.all.length).toBeGreaterThanOrEqual(output.issues.length);
    });
  });
});
