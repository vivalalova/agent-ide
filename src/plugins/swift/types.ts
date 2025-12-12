/**
 * Swift Parser 特定型別定義
 * 包含 AST 節點類型、符號類型映射和相關工具函式
 */

import type { AST, ASTNode, Position, Range } from '@shared/types/index.js';
import { SymbolType } from '@shared/types/index.js';
import type { Node as TreeSitterNode, Tree as TreeSitterTree, Point as TreeSitterPoint } from 'web-tree-sitter';

/**
 * Swift AST 節點類型（對應 tree-sitter-swift）
 */
export enum SwiftNodeKind {
  // 頂層結構
  SourceFile = 'source_file',
  Comment = 'comment',
  MultilineComment = 'multiline_comment',

  // 宣告
  ClassDeclaration = 'class_declaration',
  StructDeclaration = 'struct_declaration',
  EnumDeclaration = 'enum_declaration',
  ProtocolDeclaration = 'protocol_declaration',
  ExtensionDeclaration = 'extension_declaration',
  ActorDeclaration = 'actor_declaration',
  TypealiasDeclaration = 'typealias_declaration',

  // 函式和方法
  FunctionDeclaration = 'function_declaration',
  InitializerDeclaration = 'init_declaration',
  DeinitializerDeclaration = 'deinit_declaration',
  SubscriptDeclaration = 'subscript_declaration',
  OperatorDeclaration = 'operator_declaration',

  // 屬性
  PropertyDeclaration = 'property_declaration',
  ComputedProperty = 'computed_property',
  StoredProperty = 'stored_property',
  VariableDeclaration = 'variable_declaration',
  ConstantDeclaration = 'constant_declaration',

  // 參數和修飾符
  Parameter = 'parameter',
  ParameterClause = 'parameter_clause',
  ModifierList = 'modifier_list',
  Modifier = 'modifier',
  Attribute = 'attribute',
  AttributeArgument = 'attribute_argument',

  // 型別
  TypeIdentifier = 'type_identifier',
  ArrayType = 'array_type',
  DictionaryType = 'dictionary_type',
  OptionalType = 'optional_type',
  ImplicitlyUnwrappedOptionalType = 'implicitly_unwrapped_optional_type',
  FunctionType = 'function_type',
  TupleType = 'tuple_type',
  ProtocolCompositionType = 'protocol_composition_type',
  OpaqueType = 'opaque_type',
  SomeType = 'some_type',
  AnyType = 'any_type',
  MetatypeType = 'metatype_type',

  // 泛型
  GenericParameterClause = 'generic_parameter_clause',
  GenericParameter = 'generic_parameter',
  GenericArgumentClause = 'generic_argument_clause',
  GenericWhereClause = 'generic_where_clause',
  TypeConstraint = 'type_constraint',

  // 繼承
  InheritanceClause = 'inheritance_clause',
  InheritedType = 'inherited_type',

  // 列舉
  EnumCase = 'enum_case',
  EnumCaseItem = 'enum_case_item',
  AssociatedValue = 'associated_value',
  RawValueAssignment = 'raw_value_assignment',

  // 表達式
  CallExpression = 'call_expression',
  MemberExpression = 'member_expression',
  SubscriptExpression = 'subscript_expression',
  BinaryExpression = 'binary_expression',
  UnaryExpression = 'unary_expression',
  TernaryExpression = 'ternary_expression',
  AsExpression = 'as_expression',
  IsExpression = 'is_expression',
  TryExpression = 'try_expression',
  AwaitExpression = 'await_expression',
  ClosureExpression = 'closure_expression',
  TupleExpression = 'tuple_expression',
  ArrayLiteral = 'array_literal',
  DictionaryLiteral = 'dictionary_literal',
  StringLiteral = 'string_literal',
  InterpolatedStringLiteral = 'interpolated_string_literal',
  IntegerLiteral = 'integer_literal',
  RealLiteral = 'real_literal',
  BooleanLiteral = 'boolean_literal',
  NilLiteral = 'nil_literal',
  SelfExpression = 'self_expression',
  SuperExpression = 'super_expression',
  KeyPathExpression = 'key_path_expression',

  // 語句
  IfStatement = 'if_statement',
  GuardStatement = 'guard_statement',
  SwitchStatement = 'switch_statement',
  SwitchCase = 'switch_case',
  ForStatement = 'for_statement',
  WhileStatement = 'while_statement',
  RepeatWhileStatement = 'repeat_while_statement',
  DoStatement = 'do_statement',
  CatchClause = 'catch_clause',
  DeferStatement = 'defer_statement',
  ReturnStatement = 'return_statement',
  BreakStatement = 'break_statement',
  ContinueStatement = 'continue_statement',
  FallthroughStatement = 'fallthrough_statement',
  ThrowStatement = 'throw_statement',

