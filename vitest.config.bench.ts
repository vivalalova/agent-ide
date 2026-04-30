import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Benchmark 配置
 * 使用 Vitest bench 模式測量效能敏感操作
 */
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@plugins': resolve(__dirname, 'src/plugins'),
      '@interfaces': resolve(__dirname, 'src/interfaces'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@shared/types': resolve(__dirname, 'src/shared/types/index'),
      '@shared/errors': resolve(__dirname, 'src/shared/errors/index'),
      '@shared/utils': resolve(__dirname, 'src/shared/utils/index'),
    },
  },
  test: {
    benchmark: {
      include: ['tests/bench/**/*.bench.ts'],
    },
    pool: 'forks',
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
