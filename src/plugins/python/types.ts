/**
 * Python Parser 特定型別定義
 */

import type { AST, ASTNode, Position, Range } from '@shared/types/index.js';
import { SymbolType } from '@shared/types/index.js';
import type { Node as TreeSitterNode, Tree as TreeSitterTree, Point as TreeSitterPoint } from 'web-tree-sitter';

/**
 * Python AST 節點類型（對應 tree-sitter-python）
 */
export enum PythonNodeKind {
  // 模組和結構
  Module = 'module',
  ClassDefinition = 'class_definition',
  FunctionDefinition = 'function_definition',
  AsyncFunctionDefinition = 'async_function_definition',
  DecoratedDefinition = 'decorated_definition',
  Decorator = 'decorator',

  // 語句
  ImportStatement = 'import_statement',
  ImportFromStatement = 'import_from_statement',
  Assignment = 'assignment',
  AugmentedAssignment = 'augmented_assignment',
  AnnotatedAssignment = 'annotated_assignment',
  GlobalStatement = 'global_statement',
  NonlocalStatement = 'nonlocal_statement',
  ExpressionStatement = 'expression_statement',
  ReturnStatement = 'return_statement',
  PassStatement = 'pass_statement',
  BreakStatement = 'break_statement',
  ContinueStatement = 'continue_statement',
  RaiseStatement = 'raise_statement',
  AssertStatement = 'assert_statement',
  DeleteStatement = 'delete_statement',
  PrintStatement = 'print_statement',

  // 控制流
  IfStatement = 'if_statement',
  ElifClause = 'elif_clause',
  ElseClause = 'else_clause',
  ForStatement = 'for_statement',
  WhileStatement = 'while_statement',
  TryStatement = 'try_statement',
  ExceptClause = 'except_clause',
  FinallyClause = 'finally_clause',
  WithStatement = 'with_statement',
  AsyncForStatement = 'async_for_statement',
  AsyncWithStatement = 'async_with_statement',

  // Python 3.10+ match-case
  MatchStatement = 'match_statement',
  CaseClause = 'case_clause',
  CasePattern = 'case_pattern',

  // 表達式
  BinaryOperator = 'binary_operator',
  UnaryOperator = 'unary_operator',
  BooleanOperator = 'boolean_operator',
  ComparisonOperator = 'comparison_operator',
  ConditionalExpression = 'conditional_expression',
  LambdaExpression = 'lambda',
  Call = 'call',
  Attribute = 'attribute',
  Subscript = 'subscript',
  Slice = 'slice',

  // 容器
  List = 'list',
  Dictionary = 'dictionary',
  Set = 'set',
  Tuple = 'tuple',
  ListComprehension = 'list_comprehension',
  DictionaryComprehension = 'dictionary_comprehension',
  SetComprehension = 'set_comprehension',
  GeneratorExpression = 'generator_expression',

  // 基本元素
  Identifier = 'identifier',
  Integer = 'integer',
  Float = 'float',
  String = 'string',
  ConcatenatedString = 'concatenated_string',
  True = 'true',
  False = 'false',
  None = 'none',
  Comment = 'comment',

  // 參數和型別
  Parameters = 'parameters',
  Parameter = 'parameter',
  DefaultParameter = 'default_parameter',
  TypedParameter = 'typed_parameter',
  TypedDefaultParameter = 'typed_default_parameter',
  ListSplatPattern = 'list_splat_pattern',
  DictionarySplatPattern = 'dictionary_splat_pattern',
  KeywordArgument = 'keyword_argument',
  Type = 'type',

  // 區塊
  Block = 'block',
  ArgumentList = 'argument_list',

  // Import 相關
  DottedName = 'dotted_name',
  AliasedImport = 'aliased_import',
  WildcardImport = 'wildcard_import',
  RelativeImport = 'relative_import',
  ImportPrefix = 'import_prefix'
}

/**
 * Python AST 節點包裝器
 */
export interface PythonASTNode extends ASTNode {
  /** tree-sitter 原始節點 */
  readonly treeSitterNode: TreeSitterNode;
  /** Python 節點類型 */
  readonly pythonKind: PythonNodeKind;
  /** 裝飾器列表（如果有） */
  readonly decorators?: readonly string[];
  /** 型別註解（如果有） */
  readonly typeAnnotation?: string;
}

/**
 * Python AST 包裝器
 */
export interface PythonAST extends AST {
  readonly root: PythonASTNode;
  /** tree-sitter 解析樹 */
  readonly tree: TreeSitterTree;
}

/**
 * Python 符號類型映射
 */
export const PYTHON_SYMBOL_TYPE_MAP: Partial<Record<PythonNodeKind, SymbolType>> = {
  [PythonNodeKind.ClassDefinition]: SymbolType.Class,
  [PythonNodeKind.FunctionDefinition]: SymbolType.Function,
  [PythonNodeKind.AsyncFunctionDefinition]: SymbolType.Function,
  [PythonNodeKind.Assignment]: SymbolType.Variable,
  [PythonNodeKind.AnnotatedAssignment]: SymbolType.Variable,
  [PythonNodeKind.Parameter]: SymbolType.Variable,
  [PythonNodeKind.TypedParameter]: SymbolType.Variable,
  [PythonNodeKind.DefaultParameter]: SymbolType.Variable,
  [PythonNodeKind.TypedDefaultParameter]: SymbolType.Variable,
  [PythonNodeKind.ImportStatement]: SymbolType.Module,
  [PythonNodeKind.ImportFromStatement]: SymbolType.Module
};

