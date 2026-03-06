import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

/**
 * E2E 測試配置
 * - 透過 CLI 測試完整功能流程
 * - 使用 memfs 隔離檔案操作
 * - 較長的超時時間以支援複雜操作
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    // E2E 測試專屬設定
    include: ['tests/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // E2E 需要較長超時
    testTimeout: 120000,
    hookTimeout: 10000,

    // E2E 測試專用 setup
    setupFiles: ['./tests/setup.ts'],

    // Worker 設定 - E2E 測試資源消耗較大
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: true,

    // 覆蓋率設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/e2e',
      include: [
        'src/core/**',
        'src/infrastructure/parser/**',
        'src/infrastructure/formatters/**',
        'src/infrastructure/storage/**',
        'src/plugins/typescript/**',
        'src/plugins/javascript/**'
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/**/index.ts',
        'src/bin/**',
        'src/interfaces/**',
        '**/*.md',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved'
      ],
      thresholds: {
        lines: 43,
        functions: 45,
        branches: 40,
        statements: 43
      }
    },
  },
}));
