/**
 * 搜尋工具模組
 * 提供搜尋選項構建功能
 */

import * as path from 'path';

/**
 * 構建搜尋選項
 */
export function buildSearchOptions(options: any) {
  let includeFiles = options.include ? options.include.split(',') : undefined;
  const excludeFiles = options.exclude ? options.exclude.split(',') : undefined;

  // --file-pattern 參數轉換為 includeFiles
  if (options.filePattern) {
    includeFiles = [options.filePattern];
  }

  return {
    scope: {
      type: 'directory' as const,
      path: path.resolve(options.path),
      recursive: true
    },
    maxResults: parseInt(options.limit),
    caseSensitive: options.caseInsensitive ? false : (options.caseSensitive || false),
    wholeWord: options.wholeWord || false,
    regex: options.regex || options.type === 'regex',
    fuzzy: options.type === 'fuzzy',
    multiline: options.multiline || false,
    showContext: options.context > 0,
    contextLines: parseInt(options.context),
    includeFiles,
    excludeFiles,
    timeout: 30000
  };
}
