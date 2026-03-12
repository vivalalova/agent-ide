/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的變更
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { MemberDefinition, MoveMemberOptions, FileChange, TargetFileChange } from './types.js';
import { MoveTargetType } from './types.js';

/**
 * Import 類型
 */
enum ImportType {
  Named = 'named',
  Namespace = 'namespace',
  Default = 'default'
}

/**
 * Import 符號資訊
 */
interface ImportSymbolInfo {
  modulePath: string;
  type: ImportType;
}

/**
 * 來源檔案的符號資訊
 */
interface SourceSymbolInfo {
  /** 本地定義的 export 符號 */
  localExports: Set<string>;
  /** import 的符號對應的來源 { symbolName -> ImportSymbolInfo } */
  importedSymbols: Map<string, ImportSymbolInfo>;
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

    // 按 modulePath 和 importType 分組
    // key: `${modulePath}::${importType}`, value: Set<symbolName>
    const neededImports: Map<string, { modulePath: string; type: ImportType; symbols: Set<string> }> = new Map();

    // 分析成員依賴的符號
    for (const dep of member.dependencies) {
      // 跳過成員自己的名稱
      if (dep === member.name) { continue; }

      if (symbolInfo.localExports.has(dep)) {
        // 依賴來自來源檔案的本地 export，需要從來源檔案 import（使用 named import）
        const relativePath = this.calculateRelativePath(targetFile, sourceFile);
        const key = `${relativePath}::${ImportType.Named}`;
        if (!neededImports.has(key)) {
          neededImports.set(key, { modulePath: relativePath, type: ImportType.Named, symbols: new Set() });
        }
        neededImports.get(key)?.symbols.add(dep);
      } else if (symbolInfo.importedSymbols.has(dep)) {
        // 依賴來自外部模組，保持原本的 import 類型
        const importInfo = symbolInfo.importedSymbols.get(dep);
        if (!importInfo) {continue;}
        const key = `${importInfo.modulePath}::${importInfo.type}`;
        if (!neededImports.has(key)) {
          neededImports.set(key, { modulePath: importInfo.modulePath, type: importInfo.type, symbols: new Set() });
        }
        neededImports.get(key)?.symbols.add(dep);
      }
    }

    // 生成 import 語句
    const importLines: string[] = [];
    for (const { modulePath, type, symbols } of neededImports.values()) {
      const symbolList = Array.from(symbols).sort();

      switch (type) {
        case ImportType.Namespace:
          // import * as name from 'module' - 只取第一個符號作為 namespace 名稱
          importLines.push(`import * as ${symbolList[0]} from '${modulePath}';`);
          break;
        case ImportType.Default:
          // import name from 'module' - 只取第一個符號作為 default 名稱
          importLines.push(`import ${symbolList[0]} from '${modulePath}';`);
          break;
        case ImportType.Named:
        default:
          // import { A, B } from 'module'
          importLines.push(`import { ${symbolList.join(', ')} } from '${modulePath}';`);
          break;
      }
    }

    return importLines.join('\n');
  }

  /**
   * 解析符號列表（處理 as 別名）
   * "A, B as C, D" → ["A", "B", "D"]
   */
  private parseSymbolList(symbolListStr: string): string[] {
    return symbolListStr
      .split(',')
      .map(s => {
        const trimmed = s.trim();
        const asIndex = trimmed.indexOf(' as ');
        return asIndex !== -1 ? trimmed.slice(0, asIndex).trim() : trimmed;
      })
      .filter(s => s.length > 0);
  }

  /**
   * 分析來源檔案的符號（本地 export 和 import）
   * 使用單一複合正則表達式，一次遍歷完成所有分析
   */
  private analyzeSourceSymbols(content: string): SourceSymbolInfo {
    const localExports = new Set<string>();
    const importedSymbols = new Map<string, ImportSymbolInfo>();

    // 複合正則：匹配所有 import 和 export 語句
    const combinedPattern = new RegExp(
      // import { A, B } from 'module'
      'import\\s+\\{([^}]+)\\}\\s+from\\s+[\'"]([^\'"]+)[\'"]|' +
      // import * as name from 'module'
      'import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+[\'"]([^\'"]+)[\'"]|' +
      // import name from 'module' (default)
      'import\\s+(\\w+)\\s+from\\s+[\'"]([^\'"]+)[\'"]|' +
      // export const/let/var NAME
      'export\\s+(?:const|let|var)\\s+(\\w+)|' +
      // export [async] function NAME
      'export\\s+(?:async\\s+)?function\\s+(\\w+)|' +
      // export [abstract] class NAME
      'export\\s+(?:abstract\\s+)?class\\s+(\\w+)|' +
      // export interface NAME
      'export\\s+interface\\s+(\\w+)|' +
      // export type NAME
      'export\\s+type\\s+(\\w+)|' +
      // export enum NAME
      'export\\s+enum\\s+(\\w+)|' +
      // export { A, B }（不帶 from）
      'export\\s+\\{([^}]+)\\}(?!\\s+from)',
      'g'
    );

    let match;
    while ((match = combinedPattern.exec(content)) !== null) {
      if (match[1] !== undefined) {
        // import { A, B } from 'module'
        const symbols = this.parseSymbolList(match[1]);
        const modulePath = match[2];
        for (const symbol of symbols) {
          importedSymbols.set(symbol, { modulePath, type: ImportType.Named });
        }
      } else if (match[3] !== undefined) {
        // import * as name from 'module'
        importedSymbols.set(match[3], { modulePath: match[4], type: ImportType.Namespace });
      } else if (match[5] !== undefined) {
        // import name from 'module' (default)
        if (!importedSymbols.has(match[5])) {
          importedSymbols.set(match[5], { modulePath: match[6], type: ImportType.Default });
        }
      } else if (match[7] !== undefined) {
        // export const/let/var
        localExports.add(match[7]);
      } else if (match[8] !== undefined) {
        // export function
        localExports.add(match[8]);
      } else if (match[9] !== undefined) {
        // export class
        localExports.add(match[9]);
      } else if (match[10] !== undefined) {
        // export interface
        localExports.add(match[10]);
      } else if (match[11] !== undefined) {
        // export type
        localExports.add(match[11]);
      } else if (match[12] !== undefined) {
        // export enum
        localExports.add(match[12]);
      } else if (match[13] !== undefined) {
        // export { A, B }
        const symbols = this.parseSymbolList(match[13]);
        for (const symbol of symbols) {
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
    } catch (error) {
      console.warn(`[move-member] Failed to read file ${filePath}:`, error);
      return null;
    }
  }
}
