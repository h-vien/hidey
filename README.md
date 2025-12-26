# 🛡️ Hidey - Auto Blur Messages Browser Extension

A privacy-focused browser extension that automatically blurs sensitive chat messages on web-based chat applications such as Zalo Web, Telegram Web, Messenger Web, and similar platforms.

## ✨ Features

### 1. Auto Blur by Selector
- Define CSS selectors (class, id, attribute) for elements to be automatically blurred
- Each rule is scoped by URL/domain pattern
- Automatically applies blur on page load and DOM changes
- Configurable blur intensity (2px - 20px)

### 2. Drag to Create Blur Region
- Enable "Drag Blur" mode from extension popup
- Click and drag to draw rectangular blur zones
- Regions are saved relative to the target container
- Persists across page reloads

### 3. Click to Blur Element
- Enable "Element Picker" mode
- Click any DOM element to blur it
- Automatically generates unique CSS selector
- Stores selector rule for the current domain

### 4. Extension Popup UI
- Toggle blur ON/OFF for current site
- Quick action buttons for all blur modes
- List and manage active blur rules
- Adjust blur intensity and hover-to-unblur settings

## 🚀 Installation

### Prerequisites
- Node.js 16+ and npm
- TypeScript 5.3+

### Build Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load extension in Chrome/Edge:**
   - Open `chrome://extensions/` (or `edge://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `hidey` folder

## 📁 Project Structure

```
hidey/
├── src/
│   ├── types.ts                 # TypeScript type definitions
│   ├── content/
│   │   ├── content.ts           # Content script entry point
│   │   ├── blur-engine.ts       # Core blur application logic
│   │   ├── selector-detector.ts # Element picker functionality
│   │   └── drag-blur.ts         # Drag-to-blur region creation
│   └── background/
│       └── background.ts        # Service worker for storage
├── popup/
│   ├── popup.html               # Extension popup UI
│   ├── popup.css                # Popup styles
│   └── popup.js                 # Popup logic
├── styles/
│   └── content.css              # Content script styles
├── icons/                       # Extension icons (placeholder)
├── manifest.json                # Extension manifest
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Project dependencies
```

## 🎯 Usage

### Adding Custom Selectors

#### Method 1: Using Element Picker (Recommended)
1. Navigate to the chat website (e.g., chat.zalo.me)
2. Open the extension popup
3. Click "Click to Blur" button
4. Click on any message element you want to blur
5. The selector is automatically generated and saved

#### Method 2: Manual Rule Creation
You can manually add rules by modifying the default rules in `src/background/background.ts`:

```typescript
{
  urlPattern: 'https://example.com/*',
  selectors: ['.message-text', '#chat-content'],
  enabled: true,
}
```

### Creating Blur Regions
1. Open the extension popup
2. Click "Drag Blur" button
3. Click and drag on the page to create a blur region
4. The region is automatically saved for the current URL pattern

### Managing Rules
- View all active rules in the popup's "Active Rules" section
- Delete rules by clicking the "Delete" button
- Toggle blur globally using the main toggle switch

## ⚙️ Configuration

### Blur Intensity
Adjust the blur intensity slider in the popup (2px - 20px). Default is 8px.

### Hover to Unblur
Enable this option to temporarily unblur elements when hovering over them.

### Keyboard Shortcut
Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac) to toggle blur mode.

## 📝 Sample Rules

The extension comes with pre-configured rules for popular chat platforms:

### Zalo Web
- URL Pattern: `https://chat.zalo.me/*`
- Selectors: `.message-text`, `.message-content`, `[data-message-content]`

### Telegram Web
- URL Pattern: `https://web.telegram.org/*`
- Selectors: `.message`, `.text-content`, `[data-message-text]`

### Messenger Web
- URL Pattern: `https://www.messenger.com/*`
- Selectors: `[data-testid*="message"]`, `.message`, `.text-content`

## 🔧 Development

### Watch Mode
For development with auto-rebuild:
```bash
npm run watch
```

### Adding New Chat Platform Support

1. **Identify message selectors:**
   - Use browser DevTools to inspect message elements
   - Note the CSS classes, IDs, or data attributes

2. **Add rule in background.ts:**
   ```typescript
   {
     urlPattern: 'https://new-chat-platform.com/*',
     selectors: ['.message', '.chat-text'],
     enabled: true,
   }
   ```

3. **Rebuild and test:**
   ```bash
   npm run build
   ```

## 🛡️ Privacy & Security

- ✅ All rules stored locally using `chrome.storage.sync`
- ✅ No data sent to external servers
- ✅ No tracking or analytics
- ✅ Open source and auditable

## 🐛 Troubleshooting

### Blur not working?
1. Check if the extension is enabled (toggle in popup)
2. Verify the URL pattern matches your current URL
3. Check browser console for selector errors
4. Ensure selectors haven't changed (websites update their HTML)

### Selectors not matching?
- Use the Element Picker to generate fresh selectors
- Check browser DevTools to verify element structure
- Some sites use dynamic classes - use attribute selectors instead

### Regions not persisting?
- Ensure you're on a matching URL pattern
- Check if the container selector is still valid
- Try recreating the region

## 📄 License

This project is open source and available for personal and commercial use.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

**Note:** This extension requires Manifest V3 compatible browsers (Chrome 88+, Edge 88+, etc.)

