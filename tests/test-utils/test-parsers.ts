/**
 * 測試用 Parser 插件
 * 為所有測試提供統一的 Mock Parser 實作
 */

import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range } from '../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult } from '../../src/infrastructure/parser/types';
import { ParserRegistry } from '../../src/infrastructure/parser/registry';

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
          path: node.value as string,
          type: 'import',
          isRelative: (node.value as string).startsWith('./'),
          importedSymbols: []
        });
      }
    }

    return dependencies;
  }

  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    return [{
      symbol,
      position: symbol.position,
      type: 'definition'
    }];
  }

  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    return [{
      type: 'replace',
      range: {
        start: position,
        end: { line: position.line, column: position.column + 10 }
      },
      text: newName
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
    const hasExport = code.includes('export ');
    const hasImport = code.includes('import ');

    const children = [];

    if (hasImport) {
      const importMatch = code.match(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        children.push({
          type: 'ImportStatement',
          value: importMatch[1]
        });
      }
    }

    if (hasClass) {
      const classMatch = code.match(/class\s+(\w+)/);
      children.push({
        type: 'ClassDeclaration',
        value: classMatch ? classMatch[1] : 'TestClass'
      });
    }

    if (hasFunction) {
      const funcMatch = code.match(/function\s+(\w+)/);
      children.push({
        type: 'FunctionDeclaration',
        value: funcMatch ? funcMatch[1] : 'testFunction'
      });
    }

    if (hasInterface) {
      const intMatch = code.match(/interface\s+(\w+)/);
      children.push({
        type: 'InterfaceDeclaration',
        value: intMatch ? intMatch[1] : 'TestInterface'
      });
    }

    return {
      type: 'Program',
      root: {
        type: 'Program',
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
            name: child.value as string,
            type: 'class',
            position,
            scope,
            modifiers: ['export']
          });
          break;

        case 'FunctionDeclaration':
          symbols.push({
            name: child.value as string,
            type: 'function',
            position,
            scope,
            modifiers: []
          });
          break;

        case 'InterfaceDeclaration':
          symbols.push({
            name: child.value as string,
            type: 'interface',
            position,
            scope,
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

    const children = [];

    if (hasFunction) {
      const funcMatch = code.match(/function\s+(\w+)/);
      children.push({
        type: 'FunctionDeclaration',
        value: funcMatch ? funcMatch[1] : 'jsFunction'
      });
    }

    if (hasClass) {
      const classMatch = code.match(/class\s+(\w+)/);
      children.push({
        type: 'ClassDeclaration',
        value: classMatch ? classMatch[1] : 'JSClass'
      });
    }

    if (hasConst) {
      const constMatch = code.match(/const\s+(\w+)/);
      children.push({
        type: 'VariableDeclaration',
        value: constMatch ? constMatch[1] : 'jsConst'
      });
    }

    return {
      type: 'Program',
      root: {
        type: 'Program',
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
            name: child.value as string,
            type: 'function',
            position,
            scope,
            modifiers: []
          });
          break;

        case 'ClassDeclaration':
          symbols.push({
            name: child.value as string,
            type: 'class',
            position,
            scope,
            modifiers: []
          });
          break;

        case 'VariableDeclaration':
          symbols.push({
            name: child.value as string,
            type: 'variable',
            position,
            scope,
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
    // 註冊 TypeScript Parser
    if (!newRegistry.getParserByName('typescript')) {
      newRegistry.register(new TestTypeScriptParser());
    }

    // 註冊 JavaScript Parser
    if (!newRegistry.getParserByName('javascript')) {
      newRegistry.register(new TestJavaScriptParser());
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