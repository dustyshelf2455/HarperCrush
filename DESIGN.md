# Glimmerfall: design proposal

*Proposal v0.3. Written 3 October 2026 in response to BRIEF.md; updated 4 October with your answers to the seven questions (Section 2) and again after an independent review pass against the brief. Nothing has been built yet; this is the "settle the design first" step.*

How to read this: Section 1 is my understanding of the goal, so you can correct me. Section 2 records the seven questions that would change the design and the answers you gave, with what each changed. Sections 3 to 5 are the design itself and the practical setup. Section 6 is the build plan, Section 7 lists the judgment calls I would like you to weigh in on, and Section 8 says what I need from you before Stage 1 starts. Everything in here is a proposal, not a commitment to a specific detail, and I have tried to say "recommendation" wherever I am choosing between real options.

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

## 2. Decisions: the seven questions and your answers

Asked and answered on 4 October 2026. Each answer is now folded into the sections it affects.

1. **Can Harper match written words or digit sequences yet?** *Not yet.* The grown-up gate stays as hold-the-moon then tap-the-named-word (3.9). When she starts matching words, it switches to a 4-digit PIN with one setting.

2. **Is the phone connected to the car while she plays?** *Sound over the car speakers is fine, and can be very calming for her. And the game needs music.* Two changes: sound defaults on, with Silent mode on the phone still acting as the mute on the phone's own speaker; and the game gets a real, generated soundtrack rather than an optional ambient bed (3.11). You asked to hear options before choosing a musical feel, so Stage 1 adds music sketches to the mockup page (Section 6).

3. **Rename the repository so the URL carries the game's name?** *Yes, to `glimmerfall`.* You rename it in the repo's GitHub Settings before anything is installed on your phone, because GitHub does not redirect the old site address after a rename (4.6). The site itself is built with relative paths, so the mockups work at either address and nothing waits on the rename except installing.

4. **Default session length and wind-down?** *10 minutes, with the last 2 softening.* Session length is adjustable in the panel and wind-down can be switched off; the softening is always the last 2 minutes (3.8, 3.9).

5. **Should Play mode survive a relaunch?** *Calm after 10 minutes away.* A relaunch within 10 minutes resumes the exact board and mode; a longer gap starts in Calm mode on a fresh board at her current lantern, and a half-done Play board is kept for when you switch back (3.6).

6. **One companion creature or a choice?** *Harper picks on the map.* Three creatures wait by the path on her first visit to the map, and she chooses by tapping one, with no reading. She can change her mind later at the start of each new area (3.5).

7. **Which devices?** *Your iPhone 16 Pro only.* Layout, safe areas and performance are tuned for it. The game will still adapt to other screens, but I will not spend time testing them.

---

## 2b. Stage 1 decisions (4 October 2026)

After seeing the mockups on the phone you chose:

- **Look: Deep Night Garden.** Your note: the soft, gauzy glow can read as fuzzy rather than dreamy and serene, so the Stage 2 build sharpens it: smaller and fainter halos, crisper rims and highlights, and less diffuse background glow, keeping the warmth.
- **Music: music-box lullaby**, as the default soundtrack.
- **Art note:** the companion creatures and the path art are basic and need real taste and polish. They stay placeholders through Stage 2 (the feel prototype shows only the goal lantern and companion) and get a proper art pass in Stage 3, when the map is built.

## 2c. Stage 3 decisions (4 October 2026)

Made while building Stage 3, where the design above left room. Say if any of these feels wrong; each is a small change.

- **The remaining combinations** (Moonrise, Starburst and Aurora with the others) are now in the table in 3.4. The rule of thumb: Moonrise pairings widen the beam, Starburst pairings add rays, Aurora pairings add a colour wave, the Orb turns every gem of a colour into the other power, and the Sprite carries the other power to the best spot. Two-power effects fire from the cell her finger ended on.
- **The Lantern Sprite pops the gem it flies to and the gems touching it**, up to five cells, rather than one gem. One gem alone was too small a moment for a power. Until Play mode brings goal pieces, "something useful" is the gem whose popping starts the biggest cascade, chosen deterministically, so the flight always leads somewhere.
- **The Bloom's second opening** is a rounded flower of thirteen cells (every cell within two steps), visibly bigger than the first 3 by 3.
- **Gifts** are placed without changing a single gem's colour, so a gift board obeys the same no-match and has-a-move rules as any other, and always sits one swap from going off. Level 1 gifts the Comet, as the unlock list says. The hint ranks a swap of two powers above a swap that sets one power off, so on a combination gift's board it always shows the combination; and if the lantern fills first, the finishing light swaps the pair so the combination is what she sees.
- **The Orb unlocks at lantern 5** like every other power: until then five in a line makes a Comet, as a four does. (The Stage 2 prototype made Orbs from the start.)
- **Calm mode gem types follow 3.2**: four in Twinkle Meadow, five from Crystal Cave on. The Stage 2 prototype you played used five from the start; the first area is now a little more generous with natural matches. Easy to change back (one line in `journey.ts`).
- **Play mode is provisional in Stage 3** so the mode switch is real and testable before Stage 4: a wider 7 by 8 board, five gem types (six from Cloud Castle), a thinner power bias, hints after about 10 seconds, and a longer lantern of sixteen matches. Stage 4 replaces the goal with the picture, seed, creature and gather goals in 3.7. The two switching rules in 3.6 are built as designed: Calm to Play takes effect at the next lantern, Play to Calm is immediate and keeps the half-done Play board for later.
- **The Finish buttons are provisional**: after the lantern lights and the companion hops, it curls up and falls asleep on the new lantern and the map rests there, responding to taps with a twinkle, until a grown-up opens the gate and taps "New session", or until 30 minutes have passed (the rest-until default), after which the launch rule applies. The softening, dimming and timing of 3.8 arrive in Stage 5.
- **Companion choice** is offered on the first visit to the map (after level 1) and at the first lantern of every area; the map lingers about eight seconds on those visits and does not move on while a finger is down.
- **Area voices** (3.11): celesta in Twinkle Meadow, a struck-crystal "glass" voice in Crystal Cave, a softened under-water tone in Mermaid Lagoon, a gentle horn in Cloud Castle, a harp in Star Garden, a shimmering bell on Aurora Peak, a warm kalimba in Dragon Hollow. The tune stays the music-box lullaby in every area with small variations.
- **The grown-up gate** opens from the dim moon in the top-left corner exactly as 3.9 describes: a 1.5-second hold, then "Tap STAR, then MOON" style word tiles. Wrong taps make the gate quiet for 20 seconds, twice for a minute.

## 2d. Stage 3 play-test decisions (5 October 2026)

Made after the parent's first full play-test of Stage 3 on the phone. The play-test notes and the plan are in the project's `playtest/` folder.

