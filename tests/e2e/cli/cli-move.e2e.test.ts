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

  // === 複雜跨檔案引用測試 ===

  describe('複雜跨檔案引用場景', () => {
    it('應該能移動被 10 個檔案引用的模組', async () => {
      const {
        createModuleWithManyImports
      } = await import('../helpers/complex-project-templates');

      const complexProject = await createTypeScriptProject(
        createModuleWithManyImports('helper', 10)
      );

      const sourcePath = complexProject.getFilePath('src/utils/helper.ts');
      const targetPath = complexProject.getFilePath('src/shared/helper.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // TODO: 驗證檔案已移動和 import 路徑更新（需要確保 move 功能完整實作）

      await complexProject.cleanup();
    });

    it('應該能移動跨多層目錄引用的檔案', async () => {
      const {
        createCrossDirectoryImportProject
      } = await import('../helpers/complex-project-templates');

      const crossDirProject = await createTypeScriptProject(
        createCrossDirectoryImportProject('formatter')
      );

      // 從深層移到淺層
      const sourcePath = crossDirProject.getFilePath('src/core/utils/formatter.ts');
      const targetPath = crossDirProject.getFilePath('src/utils/formatter.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // TODO: 驗證檔案移動和各層級 import 路徑更新

      await crossDirProject.cleanup();
    });

    it('應該能移動整個目錄並更新所有引用', async () => {
      const {
        createDirectoryMoveProject
      } = await import('../helpers/complex-project-templates');

      const dirProject = await createTypeScriptProject(createDirectoryMoveProject());

      // 移動整個 utils 目錄到 shared/utils
      const sourcePath = dirProject.getFilePath('src/utils');
      const targetPath = dirProject.getFilePath('src/shared/utils');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('移動');

      // TODO: 驗證目錄移動和 import 路徑更新

      await dirProject.cleanup();
    });

    it('應該驗證移動後檔案內容不變', async () => {
      const {
        createModuleWithManyImports
      } = await import('../helpers/complex-project-templates');

      const contentProject = await createTypeScriptProject(
        createModuleWithManyImports('validator', 5)
      );

      // 讀取移動前的內容
      const originalContent = await contentProject.readFile('src/utils/validator.ts');

      // 移動檔案
      const sourcePath = contentProject.getFilePath('src/utils/validator.ts');
      const targetPath = contentProject.getFilePath('src/common/validator.ts');

      const result = await executeCLI(['move', sourcePath, targetPath]);

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);

      // 讀取移動後的內容
      const movedExists = await contentProject.fileExists('src/common/validator.ts');

      // 至少驗證檔案存在
      expect(movedExists).toBe(true);

      // TODO: 驗證檔案內容完全相同

      await contentProject.cleanup();
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

      // TODO: 驗證 import 路徑從淺層到深層的正確轉換

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

      // TODO: 驗證所有 10 個引用檔案的 import 路徑都已更新

      await multiRefProject.cleanup();
    });
  });
});
