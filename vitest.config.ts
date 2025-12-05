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
    reporters: ['dot'],
    outputFile: {
      json: './test-results.json'
    },

    // Diff 輸出精簡化
    diff: {
      expand: false,           // 不展開上下文
      truncateThreshold: 200,  // 超過 200 字元截斷
    },
    onConsoleLog(log) {
      // 過濾不需要的訊息
      if (log.includes('垃圾回收已啟用')) return false;
      if (log.includes('[DEBUG]')) return false;
      return true;
    },

    // 測試設定檔案
    setupFiles: ['./tests/setup.ts'],

    // 測試包含/排除
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // Worker 設定
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: true,

    // 超時設定
    testTimeout: 120000, // 增加到 120 秒（dead code detection 需要時間）
    hookTimeout: 10000,
    teardownTimeout: 30000,

    // 並發控制 - 降低並發數減少 Worker 負載
    maxConcurrency: 20,

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
        'src/interfaces/**',
        // 非 JS/TS 檔案
        '**/*.md',
        '**/*.swift',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved',
        '**/swift-bridge/**'
      ],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 40,
        statements: 40
      }
    },
  },
});
