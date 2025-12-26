# Build Guide for Chrome Web Store

This guide explains how to build the Hidey extension for Chrome Web Store submission.

## Prerequisites

- Node.js and npm installed
- All dependencies installed: `npm install`

## Build Commands

### 1. Build Extension (Creates `build/` folder)

```bash
npm run build:extension
```

This command will:
- Compile TypeScript files
- Copy all necessary files to `build/` directory
- Update manifest.json paths for the build structure
- Create a ready-to-package extension

### 2. Build and Create Zip (One Command)

```bash
npm run build:zip
```

This command will:
- Run `build:extension`
- Create a zip file: `hidey-extension-v1.0.0.zip`
- Ready for Chrome Web Store upload

### 3. Clean Build Files

```bash
npm run clean
```

Removes `build/` and `dist/` directories.

## Build Directory Structure

After running `npm run build:extension`, the `build/` folder will contain:

```
build/
├── manifest.json          # Updated with correct paths
├── background/
│   └── background.js     # Compiled service worker
├── content/
│   ├── blur-engine.js
│   ├── selector-detector.js
│   ├── drag-blur.js
│   ├── floating-button.js
│   └── content.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── styles/
│   └── content.css
└── icons/
    └── icon.svg
```

## Testing Before Submission

1. **Load Extension Locally:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build/` folder
   - Test all features

2. **Verify Manifest:**
   - Check that `manifest.json` has correct paths
   - Verify version number
   - Ensure all permissions are correct

## Chrome Web Store Submission

1. **Create Zip File:**
   ```bash
   npm run build:zip
   ```
   Or manually:
   ```bash
   cd build
   zip -r ../hidey-extension-v1.0.0.zip .
   ```

2. **Upload to Chrome Web Store:**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Create a new item or update existing
   - Upload the zip file
   - Fill in store listing details:
     - Name: "Hidey - Auto Blur Messages"
     - Description: Privacy-focused browser extension
     - Screenshots (recommended: 1280x800 or 640x400)
     - Icons (128x128, 48x48, 16x16)
     - Category: Productivity or Utilities
   - Submit for review

## Required Store Assets

Before submitting, prepare:
- **Icons:** 128x128px, 48x48px, 16x16px PNG files
- **Screenshots:** At least one 1280x800px or 640x400px
- **Promotional Images:** (Optional) 920x680px or 1400x560px
- **Detailed Description:** Explain features and use cases
- **Privacy Policy:** Required if extension handles user data

## Notes

- The `build/` folder is gitignored
- Source files remain in `src/`, `popup/`, `styles/`
- Only compiled and necessary files are in `build/`
- Always test the extension from `build/` before creating zip

