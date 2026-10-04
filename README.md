# Glimmerfall

A calm, wonder-filled match-3 game for Harper: a purpose-made regulation aid that happens to be a delightful game. Familiar swap-and-match play, spectacular but gentle special pieces, an endless lantern path, no ads, no timers, no losing.

- **BRIEF.md** is the brief this project answers.
- **DESIGN.md** is the agreed design and the staged build plan.

## Status: Stage 1, look, sound and pipeline

The site is live from the `main` branch via GitHub Pages:

- `https://dustyshelf2455.github.io/HarperCrush/` until the repository is renamed, then `https://dustyshelf2455.github.io/glimmerfall/`.
- The Stage 1 mockups are under `/mockups/`: three visual directions, each with a real-size animated board, the six gems, and a glimpse of the map, plus three generated music sketches with wind-down forms.

The site is built with relative paths, so it works at either address. Rename the repository **before** the game is installed on a phone: GitHub does not redirect the Pages address after a rename, and an installed web app keeps its saved progress inside itself.

## Working on it

Node 22 or newer. Three development dependencies (TypeScript, Vite, Vitest) and nothing shipped to the phone.

```
npm install        # once
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run check      # typecheck + tests + build, what CI runs
```

## Layout

```
src/core      pure game logic (board generation, matches, swaps, reshuffle); no DOM
src/shared    seeded RNG, the pentatonic scale and chords
src/audio     Web Audio engine and instruments, the pure composer, the player, the sketches
src/render    gem shapes, the three visual styles, sprite baking, board and map mockups, creatures
src/mockups   the Stage 1 mockup page
tests         Vitest tests over the pure modules
mockups/      HTML entry for the mockup page
index.html    root page (will become the game)
```

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, tests, build, then deploy `dist/` to GitHub Pages. After a push, the **Actions** tab shows the run; the site updates about a minute later.

One-time repository setting, which the workflow cannot do by itself: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Until that is set, the run fails at the `configure-pages` step with "Resource not accessible by integration". After setting it, open the failed run in the **Actions** tab and choose **Re-run all jobs**, or push any commit to `main`.

## Putting it on the iPhone

Full steps, including Guided Access and a Focus mode, are in DESIGN.md Section 5. The short version: open the URL in Safari, Share, **Add to Home Screen**, keep **Open as Web App** on, Add. Open it from the Home Screen icon, never from Safari.
