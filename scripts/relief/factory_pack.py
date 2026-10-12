#!/usr/bin/env python3
"""Assemble a factory reference pack PDF from render_figure.py output.

    python3 scripts/relief/factory_pack.py out/ pack.pdf \
        --title "MOTHER & CHILD" --colour-name "C02 SAGE GREEN" --colour "#8A9E8A" \
        --target 280x127x76 --spec-ref "Soft Vinyl PVC Manufacturing Spec Rev 02" \
        --source "Meshy 7 Ultra image-to-3D from the C02 front concept render"

Pages: cover (3/4 hero, measured envelope vs target), one page per
orthographic view, then mesh data (file hash, triangles, volume, datum) and
limitations. figure.stl is embedded as a PDF attachment unless --no-attach.
"""
import argparse
import hashlib
import io
import json
import os
from datetime import date

import trimesh
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Sans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))

INK = HexColor("#1F2E2A")
BRAND = HexColor("#2F5446")
MUTED = HexColor("#5E6B66")
TILE = HexColor("#EDF1EE")
WARN_BG = HexColor("#FBEEE2")
WARN = HexColor("#9A5A35")
PAGE_W, PAGE_H = A4
M = 42  # page margin, pt

VIEWS = [("front", "Front elevation"), ("side", "Side elevation (left)"), ("back", "Back elevation"),
         ("underside", "Underside"), ("mark", "Base mark (underside, left sandal)")]


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("renders")
    p.add_argument("pdf")
    p.add_argument("--title", default="")
    p.add_argument("--colour-name", default="")
    p.add_argument("--colour", default="#8A9E8A")
    p.add_argument("--target", default="", help="HxWxD target envelope in mm, e.g. 280x127x76")
    p.add_argument("--spec-ref", default="")
    p.add_argument("--source", default="", help="how the mesh was produced")
    p.add_argument("--mark", default="", help="base mark description for the mesh data page")
    p.add_argument("--wall", type=float, default=3.0, help="nominal wall for the hollow estimate, mm")
    p.add_argument("--density", type=float, default=1.25, help="material density for estimates, g/cm3")
    p.add_argument("--no-attach", action="store_true")
    p.add_argument("--jpeg-quality", type=int, default=92, help="render image quality inside the PDF")
    return p.parse_args()


def mesh_stats(path):
    m = trimesh.load(path)
    with open(path, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    return {
        "file": os.path.basename(path),
        "bytes": os.path.getsize(path),
        "sha256": sha,
        "triangles": len(m.faces),
        "watertight": bool(m.is_watertight),
        "bodies": len(m.split(only_watertight=False)),
        "extents": [float(x) for x in m.extents],  # X=W, Y=D, Z=H
        "volume_cm3": abs(m.volume) / 1000 if m.is_watertight else None,
        "area_cm2": m.area / 100,
    }


def header(c, section, page_no, total, a):
    c.setFillColor(BRAND)
    c.rect(0, PAGE_H - 10, PAGE_W, 10, stroke=0, fill=1)
    c.setFillColor(BRAND)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M, PAGE_H - 40, section.upper())
    footer = "  |  ".join(x for x in (a.title, a.colour_name, "FACTORY REFERENCE PACK", date.today().strftime("%d %b %Y").upper()) if x)
    c.setStrokeColor(HexColor("#C9D1CD"))
    c.line(M, 46, PAGE_W - M, 46)
    c.setFillColor(MUTED)
    c.setFont("Sans-Bold", 7)
    c.drawString(M, 32, footer)
    c.drawRightString(PAGE_W - M, 32, f"{page_no} / {total}")


def banner(c, y, h, title, body, bg=WARN_BG, fg=WARN):
    c.setFillColor(bg)
    c.roundRect(M, y, PAGE_W - 2 * M, h, 6, stroke=0, fill=1)
    c.setFillColor(fg)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M + 14, y + h - 20, title.upper())
    c.setFillColor(INK)
    c.setFont("Sans", 8.5)
    ty = y + h - 35
    for line in wrap(body, "Sans", 8.5, PAGE_W - 2 * M - 28):
        c.drawString(M + 14, ty, line)
        ty -= 12


def wrap(text, font, size, width):
    lines = []
    for para in text.split("\n"):
        line = ""
        for word in para.split():
            trial = f"{line} {word}".strip()
            if pdfmetrics.stringWidth(trial, font, size) > width and line:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return lines


JPEG_QUALITY = 92


def fit_image(c, path, x, y, w, h):
    from PIL import Image

    im = Image.open(path)
    if im.mode in ("RGBA", "LA"):  # raw renders have a transparent background
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    # JPEG passes straight through ReportLab and keeps the pack small.
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=JPEG_QUALITY, subsampling=0)
    buf.seek(0)
    img = ImageReader(buf)
    iw, ih = img.getSize()
    s = min(w / iw, h / ih)
    dw, dh = iw * s, ih * s
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)


