/**
 * Range Finder
 * 程式碼區塊範圍查找工具
 */

import { computeCodeStateMask } from '@core/foundations/index.js';

/**
 * 找到程式碼區塊結尾（大括號配對）
 *
 * 逐字元累計括號深度，並用 computeCodeStateMask 跳過字串/模板字面值/註解內的括號，
 * 避免其干擾配對判定。同時追蹤小括號深度：只有小括號深度為 0 時的 `{`/`}` 才計入
 * 區塊深度，讓宣告主體開括號之前、參數列表內的自我封閉 `{...}`（如預設值物件
 * `(opts = { a: 1 }) => {`）不會被誤判為區塊已結束（見 M1 bug：合法巢狀括號在
 * 語法上必然與外層小括號同深度成對出現，故此判定對正常程式碼恆成立）。
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 區塊結束行索引
 */
export function findBlockEnd(lines: string[], startLine: number): number {
  const text = lines.slice(startLine).join('\n');
  const codeMask = computeCodeStateMask(text);

  let depth = 0;
  let foundStart = false;
  let parenDepth = 0;
  let lineIndex = startLine;

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
      depth++;
      foundStart = true;
    } else if (char === '}' && parenDepth === 0) {
      depth--;
      if (foundStart && depth === 0) {
        return lineIndex;
      }
    }
  }

  return startLine;
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
 * 續行語法：目前行尾（依 code mask 忽略註解/字串後的最後一個 token）落在這些
 * 「未完成」token 上時，代表本行語法尚未完結，換行不得依 ASI 視為別名終點
 * （如 `type User =`、conditional type 的 `B extends C`）。
 * `(`/`[`/`{`/`<`不需列在此處：這些字元一律先觸發 depth/angleDepth 遞增，
 * 使下方 `depth === 0 && angleDepth === 0` 的外層守衛提前擋下（該字元所在行
 * 尚未閉合括號/泛型），本檢查永遠不會在這些字元收尾的行上被執行到。
 * `extends` 為關鍵字、需整詞比對；`=>` 以雙字元 token 另外標記。
 */
const UNFINISHED_TRAILING_PUNCTUATION = new Set(['=', '?', ':', '|', '&']);
const UNFINISHED_TRAILING_KEYWORDS = new Set(['extends']);

/** 下一行以這些符號或註解開頭時，視為上一行的續行（union/intersection/conditional type 等）。 */
const CONTINUATION_LEADING_TOKENS = ['|', '&', '?', ':', '>', ')', '}', ']'];

function isCommentOnlyLine(
  text: string,
  codeMask: boolean[],
  lineStartIndex: number,
  lineEndIndex: number
): boolean {
  for (let i = lineStartIndex; i < lineEndIndex; i++) {
    if (codeMask[i] && !/\s/.test(text[i])) {
      return false;
    }
  }
  return true;
}

function isGenericFunctionTypeParameterLine(
  text: string,
  codeMask: boolean[],
  lineStartIndex: number,
  lineEndIndex: number,
  lastToken: { char: string; word: string; isArrow: boolean }
): boolean {
  if (lastToken.char !== '>') {
    return false;
  }

  const codeLine = text
    .slice(lineStartIndex, lineEndIndex)
    .split('')
    .map((char, offset) => codeMask[lineStartIndex + offset] ? char : ' ')
    .join('')
    .trim();
  const equalsIndex = codeLine.indexOf('=');
  if (equalsIndex < 0) {
    return false;
  }

  // Only a type alias whose RHS starts with `<` is a generic function type
  // parameter list.  `type Alias = Existing<T>` followed by a new statement
  // must remain a terminated alias.
  return /^\s*(?:export\s+)?type\s+[^=]+=/u.test(codeLine)
    && codeLine.slice(equalsIndex + 1).trimStart().startsWith('<');
}

/**
 * 由 codeMask 標記的「程式碼」字元中，往回找目前行（lineEndIndex 為行尾換行符
 * 索引，不含）最後一個非空白字元，回傳其字元本身；若該字元屬識別符/關鍵字組成
 * 字元，另回傳其所在完整詞彙（供 `extends` 等關鍵字比對）。跳過字串/註解內容
 * （codeMask 為 false 的位置），故行尾拖著的行內註解不影響判定。
 */
function lastCodeTokenOnLine(
  text: string,
  codeMask: boolean[],
  lineStartIndex: number,
  lineEndIndex: number
): { char: string; word: string; isArrow: boolean } | undefined {
  let i = lineEndIndex - 1;
  while (i >= lineStartIndex) {
    if (!codeMask[i] || /\s/.test(text[i])) {
      i--;
      continue;
    }
    break;
  }
  if (i < lineStartIndex) {
    return undefined;
  }

  const char = text[i];
  if (!/[A-Za-z0-9_$]/.test(char)) {
    return {
      char,
      word: char,
      isArrow: char === '>' && i > lineStartIndex && text[i - 1] === '=' && codeMask[i - 1]
    };
  }

  const wordEnd = i + 1;
  let wordStart = i;
  while (wordStart >= lineStartIndex && codeMask[wordStart] && /[A-Za-z0-9_$]/.test(text[wordStart])) {
    wordStart--;
  }
  wordStart++;
  return { char, word: text.slice(wordStart, wordEnd), isArrow: false };
}

