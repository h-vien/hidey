// Unblur detector - allows clicking on blurred elements to remove blur
class UnblurDetector {
  // Selector escaping utility functions (scoped to this class)
  private static escapeSelector(identifier: string): string {
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return CSS.escape(identifier);
    }
    return identifier.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  private static escapeAttributeValue(value: string): string {
    if (value.includes('"')) {
      return value.replace(/"/g, '\\"');
    }
    if (value.includes("'")) {
      return value.replace(/'/g, "\\'");
    }
    return value;
  }
  private isActive: boolean = false;
  private highlightOverlay: HTMLElement | null = null;
  private currentElement: HTMLElement | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for custom events from floating button
    window.addEventListener('hidey-start-unblur-picker', () => {
      this.start();
    });
  }

  public start() {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    document.body.style.cursor = 'crosshair';
    
    // Dispatch event to notify blur engine that clear blur mode is active
    window.dispatchEvent(new CustomEvent('hidey-clear-blur-mode-started'));
    
    // Create highlight overlay
    this.highlightOverlay = document.createElement('div');
    this.highlightOverlay.style.position = 'absolute';
    this.highlightOverlay.style.border = '2px solid #FF5722';
    this.highlightOverlay.style.backgroundColor = 'rgba(255, 87, 34, 0.1)';
    this.highlightOverlay.style.pointerEvents = 'none';
    this.highlightOverlay.style.zIndex = '99999';
    this.highlightOverlay.style.display = 'none';
    document.body.appendChild(this.highlightOverlay);

    // Enable pointer events on region overlays so they can be clicked
    document.querySelectorAll('.hidey-region-overlay').forEach((overlay: Element) => {
      (overlay as HTMLElement).style.pointerEvents = 'auto';
      (overlay as HTMLElement).style.cursor = 'pointer';
    });

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
    
    // Dispatch event to notify blur engine that clear blur mode is stopped
    window.dispatchEvent(new CustomEvent('hidey-clear-blur-mode-stopped'));
    
    if (this.highlightOverlay) {
      this.highlightOverlay.remove();
      this.highlightOverlay = null;
    }

    // Disable pointer events on region overlays (restore normal behavior)
    document.querySelectorAll('.hidey-region-overlay').forEach((overlay: Element) => {
      (overlay as HTMLElement).style.pointerEvents = 'none';
      (overlay as HTMLElement).style.cursor = '';
    });

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

    // Check if hovering over a region overlay
    const regionOverlay = target.closest('.hidey-region-overlay') as HTMLElement;
    if (regionOverlay) {
      const rect = regionOverlay.getBoundingClientRect();
      this.highlightOverlay.style.display = 'block';
      this.highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
      this.highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
      this.highlightOverlay.style.width = `${rect.width}px`;
      this.highlightOverlay.style.height = `${rect.height}px`;
      this.currentElement = regionOverlay;
      return;
    }

    // Highlight blurred elements, but allow clicking on any element
    if (target.hasAttribute('data-hidey-blur')) {
      this.currentElement = target;
      const rect = target.getBoundingClientRect();
      
      this.highlightOverlay.style.display = 'block';
      this.highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
      this.highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
      this.highlightOverlay.style.width = `${rect.width}px`;
      this.highlightOverlay.style.height = `${rect.height}px`;
    } else {
      // Don't show highlight for non-blurred elements, but still allow clicking
      this.highlightOverlay.style.display = 'none';
    }
  };

  private handleMouseOut = (e: MouseEvent) => {
    if (!this.isActive || !this.highlightOverlay) {
      return;
    }

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

    // Check if clicking on a region overlay
    const regionOverlay = target.closest('.hidey-region-overlay') as HTMLElement;
    if (regionOverlay) {
      const regionId = regionOverlay.getAttribute('data-region-id');
      if (regionId !== null) {
        // Delete the region
        chrome.runtime.sendMessage({
          type: 'DELETE_REGION',
          regionId: regionId,
        });
        // Stop picker mode
        this.stop();
        return;
      }
    }

    // If element is blurred, unblur it; otherwise just complete the action
    if (target.hasAttribute('data-hidey-blur')) {
    // Find all selectors that match this element from the current rules
    this.findMatchingSelectors(target).then((matchingSelectors) => {
      if (matchingSelectors.length > 0) {
        // Send unblur request for each matching selector
        // The background script will check if it's a default rule and prevent clearing
        matchingSelectors.forEach(selector => {
          chrome.runtime.sendMessage({
            type: 'UNBLUR_ELEMENT',
            selector: selector,
            url: window.location.href,
          });
        });
      } else {
        // Fallback: generate selector and try to remove it
        const selector = this.generateSelector(target);
        chrome.runtime.sendMessage({
          type: 'UNBLUR_ELEMENT',
          selector: selector,
          url: window.location.href,
        });
      }
      
      // Stop picker mode after processing
      this.stop();
    }).catch((error) => {
      console.error('Hidey: Error finding matching selectors', error);
      // Stop picker mode even on error
      this.stop();
    });
    } else {
      // Element is not blurred, just complete the action (do nothing)
      this.stop();
    }
  };

  private async findMatchingSelectors(element: HTMLElement): Promise<string[]> {
    // Get current rules from background script
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    const rules = response?.rules || [];
    const currentUrl = window.location.href;
    
    const matchingSelectors: string[] = [];
    
    // Check each rule for the current URL
    rules.forEach((rule: any) => {
      try {
        // Check if rule matches current URL (handles www/non-www)
        if (this.urlMatchesPattern(currentUrl, rule.urlPattern)) {
          // Check each selector in the rule
          rule.selectors.forEach((selector: string) => {
            try {
              // Test if this selector matches the clicked element
              const matches = document.querySelectorAll(selector);
              if (Array.from(matches).includes(element)) {
                matchingSelectors.push(selector);
              }
            } catch (err) {
              // Invalid selector, skip
            }
          });
        }
      } catch (err) {
        // Invalid pattern, skip
      }
    });
    
    return matchingSelectors;
  }

  private urlMatchesPattern(url: string, pattern: string): boolean {
    try {
      // Normalize hostnames to handle www/non-www variations
      const normalizeHostname = (urlString: string): string => {
        try {
          const urlObj = new URL(urlString);
          let hostname = urlObj.hostname;
          // Remove www. prefix if present
          if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
          }
          return urlString.replace(urlObj.hostname, hostname);
        } catch {
          return urlString;
        }
      };

      // Normalize both URL and pattern for comparison (remove www. from both)
      const normalizedUrl = normalizeHostname(url);
      const normalizedPattern = normalizeHostname(pattern);

      // Convert URL pattern to regex
      let regexPattern = normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');

      // Make www. optional in the hostname part of the pattern
      // This allows patterns to match both www and non-www versions
      regexPattern = regexPattern.replace(
        /(https?:\/\/)([^\/\*]+)/g,
        (match, protocol, hostnamePart) => {
          return `${protocol}(www\\.)?${hostnamePart}`;
        }
      );

      const regex = new RegExp(`^${regexPattern}$`);
      // Try matching both normalized and original URL
      return regex.test(normalizedUrl) || regex.test(url);
    } catch {
      return false;
    }
  }

  private generateSelector(element: HTMLElement): string {
    // Try ID first
    if (element.id) {
      const escapedId = UnblurDetector.escapeSelector(element.id);
      return `#${escapedId}`;
    }

    // Try class names
    if (element.className && typeof element.className === 'string') {
      const classes = element.className
        .split(' ')
        .filter(c => c.length > 0 && !c.includes('hidey'))
        .slice(0, 3)
        .map(c => `.${UnblurDetector.escapeSelector(c)}`)
        .join('');
      if (classes) {
        return classes;
      }
    }

    // Use tag name with nth-child as fallback
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      return `${tagName}:nth-child(${index})`;
    }

    return tagName;
  }
}

// Initialize unblur detector
new UnblurDetector();

