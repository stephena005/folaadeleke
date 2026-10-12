#!/usr/bin/env python3
"""Pencil-drawing box artwork from a figure render (transparent PNG).

    python3 scripts/relief/box_label.py raw-front.png out/ --ink "#8A9E8A" \
        --logo favicon.svg --name "FOLA ADELEKE" --title "MOTHER & CHILD" --sub "C02 · SAGE"

Turns the render into a graphite-style sketch (colour-dodge line extraction,
silhouette contour, paper grain) and prints it in --ink on a transparent
ground, so it can be laid on any box colour. Writes front.png (1:2 portrait)
and side.png (vertical wordmark) as RGBA.
"""
import argparse
import io
import os

import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

MONO = "/usr/share/fonts/opentype/urw-base35/NimbusMonoPS-Regular.otf"


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("render")
    p.add_argument("out")
    p.add_argument("--ink", default="#8A9E8A", help="pencil colour")
    p.add_argument("--text-ink", default="#111111")
    p.add_argument("--logo", default="")
    p.add_argument("--name", default="FOLA ADELEKE")
    p.add_argument("--title", default="MOTHER & CHILD")
    p.add_argument("--sub", default="")
    p.add_argument("--small", default="")
    p.add_argument("--seed", type=int, default=7)
    return p.parse_args()


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def blur(a, r):
    return ndi.gaussian_filter(a.astype(float), r)


def pencil(render, rng):
    """Return a 0..1 'graphite density' map from an RGBA render."""
    im = Image.open(render).convert("RGBA")
    # Keep only the figure: drop the faint shadow-catcher alpha around it.
    solid = im.getchannel("A").point(lambda v: 255 if v > 160 else 0)
    im.putalpha(solid)
    im = im.crop(solid.getbbox())
    alpha = ndi.gaussian_filter(np.asarray(im.getchannel("A"), float) / 255, 0.7)
    lum = np.asarray(Image.alpha_composite(Image.new("RGBA", im.size, "white"), im).convert("L"), float) / 255
    # Stretch the narrow tonal range of a single-colour figure.
    inside = lum[alpha > 0.5]
    lo, hi = np.percentile(inside, 2), np.percentile(inside, 98)
    L = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1) * alpha + (1 - alpha)

    # XDoG lines: creases and edges become soft dark strokes.
    g1, g2 = blur(L, 1.2), blur(L, 3.0)
    D = g1 - 0.985 * g2
    # Flat areas (D ~ 0) map to ~0 so the paper stays white inside the figure.
    lines = np.clip(1 - (1 + np.tanh(150 * (D + 0.01))) / 2, 0, 1)
    lines = np.clip(lines * 1.4, 0, 1)

    # Contour from the silhouette, two passes for a slightly doubled hand line.
    # Pad before edge-finding so the crop border doesn't become a line.
    a = ImageOps.expand(Image.fromarray((alpha * 255).astype(np.uint8)), border=8, fill=0)
    edge = np.asarray(a.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(5)), float)[8:-8, 8:-8] / 255
    edge2 = ndi.shift(edge, (2, -1), order=0, mode="constant", cval=0) * 0.5

    # Diagonal hatching in the shadows, broken up by noise.
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w]
    period = 11.0
    stripes = (np.sin((xx + yy) * 2 * np.pi / period) > 0.55).astype(float)
    shade = np.clip((0.62 - blur(L, 4)) * 2.4, 0, 1) * alpha
    jitter = blur(rng.random((h, w)), 2.0)
    hatch = stripes * shade * (jitter > 0.47)

    g = np.maximum.reduce([lines * alpha, edge * 0.95, edge2, hatch * 0.75])
    grain = blur(rng.random((h, w)), 0.8)
    g = g * (0.55 + 0.6 * grain)
    return np.clip(g, 0, 1)


def tint(density, rgb):
    h, w = density.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = rgb
    out[..., 3] = (density * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def spaced(draw, text, font, cx, y, track, fill):
    ws = [draw.textlength(c, font=font) for c in text]
    x = cx - (sum(ws) + track * font.size * (len(text) - 1)) / 2
    for c, w in zip(text, ws):
        draw.text((x, y), c, font=font, fill=fill)
        x += w + track * font.size


def logo_img(svg, width, colour):
    import cairosvg

    data = open(svg).read().replace("currentColor", colour)
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=data.encode(), output_width=width))).convert("RGBA")


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = np.random.default_rng(a.seed)
    ink, text_ink = hex_rgb(a.ink), hex_rgb(a.text_ink)

    W, H = 1200, 2400
    front = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sketch = tint(pencil(a.render, rng), ink)
    s = min(W * 0.78 / sketch.width, H * 0.66 / sketch.height)
    sketch = sketch.resize((int(sketch.width * s), int(sketch.height * s)), Image.LANCZOS)
    front.alpha_composite(sketch, ((W - sketch.width) // 2, 150))

    d = ImageDraw.Draw(front)
    y = 150 + sketch.height + 110
    spaced(d, a.name, ImageFont.truetype(MONO, 70), W / 2, y, 0.26, text_ink)
    d.line([(W / 2 - 80, y + 120), (W / 2 + 80, y + 120)], fill=text_ink, width=3)
    spaced(d, a.title, ImageFont.truetype(MONO, 44), W / 2, y + 160, 0.30, text_ink)
    if a.logo:
        lg = logo_img(a.logo, 120, a.text_ink)
        front.alpha_composite(lg, ((W - lg.width) // 2, H - 250))
    if a.sub:
        spaced(d, a.sub, ImageFont.truetype(MONO, 30), W / 2, H - 100, 0.30, text_ink)
    front.save(os.path.join(a.out, "front.png"))

    # Side: wordmark running bottom to top, as on a spine.
    side = Image.new("RGBA", (H, int(W * 0.9)), (0, 0, 0, 0))
    ds = ImageDraw.Draw(side)
    spaced(ds, f"{a.name}   ·   {a.title}", ImageFont.truetype(MONO, 64), side.width / 2,
           side.height / 2 - 40, 0.26, text_ink)
    if a.small:
        spaced(ds, a.small, ImageFont.truetype(MONO, 30), side.width / 2, side.height / 2 + 70, 0.2, text_ink)
    side.rotate(90, expand=True).save(os.path.join(a.out, "side.png"))
    print("labels", os.path.join(a.out, "front.png"), os.path.join(a.out, "side.png"))


if __name__ == "__main__":
    main()
