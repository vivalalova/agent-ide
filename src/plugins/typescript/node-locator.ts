/**
 * TypeScript 節點位置查找與符號分類
 *
 * 提供依位置定位 AST 節點/符號、以及節點與符號類型分類的純函數，
 * 供 parser.ts（rename、findDefinition、findUsages）與
 * reference-resolver.ts（findReferencesBasic 回退路徑）共用。
 */

import * as ts from 'typescript';
import type { DefinitionKind } from '@infrastructure/parser/index.js';
import type { Symbol, Reference, Position } from '@shared/types/index.js';
import { SymbolType } from '@shared/types/index.js';
import { TypeScriptAST, TypeScriptSymbol, positionToTsPosition } from './types.js';
import type { ScopeAnalyzer } from './scope-analyzer.js';
import type { TypeScriptSymbolExtractor } from './symbol-extractor.js';

/**
 * 依偏移位置在 SourceFile 中尋找最精確匹配的節點
 */
export function findNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function findNode(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      // 先檢查子節點
      for (const child of node.getChildren(sourceFile)) {
        const result = findNode(child);
        if (result) {
          return result;
        }
      }
      // 如果子節點中沒找到，返回當前節點
      return node;
    }
    return undefined;
  }

  return findNode(sourceFile);
}

/**
 * 判斷節點是否為可重新命名的識別符或宣告
 */
export function isRenameableNode(node: ts.Node): boolean {
  return (
    ts.isIdentifier(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isParameter(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isTypeParameterDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodSignature(node)
  );
}

export function isDefinitionNode(node: ts.Node): boolean {
  return (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  );
}

export function isDeclarationNode(node: ts.Node): boolean {
  return (
    ts.isParameter(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isBindingElement(node)
  );
}

export function getDefinitionKind(node: ts.Node): DefinitionKind {
  if (ts.isClassDeclaration(node)) {return 'class';}
  if (ts.isInterfaceDeclaration(node)) {return 'interface';}
  if (ts.isFunctionDeclaration(node)) {return 'function';}
  if (ts.isMethodDeclaration(node)) {return 'method';}
  if (ts.isVariableDeclaration(node)) {return 'variable';}
  if (ts.isPropertyDeclaration(node)) {return 'variable';}
  if (ts.isTypeAliasDeclaration(node)) {return 'type';}
  if (ts.isEnumDeclaration(node)) {return 'enum';}
  if (ts.isModuleDeclaration(node)) {return 'module';}
  return 'variable';
}

export function symbolTypeToDefinitionKind(symbolType: SymbolType): DefinitionKind {
  // 將 SymbolType 映射到 DefinitionKind
  switch (symbolType) {
  case SymbolType.Class:
    return 'class';
  case SymbolType.Interface:
    return 'interface';
  case SymbolType.Function:
    return 'function';
  case SymbolType.Variable:
    return 'variable';
  case SymbolType.Constant:
    return 'constant';
  case SymbolType.Type:
    return 'type';
  case SymbolType.Enum:
    return 'enum';
  case SymbolType.Module:
    return 'module';
  case SymbolType.Namespace:
    return 'namespace';
  default:
    return 'variable'; // 預設為變數
  }
}

export function getReferenceUsageKind(_reference: Reference): 'read' | 'write' | 'call' | 'reference' {
  // 基於上下文判斷使用類型
  return 'reference'; // 簡化實作
}

/**
 * 查找指定位置最精確匹配的符號
 */
export async function findSymbolAtPosition(
  ast: TypeScriptAST,
  position: Position,
  symbolExtractor: TypeScriptSymbolExtractor,
  scopeAnalyzer: ScopeAnalyzer
): Promise<Symbol | null> {
  const symbols = await symbolExtractor.extractSymbols(ast);
  const tsPosition = positionToTsPosition(ast.tsSourceFile, position);

  // 查找最精確匹配該位置的符號
  let bestMatch: Symbol | null = null;
  let bestMatchSize = Number.MAX_SAFE_INTEGER;

  for (const symbol of symbols) {
    const typedSymbol = symbol as TypeScriptSymbol;

    // 獲取符號的標識符節點
    const identifier = scopeAnalyzer.getIdentifierFromSymbolNode(typedSymbol.tsNode);
    if (!identifier) {
      continue;
    }

    // 檢查位置是否在標識符範圍內
    const identifierStart = identifier.getStart(ast.tsSourceFile);
    const identifierEnd = identifier.getEnd();

    if (tsPosition >= identifierStart && tsPosition < identifierEnd) {
      // 找到最小的匹配範圍（最精確的符號）
      const size = identifierEnd - identifierStart;
      if (size < bestMatchSize) {
        bestMatch = symbol;
        bestMatchSize = size;
      }
    }
  }

  return bestMatch;
}

/**
 * 在一組同名符號中，找出宣告作用域包含參考位置、且巢狀層級最內層的符號
 */
export function findInnermostScopedSymbol(
  symbols: Symbol[],
  referenceNode: ts.Identifier,
  scopeAnalyzer: ScopeAnalyzer
): Symbol | null {
  let bestMatch: Symbol | null = null;
  let bestScope: ts.Node | null = null;

  for (const symbol of symbols) {
    const typedSymbol = symbol as TypeScriptSymbol;
    const declarationScope = scopeAnalyzer.getScopeContainer(typedSymbol.tsNode);

    // 只選擇宣告所在作用域包含參考位置的宣告
    if (!scopeAnalyzer.isInScopeChain(referenceNode, declarationScope)) {
      continue;
    }

    // 同一作用域保留 extractSymbols 順序，巢狀作用域則選擇更內層者
    if (
      !bestMatch
      || (bestScope && scopeAnalyzer.isInScopeChain(declarationScope, bestScope))
    ) {
      bestMatch = symbol;
      bestScope = declarationScope;
    }
  }

  return bestMatch;
}
