/**
 * CLI move 命令 E2E 測試 - Glob 移動時內部引用保持不變
 *
 * 當使用 glob 模式移動多個檔案時，如果這些檔案之間有相對引用，
 * 這些內部引用應該保持不變，因為檔案之間的相對位置沒有改變。
 *
 * Bug 重現：
 * - src/utils/index.ts 和 src/utils/index.spec.ts
 * - index.spec.ts 引用 './index'
 * - 用 glob 'src/utils/*.ts' 移動到 'src/shared/utils/'
 * - 預期：引用保持 './index'
 * - 實際：引用被錯誤更新為 '../../utils/index'
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - Glob 移動內部引用保持不變', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('同目錄檔案互相引用', () => {
    it('index.spec.ts 引用 ./index 應保持不變', async () => {
      // Given: index.ts 和 index.spec.ts，spec 引用 index
      await fixture.writeFile('src/utils/index.ts', `
export function helper() {
  return 'helper';
}
`);
      await fixture.writeFile('src/utils/index.spec.ts', `
import { helper } from './index';

describe('helper', () => {
  it('should work', () => {
    expect(helper()).toBe('helper');
  });
});
`);

      // When: 用 glob 移動到新位置
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/shared/utils/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      if (result.exitCode !== 0) {
        console.log('STDOUT:', result.stdout);
        console.log('STDERR:', result.stderr);
      }
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 核心驗證：./index 引用應該保持不變
      const specContent = await fixture.readFile('src/shared/utils/index.spec.ts');
      expect(specContent).toContain("from './index'");
      // 不應該被錯誤更新
      expect(specContent).not.toContain('../../utils/index');
      expect(specContent).not.toContain('../utils/index');
    });

    it('多個同目錄檔案互相引用都應保持不變', async () => {
      // Given: 三個檔案互相引用
      await fixture.writeFile('src/utils/a.ts', `
export const a = 'a';
`);
      await fixture.writeFile('src/utils/b.ts', `
import { a } from './a';
export const b = a + 'b';
`);
      await fixture.writeFile('src/utils/c.ts', `
import { a } from './a';
import { b } from './b';
export const c = a + b + 'c';
`);

      // When: 用 glob 移動
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/lib/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // 驗證內部引用保持不變
      const bContent = await fixture.readFile('src/lib/b.ts');
      expect(bContent).toContain("from './a'");
      expect(bContent).not.toContain('../utils/a');

      const cContent = await fixture.readFile('src/lib/c.ts');
      expect(cContent).toContain("from './a'");
      expect(cContent).toContain("from './b'");
      expect(cContent).not.toContain('../utils/');
    });

    it('外部檔案的引用應該被正確更新', async () => {
      // Given: 外部檔案引用被移動的檔案
      await fixture.writeFile('src/utils/helper.ts', `
export function helper() { return 'helper'; }
`);
      await fixture.writeFile('src/utils/helper.spec.ts', `
import { helper } from './helper';
export const test = helper;
`);
      await fixture.writeFile('src/app.ts', `
import { helper } from './utils/helper';
console.log(helper());
`);

      // When: glob 移動
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/shared/utils/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // 內部引用保持不變
      const specContent = await fixture.readFile('src/shared/utils/helper.spec.ts');
      expect(specContent).toContain("from './helper'");

      // 外部引用被更新
      const appContent = await fixture.readFile('src/app.ts');
      expect(appContent).toContain('./shared/utils/helper');
      expect(appContent).not.toContain('./utils/helper');
    });
  });

  describe('遞迴 glob 內部引用', () => {
    it('巢狀目錄中的相對引用應保持不變', async () => {
      // Given: 巢狀目錄結構，有相對引用
      await fixture.writeFile('src/feature/core/base.ts', `
export class Base {}
`);
      await fixture.writeFile('src/feature/core/impl.ts', `
import { Base } from './base';
export class Impl extends Base {}
`);
      await fixture.writeFile('src/feature/services/service.ts', `
import { Impl } from '../core/impl';
export class Service {
  private impl = new Impl();
}
`);

      // When: 遞迴 glob 移動
      const result = await executeCLI(
        [
          'move',
          'src/feature/**/*.ts',
          'src/modules/feature/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // 同目錄引用保持不變
      const implContent = await fixture.readFile('src/modules/feature/core/impl.ts');
      expect(implContent).toContain("from './base'");

      // 跨目錄相對引用保持不變
      const serviceContent = await fixture.readFile('src/modules/feature/services/service.ts');
      expect(serviceContent).toContain("from '../core/impl'");
    });
  });

  describe('混合情境：部分檔案互相引用', () => {
    it('只有部分被移動檔案互相引用時也應正確處理', async () => {
      // Given: 一些檔案互相引用，一些不引用
      await fixture.writeFile('src/utils/standalone.ts', `
export const standalone = 'standalone';
`);
      await fixture.writeFile('src/utils/dependent.ts', `
import { standalone } from './standalone';
export const dependent = standalone + '-dependent';
`);
      await fixture.writeFile('src/utils/unrelated.ts', `
export const unrelated = 'unrelated';
`);

      // When
      const result = await executeCLI(
        [
          'move',
          'src/utils/*.ts',
          'src/lib/',
          '--path', fixture.rootPath,
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // dependent 對 standalone 的引用應保持不變
      const dependentContent = await fixture.readFile('src/lib/dependent.ts');
      expect(dependentContent).toContain("from './standalone'");
      expect(dependentContent).not.toContain('../utils/');
    });
  });
});