def cover(c, a, stats, target, renders):
    c.setFillColor(BRAND)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M, PAGE_H - 60, "FACTORY REFERENCE PACK  /  RFQ & PRE-PRODUCTION")
    c.setFillColor(INK)
    c.setFont("Sans-Bold", 26)
    c.drawString(M, PAGE_H - 92, a.title or "Figure")
    c.setFillColor(MUTED)
    c.setFont("Sans", 9)
    sub = "  |  ".join(x for x in (a.colour_name, "Renders + 3D reference mesh", a.spec_ref and f"Read with: {a.spec_ref}") if x)
    c.drawString(M, PAGE_H - 110, sub)

    img_top, img_bottom = PAGE_H - 126, 300
    c.setFillColor(HexColor("#FFFFFF"))
    c.roundRect(M, img_bottom, PAGE_W - 2 * M, img_top - img_bottom, 8, stroke=0, fill=1)
    fit_image(c, os.path.join(renders, "raw-hero.png") if os.path.exists(os.path.join(renders, "raw-hero.png"))
              else os.path.join(renders, "render-hero.png"), M + 8, img_bottom + 8, PAGE_W - 2 * M - 16, img_top - img_bottom - 16)

    c.setFillColor(BRAND)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M, 280, "MEASURED ENVELOPE (REFERENCE MESH)  vs  SPEC TARGET")
    W, D, H = stats["extents"]
    tiles = [("HEIGHT", H, target[0]), ("WIDTH", W, target[1]), ("DEPTH", D, target[2])]
    tw = (PAGE_W - 2 * M - 2 * 12) / 3
    for i, (label, val, tgt) in enumerate(tiles):
        x = M + i * (tw + 12)
        c.setFillColor(TILE)
        c.roundRect(x, 176, tw, 92, 7, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont("Sans-Bold", 8)
        c.drawString(x + 14, 248, label)
        c.setFont("Sans-Bold", 22)
        c.drawString(x + 14, 220, f"{val:.0f} mm")
        if tgt:
            delta = val - tgt
            over = delta > 3  # spec's proposed tolerance is +/- 3 mm
            c.setFillColor(WARN if over else MUTED)
            c.setFont("Sans-Bold" if over else "Sans", 8)
            note = "set by scaling" if label == "HEIGHT" else (f"+{delta:.0f} mm over target" if over else "within +/- 3 mm" if abs(delta) <= 3 else f"{delta:.0f} mm under target")
            c.drawString(x + 14, 200, f"Target {tgt:.0f} mm")
            c.drawString(x + 14, 188, note)
    banner(c, 66, 98, "Reference only - not a tooling master",
           "This mesh is an AI reconstruction from a single front concept render. Back and side geometry is inferred, "
           "fine details (eyes, beads, earrings, sling folds) are approximate, and it has not been sculpted or DFM-reviewed. "
           "Use it to quote, plan part breakdown and assess depth. Do not cut moulds from it. Gate G1 still requires the "
           "native sculpt and production mesh.")


def view_page(c, path, caption):
    c.setFillColor(INK)
    c.setFont("Sans-Bold", 16)
    c.drawString(M, PAGE_H - 66, caption)
    fit_image(c, path, M, 60, PAGE_W - 2 * M, PAGE_H - 140)


def data_page(c, a, stats, target, attached):
    c.setFillColor(INK)
    c.setFont("Sans-Bold", 16)
    c.drawString(M, PAGE_H - 66, "3D reference mesh")
    W, D, H = stats["extents"]
    vol = stats["volume_cm3"]
    shell = stats["area_cm2"] * a.wall / 10  # cm2 x mm -> cm3
    rows = [
        ("File", stats["file"] + ("  (attached to this PDF)" if attached else "  (supplied alongside this PDF)")),
        ("SHA-256", stats["sha256"]),
        ("Size", f"{stats['bytes'] / 1e6:.1f} MB, binary STL"),
        ("Units", "millimetres (1 unit = 1 mm)"),
        ("Datum", "Z up; underside of sandals at Z = 0; figure faces -Y; centred on X/Y"),
        ("Envelope (H x W x D)", f"{H:.1f} x {W:.1f} x {D:.1f} mm"),
        ("Triangles", f"{stats['triangles']:,}"),
        ("Integrity", f"{'Watertight' if stats['watertight'] else 'NOT watertight'}, {stats['bodies']} body"
                      f"{'' if stats['bodies'] == 1 else 'ies'}"),
        ("Solid volume", f"{vol:,.0f} cm3" if vol else "n/a (open mesh)"),
        ("Surface area", f"{stats['area_cm2']:,.0f} cm2"),
        ("Est. hollow shell", f"~{shell:,.0f} cm3 / ~{shell * a.density:,.0f} g at {a.wall:g} mm wall, "
                              f"{a.density:g} g/cm3 (rough estimate; factory to confirm)"),
        ("Source", a.source or "-"),
    ] + ([("Base mark", a.mark)] if a.mark else []) + [
    ]
    y = PAGE_H - 100
    for k, v in rows:
        c.setFillColor(MUTED)
        c.setFont("Sans-Bold", 8)
        c.drawString(M, y, k.upper())
        c.setFillColor(INK)
        c.setFont("Sans", 9)
        for i, line in enumerate(wrap(v, "Sans", 9, PAGE_W - 2 * M - 140)):
            c.drawString(M + 140, y - i * 12, line)
        y -= 12 * max(1, len(wrap(v, "Sans", 9, PAGE_W - 2 * M - 140))) + 10
        c.setStrokeColor(HexColor("#E2E7E4"))
        c.line(M, y + 4, PAGE_W - M, y + 4)

    y -= 14
    c.setFillColor(BRAND)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M, y, "FACTORY RESPONSE REQUESTED")
    y -= 18
    asks = [
        f"Depth: the reference mesh measures {D:.0f} mm against a {target[2]:.0f} mm target, driven by the rear infant/bear and "
        "sling. Show the minimum viable depth that protects the silhouette, with a 3D side view.",
        "Part breakdown and parting lines for slush/rotocast PVC; hidden joints under the turban, wrap folds or sandals.",
        "Wall/thickness map, shrink allowance and weight estimate against the shell estimate above.",
        "DFM comments on undercuts, earring openings, beads and deep drapery folds before any sculpt refinement.",
    ]
    c.setFont("Sans", 9)
    for ask in asks:
        lines = wrap(ask, "Sans", 9, PAGE_W - 2 * M - 16)
        c.setFillColor(BRAND)
        c.circle(M + 3, y + 3, 2, stroke=0, fill=1)
        c.setFillColor(INK)
        for i, line in enumerate(lines):
            c.drawString(M + 14, y - i * 12, line)
        y -= 12 * len(lines) + 8

    banner(c, 66, 84, "How to read the renders",
           "Front, side and back pages are orthographic at true proportion; dimension lines are measured from the mesh. "
           "The cover image is perspective and not to scale. Colour on screen is not a colour standard: match the signed "
           f"physical {a.colour_name or 'colour'} swatch, not these images.", bg=TILE, fg=BRAND)


