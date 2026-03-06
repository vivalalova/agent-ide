/**
 * CLI move-member Edge Case E2E 測試
 * 專注 cli-move-position.e2e.test.ts 未覆蓋的 edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member - Edge Cases', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // ─── 實際執行驗證（非 dry-run）───

  describe('移動結果驗證', () => {
    it('移動後目標檔案包含被移動的成員', async () => {
      await fixture.writeFile('src/source.ts', `export function toMove(): string {
  return 'moved';
}

export function stay(): string {
  return 'stay';
}
`);
      await fixture.writeFile('src/target.ts', `export function existing(): void {}
`);

      // toMove 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target.ts'), 'utf-8') as string;
      expect(targetContent).toContain('toMove');
      expect(targetContent).toContain('existing');
    });

    it('移動後來源檔案不再包含被移動的成員', async () => {
      await fixture.writeFile('src/source.ts', `export function toMove(): string {
  return 'moved';
}

export function stay(): string {
  return 'stay';
}
`);
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/source.ts'), 'utf-8') as string;
      expect(sourceContent).not.toContain('toMove');
      expect(sourceContent).toContain('stay');
    });

    it('移動 async function 後目標檔案保留 async 關鍵字', async () => {
      await fixture.writeFile('src/async-source.ts', `export async function fetchData(id: number): Promise<string> {
  return Promise.resolve('data-' + id);
}

export function sync(): string {
  return 'sync';
}
`);
      await fixture.writeFile('src/async-target.ts', '');

      // fetchData 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/async-source.ts')}:1`, fixture.getFilePath('src/async-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/async-target.ts'), 'utf-8') as string;
      expect(targetContent).toContain('async');
      expect(targetContent).toContain('fetchData');
      expect(targetContent).toContain('Promise');
    });
  });

  // ─── 跨檔案成員依賴 ───

  describe('跨檔案成員依賴', () => {
    it('移動依賴同檔案 sibling export 的函式，目標檔產生對應 import', async () => {
      await fixture.writeFile('src/math-source.ts', `export function add(a: number, b: number): number {
  return a + b;
}

export function double(x: number): number {
  return add(x, x);
}
`);
      await fixture.writeFile('src/math-target.ts', '');

      // double 在第 5 行，依賴 add（第 1 行）
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/math-source.ts')}:5`, fixture.getFilePath('src/math-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/math-target.ts'), 'utf-8') as string;
      // double 被移到目標
      expect(targetContent).toContain('double');
      // 目標應有 import add 語句（非僅函式體的 add 字串）
      expect(targetContent).toMatch(/import\s*\{[^}]*add[^}]*\}\s*from/);
    });

    it('多個 consumer 引用被移動成員，所有 import 都更新', async () => {
      await fixture.writeFile('src/shared-fn.ts', `export function shared(): string {
  return 'shared';
}
`);
      await fixture.writeFile('src/consumer-a.ts', `import { shared } from './shared-fn';
export const a = shared();
`);
      await fixture.writeFile('src/consumer-b.ts', `import { shared } from './shared-fn';
export const b = shared();
`);
      await fixture.writeFile('src/new-home.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/shared-fn.ts')}:1`, fixture.getFilePath('src/new-home.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // totalFiles 應包含 new-home + shared-fn + consumer-a + consumer-b
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(3);

      const consumerA = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-a.ts'), 'utf-8') as string;
      const consumerB = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-b.ts'), 'utf-8') as string;
      // import 路徑應指向新位置
      expect(consumerA).toMatch(/from ['"].*new-home['"]/);
      expect(consumerB).toMatch(/from ['"].*new-home['"]/);
      // 舊路徑應已移除
      expect(consumerA).not.toMatch(/from ['"].*shared-fn['"]/);
      expect(consumerB).not.toMatch(/from ['"].*shared-fn['"]/);
    });

    it('移動一個成員不影響 consumer 中對其他成員的 import', async () => {
      await fixture.writeFile('src/multi-export.ts', `export function A(): string {
  return 'A';
}

export function B(): string {
  return 'B';
}

export function C(): string {
  return 'C';
}
`);
      await fixture.writeFile('src/multi-consumer.ts', `import { A, B, C } from './multi-export';
export const result = A() + B() + C();
`);
      await fixture.writeFile('src/move-target.ts', `export function existing(): void {}
`);

      // B 在第 5 行，移動 B 到 target
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/multi-export.ts')}:5`, fixture.getFilePath('src/move-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/multi-consumer.ts'), 'utf-8') as string;
      // B 的 import 應路由到 move-target
      expect(consumerContent).toMatch(/from ['"].*move-target['"]/);
      // A、C 的 import 應仍指向 multi-export
      expect(consumerContent).toMatch(/from ['"].*multi-export['"]/);
    });
  });

  // ─── JSDoc 保留 ───

  describe('JSDoc 保留', () => {
    it('移動帶有多行 JSDoc 的函式，目標檔保留文件註解', async () => {
      await fixture.writeFile('src/documented.ts', `/**
 * Formats a greeting message.
 * @param name - The person's name
 * @returns A greeting string
 */
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}
`);
      await fixture.writeFile('src/greetings.ts', '');

      // greet 在第 6 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/documented.ts')}:6`, fixture.getFilePath('src/greetings.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/greetings.ts'), 'utf-8') as string;
      expect(targetContent).toContain('greet');
      // JSDoc 應保留在目標檔案中
      expect(targetContent).toContain('Formats a greeting');

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/documented.ts'), 'utf-8') as string;
      // JSDoc 應從來源移除（非複製）
      expect(sourceContent).not.toContain('Formats a greeting');
    });

  });

  // ─── 名稱衝突偵測 ───

  describe('名稱衝突偵測', () => {
    it('目標檔已有同名函式時應報錯', async () => {
      await fixture.writeFile('src/conflict-source.ts', `export function duplicate(): string {
  return 'source version';
}
`);
      await fixture.writeFile('src/conflict-target.ts', `export function duplicate(): string {
  return 'target version';
}
`);

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/conflict-source.ts')}:1`, fixture.getFilePath('src/conflict-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });


    it('目標檔成員名稱不衝突時應正常移動（對照組）', async () => {
      await fixture.writeFile('src/no-conflict-source.ts', `export function foo(): string {
  return 'foo';
}
`);
      await fixture.writeFile('src/no-conflict-target.ts', `export function bar(): string {
  return 'bar';
}
`);

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/no-conflict-source.ts')}:1`, fixture.getFilePath('src/no-conflict-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/no-conflict-target.ts'), 'utf-8') as string;
      expect(targetContent).toContain('foo');
      expect(targetContent).toContain('bar');
    });
  });

  // ─── keepReexport 實際內容驗證 ───

  describe('--keep-reexport 實際行為', () => {
    it('--keep-reexport 後來源檔案應包含 re-export 語句', async () => {
      await fixture.writeFile('src/reexport-source.ts', `export function moved(): string {
  return 'I moved';
}

export function stays(): string {
  return 'I stay';
}
`);
      await fixture.writeFile('src/reexport-target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/reexport-source.ts')}:1`, fixture.getFilePath('src/reexport-target.ts'),
          '-p', fixture.rootPath, '--keep-reexport', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/reexport-source.ts'), 'utf-8') as string;
      // 來源檔案應有 re-export 語句（非殘留的函式定義）
      expect(sourceContent).toMatch(/export\s*\{[^}]*moved[^}]*\}\s*from/);
      expect(sourceContent).toContain('reexport-target');

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/reexport-target.ts'), 'utf-8') as string;
      expect(targetContent).toContain('moved');
    });
  });

  // ─── 邊界條件 ───

  describe('邊界條件', () => {
    it('移動來源檔案的唯一 export 後，來源檔案不含該函式', async () => {
      await fixture.writeFile('src/single-export.ts', `export function only(): string {
  return 'only one';
}
`);
      await fixture.writeFile('src/single-target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/single-export.ts')}:1`, fixture.getFilePath('src/single-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/single-export.ts'), 'utf-8') as string;
      expect(sourceContent).not.toContain('function only');

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/single-target.ts'), 'utf-8') as string;
      expect(targetContent).toContain('only');
    });

    it('consumer 引用唯一 export，移動後 consumer import 路徑更新', async () => {
      await fixture.writeFile('src/sole.ts', `export function sole(): void {}
`);
      await fixture.writeFile('src/sole-consumer.ts', `import { sole } from './sole';
sole();
`);
      await fixture.writeFile('src/sole-dest.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/sole.ts')}:1`, fixture.getFilePath('src/sole-dest.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/sole-consumer.ts'), 'utf-8') as string;
      expect(consumerContent).toMatch(/from ['"].*sole-dest['"]/);
      // 舊的 './sole' import 應已更新（不完全匹配 sole-dest）
      expect(consumerContent).not.toMatch(/from ['"]\.\/sole['"]/);
    });

    it('移動多行 const 物件後目標檔包含完整定義', async () => {
      await fixture.writeFile('src/config-source.ts', `export const CONFIG = {
  host: 'localhost',
  port: 3000,
  debug: true,
};

export const OTHER = 'other';
`);
      await fixture.writeFile('src/config-dest.ts', '');

      // CONFIG 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/config-source.ts')}:1`, fixture.getFilePath('src/config-dest.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/config-dest.ts'), 'utf-8') as string;
      expect(targetContent).toContain('CONFIG');
      expect(targetContent).toContain('localhost');
      expect(targetContent).toContain('port: 3000');

      const configSourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/config-source.ts'), 'utf-8') as string;
      // CONFIG 應從來源移除
      expect(configSourceContent).not.toContain('const CONFIG');
      // OTHER 應留在來源
      expect(configSourceContent).toContain('OTHER');
    });
  });

  // ─── 輸出結構驗證 ───

  describe('輸出結構驗證', () => {
    it('JSON 輸出應包含 command 和 summary 欄位', async () => {
      await fixture.writeFile('src/out-source.ts', `export function fn(): void {}
`);
      await fixture.writeFile('src/out-target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/out-source.ts')}:1`, fixture.getFilePath('src/out-target.ts'),
          '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary).toBeDefined();
      expect(typeof output.summary.totalFiles).toBe('number');
    });

    it('diff 格式輸出不為空', async () => {
      await fixture.writeFile('src/diff-source.ts', `export function diffFn(): void {}
`);
      await fixture.writeFile('src/diff-target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/diff-source.ts')}:1`, fixture.getFilePath('src/diff-target.ts'),
          '-p', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應包含新增/刪除行標記
      expect(result.stdout).toMatch(/^[+-]/m);
      expect(result.stdout).toContain('diffFn');
    });
  });
});
