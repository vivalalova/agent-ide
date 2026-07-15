import { describe, expect, it } from 'vitest';
import { SignatureValidator } from '@core/change-signature/signature-validator.js';
import {
  ChangeSignatureErrorCode,
  SignatureChangeType,
  type FunctionSignature,
  type SignatureChange
} from '@core/change-signature/types.js';

function sig(params: Array<{ name: string; optional?: boolean; defaultValue?: string; rest?: boolean }>): FunctionSignature {
  return {
    name: 'fn',
    parameters: params.map((p, i) => ({
      name: p.name,
      optional: p.optional ?? false,
      rest: p.rest ?? false,
      defaultValue: p.defaultValue,
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

describe('SignatureValidator adversarial R1', () => {
  const v = new SignatureValidator();

  it('accepts empty-string default value as a real default (not MissingDefaultValue)', () => {
    // Product uses if (!change.defaultValue) which treats "" as missing
    const change: SignatureChange = {
      type: SignatureChangeType.AddParameter,
      name: 'label',
      parameterType: 'string',
      defaultValue: '',
      optional: false,
      position: 1
    };
    const errors = v.validateChanges(sig([{ name: 'a' }]), [change]);
    const missing = errors.filter(e => e.code === ChangeSignatureErrorCode.MissingDefaultValue);
    expect(missing).toEqual([]);
  });
});
