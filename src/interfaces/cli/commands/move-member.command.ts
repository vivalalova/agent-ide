/**
 * Move Member 命令
 * 移動程式碼成員（方法、函式、類別等）到新位置
 */

import type { Command } from 'commander';
import * as path from 'path';
import { MoveMemberService, MoveTargetType, MemberType } from '@core/move-member/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { ChangeApplicator, convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
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
      console.log(`   移動成員: ${memberName}`);
      console.log(`   來源: ${path.relative(projectRoot, sourceFilePath)}`);
      console.log(`   目標: ${path.relative(projectRoot, targetFilePath)}`);
    }

    // 取得 ParserRegistry（單例）
    const parserRegistry = ParserRegistry.getInstance();

    // 建立服務
    const moveMemberService = new MoveMemberService(
      parserRegistry,
      context.fileSystem
    );

    // 準備 MoveMember 選項
    const moveMemberOptions = {
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
      updateReferences: options.updateRefs,
      keepReexport: options.keepReexport
    };

    // 生成 Changeset
    const changeset = await moveMemberService.generateChangeset(moveMemberOptions);

    if (!changeset.success) {
      outputHandler.outputError(changeset.errors?.join(', ') ?? '生成變更失敗', format, 'move-member');
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
      outputHandler.outputError(result.errors?.join(', ') ?? '執行失敗', format, 'move-member');
      process.exitCode = 1;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputHandler.outputError(errorMsg, format, 'move-member');
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

