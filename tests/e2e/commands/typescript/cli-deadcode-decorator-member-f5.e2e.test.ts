/**
 * CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F5：deadcode --include-public-members 把帶 member decorator 的 public 方法
 * 當 dead code
 *
 * dead-code-detector 對 --include-public-members 的存活判斷純粹以「有無呼叫點」
 * 計算，未對 method decorator（如 `@Get('/x') handler(){}`）做任何特殊處理
 * （見 src/core/deadcode/、src/plugins/typescript/ 均無 decorator 相關存活保護）。
 * 帶路由 decorator 的 handler 方法通常只被框架透過 decorator metadata 在執行期
 * 反射呼叫，原始碼中不會有靜態呼叫點；純引用計數會把它與真正無人呼叫的
 * `plain()` 一視同仁判為 dead code，刪除後會破壞執行期路由行為。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

interface DeadcodeLine {
  type: string;
  content: string;
}
interface DeadcodeHunk {
  lines: DeadcodeLine[];
}
interface DeadcodeFileEntry {
  filePath: string;
  hunks?: DeadcodeHunk[];
}

function extractDeletedContent(file: DeadcodeFileEntry | undefined): string {
  return (file?.hunks ?? [])
    .flatMap((h) => h.lines.filter((l) => l.type === 'delete').map((l) => l.content))
    .join('\n');
}

describe('CLI deadcode 缺陷 F5：member decorator 保護缺失', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[F5] 帶 member decorator 的 public method 不應被 --include-public-members 標記為 dead code，未修飾成員仍應被標記', async () => {
    const defFile = `${fixture.rootPath}/regression-f5-controller.ts`;
    const usageFile = `${fixture.rootPath}/regression-f5-usage.ts`;

    await fixture.memfs.writeFile(defFile, `function GetF5(path: string) {
  return (target: unknown, key: string) => {};
}

export class ControllerF5 {
  @GetF5('/x')
  handlerF5() {
    return 1;
  }

  plainF5() {
    return 2;
  }
}
`);
    await fixture.memfs.writeFile(usageFile, `import { ControllerF5 } from './regression-f5-controller';

new ControllerF5();
`);

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-public-members'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const controllerFile = (output.files ?? []).find(
      (f: DeadcodeFileEntry) => f.filePath.includes('regression-f5-controller.ts')
    );
    const deletedContent = extractDeletedContent(controllerFile);

    // 帶 decorator 的 handlerF5 不可出現在刪除內容中（不可被判為 dead code）
    expect(deletedContent).not.toContain('handlerF5');
    // 未修飾的 plainF5 沒有任何呼叫點，仍應被判為 dead code
    expect(deletedContent).toContain('plainF5');
  });
});
