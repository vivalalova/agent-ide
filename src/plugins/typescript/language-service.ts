/**
 * TypeScript Language Service 管理模組
 * 提供 Language Service 初始化、檔案管理與符號位置查詢
 */

import * as path from 'path';
import * as ts from 'typescript';
import { stripSourceFileExtension } from '@shared/types/index.js';
import type { Disposable } from '@plugins/shared/utils/memory-monitor.js';
import type { ModuleSpecifierResolver } from '@infrastructure/parser/types.js';
import type { TypeScriptSymbol } from './types.js';
import { identifierShadowedByLocalDeclaration } from './lexical-scope-binding.js';
import { collectRequireDestructuringBindings } from './cjs-require-ast.js';

/**
 * 檔案資訊
 * 注意：因 TypeScript Language Service Host 需要迭代所有檔案名稱，
 * 無法使用 MemoryCache（不支援 .keys() 迭代），保留 Map + 手動 LRU
 */
interface FileInfo {
  version: number;
  content: string;
  lastAccessed: number;
}

/** 檔案快取最大條目數 */
const MAX_FILES_CACHE_SIZE = 600;

/**
 * Language Service Manager 介面
 */
export interface ILanguageServiceManager extends Disposable {
  /** 取得 Language Service（可能為 null） */
  readonly languageService: ts.LanguageService | null;

  /** 取得 Language Service Host（可能為 null） */
  readonly languageServiceHost: ts.LanguageServiceHost | null;

  /** 取得檔案 Map */
  readonly files: ReadonlyMap<string, FileInfo>;

  /**
   * 確保 Language Service 已初始化
   * @param sourceFile 來源檔案
   */
  ensureInitialized(sourceFile: ts.SourceFile): void;

  /**
   * 更新檔案內容
   * @param fileName 檔案名稱
   * @param content 檔案內容
   */
  updateFile(fileName: string, content: string): void;

  /**
   * 根據檔案名稱取得 SourceFile
   * @param fileName 檔案名稱
   */
  getSourceFileFromFileName(fileName: string): ts.SourceFile | undefined;

  /**
   * 取得符號在檔案中的位置
   * @param symbol TypeScript 符號
   * @param sourceFile 來源檔案
   * @param getIdentifierFromSymbolNode 取得識別符的函式
   */
  getSymbolPosition(
    symbol: TypeScriptSymbol,
    sourceFile: ts.SourceFile,
    getIdentifierFromSymbolNode: (node: ts.Node) => ts.Identifier | undefined,
    moduleResolver?: ModuleSpecifierResolver
  ): number | undefined;

  /**
   * 收集目前檔案中 LS 單檔掛載無法綁回的直接引用範圍：
   * namespace import 成員存取（`ns.member`）與 barrel re-export specifier（`export { x } from './a'`）
   * @param symbol 目標符號（跨檔定義）
   * @param sourceFile 目前檔案
   * @param moduleResolver 選用：跨 path alias 與多層 barrel re-export 的 specifier 曝露判定
   */
  getAstDirectReferenceSpans(
    symbol: TypeScriptSymbol,
    sourceFile: ts.SourceFile,
    moduleResolver?: ModuleSpecifierResolver
  ): Array<{ start: number; end: number }>;
}

/**
 * Language Service Manager 實作
 * 管理 TypeScript Language Service 生命週期
 */
export class LanguageServiceManager implements ILanguageServiceManager {
  /**
   * 共享的 DocumentRegistry（靜態單例）
   * 所有仍存活的 LanguageServiceManager 實例共享，減少記憶體佔用。
   * 最後一個持有 LS 的實例 dispose 時重置為 null，避免跨 session 殘留 SourceFile 快取。
   */
  private static documentRegistry: ts.DocumentRegistry | null = null;
  /** 目前仍持有已建立 LanguageService 的 manager 實例數（用於決定何時重置 registry） */
  private static activeLanguageServiceCount = 0;

