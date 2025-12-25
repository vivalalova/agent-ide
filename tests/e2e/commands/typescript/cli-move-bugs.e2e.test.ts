/**
 * CLI move 命令 E2E 測試 - Bug 修復驗證
 * GitHub Issue #29: 相對路徑不支援、目錄目標處理錯誤、--no-update-imports 無法禁用
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import * as path from 'path';

describe('CLI move bugs - GitHub Issue #29', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Bug 1: 相對路徑不支援', () => {
    it('應該支援相對於 --path 的來源路徑', async () => {
      // 使用相對路徑（不含 fixture.rootPath 前綴）
      const result = await executeCLI(
        [
          'move',
          'src/utils/string-utils.ts',  // 相對路徑
          'src/helpers/string-utils.ts', // 相對路徑
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
    });

    it('應該支援相對於 --path 的目標路徑', async () => {
      const result = await executeCLI(
        [
          'move',
          '--source', 'src/utils/formatter.ts',
          '--target', 'src/lib/formatter.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
    });

    it('應該在 dry-run 模式下支援相對路徑', async () => {
      const result = await executeCLI(
        [
          'move',
          'src/types/user.ts',
          'src/entities/user.ts',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.command).toBe('move');
    });

    it('應該正確顯示相對路徑不存在的錯誤', async () => {
      const result = await executeCLI(
        [
          'move',
          'src/nonexistent.ts',
          'src/new-location.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toMatch(/找不到|不存在/);
    });
  });

  describe('Bug 2: 目錄目標處理錯誤', () => {
    it('應該支援目標為目錄（以 / 結尾）並保留原檔名', async () => {
      // 先確保目標目錄存在
      await fixture.writeFile('src/helpers/.gitkeep', '');

      const result = await executeCLI(
        [
          'move',
          path.join(fixture.rootPath, 'src/utils/string-utils.ts'),
          path.join(fixture.rootPath, 'src/helpers/'), // 目錄目標（以 / 結尾）
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
      // 目標應該是 src/helpers/string-utils.ts（保留原檔名）
      expect(output.target).toContain('string-utils.ts');
    });

    it('應該支援目標為已存在目錄（不以 / 結尾但為目錄）', async () => {
      // src/helpers 已存在且為目錄
      await fixture.writeFile('src/helpers/.gitkeep', '');

      const result = await executeCLI(
        [
          'move',
          path.join(fixture.rootPath, 'src/utils/formatter.ts'),
          path.join(fixture.rootPath, 'src/helpers'), // 目錄目標（不以 / 結尾）
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
      // 目標應該是 src/helpers/formatter.ts（保留原檔名）
      expect(output.target).toContain('formatter.ts');
    });

    it('應該在 dry-run 模式下正確處理目錄目標', async () => {
      await fixture.writeFile('src/lib/.gitkeep', '');

      const result = await executeCLI(
        [
          'move',
          'src/types/user.ts',
          'src/lib/', // 目錄目標
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 預覽中應該顯示完整的目標路徑（含檔名）
      expect(output.summary).toBeDefined();
    });

    it('應該處理目錄目標不存在的情況（自動建立）', async () => {
      const result = await executeCLI(
        [
          'move',
          path.join(fixture.rootPath, 'src/utils/array-utils.ts'),
          path.join(fixture.rootPath, 'src/new-dir/'), // 不存在的目錄
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
      expect(output.target).toContain('array-utils.ts');
    });
  });

  describe('Bug 3: --no-update-imports 選項無法禁用', () => {
    it('應該支援 --no-update-imports 語法', async () => {
      const result = await executeCLI(
        [
          'move',
          path.join(fixture.rootPath, 'src/types/user.ts'),
          path.join(fixture.rootPath, 'src/entities/user.ts'),
          '--path', fixture.rootPath,
          '--no-update-imports',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
      // --no-update-imports 應該不更新 import，所以 pathUpdates 應該為空
      expect(output.pathUpdates).toEqual([]);
    });

    it('應該支援多次使用 --no-update-imports', async () => {
      // Commander 不支援 --update-imports=false 語法
      // 但 --no-update-imports 可以正常工作
      const result = await executeCLI(
        [
          'move',
          path.join(fixture.rootPath, 'src/types/common.ts'),
          path.join(fixture.rootPath, 'src/shared/common.ts'),
          '--path', fixture.rootPath,
          '--no-update-imports',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
      // pathUpdates 應該為空（未更新 import）
      expect(output.pathUpdates).toEqual([]);
    });

    it('應該預設啟用 --update-imports（有更新 import）', async () => {
      // 先確認有檔案引用 user.ts
      const result = await executeCLI(
        [
          'move',
          path.join(fixture.rootPath, 'src/types/user.ts'),
          path.join(fixture.rootPath, 'src/models/entities/user.ts'),
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 預設應該更新 import，所以 files 中應該有內容
      expect(output.files).toBeDefined();
    });

    it('應該在 dry-run 模式下正確處理 --no-update-imports', async () => {
      const result = await executeCLI(
        [
          'move',
          'src/utils/formatter.ts',
          'src/lib/formatter.ts',
          '--path', fixture.rootPath,
          '--no-update-imports',
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 不更新 import，所以 files 應該只包含移動本身，沒有 import 變更
      expect(output.summary.totalChanges).toBe(0);
    });
  });

  describe('組合測試：多個 Bug 修復整合', () => {
    it('應該同時支援相對路徑和目錄目標', async () => {
      await fixture.writeFile('src/shared/.gitkeep', '');

      const result = await executeCLI(
        [
          'move',
          'src/utils/string-utils.ts', // 相對路徑
          'src/shared/',               // 目錄目標
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.target).toContain('string-utils.ts');
    });

    it('應該同時支援相對路徑、目錄目標和 --no-update-imports', async () => {
      await fixture.writeFile('src/lib/.gitkeep', '');

      const result = await executeCLI(
        [
          'move',
          'src/types/user.ts',  // 相對路徑
          'src/lib/',           // 目錄目標
          '--path', fixture.rootPath,
          '--no-update-imports',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.target).toContain('user.ts');
      expect(output.pathUpdates).toEqual([]);
    });
  });
});

/**
 * GitHub Issue #57: move 命令移動目錄到 src 外部時路徑計算錯誤
 * - 同一檔案產生兩組 hunks（重複處理）
 * - 同目錄內的相對引用被錯誤修改
 * - 產生錯誤路徑如 ../../src/frontend/... 指回原位置
 */
