import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

/**
 * Unit 測試配置
 * - 測試獨立模組/函式
 * - 快速執行、無外部依賴
 * - 可直接 import 實作類別
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    // Unit 測試專屬設定
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // 沒有測試檔案時不報錯
    passWithNoTests: true,

    // Unit 測試較快，超時可較短
    testTimeout: 30000,
    hookTimeout: 5000,

    // Unit 測試不需要 E2E 的 fixture setup
    setupFiles: [],

    // Worker 設定 - Unit 測試可較高並發
    pool: 'forks',
    maxWorkers: 4,
    fileParallelism: true,

    // 覆蓋率設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/unit',
      // 覆蓋整個 src/ 目錄
      include: ['src/**'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        // index.ts 通常只是 re-export
        'src/**/index.ts',
        // 非程式碼檔案
        '**/*.md',
        '**/*.swift',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved',
        '**/swift-bridge/**',
        // 以下模組需要 E2E 測試，不納入 Unit 測試覆蓋率計算
        'src/plugins/**',
        'src/interfaces/cli/**',
        'src/application/services/**',
        'src/application/workflows/**',
        'src/core/change-signature/**',
        'src/core/indexing/**',
        'src/core/move-file/**',
        'src/core/move-member/**',
        'src/core/rename/**',
        'src/infrastructure/parser/**'
      ],
      // Unit 測試覆蓋率門檻
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 30,
        statements: 40
      }
    },
  },
}));
