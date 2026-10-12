#!/usr/bin/env python3
"""Export a base mark (SVG logo + wordmark) as factory vector artwork in mm.

    python3 scripts/relief/export_mark.py favicon.svg out/ \
        --text "Fola Adeleke" --font NimbusMonoPS-Bold.otf \
        --logo-size 13.3 --gap 2.5 --text-width 32.2 --depth 0.5

Text is converted to outlines, so no font is needed to open the files.
Layout matches base_mark.py: logo (largest side = --logo-size), gap, then
the wordmark scaled to --text-width, both centred on one horizontal axis.

Writes, all 1:1 in millimetres:
  base-mark_part-view.svg / .dxf   reads correctly on the finished part
  base-mark_mould-side.svg / .dxf  mirrored, as cut into the tool
  base-mark_sheet.pdf              1:1 and 4:1 artwork with dimensions and notes
"""
import argparse
import os

import ezdxf
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLFont
from reportlab.pdfgen import canvas
from svgelements import SVG, Close, CubicBezier, Line, Matrix, Move, Path, QuadraticBezier

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(RLFont("Sans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(RLFont("Sans-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("logo_svg")
    p.add_argument("out")
    p.add_argument("--text", default="Fola Adeleke")
    p.add_argument("--font", required=True)
    p.add_argument("--logo-size", type=float, default=13.3, help="logo's largest side, mm")
    p.add_argument("--gap", type=float, default=2.5, help="logo-to-text gap, mm")
    p.add_argument("--text-width", type=float, default=32.2, help="wordmark length, mm")
    p.add_argument("--depth", type=float, default=0.5, help="deboss depth (annotation only), mm")
    p.add_argument("--title", default="BASE MARK")
    p.add_argument("--location", default="", help="where the mark sits on the part (annotation)")
    return p.parse_args()


def logo_path(svg_file):
    """All filled paths in the SVG, transforms applied, as one Path (y down)."""
    out = Path()
    for e in SVG.parse(svg_file).elements():
        if isinstance(e, Path) and len(e):
            out += abs(e)
    return out


def text_path(font_file, text):
    """Glyph outlines laid out by advance width, font units, flipped to y down."""
    font = TTFont(font_file)
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    d, x = [], 0
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        pen = SVGPathPen(gs)
        gs[name].draw(pen)
        if pen.getCommands():
            d.append(str(Path(pen.getCommands()) * Matrix(f"translate({x},0)")))
        x += gs[name].width
    return Path(" ".join(d)) * Matrix("scale(1,-1)")


def fit(path, size, by="max"):
    x0, y0, x1, y1 = path.bbox()
    s = size / (max(x1 - x0, y1 - y0) if by == "max" else (x1 - x0))
    # SVG transform lists apply right to left: centre first, then scale.
    return abs(path * Matrix(f"scale({s}) translate({-x0},{-(y0 + y1) / 2})"))


def layout(a):
    logo = fit(logo_path(a.logo_svg), a.logo_size)
    text = fit(text_path(a.font, a.text), a.text_width, by="width")
    lx0, _, lx1, _ = logo.bbox()
    text = abs(text * Matrix(f"translate({lx1 + a.gap},0)"))
    art = Path(logo.d() + " " + text.d())
    x0, y0, x1, y1 = art.bbox()
    # Origin at the artwork's top-left corner in a y-down frame.
    shift = Matrix(f"translate({-x0},{-y0})")
    art = abs(art * shift)
    return art, abs(logo * shift).bbox(), abs(text * shift).bbox(), (x1 - x0, y1 - y0)


def subpaths(path, tol=0.01):
    """Flatten to closed polylines (mm) for DXF."""
    polys, cur = [], []
    for seg in path:
        if isinstance(seg, Move):
            if len(cur) > 2:
                polys.append(cur)
            cur = [(seg.end.x, seg.end.y)]
        elif isinstance(seg, Close):
            if len(cur) > 2:
                polys.append(cur)
            cur = []
        elif isinstance(seg, Line):
            cur.append((seg.end.x, seg.end.y))
        else:
            n = max(4, int(seg.length() / 0.2))
            cur += [(pt.x, pt.y) for pt in (seg.point(i / n) for i in range(1, n + 1))]
    if len(cur) > 2:
        polys.append(cur)
    return polys


def write_svg(path, size, file, mirror=False):
    w, h = size
    p = abs(path * Matrix(f"scale(-1,1) translate({-w},0)")) if mirror else path
    with open(file, "w") as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.3f}mm" height="{h:.3f}mm" '
                f'viewBox="0 0 {w:.3f} {h:.3f}">\n'
                f'  <path d="{p.d()}" fill="#000" fill-rule="nonzero"/>\n</svg>\n')


def write_dxf(path, size, file, mirror=False):
    w, h = size
    doc = ezdxf.new("R2010", units=ezdxf.units.MM)
    doc.layers.add("MARK", color=7)
    msp = doc.modelspace()
    for poly in subpaths(path):
        # DXF is y up; flip, and mirror in X for the mould side.
        pts = [((w - x) if mirror else x, h - y) for x, y in poly]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": "MARK"})
    doc.saveas(file)


