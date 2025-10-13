/**
 * 測試用 Parser 插件
 * 為所有測試提供統一的 Mock Parser 實作
 */

import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range, Scope, ASTNode } from '../../src/shared/types';
import { SymbolType, ReferenceType, DependencyType } from '../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult, DefinitionKind } from '../../src/infrastructure/parser/types';
import { ParserRegistry } from '../../src/infrastructure/parser/registry';
import { TypeScriptParser } from '../../src/plugins/typescript/parser';
import { JavaScriptParser } from '../../src/plugins/javascript/parser';

/**
 * 基礎測試 Parser
 */
abstract class BaseTestParser implements ParserPlugin {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly supportedExtensions: readonly string[];
  abstract readonly supportedLanguages: readonly string[];

  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const content = ast.root.children || [];

    for (const node of content) {
      if (node.type === 'ImportStatement' && node.value) {
        dependencies.push({
          path: (node as any).properties?.value || (node as any).value as string,
          type: DependencyType.Import,
          isRelative: ((node as any).properties?.value || (node as any).value as string).startsWith('./'),
          importedSymbols: []
        });
      }
    }

    return dependencies;
  }

  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    return [{
      symbol,
      location: symbol.location,
      type: ReferenceType.Definition
    }];
  }

  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    return [{
      filePath: '',
      startOffset: position.offset || 0,
      oldText: '',
      newText: newName
    }];
  }

  async extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]> {
    return [{
      type: 'replace',
      range: selection,
      text: 'function extracted() { /* extracted */ }'
    }];
  }

  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    return {
      symbol: {
        name: 'testSymbol',
        type: 'function',
        position,
        scope: { type: 'global' },
        modifiers: []
      },
      position,
      filePath: ast.sourceFile
    };
  }

  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    return [{
      symbol,
      position: symbol.position,
      filePath: ast.sourceFile,
      context: 'test context'
    }];
  }

  async validate(): Promise<ValidationResult> {
    return { isValid: true, errors: [], warnings: [] };
  }

  async dispose(): Promise<void> {
    // 清理資源
  }

  getDefaultExcludePatterns(): string[] {
    return [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**'
    ];
  }

  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();
    return patterns.some(pattern => filePath.includes(pattern.replace('/**', '')));
  }
}

/**
 * 測試用 TypeScript Parser
 */
export class TestTypeScriptParser extends BaseTestParser {
  readonly name = 'typescript';
  readonly version = '1.0.0-test';
  readonly supportedExtensions = ['.ts', '.tsx'] as const;
  readonly supportedLanguages = ['typescript'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    const hasClass = code.includes('class ');
    const hasFunction = code.includes('function ');
    const hasInterface = code.includes('interface ');
    const hasConst = code.includes('const ');
    const hasLet = code.includes('let ');
    const hasVar = code.includes('var ');
    const hasExport = code.includes('export ');
    const hasImport = code.includes('import ');

    const children: ASTNode[] = [];

    if (hasImport) {
      const importMatch = code.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        children.push({
          type: 'ImportStatement',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
          properties: { value: importMatch[1] },
          children: []
        });
      }
    }

    if (hasClass) {
      const classMatch = code.match(/class\s+(\w+)/);
      children.push({
        type: 'ClassDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: classMatch ? classMatch[1] : 'TestClass' },
        children: []
      });
    }

    if (hasFunction) {
      const funcMatch = code.match(/function\s+(\w+)/);
      children.push({
        type: 'FunctionDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: funcMatch ? funcMatch[1] : 'testFunction' },
        children: []
      });
    }

    if (hasInterface) {
      const intMatch = code.match(/interface\s+(\w+)/);
      children.push({
        type: 'InterfaceDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: intMatch ? intMatch[1] : 'TestInterface' },
        children: []
      });
    }

    if (hasConst) {
      const constMatch = code.match(/const\s+(\w+)/);
      children.push({
        type: 'VariableDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: constMatch ? constMatch[1] : 'testConst' },
        children: []
      });
    }

    if (hasLet) {
      const letMatch = code.match(/let\s+(\w+)/);
      if (letMatch && !hasConst) { // 避免重複
        children.push({
          type: 'VariableDeclaration',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
          properties: { value: letMatch[1] },
          children: []
        });
      }
    }

