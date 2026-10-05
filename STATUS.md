# Status

Updated 5 October 2026, after the Stage 3 play-test (notes and the plan in the project's `playtest/` folder; decisions in DESIGN.md 2d).

## After the play-test (5 October)

- **Batch 1, deployed (run 14):** the moon gate accepts a real thumb (it rejected any touch over 28 px as a palm; an iPhone thumb is about 40 px), tolerates a wobble and shows its ring from the start, and the moon brightens while held. The map stays after the lantern lights until she taps the lit lantern or her companion; the lantern breathes as the invitation; other taps twinkle.
- **Batch 2, built:** one game that opens as it was left (no launch rule), fresh journeys start in Play, Calm is a switch on the panel over the same game and progress; the session timer (off, 5 to 30 min) with its four-minute sleepy wind-down ending at the resting scene; replaying a lit lantern from the map. Save schema v3; v2 saves carry across and open in Play. Verified in Chromium at phone size: Play default, Calm on and off, the wind-down at half of a five-minute session, the gentle ending into rest, New session, replay of lantern 2 from lantern 3 and the return, exact resume after a relaunch, the v2 migration.
- **Still to do from the play-test:** batch 3 (level-win shimmer, power gems that look special and call to be used, a haptics attempt for swipes) and batch 4 (the art pass: map, firefly, gems).

## Where things are

- **Live:** `https://dustyshelf2455.github.io/HarperCrush/` (game) and `/mockups/` (Stage 1 mockups). Deploys from `main`. Repository still to be renamed `glimmerfall` before Harper's real install (the Pages address does not redirect after a rename, and an installed app keeps its save inside itself).
- **Decided:** look = Deep Night Garden; music = music-box lullaby; board 6 wide by 9 tall with Calm on (7 by 8 otherwise); Calm goal = twelve matches shown as a row of stars, then the lantern lights and the map plays. Sound plays regardless of Silent mode by default (the panel offers "follow Silent"). Haptic tick experiment on by default (panel toggle). The Stage 3 decisions made while building are in DESIGN.md 2c.
- **Built (Stages 2 and 3):**
  - Core: all seven powers (Comet, Prism Orb, Bloom, Lantern Sprite, Starburst, Moonrise, Aurora), every two-power combination from the table in DESIGN.md 3.4, shapes that only count once their power has unlocked, gifts placed one swap from going off, the finishing light that sets an unfired gift off, square-aware fresh boards, refills and reshuffles, cascades, hints by strength. Over two hundred tests, including thousands of random moves replayed through their own steps.
  - The journey: seven areas of ten lanterns that cycle forever, each with its own sky, scenery, ambient life and music voice; the unlock schedule from DESIGN.md 3.4 (Comet at 1, Orb at 5, Bloom at 8, a Comet beside a Bloom at 11, Sprite at 15, and so on to the Aurora at 51); from the second pass on, the first lantern of each area gifts the combination she has fired least.
  - The map between levels: her companion hops to the next lantern, which lights with a bloom and a warm chord; four seconds (eight when the creatures are offered); a tap on the sky continues; the three companions wait by the path after level 1 and at the first lantern of every area, and a tap picks one. A real art pass on the firefly, glow fish and little hero, the lantern path and the scenery.
  - The playable board: swipe and tap-tap, resting-finger rule, clears with rings and sparkles, cascade swell, gathering light on power creation, animations for every power and combination as flowing light, a gift halo, slow motion the first time any power goes off, area-themed backgrounds, lantern and companion that respond to a tap.
  - Modes: Calm (default) and a provisional Play (wider board, thinner bias, slower hints, longer lantern) so the switch is real before Stage 4. Play to Calm is immediate and parks the Play board; Calm to Play waits for the lantern. The launch rule: within ten minutes a relaunch resumes exactly; after longer it opens in Calm on a fresh board at her lantern (or the last mode, by setting).
  - The grown-up gate (hold the moon 1.5 s, then "Tap STAR, then MOON") and the parent panel: mode, Finish after this level, Finish now gently (two taps), New session, sound (music, level, chimes, play on Silent), feel (hint delay, haptic tick, reduce motion, breathing glow), launch rule, Play difficulty (for Stage 4), map position, reset progress, about.
  - Finish buttons in their provisional form: the level ends at the map, the companion falls asleep on the new lantern, the scene rests (taps twinkle) until New session or thirty minutes have passed.
  - Sound: a voice per area (celesta, glass, water, horn, harp, shimmer, kalimba) on the same lullaby, a phrase per power and combination, the music dips under big effects and discoveries, lantern, companion and twinkle sounds, music level soft/normal. Continuous save (schema v2, Stage 2 saves migrate), exact resume, wake lock, audio suspended when hidden, PWA manifest, icons, generated service worker. `?debug=1` shows an overlay with audio and journey state.

## Play-test feedback so far (parent, 4 October)

- Falls and clears look and feel good. Wants a bit more flourish on matches without losing calm (done in Stage 2 and 3; keep an eye on it).
- Heard no sound on the phone: likely Silent mode with the old "follow Silent" default. Now plays through Silent; the panel has the switch. Confirm on the phone with `?debug=1`.
- The orb's orbiting dots looked unnatural: replaced with a slow sheen and breathing halo.
- Wants levels with clear goals ("beat the level"): Calm shows the star row; Play mode goals (uncover the picture, bring down seeds, free creatures) are Stage 4 and should be built as designed in DESIGN.md 3.7.
- Lantern and companion need to mean something: the map now gives them meaning; both respond to a tap.
- Wants the largest playable surface: board is 6 by 9 with 8-pixel gutters.
- Companion and path art were placeholders: redrawn in Stage 3. Look at the map on the phone and say what still feels off.

## Open issue: sound and haptics on the phone (4 October, evening)

Second play-test still had no sound and no haptic tick in the installed app, while other apps were fine. Two causes were found in code and fixed in the same push: (1) the touch surface called preventDefault on touchstart, which on iOS cancels the click that ticks the haptic switch; (2) the audio relied on `navigator.audioSession.type = 'playback'` alone, so if iOS did not honour it and the phone was on Silent, nothing played. Now a looping silent media element is also started on the first touch (the long-standing way to move a web app onto the playback session), the unlock retries on pointerup too, and `?debug=1` shows the build date, context state, session type and keep-alive state.

**If sound is still missing:** ask for a screenshot of the game opened in Safari with `?debug=1` after one tap. `audio running` plus `keepalive playing` with no sound means Silent mode is winning: switch "Play even when iPhone is on Silent" off and on in the panel, check Silent mode via the Action Button, and check the ringer volume. `audio suspended` or `keepalive blocked` means the gesture is not reaching the unlock in the installed app: move the unlock into a `click` handler on the touch surface and test again. Also confirm the overlay's build date matches the latest deploy; if it is old, the installed app is still on the previous service-worker cache: close it fully and open it twice, or delete the icon and re-add it (progress can be restored from the panel's Map position).

