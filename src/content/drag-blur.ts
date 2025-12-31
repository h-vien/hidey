class DragBlur {
  // Selector escaping utility function (scoped to this class)
  private static escapeSelector(identifier: string): string {
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(identifier);
    }
    return identifier.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }
  private isActive: boolean = false;
  private startX: number = 0;
  private startY: number = 0;
  private currentOverlay: HTMLElement | null = null;
  private container: HTMLElement | null = null;

  constructor() {
    this.setupMessageListener();
    this.setupEventListeners();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'START_DRAG_BLUR') {
        this.start();
        sendResponse({ success: true });
      } else if (message.type === 'STOP_DRAG_BLUR') {
        this.stop();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private setupEventListeners() {
    // Listen for custom events from floating button
    window.addEventListener('hidey-start-drag-blur', () => {
      this.start();
    });
  }

  public start() {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    document.body.style.cursor = 'crosshair';
    
    // Try to find a chat container
    this.container = this.findChatContainer() || document.body;

    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  public stop() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    document.body.style.cursor = '';
    
    if (this.currentOverlay) {
      this.currentOverlay.remove();
      this.currentOverlay = null;
    }

    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  private findChatContainer(): HTMLElement | null {
    // Common chat container selectors
    const selectors = [
      '[role="log"]',
      '.chat-container',
      '.message-list',
      '.messages',
      '#messages',
      '[data-testid*="message"]',
      '.conversation',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element as HTMLElement;
      }
    }

    return null;
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (!this.isActive) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.startX = e.clientX;
    this.startY = e.clientY;

    // Create overlay
    this.currentOverlay = document.createElement('div');
    this.currentOverlay.className = 'hidey-drag-overlay';
    this.currentOverlay.style.position = 'fixed';
    this.currentOverlay.style.border = '2px dashed #FF5722';
    this.currentOverlay.style.backgroundColor = 'rgba(255, 87, 34, 0.1)';
    this.currentOverlay.style.pointerEvents = 'none';
    this.currentOverlay.style.zIndex = '99999';
    this.currentOverlay.style.left = `${this.startX}px`;
    this.currentOverlay.style.top = `${this.startY}px`;
    this.currentOverlay.style.width = '0px';
    this.currentOverlay.style.height = '0px';
    document.body.appendChild(this.currentOverlay);

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isActive || !this.currentOverlay) {
      return;
    }

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(this.startX, currentX);
    const top = Math.min(this.startY, currentY);
    const width = Math.abs(currentX - this.startX);
    const height = Math.abs(currentY - this.startY);

    this.currentOverlay.style.left = `${left}px`;
    this.currentOverlay.style.top = `${top}px`;
    this.currentOverlay.style.width = `${width}px`;
    this.currentOverlay.style.height = `${height}px`;
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.isActive || !this.currentOverlay) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const rect = this.currentOverlay.getBoundingClientRect();
    
    if (rect.width > 10 && rect.height > 10) {
      // Calculate position relative to container
      const containerRect = this.container!.getBoundingClientRect();
      const x = rect.left - containerRect.left;
      const y = rect.top - containerRect.top;
      
      // Send region to background script
      chrome.runtime.sendMessage({
        type: 'REGION_CREATED',
        region: {
          urlPattern: this.getUrlPattern(),
          x: x,
          y: y,
          width: rect.width,
          height: rect.height,
          containerSelector: this.container !== document.body 
            ? this.generateContainerSelector(this.container!)
            : undefined,
        },
      });
    }

    this.currentOverlay.remove();
    this.currentOverlay = null;

    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    
    // Stop drag blur mode after creating a region
    this.stop();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.stop();
    }
  };

  private getUrlPattern(): string {
    const url = new URL(window.location.href);
    // Normalize hostname: remove www. prefix to create pattern that matches both www and non-www
    let hostname = url.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return `${url.protocol}//${hostname}${url.pathname}*`;
  }

  private generateContainerSelector(element: HTMLElement): string {
    if (element.id) {
      const escapedId = DragBlur.escapeSelector(element.id);
      return `#${escapedId}`;
    }
    
    if (element.className && typeof element.className === 'string') {
      const classes = element.className
        .split(' ')
        .filter(c => c.length > 0)
        .slice(0, 2)
        .map(c => `.${DragBlur.escapeSelector(c)}`)
        .join('');
      
      if (classes) {
        return `${element.tagName.toLowerCase()}${classes}`;
      }
    }
    
    return element.tagName.toLowerCase();
  }
}

// Initialize drag blur
new DragBlur();

