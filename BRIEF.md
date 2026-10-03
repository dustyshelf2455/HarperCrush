I'd like you to help me design and build a small, original game for my 5-year-old daughter, Harper. Please read this whole brief before doing anything. Then, before writing any code, come back with your understanding of the goal in your own words, the clarifying questions that would meaningfully change the design, and a proposed design and build plan. I'd much rather settle the design first than rework it later.

Where I suggest specific ideas below, treat them as starting points, not requirements. If you have a better idea, push back.

## Why this exists

Harper has meltdowns. Engaging her with a puzzle or building with magnet tiles helps her come out of them and regulate, but that isn't possible in a car, a parking lot, or on a plane. So right now I hand her my phone with Candy Crush on it, and it works. The core game is genuinely good for her. It's simple, rewarding, and beautifully polished, with satisfying feedback, and it exercises pattern recognition, shapes, and persistence through a hard level. But it's wrapped in ads, upsells, and manufactured urgency that I don't want her exposed to, least of all when she's already dysregulated.

My wife Jane and I are fine with phone use for this, temporarily, while Harper builds other regulation skills. So the goal isn't to avoid screens. It's to make the best possible version of this tool: a match-3 game built for her, a purpose-made regulation aid that happens to be a delightful game.

## The guiding principle

Optimize for Harper settling, not for time on device. Most mobile games are tuned to keep you playing through variable rewards, streaks, near-misses, and manufactured urgency. This game should drop all of that.

But calm doesn't mean dull. What pulls Harper out of a meltdown is wonder: the squeal when a match lands, or when a special piece does something amazing she's never seen. So the game should be full of delight and surprise, delivered without pressure, punishment, or chaos. Wonder is the hook that catches her attention, and the absence of pressure is what lets her body settle.

Success means she's upset, she plays for a few minutes, she calms down, and she can hand the phone back without a second meltdown. When a design choice is unclear, choose whatever serves that.

## About Harper

- She's 5 and a pre-reader. Everything she touches must work with zero reading: playing, navigating, understanding what happened. (The parent-only area can use text.)
- She loves puzzles and building, especially magnet tiles, and she responds well to shapes and pattern recognition.
- She's a Candy Crush novice who has only played a handful of times. She squeals with sheer delight at every match, and even more when she discovers a new special piece and what it does. The chocolate sprinkle ball that zaps everything is a favorite. She also loved moving down the level map, and reaching level 5 on the path thrilled her.
- She loves fairies, mermaids, princesses, Hello Kitty, gems, and anything sparkly. She also loves superheroes, especially Spider-Man, Batman, and the Avengers. Her favorite shows are *Spidey and His Amazing Friends*, *Gabby's Dollhouse*, and *Bluey*, and our favorite books are superhero books. Treat these as a read on her taste, not as content. Don't use any of these characters, names, or likenesses. What carries over is sparkle, magic, gems, cute creatures, and heroes with cool powers.
- No sounds, colors, or sensations that we know of bother her.
- She'll often be playing while upset, tired, or overstimulated. Design for a nervous system that's already overloaded.
- Her hands are small and imprecise, more so when she's upset. She may jab, mash, swipe wildly, use several fingers at once, or rest a palm on the screen.

## What to keep from Candy Crush

**The core loop.** Swap two adjacent pieces to make a line of three or more, matched pieces clear, new ones fall in, and cascades follow. The familiarity is part of why it works, so keep the mechanics familiar rather than reinventing them. Hold the same quality bar for feel: smooth animation, a pleasing sense of weight as pieces fall and settle, and a clear "that felt good" response to every match. It should be understandable within seconds with no tutorial text.

**Special pieces, which are central, not extras.** Matching four or five, or making an L or T shape, creates a special piece that does something amazing when it's set off, and combining two specials does something even bigger. Discovering these is the single biggest source of wonder for Harper. I want a rich set of original specials with distinct, magical effects, introduced gradually so there's always something new to discover. Her love of superheroes and fairies makes "powers" a natural fit. The effects should be spectacular in a beautiful way, not a chaotic one.

**The level map.** A winding path of levels that goes on forever, with her marker moving forward after each one. She was thrilled to reach level 5, so I want that sense of a journey. New themed areas along the way, and new special pieces introduced at milestones, would give her even more to discover. (See the instant-start requirement below: the app should open straight into her current level, not onto the map.)

**Originality.** This must be an original game. Don't use Candy Crush's name, candy art, characters, sounds, or any other protected assets. Match the genre and the quality bar, not the branding. "HarperCrush" is just the repo's working title, so please suggest a name of its own.

## What to leave out entirely

