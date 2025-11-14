/**
 * 快照處理器模組
 * 提供快照相關操作功能
 */

import * as path from 'path';
import { SnapshotEngine, SnapshotDiffer, ConfigManager, CompressionLevel } from '../../../core/snapshot/index.js';
import type { SnapshotOptions } from '../../../core/snapshot/index.js';

/**
 * 處理快照生成命令
 */
export async function handleSnapshotGenerate(
  engine: SnapshotEngine,
  options: SnapshotOptions,
  isJsonFormat: boolean
): Promise<void> {
  if (!isJsonFormat) {
    console.log('📸 生成程式碼快照...');
    if (options.incremental) {
      console.log('  模式: 增量更新');
    } else {
      console.log('  模式: 完整生成');
    }
    console.log(`  壓縮層級: ${options.level}`);
  }

  const startTime = Date.now();
  const snapshot = await engine.generate(options);
  const stats = engine.getStats(snapshot);
  const duration = Date.now() - startTime;
  stats.generationTime = duration;

  // 保存快照
  if (options.outputPath) {
    await engine.save(snapshot, options.outputPath);
  }

  // 如果是多層級模式，生成其他層級
  if (options.multiLevel && options.outputDir) {
    if (!isJsonFormat) {
      console.log('\n📚 生成多層級快照...');
    }

    const levels: CompressionLevel[] = [
      CompressionLevel.Minimal,
      CompressionLevel.Medium,
      CompressionLevel.Full
    ];

    for (const level of levels) {
      const levelOptions = { ...options, level, incremental: false };
      const levelSnapshot = await engine.generate(levelOptions);
      const outputPath = path.join(
        options.outputDir,
        `snapshot-${level}.json`
      );
      await engine.save(levelSnapshot, outputPath);

      if (!isJsonFormat) {
        const levelStats = engine.getStats(levelSnapshot);
        console.log(`  ✅ ${level}: ${levelStats.estimatedTokens} tokens`);
      }
    }
  }

  if (isJsonFormat) {
    console.log(JSON.stringify({
      success: true,
      snapshot: options.outputPath,
      stats
    }, null, 2));
  } else {
    console.log('\n✅ 快照生成完成');
    console.log(`  輸出位置: ${options.outputPath}`);
    console.log('\n統計資訊:');
    console.log(`  檔案數量: ${stats.fileCount}`);
    console.log(`  程式碼行數: ${stats.totalLines}`);
    console.log(`  符號數量: ${stats.symbolCount}`);
    console.log(`  依賴關係: ${stats.dependencyCount}`);
    console.log(`  估計 token 數: ${stats.estimatedTokens}`);
    console.log(`  壓縮率: ${stats.compressionRatio.toFixed(1)}%`);
    console.log(`  生成耗時: ${stats.generationTime}ms`);
  }
}

/**
 * 處理快照資訊查詢命令
 */
export async function handleSnapshotInfo(
  options: SnapshotOptions,
  isJsonFormat: boolean
): Promise<void> {
  if (!options.outputPath) {
    throw new Error('請指定快照檔案路徑 (--output)');
  }

  const engine = new SnapshotEngine();
  const snapshot = await engine.load(options.outputPath);
  const stats = engine.getStats(snapshot);

  if (isJsonFormat) {
    console.log(JSON.stringify({
      snapshot: {
        version: snapshot.v,
        project: snapshot.p,
        timestamp: snapshot.t,
        level: snapshot.l
      },
      stats
    }, null, 2));
  } else {
    console.log('\n📊 快照資訊');
    console.log('='.repeat(50));
    console.log(`  專案: ${snapshot.p}`);
    console.log(`  版本: ${snapshot.v}`);
    console.log(`  時間: ${new Date(snapshot.t).toLocaleString()}`);
    console.log(`  壓縮層級: ${snapshot.l}`);
    console.log('\n統計資訊:');
    console.log(`  檔案數量: ${stats.fileCount}`);
    console.log(`  程式碼行數: ${stats.totalLines}`);
    console.log(`  符號數量: ${stats.symbolCount}`);
    console.log(`  估計 token 數: ${stats.estimatedTokens}`);
    console.log(`  語言: ${snapshot.md.lg.join(', ')}`);
    console.log('='.repeat(50));
  }
}

/**
 * 處理快照差異比對命令
 */
export async function handleSnapshotDiff(
  options: any,
  isJsonFormat: boolean
): Promise<void> {
  const oldPath = options.old;
  const newPath = options.new;

  if (!oldPath || !newPath) {
    throw new Error('請指定兩個快照檔案路徑 (--old <path> --new <path>)');
  }

  const engine = new SnapshotEngine();
  const differ = new SnapshotDiffer();

  const oldSnapshot = await engine.load(oldPath);
  const newSnapshot = await engine.load(newPath);

  const diff = differ.diff(oldSnapshot, newSnapshot);

  if (isJsonFormat) {
    console.log(JSON.stringify(diff, null, 2));
  } else {
    console.log('\n📊 快照差異');
    console.log('='.repeat(50));
    console.log(`  新增檔案: ${diff.added.length}`);
    console.log(`  修改檔案: ${diff.modified.length}`);
    console.log(`  刪除檔案: ${diff.deleted.length}`);
    console.log(`  總變更: ${diff.summary.totalChanges}`);
    console.log(`  變更行數: ${diff.summary.linesChanged}`);
    console.log('='.repeat(50));

    if (diff.added.length > 0) {
      console.log('\n新增檔案:');
      diff.added.forEach(file => console.log(`  + ${file}`));
    }

    if (diff.modified.length > 0) {
      console.log('\n修改檔案:');
      diff.modified.forEach(file => console.log(`  ~ ${file}`));
    }

    if (diff.deleted.length > 0) {
      console.log('\n刪除檔案:');
      diff.deleted.forEach(file => console.log(`  - ${file}`));
    }
  }
}

/**
 * 處理快照配置初始化命令
 */
export async function handleSnapshotInit(
  configManager: ConfigManager,
  projectPath: string,
  isJsonFormat: boolean
): Promise<void> {
  await configManager.createExampleConfig(projectPath);

  if (isJsonFormat) {
    console.log(JSON.stringify({ success: true, config: '.agent-ide.json' }));
  } else {
    console.log('✅ 已建立配置檔: .agent-ide.json');
  }
}
