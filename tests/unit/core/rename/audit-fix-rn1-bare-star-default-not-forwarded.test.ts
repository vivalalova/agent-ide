/**
 * audit-fix RN1 regression（先紅後綠）
 *
 * `target-exposure-resolver` 的 `isNamespaceLocalNameExposed` 對 bare
 * `export * from '<spec>'` 轉發的判斷條件（`forward.exportedName === undefined ||
 * forward.exportedName === localName`）把 bare star 當成「轉發任何 name」，包含
 * 'default'。但 ES 規格明定 `export * from` 從不轉發 default export，`localName ===
 * 'default'` 時 bare star 不該命中。
 *
 * `localName` 會是 'default'：consumer 寫 `import { default as api } from './barrel'`
 * 這種具名 import 語法明確 import default 時，language-service 的
 * `collectVerifiedNamespaceLocalNames` 會把 exportedName='default' 傳進
 * moduleResolver（見 language-service.ts:666-674），流向這裡的 `localName` 參數。
 *
 * 觸發情境：`barrel1.ts` 用 `export * as default from './def.js'`（合法 ES2020 語法，把
 * 整個 namespace 包成 default）；`barrel2.ts` 對 barrel1 做 bare `export * from`——依規格
 * barrel2 並未真的轉發 default（`export *` 從不含 default），`import { default as api }
 * from './barrel2'` 其實是無效匯入，不該被誤判為曝露目標符號。
 *
 * 修法：改用 `@core/foundations/reexport-forwards.ts` 的共用判斷函式
 * `forwardReexportsName`（call-hierarchy CH4 同一份，SSOT），bare star 對 'default'
 * 明確排除。
 */

import { describe, expect, it } from 'vitest';
import { createTargetExposureResolver } from '@core/rename/target-exposure-resolver.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

describe('rename target-exposure-resolver：bare export * 不應誤轉發 default（audit-fix RN1）', () => {
  it('bare export * from 轉發鏈不應把 export * as default from 誤判為曝露 default', async () => {
    const files: Record<string, string> = {
      '/proj/def.ts': 'export function X() {}',
      '/proj/barrel1.ts': 'export * as default from "./def";',
      '/proj/barrel2.ts': 'export * from "./barrel1";',
      '/proj/app.ts': 'import { default as api } from "./barrel2"; api.X();'
    };
    const fileSystem = {
      readFile: async (filePath: string) => files[filePath]
    } as unknown as IFileSystem;

    const resolver = await createTargetExposureResolver({
      fileSystem,
      projectFiles: Object.keys(files),
      definitionFilePath: '/proj/def.ts',
      symbolName: 'X'
    });

    // Bug：bare export * from 依規格不轉發 default，barrel2 實際上並未真的曝露 default，
    // `import { default as api } from './barrel2'` 是無效匯入，不應被誤判為曝露目標符號
    expect(resolver('/proj/app.ts', './barrel2', 'default')).toBe(false);
  });

  it('對照組：export * as ns from（非 default 名）經 bare star 轉發仍應正確判定曝露（既有行為不變）', async () => {
    const files: Record<string, string> = {
      '/proj/def2.ts': 'export function Y() {}',
      '/proj/barrel3.ts': 'export * as ns from "./def2";',
      '/proj/barrel4.ts': 'export * from "./barrel3";',
      '/proj/app2.ts': 'import { ns } from "./barrel4"; ns.Y();'
    };
    const fileSystem = {
      readFile: async (filePath: string) => files[filePath]
    } as unknown as IFileSystem;

    const resolver = await createTargetExposureResolver({
      fileSystem,
      projectFiles: Object.keys(files),
      definitionFilePath: '/proj/def2.ts',
      symbolName: 'Y'
    });

    expect(resolver('/proj/app2.ts', './barrel4', 'ns')).toBe(true);
  });
});
