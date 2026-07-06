import '../index.css';
import { render } from 'solid-js/web';
import { VideoTimeline } from './VideoTimeline';
import { addPeak, updateVideoState, clearPeaks } from './timelineState';

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let mediaElement: HTMLVideoElement | null = null;
let silenceTimer: number | null = null;
let timelineMounted = false;
let lastVideoSrc = '';

let isSilence = false;
let config = {
  enabled: true,
  threshold: -40, // dB
  padding: 0.5, // seconds
};

function mountTimeline() {
  const existingContainer = document.getElementById('silenceslicer-timeline-container');

  if (!config.enabled) {
    if (existingContainer) {
      existingContainer.remove();
      timelineMounted = false;
    }
    return;
  }

  if (timelineMounted && existingContainer && document.body.contains(existingContainer)) return;

  const primaryInner =
    document.querySelector('#primary-inner') || document.querySelector('#below')?.parentElement;
  const below = document.querySelector('#below');

  if (primaryInner && below) {
    if (existingContainer) {
      existingContainer.remove();
    }

    const container = document.createElement('div');
    container.id = 'silenceslicer-timeline-container';
    container.style.width = '100%';
    container.style.marginTop = '12px';
    container.style.marginBottom = '12px';
    container.style.flexShrink = '0';
    container.style.zIndex = '10';
    container.style.position = 'relative';

    primaryInner.insertBefore(container, below);
    render(() => <VideoTimeline />, container);
    timelineMounted = true;
  }
}

function initAudio() {
  mediaElement = document.querySelector('video');
  if (!mediaElement) return;

  if (!audioCtx) {
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;

    source = audioCtx.createMediaElementSource(mediaElement);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  if (audioCtx.state === 'suspended') {
    const resumeAudio = () => {
      audioCtx?.resume();
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('keydown', resumeAudio);
  }
}

function getVolume() {
  if (!analyser) return -100;
  const dataArray = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(dataArray);

  let sumSquares = 0.0;
  for (let i = 0; i < dataArray.length; i++) {
    sumSquares += dataArray[i] * dataArray[i];
  }

  const rms = Math.sqrt(sumSquares / dataArray.length);
  return 20 * Math.log10(rms || 0.0001);
}

function monitorAudio() {
  mountTimeline(); // constantly attempt to mount if not mounted yet, or unmount if disabled

  if (!mediaElement) return;

  // Handle video source changes
  if (mediaElement.src !== lastVideoSrc) {
    clearPeaks();
    lastVideoSrc = mediaElement.src;
  }

  if (!config.enabled) return;
  if (mediaElement.paused || mediaElement.ended) return;

  const currentVolume = getVolume();

  if (currentVolume < config.threshold) {
    if (!isSilence) {
      silenceTimer = window.setTimeout(() => {
        if (mediaElement && config.enabled) {
          mediaElement.playbackRate = 16;
        }
      }, config.padding * 1000);
      isSilence = true;
    }
  } else {
    if (isSilence) {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (mediaElement) mediaElement.playbackRate = 1;
      isSilence = false;
    }
  }

  updateVideoState(mediaElement.currentTime, mediaElement.duration);
  // push to timeline state
  addPeak(currentVolume, isSilence, mediaElement.currentTime);
}

function main() {
  const seekListener = ((e: CustomEvent) => {
    if (mediaElement && !isNaN(e.detail.time)) {
      mediaElement.currentTime = e.detail.time;
    }
  }) as EventListener;
  window.addEventListener('silenceSlicerSeek', seekListener);

  chrome.storage.local.get(['enabled', 'threshold', 'padding'], (result) => {
    if (result.enabled !== undefined) config.enabled = result.enabled as boolean;
    if (result.threshold !== undefined) config.threshold = result.threshold as number;
    if (result.padding !== undefined) config.padding = result.padding as number;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.enabled) {
        config.enabled = changes.enabled.newValue as boolean;
        if (!config.enabled && mediaElement) {
          mediaElement.playbackRate = 1;
        }
        mountTimeline(); // Immediately hide/show when config changes
      }
      if (changes.threshold) config.threshold = changes.threshold.newValue as number;
      if (changes.padding) config.padding = changes.padding.newValue as number;
    }
  });

  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (video && video !== mediaElement) {
      initAudio();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  initAudio();
  setInterval(monitorAudio, 50);
}

main();
