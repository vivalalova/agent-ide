/**
 * F22 P2 — scope-analyzer isShadowed 落後（reproduction，先紅後綠）
 *
 * isShadowed 只檢查：
 * - function-like 參數的 Identifier
 * - Block 內 VariableStatement 且 decl.name 為 Identifier
 *
 * 漏：
 * - for-of / for-in / for 頭的迴圈變數（宣告在迴圈頭，非 Block.statements）
 * - catch (e) 綁定
 * - 解構綁定 `const { x } = …` / `const [x] = …`
 *
 * 結果：findReferences / rename 會把被這些結構遮蔽的同名引用誤改。
 */

import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { createScopeAnalyzer } from '@plugins/typescript/scope-analyzer.js';

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile('f22.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** 找「定義端」Identifier（第一個符合 name 的宣告名） */
function findDefinitionName(sourceFile: ts.SourceFile, name: string): ts.Identifier {
  let found: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.name;
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node.name;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!found) {
    throw new Error(`definition ${name} not found`);
  }
  return found;
}

/** 找 ReturnStatement 內對 name 的 Identifier 引用 */
function findReturnIdentifier(sourceFile: ts.SourceFile, name: string): ts.Identifier {
  let found: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      if (ts.isIdentifier(node.expression) && node.expression.text === name) {
        found = node.expression;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!found) {
    throw new Error(`return ${name} not found`);
  }
  return found;
}

describe('F22：isShadowed 應涵蓋 for-of / catch / 解構', () => {
  const analyzer = createScopeAnalyzer();

  it('for-of 迴圈變數遮蔽外層同名綁定時，body 內引用應判 isShadowed', () => {
    const code = [
      'const item = 0;',
      'function run(arr: number[]) {',
      '  for (const item of arr) {',
      '    return item;',
      '  }',
      '  return item;',
      '}',
      ''
    ].join('\n');
    const sourceFile = parse(code);
    const outerDef = findDefinitionName(sourceFile, 'item');

    // for-of body 內 return item → 應被 for-of 的 item 遮蔽
    let bodyReturn: ts.Identifier | undefined;
    let outerReturn: ts.Identifier | undefined;
    const visit = (node: ts.Node): void => {
      if (ts.isForOfStatement(node)) {
        const body = node.statement;
        const findIn = (n: ts.Node): void => {
          if (bodyReturn) {
            return;
          }
          if (ts.isReturnStatement(n) && n.expression && ts.isIdentifier(n.expression) && n.expression.text === 'item') {
            bodyReturn = n.expression;
            return;
          }
          ts.forEachChild(n, findIn);
        };
        findIn(body);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    // 第二個 return item（迴圈外）
    const returns: ts.Identifier[] = [];
    const collect = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression && ts.isIdentifier(node.expression) && node.expression.text === 'item') {
        returns.push(node.expression);
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
    expect(returns.length).toBeGreaterThanOrEqual(2);
    bodyReturn = returns[0];
    outerReturn = returns[1];

    expect(analyzer.isShadowed(bodyReturn!, outerDef)).toBe(true);
    // 迴圈外的 return item 仍綁外層 const item，不應被判遮蔽
    expect(analyzer.isShadowed(outerReturn!, outerDef)).toBe(false);
  });

  it('catch 綁定遮蔽外層同名時，catch body 內引用應判 isShadowed', () => {
    const code = [
      'const err = null;',
      'function run() {',
      '  try {',
      "    throw new Error('x');",
      '  } catch (err) {',
      '    return err;',
      '  }',
      '  return err;',
      '}',
      ''
    ].join('\n');
    const sourceFile = parse(code);
    const outerDef = findDefinitionName(sourceFile, 'err');

    const returns: ts.Identifier[] = [];
    const collect = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression && ts.isIdentifier(node.expression) && node.expression.text === 'err') {
        returns.push(node.expression);
      }
      ts.forEachChild(node, collect);
    };
    collect(sourceFile);
    expect(returns.length).toBeGreaterThanOrEqual(2);

    // catch body 內
    expect(analyzer.isShadowed(returns[0], outerDef)).toBe(true);
    // try/catch 外
    expect(analyzer.isShadowed(returns[1], outerDef)).toBe(false);
  });

  it('解構綁定遮蔽外層同名時，區塊內引用應判 isShadowed', () => {
    const code = [
      'const value = 1;',
      'function run(obj: { value: number }) {',
      '  {',
      '    const { value } = obj;',
      '    return value;',
      '  }',
      '}',
      ''
    ].join('\n');
    const sourceFile = parse(code);
    const outerDef = findDefinitionName(sourceFile, 'value');
    const innerUse = findReturnIdentifier(sourceFile, 'value');

    // Bug：isShadowed 只看 Identifier 形 VariableDeclaration，解構 BindingElement 漏檢
    expect(analyzer.isShadowed(innerUse, outerDef)).toBe(true);
  });
});
