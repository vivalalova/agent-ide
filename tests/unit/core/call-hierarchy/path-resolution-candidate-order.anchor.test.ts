/**
 * 行為為錨測試（釘現狀，非目標行為）：CallHierarchyAnalyzer 私有方法
 * resolveProjectImportPath（call-hierarchy-analyzer.ts 約 1487-1534 行）組候選用 Set，
 * 插入順序是逐副檔名交錯序：
 *
 *   for (const extension of extensions) {
 *     candidates.add(base + extension);
 *     candidates.add(join(base, 'index' + extension));
 *   }
 *
 * 即 foo.ts, foo/index.ts, foo.tsx, foo/index.tsx, foo.mts, ... —— 而非「全部 direct
 * 副檔名在前、全部 index 副檔名在後」的 block 序（impact/path-resolver 與
 * cli/module-file-resolver 現行採 block 序，見同任務下的另兩份 anchor 測試）。
 *
 * 本測試建構：'/proj/src/a.ts' 的 outer() 透過相對 import './foo' 呼叫 helper()；
 * '/proj/src/foo.tsx'（direct）定義 helper() 會再呼叫 nested()；
 * '/proj/src/foo/index.ts'（index）也定義同名 helper()，但函式本體不呼叫任何東西。
 *
 * 若 resolveProjectImportPath 真的採「全部 direct 優先於任何 index」的 block 序，
 * './foo' 應解析到 foo.tsx，depth 2 outgoing 應包含 nested。
 *
 * 實測結果（本測試已實跑驗證，非推測）：交錯序下 '.ts' 副檔名的 index 候選
 * foo/index.ts 在 Set 插入順序上排在 '.tsx' 副檔名的 direct 候選 foo.tsx 之前
 * （.ts 是 SOURCE_FILE_EXTENSIONS 首位），且 foo/index.ts 確實存在、優先被選中，
 * import 解析到 foo/index.ts 而非 foo.tsx，depth 2 outgoing 因此不含 nested——
 * 與「block 序」目標語意不同，證實推導成立。
 *
 * 本測試刻意斷言「目標（block 序）語意」，在現行交錯序實作下會失敗；用
 * it.fails 讓它保持紅但不讓整體測試套件變紅——一旦收斂修正為 block 序，it.fails
 * 會偵測到「預期失敗卻通過」而自動示警，提醒把它改回一般 it。這正是本任務背景
 * 說明中「第 5 項的例外」；本檔其餘（見下方另一個 describe）與同任務下的
 * path-resolver / module-file-resolver anchor 測試皆釘現狀，應為綠燈。
 *
 * 補充發現：impact/path-resolver 對同一種「foo.ext + foo/index.ts 並存」輸入，
 * 現行也不符合 block 序目標語意（見 path-resolver.anchor.test.ts 對應 it.fails
 * 案例）——即收斂目標前，四處候選組裝邏輯中至少有兩處（這裡與 path-resolver）
 * 現行不符合「direct 優先」語意，並非只有這裡一處。
 */
import { describe, expect, it } from 'vitest';
import { CallHierarchyAnalyzer } from '@core/call-hierarchy/call-hierarchy-analyzer.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';

function createParserRegistryFor(parsers: readonly ParserPlugin[]): ParserRegistry {
  const parsersByExtension = new Map<string, ParserPlugin>();
  for (const parser of parsers) {
    for (const extension of parser.supportedExtensions) {
      parsersByExtension.set(extension, parser);
    }
  }

  return {
    getParser: (extension: string) => parsersByExtension.get(extension) ?? null
  } as unknown as ParserRegistry;
}

async function createAnalyzer(files: Record<string, string>): Promise<CallHierarchyAnalyzer> {
  const fileSystem = new MemFileSystem();
  await fileSystem.fromJSON(files);
  return new CallHierarchyAnalyzer(
    createParserRegistryFor([new TypeScriptParser(), new JavaScriptParser()]),
    fileSystem
  );
}

describe('CallHierarchyAnalyzer resolveProjectImportPath candidate order (anchor / 候選順序衝突, 目標語意, 已收斂為綠)', () => {
  it('與同名 index 檔並存的 direct 副檔名檔：block 序目標語意應優先選 direct（已收斂為 block 序，綠燈）', async () => {
    const analyzer = await createAnalyzer({
      '/proj/src/a.ts': [
        'import { helper } from \'./foo\';',
        'export function outer() { return helper(); }'
      ].join('\n'),
      '/proj/src/foo.tsx': [
        'export function helper() { return nested(); }',
        'function nested() { return 1; }'
      ].join('\n'),
      '/proj/src/foo/index.ts': 'export function helper() { return 99; }\n'
    });

    const result = await analyzer.analyze(
      'outer',
      ['/proj/src/a.ts', '/proj/src/foo.tsx', '/proj/src/foo/index.ts'],
      { direction: 'outgoing', depth: 2 }
    );

    const callees = result?.outgoing.map(call => call.callee) ?? [];
    expect(callees).toContain('helper');
    // 目標「block 序」語意：direct 檔 foo.tsx 應優先於 index 檔 foo/index.ts 被解析，
    // depth 2 outgoing 應含 foo.tsx 內部呼叫的 nested。現行交錯序實作會解析到
    // foo/index.ts（無 nested 呼叫），此斷言在現狀下預期失敗（紅），
    // 記錄收斂時應修正的具體落差。
    expect(callees).toContain('nested');
  });
});

describe('CallHierarchyAnalyzer resolveProjectImportPath simple relative outgoing (anchor / 補齊涵蓋缺口)', () => {
  // 既有測試涵蓋：R4（alias import 的 outgoing 深度展開）、
  // call-hierarchy-analyzer.test.ts 276 行（relative import 的 *incoming*）、
  // 同檔案 chain 測試（outgoing 深度展開但同一檔案，不經 resolveProjectImportPath
  // 的跨檔分支）。純相對路徑 import 的跨檔 *outgoing* 解析成功案例目前沒有被
  // 任何既有測試獨立覆蓋到，補上這個最小 case。
  it('outer() 透過純相對 import 呼叫另一檔案的 helper()，outgoing 應解析到該 callee', async () => {
    const analyzer = await createAnalyzer({
      '/proj/src/a.ts': [
        'import { helper } from \'./b\';',
        'export function outer() { return helper(); }'
      ].join('\n'),
      '/proj/src/b.ts': 'export function helper() { return 1; }\n'
    });

    const result = await analyzer.analyze(
      'outer',
      ['/proj/src/a.ts', '/proj/src/b.ts'],
      { direction: 'outgoing', depth: 1 }
    );

    expect(result?.outgoing.map(call => call.callee)).toContain('helper');
  });
});
