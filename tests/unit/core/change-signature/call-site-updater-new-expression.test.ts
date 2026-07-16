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
import type { Range } from '@shared/types/core.js';

/**
 * Regression：parentheseless `new Foo`（無括號建構子呼叫，等同 `new Foo()`）新增參數時，
 * extractCallPrefix 的 fallback 分支（無括號可比對）誤以 `${callSite.functionName}(` 重建前綴，
 * 導致 `new` 關鍵字整個被丟棄，把建構子呼叫改寫成一般函式呼叫（執行期會噴
 * "class constructor cannot be invoked without new"）。
 */
describe('CallSiteUpdater - parentheseless new-expression call site', () => {
  function rangeOfSubstring(content: string, substring: string): Range {
    const index = content.indexOf(substring);
    if (index < 0) {
      throw new Error(`substring not found: ${substring}`);
    }
    return {
      start: { line: 1, column: index + 1 },
      end: { line: 1, column: index + substring.length + 1 }
    };
  }

  function makeFileSystem(content: string): IFileSystem {
    return {
      readFile: async () => content
    } as unknown as IFileSystem;
  }

  it('rewrites `new Foo` (no parens) to `new Foo(1)`, preserving `new`', async () => {
    const filePath = '/workspace/source.ts';
    const content = 'const x = new Foo;\n';
    const callSiteRange = rangeOfSubstring(content, 'new Foo');

    const updater = new CallSiteUpdater(makeFileSystem(content), {} as ParserRegistry);

    const originalSignature: FunctionSignature = {
      name: 'Foo',
      parameters: [],
      location: { filePath, range: callSiteRange },
      isMethod: false,
      modifiers: []
    };

    const changes: SignatureChange[] = [{
      type: SignatureChangeType.AddParameter,
      name: 'value',
      parameterType: 'string',
      defaultValue: '1',
      callSiteValue: '1',
      optional: false,
      position: -1
    }];

    const newSignature: FunctionSignature = {
      ...originalSignature,
      parameters: [{ name: 'value', optional: false, rest: false, range: callSiteRange }]
    };

    const callSite: CallSite = {
      functionName: 'Foo',
      location: { filePath, range: callSiteRange },
      arguments: [],
      isMethodCall: false,
      isNewExpression: true
    };

    const updates = await updater.generateCallSiteUpdates(
      [callSite],
      originalSignature,
      newSignature,
      changes
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].newCode).toBe('new Foo(1)');
    expect(updates[0].newCode).not.toBe('Foo(1)');
  });
});
