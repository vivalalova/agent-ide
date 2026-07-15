/**
 * P2 (round 2 finding 4): SignatureValidator uses `=== undefined` to distinguish
 * "no default value provided" from "empty string is a legitimate default value"
 * (see adversarial-r1-validator.test.ts, which pins that an empty string must NOT
 * be reported as MissingDefaultValue). That pin is correct — "" is a valid piece of
 * TypeScript syntax to appear after `=` ONLY when it is itself a valid expression,
 * and an empty string is not: the signature generator (change-signature-engine.ts,
 * `result += \` = ${param.defaultValue}\``) would emit `label: string = ` with
 * nothing after `=`, which is invalid TypeScript. The validator must reject this
 * with a distinct, explicit error (InvalidDefaultValue) rather than silently
 * accepting it — this does not conflict with the R1 pin, which only asserts the
 * ABSENCE of MissingDefaultValue, not the absence of all errors.
 */
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

describe('SignatureValidator empty-string default value (R2 finding 4)', () => {
  const v = new SignatureValidator();

  it('rejects an empty-string default value on AddParameter with InvalidDefaultValue (not silently accepted)', () => {
    const change: SignatureChange = {
      type: SignatureChangeType.AddParameter,
      name: 'label',
      parameterType: 'string',
      defaultValue: '',
      optional: false,
      position: 1
    };
    const errors = v.validateChanges(sig([{ name: 'a' }]), [change]);
    expect(errors).toContainEqual(expect.objectContaining({
      code: ChangeSignatureErrorCode.InvalidDefaultValue,
      parameterName: 'label'
    }));
  });

  it('still does not report MissingDefaultValue for an empty-string default (R1 pin preserved)', () => {
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

  it('rejects an empty-string default value on ChangeDefaultValue with InvalidDefaultValue', () => {
    const change: SignatureChange = {
      type: SignatureChangeType.ChangeDefaultValue,
      parameterNameOrIndex: 'a',
      newDefaultValue: ''
    };
    const errors = v.validateChanges(sig([{ name: 'a', defaultValue: '1' }]), [change]);
    expect(errors).toContainEqual(expect.objectContaining({
      code: ChangeSignatureErrorCode.InvalidDefaultValue,
      parameterName: 'a'
    }));
  });
});
