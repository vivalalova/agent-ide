/**
 * 包含各類 dead code 的測試檔案
 */

/**
 * 未使用的函式 - 應該被刪除
 * @param x 輸入參數
 * @returns 計算結果
 */
function unusedFunction(x: number): number {
  return x + 1;
}

/**
 * 未使用的類別 - 應該被刪除
 */
class UnusedClass {
  private data: string;

  constructor(data: string) {
    this.data = data;
  }

  process(): string {
    return this.data.toUpperCase();
  }
}

/**
 * 未使用的變數 - 應該被刪除
 */
const unusedVariable = 'this is unused';

/**
 * 未使用的介面 - 應該被刪除
 */
interface UnusedInterface {
  id: number;
  name: string;
}

/**
 * 未使用的型別別名 - 應該被刪除
 */
type UnusedType = string | number;

/**
 * 有使用的函式 - 不應該被刪除
 */
export function usedInDeadcode(): void {
  console.log('This function is exported and used');
}

// 確保有使用 usedInDeadcode
usedInDeadcode();
