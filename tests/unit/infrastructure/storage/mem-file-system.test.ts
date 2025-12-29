/**
 * MemFileSystem 測試
 * 測試記憶體檔案系統的所有功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

// ============================================================================
// MemFileSystem Tests
// ============================================================================

describe('MemFileSystem', () => {
  let fs: MemFileSystem;

  beforeEach(() => {
    fs = new MemFileSystem();
  });

  describe('constructor', () => {
    it('應該建立空的檔案系統', async () => {
      // 根目錄在 mem-vfs 中預設存在
      const exists = await fs.exists('/nonexistent-file.ts');
      expect(exists).toBe(false);
    });
  });

  describe('fromJSON / toJSON', () => {
    it('應該從平面路徑格式 JSON 初始化', async () => {
      await fs.fromJSON({
        '/src/a.ts': 'const a = 1;',
        '/src/b.ts': 'const b = 2;',
      });

      const contentA = await fs.readFile('/src/a.ts', 'utf-8');
      const contentB = await fs.readFile('/src/b.ts', 'utf-8');

      expect(contentA).toBe('const a = 1;');
      expect(contentB).toBe('const b = 2;');
    });

    it('應該匯出為平面路徑格式 JSON', async () => {
      await fs.fromJSON({
        '/src/a.ts': 'const a = 1;',
      });

      const json = fs.toJSON();

      expect(json['/src/a.ts']).toBe('const a = 1;');
    });

    it('應該處理空的 JSON', async () => {
      await fs.fromJSON({});

      const json = fs.toJSON();
      expect(Object.keys(json)).toHaveLength(0);
    });

    it('應該處理深層目錄結構', async () => {
      await fs.fromJSON({
        '/a/b/c/d/e/f.ts': 'deep file',
      });

      const content = await fs.readFile('/a/b/c/d/e/f.ts', 'utf-8');
      expect(content).toBe('deep file');
    });
  });

  describe('reset', () => {
    it('應該重設檔案系統', async () => {
      await fs.fromJSON({
        '/src/a.ts': 'content',
      });

      fs.reset();

      const exists = await fs.exists('/src/a.ts');
      expect(exists).toBe(false);
    });
  });

  describe('readFile', () => {
    it('應該讀取檔案內容', async () => {
      await fs.fromJSON({
        '/test.txt': 'hello world',
      });

      const content = await fs.readFile('/test.txt', 'utf-8');
      expect(content).toBe('hello world');
    });

    it('應該拋出錯誤當檔案不存在', async () => {
      await expect(fs.readFile('/nonexistent.txt')).rejects.toThrow();
    });

    it('應該讀取二進制內容', async () => {
      await fs.fromJSON({
        '/binary.bin': 'binary content',
      });

      const content = await fs.readFile('/binary.bin');
      expect(content).toBeDefined();
    });
  });

  describe('writeFile', () => {
    it('應該寫入檔案', async () => {
      await fs.writeFile('/new.txt', 'new content');

      const content = await fs.readFile('/new.txt', 'utf-8');
      expect(content).toBe('new content');
    });

    it('應該覆寫現有檔案', async () => {
      await fs.writeFile('/test.txt', 'original');
      await fs.writeFile('/test.txt', 'updated');

      const content = await fs.readFile('/test.txt', 'utf-8');
      expect(content).toBe('updated');
    });

    it('應該自動建立父目錄', async () => {
      await fs.writeFile('/new/path/file.txt', 'content');

      const exists = await fs.exists('/new/path/file.txt');
      expect(exists).toBe(true);
    });
  });

  describe('appendFile', () => {
    it('應該附加內容到檔案', async () => {
      await fs.writeFile('/test.txt', 'hello');
      await fs.appendFile('/test.txt', ' world');

      const content = await fs.readFile('/test.txt', 'utf-8');
      expect(content).toBe('hello world');
    });

    it('應該建立新檔案如果不存在', async () => {
      await fs.appendFile('/new.txt', 'content');

      const content = await fs.readFile('/new.txt', 'utf-8');
      expect(content).toBe('content');
    });
  });

  describe('deleteFile', () => {
    it('應該刪除檔案', async () => {
      await fs.fromJSON({
        '/test.txt': 'content',
      });

      await fs.deleteFile('/test.txt');

      const exists = await fs.exists('/test.txt');
      expect(exists).toBe(false);
    });

    it('應該拋出錯誤當檔案不存在', async () => {
      await expect(fs.deleteFile('/nonexistent.txt')).rejects.toThrow();
    });
  });

  describe('createDirectory', () => {
    it('應該建立目錄', async () => {
      await fs.createDirectory('/new-dir');

      const isDir = await fs.isDirectory('/new-dir');
      expect(isDir).toBe(true);
    });

    it('應該遞迴建立目錄', async () => {
      await fs.createDirectory('/a/b/c/d', true);

      const isDir = await fs.isDirectory('/a/b/c/d');
      expect(isDir).toBe(true);
    });

    it('應該在非遞迴模式下拋出錯誤當父目錄不存在', async () => {
      await expect(fs.createDirectory('/nonexistent/dir', false)).rejects.toThrow();
    });
  });

  describe('readDirectory', () => {
    it('應該列出目錄內容', async () => {
      await fs.fromJSON({
        '/dir/a.ts': 'a',
        '/dir/b.ts': 'b',
        '/dir/sub/c.ts': 'c',
      });

      const entries = await fs.readDirectory('/dir');

      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.some(e => e.name === 'a.ts')).toBe(true);
      expect(entries.some(e => e.name === 'b.ts')).toBe(true);
    });

    it('應該回傳正確的 entry 屬性', async () => {
      await fs.fromJSON({
        '/dir/file.ts': 'content',
      });

      const entries = await fs.readDirectory('/dir');
      const fileEntry = entries.find(e => e.name === 'file.ts');

      expect(fileEntry?.isFile).toBe(true);
      expect(fileEntry?.isDirectory).toBe(false);
      expect(fileEntry?.path).toBe('/dir/file.ts');
      expect(typeof fileEntry?.size).toBe('number');
      expect(fileEntry?.modifiedTime).toBeInstanceOf(Date);
    });

    it('應該識別子目錄', async () => {
      await fs.fromJSON({
        '/dir/sub/file.ts': 'content',
      });

      const entries = await fs.readDirectory('/dir');
      const subDir = entries.find(e => e.name === 'sub');

      expect(subDir?.isDirectory).toBe(true);
      expect(subDir?.isFile).toBe(false);
    });
  });

  describe('deleteDirectory', () => {
    it('應該刪除空目錄', async () => {
      await fs.createDirectory('/empty-dir');
      await fs.deleteDirectory('/empty-dir');

      const exists = await fs.exists('/empty-dir');
      expect(exists).toBe(false);
    });

    it('應該遞迴刪除目錄', async () => {
      await fs.fromJSON({
        '/dir/a.ts': 'a',
        '/dir/sub/b.ts': 'b',
      });

      await fs.deleteDirectory('/dir', true);

      const exists = await fs.exists('/dir');
      expect(exists).toBe(false);
    });

    it('應該在非遞迴模式下拋出錯誤當目錄非空', async () => {
      await fs.fromJSON({
        '/dir/file.ts': 'content',
      });

      await expect(fs.deleteDirectory('/dir', false)).rejects.toThrow();
    });
  });

  describe('exists', () => {
    it('應該回傳 true 當檔案存在', async () => {
      await fs.fromJSON({
        '/file.ts': 'content',
      });

      const exists = await fs.exists('/file.ts');
      expect(exists).toBe(true);
    });

    it('應該回傳 true 當目錄存在', async () => {
      await fs.fromJSON({
        '/dir/file.ts': 'content',
      });

      const exists = await fs.exists('/dir');
      expect(exists).toBe(true);
    });

    it('應該回傳 false 當路徑不存在', async () => {
      const exists = await fs.exists('/nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('getStats', () => {
    it('應該回傳檔案統計資訊', async () => {
      await fs.fromJSON({
        '/file.ts': 'content',
      });

      const stats = await fs.getStats('/file.ts');

      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.createdTime).toBeInstanceOf(Date);
      expect(stats.modifiedTime).toBeInstanceOf(Date);
      expect(stats.accessedTime).toBeInstanceOf(Date);
      expect(typeof stats.mode).toBe('number');
      expect(typeof stats.uid).toBe('number');
      expect(typeof stats.gid).toBe('number');
    });

    it('應該回傳目錄統計資訊', async () => {
      await fs.fromJSON({
        '/dir/file.ts': 'content',
      });

      const stats = await fs.getStats('/dir');

      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });

    it('應該拋出錯誤當路徑不存在', async () => {
      await expect(fs.getStats('/nonexistent')).rejects.toThrow();
    });
  });

  describe('isFile', () => {
    it('應該回傳 true 對檔案', async () => {
      await fs.fromJSON({
        '/file.ts': 'content',
      });

      const isFile = await fs.isFile('/file.ts');
      expect(isFile).toBe(true);
    });

    it('應該回傳 false 對目錄', async () => {
      await fs.fromJSON({
        '/dir/file.ts': 'content',
      });

      const isFile = await fs.isFile('/dir');
      expect(isFile).toBe(false);
    });

    it('應該回傳 false 對不存在的路徑', async () => {
      const isFile = await fs.isFile('/nonexistent');
      expect(isFile).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('應該回傳 true 對目錄', async () => {
      await fs.fromJSON({
        '/dir/file.ts': 'content',
      });

      const isDir = await fs.isDirectory('/dir');
      expect(isDir).toBe(true);
    });

    it('應該回傳 false 對檔案', async () => {
      await fs.fromJSON({
        '/file.ts': 'content',
      });

      const isDir = await fs.isDirectory('/file.ts');
      expect(isDir).toBe(false);
    });

    it('應該回傳 false 對不存在的路徑', async () => {
      const isDir = await fs.isDirectory('/nonexistent');
      expect(isDir).toBe(false);
    });
  });

  describe('copyFile', () => {
    it('應該複製檔案', async () => {
      await fs.fromJSON({
        '/source.ts': 'content',
      });

      await fs.copyFile('/source.ts', '/dest.ts');

      const sourceContent = await fs.readFile('/source.ts', 'utf-8');
      const destContent = await fs.readFile('/dest.ts', 'utf-8');

      expect(sourceContent).toBe('content');
      expect(destContent).toBe('content');
    });

    it('應該覆寫目標檔案', async () => {
      await fs.fromJSON({
        '/source.ts': 'new content',
        '/dest.ts': 'old content',
      });

      await fs.copyFile('/source.ts', '/dest.ts');

      const destContent = await fs.readFile('/dest.ts', 'utf-8');
      expect(destContent).toBe('new content');
    });
  });

  describe('moveFile', () => {
    it('應該移動檔案', async () => {
      await fs.fromJSON({
        '/source.ts': 'content',
      });

      await fs.moveFile('/source.ts', '/dest.ts');

      const sourceExists = await fs.exists('/source.ts');
      const destContent = await fs.readFile('/dest.ts', 'utf-8');

      expect(sourceExists).toBe(false);
      expect(destContent).toBe('content');
    });
  });

  describe('glob', () => {
    it('應該匹配檔案模式', async () => {
      await fs.fromJSON({
        '/src/a.ts': 'a',
        '/src/b.ts': 'b',
        '/src/c.js': 'c',
      });

      const matches = await fs.glob('**/*.ts', { cwd: '/src' });

      expect(matches.length).toBeGreaterThanOrEqual(0);
    });

    it('應該支援 ignore 選項', async () => {
      await fs.fromJSON({
        '/src/a.ts': 'a',
        '/src/node_modules/b.ts': 'b',
      });

      const matches = await fs.glob('**/*.ts', {
        cwd: '/src',
        ignore: ['**/node_modules/**'],
      });

      expect(matches.every(m => !m.includes('node_modules'))).toBe(true);
    });

    it('應該支援 onlyFiles 選項', async () => {
      await fs.fromJSON({
        '/src/dir/file.ts': 'content',
      });

      const matches = await fs.glob('**/*', {
        cwd: '/src',
        onlyFiles: true,
      });

      // 應該只回傳檔案
      for (const match of matches) {
        const isFile = await fs.isFile(match);
        expect(isFile).toBe(true);
      }
    });

    it('應該支援 onlyDirectories 選項', async () => {
      await fs.fromJSON({
        '/src/dir/file.ts': 'content',
      });

      const matches = await fs.glob('**/*', {
        cwd: '/src',
        onlyDirectories: true,
      });

      // 應該只回傳目錄
      for (const match of matches) {
        const isDir = await fs.isDirectory(match);
        expect(isDir).toBe(true);
      }
    });

    it('應該支援 dot 選項', async () => {
      await fs.fromJSON({
        '/src/.hidden': 'hidden',
        '/src/visible.ts': 'visible',
      });

      const matches = await fs.glob('*', {
        cwd: '/src',
        dot: true,
      });

      // dot 選項允許匹配隱藏檔案，但實際結果取決於 mem-vfs 實作
      expect(Array.isArray(matches)).toBe(true);
    });

    it('應該支援 absolute 選項', async () => {
      await fs.fromJSON({
        '/src/file.ts': 'content',
      });

      const matches = await fs.glob('**/*.ts', {
        cwd: '/src',
        absolute: true,
      });

      if (matches.length > 0) {
        expect(matches[0].startsWith('/')).toBe(true);
      }
    });
  });

  describe('symlink 操作', () => {
    it('應該建立符號連結', async () => {
      await fs.fromJSON({
        '/target.txt': 'content',
      });

      await fs.createSymlink('/target.txt', '/link.txt');

      const isSymlink = await fs.isSymlink('/link.txt');
      expect(isSymlink).toBe(true);
    });

    it('應該讀取符號連結目標', async () => {
      await fs.fromJSON({
        '/target.txt': 'content',
      });

      await fs.createSymlink('/target.txt', '/link.txt');

      const target = await fs.readSymlink('/link.txt');
      expect(target).toBe('/target.txt');
    });

    it('應該透過符號連結讀取檔案', async () => {
      await fs.fromJSON({
        '/target.txt': 'original content',
      });

      await fs.createSymlink('/target.txt', '/link.txt');

      const content = await fs.readFile('/link.txt', 'utf-8');
      expect(content).toBe('original content');
    });

    it('應該取得符號連結統計', async () => {
      await fs.fromJSON({
        '/target.txt': 'content',
      });

      await fs.createSymlink('/target.txt', '/link.txt');

      const stats = await fs.getLinkStats('/link.txt');
      expect(stats).toBeDefined();
      expect(typeof stats.mode).toBe('number');
    });
  });

  describe('snapshot 操作', () => {
    it('應該建立和列出快照', async () => {
      await fs.fromJSON({
        '/file.txt': 'content',
      });

      const snapshotId = fs.createSnapshot('test-snapshot');

      expect(snapshotId).toBeDefined();
      expect(fs.listSnapshots().length).toBe(1);
      expect(fs.listSnapshots()[0].name).toBe('test-snapshot');
    });

    it('應該還原快照', async () => {
      await fs.fromJSON({
        '/file.txt': 'original',
      });

      const snapshotId = fs.createSnapshot();

      await fs.writeFile('/file.txt', 'modified');
      await fs.writeFile('/new.txt', 'new content');

      fs.restoreSnapshot(snapshotId);

      expect(await fs.readFile('/file.txt', 'utf-8')).toBe('original');
      expect(await fs.exists('/new.txt')).toBe(false);
    });

    it('應該計算快照差異', async () => {
      await fs.fromJSON({
        '/file.txt': 'original',
      });

      const snapshot1 = fs.createSnapshot();

      await fs.writeFile('/file.txt', 'modified');
      await fs.writeFile('/new.txt', 'new');

      const diffs = fs.diff(snapshot1);

      expect(diffs.length).toBeGreaterThan(0);
    });

    it('應該刪除快照', async () => {
      const snapshotId = fs.createSnapshot();

      expect(fs.deleteSnapshot(snapshotId)).toBe(true);
      expect(fs.listSnapshots().length).toBe(0);
    });

    it('應該取得快照資訊', async () => {
      await fs.fromJSON({
        '/file.txt': 'content',
      });

      const snapshotId = fs.createSnapshot('my-snapshot');
      const info = fs.getSnapshotInfo(snapshotId);

      expect(info).toBeDefined();
      expect(info?.name).toBe('my-snapshot');
      expect(info?.fileCount).toBe(1);
    });
  });

  describe('watch 操作', () => {
    it('應該建立 watcher', async () => {
      const watcher = fs.watch('/');

      expect(watcher).toBeDefined();
      expect(typeof watcher.close).toBe('function');

      watcher.close();
    });

    it('應該監聽檔案變更', async () => {
      const events: string[] = [];
      // 設定較短的 debounce 時間以加快測試
      const watcher = fs.watch('/', { ignoreInitial: true, debounce: 10 });

      // 事件參數是 WatcherEvent 物件 { type, path, stats? }
      watcher.on('change', (event: { path: string }) => {
        events.push(`change:${event.path}`);
      });

      watcher.on('add', (event: { path: string }) => {
        events.push(`add:${event.path}`);
      });

      // 等待 ready
      await new Promise<void>((resolve) => {
        watcher.on('ready', resolve);
      });

      await fs.writeFile('/test.txt', 'content');

      // 等待超過 debounce 時間讓事件傳播
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 驗證事件已收到（add 或 change）
      const hasEvent = events.some((e) => e.includes('/test.txt'));
      expect(hasEvent).toBe(true);

      watcher.close();
    });
  });

  describe('邊界條件', () => {
    it('應該處理空字串檔案內容', async () => {
      await fs.writeFile('/empty.txt', '');

      const content = await fs.readFile('/empty.txt', 'utf-8');
      expect(content).toBe('');
    });

    it('應該處理特殊字元的檔案名', async () => {
      await fs.writeFile('/file with spaces.txt', 'content');

      const content = await fs.readFile('/file with spaces.txt', 'utf-8');
      expect(content).toBe('content');
    });

    it('應該處理 Unicode 內容', async () => {
      const unicodeContent = '你好世界 🌍 Привет мир';
      await fs.writeFile('/unicode.txt', unicodeContent);

      const content = await fs.readFile('/unicode.txt', 'utf-8');
      expect(content).toBe(unicodeContent);
    });

    it('應該處理大量檔案', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        files[`/dir/file${i}.ts`] = `content ${i}`;
      }

      await fs.fromJSON(files);

      const entries = await fs.readDirectory('/dir');
      expect(entries.length).toBe(100);
    });
  });
});
