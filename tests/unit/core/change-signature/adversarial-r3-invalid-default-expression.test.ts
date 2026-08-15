import { describe, expect, it } from 'vitest';
import { SignatureValidator } from '@core/change-signature/signature-validator.js';
import {
  ChangeSignatureErrorCode,
  SignatureChangeType
} from '@core/change-signature/types.js';

describe('change-signature default expression validation (adversarial R3)', () => {
  it('rejects a syntactically incomplete default expression', () => {
    const signature = {
      name: 'fn',
      parameters: [{
        name: 'value',
        optional: false,
        rest: false,
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
      }],
      location: {
        filePath: '/proj/a.ts',
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
      },
      isMethod: false,
      modifiers: []
    };
    const errors = new SignatureValidator().validateChanges(signature, [{
      type: SignatureChangeType.ChangeDefaultValue,
      parameterNameOrIndex: 'value',
      newDefaultValue: 'foo +'
    }]);

    expect(errors.some(error => error.code === ChangeSignatureErrorCode.InvalidDefaultValue)).toBe(true);
  });
});
