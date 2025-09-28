/**
 * 設計模式重構器
 * 提供常見設計模式的自動重構功能
 */

// 重用介面
export interface Range {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface CodeEdit {
  range: Range;
  newText: string;
  type: 'replace' | 'insert' | 'delete';
}

// 程式碼元素介面
export interface ClassInfo {
  name: string;
  location: Range;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  constructor?: MethodInfo;
}

export interface MethodInfo {
  name: string;
  location: Range;
  parameters: string[];
  isStatic: boolean;
  isPrivate: boolean;
  returnType?: string;
}

export interface PropertyInfo {
  name: string;
  location: Range;
  type?: string;
  isPrivate: boolean;
  isStatic: boolean;
}

// 設計模式類型
export type DesignPattern =
  | 'singleton'
  | 'factory'
  | 'observer'
  | 'strategy'
  | 'decorator'
  | 'adapter'
  | 'facade'
  | 'builder'
  | 'template-method'
  | 'command';

// 重構結果
export interface PatternRefactorResult {
  success: boolean;
  pattern: DesignPattern;
  edits: CodeEdit[];
  createdFiles?: { path: string; content: string }[];
  modifiedClasses: string[];
  errors: string[];
  warnings: string[];
  documentation?: string;
}

// 重構配置
export interface PatternRefactorConfig {
  generateTests: boolean;
  addDocumentation: boolean;
  useTypeScript: boolean;
  preserveComments: boolean;
  outputDirectory?: string;
}

// 模式建議
export interface PatternSuggestion {
  pattern: DesignPattern;
  confidence: number;
  reason: string;
  location: Range;
  benefits: string[];
  effort: 'low' | 'medium' | 'high';
}

/**
 * 設計模式分析器
 * 分析程式碼並建議適用的設計模式
 */
export class DesignPatternAnalyzer {
  /**
   * 分析程式碼並建議設計模式
   */
  analyzeSuggestions(code: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];
    const classes = this.parseClasses(code);

    // 分析各種設計模式的適用性
    suggestions.push(...this.analyzeSingleton(classes, code));
    suggestions.push(...this.analyzeFactory(classes, code));
    suggestions.push(...this.analyzeObserver(classes, code));
    suggestions.push(...this.analyzeStrategy(classes, code));
    suggestions.push(...this.analyzeDecorator(classes, code));

    // 按置信度排序
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 分析 Singleton 模式適用性
   */
  private analyzeSingleton(classes: ClassInfo[], code: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    for (const cls of classes) {
      let confidence = 0;
      const reasons: string[] = [];

      // 檢查是否有靜態實例屬性
      const hasStaticInstance = cls.properties.some(p => p.isStatic && p.name.includes('instance'));
      if (hasStaticInstance) {confidence += 0.4;}

      // 檢查是否有 getInstance 方法
      const hasGetInstance = cls.methods.some(m => m.name === 'getInstance' && m.isStatic);
      if (hasGetInstance) {
        confidence += 0.5;
        reasons.push('已有 getInstance 方法，建議完善 Singleton 實作');
      }

      // 檢查建構子是否私有
      const hasPrivateConstructor = cls.constructor?.isPrivate;
      if (hasPrivateConstructor) {confidence += 0.3;}

      // 檢查是否全域使用
      const globalUsageCount = (code.match(new RegExp(cls.name, 'g')) || []).length;
      if (globalUsageCount > 5) {
        confidence += 0.2;
        reasons.push('類別被廣泛使用，適合 Singleton 模式');
      }

      // 檢查是否有 static config 或類似管理狀態的屬性
      if (cls.properties.some(p => p.isStatic && (p.name.includes('config') || p.name.includes('Config')))) {
        confidence += 0.3;
        reasons.push('有靜態配置管理，適合 Singleton 模式');
      }

      // 檢查 loadConfig 或類似方法
      if (cls.methods.some(m => m.isStatic && m.name.toLowerCase().includes('load'))) {
        confidence += 0.3;
        reasons.push('有靜態載入方法，適合 Singleton 模式');
      }

      if (confidence >= 0.5) {
        suggestions.push({
          pattern: 'singleton',
          confidence,
          reason: reasons.join(', ') || '類別結構適合 Singleton 模式',
          location: cls.location,
          benefits: [
            '確保全域只有一個實例',
            '提供全域存取點',
            '懶載入實例化'
          ],
          effort: 'low'
        });
      }
    }

    return suggestions;
  }

