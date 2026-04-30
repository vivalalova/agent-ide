/**
 * TypeScript Member Extractor
 * 提取 TypeScript/TSX 檔案中的成員定義
 */

import { MemberType, type MemberDefinition } from '../types.js';
import {
  findBlockEnd,
  findBlockEndInClass,
  findTypeAliasEnd,
  findStatementEnd
} from '../utils/range-finder.js';

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
  let match;

  // 函式定義
  const functionPattern = /^([ \t]*)(export[ \t]+)?(async[ \t]+)?function[ \t]+(\w+)/gm;
  while ((match = functionPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
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
      extractDependencies(sourceCode)
    ));
  }

  // 類別定義
  const classPattern = /^([ \t]*)(export[ \t]+)?(abstract[ \t]+)?class[ \t]+(\w+)/gm;
  while ((match = classPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const endLine = findBlockEnd(lines, lineNumber - 1);
    const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[4],
      MemberType.Class,
      filePath,
      lineNumber,
      endLine + 1,
      sourceCode,
      undefined,
      extractModifiers(match[0]),
      extractDocumentation(lines, lineNumber - 1),
      extractDependencies(sourceCode)
    ));

    // 如果是特定類別，提取其成員
    if (!filterClassName || match[4] === filterClassName) {
      const classMembers = extractClassMembers(sourceCode, filePath, match[4], lineNumber);
      members.push(...classMembers);
    }
  }

  // 介面定義
  const interfacePattern = /^([ \t]*)(export[ \t]+)?interface[ \t]+(\w+)/gm;
  while ((match = interfacePattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
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
      extractDependencies(sourceCode)
    ));
  }

  // 類型別名
  const typePattern = /^([ \t]*)(export[ \t]+)?type[ \t]+(\w+)/gm;
  while ((match = typePattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
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
      extractDependencies(sourceCode)
    ));
  }

  // 常數
  const constPattern = /^([ \t]*)(export[ \t]+)?const[ \t]+(\w+)/gm;
  while ((match = constPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
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
      extractDependencies(sourceCode)
    ));
  }

  // 列舉
  const enumPattern = /^([ \t]*)(export[ \t]+)?enum[ \t]+(\w+)/gm;
  while ((match = enumPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
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
      extractDependencies(sourceCode)
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
  const methodPattern = /^[ \t]*(public|private|protected)?[ \t]*(static)?[ \t]*(async)?[ \t]*(\w+)[ \t]*\([^)]*\)/gm;
  while ((match = methodPattern.exec(classBody)) !== null) {
    // 跳過 constructor
    if (match[4] === 'constructor') { continue; }

    const relativeLineNumber = classBody.substring(0, match.index).split('\n').length;
    const lineNumber = classStartLine + bodyStartLine - 1 + relativeLineNumber - 1;
    const endLine = findBlockEndInClass(bodyLines, relativeLineNumber - 1);
    const sourceCode = bodyLines.slice(relativeLineNumber - 1, endLine + 1).join('\n');

    members.push(createMember(
      match[4],
      MemberType.Method,
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

  // 屬性
  const propertyPattern = /^[ \t]*(public|private|protected)?[ \t]*(static)?[ \t]*(readonly)?[ \t]*(\w+)[ \t]*[?:]?[ \t]*[^(]/gm;
  while ((match = propertyPattern.exec(classBody)) !== null) {
    // 跳過方法和 constructor
    if (classBody.substring(match.index).match(/^\s*\w+\s*\(/)) { continue; }

    const relativeLineNumber = classBody.substring(0, match.index).split('\n').length;
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
  dependencies: string[]
): MemberDefinition {
  return {
    name,
    type,
    location: {
      filePath,
      range: {
        start: { line: startLine, column: 1 },
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
      docLines.unshift(line.substring(2).trim());
      i--;
    }
    return docLines.join('\n');
  }

  return undefined;
}

/**
 * 提取依賴
 */
function extractDependencies(sourceCode: string): string[] {
  const dependencies: string[] = [];
  let match;

  // 提取型別引用
  const typePattern = /:\s*(\w+)(?:<|;|\s|,|\))/g;
  while ((match = typePattern.exec(sourceCode)) !== null) {
    const typeName = match[1];
    if (!BASIC_TYPES.has(typeName) && !KEYWORDS.has(typeName)) {
      dependencies.push(typeName);
    }
  }

  // 提取函式呼叫
  const callPattern = /(\w+)\s*\(/g;
  while ((match = callPattern.exec(sourceCode)) !== null) {
    const funcName = match[1];
    if (!KEYWORDS.has(funcName) && !BASIC_TYPES.has(funcName)) {
      dependencies.push(funcName);
    }
  }

  // 提取變數/常數引用（賦值右側、運算子右側、比較右側）
  const varRefPattern = /[=><+\-*/%&|!]\s*([A-Z][A-Z0-9_]*)\b/g;
  while ((match = varRefPattern.exec(sourceCode)) !== null) {
    const varName = match[1];
    if (!KEYWORDS.has(varName) && !BASIC_TYPES.has(varName)) {
      dependencies.push(varName);
    }
  }

  // 提取作為比較對象的識別符
  const comparisonPattern = /\b([A-Z][A-Z0-9_]*)\s*[=!<>]/g;
  while ((match = comparisonPattern.exec(sourceCode)) !== null) {
    const varName = match[1];
    if (!KEYWORDS.has(varName) && !BASIC_TYPES.has(varName)) {
      dependencies.push(varName);
    }
  }

  return [...new Set(dependencies)];
}
