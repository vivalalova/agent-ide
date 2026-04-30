import { describe, expect, it } from 'vitest';

import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { resolveChangeSignaturePaths } from '@interfaces/cli/commands/change-signature.command.js';

describe('resolveChangeSignaturePaths', () => {
  it('uses explicit --path as project root', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/workspace/project/package.json': '{}',
      '/workspace/project/src/service.ts': 'export function target() {}'
    });

    const result = await resolveChangeSignaturePaths({
      resolvedFile: 'src/service.ts',
      pathOption: '/workspace/project',
      cwd: '/workspace',
      fileSystem
    });

    expect(result).toEqual({
      projectRoot: '/workspace/project',
      filePath: '/workspace/project/src/service.ts'
    });
  });

  it('infers nearest project root from absolute target file when --path is omitted', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/repo/tests/fixtures/sample-project/package.json': '{}',
      '/repo/tests/fixtures/sample-project/src/services/user-service.ts': 'export function createUser(data: unknown) { return data; }',
      '/repo/tests/fixtures/js-project/package.json': '{}',
      '/repo/tests/fixtures/js-project/src/api.js': 'createUser("wrong-project");'
    });

    const result = await resolveChangeSignaturePaths({
      resolvedFile: '/repo/tests/fixtures/sample-project/src/services/user-service.ts',
      cwd: '/repo',
      fileSystem
    });

    expect(result).toEqual({
      projectRoot: '/repo/tests/fixtures/sample-project',
      filePath: '/repo/tests/fixtures/sample-project/src/services/user-service.ts'
    });
  });

  it('falls back to cwd when no project marker exists', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/repo/src/service.ts': 'export function target() {}'
    });

    const result = await resolveChangeSignaturePaths({
      resolvedFile: '/repo/src/service.ts',
      cwd: '/repo',
      fileSystem
    });

    expect(result).toEqual({
      projectRoot: '/repo',
      filePath: '/repo/src/service.ts'
    });
  });
});
