/**
 * deadcode 命令 E2E 測試
 * 基於 deadcode-test fixture
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - 基於 deadcode-test fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-test');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功檢測 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deadcode-removal');
      expect(output.success).toBe(true);
      expect(output.files).toBeDefined();
      expect(Array.isArray(output.files)).toBe(true);
    });

    it('應該輸出 diff 格式', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      // diff 格式應該包含刪除標記
      expect(result.stdout).toContain('-');
    });

    it('應該檢測到真正的 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 應該檢測到一些 dead code
      expect(output.files.length).toBeGreaterThan(0);
    });

    it('應該包含正確的統計資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      expect(output.summary).toBeDefined();
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      expect(output.summary.totalChanges).toBeGreaterThanOrEqual(0);
    });
  });

  describe('選項測試', () => {
    it('--include-exports 應該包含 export 的符號', async () => {
      // 不包含 exports
      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 包含 exports
      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      const outputWithout = JSON.parse(resultWithout.stdout);
      const outputWith = JSON.parse(resultWith.stdout);

      // 從 operationDescription 提取符號數量
      const extractCount = (output: { operationDescription?: string }) => {
        const match = output.operationDescription?.match(/Removed (\d+) dead code/);
        return match ? parseInt(match[1], 10) : 0;
      };

      const countWithout = extractCount(outputWithout);
      const countWith = extractCount(outputWith);

      // 包含 exports 時應該檢測到更多符號
      // true-deadcode.ts 有 3 個 exported 但未使用的符號
      expect(countWith).toBeGreaterThan(countWithout);
      expect(countWith - countWithout).toBeGreaterThanOrEqual(3);
    });

    it('--include-public-members 應該包含 public class members', async () => {
      // 不包含 public members
      const resultWithout = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 包含 public members
      const resultWith = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-public-members'],
        { memfs: fixture.memfs }
      );

      const outputWithout = JSON.parse(resultWithout.stdout);
      const outputWith = JSON.parse(resultWith.stdout);

      // 計算 hunks 總數
      const countHunks = (output: { files?: Array<{ hunks?: unknown[] }> }) =>
        output.files?.reduce((sum, f) => sum + (f.hunks?.length ?? 0), 0) ?? 0;

      // 包含 public members 時應該檢測到更多或相同
      expect(countHunks(outputWith)).toBeGreaterThanOrEqual(countHunks(outputWithout));
    });
  });

  describe('Public Class Members 保護（Bug 5 修復）', () => {
    it('預設不應將 public class methods 標記為 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 取得所有被標記為 dead code 的符號名稱
      const deadSymbols = new Set<string>();
      for (const file of output.files ?? []) {
        for (const hunk of file.hunks ?? []) {
          const content = hunk.content ?? '';
          // 提取方法名稱
          const methodMatches = content.matchAll(/^\s*(?:public\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/gm);
          for (const match of methodMatches) {
            deadSymbols.add(match[1]);
          }
        }
      }

      // class-members.ts 中的 public methods 不應被標記（可能被外部使用）
      expect(deadSymbols.has('publicMethod')).toBe(false);
      expect(deadSymbols.has('callPrivate')).toBe(false);
    });

    it('private 未使用的 methods 仍應被標記為 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 應該有檢測到一些 dead code（包含 private 未使用的）
      expect(output.files.length).toBeGreaterThan(0);

      // 驗證 class-members.ts 中的 private 未使用符號被檢測到
      const classMembers = output.files.find((f: { filePath: string }) =>
        f.filePath.includes('class-members.ts')
      );

      if (classMembers) {
        // 從所有 hunks 的 lines 中提取 delete 類型的 content
        const allContent = classMembers.hunks
          .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
            h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
          )
          .join('\n');
        // 應該包含 private 未使用的符號
        expect(allContent).toContain('unusedPrivate');
      }
    });
  });

  describe('輸出格式', () => {
    it('JSON 輸出應該是有效的 JSON', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('每個檔案應該包含 hunks 資訊', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      if (output.files && output.files.length > 0) {
        const file = output.files[0];
        expect(file.filePath).toBeDefined();
        expect(file.hunks).toBeDefined();
        expect(Array.isArray(file.hunks)).toBe(true);
      }
    });
  });

  describe('Interface/Type 屬性保護（Bug 2 修復）', () => {
    it('interface 屬性不應被標記為 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-exports'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 取得所有被標記為 dead code 的符號名稱
      const deadSymbols = new Set<string>();
      for (const file of output.files ?? []) {
        for (const hunk of file.hunks ?? []) {
          for (const line of hunk.lines ?? []) {
            if (line.type === 'delete') {
              // 提取屬性名稱（如 name: string;）
              const propMatch = line.content.match(/^\s*(\w+)\s*[?]?\s*:/);
              if (propMatch) {
                deadSymbols.add(propMatch[1]);
              }
            }
          }
        }
      }

      // interface-properties.ts 中的 interface/type 屬性不應被標記
      // TestConfig interface 屬性
      expect(deadSymbols.has('name')).toBe(false);
      expect(deadSymbols.has('value')).toBe(false);
      expect(deadSymbols.has('isEnabled')).toBe(false);

      // UserData type 屬性
      expect(deadSymbols.has('id')).toBe(false);
      expect(deadSymbols.has('email')).toBe(false);

      // TestCase interface 屬性（模擬 .spec.ts 使用情境）
      expect(deadSymbols.has('expectedSeverity')).toBe(false);
      expect(deadSymbols.has('contractCapacity')).toBe(false);
    });

    it('interface-properties.ts 檔案不應出現在 dead code 結果中', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // interface-properties.ts 不應有任何 dead code（所有內容都是 interface 定義和使用）
      const interfaceFile = output.files.find((f: { filePath: string }) =>
        f.filePath.includes('interface-properties.ts')
      );

      // 如果檔案存在於結果中，不應該有 hunks
      if (interfaceFile) {
        expect(interfaceFile.hunks.length).toBe(0);
      }
    });
  });

  describe('Class 成員使用保護（Bug #32 修復）', () => {
    it('有成員被使用的 class 不應被標記為 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 取得所有被標記為 dead code 的 class 名稱
      const deadClasses = new Set<string>();
      for (const file of output.files ?? []) {
        for (const hunk of file.hunks ?? []) {
          for (const line of hunk.lines ?? []) {
            if (line.type === 'delete') {
              // 提取 class 名稱（使用全域匹配，因為 content 可能包含多行）
              const classMatches = line.content.matchAll(/(?:export\s+)?class\s+(\w+)/g);
              for (const match of classMatches) {
                deadClasses.add(match[1]);
              }
            }
          }
        }
      }

      // UsedServiceClass 有 public method 被使用（service.usedMethod()），整個 class 不應被刪除
      expect(deadClasses.has('UsedServiceClass')).toBe(false);

      // TotallyUnusedClass 完全沒被使用，應該被標記為 dead code
      expect(deadClasses.has('TotallyUnusedClass')).toBe(true);
    });

    it('class 內未使用的 private 方法仍應被標記為 dead code', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);

      // 找到 class-with-used-member.ts 檔案
      const targetFile = output.files.find((f: { filePath: string }) =>
        f.filePath.includes('class-with-used-member.ts')
      );

      if (targetFile) {
        // 從所有 hunks 的 lines 中提取 delete 類型的 content
        const allDeletedContent = targetFile.hunks
          .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
            h.lines
              .filter((l: { type: string }) => l.type === 'delete')
              .map((l: { content: string }) => l.content)
          )
          .join('\n');

        // bug32UnusedPrivateMethod 應該被標記為 dead code（使用唯一名稱避免同名符號問題）
        expect(allDeletedContent).toContain('bug32UnusedPrivateMethod');

        // usedMethod 不應被標記
        expect(allDeletedContent).not.toMatch(/\busedMethod\b.*\{/);
      }
    });
  });

  describe('錯誤處理', () => {
    it('不存在的路徑應該報錯', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', '/non/existent/path', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });

    it('不支援的格式應該報錯', async () => {
      const result = await executeCLI(
        ['deadcode', '--path', fixture.rootPath, '--format', 'invalid'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      // 錯誤訊息可能在 stdout 或 stderr
      const output = result.stdout + result.stderr;
      expect(output).toContain('不支援的輸出格式');
    });
  });
});
