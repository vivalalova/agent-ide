/**
 * TypeScript Member Extractor
 * 提取 TypeScript/TSX 檔案中的成員定義
 */

import { MemberType, type MemberDefinition } from '../types.js';
import {
  findBlockEnd,
  findMethodDeclarationEnd,
  findTypeAliasEnd,
  findStatementEnd
} from '../utils/range-finder.js';
import { UNICODE_IDENTIFIER_PATTERN_SOURCE } from '../utils/identifier-pattern.js';
import { computeCodeStateMask, maskNonCode } from '@core/foundations/index.js';

/**
 * 識別符字元類（去除 UNICODE_IDENTIFIER_PATTERN 的 `^`/`$` anchor），供內嵌
 * 組合進逐行掃描用的較大 regex。專案宣稱支援 Unicode 識別符，此處與
 * rename 引擎、parser 共用同一份定義（Single Source of Truth），避免各處
 * 各自定義出現 ASCII-only 的 `\w+` 而漏掉 Unicode 命名（見 C7 bug：Unicode
 * 命名 method 因此抽取失敗，導致按位置移動時 fallback 選中外層 class）
 */
/** 程式語言關鍵字集合 */
const KEYWORDS = new Set([
  'if', 'else', 'while', 'for', 'switch', 'case', 'break', 'continue',
  'function', 'async', 'await', 'return', 'new', 'typeof', 'instanceof',
  'const', 'let', 'var', 'class', 'interface', 'type', 'enum', 'export',
  'import', 'from', 'default', 'true', 'false', 'null', 'undefined',
  'this', 'super', 'extends', 'implements', 'static', 'readonly', 'private',
  'public', 'protected', 'abstract', 'get', 'set', 'in', 'of', 'as', 'is'
]);

/** 基本型別集合 */
const BASIC_TYPES = new Set([
  'string', 'number', 'boolean', 'void', 'any', 'unknown', 'never',
  'null', 'undefined', 'object', 'symbol', 'bigint', 'Array', 'Object',
  'String', 'Number', 'Boolean', 'Function', 'Promise', 'Map', 'Set'
]);

/**
 * 提取 TypeScript 成員
 *
 * @param content 檔案內容
 * @param filePath 檔案路徑
 * @param memberName 成員名稱
 * @param memberType 成員類型（可選）
 * @param className 所屬類別（可選）
 * @returns 找到的成員定義，或 null
 */
export function extractTypeScriptMember(
  content: string,
  filePath: string,
  memberName: string,
  memberType?: MemberType,
  className?: string
): MemberDefinition | null {
  const members = listTypeScriptMembers(content, filePath, className);

  return members.find(m => {
    const nameMatch = m.name === memberName;
    const typeMatch = !memberType || m.type === memberType;
    const classMatch = !className || m.className === className;
    return nameMatch && typeMatch && classMatch;
  }) || null;
}

/**
 * 列出 TypeScript 成員
 *
 * @param content 檔案內容
 * @param filePath 檔案路徑
 * @param filterClassName 篩選特定類別的成員（可選）
 * @returns 成員定義陣列
 */
