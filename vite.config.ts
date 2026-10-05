import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Emits a hand-written service worker that pre-caches every built file.
 * The worker only calls skipWaiting when the page asks it to, which the page
 * does at launch (see src/game/main.ts), so a new build installs in the
 * background and takes over at a launch, never during play.
 */
function serviceWorker(): Plugin {
  return {
    name: 'glimmerfall-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== 'sw.js');
      // HTML entries are written after this hook runs, so they are listed by hand.
      const assets = new Set<string>([
        './',
        './index.html',
        './mockups/',
        './mockups/index.html',
        './manifest.webmanifest',
        './icons/icon-180.png',
        './icons/icon-192.png',
        './icons/icon-512.png',
        ...['star', 'heart', 'drop', 'leaf', 'diamond', 'sunstone'].map((t) => `./art/gems/${t}.png`),
        ...['meadow-backdrop.jpg', 'lantern-lit.png', 'lantern-unlit.png', 'prop-tuft.png', 'prop-flower.png', 'prop-mushroom.png', 'prop-stone.png'].map((f) => `./art/map/${f}`),
      ]);
      for (const f of files) assets.add('./' + f);
      const list = [...assets].sort();
      const version = createHash('sha1').update(list.join('\n')).update(buildDate).digest('hex').slice(0, 12);
      const source = `// Glimmerfall service worker, build ${version}
const CACHE = 'glimmerfall-${version}';
const ASSETS = ${JSON.stringify(list)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('glimmerfall-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});
// Same-origin GET only, cache first. ignoreVary: static hosts send
// "Vary: Origin", and module-script requests carry an Origin header, which
// would otherwise make every script miss the cache.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(event.request)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

const buildDate = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

// `base: './'` makes every asset reference relative, so the built site works
// at any path: dustyshelf2455.github.io/HarperCrush/ today and
// dustyshelf2455.github.io/glimmerfall/ after the repository is renamed.
export default defineConfig({
  base: './',
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        mockups: 'mockups/index.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
