/**
 * R17（缺陷）：collectTopLevelFunctionCallSites（change-signature-engine.ts 約
 * 1540-1560 行）以 symbolFinder.findCallSitesInFile(file, localName) 純語法比對
 * 檔案內所有同名呼叫，未排除被檔案內區域繫結（如同名函式參數）遮蔽的呼叫點。
 *
 * consumer.ts import 目標函式 `t`，同檔內另有一個函式參數也叫 `t`（在該函式
 * body 內遮蔽了 import）。change-signature 對匯入的 `t` 做 reorder-parameters
 * 時，會誤把該函式 body 內對區域參數 `t` 的呼叫也當成對匯入目標的呼叫點改寫，
 * 但那個呼叫實際上引用的是區域參數，與匯入的目標函式無關。
 *
 * 正確契約：只有模組層級、真正引用匯入 `t` 的呼叫點該被改寫；被區域參數遮蔽
 * 的呼叫點應完全跳過，不出現在 callSiteUpdates 裡。
 */
import { describe, expect, it } from 'vitest';
import { ChangeSignatureEngine } from '@core/change-signature/change-signature-engine.js';
import { SignatureChangeType, type ChangeSignatureOptions } from '@core/change-signature/types.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('被區域參數遮蔽的匯入呼叫點不應被改寫（adversarial R17）', () => {
  it('reorder-parameters 只改寫真正引用匯入 t 的呼叫點，跳過被區域參數 t 遮蔽的呼叫', async () => {
    const targetPath = '/src/target.ts';
    const consumerPath = '/src/consumer.ts';

    const fs = new MemFileSystem();
    await fs.fromJSON({
      [targetPath]: [
        'export function t(a: number, b: number): number {',
        '  return a - b;',
        '}',
        ''
      ].join('\n'),
      [consumerPath]: [
        'import { t } from \'./target\';',
        '',
        'export function wrapper(t: (x: number, y: number) => number): number {',
        '  return t(1, 2);',
        '}',
        '',
        't(3, 4);',
        ''
      ].join('\n')
    });

    if (ParserRegistry.getInstance().isDisposed) { ParserRegistry.resetInstance(); }
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const engine = new ChangeSignatureEngine(reg, fs);
    const options: ChangeSignatureOptions = {
      filePath: targetPath,
      functionName: 't',
      projectRoot: '/src',
      targetFiles: [targetPath, consumerPath],
      changes: [
        { type: SignatureChangeType.ReorderParameters, newOrder: ['b', 'a'] }
      ]
    };

    const result = await engine.changeSignature(options);

    expect(result.success).toBe(true);

    const consumerUpdates = result.callSiteUpdates.filter(update => update.filePath === consumerPath);
    expect(consumerUpdates).toHaveLength(1);
    expect(consumerUpdates[0].originalCode).toBe('t(3, 4)');
    expect(consumerUpdates[0].newCode).toBe('t(4, 3)');

    // 被區域參數 t 遮蔽的呼叫（wrapper body 內的 t(1, 2)）不應出現在改寫清單中
    const shadowedCallRewritten = consumerUpdates.some(update => update.originalCode === 't(1, 2)');
    expect(shadowedCallRewritten).toBe(false);
  });
});
