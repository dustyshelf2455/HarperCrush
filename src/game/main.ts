import './game.css';
import { App, optionsFromUrl } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (canvas) new App(canvas, optionsFromUrl());

// Offline support and silent updates. A new build installs in the background
// while the running one keeps playing. It takes over at a launch, never
// mid-play: if an update is ready when the app opens (or finishes installing
// in the first moments, before the first touch), the page switches to it at
// once; otherwise it waits for the next launch.
//
// The state is published as data-update on <html> so the ?debug=1 overlay can
// show it: checking, first-install, current, installing, adopting, next-launch.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const LAUNCH_WINDOW_MS = 3000;
  const RELOADED_KEY = 'glimmerfall.updated';
  const openedAt = performance.now();
  const status = (s: string): void => { document.documentElement.dataset.update = s; };
  let touched = false;
  let adopting = false;
  window.addEventListener('pointerdown', () => { touched = true; }, { capture: true, once: true });

  // Reload at most once per launch, so a worker that never activates cannot
  // loop. localStorage rather than sessionStorage: iOS home-screen apps do not
  // keep sessionStorage reliably.
  let reloadedThisLaunch = false;
  try {
    reloadedThisLaunch = Date.now() - Number(localStorage.getItem(RELOADED_KEY) ?? 0) < 15_000;
    localStorage.removeItem(RELOADED_KEY);
  } catch {
    // storage unavailable: behave as a fresh launch
  }

  const adopt = (worker: ServiceWorker): void => {
    if (adopting) return;
    if (touched || reloadedThisLaunch || performance.now() - openedAt > LAUNCH_WINDOW_MS) {
      status('next-launch');
      return;
    }
    adopting = true;
    status('adopting');
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (touched) { status('next-launch'); return; }
        try { localStorage.setItem(RELOADED_KEY, String(Date.now())); } catch { /* reload anyway */ }
        location.reload();
      },
      { once: true },
    );
    worker.postMessage({ type: 'skipWaiting' });
  };

  const watch = (worker: ServiceWorker | null): void => {
    if (!worker) return;
    status('installing');
    if (worker.state === 'installed') { adopt(worker); return; }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') adopt(worker);
      else if (worker.state === 'redundant') status('current');
    });
  };

  status('checking');
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // First install: this page already is the newest build, nothing to adopt.
        if (!navigator.serviceWorker.controller) { status('first-install'); return; }
        if (reg.waiting) adopt(reg.waiting);
        else if (reg.installing) watch(reg.installing);
        else status('current');
        reg.addEventListener('updatefound', () => watch(reg.installing));
        // Ask for a check now rather than relying on the browser's own
        // navigation-time check, which Chromium delays or skips.
        void reg.update().catch(() => undefined);
      })
      .catch(() => status('unavailable'));
  });
}
