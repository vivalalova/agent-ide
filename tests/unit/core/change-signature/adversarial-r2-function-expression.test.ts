/**
 * P1: SignatureParser / declaration-analyzer miss const f = function (...) {}
 */
import { describe, expect, it } from 'vitest';
import { SignatureParser } from '@core/change-signature/signature-parser.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('function expression signature (adversarial R2)', () => {
  it('parses const combine = function (a, b) {}', async () => {
    const fs = new MemFileSystem();
    await fs.fromJSON({
      '/src/a.ts': [
        'export const combine = function (a: number, b: number) {',
        '  return a + b;',
        '};',
        ''
      ].join('\n')
    });
    if (ParserRegistry.getInstance().isDisposed) ParserRegistry.resetInstance();
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);
    const sig = await new SignatureParser(reg, fs).parseSignature('/src/a.ts', 'combine');
    expect(sig).not.toBeNull();
    expect(sig!.parameters.map(p => p.name)).toEqual(['a', 'b']);
  });
});
