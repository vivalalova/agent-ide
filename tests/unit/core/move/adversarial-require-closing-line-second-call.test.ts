/**
 * ImportResolver Unit 測試（回歸缺陷 #8）
 *
 * 多行 `require(\n './old'\n);` 的收尾行原本被整行跳過（`i = call.endLineIndex`），
 * 若該收尾行後面緊接著第二個獨立的 `require('./other')` 呼叫，這第二筆呼叫
 * 完全沒被掃描到、既不會被收集也不會被改寫。
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ImportStatementType } from '@core/move/types.js';

function createResolver(): ImportResolver {
  return new ImportResolver({ pathAliases: {}, supportedExtensions: ['.ts', '.js'] });
}

describe('ImportResolver.parseImportStatements - 多行 require() 收尾行上的第二個呼叫不應消失', () => {
  it('收尾行緊接的第二個 require() 呼叫應被正確收集', () => {
    const code = [
      'const a = require(',
      '  \'./old\'',
      '); const b = require(\'./other\');'
    ].join('\n');

    const statements = createResolver().parseImportStatements(code, '/project/src/a.ts');
    const requireStatements = statements.filter(s => s.type === ImportStatementType.REQUIRE);
    const paths = requireStatements.map(s => s.path).sort();

    expect(paths).toEqual(['./old', './other']);
  });
});
