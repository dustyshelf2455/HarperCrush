# Glimmerfall: design proposal

*Proposal v0.1, 3 October 2026. Written in response to BRIEF.md. Nothing has been built yet; this is the "settle the design first" step.*

How to read this: Section 1 is my understanding of the goal, so you can correct me. Section 2 has the few questions whose answers would change the design, each with the default I will use if you just say "go with your defaults". Sections 3 to 5 are the design itself and the practical setup. Section 6 is the build plan, and Section 7 lists the judgment calls I would like you to weigh in on. Everything in here is a proposal, not a commitment to a specific detail, and I have tried to say "recommendation" wherever I am choosing between real options.

---

## 1. What I understand you want

You want a purpose-built regulation aid for Harper that happens to be an excellent match-3 game. The measure of success is not engagement. It is this: she is upset, she plays for a few minutes, her body settles, and the phone can be handed back without a second meltdown.

Candy Crush already works for this because its core loop is genuinely good for her: pattern recognition, shapes, satisfying feedback, and the wonder of discovering what a special piece does. What is wrong with it is everything wrapped around that loop: ads, upsells, timers, lives, scores, and manufactured urgency, all of which are the opposite of what an overloaded nervous system needs. So the game keeps the familiar mechanics and the polish, and strips out every pressure mechanic.

The hook is wonder, not pressure. Big, beautiful moments are welcome. Frantic ones are not. Calm comes from smooth motion, warm sound, and the absence of anything to lose, never from making the game dull or washed out. It must look at least as inviting as the game she already knows, and it must be comfortable in a dark car.

She is five, a pre-reader, with small and imprecise hands that get worse when she is upset. Everything she touches must work with zero reading and must survive mashing, multi-touch, and a resting palm. The parent-only area can use text, and reading is actually a useful gate.

Two modes: a near-unfailable Calm mode for mid-meltdown, which should be the default on launch, and a Play mode for calm times where she can struggle with a level and beat it without ever losing. In both, she keeps advancing along a map that goes on forever, because that journey thrilled her.

Endings matter as much as play. Taking the phone away is the moment that most often goes wrong, so the game needs a parent-triggered and a time-based way to arrive at a natural, story-like resting point.

Technically: an installable, fully offline web app on your iPhone 16 Pro, opening straight into her current level within a second or two, saving continuously, updating silently, hardened against zoom and stray gestures, battery-aware, and tested. All art and sound generated in code. Simple, dependency-light stack. Deployed somewhere you can install from, probably GitHub Pages. And honest guidance on what a web app cannot do and how to cover that on the phone itself.

If any of that is off, tell me before I build on it.

---

## 2. Questions that would change the design

I have kept this to the ones that matter. Each has a default.

1. **Does Harper recognise numerals or letters yet?** The parent gate (Section 3.9) relies on reading a short word. If she knows letters well enough to match a word by shape, I will switch to a 4-digit PIN instead. *Default: she cannot yet match written words, so the word gate is safe.*

2. **Is the phone usually connected to the car over Bluetooth or CarPlay while she plays?** If so, game sound will come out of the car speakers like any app, and Silent mode will not mute it there. That changes how I set up the sound controls (Section 3.11). *Default: sometimes connected, so I will make muting in the parent panel a one-tap affair and default sound to follow Silent mode.*

3. **Do you want the game's name in the install URL?** The site will live at `https://dustyshelf2455.github.io/HarperCrush/` unless the repository is renamed. Renaming later changes the URL and means re-installing the app and losing local progress, so this is best decided before Harper's first install. *Default: rename the repo to `glimmerfall` (or whatever name you pick) before the first real install, and keep `HarperCrush` until then.*

4. **Session length and wind-down.** What feels right for a typical use: a 10-minute session with the last 2 minutes softening, or longer? Both will be adjustable. *Default: 10 minutes total, with a "Finish after this level" button for arrivals.*

5. **Should Play mode survive a relaunch?** My recommendation is that a fresh launch (after 10 or more minutes away) always starts in Calm mode, since that is what she needs when the phone is handed over mid-meltdown, while a quick relaunch (a swipe-away or a phone call) resumes exactly where she was. *Default: that rule, with a parent setting to remember the last mode instead.*

6. **One companion creature or a choice?** Her marker on the map is a small glowing creature. A choice of two or three (a firefly sprite, a tiny mermaid-like glow fish, a small caped hero sprite) is more to love but more art. *Default: one companion for the prototype, a choice later if it earns its place.*

7. **Any other devices?** Jane's phone, an iPad? The layout will be tuned for the iPhone 16 Pro first and should adapt, but I will test for what you actually use. *Default: your iPhone only.*

---

## 3. The game

### 3.1 Name and world

**Working name: Glimmerfall.** Gems fall and glimmer; the word is soft to say and reads well under a home-screen icon. Harper will know it by its icon (a glowing gem), not its name. Alternatives if you dislike it: *Lanternlight*, *Starseed*, *Twinklefall*. I have not found an existing game called Glimmerfall, but I will do a proper trademark check before you install it anywhere permanent.

**The world:** a night-time world of light. The map is a winding path of lanterns through a sequence of magical places. Each level is a lantern on the path. Finishing a level lights the lantern, and Harper's companion, a small glowing creature, hops forward to the next one. The world is original and leans on what carries over from her favourites without using any of them: gems, sparkle, fairies and mermaids and castles as *places* rather than characters, cute creatures, and "powers" with spectacular effects.

**Areas along the path** (each about ten lanterns long, cycling with variations forever):

