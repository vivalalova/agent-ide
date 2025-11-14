/**
 * Search 命令處理器
 * 處理各種搜尋相關的命令操作
 */

import * as path from 'path';
import { SearchService } from '../../../core/search/service.js';
import { IndexEngine } from '../../../core/indexing/index-engine.js';
import { createIndexConfig } from '../../../core/indexing/types.js';
import * as FormatUtils from '../utils/format-utils.js';
import * as SearchUtils from '../utils/search-utils.js';

/**
 * 處理搜尋命令
 */
export async function handleSearchCommand(query: string, options: any, searchService?: SearchService): Promise<void> {
  const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

  if (!isMinimalOrJson) {
    console.log(`🔍 搜尋: "${query}"`);
  }

  try {
    // 初始化搜尋服務
    if (!searchService) {
      searchService = new SearchService();
    }

    // 建構搜尋選項
    const searchOptions = SearchUtils.buildSearchOptions(options);

    // 根據搜尋類型建立查詢
    const searchQuery = {
      type: 'text' as const,
      query,
      options: searchOptions
    };

    // 執行搜尋
    const startTime = Date.now();
    const result = await searchService.searchText(searchQuery);
    const searchTime = Date.now() - startTime;

    // 顯示結果
    if (result.matches.length === 0) {
      if (!isMinimalOrJson) {
        console.log('📝 沒有找到匹配結果');
      } else if (options.format === 'json') {
        // JSON 格式輸出空結果
        console.log(JSON.stringify({ results: [] }, null, 2));
      }
      return;
    }

    if (!isMinimalOrJson) {
      console.log(`✅ 找到 ${result.matches.length} 個結果 (${searchTime}ms)`);

      if (result.truncated) {
        console.log(`⚠️  結果已截斷，顯示前 ${options.limit} 個結果`);
      }
    }

    // 格式化輸出
    FormatUtils.formatSearchResults(result, options);

  } catch (error) {
    if (isMinimalOrJson) {
      // 對於 minimal 和 json 格式，輸出空結果或錯誤
      if (options.format === 'json') {
        console.log(JSON.stringify({ matches: [], error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      console.error('❌ 搜尋失敗:', error instanceof Error ? error.message : error);
    }
    // 測試環境不 exit
    if (process.env.NODE_ENV !== 'test') {
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  }
}

/**
 * 處理文字搜尋命令
 */
export async function handleTextSearchCommand(options: any, searchService?: SearchService): Promise<void> {
  const query = options.query;

  if (!query) {
    console.error('❌ 文字搜尋需要指定 --query 參數');
    console.error('   使用方式: agent-ide search text --query <text>');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  // 使用既有的 handleSearchCommand 邏輯
  await handleSearchCommand(query, options, searchService);
}

/**
 * 處理結構化搜尋命令
 */
export async function handleStructuralSearchCommand(options: any): Promise<void> {
  const pattern = options.pattern;
  const type = options.type;

  if (!type) {
    console.error('❌ 結構化搜尋需要指定 --type 參數');
    console.error('   使用方式: agent-ide search structural --type <class|protocol|function|...> [--pattern <pattern>]');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

  if (!isMinimalOrJson) {
    console.log(`🔍 結構化搜尋: ${type}${pattern ? ` (pattern: ${pattern})` : ''}`);
  }

  try {
    const searchPath = path.resolve(options.path || process.cwd());

    // 初始化索引引擎
    const config = createIndexConfig(searchPath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
    });
    const indexEngine = new IndexEngine(config);

    // 建立索引
    if (!isMinimalOrJson) {
      console.log('📝 正在建立索引...');
    }
    await indexEngine.indexProject(searchPath);

    // 獲取所有符號
    const allSymbols = await indexEngine.getAllSymbols();

    // 過濾符號
    let filteredSymbols = allSymbols.filter(symbolResult => {
      const symbol = symbolResult.symbol;

      // 1. 過濾檔案模式
      if (options.filePattern) {
        const regex = new RegExp(options.filePattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        if (!regex.test(symbol.location.filePath)) {
          return false;
        }
      }

      // 2. 過濾符號類型
      if (type) {
        if (symbol.type !== type) {
          return false;
        }
      }

      // 3. 過濾符號名稱模式
      if (pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        if (!regex.test(symbol.name)) {
          return false;
        }
      }

      // 4. 過濾屬性
      if (options.withAttribute) {
        if (!(symbol as any).attributes || !(symbol as any).attributes.includes(options.withAttribute)) {
          return false;
        }
      }

      // 5. 過濾修飾符
      if (options.withModifier) {
        if (!(symbol as any).modifiers || !(symbol as any).modifiers.includes(options.withModifier)) {
          return false;
        }
      }

      // 6. 過濾實作的協定
      if (options.implements) {
        if (!(symbol as any).implements || !(symbol as any).implements.includes(options.implements)) {
          return false;
        }
      }

      // 7. 過濾繼承的類別
      if (options.extends) {
        if ((symbol as any).superclass !== options.extends) {
          return false;
        }
      }

      return true;
    });

    // 應用 limit
    const limit = options.limit ? parseInt(options.limit) : 50;
    if (filteredSymbols.length > limit) {
      filteredSymbols = filteredSymbols.slice(0, limit);
    }

    if (filteredSymbols.length === 0) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ results: [] }, null, 2));
      } else if (!isMinimalOrJson) {
        console.log('📝 沒有找到符合條件的符號');
      }
      return;
    }

    if (!isMinimalOrJson && options.format !== 'summary') {
      console.log(`✅ 找到 ${filteredSymbols.length} 個符號`);
    }

    // 格式化輸出
    FormatUtils.formatSymbolSearchResults(filteredSymbols, options);

  } catch (error) {
    if (isMinimalOrJson) {
      if (options.format === 'json') {
        console.log(JSON.stringify({
          results: [],
          error: error instanceof Error ? error.message : String(error)
        }));
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      console.error('❌ 結構化搜尋失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}

/**
 * 處理符號搜尋命令
 */
export async function handleSymbolSearchCommand(options: any): Promise<void> {
  const symbolName = options.query;

  if (!symbolName) {
    console.error('❌ 符號搜尋需要指定 --query 參數');
    console.error('   使用方式: agent-ide search symbol --query <name>');
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  const isMinimalOrJson = options.format === 'minimal' || options.format === 'json';

  if (!isMinimalOrJson) {
    console.log(`🔍 搜尋符號: "${symbolName}"`);
  }

  try {
    const searchPath = path.resolve(options.path || process.cwd());

    // 初始化索引引擎（每次都重新建立以確保索引是最新的）
    const config = createIndexConfig(searchPath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*', 'dist/**']
    });
    const indexEngine = new IndexEngine(config);

    // 建立索引
    if (!isMinimalOrJson) {
      console.log('📝 正在建立索引...');
    }
    await indexEngine.indexProject(searchPath);

    // 搜尋符號：如果包含 wildcard，使用模式搜尋
    let results: any[];
    if (symbolName.includes('*') || symbolName.includes('?')) {
      // Wildcard 模式搜尋
      const allSymbols = await indexEngine.getAllSymbols();
      const pattern = symbolName
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${pattern}$`);

      results = allSymbols.filter(result => regex.test(result.symbol.name));

      // 應用 limit
      const limit = options.limit ? parseInt(options.limit) : 50;
      if (results.length > limit) {
        results = results.slice(0, limit);
      }
    } else {
      // 精確名稱搜尋
      results = await indexEngine.findSymbol(symbolName);
    }

    if (results.length === 0) {
      if (options.format === 'json') {
        console.log(JSON.stringify({ results: [] }, null, 2));
      } else if (!isMinimalOrJson) {
        console.log(`📝 找不到符號 "${symbolName}"`);
      }
      return;
    }

    if (!isMinimalOrJson) {
      console.log(`✅ 找到 ${results.length} 個符號`);
    }

    // 格式化輸出
    FormatUtils.formatSymbolSearchResults(results, options);

  } catch (error) {
    if (isMinimalOrJson) {
      if (options.format === 'json') {
        console.log(JSON.stringify({
          results: [],
          error: error instanceof Error ? error.message : String(error)
        }));
      } else {
        console.error(`Error: ${error instanceof Error ? error.message : error}`);
      }
    } else {
      console.error('❌ 符號搜尋失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
