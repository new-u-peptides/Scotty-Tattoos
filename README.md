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
├── index.html                    ← Home
├── about.html                    ← About / studio story
├── portfolio.html                ← Filterable portfolio grid
├── blog.html                     ← Journal index + featured post
├── testimonials.html             ← Client letters + press
├── contact.html                  ← Contact + booking form
├── partials/
│   ├── header.html               ← top nav (loaded into every page)
│   └── footer.html               ← site footer (loaded into every page)
└── assets/
    ├── css/
    │   └── styles.css            ← all design tokens + component styles
    └── js/
        └── includes.js           ← partial loader + active-nav highlighter
```

Every page links a single shared stylesheet (`assets/css/styles.css`) and a
single shared script (`assets/js/includes.js`). The page-specific markup is
the only thing that varies file-to-file.

---

## Pages

| Page          | File                 | Status  | Description                                                |
| ------------- | -------------------- | ------- | ---------------------------------------------------------- |
| Home          | `index.html`         | ✅ Done | Hero, manifesto, style strip, recent work, pull-quote, CTA |
| About         | `about.html`         | ✅ Done | Manifesto, story timeline, team grid, process, stats       |
| Portfolio     | `portfolio.html`     | ✅ Done | Filter bar, 9-tile geometric work grid, pull-quote, CTA    |
| Blog          | `blog.html`          | ✅ Done | Featured essay, 6-card grid, newsletter sign-up            |
| Testimonials  | `testimonials.html`  | ✅ Done | Featured quote, 6-card grid, press strip                   |
| Contact       | `contact.html`       | ✅ Done | Info card, booking form, studio map, FAQ                   |

All six pages share the same nav, footer, design tokens, and stylesheet.

---

## Partials & the include system

To keep the global chrome (nav, footer) in one place, each page sets a
`data-nav-current` attribute on its `<body>` and leaves placeholder `<div>`s
that `assets/js/includes.js` fetches at runtime:

```html
<body data-nav-current="contact">
  <div data-include="partials/header.html"></div>

  <!-- page content -->

  <div data-include="partials/footer.html"></div>

  <script src="assets/js/includes.js"></script>
</body>
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
3. Set `data-nav-current` on `<body>` to one of: `home`, `about`,
   `portfolio`, `blog`, `testimonials`, `contact`.
4. Load `assets/js/includes.js` at the bottom of `<body>`.

Done — the new page now shares the global header and footer.

---

## Design system

All design tokens live as CSS custom properties at the top of
`assets/css/styles.css` (the `:root { … }` block). Every page links the same
stylesheet, so changing a token updates the whole site at once.

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

`assets/js/includes.js` is the only script loaded by every page. It:

1. Snapshots `data-nav-current` from `<body>` before any DOM mutation.
2. Fetches every `[data-include]` partial and replaces the placeholder
   with the rendered nodes.
3. Once all partials have settled, marks the matching `[data-nav]` link
   in the nav as `is-active`, stamps the current year into `#year`, and
   dispatches a `partials:loaded` event on `document`.

The Portfolio page also ships a tiny inline script for filter-button
state — it's purely visual, the tiles themselves don't filter yet. Hook
it up to real data attributes when you're ready.

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

- [x] Extract design tokens into a shared `assets/css/styles.css`.
- [x] Build Home, About, Portfolio, Blog, Testimonials, Contact.
- [ ] Replace the geometric SVG placeholders on Portfolio / Home / Blog
      tiles with real photographs.
- [ ] Wire the Portfolio filters to real `data-style` attributes.
- [ ] Wire the booking form to a submission endpoint
      (Formspree / Netlify Forms / serverless function).
- [ ] Wire the Blog newsletter sign-up to a list provider.
- [ ] Add Open Graph + Twitter Card metadata to each page.
- [ ] Add a `sitemap.xml` and `robots.txt`.
- [ ] Lighthouse pass — target 100 / 100 / 100 / 100.

---

## License

All content, designs, and copy in this repository are © Massa Tattoo. The
code itself is released for the studio's exclusive use; please don't lift
the design wholesale for another business.
