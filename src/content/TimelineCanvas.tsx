import { createEffect, onMount, onCleanup, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { peaks, videoCurrentTime, videoDuration } from "./timelineState";

export const TimelineCanvas: Component = () => {
  let canvasRef!: HTMLCanvasElement;
  let containerRef!: HTMLDivElement;
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

  createEffect(() => {
    const { width, height } = canvasSize();
    if (!width || !height || !canvasRef) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvasRef.width = width * dpr;
    canvasRef.height = height * dpr;
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    
    ctx.clearRect(0, 0, width, height);
    
    const currentPeaks = peaks();
    const duration = videoDuration();
    if (currentPeaks.length === 0 || duration <= 0) return;

    // Drawing parameters matching SilenceRemover style
    const PROGRESS_COLOR = "#3b82f6"; // blue-500
    const SILENCE_COLOR = "#fca5a5"; // red-300 for skipped regions
    
    const minDb = -80;
    const maxDb = 0;
    
    // Calculate theoretical width for a 50ms chunk
    const barWidth = Math.max(1, (0.05 / duration) * width);
    
    for (let i = 0; i < currentPeaks.length; i++) {
      const peak = currentPeaks[i];
      const x = (peak.time / duration) * width;
      
      let norm = (peak.db - minDb) / (maxDb - minDb);
      norm = Math.max(0, Math.min(1, norm));
      
      const barHeight = Math.max(2, norm * height * 0.8);
      const y = (height - barHeight) / 2;
      
      // Color based on state
      ctx.fillStyle = peak.isSilence ? SILENCE_COLOR : PROGRESS_COLOR;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  });

  return (
    <div ref={containerRef!} class="relative h-full w-full bg-white">
      <canvas ref={canvasRef!} class="absolute top-0 left-0 h-full w-full block" style="width: 100%; height: 100%;" />
      <div 
        class="absolute top-0 h-full w-0.5 bg-amber-600 z-10" 
        style={{ left: `${(videoCurrentTime() / videoDuration()) * 100}%` }}
      />
    </div>
  );
};