  /**
   * 分析 Factory 模式適用性
   */
  private analyzeFactory(classes: ClassInfo[], code: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    // 查找創建對象的函式
    const createMethods = code.match(/function\s+create\w*|\.create\w*/g) || [];
    const switchCreation = code.match(/switch\s*\([^)]*\)\s*{[^}]*new\s+\w+/g) || [];

    if (createMethods.length > 2 || switchCreation.length > 0) {
      suggestions.push({
        pattern: 'factory',
        confidence: 0.7,
        reason: '發現多個創建函式或條件式物件創建',
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        benefits: [
          '封裝物件創建邏輯',
          '減少程式碼重複',
          '易於擴展新類型'
        ],
        effort: 'medium'
      });
    }

    return suggestions;
  }

  /**
   * 分析 Observer 模式適用性
   */
  private analyzeObserver(classes: ClassInfo[], code: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    // 查找事件相關代碼
    const eventPatterns = [
      /addEventListener|on\w+|emit|trigger/g,
      /callback|listener|observer/g,
      /notify|update|subscribe/g
    ];

    let eventScore = 0;
    for (const pattern of eventPatterns) {
      const matches = code.match(pattern) || [];
      eventScore += matches.length;
    }

    if (eventScore >= 5) {
      suggestions.push({
        pattern: 'observer',
        confidence: Math.min(0.8, eventScore / 10),
        reason: '發現大量事件相關程式碼',
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        benefits: [
          '鬆耦合的事件處理',
          '動態新增/移除監聽器',
          '更好的可測試性'
        ],
        effort: 'medium'
      });
    }

    return suggestions;
  }

