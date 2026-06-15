/**
 * Reference Updater
 * 負責掃描和更新引用（import 語句）
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { MemberType, type MemberDefinition, type ReferenceUpdate, type MoveMemberOptions } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { SOURCE_FILE_EXTENSIONS, stripSourceFileExtension } from '@shared/types/index.js';

/**
 * 解析的 import 成員
 */
interface ParsedImportMember {
  /** 原始名稱 */
  name: string;
  /** 別名（如 A as B 中的 B） */
  alias?: string;
  /** 是否為 type-only specifier（如 export { type A }） */
  typeOnly?: boolean;
}

type ImportExportStatementKind = 'import' | 'import type' | 'export' | 'export type';

interface ImportExportStatement {
  readonly text: string;
  readonly startLineIndex: number;
  readonly endLineIndex: number;
}

/**
 * Reference Updater
 * 負責掃描專案檔案中的 import 語句並準備更新
 */
export class ReferenceUpdater {
  constructor(private readonly fileSystem: IFileSystem) {}

  /**
   * 準備引用更新
   * 直接掃描 import 語句，不依賴 SymbolFinder 的引用類型
   * 支援分離 import 語句：當 import 包含多個成員時，只更新被移動的成員
   */
  async prepareReferenceUpdates(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<ReferenceUpdate[]> {
    const updates: ReferenceUpdate[] = [];
    const projectFiles = await this.getProjectFiles(options.projectRoot);

    for (const filePath of projectFiles) {
      // 跳過來源檔案和目標檔案
      if (filePath === options.sourceFile || filePath === options.target.filePath) {
        continue;
      }

      const content = await this.readFile(filePath);
      if (!content) {continue;}

      const lines = content.split('\n');

      // 掃描每一行找 import 語句
      for (let i = 0; i < lines.length; i++) {
        const statement = this.collectImportExportStatement(lines, i);
        if (!statement) {continue;}

        i = statement.endLineIndex;
        const line = statement.text;

        // 檢查是否是 import 語句且包含成員名稱和來源路徑
        const importPathMatch = this.extractImportPath(line);
        if (!importPathMatch) {continue;}

        // 解析 import 路徑為絕對路徑並比較
        const resolvedImportPath = this.resolveImportPathToAbsolute(
          importPathMatch,
          filePath,
          options.projectRoot
        );
        const normalizedSourceFile = path.normalize(options.sourceFile);

        // 比較路徑（考慮副檔名）
        if (!this.pathsMatch(resolvedImportPath, normalizedSourceFile)) {continue;}

        const newRelativePath = this.calculateRelativePath(filePath, options.target.filePath);
        const quoteChar = this.detectQuoteChar(line);

        if (this.isStarReExport(line)) {
          const newImport = `${this.createMemberReExport(member, newRelativePath, quoteChar)}\n${line}`;
          updates.push({
            filePath,
            originalImport: line,
            newImport,
            location: {
              filePath,
              range: {
                start: { line: statement.startLineIndex + 1, column: 1 },
                end: {
                  line: statement.endLineIndex + 1,
                  column: lines[statement.endLineIndex].length + 1
                }
              }
            }
          });
          continue;
        }

        // 解析 import 中的所有成員
        const importedMembers = this.parseImportedMembers(line);
        if (importedMembers.length === 0) {continue;}

        // 找出需要移動的成員（可能帶別名）
        const memberToMove = importedMembers.find(m => m.name === member.name);
        if (!memberToMove) {continue;}

        // 根據是否有其他成員決定如何更新 import
        const otherMembers = importedMembers.filter(m => m.name !== member.name);
        let newImport: string;
        const statementKind = this.getStatementKind(line);

        if (otherMembers.length === 0) {
          // 只有一個成員，直接替換路徑
          newImport = line.replace(
            new RegExp(`(['"\`])${this.escapeRegex(importPathMatch)}\\1`),
            `$1${newRelativePath}$1`
          );
        } else {
          // 有多個成員，需要分離 import
          // 生成保留在原位置的 import
          const remainingMembersStr = otherMembers.map(m => this.formatImportedMember(m)).join(', ');
          const remainingImport = `${statementKind} { ${remainingMembersStr} } from ${quoteChar}${importPathMatch}${quoteChar};`;

          // 生成移動到新位置的 import
          const movedMemberStr = this.formatImportedMember(memberToMove);
          const newLocationImport = `${statementKind} { ${movedMemberStr} } from ${quoteChar}${newRelativePath}${quoteChar};`;

          // 合併成新的 import（新位置的 import 在前）
          newImport = `${newLocationImport}\n${remainingImport}`;
        }

        if (newImport !== line) {
          updates.push({
            filePath,
            originalImport: line,
            newImport,
            location: {
              filePath,
              range: {
                start: { line: statement.startLineIndex + 1, column: 1 },
                end: {
                  line: statement.endLineIndex + 1,
                  column: lines[statement.endLineIndex].length + 1
                }
              }
            }
          });
        }
      }
    }

    return updates;
  }

  private collectImportExportStatement(
    lines: readonly string[],
    startLineIndex: number
  ): ImportExportStatement | null {
    const startLine = lines[startLineIndex];
    const trimmedStart = startLine.trim();
    if (!trimmedStart.startsWith('import ') && !trimmedStart.startsWith('export ')) {
      return null;
    }

    let text = startLine;
    if (this.extractImportPath(text)) {
      return { text, startLineIndex, endLineIndex: startLineIndex };
    }

    for (let endLineIndex = startLineIndex + 1; endLineIndex < lines.length; endLineIndex++) {
      text += `\n${lines[endLineIndex]}`;
      if (this.extractImportPath(text)) {
        return { text, startLineIndex, endLineIndex };
      }

      if (lines[endLineIndex].includes(';')) {
        break;
      }
    }

    return null;
  }

  /**
   * 解析 import 語句中的成員列表
   */
  private parseImportedMembers(line: string): ParsedImportMember[] {
    const members: ParsedImportMember[] = [];

    // 匹配 { A, B as C, D } 形式
    const match = line.match(/(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s*from/);
    if (!match) {return members;}

    const membersStr = match[1];
    const memberParts = membersStr.split(',');

    for (const part of memberParts) {
      const trimmed = part.trim();
      if (!trimmed) {continue;}
      const typeOnly = trimmed.startsWith('type ');
      const memberText = typeOnly ? trimmed.slice('type '.length).trim() : trimmed;

      // 檢查是否有別名 (name as alias)
      const aliasMatch = memberText.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliasMatch) {
        members.push({ name: aliasMatch[1], alias: aliasMatch[2], typeOnly });
      } else {
        members.push({ name: memberText, typeOnly });
      }
    }

    return members;
  }

  private isStarReExport(line: string): boolean {
    return /^\s*export\s+\*\s+from\s+['"`]/.test(line);
  }

  private createMemberReExport(member: MemberDefinition, importPath: string, quoteChar: string): string {
    const statementKind = member.type === MemberType.Interface || member.type === MemberType.TypeAlias
      ? 'export type'
      : 'export';

    return `${statementKind} { ${member.name} } from ${quoteChar}${importPath}${quoteChar};`;
  }

  private formatImportedMember(member: ParsedImportMember): string {
    const memberText = member.alias ? `${member.name} as ${member.alias}` : member.name;
    return member.typeOnly ? `type ${memberText}` : memberText;
  }

  private getStatementKind(line: string): ImportExportStatementKind {
    const trimmed = line.trim();
    if (trimmed.startsWith('export type ')) {
      return 'export type';
    }
    if (trimmed.startsWith('export ')) {
      return 'export';
    }
    if (trimmed.startsWith('import type ')) {
      return 'import type';
    }
    return 'import';
  }

  /**
   * 檢測 import 語句使用的引號類型
   */
  private detectQuoteChar(line: string): string {
    if (line.includes('\'')) {return '\'';}
    if (line.includes('"')) {return '"';}
    return '\'';
  }

  /**
   * 從 import/export 語句中提取路徑
   */
  private extractImportPath(line: string): string | null {
    const trimmed = line.trim();

    // 檢查是否是 import/export 語句
    if (!trimmed.startsWith('import ') && !(trimmed.startsWith('export ') && trimmed.includes('from'))) {
      return null;
    }

    // 提取引號內的路徑
    const match = line.match(/from\s+['"`]([^'"`]+)['"`]/);
    if (!match) {
      // 嘗試匹配 import 'path' 形式
      const directImport = line.match(/import\s+['"`]([^'"`]+)['"`]/);
      return directImport ? directImport[1] : null;
    }
    return match[1];
  }

  /**
   * 解析 import 路徑為絕對路徑
   *
   * @param importPath import 語句中的路徑
   * @param fromFile 包含 import 語句的檔案路徑
   * @param projectRoot 專案根目錄（用於解析路徑別名）
   */
  private resolveImportPathToAbsolute(
    importPath: string,
    fromFile: string,
    projectRoot?: string
  ): string {
    if (importPath.startsWith('.')) {
      // 相對路徑
      const fromDir = path.dirname(fromFile);
      return path.normalize(path.resolve(fromDir, importPath));
    }

    // 處理常見的路徑別名（src/*, @/*）
    if (projectRoot) {
      // src/* -> {projectRoot}/src/*
      if (importPath.startsWith('src/')) {
        return path.normalize(path.join(projectRoot, importPath));
      }
      // @/* -> {projectRoot}/src/* (常見配置)
      if (importPath.startsWith('@/')) {
        return path.normalize(path.join(projectRoot, 'src', importPath.slice(2)));
      }
    }

    // 非相對路徑且無法解析（可能是 node_modules）
    return importPath;
  }

  /**
   * 比較兩個路徑是否指向同一檔案（考慮副檔名和 index.ts）
   */
  private pathsMatch(path1: string, path2: string): boolean {
    const normalized1 = path.normalize(path1);
    const normalized2 = path.normalize(path2);

    // 完全匹配
    if (normalized1 === normalized2) {
      return true;
    }

    // 移除副檔名後比較
    const withoutExt1 = this.removeExtension(normalized1);
    const withoutExt2 = this.removeExtension(normalized2);

    if (withoutExt1 === withoutExt2) {
      return true;
    }

    // 處理目錄 -> index.ts 對應
    // 例如 src/utils 應該匹配 src/utils/index.ts
    if (withoutExt2.endsWith('/index') && withoutExt1 === path.dirname(withoutExt2)) {
      return true;
    }
    if (withoutExt1.endsWith('/index') && withoutExt2 === path.dirname(withoutExt1)) {
      return true;
    }

    return false;
  }

  /**
   * 移除檔案副檔名
   */
  private removeExtension(filePath: string): string {
    return stripSourceFileExtension(filePath);
  }

  /**
   * 跳脫正則表達式特殊字元
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 計算相對路徑
   */
  private calculateRelativePath(from: string, to: string): string {
    const fromDir = path.dirname(from);
    let relativePath = path.relative(fromDir, to);

    relativePath = stripSourceFileExtension(relativePath);

    // 確保以 ./ 開頭
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    return relativePath;
  }

  /**
   * 取得專案檔案
   */
  private async getProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];
    await this.collectFiles(projectRoot, files);
    return files;
  }

  /**
   * 遞迴收集檔案
   */
  private async collectFiles(dirPath: string, files: string[]): Promise<void> {
    const entries = await this.fileSystem.readDirectory(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 跳過 node_modules、build 輸出目錄和隱藏目錄
      const skipDirs = ['node_modules', 'dist', 'build', 'coverage', '.git'];
      if (skipDirs.includes(entry.name) || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory) {
        await this.collectFiles(fullPath, files);
      } else if (entry.isFile && this.isSupportedFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  /**
   * 檢查是否為支援的檔案類型
   */
  private isSupportedFile(filename: string): boolean {
    return SOURCE_FILE_EXTENSIONS.some(ext => filename.endsWith(ext));
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch (error) {
      diagnostics.warn('move-member/reference-updater', 'FILE_READ_ERROR', `Failed to read file: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return null;
    }
  }
}
