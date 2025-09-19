const fs = require('fs');
const path = require('path');

function fixSharedImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Fix shared/types imports
  content = content.replace(/from\s+['"]([^'"]*shared\/types)['"];?/g, (match, importPath) => {
    if (importPath.endsWith('/index.js')) {
      return match;
    }
    const newImport = importPath + '/index.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  // Fix shared/errors imports
  content = content.replace(/from\s+['"]([^'"]*shared\/errors)['"];?/g, (match, importPath) => {
    if (importPath.endsWith('/index.js')) {
      return match;
    }
    const newImport = importPath + '/index.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  // Fix shared/utils imports
  content = content.replace(/from\s+['"]([^'"]*shared\/utils)['"];?/g, (match, importPath) => {
    if (importPath.endsWith('/index.js')) {
      return match;
    }
    const newImport = importPath + '/index.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  // Fix shared imports (general)
  content = content.replace(/from\s+['"]([^'"]*\/shared)['"];?/g, (match, importPath) => {
    if (importPath.endsWith('/index.js')) {
      return match;
    }
    const newImport = importPath + '/index.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed shared imports in ${filePath}`);
  }
}

function fixSharedImportsInDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      fixSharedImportsInDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      fixSharedImportsInFile(fullPath);
    }
  }
}

// Start fixing from dist directory
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  fixSharedImportsInDirectory(distDir);
  console.log('All shared imports fixed!');
} else {
  console.log('Dist directory not found');
}