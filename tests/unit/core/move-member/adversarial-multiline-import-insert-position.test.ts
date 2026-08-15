/**
 * MoveMemberEngine Unit 測試（回歸缺陷 #5）
 *
 * findImportInsertPosition 原本逐行判斷「這行是不是 import 開頭」，多行具名
 * import（`import {\n  Existing\n} from './dep';`）的延續行（`  Existing`）
 * 既不以 `import` 開頭也非註解/空行，被誤判為「遇到非 import 內容」而提前
 * 停止搜尋，導致新 import 被插入到既有多行 import 的具名區塊中間，產生無效語法。
 */
import { describe, expect, it } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('MoveMemberEngine - 多行具名 import 的延續行不應被誤判為插入停止點', () => {
  it('新 import 應插入在多行 import 語句完整結束之後，而非其具名區塊中間', async () => {
    const targetContent = [
      'import {',
      '  Existing',
      '} from \'./dep\';',
      '',
      'export const already = 1;',
      ''
    ].join('\n');

    const mockFs = createMockFileSystem({
      '/src/source.ts': [
        'export const DEFAULT_DEP = 1;',
        '',
        'export function helper(): number {',
        '  return DEFAULT_DEP;',
        '}',
        ''
      ].join('\n'),
      '/src/target.ts': targetContent
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

    const newCode = result.targetFileChange.newCode;
    // 前提：確實生成了依賴 import（DEFAULT_DEP 是 source.ts 的本地 export），
    // 才會真正走到 findImportInsertPosition 的插入邏輯
    expect(newCode).toContain('DEFAULT_DEP');
    // 正確行為：多行 import 語句完整保留（Existing 仍在其具名區塊內，
    // 不應被截斷或被插入內容打斷）
    expect(newCode).toContain('import {\n  Existing\n} from \'./dep\';');
    // 新插入的依賴 import 應出現在多行 import 語句「之後」，而非插在 `{` 與 `}` 之間
    const importBlockEnd = newCode.indexOf('} from \'./dep\';') + '} from \'./dep\';'.length;
    const dependencyImportIndex = newCode.indexOf('DEFAULT_DEP');
    expect(dependencyImportIndex).toBeGreaterThan(importBlockEnd);
  });
});
