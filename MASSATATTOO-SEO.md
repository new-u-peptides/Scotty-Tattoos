# massatattoo.com — SEO review

Written 21 Sep 2026, against the "tattoos malta" SERP captured the same day.

## Scope and what could not be checked

**The live site could not be crawled from this environment.** `massatattoo.com`
returns a 202 with a 169-byte SiteGround captcha interstitial
(`/.well-known/sgcaptcha/`) to every request from here, including from a real
headless Chromium, which loops until `ERR_TOO_MANY_RETRIES`.

This is **not** evidence that Googlebot is blocked. Bot protection of this kind
is designed to challenge datacentre IPs and spoofed crawler user-agents, which
is exactly what a request from here looks like; real Googlebot is verified by
reverse DNS and is normally exempt. But it is also not evidence that Googlebot
is *fine*, and a site sitting on page 2 for its main term deserves the check.

> **Action 0 — verify this first, before anything else on this page.**
> Search Console → URL Inspection → enter `https://massatattoo.com/` → **Test
> live URL** → View tested page. If the rendered HTML is the captcha page
> rather than the site, nothing else in this document matters until SiteGround's
> bot protection is configured to allow verified search crawlers.

Everything below is therefore drawn from two sources that *are* verifiable:

- **the SERP** captured by the site owner (positions, competitors, People Also
  Ask, related searches, the Google Business Profile entry);
- **the two copies of the site in this repository** — `massatattoo/` and
  `massatattoo/wordpress/`.

Those repo copies are a static rebuild, not a mirror of production: the live
homepage title in the SERP reads *"Welcome to Massa Tattoo Social Club Malta"*,
which appears in neither copy. Treat repo findings as applying to the rebuild,
and confirm each against production before acting.

---

## 1. The finding that matters most: no title targets Malta

Across **all fifteen** page templates in both repo copies, not one `<title>`
contains "Malta" or "Birkirkara":

```
Massa Tattoo — Geometric Studio
Massa Tattoo — Custom Mandala & Sacred-Geometry Tattoo Studio
Mandala Tattoos — Meaning, Styles & Custom Work | Massa Tattoo
Portfolio — Massa Tattoo · Geometric Studio
Contact — Massa Tattoo · Geometric Studio
...
```

For a business whose target query is *"tattoos malta"*, whose entire customer
base is on one island, and which currently sits on page 2, the homepage title
omitting the location is the single highest-leverage fix available.

The live homepage title does carry "Malta", so this may be a rebuild-only
regression — but the deeper pages almost certainly do not, and they are where
the long-tail traffic is.

**Do this:**

| Page | Title |
| --- | --- |
| Home | `Tattoo Studio in Malta — Custom Tattoos in Birkirkara \| Massa Tattoo Social Club` |
| Portfolio | `Tattoo Portfolio — Mandala, Geometric & Blackwork, Malta \| Massa Tattoo` |
| Mandala | `Mandala Tattoos in Malta — Custom Designs \| Massa Tattoo` |
| Contact | `Tattoo Studio in Birkirkara, Malta — Find Us \| Massa Tattoo` |
| Courses | `Tattoo Courses in Malta — Foundation & Advanced \| Massa Tattoo` |

Keep each under ~60 characters where possible so it isn't truncated.

---

## 2. Structured data

`massatattoo/` has **zero** JSON-LD across all six pages.
`massatattoo/wordpress/` has one block per page across all nine — so the
WordPress set is the one to build on, and the static rebuild should not ship as
it stands.

Whichever set goes live needs, on the homepage:

- `LocalBusiness` + `TattooParlor` with the full `PostalAddress`, `geo`
  coordinates, `telephone`, `openingHoursSpecification`, `priceRange`
- `areaServed` covering Malta, Birkirkara, Valletta, Sliema, St Julian's, Gozo
- `sameAs` pointing at the Google Business Profile, Instagram and Facebook
- `aggregateRating` reflecting the real GBP rating (**5.0 from 104 reviews** per
  the SERP) — this is a genuine asset and it is not currently marked up

---

## 3. The Google Business Profile is the main event

The SERP shows the profile is live and strong: **Massa Tattoo Social Club Malta,
5.0 (104), Birkirkara, 5+ years in business, 9968 5949** — and it appears in the
local pack while the website languishes on page 2.

For *"tattoos malta"* the map pack sits above every organic result. Competitors
are beating you there on review volume, not on website quality:

| Studio | Rating | Reviews |
| --- | --- | --- |
| JUST BECAUSE US | 5.0 | **1,200** |
| Moko Tattoos | 4.9 | 363 |
| The Rusty Key | 5.0 | 252 |
| Ink Addiction Sliema | 5.0 | 248 |
| We The Sinners | 4.9 | 236 |
| Modern Tribe (Birkirkara) | 5.0 | 159 |
| Corazón (Birkirkara) | 5.0 | 157 |
| **Massa Tattoo Social Club** | **5.0** | **104** |

A 5.0 average is as good as it gets; the gap is volume. Three competitors in
Birkirkara alone carry more reviews.

**Do this:**

1. **Ask every client for a review**, systematically — a short link in the
   aftercare follow-up message. Going from 104 to 250 would put the profile
   level with the Birkirkara competition.
