#!/usr/bin/env python3
"""Rasterise the icon set from the two vector sources.

The brand mark is the SM monogram (bone on ink). It carries three stroke
weights — heavy monogram, hairline ring, hairline needle — and only the
heavy one survives below ~48px, so the icons are tiered:

  assets/seo/favicon.svg     monogram alone      -> 16 / 32 / 48 (favicon.ico)
  assets/seo/icon-badge.svg  monogram in a ring  -> 180 / 192 / 512

Requires cairosvg.  Run from the repo root:

    python3 scripts/generate-icons.py
"""

import os

import cairosvg
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEO = os.path.join(ROOT, "assets", "seo")

SMALL = os.path.join(SEO, "favicon.svg")
BADGE = os.path.join(SEO, "icon-badge.svg")

# Above this size the ring reads, so the badge lockup is used instead.
BADGE_FROM = 64


def render(src, px):
    tmp = os.path.join(SEO, f".{px}.png")
    cairosvg.svg2png(url=src, write_to=tmp, output_width=px, output_height=px)
    img = Image.open(tmp).convert("RGBA")
    os.remove(tmp)
    return img


def icon(px):
    return render(BADGE if px >= BADGE_FROM else SMALL, px)


def main():
    # Google reads /favicon.ico at the site root before anything else.
    ico = [icon(n) for n in (16, 32, 48)]
    ico[-1].save(os.path.join(ROOT, "favicon.ico"), format="ICO",
                 sizes=[(16, 16), (32, 32), (48, 48)])

    for name, px in (
        ("favicon-32.png", 32),
        ("apple-touch-icon.png", 180),
        ("favicon-192.png", 192),
        ("favicon-512.png", 512),
    ):
        icon(px).save(os.path.join(SEO, name), format="PNG", optimize=True)

    print("icons written")


if __name__ == "__main__":
    main()
