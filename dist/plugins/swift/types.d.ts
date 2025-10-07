/**
 * Swift Parser 型別定義
 * 定義 Swift Parser 專用的資料結構和工具函式
 */
import type { AST, Symbol, ASTNode, Position, Range, Location } from '../../shared/types/index.js';
import { SymbolType } from '../../shared/types/index.js';
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
export declare enum SwiftNodeType {
    ClassDeclaration = "class_declaration",
    StructDeclaration = "struct_declaration",
    EnumDeclaration = "enum_declaration",
    ProtocolDeclaration = "protocol_declaration",
    FunctionDeclaration = "function_declaration",
    InitDeclaration = "init_declaration",
    DeinitDeclaration = "deinit_declaration",
    VariableDeclaration = "variable_declaration",
    ConstantDeclaration = "constant_declaration",
    TypeAliasDeclaration = "typealias_declaration",
    ExtensionDeclaration = "extension_declaration",
    IfStatement = "if_statement",
    GuardStatement = "guard_statement",
    SwitchStatement = "switch_statement",
    ForStatement = "for_statement",
    WhileStatement = "while_statement",
    RepeatStatement = "repeat_statement",
    ReturnStatement = "return_statement",
    BreakStatement = "break_statement",
    ContinueStatement = "continue_statement",
    ThrowStatement = "throw_statement",
    CallExpression = "call_expression",
    PropertyAccess = "property_access",
    SubscriptExpression = "subscript_expression",
    ClosureExpression = "closure_expression",
    LiteralExpression = "literal_expression",
    Identifier = "identifier",
    Parameter = "parameter",
    GenericParameter = "generic_parameter",
    TypeAnnotation = "type_annotation",
    Comment = "comment",
    Import = "import",
    Unknown = "unknown"
}
/**
 * Swift 符號型別枚舉
 */
export declare enum SwiftSymbolType {
    Class = "class",
    Struct = "struct",
    Enum = "enum",
    Protocol = "protocol",
    Function = "function",
    Method = "method",
    Initializer = "initializer",
    Deinitializer = "deinitializer",
    Property = "property",
    Variable = "variable",
    Constant = "constant",
    TypeAlias = "typealias",
    Extension = "extension",
    EnumCase = "enum_case",
    Parameter = "parameter",
    Generic = "generic"
}
/**
 * Swift 可見性修飾符
 */
export declare enum SwiftVisibility {
    Private = "private",
    FilePrivate = "fileprivate",
    Internal = "internal",
    Public = "public",
    Open = "open"
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
export declare const DEFAULT_SWIFT_COMPILER_OPTIONS: SwiftCompilerOptions;
/**
 * Swift 解析錯誤類別
 */
export declare class SwiftParseError extends Error {
    readonly location?: Location | undefined;
    readonly code?: string | undefined;
    constructor(message: string, location?: Location | undefined, code?: string | undefined);
}
/**
 * 建立 Swift AST 節點
 */
export declare function createSwiftASTNode(type: SwiftNodeType, range: Range, children?: SwiftASTNode[], treeNode?: any): SwiftASTNode;
/**
 * 建立 Swift 符號
 */
export declare function createSwiftSymbol(name: string, type: SwiftSymbolType, location: Location, astNode: SwiftASTNode, visibility?: SwiftVisibility): SwiftSymbol;
/**
 * 建立 Swift 解析錯誤
 */
export declare function createSwiftParseError(message: string, location?: Location, code?: string): SwiftParseError;
/**
 * 映射 Swift 符號型別到通用符號型別
 */
export declare function mapSwiftSymbolTypeToSymbolType(swiftType: SwiftSymbolType): SymbolType;
/**
 * 檢查節點是否為宣告
 */
export declare function isDeclarationNode(node: SwiftASTNode): boolean;
/**
 * 檢查節點是否為型別宣告
 */
export declare function isTypeDeclarationNode(node: SwiftASTNode): boolean;
/**
 * 檢查是否為有效的 Swift 識別符
 */
export declare function isValidSwiftIdentifier(name: string): boolean;
/**
 * 檢查是否為 Swift 關鍵字
 */
export declare function isSwiftKeyword(name: string): boolean;
/**
 * 從位置資訊轉換為 Range
 */
export declare function positionToRange(start: Position, end?: Position): Range;
/**
 * 建立基本範圍（Swift 專用的便利函式）
 */
export declare function createSwiftRange(startLine: number, startColumn: number, endLine: number, endColumn: number): Range;
//# sourceMappingURL=types.d.ts.map