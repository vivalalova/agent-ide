/**
 * CLI snapshot 命令 E2E 測試
 * 基於 sample-project fixture 測試程式碼快照功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('CLI snapshot - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 基本功能測試
  // ============================================================

  it('應該生成快照並輸出 JSON 格式', async () => {
    const outputPath = path.join(fixture.tempPath, '.agent-ide', 'snapshot.json');

    const result = await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.snapshot).toBe(outputPath);
    expect(output.stats).toBeDefined();
    expect(output.stats.fileCount).toBeGreaterThan(0);
    expect(output.stats.symbolCount).toBeGreaterThanOrEqual(0); // 符號提取可能為空
    expect(output.stats.estimatedTokens).toBeGreaterThan(0);

    // 驗證快照檔案已建立
    const snapshotExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(snapshotExists).toBe(true);
  });

  it('應該生成快照並包含所有必要欄位', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot-test.json');

    const result = await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath
    ]);

    expect(result.exitCode).toBe(0);

    // 讀取快照檔案
    const snapshotContent = await fs.readFile(outputPath, 'utf-8');
    const snapshot = JSON.parse(snapshotContent);

    // 驗證必要欄位
    expect(snapshot.v).toBeDefined(); // 版本
    expect(snapshot.p).toBeDefined(); // 專案名稱
    expect(snapshot.t).toBeDefined(); // 時間戳
    expect(snapshot.h).toBeDefined(); // 專案 hash
    expect(snapshot.l).toBeDefined(); // 壓縮層級
    expect(snapshot.s).toBeDefined(); // 架構
    expect(snapshot.y).toBeDefined(); // 符號
    expect(snapshot.dp).toBeDefined(); // 依賴
    expect(snapshot.c).toBeDefined(); // 程式碼
    expect(snapshot.q).toBeDefined(); // 品質指標
    expect(snapshot.md).toBeDefined(); // 元數據
  });

  // ============================================================
  // 2. 壓縮層級測試
  // ============================================================

  it('應該支援 minimal 壓縮層級', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot-minimal.json');

    const result = await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath,
      '--level',
      'minimal'
    ]);

    expect(result.exitCode).toBe(0);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
    expect(snapshot.l).toBe('minimal');
  });

  it('應該支援 medium 壓縮層級', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot-medium.json');

    const result = await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath,
      '--level',
      'medium'
    ]);

    expect(result.exitCode).toBe(0);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
    expect(snapshot.l).toBe('medium');
  });

  it('應該支援 full 壓縮層級（預設）', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot-full.json');

    const result = await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath,
      '--level',
      'full'
    ]);

    expect(result.exitCode).toBe(0);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
    expect(snapshot.l).toBe('full');
  });

  it('minimal 層級的 token 數應該最少', async () => {
    const minimalPath = path.join(fixture.tempPath, 'snapshot-minimal.json');
    const mediumPath = path.join(fixture.tempPath, 'snapshot-medium.json');
    const fullPath = path.join(fixture.tempPath, 'snapshot-full.json');

    await executeCLI(['snapshot', '--path', fixture.tempPath, '--output', minimalPath, '--level', 'minimal']);
    await executeCLI(['snapshot', '--path', fixture.tempPath, '--output', mediumPath, '--level', 'medium']);
    await executeCLI(['snapshot', '--path', fixture.tempPath, '--output', fullPath, '--level', 'full']);

    const minimalSize = (await fs.readFile(minimalPath, 'utf-8')).length;
    const mediumSize = (await fs.readFile(mediumPath, 'utf-8')).length;
    const fullSize = (await fs.readFile(fullPath, 'utf-8')).length;

    // minimal 應該最小
    expect(minimalSize).toBeLessThan(mediumSize);
    expect(minimalSize).toBeLessThan(fullSize);
    // medium 和 full 大小接近，full 可能因為符號映射表而稍大
  }, 60000);

  // ============================================================
  // 3. 快照資訊查詢測試
  // ============================================================

  it('應該能查看快照資訊', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot.json');

    // 先生成快照
    await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath
    ]);

    // 查看資訊
    const result = await executeCLI([
      'snapshot',
      'info',
      '--output',
      outputPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.snapshot).toBeDefined();
    expect(output.snapshot.version).toBeDefined();
    expect(output.snapshot.project).toBeDefined();
    expect(output.snapshot.timestamp).toBeDefined();
    expect(output.snapshot.level).toBeDefined();
    expect(output.stats).toBeDefined();
  });

  // ============================================================
  // 4. 配置檔測試
  // ============================================================

  it('應該能初始化配置檔', async () => {
    const result = await executeCLI([
      'snapshot',
      'init',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.config).toBe('.agent-ide.json');

    // 驗證配置檔已建立
    const configPath = path.join(fixture.tempPath, '.agent-ide.json');
    const configExists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(configExists).toBe(true);

    // 驗證配置檔內容
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(config.snapshot).toBeDefined();
    expect(config.snapshot.enabled).toBeDefined();
    expect(config.snapshot.output).toBeDefined();
  });

  // ============================================================
  // 5. 統計資訊測試
  // ============================================================

  it('應該輸出正確的統計資訊', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot.json');

    const result = await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    const stats = output.stats;

    expect(stats.fileCount).toBeGreaterThan(0);
    expect(stats.totalLines).toBeGreaterThan(0);
    expect(stats.symbolCount).toBeGreaterThan(0);
    expect(stats.dependencyCount).toBeGreaterThanOrEqual(0);
    expect(stats.estimatedTokens).toBeGreaterThan(0);
    // compressionRatio 可能為負數（快照包含元數據可能比原始代碼大）
    expect(typeof stats.compressionRatio).toBe('number');
    expect(stats.generationTime).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // 6. 快照內容驗證
  // ============================================================

  it('應該包含架構資訊', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot.json');

    await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath
    ]);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));

    expect(snapshot.s.d).toBeDefined(); // 目錄列表
    expect(Array.isArray(snapshot.s.d)).toBe(true);
    expect(snapshot.s.m).toBeDefined(); // 模組摘要
    expect(Array.isArray(snapshot.s.m)).toBe(true);
    expect(snapshot.s.m.length).toBeGreaterThan(0);

    // 驗證模組摘要結構
    const module = snapshot.s.m[0];
    expect(module.p).toBeDefined(); // 路徑
    expect(module.e).toBeGreaterThanOrEqual(0); // 匯出數
    expect(module.d).toBeGreaterThanOrEqual(0); // 依賴數
    expect(module.l).toBeGreaterThan(0); // 行數
  });

  it('應該包含符號索引', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot.json');

    await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath
    ]);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));

    expect(snapshot.y).toBeDefined();
    expect(typeof snapshot.y).toBe('object');

    // 找第一個有符號的檔案
    const files = Object.keys(snapshot.y);
    expect(files.length).toBeGreaterThan(0);

    const firstFile = files[0];
    const symbols = snapshot.y[firstFile];

    if (symbols.length > 0) {
      const symbol = symbols[0];
      expect(symbol.n).toBeDefined(); // 名稱
      expect(symbol.t).toBeDefined(); // 型別
      expect(symbol.s).toBeGreaterThanOrEqual(0); // 起始行
      expect(symbol.e).toBeGreaterThanOrEqual(symbol.s); // 結束行
    }
  });

  it('應該包含依賴關係', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot.json');

    await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath
    ]);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));

    expect(snapshot.dp).toBeDefined();
    expect(snapshot.dp.g).toBeDefined(); // 依賴邊
    expect(Array.isArray(snapshot.dp.g)).toBe(true);
    expect(snapshot.dp.i).toBeDefined(); // import
    expect(typeof snapshot.dp.i).toBe('object');
    expect(snapshot.dp.ex).toBeDefined(); // export
    expect(typeof snapshot.dp.ex).toBe('object');
  });

  it('應該包含品質指標', async () => {
    const outputPath = path.join(fixture.tempPath, 'snapshot.json');

    await executeCLI([
      'snapshot',
      '--path',
      fixture.tempPath,
      '--output',
      outputPath
    ]);

    const snapshot = JSON.parse(await fs.readFile(outputPath, 'utf-8'));

    expect(snapshot.q).toBeDefined();
    expect(snapshot.q.ss).toBeGreaterThanOrEqual(0); // ShitScore
    expect(snapshot.q.ss).toBeLessThanOrEqual(100);
    expect(snapshot.q.cx).toBeGreaterThanOrEqual(0); // 複雜度
    expect(snapshot.q.mt).toBeGreaterThanOrEqual(0); // 維護性
    expect(Array.isArray(snapshot.q.is)).toBe(true); // 問題列表
  });

  // ============================================================
  // 7. 錯誤處理測試
  // ============================================================

  it('應該處理不存在的路徑', async () => {
    const result = await executeCLI([
      'snapshot',
      '--path',
      '/non/existent/path'
    ]);

    expect(result.exitCode).toBe(1);
  });
});
