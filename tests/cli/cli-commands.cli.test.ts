/**
 * CLI 整合測試
 * - 透過實際 CLI 執行測試（非 memfs）
 * - 每個命令一個測試案例
 * - Mutation 命令執行後還原 fixtures
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '../..');
const FIXTURE_PATH = resolve(PROJECT_ROOT, 'tests/fixtures');
const SAMPLE_PROJECT = resolve(FIXTURE_PATH, 'sample-project');
const DEADCODE_TEST = resolve(FIXTURE_PATH, 'deadcode-test');
const DEADCODE_AUTOFIX = resolve(FIXTURE_PATH, 'deadcode-autofix');
const CLI = `node ${resolve(PROJECT_ROOT, 'bin/agent-ide.js')}`;

interface CLIResult {
  success: boolean;

  [key: string]: any;
}

/** 執行 CLI 命令並解析 JSON 輸出 */
function runCLI(command: string): CLIResult {
  try {
    const output = execSync(command, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output) as CLIResult;
  } catch (error) {
    // execSync 在非零退出碼時會拋出錯誤，但我們仍需要解析輸出
    const execError = error as { stdout?: string; stderr?: string };
    if (execError.stdout) {
      try {
        return JSON.parse(execError.stdout) as CLIResult;
      } catch {
        // JSON 解析失敗
      }
    }
    return { success: false, error: execError.stderr || 'Unknown error' };
  }
}

