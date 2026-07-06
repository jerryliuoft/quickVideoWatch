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
let peakVolume = 0.001;
let config = {
  minVolumePercent: 5, // %
  minSilenceLength: 0.8, // seconds
  prePadding: 0.2, // seconds
  postPadding: 0.2, // seconds
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

let resumeAudioFn: (() => void) | null = null;

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
    if (resumeAudioFn) {
      document.removeEventListener('click', resumeAudioFn);
      document.removeEventListener('keydown', resumeAudioFn);
    }

    resumeAudioFn = () => {
      audioCtx?.resume();
      if (resumeAudioFn) {
        document.removeEventListener('click', resumeAudioFn);
        document.removeEventListener('keydown', resumeAudioFn);
        resumeAudioFn = null;
      }
    };

    document.addEventListener('click', resumeAudioFn);
    document.addEventListener('keydown', resumeAudioFn);
  }
}

function getVolumeLevels() {
  if (!analyser) return { rms: 0, db: -100 };
  const dataArray = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatTimeDomainData(dataArray);

  let sumSquares = 0.0;
  for (let i = 0; i < dataArray.length; i++) {
    sumSquares += dataArray[i] * dataArray[i];
  }

  const rms = Math.sqrt(sumSquares / dataArray.length);
  const db = 20 * Math.log10(rms || 0.0001);
  return { rms, db };
}

let userPlaybackRate = 1;

function monitorAudio() {
  mountTimeline(); // constantly attempt to mount if not mounted yet, or unmount if disabled

  if (!mediaElement) return;

  // Track the user's playback rate when we are not currently fast-forwarding
  if (mediaElement.playbackRate !== 16) {
    userPlaybackRate = mediaElement.playbackRate;
  }

  // Handle video source changes
  if (mediaElement.src !== lastVideoSrc) {
    clearPeaks();
    lastVideoSrc = mediaElement.src;
    peakVolume = 0.001;
  }

  if (mediaElement.paused || mediaElement.ended) return;

  const { rms, db } = getVolumeLevels();

  if (rms > peakVolume) {
    peakVolume = rms;
  }

  const thresholdRms = peakVolume * (config.minVolumePercent / 100);

  if (rms < thresholdRms) {
    if (!isSilence) {
      silenceTimer = window.setTimeout(
        () => {
          if (mediaElement) {
            mediaElement.playbackRate = 16;
          }
        },
        Math.max(config.prePadding, config.minSilenceLength) * 1000,
      );
      isSilence = true;
    }
  } else {
    if (isSilence) {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (mediaElement && mediaElement.playbackRate === 16) {
        mediaElement.playbackRate = userPlaybackRate;
        if (config.postPadding > 0) {
          mediaElement.currentTime = Math.max(0, mediaElement.currentTime - config.postPadding);
        }
      }
      isSilence = false;
    }
  }

  updateVideoState(mediaElement.currentTime, mediaElement.duration);
  // push to timeline state
  addPeak(db, isSilence, mediaElement.currentTime);
}

function main() {
  const seekListener = ((e: CustomEvent) => {
    if (mediaElement && !isNaN(e.detail.time)) {
      mediaElement.currentTime = e.detail.time;
    }
  }) as EventListener;
  window.addEventListener('silenceSlicerSeek', seekListener);

  chrome.storage.local.get(
    ['minVolumePercent', 'minSilenceLength', 'prePadding', 'postPadding', 'userTheme'],
    (result) => {
      if (result.minVolumePercent !== undefined)
        config.minVolumePercent = result.minVolumePercent as number;
      if (result.minSilenceLength !== undefined)
        config.minSilenceLength = result.minSilenceLength as number;
      if (result.prePadding !== undefined) config.prePadding = result.prePadding as number;
      if (result.postPadding !== undefined) config.postPadding = result.postPadding as number;
      if (result.userTheme !== undefined) config.userTheme = result.userTheme as string;
      checkTheme();
    },
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.minVolumePercent)
        config.minVolumePercent = changes.minVolumePercent.newValue as number;
      if (changes.minSilenceLength)
        config.minSilenceLength = changes.minSilenceLength.newValue as number;
      if (changes.prePadding) config.prePadding = changes.prePadding.newValue as number;
      if (changes.postPadding) config.postPadding = changes.postPadding.newValue as number;
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
