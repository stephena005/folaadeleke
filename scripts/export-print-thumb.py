#!/usr/bin/env python3
"""Export the home page wall thumbnail from a print's web JPEG.

    python3 scripts/export-print-thumb.py images/prints/web/<slug>.jpg images/prints/thumbs/<slug>.jpg

640px on the long edge, JPEG quality 78, progressive. The source is the
1400px web export (scripts/export-print-web.py), never the master: it is
already sRGB and small, so there is nothing to convert. Prints
"<width> <height> <bytes>" on success, like export-print-web.py.

The home page wall shows ~20 prints at once while they move; at the web
size that is ~7MB before the first frame, at this size ~1.3MB.
"""
import sys
from pathlib import Path

from PIL import Image

LONG_EDGE = 640
QUALITY = 78


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    with Image.open(src) as im:
        im = im.convert('RGB')
        im.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        print(im.width, im.height, dst.stat().st_size)


if __name__ == '__main__':
    main()
