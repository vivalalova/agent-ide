/**
 * CLI 命令共用工具
 * 提供格式驗證和變更類命令執行的共用邏輯
 */

import * as path from 'path';
import { ChangeApplicator, convertChangesetToPreviewInput, type Changeset } from '@infrastructure/changeset/index.js';
import { PreviewCommand, type PreviewInput } from '@infrastructure/formatters/index.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { getErrorMessage } from '@shared/errors/index.js';
import {
  createUnifiedOutputHandler,
  parseOutputFormat,
  OutputFormat,
  type UnifiedOutputHandler
} from '@interfaces/cli/unified-output-handler.js';

/** 格式驗證結果（使用 discriminated union 以支援類型收窄） */
export type FormatParseResult =
  | { success: true; format: OutputFormat }
  | { success: false; format?: undefined };

export interface PathValidationDetails {
  role?: string;
  inputPath?: string;
  projectRoot?: string;
  command?: string;
  extraContext?: Record<string, unknown>;
}

/**
 * 嘗試解析輸出格式，失敗時自動輸出錯誤並設定 exitCode
 *
 * @param formatStr - 格式字串
 * @param allowDiff - 是否允許 diff 格式
 * @param outputHandler - 輸出處理器（可選，會自動建立）
 * @returns 格式解析結果
 *
 * @example
 * ```typescript
 * const result = tryParseOutputFormat(options.format, true);
 * if (!result.success) return;
 * const format = result.format;
 * ```
 */
export function tryParseOutputFormat(
  formatStr: string,
  allowDiff: boolean,
  outputHandler?: UnifiedOutputHandler
): FormatParseResult {
  const handler = outputHandler ?? createUnifiedOutputHandler();
  try {
    const format = parseOutputFormat(formatStr, allowDiff);
    return { success: true, format };
  } catch (error) {
    const message = getErrorMessage(error);
    handler.outputError(message, OutputFormat.Summary);
    process.exitCode = 1;
    return { success: false };
  }
}

/**
 * 嚴格解析 CLI 選項為整數：僅接受全為數字的字串，拒絕如 "10abc" 的尾隨非數字字元
 * （`parseInt` 對此類輸入會靜默截斷而非回傳 NaN，導致無效輸入被誤判為合法）
 * @param value 原始選項字串
 * @returns 解析成功回傳整數，字串含非數字字元則回傳 null
 */
export function parseStrictInt(value: string): number | null {
  return /^\d+$/.test(value) ? parseInt(value, 10) : null;
}

/**
 * 驗證 CLI 輸入路徑存在，失敗時輸出統一錯誤並設定 exitCode。
 */
export async function ensurePathExists(
  pathToCheck: string,
  fileSystem: IFileSystem,
  outputHandler: UnifiedOutputHandler,
  format: OutputFormat,
  details: PathValidationDetails = {}
): Promise<boolean> {
  const exists = await fileSystem.exists(pathToCheck);
  if (!exists) {
    const message = details.role === 'projectRoot'
      ? `project root 路徑不存在: ${pathToCheck}`
      : `路徑不存在: ${pathToCheck}`;
    outputErrorWithDetails(
      outputHandler,
      format,
      message,
      { pathContext: createPathValidationContext(pathToCheck, 'exists', details) },
      details.command
    );
    process.exitCode = 1;
    return false;
  }

  return true;
}

/**
 * 驗證 CLI 輸入路徑存在且為目錄。
 */
export async function ensureDirectoryPath(
  pathToCheck: string,
  fileSystem: IFileSystem,
  outputHandler: UnifiedOutputHandler,
  format: OutputFormat,
  details: PathValidationDetails = {}
): Promise<boolean> {
  const exists = await ensurePathExists(pathToCheck, fileSystem, outputHandler, format, details);
  if (!exists) {
    return false;
  }

  const isDirectory = await fileSystem.isDirectory(pathToCheck);
  if (!isDirectory) {
    const message = details.role === 'projectRoot'
      ? `project root 路徑不是目錄: ${pathToCheck}`
      : `路徑不是目錄: ${pathToCheck}`;
    outputErrorWithDetails(
      outputHandler,
      format,
      message,
      { pathContext: createPathValidationContext(pathToCheck, 'directory', details) },
      details.command
    );
    process.exitCode = 1;
    return false;
  }

  return true;
}

export function outputErrorWithDetails(
  outputHandler: UnifiedOutputHandler,
  format: OutputFormat,
  message: string,
  extraFields: Record<string, unknown>,
  command?: string
): void {
  if (format === OutputFormat.Json) {
    outputHandler.outputJson({
      success: false,
      error: message,
      ...(command ? { command } : {}),
      ...extraFields
    });
    return;
  }

  outputHandler.outputError(formatErrorMessage(message, extraFields), format, command);
}

function createPathValidationContext(
  pathToCheck: string,
  expected: string,
  details: PathValidationDetails
): Record<string, unknown> {
  return {
    role: details.role ?? 'path',
    inputPath: details.inputPath ?? pathToCheck,
    resolvedPath: path.resolve(pathToCheck),
    expected,
    ...(details.projectRoot ? { projectRoot: details.projectRoot } : {}),
    ...(details.extraContext ?? {})
  };
}

function formatErrorMessage(message: string, extraFields: Record<string, unknown>): string {
  const context = extraFields.pathContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return message;
  }

  const entries = Object.entries(context as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.length > 0
    ? `${message}\n${entries.join('\n')}`
    : message;
}

