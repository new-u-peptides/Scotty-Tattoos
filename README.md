# Scotty-Tattos - two sites in one repo

This repository hosts the source for two related but independently
deployable static sites:

| Path           | Live as              | Description                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `./` (root)    | **scottymassa.com**  | Scotty Massa's personal portfolio. Tattoo artist working out of Birkirkara, Malta, travelling worldwide. |
| `massatattoo/` | **massatattoo.com**  | The Massa Tattoo studio site. Six pages: Home, About, Portfolio, Blog, Testimonials, Contact. |

Each site is self-contained - its own pages, assets, and (where applicable)
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
│       ├── mandala.js       Animated canvas mandala - dotwork → lotus → linework → shading
│       └── includes.js      HTML partial loader for the `<div data-include="...">` pattern
│
│  ─── scottymassa.com (lives at the root)
├── index.html              Home
├── about.html              Bio, story, stats, press, testimonial
├── portfolio.html          Filterable gallery
├── travel.html             Travel & guest spots - the offer, not a schedule
├── mandala-tattoos.html    Mandala pillar page
├── booking.html            Two-step tattoo enquiry
├── enquiry-received.html   Enquiry confirmation
├── aftercare.html          Healing guide
├── contact.html            Studio info + contact form
├── geometric-tattoos.html  Geometric-tattoo SEO hub
├── journal.html            Journal index
├── journal/                Long-form articles
├── partials/               Inlined into pages by tools/sync-partials.js
│   ├── header.html
│   └── footer.html
├── api/
│   ├── _lib/               mailersend · templates · enquiry · store · util · leadScore
│   ├── enquiry/            start · submit · unsubscribe
│   ├── mailersend/         webhook
│   ├── cron/               enquiry-followups
│   └── enquiries.js        admin list / status
├── emails/templates/       Ten transactional templates + README
├── admin/                  Enquiry board (self-contained)
├── supabase/migrations/    0001_enquiries.sql
├── tools/sync-partials.js  Re-inline the partials
├── docs/ENQUIRY-FUNNEL.md  Operator's guide
├── assets/
│   ├── css/styles.css      Component index - see assets/css/components/
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
        ├── css/styles.css   Component index - see assets/css/components/
        └── favicon.svg
