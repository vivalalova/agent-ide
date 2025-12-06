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
      include: [
        // 已有 unit test 覆蓋的模組
        'src/core/snapshot/**',
        'src/core/dependency/cycle-detector.ts',
        'src/core/dependency/dependency-graph.ts',
        'src/core/shared/**',
        'src/infrastructure/formatters/**'
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
        '**/swift-bridge/**',
        // 未測試的檔案（待補充測試後移除）
        'src/infrastructure/formatters/preview-converter.ts'
      ],
      // Unit 測試覆蓋率門檻
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    },
  },
}));
