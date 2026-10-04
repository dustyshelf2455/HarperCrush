import './game.css';
import { App, optionsFromUrl } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (canvas) new App(canvas, optionsFromUrl());

// Offline support and silent updates: the worker installs in the background
// and takes over on the next launch, never mid-play.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
