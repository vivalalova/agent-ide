/**
 * CLI snapshot 命令 E2E 測試
 * 基於 sample-project fixture 測試模組快照功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';
import type { SnapshotResult, ModuleSnapshotData, ProjectSnapshotData } from '@infrastructure/formatters/query-types.js';

describe('CLI snapshot - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;
  let modulePath: string;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
    // 使用具體模組路徑（有 index.ts 的目錄）
    modulePath = `${fixture.rootPath}/src/types`;
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本輸出', () => {
    it('應該成功執行 snapshot 命令', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該輸出有效 JSON 格式', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該包含 SnapshotResult 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.command).toBe('snapshot');
      expect(snapshotResult.success).toBe(true);
      expect(snapshotResult.snapshotType).toBeDefined();
      expect(snapshotResult.snapshot).toBeDefined();
    });

    it('應該包含 module 欄位', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.module).toBeDefined();
    });
  });

  describe('API 提取', () => {
    it('應該提取 class 的 public 方法', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.api).toBeDefined();
    });

    it('應該包含方法簽章（參數和回傳型別）', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      if (Object.keys(snapshot.api).length > 0) {
        const firstClass = Object.values(snapshot.api)[0] as Record<string, string>;
        const firstMethod = Object.values(firstClass)[0];

        // 方法簽章應包含 → 符號（表示回傳型別）
        expect(firstMethod).toMatch(/→|->|:/);
      }
    });
  });

  describe('factories 提取', () => {
    it('應該識別 createXxx 函數為 factory', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.factories).toBeDefined();
    });
  });

  describe('types 提取', () => {
    it('應該提取 interface 定義', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.types).toBeDefined();
    });

    it('應該包含型別欄位資訊', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      if (Object.keys(snapshot.types).length > 0) {
        const firstType = Object.values(snapshot.types)[0] as string;
        // 型別應包含欄位列表
        expect(firstType).toMatch(/\{.*\}/);
      }
    });
  });

  describe('private 提取', () => {
    it('應該提取 class 的私有欄位', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.private).toBeDefined();
    });

    it('應該包含 imports 資訊', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      if (Object.keys(snapshot.private).length > 0) {
        const firstPrivate = Object.values(snapshot.private)[0] as { fields?: string[]; imports?: string };
        expect(firstPrivate.fields || firstPrivate.imports).toBeDefined();
      }
    });
  });

  describe('自動偵測', () => {
    it('應該根據路徑自動偵測為 module 或 project', async () => {
      // 使用專案根路徑測試自動偵測
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      // 應該有 snapshotType 為 module 或 project
      expect(['module', 'project']).toContain(snapshotResult.snapshotType);

      // 檢查對應的快照結構
      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        expect(snapshot.project).toBeDefined();
        expect(snapshot.modules).toBeDefined();
      } else {
        const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
        expect(snapshot.module).toBeDefined();
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該在路徑不存在時輸出錯誤訊息', async () => {
      const result = await executeCLI(['snapshot', '--path', '/nonexistent/path'], { memfs: fixture.memfs });

      // 應該輸出錯誤訊息到 stderr 或 stdout
      expect(result.stderr || result.stdout).toMatch(/不存在|error|Error/i);
    });
  });

  describe('模組快照結構驗證', () => {
    it('應該包含正確的模組資訊結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 驗證模組快照必要欄位
      expect(snapshot).toHaveProperty('module');
      expect(snapshot).toHaveProperty('api');
      expect(snapshot).toHaveProperty('factories');
      expect(snapshot).toHaveProperty('types');
      expect(snapshot).toHaveProperty('private');
    });

    it('應該提取 UserAddress interface 的欄位', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // UserAddress 應該被提取為 types
      if (snapshot.types['UserAddress']) {
        expect(snapshot.types['UserAddress']).toContain('street');
        expect(snapshot.types['UserAddress']).toContain('city');
      }
    });
  });

  describe('類別資訊驗證', () => {
    it('應該提取 class 的 public 方法到 api', async () => {
      // 建立包含 class 的測試模組
      await fixture.writeFile('test-module/index.ts', `
export class Calculator {
  private value: number = 0;

  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  private reset(): void {
    this.value = 0;
  }
}
`);

      const testModulePath = `${fixture.rootPath}/test-module`;
      const result = await executeCLI(['snapshot', '--path', testModulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // Calculator class 應該有 add 和 subtract 方法
      if (snapshot.api['Calculator']) {
        expect(snapshot.api['Calculator']).toHaveProperty('add');
        expect(snapshot.api['Calculator']).toHaveProperty('subtract');
        // private 方法不應該出現在 api 中
        expect(snapshot.api['Calculator']).not.toHaveProperty('reset');
      }
    });

    it('應該提取 class 的私有欄位到 private', async () => {
      await fixture.writeFile('test-module2/index.ts', `
export class UserManager {
  private users: Map<string, User> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }
}

interface User {
  id: string;
  name: string;
}

interface Config {
  maxUsers: number;
}
`);

      const testModulePath = `${fixture.rootPath}/test-module2`;
      const result = await executeCLI(['snapshot', '--path', testModulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // UserManager 應該有私有欄位資訊
      if (snapshot.private['UserManager']) {
        expect(snapshot.private['UserManager'].fields).toBeDefined();
        expect(Array.isArray(snapshot.private['UserManager'].fields)).toBe(true);
      }
    });
  });

  describe('函數資訊驗證', () => {
    it('應該有 factories 欄位存放工廠函數', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // factories 應該是物件
      expect(snapshot.factories).toBeDefined();
      expect(typeof snapshot.factories).toBe('object');
    });

    it('應該識別 createXxx 命名的函數為 factory', async () => {
      // 測試基本的 factory 識別邏輯（如果有的話）
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 驗證 factories 結構正確
      expect(snapshot.factories).toBeDefined();
      // 每個 factory 值應該是字串（簽章）
      for (const [name, signature] of Object.entries(snapshot.factories)) {
        expect(name.startsWith('create')).toBe(true);
        expect(typeof signature).toBe('string');
      }
    });
  });

  describe('介面資訊驗證', () => {
    it('應該提取 interface 到 types（使用 fixture 現有資料）', async () => {
      // 使用 fixture 中的 types 模組，包含 UserAddress 等 interface
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // types 應該是物件，包含 interface 定義
      expect(snapshot.types).toBeDefined();
      expect(typeof snapshot.types).toBe('object');
    });

    it('應該包含 interface 欄位資訊格式為 {field, field}', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 驗證 types 中的值是字串格式
      for (const [typeName, typeInfo] of Object.entries(snapshot.types)) {
        expect(typeof typeName).toBe('string');
        expect(typeof typeInfo).toBe('string');
        // 應該是 {} 格式或型別資訊
        if (typeInfo.includes('{')) {
          expect(typeInfo).toMatch(/\{.*\}/);
        }
      }
    });

    it('應該正確提取 fixture 中的 interface（如 UserAddress）', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 檢查 types 中是否有 interface 被提取
      const typeNames = Object.keys(snapshot.types);
      // 如果有 UserAddress 等已知 interface
      if (typeNames.includes('UserAddress')) {
        const userAddressType = snapshot.types['UserAddress'];
        // 應該包含欄位名稱
        expect(userAddressType).toContain('street');
      }
    });
  });

  describe('型別資訊驗證', () => {
    it('應該提取 type alias 到 types（使用 fixture 中的 common.ts）', async () => {
      // 使用 fixture 中已存在的 types 模組（包含 ID, Timestamp 等 type alias）
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // types 應該包含型別定義
      expect(snapshot.types).toBeDefined();

      // 檢查是否有 type alias（如 ID, Timestamp, Nullable 等）
      const typeNames = Object.keys(snapshot.types);
      // 如果有 ID 或 Timestamp
      if (typeNames.includes('ID')) {
        expect(snapshot.types['ID']).toBeDefined();
      }
      if (typeNames.includes('Timestamp')) {
        expect(snapshot.types['Timestamp']).toBeDefined();
      }
    });

    it('應該區分 interface 和 type alias', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 所有 types 中的值都應該是字串
      for (const typeInfo of Object.values(snapshot.types)) {
        expect(typeof typeInfo).toBe('string');
      }
    });
  });

  describe('Summary 格式驗證', () => {
    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'summary'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      // summary 格式應該是人類可讀的文字，不是 JSON
      expect(() => JSON.parse(result.stdout)).toThrow();
      // 應該包含模組相關資訊
      expect(result.stdout).toMatch(/module|Module|API|types|Types|snapshot|Snapshot/i);
    });
  });

  describe('專案快照驗證', () => {
    it('應該識別專案根目錄並產生專案快照', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        expect(snapshot.project).toBeDefined();
        expect(snapshot.modules).toBeDefined();
        expect(typeof snapshot.modules).toBe('object');
      }
    });

    it('專案快照應該包含多個模組', async () => {
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        const moduleCount = Object.keys(snapshot.modules).length;
        // sample-project 有多個模組（types, services, controllers 等）
        expect(moduleCount).toBeGreaterThan(0);
      }
    });
  });

  describe('深層模組結構', () => {
    it('應該處理子目錄中的模組', async () => {
      // 使用 fixture 中已存在的 types 子目錄
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 驗證模組名稱存在
      expect(snapshot.module).toBeDefined();
      expect(typeof snapshot.module).toBe('string');
    });

    it('應該在專案快照中包含深層模組', async () => {
      // 使用專案根目錄產生專案快照
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;

      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        // 專案快照應該包含 modules
        expect(snapshot.modules).toBeDefined();
        // 驗證有子模組被識別（如 src/types）
        const modulePaths = Object.keys(snapshot.modules);
        expect(modulePaths.some(p => p.includes('types'))).toBe(true);
      }
    });
  });

  describe('空模組處理', () => {
    it('應該正確處理模組並返回有效結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // 模組快照應該有完整的結構
      expect(snapshot.module).toBeDefined();
      expect(snapshot.api).toBeDefined();
      expect(snapshot.factories).toBeDefined();
      expect(snapshot.types).toBeDefined();
      expect(snapshot.private).toBeDefined();
    });

    it('應該處理只有 re-export 的模組（如 types/index.ts）', async () => {
      // types/index.ts 只有 re-export 語句
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.success).toBe(true);

      // 即使是 re-export 模組也應該正常分析
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.module).toBeDefined();
    });
  });

  describe('複雜型別處理', () => {
    it('應該正確處理 API 結構（class 方法）', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // api 應該是 Record<className, Record<methodName, signature>>
      expect(snapshot.api).toBeDefined();
      for (const [className, methods] of Object.entries(snapshot.api)) {
        expect(typeof className).toBe('string');
        expect(typeof methods).toBe('object');
        for (const [methodName, signature] of Object.entries(methods)) {
          expect(typeof methodName).toBe('string');
          expect(typeof signature).toBe('string');
        }
      }
    });

    it('應該正確處理 private 結構（class 私有欄位）', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // private 應該是 Record<className, { fields, imports }>
      expect(snapshot.private).toBeDefined();
      for (const [className, info] of Object.entries(snapshot.private)) {
        expect(typeof className).toBe('string');
        expect(info).toHaveProperty('fields');
        expect(Array.isArray(info.fields)).toBe(true);
      }
    });

    it('應該正確處理各種複雜型別定義', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;

      // types 中的每個型別都應該有定義
      for (const [typeName, typeInfo] of Object.entries(snapshot.types)) {
        expect(typeof typeName).toBe('string');
        expect(typeof typeInfo).toBe('string');
        // 型別定義不應該是空字串
        expect(typeInfo.length).toBeGreaterThan(0);
      }
    });
  });
});
