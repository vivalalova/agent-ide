/**
 * Snapshot 命令
 * 生成或管理程式碼快照
 */

import type { Command } from 'commander';
import * as path from 'path';
import { SnapshotEngine, SnapshotDiffer, ConfigManager, CompressionLevel } from '../../../core/snapshot/index.js';
import type { SnapshotOptions } from '../../../core/snapshot/index.js';
import type { CommandContext } from './types.js';

/** Snapshot 命令選項 */
interface SnapshotCommandOptions {
  path: string;
  output?: string;
  incremental: boolean;
  level: string;
  multiLevel: boolean;
  outputDir: string;
  format: string;
  includeTests: boolean;
  old?: string;
  new?: string;
}

/**
 * 設定 snapshot 命令
 */
export function setupSnapshotCommand(program: Command, context: CommandContext): void {
  program
    .command('snapshot [action]')
    .description('生成或管理程式碼快照')
    .option('-p, --path <path>', '專案路徑', process.cwd())
    .option('-o, --output <path>', '輸出檔案路徑')
    .option('-i, --incremental', '增量更新', false)
    .option('-l, --level <level>', '壓縮層級 (minimal|medium|full)', 'full')
    .option('--multi-level', '生成多層級快照', false)
    .option('--output-dir <dir>', '多層級輸出目錄', './snapshots')
    .option('--format <format>', '輸出格式 (json|summary)', 'summary')
    .option('--include-tests', '包含測試檔案', false)
    .option('--old <path>', '舊快照路徑（diff 命令用）')
    .option('--new <path>', '新快照路徑（diff 命令用）')
    .action(async (action: string | undefined, options: SnapshotCommandOptions) => {
      await handleSnapshotCommand(action || 'generate', options, context);
    });
}

/**
 * 處理 snapshot 命令
 */
async function handleSnapshotCommand(
  action: string,
  options: SnapshotCommandOptions,
  context: CommandContext
): Promise<void> {
  const isJsonFormat = options.format === 'json';

  try {
    const projectPath = options.path || process.cwd();
    const configManager = new ConfigManager(context.fileSystem);

    // 讀取配置檔
    const projectConfig = await configManager.loadConfig(projectPath);

    // 合併選項
    const snapshotOptions: Partial<SnapshotOptions> = {
      projectPath,
      outputPath: options.output,
      incremental: options.incremental,
      level: options.level as CompressionLevel,
      includeTests: options.includeTests,
      multiLevel: options.multiLevel,
      outputDir: options.outputDir,
      silent: isJsonFormat
    };

    const finalOptions = configManager.mergeOptions(projectPath, snapshotOptions, projectConfig);

    // 如果沒有指定輸出路徑，使用預設值
    if (!finalOptions.outputPath) {
      finalOptions.outputPath = path.join(projectPath, '.agent-ide', 'snapshot.json');
    }

    const engine = new SnapshotEngine(context.fileSystem);

    switch (action) {
      case 'generate':
        await handleGenerate(engine, finalOptions, isJsonFormat);
        break;
      case 'info':
        await handleInfo(engine, finalOptions, isJsonFormat);
        break;
      case 'diff':
        await handleDiff(engine, options, context, isJsonFormat);
        break;
      case 'init':
        await handleInit(configManager, projectPath, isJsonFormat);
        break;
      default:
        await handleGenerate(engine, finalOptions, isJsonFormat);
        break;
    }
  } catch (error) {
    handleError(error, isJsonFormat);
  }
}

/**
 * 處理 generate 子命令
 */
async function handleGenerate(
  engine: SnapshotEngine,
  options: SnapshotOptions,
  isJsonFormat: boolean
): Promise<void> {
  if (!isJsonFormat) {
    console.log('📸 生成程式碼快照...');
    console.log(options.incremental ? '  模式: 增量更新' : '  模式: 完整生成');
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
    await generateMultiLevel(engine, options, isJsonFormat);
  }

  if (isJsonFormat) {
    console.log(JSON.stringify({ success: true, snapshot: options.outputPath, stats }, null, 2));
  } else {
    printGenerateSuccess(options, stats);
  }
}

/**
 * 生成多層級快照
 */
async function generateMultiLevel(
  engine: SnapshotEngine,
  options: SnapshotOptions,
  isJsonFormat: boolean
): Promise<void> {
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
    const outputPath = path.join(options.outputDir!, `snapshot-${level}.json`);
    await engine.save(levelSnapshot, outputPath);

    if (!isJsonFormat) {
      const levelStats = engine.getStats(levelSnapshot);
      console.log(`  ✅ ${level}: ${levelStats.estimatedTokens} tokens`);
    }
  }
}

/**
 * 印出生成成功訊息
 */
function printGenerateSuccess(options: SnapshotOptions, stats: any): void {
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

/**
 * 處理 info 子命令
 */
async function handleInfo(
  engine: SnapshotEngine,
  options: SnapshotOptions,
  isJsonFormat: boolean
): Promise<void> {
  if (!options.outputPath) {
    throw new Error('請指定快照檔案路徑 (--output)');
  }

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
 * 處理 diff 子命令
 */
async function handleDiff(
  engine: SnapshotEngine,
  options: SnapshotCommandOptions,
  context: CommandContext,
  isJsonFormat: boolean
): Promise<void> {
  const oldPath = options.old;
  const newPath = options.new;

  if (!oldPath || !newPath) {
    throw new Error('請指定兩個快照檔案路徑 (--old <path> --new <path>)');
  }

  const differ = new SnapshotDiffer(context.fileSystem);
  const oldSnapshot = await engine.load(oldPath);
  const newSnapshot = await engine.load(newPath);
  const diff = differ.diff(oldSnapshot, newSnapshot);

  if (isJsonFormat) {
    console.log(JSON.stringify(diff, null, 2));
  } else {
    printDiffResult(diff);
  }
}

/**
 * 印出 diff 結果
 */
function printDiffResult(diff: any): void {
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
    diff.added.forEach((file: string) => console.log(`  + ${file}`));
  }

  if (diff.modified.length > 0) {
    console.log('\n修改檔案:');
    diff.modified.forEach((file: string) => console.log(`  ~ ${file}`));
  }

  if (diff.deleted.length > 0) {
    console.log('\n刪除檔案:');
    diff.deleted.forEach((file: string) => console.log(`  - ${file}`));
  }
}

/**
 * 處理 init 子命令
 */
async function handleInit(
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

/**
 * 處理錯誤
 */
function handleError(error: unknown, isJsonFormat: boolean): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (isJsonFormat) {
    console.error(JSON.stringify({ error: errorMessage }));
  } else {
    console.error('\n❌ 快照操作失敗:', errorMessage);
  }

  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}