- Ads, in-app purchases, upsells, and anything that sells or nags
- Lives, energy, or any mechanic that locks her out of playing
- Countdown timers, move limits, "hurry" cues, or anything else that creates urgency
- Score counters, combo words ("Sweet!", "Divine!"), star ratings that grade her, streaks, daily rewards, and pop-ups
- Frantic celebration, confetti storms, screen shake, strobing or rapid flashing, and exclamatory text or voices. Big moments are welcome, but frantic ones aren't.
- Failure states that feel like punishment, so no "game over," red flashes, sad sounds, or losing screens. Even an invalid swap should get a soft, neutral response, like the pieces gently bouncing back, never a buzz or a shake.
- Accounts, social features, leaderboards, analytics, tracking, or third-party requests. The only network activity should be fetching the app itself and its updates.
- Any path out of the game into a browser, store, link, share sheet, or system settings that a dysregulated 5-year-old could stumble into

## The feel

Full of wonder and delight, but never frantic. Gentle on her nervous system, and definitely not bland. If it looks like a washed-out knockoff, it won't hold her, and it won't compete with the game she already knows.

**Visuals.** The game should be rich, beautiful, and genuinely appealing to a 5-year-old who loves sparkle: glowing, jewel-toned gems that catch the light, gentle shimmer and twinkle, and magical glows. It needs to look at least as polished and inviting as Candy Crush. The calm should come from smooth motion, warm sound, and the absence of pressure, not from muted colors. Avoid only what genuinely overstimulates: strobing or rapid flashing, harsh clashing colors, and visual clutter. Use rounded, friendly shapes, and make every piece type distinguishable by shape as well as color, which helps with pattern recognition and suits her love of shapes. We often play in a dark car or a dimmed plane cabin, so it needs to be comfortable in the dark. Glowing gems on a deep background might suit that well.

**Motion.** Smooth, eased motion with real weight, and nothing jittery or sudden. Even the biggest effects should flow, like a wave of light sweeping the board, rather than jolt like a blast.

**Sound.** Warm, musical feedback, like chime or marimba tones on a pentatonic scale, so cascades rise melodically and nothing is ever dissonant. Big moments can sound richer and more magical, with a sparkling run of notes or a warm swell, but never loud or harsh. Maybe add a very quiet, optional ambient bed. There should be no sudden loud sounds, including the very first one after launch. It must sound good at low volume in public places, be easy to mute, and be fully playable muted. Tell me how sound will behave with my iPhone's silent mode and with headphones.

**Touch.** Large, forgiving touch targets. Both swipe-to-swap and tap-tap-to-swap should work. Mashing, rapid tapping, and multiple fingers at once must never break anything, leave pieces stuck, or produce harsh feedback. If a web app can trigger haptics on my iPhone, a very subtle tick on a match might add to the sense of weight. Tell me what's feasible.

**Feedback.** Rewarding and generous. Every match should feel good, and big moments should feel bigger. A long cascade or a special piece going off should feel a little magical: richer and more beautiful, but not louder or more chaotic. Celebrate with blooms of light, sparkle, and warm sound, not exclamations or confetti storms.

## Two modes

Please think carefully about difficulty and propose an approach, because it matters. My current thinking is two experiences:

1. **Regulation mode**, for use mid-meltdown. It should be nearly impossible to fail or get stuck in. If she pauses, a gentle hint should appear (a soft glow on a valid swap) that invites rather than nags. The board never reaches a dead end, and if no moves exist it quietly reshuffles. Levels are short, with gentle goals she always completes, so she keeps moving forward on the map. Be generous with special pieces here, since making them and setting them off is what delights her most. Consider tuning the board so that four- and five-piece matches come up often, and whether fewer piece types and bigger pieces than Candy Crush uses would help.

2. **Play mode**, for when she's calm. This is where the "struggle with a level and beat it" value lives: gentle goals (clear a certain shape, uncover something beneath the tiles), gradually increasing difficulty, and a real sense of accomplishment, all with no pressure or punishment. Without move limits or timers, the difficulty has to come from somewhere else, such as board shapes, obstacles, or goals that need a little planning. I'd like your thinking on how to make it genuinely engaging when there's no way to lose.

Please propose how the two modes relate. I'd like her to keep advancing on the map in both modes if that works, whether through easier versions of the same levels, a separate gentle path, or something else. Also propose how a grown-up switches between modes quickly, in a car, with one hand. I suspect regulation mode should be the default every time the app opens, because that's what she needs when the phone gets handed over mid-meltdown, but tell me if you disagree.

## Endings and wind-down

Endings are where phone use most often goes wrong for us, because taking the phone away can trigger a second meltdown. So I'd like real thought given to how a session ends.

