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
    let deps: Record<string, string[]> | undefined;

    switch (level) {
      case Level.Minimal: {
        // 最小化：只保留函式/類別簽章
        compressed = this.extractSignatures(code);
        break;
      }

      case Level.Medium: {
        // 中等：提取簽章 + 依賴關係（不含函式邏輯）
        const result = this.extractSignaturesWithDependencies(code);
        compressed = result.signatures;
        deps = result.dependencies;
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
      cl: compressedLines,
      deps
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
   * 提取簽章和依賴關係（Medium 層級）
   * 保留函式/類別簽章，移除實作，但提取依賴關係
   */
  private extractSignaturesWithDependencies(code: string): {
    signatures: string;
    dependencies: Record<string, string[]>;
  } {
    const lines = code.split('\n');
    const signatures: string[] = [];
    const dependencies: Record<string, string[]> = {};

    let inMultiLineComment = false;
    let braceDepth = 0;
    let currentFunctionName = '';
    let currentFunctionBody = '';
    let isCollectingBody = false;
    let signatureLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 處理多行註解
      if (trimmedLine.includes('/*') && !trimmedLine.includes('*/')) {
        inMultiLineComment = true;
        continue;
      }
      if (trimmedLine.includes('*/')) {
        inMultiLineComment = false;
        continue;
      }
      if (inMultiLineComment || trimmedLine.startsWith('//')) {
        continue;
      }

      // 檢測函式/方法宣告
      const functionMatch =
        trimmedLine.match(/^(export\s+)?(async\s+)?function\s+(\w+)/) ||
        trimmedLine.match(/^(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/) ||
        trimmedLine.match(/^\s*(public|private|protected)?\s*(static)?\s*(async\s+)?(\w+)\s*\([^)]*\)\s*(:\s*\S+)?\s*{/);

      // 類別、介面、型別、enum 宣告
      const typeMatch =
        trimmedLine.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/) ||
        trimmedLine.match(/^(export\s+)?interface\s+(\w+)/) ||
        trimmedLine.match(/^(export\s+)?type\s+(\w+)/) ||
        trimmedLine.match(/^(export\s+)?enum\s+(\w+)/);

      if (functionMatch && !isCollectingBody) {
        // 提取函式名稱
        currentFunctionName = this.extractFunctionName(trimmedLine);
        signatureLines = [line];
        braceDepth = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;

        if (braceDepth > 0) {
          isCollectingBody = true;
          currentFunctionBody = trimmedLine;
        } else if (trimmedLine.endsWith(';')) {
          // 函式宣告（無 body）
          signatures.push(line);
          currentFunctionName = '';
        }
      } else if (typeMatch && !isCollectingBody) {
        // 類別/介面/型別/enum - 保留完整宣告行
        signatures.push(line);

        // 處理 class/enum 的 body（簡化處理）
        if (trimmedLine.includes('{')) {
          braceDepth = (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;
          if (braceDepth > 0) {
            isCollectingBody = true;
            currentFunctionName = ''; // 類別 body 不追蹤依賴
            currentFunctionBody = '';
          }
        }
      } else if (isCollectingBody) {
        currentFunctionBody += '\n' + trimmedLine;
        braceDepth += (trimmedLine.match(/{/g) || []).length - (trimmedLine.match(/}/g) || []).length;

        if (braceDepth === 0) {
          // 函式結束
          if (currentFunctionName) {
            // 提取依賴
            const deps = this.extractDependenciesFromBody(currentFunctionBody, currentFunctionName);
            if (deps.length > 0) {
              dependencies[currentFunctionName] = deps;
            }
            // 輸出簽章（不含 body）
            const signature = this.buildSignature(signatureLines[0]);
            signatures.push(signature);
          }

          isCollectingBody = false;
          currentFunctionName = '';
          currentFunctionBody = '';
          signatureLines = [];
        }
      } else if (trimmedLine && !trimmedLine.startsWith('import') && !trimmedLine.startsWith('export {')) {
        // 保留 import/export 語句、變數宣告等
        if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('export ')) {
          signatures.push(line);
        }
      }
    }

    return {
      signatures: signatures.join('\n'),
      dependencies
    };
  }

  /**
   * 從程式碼行提取函式名稱
   */
  private extractFunctionName(line: string): string {
    // async function foo(
    let match = line.match(/function\s+(\w+)/);
    if (match) {return match[1];}

    // const foo = (
    match = line.match(/const\s+(\w+)\s*=/);
    if (match) {return match[1];}

    // public async foo( or foo(
    match = line.match(/(?:public|private|protected|static|async|\s)*(\w+)\s*\(/);
    if (match && !this.isControlFlowKeyword(match[1])) {return match[1];}

    return '';
  }

  /**
   * 建構函式簽章（移除 body）
   */
  private buildSignature(line: string): string {
    // 移除 body，只保留簽章
    const braceIndex = line.indexOf('{');
    if (braceIndex > 0) {
      return line.substring(0, braceIndex).trim() + ' { /* ... */ }';
    }
    return line;
  }

  /**
   * 從函式 body 提取依賴
   */
  private extractDependenciesFromBody(body: string, selfName: string): string[] {
    const deps = new Set<string>();

    // 提取函式呼叫：identifier(
    const callPattern = /\b([a-zA-Z_]\w*)\s*\(/g;
    let match;
    while ((match = callPattern.exec(body)) !== null) {
      const name = match[1];
      if (name !== selfName && !this.isControlFlowKeyword(name) && !this.isBuiltinFunction(name)) {
        deps.add(name);
      }
    }

    // 提取成員存取：this.xxx 或 obj.xxx（只取方法呼叫）
    const memberCallPattern = /\b(?:this|[a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*\(/g;
    while ((match = memberCallPattern.exec(body)) !== null) {
      const name = match[1];
      if (!this.isBuiltinFunction(name)) {
        deps.add(name);
      }
    }

    // 提取全域變數引用（大寫開頭，2-30 字元，排除常見 false positive）
    const globalPattern = /\b([A-Z][a-zA-Z_\d]{1,29})\b/g;
    while ((match = globalPattern.exec(body)) !== null) {
      const name = match[1];
      // 排除：內建類別、型別關鍵字、常見常數、純大寫（通常是常數）
      if (!this.isBuiltinClass(name) && !this.isTypeKeyword(name) && !this.isCommonConstant(name)) {
        // 排除全大寫（常數）或只有 2 字元的大寫（如 XY, AB）
        if (!/^[A-Z]{2,}$/.test(name)) {
          deps.add(name);
        }
      }
    }

    return Array.from(deps).sort();
  }

  /**
   * 是否為控制流關鍵字或內建類別（作為構造函式）
   */
  private isControlFlowKeyword(name: string): boolean {
    // 控制流
    if (['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'try', 'catch', 'finally', 'return', 'throw', 'new', 'typeof', 'instanceof', 'await', 'async', 'yield'].includes(name)) {
      return true;
    }
    // 內建類別作為構造函式
    if (this.isBuiltinClass(name)) {
      return true;
    }
    return false;
  }

  /**
   * 是否為內建函式或方法
   */
  private isBuiltinFunction(name: string): boolean {
    const builtins = new Set([
      // console 方法
      'console', 'log', 'warn', 'error', 'info', 'debug', 'trace', 'dir', 'table', 'time', 'timeEnd', 'group', 'groupEnd', 'assert', 'count', 'clear',
      // 定時器
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
      // 數值轉換
      'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'isInteger', 'isSafeInteger',
      // URI
      'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent',
      // 其他全域
      'eval', 'fetch', 'require', 'import', 'export', 'alert', 'confirm', 'prompt',
      // Array 方法
      'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'reverse', 'sort', 'flat', 'flatMap',
      'map', 'filter', 'reduce', 'reduceRight', 'forEach', 'find', 'findIndex', 'findLast', 'findLastIndex',
      'some', 'every', 'includes', 'indexOf', 'lastIndexOf', 'join', 'fill', 'copyWithin', 'at', 'with', 'toSorted', 'toReversed', 'toSpliced',
      // String 方法
      'split', 'trim', 'trimStart', 'trimEnd', 'replace', 'replaceAll', 'match', 'matchAll', 'search',
      'toLowerCase', 'toUpperCase', 'toLocaleLowerCase', 'toLocaleUpperCase',
      'charAt', 'charCodeAt', 'codePointAt', 'fromCharCode', 'fromCodePoint',
      'substring', 'substr', 'slice', 'padStart', 'padEnd', 'repeat', 'normalize', 'localeCompare',
      'startsWith', 'endsWith', 'anchor', 'link', 'big', 'small', 'bold', 'italics', 'strike', 'sub', 'sup',
      // RegExp 方法
      'test', 'exec',
      // Object 方法
      'toString', 'valueOf', 'hasOwnProperty', 'propertyIsEnumerable', 'isPrototypeOf', 'toLocaleString',
      'keys', 'values', 'entries', 'assign', 'create', 'defineProperty', 'defineProperties',
      'freeze', 'seal', 'preventExtensions', 'isFrozen', 'isSealed', 'isExtensible',
      'getOwnPropertyNames', 'getOwnPropertySymbols', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors',
      'getPrototypeOf', 'setPrototypeOf', 'fromEntries', 'hasOwn', 'is',
      // JSON 方法
      'stringify', 'parse',
      // Number 方法
      'toFixed', 'toPrecision', 'toExponential',
      // Date 方法
      'getTime', 'getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds',
      'setTime', 'setFullYear', 'setMonth', 'setDate', 'setHours', 'setMinutes', 'setSeconds', 'setMilliseconds',
      'toISOString', 'toJSON', 'toDateString', 'toTimeString', 'toUTCString', 'toLocaleDateString', 'toLocaleTimeString',
      // Math 方法
      'abs', 'ceil', 'floor', 'round', 'trunc', 'sign', 'sqrt', 'cbrt', 'pow', 'exp', 'expm1', 'log', 'log10', 'log2', 'log1p',
      'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
      'min', 'max', 'random', 'hypot', 'fround', 'clz32', 'imul',
      // Promise 方法
      'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'allSettled', 'race', 'any',
      // Map/Set 方法
      'get', 'set', 'has', 'delete', 'add', 'size', 'clear', 'forEach',
      // 其他常見方法
      'format', 'bind', 'call', 'apply', 'next', 'return', 'throw', 'done', 'value'
    ]);
    return builtins.has(name);
  }

  /**
   * 是否為內建類別
   */
  private isBuiltinClass(name: string): boolean {
    return ['Array', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Math', 'Number', 'Object', 'Promise', 'RegExp', 'String', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Intl', 'WebAssembly', 'Atomics', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'Buffer', 'Event', 'EventTarget', 'FormData', 'Headers', 'Request', 'Response', 'Blob', 'File', 'FileReader', 'ReadableStream', 'WritableStream', 'TransformStream'].includes(name);
  }

  /**
   * 是否為型別關鍵字
   */
  private isTypeKeyword(name: string): boolean {
    return ['Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'Parameters', 'ReturnType', 'ConstructorParameters', 'InstanceType', 'ThisParameterType', 'OmitThisParameter', 'ThisType', 'Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize'].includes(name);
  }

  /**
   * 是否為常見常數/字串值（非真正依賴）
   */
  private isCommonConstant(name: string): boolean {
    // 常見的字串常量（貨幣、國家、協定等）
    const constants = new Set([
      'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'TWD', 'KRW', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
      'US', 'UK', 'EU', 'CN', 'TW', 'JP', 'KR', 'AU', 'CA', 'DE', 'FR',
      'HTTP', 'HTTPS', 'FTP', 'SSH', 'TCP', 'UDP', 'IP', 'DNS', 'SSL', 'TLS',
      'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
      'API', 'URL', 'URI', 'XML', 'HTML', 'CSS', 'DOM', 'EOF', 'EOL', 'UTF',
      'ID', 'OK', 'SKU', 'UUID', 'GUID',
      'NULL', 'TRUE', 'FALSE', 'NaN', 'Infinity',
      'TODO', 'FIXME', 'NOTE', 'HACK', 'XXX', 'BUG', 'DEBUG',
      'MIN', 'MAX', 'PI', 'INF',
      'ASC', 'DESC', 'AND', 'OR', 'NOT', 'IN', 'IS',
      'RGB', 'RGBA', 'HSL', 'HSLA', 'HEX',
      'SVG', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'PDF', 'CSV', 'JSON', 'YAML', 'TOML',
      'ISO', 'RFC', 'UTC', 'GMT', 'PST', 'EST', 'CST',
      'AAA', 'BBB', 'CCC', 'XXX', 'YYY', 'ZZZ',
      'NumberFormat', 'DateTimeFormat', 'Collator', 'PluralRules'
    ]);
    return constants.has(name);
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
