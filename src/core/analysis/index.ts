/**
 * Analysis 模組統一匯出
 * 提供程式碼品質評估功能（語言特定分析已移至 plugin 層）
 */

// 品質指標分析
export {
  QualityMetricsAnalyzer,
  MaintainabilityIndex,
  CodeSmellDetector,
  type QualityAssessment,
  type CodeSmell
} from './quality-metrics.js';
