/**
 * CLI 命令共用工具
 * 提供格式驗證和變更類命令執行的共用邏輯
 */

import { ChangeApplicator, convertChangesetToPreviewInput, type Changeset } from '@infrastructure/changeset/index.js';
import type { PreviewInput } from '@infrastructure/formatters/index.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  createUnifiedOutputHandler,
  parseOutputFormat,
  OutputFormat,
  type UnifiedOutputHandler
} from '@interfaces/cli/unified-output-handler.js';

/** 格式驗證結果 */
export interface FormatParseResult {
  /** 是否解析成功 */
  success: boolean;
  /** 解析後的格式（成功時有值） */
  format?: OutputFormat;
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
  } catch {
    const availableFormats = allowDiff ? 'json, summary, diff' : 'json, summary';
    handler.outputError(`不支援的輸出格式。可用格式: ${availableFormats}`, OutputFormat.Summary);
    process.exitCode = 1;
    return { success: false };
  }
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
}

/** 變更類命令執行結果 */
export interface MutationExecutionResult {
  /** 是否執行成功 */
  success: boolean;
  /** PreviewInput（用於輸出） */
  previewInput?: PreviewInput;
}

/**
 * 執行變更類命令的統一流程
 *
 * 流程：
 * 1. 檢查 changeset.success
 * 2. 轉換為 PreviewInput
 * 3. dry-run 時僅輸出預覽
 * 4. 實際執行時應用變更（atomic + rollbackOnError）
 * 5. 輸出結果
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
  const { fileSystem, format, dryRun, outputHandler, commandName, onSuccess } = options;

  // 1. 檢查 changeset 是否成功
  if (!changeset.success) {
    outputHandler.outputError(
      changeset.errors?.join(', ') ?? '生成變更失敗',
      format,
      commandName
    );
    process.exitCode = 1;
    return { success: false };
  }

  // 2. 轉換為 PreviewInput
  const previewInput = await convertChangesetToPreviewInput(changeset, fileSystem);

  // 3. Dry-run 模式只輸出預覽
  if (dryRun) {
    outputHandler.outputMutation(previewInput, format);
    return { success: true, previewInput };
  }

  // 4. 執行變更（帶回滾）
  const applicator = new ChangeApplicator(fileSystem);
  const result = await applicator.apply(changeset, {
    atomic: true,
    rollbackOnError: true
  });

  // 5. 輸出結果
  if (result.success) {
    outputHandler.outputMutation(previewInput, format);
    onSuccess?.(previewInput);
    return { success: true, previewInput };
  } else {
    outputHandler.outputError(
      result.errors?.join(', ') ?? '執行失敗',
      format,
      commandName
    );
    process.exitCode = 1;
    return { success: false };
  }
}