  /**
   * 分析 Strategy 模式適用性
   */
  private analyzeStrategy(classes: ClassInfo[], code: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    // 查找策略相關模式
    const strategyIndicators = [
      /if\s*\([^)]*type[^)]*\)|switch\s*\([^)]*type[^)]*\)/g,
      /algorithm|strategy|method/gi,
      /calculate|process|handle/gi
    ];

    let strategyScore = 0;
    for (const pattern of strategyIndicators) {
      const matches = code.match(pattern) || [];
      strategyScore += matches.length;
    }

    // 查找大型 if-else 鏈或 switch 語句
    const largeConditionals = code.match(/if\s*\([^{]*\)\s*{[^}]{50,}}\s*else/g) || [];
    const largeSwitches = code.match(/switch\s*\([^{]*\)\s*{[^}]{100,}}/g) || [];

    if (strategyScore >= 3 || largeConditionals.length > 0 || largeSwitches.length > 0) {
      suggestions.push({
        pattern: 'strategy',
        confidence: 0.6,
        reason: '發現複雜的條件邏輯或演算法選擇',
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        benefits: [
          '將演算法封裝成獨立類別',
          '運行時切換演算法',
          '符合開放封閉原則'
        ],
        effort: 'high'
      });
    }

    return suggestions;
  }

  /**
   * 分析 Decorator 模式適用性
   */
  private analyzeDecorator(classes: ClassInfo[], code: string): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    // 查找裝飾器相關模式
    const decoratorPatterns = [
      /@\w+/g,  // 註解/裝飾器語法
      /wrap|decorator|enhance/gi,
      /before|after|around/gi
    ];

    let decoratorScore = 0;
    for (const pattern of decoratorPatterns) {
      const matches = code.match(pattern) || [];
      decoratorScore += matches.length;
    }

    if (decoratorScore >= 3) {
      suggestions.push({
        pattern: 'decorator',
        confidence: 0.5,
        reason: '發現裝飾器或包裝器模式的使用',
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        benefits: [
          '動態新增物件功能',
          '避免繼承爆炸',
          '遵循單一職責原則'
        ],
        effort: 'medium'
      });
    }

    return suggestions;
  }

  /**
   * 簡化的類別解析
   */
  private parseClasses(code: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const classMatches = code.matchAll(/class\s+(\w+)[^{]*{([^}]*)}/g);

    for (const match of classMatches) {
      const className = match[1];
      const classBody = match[2];

      const methods = this.parseMethods(classBody);
      const properties = this.parseProperties(classBody);

      classes.push({
        name: className,
        location: this.getMatchLocation(code, match),
        methods,
        properties,
        constructor: methods.find(m => m.name === 'constructor')
      });
    }

    return classes;
  }

  /**
   * 解析方法
   */
  private parseMethods(classBody: string): MethodInfo[] {
    const methods: MethodInfo[] = [];
    const methodMatches = classBody.matchAll(/(static\s+)?(private\s+)?(\w+)\s*\(([^)]*)\)/g);

    for (const match of methodMatches) {
      const isStatic = !!match[1];
      const isPrivate = !!match[2];
      const name = match[3];
      const params = match[4] ? match[4].split(',').map(p => p.trim()) : [];

      methods.push({
        name,
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        parameters: params,
        isStatic,
        isPrivate
      });
    }

    return methods;
  }

  /**
   * 解析屬性
   */
  private parseProperties(classBody: string): PropertyInfo[] {
    const properties: PropertyInfo[] = [];
    const propMatches = classBody.matchAll(/(static\s+)?(private\s+)?(\w+)\s*[=:]/g);

    for (const match of propMatches) {
      const isStatic = !!match[1];
      const isPrivate = !!match[2];
      const name = match[3];

      properties.push({
        name,
        location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        isPrivate,
        isStatic
      });
    }

    return properties;
  }

  /**
   * 獲取匹配位置
   */
  private getMatchLocation(code: string, match: RegExpMatchArray): Range {
    const start = match.index || 0;
    const end = start + match[0].length;
    return {
      start: this.offsetToPosition(code, start),
      end: this.offsetToPosition(code, end)
    };
  }

  /**
   * 偏移量轉位置
   */
  private offsetToPosition(code: string, offset: number): { line: number; column: number } {
    const lines = code.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length
    };
  }
}

/**
 * 設計模式重構器主類
 */
export class DesignPatternRefactorer {
  private analyzer = new DesignPatternAnalyzer();

  /**
   * 應用設計模式重構
   */
  async applyPattern(
    code: string,
    pattern: DesignPattern,
    className: string,
    config: PatternRefactorConfig = {
      generateTests: false,
      addDocumentation: true,
      useTypeScript: true,
      preserveComments: true
    }
  ): Promise<PatternRefactorResult> {
    // 輸入驗證
    if (!code || !pattern || !className) {
      return {
        success: false,
        pattern: pattern || 'unknown' as DesignPattern,
        edits: [],
        modifiedClasses: [],
        errors: ['輸入參數無效'],
        warnings: []
      };
    }

    try {
      switch (pattern) {
      case 'singleton':
        return await this.applySingletonPattern(code, className, config);
      case 'factory':
        return await this.applyFactoryPattern(code, className, config);
      case 'observer':
        return await this.applyObserverPattern(code, className, config);
      case 'strategy':
        return await this.applyStrategyPattern(code, className, config);
      case 'decorator':
        return await this.applyDecoratorPattern(code, className, config);
      default:
        throw new Error(`不支援的設計模式: ${pattern}`);
      }
    } catch (error) {
      return {
        success: false,
        pattern,
        edits: [],
        modifiedClasses: [],
        errors: [error instanceof Error ? error.message : '未知錯誤'],
        warnings: []
      };
    }
  }

