/**
 * Rename 模組邊界條件和異常處理參數化測試
 * 測試重新命名操作在各種極端條件下的行為
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface RenameResult {
  success: boolean;
  affectedFiles: string[];
  changes: Array<{ file: string; line: number; oldText: string; newText: string }>;
  error?: string;
}

// 模擬重新命名引擎
class RenameEngine {
  async rename(files: string[], oldName: string, newName: string): Promise<RenameResult> {
    // 參數驗證
    if (!Array.isArray(files)) {
      return { success: false, affectedFiles: [], changes: [], error: '檔案列表必須是陣列' };
    }

    if (typeof oldName !== 'string') {
      return { success: false, affectedFiles: [], changes: [], error: '舊名稱必須是字串' };
    }

    if (typeof newName !== 'string') {
      return { success: false, affectedFiles: [], changes: [], error: '新名稱必須是字串' };
    }

    if (oldName.trim().length === 0) {
      return { success: false, affectedFiles: [], changes: [], error: '舊名稱不能為空' };
    }

    if (newName.trim().length === 0) {
      return { success: false, affectedFiles: [], changes: [], error: '新名稱不能為空' };
    }

    if (oldName === newName) {
      return { success: false, affectedFiles: [], changes: [], error: '新舊名稱不能相同' };
    }

    // 驗證名稱格式
    if (!this.isValidIdentifier(oldName)) {
      return { success: false, affectedFiles: [], changes: [], error: '舊名稱不是有效識別符' };
    }

    if (!this.isValidIdentifier(newName)) {
      return { success: false, affectedFiles: [], changes: [], error: '新名稱不是有效識別符' };
    }

    try {
      const changes: RenameResult['changes'] = [];
      const affectedFiles: string[] = [];

      for (const file of files) {
        if (typeof file !== 'string') {
          return { success: false, affectedFiles: [], changes: [], error: `無效的檔案路徑: ${file}` };
        }

        const fileChanges = await this.processFile(file, oldName, newName);
        if (fileChanges.length > 0) {
          changes.push(...fileChanges);
          affectedFiles.push(file);
        }
      }

      return {
        success: true,
        affectedFiles,
        changes
      };
    } catch (error) {
      return {
        success: false,
        affectedFiles: [],
        changes: [],
        error: (error as Error).message
      };
    }
  }

  private async processFile(filePath: string, oldName: string, newName: string): Promise<RenameResult['changes']> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const changes: RenameResult['changes'] = [];

      lines.forEach((line, index) => {
        const escapedName = this.escapeRegex(oldName);

        // 簡單地尋找所有出現的地方
        const matches = [];
        let match;
        const simpleRegex = new RegExp(escapedName, 'g');

        while ((match = simpleRegex.exec(line)) !== null) {
          // 檢查前後字符是否為標識符字符
          const beforeChar = match.index > 0 ? line[match.index - 1] : ' ';
          const afterChar = match.index + match[0].length < line.length ? line[match.index + match[0].length] : ' ';

          const isWordBoundary =
            !/[a-zA-Z0-9_$]/.test(beforeChar) &&
            !/[a-zA-Z0-9_$]/.test(afterChar);

          if (isWordBoundary) {
            matches.push(match);
          }
        }

        if (matches.length > 0) {
          // 從後往前替換，避免位置偏移
          let newLine = line;
          for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];
            newLine = newLine.substring(0, m.index) + newName + newLine.substring(m.index + m[0].length);
          }

          // 為每個匹配創建一個變更記錄
          for (const match of matches) {
            changes.push({
              file: filePath,
              line: index + 1,
              oldText: line,
              newText: newLine
            });
          }
        }
      });

      return changes;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`檔案不存在: ${filePath}`);
      }
      throw new Error(`無法處理檔案 ${filePath}: ${(error as Error).message}`);
    }
  }

  private isValidIdentifier(name: string): boolean {
    // 簡化的識別符驗證
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findReferences(files: string[], symbol: string, options: { includeDeclaration?: boolean } = {}): Promise<Array<{ file: string; line: number; column: number; content: string }>> {
    if (!Array.isArray(files)) {
      throw new Error('檔案列表必須是陣列');
    }

    if (typeof symbol !== 'string') {
      throw new Error('符號必須是字串');
    }

    if (symbol.trim().length === 0) {
      throw new Error('符號不能為空');
    }

    const references: Array<{ file: string; line: number; column: number; content: string }> = [];

    for (const file of files) {
      if (typeof file !== 'string') {
        throw new Error(`無效的檔案路徑: ${file}`);
      }

      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, lineIndex) => {
          let columnIndex = line.indexOf(symbol);
          while (columnIndex !== -1) {
            references.push({
              file,
              line: lineIndex + 1,
              column: columnIndex + 1,
              content: line
            });
            columnIndex = line.indexOf(symbol, columnIndex + 1);
          }
        });
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`檔案不存在: ${file}`);
        }
        throw error;
      }
    }

    return references;
  }
}

describe('Rename 模組邊界條件測試', () => {
  let testDir: string;
  let testFiles: string[];
  let renameEngine: RenameEngine;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-rename-edge-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testFiles = await createTestFiles(testDir);
    renameEngine = new RenameEngine();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理錯誤
    }
  });

  describe('參數驗證測試', () => {
    it.each([
      // [描述, 檔案列表, 舊名稱, 新名稱, 預期錯誤]
      ['null 檔案列表', null, 'oldName', 'newName', '檔案列表必須是陣列'],
      ['undefined 檔案列表', undefined, 'oldName', 'newName', '檔案列表必須是陣列'],
      ['字串檔案列表', '/path/file.ts', 'oldName', 'newName', '檔案列表必須是陣列'],
      ['null 舊名稱', [], null, 'newName', '舊名稱必須是字串'],
      ['undefined 舊名稱', [], undefined, 'newName', '舊名稱必須是字串'],
      ['數字舊名稱', [], 123, 'newName', '舊名稱必須是字串'],
      ['null 新名稱', [], 'oldName', null, '新名稱必須是字串'],
      ['undefined 新名稱', [], 'oldName', undefined, '新名稱必須是字串'],
      ['數字新名稱', [], 'oldName', 123, '新名稱必須是字串'],
    ])('應該驗證參數類型：%s', withMemoryOptimization(async (description, files, oldName, newName, expectedError) => {
      const result = await renameEngine.rename(files as any, oldName as any, newName as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
      expect(result.affectedFiles).toEqual([]);
      expect(result.changes).toEqual([]);
    }, { testName: 'rename-param-type-test' }));

    it.each([
      ['空字串舊名稱', [], '', 'newName', '舊名稱不能為空'],
      ['僅空白舊名稱', [], '   \t\n  ', 'newName', '舊名稱不能為空'],
      ['空字串新名稱', [], 'oldName', '', '新名稱不能為空'],
      ['僅空白新名稱', [], 'oldName', '   \t\n  ', '新名稱不能為空'],
      ['相同名稱', [], 'sameName', 'sameName', '新舊名稱不能相同'],
    ])('應該驗證參數內容：%s', withMemoryOptimization(async (description, files, oldName, newName, expectedError) => {
      const result = await renameEngine.rename(files, oldName, newName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'rename-param-content-test' }));

    it.each([
      ['數字開頭', 'validName', '1invalidName', '新名稱不是有效識別符'],
      ['包含空格', 'validName', 'invalid name', '新名稱不是有效識別符'],
      ['包含特殊字符', 'validName', 'invalid-name', '新名稱不是有效識別符'],
      ['包含中文', 'validName', '無效名稱', '新名稱不是有效識別符'],
      ['舊名稱無效', '1invalid', 'newName', '舊名稱不是有效識別符'],
    ])('應該驗證識別符格式：%s', withMemoryOptimization(async (description, oldName, newName, expectedError) => {
      const result = await renameEngine.rename([], oldName, newName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
    }, { testName: 'rename-identifier-test' }));

    it.each([
      ['單字符', 'a', 'b'],
      ['駝峰命名', 'oldValue', 'newValue'],
      ['底線分隔', 'old_value', 'new_value'],
      ['美元符號', '$oldValue', '$newValue'],
      ['大寫', 'OLD_CONSTANT', 'NEW_CONSTANT'],
      ['數字結尾', 'value1', 'value2'],
    ])('應該接受有效識別符：%s', withMemoryOptimization(async (description, oldName, newName) => {
      const result = await renameEngine.rename([], oldName, newName);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    }, { testName: 'rename-valid-identifier-test' }));
  });

  describe('檔案處理邊界測試', () => {
    it.each([
      ['包含 null 檔案', (files: string[]) => [files[0], null], '無效的檔案路徑'],
      ['包含 undefined 檔案', (files: string[]) => [files[0], undefined], '無效的檔案路徑'],
      ['包含數字檔案', (files: string[]) => [files[0], 123], '無效的檔案路徑'],
      ['包含物件檔案', (files: string[]) => [files[0], { path: '/test' }], '無效的檔案路徑'],
    ])('應該驗證檔案路徑：%s', withMemoryOptimization(async (description, getFiles, expectedError) => {
      const files = getFiles(testFiles);
      const result = await renameEngine.rename(files as any, 'oldName', 'newName');

      expect(result.success).toBe(false);
      expect(result.error).toContain(expectedError);
    }, { testName: 'rename-file-path-test' }));

    it('應該處理不存在的檔案', withMemoryOptimization(async () => {
      const nonExistentFile = join(testDir, 'nonexistent.ts');

      const result = await renameEngine.rename([nonExistentFile], 'oldName', 'newName');

      expect(result.success).toBe(false);
      expect(result.error).toContain('檔案不存在');
    }, { testName: 'rename-nonexistent-file' }));

    it('應該處理空檔案列表', withMemoryOptimization(async () => {
      const result = await renameEngine.rename([], 'oldName', 'newName');

      expect(result.success).toBe(true);
      expect(result.affectedFiles).toEqual([]);
      expect(result.changes).toEqual([]);
    }, { testName: 'rename-empty-file-list' }));

    it('應該處理空檔案', withMemoryOptimization(async () => {
      const emptyFile = join(testDir, 'empty.ts');
      await fs.writeFile(emptyFile, '');

      const result = await renameEngine.rename([emptyFile], 'oldName', 'newName');

      expect(result.success).toBe(true);
      expect(result.affectedFiles).not.toContain(emptyFile);
      expect(result.changes).toEqual([]);

      await fs.unlink(emptyFile);
    }, { testName: 'rename-empty-file' }));

    it('應該處理大檔案', withMemoryOptimization(async () => {
      const largeContent = Array.from({ length: 10000 }, (_, i) =>
        `const variable${i} = ${i}; // line ${i}`
      ).join('\n');

      const largeFile = join(testDir, 'large.ts');
      await fs.writeFile(largeFile, largeContent);

      const result = await renameEngine.rename([largeFile], 'variable1000', 'renamedVariable');

      expect(result.success).toBe(true);

      await fs.unlink(largeFile);
    }, { testName: 'rename-large-file', timeout: 10000 }));
  });

  describe('引用查找邊界測試', () => {
    it.each([
      ['null 檔案列表', null, 'symbol', '檔案列表必須是陣列'],
      ['null 符號', [], null, '符號必須是字串'],
      ['empty 符號', [], '', '符號不能為空'],
      ['空白符號', [], '   ', '符號不能為空'],
    ])('應該驗證查找參數：%s', withMemoryOptimization(async (description, files, symbol, expectedError) => {
      await expect(renameEngine.findReferences(files as any, symbol as any)).rejects.toThrow(expectedError);
    }, { testName: 'find-ref-param-test' }));

    it('應該處理無匹配的符號', withMemoryOptimization(async () => {
      const references = await renameEngine.findReferences(testFiles, 'nonExistentSymbol');

      expect(references).toEqual([]);
    }, { testName: 'find-ref-no-match' }));

    it('應該處理多個匹配', withMemoryOptimization(async () => {
      const testFile = join(testDir, 'multi-match.ts');
      await fs.writeFile(testFile, `
function test() {
  const test = 1;
  return test;
}
      `.trim());

      const references = await renameEngine.findReferences([testFile], 'test');

      expect(references.length).toBe(3); // function name, const name, return variable
      references.forEach(ref => {
        expect(ref.file).toBe(testFile);
        expect(typeof ref.line).toBe('number');
        expect(typeof ref.column).toBe('number');
        expect(typeof ref.content).toBe('string');
      });

      await fs.unlink(testFile);
    }, { testName: 'find-ref-multiple-match' }));
  });

  describe('極端情況測試', () => {
    it('應該處理特殊字符的重新命名', withMemoryOptimization(async () => {
      const testFile = join(testDir, 'special-chars.ts');
      await fs.writeFile(testFile, 'const $special_name123 = "value";');

      const result = await renameEngine.rename([testFile], '$special_name123', '$new_special_name456');

      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(1);

      await fs.unlink(testFile);
    }, { testName: 'rename-special-chars' }));

    it('應該處理正則表達式特殊字符', withMemoryOptimization(async () => {
      const testFile = join(testDir, 'regex-chars.ts');
      await fs.writeFile(testFile, 'const $dollar = 1;\nconst regex_test$ = $dollar;');

      const result = await renameEngine.rename([testFile], '$dollar', '$newDollar');

      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(2); // 兩處使用

      await fs.unlink(testFile);
    }, { testName: 'rename-regex-special' }));

    it('應該處理並發重新命名請求', withMemoryOptimization(async () => {
      const operations = [
        { old: 'testVar1', new: 'newVar1' },
        { old: 'testVar2', new: 'newVar2' },
        { old: 'testVar3', new: 'newVar3' }
      ];

      const results = await Promise.all(
        operations.map(op => renameEngine.rename(testFiles, op.old, op.new))
      );

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });
    }, { testName: 'rename-concurrent' }));

    it('應該處理同一檔案的多行匹配', withMemoryOptimization(async () => {
      const multiLineFile = join(testDir, 'multi-line.ts');
      const content = `
function duplicateName() {
  const duplicateName = 1;
  console.log(duplicateName);
  return duplicateName + duplicateName;
}
      `.trim();
      await fs.writeFile(multiLineFile, content);

      const result = await renameEngine.rename([multiLineFile], 'duplicateName', 'uniqueName');

      expect(result.success).toBe(true);
      expect(result.changes.length).toBe(5); // function name + 4 usages
      expect(result.affectedFiles).toContain(multiLineFile);

      await fs.unlink(multiLineFile);
    }, { testName: 'rename-multi-line-match' }));
  });
});

// 輔助函數
async function createTestFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];

  const testContents = [
    `// 測試檔案 1 - 函式和變數
function testFunction() {
  const testVar = 'value';
  return testVar;
}

class TestClass {
  private testProperty: string;

  constructor() {
    this.testProperty = 'test';
  }
}`,
    `// 測試檔案 2 - 介面和型別
interface TestInterface {
  testMethod(): void;
  testProperty: string;
}

type TestType = {
  testField: number;
};

const testConstant = 42;`,
    `// 測試檔案 3 - 無符號檔案
const someValue = 'no target symbols here';
function someFunction() {
  return someValue;
}`,
    `// 測試檔案 4 - 混合符號
import { testImport } from './other';

export const testVar1 = 'value1';
export const testVar2 = 'value2';
export const testVar3 = 'value3';

function processTest() {
  console.log(testVar1, testVar2, testVar3);
}`
  ];

  for (let i = 0; i < testContents.length; i++) {
    const filePath = join(baseDir, `test-${i + 1}.ts`);
    await fs.writeFile(filePath, testContents[i]);
    files.push(filePath);
  }

  return files;
}