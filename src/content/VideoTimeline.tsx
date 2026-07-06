import { createSignal, onMount, onCleanup, type Component } from 'solid-js';
import { TimelineCanvas } from './TimelineCanvas';

const ActivityIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

export const VideoTimeline: Component = () => {
  const [enabled, setEnabled] = createSignal(true);
  const [threshold, setThreshold] = createSignal(-40);
  const [padding, setPadding] = createSignal(0.5);

  onMount(() => {
    chrome.storage.local.get(['enabled', 'threshold', 'padding'], (result) => {
      if (result.enabled !== undefined) setEnabled(result.enabled as boolean);
      if (result.threshold !== undefined) setThreshold(result.threshold as number);
      if (result.padding !== undefined) setPadding(result.padding as number);
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local') {
        if (changes.enabled) setEnabled(changes.enabled.newValue as boolean);
        if (changes.threshold) setThreshold(changes.threshold.newValue as number);
        if (changes.padding) setPadding(changes.padding.newValue as number);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    onCleanup(() => {
      chrome.storage.onChanged.removeListener(listener);
    });
  });

  const toggleEnabled = () => {
    const newVal = !enabled();
    setEnabled(newVal);
    chrome.storage.local.set({ enabled: newVal });
  };

  const updateThreshold = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setThreshold(val);
    chrome.storage.local.set({ threshold: val });
  };

  const updatePadding = (e: Event) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    setPadding(val);
    chrome.storage.local.set({ padding: val });
  };

  return (
    <div class="flex flex-shrink-0 w-full flex-col my-4 border border-gray-300 bg-white shadow-sm rounded-lg overflow-hidden">
      {/* Controls Header */}
      <div class="flex flex-shrink-0 flex-wrap items-center px-4 py-2 bg-slate-50 border-b border-gray-200 text-sm gap-4 sm:gap-8">
        <div class="flex items-center font-bold text-slate-800">SilenceSlicer</div>
        <div class="flex items-center gap-2">
          <button
            onClick={toggleEnabled}
            class={`w-10 h-5 rounded-full transition-colors relative ${enabled() ? 'bg-cyan-500' : 'bg-slate-400'}`}
            title="Toggle SilenceSlicer"
          >
            <div
              class={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${enabled() ? 'translate-x-5' : 'translate-x-0'}`}
            ></div>
          </button>
          <span class="font-medium text-slate-600">{enabled() ? 'ON' : 'OFF'}</span>
        </div>
        <div class="flex items-center gap-3">
          <label class="font-medium text-slate-600 whitespace-nowrap">
            Threshold{' '}
            <span class="text-cyan-600 w-12 inline-block text-right">{threshold()} dB</span>
          </label>
          <input
            type="range"
            min="-80"
            max="-10"
            step="1"
            value={threshold()}
            onInput={updateThreshold}
            class="w-32 accent-cyan-500 cursor-pointer"
          />
        </div>
        <div class="flex items-center gap-3">
          <label class="font-medium text-slate-600 whitespace-nowrap">
            Padding <span class="text-purple-600 w-8 inline-block text-right">{padding()} s</span>
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={padding()}
            onInput={updatePadding}
            class="w-32 accent-purple-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Timeline Content */}
      <div class="flex w-full flex-row" style="height: 120px;">
        {/* LEFT SIDEBAR (Layer Indicators) */}
        <div class="flex w-8 flex-none flex-col items-center border-r border-gray-200 bg-gray-50 pt-[1px]">
          <div
            class="flex w-full cursor-pointer items-center justify-center text-gray-400 transition-colors hover:text-red-500 h-full"
            title="Live Audio Feed"
          >
            <ActivityIcon />
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div class="flex flex-auto flex-col overflow-hidden relative">
          <TimelineCanvas />
        </div>
      </div>
    </div>
  );
};
