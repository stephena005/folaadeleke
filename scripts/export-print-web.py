#!/usr/bin/env python3
"""Export one print master to the web size the gallery wall uses.

    python3 scripts/export-print-web.py <master> images/prints/web/<slug>.jpg

1400px on the long edge, JPEG quality 74, progressive, sRGB. Prints
"<width> <height> <bytes>" on success so scripts/hang-print.mjs can pick
up the dimensions for the <img width height> attributes.

Same rules as scripts/export-coa-heroes.py, because the masters are the
same files: they run to 50,000px and 148MB, hence Image.MAX_IMAGE_PIXELS
and im.draft(); the .tif and .png versions reach 2GB and are never
opened. CMYK masters are print separations and are converted through
their embedded profile, not by dropping a channel.
"""
import io
import sys
from pathlib import Path

from PIL import Image, ImageCms

Image.MAX_IMAGE_PIXELS = None

LONG_EDGE = 1400
QUALITY = 74


def to_srgb(im):
    if im.mode == 'CMYK':
        profile = im.info.get('icc_profile')
        if not profile:
            raise SystemExit('CMYK image with no embedded profile: cannot convert accurately')
        return ImageCms.profileToProfile(
            im, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB'),
            outputMode='RGB', renderingIntent=ImageCms.Intent.PERCEPTUAL)
    if im.mode in ('RGBA', 'LA', 'P'):
        return im.convert('RGBA').convert('RGB')
    return im.convert('RGB') if im.mode != 'RGB' else im


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, destination = Path(sys.argv[1]), Path(sys.argv[2])
    if source.suffix.lower() in ('.tif', '.tiff', '.png'):
        sibling = source.with_suffix('.jpg')
        if sibling.exists():
            raise SystemExit(f'{source.name} is a print master that may be 2GB; use {sibling.name} instead')
    with Image.open(source) as im:
        # draft() lets libjpeg decode at 1/8 scale, which is what makes a 148MB master tolerable.
        if im.format == 'JPEG':
            im.draft('RGB' if im.mode != 'CMYK' else None, (LONG_EDGE * 2, LONG_EDGE * 2))
        im = to_srgb(im)
        w, h = im.size
        scale = LONG_EDGE / max(w, h)
        size = (round(w * scale), round(h * scale)) if scale < 1 else (w, h)
        im = im.resize(size, Image.LANCZOS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        im.save(destination, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print(size[0], size[1], destination.stat().st_size)


if __name__ == '__main__':
    main()
