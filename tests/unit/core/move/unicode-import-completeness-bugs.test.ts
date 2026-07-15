/**
 * Regression pins for isCompleteImportStatement using \\w+ instead of
 * UNICODE_IDENTIFIER_CLASS (statement-collector.ts).
 *
 * Product code is intentionally left broken — these tests must fail until fixed.
 */
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';
import { collectMultilineImportStatement } from '@core/move/statement-collector.js';
import { ImportStatementType } from '@core/move/types.js';

function createResolver(): ImportResolver {
  return new ImportResolver({ pathAliases: {}, supportedExtensions: ['.ts', '.js'] });
}

describe('isCompleteImportStatement unicode / $ completeness (P2)', () => {
  it('collects multiline unicode default import span', () => {
    const lines = ['import 工具', '  from \'./mod\';'];
    const span = collectMultilineImportStatement(lines, 0);
    expect(span).not.toBeNull();
    expect(span!.startLineIndex).toBe(0);
    expect(span!.endLineIndex).toBe(1);
  });

  it('parses multiline unicode default import path', () => {
    const stmts = createResolver().parseImportStatements(
      'import 工具\n  from \'./mod\';\n',
      '/project/src/a.ts'
    );
    expect(stmts.map(s => s.path)).toEqual(['./mod']);
  });

  it('parses multiline unicode namespace import path', () => {
    const stmts = createResolver().parseImportStatements(
      'import * as 工具\n  from \'./mod\';\n',
      '/project/src/a.ts'
    );
    expect(stmts.map(s => s.path)).toEqual(['./mod']);
  });

  it('parses multiline $ default import path', () => {
    const stmts = createResolver().parseImportStatements(
      'import $api\n  from \'./mod\';\n',
      '/project/src/a.ts'
    );
    expect(stmts.map(s => s.path)).toEqual(['./mod']);
  });

  it('does not let a unicode single-line import swallow a later require into a false multiline span', () => {
    // isCompleteImportStatement fails on 工具 (\\w+), then unanchored .test()
    // matches the later ASCII import and returns a span covering lines 0-2,
    // skipping require() parsing for the middle line.
    const code = [
      'import 工具 from \'./mod\';',
      'const x = require(\'./legacy\');',
      'import foo from \'./other\';',
      ''
    ].join('\n');

    const lines = code.split('\n');
    const span = collectMultilineImportStatement(lines, 0);
    // Correct: single-line unicode import is already complete → span ends at line 0
    // (or null, with per-line parsing). Must NOT span through require to the next import.
    if (span !== null) {
      expect(span.endLineIndex).toBe(0);
    }

    const stmts = createResolver().parseImportStatements(code, '/project/src/a.ts');
    const paths = stmts.map(s => s.path).sort();
    expect(paths).toEqual(['./legacy', './mod', './other'].sort());
    expect(stmts.some(s => s.type === ImportStatementType.REQUIRE && s.path === './legacy')).toBe(true);
  });

  it('does not let a unicode single-line import swallow a later dynamic import()', () => {
    const code = [
      'import 工具 from \'./mod\';',
      'const load = () => import(\'./lazy\');',
      'import foo from \'./other\';',
      ''
    ].join('\n');

    const stmts = createResolver().parseImportStatements(code, '/project/src/a.ts');
    const paths = stmts.map(s => s.path).sort();
    expect(paths).toEqual(['./lazy', './mod', './other'].sort());
    expect(stmts.some(s => s.type === ImportStatementType.DYNAMIC_IMPORT && s.path === './lazy')).toBe(true);
  });
});
