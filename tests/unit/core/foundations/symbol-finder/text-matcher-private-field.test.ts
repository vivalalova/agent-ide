/**
 * 對抗式審查釘住的缺陷：scanSource() 把 `#` 一律視為單行註解起點（原意疑似
 * 沿用 Python/Shell 註解語法，見 git blame 註解「Python/Shell 單行註解」），
 * 但本 scanner 的實際呼叫端（symbol-finder.ts 的 no-parser／parse-failed 降級
 * 路徑）只服務 TS/JS 檔案；JS/TS 沒有 `#` 註解語法，`#` 只會是 private class
 * field/method 前綴（`#secret`、`this.#secret`）。專案中亦無任何 Python/Shell
 * parser 註冊（ParserRegistry 只有 TS/JS 兩個內建 parser），故「Python/Shell
 * 相容」的原始動機在本 scanner 的實際呼叫路徑上並不成立。
 *
 * 結果：`findReferencesByTextFiltered` 對 private field 名稱在其宣告行與
 * `this.#name` 使用處，會把該行從 `#` 起全部視為註解內容而漏找引用。
 *
 * 修法：移除 `#` 視為單行註解起點的分支（治本：JS/TS 從未使用 `#` 作為註解，
 * 保留它對此 scanner 的真實呼叫端無實質效益、只有副作用）。
 */

import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher private class field（# 前綴）不應被誤判為註解', () => {
  it('this.#secret 內的 secret 引用應被找到', () => {
    const matcher = new TextMatcher();
    const content = 'class C { #secret = 1; get() { return this.#secret; } }';

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'secret');

    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.some(r => r.location.range.start.line === 1)).toBe(true);
  });

  it('#secret 宣告本身的 secret 也應被找到（非文首單行註解的一部分）', () => {
    const matcher = new TextMatcher();
    const content = '#secret = 1;';

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'secret');

    expect(refs).toHaveLength(1);
    expect(refs[0]?.location.range.start.column).toBe(2);
  });

  it('private method 呼叫 this.#run() 中的 run 也應被找到', () => {
    const matcher = new TextMatcher();
    const content = 'class C { #run() {} call() { this.#run(); } }';

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'run');

    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('真正的 // 單行註解仍會被過濾', () => {
    const matcher = new TextMatcher();
    const content = 'const secret = 1; // secret is used below\nconsole.log(secret);';

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'secret');

    // 第一行宣告 + 第二行使用；註解裡的 secret 不應被算入
    expect(refs).toHaveLength(2);
    expect(refs.every(r => r.location.range.start.line !== 1 || r.location.range.start.column < 20)).toBe(true);
  });

  it('/* 區塊註解 */ 中的符號仍會被過濾', () => {
    const matcher = new TextMatcher();
    const content = '/* secret placeholder */\nconst secret = 1;';

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'secret');

    expect(refs).toHaveLength(1);
    expect(refs[0]?.location.range.start.line).toBe(2);
  });
});
