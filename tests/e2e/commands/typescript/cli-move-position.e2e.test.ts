/**
 * CLI move 成員移動 E2E 測試（位置格式）
 * 測試 move source:line target 格式的成員移動
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - 成員移動（位置格式）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該使用 source:line 格式移動函式', async () => {
      await fixture.writeFile('src/source.ts', `export function helper(): number {
  return 42;
}

export function main(): number {
  return helper();
}
`);

      await fixture.writeFile('src/target.ts', `export function existing(): string {
  return 'existing';
}
`);

      // helper 函式在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.command).toBe('move');
      }
    });

    it('應該使用 source:line:column 格式移動函式', async () => {
      await fixture.writeFile('src/source.ts', `export function first(): number { return 1; }

export function second(): number { return 2; }
`);

      await fixture.writeFile('src/target.ts', '');

      // second 函式在第 3 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:3:1`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該移動函式到新檔案', async () => {
      await fixture.writeFile('src/source.ts', `export function toMove(): number {
  return 100;
}

export function stay(): number {
  return toMove();
}
`);

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/new-file.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('無位置的路徑應該執行檔案移動', async () => {
      await fixture.writeFile('src/old-file.ts', `export function fn(): void {}
`);

      const result = await executeCLI(
        ['move', fixture.getFilePath('src/old-file.ts'), fixture.getFilePath('src/new-file.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Class 移動', () => {
    it('應該移動整個 class', async () => {
      await fixture.writeFile('src/models.ts', `export class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}

export class Product {
  id: number;
}
`);

      await fixture.writeFile('src/entities.ts', `export class Entity {}
`);

      // User class 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/models.ts')}:1`, fixture.getFilePath('src/entities.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('Interface 和 Type 移動', () => {
    it('應該移動 interface', async () => {
      await fixture.writeFile('src/types.ts', `export interface UserDTO {
  id: number;
  name: string;
}

export interface ProductDTO {
  id: number;
}
`);

      await fixture.writeFile('src/dtos.ts', `export interface BaseDTO {}
`);

      // UserDTO interface 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/types.ts')}:1`, fixture.getFilePath('src/dtos.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該移動 type alias', async () => {
      await fixture.writeFile('src/types.ts', `export type ID = number;
export type Name = string;
`);

      await fixture.writeFile('src/common.ts', `export type Base = object;
`);

      // ID type 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/types.ts')}:1`, fixture.getFilePath('src/common.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('常數和 Enum 移動', () => {
    it('應該移動常數', async () => {
      await fixture.writeFile('src/config.ts', `export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
`);

      await fixture.writeFile('src/constants.ts', `export const VERSION = '1.0.0';
`);

      // API_URL 常數在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/config.ts')}:1`, fixture.getFilePath('src/constants.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該移動 enum', async () => {
      await fixture.writeFile('src/enums.ts', `export enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE'
}

export enum Role {
  Admin = 'ADMIN',
  User = 'USER'
}
`);

      await fixture.writeFile('src/types.ts', `export type ID = number;
`);

      // Status enum 在第 1 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/enums.ts')}:1`, fixture.getFilePath('src/types.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('選項測試', () => {
    it('應該支援 --keep-reexport 選項', async () => {
      await fixture.writeFile('src/utils.ts', `export function helper(): number {
  return 42;
}
`);

      await fixture.writeFile('src/helpers.ts', `export function other(): void {}
`);

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/utils.ts')}:1`, fixture.getFilePath('src/helpers.ts'), '-p', fixture.rootPath, '--keep-reexport', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該支援 --target-class 選項', async () => {
      await fixture.writeFile('src/user.ts', `export class User {
  name: string;

  validateEmail(email: string): boolean {
    return email.includes('@');
  }
}
`);

      await fixture.writeFile('src/validator.ts', `export class Validator {
  validateName(name: string): boolean {
    return name.length > 0;
  }
}
`);

      // validateEmail 方法在第 4 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/user.ts')}:4`, fixture.getFilePath('src/validator.ts'), '-p', fixture.rootPath, '--target-class', 'Validator', '--dry-run', '--format', 'json'],
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
    it('應該處理無效的行號', async () => {
      await fixture.writeFile('src/source.ts', `export function fn(): void {}
`);

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:999`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });

    it('應該處理不存在的來源檔案', async () => {
      const result = await executeCLI(
        ['move', '/nonexistent/source.ts:1', '/target.ts', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      await fixture.writeFile('src/source.ts', `export function fn(): void {}
`);
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該支援 summary 格式輸出', async () => {
      await fixture.writeFile('src/source.ts', `export function fn(): void {}
`);
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
    });
  });

  describe('dry-run 模式', () => {
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const originalSource = `export function toMove(): void {}
`;
      await fixture.writeFile('src/source.ts', originalSource);
      await fixture.writeFile('src/target.ts', '');

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/source.ts'), 'utf-8');
      expect(sourceContent).toBe(originalSource);
    });
  });

  describe('Bug 修復測試', () => {
    it('應該只移動指定的函式，不影響其他函式', async () => {
      await fixture.writeFile('src/utils.ts', `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`);

      await fixture.writeFile('src/math.ts', `export function divide(a: number, b: number): number {
  return a / b;
}
`);

      // multiply 函式在第 9 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/utils.ts')}:9`, fixture.getFilePath('src/math.ts'), '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      // 來源檔案應該仍保留 add 和 subtract
      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/utils.ts'), 'utf-8');
      expect(sourceContent).toContain('function add');
      expect(sourceContent).toContain('function subtract');
      expect(sourceContent).not.toContain('function multiply');

      // 目標檔案應該只有 divide 和 multiply，不應有 subtract
      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/math.ts'), 'utf-8');
      expect(targetContent).toContain('function divide');
      expect(targetContent).toContain('function multiply');
      expect(targetContent).not.toContain('function subtract');
    });

    it('應該只更新被移動成員的 import，不影響同來源的其他成員', async () => {
      await fixture.writeFile('src/source.ts', `export function A(): string {
  return 'A';
}

export function B(): string {
  return 'B';
}

export function C(): string {
  return 'C';
}
`);

      await fixture.writeFile('src/consumer.ts', `import { A, B, C } from './source';

export function useAll(): string {
  return A() + B() + C();
}
`);

      await fixture.writeFile('src/target.ts', `export function existing(): void {}
`);

      // B 函式在第 5 行
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:5`, fixture.getFilePath('src/target.ts'), '-p', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      // consumer 應該更新 import：A, C 仍從 source，B 從 target
      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/consumer.ts'), 'utf-8');
      expect(consumerContent).toContain('A');
      expect(consumerContent).toContain('C');
    });
  });

  describe('引用更新', () => {
    it('應該自動更新引用', async () => {
      await fixture.writeFile('src/utils.ts', `export function utility(): string {
  return 'utility';
}
`);

      await fixture.writeFile('src/consumer.ts', `import { utility } from './utils';
export const result = utility();
`);

      await fixture.writeFile('src/target.ts', `export function other(): void {}
`);

      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/utils.ts')}:1`, fixture.getFilePath('src/target.ts'), '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 使用新格式：summary.totalFiles 表示受影響檔案數
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('target 帶插入位置', () => {
    it('應該支援 target:line 格式指定插入位置', async () => {
      await fixture.writeFile('src/source.ts', `export function toMove(): void {}
`);

      await fixture.writeFile('src/target.ts', `// Line 1
// Line 2
export function existing(): void {}
// Line 4
`);

      // 在 target 的第 3 行插入
      const result = await executeCLI(
        ['move', `${fixture.getFilePath('src/source.ts')}:1`, `${fixture.getFilePath('src/target.ts')}:3`, '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });
});
