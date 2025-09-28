/**
 * Swift Parser 型別定義
 * 定義 Swift Parser 專用的資料結構和工具函式
 */

import type { AST, Symbol, ASTNode, ASTMetadata, Position, Range, Location, Scope } from '../../shared/types/index.js';
import { SymbolType, createSymbol, createScope, createPosition, createRange as createCoreRange } from '../../shared/types/index.js';

/**
 * Swift AST 節點型別
 */
export interface SwiftASTNode extends ASTNode {
  /** 原始 tree-sitter 節點 */
  treeNode?: any;
  /** Swift 特定的節點型別 */
  swiftType: SwiftNodeType;
  /** 修飾符 (public, private, static, etc.) */
  modifiers: string[];
  /** 泛型參數 */
  generics: string[];
  /** 協議約束 */
  protocols: string[];
}

/**
 * Swift AST 結構
 */
export interface SwiftAST extends AST {
  root: SwiftASTNode;
  /** tree-sitter 解析樹 */
  tree?: any;
  /** 解析錯誤列表 */
  errors: SwiftParseErrorInfo[];
}

/**
 * Swift 符號型別
 */
export interface SwiftSymbol extends Symbol {
  /** Swift 特定的符號型別 */
  swiftType: SwiftSymbolType;
  /** 可見性修飾符 */
  visibility: SwiftVisibility;
  /** 是否為靜態 */
  isStatic: boolean;
  /** 泛型參數 */
  generics: string[];
  /** 協議約束 */
  protocols: string[];
  /** 屬性 (@objc, @available, etc.) */
  attributes: string[];
  /** 對應的 AST 節點 */
  astNode: SwiftASTNode;
}

/**
 * Swift 節點型別枚舉
 */
export enum SwiftNodeType {
  // 宣告
  ClassDeclaration = 'class_declaration',
  StructDeclaration = 'struct_declaration',
  EnumDeclaration = 'enum_declaration',
  ProtocolDeclaration = 'protocol_declaration',
  FunctionDeclaration = 'function_declaration',
  InitDeclaration = 'init_declaration',
  DeinitDeclaration = 'deinit_declaration',
  VariableDeclaration = 'variable_declaration',
  ConstantDeclaration = 'constant_declaration',
  TypeAliasDeclaration = 'typealias_declaration',
  ExtensionDeclaration = 'extension_declaration',

  // 語句
  IfStatement = 'if_statement',
  GuardStatement = 'guard_statement',
  SwitchStatement = 'switch_statement',
  ForStatement = 'for_statement',
  WhileStatement = 'while_statement',
  RepeatStatement = 'repeat_statement',
  ReturnStatement = 'return_statement',
  BreakStatement = 'break_statement',
  ContinueStatement = 'continue_statement',
  ThrowStatement = 'throw_statement',

  // 表達式
  CallExpression = 'call_expression',
  PropertyAccess = 'property_access',
  SubscriptExpression = 'subscript_expression',
  ClosureExpression = 'closure_expression',
  LiteralExpression = 'literal_expression',
  Identifier = 'identifier',

  // 其他
  Parameter = 'parameter',
  GenericParameter = 'generic_parameter',
  TypeAnnotation = 'type_annotation',
  Comment = 'comment',
  Import = 'import',
  Unknown = 'unknown'
}

/**
 * Swift 符號型別枚舉
 */
export enum SwiftSymbolType {
  Class = 'class',
  Struct = 'struct',
  Enum = 'enum',
  Protocol = 'protocol',
  Function = 'function',
  Method = 'method',
  Initializer = 'initializer',
  Deinitializer = 'deinitializer',
  Property = 'property',
  Variable = 'variable',
  Constant = 'constant',
  TypeAlias = 'typealias',
  Extension = 'extension',
  EnumCase = 'enum_case',
  Parameter = 'parameter',
  Generic = 'generic'
}

/**
 * Swift 可見性修飾符
 */
export enum SwiftVisibility {
  Private = 'private',
  FilePrivate = 'fileprivate',
  Internal = 'internal',
  Public = 'public',
  Open = 'open'
}

/**
 * Swift 解析錯誤介面
 */
export interface SwiftParseErrorInfo {
  message: string;
  location: Location;
  severity: 'error' | 'warning';
  code?: string;
}

