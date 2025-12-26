#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));

function createZip() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error('✗ Build directory not found. Please run "npm run build:extension" first.');
    process.exit(1);
  }
  
  const zipName = `hidey-extension-v${packageJson.version}.zip`;
  const zipPath = path.join(ROOT_DIR, zipName);
  
  // Remove existing zip if it exists
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  
  console.log(`📦 Creating zip file: ${zipName}...`);
  
  try {
    // Use zip command (available on macOS/Linux)
    execSync(`cd "${BUILD_DIR}" && zip -r "${zipPath}" . -x "*.DS_Store"`, {
      stdio: 'inherit'
    });
    
    const stats = fs.statSync(zipPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`\n✅ Zip file created successfully!`);
    console.log(`📁 Location: ${zipPath}`);
    console.log(`📊 Size: ${sizeInMB} MB`);
    console.log(`\n🚀 Ready to upload to Chrome Web Store!\n`);
  } catch (error) {
    console.error('✗ Failed to create zip file');
    console.error('Make sure you have the "zip" command available, or manually zip the build/ folder');
    process.exit(1);
  }
}

createZip();

