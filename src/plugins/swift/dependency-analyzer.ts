/**
 * Swift Dependency Analyzer
 * 使用 Tree-sitter 分析 Swift 程式碼中的依賴關係
 */

import type { Tree, QueryCapture, Node } from 'web-tree-sitter';
import type { Dependency } from '@shared/types/index.js';
import {
  DependencyType,
  createDependency
} from '@shared/types/index.js';
import type { TreeSitterAdapter } from './parser.js';

/** SyntaxNode 型別別名 */
type SyntaxNode = Node;

/**
 * Swift 依賴分析器類別
 * 使用 Tree-sitter Query 解析 Swift import 語句
 */
export class SwiftDependencyAnalyzer {
  /**
   * Tree-sitter Query：匹配 import 宣告
   * Swift import 語法：
   * - import Module
   * - import Module.Submodule
   * - import kind Module.symbol (如 import func Module.function)
   */
  private static readonly IMPORT_QUERY = '(import_declaration (identifier) @module) @import';

  /**
   * 擴展 Query：匹配完整的 import 宣告以提取更多資訊
   */
  private static readonly FULL_IMPORT_QUERY = '(import_declaration) @import';

  private dependencies: Dependency[] = [];
  private filePath = '';
  private adapter: TreeSitterAdapter;

  /**
   * 建構子
   * @param adapter Tree-sitter 適配器
   */
  constructor(adapter: TreeSitterAdapter) {
    this.adapter = adapter;
  }

  /**
   * 從 Tree-sitter AST 中提取所有依賴關係
   * @param tree Tree-sitter 解析後的語法樹
   * @param filePath 檔案路徑
   * @returns 依賴關係陣列
   */
  async extractDependencies(tree: Tree, filePath: string): Promise<Dependency[]> {
    this.dependencies = [];
    this.filePath = filePath;

    // 使用 Query 提取 import 語句
    await this.extractImportsWithQuery(tree);

    // 備用：遍歷 AST 提取可能遺漏的 import
    this.visitNode(tree.rootNode);

    // 去重
    return this.deduplicateDependencies();
  }

  /**
   * 使用 Tree-sitter Query 提取 import 語句
   * @param tree 語法樹
   */
  private async extractImportsWithQuery(tree: Tree): Promise<void> {
    try {
      // 嘗試使用主要 Query
      const query = await this.adapter.createQuery(SwiftDependencyAnalyzer.IMPORT_QUERY);
      const captures = query.captures(tree.rootNode);

      this.processImportCaptures(captures);
    } catch {
      // 如果主要 Query 失敗，嘗試完整 Query
      try {
        const fullQuery = await this.adapter.createQuery(SwiftDependencyAnalyzer.FULL_IMPORT_QUERY);
        const captures = fullQuery.captures(tree.rootNode);

        this.processFullImportCaptures(captures);
      } catch {
        // Query 失敗，依賴 visitNode 的備用方案
      }
    }
  }

  /**
   * 處理主要 Query 捕獲的結果
   * @param captures Query 捕獲的節點
   */
  private processImportCaptures(captures: QueryCapture[]): void {
    for (const capture of captures) {
      const { node, name: captureName } = capture;

      if (captureName === 'module') {
        const moduleName = node.text;
        if (moduleName) {
          this.addDependency(moduleName, []);
        }
      }
    }
  }

  /**
   * 處理完整 Query 捕獲的結果
   * @param captures Query 捕獲的節點
   */
  private processFullImportCaptures(captures: QueryCapture[]): void {
    for (const capture of captures) {
      const { node, name: captureName } = capture;

      if (captureName === 'import') {
        const dependency = this.extractDependencyFromNode(node);
        if (dependency) {
          this.dependencies.push(dependency);
        }
      }
    }
  }

