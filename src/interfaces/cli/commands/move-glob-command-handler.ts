import * as path from 'path';
import { createGlobMovePlan, resolveGlobPattern, type GlobMovedFile } from '@core/move/glob-move-planner.js';
import { MoveEngine } from '@core/move/move-engine.js';
import { ALLOWED_EXTENSIONS } from '@core/move/path-utils.js';
import {
  ChangesetBuilder,
  ChangesetCommand,
  FileOperationType
} from '@infrastructure/changeset/index.js';
import {
  ensureDirectoryPath,
  executeMutationCommand,
  outputErrorWithDetails,
  tryParseOutputFormat
} from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import type { MoveOptions } from '@interfaces/cli/commands/move-command-options.js';
import {
  createUnifiedOutputHandler,
  OutputFormat
} from '@interfaces/cli/unified-output-handler.js';
import { loadTsconfigPathConfigOrWarn } from '@plugins/typescript/tsconfig-loader.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { formatRelativePath } from '@interfaces/cli/commands/move-path-display.js';

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
  const projectRootInput = options.path || process.cwd();
  const projectRoot = path.resolve(process.cwd(), projectRootInput);
  const projectRootIsDirectory = await ensureDirectoryPath(projectRoot, context.fileSystem, outputHandler, format, {
    role: 'projectRoot',
    inputPath: projectRootInput,
    projectRoot,
    command: 'move'
  });
  if (!projectRootIsDirectory) {
    return;
  }
  const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(projectRoot, target);

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
      outputErrorWithDetails(
        outputHandler,
        format,
        `Glob pattern 無匹配: ${source}`,
        { pathContext: createGlobPathContext(source, target, projectRoot, resolvedTarget) },
        'move'
      );
      process.exitCode = 1;
      return;
    }

    // 解析目標路徑
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
      outputErrorWithDetails(
        outputHandler,
        format,
        `多檔案移動時目標必須是目錄: ${target}`,
        { pathContext: createGlobPathContext(source, target, projectRoot, resolvedTarget) },
        'move'
      );
      process.exitCode = 1;
      return;
    }

    if (!isJsonFormat) {
      console.log(`   Glob: ${source} (${matchedFiles.length} 個檔案)`);
      console.log(`   目標: ${target}`);
    }

    // 讀取 tsconfig 設定
    const tsconfigPathConfig = await loadTsconfigPathConfigOrWarn(projectRoot, context.fileSystem);

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

    // 為每個檔案生成 changeset 並合併；必須標記 Move，禁落成預設 Rename（E2）
    const builder = new ChangesetBuilder().forCommand(ChangesetCommand.Move);

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
        outputErrorWithDetails(
          outputHandler,
          format,
          changeset.errors?.join(', ') ?? `移動失敗: ${sourceFile}`,
          {
            pathContext: {
              ...createGlobPathContext(source, target, projectRoot, resolvedTarget),
              resolvedSource: sourceFile,
              finalTarget: targetFile
            }
          },
          'move'
        );
        process.exitCode = 1;
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
    const totalUpdates = mergedChangeset.textChanges.reduce((sum, tc) => sum + tc.edits.length, 0);
    const legacyFields = createGlobMoveLegacyFields(source, target, projectRoot, resolvedTarget, matchedFiles.length, movePlan.movedFiles);

    if (!isJsonFormat) {
      if (options.dryRun) {
        printGlobPreview(projectRoot, movePlan.movedFiles);
      } else {
        console.log('   執行移動...');
      }
    }

    // 轉換為 PreviewInput、preview 失敗把關、dry-run 輸出、實際套用（帶回滾）與結果輸出統一走共用管線
    await executeMutationCommand(mergedChangeset, {
      fileSystem: context.fileSystem,
      format,
      dryRun: options.dryRun ?? false,
      outputHandler,
      commandName: 'move',
      legacyFields,
      successLegacyFields: {
        ...legacyFields,
        message: `成功移動 ${matchedFiles.length} 個檔案，更新了 ${totalUpdates} 個 import`
      },
      errorFields: { pathContext: createGlobPathContext(source, target, projectRoot, resolvedTarget) },
      onSuccess: () => {
        if (!isJsonFormat) {
          printGlobSuccess(matchedFiles.length, totalUpdates, movePlan.movedFiles);
        }
      }
    });
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    outputHandler.outputError(errorMsg, format);
    process.exitCode = 1;
  }
}

/**
 * 建立 glob 移動 JSON 相容欄位。
 */
function createGlobMoveLegacyFields(
  sourcePattern: string,
  requestedTarget: string,
  projectRoot: string,
  resolvedTarget: string,
  filesCount: number,
  movedFiles: readonly GlobMovedFile[]
): Record<string, unknown> {
  return {
    projectRoot,
    sourcePattern,
    requestedTarget,
    target: resolvedTarget,
    filesCount,
    movedFiles: movedFiles.map(f => ({ from: f.from, to: f.to })),
    pathContext: createGlobPathContext(sourcePattern, requestedTarget, projectRoot, resolvedTarget)
  };
}

function createGlobPathContext(
  sourcePattern: string,
  requestedTarget: string,
  projectRoot: string,
  resolvedTarget: string
): Record<string, unknown> {
  return {
    projectRoot,
    sourcePattern,
    requestedTarget,
    resolvedTarget
  };
}

function printGlobPreview(projectRoot: string, movedFiles: readonly GlobMovedFile[]): void {
  const sortedMovedFiles = [...movedFiles].sort((a, b) => a.from.localeCompare(b.from));
  console.log(`Moved files: ${movedFiles.length} total`);

  const visibleMovedFiles = sortedMovedFiles.slice(0, 10);
  if (movedFiles.length > 10) {
    console.log(`Showing first 10 of ${movedFiles.length} destinations`);
  }

  for (const { from, to } of visibleMovedFiles) {
    console.log(`   ${formatRelativePath(projectRoot, from)} -> ${formatRelativePath(projectRoot, to)}`);
  }

  const omittedCount = movedFiles.length - visibleMovedFiles.length;
  if (omittedCount > 0) {
    console.log(`${omittedCount} more destination(s) omitted`);
  }
}

/**
 * 印出 glob 移動成功訊息
 */
function printGlobSuccess(
  fileCount: number,
  totalUpdates: number,
  movedFiles: readonly GlobMovedFile[]
): void {
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
