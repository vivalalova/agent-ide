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
  readonly moduleResolution: TsconfigPathConfig;
}

export interface SelectedSymbolBindings {
  readonly directNames: Set<string>;
  readonly namespaceNames: Set<string>;
  /** 檔內真正指向目標符號的 re-export 符號 token（具名 / 本地 re-export）；供裸名 identifier 比對 */
  readonly exportedNames: Set<string>;
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
