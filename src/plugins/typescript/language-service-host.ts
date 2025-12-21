/**
 * TypeScript Language Service Host 建立工具
 * 封裝 LanguageServiceHost 的初始化邏輯
 */

import * as ts from 'typescript';

/**
 * 檔案快取項目
 */
export interface FileEntry {
  version: number;
  content: string;
}

/**
 * Language Service Host 配置
 */
export interface LanguageServiceHostConfig {
  files: Map<string, FileEntry>;
  compilerOptions: ts.CompilerOptions;
  currentFileName: string;
}

/**
 * 建立 Language Service Host
 */
export function createLanguageServiceHost(config: LanguageServiceHostConfig): ts.LanguageServiceHost {
  const { files, compilerOptions, currentFileName } = config;

  return {
    getScriptFileNames: () => {
      const fileNames = Array.from(files.keys());
      // 確保包含當前檔案
      if (!fileNames.includes(currentFileName)) {
        fileNames.push(currentFileName);
      }
      return fileNames;
    },
    getScriptVersion: (fileName) => {
      const file = files.get(fileName);
      return file ? String(file.version) : '0';
    },
    getScriptSnapshot: (fileName) => {
      const file = files.get(fileName);
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
      ...compilerOptions,
      // 確保啟用必要的選項
      allowNonTsExtensions: true,
      noResolve: false,
      noLib: false,
      lib: compilerOptions.lib || ['lib.es2020.d.ts']
    }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (fileName) => {
      return files.has(fileName) || (ts.sys.fileExists ? ts.sys.fileExists(fileName) : false);
    },
    readFile: (fileName) => {
      const file = files.get(fileName);
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
 * 建立 Language Service
 */
export function createLanguageService(host: ts.LanguageServiceHost): ts.LanguageService {
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}
