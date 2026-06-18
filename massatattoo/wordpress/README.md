# Massa Tattoo — refreshed design (WordPress-ready HTML)

Six self-contained pages, re-skinned into a **refined dark + antique-gold**
theme. Same sections and copy as the current site — new look.

| File                   | Page                                                  |
| ---------------------- | ----------------------------------------------------- |
| `index.html`           | Home — ordered as a customer's decision path          |
| `portfolio.html`       | Portfolio — with working style filters                |
| `mandala-tattoos.html` | Mandala pillar page (meaning → styles → placement → book) |
| `tattoo-course.html`   | Tattoo courses (Foundation + Advanced)                |
| `social-club.html`     | Massa Tattoo Social Club — Skool community landing    |
| `about.html`           | About                                                 |
| `blog.html`            | Blog                                                  |
| `testimonials.html`    | Testimonials                                          |
| `contact.html`         | Contact                                               |

**Homepage order** follows how someone vetting a new tattoo artist actually
decides: see the work → what we specialise in → how we work → client proof →
how it works → the studio → FAQ → visit → book.

**Social Club (Skool):** the new `social-club.html` landing page and the promo
bands on Home/Courses link out to `https://www.skool.com/massa-tattoo-social-club-7386`
(membership shown as **$497 USD**, as Skool bills it). The `?ref=…` tracking
param from the original link was dropped — re-add it if you want that referral
attribution kept.

**Two content caveats to replace before publishing:**
- **Tattoo courses** — the live `/tattoo-course/` and `/advanced-tattoo-courses/`
  pages were behind a captcha and couldn't be read, so the course copy is a
  sensible draft. Swap in your real curriculum, dates, duration, and pricing
  (search `set per intake`, `Replace with your live`).
- **Studio contact details** — address, phone, email, hours, and social links
  are placeholders (search `Atelier Lane`, `555`, `instagram.com`). Piece
  pricing is now set (€3,000–€7,000 in the FAQ) — change the currency symbol
  if you bill in £/$.

## What's inside each file

Every file is **100% self-contained** — paste one in and it renders with no
extra setup:

- All CSS is inlined in a single `<style>` block (no external stylesheet).
- The header and footer are inlined (no JavaScript `fetch()` includes).
- The only external dependency is **Google Fonts** (Cormorant Garamond, Inter,
  JetBrains Mono), loaded over a CDN `<link>`.
- A tiny inline `<script>` runs the mobile menu, the © year, the portfolio
  filter highlight, and the hero mandala animation. If JS is blocked, all
  content still shows — nothing is hidden behind it.
- The Home and Portfolio work-grid photos are **embedded as data-URIs**, so the
  galleries display with no image hosting required. (That's why those two files
  are ~560 KB; the others are ~55 KB.)

## How to put these into WordPress

Pick whichever matches your setup:

1. **Full-width / blank page template + Custom HTML block (most common).**
   Create/edit a Page → set the template to a blank or full-width one → add a
   *Custom HTML* block → paste the whole file → Update. Repeat per page.

2. **Page builder (Elementor, Divi, WPBakery…).** Drop an *HTML* / *Code*
   widget onto a blank section and paste the file.

3. **Standalone .html upload.** Upload the files to your host (e.g.
   `/massatattoo-new/`) and preview them directly before wiring them into WP.

> Tip: keep the originals — paste into **draft** pages first and preview before
> replacing anything live.

## Two things to customize after pasting

1. **Internal links.** Nav, footer, and buttons link with placeholder
   filenames (`index.html`, `about.html`, `portfolio.html`, `blog.html`,
   `testimonials.html`, `contact.html`, `contact.html#book`). Find-and-replace
   these with your actual WordPress page URLs — e.g. `/`, `/about/`,
   `/portfolio/`, `/blog/`, `/testimonials/`, `/contact/`.

2. **Real details.** The address (`123 Atelier Lane`), phone, hours, and social
   links are placeholders carried over from the current site — swap in the real
   studio info (search the file for `Atelier Lane`, `555`, `instagram.com`).

## Optional

- **Lighter Home/Portfolio:** if you'd rather not ship the embedded photos,
  upload them to the WordPress Media Library and replace each
  `.work-tile__art.photo-…{background-image:url("data:image…")}` rule in the
  `<style>` block with your media URL. That drops both files back to ~55 KB.
- **Booking form / newsletter:** the form markup is in place but not wired to a
  backend. Point it at your form plugin (Contact Form 7, Fluent Forms, etc.) or
  an email/booking endpoint.

---
Generated from the source pages in `massatattoo/` — same elements, new design.
