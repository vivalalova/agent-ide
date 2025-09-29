import { describe, it, expect, beforeEach } from 'vitest';
import {
  ASTNode,
  ASTMetadata,
  AST,
  isASTNode,
  isASTMetadata,
  isAST,
  createASTNode,
  createASTMetadata,
  createAST,
  findNodeByPosition,
  findNodesByType,
  getNodePath,
  getNodeDepth,
  isNodeAncestorOf
} from '../../../src/shared/types/ast';
import { Position, createPosition, createRange } from '../../../src/shared/types/core';

describe('AST 型別系統', () => {
  describe('ASTNode 型別', () => {
    it('應該能建立基本的 ASTNode', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));
      const node = createASTNode('identifier', range, { name: 'test' });

      expect(node.type).toBe('identifier');
      expect(node.range).toEqual(range);
      expect(node.properties).toEqual({ name: 'test' });
      expect(node.children).toEqual([]);
      expect(node.parent).toBeUndefined();
    });

    it('應該能建立包含子節點的 ASTNode', () => {
      const parentRange = createRange(createPosition(1, 1), createPosition(3, 10));
      const childRange = createRange(createPosition(2, 1), createPosition(2, 5));

      const child = createASTNode('child', childRange);
      const parent = createASTNode('parent', parentRange, {}, [child]);

      expect(parent.children).toHaveLength(1);
      expect(parent.children[0].type).toBe('child');
      expect(parent.children[0].parent).toBe(parent);
    });

    it('應該拒絕空的節點類型', () => {
      const range = createRange(createPosition(1, 1), createPosition(1, 10));
      expect(() => createASTNode('', range)).toThrow('ASTNode 類型不能為空');
    });

    it('應該確保子節點的範圍在父節點內', () => {
      const parentRange = createRange(createPosition(1, 1), createPosition(1, 10));
      const childRange = createRange(createPosition(2, 1), createPosition(2, 5));

      const child = createASTNode('child', childRange);
      expect(() => createASTNode('parent', parentRange, {}, [child]))
        .toThrow('子節點範圍必須在父節點範圍內');
    });

    it('isASTNode 型別守衛應該正確驗證', () => {
      const validNode = {
        type: 'identifier',
        range: createRange(createPosition(1, 1), createPosition(1, 10)),
        properties: {},
        children: []
      };

      const invalidNode = {
        type: '',
        range: createRange(createPosition(1, 1), createPosition(1, 10))
      };

      expect(isASTNode(validNode)).toBe(true);
      expect(isASTNode(invalidNode)).toBe(false);
      expect(isASTNode(null)).toBe(false);
    });
  });

  describe('ASTMetadata 型別', () => {
    it('應該能建立 ASTMetadata', () => {
      const metadata = createASTMetadata('typescript', '5.0.0', {
        strictMode: true,
        experimentalDecorators: false
      });

      expect(metadata.language).toBe('typescript');
      expect(metadata.version).toBe('5.0.0');
      expect(metadata.parserOptions).toEqual({
        strictMode: true,
        experimentalDecorators: false
      });
      expect(metadata.parseTime).toBeGreaterThan(0);
      expect(metadata.nodeCount).toBe(0);
    });

    it('應該拒絕空的語言名稱', () => {
      expect(() => createASTMetadata('', '1.0.0')).toThrow('語言名稱不能為空');
    });

    it('應該拒絕空的版本號', () => {
      expect(() => createASTMetadata('typescript', '')).toThrow('版本號不能為空');
    });

    it('isASTMetadata 型別守衛應該正確驗證', () => {
      const validMetadata = {
        language: 'typescript',
        version: '5.0.0',
        parserOptions: {},
        parseTime: 100,
        nodeCount: 10
      };

      expect(isASTMetadata(validMetadata)).toBe(true);
      expect(isASTMetadata(null)).toBe(false);
      expect(isASTMetadata({ language: '' })).toBe(false);
    });
  });

  describe('AST 型別', () => {
    it('應該能建立完整的 AST', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 1));
      const root = createASTNode('program', range);
      const metadata = createASTMetadata('typescript', '5.0.0');

      const ast = createAST('test.ts', root, metadata);

      expect(ast.sourceFile).toBe('test.ts');
      expect(ast.root).toEqual(root);
      expect(ast.metadata.language).toBe('typescript');
    });

    it('應該拒絕空的原始檔案名稱', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 1));
      const root = createASTNode('program', range);
      const metadata = createASTMetadata('typescript', '5.0.0');

      expect(() => createAST('', root, metadata)).toThrow('原始檔案名稱不能為空');
    });

    it('應該自動更新 metadata 中的節點數量', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 1));
      const childRange = createRange(createPosition(2, 1), createPosition(2, 10));
      const child = createASTNode('identifier', childRange);
      const root = createASTNode('program', range, {}, [child]);
      const metadata = createASTMetadata('typescript', '5.0.0');

      const ast = createAST('test.ts', root, metadata);

      expect(ast.metadata.nodeCount).toBe(2); // root + child
    });

    it('isAST 型別守衛應該正確驗證', () => {
      const range = createRange(createPosition(1, 1), createPosition(10, 1));
      const root = createASTNode('program', range);
      const metadata = createASTMetadata('typescript', '5.0.0');

      const validAST = {
        sourceFile: 'test.ts',
        root: root,
        metadata: metadata
      };

      expect(isAST(validAST)).toBe(true);
      expect(isAST(null)).toBe(false);
      expect(isAST({ sourceFile: '' })).toBe(false);
    });
  });

  describe('AST 查詢功能', () => {
    let testAST: AST;

    beforeEach(() => {
      // 建立測試用的 AST
      const programRange = createRange(createPosition(1, 1), createPosition(10, 1));
      const functionRange = createRange(createPosition(2, 1), createPosition(8, 1));
      const identifierRange = createRange(createPosition(2, 10), createPosition(2, 15));
      const bodyRange = createRange(createPosition(3, 1), createPosition(7, 1));

      const identifier = createASTNode('identifier', identifierRange, { name: 'test' });
      const body = createASTNode('block', bodyRange);
      const functionNode = createASTNode('function', functionRange, {}, [identifier, body]);
      const program = createASTNode('program', programRange, {}, [functionNode]);
      const metadata = createASTMetadata('typescript', '5.0.0');

      testAST = createAST('test.ts', program, metadata);
    });

    it('應該能根據位置找到節點', () => {
      const position = createPosition(2, 12);
      const node = findNodeByPosition(testAST, position);

      expect(node).toBeDefined();
      expect(node?.type).toBe('identifier');
      expect(node?.properties.name).toBe('test');
    });

    it('應該能根據類型找到所有節點', () => {
      const nodes = findNodesByType(testAST, 'identifier');

      expect(nodes).toHaveLength(1);
      expect(nodes[0].properties.name).toBe('test');
    });

    it('應該能取得節點的路徑', () => {
      const position = createPosition(2, 12);
      const node = findNodeByPosition(testAST, position);

      if (node) {
        const path = getNodePath(node);
        expect(path).toEqual(['program', 'function', 'identifier']);
      }
    });

    it('應該能計算節點的深度', () => {
      const position = createPosition(2, 12);
      const node = findNodeByPosition(testAST, position);

      if (node) {
        const depth = getNodeDepth(node);
        expect(depth).toBe(2);
      }
    });

    it('應該能檢查節點的祖先關係', () => {
      const identifierPos = createPosition(2, 12);
      const identifier = findNodeByPosition(testAST, identifierPos);

      const functionPos = createPosition(2, 5);
      const functionNode = findNodeByPosition(testAST, functionPos);

      if (identifier && functionNode) {
        expect(isNodeAncestorOf(functionNode, identifier)).toBe(true);
        expect(isNodeAncestorOf(identifier, functionNode)).toBe(false);
      }
    });
  });
});

