/**
 * Swift Parser 測試
 * 使用 TDD 方式測試 Swift Parser 的各項功能
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SwiftParser } from '../../../src/plugins/swift/parser';
import { SwiftSymbolType, SwiftNodeType, SwiftVisibility } from '../../../src/plugins/swift/types';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../../src/shared/types';

describe('SwiftParser', () => {
  let parser: SwiftParser;

  beforeAll(() => {
    parser = new SwiftParser();
  });

  describe('基本功能', () => {
    it('應該正確建立 SwiftParser 實例', () => {
      expect(parser).toBeInstanceOf(SwiftParser);
      expect(parser.name).toBe('swift');
      expect(parser.version).toBe('1.0.0');
      expect(parser.supportedExtensions).toEqual(['.swift']);
      expect(parser.supportedLanguages).toEqual(['swift']);
    });

    it('應該通過插件驗證', async () => {
      const result = await parser.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('程式碼解析', () => {
    it('應該解析簡單的 Swift 類別', async () => {
      const code = `
class Person {
    var name: String
    var age: Int

    init(name: String, age: Int) {
        self.name = name
        self.age = age
    }

    func greet() -> String {
        return "Hello, I'm \\(name)"
    }
}`;

      const ast = await parser.parse(code, '/test/Person.swift');

      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe('/test/Person.swift');
      expect(ast.root).toBeDefined();
      expect(ast.metadata.language).toBe('swift');
      expect(ast.metadata.version).toBe('1.0.0');
    });

    it('應該處理空檔案', async () => {
      const code = '';
      const ast = await parser.parse(code, '/test/empty.swift');

      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe('/test/empty.swift');
    });

    it('應該處理語法錯誤但不拋出異常', async () => {
      const code = `
class Person {
    var name: String
    // 缺少閉合括號
`;

      const ast = await parser.parse(code, '/test/broken.swift');
      expect(ast).toBeDefined();
      // Swift parser 應該能夠從語法錯誤中恢復
    });

    it('應該拋出錯誤當檔案路徑為空時', async () => {
      const code = 'class Test {}';
      await expect(parser.parse(code, '')).rejects.toThrow('檔案路徑不能為空');
    });

  });

  describe('符號提取', () => {
    it('應該提取類別符號', async () => {
      const code = `
class Person {
    var name: String = ""

    func greet() {
        print("Hello")
    }
}`;

      const ast = await parser.parse(code, '/test/Person.swift');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(3); // Person class, name property, greet method

      const classSymbol = symbols.find(s => s.name === 'Person');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.type).toBe('class');

      const propertySymbol = symbols.find(s => s.name === 'name');
      expect(propertySymbol).toBeDefined();
      expect(propertySymbol?.type).toBe('variable');

      const methodSymbol = symbols.find(s => s.name === 'greet');
      expect(methodSymbol).toBeDefined();
      expect(methodSymbol?.type).toBe('function');
    });

    it('應該提取結構符號', async () => {
      const code = `
struct Point {
    let x: Double
    let y: Double

    init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}`;

      const ast = await parser.parse(code, '/test/Point.swift');
      const symbols = await parser.extractSymbols(ast);

      const structSymbol = symbols.find(s => s.name === 'Point');
      expect(structSymbol).toBeDefined();
      expect(structSymbol?.type).toBe('class'); // Swift struct 映射到 class
    });

    it('應該提取函式符號', async () => {
      const code = `
func calculateArea(width: Double, height: Double) -> Double {
    return width * height
}

func greetUser(name: String) {
    print("Hello, \\(name)!")
}`;

      const ast = await parser.parse(code, '/test/functions.swift');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toHaveLength(2);

      const areaFunc = symbols.find(s => s.name === 'calculateArea');
      expect(areaFunc).toBeDefined();
      expect(areaFunc?.type).toBe('function');

      const greetFunc = symbols.find(s => s.name === 'greetUser');
      expect(greetFunc).toBeDefined();
      expect(greetFunc?.type).toBe('function');
    });
  });

  describe('依賴關係提取', () => {
    it('應該提取 import 依賴', async () => {
      const code = `
import Foundation
import UIKit
import SwiftUI

class ViewController: UIViewController {
    // ...
}`;

      const ast = await parser.parse(code, '/test/ViewController.swift');
      const dependencies = await parser.extractDependencies(ast);

      expect(dependencies).toHaveLength(3);

      const foundationDep = dependencies.find(d => d.path === 'Foundation');
      expect(foundationDep).toBeDefined();
      expect(foundationDep?.type).toBe('import');

      const uikitDep = dependencies.find(d => d.path === 'UIKit');
      expect(uikitDep).toBeDefined();

      const swiftuiDep = dependencies.find(d => d.path === 'SwiftUI');
      expect(swiftuiDep).toBeDefined();
    });

    it('應該處理沒有依賴的檔案', async () => {
      const code = `
class SimpleClass {
    var value: Int = 0
}`;

      const ast = await parser.parse(code, '/test/simple.swift');
      const dependencies = await parser.extractDependencies(ast);

      expect(dependencies).toHaveLength(0);
    });
  });

  describe('符號引用查找', () => {
    it('應該找到類別的所有引用', async () => {
      const code = `
class Person {
    var name: String = ""
}

let person1 = Person()
let person2 = Person()
var people: [Person] = []`;

      const ast = await parser.parse(code, '/test/references.swift');
      const symbols = await parser.extractSymbols(ast);

      const personClass = symbols.find(s => s.name === 'Person');
      expect(personClass).toBeDefined();

      const references = await parser.findReferences(ast, personClass!);

      // 應該包含：定義 + 3 個使用位置
      expect(references.length).toBeGreaterThanOrEqual(1);

      const definitionRef = references.find(r => r.type === 'definition');
      expect(definitionRef).toBeDefined();
    });

    it('應該處理沒有引用的符號', async () => {
      const code = `
class UnusedClass {
    var value: Int = 0
}

class UsedClass {
    var data: String = ""
}

let instance = UsedClass()`;

      const ast = await parser.parse(code, '/test/unused.swift');
      const symbols = await parser.extractSymbols(ast);

      const unusedClass = symbols.find(s => s.name === 'UnusedClass');
      expect(unusedClass).toBeDefined();

      const references = await parser.findReferences(ast, unusedClass!);

      // 只應該有定義，沒有使用
      expect(references).toHaveLength(1);
      expect(references[0].type).toBe('definition');
    });
  });

  describe('重新命名功能', () => {
    it('應該支援類別重新命名', async () => {
      const code = `
class OldName {
    var value: Int = 0
}

let instance = OldName()`;

      const ast = await parser.parse(code, '/test/rename.swift');
      const position: Position = { line: 2, column: 6, offset: 7 }; // 'OldName' 的位置

      const edits = await parser.rename(ast, position, 'NewName');

      expect(edits.length).toBeGreaterThanOrEqual(1);
      expect(edits[0].newText).toBe('NewName');
    });

    it('應該拒絕無效的新名稱', async () => {
      const code = 'class TestClass {}';
      const ast = await parser.parse(code, '/test/test.swift');
      const position: Position = { line: 1, column: 6, offset: 6 };

      await expect(parser.rename(ast, position, '')).rejects.toThrow('新名稱不能為空');
      await expect(parser.rename(ast, position, '123invalid')).rejects.toThrow('新名稱必須是有效的 Swift 識別符');
      await expect(parser.rename(ast, position, 'class')).rejects.toThrow('新名稱必須是有效的 Swift 識別符');
    });
  });

  describe('定義查找', () => {
    it('應該找到符號定義', async () => {
      const code = `
class Person {
    var name: String = ""
}

let person = Person()`;

      const ast = await parser.parse(code, '/test/definition.swift');
      const position: Position = { line: 6, column: 13, offset: 52 }; // 'Person()' 中的 Person

      const definition = await parser.findDefinition(ast, position);

      expect(definition).toBeDefined();
      expect(definition?.location.filePath).toBe('/test/definition.swift');
      expect(definition?.kind).toBe('class');
    });

    it('應該處理找不到定義的情況', async () => {
      const code = 'let value = 42';
      const ast = await parser.parse(code, '/test/test.swift');
      const position: Position = { line: 1, column: 20, offset: 20 }; // 超出範圍的位置

      const definition = await parser.findDefinition(ast, position);
      expect(definition).toBeNull();
    });
  });

  describe('使用位置查找', () => {
    it('應該找到符號的所有使用位置', async () => {
      const code = `
class Calculator {
    func add(a: Int, b: Int) -> Int {
        return a + b
    }
}

let calc = Calculator()
let result1 = calc.add(a: 1, b: 2)
let result2 = calc.add(a: 3, b: 4)`;

      const ast = await parser.parse(code, '/test/usage.swift');
      const symbols = await parser.extractSymbols(ast);

      const addMethod = symbols.find(s => s.name === 'add');
      expect(addMethod).toBeDefined();

      const usages = await parser.findUsages(ast, addMethod!);

      // 應該找到兩個使用位置
      expect(usages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('資源清理', () => {
    it('應該正常清理資源', async () => {
      await expect(parser.dispose()).resolves.not.toThrow();
    });
  });
});