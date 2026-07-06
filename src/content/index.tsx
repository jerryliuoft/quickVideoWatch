import '../index.css';
import { render } from 'solid-js/web';
import { VideoTimeline } from './VideoTimeline';
import { setIsDarkMode } from './timelineState';
import { initAudio, updateAudioConfig } from './audioProcessor';

let timelineMounted = false;
let config = {
  enabled: true,
  minVolumePercent: 10,
  minSilenceLength: 0.5,
  prePadding: 0.2,
  postPadding: 0.2,
  userTheme: 'auto',
};

function mountTimeline() {
  const existingContainer = document.getElementById('silenceslicer-timeline-container');

  if (timelineMounted && existingContainer && document.body.contains(existingContainer)) return;

  const anchorPoints = [
    document.querySelector('#below'),
    document.querySelector('ytd-watch-metadata'),
    document.querySelector('#primary-inner > #meta'),
    document.querySelector('#primary-inner'),
  ];

  let anchor = null;
  for (const point of anchorPoints) {
    if (point && point.parentElement) {
      anchor = point;
      break;
    }
  }

  const fallbackPlayer = document.querySelector('ytd-player');
  const genericVideo = document.querySelector('video');

  if (anchor || fallbackPlayer || genericVideo) {
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

    if (anchor) {
      anchor.parentElement?.insertBefore(container, anchor);
    } else if (fallbackPlayer) {
      fallbackPlayer.parentElement?.insertBefore(container, fallbackPlayer.nextSibling);
    } else if (genericVideo) {
      genericVideo.parentElement?.insertBefore(container, genericVideo.nextSibling);
    }

    const isDark =
      document.documentElement.hasAttribute('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) container.classList.add('dark');

    render(() => <VideoTimeline />, container);
    timelineMounted = true;
  }
}

function unmountTimeline() {
  const existingContainer = document.getElementById('silenceslicer-timeline-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  timelineMounted = false;
}

function main() {
  const seekListener = ((e: CustomEvent) => {
    const video = document.querySelector('video');
    if (video && !isNaN(e.detail.time)) {
      video.currentTime = e.detail.time;
    }
  }) as EventListener;
  window.addEventListener('silenceSlicerSeek', seekListener);

  chrome.storage.local.get(
    ['enabled', 'minVolumePercent', 'minSilenceLength', 'prePadding', 'postPadding', 'userTheme'],
    (result) => {
      if (result.enabled !== undefined) config.enabled = result.enabled as boolean;
      if (result.minVolumePercent !== undefined)
        config.minVolumePercent = result.minVolumePercent as number;
      if (result.minSilenceLength !== undefined)
        config.minSilenceLength = result.minSilenceLength as number;
      if (result.prePadding !== undefined) config.prePadding = result.prePadding as number;
      if (result.postPadding !== undefined) config.postPadding = result.postPadding as number;
      if (result.userTheme !== undefined) config.userTheme = result.userTheme as string;
      checkTheme();
      updateAudioConfig(config);
    },
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      let changed = false;
      if (changes.enabled) {
        config.enabled = changes.enabled.newValue as boolean;
        changed = true;
      }
      if (changes.minVolumePercent) {
        config.minVolumePercent = changes.minVolumePercent.newValue as number;
        changed = true;
      }
      if (changes.minSilenceLength) {
        config.minSilenceLength = changes.minSilenceLength.newValue as number;
        changed = true;
      }
      if (changes.prePadding) {
        config.prePadding = changes.prePadding.newValue as number;
        changed = true;
      }
      if (changes.postPadding) {
        config.postPadding = changes.postPadding.newValue as number;
        changed = true;
      }
      if (changes.userTheme) {
        config.userTheme = changes.userTheme.newValue as string;
        checkTheme();
      }
      if (changed) updateAudioConfig(config);
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
    if (video) {
      initAudio(video, config, { mountTimeline, unmountTimeline });
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

  const initialVideo = document.querySelector('video');
  if (initialVideo) {
    initAudio(initialVideo, config, { mountTimeline, unmountTimeline });
  }
}

main();
