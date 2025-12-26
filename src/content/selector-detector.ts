class SelectorDetector {
  private isActive: boolean = false;
  private highlightOverlay: HTMLElement | null = null;
  private currentElement: HTMLElement | null = null;

  constructor() {
    this.setupMessageListener();
    this.setupEventListeners();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'START_ELEMENT_PICKER') {
        this.start();
        sendResponse({ success: true });
      } else if (message.type === 'STOP_ELEMENT_PICKER') {
        this.stop();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private setupEventListeners() {
    // Listen for custom events from floating button
    window.addEventListener('hidey-start-element-picker', () => {
      this.start();
    });
  }

  public start() {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    document.body.style.cursor = 'crosshair';
    
    // Create highlight overlay
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.style.position = 'absolute';
    this.highlightOverlay.style.border = '2px solid #4CAF50';
    this.highlightOverlay.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
    this.highlightOverlay.style.pointerEvents = 'none';
    this.highlightOverlay.style.zIndex = '99999';
    this.highlightOverlay.style.display = 'none';
    document.body.appendChild(this.highlightOverlay);

    document.addEventListener('mouseover', this.handleMouseOver);
    document.addEventListener('mouseout', this.handleMouseOut);
    document.addEventListener('click', this.handleClick, true);
  }

  public stop() {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    document.body.style.cursor = '';
    
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }

    document.removeEventListener('mouseover', this.handleMouseOver);
    document.removeEventListener('mouseout', this.handleMouseOut);
    document.removeEventListener('click', this.handleClick, true);
    
    this.currentElement = null;
  }

  private handleMouseOver = (e: MouseEvent) => {
    if (!this.isActive || !this.highlightOverlay) {
      return;
    }

    const target = e.target as HTMLElement;
    if (target === this.highlightOverlay || target === document.body) {
      return;
    }

    this.currentElement = target;
    const rect = target.getBoundingClientRect();
    
    this.highlightOverlay.style.display = 'block';
    this.highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
    this.highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
    this.highlightOverlay.style.width = `${rect.width}px`;
    this.highlightOverlay.style.height = `${rect.height}px`;
  };

  private handleMouseOut = (e: MouseEvent) => {
    if (!this.isActive || !this.highlightOverlay) {
      return;
    }

    // Only hide if moving to a different element
    const target = e.target as HTMLElement;
    if (target !== this.highlightOverlay && target !== document.body) {
      // Keep overlay visible, it will update on next mouseover
    }
  };

  private handleClick = (e: MouseEvent) => {
    if (!this.isActive) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;
    if (target === this.highlightOverlay || target === document.body) {
      return;
    }

    // Generate unique selector
    const selector = this.generateSelector(target);
    
    // Send selector to background script
    chrome.runtime.sendMessage({
      type: 'ELEMENT_SELECTED',
      selector: selector,
      url: window.location.href,
    });

    // Stop picker mode
    this.stop();
  };

  private generateSelector(element: HTMLElement): string {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }

    // Try class combination
    if (element.className && typeof element.className === 'string') {
      const classes = element.className
        .split(' ')
        .filter(c => c.length > 0)
        .slice(0, 3) // Limit to 3 classes
        .map(c => `.${c}`)
        .join('');
      
      if (classes) {
        const tagName = element.tagName.toLowerCase();
        const selector = `${tagName}${classes}`;
        
        // Check if selector is unique
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Try data attributes
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (attr.name.startsWith('data-')) {
        const selector = `[${attr.name}="${attr.value}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }

    // Fallback to path-based selector
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className
          .split(' ')
          .filter(c => c.length > 0)
          .slice(0, 1)
          .map(c => `.${c}`)
          .join('');
        if (classes) {
          selector += classes;
        }
      }

      // Add nth-child if needed
      const siblings = Array.from(current.parentElement?.children || []);
      const index = siblings.indexOf(current) + 1;
      if (siblings.length > 1) {
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }
}

// Initialize selector detector
new SelectorDetector();

