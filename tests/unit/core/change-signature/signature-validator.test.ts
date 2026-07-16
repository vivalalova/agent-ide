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

  /**
   * R15（缺陷）：validateChanges 對每個 change 一律對照最初傳入的原始 signature
   * 驗證，而非「此 change 之前所有 change 依序套用後」的當下參數列表。
   *
   * `(a, b, c)` 套用 `[remove c, reorder b,a]` 應合法——移除 c 後只剩 `(a, b)`，
   * reorder 剛好對照這兩個剩餘參數重新排序。但現行為拿 reorder 的 2 個名稱去對照
   * 原始 3 參數簽名的長度，誤判為「重新排序必須包含所有參數」而回報錯誤。
   */
  it('對移除後才存在的參數列表驗證後續 reorder，remove+reorder 合法組合不應誤判', () => {
    const validator = new SignatureValidator();
    const threeParamSignature: FunctionSignature = {
      name: 'render',
      parameters: [
        { name: 'a', optional: false, rest: false, range },
        { name: 'b', optional: false, rest: false, range },
        { name: 'c', optional: false, rest: false, range }
      ],
      location,
      isMethod: false,
      modifiers: []
    };

    const errors = validator.validateChanges(threeParamSignature, [
      { type: SignatureChangeType.RemoveParameter, parameterNameOrIndex: 'c' },
      { type: SignatureChangeType.ReorderParameters, newOrder: ['b', 'a'] }
    ]);

    expect(errors).toEqual([]);
  });

  /**
   * 回歸（R15 修復的副作用）：above 修復把 reorder 的驗證改對照
   * 「此 change 之前所有 change 依序套用後」的當下參數列表，但若先前的變更是
   * --add（而非 --remove），currentSignature 會多算進新增參數，newOrder 卻本就
   * 不必（也不該）列出新增參數名稱——signature-transformer.ts 的實際套用邏輯
   * 早已容忍此情況（明確保留未被 newOrder 指名的參數）。
   *
   * `(a, b, c)` 套用 `[add x, reorder c,a,b]` 應合法：add 插入新參數 x 後，
   * reorder 只需涵蓋原本就存在的 3 個參數（c,a,b），不必列出 x。
   */
  it('對新增後才存在的參數列表驗證後續 reorder，add+reorder 合法組合不應誤判', () => {
    const validator = new SignatureValidator();
    const threeParamSignature: FunctionSignature = {
      name: 'render',
      parameters: [
        { name: 'a', optional: false, rest: false, range },
        { name: 'b', optional: false, rest: false, range },
        { name: 'c', optional: false, rest: false, range }
      ],
      location,
      isMethod: false,
      modifiers: []
    };

    const errors = validator.validateChanges(threeParamSignature, [
      {
        type: SignatureChangeType.AddParameter,
        name: 'x',
        parameterType: 'number',
        optional: false,
        position: 0,
        defaultValue: '9'
      },
      { type: SignatureChangeType.ReorderParameters, newOrder: ['c', 'a', 'b'] }
    ]);

    expect(errors).toEqual([]);
  });
});
