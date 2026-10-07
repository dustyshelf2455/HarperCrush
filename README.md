# Glimmerfall

A calm, wonder-filled match-3 game for Harper: a purpose-made regulation aid that happens to be a delightful game. Familiar swap-and-match play, spectacular but gentle special pieces, an endless lantern path, no ads, no timers, no losing.

- **BRIEF.md** is the brief this project answers.
- **DESIGN.md** is the agreed design and the staged build plan.

## Status: Stage 5, the full draft

The site is live from the `main` branch via GitHub Pages:

- `https://dustyshelf2455.github.io/HarperCrush/` is the game. A painted launch picture with a fairy door that opens onto the storybook map at her lantern; Play levels with real goals (uncover a hidden picture under frost, sprout star-seeds, free a dragon or a fairy from a bubble, gather a colour) on a 7 by 8 board, and Calm mode on a 6 by 9 board that counts matches; all seven powers and their combinations unlocking along the path, gifts at the milestone lanterns; the map between levels with her companion and the two others travelling the path through seven painted areas (tap a friend to swap); the Glimmerfall theme on the map in each area's voice and the lullaby under a level; the session timer with its sleepy wind-down, "Finish after this level", "Finish now, gently" and the resting night; the grown-up gate and parent panel; continuous saving and exact resume; offline support. Installable to the Home Screen.
- `https://dustyshelf2455.github.io/HarperCrush/mockups/` keeps the Stage 1 mockups.

After the repository is renamed the addresses move to `.../glimmerfall/`. The site is built with relative paths, so it works at either address. Rename the repository **before** the game is installed on a phone: GitHub does not redirect the Pages address after a rename, and an installed web app keeps its saved progress inside itself.

### The grown-up gate and panel

Hold the dim moon in the top-left corner for a second and a half, then tap the two words the panel names. The panel has the Calm switch and the Finish buttons in thumb reach at the bottom, then: the session length, the sleepy wind-down switch, how long the resting scene keeps on a relaunch ("Rest for"), the night dimmer for dark cars, sound (music, music level, chimes, play on Silent), feel (hint delay, Reduce Motion, breathing glow), Play difficulty, the map position (to restore her journey on a new phone), reset, and the About line with the build time. "Review mode (development)" is a switch for walkthroughs that lights every lantern and saves nothing; it is to be removed before her real install.

### Testing switches

A few things are settable from the address bar when you open the game in Safari (an installed Home Screen app keeps the address it was added with):

| Address | Effect |
|---------|--------|
| `.../?debug=1` (or `.../#debug`) | a small overlay showing the build date, audio and music state, lantern, area, mode, gift and update state, plus `window.glimmerfall` hooks for scripts |
| `.../?reset=1` | throw away the saved journey and start fresh at lantern 1 |
| `.../?level=15` | open straight at that lantern on a fresh board (for example the Sprite's gift) |
| `.../?seed=123` | a particular fresh board, for reproducing something |
| `.../?splash=0` | skip the launch picture (scripts and screenshots) |

Sound starts on the tap that opens the fairy door and, by default, plays even when the phone is on Silent (switchable in the panel). See `STATUS.md` for where the build is and what is next, `DESIGN.md` for the design and its decisions, `STYLE.md` for the painted art, and `CLAUDE.md` for how to continue in a new session.

## Working on it

Node 22 or newer. Four development dependencies (TypeScript, Vite, Vitest, and playwright-core for the smoke test) and nothing shipped to the phone. The painted pictures under `public/art/` were generated with the OpenAI image API against `STYLE.md` and are checked in; the code-drawn version of every piece stays as its fallback.

```
npm install        # once
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run check      # typecheck + tests + build, what CI runs
npm run smoke      # after a build: opens dist/ in Chromium at phone size, goes through the door, plays moves, checks the offline asset list
```

The smoke test needs a Chromium: set `CHROME` to its binary (in the cloud environment `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), or install one with `npx playwright-core install chromium`.

## Layout

```
src/core      pure game logic (grid helpers; game.ts: swaps, matches, powers, combinations, gifts, cascades, hints, reshuffle; journey.ts: areas, unlocks, gifts, boards per mode)
src/shared    seeded RNG, the pentatonic scale and chords
src/audio     Web Audio engine and instruments, the pure composer, the player, the sketches and area voices
src/render    gem shapes, the visual style, sprite baking, the area themes, creatures, the painted-art loaders, the map's pages and geometry, the mockup board and map
src/game      the playable app: app (journey, modes, timer, save), view (animation), input (gestures), splash, mapScene, gate, panel, settings, sounds, review
src/mockups   the Stage 1 mockup page
scripts       the Playwright smoke test
public/art    the painted pictures (gems, powers, pieces, boards, map pages, beacons, companions, the launch picture)
tests         Vitest tests over the pure modules
mockups/      HTML entry for the mockup page
index.html    the game
```

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, tests, build, then deploy `dist/` to GitHub Pages. After a push, the **Actions** tab shows the run; the site updates about a minute later.

**How an update reaches a phone.** The app is served by a service worker from its own cache, so it opens instantly and offline. A new build is downloaded in the background; it takes over at a launch, never mid-play: if the new build is already waiting when the app opens, the page switches to it at once (a quick dark reload before the first touch); if the download only finishes after play has begun, the new build is used at the next launch. In Safari, a tab left open on the game keeps the old build alive, so to see a fresh deploy right away either close every Safari tab showing the game and open the address again, or open the address in a Private tab (Private tabs have no service worker and always fetch the live site). The `?debug=1` overlay shows the build date and the update state (`current`, `installing`, `adopting`, `next-launch`).

One-time repository setting, which the workflow cannot do by itself: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Until that is set, the run fails at the `configure-pages` step with "Resource not accessible by integration". After setting it, open the failed run in the **Actions** tab and choose **Re-run all jobs**, or push any commit to `main`.

## Putting it on the iPhone

Full steps are in DESIGN.md Section 5; this is the short version.

**Install (5.1).** Open the URL in Safari, tap Share (behind the "..." menu at the end of the address bar on iOS 26), **Add to Home Screen**, keep **Open as Web App** on, **Add**. Open it from the Home Screen icon, never from Safari. Do not delete and re-add the icon once she is playing: her progress lives inside the installed app (the panel's Map position can put it back if that ever happens).

**Guided Access (5.2), the one setting that matters.** Settings → Accessibility → Guided Access: turn it on, set a passcode she does not know (and Face ID), set **Display Auto-Lock** to 15 minutes, and turn on the Accessibility Shortcut. Then, with the game open, triple-click the side button; the first time, tap Options and turn the side button, Motion and Keyboards off; tap Start. Triple-click again and authenticate to end it. This blocks the home gesture, Control Center, notifications and calls.

**A Focus mode (5.3)** for the moments you hand the phone over without Guided Access: Settings → Focus → + → Custom, allow calls from the people who must reach you and Allow Repeated Calls, and put it on the Action Button or in Control Center.

**Worth checking (5.4).** Portrait Orientation Lock on; Back Tap off; Screen Time's web restrictions allow the game's address; the game's own night dimmer and iOS's Reduce White Point for dark cabins.
