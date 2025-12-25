/**
 * Move 命令
 * 移動檔案或目錄並更新 import 路徑
 * 支援成員移動（透過 source:line 格式）
 */

import type { Command } from 'commander';
import * as path from 'path';
import { MoveService } from '@core/move/move-service.js';
import { parseMoveTarget, hasPositionInfo } from '@core/move/path-parser.js';
import { MoveMemberService, MoveTargetType } from '@core/move-member/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { ChangeApplicator, convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { loadTsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';

/** Move 命令選項 */
interface MoveOptions {
  source?: string;
  target?: string;
  path: string;
  updateImports: boolean;
  dryRun?: boolean;
  format: string;
  /** 成員移動：目標類別 */
  targetClass?: string;
  /** 成員移動：保留 re-export */
  keepReexport?: boolean;
}

/**
 * 設定 move 命令
 */
export function setupMoveCommand(program: Command, context: CommandContext): void {
  program
    .command('move [source] [target]')
    .description('移動檔案、目錄或成員（source:line 格式觸發成員移動）')
    .option('-s, --source <path>', '來源路徑')
    .option('-t, --target <path>', '目標路徑')
    .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
    .option('--update-imports', '自動更新 import 路徑（預設為 true）', true)
    .option('--no-update-imports', '不更新 import 路徑')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    // 成員移動選項
    .option('--target-class <name>', '目標類別名稱（成員移動用）')
    .option('--keep-reexport', '保留原位置的 re-export（成員移動用）')
    .action(async (sourceArg, targetArg, options: MoveOptions) => {
      // 支援兩種語法：
      // 1. move <source> <target> (位置參數)
      // 2. move --source <source> --target <target> (選項參數)
      const source = sourceArg || options.source;
      const target = targetArg || options.target;

      if (!source || !target) {
        const outputHandler = createUnifiedOutputHandler();
        const format = options.format === 'json' ? OutputFormat.Json : OutputFormat.Summary;
        outputHandler.outputError('必須指定來源和目標路徑。使用方式: agent-ide move <source> <target> 或 --source <source> --target <target>', format);
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      // 解析路徑格式，判斷是檔案移動還是成員移動
      const parsedSource = parseMoveTarget(source);

      if (hasPositionInfo(parsedSource)) {
        // 成員移動模式
        await handleMoveMemberCommand(source, target, options, context);
      } else {
        // 檔案移動模式
        await handleMoveCommand(source, target, options, context);
      }
    });
}

/**
 * 處理 move 命令
 */
async function handleMoveCommand(
  source: string,
  target: string,
  options: MoveOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, true);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary, diff', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  const isJsonFormat = format === OutputFormat.Json;
  const projectRoot = options.path || process.cwd();

  // Bug 1 修復：解析相對路徑為絕對路徑（相對於 --path）
  const resolvedSource = path.isAbsolute(source) ? source : path.resolve(projectRoot, source);

  if (!isJsonFormat) {
    console.log(`   ${source}   ${target}`);
  }

  try {
    // 檢查源檔案是否存在
    const sourceExists = await context.fileSystem.exists(resolvedSource);
    if (!sourceExists) {
      outputHandler.outputError(`源檔案找不到: ${source}`, format);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // Bug 2 修復：處理目標為目錄的情況
    let resolvedTarget = path.isAbsolute(target) ? target : path.resolve(projectRoot, target);

    // 檢查目標是否為目錄（以 / 結尾或已存在的目錄）
    const targetEndsWithSlash = target.endsWith('/') || target.endsWith(path.sep);
    let targetIsDirectory = false;

    if (targetEndsWithSlash) {
      targetIsDirectory = true;
    } else {
      // 檢查目標是否為已存在的目錄
      try {
        targetIsDirectory = await context.fileSystem.isDirectory(resolvedTarget);
      } catch {
        // 目標不存在，視為檔案路徑
        targetIsDirectory = false;
      }
    }

    // 如果目標是目錄，將原檔名加到目標路徑
    if (targetIsDirectory) {
      const sourceBasename = path.basename(resolvedSource);
      resolvedTarget = path.join(resolvedTarget, sourceBasename);
    }

    // 檢查源和目標是否相同
    const normalizedSource = path.resolve(resolvedSource);
    const normalizedTarget = path.resolve(resolvedTarget);
    if (normalizedSource === normalizedTarget) {
      // 源和目標相同時，視為 no-op，成功返回
      if (isJsonFormat) {
        console.log(JSON.stringify({ success: true, message: 'Source and target are identical. No changes made.', changes: [] }));
      } else {
        console.log('   Source and target are identical. No changes made.');
      }
      return;
    }

    // 讀取 tsconfig.json 路徑設定（paths + baseUrl，會向上查找 tsconfig.json）
    const tsconfigPathConfig = await loadTsconfigPathConfig(projectRoot, context.fileSystem);

    // 建立移動服務
    const moveService = new MoveService(context.fileSystem, {
      pathAliases: tsconfigPathConfig.pathAliases,
      baseUrl: tsconfigPathConfig.baseUrl,
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue'],
      includeNodeModules: false
    });

    const moveOperation = {
      source: normalizedSource,
      target: normalizedTarget,
      updateImports: options.updateImports
    };

    const moveOptions = {
      projectRoot
    };

    // 使用新的 Changeset 流程
    const applicator = new ChangeApplicator(context.fileSystem);

    // 生成 Changeset
    const changeset = await moveService.generateChangeset(moveOperation, moveOptions);

    if (!changeset.success) {
      outputHandler.outputError(changeset.errors?.join(', ') ?? '生成變更失敗', format);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // 轉換為 PreviewInput
    const previewInput = await convertChangesetToPreviewInput(changeset, context.fileSystem);

    // Dry-run 模式只輸出預覽
    if (options.dryRun) {
      outputHandler.outputMutation(previewInput, format);
      return;
    }

    // 執行移動操作（帶回滾）
    if (!isJsonFormat) {
      console.log('   執行移動...');
    }

    const result = await applicator.apply(changeset, {
      atomic: true,
      rollbackOnError: true
    });

    if (result.success) {
      // 統計 pathUpdates 數量（從 changeset.textChanges 計算）
      const totalUpdates = changeset.textChanges.reduce((sum, tc) => sum + tc.edits.length, 0);
      printSuccess(normalizedSource, normalizedTarget, totalUpdates, result.movedFiles, isJsonFormat);
    } else {
      outputHandler.outputError(result.errors?.join(', ') ?? '執行失敗', format);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(errorMsg, format);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 印出成功訊息
 */
function printSuccess(
  source: string,
  target: string,
  totalUpdates: number,
  movedFiles: ReadonlyArray<{ from: string; to: string }>,
  isJsonFormat: boolean
): void {
  if (isJsonFormat) {
    console.log(JSON.stringify({
      success: true,
      source,
      target,
      moved: movedFiles.length > 0,
      pathUpdates: [], // 向後相容：實際更新已應用，這裡僅保留欄位
      message: `成功移動 ${source} → ${target}，更新了 ${totalUpdates} 個 import`
    }, null, 2));
  } else {
    console.log('   移動成功!');
    console.log(`   統計: ${totalUpdates} 個 import 已更新`);

    if (movedFiles.length > 0) {
      console.log('   移動的檔案:');
      for (const { from, to } of movedFiles) {
        console.log(`      ${path.relative(process.cwd(), from)} → ${path.relative(process.cwd(), to)}`);
      }
    }
  }
}



/**
 * 處理成員移動命令
 * 當 source 包含位置資訊時（如 file.ts:25）觸發
 */
async function handleMoveMemberCommand(
  source: string,
  target: string,
  options: MoveOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();
  let format: OutputFormat;

  try {
    format = parseOutputFormat(options.format, true);
  } catch {
    outputHandler.outputError('不支援的輸出格式。可用格式: json, summary, diff', OutputFormat.Summary);
    process.exitCode = 1;
    return;
  }

  const isJsonFormat = format === OutputFormat.Json;
  const projectRoot = options.path || process.cwd();

  try {
    // 解析 source 和 target 路徑
    const parsedSource = parseMoveTarget(source);
    const parsedTarget = parseMoveTarget(target);

    // 解析為絕對路徑
    const sourceFilePath = path.isAbsolute(parsedSource.filePath)
      ? parsedSource.filePath
      : path.resolve(projectRoot, parsedSource.filePath);
    const targetFilePath = path.isAbsolute(parsedTarget.filePath)
      ? parsedTarget.filePath
      : path.resolve(projectRoot, parsedTarget.filePath);

    if (!isJsonFormat) {
      console.log(`   移動成員: ${path.relative(projectRoot, sourceFilePath)}:${parsedSource.line}`);
      console.log(`   目標: ${path.relative(projectRoot, targetFilePath)}`);
    }

    // 取得 ParserRegistry（單例）
    const parserRegistry = ParserRegistry.getInstance();

    // 建立服務
    const moveMemberService = new MoveMemberService(
      parserRegistry,
      context.fileSystem
    );

    // 決定目標類型
    const targetType = options.targetClass
      ? MoveTargetType.ExistingClass
      : MoveTargetType.ExistingFile;

    // 準備 MoveMember 選項
    const moveMemberOptions = {
      sourceFile: sourceFilePath,
      sourcePosition: {
        line: parsedSource.line!,
        column: parsedSource.column
      },
      target: {
        type: targetType,
        filePath: targetFilePath,
        className: options.targetClass,
        insertPosition: parsedTarget.line // 若 target 帶行號，作為插入位置
      },
      projectRoot,
      updateReferences: options.updateImports,
      keepReexport: options.keepReexport
    };

    // 生成 Changeset
    const changeset = await moveMemberService.generateChangeset(moveMemberOptions);

    if (!changeset.success) {
      outputHandler.outputError(changeset.errors?.join(', ') ?? '生成變更失敗', format, 'move');
      process.exitCode = 1;
      return;
    }

    // 轉換為 PreviewInput
    const previewInput = await convertChangesetToPreviewInput(changeset, context.fileSystem);

    // Dry-run 模式只輸出預覽
    if (options.dryRun) {
      outputHandler.outputMutation(previewInput, format);
      return;
    }

    // 執行變更
    if (!isJsonFormat) {
      console.log('   執行移動...');
    }

    const applicator = new ChangeApplicator(context.fileSystem);
    const result = await applicator.apply(changeset, {
      atomic: true,
      rollbackOnError: true
    });

    if (result.success) {
      outputHandler.outputMutation(previewInput, format);
    } else {
      outputHandler.outputError(result.errors?.join(', ') ?? '執行失敗', format, 'move');
      process.exitCode = 1;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(errorMsg, format, 'move');
    process.exitCode = 1;
  }
}
