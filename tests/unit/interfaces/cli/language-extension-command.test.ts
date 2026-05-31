import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { executeCLI } from '../../../helpers/cli-executor.js';
import { createToyParser } from '../../../helpers/toy-parser.js';

describe('CLI language extension support', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('searches symbols from parser-registered extensions', async () => {
    const memfs = await createToyProject();

    const result = await executeCLI(
      ['search', 'Alpha', '--path', '/project', '--format', 'json', '--no-fuzzy'],
      { memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('/project/src/main.toy');
    expect(result.stdout).toContain('[variable] Alpha');
  });

  it('fast-fails TS-specific mutation commands for parsers without declared capabilities', async () => {
    const memfs = await createToyProject();

    const result = await executeCLI(
      [
        'change-signature',
        'src/main.toy',
        'Alpha',
        '--path',
        '/project',
        '--add',
        'next:string',
        '--format',
        'json'
      ],
      { memfs }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('未宣告支援 change-signature');
  });

  it('fast-fails call hierarchy for parsers without declared capabilities', async () => {
    const memfs = await createToyProject();

    const result = await executeCLI(
      ['call-hierarchy', 'Alpha', '--path', '/project', '--format', 'json'],
      { memfs }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('未宣告支援 call-hierarchy');
  });

  it('fast-fails move member for parsers without declared capabilities', async () => {
    const memfs = await createToyProject();

    const result = await executeCLI(
      [
        'move',
        'src/main.toy:1',
        'src/target.toy',
        '--path',
        '/project',
        '--dry-run',
        '--format',
        'json'
      ],
      { memfs }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('未宣告支援 move-member');
  });
});

async function createToyProject(): Promise<MemFileSystem> {
  const memfs = new MemFileSystem();
  await memfs.fromJSON({
    '/project/package.json': '{}',
    '/project/src/main.toy': 'symbol Alpha\n',
    '/project/src/target.toy': ''
  });
  return memfs;
}
