/**
 * Snapshot 產生器
 * 分析模組產生 AI 可讀的快照
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { IndexEngine, createIndexConfig } from '@core/indexing/index.js';
import { SymbolType, type Symbol } from '@shared/types/index.js';
import type { ModuleSnapshot, ProjectSnapshot, SnapshotResult, PrivateInfo } from './types.js';
import { SnapshotScope } from './types.js';

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
      includeExtensions: ['.ts', '.js', '.tsx', '.jsx', '.swift', '.py'],
      excludePatterns: ['node_modules/**', '**/*.test.ts', '**/*.spec.ts', '**/test_*.py', '**/*_test.py']
    });

    const indexEngine = new IndexEngine(config, this.fileSystem);

    try {
      await indexEngine.indexProject();
      const allSymbols = await indexEngine.getAllSymbols();

      const symbols = allSymbols.map(result => result.symbol);
      const relativePath = path.basename(modulePath);

      return this.buildModuleSnapshot(relativePath, symbols, modulePath);
    } finally {
      indexEngine.dispose();
    }
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
      if (!exists) {return;}

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
   */
  private buildModuleSnapshot(moduleName: string, symbols: Symbol[], _modulePath: string): ModuleSnapshot {
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
      const methods = this.getClassMethods(cls, extendedSymbols);
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

    // 處理 factory 函數（createXxx）
    for (const func of functions) {
      if (func.name.startsWith('create')) {
        factories[func.name] = this.formatFunctionSignature(func);
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
  private getClassMethods(cls: ExtendedSymbol, allSymbols: ExtendedSymbol[]): Record<string, string> {
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
      methods[method.name] = this.formatMethodSignature(method);
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
   * 格式化方法簽章
   */
  private formatMethodSignature(method: ExtendedSymbol): string {
    // 優先使用 Parser 提取的完整簽章
    if (method.signature) {
      return this.simplifySignature(method.signature);
    }
    return '() → unknown';
  }

  /**
   * 格式化函數簽章
   */
  private formatFunctionSignature(func: ExtendedSymbol): string {
    // 優先使用 Parser 提取的完整簽章
    if (func.signature) {
      return this.simplifySignature(func.signature);
    }
    return '() → unknown';
  }

  /**
   * 簡化簽章格式（移除函數名稱，保留參數和回傳型別）
   */
  private simplifySignature(signature: string): string {
    // 格式：name<T>(param: Type): ReturnType → (param: Type) → ReturnType
    const match = signature.match(/^[^(]*\(([^)]*)\)(?:\s*:\s*(.+))?$/);
    if (match) {
      const params = match[1].trim();
      const returnType = match[2]?.trim() || 'void';
      return params ? `(${params}) → ${returnType}` : `() → ${returnType}`;
    }
    return signature;
  }

  /**
   * 格式化 interface 欄位
   */
  private formatInterfaceFields(iface: Symbol, allSymbols: ExtendedSymbol[]): string {
    // 找出屬於此 interface 的屬性
    const props = allSymbols.filter(s =>
      (s.type === SymbolType.Property || s.type === SymbolType.Variable)
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
