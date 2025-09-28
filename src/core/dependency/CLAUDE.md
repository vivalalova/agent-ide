# Dependency 模組開發規範

## 實作狀態 ✅

### 實際檔案結構
```
dependency/
├── index.ts                    ✅ 模組入口
├── dependency-analyzer.ts      ✅ 依賴分析器
├── dependency-graph.ts         ✅ 依賴關係圖
├── cycle-detector.ts           ✅ 循環依賴檢測
├── types.ts                    ✅ 型別定義
└── 其他進階功能              ⏳ 待實作
```

### 實作功能狀態
- ✅ 依賴分析核心功能
- ✅ 依賴關係圖建立
- ✅ 循環依賴檢測
- ✅ 基本型別定義
- ⏳ 影響範圍分析
- ⏳ 架構穩定性分析
- ⏳ 模組化建議

## 模組職責
建構和分析程式碼依賴關係圖，提供循環依賴檢測、影響範圍分析和架構優化建議。

## 開發原則

### 1. 圖論基礎
- **正確性優先**：圖結構必須準確反映實際依賴
- **效能考量**：使用高效的圖演算法
- **記憶體效率**：避免圖結構過度膨脹
- **增量更新**：支援局部圖更新

### 2. 分析深度
- 直接依賴分析
- 傳遞依賴追蹤
- 循環依賴檢測
- 依賴強度評估

### 3. 實用性
- 提供可操作的建議
- 支援多種視圖
- 整合開發工作流
- 即時更新反饋

## 實作規範

### 檔案結構
```
dependency/
├── index.ts                 # 模組入口
├── service.ts               # DependencyService 實作
├── graph/
│   ├── dependency-graph.ts      # 依賴圖資料結構
│   ├── graph-builder.ts         # 圖構建器
│   └── graph-algorithms.ts      # 圖演算法
├── analyzers/
│   ├── cycle-detector.ts        # 循環檢測
│   ├── impact-analyzer.ts       # 影響分析
│   └── stability-analyzer.ts    # 穩定性分析
├── extractors/
│   ├── import-extractor.ts      # Import 提取
│   └── reference-extractor.ts   # 引用提取
└── types.ts                 # 型別定義
```

### 圖資料結構
```typescript
class DependencyGraph {
  // 使用鄰接表表示
  private adjacencyList: Map<NodeId, Set<NodeId>>;

  // 節點元資料
  private nodes: Map<NodeId, NodeMetadata>;

  // 邊元資料
  private edges: Map<EdgeId, EdgeMetadata>;

  // 快速查詢索引
  private reverseIndex: Map<NodeId, Set<NodeId>>; // 反向依賴
  private typeIndex: Map<DependencyType, Set<EdgeId>>; // 按類型索引

  // 圖操作
  addNode(node: Node): void;
  addEdge(from: NodeId, to: NodeId, metadata: EdgeMetadata): void;
  removeNode(nodeId: NodeId): void;
  removeEdge(from: NodeId, to: NodeId): void;

  // 圖查詢
  getOutgoingEdges(nodeId: NodeId): Edge[];
  getIncomingEdges(nodeId: NodeId): Edge[];
  getPath(from: NodeId, to: NodeId): Path | null;
  getAllPaths(from: NodeId, to: NodeId): Path[];
}
```

## 循環依賴檢測

### Tarjan 演算法實作
```typescript
class TarjanCycleDetector {
  private index = 0;
  private stack: NodeId[] = [];
  private indices = new Map<NodeId, number>();
  private lowlinks = new Map<NodeId, number>();
  private onStack = new Set<NodeId>();
  private sccs: NodeId[][] = [];

  detectCycles(graph: DependencyGraph): Cycle[] {
    // 找出所有強連通分量
    for (const node of graph.getNodes()) {
      if (!this.indices.has(node.id)) {
        this.strongConnect(node);
      }
    }

    // 過濾出包含循環的分量
    return this.sccs
      .filter(scc => scc.length > 1 || this.hasSelfLoop(scc[0]))
      .map(scc => this.createCycle(scc));
  }

  private strongConnect(node: Node): void {
    this.indices.set(node.id, this.index);
    this.lowlinks.set(node.id, this.index);
    this.index++;
    this.stack.push(node.id);
    this.onStack.add(node.id);

    // 遍歷後繼節點
    for (const successor of node.successors) {
      if (!this.indices.has(successor)) {
        this.strongConnect(successor);
        this.lowlinks.set(
          node.id,
          Math.min(this.lowlinks.get(node.id)!, this.lowlinks.get(successor)!)
        );
      } else if (this.onStack.has(successor)) {
        this.lowlinks.set(
          node.id,
          Math.min(this.lowlinks.get(node.id)!, this.indices.get(successor)!)
        );
      }
    }

    // 找到強連通分量的根
    if (this.lowlinks.get(node.id) === this.indices.get(node.id)) {
      const scc: NodeId[] = [];
      let w: NodeId;
      do {
        w = this.stack.pop()!;
        this.onStack.delete(w);
        scc.push(w);
      } while (w !== node.id);
      this.sccs.push(scc);
    }
  }
}
```

