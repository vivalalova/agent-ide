/**
 * TypeScript LanguageServiceManager 測試
 * 驗證 TypeScript parser 底層 language service 生命週期與檔案快取行為
 */

import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { createLanguageServiceManager } from '@plugins/typescript/language-service.js';
import type { TypeScriptSymbol } from '@plugins/typescript/types.js';
import { SymbolType } from '@shared/types/index.js';

function createSourceFile(fileName: string, content: string): ts.SourceFile {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function createSymbol(tsNode: ts.Node, filePath: string): TypeScriptSymbol {
  return {
    name: 'greet',
    type: SymbolType.Function,
    location: {
      filePath,
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 }
      }
    },
    scope: undefined,
    modifiers: [],
    tsNode
  };
}

describe('LanguageServiceManager', () => {
  it('Given source file, when initialized, then exposes language service and source file', () => {
    const fileName = '/project/src/example.ts';
    const sourceFile = createSourceFile(fileName, 'export const value = 1;');
    const manager = createLanguageServiceManager({
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext
    });

    manager.ensureInitialized(sourceFile);

    expect(manager.languageService).not.toBeNull();
    expect(manager.languageServiceHost).not.toBeNull();
    expect(manager.files.get(fileName)?.content).toBe(sourceFile.text);
    expect(manager.languageServiceHost?.getScriptFileNames()).toContain(fileName);
    expect(manager.getSourceFileFromFileName(fileName)?.fileName).toBe(fileName);
  });

  it('Given same file content, when updated repeatedly, then version only changes for new content', () => {
    const fileName = '/project/src/versioned.ts';
    const manager = createLanguageServiceManager({});

    manager.updateFile(fileName, 'export const value = 1;');
    expect(manager.files.get(fileName)?.version).toBe(0);

    manager.updateFile(fileName, 'export const value = 1;');
    expect(manager.files.get(fileName)?.version).toBe(0);

    manager.updateFile(fileName, 'export const value = 2;');
    expect(manager.files.get(fileName)?.version).toBe(1);
    expect(manager.files.get(fileName)?.content).toContain('value = 2');
  });

  it('Given more files than cache capacity, when updating files, then evicts the oldest entry', () => {
    const manager = createLanguageServiceManager({});

    for (let index = 0; index <= 600; index++) {
      manager.updateFile(`/project/src/file-${index}.ts`, `export const value${index} = ${index};`);
    }

    expect(manager.files.size).toBe(600);
    expect(manager.files.has('/project/src/file-0.ts')).toBe(false);
    expect(manager.files.has('/project/src/file-1.ts')).toBe(true);
    expect(manager.files.has('/project/src/file-600.ts')).toBe(true);
  });

  it('Given TypeScript symbol node, when locating symbol, then returns identifier offset', () => {
    const fileName = '/project/src/symbol.ts';
    const content = 'export function greet(): string { return "hi"; }';
    const sourceFile = createSourceFile(fileName, content);
    const declaration = sourceFile.statements[0];
    const manager = createLanguageServiceManager({});

    const position = manager.getSymbolPosition(
      createSymbol(declaration, fileName),
      sourceFile,
      node => ts.isFunctionDeclaration(node) ? node.name : undefined
    );

    expect(position).toBe(content.indexOf('greet'));
  });

  it('Given initialized manager, when disposed, then clears service and file cache', async () => {
    const fileName = '/project/src/dispose.ts';
    const manager = createLanguageServiceManager({});
    manager.ensureInitialized(createSourceFile(fileName, 'export const value = 1;'));

    await manager.dispose();

    expect(manager.languageService).toBeNull();
    expect(manager.languageServiceHost).toBeNull();
    expect(manager.files.size).toBe(0);
  });
});
