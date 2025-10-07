/**
 * 依賴圖實作
 * 提供有向圖資料結構來表示檔案間的依賴關係
 */
/**
 * 依賴圖類別
 * 使用鄰接列表實作有向圖
 */
export class DependencyGraph {
    adjacencyList = new Map();
    reverseAdjacencyList = new Map();
    nodes = new Set();
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
    addNode(filePath) {
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
    removeNode(filePath) {
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
    addDependency(from, to) {
        // 自動新增不存在的節點
        this.addNode(from);
        this.addNode(to);
        this.adjacencyList.get(from).add(to);
        this.reverseAdjacencyList.get(to).add(from);
    }
    /**
     * 移除依賴關係
     * @param from 依賴源檔案
     * @param to 被依賴檔案
     */
    removeDependency(from, to) {
        this.adjacencyList.get(from)?.delete(to);
        this.reverseAdjacencyList.get(to)?.delete(from);
    }
    /**
     * 檢查是否存在節點
     * @param filePath 檔案路徑
     * @returns 是否存在該節點
     */
    hasNode(filePath) {
        return this.nodes.has(filePath);
    }
    /**
     * 檢查是否存在依賴關係
     * @param from 依賴源檔案
     * @param to 被依賴檔案
     * @returns 是否存在該依賴關係
     */
    hasDependency(from, to) {
        return this.adjacencyList.get(from)?.has(to) || false;
    }
    /**
     * 取得節點數量
     * @returns 節點總數
     */
    getNodeCount() {
        return this.nodes.size;
    }
    /**
     * 取得邊數量
     * @returns 邊總數
     */
    getEdgeCount() {
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
    isEmpty() {
        return this.nodes.size === 0;
    }
    /**
     * 取得節點的直接依賴
     * @param filePath 檔案路徑
     * @returns 直接依賴列表
     */
    getDependencies(filePath) {
        const dependencies = this.adjacencyList.get(filePath);
        return dependencies ? Array.from(dependencies) : [];
    }
    /**
     * 取得節點的直接依賴者
     * @param filePath 檔案路徑
     * @returns 直接依賴者列表
     */
    getDependents(filePath) {
        const dependents = this.reverseAdjacencyList.get(filePath);
        return dependents ? Array.from(dependents) : [];
    }
    /**
     * 取得節點的傳遞依賴
     * @param filePath 檔案路徑
     * @returns 傳遞依賴列表
     */
    getTransitiveDependencies(filePath) {
        const visited = new Set();
        const result = [];
        const dfs = (currentPath) => {
            const dependencies = this.getDependencies(currentPath);
            for (const dep of dependencies) {
                if (!visited.has(dep)) {
                    visited.add(dep);
                    result.push(dep);
                    dfs(dep);
                }
            }
        };
        dfs(filePath);
        return result;
    }
    /**
     * 取得節點的傳遞依賴者
     * @param filePath 檔案路徑
     * @returns 傳遞依賴者列表
     */
    getTransitiveDependents(filePath) {
        const visited = new Set();
        const result = [];
        const dfs = (currentPath) => {
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
        return result;
    }
    /**
     * 取得節點資訊
     * @param filePath 檔案路徑
     * @returns 節點資訊或 undefined
     */
    getNodeInfo(filePath) {
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
    topologicalSort() {
        const inDegree = new Map();
        const queue = [];
        const result = [];
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
            result.push(current);
            const dependencies = this.getDependencies(current);
            for (const dep of dependencies) {
                const newInDegree = inDegree.get(dep) - 1;
                inDegree.set(dep, newInDegree);
                if (newInDegree === 0) {
                    queue.push(dep);
                }
            }
        }
        // 檢查是否有循環
        const hasCycle = result.length !== this.nodes.size;
        let cycleFiles;
        if (hasCycle) {
            cycleFiles = Array.from(this.nodes).filter(node => !result.includes(node));
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
    getAllNodes() {
        return Array.from(this.nodes);
    }
    /**
     * 取得所有邊
     * @returns 邊列表
     */
    getAllEdges() {
        const edges = [];
        for (const [from, dependencies] of this.adjacencyList) {
            for (const to of dependencies) {
                edges.push({
                    from,
                    to,
                    weight: 1, // 預設權重
                    dependencyType: 'import' // 預設類型
                });
            }
        }
        return edges;
    }
    /**
     * 檢查圖是否連通（弱連通）
     * @returns 是否連通
     */
    isConnected() {
        if (this.nodes.size === 0) {
            return true;
        }
        const visited = new Set();
        const queue = [];
        // 從第一個節點開始 BFS
        const startNode = this.nodes.values().next().value;
        if (!startNode) {
            return true;
        } // 空圖被認為是連通的
        queue.push(startNode);
        visited.add(startNode);
        while (queue.length > 0) {
            const current = queue.shift();
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
    getOrphanedNodes() {
        const orphaned = [];
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
    serialize() {
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
    static deserialize(data) {
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
    clear() {
        this.nodes.clear();
        this.adjacencyList.clear();
        this.reverseAdjacencyList.clear();
    }
    /**
     * 複製圖
     * @returns 圖的深拷貝
     */
    clone() {
        const serialized = this.serialize();
        return DependencyGraph.deserialize(serialized);
    }
}
//# sourceMappingURL=dependency-graph.js.map