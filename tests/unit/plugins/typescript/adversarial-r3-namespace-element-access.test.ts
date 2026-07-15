import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createLanguageServiceManager } from '@plugins/typescript/language-service.js';
import type { TypeScriptSymbol } from '@plugins/typescript/types.js';

describe('TypeScript namespace element access (adversarial R3)', () => {
  it('collects static string and no-substitution template element keys', () => {
    const sourceFile = ts.createSourceFile(
      '/proj/app.ts',
      'import * as ns from "./def"; ns["X"](); ns[`X`]();',
      ts.ScriptTarget.Latest,
      true
    );
    const symbol = { name: 'X', location: { filePath: '/proj/def.ts' } } as TypeScriptSymbol;
    const spans = createLanguageServiceManager({}).getAstDirectReferenceSpans(
      symbol,
      sourceFile,
      () => true
    );

    expect(spans.map(span => sourceFile.text.slice(span.start, span.end))).toEqual(['X', 'X']);
  });
});