  /**
   * 遞歸訪問 AST 節點
   * 作為 Query 的備用方案
   * @param node 語法節點
   */
  private visitNode(node: SyntaxNode): void {
    // 檢查是否為 import 宣告
    if (node.type === 'import_declaration') {
      const dependency = this.extractDependencyFromNode(node);
      if (dependency) {
        this.dependencies.push(dependency);
      }
    }

    // 遞歸處理子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.visitNode(child);
      }
    }
  }

  /**
   * 從 import 節點提取依賴資訊
   * @param node import 宣告節點
   * @returns Dependency 物件或 null
   */
  private extractDependencyFromNode(node: SyntaxNode): Dependency | null {
    const importInfo = this.parseImportDeclaration(node);
    if (!importInfo) {
      return null;
    }

    return createDependency(
      importInfo.modulePath,
      DependencyType.Import,
      false, // Swift import 不使用相對路徑
      importInfo.importedSymbols
    );
  }

  /**
   * 解析 import 宣告
   * @param node import 宣告節點
   * @returns 解析結果
   */
  private parseImportDeclaration(node: SyntaxNode): { modulePath: string; importedSymbols: string[] } | null {
    let modulePath = '';
    const importedSymbols: string[] = [];
    let hasImportKind = false;

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child) {continue;}
      switch (child.type) {
        case 'import':
          // import 關鍵字，跳過
          break;

        case 'import_kind':
          // import kind (func, struct, class, etc.)
          hasImportKind = true;
          break;

        case 'identifier':
          // 模組名稱或符號名稱
          if (modulePath) {
            // 如果已有模組路徑，這是子模組或符號
            if (hasImportKind) {
              importedSymbols.push(child.text);
            } else {
              modulePath += '.' + child.text;
            }
          } else {
            modulePath = child.text;
          }
          break;

        case '.':
          // 點分隔符，跳過
          break;

        default:
          // 處理其他可能的節點類型
          if (child.text && !modulePath) {
            modulePath = child.text;
          }
          break;
      }
    }

    // 如果沒有找到模組路徑，嘗試從節點文字解析
    if (!modulePath) {
      modulePath = this.parseImportText(node.text);
    }

    if (!modulePath) {
      return null;
    }

    return { modulePath, importedSymbols };
  }

  /**
   * 從 import 語句文字解析模組路徑
   * @param text import 語句文字
   * @returns 模組路徑
   */
  private parseImportText(text: string): string {
    // 移除 import 關鍵字和空白
    const match = text.match(/import\s+(?:(?:typealias|struct|class|enum|protocol|var|let|func)\s+)?([^\s]+)/);
    if (match) {
      return match[1];
    }
    return '';
  }

  /**
   * 新增依賴
   * @param modulePath 模組路徑
   * @param importedSymbols 導入的符號
   */
  private addDependency(modulePath: string, importedSymbols: string[]): void {
    const dependency = createDependency(
      modulePath,
      DependencyType.Import,
      false, // Swift 不使用相對路徑
      importedSymbols
    );
    this.dependencies.push(dependency);
  }

  /**
   * 去除重複的依賴
   * @returns 去重後的依賴陣列
   */
  private deduplicateDependencies(): Dependency[] {
    const seen = new Map<string, Dependency>();

    for (const dep of this.dependencies) {
      const key = dep.path;
      const existing = seen.get(key);

      if (existing) {
        // 合併 importedSymbols
        const mergedSymbols = [...new Set([...existing.importedSymbols, ...dep.importedSymbols])];
        seen.set(key, createDependency(
          dep.path,
          dep.type,
          dep.isRelative,
          mergedSymbols
        ));
      } else {
        seen.set(key, dep);
      }
    }

    return [...seen.values()];
  }

  /**
   * 分析特定模組的依賴類型
   * @param moduleName 模組名稱
   * @returns 依賴分類
   */
  getModuleCategory(moduleName: string): 'system' | 'thirdParty' | 'local' {
    // Apple 系統框架
    const systemFrameworks = [
      'Foundation', 'UIKit', 'SwiftUI', 'Combine', 'CoreData',
      'CoreGraphics', 'CoreAnimation', 'CoreImage', 'CoreLocation',
      'MapKit', 'AVFoundation', 'AVKit', 'Photos', 'PhotosUI',
      'StoreKit', 'CloudKit', 'GameKit', 'HealthKit', 'HomeKit',
      'WatchKit', 'AppKit', 'Cocoa', 'Darwin', 'Dispatch', 'os',
      'XCTest', 'Security', 'CryptoKit', 'LocalAuthentication',
      'NotificationCenter', 'UserNotifications', 'WebKit', 'SafariServices',
      'MessageUI', 'EventKit', 'Contacts', 'ContactsUI', 'CoreMotion',
      'CoreBluetooth', 'CoreML', 'Vision', 'NaturalLanguage', 'CreateML',
      'RealityKit', 'ARKit', 'SceneKit', 'SpriteKit', 'Metal', 'MetalKit',
      'Accelerate', 'simd', 'Swift', 'ObjectiveC'
    ];

    if (systemFrameworks.includes(moduleName) || moduleName.startsWith('_')) {
      return 'system';
    }

    // 常見第三方框架前綴
    const thirdPartyPrefixes = [
      'Alamofire', 'SnapKit', 'RxSwift', 'RxCocoa', 'Realm',
      'Firebase', 'GoogleMaps', 'Facebook', 'AWS', 'Kingfisher'
    ];

    if (thirdPartyPrefixes.some(prefix => moduleName.startsWith(prefix))) {
      return 'thirdParty';
    }

    return 'local';
  }
}

/**
 * 創建依賴分析器實例
 * @param adapter Tree-sitter 適配器
 * @returns SwiftDependencyAnalyzer 實例
 */
export function createSwiftDependencyAnalyzer(adapter: TreeSitterAdapter): SwiftDependencyAnalyzer {
  return new SwiftDependencyAnalyzer(adapter);
}
