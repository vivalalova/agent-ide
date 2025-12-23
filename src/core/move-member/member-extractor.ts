/**
 * Member Extractor
 * 從程式碼中提取成員定義
 */

import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { MemberType, type MemberDefinition } from './types.js';

/**
 * 成員提取器
 */
export class MemberExtractor {
  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {}

  /**
   * 提取指定成員
   */
  async extractMember(
    filePath: string,
    memberName: string,
    memberType?: MemberType,
    className?: string
  ): Promise<MemberDefinition | null> {
    const content = await this.readFile(filePath);
    if (!content) {
      return null;
    }

    const extension = this.getFileExtension(filePath);

    switch (extension) {
      case '.ts':
      case '.tsx':
        return this.extractTypeScriptMember(content, filePath, memberName, memberType, className);
      case '.js':
      case '.jsx':
        return this.extractJavaScriptMember(content, filePath, memberName, memberType, className);
      default:
        return null;
    }
  }

  /**
   * 列出檔案中的所有成員
   */
  async listMembers(filePath: string, className?: string): Promise<MemberDefinition[]> {
    const content = await this.readFile(filePath);
    if (!content) {
      return [];
    }

    const extension = this.getFileExtension(filePath);

    switch (extension) {
      case '.ts':
      case '.tsx':
        return this.listTypeScriptMembers(content, filePath, className);
      case '.js':
      case '.jsx':
        return this.listJavaScriptMembers(content, filePath, className);
      default:
        return [];
    }
  }

  /**
   * 提取 TypeScript 成員
   */
  private extractTypeScriptMember(
    content: string,
    filePath: string,
    memberName: string,
    memberType?: MemberType,
    className?: string
  ): MemberDefinition | null {
    const members = this.listTypeScriptMembers(content, filePath, className);

    return members.find(m => {
      const nameMatch = m.name === memberName;
      const typeMatch = !memberType || m.type === memberType;
      const classMatch = !className || m.className === className;
      return nameMatch && typeMatch && classMatch;
    }) || null;
  }