| # | Area | Palette and mood | Ambient details |
|---|------|------------------|-----------------|
| 1 | Twinkle Meadow | Deep blue-green night, warm gold | Drifting fireflies, soft grass silhouettes |
| 2 | Crystal Cave | Indigo and violet, glowing crystal | Slow crystal shimmer, drip ripples |
| 3 | Mermaid Lagoon | Teal depths, bioluminescence | Rising bubbles, a glowing fish passing by |
| 4 | Cloud Castle | Dusky rose and lavender sky | Drifting clouds, castle lights far off |
| 5 | Star Garden | Deep indigo, constellations | Stars that connect into shapes slowly |
| 6 | Aurora Peak | Night snow, northern lights | Aurora ribbons that breathe |
| 7 | Dragon Hollow | Warm ember glow in a dark wood | A tiny friendly dragon's sleepy glow |

Each area changes the background, the ambient details, the sound colour (a slightly different instrument voice), and brings at least one new discovery (Section 3.4).

### 3.2 The board and the pieces

**The loop is Candy Crush's loop**, unchanged: swap two adjacent pieces to line up three or more, matched pieces clear, pieces above fall, new ones drop in, cascades follow. No tutorial. The familiarity is the point.

**Pieces are gems, distinguished by shape as well as colour.** All are rounded and luminous, lit from within, on a deep background.

| Gem | Shape | Colour | In Calm mode | In Play mode |
|-----|-------|--------|--------------|--------------|
| Star | five-point star, rounded tips | warm gold | yes | yes |
| Heart | heart | rose pink | yes | yes |
| Drop | teardrop | sapphire blue | yes | yes |
| Leaf | leaf / petal | emerald green | yes | yes |
| Diamond | rhombus | amethyst violet | from area 2 | yes |
| Sunstone | rounded hexagon | coral orange | no | from area 4 |

Fewer piece types means more natural matches, more cascades, and more four- and five-matches. Calm mode uses four types in the first area and five afterwards. Play mode uses five, then six later. All of this is tunable and I expect to adjust it after watching her play.

**Board size and touch targets.** On the iPhone 16 Pro (393 points wide), a 7-wide board gives cells of about 51 points, comfortably above Apple's 44-point minimum. A 6-wide board gives 60-point cells. *Recommendation:* Calm mode uses a 6 by 7 board with the biggest, friendliest cells; Play mode uses 7 by 8, sometimes shaped. Both fill the width of the screen with the board centred vertically in the safe area below the Dynamic Island.

**Nothing else on the screen but the board, a small goal lantern at the top, and a dim moon in one corner** (the parent gate). No score, no move counter, no buttons she could get lost in.

### 3.3 Feel: motion, touch, feedback

This is the thing to get right first, and the prototype stage exists to tune it on your phone. The intent:

- **Swap:** 160 ms, eased in and out, with a slight lift and glow on the piece she is moving. An **invalid swap** slides out and settles back with a soft, slow ease and a single quiet low note. No shake, no buzz, no red.
- **Match:** matched gems brighten and bloom for about 120 ms, then dissolve into a few drifting sparkles over about 220 ms. Brightness ramps are capped so nothing ever flashes or strobes.
- **Fall:** gravity with real acceleration and a soft landing (a 5 or 6 percent squash and settle), staggered per column so a cascade reads as a wave, not a jolt. Each landing gets a very quiet low "thud" so the pieces feel like they have weight.
- **Cascades:** each step waits for the board to settle, about 350 to 450 ms per step, and each step plays the next note up a pentatonic scale, so a long cascade becomes a rising melody. Cascades of six or more steps also ripple a slow aurora across the background: a quiet "that was special" that costs nothing and never shouts.
- **Touch:** both **swipe-to-swap** (drag a quarter of a cell in a direction) and **tap-tap** (first tap lifts and glows a gem, second tap on a neighbour swaps; a tap elsewhere just moves the selection). Only the first finger down drives a gesture; extra fingers are ignored. Every touch, valid or not, produces a tiny soft ripple of light under the fingertip, so mashing never feels dead and never produces an error. Pieces that are not currently moving can be swapped while other columns are still falling, which keeps the game responsive to a quick child without ever corrupting the board, because all state changes run through one deterministic core (Section 4.2).
- **Hints:** after a pause (Calm: about 4 seconds, Play: about 10, adjustable), a valid swap glows gently and pulses at breathing pace. It prefers a swap that would create a power. It is an invitation, never a nag: no arrows, no sound.
- **Dead ends:** if no valid move exists, the gems quietly swirl and resettle into a new arrangement that is guaranteed to have one. Tests enforce this (Section 4.5).

### 3.4 Powers: the special pieces, and how she discovers them

Powers are the heart of the wonder, so they are a rich set, each with a distinct magical effect, and they arrive gradually along the map so there is always something new. All effects **flow**: waves of light, blooms, sweeps and ripples, never blasts. Each has its own musical phrase.

**How powers are made** (familiar shapes, so her Candy Crush knowledge carries over):

| Power | Made by | What it does when set off |
|-------|---------|---------------------------|
| **Comet** | four in a line | A comet with a trailing streak. Set off, it sweeps along its whole row or column as a wave of light, clearing gems one after another with a rising run of notes. The streak shows which way it will fly. |
| **Prism Orb** | five in a line | A slowly swirling orb of every colour (the "chocolate ball" she loves). Swap it with any gem and every gem of that colour across the board lights up and dissolves in a ripple spreading out from the orb, with a sparkling two-octave run. |
| **Bloom** | an L or a T | A closed flower bud. Set off, it blooms into a soft ring of light clearing the 3 by 3 around it, drifts down with the falling gems, then blooms once more, bigger. |
| **Lantern Sprite** | a 2 by 2 square | A tiny glowing creature. Set off, it flits in a curving path with a sparkle trail to something useful (a goal piece, a frost tile, or a gem that will start a cascade) and pops it. |
| **Starburst** | a plus shape | A radiant star. Set off, light sweeps outward along its row and column at once, a cross of light. (Later area; optional, see Section 7.) |
| **Moonrise** | a 2 by 3 block | A pearl like a small moon. Set off, a wide moonbeam sweeps slowly down the board, clearing a three-wide band and any frost in its path. (Rare; a later discovery.) |
| **Aurora** | six or more in a line | Very rare. The whole sky shimmers, and every gem of two colours dissolves in slow waves. A "legendary" discovery for a lucky day. |

