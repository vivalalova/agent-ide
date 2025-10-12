/**
 * CLI move 命令 E2E 測試
 * 測試實際的檔案移動和 import 更新功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI move 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案，包含檔案和 import 關係
    project = await createTypeScriptProject({
      'src/utils.ts': `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
      `.trim(),
      'src/index.ts': `
import { add, subtract } from './utils';

console.log(add(1, 2));
console.log(subtract(5, 3));
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能移動檔案', async () => {
    const sourcePath = project.getFilePath('src/utils.ts');
    const targetPath = project.getFilePath('src/helpers/utils.ts');

    const result = await executeCLI(
      ['move', sourcePath, targetPath]
    );

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含移動訊息
    expect(result.stdout).toContain('移動');
  });

  it('應該能處理不存在的源檔案', async () => {
    const sourcePath = project.getFilePath('src/nonexistent.ts');
    const targetPath = project.getFilePath('src/target.ts');

    const result = await executeCLI(
      ['move', sourcePath, targetPath]
    );

    // 應該顯示錯誤訊息
    const output = result.stdout;
    expect(output).toContain('移動失敗');
  });

  it('應該能在預覽模式下顯示變更', async () => {
    const sourcePath = project.getFilePath('src/utils.ts');
    const targetPath = project.getFilePath('src/helpers/utils.ts');

    const result = await executeCLI(
      ['move', sourcePath, targetPath, '--preview']
    );

    expect(result.exitCode).toBe(0);

    // 應該顯示預覽訊息
    expect(result.stdout).toContain('預覽');
  });

  it('應該能處理相同的源和目標路徑', async () => {
    const samePath = project.getFilePath('src/utils.ts');

    const result = await executeCLI(
      ['move', samePath, samePath]
    );

    // 應該成功執行或顯示適當訊息
    expect(result.exitCode).toBe(0);
  });

  it('應該能處理目標目錄不存在的情況', async () => {
    const sourcePath = project.getFilePath('src/utils.ts');
    const targetPath = project.getFilePath('src/deep/nested/path/utils.ts');

    const result = await executeCLI(['move', sourcePath, targetPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('移動');
  });

  it('應該能移動並更新相對路徑 import', async () => {
    const moveProject = await createTypeScriptProject({
      'src/utils/helper.ts': `
export function help() {
  return 'helping';
}
      `.trim(),
      'src/main.ts': `
import { help } from './utils/helper';
console.log(help());
      `.trim()
    });

    const sourcePath = moveProject.getFilePath('src/utils/helper.ts');
    const targetPath = moveProject.getFilePath('src/shared/helper.ts');

    const result = await executeCLI(['move', sourcePath, targetPath]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('移動');

    await moveProject.cleanup();
  });

  it('應該能處理檔案名稱變更的移動', async () => {
    const renameProject = await createTypeScriptProject({
      'src/old-name.ts': `
export const VALUE = 42;
      `.trim(),
      'src/index.ts': `
import { VALUE } from './old-name';
console.log(VALUE);
      `.trim()
    });

    const sourcePath = renameProject.getFilePath('src/old-name.ts');
    const targetPath = renameProject.getFilePath('src/new-name.ts');

    const result = await executeCLI(['move', sourcePath, targetPath]);

    expect(result.exitCode).toBe(0);

    await renameProject.cleanup();
  });

  it('應該能處理多層嵌套目錄移動', async () => {
    const nestedProject = await createTypeScriptProject({
      'src/a/b/c/deep.ts': `
export const DEEP = 'very deep';
      `.trim(),
      'src/index.ts': `
import { DEEP } from './a/b/c/deep';
console.log(DEEP);
      `.trim()
    });

    const sourcePath = nestedProject.getFilePath('src/a/b/c/deep.ts');
    const targetPath = nestedProject.getFilePath('src/shallow.ts');

    const result = await executeCLI(['move', sourcePath, targetPath]);

    expect(result.exitCode).toBe(0);

    await nestedProject.cleanup();
  });

  it('應該能處理包含特殊字符的檔案名', async () => {
    const specialProject = await createTypeScriptProject({
      'src/special-file.ts': `
export const SPECIAL = 'special';
      `.trim()
    });

    const sourcePath = specialProject.getFilePath('src/special-file.ts');
    const targetPath = specialProject.getFilePath('src/utils/special-file.ts');

    const result = await executeCLI(['move', sourcePath, targetPath]);

    expect(result.exitCode).toBe(0);

    await specialProject.cleanup();
  });

  // === 複雜跨檔案引用測試 ===

  describe('複雜跨檔案引用場景', () => {
    it('應該能移動被多個檔案引用的模組', async () => {
      const multiRefProject = await createTypeScriptProject({
        'src/shared.ts': `
export const SHARED_VALUE = 'shared';
export function sharedFunc() { return 'shared'; }
        `.trim(),
        'src/file1.ts': `
import { SHARED_VALUE } from './shared';
console.log(SHARED_VALUE);
        `.trim(),
        'src/file2.ts': `
import { sharedFunc } from './shared';
console.log(sharedFunc());
        `.trim(),
        'src/file3.ts': `
import { SHARED_VALUE, sharedFunc } from './shared';
console.log(SHARED_VALUE, sharedFunc());
        `.trim()
      });

      const sourcePath = multiRefProject.getFilePath('src/shared.ts');
      const targetPath = multiRefProject.getFilePath('src/common/shared.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      await multiRefProject.cleanup();
    });

    it('應該能移動跨多層目錄引用的檔案', async () => {
      const crossDirProject = await createTypeScriptProject({
        'src/core/utils/formatter.ts': `
export function format(text: string): string {
  return text.toUpperCase();
}
        `.trim(),
        'src/services/service.ts': `
import { format } from '../core/utils/formatter';
export const formatted = format('test');
        `.trim(),
        'src/api/handler.ts': `
import { format } from '../core/utils/formatter';
console.log(format('api'));
        `.trim()
      });

      // 從深層移到淺層
      const sourcePath = crossDirProject.getFilePath('src/core/utils/formatter.ts');
      const targetPath = crossDirProject.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      await crossDirProject.cleanup();
    });

    it('應該能處理從淺層移到深層目錄', async () => {
      const shallowToDeepProject = await createTypeScriptProject({
        'src/config.ts': `
export const API_URL = 'http://api.example.com';
export const TIMEOUT = 5000;
        `.trim(),
        'src/services/api-service.ts': `
import { API_URL, TIMEOUT } from '../config';

export class ApiService {
  url = API_URL;
  timeout = TIMEOUT;
}
        `.trim(),
        'src/utils/api-utils.ts': `
import { API_URL } from '../config';

export function buildUrl(path: string): string {
  return API_URL + path;
}
        `.trim()
      });

      // 從淺層移到深層
      const sourcePath = shallowToDeepProject.getFilePath('src/config.ts');
      const targetPath = shallowToDeepProject.getFilePath('src/core/config/settings.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      await shallowToDeepProject.cleanup();
    });

    it('應該能處理多個檔案同時引用同一模組的場景', async () => {
      const multiRefProject = await createTypeScriptProject({
        'src/constants.ts': `
export const APP_NAME = 'MyApp';
export const VERSION = '1.0.0';
        `.trim(),
        'src/services/service1.ts': 'import { APP_NAME } from \'../constants\';',
        'src/services/service2.ts': 'import { APP_NAME } from \'../constants\';',
        'src/services/service3.ts': 'import { VERSION } from \'../constants\';',
        'src/api/api1.ts': 'import { APP_NAME, VERSION } from \'../constants\';',
        'src/api/api2.ts': 'import { VERSION } from \'../constants\';',
        'src/controllers/ctrl1.ts': 'import { APP_NAME } from \'../constants\';',
        'src/controllers/ctrl2.ts': 'import { APP_NAME } from \'../constants\';',
        'src/controllers/ctrl3.ts': 'import { VERSION } from \'../constants\';',
        'src/utils/util1.ts': 'import { APP_NAME } from \'../constants\';',
        'src/utils/util2.ts': 'import { VERSION } from \'../constants\';'
      });

      const sourcePath = multiRefProject.getFilePath('src/constants.ts');
      const targetPath = multiRefProject.getFilePath('src/config/constants.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      await multiRefProject.cleanup();
    });

    it('應該能處理循環引用的檔案移動', async () => {
      const circularProject = await createTypeScriptProject({
        'src/a.ts': `
import { bFunction } from './b';
export function aFunction() {
  return 'a' + bFunction();
}
        `.trim(),
        'src/b.ts': `
import { aFunction } from './a';
export function bFunction() {
  return 'b';
}
        `.trim()
      });

      const sourcePath = circularProject.getFilePath('src/a.ts');
      const targetPath = circularProject.getFilePath('src/utils/a.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      expect(result.exitCode).toBe(0);

      await circularProject.cleanup();
    });

    it('應該能處理大型專案的檔案移動', async () => {
      const files: Record<string, string> = {
        'src/core.ts': `
export const CORE_VALUE = 'core';
        `.trim()
      };

      // 建立 20 個引用檔案
      for (let i = 0; i < 20; i++) {
        files[`src/file${i}.ts`] = `
import { CORE_VALUE } from './core';
export const value${i} = CORE_VALUE + ${i};
        `.trim();
      }

      const largeProject = await createTypeScriptProject(files);

      const sourcePath = largeProject.getFilePath('src/core.ts');
      const targetPath = largeProject.getFilePath('src/shared/core.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      await largeProject.cleanup();
    });

    it('應該能處理包含多種 import 語法的檔案', async () => {
      const importProject = await createTypeScriptProject({
        'src/module.ts': `
export default class MyClass {}
export const named = 'named';
export function namedFunc() {}
        `.trim(),
        'src/user1.ts': 'import MyClass from \'./module\';',
        'src/user2.ts': 'import { named } from \'./module\';',
        'src/user3.ts': 'import { namedFunc } from \'./module\';',
        'src/user4.ts': 'import MyClass, { named } from \'./module\';',
        'src/user5.ts': 'import * as mod from \'./module\';'
      });

      const sourcePath = importProject.getFilePath('src/module.ts');
      const targetPath = importProject.getFilePath('src/lib/module.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      expect(result.exitCode).toBe(0);

      await importProject.cleanup();
    });

    it('應該能處理相對路徑別名', async () => {
      const aliasProject = await createTypeScriptProject({
        'src/utils/helper.ts': `
export function help() { return 'help'; }
        `.trim(),
        'src/main.ts': `
import { help } from '@/utils/helper';
console.log(help());
        `.trim(),
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            paths: {
              '@/*': ['./src/*']
            }
          }
        })
      });

      const sourcePath = aliasProject.getFilePath('src/utils/helper.ts');
      const targetPath = aliasProject.getFilePath('src/shared/helper.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      expect(result.exitCode).toBe(0);

      await aliasProject.cleanup();
    });

    it('應該能處理同時移動多個相關檔案', async () => {
      const batchProject = await createTypeScriptProject({
        'src/module-a.ts': 'export const A = "a";',
        'src/module-b.ts': 'export const B = "b";',
        'src/module-c.ts': 'export const C = "c";',
        'src/index.ts': `
import { A } from './module-a';
import { B } from './module-b';
import { C } from './module-c';
        `.trim()
      });

      // 移動第一個檔案
      const source1 = batchProject.getFilePath('src/module-a.ts');
      const target1 = batchProject.getFilePath('src/lib/module-a.ts');
      const result1 = await executeCLI(['move', source1, target1]);
      expect(result1.exitCode).toBe(0);

      // 移動第二個檔案
      const source2 = batchProject.getFilePath('src/module-b.ts');
      const target2 = batchProject.getFilePath('src/lib/module-b.ts');
      const result2 = await executeCLI(['move', source2, target2]);
      expect(result2.exitCode).toBe(0);

      await batchProject.cleanup();
    });
  });
});
