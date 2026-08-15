/**
 * 收集 import binding 的檔內引用，供查詢層的別名補抓共用。
 *
 * import binding 本身在 Language Service 結果中會被標成 definition，但對外查詢時，
 * 真正的符號定義位於被 import 的模組，因此應呈現為 import；同時只保留被查詢檔內
 * 的結果，避免跨檔結果被錯誤歸屬。
 */

import * as ts from 'typescript';
import { type SymbolReference, SymbolReferenceType } from '@core/foundations/symbol-finder/index.js';
import type { Symbol } from '@shared/types/symbol.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { TypeScriptSymbol } from '@plugins/typescript/types.js';
import { normalizePath } from './module-file-resolver.js';

export async function findImportBindingReferences(
  identifier: ts.Identifier,
  sourceFile: ts.SourceFile,
  filePath: string,
  findReferencesWithSymbol: (filePath: string, symbol: Symbol) => Promise<SymbolReference[]>
): Promise<SymbolReference[]> {
  const bindingSymbol = createImportBindingSymbol(identifier, sourceFile, filePath);
  const references = await findReferencesWithSymbol(filePath, bindingSymbol);
  const normalizedFilePath = normalizePath(filePath);

  return references
    .filter(ref => normalizePath(ref.location.filePath) === normalizedFilePath)
    .map(ref => ref.type === SymbolReferenceType.Definition
      ? { ...ref, type: SymbolReferenceType.Import }
      : ref);
}

/**
 * 以 import binding 的 identifier 節點構造 TypeScriptSymbol，供 LS 作用域感知查找使用。
 */
function createImportBindingSymbol(
  identifier: ts.Identifier,
  sourceFile: ts.SourceFile,
  filePath: string
): TypeScriptSymbol {
  const start = sourceFile.getLineAndCharacterOfPosition(identifier.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(identifier.getEnd());
  return {
    name: identifier.text,
    type: SymbolType.Variable,
    location: {
      filePath,
      range: {
        start: { line: start.line + 1, column: start.character + 1 },
        end: { line: end.line + 1, column: end.character + 1 }
      }
    },
    scope: undefined,
    modifiers: [],
    tsNode: identifier
  };
}