**Combining two powers** (swap one onto another) is where the biggest moments live:

| Combination | Effect |
|-------------|--------|
| Comet + Comet | A cross of light: the whole row and column sweep at once. |
| Comet + Bloom | Three rows and three columns sweep in a slow, wide wave. |
| Bloom + Bloom | A giant bloom: a 5 by 5 flower of light that opens twice. |
| Prism Orb + Comet | Every gem of that colour turns into a comet, and they all fly in turn. |
| Prism Orb + Bloom | Every gem of that colour becomes a bloom and they open in a wave across the board. |
| Prism Orb + Prism Orb | The biggest moment in the game: a sunrise sweeps the whole board, every gem becomes light over about 2.5 seconds, with a slow warm swell and a full run of twinkling notes. Majestic, not loud. |
| Lantern Sprite + anything | The sprite carries the other power to the best spot on the board and sets it off there. |

**How she discovers them.** Powers unlock at milestone lanterns. Before a milestone, the matching shape simply clears normally. At the milestone level, the board **starts with the new power already sitting in it**, glowing with a soft halo, and the hint system draws her hand to it after a few seconds. The first time any power goes off, time slows slightly (about 0.7 times speed) and the sound is a little richer, so the moment lands. From then on the power is created by its shape as usual, and Calm mode's board bias (below) makes sure she keeps getting them.

Proposed unlock order along the first areas:

- Level 1: Comet (she already knows this one, so it is there from the start).
- **Level 5: Prism Orb.** Level 5 is the stop that thrilled her, and the colour-clear is her favourite, so this is where the "chocolate ball" arrives.
- Level 8: Bloom.
- Level 11 (Crystal Cave): first combination gift: a level starts with a Comet beside a Bloom.
- Level 15: Lantern Sprite.
- Level 21 (Mermaid Lagoon): Prism Orb + Comet gift.
- Level 25: Starburst (if we keep it).
- Level 31 (Cloud Castle): Moonrise.
- Level 41 onward: Aurora becomes possible.

**Making powers happen often in Calm mode.** When new gems fall in, with some probability (Calm: around a third of the time, Play: lower) the game picks a colour that sets up a four- or five-in-a-line one move away, rather than a uniformly random one. If she has gone several moves without making a power, that probability rises. Occasionally a ready-made power simply drops in with the refill as a small gift. None of this is visible as a mechanic; the board just feels generous. The tests check that the bias never creates a match on its own and never leaves the board without a move.

### 3.5 The journey: the map

- A winding vertical path of lanterns through the areas above. Lit lanterns behind her, unlit ones ahead (dimmer, never locked or padlocked, nothing greyed out as "not allowed").
- Her **companion** sits on the current lantern. After a level, the view eases out to the map, the companion hops forward along the path, the new lantern lights with a small bloom and a warm chord, the camera lingers about four seconds, then eases into the next level. She can tap to continue sooner.
- Crossing into a new area is a bigger moment: the scenery changes as she walks, the ambient sound shifts, and a small creature of that area appears to greet her (a firefly, a glowing fish, a sleepy dragon).
- The app never opens onto the map. The map is the transition between levels. *Recommendation:* she can also peek at the map by tapping her companion, which sits at the top of the board next to the goal lantern, and return by tapping anywhere. Easy to drop if it proves distracting (Section 7).
- The path is generated procedurally and is infinite. Areas cycle after the seventh with palette variations and new creature cameos, so the sense of "somewhere new" continues.

### 3.6 Two modes: Calm and Play

I agree Calm mode should be the default every time the app opens cold. The phone gets handed over mid-meltdown; nobody is going to open a menu first.

**Calm mode (default).**
- 6 by 7 board, four or five gem types, no obstacles, full rectangle.
- Generous powers (Section 3.4 bias), gifts dropping in, quick hints (about 4 seconds), quiet reshuffle on dead ends.
- Short levels: the goal is **lighting the lantern**. Every match pours a little light into the lantern at the top of the screen, powers pour a lot, and it fills after roughly ten matches (one to two minutes). There is no way to not complete it. Then the finishing sequence: the remaining gems twinkle and drift upward as motes of light into the lantern, the map transition plays, her companion hops forward, and the next level fades in. The whole cycle is about 90 seconds to two minutes, so she is rewarded with movement on the map often.
- A soft breathing glow (Section 3.8) runs around the edge of the board the whole time.

**Play mode (for calm times).**
- 7 by 8 board, sometimes shaped (a heart, a castle, a crescent), five then six gem types.
- Goals that need a little planning, shown as pictures, never numbers (Section 3.7).
- Obstacles that create interesting problems without threatening her.
- Slower hints (about 10 seconds), still a reshuffle on dead ends, still no way to lose.
- A gentle difficulty ramp as she travels, with a parent setting for the overall level (gentle / medium / bigger).

**How the modes relate: one path, one marker.** Every lantern on the map can be played as a Calm level or a Play level, generated from the same seed and theme with different parameters. She advances along the same path in both modes, the same powers unlock at the same milestones, and the same areas come and go. If she is mid-way through a Play level and the mode is switched to Calm, the current lantern becomes a fresh Calm level; the half-finished Play board is kept and comes back if the mode is switched back at the same lantern. I considered a separate gentle path or two markers and rejected both: a single journey is simpler for her to understand and avoids any sense that one mode is the "lesser" one.

**Switching modes, one-handed, in a car.** Through the parent gate (Section 3.9), the mode switch is the first and biggest control on the panel: two large tiles, Calm and Play, with the active one lit. Gate plus switch is about three seconds with a thumb. Below it sits the "Finish after this level" button, because those two are what you will reach for in a car.

**Launch rule** (Question 5): a relaunch within 10 minutes resumes the exact board, mode and position. A launch after a longer gap starts in Calm mode at her current lantern on a fresh board. A parent setting can change this to "remember the last mode".

