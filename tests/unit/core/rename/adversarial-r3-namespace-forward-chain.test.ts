import { describe, expect, it } from 'vitest';
import { createTargetExposureResolver } from '@core/rename/target-exposure-resolver.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

describe('rename namespace forward chain (adversarial R3)', () => {
  it('follows export-star through a namespace forward before resolving the local name', async () => {
    const files: Record<string, string> = {
      '/proj/def.ts': 'export function X() {}',
      '/proj/barrel1.ts': 'export * as ns from "./def";',
      '/proj/barrel2.ts': 'export * from "./barrel1";',
      '/proj/app.ts': 'import { ns } from "./barrel2"; ns.X();'
    };
    const fileSystem = {
      readFile: async (filePath: string) => files[filePath]
    } as unknown as IFileSystem;

    const resolver = await createTargetExposureResolver({
      fileSystem,
      projectFiles: Object.keys(files),
      definitionFilePath: '/proj/def.ts',
      symbolName: 'X'
    });

    expect(resolver('/proj/app.ts', './barrel2', 'ns')).toBe(true);
  });
});
