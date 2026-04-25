/**
 * 診斷收集器
 * 統一的警告/錯誤記錄機制，替代散落的 console.warn 呼叫
 */

export enum DiagnosticSeverity {
  Error = 'error',
  Warning = 'warning'
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  module: string;
  filePath?: string;
  timestamp: Date;
}

/**
 * 診斷收集器
 * 收集分析過程中的警告與錯誤，預設轉發至 console.warn/error
 */
export class DiagnosticCollector {
  private readonly _diagnostics: Diagnostic[] = [];
  private _silent: boolean;

  constructor(options: { silent?: boolean } = {}) {
    this._silent = options.silent ?? false;
  }

  setSilent(silent: boolean): void {
    this._silent = silent;
  }

  warn(module: string, code: string, message: string, filePath?: string): void {
    const d: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      code,
      message,
      module,
      filePath,
      timestamp: new Date()
    };
    this._diagnostics.push(d);
    if (!this._silent) {
      const loc = filePath ? ` ${filePath}` : '';
      console.warn(`[${module}]${loc} ${message}`);
    }
  }

  error(module: string, code: string, message: string, filePath?: string): void {
    const d: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      code,
      message,
      module,
      filePath,
      timestamp: new Date()
    };
    this._diagnostics.push(d);
    if (!this._silent) {
      const loc = filePath ? ` ${filePath}` : '';
      console.error(`[${module}]${loc} ${message}`);
    }
  }

  getDiagnostics(): readonly Diagnostic[] {
    return this._diagnostics;
  }

  getWarnings(): readonly Diagnostic[] {
    return this._diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning);
  }

  hasErrors(): boolean {
    return this._diagnostics.some(d => d.severity === DiagnosticSeverity.Error);
  }

  clear(): void {
    this._diagnostics.length = 0;
  }
}

/**
 * 全域預設診斷收集器（輸出至 console，與原有行為一致）
 */
export const diagnostics = new DiagnosticCollector();
