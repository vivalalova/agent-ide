/**
 * audit-fix C1 regression（unit，先紅後綠）
 *
 * 同檔 move-member apply 後，磁碟內容不得殘留被移走成員造成的尾段垃圾。
 * 根因候選：prepareTargetFileChange 同檔時 originalCode 設成「移除後內容」，
 * buildChangeset 的整檔 range 短於磁碟，applyTextEdits 只替換前段。
 */

import { describe, expect, it } from 'vitest';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import { MoveTargetType } from '@core/move-member/types.js';
import type { MoveMemberOptions } from '@core/move-member/types.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('audit-fix C1：同檔 move-member 尾段垃圾（unit）', () => {
  it('C1：apply 後檔案不得殘留移除前尾段／重複成員', async () => {
    const sourceCode = [
      'export function alpha() {',
      '  const a = 1;',
      '  const b = 2;',
      '  return a + b;',
      '}',
      '',
      'export function beta() {',
      '  return 2;',
      '}',
      '',
      'export function gamma() {',
      '  return 3;',
      '}',
      ''
    ].join('\n');

    const fs = new MemFileSystem();
    await fs.fromJSON({ '/src/c1.ts': sourceCode });

    const engine = new MoveMemberEngine(createMockParserRegistry(), fs);
    const options: MoveMemberOptions = {
      sourceFile: '/src/c1.ts',
      memberName: 'alpha',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/c1.ts'
      },
      projectRoot: '/src',
      preview: false
    };

    const result = await engine.moveMember(options);
    expect(result.success).toBe(true);

    const written = (await fs.readFile('/src/c1.ts', 'utf-8')) as string;

    expect(written.match(/function alpha\(/g)).toHaveLength(1);
    expect(written.match(/function beta\(/g)).toHaveLength(1);
    expect(written.match(/function gamma\(/g)).toHaveLength(1);

    expect(written.indexOf('function beta')).toBeLessThan(written.indexOf('function alpha'));
    expect(written.indexOf('function gamma')).toBeLessThan(written.indexOf('function alpha'));

    const afterAlpha = written.slice(written.lastIndexOf('function alpha'));
    expect(afterAlpha).not.toMatch(/function beta/);
    expect(afterAlpha).not.toMatch(/function gamma/);
    // 不得在 alpha 完整閉合後再殘留 body 片段
    expect(written.trimEnd().endsWith('}')).toBe(true);
    expect(written.length).toBeLessThan(sourceCode.length + 40);
  });
});
