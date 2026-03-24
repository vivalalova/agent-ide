/**
 * SymbolFinder.findCallSites Benchmark
 * 測量符號查找的效能 baseline
 */

import { bench, describe, beforeAll } from 'vitest';
import * as path from 'path';
import { IndexEngine } from '@core/foundations/indexing/index-engine.js';
import { FileSystem } from '@infrastructure/storage/index.js';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/types.js';
import type { IndexConfig } from '@core/foundations/indexing/types.js';
import { createSymbolFinder } from '@core/foundations/symbol-finder/index.js';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import { initializeDefaultParsers } from '@infrastructure/parser/index.js';

const FIXTURES_ROOT = path.resolve(__dirname, '../fixtures');
const SAMPLE_PROJECT = path.join(FIXTURES_ROOT, 'sample-project');

// eslint-disable-next-line custom/no-new-filesystem -- Benchmark 需要真實 FileSystem
const realFs = new FileSystem();

const BASE_CONFIG: IndexConfig = {
  workspacePath: SAMPLE_PROJECT,
  excludePatterns: [...CLI_INDEX_DEFAULTS.excludePatterns],
  includeExtensions: [...CLI_INDEX_DEFAULTS.includeExtensions],
  maxFileSize: 1024 * 1024,
  enablePersistence: false,
  persistencePath: undefined,
  maxConcurrency: 2,
};

let projectFiles: string[] = [];

const registry = ParserRegistry.getInstance();
initializeDefaultParsers(registry);
const symbolFinder = createSymbolFinder(registry, realFs);

beforeAll(async () => {
  const engine = new IndexEngine(BASE_CONFIG, realFs);
  try {
    await engine.indexProject();
    projectFiles = engine.getAllIndexedFiles().map(f => f.filePath);
  } finally {
    engine.dispose();
  }
});

describe('SymbolFinder', () => {
  bench('findCallSites (common function name)', async () => {
    await symbolFinder.findCallSites('formatDate', projectFiles);
  });

  bench('findCallSites (class method)', async () => {
    await symbolFinder.findCallSites('validate', projectFiles);
  });

  bench('findCallSites (non-existent symbol)', async () => {
    await symbolFinder.findCallSites('nonExistentFunction', projectFiles);
  });
});
