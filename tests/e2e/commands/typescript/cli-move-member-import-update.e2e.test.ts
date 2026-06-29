/**
 * CLI move-member 引用更新 E2E 測試
 *
 * 對抗式掃描發現:成員移動時，凡是透過 tsconfig 別名、或混合 import
 * (default + named) 引用該成員的 consumer，其 import 不會被更新，移動後
 * 留下指向舊檔的壞 import。本檔以「移動後 consumer 不得再從舊來源 import
 * 被移動成員」為核心不變式，作為永久回歸覆蓋。
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
});