/**
 * 找到類型別名結尾
 * 支援多行 union/intersection 型別、多行 object type body（`{ ... }`）、多行泛型
 * 引數列表（`Foo<\n Bar\n>`）與多行 conditional type（`extends C\n ? D\n : E`）。
 *
 * 逐字元累計 `{`/`(`/`[` 與 `<`/`>`（泛型）巢狀深度（沿用 findBlockEnd 的 mask
 * 判定跳過字串/註解），只在深度歸零時才把 `;` 視為別名本身的終止分號；否則物件
 * 型別 body 內成員自帶的分號（如 `id: string;`）或泛型引數列表內的 `>` 會被誤判
 * 成別名已結束（見 P2 bug：多行 object type 被截斷；見 P1 bug：多行泛型引數列表
 * 只留第一行）。`=>`（function type）的 `>` 不計入泛型深度，避免誤配對。
 *
 * 深度歸零時遇到行尾（`\n`），代表本行所有括號/物件 body/泛型引數皆已閉合：此時
 * 若本行結尾是未完成 token（`=`/`extends`/`?`/`:`/`|`/`&` 等）、或下一行以續行
 * 符號（`|`/`&`/`?`/`:`/`>`/`)`/`}`/`]`）或註解開頭，視為續行，換行不終止別名；
 * 否則本行即為別名依 ASI 語意的實際終點，直接回傳，不可再往後掃描找 `;`——
 * 否則會把後面另一條陳述句自己的終止分號誤當成本別名的終止符（見 R2-6a bug：
 * `type User = string`（無分號結尾）下一行 `const live = 1;`，掃描全文字串找到
 * 的第一個 `;` 其實屬於 `const live` 這條陳述句，誤把它併入型別別名的來源範圍）。
 *
 * @param lines 程式碼行陣列
 * @param startLine 起始行索引（0-based）
 * @returns 型別別名結束行索引
 */
export function findTypeAliasEnd(lines: string[], startLine: number): number {
  const text = lines.slice(startLine).join('\n');
  const codeMask = computeCodeStateMask(text);

  let depth = 0;
  let angleDepth = 0;
  let lineIndex = startLine;
  let lineStartIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\n') {
      if (depth === 0 && angleDepth === 0) {
        const lastToken = lastCodeTokenOnLine(text, codeMask, lineStartIndex, i);
        if (lastToken === undefined) {
          lineIndex++;
          lineStartIndex = i + 1;
          continue;
        }
        const endsUnfinished = lastToken !== undefined
          && (UNFINISHED_TRAILING_PUNCTUATION.has(lastToken.char)
            || UNFINISHED_TRAILING_KEYWORDS.has(lastToken.word)
            || lastToken.isArrow);

        const nextLine = lines[lineIndex + 1]?.trim();
        const nextLineStartIndex = i + 1;
        const nextLineEndIndex = text.indexOf('\n', nextLineStartIndex) >= 0
          ? text.indexOf('\n', nextLineStartIndex)
          : text.length;
        let followingLineIndex = lineIndex + 1;
        let followingLineStartIndex = nextLineStartIndex;
        let followingLineEndIndex = nextLineEndIndex;
        while (
          lines[followingLineIndex] !== undefined
            && isCommentOnlyLine(
              text,
              codeMask,
              followingLineStartIndex,
              followingLineEndIndex
            )
        ) {
          followingLineIndex++;
          followingLineStartIndex = followingLineEndIndex < text.length
            ? followingLineEndIndex + 1
            : text.length;
          followingLineEndIndex = text.indexOf('\n', followingLineStartIndex) >= 0
            ? text.indexOf('\n', followingLineStartIndex)
            : text.length;
        }
        const followingLine = lines[followingLineIndex]?.trim();
        const continuationAfterComments = followingLineIndex > lineIndex + 1
          && followingLine !== undefined
          && CONTINUATION_LEADING_TOKENS.some(token => followingLine.startsWith(token));
        const nextIsContinuation = nextLine !== undefined
          && (CONTINUATION_LEADING_TOKENS.some(token => nextLine.startsWith(token))
            || (endsUnfinished && isCommentOnlyLine(
              text,
              codeMask,
              nextLineStartIndex,
              nextLineEndIndex
            ))
            || (
              nextLine?.startsWith('(') === true
              && isGenericFunctionTypeParameterLine(
                text,
                codeMask,
                lineStartIndex,
                i,
                lastToken
              )
            )
            || continuationAfterComments);

        if (!endsUnfinished && !nextIsContinuation) {
          return lineIndex;
        }
      }
      lineIndex++;
      lineStartIndex = i + 1;
      continue;
    }

    if (!codeMask[i]) {
      continue;
    }

    if (char === '{' || char === '(' || char === '[') {
      depth++;
    } else if (char === '}' || char === ')' || char === ']') {
      depth = Math.max(0, depth - 1);
    } else if (char === '<') {
      angleDepth++;
    } else if (char === '>') {
      // `=>`（function type 回傳箭頭）的 `>` 不是泛型收尾，不計入深度
      if (text[i - 1] !== '=') {
        angleDepth = Math.max(0, angleDepth - 1);
      }
    } else if (char === ';' && depth === 0 && angleDepth === 0) {
      return lineIndex;
    }
  }

  return lineIndex;
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
