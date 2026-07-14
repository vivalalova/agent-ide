/**
 * Move Member Engine
 * 成員移動核心引擎
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType, ChangeApplicator } from '@infrastructure/changeset/index.js';
import { MemberExtractor } from './member-extractor.js';
import { ReferenceUpdater, type ReferenceUpdaterPathConfig } from './reference-updater.js';
import { FileChangePreparer } from './file-change-preparer.js';
import { isInsideStringOrComment } from './utils/source-text.js';
import {
  type MoveMemberOptions,
  type MoveMemberResult,
  type MemberDefinition,
  type FileChange,
  type TargetFileChange,
  type ReferenceUpdate,
  MoveTargetType,
  MoveMemberErrorCode
} from './types.js';

/**
 * Move Member Engine
 */
export class MoveMemberEngine {
  private readonly memberExtractor: MemberExtractor;
  private readonly referenceUpdater: ReferenceUpdater;
  private readonly fileChangePreparer: FileChangePreparer;
  private readonly changeApplicator: ChangeApplicator;

  constructor(
    parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    pathConfig?: ReferenceUpdaterPathConfig
  ) {
    this.memberExtractor = new MemberExtractor(parserRegistry, fileSystem);
    this.referenceUpdater = new ReferenceUpdater(fileSystem, pathConfig);
    this.fileChangePreparer = new FileChangePreparer(fileSystem, parserRegistry);
    this.changeApplicator = new ChangeApplicator(fileSystem);
  }

  /**
   * 執行 Move Member
   */
  async moveMember(options: MoveMemberOptions): Promise<MoveMemberResult> {
    // 1. 提取成員（支援 by-position 或 by-name）
    let member: MemberDefinition | null = null;

    if (options.sourcePosition) {
      // by-position 模式
      member = await this.memberExtractor.extractMemberAtPosition(
        options.sourceFile,
        options.sourcePosition.line,
        options.sourcePosition.column
      );
    } else if (options.memberName) {
      // by-name 模式
      member = await this.memberExtractor.extractMember(
        options.sourceFile,
        options.memberName,
        options.memberType,
        options.sourceClassName
      );
    }

    if (!member) {
      const positionInfo = options.sourcePosition
        ? `行 ${options.sourcePosition.line}` + (options.sourcePosition.column ? `:${options.sourcePosition.column}` : '')
        : options.memberName;
      return this.createErrorResult(
        MoveMemberErrorCode.MemberNotFound,
        `找不到成員: ${positionInfo}`
      );
    }

    // 2. 驗證目標
    const validationError = await this.validateTarget(options, member);
    if (validationError) {
      return this.createErrorResult(validationError.code, validationError.message);
    }

    // 3. 準備來源檔案變更
    const sourceFileChange = await this.fileChangePreparer.prepareSourceFileChange(options, member);

    // 4. 準備目標檔案變更
    const targetFileChange = await this.fileChangePreparer.prepareTargetFileChange(options, member);

    // 5. 查找並準備引用更新
    const referenceUpdates = options.updateReferences !== false
      ? await this.referenceUpdater.prepareReferenceUpdates(options, member, sourceFileChange)
      : [];

    // 6. 執行或預覽：非預覽時透過統一 Changeset + ChangeApplicator 寫入
    //    （atomic + rollbackOnError，中途失敗自動還原，取代舊有循序寫入無回滾的 ChangeApplier）
    if (!options.preview) {
      const changeset = this.buildChangeset(
        options,
        sourceFileChange,
        targetFileChange,
        referenceUpdates
      );
      const applyResult = await this.changeApplicator.apply(changeset, {
        atomic: true,
        rollbackOnError: true
      });
      if (!applyResult.success) {
        return this.createErrorResult(
          MoveMemberErrorCode.WriteFailed,
          `寫入變更失敗，已回滾: ${(applyResult.errors ?? []).join('; ')}`
        );
      }
    }

    // 7. 計算統計
    const affectedFiles = new Set<string>();
    affectedFiles.add(sourceFileChange.filePath);
    affectedFiles.add(targetFileChange.filePath);
    for (const update of referenceUpdates) {
      affectedFiles.add(update.filePath);
    }

    return {
      success: true,
      member,
      target: options.target,
      sourceFileChange,
      targetFileChange,
      referenceUpdates,
      executed: !options.preview,
      stats: {
        referencesUpdated: referenceUpdates.length,
        filesAffected: affectedFiles.size
      }
    };
  }

  /**
   * 生成成員移動的 Changeset
   * 使用 preview 模式收集變更，轉換為統一的 Changeset 格式
   */
  async generateChangeset(options: MoveMemberOptions): Promise<Changeset> {
    // 使用 preview 模式收集變更
    const result = await this.moveMember({
      ...options,
      preview: true
    });

    if (!result.success) {
      return createChangesetBuilder()
        .forCommand(ChangesetCommand.MoveMember)
        .addError(result.error ?? 'Move member failed')
        .build();
    }

    return this.buildChangeset(
      options,
      result.sourceFileChange,
      result.targetFileChange,
      result.referenceUpdates
    );
  }

