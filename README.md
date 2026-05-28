# ScottyMassa.com — Design Files

Static HTML/CSS design source for the personal portfolio site of
**Scotty Massa** — tattoo artist working out of Birkirkara, Malta and
travelling worldwide.

## Pages

| File              | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `index.html`      | Home — hero, intro, featured work, styles, tour preview, CTA  |
| `portfolio.html`  | Filterable gallery of selected tattoos                        |
| `about.html`      | Bio, story, stats, press, testimonial                         |
| `tour.html`       | 2026 world-tour dates with status (open / limited / waitlist) |
| `booking.html`    | Booking enquiry form                                          |
| `aftercare.html`  | Healing guide (timeline + do / don't lists)                   |
| `contact.html`    | Studio info + general contact form                            |

## Stack

Plain HTML + CSS + a tiny JS file. No build step — open `index.html`
in a browser to preview. Designed to be lifted into Next.js / Astro /
WordPress later if you want.

```
assets/
├── css/styles.css   # Full design system (palette, type, components)
├── js/main.js       # Nav toggle, reveal-on-scroll, chip filters
└── images/          # Drop real photography here (see README inside)
```

## Design system

- **Palette** — ink black, bone white, rust red, antique gold
- **Type** — Cinzel (display) · Inter (body) · Tangerine (script accents)
- **Components** — sticky nav, hero, marquee, portfolio grid (12-col),
  style cards, tour list, stats, quote, CTA block, footer
- **Animation** — reveal-on-scroll via IntersectionObserver

## Preview locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Notes for production

- Replace `.ph-1` … `.ph-9` gradient placeholders with real images
- Wire the booking + contact forms to a backend (Formspree, Resend, etc.)
- Embed a real Google Map on the contact page
- Add `srcset` variants for the portfolio tiles
- Consider lazy-loading the gallery (`loading="lazy"` on `<img>`)
