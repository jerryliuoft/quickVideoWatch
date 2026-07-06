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

let lastBucketTime = -1;
let currentBucket: PeakData | null = null;

export const addPeak = (db: number, isSilence: boolean, time: number) => {
  const bucketTime = Math.floor(time * 4) / 4; // 250ms buckets

  if (bucketTime !== lastBucketTime) {
    if (currentBucket) {
      const b = currentBucket;
      setPeaks((prev) => [...prev, b]);
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
