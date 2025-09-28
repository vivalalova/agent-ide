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
    globals: true,
    environment: 'node',

    // 只顯示失敗的測試
    reporters: process.env.CI ? ['dot'] : ['default'],
    hideSkipped: true,

    // 測試設定檔案
    setupFiles: ['./tests/setup.ts'],
    
    // 記憶體優化設定
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        maxWorkers: 2, // 限制 Worker 數量
      },
    },
    
    // 超時設定 - 設定為 30 秒
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    
    // 並發控制 - 降低並發數減少 Worker 負載
    maxConcurrency: 3,
    
    // 清理設定
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    
    // 記憶體報告
    logHeapUsage: true,
    
    // 覆蓋率設定
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    },
  },
});