/**
 * Swift 編譯器選項
 */
export interface SwiftCompilerOptions {
  /** Swift 版本 */
  swiftVersion: string;
  /** 目標平台 */
  target?: string;
  /** 模組名稱 */
  moduleName?: string;
  /** 是否啟用嚴格模式 */
  strict?: boolean;
  /** 警告等級 */
  warningLevel?: 'none' | 'minimal' | 'all';
}

/**
 * 預設編譯器選項
 */
export const DEFAULT_SWIFT_COMPILER_OPTIONS: SwiftCompilerOptions = {
  swiftVersion: '5.0',
  target: 'x86_64-apple-macosx10.15',
  strict: true,
  warningLevel: 'all'
};

/**
 * Swift 解析錯誤類別
 */
export class SwiftParseError extends Error {
  constructor(
    message: string,
    public readonly location?: Location,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'SwiftParseError';
  }
}

// 工具函式

/**
 * 建立 Swift AST 節點
 */
export function createSwiftASTNode(
  type: SwiftNodeType,
  range: Range,
  children: SwiftASTNode[] = [],
  treeNode?: any
): SwiftASTNode {
  return {
    type: type as string,
    range,
    properties: {},
    children,
    parent: undefined,
    treeNode,
    swiftType: type,
    modifiers: [],
    generics: [],
    protocols: []
  };
}

/**
 * 建立 Swift 符號
 */
export function createSwiftSymbol(
  name: string,
  type: SwiftSymbolType,
  location: Location,
  astNode: SwiftASTNode,
  visibility: SwiftVisibility = SwiftVisibility.Internal
): SwiftSymbol {
  const scope = createScope('global'); // 預設 global scope
  const modifiers: string[] = [visibility];

  return {
    name,
    type: mapSwiftSymbolTypeToSymbolType(type),
    location,
    scope,
    modifiers,
    swiftType: type,
    visibility,
    isStatic: false,
    generics: [],
    protocols: [],
    attributes: [],
    astNode
  };
}

/**
 * 建立 Swift 解析錯誤
 */
export function createSwiftParseError(
  message: string,
  location?: Location,
  code?: string
): SwiftParseError {
  return new SwiftParseError(message, location, code);
}

/**
 * 映射 Swift 符號型別到通用符號型別
 */
export function mapSwiftSymbolTypeToSymbolType(swiftType: SwiftSymbolType): SymbolType {
  switch (swiftType) {
  case SwiftSymbolType.Class:
    return SymbolType.Class;
  case SwiftSymbolType.Struct:
    return SymbolType.Class; // Swift struct 對應到 Class
  case SwiftSymbolType.Enum:
    return SymbolType.Enum;
  case SwiftSymbolType.Protocol:
    return SymbolType.Interface;
  case SwiftSymbolType.Function:
  case SwiftSymbolType.Method:
  case SwiftSymbolType.Initializer:
  case SwiftSymbolType.Deinitializer:
    return SymbolType.Function;
  case SwiftSymbolType.Property:
  case SwiftSymbolType.Variable:
    return SymbolType.Variable;
  case SwiftSymbolType.Constant:
    return SymbolType.Constant;
  case SwiftSymbolType.TypeAlias:
    return SymbolType.Type;
  case SwiftSymbolType.Extension:
    return SymbolType.Class;
  case SwiftSymbolType.EnumCase:
    return SymbolType.Constant;
  case SwiftSymbolType.Parameter:
    return SymbolType.Variable;
  case SwiftSymbolType.Generic:
    return SymbolType.Type;
  default:
    return SymbolType.Variable;
  }
}

/**
 * 檢查節點是否為宣告
 */
export function isDeclarationNode(node: SwiftASTNode): boolean {
  return [
    SwiftNodeType.ClassDeclaration,
    SwiftNodeType.StructDeclaration,
    SwiftNodeType.EnumDeclaration,
    SwiftNodeType.ProtocolDeclaration,
    SwiftNodeType.FunctionDeclaration,
    SwiftNodeType.InitDeclaration,
    SwiftNodeType.DeinitDeclaration,
    SwiftNodeType.VariableDeclaration,
    SwiftNodeType.ConstantDeclaration,
    SwiftNodeType.TypeAliasDeclaration,
    SwiftNodeType.ExtensionDeclaration
  ].includes(node.swiftType);
}