    if (hasVar) {
      const varMatch = code.match(/var\s+(\w+)/);
      if (varMatch && !hasConst && !hasLet) { // 避免重複
        children.push({
          type: 'VariableDeclaration',
          range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
          properties: { value: varMatch[1] },
          children: []
        });
      }
    }

    return {
      type: 'Program',
      root: {
        type: 'Program',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 100 } },
        properties: {},
        children
      },
      sourceFile: filePath,
      metadata: {
        language: 'typescript',
        parsed: true,
        parserVersion: this.version
      }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];

    for (const child of ast.root.children || []) {
      const position: Position = { line: 1, column: 1 };
      const scope = { type: 'global' as const };

      switch (child.type) {
        case 'ClassDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Class,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: ['export']
          });
          break;

        case 'FunctionDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Function,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: []
          });
          break;

        case 'InterfaceDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Interface,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: ['export']
          });
          break;

        case 'VariableDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Variable,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: ['export']
          });
          break;
      }
    }

    return symbols;
  }
}

/**
 * 測試用 JavaScript Parser
 */
export class TestJavaScriptParser extends BaseTestParser {
  readonly name = 'javascript';
  readonly version = '1.0.0-test';
  readonly supportedExtensions = ['.js', '.jsx'] as const;
  readonly supportedLanguages = ['javascript'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    const hasFunction = code.includes('function ');
    const hasClass = code.includes('class ');
    const hasConst = code.includes('const ');
    const hasLet = code.includes('let ');

    const children: ASTNode[] = [];

    if (hasFunction) {
      const funcMatch = code.match(/function\s+(\w+)/);
      children.push({
        type: 'FunctionDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: funcMatch ? funcMatch[1] : 'jsFunction' },
        children: []
      });
    }

    if (hasClass) {
      const classMatch = code.match(/class\s+(\w+)/);
      children.push({
        type: 'ClassDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: classMatch ? classMatch[1] : 'JSClass' },
        children: []
      });
    }

    if (hasConst) {
      const constMatch = code.match(/const\s+(\w+)/);
      children.push({
        type: 'VariableDeclaration',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 10, offset: 10 } },
        properties: { value: constMatch ? constMatch[1] : 'jsConst' },
        children: []
      });
    }

    return {
      type: 'Program',
      root: {
        type: 'Program',
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 10, column: 1, offset: 100 } },
        properties: {},
        children
      },
      sourceFile: filePath,
      metadata: {
        language: 'javascript',
        parsed: true,
        parserVersion: this.version
      }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];

    for (const child of ast.root.children || []) {
      const position: Position = { line: 1, column: 1 };
      const scope = { type: 'global' as const };

      switch (child.type) {
        case 'FunctionDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Function,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: []
          });
          break;

        case 'ClassDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Class,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: []
          });
          break;

        case 'VariableDeclaration':
          symbols.push({
            name: ((child as any).properties?.value || (child as any).value) as string,
            type: SymbolType.Variable,
            position,
            scope: { type: 'global', name: 'global', parent: null },
            modifiers: []
          });
          break;
      }
    }

    return symbols;
  }
}


/**
 * 註冊測試 Parsers
 */
export function registerTestParsers(): void {
  const registry = ParserRegistry.getInstance();

  // 檢查是否已經註冊過
  if (registry.isDisposed) {
    ParserRegistry.resetInstance();
  }

  const newRegistry = ParserRegistry.getInstance();

  try {
    // 使用真實的 TypeScript 和 JavaScript Parser 以獲得更準確的測試結果
    // 註冊 TypeScript Parser
    if (!newRegistry.getParserByName('typescript')) {
      newRegistry.register(new TypeScriptParser());
    }

    // 註冊 JavaScript Parser
    if (!newRegistry.getParserByName('javascript')) {
      newRegistry.register(new JavaScriptParser());
    }
  } catch (error) {
    // 如果已經註冊過就忽略錯誤
    if (!(error instanceof Error && error.message.includes('已存在'))) {
      throw error;
    }
  }
}

/**
 * 清理測試 Parsers
 */
export function cleanupTestParsers(): void {
  ParserRegistry.resetInstance();
}