## No overlay on the phone: stale build (4 October, night)

The parent opened the game with `?debug=1` and saw no overlay. Cause: the installed copy and the open Safari tab were still on the build from before the overlay existed. The service worker never called skipWaiting, so a new build only took over once every tab or the app itself had been fully closed, and a Safari tab left on the game kept the old build alive indefinitely. Two further faults were found while reproducing this in Chromium: (1) the worker's cache never served the scripts, because static hosts send `Vary: Origin` and module-script requests carry an Origin header, so every script fell through to the network (offline would have failed); fixed with `ignoreVary`. (2) `register()` alone does not check for a new worker when one is already active; the page now calls `registration.update()` itself.

Update policy now (see README "How an update reaches a phone"): the new build installs in the background and takes over at a launch, never mid-play. If it is ready when the app opens, or finishes installing in the first three seconds before the first touch, the page reloads to it at once (guarded to one reload per launch via a localStorage timestamp); otherwise it is used at the next launch. The `?debug=1` overlay (also `#debug`) shows the update state. Verified in Chromium with a scripted sequence of three deploys: old build served first, adopted within three seconds at launch, no reload after a touch, next launch adopts, offline launch works. A separate finding: in headless software-rendered Chromium at 3x pixel ratio the browser delays starting the new worker by exactly 60 s; it does not happen at 1x, nor for a trivial page at 3x, and the main thread stays responsive, so it is treated as a headless rendering artefact, not a phone issue. The phone has a GPU; if the phone ever shows `update installing` for a long time, revisit.

