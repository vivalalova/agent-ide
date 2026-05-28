import { describe, expect, it } from 'vitest';

import { SignatureValidator } from '@core/change-signature/signature-validator.js';
import {
  ChangeSignatureErrorCode,
  SignatureChangeType,
  type FunctionSignature
} from '@core/change-signature/types.js';
import type { Location, Range } from '@shared/types/core.js';

const range: Range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 }
};

const location: Location = {
  filePath: '/workspace/source.ts',
  range
};

const signature: FunctionSignature = {
  name: 'render',
  parameters: [],
  location,
  isMethod: false,
  modifiers: []
};

describe('SignatureValidator', () => {
  it('requires added parameters to keep a function default even with a call-site value', () => {
    const validator = new SignatureValidator();

    const errors = validator.validateChanges(signature, [
      {
        type: SignatureChangeType.AddParameter,
        name: 'label',
        parameterType: 'string',
        optional: false,
        position: -1,
        callSiteValue: 'runtimeLabel'
      }
    ]);

    expect(errors).toContainEqual({
      code: ChangeSignatureErrorCode.MissingDefaultValue,
      message: '參數 label 缺少 function default，請使用 --add name:type=default 指定',
      parameterName: 'label'
    });
  });
});
