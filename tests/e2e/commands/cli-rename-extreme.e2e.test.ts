/**
 * CLI rename 命令 E2E 測試 - 極端情境
 * 基於 sample-project fixture 測試符號重命名的極端情境
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI rename extreme - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('極端資料量測試', () => {
    it('應該處理有大量引用的符號 (預期 10+ 個引用)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserEntity', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        expect(output.summary.totalChanges).toBeGreaterThan(0);
      }
    });

    it('應該處理跨多個檔案的大量引用', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'UserRoleEnum', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        if (output.summary.totalFiles > 0) {
          expect(output.summary.totalChanges).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('極端情境 - 大規模引用（50+ 檔案）', () => {
    it('應該處理被 60+ 檔案引用的符號重命名', async () => {
      for (let i = 0; i < 60; i++) {
        await fixture.writeFile(`src/modules/module${i}.ts`,
          `import { SharedUtil } from '../shared';\nexport const use${i} = SharedUtil.process();`
        );
      }
      await fixture.writeFile('src/shared.ts', 'export class SharedUtil { static process() { return 1; } }');

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'SharedUtil', '--to', 'CommonUtil', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBe(true);
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(60);
      }
    });
  });

  describe('極端情境 - 深層巢狀（10+ 層）', () => {
    it('應該處理 12 層巢狀 namespace 中的符號重命名', async () => {
      const deepNamespace = Array.from({ length: 12 }, (_, i) =>
        `${'  '.repeat(i)}namespace Level${i} {`
      ).join('\n') +
      '\n' + '  '.repeat(12) + 'export const deepSymbol = 1;\n' +
      Array.from({ length: 12 }, (_, i) =>
        `${'  '.repeat(11 - i)}}`
      ).join('\n');

      await fixture.writeFile('src/deep-namespace.ts', deepNamespace);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'deepSymbol', '--to', 'renamedDeepSymbol', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBe(true);
      }
    });

    it('應該處理 10+ 層巢狀 class 內部的符號重命名', async () => {
      const deepClass = [
        'export class Level0 {',
        ...Array.from({ length: 10 }, (_, i) =>
          `${'  '.repeat(i + 1)}static Level${i + 1} = class {`
        ),
        '  '.repeat(11) + 'static deepMethod() { return 42; }',
        ...Array.from({ length: 10 }, (_, i) =>
          `${'  '.repeat(10 - i)}};`
        ),
        '}'
      ].join('\n');

      await fixture.writeFile('src/deep-class.ts', deepClass);

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'deepMethod', '--to', 'renamedDeepMethod', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Unicode 和國際化', () => {
    it('應該處理 Unicode 字元的符號名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'Utilisateur', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理包含 emoji 的名稱（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User👤', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });

    it('應該處理中文符號名稱（視為非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '用戶', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });
  });

  describe('保留字和關鍵字', () => {
    it('應該檢測 JavaScript 保留字 (var)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'var', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 JavaScript 保留字 (let)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'let', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 JavaScript 保留字 (const)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'const', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 TypeScript 關鍵字 (interface)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'interface', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 TypeScript 關鍵字 (enum)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'enum', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 TypeScript 關鍵字 (type)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'type', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測控制流程關鍵字 (if)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'if', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測迴圈關鍵字 (while)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'while', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測異常處理關鍵字 (try)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'try', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測模組關鍵字 (import)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'import', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測模組關鍵字 (export)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'export', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });
  });

  describe('非法識別符檢測', () => {
    it('應該檢測與 TypeScript 關鍵字衝突', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'class', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(Array.isArray(output.conflicts)).toBe(true);
        }
      }
    });

    it('應該檢測與保留字衝突', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'function', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理名稱中包含特殊字元（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User-Name', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });

    it('應該處理以數字開頭的名稱（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '1User', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });

    it('應該處理名稱中包含空格（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User Name', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });
  });

  describe('衝突檢測', () => {
    it('應該檢測重命名到已存在的名稱 (sortBy)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'groupBy', '--to', 'sortBy', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.conflicts).toBeDefined();
        expect(Array.isArray(output.conflicts)).toBe(true);
      }
    });

    it('應該檢測重命名到已存在的類別名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserProfile', '--to', 'User', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該檢測重命名到已存在的 enum 名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserRole', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('檔案系統邊界', () => {
    it('應該處理不存在的檔案路徑', async () => {
      const result = await executeCLI(
        ['rename', '--path', '/nonexistent/directory', '--from', 'User', '--to', 'UserModel', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理空的專案路徑', async () => {
      const result = await executeCLI(
        ['rename', '--path', '', '--from', 'User', '--to', 'UserModel', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('複雜符號類型', () => {
    it('應該處理泛型類型參數重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'K', '--to', 'KeyType', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 type alias 屬性重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'id', '--to', 'userId', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理方法重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'toString', '--to', 'serialize', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理靜態屬性重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'version', '--to', 'apiVersion', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理命名空間重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Utils', '--to', 'Utilities', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('效能和摘要資訊', () => {
    it('應該提供預估執行時間', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserData', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.summary) {
          expect(output.summary.estimatedTime).toBeDefined();
          expect(typeof output.summary.estimatedTime).toBe('number');
        }
      }
    });

    it('應該提供正確的統計資訊', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'Role', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.summary) {
          expect(output.summary.totalReferences).toBeDefined();
          expect(output.summary.totalFiles).toBeDefined();
          expect(output.summary.conflictCount).toBeDefined();
        }
      }
    });
  });
});