### 3.7 Play mode: how it stays engaging with no way to lose

Candy Crush gets difficulty from scarcity (moves, lives). Without scarcity, challenge has to come from **space and sequence**: reaching awkward places, clearing things that need several steps, and using powers deliberately. Finishing is guaranteed eventually; the satisfaction comes from "I worked that out", and the pacing comes from the fact that harder goals simply take longer.

**Goals, all shown as pictures:**

- **Uncover the picture.** Frost (or moss, or sand, by area) covers part of the board and hides a picture: a sleeping creature, a sunken treasure chest, a castle window. Matching on a frosted tile clears a layer. The picture emerges as she clears, which is its own motivation to finish, and the reveal is the level's reward. Difficulty: corners and edges, double layers, frost only reachable through narrow parts of a shaped board.
- **Bring down the star-seeds.** One to three glowing seeds sit at the top. They fall like gems but do not match. When one reaches the bottom row it drifts out and sprouts a small glowing flower in the scene. Requires clearing beneath them: planning without pressure.
- **Free the creatures.** Small creatures (a firefly, a glow fish, a baby cloud) sit in bubbles. A match next to a bubble pops it and the creature flies up to join the scene at the top. Some bubbles are guarded by moonstone, which only powers can clear, which teaches deliberate use of powers.
- **Gather.** Collect gems of a shown type; a row of up to eight dim gem icons lights up one by one. Used mainly to mix with the others.

**Obstacles, all static. Nothing spreads, grows back, or counts down.**

- **Frost:** one or two layers, cleared by adjacent matches.
- **Vines:** hold a gem in place; matching that gem frees it.
- **Cloud puffs:** block falling gems, cleared by adjacent matches, so the board changes shape as she works.
- **Moonstone blocks:** immovable, only cleared by powers.
- **Shaped boards:** missing cells make some places hard to reach.

**Ramp.** The level generator has a handful of dials (board shape, number of types, frost layers, moonstone count, number of goals) and raises them slowly as the lantern number grows, with a reset to gentle at the start of each new area so each area begins easy and ends with a satisfying "big" level. Generated levels are checked by a solver bot before they are shown (Section 4.5).

**Optional "discoveries" collection.** A small sparkle-book, reached from the map, that shows the powers, combinations and creatures she has found so far. Purely additive: nothing is shown as missing, so there is no "incomplete" pressure. It gives Play mode a sense of accumulation without grades. I have put it at the end of the plan and in the judgment calls.

### 3.8 Endings and wind-down

The design goal is that stopping feels like the end of a story, and that you are never the one yanking the phone away.

**Three ways a session ends, all arriving at the same resting point:**

1. **The timer.** A session length (default 10 minutes of active play, adjustable from 5 to 30 or off) with a wind-down phase (default the last 2 minutes). Time only counts while the app is in the foreground and she is actually playing.
2. **"Finish after this level."** One large button on the parent panel. The current level becomes the last; wind-down begins immediately so the softening coincides with her finishing.
3. **"Finish now, gently."** A second button for when it has to be now. The remaining gems twinkle and drift up into the lantern over a few seconds, the lantern lights, and the ending sequence plays. Still no cut-off; it is the same ending, just sooner.

**What wind-down does.** Over the final two minutes the game softens, without announcing it:

- Motion slows by about 20 to 30 percent and eases more gently. Falls are a little floatier.
- Chimes drop an octave and get quieter; the optional ambient bed fades in very quietly and swells with the breathing rhythm.
- The background deepens toward night; stars come out; fireflies slow.
- The level goal shortens so the current level completes within the window, and powers are still generous.
- Screen brightness dims by 15 to 20 percent via a soft overlay.

**The resting point.** The last lantern lights, her companion hops forward on the map, curls up on the new lantern, and falls asleep, glowing in slow breaths. The map rests there. Stars twinkle slowly. A sparse, lullaby-like handful of notes plays and then fades to silence over about 30 seconds. Tapping the screen makes a star twinkle and a very soft chime, and nothing more: the game has gone to sleep, but the phone is not "dead" in her hands. After two minutes the chimes stop and the screen dims further; after ten minutes it settles to a near-black night with a few slow stars, releases the screen wake lock so the phone can auto-lock, and does almost no work (battery).

**Coming back.** The sleeping scene persists until a grown-up opens the gate and taps "New session", or until a set time has passed (default 30 minutes, adjustable, or "until a grown-up unlocks"). So if she closes and reopens the app herself, she sees her sleeping companion, not a new level.

**The breathing glow.** You asked whether a glow that breathes at a calm pace would help. My view: it is worth having, with modest expectations. There is reasonable evidence that slow visual rhythms nudge breathing in adults; for a five-year-old it is at least a calm, consistent thing in the periphery of her vision, and it costs nothing. I would run it at about 8 breaths per minute (a 7-second cycle, slightly longer out than in), which is slower than a child's resting rate but not so slow that it reads as unrelated to breathing. It is always subtle during play (a soft vignette around the board in Calm mode), becomes the dominant rhythm during wind-down and rest, and is never labelled, instructed or counted. It is a parent toggle.

### 3.9 The grown-up gate and settings

**The gate: two deliberate steps, the second needing reading.**

1. **Hold the moon.** A small, dim moon sits in a corner (top-left, clear of the Dynamic Island). Hold it for 1.5 seconds and a thin ring fills around it. Letting go early, or a second finger landing, cancels quietly. A child will sometimes do this, which is why there is a second step.
2. **Tap the word.** A small panel shows six word tiles (for example MOON, STAR, LEAF, FISH, SNOW, GEM, shuffled every time) and the instruction "Tap the word: STAR". You read and tap. A pre-reader cannot. A wrong tap simply fades the panel out with no sound and the gate stays quiet for 20 seconds. Two wrong taps and it stays quiet for a minute.

