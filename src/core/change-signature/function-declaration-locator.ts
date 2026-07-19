/**
 * 函式宣告定位
 * 依名稱＋行號在原始碼 AST 中定位目標函式／方法宣告節點，並偵測 overload 簽章群。
 */

import * as ts from 'typescript';
import { tsPositionToPosition } from '@plugins/typescript/types.js';
import type { FileUtils } from '@core/foundations/index.js';
import type { FunctionSignature } from './types.js';
import { getScriptKind } from './script-kind.js';

export class FunctionDeclarationLocator {
  constructor(private readonly fileUtils: FileUtils) {}

  /**
   * 偵測目標是否屬於 overload 簽章群：同一 scope 內有 ≥2 個同名的 FunctionDeclaration／
   * MethodDeclaration，且其中存在無 body 者（overload 簽章；實作宣告才有 body）。
   * 回傳每個同名宣告的行號（1-based，供拒絕訊息列位置）；非 overload 群時回傳 null。
   *
   * overload 群的簽章與實作必為「同一父節點」（模組層 statements 或 class members）的直接子節點，
   * 故以定位到的目標節點之 parent 為 scope 邊界收集兄弟宣告，不會把不同 class／作用域的同名符號
   * 誤判為同群。findFunctionLikeDeclaration 以名稱＋行號定位（overload 情況為第一個簽章）。
   */
  async detectOverloadSignatureGroup(signature: FunctionSignature): Promise<number[] | null> {
    const content = await this.fileUtils.readFile(signature.location.filePath);
    if (!content) {
      return null;
    }

    const sourceFile = ts.createSourceFile(
      signature.location.filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(signature.location.filePath)
    );
    const target = this.findFunctionLikeDeclaration(sourceFile, signature);
    if (!target || (!ts.isFunctionDeclaration(target) && !ts.isMethodDeclaration(target))) {
      return null;
    }

    const isSameNameFunctionLike = (
      node: ts.Node
    ): node is ts.FunctionDeclaration | ts.MethodDeclaration => {
      if (ts.isFunctionDeclaration(node)) {
        return node.name?.text === signature.name;
      }
      if (ts.isMethodDeclaration(node)) {
        return ts.isIdentifier(node.name) && node.name.text === signature.name;
      }
      return false;
    };

    const siblings: Array<ts.FunctionDeclaration | ts.MethodDeclaration> = [];
    ts.forEachChild(target.parent, (child) => {
      if (isSameNameFunctionLike(child)) {
        siblings.push(child);
      }
    });

    if (siblings.length < 2 || !siblings.some(node => node.body === undefined)) {
      return null;
    }

    return siblings.map(node =>
      tsPositionToPosition(sourceFile, node.getStart(sourceFile)).line
    );
  }

  findFunctionLikeDeclaration(
    sourceFile: ts.SourceFile,
    signature: FunctionSignature
  ): ts.FunctionLikeDeclaration | undefined {
    let found: ts.FunctionLikeDeclaration | undefined;

    const visit = (node: ts.Node): void => {
      if (found) {
        return;
      }

      if (this.isNamedFunctionLikeDeclaration(node, signature.name)) {
        const start = tsPositionToPosition(sourceFile, node.getStart(sourceFile));
        if (start.line === signature.location.range.start.line) {
          found = node;
          return;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return found;
  }

  private isNamedFunctionLikeDeclaration(node: ts.Node, name: string): node is ts.FunctionLikeDeclaration {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node))
      && this.getFunctionLikeName(node) === name
    ) {
      return true;
    }

    if (ts.isArrowFunction(node)) {
      const parent = node.parent;
      return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.name.text === name;
    }

    return false;
  }

  private getFunctionLikeName(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression): string | undefined {
    const nodeName = node.name;
    if (!nodeName) {
      return undefined;
    }
    if (ts.isIdentifier(nodeName) || ts.isStringLiteral(nodeName) || ts.isNumericLiteral(nodeName)) {
      return nodeName.text;
    }
    return undefined;
  }
}

export function createFunctionDeclarationLocator(fileUtils: FileUtils): FunctionDeclarationLocator {
  return new FunctionDeclarationLocator(fileUtils);
}
