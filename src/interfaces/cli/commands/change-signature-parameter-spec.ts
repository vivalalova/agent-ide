/**
 * change-signature CLI 參數規格文字解析
 *
 * --add / --change-type 的參數規格（`name:type=default@position`，可逗號串接）字面解析：
 * 深度感知掃描（引號、()、[]、{}、<>）為唯一實作，型別／預設值切割與頂層逗號切割共用它。
 */

export function splitAddParameters(add: string | readonly string[]): string[] {
  const addInputs = Array.isArray(add) ? add : [add];
  return addInputs.flatMap(input => splitTopLevelParameterList(input));
}

/**
 * 從參數規格切出名稱與型別。
 * 名稱恆為識別符（不含冒號），故取「第一個冒號」為分界即可正確保留含冒號/箭頭的型別。
 * 由 --add 與 --change-type 共用（SSOT）。
 */
export function splitParameterNameAndType(input: string): { name: string; type: string } {
  const separatorIndex = input.indexOf(':');
  if (separatorIndex < 0) {
    return { name: input.trim(), type: '' };
  }
  return {
    name: input.slice(0, separatorIndex).trim(),
    type: normalizeParameterSpecText(input.slice(separatorIndex + 1))
  };
}

/**
 * 正規化參數規格文字（型別／預設值）的間距，讓寫入原始碼的文字符合一般 TS 排版：
 * `:` 後補一個空格、`=>` 兩側各補一個空格；引號字串內原文不動。
 * CLI 參數常為避開 shell 而寫成緊排（`cb:(x:number)=>void`），直接寫進原始碼會排版不一致。
 */
export function normalizeParameterSpecText(input: string): string {
  let output = '';
  let skipWhitespace = false;
  let skipNextChar = false;

  const trimTrailingSpaces = (): void => {
    output = output.replace(/ +$/, '');
  };

  scanParameterSpec(input, step => {
    if (skipNextChar) {
      skipNextChar = false;
      return undefined;
    }

    if (step.inQuote) {
      output += step.char;
      skipWhitespace = false;
      return undefined;
    }

    if (step.char === ':') {
      trimTrailingSpaces();
      output += ': ';
      skipWhitespace = true;
      return undefined;
    }

    if (step.char === '=' && input[step.index + 1] === '>') {
      trimTrailingSpaces();
      output += ' => ';
      skipWhitespace = true;
      skipNextChar = true;
      return undefined;
    }

    if (/\s/.test(step.char)) {
      if (!skipWhitespace) {
        output += step.char;
      }
      return undefined;
    }

    output += step.char;
    skipWhitespace = false;
    return undefined;
  });

  return output.trim();
}

/** 參數規格逐字掃描的單步狀態 */
interface ParameterSpecScanStep {
  readonly index: number;
  readonly char: string;
  /** 位於引號字串內（不參與結構判定） */
  readonly inQuote: boolean;
  /** 不在任何 ()、[]、{}、<> 巢狀內 */
  readonly atTopLevel: boolean;
  /** 此字元為頂層的預設值分隔 `=`（已排除 `=>` 與比較運算子的 `=`） */
  readonly isDefaultSeparator: boolean;
}

/** visit 回傳 'reset' 表示「一個參數規格結束」，掃描器重置預設值／泛型深度狀態 */
type ParameterSpecScanAction = 'reset' | undefined;

/**
 * 參數規格的深度感知逐字掃描器（--add／--change-type 共用的唯一掃描實作）。
 *
 * 追蹤引號、()、[]、{}、<> 巢狀深度，並判定哪個 `=` 才是頂層預設值分隔符：
 * 箭頭型別／箭頭函式的 `=>` 與比較運算子（`==`、`!=`、`<=`、`>=`）的 `=` 均不算，
 * 否則 `cb:(x:number)=>void` 的型別會被攔腰截斷。
 */
