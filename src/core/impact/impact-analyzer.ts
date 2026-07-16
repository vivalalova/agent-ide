/**
 * 影響分析器
 * 分析檔案變更的影響範圍，提供依賴追蹤和統計功能
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { DependencyGraph } from '@core/foundations/dependency-graph/index.js';
import { CycleDetector } from '@core/cycles/index.js';
import {
  ParserRegistry,
  getRegisteredSourceFileExtensions,
  initializeDefaultParsers
} from '@infrastructure/parser/index.js';
import type {
  FileDependencies,
  ProjectDependencies,
  DependencyStats,
  ImpactAnalysisResult,
  DependencyQueryOptions,
  ExtendedDependencyAnalysisOptions
} from './types.js';
import { PathResolver } from './path-resolver.js';
import { FileScanner } from './file-scanner.js';
import { DependencyExtractor } from './dependency-extractor.js';

/**
 * 快取項目（僅保留業務需要的欄位，LRU 由 MemoryCache 處理）
 */
interface CacheEntry {
  data: FileDependencies;
  lastModified: Date;
  /** 檔案大小；與 mtime 一同判斷快取是否失效（見 analyzeFile），
   * 防 mtime 保留型操作（cp -p、git checkout、粗粒度 FS）造成 stale cache，
   * 判準對齊 index-disk-cache.ts 的 mtime+size 快取 key 設計 */
  size: number;
}

/**
 * 影響分析器類別
 */
export class ImpactAnalyzer {
  private graph: DependencyGraph;
  /** runtime-only 圖：排除 type-only imports，供 cycle 偵測使用 */
  private runtimeGraph: DependencyGraph;
  private cycleDetector: CycleDetector;
  private cache: MemoryCache<string, CacheEntry>;
  private options: ExtendedDependencyAnalysisOptions;
  private fileSystem: IFileSystem;
  private pathResolver: PathResolver;
  private fileScanner: FileScanner;
  private dependencyExtractor: DependencyExtractor;
  private readonly parserRegistry: ParserRegistry;
  /** 上一次 analyzeProject 掃描到的第一層專案檔案集合（不含依賴目標節點），
   * 供下一次呼叫比對出已從磁碟消失的檔案並清除其圖節點與快取，避免幽靈節點殘留 */
  private previousProjectFiles: Set<string> | null = null;

  constructor(fileSystem: IFileSystem, options?: Partial<ExtendedDependencyAnalysisOptions>) {
    this.graph = new DependencyGraph();
    this.runtimeGraph = new DependencyGraph();
    this.cycleDetector = new CycleDetector();
    this.cache = createLRUCache<string, CacheEntry>(1000);
    this.fileSystem = fileSystem;
    this.parserRegistry = ParserRegistry.getInstance();
    initializeDefaultParsers(this.parserRegistry);

    // 使用預設選項並合併使用者選項
    const defaultOptions = this.createDefaultAnalysisOptions(
      getRegisteredSourceFileExtensions(this.parserRegistry)
    );
    this.options = { ...defaultOptions, ...options };

    // 初始化子模組
    this.pathResolver = new PathResolver(fileSystem, this.options);
    this.fileScanner = new FileScanner(fileSystem, this.options);
    this.dependencyExtractor = new DependencyExtractor(
      this.pathResolver,
      this.fileScanner,
      this.parserRegistry
    );
  }

