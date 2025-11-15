/**
 * Rename 命令處理器
 * 處理符號重命名相關的命令操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IndexEngine } from '@core/indexing/index-engine.js';
import { RenameEngine } from '@core/rename/rename-engine.js';
import { createIndexConfig } from '@core/indexing/types.js';
import * as FileUtils from '@interfaces/cli/utils/file-utils.js';

/**
 * 處理重命名命令
 */
export async function handleRenameCommand(options: any, renameEngine?: RenameEngine, indexEngine?: IndexEngine): Promise<void> {
  // 支援多種參數名稱
  const from = options.symbol || options.from;
  const to = options.newName || options.to;
  const isJsonFormat = options.format === 'json';

  if (!from || !to) {
    if (isJsonFormat) {
      console.error(JSON.stringify({ error: '必須指定符號名稱和新名稱' }));
    } else {
      console.error('❌ 必須指定符號名稱和新名稱');
      console.error('   使用方式: agent-ide rename --symbol <name> --new-name <name>');
    }
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  if (!isJsonFormat) {
    console.log(`🔄 重新命名 ${from} → ${to}`);
  }

  try {
    let workspacePath = options.path || process.cwd();

    // 如果路徑指向檔案，取其所在目錄
    const stats = await fs.stat(workspacePath);
    if (stats.isFile()) {
      workspacePath = path.dirname(workspacePath);
      // 往上查找專案根目錄（包含 package.json、.git 等）
      let currentDir = workspacePath;
      while (currentDir !== path.dirname(currentDir)) {
        const hasPackageJson = await FileUtils.fileExists(path.join(currentDir, 'package.json'));
        const hasGit = await FileUtils.fileExists(path.join(currentDir, '.git'));
        const hasSwiftPackage = await FileUtils.fileExists(path.join(currentDir, 'Package.swift'));
        if (hasPackageJson || hasGit || hasSwiftPackage) {
          workspacePath = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }
    }

    // 初始化索引引擎（每次都重新索引以確保資料是最新的）
    const config = createIndexConfig(workspacePath, {
      includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.swift'],
      excludePatterns: ['node_modules/**', '*.test.*']
    });
    const localIndexEngine = indexEngine || new IndexEngine(config);
    await localIndexEngine.indexProject(workspacePath);

    // 初始化重新命名引擎
    const localRenameEngine = renameEngine || new RenameEngine();

    // 1. 查找符號
    if (!isJsonFormat) {
      console.log(`🔍 查找符號 "${from}"...`);
    }
    const searchResults = await localIndexEngine.findSymbol(from);

    if (searchResults.length === 0) {
      if (isJsonFormat) {
        console.error(JSON.stringify({ error: `找不到符號 "${from}"` }));
      } else {
        console.log(`❌ 找不到符號 "${from}"`);
      }
      process.exit(1);
    }

    if (searchResults.length > 1 && !isJsonFormat) {
      console.log('⚠️  找到多個符號，使用第一個:');
      searchResults.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.symbol.name} 在 ${result.symbol.location.filePath}:${result.symbol.location.range.start.line}`);
      });
    }

    const targetSymbol = searchResults[0].symbol;

    // 2. 預覽變更
    if (options.preview) {
      if (!isJsonFormat) {
        console.log('🔍 預覽變更...');
      }
      try {
        // 取得所有專案檔案以進行跨檔案引用查找
        // 使用 workspacePath（已解析為目錄）而不是 options.path（可能是檔案）
        const allProjectFiles = await FileUtils.getAllProjectFiles(workspacePath);

        const preview = await localRenameEngine.previewRename({
          symbol: targetSymbol,
          newName: to,
          filePaths: allProjectFiles
        });

        if (isJsonFormat) {
          console.log(JSON.stringify({
            preview: true,
            affectedFiles: preview.affectedFiles.length,
            operations: preview.operations.length,
            conflicts: preview.conflicts
          }, null, 2));
        } else {
          console.log('📝 預計變更:');
          console.log(`   檔案數: ${preview.affectedFiles.length}`);
          console.log(`   操作數: ${preview.operations.length}`);

          if (preview.conflicts.length > 0) {
            console.log('⚠️  發現衝突:');
            preview.conflicts.forEach(conflict => {
              console.log(`   - ${conflict.message}`);
            });
          }

          preview.operations.forEach(op => {
            console.log(`   ${op.filePath}: "${op.oldText}" → "${op.newText}"`);
          });

          console.log('✅ 預覽完成');
        }
        return;
      } catch (previewError) {
        if (isJsonFormat) {
          console.error(JSON.stringify({ error: previewError instanceof Error ? previewError.message : String(previewError) }));
        } else {
          console.error('❌ 預覽失敗:', previewError instanceof Error ? previewError.message : previewError);
        }
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }
    }

    // 3. 執行重新命名（處理跨檔案引用）
    if (!isJsonFormat) {
      console.log('✏️  執行重新命名...');
    }

    // 取得所有專案檔案（使用與 preview 相同的邏輯）
    // 使用 workspacePath（已解析為目錄）而不是 options.path（可能是檔案）
    const allProjectFiles = await FileUtils.getAllProjectFiles(workspacePath);

    // 使用 renameEngine 執行重新命名（與 preview 使用相同的引擎）
    const renameResult = await localRenameEngine.rename({
      symbol: targetSymbol,
      newName: to,
      filePaths: allProjectFiles
    });

    if (renameResult.success) {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          affectedFiles: renameResult.affectedFiles.length,
          operations: renameResult.operations.length,
          files: renameResult.affectedFiles
        }, null, 2));
      } else {
        console.log('✅ 重新命名成功!');
        console.log(`📊 統計: ${renameResult.affectedFiles.length} 檔案, ${renameResult.operations.length} 變更`);

        renameResult.operations.forEach(operation => {
          console.log(`   ✓ ${operation.filePath}: "${operation.oldText}" → "${operation.newText}"`);
        });
      }
    } else {
      if (isJsonFormat) {
        console.error(JSON.stringify({
          success: false,
          errors: renameResult.errors || ['重新命名失敗']
        }));
      } else {
        console.error('❌ 重新命名失敗:');
        renameResult.errors?.forEach(error => {
          console.error(`   - ${error}`);
        });
      }
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }

  } catch (error) {
    if (isJsonFormat) {
      console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    } else {
      console.error('❌ 重新命名失敗:', error instanceof Error ? error.message : error);
    }
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
