/**
 * Swift 未使用符號檢測器
 * 檢測未使用的 class、struct、protocol、function、variable
 */

import type { UnusedCode } from '../../../infrastructure/parser/analysis-types.js';

/**
 * Swift 符號類型
 */
enum SwiftSymbolType {
  Class = 'class',
  Struct = 'struct',
  Protocol = 'protocol',
  Function = 'function',
  Variable = 'variable'
}

/**
 * 符號定義
 */
interface SymbolDefinition {
  type: SwiftSymbolType;
  name: string;
  line: number;
  isPublic: boolean;
  isSpecial: boolean; // @main, @Published, @State 等
}

/**
 * 未使用符號檢測器
 */
export class UnusedSymbolDetector {
  /**
   * 檢測未使用的符號
   * @param code Swift 原始程式碼
   * @param filePath 檔案路徑
   * @returns 未使用的符號列表
   */
  async detect(code: string, filePath: string): Promise<UnusedCode[]> {
    const symbols = this.extractSymbols(code);
    const unused: UnusedCode[] = [];

    for (const symbol of symbols) {
      // 跳過 public 符號（可能被外部使用）
      if (symbol.isPublic) {
        continue;
      }

      // 跳過特殊符號
      if (symbol.isSpecial) {
        continue;
      }

      // 檢查是否有引用
      const references = this.findReferences(code, symbol.name, symbol.line);

      if (references === 0) {
        unused.push({
          type: this.mapSymbolType(symbol.type),
          name: symbol.name,
          location: {
            filePath,
            line: symbol.line,
            column: 0
          },
          confidence: 0.9,
          reason: `${symbol.type} '${symbol.name}' 已宣告但從未使用`
        });
      }
    }

    return unused;
  }

  /**
   * 提取所有符號定義
   */
  private extractSymbols(code: string): SymbolDefinition[] {
    const symbols: SymbolDefinition[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNumber = i + 1;

      // 檢測特殊屬性
      const isSpecial = this.hasSpecialAttribute(lines, i);

      // Class
      if (/^\s*(public|internal|private|fileprivate)?\s*class\s+([a-zA-Z_][a-zA-Z0-9_]*)/.test(line)) {
        const match = line.match(/class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) {
          symbols.push({
            type: SwiftSymbolType.Class,
            name: match[1],
            line: lineNumber,
            isPublic: /\bpublic\b/.test(line),
            isSpecial
          });
        }
      }

      // Struct
      if (/^\s*(public|internal|private|fileprivate)?\s*struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/.test(line)) {
        const match = line.match(/struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) {
          symbols.push({
            type: SwiftSymbolType.Struct,
            name: match[1],
            line: lineNumber,
            isPublic: /\bpublic\b/.test(line),
            isSpecial
          });
        }
      }

      // Protocol
      if (/^\s*(public|internal|private)?\s*protocol\s+([a-zA-Z_][a-zA-Z0-9_]*)/.test(line)) {
        const match = line.match(/protocol\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) {
          symbols.push({
            type: SwiftSymbolType.Protocol,
            name: match[1],
            line: lineNumber,
            isPublic: /\bpublic\b/.test(line),
            isSpecial
          });
        }
      }

      // Function
      if (/^\s*(public|private|fileprivate|internal)?\s*func\s+([a-zA-Z_][a-zA-Z0-9_]*)/.test(line)) {
        const match = line.match(/func\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) {
          // 跳過 SwiftUI body
          if (match[1] === 'body') {
            continue;
          }

          symbols.push({
            type: SwiftSymbolType.Function,
            name: match[1],
            line: lineNumber,
            isPublic: /\bpublic\b/.test(line),
            isSpecial
          });
        }
      }

      // Variable/Constant
      if (/^\s*(public|private|fileprivate|internal)?\s*(let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/.test(line)) {
        const match = line.match(/(let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (match) {
          symbols.push({
            type: SwiftSymbolType.Variable,
            name: match[2],
            line: lineNumber,
            isPublic: /\bpublic\b/.test(line),
            isSpecial
          });
        }
      }
    }

    return symbols;
  }

  /**
   * 檢查是否有特殊屬性（@main, @Published, @State 等）
   */
  private hasSpecialAttribute(lines: string[], currentIndex: number): boolean {
    // 檢查當前行和上一行
    const currentLine = lines[currentIndex];
    const previousLine = currentIndex > 0 ? lines[currentIndex - 1] : '';

    const specialAttributes = [
      '@main',
      '@Published',
      '@State',
      '@Binding',
      '@ObservedObject',
      '@StateObject',
      '@EnvironmentObject',
      '@Environment',
      '@AppStorage',
      '@SceneStorage'
    ];

    for (const attr of specialAttributes) {
      if (currentLine.includes(attr) || previousLine.includes(attr)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 查找符號引用次數（不包括定義本身）
   */
  private findReferences(code: string, symbolName: string, definitionLine: number): number {
    const lines = code.split('\n');
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      // 跳過定義行
      if (i + 1 === definitionLine) {
        continue;
      }

      const line = lines[i];

      // 使用單詞邊界匹配符號名稱
      const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
      const matches = line.match(regex);

      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * 映射符號類型到 UnusedCode 類型
   */
  private mapSymbolType(symbolType: SwiftSymbolType): 'variable' | 'function' | 'class' | 'import' {
    switch (symbolType) {
    case SwiftSymbolType.Function:
      return 'function';
    case SwiftSymbolType.Class:
    case SwiftSymbolType.Struct:
    case SwiftSymbolType.Protocol:
      return 'class';
    case SwiftSymbolType.Variable:
      return 'variable';
    default:
      return 'variable';
    }
  }
}

/**
 * 預設導出檢測函式
 */
export default async function detectUnusedSymbols(
  code: string,
  filePath: string
): Promise<UnusedCode[]> {
  const detector = new UnusedSymbolDetector();
  return detector.detect(code, filePath);
}
