/**
 * CLI move 命令 E2E 測試 - rename 可見性與空 changeset 退場
 *
 * 涵蓋 task: fix-move-silent-fail-absolute-path
 * - dry-run 必須在 JSON 輸出 renames 欄位
 * - diff/summary 必須輸出 Renamed: 行
 * - source === target 必須 exit !== 0、輸出明確訊息
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';
import * as path from 'path';

describe('CLI move - rename 可見性與空 changeset 退場', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('dry-run renames 欄位（JSON）', () => {
    it('多 importer 的 happy path → renames + pathUpdates 都存在', async () => {
      const source = path.join(fixture.rootPath, 'src/models/base-model.ts');
      const target = path.join(fixture.rootPath, 'src/models/entities/base-model.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      expect(Array.isArray(output.renames)).toBe(true);
      expect(output.renames).toHaveLength(1);
      expect(output.renames[0].from).toBe(source);
      expect(output.renames[0].to).toBe(target);

      expect(Array.isArray(output.pathUpdates)).toBe(true);
      expect(output.pathUpdates.length).toBeGreaterThan(0);
    });

    it('0 importer 的純 rename → renames 仍然存在', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/string-utils.ts');
      const target = path.join(fixture.rootPath, 'src/utils/string-helpers.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      expect(Array.isArray(output.renames)).toBe(true);
      expect(output.renames).toHaveLength(1);
      expect(output.renames[0].from).toBe(source);
      expect(output.renames[0].to).toBe(target);
    });
  });

  describe('dry-run renames 顯示（diff 格式）', () => {
    it('diff 格式必須輸出 Renamed: <from> → <to>', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/string-utils.ts');
      const target = path.join(fixture.rootPath, 'src/utils/string-helpers.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Renamed:.*string-utils\.ts.*→.*string-helpers\.ts/);
    });

    it('summary 格式必須輸出 Renamed: <from> → <to>', async () => {
      const source = path.join(fixture.rootPath, 'src/utils/string-utils.ts');
      const target = path.join(fixture.rootPath, 'src/utils/string-helpers.ts');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/Renamed:.*string-utils\.ts.*→.*string-helpers\.ts/);
    });
  });

  describe('source === target 必須報錯', () => {
    it('絕對路徑完全相同 → exit !== 0、輸出含「來源與目標相同」', async () => {
      const same = path.join(fixture.rootPath, 'src/types/user.ts');

      const result = await executeCLI(
        ['move', same, same, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toMatch(/來源與目標相同/);
    });

    it('source 與 target 解析後相同（一邊絕對一邊相對）→ exit !== 0', async () => {
      const absolute = path.join(fixture.rootPath, 'src/types/user.ts');
      const relative = 'src/types/user.ts';

      const result = await executeCLI(
        ['move', absolute, relative, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toMatch(/來源與目標相同/);
    });
  });
});
