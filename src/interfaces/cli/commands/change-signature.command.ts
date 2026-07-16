/**
 * Change Signature 命令
 * 修改函式簽名並自動更新所有呼叫點
 */

import type { Command } from 'commander';
import { parse as parseJavaScript, type ParserPlugin } from '@babel/parser';
import * as path from 'path';
import * as ts from 'typescript';
import {
  ChangeSignatureEngine,
  SignatureChangeType,
  type SignatureChange,
  type AddParameterChange
} from '@core/change-signature/index.js';
import { ParserRegistry } from '@infrastructure/parser/registry.js';
import { convertChangesetToPreviewInput } from '@infrastructure/changeset/index.js';
import { createUnifiedOutputHandler, OutputFormat } from '@interfaces/cli/unified-output-handler.js';
import {
  tryParseOutputFormat,
  executeMutationCommand,
  outputMutationWithLegacyFields,
  outputErrorWithDetails
} from '@interfaces/cli/command-utils.js';
import type { CommandContext } from '@interfaces/cli/commands/types.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { isJavaScriptSourceExtension } from '@shared/types/index.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  ParserCapabilityName,
  getUnsupportedParserCapabilityMessage
} from '@interfaces/cli/parser-capability-guard.js';
import { loadTsconfigPathConfigOrWarn } from '@plugins/typescript/tsconfig-loader.js';

/** Change Signature 命令選項 */
interface ChangeSignatureOptions {
  path?: string;
  file?: string;
  function?: string;
  add?: string | string[];
  callSiteValue?: string[];
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
    .option('-p, --path <path>', '專案根目錄路徑')
    .option('--file <file>', '要修改的檔案路徑')
    .option('--function <name>', '要修改的函式名稱')
    .option('--add <params>', '新增參數 (格式: name:type=default@position,name2:type2=default2，可重複)', collectRepeatedOption)
    .option(
      '--call-site-value <mapping>',
      '新增參數在呼叫點使用的值 (格式: param=expression，可重複；--add 仍需 default；未指定時使用 default)',
      collectRepeatedOption
    )
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
    const { projectRoot, filePath } = await resolveChangeSignaturePaths({
      resolvedFile,
      pathOption: options.path,
      cwd: process.cwd(),
      fileSystem: context.fileSystem
    });

    // 檔案存在性前置檢查（與 engine 「找不到函式」分流）
    if (!(await context.fileSystem.exists(filePath))) {
      outputErrorWithDetails(
        outputHandler,
        format,
        `檔案不存在: ${filePath}`,
        {
          pathContext: {
            role: 'targetFile',
            requestedFile: resolvedFile,
            resolvedFile: filePath,
            projectRoot
          }
        },
        'change-signature'
      );
      process.exitCode = 1;
      return;
    }

    // 取得 ParserRegistry（單例）
    const parserRegistry = ParserRegistry.getInstance();
    const unsupportedCapability = getUnsupportedParserCapabilityMessage(
      filePath,
      parserRegistry,
      ParserCapabilityName.ChangeSignature
    );
    if (unsupportedCapability) {
      outputHandler.outputError(unsupportedCapability, format, 'change-signature');
      process.exitCode = 1;
      return;
    }

    // 解析變更操作
    const changes = parseChangeSignatureChanges({
      ...options,
      targetFilePath: filePath
    });

    if (changes.length === 0) {
      outputHandler.outputError('請指定至少一個變更操作 (--add, --remove, --reorder, --rename, --change-type)', format);
      process.exitCode = 1;
      return;
    }

    if (!isJsonFormat) {
      console.log(`   修改函式簽名: ${resolvedFunctionName}`);
      console.log(`   檔案: ${path.relative(process.cwd(), filePath)}`);
    }

    // 讀取 tsconfig.json 路徑設定（paths + baseUrl），比照 file-move 讓引擎解析任意別名 import
    const tsconfigPathConfig = await loadTsconfigPathConfigOrWarn(projectRoot, context.fileSystem);

    // 建立引擎
    const changeSignatureEngine = new ChangeSignatureEngine(
      parserRegistry,
      context.fileSystem,
      {
        pathAliases: tsconfigPathConfig.pathAliases,
        baseUrl: tsconfigPathConfig.baseUrl
      }
    );

