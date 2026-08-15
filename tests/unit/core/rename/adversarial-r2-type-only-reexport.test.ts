/**
 * P1: createTargetExposureResolver skips type-only re-exports (export type { X } from).
 */
import { describe, expect, it } from 'vitest';
import { createTargetExposureResolver } from '@core/rename/target-exposure-resolver.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('type-only re-export exposure (adversarial R2)', () => {
  it('treats export type { UserId } from barrel as exposing UserId', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/proj/types.ts': 'export type UserId = string;\n',
      '/proj/barrel.ts': 'export type { UserId } from \'./types\';\n',
      '/proj/app.ts': 'import type { UserId } from \'./barrel\';\nconst x: UserId = \'1\';\n'
    });

    const resolver = await createTargetExposureResolver({
      fileSystem: fs,
      projectFiles: ['/proj/types.ts', '/proj/barrel.ts', '/proj/app.ts'],
      definitionFilePath: '/proj/types.ts',
      symbolName: 'UserId'
    });

    // Consumer importing from barrel must resolve as exposing the definition
    expect(resolver('/proj/app.ts', './barrel')).toBe(true);
  });
});
