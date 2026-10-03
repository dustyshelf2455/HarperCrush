I'd like you to help me design and build a small, original game for my 5-year-old daughter, Harper. Please read this whole brief before doing anything. Then, before writing any code, come back with your understanding of the goal in your own words, the clarifying questions that would meaningfully change the design, and a proposed design and build plan. I'd much rather settle the design first than rework it later.

Where I suggest specific ideas below, treat them as starting points, not requirements. If you have a better idea, push back.

## Why this exists

Harper has meltdowns. Engaging her with a puzzle or building with magnet tiles helps her come out of them and regulate, but that isn't possible in a car, a parking lot, or on a plane. So right now I hand her my phone with Candy Crush on it, and it works. The core game is genuinely good for her. It's simple, rewarding, and beautifully polished, with satisfying feedback, and it exercises pattern recognition, shapes, and persistence through a hard level. But it's wrapped in ads, upsells, loud celebration, and manufactured urgency that I don't want her exposed to, least of all when she's already dysregulated.

My wife Jane and I are fine with phone use for this, temporarily, while Harper builds other regulation skills. So the goal isn't to avoid screens. It's to make the best possible version of this tool: a calm match-3 game built for her, a purpose-made regulation aid that happens to be a delightful game.

## The guiding principle

Optimize for Harper settling, not for engagement. Most mobile games are tuned to maximize time on device through variable rewards, streaks, near-misses, and escalating excitement. This game should do the opposite. Success means she's upset, she plays for a few minutes, her body calms down, and she can hand the phone back without a second meltdown. When a design choice is unclear, choose whatever serves that.

## About Harper

- She's 5 and a pre-reader. Everything she touches must work with zero reading: playing, navigating, understanding what happened. (The parent-only area can use text.)
- She loves puzzles and building, especially magnet tiles, and she responds well to shapes and pattern recognition.
- She'll often be playing while upset, tired, or overstimulated. Design for a nervous system that's already overloaded.
- Her hands are small and imprecise, more so when she's upset. She may jab, mash, swipe wildly, use several fingers at once, or rest a palm on the screen.
- Things she loves (colors, animals, themes): [FILL IN]
- Sounds, colors, or sensations that bother her: [FILL IN, or "none we know of"]
- How she plays Candy Crush today: [FILL IN, e.g. "beats early levels on her own," "mostly swipes at random," "gets frustrated when stuck"]

## What to keep from Candy Crush

Keep the fundamental gameplay: swap two adjacent pieces to make a line of three or more, matched pieces clear, new ones fall in, and cascades follow. The familiarity is part of why it works, so keep the mechanics familiar rather than reinventing them. Hold the same quality bar for feel: smooth animation, a pleasing sense of weight as pieces fall and settle, and a clear "that felt good" response to every match. It should be understandable within seconds with no tutorial text.

The bigger moments matter too. Matching four or five, or making an L or T shape, creates a special piece that clears more when matched, and that's part of the delight. I'd like calm, original equivalents of those in a later stage, once the core feel is right.

This must be an original game. Don't use Candy Crush's name, candy art, characters, sounds, or any other protected assets. Match the genre and the quality bar, not the branding. "HarperCrush" is just the repo's working title, so please suggest a name of its own.

## What to leave out entirely

- Ads, in-app purchases, upsells, and anything that sells or nags
- Lives, energy, or any mechanic that locks her out of playing
- Countdown timers, move limits, "hurry" cues, or anything else that creates urgency
- Score counters, combo words ("Sweet!", "Divine!"), star ratings that grade her, streaks, daily rewards, and pop-ups
- Loud or frantic celebration, confetti storms, screen shake, flashing, and exclamatory text or voices
- Failure states that feel like punishment, so no "game over," red flashes, sad sounds, or losing screens. Even an invalid swap should get a soft, neutral response, like the pieces gently bouncing back, never a buzz or a shake.
- Accounts, social features, leaderboards, analytics, tracking, or third-party requests. The only network activity should be fetching the app itself and its updates.
- Any path out of the game into a browser, store, link, share sheet, or system settings that a dysregulated 5-year-old could stumble into

## The feel

The game should feel calm, soft, and serene, but still satisfying. Gentle, not sedating.

**Visuals.** A soft, low-contrast pastel palette with no harsh saturation, and rounded, friendly shapes. Every piece type should be distinguishable by shape as well as color. That helps with pattern recognition and color-blindness, and it suits her love of shapes. We often play in a dark car or a dimmed plane cabin, so the game needs to be comfortable in the dark rather than a bright glare.

**Motion.** Slow, smooth, eased motion with nothing jittery or sudden. Cascades should feel like things settling into place, not like an explosion.

**Sound.** Soft, warm, musical feedback, like gentle chime or marimba tones on a pentatonic scale, so cascades rise melodically and nothing is ever dissonant. Maybe add a very quiet, optional ambient bed. There should be no sudden loud sounds, including the very first one after launch. It must sound good at low volume in public places, be easy to mute, and be fully playable muted. Tell me how sound will behave with the phone's silent switch and with headphones.

**Touch.** Large, forgiving touch targets. Both swipe-to-swap and tap-tap-to-swap should work. Mashing, rapid tapping, and multiple fingers at once must never break anything, leave pieces stuck, or produce harsh feedback. If the phone supports it, a very subtle haptic tick on a match might add to the sense of weight. Your call on whether it helps.

**Feedback.** Rewarding but proportionate. A big cascade should feel richer and more beautiful, not louder or more chaotic. Celebrate with calm visual blooms and warm sound.

**Progress.** Since she loves building, I like the idea of progress feeling like something being built or slowly growing, such as a scene that fills in as she plays, rather than numbers going up. Only do this if it adds calm and doesn't pull her attention off the board. I'm open to your ideas here.