  /**
   * 將已計算好的來源/目標檔案變更與引用更新組成統一 Changeset
   * 供 generateChangeset（外部消費）與 moveMember 非預覽路徑（內部寫入）共用，
   * 避免兩處各自組一份、SSOT
   */
  private buildChangeset(
    options: MoveMemberOptions,
    sourceFileChange: FileChange,
    targetFileChange: TargetFileChange,
    referenceUpdates: readonly ReferenceUpdate[]
  ): Changeset {
    const builder = createChangesetBuilder()
      .forCommand(ChangesetCommand.MoveMember);

    const targetReferenceUpdates = referenceUpdates.filter(update => update.filePath === targetFileChange.filePath);
    const targetChange = targetReferenceUpdates.length > 0
      ? this.applyTargetReferenceUpdates(targetFileChange, targetReferenceUpdates)
      : targetFileChange;

    // 轉換 sourceFileChange（整檔替換）
    const sourceOriginalLines = sourceFileChange.originalCode.split('\n');
    builder.addTextChange(sourceFileChange.filePath, [{
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: sourceOriginalLines.length + 1, column: 1, offset: sourceFileChange.originalCode.length }
      },
      newText: sourceFileChange.newCode,
      description: 'Remove member from source file'
    }], TextEditOperationType.Modify);

    // 轉換 targetFileChange
    if (targetChange.isNewFile) {
      builder.addFileCreate(targetChange.filePath, targetChange.newCode);
    } else {
      const targetOriginal = targetChange.originalCode ?? '';
      const targetOriginalLines = targetOriginal.split('\n');
      builder.addTextChange(targetChange.filePath, [{
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: targetOriginalLines.length + 1, column: 1, offset: targetOriginal.length }
        },
        newText: targetChange.newCode,
        description: 'Add member to target file'
      }], TextEditOperationType.Modify);
    }

    // 轉換 referenceUpdates
    for (const update of referenceUpdates) {
      // 目標檔的引用已合併進整檔替換；若再附加原始座標的局部 edit，
      // 會與整檔 range 重疊並被 ChangesetApplicator 拒絕。
      if (update.filePath === targetFileChange.filePath) {
        continue;
      }
      builder.addTextChange(update.filePath, [{
        range: update.location.range,
        newText: update.newImport,
        description: `Update import: ${update.originalImport} -> ${update.newImport}`
      }], TextEditOperationType.Modify);
    }

    // 設定描述
    const relativePath = path.relative(options.projectRoot, options.target.filePath);
    const memberInfo = options.memberName
      ?? (options.sourcePosition ? `line ${options.sourcePosition.line}` : 'member');
    builder.withDescription(
      `Moved '${memberInfo}' from '${path.basename(options.sourceFile)}' to '${relativePath}'`
    );

    return builder.build();
  }

  /**
   * 將目標檔內指向來源檔的 import 更新併入目標檔整檔替換，
   * 避免同一檔案同時存在重疊的整檔與局部 TextEdit。
   */
  private applyTargetReferenceUpdates(
    targetFileChange: TargetFileChange,
    updates: readonly ReferenceUpdate[]
  ): TargetFileChange {
    let newCode = targetFileChange.newCode;

    for (const update of updates) {
      const index = this.findTargetImportOffset(newCode, update.originalImport);
      if (index === -1) {
        throw new Error(`找不到目標檔引用更新的原始 import: ${update.originalImport}`);
      }
      newCode = newCode.slice(0, index) + update.newImport + newCode.slice(index + update.originalImport.length);
    }

    return { ...targetFileChange, newCode };
  }

  /**
   * 找到真正位於 import/export 語句行首的原始文字，避免同樣內容先出現在
   * 字串或註解時被 indexOf 誤改。
   */
  private findTargetImportOffset(code: string, originalImport: string): number {
    const statement = originalImport.trimStart();
    if (!/^(?:import|export)\b/.test(statement)) {
      return code.indexOf(originalImport);
    }

    let searchFrom = 0;
    while (searchFrom < code.length) {
      const index = code.indexOf(originalImport, searchFrom);
      if (index === -1) {
        return -1;
      }

      const lineStart = code.lastIndexOf('\n', index - 1) + 1;
      if (/^\s*$/.test(code.slice(lineStart, index)) && !isInsideStringOrComment(code, index)) {
        return index;
      }
      searchFrom = index + 1;
    }

    return -1;
  }
  /**
   * 驗證目標
   */
  private async validateTarget(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<{ code: MoveMemberErrorCode; message: string } | null> {
    const { target } = options;
    const exists = await this.fileSystem.exists(target.filePath);

    // 檢查目標類別（必須檔案存在）
    if (target.type === MoveTargetType.ExistingClass && target.className) {
      if (!exists) {
        return {
          code: MoveMemberErrorCode.TargetFileNotFound,
          message: `目標檔案不存在: ${target.filePath}`
        };
      }

      const members = await this.memberExtractor.listMembers(target.filePath);
      const targetClass = members.find(m => m.name === target.className);
      if (!targetClass) {
        return {
          code: MoveMemberErrorCode.TargetClassNotFound,
          message: `找不到目標類別: ${target.className}`
        };
      }
    }

    // 檢查是否已有同名成員（僅當檔案存在時）
    if (exists) {
      const existingMember = await this.memberExtractor.extractMember(
        target.filePath,
        member.name,
        member.type,
        target.className
      );

      if (existingMember) {
        return {
          code: MoveMemberErrorCode.DuplicateMemberInTarget,
          message: `目標位置已存在同名成員: ${member.name}`
        };
      }
    }

    return null;
  }

  /**
   * 建立錯誤結果
   */
  private createErrorResult(code: MoveMemberErrorCode, message: string): MoveMemberResult {
    return {
      success: false,
      code,
      error: message
    };
  }
}

/**
 * 建立 MoveMemberEngine 實例
 */
export function createMoveMemberEngine(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem,
  pathConfig?: ReferenceUpdaterPathConfig
): MoveMemberEngine {
  return new MoveMemberEngine(parserRegistry, fileSystem, pathConfig);
}