  /**
   * 取得或建立共享的 DocumentRegistry
   */
  private static getDocumentRegistry(): ts.DocumentRegistry {
    if (!LanguageServiceManager.documentRegistry) {
      LanguageServiceManager.documentRegistry = ts.createDocumentRegistry();
    }
    return LanguageServiceManager.documentRegistry;
  }

  private _languageService: ts.LanguageService | null = null;
  private _languageServiceHost: ts.LanguageServiceHost | null = null;
  private _files: Map<string, FileInfo> = new Map();
  /** 此實例是否已建立並計入 activeLanguageServiceCount */
  private _ownsLanguageService = false;
  private compilerOptions: ts.CompilerOptions;
  /**
   * Language Service 模組解析基準目錄。
   * 以初始化來源檔推得的專案根為準，不得固定 process.cwd()
   * （CLI --path 常指向非 cwd 的專案根）。
   */
  private _currentDirectory: string | null = null;

  constructor(compilerOptions: ts.CompilerOptions) {
    this.compilerOptions = compilerOptions;
  }

  get languageService(): ts.LanguageService | null {
    return this._languageService;
  }

  get languageServiceHost(): ts.LanguageServiceHost | null {
    return this._languageServiceHost;
  }

  get files(): ReadonlyMap<string, FileInfo> {
    return this._files;
  }

  /**
   * 確保 Language Service 已初始化
   */
  ensureInitialized(sourceFile: ts.SourceFile): void {
    if (this._languageService) {
      // 更新檔案內容
      this.updateFile(sourceFile.fileName, sourceFile.text);
      return;
    }

    // 添加當前檔案到檔案列表
    this.updateFile(sourceFile.fileName, sourceFile.text);

    // 以初始化來源檔推得專案根，供 host.getCurrentDirectory 使用
    this._currentDirectory = this.resolveProjectDirectory(sourceFile);

    // 建立 Language Service Host
    this._languageServiceHost = this.createLanguageServiceHost(sourceFile);

    // 建立 Language Service（使用共享的 DocumentRegistry）
    this._languageService = ts.createLanguageService(
      this._languageServiceHost,
      LanguageServiceManager.getDocumentRegistry()
    );
    this._ownsLanguageService = true;
    LanguageServiceManager.activeLanguageServiceCount += 1;
  }

  /**
   * 從來源檔路徑推得專案根目錄。
   * 向上尋找 package.json / tsconfig.json；找不到時退回來源檔所在目錄
   * （仍不得使用 process.cwd()，以免 CLI --path 與 cwd 分叉時模組解析錯位）。
   */
  private resolveProjectDirectory(sourceFile: ts.SourceFile): string {
    const filePath = path.resolve(sourceFile.fileName);
    let currentDir = path.dirname(filePath);
    const root = path.parse(currentDir).root;
    const fileExists = ts.sys.fileExists?.bind(ts.sys);

    while (true) {
      if (fileExists) {
        if (
          fileExists(path.join(currentDir, 'package.json'))
          || fileExists(path.join(currentDir, 'tsconfig.json'))
        ) {
          return currentDir;
        }
      }
      if (currentDir === root) {
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        break;
      }
      currentDir = parent;
    }

    return path.dirname(filePath);
  }

