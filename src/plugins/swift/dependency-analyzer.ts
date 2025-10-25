/**
 * Swift Dependency Analyzer
 * 分析 Swift 程式碼的依賴關係
 */

import type { Dependency } from '../../shared/types/index.js';
import { DependencyType } from '../../shared/types/index.js';
import type { SwiftAST, SwiftASTNode } from './types.js';
import { SwiftNodeKind } from './types.js';

/**
 * Swift 依賴分析器
 */
export class SwiftDependencyAnalyzer {
  /**
   * 從 AST 提取依賴關係
   */
  async extractDependencies(ast: SwiftAST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    this.extractDependenciesFromNode(ast.root, ast.sourceFile, dependencies);
    return dependencies;
  }

  /**
   * 從節點遞歸提取依賴
   */
  private extractDependenciesFromNode(
    node: SwiftASTNode,
    filePath: string,
    dependencies: Dependency[]
  ): void {
    // 處理 import 語句
    if (node.swiftKind === SwiftNodeKind.Import) {
      const dependency = this.extractImportDependency(node, filePath);
      if (dependency) {
        dependencies.push(dependency);
      }
    }

    // 遞歸處理子節點
    if (node.children) {
      for (const child of node.children) {
        this.extractDependenciesFromNode(
          child as SwiftASTNode,
          filePath,
          dependencies
        );
      }
    }
  }

  /**
   * 從 import 節點提取依賴
   */
  private extractImportDependency(
    node: SwiftASTNode,
    filePath: string
  ): Dependency | null {
    // 從 properties 或 source 取得 import 路徑
    if (node.properties?.path) {
      return {
        path: node.properties.path as string,
        type: DependencyType.Import,
        isRelative: false,
        importedSymbols: []
      };
    }

    // 解析 import 語句：import Foundation, import UIKit, import SwiftUI
    if (!node.source) {
      return null;
    }
    const importMatch = node.source.match(/import\s+([A-Za-z0-9_.]+)/);
    if (!importMatch) {
      return null;
    }

    const moduleName = importMatch[1];

    return {
      path: moduleName,
      type: DependencyType.Import,
      isRelative: false,
      importedSymbols: []
    };
  }

  /**
   * 判斷是否為外部依賴
   * Swift 系統 framework 視為外部依賴
   */
  private isExternalDependency(moduleName: string): boolean {
    const systemFrameworks = [
      'Foundation',
      'UIKit',
      'SwiftUI',
      'Combine',
      'CoreData',
      'CoreGraphics',
      'CoreLocation',
      'MapKit',
      'AVFoundation',
      'WebKit',
      'Network',
      'Dispatch',
      'XCTest'
    ];

    return systemFrameworks.includes(moduleName);
  }
}

/**
 * 建立依賴分析器實例
 */
export function createDependencyAnalyzer(): SwiftDependencyAnalyzer {
  return new SwiftDependencyAnalyzer();
}
