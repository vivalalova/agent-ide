/**
 * Shift 命令處理器
 * 處理行移動相關的命令操作
 */

import * as path from 'path';
import { ShiftService } from '@core/shift/index.js';

/**
 * 處理行移動命令
 */
export async function handleShiftCommand(file: string, options: any, shiftService?: ShiftService): Promise<void> {
  const isJsonFormat = options.format === 'json';

  try {
    // 解析參數
    const fromLine = parseInt(options.from, 10);
    const toLine = parseInt(options.to, 10);
    const position = parseInt(options.position, 10);

    // 驗證參數
    if (isNaN(fromLine) || isNaN(toLine) || isNaN(position)) {
      const errorMsg = '行號和位置必須為有效數字';
      if (isJsonFormat) {
        console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
      } else {
        console.error(`❌ ${errorMsg}`);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      return;
    }

    // 解析檔案路徑（支援相對路徑）
    const sourceFile = path.resolve(options.path || process.cwd(), file);
    const targetFile = options.target ? path.resolve(options.path || process.cwd(), options.target) : undefined;

    if (!isJsonFormat) {
      const targetDesc = targetFile ? ` → ${path.basename(targetFile)}` : '（同檔案內）';
      console.log(`✂️  移動行 ${fromLine}-${toLine} 到位置 ${position}${targetDesc}`);
    }

    // 初始化服務
    const localShiftService = shiftService || new ShiftService();

    // 執行行移動操作
    const shiftOptions = {
      sourceFile,
      fromLine,
      toLine,
      targetFile,
      position,
      preview: options.preview,
      projectRoot: options.path || process.cwd(),
      updateReferences: options.updateReferences !== false
    };

    const result = await localShiftService.shift(shiftOptions);

    if (result.success) {
      if (isJsonFormat) {
        console.log(JSON.stringify({
          success: true,
          operationType: result.operationType,
          sourceFile: result.sourceFile,
          targetFile: result.targetFile,
          fromLine: result.fromLine,
          toLine: result.toLine,
          position: result.position,
          linesCount: result.linesCount,
          executed: result.executed,
          message: result.message,
          referencesUpdated: result.referencesUpdated,
          updatedReferences: result.updatedReferences
        }, null, 2));
      } else {
        if (options.preview) {
          console.log('🔍 預覽行移動操作:');
        } else {
          console.log('✅ 行移動成功!');
        }

        console.log(`📊 統計: 移動了 ${result.linesCount} 行`);
        console.log(`📝 來源檔案: ${path.relative(process.cwd(), result.sourceFile)}`);
        console.log(`📝 目標檔案: ${path.relative(process.cwd(), result.targetFile)}`);

        if (result.referencesUpdated && result.updatedReferences && result.updatedReferences.length > 0) {
          console.log(`🔗 已更新引用: ${result.updatedReferences.join(', ')}`);
        }

        if (options.preview && result.movedLines) {
          console.log('\n移動的內容:');
          result.movedLines.forEach((line, index) => {
            console.log(`  ${result.fromLine + index}: ${line}`);
          });
        }
      }
    } else {
      if (isJsonFormat) {
        console.log(JSON.stringify({ success: false, error: result.error }, null, 2));
      } else {
        console.error('❌ 行移動失敗:', result.error);
      }
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (isJsonFormat) {
      console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
    } else {
      console.error('❌ 執行失敗:', errorMsg);
    }
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
