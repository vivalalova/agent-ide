import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SnapshotCacheManager } from '@core/snapshot/snapshot-cache.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ModuleSnapshot, ProjectSnapshot, SnapshotResult } from '@core/snapshot/types.js';

describe('SnapshotCacheManager', () => {
    let fileSystem: IFileSystem;
    let cacheManager: SnapshotCacheManager;
    const mockBasePath = '/test/project';
    const mockCachePath = '/test/project/.agent-ide/snapshot-cache.json';

    beforeEach(() => {
        fileSystem = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            createDirectory: vi.fn(),
            exists: vi.fn(),
        } as unknown as IFileSystem;

        cacheManager = new SnapshotCacheManager(fileSystem, mockBasePath);
    });

    describe('save', () => {
        it('應該正確儲存快照並回傳版本資訊', async () => {
            const mockSnapshot: ModuleSnapshot = {
                module: 'test-module',
                api: {},
                factories: {},
                types: {},
                private: {}
            };

            vi.spyOn(fileSystem, 'exists').mockResolvedValue(false);
            vi.spyOn(fileSystem, 'createDirectory').mockResolvedValue(undefined);
            vi.spyOn(fileSystem, 'writeFile').mockResolvedValue(undefined);

            const version = await cacheManager.save(mockSnapshot);

            expect(version).toBeDefined();
            expect(version.timestamp).toBeDefined();
            expect(version.checksum).toBeDefined();
            expect(fileSystem.createDirectory).toHaveBeenCalledWith(`${mockBasePath}/.agent-ide`, true);
            expect(fileSystem.writeFile).toHaveBeenCalled();
        });
    });

    describe('load', () => {
        it('當快取存在時應該回傳快取內容', async () => {
            const mockCache = {
                version: { timestamp: '2024-01-01', checksum: 'abc', moduleChecksums: {} },
                snapshot: { module: 'test', api: {}, factories: {}, types: {}, private: {} }
            };

            vi.spyOn(fileSystem, 'exists').mockResolvedValue(true);
            vi.spyOn(fileSystem, 'readFile').mockResolvedValue(JSON.stringify(mockCache));

            const result = await cacheManager.load();

            expect(result).toEqual(mockCache);
        });

        it('當快取不存在時應該回傳 null', async () => {
            vi.spyOn(fileSystem, 'exists').mockResolvedValue(false);

            const result = await cacheManager.load();

            expect(result).toBeNull();
        });

        it('當快取損壞時應該回傳 null', async () => {
            vi.spyOn(fileSystem, 'exists').mockResolvedValue(true);
            vi.spyOn(fileSystem, 'readFile').mockResolvedValue('invalid json');

            const result = await cacheManager.load();

            expect(result).toBeNull();
        });
    });

    describe('computeDelta', () => {
        const baseModule: ModuleSnapshot = {
            module: 'test',
            api: {
                'MyClass': { 'method1': '() -> void' }
            },
            factories: {},
            types: {},
            private: {}
        };

        it('應該偵測新增的 API (Class Level)', () => {
            const currentModule: ModuleSnapshot = {
                ...baseModule,
                api: {
                    'MyClass': {
                        'method1': '() -> void',
                        'method2': '() -> string' // 新增方法，導致 MyClass 變更
                    }
                }
            };

            const delta = cacheManager.computeDelta(baseModule, currentModule);

            // 因為是 Class 層級比對，所以應該標記 MyClass 為 modified
            expect(delta.modified.symbols).toHaveLength(1);
            expect(delta.modified.symbols[0]).toEqual({
                module: 'test',
                name: 'MyClass',
                type: 'class',
                signature: expect.any(String)
            });
        });

        it('應該偵測刪除的 API (Class Level)', () => {
            const currentModule: ModuleSnapshot = {
                ...baseModule,
                api: {}
            };

            const delta = cacheManager.computeDelta(baseModule, currentModule);

            expect(delta.removed.symbols).toHaveLength(1);
            expect(delta.removed.symbols[0]).toEqual({
                module: 'test',
                name: 'MyClass',
                type: 'class'
            });
        });

        it('應該偵測修改的 API (Class Level)', () => {
            const currentModule: ModuleSnapshot = {
                ...baseModule,
                api: {
                    'MyClass': { 'method1': '() -> number' } // 修改回傳型別
                }
            };

            const delta = cacheManager.computeDelta(baseModule, currentModule);

            expect(delta.modified.symbols).toHaveLength(1);
            expect(delta.modified.symbols[0]).toEqual({
                module: 'test',
                name: 'MyClass',
                type: 'class',
                signature: expect.any(String)
            });
        });

        it('應該在沒有變更時回傳空 delta', () => {
            const delta = cacheManager.computeDelta(baseModule, baseModule);

            expect(delta.added.symbols).toHaveLength(0);
            expect(delta.modified.symbols).toHaveLength(0);
            expect(delta.removed.symbols).toHaveLength(0);
        });
    });
});
