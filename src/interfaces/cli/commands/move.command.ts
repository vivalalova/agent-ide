/**
 * Move 命令
 * 移動檔案或目錄並更新 import 路徑
 * 支援成員移動（透過 source:line 格式）
 * 支援 glob pattern（如 *.ts）
 */

import type { Command } from 'commander';
import * as path from 'path';
import { isGlobPattern } from '@core/move/glob-move-planner.js';
import { MoveEngine } from '@core/move/move-engine.js';
import { ALLOWED_EXTENSIONS } from '@core/move/path-utils.js';
import { MoveMemberEngine, MoveTargetType } from '@core/move-member/index.js';
import { parsePathLocation, hasPositionInfo } from '@interfaces/cli/path-location-parser.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { ChangeApplicator, convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
import {
  createUnifiedOutputHandler,
  OutputFormat,
  type UnifiedOutputHandler
} from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat, executeMutationCommand } from '@interfaces/cli/command-utils.js';
import { handleGlobMoveCommand } from '@interfaces/cli/commands/move-glob-command-handler.js';
import type { MoveOptions } from '@interfaces/cli/commands/move-command-options.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { loadTsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';
import { getErrorMessage } from '@shared/errors/index.js';

/**
 * 設定 move 命令
 */
export function setupMoveCommand(program: Command, context: CommandContext): void {
  program
    .command('move [source] [target]')
    .description('移動檔案、目錄或成員（source:line 格式觸發成員移動）。⚠️ 目錄移動遵循 mv 行為：目標已存在時會嵌套')
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

      // 檢查是否為 glob pattern
      if (isGlobPattern(source)) {
        // Glob 模式
        await handleGlobMoveCommand(source, target, options, context);
      } else {
        // 解析路徑格式，判斷是檔案移動還是成員移動
        const parsedSource = parsePathLocation(source);

        if (hasPositionInfo(parsedSource)) {
          // 成員移動模式
          await handleMoveMemberCommand(source, target, options, context);
        } else {
          // 檔案移動模式
          await handleMoveCommand(source, target, options, context);
        }
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

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, true, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

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
        // graceful-degradation: 目標路徑不存在時視為檔案路徑
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
        outputHandler.outputJson({ success: true, message: 'Source and target are identical. No changes made.', changes: [] });
      } else {
        console.log('   Source and target are identical. No changes made.');
      }
      return;
    }

    // 讀取 tsconfig.json 路徑設定（paths + baseUrl，會向上查找 tsconfig.json）
    const tsconfigPathConfig = await loadTsconfigPathConfig(projectRoot, context.fileSystem);

    // 建立移動服務
    const moveService = new MoveEngine(context.fileSystem, {
      pathAliases: tsconfigPathConfig.pathAliases,
      baseUrl: tsconfigPathConfig.baseUrl,
      supportedExtensions: ALLOWED_EXTENSIONS,
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
      printSuccess(normalizedSource, normalizedTarget, totalUpdates, result.movedFiles, isJsonFormat, outputHandler);
    } else {
      outputHandler.outputError(result.errors?.join(', ') ?? '執行失敗', format);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  } catch (error) {
    const errorMsg = getErrorMessage(error);
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
  isJsonFormat: boolean,
  outputHandler: UnifiedOutputHandler
): void {
  if (isJsonFormat) {
    outputHandler.outputJson({
      success: true,
      source,
      target,
      moved: movedFiles.length > 0,
      pathUpdates: [], // 向後相容：實際更新已應用，這裡僅保留欄位
      message: `成功移動 ${source} → ${target}，更新了 ${totalUpdates} 個 import`
    }, 2);
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

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, true, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  const isJsonFormat = format === OutputFormat.Json;
  const projectRoot = options.path || process.cwd();

  try {
    // 解析 source 和 target 路徑
    const parsedSource = parsePathLocation(source);
    const parsedTarget = parsePathLocation(target);

    // 確認 source 有位置資訊（type guard）
    if (!hasPositionInfo(parsedSource)) {
      outputHandler.outputError('成員移動需要位置資訊 (file:line 格式)', format);
      process.exitCode = 1;
      return;
    }

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

    // 建立引擎
    const moveMemberEngine = new MoveMemberEngine(
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
        line: parsedSource.line,
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
    const changeset = await moveMemberEngine.generateChangeset(moveMemberOptions);

    // 執行變更類命令統一流程
    if (!isJsonFormat && !options.dryRun) {
      console.log('   執行移動...');
    }

    await executeMutationCommand(changeset, {
      fileSystem: context.fileSystem,
      format,
      dryRun: options.dryRun ?? false,
      outputHandler,
      commandName: 'move'
    });
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    outputHandler.outputError(errorMsg, format, 'move');
    process.exitCode = 1;
  }
}