export function listTypeScriptMembers(
  content: string,
  filePath: string,
  filterClassName?: string
): MemberDefinition[] {
  const members: MemberDefinition[] = [];
  const lines = content.split('\n');
  // 供下方所有頂層宣告 regex 掃描用：清空字串/樣板/註解內容，避免區塊註解中
  // 恰巧長得像宣告的文字（如 `/* function fake() {} */`）被誤判為真實可搬移
  // 成員。長度與換行位置與 content 完全對齊，match.index/lineNumber 等位置
  // 計算沿用 content 不受影響；sourceCode 一律仍從未遮罩的 lines 切出
  // （成員原始碼含真實字串/註解內容，不可用遮罩版本代替）。
  const maskedContent = maskNonCode(content);
  let match;

  // 函式定義
  // 錨點同時允許「行首」與「緊接在 `;`/`}` 之後」，而非只認 `^`（行首）——
  // 否則同一物理行有多個宣告時（如 `export function a() {} export function b() {}`），
  // 逐行掃描只會抓到該行第一個，第二個永遠不會進候選清單，導致依位置選取
  // 永遠選不到它（見 adversarial-position-column-ignored 測試）。
  const functionPattern = new RegExp(
    `(?:^|(?<=[;}]))([ \\t]*)(export[ \\t]+)?(async[ \\t]+)?function[ \\t]+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  while ((match = functionPattern.exec(maskedContent)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const declStartIndex = match.index + leadingWhitespaceLength(match[0]);
    const startColumn = computeColumn(content, declStartIndex);
    const endLine = findBlockEnd(lines, lineNumber - 1);
    const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[4],
      MemberType.Function,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, lineNumber - 1),
      extractDependencies(sourceCode),
      startColumn
    ));
  }

  // 類別定義（同上：錨點需同時認行首與 `;`/`}` 之後，理由同函式定義）
  const classPattern = new RegExp(
    `(?:^|(?<=[;}]))([ \\t]*)(export[ \\t]+)?(abstract[ \\t]+)?class[ \\t]+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  while ((match = classPattern.exec(maskedContent)) !== null) {
    const declLineNumber = content.substring(0, match.index).split('\n').length;
    const declLineIndex = declLineNumber - 1;
    const classDeclStartIndex = match.index + leadingWhitespaceLength(match[0]);
    const classStartColumn = computeColumn(content, classDeclStartIndex);
    const endLine = findBlockEnd(lines, declLineIndex);
    // 傳給 extractClassMembers 的來源碼維持從 class 宣告行開始（不含 decorator），
    // 讓類別內部成員的行號計算不受 decorator 影響
    const classSourceCode = lines.slice(declLineIndex, endLine + 1).join('\n');

    // 成員本身（供搬移）的範圍需含前面連續的 @decorator 行，否則搬移後
    // decorator 會遺失、來源檔留下孤兒 decorator（見 M3 bug）
    const startLineIndex = findDeclarationStartWithDecorators(lines, declLineIndex);
    const lineNumber = startLineIndex + 1;
    const sourceCode = lines.slice(startLineIndex, endLine + 1).join('\n');

    members.push(createMember(
      match[4],
      MemberType.Class,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, startLineIndex),
      extractDependencies(sourceCode),
      classStartColumn
    ));

    // 如果是特定類別，提取其成員
    if (!filterClassName || match[4] === filterClassName) {
      const classMembers = extractClassMembers(classSourceCode, filePath, match[4], declLineNumber);
      members.push(...classMembers);
    }
  }

  // 介面定義（同上：錨點需同時認行首與 `;`/`}` 之後，理由同函式定義）
  const interfacePattern = new RegExp(
    `(?:^|(?<=[;}]))([ \\t]*)(export[ \\t]+)?interface[ \\t]+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  while ((match = interfacePattern.exec(maskedContent)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const declStartIndex = match.index + leadingWhitespaceLength(match[0]);
    const startColumn = computeColumn(content, declStartIndex);
    const endLine = findBlockEnd(lines, lineNumber - 1);
    const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[3],
      MemberType.Interface,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, lineNumber - 1),
      extractDependencies(sourceCode),
      startColumn
    ));
  }

  // 類型別名（同上：錨點需同時認行首與 `;`/`}` 之後，理由同函式定義）
  const typePattern = new RegExp(
    `(?:^|(?<=[;}]))([ \\t]*)(export[ \\t]+)?type[ \\t]+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  while ((match = typePattern.exec(maskedContent)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const declStartIndex = match.index + leadingWhitespaceLength(match[0]);
    const startColumn = computeColumn(content, declStartIndex);
    const endLine = findTypeAliasEnd(lines, lineNumber - 1);
    const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[3],
      MemberType.TypeAlias,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, lineNumber - 1),
      extractDependencies(sourceCode),
      startColumn
    ));
  }

  // 常數（同上：錨點需同時認行首與 `;`/`}` 之後，理由同函式定義）
  const constPattern = new RegExp(
    `(?:^|(?<=[;}]))([ \\t]*)(export[ \\t]+)?const[ \\t]+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  while ((match = constPattern.exec(maskedContent)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const declStartIndex = match.index + leadingWhitespaceLength(match[0]);
    const startColumn = computeColumn(content, declStartIndex);
    const endLine = findStatementEnd(lines, lineNumber - 1);
    const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[3],
      MemberType.Constant,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, lineNumber - 1),
      extractDependencies(sourceCode),
      startColumn
    ));
  }

  // 列舉（同上：錨點需同時認行首與 `;`/`}` 之後，理由同函式定義）
  const enumPattern = new RegExp(
    `(?:^|(?<=[;}]))([ \\t]*)(export[ \\t]+)?enum[ \\t]+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  while ((match = enumPattern.exec(maskedContent)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const declStartIndex = match.index + leadingWhitespaceLength(match[0]);
    const startColumn = computeColumn(content, declStartIndex);
    const endLine = findBlockEnd(lines, lineNumber - 1);
    const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[3],
      MemberType.Enum,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, lineNumber - 1),
      extractDependencies(sourceCode),
      startColumn
    ));
  }

  // 若指定了類別篩選，只返回該類別的成員
  if (filterClassName) {
    return members.filter(m => m.className === filterClassName || m.name === filterClassName);
  }

  return members;
}

