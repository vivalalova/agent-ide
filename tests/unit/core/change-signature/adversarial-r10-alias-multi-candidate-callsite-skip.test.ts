/**
 * R10（缺陷）：change-signature-engine 建構 `new PathUtils(new ImportResolver(...))`
 * 時未傳入手上已有的 fileSystem（change-signature-engine.ts 約 95-99 行），
 * `importSpecifierResolvesToTarget`（約 1778-1785 行）因而一律呼叫同步版
 * `pathUtils.resolveImportPath` → `ImportResolver.resolvePathAlias`（import-resolver.ts
 * 約 500-510 行）。該同步版對多候選 alias 一律回傳 `match?.candidates.at(-1)`
 * （宣告順序「最後一個」候選），完全無視檔案系統實際存在性。
 *
 * tsconfig `"@lib/*": ["src/lib/*", "legacy/*"]` 這種一個 alias 對應多個候選
 * base path 的合法宣告下，真實檔案在第一候選 `src/lib/target.ts`，最後一候選
 * `legacy/target.ts` 早已不存在。消費端 `import { doThing } from '@lib/target'`
 * 解析出的絕對路徑會是不存在的 `legacy/target.ts`，與目標定義檔
 * `pathsMatch` 比對失敗，導致 `resolveTargetBindings` 判定該消費端「未繫結」
 * 目標函式──即使它確實 import 了目標。
 *
 * 業務後果：change-signature 對 `doThing` 做 reorder-parameters 時，會完全跳過
 * 掃描這個消費端檔案的呼叫點，回傳 success:true 但呼叫端引數順序未被重寫，
 * 產生「定義已改、呼叫端沒跟著改」的靜默壞碼（呼叫端會用舊順序呼叫新簽章）。
 *
 * 正確契約（期望行為）：resolveTargetBindings 應該解析到實際存在的候選
 * `src/lib/target.ts`，判定消費端有繫結目標，callSiteUpdates 應包含
 * 該消費端檔案的呼叫點重寫。
 */
import { describe, expect, it } from 'vitest';
import { ChangeSignatureEngine } from '@core/change-signature/change-signature-engine.js';
import { SignatureChangeType, type ChangeSignatureOptions } from '@core/change-signature/types.js';
import { createStructuredPathAliasMap } from '@shared/path-alias-resolver.js';
import type { ImportDeclaration } from '@infrastructure/parser/interface.js';
import { createMockFileSystem, createMockParser, createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('ChangeSignatureEngine alias 多候選存在性（adversarial R10）', () => {
  it('reorder-parameters 應改寫透過多候選 alias import 目標的消費端呼叫點', async () => {
    const targetPath = '/project/src/lib/target.ts';
    const consumerPath = '/project/src/app/consumer.ts';

    // 對應 tsconfig `"@lib/*": ["src/lib/*", "legacy/*"]`：真實檔案只在第一候選
    // src/lib 底下，legacy 是早已不存在的舊候選。
    const pathAliases = createStructuredPathAliasMap([
      { alias: '@lib', wildcard: true, candidates: ['/project/src/lib', '/project/legacy'] }
    ]);

    const fileSystem = createMockFileSystem({
      [targetPath]: 'export function doThing(a: string, b: string): void {}\n',
      [consumerPath]: 'import { doThing } from \'@lib/target\';\n\ndoThing(\'x\', \'y\');\n'
    });

    // production 的 resolveTargetBindings 依賴 parser.getImportDeclarations 取得 consumer.ts
    // 的 import 結構；預設 createMockParser() 未提供此方法會被直接 continue 跳過，
    // 因此這裡局部補上一個回傳 consumer.ts 對應宣告的假實作。
    const consumerImportDeclaration: ImportDeclaration = {
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 40 } },
      moduleSpecifier: '@lib/target',
      isTypeOnly: false,
      namedImports: [{ name: 'doThing', isTypeOnly: false }],
      rawStatement: 'import { doThing } from \'@lib/target\';'
    };
    const parser = createMockParser({
      getImportDeclarations: () => [consumerImportDeclaration]
    });

    const engine = new ChangeSignatureEngine(
      createMockParserRegistry(parser),
      fileSystem,
      { pathAliases }
    );

    const options: ChangeSignatureOptions = {
      filePath: targetPath,
      functionName: 'doThing',
      projectRoot: '/project',
      targetFiles: [targetPath, consumerPath],
      changes: [{
        type: SignatureChangeType.ReorderParameters,
        newOrder: ['b', 'a']
      }]
    };

    const result = await engine.changeSignature(options);

    expect(result.success).toBe(true);
    // 現行為（缺陷）：consumer.ts 的 import 被同步 alias 解析誤判到不存在的
    // legacy/target.ts，pathsMatch 失敗 → 消費端未被視為繫結目標 → 呼叫點
    // 完全沒被掃描到，callSiteUpdates 不含 consumer.ts。
    const consumerUpdate = result.callSiteUpdates.find(update => update.filePath === consumerPath);
    expect(consumerUpdate).toBeDefined();
    expect(consumerUpdate?.newCode).toBe('doThing(\'y\', \'x\')');
  });
});
