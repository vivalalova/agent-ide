/**
 * HistoryManager 單元測試
 * 測試變更歷史記錄管理功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { HistoryManager, restoreBackupsFromHistory, HISTORY_DEFAULTS } from '@infrastructure/history/index.js';
import { BackupType, ChangesetCommand } from '@infrastructure/changeset/types.js';
import type { Changeset, BackupEntry } from '@infrastructure/changeset/types.js';

describe('HistoryManager', () => {
  let tempDir: string;
  let projectPath: string;

  beforeEach(async () => {
    // 建立唯一的臨時目錄作為模擬專案
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ide-history-test-'));
    projectPath = tempDir;
  });

  afterEach(async () => {
    // 清理臨時目錄
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理錯誤
    }

    // 清理歷史目錄中的測試檔案
    const historyBaseDir = path.join(os.homedir(), '.config', 'agent-ide', HISTORY_DEFAULTS.HISTORY_DIR);
    try {
      const dirs = await fs.readdir(historyBaseDir);
      for (const dir of dirs) {
        // 刪除以測試臨時目錄 hash 開頭的目錄
        try {
          await fs.rm(path.join(historyBaseDir, dir), { recursive: true, force: true });
        } catch {
          // 忽略
        }
      }
    } catch {
      // 目錄可能不存在
    }
  });

  // ==========================================================================
  // 建構函式
  // ==========================================================================

  describe('建構函式', () => {
    it('應該使用預設選項', () => {
      const manager = new HistoryManager({ projectPath });
      expect(manager).toBeDefined();
    });

    it('應該接受自訂選項', () => {
      const manager = new HistoryManager({
        projectPath,
        maxEntries: 5,
        maxAgeDays: 3
      });
      expect(manager).toBeDefined();
    });
  });

  // ==========================================================================
  // saveBeforeChange
  // ==========================================================================

  describe('saveBeforeChange', () => {
    it('應該儲存歷史記錄', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: '將 foo 重新命名為 bar',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const backups: BackupEntry[] = [
        {
          filePath: '/test/file.ts',
          originalContent: 'const foo = 1;',
          type: BackupType.Text
        }
      ];

      const id = await manager.saveBeforeChange(changeset, backups);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('應該儲存多筆歷史記錄', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const backups: BackupEntry[] = [];

      // 儲存多筆
      await manager.saveBeforeChange(changeset, backups);
      await manager.saveBeforeChange(changeset, backups);
      await manager.saveBeforeChange(changeset, backups);

      const { entries, total } = await manager.listHistory();
      expect(total).toBe(3);
      expect(entries).toHaveLength(3);
    });
  });

  // ==========================================================================
  // listHistory
  // ==========================================================================

  describe('listHistory', () => {
    it('應該回傳空列表當沒有歷史', async () => {
      const manager = new HistoryManager({ projectPath });

      const { entries, total } = await manager.listHistory();

      expect(entries).toEqual([]);
      expect(total).toBe(0);
    });

    it('應該按時間倒序排列', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      // 儲存多筆（有時間間隔）
      await manager.saveBeforeChange(changeset, []);
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.saveBeforeChange(changeset, []);
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.saveBeforeChange(changeset, []);

      const { entries } = await manager.listHistory();

      // 驗證按時間倒序
      for (let i = 0; i < entries.length - 1; i++) {
        expect(entries[i].timestamp).toBeGreaterThanOrEqual(entries[i + 1].timestamp);
      }
    });

    it('應該包含完整的歷史資訊', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Move,
        description: '移動檔案',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const backups: BackupEntry[] = [
        {
          filePath: '/old/path.ts',
          originalContent: 'content',
          type: BackupType.Move,
          targetPath: '/new/path.ts'
        }
      ];

      await manager.saveBeforeChange(changeset, backups);

      const { entries } = await manager.listHistory();
      const entry = entries[0];

      expect(entry.command).toBe(ChangesetCommand.Move);
      expect(entry.description).toBe('移動檔案');
      expect(entry.projectPath).toBe(path.resolve(projectPath));
      expect(entry.backups).toHaveLength(1);
      expect(entry.backups[0].filePath).toBe('/old/path.ts');
      expect(entry.backups[0].type).toBe(BackupType.Move);
      expect(entry.backups[0].targetPath).toBe('/new/path.ts');
    });
  });

  // ==========================================================================
  // getLatestEntry / getEntryById
  // ==========================================================================

  describe('getLatestEntry', () => {
    it('應該回傳最新的歷史記錄', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset1: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'first',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const changeset2: Changeset = {
        command: ChangesetCommand.Move,
        description: 'second',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      await manager.saveBeforeChange(changeset1, []);
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.saveBeforeChange(changeset2, []);

      const latest = await manager.getLatestEntry();

      expect(latest).toBeDefined();
      expect(latest?.description).toBe('second');
    });

    it('應該回傳 null 當沒有歷史', async () => {
      const manager = new HistoryManager({ projectPath });

      const latest = await manager.getLatestEntry();

      expect(latest).toBeNull();
    });
  });

  describe('getEntryById', () => {
    it('應該根據 ID 取得歷史記錄', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test entry',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const id = await manager.saveBeforeChange(changeset, []);
      const entry = await manager.getEntryById(id);

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(id);
      expect(entry?.description).toBe('test entry');
    });

    it('應該回傳 null 當 ID 不存在', async () => {
      const manager = new HistoryManager({ projectPath });

      const entry = await manager.getEntryById('nonexistent-id');

      expect(entry).toBeNull();
    });

    it('應該支援前綴匹配（至少 8 字元）', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'prefix test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const id = await manager.saveBeforeChange(changeset, []);

      // 使用前 8 字元匹配
      const prefix8 = id.substring(0, 8);
      const entry = await manager.getEntryById(prefix8);

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(id);
    });

    it('應該回傳 null 當前綴長度不足 8 字元', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'short prefix test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const id = await manager.saveBeforeChange(changeset, []);

      // 使用前 7 字元（不足 8 字元）
      const shortPrefix = id.substring(0, 7);
      const entry = await manager.getEntryById(shortPrefix);

      expect(entry).toBeNull();
    });
  });

  // ==========================================================================
  // deleteEntry
  // ==========================================================================

  describe('deleteEntry', () => {
    it('應該刪除指定的歷史記錄', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const id = await manager.saveBeforeChange(changeset, []);

      // 確認存在
      let entry = await manager.getEntryById(id);
      expect(entry).toBeDefined();

      // 刪除
      const result = await manager.deleteEntry(id);
      expect(result).toBe(true);

      // 確認已刪除
      entry = await manager.getEntryById(id);
      expect(entry).toBeNull();
    });

    it('應該回傳 false 當 ID 不存在', async () => {
      const manager = new HistoryManager({ projectPath });

      const result = await manager.deleteEntry('nonexistent-id');

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // cleanup
  // ==========================================================================

  describe('cleanup', () => {
    it('應該刪除超過數量限制的項目', async () => {
      const manager = new HistoryManager({
        projectPath,
        maxEntries: 3,
        maxAgeDays: 365 // 不考慮時間限制
      });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      // 儲存 5 筆
      for (let i = 0; i < 5; i++) {
        await manager.saveBeforeChange(changeset, []);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // cleanup 會在 saveBeforeChange 後自動執行
      const { entries } = await manager.listHistory();

      expect(entries.length).toBe(3);
    });

    it('應該刪除過期的項目（超過 maxAgeDays）', async () => {
      // 先用高 maxAgeDays 建立 entries，然後用低 maxAgeDays 執行 cleanup
      const managerForSave = new HistoryManager({
        projectPath,
        maxEntries: 100,
        maxAgeDays: 365 // 足夠長，不會在 save 時被清理
      });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'expired entry',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      // 儲存 3 筆
      await managerForSave.saveBeforeChange(changeset, []);
      await managerForSave.saveBeforeChange(changeset, []);
      await managerForSave.saveBeforeChange(changeset, []);

      // 等待一下確保時間差
      await new Promise(resolve => setTimeout(resolve, 10));

      // 用 maxAgeDays=0 的 manager 執行 cleanup（會視所有項目為過期）
      const managerForCleanup = new HistoryManager({
        projectPath,
        maxEntries: 100,
        maxAgeDays: 0 // 0 天，所有項目都會過期
      });

      const result = await managerForCleanup.cleanup();

      // 所有項目都應該被刪除（因為 maxAgeDays=0）
      expect(result.removed).toBe(3);
      expect(result.kept).toBe(0);

      const { entries } = await managerForCleanup.listHistory();
      expect(entries.length).toBe(0);
    });

    it('cleanup 應該回傳正確的統計', async () => {
      const manager = new HistoryManager({
        projectPath,
        maxEntries: 2,
        maxAgeDays: 365
      });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      // 儲存 4 筆
      for (let i = 0; i < 4; i++) {
        await manager.saveBeforeChange(changeset, []);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 再執行一次 cleanup（此時應該有 2 筆）
      const result = await manager.cleanup();

      expect(result.kept).toBe(2);
      expect(result.removed).toBe(0); // 之前已經清理過
    });

    it('應該保留最新的項目', async () => {
      const manager = new HistoryManager({
        projectPath,
        maxEntries: 2,
        maxAgeDays: 365
      });

      const ids: string[] = [];

      for (let i = 0; i < 4; i++) {
        const changeset: Changeset = {
          command: ChangesetCommand.Rename,
          description: `entry ${i}`,
          success: true,
          textChanges: [],
          fileOperations: []
        };
        const id = await manager.saveBeforeChange(changeset, []);
        ids.push(id);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const { entries } = await manager.listHistory();

      // 應該只保留最新的 2 筆
      expect(entries.length).toBe(2);
      expect(entries.map(e => e.description)).toContain('entry 3');
      expect(entries.map(e => e.description)).toContain('entry 2');
    });
  });

  // ==========================================================================
  // clearAll
  // ==========================================================================

  describe('clearAll', () => {
    it('應該清空所有歷史記錄', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      // 儲存多筆
      await manager.saveBeforeChange(changeset, []);
      await manager.saveBeforeChange(changeset, []);
      await manager.saveBeforeChange(changeset, []);

      // 清空
      const removed = await manager.clearAll();

      expect(removed).toBe(3);

      const { entries } = await manager.listHistory();
      expect(entries).toHaveLength(0);
    });
  });

  // ==========================================================================
  // restoreBackupsFromHistory
  // ==========================================================================

  describe('restoreBackupsFromHistory', () => {
    it('應該正確還原備份內容', async () => {
      const manager = new HistoryManager({ projectPath });

      const originalContent = 'const 中文 = "unicode test";';
      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const backups: BackupEntry[] = [
        {
          filePath: '/test/unicode.ts',
          originalContent,
          type: BackupType.Text
        }
      ];

      await manager.saveBeforeChange(changeset, backups);

      const entry = await manager.getLatestEntry();
      expect(entry).toBeDefined();

      const restored = restoreBackupsFromHistory(entry!);

      expect(restored).toHaveLength(1);
      expect(restored[0].filePath).toBe('/test/unicode.ts');
      expect(restored[0].originalContent).toBe(originalContent);
      expect(restored[0].type).toBe(BackupType.Text);
    });

    it('應該正確處理 null 內容（新建檔案的備份）', async () => {
      const manager = new HistoryManager({ projectPath });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      const backups: BackupEntry[] = [
        {
          filePath: '/test/new-file.ts',
          originalContent: null, // 新建檔案
          type: BackupType.Create
        }
      ];

      await manager.saveBeforeChange(changeset, backups);

      const entry = await manager.getLatestEntry();
      const restored = restoreBackupsFromHistory(entry!);

      expect(restored[0].originalContent).toBeNull();
      expect(restored[0].type).toBe(BackupType.Create);
    });
  });

  // ==========================================================================
  // 邊界情況處理
  // ==========================================================================

  describe('邊界情況處理', () => {
    it('listHistory 應該跳過損壞的 JSON 檔案', async () => {
      const manager = new HistoryManager({ projectPath });

      // 先正常儲存一筆
      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'valid entry',
        success: true,
        textChanges: [],
        fileOperations: []
      };
      await manager.saveBeforeChange(changeset, []);

      // 手動寫入一個損壞的 JSON 檔案
      const historyDir = path.join(
        os.homedir(),
        '.config',
        'agent-ide',
        HISTORY_DEFAULTS.HISTORY_DIR
      );
      const dirs = await fs.readdir(historyDir);
      // 找到這個專案的 history 目錄
      for (const dir of dirs) {
        const projectHistoryDir = path.join(historyDir, dir);
        const stat = await fs.stat(projectHistoryDir);
        if (stat.isDirectory()) {
          // 寫入損壞的 JSON 檔案
          const corruptedFile = path.join(projectHistoryDir, 'corrupted-test.json');
          await fs.writeFile(corruptedFile, 'not valid json {{{');
        }
      }

      // listHistory 應該跳過損壞的檔案，只回傳有效的
      const { entries } = await manager.listHistory();

      // 應該至少有一筆有效的
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.some(e => e.description === 'valid entry')).toBe(true);
    });

    it('deleteEntry 應該處理部分 ID 前綴匹配但內容不符的情況', async () => {
      const manager = new HistoryManager({ projectPath });

      // 儲存一筆
      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test entry',
        success: true,
        textChanges: [],
        fileOperations: []
      };
      const id = await manager.saveBeforeChange(changeset, []);

      // 用不存在的 ID（但前 8 字元相同）嘗試刪除
      const fakeId = id.substring(0, 8) + 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz';
      const result = await manager.deleteEntry(fakeId);

      // 應該回傳 false（因為完整 ID 不匹配）
      expect(result).toBe(false);

      // 原始項目應該還在
      const entry = await manager.getEntryById(id);
      expect(entry).toBeDefined();
    });
  });

  // ==========================================================================
  // 多專案隔離
  // ==========================================================================

  describe('多專案隔離', () => {
    it('不同專案的歷史應該互相獨立', async () => {
      const project1 = path.join(tempDir, 'project1');
      const project2 = path.join(tempDir, 'project2');
      await fs.mkdir(project1, { recursive: true });
      await fs.mkdir(project2, { recursive: true });

      const manager1 = new HistoryManager({ projectPath: project1 });
      const manager2 = new HistoryManager({ projectPath: project2 });

      const changeset: Changeset = {
        command: ChangesetCommand.Rename,
        description: 'test',
        success: true,
        textChanges: [],
        fileOperations: []
      };

      // 專案 1 儲存 2 筆
      await manager1.saveBeforeChange(changeset, []);
      await manager1.saveBeforeChange(changeset, []);

      // 專案 2 儲存 1 筆
      await manager2.saveBeforeChange(changeset, []);

      const result1 = await manager1.listHistory();
      const result2 = await manager2.listHistory();

      expect(result1.total).toBe(2);
      expect(result2.total).toBe(1);
    });
  });
});