function scanParameterSpec(input: string, visit: (step: ParameterSpecScanStep) => ParameterSpecScanAction): void {
  let quote: '\'' | '"' | '`' | null = null;
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let insideDefaultValue = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      visit({ index, char, inQuote: true, atTopLevel: false, isDefaultSeparator: false });
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      visit({ index, char, inQuote: true, atTopLevel: false, isDefaultSeparator: false });
      continue;
    }

    if (char === '(') { parenDepth += 1; }
    if (char === ')') { parenDepth = Math.max(0, parenDepth - 1); }
    if (char === '[') { bracketDepth += 1; }
    if (char === ']') { bracketDepth = Math.max(0, bracketDepth - 1); }
    if (char === '{') { braceDepth += 1; }
    if (char === '}') { braceDepth = Math.max(0, braceDepth - 1); }
    if (!insideDefaultValue) {
      // `=>` 的 `>` 不是泛型結束符，否則 `(x:number)=>void` 會讓 angleDepth 變負／錯亂
      if (char === '<') { angleDepth += 1; }
      if (char === '>' && input[index - 1] !== '=') { angleDepth = Math.max(0, angleDepth - 1); }
    }

    const atTopLevel = isAtTopLevelParameterSyntax(parenDepth, bracketDepth, braceDepth, angleDepth);
    const isDefaultSeparator = char === '='
      && !insideDefaultValue
      && atTopLevel
      && isTopLevelDefaultSeparatorAt(input, index);
    if (isDefaultSeparator) {
      insideDefaultValue = true;
    }

    const action = visit({ index, char, inQuote: false, atTopLevel, isDefaultSeparator });
    if (action === 'reset') {
      insideDefaultValue = false;
      angleDepth = 0;
    }
  }
}

/**
 * `=` 是否為真正的「型別／預設值」分隔符。
 * 排除 `=>`（箭頭）、`==`／`!=`（比較）；不可排除前一字元為 `>` 的情形——
 * `lookup:Map<string, number>=new Map()` 的分隔符正是緊接泛型結束符的 `=`。
 */
function isTopLevelDefaultSeparatorAt(input: string, index: number): boolean {
  const next = input[index + 1];
  const previous = input[index - 1];
  if (next === '>' || next === '=') {
    return false;
  }
  return previous !== '!' && previous !== '=';
}

/**
 * 找出參數規格中「型別／預設值」的頂層分隔 `=` 索引；無預設值時回傳 -1。
 * 與 splitTopLevelParameterList 共用同一套掃描（SSOT）。
 */
export function findTopLevelDefaultSeparatorIndex(input: string): number {
  let separatorIndex = -1;
  scanParameterSpec(input, step => {
    if (separatorIndex < 0 && step.isDefaultSeparator) {
      separatorIndex = step.index;
    }
    return undefined;
  });
  return separatorIndex;
}

/**
 * 深度感知的頂層逗號切割：把逗號分隔的參數規格清單切成個別條目。
 * 僅在頂層逗號（且其後緊接一個新參數規格）處切分，
 * 避免型別內的逗號（如泛型 `Map<string, number>`）被誤切。
 * 由 --add 與 --change-type 共用（SSOT）。
 */
export function splitTopLevelParameterList(input: string): string[] {
  const parts: string[] = [];
  let current = '';

  scanParameterSpec(input, step => {
    if (!step.inQuote
      && step.char === ','
      && step.atTopLevel
      && startsAddParameterSpec(input, step.index + 1)
    ) {
      parts.push(current.trim());
      current = '';
      return 'reset';
    }

    current += step.char;
    return undefined;
  });

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function isAtTopLevelParameterSyntax(
  parenDepth: number,
  bracketDepth: number,
  braceDepth: number,
  angleDepth: number
): boolean {
  return parenDepth === 0
    && bracketDepth === 0
    && braceDepth === 0
    && angleDepth === 0;
}

function startsAddParameterSpec(input: string, startIndex: number): boolean {
  let index = startIndex;
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }

  if (!isIdentifierStart(input[index])) {
    return false;
  }

  index += 1;
  while (index < input.length && isIdentifierPart(input[index])) {
    index += 1;
  }
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }

  return index >= input.length
    || input[index] === ':'
    || input[index] === '='
    || input[index] === '@'
    || input[index] === ',';
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[$_\p{ID_Start}]/u.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[$_\u200C\u200D\p{ID_Continue}]/u.test(char);
}
