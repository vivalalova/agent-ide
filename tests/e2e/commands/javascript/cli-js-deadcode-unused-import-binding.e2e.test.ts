/**
 * CLI deadcode - 檔內完全未使用的 import binding（JS 專案，reproduction，先紅後綠）
 *
 * 目標：來源符號在別處仍被使用（並非 dead code），但某個 consumer 檔案 import 了它
 * 卻從未在檔內使用該 binding，deadcode 應能回報並在 --apply 時乾淨移除該 import，
 * 且不得回歸 J1（namespace import 重疊 fast-fail，見 cli-js-deadcode-bugs-j1）。
 *
 * 只涵蓋 JS 專案：import specifier 的 local binding 是否進入符號分析（isImported
 * 標記）目前只有 JavaScript parser 會產生（見 plugins/javascript/parser.ts），
 * TypeScript parser 的 symbol-extractor 不把 import specifier 抽成獨立符號，
 * 因此本功能在 TS 專案上無對應符號可供偵測（能力邊界，非本次任務範圍）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

function findFileDiff(
  output: { files?: Array<{ filePath: string; hunks?: Array<{ lines: Array<{ type: string; content: string }> }> }> },
  fileNameIncludes: string
): { deleted: string; all: string } {
  const file = output.files?.find((f) => f.filePath.includes(fileNameIncludes));
  const lines = (file?.hunks ?? []).flatMap((h) => h.lines);
  return {
    deleted: lines.filter((l) => l.type === 'delete').map((l) => l.content).join('\n'),
    all: lines.map((l) => l.content).join('\n')
  };
}

describe('CLI deadcode - 檔內未使用的 import binding（來源符號別處仍存活，JS 專案）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('未使用 named import：應回報該 binding 為 dead code（不需要 --include-exports）', async () => {
    await fixture.writeFile(
      'src/uib-source.js',
      'export function uibShared() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/uib-real-user.js',
      'import { uibShared } from \'./uib-source.js\';\n\nexport function callsShared() {\n  return uibShared();\n}\n'
    );
    await fixture.writeFile(
      'src/uib-orphan-consumer.js',
      'import { uibShared } from \'./uib-source.js\';\n\nexport const uibMarker = \'orphan\';\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // 來源符號在 uib-real-user.js 仍被使用，不得被判 dead（即使沒有 --include-exports，
    // 這條斷言確保我們測的是「binding 未用」而非「來源已死」）
    const sourceDiff = findFileDiff(output, 'uib-source');
    expect(sourceDiff.deleted).not.toContain('uibShared');

    // 真正使用者的 import 不得被誤刪
    const realUserDiff = findFileDiff(output, 'uib-real-user');
    expect(realUserDiff.deleted).not.toContain('uibShared');

    // 孤兒 consumer 的 import binding 應被回報為 dead code
    const orphanDiff = findFileDiff(output, 'uib-orphan-consumer');
    expect(orphanDiff.deleted).toContain('uibShared');
  });

  it('--apply 後應乾淨移除孤兒 consumer 的 import，其餘內容與來源檔不受影響', async () => {
    await fixture.writeFile(
      'src/uib2-source.js',
      'export function uib2Shared() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/uib2-real-user.js',
      'import { uib2Shared } from \'./uib2-source.js\';\n\nexport function callsShared2() {\n  return uib2Shared();\n}\n'
    );
    await fixture.writeFile(
      'src/uib2-orphan-consumer.js',
      'import { uib2Shared } from \'./uib2-source.js\';\n\nexport const uib2Marker = \'orphan2\';\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const orphanContent = await fixture.readFile('src/uib2-orphan-consumer.js');
    // 整條 import 陳述式（唯一 binding）應被整句移除，不留下語法破損的殘骸
    expect(orphanContent).not.toContain('import');
    expect(orphanContent).not.toContain('uib2Shared');
    expect(orphanContent).toContain('export const uib2Marker = \'orphan2\';');

    // 來源與真正使用者不受影響
    const sourceContent = await fixture.readFile('src/uib2-source.js');
    expect(sourceContent).toContain('uib2Shared');

    const realUserContent = await fixture.readFile('src/uib2-real-user.js');
    expect(realUserContent).toContain('import { uib2Shared }');
    expect(realUserContent).toContain('callsShared2');
  });

  it('部分 named import：只有一個 binding 未使用時應保留仍在使用的 binding', async () => {
    await fixture.writeFile(
      'src/uib3-source.js',
      'export function uib3Used() { return 1; }\nexport function uib3Unused() { return 2; }\n'
    );
    await fixture.writeFile(
      'src/uib3-real-user.js',
      'import { uib3Unused } from \'./uib3-source.js\';\n\nexport function usesUnusedOneElsewhere() {\n  return uib3Unused();\n}\n'
    );
    await fixture.writeFile(
      'src/uib3-partial-consumer.js',
      'import { uib3Used, uib3Unused } from \'./uib3-source.js\';\n\nexport function callsOnlyUsed() {\n  return uib3Used();\n}\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const partialContent = await fixture.readFile('src/uib3-partial-consumer.js');
    expect(partialContent).toContain('uib3Used');
    expect(partialContent).not.toContain('uib3Unused');
    expect(partialContent).toContain('callsOnlyUsed');
  });
});
