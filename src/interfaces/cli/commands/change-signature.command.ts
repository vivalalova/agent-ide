/**
 * Change Signature 命令
 * 修改函式簽名並自動更新所有呼叫點
 */

import type { Command } from 'commander';
import * as path from 'path';
import {
  ChangeSignatureService,
  SignatureChangeType,
  type SignatureChange,
  type FunctionSignature,
  type ChangeSignatureResult
} from '@core/change-signature/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { createUnifiedOutputHandler, parseOutputFormat, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';

/** Change Signature 命令選項 */
interface ChangeSignatureOptions {
  path: string;
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
    .command('change-signature <file> <functionName>')
    .description('修改函式簽名並自動更新所有呼叫點')
    .option('-p, --path <path>', '專案根目錄路徑', process.cwd())
    .option('--add <params>', '新增參數 (格式: name:type=default@position,name2:type2)')
    .option('--remove <params>', '移除參數 (參數名稱或索引，逗號分隔)')
    .option('--reorder <order>', '重新排序 (參數名稱或索引，逗號分隔)')
    .option('--rename <mapping>', '重命名參數 (格式: oldName:newName,oldName2:newName2)')
    .option('--change-type <mapping>', '修改參數類型 (格式: name:newType,name2:newType2)')
    .option('--dry-run', '預覽變更而不執行')
    .option('--format <format>', '輸出格式 (diff|json|summary)', 'diff')
    .action(async (file: string, functionName: string, options: ChangeSignatureOptions) => {
      await handleChangeSignatureCommand(file, functionName, options, context);
    });
}

/**
 * 處理 change-signature 命令
 */
async function handleChangeSignatureCommand(
  file: string,
  functionName: string,
  options: ChangeSignatureOptions,
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
    // 解析檔案路徑（如果是絕對路徑則直接使用，否則從 cwd 解析）
    const filePath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    const projectRoot = options.path ? path.resolve(process.cwd(), options.path) : process.cwd();

    // 解析變更操作
    const changes = parseChanges(options);

    if (changes.length === 0) {
      outputHandler.outputError('請指定至少一個變更操作 (--add, --remove, --reorder, --rename, --change-type)', format);
      process.exitCode = 1;
      return;
    }

    if (!isJsonFormat) {
      console.log(`🔧 修改函式簽名: ${functionName}`);
      console.log(`📁 檔案: ${path.relative(process.cwd(), filePath)}`);
    }

    // 取得 ParserRegistry（單例）
    const parserRegistry = ParserRegistry.getInstance();

    // 建立服務
    const changeSignatureService = new ChangeSignatureService(
      parserRegistry,
      context.fileSystem
    );

    // 執行 Change Signature
    const result = await changeSignatureService.changeSignature({
      filePath,
      functionName,
      changes,
      projectRoot,
      preview: options.dryRun
    });

    if (result.success) {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          originalSignature: formatSignatureForJson(result.originalSignature),
          newSignature: formatSignatureForJson(result.newSignature),
          definitionUpdate: {
            filePath: result.definitionUpdate.filePath,
            originalCode: result.definitionUpdate.originalCode,
            newCode: result.definitionUpdate.newCode
          },
          callSiteUpdates: result.callSiteUpdates.map(u => ({
            filePath: u.filePath,
            originalCode: u.originalCode,
            newCode: u.newCode,
            line: u.location.range.start.line
          })),
          executed: result.executed,
          stats: result.stats
        }));
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

/**
 * 格式化簽名為 JSON
 */
function formatSignatureForJson(signature: FunctionSignature): object {
  return {
    name: signature.name,
    parameters: signature.parameters.map((p) => ({
      name: p.name,
      type: p.type,
      optional: p.optional,
      defaultValue: p.defaultValue
    })),
    returnType: signature.returnType,
    isMethod: signature.isMethod,
    className: signature.className,
    modifiers: signature.modifiers
  };
}

/**
 * 印出 diff 輸出
 */
function printDiffOutput(result: ChangeSignatureResult, projectRoot: string): void {
  console.log('\n📝 定義變更:');
  console.log(`--- ${path.relative(projectRoot, result.definitionUpdate.filePath)}`);
  console.log(`+++ ${path.relative(projectRoot, result.definitionUpdate.filePath)}`);
  console.log(`- ${result.definitionUpdate.originalCode}`);
  console.log(`+ ${result.definitionUpdate.newCode}`);

  if (result.callSiteUpdates.length > 0) {
    console.log('\n📞 呼叫點變更:');
    for (const update of result.callSiteUpdates) {
      console.log(`\n--- ${path.relative(projectRoot, update.filePath)}:${update.location.range.start.line}`);
      console.log(`- ${update.originalCode.trim()}`);
      console.log(`+ ${update.newCode.trim()}`);
    }
  }

  console.log('\n' + (result.executed ? '✅ 變更已執行' : '🔍 預覽模式（使用 --dry-run）'));
  console.log(`📊 統計: ${result.stats.callSitesUpdated} 個呼叫點, ${result.stats.filesAffected} 個檔案`);
}

/**
 * 印出摘要輸出
 */
function printSummaryOutput(result: ChangeSignatureResult, projectRoot: string): void {
  console.log('\n✅ 簽名修改成功!');
  console.log(`📝 原始: ${formatSignatureString(result.originalSignature)}`);
  console.log(`📝 新的: ${formatSignatureString(result.newSignature)}`);
  console.log(`📊 更新了 ${result.stats.callSitesUpdated} 個呼叫點，影響 ${result.stats.filesAffected} 個檔案`);

  if (!result.executed) {
    console.log('\n🔍 預覽模式 - 執行時移除 --dry-run');
  }
}

/**
 * 格式化簽名字串
 */
function formatSignatureString(signature: FunctionSignature): string {
  const params = signature.parameters.map((p) => {
    let str = p.name;
    if (p.optional && !p.defaultValue) {str += '?';}
    if (p.type) {str += `: ${p.type}`;}
    if (p.defaultValue) {str += ` = ${p.defaultValue}`;}
    return str;
  }).join(', ');

  let result = `${signature.name}(${params})`;
  if (signature.returnType) {
    result += `: ${signature.returnType}`;
  }
  return result;
}

