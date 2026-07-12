/**
 * CLI change-signature 缺陷 E2E 測試（JS 專案，reproduction，先紅後綠）
 *
 * G5：core 呼叫 parser.formatSignature() 未帶行號，JS declaration-analyzer
 *     的 AST 路徑因此回 null；regex fallback 只認帶括號的 `(x) =>`，
 *     無括號單參數箭頭函數 `x =>` 被誤判 FunctionNotFound。
 *     預期契約：`const f = x => ...` 的參數改名應照常成功。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature 無括號箭頭函數 regression（G5，JS 專案）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該成功重命名無括號單參數箭頭函數的參數', async () => {
    await fixture.writeFile('src/g5-arrow.js', [
      'export const g5Square = x => x * x;',
      'export const g5Result = g5Square(2);',
      '',
    ].join('\n'));

    const result = await executeCLI(
      ['change-signature', fixture.getFilePath('src/g5-arrow.js'), 'g5Square',
        '-p', fixture.rootPath, '--rename', 'x:y', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
  });
});
