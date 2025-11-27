/**
 * Deps 命令
 * 分析依賴關係
 */

import type { Command } from 'commander';
import * as path from 'path';
import { DependencyAnalyzer } from '../../../core/dependency/dependency-analyzer.js';
import type { CommandContext } from './types.js';

/** Deps 命令選項 */
interface DepsOptions {
  path: string;
  file?: string;
  format: string;
  all: boolean;
}

/**
 * 設定 deps 命令
 */
export function setupDepsCommand(program: Command, context: CommandContext): void {
  program
    .command('deps [subcommand]')
    .description('分析依賴關係 (subcommand: graph|cycles|impact|orphans)')
    .option('-p, --path <path>', '分析路徑', '.')
    .option('-f, --file <file>', '特定檔案分析')
    .option('--format <format>', '輸出格式 (json|dot|summary)', 'summary')
    .option('--all', '顯示完整依賴圖（預設只顯示循環依賴和孤立檔案）', false)
    .action(async (subcommand: string, options: DepsOptions) => {
      await handleDepsCommand(subcommand, options, context);
    });
}

/**
 * 處理 deps 命令
 */
async function handleDepsCommand(
  subcommand: string,
  options: DepsOptions,
  context: CommandContext
): Promise<void> {
  if (options.format !== 'json') {
    const titles: Record<string, string> = {
      'graph': '   依賴圖分析...',
      'cycles': '   循環依賴分析...',
      'impact': '   影響分析...',
      'orphans': '   孤立檔案分析...'
    };
    console.log(titles[subcommand] || '   分析依賴關係...');
  }

  try {
    const analyzePath = options.path || process.cwd();

    // 初始化依賴分析器
    const dependencyAnalyzer = new DependencyAnalyzer(context.fileSystem);

    // 分析專案依賴
    const projectDeps = await dependencyAnalyzer.analyzeProject(analyzePath);

    // 獲取統計資訊
    const stats = dependencyAnalyzer.getStats();

    // 使用 CycleDetector 檢測循環依賴
    const cycleDetector = new (await import('../../../core/dependency/cycle-detector.js')).CycleDetector();
    const graph = await buildGraphFromProjectDeps(projectDeps);
    const cycles = cycleDetector.detectCycles(graph);

    // 輸出結果
    if (options.format === 'json') {
      await handleJsonOutput(subcommand, options, graph, cycles, stats);
    } else {
      handleTextOutput(subcommand, cycles, stats);
    }
  } catch (error) {
    if (options.format === 'json') {
      console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error('   依賴分析失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
}

/**
 * 處理 JSON 輸出
 */
async function handleJsonOutput(
  subcommand: string,
  options: DepsOptions,
  graph: any,
  cycles: any[],
  stats: any
): Promise<void> {
  if (subcommand === 'graph') {
    await handleGraphSubcommand(options, graph, cycles, stats);
  } else if (subcommand === 'impact' && options.file) {
    handleImpactSubcommand(options, graph, stats);
  } else if (subcommand === 'orphans') {
    handleOrphansSubcommand(graph, stats);
  } else if (options.file) {
    handleFileQuery(options, graph);
  } else {
    handleDefaultOutput(options, graph, cycles, stats);
  }
}

/**
 * 處理 graph 子命令
 */
async function handleGraphSubcommand(
  options: DepsOptions,
  graph: any,
  cycles: any[],
  stats: any
): Promise<void> {
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
      maxDependenciesInFile: stats.maxDependenciesInFile
    }
  };

  if (options.all) {
    const allNodes = graph.getAllNodes();
    const allNodesSet = new Set(allNodes);

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
        const isExternal = isSystemFramework(depId) || !allNodesSet.has(depId);
        edges.push({
          source: nodeId,
          target: depId,
          type: isExternal ? 'external' : 'internal'
        });
      }
    }

    outputData.all = { nodes, edges };
  }

  console.log(JSON.stringify(outputData, null, 2));
}

/**
 * 處理 impact 子命令
 */
