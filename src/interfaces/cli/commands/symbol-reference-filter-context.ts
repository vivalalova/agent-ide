/**
 * Builds the shared SymbolReferenceFilterContext, including resolving the owner class name
 * of the selected symbol (used for `this.member` / `owner.member` reference matching).
 */

import * as ts from 'typescript';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { loadTsconfigPathConfigOrWarn } from '@plugins/typescript/tsconfig-loader.js';
import type { Symbol } from '@shared/types/symbol.js';
import type {
  SymbolLocationTarget,
  SymbolReferenceFilterContext
} from './symbol-reference-filter-types.js';
import { getScriptKind, normalizePath, readTextFile } from './module-file-resolver.js';
import { nodeStartsAtLocation } from './ast-node-location.js';

export async function createSymbolReferenceFilterContext(
  selectedSymbol: Symbol,
  projectPath: string,
  fileSystem: IFileSystem
): Promise<SymbolReferenceFilterContext> {
  const selectedOwnerName = await getSelectedOwnerName(selectedSymbol, fileSystem);
  const moduleResolution = await loadTsconfigPathConfigOrWarn(projectPath, fileSystem);
  return {
    selectedSymbol,
    ...(selectedOwnerName ? { selectedOwnerName } : {}),
    targetFile: normalizePath(selectedSymbol.location.filePath),
    projectPath,
    fileSystem,
    moduleProviderCache: new Map(),
    visitingModuleFiles: new Set(),
    fileAnalysisCache: new Map(),
    sourceFileCache: new Map(),
    defaultExportDeclaredNameCache: new Map(),
    moduleResolution
  };
}

async function getSelectedOwnerName(
  selectedSymbol: Symbol,
  fileSystem: IFileSystem
): Promise<string | undefined> {
  const scopedOwnerName = getScopedOwnerName(selectedSymbol);
  if (scopedOwnerName) {
    return scopedOwnerName;
  }

  const content = await readTextFile(selectedSymbol.location.filePath, fileSystem);
  const sourceFile = ts.createSourceFile(
    selectedSymbol.location.filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(selectedSymbol.location.filePath)
  );
  return findOwnerClassNameAtLocation(sourceFile, {
    file: selectedSymbol.location.filePath,
    line: selectedSymbol.location.range.start.line,
    column: selectedSymbol.location.range.start.column
  });
}

function getScopedOwnerName(symbol: Symbol): string | undefined {
  if (symbol.scope?.parent?.type === 'class') {
    return symbol.scope.parent.name;
  }

  if (symbol.scope?.type === 'class') {
    return symbol.scope.name;
  }

  return undefined;
}

function findOwnerClassNameAtLocation(
  sourceFile: ts.SourceFile,
  location: SymbolLocationTarget
): string | undefined {
  let ownerName: string | undefined;

  const visit = (node: ts.Node): void => {
    if (ownerName) {
      return;
    }

    if (ts.isClassDeclaration(node) && node.name) {
      for (const member of node.members) {
        const name = getMemberNameNode(member);
        if (name && nodeStartsAtLocation(name, sourceFile, location)) {
          ownerName = node.name.text;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return ownerName;
}

function getMemberNameNode(member: ts.ClassElement): ts.Identifier | undefined {
  if (
    (
      ts.isMethodDeclaration(member)
      || ts.isPropertyDeclaration(member)
      || ts.isGetAccessorDeclaration(member)
      || ts.isSetAccessorDeclaration(member)
    )
    && ts.isIdentifier(member.name)
  ) {
    return member.name;
  }

  return undefined;
}
