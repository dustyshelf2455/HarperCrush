# Glimmerfall: working notes for Claude

Read these before doing anything, in this order:

1. `BRIEF.md`: the parent's brief. The source of truth for what the game is for.
2. `DESIGN.md`: the agreed design, decisions so far, and the staged plan.
3. `STATUS.md`: where the build is right now, what was decided in play-tests, and what comes next.

Then continue from the top item in STATUS.md's "Next" list unless the person says otherwise.

## How this project works

- Development happens on a branch; `main` deploys to GitHub Pages on every push via `.github/workflows/deploy.yml` (typecheck, tests, build, deploy). Push to `main` only when the build is verified.
- `npm run check` runs typecheck, tests and the build; it must pass before any push.
- Zero runtime dependencies. TypeScript, Vite, Vitest only. Sound is generated in code. Art is code-drawn except the painted pictures under `public/art/` (art round two, DESIGN.md 2d): generated with the OpenAI image API from this environment, reviewed, cut out, and stamped by the sprite cache; the code-drawn version of a piece stays as its fallback. New picture files must be added to the service worker's asset list in `vite.config.ts`.
- The game core in `src/core` is pure and deterministic (seeded RNG) and must stay testable without a browser. Rendering (`src/render`, `src/game/view.ts`) only shows what the core's step list says happened.
- Keep the brief's rules: no timers, scores, lives, counters, pop-ups, text for the child, strobing, or paths out of the app. Calm is non-negotiable; delight is the hook.
- Verify visually before pushing: Playwright with the preinstalled Chromium (`/opt/pw-browsers/chromium`) at an iPhone 16 Pro viewport (402 by 874), screenshots and short videos. Scratch scripts live outside the repo.
- Write user-facing updates in DESIGN.md or STATUS.md, not in chat only.

## Layout

```
src/core      pure game logic (grid helpers; game.ts is the real core: swaps, matches, powers, cascades, hints, reshuffle)
src/shared    seeded RNG, pentatonic scale and chords
src/audio     Web Audio engine, pure composer, player, the three sketches
src/render    gem shapes, styles (Deep Night Garden is the chosen one), sprites, creatures, the mockup board and map
src/game      the playable app: view (animation), input (gestures), sounds, app (state, save, goals)
src/mockups   the Stage 1 mockup page (kept at /mockups/)
tests         Vitest over the pure modules
```