  // Import
  ImportDeclaration = 'import_declaration',
  ImportPath = 'import_path',
  ImportPathComponent = 'import_path_component',

  // 其他
  Identifier = 'identifier',
  SimpleIdentifier = 'simple_identifier',
  Operator = 'operator',
  CodeBlock = 'code_block',
  Assignment = 'assignment',
  Pattern = 'pattern',
  IdentifierPattern = 'identifier_pattern',
  WildcardPattern = 'wildcard_pattern',
  TuplePattern = 'tuple_pattern',
  EnumCasePattern = 'enum_case_pattern',
  OptionalPattern = 'optional_pattern',
  IsPattern = 'is_pattern',
  AsPattern = 'as_pattern'
}

/**
 * Swift AST 節點包裝器
 * 擴展基礎 ASTNode 介面，加入 tree-sitter 特定資訊
 */
export interface SwiftASTNode extends ASTNode {
  /** tree-sitter 原始節點 */
  readonly treeSitterNode: TreeSitterNode;
  /** Swift 節點類型 */
  readonly swiftKind: SwiftNodeKind;
  /** 屬性列表（如 @available, @MainActor 等） */
  readonly attributes?: readonly string[];
  /** 修飾符列表（如 public, private, final 等） */
  readonly modifiers?: readonly string[];
  /** 型別註解（如果有） */
  readonly typeAnnotation?: string;
}

/**
 * Swift AST 包裝器
 * 擴展基礎 AST 介面
 */
export interface SwiftAST extends AST {
  readonly root: SwiftASTNode;
  /** tree-sitter 解析樹 */
  readonly tree: TreeSitterTree;
}

/**
 * Swift 節點類型到 SymbolType 映射表
 * 用於將 tree-sitter 節點類型轉換為通用符號類型
 */
export const SWIFT_NODE_TYPE_MAP: Record<string, SymbolType> = {
  // 類別和結構
  [SwiftNodeKind.ClassDeclaration]: SymbolType.Class,
  [SwiftNodeKind.StructDeclaration]: SymbolType.Struct,
  [SwiftNodeKind.EnumDeclaration]: SymbolType.Enum,
  [SwiftNodeKind.ProtocolDeclaration]: SymbolType.Protocol,
  [SwiftNodeKind.ExtensionDeclaration]: SymbolType.Class, // extension 視為擴展其所屬類型
  [SwiftNodeKind.ActorDeclaration]: SymbolType.Class, // actor 類似 class

  // 函式和方法
  [SwiftNodeKind.FunctionDeclaration]: SymbolType.Function,
  [SwiftNodeKind.InitializerDeclaration]: SymbolType.Function,
  [SwiftNodeKind.DeinitializerDeclaration]: SymbolType.Function,
  [SwiftNodeKind.SubscriptDeclaration]: SymbolType.Function,
  [SwiftNodeKind.OperatorDeclaration]: SymbolType.Function,

  // 屬性和變數
  [SwiftNodeKind.PropertyDeclaration]: SymbolType.Property,
  [SwiftNodeKind.ComputedProperty]: SymbolType.Property,
  [SwiftNodeKind.StoredProperty]: SymbolType.Property,
  [SwiftNodeKind.VariableDeclaration]: SymbolType.Variable,
  [SwiftNodeKind.ConstantDeclaration]: SymbolType.Constant,
  [SwiftNodeKind.Parameter]: SymbolType.Variable,

  // 型別
  [SwiftNodeKind.TypealiasDeclaration]: SymbolType.Type,
  [SwiftNodeKind.GenericParameter]: SymbolType.Type,

  // 列舉成員
  [SwiftNodeKind.EnumCase]: SymbolType.Property,
  [SwiftNodeKind.EnumCaseItem]: SymbolType.Property,

  // Import
  [SwiftNodeKind.ImportDeclaration]: SymbolType.Module
};

/**
 * Swift 修飾符映射
 * 用於識別和分類 Swift 存取控制和其他修飾符
 */
