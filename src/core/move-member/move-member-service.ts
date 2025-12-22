/**
 * Move Member Service
 * 成員移動核心服務
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder } from '@infrastructure/changeset/index.js';
import { MemberExtractor } from './member-extractor.js';
import {
  type MoveMemberOptions,
  type MoveMemberResult,
  type MemberDefinition,
  type ReferenceUpdate,
  MoveTargetType,
  MoveMemberErrorCode
} from './types.js';
import { SymbolFinder } from '../shared/symbol-finder/index.js';

/**
 * Move Member Service
 */
export class MoveMemberService {
  private readonly memberExtractor: MemberExtractor;
  private readonly symbolFinder: SymbolFinder;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.memberExtractor = new MemberExtractor(parserRegistry, fileSystem);
    this.symbolFinder = new SymbolFinder(parserRegistry, fileSystem);
  }

  /**
   * 執行 Move Member
   */
  async moveMember(options: MoveMemberOptions): Promise<MoveMemberResult> {
    // 1. 提取成員
    const member = await this.memberExtractor.extractMember(
      options.sourceFile,
      options.memberName,
      options.memberType,
      options.sourceClassName
    );

    if (!member) {
      return this.createErrorResult(
        MoveMemberErrorCode.MemberNotFound,
        `找不到成員: ${options.memberName}`
      );
    }

    // 2. 驗證目標
    const validationError = await this.validateTarget(options, member);
    if (validationError) {
      return this.createErrorResult(validationError.code, validationError.message);
    }

    // 3. 準備來源檔案變更
    const sourceFileChange = await this.prepareSourceFileChange(options, member);

    // 4. 準備目標檔案變更
    const targetFileChange = await this.prepareTargetFileChange(options, member);

    // 5. 查找並準備引用更新
    const referenceUpdates = options.updateReferences !== false
      ? await this.prepareReferenceUpdates(options, member)
      : [];

    // 6. 執行或預覽
    if (!options.preview) {
      await this.applyChanges(sourceFileChange, targetFileChange, referenceUpdates);
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
      .forCommand('move-member');

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
    }], 'modify');

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
      }], 'modify');
    }

    // 轉換 referenceUpdates
    for (const update of result.referenceUpdates) {
      builder.addTextChange(update.filePath, [{
        range: update.location.range,
        newText: update.newImport,
        description: `Update import: ${update.originalImport} -> ${update.newImport}`
      }], 'modify');
    }

    // 設定描述
    const relativePath = path.relative(options.projectRoot, options.target.filePath);
    builder.withDescription(
      `Moved '${options.memberName}' from '${path.basename(options.sourceFile)}' to '${relativePath}'`
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
   * 準備來源檔案變更
   */
  private async prepareSourceFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<{ filePath: string; originalCode: string; newCode: string }> {
    const content = await this.readFile(options.sourceFile);
    if (!content) {
      throw new Error(`無法讀取來源檔案: ${options.sourceFile}`);
    }

    const lines = content.split('\n');
    const startLine = member.location.range.start.line - 1;
    const endLine = member.location.range.end.line - 1;

    // 移除成員（包含前面的文件註解）
    let removeStartLine = startLine;
    if (member.documentation) {
      const docLines = member.documentation.split('\n').length;
      removeStartLine = Math.max(0, startLine - docLines);
    }

    // 處理 re-export
    let reexportStatement = '';
    if (options.keepReexport) {
      const relativePath = this.calculateRelativePath(options.sourceFile, options.target.filePath);
      reexportStatement = `export { ${member.name} } from '${relativePath}';\n`;
    }

    const newLines = [
      ...lines.slice(0, removeStartLine),
      ...(options.keepReexport ? [reexportStatement] : []),
      ...lines.slice(endLine + 1)
    ];

    return {
      filePath: options.sourceFile,
      originalCode: content,
      newCode: newLines.join('\n')
    };
  }

  /**
   * 準備目標檔案變更
   * 自動判斷目標檔案是否存在：存在則插入，不存在則創建新檔案
   */
  private async prepareTargetFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<{ filePath: string; originalCode: string | null; newCode: string; isNewFile: boolean }> {
    const { target } = options;

    // 準備要插入的程式碼
    let memberCode = member.sourceCode;
    if (member.documentation) {
      memberCode = member.documentation + '\n' + memberCode;
    }

    // 確保有 export（如果原本有）
    if (!memberCode.includes('export') && member.modifiers.includes('export')) {
      memberCode = 'export ' + memberCode;
    }

    // 自動判斷檔案是否存在
    const content = await this.readFile(target.filePath);
    const isNewFile = content === null;

    if (isNewFile) {
      // 新檔案：生成完整的檔案內容
      const imports = this.generateImports(member, options);
      const newCode = imports + (imports ? '\n\n' : '') + memberCode + '\n';

      return {
        filePath: target.filePath,
        originalCode: null,
        newCode,
        isNewFile: true
      };
    }

    // 現有檔案

    const lines = content.split('\n');
    let insertLine = target.insertPosition ?? -1;

    if (target.type === MoveTargetType.ExistingClass && target.className) {
      // 插入到類別內
      insertLine = await this.findClassInsertPosition(content, target.className);
    }

    if (insertLine < 0) {
      // 預設插入到檔案結尾
      insertLine = lines.length;
    }

    const newLines = [
      ...lines.slice(0, insertLine),
      '',
      memberCode,
      ...lines.slice(insertLine)
    ];

    return {
      filePath: target.filePath,
      originalCode: content,
      newCode: newLines.join('\n'),
      isNewFile: false
    };
  }

  /**
   * 準備引用更新
   * 直接掃描 import 語句，不依賴 SymbolFinder 的引用類型
   * 支援分離 import 語句：當 import 包含多個成員時，只更新被移動的成員
   */
  private async prepareReferenceUpdates(
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
        const line = lines[i];

        // 檢查是否是 import 語句且包含成員名稱和來源路徑
        const importPathMatch = this.extractImportPath(line);
        if (!importPathMatch) {continue;}

        // 解析 import 路徑為絕對路徑並比較
        const resolvedImportPath = this.resolveImportPathToAbsolute(importPathMatch, filePath);
        const normalizedSourceFile = path.normalize(options.sourceFile);

        // 比較路徑（考慮副檔名）
        if (!this.pathsMatch(resolvedImportPath, normalizedSourceFile)) {continue;}

        // 解析 import 中的所有成員
        const importedMembers = this.parseImportedMembers(line);
        if (importedMembers.length === 0) {continue;}

        // 找出需要移動的成員（可能帶別名）
        const memberToMove = importedMembers.find(m => m.name === member.name);
        if (!memberToMove) {continue;}

        // 計算新的相對路徑
        const newRelativePath = this.calculateRelativePath(filePath, options.target.filePath);
        const quoteChar = this.detectQuoteChar(line);

        // 根據是否有其他成員決定如何更新 import
        const otherMembers = importedMembers.filter(m => m.name !== member.name);
        let newImport: string;

        if (otherMembers.length === 0) {
          // 只有一個成員，直接替換路徑
          newImport = line.replace(
            new RegExp(`(['"\`])${this.escapeRegex(importPathMatch)}\\1`),
            `$1${newRelativePath}$1`
          );
        } else {
          // 有多個成員，需要分離 import
          // 生成保留在原位置的 import
          const remainingMembersStr = otherMembers.map(m =>
            m.alias ? `${m.name} as ${m.alias}` : m.name
          ).join(', ');
          const remainingImport = `import { ${remainingMembersStr} } from ${quoteChar}${importPathMatch}${quoteChar};`;

          // 生成移動到新位置的 import
          const movedMemberStr = memberToMove.alias
            ? `${memberToMove.name} as ${memberToMove.alias}`
            : memberToMove.name;
          const newLocationImport = `import { ${movedMemberStr} } from ${quoteChar}${newRelativePath}${quoteChar};`;

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
                start: { line: i + 1, column: 1, offset: undefined },
                end: { line: i + 1, column: line.length + 1, offset: undefined }
              }
            }
          });
        }
      }
    }

    return updates;
  }

  /**
   * 解析 import 語句中的成員列表
   */
  private parseImportedMembers(line: string): Array<{ name: string; alias?: string }> {
    const members: Array<{ name: string; alias?: string }> = [];

    // 匹配 { A, B as C, D } 形式
    const match = line.match(/import\s*\{([^}]+)\}\s*from/);
    if (!match) {return members;}

    const membersStr = match[1];
    const memberParts = membersStr.split(',');

    for (const part of memberParts) {
      const trimmed = part.trim();
      if (!trimmed) {continue;}

      // 檢查是否有別名 (name as alias)
      const aliasMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
      if (aliasMatch) {
        members.push({ name: aliasMatch[1], alias: aliasMatch[2] });
      } else {
        members.push({ name: trimmed });
      }
    }

    return members;
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
   */
  private resolveImportPathToAbsolute(importPath: string, fromFile: string): string {
    if (importPath.startsWith('.')) {
      // 相對路徑
      const fromDir = path.dirname(fromFile);
      return path.normalize(path.resolve(fromDir, importPath));
    }
    // 非相對路徑（可能是 node_modules 或路徑別名）
    // 目前只處理相對路徑，其他情況返回原路徑
    return importPath;
  }

  /**
   * 比較兩個路徑是否指向同一檔案（考慮副檔名）
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

    return withoutExt1 === withoutExt2;
  }

  /**
   * 移除檔案副檔名
   */
  private removeExtension(filePath: string): string {
    const ext = path.extname(filePath);
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      return filePath.slice(0, -ext.length);
    }
    return filePath;
  }

  /**
   * 跳脫正則表達式特殊字元
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 執行變更
   */
  private async applyChanges(
    sourceFileChange: { filePath: string; originalCode: string; newCode: string },
    targetFileChange: { filePath: string; originalCode: string | null; newCode: string; isNewFile: boolean },
    referenceUpdates: readonly ReferenceUpdate[]
  ): Promise<void> {
    // 確保目標目錄存在
    if (targetFileChange.isNewFile) {
      const targetDir = path.dirname(targetFileChange.filePath);
      await this.fileSystem.createDirectory(targetDir, true);
    }

    // 寫入來源檔案
    await this.fileSystem.writeFile(sourceFileChange.filePath, sourceFileChange.newCode);

    // 寫入目標檔案
    await this.fileSystem.writeFile(targetFileChange.filePath, targetFileChange.newCode);

    // 更新引用
    for (const update of referenceUpdates) {
      const content = await this.readFile(update.filePath);
      if (!content) {continue;}

      const newContent = content.replace(update.originalImport, update.newImport);
      await this.fileSystem.writeFile(update.filePath, newContent);
    }
  }

  /**
   * 生成 import 陳述
   * 注意：不應該 import 成員自身，因為成員已經被移動到新檔案
   */
  private generateImports(member: MemberDefinition, _options: MoveMemberOptions): string {
    // 新檔案不需要從來源檔案 import 任何東西
    // 因為：
    // 1. 成員自身已經被複製到新檔案，不需要 import
    // 2. 成員的依賴應該從原本的 import 路徑導入，而不是從來源檔案
    // 3. 實際的依賴（如型別）應該透過分析原始檔案的 import 來決定
    //
    // 目前暫時不生成任何 import，因為這需要更複雜的依賴分析
    // 未來可以改進：分析成員使用的型別和函式，從原始檔案的 import 中提取
    return '';
  }

  /**
   * 找到類別內的插入位置
   * 使用正則表達式嚴格匹配類別定義，避免匹配註解中的類別名稱
   */
  private async findClassInsertPosition(content: string, className: string): Promise<number> {
    const lines = content.split('\n');
    let inClass = false;
    let depth = 0;

    // 嚴格匹配類別定義：可選的 export/abstract，後接 class 關鍵字和類別名稱
    const classPattern = new RegExp(
      `^\\s*(export\\s+)?(abstract\\s+)?class\\s+${className}\\b`
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 使用正則表達式匹配，避免匹配註解
      if (!inClass && classPattern.test(line)) {
        inClass = true;
      }

      if (inClass) {
        for (const char of line) {
          if (char === '{') {depth++;}
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              // 找到類別結尾，在結尾括號前插入
              return i;
            }
          }
        }
      }
    }

    return -1;
  }

  /**
   * 計算相對路徑
   */
  private calculateRelativePath(from: string, to: string): string {
    const fromDir = path.dirname(from);
    let relativePath = path.relative(fromDir, to);

    // 移除副檔名
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');

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

      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
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
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];
    return supportedExtensions.some(ext => filename.endsWith(ext));
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
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
 * 建立 MoveMemberService 實例
 */
export function createMoveMemberService(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): MoveMemberService {
  return new MoveMemberService(parserRegistry, fileSystem);
}
