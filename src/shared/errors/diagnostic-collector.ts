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

export interface DiagnosticSink {
  warn(module: string, message: string): void;
  error(module: string, message: string): void;
}

const consoleDiagnosticSink: DiagnosticSink = {
  warn(module: string, message: string): void {
    console.warn(`[${module}] ${message}`);
  },
  error(module: string, message: string): void {
    console.error(`[${module}] ${message}`);
  }
};

/**
 * 診斷收集器
 * 收集分析過程中的警告與錯誤，預設轉發至 console.warn/error。
 */
export class DiagnosticCollector {
  private readonly _diagnostics: Diagnostic[] = [];
  private _silent: boolean;
  private _sink: DiagnosticSink;

  constructor(options: { silent?: boolean; sink?: DiagnosticSink } = {}) {
    this._silent = options.silent ?? false;
    this._sink = options.sink ?? consoleDiagnosticSink;
  }

  setSilent(silent: boolean): void {
    this._silent = silent;
  }

  setSink(sink: DiagnosticSink): void {
    this._sink = sink;
  }

  resetSink(): void {
    this._sink = consoleDiagnosticSink;
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
      this._sink.warn(module, formatDiagnosticMessage(d));
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
      this._sink.error(module, formatDiagnosticMessage(d));
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

function formatDiagnosticMessage(diagnostic: Diagnostic): string {
  return diagnostic.filePath
    ? `${diagnostic.filePath} ${diagnostic.message}`
    : diagnostic.message;
}

/**
 * 全域預設診斷收集器（輸出至 console，與原有行為一致）
 */
export const diagnostics = new DiagnosticCollector();
