/**
 * 依賴關係分析器
 * 分析檔案和專案的依賴關係，提供影響分析和統計功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DependencyGraph } from './dependency-graph.js';
import { CycleDetector } from './cycle-detector.js';
import type {
  FileDependencies,
  ProjectDependencies,
  DependencyStats,
  ImpactAnalysisResult,
  DependencyAnalysisOptions,
  DependencyQueryOptions,
  PathResolutionResult,
  ExtendedDependencyAnalysisOptions
} from './types.js';
import { Dependency, DependencyType } from '../../shared/types/index.js';

/**
 * 快取項目
 */
interface CacheEntry {
  data: FileDependencies;
  lastModified: Date;
}

/**
 * 依賴關係分析器類別
 */
export class DependencyAnalyzer {
  private graph: DependencyGraph;
  private cycleDetector: CycleDetector;
  private cache: Map<string, CacheEntry>;
  private options: ExtendedDependencyAnalysisOptions;

  constructor(options?: Partial<ExtendedDependencyAnalysisOptions>) {
    this.graph = new DependencyGraph();
    this.cycleDetector = new CycleDetector();
    this.cache = new Map();

    // 使用預設選項並合併使用者選項
    const defaultOptions = this.createDefaultAnalysisOptions();
    this.options = { ...defaultOptions, ...options };
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
        const stat = await fs.stat(normalizedPath);
        if (stat.mtime <= cacheEntry.lastModified) {
          return cacheEntry.data;
        }
      } catch {
        // 檔案不存在，從快取中移除
        this.cache.delete(normalizedPath);
      }
    }

    try {
      const content = await fs.readFile(normalizedPath, 'utf-8');
      const stat = await fs.stat(normalizedPath);

      const dependencies = await this.extractDependencies(content, normalizedPath);

      const result: FileDependencies = {
        filePath: normalizedPath,
        dependencies,
        lastModified: stat.mtime
      };

      // 更新快取
      this.cache.set(normalizedPath, {
        data: result,
        lastModified: stat.mtime
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
    const files = await this.findSourceFiles(normalizedProjectPath);

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
    const testFiles: string[] = [];

    for (const affectedFile of allAffected) {
      // 找出直接測試此檔案的測試檔案
      const dependents = this.getDependents(affectedFile);
      const tests = dependents.filter(dep => this.isTestFile(dep));
      testFiles.push(...tests);
    }

    return [...new Set(testFiles)]; // 去重
  }

  /**
   * 取得依賴統計資訊
   * @returns 統計資訊
   */
  getStats(): DependencyStats {
    const allNodes = this.graph.getAllNodes();
    const totalFiles = allNodes.length;
    const totalDependencies = this.graph.getEdgeCount();

    let maxDependencies = 0;
    for (const node of allNodes) {
      const deps = this.getDependencies(node);
      maxDependencies = Math.max(maxDependencies, deps.length);
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
   * 從檔案內容中提取依賴關係
   * @param content 檔案內容
   * @param filePath 檔案路徑
   * @returns 依賴列表
   */
  private async extractDependencies(content: string, filePath: string): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const fileExt = path.extname(filePath);

    try {
      // 簡單的正則表達式解析（實際應該使用 AST）
      let importRegex: RegExp;

      switch (fileExt) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)?\s*from\s+['"`]([^'"`]+)['"`]/g;
        break;
      case '.swift':
        importRegex = /import\s+(\w+)/g;
        break;
      default:
        return dependencies; // 不支援的檔案類型
      }

      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        const resolvedPath = await this.resolvePath(importPath, filePath);

        if (resolvedPath && this.shouldIncludeDependency(resolvedPath.resolvedPath)) {
          dependencies.push({
            path: resolvedPath.resolvedPath, // 使用解析後的絕對路徑
            type: DependencyType.Import,
            isRelative: resolvedPath.isRelative,
            importedSymbols: [] // 簡化實作，實際應該解析 import 語句
          });
        }
      }
    } catch (error) {
      // 解析錯誤，回傳空陣列而不拋出錯誤
      console.warn(`解析檔案 ${filePath} 時發生錯誤:`, error);
    }

    return dependencies;
  }

  /**
   * 解析路徑
   * @param importPath 匯入路徑
   * @param fromFile 來源檔案
   * @returns 解析結果
   */
  private async resolvePath(
    importPath: string,
    fromFile: string
  ): Promise<PathResolutionResult | null> {
    const isRelative = importPath.startsWith('.') || importPath.startsWith('/');
    const fileExt = path.extname(fromFile);

    // Swift 外部依賴（system frameworks）直接回傳模組名稱
    if (!isRelative && fileExt === '.swift') {
      return {
        resolvedPath: importPath, // 保留模組名稱（如 Foundation, UIKit）
        isRelative: false,
        exists: true, // 外部依賴視為存在
        extension: '' // 外部依賴沒有副檔名
      };
    }

    if (!isRelative && !this.options.includeNodeModules) {
      return null; // 忽略 node_modules
    }

    let resolvedPath: string;

    if (isRelative) {
      const dir = path.dirname(fromFile);
      resolvedPath = path.resolve(dir, importPath);

      // 嘗試常見的副檔名
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.swift'];
      let finalPath = resolvedPath;
      let exists = false;

      for (const ext of extensions) {
        const pathWithExt = resolvedPath + ext;
        try {
          await fs.access(pathWithExt);
          finalPath = pathWithExt;
          exists = true;
          break;
        } catch {
          // 繼續嘗試下個副檔名
        }
      }

      return {
        resolvedPath: finalPath,
        isRelative: true,
        exists,
        extension: path.extname(finalPath)
      };
    } else {
      // 非相對路徑（例如 npm 套件）
      return {
        resolvedPath: importPath,
        isRelative: false,
        exists: true, // 假設存在
        extension: ''
      };
    }
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
   * 找出專案中的原始檔案
   * @param projectPath 專案路徑（可以是檔案或目錄）
   * @returns 檔案路徑列表
   */
  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];

    // 檢查路徑是檔案還是目錄
    try {
      const stat = await fs.stat(projectPath);

      // 如果是檔案，直接返回該檔案
      if (stat.isFile()) {
        if (this.isIncluded(projectPath)) {
          return [projectPath];
        }
        return [];
      }

      // 如果不是目錄也不是檔案，返回空陣列
      if (!stat.isDirectory()) {
        return [];
      }
    } catch (error) {
      // 路徑不存在或無法訪問
      return [];
    }

    const traverse = async (dir: string, depth = 0) => {
      if (depth > this.options.maxDepth) {
        return;
      }

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // 檢查排除模式
          if (this.isExcluded(fullPath)) {
            continue;
          }

          if (entry.isDirectory()) {
            await traverse(fullPath, depth + 1);
          } else if (entry.isFile() && this.isIncluded(fullPath)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`無法讀取目錄 ${dir}:`, error);
      }
    };

    await traverse(projectPath);
    return files;
  }

  /**
   * 檢查檔案是否應該被排除
   * @param filePath 檔案路徑
   * @returns 是否排除
   */
  private isExcluded(filePath: string): boolean {
    return this.options.excludePatterns.some(pattern => {
      return filePath.includes(pattern) || this.matchGlob(filePath, pattern);
    });
  }

  /**
   * 檢查檔案是否應該被包含
   * @param filePath 檔案路徑
   * @returns 是否包含
   */
  private isIncluded(filePath: string): boolean {
    return this.options.includePatterns.some(pattern => {
      return this.matchGlob(filePath, pattern);
    });
  }

  /**
   * 簡單的 glob 模式匹配
   * @param filePath 檔案路徑
   * @param pattern glob 模式
   * @returns 是否匹配
   */
  private matchGlob(filePath: string, pattern: string): boolean {
    // 簡化實作，實際應該使用專業的 glob 函式庫
    // ** 匹配任意層級目錄 (包含 0 層)
    // * 匹配單層目錄或檔名中的任意字元（不包含 /）
    // ? 匹配單一字元

    // 將 ** 替換為特殊標記，避免與 * 衝突
    let regexPattern = pattern.replace(/\*\*/g, '<!DOUBLE_STAR!>');

    // 替換單個 *
    regexPattern = regexPattern.replace(/\*/g, '[^/]*');

    // 替換 **（之前的特殊標記）為匹配任意路徑
    regexPattern = regexPattern.replace(/<!DOUBLE_STAR!>/g, '.*');

    // 替換 ?
    regexPattern = regexPattern.replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * 檢查是否應該包含此依賴
   * @param resolvedPath 解析後的路徑
   * @returns 是否包含
   */
  private shouldIncludeDependency(resolvedPath: string): boolean {
    if (!this.options.includeNodeModules && resolvedPath.includes('node_modules')) {
      return false;
    }

    return !this.isExcluded(resolvedPath);
  }

  /**
   * 檢查是否為測試檔案
   * @param filePath 檔案路徑
   * @returns 是否為測試檔案
   */
  private isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return fileName.includes('.test.') ||
           fileName.includes('.spec.') ||
           filePath.includes('__tests__') ||
           filePath.includes('/test/') ||
           filePath.includes('/tests/');
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
      includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.swift'],
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