Both steps together take a grown-up about 2.5 seconds with one thumb. If Harper starts matching written words (Question 1), the second step becomes a 4-digit PIN with the same quiet failure behaviour. I considered a plain long-press plus a swipe, and rejected it: an upset child holds and swipes.

The panel closes itself after 30 seconds of inactivity, and closing it never disturbs the board.

**What is on the panel** (text is fine here; big targets, the important ones in thumb reach at the bottom):

- **Mode:** Calm / Play (two large tiles).
- **Finish after this level** and **Finish now, gently**. Then **New session** when resting.
- **Session:** length (5 / 10 / 15 / 20 / 30 / off), wind-down on/off, rest-until (15 / 30 / 60 min / unlock), launch rule (Calm on launch / remember last mode).
- **Sound:** on/off, level (soft / normal), ambient bed on/off, "play even when iPhone is on Silent" (see 3.11).
- **Feel:** hint delay (quick / normal / slow / off), breathing glow on/off, reduced motion (follow iPhone / on / off), haptic tick (if it proves workable).
- **Night dimmer:** a slider that dims the whole game below the iPhone's minimum brightness, for dark cars and cabins.
- **Play difficulty:** gentle / medium / bigger.
- **Map position:** set the current lantern number. This is the recovery tool if the phone ever loses local data or you move to a new phone, so she never loses her journey.
- **Reset progress** (double confirmation).
- **About:** version, build date, "ready offline" status.

### 3.10 Visual direction: three options to see on your phone

Before any real art, I will build three quick mockups you can open on your phone: each shows a full board, one power going off as a looping animation, and a glimpse of the map, all rendered with the same code that the real game would use, so what you see is honest.

1. **Deep Night Garden** (my recommendation). A deep indigo-to-midnight background with a soft vignette and drifting fireflies. Gems are translucent, lit from within, with a soft bloom halo, a gentle specular highlight and a rim of light, in rich jewel tones: rose, gold, sapphire, emerald, amethyst, coral. Lanterns and the goal glow warm gold. Cells are barely-there rounded glass. Warm, luminous, and very comfortable in the dark.

2. **Stained-Glass Lantern.** Gems as faceted, translucent stained glass with fine dark leading and light shining through from behind, on a background like the inside of a warm lantern. Bolder and more graphic, very shape-forward, strong contrast. Reads beautifully at a glance; risk is that it feels slightly less soft.

3. **Aurora Crystal.** Crisp, faceted crystals with cool iridescence (teal, violet, aqua, with gold for the star) on a night sky with slow aurora ribbons. Cooler and more "ice magic". Striking in the dark; risk is that it is less warm and cosy than the first two.

All three share the same shapes, the same motion and the same rules, so choosing one is purely about look. The mockups will also let us check legibility of the six gem types side by side at the real size on your screen.

### 3.11 Sound

**Direction.** Warm, musical, generated entirely in code with the Web Audio API, no audio files. Every sound sits on one pentatonic scale (G major pentatonic: G, A, B, D, E) across a comfortable two and a half octaves, so nothing is ever dissonant and simultaneous sounds always agree.

- **Match:** a marimba-like tone (a soft fundamental with a woody upper partial and a quick decay) through a gentle, short reverb. Cascade steps climb the scale.
- **Power set off:** a quick rising arpeggio of five to eight notes. Prism Orb: a sparkling two-octave run plus a soft pad swell. Orb + Orb: a slow swelling chord over 2.5 seconds with twinkles. Richer, never louder.
- **Swap:** a soft, tiny tick. **Invalid swap:** one quiet low note. **Landing:** a very quiet low thud, with at most a few per settle so nothing becomes mush.
- **Level complete:** a short, warm resolving phrase. **New area:** the same phrase in that area's instrument colour (celesta-like in Crystal Cave, watery and softened in the Lagoon, and so on).
- **Ambient bed (optional):** a very quiet, slowly moving pad in G, with its swell tied to the breathing glow. Off by default during play (it is the thing most likely to bother strangers in public), on very quietly during wind-down and rest. Both are parent toggles.

**Loudness.** A master limiter caps output; the first sound after launch fades in over about 1.5 seconds so there is never a sudden first note; a parent "soft / normal" level sits below the iPhone's volume. It is mixed to sound good at low volume, and the game is fully playable with sound off: every sound has a visual twin.

**Your iPhone's Silent mode, and headphones.** This is how iOS actually behaves, confirmed against current WebKit:

- By default, web audio runs in iOS's "ambient" audio session. On the iPhone's own speaker it **follows Silent mode**: toggle Silent on (Action Button or Control Center) and the game is silent. I recommend keeping this default, because it gives you a physical, zero-UI mute in a quiet cabin, and it means the game cannot surprise anyone.
- With **headphones or AirPods**, ambient audio plays even in Silent mode (iOS treats headphones as private), at the iPhone's volume. If AirPods disconnect mid-session, iOS interrupts the audio session; the game detects this and resumes sound on her next touch.
- Ambient audio **mixes** with other audio, so if you are playing a podcast in the car the game chimes over it rather than stopping it.
- **Car Bluetooth / CarPlay:** if the phone is connected to the car, iOS routes the game's sound to the car speakers like any app, and treats it like headphones, so Silent mode will not mute it there. The game cannot choose an output device. The in-panel sound switch is the control for this, which is why it is one tap behind the gate. (Question 2.)
- **Optional "play even when on Silent":** Safari 17 and later let a page ask for the "playback" session type, which ignores Silent mode. I will offer this as a parent setting, off by default. It may pause other audio playing on the phone, which is why it is not the default.
- Phone calls interrupt the audio; the game pauses its animation while hidden and resumes everything when it comes back.

### 3.12 Haptics

