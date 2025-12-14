/**
 * Snapshot 快取管理器
 * 儲存和比對快照版本，支援增量快照功能
 */

import * as crypto from 'crypto';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ModuleSnapshot, ProjectSnapshot, SnapshotResult } from './types.js';
import { isProjectSnapshot } from './types.js';

/**
 * 快照版本資訊
 */
export interface SnapshotVersion {
    /** 版本時間戳（ISO 格式） */
    readonly timestamp: string;
    /** 整體內容 checksum */
    readonly checksum: string;
    /** 各模組的 checksum */
    readonly moduleChecksums: Record<string, string>;
}

/**
 * 快取結構
 */
export interface SnapshotCache {
    /** 版本資訊 */
    readonly version: SnapshotVersion;
    /** 快照內容 */
    readonly snapshot: ModuleSnapshot | ProjectSnapshot;
}

/**
 * 增量快照結果
 */
export interface IncrementalSnapshot {
    /** 當前版本時間戳 */
    readonly version: string;
    /** 基準版本時間戳 */
    readonly baseVersion: string;
    /** 變更內容 */
    readonly delta: SnapshotDelta;
}

/**
 * 快照差異
 */
export interface SnapshotDelta {
    readonly added: {
        readonly modules: Record<string, ModuleSnapshot>;
        readonly symbols: readonly DeltaSymbol[];
    };
    readonly modified: {
        readonly modules: readonly string[];
        readonly symbols: readonly DeltaSymbol[];
    };
    readonly removed: {
        readonly modules: readonly string[];
        readonly symbols: readonly DeltaSymbol[];
    };
}

/**
 * 差異符號
 */
export interface DeltaSymbol {
    readonly module: string;
    readonly name: string;
    readonly signature?: string;
    readonly type: 'class' | 'function' | 'interface' | 'type' | 'factory';
}

/**
 * 快取管理器
 */
export class SnapshotCacheManager {
    private readonly cachePath: string;

    constructor(
        private readonly fileSystem: IFileSystem,
        private readonly basePath: string
    ) {
        this.cachePath = `${basePath}/.agent-ide/snapshot-cache.json`;
    }

    /**
     * 載入快取
     */
    async load(): Promise<SnapshotCache | null> {
        try {
            const exists = await this.fileSystem.exists(this.cachePath);
            if (!exists) {
                return null;
            }

            const content = await this.fileSystem.readFile(this.cachePath, 'utf-8') as string;
            const cache = JSON.parse(content) as SnapshotCache;

            // 驗證快取結構
            if (!cache.version || !cache.snapshot) {
                return null;
            }

            return cache;
        } catch {
            return null;
        }
    }

    /**
     * 儲存快取
     */
    async save(snapshot: SnapshotResult): Promise<SnapshotVersion> {
        const timestamp = new Date().toISOString();
        const checksum = this.computeChecksum(snapshot);
        const moduleChecksums = this.computeModuleChecksums(snapshot);

        const version: SnapshotVersion = {
            timestamp,
            checksum,
            moduleChecksums
        };

        const cache: SnapshotCache = {
            version,
            snapshot: snapshot as ModuleSnapshot | ProjectSnapshot
        };

        // 確保目錄存在
        const cacheDir = `${this.basePath}/.agent-ide`;
        const dirExists = await this.fileSystem.exists(cacheDir);
        if (!dirExists) {
            await this.fileSystem.createDirectory(cacheDir, true);
        }

        await this.fileSystem.writeFile(this.cachePath, JSON.stringify(cache, null, 2));

        return version;
    }