def main():
    global JPEG_QUALITY
    a = parse_args()
    JPEG_QUALITY = a.jpeg_quality
    stl = os.path.join(a.renders, "figure.stl")
    stats = mesh_stats(stl)
    target = [float(x) for x in a.target.split("x")] if a.target else [0, 0, 0]
    pages = [("cover", None)] + [(slug, cap) for slug, cap in VIEWS
                                 if os.path.exists(os.path.join(a.renders, f"render-{slug}.png"))] + [("data", None)]
    attach = not a.no_attach

    tmp = a.pdf + ".tmp"
    c = canvas.Canvas(tmp, pagesize=A4)
    c.setTitle(f"{a.title} - Factory Reference Pack".strip(" -"))
    c.setAuthor("Fola Adeleke")
    for i, (slug, cap) in enumerate(pages, 1):
        section = {"cover": "Overview", "data": "Mesh data & factory response",
                   "underside": "Underside & base mark", "mark": "Underside & base mark"}.get(slug, "Orthographic views")
        header(c, section, i, len(pages), a)
        if slug == "cover":
            cover(c, a, stats, target, a.renders)
        elif slug == "data":
            data_page(c, a, stats, target, attach)
        else:
            view_page(c, os.path.join(a.renders, f"render-{slug}.png"), cap)
        c.showPage()
    c.save()

    w = PdfWriter(clone_from=PdfReader(tmp))
    if attach:
        with open(stl, "rb") as f:
            w.add_attachment(stats["file"], f.read())
        # pypdf stores attachments raw; deflate the STL (binary STLs shrink ~3x).
        names = w._root_object["/Names"]["/EmbeddedFiles"]["/Names"]
        for spec in names[1::2]:
            ef = spec.get_object()["/EF"]
            for key in ("/F", "/UF"):
                if key in ef:
                    ef[NameObject(key)] = w._add_object(ef[key].get_object().flate_encode(level=9))
    w.compress_identical_objects()
    for page in w.pages:
        page.compress_content_streams()
    with open(a.pdf, "wb") as f:
        w.write(f)
    os.remove(tmp)
    print(json.dumps({**stats, "pdf": a.pdf, "pages": len(pages), "pdf_bytes": os.path.getsize(a.pdf)}, indent=2))


if __name__ == "__main__":
    main()
