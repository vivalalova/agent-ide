/**
 * Python 錯誤處理檢查器
 * 檢查 bare except、空 except block 等問題
 */

import type { ErrorHandlingIssue } from '@infrastructure/parser/analysis-types.js';
import { type PythonAST, type PythonASTNode, PythonNodeKind } from '../types.js';
import { traverseAST, getNodeText } from '../tree-sitter-bridge.js';

/**
 * Python 錯誤處理檢查器類別
 */
export class PythonErrorHandlingChecker {
  /**
   * 檢查錯誤處理問題
   */
  check(code: string, ast: PythonAST): ErrorHandlingIssue[] {
    const issues: ErrorHandlingIssue[] = [];

    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.TryStatement) {
        this.checkTryStatement(node, ast.sourceFile, issues);
      }
    });

    return issues;
  }

  /**
   * 檢查 try 語句
   */
  private checkTryStatement(
    tryNode: PythonASTNode,
    filePath: string,
    issues: ErrorHandlingIssue[]
  ): void {
    // 遍歷 except 子句
    for (const child of tryNode.children) {
      const childNode = child as PythonASTNode;

      if (childNode.pythonKind === PythonNodeKind.ExceptClause) {
        this.checkExceptClause(childNode, filePath, issues);
      }
    }
  }

  /**
   * 檢查 except 子句
   */
  private checkExceptClause(
    exceptNode: PythonASTNode,
    filePath: string,
    issues: ErrorHandlingIssue[]
  ): void {
    const tsNode = exceptNode.treeSitterNode;

    // 檢查是否為 bare except（無異常類型）
    const exceptionType = tsNode.namedChild(0);
    const isBareExcept = !exceptionType || exceptionType.type === 'block';

    if (isBareExcept) {
      issues.push({
        type: 'silent-error',
        location: {
          filePath,
          line: exceptNode.range.start.line,
          column: exceptNode.range.start.column
        },
        message: '避免使用 bare except，應指定具體的異常類型',
        severity: 'error'
      });
    } else {
      // 檢查是否過於寬泛（Exception 或 BaseException）
      const typeName = exceptionType?.text;
      if (typeName === 'Exception' || typeName === 'BaseException') {
        issues.push({
          type: 'silent-error',
          location: {
            filePath,
            line: exceptNode.range.start.line,
            column: exceptNode.range.start.column
          },
          message: `捕獲 ${typeName} 過於寬泛，建議使用更具體的異常類型`,
          severity: 'warning'
        });
      }
    }

    // 檢查 except block 是否為空或只有 pass
    this.checkEmptyExceptBlock(exceptNode, filePath, issues);
  }

  /**
   * 檢查空的 except block
   */
  private checkEmptyExceptBlock(
    exceptNode: PythonASTNode,
    filePath: string,
    issues: ErrorHandlingIssue[]
  ): void {
    // 找到 block 節點
    let blockNode: PythonASTNode | null = null;
    for (const child of exceptNode.children) {
      const childNode = child as PythonASTNode;
      if (childNode.pythonKind === PythonNodeKind.Block) {
        blockNode = childNode;
        break;
      }
    }

    if (!blockNode) {return;}

    // 檢查 block 內容
    const statements = blockNode.children.filter(c => {
      const n = c as PythonASTNode;
      return n.pythonKind !== PythonNodeKind.Comment;
    });

    // 空 block
    if (statements.length === 0) {
      issues.push({
        type: 'empty-catch',
        location: {
          filePath,
          line: exceptNode.range.start.line,
          column: exceptNode.range.start.column
        },
        message: 'except block 為空，可能會靜默忽略錯誤',
        severity: 'error'
      });
      return;
    }

    // 只有 pass 語句
    if (
      statements.length === 1
      && (statements[0] as PythonASTNode).pythonKind === PythonNodeKind.PassStatement
    ) {
      issues.push({
        type: 'empty-catch',
        location: {
          filePath,
          line: exceptNode.range.start.line,
          column: exceptNode.range.start.column
        },
        message: 'except block 只有 pass，可能會靜默忽略錯誤',
        severity: 'warning'
      });
    }

    // 只有 ... (ellipsis)
    const firstStatement = statements[0] as PythonASTNode;
    if (
      statements.length === 1
      && firstStatement.treeSitterNode.type === 'expression_statement'
    ) {
      const expr = firstStatement.treeSitterNode.namedChild(0);
      if (expr?.type === 'ellipsis') {
        issues.push({
          type: 'empty-catch',
          location: {
            filePath,
            line: exceptNode.range.start.line,
            column: exceptNode.range.start.column
          },
          message: 'except block 只有 ...，可能會靜默忽略錯誤',
          severity: 'warning'
        });
      }
    }
  }
}
