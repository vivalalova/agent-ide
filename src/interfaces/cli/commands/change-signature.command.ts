/**
 * Change Signature 命令
 * 修改函式簽名並自動更新所有呼叫點
 */

import type { Command } from 'commander';
import * as path from 'path';
import {
  ChangeSignatureEngine,
  SignatureChangeType,
  type SignatureChange
} from '@core/change-signature/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { createUnifiedOutputHandler, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import { tryParseOutputFormat, executeMutationCommand } from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';

/** Change Signature 命令選項 */
interface ChangeSignatureOptions {
  path: string;
  file?: string;
  function?: string;
  add?: string;
  remove?: string;
  reorder?: string;
  rename?: string;
  changeType?: string;
  dryRun?: boolean;
  format: string;
}

/**
 * 設定 change-signature 命令
 */
export function setupChangeSignatureCommand(program: Command, context: CommandContext): void {
  program
    .command('change-signature [file] [functionName]')
    .description('修改函式簽名並自動更新所有呼叫點')
    .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
    .option('--file <file>', '要修改的檔案路徑')
    .option('--function <name>', '要修改的函式名稱')
    .option('--add <params>', '新增參數 (格式: name:type=default@position,name2:type2)')
    .option('--remove <params>', '移除參數 (參數名稱或索引，逗號分隔)')
    .option('--reorder <order>', '重新排序 (參數名稱或索引，逗號分隔)')
    .option('--rename <mapping>', '重命名參數 (格式: oldName:newName,oldName2:newName2)')
    .option('--change-type <mapping>', '修改參數類型 (格式: name:newType,name2:newType2)')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (file: string | undefined, functionName: string | undefined, options: ChangeSignatureOptions) => {
      await handleChangeSignatureCommand(file, functionName, options, context);
    });
}

/**
 * 處理 change-signature 命令
 */
async function handleChangeSignatureCommand(
  file: string | undefined,
  functionName: string | undefined,
  options: ChangeSignatureOptions,
  context: CommandContext
): Promise<void> {
  const outputHandler = createUnifiedOutputHandler();

  // 解析輸出格式
  const formatResult = tryParseOutputFormat(options.format, true, outputHandler);
  if (!formatResult.success) {return;}
  const format = formatResult.format;

  const isJsonFormat = format === OutputFormat.Json;
  const resolvedFile = file ?? options.file;
  const resolvedFunctionName = functionName ?? options.function;

  if (!resolvedFile || !resolvedFunctionName) {
    outputHandler.outputError('請指定檔案與函式名稱 (change-signature <file> <functionName> 或 --file <file> --function <name>)', format);
    process.exitCode = 1;
    return;
  }

  try {
    // 解析專案根目錄和檔案路徑
    const projectRoot = options.path ? path.resolve(process.cwd(), options.path) : process.cwd();
    // 檔案路徑相對於 projectRoot 解析（與其他命令一致）
    const filePath = path.isAbsolute(resolvedFile) ? resolvedFile : path.resolve(projectRoot, resolvedFile);

    // 解析變更操作
    const changes = parseChanges(options);

    if (changes.length === 0) {
      outputHandler.outputError('請指定至少一個變更操作 (--add, --remove, --reorder, --rename, --change-type)', format);
      process.exitCode = 1;
      return;
    }

    if (!isJsonFormat) {
      console.log(`   修改函式簽名: ${resolvedFunctionName}`);
      console.log(`   檔案: ${path.relative(process.cwd(), filePath)}`);
    }

    // 取得 ParserRegistry（單例）
    const parserRegistry = ParserRegistry.getInstance();

    // 建立引擎
    const changeSignatureEngine = new ChangeSignatureEngine(
      parserRegistry,
      context.fileSystem
    );

    // 生成 Changeset
    const changeset = await changeSignatureEngine.generateChangeset({
      filePath,
      functionName: resolvedFunctionName,
      changes,
      projectRoot
    });

    // 執行變更類命令統一流程
    if (!isJsonFormat && !options.dryRun) {
      console.log('   執行變更...');
    }

    await executeMutationCommand(changeset, {
      fileSystem: context.fileSystem,
      format,
      dryRun: options.dryRun ?? false,
      outputHandler,
      commandName: 'change-signature'
    });
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    outputHandler.outputError(errorMsg, format, 'change-signature');
    process.exitCode = 1;
  }
}

/**
 * 解析變更操作
 */
function parseChanges(options: ChangeSignatureOptions): SignatureChange[] {
  const changes: SignatureChange[] = [];

  // 解析 --add 參數
  if (options.add) {
    const addParams = options.add.split(',');
    for (const param of addParams) {
      const change = parseAddParameter(param);
      if (change) {
        changes.push(change);
      }
    }
  }

  // 解析 --remove 參數
  if (options.remove) {
    const removeParams = options.remove.split(',');
    for (const param of removeParams) {
      const trimmed = param.trim();
      const nameOrIndex = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : trimmed;
      changes.push({
        type: SignatureChangeType.RemoveParameter,
        parameterNameOrIndex: nameOrIndex
      });
    }
  }

  // 解析 --reorder 參數
  if (options.reorder) {
    const order = options.reorder.split(',').map(p => {
      const trimmed = p.trim();
      return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : trimmed;
    });
    changes.push({
      type: SignatureChangeType.ReorderParameters,
      newOrder: order
    });
  }

  // 解析 --rename 參數
  if (options.rename) {
    const mappings = options.rename.split(',');
    for (const mapping of mappings) {
      const [oldName, newName] = mapping.split(':').map(s => s.trim());
      if (oldName && newName) {
        changes.push({
          type: SignatureChangeType.RenameParameter,
          parameterNameOrIndex: oldName,
          newName
        });
      }
    }
  }

  // 解析 --change-type 參數
  if (options.changeType) {
    const mappings = options.changeType.split(',');
    for (const mapping of mappings) {
      const [name, newType] = mapping.split(':').map(s => s.trim());
      if (name && newType) {
        changes.push({
          type: SignatureChangeType.ChangeParameterType,
          parameterNameOrIndex: name,
          newType
        });
      }
    }
  }

  return changes;
}

/**
 * 解析新增參數
 * 格式: name:type=default@position
 */
function parseAddParameter(param: string): SignatureChange | null {
  const trimmed = param.trim();
  if (!trimmed) {return null;}

  // 解析位置
  let position = -1;
  let paramPart = trimmed;
  const posMatch = trimmed.match(/@(-?\d+)$/);
  if (posMatch) {
    position = parseInt(posMatch[1], 10);
    paramPart = trimmed.slice(0, -posMatch[0].length);
  }

  // 解析預設值
  let defaultValue: string | undefined;
  let nameTypePart = paramPart;
  const defaultMatch = paramPart.match(/=(.+)$/);
  if (defaultMatch) {
    defaultValue = defaultMatch[1];
    nameTypePart = paramPart.slice(0, -defaultMatch[0].length);
  }

  // 解析名稱和類型
  const [name, type] = nameTypePart.split(':').map(s => s.trim());
  if (!name) {return null;}

  return {
    type: SignatureChangeType.AddParameter,
    name,
    parameterType: type || undefined,
    defaultValue,
    optional: !!defaultValue,
    position,
    callSiteValue: defaultValue
  };
}
