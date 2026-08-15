/**
 * CLI 查詢類命令：索引失敗時的 JSON 輸出契約（G3）
 *
 * find-references / call-hierarchy / deadcode / search 四個命令的
 * `createAndIndexWithCache` 呼叫都寫在 try 區塊「之外」（對照
 * cycles.command.ts 把索引階段包在 try 內、catch 時呼叫
 * `outputHandler.outputError` 印出 `{"success":false,"error":...}` 並設
 * `process.exitCode = 1`），索引失敗時例外會直接穿出 action handler，
 * 繞過命令自己的 JSON 錯誤輸出契約。
 *
 * 這裡以 fileSystem.glob 拋錯（模擬索引期間掃描檔案失敗，如磁碟 I/O
 * 錯誤或權限問題）觸發 IndexEngine.indexDirectory 內未被 try/catch
 * 包住的 glob 呼叫，驗證上述四個命令在此故障下仍應有結構化 JSON 錯誤
 * 輸出、且例外不得未捕捉穿出到 executeCLI 的頂層兜底。
 */

import { describe, it, expect } from 'vitest';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type { GlobOptions } from '@infrastructure/storage/types.js';
import { executeCLI } from '../../../helpers/index.js';

/**
 * 索引期間掃描檔案一律拋錯的 MemFileSystem
 * 模擬 indexProject → indexDirectory 呼叫 fileSystem.glob 時失敗
 * （如磁碟 I/O 錯誤、權限問題），藉此重現索引階段例外。
 */
class GlobFailingFileSystem extends MemFileSystem {
  async glob(_pattern: string, _options?: GlobOptions): Promise<string[]> {
    throw new Error('EACCES: injected glob failure during indexing');
  }
}

async function createFailingProject(): Promise<GlobFailingFileSystem> {
  const fileSystem = new GlobFailingFileSystem();
  await fileSystem.fromJSON({
    '/project/package.json': '{}',
    '/project/src/index.ts': 'export function target() { return 1; }\ntarget();'
  });
  return fileSystem;
}

describe('CLI 查詢命令 - 索引失敗時的 JSON 錯誤輸出契約（G3）', () => {
  it.each([
    { name: 'find-references', args: ['find-references', 'target', '--path', '/project', '--format', 'json'] },
    { name: 'call-hierarchy', args: ['call-hierarchy', 'target', '--path', '/project', '--format', 'json'] },
    { name: 'deadcode', args: ['deadcode', '--path', '/project', '--format', 'json'] },
    { name: 'search', args: ['search', 'target', '--path', '/project', '--format', 'json'] }
  ])('$name 命令索引失敗時 --format json 應回傳結構化錯誤且 exitCode 為 1（不得未捕捉穿出）', async ({ args }) => {
    const fileSystem = await createFailingProject();

    const result = await executeCLI(args, { memfs: fileSystem });

    // 目前索引階段的例外會繞過命令自己的 JSON 錯誤輸出契約，
    // stdout 收不到 `{"success":false,...}`（例外未捕捉穿出，改由
    // executeCLI 自身的頂層 catch 兜底，錯誤訊息只會出現在 stderr）。
    let output: unknown;
    expect(() => { output = JSON.parse(result.stdout); }).not.toThrow();
    expect((output as { success?: boolean } | undefined)?.success).toBe(false);
    expect(typeof (output as { error?: unknown } | undefined)?.error).toBe('string');
    expect(result.exitCode).toBe(1);
  });
});