/**
 * 提取類別成員
 *
 * @param classSource 類別原始碼
 * @param filePath 檔案路徑
 * @param className 類別名稱
 * @param classStartLine 類別起始行號（1-based）
 * @returns 類別成員定義陣列
 */
export function extractClassMembers(
  classSource: string,
  filePath: string,
  className: string,
  classStartLine: number
): MemberDefinition[] {
  const members: MemberDefinition[] = [];

  // 跳過類別宣告行，只提取類別內部的成員
  const firstBraceIndex = classSource.indexOf('{');
  if (firstBraceIndex === -1) {
    return members;
  }
  const classBody = classSource.substring(firstBraceIndex + 1);
  const bodyStartLine = classSource.substring(0, firstBraceIndex).split('\n').length;

  // 類別內部的 lines（從 { 之後開始）
  const bodyLines = classBody.split('\n');
  let match;

  // 方法
  // overload 方法（多個同名簽章宣告 + 一個實作）逐行 regex 會各自產生一個候選；
  // 若直接各自建立成員，簽章候選（無 body）與實作候選範圍會重疊，導致依位置選取
  // 「最小範圍」時只選中實作、簽章淪為孤兒宣告（見 T4 bug）。因此先收集每個候選
  // 是否含 body，再把「連續、同名、且前面皆為無 body 簽章」的候選群組合併成單一
  // 成員單位（範圍＝第一個簽章起點到實作結尾），讓指向群組內任一行都選中整組。
  interface RawMethodCandidate {
    readonly matchText: string;
    readonly name: string;
    readonly startLineIndex: number;
    readonly endLineIndex: number;
    readonly hasBody: boolean;
    /**
     * 精確的 accessor 種類（'get'/'set'），直接取自 regex 的 group(4) 捕捉結果，
     * 非對 matchText 做子字串比對（子字串比對對名稱恰含 "get"/"set" 的一般方法
     * ——如 `budget()`、`reset()`——會誤判，因該 group 只在真正比對到獨立的
     * `get`/`set` 關鍵字 token 時才有值，見下方 methodPattern 與 constructor
     * 跳過判斷同樣依賴 match[5] 精確比對的先例）
     */
    readonly accessorKind: 'get' | 'set' | undefined;
  }

  // 名稱前允許 `get`/`set` 存取子關鍵字，否則 getter/setter 因不含 async/static/
  // 存取修飾詞而被規則忽略，之後又被屬性規則誤判成一般屬性（見 P2 bug）。
  // 泛型參數段與參數列不放進本 regex：名稱後緊接的 `<...>` 改由
  // skipGenericParams() 深度計數掃描（而非 `[^>]*`），因巢狀泛型（如
  // `map<T extends Array<number>>(...)`）會讓 `[^>]*` 在第一個 `>` 就截斷，
  // 導致殘留的 `>` 卡在泛型段與 `(` 之間，使整條規則完全比對失敗、方法
  // 整個抽不出來（見 P1-1 bug）。
  const methodPattern = new RegExp(
    `^[ \\t]*(public|private|protected)?[ \\t]*(static)?[ \\t]*(async)?[ \\t]*(get|set)?[ \\t]*(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gmu'
  );
  // skipGenericParams 需要遮罩排除字串/模板/註解內容中的 `<`/`>`（見其註解），
  // classBody 固定不變、一次計算供所有候選共用，避免每個候選各自重算整份遮罩。
  const classBodyCodeMask = computeCodeStateMask(classBody);
  // methodPattern/propertyPattern 逐行掃描（`^` 錨點）本身無法分辨區塊註解內容
  // 恰巧長得像方法/屬性宣告的文字（如未加 `*` 前綴的多行區塊註解內容）；套用
  // 同一份既有 mask 清空非 code 內容，避免誤判為真實可搬移成員，行號計算
  // （字元位置、換行數）與 classBody 完全對齊不受影響。
  const maskedClassBody = maskNonCode(classBody, classBodyCodeMask);
  const rawMethodCandidates: RawMethodCandidate[] = [];
  while ((match = methodPattern.exec(maskedClassBody)) !== null) {
    // 跳過 constructor
    if (match[5] === 'constructor') { continue; }

    // 名稱後（跳過可能存在的泛型段與空白）若非緊接 `(`，代表這是屬性宣告行
    // （如 `id: string;`）而非方法，交給下方 propertyPattern 掃描。
    if (!skipGenericParams(classBody, match.index + match[0].length, classBodyCodeMask).isMethod) { continue; }

    const relativeLineNumber = classBody.substring(0, match.index).split('\n').length;
    const declLineIndex = relativeLineNumber - 1;
    const { endLine: bodyEndLineIndex, hasBody } = findMethodDeclarationEnd(bodyLines, declLineIndex);

    // 成員範圍含前面連續的 @decorator 行（與 class 提取共用同一判定，見 M3 bug）
    const startLineIndex = findDeclarationStartWithDecorators(bodyLines, declLineIndex);

    rawMethodCandidates.push({
      matchText: match[0],
      name: match[5],
      startLineIndex,
      endLineIndex: bodyEndLineIndex,
      hasBody,
      accessorKind: match[4] === 'get' || match[4] === 'set' ? match[4] : undefined
    });
  }

  let candidateIndex = 0;
  while (candidateIndex < rawMethodCandidates.length) {
    const groupStart = rawMethodCandidates[candidateIndex];
    let groupEnd = candidateIndex;
    while (
      groupEnd + 1 < rawMethodCandidates.length &&
      !rawMethodCandidates[groupEnd].hasBody &&
      rawMethodCandidates[groupEnd + 1].name === groupStart.name
    ) {
      groupEnd++;
    }

    const lastCandidate = rawMethodCandidates[groupEnd];
    const startLineIndex = groupStart.startLineIndex;
    const endLine = lastCandidate.endLineIndex;
    const lineNumber = classStartLine + bodyStartLine - 1 + startLineIndex;
    const sourceCode = bodyLines.slice(startLineIndex, endLine + 1).join('\n');

    // accessor 種類（get/set）附加進 modifiers：extractModifiers 只認
    // export/async/static/public/private/protected/readonly/abstract 這幾個
    // 固定關鍵字子字串，不含 get/set（子字串比對對 accessor 不安全，見
    // RawMethodCandidate.accessorKind 註解），故在此用 regex 已精確判定的
    // lastCandidate.accessorKind 補上，供上游（如 move-member 的 class-only
    // 形狀守衛）判斷這是 accessor 而非一般方法。
    const modifiers = extractModifiers(lastCandidate.matchText);
    if (lastCandidate.accessorKind) {
      modifiers.push(lastCandidate.accessorKind);
    }

    members.push(createMember(
      lastCandidate.name,
      MemberType.Method,
      filePath,
      lineNumber,
      classStartLine + bodyStartLine - 1 + endLine,
      sourceCode,
      className,
      modifiers,
      extractDocumentation(bodyLines, startLineIndex),
      extractDependencies(sourceCode)
    ));

    candidateIndex = groupEnd + 1;
  }

  // 屬性掃描逐行比對，天生無法分辨「類別成員層級的屬性宣告」與「方法本體內部的
  // 陳述句/多行參數列表」——兩者長得一樣（如 `return 1;` 的 `return`、`a: number,`
  // 的 `a`）。故先把所有方法候選（含尚未合併 overload 群組前）覆蓋的行範圍記下，
  // 屬性掃描命中落在任一方法範圍內的行一律跳過，避免把方法 body 陳述句或跨行參數
  // 誤判成 Property（見 P1 bug：`run() { return 1; }` 生出假的 `return` 屬性）。
  const methodCoveredLineRanges = rawMethodCandidates.map(c => ({
    start: c.startLineIndex,
    end: c.endLineIndex
  }));
  const isLineInsideMethod = (lineIndex: number): boolean =>
    methodCoveredLineRanges.some(r => lineIndex >= r.start && lineIndex <= r.end);

  // 屬性
  const propertyPattern = new RegExp(
    `^[ \\t]*(public|private|protected)?[ \\t]*(static)?[ \\t]*(readonly)?[ \\t]*(${UNICODE_IDENTIFIER_PATTERN_SOURCE})[ \\t]*[?:]?[ \\t]*[^ (]`,
    'gmu'
  );
  while ((match = propertyPattern.exec(maskedClassBody)) !== null) {
    // 跳過方法和 constructor
    if (maskedClassBody.substring(match.index).match(
      new RegExp(`^\\s*${UNICODE_IDENTIFIER_PATTERN_SOURCE}\\s*\\(`, 'u')
    )) { continue; }

    const relativeLineNumber = classBody.substring(0, match.index).split('\n').length;
    const declLineIndex = relativeLineNumber - 1;
    if (isLineInsideMethod(declLineIndex)) { continue; }

    const lineNumber = classStartLine + bodyStartLine - 1 + relativeLineNumber - 1;
    const endLine = findStatementEnd(bodyLines, relativeLineNumber - 1);
    const sourceCode = bodyLines.slice(relativeLineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[4],
      MemberType.Property,
      filePath,
      lineNumber,
      classStartLine + bodyStartLine - 1 + endLine,
      sourceCode,
      className,
      extractModifiers(match[0]),
      extractDocumentation(bodyLines, relativeLineNumber - 1),
      extractDependencies(sourceCode)
    ));
  }

  return members;
}

/**
 * 建立成員定義
 */
function createMember(
  name: string,
  type: MemberType,
  filePath: string,
  startLine: number,
  endLine: number,
  sourceCode: string,
  className: string | undefined,
  modifiers: string[],
  documentation: string | undefined,
  dependencies: string[],
  startColumn = 1
): MemberDefinition {
  return {
    name,
    type,
    location: {
      filePath,
      range: {
        start: { line: startLine, column: startColumn },
        end: { line: endLine, column: 1 }
      }
    },
    sourceCode,
    className,
    modifiers,
    documentation,
    dependencies
  };
}

/**
 * 計算 `content` 中 `index` 位置的欄位（1-based）。
 * 供頂層宣告候選（function/class/interface/type/const/enum）標記真實起始欄位，
 * 讓 extractMemberAtPosition 能在同一物理行有多個候選時依欄位正確消歧
 * （見 adversarial-position-column-ignored 測試：欄位固定寫死 1 時，
 * 同行第二個以後的成員永遠無法被欄位選中）。
 */
function computeColumn(content: string, index: number): number {
  const lastNewlineIndex = content.lastIndexOf('\n', index - 1);
  return index - lastNewlineIndex;
}

/**
 * 回傳 `matchText` 開頭連續空白（space/tab）字元數，用於從候選 regex 的
 * `match[0]`（含錨點捕捉到的前導空白）跳到宣告本身真正開始的位置。
 */
function leadingWhitespaceLength(matchText: string): number {
  return matchText.length - matchText.replace(/^[ \t]*/, '').length;
}

/**
 * 從識別符結束位置開始，跳過可能存在的泛型參數段 `<...>`（以深度計數逐字元
 * 掃描 `<`/`>`，非 `[^>]*`，故能正確處理巢狀泛型如 `<T extends Array<number>>`），
 * 回傳其後（略過空白）是否緊接 `(`，藉此判定該識別符是否為方法宣告。
 *
 * `codeMask` 用 computeCodeStateMask(text) 排除字串/模板字面值/註解內容，避免
 * 泛型約束的字串字面值中恰巧出現的 `>`（如 `<T extends "a>b">`）被誤判成泛型
 * 收尾，導致深度提前歸零、留下一個未配對的 `>` 卡在泛型段與 `(` 之間，使整條
 * 判定失敗、方法整個被誤判成屬性（見 P2 bug）。
 *
 * @param text 掃描的原始文字（classBody）
 * @param startIndex 識別符結束後的位置
 * @param codeMask 與 text 等長的程式碼狀態遮罩（見 computeCodeStateMask）
 * @returns isMethod：跳過泛型與空白後是否緊接 `(`
 */
function skipGenericParams(text: string, startIndex: number, codeMask: boolean[]): { isMethod: boolean } {
  let i = startIndex;
  while (i < text.length && /\s/.test(text[i])) { i++; }

  if (text[i] === '<' && codeMask[i]) {
    let depth = 1;
    i++;
    while (i < text.length && depth > 0) {
      if (codeMask[i]) {
        if (text[i] === '<') { depth++; }
        // `=>`（function type 回傳箭頭）的 `>` 不是泛型收尾，不計入深度。
        else if (text[i] === '>' && text[i - 1] !== '=') { depth--; }
      }
      i++;
    }
    while (i < text.length && /\s/.test(text[i])) { i++; }
  }

  return { isMethod: text[i] === '(' };
}

/**
 * 找到宣告的起始行索引，含前面連續的 `@decorator` 行
 * 供 class / method 提取共用，避免 decorator 判定重複實作兩份（見 M3 bug：
 * decorator 不在宣告範圍內時，搬移後來源檔留下孤兒 decorator、目標檔遺失 decorator）
 *
 * @param lines 程式碼行陣列（class 提取傳整檔 lines；method 提取傳 class 內部 bodyLines）
 * @param declLine 宣告本身（如 `class X` 或 `run()`）所在行索引（0-based）
 * @returns 含 decorator 的起始行索引（0-based）；無 decorator 時等於 declLine
 */
function findDeclarationStartWithDecorators(lines: string[], declLine: number): number {
  let start = declLine;
  while (start > 0 && lines[start - 1].trim().startsWith('@')) {
    start--;
  }
  return start;
}

/**
 * 提取修飾符
 */
function extractModifiers(declaration: string): string[] {
  const modifiers: string[] = [];
  if (declaration.includes('export')) { modifiers.push('export'); }
  if (declaration.includes('async')) { modifiers.push('async'); }
  if (declaration.includes('static')) { modifiers.push('static'); }
  if (declaration.includes('public')) { modifiers.push('public'); }
  if (declaration.includes('private')) { modifiers.push('private'); }
  if (declaration.includes('protected')) { modifiers.push('protected'); }
  if (declaration.includes('readonly')) { modifiers.push('readonly'); }
  if (declaration.includes('abstract')) { modifiers.push('abstract'); }
  return modifiers;
}

/**
 * 提取文件註解
 */
export function extractDocumentation(lines: string[], memberLine: number): string | undefined {
  const previousLineIndex = memberLine - 1;
  if (previousLineIndex < 0 || lines[previousLineIndex].trim() === '') {
    return undefined;
  }

  const docLines: string[] = [];
  let i = previousLineIndex;
  const previousLine = lines[i].trim();

  if (previousLine.endsWith('*/')) {
    let foundStart = false;
    while (i >= 0) {
      const line = lines[i].trim();
      docLines.unshift(line);
      if (line.startsWith('/**') || line.startsWith('/*')) {
        foundStart = true;
        break;
      }
      i--;
    }
    return foundStart ? docLines.join('\n') : undefined;
  }

  if (previousLine.startsWith('//')) {
    while (i >= 0) {
      const line = lines[i].trim();
      if (!line.startsWith('//')) {
        break;
      }
      // 保留原始 `//` 前綴（含標記本身），而非剝除後的純文字：
      // documentation 會被寫回目標檔（見 file-change-preparer.ts），
      // 剝過前綴的純文字拼回檔案會變成不合法的裸露文字
      docLines.unshift(line);
      i--;
    }
    return docLines.join('\n');
  }

  return undefined;
}

/**
 * 提取依賴
 *
 * 所有掃描一律對 maskNonCode(sourceCode) 執行：成員原始碼可能含字串字面值或
 * 註解，其中恰巧出現的型別/呼叫/識別符形狀文字（如 `/* export const Fake = 1; *\/`
 * 或字串內容）不應被當成真實依賴。捕捉到的名稱本身是 code 內容、不受遮罩影響，
 * 只有落在字串/註解區間的干擾文字被清空。
 */
function extractDependencies(sourceCode: string): string[] {
  const dependencies: string[] = [];
  const maskedSource = maskNonCode(sourceCode);
  let match;

  // 提取型別引用
  const typePattern = new RegExp(
    `:\\s*(${UNICODE_IDENTIFIER_PATTERN_SOURCE})(?:<|;|\\s|,|\\))`,
    'gu'
  );
  while ((match = typePattern.exec(maskedSource)) !== null) {
    const typeName = match[1];
    if (!BASIC_TYPES.has(typeName) && !KEYWORDS.has(typeName)) {
      dependencies.push(typeName);
    }
  }

  // 提取函式呼叫
  const callPattern = new RegExp(
    `(${UNICODE_IDENTIFIER_PATTERN_SOURCE})\\s*\\(`,
    'gu'
  );
  while ((match = callPattern.exec(maskedSource)) !== null) {
    const funcName = match[1];
    if (!KEYWORDS.has(funcName) && !BASIC_TYPES.has(funcName)) {
      dependencies.push(funcName);
    }
  }

  // 提取變數/常數引用（賦值右側、運算子右側、比較右側）
  const varRefPattern = /[=><+\-*/%&|!]\s*([A-Z][A-Z0-9_]*)\b/g;
  while ((match = varRefPattern.exec(maskedSource)) !== null) {
    const varName = match[1];
    if (!KEYWORDS.has(varName) && !BASIC_TYPES.has(varName)) {
      dependencies.push(varName);
    }
  }

  // 提取作為比較對象的識別符
  const comparisonPattern = /\b([A-Z][A-Z0-9_]*)\s*[=!<>]/g;
  while ((match = comparisonPattern.exec(maskedSource)) !== null) {
    const varName = match[1];
    if (!KEYWORDS.has(varName) && !BASIC_TYPES.has(varName)) {
      dependencies.push(varName);
    }
  }

  // 提取一般識別符讀取（如 `n * rate` 中的 rate）：上面幾條規則只認型別標註、
  // 呼叫、以及大寫命名變數，未涵蓋一般小寫變數的單純讀取，導致引用模組級小寫
  // 常數的成員搬移後，目標檔漏補該常數的 import（見 C8 bug）。排除區域宣告
  // （參數、const/let/var）、關鍵字、基本型別與屬性存取（`obj.prop` 的 prop）
  const localNames = extractLocallyDeclaredNames(maskedSource);
  const identifierPattern = new RegExp(
    `(?<![.\\p{ID_Continue}$])(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gu'
  );
  while ((match = identifierPattern.exec(maskedSource)) !== null) {
    const name = match[1];
    if (KEYWORDS.has(name) || BASIC_TYPES.has(name) || localNames.has(name)) { continue; }
    dependencies.push(name);
  }

  return [...new Set(dependencies)];
}

/**
 * 找出成員原始碼中所有區域宣告的名稱：函式/方法參數、`const`/`let`/`var` 區域變數。
 * 供一般識別符讀取掃描排除，避免區域宣告（如參數名稱恰好撞名某個模組級 export）
 * 被誤判為外部依賴（見 C8 bug 的一般識別符讀取規則）。
 *
 * @param sourceCode 呼叫端（extractDependencies）傳入已 maskNonCode 處理過的
 *   文字，字串/註解內容已清空，故本函式的掃描天然一併排除該類干擾
 */
function extractLocallyDeclaredNames(sourceCode: string): Set<string> {
  const names = new Set<string>();

  // 參數列表：抓第一層 (...) 內每個參數宣告的名稱（含 rest 參數 `...x`）
  const paramListMatch = sourceCode.match(/\(([^)]*)\)/);
  if (paramListMatch) {
    for (const param of paramListMatch[1].split(',')) {
      const trimmed = param.trim();
      if (!trimmed) { continue; }
      const nameMatch = new RegExp(
        `^\\.{3}\\s*(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|^(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
        'u'
      ).exec(trimmed);
      if (nameMatch) {
        names.add(nameMatch[1] ?? nameMatch[2]);
      }
    }
  }

  // 區域變數宣告：const/let/var NAME
  const declPattern = new RegExp(
    `\\b(?:const|let|var)\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
    'gu'
  );
  let declMatch;
  while ((declMatch = declPattern.exec(sourceCode)) !== null) {
    names.add(declMatch[1]);
  }

  return names;
}
