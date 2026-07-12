/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的變更
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ImportDeclaration } from '@infrastructure/parser/interface.js';
import type { MemberDefinition, MoveMemberOptions, FileChange, TargetFileChange } from './types.js';
import { MoveTargetType } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { stripSourceFileExtension } from '@shared/types/index.js';
import { FileUtils } from '@core/foundations/index.js';

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
 * 以程式碼中實際引用的 local binding 名稱為 key（見 indexImportedSymbols）
 */
interface ImportSymbolInfo {
  modulePath: string;
  type: ImportType;
  /** 原始 imported/exported 名稱：named import 若有 `as` 別名時與 local binding 不同 */
  importedName: string;
  /** 是否為 type-only（語句層級 `import type` 或該 specifier 層級 `{ type X }`） */
  isTypeOnly: boolean;
}

/**
 * 來源檔案的符號資訊
 */
interface SourceSymbolInfo {
  /** 本地定義的 export 符號 */
  localExports: Set<string>;
  /** import 的符號對應的來源，key 為程式碼中實際引用的 local binding 名稱 */
  importedSymbols: Map<string, ImportSymbolInfo>;
}

/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的程式碼變更
 */
export class FileChangePreparer {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly parserRegistry?: ParserRegistry
  ) {}

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

    const newLines = this.mergeWithSingleBlankBoundary(
      [
        ...lines.slice(0, removeStartLine),
        ...(options.keepReexport ? [reexportStatement] : [])
      ],
      lines.slice(endLine + 1)
    );

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

    // 自動判斷檔案是否存在
    const content = await this.readFile(target.filePath);
    const isNewFile = content === null;

    // 分析成員依賴並生成需要的 import（需先知道目標檔既有 import 才能判重，避免重複插入）
    const sourceContent = await this.readFile(options.sourceFile);
    const dependencyImports = sourceContent
      ? await this.generateDependencyImports(
          member,
          sourceContent,
          options.sourceFile,
          target.filePath,
          content
        )
      : '';

    if (isNewFile) {
      // 新檔案：生成完整的檔案內容
      const newCode = this.ensureTrailingNewline(dependencyImports + (dependencyImports ? '\n\n' : '') + memberCode);

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
      insertLine = this.findAppendInsertPosition(lines);
    }

    // 現有檔案：將 import 插入到檔案開頭（在現有 import 之後）
    let finalCode: string;
    if (dependencyImports) {
      const importInsertLine = this.findImportInsertPosition(lines);
      // 成員插入點不得落在 import 區內：若指定位置早於 import 區結尾，
      // clamp 到 import 區之後，避免 [memberInsertLine, importInsertLine) 這段
      // import 行同時被 slice(importInsertLine, memberInsertLine) 略過、又被
      // slice(memberInsertLine) 重新納入而複製一份
      const memberInsertLine = Math.max(insertLine, importInsertLine);
      const newLines = [
        ...lines.slice(0, importInsertLine),
        dependencyImports,
        ...lines.slice(importInsertLine, memberInsertLine),
        '',
        memberCode,
        ...lines.slice(memberInsertLine)
      ];
      finalCode = this.ensureTrailingNewline(newLines.join('\n'));
    } else {
      const newLines = [
        ...lines.slice(0, insertLine),
        '',
        memberCode,
        ...lines.slice(insertLine)
      ];
      finalCode = this.ensureTrailingNewline(newLines.join('\n'));
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
   * @param targetContent 目標檔既有內容（null 表示目標檔尚不存在），用於判重避免重複插入（S4）
   */
  private async generateDependencyImports(
    member: MemberDefinition,
    sourceContent: string,
    sourceFile: string,
    targetFile: string,
    targetContent: string | null
  ): Promise<string> {
    const symbolInfo = this.analyzeSourceSymbols(sourceContent, sourceFile);
    const existingTargetBindings = targetContent
      ? this.collectExistingBindings(targetContent, targetFile)
      : new Map<string, Set<string>>();

    // 按 modulePath + importType + isTypeOnly 分組
    // key: `${modulePath}::${importType}::${isTypeOnly}`, value: Map<localName, importedName>
    const neededImports: Map<string, { modulePath: string; type: ImportType; isTypeOnly: boolean; symbols: Map<string, string> }> = new Map();

    const addNeeded = (modulePath: string, type: ImportType, isTypeOnly: boolean, localName: string, importedName: string): void => {
      // 目標檔該 module 下已有同名 local binding：視為已可解析，跳過避免重複宣告（S4）
      if (existingTargetBindings.get(modulePath)?.has(localName)) { return; }
      const key = `${modulePath}::${type}::${isTypeOnly}`;
      const entry = neededImports.get(key) ?? { modulePath, type, isTypeOnly, symbols: new Map<string, string>() };
      entry.symbols.set(localName, importedName);
      neededImports.set(key, entry);
    };

    // 分析成員依賴的符號（member.dependencies 內的名稱即程式碼中實際引用的 local binding）
    for (const dep of member.dependencies) {
      // 跳過成員自己的名稱
      if (dep === member.name) { continue; }

      if (symbolInfo.localExports.has(dep)) {
        // 依賴來自來源檔案的本地 export，需要從來源檔案 import（使用 named import）
        const relativePath = this.calculateRelativePath(targetFile, sourceFile);
        addNeeded(relativePath, ImportType.Named, false, dep, dep);
      } else if (symbolInfo.importedSymbols.has(dep)) {
        // 依賴來自外部模組，保持原本的 import 類型、別名與 type 修飾
        const importInfo = symbolInfo.importedSymbols.get(dep);
        if (!importInfo) { continue; }
        addNeeded(importInfo.modulePath, importInfo.type, importInfo.isTypeOnly, dep, importInfo.importedName);
      }
    }

    // 生成 import 語句
    const importLines: string[] = [];
    for (const { modulePath, type, isTypeOnly, symbols } of neededImports.values()) {
      if (symbols.size === 0) { continue; }
      const typePrefix = isTypeOnly ? 'type ' : '';

      switch (type) {
        case ImportType.Namespace: {
          // import * as name from 'module' - 只取第一個符號作為 namespace 名稱
          const [localName] = symbols.keys();
          importLines.push(`import ${typePrefix}* as ${localName} from '${modulePath}';`);
          break;
        }
        case ImportType.Default: {
          // import name from 'module' - 只取第一個符號作為 default 名稱
          const [localName] = symbols.keys();
          importLines.push(`import ${typePrefix}${localName} from '${modulePath}';`);
          break;
        }
        case ImportType.Named:
        default: {
          // import { A, B as C } from 'module'（保留別名：local binding 與 imported name 不同時用 as 映射）
          const parts = Array.from(symbols.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([localName, importedName]) => localName === importedName ? localName : `${importedName} as ${localName}`);
          importLines.push(`import ${typePrefix}{ ${parts.join(', ')} } from '${modulePath}';`);
          break;
        }
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
   * 用 Parser AST 解析 import 宣告（SSOT：與 deadcode/move 模組共用同一份
   * ParserPlugin.getImportDeclarations 介面），取得每個 import 的 local binding 名稱、
   * imported 名稱、default/namespace/named 種類、per-specifier 與語句層級的 type 修飾、
   * module specifier。Parser 不支援或解析失敗時回傳空陣列（無法辨識的依賴不隨遷，
   * 與既有行為一致，非新增的降級分支）
   */
  private parseImportDeclarations(content: string, filePath: string): ImportDeclaration[] {
    if (!this.parserRegistry) { return []; }
    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    return parser?.getImportDeclarations?.(content) ?? [];
  }

  /**
   * 索引來源檔案的 import：key 為程式碼中實際引用的 local binding 名稱
   * （named import 若有 `as` 別名，local binding 與 imported name 不同）
   */
  private indexImportedSymbols(content: string, filePath: string): Map<string, ImportSymbolInfo> {
    const importedSymbols = new Map<string, ImportSymbolInfo>();

    for (const decl of this.parseImportDeclarations(content, filePath)) {
      if (decl.defaultImport) {
        importedSymbols.set(decl.defaultImport, {
          modulePath: decl.moduleSpecifier,
          type: ImportType.Default,
          importedName: decl.defaultImport,
          isTypeOnly: decl.isTypeOnly
        });
      }
      if (decl.namespaceImport) {
        importedSymbols.set(decl.namespaceImport, {
          modulePath: decl.moduleSpecifier,
          type: ImportType.Namespace,
          importedName: decl.namespaceImport,
          isTypeOnly: decl.isTypeOnly
        });
      }
      for (const named of decl.namedImports ?? []) {
        const localName = named.alias ?? named.name;
        importedSymbols.set(localName, {
          modulePath: decl.moduleSpecifier,
          type: ImportType.Named,
          importedName: named.name,
          isTypeOnly: decl.isTypeOnly || !!named.isTypeOnly
        });
      }
    }

    return importedSymbols;
  }

  /**
   * 收集檔案既有 import 已提供的 local binding，供插入依賴 import 前判重（S4）
   * key: moduleSpecifier → 該 module 下已存在的 local binding 名稱集合
   */
  private collectExistingBindings(content: string, filePath: string): Map<string, Set<string>> {
    const bindings = new Map<string, Set<string>>();

    for (const decl of this.parseImportDeclarations(content, filePath)) {
      const set = bindings.get(decl.moduleSpecifier) ?? new Set<string>();
      if (decl.defaultImport) { set.add(decl.defaultImport); }
      if (decl.namespaceImport) { set.add(decl.namespaceImport); }
      for (const named of decl.namedImports ?? []) {
        set.add(named.alias ?? named.name);
      }
      bindings.set(decl.moduleSpecifier, set);
    }

    return bindings;
  }

  /**
   * 分析來源檔案的符號（本地 export 和 import）
   * import 分析改用 Parser AST（見 indexImportedSymbols）；本地 export 偵測維持既有正則
   * （非本次缺陷範圍，行為不變）
   */
  private analyzeSourceSymbols(content: string, filePath: string): SourceSymbolInfo {
    const localExports = new Set<string>();

    // 複合正則：匹配所有 export 語句
    const exportPattern = new RegExp(
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
    while ((match = exportPattern.exec(content)) !== null) {
      if (match[7] !== undefined) {
        // export { A, B }
        for (const symbol of this.parseSymbolList(match[7])) {
          localExports.add(symbol);
        }
      } else {
        const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6];
        if (name !== undefined) { localExports.add(name); }
      }
    }

    return { localExports, importedSymbols: this.indexImportedSymbols(content, filePath) };
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

    relativePath = stripSourceFileExtension(relativePath);

    // 確保以 ./ 開頭
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    return relativePath;
  }

  private ensureTrailingNewline(content: string): string {
    return content.endsWith('\n') ? content : `${content}\n`;
  }

  private findAppendInsertPosition(lines: string[]): number {
    return lines.at(-1) === '' ? lines.length - 1 : lines.length;
  }

  private mergeWithSingleBlankBoundary(before: string[], after: string[]): string[] {
    const mergedBefore = [...before];
    const mergedAfter = [...after];
    let trailingBlankCount = this.countTrailingBlankLines(mergedBefore);
    let leadingBlankCount = this.countLeadingBlankLines(mergedAfter);

    if (trailingBlankCount + leadingBlankCount <= 1) {
      return [...mergedBefore, ...mergedAfter];
    }

    while (trailingBlankCount > 1) {
      mergedBefore.pop();
      trailingBlankCount--;
    }

    const keepLeadingBlank = trailingBlankCount === 0 ? 1 : 0;
    while (leadingBlankCount > keepLeadingBlank) {
      mergedAfter.shift();
      leadingBlankCount--;
    }

    return [...mergedBefore, ...mergedAfter];
  }

  private countTrailingBlankLines(lines: string[]): number {
    let count = 0;
    for (let i = lines.length - 1; i >= 0 && lines[i].trim() === ''; i--) {
      count++;
    }
    return count;
  }

  private countLeadingBlankLines(lines: string[]): number {
    let count = 0;
    for (let i = 0; i < lines.length && lines[i].trim() === ''; i++) {
      count++;
    }
    return count;
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch (error) {
      diagnostics.warn('move-member/file-change-preparer', 'FILE_READ_ERROR', `Failed to read file: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return null;
    }
  }
}
