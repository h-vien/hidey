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

  // Update rules list
  updateRulesList();

  // Update regions list
  updateRegionsList();
}

function updateRulesList() {
  const rulesList = document.getElementById('rulesList');
  const rulesCount = document.getElementById('rulesCount');
  const currentUrl = currentTab?.url || '';
  
  if (!currentState || !currentState.rules) {
    rulesCount.textContent = '0';
    rulesList.innerHTML = '<div class="empty-state">No rules for this site</div>';
    return;
  }
  
  // Filter rules for current URL
  const matchingRules = currentState.rules.filter(rule => {
    if (!rule || !rule.urlPattern) {
      return false;
    }
    
    // Check if rule is enabled (default to true if not specified)
    if (rule.enabled === false) {
      return false;
    }
    
    try {
      const regexPattern = rule.urlPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '\\?');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(currentUrl);
    } catch (error) {
      console.warn('Hidey: Invalid URL pattern', rule.urlPattern, error);
      return false;
    }
  });

  rulesCount.textContent = matchingRules.length;

  if (matchingRules.length === 0) {
    rulesList.innerHTML = '<div class="empty-state">No rules for this site</div>';
    return;
  }

  // Display all matching rules - ensure each rule is displayed separately
  rulesList.innerHTML = matchingRules.map((rule, index) => {
    if (!rule.selectors || rule.selectors.length === 0) {
      return ''; // Skip rules with no selectors
    }
    
    const ruleId = `${rule.urlPattern}|${rule.selectors.join(',')}`;
    return `
      <div class="rule-item" data-rule-index="${index}">
        <div class="rule-content">
          <div class="rule-info">
            <div class="rule-url">${escapeHtml(rule.urlPattern)}</div>
            <div class="rule-selectors">
              ${rule.selectors.map(sel => `<span class="selector-tag">${escapeHtml(sel)}</span>`).join('')}
            </div>
          </div>
          <button class="delete-btn" data-rule-id="${escapeHtml(ruleId)}" title="Delete rule">×</button>
        </div>
      </div>
    `;
  }).filter(html => html.length > 0).join('');

  // Add delete button listeners
  rulesList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const ruleId = e.target.getAttribute('data-rule-id');
      if (ruleId) {
        await chrome.runtime.sendMessage({
          type: 'DELETE_RULE',
          ruleId,
        });
        await loadState();
      }
    });
  });
}

function updateRegionsList() {
  const regionsList = document.getElementById('regionsList');
  const regionsCount = document.getElementById('regionsCount');
  const currentUrl = currentTab?.url || '';
  
  // Filter regions for current URL
  const matchingRegions = currentState.regions.filter((region, index) => {
    try {
      const regexPattern = region.urlPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(currentUrl);
    } catch {
      return false;
    }
  });

  regionsCount.textContent = matchingRegions.length;

  if (matchingRegions.length === 0) {
    regionsList.innerHTML = '<div class="empty-state">No blur regions for this site</div>';
    return;
  }

  regionsList.innerHTML = matchingRegions.map((region, index) => {
    const regionIndex = currentState.regions.indexOf(region);
    return `
      <div class="region-item">
        <div class="region-content">
          <div class="region-info">
            <div class="region-url">${escapeHtml(region.urlPattern)}</div>
            <div class="region-info-text">
              ${region.width}×${region.height}px at (${region.x}, ${region.y})
            </div>
          </div>
          <button class="delete-btn" data-region-id="${regionIndex}" title="Delete region">×</button>
        </div>
      </div>
    `;
  }).join('');

  // Add delete button listeners
  regionsList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const regionId = e.target.getAttribute('data-region-id');
      await chrome.runtime.sendMessage({
        type: 'DELETE_REGION',
        regionId,
      });
      await loadState();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
