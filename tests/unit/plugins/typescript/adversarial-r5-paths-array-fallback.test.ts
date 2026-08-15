import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import { loadPathAliases } from '@plugins/typescript/tsconfig-loader.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('tsconfig-loader paths array fallback candidates (adversarial R5)', () => {
  it('resolves to the existing candidate when the first mapped path has no matching file', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@lib/*': ['missing/*', 'src/lib/*']
          }
        }
      }),
      '/project/src/lib/gone.ts': 'export const gone = 1;'
    });

    const aliases = await loadPathAliases('/project', fileSystem);

    expect(aliases['@lib']).toBe(path.resolve('/project/src/lib'));
  });
});
