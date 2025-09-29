/**
 * Logger utility with different log levels
 * Tests utility module patterns and enum usage
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
  context?: string;
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
      context: this.getCallerContext()
    };

    this.logs.push(entry);

    // Console output
    const levelName = LogLevel[level];
    const timestamp = entry.timestamp.toISOString();

    console.log(`[${timestamp}] ${levelName}: ${message}`, data || '');
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  private getCallerContext(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';

    const lines = stack.split('\n');
    // Skip Error constructor, this method, and the log level method
    const callerLine = lines[4];
    return callerLine ? callerLine.trim() : 'unknown';
  }
}

export const logger = new Logger();

// Complex utility functions for testing
export function formatLogMessage(entry: LogEntry): string {
  const levelName = LogLevel[entry.level];
  const timestamp = entry.timestamp.toISOString();

  let message = `[${timestamp}] ${levelName}: ${entry.message}`;

  if (entry.data) {
    message += ` | Data: ${JSON.stringify(entry.data)}`;
  }

  if (entry.context) {
    message += ` | Context: ${entry.context}`;
  }

  return message;
}

export function filterLogsByLevel(logs: LogEntry[], level: LogLevel): LogEntry[] {
  return logs.filter(log => log.level >= level);
}

export function filterLogsByTimeRange(
  logs: LogEntry[],
  startTime: Date,
  endTime: Date
): LogEntry[] {
  return logs.filter(log =>
    log.timestamp >= startTime && log.timestamp <= endTime
  );
}

export function groupLogsByLevel(logs: LogEntry[]): Map<LogLevel, LogEntry[]> {
  const grouped = new Map<LogLevel, LogEntry[]>();

  for (const log of logs) {
    if (!grouped.has(log.level)) {
      grouped.set(log.level, []);
    }
    grouped.get(log.level)!.push(log);
  }

  return grouped;
}

export function getLogStatistics(logs: LogEntry[]): {
  total: number;
  byLevel: Record<string, number>;
  timeRange: {
    earliest: Date | null;
    latest: Date | null;
  };
} {
  const byLevel: Record<string, number> = {};
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const log of logs) {
    const levelName = LogLevel[log.level];
    byLevel[levelName] = (byLevel[levelName] || 0) + 1;

    if (!earliest || log.timestamp < earliest) {
      earliest = log.timestamp;
    }
    if (!latest || log.timestamp > latest) {
      latest = log.timestamp;
    }
  }

  return {
    total: logs.length,
    byLevel,
    timeRange: { earliest, latest }
  };
}