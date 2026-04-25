import * as path from 'path';
import { createGlobMovePlan, resolveGlobPattern, type GlobMovedFile } from '@core/move/glob-move-planner.js';
import { MoveEngine } from '@core/move/move-engine.js';
import { ALLOWED_EXTENSIONS } from '@core/move/path-utils.js';
import { ChangeApplicator, ChangesetBuilder, convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
import { FileOperationType } from '@infrastructure/changeset/index.js';
import { tryParseOutputFormat } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import type { MoveOptions } from '@interfaces/cli/commands/move-command-options.js';
import {
  createUnifiedOutputHandler,
  OutputFormat,
  type UnifiedOutputHandler
} from '@interfaces/cli/unified-output-handler.js';
import { loadTsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';
import { getErrorMessage } from '@shared/errors/index.js';

/**
 * 處理 glob pattern 移動命令
 * 比照 Unix mv 行為：展開 glob 並移動所有匹配檔案到目標目錄
 */
export async function handleGlobMoveCommand(
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
  const projectRoot = path.resolve(process.cwd(), options.path || process.cwd());

  try {
    // 展開 glob pattern（使用 IFileSystem 的 glob 方法）
    // 注意：memfs 的 glob 需要用相對路徑 + cwd，不支援絕對路徑 pattern
    const globPattern = resolveGlobPattern(source, projectRoot);
    const matchedFiles = await context.fileSystem.glob(globPattern, {
      cwd: projectRoot,
      onlyFiles: true,
      absolute: true
    });

    if (matchedFiles.length === 0) {
      outputHandler.outputError(`Glob pattern 無匹配: ${source}`, format);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // 解析目標路徑
    const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
    const targetEndsWithSlash = target.endsWith('/') || target.endsWith(path.sep);

    // 檢查目標是否為目錄
    let targetIsDirectory = targetEndsWithSlash;
    if (!targetIsDirectory) {
      try {
        targetIsDirectory = await context.fileSystem.isDirectory(resolvedTarget);
      } catch {
        // graceful-degradation: 目標路徑不存在時視為檔案路徑
        targetIsDirectory = false;
      }
    }

    // 多檔案時，目標必須是目錄
    if (matchedFiles.length > 1 && !targetIsDirectory) {
      outputHandler.outputError(`多檔案移動時目標必須是目錄: ${target}`, format);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    if (!isJsonFormat) {
      console.log(`   Glob: ${source} (${matchedFiles.length} 個檔案)`);
      console.log(`   目標: ${target}`);
    }

    // 讀取 tsconfig 設定
    const tsconfigPathConfig = await loadTsconfigPathConfig(projectRoot, context.fileSystem);

    // 建立移動服務
    const moveService = new MoveEngine(context.fileSystem, {
      pathAliases: tsconfigPathConfig.pathAliases,
      baseUrl: tsconfigPathConfig.baseUrl,
      supportedExtensions: ALLOWED_EXTENSIONS,
      includeNodeModules: false
    });

    const movePlan = createGlobMovePlan({
      sourcePattern: source,
      matchedFiles,
      targetPath: resolvedTarget,
      projectRoot,
      targetIsDirectory
    });

    // 為每個檔案生成 changeset 並合併
    const builder = new ChangesetBuilder();

    for (const { from: sourceFile, to: targetFile } of movePlan.movedFiles) {
      const moveOperation = {
        source: sourceFile,
        target: targetFile,
        updateImports: options.updateImports
      };

      // 傳入 batchMoveInfo 讓服務知道哪些檔案是一起被移動的
      const changeset = await moveService.generateChangeset(moveOperation, {
        projectRoot,
        batchMoveInfo: movePlan.batchMoveInfo
      });

      if (!changeset.success) {
        outputHandler.outputError(changeset.errors?.join(', ') ?? `移動失敗: ${sourceFile}`, format);
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      // 合併 changeset
      for (const tc of changeset.textChanges) {
        builder.addTextChange(tc.filePath, [...tc.edits], tc.operationType);
      }
      for (const fo of changeset.fileOperations) {
        if (fo.type === FileOperationType.Move && fo.targetPath) {
          builder.addFileMove(fo.sourcePath, fo.targetPath);
        } else if (fo.type === FileOperationType.Create) {
          builder.addFileCreate(fo.sourcePath, fo.content ?? '');
        } else if (fo.type === FileOperationType.Delete) {
          builder.addFileDelete(fo.sourcePath);
        }
      }
    }

    const mergedChangeset = builder.build();

    // 轉換為 PreviewInput
    const previewInput = await convertChangesetToPreviewInput(mergedChangeset, context.fileSystem);

    // Dry-run 模式只輸出預覽
    if (options.dryRun) {
      outputHandler.outputMutation(previewInput, format);
      return;
    }

    // 執行移動
    if (!isJsonFormat) {
      console.log('   執行移動...');
    }

    const applicator = new ChangeApplicator(context.fileSystem);
    const result = await applicator.apply(mergedChangeset, {
      atomic: true,
      rollbackOnError: true
    });

    if (result.success) {
      const totalUpdates = mergedChangeset.textChanges.reduce((sum, tc) => sum + tc.edits.length, 0);
      printGlobSuccess(matchedFiles.length, resolvedTarget, totalUpdates, movePlan.movedFiles, isJsonFormat, outputHandler);
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
 * 印出 glob 移動成功訊息
 */
function printGlobSuccess(
  fileCount: number,
  target: string,
  totalUpdates: number,
  movedFiles: readonly GlobMovedFile[],
  isJsonFormat: boolean,
  outputHandler: UnifiedOutputHandler
): void {
  if (isJsonFormat) {
    outputHandler.outputJson({
      success: true,
      filesCount: fileCount,
      target,
      movedFiles: movedFiles.map(f => ({ from: f.from, to: f.to })),
      message: `成功移動 ${fileCount} 個檔案，更新了 ${totalUpdates} 個 import`
    }, 2);
  } else {
    console.log('   移動成功!');
    console.log(`   統計: ${fileCount} 個檔案, ${totalUpdates} 個 import 已更新`);

    if (movedFiles.length > 0 && movedFiles.length <= 10) {
      console.log('   移動的檔案:');
      for (const { from, to } of movedFiles) {
        console.log(`      ${path.relative(process.cwd(), from)} → ${path.relative(process.cwd(), to)}`);
      }
    } else if (movedFiles.length > 10) {
      console.log(`   移動的檔案: ${movedFiles.length} 個 (省略詳細列表)`);
    }
  }
}
