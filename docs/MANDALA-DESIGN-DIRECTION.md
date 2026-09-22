# Mandala design direction — synthesis, longevity, and next iterations

The three reference states are already in the codebase. `shared/js/hero-mandala.js`
compiles and morphs exactly three of them, so the vocabulary below is shared
between the skin and the screen:

| Reference | Engine state | What it is |
|---|---|---|
| Bold concentric triangles + wavy solar core | `sigil` | the canonical logo mark — 28-fold symmetry, four bands of curved triangular cells, gold ring at r≈0.147, solid black centre |
| Interlacing star polygons under a dust halo | `weave` | the geometric lattice — star polygons, radial webbing, stipple aura |
| Dense stippled petal rosette | `bloom` | the organic crown — overlapping star-petals, soft glowing perimeter |

Everything here is written against those three, and against the brand promise:
**Geometry, built to last.** Two words in that line do real work. *Geometry*
means the design has to survive being read as structure. *Last* means it has to
survive ten years in skin. A concept that only wins on a fresh-ink photo is a
concept that breaks the tagline.

---

## 1. Aesthetic synthesis and hierarchy

### 1.1 The actual problem

`sigil` and `bloom` are not fighting over style. They are fighting over the same
**tonal register**. Both fill roughly 55–65% of their annulus with mid-value
gold. When you overlay them — as the composites do — the eye gets two mid-grey
fields stacked, and mid-grey on mid-grey is exactly how a mandala goes muddy.

The fix is not "less detail". It is **a value ladder with no ties**. Assign each
radial zone a single job and a single density, and never let two adjacent zones
sit in the same value bracket.

### 1.2 The four-zone value ladder

Radii are given as a fraction of the mandala's outer radius, matched to the
`sigil` proportions already in the engine.

```
  r 0.00 – 0.15   CORE        solid black void + one bold gold ring
                              ~95% coverage. The anchor. No detail at all.
        │
  r 0.15 – 0.34   RADIANCE    the wavy solar rays
                              ~35% coverage. Open black between every ray.
        │                     This is the breathing zone — it is what makes
        │                     the core read as a void and not a blob.
        │
  r 0.34 – 0.72   STRUCTURE   bold triangular cells / star-polygon lattice
                              ~60% coverage. The heaviest *patterned* zone.
        │                     Hard edges, solid fills, unambiguous shapes.
        │
  r 0.72 – 1.00   AURA        stipple dissolve, petals, particle spray
                              ~20% coverage, falling to ~5% at the rim.
                              No solid shape may live out here.
```

Four rules follow from the ladder, and they are the whole synthesis:

1. **One bold zone only.** STRUCTURE carries the weight. If AURA also carries
   weight, the design has two competing rings and no centre. The composites
   currently break this by letting the `bloom` petals reach near-`sigil` density.
2. **Breathing rings are mandatory.** Between STRUCTURE and AURA, leave a clean
   unbroken black band of at least 4 mm at final size. This single gap does more
   for legibility than any amount of line-weight tuning — it is the seam that
   tells the eye "the solid part ends here".
3. **Stipple never overlaps solid.** Dotwork over a filled triangle reads as
   dirt at year one and as a smudge at year eight. Stipple lives in negative
   space, or it lives at the dissolving tip of a shape, never across its body.
4. **Density falls monotonically outward** past r 0.34. Once the gradient
   reverses — a dense outer ring outside a sparse one — the design loses its
   centre and starts reading as a wreath.

Applied to the composites: keep the `sigil` core and STRUCTURE band at full
contrast, and cut the overlaid `bloom` field to roughly a third of its current
density, letting it live only outside r 0.72. That is the version that reads
from across a room *and* rewards standing close.

### 1.3 Scalability

Design at the size it will be worn, not at 1024 px. The three states scale very
differently:

| Placement | Ø | What survives |
|---|---|---|
| Wrist / ankle | 60–80 mm | CORE + RADIANCE + one STRUCTURE band. Drop AURA entirely; at this size stipple is a grey smear. |
| Forearm / shoulder cap | 120–160 mm | All four zones, but STRUCTURE limited to two bands, AURA at half density. |
| Chest / back / thigh | 200 mm+ | The full composite. This is the only size at which the `weave` lattice reads as a lattice and not as texture. |

The honest version of this: **`weave` is not a small tattoo.** Its interlacing
star polygons depend on the eye tracking individual strands across crossings. Under
about 140 mm the strands merge and the whole zone collapses to grey. Either commit
to a large placement or substitute a simpler STRUCTURE band.

---

## 2. Ageing: what the ink actually does in 5–10 years

Three physical processes drive everything below.

**Spread.** Ink migrates in the dermis. Budget roughly 15–25% line-width growth
over a decade, faster on high-movement and high-friction areas (inner arm, ribs,
hands, feet) and slower on the outer upper arm, back, and thigh.

**Fill-in.** Any negative gap narrower than roughly twice the flanking line
weight closes. This is the single most common failure in geometric work: an
elegant hairline gap between two triangles at week one becomes a solid mass at
year seven, and the design loses exactly the structure it was built on.

