import { createSignal, onMount } from 'solid-js';

function App() {
  const [enabled, setEnabled] = createSignal(true);
  const [threshold, setThreshold] = createSignal(-40);
  const [padding, setPadding] = createSignal(0.5);

  onMount(() => {
    chrome.storage.local.get(['enabled', 'threshold', 'padding'], (result) => {
      if (result.enabled !== undefined) setEnabled(result.enabled as boolean);
      if (result.threshold !== undefined) setThreshold(result.threshold as number);
      if (result.padding !== undefined) setPadding(result.padding as number);
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
    <div class="bg-slate-900 text-white p-6 font-sans overflow-hidden" style="width: 320px; height: 400px;">
      <div class="mb-8">
        <h1 class="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          SilenceSlicer
        </h1>
        <p class="text-slate-400 text-sm mt-1">Skip the quiet parts automatically.</p>
      </div>

      <div class="space-y-6 bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10">
        <div class="flex items-center justify-between">
          <label class="font-medium">Master Switch</label>
          <button 
            onClick={toggleEnabled}
            class={`w-12 h-6 rounded-full transition-colors relative ${enabled() ? 'bg-cyan-500' : 'bg-slate-600'}`}
          >
            <div class={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled() ? 'translate-x-6' : 'translate-x-0'}`}></div>
          </button>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <label class="font-medium text-slate-300">Silence Threshold</label>
            <span class="text-cyan-400">{threshold()} dB</span>
          </div>
          <input 
            type="range" 
            min="-80" max="-10" step="1" 
            value={threshold()} 
            onInput={updateThreshold}
            class="w-full accent-cyan-500"
          />
          <p class="text-xs text-slate-500">How quiet counts as silence?</p>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <label class="font-medium text-slate-300">Padding</label>
            <span class="text-purple-400">{padding()} s</span>
          </div>
          <input 
            type="range" 
            min="0" max="2" step="0.1" 
            value={padding()} 
            onInput={updatePadding}
            class="w-full accent-purple-500"
          />
          <p class="text-xs text-slate-500">Wait before skipping.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
