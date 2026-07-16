/**
 * F24 P3 — LS getCurrentDirectory / DocumentRegistry 未綁 project root（reproduction，先紅後綠）
 *
 * LanguageServiceManager host 的 getCurrentDirectory 固定 process.cwd()。
 * 當 CLI --path 指向非 cwd 的專案根時，相對 module resolution / DocumentRegistry
 * 基準會錯位。正確：應為 project root（初始化來源檔所在專案根或可注入值）。
 *
 * 若產品未提供注入縫，本測試以 host.getCurrentDirectory() 對「非 cwd 專案」的
 * 預期行為釘死；目前回 process.cwd() 會紅。
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as ts from 'typescript';
import { createLanguageServiceManager } from '@plugins/typescript/language-service.js';

describe('F24：LanguageService getCurrentDirectory 應為 project root', () => {
  it('ensureInitialized 後 getCurrentDirectory 應反映專案根，而非 process.cwd()', () => {
    const projectRoot = '/other-project-root-f24';
    const fileName = path.posix.join(projectRoot, 'src', 'example.ts');
    const sourceFile = ts.createSourceFile(
      fileName,
      "export const value = 1;\n",
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const manager = createLanguageServiceManager({
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext
    });
    manager.ensureInitialized(sourceFile);

    const host = manager.languageServiceHost;
    expect(host).not.toBeNull();

    const currentDir = host!.getCurrentDirectory();
    // Bug：目前固定 process.cwd()，與來源檔所在 project root 無關
    // 正確：至少應為 project root（或可配置注入後的專案根），不得在
    // 來源位於 /other-project-root-f24 時仍回 unrelated cwd
    expect(currentDir === projectRoot || currentDir.startsWith(projectRoot)).toBe(true);
    expect(currentDir).not.toBe(process.cwd());
  });
});
