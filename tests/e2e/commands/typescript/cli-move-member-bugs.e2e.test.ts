/**
 * CLI move-member 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * C7：Unicode（中文）命名的 method 按位置移動時，range-finder 定位到整個
 *     class 而非該 method，導致整個 class（含其他 method）被搬走。
 * C8：搬移的成員引用同檔案內小寫命名的模組級變數時，reference-updater 沒有
 *     幫目標檔補上對應 import，導致目標檔的成員引用未定義變數。
 * C9：搬移成員後，來源檔內只在字串常量裡「提到」成員名稱的地方被誤判為
 *     真實引用，被加上一個指向目標檔的無效 import（目標檔並未 export 該名稱）。
 * C10：生成的相對路徑 import 缺少 .js 副檔名，與專案其餘 ESM 風格的
 *     import（皆帶 .js）不一致。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（C7-C10）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('C7：Unicode 命名 method 按位置移動到既有目標類別時，只應搬走該 method，class 與其他 method 留在原檔', async () => {
    await fixture.writeFile('src/svc.ts', `export class Service {
  取得資料(): string {
    return 'data';
  }

  keep(): number {
    return 1;
  }
}
`);
    // 目標檔需有既有 class 承接成員（--target-class），
    // 搬到模組層級對一般 instance method 會產生非法 TS 輸出（另案處理），
    // 這裡改用合法目標以保留 C7 原本要防的「range-finder 誤把整個 class
    // 當成移動範圍」regression。
    await fixture.writeFile('src/helpers.ts', `export class Helper {
  existing(): boolean {
    return true;
  }
}
`);

    // 取得資料 method 在第 2 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/svc.ts')}:2`, fixture.getFilePath('src/helpers.ts'),
        '-p', fixture.rootPath, '--target-class', 'Helper', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const helpersContent = await fixture.readFile('src/helpers.ts');
    // 正確行為：只有 取得資料 method 被搬到 Helper class 內
    expect(helpersContent).toContain('取得資料');
    expect(helpersContent).toContain('class Helper');
    expect(helpersContent).toContain('existing');
    // 目前的壞行為（若復發）：range-finder 把整個 class 都當成移動範圍，keep 也會被一併搬走
    expect(helpersContent).not.toContain('keep');
    expect(helpersContent).not.toContain('class Service');

    const svcContent = await fixture.readFile('src/svc.ts');
    // 正確行為：Service class 與 keep method 應留在原檔
    expect(svcContent).toContain('class Service');
    expect(svcContent).toContain('keep');
    // 取得資料 已被搬走，不應殘留在來源檔
    expect(svcContent).not.toContain('取得資料');
  });

  it('C8：搬移成員引用同檔案小寫模組級變數時，目標檔應補上對該變數的 import', async () => {
    await fixture.writeFile('src/utils.ts', `export const rate = 5;

export function calc(n: number): number {
  return n * rate;
}
`);
    await fixture.writeFile('src/pricing.ts', `export const label = 'price';
`);

    // calc 在第 3 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/utils.ts')}:3`, fixture.getFilePath('src/pricing.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const pricingContent = await fixture.readFile('src/pricing.ts');
    expect(pricingContent).toContain('calc');
    // 正確行為：pricing.ts 需要從 utils.ts import rate，calc 才能解析該識別符
    expect(pricingContent).toMatch(/import\s*\{[^}]*\brate\b[^}]*\}\s*from\s*['"]\.\/utils\.js['"]/);
  });

  it('C9：來源檔內僅存在於字串常量的成員名稱，不應被誤判為真實引用而加上無效 import', async () => {
    await fixture.writeFile('src/misc.ts', `function helper(): string {
  return 'h';
}

export const note = 'helper is internal';
`);
    await fixture.writeFile('src/dest.ts', `export const seed = 0;
`);

    // helper 在第 1 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/misc.ts')}:1`, fixture.getFilePath('src/dest.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const miscContent = await fixture.readFile('src/misc.ts');
    // note 字串裡的 "helper" 只是字面文字，不是真實引用；helper 在 dest.ts 也未被 export
    // 正確行為：不應生成任何指向 dest 的 helper import
    expect(miscContent).not.toMatch(/import\s*\{[^}]*\bhelper\b[^}]*\}\s*from\s*['"]\.\/dest(\.js)?['"]/);
    expect(miscContent).toContain('\'helper is internal\'');
  });

  it('C10：搬移成員後生成的相對 import 路徑應帶 .js 副檔名', async () => {
    await fixture.writeFile('src/rates.ts', `export const rate = 5;

export function calc(n: number): number {
  return n * rate;
}
`);
    await fixture.writeFile('src/prices.ts', `export const label = 'price';
`);

    // calc 在第 3 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/rates.ts')}:3`, fixture.getFilePath('src/prices.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const pricesContent = await fixture.readFile('src/prices.ts');
    // 正確行為：生成的 import 必須帶 .js 副檔名（專案其餘 import 皆為 './x.js' ESM 風格）
    expect(pricesContent).toMatch(/from\s*['"]\.\/rates\.js['"]/);
    // 目前的壞行為：生成的 import 缺 .js（'./rates' 而非 './rates.js'）
    expect(pricesContent).not.toMatch(/from\s*['"]\.\/rates['"]/);
  });
});
