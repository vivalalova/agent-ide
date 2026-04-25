import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/index.js';
import { loadTsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';

async function createFileSystem(files: Record<string, string>): Promise<MemFileSystem> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return fileSystem;
}

describe('loadTsconfigPathConfig', () => {
  it('Given TypeScript tsconfig syntax, when loading path aliases, then accepts comments and trailing comma', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.json': `{
        "compilerOptions": {
          // TypeScript accepts comments in tsconfig.json.
          "baseUrl": ".",
          "paths": {
            "@/*": ["src/*"],
          },
        },
      }`
    });

    const config = await loadTsconfigPathConfig('/project/src', fileSystem);

    expect(config.baseUrl).toBe(path.resolve('/project'));
    expect(config.pathAliases['@']).toBe(path.resolve('/project/src'));
  });

  it('Given extended tsconfig, when base config defines aliases, then inherits those aliases', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*']
          }
        }
      }),
      '/project/tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json'
      })
    });

    const config = await loadTsconfigPathConfig('/project/src', fileSystem);

    expect(config.pathAliases['@']).toBe(path.resolve('/project/src'));
  });

  it('Given child paths, when base config also defines paths, then child paths replace inherited paths', async () => {
    const fileSystem = await createFileSystem({
      '/project/tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '~/*': ['lib/*']
          }
        }
      }),
      '/project/tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: {
          paths: {
            '#/*': ['app/*']
          }
        }
      })
    });

    const config = await loadTsconfigPathConfig('/project/src', fileSystem);

    expect(config.pathAliases).toEqual({
      '#': path.resolve('/project/app')
    });
  });
});
