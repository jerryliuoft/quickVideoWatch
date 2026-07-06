// src/background/index.ts
// Basic background service worker

function updateBadge(enabled: boolean) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#06b6d4' : '#64748b' });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('SilenceSlicer installed.');

  // Set default settings
  chrome.storage.local.get(['enabled', 'threshold', 'padding'], (result) => {
    let enabled = true;
    if (result.enabled !== undefined) {
      enabled = result.enabled as boolean;
    } else {
      chrome.storage.local.set({
        enabled: true,
        threshold: -40,
        padding: 0.5,
      });
    }
    updateBadge(enabled);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    const newEnabled = result.enabled === undefined ? true : !(result.enabled as boolean);
    chrome.storage.local.set({ enabled: newEnabled });
    updateBadge(newEnabled);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) {
    updateBadge(changes.enabled.newValue as boolean);
  }
});
