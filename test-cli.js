#!/usr/bin/env node

/**
 * 測試 CLI 基本功能
 */

console.log('Testing CLI functionality...');

try {
  // 測試導入 CLI 類別
  import('./dist/interfaces/cli/index.js').then(cliModule => {
    console.log('✓ CLI module loaded');
    
    // 測試創建 CLI 實例
    const { AgentIdeCLI } = cliModule;
    const cli = new AgentIdeCLI();
    console.log('✓ AgentIdeCLI created');
    
    // 測試顯示版本
    console.log('Testing --version flag...');
    cli.run(['node', 'agent-ide', '--version']).then(() => {
      console.log('✓ Version command works');
    }).catch(error => {
      console.log('⚠ Version command error:', error.message);
    });
    
    // 測試顯示幫助
    console.log('Testing --help flag...');
    cli.run(['node', 'agent-ide', '--help']).then(() => {
      console.log('✓ Help command works');
    }).catch(error => {
      console.log('⚠ Help command error:', error.message);
    });
  }).catch(error => {
    console.error('❌ CLI module import failed:', error.message);
  });

} catch (error) {
  console.error('❌ CLI test failed:', error.message);
}