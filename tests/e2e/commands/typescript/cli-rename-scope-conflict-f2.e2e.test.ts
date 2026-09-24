/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F2：rename 到同 scope 已存在名稱時無衝突警示、寫出重複宣告
 *
 * RenameEngine.generateChangeset() 只呼叫 validateRename()，而 validateRename()
 * 只檢查 ReservedKeyword／InvalidIdentifier 兩種衝突；RenameEngine 另外定義了
 * detectConflicts()（含 NameCollision／ScopeConflict 的作用域感知檢查，見
 * src/core/rename/rename-engine.ts:271-331），但這個方法從未被 generateChangeset
 * 呼叫——整段作用域衝突檢測邏輯是死碼，實際執行路徑上永遠不會產生
 * name_collision／scope_conflict 警告。結果：rename 到當前作用域已存在的名稱時，
 * command 層的 conflictWarnings 過濾（rename.command.ts）永遠是空陣列，非
 * dry-run 直接寫入，產生同一 scope 內兩個同名宣告（或改變外層閉包語意的
 * shadowing）而不警示。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 F2：同 scope 已存在名稱衝突未偵測', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[F2] 同函式 scope 內 rename 為已存在的區域變數名，dry-run 應在 conflicts 中標示衝突', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-scope1.ts`;
    const original = `export function scopeConflictF2a() {
  const scopeF2aA = 1;
  const scopeF2aB = 2;
  return scopeF2aA + scopeF2aB;
}
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'scopeF2aA', '--to', 'scopeF2aB',
        '--at', 'regression-f2-scope1.ts:2',
        '--dry-run', '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // 同一 function scope 內已存在 scopeF2aB，rename 後兩個宣告會撞名，
    // 必須在 conflicts 中出現（否則使用者完全看不到即將產生重複宣告）
    expect(output.conflicts).toBeDefined();
    expect(Array.isArray(output.conflicts)).toBe(true);
    expect(output.conflicts.length).toBeGreaterThan(0);
  });

  it('[F2] 同函式 scope 內 rename 為已存在名稱，非 dry-run 應拒絕寫入、不得產生重複宣告', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-scope2.ts`;
    const original = `export function scopeConflictF2b() {
  const scopeF2bA = 1;
  const scopeF2bB = 2;
  return scopeF2bA + scopeF2bB;
}
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'scopeF2bA', '--to', 'scopeF2bB',
        '--at', 'regression-f2-scope2.ts:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;

    // 必須拒絕寫入（exit 非 0），檔案維持原樣；絕不可 success 卻寫出
    // `const scopeF2bB = 1; const scopeF2bB = 2;` 這種重複宣告
    expect(result.exitCode).not.toBe(0);
    expect(updated).toBe(original);
  });

  it('[F2] rename 造成 shadowing（內層變數改名與外層同名）應標示衝突或整檔拒絕，不可靜默改變閉包語意', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-shadow.ts`;
    const original = `export function outerF2() {
  const outerValF2 = 1;
  function innerF2() {
    const innerValF2 = 2;
    return outerValF2 + innerValF2;
  }
  return innerF2();
}
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'innerValF2', '--to', 'outerValF2',
        '--at', 'regression-f2-shadow.ts:4',
        '--dry-run', '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // rename 後 inner 的 `outerValF2 + outerValF2`（原本是 outer + inner 兩個不同變數）
    // 語意整個變掉（永遠是 outerValF2 的兩倍），且產生對外層變數的 shadowing——
    // 必須在 conflicts 標示（scope_conflict／name_collision），不可悄悄放行
    expect(output.conflicts).toBeDefined();
    expect(Array.isArray(output.conflicts)).toBe(true);
    expect(output.conflicts.length).toBeGreaterThan(0);
  });

  it('[F2] 同模組頂層兩個 export 函式改名互撞應被偵測為衝突', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-toplevel.ts`;
    const original = `export function fooF2() {
  return 1;
}

export function barF2() {
  return 2;
}
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'fooF2', '--to', 'barF2',
        '--at', 'regression-f2-toplevel.ts:1',
        '--dry-run', '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // 頂層模組 scope 已存在 barF2，rename fooF2 → barF2 會撞名，必須標示衝突
    expect(output.conflicts).toBeDefined();
    expect(Array.isArray(output.conflicts)).toBe(true);
    expect(output.conflicts.length).toBeGreaterThan(0);
  });

  it('[F2] 內層變數改名為外層已存在名稱、但內層未引用外層該名時應允許（不誤擋）', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-no-block-inner.ts`;
    const original = `const sharedF2 = 1;
export function fNoBlockF2() {
  const localF2 = 2;
  return localF2;
}
export const sF2 = sharedF2;
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'localF2', '--to', 'sharedF2',
        '--at', 'regression-f2-no-block-inner.ts:3',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // 內層 localF2 只在函式內被使用，未引用外層 sharedF2，改名後不構成實際
    // 衝突（純粹是無交集的同名遮蔽），不可被誤擋
    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('const sharedF2 = 2;');
    expect(updated).toContain('return sharedF2;');
    expect(updated).toContain('const sharedF2 = 1;');
    expect(updated).toContain('export const sF2 = sharedF2;');
  });

  it('[F2] 參數改名為外層已存在名稱、但函式內未引用外層該名時應允許', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-no-block-param.ts`;
    const original = `const configF2 = 1;
export function gNoBlockF2(valueF2: number) {
  return valueF2;
}
export const cF2 = configF2;
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'valueF2', '--to', 'configF2',
        '--at', 'regression-f2-no-block-param.ts:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toContain('function gNoBlockF2(configF2: number)');
    expect(updated).toContain('return configF2;');
    expect(updated).toContain('const configF2 = 1;');
    expect(updated).toContain('export const cF2 = configF2;');
  });

  it('[F2] 函式改名為其參數名且遞迴呼叫時應擋（遞迴會改為呼叫參數）', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-recursive-param-collision.ts`;
    const original = `export function fooF2Rec(barF2Rec: number): number {
  return barF2Rec <= 0 ? 0 : fooF2Rec(barF2Rec - 1);
}
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'fooF2Rec', '--to', 'barF2Rec',
        '--at', 'regression-f2-recursive-param-collision.ts:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // 改名後遞迴呼叫 `fooF2Rec(barF2Rec - 1)` 會變成 `barF2Rec(barF2Rec - 1)`——
    // 呼叫的其實是同名參數而非函式本身，語意徹底損毀，必須拒絕且檔案不變
    expect(result.exitCode).not.toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toBe(original);
  });

  it('[F2] 內層以 shorthand property 引用外層名稱時，改名為該名應擋（避免 { shared } 被捕獲），非 dry-run 場景', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-shorthand-capture.ts`;
    const original = `const sharedF2Sh = 1;
export function fF2Sh() {
  const localF2Sh = 2;
  return { sharedF2Sh, localF2Sh };
}
export const sF2Sh = sharedF2Sh;
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'localF2Sh', '--to', 'sharedF2Sh',
        '--at', 'regression-f2-shorthand-capture.ts:3',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // `{ sharedF2Sh, localF2Sh }` 的 sharedF2Sh 是 shorthand property，讀的是外層變數；
    // 改名後內層宣告 `const sharedF2Sh = 2` 遮蔽外層，shorthand 的 sharedF2Sh 改讀
    // 內層值，物件字面值也產生兩個同名鍵——必須拒絕寫入、檔案不變
    expect(result.exitCode).not.toBe(0);
    const updated = await fixture.memfs.readFile(testFile, 'utf-8') as string;
    expect(updated).toBe(original);
  });

  it('[F2] 內層以 shorthand property 引用外層名稱時，改名為該名應擋，dry-run 場景須標示衝突', async () => {
    const testFile = `${fixture.rootPath}/regression-f2-shorthand-capture-dry.ts`;
    const original = `const sharedF2Sh2 = 1;
export function fF2Sh2() {
  const localF2Sh2 = 2;
  return { sharedF2Sh2, localF2Sh2 };
}
export const sF2Sh2 = sharedF2Sh2;
`;
    await fixture.memfs.writeFile(testFile, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'localF2Sh2', '--to', 'sharedF2Sh2',
        '--at', 'regression-f2-shorthand-capture-dry.ts:3',
        '--dry-run', '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.conflicts).toBeDefined();
    expect(Array.isArray(output.conflicts)).toBe(true);
    expect(output.conflicts.length).toBeGreaterThan(0);
  });
});
