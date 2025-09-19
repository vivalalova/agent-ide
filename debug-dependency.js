#!/usr/bin/env node

/**
 * 調試依賴分析問題
 */

import('./dist/core/dependency/dependency-analyzer.js').then(async (module) => {
  console.log('Testing DependencyAnalyzer impact analysis...');
  
  const { DependencyAnalyzer } = module;
  const analyzer = new DependencyAnalyzer();
  
  // Mock 檔案系統
  const fs = await import('fs/promises');
  const fsSync = await import('fs');
  
  const mockFiles = {
    '/src/file1.ts': `
      import { helper } from './file2';
      import { utils } from './utils';
      export class File1 {}
    `,
    '/src/file2.ts': `
      import { config } from './file3';
      export const helper = () => {};
    `,
    '/src/file3.ts': `
      import { File1 } from './file1';
      export const config = {};
    `,
    '/src/utils.ts': `
      export const utils = {};
    `,
    '/src/isolated.ts': `
      export const isolated = {};
    `
  };
  
  // Mock fs functions
  const originalReadFile = fs.readFile;
  const originalStat = fs.stat;
  const originalAccess = fs.access;
  const originalExistsSync = fsSync.existsSync;
  
  fs.readFile = async (filePath) => {
    const content = mockFiles[filePath];
    if (content) {
      return content;
    }
    throw new Error('File not found: ' + filePath);
  };
  
  fs.stat = async (filePath) => {
    if (mockFiles[filePath]) {
      return { 
        mtime: new Date(),
        isDirectory: () => false,
        isFile: () => true 
      };
    }
    throw new Error('File not found: ' + filePath);
  };
  
  fs.access = async (filePath) => {
    // 檢查原檔案或副檔名變體
    const variants = [
      filePath,
      filePath + '.ts',
      filePath + '.js',
      filePath + '.tsx',
      filePath + '.jsx'
    ];
    
    for (const variant of variants) {
      if (mockFiles[variant]) {
        return;
      }
    }
    
    throw new Error('File not found: ' + filePath);
  };
  
  fsSync.existsSync = (filePath) => {
    const variants = [
      filePath,
      filePath + '.ts',
      filePath + '.js',
      filePath + '.tsx',
      filePath + '.jsx'
    ];
    
    for (const variant of variants) {
      if (mockFiles[variant]) {
        return true;
      }
    }
    
    return false;
  };
  
  try {
    // 分析專案
    console.log('Analyzing project...');
    await analyzer.analyzeProject('/src');
    
    console.log('Getting impacted files for /src/file2.ts...');
    const impact = analyzer.getImpactedFiles('/src/file2.ts');
    
    console.log('Impacted files:', impact);
    console.log('Impact count:', impact.length);
    
    // 檢查依賴關係
    console.log('\nDependency relationships:');
    console.log('file1.ts dependencies:', analyzer.getDependencies('/src/file1.ts'));
    console.log('file2.ts dependencies:', analyzer.getDependencies('/src/file2.ts'));
    console.log('file3.ts dependencies:', analyzer.getDependencies('/src/file3.ts'));
    
    console.log('\nDependent relationships:');
    console.log('file1.ts dependents:', analyzer.getDependents('/src/file1.ts'));
    console.log('file2.ts dependents:', analyzer.getDependents('/src/file2.ts'));
    console.log('file3.ts dependents:', analyzer.getDependents('/src/file3.ts'));
    
    // 測試 getAffectedTests
    console.log('\nTesting getAffectedTests...');
    const affectedTests = analyzer.getAffectedTests('/src/file1.ts');
    console.log('Affected tests for file1.ts:', affectedTests);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // 恢復原始函數
    fs.readFile = originalReadFile;
    fs.stat = originalStat;
    fs.access = originalAccess;
    fsSync.existsSync = originalExistsSync;
  }
});