// Simple bundler for Chrome extension scripts
// Resolves imports and creates single-file bundles

const fs = require('fs');
const path = require('path');

function resolveImports(content, baseDir, visited = new Set()) {
  // Find all import statements
  const importRegex = /import\s+(?:.*?\s+from\s+)?['"](.+?)['"];?/g;
  let match;
  let resolvedContent = content;
  const imports = [];

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    if (importPath.startsWith('.') && !visited.has(importPath)) {
      visited.add(importPath);
      
      // Resolve file path
      let filePath = path.resolve(baseDir, importPath);
      
      // Add .js extension if needed
      if (!filePath.endsWith('.js')) {
        if (fs.existsSync(filePath + '.js')) {
          filePath += '.js';
        }
      }
      
      if (fs.existsSync(filePath)) {
        let importedContent = fs.readFileSync(filePath, 'utf8');
        
        // Remove source maps
        importedContent = importedContent.replace(/\/\/# sourceMappingURL=.*$/gm, '');
        
        // Recursively resolve imports in imported file
        const importedDir = path.dirname(filePath);
        importedContent = resolveImports(importedContent, importedDir, visited);
        
        // Remove export keywords but keep declarations
        importedContent = importedContent.replace(/export\s+(class|interface|const|function|let|var)\s+/g, '$1 ');
        importedContent = importedContent.replace(/export\s*\{[^}]*\}\s*from\s*['"].*?['"];?/g, '');
        
        imports.push(importedContent);
      }
    }
  }
  
  // Remove import statements from original content
  resolvedContent = resolvedContent.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
  
  // Combine imports and content
  return imports.join('\n\n') + '\n\n' + resolvedContent;
}

// Bundle content scripts
function bundleContentScripts() {
  const distDir = path.join(__dirname, '..', 'dist', 'content');
  const entryFile = path.join(distDir, 'content.js');
  const outputFile = path.join(distDir, 'content.bundle.js');
  
  if (!fs.existsSync(entryFile)) {
    console.error('Entry file not found:', entryFile);
    return;
  }
  
  let content = fs.readFileSync(entryFile, 'utf8');
  content = resolveImports(content, distDir);
  
  // Remove source maps
  content = content.replace(/\/\/# sourceMappingURL=.*$/gm, '');
  
  fs.writeFileSync(outputFile, content, 'utf8');
  console.log('✅ Bundled content script:', outputFile);
}

// Bundle background script (should already be fixed, but double-check)
function bundleBackgroundScript() {
  const distDir = path.join(__dirname, '..', 'dist', 'background');
  const entryFile = path.join(distDir, 'background.js');
  
  if (fs.existsSync(entryFile)) {
    let content = fs.readFileSync(entryFile, 'utf8');
    
    // Check if it still has imports
    if (content.includes("import ")) {
      console.warn('⚠️  Background script still has imports. Please fix manually.');
    } else {
      console.log('✅ Background script is already bundled');
    }
  }
}

// Run bundling
console.log('Bundling extension scripts...\n');
bundleContentScripts();
bundleBackgroundScript();
console.log('\n✅ Bundling complete!');

