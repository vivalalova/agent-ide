import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vitest 基礎配置
 * 此配置作為所有測試配置的基底，包含：
 * - 路徑別名
 * - 通用測試設定
 *
 * 專用配置：
 * - vitest.config.e2e.ts - E2E 測試（CLI 端對端測試）
 * - vitest.config.unit.ts - Unit 測試（獨立模組測試）
 */
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
      expand: false,
      truncateThreshold: 200,
    },
    onConsoleLog(log) {
      if (log.includes('垃圾回收已啟用')) return false;
      if (log.includes('[DEBUG]')) return false;
      return true;
    },

    // 並發控制
    maxConcurrency: 20,

    // 清理設定
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    // 記憶體報告
    logHeapUsage: false,
  },
});
