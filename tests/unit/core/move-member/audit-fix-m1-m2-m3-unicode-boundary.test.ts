/**
 * audit-fix M1 / M2 / M3 regression（先紅後綠）— move-member Unicode 邊界
 *
 * M1：純 Unicode 成員名搬移後，來源檔殘留引用應補 import（`\\b` 對非 ASCII 失效）
 * M2/M3：Unicode className 插入應進 class 內（`class ${name}\\b` 的 `\\b` 對
 *        純 Unicode 識別符不構成 word boundary，findClassInsertPosition 回 -1
 *        退回檔尾附加）
 */
import { describe, expect, it } from 'vitest';
import { FileChangePreparer } from '@core/move-member/file-change-preparer.js';
import { MoveMemberEngine } from '@core/move-member/move-member-engine.js';
import {
  MemberType,
  MoveTargetType,
  type MemberDefinition,
  type MoveMemberOptions
} from '@core/move-member/types.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

function buildMethodMember(name: string, sourceCode: string): MemberDefinition {
  return {
    name,
    type: MemberType.Function,
    location: {
      filePath: '/src/source.ts',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 2 }
      }
    },
    sourceCode,
    modifiers: ['export'],
    dependencies: []
  };
}

describe('audit-fix M1：純 Unicode 成員殘留引用應補 import', () => {
  it('搬移 export function 工具 後，同檔仍呼叫 工具() 的程式碼應得到 import', async () => {
    const sourceCode = [
      'export function 工具() {',
      '  return 1;',
      '}',
      '',
      'export function 使用() {',
      '  return 工具();',
      '}',
      ''
    ].join('\n');

    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/src/unicode-src.ts': sourceCode,
      '/src/unicode-dst.ts': 'export const seed = 0;\n'
    });

    const engine = new MoveMemberEngine(createMockParserRegistry(), fs);
    const options: MoveMemberOptions = {
      sourceFile: '/src/unicode-src.ts',
      memberName: '工具',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/unicode-dst.ts'
      },
      projectRoot: '/src',
      preview: false
    };

    const result = await engine.moveMember(options);
    expect(result.success).toBe(true);

    const sourceAfter = (await fs.readFile('/src/unicode-src.ts', 'utf-8')) as string;
    // 使用() 仍呼叫 工具 → 必須從目標檔 import
    expect(sourceAfter).toMatch(/import\s*\{[^}]*工具[^}]*\}\s*from/);
    expect(sourceAfter).toContain('return 工具()');
    expect(sourceAfter).not.toContain('export function 工具');
  });
});

describe('audit-fix M2/M3：Unicode className 插入應進 class 內', () => {
  it('class 服務 目標插入時成員應落在 class body 內，非檔尾 class 外', async () => {
    const targetSource = [
      'export class 服務 {',
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
        className: '服務'
      },
      projectRoot: '/src',
      preview: true
    };

    const result = await preparer.prepareTargetFileChange(
      options,
      buildMethodMember('helper', 'export function helper() {\n  return 1;\n}')
    );

    // 正確：helper 在 existing 之後、class 收尾 } 之前
    // 錯誤：findClassInsertPosition 因 \\b 失敗回 -1，helper 附在檔尾 class 外
    const classClose = result.newCode.lastIndexOf('}');
    const helperIdx = result.newCode.indexOf('function helper');
    expect(helperIdx).toBeGreaterThan(-1);
    expect(helperIdx).toBeLessThan(classClose);

    expect(result.newCode).toContain('export class 服務 {');
    expect(result.newCode).toMatch(/existing\(\) \{\}\s*\n\s*\nexport function helper/);
  });

  it('class 名稱含混合 ASCII+Unicode 時仍應插入 class 內', async () => {
    const targetSource = [
      'export class Api服務 {',
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
        className: 'Api服務'
      },
      projectRoot: '/src',
      preview: true
    };

    const result = await preparer.prepareTargetFileChange(
      options,
      buildMethodMember('helper', 'export function helper() {\n  return 1;\n}')
    );

    const classClose = result.newCode.lastIndexOf('}');
    const helperIdx = result.newCode.indexOf('function helper');
    expect(helperIdx).toBeGreaterThan(-1);
    expect(helperIdx).toBeLessThan(classClose);
  });
});
