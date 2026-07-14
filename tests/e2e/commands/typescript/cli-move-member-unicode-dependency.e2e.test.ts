import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeCLI, loadFixture, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move member - Unicode dependency regression', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('搬移依賴 Unicode export 的函式時，目標檔應補上該依賴的 import', async () => {
    await fixture.writeFile('src/unicode-source.ts', `export const 常數 = 42;

export function unicodeMoved(): number {
  return 常數;
}
`);

    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/unicode-source.ts')}:3`, fixture.getFilePath('src/unicode-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const target = await fixture.memfs.readFile(fixture.getFilePath('src/unicode-target.ts'), 'utf-8') as string;
    expect(target).toMatch(/import\s+\{\s*常數\s*\}\s+from\s+['"][^'"]*unicode-source/);
    expect(target).toContain('return 常數;');
  });

  it('consumer import Unicode 成員時，移動後應改指向目標檔', async () => {
    await fixture.writeFile('src/unicode-consumer-source.ts', `export function 被搬移(): number {
  return 42;
}
`);
    await fixture.writeFile('src/unicode-consumer-target.ts', '');
    await fixture.writeFile('src/unicode-consumer.ts', `import { 被搬移 } from './unicode-consumer-source';

export const unicodeConsumerValue = 被搬移();
`);

    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/unicode-consumer-source.ts')}:1`, fixture.getFilePath('src/unicode-consumer-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const consumer = await fixture.memfs.readFile(fixture.getFilePath('src/unicode-consumer.ts'), 'utf-8') as string;
    expect(consumer).toContain('import { 被搬移 } from \'./unicode-consumer-target\';');
    expect(consumer).not.toContain('from \'./unicode-consumer-source\';');
  });
});
