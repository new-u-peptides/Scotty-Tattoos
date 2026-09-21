#!/usr/bin/env python3
"""Generate the raster icon set from the brand mandala.

Source of truth for the mark is assets/seo/favicon.svg — a simplified,
small-size-legible reduction of assets/brand/logo-mark.png. This script
redraws that same geometry with Pillow (no SVG rasteriser needed) and
writes the PNG/ICO variants browsers and crawlers ask for.

Run from the repo root:  python3 scripts/generate-icons.py
"""

import math
import os

from PIL import Image, ImageDraw

INK = (10, 10, 10, 255)        # --ink
GOLD = (232, 182, 83, 255)     # --gold
GOLD_HI = (243, 204, 118, 255) # --gold-hi

SS = 8  # supersampling factor


def draw_mark(size):
    """Draw the mandala mark on a square canvas of `size` px."""
    s = size * SS
    img = Image.new("RGBA", (s, s), INK)
    d = ImageDraw.Draw(img)
    c = s / 2

    # Outer ring of 12 triangular points — the logo's petal crown.
    r_out, r_in = s * 0.48, s * 0.335
    for i in range(12):
        a = math.radians(i * 30 - 90)
        a1, a2 = a - math.radians(13), a + math.radians(13)
        d.polygon(
            [
                (c + r_out * math.cos(a), c + r_out * math.sin(a)),
                (c + r_in * math.cos(a1), c + r_in * math.sin(a1)),
                (c + r_in * math.cos(a2), c + r_in * math.sin(a2)),
            ],
            fill=GOLD,
        )

    # Hairline ring binding the crown.
    w = max(1, int(s * 0.018))
    d.ellipse([c - r_in, c - r_in, c + r_in, c + r_in], outline=GOLD, width=w)

    # Solid gold sun disc with a black core — the centre of the logo mark.
    r_disc = s * 0.205
    r_core = s * 0.085
    d.ellipse([c - r_disc, c - r_disc, c + r_disc, c + r_disc], fill=GOLD_HI)
    d.ellipse([c - r_core, c - r_core, c + r_core, c + r_core], fill=INK)

    return img.resize((size, size), Image.LANCZOS)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    seo = os.path.join(root, "assets", "seo")
    os.makedirs(seo, exist_ok=True)

    # Google reads /favicon.ico at the site root; keep the multi-size ICO.
    ico_sizes = [16, 32, 48]
    frames = [draw_mark(n) for n in ico_sizes]
    frames[-1].save(
        os.path.join(root, "favicon.ico"),
        format="ICO",
        sizes=[(n, n) for n in ico_sizes],
    )

    for name, n in (
        ("favicon-32.png", 32),
        ("favicon-192.png", 192),
        ("favicon-512.png", 512),
        ("apple-touch-icon.png", 180),
    ):
        draw_mark(n).save(os.path.join(seo, name), format="PNG", optimize=True)

    print("icons written")


if __name__ == "__main__":
    main()
