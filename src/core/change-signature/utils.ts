/**
 * Change Signature 共用工具函式
 */

import type { ParameterDefinition } from './types.js';

/**
 * 標記省略的可選參數
 * 用於在參數映射過程中標記被省略的可選參數位置
 */
export const OMITTED_PARAMETER_MARKER = '\0OMITTED\0';

/**
 * 解析參數索引
 * 根據名稱或索引找到參數在列表中的位置
 *
 * @param parameters - 參數定義列表
 * @param nameOrIndex - 參數名稱或索引
 * @returns 參數索引，找不到時返回 -1
 */
export function resolveParameterIndex(
  parameters: readonly Pick<ParameterDefinition, 'name'>[],
  nameOrIndex: string | number
): number {
  if (typeof nameOrIndex === 'number') {
    return nameOrIndex >= 0 && nameOrIndex < parameters.length ? nameOrIndex : -1;
  }
  return parameters.findIndex(p => p.name === nameOrIndex);
}