/** 變更類命令執行選項 */
export interface MutationExecutionOptions {
  /** 檔案系統 */
  fileSystem: IFileSystem;
  /** 輸出格式 */
  format: OutputFormat;
  /** 是否為 dry-run 模式 */
  dryRun: boolean;
  /** 輸出處理器 */
  outputHandler: UnifiedOutputHandler;
  /** 命令名稱（用於錯誤輸出） */
  commandName?: string;
  /** 執行成功後的回調（可選，用於輸出額外資訊） */
  onSuccess?: (previewInput: PreviewInput) => void;
  /** JSON 輸出時額外保留的命令專屬欄位（dry-run 與實際套用共用；如需套用成功後才有的欄位見 successLegacyFields） */
  legacyFields?: Record<string, unknown>;
  /** 實際套用成功後 JSON 輸出的專屬欄位；未提供則沿用 legacyFields。用於 dry-run 預覽與套用成功的 JSON 契約有差異的命令（如 move 的 renames→moved/message 轉換） */
  successLegacyFields?: Record<string, unknown>;
  /** 錯誤輸出時額外保留的命令專屬欄位 */
  errorFields?: Record<string, unknown>;
}

/** 變更類命令執行結果 */
export interface MutationExecutionResult {
  /** 是否執行成功 */
  success: boolean;
  /** PreviewInput（用於輸出） */
  previewInput?: PreviewInput;
}

/**
 * 建立無檔案變更的 mutation preview input。
 */
export function createEmptyMutationPreviewInput(
  command: PreviewCommand,
  operationDescription: string
): PreviewInput {
  return {
    command,
    success: true,
    fileChanges: [],
    operationDescription
  };
}

/**
 * 輸出 mutation 結果，JSON 模式保留既有命令欄位並補齊統一 PreviewResult 欄位。
 */
export function outputMutationWithLegacyFields(
  outputHandler: UnifiedOutputHandler,
  input: PreviewInput,
  format: OutputFormat,
  legacyFields: Record<string, unknown> = {}
): void {
  if (format === OutputFormat.Json) {
    const result = outputHandler.createMutationResult(input);
    outputHandler.outputJson({ ...legacyFields, ...result }, 2);
    return;
  }

  outputHandler.outputMutation(input, format);
}

/**
 * 執行變更類命令的統一流程
 *
 * 流程：
 * 1. 檢查 changeset.success
 * 2. 轉換為 PreviewInput
 * 3. 檢查 previewInput.success（轉換失敗不得當成功）
 * 4. dry-run 時僅輸出預覽
 * 5. 實際執行時應用變更（atomic + rollbackOnError）
 * 6. 輸出結果
 *
 * @param changeset - 生成的 Changeset
 * @param options - 執行選項
 * @returns 執行結果
 *
 * @example
 * ```typescript
 * const changeset = await service.generateChangeset(options);
 * const result = await executeMutationCommand(changeset, {
 *   fileSystem: context.fileSystem,
 *   format,
 *   dryRun: options.dryRun,
 *   outputHandler,
 *   commandName: 'rename'
 * });
 * if (!result.success) return;
 * ```
 */
export async function executeMutationCommand(
  changeset: Changeset,
  options: MutationExecutionOptions
): Promise<MutationExecutionResult> {
  const { fileSystem, format, dryRun, outputHandler, commandName, onSuccess, legacyFields, successLegacyFields, errorFields } = options;

  // 1. 檢查 changeset 是否成功
  if (!changeset.success) {
    const message = changeset.errors?.join(', ') ?? '生成變更失敗';
    if (errorFields) {
      outputErrorWithDetails(outputHandler, format, message, errorFields, commandName);
    } else {
      outputHandler.outputError(
        message,
        format,
        commandName
      );
    }
    process.exitCode = 1;
    return { success: false };
  }

  // 2. 轉換為 PreviewInput
  const previewInput = await convertChangesetToPreviewInput(changeset, fileSystem);

  // 3. 轉換失敗（如重疊 edits）時 dry-run / apply 皆不得當成功
  if (!previewInput.success) {
    const message = previewInput.errors?.join(', ') ?? '生成預覽失敗';
    if (errorFields) {
      outputErrorWithDetails(outputHandler, format, message, errorFields, commandName);
    } else {
      outputHandler.outputError(message, format, commandName);
    }
    process.exitCode = 1;
    return { success: false, previewInput };
  }

  // 4. Dry-run 模式只輸出預覽
  if (dryRun) {
    outputMutationWithLegacyFields(outputHandler, previewInput, format, legacyFields);
    return { success: true, previewInput };
  }

  // 5. 執行變更（帶回滾）
  const applicator = new ChangeApplicator(fileSystem);
  const result = await applicator.apply(changeset, {
    atomic: true,
    rollbackOnError: true
  });

  // 6. 輸出結果
  if (result.success) {
    outputMutationWithLegacyFields(outputHandler, previewInput, format, successLegacyFields ?? legacyFields);
    onSuccess?.(previewInput);
    return { success: true, previewInput };
  } else {
    const message = result.errors?.join(', ') ?? '執行失敗';
    if (errorFields) {
      outputErrorWithDetails(outputHandler, format, message, errorFields, commandName);
    } else {
      outputHandler.outputError(
        message,
        format,
        commandName
      );
    }
    process.exitCode = 1;
    return { success: false };
  }
}
