/**
 * 檔案系統抽象層使用範例
 */

import { 
  FileSystem, 
  FileWatcher, 
  PathUtils, 
  FileNotFoundError,
  createFileSystem,
  createFileWatcher 
} from '../src/infrastructure/storage';

async function fileSystemExample() {
  console.log('=== FileSystem 使用範例 ===');

  const fs = createFileSystem();

  try {
    // 建立檔案
    const filePath = './example.txt';
    const content = 'Hello, Agent IDE!';
    await fs.writeFile(filePath, content);
    console.log(`✓ 檔案已建立: ${filePath}`);

    // 讀取檔案
    const readContent = await fs.readFile(filePath, 'utf8');
    console.log(`✓ 檔案內容: ${readContent}`);

    // 檢查檔案是否存在
    const exists = await fs.exists(filePath);
    console.log(`✓ 檔案存在: ${exists}`);

    // 獲取檔案資訊
    const stats = await fs.getStats(filePath);
    console.log(`✓ 檔案大小: ${stats.size} bytes`);
    console.log(`✓ 修改時間: ${stats.modifiedTime}`);

    // 複製檔案
    const copyPath = './example-copy.txt';
    await fs.copyFile(filePath, copyPath);
    console.log(`✓ 檔案已複製到: ${copyPath}`);

    // 建立目錄
    const dirPath = './test-dir';
    await fs.createDirectory(dirPath, true);
    console.log(`✓ 目錄已建立: ${dirPath}`);

    // 移動檔案到目錄
    const movedPath = './test-dir/moved-example.txt';
    await fs.moveFile(copyPath, movedPath);
    console.log(`✓ 檔案已移動到: ${movedPath}`);

    // 讀取目錄內容
    const entries = await fs.readDirectory('./test-dir');
    console.log(`✓ 目錄內容: ${entries.map(e => e.name).join(', ')}`);

    // 搜尋檔案
    const searchResults = await fs.glob('./test-dir/*.txt');
    console.log(`✓ 搜尋結果: ${searchResults}`);

    // 清理檔案
    await fs.deleteFile(filePath);
    await fs.deleteDirectory(dirPath, true);
    console.log('✓ 清理完成');

  } catch (error) {
    if (error instanceof FileNotFoundError) {
      console.error('檔案未找到:', error.path);
    } else {
      console.error('錯誤:', error);
    }
  }
}

async function fileWatcherExample() {
  console.log('\n=== FileWatcher 使用範例 ===');

  const watcher = createFileWatcher();
  const fs = createFileSystem();

  try {
    // 建立測試目錄
    const testDir = './watch-test';
    await fs.createDirectory(testDir, true);

    // 設定事件監聽器
    watcher.on('change', (event) => {
      console.log(`✓ 檔案事件: ${event.type} - ${event.path}`);
      
      if (event.stats) {
        console.log(`  檔案大小: ${event.stats.size} bytes`);
      }
      
      if (event.error) {
        console.error(`  錯誤: ${event.error.message}`);
      }
    });

    // 開始監控
    await watcher.watch(testDir);
    console.log(`✓ 開始監控目錄: ${testDir}`);

    // 模擬檔案操作（實際應用中會由外部觸發）
    setTimeout(async () => {
      const testFile = `${testDir}/test.txt`;
      await fs.writeFile(testFile, 'Initial content');
      
      setTimeout(async () => {
        await fs.appendFile(testFile, '\nAppended content');
        
        setTimeout(async () => {
          await fs.deleteFile(testFile);
          
          // 停止監控並清理
          setTimeout(async () => {
            await watcher.close();
            await fs.deleteDirectory(testDir, true);
            console.log('✓ 監控已停止，清理完成');
          }, 500);
        }, 500);
      }, 500);
    }, 1000);

  } catch (error) {
    console.error('FileWatcher 錯誤:', error);
    await watcher.close();
  }
}

function pathUtilsExample() {
  console.log('\n=== PathUtils 使用範例 ===');

  // 路徑正規化
  const messyPath = '/test//path/../file.txt';
  const normalizedPath = PathUtils.normalize(messyPath);
  console.log(`✓ 路徑正規化: ${messyPath} -> ${normalizedPath}`);

  // 路徑組合
  const joinedPath = PathUtils.join('project', 'src', 'index.ts');
  console.log(`✓ 路徑組合: ${joinedPath}`);

  // 路徑解析
  const filePath = '/project/src/components/Button.tsx';
  const parsed = PathUtils.parse(filePath);
  console.log(`✓ 路徑解析:`);
  console.log(`  目錄: ${parsed.dir}`);
  console.log(`  檔名: ${parsed.name}`);
  console.log(`  副檔名: ${parsed.ext}`);

  // 相對路徑計算
  const from = '/project/src';
  const to = '/project/docs/README.md';
  const relativePath = PathUtils.relative(from, to);
  console.log(`✓ 相對路徑: ${from} -> ${to} = ${relativePath}`);

  // 路徑工具函式
  console.log(`✓ 絕對路徑檢查: ${PathUtils.isAbsolute(filePath)}`);
  console.log(`✓ 檔名: ${PathUtils.basename(filePath)}`);
  console.log(`✓ 目錄: ${PathUtils.dirname(filePath)}`);
  console.log(`✓ 副檔名: ${PathUtils.extname(filePath)}`);

  // 副檔名操作
  const jsFile = 'script.js';
  const tsFile = PathUtils.changeExtension(jsFile, '.ts');
  console.log(`✓ 變更副檔名: ${jsFile} -> ${tsFile}`);

  // 路徑驗證
  const validPath = 'src/components/Button.tsx';
  const invalidPath = 'src/components/<invalid>.tsx';
  console.log(`✓ 路徑有效性: ${validPath} = ${PathUtils.isValidPath(validPath)}`);
  console.log(`✓ 路徑有效性: ${invalidPath} = ${PathUtils.isValidPath(invalidPath)}`);

  // 共同路徑
  const paths = ['/project/src/components/A.tsx', '/project/src/components/B.tsx', '/project/src/utils/C.ts'];
  const commonPath = PathUtils.getCommonPath(paths);
  console.log(`✓ 共同路徑: ${commonPath}`);
}

// 執行範例
async function main() {
  try {
    await fileSystemExample();
    pathUtilsExample();
    await fileWatcherExample();
  } catch (error) {
    console.error('執行範例時發生錯誤:', error);
  }
}

// 如果直接執行此檔案
if (require.main === module) {
  main().catch(console.error);
}

export { fileSystemExample, fileWatcherExample, pathUtilsExample };