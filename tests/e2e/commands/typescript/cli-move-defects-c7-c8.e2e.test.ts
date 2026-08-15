/**
 * CLI move 缺陷 E2E 測試（scan reproduction，先紅後綠，2 筆）
 *
 * C7：同一行多個 import 指向同一模組時，檔案移動只更新到一個。
 *     src/core/move/import-resolver.ts 的 parseImportStatements 對「單行內含多個
 *     import 語句」的情況，collectMultilineImportStatement 會把整行都視為單一
 *     completed statement，導致同行的多個 import match 都共用同一份 rawStatement；
 *     下游 pathUpdates 的去重鍵只有 filePath+line+oldImport，兩筆 oldImport 相同時
 *     第二筆被當成重複而丟棄，實際只更新到一個 specifier。
 * C8：把目錄移動到其自身尚不存在的子目錄時，MoveEngine 只檢查目標是否「已存在」，
 *     沒檢查目標是否為來源的 descendant，導致 moveDirectory 遞迴自我嵌套
 *     （target/target/target/...）直到 ENAMETOOLONG 才失敗。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move 缺陷 regression（C7-C8）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('C7：同一行多個 import 指向同一移動來源，兩個 specifier 都應更新到新路徑', async () => {
    await fixture.writeFile('src/old-c7.ts', `export const a = 1;
export const b = 2;
`);
    await fixture.writeFile(
      'src/importer-c7.ts',
      `import { a } from './old-c7'; import { b } from './old-c7';
export const s = a + b;
`
    );

    const result = await executeCLI(
      [
        'move', fixture.getFilePath('src/old-c7.ts'), fixture.getFilePath('src/new-c7.ts'),
        '-p', fixture.rootPath, '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const importerContent = await fixture.readFile('src/importer-c7.ts');
    // 正確行為：兩個 import specifier 都應更新指向新路徑，不得殘留任何 './old-c7'；
    // 目前的壞行為是去重鍵（filePath+line+oldImport）在同行兩筆 oldImport 相同時
    // 把第二筆當重複丟棄，只有其中一個 specifier 被更新
    expect(importerContent).not.toContain('\'./old-c7\'');
    expect(importerContent).toMatch(/import\s*\{\s*a\s*\}\s*from\s*['"]\.\/new-c7['"]/);
    expect(importerContent).toMatch(/import\s*\{\s*b\s*\}\s*from\s*['"]\.\/new-c7['"]/);
  });

  it('C8：把目錄移動到其自身尚不存在的子目錄應被明確拒絕，不得遞迴自我嵌套到 ENAMETOOLONG', async () => {
    await fixture.writeFile('pkg-c8/one.ts', 'export const one = 1;\n');
    await fixture.writeFile('pkg-c8/two.ts', 'export const two = 2;\n');

    const result = await executeCLI(
      [
        'move', fixture.getFilePath('pkg-c8'), fixture.getFilePath('pkg-c8/inner'),
        '-p', fixture.rootPath, '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).not.toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    // 正確行為：應是明確的驗證拒絕（目標是來源的子目錄），而非遞迴自我嵌套直到
    // 檔案系統層級的 ENAMETOOLONG 才失敗；
    // 目前的壞行為是完全沒有 descendant 檢查，只驗證目標「是否已存在」
    expect(String(output.error)).not.toContain('ENAMETOOLONG');

    // rollback 應已清乾淨：來源內容不變、且未殘留巢狀 inner 目錄
    expect(await fixture.readFile('pkg-c8/one.ts')).toBe('export const one = 1;\n');
    expect(await fixture.readFile('pkg-c8/two.ts')).toBe('export const two = 2;\n');
    expect(await fixture.exists('pkg-c8/inner')).toBe(false);
  });
});
