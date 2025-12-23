/**
 * Signature Transformer
 * 負責簽名轉換邏輯
 */

import type {
  FunctionSignature,
  ParameterDefinition,
  SignatureChange
} from './types.js';
import {
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange,
  isChangeParameterTypeChange,
  isRenameParameterChange,
  isChangeDefaultValueChange,
  isToggleOptionalChange
} from './types.js';

/**
 * Signature Transformer
 * 將變更套用到簽名
 */
export class SignatureTransformer {
  /**
   * 套用變更到簽名
   */
  applyChangesToSignature(signature: FunctionSignature, changes: readonly SignatureChange[]): FunctionSignature {
    let parameters = [...signature.parameters];

    for (const change of changes) {
      if (isAddParameterChange(change)) {
        const newParam: ParameterDefinition = {
          name: change.name,
          type: change.parameterType,
          defaultValue: change.defaultValue,
          optional: change.optional,
          rest: false,
          range: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } }
        };

        if (change.position < 0 || change.position >= parameters.length) {
          parameters.push(newParam);
        } else {
          parameters.splice(change.position, 0, newParam);
        }
      }

      if (isRemoveParameterChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters.splice(index, 1);
        }
      }

      if (isReorderParametersChange(change)) {
        const newParams: ParameterDefinition[] = [];
        for (const nameOrIndex of change.newOrder) {
          const index = this.resolveParameterIndex(parameters, nameOrIndex);
          if (index >= 0) {
            newParams.push(parameters[index]);
          }
        }
        parameters = newParams;
      }

      if (isChangeParameterTypeChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = { ...parameters[index], type: change.newType };
        }
      }

      if (isRenameParameterChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = { ...parameters[index], name: change.newName };
        }
      }

      if (isChangeDefaultValueChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = {
            ...parameters[index],
            defaultValue: change.newDefaultValue,
            optional: change.newDefaultValue !== undefined || parameters[index].optional
          };
        }
      }

      if (isToggleOptionalChange(change)) {
        const index = this.resolveParameterIndex(parameters, change.parameterNameOrIndex);
        if (index >= 0) {
          parameters[index] = { ...parameters[index], optional: change.optional };
        }
      }
    }

    return {
      ...signature,
      parameters
    };
  }

  /**
   * 解析參數索引
   */
  private resolveParameterIndex(parameters: readonly ParameterDefinition[], nameOrIndex: string | number): number {
    if (typeof nameOrIndex === 'number') {
      return nameOrIndex >= 0 && nameOrIndex < parameters.length ? nameOrIndex : -1;
    }
    return parameters.findIndex(p => p.name === nameOrIndex);
  }
}

/**
 * 建立 SignatureTransformer 實例
 */
export function createSignatureTransformer(): SignatureTransformer {
  return new SignatureTransformer();
}
