const fs = require('fs');
const path = require('path');

function fixImportsInDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      fixImportsInDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      fixImportsInFile(fullPath);
    }
  }
}

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;
  
  // Fix all relative imports that don't end with .js
  content = content.replace(/from\s+['"](\.[^'"]+)(?<!\.js)['"]/g, (match, importPath) => {
    // Don't modify if it already ends with .js
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    // Add .js extension
    const newImport = importPath + '.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  // Fix import statements
  content = content.replace(/import\s+[^'"]+from\s+['"](\.[^'"]+)(?<!\.js)['"]/g, (match, importPath) => {
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    const newImport = importPath + '.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  // Fix dynamic imports
  content = content.replace(/import\s*\(\s*['"](\.[^'"]+)(?<!\.js)['"]\s*\)/g, (match, importPath) => {
    if (importPath.endsWith('.js')) {
      return match;
    }
    
    const newImport = importPath + '.js';
    modified = true;
    return match.replace(importPath, newImport);
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed imports in ${filePath}`);
  }
}

// Start fixing from dist directory
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  fixImportsInDirectory(distDir);
  console.log('All imports fixed!');
} else {
  console.log('Dist directory not found');
}