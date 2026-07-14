/**
 * 判斷 source offset 是否位於字串或註解中。
 * move-member 的文字掃描器共用此 predicate，避免把字串/註解中的 import 文字
 * 當成真正的語句。
 */
export function isInsideStringOrComment(code: string, offset: number): boolean {
  let quote: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < offset; i++) {
    const char = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
    } else if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
    } else if (char === '\'' || char === '"' || char === '`') {
      quote = char;
    }
  }

  return quote !== null || inLineComment || inBlockComment;
}
