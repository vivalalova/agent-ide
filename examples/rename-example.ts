/**
 * Agent IDE 重新命名引擎使用範例
 * 展示如何使用重新命名引擎進行程式碼符號重新命名
 */

import {
  RenameEngine,
  ScopeAnalyzer,
  ReferenceUpdater,
  createRenameOptions
} from '../src/core/transform/symbol/rename/index.js';
import { createSymbol, SymbolType } from '@shared/types/symbol.js';
import { createLocation, createRange, createPosition } from '@shared/types/core.js';

async function demonstrateRenameEngine() {
  console.log('🔧 Agent IDE 重新命名引擎範例\n');

  // 建立重新命名引擎實例
  const renameEngine = new RenameEngine();

  // 1. 基本重新命名範例
  console.log('1. 基本重新命名範例');
  console.log('====================');

  // 建立要重新命名的符號
  const location = createLocation(
    '/project/src/utils.ts',
    createRange(createPosition(5, 10), createPosition(5, 23))
  );

  const symbol = createSymbol('calculateTotal', SymbolType.Function, location);
  const newName = 'computeSum';
  const filePaths = ['/project/src/utils.ts', '/project/src/main.ts'];

  // 建立重新命名選項
  const options = createRenameOptions(symbol, newName, filePaths);

  try {
    // 先預覽重新命名操作
    const preview = await renameEngine.previewRename(options);
    console.log('📋 預覽結果:');
    console.log(`  - 影響檔案數: ${preview.affectedFiles.length}`);
    console.log(`  - 總引用數: ${preview.summary.totalReferences}`);
    console.log(`  - 衝突數: ${preview.summary.conflictCount}`);
    console.log(`  - 預估時間: ${preview.summary.estimatedTime}ms`);

    if (preview.conflicts.length > 0) {
      console.log('⚠️  發現衝突:');
      preview.conflicts.forEach(conflict => {
        console.log(`    ${conflict.type}: ${conflict.message}`);
      });
      return;
    }

    // 執行重新命名
    const result = await renameEngine.rename(options);
    
    if (result.success) {
      console.log('✅ 重新命名成功!');
      console.log(`  - 操作 ID: ${result.renameId}`);
      console.log(`  - 操作數量: ${result.operations.length}`);
      console.log(`  - 影響檔案: ${result.affectedFiles.join(', ')}`);
      
      // 展示撤銷功能
      console.log('\n🔄 測試撤銷功能...');
      await renameEngine.undo(result.renameId);
      console.log('✅ 撤銷成功!');
    } else {
      console.log('❌ 重新命名失敗:', result.errors?.join(', '));
    }

  } catch (error) {
    console.log('❌ 發生錯誤:', error instanceof Error ? error.message : String(error));
  }

  // 2. 跨檔案重新命名範例
  console.log('\n2. 跨檔案重新命名範例');
  console.log('========================');

  const exportedSymbol = createSymbol(
    'UserService',
    SymbolType.Class,
    createLocation(
      '/project/src/services/user.ts',
      createRange(createPosition(3, 1), createPosition(3, 12))
    )
  );

  const projectFiles = [
    '/project/src/services/user.ts',
    '/project/src/controllers/user.ts',
    '/project/src/routes/api.ts',
    '/project/src/main.ts'
  ];

  try {
    const crossFileResult = await (renameEngine as any).renameAcrossFiles(
      exportedSymbol,
      'AuthenticationService',
      projectFiles
    );

    if (crossFileResult.success) {
      console.log('✅ 跨檔案重新命名成功!');
      console.log(`  - 影響檔案數: ${crossFileResult.affectedFiles.length}`);
      console.log(`  - 總操作數: ${crossFileResult.operations.length}`);
    } else {
      console.log('❌ 跨檔案重新命名失敗:', crossFileResult.errors?.join(', '));
    }
  } catch (error) {
    console.log('❌ 跨檔案重新命名發生錯誤:', error instanceof Error ? error.message : String(error));
  }

  // 3. 作用域分析範例
  console.log('\n3. 作用域分析範例');
  console.log('===================');

  const scopeAnalyzer = new ScopeAnalyzer();
  
  // 注意：在實際使用中需要提供真實的 AST
  console.log('作用域分析器已初始化，可用於:');
  console.log('  - 分析變數作用域');
  console.log('  - 檢測變數遮蔽');
  console.log('  - 驗證符號可見性');

  // 4. 引用更新範例
  console.log('\n4. 引用更新範例');
  console.log('===================');

  const referenceUpdater = new ReferenceUpdater();
  
  try {
    const references = await referenceUpdater.findSymbolReferences(
      '/project/src/utils.ts',
      'helper'
    );
    
    console.log(`📍 找到 ${references.length} 個符號引用`);
    
  } catch (error) {
    console.log('❌ 引用搜尋發生錯誤:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n🎉 範例完成!');
  console.log('\n📚 重新命名引擎功能總結:');
  console.log('  ✅ 智能符號重新命名');
  console.log('  ✅ 跨檔案引用更新');  
  console.log('  ✅ 作用域衝突檢測');
  console.log('  ✅ 批次操作支援');
  console.log('  ✅ 操作預覽功能');
  console.log('  ✅ 撤銷操作支援');
  console.log('  ✅ 完整的型別安全');
}

// 執行範例
if (require.main === module) {
  demonstrateRenameEngine().catch(console.error);
}

export { demonstrateRenameEngine };