export const SWIFT_MODIFIER_MAP: Record<string, string> = {
  // 存取控制
  'public': 'public',
  'private': 'private',
  'internal': 'internal',
  'fileprivate': 'fileprivate',
  'open': 'open',

  // 其他修飾符
  'static': 'static',
  'class': 'class',
  'final': 'final',
  'lazy': 'lazy',
  'weak': 'weak',
  'unowned': 'unowned',
  'override': 'override',
  'required': 'required',
  'convenience': 'convenience',
  'mutating': 'mutating',
  'nonmutating': 'nonmutating',
  'optional': 'optional',
  'dynamic': 'dynamic',
  'indirect': 'indirect',
  'infix': 'infix',
  'prefix': 'prefix',
  'postfix': 'postfix',
  'nonisolated': 'nonisolated',
  'async': 'async',
  'throws': 'throws',
  'rethrows': 'rethrows'
};

/**
 * 控制流節點複雜度權重（用於複雜度分析）
 */
export const COMPLEXITY_WEIGHTS: Partial<Record<SwiftNodeKind, number>> = {
  [SwiftNodeKind.IfStatement]: 1,
  [SwiftNodeKind.GuardStatement]: 1,
  [SwiftNodeKind.SwitchStatement]: 1,
  [SwiftNodeKind.SwitchCase]: 1,
  [SwiftNodeKind.ForStatement]: 1,
  [SwiftNodeKind.WhileStatement]: 1,
  [SwiftNodeKind.RepeatWhileStatement]: 1,
  [SwiftNodeKind.DoStatement]: 1,
  [SwiftNodeKind.CatchClause]: 1,
  [SwiftNodeKind.TernaryExpression]: 1,
  [SwiftNodeKind.ClosureExpression]: 1
};

/**
 * 位置轉換：tree-sitter Point → Position
 * @param point tree-sitter 位置點
 * @param offset 字元偏移量
 * @returns Position 物件
 */
export function tsPointToPosition(point: TreeSitterPoint, offset: number): Position {
  return {
    line: point.row,
    column: point.column,
    offset
  };
}

/**
 * 範圍轉換：tree-sitter Node → Range
 * @param node tree-sitter 節點
 * @returns Range 物件
 */
export function tsNodeToRange(node: TreeSitterNode): Range {
  return {
    start: tsPointToPosition(node.startPosition, node.startIndex),
    end: tsPointToPosition(node.endPosition, node.endIndex)
  };
}

/**
 * 節點類型字串轉 SwiftNodeKind
 * @param type tree-sitter 節點類型字串
 * @returns SwiftNodeKind enum 值
 */
export function nodeTypeToKind(type: string): SwiftNodeKind {
  const kindMap: Record<string, SwiftNodeKind> = {};

  // 建立反向映射
  for (const [, value] of Object.entries(SwiftNodeKind)) {
    kindMap[value] = value as SwiftNodeKind;
  }

  return kindMap[type] || (type as SwiftNodeKind);
}

/**
 * 檢查路徑是否為相對導入
 * Swift 使用 import 語句，通常不區分相對/絕對
 * @param path 模組路徑
 * @returns 是否為相對路徑
 */
export function isRelativePath(path: string): boolean {
  // Swift 的 import 通常是模組名稱，不是檔案路徑
  // 以 . 開頭的視為相對（雖然 Swift 很少這樣用）
  return path.startsWith('.');
}

/**
 * Swift 保留字列表
 * 根據 Swift 語言規範
 */
const SWIFT_RESERVED_WORDS = new Set([
  // 宣告關鍵字
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate',
  'func', 'import', 'init', 'inout', 'internal', 'let', 'open', 'operator',
  'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static',
  'struct', 'subscript', 'typealias', 'var',

  // 語句關鍵字
  'break', 'case', 'catch', 'continue', 'default', 'defer', 'do', 'else',
  'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return', 'throw',
  'switch', 'where', 'while',

  // 表達式和型別關鍵字
  'Any', 'as', 'await', 'catch', 'false', 'is', 'nil', 'self', 'Self',
  'super', 'throws', 'true', 'try',

  // 模式關鍵字
  '_',

  // 特殊字面值
  '#available', '#colorLiteral', '#column', '#dsohandle', '#elseif', '#else',
  '#endif', '#error', '#file', '#fileLiteral', '#function', '#if', '#imageLiteral',
  '#keyPath', '#line', '#selector', '#sourceLocation', '#warning',

  // 上下文關鍵字
  'actor', 'async', 'borrowing', 'consuming', 'convenience', 'didSet',
  'distributed', 'dynamic', 'final', 'get', 'indirect', 'infix', 'isolated',
  'lazy', 'left', 'macro', 'mutating', 'nonisolated', 'nonmutating', 'optional',
  'override', 'postfix', 'prefix', 'required', 'right', 'set', 'some',
  'unowned', 'weak', 'willSet'
]);

