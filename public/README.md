# /public — image drop zone

Upload your tattoo and studio photos here. I'll pick them up from this folder,
sort, rename, optimise, and wire them into the right places on both sites.

## How to upload

Easiest: on GitHub, navigate to this folder on the
`claude/keen-rubin-DMDXL-design` branch, click **Add file → Upload files**,
drag-and-drop everything in, and commit. (Multi-select works.)

You don't need to sort them into subfolders — drop them in the root of
`public/` and I'll sort. The subfolders below are just a convenience if
you'd rather pre-sort.

## Suggested subfolders (optional)

- `public/tattoos/` — finished tattoo work (mandala, dotwork, ornamental, etc.)
- `public/studio/` — studio interior, treatment room, flash wall, reception
- `public/artist/` — artist portraits, tattooing-in-progress, lifestyle

## What I'll do after upload

1. **Rename** each file with a descriptive slug (e.g. `mandala-back-shoulder.jpg`).
2. **Optimise** anything over ~500 KB (JPG quality ≈ 82, max-width 1600 px) so
   pages stay snappy.
3. **Move** the renamed/optimised copies into:
   - `assets/images/` — scottymassa.com
   - `massatattoo/assets/images/` — massatattoo.com (where appropriate)
4. **Wire them in** — replace placeholder gradients (`.ph-1` … `.ph-9`) on
   scottymassa.com's portfolio and home, replace SVG placeholders on
   massatattoo.com's portfolio / home / testimonials, and slot studio shots
   into the About / split-media blocks.
5. **Delete `/public/`** once everything has landed in its final home — it's
   just a staging area.

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
