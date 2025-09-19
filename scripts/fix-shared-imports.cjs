const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

console.log('🔧 開始修正 shared/ 匯入路徑...');

// 找出所有 JavaScript 檔案
const jsFiles = glob.sync('dist/**/*.js');
console.log(`📁 找到 ${jsFiles.length} 個 JS 檔案`);

let fixedFiles = 0;
let totalFixes = 0;

for (const filePath of jsFiles) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let newContent = content;
    let hasChanges = false;
    
    // 修正 shared/types.js → shared/types/index.js
    const typesPattern = /from\s+['"`](.*?shared\/types)\.js['"`]/gm;
    newContent = newContent.replace(typesPattern, (match, importPath) => {
      hasChanges = true;
      totalFixes++;
      return match.replace(`${importPath}.js`, `${importPath}/index.js`);
    });
    
    // 修正 shared/errors.js → shared/errors/index.js
    const errorsPattern = /from\s+['"`](.*?shared\/errors)\.js['"`]/gm;
    newContent = newContent.replace(errorsPattern, (match, importPath) => {
      hasChanges = true;
      totalFixes++;
      return match.replace(`${importPath}.js`, `${importPath}/index.js`);
    });
    
    // 修正 shared/utils.js → shared/utils/index.js
    const utilsPattern = /from\s+['"`](.*?shared\/utils)\.js['"`]/gm;
    newContent = newContent.replace(utilsPattern, (match, importPath) => {
      hasChanges = true;
      totalFixes++;
      return match.replace(`${importPath}.js`, `${importPath}/index.js`);
    });
    
    if (hasChanges) {
      fs.writeFileSync(filePath, newContent, 'utf-8');
      fixedFiles++;
      console.log(`✅ 修正: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ 處理檔案時出錯 ${filePath}:`, error.message);
  }
}

console.log(`\n🎉 完成! 修正了 ${fixedFiles} 個檔案中的 ${totalFixes} 個匯入路徑`);