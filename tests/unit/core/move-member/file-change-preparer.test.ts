import { describe, expect, it } from 'vitest';
import { FileChangePreparer } from '@core/move-member/file-change-preparer.js';
import { MemberType, MoveTargetType, type MemberDefinition, type MoveMemberOptions } from '@core/move-member/types.js';
import { createMockFileSystem } from '../_helpers/mock-factories.js';

describe('FileChangePreparer modern module extensions', () => {
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
