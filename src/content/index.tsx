import '../index.css';
import { render } from 'solid-js/web';
import { VideoTimeline } from './VideoTimeline';
import { addPeak, updateVideoState, clearPeaks, setIsDarkMode } from './timelineState';

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
let mediaElement: HTMLVideoElement | null = null;
let silenceTimer: number | null = null;
let timelineMounted = false;
let lastVideoSrc = '';

let isSilence = false;
let config = {
  threshold: -40, // dB
  padding: 0.5, // seconds
  userTheme: 'auto', // 'auto', 'light', 'dark'
};

function mountTimeline() {
  const existingContainer = document.getElementById('silenceslicer-timeline-container');

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

    // Initial theme check
    const isDark =
      document.documentElement.hasAttribute('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) container.classList.add('dark');

    render(() => <VideoTimeline />, container);
    timelineMounted = true;
  }
}

function initAudio() {
  const newMediaElement = document.querySelector('video');
  if (!newMediaElement) return;

  if (newMediaElement !== mediaElement) {
    if (source) {
      source.disconnect();
      source = null;
    }
    mediaElement = newMediaElement;

    if (!audioCtx) {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(audioCtx.destination);
    }

    try {
      source = audioCtx.createMediaElementSource(mediaElement);
      if (analyser) source.connect(analyser);
    } catch (e) {
      console.warn('SilenceSlicer: Could not create media element source', e);
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
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

  if (mediaElement.paused || mediaElement.ended) return;

  const currentVolume = getVolume();

  if (currentVolume < config.threshold) {
    if (!isSilence) {
      silenceTimer = window.setTimeout(() => {
        if (mediaElement) {
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

  chrome.storage.local.get(['threshold', 'padding', 'userTheme'], (result) => {
    if (result.threshold !== undefined) config.threshold = result.threshold as number;
    if (result.padding !== undefined) config.padding = result.padding as number;
    if (result.userTheme !== undefined) config.userTheme = result.userTheme as string;
    checkTheme();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.threshold) config.threshold = changes.threshold.newValue as number;
      if (changes.padding) config.padding = changes.padding.newValue as number;
      if (changes.userTheme) {
        config.userTheme = changes.userTheme.newValue as string;
        checkTheme();
      }
    }
  });

  const checkTheme = () => {
    let isDark = false;
    if (config.userTheme === 'dark') {
      isDark = true;
    } else if (config.userTheme === 'light') {
      isDark = false;
    } else {
      isDark =
        document.documentElement.hasAttribute('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    setIsDarkMode(isDark);

    const container = document.getElementById('silenceslicer-timeline-container');
    if (container) {
      if (isDark) {
        container.classList.add('dark');
      } else {
        container.classList.remove('dark');
      }
    }
  };

  const observer = new MutationObserver((mutations) => {
    const video = document.querySelector('video');
    if (video && video !== mediaElement) {
      initAudio();
    }

    for (const m of mutations) {
      if (
        m.type === 'attributes' &&
        (m.attributeName === 'dark' || m.attributeName === 'data-theme')
      ) {
        checkTheme();
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['dark', 'data-theme'],
  });
  observer.observe(document.body, { childList: true, subtree: true });

  checkTheme();
  initAudio();

  const loop = () => {
    monitorAudio();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
