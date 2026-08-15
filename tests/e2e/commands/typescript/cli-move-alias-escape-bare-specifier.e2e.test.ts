/**
 * CLI move 命令 E2E 測試 - alias 逃逸產生裸 specifier（P1 regression）
 *
 * Bug: 當被移動的檔案原本落在 tsconfig paths alias 對應的根目錄內（如 '@models/*' -> 'src/models/*'），
 * 且新位置落在該 alias 根目錄「之外」（如 src/lib/），consumer 原本用 alias import（'@models/order.js'）
 * 匯入該檔案；現況實作把新 import 改寫成不合法的裸相對路徑字串（如 'src/lib/order.js'，缺 './'/'../' 前綴），
 * ESM runtime 無法解析這種 specifier（會被當成 bare module specifier 去 node_modules 找，直接 MODULE_NOT_FOUND）。
 *
 * 正確行為：跳脫 alias 根目錄後，新 import 必須是合法的相對路徑（'./...' 或 '../...'），
 * 或維持其他可解析形式；不得產生缺少 './'/'../' 前綴的裸路徑字串。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - alias 逃逸至根目錄外不應產生裸 specifier', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');

    // tsconfig：baseUrl '.' + '@models/*' -> 'src/models/*'
    await fixture.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@models/*': ['src/models/*'],
        },
      },
    }, null, 2));
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('單檔案移出 alias 根目錄：新 import 須為合法相對路徑，不得是裸 src/ 開頭字串', async () => {
    // Given: src/models/order.ts 在 alias 根目錄內，consumer 用 '@models/order.js' 匯入
    await fixture.writeFile('src/models/order.ts', `
export interface Order {
  id: string;
}
`);
    await fixture.writeFile('src/consumers/order-consumer.ts', `
import { Order } from '@models/order.js';

export function describeOrder(order: Order): string {
  return order.id;
}
`);

    // When: 把 src/models/order.ts 移到 alias 根目錄外的 src/lib/order.ts
    const result = await executeCLI(
      [
        'move',
        'src/models/order.ts',
        'src/lib/order.ts',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerContent = await fixture.readFile('src/consumers/order-consumer.ts');
    const importMatch = consumerContent.match(/from\s+'([^']+)'/);
    expect(importMatch).not.toBeNull();
    const newSpecifier = importMatch![1];

    // 正確：合法相對路徑（'./' 或 '../' 開頭）
    expect(
      newSpecifier.startsWith('./') || newSpecifier.startsWith('../')
    ).toBe(true);
    // 現況缺陷：改寫成裸的 'src/lib/order.js'（缺 './'/'../' 前綴，ESM 解析不了）
    expect(newSpecifier.startsWith('src/')).toBe(false);
  });

  it('glob 移出 alias 根目錄：新 import 同樣須為合法相對路徑', async () => {
    // Given: src/models/invoice.ts 在 alias 根目錄內，consumer 用 '@models/invoice.js' 匯入
    await fixture.writeFile('src/models/invoice.ts', `
export interface Invoice {
  id: string;
}
`);
    await fixture.writeFile('src/consumers/invoice-consumer.ts', `
import { Invoice } from '@models/invoice.js';

export function describeInvoice(invoice: Invoice): string {
  return invoice.id;
}
`);

    // When: 用 glob 把 src/models/*.ts 移到 alias 根目錄外的 src/lib/
    const result = await executeCLI(
      [
        'move',
        'src/models/*.ts',
        'src/lib/',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerContent = await fixture.readFile('src/consumers/invoice-consumer.ts');
    const importMatch = consumerContent.match(/from\s+'([^']+)'/);
    expect(importMatch).not.toBeNull();
    const newSpecifier = importMatch![1];

    expect(
      newSpecifier.startsWith('./') || newSpecifier.startsWith('../')
    ).toBe(true);
    expect(newSpecifier.startsWith('src/')).toBe(false);
  });
});
