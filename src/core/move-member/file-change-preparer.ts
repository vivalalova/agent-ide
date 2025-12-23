/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的變更
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { MemberDefinition, MoveMemberOptions, FileChange, TargetFileChange } from './types.js';
import { MoveTargetType } from './types.js';

/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的程式碼變更
 */
export class FileChangePreparer {
  constructor(private readonly fileSystem: IFileSystem) {}

  /**
   * 準備來源檔案變更
   */
  async prepareSourceFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<FileChange> {
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
  async prepareTargetFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<TargetFileChange> {
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
      const imports = this.generateImports(member);
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
   * 生成 import 陳述
   * 注意：不應該 import 成員自身，因為成員已經被移動到新檔案
   */
  private generateImports(_member: MemberDefinition): string {
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
}
