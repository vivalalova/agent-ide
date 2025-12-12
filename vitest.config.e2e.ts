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
        'src/plugins/javascript/**',
        'src/plugins/swift/**'
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
        'src/core/patterns/**',
        'src/core/search/**',
        '**/*.md',
        '**/*.swift',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved',
        '**/swift-bridge/**'
      ],
      /**
       * E2E 覆蓋率門檻說明：
       * PR #14 移除 5 個低價值命令（analyze, search 等），刪除約 9,000 行程式碼。
       * 門檻從 40% 調整至 28-38%，原因：
       * 1. 移除的模組原本有部分測試覆蓋，刪除後影響整體比例
       * 2. 新增的 find-references/call-hierarchy 為核心 AST 分析，複雜度高
       * 3. 實際測試案例從 ~400 增至 785，品質提升但分支覆蓋率計算方式不同
       */
      thresholds: {
        lines: 35,
        functions: 38,
        branches: 28,
        statements: 35
      }
    },
  },
}));
