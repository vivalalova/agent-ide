/**
 * listTypeScriptMembers / extractDependencies Unit 測試（回歸兩筆缺陷）
 *
 * 缺陷 #3：頂層函式宣告 regex（及其餘頂層宣告 regex：class/interface/type/
 *   const/enum）未排除區塊註解內容，區塊註解中恰巧長得像宣告的文字（如
 *   `/* function fake() {} *\/`）會被誤判為真實可搬移的成員。
 * 缺陷 #4（typescript-extractor 半部）：extractDependencies 對成員原始碼中的
 *   註解/字串內容也當成真實識別符掃描，導致註解裡提到的名稱被誤判為依賴。
 */

import { describe, expect, it } from 'vitest';
import { listTypeScriptMembers } from '@core/move-member/extractors/typescript-extractor.js';

describe('listTypeScriptMembers - 區塊註解內容不應被誤判為真實成員', () => {
  it('區塊註解中的 function 宣告不應出現在成員清單中', () => {
    const content = [
      '/*',
      'function fake() {}',
      '*/',
      'function real() {',
      '  return 1;',
      '}'
    ].join('\n');

    const members = listTypeScriptMembers(content, 'file.ts');

    expect(members.find(m => m.name === 'fake')).toBeUndefined();
    expect(members.find(m => m.name === 'real')).toBeDefined();
  });
});

describe('extractDependencies - 註解/字串內容不應被當成真實依賴', () => {
  it('成員原始碼內的區塊註解提到的識別符不應被列為依賴', () => {
    const content = [
      'function helper(other: number) {',
      '  /* calls fakeDependency() here */',
      '  return other + 1;',
      '}'
    ].join('\n');

    const members = listTypeScriptMembers(content, 'file.ts');
    const helper = members.find(m => m.name === 'helper');

    expect(helper).toBeDefined();
    expect(helper?.dependencies).not.toContain('fakeDependency');
  });
});
