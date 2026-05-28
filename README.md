# Scotty-Tattos — two sites in one repo

This repository hosts the source for two related but independently
deployable static sites:

| Path           | Live as              | Description                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `./` (root)    | **scottymassa.com**  | Scotty Massa's personal portfolio. Tattoo artist working out of Birkirkara, Malta, travelling worldwide. |
| `massatattoo/` | **massatattoo.com**  | The Massa Tattoo studio site. Six pages: Home, About, Portfolio, Blog, Testimonials, Contact. |

Each site is self-contained — its own pages, assets, and (where applicable)
partials. The two sites can be split into separate repositories at any time
with `git filter-repo`.

---

## Repository layout

```
Scotty-Tattos/
├── README.md
│
│  ─── shared by both sites
├── shared/
│   ├── README.md
│   └── js/
│       ├── main.js          Nav toggle, reveal-on-scroll, chips, active-nav marker
│       ├── mandala.js       Animated canvas mandala — dotwork → lotus → linework → shading
│       └── includes.js      HTML partial loader for the `<div data-include="...">` pattern
│
│  ─── scottymassa.com (lives at the root)
├── index.html              Home
├── about.html              Bio, story, stats, press, testimonial
├── portfolio.html          Filterable gallery
├── tour.html               2026 world-tour dates (open / limited / waitlist)
├── booking.html            Booking enquiry form
├── aftercare.html          Healing guide
├── contact.html            Studio info + contact form
├── geometric-tattoos.html  Geometric-tattoo SEO hub
├── journal.html            Journal index
├── journal/                Long-form articles
├── partials/
│   ├── header.html
│   └── footer.html
├── assets/
│   ├── css/styles.css      Component index — see assets/css/components/
│   ├── seo/                OG image + favicon
│   └── images/             Photography
│
│  ─── massatattoo.com (subdirectory)
└── massatattoo/
    ├── index.html          Home
    ├── about.html
    ├── portfolio.html
    ├── blog.html
    ├── testimonials.html
    ├── contact.html
    ├── partials/
    │   ├── header.html
    │   └── footer.html
    └── assets/
        ├── css/styles.css   Component index — see assets/css/components/
        └── favicon.svg
```

Both sites load the shared JS modules from `shared/js/...` (scotty
root) or `../shared/js/...` (massatattoo). For production, each
deployment must include `shared/` above its own site root — see
`shared/README.md` for the long version.

---

## Quick start

Both sites are pure HTML/CSS/JS — no build step. The studio site
(`massatattoo/`) uses `fetch()` to load header/footer partials, so it must
be served over HTTP, not opened as `file://`.

```bash
# Serve the whole monorepo
python3 -m http.server 8000
# Then visit:
#   http://localhost:8000/             → scottymassa.com
#   http://localhost:8000/massatattoo/ → massatattoo.com
```

For a sharper local approximation of production (one site per port):

```bash
# In two separate terminals:
python3 -m http.server 8001           # scottymassa.com (root)
(cd massatattoo && python3 -m http.server 8002)  # massatattoo.com
```

---

## scottymassa.com (root)

Single-artist personal portfolio. Plain HTML + CSS + a small `main.js`.
No build step.

- **Pages** — Home, About, Portfolio, Tour, Booking, Aftercare, Contact.
- **Palette** — ink black, bone white, rust red, antique gold.
- **Type** — Cinzel (display) · Inter (body) · Tangerine (script accents).
- **Components** — sticky nav, hero, marquee, 12-col portfolio grid,
  style cards, tour list, stats, quote, CTA block, footer.
- **Animation** — reveal-on-scroll via `IntersectionObserver`.

Drop real photography into `assets/images/` and lift the design into
Next.js / Astro / WordPress later if needed.

---

## massatattoo.com (`massatattoo/`)

The Massa Tattoo studio brand — multi-artist, six pages, partial-based
chrome.

- **Pages** — Home, About, Portfolio, Blog, Testimonials, Contact.
- **Palette** — warm paper/beige base, gold accent.
- **Type** — Cormorant Garamond (display) · Inter (body) · JetBrains Mono (mono).
- **Partial includes** — `<div data-include="partials/header.html"></div>`
  placeholders are replaced at runtime by `assets/js/includes.js`. Set
  `data-nav-current="<page>"` on `<body>` and the matching nav link gets
  the `is-active` class.
- **No frameworks, no bundler.** Flat directory of static files.

---

## Deploying as two sites

### Option A — two projects, one repo
Most static hosts let you point a domain at a subdirectory:
- **Netlify / Vercel / Cloudflare Pages** — create two projects from
  this repo. One has publish dir `./`, the other `./massatattoo/`. Point
  scottymassa.com at the first, massatattoo.com at the second.