/**
 * 控制流節點複雜度權重（用於複雜度分析）
 */
export const COMPLEXITY_WEIGHTS: Partial<Record<PythonNodeKind, number>> = {
  [PythonNodeKind.IfStatement]: 1,
  [PythonNodeKind.ElifClause]: 1,
  [PythonNodeKind.ForStatement]: 1,
  [PythonNodeKind.AsyncForStatement]: 1,
  [PythonNodeKind.WhileStatement]: 1,
  [PythonNodeKind.TryStatement]: 1,
  [PythonNodeKind.ExceptClause]: 1,
  [PythonNodeKind.MatchStatement]: 1,
  [PythonNodeKind.CaseClause]: 1,
  [PythonNodeKind.BooleanOperator]: 1,
  [PythonNodeKind.ConditionalExpression]: 1,
  [PythonNodeKind.ListComprehension]: 1,
  [PythonNodeKind.DictionaryComprehension]: 1,
  [PythonNodeKind.SetComprehension]: 1,
  [PythonNodeKind.GeneratorExpression]: 1
};

/**
 * 位置轉換：tree-sitter Point → Position
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
 */
export function tsNodeToRange(node: TreeSitterNode): Range {
  return {
    start: tsPointToPosition(node.startPosition, node.startIndex),
    end: tsPointToPosition(node.endPosition, node.endIndex)
  };
}

/**
 * 節點類型字串轉 PythonNodeKind
 */
export function nodeTypeToKind(type: string): PythonNodeKind {
  const kindMap: Record<string, PythonNodeKind> = {};

  // 反向映射 enum
  for (const [key, value] of Object.entries(PythonNodeKind)) {
    kindMap[value] = value as PythonNodeKind;
  }

  return kindMap[type] || (type as PythonNodeKind);
}

/**
 * 檢查路徑是否為相對導入
 */
export function isRelativePath(path: string): boolean {
  return path.startsWith('.');
}

/**
 * Python 保留字列表
 */
const PYTHON_RESERVED_WORDS = new Set([
  // Keywords
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
  // Python 3.10+ soft keywords
  'match', 'case', 'type', '_'
]);

/** 預編譯的 Unicode 識別符正則表達式 */
const PYTHON_UNICODE_IDENTIFIER_PATTERN = /^[\p{ID_Start}_][\p{ID_Continue}]*$/u;

/**
 * 驗證 Python 識別符名稱
 *
 * Python 3 支援 Unicode 識別符（PEP 3131）：
 * - 第一個字元：Unicode 類別 ID_Start 或底線
 * - 後續字元：Unicode 類別 ID_Continue
 *
 * 範例：
 * - 用戶名稱 = "John"   # 合法
 * - データ = 123        # 合法（日文）
 */
export function isValidPythonIdentifier(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  return PYTHON_UNICODE_IDENTIFIER_PATTERN.test(name) && !isPythonReservedWord(name);
}

/**
 * 檢查是否為 Python 保留字
 */
export function isPythonReservedWord(name: string): boolean {
  return PYTHON_RESERVED_WORDS.has(name);
}

/**
 * Python 解析錯誤類別
 */
export class PythonParseError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly position?: Position
  ) {
    super(message);
    this.name = 'PythonParseError';
  }
}

/**
 * 創建解析錯誤
 */
export function createParseError(message: string, filePath?: string, position?: Position): PythonParseError {
  return new PythonParseError(message, filePath, position);
}

/**
 * Python 常用內建函數（用於安全檢查）
 */
export const DANGEROUS_FUNCTIONS = new Set([
  'eval',
  'exec',
  'compile',
  '__import__',
  'open',
  'input'
]);

/**
 * Python 安全性相關模組
 */
export const SECURITY_SENSITIVE_MODULES = new Set([
  'pickle',
  'marshal',
  'shelve',
  'subprocess',
  'os',
  'sys',
  'shutil',
  'tempfile'
]);

/**
 * PEP8 命名規範模式
 */
export const NAMING_PATTERNS = {
  /** snake_case：變數、函式、方法 */
  snakeCase: /^[a-z][a-z0-9_]*$/,
  /** UPPER_SNAKE_CASE：常量 */
  upperSnakeCase: /^[A-Z][A-Z0-9_]*$/,
  /** PascalCase：類別 */
  pascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  /** _private：私有成員 */
  privatePrefix: /^_[a-z][a-z0-9_]*$/,
  /** __dunder__：特殊方法 */
  dunderPattern: /^__[a-z][a-z0-9_]*__$/
};

/**
 * 檢查是否為測試檔案
 */
export function isPythonTestFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  return (
    fileName.startsWith('test_')
    || fileName.endsWith('_test.py')
    || fileName === 'conftest.py'
    || filePath.includes('/tests/')
    || filePath.includes('/test/')
  );
}
