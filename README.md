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
│   ├── css/styles.css      Authoring index of @imports — see components/
│   ├── css/styles.min.css  GENERATED: the flattened, minified bundle
│   ├── seo/                OG image + favicon
│   └── images/             Photography (WebP, plus -480 srcset rungs)
├── tools/
│   ├── build-assets.mjs    CSS bundle, JS minify, asset hashes, CSP
│   ├── build-seo.py        Breadcrumbs, sitemap.xml, robots.txt
│   └── optimise-images.py  JPEG -> WebP + responsive variants
├── vercel.json             Cache + security headers (CSP is generated)
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

## Build step (scottymassa.com)

The pages are still hand-authored HTML, but the CSS, JS and SEO files they
reference are generated. **Edit the sources, then run the build:**

```bash
npm install          # once — pulls esbuild
npm run build        # build:seo, then build:assets
```

| You edit                      | The build produces                      |
| ----------------------------- | --------------------------------------- |
| `assets/css/components/*.css` | `assets/css/styles.min.css` (one file)  |
| `shared/js/*.js`              | `shared/js/*.min.js`                    |
| any page's `<h1>`, canonical  | its breadcrumb, `sitemap.xml`, `robots.txt` |
| any inline `<script>`         | the CSP `script-src` hashes in `vercel.json` |

Never edit a `.min.*` file, `sitemap.xml`, `robots.txt`, or anything between
the `BREADCRUMB:begin/end` markers — the next build overwrites them.
`npm run check` exits non-zero if the generated SEO files are stale, so it
works as a pre-deploy or CI guard.

Two things the build deliberately does:

- **`assets/css/styles.css` stays an `@import` index for authoring only.**
  Shipped as-is it cost 30 chained round trips, because the browser cannot
  discover `hero.css` until `styles.css` has arrived and parsed. The build
  flattens it into one file and rewrites the `url()` paths.
- **Asset URLs carry a `?v=<content hash>`,** which is what lets
  `vercel.json` serve them `immutable` for a year. The hash changes when the
  file does, so there is nothing to purge.

Photography is converted separately, when a photo is added or replaced:

```bash
pip install pillow && npm run build:images
```

That re-encodes any JPEG under `assets/images/` as WebP and writes the
`-480.webp` rung that the `srcset`s in `index.html` and `portfolio.html`
point at.

---

## Quick start

The studio site (`massatattoo/`) uses `fetch()` to load header/footer
partials, so it must be served over HTTP, not opened as `file://`.

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

Single-artist personal portfolio. Hand-authored HTML + CSS + a small
`main.js`; see **Build step** above for the generated files.

- **Pages** — Home, About, Portfolio, Tour, Booking, Aftercare, Contact.
- **Palette** — ink black, bone white, rust red, antique gold.
- **Type** — Cinzel (display) · Inter (body) · Tangerine (script accents).
- **Components** — sticky nav, hero, marquee, 12-col portfolio grid,
  style cards, tour list, stats, quote, CTA block, footer.
- **Animation** — reveal-on-scroll via `IntersectionObserver`.

Drop real photography into `assets/images/` and lift the design into
Next.js / Astro / WordPress later if needed.

---

## Booking flow (scottymassa.com)

Two steps, per `docs` discussion with Scotty on how premium enquiries should
be filtered before they reach his calendar:

1. **`booking.html`** — name + email, plus a *separate, unticked* checkbox
   for general marketing (guest spots/travel/flash/conventions). Posts to
   `api/booking-lead.js`, which emails the client the process/pricing brief
   and pings the studio inbox, then redirects to `booking-thank-you.html`.
2. **`booking-thank-you.html`** — offers both paths: jump straight into
   `booking-application.html` now, or wait for the process email and come
   back later. Either way the lead is already captured.
3. **`booking-application.html`** — the full structured application
   (origin, placement, scale, concept, reference images, body-area photos,
   18+ / photo-ID / pricing acknowledgements). Posts multipart form data to
   `api/booking-application.js`, which emails the complete application
   (with attachments) to the studio inbox and confirms receipt to the
   client. Lands on `booking-application-received.html`.

`privacy.html` documents what's collected and why, and is linked from both
forms and the footer.

**Email** is sent via [Resend](https://resend.com) (`api/_lib/email.js`,
a plain `fetch` wrapper — no SDK dependency). Configure `RESEND_API_KEY`,
`RESEND_FROM_EMAIL` and `BOOKING_NOTIFY_EMAIL` as Vercel project env vars —
see `.env.example`.

**File uploads** go straight through the serverless function as email
attachments (no object storage yet) — capped client- and server-side at
2MB/file, 3 files per field, ~4MB combined, to stay under Vercel's request
body limit. If that turns out to be too tight in practice, the fix is
switching to direct-to-[Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
client uploads rather than raising the cap.

**Lead scoring** (`api/_lib/leadScore.js`) computes a stateless 0–100 "how
promising is this" score at submission time from the fields already on the
application (style fit, scale, travel commitment, reference material,
concept detail). It's shown only in the studio's internal notification
email as a triage aid — never to the client, and never used to auto-decline
anything. Adjust the weights there as Scotty's actual acceptance patterns
become clear.

### Deliberately not built yet

This pass is front-end + email-relay only. Scotty separately sketched a
much larger system (CRM-style lead states, a review dashboard, Calendly +
Google Calendar, Stripe deposits, an automated training funnel) — all of
it is sound direction, but each piece needs either a real third-party
account (Calendly, Stripe, an ESP like AWeber) or an infrastructure
decision (which database, which auth) that's out of scope for a
static-site PR. Treat this as Phase 1: every enquiry still reaches the
studio inbox and every Step-1 lead still gets captured (via the internal
notification email), just without persistence or automation beyond the
two transactional emails above.

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
- [x] Wire scottymassa.com's booking flow to a real submission endpoint
      (see "Booking flow" below). `massatattoo/contact.html`'s booking form
      is still a client-side stub — not in scope for this pass.
- [ ] Per-site `sitemap.xml` for massatattoo (scottymassa already has one).
- [ ] Lighthouse pass on both sites — target 100/100/100/100.
- [ ] When ready, split into two GitHub repositories.

---

## License

All content, designs, and copy in this repository are © Scotty Massa /
Massa Tattoo. The code itself is for the studio's exclusive use — please
don't lift the design wholesale for another business.