- **GitHub Pages** — not directly supported per-subdirectory; use Option B.

### Option B — split into two repositories
When the sites diverge enough to warrant separate history:

```bash
# Studio site → its own repo
git clone <this-repo> massatattoo-split && cd massatattoo-split
git filter-repo --subdirectory-filter massatattoo
git remote add origin <new-massatattoo-repo>
git push -u origin main
```

The root scottymassa.com files can stay in this repo, or be split out
similarly with `git filter-repo --path <file> --invert-paths` to remove
`massatattoo/` and keep the root files.

---

## Editing & adding pages

### scottymassa.com (root)
1. Add a new `<page>.html` at the repo root.
2. Update the nav links at the top of every other root-level page.

### massatattoo.com (`massatattoo/`)
1. Add a new `massatattoo/<page>.html`.
2. Drop in the two `data-include` placeholders and load `includes.js`.
3. Set `data-nav-current` on `<body>` to one of the nav slugs.
4. Update `massatattoo/partials/header.html` and `footer.html` if the
   page should appear in nav.

---

## Photography

The first batch of photos is now wired into both sites:
- 6 tattoo pieces across both portfolios + featured-work grids
- 4 studio interior shots in About / Aftercare / split-media blocks
- 2 Scotty working portraits + 2 B&W lifestyle / atmospheric shots
  (the B&W chair shot is the scottymassa.com hero backdrop)

To add more: drop new files into `/public/` on the
`claude/keen-rubin-DMDXL-design` branch (or any branch) and I'll sort,
rename, optimise, and wire them in. The image asset layout is:

```
assets/images/                          ← scottymassa.com
├── tattoos/    chest-mandala.jpg, leg-sleeve-mandala.jpg, …
├── artist/     scotty-tattooing.jpg, portrait-bw-chair.webp, …
└── studio/     entrance-lounge.webp, treatment-room.jpg, …

massatattoo/assets/images/              ← massatattoo.com (same layout)
```

### Still-wanted shots

- **More Scotty portraits** — the current set is two working shots and
  two B&W lifestyle frames. We could use: a clean studio headshot, a wide
  environmental (full body, studio behind), a hands / detail shot, a
  candid lifestyle / on-tour shot.
- **3 distinct team portraits** for massatattoo.com — Massa (founder),
  Iris (resident dotwork), Tomas (resident fine-line). Currently the
  team grid still shows SVG illustrations because we can't mix-and-match
  1 photo with 2 SVGs without it looking lopsided.
- **More tattoo work** — particularly traditional / Japanese / colour
  pieces if Scotty has them, to broaden the portfolio beyond mandala /
  dotwork.
- **Tour city photos** — one per upcoming city for `tour.html` (optional).

---

## Browser support

Targets the last two versions of evergreen browsers (Chrome, Edge, Firefox,
Safari). Key gates: CSS custom properties, `clip-path: polygon()`,
`aspect-ratio`, `grid`, `fetch`, `Promise.all`, `IntersectionObserver`.

---

## Contributing

- Branch off `main` with `feat/...`, `fix/...`, or `claude/...-<id>` for
  Claude Code sessions.
- Keep each PR scoped to **one site** when possible. Say so in the PR
  description if it has to touch both.
- QA both sites locally with `python3 -m http.server` before opening.

---

## Roadmap

- [x] scottymassa.com — design files in place (pages, styles, JS).
- [x] massatattoo.com — six pages built in `massatattoo/`.
- [x] Hoist `main.js`, `mandala.js`, `includes.js` into the `shared/` tree.
- [x] Lotus-petal arches woven into the mandala animation.
- [x] Open Graph + Twitter Card meta, canonical and favicon on every page.
- [x] Alpha tokens (`--bone-12`, `--gold-15`, etc.) replace literal `rgba()`.
- [x] 880–980 px tightening on massatattoo so the layout doesn't read airless once the nav collapses.
- [ ] Drop real photography into `assets/images/` (scottymassa) and
      replace SVG placeholders in `massatattoo/portfolio.html`.
- [ ] Wire booking forms on both sites to a real submission endpoint.
- [ ] Per-site `sitemap.xml` for massatattoo (scottymassa already has one).
- [ ] Lighthouse pass on both sites — target 100/100/100/100.
- [ ] When ready, split into two GitHub repositories.

---

## License

All content, designs, and copy in this repository are © Scotty Massa /
Massa Tattoo. The code itself is for the studio's exclusive use — please
don't lift the design wholesale for another business.
