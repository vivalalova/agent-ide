/**
 * MoveMemberEngine 單元測試
 */

import { describe, it, expect } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveMemberErrorCode, MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

function makeOptions(overrides?: Partial<MoveMemberOptions>): MoveMemberOptions {
  return {
    sourceFile: '/src/source.ts',
    memberName: 'nonExistentFunc',
    target: {
      type: MoveTargetType.ExistingFile,
      filePath: '/src/target.ts'
    },
    projectRoot: '/src',
    preview: true,
    ...overrides
  };
}

describe('MoveMemberEngine', () => {
  describe('moveMember - 找不到成員', () => {
    it('Given 空檔案（fileUtils 返回 null）, when moveMember, then success: false + member-not-found', async () => {
      const mockFs = createMockFileSystem({});
      const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

      const result = await engine.moveMember(makeOptions());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(MoveMemberErrorCode.MemberNotFound);
      }
    });

    it('Given 無 memberName 且無 sourcePosition, when moveMember, then success: false + member-not-found', async () => {
      const mockFs = createMockFileSystem({ '/src/source.ts': 'const x = 1;' });
      const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

      const result = await engine.moveMember(makeOptions({
        memberName: undefined,
        sourcePosition: undefined
      }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(MoveMemberErrorCode.MemberNotFound);
      }
    });

    it('Given 存在的 .ts 檔案但無指定成員, when moveMember by name, then success: false', async () => {
      const mockFs = createMockFileSystem({
        '/src/source.ts': 'export const helper = 1;'
      });
      const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

      const result = await engine.moveMember(makeOptions({ memberName: 'nonExistent' }));

      expect(result.success).toBe(false);
    });
  });

  describe('moveMember - 成功找到成員', () => {
    it('Given TypeScript 檔案含函數, when moveMember preview, then success: true + member.name 正確', async () => {
      const content = 'export function greet(name: string): string { return name; }';
      const mockFs = createMockFileSystem({
        '/src/source.ts': content,
        '/src/target.ts': ''
      });
      const engine = new MoveMemberEngine(createMockParserRegistry(), mockFs);

      const result = await engine.moveMember(makeOptions({ memberName: 'greet' }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.member.name).toBe('greet');
        expect(result.executed).toBe(false); // preview mode
      }
    });
  });
});
