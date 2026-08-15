---
paths: "**/*.{ts,tsx,js,jsx,mjs,cjs,py,rb,go,rs,swift,kt,java,cs,php,vue,svelte}"
---

# 寫碼工程通則

## Code Style

- bug 追 root cause；Workaround（sibling type、constructor cast）是味道警訊，原始解讀通常有問題 → 回頭 `AskUserQuestion`
- 存取物件優先存物件本身，非 ID+lookup
- 改行為或新增行為要求（審查判準、輸出要求、prompt 紀律）都找共用定義（CSS var、基類、共用函數、共用 agent／reference）改／下沉一處生效，呼叫端只引用，禁只加在單一呼叫點
- 改共用定義的語意（不只簽名）→ 掃全部消費端定新舊語意歸屬；一欄位被改出兩種語意 → 先拆兩個命名定義再改（bug 藏在沒動的消費行，不進 diff、review 看不見）
- 隱性重載同觸發：新增狀態/分支讓既有欄位在新路徑下承載第二種語意（定義本身沒動）也算改語意
- 改動完成刪自己造成的 unused（既有無關 dead code 提報禁逕刪）；方案無效清所有相關碼
- shared/ 只放多模組共用：僅一模組用就放該檔；shared/ 中只剩一模組用搬回去
- UI light + dark mode
- Rich Model 優先：domain 物件（Entity/VO/Aggregate）盡可能內含行為，禁 Anemic Model（純 getter/setter + 邏輯散到 service）
- 禁 util/helpers/common/misc，按職責命名（`date-format.ts`）
- 同 feature 的 collection/table 命名盡量取相近字母序（如共用 feature 前綴），GUI 依字母排序瀏覽時同 feature 的才會相鄰
- CLI/API/SDK 查 doc 確認，禁憑記憶
- 寫入外部格式（設定檔/API schema）先讀現有檔，禁自創欄位
- 有靜態檢查得到的寫法就用、不寫檢查不到的（`obj.a` 非 `obj["a"]`、typed 查詢非字串拼欄名）——前者 rename/typo 編譯期就紅、後者只能 runtime 才壞；真動態 key 不得不用字串時，那條路徑必須測試補洞

## Test

- TDD：先寫 fail test 再改 code（bug fix 必先寫 reproduction test，新功能先 spec 後實作）；改 code 前現有 test 必 pass
- E2E/Integration > Unit；happy path 後過邊界 case
- 「專案無測試」不是跳過理由，先建基礎再動碼
- 重構首輪即建「重構前行為為錨」的等價對照逐條驗，不留事後審計；測試可信度用 mutation 驗：改壞 prod 一行該測試必紅
- 整台機器同時僅一個 test/build/typecheck/lint，禁 `run_in_background`
- 刪測試不漏 bug 就刪；測試驗最終副作用，非中間步驟
- 效能優化要寫測試斷言慢路徑（DB/API/cache/IO）不被觸發，每來源一測試
