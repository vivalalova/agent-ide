/**
 * AST 相關型別定義
 * 包含 ASTNode、ASTMetadata、AST 等型別
 */
import { Range, Position } from './core.js';
/**
 * AST 節點
 */
export interface ASTNode {
    readonly type: string;
    readonly range: Range;
    readonly properties: Record<string, any>;
    readonly children: readonly ASTNode[];
    readonly parent?: ASTNode;
}
/**
 * AST 元資料
 */
export interface ASTMetadata {
    readonly language: string;
    readonly version: string;
    readonly parserOptions: Record<string, any>;
    readonly parseTime: number;
    readonly nodeCount: number;
}
/**
 * AST 主介面
 */
export interface AST {
    readonly sourceFile: string;
    readonly root: ASTNode;
    readonly metadata: ASTMetadata;
}
/**
 * 建立 ASTNode 的工廠函式
 */
export declare function createASTNode(type: string, range: Range, properties?: Record<string, any>, children?: ASTNode[]): ASTNode;
/**
 * 建立 ASTMetadata 的工廠函式
 */
export declare function createASTMetadata(language: string, version: string, parserOptions?: Record<string, any>, parseTime?: number, nodeCount?: number): ASTMetadata;
/**
 * 建立 AST 的工廠函式
 */
export declare function createAST(sourceFile: string, root: ASTNode, metadata: ASTMetadata): AST;
/**
 * ASTNode 型別守衛
 */
export declare function isASTNode(value: unknown): value is ASTNode;
/**
 * ASTMetadata 型別守衛
 */
export declare function isASTMetadata(value: unknown): value is ASTMetadata;
/**
 * AST 型別守衛
 */
export declare function isAST(value: unknown): value is AST;
/**
 * 根據位置找到對應的 AST 節點
 */
export declare function findNodeByPosition(ast: AST, position: Position): ASTNode | null;
/**
 * 根據類型找到所有匹配的 AST 節點
 */
export declare function findNodesByType(ast: AST, type: string): ASTNode[];
/**
 * 取得節點的路徑（從根節點到該節點的類型路徑）
 */
export declare function getNodePath(node: ASTNode): string[];
/**
 * 計算節點的深度
 */
export declare function getNodeDepth(node: ASTNode): number;
/**
 * 檢查一個節點是否是另一個節點的祖先
 */
export declare function isNodeAncestorOf(ancestor: ASTNode, descendant: ASTNode): boolean;
//# sourceMappingURL=ast.d.ts.map