**Stipple coalescence.** Individual dots spread until neighbours touch. Once
they touch, a dotwork field stops being dotwork and becomes a flat grey wash.
Dot *spacing*, not dot size, decides whether a stipple field still reads as
stipple at year ten.

### 2.1 Line weight distribution

Stated as needle configuration and finished width. The ratio matters more than
the absolute numbers — scale them together with the tattoo.

| Element | Zone | Finished weight | Notes |
|---|---|---|---|
| Core ring | CORE | 1.2–1.8 mm | Bold enough to stay a ring, not a smudge, at year ten. |
| Solar ray | RADIANCE | 0.7–1.0 mm | Tapered, but never taper below 0.4 mm — thinner tips vanish. |
| Cell outline | STRUCTURE | 0.5–0.7 mm | The structural workhorse. |
| Lattice strand | STRUCTURE | 0.35–0.5 mm | The floor for anything that must stay readable as a distinct line. |
| Petal / aura line | AURA | 0.3–0.4 mm | Acceptable *only* because these are decorative; if one fades it costs nothing. |

Two rules:

- **Nothing below 0.3 mm anywhere.** A 0.25 mm line is a 0.31 mm line at year
  ten if you are lucky and a broken dotted line if you are not.
- **Adjacent weights differ by at least 1.5×.** A 0.5 mm line next to a 0.6 mm
  line is a distinction that does not exist in five years. Make the hierarchy
  coarse enough that spread cannot erase it.

### 2.2 Negative space rules

- Minimum gap between any two inked elements: **1.5 mm**, and never less than
  2× the heavier flanking line.
- Between zones (the breathing rings): **4 mm minimum** at final size.
- Inside the STRUCTURE band, the black gap between triangular cells should be
  at least 40% of the cell's own width at its widest. The `sigil` band is
  currently close to this — the outermost band is the one to watch, where the
  cells crowd.

### 2.3 Stippling rules

- **Dot spacing ≥ 3× dot diameter** in any field intended to still read as
  separate dots in a decade. Below 2×, plan for it to become solid grey and
  design as though it already is.
- **Gradients need a range, not a slope.** Run the density from about 40% at
  the inner edge to under 10% at the rim. A gradient that only spans 40%→30%
  is invisible even on fresh ink.
- **No stipple finer than a 3-round-liner dot.** Single-needle dots are the
  first thing to disappear.
- **Stipple only against skin, never against black.** See rule 3 above.

### 2.4 The honest verdict on each state

- **`sigil` — excellent.** Bold cells, generous gaps, a solid core. This ages
  the way the tagline promises. It is the right canonical mark.
- **`bloom` — good, with one caveat.** Overlapping petal outlines at 0.3 mm
  will soften into an atmospheric haze. That is fine — arguably it improves —
  *provided* the design does not depend on any individual petal being legible.
  Do not put meaning in the aura.
- **`weave` — the risk.** Fine interlacing strands with tight crossings are
  precisely the fill-in failure case. Every crossing is a point where two lines
  spread toward each other. To make `weave` last: raise strands to 0.45 mm
  minimum, open the crossing gaps to 2 mm, and cut the number of interlacing
  layers from what the reference shows to at most three. Fewer, heavier strands
  at ten years beat more, finer strands at ten weeks.

---

## 3. Three conceptual directions

### Direction A — The Alchemical Solar Lattice

*`sigil` core + `weave` structure. The flagship.*

The wavy solar burst and black void stay exactly as they are — untouched, full
contrast, the unmistakable brand anchor. Outside r 0.34, the bold triangular
bands are replaced by a **simplified** star-polygon lattice: a `{12/5}`
star polygon over a `{12/4}`, two layers only, strands at 0.5 mm, every
crossing opened to a clean 2 mm break so the over/under reads unambiguously.
Where the lattice strands intersect, place a small solid gold node (1.5 mm) —
these nodes become the secondary rhythm, and because they are solid they are
the part that survives longest.

Between lattice and rim: a 4 mm clean black ring, then a restrained AURA of
single-weight stipple at 15% density, no petals.

- **Reads as:** an astrolabe. Instrument, not ornament.
- **Placement:** back, chest, outer thigh. 180 mm+.
- **Ageing:** strong, *if* the layer count stays at two. Three layers is the
  point at which it becomes a texture.
- **Why it wins:** it is the only direction where the brand's two halves —
  ritual core, technical structure — are both fully present and not competing,
  because the value ladder separates them by radius rather than by overlay.

### Direction B — The Ethereal Stellar Crown

*`bloom` aura, amplified, around a stripped geometric heart.*

Invert the emphasis. The centre becomes quiet: the black void, the gold ring,
and a *single* band of clean geometric petals at 0.6 mm — no solar rays, no
triangle bands, nothing past r 0.5. Everything from r 0.5 outward is stipple:
a wide, slow, genuinely gradient field of overlapping star-petal outlines
dissolving into loose particles, running 45% density down to 4% at the rim,
with the outermost 15% of the radius carrying nothing but scattered dots.

