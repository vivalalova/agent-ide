/**
 * Deps 命令處理器
 * 處理依賴關係分析相關的命令操作
 */

import * as path from 'path';
import { DependencyAnalyzer } from '@core/dependency/dependency-analyzer.js';
import * as DependencyUtils from '@interfaces/cli/utils/dependency-utils.js';

/**
 * 處理依賴分析命令
 */
export async function handleDepsCommand(
  subcommand: string,
  options: any,
  dependencyAnalyzer: DependencyAnalyzer | undefined
): Promise<void> {
  if (options.format !== 'json') {
    const titles: Record<string, string> = {
      'graph': '🕸️ 依賴圖分析...',
      'cycles': '🔄 循環依賴分析...',
      'impact': '💥 影響分析...',
      'orphans': '🏝️ 孤立檔案分析...'
    };
    console.log(titles[subcommand] || '🕸️ 分析依賴關係...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    // 初始化依賴分析器
    if (!dependencyAnalyzer) {
      dependencyAnalyzer = new DependencyAnalyzer();
    }

    // 分析專案依賴
    const projectDeps = await dependencyAnalyzer.analyzeProject(analyzePath);

    // 獲取統計資訊
    const stats = dependencyAnalyzer.getStats();

    // 使用 CycleDetector 檢測循環依賴
    const cycleDetector = new (await import('../../../core/dependency/cycle-detector.js')).CycleDetector();
    const graph = await DependencyUtils.buildGraphFromProjectDeps(projectDeps);
    const cycles = cycleDetector.detectCycles(graph);

    // 輸出結果
    if (options.format === 'json') {
      // 根據子命令決定輸出格式
      if (subcommand === 'graph') {
        // graph 子命令：輸出完整依賴圖（nodes, edges, summary）
        const allNodes = graph.getAllNodes();
        const allNodesSet = new Set(allNodes);

        // 計算每個節點的入度和出度
        const inDegreeMap = new Map<string, number>();
        const outDegreeMap = new Map<string, number>();

        for (const nodeId of allNodes) {
          const deps = graph.getDependencies(nodeId);
          outDegreeMap.set(nodeId, deps.length);

          for (const depId of deps) {
            if (allNodesSet.has(depId)) {
              inDegreeMap.set(depId, (inDegreeMap.get(depId) || 0) + 1);
            }
          }
        }

        const nodes = allNodes.map((nodeId: string) => ({
          id: nodeId,
          dependencies: graph.getDependencies(nodeId),
          inDegree: inDegreeMap.get(nodeId) || 0,
          outDegree: outDegreeMap.get(nodeId) || 0
        }));

        // 判斷是否為系統框架
        const isSystemFramework = (name: string): boolean => {
          const systemFrameworks = [
            'Foundation', 'UIKit', 'SwiftUI', 'Combine', 'CoreData',
            'CoreGraphics', 'CoreLocation', 'AVFoundation', 'MapKit',
            'WebKit', 'Security', 'PackageDescription'
          ];
          return systemFrameworks.includes(name);
        };

        const edges: Array<{source: string; target: string; type: string}> = [];
        for (const nodeId of allNodes) {
          for (const depId of graph.getDependencies(nodeId)) {
            // 系統框架一律標記為 external
            const isExternal = isSystemFramework(depId) || !allNodesSet.has(depId);
            edges.push({
              source: nodeId,
              target: depId,
              type: isExternal ? 'external' : 'internal'
            });
          }
        }

        // graph 子命令：保持原格式（nodes, edges, summary）
        console.log(JSON.stringify({
          nodes,
          edges,
          summary: {
            totalFiles: stats.totalFiles,
            totalDependencies: stats.totalDependencies,
            averageDependenciesPerFile: stats.averageDependenciesPerFile,
            maxDependenciesInFile: stats.maxDependenciesInFile
          }
        }, null, 2));
      } else if (subcommand === 'impact' && options.file) {
        // impact 子命令：分析檔案修改的影響範圍
        const targetFile = path.resolve(options.file);

        let actualTargetFile = targetFile;
        const directDependents = graph.getDependents(targetFile);

        // 如果找不到依賴關係，可能是路徑格式不匹配
        if (directDependents.length === 0) {
          // 嘗試在 graph 中找到匹配的路徑
          const allNodes = graph.getAllNodes();
          const matchingNode = allNodes.find((node: string) => node.endsWith(options.file) || options.file.endsWith(node));

          if (matchingNode) {
            // 找到匹配的節點，使用該路徑重新查詢
            actualTargetFile = matchingNode;
            const altDependents = graph.getDependents(matchingNode);
            directDependents.length = 0;
            directDependents.push(...altDependents);
          } else {
            // 檔案不在專案中或未被索引
            console.error(`❌ 錯誤：檔案不存在或未被索引: ${options.file}`);
            process.exit(1);
          }
        }

        // BFS 計算傳遞依賴
        const transitiveDependents: Set<string> = new Set();
        const visited = new Set<string>();
        const queue = [...directDependents];

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current)) {continue;}
          visited.add(current);
          transitiveDependents.add(current);

          const deps = graph.getDependents(current);
          for (const dep of deps) {
            if (!visited.has(dep)) {
              queue.push(dep);
            }
          }
        }

        // 計算影響等級
        const totalImpacted = transitiveDependents.size;
        let impactLevel: string;
        if (totalImpacted > 10) {impactLevel = 'high';}
        else if (totalImpacted > 3) {impactLevel = 'medium';}
        else {impactLevel = 'low';}

        // 計算影響評分 (0-100)
        const impactScore = Math.min(100, Math.round((totalImpacted / stats.totalFiles) * 100 * 2));

        console.log(JSON.stringify({
          file: options.file,
          impactLevel,
          impactScore,
          directDependents,
          transitiveDependents: Array.from(transitiveDependents),
          summary: {
            totalImpacted,
            directCount: directDependents.length,
            transitiveCount: transitiveDependents.size
          }
        }, null, 2));
      } else if (subcommand === 'orphans') {
        // orphans 子命令：檢測孤立檔案
        const allNodes = graph.getAllNodes();
        const orphans: Array<{filePath: string; reason: string}> = [];

        for (const node of allNodes) {
          const dependents = graph.getDependents(node);
          if (dependents.length === 0) {
            orphans.push({
              filePath: node,
              reason: 'No files depend on this file'
            });
          }
        }

        console.log(JSON.stringify({
          orphans,
          summary: {
            totalOrphans: orphans.length,
            totalFiles: stats.totalFiles,
            orphanPercentage: Math.round((orphans.length / stats.totalFiles) * 100)
          }
        }, null, 2));
      } else if (options.file) {
        // 單檔案依賴查詢模式
        const targetFile = path.resolve(options.file);
        const dependencies: Record<string, string[]> = {};
        dependencies[options.file] = graph.getDependencies(targetFile);

        console.log(JSON.stringify({
          dependencies
        }, null, 2));
      } else {
        // 其他子命令（cycles）或無子命令：輸出問題導向格式
        const outputData: any = {
          issues: {
            cycles: cycles.map(c => ({
              cycle: c.cycle,
              length: c.length,
              severity: c.severity
            })),
            circularDependencies: cycles.length,
            orphanedFiles: stats.orphanedFiles
          },
          summary: {
            totalFiles: stats.totalFiles,
            totalDependencies: stats.totalDependencies,
            averageDependenciesPerFile: stats.averageDependenciesPerFile,
            maxDependenciesInFile: stats.maxDependenciesInFile,
            cyclesFound: cycles.length,
            issuesFound: cycles.length + stats.orphanedFiles
          }
        };

        // 只有在 --all 時才輸出完整依賴圖
        if (options.all) {
          const nodes = graph.getAllNodes().map((nodeId: string) => ({
            id: nodeId,
            dependencies: graph.getDependencies(nodeId)
          }));

          const edges: Array<{source: string; target: string}> = [];
          for (const nodeId of graph.getAllNodes()) {
            for (const depId of graph.getDependencies(nodeId)) {
              edges.push({ source: nodeId, target: depId });
            }
          }

          outputData.all = {
            nodes,
            edges
          };
        }

        console.log(JSON.stringify(outputData, null, 2));
      }
    } else {
      const completeTitles: Record<string, string> = {
        'graph': '✅ 依賴圖分析',
        'cycles': '✅ 循環依賴分析',
        'impact': '✅ 影響分析',
        'orphans': '✅ 孤立檔案分析'
      };
      console.log(completeTitles[subcommand] || '✅ 依賴分析完成!');
      console.log('📊 統計:');
      console.log(`   總檔案數: ${stats.totalFiles}`);
      console.log(`   總依賴數: ${stats.totalDependencies}`);
      console.log(`   平均依賴數: ${stats.averageDependenciesPerFile.toFixed(2)}`);
      console.log(`   最大依賴數: ${stats.maxDependenciesInFile}`);

      if (cycles.length > 0) {
        console.log(`⚠️  發現 ${cycles.length} 個循環依賴:`);
        cycles.forEach((cycle, index) => {
          console.log(`   ${index + 1}. ${cycle.cycle.join(' → ')} (長度: ${cycle.length}, 嚴重性: ${cycle.severity})`);
        });
      } else {
        console.log('✓ 無循環依賴');
      }

      if (stats.orphanedFiles > 0) {
        console.log(`⚠️  發現 ${stats.orphanedFiles} 個孤立檔案`);
      }
    }
  } catch (error) {
    if (options.format === 'json') {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error('❌ 依賴分析失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}
