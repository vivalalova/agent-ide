/**
 * Swift Symbol Extractor
 * 從 AST 中提取符號資訊
 */

import type { Symbol, Range, Location } from '../../shared/types/index.js';
import { SymbolType } from '../../shared/types/index.js';
import type { SwiftAST, SwiftASTNode, SwiftSymbol } from './types.js';
import {
  SwiftNodeKind,
  swiftKindToSymbolType,
  getNodeName,
  extractModifiers,
  extractAttributes,
  isDeclarationNode,
  SwiftAccessLevel
} from './types.js';

/**
 * Swift 符號提取器
 */
export class SwiftSymbolExtractor {
  /**
   * 從 AST 提取所有符號
   */
  async extractSymbols(ast: SwiftAST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];
    this.extractSymbolsFromNode(ast.root, ast.sourceFile, symbols, undefined);
    return symbols;
  }

  /**
   * 從節點遞歸提取符號
   */
  private extractSymbolsFromNode(
    node: SwiftASTNode,
    filePath: string,
    symbols: Symbol[],
    parentNode?: SwiftASTNode
  ): void {
    // 如果是宣告節點，建立符號
    if (isDeclarationNode(node)) {
      const symbol = this.createSymbolFromNode(node, filePath, parentNode);
      if (symbol) {
        symbols.push(symbol);
      }
    }

    // 遞歸處理子節點
    if (node.children) {
      for (const child of node.children) {
        this.extractSymbolsFromNode(child as SwiftASTNode, filePath, symbols, node);
      }
    }
  }

  /**
   * 從節點建立符號
   */
  private createSymbolFromNode(
    node: SwiftASTNode,
    filePath: string,
    parentNode?: SwiftASTNode
  ): SwiftSymbol | null {
    const name = getNodeName(node);
    if (!name) {
      return null;
    }

    let symbolType = swiftKindToSymbolType(node.swiftKind);

    const modifiers = extractModifiers(node.source || '');
    const attributes = extractAttributes(node.source || '');

    // 如果是 Variable 且有屬性包裝器（@Published, @State 等），或有存取修飾符，視為 Property
    if (symbolType === SymbolType.Variable) {
      const hasPropertyWrapper = attributes.some(attr =>
        ['@Published', '@State', '@Binding', '@ObservedObject', '@StateObject',
          '@EnvironmentObject', '@Environment', '@AppStorage', '@SceneStorage'].includes(attr)
      );
      const hasAccessModifier = modifiers.some(mod =>
        ['public', 'private', 'internal', 'fileprivate', 'open'].includes(mod)
      );

      if (hasPropertyWrapper || hasAccessModifier) {
        symbolType = SymbolType.Property;
      }
    }
    const accessLevel = this.extractAccessLevel(modifiers);
    const propertyWrappers = this.extractPropertyWrappers(attributes);
    const { superclass, implements: protocols } = this.extractInheritance(node.source || '');

    // 建立位置資訊（從 node.range 或簡化版）
    const range: Range = node.range || {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 }
    };

    const location: Location = {
      filePath,
      range
    };

    const symbol: SwiftSymbol = {
      name,
      type: symbolType,
      location,
      scope: undefined, // TODO: 實作 scope 分析
      modifiers,
      ...(attributes.length > 0 ? { attributes } : {}),
      ...(superclass ? { superclass } : {}),
      ...(protocols.length > 0 ? { implements: protocols } : {}),
      swiftNode: node,
      propertyWrappers,
      accessLevel
    };

    return symbol;
  }

  /**
   * 判斷節點是否為型別宣告（Class/Struct/Protocol/Enum）
   */
  private isTypeDeclaration(node: SwiftASTNode): boolean {
    return [
      SwiftNodeKind.Class,
      SwiftNodeKind.Struct,
      SwiftNodeKind.Protocol,
      SwiftNodeKind.Enum
    ].includes(node.swiftKind);
  }

  /**
   * 提取存取層級
   */
  private extractAccessLevel(modifiers: string[]): SwiftAccessLevel {
    if (modifiers.includes('open')) {return SwiftAccessLevel.Open;}
    if (modifiers.includes('public')) {return SwiftAccessLevel.Public;}
    if (modifiers.includes('fileprivate')) {return SwiftAccessLevel.FilePrivate;}
    if (modifiers.includes('private')) {return SwiftAccessLevel.Private;}
    return SwiftAccessLevel.Internal; // 預設為 internal
  }

  /**
   * 提取 property wrappers
   * attributes 現在包含 @ 符號（如 '@Published'），需要去掉 @ 再比對
   */
  private extractPropertyWrappers(attributes: string[]): string[] {
    const propertyWrappers = [
      'Published',
      'State',
      'Binding',
      'ObservedObject',
      'StateObject',
      'EnvironmentObject',
      'Environment',
      'AppStorage',
      'SceneStorage',
      'FetchRequest'
    ];

    return attributes
      .map(attr => attr.startsWith('@') ? attr.slice(1) : attr)
      .filter(attr => propertyWrappers.includes(attr));
  }

  /**
   * 提取繼承和協定資訊
   * 從類別宣告如 "class Foo: Bar, Baz, Protocol" 提取 superclass 和 implements
   */
  private extractInheritance(source: string): { superclass?: string; implements: string[] } {
    // 匹配類別宣告: class ClassName: SuperClass, Protocol1, Protocol2
    // 或 struct/enum 實作協定: struct Foo: Protocol1, Protocol2
    const classMatch = source.match(/(?:class|struct|enum)\s+\w+\s*:\s*([^{]+)/);

    if (!classMatch) {
      return { implements: [] };
    }

    const inheritanceList = classMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (inheritanceList.length === 0) {
      return { implements: [] };
    }

    // 對於 class，第一個是 superclass（如果不是協定）
    // 常見協定：ObservableObject, Identifiable, Codable, Equatable, Hashable 等
    const knownProtocols = new Set([
      'ObservableObject',
      'Identifiable',
      'Codable',
      'Equatable',
      'Hashable',
      'Comparable',
      'CustomStringConvertible',
      'Decodable',
      'Encodable',
      'Error',
      'CaseIterable'
    ]);

    // 如果是 class 且第一個不是已知協定，則視為 superclass
    if (source.startsWith('class') || source.includes('class ')) {
      const first = inheritanceList[0];
      if (first && !knownProtocols.has(first) && !first.endsWith('Protocol')) {
        return {
          superclass: first,
          implements: inheritanceList.slice(1)
        };
      }
    }

    // 否則全部視為協定
    return { implements: inheritanceList };
  }
}

/**
 * 建立符號提取器實例
 */
export function createSymbolExtractor(): SwiftSymbolExtractor {
  return new SwiftSymbolExtractor();
}
