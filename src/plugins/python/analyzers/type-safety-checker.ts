/**
 * Python 型別安全檢查器
 * 檢查缺少 type hints、Any 使用等問題
 */

import type { TypeSafetyIssue } from '@infrastructure/parser/analysis-types.js';
import { type PythonAST, type PythonASTNode, PythonNodeKind } from '../types.js';
import { traverseAST, getNodeText, getFieldNode } from '../tree-sitter-bridge.js';

/**
 * Python 型別安全檢查器類別
 */
export class PythonTypeSafetyChecker {
  /**
   * 檢查型別安全問題
   */
  check(code: string, ast: PythonAST): TypeSafetyIssue[] {
    const issues: TypeSafetyIssue[] = [];

    // 檢查函式缺少 type hints
    this.checkMissingTypeHints(ast, issues);

    // 檢查 Any 型別使用
    this.checkAnyUsage(ast, issues);

    // 檢查 cast() 使用
    this.checkCastUsage(ast, issues);

    // 檢查 # type: ignore 註解
    this.checkTypeIgnore(code, ast, issues);

    return issues;
  }

  /**
   * 檢查函式缺少 type hints
   */
  private checkMissingTypeHints(ast: PythonAST, issues: TypeSafetyIssue[]): void {
    traverseAST(ast.root, (node) => {
      if (
        node.pythonKind === PythonNodeKind.FunctionDefinition
        || node.pythonKind === PythonNodeKind.AsyncFunctionDefinition
      ) {
        // 跳過特殊方法
        const name = this.getFunctionName(node);
        if (this.isSpecialMethod(name)) {
          return;
        }

        // 檢查返回型別
        const returnType = node.treeSitterNode.childForFieldName('return_type');
        if (!returnType) {
          issues.push({
            type: 'any-type',
            location: {
              filePath: ast.sourceFile,
              line: node.range.start.line,
              column: node.range.start.column
            },
            message: `函式 '${name}' 缺少返回型別註解`,
            severity: 'warning'
          });
        }

        // 檢查參數型別
        this.checkParameterTypes(node, ast.sourceFile, issues);
      }
    });
  }

  /**
   * 檢查參數型別
   */
  private checkParameterTypes(
    funcNode: PythonASTNode,
    filePath: string,
    issues: TypeSafetyIssue[]
  ): void {
    const paramsNode = funcNode.treeSitterNode.childForFieldName('parameters');
    if (!paramsNode) {return;}

    for (let i = 0; i < paramsNode.namedChildCount; i++) {
      const param = paramsNode.namedChild(i);
      if (!param) {continue;}

      const paramName = param.childForFieldName('name')?.text || param.text;

      // 跳過 self 和 cls
      if (paramName === 'self' || paramName === 'cls') {continue;}

      // 跳過 *args 和 **kwargs
      if (param.type === 'list_splat_pattern' || param.type === 'dictionary_splat_pattern') {continue;}

      // 檢查是否有型別註解
      const hasType = param.type === 'typed_parameter'
        || param.type === 'typed_default_parameter'
        || param.childForFieldName('type');

      if (!hasType) {
        issues.push({
          type: 'any-type',
          location: {
            filePath,
            line: param.startPosition.row,
            column: param.startPosition.column
          },
          message: `參數 '${paramName}' 缺少型別註解`,
          severity: 'warning'
        });
      }
    }
  }

  /**
   * 檢查 Any 型別使用
   */
  private checkAnyUsage(ast: PythonAST, issues: TypeSafetyIssue[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Identifier) {
        const text = getNodeText(node);
        if (text === 'Any') {
          issues.push({
            type: 'any-type',
            location: {
              filePath: ast.sourceFile,
              line: node.range.start.line,
              column: node.range.start.column
            },
            message: '使用 Any 型別會降低型別安全性',
            severity: 'warning'
          });
        }
      }
    });
  }

  /**
   * 檢查 cast() 使用
   */
  private checkCastUsage(ast: PythonAST, issues: TypeSafetyIssue[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Call) {
        const funcNode = node.treeSitterNode.childForFieldName('function');
        if (funcNode?.text === 'cast') {
          issues.push({
            type: 'unsafe-cast',
            location: {
              filePath: ast.sourceFile,
              line: node.range.start.line,
              column: node.range.start.column
            },
            message: '使用 cast() 可能繞過型別檢查',
            severity: 'warning'
          });
        }
      }
    });
  }

  /**
   * 檢查 # type: ignore 註解
   */
  private checkTypeIgnore(code: string, ast: PythonAST, issues: TypeSafetyIssue[]): void {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('# type: ignore')) {
        issues.push({
          type: 'ignore-directive',
          location: {
            filePath: ast.sourceFile,
            line: i,
            column: line.indexOf('# type: ignore')
          },
          message: '使用 # type: ignore 忽略型別檢查',
          severity: 'warning'
        });
      }
    }
  }

  /**
   * 獲取函式名稱
   */
  private getFunctionName(node: PythonASTNode): string {
    const nameNode = node.treeSitterNode.childForFieldName('name');
    return nameNode?.text || '<anonymous>';
  }

  /**
   * 判斷是否為特殊方法
   */
  private isSpecialMethod(name: string): boolean {
    // __init__, __str__, __repr__ 等不需要完整 type hints
    return name.startsWith('__') && name.endsWith('__');
  }
}
