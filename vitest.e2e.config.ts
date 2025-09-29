/**
 * E2E 測試專用配置檔案
 * 針對端到端測試的特殊需求進行優化
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': '/Users/lova/git/vibe/agent-ide/src/core',
      '@infrastructure': '/Users/lova/git/vibe/agent-ide/src/infrastructure',
      '@plugins': '/Users/lova/git/vibe/agent-ide/src/plugins',
      '@interfaces': '/Users/lova/git/vibe/agent-ide/src/interfaces',
      '@application': '/Users/lova/git/vibe/agent-ide/src/application',
      '@shared': '/Users/lova/git/vibe/agent-ide/src/shared',
      '@shared/types': '/Users/lova/git/vibe/agent-ide/src/shared/types/index',
      '@shared/errors': '/Users/lova/git/vibe/agent-ide/src/shared/errors/index',
      '@shared/utils': '/Users/lova/git/vibe/agent-ide/src/shared/utils/index'
    }
  },
  test: {
    name: 'e2e',
    globals: true,
    environment: 'node',

    // E2E 測試包含模式
    include: ['tests/e2e/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/core/**',
      'tests/infrastructure/**',
      'tests/plugins/**',
      'tests/interfaces/**',
      'tests/application/**',
      'tests/shared/**',
      'tests/integration/**',
      'tests/edge-cases/**'
    ],

    // E2E 測試特殊設定
    setupFiles: ['tests/e2e/setup.ts'],
    teardownTimeout: 30000,

    // 較長的超時時間以處理真實環境操作
    testTimeout: 300000, // 5 分鐘
    hookTimeout: 30000,  // 30 秒

    // 記憶體優化設定
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        maxWorkers: 2,
      },
    },

    // 並發控制 - E2E 測試需要更低的並發數
    maxConcurrency: 2,

    // 清理設定
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // 記憶體報告
    logHeapUsage: true,

    // 報告設定
    reporters: process.env.CI ? ['dot', 'junit'] : ['default', 'html'],
    outputFile: {
      junit: './test-results/e2e-junit.xml',
      html: './test-results/e2e-report.html'
    },

    // 覆蓋率設定 - 針對 E2E 測試優化
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage/e2e',

      // E2E 測試覆蓋範圍
      include: [
        'src/core/**',
        'src/infrastructure/**',
        'src/interfaces/**',
        'src/application/**'
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/**/index.ts', // 純 export 檔案
        'src/bin/**' // 執行檔案
      ],

      // 覆蓋率閾值
      thresholds: {
        global: {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90
        },
        // 核心模組要求更高覆蓋率
        'src/core/**': {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95
        },
        // 介面層覆蓋率可以稍低
        'src/interfaces/**': {
          lines: 85,
          functions: 85,
          branches: 80,
          statements: 85
        }
      }
    }
  }
});