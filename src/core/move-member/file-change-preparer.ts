/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的變更
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { MemberDefinition, MoveMemberOptions, FileChange, TargetFileChange } from './types.js';
import { MoveTargetType } from './types.js';

/**
 * 來源檔案的符號資訊
 */
interface SourceSymbolInfo {
  /** 本地定義的 export 符號 */
  localExports: Set<string>;
  /** import 的符號對應的來源 { symbolName -> modulePath } */
  importedSymbols: Map<string, string>;
}

/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的程式碼變更
 */
export class FileChangePreparer {
  constructor(private readonly fileSystem: IFileSystem) {}

  /**
   * 準備來源檔案變更
   */
  async prepareSourceFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<FileChange> {
    const content = await this.readFile(options.sourceFile);
    if (!content) {
      throw new Error(`無法讀取來源檔案: ${options.sourceFile}`);
    }

    const lines = content.split('\n');
    const startLine = member.location.range.start.line - 1;
    const endLine = member.location.range.end.line - 1;

    // 移除成員（包含前面的文件註解）
    let removeStartLine = startLine;
    if (member.documentation) {
      const docLines = member.documentation.split('\n').length;
      removeStartLine = Math.max(0, startLine - docLines);
    }

    // 處理 re-export
    let reexportStatement = '';
    if (options.keepReexport) {
      const relativePath = this.calculateRelativePath(options.sourceFile, options.target.filePath);
      reexportStatement = `export { ${member.name} } from '${relativePath}';\n`;
    }

    const newLines = [
      ...lines.slice(0, removeStartLine),
      ...(options.keepReexport ? [reexportStatement] : []),
      ...lines.slice(endLine + 1)
    ];

    return {
      filePath: options.sourceFile,
      originalCode: content,
      newCode: newLines.join('\n')
    };
  }

  /**
   * 準備目標檔案變更
   * 自動判斷目標檔案是否存在：存在則插入，不存在則創建新檔案
   */
  async prepareTargetFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<TargetFileChange> {
    const { target } = options;

    // 準備要插入的程式碼
    let memberCode = member.sourceCode;
    if (member.documentation) {
      memberCode = member.documentation + '\n' + memberCode;
    }

    // 確保有 export（如果原本有）
    if (!memberCode.includes('export') && member.modifiers.includes('export')) {
      memberCode = 'export ' + memberCode;
    }

    // 分析成員依賴並生成需要的 import
    const sourceContent = await this.readFile(options.sourceFile);
    const dependencyImports = sourceContent
      ? await this.generateDependencyImports(
          member,
          sourceContent,
          options.sourceFile,
          target.filePath
        )
      : '';

    // 自動判斷檔案是否存在
    const content = await this.readFile(target.filePath);
    const isNewFile = content === null;

    if (isNewFile) {
      // 新檔案：生成完整的檔案內容
      const newCode = dependencyImports + (dependencyImports ? '\n\n' : '') + memberCode + '\n';

      return {
        filePath: target.filePath,
        originalCode: null,
        newCode,
        isNewFile: true
      };
    }

    // 現有檔案
    const lines = content.split('\n');
    let insertLine = target.insertPosition ?? -1;

    if (target.type === MoveTargetType.ExistingClass && target.className) {
      // 插入到類別內
      insertLine = await this.findClassInsertPosition(content, target.className);
    }

    if (insertLine < 0) {
      // 預設插入到檔案結尾
      insertLine = lines.length;
    }

    // 現有檔案：將 import 插入到檔案開頭（在現有 import 之後）
    let finalCode: string;
    if (dependencyImports) {
      const importInsertLine = this.findImportInsertPosition(lines);
      const newLines = [
        ...lines.slice(0, importInsertLine),
        dependencyImports,
        ...lines.slice(importInsertLine, insertLine),
        '',
        memberCode,
        ...lines.slice(insertLine)
      ];
      finalCode = newLines.join('\n');
    } else {
      const newLines = [
        ...lines.slice(0, insertLine),
        '',
        memberCode,
        ...lines.slice(insertLine)
      ];
      finalCode = newLines.join('\n');
    }

    return {
      filePath: target.filePath,
      originalCode: content,
      newCode: finalCode,
      isNewFile: false
    };
  }

