/**
 * AST 相關型別定義
 * 包含 ASTNode、ASTMetadata、AST 等型別
 */

import { Range, Position, isPositionInRange } from './core';

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
  readonly parseTime: number; // 解析時間（毫秒）
  readonly nodeCount: number; // 節點總數
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
export function createASTNode(
  type: string,
  range: Range,
  properties: Record<string, any> = {},
  children: ASTNode[] = []
): ASTNode {
  if (!type.trim()) {
    throw new Error('ASTNode 類型不能為空');
  }

  // 驗證子節點範圍必須在父節點範圍內
  for (const child of children) {
    if (!isRangeContained(child.range, range)) {
      throw new Error('子節點範圍必須在父節點範圍內');
    }
  }

  // 先建立節點但不設定 parent
  const childrenCopy = children.map(child => ({ ...child }));

  const node: ASTNode = {
    type,
    range,
    properties,
    children: childrenCopy
  };

  // 然後遞歸設定所有子節點的 parent 關係
  setParentRelationships(node);

  return node;
}

/**
 * 建立 ASTMetadata 的工廠函式
 */
export function createASTMetadata(
  language: string,
  version: string,
  parserOptions: Record<string, any> = {},
  parseTime: number = 0,
  nodeCount: number = 0
): ASTMetadata {
  if (!language.trim()) {
    throw new Error('語言名稱不能為空');
  }

  if (!version.trim()) {
    throw new Error('版本號不能為空');
  }

  return {
    language,
    version,
    parserOptions,
    parseTime: parseTime || Date.now(),
    nodeCount
  };
}

/**
 * 建立 AST 的工廠函式
 */
export function createAST(
  sourceFile: string,
  root: ASTNode,
  metadata: ASTMetadata
): AST {
  if (!sourceFile.trim()) {
    throw new Error('原始檔案名稱不能為空');
  }

  // 計算節點數量
  const nodeCount = countNodes(root);
  const updatedMetadata = { ...metadata, nodeCount };

  return {
    sourceFile,
    root,
    metadata: updatedMetadata
  };
}

/**
 * ASTNode 型別守衛
 */
export function isASTNode(value: unknown): value is ASTNode {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.type === 'string' &&
    obj.type.trim().length > 0 &&
    obj.range && typeof obj.range === 'object' &&
    obj.properties && typeof obj.properties === 'object' &&
    Array.isArray(obj.children)
  ) as boolean;
}

/**
 * ASTMetadata 型別守衛
 */
export function isASTMetadata(value: unknown): value is ASTMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.language === 'string' &&
    obj.language.trim().length > 0 &&
    typeof obj.version === 'string' &&
    obj.version.trim().length > 0 &&
    obj.parserOptions && typeof obj.parserOptions === 'object' &&
    typeof obj.parseTime === 'number' &&
    typeof obj.nodeCount === 'number'
  ) as boolean;
}

/**
 * AST 型別守衛
 */
export function isAST(value: unknown): value is AST {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.sourceFile === 'string' &&
    obj.sourceFile.trim().length > 0 &&
    isASTNode(obj.root) &&
    isASTMetadata(obj.metadata)
  );
}

/**
 * 根據位置找到對應的 AST 節點
 */
export function findNodeByPosition(ast: AST, position: Position): ASTNode | null {
  return findNodeByPositionRecursive(ast.root, position);
}

/**
 * 根據類型找到所有匹配的 AST 節點
 */
export function findNodesByType(ast: AST, type: string): ASTNode[] {
  const result: ASTNode[] = [];
  findNodesByTypeRecursive(ast.root, type, result);
  return result;
}

/**
 * 取得節點的路徑（從根節點到該節點的類型路徑）
 */
export function getNodePath(node: ASTNode): string[] {
  const path: string[] = [];
  let currentNode: ASTNode | undefined = node;

  while (currentNode) {
    path.unshift(currentNode.type);
    currentNode = currentNode.parent;
  }

  return path;
}

/**
 * 計算節點的深度
 */
export function getNodeDepth(node: ASTNode): number {
  let depth = 0;
  let currentNode: ASTNode | undefined = node.parent;

  while (currentNode) {
    depth++;
    currentNode = currentNode.parent;
  }

  return depth;
}

/**
 * 檢查一個節點是否是另一個節點的祖先
 */
export function isNodeAncestorOf(ancestor: ASTNode, descendant: ASTNode): boolean {
  let currentNode: ASTNode | undefined = descendant.parent;

  while (currentNode) {
    if (currentNode === ancestor) {
      return true;
    }
    currentNode = currentNode.parent;
  }

  return false;
}

// 輔助函式

/**
 * 檢查一個範圍是否完全包含在另一個範圍內
 */
function isRangeContained(inner: Range, outer: Range): boolean {
  return isPositionInRange(inner.start, outer) && isPositionInRange(inner.end, outer);
}

/**
 * 遞歸計算節點數量
 */
function countNodes(node: ASTNode): number {
  let count = 1; // 計算自己
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

/**
 * 遞歸搜尋位置對應的節點
 */
function findNodeByPositionRecursive(node: ASTNode, position: Position): ASTNode | null {
  if (!isPositionInRange(position, node.range)) {
    return null;
  }

  // 先檢查子節點，找到最具體的節點
  for (const child of node.children) {
    const result = findNodeByPositionRecursive(child, position);
    if (result) {
      return result;
    }
  }

  // 如果子節點中沒有找到，返回當前節點
  return node;
}

/**
 * 遞歸搜尋類型匹配的節點
 */
function findNodesByTypeRecursive(node: ASTNode, type: string, result: ASTNode[]): void {
  if (node.type === type) {
    result.push(node);
  }

  for (const child of node.children) {
    findNodesByTypeRecursive(child, type, result);
  }
}

/**
 * 遞歸設定節點的 parent 關係
 */
function setParentRelationships(node: ASTNode, parent?: ASTNode): void {
  // 設定當前節點的 parent
  (node as any).parent = parent;

  // 遞歸設定所有子節點的 parent
  for (const child of node.children) {
    setParentRelationships(child, node);
  }
}