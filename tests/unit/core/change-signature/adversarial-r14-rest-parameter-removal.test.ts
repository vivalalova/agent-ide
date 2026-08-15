/**
 * R14（缺陷）：移除 rest 參數時，call-site-updater.mapCallSiteArguments 的
 * 「保留尾端多餘引數」邏輯（約 489-496 行）無條件保留超出宣告固定參數個數的
 * 尾端引數，未檢查該尾端引數原本對應的 rest 參數是否正是這次被 remove 的目標。
 *
 * `function f(a, ...rest) {}`，移除 `...rest` 後呼叫 `f(1, 2, 3)` 應變成
 * `f(1)`（只留下 a 的引數），但現行為誤留一個引數變成 `f(1, 3)`。
 *
 * 業務後果：rest 參數整批被移除卻沒把對應的呼叫端引數整批清掉，留下一個
 * 語意錯誤、多餘的孤兒引數。
 */
import { describe, expect, it } from 'vitest';

import { CallSiteUpdater } from '@core/change-signature/call-site-updater.js';
import {
  SignatureChangeType,
  type FunctionSignature,
  type SignatureChange
} from '@core/change-signature/types.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Location, Range } from '@shared/types/core.js';

const range: Range = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 }
};

const location: Location = {
  filePath: '/workspace/source.ts',
  range
};

function createSignature(parameters: FunctionSignature['parameters']): FunctionSignature {
  return {
    name: 'f',
    parameters,
    location,
    isMethod: false,
    modifiers: []
  };
}

function createCallSite(argumentValues: readonly string[]): CallSite {
  return {
    functionName: 'f',
    location,
    arguments: argumentValues.map((value, index) => ({
      index,
      value,
      range
    })),
    isMethodCall: false
  };
}

describe('CallSiteUpdater rest 參數移除（adversarial R14）', () => {
  it('移除 rest 參數時應丟棄所有原本對應 rest 的尾端引數，不留孤兒引數', () => {
    const updater = new CallSiteUpdater({} as IFileSystem, {} as ParserRegistry);
    const originalSignature = createSignature([
      { name: 'a', optional: false, rest: false, range },
      { name: 'rest', optional: false, rest: true, range }
    ]);
    const changes: SignatureChange[] = [
      { type: SignatureChangeType.RemoveParameter, parameterNameOrIndex: 'rest' }
    ];

    const mapping = updater.createParameterMapping(originalSignature, originalSignature, changes);
    const updatedArguments = updater.mapCallSiteArguments(
      createCallSite(['1', '2', '3']),
      mapping,
      changes,
      originalSignature
    );

    expect(updatedArguments).toEqual(['1']);
  });

  it('rest 參數未被移除時仍保留全部尾端多餘引數（既有行為不受影響）', () => {
    const updater = new CallSiteUpdater({} as IFileSystem, {} as ParserRegistry);
    const originalSignature = createSignature([
      { name: 'a', optional: false, rest: false, range },
      { name: 'rest', optional: false, rest: true, range }
    ]);
    const changes: SignatureChange[] = [];

    const mapping = updater.createParameterMapping(originalSignature, originalSignature, changes);
    const updatedArguments = updater.mapCallSiteArguments(
      createCallSite(['1', '2', '3']),
      mapping,
      changes,
      originalSignature
    );

    expect(updatedArguments).toEqual(['1', '2', '3']);
  });
});
