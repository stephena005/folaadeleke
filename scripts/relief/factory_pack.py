#!/usr/bin/env python3
"""Assemble a factory reference pack PDF from render_figure.py output.

    python3 scripts/relief/factory_pack.py out/ pack.pdf \
        --title "MAMA COMFORT" --colour-name "C02 SAGE GREEN" --colour "#8A9E8A" \
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
    p.add_argument("--colourways", default="", help="all colourways as CODE:Name:#hex,... for the colour standard page")
    p.add_argument("--code", default="", help="this pack's colourway code, e.g. C01")
    p.add_argument("--deco-map", default="", help="dir with deco-front.png, deco-back.png and deco.json")
    p.add_argument("--body-finish", default="")
    p.add_argument("--deco-finish", default="")
    p.add_argument("--pantone", default="", help="Pantone / factory reference line on the colour page")
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
    if a.colour:
        tx = M + pdfmetrics.stringWidth(a.title or "Figure", "Sans-Bold", 26) + 16
        swatch(c, tx, PAGE_H - 94, 22 if "+" not in a.colour else 34, 22, a.colour, 4)
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


def srgb_to_lab(hex_colour):
    """sRGB hex -> CIELAB (D65, 2 deg observer)."""
    h = hex_colour.lstrip("#")
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    x = 0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]
    y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.0721750 * lin[2]
    z = 0.0193339 * lin[0] + 0.1191920 * lin[1] + 0.9503041 * lin[2]

    def f(t):
        return t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29

    fx, fy, fz = f(x / 0.95047), f(y / 1.0), f(z / 1.08883)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def parse_colourways(spec):
    out = []
    for item in filter(None, (x.strip() for x in spec.split(","))):
        code, name, hx = item.split(":")
        out.append((code, name, hx))
    return out


def swatch(c, x, y, w, h, hx, r=6):
    """Fill a swatch; a two-tone colourway (#body+#deco) is split 70/30."""
    cols = hx.split("+")
    c.setFillColor(HexColor(cols[0]))
    c.roundRect(x, y, w, h, r, stroke=0, fill=1)
    if len(cols) > 1:
        c.setFillColor(HexColor(cols[1]))
        c.roundRect(x + w * 0.7, y, w * 0.3, h, r, stroke=0, fill=1)
        c.rect(x + w * 0.7, y, min(r, w * 0.3), h, stroke=0, fill=1)


def colour_rows(label, hx):
    r, g, b = (int(hx.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
    L, A, B = srgb_to_lab(hx)
    return [(f"{label}Hex (sRGB)", hx.upper()), (f"{label}RGB", f"{r}, {g}, {b}"),
            (f"{label}CIELAB (D65/2°)", f"L* {L:.1f}   a* {A:.1f}   b* {B:.1f}")]


def colour_page(c, a):
    ways = parse_colourways(a.colourways)
    me = next((w for w in ways if w[0] == a.code), ways[0])
    code, name, hx = me
    cols = hx.split("+")
    c.setFillColor(INK)
    c.setFont("Sans-Bold", 16)
    c.drawString(M, PAGE_H - 66, f"Colour standard  -  {code} {name}")

    # Large swatch; a deco colour takes the right-hand band.
    top = PAGE_H - 96
    sh = 250 if len(cols) == 1 else 210
    swatch(c, M, top - sh, PAGE_W - 2 * M, sh, hx, 8)
    c.setFillColor(HexColor("#FFFFFF"))
    c.setFont("Sans-Bold", 30)
    c.drawString(M + 24, top - 60, cols[0].upper())
    c.setFont("Sans-Bold", 11)
    c.drawString(M + 24, top - 84, f"{code}  {name.upper()}" + ("  -  BODY" if len(cols) > 1 else ""))
    if len(cols) > 1:
        dx = M + (PAGE_W - 2 * M) * 0.7 + 18
        c.setFillColor(HexColor("#1F1F1F"))
        c.setFont("Sans-Bold", 20)
        c.drawString(dx, top - 52, cols[1].upper())
        c.setFont("Sans-Bold", 11)
        c.drawString(dx, top - 72, "DECO")

    if len(cols) == 1:
        rows = [("Colourway", f"{code} {name}")] + colour_rows("", hx) + [
            ("Finish", "Matte, opaque, through-coloured PVC across figure, infant and bear. No paint, gloss or gradients."),
            ("Pantone / factory ref.", "TBC - factory to propose the nearest PVC masterbatch and supply a physical swatch"),
        ]
    else:
        rows = [("Colourway", f"{code} {name}  -  two-tone: body + painted deco")] + colour_rows("Body ", cols[0]) + [
            ("Body finish", a.body_finish or "Matte, opaque, through-coloured PVC across figure, infant and bear."),
        ] + colour_rows("Deco ", cols[1]) + [
            ("Deco finish", a.deco_finish or "Metallic gold paint, satin sheen, on the jewellery only - see the deco map."),
            ("Pantone / factory ref.", a.pantone or "TBC - factory to propose PVC masterbatch (body) and paint ref. (deco) with physical swatches"),
        ]
    y = top - sh - 40
    rh = 11 if len(cols) == 1 else 7
    for k, v in rows:
        c.setFillColor(MUTED)
        c.setFont("Sans-Bold", 8)
        c.drawString(M, y, k.upper())
        c.setFillColor(INK)
        c.setFont("Sans", 9.5)
        lines = wrap(v, "Sans", 9.5, PAGE_W - 2 * M - 150)
        for i, line in enumerate(lines):
            c.drawString(M + 150, y - i * 13, line)
        y -= 13 * max(1, len(lines)) + rh
        c.setStrokeColor(HexColor("#E2E7E4"))
        c.line(M, y + 5, PAGE_W - M, y + 5)

    # All colourways, this one outlined: same tooling, colour is the only change.
    y -= 18
    c.setFillColor(BRAND)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M, y, "ALL COLOURWAYS  -  SAME TOOLING, SAME SIZE")
    y -= 14
    gap = 12
    cw = (PAGE_W - 2 * M - gap * (len(ways) - 1)) / len(ways)
    for i, (wc, wn, wh) in enumerate(ways):
        x = M + i * (cw + gap)
        swatch(c, x, y - 60, cw, 60, wh)
        if wc == code:
            c.setStrokeColor(INK)
            c.setLineWidth(2)
            c.roundRect(x - 3, y - 63, cw + 6, 66, 8, stroke=1, fill=0)
        c.setFillColor(INK)
        c.setFont("Sans-Bold", 8.5)
        c.drawString(x, y - 76, f"{wc}  {wn.upper()}")
        c.setFont("Sans", 8.5 if len(ways) < 4 else 7.5)
        c.drawString(x, y - 89, " + ".join(h.upper() for h in wh.split("+")))

    what = "PVC swatch" if len(cols) == 1 else "PVC swatch and painted deco swatch"
    banner(c, 66, 92, "Screen colour is not a colour standard",
           "The values on this page are the design intent. Production must match the signed physical "
           f"{what} for {code} under neutral D65 lighting, recorded with its sample ID - not this page, a screen or a "
           "guessed Pantone. Report measured CIELAB of the approved swatch back with the golden sample.")


def deco_page(c, a):
    """Deco map: annotated views plus the schedule of painted parts."""
    info = json.load(open(os.path.join(a.deco_map, "deco.json")))
    c.setFillColor(INK)
    c.setFont("Sans-Bold", 16)
    c.drawString(M, PAGE_H - 66, f"Deco / paint map  -  {info.get('colour_name', '')}".rstrip(" -"))
    img_top, img_bottom = PAGE_H - 84, 352
    w = (PAGE_W - 2 * M - 12) / 2
    for i, f in enumerate(("deco-front.png", "deco-back.png")):
        x = M + i * (w + 12)
        c.setFillColor(HexColor("#FFFFFF"))
        c.roundRect(x, img_bottom, w, img_top - img_bottom, 6, stroke=0, fill=1)
        fit_image(c, os.path.join(a.deco_map, f), x + 4, img_bottom + 4, w - 8, img_top - img_bottom - 8)
        c.setFillColor(MUTED)
        c.setFont("Sans-Bold", 7.5)
        c.drawString(x + 8, img_bottom + 8, ("FRONT", "BACK")[i])

    y = img_bottom - 22
    cols = [(M, "NO."), (M + 32, "PART"), (M + 200, "APPROX. AREA"), (M + 290, "NOTES")]
    c.setFillColor(MUTED)
    c.setFont("Sans-Bold", 7.5)
    for x, t in cols:
        c.drawString(x, y, t)
    y -= 14
    for p in info["parts"]:
        c.setFillColor(HexColor(info["deco_colour"]))
        c.circle(M + 7, y + 3, 7, stroke=0, fill=1)
        c.setFillColor(INK)
        c.setFont("Sans-Bold", 7.5)
        c.drawCentredString(M + 7, y + 0.5, str(p["no"]))
        c.setFont("Sans-Bold", 8.5)
        c.drawString(M + 32, y, p["name"])
        c.setFont("Sans", 8.5)
        c.drawString(M + 200, y, f"{p['area_mm2']:.0f} mm²")
        lines = wrap(p.get("note", ""), "Sans", 8, PAGE_W - M - (M + 290))
        for i, line in enumerate(lines):
            c.drawString(M + 290, y - i * 10.5, line)
        y -= max(17, 10.5 * len(lines) + 6.5)
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M + 32, y, "Total painted area")
    c.drawString(M + 200, y, f"{sum(p['area_mm2'] for p in info['parts']):.0f} mm²")
    banner(c, 66, 92, "Deco boundaries are approximate",
           "Gold areas were selected automatically from the reference mesh, so their edges are approximate. The rule is "
           "simple: every piece of jewellery is fully gold and nothing else is painted. Areas are the visible surface "
           "of each part, for quoting paint time and masks. Factory to propose the process (spray with masks, pad "
           "print or hand paint) and confirm adhesion and rub resistance on soft PVC.")


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
    pages = [("cover", None)] + ([("colour", None)] if a.colourways else []) + ([("deco", None)] if a.deco_map else []) + [(slug, cap) for slug, cap in VIEWS
                                 if os.path.exists(os.path.join(a.renders, f"render-{slug}.png"))] + [("data", None)]
    attach = not a.no_attach

    tmp = a.pdf + ".tmp"
    c = canvas.Canvas(tmp, pagesize=A4)
    c.setTitle(f"{a.title} - Factory Reference Pack".strip(" -"))
    c.setAuthor("Fola Adeleke")
    for i, (slug, cap) in enumerate(pages, 1):
        section = {"cover": "Overview", "data": "Mesh data & factory response", "colour": "Colour standard", "deco": "Deco / paint map",
                   "underside": "Underside & base mark", "mark": "Underside & base mark"}.get(slug, "Orthographic views")
        header(c, section, i, len(pages), a)
        if slug == "cover":
            cover(c, a, stats, target, a.renders)
        elif slug == "colour":
            colour_page(c, a)
        elif slug == "deco":
            deco_page(c, a)
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
