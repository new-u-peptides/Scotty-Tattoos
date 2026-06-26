# ScottyMassa.com — SEO Strategy

## Summary
ScottyMassa.com is the portfolio and booking hub for Malta-based tattoo artist Scotty Massa (Massa Tattoo, Birkirkara). The site is optimised for two audiences: high-intent local clients searching for tattoo work in Malta, and international collectors searching for geometric, dotwork, and sacred-geometry specialists — including via guest-spot tours. We prioritise topical authority around the geometric/sacred-geometry cluster, strong local signals for Malta, and clean technical SEO so individual journal articles and guest-spot pages can rank without paid spend.

## Keyword clusters (with priority)

| # | Cluster | Intent | Primary keywords | Long-tail | Target pages |
|---|---|---|---|---|---|
| 1 | Branded (P1) | Informational / Navigational | "Scotty Massa", "Massa tattoo Malta", "Scotty Massa tattoo" | "Scotty Massa Birkirkara", "Scotty Massa booking", "Massa Tattoo studio Malta" | `/`, `/about.html` |
| 2 | Local (P1) | Commercial | "tattoo artist Malta", "tattoo studio Birkirkara", "best tattoo Malta" | "geometric tattoo artist Malta", "fine line tattoo Malta", "tattoo near me Birkirkara", "private tattoo studio Malta" | `/`, `/contact.html`, `/booking.html` |
| 3 | Style: Geometric (P1 — deepest cluster) | Commercial / Informational | "geometric tattoo", "sacred geometry tattoo", "dotwork tattoo", "mandala tattoo", "geometric sleeve" | "sacred geometry tattoo meaning", "dotwork vs linework tattoo", "how to design a geometric tattoo", "geometric mandala sleeve", "flower of life tattoo", "metatron cube tattoo" | `/geometric-tattoos.html`, `/journal/geometric-tattoo-meaning.html`, `/journal/sacred-geometry-tattoo-guide.html`, `/journal/dotwork-vs-linework.html`, `/journal/designing-a-geometric-piece.html` |
| 4 | Style: Other (P2) | Commercial | "traditional tattoo Malta", "Japanese tattoo Malta", "blackwork tattoo Malta", "cover-up tattoo Malta" | "neo-traditional tattoo artist Malta", "irezumi inspired tattoo Malta", "large-scale blackwork Malta", "tattoo cover-up specialist Malta" | `/portfolio.html` (with style anchors) |
| 5 | Travel / Guest spots (P2) | Commercial | "guest spot tattoo artist Berlin", "guest tattoo artist Tokyo", "guest spot Lisbon tattoo", "guest tattoo artist New York" | "European tattoo artist guest spot Berlin", "Malta tattoo artist visiting Tokyo", "book guest spot Lisbon geometric tattoo", "guest artist NYC sacred geometry" | `/tour.html` |

## Page → keyword mapping

| Page | Primary keyword | Secondary keywords | Notes |
|---|---|---|---|
| `/` (index) | Scotty Massa tattoo | tattoo artist Malta, geometric tattoo Malta, Massa Tattoo Birkirkara | Hero H1 carries brand + location; meta description leads with brand + craft |
| `/portfolio.html` | tattoo portfolio Malta | geometric, dotwork, blackwork, traditional, Japanese, cover-up | Image-led; alt text doubles as keyword surface area |
| `/geometric-tattoos.html` | geometric tattoo artist | sacred geometry tattoo, dotwork mandala, geometric sleeve | Pillar page that links down to all four journal articles |
| `/about.html` | Scotty Massa biography | tattoo artist Malta, Massa Tattoo, training, philosophy | Carries Person schema |
| `/tour.html` | guest spot tattoo artist | Berlin, Tokyo, Lisbon, New York, tour dates | Each city block is a sub-target with its own Event schema |
| `/booking.html` | book a tattoo Malta | consultation, deposit, custom geometric tattoo design | Conversion page; minimise external links |
| `/aftercare.html` | tattoo aftercare guide | new tattoo aftercare, healing tattoo, tattoo washing | HowTo schema; long-tail support for the cluster |
| `/contact.html` | Massa Tattoo contact Birkirkara | tattoo studio address Malta, phone, email | LocalBusiness + ContactPage schema |
| `/journal.html` | tattoo journal | geometric tattoo blog, sacred geometry articles | Blog hub |
| `/journal/geometric-tattoo-meaning.html` | geometric tattoo meaning | symbolism, sacred geometry meaning | Article schema |
| `/journal/sacred-geometry-tattoo-guide.html` | sacred geometry tattoo guide | flower of life, metatron's cube, sri yantra | Pillar-style article |
| `/journal/dotwork-vs-linework.html` | dotwork vs linework tattoo | stippling, shading, healing differences | Comparative article |
| `/journal/designing-a-geometric-piece.html` | how to design a geometric tattoo | placement, flow, body anatomy | HowTo + Article schema |

