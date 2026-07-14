/**
 * 字串字面值與註解遮罩
 * 供 import/export/require 語句偵測在判斷「這裡是不是一個陳述式」時，
 * 排除字串內容與註解中長得像陳述式的文字干擾
 */

/**
 * 遮罩字串字面值與註解，避免內容中長得像 import 陳述式的文字被誤判為真正的
 * import（見 C5 regression：字串字面值 "import ... from './x'" 或行內註解
 * // import ... from './x' 不應被當成真正的 import）。
 *
 * 遮罩只清空字串內容與註解本身、保留引號與逐字元長度，讓後續的 import
 * 偵測正則仍能以相同的字元位置比對；真正的路徑內容一律從遮罩前的原始文字
 * 重新切出（見呼叫端 originalMatchText），遮罩版本只用於「這裡是不是一個
 * import 陳述式」的形狀判斷。
 *
 * 僅處理單行範圍內的字串／註解，不追蹤跨行狀態：若區塊註解（以 `/*` 開頭、
 * 以星號加斜線結尾）或未閉合的字串跨行延續，本方法逐行呼叫、彼此無記憶，無法得知目前是否身處
 * 前一行開啟、尚未結束的區塊註解或字串內部，該延續行會被當成一般程式碼處理
 * （isCommentLine 僅能辨識該行本身即以 `//`、`/*`、`*` 開頭的情況，不構成
 * 真正的跨行狀態機，不能視為已涵蓋此邊界）。這是本方法已知的限制，非本次
 * 修復範圍。
 */
export function maskStringsAndComments(line: string): string {
  let result = '';
  let i = 0;
  const length = line.length;

  while (i < length) {
    const char = line[i];

    // 行內註解：// 之後直到行尾全部遮罩
    if (char === '/' && line[i + 1] === '/') {
      result += ' '.repeat(length - i);
      break;
    }

    // 同行內的區塊註解：/* ... */
    if (char === '/' && line[i + 1] === '*') {
      const endIndex = line.indexOf('*/', i + 2);
      if (endIndex === -1) {
        result += ' '.repeat(length - i);
        break;
      }
      result += ' '.repeat(endIndex + 2 - i);
      i = endIndex + 2;
      continue;
    }

    // 字串字面值（單引號、雙引號、模板字面值）：保留引號本身，遮罩內容
    if (char === '\'' || char === '"' || char === '`') {
      const quote = char;
      let j = i + 1;
      let closed = false;
      while (j < length) {
        if (line[j] === '\\') {
          j += 2;
          continue;
        }
        if (line[j] === quote) {
          closed = true;
          break;
        }
        j++;
      }
      result += quote;
      if (closed) {
        result += ' '.repeat(j - i - 1);
        result += quote;
        i = j + 1;
      } else {
        result += ' '.repeat(length - i - 1);
        i = length;
      }
      continue;
    }

    result += char;
    i++;
  }

  return result;
}
