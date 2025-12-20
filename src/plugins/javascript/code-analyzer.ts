/**
 * JavaScript 程式碼分析器
 * 負責程式碼品質分析、安全性檢查、命名規範檢測等功能
 */

import { createHash } from 'crypto';
import type { Symbol, SymbolType, AST } from '@shared/types/index.js';
import type {
  CodeFragment,
  ComplexityMetrics,
  ErrorHandlingIssue,
  NamingIssue,
  PatternMatch,
  SecurityIssue,
  TypeSafetyIssue,
  UnusedCode
} from '../../infrastructure/parser/analysis-types.js';

/**
 * JavaScript 程式碼分析器
 * 提供程式碼品質、安全性、命名規範等分析功能
 */
export class CodeAnalyzer {
  /**
   * 檢測未使用的符號（JavaScript 基本實作）
   */
  async detectUnusedSymbols(_ast: AST, _allSymbols: Symbol[]): Promise<UnusedCode[]> {
    // JavaScript 版本暫時返回空結果
    // 未來可以實作類似 TypeScript 的檢測邏輯
    return [];
  }

  /**
   * 分析程式碼複雜度
   */
  async analyzeComplexity(_code: string, _ast: AST): Promise<ComplexityMetrics> {
    // JavaScript 版本暫時返回簡單結果
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      evaluation: 'simple',
      functionCount: 0,
      averageComplexity: 0,
      maxComplexity: 0
    };
  }

  /**
   * 提取程式碼片段（用於重複代碼檢測）
   */
  async extractCodeFragments(code: string, filePath: string): Promise<CodeFragment[]> {
    const fragments: CodeFragment[] = [];

    // 1. 提取頂層註解
    const commentFragments = this.extractTopLevelComments(code, filePath);
    fragments.push(...commentFragments);

    // 2. 提取方法
    const methodFragments = this.extractMethods(code, filePath);
    fragments.push(...methodFragments);

    // 3. 提取常數定義
    const constantFragments = this.extractConstants(code, filePath);
    fragments.push(...constantFragments);

    // 4. 提取配置物件
    const configFragments = this.extractConfigObjects(code, filePath);
    fragments.push(...configFragments);

    return fragments;
  }

  /**
   * 檢測樣板模式
   */
  async detectPatterns(_code: string, _ast: AST): Promise<PatternMatch[]> {
    // JavaScript 可以檢測相同的模式
    return [];
  }

  /**
   * 檢查型別安全問題（JavaScript 無型別系統）
   */
  async checkTypeSafety(_code: string, _ast: AST): Promise<TypeSafetyIssue[]> {
    // JavaScript 沒有型別系統
    return [];
  }

  /**
   * 檢查錯誤處理問題
   */
  async checkErrorHandling(code: string, ast: AST): Promise<ErrorHandlingIssue[]> {
    const issues: ErrorHandlingIssue[] = [];
    const lines = code.split('\n');

    // 檢測空 catch 區塊
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        issues.push({
          type: 'empty-catch',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '空的 catch 區塊，應該處理錯誤或記錄日誌',
          severity: 'warning'
        });
      }

      // 檢測靜默吞錯
      if (/catch\s*\([^)]*\)\s*\{[^}]*\/\/\s*(ignore|skip|TODO)[^}]*\}/.test(line)) {
        issues.push({
          type: 'silent-error',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: 'catch 區塊靜默吞錯，只有註解沒有實際處理',
          severity: 'warning'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查安全性問題
   */
  async checkSecurity(code: string, ast: AST): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢測硬編碼密碼
      if (
        /(password|passwd|pwd|secret|apiKey|token)\s*[:=]\s*['"][^'"]{3,}['"]/.test(line)
        && !/(process\.env|config\.|import|require)/.test(line)
      ) {
        issues.push({
          type: 'hardcoded-secret',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '硬編碼的密碼或密鑰，應使用環境變數',
          severity: 'critical'
        });
      }

      // 檢測 eval 使用
      if (/\beval\s*\(/.test(line)) {
        issues.push({
          type: 'unsafe-eval',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '使用 eval 可能導致代碼注入風險',
          severity: 'high'
        });
      }

      // 檢測 innerHTML
      if (/\.innerHTML\s*=/.test(line) && !/(DOMPurify|sanitize)/.test(line)) {
        issues.push({
          type: 'xss-vulnerability',
          location: { filePath: ast.sourceFile, line: i + 1, column: 0 },
          message: '直接設定 innerHTML 可能導致 XSS 攻擊',
          severity: 'medium'
        });
      }
    }

    return issues;
  }

  /**
   * 檢查命名規範問題
   * @param symbols 符號列表
   * @param filePath 檔案路徑
   * @param symbolType SymbolType enum 用於比對
   */
  async checkNamingConventions(
    symbols: Symbol[],
    filePath: string,
    symbolType: typeof SymbolType
  ): Promise<NamingIssue[]> {
    const issues: NamingIssue[] = [];

    for (const symbol of symbols) {
      // 檢測底線開頭變數
      if (symbol.name.startsWith('_') && symbol.type === symbolType.Variable) {
        issues.push({
          type: 'invalid-naming',
          symbolName: symbol.name,
          symbolType: symbol.type,
          location: {
            filePath,
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          message: `變數 "${symbol.name}" 以底線開頭，違反命名規範`
        });
      }
    }

    return issues;
  }

  // ===== 私有方法 =====

  /**
   * 提取頂層註解
   */
  private extractTopLevelComments(code: string, filePath: string): CodeFragment[] {
    const fragments: CodeFragment[] = [];
    const lines = code.split('\n');

    let commentStart = -1;
    let inBlockComment = false;

    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i].trim();

      if ((line.startsWith('/**') || line.startsWith('/*')) && commentStart === -1) {
        commentStart = i;
        inBlockComment = true;
      }

      if (inBlockComment && line.includes('*/')) {
        const commentEnd = i;
        const commentCode = lines.slice(commentStart, commentEnd + 1).join('\n');
        const lineCount = commentEnd - commentStart + 1;

        if (lineCount >= 3) {
          fragments.push({
            type: 'comment',
            code: commentCode,
            tokens: this.tokenizeCode(commentCode, true),
            location: { filePath, startLine: commentStart + 1, endLine: commentEnd + 1 },
            hash: createHash('md5').update(commentCode).digest('hex')
          });
        }

        commentStart = -1;
        inBlockComment = false;
      }

      if (!inBlockComment && line && !line.startsWith('//') && !line.startsWith('*')) {
        break;
      }
    }

    return fragments;
  }

  /**
   * 提取方法
   */
  private extractMethods(code: string, filePath: string): CodeFragment[] {
    const fragments: CodeFragment[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配方法定義（支援 ES6+）
      if (/(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*{)/.test(line)) {
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && (endLine - i + 1) >= 3) {
          const methodCode = lines.slice(i, endLine + 1).join('\n');
          fragments.push({
            type: 'method',
            code: methodCode,
            tokens: this.tokenizeCode(methodCode, false),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(methodCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  /**
   * 提取常數定義
   */
  private extractConstants(code: string, filePath: string): CodeFragment[] {
    const fragments: CodeFragment[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配 const/export const XXX = { ... }
      if (/(export\s+)?const\s+\w+\s*=\s*{/.test(line)) {
        let braceCount = 1;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && (endLine - i + 1) >= 3) {
          const constantCode = lines.slice(i, endLine + 1).join('\n');
          fragments.push({
            type: 'constant',
            code: constantCode,
            tokens: this.tokenizeCode(constantCode, false),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(constantCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  /**
   * 提取配置物件
   */
  private extractConfigObjects(code: string, filePath: string): CodeFragment[] {
    const fragments: CodeFragment[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/config|Config|options|Options/.test(line) && /{/.test(line)) {
        let braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        let endLine = i;

        for (let j = i + 1; j < lines.length && braceCount > 0; j++) {
          braceCount += (lines[j].match(/{/g) || []).length;
          braceCount -= (lines[j].match(/}/g) || []).length;
          endLine = j;
        }

        if (endLine > i && (endLine - i + 1) >= 3) {
          const configCode = lines.slice(i, endLine + 1).join('\n');
          fragments.push({
            type: 'config',
            code: configCode,
            tokens: this.tokenizeCode(configCode, false),
            location: { filePath, startLine: i + 1, endLine: endLine + 1 },
            hash: createHash('md5').update(configCode).digest('hex')
          });
        }
      }
    }

    return fragments;
  }

  /**
   * 將程式碼 tokenize
   */
  private tokenizeCode(code: string, includeComments: boolean): string[] {
    if (includeComments) {
      return code.split(/\s+/).filter(t => t.length > 0);
    }
    const withoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    return withoutComments.split(/\s+/).filter(t => t.length > 0);
  }
}
