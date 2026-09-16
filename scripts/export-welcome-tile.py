#!/usr/bin/env python3
"""Export a 480x600 archive tile for the welcome email's 3-up row.

    python3 scripts/export-welcome-tile.py <master.jpg> <slug> [focus]

Writes images/newsletter/welcome/tile-<slug>.jpg: a 4:5 cover crop of the
master, 480x600, quality 82 — the same treatment as the existing
tile-girl-dad / tile-sisterhood files. `focus` is the crop centre along
the axis being trimmed, 0.0-1.0 (default 0.5). Print masters run to
50,000px, hence MAX_IMAGE_PIXELS and draft(); never pass the .tif/.png.
"""
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
W, H, Q = 480, 600, 82


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    src, slug = Path(sys.argv[1]), sys.argv[2]
    focus = float(sys.argv[3]) if len(sys.argv) == 4 else 0.5
    if src.suffix.lower() in ('.tif', '.tiff', '.png', '.pdf'):
        raise SystemExit('use the .jpg master')
    dst = Path('images/newsletter/welcome') / f'tile-{slug}.jpg'
    with Image.open(src) as im:
        if im.format == 'JPEG':
            im.draft('RGB', (W * 4, H * 4))
        im = im.convert('RGB')
        w, h = im.size
        target = W / H
        if w / h > target:  # too wide: trim sides
            cw = round(h * target)
            x = round((w - cw) * focus)
            box = (x, 0, x + cw, h)
        else:               # too tall: trim top/bottom
            ch = round(w / target)
            y = round((h - ch) * focus)
            box = (0, y, w, y + ch)
        im = im.crop(box).resize((W, H), Image.LANCZOS)
        im.save(dst, 'JPEG', quality=Q, optimize=True, progressive=True)
    print(dst, f'{W}x{H}', dst.stat().st_size, 'bytes', 'crop', box)


if __name__ == '__main__':
    main()
