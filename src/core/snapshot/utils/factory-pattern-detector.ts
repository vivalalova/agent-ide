/**
 * Factory 模式識別器
 * 使用 Parser 語義分析識別模組內的 factory 模式
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import type { PatternInfo } from '@infrastructure/parser/index.js';

/**
 * 識別模組內的 factory 模式
 * @param modulePath 模組路徑
 * @param fileSystem 檔案系統
 * @returns Factory 模式 Map（symbolName → PatternInfo）
 */
export async function identifyFactoryPatterns(
  modulePath: string,
  fileSystem: IFileSystem
): Promise<Map<string, PatternInfo>> {
  const factoryMap = new Map<string, PatternInfo>();

  try {
    const entries = await fileSystem.readDirectory(modulePath);

    for (const entry of entries) {
      if (entry.isDirectory) { continue; }

      const ext = path.extname(entry.name);
      if (!['.ts', '.js', '.tsx', '.jsx'].includes(ext)) { continue; }

      const filePath = path.join(modulePath, entry.name);
      const parser = ParserRegistry.getInstance().getParser(ext);

      if (!parser || !parser.identifyPatterns) { continue; }

      try {
        const content = await fileSystem.readFile(filePath);
        const codeString = typeof content === 'string' ? content : content.toString('utf-8');
        const patterns = parser.identifyPatterns(codeString);

        if (patterns) {
          for (const pattern of patterns) {
            if (pattern.type === 'factory') {
              factoryMap.set(pattern.symbolName, pattern);
            }
          }
        }
      } catch {
        // 忽略單一檔案的解析錯誤，繼續處理其他檔案
      }
    }
  } catch {
    // 忽略目錄讀取錯誤，返回空 Map（fallback 到名稱比對）
  }

  return factoryMap;
}

/**
 * 判斷函數是否為 factory
 * 優先使用 Parser 語義分析結果，若無則 fallback 到名稱比對
 * @param funcName 函數名稱
 * @param factoryPatterns Parser 識別的 factory 模式
 * @returns 是否為 factory
 */
export function isFactory(
  funcName: string,
  factoryPatterns: Map<string, PatternInfo>
): boolean {
  // 優先使用 Parser 語義分析結果
  if (factoryPatterns.has(funcName)) {
    return true;
  }

  // Fallback：Parser 未提供任何結果時，使用名稱比對（向後相容）
  if (factoryPatterns.size === 0 && funcName.startsWith('create')) {
    return true;
  }

  return false;
}