The already-installed copy on the phone still carries the old worker, which cannot adopt by itself. One-time fix: delete the icon and add it again from Safari, or open the address in a Private tab (iOS Private tabs have their own empty worker storage, so they always load the live build). Progress can be put back with the panel's Map position.

## Things found while building Stage 3

- A plus and a 2 by 3 block can never be completed by a single swap on a line-free board (one of their two lines would already have to exist), so Starburst and Moonrise only ever come from cascades, the refill bias or their gifts. They will be rarer than the other powers; if that feels wrong in play, the Calm bias can be taught to set those shapes up.
- Reshuffles now deal the pieces back cell by cell avoiding matches, instead of trying random permutations; on a four-type board the old way failed about one time in eight.
- Calm mode now uses four gem types in Twinkle Meadow and five from Crystal Cave, as DESIGN.md 3.2 says. The Stage 2 prototype used five from the start; one line in `src/core/journey.ts` changes it back.
- The whole audio side was built without being heard (no speakers here); levels were reasoned against the Stage 2 orb phrases. Listen to the new voices and the big combinations on the phone.
- An independent review of the Stage 3 code found seven real defects, all fixed before the deploy: a combination gift's hint could point at one power alone (and the finishing light fired the pair one at a time); the Orb could be made from lantern 1; replacing the board mid-animation (a mode switch) kept playing the old steps; a gem landing where a carried power had been stayed invisible; the comet shower's phrase replayed mid-shower; and switching "play even when on Silent" off did nothing until the app was hidden once.
- Verified in Chromium at phone size: every gift and its firing, the map hop and the Meadow-to-Cave crossing, the companion offer, the resting scene, the gate and panel, the launch rule in all five cases (exact resume, fresh after ten minutes, resting under and over thirty minutes, a Stage 2 save), a corrupt save, and the mode switches including the parked Play board.

## Next

1. **Play-test Stage 3 on the phone:** first get the phone onto the current build (re-add the icon, or use a Private tab; see the stale-build note above), then: the map and the creatures, the gate (hold the moon top-left for 1.5 s, then tap the two words), the panel in a car with one thumb, the first discoveries (`?reset=1&level=5` opens straight at the Orb's gift, `?level=8` the Bloom's, `?level=15` the Sprite's, `?level=25` the Starburst's, `?level=31` the Moonrise's, `?level=51` the Aurora's), the area crossings (`?level=10` then finish the level), and the sound of each area. Confirm sound and the haptic tick as above.
2. **Stage 4** Play mode goals and obstacles (DESIGN.md 3.7) with completability tests, replacing the provisional Play board.
3. **Stage 5** endings and wind-down (3.8): session timer, softening, the resting scene's timing and dimming, rest-until and New session as designed, the breathing glow controls, the night dimmer.
4. **Stage 6** polish, performance on the phone during the biggest effects, Reduce Motion, area creature cameos, the discoveries book, README install guide, a Playwright smoke test.

## How to continue in a new session

Say: "Read CLAUDE.md, then STATUS.md, and continue from the top of Next." Work on a branch, run `npm run check`, verify in Chromium at phone size, then push to `main` to deploy.
