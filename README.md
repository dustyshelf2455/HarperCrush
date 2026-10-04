# Glimmerfall

A calm, wonder-filled match-3 game for Harper: a purpose-made regulation aid that happens to be a delightful game. Familiar swap-and-match play, spectacular but gentle special pieces, an endless lantern path, no ads, no timers, no losing.

- **BRIEF.md** is the brief this project answers.
- **DESIGN.md** is the agreed design and the staged build plan.

## Status: Stage 3, powers, journey and the gate

The site is live from the `main` branch via GitHub Pages:

- `https://dustyshelf2455.github.io/HarperCrush/` is the game: Calm mode on a 6 by 9 board with swipe and tap-tap swaps, cascades, all seven powers and their combinations unlocking along the path, gifts at the milestone lanterns, a goal of twelve matches shown as stars, a lantern that lights when they are all lit, the map between levels with her companion hopping forward through seven areas, a choice of three companions, hints after a pause, reshuffles on dead ends, the music-box lullaby in each area's voice, the grown-up gate and parent panel, continuous saving and exact resume, and offline support. Installable to the Home Screen.
- `https://dustyshelf2455.github.io/HarperCrush/mockups/` keeps the Stage 1 mockups.

After the repository is renamed the addresses move to `.../glimmerfall/`. The site is built with relative paths, so it works at either address. Rename the repository **before** the game is installed on a phone: GitHub does not redirect the Pages address after a rename, and an installed web app keeps its saved progress inside itself.

### The grown-up gate

Hold the dim moon in the top-left corner for a second and a half, then tap the two words the panel names. The panel has the mode switch, the Finish buttons, sound, feel and launch settings, the map position (to restore her journey) and reset.

### Testing switches

A few things are settable from the address bar when you open the game in Safari (an installed Home Screen app keeps the address it was added with):

| Address | Effect |
|---------|--------|
| `.../?debug=1` | a small overlay showing audio state, lantern, area, mode and gift |
| `.../?reset=1` | throw away the saved journey and start fresh at lantern 1 |
| `.../?level=15` | open straight at that lantern on a fresh board (for example the Sprite's gift) |
| `.../?seed=123` | a particular fresh board, for reproducing something |

Sound starts on the first touch and, by default, plays even when the phone is on Silent (switchable in the panel). See `STATUS.md` for where the build is and what is next, and `CLAUDE.md` for how to continue in a new session.

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
src/core      pure game logic (grid helpers; game.ts: swaps, matches, powers, combinations, gifts, cascades, hints, reshuffle; journey.ts: areas, unlocks, gifts, boards per mode)
src/shared    seeded RNG, the pentatonic scale and chords
src/audio     Web Audio engine and instruments, the pure composer, the player, the sketches and area voices
src/render    gem shapes, the three visual styles, sprite baking, the area themes, creatures, the path drawing, the mockup board and map
src/game      the playable app: app (journey, modes, save), view (animation), input (gestures), mapScene, gate, panel, settings, sounds
src/mockups   the Stage 1 mockup page
tests         Vitest tests over the pure modules
mockups/      HTML entry for the mockup page
index.html    the game
```

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, tests, build, then deploy `dist/` to GitHub Pages. After a push, the **Actions** tab shows the run; the site updates about a minute later.

One-time repository setting, which the workflow cannot do by itself: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Until that is set, the run fails at the `configure-pages` step with "Resource not accessible by integration". After setting it, open the failed run in the **Actions** tab and choose **Re-run all jobs**, or push any commit to `main`.

## Putting it on the iPhone

Full steps, including Guided Access and a Focus mode, are in DESIGN.md Section 5. The short version: open the URL in Safari, Share, **Add to Home Screen**, keep **Open as Web App** on, Add. Open it from the Home Screen icon, never from Safari.
