"""Build a deboss cutter (logo + wordmark) for the underside of a figure.

    blender -b -P scripts/relief/base_mark.py -- layout.json favicon.svg cutter.stl \
        --text "Fola Adeleke" --font /usr/share/fonts/opentype/urw-base35/NimbusMonoPS-Bold.otf

layout.json gives the target strip on the sole in figure coordinates (mm):
{"cx", "cy", "angle" (deg, strip's long axis), "L", "W"}. The logo sits at
the heel end of the strip and the text follows it. Everything is mirrored so
it reads correctly when the figure is turned over and viewed from below.
The cutter spans Z -2 .. --depth so subtracting it debosses the sole.
"""
import argparse
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    p = argparse.ArgumentParser()
    p.add_argument("layout")
    p.add_argument("logo_svg")
    p.add_argument("out")
    p.add_argument("--text", default="Fola Adeleke")
    p.add_argument("--font", required=True)
    p.add_argument("--depth", type=float, default=0.5, help="deboss depth into the sole, mm")
    p.add_argument("--gap", type=float, default=2.5, help="space between logo and text, mm")
    p.add_argument("--flip", action="store_true", help="put the logo at the other end of the strip")
    return p.parse_args(argv)


def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts))))


def to_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def main():
    a = parse_args()
    lay = json.load(open(a.layout))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    span = a.depth + 2.0  # from Z=-2 (below the floor) up into the sole

    # Logo: SVG curves, filled, scaled to the strip height.
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=a.logo_svg)
    logo_parts = [o for o in bpy.data.objects if o not in before]
    for o in logo_parts:
        o.data.dimensions = "2D"
        o.data.fill_mode = "BOTH"
    lo, hi = bbox(logo_parts)
    s = (lay["W"] * 0.95) / max(hi.y - lo.y, hi.x - lo.x)
    logo = []
    for o in logo_parts:
        o.data.extrude = 0.5  # metres-ish before scaling; normalised below
        logo.append(to_mesh(o))
    bpy.ops.object.select_all(action="DESELECT")
    for o in logo:
        o.select_set(True)
    bpy.context.view_layer.objects.active = logo[0]
    if len(logo) > 1:
        bpy.ops.object.join()
    logo = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo3 = Vector([min(v.co[i] for v in logo.data.vertices) for i in range(3)])
    hi3 = Vector([max(v.co[i] for v in logo.data.vertices) for i in range(3)])
    centre = (lo3 + hi3) / 2
    zs = hi3.z - lo3.z
    for v in logo.data.vertices:
        c = v.co - centre
        v.co = Vector((c.x * s, c.y * s, c.z / zs * span))
    logo_w = (hi3.x - lo3.x) * s

    # Wordmark: Courier-style font, sized to the remaining strip length.
    cu = bpy.data.curves.new("mark", "FONT")
    cu.body = a.text
    cu.font = bpy.data.fonts.load(a.font)
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    cu.size = 1.0
    cu.extrude = 0.5
    txt = bpy.data.objects.new("mark", cu)
    bpy.context.collection.objects.link(txt)
    bpy.context.view_layer.update()
    txt = to_mesh(txt)
    tlo = Vector([min(v.co[i] for v in txt.data.vertices) for i in range(3)])
    thi = Vector([max(v.co[i] for v in txt.data.vertices) for i in range(3)])
    room = lay["L"] - logo_w - a.gap
    ts = min(room / (thi.x - tlo.x), (lay["W"] * 0.62) / (thi.y - tlo.y))
    tc = (tlo + thi) / 2
    for v in txt.data.vertices:
        c = v.co - tc
        v.co = Vector((c.x * ts, c.y * ts, c.z / (thi.z - tlo.z) * span))
    text_w = (thi.x - tlo.x) * ts
    cap_h = (thi.y - tlo.y) * ts

    # Lay out along local X: logo then text, centred on the strip.
    total = logo_w + a.gap + text_w
    sign = -1 if a.flip else 1
    logo.location.x = sign * (-total / 2 + logo_w / 2)
    txt.location.x = sign * (total / 2 - text_w / 2)
    for o in (logo, txt):
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
    bpy.ops.object.select_all(action="DESELECT")
    logo.select_set(True)
    txt.select_set(True)
    bpy.context.view_layer.objects.active = logo
    bpy.ops.object.join()
    cutter = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True)

    # Mirror in X so it reads from below, then rotate onto the strip axis,
    # move to the strip centre and sit the cutter from Z=-2 to Z=depth.
    ang = math.radians(lay["angle"])
    M = (Matrix.Translation((lay["cx"], lay["cy"], -2.0 + span / 2))
         @ Matrix.Rotation(ang, 4, "Z")
         @ Matrix.Diagonal((-1, 1, 1, 1)))
    cutter.data.transform(M)
    cutter.data.flip_normals()  # the mirror inverted the winding
    cutter.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    cutter.select_set(True)
    bpy.ops.export_mesh.stl(filepath=a.out, use_selection=True, global_scale=1.0)
    print("MARK", json.dumps({"logo_mm": round(logo_w, 2), "text_mm": round(text_w, 2),
                              "text_height_mm": round(cap_h, 2), "depth_mm": a.depth,
                              "total_mm": round(total, 2)}))


main()
