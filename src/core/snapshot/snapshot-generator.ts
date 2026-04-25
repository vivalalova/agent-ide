/**
 * Snapshot 產生器
 * 分析模組產生 AI 可讀的快照
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { IndexEngine, createIndexConfig } from '@core/foundations/indexing/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import type { PatternInfo } from '@infrastructure/parser/index.js';
import { SOURCE_FILE_EXTENSIONS, SymbolType, type Symbol } from '@shared/types/index.js';
import type { ModuleSnapshot, ProjectSnapshot, SnapshotResult, PrivateInfo } from './types.js';
import { SnapshotScope, isProjectSnapshot } from './types.js';
import { SnapshotCacheManager } from './snapshot-cache.js';
import type { IncrementalSnapshot, SnapshotDelta } from './snapshot-cache.js';
import {
  identifyFactoryPatterns,
  isFactory,
  formatSymbolSignature,
  type ExtendedSymbol
} from './utils/index.js';

/**
 * Snapshot 產生器
 */
export class SnapshotGenerator {
  private readonly fileSystem: IFileSystem;
  private cacheManager: SnapshotCacheManager | null = null;

  constructor(fileSystem: IFileSystem) {
    this.fileSystem = fileSystem;
  }

  /**
   * 產生快照
   */
  async generate(targetPath: string): Promise<SnapshotResult> {
    const { scope, scanFromSrc } = await this.detectScope(targetPath);

    if (scope === SnapshotScope.Project) {
      return this.generateProjectSnapshot(targetPath, scanFromSrc);
    }

    return this.generateModuleSnapshot(targetPath);
  }

  /**
   * 產生增量快照
   * @param targetPath 目標路徑
   * @param since 基準版本 ('last' 使用上次快取, ISO timestamp 或 'refresh' 強制刷新)
   */
  async generateIncremental(targetPath: string, since: string): Promise<IncrementalSnapshot> {
    // 初始化快取管理器
    if (!this.cacheManager) {
      this.cacheManager = new SnapshotCacheManager(this.fileSystem, targetPath);
    }

    // 強制刷新
    if (since === 'refresh') {
      const fullSnapshot = await this.generate(targetPath);
      const version = await this.cacheManager.save(fullSnapshot);
      return this.createFullAsIncremental(fullSnapshot, version.timestamp);
    }

    // 載入快取
    const baseCache = await this.cacheManager.load();

    // 無快取，產生完整快照
    if (!baseCache) {
      const fullSnapshot = await this.generate(targetPath);
      const version = await this.cacheManager.save(fullSnapshot);
      return this.createFullAsIncremental(fullSnapshot, version.timestamp);
    }

    // 產生當前快照
    const currentSnapshot = await this.generate(targetPath);

    // 計算差異
    const delta = this.cacheManager.computeDelta(
      baseCache.snapshot,
      currentSnapshot as ModuleSnapshot | ProjectSnapshot
    );

    // 更新快取
    const newVersion = await this.cacheManager.save(currentSnapshot);

    return {
      version: newVersion.timestamp,
      baseVersion: baseCache.version.timestamp,
      delta
    };
  }

  /**
   * 將完整快照轉為增量格式（用於首次快照）
   */
  private createFullAsIncremental(snapshot: SnapshotResult, timestamp: string): IncrementalSnapshot {
    const delta: SnapshotDelta = {
      added: {
        modules: isProjectSnapshot(snapshot)
          ? snapshot.modules
          : { [snapshot.module]: snapshot },
        symbols: []
      },
      modified: { modules: [], symbols: [] },
      removed: { modules: [], symbols: [] }
    };

    return {
      version: timestamp,
      baseVersion: '',
      delta
    };
  }

