/**
 * TypeScript Rename 功能測試
 * TDD 紅燈階段 - 編寫失敗的測試案例
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptParser } from '../../../src/plugins/typescript/parser';
import type { Position } from '../../../src/shared/types';

describe('TypeScriptParser - Rename (暫時跳過)', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('變數重新命名', () => {
    it('應該能重新命名區域變數', async () => {
      const code = `
        function testFunction() {
          const oldName = 'value';
          console.log(oldName);
          return oldName.toUpperCase();
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      // 找到 oldName 變數宣告的位置
      const position: Position = { line: 2, column: 16 }; // const oldName 的位置
      const edits = await parser.rename(ast, position, 'newName');
      
      expect(edits).toHaveLength(3); // 宣告 + 兩次使用
      
      // 檢查所有編輯都是在同一個檔案
      edits.forEach(edit => {
        expect(edit.filePath).toBe('test.ts');
        expect(edit.editType).toBe('rename');
        expect(edit.newText).toBe('newName');
      });
    });

    it('應該能重新命名函式參數', async () => {
      const code = `
        function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }
        
        const result = greet('World');
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 1, column: 23 }; // 參數 name 的位置
      const edits = await parser.rename(ast, position, 'userName');
      
      expect(edits).toHaveLength(2); // 參數宣告 + 函式內使用
      
      // 檢查不會影響函式呼叫
      const callEdit = edits.find(edit => 
        edit.range.start.line === 4 && edit.range.start.column > 20
      );
      expect(callEdit).toBeUndefined(); // 不應該重新命名函式呼叫中的字串
    });
  });

  describe('函式重新命名', () => {
    it('應該能重新命名函式宣告', async () => {
      const code = `
        function oldFunction(): void {
          console.log('test');
        }
        
        oldFunction();
        const ref = oldFunction;
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 1, column: 17 }; // function oldFunction 的位置
      const edits = await parser.rename(ast, position, 'newFunction');
      
      expect(edits).toHaveLength(3); // 宣告 + 呼叫 + 引用
      edits.forEach(edit => {
        expect(edit.newText).toBe('newFunction');
      });
    });

    it('應該能重新命名方法', async () => {
      const code = `
        class TestClass {
          oldMethod(): void {
            this.oldMethod();
          }
        }
        
        const instance = new TestClass();
        instance.oldMethod();
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 2, column: 10 }; // oldMethod 方法的位置
      const edits = await parser.rename(ast, position, 'newMethod');
      
      expect(edits).toHaveLength(3); // 宣告 + this.呼叫 + instance.呼叫
      edits.forEach(edit => {
        expect(edit.newText).toBe('newMethod');
      });
    });
  });

  describe('類別重新命名', () => {
    it('應該能重新命名類別', async () => {
      const code = `
        class OldClass {
          constructor() {}
        }
        
        const instance = new OldClass();
        const ref: OldClass = instance;
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 1, column: 14 }; // class OldClass 的位置
      const edits = await parser.rename(ast, position, 'NewClass');
      
      expect(edits).toHaveLength(3); // 宣告 + new 呼叫 + 型別註解
      edits.forEach(edit => {
        expect(edit.newText).toBe('NewClass');
      });
    });

    it('應該能重新命名類別屬性', async () => {
      const code = `
        class TestClass {
          private oldProperty: string = '';
          
          constructor() {
            this.oldProperty = 'value';
          }
          
          getProperty(): string {
            return this.oldProperty;
          }
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 2, column: 18 }; // oldProperty 屬性的位置
      const edits = await parser.rename(ast, position, 'newProperty');
      
      expect(edits).toHaveLength(3); // 宣告 + constructor 使用 + getter 使用
      edits.forEach(edit => {
        expect(edit.newText).toBe('newProperty');
      });
    });
  });

  describe('介面重新命名', () => {
    it('應該能重新命名介面', async () => {
      const code = `
        interface OldInterface {
          name: string;
        }
        
        class Implementation implements OldInterface {
          name: string = '';
        }
        
        const obj: OldInterface = { name: 'test' };
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 1, column: 19 }; // interface OldInterface 的位置
      const edits = await parser.rename(ast, position, 'NewInterface');
      
      expect(edits).toHaveLength(3); // 宣告 + implements + 型別註解
      edits.forEach(edit => {
        expect(edit.newText).toBe('NewInterface');
      });
    });

    it('應該能重新命名介面屬性', async () => {
      const code = `
        interface TestInterface {
          oldProperty: string;
          method(): void;
        }
        
        const obj: TestInterface = {
          oldProperty: 'value',
          method() {}
        };
        
        console.log(obj.oldProperty);
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 2, column: 10 }; // oldProperty 屬性的位置
      const edits = await parser.rename(ast, position, 'newProperty');
      
      expect(edits).toHaveLength(3); // 介面宣告 + 物件字面值 + 屬性存取
      edits.forEach(edit => {
        expect(edit.newText).toBe('newProperty');
      });
    });
  });

  describe('型別重新命名', () => {
    it('應該能重新命名型別別名', async () => {
      const code = `
        type OldType = string | number;
        
        function useType(param: OldType): OldType {
          return param;
        }
        
        const value: OldType = 'test';
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 1, column: 13 }; // type OldType 的位置
      const edits = await parser.rename(ast, position, 'NewType');
      
      expect(edits).toHaveLength(4); // 宣告 + 參數型別 + 返回型別 + 變數型別
      edits.forEach(edit => {
        expect(edit.newText).toBe('NewType');
      });
    });
  });

  describe('泛型重新命名', () => {
    it('應該能重新命名泛型參數', async () => {
      const code = `
        function genericFunction<T>(arg: T): T {
          return arg;
        }
        
        interface GenericInterface<T> {
          value: T;
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 1, column: 33 }; // 函式泛型 T 的位置
      const edits = await parser.rename(ast, position, 'U');
      
      expect(edits).toHaveLength(3); // 宣告 + 參數型別 + 返回型別
      edits.forEach(edit => {
        expect(edit.newText).toBe('U');
      });
      
      // 不應該影響介面中的 T
      const interfaceEdits = edits.filter(edit => 
        edit.range.start.line >= 5
      );
      expect(interfaceEdits).toHaveLength(0);
    });
  });

  describe('跨作用域重新命名', () => {
    it('應該不會重新命名不同作用域的同名變數', async () => {
      const code = `
        function func1() {
          const name = 'func1';
          return name;
        }
        
        function func2() {
          const name = 'func2';
          return name;
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 2, column: 16 }; // func1 中的 name
      const edits = await parser.rename(ast, position, 'newName');
      
      expect(edits).toHaveLength(2); // 只有 func1 中的宣告和使用
      
      // 檢查沒有影響 func2 中的 name
      const func2Edits = edits.filter(edit => 
        edit.range.start.line >= 7
      );
      expect(func2Edits).toHaveLength(0);
    });

    it('應該正確處理變數遮蔽', async () => {
      const code = `
        const name = 'global';
        
        function test() {
          const name = 'local';
          console.log(name);
        }
        
        console.log(name);
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 4, column: 16 }; // 區域變數 name
      const edits = await parser.rename(ast, position, 'localName');
      
      expect(edits).toHaveLength(2); // 區域變數的宣告和使用
      
      // 檢查沒有影響全域變數
      const globalEdit = edits.find(edit => 
        edit.range.start.line === 1
      );
      expect(globalEdit).toBeUndefined();
    });
  });

  describe('錯誤處理', () => {
    it('應該拋出錯誤當位置無效', async () => {
      const code = `const valid = true;`;
      const ast = await parser.parse(code, 'test.ts');
      
      const invalidPosition: Position = { line: 100, column: 100 };
      
      await expect(
        parser.rename(ast, invalidPosition, 'newName')
      ).rejects.toThrow();
    });

    it('應該拋出錯誤當新名稱為空', async () => {
      const code = `const oldName = true;`;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 0, column: 6 };
      
      await expect(
        parser.rename(ast, position, '')
      ).rejects.toThrow();
    });

    it('應該拋出錯誤當新名稱無效', async () => {
      const code = `const oldName = true;`;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 0, column: 6 };
      
      await expect(
        parser.rename(ast, position, '123invalid')
      ).rejects.toThrow();
    });

    it('應該拋出錯誤當位置不在符號上', async () => {
      const code = `const name = 'value';`;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 0, column: 10 }; // 在 = 符號上
      
      await expect(
        parser.rename(ast, position, 'newName')
      ).rejects.toThrow();
    });
  });

  describe('Find References 和 Find Usages', () => {
    it('應該能查找符號的所有引用', async () => {
      const code = `
        function testFunc(): void {}
        
        testFunc();
        const ref = testFunc;
        
        class TestClass {
          method() {
            testFunc();
          }
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const funcSymbol = symbols.find(s => s.name === 'testFunc');
      expect(funcSymbol).toBeDefined();
      
      const references = await parser.findReferences(ast, funcSymbol!);
      expect(references).toHaveLength(4); // 宣告 + 3個使用
    });

    it('應該能查找定義', async () => {
      const code = `
        function testFunc(): void {}
        testFunc();
      `;
      const ast = await parser.parse(code, 'test.ts');
      
      const position: Position = { line: 2, column: 8 }; // 呼叫位置
      const definition = await parser.findDefinition(ast, position);
      
      expect(definition).toBeDefined();
      expect(definition!.kind).toBe('function');
      expect(definition!.location.range.start.line).toBe(1);
    });

    it('應該能查找所有使用位置', async () => {
      const code = `
        const value = 42;
        console.log(value);
        const another = value + 1;
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const valueSymbol = symbols.find(s => s.name === 'value');
      expect(valueSymbol).toBeDefined();
      
      const usages = await parser.findUsages(ast, valueSymbol!);
      expect(usages).toHaveLength(2); // 兩次使用（不包含宣告）
    });
  });
});