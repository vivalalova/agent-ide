/**
 * CLI deadcode 別名 import 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * C15：別名 import（`import { x as y }`）使用中的 export，被 --include-exports
 *      誤判為 dead，因為 usage 比對用的是原始符號名而非別名，導致 alias 呼叫點
 *      對不上原始 export symbol。
 *      預期契約：透過別名被使用的 export，--include-exports 不得判 dead。
 *
 * N3：--include-exports --apply 刪除一個 export 後，consumer 檔案中該符號的
 *     import specifier 沒有被清理，殘留引用已不存在符號的 import。
 *     預期契約：符號被刪除後，所有 consumer 對它的 import specifier 應一併清除。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 別名 import 缺陷（reproduction）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('C15：別名 import 使用中的 export 不得被 --include-exports 誤判 dead', () => {
    it('ping 經 `import { ping as p }` 別名被 health() 呼叫，不得列入刪除', async () => {
      await fixture.writeFile('src/lib.ts', `export function ping(): string { return 'pong'; }
`);
      await fixture.writeFile('src/app.ts', `import { ping as p } from './lib.js';

export function health(): string {
  return p();
}
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const libFile = output.files?.find((f: { filePath: string }) => f.filePath.endsWith('/lib.ts'));
      const deletedLines = (libFile?.hunks ?? [])
        .flatMap((h: { lines?: Array<{ type: string; content: string }> }) =>
          (h.lines ?? []).filter((l) => l.type === 'delete').map((l) => l.content)
        )
        .join('\n');

      // 實測錯誤結果：ping 被列入刪除（lib.ts -3 行）
      // 正確行為：ping 經別名被 health 使用，不得判 dead
      expect(deletedLines).not.toContain('ping');
    });
  });

  describe('N3：刪除 export 後，consumer 的 import specifier 應一併清理', () => {
    it('deadA 被刪除後，app2.ts 中 `import { deadA }` 應被清除', async () => {
      await fixture.writeFile('src/x.ts', `export function deadA(): number { return 1; }
`);
      await fixture.writeFile('src/app2.ts', `import { deadA } from './x.js';

export const marker = 'app';

export function main(): string {
  return marker;
}
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const xContent = await fixture.readFile('src/x.ts');
      // deadA 未被任何人呼叫，應被刪除
      expect(xContent).not.toContain('deadA');

      const app2Content = await fixture.readFile('src/app2.ts');
      // 實測錯誤結果：deadA 被刪，但 app2.ts 的 import 語句原樣留下
      // 正確行為：該 import specifier 應一併清掉
      expect(app2Content).not.toContain('deadA');
      // consumer 本身其他內容不應受影響
      expect(app2Content).toContain('export const marker = \'app\';');
    });
  });
});
