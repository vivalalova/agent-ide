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
import * as ts from 'typescript';
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
import { SignatureTransformer } from './signature-transformer.js';

/**
 * Signature Validator
 * 驗證簽名變更的合法性
 */
export class SignatureValidator {
  private readonly transformer = new SignatureTransformer();

  /**
   * 驗證變更
   *
   * 每個 change 依對照「此 change 之前所有 change 依序套用後」的當下參數列表驗證，
   * 非固定對照最初的原始簽名——例如 `[remove c, reorder b,a]` 套用到 `(a,b,c)`：
   * reorder 應對照移除 c 後的 `(a,b)` 驗證（合法），而非原始三參數列表（會誤判為
   * 「未包含全部參數」）。與 transformer 產生最終簽名共用同一套 splice 邏輯
   * （Single Source of Truth），只套用到第 i 步為止。
   */
  validateChanges(signature: FunctionSignature, changes: readonly SignatureChange[]): ChangeSignatureValidationError[] {
    const errors: ChangeSignatureValidationError[] = [];

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const currentSignature = this.transformer.applyChangesToSignature(signature, changes.slice(0, i));
      const currentParameterNames = new Set(currentSignature.parameters.map(p => p.name));

      if (isAddParameterChange(change)) {
        if (currentParameterNames.has(change.name)) {
          errors.push({
            code: ChangeSignatureErrorCode.DuplicateParameterName,
            message: `參數名稱重複: ${change.name}`,
            parameterName: change.name
          });
        }

        // 驗證新增參數必須有 function default；呼叫點值不能替代簽名預設值。
        // 用 === undefined 判斷「未提供」，避免空字串（若為合法運算式文字則是合法
        // 預設值）被誤判為缺漏
        if (change.defaultValue === undefined) {
          errors.push({
            code: ChangeSignatureErrorCode.MissingDefaultValue,
            message: `參數 ${change.name} 缺少 function default，請使用 --add name:type=default 指定`,
            parameterName: change.name
          });
        } else {
          const invalidDefaultValueError = this.validateDefaultValueText(change.defaultValue, change.name);
          if (invalidDefaultValueError) {
            errors.push(invalidDefaultValueError);
          }
        }
      }

      if (isRemoveParameterChange(change)) {
        const targetName = this.resolveParameterName(currentSignature, change.parameterNameOrIndex);
        if (!targetName || !currentParameterNames.has(targetName)) {
          errors.push({
            code: ChangeSignatureErrorCode.ParameterNotFound,
            message: `找不到參數: ${change.parameterNameOrIndex}`,
            parameterName: String(change.parameterNameOrIndex)
          });
        }
      }

      if (isReorderParametersChange(change)) {
        for (const nameOrIndex of change.newOrder) {
          const targetName = this.resolveParameterName(currentSignature, nameOrIndex);
          if (!targetName || !currentParameterNames.has(targetName)) {
            errors.push({
              code: ChangeSignatureErrorCode.ParameterNotFound,
              message: `找不到參數: ${nameOrIndex}`,
              parameterName: String(nameOrIndex)
            });
          }
        }

        // 應涵蓋的參數數 = 原始簽名參數數 - 目前為止已套用的 remove 數，非
        // currentSignature.parameters.length：後者若先前有 --add，會多算進新增
        // 參數，但 newOrder 本就不必（也不該）列出新增參數名稱——
        // signature-transformer.ts 的實際套用邏輯早已容忍此情況（明確保留未被
        // newOrder 指名的參數，見其註解「例如先前 --add 新增的」），驗證邏輯
        // 應與之一致，否則 --add 與 --reorder 併用會被誤判為「未包含全部參數」
        const removedSoFar = changes.slice(0, i).filter(isRemoveParameterChange).length;
        const requiredCount = signature.parameters.length - removedSoFar;
        if (change.newOrder.length !== requiredCount) {
          errors.push({
            code: ChangeSignatureErrorCode.InvalidParameterOrder,
            message: '重新排序必須包含所有參數'
          });
        }

        // 驗證可選參數順序：可選參數必須在必選參數之後
        const optionalOrderError = this.validateOptionalParameterOrder(currentSignature, change.newOrder);
        if (optionalOrderError) {
          errors.push(optionalOrderError);
        }
      }

      if (isChangeParameterTypeChange(change) || isRenameParameterChange(change) ||
          isChangeDefaultValueChange(change) || isToggleOptionalChange(change)) {
        const targetName = this.resolveParameterName(currentSignature, change.parameterNameOrIndex);
        if (!targetName || !currentParameterNames.has(targetName)) {
          errors.push({
            code: ChangeSignatureErrorCode.ParameterNotFound,
            message: `找不到參數: ${change.parameterNameOrIndex}`,
            parameterName: String(change.parameterNameOrIndex)
          });
        } else if (isChangeDefaultValueChange(change) && change.newDefaultValue !== undefined) {
          // newDefaultValue === undefined 代表移除預設值（合法操作），非「未提供」；
          // 有提供文字時比照新增參數，套用同一份空白/空字串驗證（Single Source of Truth）
          const invalidDefaultValueError = this.validateDefaultValueText(change.newDefaultValue, targetName);
          if (invalidDefaultValueError) {
            errors.push(invalidDefaultValueError);
          }
        }
      }

      if (isRenameParameterChange(change)) {
        const currentTargetName = this.resolveParameterName(currentSignature, change.parameterNameOrIndex);
        if (currentParameterNames.has(change.newName) && change.newName !== currentTargetName) {
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
   * 驗證預設值文字本身是否為合法運算式文字。
   *
   * 把文字放進函式參數 default 的語法位置後交給 TypeScript parser，避免手刻
   * expression grammar 漏掉括號、箭頭、物件等合法形狀，也能在 codegen 前攔截
   * `foo +` 這類 parse diagnostics。與「未提供預設值」（MissingDefaultValue，用
   * `=== undefined` 判斷）是不同語意，需獨立回報為 InvalidDefaultValue。
   */
  private validateDefaultValueText(
    defaultValue: string,
    parameterName: string
  ): ChangeSignatureValidationError | null {
    const sourceFile = ts.createSourceFile(
      'change-signature-default-value.ts',
      `function __validateDefaultValue(__value = ${defaultValue}) {}`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    // parseDiagnostics 是 TS 編譯器內部屬性，未收錄於公開型別定義，需斷言存取
    const diagnostic = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics[0];
    if (diagnostic) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      return {
        code: ChangeSignatureErrorCode.InvalidDefaultValue,
        message: `參數 ${parameterName} 的預設值不是合法 TypeScript 運算式: ${message}`,
        parameterName
      };
    }
    return null;
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
   * 驗證 rest 參數是否位於參數列表最後。TypeScript 規則：rest 參數必須是最後一個
   * 參數，置於非最後位置是無效語法。此檢查作用於「變更後」的最終參數列表（由呼叫端
   * 傳入 transformer 運算後的結果），無論觸發原因是 reorder、add 或其他變更組合皆
   * 一併涵蓋，不需在各變更類型分支各自模擬一套順序邏輯。
   */
  validateRestParameterIsLast(
    parameters: readonly ParameterDefinition[]
  ): ChangeSignatureValidationError | null {
    const restIndex = parameters.findIndex(p => p.rest);
    if (restIndex >= 0 && restIndex !== parameters.length - 1) {
      return {
        code: ChangeSignatureErrorCode.RestParameterNotLast,
        message: `Rest 參數 '${parameters[restIndex].name}' 必須位於參數列表最後`,
        parameterName: parameters[restIndex].name
      };
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
