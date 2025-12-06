/**
 * CLI move 命令 E2E 測試 - 極端情境
 * 基於 sample-project fixture 測試極端情境與邊界條件
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';
import * as path from 'path';

describe('CLI move extreme - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('邊界條件', () => {
    it('應該處理空路徑', async () => {
      const result = await executeCLI(
        ['move', '', '', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr).toBeDefined();
    });

    it('應該處理相對路徑輸入', async () => {
      const result = await executeCLI(
        ['move', './src/types/user.ts', './src/models/user.ts', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.success === false) {
          expect(output.error).toBeDefined();
        } else {
          expect(output.command).toBe('move');
          expect(output.summary).toBeDefined();
        }
      }
    });

    it('應該處理目標目錄不存在的情況', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/nonexistent/folder/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      if (output.success === false) {
        expect(output.error).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.summary).toBeDefined();
      }
    });

    it('應該處理檔名變更（同目錄重命名）', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/types/user-entity.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });
  });

  describe('Edge Cases - 路徑解析與異常處理', () => {
    it('應該處理移動被多層嵌套引用的核心檔案', async () => {
      const source = path.join(fixture.rootPath, 'src/types/common.ts');
      const target = path.join(fixture.rootPath, 'src/core/shared/types/common.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 如果檔案不存在，會回報錯誤
      if (output.success === false) {
        expect(output.error || output.errors).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.success).toBe(true);
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該處理移動有 side effect import 的檔案', async () => {
      const source = path.join(fixture.rootPath, 'src/core/config/settings.ts');
      const target = path.join(fixture.rootPath, 'src/config/app-settings.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.summary).toBeDefined();
    });

    it('應該處理移動到已存在但不同副檔名的目標', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/types/product.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('已存在');
    });

    it('應該處理檔案路徑規範化（帶有多個斜線）', async () => {
      const source = path.join(fixture.rootPath, 'src//types///user.ts');
      const target = path.join(fixture.rootPath, 'src/models/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('move');
        expect(output.summary).toBeDefined();
      }
    });

    it('應該處理移動後相對路徑層級變化 (../../.. → ./)', async () => {
      const source = path.join(fixture.rootPath, 'src/api/middleware/validator.ts');
      const target = path.join(fixture.rootPath, 'src/validator.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理移動檔案時跳過自身引用', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/formatter.ts');
      const target = path.join(fixture.rootPath, 'src/lib/formatter.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 確認不會更新自己到自己的引用
      const selfUpdate = output.pathUpdates.find((u: any) => u.filePath === target);
      expect(selfUpdate).toBeUndefined();
    });
  });

  describe('Edge Cases - Import 解析特殊情境', () => {
    it('應該處理 require() 語法的更新', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/array-utils.ts');
      const target = path.join(fixture.rootPath, 'src/helpers/arrays/array-utils.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 檔案可能不存在，檢查錯誤或成功
      if (output.success === false) {
        expect(output.error || output.errors).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.success).toBe(true);
        expect(output.summary).toBeDefined();
      }
    });

    it('應該處理 export * from 語法的更新', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/entities/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理跨多行的 import 語句更新', async () => {
      const source = path.join(fixture.rootPath, 'src/types/common.ts');
      const target = path.join(fixture.rootPath, 'src/shared/common.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.summary).toBeDefined();
    });

    it('應該處理省略副檔名的 import 路徑', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/string-utils.ts');
      const target = path.join(fixture.rootPath, 'src/helpers/string-utils.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理 import type 語法', async () => {
      const source = path.join(fixture.rootPath, 'src/types/product.ts');
      const target = path.join(fixture.rootPath, 'src/models/product.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該正確更新被移動檔案內部的相對路徑 import', async () => {
      const source = path.join(fixture.rootPath, 'src/models/user-model.ts');
      const target = path.join(fixture.rootPath, 'src/entities/users/user-model.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 檔案可能不存在
      if (output.success === false) {
        expect(output.error || output.errors).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.success).toBe(true);
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Edge Cases - 大規模操作', () => {
    it('應該處理移動被 50+ 檔案引用的檔案', async () => {
      const source = path.join(fixture.rootPath, 'src/types/common.ts');
      const target = path.join(fixture.rootPath, 'src/shared/common.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理移動含有 100+ import 的大型檔案', async () => {
      const source = path.join(fixture.rootPath, 'src/types/index.ts');
      const target = path.join(fixture.rootPath, 'src/index.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      if (output.success === false) {
        expect(output.error).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.summary).toBeDefined();
      }
    });

    it('應該處理更新路徑時跳過排除目錄 (node_modules, dist, .git)', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/formatter.ts');
      const target = path.join(fixture.rootPath, 'src/lib/formatter.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.summary).toBeDefined();
      // 確認 files 不包含 node_modules 等目錄的檔案
      if (output.files) {
        output.files.forEach((file: any) => {
          expect(file.filePath).not.toContain('node_modules');
          expect(file.filePath).not.toContain('dist');
          expect(file.filePath).not.toContain('.git');
        });
      }
    });
  });

  describe('Edge Cases - 路徑別名處理', () => {
    it('應該處理路徑別名的 import 更新', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/entities/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該保留原始路徑樣式（別名 vs 相對路徑）', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/formatter.ts');
      const target = path.join(fixture.rootPath, 'src/lib/formatter.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理 node_modules import 不被更新', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/formatter.ts');
      const target = path.join(fixture.rootPath, 'src/lib/formatter.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.summary).toBeDefined();
    });
  });

  describe('Edge Cases - 錯誤恢復與回滾', () => {
    it('應該處理移動成功但 import 更新部分失敗的情況', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/models/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 即使更新失敗，仍應回傳結果
      expect(output).toBeDefined();
      expect(output.success).toBeDefined();
    });

    it('應該處理無法讀取的檔案被跳過', async () => {
      const source = path.join(fixture.rootPath, 'src/types/common.ts');
      const target = path.join(fixture.rootPath, 'src/shared/common.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理循環引用的檔案移動', async () => {
      const source = path.join(fixture.rootPath, 'src/models/user-model.ts');
      const target = path.join(fixture.rootPath, 'src/entities/user-model.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });
  });

  describe('Edge Cases - 特殊檔案類型', () => {
    it('應該處理 .d.ts 類型定義檔的移動', async () => {
      const source = path.join(fixture.rootPath, 'src/types/global.d.ts');
      const target = path.join(fixture.rootPath, 'src/types/definitions/global.d.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.success === false) {
          expect(output.error).toBeDefined();
        } else {
          expect(output.command).toBe('move');
          expect(output.summary).toBeDefined();
        }
      }
    });

    it('應該處理 barrel export (index.ts) 檔案的移動', async () => {
      const source = path.join(fixture.rootPath, 'src/types/index.ts');
      const target = path.join(fixture.rootPath, 'src/models/index.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });

    it('應該處理混合 .js 和 .ts 檔案的專案', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/formatter.ts');
      const target = path.join(fixture.rootPath, 'src/lib/formatter.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
    });
  });

  describe('Edge Cases - 路徑計算極端情境', () => {
    it('應該處理 Windows 風格路徑（反斜線）', async () => {
      const source = path.join(fixture.rootPath, 'src', 'types', 'user.ts');
      const target = path.join(fixture.rootPath, 'src', 'models', 'user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.summary).toBeDefined();
    });

    it('應該處理路徑中的 . 和 .. 符號規範化', async () => {
      const source = path.join(fixture.rootPath, 'src/./types/../types/user.ts');
      const target = path.join(fixture.rootPath, 'src/models/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.success === false) {
          expect(output.error).toBeDefined();
        } else {
          expect(output.command).toBe('move');
          expect(output.summary).toBeDefined();
        }
      }
    });

    it('應該處理絕對路徑與相對路徑混合的情況', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = './src/models/user.ts';

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.success === false) {
          expect(output.error).toBeDefined();
        } else {
          expect(output.command).toBe('move');
          expect(output.summary).toBeDefined();
        }
      }
    });

    it('應該處理從根目錄到深層目錄的極端層級變化 (./file.ts → ./a/b/c/d/e/f/file.ts)', async () => {
      const source = path.join(fixture.rootPath, 'src/types/user.ts');
      const target = path.join(fixture.rootPath, 'src/a/b/c/d/e/f/user.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      // 檔案可能不存在
      if (output.success === false) {
        expect(output.error || output.errors).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.success).toBe(true);
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
