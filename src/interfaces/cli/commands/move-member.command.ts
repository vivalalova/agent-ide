/**
 * Move Member 命令
 * 移動程式碼成員（方法、函式、類別等）到新位置
 */

import type { Command } from 'commander';
import * as path from 'path';
import { MoveMemberService, MoveTargetType, MemberType, type MoveMemberResult } from '@core/move-member/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import { createPreviewFormatter } from '@infrastructure/formatters/preview-formatter.js';
import { PreviewCommand, PreviewFormat, type PreviewInput, type LineChange } from '@infrastructure/formatters/types.js';
import { calculateLineChanges } from '@infrastructure/formatters/diff-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Move Member 命令選項 */
interface MoveMemberOptions {
  path: string;
  type?: string;
  class?: string;
  targetFile: string;
  targetClass?: string;
  keepReexport?: boolean;
  updateRefs?: boolean;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 move-member 命令
 */
export function setupMoveMemberCommand(program: Command, context: CommandContext): void {
  program
    .command('move-member <sourceFile> <memberName>')
    .description('移動程式碼成員到新位置')
    .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
    .option('-t, --type <type>', '成員類型 (method|property|function|class|interface|type|constant|enum)')
    .option('-c, --class <name>', '來源類別名稱（若為類別成員）')
    .option('--target-file <file>', '目標檔案路徑（檔案不存在時自動創建）')
    .option('--target-class <name>', '目標類別名稱（移動到類別內）')
    .option('--keep-reexport', '保留原位置的 re-export')
    .option('--update-refs', '更新所有引用（預設為 true）', true)
    .option('--no-update-refs', '不更新引用')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (sourceFile: string, memberName: string, options: MoveMemberOptions) => {
      await handleMoveMemberCommand(sourceFile, memberName, options, context);
    });
}

/**
 * 處理 move-member 命令
 */
async function handleMoveMemberCommand(
  sourceFile: string,
  memberName: string,
  options: MoveMemberOptions,
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

  try {
    // 驗證必要參數
    if (!options.targetFile) {
      outputHandler.outputError('必須指定目標檔案 (--target-file)', format);
      process.exitCode = 1;
      return;
    }

    // 解析檔案路徑
    const projectRoot = options.path || process.cwd();
    const sourceFilePath = path.resolve(projectRoot, sourceFile);
    const targetFilePath = path.resolve(projectRoot, options.targetFile);

    // 解析成員類型
    const memberType = options.type ? parseMemberType(options.type) : undefined;

    // 決定目標類型（服務層會自動判斷檔案是否存在）
    const targetType = options.targetClass
      ? MoveTargetType.ExistingClass
      : MoveTargetType.ExistingFile;

    if (!isJsonFormat) {
      console.log(`📦 移動成員: ${memberName}`);
      console.log(`📁 來源: ${path.relative(projectRoot, sourceFilePath)}`);
      console.log(`📁 目標: ${path.relative(projectRoot, targetFilePath)}`);
    }

    // 取得 ParserRegistry（單例）
    const parserRegistry = ParserRegistry.getInstance();

    // 建立服務
    const moveMemberService = new MoveMemberService(
      parserRegistry,
      context.fileSystem
    );

    // 執行 Move Member
    const result = await moveMemberService.moveMember({
      sourceFile: sourceFilePath,
      memberName,
      memberType,
      sourceClassName: options.class,
      target: {
        type: targetType,
        filePath: targetFilePath,
        className: options.targetClass
      },
      projectRoot,
      preview: options.dryRun,
      updateReferences: options.updateRefs,
      keepReexport: options.keepReexport
    });

    if (result.success) {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          member: {
            name: result.member.name,
            type: result.member.type,
            className: result.member.className
          },
          sourceFileChange: {
            filePath: result.sourceFileChange.filePath
          },
          targetFileChange: {
            filePath: result.targetFileChange.filePath,
            isNewFile: result.targetFileChange.isNewFile
          },
          referenceUpdates: result.referenceUpdates.length,
          executed: result.executed,
          stats: result.stats
        }, null, 2));
      } else if (format === OutputFormat.Diff) {
        printDiffOutput(result, projectRoot);
      } else {
        printSummaryOutput(result, projectRoot);
      }
    } else {
      outputHandler.outputError(result.error || '未知錯誤', format);
      process.exitCode = 1;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(errorMsg, format);
    process.exitCode = 1;
  }
}

