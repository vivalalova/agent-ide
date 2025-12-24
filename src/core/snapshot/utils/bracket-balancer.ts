/**
 * 括號平衡算法
 * 用於解析包含巢狀泛型的簽章
 */

/**
 * 解析簽章結果
 */
export interface ParsedSignature {
  /** 參數字串 */
  params: string;
  /** 回傳型別 */
  returnType: string;
}

/**
 * 使用括號平衡算法解析簽章
 * 正確處理巢狀泛型（如 Map<K, Fn<V>>）
 * @param signature 完整簽章字串
 * @returns 解析結果，無法解析則返回 null
 */
export function parseSignatureWithBalancing(signature: string): ParsedSignature | null {
  // 找到第一個 '(' 的位置（跳過泛型參數 '<...>'）
  let depth = 0;
  let parenStart = -1;

  for (let i = 0; i < signature.length; i++) {
    const char = signature[i];
    if (char === '<') {
      depth++;
    } else if (char === '>') {
      depth--;
    } else if (char === '(' && depth === 0) {
      parenStart = i;
      break;
    }
  }

  if (parenStart === -1) {
    return null;
  }

  // 從 parenStart 開始，使用括號平衡找到對應的 ')'
  depth = 0;
  let parenEnd = -1;

  for (let i = parenStart; i < signature.length; i++) {
    const char = signature[i];
    if (char === '(' || char === '<' || char === '{' || char === '[') {
      depth++;
    } else if (char === ')' || char === '>' || char === '}' || char === ']') {
      depth--;
      if (depth === 0 && char === ')') {
        parenEnd = i;
        break;
      }
    }
  }

  if (parenEnd === -1) {
    return null;
  }

  // 提取參數和回傳型別
  const params = signature.substring(parenStart + 1, parenEnd).trim();
  const afterParen = signature.substring(parenEnd + 1).trim();

  // 解析回傳型別（跳過 ':' 後的部分）
  let returnType = 'void';
  if (afterParen.startsWith(':')) {
    returnType = afterParen.substring(1).trim();
  }

  return { params, returnType };
}

/**
 * 格式化解析結果為簽章字串
 * @param parsed 解析結果
 * @returns 格式化字串 "(params) → returnType"
 */
export function formatParsedSignature(parsed: ParsedSignature): string {
  return parsed.params
    ? `(${parsed.params}) → ${parsed.returnType}`
    : `() → ${parsed.returnType}`;
}
