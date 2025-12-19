/**
 * 測試用範例檔案（應被 --exclude 排除）
 * 這個檔案以 .example.ts 結尾，應該被 --exclude "*.example.ts" 排除
 */

// 這些 dead code 應該在排除時不被偵測
function unusedExampleFunction() {
  return 'example';
}

const unusedExampleVar = 'unused';

export { unusedExampleFunction, unusedExampleVar };
