/**
 * 依賴圖工具模組
 * 提供依賴圖構建功能
 */

/**
 * 從專案依賴資料構建依賴圖
 */
export async function buildGraphFromProjectDeps(projectDeps: any): Promise<any> {
  const { DependencyGraph } = await import('../../../core/dependency/dependency-graph.js');
  const graph = new DependencyGraph();

  // 新增所有檔案節點及其依賴關係
  for (const fileDep of projectDeps.fileDependencies) {
    graph.addNode(fileDep.filePath);

    for (const dep of fileDep.dependencies) {
      graph.addDependency(fileDep.filePath, dep.path);
    }
  }

  return graph;
}