### 循環破解策略
```typescript
class CycleBreaker {
  // 分析循環並提供破解建議
  suggestBreaking(cycle: Cycle): BreakingSuggestion[] {
    const suggestions: BreakingSuggestion[] = [];

    // 1. 找出最弱的依賴
    const weakestEdge = this.findWeakestEdge(cycle);
    suggestions.push({
      type: 'remove',
      edge: weakestEdge,
      impact: 'low'
    });

    // 2. 依賴反轉
    const invertibleEdge = this.findInvertibleEdge(cycle);
    if (invertibleEdge) {
      suggestions.push({
        type: 'invert',
        edge: invertibleEdge,
        impact: 'medium'
      });
    }

    // 3. 引入介面
    const interfacePoint = this.findInterfacePoint(cycle);
    suggestions.push({
      type: 'introduce-interface',
      point: interfacePoint,
      impact: 'low'
    });

    return this.rankSuggestions(suggestions);
  }
}
```

## 影響範圍分析

### 影響傳播演算法
```typescript
class ImpactAnalyzer {
  // 分析變更的影響範圍
  analyzeImpact(
    changedNode: NodeId,
    changeType: ChangeType,
    graph: DependencyGraph
  ): ImpactAnalysis {
    const directImpact = new Set<NodeId>();
    const indirectImpact = new Set<NodeId>();
    const visited = new Set<NodeId>();

    // BFS 遍歷依賴者
    const queue: Array<{ node: NodeId; level: number }> = [
      { node: changedNode, level: 0 }
    ];

    while (queue.length > 0) {
      const { node, level } = queue.shift()!;

      if (visited.has(node)) continue;
      visited.add(node);

      // 獲取依賴此節點的所有節點
      const dependents = graph.getIncomingEdges(node);

      for (const dependent of dependents) {
        if (level === 0) {
          directImpact.add(dependent.from);
        } else {
          indirectImpact.add(dependent.from);
        }

        // 根據變更類型決定是否繼續傳播
        if (this.shouldPropagate(changeType, dependent)) {
          queue.push({ node: dependent.from, level: level + 1 });
        }
      }
    }

    return {
      directImpact: Array.from(directImpact),
      indirectImpact: Array.from(indirectImpact),
      riskLevel: this.assessRisk(directImpact.size, indirectImpact.size)
    };
  }
}
```

## 架構分析

### 分層檢測
```typescript
class LayerAnalyzer {
  // 檢測架構層級違規
  detectViolations(
    graph: DependencyGraph,
    layers: LayerDefinition[]
  ): Violation[] {
    const violations: Violation[] = [];

    for (const edge of graph.getAllEdges()) {
      const fromLayer = this.getLayer(edge.from, layers);
      const toLayer = this.getLayer(edge.to, layers);

      if (!this.isAllowedDependency(fromLayer, toLayer, layers)) {
        violations.push({
          type: 'layer-violation',
          from: edge.from,
          to: edge.to,
          fromLayer,
          toLayer,
          severity: this.calculateSeverity(fromLayer, toLayer)
        });
      }
    }

    return violations;
  }

  // 建議層級結構
  suggestLayers(graph: DependencyGraph): LayerSuggestion {
    // 使用拓撲排序找出自然層級
    const layers = this.topologicalLayers(graph);

    return {
      layers,
      score: this.calculateLayerScore(layers, graph),
      improvements: this.suggestImprovements(layers, graph)
    };
  }
}
```

### 模組化分析
```typescript
class ModularityAnalyzer {
  // 計算模組內聚度
  calculateCohesion(module: Module, graph: DependencyGraph): number {
    const internalEdges = this.countInternalEdges(module, graph);
    const totalPossible = module.nodes.length * (module.nodes.length - 1);
    return totalPossible > 0 ? internalEdges / totalPossible : 1;
  }

  // 計算模組耦合度
  calculateCoupling(module: Module, graph: DependencyGraph): number {
    const externalEdges = this.countExternalEdges(module, graph);
    const totalEdges = this.countTotalEdges(module, graph);
    return totalEdges > 0 ? externalEdges / totalEdges : 0;
  }

  // 建議模組邊界
  suggestModuleBoundaries(graph: DependencyGraph): ModuleSuggestion[] {
    // 使用社群檢測演算法
    const communities = this.detectCommunities(graph);

    return communities.map(community => ({
      nodes: community.nodes,
      cohesion: this.calculateCohesion(community, graph),
      coupling: this.calculateCoupling(community, graph),
      name: this.suggestModuleName(community)
    }));
  }
}
```

