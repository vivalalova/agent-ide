import { describe, it, expect, beforeEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';
import {
  DesignPatternRefactorer,
  DesignPatternAnalyzer,
  type PatternRefactorResult,
  type PatternRefactorConfig,
  type DesignPattern,
  type PatternSuggestion
} from '../../../src/core/refactor/design-patterns';

/**
 * 設計模式重構測試
 * 測試將程式碼重構為設計模式的功能
 */

describe('設計模式重構', () => {
  let refactorer: DesignPatternRefactorer;
  let analyzer: DesignPatternAnalyzer;

  beforeEach(() => {
    refactorer = new DesignPatternRefactorer();
    analyzer = new DesignPatternAnalyzer();
  });

  describe('設計模式分析', () => {
    it('應該能識別 Singleton 模式的適用場景', withMemoryOptimization(async () => {
      const code = `
        class DatabaseConnection {
          static instance = null;

          static getInstance() {
            if (!DatabaseConnection.instance) {
              DatabaseConnection.instance = new DatabaseConnection();
            }
            return DatabaseConnection.instance;
          }

          connect() {
            // 連接資料庫
          }
        }
      `;

      const suggestions = analyzer.analyzeSuggestions(code);

      const singletonSuggestion = suggestions.find(s => s.pattern === 'singleton');
      expect(singletonSuggestion).toBeDefined();
      expect(singletonSuggestion!.confidence).toBeGreaterThan(0.6);
      expect(singletonSuggestion!.benefits).toContain('確保全域只有一個實例');
    }, { testName: 'analyze-singleton-pattern' }));

    it('應該能識別 Factory 模式的適用場景', withMemoryOptimization(async () => {
      const code = `
        function createVehicle(type) {
          switch(type) {
            case 'car':
              return new Car();
            case 'truck':
              return new Truck();
            case 'bike':
              return new Bike();
            default:
              throw new Error('Unknown vehicle type');
          }
        }

        function createAnimal(species) {
          if (species === 'dog') return new Dog();
          if (species === 'cat') return new Cat();
          if (species === 'bird') return new Bird();
        }
      `;

      const suggestions = analyzer.analyzeSuggestions(code);

      const factorySuggestion = suggestions.find(s => s.pattern === 'factory');
      expect(factorySuggestion).toBeDefined();
      expect(factorySuggestion!.confidence).toBeGreaterThan(0.5);
      expect(factorySuggestion!.reason).toContain('創建');
    }, { testName: 'analyze-factory-pattern' }));

    it('應該能識別 Observer 模式的適用場景', withMemoryOptimization(async () => {
      const code = `
        class EventEmitter {
          constructor() {
            this.listeners = {};
          }

          addEventListener(event, callback) {
            if (!this.listeners[event]) {
              this.listeners[event] = [];
            }
            this.listeners[event].push(callback);
          }

          emit(event, data) {
            if (this.listeners[event]) {
              this.listeners[event].forEach(cb => cb(data));
            }
          }

          removeEventListener(event, callback) {
            if (this.listeners[event]) {
              this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
            }
          }
        }
      `;

      const suggestions = analyzer.analyzeSuggestions(code);

      const observerSuggestion = suggestions.find(s => s.pattern === 'observer');
      expect(observerSuggestion).toBeDefined();
      expect(observerSuggestion!.confidence).toBeGreaterThan(0.5);
      expect(observerSuggestion!.benefits).toContain('鬆耦合的事件處理');
    }, { testName: 'analyze-observer-pattern' }));

    it('應該能識別 Strategy 模式的適用場景', withMemoryOptimization(async () => {
      const code = `
        function calculatePrice(type, amount) {
          if (type === 'regular') {
            return amount * 1.0;
          } else if (type === 'premium') {
            return amount * 0.8;
          } else if (type === 'vip') {
            return amount * 0.5;
          } else if (type === 'student') {
            return amount * 0.7;
          } else if (type === 'senior') {
            return amount * 0.6;
          }
        }

        function processPayment(method) {
          switch(method) {
            case 'credit':
              // 100+ lines of credit card processing
              break;
            case 'debit':
              // 100+ lines of debit card processing
              break;
            case 'paypal':
              // 100+ lines of PayPal processing
              break;
            case 'crypto':
              // 100+ lines of crypto processing
              break;
          }
        }
      `;

      const suggestions = analyzer.analyzeSuggestions(code);

      const strategySuggestion = suggestions.find(s => s.pattern === 'strategy');
      expect(strategySuggestion).toBeDefined();
      expect(strategySuggestion!.confidence).toBeGreaterThan(0.5);
      expect(strategySuggestion!.reason).toContain('條件邏輯');
    }, { testName: 'analyze-strategy-pattern' }));
  });

  describe('Singleton 模式重構', () => {
    it('應該能將類別轉換為 Singleton 模式', withMemoryOptimization(async () => {
      const code = `
        class Logger {
          constructor() {
            this.logs = [];
          }

          log(message) {
            this.logs.push(message);
            console.log(message);
          }

          getlogs() {
            return this.logs;
          }
        }
      `;

      const config: PatternRefactorConfig = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(
        code,
        'singleton',
        'Logger',
        config
      );

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('singleton');
      expect(result.edits).toHaveLength(1);

      const edit = result.edits[0];
      expect(edit.type).toBe('replace');
      expect(edit.newText).toContain('private static instance: Logger | null = null');
      expect(edit.newText).toContain('private constructor()');
      expect(edit.newText).toContain('public static getInstance(): Logger');
      expect(edit.newText).toContain('Logger.instance = new Logger()');

      // 檢查是否保留了原有方法
      expect(edit.newText).toContain('log(message)');
      expect(edit.newText).toContain('getlogs()');

      // 檢查文件
      expect(result.documentation).toBeDefined();
      expect(result.documentation).toContain('Singleton');
    }, { testName: 'apply-singleton-pattern' }));

    it('應該處理找不到類別的錯誤', withMemoryOptimization(async () => {
      const code = `
        function notAClass() {
          return 'hello';
        }
      `;

      const result = await refactorer.applyPattern(
        code,
        'singleton',
        'NonExistentClass',
        { generateTests: false, addDocumentation: false, useTypeScript: true, preserveComments: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('找不到類別');
    }, { testName: 'singleton-class-not-found' }));
  });

  describe('Factory 模式重構', () => {
    it('應該能生成 Factory 模式框架', withMemoryOptimization(async () => {
      const code = `
        class Product {
          constructor(name) {
            this.name = name;
          }
        }
      `;

      const config: PatternRefactorConfig = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(
        code,
        'factory',
        'Product',
        config
      );

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('factory');
      expect(result.createdFiles).toBeDefined();
      expect(result.createdFiles).toHaveLength(1);

      const factoryFile = result.createdFiles![0];
      expect(factoryFile.path).toBe('ProductFactory.ts');
      expect(factoryFile.content).toContain('class ProductFactory');
      expect(factoryFile.content).toContain('static create(type: string): Product');
      expect(factoryFile.content).toContain('switch (type)');

      // 檢查警告
      expect(result.warnings).toContain('建議重構現有的物件創建邏輯使用 Factory');

      // 檢查文件
      expect(result.documentation).toBeDefined();
      expect(result.documentation).toContain('Factory');
    }, { testName: 'generate-factory-pattern' }));
  });

  describe('Observer 模式重構', () => {
    it('應該能生成 Observer 模式框架', withMemoryOptimization(async () => {
      const code = `
        class EventManager {
          triggerEvent(event) {
            console.log('Event:', event);
          }
        }
      `;

      const config: PatternRefactorConfig = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: true,
        preserveComments: true
      };

      const result = await refactorer.applyPattern(
        code,
        'observer',
        'EventManager',
        config
      );

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('observer');
      expect(result.createdFiles).toBeDefined();
      expect(result.createdFiles!.length).toBeGreaterThan(0);

      const observerFile = result.createdFiles!.find(f => f.path === 'Observer.ts');
      expect(observerFile).toBeDefined();
      expect(observerFile!.content).toContain('interface Observer');
      expect(observerFile!.content).toContain('update(data: any): void');

      const observableFile = result.createdFiles!.find(f => f.path === 'Observable.ts');
      expect(observableFile).toBeDefined();
      expect(observableFile!.content).toContain('class Observable');
      expect(observableFile!.content).toContain('addObserver');
      expect(observableFile!.content).toContain('removeObserver');
      expect(observableFile!.content).toContain('notifyObservers');

      // 檢查警告
      expect(result.warnings).toContain('需要手動實作 Observer 介面和修改現有事件處理');
    }, { testName: 'generate-observer-pattern' }));
  });

  describe('Strategy 模式重構', () => {
    it('應該能生成 Strategy 模式框架', withMemoryOptimization(async () => {
      const code = `
        class PaymentProcessor {
          processPayment(type, amount) {
            if (type === 'credit') {
              // 處理信用卡
            } else if (type === 'debit') {
              // 處理轉帳卡
            }
          }
        }
      `;

      const config: PatternRefactorConfig = {
        generateTests: false,
        addDocumentation: true,
        useTypeScript: false,  // 測試 JavaScript 模式
        preserveComments: true
      };

      const result = await refactorer.applyPattern(
        code,
        'strategy',
        'PaymentProcessor',
        config
      );

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('strategy');
      expect(result.createdFiles).toBeDefined();

      const strategyFile = result.createdFiles!.find(f => f.path === 'Strategy.js');
      expect(strategyFile).toBeDefined();
      expect(strategyFile!.content).toContain('// Strategy interface');

      const contextFile = result.createdFiles!.find(f => f.path === 'PaymentProcessorContext.js');
      expect(contextFile).toBeDefined();
      expect(contextFile!.content).toContain('class PaymentProcessorContext');
      expect(contextFile!.content).toContain('setStrategy(strategy)');
      expect(contextFile!.content).toContain('executeStrategy(data)');

      // 檢查警告
      expect(result.warnings).toContain('需要將現有的演算法邏輯重構為獨立的策略類別');
    }, { testName: 'generate-strategy-pattern' }));
  });

  describe('不支援的模式', () => {
    it('應該正確處理不支援的設計模式', withMemoryOptimization(async () => {
      const code = `
        class TestClass {
          method() {}
        }
      `;

      const result = await refactorer.applyPattern(
        code,
        'unsupported' as DesignPattern,
        'TestClass',
        { generateTests: false, addDocumentation: false, useTypeScript: true, preserveComments: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('不支援的設計模式');
    }, { testName: 'unsupported-pattern' }));
  });

  describe('輸入驗證', () => {
    it('應該驗證無效的輸入參數', withMemoryOptimization(async () => {
      const result = await refactorer.applyPattern(
        '',
        'singleton',
        '',
        { generateTests: false, addDocumentation: false, useTypeScript: true, preserveComments: true }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('輸入參數無效');
    }, { testName: 'invalid-input-validation' }));
  });

  describe('建議功能', () => {
    it('應該能獲取設計模式建議', withMemoryOptimization(async () => {
      const code = `
        class ConfigManager {
          static config = null;

          static loadConfig() {
            if (!ConfigManager.config) {
              ConfigManager.config = readConfigFile();
            }
            return ConfigManager.config;
          }
        }

        function createUser(type) {
          switch(type) {
            case 'admin': return new AdminUser();
            case 'regular': return new RegularUser();
            case 'guest': return new GuestUser();
          }
        }
      `;

      const suggestions = await refactorer.getSuggestions(code);

      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBeGreaterThan(0);

      // 應該同時建議 Singleton 和 Factory 模式
      const patterns = suggestions.map(s => s.pattern);
      expect(patterns).toContain('singleton');
      expect(patterns).toContain('factory');
    }, { testName: 'get-pattern-suggestions' }));
  });
});