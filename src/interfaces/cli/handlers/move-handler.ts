/**
 * Move 命令處理器
 * 處理檔案移動相關的命令操作
 */

import * as path from 'path';
import { MoveService } from '@core/move/index.js';
import * as FileUtils from '@interfaces/cli/utils/file-utils.js';

/**
 * 處理移動命令
 */
export async function handleMoveCommand(source: string, target: string, options: any, moveService?: MoveService): Promise<void> {
  const isJsonFormat = options.format === 'json';

  if (!isJsonFormat) {
    console.log(`📦 移動 ${source} → ${target}`);
  }

  try {
    // 檢查源檔案是否存在
    const sourceExists = await FileUtils.fileExists(source);
    if (!sourceExists) {
      const errorMsg = `源檔案找不到: ${source}`;
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: false,
          error: errorMsg
        }, null, 2));
      } else {
        console.log(`❌ 移動失敗: ${errorMsg}`);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // 檢查源和目標是否相同
    const normalizedSource = path.resolve(source);
    const normalizedTarget = path.resolve(target);
    if (normalizedSource === normalizedTarget) {
      // 源和目標相同時，視為 no-op，成功返回
      const message = 'Source and target are identical. No changes made.';
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          message,
          changes: []
        }, null, 2));
      } else {
        console.log(`✓ ${message}`);
      }
      return;
    }

    // 初始化移動服務
    let localMoveService = moveService;
    if (!localMoveService) {
      // 讀取 tsconfig.json 路徑別名
      const pathAliases = await FileUtils.loadPathAliases(options.path || process.cwd());

      localMoveService = new MoveService({
        pathAliases,
        supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.swift'],
        includeNodeModules: false
      });
    }

    const moveOperation = {
      source: normalizedSource,
      target: normalizedTarget,
      updateImports: options.updateImports
    };

    const moveOptions = {
      preview: options.preview,
      projectRoot: options.path || process.cwd()
    };

    // 執行移動操作
    const result = await localMoveService.moveFile(moveOperation, moveOptions);

    if (result.success) {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          moved: result.moved,
          affectedFiles: result.pathUpdates.length,
          pathUpdates: result.pathUpdates
        }, null, 2));
      } else {
        if (options.preview) {
          console.log('🔍 預覽移動操作:');
        } else {
          console.log('✅ 移動成功!');
        }

        console.log(`📊 統計: ${result.pathUpdates.length} 個 import 需要更新`);

        if (result.pathUpdates.length > 0) {
          console.log('📝 影響的檔案:');
          const fileGroups = new Map<string, any[]>();

          result.pathUpdates.forEach(update => {
            if (!fileGroups.has(update.filePath)) {
              fileGroups.set(update.filePath, []);
            }
            fileGroups.get(update.filePath)!.push(update);
          });

          for (const [filePath, updates] of fileGroups) {
            console.log(`   📄 ${path.relative(process.cwd(), filePath)}:`);
            updates.forEach(update => {
              console.log(`      第 ${update.line} 行: "${path.basename(source)}" → "${path.basename(target)}"`);
            });
          }
        }
      }
    } else {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: false,
          error: result.error
        }, null, 2));
      } else {
        console.error('❌ 移動失敗:', result.error);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (isJsonFormat) {
      console.log(JSON.stringify({
        success: false,
        error: errorMsg
      }, null, 2));
    } else {
      console.error('❌ 移動失敗:', errorMsg);
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
