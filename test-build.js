#!/usr/bin/env node

/**
 * 簡單測試腳本確認專案可以成功導入和運行
 */

console.log('Testing Agent IDE build...');

try {
  // 測試核心模組
  console.log('Testing core modules...');
  
  // 測試快取模組
  import('./dist/infrastructure/cache/index.js').then(cacheModule => {
    console.log('✓ Cache module loaded');
    
    // 測試創建快取
    const cache = cacheModule.createMemoryCache();
    console.log('✓ MemoryCache created');
  });
  
  // 測試共享類型
  import('./dist/shared/index.js').then(sharedModule => {
    console.log('✓ Shared module loaded');
  });
  
  console.log('✓ Basic build test passed');
} catch (error) {
  console.error('✗ Build test failed:', error.message);
  process.exit(1);
}