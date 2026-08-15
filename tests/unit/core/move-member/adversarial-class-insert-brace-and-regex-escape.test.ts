/**
 * findClassInsertPosition Unit 測試（回歸兩筆缺陷）
 *
 * 缺陷 A：類別插入點的大括號計數逐字元累計、未排除字串/註解內容中恰巧出現的
 *   括號，`class Target { method(){ const text = "}"; } }` 字串內的 `}` 被誤認為
 *   類別收尾，插入位置算錯（在字串所在行、而非真正的類別結尾行）。
 * 缺陷 B（regex 特殊字元跳脫，同一函式）：類別名稱直接內嵌進 `new RegExp(...)`
 *   未跳脫特殊字元，類別名稱含 `$` 等字元（如 `$Target`）時完全比對不到，
 *   導致找不到插入位置（回傳 -1，成員退回附加到檔尾而非插入類別內）。
 */

import { describe, expect, it } from 'vitest';
import { FileChangePreparer } from '@core/move-member/file-change-preparer.js';
import { MemberType, MoveTargetType, type MemberDefinition, type MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem } from '../_helpers/mock-factories.js';

function buildMember(): MemberDefinition {
  return {
    name: 'helper',
    type: MemberType.Function,
    location: {
      filePath: '/src/source.ts',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 2 }
      }
    },
    sourceCode: 'export function helper() {\n  return 1;\n}',
    modifiers: ['export'],
    dependencies: []
  };
}

describe('FileChangePreparer.findClassInsertPosition - 字串/註解內容中的括號不應誤導插入位置', () => {
  it('字串字面值中的 `}` 不應被誤判為類別收尾', async () => {
    const targetSource = [
      'class Target {',
      '  method() {',
      '    const text = "}";',
      '  }',
      '}',
      ''
    ].join('\n');
    const mockFs = createMockFileSystem({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': targetSource
    });
    const preparer = new FileChangePreparer(mockFs);
    const options: MoveMemberOptions = {
      sourceFile: '/src/source.ts',
      memberName: 'helper',
      target: {
        type: MoveTargetType.ExistingClass,
        filePath: '/src/target.ts',
        className: 'Target'
      },
      projectRoot: '/src',
      preview: true
    };

    const result = await preparer.prepareTargetFileChange(options, buildMember());

    // 正確行為：插入在類別真正的收尾大括號之前（method 的 `}` 之後、class 的 `}` 之前）。
    // 錯誤重現點：字串內的 `}` 被誤計為類別收尾時，插入位置會落在 method 內部
    // （method 自己的 `}` 之前），把 helper 錯誤地塞進 method body 中間。
    expect(result.newCode).toBe(
      'class Target {\n' +
      '  method() {\n' +
      '    const text = "}";\n' +
      '  }\n' +
      '\n' +
      'export function helper() {\n' +
      '  return 1;\n' +
      '}\n' +
      '}\n'
    );
  });
});

describe('FileChangePreparer.findClassInsertPosition - 類別名稱含正則特殊字元應能正確比對', () => {
  it('類別名稱為 `$Target` 時仍應找到插入位置', async () => {
    const targetSource = [
      'class $Target {',
      '  existing() {}',
      '}',
      ''
    ].join('\n');
    const mockFs = createMockFileSystem({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': targetSource
    });
    const preparer = new FileChangePreparer(mockFs);
    const options: MoveMemberOptions = {
      sourceFile: '/src/source.ts',
      memberName: 'helper',
      target: {
        type: MoveTargetType.ExistingClass,
        filePath: '/src/target.ts',
        className: '$Target'
      },
      projectRoot: '/src',
      preview: true
    };

    const result = await preparer.prepareTargetFileChange(options, buildMember());

    // 正確行為：成員被插入到 $Target 類別內部（existing 之後、類別收尾 `}` 之前）。
    // 錯誤重現點：類別名稱含 `$` 時舊版 regex 完全比對不到，
    // findClassInsertPosition 回傳 -1，退回附加到檔尾（helper 落在類別 `}` 之後）。
    expect(result.newCode).toBe(
      'class $Target {\n' +
      '  existing() {}\n' +
      '\n' +
      'export function helper() {\n' +
      '  return 1;\n' +
      '}\n' +
      '}\n'
    );
  });
});
