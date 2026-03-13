/**
 * Logger — 全域單例日誌模組
 * verbose/debug 僅在 Verbose 模式下輸出；warn 永遠輸出
 * 所有輸出走 process.stderr.write，不污染 stdout
 */

export enum LogLevel {
  Silent = 0,
  Normal = 1,
  Verbose = 2,
}

export class Logger {
  private static _instance: Logger;
  private _level: LogLevel = LogLevel.Normal;

  static getInstance(): Logger {
    if (!Logger._instance) {
      Logger._instance = new Logger();
    }
    return Logger._instance;
  }

  /** 測試隔離用：重置 log level（保留 singleton 參照，避免模組快取舊實例） */
  static resetInstance(): void {
    Logger.getInstance().setLevel(LogLevel.Normal);
  }

  setLevel(level: LogLevel): void {
    this._level = level;
  }

  getLevel(): LogLevel {
    return this._level;
  }

  isVerbose(): boolean {
    return this._level >= LogLevel.Verbose;
  }

  verbose(module: string, message: string): void {
    if (this._level < LogLevel.Verbose) {return;}
    process.stderr.write(`[${module}] ${message}\n`);
  }

  warn(module: string, message: string): void {
    if (this._level === LogLevel.Silent) {return;}
    process.stderr.write(`[WARN][${module}] ${message}\n`);
  }
}

export const logger = Logger.getInstance();
