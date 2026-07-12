/**
 * 依賴圖實作
 * 提供有向圖資料結構來表示檔案間的依賴關係
 */

import { DependencyType } from '@shared/types/index.js';
import type {
  DependencyNode,
  DependencyEdge,
  TopologicalSortResult,
  SerializedGraph
} from './types.js';

/** 傳遞依賴快取的最大容量 */
const TRANSITIVE_CACHE_MAX_SIZE = 500;

/**
 * 依賴圖類別
 * 使用鄰接列表實作有向圖
 */
export class DependencyGraph {
  private adjacencyList: Map<string, Set<string>> = new Map();
  private reverseAdjacencyList: Map<string, Set<string>> = new Map();
  private nodes: Set<string> = new Set();

  /** 傳遞依賴快取 (getTransitiveDependencies 結果) */
  private transitiveDepCache: Map<string, string[]> = new Map();

  /** 傳遞依賴者快取 (getTransitiveDependents 結果) */
  private transitiveDeptsCache: Map<string, string[]> = new Map();

  /**
   * 建立空的依賴圖
   */
  constructor() {
    this.clear();
  }

  /**
   * 新增節點到圖中
   * @param filePath 檔案路徑
   */
  addNode(filePath: string): void {
    if (!filePath || !filePath.trim()) {
      throw new Error('檔案路徑不能為空');
    }

    if (!this.nodes.has(filePath)) {
      this.nodes.add(filePath);
      this.adjacencyList.set(filePath, new Set());
      this.reverseAdjacencyList.set(filePath, new Set());
    }
  }

  /**
   * 移除節點及其所有相關邊
   * @param filePath 檔案路徑
   */
  removeNode(filePath: string): void {
    if (!this.nodes.has(filePath)) {
      return;
    }

    // 移除所有指向該節點的邊
    const dependents = this.reverseAdjacencyList.get(filePath) || new Set();
    for (const dependent of dependents) {
      this.adjacencyList.get(dependent)?.delete(filePath);
    }

    // 移除該節點指向其他節點的邊
    const dependencies = this.adjacencyList.get(filePath) || new Set();
    for (const dependency of dependencies) {
      this.reverseAdjacencyList.get(dependency)?.delete(filePath);
    }

    // 移除節點
    this.nodes.delete(filePath);
    this.adjacencyList.delete(filePath);
    this.reverseAdjacencyList.delete(filePath);
  }

  /**
   * 新增依賴關係（邊）
   * @param from 依賴源檔案
   * @param to 被依賴檔案
   */
  addDependency(from: string, to: string): void {
    // 自動新增不存在的節點
    this.addNode(from);
    this.addNode(to);

    // addNode 確保節點存在，使用 ?? 作為防禦性程式設計
    const fromDeps = this.adjacencyList.get(from);
    const toReverseDeps = this.reverseAdjacencyList.get(to);
    if (fromDeps && toReverseDeps) {
      fromDeps.add(to);
      toReverseDeps.add(from);
    }

    // 清除受影響的傳遞依賴快取
    this.invalidateTransitiveCaches(from, to);
  }

  /**
   * 移除依賴關係
   * @param from 依賴源檔案
   * @param to 被依賴檔案
   */
  removeDependency(from: string, to: string): void {
    this.adjacencyList.get(from)?.delete(to);
    this.reverseAdjacencyList.get(to)?.delete(from);

    // 清除受影響的傳遞依賴快取
    this.invalidateTransitiveCaches(from, to);
  }

  /**
   * 檢查是否存在節點
   * @param filePath 檔案路徑
   * @returns 是否存在該節點
   */
  hasNode(filePath: string): boolean {
    return this.nodes.has(filePath);
  }

  /**
   * 檢查是否存在依賴關係
   * @param from 依賴源檔案
   * @param to 被依賴檔案
   * @returns 是否存在該依賴關係
   */
  hasDependency(from: string, to: string): boolean {
    return this.adjacencyList.get(from)?.has(to) || false;
  }

  /**
   * 取得節點數量
   * @returns 節點總數
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * 取得邊數量
   * @returns 邊總數
   */
  getEdgeCount(): number {
    let count = 0;
    for (const adjacencySet of this.adjacencyList.values()) {
      count += adjacencySet.size;
    }
    return count;
  }

  /**
   * 檢查圖是否為空
   * @returns 是否為空圖
   */
  isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  /**
   * 取得節點的直接依賴
   * @param filePath 檔案路徑
   * @returns 直接依賴列表
   */
  getDependencies(filePath: string): string[] {
    const dependencies = this.adjacencyList.get(filePath);
    return dependencies ? Array.from(dependencies) : [];
  }