```

Both sites load the shared JS modules from `shared/js/...` (scotty
root) or `../shared/js/...` (massatattoo). For production, each
deployment must include `shared/` above its own site root - see
`shared/README.md` for the long version.

---

## Quick start

Both sites are pure HTML/CSS/JS - no build step. The studio site
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

- **Pages** - Home, About, Portfolio, Geometric, Mandala, Travel, Journal, Reviews, Enquiry, Aftercare, Contact.
- **Palette** - ink black, bone white, antique gold. Red is reserved for the primary CTA and nothing else.
- **Type** - Cinzel (display) · Inter (body). Two families, both from Google Fonts.
- **Components** - sticky nav, hero, marquee, 12-col portfolio grid,
  style cards, stepper, enquiry form, stats, quote, CTA block, footer.
- **Animation** - reveal-on-scroll via `IntersectionObserver`.

Drop real photography into `assets/images/` and lift the design into
Next.js / Astro / WordPress later if needed.

---

## Enquiry funnel (scottymassa.com)

One two-step enquiry, one email provider, optional persistence.
`docs/ENQUIRY-FUNNEL.md` is the operator's guide; this is the orientation.

1. **`booking.html`** - the whole enquiry. Step 1 asks who you are and what
   the project is (name, email, country, optional Instagram, project type,
   scale, and where the work would happen - the studio in Malta, or Scotty
   travelling). Step 2 asks about the idea: description, placement, existing
   tattoos, optional reference images, timing, how they found him, consent.
   Validating step 1 posts to `api/enquiry/start` fire-and-forget, so an
   abandoned enquiry is still a lead the reminders can reach.
2. **`enquiry-received.html`** - the reference, four next steps, and the
   portfolio and Instagram as the onward actions. Deliberately not the
   homepage.
3. **`admin/enquiries.html`** - nine-column board, side panel per enquiry.
   Token-gated, `noindex`, disallowed in `robots.txt`.

`booking-application.html`, `booking-thank-you.html` and
`booking-application-received.html` are redirect stubs preserving their query
string, because links to them exist in already-sent email.

Portfolio CTAs deep-link with `?project=<slug>` and preselect the project
type - the visitor arrives with one decision already made.

**Email** goes through [MailerSend](https://www.mailersend.com)
(`api/_lib/mailersend.js`). Ten templates live in `emails/templates/` as the
source of truth and are rendered by `api/_lib/templates.js`; setting
`MAILERSEND_TEMPLATE_<NAME>` switches one to a MailerSend-hosted template with
the same variables. Every send carries the enquiry reference as a tag, which is
how the webhook attributes an open or a click back to an enquiry. See
`emails/templates/README.md`.

**Persistence is optional.** `api/_lib/store.js` talks to Supabase when
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, and otherwise returns
null from every function. Without it the funnel runs email-only: enquiries
still reach the studio inbox, but there is no board, no lifecycle history and
no follow-ups. Run `supabase/migrations/0001_enquiries.sql` to turn it on.

**File uploads** still go through the function as email attachments - 2MB per
file, 3 files, ~4MB combined, to stay under Vercel's request body limit. If
that proves too tight, switch to direct-to-[Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
client uploads rather than raising the cap.

**Lead scoring** (`api/_lib/leadScore.js`) computes a stateless 0–100 triage
score from the enquiry fields. Shown only in the studio's internal email -
never to the client, never used to auto-decline.

**Follow-ups** are two reminders (24–48h and 4–6 days) from a daily Vercel
cron, and they stop the moment someone submits, replies, books, unsubscribes
or hard-bounces. This is a sales workflow, not a newsletter.

### Not built yet

- The board reads and re-stages enquiries but cannot yet **send** the six
  manual templates (consultation, booking confirmed, deposit reminder, session
  reminder, application received). They are wired and ready; they need a send
  action in the panel.
- Calendly / Stripe / calendar integration - each needs a real third-party
  account and is a separate decision.

---

## Chrome and the partials

`partials/header.html` and `partials/footer.html` are **inlined into every root
page**, not fetched at runtime. Run `node tools/sync-partials.js` after editing
either one; `--check` exits non-zero if a page is stale.

They used to be loaded with `fetch()`, which meant the HTML a crawler receives
contained no nav and no footer - no internal links at all until JavaScript ran.
Inlining took `index.html` from 19 anchors to 55.

Their hrefs are root-relative (`/portfolio.html`, not `portfolio.html`) because
the same markup is used from `/journal/`, where bare relative links resolved to
`/journal/portfolio.html` and 404'd.

`shared/js/includes.js` still exists for `massatattoo/` and the journal
articles, which continue to use the runtime pattern.

---

## massatattoo.com (`massatattoo/`)

The Massa Tattoo studio brand - multi-artist, six pages, partial-based
chrome.

- **Pages** - Home, About, Portfolio, Blog, Testimonials, Contact.
- **Palette** - warm paper/beige base, gold accent.
- **Type** - Cormorant Garamond (display) · Inter (body) · JetBrains Mono (mono).
- **Partial includes** - `<div data-include="partials/header.html"></div>`
  placeholders are replaced at runtime by `assets/js/includes.js`. Set
  `data-nav-current="<page>"` on `<body>` and the matching nav link gets
  the `is-active` class.
- **No frameworks, no bundler.** Flat directory of static files.

---

## Deploying as two sites

### Option A - two projects, one repo
Most static hosts let you point a domain at a subdirectory:
- **Netlify / Vercel / Cloudflare Pages** - create two projects from
  this repo. One has publish dir `./`, the other `./massatattoo/`. Point
  scottymassa.com at the first, massatattoo.com at the second.
- **GitHub Pages** - not directly supported per-subdirectory; use Option B.

### Option B - split into two repositories
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

- **More Scotty portraits** - the current set is two working shots and
  two B&W lifestyle frames. We could use: a clean studio headshot, a wide
  environmental (full body, studio behind), a hands / detail shot, a
  candid lifestyle / on-tour shot.
- **3 distinct team portraits** for massatattoo.com - Massa (founder),
  Iris (resident dotwork), Tomas (resident fine-line). Currently the
  team grid still shows SVG illustrations because we can't mix-and-match
  1 photo with 2 SVGs without it looking lopsided.
- **More tattoo work** - particularly traditional / Japanese / colour
  pieces if Scotty has them, to broaden the portfolio beyond mandala /
  dotwork.
- **Travel photos** - on-location or guest-spot shots for `travel.html` (optional).

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

- [x] scottymassa.com - design files in place (pages, styles, JS).
- [x] massatattoo.com - six pages built in `massatattoo/`.
- [x] Hoist `main.js`, `mandala.js`, `includes.js` into the `shared/` tree.
- [x] Lotus-petal arches woven into the mandala animation.
- [x] Open Graph + Twitter Card meta, canonical and favicon on every page.
- [x] Alpha tokens (`--bone-12`, `--gold-15`, etc.) replace literal `rgba()`.
- [x] 880–980 px tightening on massatattoo so the layout doesn't read airless once the nav collapses.
- [ ] Drop real photography into `assets/images/` (scottymassa) and
      replace SVG placeholders in `massatattoo/portfolio.html`.
- [x] Wire scottymassa.com's booking flow to a real submission endpoint
      (see "Booking flow" below). `massatattoo/contact.html`'s booking form
      is still a client-side stub - not in scope for this pass.
- [x] Wire the enquiry funnel to MailerSend with optional persistence.
- [x] Server-render the nav/footer so the internal link graph is crawlable.
- [ ] Send the six manual email templates from the admin board.
- [ ] Per-site `sitemap.xml` for massatattoo (scottymassa already has one).
- [ ] Lighthouse pass on both sites - target 100/100/100/100.
- [ ] When ready, split into two GitHub repositories.

---

## License

All content, designs, and copy in this repository are © Scotty Massa /
Massa Tattoo. The code itself is for the studio's exclusive use - please
don't lift the design wholesale for another business.