The gradient is the whole design. It needs room — this direction fails at
anything under 200 mm because the gradient needs enough radius to actually
gradate.

- **Reads as:** a nebula around a still point. Soft, feminine, atmospheric.
- **Placement:** back piece, sternum, shoulder blade. 220 mm+.
- **Ageing:** deliberately forgiving. The design *intends* softness, so spread
  works with it rather than against it. Expect the outer third to become a
  luminous haze by year eight and treat that as the mature form.
- **Caution:** this is the direction furthest from "built to last" as a visual
  claim, even though it ages fine. It is a portfolio piece, not the logo.

### Direction C — Modern Minimalist Sacred

*`sigil`, stripped to what survives.*

Take the canonical mark and delete. Keep the black void, the gold ring, the 28
solar rays, and **one** band of triangular cells — the innermost, where the
cells are widest. Everything else goes. Raise every remaining line by 40%.
Open the cell gaps to 3 mm. No stipple anywhere; where the reference dissolves
a cell tip into dots, terminate it instead with a clean taper to a 0.5 mm point.

The result has maybe 30% of the elements and loses almost nothing at conversation
distance — which is the point. This is the version that works as a 40 mm wrist
piece, as a favicon, as an embroidered patch, and as a sign above a door.

- **Reads as:** a seal. Authoritative, legible, reproducible.
- **Placement:** anywhere, any size. The only direction that genuinely scales
  from 40 mm to 400 mm.
- **Ageing:** the best of the three by a wide margin. There is nothing here
  fine enough to fail.
- **Strategic note:** this should probably become the brand's real mark, with A
  as the hero illustration and B as portfolio work. A logo that survives being
  shrunk to a favicon and a logo that survives a decade in skin are the same
  design problem, and C solves both.

---

## 4. AI generation prompts

Both prompts target **Direction A**, the strongest synthesis. Written for
Midjourney v6/v7 with parameters; the parameter block strips cleanly for
DALL·E or other engines.

### Prompt 1 — flash sheet / design reference

```
sacred geometry mandala tattoo flash, centred symmetrical composition on pure
black, a solid black circular void at the exact centre ringed by one bold
burnished-gold band, surrounded by twenty-eight tapering wavy solar rays like
slow flame, then a wide band of two interlacing twelve-point star polygons in
crisp fine-line gold with clean open breaks at every crossing and small solid
gold nodes at each intersection, a clean empty black ring separating the
lattice from a faint outer halo of sparse stippled gold dots dissolving into
darkness, strict radial symmetry, precise technical linework, high contrast
gold on black, tattoo flash sheet, vector-sharp edges, no background texture,
no colour other than gold and black
--ar 1:1 --style raw --stylize 250 --q 2 --no photograph, skin, arm, body,
watermark, text, signature, blur, gradient background, rainbow, pastel
```

Weighting notes: `strict radial symmetry` and `centred symmetrical composition`
are stated twice in different words on purpose — symmetry is the first thing
diffusion models drop. `clean open breaks at every crossing` is what produces
a readable lattice instead of a texture; without it the model welds the strands.
`--style raw` and a low `--stylize` keep it from adding decorative noise the
design ladder does not want.

### Prompt 2 — on-skin realism / client mockup

```
close-up photograph of a healed geometric mandala tattoo on a forearm, fine-line
blackwork with gold-leaf highlights, solid black circular centre with a bold
ring, twenty-eight wavy solar rays radiating outward, an outer band of
interlacing star-polygon linework with open crossings and solid dot nodes, a
clean band of untouched skin separating that from a soft outer field of stipple
dotwork fading to nothing, crisp confident line weights, generous negative
space, perfectly radially symmetrical, natural skin texture, soft directional
studio light, shallow depth of field, shot on 85mm
--ar 4:5 --style raw --stylize 150 --q 2 --no busy background, colour ink,
smudged lines, asymmetry, text, watermark, over-saturation, plastic skin
```

Weighting notes: *healed* rather than *fresh* — fresh-tattoo renders come with
redness and an unrealistic crispness that oversells the design. `generous
negative space` is doing the work of section 1's value ladder; drop it and the
model fills every gap. `85mm` and `shallow depth of field` produce a plausible
client-facing photograph rather than an illustration pretending to be one.

### Iterating

- If the lattice welds into texture: raise `clean open breaks` to
  `wide clearly separated breaks at every crossing` and add `minimal, only two
  layers of linework`.
- If it loses the centre: add `strong dark centre, high contrast between centre
  and outer ring` — this is the value ladder failing and it is always fixable
  by asserting the CORE zone harder.
- If the stipple turns to a solid ring: add `sparse scattered dots, mostly empty
  space at the outer edge`.

---

## 5. What to do next

1. **Draw Direction C first.** It settles the brand mark, and it is the
   cheapest to test — it either reads at 40 mm or it does not.
2. **Draw Direction A at full size** as the hero illustration, and check the
   lattice at two layers before committing to three.
3. **Hold Direction B for portfolio work**, not for brand identity.
4. **Audit the existing `weave` state** against §2.4 — it is the one element in
   the current set that does not yet honour the tagline.
