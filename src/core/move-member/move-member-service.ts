/**
 * Move Member Service
 * 成員移動核心服務
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { MemberExtractor } from './member-extractor.js';
import {
  type MoveMemberOptions,
  type MoveMemberResult,
  type MemberDefinition,
  type ReferenceUpdate,
  MoveTargetType,
  MoveMemberErrorCode
} from './types.js';
import { SymbolFinder } from '../shared/symbol-finder.js';

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
   * 驗證目標
   */
  private async validateTarget(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<{ code: MoveMemberErrorCode; message: string } | null> {
    const { target } = options;

    // 檢查目標檔案
    if (target.type === MoveTargetType.ExistingFile || target.type === MoveTargetType.ExistingClass) {
      const exists = await this.fileSystem.exists(target.filePath);
      if (!exists) {
        return {
          code: MoveMemberErrorCode.TargetFileNotFound,
          message: `目標檔案不存在: ${target.filePath}`
        };
      }

      // 檢查是否已有同名成員
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

    // 檢查目標類別
    if (target.type === MoveTargetType.ExistingClass && target.className) {
      const members = await this.memberExtractor.listMembers(target.filePath);
      const targetClass = members.find(m => m.name === target.className);
      if (!targetClass) {
        return {
          code: MoveMemberErrorCode.TargetClassNotFound,
          message: `找不到目標類別: ${target.className}`
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
   */
  private async prepareTargetFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<{ filePath: string; originalCode: string | null; newCode: string; isNewFile: boolean }> {
    const { target } = options;
    const isNewFile = target.type === MoveTargetType.NewFile;

    // 準備要插入的程式碼
    let memberCode = member.sourceCode;
    if (member.documentation) {
      memberCode = member.documentation + '\n' + memberCode;
    }

    // 確保有 export（如果原本有）
    if (!memberCode.includes('export') && member.modifiers.includes('export')) {
      memberCode = 'export ' + memberCode;
    }

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
    const content = await this.readFile(target.filePath);
    if (content === null) {
      throw new Error(`無法讀取目標檔案: ${target.filePath}`);
    }

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

        // 檢查是否包含成員名稱
        if (!this.lineContainsMember(line, member.name)) {continue;}

        // 解析 import 路徑為絕對路徑並比較
        const resolvedImportPath = this.resolveImportPathToAbsolute(importPathMatch, filePath);
        const normalizedSourceFile = path.normalize(options.sourceFile);

        // 比較路徑（考慮副檔名）
        if (!this.pathsMatch(resolvedImportPath, normalizedSourceFile)) {continue;}

        // 計算新的相對路徑並更新
        const newRelativePath = this.calculateRelativePath(filePath, options.target.filePath);
        const newLine = line.replace(
          new RegExp(`(['"\`])${this.escapeRegex(importPathMatch)}\\1`),
          `$1${newRelativePath}$1`
        );

        if (newLine !== line) {
          updates.push({
            filePath,
            originalImport: line,
            newImport: newLine,
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
   * 檢查行是否包含指定成員名稱
   */
  private lineContainsMember(line: string, memberName: string): boolean {
    const memberPattern = new RegExp(`\\b${this.escapeRegex(memberName)}\\b`);
    return memberPattern.test(line);
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
   */
  private generateImports(member: MemberDefinition, options: MoveMemberOptions): string {
    // 分析依賴並生成必要的 import
    const imports: string[] = [];

    for (const dep of member.dependencies) {
      // 檢查依賴是否在來源檔案中
      // 這裡簡化處理，實際應該更精確地分析
      const relativePath = this.calculateRelativePath(options.target.filePath, options.sourceFile);
      imports.push(`import { ${dep} } from '${relativePath}';`);
    }

    return imports.join('\n');
  }

  /**
   * 找到類別內的插入位置
   */
  private async findClassInsertPosition(content: string, className: string): Promise<number> {
    const lines = content.split('\n');
    let inClass = false;
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes(`class ${className}`)) {
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
      error: message,
      member: null as any,
      target: null as any,
      sourceFileChange: null as any,
      targetFileChange: null as any,
      referenceUpdates: [],
      executed: false,
      stats: {
        referencesUpdated: 0,
        filesAffected: 0
      }
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
