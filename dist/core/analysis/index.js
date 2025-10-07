/**
 * Analysis 模組統一匯出
 * 提供程式碼分析、複雜度分析、死代碼檢測、重複檢測和品質評估功能
 */
// 複雜度分析
export { ComplexityAnalyzer, CyclomaticComplexityAnalyzer, CognitiveComplexityAnalyzer } from './complexity-analyzer.js';
// 死代碼檢測
export { DeadCodeDetector, UnusedSymbolDetector, UnreachableCodeDetector } from './dead-code-detector.js';
// 重複程式碼檢測
export { DuplicationDetector, Type1CloneDetector, Type2CloneDetector, Type3CloneDetector } from './duplication-detector.js';
// 品質指標分析
export { QualityMetricsAnalyzer, MaintainabilityIndex, CodeSmellDetector } from './quality-metrics.js';
//# sourceMappingURL=index.js.map