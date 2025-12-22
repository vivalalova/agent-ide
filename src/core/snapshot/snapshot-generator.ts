/**
 * Snapshot 產生器
 * 分析模組產生 AI 可讀的快照
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { IndexEngine, createIndexConfig } from '@core/shared/indexing/index.js';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import type { PatternInfo, FormattedSignature } from '@infrastructure/parser/index.js';
import { SymbolType, type Symbol } from '@shared/types/index.js';
import type { ModuleSnapshot, ProjectSnapshot, SnapshotResult, PrivateInfo } from './types.js';
import { SnapshotScope, isProjectSnapshot } from './types.js';
import { SnapshotCacheManager } from './snapshot-cache.js';
import type { IncrementalSnapshot, SnapshotDelta } from './snapshot-cache.js';

/** 擴展 Symbol 型別，包含 Parser 額外資訊 */
interface ExtendedSymbol extends Symbol {
  readonly signature?: string;
  readonly typeInfo?: string;
}

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
    const scope = await this.detectScope(targetPath);

    if (scope === SnapshotScope.Project) {
      return this.generateProjectSnapshot(targetPath);
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
   */
  private async detectScope(targetPath: string): Promise<SnapshotScope> {
    // 檢查是否有 package.json（專案根目錄）
    const packageJsonPath = path.join(targetPath, 'package.json');
    const hasPackageJson = await this.fileSystem.exists(packageJsonPath);

    if (hasPackageJson) {
      // 檢查是否有 src 目錄（表示是專案）
      const srcPath = path.join(targetPath, 'src');
      const hasSrc = await this.fileSystem.exists(srcPath);
      if (hasSrc) {
        return SnapshotScope.Project;
      }
    }

    // 檢查是否有 index.ts（模組入口）
    const indexPath = path.join(targetPath, 'index.ts');
    const hasIndex = await this.fileSystem.exists(indexPath);

    if (hasIndex) {
      return SnapshotScope.Module;
    }

    // 預設為模組
    return SnapshotScope.Module;
  }

  /**
   * 產生模組快照
   */
  private async generateModuleSnapshot(modulePath: string): Promise<ModuleSnapshot> {
    const config = createIndexConfig(modulePath, {
      includeExtensions: ['.ts', '.js', '.tsx', '.jsx'],
      excludePatterns: ['node_modules/**', '**/*.test.ts', '**/*.spec.ts']
    });

    const indexEngine = new IndexEngine(config, this.fileSystem);

    try {
      await indexEngine.indexProject();
      const allSymbols = await indexEngine.getAllSymbols();

      const symbols = allSymbols.map(result => result.symbol);
      const relativePath = path.basename(modulePath);

      // 使用 Parser 識別 factory 模式
      const factoryPatterns = await this.identifyFactoryPatterns(modulePath);

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
        } catch {
          // 忽略單一檔案的讀取錯誤
        }
      }
    } catch {
      // 忽略目錄讀取錯誤
    }

    return contents;
  }

  /**
   * 使用 Parser 識別模組內的 factory 模式
   */
  private async identifyFactoryPatterns(modulePath: string): Promise<Map<string, PatternInfo>> {
    const factoryMap = new Map<string, PatternInfo>();

    try {
      const entries = await this.fileSystem.readDirectory(modulePath);

      for (const entry of entries) {
        if (entry.isDirectory) { continue; }

        const ext = path.extname(entry.name);
        if (!['.ts', '.js', '.tsx', '.jsx'].includes(ext)) { continue; }

        const filePath = path.join(modulePath, entry.name);
        const parser = ParserRegistry.getInstance().getParser(ext);

        if (!parser || !parser.identifyPatterns) { continue; }

        try {
          const content = await this.fileSystem.readFile(filePath);
          const codeString = typeof content === 'string' ? content : content.toString('utf-8');
          const patterns = parser.identifyPatterns(codeString);

          if (patterns) {
            for (const pattern of patterns) {
              if (pattern.type === 'factory') {
                factoryMap.set(pattern.symbolName, pattern);
              }
            }
          }
        } catch {
          // 忽略單一檔案的解析錯誤，繼續處理其他檔案
        }
      }
    } catch {
      // 忽略目錄讀取錯誤，返回空 Map（fallback 到名稱比對）
    }

    return factoryMap;
  }

  /**
   * 產生專案快照
   */
  private async generateProjectSnapshot(projectPath: string): Promise<ProjectSnapshot> {
    const projectName = path.basename(projectPath);
    const modules: Record<string, ModuleSnapshot> = {};

    // 找出所有模組目錄
    const srcPath = path.join(projectPath, 'src');
    const modulesDirs = await this.findModuleDirs(srcPath);

    for (const moduleDir of modulesDirs) {
      const moduleSnapshot = await this.generateModuleSnapshot(moduleDir);
      const relativePath = path.relative(projectPath, moduleDir);
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

      // 檢查是否有 index.ts
      const hasIndex = entries.some(entry =>
        entry.name === 'index.ts' || entry.name === 'index.js'
      );

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

    // 分類符號
    const classes = extendedSymbols.filter(s => s.type === SymbolType.Class);
    const functions = extendedSymbols.filter(s => s.type === SymbolType.Function);
    const interfaces = extendedSymbols.filter(s => s.type === SymbolType.Interface);
    const typeAliases = extendedSymbols.filter(s => s.type === SymbolType.Type);

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
      const parserPattern = factoryPatterns.get(func.name);

      if (parserPattern) {
        // Parser 識別為 factory（語義分析）
        factories[func.name] = this.formatSymbolSignature(func, fileContents);
      } else if (factoryPatterns.size === 0 && func.name.startsWith('create')) {
        // Fallback：Parser 未提供任何結果時，使用名稱比對（向後相容）
        factories[func.name] = this.formatSymbolSignature(func, fileContents);
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
      methods[method.name] = this.formatSymbolSignature(method, fileContents);
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
   * 格式化符號簽章（方法或函數）
   * 優先使用 Parser AST 解析，fallback 到 simplifySignature
   * @param fileContents 檔案內容 Map（供 Parser 使用）
   */
  private formatSymbolSignature(
    symbol: ExtendedSymbol,
    fileContents: Map<string, string>
  ): string {
    // 優先使用 Parser AST 解析簽章
    const filePath = symbol.location?.filePath;
    const line = symbol.location?.range?.start?.line;
    const code = filePath ? fileContents.get(filePath) : undefined;

    if (filePath && line !== undefined && code) {
      const parserResult = this.formatSignatureWithParser(filePath, symbol.name, line, code);
      if (parserResult) {
        return parserResult;
      }
    }

    // Fallback：使用 IndexEngine 提取的簽章
    if (symbol.signature) {
      return this.simplifySignature(symbol.signature);
    }
    return '() → unknown';
  }

  /**
   * 使用 Parser AST 格式化簽章
   * @param filePath 檔案路徑（用於選擇 Parser）
   * @param symbolName 符號名稱
   * @param line 行號（1-based）
   * @param code 檔案內容
   * @returns 格式化後的簽章字串，如果無法解析則返回 null（fallback 到 simplifySignature）
   */
  private formatSignatureWithParser(
    filePath: string,
    symbolName: string,
    line: number,
    code: string
  ): string | null {
    const ext = path.extname(filePath);
    const parser = ParserRegistry.getInstance().getParser(ext);

    if (!parser?.formatSignature) { return null; }

    const sig: FormattedSignature | null = parser.formatSignature(code, symbolName, line);
    if (!sig) { return null; }

    // 轉換 FormattedSignature → 簡化字串
    const params = sig.parameters
      .map(p => {
        let str = p.name;
        if (p.optional && !p.defaultValue) { str += '?'; }
        if (p.type && p.type !== 'any') { str += `: ${p.type}`; }
        if (p.defaultValue) { str += ` = ${p.defaultValue}`; }
        return str;
      })
      .join(', ');

    return params ? `(${params}) → ${sig.returnType}` : `() → ${sig.returnType}`;
  }

  /**
   * 簡化簽章格式（移除函數名稱，保留參數和回傳型別）
   * 使用括號平衡算法處理巢狀泛型
   */
  private simplifySignature(signature: string): string {
    // 使用括號平衡算法找到參數列表的開始和結束位置
    const result = this.parseSignatureWithBalancing(signature);
    if (result) {
      return result;
    }

    // Fallback：原始正則邏輯（向後相容）
    const match = signature.match(/^[^(]*\(([^)]*)\)(?:\s*:\s*(.+))?$/);
    if (match) {
      const params = match[1].trim();
      const returnType = match[2]?.trim() || 'void';
      return params ? `(${params}) → ${returnType}` : `() → ${returnType}`;
    }
    return signature;
  }

  /**
   * 使用括號平衡算法解析簽章
   * 正確處理巢狀泛型（如 Map<K, Fn<V>>）
   */
  private parseSignatureWithBalancing(signature: string): string | null {
    // 找到第一個 '(' 的位置（跳過泛型參數 '<...>'）
    let depth = 0;
    let parenStart = -1;

    for (let i = 0; i < signature.length; i++) {
      const char = signature[i];
      if (char === '<') {
        depth++;
      } else if (char === '>') {
        depth--;
      } else if (char === '(' && depth === 0) {
        parenStart = i;
        break;
      }
    }

    if (parenStart === -1) {
      return null;
    }

    // 從 parenStart 開始，使用括號平衡找到對應的 ')'
    depth = 0;
    let parenEnd = -1;

    for (let i = parenStart; i < signature.length; i++) {
      const char = signature[i];
      if (char === '(' || char === '<' || char === '{' || char === '[') {
        depth++;
      } else if (char === ')' || char === '>' || char === '}' || char === ']') {
        depth--;
        if (depth === 0 && char === ')') {
          parenEnd = i;
          break;
        }
      }
    }

    if (parenEnd === -1) {
      return null;
    }

    // 提取參數和回傳型別
    const params = signature.substring(parenStart + 1, parenEnd).trim();
    const afterParen = signature.substring(parenEnd + 1).trim();

    // 解析回傳型別（跳過 ':' 後的部分）
    let returnType = 'void';
    if (afterParen.startsWith(':')) {
      returnType = afterParen.substring(1).trim();
    }

    return params ? `(${params}) → ${returnType}` : `() → ${returnType}`;
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
