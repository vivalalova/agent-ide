/**
 * [D3] ParserWorkerPool.parseFiles 逐檔隔離 regression test
 * 拆分自 worker-pool.e2e.test.ts（同目錄新增，避免單檔過長）
 *
 * 背景：parseFiles 對批次中每個 task 各自 try/catch pool.run()，
 * worker 級失敗（crash、parser module 載入失敗等）應降級為該檔的 parse error，
 * 不得讓單一檔失敗拖累整批 reject；但 pool 已 dispose 時的 reject 是例外，
 * 必須原樣往上拋，不可被誤降級成逐檔 parse error（見 parser-pool.ts parseFiles 內的
 * `if (this.disposed) { throw error; }` 分支）。
 *
 * 注意：此測試使用真實的 fixture 檔案，因為 Worker 執行緒無法存取 memfs
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createParserWorkerPool, type ParseTask } from '@infrastructure/worker-pool/index.js';

const FIXTURES_ROOT = path.resolve(__dirname, '../../fixtures');
const SAMPLE_PROJECT = path.join(FIXTURES_ROOT, 'sample-project');
const TOY_PROJECT = path.join(FIXTURES_ROOT, 'toy-project');
const TOY_PARSER_MODULE = path.join(FIXTURES_ROOT, 'toy-parser.mjs');
const INVALID_PARSER_MODULE = path.join(FIXTURES_ROOT, 'invalid-parser.mjs');

describe('[D3] ParserWorkerPool.parseFiles 逐檔隔離', () => {
  it('批次中單一檔 parser module 載入失敗時，其餘檔仍正常解析、失敗檔帶 errors，parseFiles 不整批 reject', async () => {
    const tempPool = createParserWorkerPool({ maxThreads: 2, minThreads: 1 });
    const toyFilePath = path.join(TOY_PROJECT, 'main.toy');
    const toyContent = fs.readFileSync(toyFilePath, 'utf-8');
    const tsFilePath = path.join(SAMPLE_PROJECT, 'src/index.ts');
    const tsContent = fs.readFileSync(tsFilePath, 'utf-8');

    const goodToyTask: ParseTask = {
      filePath: toyFilePath,
      content: toyContent,
      parserModulePaths: [TOY_PARSER_MODULE]
    };
    const brokenParserModuleTask: ParseTask = {
      filePath: toyFilePath,
      content: toyContent,
      parserModulePaths: [INVALID_PARSER_MODULE]
    };
    const builtinTsTask: ParseTask = {
      filePath: tsFilePath,
      content: tsContent
    };

    try {
      // parseFiles 整批不得 reject——批次中一檔的 parser module 載入失敗只能反映在該檔的 errors 上
      const results = await tempPool.parseFiles([goodToyTask, brokenParserModuleTask, builtinTsTask]);

      expect(results).toHaveLength(3);

      const [goodResult, brokenResult, builtinResult] = results;

      // 失敗檔：帶 errors，指名 parser module 問題，而非整批被拖垮
      expect(brokenResult.filePath).toBe(toyFilePath);
      expect(brokenResult.errors.length).toBeGreaterThan(0);
      expect(brokenResult.errors.join('\n')).toContain('valid ParserPlugin');

      // 其餘檔仍正常解析，不受同批失敗檔影響
      expect(goodResult.filePath).toBe(toyFilePath);
      expect(goodResult.errors).toHaveLength(0);
      expect(goodResult.symbols.map(symbol => symbol.name)).toContain('WorkerAlpha');

      expect(builtinResult.filePath).toBe(tsFilePath);
      expect(builtinResult.errors).toHaveLength(0);
    } finally {
      await tempPool.destroy();
    }
  });

  it('pool 已 dispose 時 parseFiles 仍 reject，不可被降級成逐檔 parse error', async () => {
    const tempPool = createParserWorkerPool({ maxThreads: 1, minThreads: 1 });
    const filePath = path.join(SAMPLE_PROJECT, 'src/index.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    // maxThreads/minThreads 都設 1：多筆任務排隊等待同一顆 worker，
    // 確保 destroy() 觸發時仍有任務尚未執行完畢，落在 in-flight reject 路徑上
    const tasks: ParseTask[] = Array.from({ length: 20 }, () => ({ filePath, content }));

    const parsePromise = tempPool.parseFiles(tasks);
    // 不 await：讓 destroy 與尚在執行中的 parseFiles 競速，觸發 pool 級 reject
    const destroyPromise = tempPool.destroy();

    // 必須是整批 reject（原樣拋出），不得被降級成 resolve 一份「全部帶 parse error」的結果陣列
    await expect(parsePromise).rejects.toBeTruthy();

    await destroyPromise;
  });
});
