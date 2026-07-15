/**
 * 文字匹配工具類別
 * 負責基於文字的符號引用查找（降級方法）
 */

import { SymbolReferenceType, type SymbolReference } from './types.js';
import { createIdentifierBoundaryRegex } from './identifier-matcher.js';

type Quote = '\'' | '"';

interface TemplateContext {
  mode: 'raw' | 'expression';
  braceDepth: number;
}

interface ScannerState {
  quote: Quote | null;
  escaped: boolean;
  templateContexts: TemplateContext[];
  inRegex: boolean;
  inRegexClass: boolean;
  inRegexFlags: boolean;
  inBlockComment: boolean;
  inSingleLineComment: boolean;
}

interface CharacterState {
  inString: boolean;
  inBlockComment: boolean;
  inSingleLineComment: boolean;
}

/**
 * 文字匹配器
 * 提供基於正則表達式的符號查找能力
 */
export class TextMatcher {
  /** 使用文字匹配查找引用（降級方法） */
  findReferencesByText(filePath: string, content: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const lines = content.split('\n');
    const regex = createIdentifierBoundaryRegex(symbolName, 'g');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      while ((match = regex.exec(line)) !== null) {
        const startColumn = match.index + 1;
        references.push({
          symbolName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: startColumn },
              end: { line: lineIndex + 1, column: startColumn + symbolName.length }
            }
          },
          type: SymbolReferenceType.Usage,
          context: line
        });
      }
    }

    return references;
  }

  /**
   * 使用文字匹配查找引用（過濾字串和註解版本）。所有字串、template、regex 與註解
   * 狀態由同一個 scanSource() 掃描器計算，確保跨行狀態不在各個判斷入口分叉。
   */
  findReferencesByTextFiltered(filePath: string, content: string, symbolName: string): SymbolReference[] {
    const references: SymbolReference[] = [];
    const lines = content.split('\n');
    const regex = createIdentifierBoundaryRegex(symbolName, 'g');
    const scan = this.scanSource(content);
    let lineStartOffset = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match;

      while ((match = regex.exec(line)) !== null) {
        const position = match.index;
        const state = scan.characters[lineStartOffset + position];
        if (state?.inString || state?.inBlockComment || state?.inSingleLineComment) {
          continue;
        }

        references.push({
          symbolName,
          location: {
            filePath,
            range: {
              start: { line: lineIndex + 1, column: position + 1 },
              end: { line: lineIndex + 1, column: position + 1 + symbolName.length }
            }
          },
          type: SymbolReferenceType.Usage,
          context: line
        });
      }

      lineStartOffset += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
    }

    return references;
  }

  /** 批次文字匹配查找（降級方法） */
  findReferencesMultipleByText(
    filePath: string,
    content: string,
    symbolNames: ReadonlySet<string>,
    results: Map<string, SymbolReference[]>
  ): void {
    const lines = content.split('\n');

    for (const symbolName of symbolNames) {
      const regex = createIdentifierBoundaryRegex(symbolName, 'g');
      const refs = results.get(symbolName);
      if (!refs) {
        continue;
      }

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let match;

        while ((match = regex.exec(line)) !== null) {
          refs.push({
            symbolName,
            location: {
              filePath,
              range: {
                start: { line: lineIndex + 1, column: match.index + 1 },
                end: { line: lineIndex + 1, column: match.index + 1 + symbolName.length }
              }
            },
            type: SymbolReferenceType.Usage,
            context: line.trim()
          });
        }
      }
    }
  }

  /** 檢查位置是否在字串、template raw 或 regex literal 中。 */
  isInString(line: string, position: number): boolean {
    const scan = this.scanSource(line);
    return scan.characters[position]?.inString ?? (
      scan.endState.quote !== null
      || scan.endState.inRegex
      || scan.endState.inRegexFlags
      || scan.endState.templateContexts.at(-1)?.mode === 'raw'
    );
  }

  /**
   * regex 字面值可能出現在其前的字元：運算子、逗號、左括號等「不可能是除法」的
   * 情境（含掃描起點）。
   */
  private static readonly REGEX_PRECEDING_CHARS = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>'
  ]);

  private static readonly REGEX_PRECEDING_KEYWORDS = new Set([
    'return', 'typeof', 'in', 'of', 'case', 'do', 'else', 'void', 'delete',
    'instanceof', 'new', 'throw', 'yield', 'await'
  ]);

  private static readonly REGEX_CONTROL_KEYWORDS = new Set(['if', 'for', 'while']);

  /** 由 position 往前找最近一個非空白字元。 */
  private lastMeaningfulChar(line: string, position: number): string | undefined {
    for (let i = position - 1; i >= 0; i--) {
      if (!/\s/.test(line[i])) {
        return line[i];
      }
    }
    return undefined;
  }

  /** 由 position 往前找最近一個完整識別字。 */
  private lastMeaningfulWord(line: string, position: number): string | undefined {
    let i = position - 1;
    while (i >= 0 && /\s/.test(line[i])) {
      i--;
    }
    if (i < 0 || !/[A-Za-z0-9_$]/.test(line[i])) {
      return undefined;
    }
    const end = i + 1;
    while (i >= 0 && /[A-Za-z0-9_$]/.test(line[i])) {
      i--;
    }
    return line.slice(i + 1, end);
  }

  /** 檢查位置是否在單行註解中。 */
  isInSingleLineComment(line: string, position: number): boolean {
    const scan = this.scanSource(line);
    return scan.characters[position]?.inSingleLineComment ?? scan.endState.inSingleLineComment;
  }

  /**
   * 唯一的來源文字掃描器。它同時追蹤 block comment、template literal（含 `${}` 表達式）
   * 與 regex literal，並回傳每個字元的過濾狀態，供所有文字判斷入口共用。
   */
  private scanSource(text: string): { characters: CharacterState[]; endState: ScannerState } {
    const characters: CharacterState[] = [];
    const state: ScannerState = {
      quote: null,
      escaped: false,
      templateContexts: [],
      inRegex: false,
      inRegexClass: false,
      inRegexFlags: false,
      inBlockComment: false,
      inSingleLineComment: false
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const template = state.templateContexts.at(-1);
      characters.push({
        inString: state.quote !== null
          || state.inRegex
          || state.inRegexFlags
          || template?.mode === 'raw',
        inBlockComment: state.inBlockComment,
        inSingleLineComment: state.inSingleLineComment
      });

      if (state.inSingleLineComment) {
        if (char === '\n') {
          state.inSingleLineComment = false;
        }
        continue;
      }

      if (state.inBlockComment) {
        if (char === '*' && text[i + 1] === '/') {
          state.inBlockComment = false;
          characters.push({
            inString: false,
            inBlockComment: true,
            inSingleLineComment: false
          });
          i++;
        }
        continue;
      }

      if (state.quote !== null) {
        if (state.escaped) {
          state.escaped = false;
        } else if (char === '\\') {
          state.escaped = true;
        } else if (char === state.quote) {
          state.quote = null;
        }
        continue;
      }

      if (state.inRegex) {
        if (state.escaped) {
          state.escaped = false;
        } else if (char === '\\') {
          state.escaped = true;
        } else if (char === '[') {
          state.inRegexClass = true;
        } else if (char === ']') {
          state.inRegexClass = false;
        } else if (char === '/' && !state.inRegexClass) {
          state.inRegex = false;
          state.inRegexFlags = true;
        }
        continue;
      }

      if (state.inRegexFlags) {
        if (/[A-Za-z]/.test(char)) {
          continue;
        }
        state.inRegexFlags = false;
      }

      if (template?.mode === 'raw') {
        if (state.escaped) {
          state.escaped = false;
        } else if (char === '\\') {
          state.escaped = true;
        } else if (char === '`') {
          state.templateContexts.pop();
        } else if (char === '$' && text[i + 1] === '{') {
          template.mode = 'expression';
          template.braceDepth = 1;
          characters.push({
            inString: false,
            inBlockComment: false,
            inSingleLineComment: false
          });
          i++;
        }
        continue;
      }

      if (char === '/' && text[i + 1] === '/') {
        state.inSingleLineComment = true;
        continue;
      }
      if (char === '/' && text[i + 1] === '*') {
        state.inBlockComment = true;
        continue;
      }
      if (char === '#') {
        state.inSingleLineComment = true;
        continue;
      }
      if (char === '\'' || char === '"') {
        state.quote = char;
        continue;
      }
      if (char === '`') {
        state.templateContexts.push({ mode: 'raw', braceDepth: 0 });
        continue;
      }
      if (char === '/' && this.isRegexStart(text, i)) {
        state.inRegex = true;
        state.inRegexClass = false;
        continue;
      }

      if (template?.mode === 'expression') {
        if (char === '{') {
          template.braceDepth++;
        } else if (char === '}') {
          template.braceDepth--;
          if (template.braceDepth === 0) {
            template.mode = 'raw';
          }
        }
      }
    }

    return { characters, endState: state };
  }

  private isRegexStart(text: string, position: number): boolean {
    if (text[position + 1] === '/') {
      return false;
    }

    const previous = this.lastMeaningfulChar(text, position);
    if (previous === undefined || TextMatcher.REGEX_PRECEDING_CHARS.has(previous)) {
      return true;
    }
    if (previous === ')') {
      let previousIndex = position - 1;
      while (previousIndex >= 0 && /\s/.test(text[previousIndex])) { previousIndex--; }
      return this.isControlFlowParenClose(text, previousIndex);
    }
    if (/[A-Za-z0-9_$]/.test(previous)) {
      const word = this.lastMeaningfulWord(text, position);
      return word !== undefined && TextMatcher.REGEX_PRECEDING_KEYWORDS.has(word);
    }
    return false;
  }

  private isControlFlowParenClose(text: string, closePosition: number): boolean {
    let depth = 1;
    for (let i = closePosition - 1; i >= 0; i--) {
      if (text[i] === ')') {
        depth++;
      } else if (text[i] === '(') {
        depth--;
        if (depth === 0) {
          let end = i - 1;
          while (end >= 0 && /\s/.test(text[end])) { end--; }
          let start = end;
          while (start >= 0 && /[A-Za-z0-9_$]/.test(text[start])) { start--; }
          return TextMatcher.REGEX_CONTROL_KEYWORDS.has(text.slice(start + 1, end + 1));
        }
      }
    }
    return false;
  }

  /** 跳脫正則表達式特殊字元（供 CallSiteParser 組合呼叫點樣式使用）。 */
  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/** 建立 TextMatcher 實例 */
export function createTextMatcher(): TextMatcher {
  return new TextMatcher();
}
