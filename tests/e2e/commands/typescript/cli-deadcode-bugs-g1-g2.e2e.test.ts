/**
 * CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * findScopedReferences 的 className 過濾邏輯
 * （src/plugins/typescript/reference-finder.ts:87-95，JS 版
 * src/plugins/javascript/reference-finder.ts 同款）在 deadcode
 * --include-public-members 判斷 method 是否存活時有兩個相反方向的缺陷：
 *
 * G1（漏報→誤刪）：method 呼叫點的 receiver 型別推不出來時（例如 factory
 *     function 回傳的實例），該呼叫被誤過濾丟棄，導致實際被使用的 public
 *     method 被誤判為 dead code。
 *
 * G2（同名無關符號撐活→漏刪）：他處同名的非 method 呼叫引用（例如同名的
 *     top-level const）被誤算進 method 的引用計數，導致真正無人呼叫的
 *     method 被誤判為存活、不會被清除。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

interface DeleteLineHunk {
  lines: Array<{ type: string; content: string }>;
}

interface DeadcodeFileEntry {
  filePath: string;
  hunks?: DeleteLineHunk[];
}

function extractDeletedContent(file: DeadcodeFileEntry | undefined): string {
  return (file?.hunks ?? [])
    .flatMap((h) => h.lines.filter((l) => l.type === 'delete').map((l) => l.content))
    .join('\n');
}

describe('CLI deadcode 缺陷 regression（G1/G2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('G1：factory 回傳實例呼叫的 public method 不應被 --include-public-members 判為 dead code', async () => {
    await fixture.writeFile('src/dc-g1-dog.ts', [
      'export class DcG1Dog {',
      '  bark(): string { return \'woof\'; }',
      '}',
      'export function createDcG1Dog(): DcG1Dog {',
      '  return new DcG1Dog();',
      '}'
    ].join('\n') + '\n');
    await fixture.writeFile('src/dc-g1-main.ts', [
      'import { createDcG1Dog } from \'./dc-g1-dog.js\';',
      'export function dcG1Run(): string {',
      '  const dog = createDcG1Dog();',
      '  return dog.bark();',
      '}'
    ].join('\n') + '\n');

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-public-members'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);

    const dogFile = output.files?.find((f: DeadcodeFileEntry) => f.filePath.includes('dc-g1-dog'));
    const deletedContent = extractDeletedContent(dogFile);

    // Bug：dog 的型別靠 createDcG1Dog() 回傳值語法推不出來，dog.bark() 呼叫
    // 被 className 過濾器誤判丟棄，bark 因此「看起來」零引用而被判為 dead，
    // 目前 deletedContent 會包含 'bark'
    expect(deletedContent).not.toContain('bark');
  });

  it('G2：方法真正無人使用時，即使他處有同名 const 及其引用，仍應被判為 dead code', async () => {
    await fixture.writeFile('src/dc-g2-dog.ts', [
      'export class DcG2Dog {',
      '  purr(): string { return \'purrrr\'; }',
      '}'
    ].join('\n') + '\n');
    await fixture.writeFile('src/dc-g2-other.ts', [
      'export const purr = \'sound\';',
      'export function useDcG2Purr(): string { return purr + purr; }'
    ].join('\n') + '\n');

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-public-members'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);

    const dogFile = output.files?.find((f: DeadcodeFileEntry) => f.filePath.includes('dc-g2-dog'));

    // Bug：other.ts 的 top-level const purr 及其引用被誤算進 DcG2Dog.purr
    // method 的引用計數，method 因此被判為「存活」不會出現在 dead 清單中
    // （dogFile 目前會是 undefined，因為完全沒有偵測到 dc-g2-dog.ts 有 dead code）
    expect(dogFile).toBeDefined();
    const deletedContent = extractDeletedContent(dogFile);
    expect(deletedContent).toContain('purr');
  });
});
