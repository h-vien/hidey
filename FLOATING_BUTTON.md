# Floating Quick Actions Button

## Overview

The floating button is an in-page UI element that provides instant access to ShieldChat features without opening the extension popup. It appears on all supported web pages and can be dragged to any position.

## Features

### ✨ Button Characteristics
- **Size**: 40px × 40px circular button
- **Position**: Bottom-right by default (user customizable)
- **Appearance**: Semi-transparent blue with shield icon
- **Draggable**: Click and drag to reposition
- **Position Persistence**: Saves position per domain

### 🎯 Quick Actions Panel

Clicking the button opens a panel with 4 quick actions:

1. **Toggle Blur** 👁️
   - Instantly enable/disable blur for the current page
   - Works independently from extension popup toggle

2. **Click to Blur** 👆
   - Activates element picker mode
   - Click any element to blur it and save selector

3. **Drag Blur** 📦
   - Activates drag-to-blur mode
   - Draw rectangular regions to blur

4. **Settings** ⚙️
   - Opens extension popup for full settings

## Technical Details

### File Structure
- **Source**: `src/content/floating-button.ts`
- **Styles**: `styles/content.css` (`.shieldchat-floating-btn`, `.shieldchat-floating-panel`)
- **Integration**: Loaded via `manifest.json` content scripts

### Position Storage
- Stored in `chrome.storage.sync` under `floatingButtonPositions`
- Format: `{ [hostname]: { x: number, y: number } }`
- Position is saved automatically when dragged

### Event Communication
The floating button communicates with other modules via custom events:
- `shieldchat-toggle-blur` - Toggles blur on/off
- `shieldchat-start-element-picker` - Starts element picker
- `shieldchat-start-drag-blur` - Starts drag blur mode

### Responsive Design
- Button scales appropriately on mobile devices
- Panel adjusts position to stay within viewport
- Touch support for drag on mobile

## User Experience

### Visual Feedback
- Button changes color when panel is open (green)
- Hover effect with scale animation
- Smooth transitions for panel open/close
- Panel slides in with scale animation

### Interaction
- **Click**: Opens/closes panel
- **Drag**: Repositions button (when panel is closed)
- **Outside Click**: Closes panel automatically
- **Close Button**: Manual close option

### Constraints
- Button stays within viewport bounds
- Panel automatically repositions if it would go off-screen
- Position updates on window resize

## Customization

### Styling
All styles are in `styles/content.css`. Key classes:
- `.shieldchat-floating-btn` - Main button
- `.shieldchat-floating-panel` - Panel container
- `.shieldchat-panel-action` - Action buttons

### Adding New Actions
To add a new action to the panel:

1. Add button HTML in `createPanel()`:
```typescript
<button class="shieldchat-panel-action" data-action="new-action">
  <span class="shieldchat-action-icon">🎯</span>
  <span class="shieldchat-action-label">New Action</span>
</button>
```

2. Add handler in `handleAction()`:
```typescript
case 'new-action':
  // Your action code
  break;
```

## Browser Compatibility

- ✅ Chrome/Edge (Manifest V3)
- ✅ Firefox (with Manifest V3 support)
- ✅ Mobile browsers (touch support included)

## Performance

- Lightweight: ~8KB compiled
- No performance impact on page load
- Efficient event listeners
- Debounced position updates

## Future Enhancements

Potential improvements:
- [ ] Customizable button icon
- [ ] Button size options
- [ ] Panel position memory
- [ ] Keyboard shortcuts for actions
- [ ] Animation preferences
- [ ] Per-site visibility toggle

