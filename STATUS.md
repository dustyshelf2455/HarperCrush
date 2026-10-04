# Status

Updated 4 October 2026, end of Stage 2.

## Where things are

- **Live:** `https://dustyshelf2455.github.io/HarperCrush/` (game) and `/mockups/` (Stage 1 mockups). Deploys from `main`. Repository still to be renamed `glimmerfall` before Harper's real install (the Pages address does not redirect after a rename, and an installed app keeps its save inside itself).
- **Decided:** look = Deep Night Garden; music = music-box lullaby; five gem types; board 6 wide by 9 tall; Calm goal = twelve matches shown as a row of stars that light one per match, then the lantern lights and a fresh board arrives. Sound plays regardless of Silent mode by default (the parent panel will offer "follow Silent mode"). Haptic tick experiment is on by default (`?haptics=0` to disable).
- **Built (Stage 2):** pure core with Comet and Prism Orb, cascades, biased refill, hints, reshuffle, 50+ tests; the playable Calm board with swipe and tap-tap, resting-finger rule, clears with rings and sparkles, cascade swell, power creation with gathering light, lantern and companion that respond to a tap, continuous save and exact resume, wake lock, audio suspended when hidden, PWA manifest, icons, and a generated service worker. `?debug=1` shows an overlay with audio state.

## Play-test feedback so far (parent, 4 October)

- Falls and clears look and feel good. Wants a bit more flourish on matches without losing calm (partly done: rings, cascade swell, gathering light on power creation; keep going in Stage 3).
- Heard no sound on the phone: likely Silent mode with the old "follow Silent" default. Now plays through Silent. Confirm on the phone with `?debug=1`.
- The orb's orbiting dots looked unnatural: replaced with a slow sheen and breathing halo.
- Wants levels with clear goals ("beat the level"), not just an unknown number of matches: Calm now shows the star row; Play mode goals (uncover the picture, bring down seeds, free creatures) are Stage 4 and should be built as designed in DESIGN.md 3.7.
- Lantern and companion need to mean something: the map (Stage 3) gives them meaning; both now respond to a tap.
- Wants the largest playable surface: board is now 6 by 9 with 8-pixel gutters.
- Companion and path art are placeholders and need real taste and polish (Stage 3).

## Next

1. **Confirm sound on the phone** with the new default (`?debug=1` shows `audio running`). If still silent, check whether the first touch reaches the audio unlock in the installed app; the overlay shows the context state and any error.
2. **Stage 3** per DESIGN.md Section 6: remaining powers (Bloom, Lantern Sprite, Starburst, Moonrise, Aurora) and all combinations with their trigger rules (3.4), discovery gifts with slowed first firings, the map between levels with areas and the companion hop, the three companions and her choice of them with a real art pass, per-area music voices, the grown-up gate and parent panel (mode, sound, hints, Finish buttons), the launch rule (3.6).
3. **Stage 4** Play mode goals and obstacles (3.7) with completability tests.
4. **Stage 5** endings and wind-down (3.8). **Stage 6** polish, performance on the phone, Reduce Motion, README install guide.

## How to continue in a new session

Say: "Read CLAUDE.md, then STATUS.md, and continue from the top of Next." Work on a branch, run `npm run check`, verify in Chromium at phone size, then push to `main` to deploy.
