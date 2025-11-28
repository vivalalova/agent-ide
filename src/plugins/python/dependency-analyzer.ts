/**
 * Python 依賴分析器
 * 分析 import 語句和模組依賴
 */

import type { Dependency } from '@shared/types/index.js';
import { DependencyType, createDependency } from '@shared/types/index.js';
import { type PythonASTNode, type PythonAST, PythonNodeKind, isRelativePath } from './types.js';
import { traverseAST } from './tree-sitter-bridge.js';

/**
 * Python 依賴分析器類別
 */
export class PythonDependencyAnalyzer {
  /**
   * 從 AST 提取所有依賴
   */
  async extractDependencies(ast: PythonAST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];

    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.ImportStatement) {
        dependencies.push(...this.extractImportStatement(node));
      } else if (node.pythonKind === PythonNodeKind.ImportFromStatement) {
        const dep = this.extractImportFromStatement(node);
        if (dep) {
          dependencies.push(dep);
        }
      }
    });

    return dependencies;
  }

  /**
   * 提取 import xxx 語句的依賴
   * 例如：import os, sys, json
   */
  private extractImportStatement(node: PythonASTNode): Dependency[] {
    const deps: Dependency[] = [];
    const tsNode = node.treeSitterNode;

    for (let i = 0; i < tsNode.childCount; i++) {
      const child = tsNode.child(i);
      if (!child) {continue;}

      if (child.type === 'dotted_name') {
        // import os.path
        const moduleName = child.text;
        deps.push(createDependency(
          moduleName,
          DependencyType.Import,
          false,
          [this.getLastPart(moduleName)]
        ));
      } else if (child.type === 'aliased_import') {
        // import numpy as np
        const nameNode = child.childForFieldName('name');
        const aliasNode = child.childForFieldName('alias');

        if (nameNode) {
          const moduleName = nameNode.text;
          const alias = aliasNode?.text || this.getLastPart(moduleName);
          deps.push(createDependency(
            moduleName,
            DependencyType.Import,
            false,
            [alias]
          ));
        }
      }
    }

    return deps;
  }

  /**
   * 提取 from xxx import yyy 語句的依賴
   * 例如：from collections import defaultdict, Counter
   */
  private extractImportFromStatement(node: PythonASTNode): Dependency | null {
    const tsNode = node.treeSitterNode;

    let modulePath = '';
    let isRelative = false;

    // 檢查是否為相對導入
    for (let i = 0; i < tsNode.childCount; i++) {
      const child = tsNode.child(i);
      if (!child) {continue;}

      // 處理相對導入前綴 (., .., ...)
      if (child.type === 'import_prefix') {
        isRelative = true;
        modulePath = child.text;
      }
      // 處理模組名稱
      else if (child.type === 'dotted_name' || child.type === 'relative_import') {
        if (isRelative) {
          modulePath += child.text;
        } else {
          modulePath = child.text;
        }
      }
    }

    // 提取導入的符號
    const importedSymbols = this.extractImportedSymbols(node);

    // 如果沒有模組路徑且是相對導入，可能是 from . import xxx 形式
    if (!modulePath && isRelative) {
      modulePath = '.';
    }

    if (!modulePath) {
      return null;
    }

    return createDependency(
      modulePath,
      DependencyType.Import,
      isRelative || isRelativePath(modulePath),
      importedSymbols
    );
  }

  /**
   * 提取導入的符號列表
   */
  private extractImportedSymbols(node: PythonASTNode): string[] {
    const symbols: string[] = [];
    const tsNode = node.treeSitterNode;

    for (let i = 0; i < tsNode.childCount; i++) {
      const child = tsNode.child(i);
      if (!child) {continue;}

      // 通配符導入 from xxx import *
      if (child.type === 'wildcard_import') {
        symbols.push('*');
      }
      // 單個符號導入
      else if (child.type === 'dotted_name' && this.isImportedName(tsNode, i)) {
        symbols.push(child.text);
      }
      // 別名導入 from xxx import yyy as zzz
      else if (child.type === 'aliased_import') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          symbols.push(nameNode.text);
        }
      }
    }

    return symbols;
  }

  /**
   * 判斷 dotted_name 是否為導入的符號（而非模組路徑）
   */
  private isImportedName(parentNode: any, index: number): boolean {
    // 在 from...import 語句中，import 關鍵字之後的 dotted_name 才是導入的符號
    let foundImport = false;
    for (let i = 0; i < index; i++) {
      const child = parentNode.child(i);
      if (child?.type === 'import') {
        foundImport = true;
        break;
      }
    }
    return foundImport;
  }

  /**
   * 獲取模組名稱的最後一部分
   */
  private getLastPart(moduleName: string): string {
    const parts = moduleName.split('.');
    return parts[parts.length - 1];
  }

  /**
   * 分析檔案的依賴圖
   */
  async analyzeDependencyGraph(
    ast: PythonAST,
    filePath: string
  ): Promise<DependencyGraphNode> {
    const dependencies = await this.extractDependencies(ast);

    return {
      filePath,
      dependencies,
      imports: dependencies.map(dep => ({
        module: dep.path,
        symbols: [...dep.importedSymbols],
        isRelative: dep.isRelative
      }))
    };
  }

  /**
   * 解析相對導入路徑
   */
  resolveRelativeImport(importPath: string, currentFilePath: string): string {
    if (!isRelativePath(importPath)) {
      return importPath;
    }

    // 計算導入的層級
    const levels = this.countLeadingDots(importPath);
    const pathWithoutDots = importPath.substring(levels);

    // 獲取當前檔案的目錄
    const currentDir = currentFilePath.split('/').slice(0, -1);

    // 向上移動目錄
    const targetDir = currentDir.slice(0, -(levels - 1));

    // 組合完整路徑
    if (pathWithoutDots) {
      return [...targetDir, ...pathWithoutDots.split('.')].join('/');
    }

    return targetDir.join('/');
  }

  /**
   * 計算前導點的數量
   */
  private countLeadingDots(path: string): number {
    let count = 0;
    for (const char of path) {
      if (char === '.') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * 判斷是否為標準庫模組
   */
  isStandardLibrary(moduleName: string): boolean {
    const stdLibModules = new Set([
      // 常用標準庫
      'abc', 'argparse', 'ast', 'asyncio', 'base64', 'bisect',
      'collections', 'contextlib', 'copy', 'csv', 'dataclasses',
      'datetime', 'decimal', 'difflib', 'email', 'enum',
      'functools', 'glob', 'gzip', 'hashlib', 'heapq',
      'html', 'http', 'importlib', 'inspect', 'io', 'itertools',
      'json', 'logging', 'math', 'multiprocessing', 'os',
      'pathlib', 'pickle', 'platform', 'pprint', 're', 'random',
      'shutil', 'signal', 'socket', 'sqlite3', 'ssl', 'string',
      'struct', 'subprocess', 'sys', 'tempfile', 'textwrap',
      'threading', 'time', 'traceback', 'types', 'typing',
      'unittest', 'urllib', 'uuid', 'warnings', 'weakref',
      'xml', 'zipfile', 'zlib'
    ]);

    const rootModule = moduleName.split('.')[0];
    return stdLibModules.has(rootModule);
  }

  /**
   * 分類依賴
   */
  classifyDependencies(dependencies: Dependency[]): ClassifiedDependencies {
    const result: ClassifiedDependencies = {
      standardLibrary: [],
      thirdParty: [],
      local: []
    };

    for (const dep of dependencies) {
      if (dep.isRelative) {
        result.local.push(dep);
      } else if (this.isStandardLibrary(dep.path)) {
        result.standardLibrary.push(dep);
      } else {
        result.thirdParty.push(dep);
      }
    }

    return result;
  }
}

/**
 * 依賴圖節點
 */
export interface DependencyGraphNode {
  filePath: string;
  dependencies: Dependency[];
  imports: ImportInfo[];
}

/**
 * 導入資訊
 */
export interface ImportInfo {
  module: string;
  symbols: string[];
  isRelative: boolean;
}

/**
 * 分類後的依賴
 */
export interface ClassifiedDependencies {
  standardLibrary: Dependency[];
  thirdParty: Dependency[];
  local: Dependency[];
}

/**
 * 創建依賴分析器實例
 */
export function createDependencyAnalyzer(): PythonDependencyAnalyzer {
  return new PythonDependencyAnalyzer();
}