  /**
   * 偵測範圍（module 或 project）
   * @returns scope 和是否需要從 src 子目錄掃描
   */
  private async detectScope(targetPath: string): Promise<{ scope: SnapshotScope; scanFromSrc: boolean }> {
    // 檢查是否有 package.json（專案根目錄）
    const packageJsonPath = path.join(targetPath, 'package.json');
    const hasPackageJson = await this.fileSystem.exists(packageJsonPath);

    if (hasPackageJson) {
      // 檢查是否有 src 目錄（表示是專案）
      const srcPath = path.join(targetPath, 'src');
      const hasSrc = await this.fileSystem.exists(srcPath);
      if (hasSrc) {
        return { scope: SnapshotScope.Project, scanFromSrc: true };
      }
    }

    // 檢查是否有 index source file（模組入口）
    const hasIndex = await this.hasIndexSourceFile(targetPath);

    if (hasIndex) {
      return { scope: SnapshotScope.Module, scanFromSrc: false };
    }

    // Issue #59: 檢查子目錄是否包含模組（有 index.ts 的目錄）
    const hasSubModules = await this.hasModulesInSubdirectories(targetPath);
    if (hasSubModules) {
      return { scope: SnapshotScope.Project, scanFromSrc: false };
    }

    // 預設為模組
    return { scope: SnapshotScope.Module, scanFromSrc: false };
  }

  private async hasIndexSourceFile(dirPath: string): Promise<boolean> {
    for (const extension of SOURCE_FILE_EXTENSIONS) {
      if (await this.fileSystem.exists(path.join(dirPath, `index${extension}`))) {
        return true;
      }
    }

    return false;
  }

  private isIndexSourceFile(fileName: string): boolean {
    return SOURCE_FILE_EXTENSIONS.some(extension => fileName === `index${extension}`);
  }

  /**
   * 檢查目錄是否包含子模組（遞迴檢查子目錄是否有 index.ts）
   */
  private async hasModulesInSubdirectories(dirPath: string): Promise<boolean> {
    const exists = await this.fileSystem.exists(dirPath);
    if (!exists) { return false; }

    const entries = await this.fileSystem.readDirectory(dirPath);

    for (const entry of entries) {
      if (!entry.isDirectory || entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      const subDirPath = path.join(dirPath, entry.name);
      const subEntries = await this.fileSystem.readDirectory(subDirPath);

      const hasIndex = subEntries.some(e => this.isIndexSourceFile(e.name));

      if (hasIndex) {
        return true;
      }

      // 遞迴檢查更深層的子目錄
      const hasDeepModules = await this.hasModulesInSubdirectories(subDirPath);
      if (hasDeepModules) {
        return true;
      }
    }

    return false;
  }

  /**
   * 產生模組快照
   */
  private async generateModuleSnapshot(modulePath: string): Promise<ModuleSnapshot> {
    const config = createIndexConfig(modulePath, {
      includeExtensions: SOURCE_FILE_EXTENSIONS,
      excludePatterns: [
        'node_modules/**',
        ...SOURCE_FILE_EXTENSIONS.flatMap(extension => [
          `**/*.test${extension}`,
          `**/*.spec${extension}`
        ])
      ]
    });

    const indexEngine = new IndexEngine(config, this.fileSystem);

    try {
      await indexEngine.indexProject();
      const allSymbols = await indexEngine.getAllSymbols();

      const symbols = allSymbols.map(result => result.symbol);
      const relativePath = path.basename(modulePath);

      // 使用 Parser 識別 factory 模式
      const factoryPatterns = await identifyFactoryPatterns(modulePath, this.fileSystem);

      // 預載入所有檔案內容（供 formatSignatureWithParser 使用）
      const fileContents = await this.loadFileContents(modulePath);

      return this.buildModuleSnapshot(relativePath, symbols, modulePath, factoryPatterns, fileContents);
    } finally {
      indexEngine.dispose();
    }
  }

  /**
   * 載入模組目錄下所有檔案內容
   */
  private async loadFileContents(modulePath: string): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    const supportedExtensions = ParserRegistry.getInstance().getSupportedExtensions();

    try {
      const entries = await this.fileSystem.readDirectory(modulePath);

      for (const entry of entries) {
        if (entry.isDirectory) { continue; }

        const ext = path.extname(entry.name);
        if (!supportedExtensions.includes(ext)) { continue; }

        const filePath = path.join(modulePath, entry.name);
        try {
          const content = await this.fileSystem.readFile(filePath);
          const codeString = typeof content === 'string' ? content : content.toString('utf-8');
          contents.set(filePath, codeString);
        } catch (error) {
          diagnostics.warn('snapshot/generator', 'FILE_READ_ERROR', `Skipping unreadable file: ${error instanceof Error ? error.message : String(error)}`, filePath);
        }
      }
    } catch (error) {
      diagnostics.warn('snapshot/generator', 'FILE_READ_ERROR', `Skipping unreadable dir: ${error instanceof Error ? error.message : String(error)}`, modulePath);
    }

    return contents;
  }

