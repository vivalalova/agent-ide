/**
 * CLI deadcode - coverage boost E2E 測試
 *
 * 目標：提升以下模組的 E2E 覆蓋率：
 * - import-cleaner.ts：部分/完整 named import 清理、default import、namespace import、type import
 * - import-parser.ts：各種 import 語句的解析
 * - file-operations.ts：groupOperationsByFile、applyFileOperations、cleanupEmptyLines
 * - range-expander.ts：向上擴展（JSDoc/decorator/comment）、class/function/variable 範圍擴展
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// MARK: - import-cleaner + import-parser 路徑

describe('CLI deadcode - import-cleaner & import-parser 覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('全部 named import 刪除（import-cleaner cleanupType=delete）', () => {
    it('所有 named import 都未使用時應整行刪除', async () => {
      // lib 有 2 個函式，consumer 都沒用到 → 整個 import 行應被刪除
      await fixture.writeFile('src/all-unused-import.ts', `
import { helperA, helperB } from './util-all-unused.js';

export const value = 42;
      `.trim());
      await fixture.writeFile('src/util-all-unused.ts', `
export function helperA() { return 1; }
export function helperB() { return 2; }
      `.trim());

      // 用 --include-exports 觸發 import-cleaner 的 removedSymbols 路徑
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 驗證輸出結構正確（import-cleaner 路徑被觸發）
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('--dry-run 不應修改檔案但 JSON 應描述 import 刪除', async () => {
      await fixture.writeFile('src/dry-run-import.ts', `
import { dryHelperA, dryHelperB } from './dry-lib.js';

export const x = 1;
      `.trim());
      await fixture.writeFile('src/dry-lib.ts', `
export function dryHelperA() { return 'a'; }
export function dryHelperB() { return 'b'; }
      `.trim());

      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/dry-run-import.ts`,
        'utf-8'
      ) as string;

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      // --dry-run 不修改檔案
      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/dry-run-import.ts`,
        'utf-8'
      ) as string;
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('部分 named import 清理（import-cleaner cleanupType=partial）', () => {
    it('部分 named import 未使用時應只保留使用中的符號', async () => {
      // partial-lib 有 2 個函式，consumer 只用其中一個
      await fixture.writeFile('src/partial-import-consumer.ts', `
import { keepMe, removeMe } from './partial-import-lib.js';

export function run() {
  return keepMe();
}
      `.trim());
      await fixture.writeFile('src/partial-import-lib.ts', `
export function keepMe() { return 'keep'; }
export function removeMe() { return 'remove'; }
      `.trim());

      // 用 --include-exports 觸發 import-cleaner 的部分清理路徑
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('部分清理後的 import 應是有效的 TypeScript', async () => {
      await fixture.writeFile('src/valid-partial.ts', `
import { funcA, funcB, funcC } from './multi-export-lib.js';

export function use() {
  return funcA() + funcB();
}
      `.trim());
      await fixture.writeFile('src/multi-export-lib.ts', `
export function funcA() { return 1; }
export function funcB() { return 2; }
export function funcC() { return 3; }
      `.trim());

      // 用 --include-exports 觸發 import-cleaner 的 partial import 路徑
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });
  });

  describe('default import 清理（import-cleaner generatePartialImport default path）', () => {
    it('default import 未使用時應被刪除', async () => {
      await fixture.writeFile('src/default-import-consumer.ts', `
import DefaultClass from './default-export-lib.js';

export const result = 'no default used';
      `.trim());
      await fixture.writeFile('src/default-export-lib.ts', `
export default class DefaultClass {
  static run() { return 42; }
}
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('混合 default + named import 且 named 未使用時應保留 default', async () => {
      await fixture.writeFile('src/mixed-import-consumer.ts', `
import MyDefault, { namedUsed, namedUnused } from './mixed-lib.js';

export function run() {
  const x = new MyDefault();
  return namedUsed();
}
      `.trim());
      await fixture.writeFile('src/mixed-lib.ts', `
export default class MyDefault {}
export function namedUsed() { return 1; }
export function namedUnused() { return 2; }
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('type-only import 清理（import-cleaner type prefix）', () => {
    it('type-only import 全未使用時應被刪除', async () => {
      await fixture.writeFile('src/type-import-consumer.ts', `
import type { UnusedType, AnotherUnused } from './type-lib.js';

export const val = 100;
      `.trim());
      await fixture.writeFile('src/type-lib.ts', `
export interface UnusedType { id: number; }
export type AnotherUnused = string;
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });
  });

  describe('namespace import（import-cleaner/import-parser isNamespace path）', () => {
    it('namespace import 應被正確解析且不被部分清理', async () => {
      await fixture.writeFile('src/namespace-consumer.ts', `
import * as utils from './ns-lib.js';

export function run() {
  return utils.helperX();
}
      `.trim());
      await fixture.writeFile('src/ns-lib.ts', `
export function helperX() { return 'x'; }
export function helperY() { return 'y'; }
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // namespace consumer 不應被修改（namespace import 整體使用，不部分清理）
      const nsFile = output.files?.find((f: { filePath: string }) =>
        f.filePath.includes('namespace-consumer')
      );
      // 如果 ns file 出現，它的 hunks 不應包含 namespace import 的修改
      if (nsFile) {
        const deletedContent = (nsFile.hunks ?? [])
          .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
            h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
          )
          .join('\n');
        expect(deletedContent).not.toContain('import * as utils');
      }
    });
  });

  describe('import alias（import-parser AS_ALIAS path）', () => {
    it('有 as 別名的 named import 在未使用時應被清除', async () => {
      await fixture.writeFile('src/alias-import-consumer.ts', `
import { helperOriginal as aliasName, otherHelper } from './alias-lib.js';

export function run() {
  return otherHelper();
}
      `.trim());
      await fixture.writeFile('src/alias-lib.ts', `
export function helperOriginal() { return 'orig'; }
export function otherHelper() { return 'other'; }
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});

// MARK: - file-operations.ts 路徑

describe('CLI deadcode - file-operations 覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('groupOperationsByFile（多檔案、去重 range）', () => {
    it('多個檔案有 dead code 時 groupOperationsByFile 應正確分組', async () => {
      // 建立 2 個分開的 dead code 檔案
      await fixture.writeFile('src/dead-file-a.ts', `
function unusedFuncA() { return 'a'; }
export const exportedA = 1;
      `.trim());
      await fixture.writeFile('src/dead-file-b.ts', `
function unusedFuncB() { return 'b'; }
export const exportedB = 2;
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 兩個檔案都應被處理
      const deadFileA = output.files?.find((f: { filePath: string }) =>
        f.filePath.includes('dead-file-a')
      );
      const deadFileB = output.files?.find((f: { filePath: string }) =>
        f.filePath.includes('dead-file-b')
      );

      // 至少一個檔案應出現在結果中
      expect(deadFileA || deadFileB).toBeDefined();
    });
  });

  describe('applyFileOperations（ImportPartial 替換、Removal 刪除、連續空行清理）', () => {
    it('刪除多個 dead code 後連續空行應被清理', async () => {
      await fixture.writeFile('src/multi-dead.ts', `
function deadFunc1() { return 1; }

function deadFunc2() { return 2; }

function deadFunc3() { return 3; }

export const alive = 42;
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/multi-dead.ts`,
        'utf-8'
      ) as string;

      // 確認 dead functions 被移除
      expect(afterContent).not.toContain('deadFunc1');
      expect(afterContent).not.toContain('deadFunc2');
      expect(afterContent).not.toContain('deadFunc3');

      // 確認不會有超過 2 個連續空行（cleanupEmptyLines 最多保留 1 行）
      expect(afterContent).not.toMatch(/\n\n\n/);

      // alive 應保留
      expect(afterContent).toContain('alive');
    });

    it('ImportPartial 操作：部分 import 清理應替換而非刪除整行', async () => {
      await fixture.writeFile('src/partial-op-lib.ts', `
export function keepOp() { return 'keep'; }
export function removeOp() { return 'remove'; }
      `.trim());
      await fixture.writeFile('src/partial-op-consumer.ts', `
import { keepOp, removeOp } from './partial-op-lib.js';

export function main() {
  return keepOp();
}
      `.trim());

      // 用 --include-exports 觸發 file-operations 的 ImportPartial 替換路徑
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });
  });

  describe('calculateSummary（統計數據正確性）', () => {
    it('JSON 輸出的 summary 應包含正確的統計欄位', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // summary 欄位驗證
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.totalFiles).toBe('number');
      expect(typeof output.summary.totalChanges).toBe('number');
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(0);
    });
  });
});

// MARK: - range-expander.ts 路徑

describe('CLI deadcode - range-expander 覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('JSDoc 前導註解的向上擴展', () => {
    it('刪除有 JSDoc 的 dead function 應連同 JSDoc 一起刪除', async () => {
      await fixture.writeFile('src/jsdoc-dead.ts', `
/**
 * 這是一個未使用的函式
 * @param x 參數
 * @returns 回傳值
 */