  /**
   * 找到 import 插入位置（在最後一個 import 之後）
   */
  private findImportInsertPosition(lines: string[]): number {
    let lastImportLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('import{')) {
        lastImportLine = i + 1;
      }
      // 遇到非 import、非空行、非註解，停止搜尋
      if (line && !line.startsWith('import') && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        break;
      }
    }
    return lastImportLine;
  }

  /**
   * 生成成員依賴的 import
   */
  private async generateDependencyImports(
    member: MemberDefinition,
    sourceContent: string,
    sourceFile: string,
    targetFile: string
  ): Promise<string> {
    const symbolInfo = this.analyzeSourceSymbols(sourceContent);
    const neededImports: Map<string, Set<string>> = new Map(); // modulePath -> Set<symbolName>

    // 分析成員依賴的符號
    for (const dep of member.dependencies) {
      // 跳過成員自己的名稱
      if (dep === member.name) { continue; }

      if (symbolInfo.localExports.has(dep)) {
        // 依賴來自來源檔案的本地 export，需要從來源檔案 import
        const relativePath = this.calculateRelativePath(targetFile, sourceFile);
        if (!neededImports.has(relativePath)) {
          neededImports.set(relativePath, new Set());
        }
        neededImports.get(relativePath)!.add(dep);
      } else if (symbolInfo.importedSymbols.has(dep)) {
        // 依賴來自外部模組，保持原本的 import 路徑
        const originalModulePath = symbolInfo.importedSymbols.get(dep)!;
        if (!neededImports.has(originalModulePath)) {
          neededImports.set(originalModulePath, new Set());
        }
        neededImports.get(originalModulePath)!.add(dep);
      }
    }

    // 生成 import 語句
    const importLines: string[] = [];
    for (const [modulePath, symbols] of neededImports) {
      const symbolList = Array.from(symbols).sort().join(', ');
      importLines.push(`import { ${symbolList} } from '${modulePath}';`);
    }

    return importLines.join('\n');
  }

  /**
   * 分析來源檔案的符號（本地 export 和 import）
   */
  private analyzeSourceSymbols(content: string): SourceSymbolInfo {
    const localExports = new Set<string>();
    const importedSymbols = new Map<string, string>();

    // 分析 import 語句
    // import { A, B } from 'module'
    const importPattern = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const symbols = match[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      const modulePath = match[2];
      for (const symbol of symbols) {
        if (symbol) {
          importedSymbols.set(symbol, modulePath);
        }
      }
    }

    // 分析 import * as name from 'module'
    const namespaceImportPattern = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = namespaceImportPattern.exec(content)) !== null) {
      importedSymbols.set(match[1], match[2]);
    }

    // 分析本地 export
    // export const/let/var NAME
    const exportVarPattern = /export\s+(?:const|let|var)\s+(\w+)/g;
    while ((match = exportVarPattern.exec(content)) !== null) {
      localExports.add(match[1]);
    }

    // export function NAME
    const exportFuncPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
    while ((match = exportFuncPattern.exec(content)) !== null) {
      localExports.add(match[1]);
    }

    // export class NAME
    const exportClassPattern = /export\s+(?:abstract\s+)?class\s+(\w+)/g;
    while ((match = exportClassPattern.exec(content)) !== null) {
      localExports.add(match[1]);
    }

    // export interface NAME
    const exportInterfacePattern = /export\s+interface\s+(\w+)/g;
    while ((match = exportInterfacePattern.exec(content)) !== null) {
      localExports.add(match[1]);
    }

    // export type NAME
    const exportTypePattern = /export\s+type\s+(\w+)/g;
    while ((match = exportTypePattern.exec(content)) !== null) {
      localExports.add(match[1]);
    }

    // export enum NAME
    const exportEnumPattern = /export\s+enum\s+(\w+)/g;
    while ((match = exportEnumPattern.exec(content)) !== null) {
      localExports.add(match[1]);
    }

    // export { A, B }（命名 re-export）
    const exportListPattern = /export\s+\{([^}]+)\}(?!\s+from)/g;
    while ((match = exportListPattern.exec(content)) !== null) {
      const symbols = match[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      for (const symbol of symbols) {
        if (symbol) {
          localExports.add(symbol);
        }
      }
    }

    return { localExports, importedSymbols };
  }

  /**
   * 找到類別內的插入位置
   * 使用正則表達式嚴格匹配類別定義，避免匹配註解中的類別名稱
   */
  private async findClassInsertPosition(content: string, className: string): Promise<number> {
    const lines = content.split('\n');
    let inClass = false;
    let depth = 0;

    // 嚴格匹配類別定義：可選的 export/abstract，後接 class 關鍵字和類別名稱
    const classPattern = new RegExp(
      `^\\s*(export\\s+)?(abstract\\s+)?class\\s+${className}\\b`
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 使用正則表達式匹配，避免匹配註解
      if (!inClass && classPattern.test(line)) {
        inClass = true;
      }

      if (inClass) {
        for (const char of line) {
          if (char === '{') {depth++;}
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              // 找到類別結尾，在結尾括號前插入
              return i;
            }
          }
        }
      }
    }

    return -1;
  }

  /**
   * 計算相對路徑
   */
  private calculateRelativePath(from: string, to: string): string {
    const fromDir = path.dirname(from);
    let relativePath = path.relative(fromDir, to);

    // 移除副檔名
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');

    // 確保以 ./ 開頭
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    return relativePath;
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
}
