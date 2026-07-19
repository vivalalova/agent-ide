/**
 * Filters read-only symbol references to the definition selected by --at.
 *
 * Public entry for the find-references / call-hierarchy `--at` filter. The heavy lifting is
 * split across cohesive sibling modules:
 *   - `symbol-reference-filter-context.ts`  — build the shared filter context + owner name
 *   - `module-file-resolver.ts`             — import/module-path resolution + SourceFile cache
 *   - `same-file-lexical-scope.ts`          — same-file lexical scope / shadow / hoist analysis
 *   - `cross-file-import-binding.ts`        — cross-file import/export binding + matching
 *   - `receiver-owner-heritage.ts`          — `this`/owner/heritage receiver judgement
 *   - `reexport-alias-references.ts`        — single-hop re-export alias references (LS path)
 *
 * Why the scope/visibility judgement is hand-written instead of the TypeScript Language
 * Service (LS):
 *   The tool operates on an injected IFileSystem (memfs under the E2E fixtures) and resolves
 *   modules through the project tsconfig path aliases. The LS host reads any file it was not
 *   explicitly fed through `ts.sys` — the real disk — which is blind to that injected file
 *   system. Cross-module reference/definition resolution via LS would therefore silently
 *   fail on the in-memory fixtures, so the cross-file path must resolve the module graph
 *   itself and cannot delegate to LS as a single authoritative source. The `SymbolFinder`'s
 *   `findScopedReferences` is likewise insufficient here: it is coarse name+className text
 *   matching over a single file and cannot pin the specific `--at` definition among
 *   same-named symbols across the module graph. The one place LS is used
 *   (`reexport-alias-references.ts`) is strictly intra-file — a single loaded consumer file,
 *   with results filtered back to that same file — never as a cross-file authority.
 */

import { type SymbolReference } from '@core/foundations/symbol-finder/index.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { Symbol } from '@shared/types/symbol.js';
import type {
  SymbolLocationTarget,
  SymbolReferenceFilterContext
} from './symbol-reference-filter-types.js';
import { createSymbolReferenceFilterContext } from './symbol-reference-filter-context.js';
import { normalizePath } from './module-file-resolver.js';
import { sameFileLocationTargetsSelectedSymbol } from './same-file-lexical-scope.js';
import {
  getSelectedSymbolFileAnalysis,
  locationMatchesSelectedBinding
} from './cross-file-import-binding.js';

export async function filterReferencesToSelectedSymbol(
  references: readonly SymbolReference[],
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<SymbolReference[]> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);
  const filteredReferences: SymbolReference[] = [];

  for (const reference of references) {
    if (isSelectedSymbolDefinition(reference, selectedSymbol)) {
      filteredReferences.push(reference);
      continue;
    }

    if (
      await symbolLocationTargetsSelectedSymbol(
        {
          file: reference.location.filePath,
          line: reference.location.range.start.line,
          column: reference.location.range.start.column
        },
        filterContext
      )
    ) {
      filteredReferences.push(reference);
    }
  }

  return filteredReferences;
}

function isSelectedSymbolDefinition(reference: SymbolReference, selectedSymbol: Symbol): boolean {
  const referenceStart = reference.location.range.start;
  const symbolStart = selectedSymbol.location.range.start;
  return reference.type === 'definition'
    && normalizePath(reference.location.filePath) === normalizePath(selectedSymbol.location.filePath)
    && referenceStart.line === symbolStart.line
    && referenceStart.column === symbolStart.column;
}

export async function locationTargetsSelectedSymbol(
  location: SymbolLocationTarget,
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<boolean> {
  const locationFilter = await createSelectedSymbolLocationFilter(selectedSymbol, projectPath, fileSystem);
  return await locationFilter(location);
}

export async function createSelectedSymbolLocationFilter(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<(location: SymbolLocationTarget) => Promise<boolean>> {
  const filterContext = await createSymbolReferenceFilterContext(selectedSymbol, projectPath, fileSystem);
  return async location => await symbolLocationTargetsSelectedSymbol(location, filterContext);
}

async function symbolLocationTargetsSelectedSymbol(
  location: SymbolLocationTarget,
  filterContext: SymbolReferenceFilterContext
): Promise<boolean> {
  const referenceFile = normalizePath(location.file);
  if (referenceFile === filterContext.targetFile) {
    return await sameFileLocationTargetsSelectedSymbol(referenceFile, location, filterContext);
  }

  const analysis = await getSelectedSymbolFileAnalysis(referenceFile, filterContext);
  return locationMatchesSelectedBinding(
    analysis.sourceFile,
    location,
    analysis.bindings,
    filterContext.selectedSymbol,
    filterContext.selectedOwnerName
  );
}