  /**
   * 建立 Language Service Host
   */
  private createLanguageServiceHost(sourceFile: ts.SourceFile): ts.LanguageServiceHost {
    return {
      getScriptFileNames: () => {
        const fileNames = Array.from(this._files.keys());
        // 確保包含當前檔案
        if (!fileNames.includes(sourceFile.fileName)) {
          fileNames.push(sourceFile.fileName);
        }
        return fileNames;
      },
      getScriptVersion: (fileName) => {
        const file = this._files.get(fileName);
        return file ? String(file.version) : '0';
      },
      getScriptSnapshot: (fileName) => {
        const file = this._files.get(fileName);
        if (file) {
          return ts.ScriptSnapshot.fromString(file.content);
        }
        // 嘗試讀取實際檔案
        try {
          const content = ts.sys.readFile(fileName);
          if (content) {
            return ts.ScriptSnapshot.fromString(content);
          }
        } catch {
          // graceful-degradation: 外部 .d.ts 檔案讀取失敗時返回 undefined，Language Service 跳過該檔案
        }
        return undefined;
      },
      getCurrentDirectory: () => this._currentDirectory ?? path.dirname(path.resolve(sourceFile.fileName)),
      getCompilationSettings: () => ({
        ...this.compilerOptions,
        // 確保啟用必要的選項
        allowNonTsExtensions: true,
        noResolve: false,
        noLib: false,
        lib: this.compilerOptions.lib || ['lib.es2020.d.ts']
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => {
        return this._files.has(fileName) || (ts.sys.fileExists ? ts.sys.fileExists(fileName) : false);
      },
      readFile: (fileName) => {
        const file = this._files.get(fileName);
        if (file) {
          return file.content;
        }
        return ts.sys.readFile ? ts.sys.readFile(fileName) : undefined;
      },
      readDirectory: ts.sys.readDirectory ? ts.sys.readDirectory : () => [],
      getDirectories: ts.sys.getDirectories ? ts.sys.getDirectories : () => [],
      directoryExists: ts.sys.directoryExists ? ts.sys.directoryExists : () => false,
      realpath: ts.sys.realpath ? ts.sys.realpath : (path) => path,
      getNewLine: () => '\n'
    };
  }

  /**
   * 更新檔案內容
   */
  updateFile(fileName: string, content: string): void {
    const existing = this._files.get(fileName);
    if (existing && existing.content === content) {
      existing.lastAccessed = Date.now();
      return;
    }

    // LRU 淘汰
    this.evictFilesIfNeeded();

    this._files.set(fileName, {
      version: existing ? existing.version + 1 : 0,
      content,
      lastAccessed: Date.now()
    });
  }

  /**
   * LRU 檔案快取淘汰：當快取超過上限時，刪除最久未使用的項目
   */
  private evictFilesIfNeeded(): void {
    if (this._files.size < MAX_FILES_CACHE_SIZE) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._files) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._files.delete(oldestKey);
    }
  }

  /**
   * 根據檔案名稱取得 SourceFile
   */
  getSourceFileFromFileName(fileName: string): ts.SourceFile | undefined {
    if (!this._languageService) {
      return undefined;
    }
    const program = this._languageService.getProgram();
    return program?.getSourceFile(fileName);
  }

  /**
   * 取得符號在檔案中的位置
   */
  getSymbolPosition(
    symbol: TypeScriptSymbol,
    sourceFile: ts.SourceFile,
    getIdentifierFromSymbolNode: (node: ts.Node) => ts.Identifier | undefined,
    moduleResolver?: ModuleSpecifierResolver
  ): number | undefined {
    const identifier = symbol.tsNode ? getIdentifierFromSymbolNode(symbol.tsNode) : undefined;

    // 符號宣告就在目前檔案（定義檔，或 function-local 單檔查找）：
    // 直接用符號自身識別符位置。
    // 路徑正規化後比較（縱深防禦）：符號位置來自索引（絕對路徑），掛載檔名可能沿用呼叫端傳入的
    // 路徑形式。若兩者形式分歧（相對 vs 絕對）會誤判為跨檔、改走 import binding anchor，導致定義檔
    // 自身的引用查找失敗（缺陷 N1／N2-a 的其中一環）。同一檔案在此務必判為同檔。
    if (identifier && path.resolve(identifier.getSourceFile().fileName) === path.resolve(sourceFile.fileName)) {
      return identifier.getStart(sourceFile);
    }

    // 跨檔引用查找：符號宣告在其他檔案，foreign 節點的偏移量在目前檔案無意義
    // （會落在錯誤位置導致 Language Service 解析出無關符號、甚至誤改到不相干的宣告）。
    // 改以「目前檔案中匯入該符號的 import binding」為 anchor，讓 Language Service 從
    // 真實綁定點解析同檔引用——自動排除同名的 interface/type 屬性簽名鍵、object literal
    // 鍵、成員存取（x.name）等非綁定 token（缺陷 R2）。
    //
    // 找不到 import binding（該檔僅巧合含同名 token、自身另有同名宣告、或該檔的 import
    // 來自不同來源模組）時回傳 undefined，讓引用查找對該檔得空結果——絕不可回退為 foreign
    // 節點的位置，否則會依偏移量巧合誤改無關符號。
    return this.findImportBindingPosition(sourceFile, symbol.name, symbol.location.filePath, moduleResolver);
  }

