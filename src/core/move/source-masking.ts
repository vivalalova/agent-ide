/**
 * 字串字面值與註解遮罩
 * 供 import/export/require 語句偵測在判斷「這裡是不是一個陳述式」時，
 * 排除字串內容與註解中長得像陳述式的文字干擾
 */

/** 跨行遮罩狀態機的模式：code（一般程式碼）、blockComment（未閉合區塊註解延續）、
 * template（未閉合樣板字面值延續）。單/雙引號字串維持原本單行限制（真實 JS 語法下
 * 不可能無跳脫地跨行），只有區塊註解與樣板字面值需要跨行延續。 */
type MaskCarryMode = 'code' | 'blockComment' | 'template';

interface MaskLineResult {
  readonly masked: string;
  readonly nextMode: MaskCarryMode;
}

/**
 * 對單一行套用遮罩狀態機，`startMode` 為進入這一行時攜帶的跨行狀態（延續自
 * 上一行是否仍處於未閉合的區塊註解/樣板字面值）。
 *
 * 遮罩只清空字串/樣板內容與整段註解（含分隔符號本身），保留字串/樣板的
 * 引號分隔符（`'`/`"`/`` ` ``）本身與逐字元長度，讓後續的 import 偵測正則
 * 仍能以相同的字元位置比對；真正的路徑內容一律從遮罩前的原始文字重新切出。
 */
function maskLine(line: string, startMode: MaskCarryMode): MaskLineResult {
  const length = line.length;
  let result = '';
  let i = 0;

  if (startMode === 'blockComment') {
    const endIndex = line.indexOf('*/');
    if (endIndex === -1) {
      return { masked: ' '.repeat(length), nextMode: 'blockComment' };
    }
    result += ' '.repeat(endIndex + 2);
    i = endIndex + 2;
  } else if (startMode === 'template') {
    let j = 0;
    let closed = false;
    while (j < length) {
      if (line[j] === '\\') { j += 2; continue; }
      if (line[j] === '`') { closed = true; break; }
      j++;
    }
    if (!closed) {
      return { masked: ' '.repeat(length), nextMode: 'template' };
    }
    result += ' '.repeat(j) + '`';
    i = j + 1;
  }

  while (i < length) {
    const char = line[i];

    // 行內註解：// 之後直到行尾全部遮罩
    if (char === '/' && line[i + 1] === '/') {
      result += ' '.repeat(length - i);
      i = length;
      break;
    }

    // 同行內（或延續到下一行）的區塊註解：/* ... */
    if (char === '/' && line[i + 1] === '*') {
      const endIndex = line.indexOf('*/', i + 2);
      if (endIndex === -1) {
        result += ' '.repeat(length - i);
        return { masked: result, nextMode: 'blockComment' };
      }
      result += ' '.repeat(endIndex + 2 - i);
      i = endIndex + 2;
      continue;
    }

    // 單/雙引號字串字面值：保留引號本身，遮罩內容（維持單行限制，真實 JS
    // 語法下無跳脫時不可能跨行）
    if (char === '\'' || char === '"') {
      const quote = char;
      let j = i + 1;
      let closed = false;
      while (j < length) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === quote) { closed = true; break; }
        j++;
      }
      result += quote;
      if (closed) {
        result += ' '.repeat(j - i - 1) + quote;
        i = j + 1;
      } else {
        result += ' '.repeat(length - i - 1);
        i = length;
      }
      continue;
    }

    // 樣板字面值（可能跨行延續，見 computeMaskedLines）：保留反引號本身，遮罩內容
    if (char === '`') {
      let j = i + 1;
      let closed = false;
      while (j < length) {
        if (line[j] === '\\') { j += 2; continue; }
        if (line[j] === '`') { closed = true; break; }
        j++;
      }
      result += '`';
      if (closed) {
        result += ' '.repeat(j - i - 1) + '`';
        i = j + 1;
      } else {
        result += ' '.repeat(length - i - 1);
        return { masked: result, nextMode: 'template' };
      }
      continue;
    }

    result += char;
    i++;
  }

  return { masked: result, nextMode: 'code' };
}

/**
 * 對完整檔案內容逐行套用遮罩，跨行追蹤區塊註解／樣板字面值的未閉合狀態
 * （見 maskLine 的 MaskCarryMode）：取代原本逐行獨立呼叫、彼此無記憶的做法
 * （見缺陷：一個跨越多行的樣板字面值，其中間行若長得像 `import { x } from
 * './old';`，逐行獨立遮罩因不知道自己身處樣板字面值內部，會被誤判為真正的
 * import 陳述式並誤改寫）。
 *
 * @returns 與 content.split('\n') 一一對應、逐行遮罩後的文字陣列
 */
export function computeMaskedLines(content: string): string[] {
  const lines = content.split('\n');
  const maskedLines: string[] = [];
  let mode: MaskCarryMode = 'code';

  for (const line of lines) {
    const { masked, nextMode } = maskLine(line, mode);
    maskedLines.push(masked);
    mode = nextMode;
  }

  return maskedLines;
}