## Schema markup applied

| Page | Schema types |
|---|---|
| `/` | LocalBusiness (TattooParlor), Person, WebSite, BreadcrumbList |
| `/portfolio.html` | ImageGallery, BreadcrumbList, CreativeWork |
| `/geometric-tattoos.html` | Service, ImageGallery, FAQPage, BreadcrumbList |
| `/about.html` | Person, BreadcrumbList |
| `/tour.html` | Event (one per city), BreadcrumbList |
| `/booking.html` | Service, ContactPoint, BreadcrumbList |
| `/aftercare.html` | HowTo, FAQPage, BreadcrumbList |
| `/contact.html` | LocalBusiness, ContactPage, BreadcrumbList |
| `/journal.html` | Blog, BreadcrumbList |
| `/journal/geometric-tattoo-meaning.html` | Article, BreadcrumbList |
| `/journal/sacred-geometry-tattoo-guide.html` | Article, BreadcrumbList |
| `/journal/dotwork-vs-linework.html` | Article, BreadcrumbList |
| `/journal/designing-a-geometric-piece.html` | Article, HowTo, BreadcrumbList |

## Cross-site linking (scottymassa.com → massatattoo.com)

scottymassa.com (this site) and **massatattoo.com** — the Massa Tattoo Social
Club studio site — are the same brand on two domains. We deep-link from here
into the studio site's money pages so earned authority on the portfolio flows
to the studio, and so both entities reinforce each other for branded and local
queries ("Massa Tattoo", "Massa Tattoo Social Club", "tattoo studio Birkirkara").

Rules we follow:
- **Followed links** (no `rel="nofollow"`) — both properties are ours, so juice
  should pass. External, so `target="_blank" rel="noopener"`.
- **Deep links, not just the homepage** — point at the relevant inner page.
- **Varied, descriptive anchors** — branded + topical, never repeated exact-match
  (mirrors the anchor-text split in `LINK-BUILDING.md` §4).
- **Only link live URLs.** Confirmed live in `massatattoo.com/page-sitemap.xml`
  + `post-sitemap.xml`. `/mandala-tattoos/`, `/social-club/`, `/portfolio/`
  exist only in `massatattoo/wordpress/` (not published yet) — do **not** link
  them until they resolve.

| From (scottymassa.com) | Anchor | To (massatattoo.com) |
|---|---|---|
| Footer (all pages, `partials/footer.html`) | "Massa Tattoo Social Club" | `/` |
| Footer (all pages) | "Birkirkara, Malta" | `/contact/` |
| Footer (all pages) | "Studio site" | `/` |
| Footer (all pages) | "Scotty at the studio" | `/artists/scotty-massa/` |
| Footer (all pages) | "Tattoo courses in Malta" | `/tattoo-course/` |
| Footer (all pages) | "Studio journal" | `/articles/` |
| `/about.html` (bio) | "Massa Tattoo Social Club" | `/artists/scotty-massa/` |
| `/contact.html` (studio block) | "Massa Tattoo Social Club — studio site & directions" | `/contact/` |
| `/geometric-tattoos.html` (FAQ) | "Massa Tattoo Social Club" | `/` |

> The course nav/CTA still points at the dedicated funnel
> (`massatattoocourse.aweb.page`) and `/booking.html` is kept clean of outbound
> links (conversion page).

