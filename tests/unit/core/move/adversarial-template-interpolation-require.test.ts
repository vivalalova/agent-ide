/**
 * F9：move source-masking 整段 mask template，含 interpolation 內的 require()
 *
 * `` `x${require('./old')}` `` 在檔案移動後應更新 path；
 * 目前 computeMaskedLines 把 template 內容（含 ${...}）整段遮成空白，
 * ImportResolver 掃不到 require('./old')。
 */

import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { computeMaskedLines } from '@core/move/source-masking.js';
import { ImportStatementType } from '@core/move/types.js';

function createResolver(): ImportResolver {
  return new ImportResolver({ pathAliases: {}, supportedExtensions: ['.ts', '.js'] });
}

describe('template interpolation require path (F9)', () => {
  it('parseImportStatements 應辨識 template ${require(\'./old\')} 內的路徑', () => {
    const code = "const msg = `x${require('./old')}`;\n";
    const stmts = createResolver().parseImportStatements(code, '/project/src/a.ts');
    const requirePaths = stmts
      .filter(s => s.type === ImportStatementType.REQUIRE)
      .map(s => s.path);

    // 正確：require('./old') 在 template interpolation 內仍是 runtime 依賴
    // 目前壞行為：整段 template 被 mask → 0 筆 REQUIRE
    expect(requirePaths).toContain('./old');
  });

  it('computeMaskedLines 不應把 ${require(...)} interpolation 整段抹掉成不可掃描', () => {
    const code = "const msg = `x${require('./old')}`;\n";
    const masked = computeMaskedLines(code).join('\n');

    // 正確：interpolation 內的 require('./old') 應以可被 import 偵測的形式留下
    // （至少保留 require 與路徑字樣；引號可保留）
    // 目前壞行為：反引號之間全空白，看不到 require
    expect(masked).toMatch(/require/);
    expect(masked).toMatch(/\.\/old/);
  });
});