2. **Post to the profile weekly.** Healed work, studio photos, flash. Activity
   is a ranking signal and almost nobody in this list does it consistently.
3. **Fill every field**: services, attributes, opening hours, products,
   a booking link, Q&A seeded with the People Also Ask questions below.
4. **Add the canonical profile URL to the website** and to `sameAs`. Right now
   scottymassa.com links only to Google Maps *searches*, never to the profile
   itself.

---

## 4. Content gaps the SERP is telling you about

### People Also Ask — none of these has a page

| Question | Where it should live |
| --- | --- |
| How much do tattoos cost in Malta? | Dedicated pricing page |
| Where can I get a tattoo in Valletta? | Location/area page |
| Can I get a tattoo in Malta at 17? | FAQ section, age & ID policy |

### Related searches — all commercial, all unserved

`walk in tattoos malta` · `tattoos malta prices` · `tattoos malta near me` ·
`malta tattoo ideas` · `tattoo shops malta` · `cheap tattoos malta`

`walk in tattoos malta` is worth a decision: if the studio takes walk-ins, it
needs a page saying so; if it doesn't, a page explaining the appointment-only
policy still captures the query and converts some of it.

### Holiday and first-timer intent is dominant and unserved

Two of the highest-ranking results for "tattoos malta" are community threads:

- Reddit r/malta — *"going on holiday in Malta in January and wanted to get my
  first tattoo so was wondering what some of the best places are"*
- Facebook — *"heading to Malta in two weeks... thinking about getting a tattoo
  while there"* (150+ comments)

And the competitor who understood this writes it straight into their meta
description: **We The Sinners — "Perfect for parties or your vacation ink
session."** They rank above you.

Massa Tattoo has nothing addressing visitors. It should.

---

## 5. Technical items found in the repo copies

Confirm each against production before acting.

- **`og:image` points at `assets/favicon.svg`** on every page of `massatattoo/`
  — a 406-byte SVG, not a 1200×630 raster. Every share on Facebook, WhatsApp,
  LinkedIn and Instagram DM renders with no image. Given how much tattoo
  referral traffic moves through WhatsApp, this is a real cost. Needs a proper
  1200×630 PNG.
- **No `robots.txt` and no `sitemap.xml`** in either repo copy. Verify both
  exist and are reachable on production, and that the sitemap is submitted in
  Search Console.
- **Canonicals use `/index.html`** rather than `/`. Match whatever production
  actually serves.
- **Thin meta descriptions.** "A private appointment-only tattoo studio
  specialising in sacred geometry, dotwork, blackwork, and fine line work."
  No location, no call to action. Every one should name Malta or Birkirkara.

---

## 6. Cross-linking between the two sites

scottymassa.com currently links to massatattoo.com **over 100 times** across its
pages — that equity is already flowing in the right direction. The problem is
the anchor text:

```
4 × "Massa Tattoo Social Club"
1 × "Tattoo courses in Malta"
1 × "Birkirkara, Malta"
1 × "Studio site"
1 × "Studio journal"
1 × "Scotty at the studio"
```

Almost entirely brand and navigational. One descriptive anchor total.

Neither repo copy of massatattoo.com links back to scottymassa.com at all.

**Do this:** vary the anchors on scottymassa.com toward the target terms —
"tattoo studio in Birkirkara", "tattoo shop in Malta", "custom tattoos in
Malta" — used naturally in body copy rather than stuffed. And add links from
massatattoo.com to scottymassa.com's artist and style pages, so the two sites
reinforce each other instead of one feeding the other.

---

## 7. Link building

The SERP surfaces two immediate, legitimate targets:

- **QLC Real Estate** publishes *"The Ultimate Guide to the Best Tattoo Parlours
  in Malta"* (Oct 2024), listing Inkspire, Ritual Ink, Gypsy Ink, Pain & Ink —
  **Massa Tattoo is absent.** A polite email asking to be considered for the
  next update is the single easiest link on this page.
- **Times of Malta** ran *"The changing face of tattoos in Malta"* (Apr 2025).
  A studio with 16 years of history and a specialist discipline is exactly the
  source a follow-up piece needs. Worth a pitch.

Also worth claiming or correcting: Yellow Pages Malta (`yellow.com.mt/tattoos`,
79 studios listed), Tripadvisor, and TattoosWizard — all rank on page 1 for
the target term.

---

## Priority order

1. **Verify Googlebot can actually fetch the site** (Search Console live test).
   Everything else is wasted effort if it can't.
2. **Put "Malta" and "Birkirkara" in every title and meta description.**
3. **Drive Google Business Profile reviews from 104 toward 250**, and post
   weekly.
4. **Add LocalBusiness/TattooParlor schema** with the real 5.0/104 rating.
5. **Build the missing pages**: prices, walk-ins/appointment policy, and one
   aimed at visitors to the island.
6. **Fix `og:image`** to a real 1200×630 card.
7. **Vary the anchor text** on scottymassa.com and add return links.
8. **Pitch QLC and Times of Malta.**

Items 2, 4 and 6 are an afternoon's work and address the largest gaps.
