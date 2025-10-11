/**
 * CLI 輸出格式化工具
 * 提供統一的輸出格式化介面，支援 Markdown、Plain、JSON、Minimal 四種格式
 */

export enum OutputFormat {
  Markdown = 'markdown',
  Plain = 'plain',
  Json = 'json',
  Minimal = 'minimal'
}

export interface FormattedOutput {
  content: string;
  format: OutputFormat;
}

export class OutputFormatter {
  constructor(private format: OutputFormat = OutputFormat.Markdown) {}

  /**
   * 格式化標題
   */
  formatTitle(title: string, level: number = 1): string {
    switch (this.format) {
    case OutputFormat.Markdown:
      return `${'#'.repeat(level)} ${title}`;

    case OutputFormat.Plain:
      return `\n${title}\n${'='.repeat(title.length)}`;

    case OutputFormat.Json:
      return JSON.stringify({ type: 'title', level, content: title });

    case OutputFormat.Minimal:
      return title;
    }
  }

  /**
   * 格式化列表
   */
  formatList(items: string[]): string {
    if (items.length === 0) {
      return '';
    }

    switch (this.format) {
    case OutputFormat.Markdown:
      return items.map(item => `- ${item}`).join('\n');

    case OutputFormat.Plain:
      return items.map((item, index) => `  ${index + 1}. ${item}`).join('\n');

    case OutputFormat.Json:
      return JSON.stringify({ type: 'list', items });

    case OutputFormat.Minimal:
      return items.join('; ');
    }
  }

  /**
   * 格式化表格
   */
  formatTable(headers: string[], rows: string[][]): string {
    switch (this.format) {
    case OutputFormat.Markdown:
      return this.formatMarkdownTable(headers, rows);

    case OutputFormat.Plain:
      return this.formatPlainTable(headers, rows);

    case OutputFormat.Json:
      return JSON.stringify({
        type: 'table',
        headers,
        rows
      });

    case OutputFormat.Minimal:
      return rows.map(row => row.join(',')).join('; ');
    }
  }

  /**
   * 格式化代碼塊
   */
  formatCodeBlock(code: string, language?: string): string {
    switch (this.format) {
    case OutputFormat.Markdown:
      return `\`\`\`${language || ''}\n${code}\n\`\`\``;

    case OutputFormat.Plain:
      return code.split('\n').map(line => `  ${line}`).join('\n');

    case OutputFormat.Json:
      return JSON.stringify({ type: 'code', language, content: code });

    case OutputFormat.Minimal:
      return code.replace(/\n/g, ' ').trim();
    }
  }

  /**
   * 格式化統計資訊
   */
  formatStats(stats: Record<string, any>): string {
    switch (this.format) {
    case OutputFormat.Markdown:
      return this.formatMarkdownStats(stats);

    case OutputFormat.Plain:
      return this.formatPlainStats(stats);

    case OutputFormat.Json:
      return JSON.stringify(stats, null, 2);

    case OutputFormat.Minimal:
      return Object.entries(stats)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
    }
  }

  /**
   * 格式化成功訊息
   */
  formatSuccess(message: string, details?: any): string {
    switch (this.format) {
    case OutputFormat.Markdown:
      return `✅ ${message}${details ? '\n' + this.formatStats(details) : ''}`;

    case OutputFormat.Plain:
      return `✅ ${message}${details ? '\n' + this.formatPlainStats(details) : ''}`;

    case OutputFormat.Json:
      return JSON.stringify({
        status: 'success',
        message,
        ...details
      }, null, 2);

    case OutputFormat.Minimal:
      const detailsStr = details
        ? ' ' + Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ')
        : '';
      return `success: ${message}${detailsStr}`;
    }
  }

  /**
   * 格式化錯誤訊息
   */
  formatError(error: Error | string): string {
    const message = error instanceof Error ? error.message : error;

    switch (this.format) {
    case OutputFormat.Markdown:
      return `❌ **錯誤**: ${message}`;

    case OutputFormat.Plain:
      return `❌ 錯誤: ${message}`;

    case OutputFormat.Json:
      return JSON.stringify({
        status: 'error',
        message
      }, null, 2);

    case OutputFormat.Minimal:
      return `error: ${message}`;
    }
  }

  /**
   * 格式化進度資訊
   */
  formatProgress(current: number, total: number, label?: string): string {
    const percentage = Math.round((current / total) * 100);

    switch (this.format) {
    case OutputFormat.Markdown:
      return `⏳ ${label || '進度'}: ${current}/${total} (${percentage}%)`;

    case OutputFormat.Plain:
      return `⏳ ${label || '進度'}: ${current}/${total} (${percentage}%)`;

    case OutputFormat.Json:
      return JSON.stringify({
        type: 'progress',
        current,
        total,
        percentage,
        label
      });

    case OutputFormat.Minimal:
      return `${current}/${total}`;
    }
  }

  // Private helper methods

  private formatMarkdownTable(headers: string[], rows: string[][]): string {
    const headerRow = `| ${headers.join(' | ')} |`;
    const separator = `|${headers.map(() => '------').join('|')}|`;
    const dataRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
    return `${headerRow}\n${separator}\n${dataRows}`;
  }

  private formatPlainTable(headers: string[], rows: string[][]): string {
    const lines: string[] = [];
    lines.push(headers.join('\t'));
    lines.push('-'.repeat(headers.join('\t').length));
    rows.forEach(row => {
      lines.push(row.join('\t'));
    });
    return lines.join('\n');
  }

  private formatMarkdownStats(stats: Record<string, any>): string {
    const entries = Object.entries(stats);
    if (entries.length === 0) {
      return '_無統計資訊_';
    }
    return entries.map(([key, value]) => `- **${key}**: ${value}`).join('\n');
  }

  private formatPlainStats(stats: Record<string, any>): string {
    const entries = Object.entries(stats);
    if (entries.length === 0) {
      return '(無統計資訊)';
    }
    return entries.map(([key, value]) => `   ${key}: ${value}`).join('\n');
  }
}
