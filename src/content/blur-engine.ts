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
  hoverToUnblur: boolean;
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
  private hoverToUnblur: boolean = false;
  private debounceTimer: number | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    // Setup message listener first
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'UPDATE_RULES') {
        this.currentRules = message.rules || [];
        this.applyBlur();
      } else if (message.type === 'UPDATE_REGIONS') {
        this.currentRegions = message.regions || [];
        // Only recreate regions when they change, not full blur
        if (this.enabled) {
          this.applyRegionBlur();
        }
      } else if (message.type === 'UPDATE_SETTINGS') {
        const oldHoverToUnblur = this.hoverToUnblur;
        this.enabled = message.enabled !== false;
        this.blurIntensity = message.blurIntensity || BLUR_ENGINE_DEFAULT_INTENSITY;
        this.hoverToUnblur = message.hoverToUnblur || false;
        
        // If hover-to-unblur setting changed, update all blurred elements
        if (oldHoverToUnblur !== this.hoverToUnblur) {
          document.querySelectorAll('[data-hidey-blur]').forEach(el => {
            this.updateHoverToUnblur(el as HTMLElement);
          });
        }
        
        this.applyBlur();
      } else if (message.type === 'TOGGLE_BLUR') {
        this.enabled = !this.enabled;
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
      this.hoverToUnblur = this.siteSettings?.hoverToUnblur || false;
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

    this.observer = new MutationObserver(() => {
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
      }, 100);
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

    // Collect all elements that match rules
    this.currentRules.forEach(rule => {
      rule.selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            elementsToBlur.add(el as HTMLElement);
          });
        } catch (error) {
          console.warn(`Hidey: Invalid selector "${selector}"`, error);
        }
      });
    });

    // Remove blur from elements that no longer match
    document.querySelectorAll('[data-hidey-blur]').forEach(el => {
      const element = el as HTMLElement;
      if (!elementsToBlur.has(element)) {
        this.removeBlurFromElement(element);
      }
    });

    // Apply blur to all matching elements
    elementsToBlur.forEach(element => {
      this.applyBlurToElement(element);
    });
  }

  private applyBlurToElement(element: HTMLElement) {
    const isAlreadyBlurred = element.hasAttribute('data-hidey-blur');
    
    console.log(element,'element')
    if (!isAlreadyBlurred) {
      // First time applying blur
      element.setAttribute('data-hidey-blur', 'selector');
      element.classList.add('hidey-blurred');
      
      // Store original filter if it exists
      const originalFilter = element.style.filter || window.getComputedStyle(element).filter;
      if (originalFilter && originalFilter !== 'none' && !element.hasAttribute('data-hidey-original-filter')) {
        element.setAttribute('data-hidey-original-filter', originalFilter);
      }
      
      // Watch for style changes that might remove blur
      this.watchElementForBlurRemoval(element);
    } else {
      // Re-apply blur in case it was removed by other code
      this.ensureBlurApplied(element);
    }
    
    // Always update blur intensity and transition (in case intensity changed)
    element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
    element.style.setProperty('transition', 'filter 0.2s ease', 'important');
    
    // Handle elements that might override filter (like those with transform, will-change, etc.)
    // Force a reflow to ensure blur is applied
    void element.offsetHeight;
    
    // Always update hover-to-unblur functionality (even if element was already blurred)
    this.updateHoverToUnblur(element);
  }

  private updateHoverToUnblur(element: HTMLElement) {
    // Remove existing listeners first
    if ((element as any).__hideyListenersAdded) {
      const enterHandler = (element as any).__hideyMouseEnter;
      const leaveHandler = (element as any).__hideyMouseLeave;
      if (enterHandler) element.removeEventListener('mouseenter', enterHandler);
      if (leaveHandler) element.removeEventListener('mouseleave', leaveHandler);
      (element as any).__hideyListenersAdded = false;
      delete (element as any).__hideyMouseEnter;
      delete (element as any).__hideyMouseLeave;
    }
    
    // Add hover to unblur if enabled
    if (this.hoverToUnblur) {
      try {
        element.setAttribute('data-hidey-hover-unblur', 'true');
        const mouseEnterHandler = () => {
          element.style.setProperty('filter', 'blur(0px)', 'important');
        };
        const mouseLeaveHandler = () => {
          element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
        };
        
        element.addEventListener('mouseenter', mouseEnterHandler);
        element.addEventListener('mouseleave', mouseLeaveHandler);
        (element as any).__hideyListenersAdded = true;
        (element as any).__hideyMouseEnter = mouseEnterHandler;
        (element as any).__hideyMouseLeave = mouseLeaveHandler;
      } catch (error) {
        console.warn('Hidey: Could not add hover-to-unblur to element', error);
      }
    } else {
      element.removeAttribute('data-hidey-hover-unblur');
    }
  }

  private ensureBlurApplied(element: HTMLElement) {
    const currentFilter = window.getComputedStyle(element).filter;
    const expectedBlur = `blur(${this.blurIntensity}px)`;
    
    // Check if blur is still applied
    if (!currentFilter.includes('blur')) {
      element.style.setProperty('filter', expectedBlur, 'important');
      void element.offsetHeight; // Force reflow
    }
  }

  private watchElementForBlurRemoval(element: HTMLElement) {
    // Use MutationObserver to watch for style attribute changes
    if ((element as any).__hideyStyleObserver) {
      return; // Already watching
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          // Check if blur was removed
          const currentFilter = window.getComputedStyle(element).filter;
          if (!currentFilter.includes('blur')) {
            // Re-apply blur
            element.style.setProperty('filter', `blur(${this.blurIntensity}px)`, 'important');
          }
        }
      });
    });

    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style'],
    });

    (element as any).__hideyStyleObserver = observer;
  }

  private removeBlurFromElement(element: HTMLElement) {
    element.removeAttribute('data-hidey-blur');
    element.classList.remove('hidey-blurred');
    
    // Restore original filter if it existed
    const originalFilter = element.getAttribute('data-hidey-original-filter');
    if (originalFilter) {
      element.style.setProperty('filter', originalFilter, 'important');
      element.removeAttribute('data-hidey-original-filter');
    } else {
      element.style.removeProperty('filter');
    }
    
    element.style.removeProperty('transition');
    
    // Remove hover listeners
    if ((element as any).__hideyListenersAdded) {
      const enterHandler = (element as any).__hideyMouseEnter;
      const leaveHandler = (element as any).__hideyMouseLeave;
      if (enterHandler) element.removeEventListener('mouseenter', enterHandler);
      if (leaveHandler) element.removeEventListener('mouseleave', leaveHandler);
      (element as any).__hideyListenersAdded = false;
    }
    
    // Stop watching for style changes
    if ((element as any).__hideyStyleObserver) {
      (element as any).__hideyStyleObserver.disconnect();
      delete (element as any).__hideyStyleObserver;
    }
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
        document.body.appendChild(overlay);
      }

      // Setup hover-to-unblur if enabled (only set up once per overlay)
      if (this.hoverToUnblur && !overlay.hasAttribute('data-hover-setup')) {
        overlay.setAttribute('data-hover-setup', 'true');
        // Enable pointer events so hover works
        overlay.style.pointerEvents = 'auto';
        
        // Use arrow function to access 'this' and get current blur intensity dynamically
        overlay.addEventListener('mouseenter', () => {
          overlay!.style.filter = 'blur(0px)';
          overlay!.style.backdropFilter = 'blur(0px)';
          overlay!.setAttribute('data-is-hovering', 'true');
        });
        overlay.addEventListener('mouseleave', () => {
          overlay!.style.filter = `blur(${this.blurIntensity}px)`;
          overlay!.style.backdropFilter = `blur(${this.blurIntensity}px)`;
          overlay!.removeAttribute('data-is-hovering');
        });
        
        // Forward clicks through to content below
        // Use a more efficient approach: hide overlay briefly, get element, restore, then click
        const forwardClick = (e: MouseEvent) => {
          const x = e.clientX;
          const y = e.clientY;
          
          // Temporarily hide overlay to get element below (using opacity for instant effect)
          const originalOpacity = overlay!.style.opacity;
          overlay!.style.opacity = '0';
          overlay!.style.pointerEvents = 'none';
          
          // Use requestAnimationFrame to ensure the change takes effect
          requestAnimationFrame(() => {
            const elementBelow = document.elementFromPoint(x, y) as HTMLElement;
            
            // Restore overlay immediately
            overlay!.style.opacity = originalOpacity || '';
            overlay!.style.pointerEvents = 'auto';
            
            if (elementBelow && elementBelow !== overlay && !elementBelow.closest('.hidey-region-overlay')) {
              // Create and dispatch click event on element below
              const clickEvent = new MouseEvent(e.type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: e.button,
                buttons: e.buttons,
                detail: e.detail,
              });
              elementBelow.dispatchEvent(clickEvent);
            }
          });
        };
        
        // Forward pointer events
        ['click', 'mousedown', 'mouseup', 'contextmenu'].forEach(eventType => {
          overlay.addEventListener(eventType, forwardClick as EventListener, true);
        });
      } else if (!this.hoverToUnblur && overlay.hasAttribute('data-hover-setup')) {
        // Remove hover setup if disabled
        overlay.removeAttribute('data-hover-setup');
        overlay.removeAttribute('data-is-hovering');
        overlay.style.pointerEvents = 'none';
      }

      // Update overlay properties (but preserve hover state if hovering)
      const isHovering = overlay.hasAttribute('data-is-hovering');
      overlay.style.position = 'fixed';
      overlay.style.width = `${region.width}px`;
      overlay.style.height = `${region.height}px`;
      
      // Only update blur if not currently hovering (to preserve hover state)
      if (!isHovering) {
        overlay.style.filter = `blur(${this.blurIntensity}px)`;
        overlay.style.backdropFilter = `blur(${this.blurIntensity}px)`;
      }
      
      // Set pointer events based on hover-to-unblur setting
      if (!this.hoverToUnblur) {
        overlay.style.pointerEvents = 'none';
      } else if (!overlay.hasAttribute('data-hover-setup')) {
        // Will be set when hover setup is done
        overlay.style.pointerEvents = 'auto';
      }
      
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