There is no proper haptics API for web pages on iOS; Safari has never shipped the vibration API. One trick exists: iOS plays a system "tick" when an iOS-style switch control is toggled, and a page can hide such a switch and toggle it in response to a touch. It gives a single, fixed, light tick, it only works inside a real touch event, and Apple has been narrowing it (iOS 26.5 reduced what it can do). So: I will build it as an experiment behind a parent toggle, off by default, tied to matches only. If it feels good on your phone and survives updates, keep it; if not, we lose nothing. A native wrapper would give real haptics (Section 4.1), but I do not think it is worth the cost for this alone.

---

## 4. Technical approach

### 4.1 Why a PWA, and what it cannot do

A home-screen web app is the right choice here, and the alternatives are worse for this use:

- **Native app via TestFlight** needs a paid developer account, builds expire after 90 days, and every update is a round trip through Apple. For a tool Harper will lean on for a long time, that is friction in exactly the wrong place.
- **A native wrapper (Capacitor) around the same web code** is the fallback if we ever truly need real haptics or an orientation lock. It would reuse almost all the code. I would only do it if the prototype proves haptics matter to her.
- **A PWA** installs from Safari in ten seconds, updates on every push, works offline with a service worker, and on an iPhone 16 Pro has far more than enough performance for this game.

**What the web app genuinely cannot do, and what covers it** (full steps in Section 5):

