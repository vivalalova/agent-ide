/**
 * 呼叫層次分析模組
 * 分析函數的呼叫者（incoming）和被呼叫者（outgoing）
 */

import { CallHierarchyAnalyzer } from './call-hierarchy-analyzer.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

export { CallHierarchyAnalyzer };

export type {
  OutgoingCall,
  IncomingCall,
  CallHierarchyOptions,
  CallHierarchyData
} from './call-hierarchy-analyzer.js';

/**
 * 建立呼叫層次分析器的便利函式
 * @param parserRegistry Parser 註冊表
 * @param fileSystem 檔案系統
 * @returns 呼叫層次分析器實例
 */
export function createCallHierarchyAnalyzer(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): CallHierarchyAnalyzer {
  return new CallHierarchyAnalyzer(parserRegistry, fileSystem);
}
