/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F4：JS class getter/setter 配對只改一邊定義
 *
 * `get value() {}` 與 `set value(v) {}` 是同一個存取器名稱的兩個宣告，rename
 * 必須把兩邊定義與所有使用點（`b.value = 10` 賦值走 setter、`b.value` 讀取走
 * getter）一起改名；若只重寫其中一個宣告，會產生定義與使用點不一致（讀寫
 * 分別對應到不同名稱），執行期立即壞掉。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 F4：JS getter/setter 配對改名不一致', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[F4] rename getter/setter 配對其中一邊時，兩邊定義與使用點必須一致改名，否則須整檔拒絕', async () => {
    const boxFile = 'src/box-f4.js';
    const useFile = 'src/use-box-f4.js';

    const originalBox = [
      'export class BoxF4 {',
      '  get valueF4() {',
      '    return this._v;',
      '  }',
      '  set valueF4(v) {',
      '    this._v = v;',
      '  }',
      '}',
      ''
    ].join('\n');
    const originalUse = [
      'import { BoxF4 } from \'./box-f4.js\';',
      '',
      'const bF4 = new BoxF4();',
      'bF4.valueF4 = 10;',
      'console.log(bF4.valueF4);',
      ''
    ].join('\n');

    await fixture.writeFile(boxFile, originalBox);
    await fixture.writeFile(useFile, originalUse);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'valueF4', '--to', 'renamedValueF4',
        '--at', `${boxFile}:2`,
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const updatedBox = await fixture.readFile(boxFile);
    const updatedUse = await fixture.readFile(useFile);

    if (result.exitCode === 0) {
      // 成功則 getter 與 setter 兩個定義都必須改名，不得只改一邊
      expect(updatedBox).toContain('get renamedValueF4()');
      expect(updatedBox).toContain('set renamedValueF4(v)');
      expect(updatedBox).not.toContain('get valueF4()');
      expect(updatedBox).not.toContain('set valueF4(v)');
      // 使用點（讀與寫）必須與新名稱一致
      expect(updatedUse).toContain('bF4.renamedValueF4 = 10;');
      expect(updatedUse).toContain('console.log(bF4.renamedValueF4);');
      expect(updatedUse).not.toContain('.valueF4');
    } else {
      // 不支援就必須明確拒絕，兩檔皆不得變動
      expect(updatedBox).toBe(originalBox);
      expect(updatedUse).toBe(originalUse);
    }
  });
});