  /**
   * 應用 Singleton 模式
   */
  private async applySingletonPattern(
    code: string,
    className: string,
    config: PatternRefactorConfig
  ): Promise<PatternRefactorResult> {
    const edits: CodeEdit[] = [];

    // 找到類別定義 - 使用更準確的正則表達式
    // 使用遞迴匹配來處理嵌套的大括號
    const classPattern = `class\\s+${className}[^{]*{`;
    const classStartMatch = code.match(new RegExp(classPattern));
    if (!classStartMatch) {
      throw new Error(`找不到類別: ${className}`);
    }

    // 找到類別的完整內容（包含嵌套的大括號）
    const classStartIndex = code.indexOf(classStartMatch[0]);
    let braceCount = 1;
    let classEndIndex = classStartIndex + classStartMatch[0].length;

    while (braceCount > 0 && classEndIndex < code.length) {
      if (code[classEndIndex] === '{') {braceCount++;}
      if (code[classEndIndex] === '}') {braceCount--;}
      classEndIndex++;
    }

    const classBody = code.substring(
      classStartIndex + classStartMatch[0].length,
      classEndIndex - 1
    );
    const singletonCode = this.generateSingletonCode(className, classBody, config);

    // 替換整個類別
    const classStart = classStartIndex;
    const classEnd = classEndIndex;

    edits.push({
      range: {
        start: this.offsetToPosition(code, classStart),
        end: this.offsetToPosition(code, classEnd)
      },
      newText: singletonCode,
      type: 'replace'
    });

    return {
      success: true,
      pattern: 'singleton',
      edits,
      modifiedClasses: [className],
      errors: [],
      warnings: [],
      documentation: config.addDocumentation ? this.generateSingletonDocumentation(className) : undefined
    };
  }

  /**
   * 生成 Singleton 程式碼
   */
  private generateSingletonCode(className: string, originalBody: string, config: PatternRefactorConfig): string {
    const typescript = config.useTypeScript;
    const instanceType = typescript ? `: ${className} | null` : '';

    // 修正：static 關鍵字應該在屬性前，而不是型別前
    return `${config.addDocumentation ? `/**\n * ${className} - Singleton 模式實作\n * 確保全域只有一個實例\n */\n` : ''}class ${className} {
  private static instance${instanceType} = null;

  private constructor() {
    ${this.extractConstructorBody(originalBody)}
  }

  public static getInstance()${typescript ? `: ${className}` : ''} {
    if (!${className}.instance) {
      ${className}.instance = new ${className}();
    }
    return ${className}.instance;
  }

  ${this.extractMethodsAndProperties(originalBody)}
}`;
  }

  /**
   * 應用 Factory 模式
   */
  private async applyFactoryPattern(
    code: string,
    className: string,
    config: PatternRefactorConfig
  ): Promise<PatternRefactorResult> {
    const factoryCode = this.generateFactoryCode(className, config);
    const createdFiles = [{
      path: `${className}Factory.${config.useTypeScript ? 'ts' : 'js'}`,
      content: factoryCode
    }];

    return {
      success: true,
      pattern: 'factory',
      edits: [],
      createdFiles,
      modifiedClasses: [],
      errors: [],
      warnings: ['建議重構現有的物件創建邏輯使用 Factory'],
      documentation: config.addDocumentation ? this.generateFactoryDocumentation(className) : undefined
    };
  }

  /**
   * 生成 Factory 程式碼
   */
  private generateFactoryCode(className: string, config: PatternRefactorConfig): string {
    return `${config.addDocumentation ? `/**\n * ${className} Factory - 工廠模式實作\n * 封裝物件創建邏輯\n */\n` : ''}class ${className}Factory {
  static create(type${config.useTypeScript ? ': string' : ''})${config.useTypeScript ? `: ${className}` : ''} {
    switch (type) {
      case 'default':
        return new ${className}();
      // 新增更多類型...
      default:
        throw new Error(\`不支援的類型: \${type}\`);
    }
  }
}`;
  }

