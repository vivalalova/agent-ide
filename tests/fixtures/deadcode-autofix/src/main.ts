/**
 * 主程式入口
 * 這個檔案應該被排除，不應被刪除
 */

import { usedFunction, UsedClass } from './used.js';

export function main(): void {
  const instance = new UsedClass('test');
  console.log(usedFunction(42));
  console.log(instance.getValue());
}

main();
