import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createLanguageServiceManager } from '@plugins/typescript/language-service.js';
import type { TypeScriptSymbol } from '@plugins/typescript/types.js';

describe('TypeScript namespace import alias (adversarial R3)', () => {
  it('uses the local alias for member references when propertyName is the namespace export', () => {
    const sourceFile = ts.createSourceFile(
      '/proj/app.ts',
      'import { ns as local } from "./barrel"; local.X();',
      ts.ScriptTarget.Latest,
      true
    );
    const symbol = { name: 'X', location: { filePath: '/proj/def.ts' } } as TypeScriptSymbol;
    const moduleResolver = (_file: string, _specifier: string, localName?: string): boolean => localName === 'ns';
    const spans = createLanguageServiceManager({}).getAstDirectReferenceSpans(
      symbol,
      sourceFile,
      moduleResolver
    );

    expect(spans.map(span => sourceFile.text.slice(span.start, span.end))).toEqual(['X']);
  });
});
