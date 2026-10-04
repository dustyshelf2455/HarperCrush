# Status

Updated 4 October 2026, end of Stage 2 (after the Stage 2 code review).

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

## Open issue: sound and haptics on the phone (4 October, evening)

Second play-test still had no sound and no haptic tick in the installed app, while other apps were fine. Two causes were found in code and fixed in the same push: (1) the touch surface called preventDefault on touchstart, which on iOS cancels the click that ticks the haptic switch; (2) the audio relied on `navigator.audioSession.type = 'playback'` alone, so if iOS did not honour it and the phone was on Silent, nothing played. Now a looping silent media element is also started on the first touch (the long-standing way to move a web app onto the playback session), the unlock retries on pointerup too, and `?debug=1` shows the build date, context state, session type and keep-alive state. The bottom row being cut off in the installed app was the canvas being sized from the padded stage; it is now sized from its own content box.

**If sound is still missing:** ask for a screenshot of the game opened in Safari with `?debug=1` after one tap. `audio running` plus `keepalive playing` with no sound means Silent mode is winning: try `?silent=follow` toggled off/on, check Silent mode via the Action Button, and check the ringer volume (ambient-session volume follows the ringer, not media, on some iOS versions). `audio suspended` or `keepalive blocked` means the gesture is not reaching the unlock in the installed app: move the unlock into a `click` handler on the touch surface and test again. Also confirm the overlay's build date matches the latest deploy; if it is old, the installed app is still on the previous service-worker cache: close it fully and open it twice, or delete the icon and re-add it (progress is not important yet).

## No overlay on the phone: stale build (4 October, night)

The parent opened the game with `?debug=1` and saw no overlay. Cause: the installed copy and the open Safari tab were still on the build from before the overlay existed. The service worker never called skipWaiting, so a new build only took over once every tab or the app itself had been fully closed, and a Safari tab left on the game kept the old build alive indefinitely. Two further faults were found while reproducing this in Chromium: (1) the worker's cache never served the scripts, because static hosts send `Vary: Origin` and module-script requests carry an Origin header, so every script fell through to the network (offline would have failed); fixed with `ignoreVary`. (2) `register()` alone does not check for a new worker when one is already active; the page now calls `registration.update()` itself.

Update policy now (see README "How an update reaches a phone"): the new build installs in the background and takes over at a launch, never mid-play. If it is ready when the app opens, or finishes installing in the first three seconds before the first touch, the page reloads to it at once (guarded to one reload per launch via a localStorage timestamp); otherwise it is used at the next launch. The `?debug=1` overlay (also `#debug`) shows the update state. Verified in Chromium with a scripted sequence of three deploys: old build served first, adopted within three seconds at launch, no reload after a touch, next launch adopts, offline launch works. A separate finding: in headless software-rendered Chromium at 3x pixel ratio the browser delays starting the new worker by exactly 60 s; it does not happen at 1x, nor for a trivial page at 3x, and the main thread stays responsive, so it is treated as a headless rendering artefact, not a phone issue. The phone has a GPU; if the phone ever shows `update installing` for a long time, revisit.

The already-installed copy on the phone still carries the old worker, which cannot adopt by itself. One-time fix: delete the icon and add it again from Safari, or open the address in a Private tab (iOS Private tabs have their own empty worker storage, so they always load the live build).

## Review fixes applied (4 October, late evening)

A second code review of Stage 2 found thirteen real issues; all are fixed and covered by tests where the logic is pure. Core: swapping an orb onto a comet fires both; swapping two powers fires both; a comet swapped into its own four fires before the new power is created; hint strength now has tiers (orb swaps and power lines strongest) so the hint reflects what the swap does; chain firing no longer skips the anchor piece. View and input: the frame loop stays live while a celebration or queued steps are pending; a resting finger is ignored on move as well as on down; a pending swap is dropped once the level is done so a tap cannot carry into the next board. Audio: the keep-alive state reported by `?debug=1` is the element's real state, music restarts after the tab was hidden, and suspend/resume fade instead of cutting. Tests: a replay helper proves a random move sequence reproduces the same final board and that saved state round-trips.

## Next

1. **Confirm sound and the haptic tick on the phone**: re-add the icon (or use a Private tab) so the phone has the current build, then use the steps above.
2. **Stage 3** per DESIGN.md Section 6: remaining powers (Bloom, Lantern Sprite, Starburst, Moonrise, Aurora) and all combinations with their trigger rules (3.4), discovery gifts with slowed first firings, the map between levels with areas and the companion hop, the three companions and her choice of them with a real art pass, per-area music voices, the grown-up gate and parent panel (mode, sound, hints, Finish buttons), the launch rule (3.6).
3. **Stage 4** Play mode goals and obstacles (3.7) with completability tests.
4. **Stage 5** endings and wind-down (3.8). **Stage 6** polish, performance on the phone, Reduce Motion, README install guide.

## How to continue in a new session

Say: "Read CLAUDE.md, then STATUS.md, and continue from the top of Next." Work on a branch, run `npm run check`, verify in Chromium at phone size, then push to `main` to deploy.
