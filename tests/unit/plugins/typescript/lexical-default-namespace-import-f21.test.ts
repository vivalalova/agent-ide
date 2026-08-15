/**
 * F21 P2 — lexical-scope-binding 不認 default/namespace import（reproduction，先紅後綠）
 *
 * isImportBindingName 只認 ImportSpecifier（具名 import 的 local 名），漏：
 * - default import：`import Foo from './x'` → ImportClause.name
 * - namespace import：`import * as ns from './x'` → NamespaceImport.name
 *
 * 結果：same-file/shadow 過濾把真正的 import binding 誤判為「區域宣告遮蔽」，
 * 或無法正確把引用錨回 default/namespace import binding。
 */

import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import {
  findNearestLexicalDeclarationName,
  identifierShadowedByLocalDeclaration
} from '@plugins/typescript/lexical-scope-binding.js';

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile('f21.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function findIdentifierAtLine(sourceFile: ts.SourceFile, name: string, line1Based: number): ts.Identifier {
  let found: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(node) && node.text === name) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      if (line + 1 === line1Based) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!found) {
    throw new Error(`Identifier ${name} not found on line ${line1Based}`);
  }
  return found;
}

describe('F21：lexical 應認 default / namespace import 為 import binding', () => {
  it('default import 的 binding 不是「區域遮蔽」；同名參數才是遮蔽', () => {
    const code = [
      'import Foo from \'./mod\';',
      'export const ok = Foo;',
      'export function shadowed(Foo: number) { return Foo; }',
      ''
    ].join('\n');
    const sourceFile = parse(code);

    // line 2：真正綁定到 default import 的 Foo → 不應被判為 local shadow
    const importUse = findIdentifierAtLine(sourceFile, 'Foo', 2);
    expect(identifierShadowedByLocalDeclaration(importUse, sourceFile)).toBe(false);

    const nearestImportUse = findNearestLexicalDeclarationName(sourceFile, importUse, 'Foo');
    expect(nearestImportUse).toBeDefined();
    // 最近綁定必須是 default import 的 name（ImportClause），非其他東西
    expect(ts.isImportClause(nearestImportUse!.parent)).toBe(true);

    // line 3 的 return Foo：被參數 Foo 遮蔽（參數與 return 同列，找 return 後的那個）
    let returnFoo: ts.Identifier | undefined;
    const visit = (node: ts.Node): void => {
      if (returnFoo) {
        return;
      }
      if (ts.isReturnStatement(node) && node.expression && ts.isIdentifier(node.expression) && node.expression.text === 'Foo') {
        returnFoo = node.expression;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(returnFoo).toBeDefined();
    expect(identifierShadowedByLocalDeclaration(returnFoo!, sourceFile)).toBe(true);
  });

  it('namespace import 的 binding 不是「區域遮蔽」；同名參數才是遮蔽', () => {
    const code = [
      'import * as ns from \'./mod\';',
      'export const ok = ns.member;',
      'export function shadowed(ns: { member: number }) { return ns.member; }',
      ''
    ].join('\n');
    const sourceFile = parse(code);

    // line 2：`ns.member` 的 receiver ns 應錨到 namespace import，不算 local shadow
    const nsUse = findIdentifierAtLine(sourceFile, 'ns', 2);
    expect(identifierShadowedByLocalDeclaration(nsUse, sourceFile)).toBe(false);

    const nearest = findNearestLexicalDeclarationName(sourceFile, nsUse, 'ns');
    expect(nearest).toBeDefined();
    expect(ts.isNamespaceImport(nearest!.parent)).toBe(true);

    // line 3 被參數 ns 遮蔽的 receiver
    let shadowedReceiver: ts.Identifier | undefined;
    const visit = (node: ts.Node): void => {
      if (shadowedReceiver) {
        return;
      }
      if (
        ts.isPropertyAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'ns'
        && ts.isReturnStatement(node.parent)
      ) {
        shadowedReceiver = node.expression;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(shadowedReceiver).toBeDefined();
    expect(identifierShadowedByLocalDeclaration(shadowedReceiver!, sourceFile)).toBe(true);
  });
});
