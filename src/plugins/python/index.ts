/**
 * Python Plugin 統一匯出
 */

// 主 Parser
export { PythonParser, createPythonParser } from './parser.js';

// 型別
export * from './types.js';

// 工具
export {
  initializeParser,
  parseCode,
  createPythonAST,
  disposeParser,
  isParserInitialized,
  convertNode,
  traverseAST,
  findNodesByKind,
  findNodeAtPosition,
  getNodeText,
  getFieldNode
} from './tree-sitter-bridge.js';

// 符號提取
export { PythonSymbolExtractor, createSymbolExtractor } from './symbol-extractor.js';

// 依賴分析
export {
  PythonDependencyAnalyzer,
  createDependencyAnalyzer,
  type DependencyGraphNode,
  type ImportInfo,
  type ClassifiedDependencies
} from './dependency-analyzer.js';

// 分析器
export { PythonComplexityAnalyzer } from './analyzers/complexity-analyzer.js';
export { PythonUnusedSymbolDetector } from './analyzers/unused-symbol-detector.js';
export { PythonTypeSafetyChecker } from './analyzers/type-safety-checker.js';
export { PythonErrorHandlingChecker } from './analyzers/error-handling-checker.js';
export { PythonSecurityChecker } from './analyzers/security-checker.js';
export { PythonNamingChecker } from './analyzers/naming-checker.js';
export { PythonPatternDetector } from './analyzers/pattern-detector.js';
export { PythonDuplicationDetector } from './analyzers/duplication-detector.js';
