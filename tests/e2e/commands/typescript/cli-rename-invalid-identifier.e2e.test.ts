/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * G1：rename-engine.generateChangeset 把驗證衝突（如改名為保留字）記為 warnings，
 *     executeMutationCommand 只擋 errors 不擋衝突 warnings，
 *     導致 `--to for` 這類無效識別符在非 dry-run 下仍被寫入，產出壞語法。
 *     預期契約：dry-run 可預覽並帶警告；實際套用必須拒絕並保持檔案不變。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 無效識別符 regression（G1）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('改名為保留字時應拒絕套用且檔案不變', async () => {
    await fixture.writeFile(
      'src/g1-owner.ts',
      'export function g1Foo(): number { return 1; }\n'
    );

    const result = await executeCLI(
      ['rename', '--path', fixture.rootPath, '--from', 'g1Foo', '--to', 'for', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).not.toBe(0);
    const content = await fixture.readFile('src/g1-owner.ts');
    expect(content).toContain('g1Foo');
    expect(content).not.toContain('function for');
  });
});
