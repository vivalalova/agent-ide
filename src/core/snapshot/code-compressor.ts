/**
 * 程式碼壓縮器
 * 負責將程式碼壓縮到最小 token 數，同時保留關鍵資訊
 */

import type { CompressedCode, CompressionLevel } from './types.js';
import { CompressionLevel as Level } from './types.js';

/**
 * 程式碼壓縮器類別
 */
export class CodeCompressor {
  /**
   * 壓縮程式碼
   */
  async compress(code: string, level: CompressionLevel = Level.Full): Promise<CompressedCode> {
    const originalLines = code.split('\n').length;

    let compressed: string;
    let symbolMap: Record<string, string> | undefined;

    switch (level) {
      case Level.Minimal: {
        // 最小化：只保留函式/類別簽章
        compressed = this.extractSignatures(code);
        break;
      }

      case Level.Medium: {
        // 中等：移除註解和空白，保留完整邏輯
        compressed = this.removeCommentsAndWhitespace(code);
        break;
      }

      case Level.Full: {
        // 完整：移除註解、壓縮空白、縮短變數名
        const minified = this.removeCommentsAndWhitespace(code);
        const result = this.shortenVariableNames(minified);
        compressed = result.code;
        symbolMap = result.symbolMap;
        break;
      }

      default:
        compressed = code;
    }

    const compressedLines = compressed.split('\n').length;

    return {
      m: compressed,
      sm: symbolMap,
      ol: originalLines,
      cl: compressedLines
    };
  }

  /**
   * 提取函式和類別簽章（Minimal 層級）
   */
  private extractSignatures(code: string): string {
    const lines = code.split('\n');
    const signatures: string[] = [];
    let inMultiLineComment = false;
    let braceDepth = 0;
    let currentSignature = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 處理多行註解
      if (line.includes('/*')) {
        inMultiLineComment = true;
      }
      if (line.includes('*/')) {
        inMultiLineComment = false;
        continue;
      }
      if (inMultiLineComment || line.startsWith('//')) {
        continue;
      }

      // 檢測函式、類別、介面、型別定義
      const isDeclaration =
        line.match(/^(export\s+)?(async\s+)?function\s+\w+/) ||
        line.match(/^(export\s+)?(abstract\s+)?class\s+\w+/) ||
        line.match(/^(export\s+)?interface\s+\w+/) ||
        line.match(/^(export\s+)?type\s+\w+/) ||
        line.match(/^(export\s+)?enum\s+\w+/) ||
        line.match(/^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/) || // 箭頭函式
        line.match(/^\s*(public|private|protected|static)?\s*(async\s+)?\w+\s*\(/); // 方法

      if (isDeclaration) {
        currentSignature = line;

        // 計算大括號深度，找到簽章結束位置
        braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        // 如果簽章在單行內完成（無大括號或大括號平衡）
        if (braceDepth === 0 || line.endsWith(';')) {
          signatures.push(currentSignature);
          currentSignature = '';
        }
      } else if (currentSignature) {
        // 繼續收集多行簽章
        currentSignature += ' ' + line;
        braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

        if (braceDepth === 0) {
          signatures.push(currentSignature);
          currentSignature = '';
        }
      }
    }

    return signatures.join('\n');
  }

  /**
   * 移除註解和多餘空白（Medium/Full 層級）
   */
  private removeCommentsAndWhitespace(code: string): string {
    // 移除單行註解（保留 URL 中的 //）
    code = code.replace(/(?<!:)\/\/.*$/gm, '');

    // 移除多行註解
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');

    // 移除空白行
    code = code.replace(/^\s*\n/gm, '');

    // 壓縮多個空白為單一空白
    code = code.replace(/[ \t]+/g, ' ');

    // 移除行首空白
    code = code.replace(/^\s+/gm, '');

    // 移除行尾空白
    code = code.replace(/\s+$/gm, '');

    return code.trim();
  }

  /**
   * 縮短變數名（Full 層級）
   */
  private shortenVariableNames(code: string): { code: string; symbolMap: Record<string, string> } {
    const symbolMap: Record<string, string> = {};
    let counter = 0;

    // 生成短變數名（a, b, c, ..., z, aa, ab, ...)
    const generateShortName = (): string => {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      let name = '';
      let n = counter++;

      do {
        name = chars[n % 26] + name;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);

      return name;
    };

    // 找出所有區域變數（簡化版，不處理作用域）
    // 只縮短明顯的區域變數（let/const/var 宣告的）
    const variablePattern = /\b(let|const|var)\s+(\w+)\b/g;
    const variables = new Set<string>();

    let match;
    while ((match = variablePattern.exec(code)) !== null) {
      const varName = match[2];

      // 不縮短以下類型的變數：
      // 1. 單字元變數（已經很短）
      // 2. 常見的保留字或內建物件
      // 3. 大寫開頭（可能是類別或常數）
      if (
        varName.length === 1 ||
        varName[0] === varName[0].toUpperCase() ||
        this.isReservedOrBuiltin(varName)
      ) {
        continue;
      }

      variables.add(varName);
    }

    // 建立映射並替換
    for (const varName of variables) {
      const shortName = generateShortName();
      symbolMap[shortName] = varName;

      // 使用 word boundary 確保完整匹配變數名
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      code = code.replace(regex, shortName);
    }

    // 如果沒有縮短任何變數，不返回 symbolMap
    if (Object.keys(symbolMap).length === 0) {
      return { code, symbolMap: {} };
    }

    return { code, symbolMap };
  }

  /**
   * 檢查是否為保留字或內建物件
   */
  private isReservedOrBuiltin(name: string): boolean {
    const reserved = new Set([
      // JavaScript 保留字
      'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
      'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
      'if', 'import', 'in', 'instanceof', 'let', 'new', 'return', 'super',
      'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while',
      'with', 'yield', 'enum', 'implements', 'interface', 'package', 'private',
      'protected', 'public', 'static', 'async', 'await',

      // 常見內建物件
      'Array', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Math',
      'Number', 'Object', 'Promise', 'RegExp', 'String', 'Symbol',
      'console', 'window', 'document', 'process', 'require', 'module',
      'exports', '__dirname', '__filename',

      // TypeScript 特有
      'type', 'interface', 'namespace', 'declare', 'abstract', 'as',
      'readonly', 'keyof', 'infer', 'unknown', 'never', 'any',

      // 常見變數名（不應縮短）
      'id', 'name', 'data', 'value', 'index', 'item', 'key', 'result',
      'error', 'response', 'request', 'params', 'options', 'config',
      'props', 'state', 'context', 'event', 'callback'
    ]);

    return reserved.has(name);
  }

  /**
   * 計算壓縮率
   */
  calculateCompressionRatio(original: string, compressed: string): number {
    const originalSize = original.length;
    const compressedSize = compressed.length;

    if (originalSize === 0) {
      return 0;
    }

    return ((originalSize - compressedSize) / originalSize) * 100;
  }

  /**
   * 估計 token 數（粗略估計：每 4 個字元 ≈ 1 token）
   */
  estimateTokens(code: string): number {
    return Math.ceil(code.length / 4);
  }
}
