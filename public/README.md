# /public — image drop zone

Upload your tattoo, studio, and artist photos here. I'll pick them up from
this folder, sort, rename, optimise, and wire them into the right places on
both sites — then delete `/public/`.

## How to upload

Easiest: on GitHub, navigate to this folder on the
`claude/keen-rubin-DMDXL-design` branch, click **Add file → Upload files**,
drag-and-drop everything in, and commit. (Multi-select works.)

You don't need to sort — drop everything in `public/` and I'll organise.
The subfolders below are just a convenience if you want to pre-sort, and
each has its own README with a more specific shot list.

- `public/tattoos/` — finished tattoo work
- `public/studio/` — studio interior, treatment room, flash wall, reception
- `public/artist/` — Scotty portraits, tattooing-in-progress, lifestyle

---

## Suggested shot list

This is the photography we need to fully build out both sites. ☆ = critical,
○ = nice-to-have, ✚ = we've got some but need more.

### Tattoo work — `public/tattoos/`

For the portfolios on **both** sites. Aim for a mix of styles, body
placements, and zoom levels.

| # | Shot | Use |
|---|---|---|
| ☆ | Back / shoulder mandala (dotwork) | Portfolio hero tile |
| ☆ | Full leg sleeve — chrysanthemum + mandala | Portfolio wide tile |
| ☆ | Chest / collarbone mandala dotwork | Portfolio portrait tile |
| ☆ | Hip / side piece — leopard + mandala | Portfolio portrait tile |
| ☆ | Hand / wrist mandala | Portfolio square tile |
| ☆ | Forearm dotwork or geometric piece | Portfolio square tile |
| ☆ | Calf or shin mandala | Portfolio portrait tile |
| ○ | Black-and-grey portrait piece | Portrait-style category fill |
| ○ | Traditional / colour piece | Adds range to the grid |
| ○ | Japanese-style back piece | Adds range to the grid |
| ○ | Cover-up — before / after pair | Compelling case-study tile |
| ○ | Fine-line / single-needle detail | Adds range to the grid |
| ✚ | **More in-progress shots** — fresh ink with stencil/gloves visible | Adds process / authenticity |

**Goal:** 12–15 finished tattoo photos minimum. More = better filtering.

---

### Studio interior — `public/studio/`

For the About / Studio / Contact pages on both sites.

| # | Shot | Use |
|---|---|---|
| ☆ | **Entrance / lounge** — wide shot showing the welcome area | Studio hero on About |
| ☆ | **Treatment room** — the chair, lighting, equipment | About / Process step 3 |
| ☆ | **Reception desk** — with the MASSA signage | Contact page header |
| ☆ | **Flash wall** — framed art / pinup wall | About split-media block |
| ☆ | **Consultation room** — desk, plants, the meeting space | About / Process step 1 |
| ○ | Detail — ink pots, tools, sketchbook on the desk | Process step 2 |
| ○ | Storefront / exterior — the studio from the street | Contact page footer |
| ○ | Mood shot — low-light, atmosphere, no people | Hero background blur |

**Goal:** 6–8 well-lit interior shots, ideally at the same time of day.

---

### Scotty portraits — `public/artist/`  ☆ priority gap

This is the category we're shortest on. We want **3–5 strong portraits**,
varied enough that we don't reuse the same one across the site.

| # | Shot | Use |
|---|---|---|
| ☆ | **Headshot** — clean, studio light, eye contact, 4:5 vertical | About hero |
| ☆ | **Working shot** — Scotty tattooing, gloves on, machine in hand, looking at the work | Process / Home featured |
| ☆ | **Wide environmental** — full body or 3/4, in the studio, working chair behind | Hero background / About split |
| ○ | **Detail of hands** — gloves, machine, ink — no face needed | Process step / blog header |
| ○ | **Casual / off-duty** — outside the studio, on tour, with a coffee | Tour page / About lifestyle |
| ○ | **Black-and-white** of any of the above | Dark-section variants |
| ○ | **Profile / over-the-shoulder** while tattooing — non-eye-contact alt | Variation for repeated pages |
| ○ | **Portrait with art** — Scotty next to a finished sketch or flash | About / Press feature |

**Format guidance for portraits:**
- **4:5 vertical** is the most flexible aspect (works on hero, split, card).
- Catch-light in the eyes if it's a headshot.
- Studio interior context preferred over plain white backdrop — it ties
  the artist to the space.

---

## What I'll do after upload

1. **Rename** each file with a descriptive slug
   (e.g. `mandala-back-shoulder.jpg`, `portrait-headshot-studio.jpg`).
2. **Optimise** anything over ~500 KB
   (JPG quality ≈ 82, max-width 1600 px) so pages stay snappy.
3. **Move** the renamed/optimised copies into:
   - `assets/images/` — scottymassa.com
   - `massatattoo/assets/images/` — massatattoo.com (where appropriate)
4. **Wire them in** — replace placeholder gradients
   (`.ph-1` … `.ph-9`) on scottymassa, replace SVG placeholders on
   massatattoo's portfolio / home / testimonials, slot studio shots into
   the About / split-media blocks, and put a strong Scotty portrait into
   the About hero.
5. **Delete `/public/`** once everything has landed in its final home —
   it's just a staging area.

---

## File-format notes

- **JPG** is fine for photography (smaller than PNG for the same quality).
- **PNG** preferred for graphics / logos / anything with transparency.
- **HEIC** (iPhone) is OK to upload — I'll convert to JPG.
- No need to crop — I'll handle cropping at the CSS layer with
  `object-fit: cover`.

## File size

Push whatever you have. If something's huge (10 MB+), I'll re-encode it
before committing the final version, but originals are useful in case
we want a higher-resolution print version later.
