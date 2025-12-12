import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

/**
 * CLI 整合測試配置
 * - 透過實際 CLI 執行測試（非 memfs）
 * - 驗證 CLI 命令功能正確性
 * - 覆蓋率要求較低（煙霧測試性質）
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    include: ['tests/cli/**/*.cli.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // CLI 測試需要較長超時
    testTimeout: 60000,
    hookTimeout: 10000,

    // 測試專用 setup
    setupFiles: ['./tests/setup.ts'],

    // 單執行緒避免 fixture 衝突
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,

    // 覆蓋率設定（煙霧測試，門檻較低）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/cli',
      include: [
        'src/interfaces/cli/**',
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10
      }
    },
  },
}));
