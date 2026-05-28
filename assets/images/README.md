# Image assets

Replace the gradient placeholders (`.ph-1` … `.ph-9` in `assets/css/styles.css`)
with real photography in this directory.

## Suggested set

- `hero.jpg` — full-bleed hero image (1920 × 1080 minimum)
- `portrait.jpg` — Scotty in the studio (4:5)
- `studio.jpg` — interior shot (4:5)
- `tour-*.jpg` — one per tour city (4:5)
- `portfolio/*.jpg` — gallery pieces, named by style + subject
  (e.g. `traditional-snake-dagger.jpg`)

## Naming convention

```
portfolio/<style>-<subject>-<placement>.jpg
```

Keep originals 2400 px on the long edge; generate 1200 / 800 / 480 variants
for responsive `srcset` when wiring up production.
