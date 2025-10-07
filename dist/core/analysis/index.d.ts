/**
 * Analysis 模組統一匯出
 * 提供程式碼分析、複雜度分析、死代碼檢測、重複檢測和品質評估功能
 */
export { ComplexityAnalyzer, CyclomaticComplexityAnalyzer, CognitiveComplexityAnalyzer, type ComplexityResult, type ASTNode as ComplexityASTNode } from './complexity-analyzer.js';
export { DeadCodeDetector, UnusedSymbolDetector, UnreachableCodeDetector, type UnusedCode, type Symbol, type Reference } from './dead-code-detector.js';
export { DuplicationDetector, Type1CloneDetector, Type2CloneDetector, Type3CloneDetector, type Clone, type CodeFragment, type DetectionConfig } from './duplication-detector.js';
export { QualityMetricsAnalyzer, MaintainabilityIndex, CodeSmellDetector, type QualityAssessment, type CodeSmell } from './quality-metrics.js';
//# sourceMappingURL=index.d.ts.map