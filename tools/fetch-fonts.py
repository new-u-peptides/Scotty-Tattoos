#!/usr/bin/env python3
"""Vendor the web fonts from Google Fonts into assets/fonts/.

    python3 tools/fetch-fonts.py        # or: npm run build:fonts

Serving them from fonts.googleapis.com cost a render-blocking stylesheet on
a third-party origin (~750ms) before the browser could even discover the
font files on a *second* third-party origin. Same-origin files are
discoverable from our own CSS and can be cached immutably.

The families are variable fonts: Google emits several @font-face blocks per
family that all point at one file, clamped to a weight each. This keeps one
block per (family, unicode-range) declaring the whole axis, which also
covers the weights the site actually renders — Cinzel 400, Inter 700 and
Tangerine 400 were being synthesised by the browser because the old request
never asked for them.

Only latin and latin-ext are vendored. unicode-range means a page that uses
no latin-ext character never downloads that file.
"""
from fontTools import ttLib
from fontTools.varLib import instancer
from fontTools.ttLib import TTFont
from pathlib import Path
import io
import json
import re
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "fonts"

GOOGLE_CSS = (
    "https://fonts.googleapis.com/css2"
    "?family=Cinzel:wght@400..700"
    "&family=Inter:wght@300..700"
    "&family=Tangerine:wght@700"          # see TANGERINE note below
    "&display=swap"
)
# A modern desktop UA is what makes Google serve woff2 rather than ttf.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")

WANTED_SUBSETS = {"latin", "latin-ext"}

# The variable faces ship a 100..900 or 400..900 weight axis; the site renders
# 400, 500, 600 and 700. Clamping the axis takes 26% off Inter's latin file,
# which is bytes straight off the critical path. Widen this if a design ever
# calls for a heavier or lighter weight — outside the range the browser
# clamps rather than interpolating.
WEIGHT_RANGE = (400, 700)

# TANGERINE: the old markup requested wght@700 while .script computes to
# weight 400. With only the bold file available the browser rendered the bold
# outlines anyway, so 700 is what the site has always looked like. We vendor
# 700 and typography.css now says font-weight: 700 explicitly, rather than
# leaving the result to depend on which file happens to exist.


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def parse_css(css: str):
    """(family, subset, unicode_range, url) for the subsets we vendor."""
    faces = []
    subset = None
    for block in re.split(r"\n(?=/\* )", css):
        name = re.match(r"/\* ([a-z-]+) \*/", block.strip())
        if name:
            subset = name.group(1)
        if subset not in WANTED_SUBSETS:
            continue
        for m in re.finditer(r"@font-face \{(.*?)\}", block, re.S):
            body = m.group(1)
            fam = re.search(r"font-family: '([^']+)'", body)
            url = re.search(r"url\((https://[^)]+\.woff2)\)", body)
            rng = re.search(r"unicode-range: ([^;]+);", body)
            wgt = re.search(r"font-weight: ([\d ]+);", body)
            if fam and url and rng:
                faces.append((fam.group(1), subset, rng.group(1).strip(),
                              url.group(1), (wgt.group(1) if wgt else "400").strip()))
    return faces


def clamp_axis(data: bytes):
    """Narrow a variable face's weight axis; returns (bytes, (min, max))."""
    font = ttLib.TTFont(io.BytesIO(data))
    if "fvar" not in font:
        return data, None
    inst = instancer.instantiateVariableFont(font, {"wght": WEIGHT_RANGE}, inplace=False)
    buf = io.BytesIO()
    inst.flavor = "woff2"
    inst.save(buf)
    return buf.getvalue(), WEIGHT_RANGE


def axis_range(data: bytes):
    """The font's real wght axis, or None for a static face."""
    font = TTFont(io.BytesIO(data))
    if "fvar" not in font:
        return None
    for axis in font["fvar"].axes:
        if axis.axisTag == "wght":
            return int(axis.minValue), int(axis.maxValue)
    return None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    css = get(GOOGLE_CSS).decode()

    seen, manifest = {}, []
    for family, subset, rng, url, weight in parse_css(css):
        # Variable faces repeat one file across several weight blocks, so
        # family+subset identifies them. A static face is per weight.
        key = (family, subset)
        if key in seen:
            continue
        raw = get(url)
        data, axis = clamp_axis(raw)
        name = f"{family.lower()}-{subset}.woff2"
        (OUT / name).write_bytes(data)
        seen[key] = name
        manifest.append({
            "family": family, "subset": subset, "file": name,
            "unicodeRange": rng,
            # A weight range for a variable face, a single weight for a static one.
            "weight": list(axis) if axis else [int(weight.split()[0])] * 2,
            "variable": axis is not None,
            "bytes": len(data),
        })
        w = f"{axis[0]}..{axis[1]}" if axis else f"static {weight}"
        saved = f"  (from {len(raw)//1024}K)" if len(raw) != len(data) else ""
        print(f"  {name:<28} {len(data)//1024:>4}K  wght {w}{saved}")

    (OUT / "fonts.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\n{len(manifest)} files, {sum(m['bytes'] for m in manifest)//1024}K total")
    print("manifest: assets/fonts/fonts.json  (build-assets.mjs generates the @font-face rules)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
