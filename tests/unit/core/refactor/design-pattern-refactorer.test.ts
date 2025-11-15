import { describe, it, expect, beforeEach } from 'vitest';
import { DesignPatternRefactorer } from '@core/refactor/design-patterns';

describe('DesignPatternRefactorer', () => {
  let refactorer: DesignPatternRefactorer;

  beforeEach(() => {
    refactorer = new DesignPatternRefactorer();
  });

  describe('applyPattern', () => {
    it('應該應用設計模式', async () => {
      const code = `class Database {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Database');

      expect(result).toBeDefined();
      expect(result.pattern).toBe('singleton');
    });

    it('應該返回錯誤當參數無效', async () => {
      const result = await refactorer.applyPattern('', '', '');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('應該返回錯誤當模式不支援', async () => {
      const code = 'class Test {}';

      const result = await refactorer.applyPattern(code, 'unsupported' as any, 'Test');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('不支援'))).toBe(true);
    });
  });

  describe('Singleton 模式重構', () => {
    it('應該將類別重構為 Singleton', async () => {
      const code = `class Database {
  constructor() {
    this.connection = null;
  }

  connect() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Database');

      expect(result.success).toBe(true);
      expect(result.modifiedClasses).toContain('Database');
      expect(result.edits.length).toBeGreaterThan(0);
    });

    it('應該產生私有建構子', async () => {
      const code = `class Config {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Config');

      expect(result.success).toBe(true);
      const edit = result.edits[0];
      expect(edit.newText).toContain('private constructor');
    });

    it('應該產生 getInstance 方法', async () => {
      const code = `class Service {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Service');

      expect(result.success).toBe(true);
      const edit = result.edits[0];
      expect(edit.newText).toContain('getInstance');
      expect(edit.newText).toContain('static getInstance');
    });

    it('應該產生靜態實例屬性', async () => {
      const code = `class Cache {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Cache');

      expect(result.success).toBe(true);
      const edit = result.edits[0];
      expect(edit.newText).toContain('private static instance');
    });

    it('應該保留原有的方法和屬性', async () => {
      const code = `class Database {
  constructor() {
    this.connection = null;
  }

  connect() {
    return this.connection;
  }

  disconnect() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Database');

      expect(result.success).toBe(true);
      const edit = result.edits[0];
      expect(edit.newText).toContain('connect');
      expect(edit.newText).toContain('disconnect');
    });

    it('應該支援 TypeScript', async () => {
      const code = `class Database {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'singleton', 'Database', config);

      expect(result.success).toBe(true);
      const edit = result.edits[0];
      expect(edit.newText).toContain(': Database');
    });

    it('應該支援 JavaScript', async () => {
      const code = `class Database {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: false,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'singleton', 'Database', config);

      expect(result.success).toBe(true);
    });

    it('應該產生文件（當配置要求時）', async () => {
      const code = `class Config {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'singleton', 'Config', config);

      expect(result.success).toBe(true);
      expect(result.documentation).toBeDefined();
      expect(result.documentation).toContain('Singleton');
    });

    it('應該處理嵌套的大括號', async () => {
      const code = `class Complex {
  constructor() {
    if (true) {
      const obj = { key: { nested: 'value' } };
    }
  }
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Complex');

      expect(result.success).toBe(true);
    });
  });

  describe('Factory 模式重構', () => {
    it('應該產生 Factory 類別', async () => {
      const code = `class Product {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'factory', 'Product');

      expect(result.success).toBe(true);
      expect(result.createdFiles).toBeDefined();
      expect(result.createdFiles!.length).toBeGreaterThan(0);
    });

    it('應該產生 create 方法', async () => {
      const code = `class Item {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'factory', 'Item');

      expect(result.success).toBe(true);
      const factoryFile = result.createdFiles![0];
      expect(factoryFile.content).toContain('create');
      expect(factoryFile.content).toContain('static create');
    });

    it('應該產生 switch 語句', async () => {
      const code = `class Service {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'factory', 'Service');

      expect(result.success).toBe(true);
      const factoryFile = result.createdFiles![0];
      expect(factoryFile.content).toContain('switch');
    });

    it('應該產生正確的檔案名稱', async () => {
      const code = `class Product {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'factory', 'Product', config);

      expect(result.success).toBe(true);
      expect(result.createdFiles![0].path).toBe('ProductFactory.ts');
    });

    it('應該支援 JavaScript 副檔名', async () => {
      const code = `class Product {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: false,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'factory', 'Product', config);

      expect(result.success).toBe(true);
      expect(result.createdFiles![0].path).toBe('ProductFactory.js');
    });

    it('應該產生警告', async () => {
      const code = `class Product {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'factory', 'Product');

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Observer 模式重構', () => {
    it('應該產生 Observer 介面和 Observable 類別', async () => {
      const code = `class Subject {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'observer', 'Subject');

      expect(result.success).toBe(true);
      expect(result.createdFiles).toBeDefined();
      expect(result.createdFiles!.length).toBe(2);
    });

    it('應該產生 addObserver 方法', async () => {
      const code = `class EventEmitter {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'observer', 'EventEmitter');

      expect(result.success).toBe(true);
      const observableFile = result.createdFiles!.find(f => f.path.includes('Observable'));
      expect(observableFile!.content).toContain('addObserver');
    });

    it('應該產生 removeObserver 方法', async () => {
      const code = `class Subject {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'observer', 'Subject');

      expect(result.success).toBe(true);
      const observableFile = result.createdFiles!.find(f => f.path.includes('Observable'));
      expect(observableFile!.content).toContain('removeObserver');
    });

    it('應該產生 notifyObservers 方法', async () => {
      const code = `class Subject {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'observer', 'Subject');

      expect(result.success).toBe(true);
      const observableFile = result.createdFiles!.find(f => f.path.includes('Observable'));
      expect(observableFile!.content).toContain('notifyObservers');
    });

    it('應該產生 TypeScript 介面', async () => {
      const code = `class Subject {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'observer', 'Subject', config);

      expect(result.success).toBe(true);
      const observerFile = result.createdFiles!.find(f => f.path.includes('Observer'));
      expect(observerFile!.content).toContain('interface Observer');
    });
  });

  describe('Strategy 模式重構', () => {
    it('應該產生 Strategy 介面和 Context 類別', async () => {
      const code = `class Processor {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'strategy', 'Processor');

      expect(result.success).toBe(true);
      expect(result.createdFiles).toBeDefined();
      expect(result.createdFiles!.length).toBe(2);
    });

    it('應該產生 Context 類別', async () => {
      const code = `class Calculator {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'strategy', 'Calculator');

      expect(result.success).toBe(true);
      const contextFile = result.createdFiles!.find(f => f.path.includes('Context'));
      expect(contextFile!.content).toContain('Context');
      expect(contextFile!.content).toContain('Calculator');
    });

    it('應該產生 setStrategy 方法', async () => {
      const code = `class Processor {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'strategy', 'Processor');

      expect(result.success).toBe(true);
      const contextFile = result.createdFiles!.find(f => f.path.includes('Context'));
      expect(contextFile!.content).toContain('setStrategy');
    });

    it('應該產生 executeStrategy 方法', async () => {
      const code = `class Processor {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'strategy', 'Processor');

      expect(result.success).toBe(true);
      const contextFile = result.createdFiles!.find(f => f.path.includes('Context'));
      expect(contextFile!.content).toContain('executeStrategy');
    });
  });

  describe('Decorator 模式重構', () => {
    it('應該返回錯誤（尚未實作）', async () => {
      const code = `class Component {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'decorator', 'Component');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getSuggestions', () => {
    it('應該返回設計模式建議', async () => {
      const code = `class Database {
  private static instance;
  static getInstance() {}
}`;

      const suggestions = await refactorer.getSuggestions(code);

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('配置選項', () => {
    it('應該支援 generateTests 配置', async () => {
      const code = `class Test {
  constructor() {}
}`;

      const config = {
        generateTests: true,
        addDocumentation: false,
        useTypeScript: true,
        preserveComments: false
      };

      const result = await refactorer.applyPattern(code, 'singleton', 'Test', config);

      expect(result.success).toBe(true);
    });

    it('應該支援 preserveComments 配置', async () => {
      const code = `class Test {
  constructor() {}
}`;

      const config = {
        generateTests: false,
        addDocumentation: false,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(code, 'singleton', 'Test', config);

      expect(result.success).toBe(true);
    });

    it('應該根據配置產生或不產生文件', async () => {
      const code = `class Test {
  constructor() {}
}`;

      const withDocs = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const withoutDocs = {
        generateTests: false,
        addDocumentation: false,
        useTypeScript: true,
        preserveComments: true
      };

      const result1 = await refactorer.applyPattern(code, 'singleton', 'Test', withDocs);
      const result2 = await refactorer.applyPattern(code, 'singleton', 'Test', withoutDocs);

      expect(result1.documentation).toBeDefined();
      expect(result2.documentation).toBeUndefined();
    });
  });

  describe('錯誤處理', () => {
    it('應該處理找不到類別的情況', async () => {
      const code = 'const x = 1;';

      const result = await refactorer.applyPattern(code, 'singleton', 'NonExistent');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('找不到類別'))).toBe(true);
    });

    it('應該處理空程式碼', async () => {
      const result = await refactorer.applyPattern('', 'singleton', 'Test');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('應該處理 null 類別名稱', async () => {
      const code = 'class Test {}';

      const result = await refactorer.applyPattern(code, 'singleton', '');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理最小化的類別', async () => {
      const code = 'class A{constructor(){}}';

      const result = await refactorer.applyPattern(code, 'singleton', 'A');

      expect(result.success).toBe(true);
    });

    it('應該處理帶註解的類別', async () => {
      const code = `/**
 * Database connection
 */
class Database {
  constructor() {}
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Database');

      expect(result.success).toBe(true);
    });

    it('應該處理帶繼承的類別', async () => {
      const code = `class Database extends Connection {
  constructor() {
    super();
  }
}`;

      const result = await refactorer.applyPattern(code, 'singleton', 'Database');

      expect(result.success).toBe(true);
    });
  });
});
