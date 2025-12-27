// Popup script
let currentTab = null;
let currentState = null;

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
    await chrome.runtime.sendMessage({
      type: 'TOGGLE_GLOBAL',
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
  document.getElementById('globalToggle').checked = currentState.globalEnabled;

  // Update settings
  const hostname = currentTab ? new URL(currentTab.url).hostname : '';
  const siteSettings = currentState.siteSettings[hostname] || {};
  
  document.getElementById('blurIntensity').value = siteSettings.blurIntensity || 8;
  document.getElementById('blurIntensityValue').textContent = `${siteSettings.blurIntensity || 8}px`;
}
