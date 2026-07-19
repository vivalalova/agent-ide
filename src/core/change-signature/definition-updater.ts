/**
 * 函式定義文字更新
 * 依新簽名重建參數列表文字，並定位出原始碼中應被替換的精確範圍。
 */

import * as ts from 'typescript';
import type { FunctionSignature } from './types.js';
import { FileUtils } from '@core/foundations/index.js';
import type { FunctionDeclarationLocator } from './function-declaration-locator.js';
import { getScriptKind } from './script-kind.js';
import { offsetToPosition } from '@shared/position-utils.js';

export class DefinitionUpdater {
  constructor(
    private readonly fileUtils: FileUtils,
    private readonly functionLocator: FunctionDeclarationLocator
  ) {}

  /**
   * 生成定義更新
   */
  async generateDefinitionUpdate(
    filePath: string,
    originalSignature: FunctionSignature,
    newSignature: FunctionSignature
  ): Promise<{ filePath: string; originalCode: string; newCode: string; location: typeof originalSignature.location }> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      throw new Error(`無法讀取檔案: ${filePath}`);
    }

    const lines = content.split('\n');

    // 生成新的參數列表
    const newParamsString = this.generateParameterString(newSignature, filePath);

    // 宣告替換範圍完全錨定 AST 宣告節點座標：signature-parser 的 regex 元資訊路徑
    // 會把「同檔中先於宣告出現的同名呼叫點」誤當宣告起點（bare identifier 命中
    // class-method 交替分支），導致 offset 指向呼叫點、與 AST 參數括號組出跨越呼叫點到
    // 宣告的超大範圍，與呼叫點自身的重寫 edit 互相重疊。故 AST 命中時一律以 AST 宣告節點
    // 起點為替換起點；僅在 AST 無法定位（非 TS/JS 或解析失敗）時 fallback 回 regex offset + scanner。
    const astRange = this.findParameterListRangeWithAst(content, filePath, originalSignature);
    const signatureStartOffset = astRange?.declarationStartIndex
      ?? originalSignature.location.range.start.offset
      ?? this.positionToOffset(lines, originalSignature.location.range.start.line, originalSignature.location.range.start.column);
    const parameterRange = astRange?.range
      ?? this.findParameterListRangeWithScanner(content, signatureStartOffset);
    if (!parameterRange) {
      throw new Error(`找不到函式 ${originalSignature.name} 的參數結束括號`);
    }
    let originalCode: string;
    let newCode: string;
    let replacementEndOffset: number;

    if ('parameterStartIndex' in parameterRange) {
      // 裸單參數箭頭函式沒有參數列表括號；只能替換 AST 精確指出的參數，
      // 不可讓 scanner fallback 跨到後續呼叫點的括號。
      const { parameterStartIndex, parameterEndIndex } = parameterRange;
      const replacement = newSignature.parameters.length === 1
        ? newParamsString
        : `(${newParamsString})`;
      originalCode = content.slice(signatureStartOffset, parameterEndIndex);
      newCode = content.slice(signatureStartOffset, parameterStartIndex) + replacement;
      replacementEndOffset = parameterEndIndex;
    } else {
      const { openParenIndex, closeParenIndex } = parameterRange;
      originalCode = content.slice(signatureStartOffset, closeParenIndex + 1);
      newCode = content.slice(signatureStartOffset, openParenIndex + 1) +
        newParamsString +
        ')';
      replacementEndOffset = closeParenIndex + 1;
    }

    return {
      filePath,
      originalCode,
      newCode,
      location: {
        filePath,
        range: {
          start: offsetToPosition(content, signatureStartOffset),
          end: offsetToPosition(content, replacementEndOffset)
        }
      }
    };
  }

  private findParameterListRangeWithAst(
    content: string,
    filePath: string,
    signature: FunctionSignature
  ): {
    declarationStartIndex: number;
    range: {
      openParenIndex: number;
      closeParenIndex: number;
    } | {
      parameterStartIndex: number;
      parameterEndIndex: number;
    };
  } | null {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath)
    );
    const targetFunction = this.functionLocator.findFunctionLikeDeclaration(sourceFile, signature);
    if (!targetFunction) {
      return null;
    }

    const declarationStart = targetFunction.getStart(sourceFile);
    const openParenIndex = this.findOpenParenBeforeParameters(content, declarationStart, targetFunction.parameters.pos);
    const closeParenIndex = this.findCloseParenAfterParameters(content, targetFunction.parameters.end);

    if (openParenIndex >= 0 && closeParenIndex >= 0) {
      return { declarationStartIndex: declarationStart, range: { openParenIndex, closeParenIndex } };
    }

    // 裸單參數箭頭函式（`x => ...`）的 AST 參數節點本身就是可替換的完整範圍。
    // 這裡必須直接回傳該範圍，否則 scanner 會把宣告後的呼叫點括號誤認為參數列表。
    if (ts.isArrowFunction(targetFunction) && targetFunction.parameters.length === 1 && openParenIndex < 0) {
      const parameter = targetFunction.parameters[0];
      return {
        declarationStartIndex: declarationStart,
        range: {
          parameterStartIndex: parameter.getStart(sourceFile),
          parameterEndIndex: parameter.getEnd()
        }
      };
    }

    return null;
  }

  private findOpenParenBeforeParameters(content: string, declarationStart: number, parametersStart: number): number {
    for (let i = parametersStart - 1; i >= declarationStart; i--) {
      const char = content[i];
      if (char === '(') {
        return i;
      }
      if (!/\s/.test(char)) {
        const fallbackIndex = content.lastIndexOf('(', parametersStart);
        return fallbackIndex >= declarationStart ? fallbackIndex : -1;
      }
    }

    return -1;
  }

  private findCloseParenAfterParameters(content: string, parametersEnd: number): number {
    for (let i = parametersEnd; i < content.length; i++) {
      const char = content[i];
      if (char === ')') {
        return i;
      }
      if (!/\s/.test(char)) {
        return -1;
      }
    }

    return -1;
  }

  private findParameterListRangeWithScanner(
    content: string,
    signatureStartOffset: number
  ): { openParenIndex: number; closeParenIndex: number } | null {
    const openParenIndex = content.indexOf('(', signatureStartOffset);
    if (openParenIndex < 0) {
      return null;
    }

    const closeParenIndex = this.findMatchingParenInContent(content, openParenIndex);
    if (closeParenIndex < 0) {
      return null;
    }

    return { openParenIndex, closeParenIndex };
  }

  private positionToOffset(lines: readonly string[], line: number, column: number): number {
    let offset = 0;
    for (let i = 0; i < line - 1; i++) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return offset + column - 1;
  }

  private findMatchingParenInContent(content: string, openIndex: number): number {
    let depth = 1;
    let quote: '"' | '\'' | '`' | null = null;
    let inBlockComment = false;
    let inLineComment = false;
    let inRegexLiteral = false;
    let inRegexCharClass = false;

    for (let i = openIndex + 1; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];

      if (inRegexLiteral) {
        if (char === '\\') {
          i++;
        } else if (char === '[') {
          inRegexCharClass = true;
        } else if (char === ']') {
          inRegexCharClass = false;
        } else if (char === '/' && !inRegexCharClass) {
          inRegexLiteral = false;
        }
        continue;
      }

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
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if (char === '/' && this.isRegexLiteralStart(content, i, openIndex)) {
        inRegexLiteral = true;
        inRegexCharClass = false;
        continue;
      }

      if (char === '"' || char === '\'' || char === '`') {
        quote = char;
        continue;
      }

      if (char === '(') { depth++; }
      else if (char === ')') {
        depth--;
        if (depth === 0) { return i; }
      }
    }

    return -1;
  }

  private isRegexLiteralStart(content: string, slashIndex: number, scanStartIndex: number): boolean {
    for (let i = slashIndex - 1; i > scanStartIndex; i--) {
      const char = content[i];
      if (/\s/.test(char)) {
        continue;
      }

      if (char === '>' && content[i - 1] === '=') {
        return true;
      }

      return '=(:,[!&|?{};'.includes(char);
    }

    return false;
  }

  /**
   * 生成參數字串
   */
  private generateParameterString(signature: FunctionSignature, filePath: string): string {
    const isTypeScript = FileUtils.isTypeScript(filePath);

    return signature.parameters.map(param => {
      let result = '';

      if (param.rest) {
        result += '...';
      }

      result += param.name;

      if (param.optional && param.defaultValue === undefined) {
        result += '?';
      }

      if (param.type && isTypeScript) {
        result += `: ${param.type}`;
      }

      if (param.defaultValue !== undefined) {
        result += ` = ${param.defaultValue}`;
      }

      return result;
    }).join(', ');
  }
}

export function createDefinitionUpdater(
  fileUtils: FileUtils,
  functionLocator: FunctionDeclarationLocator
): DefinitionUpdater {
  return new DefinitionUpdater(fileUtils, functionLocator);
}
