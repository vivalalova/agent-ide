import { describe, expect, it } from 'vitest';
import { CallSiteUpdater } from '@core/change-signature/call-site-updater.js';
import {
  SignatureChangeType,
  type FunctionSignature,
  type SignatureChange
} from '@core/change-signature/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';

function makeSig(names: string[]): FunctionSignature {
  return {
    name: 'fn',
    parameters: names.map((name, i) => ({
      name,
      optional: false,
      rest: false,
      range: { start: { line: 1, column: i + 1 }, end: { line: 1, column: i + 2 } }
    })),
    location: {
      filePath: '/a.ts',
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
    },
    isMethod: false,
    modifiers: []
  };
}

describe('CallSiteUpdater falsy callSiteValue/defaultValue (P2)', () => {
  it('preserves empty-string callSiteValue instead of falling back via ||', () => {
    // createParameterMapping uses: change.callSiteValue || change.defaultValue
    // so callSiteValue "" is treated as absent and replaced by defaultValue "fallback"
    const updater = new CallSiteUpdater(
      {} as IFileSystem,
      {} as ParserRegistry
    );
    const original = makeSig(['a']);
    const changes: SignatureChange[] = [{
      type: SignatureChangeType.AddParameter,
      name: 'label',
      parameterType: 'string',
      defaultValue: 'fallback',
      callSiteValue: '',
      optional: false,
      position: 1
    }];
    // newSignature after add — only used for typing; mapping built from original+changes
    const mapping = updater.createParameterMapping(original, original, changes);
    // Added param entries use negative keys (-1 - newIndex)
    const added = [...mapping.entries()].filter(([k]) => k < 0).map(([, v]) => v);
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].value).toBe('');
  });

});