- **The map stays until she taps the lit lantern.** The four-second (eight on companion visits) linger in 3.5 went by too fast to see. Now the companion hops, the lantern lights, and the map waits; after a couple of seconds the new lantern breathes softly as the invitation. A tap on the lantern, its light or her companion starts the next level; a tap anywhere else twinkles and the map stays. The creature offer no longer has a timer either.
- **One game, Calm as a switch.** The parent described how the app will really be used: Harper plays her one journey (Play), picks it up where she left it, and in a hard moment he hands her the phone saying "resume your level". So the two modes of 3.6 become one game with a Calm switch over it. The app opens as it was left, however long the gap (the launch rule in 3.6 is gone), and a fresh journey opens in Play. The Calm switch on the panel turns on the gentle board (6 by 9, fewer gem types, generous powers, the shorter lantern, quick hints) at once, keeping the half-done Play board for later; turning it off waits for the next lantern, as 3.6 says. Progress counts either way. Saves from Stage 3 carry her lantern, companion and discoveries across and open in Play on a fresh board.
- **The session timer, now rather than in Stage 5.** A length on the panel (off, 5 to 30 minutes; the parent's example is 20). Time counts only while she is actually playing in the foreground, and carries across a relaunch within half an hour. The last four minutes (or half of a short session) are the sleepy stretch: the motion slows by about a fifth, the scene dims, the music winds down, the lantern fills twice as fast so the current level ends within the window, and the level becomes the last. When the time is up, the gems drift into the lantern and the map rests with her companion asleep, exactly as the Finish buttons do. Nothing is announced; the sleepiness is the warning. "Keep playing" on the panel waves the timer off for that session; New session starts it again.
- **Replaying a lit lantern.** On the map, a tap on a lit lantern behind her plays that level again (with that lantern's gift and powers). Her own lantern does not move; when the replay ends the map comes back to it, and a tap on it continues the journey.
- **More wonder in the moments that exist.** The level-win rise now lasts about two seconds and lights the board's rim: the edge glows and two points of light run around it with soft tails and twinkles while the gems drift into the lantern. A power sitting on the board calls to be used: an aura in its own colour breathes beneath it and the gem swells very slightly at breathing pace; the comet's streak is a wide tinted band with a bright core and sliding sparks, so it reads as a comet at a glance. Every power's firing starts with a soft ring and a handful of sparkles in the gem's light.
- **Haptics: tried and dropped (7 October).** The iOS switch trick only ever ticked on a tap-tap swap, since a swipe produces no click, so the tick was also asked for on the release of a swipe that made a valid swap. On the phone it gave nothing at all, on taps or swipes, inside the home-screen app. Haptics are not reachable from a web app on the current iOS, so the hidden switch, its label over the board and the panel toggle were removed; touch goes straight to the board canvas again. Real haptics would need the native wrapper (4.1), which is not planned.
- **The art pass, round one.** The map: a road twice as wide, lanterns and creatures a third bigger, three rolling hill bands in the area's ground colours with a faint crest of its light, a field of slow stars over every sky, and seeded tufts, flowers, mushrooms and stones in the area's colours beside the path (the same stretch always looks the same). The firefly: fairy-like two-lobed wings with a sheen, veins and a glint, three sparks of light drifting round its belly, a warm rim of light under its head. The gems: a deeper body with a brighter heart, cut facets (an inner table and fine lines to the corners), a bounce of their own colour along the lower edge, a double rim and a four-point glint. More rounds follow the parent's eye.
- **Art round two: painted pictures (5 October, afternoon).** The parent judged the code-drawn art "quite basic" and asked where a real game's polish comes from. The answer: painted images in one consistent style, which code cannot produce; light and motion, which the game already has. Decided: relax the brief's "all art in code" rule for the pictures only. The parent set up an OpenAI image key on the project's cloud environment (prepaid credit, no auto-recharge, so spending has a hard ceiling) and the images are generated from here, reviewed, cut up and wired in; the code-drawn version of each piece stays as the fallback until its picture loads. First test: the six gems (GPT Image 1.5, one sheet, transparent background, hand-painted storybook brief) under `public/art/gems/`, stamped by the sprite cache in place of `drawGem`. Second test, the map: a painted meadow backdrop, a cobblestone surface inside the code-drawn road, painted lantern posts (lit and unlit, crossfaded), painted plants and stones beside the path, and a painted firefly on the map and the board; the other six areas and the other two companions wait for the style session. A proper style session (one agreed look for every asset: gems, companions, lanterns, scenery, and the road itself) comes before the rest of the assets are made.
- **Free Play** (fun levels off the map) is noted as a maybe for later; replaying lit lanterns covers most of it.
- **The scene fills the screen to the bottom edge.** The phone showed a black band under the board and the map because the whole canvas was padded in from the home-indicator strip. The sky and ground now run to the edge; only the top inset is padded, and the board itself is laid out above the strip so no gem or tappable sits under it. Full-bleed is the rule for scenery from here on.
- **The moon gate was rejecting real thumbs.** It treated any touch wider than 28 px as a palm, and an iPhone reports an ordinary thumb at around 40 px, so most holds failed at once; a drift of more than 8 px during the hold also cancelled it, and the ring was nearly invisible for the first second. Now a touch over 80 px is a palm, a thumb may wobble by 24 px, the ring is visible from the first moment, and the moon itself brightens with the hold. A child still cannot pass the word step, so the hold can afford to be seen.

## 2e. Art summit decisions (6 October 2026)

Settled with the parent as five picture choices, one at a time (samples and prompts in the project's `art/style/` folder; the full guide is `STYLE.md`).

- **One hand for everything: hand-painted storybook** (gouache and watercolour, soft brushwork, rich jewel colours), chosen over polished glossy and stained glass. The painted gems, the Meadow mockup and the firefly had each been in a different hand; from here every piece is made against the same style paragraph.
- **The companions are now a fairy, a kid dragon and a little hooded hero**, extra-cute proportions. Harper loves fairies above all, so the fairy is the default. The firefly and the glow fish are retired (the code's ids stay for saved games).
- **The board moves to the top of the screen** (seven by eight in Play: a ninth row was tried on the deployed build and dropped on 7 October because it cluttered the board over the painted backdrops), the gems a tenth bigger, the companion beside the lantern half again as big, and a soft still glow under every gem; the landscape shows beneath the board. Painted cells (a gilded jewel box, a flower frame, a ring of stars) were tried and the glass cells kept.
- **The seven areas** were approved from one painted strip, so they read as siblings.
- **The map becomes a scrolling storybook**: tall painted sections per area with the path painted into the landscape, chaining top to bottom; the code places lanterns and companions on points along the painted path and keeps drawing all the light. The perspective stage and the code-drawn road ribbon go. The parent's words: the old road "just drifts oddly into the mountains".
- **Stage 4's pieces** (frost, vines, cloud puffs, moonstone, star-seeds, bubbles, hidden pictures) were approved painted, so Play levels are built with their real art from the first day.
- **Reskins later**: each theme is a folder of same-named pictures chosen from the panel, so a superhero or birthday version is pictures only.
- **The rule that protects the feel**: pictures are the body, code is the light (STYLE.md). Glows, auras, pulses and the win shimmer stay code-drawn on top; every picture sits on the code-drawn anchor; the code-drawn piece stays as the fallback.

## 2f. The launch picture (7 October 2026)

The parent asked for a splash screen on game load. Decided and built as the Stage 6 "launch picture", so it is not planned twice:

- **What she sees:** the moment the icon is tapped, a painted night sky with the name Glimmerfall in glowing storybook letters, the fairy scattering jewels that drift down like gentle falling stars, and the meadow glowing below. Code draws the light over it: twinkling stars and slow glimmers in the gem colours drifting down. No tap is asked for, nothing moves fast, and there is nothing to read but the name.
- **The fairy door** (the parent, 7 October, after seeing the splash): at the foot of the picture stands a painted fairy door on the meadow, a wooden arch in a mossy stone frame with a lit round window and a sign reading Harper. The splash waits for her, stars twinkling and glimmers drifting, however long she looks; after a few seconds the window breathes brighter as the invitation. A tap on the door (with a generous margin) floods the doorway with light, a ring runs out over the meadow, and the picture fades into the map; a tap anywhere else makes a star twinkle. A touch in the very first moment counts from the end of that moment, so the picture is always seen. The door tap is the first touch of the launch, so it is where sound unlocks (a warm chord now; the theme music starts here). `?splash=0` skips the splash (screenshots and tests).
- **The game opens on the map, not on the board** (the parent, 7 October: "load to map, last level if applicable"). After the splash, the map waits at her lantern, already lit and breathing the invitation, with her companion on it; there is no hop and no bloom, since she has not just won anything. A tap on the lantern or her companion brings back the board exactly as she left it, part way through if it was; lit lanterns behind her replay as before; anywhere else twinkles. The resting scene still comes first while she is "asleep", and a level saved at the moment its lantern filled still finishes first.
- **Pictures are the body, code is the light:** a code-drawn version (sky, stars, the fairy, the name in plain letters) shows for the first instant and stays if the picture never loads. On a tall phone the painting stands on the bottom edge a little wider than the screen, so the title is never cut, and the code sky carries on above it through a feathered edge; on a squarer screen it covers. The picture is `splash.jpg` and the door `splash-door.png` in the theme folder, so a reskin can have its own; the door has a code-drawn version too (arch, window, sign). The app icon is separate and still to do.


## 2g. The map rebuilt (7 October 2026)

The parent's brief for the map, given during his review of batch A: the path must feel integrated into each landscape; scrolling the map should be engaging, comforting and delightful in its own right, even when a toddler flips through it fast; the level markers must be clearly defined and in the map's style, not necessarily lanterns, unique per area if they are called out the same way; fix the scrolling bugs (it scrolled on for ever) and make the area transitions gentle. Built as batch B:

- **Twenty-one painted pages**, three per area, with the path painted into the landscape by the painter, not drawn by the code. The code only knows a dozen points along each page's path and puts everything on them.
- **Beacons, one design per area**, all of them a slender post with one round glass lamp on top, so Harper reads them the same way everywhere: a vine-wound post in the Meadow, a crystal pillar in the Cave, a coral post with a starfish in the Lagoon, a pale castle lamp, a flower stalk in the Garden, an ice column on the Peak, a dragon-scaled trunk in the Hollow. Lit behind her, dark ahead, with the warm halo and the pool of light still drawn by the code.
- **Scrolling** follows the finger exactly while it is down, gives a little past both ends and springs back, and a flick carries on at a capped speed (about a screen and a half a second at most) that eases out, so a fast flip stays calm and tactile instead of racing away. After a couple of seconds without a touch the view drifts home to her beacon, which sits a little below the middle of the screen so the path ahead shows. The map no longer scrolls into nothing: it stops at the first page's bottom edge, and in review mode at the top of the last area.
- **Area transitions** are the pages themselves: the last page of one area meets the first of the next at a feathered seam, and the area's tint and music change as her beacon crosses, so the walk from the Meadow into the Cave is a soft band of ground rather than a fade.
- **Open on the map after the splash** (decided in the splash thread the same night, 2f): the map is now the first thing seen after launch, framed on her current beacon, so this framing is the most seen view in the app.



## 2h. Stage 4 built: Play levels (7 October 2026)

Play levels are now the ones designed in 3.7, generated per lantern. What was decided while building:

- **Ten shapes to an area, in this order:** gather; uncover (frost at the bottom over the hidden picture); seeds; free the creatures; uncover with the frost in the corners; cloud puffs with seeds; vines over frost; bubbles guarded by moonstone; a shaped board (rounded corners) with seeds and a gather; the big one (shaped, two layers of frost, guarded bubbles, seeds). The dials rise through the ten, reset at the next area, climb a little on each pass through the seven areas, and scale with the panel's Play difficulty (gentle is three quarters, bigger a quarter more).
- **Frost thins one layer per clear** of the gem on it, whether by a match or by a power's light. The hidden picture shows through each cell as it thaws (and faintly through a single layer).
- **Seeds fall like gems and never match;** at the bottom of their column they drift out and a flower sprouts in the scenery under the board for the rest of the level. A cloud puff or a hole is a floor: gems under a cloud fill in from the cloud ("the cloud rains gems").
- **Puffs and bubbles clear when a match is made beside them** or a power's light passes; moonstone only by light. A freed sleeper's light flies up to its icon in the goal row.
- **The goal row** replaces the stars on Play boards: one small painted icon per thing to do (frost shows its progress in up to eight), lighting as they are done; the lantern fills with the whole level's progress.
- **The sprite** goes for a moonstone first, then a bubble, then a puff, then thick frost, before it looks for the biggest cascade. Hints prefer, among swaps of one strength, the one nearest a goal.
- **Calm is untouched:** the 6 by 9 board that counts matches. Play saves from before Stage 4 open as they were (a plain board counting matches) and the next lantern is a real level.
- **Completability** is checked twice, as 4.5 asks: every goal cell can be part of a line of three (the generator retries otherwise), and a bot that plays toward the goals finishes all seventy lanterns at every difficulty within the move bound in the tests.
- The hooded hero sleeps in no bubble yet (only the dragon and the fairy were painted); the "stuck behind moonstone" bias rise from 3.7 is not built, since the bot never needed it.
---
---

## 3. The game

### 3.1 Name and world

**Name: Glimmerfall** (decided; the repository will be renamed to match). Gems fall and glimmer; the word is soft to say and reads well under a home-screen icon. Harper will know it by its icon (a glowing gem), not its name. I have not found an existing game called Glimmerfall, but I will do a proper trademark check before you install it anywhere permanent.

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

**Board size and touch targets.** On the iPhone 16 Pro (402 by 874 points), with a 16-point gutter each side, a 7-wide board gives cells of about 53 points, comfortably above Apple's 44-point minimum. A 6-wide board gives cells of about 61 points. *Recommendation:* Calm mode uses a 6 by 7 board with the biggest, friendliest cells; Play mode uses 7 by 8, sometimes shaped. Both fill the width of the screen, centred vertically in the safe area between the Dynamic Island and the home indicator. A Calm board of seven rows at 61 points is about 430 points tall, which leaves well over a hundred points of plain background between the lowest gem row and the bottom edge, so a swipe on the board never starts in the home-indicator strip.

**Nothing else on the screen but the board, a small goal lantern at the top with her companion resting beside it, and a dim moon in one corner** (the parent gate). No score, no move counter, no buttons she could get lost in. The companion is the only thing besides a gem that responds to touch, and only if the map peek in 3.5 survives (Section 7).

### 3.3 Feel: motion, touch, feedback

This is the thing to get right first, and the prototype stage exists to tune it on your phone. The intent:

- **Swap:** 160 ms, eased in and out, with a slight lift and glow on the piece she is moving. An **invalid swap** slides out and settles back with a soft, slow ease and a single quiet low note. No shake, no buzz, no red.
- **Match:** matched gems brighten and bloom for about 120 ms, then dissolve into a few drifting sparkles over about 220 ms. Brightness ramps are capped so nothing ever flashes or strobes.
- **Fall:** gravity with real acceleration and a soft landing (a 5 or 6 percent squash and settle), staggered per column so a cascade reads as a wave, not a jolt. Each landing gets a very quiet low "thud" so the pieces feel like they have weight.
- **Cascades:** each step waits for the board to settle, about 350 to 450 ms per step, and each step plays the next note up a pentatonic scale, so a long cascade becomes a rising melody. Cascades of six or more steps also ripple a slow aurora across the background: a quiet "that was special" that costs nothing and never shouts.
- **Touch:** both **swipe-to-swap** (drag a quarter of a cell in a direction) and **tap-tap** (first tap lifts and glows a gem, second tap on a neighbour swaps; a tap elsewhere just moves the selection). One finger at a time drives a gesture: normally the first one down, so extra fingers mashing alongside do nothing. The exception is a finger that lands and then stays put, which is what a palm or the heel of her hand looks like to the screen. If another finger moves or taps while the first is parked, the moving finger takes over, so a palm resting on the glass never makes the board go dead, and lifting the palm changes nothing. Every touch, valid or not, produces a tiny soft ripple of light under the fingertip, so mashing never feels dead and never produces an error. Pieces that are not currently moving can be swapped while other columns are still falling, which keeps the game responsive to a quick child without ever corrupting the board, because all state changes run through one deterministic core (Section 4.2).
- **Hints:** after a pause (Calm: about 4 seconds, Play: about 10, adjustable), a valid swap glows gently and pulses at breathing pace. It prefers, in order: a swap that sets off a power already on the board, then one that makes a power, then any valid swap. It is an invitation, never a nag: no arrows, no sound.
- **Dead ends:** if no valid move exists, the gems quietly swirl and resettle into a new arrangement that is guaranteed to have one. Tests enforce this (Section 4.5).

### 3.4 Powers: the special pieces, and how she discovers them

Powers are the heart of the wonder, so they are a rich set, each with a distinct magical effect, and they arrive gradually along the map so there is always something new. All effects **flow**: waves of light, blooms, sweeps and ripples, never blasts. Each has its own musical phrase.

**How powers are made** (familiar shapes, so her Candy Crush knowledge carries over):

| Power | Made by | What it does when set off |
|-------|---------|---------------------------|
| **Comet** | four in a line | A comet with a trailing streak. Set off, it sweeps along its whole row or column as a wave of light, clearing gems one after another with a rising run of notes. The streak shows which way it will fly. |
| **Prism Orb** | five in a line | A slowly swirling orb of every colour (the "chocolate ball" she loves). Swap it with any gem and every gem of that colour across the board lights up and dissolves in a ripple spreading out from the orb, with a sparkling two-octave run. |
| **Bloom** | an L or a T | A closed flower bud. Set off, it blooms into a soft ring of light clearing the 3 by 3 around it, drifts down with the falling gems, then blooms once more, bigger (a rounded flower of thirteen cells). |
| **Lantern Sprite** | a 2 by 2 square | A tiny glowing creature. Set off, it flits in a curving path with a sparkle trail to something useful (a goal piece, a frost tile, or the gem whose popping starts the biggest cascade) and pops it together with the gems touching it. |
| **Starburst** | a plus shape | A radiant star. Set off, light sweeps outward along both diagonals, an X of light: the one power that moves diagonally. (Later area; optional, see Section 7.) |
| **Moonrise** | a 2 by 3 block | A pearl like a small moon. Set off, a wide moonbeam sweeps slowly down the board, clearing a three-wide band and any frost in its path. (A later discovery.) |
| **Aurora** | six or more in a line | A late milestone discovery (Aurora Peak). The whole sky shimmers, and every gem of two colours dissolves in slow waves: the colour it was swapped with and the board's most common other colour. |

**Setting a power off.** Comet, Bloom, Lantern Sprite, Starburst and Moonrise keep the colour and shape of the gems that made them: the gem stays visible inside the glow, so she can match it by shape as usual. They go off when they take part in any match, when they are swapped directly onto another power, or when another power's light touches them. Prism Orb and Aurora have no colour and go off when swapped with anything: the Orb clears the colour it was swapped with, and Aurora clears that colour plus the board's most common other colour. For Gather goals and for an Orb's colour-clear, a coloured power counts as its colour.

**Combining two powers** (swap one onto another) is where the biggest moments live:

| Combination | Effect |
|-------------|--------|
| Comet + Comet | A cross of light: the whole row and column sweep at once. |
| Comet + Bloom | Three rows and three columns sweep in a slow, wide wave. |
| Bloom + Bloom | A giant bloom: a 5 by 5 flower of light that opens twice. |
| Prism Orb + Comet | Every gem of that colour turns into a comet, and they all fly in turn. |
| Prism Orb + Bloom | Every gem of that colour becomes a bloom and they open in a wave across the board. |
| Prism Orb + Prism Orb | The biggest moment in the game: a sunrise sweeps the whole board, every gem becomes light over about 2.5 seconds, with a slow warm swell and a full run of twinkling notes. Majestic, not loud. |
| Lantern Sprite + Comet or Bloom | The sprite carries the other power to the best spot on the board and sets it off there. |
| Lantern Sprite + Prism Orb | The sprite carries the orb to a gem of the board's most common colour and sets it off on that colour. |
| Lantern Sprite + Lantern Sprite | Both fly, to two different useful spots. |
| Starburst + Comet, Starburst + Starburst | An eight-pointed star: row, column and both diagonals sweep outward from the centre (two Starbursts also open the 3 by 3 around it). |
| Prism Orb + Starburst | Every gem of that colour becomes a starburst and their X's of light open together. |
| Moonrise + Comet | A wide moon: the beam grows to five columns and the comet's row sweeps across it, a wide T of light. |
| Moonrise + Bloom | A moonflower: the five-wide beam sweeps down and a 5 by 5 flower opens where they met. |
| Moonrise + Starburst | The beam sweeps down and both diagonals open from the centre. |
| Prism Orb + Moonrise | A moon tide: a beam falls from every gem of that colour, so most of the board turns to light, top to bottom. |
| Moonrise + Moonrise | A full moon: the whole board sweeps down as one slow beam, top to bottom. |
| Aurora + Prism Orb | Dawn: the three most common colours dissolve in three slow waves. |
| Aurora + Aurora | The whole sky: every gem on the board dissolves, colour by colour, in slow waves. |
| Lantern Sprite + Starburst, Moonrise or Aurora | The sprite carries it to the best spot (for Aurora, to a gem of the most common colour) and sets it off there. |

Any pairing not listed (Aurora with a Comet, Bloom or Moonrise; Starburst with a Bloom) sets both powers off from the swap cell, one after the other with each one's own effect, so no swap of two powers is ever a dud. Two-power effects fire from the cell the moved piece lands on, which is where her finger ended up.

**How she discovers them.** Powers unlock at milestone lanterns. Before its milestone, a line shape (four or five in a line, an L, a T) clears as a plain match; a plus makes a Bloom until Starburst unlocks, and six in a line makes a Prism Orb until Aurora unlocks. A 2 by 2 square is not a match at all until the Lantern Sprite unlocks, and a 2 by 3 block clears as its two lines of three until Moonrise unlocks, so the loop stays Candy Crush's loop and the Sprite's shape is a true discovery. From a milestone on, the fresh-board, bias, hint and dead-end rules treat that shape as a match.

At the milestone level, the board **starts with the new power already sitting in it**, glowing with a soft halo. The gift is always placed where a single swap sets it off, and the hint points at that swap from the first pause. The first time any power goes off, time slows slightly (about 0.7 times speed) and the sound is a little richer, so the moment lands. If the lantern would fill before she has set the gift off, the finishing sequence fires it first: the finishing light touches the gift and it goes off, with the slowed first-firing treatment, before the remaining gems drift up into the lantern. So every discovery is seen, never left to chance. From then on the power is created by its shape as usual, and Calm mode's board bias (below) makes sure she keeps getting them.

Proposed unlock order along the first areas:

- Level 1: Comet (she already knows this one, so it is there from the start).
- **Level 5: Prism Orb.** Level 5 is the stop that thrilled her, and the colour-clear is her favourite, so this is where the "chocolate ball" arrives.
- Level 8: Bloom.
- Level 11 (Crystal Cave): first combination gift: a level starts with a Comet beside a Bloom.
- Level 15: Lantern Sprite.
- Level 21 (Mermaid Lagoon): Prism Orb + Comet gift.
- Level 25: Starburst (if we keep it).
- Level 31 (Cloud Castle): Moonrise.
- Level 35: Bloom + Bloom gift.
- Level 41 (Star Garden): Prism Orb + Bloom gift.
- Level 51 (Aurora Peak): Aurora, placed on the board like every other milestone power; from here six in a line makes one, and the Calm bias can occasionally set one up.
- Level 55: Prism Orb + Prism Orb gift.
- Level 61 (Dragon Hollow): Moonrise + Comet gift.
- From the second cycle of areas on, the first lantern of each area gifts the combination she has fired least, so the journey never runs out of first times.

**Making powers happen often in Calm mode.** When new gems fall in, with some probability (Calm: around a third of the time, Play: lower) the game picks a colour that sets up a four- or five-in-a-line one move away, rather than a uniformly random one. If she has gone several moves without making a power, that probability rises. Occasionally, in Calm mode only, a ready-made power she has already unlocked simply drops in with the refill as a small gift (a judgment call, Section 7). None of this is visible as a mechanic; the board just feels generous. The tests check that the bias never creates a match on its own and never leaves the board without a move.

### 3.5 The journey: the map

- A winding vertical path of lanterns through the areas above. Lit lanterns behind her, unlit ones ahead (dimmer, never locked or padlocked, nothing greyed out as "not allowed").
- Her **companion** sits on the current lantern. After a level, the view eases out to the map, the companion hops forward along the path, the new lantern lights with a small bloom and a warm chord, the camera lingers about four seconds, then eases into the next level. She can tap to continue sooner.
- **She picks her companion herself, on the map, with no reading.** The app still opens straight into level 1 with a default firefly, so nothing blocks the instant start. On her first visit to the map, after level 1, three creatures wait by the path, glowing softly: the firefly, a small glowing fish, and a small caped hero. Tapping one makes it hop to her lantern and become her marker; the others stay in the scene as friends. The three friends reappear at the first lantern of each new area, so she can change her mind, and the two creatures she is not using wave as she passes. On the visits where the creatures are offered, the map lingers about eight seconds instead of four and does not move on while a finger is on the screen. A tap on or near a creature picks it: it hops to her lantern and the map lingers a few seconds more. A tap on empty sky continues at once, as usual. If she never taps, the map continues and the firefly stays. The choice is never required.
- Crossing into a new area is a bigger moment: the scenery changes as she walks, the ambient sound shifts, and a small creature of that area appears to greet her (a firefly, a glowing fish, a sleepy dragon).
- The app never opens onto the map. The map is the transition between levels. *Recommendation:* she can also peek at the map by holding her companion, which rests at the top of the board beside the goal lantern, for about half a second. A tap on the board brings the board back, and the companion does not respond again for about a second, so a mash near the top of the screen cannot flip between board and map. Easy to drop if it proves distracting (Section 7).
- The path is generated procedurally and is infinite. Areas cycle after the seventh with palette variations and new creature cameos, so the sense of "somewhere new" continues.

### 3.6 Two modes: Calm and Play

I agree Calm mode should be the default whenever the app opens after a gap; the launch rule below sets the gap. The phone gets handed over mid-meltdown; nobody is going to open a menu first.

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

**How the modes relate: one path, one marker.** Every lantern on the map can be played as a Calm level or a Play level, generated from the same seed and theme with different parameters. She advances along the same path in both modes, the same powers unlock at the same milestones, and the same areas come and go. If she is mid-way through a Play level and the mode is switched to Calm, the current lantern becomes a fresh Calm level; the half-finished Play board is kept and comes back if the mode is switched back at the same lantern. Switching Calm to Play is never an emergency, so it takes effect when the current Calm level finishes, a minute or so later: the lantern lights as normal, the map transition plays, and the next lantern opens as a Play level. Switching Play to Calm stays immediate, because that is the emergency direction. I considered a separate gentle path or two markers and rejected both: a single journey is simpler for her to understand and avoids any sense that one mode is the "lesser" one.

**Switching modes, one-handed, in a car.** Through the parent gate (Section 3.9), the mode switch is the first and biggest control on the panel: two large tiles, Calm and Play, with the active one lit. Gate plus switch is about three seconds with a thumb. Below it sits the "Finish after this level" button, because those two are what you will reach for in a car.

**Launch rule** (decided): if the game was resting when it was closed, the rest rule in 3.8 comes first, and a relaunch before the rest-until time shows the sleeping scene whatever the gap. Otherwise, a relaunch within 10 minutes resumes the exact board, mode and position, and a launch after a longer gap starts in Calm mode at her current lantern on a fresh board. A parent setting can change this to "remember the last mode".

### 3.7 Play mode: how it stays engaging with no way to lose

Candy Crush gets difficulty from scarcity (moves, lives). Without scarcity, challenge has to come from **space and sequence**: reaching awkward places, clearing things that need several steps, and using powers deliberately. Finishing is guaranteed eventually; the satisfaction comes from "I worked that out", and the pacing comes from the fact that harder goals simply take longer.

**Goals, all shown as pictures:**

- **Uncover the picture.** Frost (or moss, or sand, by area) covers part of the board and hides a picture: a sleeping creature, a sunken treasure chest, a castle window. Matching on a frosted tile clears a layer. The picture emerges as she clears, which is its own motivation to finish, and the reveal is the level's reward. Difficulty: corners and edges, double layers, frost only reachable through narrow parts of a shaped board.
- **Bring down the star-seeds.** One to three glowing seeds sit at the top. They fall like gems but do not match. When one reaches the bottom row it drifts out and sprouts a small glowing flower in the scene. Requires clearing beneath them: planning without pressure.
- **Free the creatures.** Small creatures (a firefly, a glow fish, a baby cloud) sit in bubbles. A match next to a bubble pops it and the creature flies up to join the scene at the top. Some bubbles are guarded by moonstone, which only powers can clear, which teaches deliberate use of powers.
- **Gather.** Collect gems of a shown type; a row of up to eight dim gem icons lights up one by one. Used mainly to mix with the others.

**Obstacles, all static. Nothing spreads, grows back, or counts down.**

- **Frost:** one or two layers under the gems, hiding part of the picture. Matching a gem that sits on a frosted cell clears one layer, and a power's light clears the frost it passes over.
- **Vines:** hold a gem in place; matching that gem frees it.
- **Cloud puffs:** block falling gems, cleared by adjacent matches, so the board changes shape as she works.
- **Moonstone blocks:** immovable; any power's light clears them, and the Lantern Sprite counts a moonstone that guards a goal as "something useful". When the only remaining goal items sit behind moonstone, the power bias rises to Calm mode's level and the hint prefers the swap whose power would reach the moonstone, so the last step is a minute of play, not luck.
- **Shaped boards:** missing cells make some places hard to reach.

**Ramp.** The level generator has a handful of dials (board shape, number of types, frost layers, moonstone count, number of goals) and raises them slowly as the lantern number grows, with a reset to gentle at the start of each new area so each area begins easy and ends with a satisfying "big" level. Generated levels are checked by a solver bot before they are shown (Section 4.5).

**Optional "discoveries" collection.** A small sparkle-book, reached from the map, that shows the powers, combinations and creatures she has found so far. Purely additive: nothing is shown as missing, so there is no "incomplete" pressure. It gives Play mode a sense of accumulation without grades. I have put it at the end of the plan and in the judgment calls.

### 3.8 Endings and wind-down

The design goal is that stopping feels like the end of a story, and that you are never the one yanking the phone away.

**Three ways a session ends, all arriving at the same resting point:**

1. **The timer.** A session length (default 10 minutes of active play, adjustable from 5 to 30 or off) with a wind-down phase (the last 2 minutes). Time only counts while the app is in the foreground and she is actually playing.
2. **"Finish after this level."** One large button on the parent panel. The current level becomes the last; wind-down begins immediately so the softening coincides with her finishing.
3. **"Finish now, gently."** A second button for when it has to be now. The remaining gems twinkle and drift up into the lantern over a few seconds, the lantern lights, and the ending sequence plays. In a Play level the goal resolves first (frost melts off the picture, bubbles float free, seeds drift down and sprout), then the gems drift into the lantern, so the level's own reward is never skipped. Still no cut-off; it is the same ending, just sooner.

**What wind-down does.** Over the final two minutes the game softens, without announcing it:

- Motion slows by about 20 to 30 percent and eases more gently. Falls are a little floatier.
- Chimes drop an octave and get quieter; the music thins to its simplest form, the tempo eases, the ornaments stop and the pad takes over, swelling with the breathing rhythm (3.11).
- The background deepens toward night; stars come out; fireflies slow.
- The level goal shortens so the current level completes within the window, and powers are still generous. In Play mode "shortens" means the moon helps: each match also melts a layer of frost, pops a bubble or drops a star-seed one row, so the level resolves within the window.
- Screen brightness dims by 15 to 20 percent via a soft overlay.

**The resting point.** The last lantern lights, her companion hops forward on the map, curls up on the new lantern, and falls asleep, glowing in slow breaths. The map rests there. Stars twinkle slowly. A sparse, lullaby-like handful of notes plays and then fades to silence over about 30 seconds. Tapping the screen makes a star twinkle and a very soft chime, and nothing more: the game has gone to sleep, but the phone is not "dead" in her hands. After two minutes the chimes stop and the screen dims further; after ten minutes it settles to a near-black night with a few slow stars, releases the screen wake lock so the phone can auto-lock, and does almost no work (battery).

**Coming back.** While the app stays open, the sleeping scene never ends on its own. On a later launch she sees it again until a grown-up opens the gate and taps "New session", or until the rest-until time has passed since the ending (default 30 minutes, adjustable, or "until a grown-up unlocks"); only then does the launch rule in 3.6 apply. So if she closes and reopens the app herself, she sees her sleeping companion, not a new level.

**The breathing glow.** You asked whether a glow that breathes at a calm pace would help. My view: it is worth having, with modest expectations. There is reasonable evidence that slow visual rhythms nudge breathing in adults; for a five-year-old it is at least a calm, consistent thing in the periphery of her vision, and it costs nothing. I would run it at about 8 breaths per minute (a cycle of about 7.5 seconds, slightly longer out than in), which is slower than a child's resting rate but not so slow that it reads as unrelated to breathing. It is always subtle during play (a soft vignette around the board in Calm mode), becomes the dominant rhythm during wind-down and rest, and is never labelled, instructed or counted. It is a parent toggle.

### 3.9 The grown-up gate and settings

**The gate: two deliberate steps, the second needing reading.**

1. **Hold the moon.** A small, dim moon sits in a corner (top-left, clear of the Dynamic Island). Hold it for 1.5 seconds and a thin ring fills around it. Letting go early, or a second finger landing, cancels quietly. The moon ignores a touch with a large contact area or one that begins while another finger is already down (a resting hand), and the ring stays very faint until the last half second, so a casual hold shows almost nothing. A child will still sometimes do this, which is why there is a second step.
2. **Tap the words.** A small panel shows eight word tiles (for example MOON, STAR, LEAF, FISH, SNOW, GEM, TREE, BOAT, shuffled every time) and the instruction "Tap STAR, then MOON". You read and tap twice. A pre-reader cannot, and guessing gets in one time in 56. The tiles arm only after the panel has been fully visible for half a second and accept only a clean tap (down and up inside one tile, no other finger down), so a mash already in progress cannot register. A wrong tap simply fades the panel out with no sound and the gate stays quiet for 20 seconds. Two wrong attempts and it stays quiet for a minute.

Both steps together take a grown-up about 3.5 seconds with one thumb. You confirmed she cannot yet match written words. When she starts to, the second step becomes a 4-digit PIN with the same quiet failure behaviour, switched on from the panel. I considered a plain long-press plus a swipe, and rejected it: an upset child holds and swipes.

The panel closes itself after 30 seconds of inactivity, and closing it never disturbs the board.

**What is on the panel** (text is fine here; big targets, the important ones in thumb reach at the bottom, sitting just above the home-indicator inset, which is left empty so a thumb reaching for a button cannot swipe the app away):

- **Mode:** Calm / Play (two large tiles).
- **Finish after this level** (one tap) and **Finish now, gently** (two taps: the button, then a confirm tile that appears elsewhere on the panel, so a stray mash after an accidental entry cannot end her session). Then **New session** when resting.
- **Session:** length (5 / 10 / 15 / 20 / 30 / off), wind-down on/off, rest-until (15 / 30 / 60 min / unlock), launch rule (Calm on launch / remember last mode).
- **Sound:** music on/off, music level (soft / normal), chimes on/off, "play even when iPhone is on Silent" (see 3.11).
- **Feel:** hint delay (quick / normal / slow / off; normal keeps each mode's own default of about 4 seconds in Calm and 10 in Play, quick roughly halves both, slow roughly doubles both), breathing glow on/off, reduced motion (follow iPhone / on / off).
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
- **Music:** a generated soundtrack, described below, which replaces the optional ambient bed in the first draft.

**Music.** You said the game needs music, and I agree: a warm soundtrack is a large part of what makes the game she knows feel finished, and a steady musical bed is itself settling. It is composed live, in code, with the same synthesiser as the chimes. No audio files.

- **How it is made.** A small set of hand-written motifs (short phrases of four to eight notes) in G major pentatonic, a chord cycle under them, and a generator that walks between motifs with gentle variation: ornament a note, hold one longer, answer a phrase an octave down. The result is recognisably "the Glimmerfall tune" but never loops exactly, so it does not wear thin on a long drive. Tempo is slow, around 60 beats per minute, with the pad's swell tied to the breathing rhythm.
- **Layers.** A soft sustained pad; a music-box or celesta melody; a sparse low pulse for warmth; and twinkling high ornaments that appear only now and then. Each area swaps the melody instrument and the motif set (celesta in Crystal Cave, a softened, watery tone in the Lagoon, a gentle horn-like voice in Cloud Castle), so the music changes as she travels.
- **Chimes and music agree.** Every match chime is drawn from the chord the music is playing at that moment, so cascades always harmonise with the tune instead of clashing with it. Powers and level completions are short phrases in the same key that sit on top of the music; during a big effect the music dips slightly to make room, then returns.
- **Wind-down and rest.** Over the final two minutes the melody thins to its simplest form, the tempo eases, the ornaments stop, and the pad takes over. At the resting scene the music becomes a lullaby version of the area's motif, then fades to silence over about 30 seconds. Taps in the rest scene twinkle in the same key.
- **Controls and defaults.** Music is on by default in both modes, at the "soft" level and mixed beneath the chimes. The parent panel has music on/off, music level (soft / normal), and chimes on/off separately, so "music but no chimes" and "chimes but no music" both work. The game is fully playable with everything off.
- **Choosing the feel.** You asked to hear options first. The Stage 1 mockup page will carry three short music sketches, each about 40 seconds and generated live in the browser, with a tap-to-listen button (the browser needs a tap before it may play sound): **music-box lullaby** (gentle melody over pads, slow and dreamy), **playful and light** (brighter and a little bouncier, still soft and never fast), and **dreamy ambient** (mostly pads and shimmer with only occasional melody). Each will also show its settled wind-down form. Pick one, or ask for a blend.

**The theme (7 October 2026).** The parent asked for theme music for the launch picture and the map, with music for each area on the map. The lullaby above is a generator that never repeats, right for an hour under a level; the theme is the opposite, a written tune that is the same song every time she opens the game, the way a storybook's first page is always the same. It is thirty-two bars in the same G major pentatonic at 64 beats a minute (a little above the lullaby, so the map feels like setting out rather than settling), in four phrases: a rising call, the call lifted higher, a quieter wandering answer, and the lifted call again, ending on a long home note the opening steps out of, so it loops without a join. Under it sit the pad, a low pulse, an accompaniment figure and the twinkles. Each area plays the theme in its own voice from the list above (the music box in the Meadow, struck crystal in the Cave, and so on) with its own figure under the tune (a music-box turn, drips, a slow swell, two held harp notes, rising and falling harp, a bell over the fullest pad, a kalimba pulse with a two-beat dragon's breath) and its own density of twinkles, while the tune, the chords and the beat stay the same. So as the view scrolls across a border the player simply moves weight from one voice to the next over about three seconds (an equal-power crossing, so the tune never dips or doubles), the chords never stop, and a fast flick through several areas just keeps re-aiming the crossing. The theme is what she hears on the map (and so under the launch picture, which opens on the map); the moment a level opens the music eases into the area's lullaby, and back to the theme when the map returns. An iPhone allows no sound before the first touch, so the theme starts at the first touch, wherever it falls: on the launch picture (its door, once that lands) or on the map. The panel's music switch and level cover it like all music. Still generated in code, no audio files: the whole theme is a few hundred lines in `src/audio/theme.ts`, and a second skin could carry its own voices the same way it carries its own pictures.

**Loudness.** A master limiter caps output; the first sound after launch fades in over about 1.5 seconds so there is never a sudden first note; a parent "soft / normal" level sits below the iPhone's volume. It is mixed to sound good at low volume, and the game is fully playable with sound off: every sound has a visual twin.

**Your iPhone's Silent mode, and headphones.** This is how iOS behaves in practice. Silent mode is decided by iOS's audio session rather than by the browser engine, and Apple documents only the speaker case, so the two route points below are ones I will confirm on your phone in Stage 2:

- By default, web audio runs in iOS's "ambient" audio session. On the iPhone's own speaker it **follows Silent mode**: toggle Silent on (the Action Button by default, or a Silent Mode control you add to Control Center; see 5.3) and the game is silent. I recommend keeping this default, because it gives you a physical, zero-UI mute in a quiet cabin, and it means the game cannot surprise anyone.
- With **headphones or AirPods**, ambient audio plays even in Silent mode (iOS treats headphones as private), at the iPhone's volume. If AirPods disconnect mid-session, iOS interrupts the audio session; the game detects this and resumes sound on her next touch. The headphone behaviour is widely reported for years but not documented by Apple, so I will confirm it with AirPods in Stage 2.
- Ambient audio **mixes** with other audio, so if you are playing a podcast in the car the game chimes over it rather than stopping it.
- **Car Bluetooth / CarPlay:** if the phone is connected to the car, iOS routes the game's sound to the car speakers like any app, and treats it like headphones, so Silent mode will not mute it there. The same caveat applies, and I will confirm it in the car in Stage 2; if either route turns out to be muted, the "play even when on Silent" setting below is the fix. You said that is welcome, and that the music can be calming for her, so this is the intended behaviour. The game cannot choose an output device; the in-panel music and chime switches are the controls for the rare time you want it quiet in the car, which is why they sit one tap behind the gate.
- **Optional "play even when on Silent":** Safari 17 and later let a page ask for the "playback" audio session, which ignores Silent mode. I will offer this as a parent setting, off by default, because it has two side effects: it interrupts other audio on the phone, and since iOS 17.5 a page using the playback session is allowed to keep its audio running when it is hidden or the screen locks. The game therefore suspends its own audio engine whenever it is hidden and resumes it when it returns, in both session types, so nothing can keep sounding from a locked phone in a bag.
- Phone calls interrupt the audio; the game pauses its animation while hidden and resumes everything when it comes back.

### 3.12 Haptics

There is no haptics API for web pages on iOS; Safari has never shipped the vibration API. One trick remains: iOS plays a light system tick when an iOS-style switch control is toggled by a tap. Until iOS 26.4 a page could fire that tick from script at any moment inside a touch; since iOS 26.5 Apple has narrowed it, and reports differ on whether anything but a genuine tap landing on the switch's own invisible label still ticks. The honest plan is therefore tap-time only: the tick can happen at the instant her finger lifts from a tap, never when a match resolves, never during a cascade or a power, and never on a swipe, because a drag is not a tap. The page can still decide, inside that tap, whether to let the tick happen, so the one version worth trying is a tick on the second tap of a tap-tap swap when that swap makes a match, arriving about a swap-length (160 ms) before the bloom. It was built as an experiment behind a parent toggle and tried on the phone in the Stage 3 play-tests (5 to 7 October): nothing ticked, on taps or on swipes, inside the home-screen app, so the experiment was removed (see 2d). A true tick would need the native wrapper (4.1), which this alone does not justify.

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
| Real haptics | None; the web experiment in 3.12 gave nothing on the phone |
| Choose the audio output device | Silent mode, the panel's music and chime switches, or Control Center |
| Guarantee local data is never cleared | iOS keeps an installed web app's data in its own store, separate from Safari, and its 7-day rule counts only days the app itself is used, so ordinary use never triggers it. The one thing that does erase everything is deleting the icon from the Home Screen (or reinstalling from a different address), because the app's store goes with it. The **Map position** setting restores her journey in a minute if that ever happens |
| Launch with zero system frames | iOS shows a plain launch background for a fraction of a second; I will set it to the game's night colour so it reads as the game appearing |

### 4.2 Stack and architecture

**Zero runtime dependencies.** TypeScript for the code, Vite to bundle it and Vitest for tests: three development dependencies, and nothing shipped to the phone. No frameworks, no game engine, no audio library, no asset pipeline. The whole app ships as a handful of files under about 300 KB.

**Rendering:** a single full-screen `<canvas>` using the 2D context at device pixel ratio. Gem sprites, glows and halos are drawn once into offscreen canvases at launch (gradients, highlights and soft glows baked in), then composited with additive blending for light effects. Particles are capped. The slow background elements (breathing vignette, fireflies, twinkles) are CSS animations on ordinary elements, which the compositor runs cheaply, so the canvas only draws frames while the board is actually moving. When nothing moves, nothing is drawn.

**Game core as a pure, deterministic library** (`board`, `match`, `gravity`, `powers`, `levelgen`, `hints`, `shuffle`): given a board and a move, it returns the new board plus an ordered list of events (matched here, fell from here to there, power fired along this line, lantern filled by this much). It uses a seeded random generator, so every behaviour is reproducible in tests. The presentation layer turns events into animation and sound and never touches game rules. This separation is what makes mashing and multi-touch safe: input is reduced to a queue of candidate swaps, and the core either applies a swap or ignores it; there is no state that can get half-updated.

**Audio:** a small synthesiser module (oscillators, envelopes, a procedurally generated reverb impulse, a master limiter) and a "voice" table per area. Sounds are scheduled on the Web Audio clock so they line up with the animation.

**Save state:** the complete game state (board, mode, lantern, unlocked powers, timers, settings) is serialised to `localStorage` after every settled move. It is a few kilobytes and the write is synchronous, so a kill at any moment loses at most the animation in flight. A mirror is kept in IndexedDB as belt and braces. The save has a schema version so updates can migrate it.

### 4.3 Instant start, resume, offline, silent updates

- **Instant start:** tiny bundle, critical styles inline, everything served from the service worker's cache, straight into the current level. Target: playable within about a second of the icon being tapped on a warm phone.
- **Sound unlock:** iOS requires a touch before a page may make sound. The game creates its audio on her first touch anywhere on the board, so her first natural swipe is the unlock, and the first sound fades in rather than starting abruptly.
- **Resume:** on launch, the saved state is restored and the exact board is drawn before the first frame. The launch rule in 3.6 decides whether a long-absent Play board is set aside for a Calm one.
- **Offline:** a hand-written service worker (about a hundred lines, no library) pre-caches the whole app on first visit and serves everything from cache after that. The app makes no network requests of its own, ever. The only traffic is the browser fetching the app and checking for updates.
- **Silent updates:** when a new build is published, the service worker downloads it in the background and keeps it waiting. It becomes active the next time the app is started after being fully closed, never mid-session, and there is no prompt. All files of a build are cached together under one version so a half-updated mix can never be served. The parent panel shows the build date so you can confirm what is installed.

### 4.4 Hardened input, screen, battery, performance, accessibility

- **Portrait:** laid out for portrait; in landscape the board simply shrinks to fit and the game keeps working. Real locking comes from the phone (Section 5).
- **No zoom, no refresh, no selection, no callouts:** the whole page is a fixed, non-scrolling layer with browser touch handling disabled on the game surface, selection and long-press callouts disabled, and pinch and double-tap handled by the game rather than the browser. Installed web apps have no pull-to-refresh or address bar, and the game has no links at all, so there is nowhere to navigate.
- **Stray touches:** pointer events are tracked by finger; the first finger down drives a gesture unless it is parked, in which case the next finger that moves does (3.3); other extra fingers do nothing; and a lost touch (a finger sliding off the edge) simply cancels. Edge swipes land on nothing. A fuzz test fires hundreds of thousands of random taps and swipes at the core and checks that the board is always full, never has a stuck piece and always has a move.
- **Screen:** the Screen Wake Lock API (in iOS Safari since 16.4, and working in home-screen web apps on current iOS; I will verify on your phone) keeps the display on during active play, re-requested whenever the app returns to the foreground, and released when she has stopped touching for a while (Battery, below) and during rest. Guided Access's Display Auto-Lock, set to 15 minutes (5.2), is the belt to this brace: it covers the lock ever failing during play, and it is what finally locks the phone once the game lets go.
- **Battery:** no frames drawn when nothing moves, CSS animations for the slow background, no timers running and the audio engine suspended while hidden, wind-down and rest dim the screen and reduce animation, and rest ends in a near-static night scene. **Idle:** if she has not touched the screen for about two minutes outside the rest scene (the session timer has already stopped counting by then, 3.8), the game treats it as a pause: the hint stops pulsing, canvas drawing stops, the music settles to its sustained pad, and the screen wake lock is released so the phone can lock on its own schedule. Her next touch restores everything instantly and re-requests the wake lock; nothing on the board changes.
- **Performance:** target a steady 60 frames per second on the iPhone 16 Pro including the largest combined effects. Baked sprites, additive compositing without runtime blur, capped particles, and a per-frame budget checked in profiling on your actual phone before each stage is called done.
- **Accessibility:** the iPhone's Reduce Motion setting is respected automatically (shorter, fade-based transitions, fewer particles, no slow-motion), with a parent override. All brightness changes are rate-limited so nothing strobes regardless of what the board does.

### 4.5 Tests

Vitest unit and property tests over the pure core, run on every push before deployment:

- Match detection: lines of three, four, five and six or more, horizontal and vertical, L, T, plus, 2 by 2 and 2 by 3 shapes, overlapping matches, and the power each shape creates.
- Gravity and cascades: pieces fall correctly in rectangular and shaped boards and around cloud puffs; cascades resolve to a stable board with no matches remaining; event lists are in a valid order.
- Powers: every power's clear pattern; every combination's effect; chain reactions (a comet that hits a bloom sets it off); the slow-motion and sound events are emitted exactly once per discovery.
- Board generation: across tens of thousands of seeds and every board shape and type count, no fresh board starts with a match, and every fresh board has at least one valid move.
- Reshuffle: for boards constructed to have no moves, the reshuffle keeps every piece, creates no match, and always yields at least one valid move.
- Generator bias: the generosity bias never itself creates a match and never leaves the board without a move.
- Level completability: every generated Play level passes two checks. A static one: every goal cell can be part of some line of three on that board shape. A dynamic one: a simple bot playing valid moves (preferring goal progress, with reshuffles when stuck) completes the level within a move bound, across many seeds and every difficulty setting.
- Save and resume: any state serialises and restores to an identical board; old schema versions migrate.
- Input fuzz: random tap and swipe storms against the core never corrupt the board, including storms with a wide, stationary "palm" pointer held down throughout, which must never block the other fingers.

I will add a Playwright smoke test later (the environment has Chromium) that loads the built app, plays a few moves and checks the service worker caches everything.

### 4.6 Getting builds onto your phone

**Recommendation: GitHub Pages, deployed by GitHub Actions on every push to `main`.** It is free, it is HTTPS (which a PWA needs), and it is the least work for you: one setting to flip once, then every build is live about a minute after I push.

The URL will be `https://dustyshelf2455.github.io/glimmerfall/` once you rename the repository (decided in Section 2). Until then the same site answers at `.../HarperCrush/`. The site is built with relative paths, so it works at either address and the mockups can go up before the rename. What cannot wait is installing: GitHub does not redirect the Pages address after a rename, so anything installed from the old address would stop working. Please rename before the game goes onto your Home Screen.

**What you need to do, once:**

1. Open the repository on github.com, then **Settings** (the repo's settings tab, not your account's).
2. Under **General**, in **Repository name**, change `HarperCrush` to `glimmerfall` and tap **Rename**. GitHub redirects the repository page and git remotes from the old name, but not the Pages site: the old `.../HarperCrush/` address simply stops working and the site reappears at `.../glimmerfall/`. I will update the remote on my side.
3. In the left sidebar choose **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**. There is nothing else to pick. (The workflow tries to do this itself, but GitHub does not let it: until the setting is made, each run fails at the `configure-pages` step with "Resource not accessible by integration". After you set it, open the failed run under the **Actions** tab and choose **Re-run all jobs**.)
5. The repository currently has no `main` branch (only the two `claude/...` branches). Once you approve this design, I will create `main` from the approved branch and push it. Then in **Settings → General → Default branch**, switch the default to `main`. That is the branch the deployment watches.

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

If you move the icon into a folder or the Dock, nothing changes. Do not delete and re-add the icon: an installed web app keeps its saved data inside itself, so deleting the icon erases her progress.

### 5.2 Guided Access: lock the phone to the game

Guided Access is the single most useful thing here. It disables the home gesture, Control Center, Notification Center, the Dynamic Island, notifications and incoming calls, and can disable the side and volume buttons and screen rotation.

**Set it up once:**

1. **Settings → Accessibility → Guided Access**, and turn **Guided Access** on.
2. Tap **Passcode Settings → Set Guided Access Passcode** and choose a code Harper will not know. Turn on **Face ID** so you can end a session by looking at the phone.
3. Back in Guided Access, set **Display Auto-Lock** to **15 minutes**, the longest choice short of Never. While she is playing, the game holds the screen awake itself, and her touches reset the iPhone's idle timer anyway, so this never bites mid-play. It matters at the other end: when the session comes to rest (3.8) or she has stopped touching for a while (4.4), the game lets go of the screen, and this setting is what then lets the phone go dark. With Never, that release would do nothing inside Guided Access and the screen would stay lit until you end the session.
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
5. To turn it on quickly: swipe down from the top-right for Control Center, tap the **Focus** tile, tap **Harper**. To make it one press: **Settings → Action Button**, choose **Focus**, select **Harper**. This replaces Silent mode on the Action Button. Silent Mode is not in Control Center by default, so first add it: open Control Center, long-press an empty area, tap **Add a Control**, search for **Silent Mode** and add it. After that Silent really is one tap away, and it is also a switch under **Settings → Sounds & Haptics**. Your call.

### 5.4 Other settings worth checking

- **Portrait Orientation Lock:** Control Center → the padlock-with-arrow tile. Leave it on. (Guided Access with Motion off also prevents rotation.)
- **Back Tap:** Settings → Accessibility → Touch → Back Tap. Make sure both are **Off**, or a thump on the back of the phone could trigger a screenshot or Control Center.
- **Siri by side button:** Guided Access disables the side button entirely. For the times you hand the phone over without Guided Access, stop a long hold from opening Siri over the game: **Settings → Apple Intelligence & Siri → Talk & Type to Siri** (called **Talk to Siri** on some builds) and turn off **Press Side Button for Siri**. The same switch is also at **Settings → Accessibility → Side Button → Press and Hold to Speak → Off**. Siri still answers your voice if you use it, and a long hold on the side button then does nothing.
- **Screen Time:** if you use Content Restrictions for web content, add the game's address to **Always Allow**, or the game will be blocked.
- **Her progress lives inside the installed app.** Deleting the icon deletes it. Clearing Safari's data (Settings → Apps → Safari → Clear History and Website Data) does not touch it on current iOS, but I would still avoid it while the game is installed. If progress is ever lost, the panel's **Map position** setting puts her back on her lantern.
- **Brightness in the dark:** the game has its own night dimmer. iOS's **Reduce White Point** (Settings → Accessibility → Display & Text Size) is a good extra for a dark cabin.

---

## 6. Build plan

Each stage ends with something you can open on your phone and react to. I will not start a stage until the previous one has had your feedback, except where the next stage is pure infrastructure.

**Stage 0: design (this document).** The seven questions are answered (Section 2). You confirm the understanding in Section 1, weigh in on the judgment calls in Section 7, and give the go-ahead to create the `main` branch (Section 8).

**Stage 1: look, sound and pipeline.** Repo skeleton (TypeScript, Vite, Vitest), the GitHub Pages deployment, and a mockup page under `/mockups/` with: the three visual directions, each a full board at real size with one power animating and a glimpse of the map including the three companion creatures; and the three music sketches from 3.11 with tap-to-listen buttons and their wind-down forms. You pick a look and a musical feel. *You do: the repository rename, the one-time Pages setting and the default branch.*

**Stage 2: the feel prototype.** A playable Calm-mode board with the chosen look: 6 by 7, four gem types as in the first area (3.2) with a switch to try five, swipe and tap-tap, gravity, cascades, hints, reshuffle, the full sound set for matches and cascades, the chosen music playing under it with chimes drawn from its chords, and two powers (Comet and Prism Orb) with their effects and sounds. Installable, offline, saves and resumes. The core tests for matching, cascades, generation and reshuffle. This is where we tune weight, timing and sound on your phone until it feels right. *You do: install it, play it yourself first, then let Harper try it in a calm moment.*

**Stage 3: powers, journey and the gate.** The remaining powers and all combinations, discovery gifts and slow-motion first-firings, Calm-mode lantern goals and level completion, the map with areas, the three companion creatures and her choice of them, per-area music voices, the parent gate and panel with mode, sound, hints and the Finish buttons in a provisional form that ends the current level at the map transition (their wind-down and resting-scene behaviour arrives in Stage 5). The launch rule.

**Stage 4: Play mode.** The level generator with shaped boards, frost, vines, cloud puffs and moonstone, the four goal types, the difficulty ramp and setting, and the completability tests.

**Stage 5: endings.** The session timer, wind-down softening, the resting scene, the full behaviour of the two Finish buttons and New session, the breathing glow, the rest-until rule, the night dimmer, and the battery behaviour that goes with them.

**Stage 6: polish and hardening.** Performance profiling on your phone during the biggest effects, Reduce Motion, area creatures and cameos, the optional discoveries book, launch background and icons, a Playwright smoke test, and a README with the iPhone setup from Section 5 kept up to date.

Throughout: tests run on every push, and every push to `main` deploys.

---

## 7. Judgment calls for you

Things where I have a recommendation but you may feel differently:

1. **Cell size versus board size.** 6 wide in Calm mode (61-point cells) and 7 wide in Play. If you would rather one consistent board, 7 wide works for both.
2. **Peeking at the map by holding the companion** (3.5). Nice for anticipation; drop it if she gets lost there.
3. **The rest scene responds to taps with twinkles** (3.8) rather than being completely still. I think a gently responsive sky is a better bridge to handing the phone back than a dead screen, but a still scene is a one-line change.
4. **Rest lasts 30 minutes, then the next launch starts fresh** (3.8). The strict alternative is "only a grown-up can restart", which protects the ending but costs you the gate every time.
5. **Sound follows Silent mode on the phone speaker by default** (3.11), with "play even on Silent" as an option. Over car speakers or headphones it plays regardless, as you asked; to be confirmed in the car in Stage 2.
6. **Music on by default at the soft level in both modes** (3.11), with separate music and chime switches.
7. **Starburst** (the plus shape) is the one power whose shape is close to Bloom's T, and in the first draft its effect duplicated Comet + Comet. It is now the one power that moves diagonally, which gives it a reason to exist, but it still adds a subtle rule. I lean toward keeping it as a later-area discovery, but it is the first thing I would cut.
8. **The discoveries book** (3.7): additive and gentle, but it is a screen that is not the board. I have placed it last and would only add it if Play mode wants more sense of accumulation.
9. **Haptics experiment** (3.12): tried in Stage 3 and dropped; nothing ticked on the phone.
10. **Powers that drop in unearned** (3.4). In Calm mode a ready-made power occasionally arrives with the refill without her making it. It is pure generosity and a nice surprise, but strictly it is a reward on a random schedule rather than something her own swap produced, which is the shape of mechanic your guiding principle rules out. The refill bias, which already rises the longer she goes without a power, gets most of the same effect through her own moves. My lean is to keep the gift, Calm mode only and rare; say if you would rather every power come from her own hand.

---

## 8. What happens next

The seven questions are answered. What remains before Stage 1 starts: any corrections to Section 1, any objections to the judgment calls in Section 7, and your go-ahead for me to create the `main` branch for deployment. On your side, the one-time Pages setting (4.6) can be done any time before the mockups go up, and the repository rename any time before the game is installed on your phone. Stage 1 then delivers the repo skeleton, the deployment, the three visual directions and the three music sketches for your phone.
