// Type definitions (inlined to avoid ES module imports)
interface BlurRule {
  urlPattern: string;
  selectors: string[];
  enabled: boolean;
}

interface BlurRegion {
  urlPattern: string;
  x: number;
  y: number;
  width: number;
  height: number;
  containerSelector?: string;
}

interface SiteSettings {
  enabled: boolean;
  blurIntensity: number;
}

// Constants (scoped to avoid conflicts with background script)
const BLUR_ENGINE_DEFAULT_INTENSITY = 8;

class BlurEngine {
  private observer: MutationObserver | null = null;
  private currentRules: BlurRule[] = [];
  private currentRegions: BlurRegion[] = [];
  private siteSettings: SiteSettings | null = null;
  private enabled: boolean = true;
  private blurIntensity: number = BLUR_ENGINE_DEFAULT_INTENSITY;
  private debounceTimer: number | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    // Setup message listener first
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'UPDATE_RULES') {
        this.currentRules = message.rules || [];
        // Clear any hovering state before applying blur to ensure elements that were cleared stay cleared
        document.querySelectorAll('[data-hidey-hovering]').forEach(el => {
          const element = el as HTMLElement;
          // Only restore blur if element still has data-hidey-blur attribute
          if (element.hasAttribute('data-hidey-blur')) {
            element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
          }
          element.removeAttribute('data-hidey-hovering');
        });
        this.applyBlur();
      } else if (message.type === 'UPDATE_REGIONS') {
        this.currentRegions = message.regions || [];
        // Only recreate regions when they change, not full blur
        if (this.enabled) {
          this.applyRegionBlur();
        }
      } else if (message.type === 'UPDATE_SETTINGS') {
        const oldBlurIntensity = this.blurIntensity;
        this.enabled = message.enabled !== false;
        this.blurIntensity = message.blurIntensity || BLUR_ENGINE_DEFAULT_INTENSITY;
        
        // If blur intensity changed, update all blurred elements and restore hover state
        if (oldBlurIntensity !== this.blurIntensity) {
          document.querySelectorAll('[data-hidey-blur]').forEach(el => { 
            const element = el as HTMLElement;
            const isHovering = element.hasAttribute('data-hidey-hovering');
            if (!isHovering) {
              element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
            }
          });
        }
        
        this.applyBlur();
      } else if (message.type === 'TOGGLE_BLUR') {
        // This is for local toggle (deprecated, use UPDATE_SETTINGS instead)
        this.enabled = !this.enabled;
        // Upload (persist) the current globalEnabled state to chrome.storage.sync
        chrome.storage.sync.set({ globalEnabled: this.enabled });
        this.applyBlur();
      }
      return true;
    });
    
    // Listen for custom events from floating button
    window.addEventListener('hidey-toggle-blur', () => {
      this.enabled = !this.enabled;
      this.applyBlur();
    });
    
    // Load initial state
    await this.loadState();
    
    // Start observing DOM changes
    this.startObserving();
    
    // Apply initial blur after state is loaded
    this.applyBlur();
  }

  private async loadState() {
    try {
      const result = await chrome.storage.sync.get(['rules', 'regions', 'siteSettings', 'globalEnabled']);
      const currentUrl = window.location.href;
      
      // Find matching rules for current URL
      this.currentRules = (result.rules || []).filter((rule: BlurRule) => 
        this.urlMatchesPattern(currentUrl, rule.urlPattern) && rule.enabled
      );
      
      // Find matching regions for current URL
      this.currentRegions = (result.regions || []).filter((region: BlurRegion) =>
        this.urlMatchesPattern(currentUrl, region.urlPattern)
      );
      
      // Get site settings
      const hostname = new URL(currentUrl).hostname;
      this.siteSettings = result.siteSettings?.[hostname] || null;
      this.enabled = result.globalEnabled !== false;
      this.blurIntensity = this.siteSettings?.blurIntensity || BLUR_ENGINE_DEFAULT_INTENSITY;
    } catch (error) {
      console.error('Hidey: Error loading state', error);
    }
  }

  private urlMatchesPattern(url: string, pattern: string): boolean {
    try {
      // Convert URL pattern to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(url);
    } catch {
      return false;
    }
  }

  private startObserving() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      // Only process if there are actual relevant changes
      const hasRelevantChanges = mutations.some(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          return true;
        }
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
          // Only care about changes to elements that might match our selectors
          const target = mutation.target as HTMLElement;
          return !target.hasAttribute('data-hidey-blur');
        }
        return false;
      });

      if (!hasRelevantChanges) {
        return;
      }

      // Debounce DOM changes
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = window.setTimeout(() => {
        // Only reapply selector blur on DOM changes, not regions
        // Regions are position-based and don't need to be recreated
        if (this.enabled) {
          this.applySelectorBlur();
        }
      }, 20); // Increased debounce time for better performance
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'], // Watch for style and class changes
    });

    // Update region positions on scroll/resize instead of recreating
    let positionUpdateTimer: number | null = null;
    const updatePositions = () => {
      if (positionUpdateTimer) {
        clearTimeout(positionUpdateTimer);
      }
      positionUpdateTimer = window.setTimeout(() => {
        this.updateRegionPositions();
      }, 50);
    };

    window.addEventListener('scroll', updatePositions, { passive: true });
    window.addEventListener('resize', updatePositions, { passive: true });
  }

  private updateRegionPositions() {
    // Only update positions of existing regions, don't recreate them
    const overlays = document.querySelectorAll('.hidey-region-overlay') as NodeListOf<HTMLElement>;
    
    overlays.forEach((overlay) => {
      const regionId = overlay.getAttribute('data-region-id');
      if (regionId === null) return;
      
      const regionIndex = parseInt(regionId, 10);
      if (regionIndex < 0 || regionIndex >= this.currentRegions.length) return;
      
      const region = this.currentRegions[regionIndex];
      let container: HTMLElement | null = null;
      
      if (region.containerSelector) {
        container = document.querySelector(region.containerSelector) as HTMLElement;
      }
      
      if (!container) {
        container = document.body;
      }

      const containerRect = container.getBoundingClientRect();
      overlay.style.left = `${containerRect.left + region.x + window.scrollX}px`;
      overlay.style.top = `${containerRect.top + region.y + window.scrollY}px`;
    });
  }

  private applyBlur() {
    if (!this.enabled) {
      console.log('removeAllBlur')
      this.removeAllBlur();
      return;
    }

    // Apply selector-based blur
    this.applySelectorBlur();
    
    // Apply region-based blur (only if regions changed, otherwise positions are updated separately)
    this.applyRegionBlur();
  }

  private applySelectorBlur() {
    // Track elements that should be blurred
    const elementsToBlur = new Set<HTMLElement>();
    const currentUrl = window.location.href
    // Collect all elements that match rules (batch querySelectorAll calls)
    const matchRule = this.currentRules.find(rule => this.urlMatchesPattern(currentUrl, rule.urlPattern));

    if (matchRule) {
      matchRule.selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        this.applyBlurInBatches(Array.from(elements) as HTMLElement[]);
      });
    }

  }

  private applyBlurInBatches(elements: HTMLElement[]) {
    const batchSize = 50; // Process 50 elements per frame
    let index = 0;

    const processBatch = () => {
      const end = Math.min(index + batchSize, elements.length);
      
      for (let i = index; i < end; i++) {
        this.applyBlurToElement(elements[i]);
      }
      
      index = end;
      
      if (index < elements.length) {
        requestAnimationFrame(processBatch);
      }
    };

    if (elements.length > 0) {
      requestAnimationFrame(processBatch);
    }
  }

  private applyBlurToElement(element: HTMLElement) {
    const isAlreadyBlurred = element.hasAttribute('data-hidey-blur');
    const isHovering = element.hasAttribute('data-hidey-hovering');
    
    if (!isAlreadyBlurred && !isHovering) {
      // First time applying blur
      element.setAttribute('data-hidey-blur', 'selector');
      element.classList.add('hidey-blurred');
      
      // Apply blur style immediately
      element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
      element.style.setProperty('transition', 'filter 0.2s ease', 'important');
    } else if (isAlreadyBlurred && !isHovering) {
      // Re-apply blur in case it was removed by other code
      this.ensureBlurApplied(element);
    }
    
    // Add hover-to-unblur functionality (only if not already set up)
    if (!(element as any).__hideyHoverListeners) {
      this.setupHoverToUnblur(element);
    }
  }

  private setupHoverToUnblur(element: HTMLElement) {
    // Remove existing listeners if any
    if ((element as any).__hideyHoverListeners) {
      const { enterHandler, leaveHandler } = (element as any).__hideyHoverListeners;
      element.removeEventListener('mouseenter', enterHandler);
      element.removeEventListener('mouseleave', leaveHandler);
    }

    const mouseEnterHandler = () => {
      // Temporarily remove blur when entering this element or any child
      // mouseenter automatically handles parent-child relationships
      element.style.setProperty('filter', 'none', 'important');
      element.setAttribute('data-hidey-hovering', 'true');
    };

    const mouseLeaveHandler = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      
      // Check if element still has blur attribute (might have been cleared)
      if (!element.hasAttribute('data-hidey-blur')) {
        // Element was cleared, don't restore blur
        element.removeAttribute('data-hidey-hovering');
        return;
      }
      
      // Check if we're moving to a child element within this blurred element
      if (relatedTarget && element.contains(relatedTarget)) {
        // Still inside the blurred element (moving to a child), keep unblurred
        return;
      }
      
      // Truly leaving the blurred element, restore blur only if still blurred
      if (element.hasAttribute('data-hidey-blur')) {
        element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
      }
      element.removeAttribute('data-hidey-hovering');
    };

    // mouseenter/mouseleave automatically handle parent-child relationships correctly
    // They fire when entering/leaving the element OR any of its descendants
    element.addEventListener('mouseenter', mouseEnterHandler);
    element.addEventListener('mouseleave', mouseLeaveHandler);

    // Store handlers for cleanup
    (element as any).__hideyHoverListeners = {
      enterHandler: mouseEnterHandler,
      leaveHandler: mouseLeaveHandler,
    };
  }

  private ensureBlurApplied(element: HTMLElement) {
    const isHovering = element.hasAttribute('data-hidey-hovering');
    if (isHovering) {
      return;
    }
    
    // Check if blur is still applied (only check computed style if needed)
    const currentFilter = element.style.filter;
    if (!currentFilter || !currentFilter.includes('blur')) {
      element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
    }
  }

  private watchElementForBlurRemoval(element: HTMLElement) {
    // Skip per-element observers for performance
    // The main MutationObserver will handle style changes globally
    // This reduces the number of observers from N (one per element) to 1
  }

  private removeBlurFromElement(element: HTMLElement) {
    element.removeAttribute('data-hidey-blur');
    element.classList.remove('hidey-blurred');
    
    // Simply remove the filter property (we don't need to restore original filter)
    element.style.removeProperty('filter');
    
    element.style.removeProperty('transition');
  }

  private applyRegionBlur() {
    // Get existing overlays
    const existingOverlays = Array.from(document.querySelectorAll('.hidey-region-overlay')) as HTMLElement[];
    const usedOverlays: HTMLElement[] = [];

    this.currentRegions.forEach((region, index) => {
      let container: HTMLElement | null = null;
      
      if (region.containerSelector) {
        container = document.querySelector(region.containerSelector) as HTMLElement;
      }
      
      if (!container) {
        container = document.body;
      }

      // Try to reuse existing overlay
      let overlay = existingOverlays.find(el => {
        const regionId = el.getAttribute('data-region-id');
        return regionId === String(index);
      }) as HTMLElement | undefined;

      if (!overlay) {
        // Create new overlay if it doesn't exist
        overlay = document.createElement('div');
        overlay.className = 'hidey-region-overlay';
        overlay.setAttribute('data-region-id', String(index));
        overlay.setAttribute('title', 'Click to delete this blur region');
        document.body.appendChild(overlay);
      }

      // Set pointer events to none by default (unblur-detector will enable when active)
      overlay.style.pointerEvents = 'none';
      
      // Update overlay properties
      overlay.style.position = 'fixed';
      overlay.style.width = `${region.width}px`;
      overlay.style.height = `${region.height}px`;
      overlay.style.filter = `blur(${this.blurIntensity}px)`;
      overlay.style.backdropFilter = `blur(${this.blurIntensity}px)`;
      
      overlay.style.zIndex = '9999';
      overlay.style.backgroundColor = 'transparent';
      overlay.style.transition = 'filter 0.2s ease, backdrop-filter 0.2s ease';
      
      // Position relative to container (use fixed positioning for better performance)
      const containerRect = container.getBoundingClientRect();
      overlay.style.left = `${containerRect.left + region.x + window.scrollX}px`;
      overlay.style.top = `${containerRect.top + region.y + window.scrollY}px`;
      
      usedOverlays.push(overlay);
    });

    // Remove overlays that are no longer needed
    existingOverlays.forEach(overlay => {
      if (!usedOverlays.includes(overlay)) {
        overlay.remove();
      }
    });
  }

  private removeAllBlur() {
    document.querySelectorAll('[data-hidey-blur]').forEach(el => {
      const element = el as HTMLElement;
      element.removeAttribute('data-hidey-blur');
      element.classList.remove('hidey-blurred');
      element.style.filter = '';
    });

      // Collect all elements that match rules
    this.currentRules.forEach(rule => {
      rule.selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            this.removeBlurFromElement(el as HTMLElement);
          });
        } catch (error) {
          console.warn(`Hidey: Invalid selector "${selector}"`, error);
        }
      });
    });
    
    document.querySelectorAll('.hidey-region-overlay').forEach(el => el.remove());
  }

  public destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.removeAllBlur();
  }
}

// Initialize blur engine when content script loads
async function initializeBlurEngine() {
  // Wait for DOM to be ready if needed
  if (document.readyState === 'loading') {
    await new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }
  
  // Small delay to ensure page is fully loaded
  await new Promise(resolve => setTimeout(resolve, 100));
  
  new BlurEngine();
}

initializeBlurEngine();

