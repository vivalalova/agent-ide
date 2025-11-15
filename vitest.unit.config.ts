import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@plugins': resolve(__dirname, 'src/plugins'),
      '@interfaces': resolve(__dirname, 'src/interfaces'),
      '@application': resolve(__dirname, 'src/application'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@shared/types': resolve(__dirname, 'src/shared/types/index'),
      '@shared/errors': resolve(__dirname, 'src/shared/errors/index'),
      '@shared/utils': resolve(__dirname, 'src/shared/utils/index')
    }
  },
  test: {
    globals: true,
    environment: 'node',

    // 報告器設定
    reporters: ['default'],
    outputFile: {
      json: './test-results-unit.json'
    },

    // 測試設定檔案
    setupFiles: ['./tests/setup.ts'],

    // 測試包含/排除 - 只包含 unit test
    include: [
      'tests/unit/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      '**/*.e2e.test.ts'
    ],

    // 記憶體優化設定
    pool: 'forks',
    maxWorkers: 4,

    // 超時設定
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,

    // 並發控制
    maxConcurrency: 5,

    // 清理設定
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // 記憶體報告
    logHeapUsage: false,

    // 覆蓋率設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/core/**',
        'src/infrastructure/**',
        'src/plugins/**',
        'src/application/**'
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
        'src/interfaces/**'
      ],
      thresholds: {
        global: {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90
        }
      }
    },
  },
});
