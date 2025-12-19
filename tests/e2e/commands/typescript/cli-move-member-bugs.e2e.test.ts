/**
 * CLI move-member Bug 修復測試
 * GitHub Issue #31: move-member 額外成員移動、import 更新範圍錯誤
 *
 * TDD: 先寫測試確認失敗，再修復程式碼
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member Bug 修復 - GitHub Issue #31', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('Bug 1: 額外成員被意外移動', () => {
    it('應該只移動指定的 multiply 函式，不移動 subtract', async () => {
      // Given: utils.ts 包含 add, subtract, multiply 三個函式
      await fixture.writeFile('src/utils.ts', `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`);

      await fixture.writeFile('src/math.ts', `
export function divide(a: number, b: number): number {
  return a / b;
}
`);

      // When: 只移動 multiply 到 math.ts
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/utils.ts'),
          'multiply',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/math.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 檢查結果
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

    it('應該只移動指定的 processData 函式，保留其他函式', async () => {
      // Given: 檔案中有多個相似名稱的函式
      await fixture.writeFile('src/data.ts', `
export function fetchData(): string {
  return 'fetched';
}

export function processData(data: string): string {
  return data.toUpperCase();
}

export function validateData(data: string): boolean {
  return data.length > 0;
}

export function saveData(data: string): void {
  console.log(data);
}
`);

      await fixture.writeFile('src/processor.ts', `
export function transform(input: string): string {
  return input.trim();
}
`);

      // When: 只移動 processData
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/data.ts'),
          'processData',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/processor.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/data.ts'), 'utf-8');
      expect(sourceContent).toContain('function fetchData');
      expect(sourceContent).toContain('function validateData');
      expect(sourceContent).toContain('function saveData');
      expect(sourceContent).not.toContain('function processData');

      const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/processor.ts'), 'utf-8');
      expect(targetContent).toContain('function transform');
      expect(targetContent).toContain('function processData');
      expect(targetContent).not.toContain('function fetchData');
      expect(targetContent).not.toContain('function validateData');
      expect(targetContent).not.toContain('function saveData');
    });
  });

  describe('Bug 2: Import 更新範圍錯誤', () => {
    it('應該只更新被移動成員的 import，不影響同來源的其他成員', async () => {
      // Given: source.ts 有 A, B, C 三個 export
      await fixture.writeFile('src/source.ts', `
export function A(): string {
  return 'A';
}

export function B(): string {
  return 'B';
}

export function C(): string {
  return 'C';
}
`);

      // consumer.ts 從 source 導入 A, B, C
      await fixture.writeFile('src/consumer.ts', `
import { A, B, C } from './source';

export function useAll(): string {
  return A() + B() + C();
}
`);

      await fixture.writeFile('src/target.ts', `
export function existing(): void {}
`);

      // When: 只移動 A 到 target.ts
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source.ts'),
          'A',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/target.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: consumer.ts 應該分開 import A 和 B, C
      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/consumer.ts'), 'utf-8');

      // A 應該從 target 導入
      expect(consumerContent).toMatch(/import\s*\{\s*A\s*\}\s*from\s*['"]\.\/target['"]/);

      // B, C 應該仍從 source 導入
      expect(consumerContent).toMatch(/import\s*\{[^}]*B[^}]*\}\s*from\s*['"]\.\/source['"]/);
      expect(consumerContent).toMatch(/import\s*\{[^}]*C[^}]*\}\s*from\s*['"]\.\/source['"]/);
    });

    it('應該正確處理只有單一成員的 import', async () => {
      // Given: source.ts 有多個 export，但 consumer 只 import 其中一個
      await fixture.writeFile('src/source.ts', `
export function X(): string {
  return 'X';
}

export function Y(): string {
  return 'Y';
}
`);

      await fixture.writeFile('src/consumer.ts', `
import { X } from './source';

export function useX(): string {
  return X();
}
`);

      await fixture.writeFile('src/target.ts', `
export function other(): void {}
`);

      // When: 移動 X
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source.ts'),
          'X',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/target.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: import 應該完全改為從 target 導入
      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/consumer.ts'), 'utf-8');
      expect(consumerContent).toMatch(/import\s*\{\s*X\s*\}\s*from\s*['"]\.\/target['"]/);
      expect(consumerContent).not.toMatch(/from\s*['"]\.\/source['"]/);
    });

    it('應該處理 as 別名的 import', async () => {
      // Given: 使用別名導入
      await fixture.writeFile('src/source.ts', `
export function foo(): string {
  return 'foo';
}

export function bar(): string {
  return 'bar';
}
`);

      await fixture.writeFile('src/consumer.ts', `
import { foo as myFoo, bar } from './source';

export function use(): string {
  return myFoo() + bar();
}
`);

      await fixture.writeFile('src/target.ts', `
export function other(): void {}
`);

      // When: 移動 foo
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source.ts'),
          'foo',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/target.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/consumer.ts'), 'utf-8');

      // foo (帶別名) 應該從 target 導入
      expect(consumerContent).toMatch(/import\s*\{\s*foo\s+as\s+myFoo\s*\}\s*from\s*['"]\.\/target['"]/);

      // bar 應該仍從 source 導入
      expect(consumerContent).toMatch(/import\s*\{[^}]*bar[^}]*\}\s*from\s*['"]\.\/source['"]/);
    });
  });

  describe('Bug 3: 新檔案產生錯誤的 import', () => {
    it('新檔案不應該 import 自己要移動的成員', async () => {
      // Given: utils.ts 有 multiply 函式
      await fixture.writeFile('src/utils.ts', `
export function multiply(a: number, b: number): number {
  return a * b;
}
`);

      // When: 移動到新檔案（自動偵測檔案不存在）
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/utils.ts'),
          'multiply',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/new-math.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 新檔案不應該有 import { multiply } from './utils'
      expect(result.exitCode).toBe(0);

      const newFileContent = await fixture.memfs.readFile(fixture.getFilePath('src/new-math.ts'), 'utf-8');

      // 不應該 import 自己
      expect(newFileContent).not.toMatch(/import\s*\{[^}]*multiply[^}]*\}\s*from/);

      // 應該包含 multiply 函式定義
      expect(newFileContent).toContain('function multiply');
    });

    it('新檔案應該正確 import 成員的依賴（非自身）', async () => {
      // Given: utils.ts 有依賴其他檔案的函式
      await fixture.writeFile('src/types.ts', `
export interface Config {
  value: number;
}
`);

      await fixture.writeFile('src/utils.ts', `
import { Config } from './types';

export function processConfig(config: Config): number {
  return config.value * 2;
}

export function otherFunc(): void {}
`);

      // When: 移動 processConfig 到新檔案
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/utils.ts'),
          'processConfig',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/processor.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      const newFileContent = await fixture.memfs.readFile(fixture.getFilePath('src/processor.ts'), 'utf-8');

      // 應該包含 processConfig 函式
      expect(newFileContent).toContain('function processConfig');

      // 不應該 import processConfig 自己
      expect(newFileContent).not.toMatch(/import\s*\{[^}]*processConfig[^}]*\}\s*from/);
    });

    it('dry-run 模式應該不實際建立檔案，但執行後檔案應正確', async () => {
      // Given
      await fixture.writeFile('src/helper.ts', `
export function helperFunc(): string {
  return 'helper';
}
`);

      // When: dry-run 模式
      const dryRunResult = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/helper.ts'),
          'helperFunc',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/new-helper.ts'),
          '--dry-run',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // dry-run 成功
      expect(dryRunResult.exitCode).toBe(0);
      const dryRunOutput = JSON.parse(dryRunResult.stdout);
      expect(dryRunOutput.executed).toBe(false);

      // dry-run 不應建立新檔案
      const newFileExistsAfterDryRun = await fixture.memfs.exists(fixture.getFilePath('src/new-helper.ts'));
      expect(newFileExistsAfterDryRun).toBe(false);

      // When: 實際執行
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/helper.ts'),
          'helperFunc',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/new-helper.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 實際執行後檔案正確
      expect(result.exitCode).toBe(0);
      const newFileContent = await fixture.memfs.readFile(fixture.getFilePath('src/new-helper.ts'), 'utf-8');

      // 新檔案不應該 import 自己
      expect(newFileContent).not.toMatch(/import\s*\{[^}]*helperFunc[^}]*\}\s*from/);
      expect(newFileContent).toContain('function helperFunc');
    });
  });

  describe('Bug 4: GitHub Issue #37 - 方法插入到類別外部', () => {
    it('應該將方法插入到目標類別內部，而非類別閉合括號之後', async () => {
      // Given: 來源類別有一個方法
      await fixture.writeFile('src/notification-coordinator.ts', `
export class NotificationCoordinatorService {
  private readonly config: Config;

  sendAnomalyNotifications(): void {
    console.log('send anomaly');
  }
}
`);

      // 目標類別已有一個方法
      await fixture.writeFile('src/teams-notification.ts', `
export class TeamsNotificationService {
  constructor(private readonly config: Config) {}

  async sendNotification(message: string): Promise<void> {
    console.log(message);
  }
}
`);

      // When: 移動方法到目標類別
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/notification-coordinator.ts'),
          'sendAnomalyNotifications',
          '-p', fixture.rootPath,
          '--type', 'method',
          '--class', 'NotificationCoordinatorService',
          '--target-file', fixture.getFilePath('src/teams-notification.ts'),
          '--target-class', 'TeamsNotificationService',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 方法應該在類別內部
      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/teams-notification.ts'),
        'utf-8'
      );

      // 驗證方法存在
      expect(targetContent).toContain('sendAnomalyNotifications');

      // 驗證方法在類別內部（關鍵檢查）
      // 方法必須出現在類別閉合 } 之前
      const classEndIndex = targetContent.lastIndexOf('}');
      const methodIndex = targetContent.indexOf('sendAnomalyNotifications');
      expect(methodIndex).toBeLessThan(classEndIndex);

      // 更嚴格的驗證：計算花括號配對
      // 方法位置時，depth 應該 >= 1（在類別內）
      let depth = 0;
      let methodDepth = -1;
      for (let i = 0; i < targetContent.length; i++) {
        if (targetContent[i] === '{') {
          depth++;
        } else if (targetContent[i] === '}') {
          depth--;
        }
        if (i === methodIndex && methodDepth === -1) {
          methodDepth = depth;
        }
      }

      // 方法開始時必須在類別內（depth >= 1）
      expect(methodDepth).toBeGreaterThanOrEqual(1);
    });

    it('應該正確處理檔案開頭有包含類別名稱的註解', async () => {
      // Given: 檔案開頭有包含類別名稱的註解（這是 Issue #37 的根本原因）
      await fixture.writeFile('src/source-with-comment.ts', `
export class SourceService {
  doWork(): void {
    console.log('work');
  }
}
`);

      // 目標檔案有註解包含類別名稱
      await fixture.writeFile('src/target-with-comment.ts', `
// This file implements TargetService for notification handling
import { Config } from './config';

export class TargetService {
  constructor(private readonly config: Config) {}

  async sendMessage(msg: string): Promise<void> {
    console.log(msg);
  }
}
`);

      // When: 移動方法到目標類別
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source-with-comment.ts'),
          'doWork',
          '-p', fixture.rootPath,
          '--type', 'method',
          '--class', 'SourceService',
          '--target-file', fixture.getFilePath('src/target-with-comment.ts'),
          '--target-class', 'TargetService',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 方法應該在類別內部，不受註解影響
      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/target-with-comment.ts'),
        'utf-8'
      );

      // 驗證方法存在
      expect(targetContent).toContain('doWork');

      // 驗證方法在類別內部（關鍵檢查）
      // 找到類別定義和方法位置
      const lines = targetContent.split('\n');
      const classLine = lines.findIndex(l => /^\s*(export\s+)?class\s+TargetService/.test(l));
      const methodLine = lines.findIndex(l => l.includes('doWork'));

      // 計算類別結束位置（最後一個獨立的 }）
      let depth = 0;
      let classEndLine = -1;
      for (let i = classLine; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') {depth++;}
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              classEndLine = i;
              break;
            }
          }
        }
        if (classEndLine !== -1) {break;}
      }

      // 方法應該在類別開始之後、類別結束之前
      expect(methodLine).toBeGreaterThan(classLine);
      expect(methodLine).toBeLessThan(classEndLine);

      // 額外驗證：方法不應該出現在註解之後、import 之後
      const importLine = lines.findIndex(l => l.includes('import'));
      expect(methodLine).toBeGreaterThan(importLine);
    });

    it('應該處理類別只有 constructor 的情況', async () => {
      // Given: 來源類別有一個方法
      await fixture.writeFile('src/source-service.ts', `
export class SourceService {
  doSomething(): void {
    console.log('do something');
  }
}
`);

      // 目標類別只有 constructor（同一行的 {}）
      await fixture.writeFile('src/target-service.ts', `
export class TargetService {
  constructor(private readonly config: Config) {}
}
`);

      // When: 移動方法到目標類別
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/source-service.ts'),
          'doSomething',
          '-p', fixture.rootPath,
          '--type', 'method',
          '--class', 'SourceService',
          '--target-file', fixture.getFilePath('src/target-service.ts'),
          '--target-class', 'TargetService',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then: 方法應該在類別內部
      expect(result.exitCode).toBe(0);

      const targetContent = await fixture.memfs.readFile(
        fixture.getFilePath('src/target-service.ts'),
        'utf-8'
      );

      // 驗證方法存在
      expect(targetContent).toContain('doSomething');

      // 驗證方法在類別內部
      const lines = targetContent.split('\n');
      const classLine = lines.findIndex(l => l.includes('class TargetService'));
      const methodLine = lines.findIndex(l => l.includes('doSomething'));
      const lastBraceLine = lines.length - 1 - [...lines].reverse().findIndex(l => l.trim() === '}');

      // 方法應該在類別開始之後、類別結束之前
      expect(methodLine).toBeGreaterThan(classLine);
      expect(methodLine).toBeLessThan(lastBraceLine);
    });
  });

  describe('綜合測試：多個成員、多個 consumer', () => {
    it('應該正確處理複雜的多檔案場景', async () => {
      // Given: 複雜的檔案結構
      await fixture.writeFile('src/lib/utils.ts', `
export function alpha(): string {
  return 'alpha';
}

export function beta(): string {
  return 'beta';
}

export function gamma(): string {
  return 'gamma';
}
`);

      // 多個 consumer 檔案，各自 import 不同組合
      await fixture.writeFile('src/features/feature1.ts', `
import { alpha, beta } from '../lib/utils';

export function feature1(): string {
  return alpha() + beta();
}
`);

      await fixture.writeFile('src/features/feature2.ts', `
import { beta, gamma } from '../lib/utils';

export function feature2(): string {
  return beta() + gamma();
}
`);

      await fixture.writeFile('src/features/feature3.ts', `
import { alpha } from '../lib/utils';

export function feature3(): string {
  return alpha();
}
`);

      await fixture.writeFile('src/lib/target.ts', `
export function existing(): void {}
`);

      // When: 移動 alpha 到 target.ts
      const result = await executeCLI(
        [
          'move-member',
          fixture.getFilePath('src/lib/utils.ts'),
          'alpha',
          '-p', fixture.rootPath,
          '--target-file', fixture.getFilePath('src/lib/target.ts'),
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // Then
      expect(result.exitCode).toBe(0);

      // feature1: alpha 從 target，beta 從 utils
      const f1Content = await fixture.memfs.readFile(fixture.getFilePath('src/features/feature1.ts'), 'utf-8');
      expect(f1Content).toMatch(/import\s*\{\s*alpha\s*\}\s*from\s*['"]\.\.\/lib\/target['"]/);
      expect(f1Content).toMatch(/import\s*\{[^}]*beta[^}]*\}\s*from\s*['"]\.\.\/lib\/utils['"]/);

      // feature2: 不用 alpha，應該完全不變
      const f2Content = await fixture.memfs.readFile(fixture.getFilePath('src/features/feature2.ts'), 'utf-8');
      expect(f2Content).toMatch(/import\s*\{\s*beta,\s*gamma\s*\}\s*from\s*['"]\.\.\/lib\/utils['"]/);
      expect(f2Content).not.toContain('target');

      // feature3: 只用 alpha，import 完全改為 target
      const f3Content = await fixture.memfs.readFile(fixture.getFilePath('src/features/feature3.ts'), 'utf-8');
      expect(f3Content).toMatch(/import\s*\{\s*alpha\s*\}\s*from\s*['"]\.\.\/lib\/target['"]/);
      expect(f3Content).not.toMatch(/from\s*['"]\.\.\/lib\/utils['"]/);
    });
  });
});