  /**
   * 分析單個檔案的依賴關係
   * @param filePath 檔案路徑
   * @param root 比對基準根目錄（如專案根目錄），供 fileScanner 相對化排除樣式比對；
   *   analyzeProject 掃描專案時會帶入專案根目錄，直接對單一檔案呼叫時未提供，
   *   退回以原始路徑比對（維持現行行為，見 dependency-extractor.extractDependencies）
   * @returns 檔案依賴資訊
   */
  async analyzeFile(filePath: string, root?: string): Promise<FileDependencies> {
    if (!filePath || !filePath.trim()) {
      throw new Error('檔案路徑不能為空');
    }

    const normalizedPath = path.resolve(filePath);

    // 檢查快取
    const cacheEntry = this.cache.get(normalizedPath);
    if (cacheEntry) {
      try {
        const stat = await this.fileSystem.getStats(normalizedPath);
        // mtime 未變新且 size 相同才視為快取有效：mtime 單獨比對在 mtime 保留型操作下會誤判命中
        if (stat.modifiedTime <= cacheEntry.lastModified && stat.size === cacheEntry.size) {
          // MemoryCache 自動更新 lastAccessedAt
          return cacheEntry.data;
        }
      } catch {
        // graceful-degradation: 檔案已被刪除時清除快取條目
        this.cache.delete(normalizedPath);
      }
    }

    try {
      const content = await this.fileSystem.readFile(normalizedPath, 'utf-8') as string;
      const stat = await this.fileSystem.getStats(normalizedPath);

      const dependencies = await this.dependencyExtractor.extractDependencies(
        content,
        normalizedPath,
        root
      );

      const result: FileDependencies = {
        filePath: normalizedPath,
        dependencies,
        lastModified: stat.modifiedTime
      };

      // 更新快取（MemoryCache 自動處理 LRU 淘汰）
      this.cache.set(normalizedPath, {
        data: result,
        lastModified: stat.modifiedTime,
        size: stat.size
      });

      // 更新依賴圖
      this.updateDependencyGraph(result);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`無法分析檔案 ${filePath}: ${String(error)}`);
    }
  }

  /**
   * 分析整個專案的依賴關係
   * @param projectPath 專案路徑
   * @returns 專案依賴資訊
   */
  async analyzeProject(projectPath: string): Promise<ProjectDependencies> {
    const normalizedProjectPath = path.resolve(projectPath);
    const files = await this.fileScanner.findSourceFiles(normalizedProjectPath);
    const currentProjectFiles = new Set(files.map(file => path.resolve(file)));

    // 清除上一次掃描到、但這次已不在專案檔案清單中的節點（例如檔案被刪除或排除）。
    // 只比對「上一輪第一層專案檔案集合」而非目前圖上所有節點，避免誤刪依賴目標節點
    // （如 addDependency 建立的匯入路徑節點，本就不屬於被掃描的專案檔案）。
    if (this.previousProjectFiles) {
      for (const staleFile of this.previousProjectFiles) {
        if (!currentProjectFiles.has(staleFile)) {
          this.graph.removeNode(staleFile);
          this.runtimeGraph.removeNode(staleFile);
          this.cache.delete(staleFile);
        }
      }
    }

    const fileDependencies: FileDependencies[] = [];

    // 並行分析檔案（根據 concurrency 設定）
    const concurrency = this.options.concurrency || 4;
    const chunks = this.chunkArray(files, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(file => this.analyzeFile(file, normalizedProjectPath));
      const results = await Promise.all(promises);
      fileDependencies.push(...results);
    }

    this.previousProjectFiles = currentProjectFiles;

    const result: ProjectDependencies = {
      projectPath: normalizedProjectPath,
      fileDependencies,
      analyzedAt: new Date()
    };

    return result;
  }

  /**
   * 取得檔案的直接依賴
   * @param filePath 檔案路徑
   * @returns 依賴列表
   */
  getDependencies(filePath: string): string[] {
    const normalizedPath = path.resolve(filePath);
    return this.graph.getDependencies(normalizedPath);
  }

  /**
   * 取得檔案的直接依賴者
   * @param filePath 檔案路徑
   * @returns 依賴者列表
   */
  getDependents(filePath: string): string[] {
    const normalizedPath = path.resolve(filePath);
    return this.graph.getDependents(normalizedPath);
  }

  /**
   * 取得檔案的傳遞依賴
   * @param filePath 檔案路徑
   * @param options 查詢選項
   * @returns 傳遞依賴列表
   */
  getTransitiveDependencies(
    filePath: string,
    options?: DependencyQueryOptions
  ): string[] {
    const normalizedPath = path.resolve(filePath);
    const opts = this.getDefaultQueryOptions(options);

    return this.graph.getTransitiveDependencies(normalizedPath, opts.maxDepth);
  }

  /**
   * 取得檔案變更的影響範圍
   * @param filePath 檔案路徑
   * @returns 受影響的檔案列表
   */
  getImpactedFiles(filePath: string): string[] {
    const normalizedPath = path.resolve(filePath);
    return this.graph.getTransitiveDependents(normalizedPath);
  }

  /**
   * 取得詳細的影響分析結果
   * @param filePath 檔案路徑
   * @returns 影響分析結果
   */
  getImpactAnalysis(filePath: string): ImpactAnalysisResult {
    const normalizedPath = path.resolve(filePath);
    const directlyAffected = this.getDependents(normalizedPath);
    const transitivelyAffected = this.graph.getTransitiveDependents(normalizedPath);
    const affectedTests = this.getAffectedTests(normalizedPath);

    // 計算影響分數
    const impactScore = this.calculateImpactScore(
      directlyAffected.length,
      transitivelyAffected.length,
      affectedTests.length
    );

    return {
      targetFile: normalizedPath,
      directlyAffected,
      transitivelyAffected,
      affectedTests,
      impactScore
    };
  }

  /**
   * 取得受影響的測試檔案
   * @param filePath 檔案路徑
   * @returns 測試檔案列表
   */
  getAffectedTests(filePath: string): string[] {
    const normalizedPath = path.resolve(filePath);
    const allAffected = [normalizedPath, ...this.getImpactedFiles(normalizedPath)];
    const testFiles = new Set<string>(); // 使用 Set 直接收集，避免最後去重

    for (const affectedFile of allAffected) {
      // 找出直接測試此檔案的測試檔案
      const dependents = this.getDependents(affectedFile);
      for (const dep of dependents) {
        if (this.fileScanner.isTestFile(dep)) {
          testFiles.add(dep);
        }
      }
    }

    return [...testFiles];
  }

  /**
   * 取得依賴統計資訊
   * @returns 統計資訊
   */
  getStats(): DependencyStats {
    const allNodes = this.graph.getAllNodes();
    const totalFiles = allNodes.length;
    const totalDependencies = this.graph.getEdgeCount();

    // 使用 graph 內部資料直接計算最大依賴數，避免重複呼叫 getDependencies()
    let maxDependencies = 0;
    for (const node of allNodes) {
      const depsCount = this.graph.getDependencies(node).length;
      if (depsCount > maxDependencies) {
        maxDependencies = depsCount;
      }
    }

    const averageDependencies = totalFiles > 0 ? totalDependencies / totalFiles : 0;
    // 循環偵測用 runtimeGraph（排除 type-only imports），避免 type-only 循環誤報為循環依賴
    const cycles = this.cycleDetector.detectCycles(this.runtimeGraph);
    const orphanedNodes = this.graph.getOrphanedNodes();

    return {
      totalFiles,
      totalDependencies,
      averageDependenciesPerFile: Math.round(averageDependencies * 100) / 100,
      maxDependenciesInFile: maxDependencies,
      circularDependencies: cycles.length,
      orphanedFiles: orphanedNodes.length
    };
  }

  /**
   * 取得完整依賴圖（含 type-only imports，供影響分析使用）
   * @returns 依賴圖實例
   */
  getGraph(): DependencyGraph {
    return this.graph;
  }

  /**
   * 取得 runtime-only 依賴圖（排除 type-only imports，供 cycle 偵測使用）
   * @returns runtime 依賴圖實例
   */
  getRuntimeGraph(): DependencyGraph {
    return this.runtimeGraph;
  }

  /**
   * 更新依賴圖
   * @param fileDependencies 檔案依賴資訊
   */
  private updateDependencyGraph(fileDependencies: FileDependencies): void {
    const { filePath, dependencies } = fileDependencies;

    // 更新完整圖（含 type-only imports）
    this.graph.addNode(filePath);
    const oldDeps = this.graph.getDependencies(filePath);
    for (const oldDep of oldDeps) {
      this.graph.removeDependency(filePath, oldDep);
    }
    for (const dep of dependencies) {
      this.graph.addDependency(filePath, dep.path);
    }

    // 更新 runtime-only 圖（排除 type-only imports，供 cycle 偵測使用）
    this.runtimeGraph.addNode(filePath);
    const oldRuntimeDeps = this.runtimeGraph.getDependencies(filePath);
    for (const oldDep of oldRuntimeDeps) {
      this.runtimeGraph.removeDependency(filePath, oldDep);
    }
    for (const dep of dependencies) {
      if (!dep.isTypeOnly) {
        this.runtimeGraph.addDependency(filePath, dep.path);
      }
    }
  }

  /**
   * 計算影響分數
   * @param directAffected 直接影響數量
   * @param transitiveAffected 傳遞影響數量
   * @param testAffected 測試影響數量
   * @returns 影響分數
   */
  private calculateImpactScore(
    directAffected: number,
    transitiveAffected: number,
    testAffected: number
  ): number {
    return directAffected * 3 + transitiveAffected + testAffected * 0.5;
  }

  /**
   * 將陣列分塊
   * @param array 原陣列
   * @param size 塊大小
   * @returns 分塊後的陣列
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 建立預設分析選項
   * @returns 預設選項
   */
  private createDefaultAnalysisOptions(sourceFileExtensions: readonly string[]): ExtendedDependencyAnalysisOptions {
    return {
      includeNodeModules: false,
      followSymlinks: true,
      maxDepth: 100,
      excludePatterns: ['node_modules', '.git', 'dist', 'build'],
      includePatterns: sourceFileExtensions.map(extension => `**/*${extension}`),
      concurrency: 4,
      sourceFileExtensions
    };
  }

  /**
   * 取得預設查詢選項
   * @param options 使用者選項
   * @returns 合併後的選項
   */
  private getDefaultQueryOptions(options?: DependencyQueryOptions): DependencyQueryOptions {
    return {
      includeTransitive: false,
      maxDepth: 10,
      direction: 'dependencies',
      ...options
    };
  }

}
