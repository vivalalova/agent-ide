/**
 * 循環依賴檢測器
 * 使用 Tarjan 算法檢測強連通分量和循環依賴
 */
import { calculateCycleSeverity } from './types.js';
/**
 * 循環依賴檢測器類別
 */
export class CycleDetector {
    /**
     * 檢測圖中的所有循環依賴
     * @param graph 依賴圖
     * @param options 檢測選項
     * @returns 循環依賴列表
     */
    detectCycles(graph, options) {
        const opts = this.getDefaultOptions(options);
        if (opts.maxCycleLength <= 0) {
            throw new Error('最大循環長度必須大於 0');
        }
        const stronglyConnectedComponents = this.findStronglyConnectedComponents(graph);
        const cycles = [];
        for (const scc of stronglyConnectedComponents) {
            if (scc.size === 1) {
                // 檢查自迴圈
                const node = scc.nodes[0];
                if (graph.hasDependency(node, node)) {
                    if (!opts.ignoreSelfLoops) {
                        cycles.push({
                            cycle: [node],
                            length: 1,
                            severity: calculateCycleSeverity(1)
                        });
                    }
                }
            }
            else if (scc.size > 1 && scc.size <= opts.maxCycleLength) {
                // 找出 SCC 中的實際循環路徑
                const cyclePaths = this.findCyclePathsInSCC(graph, [...scc.nodes]);
                for (const cyclePath of cyclePaths) {
                    if (cyclePath.length <= opts.maxCycleLength) {
                        cycles.push({
                            cycle: cyclePath,
                            length: cyclePath.length,
                            severity: calculateCycleSeverity(cyclePath.length)
                        });
                        // 如果不需要報告所有循環，找到第一個就停止
                        if (!opts.reportAllCycles) {
                            break;
                        }
                    }
                }
            }
        }
        return cycles;
    }
    /**
     * 使用 Tarjan 算法找出強連通分量
     * @param graph 依賴圖
     * @returns 強連通分量列表
     */
    findStronglyConnectedComponents(graph) {
        const nodes = graph.getAllNodes();
        const nodeStates = new Map();
        const stack = [];
        const sccs = [];
        let index = 0;
        const strongConnect = (node) => {
            // 設定節點的索引和 lowLink
            nodeStates.set(node, {
                index: index,
                lowLink: index,
                onStack: true
            });
            index++;
            stack.push(node);
            // 考慮所有依賴
            const dependencies = graph.getDependencies(node);
            for (const dep of dependencies) {
                const depState = nodeStates.get(dep);
                if (!depState) {
                    // 依賴尚未被訪問，遞歸處理
                    strongConnect(dep);
                    const nodeState = nodeStates.get(node);
                    const depStateAfter = nodeStates.get(dep);
                    nodeState.lowLink = Math.min(nodeState.lowLink, depStateAfter.lowLink);
                }
                else if (depState.onStack) {
                    // 依賴在當前路徑上，更新 lowLink
                    const nodeState = nodeStates.get(node);
                    nodeState.lowLink = Math.min(nodeState.lowLink, depState.index);
                }
            }
            // 如果是根節點，產生 SCC
            const nodeState = nodeStates.get(node);
            if (nodeState.lowLink === nodeState.index) {
                const sccNodes = [];
                let currentNode;
                do {
                    currentNode = stack.pop();
                    const currentState = nodeStates.get(currentNode);
                    currentState.onStack = false;
                    sccNodes.push(currentNode);
                } while (currentNode !== node);
                if (sccNodes.length > 0) {
                    sccs.push({
                        nodes: sccNodes,
                        size: sccNodes.length,
                        cycleComplexity: this.calculateCycleComplexity(graph, sccNodes)
                    });
                }
            }
        };
        // 對每個未訪問的節點執行 Tarjan 算法
        for (const node of nodes) {
            if (!nodeStates.has(node)) {
                strongConnect(node);
            }
        }
        return sccs;
    }
    /**
     * 在強連通分量中找出循環路徑
     * @param graph 依賴圖
     * @param sccNodes SCC 中的節點
     * @returns 循環路徑列表
     */
    findCyclePathsInSCC(graph, sccNodes) {
        const cycles = [];
        const visited = new Set();
        // 從每個節點開始嘗試找出循環
        for (const startNode of sccNodes) {
            if (visited.has(startNode)) {
                continue;
            }
            const cycle = this.findShortestCyclePath(graph, startNode, sccNodes);
            if (cycle && cycle.length > 1) {
                cycles.push(cycle);
                // 標記這個循環中的所有節點為已訪問
                cycle.forEach(node => visited.add(node));
            }
        }
        return cycles;
    }
    /**
     * 找出從指定節點開始的最短循環路徑
     * @param graph 依賴圖
     * @param startNode 起始節點
     * @param sccNodes 限制搜尋範圍的節點
     * @returns 循環路徑或 null
     */
    findShortestCyclePath(graph, startNode, sccNodes) {
        const sccSet = new Set(sccNodes);
        const queue = [{
                node: startNode,
                path: [startNode]
            }];
        const visited = new Set();
        while (queue.length > 0) {
            const { node, path } = queue.shift();
            if (visited.has(node) && node !== startNode) {
                continue;
            }
            visited.add(node);
            const dependencies = graph.getDependencies(node).filter(dep => sccSet.has(dep));
            for (const dep of dependencies) {
                if (dep === startNode && path.length > 1) {
                    // 找到循環
                    return path;
                }
                if (!path.includes(dep)) {
                    queue.push({
                        node: dep,
                        path: [...path, dep]
                    });
                }
            }
        }
        return null;
    }
    /**
     * 計算循環的複雜度
     * @param graph 依賴圖
     * @param cycleNodes 循環中的節點
     * @returns 複雜度分數
     */
    calculateCycleComplexity(graph, cycleNodes) {
        if (cycleNodes.length <= 1) {
            return 0;
        }
        let complexity = 0;
        const cycleSet = new Set(cycleNodes);
        // 計算循環內部的連接密度
        for (const node of cycleNodes) {
            const dependencies = graph.getDependencies(node);
            const internalDeps = dependencies.filter(dep => cycleSet.has(dep));
            complexity += internalDeps.length;
        }
        // 計算外部連接
        for (const node of cycleNodes) {
            const allDependents = graph.getDependents(node);
            const externalDependents = allDependents.filter(dep => !cycleSet.has(dep));
            complexity += externalDependents.length * 0.5; // 外部連接權重較低
        }
        return Math.round(complexity);
    }
    /**
     * 取得預設檢測選項
     * @param options 使用者提供的選項
     * @returns 合併後的選項
     */
    getDefaultOptions(options) {
        return {
            maxCycleLength: 20,
            reportAllCycles: false,
            ignoreSelfLoops: true,
            ...options
        };
    }
    /**
     * 檢查圖中是否存在循環依賴
     * @param graph 依賴圖
     * @returns 是否存在循環
     */
    hasCycles(graph) {
        const topologicalResult = graph.topologicalSort();
        return topologicalResult.hasCycle;
    }
    /**
     * 取得循環依賴的摘要統計
     * @param graph 依賴圖
     * @returns 統計資訊
     */
    getCycleStatistics(graph) {
        const cycles = this.detectCycles(graph, {
            reportAllCycles: true,
            maxCycleLength: 100,
            ignoreSelfLoops: false
        });
        if (cycles.length === 0) {
            return {
                totalCycles: 0,
                averageCycleLength: 0,
                maxCycleLength: 0,
                cyclesBySeverity: { low: 0, medium: 0, high: 0 }
            };
        }
        const totalLength = cycles.reduce((sum, cycle) => sum + cycle.length, 0);
        const maxLength = Math.max(...cycles.map(cycle => cycle.length));
        const severityCount = cycles.reduce((acc, cycle) => {
            acc[cycle.severity]++;
            return acc;
        }, { low: 0, medium: 0, high: 0 });
        return {
            totalCycles: cycles.length,
            averageCycleLength: totalLength / cycles.length,
            maxCycleLength: maxLength,
            cyclesBySeverity: severityCount
        };
    }
    /**
     * 建議循環依賴的修復策略
     * @param cycles 循環依賴列表
     * @returns 修復建議
     */
    suggestFixStrategies(cycles) {
        return cycles.map(cycle => {
            let strategy = '';
            let description = '';
            let priority = 'low';
            if (cycle.length === 1) {
                strategy = 'remove_self_reference';
                description = '移除自我引用，檢查是否真的需要';
                priority = 'low';
            }
            else if (cycle.length === 2) {
                strategy = 'extract_common_dependency';
                description = '提取共同依賴到第三個模組';
                priority = cycle.severity === 'high' ? 'high' : 'medium';
            }
            else if (cycle.length <= 5) {
                strategy = 'dependency_inversion';
                description = '使用依賴倒置原則，引入介面或抽象層';
                priority = cycle.severity === 'high' ? 'high' : 'medium';
            }
            else {
                strategy = 'architectural_refactoring';
                description = '需要重新設計架構，考慮拆分模組';
                priority = 'high';
            }
            return {
                cycle: [...cycle.cycle],
                strategy,
                description,
                priority
            };
        });
    }
}
//# sourceMappingURL=cycle-detector.js.map