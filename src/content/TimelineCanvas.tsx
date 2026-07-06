import { createEffect, onMount, onCleanup, createSignal } from 'solid-js';
import type { Component } from 'solid-js';
import {
  peaks,
  videoCurrentTime,
  videoDuration,
  pixelsPerSecond,
  viewStartTime,
  setVideoCurrentTime,
} from './timelineState';

// Colors from SilenceRemover
const WAVE_COLOR = '#c084fc';
const PROGRESS_COLOR = '#6b21a8';
const REGION_COLOR = 'rgba(239, 68, 68, 0.2)'; // Soft red for skipped/silence regions
const REGION_BORDER = 'rgba(239, 68, 68, 0.5)';

const BAR_WIDTH = 2;
const BAR_GAP = 1;

export const TimelineCanvas: Component = () => {
  let waveCanvasRef!: HTMLCanvasElement;
  let progressCanvasRef!: HTMLCanvasElement;
  let containerRef!: HTMLDivElement;
  let progressWrapperRef!: HTMLDivElement;

  const [canvasSize, setCanvasSize] = createSignal({ width: 0, height: 0 });

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  const setupCanvas = (canvas: HTMLCanvasElement, w: number, h: number) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    return ctx;
  };

  const drawWaveform = (
    ctx: CanvasRenderingContext2D,
    currentPeaks: ReturnType<typeof peaks>,
    height: number,
    pps: number,
    startTime: number,
    width: number,
    color: string,
  ) => {
    if (currentPeaks.length === 0) return;

    ctx.fillStyle = color;
    const barStep = BAR_WIDTH + BAR_GAP;
    const scrollOffsetPx = startTime * pps;

    const startBarIndex = Math.floor(scrollOffsetPx / barStep);
    const visibleBarsCount = Math.ceil(width / barStep) + 2;

    const mainHeight = height; // Full height, no ruler

    // Normalize against max peak (we assume maxDb is 0, minDb is -80)
    const minDb = -80;
    const maxDb = 0;

    let searchStartIndex = 0;

    for (let i = 0; i < visibleBarsCount; i++) {
      const barIndex = startBarIndex + i;
      const globalX = barIndex * barStep;
      const x = globalX - scrollOffsetPx;

      if (x < -barStep || x > width) continue;

      const timeStart = globalX / pps;
      const timeEnd = (globalX + barStep) / pps;

      // Find peaks in this time range
      let maxDbInBar = -Infinity;
      let hasData = false;

      for (let p = searchStartIndex; p < currentPeaks.length; p++) {
        const peak = currentPeaks[p];

        // If we haven't reached the start of the bar's time yet, keep advancing searchStartIndex
        if (peak.time < timeStart) {
          searchStartIndex = p;
          continue;
        }

        if (peak.time >= timeStart && peak.time < timeEnd) {
          if (peak.db > maxDbInBar) maxDbInBar = peak.db;
          hasData = true;
        } else if (peak.time >= timeEnd) {
          break; // Optimization: peaks are ordered
        }
      }

      if (hasData) {
        let norm = (maxDbInBar - minDb) / (maxDb - minDb);
        norm = Math.max(0, Math.min(1, norm));

        // Don't draw bars too small
        const h = Math.max(1, Math.round(norm * mainHeight * 0.9));
        const y = (mainHeight - h) / 2;
        ctx.fillRect(x, y, BAR_WIDTH, h);
      }
    }
  };

  const drawRegions = (
    ctx: CanvasRenderingContext2D,
    currentPeaks: ReturnType<typeof peaks>,
    height: number,
    pps: number,
    startTime: number,
    width: number,
  ) => {
    const viewEndTime = startTime + width / pps;

    // We will group contiguous silence buckets into regions for drawing
    let regionStart = -1;

    ctx.fillStyle = REGION_COLOR;

    const drawRegion = (startSec: number, endSec: number) => {
      if (endSec < startTime || startSec > viewEndTime) return;

      const startPx = (startSec - startTime) * pps;
      const endPx = (endSec - startTime) * pps;
      const w = Math.max(1, endPx - startPx);

      ctx.fillRect(startPx, 0, w, height);

      // Border
      ctx.fillStyle = REGION_BORDER;
      ctx.fillRect(startPx, 0, 1, height);
      ctx.fillRect(startPx + w - 1, 0, 1, height);
      ctx.fillStyle = REGION_COLOR;
    };

    // Assuming buckets are 250ms (0.25s) from timelineState.ts
    const BUCKET_DURATION = 0.25;

    for (let i = 0; i < currentPeaks.length; i++) {
      const peak = currentPeaks[i];
      if (peak.isSilence) {
        if (regionStart === -1) regionStart = peak.time;
      } else {
        if (regionStart !== -1) {
          drawRegion(regionStart, peak.time);
          regionStart = -1;
        }
      }
    }

    // Draw final region if it goes to the end
    if (regionStart !== -1 && currentPeaks.length > 0) {
      drawRegion(regionStart, currentPeaks[currentPeaks.length - 1].time + BUCKET_DURATION);
    }
  };

  // Draw Effect
  createEffect(() => {
    const { width, height } = canvasSize();
    if (!width || !height || !waveCanvasRef || !progressCanvasRef) return;

    setupCanvas(waveCanvasRef, width, height);
    setupCanvas(progressCanvasRef, width, height);

    const waveCtx = waveCanvasRef.getContext('2d');
    const progressCtx = progressCanvasRef.getContext('2d');

    if (!waveCtx || !progressCtx) return;

    waveCtx.clearRect(0, 0, width, height);
    progressCtx.clearRect(0, 0, width, height);

    const currentPeaks = peaks();
    const pps = pixelsPerSecond();
    const startT = viewStartTime();

    // Draw regions on wave canvas
    drawRegions(waveCtx, currentPeaks, height, pps, startT, width);

    // Draw waveforms
    drawWaveform(waveCtx, currentPeaks, height, pps, startT, width, WAVE_COLOR);
    drawWaveform(progressCtx, currentPeaks, height, pps, startT, width, PROGRESS_COLOR);
  });

  // Playhead Sync Effect for progress canvas cropping
  createEffect(() => {
    if (progressWrapperRef) {
      const playheadPx = (videoCurrentTime() - viewStartTime()) * pixelsPerSecond();
      progressWrapperRef.style.width = `${Math.max(0, playheadPx)}px`;
    }
  });

  const handleSeek = (e: MouseEvent) => {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const timeAtCursor = viewStartTime() + mouseX / pixelsPerSecond();

    // clamp to 0 and duration
    const targetTime = Math.max(0, Math.min(videoDuration(), timeAtCursor));
    setVideoCurrentTime(targetTime);

    // Dispatch custom event to tell content script to seek the video player
    window.dispatchEvent(new CustomEvent('silenceSlicerSeek', { detail: { time: targetTime } }));
  };

  return (
    <div
      ref={containerRef!}
      class="relative h-full w-full bg-white select-none cursor-pointer"
      onMouseDown={handleSeek}
    >
      <canvas ref={waveCanvasRef!} class="absolute top-0 left-0 h-full w-full block" />
      <div
        ref={progressWrapperRef!}
        class="pointer-events-none absolute top-0 left-0 z-10 h-full overflow-hidden"
      >
        <canvas ref={progressCanvasRef!} class="absolute top-0 left-0 h-full block" />
      </div>
      <div
        class="pointer-events-none absolute top-0 z-30 h-full w-[2px] bg-amber-500"
        style={{
          left: `${Math.max(0, (videoCurrentTime() - viewStartTime()) * pixelsPerSecond())}px`,
        }}
      >
        <div
          class="absolute top-0 h-0 w-0 border-t-[8px] border-r-[6px] border-l-[6px] border-t-amber-600 border-r-transparent border-l-transparent"
          style={{ transform: 'translateX(-50%)' }}
        ></div>
      </div>
    </div>
  );
};
