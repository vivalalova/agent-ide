/**
 * tree-sitter 橋接層
 * 負責 Parser 初始化和節點轉換
 */

import { Parser as TreeSitterParser, Language as TreeSitterLanguage, type Node as TreeSitterNode, type Tree as TreeSitterTree } from 'web-tree-sitter';
import { createRequire } from 'module';
import path from 'path';
import type { ASTMetadata } from '@shared/types/index.js';
import {
  type PythonASTNode,
  type PythonAST,
  PythonNodeKind,
  nodeTypeToKind,
  tsNodeToRange
} from './types.js';

const require = createRequire(import.meta.url);

/** 單例 Parser 實例 */
let parserInstance: TreeSitterParser | null = null;

/** Python 語言實例 */
let pythonLanguage: TreeSitterLanguage | null = null;

/** 初始化狀態 */
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * 初始化 tree-sitter Parser
 * 使用單例模式，確保只初始化一次
 */
export async function initializeParser(): Promise<TreeSitterParser> {
  if (parserInstance && isInitialized) {
    return parserInstance;
  }

  // 避免重複初始化
  if (initializationPromise) {
    await initializationPromise;
    return parserInstance!;
  }

  initializationPromise = (async () => {
    await TreeSitterParser.init();
    parserInstance = new TreeSitterParser();

    // 載入 Python 語言 WASM
    const wasmPath = resolveWasmPath();
    pythonLanguage = await TreeSitterLanguage.load(wasmPath);
    parserInstance.setLanguage(pythonLanguage);

    isInitialized = true;
  })();

  await initializationPromise;
  return parserInstance!;
}

/**
 * 解析 WASM 檔案路徑
 */
function resolveWasmPath(): string {
  // 嘗試從 node_modules 解析
  try {
    const treeSitterPythonPath = require.resolve('tree-sitter-python');
    const packageDir = path.dirname(treeSitterPythonPath);
    return path.join(packageDir, 'tree-sitter-python.wasm');
  } catch {
    // 備用路徑
    return path.join(
      process.cwd(),
      'node_modules',
      'tree-sitter-python',
      'tree-sitter-python.wasm'
    );
  }
}

/**
 * 獲取 Parser 實例
 * @throws 如果 Parser 未初始化
 */
export function getParser(): TreeSitterParser {
  if (!parserInstance || !isInitialized) {
    throw new Error('Parser 尚未初始化，請先調用 initializeParser()');
  }
  return parserInstance;
}

/**
 * 檢查 Parser 是否已初始化
 */
export function isParserInitialized(): boolean {
  return isInitialized && parserInstance !== null;
}

/**
 * 解析 Python 程式碼
 */
export async function parseCode(code: string): Promise<TreeSitterTree> {
  const parser = await initializeParser();
  const tree = parser.parse(code);
  if (!tree) {
    throw new Error('解析失敗：無法解析程式碼');
  }
  return tree;
}

/**
 * 轉換 tree-sitter Node 為 PythonASTNode
 */
export function convertNode(node: TreeSitterNode, sourceFile: string): PythonASTNode {
  const type = node.type;
  const range = tsNodeToRange(node);
  const pythonKind = nodeTypeToKind(type);

  // 提取節點屬性
  const properties: Record<string, unknown> = {
    nodeType: type,
    isNamed: node.isNamed,
    childCount: node.childCount,
    namedChildCount: node.namedChildCount
  };

  // 提取名稱（如果存在）
  const nameNode = node.childForFieldName('name');
  if (nameNode) {
    properties.name = nameNode.text;
  }

  // 提取型別註解（如果存在）
  let typeAnnotation: string | undefined;
  const typeNode = node.childForFieldName('type')
    || node.childForFieldName('return_type');
  if (typeNode) {
    typeAnnotation = typeNode.text;
    properties.typeAnnotation = typeAnnotation;
  }

  // 提取裝飾器（如果是 decorated_definition）
  let decorators: string[] | undefined;
  if (type === PythonNodeKind.DecoratedDefinition) {
    decorators = extractDecorators(node);
    if (decorators.length > 0) {
      properties.decorators = decorators;
    }
  }

  // 遞歸轉換子節點
  const children: PythonASTNode[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const childNode = node.namedChild(i);
    if (childNode) {
      children.push(convertNode(childNode, sourceFile));
    }
  }

  const astNode: PythonASTNode = {
    type,
    range,
    properties,
    children,
    treeSitterNode: node,
    pythonKind,
    ...(decorators ? { decorators } : {}),
    ...(typeAnnotation ? { typeAnnotation } : {})
  };

  // 設定父子關係
  for (const child of children) {
    (child as { parent?: PythonASTNode }).parent = astNode;
  }

  return astNode;
}

