/**
 * CLI move 命令 E2E 測試 - Issue #58
 * GitHub Issue #58: move command generates incorrect import paths pointing back to source location
 *
 * 問題：當移動檔案時，被移動檔案內的相對 import 被錯誤地更新為指向原始位置
 * 修復：檢查目標目錄是否有同名檔案，如果有則保持相對路徑不變
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - GitHub Issue #58: 被移動檔案內部 import 路徑計算', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('單一檔案移動：被移動檔案內部的相對 import 更新', () => {
    it('移動檔案到不同目錄時，應正確計算內部 import 的新相對路徑', async () => {
      // Given: 建立場景
      // src/modules/feature/module.ts imports ./service.ts and ../shared/utils.ts
      await fixture.writeFile('src/modules/feature/service.ts', `
export class FeatureService {
  doSomething() {
    return 'done';
  }
}
`);
      await fixture.writeFile('src/modules/shared/utils.ts', `
export function formatData(data: unknown): string {
  return JSON.stringify(data);
}
`);
      await fixture.writeFile('src/modules/feature/module.ts', `
import { FeatureService } from './service';
import { formatData } from '../shared/utils';

export class FeatureModule {
  private service = new FeatureService();

  process() {
    return formatData(this.service.doSomething());
  }
}
`);

      // When: 移動單一檔案到新位置
      const result = await executeCLI(
        [
          'move',
          'src/modules/feature/module.ts',
          'src/api/feature/module.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證移動後的檔案內容
      const movedContent = await fixture.readFile('src/api/feature/module.ts');

      // 關鍵檢查：內部 import 應該正確更新
      // ./service 應該更新為指向原始位置 ../../modules/feature/service
      expect(movedContent).toContain('from \'../../modules/feature/service\'');
      // ../shared/utils 應該更新為 ../../modules/shared/utils
      expect(movedContent).toContain('from \'../../modules/shared/utils\'');
    });

    it('移動檔案到更深層目錄時，應正確計算多層相對路徑', async () => {
      // Given: 建立場景
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'help'; }
`);
      await fixture.writeFile('src/app.ts', `
import { helper } from './utils/helper';
export const result = helper();
`);

      // When: 移動到更深層
      const result = await executeCLI(
        [
          'move',
          'src/app.ts',
          'src/features/user/profile/app.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const movedContent = await fixture.readFile('src/features/user/profile/app.ts');
      // ./utils/helper 從 src/ 到 src/features/user/profile/
      // 需要 ../../../utils/helper
      expect(movedContent).toContain('from \'../../../utils/helper\'');
    });

    it('移動檔案到更淺層目錄時，應正確計算相對路徑', async () => {
      // Given
      await fixture.writeFile('src/shared/constants.ts', `
export const API_URL = 'https://api.example.com';
`);
      await fixture.writeFile('src/features/user/api/client.ts', `
import { API_URL } from '../../../shared/constants';
export const client = { url: API_URL };
`);

      // When: 移動到更淺層
      const result = await executeCLI(
        [
          'move',
          'src/features/user/api/client.ts',
          'src/api/client.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const movedContent = await fixture.readFile('src/api/client.ts');
      // ../../../shared/constants 從 src/features/user/api/ 到 src/api/
      // 需要 ../shared/constants
      expect(movedContent).toContain('from \'../shared/constants\'');
    });
  });

  describe('Issue #58 核心修復：目標目錄有同名檔案時保持相對路徑', () => {
    it('目標目錄有同名但無關的檔案、原檔仍在原位時，應改寫指向原位置', async () => {
      // Given: 原目錄的 controller.ts 沒有被移動（仍在原位），
      // 目標目錄碰巧有一個同名但不相干的 controller.ts。
      // 若保留 ./controller，import 會靜默綁到 NewController（沒有 OldController 匯出），
      // 移出的檔案直接編譯不過——同名存在 ≠ 同一個檔。
      await fixture.writeFile('src/old/controller.ts', `
export class OldController {}
`);
      await fixture.writeFile('src/old/module.ts', `
import { OldController } from './controller';
export class OldModule {
  ctrl = new OldController();
}
`);
      // 目標目錄有同名但無關的 controller.ts
      await fixture.writeFile('src/new/controller.ts', `
export class NewController {}
`);

      // When: 移動 module.ts 到目標目錄（目標已有 controller.ts）
      const result = await executeCLI(
        [
          'move',
          'src/old/module.ts',
          'src/new/module.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 原檔仍在原位 → 必須改寫指回原位置，不因目標目錄碰巧同名而保留
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const movedContent = await fixture.readFile('src/new/module.ts');
      expect(movedContent).toContain('from \'../old/controller\'');
      expect(movedContent).not.toContain('from \'./controller\'');
    });

    it('目標目錄沒有同名檔案時，應更新為指向原位置', async () => {
      // Given: 只有源目錄有 controller.ts
      await fixture.writeFile('src/old/controller.ts', `
export class OldController {}
`);
      await fixture.writeFile('src/old/module.ts', `
import { OldController } from './controller';
export class OldModule {
  ctrl = new OldController();
}
`);
      // 目標目錄沒有 controller.ts

      // When: 移動 module.ts 到目標目錄
      const result = await executeCLI(
        [
          'move',
          'src/old/module.ts',
          'src/new/module.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該更新路徑指向原位置
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const movedContent = await fixture.readFile('src/new/module.ts');
      // ./controller 應該變成 ../old/controller
      expect(movedContent).toContain('from \'../old/controller\'');
    });

    it('dry-run 時應正確顯示是否需要更新 import', async () => {
      // Given
      await fixture.writeFile('src/lib/logger.ts', `
export function log(msg: string) { console.log(msg); }
`);
      await fixture.writeFile('src/services/user-service.ts', `
import { log } from '../lib/logger';
export class UserService {
  save() { log('saving'); }
}
`);

      // When: dry-run
      const result = await executeCLI(
        [
          'move',
          'src/services/user-service.ts',
          'src/domain/users/user-service.ts',
          '--path', fixture.rootPath,
          '--dry-run',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檢查有 import 變更
      const files = output.files ?? [];
      expect(files.length).toBeGreaterThan(0);

      // 找到包含 import 變更的檔案
      const fileWithChange = files.find(
        (f: { filePath: string }) => f.filePath?.includes('user-service.ts')
      );
      expect(fileWithChange).toBeDefined();
      expect(fileWithChange.hunks).toBeDefined();
      expect(fileWithChange.hunks.length).toBeGreaterThan(0);

      // 驗證 hunk 內容包含正確的路徑變更
      const hunk = fileWithChange.hunks[0];
      const deleteLines = hunk.lines.filter((l: { type: string }) => l.type === 'delete');
      const addLines = hunk.lines.filter((l: { type: string }) => l.type === 'add');

      expect(deleteLines.some((l: { content: string }) => l.content.includes('../lib/logger'))).toBe(true);
      expect(addLines.some((l: { content: string }) => l.content.includes('../../lib/logger'))).toBe(true);
    });
  });

  describe('Issue #58 重現場景', () => {
    it('移動 module.ts 時，controller 沒有被移動，import 應更新為指向原位置', async () => {
      // Given: 模擬 Issue #58 的場景
      await fixture.writeFile('src/modules/frontend/site-capacity/site-capacity.controller.ts', `
export class SiteCapacityController {
  getCapacity() { return 100; }
}
`);
      await fixture.writeFile('src/modules/frontend/site-capacity/site-capacity.module.ts', `
import { SiteCapacityController } from './site-capacity.controller';

export class SiteCapacityModule {
  controller = new SiteCapacityController();
}
`);

      // When: 移動單一檔案（controller 沒有移動，目標目錄也沒有 controller）
      const result = await executeCLI(
        [
          'move',
          'src/modules/frontend/site-capacity/site-capacity.module.ts',
          'frontend-api/site-capacity/site-capacity.module.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證移動後的檔案內容
      const movedContent = await fixture.readFile('frontend-api/site-capacity/site-capacity.module.ts');

      // 關鍵：controller 還在原位置，且目標目錄沒有 controller
      // 所以 import 路徑應該更新為指向原位置
      expect(movedContent).not.toContain('from \'./site-capacity.controller\'');
      expect(movedContent).toContain('site-capacity.controller');
    });

    it('增量移動：先移動 controller，再移動 module，import 應保持不變', async () => {
      // Given: 模擬增量移動場景——第一步（移動 controller）已完成，
      // 所以 controller 只存在於目標目錄、原位置已沒有它
      await fixture.writeFile('src/old/module.ts', `
import { Controller } from './controller';
export class Module { ctrl = new Controller(); }
`);
      await fixture.writeFile('src/new/controller.ts', `
export class Controller {}
`);

      // When: 移動 module（目標目錄已有 controller）
      const result = await executeCLI(
        [
          'move',
          'src/old/module.ts',
          'src/new/module.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: import 應保持 ./controller（因為目標目錄已有 controller）
      expect(result.exitCode).toBe(0);
      const movedContent = await fixture.readFile('src/new/module.ts');
      expect(movedContent).toContain('from \'./controller\'');
    });
  });

  describe('目錄移動', () => {
    it('目錄移動時，同目錄的 import 應該保持不變（Issue #57 已修復）', async () => {
      // Given: 目錄內有互相引用的檔案
      await fixture.writeFile('src/modules/feature/controller.ts', `
export class FeatureController {
  get() { return 100; }
}
`);
      await fixture.writeFile('src/modules/feature/module.ts', `
import { FeatureController } from './controller';

export class FeatureModule {
  ctrl = new FeatureController();
}
`);
      // 確保目標目錄的父目錄存在
      await fixture.writeFile('src/lib/.gitkeep', '');

      // When: 移動整個目錄（在 src 內移動）
      const result = await executeCLI(
        [
          'move',
          'src/modules/feature',
          'src/lib/feature',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證移動後的 module.ts 內容
      const movedContent = await fixture.readFile('src/lib/feature/module.ts');

      // 目錄移動時，同目錄的 ./controller 應該保持不變
      expect(movedContent).toContain('from \'./controller\'');
    });
  });

  describe('edge cases', () => {
    it('移動到同一目錄的不同檔名時，相對 import 不需要更新', async () => {
      // Given
      await fixture.writeFile('src/utils/helper.ts', `
export function help() { return 'help'; }
`);
      await fixture.writeFile('src/utils/old-name.ts', `
import { help } from './helper';
export const result = help();
`);

      // When: 同目錄重命名
      const result = await executeCLI(
        [
          'move',
          'src/utils/old-name.ts',
          'src/utils/new-name.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const movedContent = await fixture.readFile('src/utils/new-name.ts');
      // 同目錄，相對路徑不變（因為 helper.ts 存在）
      expect(movedContent).toContain('from \'./helper\'');
    });

    it('被移動檔案有多個相對 import 時，都應該正確更新', async () => {
      // Given: 多個相對 import
      await fixture.writeFile('src/common/a.ts', 'export const a = \'a\';');
      await fixture.writeFile('src/common/b.ts', 'export const b = \'b\';');
      await fixture.writeFile('src/utils/c.ts', 'export const c = \'c\';');
      await fixture.writeFile('src/main/app.ts', `
import { a } from '../common/a';
import { b } from '../common/b';
import { c } from '../utils/c';

export const app = a + b + c;
`);

      // When: 移動
      const result = await executeCLI(
        [
          'move',
          'src/main/app.ts',
          'lib/core/app.ts',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);
      const movedContent = await fixture.readFile('lib/core/app.ts');

      // 從 lib/core/ 到 src/common/ 和 src/utils/
      expect(movedContent).toContain('from \'../../src/common/a\'');
      expect(movedContent).toContain('from \'../../src/common/b\'');
      expect(movedContent).toContain('from \'../../src/utils/c\'');
    });
  });
});
