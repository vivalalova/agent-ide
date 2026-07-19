/**
 * CLI move-member - class-only shape 搬到模組層級應 fast-fail（P2 回歸）
 *
 * 缺陷：move 成員模式搬 class 的 getter（`get value(): number {...}`）或
 * static 方法到另一個非 class 目標檔時，命令原樣落地 class-only 語法
 * （裸 get/static 關鍵字＋失去 this context），目的檔產生語法錯誤
 * （實測 tsc 回報 TS1434/TS1005），但 CLI 仍 exit 0、success:true。
 *
 * 目標語意：搬移目標成員為 accessor（get/set）或 static method 等
 * 「無法以模組層級宣告獨立存在」的 class-only 形狀、且目標位置非 class 時，
 * 命令應 fast-fail（success:false、error 說明該成員形狀不支援搬到模組層級／
 * 建議 --target-class），且不寫任何檔案（來源、目標內容皆維持搬移前原樣）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

const BOX_SOURCE = `export class Box {
  private _value: number = 1;

  get value(): number {
    return this._value;
  }

  static create(): Box {
    return new Box();
  }

  normal(): number {
    return this._value;
  }
}

export function helper(): string {
  return 'helper';
}
`;

const TARGET_ORIGINAL = `export const existing = 1;
`;

describe('CLI move-member - class-only shape 搬到模組層級 fast-fail', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
    await fixture.writeFile('src/box.ts', BOX_SOURCE);
    await fixture.writeFile('src/target.ts', TARGET_ORIGINAL);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('getter 搬到模組層級目標檔應 fast-fail，且不寫入任何檔案', async () => {
    // `get value(): number {` 位於 box.ts 第 4 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/box.ts')}:4`, fixture.getFilePath('src/target.ts'),
        '-p', fixture.rootPath, '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(output.error ?? JSON.stringify(output)).toMatch(/getter|accessor|get\/set|class/i);

    const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/box.ts'), 'utf-8') as string;
    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target.ts'), 'utf-8') as string;
    expect(sourceContent).toBe(BOX_SOURCE);
    expect(targetContent).toBe(TARGET_ORIGINAL);
  });

  it('static 方法搬到模組層級目標檔應 fast-fail，且不寫入任何檔案', async () => {
    // `static create(): Box {` 位於 box.ts 第 8 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/box.ts')}:8`, fixture.getFilePath('src/target.ts'),
        '-p', fixture.rootPath, '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(output.error ?? JSON.stringify(output)).toMatch(/static|class/i);

    const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/box.ts'), 'utf-8') as string;
    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target.ts'), 'utf-8') as string;
    expect(sourceContent).toBe(BOX_SOURCE);
    expect(targetContent).toBe(TARGET_ORIGINAL);
  });

  it('對照組：普通模組層級函式搬移仍應照常成功', async () => {
    // `export function helper()` 位於 box.ts 第 18 行，非 class 成員，
    // 不受 class-only 形狀限制，搬移應維持現行成功行為
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/box.ts')}:18`, fixture.getFilePath('src/target.ts'),
        '-p', fixture.rootPath, '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/box.ts'), 'utf-8') as string;
    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target.ts'), 'utf-8') as string;
    expect(sourceContent).not.toContain('helper');
    expect(targetContent).toContain('helper');
  });
});
