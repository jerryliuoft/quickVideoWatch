import { addPeak, updateVideoState, clearPeaks } from './timelineState';

let audioCtx: AudioContext | null = null;
let source: MediaElementAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let mediaElement: HTMLVideoElement | null = null;
let silenceTimer: number | null = null;
let resumeAudioFn: (() => void) | null = null;

let isSilence = false;
let peakVolume = 0.001;
let userPlaybackRate = 1;
let lastVideoSrc = '';

let currentConfig: any = {
  enabled: true,
  minVolumePercent: 10,
  minSilenceLength: 0.5,
  prePadding: 0.2,
  postPadding: 0.2,
};

let callbacks = {
  mountTimeline: () => {},
  unmountTimeline: () => {},
};

export function updateAudioConfig(newConfig: any) {
  currentConfig = { ...currentConfig, ...newConfig };

  if (!currentConfig.enabled) {
    callbacks.unmountTimeline();
    if (isSilence) {
      if (silenceTimer) window.clearTimeout(silenceTimer);
      if (mediaElement && mediaElement.playbackRate === 16) {
        mediaElement.playbackRate = userPlaybackRate;
      }
      isSilence = false;
    }
  } else {
    callbacks.mountTimeline();
  }
}

export async function initAudio(
  newMediaElement: HTMLVideoElement,
  config: any,
  cbs: { mountTimeline: () => void; unmountTimeline: () => void },
) {
  currentConfig = { ...currentConfig, ...config };
  callbacks = cbs;

  if (newMediaElement !== mediaElement) {
    if (workletNode) {
      workletNode.disconnect();
      workletNode = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    mediaElement = newMediaElement;

    if (!audioCtx) {
      audioCtx = new AudioContext();
      try {
        await audioCtx.audioWorklet.addModule(chrome.runtime.getURL('silenceWorklet.js'));
      } catch (e) {
        console.warn('SilenceSlicer: Could not load worklet', e);
        return;
      }
    }

    try {
      source = audioCtx.createMediaElementSource(mediaElement);
      workletNode = new AudioWorkletNode(audioCtx, 'silence-worklet');

      source.connect(workletNode);
      workletNode.connect(audioCtx.destination);

      workletNode.port.onmessage = (event) => {
        handleAudioMessage(event.data.rms, event.data.db);
      };
    } catch (e) {
      console.warn('SilenceSlicer: Could not create media element source or worklet', e);
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

  if (currentConfig.enabled) {
    callbacks.mountTimeline();
  }
}

function handleAudioMessage(rms: number, db: number) {
  if (!currentConfig.enabled || !mediaElement) return;
  if (mediaElement.paused || mediaElement.ended) return;

  if (mediaElement.playbackRate !== 16) {
    userPlaybackRate = mediaElement.playbackRate;
  }

  if (mediaElement.src !== lastVideoSrc) {
    clearPeaks();
    lastVideoSrc = mediaElement.src;
    peakVolume = 0.001;
  }

  if (rms > peakVolume) {
    peakVolume = rms;
  }

  const thresholdRms = peakVolume * (currentConfig.minVolumePercent / 100);

  if (rms < thresholdRms) {
    if (!isSilence) {
      silenceTimer = window.setTimeout(
        () => {
          if (mediaElement) {
            mediaElement.playbackRate = 16;
          }
        },
        Math.max(currentConfig.prePadding, currentConfig.minSilenceLength) * 1000,
      );
      isSilence = true;
    }
  } else {
    if (isSilence) {
      if (silenceTimer) window.clearTimeout(silenceTimer);
      if (mediaElement && mediaElement.playbackRate === 16) {
        mediaElement.playbackRate = userPlaybackRate;
        if (currentConfig.postPadding > 0) {
          mediaElement.currentTime = Math.max(
            0,
            mediaElement.currentTime - currentConfig.postPadding,
          );
        }
      }
      isSilence = false;
    }
  }

  updateVideoState(mediaElement.currentTime, mediaElement.duration);
  addPeak(db, isSilence, mediaElement.currentTime);
}
