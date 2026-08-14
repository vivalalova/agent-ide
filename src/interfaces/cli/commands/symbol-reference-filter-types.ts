/**
 * Shared types for the --at symbol reference filter pipeline.
 */

import type * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { TsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';
import type { Symbol } from '@shared/types/symbol.js';

export interface SymbolReferenceFilterContext {
  readonly selectedSymbol: Symbol;
  readonly selectedOwnerName?: string;
  readonly targetFile: string;
  readonly projectPath: string;
  readonly fileSystem: IFileSystem;
  readonly moduleProviderCache: Map<string, boolean>;
  readonly visitingModuleFiles: Set<string>;
  readonly fileAnalysisCache: Map<string, SelectedSymbolFileAnalysis>;
  readonly sourceFileCache: Map<string, ts.SourceFile>;
  /** 檔案 default export 底層宣告名稱快取；`undefined` 代表已判定該檔無 default export（或無法判定名稱） */
  readonly defaultExportDeclaredNameCache: Map<string, string | undefined>;
  readonly moduleResolution: TsconfigPathConfig;
}

export interface SelectedSymbolBindings {
  readonly directNames: Set<string>;
  readonly namespaceNames: Set<string>;
  /** 檔內真正指向目標符號的 re-export 符號 token（具名 / 本地 re-export）；供裸名 identifier 比對 */
  readonly exportedNames: Set<string>;
  /**
   * 本檔把目標符號以「別名」對外匯出時的對外名稱（`export { X as api }`，有無 from 皆同）。
   * 下游 `import { api }` 的本地綁定仍指向目標符號，故需以此判定 directNames；
   * 與 exportedNames 分開：後者的 key 是原始符號名，用於「本檔是否提供該符號」與裸名 token 比對。
   */
  readonly exportedAliasNames: Set<string>;
  /** `export *` 轉出目標符號的模組圖資訊；檔內無符號 token，僅供模組供給判斷、不參與 identifier 比對 */
  readonly starReExportedNames: Set<string>;
  readonly ownerNames: Set<string>;
}

export interface SelectedSymbolFileAnalysis {
  readonly sourceFile: ts.SourceFile;
  readonly bindings: SelectedSymbolBindings;
}

export interface SymbolLocationTarget {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
}
