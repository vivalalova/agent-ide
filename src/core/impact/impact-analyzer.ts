/**
 * 影響分析器
 * 分析檔案變更的影響範圍，提供依賴追蹤和統計功能
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { DependencyGraph } from '@core/foundations/dependency-graph/index.js';
import { CycleDetector } from '@core/cycles/index.js';
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
}

/**
 * 影響分析器類別
 */
export class ImpactAnalyzer {
  private graph: DependencyGraph;
  private cycleDetector: CycleDetector;
  private cache: MemoryCache<string, CacheEntry>;
  private options: ExtendedDependencyAnalysisOptions;
  private fileSystem: IFileSystem;
  private pathResolver: PathResolver;
  private fileScanner: FileScanner;
  private dependencyExtractor: DependencyExtractor;

  constructor(fileSystem: IFileSystem, options?: Partial<ExtendedDependencyAnalysisOptions>) {
    this.graph = new DependencyGraph();
    this.cycleDetector = new CycleDetector();
    this.cache = createLRUCache<string, CacheEntry>(1000);
    this.fileSystem = fileSystem;

    // 使用預設選項並合併使用者選項
    const defaultOptions = this.createDefaultAnalysisOptions();
    this.options = { ...defaultOptions, ...options };

    // 初始化子模組
    this.pathResolver = new PathResolver(fileSystem, this.options);
    this.fileScanner = new FileScanner(fileSystem, this.options);
    this.dependencyExtractor = new DependencyExtractor(
      this.options,
      this.pathResolver,
      this.fileScanner
    );
  }

  /**
   * 分析單個檔案的依賴關係
   * @param filePath 檔案路徑
   * @returns 檔案依賴資訊
   */
  async analyzeFile(filePath: string): Promise<FileDependencies> {
    if (!filePath || !filePath.trim()) {
      throw new Error('檔案路徑不能為空');
    }

    const normalizedPath = path.resolve(filePath);

    // 檢查快取
    const cacheEntry = this.cache.get(normalizedPath);
    if (cacheEntry) {
      try {
        const stat = await this.fileSystem.getStats(normalizedPath);
        if (stat.modifiedTime <= cacheEntry.lastModified) {
          // MemoryCache 自動更新 lastAccessedAt
          return cacheEntry.data;
        }
      } catch {
        // 檔案不存在，從快取中移除
        this.cache.delete(normalizedPath);
      }
    }

    try {
      const content = await this.fileSystem.readFile(normalizedPath, 'utf-8') as string;
      const stat = await this.fileSystem.getStats(normalizedPath);

      const dependencies = await this.dependencyExtractor.extractDependencies(
        content,
        normalizedPath
      );

      const result: FileDependencies = {
        filePath: normalizedPath,
        dependencies,
        lastModified: stat.modifiedTime
      };

      // 更新快取（MemoryCache 自動處理 LRU 淘汰）
      this.cache.set(normalizedPath, {
        data: result,
        lastModified: stat.modifiedTime
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

    const fileDependencies: FileDependencies[] = [];

    // 並行分析檔案（根據 concurrency 設定）
    const concurrency = this.options.concurrency || 4;
    const chunks = this.chunkArray(files, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(file => this.analyzeFile(file));
      const results = await Promise.all(promises);
      fileDependencies.push(...results);
    }

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

    if (opts.maxDepth === 1) {
      return this.getDependencies(normalizedPath);
    }

    return this.graph.getTransitiveDependencies(normalizedPath);
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
    const cycles = this.cycleDetector.detectCycles(this.graph);
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
   * 取得依賴圖
   * @returns 依賴圖實例
   */
  getGraph(): DependencyGraph {
    return this.graph;
  }

  /**
   * 更新依賴圖
   * @param fileDependencies 檔案依賴資訊
   */
  private updateDependencyGraph(fileDependencies: FileDependencies): void {
    const { filePath, dependencies } = fileDependencies;

    // 新增節點
    this.graph.addNode(filePath);

    // 清除舊的依賴關係
    const oldDeps = this.graph.getDependencies(filePath);
    for (const oldDep of oldDeps) {
      this.graph.removeDependency(filePath, oldDep);
    }

    // 新增新的依賴關係
    for (const dep of dependencies) {
      // dep.path 現在已經是解析後的絕對路徑
      this.graph.addDependency(filePath, dep.path);
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
  private createDefaultAnalysisOptions(): ExtendedDependencyAnalysisOptions {
    return {
      includeNodeModules: false,
      followSymlinks: true,
      maxDepth: 100,
      excludePatterns: ['node_modules', '.git', 'dist', 'build'],
      includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
      concurrency: 4
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