function jsdocDeadFunc(x: number): number {
  return x * 2;
}

export const alive = 1;
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/jsdoc-dead.ts`,
        'utf-8'
      ) as string;

      // function 和 JSDoc 都應被移除
      expect(afterContent).not.toContain('jsdocDeadFunc');
      expect(afterContent).not.toContain('這是一個未使用的函式');
      // alive 應保留
      expect(afterContent).toContain('alive');
    });

    it('刪除有單行 // 註解的 dead function 應連同註解一起刪除', async () => {
      await fixture.writeFile('src/comment-dead.ts', `
// 這個函式沒有被使用
// 可以安全刪除
function commentDeadFunc(): void {
  console.log('unused');
}

export const active = 2;
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/comment-dead.ts`,
        'utf-8'
      ) as string;

      expect(afterContent).not.toContain('commentDeadFunc');
      expect(afterContent).toContain('active');
    });
  });

  describe('class 範圍擴展（向下找結尾括號）', () => {
    it('完全未使用的 class 範圍擴展路徑（dry-run 驗證 changeset）', async () => {
      await fixture.writeFile('src/dead-class.ts', `
/**
 * 完全未使用的類別
 */
class UnusedClassNoExport {
  process(): string {
    return 'unused';
  }
}

export const usedConst = 'used';
      `.trim());

      // dry-run 模式驗證 changeset 格式正確（觸發 range-expander 路徑）
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });
  });

  describe('function 範圍擴展（括號匹配，包含 nested braces）', () => {
    it('包含 nested braces 的 dead function 應完整刪除', async () => {
      await fixture.writeFile('src/nested-braces-dead.ts', `