/** 驗證專案仍可編譯 */
function verifyTypecheck(projectPath: string): void {
  execSync(`npx tsc --noEmit -p "${projectPath}"`, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** 還原 fixtures */
function restoreFixtures(): void {
  try {
    execSync(`git -C "${PROJECT_ROOT}" restore "${FIXTURE_PATH}/"`, { stdio: 'pipe' });
  } catch {
    // 忽略還原失敗
  }
  try {
    execSync(`find "${FIXTURE_PATH}" -type d -name "moved-*" -exec rm -rf {} + 2>/dev/null`, { stdio: 'pipe' });
  } catch {
    // 忽略清理失敗
  }
  try {
    execSync(`find "${FIXTURE_PATH}" -type d -name "new-utils" -exec rm -rf {} + 2>/dev/null`, { stdio: 'pipe' });
  } catch {
    // 忽略清理失敗
  }
}

describe('CLI 整合測試', () => {
  beforeAll(() => {
    // 確保已建置
    execSync('pnpm build', { cwd: PROJECT_ROOT, stdio: 'pipe' });
  });

  afterEach(() => {
    // 每個測試後還原 fixtures
    restoreFixtures();
  });

  // ========================================
  // Query Commands（唯讀）
  // ========================================

  describe('Query Commands', () => {
    it('cycles - 循環依賴檢測', () => {
      const result = runCLI(`${CLI} cycles --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
    });

    it('impact - 影響分析', () => {
      const result = runCLI(`${CLI} impact --file "${SAMPLE_PROJECT}/src/models/base-model.ts" --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
    });

    it('snapshot - 模組快照', () => {
      const result = runCLI(`${CLI} snapshot --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
    });

    it('search - 符號搜尋', () => {
      const result = runCLI(`${CLI} search UserService --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('find-references - 符號引用搜尋', () => {
      const result = runCLI(`${CLI} find-references BaseModel --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
    });

    it('call-hierarchy - 呼叫層次分析', () => {
      const result = runCLI(`${CLI} call-hierarchy create --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
    });

    it('deadcode --dry-run - Dead code 預覽', () => {
      const result = runCLI(`${CLI} deadcode --path "${DEADCODE_TEST}" --dry-run --format json`);
      expect(result.success).toBe(true);
    });

    it('snapshot - 父目錄掃描多個子模組 (Issue #59)', () => {
      // 動態創建測試目錄結構
      const testDir = resolve(FIXTURE_PATH, 'issue-59-test');
      const modulesDir = resolve(testDir, 'modules');

      try {
        // 創建目錄結構
        mkdirSync(resolve(modulesDir, 'auth'), { recursive: true });
        mkdirSync(resolve(modulesDir, 'users'), { recursive: true });
        mkdirSync(resolve(modulesDir, 'payments'), { recursive: true });

        // 創建模組檔案
        writeFileSync(
          resolve(modulesDir, 'auth/index.ts'),
          'export class AuthService { login(): boolean { return true; } }'
        );
        writeFileSync(
          resolve(modulesDir, 'users/index.ts'),
          'export interface User { id: string; name: string; }'
        );
        writeFileSync(
          resolve(modulesDir, 'payments/index.ts'),
          'export function createPayment(amount: number) { return { amount }; }'
        );

        // 執行 snapshot 命令（對 modules 父目錄）
        const result = runCLI(`${CLI} snapshot --path "${modulesDir}" --format json`);

        // 驗證核心功能
        expect(result.success).toBe(true);
        expect(result.snapshotType).toBe('project'); // Issue #59 核心：應該是 project 類型
        expect(result.snapshot).toBeDefined();
        expect(result.snapshot.modules).toBeDefined();

        // 應該找到所有子模組
        const moduleNames = Object.keys(result.snapshot.modules);
        expect(moduleNames).toContain('auth');
        expect(moduleNames).toContain('users');
        expect(moduleNames).toContain('payments');
        expect(moduleNames.length).toBe(3);
      } finally {
        // 清理測試目錄
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      }
    });
  });

  // ========================================
  // Mutation Commands（變更類）
  // ========================================

  describe('Mutation Commands', () => {
    it('deadcode - 刪除 dead code、驗證輸出結構、確認仍可編譯', () => {
      // 使用 deadcode-autofix fixture（有 tsconfig.json 可驗證編譯）
      const result = runCLI(`${CLI} deadcode --path "${DEADCODE_AUTOFIX}" --format json`);

      // 驗證基本結構
      expect(result.success).toBe(true);
      expect(result.command).toBe('deadcode-removal');
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);

      // 驗證 summary 統計
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.totalFiles).toBe('number');
      expect(typeof result.summary.totalChanges).toBe('number');

      // 驗證有檢測到 dead code（deadcode-test fixture 應該有）
      expect(result.files.length).toBeGreaterThan(0);

      // 驗證每個 file 的結構
      const file = result.files[0];
      expect(file.filePath).toBeDefined();
      expect(file.hunks).toBeDefined();
      expect(Array.isArray(file.hunks)).toBe(true);

      // 驗證 hunk 結構（使用 diff 格式：oldStart, oldCount, newStart, newCount）
      if (file.hunks.length > 0) {
        const hunk = file.hunks[0];
        expect(typeof hunk.oldStart).toBe('number');
        expect(typeof hunk.oldCount).toBe('number');
        expect(hunk.header).toBeDefined();
        expect(hunk.lines).toBeDefined();
        expect(Array.isArray(hunk.lines)).toBe(true);
      }

      // 🔥 關鍵驗證：刪除 dead code 後專案仍可編譯
      verifyTypecheck(DEADCODE_AUTOFIX);
    });

    it('rename - 符號重命名後仍可編譯', () => {
      const result = runCLI(`${CLI} rename --path "${SAMPLE_PROJECT}" --from UserModel --to UserEntity --format json`);
      expect(result.success).toBe(true);
      verifyTypecheck(SAMPLE_PROJECT);
    });

    it('change-signature - 參數重構後仍可編譯', () => {
      const result = runCLI(`${CLI} change-signature "${SAMPLE_PROJECT}/src/services/user-service.ts" createUser --add "options:object={}@2" --format json`);
      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(result.files.length).toBeGreaterThan(0);
      verifyTypecheck(SAMPLE_PROJECT);
    });

    it('move file - 檔案移動後仍可編譯', () => {
      const result = runCLI(`${CLI} move "${SAMPLE_PROJECT}/src/utils/string-utils.ts" "${SAMPLE_PROJECT}/src/new-utils/string-utils.ts" --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
      verifyTypecheck(SAMPLE_PROJECT);
    });

    it('move directory - 目錄移動後仍可編譯', () => {
      const result = runCLI(`${CLI} move "${SAMPLE_PROJECT}/src/utils" "${SAMPLE_PROJECT}/src/moved-utils" --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
      verifyTypecheck(SAMPLE_PROJECT);
    });

    it('move-member - 成員移動後仍可編譯', () => {
      // 使用 source:line 格式觸發成員移動（capitalize 在第 5 行）
      const result = runCLI(`${CLI} move "${SAMPLE_PROJECT}/src/utils/string-utils.ts:5" "${SAMPLE_PROJECT}/src/utils/array-utils.ts" --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(true);
      verifyTypecheck(SAMPLE_PROJECT);
    });
  });

  // ========================================
  // Error Handling（錯誤處理）
  // ========================================

  describe('Error Handling', () => {
    it('move - 目標檔案已存在應失敗', () => {
      // 移動 index.ts 到已存在的 user-model.ts
      const result = runCLI(`${CLI} move "${SAMPLE_PROJECT}/src/index.ts" "${SAMPLE_PROJECT}/src/models/user-model.ts" --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(false);
    });

    it('move - 來源不存在應失敗', () => {
      const result = runCLI(`${CLI} move "${SAMPLE_PROJECT}/src/nonexistent" "${SAMPLE_PROJECT}/src/target" --path "${SAMPLE_PROJECT}" --format json`);
      expect(result.success).toBe(false);
    });

    it('rename - 符號不存在應失敗', () => {
      const result = runCLI(`${CLI} rename --path "${SAMPLE_PROJECT}" --from NonExistentSymbol --to NewName --format json`);
      expect(result.success).toBe(false);
    });

    it('move directory - 移動到已存在父目錄時，內部相對引用應保持不變', () => {
      // Bug: 當從專案根目錄（有 tsconfig.json）執行移動時，目錄內部的 ./ 相對引用被錯誤地改成絕對路徑
      // 觸發條件：工作目錄是專案根目錄，且用 --path . 執行
      // 例如：./alarm.controller → ../../modules/frontend/alarm/alarm.controller

      const { readFileSync, writeFileSync, mkdirSync, rmSync: rm } = require('fs');
      const { resolve } = require('path');
      const { execSync } = require('child_process');

      // 建立精確復現 bug 的目錄結構
      const testDir = resolve(SAMPLE_PROJECT, 'src/test-move-bug');
      const sourceDir = resolve(testDir, 'frontend/alarm');
      const dtoDir = resolve(sourceDir, 'dto');
      const targetParent = resolve(testDir, 'modules/frontend');

      mkdirSync(dtoDir, { recursive: true });
      mkdirSync(targetParent, { recursive: true });

      // 建立有內部相對引用的檔案（包含子目錄引用）
      writeFileSync(resolve(dtoDir, 'alarm.dto.ts'), 'export class AlarmDto {}');
      writeFileSync(resolve(sourceDir, 'alarm.controller.ts'), `import { AlarmDto } from './dto/alarm.dto';
export class AlarmController {
  dto: AlarmDto;
}`);
      writeFileSync(resolve(sourceDir, 'alarm.service.ts'), `import { AlarmController } from './alarm.controller';
import { AlarmDto } from './dto/alarm.dto';
export class AlarmService {
  controller = new AlarmController();
  dto: AlarmDto;
}`);

      // 關鍵：從 SAMPLE_PROJECT 目錄執行（有 tsconfig.json），用 --path .
      // 這才是真實使用場景，也是 bug 的觸發條件
      const relativeSourceDir = 'src/test-move-bug/frontend/alarm';
      const relativeTargetParent = 'src/test-move-bug/modules/frontend/';
      const cliPath = resolve(PROJECT_ROOT, 'bin/agent-ide.js');

      try {
        const output = execSync(
          `node "${cliPath}" move "${relativeSourceDir}" "${relativeTargetParent}" --path . --format json`,
          { cwd: SAMPLE_PROJECT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const result = JSON.parse(output);
        expect(result.success).toBe(true);
      } catch (error) {
        const execError = error as { stdout?: string };
        if (execError.stdout) {
          const result = JSON.parse(execError.stdout);
          expect(result.success).toBe(true);
        } else {
          throw error;
        }
      }

      // 驗證移動後的 service 檔案
      const movedServicePath = resolve(targetParent, 'alarm/alarm.service.ts');
      const serviceContent = readFileSync(movedServicePath, 'utf-8');

      // 關鍵斷言：內部相對引用應該保持不變
      expect(serviceContent).toContain('from \'./alarm.controller\'');
      expect(serviceContent).toContain('from \'./dto/alarm.dto\'');

      // 不應該被改成錯誤的絕對相對路徑
      expect(serviceContent).not.toContain('../../modules/frontend/alarm');
      expect(serviceContent).not.toContain('../modules/');

      // 驗證 controller 檔案
      const controllerContent = readFileSync(resolve(targetParent, 'alarm/alarm.controller.ts'), 'utf-8');
      expect(controllerContent).toContain('from \'./dto/alarm.dto\'');
      expect(controllerContent).not.toContain('../../modules/frontend/alarm');

      // 清理
      rm(testDir, { recursive: true, force: true });
    });
  });
});
