/**
 * CLI move-member 引用更新 E2E 測試
 *
 * 對抗式掃描發現:成員移動時，凡是透過 tsconfig 別名、或混合 import
 * (default + named) 引用該成員的 consumer，其 import 不會被更新，移動後
 * 留下指向舊檔的壞 import。本檔以「移動後 consumer 不得再從舊來源 import
 * 被移動成員」為核心不變式，作為永久回歸覆蓋。
 *
 * 缺陷12（第二輪對抗掃描）：consumer 對目標檔既有的 import/export 語句做
 * 「併入」時，未分辨語句種類（value import / export-from / type-only
 * import），把被移動成員的值綁定併入了語意不同的既有語句，導致綁定消失：
 *   - 併入 `export { x } from './target'`（export-from）：本地值綁定消失
 *   - 併入 `import type { X } from './target'`（type-only）：runtime 值綁定消失
 *
 * 缺陷13（P1）：consumer 檔案第一行是無 from 的完整 export 語句
 * （`export { x };`），第二行才是待改寫的 import；改寫器誤將兩者視為
 * 可融合的同型語句，融合後 `export { x };` 整行消失，該本地符號的
 * export 也隨之消失。
 *
 * 缺陷14（P2）：consumer 併入目標檔既有的 `import def, { a } from './target'`
 * （default + named 混合）語句時，重建語句只保留 named specifiers，
 * default import 前綴（如 `dfpDef`）在重建過程中被丟棄。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member - consumer import 更新', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  async function writeMemberFixtures(): Promise<void> {
    await fixture.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'node',
        baseUrl: '.',
        paths: { '@app/*': ['src/*'] }
      },
      include: ['src/**/*']
    }, null, 2));

    await fixture.writeFile('src/source.ts', `export function moved(): number {
  return 42;
}

export function kept(): number {
  return 1;
}
`);
    await fixture.writeFile('src/dest.ts', `export function existing(): void {}
`);
  }

  it('別名 import 的 consumer 應在成員移動後更新引用 (P-C)', async () => {
    await writeMemberFixtures();
    await fixture.writeFile('src/consumer-alias.ts', `import { moved } from '@app/source';

export function useAlias(): number {
  return moved();
}
`);

    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/dest.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-alias.ts'), 'utf-8') as string;
    // 移動後不得再從 source import moved（否則編譯壞）
    expect(consumer).not.toContain('from \'@app/source\'');
    // moved 的 import 應指向 dest
    expect(consumer).toMatch(/import \{ moved \} from ['"][^'"]*dest['"]/);
  });

  it('混合 import (default + named) 的 consumer 應更新被移動的 named 成員 (P-D)', async () => {
    await writeMemberFixtures();
    await fixture.writeFile('src/consumer-mixed.ts', `import defaultThing, { moved } from './source';

export function useMixed(): number {
  return moved() + (defaultThing as unknown as number);
}
`);

    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/dest.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-mixed.ts'), 'utf-8') as string;
    // moved 應改從 dest import
    expect(consumer).toMatch(/import \{ moved \} from ['"][^'"]*dest['"]/);
    // default import 仍保留（指向 source）
    expect(consumer).toContain('defaultThing');
    // 不得再從 source 取得 named moved
    expect(consumer).not.toMatch(/import\s+defaultThing\s*,\s*\{\s*moved\s*\}\s*from\s*['"][^'"]*source['"]/);
  });

  it('成員移動到 consumer 已 import 的目標檔時不得產生重複 import (P-E)', async () => {
    await writeMemberFixtures();
    // consumer 同時從 source 取 moved、從 dest 取 existing
    await fixture.writeFile('src/consumer-dup.ts', `import { moved } from './source';
import { existing } from './dest';

export function useDup(): number {
  existing();
  return moved();
}
`);

    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/dest.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/consumer-dup.ts'), 'utf-8') as string;
    // moved 應併入既有的 dest import，而非新增第二條 from './dest'
    const destImportLines = consumer.split('\n').filter(l => /from ['"][^'"]*dest['"]/.test(l));
    expect(destImportLines.length).toBe(1);
    expect(destImportLines[0]).toContain('moved');
    expect(destImportLines[0]).toContain('existing');
  });

  describe('缺陷12: 併入目標語句不分種類', () => {
    it('consumer 的值 import 不得被併入目標檔的 export-from 語句 (export { x } from)', async () => {
      await fixture.writeFile('src/mvk-source.ts', `export function mvkMoved(): number {
  return 1;
}
`);
      await fixture.writeFile('src/mvk-target.ts', `export const mvkKept = 2;
`);
      await fixture.writeFile('src/mvk-consumer.ts', `import { mvkMoved } from './mvk-source';
export { mvkKept } from './mvk-target';
export const use = mvkMoved();
`);

      // mvkMoved 在 mvk-source.ts 第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/mvk-source.ts')}:1`, fixture.getFilePath('src/mvk-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result.exitCode).toBe(0);

      const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/mvk-consumer.ts'), 'utf-8') as string;

      // 正確行為：mvkMoved 應以獨立的值 import 綁定指向 mvk-target，
      // 讓 mvkMoved() 呼叫仍有本地綁定可用
      expect(consumer).toMatch(/import \{ mvkMoved \} from ['"][^'"]*mvk-target['"]/);

      // Bug：目前的壞行為是 mvkMoved 被併入既有的
      // `export { mvkKept } from './mvk-target'`（export-from 語句），
      // 該語句不引入本地綁定，mvkMoved() 呼叫因而壞掉
      const exportFromLine = consumer.split('\n').find(l => /^export \{[^}]*\} from ['"][^'"]*mvk-target['"]/.test(l));
      expect(exportFromLine).toBeDefined();
      expect(exportFromLine).not.toContain('mvkMoved');
    });

    it('consumer 的值 import 不得被併入目標檔的 type-only import (import type { X })', async () => {
      await fixture.writeFile('src/mvt-source.ts', `export function mvtMoved(): number {
  return 1;
}
`);
      await fixture.writeFile('src/mvt-target.ts', `export type MvtT = { n: number };
export const mvtBase = 0;
`);
      await fixture.writeFile('src/mvt-consumer.ts', `import { mvtMoved } from './mvt-source';
import type { MvtT } from './mvt-target';
export const t: MvtT = { n: mvtMoved() };
`);

      // mvtMoved 在 mvt-source.ts 第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/mvt-source.ts')}:1`, fixture.getFilePath('src/mvt-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result.exitCode).toBe(0);

      const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/mvt-consumer.ts'), 'utf-8') as string;

      // 正確行為：mvtMoved 應以獨立的值 import 綁定指向 mvt-target，
      // 不得出現在 `import type { ... }` 內
      const typeImportLine = consumer.split('\n').find(l => /^import type \{[^}]*\} from ['"][^'"]*mvt-target['"]/.test(l));
      expect(typeImportLine).toBeDefined();
      expect(typeImportLine).not.toContain('mvtMoved');

      // Bug：目前的壞行為是 mvtMoved 被併入 `import type { MvtT } from './mvt-target'`，
      // type-only import 在編譯後會被整條抹除，mvtMoved 的 runtime 綁定因而消失
      expect(consumer).toMatch(/import \{ mvtMoved \} from ['"][^'"]*mvt-target['"]/);
    });
  });

  describe('缺陷13: from-less 完整 export 語句與 import 語句被誤融合', () => {
    it('consumer 第一行的 `export { x };`（無 from）不得因融合而消失', async () => {
      await fixture.writeFile('src/fus-source.ts', `export function fusMoved(): number { return 1; }
export function fusKeep(): number { return 2; }
`);
      await fixture.writeFile('src/fus-target.ts', `export const fusBase = 0;
`);
      await fixture.writeFile('src/fus-consumer.ts', `export { fusLocal };
import { fusMoved, fusKeep } from './fus-source';
const fusLocal = fusMoved() + fusKeep();
`);

      // fusMoved 在 fus-source.ts 第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/fus-source.ts')}:1`, fixture.getFilePath('src/fus-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result.exitCode).toBe(0);

      const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/fus-consumer.ts'), 'utf-8') as string;

      // 正確行為：無 from 的完整 export 語句必須原樣存在，不得被融合改寫時吃掉
      expect(consumer).toContain('export { fusLocal };');

      // fusKeep 未被移動，仍應是「import」綁定，不得被誤改成 export-from
      const fusKeepLine = consumer.split('\n').find((l) => l.includes('fusKeep') && /from ['"][^'"]*fus-source['"]/.test(l));
      expect(fusKeepLine).toBeDefined();
      expect(fusKeepLine).toMatch(/^import/);
      expect(fusKeepLine).not.toMatch(/^export \{[^}]*fusKeep[^}]*\} from/);

      // fusMoved 應有指向 fus-target 的值 import
      expect(consumer).toMatch(/import \{ fusMoved \} from ['"][^'"]*fus-target['"]/);
    });
  });

  describe('缺陷14: merge 併入 default+named 混合 import 時丟失 default 前綴', () => {
    it('consumer 併入目標檔既有的 default+named import 時，default 前綴不得消失', async () => {
      await fixture.writeFile('src/dfp-source.ts', `export function dfpMoved(): number { return 1; }
`);
      await fixture.writeFile('src/dfp-target.ts', `const dfpDefault = 9;
export default dfpDefault;
export const dfpExisting = 2;
`);
      await fixture.writeFile('src/dfp-consumer.ts', `import { dfpMoved } from './dfp-source';
import dfpDef, { dfpExisting } from './dfp-target';
export const use = dfpMoved() + dfpExisting + dfpDef;
`);

      // dfpMoved 在 dfp-source.ts 第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/dfp-source.ts')}:1`, fixture.getFilePath('src/dfp-target.ts'),
          '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result.exitCode).toBe(0);

      const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/dfp-consumer.ts'), 'utf-8') as string;

      // 正確行為：default 前綴 dfpDef 必須仍存在於某條 import 語句中；
      // 目前的壞行為是 merge 重建成 `import { dfpExisting, dfpMoved } from './dfp-target';`，dfpDef 消失
      expect(consumer).toContain('import dfpDef,');

      // dfpMoved 與 dfpExisting 都必須有本地綁定（無論是否併入同一條語句）
      const targetImportText = consumer
        .split('\n')
        .filter((l) => /from ['"][^'"]*dfp-target['"]/.test(l))
        .join('\n');
      expect(targetImportText).toContain('dfpMoved');
      expect(targetImportText).toContain('dfpExisting');
      expect(targetImportText).toContain('dfpDef');
    });
  });
});
