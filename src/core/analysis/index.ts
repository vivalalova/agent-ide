/**
 * Analysis 模組統一匯出
 * 提供程式碼分析、複雜度分析、死代碼檢測、重複檢測和品質評估功能
 */

// 複雜度分析
export {
  ComplexityAnalyzer,
  CyclomaticComplexityAnalyzer,
  CognitiveComplexityAnalyzer,
  type ComplexityResult,
  type ASTNode as ComplexityASTNode
} from './complexity-analyzer';

// 死代碼檢測
export {
  DeadCodeDetector,
  UnusedSymbolDetector,
  UnreachableCodeDetector,
  type UnusedCode,
  type Symbol,
  type Reference
} from './dead-code-detector';

// 重複程式碼檢測
export {
  DuplicationDetector,
  Type1CloneDetector,
  Type2CloneDetector,
  Type3CloneDetector,
  type Clone,
  type CodeFragment,
  type DetectionConfig
} from './duplication-detector';

// 品質指標分析
export {
  QualityMetricsAnalyzer,
  MaintainabilityIndex,
  CodeSmellDetector,
  type QualityAssessment,
  type CodeSmell
} from './quality-metrics';