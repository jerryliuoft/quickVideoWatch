import { createSignal } from 'solid-js';

export interface PeakData {
  db: number;
  isSilence: boolean;
  time: number; // Represents mediaElement.currentTime
}

export const [peaks, setPeaks] = createSignal<PeakData[]>([]);
export const [videoDuration, setVideoDuration] = createSignal<number>(1);
export const [videoCurrentTime, setVideoCurrentTime] = createSignal<number>(0);

export const addPeak = (db: number, isSilence: boolean, time: number) => {
  setPeaks(prev => [...prev, { db, isSilence, time }]);
};

export const updateVideoState = (currentTime: number, duration: number) => {
  setVideoCurrentTime(currentTime);
  if (duration && !isNaN(duration) && duration > 0) {
    setVideoDuration(duration);
  }
};

export const clearPeaks = () => {
  setPeaks([]);
};
