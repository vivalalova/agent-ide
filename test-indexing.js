#!/usr/bin/env node

/**
 * 測試索引功能的實際操作
 */

console.log('Testing Indexing Engine...');

import('./dist/core/indexing/index.js').then(async (indexModule) => {
  const { IndexEngine, createIndexConfig } = indexModule;
  
  // 匯入Parser相關模組
  const parserModule = await import('./dist/infrastructure/parser/index.js');
  const { ParserRegistry } = parserModule;
  
  const tsModule = await import('./dist/plugins/typescript/index.js');
  const { TypeScriptParser } = tsModule;
  
  console.log('✓ Modules loaded');
  
  try {
    // 註冊TypeScript Parser
    const registry = ParserRegistry.getInstance();
    const tsParser = new TypeScriptParser();
    await registry.register(tsParser);
    console.log('✓ TypeScript Parser registered');
    
    // 建立索引配置
    const config = createIndexConfig('./test-project', {
      includeExtensions: ['.ts', '.tsx'],
      excludePatterns: ['node_modules/**', '*.test.*', '*.spec.*']
    });
    console.log('✓ Index configuration created');
    
    // 建立索引引擎
    const indexEngine = new IndexEngine(config);
    console.log('✓ Index engine created');
    
    // 執行索引操作
    console.log('🔍 Starting indexing...');
    await indexEngine.indexProject('./test-project');
    console.log('✅ Indexing completed');
    
    // 取得統計資訊
    const stats = await indexEngine.getStats();
    console.log('📊 Indexing statistics:');
    console.log(`  - Total files: ${stats.totalFiles}`);
    console.log(`  - Total symbols: ${stats.totalSymbols}`);
    console.log(`  - Index size: ${stats.indexSize} bytes`);
    
    // 測試檔案查詢
    console.log('\n🔍 Testing file queries...');
    const fileIndex = indexEngine.fileIndex;
    const allFiles = Array.from(fileIndex.fileEntries.keys());
    console.log('Indexed files:');
    allFiles.forEach(filePath => {
      console.log(`  - ${filePath}`);
    });
    
    // 測試符號查詢
    console.log('\n🔍 Testing symbol queries...');
    const symbolIndex = indexEngine.symbolIndex;
    
    // 測試每個檔案的符號
    for (const filePath of allFiles) {
      const fileSymbols = await symbolIndex.getFileSymbols(filePath);
      console.log(`Symbols in ${filePath}:`);
      fileSymbols.forEach(symbol => {
        console.log(`  - ${symbol.name} (${symbol.type})`);
      });
    }
    
    // 測試搜尋功能
    console.log('\n🔍 Testing symbol search...');
    const userSymbols = await symbolIndex.searchSymbols('User');
    console.log(`Found ${userSymbols.length} symbols matching 'User':`);
    userSymbols.forEach(result => {
      console.log(`  - ${result.symbol.name} (${result.symbol.type}, score: ${result.score})`);
    });
    
    console.log('\n✅ Indexing engine tests completed successfully');
    
  } catch (error) {
    console.error('❌ Indexing test failed:', error.message);
    console.error(error.stack);
  }
  
}).catch(error => {
  console.error('❌ Module import failed:', error.message);
});