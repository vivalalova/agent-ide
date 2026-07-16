/**
 * F18 P3 — batch vs indexFile 佇列 / generation 過期丟棄（reproduction）
 *
 * indexFile 對同路徑有 Promise 鏈序列化；batchIndexFiles 在 worker-pool 路徑
 * 直接寫入 FileIndex/SymbolIndex，不經 indexFileQueue。
 * 若 batch 結果與並行 indexFile 交錯，缺少 generation / 過期丟棄時，
 * 舊 batch 結果可能覆蓋較新的 indexFile 結果。
 *
 * 可測性：目前 IndexEngine 未暴露 generation 計數、且 unit 環境 parserPool=null
 * 時 batch 退回逐檔 indexFile（共用佇列），無法在 unit 層穩定重現 worker 交錯。
 * 本檔 skip 並釘下驗收條件，待產品側開可測縫（注入 fake pool 或 generation API）後啟用。
 */

import { describe, it } from 'vitest';

describe('F18：batch vs indexFile 佇列 / generation', () => {
  it.skip(
    'worker batch 舊結果不得覆蓋較新 indexFile 結果（需 generation 或可注入 parserPool 的可測縫）',
    () => {
      // 預期驗收（產品修後）：
      // 1. 對同一 path 先啟動慢 batch parse（generation=N），再完成較新 indexFile（generation=N+1）
      // 2. 慢 batch 完成寫入時偵測 generation 已過期 → 丟棄，不得把 index 蓋回舊內容
      // 3. findSymbol 最終只反映 generation=N+1 的符號
      //
      // 現況：IndexBatchParser.batchIndexFiles 在 parserPool!=null 時不走 indexFileQueue，
      // 且無 generation；unit 測試預設 parserPool=null 強制共用 indexFile 佇列，
      // 無法在不改 src/ 的前提下重現 race。故 skip。
    }
  );
});
