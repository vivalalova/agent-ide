/**
 * 有使用的模組
 */

/**
 * 有使用的函式
 */
export function usedFunction(x: number): number {
  return x * 2;
}

/**
 * 有使用的類別
 */
export class UsedClass {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }
}
