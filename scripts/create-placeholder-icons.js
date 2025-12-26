// Simple script to create placeholder icons using Node.js
// Run with: node scripts/create-placeholder-icons.js

const fs = require('fs');
const path = require('path');

// Create a simple SVG icon that can be converted to PNG
const iconSvg = `<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#1976d2" rx="20"/>
  <text x="64" y="80" font-family="Arial" font-size="80" fill="white" text-anchor="middle">🛡️</text>
</svg>`;

const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create SVG placeholder (users can convert to PNG)
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), iconSvg);

console.log('✅ Created placeholder icon.svg in icons/ directory');
console.log('📝 Note: You need to convert this SVG to PNG files:');
console.log('   - icon16.png (16x16)');
console.log('   - icon48.png (48x48)');
console.log('   - icon128.png (128x128)');
console.log('');
console.log('You can use online tools like:');
console.log('   - https://cloudconvert.com/svg-to-png');
console.log('   - Or any image editor');

