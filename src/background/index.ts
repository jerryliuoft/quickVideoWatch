// src/background/index.ts
// Basic background service worker

function updateBadge(enabled: boolean) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#06b6d4' : '#64748b' });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('SilenceSlicer installed.');

  // Set default settings
  chrome.storage.local.get(
    ['enabled', 'minVolumePercent', 'minSilenceLength', 'prePadding', 'postPadding'],
    (result) => {
      let enabled = true;
      if (result.enabled !== undefined) {
        enabled = result.enabled as boolean;
      } else {
        chrome.storage.local.set({
          enabled: true,
          minVolumePercent: 10,
          minSilenceLength: 0.5,
          prePadding: 0.2,
          postPadding: 0.2,
        });
      }
      updateBadge(enabled);
    },
  );
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get(['enabled'], (result) => {
    const newEnabled = result.enabled === undefined ? false : !(result.enabled as boolean);
    chrome.storage.local.set({ enabled: newEnabled });
    // Note: We don't need to call updateBadge here because chrome.storage.onChanged handles it
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) {
    updateBadge(changes.enabled.newValue as boolean);
  }
});

// Set initial badge state when the service worker wakes up
chrome.storage.local.get(['enabled'], (result) => {
  if (result.enabled !== undefined) {
    updateBadge(result.enabled as boolean);
  }
});
