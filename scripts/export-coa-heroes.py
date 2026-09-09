#!/usr/bin/env python3
"""Export the hero image the certificate delivery email uses, one per work.

    python3 scripts/export-coa-heroes.py [--force]

The email is 560px wide, so the hero is exported at 1120 for retina, keeping
the work's own aspect ratio — the house template runs images full bleed and
never letterboxes art on white.

Which file each work is exported FROM is decided by the certificate: whatever
crop the certificate reproduces is the crop the buyer will recognise, so this
finds the largest file in the same folder with that same aspect ratio. Print
masters here run to 50,000px and 148MB, hence Image.MAX_IMAGE_PIXELS and
im.draft(); the .tif and .png versions reach 2GB and are never opened.

CMYK masters are print separations and are converted through their embedded
profile, not by dropping a channel — but an RGB source of sufficient size is
always preferred, because no conversion beats no conversion.
"""

import argparse
import io
import json
import re
from html import unescape
from pathlib import Path

from PIL import Image, ImageCms

Image.MAX_IMAGE_PIXELS = None

REPO_ROOT = Path(__file__).resolve().parent.parent
CERT_DIRS = ['back-office/certificates/format-1-split-panel-html', 'back-office/certificates/html']
OUT_DIR = REPO_ROOT / 'images/newsletter/coa'

MANIFEST = OUT_DIR / 'manifest.json'
WIDTH = 1120
MAX_BYTES = 260 * 1024
QUALITIES = [82, 78, 74, 70]
ASPECT_TOLERANCE = 0.02

CANONICAL_TITLES = {
    'loud celebration': 'Loud Celebration',
    'sisterhood': 'Sisterhood',
    'no vc / no vacation': 'No VC / No Vacation',
}


def slugify(value):
    value = value.replace('&', ' and ')
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', value.lower())).strip('-')


def works_from_certificates():
    """Every distinct work, and the image its certificate reproduces."""
    works = {}
    for directory in CERT_DIRS:
        for cert in sorted((REPO_ROOT / directory).glob('*.html')):
            if 'example' in cert.name:
                continue
            html = cert.read_text(errors='replace')
            title = re.search(r'class="title">(.*?)</div>', html, re.S)
            image = re.search(r'<img class="(?:art-img|artwork-img)" src="([^"]+)"', html)
            if not title or not image:
                continue
            name = unescape(title.group(1)).strip()
            name = CANONICAL_TITLES.get(name.lower(), name)
            src = REPO_ROOT / re.sub(r'^(\.\./)+', '', image.group(1))
            works.setdefault(name, src)
    return works


def best_source(reference):
    """The largest sibling with the same crop; RGB in preference to CMYK."""
    with Image.open(reference) as im:
        target = im.size[0] / im.size[1]

    rgb, cmyk = [], []
    for path in reference.parent.iterdir():
        if path.suffix.lower() not in ('.jpg', '.jpeg'):
            continue
        try:
            with Image.open(path) as im:
                width, height = im.size
                mode = im.mode
        except Exception:
            continue
        if width < WIDTH or abs(width / height - target) > ASPECT_TOLERANCE:
            continue
        (cmyk if mode == 'CMYK' else rgb).append((width * height, path))

    for candidates in (rgb, cmyk):
        if candidates:
            return max(candidates)[1]
    return reference


def to_srgb(im):
    if im.mode == 'CMYK':
        profile = im.info.get('icc_profile')
        if not profile:
            raise SystemExit(f'CMYK image with no embedded profile: cannot convert accurately')
        return ImageCms.profileToProfile(
            im, ImageCms.ImageCmsProfile(io.BytesIO(profile)), ImageCms.createProfile('sRGB'),
            outputMode='RGB', renderingIntent=ImageCms.Intent.PERCEPTUAL)
    return im.convert('RGB') if im.mode != 'RGB' else im


def export(source, destination):
    with Image.open(source) as im:
        # Decode at a reduced scale where the JPEG allows it — these masters
        # are gigapixel and a full decode is minutes of work for nothing.
        im.draft('RGB' if im.mode != 'CMYK' else None, (WIDTH * 2, WIDTH * 2))
        im = to_srgb(im)
        height = round(im.size[1] * WIDTH / im.size[0])
        im = im.resize((WIDTH, height), Image.LANCZOS)

        for quality in QUALITIES:
            buffer = io.BytesIO()
            im.save(buffer, 'JPEG', quality=quality, optimize=True, progressive=True)
            if buffer.tell() <= MAX_BYTES or quality == QUALITIES[-1]:
                destination.write_bytes(buffer.getvalue())
                return im.size, quality, buffer.tell()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true', help='re-export files that already exist')
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    print(f'{"work":34} {"exported":13} {"q":>3} {"size":>8}  source')
    for title, reference in sorted(works_from_certificates().items()):
        destination = OUT_DIR / f'{slugify(title)}.jpg'
        if destination.exists() and not args.force:
            total += destination.stat().st_size
            print(f'{title:34} {"(exists)":13} {"":>3} {destination.stat().st_size/1024:7.0f}K')
            continue
        source = best_source(reference)
        size, quality, written = export(source, destination)
        total += written
        print(f'{title:34} {f"{size[0]}x{size[1]}":13} {quality:>3} {written/1024:7.0f}K  {source.name}')
    # The email renderer looks a work up here rather than re-deriving the
    # slug. Two slug functions in two languages drift, and the failure would
    # be a broken image in a buyer's inbox.
    manifest = {title: f'{slugify(title)}.jpg' for title in sorted(works_from_certificates())}
    missing = [t for t, f in manifest.items() if not (OUT_DIR / f).exists()]
    if missing:
        raise SystemExit('no export for: ' + ', '.join(missing))
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')

    print(f'\n{len(list(OUT_DIR.glob("*.jpg")))} files, {total/1024/1024:.1f}MB total in '
          f'{OUT_DIR.relative_to(REPO_ROOT)}')
    print(f'manifest: {MANIFEST.relative_to(REPO_ROOT)} ({len(manifest)} works)')


if __name__ == '__main__':
    main()
