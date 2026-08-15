/**
 * R18（缺陷）：resolveTargetBindings 的具名 import 迴圈（change-signature-engine.ts
 * 約 1490-1500 行）先前只接受 `spec.name === name`（consumer import 的名稱必須
 * 與目標函式自身宣告名稱完全相同）才會進一步呼叫 moduleExposesTargetFunction，
 * 且 parseReexportForwards（約 1820-1830 行）先前只收未被 alias 改名的具名轉發
 * （`export { fn as alias } from './source'` 因 propertyName 存在而被整筆排除）。
 *
 * 因此 barrel 對外改名（`export { fn as alias } from './source'`）後，consumer
 * `import { alias } from './barrel'` 這種合法、常見的 re-export 別名寫法，會在
 * 兩層都被排除：consumer 的具名 import 名稱 alias 不等於目標名 fn（第一層排除），
 * 且即使放行，barrel 的轉發清單也不會有 alias 的紀錄（第二層排除）。
 *
 * 業務後果：對 fn 做 reorder-parameters 時，透過 barrel alias re-export 的消費端
 * 呼叫點完全沒被掃描到、引數順序沒有跟著更新，產生「定義已改、呼叫端沒跟著改」
 * 的靜默壞碼。
 */
import { describe, expect, it } from 'vitest';
import { ChangeSignatureEngine } from '@core/change-signature/change-signature-engine.js';
import { SignatureChangeType, type ChangeSignatureOptions } from '@core/change-signature/types.js';
import { ParserRegistry, initializeDefaultParsers } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('barrel 對外改名的 re-export 消費端呼叫點應被找到（adversarial R18）', () => {
  it('reorder-parameters 應改寫透過 barrel alias re-export 匯入的消費端呼叫點', async () => {
    const sourcePath = '/src/source.ts';
    const barrelPath = '/src/barrel.ts';
    const consumerPath = '/src/consumer.ts';

    const fs = new MemFileSystem();
    await fs.fromJSON({
      [sourcePath]: [
        'export function fn(a: number, b: number): number {',
        '  return a - b;',
        '}',
        ''
      ].join('\n'),
      [barrelPath]: [
        'export { fn as alias } from \'./source\';',
        ''
      ].join('\n'),
      [consumerPath]: [
        'import { alias } from \'./barrel\';',
        '',
        'alias(1, 2);',
        ''
      ].join('\n')
    });

    if (ParserRegistry.getInstance().isDisposed) { ParserRegistry.resetInstance(); }
    const reg = ParserRegistry.getInstance();
    initializeDefaultParsers(reg);

    const engine = new ChangeSignatureEngine(reg, fs);
    const options: ChangeSignatureOptions = {
      filePath: sourcePath,
      functionName: 'fn',
      projectRoot: '/src',
      targetFiles: [sourcePath, barrelPath, consumerPath],
      changes: [
        { type: SignatureChangeType.ReorderParameters, newOrder: ['b', 'a'] }
      ]
    };

    const result = await engine.changeSignature(options);

    expect(result.success).toBe(true);

    const consumerUpdate = result.callSiteUpdates.find(update => update.filePath === consumerPath);
    expect(consumerUpdate).toBeDefined();
    expect(consumerUpdate?.newCode).toBe('alias(2, 1)');
  });
});
