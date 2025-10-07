/**
 * 設計模式重構器
 * 提供常見設計模式的自動重構功能
 */
export interface Range {
    start: {
        line: number;
        column: number;
    };
    end: {
        line: number;
        column: number;
    };
}
export interface CodeEdit {
    range: Range;
    newText: string;
    type: 'replace' | 'insert' | 'delete';
}
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
export type DesignPattern = 'singleton' | 'factory' | 'observer' | 'strategy' | 'decorator' | 'adapter' | 'facade' | 'builder' | 'template-method' | 'command';
export interface PatternRefactorResult {
    success: boolean;
    pattern: DesignPattern;
    edits: CodeEdit[];
    createdFiles?: {
        path: string;
        content: string;
    }[];
    modifiedClasses: string[];
    errors: string[];
    warnings: string[];
    documentation?: string;
}
export interface PatternRefactorConfig {
    generateTests: boolean;
    addDocumentation: boolean;
    useTypeScript: boolean;
    preserveComments: boolean;
    outputDirectory?: string;
}
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
export declare class DesignPatternAnalyzer {
    /**
     * 分析程式碼並建議設計模式
     */
    analyzeSuggestions(code: string): PatternSuggestion[];
    /**
     * 分析 Singleton 模式適用性
     */
    private analyzeSingleton;
    /**
     * 分析 Factory 模式適用性
     */
    private analyzeFactory;
    /**
     * 分析 Observer 模式適用性
     */
    private analyzeObserver;
    /**
     * 分析 Strategy 模式適用性
     */
    private analyzeStrategy;
    /**
     * 分析 Decorator 模式適用性
     */
    private analyzeDecorator;
    /**
     * 簡化的類別解析
     */
    private parseClasses;
    /**
     * 解析方法
     */
    private parseMethods;
    /**
     * 解析屬性
     */
    private parseProperties;
    /**
     * 獲取匹配位置
     */
    private getMatchLocation;
    /**
     * 偏移量轉位置
     */
    private offsetToPosition;
}
/**
 * 設計模式重構器主類
 */
export declare class DesignPatternRefactorer {
    private analyzer;
    /**
     * 應用設計模式重構
     */
    applyPattern(code: string, pattern: DesignPattern, className: string, config?: PatternRefactorConfig): Promise<PatternRefactorResult>;
    /**
     * 應用 Singleton 模式
     */
    private applySingletonPattern;
    /**
     * 生成 Singleton 程式碼
     */
    private generateSingletonCode;
    /**
     * 應用 Factory 模式
     */
    private applyFactoryPattern;
    /**
     * 生成 Factory 程式碼
     */
    private generateFactoryCode;
    /**
     * 應用 Observer 模式
     */
    private applyObserverPattern;
    /**
     * 生成 Observer 模式程式碼
     */
    private generateObserverCode;
    /**
     * 應用 Strategy 模式
     */
    private applyStrategyPattern;
    /**
     * 生成 Strategy 模式程式碼
     */
    private generateStrategyCode;
    /**
     * 應用 Decorator 模式
     */
    private applyDecoratorPattern;
    /**
     * 取得設計模式建議
     */
    getSuggestions(code: string): Promise<PatternSuggestion[]>;
    private extractConstructorBody;
    private extractMethodsAndProperties;
    private offsetToPosition;
    private generateSingletonDocumentation;
    private generateFactoryDocumentation;
    private generateObserverDocumentation;
    private generateStrategyDocumentation;
}
//# sourceMappingURL=design-patterns.d.ts.map