function handleImpactSubcommand(options: DepsOptions, graph: any, stats: any): void {
  const targetFile = path.resolve(options.file!);
  let actualTargetFile = targetFile;
  const directDependents = graph.getDependents(targetFile);

  if (directDependents.length === 0) {
    const allNodes = graph.getAllNodes();
    const matchingNode = allNodes.find((node: string) => node.endsWith(options.file!) || options.file!.endsWith(node));

    if (matchingNode) {
      actualTargetFile = matchingNode;
      const altDependents = graph.getDependents(matchingNode);
      directDependents.length = 0;
      directDependents.push(...altDependents);
    } else {
      console.log(JSON.stringify({
        error: `檔案不存在或未被索引: ${options.file}`
      }, null, 2));
      process.exit(1);
    }
  }

  const transitiveDependents: Set<string> = new Set();
  const visited = new Set<string>();
  const queue = [...directDependents];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) { continue; }
    visited.add(current);
    transitiveDependents.add(current);

    const deps = graph.getDependents(current);
    for (const dep of deps) {
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  const totalImpacted = transitiveDependents.size;
  let impactLevel: string;
  if (totalImpacted > 10) { impactLevel = 'high'; }
  else if (totalImpacted > 3) { impactLevel = 'medium'; }
  else { impactLevel = 'low'; }

  const impactScore = Math.min(100, Math.round((totalImpacted / stats.totalFiles) * 100 * 2));

  console.log(JSON.stringify({
    file: options.file,
    directDependents,
    transitiveDependents: Array.from(transitiveDependents),
    summary: {
      impactLevel,
      impactScore,
      totalImpacted,
      directCount: directDependents.length,
      transitiveCount: transitiveDependents.size
    }
  }, null, 2));
}

/**
 * 處理 orphans 子命令
 */
function handleOrphansSubcommand(graph: any, stats: any): void {
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
}

/**
 * 處理單檔案依賴查詢
 */
function handleFileQuery(options: DepsOptions, graph: any): void {
  const targetFile = path.resolve(options.file!);
  const dependencies: Record<string, string[]> = {};
  dependencies[options.file!] = graph.getDependencies(targetFile);

  console.log(JSON.stringify({ dependencies }, null, 2));
}

/**
 * 處理預設輸出
 */
function handleDefaultOutput(
  options: DepsOptions,
  graph: any,
  cycles: any[],
  stats: any
): void {
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

    outputData.all = { nodes, edges };
  }

  console.log(JSON.stringify(outputData, null, 2));
}

/**
 * 處理文字輸出
 */
function handleTextOutput(subcommand: string, cycles: any[], stats: any): void {
  const completeTitles: Record<string, string> = {
    'graph': '   依賴圖分析',
    'cycles': '   循環依賴分析',
    'impact': '   影響分析',
    'orphans': '   孤立檔案分析'
  };
  console.log(completeTitles[subcommand] || '   依賴分析完成!');
  console.log('   統計:');
  console.log(`   總檔案數: ${stats.totalFiles}`);
  console.log(`   總依賴數: ${stats.totalDependencies}`);
  console.log(`   平均依賴數: ${stats.averageDependenciesPerFile.toFixed(2)}`);
  console.log(`   最大依賴數: ${stats.maxDependenciesInFile}`);

  if (cycles.length > 0) {
    console.log(`   發現 ${cycles.length} 個循環依賴:`);
    cycles.forEach((cycle, index) => {
      console.log(`   ${index + 1}. ${cycle.cycle.join(' → ')} (長度: ${cycle.length}, 嚴重性: ${cycle.severity})`);
    });
  } else {
    console.log('   無循環依賴');
  }

  if (stats.orphanedFiles > 0) {
    console.log(`   發現 ${stats.orphanedFiles} 個孤立檔案`);
  }
}

/**
 * 從專案依賴資訊建立依賴圖
 */
async function buildGraphFromProjectDeps(projectDeps: any): Promise<any> {
  const { DependencyGraph } = await import('../../../core/dependency/dependency-graph.js');
  const graph = new DependencyGraph();

  for (const fileDep of projectDeps.fileDependencies) {
    graph.addNode(fileDep.filePath);

    for (const dep of fileDep.dependencies) {
      graph.addDependency(fileDep.filePath, dep.path);
    }
  }

  return graph;
}