/**
 * 檢查節點是否為型別宣告
 */
export function isTypeDeclarationNode(node: SwiftASTNode): boolean {
  return [
    SwiftNodeType.ClassDeclaration,
    SwiftNodeType.StructDeclaration,
    SwiftNodeType.EnumDeclaration,
    SwiftNodeType.ProtocolDeclaration,
    SwiftNodeType.TypeAliasDeclaration
  ].includes(node.swiftType);
}

/**
 * 檢查是否為有效的 Swift 識別符
 */
export function isValidSwiftIdentifier(name: string): boolean {
  // Swift 識別符規則：
  // - 以字母或底線開頭
  // - 後續可包含字母、數字、底線
  // - 支援 Unicode 字符
  const identifierRegex = /^[a-zA-Z_\u00A8\u00AA\u00AD\u00AF\u00B2-\u00B5\u00B7-\u00BA\u00BC-\u00BE\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u02FF\u0370-\u167F\u1681-\u180D\u180F-\u1DBF\u1E00-\u1FFF\u200B-\u200D\u202A-\u202E\u203F-\u2040\u2054\u2060-\u206F\u2070-\u20CF\u2100-\u218F\u2460-\u24FF\u2776-\u2793\u2C00-\u2DFF\u2E80-\u2FFF\u3004-\u3007\u3021-\u302F\u3031-\u303F\u3040-\uD7FF\uF900-\uFD3D\uFD40-\uFDCF\uFDF0-\uFE1F\uFE30-\uFE44\uFE47-\uFFFD][a-zA-Z0-9_\u00A8\u00AA\u00AD\u00AF\u00B2-\u00B5\u00B7-\u00BA\u00BC-\u00BE\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u02FF\u0370-\u167F\u1681-\u180D\u180F-\u1DBF\u1E00-\u1FFF\u200B-\u200D\u202A-\u202E\u203F-\u2040\u2054\u2060-\u206F\u2070-\u20CF\u2100-\u218F\u2460-\u24FF\u2776-\u2793\u2C00-\u2DFF\u2E80-\u2FFF\u3004-\u3007\u3021-\u302F\u3031-\u303F\u3040-\uD7FF\uF900-\uFD3D\uFD40-\uFDCF\uFDF0-\uFE1F\uFE30-\uFE44\uFE47-\uFFFD]*$/;

  return identifierRegex.test(name) && !isSwiftKeyword(name);
}

/**
 * 檢查是否為 Swift 關鍵字
 */
export function isSwiftKeyword(name: string): boolean {
  const keywords = new Set([
    // 宣告關鍵字
    'class', 'struct', 'enum', 'protocol', 'func', 'var', 'let', 'init', 'deinit',
    'extension', 'typealias', 'import', 'subscript', 'operator',

    // 語句關鍵字
    'if', 'else', 'switch', 'case', 'default', 'for', 'in', 'while', 'repeat',
    'break', 'continue', 'return', 'throw', 'throws', 'rethrows', 'try',
    'catch', 'finally', 'defer', 'guard', 'where',

    // 表達式關鍵字
    'as', 'is', 'super', 'self', 'Self', 'new', 'nil', 'true', 'false',

    // 型別關鍵字
    'Any', 'AnyObject', 'Type', 'Protocol',

    // 修飾符
    'public', 'private', 'fileprivate', 'internal', 'open',
    'static', 'class', 'final', 'lazy', 'weak', 'unowned',
    'optional', 'required', 'override', 'mutating', 'nonmutating',
    'dynamic', '@objc', '@nonobjc', '@available', '@discardableResult',

    // 其他
    'associatedtype', 'precedencegroup', 'infix', 'prefix', 'postfix',
    'left', 'right', 'none', 'assignment', 'higherThan', 'lowerThan'
  ]);

  return keywords.has(name);
}

/**
 * 從位置資訊轉換為 Range
 */
export function positionToRange(start: Position, end?: Position): Range {
  return createCoreRange(start, end || start);
}

/**
 * 建立基本範圍（Swift 專用的便利函式）
 */
export function createSwiftRange(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
): Range {
  const start = createPosition(startLine, startColumn);
  const end = createPosition(endLine, endColumn);
  return createCoreRange(start, end);
}