    /**
     * 計算快照 checksum
     */
    computeChecksum(data: unknown): string {
        const content = JSON.stringify(data);
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * 計算各模組的 checksum
     */
    private computeModuleChecksums(snapshot: SnapshotResult): Record<string, string> {
        const checksums: Record<string, string> = {};

        if (isProjectSnapshot(snapshot)) {
            for (const [moduleName, moduleSnapshot] of Object.entries(snapshot.modules)) {
                checksums[moduleName] = this.computeChecksum(moduleSnapshot);
            }
        } else {
            checksums[snapshot.module] = this.computeChecksum(snapshot);
        }

        return checksums;
    }

    /**
     * 比對兩個快照，產生差異
     */
    computeDelta(
        baseSnapshot: ModuleSnapshot | ProjectSnapshot,
        currentSnapshot: ModuleSnapshot | ProjectSnapshot
    ): SnapshotDelta {
        // 使用 mutable 內部變數構建差異
        const addedModules: Record<string, ModuleSnapshot> = {};
        const addedSymbols: DeltaSymbol[] = [];
        const modifiedModules: string[] = [];
        const modifiedSymbols: DeltaSymbol[] = [];
        const removedModules: string[] = [];
        const removedSymbols: DeltaSymbol[] = [];

        if (isProjectSnapshot(baseSnapshot) && isProjectSnapshot(currentSnapshot)) {
            // 專案級比對
            const baseModuleNames = new Set(Object.keys(baseSnapshot.modules));
            const currentModuleNames = new Set(Object.keys(currentSnapshot.modules));

            // 新增的模組
            for (const moduleName of currentModuleNames) {
                if (!baseModuleNames.has(moduleName)) {
                    addedModules[moduleName] = currentSnapshot.modules[moduleName];
                }
            }

            // 刪除的模組
            for (const moduleName of baseModuleNames) {
                if (!currentModuleNames.has(moduleName)) {
                    removedModules.push(moduleName);
                }
            }

            // 修改的模組
            for (const moduleName of currentModuleNames) {
                if (baseModuleNames.has(moduleName)) {
                    const baseChecksum = this.computeChecksum(baseSnapshot.modules[moduleName]);
                    const currentChecksum = this.computeChecksum(currentSnapshot.modules[moduleName]);

                    if (baseChecksum !== currentChecksum) {
                        modifiedModules.push(moduleName);

                        // 計算符號級差異
                        const symbolDelta = this.computeModuleSymbolDelta(
                            baseSnapshot.modules[moduleName],
                            currentSnapshot.modules[moduleName],
                            moduleName
                        );

                        addedSymbols.push(...symbolDelta.added);
                        modifiedSymbols.push(...symbolDelta.modified);
                        removedSymbols.push(...symbolDelta.removed);
                    }
                }
            }
        } else if (!isProjectSnapshot(baseSnapshot) && !isProjectSnapshot(currentSnapshot)) {
            // 模組級比對
            const moduleName = currentSnapshot.module;
            const symbolDelta = this.computeModuleSymbolDelta(baseSnapshot, currentSnapshot, moduleName);

            addedSymbols.push(...symbolDelta.added);
            modifiedSymbols.push(...symbolDelta.modified);
            removedSymbols.push(...symbolDelta.removed);

            if (symbolDelta.added.length > 0 || symbolDelta.modified.length > 0 || symbolDelta.removed.length > 0) {
                modifiedModules.push(moduleName);
            }
        }

        return {
            added: { modules: addedModules, symbols: addedSymbols },
            modified: { modules: modifiedModules, symbols: modifiedSymbols },
            removed: { modules: removedModules, symbols: removedSymbols }
        };
    }

    /**
     * 計算模組內符號差異
     */
    private computeModuleSymbolDelta(
        base: ModuleSnapshot,
        current: ModuleSnapshot,
        moduleName: string
    ): { added: DeltaSymbol[]; modified: DeltaSymbol[]; removed: DeltaSymbol[] } {
        const added: DeltaSymbol[] = [];
        const modified: DeltaSymbol[] = [];
        const removed: DeltaSymbol[] = [];

        // 比對 API (classes) - 巢狀結構用 JSON.stringify 作為 signature
        this.compareRecords({
            base: base.api,
            current: current.api,
            moduleName,
            type: 'class',
            added,
            modified,
            removed,
            getSignature: (value) => JSON.stringify(value),
            hasChanged: (baseVal, currentVal) => this.computeChecksum(baseVal) !== this.computeChecksum(currentVal)
        });

        // 比對 factories - 簡單結構直接用值作為 signature
        this.compareRecords({
            base: base.factories,
            current: current.factories,
            moduleName,
            type: 'factory',
            added,
            modified,
            removed,
            getSignature: (value) => value as string,
            hasChanged: (baseVal, currentVal) => baseVal !== currentVal
        });

        // 比對 types - 簡單結構直接用值作為 signature
        this.compareRecords({
            base: base.types,
            current: current.types,
            moduleName,
            type: 'type',
            added,
            modified,
            removed,
            getSignature: (value) => value as string,
            hasChanged: (baseVal, currentVal) => baseVal !== currentVal
        });

        return { added, modified, removed };
    }

    /**
     * 比對記錄並產生差異符號
     */
    private compareRecords<T>(options: {
        base: Record<string, T>;
        current: Record<string, T>;
        moduleName: string;
        type: DeltaSymbol['type'];
        /** 新增符號陣列（mutable） */
        added: DeltaSymbol[];
        /** 修改符號陣列（mutable） */
        modified: DeltaSymbol[];
        /** 刪除符號陣列（mutable） */
        removed: DeltaSymbol[];
        /** 取得 signature 的函數 */
        getSignature: (value: T) => string;
        /** 判斷是否變更的函數 */
        hasChanged: (baseVal: T, currentVal: T) => boolean;
    }): void {
        const { base, current, moduleName, type, added, modified, removed, getSignature, hasChanged } = options;
        const baseKeys = new Set(Object.keys(base));
        const currentKeys = new Set(Object.keys(current));

        // 新增
        for (const key of currentKeys) {
            if (!baseKeys.has(key)) {
                added.push({
                    module: moduleName,
                    name: key,
                    type,
                    signature: getSignature(current[key])
                });
            }
        }

        // 刪除
        for (const key of baseKeys) {
            if (!currentKeys.has(key)) {
                removed.push({ module: moduleName, name: key, type });
            }
        }

        // 修改
        for (const key of currentKeys) {
            if (baseKeys.has(key) && hasChanged(base[key], current[key])) {
                modified.push({
                    module: moduleName,
                    name: key,
                    type,
                    signature: getSignature(current[key])
                });
            }
        }
    }
}
