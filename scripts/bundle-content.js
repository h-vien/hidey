// Simple bundler for content scripts
// Concatenates all content script files into a single file

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist', 'content');
const outputFile = path.join(distDir, 'content.js');

// Files to bundle in order
const filesToBundle = [
  'types.js',
  'blur-engine.js',
  'selector-detector.js',
  'drag-blur.js',
];

let bundledContent = '';

// Read and concatenate files
filesToBundle.forEach(file => {
  const filePath = path.join(distDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove import statements and replace with inline code
    // For now, we'll just remove the imports since types are used via interfaces
    content = content.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
    
    // Remove export keywords (keep the declarations)
    content = content.replace(/export\s+/g, '');
    
    bundledContent += content + '\n\n';
  }
});

// Add the main content.ts code (without imports)
const mainContent = `
// Main content script entry point
console.log('ShieldChat: Content script loaded');
`;

bundledContent += mainContent;

// Write bundled file
fs.writeFileSync(outputFile, bundledContent, 'utf8');
console.log('✅ Bundled content script:', outputFile);

