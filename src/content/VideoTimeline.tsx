import { createSignal, createEffect, onMount, onCleanup, type Component } from 'solid-js';
import { TimelineCanvas } from './TimelineCanvas';
import {
  pixelsPerSecond,
  setPixelsPerSecond,
  viewStartTime,
  setViewStartTime,
  videoDuration,
  videoCurrentTime,
} from './timelineState';

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

const ZOOM_DELTA_THRESHOLD = 5;
const ZOOM_STEP_FACTOR = 1.2;
const MAX_ZOOM = 200;

export const VideoTimeline: Component = () => {
  const [enabled, setEnabled] = createSignal(true);
  const [threshold, setThreshold] = createSignal(-40);
  const [padding, setPadding] = createSignal(0.5);

  const [containerWidth, setContainerWidth] = createSignal(0);
  const [accumulatedDelta, setAccumulatedDelta] = createSignal(0);

  // Scrollbar states
  const [isDraggingScrollbar, setIsDraggingScrollbar] = createSignal(false);
  const [dragStartX, setDragStartX] = createSignal(0);
  const [dragStartViewTime, setDragStartViewTime] = createSignal(0);

  let scrollContainerRef!: HTMLDivElement;
  let scrollbarTrackRef!: HTMLDivElement;

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

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    if (scrollContainerRef) observer.observe(scrollContainerRef);

    onCleanup(() => {
      chrome.storage.onChanged.removeListener(listener);
      observer.disconnect();
    });
  });

  // Auto-scroll logic
  createEffect(() => {
    const time = videoCurrentTime();
    const pps = pixelsPerSecond();
    const width = containerWidth();
    if (!width || !pps || isDraggingScrollbar()) return;

    const start = viewStartTime();
    const end = start + width / pps;

    // Auto-scroll to keep playhead in view
    if (time > end || time < start) {
      setViewStartTime(Math.max(0, time - (width / pps) * 0.1)); // put playhead at 10%
    }
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

  const getMinPps = () => {
    const width = containerWidth();
    const duration = videoDuration();
    if (!width || !duration || duration <= 0) return 10;
    return width / duration;
  };

  const getZoomValue = () => {
    const pps = pixelsPerSecond();
    const minPps = getMinPps();
    if (pps < minPps) return 0;
    if (pps >= MAX_ZOOM) return 100;
    const minLog = Math.log(minPps);
    const maxLog = Math.log(MAX_ZOOM);
    const currentLog = Math.log(pps);
    return ((currentLog - minLog) / (maxLog - minLog)) * 100;
  };

  const handleZoomChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const value = parseFloat(input.value);
    const minPps = getMinPps();
    const minLog = Math.log(minPps);
    const maxLog = Math.log(MAX_ZOOM);
    const newPps = Math.exp(minLog + (value / 100) * (maxLog - minLog));

    const width = containerWidth();
    // Center around playhead when using zoom slider
    let playheadX = (videoCurrentTime() - viewStartTime()) * pixelsPerSecond();
    if (playheadX < 0 || playheadX > width) {
      playheadX = width / 2;
    }

    setPixelsPerSecond(newPps);
    const newStart = videoCurrentTime() - playheadX / newPps;
    const visibleDur = width / newPps;
    setViewStartTime(Math.max(0, Math.min(Math.max(0, videoDuration() - visibleDur), newStart)));
  };

  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    } else {
      // allow normal scrolling for page maybe? No, let's capture it.
      event.preventDefault();
    }

    const width = containerWidth();
    const duration = videoDuration();
    if (duration === 0 || width === 0) return;

    const oldPps = pixelsPerSecond();
    const oldStart = viewStartTime();

    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const delta = event.deltaX || event.deltaY;
      const secDelta = delta / oldPps;
      const visibleDur = width / oldPps;
      const maxStart = Math.max(0, duration - visibleDur);
      setViewStartTime(Math.max(0, Math.min(maxStart, oldStart + secDelta)));
      return;
    }

    setAccumulatedDelta((prev) => prev + event.deltaY);
    if (Math.abs(accumulatedDelta()) < ZOOM_DELTA_THRESHOLD) return;

    const direction = accumulatedDelta() < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
    const minPps = width / duration;
    const newPps = Math.max(minPps, Math.min(MAX_ZOOM, oldPps * direction));
    setAccumulatedDelta(0);

    if (newPps === oldPps) return;

    // Zoom to playhead
    const timeToZoom = videoCurrentTime();
    let playheadX = (timeToZoom - oldStart) * oldPps;
    if (playheadX < 0 || playheadX > width) {
      playheadX = width / 2; // if offscreen, just zoom into center
    }

    setPixelsPerSecond(newPps);
    const newStart = timeToZoom - playheadX / newPps;
    const visibleDur = width / newPps;
    setViewStartTime(Math.max(0, Math.min(Math.max(0, duration - visibleDur), newStart)));
  };

  // Scrollbar Logic
  const canScroll = () => {
    const width = containerWidth();
    const duration = videoDuration();
    const pps = pixelsPerSecond();
    if (!duration || !pps || !width) return false;
    const visibleDuration = width / pps;
    return visibleDuration < duration - 0.1;
  };

  const getScrollHandleStyle = () => {
    const duration = videoDuration();
    const start = viewStartTime();
    const pps = pixelsPerSecond();
    const width = containerWidth();
    if (!duration || !pps || !width) return { width: '100%', left: '0%' };
    const visibleDur = width / pps;
    if (visibleDur >= duration) return { width: '100%', left: '0%' };
    return {
      width: `${Math.max((visibleDur / duration) * 100, 0)}%`,
      left: `${Math.max((start / duration) * 100, 0)}%`,
      'min-width': '20px',
    };
  };

  const handleScrollbarDrag = (e: MouseEvent) => {
    if (isDraggingScrollbar() && scrollbarTrackRef) {
      const width = containerWidth();
      const trackWidth = scrollbarTrackRef.clientWidth;
      const deltaPercent = (e.clientX - dragStartX()) / trackWidth;
      const deltaTime = deltaPercent * videoDuration();
      const visibleDur = width / pixelsPerSecond();

      setViewStartTime(
        Math.max(
          0,
          Math.min(Math.max(0, videoDuration() - visibleDur), dragStartViewTime() + deltaTime),
        ),
      );
    }
  };

  const startScrollbarDrag = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingScrollbar(true);
    setDragStartX(e.clientX);
    setDragStartViewTime(viewStartTime());
    window.addEventListener('mousemove', handleScrollbarDrag);
    window.addEventListener(
      'mouseup',
      () => {
        setIsDraggingScrollbar(false);
        window.removeEventListener('mousemove', handleScrollbarDrag);
      },
      { once: true },
    );
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

        {/* Zoom Control */}
        <div class="flex items-center gap-2 ml-auto">
          <span class="text-gray-400 font-medium text-xs">Zoom</span>
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={getZoomValue()}
            onInput={handleZoomChange}
            class="w-24 h-1 appearance-none rounded-lg bg-gray-300 accent-blue-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Timeline Content */}
      <div class="flex w-full flex-col">
        <div class="flex w-full flex-row" style="height: 60px;">
          {/* LEFT SIDEBAR (Layer Indicators) */}
          <div class="flex w-8 flex-none flex-col items-center border-r border-gray-200 bg-gray-50 pt-[1px]">
            <div
              class="flex w-full items-center justify-center text-gray-400 h-full"
              title="Live Audio Feed"
            >
              <ActivityIcon />
            </div>
          </div>

          {/* MAIN CONTENT */}
          <div
            ref={scrollContainerRef!}
            class="flex flex-auto flex-col overflow-hidden relative"
            onWheel={handleWheel}
          >
            <TimelineCanvas />
          </div>
        </div>

        {/* SCROLLBAR */}
        <div class="flex px-2 py-1 items-center gap-2 bg-slate-50 border-t border-gray-200">
          <div class="w-8 flex-none"></div>
          <div
            ref={scrollbarTrackRef!}
            class={`relative h-3 flex-1 overflow-hidden rounded-lg bg-gray-200 transition-opacity duration-200 ${
              canScroll() ? 'cursor-pointer opacity-100' : 'pointer-events-none opacity-50'
            }`}
            onMouseDown={(e) => {
              if (!canScroll() || !scrollbarTrackRef || !pixelsPerSecond()) return;

              const rect = scrollbarTrackRef.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const width = containerWidth();
              const visibleDur = width / pixelsPerSecond();
              const newStart = ratio * videoDuration() - visibleDur / 2;
              setViewStartTime(
                Math.max(0, Math.min(Math.max(0, videoDuration() - visibleDur), newStart)),
              );
            }}
          >
            <div
              class={`absolute h-full rounded-lg ${
                isDraggingScrollbar() ? 'bg-gray-500' : 'bg-gray-400 hover:bg-blue-400'
              }`}
              style={getScrollHandleStyle()}
              onMouseDown={startScrollbarDrag}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
