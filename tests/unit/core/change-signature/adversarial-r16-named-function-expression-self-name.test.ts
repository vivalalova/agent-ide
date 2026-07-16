/**
 * R16（缺陷）：change-signature-engine 的參數引用遮蔽掃描
 * （collectFunctionLevelShadowedNames，約 838-870 行）只把函式參數與 body 內
 * var 宣告當成該函式層的遮蔽名稱，未把具名 function expression／class expression
 * 自身的名稱（`const fn = function value() {}` 或 `const C = class value {}` 的
 * `value`）算進去——這個名稱是與外層完全獨立的自我遞迴繫結，只在該 expression
 * 內部（含自身識別字節點與 class 各成員）可見，即使與外層參數同名也只是遮蔽、
 * 不是同一個繫結的引用。
 *
 * `function outer(value) { const fn = function value() {}; return fn; }`：
 * 移除 outer 的參數 value 時，內層具名 function expression 自身的名稱 `value`
 * 被誤判為對外層參數 value 的引用，導致合法的移除被誤拒。class expression
 * （`const C = class value { m() { return value; } }`）同理。
 */
import { describe, expect, it } from 'vitest';
import { ChangeSignatureEngine } from '@core/change-signature/change-signature-engine.js';
import { SignatureChangeType, type ChangeSignatureOptions } from '@core/change-signature/types.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('具名 function expression 自身名稱不應算作外層參數引用（adversarial R16）', () => {
  it('移除 outer 的參數 value 應成功，內層同名具名 function expression 不算引用', async () => {
    const filePath = '/src/a.ts';
    const fs = new MemFileSystem();
    await fs.fromJSON({
      [filePath]: [
        'export function outer(value: number) {',
        '  const fn = function value() {',
        '    return 1;',
        '  };',
        '  return fn;',
        '}',
        ''
      ].join('\n')
    });

    if (ParserRegistry.getInstance().isDisposed) { ParserRegistry.resetInstance(); }
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const engine = new ChangeSignatureEngine(reg, fs);
    const options: ChangeSignatureOptions = {
      filePath,
      functionName: 'outer',
      projectRoot: '/src',
      targetFiles: [filePath],
      changes: [
        { type: SignatureChangeType.RemoveParameter, parameterNameOrIndex: 'value' }
      ]
    };

    const result = await engine.changeSignature(options);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('移除 outer 的參數 value 應成功，內層同名具名 class expression 不算引用', async () => {
    const filePath = '/src/b.ts';
    const fs = new MemFileSystem();
    await fs.fromJSON({
      [filePath]: [
        'export function outer(value: number) {',
        '  const C = class value {',
        '    m() {',
        '      return value;',
        '    }',
        '  };',
        '  return C;',
        '}',
        ''
      ].join('\n')
    });

    if (ParserRegistry.getInstance().isDisposed) { ParserRegistry.resetInstance(); }
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const engine = new ChangeSignatureEngine(reg, fs);
    const options: ChangeSignatureOptions = {
      filePath,
      functionName: 'outer',
      projectRoot: '/src',
      targetFiles: [filePath],
      changes: [
        { type: SignatureChangeType.RemoveParameter, parameterNameOrIndex: 'value' }
      ]
    };

    const result = await engine.changeSignature(options);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
