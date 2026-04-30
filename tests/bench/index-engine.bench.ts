/**
 * IndexEngine.indexProject Benchmark
 * 測量專案索引的效能 baseline
 */

import { bench, describe } from 'vitest';
import * as path from 'path';
import { IndexEngine } from '@core/foundations/indexing/index-engine.js';
import { FileSystem } from '@infrastructure/storage/index.js';
import { CLI_INDEX_DEFAULTS } from '@core/foundations/indexing/types.js';
import type { IndexConfig } from '@core/foundations/indexing/types.js';

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

describe('IndexEngine', () => {
  bench('indexProject (sample-project)', async () => {
    const engine = new IndexEngine(BASE_CONFIG, realFs);
    try {
      await engine.indexProject();
    } finally {
      engine.dispose();
    }
  });

  bench('indexProject + getStats', async () => {
    const engine = new IndexEngine(BASE_CONFIG, realFs);
    try {
      await engine.indexProject();
      await engine.getStats();
    } finally {
      engine.dispose();
    }
  });

  bench('indexProject + searchSymbols', async () => {
    const engine = new IndexEngine(BASE_CONFIG, realFs);
    try {
      await engine.indexProject();
      engine.searchSymbols('User');
    } finally {
      engine.dispose();
    }
  });
});
