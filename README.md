# Scotty-Tattos · Massa Tattoo

A static, dependency-free marketing site for **Massa Tattoo** — a private,
appointment-based studio specialising in sacred geometry, dotwork, blackwork,
and fine-line work. Every page is hand-authored HTML/CSS/JS; there is no build
step, no framework, and no bundler. The visual system is built around a warm
beige/brown palette, three typefaces, and an inventory of in-line SVG
geometric motifs.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Project structure](#project-structure)
3. [Pages](#pages)
4. [Partials & the include system](#partials--the-include-system)
5. [Design system](#design-system)
6. [JavaScript modules](#javascript-modules)
7. [Editing & adding pages](#editing--adding-pages)
8. [Accessibility & performance](#accessibility--performance)
9. [Browser support](#browser-support)
10. [Deployment](#deployment)
11. [Contributing](#contributing)
12. [Roadmap](#roadmap)
13. [License](#license)

---

## Quick start

Because the site is pure HTML/CSS/JS you can open any page directly in a
browser. However, the partial-include system (`fetch()` for the header and
footer) requires HTTP — so use a local static server when developing.

```bash
# Clone the repo
git clone https://github.com/new-u-peptides/Scotty-Tattos.git
cd Scotty-Tattos

# Serve with whichever static server you prefer
python3 -m http.server 8000           # → http://localhost:8000/contact.html
# or
npx serve .                            # → http://localhost:3000
# or
php -S localhost:8000
```

Then visit `http://localhost:8000/contact.html` (or whichever page you are
working on).

> **Why a server?** Browsers block `fetch()` against `file://` URLs for
> security. Opening the file directly will render the page body, but the
> header and footer partials will silently fail to load.

---

## Project structure

```
Scotty-Tattos/
├── README.md                     ← you are here
├── contact.html                  ← the Contact / Booking page
├── partials/
│   ├── header.html               ← top nav (loaded into every page)
│   └── footer.html               ← site footer (loaded into every page)
└── assets/
    └── js/
        ├── includes.js           ← partial loader + active-nav highlighter
        ├── tattoo-gun.js         ← (optional) decorative gun SVG mount
        ├── cursor-gun.js         ← (optional) custom cursor effect
        ├── scroll-reveal.js      ← (optional) reveal-on-scroll observer
        └── hero-geometry.js      ← (optional) extra hero animations
```

Files marked *(optional)* are referenced by the pages but degrade gracefully
when missing — the `<script onerror="this.remove();">` handler keeps a
missing file from polluting the console, and the init block guards every call
behind a feature check (`if (MT.TattooGun) …`).

---

## Pages

| Page          | File             | Status     | Description                                           |
| ------------- | ---------------- | ---------- | ----------------------------------------------------- |
| Contact       | `contact.html`   | ✅ Done    | Hero, info card, booking form, style strip, map, FAQ. |
| Index         | `index.html`     | ⏳ Planned | Landing page with rotating geometry centerpiece.      |
| Artists       | `artists/`       | ⏳ Planned | Artist roster with bios and links.                    |
| Portfolio     | `portfolio/`     | ⏳ Planned | Filterable gallery of work.                           |
| Studio        | `studio/`        | ⏳ Planned | Photos and description of the physical space.         |
| Aftercare     | `aftercare/`     | ⏳ Planned | Healing instructions.                                 |
| Deposits      | `deposits/`      | ⏳ Planned | Booking policy.                                       |
| Privacy/Terms | `privacy/`, …   | ⏳ Planned | Legal pages.                                          |

The nav and footer link to all of the planned pages. Until they exist, those
links will return a 404 — keep that in mind when QA'ing.

---

## Partials & the include system

To keep the global chrome (nav, footer) in one place, each page leaves a
placeholder `<div>` and lets `assets/js/includes.js` fetch the partial at
runtime:

```html
<!-- top of <body> -->
<div data-include="partials/header.html" data-nav-current="contact"></div>

<!-- page content here -->

<!-- bottom of <body> -->
<div data-include="partials/footer.html"></div>

<script src="assets/js/includes.js"></script>
```

### What `includes.js` does

1. Snapshots the value of `data-nav-current` from the page **before** the
   placeholder is replaced.
2. For every element with `[data-include]`, fetches the referenced HTML and
   replaces the placeholder with the rendered nodes (preserving document
   order).
3. After all partials have settled:
   - Finds the link in the loaded nav matching `data-nav="<current>"` and
     adds `is-active`.
   - Stamps the current year into `#year` (used by the footer copyright).
   - Dispatches a `partials:loaded` event on `document` so other scripts can
     wait for the chrome to be in place.

### Adding a new page

1. Create `<page>.html` (or `<page>/index.html`).
2. Drop in the two `data-include` placeholders.
3. Set `data-nav-current` to one of: `index`, `artists`, `portfolio`,
   `studio`, `contact`.
4. Load `assets/js/includes.js` at the bottom of `<body>`.

Done — the new page now shares the global header and footer.

---

## Design system

All design tokens live as CSS custom properties at the top of each page's
`<style>` block. The intent is to eventually extract these into a shared
`assets/css/tokens.css`; for now they're duplicated per page to keep each
file self-contained.

### Palette

| Token         | Value      | Use                                |
| ------------- | ---------- | ---------------------------------- |
| `--paper`     | `#F2EADB`  | Page background                    |
| `--cream`     | `#F5EFE6`  | Light surface, light text on dark  |
| `--sand`      | `#EADFCB`  | Alt section background             |
| `--linen`     | `#E2D3B8`  | Decorative fills (hex icons, map)  |
| `--taupe`     | `#C8B6A0`  | Borders on the map blocks          |
| `--clay`      | `#A88B6C`  | Muted labels, the eyebrow rule     |
| `--walnut`    | `#8B6F47`  | Accent strokes, hover states       |
| `--espresso`  | `#5C4033`  | Body links                         |
| `--bark`      | `#3D2817`  | Primary heading / icon colour      |
| `--ink`       | `#1F140B`  | Dark sections, the booking form    |
| `--gold`      | `#B8956A`  | Dark-on-gold accent (CTA, eyebrow) |

### Typography

| Family                   | CSS var    | Use                                |
| ------------------------ | ---------- | ---------------------------------- |
| Cormorant Garamond (500) | `--serif`  | Headings, info values, FAQ summary |
| Inter (300–600)          | `--sans`   | Body copy, form inputs             |
| JetBrains Mono (400–500) | `--mono`   | Eyebrows, labels, hours, CTAs      |

All three are pulled from Google Fonts via a single `<link>` per page.

### Geometric motifs

The site leans heavily on inline SVG for visual character. The recurring
shapes:

- **Flower of Life + Metatron overlay** — hero centerpiece.
- **Seigaiha waves** — background ornament on the hero corner.
- **Hexagon frames** — wrap each contact-info icon.
- **Diamond + line dividers** — section breaks (`.geo-rule`).
- **Clipped polygon "chip"** — CTAs, style chips, pin labels.
- **Voronoi-ish grid** — the studio location map.

All animations respect `prefers-reduced-motion: reduce` and pause when the
user has opted out.

---

## JavaScript modules

`includes.js` is the only required script. The remaining modules are
decorative and load defensively (`<script onerror="this.remove();">`):

- **`tattoo-gun.js`** — mounts an animated tattoo-gun SVG into a host
  element. Expected API: `window.MT.TattooGun.mount(selector, { width })`.
- **`cursor-gun.js`** — replaces the cursor with a small gun SVG.
  Expected API: `window.MT.CursorGun.init()`.
- **`scroll-reveal.js`** — `IntersectionObserver`-based reveal animations.
  Expected API: `window.MT.ScrollReveal.init()`.
- **`hero-geometry.js`** — additional motion on the hero centerpiece.
  Expected API: `window.MT.HeroGeometry.init()`.

None of these files exist yet — they're declared as no-ops so the page works
without them. Add them by exposing `window.MT = window.MT || {}` and hanging
your namespace off of it.

---

## Editing & adding pages

### Conventions

- **Class names** follow a loose BEM: `block`, `block__element`,
  `block--modifier`. New components should follow suit.
- **One `<style>` block per page** keeps file context tight. If a style is
  reused on three or more pages, lift it into `assets/css/`.
- **No JS frameworks.** If you reach for one, stop and ask.
- **No build step.** All paths are relative; the site must work when served
  from a subdirectory (e.g. `/web/`).
- **Inline SVG over icon fonts** — keeps the design system in one repo.

### Numbered sections

Eyebrows on each page are numbered (`§ 01 — Contact`, `§ 02 — The studio`,
etc.). When you add a new section, renumber every eyebrow on that page so
the sequence stays continuous.

---

## Accessibility & performance

- All interactive elements have visible focus styles inherited from the
  browser default; the form fields show a focused border in
  `--gold`.
- Decorative SVGs are marked `aria-hidden="true"`.
- The `<details>`/`<summary>` accordion is keyboard-accessible by default.
- Animations honour `prefers-reduced-motion`.
- Fonts are preconnected (`<link rel="preconnect">`) and loaded via a single
  request.
- No external JS dependencies — total third-party payload is the Google
  Fonts CSS and the font files.

There are no analytics, trackers, or cookies. If you add any, document them
in this section and update the privacy page.

---

## Browser support

Targets the last two versions of evergreen browsers (Chrome, Edge, Firefox,
Safari). Key features that gate support:

- **CSS** — custom properties, `clip-path: polygon()`,
  `backdrop-filter`, `aspect-ratio`, `grid`.
- **JS** — `fetch`, `IntersectionObserver`, `Promise.all`, `CustomEvent`.

Older browsers (IE 11, Safari < 14) are not supported and will degrade to
unstyled content.

---

## Deployment

Any static host works:

- **GitHub Pages** — `main` branch, `/` directory. Push and it's live.
- **Netlify / Vercel** — point at the repo root, no build command, no
  publish directory.
- **S3 / Cloudflare R2** — upload the whole tree, set `index.html` as the
  default document.

Because there's no build step, deploys are a `git push` away. CI is not
currently configured.

---

## Contributing

1. Branch off `main` with the prefix `claude/<descriptor>-<id>` (for sessions
   driven by Claude Code) or `feat/<descriptor>` for human contributors.
2. Keep changes scoped — one page or one component per PR.
3. Open the PR against `main` and tag a reviewer.
4. The reviewer should QA the page locally with a static server and confirm
   the partials still load.

---

## Roadmap

- [ ] Extract design tokens into `assets/css/tokens.css`.
- [ ] Build the Index, Artists, Portfolio, Studio pages.
- [ ] Implement the four decorative JS modules (`tattoo-gun`,
      `cursor-gun`, `scroll-reveal`, `hero-geometry`).
- [ ] Wire the booking form to a real submission endpoint
      (Formspree / Netlify Forms / serverless function).
- [ ] Add Open Graph and Twitter Card metadata to each page.
- [ ] Add a `sitemap.xml` and `robots.txt`.
- [ ] Lighthouse pass — target 100/100/100/100.

---

## License

All content, designs, and copy in this repository are © Massa Tattoo. The
code itself is released for the studio's exclusive use; please don't lift
the design wholesale for another business.
