/**
 * Member Extractor
 * 從程式碼中提取成員定義
 */

import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { FileUtils } from '@core/foundations/file-utils.js';
import { MemberType, type MemberDefinition } from './types.js';
import {
  isJavaScriptSourceExtension,
  isTypeScriptSourceExtension
} from '@shared/types/index.js';
import {
  extractTypeScriptMember,
  listTypeScriptMembers,
  extractJavaScriptMember,
  listJavaScriptMembers
} from './extractors/index.js';

/**
 * 成員提取器
 */
export class MemberExtractor {
  private readonly fileUtils: FileUtils;

  constructor(
    parserRegistry: ParserRegistry,
    fileSystem: IFileSystem
  ) {
    this.fileUtils = new FileUtils(fileSystem, parserRegistry);
  }

  /**
   * 提取指定成員
   *
   * @param filePath 檔案路徑
   * @param memberName 成員名稱
   * @param memberType 成員類型（可選）
   * @param className 所屬類別（可選）
   * @returns 找到的成員定義，或 null
   */
  async extractMember(
    filePath: string,
    memberName: string,
    memberType?: MemberType,
    className?: string
  ): Promise<MemberDefinition | null> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return null;
    }

    const extension = FileUtils.getFileExtension(filePath);

    if (isTypeScriptSourceExtension(extension)) {
      return extractTypeScriptMember(content, filePath, memberName, memberType, className);
    }

    if (isJavaScriptSourceExtension(extension)) {
      return extractJavaScriptMember(content, filePath, memberName, memberType, className);
    }

    return null;
  }

  /**
   * 提取指定位置的成員
   * 找到包含該位置的最小成員定義
   *
   * @param filePath 檔案路徑
   * @param line 行號（1-based）
   * @param column 欄位（1-based，可選）
   * @returns 找到的成員定義，或 null
   */
  async extractMemberAtPosition(
    filePath: string,
    line: number,
    column?: number
  ): Promise<MemberDefinition | null> {
    const members = await this.listMembers(filePath);
    if (members.length === 0) {
      return null;
    }

    // 找到包含該行的所有成員
    const containingMembers = members.filter(m => {
      const start = m.location.range.start.line;
      const end = m.location.range.end.line;
      return line >= start && line <= end;
    });

    if (containingMembers.length === 0) {
      return null;
    }

    // 如果只有一個，直接返回
    if (containingMembers.length === 1) {
      return containingMembers[0];
    }

    // 多個成員同時「起始行」正好是目標行時（典型情境：同一物理行有多個宣告，
    // 如 `export function a() {} export function b() {}`），只靠行號無法消歧，
    // 必須用欄位挑出目標欄位落在哪個候選的宣告範圍內。候選彼此不重疊、由左到右
    // 排列，故選「起始欄位 <= 目標欄位」中最靠右（欄位最大）的那個，即為目標
    // 欄位所屬的候選；若無候選的起始欄位 <= 目標欄位（欄位在最左候選之前），
    // 退回全部同起始行候選，維持與行號限定一致的行為。
    if (column !== undefined) {
      const sameStartLine = containingMembers.filter(m => m.location.range.start.line === line);
      if (sameStartLine.length > 1) {
        const eligible = sameStartLine.filter(m => m.location.range.start.column <= column);
        const pool = eligible.length > 0 ? eligible : sameStartLine;
        return pool.reduce((best, current) =>
          current.location.range.start.column > best.location.range.start.column ? current : best
        );
      }
    }

    // 多個成員時，選擇範圍最小的（最內層）
    // 但優先選擇非類別的成員（避免選到整個類別而不是類別內的方法）
    const nonClassMembers = containingMembers.filter(m => m.type !== MemberType.Class);
    const candidates = nonClassMembers.length > 0 ? nonClassMembers : containingMembers;

    return candidates.reduce((smallest, current) => {
      const smallestSize = smallest.location.range.end.line - smallest.location.range.start.line;
      const currentSize = current.location.range.end.line - current.location.range.start.line;
      return currentSize < smallestSize ? current : smallest;
    });
  }

  /**
   * 列出檔案中的所有成員
   *
   * @param filePath 檔案路徑
   * @param className 篩選特定類別的成員（可選）
   * @returns 成員定義陣列
   */
  async listMembers(filePath: string, className?: string): Promise<MemberDefinition[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return [];
    }

    const extension = FileUtils.getFileExtension(filePath);

    if (isTypeScriptSourceExtension(extension)) {
      return listTypeScriptMembers(content, filePath, className);
    }

    if (isJavaScriptSourceExtension(extension)) {
      return listJavaScriptMembers(content, filePath, className);
    }

    return [];
  }
}

/**
 * 建立 MemberExtractor 實例
 */
export function createMemberExtractor(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): MemberExtractor {
  return new MemberExtractor(parserRegistry, fileSystem);
}
