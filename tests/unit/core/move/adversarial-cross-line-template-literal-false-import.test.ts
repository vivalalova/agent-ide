/**
 * ImportResolver Unit 測試（回歸缺陷 #7）
 *
 * import-parsing 原本以 maskStringsAndComments 逐行獨立遮罩，無跨行狀態追蹤：
 * 一個跨越多行的樣板字面值，其中間行若長得像 `import { x } from './old';`，
 * 逐行獨立遮罩因不知道自己身處樣板字面值內部（開頭反引號在更早的行），
 * 會被誤判為真正的 import 陳述式並誤改寫其路徑。
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';

function createResolver(): ImportResolver {
  return new ImportResolver({ pathAliases: {}, supportedExtensions: ['.ts', '.js'] });
}

describe('ImportResolver.parseImportStatements - 跨行樣板字面值不應誤判為真正的 import', () => {
  it('樣板字面值中間行含 import 陳述式文字時不應被解析為真正的 import', () => {
    const code = [
      'const template = `',
      'import { x } from \'./old\';',
      '`;',
      'import { real } from \'./real\';'
    ].join('\n');

    const statements = createResolver().parseImportStatements(code, '/project/src/a.ts');

    // 正確行為：只有真正的 import（第 4 行）被解析，樣板字面值內容中的假 import
    // 不應出現在結果中
    expect(statements).toHaveLength(1);
    expect(statements[0].path).toBe('./real');
  });
});
