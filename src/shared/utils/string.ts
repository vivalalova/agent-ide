/**
 * 將字串的首字母大寫
 * @param str 待轉換的字串
 * @returns 首字母大寫的字串
 */
export function capitalize(str: string): string {
  if (!str) {return '';}
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 將字串轉換為駝峰命名
 * @param str 待轉換的字串
 * @returns 駝峰命名格式的字串
 */
export function camelCase(str: string): string {
  if (!str) {return '';}

  return str
    .replace(/[^\w\s]/g, ' ') // 將特殊字元替換為空格
    .replace(/_/g, ' ') // 將底線替換為空格
    .replace(/-/g, ' ') // 將短橫線替換為空格
    .replace(/\s+/g, ' ') // 將多個空格合併為單個空格
    .trim()
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (match, index) => {
      return index === 0 ? match.toLowerCase() : match.toUpperCase();
    })
    .replace(/\s+/g, '');
}

/**
 * 將字串轉換為蛇形命名
 * @param str 待轉換的字串
 * @returns 蛇形命名格式的字串
 */
export function snakeCase(str: string): string {
  if (!str) {return '';}

  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2') // 在小寫字母後的大寫字母前加底線
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2') // 處理連續大寫字母
    .replace(/[^\w]/g, '_') // 將非字母數字字元替換為底線
    .replace(/_+/g, '_') // 將多個底線合併為單個底線
    .replace(/^_|_$/g, '') // 移除開頭和結尾的底線
    .toLowerCase();
}

/**
 * 將字串轉換為短橫線命名
 * @param str 待轉換的字串
 * @returns 短橫線命名格式的字串
 */
export function kebabCase(str: string): string {
  if (!str) {return '';}

  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2') // 在小寫字母後的大寫字母前加短橫線
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // 處理連續大寫字母
    .replace(/_/g, '-') // 將底線替換為短橫線
    .replace(/[^\w-]/g, '-') // 將非字母數字短橫線字元替換為短橫線
    .replace(/-+/g, '-') // 將多個短橫線合併為單個短橫線
    .replace(/^-|-$/g, '') // 移除開頭和結尾的短橫線
    .toLowerCase();
}

/**
 * 截斷字串並添加省略符
 * @param str 待截斷的字串
 * @param length 最大長度
 * @param ellipsis 省略符，預設為 '...'
 * @returns 截斷後的字串
 */
export function truncate(str: string, length: number, ellipsis: string = '...'): string {
  if (!str) {return '';}
  if (length <= 0) {return ellipsis;}
  if (str.length <= length) {return str;}

  return str.slice(0, length) + ellipsis;
}

/**
 * 在字串開頭填充字元
 * @param str 待填充的字串
 * @param targetLength 目標長度
 * @param padString 填充字元，預設為空格
 * @returns 填充後的字串
 */
export function padStart(str: string, targetLength: number, padString: string = ' '): string {
  if (!str && targetLength > 0) {
    return padString.repeat(targetLength);
  }

  const currentLength = str.length;
  if (currentLength >= targetLength) {return str;}

  const padLength = targetLength - currentLength;
  const pad = padString.repeat(Math.ceil(padLength / padString.length)).slice(0, padLength);

  return pad + str;
}

/**
 * 在字串結尾填充字元
 * @param str 待填充的字串
 * @param targetLength 目標長度
 * @param padString 填充字元，預設為空格
 * @returns 填充後的字串
 */
export function padEnd(str: string, targetLength: number, padString: string = ' '): string {
  if (!str && targetLength > 0) {
    return padString.repeat(targetLength);
  }

  const currentLength = str.length;
  if (currentLength >= targetLength) {return str;}

  const padLength = targetLength - currentLength;
  const pad = padString.repeat(Math.ceil(padLength / padString.length)).slice(0, padLength);

  return str + pad;
}

/**
 * 移除字串的共同縮排
 * @param str 待處理的字串
 * @returns 移除縮排後的字串
 */
export function stripIndent(str: string): string {
  if (!str) {return '';}

  const lines = str.split('\n');

  // 移除開頭和結尾的空行
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  if (lines.length === 0) {return '';}

  // 找到最小縮排
  const indents = lines
    .filter(line => line.trim() !== '')
    .map(line => line.match(/^[ \t]*/)?.[0].length ?? 0);

  const minIndent = Math.min(...indents);

  // 移除共同縮排
  return lines
    .map(line => line.slice(minIndent))
    .join('\n');
}

/**
 * 跳脫正則表達式特殊字元
 * @param str 待跳脫的字串
 * @returns 跳脫後的字串
 */
export function escapeRegExp(str: string): string {
  if (!str) {return '';}
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 模板字串替換
 * @param template 模板字串，使用 {{key}} 格式
 * @param variables 變數物件
 * @returns 替換後的字串
 */
export function template(template: string, variables: Record<string, any>): string {
  if (!template) {return '';}

  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();

    // 支援巢狀物件存取，如 user.name
    const value = trimmedKey.split('.').reduce((obj: any, prop: string) => {
      return obj?.[prop];
    }, variables);

    return value !== undefined ? String(value) : match;
  });
}

/**
 * 轉換為 URL 友好的字串
 * @param str 待轉換的字串
 * @returns URL 友好的字串
 */
export function slugify(str: string): string {
  if (!str) {return '';}

  return str
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, ' ') // 將特殊字元替換為空格，保留字母、數字、中文、空格和短橫線
    .replace(/\s+/g, '-') // 將空格替換為短橫線
    .replace(/-+/g, '-') // 將多個短橫線合併為單個短橫線
    .replace(/^-|-$/g, ''); // 移除開頭和結尾的短橫線
}