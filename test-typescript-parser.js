#!/usr/bin/env node

/**
 * 測試TypeScript Parser插件功能
 */

console.log('Testing TypeScript Parser...');

import('./dist/plugins/typescript/index.js').then(async (tsModule) => {
  console.log('✓ TypeScript Parser module loaded');
  
  try {
    const { TypeScriptParser } = tsModule;
    const parser = new TypeScriptParser();
    console.log('✓ TypeScript Parser created');
    
    // 測試基本資訊
    console.log(`Parser name: ${parser.name}`);
    console.log(`Supported extensions: ${parser.supportedExtensions.join(', ')}`);
    console.log(`Supported languages: ${parser.supportedLanguages.join(', ')}`);
    
    // 測試解析簡單的TypeScript程式碼
    const testCode = `
      interface User {
        id: number;
        name: string;
      }
      
      function getUserName(user: User): string {
        return user.name;
      }
      
      const users: User[] = [];
    `;
    
    console.log('🔍 Testing code parsing...');
    const ast = await parser.parse(testCode, 'test.ts');
    console.log('✓ Code parsed successfully');
    console.log(`AST type: ${ast.type}`);
    console.log(`Source file: ${ast.sourceFile}`);
    
    // 測試符號提取
    console.log('🔍 Testing symbol extraction...');
    const symbols = await parser.extractSymbols(ast);
    console.log(`✓ Found ${symbols.length} symbols`);
    
    symbols.forEach(symbol => {
      console.log(`  - ${symbol.name} (${symbol.type})`);
    });
    
    // 測試依賴分析
    const testCodeWithImports = `
      import { readFile } from 'fs/promises';
      import * as path from 'path';
      import { SomeType } from './types';
      
      export class FileProcessor {
        async process(filePath: string) {
          const content = await readFile(filePath, 'utf8');
          return content;
        }
      }
    `;
    
    console.log('🔍 Testing dependency extraction...');
    const astWithDeps = await parser.parse(testCodeWithImports, 'processor.ts');
    const dependencies = await parser.extractDependencies(astWithDeps);
    console.log(`✓ Found ${dependencies.length} dependencies`);
    
    dependencies.forEach(dep => {
      console.log(`  - ${dep.path} (${dep.type}${dep.isRelative ? ', relative' : ''})`);
    });
    
    console.log('\n✅ TypeScript Parser tests completed successfully');
    
  } catch (error) {
    console.error('❌ TypeScript Parser test failed:', error.message);
    console.error(error.stack);
  }
  
}).catch(error => {
  console.error('❌ TypeScript Parser module import failed:', error.message);
});