  /**
   * 產生專案快照
   * @param projectPath 專案路徑
   * @param scanFromSrc 是否從 src 子目錄掃描（true: package.json + src 模式，false: 直接掃描當前目錄）
   */
  private async generateProjectSnapshot(
    projectPath: string,
    scanFromSrc: boolean = true
  ): Promise<ProjectSnapshot> {
    const projectName = path.basename(projectPath);
    const modules: Record<string, ModuleSnapshot> = {};

    // 決定掃描起點：從 src 子目錄或從當前目錄
    const scanPath = scanFromSrc
      ? path.join(projectPath, 'src')
      : projectPath;

    const modulesDirs = await this.findModuleDirs(scanPath);

    for (const moduleDir of modulesDirs) {
      const moduleSnapshot = await this.generateModuleSnapshot(moduleDir);
      // 相對路徑基於掃描起點
      const relativePath = path.relative(scanPath, moduleDir);
      modules[relativePath] = moduleSnapshot;
    }

    return {
      project: projectName,
      modules
    };
  }

  /**
   * 找出所有模組目錄（有 index.ts 的目錄）
   */
  private async findModuleDirs(basePath: string): Promise<string[]> {
    const moduleDirs: string[] = [];

    const processDir = async (dirPath: string): Promise<void> => {
      const exists = await this.fileSystem.exists(dirPath);
      if (!exists) { return; }

      const entries = await this.fileSystem.readDirectory(dirPath);

      const hasIndex = entries.some(entry => this.isIndexSourceFile(entry.name));

      if (hasIndex) {
        moduleDirs.push(dirPath);
      }

      // 遞迴處理子目錄
      for (const entry of entries) {
        if (entry.isDirectory && !entry.name.startsWith('.')) {
          await processDir(path.join(dirPath, entry.name));
        }
      }
    };

    await processDir(basePath);
    return moduleDirs;
  }

