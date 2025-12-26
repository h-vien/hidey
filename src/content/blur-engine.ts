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
        this.applyBlur();
      } else if (message.type === 'UPDATE_REGIONS') {
        this.currentRegions = message.regions || [];
        // Only recreate regions when they change, not full blur
        if (this.enabled) {
          this.applyRegionBlur();
        }
      } else if (message.type === 'UPDATE_SETTINGS') {
        this.enabled = message.enabled !== false;
        this.blurIntensity = message.blurIntensity || BLUR_ENGINE_DEFAULT_INTENSITY;
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

