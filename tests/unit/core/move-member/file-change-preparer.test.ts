import { describe, expect, it } from 'vitest';
import { FileChangePreparer } from '@core/move-member/file-change-preparer.js';
import { MemberType, MoveTargetType, type MemberDefinition, type MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem } from '../_helpers/mock-factories.js';

describe('FileChangePreparer modern module extensions', () => {
  it('does not leave duplicate blank lines when removing the first member after a file header', async () => {
    const mockFs = createMockFileSystem({
      '/src/source.ts': [
        '/**',
        ' * Source helpers',
        ' */',
        '',
        'export function helper() {',
        '  return 1;',
        '}',
        '',
        'export function other() {',
        '  return 2;',
        '}',
        ''
      ].join('\n')
    });
    const preparer = new FileChangePreparer(mockFs);
    const member: MemberDefinition = {
      name: 'helper',
      type: MemberType.Function,
      location: {
        filePath: '/src/source.ts',
        range: {
          start: { line: 5, column: 1 },
          end: { line: 7, column: 2 }
        }
      },
      sourceCode: 'export function helper() {\n  return 1;\n}',
      modifiers: ['export'],
      dependencies: []
    };
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

    const result = await preparer.prepareSourceFileChange(options, member);

    expect(result.newCode).toContain(' */\n\nexport function other()');
    expect(result.newCode).not.toContain(' */\n\n\nexport function other()');
  });

  it('keeps an EOF newline when inserting a member into an existing target file', async () => {
    const mockFs = createMockFileSystem({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': 'export const existing = true;'
    });
    const preparer = new FileChangePreparer(mockFs);
    const member: MemberDefinition = {
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

    const result = await preparer.prepareTargetFileChange(options, member);

    expect(result.newCode.endsWith('\n')).toBe(true);
  });

  it('does not insert duplicate blank lines before an appended member', async () => {
    const mockFs = createMockFileSystem({
      '/src/source.ts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.ts': 'export const existing = true;\n'
    });
    const preparer = new FileChangePreparer(mockFs);
    const member: MemberDefinition = {
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

    const result = await preparer.prepareTargetFileChange(options, member);

    expect(result.newCode).toContain('export const existing = true;\n\nexport function helper()');
    expect(result.newCode).not.toContain('export const existing = true;\n\n\nexport function helper()');
  });

  it('re-export path should strip .mts/.cts source extensions', async () => {
    const mockFs = createMockFileSystem({
      '/src/source.mts': 'export function helper() {\n  return 1;\n}\n',
      '/src/target.cts': ''
    });
    const preparer = new FileChangePreparer(mockFs);
    const member: MemberDefinition = {
      name: 'helper',
      type: MemberType.Function,
      location: {
        filePath: '/src/source.mts',
        range: {
          start: { line: 1, column: 1 },
          end: { line: 3, column: 2 }
        }
      },
      sourceCode: 'export function helper() {\n  return 1;\n}',
      modifiers: ['export'],
      dependencies: []
    };
    const options: MoveMemberOptions = {
      sourceFile: '/src/source.mts',
      memberName: 'helper',
      target: {
        type: MoveTargetType.ExistingFile,
        filePath: '/src/target.cts'
      },
      projectRoot: '/src',
      preview: true,
      keepReexport: true
    };

    const result = await preparer.prepareSourceFileChange(options, member);

    expect(result.newCode).toContain('export { helper } from \'./target\';');
    expect(result.newCode).not.toContain('./target.cts');
  });
});
