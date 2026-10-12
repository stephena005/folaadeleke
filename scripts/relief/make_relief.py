#!/usr/bin/env python3
"""Turn a collectible render on a plain light background into a printable
bas-relief plaque (2.5D heightmap -> watertight STL/3MF), dimensioned in mm.

    pip install numpy scipy pillow scikit-image trimesh manifold3d fast_simplification lxml networkx
    python3 scripts/relief/make_relief.py render.png scripts/relief/out/ --figure-height 120 --title "TITLE" --subtitle "FOLA ADELEKE"
    python3 scripts/relief/make_relief.py render.png scripts/relief/out/ --only 2 --figure-height 160

The relief is built from three layers inside each figure's silhouette:
  1. edge   - a rounded "pillow" lip so the silhouette reads crisply
  2. body   - a broad bulge from the distance to the silhouette edge
  3. detail - band-passed shading from the render (folds, beads, faces)
It is an interpretation of the render, not a measured copy of the sculpt;
expect to touch up faces and jewellery in ZBrush/Blender before tooling.

Outputs: relief.stl, relief.3mf, heightmap.png (16-bit, for CNC/ZBrush
displacement), preview.png (shaded) and spec.json (all dimensions).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from skimage import morphology


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("image")
    p.add_argument("out")
    p.add_argument("--figure-height", type=float, default=120.0, help="mm, sandal to top of headwrap")
    p.add_argument("--px", type=float, default=0.2, help="grid pitch in mm")
    p.add_argument("--base", type=float, default=5.0, help="backing plate thickness, mm")
    p.add_argument("--relief", type=float, default=6.0, help="max relief above plate, mm")
    p.add_argument("--margin", type=float, default=12.0, help="plate margin around figures, mm")
    p.add_argument("--rim", type=float, default=4.0, help="frame width, mm (0 = none)")
    p.add_argument("--rim-height", type=float, default=3.0, help="frame height above plate, mm")
    p.add_argument("--title", default="", help="engraved under the figures")
    p.add_argument("--subtitle", default="")
    p.add_argument("--engrave", type=float, default=0.8, help="text depth, mm")
    p.add_argument("--only", type=int, default=0, help="keep only the Nth figure from the left (1-based)")
    p.add_argument("--bg-dist", type=float, default=0.15, help="RGB distance from background that counts as figure")
    p.add_argument("--faces", type=int, default=800_000, help="target triangle count after decimation")
    return p.parse_args()


def figure_mask(rgb, thresh, px_mm):
    # Background colour from the image border; figure = anything far enough
    # from it. Soft cast shadows sit well under the default threshold.
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    dist = np.linalg.norm(rgb - np.median(border, 0), axis=2)
    m = morphology.closing(dist > thresh, morphology.disk(2))
    m = morphology.remove_small_objects(m, max_size=max(64, int(20 / px_mm**2)))
    # Fill pinholes only; genuine gaps (under an arm, between feet) stay open.
    return morphology.remove_small_holes(m, max_size=int(4 / px_mm**2))


def masked_blur(a, m, sigma):
    return ndi.gaussian_filter(a * m, sigma) / np.maximum(ndi.gaussian_filter(m.astype(float), sigma), 1e-6)


def relief_height(rgb, mask, px_mm, relief_max):
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    labels, n = ndi.label(mask)
    dist = ndi.distance_transform_edt(mask) * px_mm
    h = np.zeros(mask.shape)
    for i in range(1, n + 1):
        c = labels == i
        d = dist * c
        # Normalise shading per figure so each colourway yields the same relief.
        l = (lum - lum[c].mean()) / (lum[c].std() + 1e-6)
        edge_r = 2.0
        edge = edge_r * np.sqrt(1 - (1 - np.minimum(d, edge_r) / edge_r) ** 2)
        body = 0.45 * relief_max * (d / d.max()) ** 0.6
        detail = masked_blur(l, c, 0.25 / px_mm) - masked_blur(l, c, 4.0 / px_mm)
        detail = np.clip(0.9 * detail, -1.6, 1.6)
        h += c * (0.6 + edge + body + detail)
    h = np.clip(h, 0, None) * mask
    h *= relief_max / h.max()
    return ndi.gaussian_filter(h, 0.5)


def text_layer(shape, px_mm, lines, top_mm, aa=4):
    """Antialiased coverage (0..1) of centred text lines; (text, cap_mm) pairs."""
    H, W = shape
    img = Image.new("L", (W * aa, H * aa), 0)
    draw = ImageDraw.Draw(img)
    y = top_mm
    for text, cap_mm in lines:
        if not text:
            continue
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", int(cap_mm / 0.72 / px_mm * aa))
        x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font)
        draw.text(((W * aa - (x1 - x0)) / 2 - x0, y / px_mm * aa - y0), text, fill=255, font=font)
        y += cap_mm * 1.9
    return np.asarray(img.resize((W, H), Image.LANCZOS), float) / 255


def heightmap_mesh(z, px_mm):
    """Closed mesh: z-grid top, flat bottom at 0, vertical side walls."""
    import trimesh

    H, W = z.shape
    ys, xs = np.mgrid[0:H, 0:W]
    # Image row 0 is the top of the plaque, so flip y to keep the figures upright.
    top = np.column_stack([xs.ravel() * px_mm, (H - 1 - ys.ravel()) * px_mm, z.ravel()])
    bot = top.copy()
    bot[:, 2] = 0
    verts = np.vstack([top, bot])
    idx = np.arange(H * W).reshape(H, W)
    a, b, c, d = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel()
    off = H * W
    faces = [np.column_stack([a, c, b]), np.column_stack([b, c, d]),
             np.column_stack([a + off, b + off, c + off]), np.column_stack([b + off, d + off, c + off])]
    ring = np.concatenate([idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]])
    r0, r1 = ring, np.roll(ring, -1)
    faces += [np.column_stack([r0, r1, r0 + off]), np.column_stack([r1, r1 + off, r0 + off])]
    mesh = trimesh.Trimesh(verts, np.vstack(faces), process=True)
    if mesh.volume < 0:
        mesh.invert()
    return mesh


def decimate(mesh, target):
    import fast_simplification
    import trimesh

    if len(mesh.faces) <= target:
        return mesh
    v, f = fast_simplification.simplify(mesh.vertices, mesh.faces, 1 - target / len(mesh.faces))
    return trimesh.Trimesh(v, f, process=True)


def shaded_preview(z, px_mm):
    gy, gx = np.gradient(z, px_mm)
    n = np.dstack([-gx, gy, np.ones_like(z)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    light = np.array([-0.5, 0.6, 0.62])
    shade = np.clip(n @ (light / np.linalg.norm(light)), 0, 1)
    tone = 0.25 + 0.75 * shade
    col = np.array([0.93, 0.9, 0.86])
    return Image.fromarray((np.dstack([tone] * 3) * col * 255).astype(np.uint8))


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)
    src = Image.open(a.image).convert("RGB")
    rgb0 = np.asarray(src, float) / 255

    mask0 = figure_mask(rgb0, a.bg_dist, 1.0)
    labels, n = ndi.label(mask0)
    objs = sorted(ndi.find_objects(labels), key=lambda s: s[1].start)
    if a.only:
        keep = objs[a.only - 1]
        lab = labels[keep][labels[keep] > 0]
        mask0 = labels == np.bincount(lab).argmax()
        objs = [keep]
    rows = np.nonzero(mask0.any(1))[0]
    cols = np.nonzero(mask0.any(0))[0]
    fig_px = max(o[0].stop - o[0].start for o in objs)

    # Scale so the tallest figure is exactly --figure-height on the plate.
    s = a.figure_height / fig_px / a.px
    crop = (cols[0], rows[0], cols[-1] + 1, rows[-1] + 1)
    fw, fh = round((crop[2] - crop[0]) * s), round((crop[3] - crop[1]) * s)
    fig_rgb = np.asarray(src.crop(crop).resize((fw, fh), Image.LANCZOS), float) / 255
    fig_mask = np.asarray(Image.fromarray(mask0[crop[1]:crop[3], crop[0]:crop[2]]).resize((fw, fh), Image.NEAREST))

    m = round(a.margin / a.px)
    text_band = (a.margin + 14) if (a.title or a.subtitle) else 0
    W = fw + 2 * m
    H = fh + m + round((a.margin + text_band) / a.px)
    rgb = np.ones((H, W, 3)) * np.median(rgb0[0], 0)
    mask = np.zeros((H, W), bool)
    rgb[m:m + fh, m:m + fw] = fig_rgb
    mask[m:m + fh, m:m + fw] = fig_mask
    mask = ndi.binary_opening(mask, iterations=1)

    z = a.base + relief_height(rgb, mask, a.px, a.relief)
    if a.rim > 0:
        r = round(a.rim / a.px)
        frame = np.ones((H, W), bool)
        frame[r:-r, r:-r] = False
        z = np.where(frame, a.base + a.rim_height, z)
    if text_band:
        top_mm = (m + fh) * a.px + a.margin * 0.6
        cover = text_layer((H, W), a.px, [(a.title, 6.0), (a.subtitle, 3.5)], top_mm)
        z -= a.engrave * cover * ~mask

    mesh = decimate(heightmap_mesh(z.astype(np.float32), a.px), a.faces)
    mesh.export(os.path.join(a.out, "relief.stl"))
    mesh.export(os.path.join(a.out, "relief.3mf"))
    Image.fromarray(np.round(z / z.max() * 65535).astype(np.uint16)).save(os.path.join(a.out, "heightmap.png"))
    shaded_preview(z, a.px).save(os.path.join(a.out, "preview.png"))

    ext = mesh.extents
    spec = {
        "units": "mm",
        "plate_width": round(float(ext[0]), 2),
        "plate_height": round(float(ext[1]), 2),
        "overall_thickness": round(float(ext[2]), 2),
        "plate_thickness": a.base,
        "max_relief_above_plate": a.relief,
        "figure_height": a.figure_height,
        "figures": len(objs),
        "frame": {"width": a.rim, "height_above_plate": a.rim_height} if a.rim else None,
        "text": {"lines": [a.title, a.subtitle], "engrave_depth": a.engrave} if text_band else None,
        "grid_pitch": a.px,
        "triangles": int(len(mesh.faces)),
        "watertight": bool(mesh.is_watertight),
        "volume_cm3": round(float(mesh.volume) / 1000, 1),
        "heightmap_png_white_mm": round(float(z.max()), 3),
    }
    with open(os.path.join(a.out, "spec.json"), "w") as f:
        json.dump(spec, f, indent=2)
    print(json.dumps(spec, indent=2))


if __name__ == "__main__":
    main()
