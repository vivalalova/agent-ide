import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
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
      json: './test-results-e2e.json'
    },
    onConsoleLog(log) {
      // 過濾垃圾回收訊息
      if (log.includes('垃圾回收已啟用')) return false;
      return true;
    },

    // 測試設定檔案
    setupFiles: ['./tests/setup.ts'],

    // 測試包含/排除 - 只包含 E2E test
    include: [
      'tests/e2e/**/*.test.ts',
      '**/*.e2e.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/unit/**',
      'src/**/*.unit.test.ts'
    ],

    // 記憶體優化設定
    pool: 'forks',
    maxWorkers: 1,

    // 超時設定
    testTimeout: 120000, // E2E 測試需要更長時間
    hookTimeout: 10000,
    teardownTimeout: 30000,

    // 並發控制 - 降低並發數減少 Worker 負載
    maxConcurrency: 2,

    // 清理設定
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // 記憶體報告
    logHeapUsage: false,

    // E2E 測試不需要覆蓋率
    coverage: {
      enabled: false
    },
  },
});
