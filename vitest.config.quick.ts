import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

const QUICK_TEST_TIMEOUT_MS = 120_000;
const QUICK_HOOK_TIMEOUT_MS = 10_000;
const QUICK_MAX_WORKERS = 4;

/**
 * Quick regression suite used by `pnpm test`.
 * Covers all unit tests plus the TypeScript E2E smoke set in one Vitest run.
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/e2e/commands/typescript/cli-impact-advanced.e2e.test.ts',
      'tests/e2e/commands/typescript/cli-search.e2e.test.ts',
      'tests/e2e/commands/typescript/cli-rename.e2e.test.ts',
    ],
    exclude: ['node_modules/**', 'dist/**'],
    passWithNoTests: false,
    testTimeout: QUICK_TEST_TIMEOUT_MS,
    hookTimeout: QUICK_HOOK_TIMEOUT_MS,
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    maxWorkers: QUICK_MAX_WORKERS,
    fileParallelism: true,
  },
}));
