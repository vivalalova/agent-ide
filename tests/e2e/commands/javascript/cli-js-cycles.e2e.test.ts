import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI cycles - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析 JS 專案的依賴（無循環）', async () => {
      const result = await executeCLI(['cycles', '--path', fixture.rootPath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該以 JSON 格式回傳結果', async () => {
      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(Array.isArray(output.cycles)).toBe(true);
    });

    it('應該以 summary 格式回傳結果', async () => {
      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('線性依賴鏈不應產生循環（utils → models → service → api）', async () => {
      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles).toHaveLength(0);
    });
  });

  describe('循環依賴檢測', () => {
    it('應該檢測 JS 檔案間的直接循環（A↔B）', async () => {
      await fixture.writeFile('cycle-a.js', 'import { b } from "./cycle-b.js";\nexport const a = 1;');
      await fixture.writeFile('cycle-b.js', 'import { a } from "./cycle-a.js";\nexport const b = 2;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);
    });

    it('應該檢測三層間接循環（A→B→C→A）', async () => {
      await fixture.writeFile('tri-a.js', 'import { c } from "./tri-c.js";\nexport const a = c;');
      await fixture.writeFile('tri-b.js', 'import { a } from "./tri-a.js";\nexport const b = a;');
      await fixture.writeFile('tri-c.js', 'import { b } from "./tri-b.js";\nexport const c = b;');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.cycles.length).toBeGreaterThan(0);
      const hasThreeNodeCycle = output.cycles.some((c: { length: number }) => c.length >= 3);
      expect(hasThreeNodeCycle).toBe(true);
    });
  });

  describe('混合 JS/JSX 檔案', () => {
    it('應該處理 .jsx 檔案中的 import', async () => {
      await fixture.writeFile('component.jsx', 'import { formatName } from "./src/utils.js";\nexport default function App() { return null; }');

      const result = await executeCLI(
        ['cycles', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('不存在路徑應返回 exit code 1', async () => {
      const result = await executeCLI(
        ['cycles', '--path', '/nonexistent-js-project', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
    });
  });
});
