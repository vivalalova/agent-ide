/**
 * Signature Validator
 * 負責簽名變更的驗證邏輯
 */

import type {
  FunctionSignature,
  ParameterDefinition,
  SignatureChange,
  ChangeSignatureValidationError
} from './types.js';
import {
  ChangeSignatureErrorCode,
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange,
  isChangeParameterTypeChange,
  isRenameParameterChange,
  isChangeDefaultValueChange,
  isToggleOptionalChange
} from './types.js';
import { resolveParameterIndex } from './utils.js';

/**
 * Signature Validator
 * 驗證簽名變更的合法性
 */
export class SignatureValidator {
  /**
   * 驗證變更
   */
  validateChanges(signature: FunctionSignature, changes: readonly SignatureChange[]): ChangeSignatureValidationError[] {
    const errors: ChangeSignatureValidationError[] = [];
    const parameterNames = new Set(signature.parameters.map(p => p.name));
    const newParameterNames = new Set(parameterNames);

    for (const change of changes) {
      if (isAddParameterChange(change)) {
        if (newParameterNames.has(change.name)) {
          errors.push({
            code: ChangeSignatureErrorCode.DuplicateParameterName,
            message: `參數名稱重複: ${change.name}`,
            parameterName: change.name
          });
        } else {
          newParameterNames.add(change.name);
        }

        // 驗證新增參數必須有 function default；呼叫點值不能替代簽名預設值。
        if (!change.defaultValue) {
          errors.push({
            code: ChangeSignatureErrorCode.MissingDefaultValue,
            message: `參數 ${change.name} 缺少 function default，請使用 --add name:type=default 指定`,
            parameterName: change.name
          });
        }
      }

      if (isRemoveParameterChange(change)) {
        const targetName = this.resolveParameterName(signature, change.parameterNameOrIndex);
        if (!targetName || !parameterNames.has(targetName)) {
          errors.push({
            code: ChangeSignatureErrorCode.ParameterNotFound,
            message: `找不到參數: ${change.parameterNameOrIndex}`,
            parameterName: String(change.parameterNameOrIndex)
          });
        } else {
          newParameterNames.delete(targetName);
        }
      }

      if (isReorderParametersChange(change)) {
        for (const nameOrIndex of change.newOrder) {
          const targetName = this.resolveParameterName(signature, nameOrIndex);
          if (!targetName || !parameterNames.has(targetName)) {
            errors.push({
              code: ChangeSignatureErrorCode.ParameterNotFound,
              message: `找不到參數: ${nameOrIndex}`,
              parameterName: String(nameOrIndex)
            });
          }
        }

        if (change.newOrder.length !== signature.parameters.length) {
          errors.push({
            code: ChangeSignatureErrorCode.InvalidParameterOrder,
            message: '重新排序必須包含所有參數'
          });
        }

        // 驗證可選參數順序：可選參數必須在必選參數之後
        const optionalOrderError = this.validateOptionalParameterOrder(signature, change.newOrder);
        if (optionalOrderError) {
          errors.push(optionalOrderError);
        }
      }

      if (isChangeParameterTypeChange(change) || isRenameParameterChange(change) ||
          isChangeDefaultValueChange(change) || isToggleOptionalChange(change)) {
        const targetName = this.resolveParameterName(signature, change.parameterNameOrIndex);
        if (!targetName || !parameterNames.has(targetName)) {
          errors.push({
            code: ChangeSignatureErrorCode.ParameterNotFound,
            message: `找不到參數: ${change.parameterNameOrIndex}`,
            parameterName: String(change.parameterNameOrIndex)
          });
        }
      }

      if (isRenameParameterChange(change)) {
        if (newParameterNames.has(change.newName) && change.newName !== this.resolveParameterName(signature, change.parameterNameOrIndex)) {
          errors.push({
            code: ChangeSignatureErrorCode.DuplicateParameterName,
            message: `參數名稱重複: ${change.newName}`,
            parameterName: change.newName
          });
        }
      }
    }

    return errors;
  }

  /**
   * 驗證可選參數順序
   * TypeScript 規則：可選參數必須在所有必選參數之後
   * 例外：有預設值的參數視為可選，rest 參數必須在最後
   */
  validateOptionalParameterOrder(
    signature: FunctionSignature,
    newOrder: readonly (string | number)[]
  ): ChangeSignatureValidationError | null {
    // 根據新順序建立參數列表
    const reorderedParams: ParameterDefinition[] = [];
    for (const nameOrIndex of newOrder) {
      const index = resolveParameterIndex(signature.parameters, nameOrIndex);
      if (index >= 0) {
        reorderedParams.push(signature.parameters[index]);
      }
    }

    // 檢查可選參數是否在必選參數之前
    let foundOptional = false;
    let firstOptionalParam: ParameterDefinition | null = null;

    for (const param of reorderedParams) {
      const isOptional = param.optional || param.defaultValue !== undefined;
      const isRest = param.rest;

      if (isOptional && !isRest) {
        foundOptional = true;
        if (!firstOptionalParam) {
          firstOptionalParam = param;
        }
      } else if (!isOptional && !isRest && foundOptional && firstOptionalParam) {
        // 找到必選參數在可選參數之後
        return {
          code: ChangeSignatureErrorCode.OptionalBeforeRequired,
          message: `可選參數 '${firstOptionalParam.name}' 不能位於必選參數 '${param.name}' 之前`,
          parameterName: param.name
        };
      }
    }

    return null;
  }

  /**
   * 解析參數名稱
   */
  resolveParameterName(signature: FunctionSignature, nameOrIndex: string | number): string | undefined {
    if (typeof nameOrIndex === 'number') {
      return signature.parameters[nameOrIndex]?.name;
    }
    return signature.parameters.find(p => p.name === nameOrIndex)?.name;
  }
}

/**
 * 建立 SignatureValidator 實例
 */
export function createSignatureValidator(): SignatureValidator {
  return new SignatureValidator();
}
