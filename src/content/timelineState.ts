import { createSignal } from 'solid-js';

export interface PeakData {
  db: number;
  isSilence: boolean;
  time: number; // Represents mediaElement.currentTime
}

export const [peaks, setPeaks] = createSignal<PeakData[]>([]);
export const [videoDuration, setVideoDuration] = createSignal<number>(1);
export const [videoCurrentTime, setVideoCurrentTime] = createSignal<number>(0);

export const [pixelsPerSecond, setPixelsPerSecond] = createSignal<number>(50); // Reasonable default zoom
export const [viewStartTime, setViewStartTime] = createSignal<number>(0);
export const [isDarkMode, setIsDarkMode] = createSignal<boolean>(false);

const MAX_PEAKS_BUFFER = 90 * 60 * 4; // 90 minutes * 60s * 4 buckets/s = 21,600 items

let lastBucketTime = -1;
let currentBucket: PeakData | null = null;

export const addPeak = (db: number, isSilence: boolean, time: number) => {
  const bucketTime = Math.floor(time * 4) / 4; // 250ms buckets

  if (bucketTime !== lastBucketTime) {
    if (currentBucket) {
      const b = currentBucket;
      setPeaks((prev) => {
        let low = 0;
        let high = prev.length - 1;
        let replaceIdx = -1;

        while (low <= high) {
          const mid = (low + high) >> 1;
          if (prev[mid].time === b.time) {
            replaceIdx = mid;
            break;
          } else if (prev[mid].time < b.time) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }

        const next = [...prev];
        if (replaceIdx !== -1) {
          next[replaceIdx] = b;
        } else {
          next.splice(low, 0, b);
        }

        if (next.length > MAX_PEAKS_BUFFER) {
          return next.slice(next.length - MAX_PEAKS_BUFFER);
        }
        return next;
      });
    }
    currentBucket = { db, isSilence, time: bucketTime };
    lastBucketTime = bucketTime;
  } else if (currentBucket) {
    currentBucket.db = Math.max(currentBucket.db, db);
    // If any part of the bucket was NOT silence, it's safer to mark as not silence,
    // or just track the latest. We'll track the most recent.
    currentBucket.isSilence = isSilence;
  }
};

export const updateVideoState = (currentTime: number, duration: number) => {
  setVideoCurrentTime(currentTime);
  if (duration && !isNaN(duration) && duration > 0) {
    setVideoDuration(duration);
  }
};

export const clearPeaks = () => {
  setPeaks([]);
  lastBucketTime = -1;
  currentBucket = null;
};
