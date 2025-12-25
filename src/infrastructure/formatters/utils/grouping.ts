/**
 * 格式化器共用分組工具
 */

/**
 * 按檔案路徑分組項目
 * @param items - 包含 file 屬性的項目陣列
 * @returns 按檔案路徑分組的 Map
 */
export function groupByFile<T extends { file: string }>(items: T[]): Map<string, T[]> {
  const byFile = new Map<string, T[]>();
  items.forEach(item => {
    const list = byFile.get(item.file) || [];
    list.push(item);
    byFile.set(item.file, list);
  });
  return byFile;
}

/**
 * 限制列表輸出並產生溢出訊息的配置
 */
export interface LimitedListConfig<T> {
  /** 要處理的項目陣列 */
  items: T[];
  /** 最大顯示數量（預設 10） */
  limit?: number;
  /** 格式化單一項目的函數 */
  formatItem: (item: T) => string;
  /** 溢出訊息的單位文字（如「引用」、「呼叫者」） */
  overflowUnit: string;
  /** 行前綴縮排（預設 4 個空格） */
  indent?: string;
}

/**
 * 限制列表輸出並產生溢出訊息
 * @returns 格式化後的行陣列
 */
export function formatLimitedList<T>(config: LimitedListConfig<T>): string[] {
  const {
    items,
    limit = 10,
    formatItem,
    overflowUnit,
    indent = '    '
  } = config;

  const lines: string[] = [];

  items.slice(0, limit).forEach(item => {
    lines.push(`${indent}${formatItem(item)}`);
  });

  if (items.length > limit) {
    lines.push(`${indent}... 還有 ${items.length - limit} 個${overflowUnit}`);
  }

  return lines;
}