  /**
   * 應用 Observer 模式
   */
  private async applyObserverPattern(
    code: string,
    className: string,
    config: PatternRefactorConfig
  ): Promise<PatternRefactorResult> {
    const observerCode = this.generateObserverCode(className, config);
    const createdFiles = [
      {
        path: `Observer.${config.useTypeScript ? 'ts' : 'js'}`,
        content: observerCode.observerInterface
      },
      {
        path: `Observable.${config.useTypeScript ? 'ts' : 'js'}`,
        content: observerCode.observableClass
      }
    ];

    return {
      success: true,
      pattern: 'observer',
      edits: [],
      createdFiles,
      modifiedClasses: [],
      errors: [],
      warnings: ['需要手動實作 Observer 介面和修改現有事件處理'],
      documentation: config.addDocumentation ? this.generateObserverDocumentation() : undefined
    };
  }

  /**
   * 生成 Observer 模式程式碼
   */
  private generateObserverCode(className: string, config: PatternRefactorConfig) {
    const typescript = config.useTypeScript;

    const observerInterface = typescript ?
      'interface Observer {\n  update(data: any): void;\n}' :
      '// Observer interface\n// Implement update(data) method';

    const observableClass = `${config.addDocumentation ? '/**\n * Observable - 觀察者模式主題\n * 管理觀察者列表並通知變更\n */\n' : ''}class Observable {
  private observers${typescript ? ': Observer[]' : ''} = [];

  addObserver(observer${typescript ? ': Observer' : ''})${typescript ? ': void' : ''} {
    this.observers.push(observer);
  }

  removeObserver(observer${typescript ? ': Observer' : ''})${typescript ? ': void' : ''} {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  notifyObservers(data${typescript ? ': any' : ''})${typescript ? ': void' : ''} {
    this.observers.forEach(observer => observer.update(data));
  }
}`;

    return { observerInterface, observableClass };
  }

  /**
   * 應用 Strategy 模式
   */
  private async applyStrategyPattern(
    code: string,
    className: string,
    config: PatternRefactorConfig
  ): Promise<PatternRefactorResult> {
    const strategyCode = this.generateStrategyCode(className, config);
    const createdFiles = [
      {
        path: `Strategy.${config.useTypeScript ? 'ts' : 'js'}`,
        content: strategyCode.strategyInterface
      },
      {
        path: `${className}Context.${config.useTypeScript ? 'ts' : 'js'}`,
        content: strategyCode.contextClass
      }
    ];

    return {
      success: true,
      pattern: 'strategy',
      edits: [],
      createdFiles,
      modifiedClasses: [],
      errors: [],
      warnings: ['需要將現有的演算法邏輯重構為獨立的策略類別'],
      documentation: config.addDocumentation ? this.generateStrategyDocumentation() : undefined
    };
  }

  /**
   * 生成 Strategy 模式程式碼
   */
  private generateStrategyCode(className: string, config: PatternRefactorConfig) {
    const typescript = config.useTypeScript;

    const strategyInterface = typescript ?
      'interface Strategy {\n  execute(data: any): any;\n}' :
      '// Strategy interface\n// Implement execute(data) method';

    const contextClass = `${config.addDocumentation ? `/**\n * ${className}Context - 策略模式上下文\n * 使用策略物件執行演算法\n */\n` : ''}class ${className}Context {
  private strategy${typescript ? ': Strategy' : ''};

  constructor(strategy${typescript ? ': Strategy' : ''}) {
    this.strategy = strategy;
  }

  setStrategy(strategy${typescript ? ': Strategy' : ''})${typescript ? ': void' : ''} {
    this.strategy = strategy;
  }

  executeStrategy(data${typescript ? ': any' : ''})${typescript ? ': any' : ''} {
    return this.strategy.execute(data);
  }
}`;

    return { strategyInterface, contextClass };
  }