  /**
   * 取得節點的直接依賴者
   * @param filePath 檔案路徑
   * @returns 直接依賴者列表
   */
  getDependents(filePath: string): string[] {
    const dependents = this.reverseAdjacencyList.get(filePath);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * 取得節點的傳遞依賴（未設限時含快取）
   * @param filePath 檔案路徑
   * @param maxDepth 最大遍歷深度，未指定時不設限
   * @returns 傳遞依賴列表
   */
  getTransitiveDependencies(filePath: string, maxDepth?: number): string[] {
    // 只有未設限的結果可使用以檔案路徑為鍵的快取
    if (maxDepth === undefined) {
      const cached = this.transitiveDepCache.get(filePath);
      if (cached) {
        return [...cached];
      }
    }

    const visited = new Set([filePath]);
    const result: string[] = [];
    const queue: Array<{ filePath: string; depth: number }> = [
      { filePath, depth: 0 }
    ];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const { filePath: currentPath, depth } = queue[queueIndex++];
      if (maxDepth !== undefined && depth >= maxDepth) {
        continue;
      }

      const dependencies = this.getDependencies(currentPath);

      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          visited.add(dep);
          result.push(dep);
          queue.push({ filePath: dep, depth: depth + 1 });
        }
      }
    }

    if (maxDepth === undefined) {
      // 寫入快取（LRU 策略：超過上限時清除最舊的項目）
      this.setCacheWithEviction(this.transitiveDepCache, filePath, result);
    }

    return result;
  }

  /**
   * 取得節點的傳遞依賴者（含快取）
   * @param filePath 檔案路徑
   * @returns 傳遞依賴者列表
   */
  getTransitiveDependents(filePath: string): string[] {
    // 檢查快取
    const cached = this.transitiveDeptsCache.get(filePath);
    if (cached) {
      return [...cached];
    }

    const visited = new Set<string>();
    visited.add(filePath);
    const result: string[] = [];

    const dfs = (currentPath: string) => {
      const dependents = this.getDependents(currentPath);

      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          visited.add(dependent);
          result.push(dependent);
          dfs(dependent);
        }
      }
    };

    dfs(filePath);

    // 寫入快取（LRU 策略：超過上限時清除最舊的項目）
    this.setCacheWithEviction(this.transitiveDeptsCache, filePath, result);

    return result;
  }

  /**
   * 取得節點資訊
   * @param filePath 檔案路徑
   * @returns 節點資訊或 undefined
   */
  getNodeInfo(filePath: string): DependencyNode | undefined {
    if (!this.hasNode(filePath)) {
      return undefined;
    }

    const dependencies = this.getDependencies(filePath);
    const dependents = this.getDependents(filePath);

    return {
      filePath,
      inDegree: dependents.length,
      outDegree: dependencies.length,
      dependencies,
      dependents
    };
  }

  /**
   * 拓撲排序
   * @returns 排序結果，包含是否有循環
   */
  topologicalSort(): TopologicalSortResult {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    // 初始化入度
    for (const node of this.nodes) {
      inDegree.set(node, this.getDependents(node).length);
      if (inDegree.get(node) === 0) {
        queue.push(node);
      }
    }

    // Kahn's 算法
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }
      result.push(current);

      const dependencies = this.getDependencies(current);
      for (const dep of dependencies) {
        const currentDegree = inDegree.get(dep) ?? 0;
        const newInDegree = currentDegree - 1;
        inDegree.set(dep, newInDegree);

        if (newInDegree === 0) {
          queue.push(dep);
        }
      }
    }

    // 檢查是否有循環
    const hasCycle = result.length !== this.nodes.size;
    let cycleFiles: string[] | undefined;

    if (hasCycle) {
      const resultSet = new Set(result);
      cycleFiles = Array.from(this.nodes).filter(node => !resultSet.has(node));
    }

    return {
      sortedFiles: result,
      hasCycle,
      cycleFiles
    };
  }

  /**
   * 取得所有節點
   * @returns 節點列表
   */
  getAllNodes(): string[] {
    return Array.from(this.nodes);
  }

  /**
   * 取得所有邊
   * @returns 邊列表
   */
  getAllEdges(): DependencyEdge[] {
    const edges: DependencyEdge[] = [];

    for (const [from, dependencies] of this.adjacencyList) {
      for (const to of dependencies) {
        edges.push({
          from,
          to,
          weight: 1, // 預設權重
          dependencyType: DependencyType.Import
        });
      }
    }

    return edges;
  }

  /**
   * 檢查圖是否連通（弱連通）
   * @returns 是否連通
   */
  isConnected(): boolean {
    if (this.nodes.size === 0) {
      return true;
    }

    const visited = new Set<string>();
    const queue: string[] = [];

    // 從第一個節點開始 BFS
    const startNode = this.nodes.values().next().value;
    if (!startNode) {return true;} // 空圖被認為是連通的

    queue.push(startNode);
    visited.add(startNode);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      // 檢查所有相鄰節點（雙向）
      const dependencies = this.getDependencies(current);
      const dependents = this.getDependents(current);

      const neighbors = [...dependencies, ...dependents];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return visited.size === this.nodes.size;
  }

  /**
   * 找出孤立節點（沒有任何依賴關係的節點）
   * @returns 孤立節點列表
   */
  getOrphanedNodes(): string[] {
    const orphaned: string[] = [];

    for (const node of this.nodes) {
      const inDegree = this.getDependents(node).length;
      const outDegree = this.getDependencies(node).length;

      if (inDegree === 0 && outDegree === 0) {
        // 完全孤立的節點
        orphaned.push(node);
      }
    }

    return orphaned;
  }

  /**
   * 序列化圖為 JSON 格式
   * @returns 序列化後的圖資料
   */
  serialize(): SerializedGraph {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges().map(edge => ({
        from: edge.from,
        to: edge.to,
        weight: edge.weight
      })),
      metadata: {
        nodeCount: this.getNodeCount(),
        edgeCount: this.getEdgeCount(),
        serializedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 從序列化資料重建圖
   * @param data 序列化的圖資料
   * @returns 重建的圖實例
   */
  static deserialize(data: SerializedGraph): DependencyGraph {
    if (!data.nodes || !Array.isArray(data.nodes) ||
        !data.edges || !Array.isArray(data.edges)) {
      throw new Error('無效的序列化資料格式');
    }

    const graph = new DependencyGraph();

    // 新增所有節點
    for (const node of data.nodes) {
      graph.addNode(node);
    }

    // 新增所有邊
    for (const edge of data.edges) {
      if (!edge.from || !edge.to) {
        throw new Error('邊資料格式無效');
      }
      graph.addDependency(edge.from, edge.to);
    }

    return graph;
  }

  /**
   * 清空圖
   */
  clear(): void {
    this.nodes.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.transitiveDepCache.clear();
    this.transitiveDeptsCache.clear();
  }

  /**
   * 複製圖（結構複製，避免完整序列化）
   * @returns 圖的深拷貝
   */
  clone(): DependencyGraph {
    const cloned = new DependencyGraph();

    // 複製所有節點
    for (const node of this.nodes) {
      cloned.nodes.add(node);
    }

    // 複製鄰接列表（深拷貝 Set）
    for (const [from, deps] of this.adjacencyList) {
      cloned.adjacencyList.set(from, new Set(deps));
    }

    // 複製反向鄰接列表（深拷貝 Set）
    for (const [to, deps] of this.reverseAdjacencyList) {
      cloned.reverseAdjacencyList.set(to, new Set(deps));
    }

    return cloned;
  }

  // ===== 私有方法：快取管理 =====

  /**
   * 清除受邊變更影響的傳遞依賴快取
   *
   * 當邊 (from -> to) 變更時：
   * - transitiveDepCache：from 及其所有傳遞依賴者的快取需清除
   * - transitiveDeptsCache：to 及其所有傳遞依賴的快取需清除
   *
   * @param from 邊的起點
   * @param to 邊的終點
   */
  private invalidateTransitiveCaches(from: string, to: string): void {
    // 清除 from 節點的傳遞依賴快取
    this.transitiveDepCache.delete(from);

    // 清除所有傳遞依賴者的快取（它們的傳遞依賴會經過 from）
    for (const key of this.transitiveDepCache.keys()) {
      const cached = this.transitiveDepCache.get(key);
      if (cached?.includes(from)) {
        this.transitiveDepCache.delete(key);
      }
    }

    // 清除 to 節點的傳遞依賴者快取
    this.transitiveDeptsCache.delete(to);

    // 清除所有傳遞依賴的快取（它們的傳遞依賴者會經過 to）
    for (const key of this.transitiveDeptsCache.keys()) {
      const cached = this.transitiveDeptsCache.get(key);
      if (cached?.includes(to)) {
        this.transitiveDeptsCache.delete(key);
      }
    }
  }

  /**
   * 帶有 LRU 淘汰策略的快取設定
   * 當快取超過最大容量時，刪除最舊的項目（Map 迭代順序保證 FIFO）
   *
   * @param cache 目標快取 Map
   * @param key 快取鍵
   * @param value 快取值
   */
  private setCacheWithEviction(
    cache: Map<string, string[]>,
    key: string,
    value: string[]
  ): void {
    // 超過上限時，刪除最舊的項目
    if (cache.size >= TRANSITIVE_CACHE_MAX_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
    cache.set(key, value);
  }
}
