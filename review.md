# 測試程式碼審查

- [重大] `tests/core/indexing/index-engine.test.ts:39-42` 使用 `item.includes('test')` 會把資料夾名稱中含有 "test" 的任何字串都排除，像是 `latest`、`contest` 等。實際的 `glob` 不會這樣處理，這會讓測試在這些路徑上得不到覆蓋。建議改成比對完整目錄名稱或利用 `options.ignore` 清單處理。
- [重大] `tests/core/indexing/index-engine.test.ts:27-65` 的 `glob` mock 完全忽略了真正 `glob` 會收到的 `ignore` 參數，導致就算 production code 沒有將排除清單傳下去測試也不會失敗。建議第二個參數要接住 options 並依 `options?.ignore` 過濾，這樣測試才有價值。
- [一般] `tests/test-utils/test-parsers.*` 生成的 `.js/.d.ts/.map` 檔案看起來是編譯產物，不應提交；否則之後修改 `test-parsers.ts` 容易遺漏同步更新。建議把這些檔案刪除並加入 `.gitignore`。
