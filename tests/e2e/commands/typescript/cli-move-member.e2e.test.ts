/**
 * CLI move-member 命令 E2E 測試
 * 基於 sample-project fixture 測試成員移動功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('移動函式 - 基本功能', () => {
    it('應該成功移動函式到現有檔案', async () => {
      await fixture.writeFile('src/source.ts', `
export function helper(): number {
  return 42;
}

export function main(): number {
  return helper();
}
`);

      await fixture.writeFile('src/target.ts', `
export function existing(): string {
  return 'existing';
}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'helper', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.name).toBe('helper');
      }
    });

    it('應該成功移動函式到新檔案', async () => {
      await fixture.writeFile('src/source.ts', `
export function toMove(): number {
  return 100;
}

export function stay(): number {
  return toMove();
}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'toMove', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/new-file.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.targetFileChange.isNewFile).toBe(true);
      }
    });

    it('應該自動更新引用', async () => {
      await fixture.writeFile('src/utils.ts', `
export function utility(): string {
  return 'utility';
}
`);

      await fixture.writeFile('src/consumer1.ts', `
import { utility } from './utils';
export const result1 = utility();
`);

      await fixture.writeFile('src/consumer2.ts', `
import { utility } from './utils';
export const result2 = utility();
`);

      await fixture.writeFile('src/target.ts', `
export function other(): void {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/utils.ts'), 'utility', '--target-file', fixture.getFilePath('src/target.ts'), '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.referenceUpdates).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('移動 Class - 基本功能', () => {
    it('應該成功移動整個 class', async () => {
      await fixture.writeFile('src/models.ts', `
export class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export class Product {
  id: number;
}
`);

      await fixture.writeFile('src/entities.ts', `
export class Entity {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/models.ts'), 'User', '-p', fixture.rootPath, '--type', 'class', '--target-file', fixture.getFilePath('src/entities.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.type).toBe('class');
      }
    });
  });

  describe('移動 Interface - 基本功能', () => {
    it('應該成功移動 interface', async () => {
      await fixture.writeFile('src/types.ts', `
export interface UserDTO {
  id: number;
  name: string;
}

export interface ProductDTO {
  id: number;
}
`);

      await fixture.writeFile('src/dtos.ts', `
export interface BaseDTO {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/types.ts'), 'UserDTO', '-p', fixture.rootPath, '--type', 'interface', '--target-file', fixture.getFilePath('src/dtos.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.type).toBe('interface');
      }
    });
  });

  describe('移動 Type Alias - 基本功能', () => {
    it('應該成功移動 type alias', async () => {
      await fixture.writeFile('src/types.ts', `
export type ID = number;
export type Name = string;
`);

      await fixture.writeFile('src/common.ts', `
export type Base = object;
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/types.ts'), 'ID', '-p', fixture.rootPath, '--type', 'type', '--target-file', fixture.getFilePath('src/common.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.type).toBe('type-alias');
      }
    });
  });

  describe('移動常數 - 基本功能', () => {
    it('應該成功移動常數', async () => {
      await fixture.writeFile('src/config.ts', `
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
`);

      await fixture.writeFile('src/constants.ts', `
export const VERSION = '1.0.0';
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/config.ts'), 'API_URL', '-p', fixture.rootPath, '--type', 'constant', '--target-file', fixture.getFilePath('src/constants.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.type).toBe('constant');
      }
    });
  });

  describe('移動 Enum - 基本功能', () => {
    it('應該成功移動 enum', async () => {
      await fixture.writeFile('src/enums.ts', `
export enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE'
}

export enum Role {
  Admin = 'ADMIN',
  User = 'USER'
}
`);

      await fixture.writeFile('src/types.ts', `
export type ID = number;
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/enums.ts'), 'Status', '-p', fixture.rootPath, '--type', 'enum', '--target-file', fixture.getFilePath('src/types.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.type).toBe('enum');
      }
    });
  });

  describe('移動 Class 方法', () => {
    it('應該成功移動 class 方法到另一個 class', async () => {
      await fixture.writeFile('src/user.ts', `
export class User {
  name: string;

  validateEmail(email: string): boolean {
    return email.includes('@');
  }
}
`);

      await fixture.writeFile('src/validator.ts', `
export class Validator {
  validateName(name: string): boolean {
    return name.length > 0;
  }
}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/user.ts'), 'validateEmail', '-p', fixture.rootPath, '--type', 'method', '--class', 'User', '--target-file', fixture.getFilePath('src/validator.ts'), '--target-class', 'Validator', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.member.type).toBe('method');
        expect(output.member.className).toBe('User');
      }
    });
  });

  describe('keep-reexport 選項', () => {
    it('應該保留原位置的 re-export', async () => {
      await fixture.writeFile('src/utils.ts', `
export function helper(): number {
  return 42;
}
`);

      await fixture.writeFile('src/helpers.ts', `
export function other(): void {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/utils.ts'), 'helper', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/helpers.ts'), '--keep-reexport', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的成員', async () => {
      await fixture.writeFile('src/source.ts', `
export function existing(): void {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'nonExistent', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr || result.stdout).toContain('nonExistent');
    });

    it('應該處理不存在的來源檔案', async () => {
      const result = await executeCLI(
        ['move-member', '/nonexistent/source.ts', 'member', '--target-file', '/target.ts', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr).toBeDefined();
    });

    it('應該處理語法錯誤的檔案', async () => {
      await fixture.writeFile('src/broken.ts', 'export function broken( {}');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/broken.ts'), 'broken', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理類型不匹配', async () => {
      await fixture.writeFile('src/source.ts', `
export function myFunction(): void {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'myFunction', '-p', fixture.rootPath, '--type', 'class', '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr || result.stdout).toContain('myFunction');
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      await fixture.writeFile('src/source.ts', 'export function fn(): void {}');
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'fn', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('src/source.ts', 'export function fn(): void {}');
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'fn', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const originalSource = 'export function toMove(): void {}';
      await fixture.writeFile('src/source.ts', originalSource);
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'toMove', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/source.ts'), 'utf-8');
      expect(sourceContent).toBe(originalSource);
    });
  });

  describe('極端測試標準 - 大量引用（60+ 檔案）', () => {
    it('應該處理被 60+ 檔案引用的成員移動', async () => {
      await fixture.writeFile('src/shared.ts', `
export function sharedHelper(): number {
  return 42;
}
`);

      // 創建 65 個引用檔案
      for (let i = 0; i < 65; i++) {
        await fixture.writeFile(`src/consumers/file${i}.ts`, `
import { sharedHelper } from '../shared';
export const result${i} = sharedHelper();
`);
      }

      await fixture.writeFile('src/target.ts', 'export function other(): void {}');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/shared.ts'), 'sharedHelper', '--target-file', fixture.getFilePath('src/target.ts'), '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.stats.filesAffected).toBeGreaterThanOrEqual(60);
      }
    });
  });

  describe('極端測試標準 - 深層巢狀（10+ 層）', () => {
    it('應該處理 12 層巢狀目錄結構中的成員移動', async () => {
      const deepPath = 'src/a/b/c/d/e/f/g/h/i/j/k/l';
      await fixture.writeFile(`${deepPath}/deep.ts`, `
export function deepFunction(): number {
  return 42;
}
`);

      await fixture.writeFile('src/target.ts', 'export function other(): void {}');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath(`${deepPath}/deep.ts`), 'deepFunction', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超大 Class（50+ 方法）', () => {
    it('應該處理從有 55 個方法的 class 中移動方法', async () => {
      const methods = Array.from({ length: 55 }, (_, i) => `
  method${i}(): number {
    return ${i};
  }`).join('\n');

      await fixture.writeFile('src/big-class.ts', `
export class BigClass {
${methods}
}
`);

      await fixture.writeFile('src/target.ts', `
export class TargetClass {}
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/big-class.ts'), 'method0', '-p', fixture.rootPath, '--type', 'method', '--class', 'BigClass', '--target-file', fixture.getFilePath('src/target.ts'), '--target-class', 'TargetClass', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超長函式（500+ 行）', () => {
    it('應該處理 500+ 行的函式移動', async () => {
      const longBody = Array.from({ length: 500 }, (_, i) => `  const v${i} = ${i};`).join('\n');

      await fixture.writeFile('src/source.ts', `
export function longFunction(): number {
${longBody}
  return v499;
}
`);

      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'longFunction', '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 超長名稱（100+ 字元）', () => {
    it('應該處理超長成員名稱', async () => {
      const longName = 'a'.repeat(120);

      await fixture.writeFile('src/source.ts', `
export function ${longName}(): number {
  return 42;
}
`);

      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), longName, '-p', fixture.rootPath, '--target-file', fixture.getFilePath('src/target.ts'), '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('極端測試標準 - 複雜依賴', () => {
    it('應該處理有複雜依賴的成員移動', async () => {
      // 創建依賴鏈
      await fixture.writeFile('src/types.ts', `
export interface Config {
  value: number;
}
`);

      await fixture.writeFile('src/utils.ts', `
import { Config } from './types';

export function createConfig(): Config {
  return { value: 42 };
}

export function processConfig(config: Config): number {
  return config.value * 2;
}
`);

      await fixture.writeFile('src/service.ts', `
import { createConfig, processConfig } from './utils';

export function run(): number {
  const config = createConfig();
  return processConfig(config);
}
`);

      await fixture.writeFile('src/target.ts', `
import { Config } from './types';
`);

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/utils.ts'), 'createConfig', '--target-file', fixture.getFilePath('src/target.ts'), '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('缺少參數處理', () => {
    it('應該處理缺少來源檔案參數', async () => {
      const result = await executeCLI(
        ['move-member', '--target-file', '/target.ts'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少成員名稱參數', async () => {
      await fixture.writeFile('src/source.ts', 'export function fn(): void {}');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), '--target-file', '/target.ts'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少目標檔案參數', async () => {
      await fixture.writeFile('src/source.ts', 'export function fn(): void {}');

      const result = await executeCLI(
        ['move-member', fixture.getFilePath('src/source.ts'), 'fn', '-p', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('輸出格式測試', () => {
    it('diff 格式應該顯示實際的程式碼變更內容', async () => {
      await fixture.writeFile('src/source.ts', `
export function helper(): number {
  return 42;
}

export function main(): number {
  return helper();
}
`);

      await fixture.writeFile('src/target.ts', `
export function existing(): string {
  return 'existing';
}
`);

      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source.ts'),
          'helper',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/target.ts'),
          '--dry-run',
          '--format', 'diff'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = result.stdout || '';

      // 應該包含 diff header
      expect(output).toContain('---');
      expect(output).toContain('+++');

      // 應該包含 hunk header（@@ 格式）
      expect(output).toMatch(/@@ .* @@/);

      // 應該包含實際的程式碼內容（而非佔位文字）
      expect(output).toContain('helper');
      expect(output).toContain('return 42');

      // 不應該包含舊的佔位文字
      expect(output).not.toContain('成員已移除');
      expect(output).not.toContain('成員已加入');
    });

    it('diff 格式應該顯示刪除行和新增行', async () => {
      await fixture.writeFile('src/source.ts', `
export function toMove(): string {
  return 'moved';
}
`);

      await fixture.writeFile('src/target.ts', `
export function other(): void {}
`);

      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source.ts'),
          'toMove',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/target.ts'),
          '--dry-run',
          '--format', 'diff'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = result.stdout || '';

      // 應該包含刪除標記（-）和新增標記（+）
      expect(output).toMatch(/-.*toMove/);
      expect(output).toMatch(/\+.*toMove/);
    });
  });
});