  /**
   * 判定 import/re-export module specifier 是否指向目標符號的來源。
   *
   * 有注入 moduleResolver（rename 引擎提供，具備 tsconfig 與專案檔上下文）時優先採用：可解析
   * tsconfig path alias（缺陷 C3）並遞迴 barrel re-export 鏈（缺陷 C4）。否則退回內建的相對
   * specifier 保守比對（find-references / call-hierarchy 等無注入者維持原行為）。
   */
  private specifierMatchesTarget(
    importingFileName: string,
    moduleSpecifier: string,
    definitionFilePath: string,
    moduleResolver?: ModuleSpecifierResolver
  ): boolean {
    if (moduleResolver) {
      return moduleResolver(importingFileName, moduleSpecifier);
    }
    return this.moduleSpecifierMatchesDefinition(importingFileName, moduleSpecifier, definitionFilePath);
  }

  /**
   * 在目前檔案的頂層 import / CJS require 宣告中，尋找匯入指定符號名稱的 binding 位置。
   *
   * 錨定前先驗證 import 語句的 module specifier 解析後確實指向目標符號的定義檔
   * （`definitionFilePath`）——否則「同名但不同來源模組」的 import 會被誤錨定而誤改（缺陷 F2a）。
   *
   * 具名 import 有別名時 anchor 於被匯入名稱（propertyName），使改名只動被匯入名稱、保留本地別名。
   * namespace import（`import * as ns`）底下的 `ns.member` 引用不在此處理——見
   * {@link getAstDirectReferenceSpans}（改走 AST 直接收集，不依賴 LS 跨模組解析）。
   *
   * 另涵蓋 CJS：
   * - `const { foo } = require('./mod')` 解構綁定
   * - `import x = require('./mod')`（ImportEqualsDeclaration）
   */
  private findImportBindingPosition(
    sourceFile: ts.SourceFile,
    symbolName: string,
    definitionFilePath: string,
    moduleResolver?: ModuleSpecifierResolver
  ): number | undefined {
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) {
        continue;
      }
      // 來源模組驗證：module specifier 須解析到目標符號的定義檔，才可錨定（缺陷 F2a）。
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      if (!this.specifierMatchesTarget(
        sourceFile.fileName,
        statement.moduleSpecifier.text,
        definitionFilePath,
        moduleResolver
      )) {
        continue;
      }

      const importClause = statement.importClause;

      // default import：`import Foo from '...'`
      if (importClause.name && importClause.name.text === symbolName) {
        return importClause.name.getStart(sourceFile);
      }

