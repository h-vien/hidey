// Popup script
let currentTab = null;
let currentState = null;
let previousBlurGroupState = {
  blurAvatars: false,
  blurConversationList: false,
  blurMessages: false,
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load state
  await loadState();

  // Setup event listeners
  setupEventListeners();
  
  // Listen for storage changes to update UI
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.globalEnabled) {
      loadState();
    }
  });
});

async function loadState() {
  try {
    // Get extension state
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    currentState = response;

    // Initialize default selectors for current site if not present
    if (currentTab && currentTab.url) {
      try {
        const hostname = new URL(currentTab.url).hostname;
        const normalizedHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
        const siteSettings = currentState.siteSettings[normalizedHostname];
        
        if (!siteSettings || !siteSettings.selectors) {
          // Initialize with default settings (selectors will be set by background script)
          await chrome.runtime.sendMessage({
            type: 'UPDATE_SITE_SETTINGS',
            hostname: normalizedHostname,
            settings: {},
          });
          
          // Reload state to get initialized selectors
          const updatedResponse = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
          currentState = updatedResponse;
        }
      } catch (error) {
        console.error('Error initializing site settings:', error);
      }
    }

    // Update UI
    updateUI();
  } catch (error) {
    console.error('Error loading state:', error);
  }
}

function setupEventListeners() {
  // Global toggle
  const globalToggle = document.getElementById('globalToggle');
  globalToggle.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    const hostname = currentTab ? new URL(currentTab.url).hostname : '';
    const normalizedHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    

    if (!isEnabled) {
      console.log('Hidey: Turning off global blur');
      // Save current blur group states before turning off
      const siteSettings = currentState?.siteSettings?.[normalizedHostname] || {};
      
      previousBlurGroupState = {
        blurAvatars: siteSettings.blurAvatars || false,
        blurConversationList: siteSettings.blurConversationList || false,
        blurMessages: siteSettings.blurMessages || false,
      };
  
    }
    await chrome.runtime.sendMessage({
      type: 'TOGGLE_GLOBAL',
      enabled: isEnabled,
    });
    await loadState();
  });

  // Blur group toggles
  const blurAvatars = document.getElementById('blurAvatars');
  const blurConversationList = document.getElementById('blurConversationList');
  const blurMessages = document.getElementById('blurMessages');

  blurAvatars.addEventListener('change', async (e) => {
    // Only allow changes if global toggle is enabled
    if (!currentState?.globalEnabled) {
      e.target.checked = false;
      return;
    }
    
    const hostname = new URL(currentTab.url).hostname;
    const normalizedHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    await chrome.runtime.sendMessage({
      type: 'UPDATE_BLUR_GROUP',
      hostname: normalizedHostname,
      group: 'blurAvatars',
      enabled: e.target.checked,
    });
    await loadState();
  });

  blurConversationList.addEventListener('change', async (e) => {
    // Only allow changes if global toggle is enabled
    if (!currentState?.globalEnabled) {
      e.target.checked = false;
      return;
    }
    
    const hostname = new URL(currentTab.url).hostname;
    const normalizedHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    await chrome.runtime.sendMessage({
      type: 'UPDATE_BLUR_GROUP',
      hostname: normalizedHostname,
      group: 'blurConversationList',
      enabled: e.target.checked,
    });
    await loadState();
  });

  blurMessages.addEventListener('change', async (e) => {
    // Only allow changes if global toggle is enabled
    if (!currentState?.globalEnabled) {
      e.target.checked = false;
      return;
    }
    
    const hostname = new URL(currentTab.url).hostname;
    const normalizedHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
    await chrome.runtime.sendMessage({
      type: 'UPDATE_BLUR_GROUP',
      hostname: normalizedHostname,
      group: 'blurMessages',
      enabled: e.target.checked,
    });
    await loadState();
  });

  // Blur intensity slider
  const blurIntensity = document.getElementById('blurIntensity');
  const blurIntensityValue = document.getElementById('blurIntensityValue');
  
  blurIntensity.addEventListener('input', (e) => {
    const value = e.target.value;
    blurIntensityValue.textContent = `${value}px`;
  });

  blurIntensity.addEventListener('change', async (e) => {
    const value = parseInt(e.target.value, 10);
    const hostname = new URL(currentTab.url).hostname;
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SITE_SETTINGS',
      hostname,
      settings: { blurIntensity: value },
    });
    
    await loadState();
  });

}

function updateUI() {
  if (!currentState) {
    return;
  }

  // Update global toggle
  const globalEnabled = currentState.globalEnabled;
  document.getElementById('globalToggle').checked = globalEnabled;

  // Update settings
  const hostname = currentTab ? new URL(currentTab.url).hostname : '';
  // Normalize hostname (remove www.)
  const normalizedHostname = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
  const siteSettings = currentState.siteSettings[normalizedHostname] || {};
  
  // Initialize previous blur group state from current settings when global is enabled
  // This ensures we can restore the state when global toggle is turned back on
  if (globalEnabled) {
    previousBlurGroupState = {
      blurAvatars: siteSettings.blurAvatars || false,
      blurConversationList: siteSettings.blurConversationList || false,
      blurMessages: siteSettings.blurMessages || false,
    };
  }
  
  // Update blur group toggles
  const blurAvatarsToggle = document.getElementById('blurAvatars');
  const blurConversationListToggle = document.getElementById('blurConversationList');
  const blurMessagesToggle = document.getElementById('blurMessages');
  
  blurAvatarsToggle.checked = globalEnabled && (siteSettings.blurAvatars || false);
  blurConversationListToggle.checked = globalEnabled && (siteSettings.blurConversationList || false);
  blurMessagesToggle.checked = globalEnabled && (siteSettings.blurMessages || false);
  
  // Disable blur group toggles when global toggle is off
  blurAvatarsToggle.disabled = !globalEnabled;
  blurConversationListToggle.disabled = !globalEnabled;
  blurMessagesToggle.disabled = !globalEnabled;
  
  // Update blur intensity
  document.getElementById('blurIntensity').value = siteSettings.blurIntensity || 8;
  document.getElementById('blurIntensityValue').textContent = `${siteSettings.blurIntensity || 8}px`;
}
