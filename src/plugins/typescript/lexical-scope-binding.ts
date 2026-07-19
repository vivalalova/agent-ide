/**
 * Lexical-scope binding / shadow analysis over a single TypeScript SourceFile.
 *
 * 手寫的詞法作用域模型，供兩層共用：
 *   - CLI 的 `--at` 引用過濾家族（same-file / 跨檔遮蔽 / receiver 判定）
 *   - plugin 層 language-service 的 AST 直接引用收集（namespace `ns.member` 錨定）
 *
 * 過去只在 CLI 層（interfaces/cli/commands）存在，但 plugin 層的 namespace member 錨定
 * 同樣需要「該 receiver 是否被更近的區域宣告遮蔽」的判定；plugin 不能反向依賴 interfaces，
 * 故將這組純 AST／位置分析（無任何 CLI 依賴）下沉到此，兩層一律引用、禁止各自複製一份。
 *
 * 與 `scope-analyzer.ts` 的 class-based `isShadowed` 是不同機制、服務不同消費端；此處是
 * 引用過濾家族先前逐步修正累積的位置式綁定模型（涵蓋 for-of / catch / case block /
 * 解構 / TDZ 等邊界），不與前者合併。
 */

import * as ts from 'typescript';
import { isRequireCall } from './cjs-require-ast.js';

/**
 * 判斷 require 解構 binding 是否 import-equivalent（非遮蔽）所需的外部比對能力。
 * `isImportBindingName` 對 ESM import binding 一律視為 import-equivalent（模組層語意固定）；
 * 但 CJS `const { a } = require('./mod')` 可出現在任意巢狀 scope，local 名稱節點相同不代表
 * 來源模組相同——是否 import-equivalent 需比對該 require 解析後的模組檔是否與呼叫端關注的
 * 目標一致。此比對牽涉檔案系統／tsconfig 路徑別名解析（async），已超出本檔「純 AST／位置分析」
 * 邊界，故以呼叫端注入的同步 predicate 表達：呼叫端可在自己的 async 階段預先解析完成、
 * 快取結果，再以此同步介面供 `identifierShadowedByLocalDeclaration` 於同步的 AST 比對路徑查詢。
 * 未提供 context 的既有呼叫端（call-hierarchy、rename language-service）維持舊行為，
 * require 解構一律視為 import-equivalent，不比對來源模組。
 */
export interface RequireBindingEquivalenceContext {
  isRequireBindingEquivalentToTarget(nameNode: ts.Identifier): boolean;
}

export function findAncestor(
  node: ts.Node,
  predicate: (ancestor: ts.Node) => boolean
): ts.Node | undefined {
  let current = node.parent;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }

  return undefined;
}

