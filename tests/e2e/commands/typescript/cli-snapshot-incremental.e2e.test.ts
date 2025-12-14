/**
 * CLI Incremental Snapshot 命令 E2E 測試
 * 測試增量快照功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import type { SnapshotResult, IncrementalSnapshotData } from '@infrastructure/formatters/query-types.js';

describe('CLI snapshot incremental', () => {
    let fixture: FixtureContext;
    let projectPath: string;

    beforeEach(async () => {
        // 載入基本專案 fixture
        fixture = await loadFixture('sample-project');
        projectPath = fixture.rootPath;
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('應該能夠生成初始增量快照', async () => {
        // 第一次執行，沒有快取，應該回傳完整快照但包裝成增量格式
        const result = await executeCLI(['snapshot', '--path', projectPath, '--since', 'last', '--format', 'json'], { memfs: fixture.memfs });

        expect(result.exitCode).toBe(0);
        const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

        expect(snapshotResult.snapshotType).toBe('incremental');
        const data = snapshotResult.snapshot as IncrementalSnapshotData;
        expect(data.baseVersion).toBe(''); // 初始快照沒有 baseVersion
        expect(Object.keys(data.delta.added.modules).length).toBeGreaterThan(0);
    });

    it('應該能夠偵測檔案變更並生成增量快照', async () => {
        // 1. 生成初始快照 (建立快取)
        await executeCLI(['snapshot', '--path', projectPath, '--since', 'last', '--format', 'json'], { memfs: fixture.memfs });

        // 2. 修改檔案：在 User 介面中新增一個欄位
        const userFileRelativePath = 'src/types/index.ts';
        const userFileContent = await fixture.readFile(userFileRelativePath);
        const newContent = userFileContent + '\nexport interface NewInterface { id: number; }';
        await fixture.writeFile(userFileRelativePath, newContent);

        // 3. 生成增量快照
        const result = await executeCLI(['snapshot', '--path', projectPath, '--since', 'last', '--format', 'json'], { memfs: fixture.memfs });

        expect(result.exitCode).toBe(0);
        const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

        expect(snapshotResult.snapshotType).toBe('incremental');
        const data = snapshotResult.snapshot as IncrementalSnapshotData;

        expect(data.baseVersion).not.toBe('');

        // 應該偵測到修改
        const modifiedModules = data.delta.modified.modules;
        // 因為 types 模組變更了，如果是 Project Snapshot，這裡可能是模組路徑
        // 如果是 Module Snapshot，這裡可能是空（因為整個模組被視為 modified，或者 symbols 變更）
        // 這裡我們是對整個 project 做 snapshot

        // 檢查是否有 symbols 變更
        // 注意：目前的 SnapshotCacheManager 對於 Project Snapshot 的 Delta 計算是：
        // 如果模組內容變了，會列在 modified.modules 或 modified.symbols 中

        // 我們檢查 modified.modules 是否包含 'src/types' (相對路徑可能不同，視實作而定)
        const hasModifiedModule = modifiedModules.some(m => m.includes('types'));
        // 或者 added symbols
        const hasAddedSymbol = data.delta.added.symbols.some(s => s.name === 'NewInterface');

        expect(hasModifiedModule || hasAddedSymbol).toBe(true);
    });

    it('應該能夠使用 --refresh 強制刷新', async () => {
        // 1. 生成初始快照
        await executeCLI(['snapshot', '--path', projectPath, '--since', 'last', '--format', 'json'], { memfs: fixture.memfs });

        // 2. 使用 --refresh
        const result = await executeCLI(['snapshot', '--path', projectPath, '--refresh', '--format', 'json'], { memfs: fixture.memfs });

        expect(result.exitCode).toBe(0);
        const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
        const data = snapshotResult.snapshot as IncrementalSnapshotData;

        // refresh 應該回傳完整的 added，且 baseVersion 為空
        expect(data.baseVersion).toBe('');
        expect(Object.keys(data.delta.added.modules).length).toBeGreaterThan(0);
    });

    it('應該在沒有變更時回傳空 delta', async () => {
        // 1. 生成初始快照
        await executeCLI(['snapshot', '--path', projectPath, '--since', 'last', '--format', 'json'], { memfs: fixture.memfs });

        // 2. 再次生成增量快照（無變更）
        const result = await executeCLI(['snapshot', '--path', projectPath, '--since', 'last', '--format', 'json'], { memfs: fixture.memfs });

        expect(result.exitCode).toBe(0);
        const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
        const data = snapshotResult.snapshot as IncrementalSnapshotData;

        expect(Object.keys(data.delta.added.modules)).toHaveLength(0);
        expect(data.delta.added.symbols).toHaveLength(0);
        expect(data.delta.modified.modules).toHaveLength(0);
        expect(data.delta.modified.symbols).toHaveLength(0);
        expect(data.delta.removed.modules).toHaveLength(0);
        expect(data.delta.removed.symbols).toHaveLength(0);
    });
});
