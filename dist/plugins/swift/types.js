/**
 * Swift Parser 型別定義
 * 定義 Swift Parser 專用的資料結構和工具函式
 */
import { SymbolType, createScope, createPosition, createRange as createCoreRange } from '../../shared/types/index.js';
/**
 * Swift 節點型別枚舉
 */
export var SwiftNodeType;
(function (SwiftNodeType) {
    // 宣告
    SwiftNodeType["ClassDeclaration"] = "class_declaration";
    SwiftNodeType["StructDeclaration"] = "struct_declaration";
    SwiftNodeType["EnumDeclaration"] = "enum_declaration";
    SwiftNodeType["ProtocolDeclaration"] = "protocol_declaration";
    SwiftNodeType["FunctionDeclaration"] = "function_declaration";
    SwiftNodeType["InitDeclaration"] = "init_declaration";
    SwiftNodeType["DeinitDeclaration"] = "deinit_declaration";
    SwiftNodeType["VariableDeclaration"] = "variable_declaration";
    SwiftNodeType["ConstantDeclaration"] = "constant_declaration";
    SwiftNodeType["TypeAliasDeclaration"] = "typealias_declaration";
    SwiftNodeType["ExtensionDeclaration"] = "extension_declaration";
    // 語句
    SwiftNodeType["IfStatement"] = "if_statement";
    SwiftNodeType["GuardStatement"] = "guard_statement";
    SwiftNodeType["SwitchStatement"] = "switch_statement";
    SwiftNodeType["ForStatement"] = "for_statement";
    SwiftNodeType["WhileStatement"] = "while_statement";
    SwiftNodeType["RepeatStatement"] = "repeat_statement";
    SwiftNodeType["ReturnStatement"] = "return_statement";
    SwiftNodeType["BreakStatement"] = "break_statement";
    SwiftNodeType["ContinueStatement"] = "continue_statement";
    SwiftNodeType["ThrowStatement"] = "throw_statement";
    // 表達式
    SwiftNodeType["CallExpression"] = "call_expression";
    SwiftNodeType["PropertyAccess"] = "property_access";
    SwiftNodeType["SubscriptExpression"] = "subscript_expression";
    SwiftNodeType["ClosureExpression"] = "closure_expression";
    SwiftNodeType["LiteralExpression"] = "literal_expression";
    SwiftNodeType["Identifier"] = "identifier";
    // 其他
    SwiftNodeType["Parameter"] = "parameter";
    SwiftNodeType["GenericParameter"] = "generic_parameter";
    SwiftNodeType["TypeAnnotation"] = "type_annotation";
    SwiftNodeType["Comment"] = "comment";
    SwiftNodeType["Import"] = "import";
    SwiftNodeType["Unknown"] = "unknown";
})(SwiftNodeType || (SwiftNodeType = {}));
/**
 * Swift 符號型別枚舉
 */
export var SwiftSymbolType;
(function (SwiftSymbolType) {
    SwiftSymbolType["Class"] = "class";
    SwiftSymbolType["Struct"] = "struct";
    SwiftSymbolType["Enum"] = "enum";
    SwiftSymbolType["Protocol"] = "protocol";
    SwiftSymbolType["Function"] = "function";
    SwiftSymbolType["Method"] = "method";
    SwiftSymbolType["Initializer"] = "initializer";
    SwiftSymbolType["Deinitializer"] = "deinitializer";
    SwiftSymbolType["Property"] = "property";
    SwiftSymbolType["Variable"] = "variable";
    SwiftSymbolType["Constant"] = "constant";
    SwiftSymbolType["TypeAlias"] = "typealias";
    SwiftSymbolType["Extension"] = "extension";
    SwiftSymbolType["EnumCase"] = "enum_case";
    SwiftSymbolType["Parameter"] = "parameter";
    SwiftSymbolType["Generic"] = "generic";
})(SwiftSymbolType || (SwiftSymbolType = {}));
/**
 * Swift 可見性修飾符
 */
export var SwiftVisibility;
(function (SwiftVisibility) {
    SwiftVisibility["Private"] = "private";
    SwiftVisibility["FilePrivate"] = "fileprivate";
    SwiftVisibility["Internal"] = "internal";
    SwiftVisibility["Public"] = "public";
    SwiftVisibility["Open"] = "open";
})(SwiftVisibility || (SwiftVisibility = {}));
/**
 * 預設編譯器選項
 */
export const DEFAULT_SWIFT_COMPILER_OPTIONS = {
    swiftVersion: '5.0',
    target: 'x86_64-apple-macosx10.15',
    strict: true,
    warningLevel: 'all'
};
/**
 * Swift 解析錯誤類別
 */
export class SwiftParseError extends Error {
    location;
    code;
    constructor(message, location, code) {
        super(message);
        this.location = location;
        this.code = code;
        this.name = 'SwiftParseError';
    }
}
// 工具函式
/**
 * 建立 Swift AST 節點
 */
export function createSwiftASTNode(type, range, children = [], treeNode) {
    return {
        type: type,
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
export function createSwiftSymbol(name, type, location, astNode, visibility = SwiftVisibility.Internal) {
    const scope = createScope('global'); // 預設 global scope
    const modifiers = [visibility];
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
export function createSwiftParseError(message, location, code) {
    return new SwiftParseError(message, location, code);
}
/**
 * 映射 Swift 符號型別到通用符號型別
 */
export function mapSwiftSymbolTypeToSymbolType(swiftType) {
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
export function isDeclarationNode(node) {
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
export function isTypeDeclarationNode(node) {
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
export function isValidSwiftIdentifier(name) {
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
export function isSwiftKeyword(name) {
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
export function positionToRange(start, end) {
    return createCoreRange(start, end || start);
}
/**
 * 建立基本範圍（Swift 專用的便利函式）
 */
export function createSwiftRange(startLine, startColumn, endLine, endColumn) {
    const start = createPosition(startLine, startColumn);
    const end = createPosition(endLine, endColumn);
    return createCoreRange(start, end);
}
//# sourceMappingURL=types.js.map