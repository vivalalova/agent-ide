/**
 * Swift Parser 型別定義
 */

import type { AST, ASTNode, Symbol } from '../../shared/types/index.js';
import { SymbolType } from '../../shared/types/index.js';

/**
 * Swift AST 節點
 */
export interface SwiftASTNode extends ASTNode {
  /** Swift 節點類型 */
  swiftKind: SwiftNodeKind;
  /** 屬性（如 @Published, @State 等） */
  attributes?: string[];
  /** 修飾符（如 public, private, static 等） */
  modifiers?: string[];
  /** 節點原始碼片段（可選，用於提取名稱等資訊） */
  source?: string;
}

/**
 * Swift 節點類型
 */
export enum SwiftNodeKind {
  SourceFile = 'SourceFile',
  Class = 'ClassDecl',
  Struct = 'StructDecl',
  Protocol = 'ProtocolDecl',
  Enum = 'EnumDecl',
  Function = 'FuncDecl',
  Variable = 'VariableDecl',
  Constant = 'LetDecl',
  TypeAlias = 'TypeAliasDecl',
  Extension = 'ExtensionDecl',
  Property = 'PropertyDecl',
  Method = 'MethodDecl',
  Import = 'ImportDecl',
  Parameter = 'ParamDecl',
  Unknown = 'Unknown'
}

/**
 * Swift AST（擴展標準 AST）
 */
export interface SwiftAST extends AST {
  root: SwiftASTNode;
  /** Swift 版本 */
  swiftVersion?: string;
  /** 編譯錯誤 */
  diagnostics?: SwiftDiagnostic[];
}

/**
 * Swift 診斷訊息
 */
export interface SwiftDiagnostic {
  severity: 'error' | 'warning' | 'note';
  message: string;
  line: number;
  column: number;
}

/**
 * Swift 符號（擴展標準 Symbol）
 */
export interface SwiftSymbol extends Symbol {
  /** Swift 節點引用 */
  swiftNode: SwiftASTNode;
  /** 屬性包裝器（如 @Published, @State） */
  propertyWrappers?: string[];
  /** 存取層級（public, private, internal 等） */
  accessLevel?: SwiftAccessLevel;
}

/**
 * Swift 存取層級
 */
export enum SwiftAccessLevel {
  Open = 'open',
  Public = 'public',
  Internal = 'internal',
  FilePrivate = 'fileprivate',
  Private = 'private'
}

/**
 * CLI Bridge 通訊格式
 */
export interface SwiftCLIRequest {
  action: 'parse' | 'analyze';
  code?: string;
  filePath: string;
}

export interface SwiftCLIResponse {
  success: boolean;
  ast?: SwiftASTNode;
  diagnostics?: SwiftDiagnostic[];
  error?: string;
}

/**
 * Swift Parser 錯誤
 */
export class SwiftParseError extends Error {
  constructor(
    message: string,
    public readonly diagnostics?: SwiftDiagnostic[]
  ) {
    super(message);
    this.name = 'SwiftParseError';
  }
}

/**
 * 建立 Swift AST 節點
 */
export function createSwiftASTNode(
  kind: SwiftNodeKind,
  source: string,
  attributes?: string[],
  modifiers?: string[]
): SwiftASTNode {
  return {
    type: kind,
    range: {
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 }
    },
    source,
    swiftKind: kind,
    attributes,
    modifiers,
    children: [],
    properties: {}
  };
}

/**
 * 建立 Swift Parse Error
 */
export function createParseError(
  message: string,
  diagnostics?: SwiftDiagnostic[]
): SwiftParseError {
  return new SwiftParseError(message, diagnostics);
}

/**
 * 判斷節點是否為宣告
 */
export function isDeclarationNode(node: SwiftASTNode): boolean {
  return [
    SwiftNodeKind.Class,
    SwiftNodeKind.Struct,
    SwiftNodeKind.Protocol,
    SwiftNodeKind.Enum,
    SwiftNodeKind.Function,
    SwiftNodeKind.Variable,
    SwiftNodeKind.Constant,
    SwiftNodeKind.TypeAlias,
    SwiftNodeKind.Property,
    SwiftNodeKind.Method
  ].includes(node.swiftKind);
}

/**
 * 判斷節點是否為型別宣告
 */
export function isTypeDeclarationNode(node: SwiftASTNode): boolean {
  return [
    SwiftNodeKind.Class,
    SwiftNodeKind.Struct,
    SwiftNodeKind.Protocol,
    SwiftNodeKind.Enum,
    SwiftNodeKind.TypeAlias
  ].includes(node.swiftKind);
}

/**
 * 從 Swift 節點類型映射到 SymbolType
 */
export function swiftKindToSymbolType(kind: SwiftNodeKind): SymbolType {
  switch (kind) {
  case SwiftNodeKind.Class:
    return SymbolType.Class;
  case SwiftNodeKind.Struct:
    return SymbolType.Struct; // Swift struct 現在有專屬類型
  case SwiftNodeKind.Protocol:
    return SymbolType.Protocol; // Swift protocol 現在有專屬類型
  case SwiftNodeKind.Enum:
    return SymbolType.Enum;
  case SwiftNodeKind.Function:
  case SwiftNodeKind.Method:
    return SymbolType.Function;
  case SwiftNodeKind.Variable:
    return SymbolType.Variable;
  case SwiftNodeKind.Property:
    return SymbolType.Property; // Swift property 現在有專屬類型
  case SwiftNodeKind.Constant:
    return SymbolType.Constant;
  case SwiftNodeKind.TypeAlias:
    return SymbolType.Type;
  default:
    return SymbolType.Variable;
  }
}

/**
 * 提取節點名稱
 */
export function getNodeName(node: SwiftASTNode): string | null {
  // 優先從 properties 讀取名稱
  if (node.properties?.name) {
    return node.properties.name as string;
  }

  // 如果沒有 source，返回 null
  if (!node.source) {
    return null;
  }

  // 從 source 中提取名稱（簡化實作）
  const source = node.source.trim();

  // 匹配各種宣告模式
  const patterns = [
    /class\s+(\w+)/,
    /struct\s+(\w+)/,
    /protocol\s+(\w+)/,
    /enum\s+(\w+)/,
    /func\s+(\w+)/,
    /var\s+(\w+)/,
    /let\s+(\w+)/,
    /typealias\s+(\w+)/
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * 判斷是否為有效的 Swift 識別符
 */
export function isValidIdentifier(name: string): boolean {
  // Swift 識別符規則：字母或底線開頭，後接字母、數字或底線
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * 提取修飾符
 */
export function extractModifiers(source: string): string[] {
  const modifiers: string[] = [];
  const modifierPatterns = [
    'public',
    'private',
    'internal',
    'fileprivate',
    'open',
    'static',
    'final',
    'override',
    'weak',
    'unowned',
    'lazy',
    'mutating',
    'nonmutating',
    'async',
    'throws',
    'rethrows'
  ];

  for (const modifier of modifierPatterns) {
    if (new RegExp(`\\b${modifier}\\b`).test(source)) {
      modifiers.push(modifier);
    }
  }

  return modifiers;
}

/**
 * 提取屬性（property wrappers）
 * 回傳包含 @ 符號的屬性名稱
 */
export function extractAttributes(source: string): string[] {
  const attributes: string[] = [];
  const attrPattern = /@(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(source)) !== null) {
    attributes.push(`@${match[1]}`); // 保留 @ 符號
  }

  return attributes;
}