  /**
   * 建構模組快照
   * @param factoryPatterns Parser 識別的 factory 模式（優先使用，若為空則 fallback 到名稱比對）
   * @param fileContents 檔案內容 Map（供 Parser 簽章解析使用）
   */
  private buildModuleSnapshot(
    moduleName: string,
    symbols: Symbol[],
    _modulePath: string,
    factoryPatterns: Map<string, PatternInfo> = new Map(),
    fileContents: Map<string, string> = new Map()
  ): ModuleSnapshot {
    // 轉型為 ExtendedSymbol 以存取 signature 和 typeInfo
    const extendedSymbols = symbols as ExtendedSymbol[];
    const api: Record<string, Record<string, string>> = {};
    const factories: Record<string, string> = {};
    const types: Record<string, string> = {};
    const privateInfo: Record<string, PrivateInfo> = {};

    // 單次遍歷分類符號
    const classes: ExtendedSymbol[] = [];
    const functions: ExtendedSymbol[] = [];
    const interfaces: ExtendedSymbol[] = [];
    const typeAliases: ExtendedSymbol[] = [];

    for (const s of extendedSymbols) {
      switch (s.type) {
        case SymbolType.Class:
          classes.push(s);
          break;
        case SymbolType.Function:
          functions.push(s);
          break;
        case SymbolType.Interface:
          interfaces.push(s);
          break;
        case SymbolType.Type:
          typeAliases.push(s);
          break;
      }
    }

    // 處理 class
    for (const cls of classes) {
      const methods = this.getClassMethods(cls, extendedSymbols, fileContents);
      if (Object.keys(methods).length > 0) {
        api[cls.name] = methods;
      }

      // 提取私有資訊
      const fields = this.getClassFields(cls, extendedSymbols);
      if (fields.length > 0) {
        privateInfo[cls.name] = {
          fields,
          imports: ''
        };
      }
    }

    // 處理 factory 函數
    // 優先使用 Parser 語義分析的結果，若無則 fallback 到名稱比對
    for (const func of functions) {
      if (isFactory(func.name, factoryPatterns)) {
        factories[func.name] = formatSymbolSignature(func, fileContents);
      }
    }

    // 處理 interface
    for (const iface of interfaces) {
      types[iface.name] = this.formatInterfaceFields(iface, extendedSymbols);
    }

    // 處理 type alias
    for (const typeAlias of typeAliases) {
      types[typeAlias.name] = this.formatTypeAlias(typeAlias);
    }

    return {
      module: moduleName,
      api,
      factories,
      types,
      private: privateInfo
    };
  }

  /**
   * 取得 class 的方法
   */
  private getClassMethods(
    cls: ExtendedSymbol,
    allSymbols: ExtendedSymbol[],
    fileContents: Map<string, string>
  ): Record<string, string> {
    const methods: Record<string, string> = {};

    // 找出屬於此 class 的方法
    // 方法的 scope 是 function scope（方法名），其 parent 才是 class scope
    const classMethods = allSymbols.filter(s =>
      s.type === SymbolType.Function
      && (s.scope?.parent?.name === cls.name || s.scope?.name === cls.name)
      && !s.modifiers.includes('private')
      && s.name !== 'constructor'  // 排除 constructor
    );

    for (const method of classMethods) {
      methods[method.name] = formatSymbolSignature(method, fileContents);
    }

    return methods;
  }

  /**
   * 取得 class 的私有欄位
   */
  private getClassFields(cls: ExtendedSymbol, allSymbols: ExtendedSymbol[]): string[] {
    const fields: string[] = [];

    // 找出屬於此 class 的屬性
    const classProps = allSymbols.filter(s =>
      (s.type === SymbolType.Property || s.type === SymbolType.Variable)
      && s.scope?.name === cls.name
    );

    for (const prop of classProps) {
      fields.push(prop.name);
    }

    return fields;
  }

  /**
   * 格式化 interface 欄位
   */
  private formatInterfaceFields(iface: Symbol, allSymbols: ExtendedSymbol[]): string {
    // 找出屬於此 interface 的屬性
    // scope.type === 'interface' 確保只匹配 interface 內的屬性
    const props = allSymbols.filter(s =>
      (s.type === SymbolType.Property || s.type === SymbolType.Variable)
      && s.scope?.type === 'interface'
      && s.scope?.name === iface.name
    );

    if (props.length === 0) {
      return '{}';
    }

    // 包含型別資訊
    const fields = props.map(p => {
      const typeInfo = p.typeInfo ? `: ${p.typeInfo}` : '';
      return `${p.name}${typeInfo}`;
    });

    return `{${fields.join(', ')}}`;
  }

  /**
   * 格式化 type alias
   */
  private formatTypeAlias(typeAlias: ExtendedSymbol): string {
    if (typeAlias.typeInfo) {
      return typeAlias.typeInfo;
    }
    return '{}';
  }
}
