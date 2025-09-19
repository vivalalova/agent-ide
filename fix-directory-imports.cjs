const fs = require('fs');
const path = require('path');

function fixDirectoryImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Fix directory imports (e.g., '../parser' -> '../parser/index.js')
  content = content.replace(/from\s+['"]([^'"]+)['"];?/g, (match, importPath) => {
    // Skip if already ends with .js
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    // Skip external modules (don't start with . or /)
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return match;
    }
    
    // Determine the full path
    const fullImportPath = path.resolve(path.dirname(filePath), importPath);
    
    // Check if it's a directory with an index file
    if (fs.existsSync(fullImportPath) && fs.statSync(fullImportPath).isDirectory()) {
      const indexFile = path.join(fullImportPath, 'index.js');
      if (fs.existsSync(indexFile)) {
        const newImport = importPath + '/index.js';
        modified = true;
        return match.replace(importPath, newImport);
      }
    }
    
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed directory imports in ${filePath}`);
  }
}

function fixDirectoryImportsInDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      fixDirectoryImportsInDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      fixDirectoryImportsInFile(fullPath);
    }
  }
}

// Start fixing from dist directory
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  fixDirectoryImportsInDirectory(distDir);
  console.log('All directory imports fixed!');
} else {
  console.log('Dist directory not found');
}