**Reciprocal (to do on the studio side, where it's WordPress, not this repo):**
link massatattoo.com back to scottymassa.com from Scotty's artist page and the
footer with a varied anchor ("Scotty Massa's portfolio", "geometric tattoo
portfolio"), and point the Skool community "About" back at both. Two-way linking
between owned, topically-identical sites is the cheapest authority signal here.

## Off-page recommendations

- **Google Business Profile** — claim and fully optimise the Massa Tattoo listing (categories: Tattoo Shop + Tattoo Artist; full NAP; hours; service area; weekly photo uploads of healed work; respond to every review).
- **Local citations (Malta)** — Yelp Malta, MaltaInsider, TripAdvisor (tattoo / things-to-do category), Yellow Pages Malta, VisitMalta lifestyle listings. Keep NAP byte-identical across all.
- **Vertical directories** — TattooCloud, Inkppl artist directory, Tattoodo, Tattoo Filter, Sorry Mom artist directory. Link each profile back to scottymassa.com (not a social channel).
- **Guest-studio mutual linking** — every host studio on the tour gets a reciprocal artist-page link (their site → `/tour.html` city block, our `/tour.html` → their site). Single best off-page signal for non-branded queries.
- **Tattoo magazine outreach** — pitch Tattoo Life, Inked, Skin Deep, and Tätowier Magazin features (interview + flash drop). Aim for one DR40+ editorial link per quarter.
- **Social cross-linking with consistent NAP** — Instagram, Facebook, YouTube, TikTok, and Pinterest all link to scottymassa.com; bio NAP matches GBP exactly.
- **Location-tagged Reels per tour city** — short build-up + behind-the-scenes Reels geo-tagged to each host city to seed brand searches in those geos before arrival.
- **Convention coverage** — apply to Malta Tattoo Expo + 1-2 international conventions per year; convention pages typically link out to participating artists.

## Measurement plan

**Search Console (weekly review, monthly report)**
- Impressions and CTR by query (segmented by brand vs non-brand)
- Top landing pages by clicks and average position
- Country split (Malta, UK, Germany, Italy, US, Japan)
- Index coverage and Core Web Vitals

**GA4 events (custom)**
- `booking_form_start` — first focus on booking form
- `booking_form_submit` — successful submission
- `tour_city_view` — scroll past 50% of a city block on `/tour.html`
- `journal_article_read_75` — 75% scroll on a journal article
- `outbound_click_instagram` — clicks to Instagram from any page

**Key queries to monitor monthly (top 10)**
1. scotty massa
2. massa tattoo malta
3. tattoo artist malta
4. tattoo studio birkirkara
5. geometric tattoo malta
6. sacred geometry tattoo
7. dotwork tattoo malta
8. mandala tattoo malta
9. best tattoo artist malta
10. guest spot tattoo artist berlin

## Technical baseline

**Shipped in this build**
- `sitemap.xml` covering all 13 URLs with priorities, lastmod, and changefreq
- `robots.txt` with sitemap reference and sensible disallows (`/assets/seo/`, `/.git/`, `/.well-known/`)
- JSON-LD schema per page (see table above)
- `<link rel="canonical">` on every page pointing to the `https://scottymassa.com/` canonical
- Open Graph + Twitter Card meta on every page; default OG image at `/assets/seo/og-default.svg` (1200×630)
- Semantic HTML5 landmarks (`<header>`, `<nav>`, `<main>`, `<article>`, `<footer>`)
- Mobile-first responsive layout
- `humans.txt` and `.well-known/security.txt` (RFC 9116)

**Still TODO**
- Replace placeholder imagery with real photographed work; export at multiple widths and serve via `srcset` + `sizes`; descriptive, keyword-aware alt text on every image
- Wire booking and contact forms to a real backend (recommend a serverless endpoint + spam protection) and fire the GA4 conversion events
- Verify property in Google Search Console + Bing Webmaster Tools; submit `sitemap.xml`
- Install GA4 with consent-mode-aware loader; configure the custom events above
- Add `hreflang` annotations if/when an Italian or Maltese translation ships
- Lighthouse pass: target LCP < 2.5s, CLS < 0.1, INP < 200ms; lazy-load below-the-fold imagery; preconnect to Google Fonts
- Build out an internal-link map from each journal article up to `/geometric-tattoos.html` and across to `/booking.html`