export function findNearestLexicalDeclarationName(
  sourceFile: ts.SourceFile,
  referenceNode: ts.Identifier,
  symbolName: string
): ts.Identifier | undefined {
  const referenceStart = referenceNode.getStart(sourceFile);
  let best: { name: ts.Identifier; scopeSpan: number; nameStart: number } | undefined;

  const visit = (node: ts.Node): void => {
    const name = getLexicalDeclarationName(node);
    if (name?.text === symbolName) {
      const nameStart = name.getStart(sourceFile);
      const scope = getLexicalDeclarationScope(node);
      const scopeStart = scope.getStart(sourceFile);
      const scopeEnd = scope.getEnd();
      // 靜態詞法綁定與宣告順序無關：let/const 綁定整個所屬 block（先用後宣告屬
      // TDZ runtime 概念、不改變綁定對象）、var/function 本就提升，因此可見性
      // 只看引用位置是否落在宣告的 scope 範圍內
      const isVisible = nameStart === referenceStart
        || (scopeStart <= referenceStart && referenceStart <= scopeEnd);

      if (isVisible) {
        const scopeSpan = scopeEnd - scopeStart;
        if (!best || scopeSpan < best.scopeSpan || (scopeSpan === best.scopeSpan && nameStart > best.nameStart)) {
          best = { name, scopeSpan, nameStart };
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return best?.name;
}

/**
 * 判斷引用位置的 identifier 是否被「更近的非 import 詞法宣告」遮蔽。
 *
 * 若引用位置最近的可見詞法宣告不是 import binding，代表該名稱被區域宣告
 * （參數、區域 const/let/var/function/class、解構綁定、for-of / for / catch 變數）遮蔽，
 * 非對匯入符號／namespace import 的引用。import binding 視為模組層宣告參與比較，故不算遮蔽。
 * 裸名 identifier、CallExpression callee、namespace receiver（`ns.member` 的 `ns`）都要過這道
 * 檢查，尺一致才不會漏放呼叫式引用、也不會把被遮蔽的 namespace receiver 誤留。
 */
export function identifierShadowedByLocalDeclaration(
  node: ts.Identifier,
  sourceFile: ts.SourceFile,
  requireBindingContext?: RequireBindingEquivalenceContext
): boolean {
  const nearest = findNearestLexicalDeclarationName(sourceFile, node, node.text);
  return nearest !== undefined && !isImportBindingName(nearest, requireBindingContext);
}

/**
 * 詞法宣告名稱節點是否來自 import binding：
 * - 具名 import specifier 的 local 名（`import { a as b }` 的 b）
 * - default import（`import Foo from '...'` → ImportClause.name）
 * - namespace import（`import * as ns from '...'` → NamespaceImport.name）
 * - CJS `const { a } = require('./mod')` 解構出的 local 名——與具名 import 同語意，
 *   本身就是被曝露的 binding，不是「遮蔽」它的一般區域宣告
 */
function isImportBindingName(name: ts.Identifier, requireBindingContext?: RequireBindingEquivalenceContext): boolean {
  const parent = name.parent;
  return ts.isImportSpecifier(parent)
    || (ts.isImportClause(parent) && parent.name === name)
    || (ts.isNamespaceImport(parent) && parent.name === name)
    || isRequireDestructuringBindingName(parent, name, requireBindingContext);
}

/**
 * BindingElement 的 local 名是否來自 `require(...)` 呼叫的解構、且為 import-equivalent
 * （見上方 isImportBindingName／RequireBindingEquivalenceContext）。
 * 未提供 requireBindingContext 時維持舊行為：只要是 require 解構就一律視為 import-equivalent。
 * 提供了 context，則交由呼叫端注入的比對結果判定——來源模組與目標不一致的區域 require
 * 解構視為真遮蔽（非 import-equivalent）。
 */
function isRequireDestructuringBindingName(
  parent: ts.Node,
  name: ts.Identifier,
  requireBindingContext?: RequireBindingEquivalenceContext
): boolean {
  if (!ts.isBindingElement(parent) || parent.name !== name) {
    return false;
  }
  const bindingPattern = parent.parent;
  if (!ts.isObjectBindingPattern(bindingPattern)) {
    return false;
  }
  const declaration = bindingPattern.parent;
  const isRequireDestructuring = ts.isVariableDeclaration(declaration)
    && !!declaration.initializer
    && isRequireCall(declaration.initializer);
  if (!isRequireDestructuring) {
    return false;
  }

  return requireBindingContext ? requireBindingContext.isRequireBindingEquivalentToTarget(name) : true;
}

function getLexicalDeclarationName(node: ts.Node): ts.Identifier | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
    && node.name
    && ts.isIdentifier(node.name)
  ) {
    return node.name;
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  // 解構綁定（`const { a: b } = obj`、`const [x] = arr`、`function f({ a })`）：
  // node.name 是實際綁定進 scope 的本地名稱（`{ a: b }` 綁的是 b，propertyName 才是 a）
  if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  if (ts.isImportSpecifier(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  // default import：`import Foo from '...'` — ImportClause.name
  if (ts.isImportClause(node) && node.name && ts.isIdentifier(node.name)) {
    return node.name;
  }

  // namespace import：`import * as ns from '...'` — NamespaceImport.name
  if (ts.isNamespaceImport(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }

  return undefined;
}

function getLexicalDeclarationScope(node: ts.Node): ts.Node {
  if (ts.isParameter(node)) {
    return findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
  }

  // 解構綁定：沿祖先鏈找到所屬的 VariableDeclaration 或 Parameter（跨巢狀解構亦適用，
  // 中間可能經過多層 BindingElement/BindingPattern），再套用該宣告種類的 scope 規則
  if (ts.isBindingElement(node)) {
    const bindingRoot = findAncestor(
      node,
      ancestor => ts.isVariableDeclaration(ancestor) || ts.isParameter(ancestor)
    );
    return bindingRoot ? getLexicalDeclarationScope(bindingRoot) : node.getSourceFile();
  }

  if (ts.isVariableDeclaration(node)) {
    if (isVarDeclaration(node)) {
      return findAncestor(node, ts.isFunctionLike) ?? node.getSourceFile();
    }

    // `catch (e) { ... }`：block-scoped 宣告本體是 CatchClause，非 VariableDeclarationList
    if (ts.isCatchClause(node.parent)) {
      return node.parent;
    }

    // `for (const x of …)` / `for (const x in …)` / `for (let x; …)`：宣告位於迴圈頭，
    // 迴圈本體是宣告的兄弟節點而非子節點，scope 須取整個迴圈語句（頭+本體）才涵蓋本體引用，
    // 且讓迴圈外的同名引用正確落在 scope 之外、不被誤判為遮蔽
    if (ts.isVariableDeclarationList(node.parent)) {
      const loopStatement = node.parent.parent;
      if (
        ts.isForStatement(loopStatement)
        || ts.isForOfStatement(loopStatement)
        || ts.isForInStatement(loopStatement)
      ) {
        return loopStatement;
      }

      // `case 1: let y = 1;`（無大括號）：祖鏈為 VariableDeclarationList → VariableStatement →
      // CaseClause/DefaultClause → CaseBlock，下面泛用 fallback 只認得 Block／SourceFile、
      // `ts.isBlock()` 對 CaseBlock 回傳 false，會直接跳到外層函式 Block，導致 case 內宣告
      // 誤判為遮蔽整個函式。case 內若有明確 `{ }` 會先命中該內層 Block（優先於 CaseBlock），
      // 因此只在宣告與 CaseBlock 之間沒有其他 Block 時才收斂為 CaseBlock（ECMA-262：case 內
      // let/const 的 TDZ scope 涵蓋整個 CaseBlock）
      const nearestBoundary = findAncestor(
        node,
        ancestor => ts.isBlock(ancestor) || ts.isCaseBlock(ancestor) || ts.isSourceFile(ancestor)
      );
      if (nearestBoundary && ts.isCaseBlock(nearestBoundary)) {
        return nearestBoundary;
      }
    }
  }

  return findAncestor(node, parent => ts.isBlock(parent) || ts.isSourceFile(parent)) ?? node.getSourceFile();
}

function isVarDeclaration(node: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.BlockScoped) === 0;
}
