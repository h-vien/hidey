// Type definitions (inlined to avoid ES module imports in service worker)
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

interface ExtensionState {
  rules: BlurRule[];
  regions: BlurRegion[];
  siteSettings: Record<string, SiteSettings>;
  globalEnabled: boolean;
}

const DEFAULT_BLUR_INTENSITY = 8;
const DEFAULT_SITE_SETTINGS: SiteSettings = {
  enabled: true,
  blurIntensity: DEFAULT_BLUR_INTENSITY,
};

// Initialize default state
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get(['rules', 'regions', 'siteSettings', 'globalEnabled']);
  
  if (!result.rules) {
    await chrome.storage.sync.set({ rules: getDefaultRules() });
  }
  
  if (!result.regions) {
    await chrome.storage.sync.set({ regions: [] });
  }
  
  if (!result.siteSettings) {
    await chrome.storage.sync.set({ siteSettings: {} });
  }
  
  if (result.globalEnabled === undefined) {
    await chrome.storage.sync.set({ globalEnabled: true });
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-blur') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_BLUR' });
      }
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ELEMENT_SELECTED') {
    handleElementSelected(message.selector, message.url).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'UNBLUR_ELEMENT') {
    handleUnblurElement(message.selector, message.url).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'REGION_CREATED') {
    handleRegionCreated(message.region);
    sendResponse({ success: true });
  } else if (message.type === 'GET_STATE') {
    getState().then(state => sendResponse(state));
    return true; // Async response
  } else if (message.type === 'UPDATE_RULE') {
    updateRule(message.rule).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'DELETE_RULE') {
    deleteRule(message.ruleId).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'DELETE_REGION') {
    deleteRegion(message.regionId).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'UPDATE_SITE_SETTINGS') {
    updateSiteSettings(message.hostname, message.settings).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'TOGGLE_GLOBAL') {
    toggleGlobal(message.enabled).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.type === 'OPEN_POPUP') {
    // Open extension popup by focusing the extension icon
    chrome.action.openPopup();
    sendResponse({ success: true });
  }
  
  return true;
});

async function handleUnblurElement(selector: string, url: string) {
  // Remove selector from rules for this URL
  const result = await chrome.storage.sync.get(['rules']);
  const rules: BlurRule[] = result.rules || [];
  
  const urlPattern = url.split('?')[0].split('#')[0] + '*';
  
  // Find rule for this URL pattern
  const ruleIndex = rules.findIndex(r => {
    try {
      const pattern = new RegExp(r.urlPattern.replace(/\*/g, '.*'));
      return pattern.test(url);
    } catch {
      return r.urlPattern === urlPattern;
    }
  });
  
  if (ruleIndex >= 0) {
    const rule = rules[ruleIndex];
    // Remove the selector from the rule
    rule.selectors = rule.selectors.filter(s => s !== selector);
    
    // If no selectors left, remove the entire rule
    if (rule.selectors.length === 0) {
      rules.splice(ruleIndex, 1);
    } else {
      rules[ruleIndex] = rule;
    }
    
    await chrome.storage.sync.set({ rules });
    notifyContentScripts('UPDATE_RULES', { rules });
  }
}

async function handleElementSelected(selector: string, url: string) {
  const urlPattern = getUrlPattern(url);
  const result = await chrome.storage.sync.get(['rules']);
  const rules: BlurRule[] = result.rules || [];
  
  // Check if rule already exists for this URL pattern
  const existingRuleIndex = rules.findIndex(r => r.urlPattern === urlPattern);
  
  if (existingRuleIndex >= 0) {
    // Add selector to existing rule if not already present
    const rule = rules[existingRuleIndex];
    if (!rule.selectors.includes(selector)) {
      rule.selectors.push(selector);
      rules[existingRuleIndex] = rule;
    }
  } else {
    // Create new rule
    rules.push({
      urlPattern,
      selectors: [selector],
      enabled: true,
    });
  }
  
  await chrome.storage.sync.set({ rules });
  
  // Notify content script
  notifyContentScripts('UPDATE_RULES', { rules });
}

async function handleRegionCreated(region: BlurRegion) {
  const result = await chrome.storage.sync.get(['regions']);
  const regions: BlurRegion[] = result.regions || [];
  
  regions.push(region);
  await chrome.storage.sync.set({ regions });
  
  // Notify content script
  notifyContentScripts('UPDATE_REGIONS', { regions });
}

