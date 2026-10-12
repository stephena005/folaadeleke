#!/usr/bin/env python3
"""Export product_shots.py renders as web images for a product page.

    python3 scripts/relief/export_web_shots.py <render.png> <out.jpg> [--pad-square]

Same output rules as scripts/export-print-web.py: 1400px on the long edge,
progressive JPEG, quality 74, sRGB. --pad-square centres a wide render on
a square white canvas instead of letting the square gallery crop it; only
use it for white-background renders, where the padding is seamless.
Prints "<width> <height> <bytes>".
"""
import argparse
import os

from PIL import Image

LONG_EDGE = 1400
QUALITY = 74


def main():
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("out")
    p.add_argument("--pad-square", action="store_true")
    a = p.parse_args()

    im = Image.open(a.src).convert("RGB")
    if a.pad_square and im.width != im.height:
        side = max(im.size)
        canvas = Image.new("RGB", (side, side), (255, 255, 255))
        canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = canvas
    s = LONG_EDGE / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    im.save(a.out, "JPEG", quality=QUALITY, progressive=True, optimize=True)
    print(im.width, im.height, os.path.getsize(a.out))


if __name__ == "__main__":
    main()
