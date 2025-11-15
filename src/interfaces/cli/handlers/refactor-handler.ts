/**
 * Refactor 命令處理器
 * 處理重構相關的命令操作
 */

import * as path from 'path';
import * as CodeEditUtils from '@interfaces/cli/utils/code-edit-utils.js';

/**
 * 處理重構命令
 */
export async function handleRefactorCommand(action: string, options: any): Promise<void> {
  // 支援 --path 作為 --file 的別名
  const fileOption = options.file || options.path;

  if (!fileOption) {
    console.error('❌ 必須指定 --file 或 --path 參數');
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    return;
  }

  // 支援 --new-name 作為 --function-name 的別名
  const functionNameOption = options.functionName || options.newName;

  const isJsonFormat = options.format === 'json';

  if (!isJsonFormat) {
    console.log(`🔧 重構: ${action}`);
  }

  try {
    const filePath = path.resolve(fileOption);

    if (action === 'extract-function' || action === 'extract-closure') {
      if (!options.startLine || !options.endLine || !functionNameOption) {
        console.error(`❌ ${action} 缺少必要參數: --start-line, --end-line 和 --function-name (或 --new-name)`);
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      // 驗證行號範圍
      const startLine = parseInt(options.startLine);
      const endLine = parseInt(options.endLine);
      if (startLine > endLine) {
        console.error(`❌ 無效的行號範圍: 起始行號 (${startLine}) 大於結束行號 (${endLine})`);
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      // 讀取檔案內容
      const fs = await import('fs/promises');

      // 檢查檔案是否存在
      try {
        await fs.access(filePath);
      } catch {
        console.error(`❌ 找不到檔案: ${filePath}`);
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        return;
      }

      const code = await fs.readFile(filePath, 'utf-8');

      // 建立範圍
      const range = {
        start: { line: startLine, column: 0 },
        end: { line: endLine, column: 0 }
      };

      // 檢測檔案類型
      const isSwift = filePath.endsWith('.swift');

      if (isSwift) {
        // 使用 Swift 提取器
        const { SwiftExtractor } = await import('@core/refactor/swift-extractor.js');
        const extractor = new SwiftExtractor();

        const extractConfig = {
          functionName: functionNameOption,
          generateComments: true,
          preserveFormatting: true
        };

        const result = action === 'extract-closure'
          ? await extractor.extractClosure(code, range, extractConfig)
          : await extractor.extractFunction(code, range, extractConfig);

        if (result.success) {
          if (isJsonFormat) {
            console.log(JSON.stringify({
              success: true,
              extractedFunction: result.extractedFunction
            }, null, 2));
          } else {
            console.log('✅ 重構完成');
            console.log(`📝 提取的函式: ${result.extractedFunction.signature}`);
          }

          if (!options.preview) {
            await fs.writeFile(filePath, result.modifiedCode, 'utf-8');
            if (!isJsonFormat) {
              console.log(`✓ 已更新 ${filePath}`);
            }
          } else {
            if (!isJsonFormat) {
              console.log('預覽模式 - 未寫入檔案');
            }
          }
        } else {
          if (isJsonFormat) {
            console.error(JSON.stringify({ success: false, errors: result.errors }));
          } else {
            console.error('❌ 重構失敗:', result.errors.join(', '));
          }
          if (process.env.NODE_ENV !== 'test') { process.exit(1); }
        }
        return;
      }

      // TypeScript/JavaScript 提取器（原有邏輯）
      const { FunctionExtractor } = await import('@core/refactor/extract-function.js');
      const extractor = new FunctionExtractor();

      // 執行提取
      const extractConfig = {
        functionName: functionNameOption,
        generateComments: true,
        preserveFormatting: true,
        validateExtraction: true,
        ...(options.targetFile ? {
          targetFile: path.resolve(options.targetFile),
          sourceFile: filePath
        } : {})
      };

      const result = await extractor.extract(code, range, extractConfig);

      if (result.success) {
        // 套用編輯（按正確順序）
        let modifiedCode = code;

        // 先處理所有 insert 類型（在檔案開頭插入函式定義）
        const insertEdits = result.edits.filter(e => e.type === 'insert');
        const replaceEdits = result.edits.filter(e => e.type === 'replace');

        // 先應用 replace（替換選取範圍為函式呼叫）
        for (const edit of replaceEdits) {
          modifiedCode = CodeEditUtils.applyEditCorrectly(modifiedCode, edit);
        }

        // 再應用 insert（插入函式定義）
        for (const edit of insertEdits) {
          modifiedCode = CodeEditUtils.applyEditCorrectly(modifiedCode, edit);
        }

        // 提取函式簽名（從修改後的程式碼中）
        const functionSignatureMatch = modifiedCode.match(new RegExp(`(async\\s+)?function\\s+${result.functionName}\\s*\\([^)]*\\)`));
        const functionSignature = functionSignatureMatch ? functionSignatureMatch[0] : `function ${result.functionName}`;

        console.log('✅ 重構完成');
        console.log(`📝 提取的函式: ${functionSignature}`);
        console.log(functionSignature);

        if (!options.preview) {
          // 寫入原始檔案
          await fs.writeFile(filePath, modifiedCode, 'utf-8');
          console.log(`✓ 已更新 ${filePath}`);

          // 如果是跨檔案提取，寫入目標檔案
          if (result.targetFileContent && options.targetFile) {
            const targetPath = path.resolve(options.targetFile);
            // 確保目標目錄存在
            const targetDir = path.dirname(targetPath);
            await fs.mkdir(targetDir, { recursive: true });
            // 寫入目標檔案
            await fs.writeFile(targetPath, result.targetFileContent, 'utf-8');
            console.log(`✓ 已建立/更新目標檔案 ${targetPath}`);
            if (result.importStatement) {
              console.log(`✓ 已加入 import: ${result.importStatement}`);
            }
          }
        } else {
          console.log('\n🔍 預覽模式 - 未寫入檔案');
          console.log(`📊 參數: ${result.parameters.map(p => p.name).join(', ')}`);
          if (result.targetFileContent && options.targetFile) {
            console.log(`📁 目標檔案: ${options.targetFile}`);
            console.log(`📥 Import: ${result.importStatement || '(無)'}`);
          }
        }
      } else {
        console.error('❌ 重構失敗:', result.errors.join(', '));
        process.exitCode = 1;
        if (process.env.NODE_ENV !== 'test') { process.exit(1); }
      }

    } else if (action === 'inline-function') {
      console.error('❌ inline-function 尚未實作');
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    } else {
      console.error(`❌ 未知的重構操作: ${action}`);
      process.exitCode = 1;
      if (process.env.NODE_ENV !== 'test') { process.exit(1); }
    }

  } catch (error) {
    console.error('❌ 重構失敗:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
    if (process.env.NODE_ENV !== 'test') { process.exit(1); }
  }
}