## 度量計算

### 穩定性指標
```typescript
class StabilityCalculator {
  // 計算穩定性指標 (Robert C. Martin)
  calculateStability(nodeId: NodeId, graph: DependencyGraph): number {
    const fanIn = graph.getIncomingEdges(nodeId).length;
    const fanOut = graph.getOutgoingEdges(nodeId).length;

    // I = FanOut / (FanIn + FanOut)
    // 0 = 最穩定, 1 = 最不穩定
    return (fanIn + fanOut) > 0 ? fanOut / (fanIn + fanOut) : 0;
  }

  // 計算抽象性指標
  calculateAbstractness(nodeId: NodeId, metadata: NodeMetadata): number {
    const totalMembers = metadata.classes + metadata.interfaces + metadata.functions;
    const abstractMembers = metadata.interfaces + metadata.abstractClasses;

    // A = Abstract / Total
    return totalMembers > 0 ? abstractMembers / totalMembers : 0;
  }

  // 計算與主序列的距離
  calculateDistance(nodeId: NodeId, graph: DependencyGraph): number {
    const stability = this.calculateStability(nodeId, graph);
    const abstractness = this.calculateAbstractness(nodeId, metadata);

    // D = |A + I - 1|
    // 0 = 在主序列上, 1 = 最遠
    return Math.abs(abstractness + stability - 1);
  }
}
```

## 效能優化

### 增量更新
```typescript
class IncrementalGraphUpdater {
  // 增量更新依賴圖
  updateIncremental(
    graph: DependencyGraph,
    changes: FileChange[]
  ): UpdateResult {
    const affected = new Set<NodeId>();

    for (const change of changes) {
      switch (change.type) {
        case 'added':
          this.handleAddition(graph, change);
          break;
        case 'modified':
          this.handleModification(graph, change);
          break;
        case 'deleted':
          this.handleDeletion(graph, change);
          break;
      }

      affected.add(change.file);
    }

    // 只重新分析受影響的部分
    this.reanalyzeAffected(graph, affected);

    return { affected: Array.from(affected) };
  }
}
```

### 快取策略
```typescript
class DependencyCache {
  private pathCache = new LRUCache<string, Path[]>(1000);
  private cycleCache = new Map<GraphHash, Cycle[]>();
  private metricsCache = new Map<NodeId, Metrics>();

  // 智能快取失效
  invalidate(change: GraphChange): void {
    // 只失效受影響的路徑
    for (const [key, paths] of this.pathCache.entries()) {
      if (this.isAffectedPath(paths, change)) {
        this.pathCache.delete(key);
      }
    }

    // 循環可能改變，清空循環快取
    if (change.type === 'edge') {
      this.cycleCache.clear();
    }

    // 只更新受影響節點的度量
    this.invalidateMetrics(change.affectedNodes);
  }
}
```

## 視覺化支援

### 圖形輸出
```typescript
class GraphVisualizer {
  // 生成 DOT 格式
  toDot(graph: DependencyGraph, options?: VisualizationOptions): string {
    const dot = ['digraph Dependencies {'];

    // 節點樣式
    for (const node of graph.getNodes()) {
      const style = this.getNodeStyle(node, options);
      dot.push(`  "${node.id}" [${style}];`);
    }

    // 邊樣式
    for (const edge of graph.getAllEdges()) {
      const style = this.getEdgeStyle(edge, options);
      dot.push(`  "${edge.from}" -> "${edge.to}" [${style}];`);
    }

    dot.push('}');
    return dot.join('\n');
  }

  // 生成 D3.js 資料
  toD3(graph: DependencyGraph): D3GraphData {
    return {
      nodes: graph.getNodes().map(node => ({
        id: node.id,
        group: this.getNodeGroup(node),
        value: this.getNodeValue(node)
      })),
      links: graph.getAllEdges().map(edge => ({
        source: edge.from,
        target: edge.to,
        value: edge.weight
      }))
    };
  }
}
```

## 開發檢查清單

### 功能完整性
- [x] 所有依賴類型支援
- [x] 循環檢測準確
- [ ] 影響分析完整
- [ ] 度量計算正確
- [ ] 優化建議實用

### 效能要求
- [ ] 大型專案支援（10000+ 節點）
- [ ] 增量更新效率
- [ ] 記憶體使用合理
- [ ] 查詢響應快速