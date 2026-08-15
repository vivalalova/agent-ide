/**
 * CLI deadcode - JSX factory 隱式使用的 import binding 不得誤判 dead（P2，reproduction）
 *
 * 對抗複審重現：.jsx 檔 `import React from 'react'`，檔內只用 `<div>` 等 JSX 標籤（無任何
 * 顯式 `React.xxx` 呼叫），classic JSX transform 會把 `<div>` 編譯為
 * `React.createElement('div', ...)`，但原始碼裡沒有任何顯式 identifier 引用到 `React`，
 * reference-finder 找不到，deadcode 會誤判 React import 為 dead；--apply 刪除後在
 * classic JSX runtime 下造成執行期 ReferenceError（P2 confirmed）。
 *
 * 修法：detector 對含 JSX 元素的檔案，把 JSX factory root 識別符（預設 React，
 * 可被 `/** @jsx h *\/` pragma 覆寫其 root identifier）的 import binding 排除出
 * dead 候選——刪碼工具寧可漏報也不可誤刪。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

function findFileDiff(
  output: { files?: Array<{ filePath: string; hunks?: Array<{ lines: Array<{ type: string; content: string }> }> }> },
  fileNameIncludes: string
): { deleted: string } {
  const file = output.files?.find((f) => f.filePath.includes(fileNameIncludes));
  const lines = (file?.hunks ?? []).flatMap((h) => h.lines);
  return {
    deleted: lines.filter((l) => l.type === 'delete').map((l) => l.content).join('\n')
  };
}

describe('CLI deadcode - JSX factory 隱式使用不得誤判 dead（P2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('只用 <div> 等 JSX 標籤（無顯式 React.xxx 呼叫）：預設 React import 不得回報為 dead', async () => {
    await fixture.writeFile(
      'src/JsxOnlyDiv.jsx',
      'import React from \'react\';\n\nexport function JsxOnlyDiv() {\n  return <div>hi</div>;\n}\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const diff = findFileDiff(output, 'JsxOnlyDiv');
    expect(diff.deleted).not.toContain('React');
  });

  it('對照組：同檔另一個真正未使用的 named import 仍要回報為 dead', async () => {
    await fixture.writeFile(
      'src/jsx-helpers.js',
      'export function reallyUnusedHelper() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/JsxWithUnusedNamed.jsx',
      'import React from \'react\';\n'
      + 'import { reallyUnusedHelper } from \'./jsx-helpers.js\';\n\n'
      + 'export function JsxWithUnusedNamed() {\n  return <div>hi</div>;\n}\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const diff = findFileDiff(output, 'JsxWithUnusedNamed');
    // React（JSX factory）不得回報，但真正未使用的 named import 仍要回報
    expect(diff.deleted).not.toContain('React');
    expect(diff.deleted).toContain('reallyUnusedHelper');
  });

  it('--apply 後 React import 應保留，且執行期不出現 ReferenceError（語法上仍是合法 import）', async () => {
    await fixture.writeFile(
      'src/JsxOnlyDivApply.jsx',
      'import React from \'react\';\n\nexport function JsxOnlyDivApply() {\n  return <div>hi</div>;\n}\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const content = await fixture.readFile('src/JsxOnlyDivApply.jsx');
    expect(content).toContain('import React from \'react\';');
  });

  it('/** @jsx h */ pragma：factory root 改為 h 時，h 的 import 不得回報為 dead', async () => {
    await fixture.writeFile(
      'src/JsxPragmaH.jsx',
      '/** @jsx h */\n'
      + 'import { h } from \'preact\';\n\n'
      + 'export function JsxPragmaH() {\n  return <div>hi</div>;\n}\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const diff = findFileDiff(output, 'JsxPragmaH');
    expect(diff.deleted).not.toContain('h');
  });
});
