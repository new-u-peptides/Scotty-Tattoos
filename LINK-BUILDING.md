# Link-Building & Authority Plan — Massa Tattoo

Goal: drive link equity ("juice") to the money pages — the **tattoo course**,
the **Social Club**, the **mandala** specialty, and the **home/local** entity —
and make sure earned authority actually flows to them.

> **Live data pending.** The SemRush connector is out of API units, so the
> competitor backlink-gap numbers in §6 aren't pulled yet. Top up at
> https://www.semrush.com/mcp-access and I'll run the real gap analysis.

---

## 1. The pages we're funnelling juice to (and their target intent)

| Page | Primary targets |
|---|---|
| `/tattoo-course/` (+ advanced) | "tattoo course", "learn to tattoo", "tattoo training / apprenticeship alternative", "tattoo course [Malta/online]" |
| `/social-club/` → Skool | "learn to tattoo online", "tattoo community", "how to become a tattoo artist" |
| `/mandala-tattoos/` | "mandala tattoo", "mandala tattoo meaning", "mandala/sacred-geometry tattoo artist" |
| `/` (home) | brand + local: "Massa Tattoo", "tattoo studio [city]", "geometric tattoo studio" |

---

## 2. On-site foundation — SHIPPED in this PR (so links don't leak)

- **Structured data** on every page: `Organization`, `WebSite`, `WebPage`,
  `BreadcrumbList`; plus `TattooParlor/LocalBusiness` (home), `Service`
  (mandala), **`Course`** (courses + Social Club, incl. the $497 `Offer`), and
  `FAQPage` wherever there's a FAQ. → eligible for rich results, which lifts CTR
  and earns links on their own.
- **Internal links** point at the money pages with descriptive anchors from
  nav, footer, contextual prose, and CTA bands (Home→mandala, Home/Courses→club,
  Club↔Course).

### Internal-link map to maintain
Every new blog post links **up** to its pillar (`/mandala-tattoos/`) and
**across** to one money page (`/tattoo-course/` or `/social-club/`) with a
varied, descriptive anchor. Pillars link down to supporting posts. Keep the
course, club, and mandala pages ≤2 clicks from the home page (they already are).

### Still to do on-site (when you have the details)
- Real NAP in the `LocalBusiness` schema + footer/contact (placeholders now).
- Let the WordPress SEO plugin (Yoast/RankMath) own canonical, XML sitemap, and
  OG so they don't conflict with the pasted markup.

---

## 3. Off-site link acquisition — prioritised by effort × payoff

### Tier 1 — Foundation (week 1–2, do once, high trust)
- **Google Business Profile** — claim/verify, categories *Tattoo Shop* +
  *Tattoo Artist*, full NAP, hours, weekly healed-work photos, link to home.
  (Plus Bing Places, Apple Business Connect.)
- **NAP-consistent citations** — byte-identical name/address/phone on the big
  aggregators and local directories for the studio's city.
- **Social profiles** linking to the site — Instagram, TikTok, YouTube,
  Pinterest, Facebook; bio link to home, not a linktree.
- **Optimise the Skool "About"** to link back to `/social-club/` and the site.

### Tier 2 — Niche relevance (week 2–6, the links Google trusts most for tattoos)
- **Tattoo directories / artist profiles:** Tattoodo, Tattoo Filter, TattooCloud,
  Inkppl, Sorry Mom artist directory, Scratchback-style listings — each linking
  to the site (not just IG).
- **"Learn to tattoo" / course listicles:** pitch inclusion in "best tattoo
  courses / online tattoo courses / how to become a tattoo artist" roundups.
  These are the highest-value links for the course page.
- **Community/Skool discovery** surfaces and "best Skool communities for X"
  roundups for the club.

### Tier 3 — Content-driven / digital PR (week 4–12, the compounding links)
- **Linkable assets** (see §5) → outreach to people who already link to weaker
  versions of that content.
- **Guest articles** on tattoo blogs/magazines (Things&Ink, Inked, Inkppl,
  Tattoo Life) — one well-written piece per quarter with a contextual link.
- **Journalist requests** — Connectively (ex-HARO), Qwoted, Featured: answer
  "tattoo/skin/small-business" queries for editorial links.
- **Podcasts / YouTube collabs** with other artists and tattoo-business shows;
  show notes link back.

### Tier 4 — Relationships (ongoing, the cheapest links)
- **Guest-spot reciprocity** — every host studio links your artist page; you
  link theirs.
- **Convention pages** (e.g. Malta Tattoo Expo) — participant listings link out.
- **Suppliers/brands** — ink/machine brands' "artists who use us" features.
- **Student & member success** — graduates and club members linking to the
  course/club from their own sites/profiles (seed with an ambassador ask).

---

## 4. Anchor-text distribution (keep it natural, avoid over-optimisation)

| Type | Share | Examples |
|---|---|---|
| Branded | ~45% | "Massa Tattoo", "massatattoo.com" |
| Naked / generic | ~25% | the bare URL, "here", "this studio" |
| Partial / topical | ~22% | "tattoo course", "learn to tattoo", "mandala tattoo artist" |
| Exact-match | <8% | "tattoo course Malta", "mandala tattoos" |

Exact-match anchors should come mostly from editorial/contextual links you don't
fully control — never blast them from directories.

---

## 5. Linkable assets to build (this is what earns Tier-3 links)
1. **Mandala meaning guide** — already live at `/mandala-tattoos/`; make it the
   most thorough "mandala tattoo meaning + styles + placement" page on the web,
   then pitch it to listicles that currently link thinner posts.
2. **"How to become a tattoo artist" guide** — ties directly to the course + club
   and is one of the most-linked beginner queries in the niche. High priority.
3. **Free aftercare PDF / mandala flash freebie** — gated-free assets attract
   resource-page links.
4. **Original data** — a small survey ("first-tattoo regrets", "what people
   actually pay") → digital-PR pitch; data gets cited and linked.

---

## 6. Competitor backlink-gap (run when SemRush units are restored)
1. Pick 3–5 competitors: online tattoo-course providers, mandala/geometry
   artists who rank, and tattoo Skool communities.
2. For each, pull referring domains (SemRush *Backlink Analytics* →
   *Referring Domains*).
3. Use **Backlink Gap** to find domains linking to ≥2 competitors but **not**
   us → that's the prioritised, pre-qualified outreach list.
4. Sort by Authority Score, filter out spam, and work top-down.

---

## 7. 90-day cadence + KPIs
- **Weeks 1–2:** Tier 1 foundation; confirm schema is valid in Google Rich
  Results Test; submit sitemap in Search Console.
- **Weeks 3–6:** Tier 2 directories/profiles; publish assets #1–2; competitor-gap
  outreach round 1.
- **Weeks 5–10:** guest posts + journalist requests + listicle pitches.
- **Weeks 8–12:** digital-PR push (asset #4), podcasts, partnerships; review.

**KPIs:** new referring domains/month, Authority Score, rankings for the §1
targets, organic clicks to the course/club/mandala pages, and conversions
(course applications, club joins).

---

## 8. Guardrails (don't undo the work)
No PBNs, no bought links, no large-scale link exchanges, no spammy directory
blasts, no exact-match anchor stuffing. Disavow only genuinely toxic links.
Slow, relevant, editorial links beat volume every time.
