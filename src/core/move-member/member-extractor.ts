/**
 * Member Extractor
 * 從程式碼中提取成員定義
 */

import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { FileUtils } from '@core/foundations/file-utils.js';
import { MemberType, type MemberDefinition } from './types.js';
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
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
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

    switch (extension) {
      case '.ts':
      case '.tsx':
        return extractTypeScriptMember(content, filePath, memberName, memberType, className);
      case '.js':
      case '.jsx':
        return extractJavaScriptMember(content, filePath, memberName, memberType, className);
      default:
        return null;
    }
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

    switch (extension) {
      case '.ts':
      case '.tsx':
        return listTypeScriptMembers(content, filePath, className);
      case '.js':
      case '.jsx':
        return listJavaScriptMembers(content, filePath, className);
      default:
        return [];
    }
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
