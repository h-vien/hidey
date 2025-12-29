#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Clean build directory
function cleanBuildDir() {
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  console.log('✓ Cleaned build directory');
}

// Copy file or directory
function copy(src, dest) {
  const srcPath = path.join(ROOT_DIR, src);
  const destPath = path.join(BUILD_DIR, dest);
  
  const stat = fs.statSync(srcPath);
  
  if (stat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    const files = fs.readdirSync(srcPath);
    files.forEach(file => {
      copy(path.join(src, file), path.join(dest, file));
    });
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

// Build the extension
function build() {
  console.log('🚀 Building Hidey extension for Chrome Web Store...\n');
  
  // Step 1: Compile TypeScript
  console.log('Step 1: Compiling TypeScript...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
    console.log('✓ TypeScript compilation complete\n');
  } catch (error) {
    console.error('✗ TypeScript compilation failed');
    process.exit(1);
  }
  
  // Step 2: Clean build directory
  console.log('Step 2: Preparing build directory...');
  cleanBuildDir();
  
  // Step 3: Copy and update manifest.json
  console.log('Step 3: Copying and updating manifest.json...');
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Update paths in manifest.json for build directory
  manifest.background.service_worker = 'background/background.js';
  manifest.content_scripts[0].js = [
    'content/blur-engine.js',
    'content/selector-detector.js',
    'content/drag-blur.js',
    'content/unblur-detector.js',
    'content/floating-button.js',
    'content/content.js'
  ];
  
  fs.writeFileSync(
    path.join(BUILD_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  // Step 4: Copy popup files
  console.log('Step 4: Copying popup files...');
  copy('popup', 'popup');
  
  // Step 5: Copy styles
  console.log('Step 5: Copying styles...');
  copy('styles', 'styles');
  
  // Step 6: Copy compiled background script
  console.log('Step 6: Copying background scripts...');
  copy('dist/background/background.js', 'background/background.js');
  
  // Step 7: Copy compiled content scripts
  console.log('Step 7: Copying content scripts...');
  const contentScripts = [
    'blur-engine.js',
    'selector-detector.js',
    'drag-blur.js',
    'unblur-detector.js',
    'floating-button.js',
    'content.js'
  ];
  
  contentScripts.forEach(script => {
    copy(`dist/content/${script}`, `content/${script}`);
  });
  
  // Step 8: Copy icons if they exist
  console.log('Step 8: Copying icons...');
  if (fs.existsSync(path.join(ROOT_DIR, 'icons'))) {
    copy('icons', 'icons');
  }
  
  console.log('\n✅ Build complete!');
  console.log(`📦 Extension ready in: ${BUILD_DIR}`);
  console.log('\nNext steps:');
  console.log('1. Test the extension by loading it from the build/ directory');
  console.log('2. Create a zip file: cd build && zip -r ../hidey-extension.zip .');
  console.log('3. Upload hidey-extension.zip to Chrome Web Store\n');
}

// Run build
build();