  /**
   * 應用 Decorator 模式
   */
  private async applyDecoratorPattern(
    code: string,
    className: string,
    config: PatternRefactorConfig
  ): Promise<PatternRefactorResult> {
    // Decorator 模式實作相對複雜，這裡提供基本架構
    return {
      success: false,
      pattern: 'decorator',
      edits: [],
      modifiedClasses: [],
      errors: ['Decorator 模式需要更詳細的需求分析'],
      warnings: ['建議先分析具體的裝飾需求再實作']
    };
  }

  /**
   * 取得設計模式建議
   */
  async getSuggestions(code: string): Promise<PatternSuggestion[]> {
    return this.analyzer.analyzeSuggestions(code);
  }

  // 輔助方法
  private extractConstructorBody(classBody: string): string {
    // 找到 constructor 並提取其內容
    const constructorStart = classBody.indexOf('constructor');
    if (constructorStart === -1) {return '// 建構子邏輯';}

    // 找到 constructor 的開始大括號
    const braceStart = classBody.indexOf('{', constructorStart);
    if (braceStart === -1) {return '// 建構子邏輯';}

    // 找到對應的結束大括號
    let braceCount = 1;
    let braceEnd = braceStart + 1;
    while (braceCount > 0 && braceEnd < classBody.length) {
      if (classBody[braceEnd] === '{') {braceCount++;}
      if (classBody[braceEnd] === '}') {braceCount--;}
      braceEnd++;
    }

    const constructorBody = classBody.substring(braceStart + 1, braceEnd - 1).trim();
    return constructorBody || '// 建構子邏輯';
  }

  private extractMethodsAndProperties(classBody: string): string {
    // 找到並移除 constructor
    const constructorStart = classBody.indexOf('constructor');
    if (constructorStart === -1) {
      // 沒有 constructor，返回整個類別體
      return classBody.trim();
    }

    // 找到 constructor 的結束位置
    const braceStart = classBody.indexOf('{', constructorStart);
    if (braceStart === -1) {return classBody.trim();}

    let braceCount = 1;
    let braceEnd = braceStart + 1;
    while (braceCount > 0 && braceEnd < classBody.length) {
      if (classBody[braceEnd] === '{') {braceCount++;}
      if (classBody[braceEnd] === '}') {braceCount--;}
      braceEnd++;
    }

    // 移除 constructor 並保留其餘部分
    const beforeConstructor = classBody.substring(0, constructorStart).trim();
    const afterConstructor = classBody.substring(braceEnd).trim();

    let result = '';
    if (beforeConstructor) {result += beforeConstructor + '\n\n  ';}
    if (afterConstructor) {result += afterConstructor;}

    return result.trim();
  }

  private offsetToPosition(code: string, offset: number): { line: number; column: number } {
    const lines = code.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length
    };
  }

  // 文件生成方法
  private generateSingletonDocumentation(className: string): string {
    return `# ${className} Singleton 模式\n\n## 使用方式\n\`\`\`javascript\nconst instance = ${className}.getInstance();\n\`\`\`\n\n## 特點\n- 全域唯一實例\n- 懶載入初始化\n- 執行緒安全（在單執行緒環境）`;
  }

  private generateFactoryDocumentation(className: string): string {
    return `# ${className} Factory 模式\n\n## 使用方式\n\`\`\`javascript\nconst obj = ${className}Factory.create('default');\n\`\`\`\n\n## 特點\n- 封裝物件創建\n- 易於擴展類型\n- 降低耦合度`;
  }

  private generateObserverDocumentation(): string {
    return '# Observer 模式\n\n## 使用方式\n```javascript\nconst observable = new Observable();\nobservable.addObserver(myObserver);\nobservable.notifyObservers(data);\n```\n\n## 特點\n- 鬆耦合設計\n- 動態訂閱\n- 一對多通知';
  }

  private generateStrategyDocumentation(): string {
    return '# Strategy 模式\n\n## 使用方式\n```javascript\nconst context = new Context(new ConcreteStrategy());\nconst result = context.executeStrategy(data);\n```\n\n## 特點\n- 演算法封裝\n- 運行時切換\n- 開放封閉原則';
  }
}