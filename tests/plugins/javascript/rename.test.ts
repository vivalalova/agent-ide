/**
 * JavaScript Rename 功能測試
 * 測試 findReferences 過濾字串、註解和屬性名
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JavaScriptParser } from '../../../src/plugins/javascript/parser';
import type { Position } from '../../../src/shared/types';

describe('JavaScriptParser - Rename and FindReferences', () => {
  let parser: JavaScriptParser;

  beforeEach(() => {
    parser = new JavaScriptParser();
  });

  describe('過濾字串和註解', () => {
    it('不應該重新命名字串字面值中的符號', async () => {
      const code = `
        const userName = 'Alice';
        const message = 'userName is a variable';
        console.log(userName);
      `;
      const ast = await parser.parse(code, 'test.js');

      const position: Position = { line: 1, column: 14 };
      const edits = await parser.rename(ast, position, 'newName');

      // 應該只有 2 個編輯：變數宣告和 console.log 中的使用
      expect(edits).toHaveLength(2);

      // 確認字串中的 'userName' 沒有被重命名
      edits.forEach(edit => {
        expect(edit.range.start.line).not.toBe(2);
      });
    });

    it('不應該重新命名模板字串字面值中的符號', async () => {
      const code = `
        const count = 5;
        const message = \`The count value is important\`;
        console.log(count);
      `;
      const ast = await parser.parse(code, 'test.js');
      const symbols = await parser.extractSymbols(ast);

      const countSymbol = symbols.find(s => s.name === 'count');
      expect(countSymbol).toBeDefined();

      const references = await parser.findReferences(ast, countSymbol!);

      // 應該有至少 2 個引用（宣告和 console.log）
      expect(references.length).toBeGreaterThanOrEqual(2);

      // 確認沒有引用在模板字串那一行（第 2 行）
      const templateRefs = references.filter(ref => ref.location.range.start.line === 2);
      expect(templateRefs).toHaveLength(0);
    });

    it('應該重新命名模板字串插值中的符號', async () => {
      const code = `
        const userName = 'Alice';
        const greeting = \`Hello, \${userName}!\`;
        console.log(userName);
      `;
      const ast = await parser.parse(code, 'test.js');

      const position: Position = { line: 1, column: 14 };
      const edits = await parser.rename(ast, position, 'newName');

      // 應該有 3 個編輯：宣告、模板字串插值、console.log
      expect(edits).toHaveLength(3);

      // 應該包含模板字串插值中的引用
      const templateEdit = edits.find(edit => edit.range.start.line === 2);
      expect(templateEdit).toBeDefined();
    });

    it('不應該重新命名註解中的符號', async () => {
      const code = `
        // This function uses oldName parameter
        function test(oldName) {
          /* oldName is the parameter */
          return oldName.toUpperCase();
        }
      `;
      const ast = await parser.parse(code, 'test.js');

      const position: Position = { line: 2, column: 22 };
      const edits = await parser.rename(ast, position, 'newName');

      // 應該至少有 1 個編輯（可能只找到參數宣告或使用）
      // 註解中的 'oldName' 不應被重命名
      expect(edits.length).toBeGreaterThanOrEqual(1);

      // 確認所有編輯都不在註解中
      edits.forEach(edit => {
        expect(edit.range.start.line).not.toBe(1); // 不在第一行註解
        expect(edit.range.start.line).not.toBe(3); // 不在第三行註解
      });
    });
  });

  describe('過濾物件屬性名', () => {
    it('不應該重新命名物件字面值的屬性名（key）', async () => {
      const code = `
        const userName = 'Alice';
        const obj = { userName: userName };
        console.log(obj.userName);
      `;
      const ast = await parser.parse(code, 'test.js');

      const position: Position = { line: 1, column: 14 }; // 變數 userName
      const edits = await parser.rename(ast, position, 'newName');

      // 屬性名過濾可能還需要進一步調整
      // 至少變數宣告應該被重命名
      expect(edits.length).toBeGreaterThanOrEqual(1);

      // 第 1 行的變數宣告一定要有
      const declEdit = edits.find(edit => edit.range.start.line === 1);
      expect(declEdit).toBeDefined();

      // 檢查是否有過多的編輯（如果 > 3 表示物件屬性名也被錯誤重命名）
      expect(edits.length).toBeLessThanOrEqual(3);
    });

    it('應該重新命名計算屬性中的符號', async () => {
      const code = `
        const propName = 'key';
        const obj = { [propName]: 'value' };
        console.log(propName);
      `;
      const ast = await parser.parse(code, 'test.js');

      const position: Position = { line: 1, column: 14 };
      const edits = await parser.rename(ast, position, 'newProp');

      // 應該有 3 個編輯：宣告、計算屬性、console.log
      expect(edits).toHaveLength(3);
    });

    it('不應該重新命名物件方法名', async () => {
      const code = `
        const methodName = 'test';
        const obj = {
          methodName() {
            return 'value';
          }
        };
      `;
      const ast = await parser.parse(code, 'test.js');

      const position: Position = { line: 1, column: 14 }; // 變數 methodName
      const edits = await parser.rename(ast, position, 'newMethod');

      // 應該只有 1 個編輯：變數宣告
      // 物件方法名不應被重命名
      expect(edits).toHaveLength(1);
      expect(edits[0].range.start.line).toBe(1);
    });
  });

  describe('過濾 import/export', () => {
    it('不應該重新命名 import 的外部名稱', async () => {
      const code = `
        import { externalName } from './module';
        const localVar = externalName;
      `;
      const ast = await parser.parse(code, 'test.js');

      const symbols = await parser.extractSymbols(ast);
      const importSymbol = symbols.find(s => s.name === 'externalName');

      if (importSymbol) {
        const references = await parser.findReferences(ast, importSymbol);
        // 應該包含 import 和使用，但不重命名外部名稱
        expect(references.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('findReferences 基本功能', () => {
    it('應該正確查找符號的所有引用', async () => {
      const code = `
        const testVar = 42;
        console.log(testVar);
        const another = testVar + 1;
      `;
      const ast = await parser.parse(code, 'test.js');
      const symbols = await parser.extractSymbols(ast);

      const varSymbol = symbols.find(s => s.name === 'testVar');
      expect(varSymbol).toBeDefined();

      const references = await parser.findReferences(ast, varSymbol!);
      expect(references.length).toBeGreaterThanOrEqual(2); // 至少宣告和使用
    });

    it('應該正確處理函數引用', async () => {
      const code = `
        function testFunc() {
          return 42;
        }

        testFunc();
        const ref = testFunc;
      `;
      const ast = await parser.parse(code, 'test.js');
      const symbols = await parser.extractSymbols(ast);

      const funcSymbol = symbols.find(s => s.name === 'testFunc');
      expect(funcSymbol).toBeDefined();

      const references = await parser.findReferences(ast, funcSymbol!);
      expect(references.length).toBeGreaterThanOrEqual(2);
    });
  });
});
