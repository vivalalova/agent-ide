/**
 * CLI impact/cycles path configuration regressions.
 * These tests intentionally exercise the command wiring, not only PathResolver.
 */
import { describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { executeCLI } from '../../../helpers/cli-executor.js';

describe('CLI impact/cycles path configuration regressions', () => {
  it('cycles resolves path-alias imports from tsconfig', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['./src/*'] }
        }
      }),
      '/project/src/a.ts': 'import { b } from "@/b"; export const a = b;',
      '/project/src/b.ts': 'import { a } from "@/a"; export const b = a;'
    });

    const result = await executeCLI(
      ['cycles', '--path', '/project', '--format', 'json'],
      { memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as { cycles: Array<{ cycle: string[] }> };
    expect(output.cycles.some(({ cycle }) =>
      cycle.some(file => file.endsWith('/src/a.ts'))
      && cycle.some(file => file.endsWith('/src/b.ts'))
    )).toBe(true);
  });

  it('cycles resolves bare imports relative to a tsconfig baseUrl', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: './src' }
      }),
      '/project/src/a.ts': 'import { b } from "b"; export const a = b;',
      '/project/src/b.ts': 'import { a } from "a"; export const b = a;'
    });

    const result = await executeCLI(
      ['cycles', '--path', '/project', '--format', 'json'],
      { memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as { cycles: Array<{ cycle: string[] }> };
    expect(output.cycles.some(({ cycle }) =>
      cycle.some(file => file.endsWith('/src/a.ts'))
      && cycle.some(file => file.endsWith('/src/b.ts'))
    )).toBe(true);
  });

  it('impact returns transitive dependents for bare baseUrl imports', async () => {
    const memfs = new MemFileSystem();
    await memfs.fromJSON({
      '/project/tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: './src' }
      }),
      '/project/src/base.ts': 'export const base = 1;',
      '/project/src/mid.ts': 'import { base } from "base"; export const mid = base;',
      '/project/src/top.ts': 'import { mid } from "mid"; export const top = mid;'
    });

    const result = await executeCLI(
      ['impact', '--file', 'src/base.ts', '--path', '/project', '--format', 'json'],
      { memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as { impact: { dependents: string[] } };
    expect(output.impact.dependents.some(file => file.endsWith('/src/mid.ts'))).toBe(true);
    expect(output.impact.dependents.some(file => file.endsWith('/src/top.ts'))).toBe(true);
  });
});
