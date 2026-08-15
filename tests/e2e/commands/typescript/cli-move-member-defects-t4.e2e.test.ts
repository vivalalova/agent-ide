/**
 * CLI move-member 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * T4：overload 方法只搬實作、孤兒簽章留原地
 *     typescript-extractor.ts:254-274 逐行 regex 掃描 class 內的方法，overload
 *     簽章行（無 body）與實作行被當成三個獨立候選；指向實作行搬移時，只有
 *     實作行被搬走，兩個 overload 簽章行留在來源檔成為孤兒宣告（來源檔仍有
 *     `barT4` 但缺實作，是不合法的殘破狀態）。
 *
 * 採「雙可接受」斷言：成功（exit 0）⇒ 目標檔須含完整三個宣告（兩個
 * overload 簽章＋實作），來源檔不得殘留任何 barT4 宣告；否則須明確拒絕
 * （exit 非 0 且整檔不變）。目前行為是「成功＋只搬實作＋來源留孤兒簽章」，
 * 兩者皆不成立 → 紅。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member - 缺陷 regression（T4）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('T4：class 內 overload 方法搬移須完整搬走三個宣告，否則須整檔拒絕', async () => {
    const sourcePath = 'src/t4-overload-source.ts';
    const targetPath = 'src/t4-overload-target.ts';
    const original = `export class SvcT4 {
  barT4(a: number): void;
  barT4(a: string): void;
  barT4(a: number | string): void { console.log(a); }
  other() { return 1; }
}
`;
    await fixture.writeFile(sourcePath, original);
    await fixture.writeFile(targetPath, '');

    // barT4 實作在第 4 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath(sourcePath)}:4`, fixture.getFilePath(targetPath),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    const sourceAfter = await fixture.memfs.readFile(fixture.getFilePath(sourcePath), 'utf-8') as string;

    if (result.exitCode === 0) {
      const targetAfter = await fixture.memfs.readFile(fixture.getFilePath(targetPath), 'utf-8') as string;
      // 目標檔須含完整三個宣告：兩個 overload 簽章 + 一個實作
      expect(targetAfter).toContain('barT4(a: number): void;');
      expect(targetAfter).toContain('barT4(a: string): void;');
      expect(targetAfter).toMatch(/barT4\(a: number \| string\): void \{[\s\S]*console\.log\(a\)/);
      // 來源檔不得殘留任何 barT4 宣告（不可留下孤兒簽章）
      expect(sourceAfter).not.toContain('barT4');
    } else {
      expect(sourceAfter).toBe(original);
    }
  });
});
