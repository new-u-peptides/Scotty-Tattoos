#!/usr/bin/env python3
"""Re-encode the site's photography as WebP and emit the small srcset variant.

Run after adding or replacing a photo in assets/images/:

    pip install pillow && python3 tools/optimise-images.py

For every JPEG still sitting in assets/images/ this writes a same-named .webp
and removes the JPEG. For every image referenced by an <img> tag it also writes
a `-480.webp` so the markup's srcset has a genuinely small option to pick on
phones. Everything is idempotent — re-running only rewrites what changed.
"""
from PIL import Image
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / "assets" / "images"

QUALITY = 82          # visually lossless on this photography at 1/2 the bytes
SMALL_WIDTH = 480     # the srcset's phone rung

# Referenced by an <img> tag (index.html / portfolio.html) and therefore
# carrying a srcset. CSS backgrounds only ever need the full-size file.
SRCSET = {
    "tattoos/back-in-progress", "tattoos/back-mandala", "tattoos/chest-mandala",
    "tattoos/geo-chrysanthemum-leg", "tattoos/geo-hexagon-thigh",
    "tattoos/geo-lion-leg", "tattoos/geo-owl-calf", "tattoos/geo-ribs-thigh",
    "tattoos/geo-serpent-forearm", "tattoos/geo-skull-back",
    "tattoos/geo-sleeve-architectural", "tattoos/geo-suminagashi-hip",
    "tattoos/leg-sleeve-mandala", "tattoos/mandala-elbow",
    "tattoos/mandala-half-sleeve", "tattoos/mandala-nape",
    "tattoos/mandala-shoulder", "tattoos/wrist-mandala",
}

# Only referenced by the retired massatattoo/ site, which still wants JPEG.
SKIP = {"tattoos/hip-leopard", "tattoos/leg-chrysanthemum"}


def stem(path: Path) -> str:
    return f"{path.parent.name}/{path.stem}"


def save_webp(im: Image.Image, dest: Path) -> int:
    im.save(dest, "WEBP", quality=QUALITY, method=6)
    return dest.stat().st_size


def main() -> int:
    saved = 0
    for src in sorted(IMAGES.rglob("*")):
        if src.suffix.lower() not in {".jpg", ".jpeg"}:
            continue
        key = stem(src)
        if key in SKIP:
            print(f"  skip  {key} (legacy site)")
            continue
        before = src.stat().st_size
        with Image.open(src) as im:
            im = im.convert("RGB")
            after = save_webp(im, src.with_suffix(".webp"))
        src.unlink()
        saved += before - after
        print(f"  webp  {key}  {before // 1024}K -> {after // 1024}K")

    for key in sorted(SRCSET):
        full = IMAGES / f"{key}.webp"
        if not full.exists():
            print(f"  MISS  {key}.webp", file=sys.stderr)
            continue
        small = full.with_name(f"{full.stem}-{SMALL_WIDTH}.webp")
        with Image.open(full) as im:
            if im.width <= SMALL_WIDTH:
                continue
            h = round(im.height * SMALL_WIDTH / im.width)
            save_webp(im.resize((SMALL_WIDTH, h), Image.LANCZOS), small)
        print(f"  {SMALL_WIDTH}w   {key} -> {small.stat().st_size // 1024}K")

    print(f"\nreclaimed {saved // 1024}K from the JPEGs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
