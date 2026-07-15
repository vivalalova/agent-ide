import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';

describe('findImportedSymbols unicode (P2)', () => {
  const r = new ImportResolver({ pathAliases: {}, supportedExtensions: ['.ts'] });

  it('extracts unicode default import name', () => {
    expect(r.findImportedSymbols('import 工具 from \'./mod\';')).toContain('工具');
  });

  it('extracts $ default import name', () => {
    expect(r.findImportedSymbols('import $api from \'./mod\';')).toContain('$api');
  });

  it('extracts unicode namespace import', () => {
    expect(r.findImportedSymbols('import * as 工具 from \'./mod\';')).toContain('工具');
  });

  it('extracts unicode named import alias', () => {
    expect(r.findImportedSymbols('import { 用戶 as 使用者 } from \'./mod\';')).toContain('使用者');
  });
});
