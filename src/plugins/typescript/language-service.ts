/**
 * TypeScript Language Service 管理模組
 * 提供 Language Service 初始化、檔案管理與符號位置查詢
 */

import * as ts from 'typescript';
import type { Disposable } from '@plugins/shared/utils/memory-monitor.js';
import type { TypeScriptSymbol } from './types.js';

/**
 * 檔案資訊
 */
interface FileInfo {
  version: number;
  content: string;
}

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
    getIdentifierFromSymbolNode: (node: ts.Node) => ts.Identifier | undefined
  ): number | undefined;
}

/**
 * Language Service Manager 實作
 * 管理 TypeScript Language Service 生命週期
 */
export class LanguageServiceManager implements ILanguageServiceManager {
  /**
   * 共享的 DocumentRegistry（靜態單例）
   * 所有 LanguageServiceManager 實例共享，減少記憶體佔用
   */
  private static documentRegistry: ts.DocumentRegistry | null = null;

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
  private compilerOptions: ts.CompilerOptions;

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

    // 建立 Language Service Host
    this._languageServiceHost = this.createLanguageServiceHost(sourceFile);

    // 建立 Language Service（使用共享的 DocumentRegistry）
    this._languageService = ts.createLanguageService(
      this._languageServiceHost,
      LanguageServiceManager.getDocumentRegistry()
    );
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
          // 忽略錯誤
        }
        return undefined;
      },
      getCurrentDirectory: () => process.cwd(),
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
      return;
    }

    this._files.set(fileName, {
      version: existing ? existing.version + 1 : 0,
      content
    });
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
    getIdentifierFromSymbolNode: (node: ts.Node) => ts.Identifier | undefined
  ): number | undefined {
    const identifier = getIdentifierFromSymbolNode(symbol.tsNode);
    if (!identifier) {
      return undefined;
    }
    return identifier.getStart(sourceFile);
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

    // 清理 Language Service Host
    this._languageServiceHost = null;

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
