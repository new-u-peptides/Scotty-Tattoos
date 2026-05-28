# Scotty-Tattos · monorepo for two sites

This repository hosts the source for **two related, but independently
deployable, static sites**:

| Subdirectory   | Live as              | Description                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `massatattoo/` | **massatattoo.com**  | The studio site. Six pages: Home, About, Portfolio, Blog, Testimonials, Contact.    |
| `scottymassa/` | **scottymassa.com**  | Scotty Massa's personal artist portfolio. Four pages: Home, About, Portfolio, Contact. |

Each site is self-contained — its own pages, partials, stylesheet, and
include script. Nothing in `massatattoo/` references anything in
`scottymassa/` and vice-versa. They can be split into separate repositories
at any time with a `git filter-repo --subdirectory-filter <name>/`.

---

## Repository layout

```
Scotty-Tattos/
├── README.md
├── massatattoo/                  ← studio site (massatattoo.com)
│   ├── index.html                Home
│   ├── about.html
│   ├── portfolio.html
│   ├── blog.html
│   ├── testimonials.html
│   ├── contact.html
│   ├── partials/
│   │   ├── header.html
│   │   └── footer.html
│   └── assets/
│       ├── css/styles.css
│       └── js/includes.js
└── scottymassa/                  ← personal portfolio (scottymassa.com)
    ├── index.html                Home
    ├── about.html
    ├── portfolio.html
    ├── contact.html
    ├── partials/
    │   ├── header.html
    │   └── footer.html
    └── assets/
        ├── css/styles.css
        └── js/includes.js
```

---

## Quick start

Both sites are pure HTML/CSS/JS — no build step. Because the partial-include
system uses `fetch()` for the header and footer, they need to be served over
HTTP rather than opened with `file://`.

```bash
# Serve the whole monorepo
python3 -m http.server 8000
# Then visit:
#   http://localhost:8000/massatattoo/   (studio site)
#   http://localhost:8000/scottymassa/   (personal portfolio)
```

For a sharper local approximation of production (one site per port):

```bash
# In two separate terminals:
(cd massatattoo && python3 -m http.server 8001)
(cd scottymassa && python3 -m http.server 8002)
```

---

## How the two sites differ

| Aspect              | Massa Tattoo                                    | Scotty Massa                                |
| ------------------- | ----------------------------------------------- | ------------------------------------------- |
| Audience            | Studio brand — multi-artist, multi-style        | Single artist — personal voice              |
| Pages               | 6 (Home / About / Portfolio / Blog / Testimonials / Contact) | 4 (Home / About / Portfolio / Contact)      |
| Accent colour       | `--gold` (`#B8956A`)                            | `--rust` (`#8C2A2A`) — deeper, more personal |
| Container max-width | 1200px                                          | 1100px — tighter                            |
| Nav CTA             | "Book a Consult"                                | "Book"                                      |
| Voice               | Third person, studio                            | First person, the artist                    |

The two stylesheets share their typography (Cormorant Garamond + Inter +
JetBrains Mono) and warm paper-tone base palette, but diverge on accent and
sizing to give each site its own feel.

---

## Shared conventions

Both sites use the same lightweight conventions:

- **Partial includes** — `<div data-include="partials/header.html"></div>`
  placeholders are replaced at runtime by `assets/js/includes.js`.
- **Active nav** — set `data-nav-current="<page>"` on `<body>`; the script
  marks the matching `<a data-nav="<page>">` link in the header as
  `is-active`.
- **Year stamp** — `<span id="year"></span>` in the footer is filled in by
  the same script.
- **BEM-ish class names** — `block`, `block__element`, `block--modifier`.
- **No build step. No frameworks. No bundler.** Each site is a flat
  directory of static files.

---

## Deploying as two sites

Both sites are designed to deploy independently from this single repo:

### Option A — deploy two sites from one repo
Most static hosts let you point a domain at a subdirectory:
- Netlify / Vercel: set the publish directory to `massatattoo/` for one
  project and `scottymassa/` for the other.
- Cloudflare Pages: point each project's root at the relevant subdirectory.
- GitHub Pages: not directly supported per-subdirectory — use Option B.

### Option B — split into two repositories
When the sites diverge enough, split them out:

```bash
# In a fresh clone:
git filter-repo --subdirectory-filter massatattoo
# → push to new-u-peptides/massatattoo

# And again in another clone:
git filter-repo --subdirectory-filter scottymassa
# → push to new-u-peptides/scottymassa
```

History is preserved in each split.

---

## Editing & adding pages

For each site, the rules are the same:

1. Add a new `<page>.html` at the site root.
2. Drop in the two `data-include` placeholders and load `includes.js`.
3. Set `data-nav-current` on `<body>` to one of the nav slugs.
4. Update `partials/header.html` and `partials/footer.html` if the page
   needs to appear in navigation.

### Adding a nav slug

The nav uses `data-nav="<slug>"` on each link and reads
`data-nav-current="<slug>"` from `<body>`. To add a new entry, update both
the header partial and the page that should be active.

---

## Browser support

Targets the last two versions of evergreen browsers (Chrome, Edge, Firefox,
Safari). Key gates: CSS custom properties, `clip-path: polygon()`,
`aspect-ratio`, `grid`, `fetch`, `Promise.all`, `CustomEvent`.

---

## Contributing

- Branch off `main` with a descriptive prefix (`feat/...`, `fix/...`, or
  `claude/...-<id>` for Claude Code sessions).
- Keep each PR scoped to **one site** when possible. Cross-cutting changes
  (e.g. token rename) can touch both — say so in the PR description.
- QA both sites locally with `python3 -m http.server` before opening the PR.

---

## Roadmap

- [x] Split into two-site monorepo (`massatattoo/`, `scottymassa/`).
- [x] Build Massa Tattoo: Home, About, Portfolio, Blog, Testimonials, Contact.
- [x] Build Scotty Massa: Home, About, Portfolio, Contact.
- [ ] Replace the SVG placeholder art on every tile with real photographs.
- [ ] Wire the booking forms on both sites to a real submission endpoint.
- [ ] Add Open Graph + Twitter Card metadata to every page.
- [ ] Add per-site `sitemap.xml` and `robots.txt`.
- [ ] Lighthouse pass on both sites — target 100/100/100/100.
- [ ] When ready, split into two GitHub repositories (see Option B above).

---

## License

All content, designs, and copy in this repository are © Massa Tattoo /
Scotty Massa. The code itself is for the studio's exclusive use — please
don't lift the design wholesale for another business.
