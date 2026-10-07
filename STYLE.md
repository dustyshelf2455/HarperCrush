# Glimmerfall style guide

Settled in the art summit of 6 October 2026 (thread "Art style and roadmap"; samples, prompts and mockups in the project's `art/style/` folder). Every painted piece in the game is made against this guide. Read it before generating anything.

## The one rule that protects the feel

**Pictures are the body, code is the light.** A picture is the painted thing itself with no glow halo of its own. Every glow, sparkle, breathing aura, hint pulse, win shimmer, ring and ripple stays code-drawn on top. Each picture stands on the same anchor point the code-drawn piece used, so hops, landings, falls and swaps are untouched, and the code-drawn version stays as the fallback until the picture loads (nothing ever waits on a file).

## The hand

Every prompt starts with this paragraph, word for word:

> THE STYLE: hand-painted storybook illustration, like a loving picture book painted in gouache and watercolour. Visible soft brushwork, soft edges, gentle glow painted as light. Rich, saturated jewel colours, never pastel, never washed out, never muddy. Warm, magical, cosy and full of wonder, comfortable to look at in the dark.

For characters add: *extra cute: bigger round heads, large shining eyes with big highlights, rosy cheeks, tiny bodies, big happy smiles, very huggable, like a plush toy brought to life.* For gems add: *painted jewels with a few simple facets, glowing softly from within, not glossy plastic, not 3D renders.*

Lighting: everything lit from the upper left. Backgrounds: deep midnight blue to blue-green night, darkest where gems or small pieces will sit. Nothing borrowed: no known characters, logos, costumes or symbols.

## The cast

- **Fairy** (the default companion): tiny fairy girl, leaf-green dress with pink petals at the hem, pink flower in honey-blonde hair, pointed ears, translucent sparkling wings, star wand, glows green and pink.
- **Kid dragon**: sapphire-blue baby dragon, paler tummy, tiny wings, horn nubs, curled tail, a wisp of sparkles instead of fire, glows blue.
- **Little hero**: hooded cowl with tiny ears (no mask), violet suit, gold star on the chest, rose-red cape, hands on hips, glows violet and gold.

Each companion needs: awake facing right, asleep curled up, and (later) a waving pose. The code names stay `firefly`, `fish`, `hero` for save compatibility; the pictures are what she sees.

## The gems

Star gold, heart rose pink, drop sapphire (point up), leaf emerald, diamond amethyst, sunstone coral (rounded hexagon). Painted body only, cut to a 256 px square with the body filling about 183 px; the sprite cache draws it at 3.1 radii. A soft, still glow in the gem's own colour sits under each gem on the board, at about two thirds of the strength tried in `art/style/choice3b` (code-drawn, or baked as a second layer; either is fine as long as it never breathes).

The coloured powers are whole painted pieces, not gems with an ornament (parent, 7 October: a special should turn into a thing of the board, as a match turns into a special candy): a shooting star (comet), a closed flower bud (bloom), a winged wisp with a face (sprite), an eight-pointed star jewel (starburst) and a crescent moon cradling a pearl (moonrise), each painted in all six gem colours so the colour still reads for matching (`powers/<family>-<gem>.png`, prompts in `art/batchA/`). The Orb and the Aurora are colourless painted pieces of their own. Their moving parts (streak, swirl, opening, rays, beams) stay in code.

Light on the board never goes pure white (parent, 7 October): rings, sparkles and the win rim use the gem's own glow colour or a warm gold, because lightened tints under additive blending washed out to white, which nothing else in the painting is.

## The board

- Seven by eight in Play (the ninth row was tried on 6 October and dropped the next day: with the painted backdrops it cluttered the board), six by nine in Calm, moved to the top of the screen just under the lantern row, so the landscape shows below the board.
- Cells stay the barely-there glass of Deep Night Garden (painted cells were tried and declined).
- The companion beside the top lantern is drawn at about 62 px, half again the old size.
- Behind the board: a portrait painting per area (1024 by 1536), sky at the top, quiet and dark through the middle, scenery only in the bottom fifth, smoother sky grain than the first try so it reads at phone size.

## The map

The map is a scrolling storybook: each area is two or three tall painted sections (1024 by 1536) with the path painted into the landscape (grass over its edges, a brook and bridge, bushes, mushrooms, glowing flowers, fireflies). The path leaves every section at the top centre and enters the next at the bottom centre, so sections chain forever. Each section ships with a short list of points along its painted path (in picture coordinates), and the code places the lanterns, the companions and all the light on those points. No sky or horizon on map sections; the old perspective stage and the code-drawn road ribbon go.

Lantern posts: lit and unlit cut-outs, lamp centre at 0.7 of the picture's height from the bottom. The seven areas follow the approved strip in `art/style/choice4-seven-areas.jpg`: Twinkle Meadow, Crystal Cave, Mermaid Lagoon, Cloud Castle, Star Garden, Aurora Peak, Dragon Hollow.

## Stage 4 pieces

Approved sheet in `art/style/choice5-play-pieces.jpg`: frost (one and two layers, with a hint of the hidden picture showing through the single layer), vine holding a gem, cloud puff, moonstone block, star-seed and its sprouted flower, bubbles holding a baby dragon or a fairy, and hidden pictures (sleeping creatures, treasures, castle windows) revealed as frost clears. All cell-fit 256 px cut-outs except the hidden pictures, which are painted at the board's size.

## The launch picture

`splash.jpg` in the theme folder (1024 by 1536, prompt in `art/batchA/splash-prompt.txt`): the name Glimmerfall painted in glowing storybook letters in the upper third, the fairy below it scattering jewels that drift down, a quiet meadow at the bottom, everything important inside the central sixty percent of the width. The code sky above it on tall phones starts from the painting's own top colour (`#192546`), so the join is invisible; the stars, the drifting glimmers and the fade are code (DESIGN.md 2f, `src/game/splash.ts`).

## Files, sizes, themes

- Pictures live under `public/art/<theme>/...` with the same file names in every theme; `default` is this guide's set. A later reskin (a superhero night, a birthday) is a second folder picked from the grown-up panel; motion, sound and the powers' light are shared.
- PNG with transparency for cut-outs, JPEG for backdrops and map sections. Keep the whole default theme under about 6 MB so launch stays instant offline, and list every new file in the service worker's asset list in `vite.config.ts`.
- Generation: GPT Image 1.5, high quality (medium for textures), through the project's proxy with `stream: true` and `partial_images` of at least 1; one request at a time. Prompts are saved beside the pictures they made.
- Every batch is checked before it ships: transparent background clean, one piece per cell, nothing clipped, legible on the real board at phone size and with the night dimmer on, then screenshots for Ben and a "Deploy?" question.