Here are some ideas, none of them settled:

- The map gives us a natural stopping point she already understands: "finish this level, and then we're done." A parent-triggered "time to finish," for when we arrive somewhere, could make the current level the last one. The session would end with her marker moving to the next stop and resting there, so I'm not the one yanking the phone away.
- After a while, the session naturally softens. The motion slows, the music settles, and the game arrives at a quiet resting point, so stopping feels like the end of a story rather than a cutoff.
- An adjustable duration, and the option to switch all of this off.

None of this should ever feel like a punishment or an abrupt stop. Please recommend a design. I'd also welcome your view on whether a subtle slow rhythm, like a glow that "breathes" at a calm breathing pace, would help her body settle, as long as it doesn't become an exercise she's told to do.

## Parent controls

There should be a parent-only settings area for sound, mode, wind-down, and anything else you think is useful. Getting into it should be quick for me but very hard for Harper to trigger by accident. A plain long-press probably isn't enough on its own, because an upset child often presses and holds. Something that relies on reading, or two deliberate steps, might work better. Please propose something.

## Technical requirements

- **Device:** It'll mostly run on my iPhone 16 Pro on current iOS, installed to the home screen from Safari. Design and test for that first, including the Dynamic Island and home indicator areas.
- **Offline:** It must work fully offline, since we're often somewhere with poor or no signal.
- **PWA:** I'd like an installable web app that lives on the home screen and launches instantly. If you think a different approach is clearly better for this use case, make the case.
- **Instant start:** The app opens straight into her current level, with no splash screen, menu, map screen, login, or "tap to start." I hand her the phone and she's playing within a second or two. If the browser needs a tap before it can play sound, make her first natural touch on the board count as that tap.
- **Resume:** Save locally and continuously, so that if the app is closed or killed mid-game she picks up on exactly the same board and the same spot on the map.
- **Updates:** Apply updates silently on a later launch. Never show an "update available" prompt or reload during play.
- **Hardened input:** Portrait only. No pinch-zoom, double-tap zoom, pull-to-refresh, text selection, or long-press callouts. It should be robust to accidental edge swipes and stray multi-touch.
- **Screen and battery:** The screen shouldn't auto-lock during active play. Be careful with battery, too: no wasted work when idle, and a dimmer, quieter state during wind-down.
- **Performance:** Smooth animation on my phone, even during the biggest special-piece effects.
- **Accessibility:** Respect reduced-motion and similar settings where sensible.
- **Assets:** Please create the art and sound yourself, generated in code or drawn from scratch, so there are no licensing questions and the app stays small and fast. It still needs to look polished and delightful, not like placeholder programmer art.
- **Code:** Keep the stack simple and dependency-light, so it's easy to maintain and doesn't rot. Write automated tests for the core game logic. They should cover match detection, cascades, and special pieces. They should also check that no new board starts with a match or with no possible moves, that a reshuffle always yields a valid move, and that generated levels can always be completed.
- **Getting it onto my phone:** The code lives in the GitHub repo dustyshelf2455/HarperCrush, and I need an easy way to put each build on my phone and try it. GitHub Pages is probably simplest, since a PWA needs HTTPS, but propose whatever's easiest and give me step-by-step instructions for anything I need to do myself.

## What a web app can't do

Some of these goals, especially "no path out of the game," can't be fully enforced by any app, because the phone's home gesture and notifications sit outside it. Please be upfront about those limits and tell me what to set up on my iPhone to cover them, such as Guided Access, plus a Focus mode so notifications don't pop up over the game. Please give me exact steps.

## How I'd like us to work

1. Restate your understanding of the goal in your own words, so I can confirm we're aligned.
2. Ask the clarifying questions that would meaningfully change the design. Keep it to the important ones, and where you have a reasonable default, suggest it instead of asking.
3. Propose a design and build plan before writing code. Include your recommendations on the two modes, the special pieces and how she discovers them, the map, endings and wind-down, the parent gate, the visual and audio direction, and the tech approach.
4. Before building the full art, show me two or three visual directions as quick mockups I can look at on my phone. Getting the look right matters as much as getting the feel right.
5. Build in small stages that I can test on a real phone. Start with a minimal, playable prototype of the core swap-match-cascade loop and its feel: the board, the pieces, motion, sound, and touch. Include at least one or two special pieces, since they're central to what delights her. Feel is the most important thing to get right, so I want to try it and give feedback before we add modes, the map, levels, and polish.
6. Flag any judgment call I might want to weigh in on.

The most important thing overall is that this feels genuinely wonderful to play: delightful, warm, and well made, full of wonder without any pressure. Harper is going to lean on it during hard moments. Quality and care matter more than feature count.
