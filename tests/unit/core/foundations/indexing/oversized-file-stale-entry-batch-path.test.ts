import { describe, expect, it } from 'vitest';
import type { ParserWorkerPool, ParseResult } from '@infrastructure/worker-pool/index.js';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { FileIndex } from '@core/foundations/indexing/file-index.js';
import { SymbolIndex } from '@core/foundations/indexing/symbol-index.js';
import { IndexBatchParser } from '@core/foundations/indexing/index-batch-parser.js';
import { createIndexConfig, createFileInfo } from '@core/foundations/indexing/index.js';
import { SymbolType, createLocation, createRange, createPosition, createSymbol } from '@shared/types/index.js';

describe('IndexBatchParser（worker pool 批次路徑）超過 maxFileSize 跳過索引時的舊條目清理', () => {
  it('批次路徑中檔案先前已索引，長大超過 maxFileSize 後重新批次索引，必須清除舊符號', async () => {
    const filePath = '/project/src/stale.toy';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: `x${'y'.repeat(200)}`
    });

    const config = createIndexConfig('/project', { enablePersistence: false, maxFileSize: 64 });
    const fileIndex = new FileIndex(config);
    const symbolIndex = new SymbolIndex();

    // 模擬先前已索引過的舊條目（此時檔案還小，尚未超過 maxFileSize）
    const staleFileInfo = createFileInfo(filePath, new Date('2020-01-01'), 10, '.toy', 'toy', 'old-checksum');
    await fileIndex.addFile(staleFileInfo);
    const staleSymbol = createSymbol(
      'StaleSymbol',
      SymbolType.Variable,
      createLocation(filePath, createRange(createPosition(1, 1), createPosition(1, 5)))
    );
    await fileIndex.setFileSymbols(filePath, [staleSymbol]);
    await symbolIndex.addSymbols([staleSymbol], staleFileInfo);

    expect(await symbolIndex.findSymbol('StaleSymbol')).toHaveLength(1);

    // fake worker pool：因為檔案超過 maxFileSize，prepareParseTasks 不會把它放進任務清單，
    // parseFiles 收到的 tasks 必為空陣列
    const fakePool = {
      parseFiles: async (tasks: unknown[]): Promise<ParseResult[]> => {
        expect(tasks).toHaveLength(0);
        return [];
      }
    } as unknown as ParserWorkerPool;

    const batchParser = new IndexBatchParser(
      fileSystem,
      ParserRegistry.getInstance(),
      fakePool,
      fileIndex,
      symbolIndex,
      async () => {
        throw new Error('single-thread 路徑不應該被呼叫（本測試強制走 worker pool 路徑）');
      }
    );

    await batchParser.batchIndexFiles([filePath], config, {
      concurrency: 1,
      batchSize: 10,
      progressCallback: () => {}
    });

    // 檔案現在超過 maxFileSize 被跳過，舊條目（含 stale 符號）必須被清除，不得殘留
    expect(fileIndex.hasFile(filePath)).toBe(false);
    expect(await symbolIndex.findSymbol('StaleSymbol')).toHaveLength(0);
  });
});
