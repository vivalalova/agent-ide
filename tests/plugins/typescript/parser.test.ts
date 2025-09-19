/**
 * TypeScript Parser 測試
 * TDD 紅燈階段 - 編寫失敗的測試案例
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptParser } from '../../../src/plugins/typescript/parser';
import type { AST } from '../../../src/shared/types';

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('基本資訊', () => {
    it('應該有正確的插件名稱', () => {
      expect(parser.name).toBe('typescript');
    });

    it('應該有版本號', () => {
      expect(parser.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('應該支援 .ts 和 .tsx 副檔名', () => {
      expect(parser.supportedExtensions).toContain('.ts');
      expect(parser.supportedExtensions).toContain('.tsx');
      expect(parser.supportedExtensions).toContain('.d.ts');
    });

    it('應該支援 TypeScript 和 TSX 語言', () => {
      expect(parser.supportedLanguages).toContain('typescript');
      expect(parser.supportedLanguages).toContain('tsx');
    });
  });

  describe('程式碼解析', () => {
    it('應該能解析簡單的變數宣告', async () => {
      const code = 'const message: string = "Hello, World!";';
      const filePath = 'test.ts';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe(filePath);
      expect(ast.root).toBeDefined();
      expect(ast.root.type).toBe('SourceFile');
      expect(ast.metadata.language).toBe('typescript');
    });

    it('應該能解析類別定義', async () => {
      const code = `
        class TestClass {
          private field: string;
          constructor(value: string) {
            this.field = value;
          }
          
          public getField(): string {
            return this.field;
          }
        }
      `;
      const filePath = 'test.ts';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析介面定義', async () => {
      const code = `
        interface TestInterface {
          name: string;
          age: number;
          greet(): void;
        }
      `;
      const filePath = 'test.ts';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析泛型函式', async () => {
      const code = `
        function genericFunction<T>(arg: T): T {
          return arg;
        }
      `;
      const filePath = 'test.ts';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析 import/export 語句', async () => {
      const code = `
        import { something } from './module';
        import * as utils from '../utils';
        export { something };
        export default class DefaultClass {}
      `;
      const filePath = 'test.ts';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析裝飾器', async () => {
      const code = `
        @Component({
          selector: 'test-component'
        })
        class TestComponent {
          @Input() name: string = '';
          
          @Output() onTest = new EventEmitter();
        }
      `;
      const filePath = 'test.ts';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析 JSX/TSX', async () => {
      const code = `
        const element = <div className="test">Hello</div>;
        
        function Component(): JSX.Element {
          return <span>World</span>;
        }
      `;
      const filePath = 'test.tsx';
      
      const ast = await parser.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該能處理語法錯誤的程式碼', async () => {
      const code = 'const invalid syntax here';
      const filePath = 'test.ts';
      
      // TypeScript 編譯器能夠從語法錯誤中恢復，所以不會拋出錯誤
      const ast = await parser.parse(code, filePath);
      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe(filePath);
    });

    it('應該拋出錯誤當檔案路徑為空', async () => {
      const code = 'const valid = true;';
      
      await expect(parser.parse(code, '')).rejects.toThrow();
    });

    it('應該拋出錯誤當程式碼為空', async () => {
      const filePath = 'test.ts';
      
      await expect(parser.parse('', filePath)).rejects.toThrow();
    });
  });

  describe('驗證和清理', () => {
    it('應該通過驗證', async () => {
      const result = await parser.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('應該能正常清理資源', async () => {
      await expect(parser.dispose()).resolves.not.toThrow();
    });
  });
});