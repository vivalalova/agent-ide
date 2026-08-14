/**
 * call-site 值運算式的自足性判定
 *
 * `--add` 未指定 function default 時，新參數在每個呼叫點的引數文字完全來自
 * `--call-site-value` 的運算式（見 call-site-updater 的 `callSiteValue ?? defaultValue`）。
 * 該運算式一旦引用外部識別字（如 `runtimeLabel`），呼叫端未必有同名繫結，逐字塞入會
 * 產生懸空識別字（TS2304）；只有「自足運算式」（字面值、自身宣告繫結的函式等）
 * 才能在無 function default 的情況下安全放行。
 */

import * as ts from 'typescript';
import { visitValueIdentifierReferences } from './value-identifier-references.js';

/**
 * 呼叫點恆可解析的識別字：`undefined` 在 AST 中是 Identifier 而非字面值，
 * 但其值在任何呼叫點都成立，不構成懸空引用。
 */
const ALWAYS_RESOLVABLE_IDENTIFIERS: ReadonlySet<string> = new Set(['undefined']);

/**
 * 找出運算式中「呼叫點不保證存在」的識別字（自足運算式回傳 undefined）。
 * 運算式內部自行宣告的繫結（如箭頭函式參數）由共用走訪的遮蔽規則排除。
 */
export function findUnresolvableIdentifierInCallSiteValue(expressionText: string): string | undefined {
  const initializer = parseExpressionInDefaultValuePosition(expressionText);
  if (!initializer) {
    // 語法錯誤由各層的運算式語法驗證負責回報，此處不重複判定
    return undefined;
  }

  const candidateNames = collectIdentifierTexts(initializer);
  if (candidateNames.size === 0) {
    return undefined;
  }

  let unresolvable: string | undefined;
  visitValueIdentifierReferences(initializer, candidateNames, node => {
    if (unresolvable === undefined && !ALWAYS_RESOLVABLE_IDENTIFIERS.has(node.text)) {
      unresolvable = node.text;
    }
  });
  return unresolvable;
}

/** 把運算式文字放進參數預設值語法位置解析，取得其 initializer 節點 */
function parseExpressionInDefaultValuePosition(expressionText: string): ts.Expression | undefined {
  const sourceFile = ts.createSourceFile(
    'change-signature-call-site-value.ts',
    `function __agentIdeCallSiteValue(__value = ${expressionText}) {}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  // parseDiagnostics 是 TS 編譯器內部屬性，未收錄於公開型別定義，需斷言存取
  const parseDiagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics: readonly ts.DiagnosticWithLocation[];
  }).parseDiagnostics;
  if (parseDiagnostics.length > 0) {
    return undefined;
  }

  const declaration = sourceFile.statements[0];
  if (!declaration || !ts.isFunctionDeclaration(declaration)) {
    return undefined;
  }
  return declaration.parameters[0]?.initializer;
}

/** 收集子樹內所有識別字文字，作為引用走訪的候選名稱集合 */
function collectIdentifierTexts(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current)) {
      names.add(current.text);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return names;
}
