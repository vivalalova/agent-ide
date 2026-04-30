import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

/**
 * E2E 測試配置
 * - 透過 CLI 測試完整功能流程
 * - 使用 memfs 隔離檔案操作
 * - 較長的超時時間以支援複雜操作
 */
export default mergeConfig(baseConfig, defineConfig({
  test: {
    // E2E 測試專屬設定
    include: ['tests/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],

    // E2E 需要較長超時
    testTimeout: 120000,
    hookTimeout: 10000,

    // E2E 測試專用 setup
    setupFiles: ['./tests/setup.ts'],

    // Worker 設定 - E2E 測試資源消耗較大
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: true,

    // 覆蓋率設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage/e2e',
      include: [
        'src/core/**',
        'src/infrastructure/parser/**',
        'src/infrastructure/formatters/**',
        'src/infrastructure/storage/**',
        'src/plugins/typescript/**',
        'src/plugins/javascript/**'
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
        '**/*.md',
        '**/*.sh',
        '**/*.yaml',
        '**/*.resolved',
        // 真實 filesystem（E2E 使用 MemFileSystem，不走真實 fs）
        'src/infrastructure/storage/file-system.ts',
        'src/infrastructure/storage/file-system.interface.ts',
        // 抽象基礎類別（無法透過 E2E 直接覆蓋）
        'src/infrastructure/parser/base.ts',
        'src/infrastructure/parser/analysis-types.ts',
        // 磁碟快取序列化（E2E 測試環境強制 noCache，不執行磁碟 IO；有 unit test 覆蓋）
        'src/core/foundations/indexing/index-cache-serializer.ts',
        // TypeScript Language Service（需要真實 TS 程式碼分析，E2E 測試場景有限）
        'src/plugins/typescript/language-service.ts',
        // 文字匹配降級 fallback（只在 AST 解析失敗時觸發；E2E 使用有效 TS fixture，永遠走 AST 路徑）
        'src/core/foundations/symbol-finder/text-matcher.ts',
        // Dead code：從未被任何 CLI 路徑呼叫，無法透過 E2E 覆蓋
        'src/core/rename/scope-analyzer.ts',
        'src/infrastructure/formatters/strategies/analyze-formatter.ts'
      ],
      thresholds: {
        lines: 59,
        functions: 62,
        branches: 48,
        statements: 59
      }
    },
  },
}));
