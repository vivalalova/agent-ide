/**
 * [R3] move-member 指定插入行落在既有宣告內部時不得寫出壞碼
 *
 * string-utils.ts:5 是 `export function capitalize(...)` 的簽名行，函式本體
 * 一路延伸到第 10 行的 `}`。把 array-utils.ts:9 的 groupBy 指定插入到這個
 * 落在 capitalize 內部的行號時，必須避免把 groupBy 硬插進 capitalize 函式本體
 * 中間，寫出語法壞掉或邏輯錯亂的檔案。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('[R3] CLI move-member - 插入行落在既有宣告內部', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('插入行落在 capitalize 函式本體內部時，須明確失敗且兩檔不變，或成功但 groupBy 完整位於頂層、capitalize 本體完整', async () => {
    const originalSource = await fixture.readFile('src/utils/array-utils.ts');
    const originalTarget = await fixture.readFile('src/utils/string-utils.ts');

    const result = await executeCLI(
      [
        'move', 'src/utils/array-utils.ts:9', 'src/utils/string-utils.ts:5',
        '--path', fixture.rootPath, '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    if (result.exitCode !== 0) {
      // 可接受行為 1：明確失敗，兩檔完整未動
      const sourceAfter = await fixture.readFile('src/utils/array-utils.ts');
      const targetAfter = await fixture.readFile('src/utils/string-utils.ts');
      expect(sourceAfter).toBe(originalSource);
      expect(targetAfter).toBe(originalTarget);
      return;
    }

    // 可接受行為 2：成功，但 groupBy 必須完整位於頂層、且未破壞 capitalize 函式本體
    const targetContent = await fixture.readFile('src/utils/string-utils.ts');

    // capitalize 函式本體完整：簽名與內部三行邏輯必須連續出現、中間未被插入其他程式碼
    const capitalizeBlock = [
      'export function capitalize(str: string): string {',
      '  if (!str) {',
      '    return str;',
      '  }',
      '  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();',
      '}'
    ].join('\n');
    expect(targetContent).toContain(capitalizeBlock);

    // groupBy 必須是頂層宣告（export function groupBy 開頭於行首，非縮排在其他函式內部）
    const groupByTopLevelPattern = /^export function groupBy</m;
    expect(groupByTopLevelPattern.test(targetContent)).toBe(true);

    // groupBy 不得出現在 capitalize 函式本體的縮排範圍內（即不是 capitalizeBlock 的子字串）
    expect(capitalizeBlock).not.toContain('groupBy');
  });

  it('對照：插入行為頂層邊界（函式之間的空行）時應成功搬移', async () => {
    // string-utils.ts 第 11 行是 capitalize 與 slugify 之間的空行，屬於頂層邊界
    const result = await executeCLI(
      [
        'move', 'src/utils/array-utils.ts:9', 'src/utils/string-utils.ts:11',
        '--path', fixture.rootPath, '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const targetContent = await fixture.readFile('src/utils/string-utils.ts');
    const groupByTopLevelPattern = /^export function groupBy</m;
    expect(groupByTopLevelPattern.test(targetContent)).toBe(true);

    const sourceContent = await fixture.readFile('src/utils/array-utils.ts');
    expect(sourceContent).not.toContain('function groupBy');
  });

  it('[R3-jsdoc] 插入行落在多行 JSDoc 中間時，須明確失敗且兩檔不變，或成功且 JSDoc 區塊文字完整連續', async () => {
    await fixture.writeFile(
      'src/utils/jsdoc-import-source.ts',
      ['export const a = 1;', 'export const b = 2;', ''].join('\n')
    );

    const jsdocTargetLines = [
      'import {',
      '  a,',
      '  b',
      '} from \'./jsdoc-import-source\';',
      '',
      '/**',
      ' * doc',
      ' * more',
      ' */',
      'export function f() {',
      '  return a + b;',
      '}',
      ''
    ];
    await fixture.writeFile('src/utils/jsdoc-target-a.ts', jsdocTargetLines.join('\n'));

    const originalSource = await fixture.readFile('src/utils/array-utils.ts');
    const originalTarget = await fixture.readFile('src/utils/jsdoc-target-a.ts');

    // 第 8 行（` * more`）落在 JSDoc 區塊中間
    const result = await executeCLI(
      [
        'move', 'src/utils/array-utils.ts:9', 'src/utils/jsdoc-target-a.ts:8',
        '--path', fixture.rootPath, '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const jsdocBlock = ['/**', ' * doc', ' * more', ' */'].join('\n');

    if (result.exitCode !== 0) {
      const sourceAfter = await fixture.readFile('src/utils/array-utils.ts');
      const targetAfter = await fixture.readFile('src/utils/jsdoc-target-a.ts');
      expect(sourceAfter).toBe(originalSource);
      expect(targetAfter).toBe(originalTarget);
      return;
    }

    const targetContent = await fixture.readFile('src/utils/jsdoc-target-a.ts');
    // JSDoc 區塊必須完整連續出現，不得被插入的 groupBy 切斷
    expect(targetContent).toContain(jsdocBlock);
    const groupByTopLevelPattern = /^export function groupBy</m;
    expect(groupByTopLevelPattern.test(targetContent)).toBe(true);
  });

  it('[R3-import] 插入行落在多行 import 中間時，須明確失敗且兩檔不變，或成功且 import 區塊文字完整連續', async () => {
    await fixture.writeFile(
      'src/utils/jsdoc-import-source.ts',
      ['export const a = 1;', 'export const b = 2;', ''].join('\n')
    );

    const importTargetLines = [
      'import {',
      '  a,',
      '  b',
      '} from \'./jsdoc-import-source\';',
      '',
      '/**',
      ' * doc',
      ' * more',
      ' */',
      'export function f() {',
      '  return a + b;',
      '}',
      ''
    ];
    await fixture.writeFile('src/utils/jsdoc-target-b.ts', importTargetLines.join('\n'));

    const originalSource = await fixture.readFile('src/utils/array-utils.ts');
    const originalTarget = await fixture.readFile('src/utils/jsdoc-target-b.ts');

    // 第 3 行（`  b,`）落在多行 import 中間
    const result = await executeCLI(
      [
        'move', 'src/utils/array-utils.ts:9', 'src/utils/jsdoc-target-b.ts:3',
        '--path', fixture.rootPath, '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const importBlock = ['import {', '  a,', '  b', '} from \'./jsdoc-import-source\';'].join('\n');

    if (result.exitCode !== 0) {
      const sourceAfter = await fixture.readFile('src/utils/array-utils.ts');
      const targetAfter = await fixture.readFile('src/utils/jsdoc-target-b.ts');
      expect(sourceAfter).toBe(originalSource);
      expect(targetAfter).toBe(originalTarget);
      return;
    }

    const targetContent = await fixture.readFile('src/utils/jsdoc-target-b.ts');
    // import 區塊必須完整連續出現，不得被插入的 groupBy 切斷
    expect(targetContent).toContain(importBlock);
    const groupByTopLevelPattern = /^export function groupBy</m;
    expect(groupByTopLevelPattern.test(targetContent)).toBe(true);
  });

  it('[R3-same-file-hint] 同檔移動被擋時，錯誤訊息建議的邊界行照抄重跑須成功且插在訊息所指位置', async () => {
    const sameFileLines = [
      'export function moved() {',
      '  return 1;',
      '}',
      '',
      'export function funcB() {}',
      '',
      '/**',
      ' * doc for funcC',
      ' */',
      'export function funcC() {',
      '  return 2;',
      '}',
      '',
      'export function funcD() {}',
      ''
    ];
    const originalContent = sameFileLines.join('\n');
    await fixture.writeFile('src/same.ts', originalContent);

    // 第 8 行（` * doc for funcC`）落在 funcC 的 JSDoc 中間
    const blockedResult = await executeCLI(
      ['move', 'src/same.ts:1', 'src/same.ts:8', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(blockedResult.exitCode).not.toBe(0);
    const unchangedContent = await fixture.readFile('src/same.ts');
    expect(unchangedContent).toBe(originalContent);

    const errorMessage = JSON.parse(blockedResult.stdout).error as string;
    const afterMatch = /第\s*(\d+)\s*行（插在該語句結束行之後）/.exec(errorMessage);
    const beforeMatch = /第\s*(\d+)\s*行（插在該語句之前）/.exec(errorMessage);
    expect(afterMatch).not.toBeNull();
    expect(beforeMatch).not.toBeNull();
    const suggestedAfterLine = (afterMatch as RegExpExecArray)[1];
    const suggestedBeforeLine = (beforeMatch as RegExpExecArray)[1];

    // 照抄「之後」建議行重跑：moved 須落在 funcC 之後、funcD 之前
    const afterRunResult = await executeCLI(
      ['move', 'src/same.ts:1', `src/same.ts:${suggestedAfterLine}`, '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(afterRunResult.exitCode).toBe(0);
    expect(JSON.parse(afterRunResult.stdout).success).toBe(true);

    const afterRunContent = await fixture.readFile('src/same.ts');
    const funcCEndIndex = afterRunContent.indexOf('function funcC(');
    const funcCCloseIndex = afterRunContent.indexOf('}', funcCEndIndex);
    const movedIndexAfterRun = afterRunContent.indexOf('function moved');
    const funcDIndexAfterRun = afterRunContent.indexOf('function funcD');
    expect(funcCEndIndex).toBeGreaterThanOrEqual(0);
    expect(movedIndexAfterRun).toBeGreaterThan(funcCCloseIndex);
    expect(movedIndexAfterRun).toBeLessThan(funcDIndexAfterRun);

    // 重置成原始內容，照抄「之前」建議行重跑：moved 須落在 funcB 之後、funcC 的 JSDoc 之前
    await fixture.writeFile('src/same.ts', originalContent);

    const beforeRunResult = await executeCLI(
      ['move', 'src/same.ts:1', `src/same.ts:${suggestedBeforeLine}`, '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(beforeRunResult.exitCode).toBe(0);
    expect(JSON.parse(beforeRunResult.stdout).success).toBe(true);

    const beforeRunContent = await fixture.readFile('src/same.ts');
    const funcBIndexBeforeRun = beforeRunContent.indexOf('function funcB');
    const funcCJsdocIndexBeforeRun = beforeRunContent.indexOf('* doc for funcC');
    const movedIndexBeforeRun = beforeRunContent.indexOf('function moved');
    expect(funcBIndexBeforeRun).toBeGreaterThanOrEqual(0);
    expect(movedIndexBeforeRun).toBeGreaterThan(funcBIndexBeforeRun);
    expect(movedIndexBeforeRun).toBeLessThan(funcCJsdocIndexBeforeRun);
  });
});