/**
 * 從 decorated_definition 節點提取裝飾器
 */
function extractDecorators(node: TreeSitterNode): string[] {
  const decorators: string[] = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'decorator') {
      // 提取裝飾器名稱（去掉 @）
      const decoratorText = child.text.replace(/^@/, '').trim();
      // 只取函數名稱部分（不含參數）
      const nameMatch = decoratorText.match(/^[\w.]+/);
      if (nameMatch) {
        decorators.push(nameMatch[0]);
      }
    }
  }

  return decorators;
}

/**
 * 創建 PythonAST
 */
export function createPythonAST(tree: TreeSitterTree, sourceFile: string, parseTime: number): PythonAST {
  const root = convertNode(tree.rootNode, sourceFile);
  const nodeCount = countNodes(root);

  const metadata: ASTMetadata = {
    language: 'python',
    version: '3.8+',
    parserOptions: {},
    parseTime,
    nodeCount
  };

  return {
    sourceFile,
    root,
    metadata,
    tree
  };
}

/**
 * 計算節點總數
 */
function countNodes(node: PythonASTNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child as PythonASTNode);
  }
  return count;
}

/**
 * 遍歷 AST 節點
 */
export function traverseAST(
  node: PythonASTNode,
  callback: (node: PythonASTNode) => boolean | void
): void {
  const shouldContinue = callback(node);
  if (shouldContinue === false) {
    return;
  }

  for (const child of node.children) {
    traverseAST(child as PythonASTNode, callback);
  }
}

/**
 * 查找特定類型的節點
 */
export function findNodesByKind(root: PythonASTNode, kind: PythonNodeKind): PythonASTNode[] {
  const result: PythonASTNode[] = [];

  traverseAST(root, (node) => {
    if (node.pythonKind === kind) {
      result.push(node);
    }
  });

  return result;
}

/**
 * 查找包含指定位置的節點
 */
export function findNodeAtPosition(root: PythonASTNode, line: number, column: number): PythonASTNode | null {
  let result: PythonASTNode | null = null;

  traverseAST(root, (node) => {
    const { start, end } = node.range;
    const isInRange = (
      (line > start.line || (line === start.line && column >= start.column))
      && (line < end.line || (line === end.line && column <= end.column))
    );

    if (isInRange) {
      result = node;
    }
  });

  return result;
}

/**
 * 獲取節點的文字內容
 */
export function getNodeText(node: PythonASTNode): string {
  return node.treeSitterNode.text;
}

/**
 * 獲取節點的指定欄位
 */
export function getFieldNode(node: PythonASTNode, fieldName: string): PythonASTNode | null {
  const fieldNode = node.treeSitterNode.childForFieldName(fieldName);
  if (!fieldNode) {
    return null;
  }

  // 在 children 中找到對應的 PythonASTNode
  for (const child of node.children) {
    const pythonChild = child as PythonASTNode;
    if (pythonChild.treeSitterNode === fieldNode) {
      return pythonChild;
    }
  }

  // 如果在 children 中找不到，可能是匿名節點，需要重新轉換
  return convertNode(fieldNode, '');
}

/**
 * 釋放 Parser 資源
 */
export async function disposeParser(): Promise<void> {
  if (parserInstance) {
    parserInstance.delete();
    parserInstance = null;
  }
  pythonLanguage = null;
  isInitialized = false;
  initializationPromise = null;
}
