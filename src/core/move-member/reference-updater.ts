/**
 * Reference Updater
 * 負責掃描和更新引用（import 語句）
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { MemberType, type MemberDefinition, type ReferenceUpdate, type MoveMemberOptions } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { SOURCE_FILE_EXTENSIONS, stripSourceFileExtension } from '@shared/types/index.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';

/**
 * Reference Updater 的路徑解析設定（tsconfig paths + baseUrl）
 * pathAliases 期望已解析為絕對路徑（見 tsconfig-loader）
 */
export interface ReferenceUpdaterPathConfig {
  readonly pathAliases?: Record<string, string>;
  readonly baseUrl?: string;
}

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
  private readonly pathUtils: PathUtils;

  constructor(
    private readonly fileSystem: IFileSystem,
    pathConfig?: ReferenceUpdaterPathConfig
  ) {
    // 重用 file-move 的 PathUtils 解析任意 tsconfig 別名 / baseUrl，
    // 取代硬寫的 src/ 與 @/ 分支（Single Source of Truth）
    this.pathUtils = new PathUtils(
      new ImportResolver({
        pathAliases: pathConfig?.pathAliases ?? {},
        baseUrl: pathConfig?.baseUrl,
        supportedExtensions: ALLOWED_EXTENSIONS
      })
    );
  }

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

        // 解析 import 路徑為絕對路徑並比較（PathUtils 支援任意 tsconfig 別名 / baseUrl）
        const resolvedImportPath = this.pathUtils.resolveImportPath(importPathMatch, filePath);

        // 比較路徑（考慮副檔名與 index 目錄解析）
        if (!this.pathUtils.pathsMatch(resolvedImportPath, options.sourceFile)) {continue;}

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

        // 其餘留在原位置的 named 成員，以及 default / namespace 前綴（P-D）
        const otherMembers = importedMembers.filter(m => m.name !== member.name);
        const defaultPrefix = this.extractDefaultPrefix(line);
        const statementKind = this.getStatementKind(line);

        // 生成保留在來源檔的 import（保留 default 前綴與其餘 named 成員）
        // 若 default 與 named 皆已無剩餘，則回傳空字串代表整條移除
        const remainingImport = this.buildRemainingSourceImport(
          statementKind,
          defaultPrefix,
          otherMembers,
          importPathMatch,
          quoteChar
        );

        // 嘗試把 moved 併入同檔已存在、指向目標檔的 named import（P-E）
        const existingTargetImport = this.findExistingTargetImport(
          lines,
          options,
          filePath,
          statement
        );

        const sourceLocation = this.createStatementLocation(filePath, statement, lines);

        if (existingTargetImport) {
          // 來源語句改為僅保留 remaining（default + 其餘 named），moved 併入既有目標 import
          updates.push({
            filePath,
            originalImport: line,
            newImport: remainingImport,
            location: sourceLocation
          });

          const mergedMembers = [...existingTargetImport.members, memberToMove];
          const mergedImport = this.buildMergedTargetImport(
            existingTargetImport.statementKind,
            mergedMembers,
            existingTargetImport.importPath,
            existingTargetImport.quoteChar
          );
          updates.push({
            filePath,
            originalImport: existingTargetImport.statement.text,
            newImport: mergedImport,
            location: this.createStatementLocation(filePath, existingTargetImport.statement, lines)
          });
          continue;
        }

        let newImport: string;
        if (remainingImport) {
          // 仍有 default 或其餘 named 留在來源檔 → 重建：目標 import 在前、來源 remaining 在後
          const movedMemberStr = this.formatImportedMember(memberToMove);
          const newLocationImport = `${statementKind} { ${movedMemberStr} } from ${quoteChar}${newRelativePath}${quoteChar};`;
          newImport = `${newLocationImport}\n${remainingImport}`;
        } else {
          // 來源僅剩單一 moved（無 default、無其餘 named）→ 對原始語句做 path-only 替換，
          // 保留多行格式 / 縮排 / type-only / 別名，不重建 { member } 部分
          newImport = this.replaceImportPath(line, importPathMatch, newRelativePath);
        }

        if (newImport !== line) {
          updates.push({
            filePath,
            originalImport: line,
            newImport,
            location: sourceLocation
          });
        }
      }
    }

    return updates;
  }

  /**
   * 建立保留在來源檔的 import 語句
   * 保留 default / namespace 前綴與其餘 named 成員；皆無剩餘則回傳空字串（代表整條移除）
   */
  private buildRemainingSourceImport(
    statementKind: ImportExportStatementKind,
    defaultPrefix: string | null,
    otherMembers: readonly ParsedImportMember[],
    importPath: string,
    quoteChar: string
  ): string {
    const hasNamed = otherMembers.length > 0;
    if (!defaultPrefix && !hasNamed) {
      return '';
    }

    const namedClause = hasNamed
      ? `{ ${otherMembers.map(m => this.formatImportedMember(m)).join(', ')} }`
      : '';
    const clause = defaultPrefix && hasNamed
      ? `${defaultPrefix}, ${namedClause}`
      : defaultPrefix ?? namedClause;

    return `${statementKind} ${clause} from ${quoteChar}${importPath}${quoteChar};`;
  }

  /**
   * 對 import/export 語句做 path-only 替換：只替換引號內的路徑 token，
   * 保留語句其餘所有內容（多行格式、縮排、type-only、別名）
   */
  private replaceImportPath(line: string, oldPath: string, newPath: string): string {
    const escaped = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return line.replace(
      new RegExp(`(['"\`])${escaped}\\1`),
      `$1${newPath}$1`
    );
  }

  /**
   * 建立合併後的目標 import 語句（既有成員 + 新移入成員）
   */
  private buildMergedTargetImport(
    statementKind: ImportExportStatementKind,
    members: readonly ParsedImportMember[],
    importPath: string,
    quoteChar: string
  ): string {
    const membersStr = members.map(m => this.formatImportedMember(m)).join(', ');
    return `${statementKind} { ${membersStr} } from ${quoteChar}${importPath}${quoteChar};`;
  }

  /**
   * 在同一檔案中尋找已指向目標檔的 named import（P-E）
   * 找到時回傳該語句資訊，供把 moved 併入既有 import 而非新增重複 import
   */
  private findExistingTargetImport(
    lines: readonly string[],
    options: MoveMemberOptions,
    fromFile: string,
    excludeStatement: ImportExportStatement
  ): {
    statement: ImportExportStatement;
    statementKind: ImportExportStatementKind;
    members: ParsedImportMember[];
    importPath: string;
    quoteChar: string;
  } | null {
    for (let i = 0; i < lines.length; i++) {
      const statement = this.collectImportExportStatement(lines, i);
      if (!statement) {continue;}
      i = statement.endLineIndex;

      // 跳過正在處理的來源語句本身
      if (statement.startLineIndex === excludeStatement.startLineIndex) {continue;}

      const importPath = this.extractImportPath(statement.text);
      if (!importPath) {continue;}

      // star re-export 不是可併入的 named import
      if (this.isStarReExport(statement.text)) {continue;}

      const resolved = this.pathUtils.resolveImportPath(importPath, fromFile);
      if (!this.pathUtils.pathsMatch(resolved, options.target.filePath)) {continue;}

      const members = this.parseImportedMembers(statement.text);
      if (members.length === 0) {continue;}

      return {
        statement,
        statementKind: this.getStatementKind(statement.text),
        members,
        importPath,
        quoteChar: this.detectQuoteChar(statement.text)
      };
    }

    return null;
  }

  /**
   * 由 import/export 語句建立 ReferenceUpdate 的 location 範圍
   */
  private createStatementLocation(
    filePath: string,
    statement: ImportExportStatement,
    lines: readonly string[]
  ): ReferenceUpdate['location'] {
    return {
      filePath,
      range: {
        start: { line: statement.startLineIndex + 1, column: 1 },
        end: {
          line: statement.endLineIndex + 1,
          column: lines[statement.endLineIndex].length + 1
        }
      }
    };
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
    // 允許可選的 default / namespace 前綴（如 import Default, { ... }）
    const match = line.match(
      /(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*|\*\s+as\s+[\w$]+\s*,\s*)?\{([^}]+)\}\s*from/
    );
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

  /**
   * 提取 import 語句中位於 named import 子句之前的 default / namespace 前綴
   * 如 `import defaultThing, { moved } from '...'` → `defaultThing`
   *    `import * as NS, { moved } from '...'`      → `* as NS`
   * 無前綴時回傳 null
   */
  private extractDefaultPrefix(line: string): string | null {
    const match = line.match(
      /(?:import|export)\s+(?:type\s+)?([\w$]+|\*\s+as\s+[\w$]+)\s*,\s*\{/
    );
    return match ? match[1].trim() : null;
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