  /**
   * 列出 TypeScript 成員
   */
  private listTypeScriptMembers(content: string, filePath: string, filterClassName?: string): MemberDefinition[] {
    const members: MemberDefinition[] = [];
    const lines = content.split('\n');

    // 函式定義
    const functionPattern = /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/gm;
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, lineNumber - 1);
      const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[4],
        MemberType.Function,
        filePath,
        lineNumber,
        endLine + 1,
        sourceCode,
        undefined,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, lineNumber - 1),
        this.extractDependencies(sourceCode)
      ));
    }

    // 類別定義
    const classPattern = /^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/gm;
    while ((match = classPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, lineNumber - 1);
      const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[4],
        MemberType.Class,
        filePath,
        lineNumber,
        endLine + 1,
        sourceCode,
        undefined,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, lineNumber - 1),
        this.extractDependencies(sourceCode)
      ));

      // 如果是特定類別，提取其成員
      if (!filterClassName || match[4] === filterClassName) {
        const classMembers = this.extractClassMembers(sourceCode, filePath, match[4], lineNumber);
        members.push(...classMembers);
      }
    }

    // 介面定義
    const interfacePattern = /^(\s*)(export\s+)?interface\s+(\w+)/gm;
    while ((match = interfacePattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, lineNumber - 1);
      const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[3],
        MemberType.Interface,
        filePath,
        lineNumber,
        endLine + 1,
        sourceCode,
        undefined,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, lineNumber - 1),
        this.extractDependencies(sourceCode)
      ));
    }

    // 類型別名
    const typePattern = /^(\s*)(export\s+)?type\s+(\w+)/gm;
    while ((match = typePattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const endLine = this.findTypeAliasEnd(lines, lineNumber - 1);
      const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[3],
        MemberType.TypeAlias,
        filePath,
        lineNumber,
        endLine + 1,
        sourceCode,
        undefined,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, lineNumber - 1),
        this.extractDependencies(sourceCode)
      ));
    }

    // 常數
    const constPattern = /^(\s*)(export\s+)?const\s+(\w+)/gm;
    while ((match = constPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const endLine = this.findStatementEnd(lines, lineNumber - 1);
      const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[3],
        MemberType.Constant,
        filePath,
        lineNumber,
        endLine + 1,
        sourceCode,
        undefined,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, lineNumber - 1),
        this.extractDependencies(sourceCode)
      ));
    }

    // 列舉
    const enumPattern = /^(\s*)(export\s+)?enum\s+(\w+)/gm;
    while ((match = enumPattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, lineNumber - 1);
      const sourceCode = lines.slice(lineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[3],
        MemberType.Enum,
        filePath,
        lineNumber,
        endLine + 1,
        sourceCode,
        undefined,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, lineNumber - 1),
        this.extractDependencies(sourceCode)
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
   */
  private extractClassMembers(
    classSource: string,
    filePath: string,
    className: string,
    classStartLine: number
  ): MemberDefinition[] {
    const members: MemberDefinition[] = [];
    const lines = classSource.split('\n');

    // 方法
    const methodPattern = /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*(\w+)\s*\([^)]*\)/gm;
    let match;
    while ((match = methodPattern.exec(classSource)) !== null) {
      // 跳過 constructor
      if (match[4] === 'constructor') {continue;}

      const relativeLineNumber = classSource.substring(0, match.index).split('\n').length;
      const lineNumber = classStartLine + relativeLineNumber - 1;
      const endLine = this.findBlockEndInClass(lines, relativeLineNumber - 1);
      const sourceCode = lines.slice(relativeLineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[4],
        MemberType.Method,
        filePath,
        lineNumber,
        classStartLine + endLine,
        sourceCode,
        className,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, relativeLineNumber - 1),
        this.extractDependencies(sourceCode)
      ));
    }

    // 屬性
    const propertyPattern = /^\s*(public|private|protected)?\s*(static)?\s*(readonly)?\s*(\w+)\s*[?:]?\s*[^(]/gm;
    while ((match = propertyPattern.exec(classSource)) !== null) {
      // 跳過方法和 constructor
      if (classSource.substring(match.index).match(/^\s*\w+\s*\(/)) {continue;}

      const relativeLineNumber = classSource.substring(0, match.index).split('\n').length;
      const lineNumber = classStartLine + relativeLineNumber - 1;
      const endLine = this.findStatementEnd(lines, relativeLineNumber - 1);
      const sourceCode = lines.slice(relativeLineNumber - 1, endLine + 1).join('\n');

      members.push(this.createMember(
        match[4],
        MemberType.Property,
        filePath,
        lineNumber,
        classStartLine + endLine,
        sourceCode,
        className,
        this.extractModifiers(match[0]),
        this.extractDocumentation(lines, relativeLineNumber - 1),
        this.extractDependencies(sourceCode)
      ));
    }

    return members;
  }

  /**
   * 提取 JavaScript 成員（簡化版）
   */
  private extractJavaScriptMember(
    content: string,
    filePath: string,
    memberName: string,
    memberType?: MemberType,
    className?: string
  ): MemberDefinition | null {
    // JavaScript 基本上與 TypeScript 相同
    return this.extractTypeScriptMember(content, filePath, memberName, memberType, className);
  }

  /**
   * 列出 JavaScript 成員
   */
  private listJavaScriptMembers(content: string, filePath: string, className?: string): MemberDefinition[] {
    return this.listTypeScriptMembers(content, filePath, className);
  }

  /**
   * 建立成員定義
   */
  private createMember(
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
   * 找到程式碼區塊結尾
   */
  private findBlockEnd(lines: string[], startLine: number): number {
    let depth = 0;
    let foundStart = false;

    for (let i = startLine; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') {
          depth++;
          foundStart = true;
        } else if (char === '}') {
          depth--;
          if (foundStart && depth === 0) {
            return i;
          }
        }
      }
    }

    return startLine;
  }

  /**
   * 在類別內找到程式碼區塊結尾
   */
  private findBlockEndInClass(lines: string[], startLine: number): number {
    let depth = 0;
    let foundStart = false;

    for (let i = startLine; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') {
          depth++;
          foundStart = true;
        } else if (char === '}') {
          depth--;
          if (foundStart && depth === 0) {
            return i;
          }
        }
      }
    }

    return startLine;
  }

  /**
   * 找到類型別名結尾
   */
  private findTypeAliasEnd(lines: string[], startLine: number): number {
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].includes(';') || (i > startLine && !lines[i].trim().startsWith('|') && !lines[i].trim().startsWith('&'))) {
        return i;
      }
    }
    return startLine;
  }

  /**
   * 找到陳述句結尾
   */
  private findStatementEnd(lines: string[], startLine: number): number {
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(';') || (line.includes('=') && !line.includes('=>') && i > startLine)) {
        return i;
      }
      // 檢查是否是多行箭頭函式或物件
      if (line.includes('{')) {
        return this.findBlockEnd(lines, i);
      }
    }
    return startLine;
  }

  /**
   * 提取修飾符
   */
  private extractModifiers(declaration: string): string[] {
    const modifiers: string[] = [];
    if (declaration.includes('export')) {modifiers.push('export');}
    if (declaration.includes('async')) {modifiers.push('async');}
    if (declaration.includes('static')) {modifiers.push('static');}
    if (declaration.includes('public')) {modifiers.push('public');}
    if (declaration.includes('private')) {modifiers.push('private');}
    if (declaration.includes('protected')) {modifiers.push('protected');}
    if (declaration.includes('readonly')) {modifiers.push('readonly');}
    if (declaration.includes('abstract')) {modifiers.push('abstract');}
    return modifiers;
  }

  /**
   * 提取文件註解
   */
  private extractDocumentation(lines: string[], memberLine: number): string | undefined {
    const docLines: string[] = [];
    let i = memberLine - 1;

    while (i >= 0) {
      const line = lines[i].trim();

      if (line.endsWith('*/')) {
        docLines.unshift(line);
        i--;
        while (i >= 0 && !lines[i].trim().startsWith('/**') && !lines[i].trim().startsWith('/*')) {
          docLines.unshift(lines[i].trim());
          i--;
        }
        if (i >= 0) {
          docLines.unshift(lines[i].trim());
        }
        break;
      } else if (line.startsWith('//')) {
        docLines.unshift(line.substring(2).trim());
        i--;
      } else if (line === '') {
        i--;
      } else {
        break;
      }
    }

    return docLines.length > 0 ? docLines.join('\n') : undefined;
  }

  /**
   * 提取依賴
   */
  private extractDependencies(sourceCode: string): string[] {
    const dependencies: string[] = [];

    // 提取型別引用
    const typePattern = /:\s*(\w+)(?:<|;|\s|,|\))/g;
    let match;
    while ((match = typePattern.exec(sourceCode)) !== null) {
      const typeName = match[1];
      // 排除基本類型
      if (!['string', 'number', 'boolean', 'void', 'any', 'unknown', 'never', 'null', 'undefined'].includes(typeName)) {
        dependencies.push(typeName);
      }
    }

    // 提取函式呼叫
    const callPattern = /(\w+)\s*\(/g;
    while ((match = callPattern.exec(sourceCode)) !== null) {
      const funcName = match[1];
      // 排除關鍵字
      if (!['if', 'while', 'for', 'switch', 'function', 'async', 'await', 'return', 'new', 'typeof', 'instanceof'].includes(funcName)) {
        dependencies.push(funcName);
      }
    }

    return [...new Set(dependencies)];
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 取得檔案副檔名
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
  }
}

/**
 * 建立 MemberExtractor 實例
 */
export function createMemberExtractor(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): MemberExtractor {
  return new MemberExtractor(parserRegistry, fileSystem);
}
