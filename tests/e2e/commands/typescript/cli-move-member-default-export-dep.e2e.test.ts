/**
 * CLI move（成員移動）缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * G4：file-change-preparer.analyzeSourceSymbols 的 export 正則只認 named export，
 *     不認 `export default function NAME`，導致被搬移成員對 default export 本地
 *     函數的依賴不會在目標檔補 import，產出未綁定引用。
 *     預期契約：目標檔須帶上對來源檔 default export 依賴的 import。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move 成員移動 default export 依賴 regression（G4）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('搬移依賴 default export 函數的成員時，目標檔應補上該依賴的 import', async () => {
    await fixture.writeFile('src/g4-source.ts', [
      'export default function g4Helper(): number {',
      '  return 1;',
      '}',
      '',
      'export function g4Moved(): number {',
      '  return g4Helper();',
      '}',
      '',
    ].join('\n'));

    const result = await executeCLI(
      ['move', 'src/g4-source.ts:5', 'src/g4-target.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const target = await fixture.readFile('src/g4-target.ts');
    expect(target).toContain('g4Moved');
    expect(target).toMatch(/import[^\n]*g4Helper[^\n]*from[^\n]*g4-source/);
  });
});
