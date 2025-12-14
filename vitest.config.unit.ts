import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

// === 超時設定（毫秒） ===
const TEST_TIMEOUT_MS = 30_000; // 單一測試超時
const HOOK_TIMEOUT_MS = 5_000; // beforeEach/afterEach 超時

// === 並發設定 ===
const MAX_WORKERS = 4; // 最大並發 worker 數

// === 覆蓋率門檻（百分比） ===
const COVERAGE_THRESHOLD = {
  lines: 90,
  functions: 95,
  branches: 85,
  statements: 90
};

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

    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: HOOK_TIMEOUT_MS,

    // Unit 測試不需要 E2E 的 fixture setup
    setupFiles: [],

    // Worker 設定 - Unit 測試可較高並發
    pool: 'forks',
    maxWorkers: MAX_WORKERS,
    fileParallelism: true,

    // 覆蓋率設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/unit',
      // 覆蓋整個 src/ 目錄
      include: ['src/**'],
      exclude: [
        // === 基礎排除 ===
        'node_modules/**',
        'tests/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/**/index.ts', // re-export 檔案，無邏輯

        // === 非程式碼檔案 ===
        '**/*.md',
        '**/*.swift',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved',
        '**/swift-bridge/**',

        // === 需要 E2E 測試的模組（不納入 Unit 覆蓋率） ===
        'src/plugins/**', // 語言 Parser，需實際檔案解析
        'src/interfaces/cli/**', // CLI 命令，需端對端流程驗證
        'src/application/services/**', // 服務層，整合多個核心模組
        'src/application/workflows/**', // 工作流程，多步驟操作
        'src/core/change-signature/**', // 簽名變更，需測試呼叫點更新
        'src/core/indexing/**', // 索引引擎，需大量檔案測試
        'src/core/move-file/**', // 檔案移動，需測試 import 更新
        'src/core/move-member/**', // 成員移動，涉及多檔案修改
        'src/core/rename/**', // 重命名，需完整流程驗證
        'src/infrastructure/parser/**' // Parser 框架，需實際解析測試
      ],
      thresholds: COVERAGE_THRESHOLD
    },
  },
}));
