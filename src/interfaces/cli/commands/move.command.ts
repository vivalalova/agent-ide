/**
 * Move 命令
 * 移動檔案或目錄並更新 import 路徑
 */

import type { Command } from 'commander';
import * as path from 'path';
import { MoveService } from '../../../core/move/index.js';
import { convertMovePreview } from '../../../infrastructure/formatters/index.js';
import { createOutputHandler, type OutputFormatOption } from '../preview-output-handler.js';
import type { CommandContext } from './types.js';

/** Move 命令選項 */
interface MoveOptions {
  source?: string;
  target?: string;
  path: string;
  updateImports: boolean;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 move 命令
 */
export function setupMoveCommand(program: Command, context: CommandContext): void {
  program
    .command('move [source] [target]')
    .description('移動檔案或目錄')
    .option('-s, --source <path>', '來源路徑')
    .option('-t, --target <path>', '目標路徑')
    .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
    .option('--update-imports', '自動更新 import 路徑', true)
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (sourceArg, targetArg, options: MoveOptions) => {
      // 支援兩種語法：
      // 1. move <source> <target> (位置參數)
      // 2. move --source <source> --target <target> (選項參數)
      const source = sourceArg || options.source;
      const target = targetArg || options.target;

      if (!source || !target) {
        console.error('必須指定來源和目標路徑');
        console.error('   使用方式: agent-ide move <source> <target>');
        console.error('   或: agent-ide move --source <source> --target <target>');
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      await handleMoveCommand(source, target, options, context);
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
  const isJsonFormat = options.format === 'json';

  if (!isJsonFormat) {
    console.log(`   ${source}   ${target}`);
  }

  try {
    // 檢查源檔案是否存在
    const sourceExists = await context.fileSystem.exists(source);
    if (!sourceExists) {
      outputError(`源檔案找不到: ${source}`, isJsonFormat);
      return;
    }

    // 檢查源和目標是否相同
    const normalizedSource = path.resolve(source);
    const normalizedTarget = path.resolve(target);
    if (normalizedSource === normalizedTarget) {
      // 源和目標相同時，視為 no-op，成功返回
      const message = 'Source and target are identical. No changes made.';
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          message,
          changes: []
        }, null, 2));
      } else {
        console.log(`   ${message}`);
      }
      return;
    }

    // 讀取 tsconfig.json 路徑別名
    const pathAliases = await loadPathAliases(options.path || process.cwd(), context);

    // 建立移動服務
    const moveService = new MoveService(context.fileSystem, {
      pathAliases,
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.swift'],
      includeNodeModules: false
    });

    const moveOperation = {
      source: normalizedSource,
      target: normalizedTarget,
      updateImports: options.updateImports
    };

    const moveOptions = {
      preview: options.dryRun,
      projectRoot: options.path || process.cwd()
    };

    // 執行移動操作
    const result = await moveService.moveFile(moveOperation, moveOptions);

    if (result.success) {
      // Dry-run 模式：使用 PreviewFormatter 輸出
      if (options.dryRun) {
        await handleDryRunOutput(normalizedSource, normalizedTarget, result, options, context);
        return;
      }

      // 實際執行模式
      printSuccess(source, target, result, isJsonFormat);
    } else {
      outputError(result.error || '移動失敗', isJsonFormat);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputError(errorMsg, isJsonFormat);
  }
}

/**
 * 處理 dry-run 輸出
 */
async function handleDryRunOutput(
  source: string,
  target: string,
  result: any,
  options: MoveOptions,
  context: CommandContext
): Promise<void> {
  // 讀取受影響檔案的原始內容
  const originalContents = new Map<string, string>();
  const affectedFiles = new Set<string>(result.pathUpdates.map((u: any) => u.filePath as string));

  for (const filePath of affectedFiles) {
    try {
      const content = await context.fileSystem.readFile(filePath, 'utf-8') as string;
      originalContents.set(filePath, content);
    } catch {
      // 忽略無法讀取的檔案
    }
  }

  // 轉換為統一的 PreviewInput 格式
  const previewInput = convertMovePreview(source, target, result.pathUpdates, originalContents);

  // 使用統一輸出處理器
  const outputHandler = createOutputHandler();
  outputHandler.output(previewInput, (options.format || 'diff') as OutputFormatOption);
}

/**
 * 印出成功訊息
 */
function printSuccess(source: string, target: string, result: any, isJsonFormat: boolean): void {
  if (isJsonFormat) {
    console.log(JSON.stringify({
      success: true,
      source: result.source,
      target: result.target,
      moved: result.moved,
      pathUpdates: result.pathUpdates,
      message: result.message
    }, null, 2));
  } else {
    console.log('   移動成功!');
    console.log(`   統計: ${result.pathUpdates.length} 個 import 需要更新`);

    if (result.pathUpdates.length > 0) {
      console.log('   影響的檔案:');
      const fileGroups = new Map<string, any[]>();

      result.pathUpdates.forEach((update: any) => {
        if (!fileGroups.has(update.filePath)) {
          fileGroups.set(update.filePath, []);
        }
        fileGroups.get(update.filePath)!.push(update);
      });

      for (const [filePath, updates] of fileGroups) {
        console.log(`      ${path.relative(process.cwd(), filePath)}:`);
        updates.forEach((update: any) => {
          console.log(`      第 ${update.line} 行: "${path.basename(source)}"   "${path.basename(target)}"`);
        });
      }
    }
  }
}

/**
 * 輸出錯誤
 */
function outputError(message: string, isJsonFormat: boolean): void {
  if (isJsonFormat) {
    console.log(JSON.stringify({ success: false, error: message }, null, 2));
  } else {
    console.error(`   ${message}`);
  }
  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'test') { process.exit(1); }
}

/**
 * 讀取 tsconfig.json 路徑別名
 */
async function loadPathAliases(
  projectRoot: string,
  context: CommandContext
): Promise<Record<string, string>> {
  const pathAliases: Record<string, string> = {};

  try {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfigContent = await context.fileSystem.readFile(tsconfigPath, 'utf-8') as string;
    const tsconfig = JSON.parse(tsconfigContent);

    if (tsconfig.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
      const basePath = path.resolve(projectRoot, baseUrl);

      for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
        if (Array.isArray(paths) && paths.length > 0) {
          // 移除 /* 後綴
          const cleanAlias = alias.replace(/\/\*$/, '');
          const cleanPath = (paths[0] as string).replace(/\/\*$/, '');
          // 轉換為絕對路徑
          pathAliases[cleanAlias] = path.resolve(basePath, cleanPath);
        }
      }
    }
  } catch {
    // tsconfig.json 不存在或解析失敗，使用空的路徑別名
  }

  return pathAliases;
}