async function getState(): Promise<ExtensionState> {
  const result = await chrome.storage.sync.get(['rules', 'regions', 'siteSettings', 'globalEnabled']);
  // Ensure rules is an array and filter out any invalid entries
  const rules = (result.rules || []).filter((rule: any) => 
    rule && 
    rule.urlPattern && 
    Array.isArray(rule.selectors) && 
    rule.selectors.length > 0
  );
  
  return {
    rules: rules,
    regions: result.regions || [],
    siteSettings: result.siteSettings || {},
    globalEnabled: result.globalEnabled !== false,
  };
}

async function updateRule(rule: BlurRule) {
  const result = await chrome.storage.sync.get(['rules']);
  const rules: BlurRule[] = result.rules || [];
  
  const index = rules.findIndex(r => 
    r.urlPattern === rule.urlPattern && 
    JSON.stringify(r.selectors) === JSON.stringify(rule.selectors)
  );
  
  if (index >= 0) {
    rules[index] = rule;
  } else {
    rules.push(rule);
  }
  
  await chrome.storage.sync.set({ rules });
  notifyContentScripts('UPDATE_RULES', { rules });
}

async function deleteRule(ruleId: string) {
  const result = await chrome.storage.sync.get(['rules']);
  const rules: BlurRule[] = result.rules || [];
  
  // ruleId is a combination of urlPattern and selectors
  const [urlPattern, ...selectorParts] = ruleId.split('|');
  const selectors = selectorParts.join('|').split(',');
  
  const filtered = rules.filter(r => 
    !(r.urlPattern === urlPattern && 
      JSON.stringify(r.selectors.sort()) === JSON.stringify(selectors.sort()))
  );
  
  await chrome.storage.sync.set({ rules: filtered });
  notifyContentScripts('UPDATE_RULES', { rules: filtered });
}

async function deleteRegion(regionId: string) {
  const result = await chrome.storage.sync.get(['regions']);
  const regions: BlurRegion[] = result.regions || [];
  
  // regionId is index-based
  const index = parseInt(regionId, 10);
  if (index >= 0 && index < regions.length) {
    regions.splice(index, 1);
    await chrome.storage.sync.set({ regions });
    notifyContentScripts('UPDATE_REGIONS', { regions });
  }
}

async function updateSiteSettings(hostname: string, settings: Partial<typeof DEFAULT_SITE_SETTINGS>) {
  const result = await chrome.storage.sync.get(['siteSettings']);
  const siteSettings = result.siteSettings || {};
  
  siteSettings[hostname] = {
    ...DEFAULT_SITE_SETTINGS,
    ...siteSettings[hostname],
    ...settings,
  };
  
  await chrome.storage.sync.set({ siteSettings });
  
  // Notify content script
  const tabs = await chrome.tabs.query({});
  tabs.forEach(tab => {
    if (tab.id && tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.hostname === hostname) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_SETTINGS',
            ...siteSettings[hostname],
          });
        }
      } catch {
        // Invalid URL, skip
      }
    }
  });
}

async function toggleGlobal(enabled: boolean) {
  await chrome.storage.sync.set({ globalEnabled: enabled });
  notifyContentScripts('UPDATE_SETTINGS', { enabled });
}

function notifyContentScripts(type: string, data: any) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type, ...data }).catch(() => {
          // Tab might not have content script loaded, ignore
        });
      }
    });
  });
}

function getUrlPattern(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}*`;
  } catch {
    return url;
  }
}

function getDefaultRules(): BlurRule[] {
  return [
    {
      urlPattern: 'https://chat.zalo.me/*',
      selectors: [
        '.message-text',
        '.message-content',
        '[data-message-content]',
      ],
      enabled: true,
    },
    {
      urlPattern: 'https://web.telegram.org/*',
      selectors: [
        '.message',
        '.text-content',
        '[data-message-text]',
      ],
      enabled: true,
    },
    {
      urlPattern: 'https://www.messenger.com/*',
      selectors: [
        '[data-testid*="message"]',
        '.message',
        '.text-content',
      ],
      enabled: true,
    },
  ];
}

