/**
 * project-import-resolver 單元測試：候選組裝的 block 序、alias/baseUrl/相對/絕對分支、
 * 空輸入。四個消費端（call-hierarchy、impact、cli/module-file-resolver、move）的收斂
 * 回歸基準由各自的 anchor 測試釘住；本檔只驗證新模組自身的組裝邏輯。
 */
import { describe, expect, it } from 'vitest';
import {
  matchProjectFileFromCandidates,
  resolveExistingProjectFile,
  resolveProjectImportCandidates
} from '@core/foundations/project-import-resolver.js';
import { createPathAliasMap } from '@shared/path-alias-resolver.js';

describe('resolveProjectImportCandidates', () => {
  it('絕對路徑 specifier：以自身為 base path 展開 block 序候選（direct 全部在前、index 全部在後）', () => {
    const candidates = resolveProjectImportCandidates('/proj/src/foo', '/proj/src/a.ts', {});

    const directIndex = candidates.indexOf('/proj/src/foo.ts');
    const indexIndex = candidates.indexOf('/proj/src/foo/index.ts');
    expect(directIndex).toBeGreaterThanOrEqual(0);
    expect(indexIndex).toBeGreaterThanOrEqual(0);
    expect(directIndex).toBeLessThan(indexIndex);
    // 全部 direct 副檔名須排在「任何」index 副檔名之前，非逐副檔名交錯
    const lastDirectIndex = Math.max(
      ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
        .map(ext => candidates.indexOf(`/proj/src/foo${ext}`))
    );
    const firstIndexCandidateIndex = Math.min(
      ...['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
        .map(ext => candidates.indexOf(`/proj/src/foo/index${ext}`))
    );
    expect(lastDirectIndex).toBeLessThan(firstIndexCandidateIndex);
  });

  it('相對路徑 specifier：以 fromFile 目錄為基準解析，不嘗試 alias/baseUrl', () => {
    const candidates = resolveProjectImportCandidates('./foo', '/proj/src/a.ts', {
      pathAliases: createPathAliasMap({ '@lib': '/should/not/be/used' }),
      baseUrl: '/should/not/be/used'
    });

    expect(candidates[0]).toBe('/proj/src/foo');
    expect(candidates).toContain('/proj/src/foo.ts');
    expect(candidates.some(candidate => candidate.startsWith('/should/not/be/used'))).toBe(false);
  });

  it('bare specifier + alias 命中：alias 候選（含展開）排在 baseUrl 候選之前', () => {
    const candidates = resolveProjectImportCandidates('@lib/util', '/proj/src/a.ts', {
      pathAliases: createPathAliasMap({ '@lib': '/proj/src/lib' }, new Set(['@lib'])),
      baseUrl: '/proj/base'
    });

    const aliasDirectIndex = candidates.indexOf('/proj/src/lib/util.ts');
    const baseUrlBaseIndex = candidates.indexOf('/proj/base/@lib/util');
    expect(aliasDirectIndex).toBeGreaterThanOrEqual(0);
    // baseUrl 分支對 bare specifier 是把整個 specifier 接在 baseUrl 後面
    expect(baseUrlBaseIndex).toBeGreaterThanOrEqual(0);
    expect(aliasDirectIndex).toBeLessThan(baseUrlBaseIndex);
  });

  it('bare specifier 無 alias 命中但有 baseUrl：回退到 baseUrl 候選', () => {
    const candidates = resolveProjectImportCandidates('src/lib/thing', '/proj/anywhere/from.ts', {
      baseUrl: '/proj'
    });

    expect(candidates[0]).toBe('/proj/src/lib/thing');
    expect(candidates).toContain('/proj/src/lib/thing.ts');
  });

  it('bare specifier 無 alias 命中、無 baseUrl：回傳空陣列', () => {
    const candidates = resolveProjectImportCandidates('lodash', '/proj/src/a.ts', {});

    expect(candidates).toEqual([]);
  });

  it('候選去重：basePath 與 normalizedBasePath 相同時不重複出現', () => {
    const candidates = resolveProjectImportCandidates('./foo', '/proj/src/a.ts', {});

    const occurrences = candidates.filter(candidate => candidate === '/proj/src/foo').length;
    expect(occurrences).toBe(1);
  });
});

describe('resolveExistingProjectFile', () => {
  it('回傳第一個探測為存在的候選，依候選順序（block 序）短路', async () => {
    const candidates = ['/proj/src/foo', '/proj/src/foo.ts', '/proj/src/foo/index.ts'];
    const existing = new Set(['/proj/src/foo.ts', '/proj/src/foo/index.ts']);

    const resolved = await resolveExistingProjectFile(candidates, async candidate => existing.has(candidate));

    expect(resolved).toBe('/proj/src/foo.ts');
  });

  it('alias 命中僅 index 變體存在、baseUrl 直接候選也存在：alias 家族（含 index 變體）整族優先於 baseUrl，命中 alias 的 index 變體', async () => {
    const candidates = resolveProjectImportCandidates('@lib/util', '/proj/src/a.ts', {
      pathAliases: createPathAliasMap({ '@lib': '/proj/src/lib' }, new Set(['@lib'])),
      baseUrl: '/proj/base'
    });

    // alias 的 direct 候選（util.ts）不存在，只有 alias 的 index 變體存在；
    // baseUrl 的 direct 候選則存在——若組裝順序退化成「逐候選跨家族交錯」或
    // 「baseUrl 提前於 alias index」，這裡會誤命中 baseUrl 而非 alias index
    const existing = new Set(['/proj/src/lib/util/index.ts', '/proj/base/@lib/util.ts']);

    const resolved = await resolveExistingProjectFile(candidates, async candidate => existing.has(candidate));

    expect(resolved).toBe('/proj/src/lib/util/index.ts');
  });

  it('全部候選皆不存在時回傳 null', async () => {
    const resolved = await resolveExistingProjectFile(
      ['/proj/src/missing.ts'],
      async () => false
    );

    expect(resolved).toBeNull();
  });

  it('空候選陣列回傳 null，不呼叫 exists', async () => {
    let called = false;
    const resolved = await resolveExistingProjectFile([], async () => {
      called = true;
      return true;
    });

    expect(resolved).toBeNull();
    expect(called).toBe(false);
  });
});

describe('matchProjectFileFromCandidates', () => {
  it('白名單命中：回傳專案檔案清單中對應的原始路徑', () => {
    const projectFiles = ['/proj/src/foo.tsx', '/proj/src/foo/index.ts'];

    const matched = matchProjectFileFromCandidates(
      ['/proj/src/foo', '/proj/src/foo.ts', '/proj/src/foo.tsx', '/proj/src/foo/index.ts'],
      projectFiles
    );

    // direct 候選（foo.tsx）排在 index 候選（foo/index.ts）之前，命中 direct
    expect(matched).toBe('/proj/src/foo.tsx');
  });

  it('無候選命中白名單時回傳 null', () => {
    const matched = matchProjectFileFromCandidates(['/proj/src/missing.ts'], ['/proj/src/other.ts']);

    expect(matched).toBeNull();
  });

  it('空候選陣列回傳 null', () => {
    const matched = matchProjectFileFromCandidates([], ['/proj/src/foo.ts']);

    expect(matched).toBeNull();
  });
});
