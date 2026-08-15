/**
 * MoveMemberEngine Unit 測試（回歸缺陷 #4 之 file-change-preparer 半部）
 *
 * analyzeSourceSymbols 用正則掃描原始檔案內容判斷「哪些名稱是本地 export」，
 * 未排除註解內容：`/* export const Fake = 1; *\/` 這種區塊註解恰巧長得像
 * export 宣告，會被誤判為真實 export；而真正未 export 的同名 `const Fake = 2`
 * 卻是實際定義。搬移引用 Fake 的成員後，目標檔會誤生成一筆指向「實際上未被
 * export」符號的假 import。
 */

import { describe, expect, it } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('MoveMemberEngine - 註解中的假 export 不應生成指向未匯出符號的 import', () => {
  it('搬移引用 Fake 的成員後，目標檔不應出現 import { Fake }', async () => {
    const sourceContent = [
      '/* export const Fake = 1; */',
      'const Fake = 2;',
      '',
      'export function helper() {',
      '  return Fake;',
      '}'
    ].join('\n');

    const mockFs = createMockFileSystem({
      '/src/source.ts': sourceContent,
      '/src/target.ts': ''
    });
    const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

    const options: MoveMemberOptions = {
      sourceFile: '/src/source.ts',
      memberName: 'helper',
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

    // 正確行為：Fake 實際上未被 export，目標檔不應生成任何 import { Fake }
    expect(result.targetFileChange.newCode).not.toContain('import { Fake }');
    expect(result.targetFileChange.newCode).not.toContain('Fake }');
  });
});
