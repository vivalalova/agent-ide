/**
 * 測試用 lint rule（應被 --exclude 排除）
 * 這個檔案位於 lint-rules/ 目錄，應該被 --exclude "lint-rules/**" 排除
 */

// 這些 dead code 應該在排除時不被偵測
function unusedLintRule() {
  return 'lint-rule';
}

function anotherUnusedRule() {
  return 'another-rule';
}

export { unusedLintRule, anotherUnusedRule };
