import { describe, expect, it } from 'vitest';
import { createTargetExposureResolver } from '@core/rename/target-exposure-resolver.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

describe('rename namespace forward re-exported under an alias (adversarial R5)', () => {
  it('follows a namespace forward that is itself re-exported under a different local name', async () => {
    const files: Record<string, string> = {
      '/proj/def.ts': 'export function run() {}',
      '/proj/barrel.ts': 'export * as ns from "./def";',
      '/proj/entry.ts': 'export { ns as api } from "./barrel";',
      '/proj/consumer.ts': 'import { api } from "./entry"; api.run();'
    };
    const fileSystem = {
      readFile: async (filePath: string) => files[filePath]
    } as unknown as IFileSystem;

    const resolver = await createTargetExposureResolver({
      fileSystem,
      projectFiles: Object.keys(files),
      definitionFilePath: '/proj/def.ts',
      symbolName: 'run'
    });

    expect(resolver('/proj/consumer.ts', './entry', 'api')).toBe(true);
  });
});
