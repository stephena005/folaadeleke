#!/usr/bin/env python3
"""Annotate deco-map renders (front/back orthographic) with numbered callouts.

    python3 scripts/relief/deco_map.py raw/ parts.json out/ --res 1400x1960 \
        --dims 280,123,112 --deco-colour "#D9AE62" --colour-name "C04 BLACK / GOLD"

raw/ holds raw-front.png and raw-back.png from render_figure.py (body in a
light neutral, deco painted). parts.json lists the painted parts:
  [{"no": 1, "name": "Earrings (pair)", "area_mm2": 642, "note": "...",
    "front": [[x, z], ...], "back": [[x, z], ...]}, ...]
with anchors in figure mm (x across, z up). Writes deco-front.png,
deco-back.png and deco.json for factory_pack.py --deco-map.
"""
import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFont


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("raw")
    p.add_argument("parts")
    p.add_argument("out")
    p.add_argument("--res", default="1400x1960", help="render resolution used for raw/")
    p.add_argument("--dims", default="280,123,112", help="H,W,D of the figure, mm")
    p.add_argument("--deco-colour", default="#D9AE62")
    p.add_argument("--colour-name", default="")
    p.add_argument("--total-area", type=float, default=0, help="union area, mm2 (parts can touch)")
    return p.parse_args()


def camera(w, h, H, W, D):
    """Same framing as render_figure.py's orthographic camera."""
    aspect = w / h
    frame_w, frame_h = max(W, D) * 1.9 + 80, H * 1.24
    ortho = max(frame_w / aspect, frame_h) if aspect < 1 else max(frame_w, frame_h * aspect)
    ppm = w / (ortho * aspect) if aspect < 1 else w / ortho
    return ppm, H * 0.45


def annotate(src, out, anchors, w, h, ppm, cam_z, mirror, colour):
    im = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    im = bg.convert("RGB")
    dr = ImageDraw.Draw(im)
    r = int(w * 0.022)
    font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(r * 1.15))
    ink = (31, 46, 42)
    bbox = Image.open(src).getchannel("A").point(lambda v: 255 if v > 200 else 0).getbbox()
    used = []
    for no, x, z in anchors:
        px = w / 2 + (-x if mirror else x) * ppm
        py = h / 2 - (z - cam_z) * ppm
        # Labels sit in the margin on whichever side of the figure is nearer.
        left = px < (bbox[0] + bbox[2]) / 2
        lx = bbox[0] - r * 3 if left else bbox[2] + r * 3
        ly = py
        while any(abs(ly - u) < r * 2.4 and (lx < w / 2) == (ux < w / 2) for ux, u in used):
            ly += r * 2.5
        used.append((lx, ly))
        dr.line([(px, py), (lx + (r if left else -r), ly)], fill=ink, width=max(2, r // 7))
        dr.ellipse([px - r * 0.28, py - r * 0.28, px + r * 0.28, py + r * 0.28], fill=ink)
        dr.ellipse([lx - r, ly - r, lx + r, ly + r], fill=colour, outline=ink, width=max(2, r // 8))
        dr.text((lx, ly), str(no), font=font, fill=ink, anchor="mm")
    # Crop to the figure plus the callout margin.
    pad = r * 5
    im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
    im.save(out, optimize=True)


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)
    w, h = (int(v) for v in a.res.split("x"))
    H, W, D = (float(v) for v in a.dims.split(","))
    ppm, cam_z = camera(w, h, H, W, D)
    parts = json.load(open(a.parts))
    colour = tuple(int(a.deco_colour.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    for view, mirror in (("front", False), ("back", True)):
        anchors = [(p["no"], x, z) for p in parts for x, z in p.get(view, [])]
        annotate(os.path.join(a.raw, f"raw-{view}.png"), os.path.join(a.out, f"deco-{view}.png"),
                 anchors, w, h, ppm, cam_z, mirror, colour)
    info = {"colour_name": a.colour_name, "deco_colour": a.deco_colour, "total_area_mm2": a.total_area or None,
            "parts": [{k: p[k] for k in ("no", "name", "area_mm2", "note")} for p in parts]}
    json.dump(info, open(os.path.join(a.out, "deco.json"), "w"), indent=1)
    print("deco map", os.path.join(a.out, "deco-front.png"), os.path.join(a.out, "deco-back.png"))


if __name__ == "__main__":
    main()