      const named = importClause.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          // 被匯入名稱：有別名時為 propertyName（`import { A as B }` 的 A），否則為 name
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName === symbolName) {
            const anchorNode = element.propertyName ?? element.name;
            return anchorNode.getStart(sourceFile);
          }
        }
      }
    }

    // CJS require 解構：`const { foo } = require('./mod')` / `const { foo: bar } = require(...)`
    const requireBinding = this.findRequireDestructuringBindingPosition(
      sourceFile,
      symbolName,
      definitionFilePath,
      moduleResolver
    );
    if (requireBinding !== undefined) {
      return requireBinding;
    }

    // `import x = require('./mod')`
    for (const statement of sourceFile.statements) {
      if (!ts.isImportEqualsDeclaration(statement)) {
        continue;
      }
      if (!ts.isExternalModuleReference(statement.moduleReference)) {
        continue;
      }
      const expr = statement.moduleReference.expression;
      if (!ts.isStringLiteral(expr)) {
        continue;
      }
      if (!this.specifierMatchesTarget(
        sourceFile.fileName,
        expr.text,
        definitionFilePath,
        moduleResolver
      )) {
        continue;
      }
      if (statement.name.text === symbolName) {
        return statement.name.getStart(sourceFile);
      }
    }

    return undefined;
  }

  /**
   * 在 `const { name } = require(spec)` / `const { name: alias } = require(spec)` 中
   * 尋找被匯入名稱等於 symbolName 的 binding 錨定位置。
   * 有別名時 anchor 於 propertyName（被匯入名），與 ESM 具名 import 一致。
   */
  private findRequireDestructuringBindingPosition(
    sourceFile: ts.SourceFile,
    symbolName: string,
    definitionFilePath: string,
    moduleResolver?: ModuleSpecifierResolver
  ): number | undefined {
    for (const binding of collectRequireDestructuringBindings(sourceFile)) {
      if (binding.importedName !== symbolName) {
        continue;
      }
      if (!this.specifierMatchesTarget(
        sourceFile.fileName,
        binding.moduleSpecifier,
        definitionFilePath,
        moduleResolver
      )) {
        continue;
      }
      return binding.nameNode.getStart(sourceFile);
    }
    return undefined;
  }

  /**
   * 收集目前檔案中「LS 在單檔掛載模式下無法綁回 export symbol」的直接引用範圍，涵蓋：
   *   1. namespace import 成員存取 `ns.member`（缺陷 F2b）
   *   2. barrel re-export specifier `export { x } from './a'`（缺陷 R2-1）
   *
   * 為何不走 LS：兩者都需解析來源模組才能綁回 export symbol，而本專案每次 findReferences 只把
   * 「當前單一檔案」掛進 Language Service（見 parser.findReferences → ensureInitialized），其餘檔案
   * 僅靠 host 的 ts.sys 磁碟讀取回退。memfs / 未落盤環境下來源模組無法解析，`ns` 退化為 any、
   * re-export specifier 也綁不回定義，LS.findReferences 得空。
   *
   * 改以 AST 直接判定：相關 import/export 語句已通過來源模組驗證（specifier 解析到
   * definitionFilePath），則 `ns.member`（ns 為 namespace 本地名、member 名等於目標符號名）與
   * re-export 的 named specifier（有別名時取 propertyName 側）在語意上「就是」對目標符號的引用，
   * 無歧義。回傳全部命中範圍，與 LS 路徑的引用形狀一致，且僅涵蓋當前檔案。
   */
  getAstDirectReferenceSpans(
    symbol: TypeScriptSymbol,
    sourceFile: ts.SourceFile,
    moduleResolver?: ModuleSpecifierResolver
  ): Array<{ start: number; end: number }> {
    const spans: Array<{ start: number; end: number }> = [];

    // (2) barrel re-export specifier：`export { x } from './a'`
    for (const statement of sourceFile.statements) {
      if (
        !ts.isExportDeclaration(statement)
        || !statement.moduleSpecifier
        || !ts.isStringLiteral(statement.moduleSpecifier)
        || !statement.exportClause
        || !ts.isNamedExports(statement.exportClause)
      ) {
        continue;
      }
      if (!this.specifierMatchesTarget(
        sourceFile.fileName,
        statement.moduleSpecifier.text,
        symbol.location.filePath,
        moduleResolver
      )) {
        continue;
      }
      for (const element of statement.exportClause.elements) {
        // 來源模組中的名稱：有別名時為 propertyName（`export { A as B }` 的 A），否則為 name。
        // 改名只動來源側名稱，保留對外別名（`export { a as b }` 改 a、不改 b）。
        const sourceName = element.propertyName?.text ?? element.name.text;
        if (sourceName === symbol.name) {
          const anchorNode = element.propertyName ?? element.name;
          spans.push({
            start: anchorNode.getStart(sourceFile),
            end: anchorNode.getEnd()
          });
        }
      }
    }

    // (3) 別名具名 import 的被匯入名：`import { x as y } from './def'`
    // LS 錨定於被匯入名 propertyName（x），但來源模組在單檔掛載下無法解析（memfs/未落盤）時，
    // LS.findReferences 對該 propertyName 得空（其 export symbol 綁不回）——與 (1)(2) 同源問題（缺陷 N2-b）。
    // 別名的本地綁定 y 與使用點 y() 屬使用者自訂別名、不應改名，故只補收被匯入名 x 的位置。
    // 非別名 `import { x }` 的本地綁定名即 x，LS 可在單檔內綁回並回傳，無需在此重複收集。
    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement)
        || !statement.importClause
        || !ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        continue;
      }
      const named = statement.importClause.namedBindings;
      if (!named || !ts.isNamedImports(named)) {
        continue;
      }
      if (!this.specifierMatchesTarget(
        sourceFile.fileName,
        statement.moduleSpecifier.text,
        symbol.location.filePath,
        moduleResolver
      )) {
        continue;
      }
      for (const element of named.elements) {
        if (element.propertyName && element.propertyName.text === symbol.name) {
          spans.push({
            start: element.propertyName.getStart(sourceFile),
            end: element.propertyName.getEnd()
          });
        }
      }
    }

    // (1) namespace import 成員存取：`ns.member`
    const namespaceLocalNames = this.collectVerifiedNamespaceLocalNames(
      sourceFile,
      symbol.location.filePath,
      moduleResolver
    );
    if (namespaceLocalNames.length > 0) {
      const memberName = symbol.name;
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(node)
          && ts.isIdentifier(node.expression)
          && namespaceLocalNames.includes(node.expression.text)
          && node.name.text === memberName
          // 該 `ns` 位置若被更近的區域宣告（參數、區域變數、內層函式等 value binding）遮蔽，
          // 則此 `ns.member` 綁的是遮蔽者、非 namespace import，不是對目標符號的引用，須跳過。
          && !identifierShadowedByLocalDeclaration(node.expression, sourceFile)
        ) {
          spans.push({
            start: node.name.getStart(sourceFile),
            end: node.name.getEnd()
          });
        }
        if (
          ts.isElementAccessExpression(node)
          && ts.isIdentifier(node.expression)
          && namespaceLocalNames.includes(node.expression.text)
          && (ts.isStringLiteral(node.argumentExpression)
            || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
          && node.argumentExpression.text === memberName
          && !identifierShadowedByLocalDeclaration(node.expression, sourceFile)
        ) {
          spans.push({
            // StringLiteral / NoSubstitutionTemplateLiteral 的 AST 範圍含引號；只回傳
            // key 文字本身，rename 替換後才能保留 `"..."` / `` `...` `` 語法。
            start: node.argumentExpression.getStart(sourceFile) + 1,
            end: node.argumentExpression.getEnd() - 1
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    return spans;
  }

  /**
   * 收集目前檔案中、行為上等同「namespace import 綁定」的本地名稱：
   *
   * 1. `import * as ns from spec`（NamespaceImport 語法），spec 確實解析到
   *    `definitionFilePath`（直接或經 barrel 轉發）。
   * 2. `import { ns } from spec`（無別名的具名 import），spec 對應檔案把 `ns` 這個具名匯出
   *    本身宣告為 `export * as ns from '<inner>'`（namespace re-export），且 `<inner>`
   *    （遞迴）曝露 `definitionFilePath`。此時 `ns` 在語意上綁定的就是一個轉發自定義檔的
   *    namespace 物件，`ns.member` 與 case 1 的 `ns.member` 引用語意相同（見 R2 finding 1：
   *    barrel `export * as ns from './def'`、consumer `import { ns } from './barrel'` 再
   *    `ns.X()`，若不辨識這種具名匯入形式，rename 會漏改 `ns.X()`）。
   *    只有 moduleResolver 有能力回答這個問題（見其 namedImportLocalName 參數），無
   *    moduleResolver 時此 case 略過、不影響既有行為。
   */
  private collectVerifiedNamespaceLocalNames(
    sourceFile: ts.SourceFile,
    definitionFilePath: string,
    moduleResolver?: ModuleSpecifierResolver
  ): string[] {
    const names: string[] = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) {
        continue;
      }
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const moduleSpecifier = statement.moduleSpecifier.text;
      const named = statement.importClause.namedBindings;

      if (named && ts.isNamespaceImport(named)) {
        if (this.specifierMatchesTarget(sourceFile.fileName, moduleSpecifier, definitionFilePath, moduleResolver)) {
          names.push(named.name.text);
        }
        continue;
      }

      if (named && ts.isNamedImports(named) && moduleResolver) {
        for (const element of named.elements) {
          // resolver 的第三個參數是來源模組的 exported name；有別名時必須傳
          // propertyName（`ns`），但收集到 namespace local names 的是本地 alias（`local`）。
          const exportedName = element.propertyName?.text ?? element.name.text;
          if (moduleResolver(sourceFile.fileName, moduleSpecifier, exportedName)) {
            names.push(element.name.text);
          }
        }
      }
    }
    return names;
  }

  /**
   * 驗證 import 的 module specifier 從 `importingFileName` 解析後是否指向 `definitionFilePath`。
   *
   * 僅處理相對路徑 specifier：本地定義檔必經相對路徑（`./`、`../`）匯入才可在此無專案設定下解析。
   * 非相對（bare / baseUrl / alias）需 ImportResolver 的專案設定（path aliases、baseUrl），
   * language-service 錨定層無此上下文，保守回傳 false 不錨定。
   *
   * 副檔名處理：TS/JS 可省略副檔名、且 specifier 常以 `.js` 指向 `.ts` 原始檔，故兩側皆
   * 去除來源副檔名後比對；並處理目錄 import 指向 `index.*` 的情形。
   */
  private moduleSpecifierMatchesDefinition(
    importingFileName: string,
    moduleSpecifier: string,
    definitionFilePath: string
  ): boolean {
    if (!moduleSpecifier.startsWith('.')) {
      return false;
    }

    const fromDir = path.dirname(importingFileName);
    const resolvedNoExt = stripSourceFileExtension(
      path.normalize(path.resolve(fromDir, moduleSpecifier))
    );
    const definitionNoExt = stripSourceFileExtension(
      path.normalize(path.resolve(definitionFilePath))
    );

    if (resolvedNoExt === definitionNoExt) {
      return true;
    }

    // 目錄 import 指向 index 檔：specifier 解析到目錄，定義檔為該目錄下的 index.*
    if (
      path.basename(definitionNoExt) === 'index'
      && path.dirname(definitionNoExt) === resolvedNoExt
    ) {
      return true;
    }

    return false;
  }

  /**
   * 釋放資源
   */
  async dispose(): Promise<void> {
    // 清理 Language Service
    if (this._languageService) {
      this._languageService.dispose();
      this._languageService = null;
    }

    // 最後一個持有 LS 的實例離開時重置共享 DocumentRegistry，
    // 讓下次建立走全新 registry（靜態共享在多 manager 並存時仍必要，故不改 instance 級）。
    if (this._ownsLanguageService) {
      this._ownsLanguageService = false;
      LanguageServiceManager.activeLanguageServiceCount = Math.max(
        0,
        LanguageServiceManager.activeLanguageServiceCount - 1
      );
      if (LanguageServiceManager.activeLanguageServiceCount === 0) {
        LanguageServiceManager.documentRegistry = null;
      }
    }

    // 清理 Language Service Host
    this._languageServiceHost = null;
    this._currentDirectory = null;

    // 清理檔案快取
    this._files.clear();
  }
}

/**
 * 建立 Language Service Manager 實例
 * @param compilerOptions TypeScript 編譯器選項
 */
export function createLanguageServiceManager(
  compilerOptions: ts.CompilerOptions
): ILanguageServiceManager {
  return new LanguageServiceManager(compilerOptions);
}
