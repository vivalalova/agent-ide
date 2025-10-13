import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
    hideSkipped: true,
    outputFile: {
      json: './test-results.json'
    },
    onConsoleLog(log) {
      // 過濾垃圾回收訊息
      if (log.includes('垃圾回收已啟用')) return false;
      return true;
    },

    // 測試設定檔案
    setupFiles: ['./tests/setup.ts'],

    // 測試包含/排除
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    
    // 記憶體優化設定
    pool: 'forks',
    poolOptions: {
      forks: {
        maxWorkers: 2, // 限制 Worker 數量
      },
    },
    
    // 超時設定
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 30000,
    
    // 並發控制 - 降低並發數減少 Worker 負載
    maxConcurrency: 3,
    
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
      reporter: ['text', 'html', 'json'],
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
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80
        }
      }
    },
  },
});