/**
 * Move Member Engine
 * 成員移動核心引擎
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType } from '@infrastructure/changeset/index.js';
import { MemberExtractor } from './member-extractor.js';
import { ReferenceUpdater, type ReferenceUpdaterPathConfig } from './reference-updater.js';
import { FileChangePreparer } from './file-change-preparer.js';
import { ChangeApplier } from './change-applier.js';
import {
  type MoveMemberOptions,
  type MoveMemberResult,
  type MemberDefinition,
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
  private readonly changeApplier: ChangeApplier;

  constructor(
    parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    pathConfig?: ReferenceUpdaterPathConfig
  ) {
    this.memberExtractor = new MemberExtractor(parserRegistry, fileSystem);
    this.referenceUpdater = new ReferenceUpdater(fileSystem, pathConfig);
    this.fileChangePreparer = new FileChangePreparer(fileSystem);
    this.changeApplier = new ChangeApplier(fileSystem);
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
      ? await this.referenceUpdater.prepareReferenceUpdates(options, member)
      : [];

    // 6. 執行或預覽
    if (!options.preview) {
      await this.changeApplier.applyChanges(sourceFileChange, targetFileChange, referenceUpdates);
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
    const builder = createChangesetBuilder()
      .forCommand(ChangesetCommand.MoveMember);

    // 使用 preview 模式收集變更
    const result = await this.moveMember({
      ...options,
      preview: true
    });

    if (!result.success) {
      return builder
        .addError(result.error ?? 'Move member failed')
        .build();
    }

    // 轉換 sourceFileChange（整檔替換）
    const sourceOriginalLines = result.sourceFileChange.originalCode.split('\n');
    builder.addTextChange(result.sourceFileChange.filePath, [{
      range: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: sourceOriginalLines.length + 1, column: 1, offset: result.sourceFileChange.originalCode.length }
      },
      newText: result.sourceFileChange.newCode,
      description: 'Remove member from source file'
    }], TextEditOperationType.Modify);

    // 轉換 targetFileChange
    if (result.targetFileChange.isNewFile) {
      builder.addFileCreate(result.targetFileChange.filePath, result.targetFileChange.newCode);
    } else {
      const targetOriginal = result.targetFileChange.originalCode ?? '';
      const targetOriginalLines = targetOriginal.split('\n');
      builder.addTextChange(result.targetFileChange.filePath, [{
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: targetOriginalLines.length + 1, column: 1, offset: targetOriginal.length }
        },
        newText: result.targetFileChange.newCode,
        description: 'Add member to target file'
      }], TextEditOperationType.Modify);
    }

    // 轉換 referenceUpdates
    for (const update of result.referenceUpdates) {
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