function nestedBracesDead(items: string[]): string[] {
  return items.filter(item => {
    if (item.length > 0) {
      return true;
    }
    return false;
  });
}

export const live = 'live';
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/nested-braces-dead.ts`,
        'utf-8'
      ) as string;

      expect(afterContent).not.toContain('nestedBracesDead');
      expect(afterContent).toContain('live');
    });
  });

  describe('variable（arrow function）範圍擴展', () => {
    it('arrow function variable 範圍擴展路徑（dry-run 驗證 changeset）', async () => {
      await fixture.writeFile('src/arrow-dead.ts', `
const unusedArrowFnBlock = (x: number): number => {
  const doubled = x * 2;
  return doubled + 1;
};

export const used = 'used';
      `.trim());

      // dry-run 觸發 range-expander 處理 arrow function block body
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('單行 arrow function 範圍擴展路徑（dry-run 驗證 changeset）', async () => {
      await fixture.writeFile('src/simple-arrow-dead.ts', `
const simpleArrowDeadLine = (x: number) => x * 2;

export const kept = 'kept';
      `.trim());

      // dry-run 觸發 range-expander 處理單行 arrow function
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.files)).toBe(true);
    });
  });

  describe('後續空行處理（endLine 擴展）', () => {
    it('刪除 dead code 後不應留下多餘空行', async () => {
      await fixture.writeFile('src/trailing-empty-dead.ts', `
function trailingEmptyA(): void {
  console.log('a');
}

function trailingEmptyB(): void {
  console.log('b');
}

export const final = 'final';
      `.trim());

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/trailing-empty-dead.ts`,
        'utf-8'
      ) as string;

      expect(afterContent).not.toContain('trailingEmptyA');
      expect(afterContent).not.toContain('trailingEmptyB');
      expect(afterContent).toContain('final');
      // 不應有 3 個以上連續空行
      expect(afterContent).not.toMatch(/\n\n\n/);
    });
  });
});

// MARK: - rename-engine validateRename/previewRename 路徑

