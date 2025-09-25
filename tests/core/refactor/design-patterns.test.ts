import { describe, it, expect, beforeEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';

/**
 * 設計模式重構測試
 * 測試將程式碼重構為設計模式的功能
 */

// AST 節點介面
interface ASTNode {
  type: string;
  children?: ASTNode[];
  value?: string;
  properties?: Record<string, any>;
}

// 實例化表達式
interface NewExpression extends ASTNode {
  type: 'NewExpression';
  constructor: string;
  arguments: string[];
  location: {
    file: string;
    line: number;
    column: number;
  };
}

// Switch 語句
interface SwitchStatement extends ASTNode {
  type: 'SwitchStatement';
  discriminant: string;
  cases: SwitchCase[];
  location: {
    file: string;
    line: number;
    column: number;
  };
}

interface SwitchCase {
  test: string | null; // null 表示 default case
  consequent: string[];
}

// 重構編輯
interface RefactorEdit {
  type: 'create' | 'replace' | 'delete';
  path?: string;
  range?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  content: string;
}

// 重構結果
interface RefactorResult {
  success: boolean;
  edits: RefactorEdit[];
  pattern: string;
  errors?: string[];
}

// 工廠模式重構器
class FactoryPatternRefactoring {
  convertToFactory(instantiations: NewExpression[]): RefactorResult {
    try {
      // 1. 分析實例化模式
      const analysis = this.analyzeInstantiations(instantiations);

      if (analysis.types.length < 2) {
        return {
          success: false,
          edits: [],
          pattern: 'Factory',
          errors: ['需要至少兩種不同的類型才能應用工廠模式']
        };
      }

      // 2. 生成工廠介面
      const factoryInterface = this.generateFactoryInterface(analysis);

      // 3. 生成具體工廠
      const concreteFactory = this.generateConcreteFactory(analysis);

      // 4. 替換實例化為工廠呼叫
      const replacements = instantiations.map(inst =>
        this.generateFactoryCall(inst, analysis)
      );

      return {
        success: true,
        edits: [
          {
            type: 'create',
            path: 'factory.ts',
            content: factoryInterface
          },
          {
            type: 'create',
            path: 'concrete-factory.ts',
            content: concreteFactory
          },
          ...replacements
        ],
        pattern: 'Factory'
      };
    } catch (error) {
      return {
        success: false,
        edits: [],
        pattern: 'Factory',
        errors: [error instanceof Error ? error.message : '工廠模式轉換失敗']
      };
    }
  }

  private analyzeInstantiations(instantiations: NewExpression[]): {
    types: string[];
    commonParameters: string[];
    usagePatterns: Map<string, number>;
  } {
    const types = [...new Set(instantiations.map(inst => inst.constructor))];
    const usagePatterns = new Map<string, number>();

    // 計算每種類型的使用頻率
    instantiations.forEach(inst => {
      const count = usagePatterns.get(inst.constructor) || 0;
      usagePatterns.set(inst.constructor, count + 1);
    });

    // 找出共同參數模式
    const parameterSets = instantiations.map(inst => inst.arguments);
    const commonParameters = this.findCommonParameters(parameterSets);

    return { types, commonParameters, usagePatterns };
  }

  private findCommonParameters(parameterSets: string[][]): string[] {
    if (parameterSets.length === 0) return [];

    // 簡化實作：假設所有實例化都有相同數量和類型的參數
    return parameterSets[0];
  }

  private generateFactoryInterface(analysis: { types: string[]; commonParameters: string[] }): string {
    const { types, commonParameters } = analysis;
    const paramList = commonParameters.map((param, index) => `param${index}: any`).join(', ');

    return `
// 工廠介面
export interface Factory {
  create(type: '${types.join("' | '")}', ${paramList}): any;
}

// 產品介面
export interface Product {
  execute(): void;
}

// 具體產品類型
${types.map(type => `export class ${type} implements Product {
  constructor(${paramList}) {
    // 實作
  }

  execute(): void {
    // ${type} 的具體實作
  }
}`).join('\n\n')}
`;
  }

  private generateConcreteFactory(analysis: { types: string[]; commonParameters: string[] }): string {
    const { types, commonParameters } = analysis;
    const paramList = commonParameters.map((param, index) => `param${index}: any`).join(', ');

    return `
import { Factory, Product, ${types.join(', ')} } from './factory';

export class ConcreteFactory implements Factory {
  create(type: '${types.join("' | '")}', ${paramList}): Product {
    switch (type) {
      ${types.map(type => `case '${type}':
        return new ${type}(${commonParameters.map((_, index) => `param${index}`).join(', ')});`).join('\n      ')}
      default:
        throw new Error(\`Unsupported type: \${type}\`);
    }
  }
}
`;
  }

  private generateFactoryCall(
    instantiation: NewExpression,
    analysis: { types: string[] }
  ): RefactorEdit {
    const factoryCall = `factory.create('${instantiation.constructor}', ${instantiation.arguments.join(', ')})`;

    return {
      type: 'replace',
      range: {
        start: { line: instantiation.location.line, column: instantiation.location.column },
        end: { line: instantiation.location.line, column: instantiation.location.column + 50 }
      },
      content: factoryCall
    };
  }
}

// 策略模式重構器
class StrategyPatternRefactoring {
  convertToStrategy(switchStatement: SwitchStatement): RefactorResult {
    try {
      // 1. 分析 switch 語句
      const strategies = this.extractStrategies(switchStatement);

      if (strategies.length < 2) {
        return {
          success: false,
          edits: [],
          pattern: 'Strategy',
          errors: ['需要至少兩個 case 才能應用策略模式']
        };
      }

      // 2. 生成策略介面
      const strategyInterface = this.generateStrategyInterface();

      // 3. 生成具體策略
      const concreteStrategies = strategies.map(strategy =>
        this.generateConcreteStrategy(strategy)
      );

      // 4. 生成策略上下文
      const context = this.generateStrategyContext(strategies);

      // 5. 替換 switch 語句
      const replacement = this.generateStrategyCall(switchStatement);

      return {
        success: true,
        edits: [
          {
            type: 'create',
            path: 'strategy.ts',
            content: strategyInterface
          },
          ...concreteStrategies.map(strategy => ({
            type: 'create' as const,
            path: `${strategy.name.toLowerCase()}-strategy.ts`,
            content: strategy.content
          })),
          {
            type: 'create',
            path: 'strategy-context.ts',
            content: context
          },
          replacement
        ],
        pattern: 'Strategy'
      };
    } catch (error) {
      return {
        success: false,
        edits: [],
        pattern: 'Strategy',
        errors: [error instanceof Error ? error.message : '策略模式轉換失敗']
      };
    }
  }

  private extractStrategies(switchStatement: SwitchStatement): Array<{
    name: string;
    condition: string;
    implementation: string[];
  }> {
    return switchStatement.cases
      .filter(switchCase => switchCase.test !== null)
      .map((switchCase, index) => ({
        name: `Strategy${index + 1}`,
        condition: switchCase.test!,
        implementation: switchCase.consequent
      }));
  }

  private generateStrategyInterface(): string {
    return `
// 策略介面
export interface Strategy {
  execute(context: any): any;
}
`;
  }

  private generateConcreteStrategy(strategy: {
    name: string;
    condition: string;
    implementation: string[];
  }): { name: string; content: string } {
    return {
      name: strategy.name,
      content: `
import { Strategy } from './strategy';

export class ${strategy.name} implements Strategy {
  execute(context: any): any {
    // 原始 case '${strategy.condition}' 的實作
    ${strategy.implementation.join('\n    ')}
  }
}
`
    };
  }

  private generateStrategyContext(strategies: Array<{
    name: string;
    condition: string;
    implementation: string[];
  }>): string {
    return `
import { Strategy } from './strategy';
${strategies.map(s => `import { ${s.name} } from './${s.name.toLowerCase()}-strategy';`).join('\n')}

export class StrategyContext {
  private strategies = new Map<string, Strategy>([
    ${strategies.map(s => `['${s.condition}', new ${s.name}()]`).join(',\n    ')}
  ]);

  execute(type: string, context: any): any {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(\`No strategy found for type: \${type}\`);
    }
    return strategy.execute(context);
  }
}
`;
  }

  private generateStrategyCall(switchStatement: SwitchStatement): RefactorEdit {
    const contextCall = `strategyContext.execute(${switchStatement.discriminant}, context)`;

    return {
      type: 'replace',
      range: {
        start: { line: switchStatement.location.line, column: switchStatement.location.column },
        end: { line: switchStatement.location.line + 10, column: 0 }
      },
      content: contextCall
    };
  }
}

// 觀察者模式重構器
class ObserverPatternRefactoring {
  convertToObserver(eventHandlers: Array<{
    event: string;
    handlers: string[];
    location: { file: string; line: number; column: number };
  }>): RefactorResult {
    try {
      if (eventHandlers.length === 0) {
        return {
          success: false,
          edits: [],
          pattern: 'Observer',
          errors: ['沒有找到事件處理器']
        };
      }

      // 1. 生成觀察者介面
      const observerInterface = this.generateObserverInterface();

      // 2. 生成具體觀察者
      const concreteObservers = this.generateConcreteObservers(eventHandlers);

      // 3. 生成主題類別
      const subject = this.generateSubject(eventHandlers);

      // 4. 替換事件處理為觀察者模式
      const replacements = eventHandlers.map(handler =>
        this.generateObserverCall(handler)
      );

      return {
        success: true,
        edits: [
          {
            type: 'create',
            path: 'observer.ts',
            content: observerInterface
          },
          {
            type: 'create',
            path: 'concrete-observers.ts',
            content: concreteObservers
          },
          {
            type: 'create',
            path: 'subject.ts',
            content: subject
          },
          ...replacements
        ],
        pattern: 'Observer'
      };
    } catch (error) {
      return {
        success: false,
        edits: [],
        pattern: 'Observer',
        errors: [error instanceof Error ? error.message : '觀察者模式轉換失敗']
      };
    }
  }

  private generateObserverInterface(): string {
    return `
// 觀察者介面
export interface Observer {
  update(event: string, data: any): void;
}

// 主題介面
export interface Subject {
  attach(observer: Observer): void;
  detach(observer: Observer): void;
  notify(event: string, data: any): void;
}
`;
  }

  private generateConcreteObservers(eventHandlers: Array<{
    event: string;
    handlers: string[];
  }>): string {
    const uniqueEvents = [...new Set(eventHandlers.map(h => h.event))];

    return `
import { Observer } from './observer';

${uniqueEvents.map(event => `
export class ${this.capitalize(event)}Observer implements Observer {
  update(event: string, data: any): void {
    if (event === '${event}') {
      // 原始 ${event} 事件處理邏輯
      ${eventHandlers
        .find(h => h.event === event)?.handlers
        .join('\n      ') || '// 處理邏輯'}
    }
  }
}`).join('\n')}
`;
  }

  private generateSubject(eventHandlers: Array<{ event: string }>): string {
    const uniqueEvents = [...new Set(eventHandlers.map(h => h.event))];

    return `
import { Observer, Subject } from './observer';

export class EventSubject implements Subject {
  private observers: Observer[] = [];

  attach(observer: Observer): void {
    this.observers.push(observer);
  }

  detach(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  notify(event: string, data: any): void {
    this.observers.forEach(observer => observer.update(event, data));
  }

  // 事件觸發方法
  ${uniqueEvents.map(event => `
  trigger${this.capitalize(event)}(data: any): void {
    this.notify('${event}', data);
  }`).join('')}
}
`;
  }

  private generateObserverCall(handler: {
    event: string;
    location: { file: string; line: number; column: number };
  }): RefactorEdit {
    return {
      type: 'replace',
      range: {
        start: { line: handler.location.line, column: handler.location.column },
        end: { line: handler.location.line + 5, column: 0 }
      },
      content: `subject.trigger${this.capitalize(handler.event)}(eventData);`
    };
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

describe('設計模式重構', () => {
  let factoryRefactoring: FactoryPatternRefactoring;
  let strategyRefactoring: StrategyPatternRefactoring;
  let observerRefactoring: ObserverPatternRefactoring;

  beforeEach(() => {
    factoryRefactoring = new FactoryPatternRefactoring();
    strategyRefactoring = new StrategyPatternRefactoring();
    observerRefactoring = new ObserverPatternRefactoring();
  });

  describe('工廠模式重構', () => {
    it('應該能將多個實例化轉換為工廠模式', withMemoryOptimization(() => {
      const instantiations: NewExpression[] = [
        {
          type: 'NewExpression',
          constructor: 'Car',
          arguments: ['brand', 'model'],
          location: { file: 'main.ts', line: 10, column: 5 }
        },
        {
          type: 'NewExpression',
          constructor: 'Truck',
          arguments: ['brand', 'capacity'],
          location: { file: 'main.ts', line: 15, column: 5 }
        },
        {
          type: 'NewExpression',
          constructor: 'Motorcycle',
          arguments: ['brand', 'engine'],
          location: { file: 'main.ts', line: 20, column: 5 }
        }
      ];

      const result = factoryRefactoring.convertToFactory(instantiations);

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('Factory');
      expect(result.edits).toHaveLength(5); // 2個新檔案 + 3個替換

      // 檢查工廠介面檔案
      const factoryFile = result.edits.find(e => e.path === 'factory.ts');
      expect(factoryFile).toBeDefined();
      expect(factoryFile!.content).toContain('interface Factory');
      expect(factoryFile!.content).toContain("'Car' | 'Truck' | 'Motorcycle'");

      // 檢查具體工廠檔案
      const concreteFactoryFile = result.edits.find(e => e.path === 'concrete-factory.ts');
      expect(concreteFactoryFile).toBeDefined();
      expect(concreteFactoryFile!.content).toContain('class ConcreteFactory');

      // 檢查替換
      const replacements = result.edits.filter(e => e.type === 'replace');
      expect(replacements).toHaveLength(3);
      expect(replacements[0].content).toContain("factory.create('Car'");
    }, { testName: 'factory-pattern-conversion' }));

    it('應該拒絕只有一種類型的實例化', withMemoryOptimization(() => {
      const instantiations: NewExpression[] = [
        {
          type: 'NewExpression',
          constructor: 'Car',
          arguments: ['brand'],
          location: { file: 'main.ts', line: 10, column: 5 }
        }
      ];

      const result = factoryRefactoring.convertToFactory(instantiations);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('需要至少兩種不同的類型才能應用工廠模式');
    }, { testName: 'reject-single-type-factory' }));

    it('應該處理不同參數模式的實例化', withMemoryOptimization(() => {
      const instantiations: NewExpression[] = [
        {
          type: 'NewExpression',
          constructor: 'SimpleClass',
          arguments: [],
          location: { file: 'main.ts', line: 10, column: 5 }
        },
        {
          type: 'NewExpression',
          constructor: 'ComplexClass',
          arguments: ['param1', 'param2', 'param3'],
          location: { file: 'main.ts', line: 15, column: 5 }
        }
      ];

      const result = factoryRefactoring.convertToFactory(instantiations);

      expect(result.success).toBe(true);

      const factoryFile = result.edits.find(e => e.path === 'factory.ts');
      expect(factoryFile!.content).toContain("'SimpleClass' | 'ComplexClass'");
    }, { testName: 'different-parameter-patterns' }));
  });

  describe('策略模式重構', () => {
    it('應該能將 switch 語句轉換為策略模式', withMemoryOptimization(() => {
      const switchStatement: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: 'paymentType',
        cases: [
          {
            test: 'credit',
            consequent: ['return processCreditPayment(amount);']
          },
          {
            test: 'debit',
            consequent: ['return processDebitPayment(amount);']
          },
          {
            test: 'paypal',
            consequent: ['return processPayPalPayment(amount);']
          },
          {
            test: null, // default case
            consequent: ['throw new Error("Unsupported payment type");']
          }
        ],
        location: { file: 'payment.ts', line: 20, column: 1 }
      };

      const result = strategyRefactoring.convertToStrategy(switchStatement);

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('Strategy');
      expect(result.edits).toHaveLength(6); // 策略介面 + 3個具體策略 + 上下文 + 替換

      // 檢查策略介面
      const strategyInterface = result.edits.find(e => e.path === 'strategy.ts');
      expect(strategyInterface).toBeDefined();
      expect(strategyInterface!.content).toContain('interface Strategy');

      // 檢查具體策略
      const strategies = result.edits.filter(e => e.path?.includes('-strategy.ts'));
      expect(strategies).toHaveLength(3);
      expect(strategies[0].content).toContain('class Strategy1 implements Strategy');

      // 檢查上下文
      const context = result.edits.find(e => e.path === 'strategy-context.ts');
      expect(context).toBeDefined();
      expect(context!.content).toContain('class StrategyContext');
    }, { testName: 'strategy-pattern-conversion' }));

    it('應該拒絕只有一個 case 的 switch', withMemoryOptimization(() => {
      const switchStatement: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: 'value',
        cases: [
          {
            test: 'single',
            consequent: ['return value;']
          }
        ],
        location: { file: 'test.ts', line: 5, column: 1 }
      };

      const result = strategyRefactoring.convertToStrategy(switchStatement);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('需要至少兩個 case 才能應用策略模式');
    }, { testName: 'reject-single-case-strategy' }));

    it('應該正確處理複雜的 case 實作', withMemoryOptimization(() => {
      const switchStatement: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: 'operation',
        cases: [
          {
            test: 'complex',
            consequent: [
              'const temp = performCalculation(input);',
              'const result = transform(temp);',
              'return validate(result);'
            ]
          },
          {
            test: 'simple',
            consequent: ['return input * 2;']
          }
        ],
        location: { file: 'calculator.ts', line: 15, column: 1 }
      };

      const result = strategyRefactoring.convertToStrategy(switchStatement);

      expect(result.success).toBe(true);

      const strategy1 = result.edits.find(e => e.path === 'strategy1-strategy.ts');
      expect(strategy1!.content).toContain('const temp = performCalculation(input);');
      expect(strategy1!.content).toContain('const result = transform(temp);');
      expect(strategy1!.content).toContain('return validate(result);');
    }, { testName: 'complex-case-implementation' }));
  });

  describe('觀察者模式重構', () => {
    it('應該能將事件處理器轉換為觀察者模式', withMemoryOptimization(() => {
      const eventHandlers = [
        {
          event: 'click',
          handlers: ['updateUI();', 'logEvent();'],
          location: { file: 'ui.ts', line: 10, column: 1 }
        },
        {
          event: 'hover',
          handlers: ['showTooltip();'],
          location: { file: 'ui.ts', line: 20, column: 1 }
        },
        {
          event: 'focus',
          handlers: ['highlightElement();', 'trackFocus();'],
          location: { file: 'ui.ts', line: 30, column: 1 }
        }
      ];

      const result = observerRefactoring.convertToObserver(eventHandlers);

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('Observer');
      expect(result.edits).toHaveLength(6); // 3個檔案 + 3個替換

      // 檢查觀察者介面
      const observerInterface = result.edits.find(e => e.path === 'observer.ts');
      expect(observerInterface).toBeDefined();
      expect(observerInterface!.content).toContain('interface Observer');
      expect(observerInterface!.content).toContain('interface Subject');

      // 檢查具體觀察者
      const concreteObservers = result.edits.find(e => e.path === 'concrete-observers.ts');
      expect(concreteObservers).toBeDefined();
      expect(concreteObservers!.content).toContain('class ClickObserver');
      expect(concreteObservers!.content).toContain('class HoverObserver');
      expect(concreteObservers!.content).toContain('class FocusObserver');

      // 檢查主題
      const subject = result.edits.find(e => e.path === 'subject.ts');
      expect(subject).toBeDefined();
      expect(subject!.content).toContain('class EventSubject');
      expect(subject!.content).toContain('triggerClick');
      expect(subject!.content).toContain('triggerHover');
      expect(subject!.content).toContain('triggerFocus');
    }, { testName: 'observer-pattern-conversion' }));

    it('應該拒絕沒有事件處理器的情況', withMemoryOptimization(() => {
      const result = observerRefactoring.convertToObserver([]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('沒有找到事件處理器');
    }, { testName: 'reject-no-event-handlers' }));

    it('應該正確處理重複的事件類型', withMemoryOptimization(() => {
      const eventHandlers = [
        {
          event: 'click',
          handlers: ['handleClick1();'],
          location: { file: 'ui.ts', line: 10, column: 1 }
        },
        {
          event: 'click',
          handlers: ['handleClick2();'],
          location: { file: 'ui.ts', line: 20, column: 1 }
        },
        {
          event: 'submit',
          handlers: ['handleSubmit();'],
          location: { file: 'form.ts', line: 5, column: 1 }
        }
      ];

      const result = observerRefactoring.convertToObserver(eventHandlers);

      expect(result.success).toBe(true);

      const concreteObservers = result.edits.find(e => e.path === 'concrete-observers.ts');
      // 應該只有兩個觀察者：ClickObserver 和 SubmitObserver
      expect(concreteObservers!.content.match(/class \w+Observer/g)).toHaveLength(2);
    }, { testName: 'duplicate-event-types' }));
  });

  describe('模式選擇與組合', () => {
    it('應該能組合多種設計模式', withMemoryOptimization(() => {
      // 先應用工廠模式
      const instantiations: NewExpression[] = [
        {
          type: 'NewExpression',
          constructor: 'DatabaseLogger',
          arguments: ['config'],
          location: { file: 'logger.ts', line: 10, column: 5 }
        },
        {
          type: 'NewExpression',
          constructor: 'FileLogger',
          arguments: ['config'],
          location: { file: 'logger.ts', line: 15, column: 5 }
        }
      ];

      const factoryResult = factoryRefactoring.convertToFactory(instantiations);
      expect(factoryResult.success).toBe(true);

      // 再應用策略模式
      const switchStatement: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: 'logLevel',
        cases: [
          { test: 'info', consequent: ['logger.info(message);'] },
          { test: 'error', consequent: ['logger.error(message);'] }
        ],
        location: { file: 'logger.ts', line: 25, column: 1 }
      };

      const strategyResult = strategyRefactoring.convertToStrategy(switchStatement);
      expect(strategyResult.success).toBe(true);

      // 兩種模式都應該成功應用
      expect(factoryResult.edits.length + strategyResult.edits.length).toBeGreaterThan(5);
    }, { testName: 'pattern-combination' }));
  });

  describe('錯誤處理', () => {
    it('應該處理無效的 AST 結構', withMemoryOptimization(() => {
      const invalidSwitch: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: '',
        cases: [],
        location: { file: 'invalid.ts', line: 1, column: 1 }
      };

      const result = strategyRefactoring.convertToStrategy(invalidSwitch);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('需要至少兩個 case 才能應用策略模式');
    }, { testName: 'invalid-ast-structure' }));

    it('應該處理檔案路徑問題', withMemoryOptimization(() => {
      const instantiations: NewExpression[] = [
        {
          type: 'NewExpression',
          constructor: 'Class1',
          arguments: [],
          location: { file: '', line: 0, column: 0 }
        },
        {
          type: 'NewExpression',
          constructor: 'Class2',
          arguments: [],
          location: { file: '', line: 0, column: 0 }
        }
      ];

      const result = factoryRefactoring.convertToFactory(instantiations);

      // 即使檔案路徑有問題，重構仍應該成功
      expect(result.success).toBe(true);
      expect(result.edits.length).toBeGreaterThan(0);
    }, { testName: 'file-path-issues' }));
  });

  describe('效能與擴展性', () => {
    it('應該能處理大量的實例化', withMemoryOptimization(() => {
      const instantiations: NewExpression[] = Array.from({ length: 100 }, (_, i) => ({
        type: 'NewExpression',
        constructor: `Class${i % 5}`, // 5種不同的類型
        arguments: [`arg${i}`],
        location: { file: `file${i}.ts`, line: i, column: 1 }
      }));

      const startTime = Date.now();
      const result = factoryRefactoring.convertToFactory(instantiations);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // 應該在1秒內完成
      expect(result.edits.filter(e => e.type === 'replace')).toHaveLength(100);
    }, { testName: 'large-scale-refactoring' }));

    it('應該能處理複雜的 switch 語句', withMemoryOptimization(() => {
      const complexSwitch: SwitchStatement = {
        type: 'SwitchStatement',
        discriminant: 'complexCondition',
        cases: Array.from({ length: 20 }, (_, i) => ({
          test: `case${i}`,
          consequent: [
            `const result${i} = process${i}(input);`,
            `const validated${i} = validate${i}(result${i});`,
            `return transform${i}(validated${i});`
          ]
        })),
        location: { file: 'complex.ts', line: 50, column: 1 }
      };

      const result = strategyRefactoring.convertToStrategy(complexSwitch);

      expect(result.success).toBe(true);
      expect(result.edits.filter(e => e.path?.includes('-strategy.ts'))).toHaveLength(20);
    }, { testName: 'complex-switch-statement' }));
  });
});