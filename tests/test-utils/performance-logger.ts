/**
 * 效能測試日誌工具
 * 只在 DEBUG_PERF 環境變數設定時輸出詳細日誌
 */

export class PerformanceLogger {
  private static isEnabled = process.env.DEBUG_PERF === '1' || process.env.DEBUG_PERF === 'true';
  private static buffer: string[] = [];
  private static isBuffering = false;

  /**
   * 條件式輸出日誌
   */
  static log(...args: any[]): void {
    if (this.isEnabled) {
      console.log(...args);
    } else if (this.isBuffering) {
      this.buffer.push(args.join(' '));
    }
  }

  /**
   * 總是輸出的重要資訊
   */
  static info(...args: any[]): void {
    console.log(...args);
  }

  /**
   * 錯誤訊息總是輸出
   */
  static error(...args: any[]): void {
    console.error(...args);
  }

  /**
   * 開始緩衝日誌（用於測試失敗時才輸出）
   */
  static startBuffering(): void {
    this.isBuffering = true;
    this.buffer = [];
  }

  /**
   * 停止緩衝並選擇性輸出
   */
  static flushBuffer(force = false): void {
    if (force || this.isEnabled) {
      this.buffer.forEach(msg => console.log(msg));
    }
    this.buffer = [];
    this.isBuffering = false;
  }

  /**
   * 格式化效能數據表格
   */
  static table(data: Record<string, any>): void {
    if (this.isEnabled) {
      console.table(data);
    }
  }

  /**
   * 輸出效能摘要
   */
  static summary(title: string, metrics: Record<string, any>): void {
    if (this.isEnabled) {
      console.log(`\\n=== ${title} ===`);
      Object.entries(metrics).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    }
  }

  /**
   * 測試結束時輸出最終報告
   */
  static finalReport(results: Record<string, any>): void {
    // 最終報告總是以精簡格式輸出
    const summary = {
      總測試數: results.totalTests,
      通過: results.passed,
      失敗: results.failed,
      平均執行時間: `${results.avgTime}ms`,
    };

    if (results.failed > 0 || this.isEnabled) {
      console.log('\\n測試效能摘要:', summary);
    }
  }
}

// 導出簡寫
export const perfLog = PerformanceLogger.log.bind(PerformanceLogger);
export const perfInfo = PerformanceLogger.info.bind(PerformanceLogger);
export const perfError = PerformanceLogger.error.bind(PerformanceLogger);
export const perfTable = PerformanceLogger.table.bind(PerformanceLogger);
export const perfSummary = PerformanceLogger.summary.bind(PerformanceLogger);