/** 預編譯的 Swift 識別符正則表達式 */
const SWIFT_IDENTIFIER_PATTERN = /^[\p{ID_Start}_][\p{ID_Continue}]*$/u;

/** 反引號包圍的識別符模式（允許使用保留字） */
const SWIFT_BACKTICK_IDENTIFIER_PATTERN = /^`[\p{ID_Start}_][\p{ID_Continue}]*`$/u;

/**
 * 驗證 Swift 識別符名稱
 *
 * Swift 支援 Unicode 識別符：
 * - 第一個字元：Unicode 類別 ID_Start 或底線
 * - 後續字元：Unicode 類別 ID_Continue
 * - 使用反引號可將保留字用作識別符
 *
 * @param name 識別符名稱
 * @returns 是否為有效識別符
 *
 * @example
 * ```swift
 * let 用戶名稱 = "John"  // 合法
 * let `class` = "使用保留字"  // 合法（使用反引號）
 * ```
 */
export function isValidSwiftIdentifier(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  // 檢查反引號包圍的識別符
  if (SWIFT_BACKTICK_IDENTIFIER_PATTERN.test(name)) {
    return true;
  }

  // 一般識別符：必須符合模式且不是保留字
  return SWIFT_IDENTIFIER_PATTERN.test(name) && !isSwiftReservedWord(name);
}

/**
 * 檢查是否為 Swift 保留字
 * @param name 名稱
 * @returns 是否為保留字
 */
export function isSwiftReservedWord(name: string): boolean {
  return SWIFT_RESERVED_WORDS.has(name);
}

/**
 * Swift 解析錯誤類別
 */
export class SwiftParseError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly position?: Position
  ) {
    super(message);
    this.name = 'SwiftParseError';
  }
}

/**
 * 創建解析錯誤
 * @param message 錯誤訊息
 * @param filePath 檔案路徑
 * @param position 錯誤位置
 * @returns SwiftParseError 實例
 */
export function createParseError(
  message: string,
  filePath?: string,
  position?: Position
): SwiftParseError {
  return new SwiftParseError(message, filePath, position);
}

/**
 * Swift 常用屬性（用於識別特殊標註）
 */
export const COMMON_ATTRIBUTES = new Set([
  '@available',
  '@discardableResult',
  '@escaping',
  '@autoclosure',
  '@main',
  '@MainActor',
  '@Sendable',
  '@frozen',
  '@usableFromInline',
  '@inlinable',
  '@objc',
  '@objcMembers',
  '@IBOutlet',
  '@IBAction',
  '@IBDesignable',
  '@IBInspectable',
  '@NSManaged',
  '@NSCopying',
  '@Published',
  '@State',
  '@Binding',
  '@ObservedObject',
  '@StateObject',
  '@EnvironmentObject',
  '@Environment',
  '@AppStorage',
  '@SceneStorage',
  '@FocusState',
  '@ViewBuilder',
  '@resultBuilder',
  '@propertyWrapper'
]);

/**
 * 檢查是否為測試檔案
 * @param filePath 檔案路徑
 * @returns 是否為測試檔案
 */
export function isSwiftTestFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  return (
    fileName.endsWith('Tests.swift')
    || fileName.endsWith('Test.swift')
    || fileName.endsWith('Spec.swift')
    || filePath.includes('/Tests/')
    || filePath.includes('/XCTest/')
    || filePath.includes('UITests/')
  );
}

/**
 * 從節點提取屬性列表
 * @param node tree-sitter 節點
 * @returns 屬性名稱陣列
 */
export function extractAttributes(node: TreeSitterNode): string[] {
  const attributes: string[] = [];

  // 遍歷子節點尋找屬性
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'attribute') {
      const attrText = child.text.trim();
      if (attrText.startsWith('@')) {
        // 只取屬性名稱部分（不含參數）
        const nameMatch = attrText.match(/^@[\w]+/);
        if (nameMatch) {
          attributes.push(nameMatch[0]);
        }
      }
    }
  }

  return attributes;
}

/**
 * 從節點提取修飾符列表
 * @param node tree-sitter 節點
 * @returns 修飾符名稱陣列
 */
export function extractModifiers(node: TreeSitterNode): string[] {
  const modifiers: string[] = [];

  // 遍歷子節點尋找修飾符
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'modifier' || child?.type === 'modifiers') {
      const modText = child.text.trim();
      const mapped = SWIFT_MODIFIER_MAP[modText];
      if (mapped && !modifiers.includes(mapped)) {
        modifiers.push(mapped);
      }
    }
  }

  return modifiers;
}
