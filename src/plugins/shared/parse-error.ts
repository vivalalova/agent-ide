/**
 * Parser 錯誤基類
 * TypeScript 和 JavaScript parser 共用的錯誤類別
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly location?: {
      line: number;
      column: number;
      file?: string;
    }
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * 建立 ParseError 的工廠函數
 */
export function createParseError(
  message: string,
  code?: string,
  location?: { line: number; column: number; file?: string }
): ParseError {
  return new ParseError(message, code, location);
}
