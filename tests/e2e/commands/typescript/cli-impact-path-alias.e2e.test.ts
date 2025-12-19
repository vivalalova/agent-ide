/**
 * CLI impact 命令 E2E 測試 - TypeScript 路徑別名支援
 * 測試 tsconfig.json paths 設定的解析和依賴追蹤
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI impact - TypeScript 路徑別名支援', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('@/* 路徑別名', () => {
    it('應該識別使用 @/* 路徑別名導入的依賴者', async () => {
      // 建立 tsconfig.json 設定 @/* 別名
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2020',
              module: 'ESNext',
              moduleResolution: 'node',
              baseUrl: '.',
              paths: {
                '@/*': ['./src/*'],
              },
            },
            include: ['src/**/*'],
          },
          null,
          2
        )
      );

      // 建立被依賴的模組
      await fixture.writeFile(
        'src/utils/index.ts',
        'export const helper = (x: number) => x * 2;\nexport const format = (s: string) => s.trim();'
      );

      // 建立使用相對路徑導入的檔案
      await fixture.writeFile(
        'src/services/relative-user.ts',
        'import { helper } from "../utils/index.js";\nexport const useHelper = helper(10);'
      );

      // 建立使用 @/* 路徑別名導入的檔案
      await fixture.writeFile(
        'src/services/alias-user-1.ts',
        'import { helper } from "@/utils";\nexport const result1 = helper(5);'
      );

      await fixture.writeFile(
        'src/services/alias-user-2.ts',
        'import { format } from "@/utils";\nexport const result2 = format("  test  ");'
      );

      await fixture.writeFile(
        'src/controllers/alias-user-3.ts',
        'import { helper, format } from "@/utils";\nexport const result3 = format(String(helper(3)));'
      );

      // 執行 impact 分析
      const result = await executeCLI(
        ['impact', '--file', 'src/utils/index.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證依賴者數量：應該找到所有使用者（包含相對路徑和路徑別名）
      const dependents = output.impact.dependents as string[];

      // 至少應該找到 4 個依賴者
      expect(dependents.length).toBeGreaterThanOrEqual(4);

      // 驗證相對路徑導入的檔案被找到
      const hasRelativeUser = dependents.some((d) => d.includes('relative-user'));
      expect(hasRelativeUser).toBe(true);

      // 驗證路徑別名導入的檔案被找到
      const hasAliasUser1 = dependents.some((d) => d.includes('alias-user-1'));
      const hasAliasUser2 = dependents.some((d) => d.includes('alias-user-2'));
      const hasAliasUser3 = dependents.some((d) => d.includes('alias-user-3'));

      expect(hasAliasUser1).toBe(true);
      expect(hasAliasUser2).toBe(true);
      expect(hasAliasUser3).toBe(true);
    });

    it('應該正確處理 @/deep/path 深層路徑別名', async () => {
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              paths: {
                '@/*': ['./src/*'],
              },
            },
          },
          null,
          2
        )
      );

      // 深層模組
      await fixture.writeFile('src/core/helpers/math.ts', 'export const add = (a: number, b: number) => a + b;');

      // 使用深層路徑別名
      await fixture.writeFile('src/app.ts', 'import { add } from "@/core/helpers/math";\nexport const sum = add(1, 2);');

      const result = await executeCLI(
        ['impact', '--file', 'src/core/helpers/math.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const dependents = output.impact.dependents as string[];
      const hasApp = dependents.some((d) => d.includes('app.ts'));
      expect(hasApp).toBe(true);
    });
  });

  describe('多個路徑別名', () => {
    it('應該支援多個路徑別名設定', async () => {
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              paths: {
                '@/*': ['./src/*'],
                '@utils/*': ['./src/utils/*'],
                '@models/*': ['./src/models/*'],
              },
            },
          },
          null,
          2
        )
      );

      // 建立模組
      await fixture.writeFile('src/utils/string.ts', 'export const trim = (s: string) => s.trim();');
      await fixture.writeFile('src/models/user.ts', 'export interface User { id: string; name: string; }');

      // 使用不同路徑別名
      await fixture.writeFile('src/services/user-service.ts', 'import { trim } from "@utils/string";\nexport const clean = trim;');

      await fixture.writeFile(
        'src/controllers/user-controller.ts',
        'import type { User } from "@models/user";\nexport const getUser = (): User => ({ id: "1", name: "test" });'
      );

      // 測試 @utils/* 別名
      const result1 = await executeCLI(
        ['impact', '--file', 'src/utils/string.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result1.exitCode).toBe(0);
      const output1 = JSON.parse(result1.stdout);
      const dependents1 = output1.impact.dependents as string[];
      expect(dependents1.some((d) => d.includes('user-service'))).toBe(true);

      // 測試 @models/* 別名
      const result2 = await executeCLI(
        ['impact', '--file', 'src/models/user.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result2.exitCode).toBe(0);
      const output2 = JSON.parse(result2.stdout);
      const dependents2 = output2.impact.dependents as string[];
      expect(dependents2.some((d) => d.includes('user-controller'))).toBe(true);
    });
  });

  describe('baseUrl 設定', () => {
    it('應該正確處理非根目錄的 baseUrl', async () => {
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              baseUrl: './src',
              paths: {
                '@/*': ['./*'],
              },
            },
          },
          null,
          2
        )
      );

      await fixture.writeFile('src/lib/logger.ts', 'export const log = (msg: string) => console.log(msg);');

      await fixture.writeFile('src/app/main.ts', 'import { log } from "@/lib/logger";\nlog("hello");');

      const result = await executeCLI(
        ['impact', '--file', 'src/lib/logger.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];
      expect(dependents.some((d) => d.includes('main.ts'))).toBe(true);
    });
  });

  describe('混合導入模式', () => {
    it('應該同時識別相對路徑和路徑別名導入', async () => {
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              paths: {
                '@/*': ['./src/*'],
              },
            },
          },
          null,
          2
        )
      );

      // 共用模組
      await fixture.writeFile('src/shared/config.ts', 'export const API_URL = "https://api.example.com";');

      // 相對路徑導入
      await fixture.writeFile('src/services/api.ts', 'import { API_URL } from "../shared/config.js";\nexport const url = API_URL;');

      // 路徑別名導入
      await fixture.writeFile('src/controllers/main.ts', 'import { API_URL } from "@/shared/config";\nexport const endpoint = API_URL;');

      const result = await executeCLI(
        ['impact', '--file', 'src/shared/config.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      const dependents = output.impact.dependents as string[];

      // 應該找到兩種導入方式
      expect(dependents.some((d) => d.includes('api.ts'))).toBe(true);
      expect(dependents.some((d) => d.includes('main.ts'))).toBe(true);
      expect(dependents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('邊界條件', () => {
    it('應該處理沒有 paths 設定的 tsconfig.json', async () => {
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2020',
            },
          },
          null,
          2
        )
      );

      await fixture.writeFile('src/lib.ts', 'export const x = 1;');
      await fixture.writeFile('src/app.ts', 'import { x } from "./lib.js";\nexport const y = x;');

      const result = await executeCLI(
        ['impact', '--file', 'src/lib.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理不存在的 tsconfig.json', async () => {
      // 不寫入 tsconfig.json，使用 fixture 預設的
      await fixture.writeFile('test-lib.ts', 'export const x = 1;');
      await fixture.writeFile('test-app.ts', 'import { x } from "./test-lib.js";\nexport const y = x;');

      const result = await executeCLI(
        ['impact', '--file', 'test-lib.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理空的 paths 物件', async () => {
      await fixture.writeFile(
        'tsconfig.json',
        JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              paths: {},
            },
          },
          null,
          2
        )
      );

      await fixture.writeFile('src/lib.ts', 'export const x = 1;');
      await fixture.writeFile('src/app.ts', 'import { x } from "./lib.js";\nexport const y = x;');

      const result = await executeCLI(
        ['impact', '--file', 'src/lib.ts', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
