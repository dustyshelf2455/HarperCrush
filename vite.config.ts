import { defineConfig } from 'vitest/config';

// `base: './'` makes every asset reference relative, so the built site works
// at any path: dustyshelf2455.github.io/HarperCrush/ today and
// dustyshelf2455.github.io/glimmerfall/ after the repository is renamed.
export default defineConfig({
  base: './',
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
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
