#!/usr/bin/env python3
"""Read the verify token out of each certificate's printed QR code.

    python3 scripts/decode-certificate-qr.py

A certificate's QR is the authority on its verify URL: the certificates are
already printed and posted, so the page has to be built at the token the QR
encodes. Guessing or minting a new token would leave a printed certificate
pointing at a 404 forever.

The QR is stored in the certificate HTML as an SVG path, one <path> segment
per dark module. This renders those modules to a bitmap and decodes it with
zbarimg (brew install zbar), then writes the map to

    back-office/certificates/verify-tokens.json

That file pairs a buyer-named filename with their token, which is exactly the
correlation the verify pages were anonymised to remove — so it is written
under back-office/, which is gitignored, and must stay there.
"""

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CERT_DIRS = ['back-office/certificates/format-1-split-panel-html', 'back-office/certificates/html']
OUT_PATH = REPO_ROOT / 'back-office/certificates/verify-tokens.json'
MODULE_PX = 10


def fail(message):
    print(f'decode-certificate-qr: {message}', file=sys.stderr)
    raise SystemExit(1)


def qr_modules(html):
    """Dark-module coordinates from the certificate's QR path, or None."""
    match = re.search(r'<path d="(M2,2H3V3H2z[^"]+)"', html)
    if not match:
        return None
    return [(int(x), int(y)) for x, y in re.findall(r'M(\d+),(\d+)H', match.group(1))]


def decode(modules, workdir, name):
    from PIL import Image
    size = 37 * MODULE_PX
    image = Image.new('L', (size, size), 255)
    pixels = image.load()
    for x, y in modules:
        for dx in range(MODULE_PX):
            for dy in range(MODULE_PX):
                pixels[x * MODULE_PX + dx, y * MODULE_PX + dy] = 0
    path = workdir / f'{name}.png'
    image.save(path)
    result = subprocess.run(['zbarimg', '--quiet', '--raw', str(path)],
                            capture_output=True, text=True)
    return result.stdout.strip() or None


def main():
    if shutil.which('zbarimg') is None:
        fail('zbarimg not found — install it with: brew install zbar')
    try:
        import PIL  # noqa: F401
    except ImportError:
        fail('Pillow not found — install it with: pip3 install Pillow')

    tokens, failures = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        for directory in CERT_DIRS:
            for cert in sorted((REPO_ROOT / directory).glob('*.html')):
                if 'example' in cert.name:
                    continue
                modules = qr_modules(cert.read_text(errors='replace'))
                if not modules:
                    failures.append((cert.name, 'no QR code in the file'))
                    continue
                url = decode(modules, workdir, cert.stem)
                if not url:
                    failures.append((cert.name, 'QR did not decode'))
                    continue
                match = re.fullmatch(r'https://folaadeleke\.com/verify/([0-9a-f]{12})/?', url)
                if not match:
                    failures.append((cert.name, f'QR encodes an unexpected URL: {url}'))
                    continue
                tokens[cert.name] = match.group(1)

    clashes = {}
    for name, token in tokens.items():
        clashes.setdefault(token, []).append(name)
    for token, names in sorted(clashes.items()):
        if len(names) > 1:
            print(f'  warning: {token} is shared by {", ".join(names)}')

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(tokens, indent=2, sort_keys=True) + '\n')
    print(f'decode-certificate-qr: {len(tokens)} tokens -> {OUT_PATH.relative_to(REPO_ROOT)}')
    for name, why in failures:
        print(f'  could not read {name}: {why}')
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
