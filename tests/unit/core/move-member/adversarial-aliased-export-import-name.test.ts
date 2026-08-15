/**
 * MoveMemberEngine Unit 測試（獨立對抗式審查釘住的缺陷）
 *
 * analyzeSourceSymbols 掃描來源檔案的 `export { local as alias }` 時，
 * parseSymbolList 只保留 `as` 前的 local binding 名稱（`helper`），把它當成
 * localExports 集合的成員，卻遺失了實際對外可見的 export 名稱（`publicHelper`）。
 * generateDependencyImports 依賴 localExports 判斷「這個 local 名稱是否可從來源檔
 * import」時，直接拿 local 名稱本身當作 imported name 生成 import 語句
 * （`import { helper } from './source'`）——但來源檔實際上只 export `publicHelper`
 * 這個別名，並未直接 export `helper`，生成的 import 會指向不存在的匯出、造成
 * 目標檔案編譯失敗。
 *
 * 正確行為：生成的 import 必須使用來源檔實際的 export 名稱（`publicHelper`），
 * 並用 `as` 別名映射回成員程式碼原本引用的 local 名稱（`helper`），
 * 即 `import { publicHelper as helper } from './source.js'`。
 */

import { describe, expect, it } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('MoveMemberEngine - export { local as alias } 應以實際 export 名稱生成 import', () => {
  it('搬移引用別名 export 的成員後，目標檔應 import 實際 export 名稱並用 as 映射回 local 名稱', async () => {
    const sourceContent = [
      'const helper = 1;',
      'export { helper as publicHelper };',
      '',
      'export function moved() {',
      '  return helper;',
      '}'
    ].join('\n');

    const mockFs = createMockFileSystem({
      '/src/source.ts': sourceContent,
      '/src/target.ts': ''
    });
    const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

    const options: MoveMemberOptions = {
      sourceFile: '/src/source.ts',
      memberName: 'moved',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/target.ts'
      },
      projectRoot: '/src',
      preview: true
    };

    const result = await engine.moveMember(options);

    expect(result.success).toBe(true);
    if (!result.success) { return; }

    // 正確行為：import 必須用實際 export 名稱 publicHelper，並別名回 local 名稱 helper
    expect(result.targetFileChange.newCode).toContain('import { publicHelper as helper } from');
    // 缺陷行為：絕不能生成指向不存在匯出的 import { helper }
    expect(result.targetFileChange.newCode).not.toMatch(/import\s*\{\s*helper\s*\}/);
  });
});
