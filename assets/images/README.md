# Image assets — scottymassa.com

Photographs that back the site, organised by category. All images are
optimised to ≤ 1600 px on the long edge at ~q82.

```
assets/images/
├── tattoos/    Finished tattoo work (backs .ph-1 … .ph-14)
├── artist/     Scotty portraits, lifestyle, working shots
└── studio/     Studio interior — entrance, reception, treatment room, etc.
```

## Where each is used

- `tattoos/*.webp` → `.ph-1` … `.ph-14` in
  `assets/css/components/portfolio.css`. `.ph-1` … `.ph-9` drive the home
  featured-work block (`index.html`), the geometric gallery
  (`geometric-tattoos.html`) and the first nine portfolio tiles; `.ph-10` …
  `.ph-14` extend the portfolio archive (`portfolio.html`). The current set is
  the black-and-grey geometric / mandala / dotwork library:
  `geo-sleeve-architectural`, `geo-owl-calf`, `geo-chrysanthemum-leg`,
  `mandala-nape`, `geo-ribs-thigh`, `geo-skull-back`, `mandala-hand`,
  `mandala-elbow`, `geo-serpent-forearm`, `mandala-shoulder`,
  `mandala-half-sleeve`, `geo-lion-leg`, `geo-suminagashi-hip`,
  `geo-hexagon-thigh`.
- `artist/portrait-bw-chair.webp` → backdrop of the home hero
  (`.hero__bg`, dimmed with red/black overlays).
- `artist/scotty-tattooing.jpg` → About bio split-media
  (`.ph-portrait-tattooing`).
- `artist/scotty-vondutch.jpg` → `.ph-portrait-vondutch` (available; not
  currently slotted in).
- `studio/entrance-lounge.webp` → home intro split-media
  (`.ph-studio-entrance`).
- `studio/flash-wall-color.jpg` → About "road" split-media
  (`.ph-studio-flash-color`).
- `studio/treatment-room.jpg` → Aftercare split-media
  (`.ph-studio-treatment`).

## Adding new photos

1. Drop files into `/public/` on the branch (any name, any format).
2. I'll rename, optimise (≤ 1600 px, q82), move into the right subfolder.
3. Add a new `.ph-portrait-*` / `.ph-studio-*` class in `styles.css`
   (or extend `.ph-1` … `.ph-9` if it's a portfolio tile).
4. Reference the class from the relevant `.html` page.
