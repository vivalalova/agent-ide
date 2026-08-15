/**
 * Range Finder
 * 程式碼區塊範圍查找工具
 */

import { computeCodeStateMask, findMatchingBodyBraceEnd } from '@core/foundations/index.js';
import * as ts from 'typescript';

/**
 * 找到程式碼區塊結尾（大括號配對）
 *
 * 委派共用的 findMatchingBodyBraceEnd（見 code-state-mask.ts）：以 mask 排除
 * 字串/模板字面值/註解內的括號干擾，並在尚未找到本體開括號前以 angle-bracket
 * 深度跳過泛型子句（如 `class Box<T extends { value: string }>`）內的巢狀
 * 大括號，避免其被誤判為本體開括號（見缺陷：泛型約束物件型別的 `{`/`}` 提前
 * 配對歸零，導致 class 主體被截斷成只剩宣告行）。小括號深度追蹤則讓宣告主體
 * 開括號之前、參數列表內的自我封閉 `{...}`（如預設值物件 `(opts = { a: 1 }) => {`）
 * 不會被誤判為區塊已結束（見 M1 bug：合法巢狀括號在語法上必然與外層小括號
 * 同深度成對出現，故此判定對正常程式碼恆成立）。
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 區塊結束行索引；找不到（未閉合）時回傳 startLine
 */
export function findBlockEnd(lines: string[], startLine: number): number {
  const text = lines.slice(startLine).join('\n');
  const braceEndIndex = findMatchingBodyBraceEnd(text, 0);

  if (braceEndIndex === -1) {
    return startLine;
  }

  return startLine + text.slice(0, braceEndIndex).split('\n').length - 1;
}

/**
 * 找到方法宣告的結尾，並判定該宣告是否含 body
 *
 * 從宣告行開始逐字掃描（沿用 findBlockEnd 的 mask/小括號深度判定），找到參數列表
 * 結束後第一個出現的 `{`（進入方法本體）或 `;`（純簽章結尾，無 body）：
 * - 先遇到 `{`：委派 findBlockEnd 找到方法本體結束行，hasBody = true
 * - 先遇到 `;`：純簽章宣告（如 overload signature、abstract 方法），結尾即該行，
 *   hasBody = false
 *
 * 背景（T4 bug）：舊行為對「無 body 的方法簽章」（如 overload 的
 * `foo(a: number): void;`）誤用 findBlockEnd，導致掃描跨越到後面幾行才找到的
 * `{`（實際屬於下一個 overload 簽章或真正的實作），讓簽章候選的範圍誤跨越、
 * 與實作候選的範圍重疊，最終搬移時只選中其中一個候選、留下孤兒簽章。
 *
 * @param lines 程式碼行陣列
 * @param declLine 宣告本身所在行索引（0-based）
 * @returns 結尾行索引（0-based）與是否含 body
 */
export function findMethodDeclarationEnd(
  lines: string[],
  declLine: number
): { endLine: number; hasBody: boolean } {
  const text = lines.slice(declLine).join('\n');
  const codeMask = computeCodeStateMask(text);

  let parenDepth = 0;
  let lineIndex = declLine;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      lineIndex++;
      continue;
    }

    if (!codeMask[i]) {
      continue;
    }

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '{' && parenDepth === 0) {
      return { endLine: findBlockEnd(lines, declLine), hasBody: true };
    } else if (char === ';' && parenDepth === 0) {
      return { endLine: lineIndex, hasBody: false };
    }
  }

  return { endLine: declLine, hasBody: false };
}

/**
 * 找到類型別名結尾
 *
 * 以 TypeScript parser 取得第一個 top-level type alias 的 AST 結尾，避免以行尾 token
 * 推測 union、comment、JSDoc、generic 與 literal 的續行語意。
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 型別別名結束行索引
 */
export function findTypeAliasEnd(lines: string[], startLine: number): number {
  const text = lines.slice(startLine).join('\n');
  const sourceFile = ts.createSourceFile(
    'range-finder.ts',
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const typeAlias = sourceFile.statements.find(ts.isTypeAliasDeclaration);

  // 呼叫端以 regex 掃原始文字定位宣告行，註解/字串裡形如宣告的行也會被傳進來；
  // 此時切片後面真正的 alias 不屬於 startLine 這個宣告，不得誤抓其結尾。
  if (
    typeAlias === undefined ||
    sourceFile.getLineAndCharacterOfPosition(typeAlias.getStart(sourceFile)).line !== 0
  ) {
    return startLine;
  }

  return startLine + sourceFile.getLineAndCharacterOfPosition(typeAlias.getEnd()).line;
}

/**
 * 找到陳述句結尾
 * 處理多行箭頭函式：追蹤括號深度，避免將參數預設值的 `=` 誤判為語句結束
 *
 * 逐字元累計括號深度時比照 findBlockEnd 套用 computeCodeStateMask，只對 mask
 * 標記為 code 的字元做括號/分號/等號判定，避免字串/模板字面值/註解內恰巧出現
 * 的 `(`/`)`/`;`/`=` 干擾判定（見 R2-7 bug：字串內不成對的 `)` 使 parenDepth 失步）。
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 陳述句結束行索引
 */
export function findStatementEnd(lines: string[], startLine: number): number {
  const text = lines.slice(startLine).join('\n');
  const codeMask = computeCodeStateMask(text);

  let parenDepth = 0;
  let lineIndex = startLine;
  let hasSemicolon = false;
  let hasEquals = false;
  let hasArrow = false;
  let hasBrace = false;

  const evaluateLine = (): number | undefined => {
    if (parenDepth === 0) {
      if (hasSemicolon) {
        return lineIndex;
      }
      // 非箭頭函式的賦值（且不是起始行）
      if (hasEquals && !hasArrow && lineIndex > startLine) {
        return lineIndex;
      }
    }
    // 檢查是否是多行箭頭函式或物件（括號必須已閉合）
    if (parenDepth === 0 && hasBrace) {
      return findBlockEnd(lines, lineIndex);
    }
    return undefined;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      const result = evaluateLine();
      if (result !== undefined) {
        return result;
      }
      lineIndex++;
      hasSemicolon = false;
      hasEquals = false;
      hasArrow = false;
      hasBrace = false;
      continue;
    }

    if (!codeMask[i]) {
      continue;
    }

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth--;
    } else if (char === ';') {
      hasSemicolon = true;
    } else if (char === '=') {
      hasEquals = true;
      if (text[i + 1] === '>') {
        hasArrow = true;
      }
    } else if (char === '{') {
      hasBrace = true;
    }
  }

  // 處理最後一行（join 不含結尾換行，需在迴圈外再評估一次）
  const finalResult = evaluateLine();
  if (finalResult !== undefined) {
    return finalResult;
  }

  return startLine;
}
