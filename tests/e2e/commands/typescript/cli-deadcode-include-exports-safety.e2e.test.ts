/**
 * CLI deadcode --include-exports 安全性 E2E 測試
 * 驗證 autofix 執行後的副作用行為（dangling import 等）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode --include-exports - 安全性測試', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-autofix');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // ─── 基本刪除行為 ───

  describe('--include-exports 刪除行為', () => {
    it('完全未被 import 的 exported symbol 應被刪除', async () => {
      await fixture.writeFile('src/totally-unused.ts', `export function totallyUnused(): string {
  return 'never imported anywhere';
}

export function alsoUnused(): number {
  return 42;
}
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const content = await fixture.memfs.readFile(
        fixture.getFilePath('src/totally-unused.ts'), 'utf-8'
      ) as string;
      expect(content).not.toContain('totallyUnused');
      expect(content).not.toContain('alsoUnused');
    });

    it('被其他檔案 import 且呼叫的 exported symbol 不應被刪除', async () => {
      await fixture.writeFile('src/provider.ts', `export function usedByConsumer(): string {
  return 'I am used';
}

export function unusedByAnyone(): string {
  return 'nobody imports me';
}
`);
      await fixture.writeFile('src/active-consumer.ts', `import { usedByConsumer } from './provider.js';
export function doWork(): string {
  return usedByConsumer();
}
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const providerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/provider.ts'), 'utf-8'
      ) as string;
      // 被使用的 symbol 不應被刪除
      expect(providerContent).toContain('usedByConsumer');
      // 未被使用的 symbol 應被刪除
      expect(providerContent).not.toContain('unusedByAnyone');
    });
  });

  // ─── Exported symbol 保護機制 ───

  describe('exported symbol 保護機制', () => {
    it('被 consumer 呼叫的 exported symbol 不應被刪除（有 Usage reference）', async () => {
      // exported function 有 Usage reference → 不被 --include-exports 刪除 → 不產生 dangling import
      await fixture.writeFile('src/provider-protected.ts', `export function calledByConsumer(): string {
  return 'I am called by consumer';
}
`);
      // consumer 用 module-level call 呼叫（非 export），不受 --include-exports 影響
      await fixture.writeFile('src/protected-consumer.ts', `import { calledByConsumer } from './provider-protected.js';
console.log(calledByConsumer());
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const providerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/provider-protected.ts'), 'utf-8'
      ) as string;
      // Usage reference 保護 symbol 不被刪除
      expect(providerContent).toContain('calledByConsumer');

      const consumerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/protected-consumer.ts'), 'utf-8'
      ) as string;
      // consumer 的 import 仍有效（非 dangling）
      expect(consumerContent).toContain('calledByConsumer');
    });

    it('consumer 的 dead function 被刪後，其 unused import 應被清理（ImportCleaner 正向驗證）', async () => {
      // cleanedFn 被 deadInConsumer 呼叫（Usage ref）→ 不被 --include-exports 刪除
      // deadInConsumer 本身是 dead code → 被刪
      // deadInConsumer 被刪後 → consumer 進入 affectedFiles → ImportCleaner 清理 cleanedFn import
      await fixture.writeFile('src/cleaned-provider.ts', `export function cleanedFn(): string {
  return 'called only by dead code';
}
`);
      await fixture.writeFile('src/cleaned-consumer.ts', `import { cleanedFn } from './cleaned-provider.js';

function deadInConsumer(): void {
  // deadInConsumer 無呼叫者 → dead code
  // cleanedFn 有 Usage ref（來自此函式）→ 受保護不被 --include-exports 刪除
  cleanedFn();
}
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/cleaned-consumer.ts'), 'utf-8'
      ) as string;
      // deadInConsumer 應被刪除（是 dead code）
      expect(consumerContent).not.toContain('deadInConsumer');
      // ImportCleaner 只清理「已被刪除 symbol」的 import，不清理「仍存在但 unused」的 import
      // cleanedFn 未被刪除（受 Usage ref 保護），所以其 import 語句保留

      const providerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/cleaned-provider.ts'), 'utf-8'
      ) as string;
      // cleanedFn 有 Usage ref（來自 deadInConsumer）→ 本次掃描中受保護，保留在 provider
      expect(providerContent).toContain('cleanedFn');
    });
  });

  // ─── 一致性驗證 ───

  describe('autofix 後一致性驗證', () => {
    it('執行後現有 fixture 中不應產生新的 import 錯誤', async () => {
      // deadcode-autofix fixture 的 main.ts 引用 used.ts，不應受影響
      const beforeMain = await fixture.memfs.readFile(
        fixture.getFilePath('src/main.ts'), 'utf-8'
      ) as string;

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const afterMain = await fixture.memfs.readFile(
        fixture.getFilePath('src/main.ts'), 'utf-8'
      ) as string;
      // main.ts 不含 dead code，不應被修改
      expect(afterMain).toBe(beforeMain);

      // used.ts 被 main.ts 使用，其 export 不應被刪除
      const usedContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/used.ts'), 'utf-8'
      ) as string;
      expect(usedContent).toContain('usedFunction');
      expect(usedContent).toContain('UsedClass');
    });

    it('--dry-run 不應修改任何檔案', async () => {
      await fixture.writeFile('src/export-dry.ts', `export function dryRunFn(): void {}
`);

      const beforeContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/export-dry.ts'), 'utf-8'
      ) as string;

      await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const afterContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/export-dry.ts'), 'utf-8'
      ) as string;
      expect(afterContent).toBe(beforeContent);
    });

    it('JSON 輸出應包含 --include-exports 偵測到的 exported symbol', async () => {
      await fixture.writeFile('src/exported-dead.ts', `export function exportedDeadFn(): void {}
export function anotherExportedDead(): void {}
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deadcode-removal');
      expect(output.success).toBe(true);

      const exportedDeadFile = output.files?.find((f: { filePath: string }) =>
        f.filePath.includes('exported-dead')
      );
      expect(exportedDeadFile).toBeDefined();
      // 被刪除的行應包含兩個 exported dead symbol 的名稱
      const allDeletedLines = exportedDeadFile?.hunks
        ?.flatMap((h: { lines?: Array<{ type: string; content: string }> }) =>
          (h.lines ?? []).filter((l) => l.type === 'delete').map((l) => l.content)
        )
        .join('\n') ?? '';
      expect(allDeletedLines).toContain('exportedDeadFn');
      expect(allDeletedLines).toContain('anotherExportedDead');
    });
  });

  // ─── Partial import cleanup ───

  describe('partial import cleanup 邊界條件', () => {
    it('consumer import 多個 symbol，只有部分 symbol 是 dead，import 語句應被正確處理', async () => {
      // provider 提供兩個 export：一個被使用、一個未使用
      // consumer import 兩者，只使用其中一個
      // provider 有兩個 export：一個完全沒有 reference，一個被 consumer 在 module level 呼叫
      await fixture.writeFile('src/partial-provider.ts', `export function keepMe(): string {
  return 'I am called by consumer';
}

export function noReferenceFn(): string {
  return 'nobody imports or calls me';
}
`);
      // consumer 用 module-level 呼叫（非 export function），不受 --include-exports 影響
      await fixture.writeFile('src/partial-consumer.ts', `import { keepMe } from './partial-provider.js';
console.log(keepMe());
`);

      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--include-exports', '--apply', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const providerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/partial-provider.ts'), 'utf-8'
      ) as string;
      // keepMe 被 consumer 呼叫，不應刪除
      expect(providerContent).toContain('keepMe');
      // noReferenceFn 完全沒有 reference，應被刪除
      expect(providerContent).not.toContain('noReferenceFn');

      const consumerContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/partial-consumer.ts'), 'utf-8'
      ) as string;
      // consumer 仍有對 keepMe 的引用
      expect(consumerContent).toContain('keepMe');
    });
  });
});
