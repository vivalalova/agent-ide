import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { positionToTsPosition, tsPositionToPosition } from '@plugins/typescript/types.js';

describe('TypeScript parser position conversion', () => {
  it('converts TypeScript zero-based positions to shared one-based positions', () => {
    const code = 'first\nconst value = 1;\n';
    const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.ES2020, true);
    const offset = code.indexOf('value');

    expect(tsPositionToPosition(sourceFile, offset)).toEqual({
      line: 2,
      column: 7,
      offset
    });
  });

  it('converts shared one-based positions back to TypeScript zero-based positions', () => {
    const code = 'first\nconst value = 1;\n';
    const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.ES2020, true);

    expect(positionToTsPosition(sourceFile, { line: 2, column: 7 })).toBe(code.indexOf('value'));
  });
});
