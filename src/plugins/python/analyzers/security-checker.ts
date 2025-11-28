/**
 * Python 安全性檢查器
 * 檢查 eval()、exec()、SQL injection 等安全問題
 */

import type { SecurityIssue } from '@infrastructure/parser/analysis-types.js';
import { type PythonAST, type PythonASTNode, PythonNodeKind, DANGEROUS_FUNCTIONS, SECURITY_SENSITIVE_MODULES } from '../types.js';
import { traverseAST, getNodeText } from '../tree-sitter-bridge.js';

/**
 * Python 安全性檢查器類別
 */
export class PythonSecurityChecker {
  /**
   * 檢查安全性問題
   */
  check(code: string, ast: PythonAST): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // 檢查危險函數調用
    this.checkDangerousFunctions(ast, issues);

    // 檢查硬編碼密碼
    this.checkHardcodedSecrets(ast, issues);

    // 檢查 SQL injection
    this.checkSQLInjection(ast, issues);

    // 檢查不安全的 pickle 使用
    this.checkUnsafePickle(ast, issues);

    // 檢查 subprocess shell=True
    this.checkShellInjection(ast, issues);

    return issues;
  }

  /**
   * 檢查危險函數調用
   */
  private checkDangerousFunctions(ast: PythonAST, issues: SecurityIssue[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Call) {
        const funcNode = node.treeSitterNode.childForFieldName('function');
        if (!funcNode) {return;}

        const funcName = funcNode.text;

        // 直接調用危險函數
        if (DANGEROUS_FUNCTIONS.has(funcName)) {
          issues.push({
            type: 'unsafe-eval',
            location: {
              filePath: ast.sourceFile,
              line: node.range.start.line,
              column: node.range.start.column
            },
            message: `使用 ${funcName}() 可能導致程式碼注入漏洞`,
            severity: this.getDangerousFunctionSeverity(funcName),
            recommendation: this.getDangerousFunctionRecommendation(funcName)
          });
        }

        // 屬性調用（如 os.system）
        if (funcNode.type === 'attribute') {
          this.checkDangerousAttributeCall(funcNode, node, ast.sourceFile, issues);
        }
      }
    });
  }

  /**
   * 檢查危險的屬性調用
   */
  private checkDangerousAttributeCall(
    funcNode: any,
    callNode: PythonASTNode,
    filePath: string,
    issues: SecurityIssue[]
  ): void {
    const objNode = funcNode.childForFieldName('object');
    const attrNode = funcNode.childForFieldName('attribute');

    if (!objNode || !attrNode) {return;}

    const objName = objNode.text;
    const attrName = attrNode.text;

    // os.system, os.popen
    if (objName === 'os' && (attrName === 'system' || attrName === 'popen')) {
      issues.push({
        type: 'unsafe-api',
        location: {
          filePath,
          line: callNode.range.start.line,
          column: callNode.range.start.column
        },
        message: `使用 ${objName}.${attrName}() 可能導致命令注入漏洞`,
        severity: 'high',
        recommendation: '使用 subprocess.run() 並避免 shell=True'
      });
    }

    // pickle.loads
    if (objName === 'pickle' && (attrName === 'loads' || attrName === 'load')) {
      issues.push({
        type: 'unsafe-api',
        location: {
          filePath,
          line: callNode.range.start.line,
          column: callNode.range.start.column
        },
        message: `使用 pickle.${attrName}() 處理不信任的資料可能導致任意程式碼執行`,
        severity: 'critical',
        recommendation: '使用 json 或其他安全的序列化格式'
      });
    }
  }

  /**
   * 檢查硬編碼密碼
   */
  private checkHardcodedSecrets(ast: PythonAST, issues: SecurityIssue[]): void {
    const secretPatterns = [
      /password\s*=\s*["'][^"']+["']/i,
      /secret\s*=\s*["'][^"']+["']/i,
      /api_key\s*=\s*["'][^"']+["']/i,
      /token\s*=\s*["'][^"']+["']/i,
      /private_key\s*=\s*["'][^"']+["']/i
    ];

    traverseAST(ast.root, (node) => {
      if (
        node.pythonKind === PythonNodeKind.Assignment
        || node.pythonKind === PythonNodeKind.AnnotatedAssignment
      ) {
        const text = node.treeSitterNode.text;

        for (const pattern of secretPatterns) {
          if (pattern.test(text)) {
            issues.push({
              type: 'hardcoded-secret',
              location: {
                filePath: ast.sourceFile,
                line: node.range.start.line,
                column: node.range.start.column
              },
              message: '可能的硬編碼密碼或敏感資訊',
              severity: 'high',
              recommendation: '使用環境變數或安全的配置管理工具'
            });
            break;
          }
        }
      }
    });
  }

  /**
   * 檢查 SQL injection
   */
  private checkSQLInjection(ast: PythonAST, issues: SecurityIssue[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Call) {
        const funcNode = node.treeSitterNode.childForFieldName('function');
        if (!funcNode) {return;}

        // 檢查 execute() 調用
        if (funcNode.type === 'attribute') {
          const attrNode = funcNode.childForFieldName('attribute');
          if (attrNode?.text === 'execute' || attrNode?.text === 'executemany') {
            // 檢查第一個參數是否包含字串格式化
            const argsNode = node.treeSitterNode.childForFieldName('arguments');
            if (argsNode && argsNode.namedChildCount > 0) {
              const firstArg = argsNode.namedChild(0);
              if (firstArg && this.containsStringFormatting(firstArg.text)) {
                issues.push({
                  type: 'sql-injection',
                  location: {
                    filePath: ast.sourceFile,
                    line: node.range.start.line,
                    column: node.range.start.column
                  },
                  message: 'SQL 查詢使用字串格式化，可能存在 SQL injection 風險',
                  severity: 'critical',
                  recommendation: '使用參數化查詢代替字串拼接'
                });
              }
            }
          }
        }
      }
    });
  }

  /**
   * 檢查不安全的 pickle 使用
   */
  private checkUnsafePickle(ast: PythonAST, issues: SecurityIssue[]): void {
    // 已在 checkDangerousAttributeCall 中處理
  }

  /**
   * 檢查 shell injection
   */
  private checkShellInjection(ast: PythonAST, issues: SecurityIssue[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.Call) {
        const funcNode = node.treeSitterNode.childForFieldName('function');
        if (!funcNode) {return;}

        // 檢查 subprocess.run() 或 subprocess.Popen()
        if (funcNode.type === 'attribute') {
          const objNode = funcNode.childForFieldName('object');
          const attrNode = funcNode.childForFieldName('attribute');

          if (objNode?.text === 'subprocess' && (attrNode?.text === 'run' || attrNode?.text === 'Popen' || attrNode?.text === 'call')) {
            // 檢查是否有 shell=True
            const argsNode = node.treeSitterNode.childForFieldName('arguments');
            if (argsNode && this.hasShellTrue(argsNode)) {
              issues.push({
                type: 'unsafe-api',
                location: {
                  filePath: ast.sourceFile,
                  line: node.range.start.line,
                  column: node.range.start.column
                },
                message: 'subprocess 使用 shell=True 可能導致命令注入漏洞',
                severity: 'high',
                recommendation: '避免使用 shell=True，改用列表形式的命令參數'
              });
            }
          }
        }
      }
    });
  }

  /**
   * 檢查字串是否包含格式化
   */
  private containsStringFormatting(text: string): boolean {
    // f-string
    if (text.startsWith('f"') || text.startsWith('f\'')) {
      return true;
    }

    // % 格式化
    if (text.includes('%s') || text.includes('%d')) {
      return true;
    }

    // .format()
    if (text.includes('.format(')) {
      return true;
    }

    // 字串拼接
    if (text.includes('+')) {
      return true;
    }

    return false;
  }

  /**
   * 檢查是否有 shell=True 參數
   */
  private hasShellTrue(argsNode: any): boolean {
    for (let i = 0; i < argsNode.childCount; i++) {
      const child = argsNode.child(i);
      if (child?.type === 'keyword_argument') {
        const nameNode = child.childForFieldName('name');
        const valueNode = child.childForFieldName('value');
        if (nameNode?.text === 'shell' && valueNode?.text === 'True') {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 獲取危險函數的嚴重程度
   */
  private getDangerousFunctionSeverity(funcName: string): SecurityIssue['severity'] {
    const criticalFunctions = new Set(['eval', 'exec', 'compile']);
    const highFunctions = new Set(['__import__']);

    if (criticalFunctions.has(funcName)) {return 'critical';}
    if (highFunctions.has(funcName)) {return 'high';}
    return 'medium';
  }

  /**
   * 獲取危險函數的建議
   */
  private getDangerousFunctionRecommendation(funcName: string): string {
    const recommendations: Record<string, string> = {
      eval: '使用 ast.literal_eval() 或 json.loads() 處理不信任的資料',
      exec: '避免動態執行程式碼，使用安全的替代方案',
      compile: '避免動態編譯程式碼',
      __import__: '使用 importlib.import_module()',
      open: '確保檔案路徑經過驗證，避免路徑穿越攻擊',
      input: '驗證並清理使用者輸入'
    };

    return recommendations[funcName] || '評估是否有更安全的替代方案';
  }
}