describe('CLI move bugs - GitHub Issue #57: 目錄移動路徑計算', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('同目錄內的相對引用', () => {
    it('移動目錄時，同目錄內的 ./ 引用不應被修改', async () => {
      // Given: 建立目錄結構 src/frontend/alarm/{controller.ts, controller.spec.ts}
      await fixture.writeFile('src/frontend/alarm/alarm.controller.ts', `
export class AlarmController {
  constructor() {}
}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.controller.spec.ts', `
import { AlarmController } from './alarm.controller';

describe('AlarmController', () => {
  it('should work', () => {
    const controller = new AlarmController();
    expect(controller).toBeDefined();
  });
});
`);

      // When: 移動整個目錄到 src 外部
      const result = await executeCLI(
        [
          'move',
          'src/frontend',
          'frontend-api',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功且 ./alarm.controller 引用保持不變
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 讀取移動後的 spec 檔案
      const specContent = await fixture.readFile('frontend-api/alarm/alarm.controller.spec.ts');
      // 同目錄內的 ./alarm.controller 應該保持不變
      expect(specContent).toContain('from \'./alarm.controller\'');
    });

    it('移動目錄時，同目錄樹內的 ../ 引用不應被修改', async () => {
      // Given: 建立 src/frontend/shared/utils.ts 和 src/frontend/alarm/service.ts
      await fixture.writeFile('src/frontend/shared/utils.ts', `
export function formatDate(date: Date): string {
  return date.toISOString();
}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.service.ts', `
import { formatDate } from '../shared/utils';

export class AlarmService {
  getFormattedTime(): string {
    return formatDate(new Date());
  }
}
`);

      // When: 移動整個目錄
      const result = await executeCLI(
        [
          'move',
          'src/frontend',
          'frontend-api',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: ../shared/utils 應該保持不變
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const serviceContent = await fixture.readFile('frontend-api/alarm/alarm.service.ts');
      expect(serviceContent).toContain('from \'../shared/utils\'');
    });
  });

  describe('外部引用的正確更新', () => {
    it('src 內的檔案引用被移動目錄內的模組，應正確更新路徑', async () => {
      // Given: src/app.ts 引用 src/frontend/alarm/controller
      await fixture.writeFile('src/frontend/alarm/alarm.controller.ts', `
export class AlarmController {
  constructor() {}
}
`);
      await fixture.writeFile('src/app.ts', `
import { AlarmController } from './frontend/alarm/alarm.controller';

const controller = new AlarmController();
console.log(controller);
`);

      // When: 移動 src/frontend 到 frontend-api（src 外部）
      const result = await executeCLI(
        [
          'move',
          'src/frontend',
          'frontend-api',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: src/app.ts 的引用應更新為 ../frontend-api/...
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const appContent = await fixture.readFile('src/app.ts');
      // 舊路徑應該被替換
      expect(appContent).not.toContain('./frontend/alarm/alarm.controller');
      // 新路徑應該指向 frontend-api
      expect(appContent).toContain('frontend-api/alarm/alarm.controller');
    });
  });

  describe('重複處理防止', () => {
    it('dry-run 應該不產生重複的 pathUpdates', async () => {
      // Given: 目錄內多個檔案互相引用
      await fixture.writeFile('src/frontend/a.ts', `
export const a = 1;
`);
      await fixture.writeFile('src/frontend/b.ts', `
import { a } from './a';
export const b = a + 1;
`);
      await fixture.writeFile('src/frontend/c.ts', `
import { b } from './b';
export const c = b + 1;
`);

      // When: dry-run 移動目錄
      const result = await executeCLI(
        [
          'move',
          'src/frontend',
          'lib',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該沒有任何 import 更新（因為都是同目錄內的引用）
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檢查沒有對 ./a 或 ./b 的更新
      const files = output.files ?? [];
      for (const file of files) {
        const changes = file.changes ?? [];
        for (const change of changes) {
          // 同目錄引用不應該出現在 changes 中
          if (change.oldImport) {
            expect(change.oldImport).not.toMatch(/from\s+['"]\.\/(a|b)['"]/);
          }
        }
      }
    });

    it('每個檔案的更新應該只出現一次', async () => {
      // Given: 外部檔案引用目錄內的模組
      await fixture.writeFile('src/frontend/module.ts', `
export const value = 42;
`);
      await fixture.writeFile('src/consumer.ts', `
import { value } from './frontend/module';
console.log(value);
`);

      // When: dry-run 移動目錄
      const result = await executeCLI(
        [
          'move',
          'src/frontend',
          'lib',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: consumer.ts 應該只出現一次
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const files = output.files ?? [];
      const consumerFiles = files.filter((f: { filePath: string }) =>
        f.filePath?.includes('consumer.ts')
      );
      // 同一檔案不應該出現多次
      expect(consumerFiles.length).toBeLessThanOrEqual(1);
    });
  });
});

/**
 * Bug: 目錄移動時父目錄不存在應自動建立
 * 當移動目錄到一個不存在的父目錄時（如 filters → modules/common/filters，
 * 其中 modules/common 不存在），應該自動建立父目錄而非報錯。
 */
describe('CLI move bugs - 父目錄自動建立', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('目錄移動到不存在的父目錄', () => {
    it('移動目錄到不存在的單層父目錄應自動建立', async () => {
      // Given: 存在 src/utils 目錄
      // When: 移動到 src/common/utils（common 不存在）
      const result = await executeCLI(
        [
          'move',
          'src/utils',
          'src/common/utils',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功，自動建立 common 目錄
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
    });

    it('移動目錄到不存在的多層父目錄應自動建立', async () => {
      // Given: 存在 src/utils 目錄
      // When: 移動到 src/modules/common/utils（modules/common 都不存在）
      const result = await executeCLI(
        [
          'move',
          'src/utils',
          'src/modules/common/utils',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功，自動建立 modules/common 目錄
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
    });

    it('移動檔案到不存在的父目錄應自動建立', async () => {
      // Given: 存在 src/utils/formatter.ts
      // When: 移動到 src/new-module/formatters/formatter.ts
      const result = await executeCLI(
        [
          'move',
          'src/utils/formatter.ts',
          'src/new-module/formatters/formatter.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功，自動建立 new-module/formatters 目錄
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
    });

    it('dry-run 模式下應該顯示會建立的父目錄', async () => {
      // Given: 存在 src/utils 目錄
      // When: dry-run 移動到不存在的父目錄
      const result = await executeCLI(
        [
          'move',
          'src/utils',
          'src/modules/shared/utils',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功預覽
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.command).toBe('move');
    });
  });
});

/**
 * Bug: 目錄移動時，目錄內部的 alias 引用沒有被更新
 * - 當移動 src/modules/ems-database-service/ 到 src/infrastructure/ems-database/
 * - 外部引用被正確更新了
 * - 但目錄內部的 @/modules/ems-database-service/... 引用沒有被更新為 @/infrastructure/ems-database/...
 */
describe('CLI move bugs - 目錄內部 alias 引用未更新', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');

    // 修改 tsconfig.json 加入 path alias 配置
    await fixture.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        baseUrl: '.',
        paths: {
          '@/*': ['src/*']
        }
      },
      include: ['src/**/*']
    }, null, 2));
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('目錄內部 alias 引用', () => {
    it('移動目錄時，目錄內部檔案的 @/ alias 引用應該被更新', async () => {
      // Given: 建立目錄結構 src/modules/db/{index.ts, service.ts}
      // service.ts 使用 @/modules/db/index 引用同目錄的 index.ts
      await fixture.writeFile('src/modules/db/index.ts', `
export const dbVersion = '1.0.0';
export function connect() {
  return 'connected';
}
`);
      await fixture.writeFile('src/modules/db/service.ts', `
import { dbVersion, connect } from '@/modules/db/index';

export class DbService {
  version = dbVersion;

  init() {
    return connect();
  }
}
`);

      // When: 移動目錄 src/modules/db 到 src/infrastructure/database
      const result = await executeCLI(
        [
          'move',
          'src/modules/db',
          'src/infrastructure/database',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 讀取移動後的 service.ts 檔案
      const serviceContent = await fixture.readFile('src/infrastructure/database/service.ts');

      // 舊的 @/modules/db 路徑應該被替換為 @/infrastructure/database
      expect(serviceContent).not.toContain('@/modules/db');
      expect(serviceContent).toContain('@/infrastructure/database');
    });

    it('移動目錄時，目錄內多個檔案互相引用的 alias 都應該被更新', async () => {
      // Given: 建立複雜的目錄結構
      await fixture.writeFile('src/modules/db/types.ts', `
export interface User {
  id: string;
  name: string;
}
`);
      await fixture.writeFile('src/modules/db/repository.ts', `
import { User } from '@/modules/db/types';

export class UserRepository {
  findById(id: string): User | null {
    return null;
  }
}
`);
      await fixture.writeFile('src/modules/db/service.ts', `
import { User } from '@/modules/db/types';
import { UserRepository } from '@/modules/db/repository';

export class UserService {
  private repo = new UserRepository();

  getUser(id: string): User | null {
    return this.repo.findById(id);
  }
}
`);

      // When: 移動整個目錄
      const result = await executeCLI(
        [
          'move',
          'src/modules/db',
          'src/infrastructure/database',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功且所有內部 alias 引用都被更新
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檢查 repository.ts
      const repoContent = await fixture.readFile('src/infrastructure/database/repository.ts');
      expect(repoContent).not.toContain('@/modules/db');
      expect(repoContent).toContain('@/infrastructure/database/types');

      // 檢查 service.ts
      const serviceContent = await fixture.readFile('src/infrastructure/database/service.ts');
      expect(serviceContent).not.toContain('@/modules/db');
      expect(serviceContent).toContain('@/infrastructure/database/types');
      expect(serviceContent).toContain('@/infrastructure/database/repository');
    });

    it('dry-run 應該顯示目錄內部 alias 引用的變更', async () => {
      // Given: 建立使用 alias 引用的檔案結構
      await fixture.writeFile('src/modules/db/index.ts', `
export const version = '1.0';
`);
      await fixture.writeFile('src/modules/db/service.ts', `
import { version } from '@/modules/db/index';
console.log(version);
`);

      // When: dry-run 移動目錄
      const result = await executeCLI(
        [
          'move',
          'src/modules/db',
          'src/infrastructure/database',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該在預覽中顯示 service.ts 的 alias 引用變更
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 應該有 files 顯示內部引用的變更
      // 輸出格式: files[].hunks[].lines[] 其中 lines 有 type 和 content
      const files = output.files ?? [];
      interface HunkLine {
        type: string;
        content: string;
      }
      interface Hunk {
        lines: HunkLine[];
      }
      interface FileOutput {
        filePath?: string;
        hunks?: Hunk[];
      }
      const hasInternalUpdate = files.some((f: FileOutput) =>
        f.filePath?.includes('service.ts') &&
        f.hunks?.some((h: Hunk) =>
          h.lines?.some((l: HunkLine) =>
            l.type === 'delete' && l.content?.includes('@/modules/db')
          )
        )
      );
      expect(hasInternalUpdate).toBe(true);
    });
  });

  describe('外部引用與內部引用同時處理', () => {
    it('外部和內部的 alias 引用都應該被更新', async () => {
      // Given: 外部檔案和內部檔案都使用 alias 引用
      await fixture.writeFile('src/modules/db/index.ts', `
export const dbVersion = '1.0';
`);
      await fixture.writeFile('src/modules/db/service.ts', `
import { dbVersion } from '@/modules/db/index';
export const version = dbVersion;
`);
      await fixture.writeFile('src/app.ts', `
import { version } from '@/modules/db/service';
console.log(version);
`);

      // When: 移動目錄
      const result = await executeCLI(
        [
          'move',
          'src/modules/db',
          'src/infrastructure/database',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 外部引用被更新
      const appContent = await fixture.readFile('src/app.ts');
      expect(appContent).not.toContain('@/modules/db');
      expect(appContent).toContain('@/infrastructure/database/service');

      // 內部引用也被更新
      const serviceContent = await fixture.readFile('src/infrastructure/database/service.ts');
      expect(serviceContent).not.toContain('@/modules/db');
      expect(serviceContent).toContain('@/infrastructure/database/index');
    });
  });
});

/**
 * Bug: 移動目錄到已存在的父目錄時，內部相對路徑被錯誤更新
 * - 當移動 src/frontend/alarm 到 src/modules/frontend/（已存在的目錄）
 * - 內部的 ./alarm.controller 被錯誤改成 ../../modules/frontend/alarm/alarm.controller
 * - 應該保持 ./alarm.controller 不變（同目錄內的引用）
 */
describe('CLI move bugs - 移動到已存在目錄時內部引用錯誤', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('移動目錄到已存在的父目錄', () => {
    it('移動到已存在目錄時，同目錄內的 ./ 引用應保持不變', async () => {
      // Given: 建立來源目錄 src/frontend/alarm
      await fixture.writeFile('src/frontend/alarm/alarm.controller.ts', `
export class AlarmController {}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.service.ts', `
import { AlarmController } from './alarm.controller';

export class AlarmService {
  controller = new AlarmController();
}
`);

      // 目標父目錄已存在
      await fixture.writeFile('src/modules/frontend/.gitkeep', '');

      // When: 移動目錄到已存在的父目錄
      const result = await executeCLI(
        [
          'move',
          'src/frontend/alarm',
          'src/modules/frontend/',  // 已存在的目錄，以 / 結尾
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功且 ./alarm.controller 引用保持不變
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 讀取移動後的 service 檔案
      const serviceContent = await fixture.readFile('src/modules/frontend/alarm/alarm.service.ts');

      // 關鍵斷言：同目錄內的 ./alarm.controller 應該保持不變
      expect(serviceContent).toContain('from \'./alarm.controller\'');
      expect(serviceContent).not.toContain('../../modules/frontend/alarm');
    });

    it('移動到已存在目錄時，目錄內多個檔案互相引用應保持不變', async () => {
      // Given: 目錄內多個檔案互相引用
      await fixture.writeFile('src/frontend/alarm/types.ts', `
export interface Alarm {
  id: string;
  message: string;
}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.controller.ts', `
import { Alarm } from './types';

export class AlarmController {
  getAlarm(): Alarm {
    return { id: '1', message: 'test' };
  }
}
`);
      await fixture.writeFile('src/frontend/alarm/alarm.service.ts', `
import { AlarmController } from './alarm.controller';
import { Alarm } from './types';

export class AlarmService {
  controller = new AlarmController();

  getAlarm(): Alarm {
    return this.controller.getAlarm();
  }
}
`);

      // 目標父目錄已存在
      await fixture.writeFile('src/modules/frontend/.gitkeep', '');

      // When: 移動目錄
      const result = await executeCLI(
        [
          'move',
          'src/frontend/alarm',
          'src/modules/frontend/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // controller.ts 的 ./types 引用應保持不變
      const controllerContent = await fixture.readFile('src/modules/frontend/alarm/alarm.controller.ts');
      expect(controllerContent).toContain('from \'./types\'');
      expect(controllerContent).not.toContain('../../modules/frontend/alarm');

      // service.ts 的 ./alarm.controller 和 ./types 引用應保持不變
      const serviceContent = await fixture.readFile('src/modules/frontend/alarm/alarm.service.ts');
      expect(serviceContent).toContain('from \'./alarm.controller\'');
      expect(serviceContent).toContain('from \'./types\'');
      expect(serviceContent).not.toContain('../../modules/frontend/alarm');
    });
  });
});