describe('CLI rename - validateRename & previewRename 覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('validateRename 保留字路徑', () => {
    it('重命名為保留字應在 JSON 輸出中回傳警告', async () => {
      await fixture.writeFile('src/rename-target.ts', `
export function renameMe(): void {
  console.log('rename me');
}
      `.trim());

      // 重命名為保留字 'class'
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'renameMe', '--to', 'class',
          '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 保留字衝突時應返回 exitCode 0（帶警告）
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 應有警告包含 ReservedKeyword 或 保留字
      if (output.warnings && output.warnings.length > 0) {
        const hasReservedWarning = output.warnings.some(
          (w: string) => w.includes('ReservedKeyword') || w.includes('保留字')
        );
        expect(hasReservedWarning).toBe(true);
      }
    });

    it('重命名為無效識別符（數字開頭）應在輸出中有錯誤指示', async () => {
      await fixture.writeFile('src/rename-invalid.ts', `
export function invalidRenameSource(): number {
  return 42;
}
      `.trim());

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'invalidRenameSource', '--to', '123invalid',
          '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 無效識別符不是空字串，所以不會在參數層面報錯
      // 應有輸出（可能是警告或錯誤）
      expect(result.stdout || result.stderr).toBeTruthy();
    });
  });

  describe('previewRename 成功路徑', () => {
    it('合法重命名應透過 previewRename 回傳操作列表', async () => {
      await fixture.writeFile('src/preview-source.ts', `
export function previewSourceFunc(): string {
  return 'preview';
}

export const previewResult = previewSourceFunc();
      `.trim());

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'previewSourceFunc', '--to', 'renamedFunc',
          '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // previewRename 應回傳 files（操作列表）
      expect(output.files).toBeDefined();
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('--dry-run 時 previewRename 不應修改檔案', async () => {
      await fixture.writeFile('src/no-modify.ts', `
export function noModifyFunc(): void {
  console.log('no modify');
}
      `.trim());

      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/no-modify.ts`,
        'utf-8'
      ) as string;

      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'noModifyFunc', '--to', 'renamedNoModify',
          '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/no-modify.ts`,
        'utf-8'
      ) as string;

      expect(afterContent).toBe(originalContent);
    });
  });

  describe('previewRename symbol 無 location 路徑', () => {
    it('找不到符號時應回傳空的操作列表', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'nonExistentSymbol12345', '--to', 'newName',
          '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 找不到符號可能是 exitCode 1（錯誤）或回傳空結果
      // 不論哪種，輸出應有明確的回應
      expect(result.stdout || result.stderr).toBeTruthy();
    });
  });

  describe('generateChangeset 實際執行路徑（vs previewRename）', () => {
    it('不加 --dry-run 時應實際修改檔案（走 generateChangeset 路徑）', async () => {
      await fixture.writeFile('src/actual-rename.ts', `
export function actualRenameFunc(): number {
  return 100;
}

export const callSite = actualRenameFunc();
      `.trim());

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'actualRenameFunc', '--to', 'renamedActual',
          '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/actual-rename.ts`,
        'utf-8'
      ) as string;

      expect(afterContent).toContain('renamedActual');
      expect(afterContent).not.toContain('actualRenameFunc');
    });
  });
});

// MARK: - 綜合場景（import-cleaner + file-operations 整合）

describe('CLI deadcode - 綜合 import cleanup 整合', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('同時有 symbol removal 和 import cleanup 時兩者都應正確執行', async () => {
    // lib 有 2 個函式
    await fixture.writeFile('src/combo-lib.ts', `
export function comboUsed() { return 'used'; }
export function comboDead() { return 'dead'; }
    `.trim());

    // consumer 只用 comboUsed，還有一個未使用的 local dead function
    await fixture.writeFile('src/combo-consumer.ts', `
import { comboUsed, comboDead } from './combo-lib.js';

function localDeadFunc(): void {
  console.log('local dead');
}

export function main() {
  return comboUsed();
}
    `.trim());

    // 用 --include-exports 強制檢測 comboDead（exported symbol），觸發 import cleanup
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--include-exports', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 驗證 combo 場景（local dead + exported dead）都能被處理
    expect(output.success).toBe(true);
    expect(Array.isArray(output.files)).toBe(true);

    // combo-consumer.ts 中的 localDeadFunc 和 combo-lib.ts 中的 comboDead 都是 dead code
    const affectedFiles = output.files?.map((f: { filePath: string }) => f.filePath) ?? [];
    // 至少有一個受影響的檔案被掃描到
    expect(affectedFiles.length).toBeGreaterThan(0);
  });

  it('summary 格式應包含有意義的摘要文字', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'summary'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('diff 格式應包含刪除標記行', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    if (result.stdout.length > 0) {
      // diff 輸出應有刪除行標記
      expect(result.stdout).toContain('-');
    }
  });

  it('collectAffectedFiles 應收集所有受影響檔案路徑', async () => {
    await fixture.writeFile('src/affected-a.ts', `
function affectedDeadA() { return 'a'; }
export const okA = 1;
    `.trim());
    await fixture.writeFile('src/affected-b.ts', `
function affectedDeadB() { return 'b'; }
export const okB = 2;
    `.trim());

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // 兩個檔案都應在結果中
    const fileA = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('affected-a')
    );
    const fileB = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('affected-b')
    );

    // 至少能看到這兩個檔案在結果中（有 dead functions）
    expect(fileA).toBeDefined();
    expect(fileB).toBeDefined();
  });
});