/**
 * 解析成員類型
 */
function parseMemberType(typeStr: string): MemberType | undefined {
  const typeMap: Record<string, MemberType> = {
    'method': MemberType.Method,
    'property': MemberType.Property,
    'function': MemberType.Function,
    'class': MemberType.Class,
    'interface': MemberType.Interface,
    'type': MemberType.TypeAlias,
    'constant': MemberType.Constant,
    'enum': MemberType.Enum
  };
  return typeMap[typeStr.toLowerCase()];
}

/**
 * 印出 diff 輸出
 * 使用統一的 PreviewFormatter 生成實際的程式碼差異
 */
function printDiffOutput(result: MoveMemberResult, projectRoot: string): void {
  const previewInput = convertToPreviewInput(result, projectRoot);
  const formatter = createPreviewFormatter({ color: process.stdout.isTTY ?? false });
  const previewResult = formatter.createPreview(previewInput);
  const output = formatter.format(previewResult, PreviewFormat.Diff);

  console.log(output);
  console.log('');
  console.log(result.executed ? '✅ 變更已執行' : '🔍 預覽模式');
}

/**
 * 將 MoveMemberResult 轉換為 PreviewInput
 */
function convertToPreviewInput(result: MoveMemberResult, projectRoot: string): PreviewInput {
  const fileChanges: PreviewInput['fileChanges'] = [];

  // 來源檔案變更（移除成員）
  const sourceChanges = calculateLineChanges(
    result.sourceFileChange.originalCode,
    result.sourceFileChange.newCode
  );
  fileChanges.push({
    filePath: path.relative(projectRoot, result.sourceFileChange.filePath),
    originalContent: result.sourceFileChange.originalCode,
    changes: sourceChanges
  });

  // 目標檔案變更（加入成員）
  const targetOriginal = result.targetFileChange.originalCode ?? '';
  const targetChanges = calculateLineChanges(
    targetOriginal,
    result.targetFileChange.newCode
  );
  fileChanges.push({
    filePath: path.relative(projectRoot, result.targetFileChange.filePath),
    originalContent: targetOriginal,
    changes: targetChanges
  });

  // 引用更新
  for (const refUpdate of result.referenceUpdates) {
    const refChanges: LineChange[] = [{
      line: refUpdate.location.range.start.line,
      oldContent: refUpdate.originalImport,
      newContent: refUpdate.newImport
    }];
    fileChanges.push({
      filePath: path.relative(projectRoot, refUpdate.filePath),
      originalContent: refUpdate.originalImport,
      changes: refChanges
    });
  }

  return {
    command: PreviewCommand.Move,
    success: true,
    fileChanges,
    operationDescription: `移動成員 '${result.member.name}' (${result.member.type})`
  };
}

/**
 * 印出摘要輸出
 */
function printSummaryOutput(result: any, projectRoot: string): void {
  console.log('\n✅ 成員移動成功!');
  console.log(`📦 成員: ${result.member.name} (${result.member.type})`);
  console.log(`📁 從: ${path.relative(projectRoot, result.sourceFileChange.filePath)}`);
  console.log(`📁 到: ${path.relative(projectRoot, result.targetFileChange.filePath)}`);
  console.log(`📊 更新了 ${result.stats.referencesUpdated} 個引用，影響 ${result.stats.filesAffected} 個檔案`);

  if (!result.executed) {
    console.log('\n🔍 預覽模式 - 執行時移除 --dry-run');
  }
}