| Cannot | Covered by |
|--------|------------|
| Block the home gesture, Control Center, Notification Center, the Dynamic Island, or the side/volume buttons | **Guided Access** disables all of these and locks the phone to the game |
| Stop notifications or calls appearing over the game | Guided Access blocks them; a **Focus mode** covers the times you do not start Guided Access |
| Lock the orientation (iOS ignores a web app's orientation request) | Control Center **Portrait Orientation Lock**, or Guided Access with **Motion** off. The game also lays itself out sensibly in landscape so nothing breaks |
| Real haptics | The experiment in 3.12; otherwise none |
| Choose the audio output device | Silent mode, the panel switch, or Control Center |
| Guarantee local data is never cleared | iOS keeps installed web apps' data separate from Safari and does not apply its 7-day cleanup to them, so risk is low; the **Map position** setting restores her journey in a minute if it ever happens |
| Launch with zero system frames | iOS shows a plain launch background for a fraction of a second; I will set it to the game's night colour so it reads as the game appearing |

### 4.2 Stack and architecture

**Zero runtime dependencies.** TypeScript for the code, Vite to bundle it (one development dependency), Vitest for tests. No frameworks, no game engine, no audio library, no asset pipeline. The whole app ships as a handful of files under about 300 KB.

**Rendering:** a single full-screen `<canvas>` using the 2D context at device pixel ratio. Gem sprites, glows and halos are drawn once into offscreen canvases at launch (gradients, highlights and soft glows baked in), then composited with additive blending for light effects. Particles are capped. The slow background elements (breathing vignette, fireflies, twinkles) are CSS animations on ordinary elements, which the compositor runs cheaply, so the canvas only draws frames while the board is actually moving. When nothing moves, nothing is drawn.

**Game core as a pure, deterministic library** (`board`, `match`, `gravity`, `powers`, `levelgen`, `hints`, `shuffle`): given a board and a move, it returns the new board plus an ordered list of events (matched here, fell from here to there, power fired along this line, lantern filled by this much). It uses a seeded random generator, so every behaviour is reproducible in tests. The presentation layer turns events into animation and sound and never touches game rules. This separation is what makes mashing and multi-touch safe: input is reduced to a queue of candidate swaps, and the core either applies a swap or ignores it; there is no state that can get half-updated.

**Audio:** a small synthesiser module (oscillators, envelopes, a procedurally generated reverb impulse, a master limiter) and a "voice" table per area. Sounds are scheduled on the Web Audio clock so they line up with the animation.

**Save state:** the complete game state (board, mode, lantern, unlocked powers, timers, settings) is serialised to `localStorage` after every settled move. It is a few kilobytes and the write is synchronous, so a kill at any moment loses at most the animation in flight. A mirror is kept in IndexedDB as belt and braces. The save has a schema version so updates can migrate it.

### 4.3 Instant start, resume, offline, silent updates

- **Instant start:** tiny bundle, critical styles inline, everything served from the service worker's cache, straight into the current level. Target: playable within about a second of the icon being tapped on a warm phone.
- **Sound unlock:** iOS requires a touch before a page may make sound. The game creates its audio on her first touch anywhere on the board, so her first natural swipe is the unlock, and the first sound fades in rather than starting abruptly.
- **Resume:** on launch, the saved state is restored and the exact board is drawn before the first frame. The launch rule in 3.6 decides whether a long-absent Play board is set aside for a Calm one.
- **Offline:** a hand-written service worker (about a hundred lines, no library) pre-caches the whole app on first visit and serves everything from cache after that. The app makes no network requests of its own, ever. The only traffic is the browser fetching the app and checking for updates.
- **Silent updates:** when a new build is published, the service worker downloads it in the background and keeps it waiting. It becomes active on the next cold launch, never mid-session, and there is no prompt. All files of a build are cached together under one version so a half-updated mix can never be served. The parent panel shows the build date so you can confirm what is installed.

### 4.4 Hardened input, screen, battery, performance, accessibility

- **Portrait:** laid out for portrait; in landscape the board simply shrinks to fit and the game keeps working. Real locking comes from the phone (Section 5).
- **No zoom, no refresh, no selection, no callouts:** the whole page is a fixed, non-scrolling layer with browser touch handling disabled on the game surface, selection and long-press callouts disabled, and pinch and double-tap handled by the game rather than the browser. Installed web apps have no pull-to-refresh or address bar, and the game has no links at all, so there is nowhere to navigate.
- **Stray touches:** pointer events are tracked by finger; only the first finger down drives a gesture, extra fingers do nothing, and a lost touch (a finger sliding off the edge) simply cancels. Edge swipes land on nothing. A fuzz test fires hundreds of thousands of random taps and swipes at the core and checks that the board is always full, never has a stuck piece and always has a move.
- **Screen:** the Screen Wake Lock API (supported on iOS Safari since 16.4) keeps the display on during active play, re-requested whenever the app returns to the foreground, and released during rest. Guided Access's own auto-lock setting is the belt to this brace.
- **Battery:** no frames drawn when nothing moves, CSS animations for the slow background, no timers running while hidden, wind-down and rest dim the screen and reduce animation, and rest ends in a near-static night scene.
- **Performance:** target a steady 60 frames per second on the iPhone 16 Pro including the largest combined effects. Baked sprites, additive compositing without runtime blur, capped particles, and a per-frame budget checked in profiling on your actual phone before each stage is called done.
- **Accessibility:** the iPhone's Reduce Motion setting is respected automatically (shorter, fade-based transitions, fewer particles, no slow-motion), with a parent override. All brightness changes are rate-limited so nothing strobes regardless of what the board does.

### 4.5 Tests

Vitest unit and property tests over the pure core, run on every push before deployment:

- Match detection: lines of three, four and five, horizontal and vertical, L, T, plus, 2 by 2 and 2 by 3 shapes, overlapping matches, and the power each shape creates.
- Gravity and cascades: pieces fall correctly in rectangular and shaped boards and around cloud puffs; cascades resolve to a stable board with no matches remaining; event lists are in a valid order.
- Powers: every power's clear pattern; every combination's effect; chain reactions (a comet that hits a bloom sets it off); the slow-motion and sound events are emitted exactly once per discovery.
- Board generation: across tens of thousands of seeds and every board shape and type count, no fresh board starts with a match, and every fresh board has at least one valid move.
- Reshuffle: for boards constructed to have no moves, the reshuffle keeps every piece, creates no match, and always yields at least one valid move.
- Generator bias: the generosity bias never itself creates a match and never leaves the board without a move.
- Level completability: every generated Play level passes two checks. A static one: every goal cell can be part of some line of three on that board shape. A dynamic one: a simple bot playing valid moves (preferring goal progress, with reshuffles when stuck) completes the level within a move bound, across many seeds and every difficulty setting.
- Save and resume: any state serialises and restores to an identical board; old schema versions migrate.
- Input fuzz: random tap and swipe storms against the core never corrupt the board.

I will add a Playwright smoke test later (the environment has Chromium) that loads the built app, plays a few moves and checks the service worker caches everything.

### 4.6 Getting builds onto your phone

**Recommendation: GitHub Pages, deployed by GitHub Actions on every push to `main`.** It is free, it is HTTPS (which a PWA needs), and it is the least work for you: one setting to flip once, then every build is live about a minute after I push.

The URL will be `https://dustyshelf2455.github.io/HarperCrush/` (or the new name if the repo is renamed; see Question 3).

**What you need to do, once:**

1. Open the repository on github.com, then **Settings** (the repo's settings tab, not your account's).
2. In the left sidebar choose **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**. There is nothing else to pick.
4. The repository currently has no `main` branch (only the two `claude/...` branches). Once you approve this design, I will create `main` from the approved branch and push it. Then in **Settings → General → Default branch**, switch the default to `main`. That is the branch the deployment watches.

**Then, each time I push a build:**

- Within about a minute the **Actions** tab shows a green check and the site is updated.
- If the game is already installed on your phone, close it fully (swipe it away in the app switcher) and open it twice: the first launch downloads the new build in the background, the second runs it. The build date in the parent panel confirms it.

For the visual mockups I will publish them under `/mockups/` on the same site so you can open each on your phone.

---

## 5. iPhone setup: exact steps

These are written for iOS 26. iOS 27 should be the same or very close; if a menu is named slightly differently, it will be in the same place. I will re-check each of these on your phone's actual version during the prototype stage.

### 5.1 Install the game on the Home Screen

1. Open **Safari** and go to the game's URL.
2. Tap the **share** button (the square with an arrow). On the new iOS 26 Safari, it is behind the **"..."** menu at the end of the address bar; tap that, then **Share**.
3. Scroll down the share sheet and tap **Add to Home Screen**.
4. Make sure **Open as Web App** is turned **on**. (This is new in iOS 26. Off makes a plain bookmark that opens in Safari with the address bar, which we do not want.)
5. Tap **Add**. The icon appears on the Home Screen. Open the game from that icon, never from Safari, so it runs full screen.

If you move the icon into a folder or the dock, nothing changes.

### 5.2 Guided Access: lock the phone to the game

Guided Access is the single most useful thing here. It disables the home gesture, Control Center, Notification Center, the Dynamic Island, notifications and incoming calls, and can disable the side and volume buttons and screen rotation.

**Set it up once:**

1. **Settings → Accessibility → Guided Access**, and turn **Guided Access** on.
2. Tap **Passcode Settings → Set Guided Access Passcode** and choose a code Harper will not know. Turn on **Face ID** so you can end a session by looking at the phone.
3. Back in Guided Access, set **Display Auto-Lock** to **Never** (or 15 minutes if you prefer; the game also keeps the screen awake itself while she plays).
4. Turn on **Accessibility Shortcut** so a triple-click of the side button starts Guided Access.

**Start a session (about three seconds, one-handed):**

1. Open the game.
2. **Triple-click the side button.** The Guided Access screen appears.
3. The first time only, tap **Options** (bottom-left) and set: **Side Button off**, **Volume Buttons** your choice (off if she tends to crank it), **Motion off** (prevents rotation), **Keyboards off**, **Touch on**, **Time Limit off** (its ending is an abrupt system alert with a sound, which is exactly what we are designing away). Tap **Done**. These are remembered for next time.
4. Tap **Start** (top-right).

**End a session:** triple-click the side button, authenticate with Face ID or the passcode, then tap **End** (top-left). If you prefer, you can tap **Resume** to keep going.

Tip: you can also put Guided Access into Control Center if you would rather tap than triple-click: open Control Center, long-press an empty area, tap **Add a Control**, and add **Accessibility Shortcuts**.

### 5.3 A Focus mode so nothing pops over the game

Guided Access already blocks notifications. This covers the moments you hand the phone over without starting it.

1. **Settings → Focus**, tap **+** (top-right), choose **Custom**.
2. Name it **Harper**, pick a colour and a glyph (the moon or a star), tap **Next**, then **Customize Focus**.
3. Under **Allowed Notifications**, tap **People**: choose **Allow Notifications From** and add Jane (and anyone whose call you must take). Turn on **Allow Repeated Calls** so a true emergency gets through. Then tap **Apps** and allow none.
4. Under **Options**, turn **Show on Lock Screen** off, **Dim Lock Screen** on, and leave **Hide Notification Badges** on.
5. To turn it on quickly: swipe down from the top-right for Control Center, tap the **Focus** tile, tap **Harper**. To make it one press: **Settings → Action Button**, choose **Focus**, select **Harper**. (This replaces Silent mode on the Action Button; Silent is still one tap away in Control Center. Your call.)

### 5.4 Other settings worth checking

- **Portrait Orientation Lock:** Control Center → the padlock-with-arrow tile. Leave it on. (Guided Access with Motion off also prevents rotation.)
- **Back Tap:** Settings → Accessibility → Touch → Back Tap. Make sure both are **Off**, or a thump on the back of the phone could trigger a screenshot or Control Center.
- **Siri by side button:** Guided Access disables the side button. Outside Guided Access, a long hold brings up Siri; nothing to do about that except Guided Access.
- **Screen Time:** if you use Content Restrictions for web content, add the game's address to **Always Allow**, or the game will be blocked.
- **Do not clear Safari website data** (Settings → Apps → Safari → Clear History and Website Data) while the game is installed; on current iOS the installed app's data is separate, but it is the one action that could plausibly touch it. If progress is ever lost, the panel's **Map position** setting puts her back on her lantern.
- **Brightness in the dark:** the game has its own night dimmer. iOS's **Reduce White Point** (Settings → Accessibility → Display & Text Size) is a good extra for a dark cabin.

---

## 6. Build plan

Each stage ends with something you can open on your phone and react to. I will not start a stage until the previous one has had your feedback, except where the next stage is pure infrastructure.

**Stage 0: design (this document).** You confirm the understanding, answer the questions, pick a direction or ask for changes.

**Stage 1: look and pipeline.** Repo skeleton (TypeScript, Vite, Vitest), the GitHub Pages deployment, and the three visual mockups under `/mockups/`, each a full board at real size with one power animating and a glimpse of the map. You pick a direction. *You do: the one-time Pages setting and default branch.*

**Stage 2: the feel prototype.** A playable Calm-mode board with the chosen look: 6 by 7, five gem types, swipe and tap-tap, gravity, cascades, hints, reshuffle, the full sound set for matches and cascades, and two powers (Comet and Prism Orb) with their effects and sounds. Installable, offline, saves and resumes. The core tests for matching, cascades, generation and reshuffle. This is where we tune weight, timing and sound on your phone until it feels right. *You do: install it, play it yourself first, then let Harper try it in a calm moment.*

**Stage 3: powers, journey and the gate.** The remaining powers and all combinations, discovery gifts and slow-motion first-firings, Calm-mode lantern goals and level completion, the map with areas and the companion, the parent gate and panel with mode, sound, hints and the Finish buttons. The launch rule.

**Stage 4: Play mode.** The level generator with shaped boards, frost, vines, cloud puffs and moonstone, the four goal types, the difficulty ramp and setting, and the completability tests.

**Stage 5: endings.** The session timer, wind-down softening, the resting scene, the breathing glow, the rest-until rule, the night dimmer, and the battery behaviour that goes with them.

**Stage 6: polish and hardening.** Performance profiling on your phone during the biggest effects, Reduce Motion, the haptics experiment, the ambient bed, area creatures and cameos, the optional discoveries book, launch background and icons, a Playwright smoke test, and a README with the iPhone setup from Section 5 kept up to date.

Throughout: tests run on every push, and every push to `main` deploys.

---

## 7. Judgment calls for you

Things where I have a recommendation but you may feel differently:

1. **Calm on every cold launch, Play only until you have been away 10 minutes** (3.6). The alternative is to remember the last mode.
2. **Cell size versus board size.** 6 wide in Calm mode (60-point cells) and 7 wide in Play. If you would rather one consistent board, 7 wide works for both.
3. **Peeking at the map by tapping the companion** (3.5). Nice for anticipation; drop it if she gets lost there.
4. **The rest scene responds to taps with twinkles** (3.8) rather than being completely still. I think a gently responsive sky is a better bridge to handing the phone back than a dead screen, but a still scene is a one-line change.
5. **Rest lasts 30 minutes, then a cold launch starts fresh** (3.8). The strict alternative is "only a grown-up can restart", which protects the ending but costs you the gate every time.
6. **Sound follows Silent mode by default** (3.11), with "play even on Silent" as an option.
7. **Ambient bed off during play, on quietly during wind-down** (3.11).
8. **Word gate versus PIN** (3.9), depending on Question 1.
9. **Starburst** (the plus shape) is the one power whose shape is close to Bloom's T. It adds a discovery; it also adds a subtle rule. I lean toward keeping it as a later-area discovery, but it is the first thing I would cut.
10. **The discoveries book** (3.7): additive and gentle, but it is a screen that is not the board. I have placed it last and would only add it if Play mode wants more sense of accumulation.
11. **Haptics experiment** (3.12): off by default; worth ten minutes to try.
12. **Repository rename** before the first install (Question 3).

---

## 8. What happens next

Reply with corrections to Section 1, answers to Section 2 (or "defaults"), and any changes you want to Sections 3 to 5. Then I will start Stage 1: the repo skeleton, the deployment, and the three mockups for your phone. The one-time Pages setting (Section 4.6) can be done any time before then.
