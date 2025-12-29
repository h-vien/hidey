// Floating quick actions button for in-page access
class FloatingButton {
  private button: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private isPanelOpen: boolean = false;
  private isDragging: boolean = false;
  private dragOffset = { x: 0, y: 0 };
  private currentPosition = { x: 0, y: 0 };
  private hostname: string = '';
  private dragStartPosition = { x: 0, y: 0 };
  private hasDragged: boolean = false;
  private globalEnabled: boolean = true;

  constructor() {
    this.hostname = window.location.hostname;
    this.init();
  }

  private async init() {
    // Load saved position
    await this.loadPosition();

    // Load global enabled state
    await this.loadGlobalEnabled();

    // Create button and panel
    this.createButton();
    this.createPanel();

    // Load position from storage
    this.applyPosition();

    // Update UI to reflect current state
    this.updateButtonState();

    // Handle window resize
    window.addEventListener('resize', () => {
      this.constrainPosition();
      this.applyPosition();
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.floatingButtonPositions) {
          this.loadPosition();
          this.applyPosition();
        }
        if (changes.globalEnabled) {
          this.globalEnabled = changes.globalEnabled.newValue !== false;
          this.updateButtonState();
        }
      }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'UPDATE_SETTINGS' && message.enabled !== undefined) {
        this.globalEnabled = message.enabled !== false;
        this.updateButtonState();
      }
    });
  }

  private constrainPosition() {
    if (!this.button) return;

    const maxX = window.innerWidth - this.button.offsetWidth;
    const maxY = window.innerHeight - this.button.offsetHeight;

    this.currentPosition.x = Math.max(0, Math.min(this.currentPosition.x, maxX));
    this.currentPosition.y = Math.max(0, Math.min(this.currentPosition.y, maxY));
  }

  private createButton() {
    this.button = document.createElement('div');
    this.button.id = 'hidey-floating-btn';
    this.button.className = 'hidey-floating-btn';
    this.button.innerHTML = `
      <div class="hidey-btn-shield">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
      </div>
      <span class="hidey-btn-close" aria-label="Close and disable blur" title="Close and disable blur">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#1976d2" stroke="#1976d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>
    `;

    // Close button handler
    const closeBtn = this.button.querySelector('.hidey-btn-close') as HTMLElement;
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleClose();
    });

    // Click handler - only trigger if not dragging
    const shieldElement = this.button.querySelector('.hidey-btn-shield') as HTMLElement;
    shieldElement?.addEventListener('click', (e) => {
      // Don't open panel if we just finished dragging
      if (this.hasDragged) {
        this.hasDragged = false;
        return;
      }
      e.stopPropagation();
      this.togglePanel();
    });

    // Drag handlers - only on shield element, not close button
    shieldElement?.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left mouse button
        this.dragStartPosition = { x: e.clientX, y: e.clientY };
        this.hasDragged = false;
        this.startDrag(e);
      }
    });

    // Touch support for mobile - only on shield element
    shieldElement?.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      this.dragStartPosition = { x: touch.clientX, y: touch.clientY };
      this.hasDragged = false;
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
      });
      shieldElement.dispatchEvent(mouseEvent);
    });

    document.body.appendChild(this.button);
  }

  private createPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'hidey-floating-panel';
    this.panel.className = 'hidey-floating-panel';
    this.panel.innerHTML = `
      <div class="hidey-panel-header">
        <span class="hidey-panel-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
          Hidey
        </span>
        <button class="hidey-panel-close" aria-label="Close">×</button>
      </div>
      <div class="hidey-panel-content">
        <button class="hidey-panel-action" data-action="click-blur">
          <span class="hidey-action-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg></span>
          <span class="hidey-action-label">Click to Blur</span>
        </button>
        <button class="hidey-panel-action" data-action="drag-blur">
          <span class="hidey-action-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m15 19-3 3-3-3"/><path d="m19 9 3 3-3 3"/><path d="M2 12h20"/><path d="m5 9-3 3 3 3"/><path d="m9 5 3-3 3 3"/></svg></span>
          <span class="hidey-action-label">Drag Blur</span>
        </button>
        <button class="hidey-panel-action" data-action="clear-blur">
          <span class="hidey-action-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser-icon lucide-eraser"><path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/></svg></span>
          <span class="hidey-action-label">Clear Blur</span>
        </button>
        <button class="hidey-panel-action hidey-panel-action-coffee" data-action="buy-coffee">
          <span class="hidey-action-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="8"/><line x1="10" x2="10" y1="2" y2="8"/><line x1="14" x2="14" y1="2" y2="8"/></svg></span>
          <span class="hidey-action-label">Buy me a coffee</span>
        </button>
      </div>
    `;

    // Close button
    const closeBtn = this.panel.querySelector('.hidey-panel-close');
    closeBtn?.addEventListener('click', () => {
      this.closePanel();
    });

    // Action buttons
    const actionButtons = this.panel.querySelectorAll('.hidey-panel-action');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
        this.handleAction(action || '');
        this.closePanel();
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isPanelOpen &&
        this.panel &&
        !this.panel.contains(e.target as Node) &&
        this.button &&
        !this.button.contains(e.target as Node)) {
        this.closePanel();
      }
    });

    document.body.appendChild(this.panel);
  }

  private startDrag(e: MouseEvent) {
    // Don't start drag if clicking on panel
    if (this.isPanelOpen) {
      return;
    }

    this.isDragging = true;
    const rect = this.button!.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    document.addEventListener('mousemove', this.handleDrag);
    document.addEventListener('mouseup', this.stopDrag);
    document.addEventListener('touchmove', this.handleDragTouch);
    document.addEventListener('touchend', this.stopDrag);

    this.button!.style.cursor = 'grabbing';
    e.preventDefault();
  }

  private handleDrag = (e: MouseEvent) => {
    if (!this.isDragging || !this.button) return;

    // Check if mouse has moved significantly (more than 5px) to consider it a drag
    const deltaX = Math.abs(e.clientX - this.dragStartPosition.x);
    const deltaY = Math.abs(e.clientY - this.dragStartPosition.y);

    if (deltaX > 5 || deltaY > 5) {
      this.hasDragged = true;
    }

    const x = e.clientX - this.dragOffset.x;
    const y = e.clientY - this.dragOffset.y;

    this.updatePosition(x, y);
  };

  private handleDragTouch = (e: TouchEvent) => {
    if (!this.isDragging || !this.button || e.touches.length === 0) return;

    const touch = e.touches[0];

    // Check if touch has moved significantly
    const deltaX = Math.abs(touch.clientX - this.dragStartPosition.x);
    const deltaY = Math.abs(touch.clientY - this.dragStartPosition.y);

    if (deltaX > 5 || deltaY > 5) {
      this.hasDragged = true;
    }

    const x = touch.clientX - this.dragOffset.x;
    const y = touch.clientY - this.dragOffset.y;

    this.updatePosition(x, y);
    e.preventDefault();
  };

  private stopDrag = () => {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.button!.style.cursor = 'grab';

    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.stopDrag);
    document.removeEventListener('touchmove', this.handleDragTouch);
    document.removeEventListener('touchend', this.stopDrag);

    // Save position if we actually dragged
    if (this.hasDragged) {
      this.savePosition();
      // Reset hasDragged after a short delay to allow click event to check it
      setTimeout(() => {
        this.hasDragged = false;
      }, 100);
    }
  };

  private updatePosition(x: number, y: number) {
    // Constrain to viewport
    const maxX = window.innerWidth - (this.button?.offsetWidth || 40);
    const maxY = window.innerHeight - (this.button?.offsetHeight || 40);

    this.currentPosition.x = Math.max(0, Math.min(x, maxX));
    this.currentPosition.y = Math.max(0, Math.min(y, maxY));

    this.applyPosition();
  }

  private applyPosition() {
    if (this.button) {
      this.button.style.left = `${this.currentPosition.x}px`;
      this.button.style.top = `${this.currentPosition.y}px`;
    }

    // Update panel position relative to button
    if (this.panel && this.button) {
      const buttonRect = this.button.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();
      const panelWidth = panelRect.width || 200;
      const panelHeight = panelRect.height || 220;
      const padding = 30;

      // Try positioning above button first
      let panelTop = buttonRect.top - panelHeight - padding;
      let panelLeft = buttonRect.left;

      // Check if panel would overflow at the top
      if (panelTop < padding) {
        // Try below button instead
        panelTop = buttonRect.bottom + padding;

        // If it still overflows at bottom, position it at the top of viewport
        if (panelTop + panelHeight > window.innerHeight - padding) {
          panelTop = padding;
        }
      }

      // Check if panel would overflow at the bottom
      if (panelTop + panelHeight > window.innerHeight - padding) {
        // Position above button
        panelTop = buttonRect.top - panelHeight - padding;

        // If it still overflows at top, position it at the bottom of viewport
        if (panelTop < padding) {
          panelTop = window.innerHeight - panelHeight - padding;
        }
      }

      // Check if panel would overflow on the right
      if (panelLeft + panelWidth > window.innerWidth - padding) {
        // Try positioning to the left of button
        panelLeft = buttonRect.right - panelWidth;

        // If it still overflows, align to right edge
        if (panelLeft < padding) {
          panelLeft = window.innerWidth - panelWidth - padding;
        }
      }

      // Check if panel would overflow on the left
      if (panelLeft < padding) {
        // Try positioning to the right of button
        panelLeft = buttonRect.right + padding;

        // If it still overflows, align to left edge
        if (panelLeft + panelWidth > window.innerWidth - padding) {
          panelLeft = padding;
        }
      }

      // Ensure panel stays within viewport bounds
      panelLeft = Math.max(padding, Math.min(panelLeft, window.innerWidth - panelWidth - padding));
      panelTop = Math.max(padding, Math.min(panelTop, window.innerHeight - panelHeight - padding));

      this.panel.style.left = `${panelLeft}px`;
      this.panel.style.top = `${panelTop}px`;
    }
  }

  private async loadPosition() {
    try {
      const result = await chrome.storage.sync.get(['floatingButtonPositions']);
      const positions = result.floatingButtonPositions || {};

      if (positions[this.hostname]) {
        this.currentPosition = positions[this.hostname];
      } else {
        // Default position: bottom-right
        this.currentPosition = {
          x: window.innerWidth - 60,
          y: window.innerHeight - 60,
        };
      }
    } catch (error) {
      console.error('Hidey: Error loading button position', error);
      // Default position
      this.currentPosition = {
        x: window.innerWidth - 60,
        y: window.innerHeight - 60,
      };
    }
  }

  private async savePosition() {
    try {
      const result = await chrome.storage.sync.get(['floatingButtonPositions']);
      const positions = result.floatingButtonPositions || {};
      positions[this.hostname] = this.currentPosition;

      await chrome.storage.sync.set({ floatingButtonPositions: positions });
    } catch (error) {
      console.error('Hidey: Error saving button position', error);
    }
  }

  private togglePanel() {
    if (this.isPanelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private openPanel() {
    if (!this.panel || !this.button) return;

    this.isPanelOpen = true;
    this.applyPosition(); // Update panel position
    this.panel.classList.add('hidey-panel-open');
    this.button.classList.add('hidey-btn-active');
  }

  private closePanel() {
    if (!this.panel || !this.button) return;

    this.isPanelOpen = false;
    this.panel.classList.remove('hidey-panel-open');
    this.button.classList.remove('hidey-btn-active');
  }

  private async loadGlobalEnabled() {
    try {
      const result = await chrome.storage.sync.get(['globalEnabled']);
      this.globalEnabled = result.globalEnabled !== false;
    } catch (error) {
      console.error('Hidey: Error loading global enabled state', error);
      this.globalEnabled = true;
    }
  }

  private updateButtonState() {
    if (!this.button) return;

    if (this.globalEnabled) {
      this.button.classList.remove('hidey-btn-disabled');
      this.button.style.display = 'flex';
      this.button.setAttribute('title', 'Hidey - Blur enabled');
    } else {
      this.button.classList.add('hidey-btn-disabled');
      this.button.style.display = 'none';
      this.button.setAttribute('title', 'Hidey - Blur disabled');
      // Close panel if open
      this.closePanel();
    }
  }

  private async handleClose() {
    // Disable blur globally
    await chrome.runtime.sendMessage({
      type: 'TOGGLE_GLOBAL',
      enabled: false,
    });
    // The button will be hidden via updateButtonState() when storage changes
  }


  private handleAction(action: string) {
    switch (action) {
      case 'click-blur':
        window.dispatchEvent(new CustomEvent('hidey-start-element-picker'));
        break;

      case 'drag-blur':
        window.dispatchEvent(new CustomEvent('hidey-start-drag-blur'));
        break;

      case 'clear-blur':
        window.dispatchEvent(new CustomEvent('hidey-start-unblur-picker'));
        break;

      case 'open-popup':
        // Open extension popup (this will be handled by background script if needed)
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
        break;

      case 'buy-coffee':
        // Open Buy Me a Coffee page
        window.open('https://qr.sepay.vn/img?bank=Techcombank&acc=VIEN02&template=compact&amount=&des=', '_blank');
        break;
    }
  }

  public destroy() {
    if (this.button) {
      this.button.remove();
      this.button = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}

// Initialize floating button when DOM is ready
function initializeFloatingButton() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new FloatingButton();
    });
  } else {
    new FloatingButton();
  }
}

initializeFloatingButton();

