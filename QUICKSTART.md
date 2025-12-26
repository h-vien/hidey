# Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Extension
```bash
npm run build
```

This will compile TypeScript files from `src/` to `dist/`.

### Step 3: Create Icons (Optional but Recommended)
The extension needs icon files. You have two options:

**Option A: Use Placeholder Script**
```bash
node scripts/create-placeholder-icons.js
```
Then convert the generated `icon.svg` to PNG files (16x16, 48x48, 128x128) using any image editor or online converter.

**Option B: Create Your Own Icons**
Create three PNG files in the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

### Step 4: Load Extension in Browser

#### Chrome/Edge:
1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `hidey` folder (the one containing `manifest.json`)

#### Firefox:
1. Open `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file

### Step 5: Test the Extension

1. Navigate to a chat website (e.g., `https://web.telegram.org`)
2. Click the extension icon in your browser toolbar
3. You should see the Hidey popup
4. Messages should automatically blur if rules are configured

## 🎯 First Use

### Using Element Picker (Easiest Way)
1. Go to any chat website
2. Open the extension popup
3. Click **"Click to Blur"** button
4. Click on a message element you want to blur
5. The selector is automatically saved!

### Creating a Blur Region
1. Open the extension popup
2. Click **"Drag Blur"** button
3. Click and drag on the page to create a rectangular blur zone
4. Release to save the region

## 🔧 Development

### Watch Mode (Auto-rebuild)
```bash
npm run watch
```

### Project Structure
- `src/` - TypeScript source files
- `dist/` - Compiled JavaScript (generated)
- `popup/` - Extension popup UI
- `styles/` - CSS files
- `icons/` - Extension icons

### Making Changes
1. Edit files in `src/`
2. Run `npm run build` (or use watch mode)
3. Reload the extension in browser (click reload button in `chrome://extensions/`)
4. Refresh the webpage you're testing on

## 🐛 Troubleshooting

**Extension not loading?**
- Check browser console for errors
- Verify `dist/` folder exists and contains compiled files
- Ensure `manifest.json` paths are correct

**Blur not working?**
- Check if extension is enabled (toggle in popup)
- Verify URL pattern matches your current URL
- Open browser DevTools console to see any errors
- Try using Element Picker to generate fresh selectors

**TypeScript errors?**
- Run `npm install` to ensure dependencies are installed
- Check `tsconfig.json` configuration
- Verify Node.js version is 16+

## 📚 Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check sample rules in `src/background/background.ts`
- Customize blur intensity and settings in the popup

Happy blurring! 🛡️