## Two modes

Please think carefully about difficulty and propose an approach, because it matters. My current thinking is two experiences:

1. **Regulation mode**, for use mid-meltdown. It should be nearly impossible to fail or get stuck in. If she pauses, a gentle hint should appear (a soft glow on a valid swap) that invites rather than nags. The board never reaches a dead end, and if no moves exist it quietly reshuffles. Progress feels steady. The point is soothing, successful engagement, not challenge. Consider whether fewer piece types, and a smaller board with bigger pieces than Candy Crush uses, would make this easier and more satisfying.

2. **Play mode**, for when she's calm. This is where the "struggle with a level and beat it" value lives: gentle goals (clear a certain shape, uncover something beneath the tiles), gradually increasing difficulty, and a real sense of accomplishment, all with no pressure or punishment. Without move limits or timers, the difficulty has to come from somewhere else, such as board shapes, obstacles, or goals that need a little planning. I'd like your thinking on how to make it genuinely engaging when there's no way to lose.

Please propose how the two modes relate, and how a grown-up switches between them quickly, in a car, with one hand. I suspect regulation mode should be the default every time the app opens, because that's what she needs when the phone gets handed over mid-meltdown, but tell me if you disagree.

## Endings and wind-down

Endings are where phone use most often goes wrong for us, because taking the phone away can trigger a second meltdown. So I'd like real thought given to how a session ends.

Here are some ideas, none of them settled:

- After a while, the session naturally softens. The motion slows, the colors and music settle, and the game arrives at a quiet resting point, like a completed scene, a lantern dimming, or something going to sleep. Stopping should feel like the end of a story rather than a cutoff.
- A parent-triggered "time to finish," for when we arrive somewhere. She gets a few more matches, and then the game gently closes on its own, so I'm not the one yanking it away.
- An adjustable duration, and the option to switch all of this off.

None of this should ever feel like a punishment or an abrupt stop. Please recommend a design. I'd also welcome your view on whether a subtle slow rhythm, like a glow that "breathes" at a calm breathing pace, would help her body settle, as long as it doesn't become an exercise she's told to do.

## Parent controls

There should be a parent-only settings area for sound, mode, wind-down, and anything else you think is useful. Getting into it should be quick for me but very hard for Harper to trigger by accident. A plain long-press probably isn't enough on its own, because an upset child often presses and holds. Something that relies on reading, or two deliberate steps, might work better. Please propose something.

## Technical requirements

- **Device:** It'll mostly run on my [FILL IN: phone model and OS, e.g. "iPhone 15, latest iOS"]. Design and test for that first.
- **Offline:** It must work fully offline, since we're often somewhere with poor or no signal.
- **PWA:** I'd like an installable web app that lives on the home screen and launches instantly. If you think a different approach is clearly better for this use case, make the case.
- **Instant start:** The app opens straight into the game, with no splash screen, menu, login, or "tap to start." I hand her the phone and she's playing within a second or two. If the browser needs a tap before it can play sound, make her first natural touch on the board count as that tap.
- **Resume:** Save locally and continuously, so that if the app is closed or killed mid-game she picks up on exactly the same board.
- **Updates:** Apply updates silently on a later launch. Never show an "update available" prompt or reload during play.
- **Hardened input:** Portrait only. No pinch-zoom, double-tap zoom, pull-to-refresh, text selection, or long-press callouts. It should be robust to accidental edge swipes and stray multi-touch.
- **Screen and battery:** The screen shouldn't auto-lock during active play. Be careful with battery, too: no wasted work when idle, and a dimmer, quieter state during wind-down.
- **Performance:** Smooth 60fps on a typical modern phone.
- **Accessibility:** Respect reduced-motion and similar settings where sensible.
- **Assets:** Please create the art and sound yourself, generated in code or drawn from scratch, so there are no licensing questions and the app stays small and fast.
- **Code:** Keep the stack simple and dependency-light, so it's easy to maintain and doesn't rot. Write automated tests for the core game logic. They should cover match detection and cascades, check that no new board starts with a match or with no possible moves, and check that a reshuffle always yields a valid move.
- **Getting it onto my phone:** The code lives in the GitHub repo dustyshelf2455/HarperCrush, and I need an easy way to put each build on my phone and try it. GitHub Pages is probably simplest, since a PWA needs HTTPS, but propose whatever's easiest and give me step-by-step instructions for anything I need to do myself.

## What a web app can't do

Some of these goals, especially "no path out of the game," can't be fully enforced by any app, because the phone's home gesture and notifications sit outside it. Please be upfront about those limits and tell me what to set up on the phone to cover them. That might be iOS Guided Access or Android screen pinning, plus Do Not Disturb so notifications don't pop up over the game. Please give me exact steps.

## How I'd like us to work

1. Restate your understanding of the goal in your own words, so I can confirm we're aligned.
2. Ask the clarifying questions that would meaningfully change the design. Keep it to the important ones, and where you have a reasonable default, suggest it instead of asking.
3. Propose a design and build plan before writing code. Include your recommendations on the two modes, endings and wind-down, the parent gate, the visual and audio direction, and the tech approach.
4. Build in small stages that I can test on a real phone. Start with a minimal, playable prototype of just the core swap-match-cascade loop and its feel: the board, the pieces, motion, sound, and touch. Feel is the most important thing to get right, so I want to try it and give feedback before we add modes, levels, and polish.
5. Flag any judgment call I might want to weigh in on.

The most important thing overall is that this feels genuinely good to play: warm, calm, and well made. Harper is going to lean on it during hard moments. Quality and care matter more than feature count.
