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
  
  // Always ensure default rules exist (merge with existing rules)
  const defaultRules = getDefaultRules();
  const existingRules = result.rules || [];
  
  // Merge default rules with existing rules (don't overwrite user's custom rules)
  defaultRules.forEach(defaultRule => {
    const existingRuleIndex = existingRules.findIndex((r: BlurRule) => r.urlPattern === defaultRule.urlPattern);
    if (existingRuleIndex >= 0) {
      // Merge selectors if rule exists
      const existingRule = existingRules[existingRuleIndex];
      defaultRule.selectors.forEach(selector => {
        if (!existingRule.selectors.includes(selector)) {
          existingRule.selectors.push(selector);
        }
      });
      existingRules[existingRuleIndex] = existingRule;
    } else {
      // Add new default rule
      existingRules.push(defaultRule);
    }
  });
  
  await chrome.storage.sync.set({ rules: existingRules });
  
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
    handleUnblurElement(message.selector, message.url).then(() => sendResponse({ 

     }));
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
  // Check if this selector is from a default rule - if so, don't allow clearing
  const defaultRules = getDefaultRules();
  const urlPattern = url.split('?')[0].split('#')[0] + '*';
  
  // Check if selector is in any default rule for this URL
  const isDefaultSelector = defaultRules.some(rule => {
    if (urlMatchesPattern(url, rule.urlPattern)) {
      return rule.selectors.includes(selector);
    }
    return false;
  });
  
  if (isDefaultSelector) {
    // Don't allow clearing default rule selectors
    console.log('Hidey: Cannot clear blur for default rule selector:', selector);
    return;
  }
  
  // Remove selector from rules for this URL (only for user-added rules)
  const result = await chrome.storage.sync.get(['rules']);
  const rules: BlurRule[] = result.rules || [];
  
  // Find rule for this URL pattern
  const ruleIndex = rules.findIndex(r => {
    return urlMatchesPattern(url, r.urlPattern);
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
  notifyContentScripts('UNBLUR_ELEMENT', { selector, url, rules });
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
    // Normalize hostname: remove www. prefix to create pattern that matches both www and non-www
    let hostname = urlObj.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return `${urlObj.protocol}//${hostname}${urlObj.pathname}*`;
  } catch {
    return url;
  }
}

// Helper function to normalize hostname for matching (removes www. prefix)
function normalizeHostnameForMatching(urlString: string): string {
  try {
    const urlObj = new URL(urlString);
    let hostname = urlObj.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return urlString.replace(urlObj.hostname, hostname);
  } catch {
    return urlString;
  }
}

// Helper function to check if URL matches pattern (handles www/non-www)
function urlMatchesPattern(url: string, pattern: string): boolean {
  try {
    // Normalize both URL and pattern
    const normalizedUrl = normalizeHostnameForMatching(url);
    const normalizedPattern = normalizeHostnameForMatching(pattern);

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

function getDefaultRules(): BlurRule[] {
  return [
    {
      urlPattern: 'https://chat.zalo.me/*',
      selectors: [
        '[data-component="bubble-message"]',
        '.zavatar',
        '.threadChat__title',
        '[data-id="div_TabMsg_ThrdChItem"]',
      ],
      enabled: true,
    },
    {
      urlPattern: 'https://www.facebook.com/messages/*',
      selectors: [
        '.html-div.x1qjc9v5.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k.xeuugli.xifccgj.x4cne27.xw01apr.x1ws5yxj.xbktkl8.x1tr5nd9.x3su7b9.x12pbpz1.x1gtkyd9.x1r8uycs',
        '.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x6ikm8r.x10wlt62',
        '.x9f619.x1n2onr6.x1ja2u2z.x78zum5.xdt5ytf.x193iq5w.xeuugli.x1r8uery.xs83m0k.x1icxu4v.x10b6aqq.x1yrsyyn.x1iyjqo2.xyiysdx',
        '.x1n2onr6.x1ja2u2z.x78zum5.xdt5ytf.x193iq5w.xeuugli.x1r8uery.xs83m0k.x1icxu4v.x10b6aqq.x1yrsyyn.x1iyjqo2.xyiysdx',
        '.html-div.x1qjc9v5.x1q0q8m5.x1qhh985.x18b5jzi.x10w94by.x1t7ytsu.x14e42zd.x13fuv20.x972fbf.x1ey2m1c.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xs83m0k.xtijo5x.x1o0tod.x1qughib.xat24cr.x14z9mp.x1lziwak.xdj266r.x2lwn1j.xeuugli.x18d9i69.xyri2b.x1c1uobl.xexx8yu.x10l6tqk.x13vifvy.x1ja2u2z',
        '.x1rg5ohu.x1n2onr6.x3ajldb.x1ja2u2z',
        '.html-h2.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1vvkbs.x1heor9g.x1qlqyl8.x1pd3egz.x1a2a7pz.x193iq5w.xeuugli',
        '.x1rg5ohu.x5yr21d.xl1xv1r.xh8yej3',
      ],
      enabled: true,
    },
    {
      urlPattern: 'https://www.messenger.com/*',
      selectors: [
        '.html-div.x1qjc9v5.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xl56j7k.xeuugli.xifccgj.x4cne27.xw01apr.x1ws5yxj.xbktkl8.x1tr5nd9.x3su7b9.x12pbpz1.x1gtkyd9.x1r8uycs',
        '.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x6ikm8r.x10wlt62',
        '.x9f619.x1n2onr6.x1ja2u2z.x78zum5.xdt5ytf.x193iq5w.xeuugli.x1r8uery.xs83m0k.x1icxu4v.x10b6aqq.x1yrsyyn.x1iyjqo2.xyiysdx',
        '.x1n2onr6.x1ja2u2z.x78zum5.xdt5ytf.x193iq5w.xeuugli.x1r8uery.xs83m0k.x1icxu4v.x10b6aqq.x1yrsyyn.x1iyjqo2.xyiysdx',
        '.html-div.x1qjc9v5.x1q0q8m5.x1qhh985.x18b5jzi.x10w94by.x1t7ytsu.x14e42zd.x13fuv20.x972fbf.x1ey2m1c.x9f619.x78zum5.xdt5ytf.x1iyjqo2.xs83m0k.xtijo5x.x1o0tod.x1qughib.xat24cr.x14z9mp.x1lziwak.xdj266r.x2lwn1j.xeuugli.x18d9i69.xyri2b.x1c1uobl.xexx8yu.x10l6tqk.x13vifvy.x1ja2u2z',
        '.x1rg5ohu.x1n2onr6.x3ajldb.x1ja2u2z',
        '.x1rg5ohu.x5yr21d.xl1xv1r.xh8yej3',
        '.x1qjc9v5.x9f619.x78zum5.xdl72j9.xdt5ytf.x2lwn1j.xeuugli.x1n2onr6.x1ja2u2z.x1es9f29.x1fy70ro.x1vu7fv8.xuna32c.x1iyjqo2.xs83m0k',
        '.html-h2.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1vvkbs.x1heor9g.x1qlqyl8.x1pd3egz.x1a2a7pz.x193iq5w.xeuugli',
      ],
      enabled: true,
    },
    {
      urlPattern: 'https://web.telegram.org/*',
      selectors: [
        '.chatlist-chat',
        '.chat-info',
        '.chat-message',
        '.bubble-content-wrapper'
      ],
      enabled: true,
    }
  ];
}