    // 生成 Changeset
    const changeset = await changeSignatureEngine.generateChangeset({
      filePath,
      functionName: resolvedFunctionName,
      changes,
      projectRoot
    });

    // No-op 偵測：success=true 但套用後 previewInput 為空（typical reorder 同序）
    if (changeset.success) {
      const previewInput = await convertChangesetToPreviewInput(changeset, context.fileSystem);
      // 轉換失敗（如重疊 edits）不得當 noop 成功；空 fileChanges 且 success 才是真 noop
      if (!previewInput.success) {
        const message = previewInput.errors?.join(', ') ?? '生成預覽失敗';
        outputHandler.outputError(message, format, 'change-signature');
        process.exitCode = 1;
        return;
      }

      if (previewInput.fileChanges.length === 0) {
        const message = `無實質變更：函式 ${resolvedFunctionName} 在套用變更後與原狀相同`;
        if (isJsonFormat) {
          outputMutationWithLegacyFields(outputHandler, previewInput, format, {
            noop: true,
            message
          });
        } else {
          console.log(message);
        }
        return;
      }

      // Dry-run 印出簽名變更摘要（仿 move fix 的 `Renamed:` 行）
      if (options.dryRun) {
        const sigChange = parseSignatureDescription(changeset.description);
        if (!isJsonFormat && changeset.description) {
          console.log(changeset.description);
        }
        if (isJsonFormat) {
          outputMutationWithLegacyFields(outputHandler, previewInput, format, {
            signatureChange: sigChange
          });
          return;
        }
        outputHandler.outputMutation(previewInput, format);
        return;
      }
    }

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
 * 從 changeset.description 解析簽名變更摘要
 * 來源格式：`Changed signature of <name>: (<before>) -> (<after>)`
 */
function parseSignatureDescription(
  description: string | undefined
): { name: string; before: string; after: string } | undefined {
  if (!description) {
    return undefined;
  }

  const match = description.match(/^Changed signature of (\S+):\s*\((.*)\) -> \((.*)\)$/);
  if (!match) {
    return undefined;
  }

  return {
    name: match[1],
    before: match[2],
    after: match[3]
  };
}

export interface ResolveChangeSignaturePathsOptions {
  resolvedFile: string;
  pathOption?: string;
  cwd: string;
  fileSystem: IFileSystem;
}

export interface ResolvedChangeSignaturePaths {
  projectRoot: string;
  filePath: string;
}

export async function resolveChangeSignaturePaths(
  options: ResolveChangeSignaturePathsOptions
): Promise<ResolvedChangeSignaturePaths> {
  if (options.pathOption) {
    const projectRoot = path.resolve(options.cwd, options.pathOption);
    return {
      projectRoot,
      filePath: path.isAbsolute(options.resolvedFile)
        ? options.resolvedFile
        : path.resolve(projectRoot, options.resolvedFile)
    };
  }

  const filePath = path.isAbsolute(options.resolvedFile)
    ? options.resolvedFile
    : path.resolve(options.cwd, options.resolvedFile);
  const projectRoot = await findNearestProjectRoot(filePath, options.fileSystem) ?? options.cwd;

  return { projectRoot, filePath };
}

async function findNearestProjectRoot(filePath: string, fileSystem: IFileSystem): Promise<string | undefined> {
  let currentDir = path.dirname(filePath);

  while (currentDir !== path.dirname(currentDir)) {
    const markers = ['package.json', 'tsconfig.json', '.git'];
    for (const marker of markers) {
      if (await fileSystem.exists(path.join(currentDir, marker))) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return undefined;
}

/**
 * 解析變更操作
 */
function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export interface ChangeSignatureParseOptions {
  add?: string | readonly string[];
  callSiteValue?: readonly string[];
  targetFilePath?: string;
  remove?: string;
  reorder?: string;
  rename?: string;
  changeType?: string;
}

export function parseChangeSignatureChanges(options: ChangeSignatureParseOptions): SignatureChange[] {
  const changes: SignatureChange[] = [];
  const syntaxMode = getSyntaxValidationMode(options.targetFilePath);
  const callSiteValues = parseCallSiteValueMappings(options.callSiteValue ?? [], syntaxMode);
  const addedParameterNames = new Set<string>();

  // 解析 --add 參數
  if (options.add) {
    const addParams = splitAddParameters(options.add);
    for (const param of addParams) {
      const change = parseAddParameter(param, callSiteValues, syntaxMode);
      if (change) {
        changes.push(change);
        addedParameterNames.add(change.name);
      }
    }
  }

  const unknownCallSiteParameters = [...callSiteValues.keys()].filter(name => !addedParameterNames.has(name));
  if (unknownCallSiteParameters.length > 0) {
    throw new Error(`--call-site-value 只能指定本次 --add 新增的參數: ${unknownCallSiteParameters.join(', ')}`);
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
  // 與 --add 共用深度感知切割：只在頂層逗號切 mapping、只在第一個冒號切名稱/型別，
  // 避免箭頭型別（`(e: Event) => void`）的冒號或泛型（`Map<string, number>`）的逗號被天真切斷。
  if (options.changeType) {
    const mappings = splitTopLevelParameterList(options.changeType);
    for (const mapping of mappings) {
      const { name, type: newType } = splitParameterNameAndType(mapping);
      if (!name || !newType) {
        throw new Error(`無效的 --change-type 語法: ${mapping}。格式: name:newType`);
      }
      validateParameterType(name, newType, syntaxMode);
      changes.push({
        type: SignatureChangeType.ChangeParameterType,
        parameterNameOrIndex: name,
        newType
      });
    }
  }

  return changes;
}

/**
 * 解析新增參數
 * 格式: name:type=default@position
 */
function parseAddParameter(
  param: string,
  callSiteValues: ReadonlyMap<string, string>,
  syntaxMode: SyntaxValidationMode
): AddParameterChange | null {
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
  const defaultSeparatorIndex = paramPart.indexOf('=');
  if (defaultSeparatorIndex >= 0) {
    defaultValue = paramPart.slice(defaultSeparatorIndex + 1);
    nameTypePart = paramPart.slice(0, defaultSeparatorIndex);
    if (!defaultValue.trim()) {
      throw new Error(`無效的 --add 參數語法: ${param}`);
    }
  }

  // 解析名稱和類型（與 --change-type 共用第一個冒號切法）
  const { name, type } = splitParameterNameAndType(nameTypePart);
  if (!name) {
    throw new Error(`無效的 --add 參數語法: ${param}`);
  }
  validateParameterName(name);
  validateParameterType(name, type, syntaxMode);
  const normalizedDefaultValue = normalizeDefaultValue(type, defaultValue);
  const explicitCallSiteValue = callSiteValues.get(name);
  if (normalizedDefaultValue) {
    validateAddDefaultExpression(name, normalizedDefaultValue, syntaxMode);
  }
  if (explicitCallSiteValue !== undefined && !normalizedDefaultValue) {
    throw new Error(`--call-site-value ${name} 需要 --add 為該參數指定 function default`);
  }

  return {
    type: SignatureChangeType.AddParameter,
    name,
    parameterType: type || undefined,
    defaultValue: normalizedDefaultValue,
    optional: !!normalizedDefaultValue,
    position,
    callSiteValue: explicitCallSiteValue ?? normalizedDefaultValue
  };
}

interface SyntaxValidationMode {
  readonly language: 'typescript' | 'javascript';
  readonly jsx: boolean;
}

function getSyntaxValidationMode(targetFilePath: string | undefined): SyntaxValidationMode {
  const extension = targetFilePath ? path.extname(targetFilePath) : '';
  return {
    language: isJavaScriptSourceExtension(extension) ? 'javascript' : 'typescript',
    jsx: extension === '.jsx' || extension === '.tsx'
  };
}

function parseCallSiteValueMappings(
  mappings: readonly string[],
  syntaxMode: SyntaxValidationMode
): Map<string, string> {
  const result = new Map<string, string>();

  for (const mapping of mappings) {
    const trimmed = mapping.trim();
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
      throw new Error(`無效的 --call-site-value 語法: ${mapping}。格式: param=expression`);
    }

    const parameterName = trimmed.slice(0, separatorIndex).trim();
    const expression = trimmed.slice(separatorIndex + 1).trim();
    if (!parameterName || !expression) {
      throw new Error(`無效的 --call-site-value 語法: ${mapping}。格式: param=expression`);
    }
    if (result.has(parameterName)) {
      throw new Error(`--call-site-value 重複指定參數: ${parameterName}`);
    }

    validateCallSiteExpression(parameterName, expression, syntaxMode);
    result.set(parameterName, expression);
  }

  return result;
}

function validateParameterName(parameterName: string): void {
  try {
    const ast = parseJavaScript(`function __agentIdeValidate(${parameterName}) {}`, { sourceType: 'module' });
    const declaration = ast.program.body[0];
    if (
      declaration?.type !== 'FunctionDeclaration'
      || declaration.params.length !== 1
      || declaration.params[0]?.type !== 'Identifier'
      || declaration.params[0].name !== parameterName
    ) {
      throw new Error('not a plain identifier');
    }
  } catch {
    throw new Error(`無效的 --add 參數名稱: ${parameterName}`);
  }
}

function validateParameterType(
  parameterName: string,
  parameterType: string | undefined,
  syntaxMode: SyntaxValidationMode
): void {
  if (!parameterType || syntaxMode.language === 'javascript') {
    return;
  }

  const message = getTypeScriptSyntaxError(`type __AgentIdeParameterType = ${parameterType};`);
  if (message) {
    throw new Error(`--add ${parameterName} type 無效: ${message}`);
  }
}

function validateCallSiteExpression(
  parameterName: string,
  expression: string,
  syntaxMode: SyntaxValidationMode
): void {
  const message = getExpressionSyntaxError(expression, syntaxMode);
  if (message) {
    throw new Error(`--call-site-value ${parameterName} expression 無效: ${message}`);
  }
}

function validateAddDefaultExpression(
  parameterName: string,
  expression: string,
  syntaxMode: SyntaxValidationMode
): void {
  const message = getParameterDefaultSyntaxError(expression, syntaxMode);
  if (message) {
    throw new Error(`--add ${parameterName} default 無效: ${message}`);
  }
}

function getParameterDefaultSyntaxError(expression: string, syntaxMode: SyntaxValidationMode): string | undefined {
  try {
    parseJavaScript(`function __agentIdeDefault(__value = ${expression}) {}`, {
      sourceType: 'module',
      plugins: getBabelPlugins(syntaxMode, syntaxMode.language === 'typescript')
    });
    return undefined;
  } catch (error) {
    return `${syntaxMode.language === 'javascript' ? 'JavaScript' : 'TypeScript'} parameter default 無效: ${getErrorMessage(error)}`;
  }
}

function getExpressionSyntaxError(expression: string, syntaxMode: SyntaxValidationMode): string | undefined {
  if (syntaxMode.language === 'javascript') {
    try {
      parseJavaScript(`const __agentIdeCallSiteValue = (${expression});`, {
        sourceType: 'module',
        plugins: getBabelPlugins(syntaxMode, false)
      });
      return undefined;
    } catch (error) {
      return `JavaScript expression 無效: ${getErrorMessage(error)}`;
    }
  }

  return getTypeScriptSyntaxError(`const __agentIdeCallSiteValue = (${expression});`, syntaxMode);
}

function getBabelPlugins(syntaxMode: SyntaxValidationMode, includeTypeScript: boolean): ParserPlugin[] {
  const plugins: ParserPlugin[] = [];
  if (includeTypeScript) {
    plugins.push('typescript');
  }
  if (syntaxMode.jsx) {
    plugins.push('jsx');
  }
  return plugins;
}

function getTypeScriptSyntaxError(source: string, syntaxMode?: SyntaxValidationMode): string | undefined {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.Latest
  };
  if (syntaxMode?.jsx) {
    compilerOptions.jsx = ts.JsxEmit.Preserve;
  }

  const diagnostics = ts.transpileModule(source, {
    compilerOptions,
    fileName: syntaxMode?.jsx ? '__agentIdeExpression.tsx' : '__agentIdeExpression.ts',
    reportDiagnostics: true
  }).diagnostics ?? [];

  const syntaxErrors = diagnostics.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  if (syntaxErrors.length === 0) {
    return undefined;
  }

  return ts.flattenDiagnosticMessageText(syntaxErrors[0].messageText, ' ');
}

function splitAddParameters(add: string | readonly string[]): string[] {
  const addInputs = Array.isArray(add) ? add : [add];
  return addInputs.flatMap(input => splitTopLevelParameterList(input));
}

/**
 * 從參數規格切出名稱與型別。
 * 名稱恆為識別符（不含冒號），故取「第一個冒號」為分界即可正確保留含冒號/箭頭的型別。
 * 由 --add 與 --change-type 共用（SSOT）。
 */
function splitParameterNameAndType(input: string): { name: string; type: string } {
  const separatorIndex = input.indexOf(':');
  if (separatorIndex < 0) {
    return { name: input.trim(), type: '' };
  }
  return {
    name: input.slice(0, separatorIndex).trim(),
    type: input.slice(separatorIndex + 1).trim()
  };
}

/**
 * 深度感知的頂層逗號切割：把逗號分隔的參數規格清單切成個別條目。
 * 追蹤引號、()、[]、{}、<> 巢狀深度，僅在頂層逗號（且其後緊接一個新參數規格）處切分，
 * 避免型別內的逗號（如泛型 `Map<string, number>`）被誤切。
 * 由 --add 與 --change-type 共用（SSOT）。
 */
function splitTopLevelParameterList(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '\'' | '"' | '`' | null = null;
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let insideDefaultValue = false;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quote) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') { parenDepth += 1; }
    if (char === ')') { parenDepth = Math.max(0, parenDepth - 1); }
    if (char === '[') { bracketDepth += 1; }
    if (char === ']') { bracketDepth = Math.max(0, bracketDepth - 1); }
    if (char === '{') { braceDepth += 1; }
    if (char === '}') { braceDepth = Math.max(0, braceDepth - 1); }
    if (!insideDefaultValue) {
      if (char === '<') { angleDepth += 1; }
      if (char === '>') { angleDepth = Math.max(0, angleDepth - 1); }
    }

    const atTopLevel = isAtTopLevelParameterSyntax(parenDepth, bracketDepth, braceDepth, angleDepth);
    if (char === '=' && !insideDefaultValue && atTopLevel) {
      insideDefaultValue = true;
    }

    if (
      char === ','
      && atTopLevel
      && startsAddParameterSpec(input, index + 1)
    ) {
      parts.push(current.trim());
      current = '';
      insideDefaultValue = false;
      angleDepth = 0;
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function isAtTopLevelParameterSyntax(
  parenDepth: number,
  bracketDepth: number,
  braceDepth: number,
  angleDepth: number
): boolean {
  return parenDepth === 0
    && bracketDepth === 0
    && braceDepth === 0
    && angleDepth === 0;
}

function startsAddParameterSpec(input: string, startIndex: number): boolean {
  let index = startIndex;
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }

  if (!isIdentifierStart(input[index])) {
    return false;
  }

  index += 1;
  while (index < input.length && isIdentifierPart(input[index])) {
    index += 1;
  }
  while (index < input.length && /\s/.test(input[index])) {
    index += 1;
  }

  return index >= input.length
    || input[index] === ':'
    || input[index] === '='
    || input[index] === '@'
    || input[index] === ',';
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[$_\p{ID_Start}]/u.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[$_\u200C\u200D\p{ID_Continue}]/u.test(char);
}

function normalizeDefaultValue(parameterType: string | undefined, defaultValue: string | undefined): string | undefined {
  if (defaultValue === undefined) {
    return undefined;
  }

  const trimmed = defaultValue.trim();
  if (parameterType !== 'string' || isStringLiteral(trimmed) || isNullishLiteral(trimmed)) {
    return trimmed;
  }

  return `'${trimmed.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
}

function isStringLiteral(value: string): boolean {
  return (value.startsWith('\'') && value.endsWith('\''))
    || (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('`') && value.endsWith('`'));
}

function isNullishLiteral(value: string): boolean {
  return value === 'undefined' || value === 'null';
}
