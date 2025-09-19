#!/usr/bin/env node

/**
 * 測試Parser註冊和插件系統
 */

console.log('Testing Parser Registration...');

import('./dist/infrastructure/parser/index.js').then(async (parserModule) => {
  const { ParserRegistry } = parserModule;
  
  // 匯入TypeScript Parser
  const tsModule = await import('./dist/plugins/typescript/index.js');
  const { TypeScriptParser } = tsModule;
  
  console.log('✓ Modules loaded');
  
  try {
    // 獲取註冊中心實例
    const registry = ParserRegistry.getInstance();
    console.log('✓ Parser registry obtained');
    
    // 註冊TypeScript Parser
    const tsParser = new TypeScriptParser();
    await registry.register(tsParser);
    console.log('✓ TypeScript Parser registered');
    
    // 測試查詢已註冊的Parser
    const registeredParsers = registry.listParsers();
    console.log(`✓ Found ${registeredParsers.length} registered parsers`);
    
    registeredParsers.forEach(info => {
      console.log(`  - ${info.name} v${info.version}`);
      console.log(`    Extensions: ${info.supportedExtensions.join(', ')}`);
      console.log(`    Languages: ${info.supportedLanguages.join(', ')}`);
    });
    
    // 測試根據副檔名查找Parser
    const tsParserForFile = registry.getParser('.ts');
    if (tsParserForFile) {
      console.log(`✓ Found parser for .ts files: ${tsParserForFile.name}`);
    } else {
      console.log('❌ No parser found for .ts files');
    }
    
    // 測試根據語言查找Parser
    const tsParserForLang = registry.getParserByLanguage('typescript');
    if (tsParserForLang) {
      console.log(`✓ Found parser for TypeScript language: ${tsParserForLang.name}`);
    } else {
      console.log('❌ No parser found for TypeScript language');
    }
    
    console.log('\n✅ Parser registration tests completed successfully');
    
  } catch (error) {
    console.error('❌ Parser registration test failed:', error.message);
    console.error(error.stack);
  }
  
}).catch(error => {
  console.error('❌ Parser module import failed:', error.message);
});