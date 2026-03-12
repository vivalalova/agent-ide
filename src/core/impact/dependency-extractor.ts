/**
 * 依賴提取器
 * 負責從檔案內容中提取 import 依賴
 */

import * as path from 'path';
import { Dependency, DependencyType } from '@shared/types/index.js';
import type { ExtendedDependencyAnalysisOptions } from './types.js';
import type { PathResolver } from './path-resolver.js';
import type { FileScanner } from './file-scanner.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';

/**
 * 依賴提取器類別
 */
export class DependencyExtractor {
  private options: ExtendedDependencyAnalysisOptions;
  private pathResolver: PathResolver;
  private fileScanner: FileScanner;

  constructor(
    options: ExtendedDependencyAnalysisOptions,
    pathResolver: PathResolver,
    fileScanner: FileScanner
  ) {
    this.options = options;
    this.pathResolver = pathResolver;
    this.fileScanner = fileScanner;
  }

  /**
   * 從檔案內容中提取依賴關係
   * @param content 檔案內容
   * @param filePath 檔案路徑
   * @returns 依賴列表
   */
  async extractDependencies(content: string, filePath: string): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const fileExt = path.extname(filePath);

    try {
      // 簡單的正則表達式解析（實際應該使用 AST）
      let importRegex: RegExp;

      switch (fileExt) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        // 支援 import type { ... } 語法，capture group 1 = 'type '，group 2 = path
        importRegex = /import\s+(type\s+)?(?:{[^}]*}|\*\s+as\s+\w+|\w+)?\s*from\s+['"`]([^'"`]+)['"`]/g;
        break;
      default:
        return dependencies; // 不支援的檔案類型
      }

      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const isTypeOnly = !!match[1];
        const importPath = match[2];
        const resolvedPath = await this.pathResolver.resolvePath(importPath, filePath);

        if (resolvedPath && this.fileScanner.shouldIncludeDependency(resolvedPath.resolvedPath)) {
          dependencies.push({
            path: resolvedPath.resolvedPath, // 使用解析後的絕對路徑
            type: DependencyType.Import,
            isRelative: resolvedPath.isRelative,
            importedSymbols: [], // 簡化實作，實際應該解析 import 語句
            isTypeOnly,
          });
        }
      }
    } catch (error) {
      // 解析錯誤，回傳空陣列而不拋出錯誤
      if (this.options.verbose !== false) {
        diagnostics.warn('impact/dependency-extractor', 'AST_PARSE_FAILED', `解析檔案時發生錯誤: ${error instanceof Error ? error.message : String(error)}`, filePath);
      }
    }

    return dependencies;
  }
}