def draw_path(c, path, ox, oy, scale, height):
    """Draw a y-down mm path on a reportlab canvas (y up, points)."""
    pp = c.beginPath()

    def P(pt):
        return ox + pt.x * scale * mm, oy + (height - pt.y) * scale * mm

    for seg in path:
        if isinstance(seg, Move):
            pp.moveTo(*P(seg.end))
        elif isinstance(seg, Line):
            pp.lineTo(*P(seg.end))
        elif isinstance(seg, CubicBezier):
            pp.curveTo(*P(seg.control1), *P(seg.control2), *P(seg.end))
        elif isinstance(seg, QuadraticBezier):
            s0, q, e = seg.start, seg.control, seg.end
            c1 = (s0.x + 2 / 3 * (q.x - s0.x), s0.y + 2 / 3 * (q.y - s0.y))
            c2 = (e.x + 2 / 3 * (q.x - e.x), e.y + 2 / 3 * (q.y - e.y))
            pp.curveTo(*P(type(s0)(*c1)), *P(type(s0)(*c2)), *P(e))
        elif isinstance(seg, Close):
            pp.close()
    c.drawPath(pp, stroke=0, fill=1, fillMode=1)


def dim_h(c, x0, x1, y, label):
    c.setLineWidth(0.4)
    c.line(x0, y, x1, y)
    for x in (x0, x1):
        c.line(x, y - 3, x, y + 3)
    c.setFont("Sans", 7)
    c.drawCentredString((x0 + x1) / 2, y - 10, label)


def write_sheet(a, art, size, logo_bb, text_bb, file):
    W, H = landscape(A4)
    w, h = size
    c = canvas.Canvas(file, pagesize=(W, H))
    c.setTitle(f"{a.title} - vector artwork")
    ink, brand, muted = HexColor("#1F2E2A"), HexColor("#2F5446"), HexColor("#5E6B66")
    c.setFillColor(brand)
    c.rect(0, H - 10, W, 10, stroke=0, fill=1)
    M = 42
    c.setFont("Sans-Bold", 8.5)
    c.drawString(M, H - 40, "BASE MARK  /  VECTOR ARTWORK")
    c.setFillColor(ink)
    c.setFont("Sans-Bold", 22)
    c.drawString(M, H - 68, a.title)

    # 4:1 enlargement with dimensions.
    k = 4
    ox, oy = M, H - 120 - h * k * mm
    c.setFillColor(ink)
    draw_path(c, art, ox, oy, k, h)
    lw = (logo_bb[2] - logo_bb[0])
    dim_h(c, ox, ox + w * k * mm, oy - 16, f"{w:.1f} mm overall")
    dim_h(c, ox, ox + lw * k * mm, oy - 40, f"logo {lw:.1f} mm")
    tx0 = text_bb[0]
    dim_h(c, ox + tx0 * k * mm, ox + w * k * mm, oy - 40, f"wordmark {text_bb[2] - text_bb[0]:.1f} mm")
    c.setFillColor(muted)
    c.setFont("Sans-Bold", 7.5)
    c.drawString(ox, oy + h * k * mm + 10, f"4:1  (AS READ ON THE FINISHED PART)   height {h:.1f} mm overall")

    # 1:1 part view and mould side.
    y1 = 150
    c.setFillColor(muted)
    c.drawString(M, y1 + h * mm + 22, "1:1  PART VIEW")
    c.setFillColor(ink)
    draw_path(c, art, M, y1, 1, h)
    mirrored = abs(art * Matrix(f"scale(-1,1) translate({-w},0)"))
    c.setFillColor(muted)
    c.drawString(M + 90 * mm, y1 + h * mm + 22, "1:1  MOULD SIDE (MIRRORED)")
    c.setFillColor(ink)
    draw_path(c, mirrored, M + 90 * mm, y1, 1, h)

    notes = [
        ("Process", f"Deboss {a.depth:g} mm into the part (raised {a.depth:g} mm on the tool)."),
        ("Location", a.location or "-"),
        ("Wordmark", f"\"{a.text}\" in a Courier-style monospace ({os.path.basename(a.font)}), outlined. "
                     "Match to Courier New Bold if the factory has it; keep the overall length."),
        ("Logo", f"Propeller mark from {os.path.basename(a.logo_svg)}, {lw:.1f} mm largest side."),
        ("Min. feature", "Thinnest strokes are well under 1 mm at this size. Factory to confirm the minimum "
                         "deboss line width for PVC and advise if the mark should grow."),
        ("Files", "base-mark_part-view.svg/.dxf (reads on part), base-mark_mould-side.svg/.dxf (mirrored). "
                  "All 1:1, millimetres, text as outlines."),
    ]
    y = 118
    for k_, v in notes:
        c.setFillColor(muted)
        c.setFont("Sans-Bold", 7.5)
        c.drawString(M, y, k_.upper())
        c.setFillColor(ink)
        c.setFont("Sans", 8.5)
        c.drawString(M + 80, y, v)
        y -= 15
    c.save()


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)
    art, logo_bb, text_bb, size = layout(a)
    stem = os.path.join(a.out, "base-mark")
    write_svg(art, size, stem + "_part-view.svg")
    write_svg(art, size, stem + "_mould-side.svg", mirror=True)
    write_dxf(art, size, stem + "_part-view.dxf")
    write_dxf(art, size, stem + "_mould-side.dxf", mirror=True)
    write_sheet(a, art, size, logo_bb, text_bb, stem + "_sheet.pdf")
    print(f"artwork {size[0]:.2f} x {size[1]:.2f} mm; logo {logo_bb[2] - logo_bb[0]:.2f} x {logo_bb[3] - logo_bb[1]:.2f} mm; "
          f"text {text_bb[2] - text_bb[0]:.2f} x {text_bb[3] - text_bb[1]:.2f} mm")


if __name__ == "__main__":
    main()
