"""Factory reference renders of a collectible figure mesh (GLB/OBJ/STL).

    blender -b -P scripts/relief/render_figure.py -- mesh.glb out/ \
        --height 280 --colour "#8A9E8A" --colour-name "C02 SAGE GREEN" \
        --title "MOTHER & CHILD" --res 2000x2800 --samples 192

Scales the mesh so its overall height equals --height (mm), stands it on
Z=0, and renders orthographic FRONT / SIDE (left) / BACK views on white with
a soft contact shadow, plus a perspective 3/4 HERO. The cameras and lights
stay fixed and the figure turns, so all views share identical lighting. The
orthographic PNGs get dimension lines (H, W or D, measured from the scaled
mesh); every PNG gets a title block. Unannotated renders are kept as raw-*.png. Also writes the
scaled mesh as STL/OBJ (mm) and dims.json.
"""
import argparse
import json
import math
import os
import sys
from datetime import date

import bpy
from mathutils import Vector

# (label, file slug, figure yaw in degrees). The figure turns clockwise seen
# from above, so +90 brings its left side to the camera.
VIEWS = [("FRONT", "front", 0), ("SIDE (LEFT)", "side", 90), ("BACK", "back", 180), ("3/4 HERO", "hero", 35)]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("mesh")
    p.add_argument("out")
    p.add_argument("--height", type=float, default=280.0, help="overall height, mm")
    p.add_argument("--colour", default="#8A9E8A")
    p.add_argument("--colour-name", default="")
    p.add_argument("--title", default="")
    p.add_argument("--note", default="")
    p.add_argument("--rev", default="")
    p.add_argument("--yaw", type=float, default=0.0, help="extra Z rotation (deg) so the mesh faces -Y")
    p.add_argument("--res", default="2000x2800")
    p.add_argument("--samples", type=int, default=192)
    p.add_argument("--views", default="front,side,back,hero", help="comma-separated slugs")
    return p.parse_args(argv)


def srgb_to_linear(hex_colour):
    h = hex_colour.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def load_mesh(path):
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".stl":
        bpy.ops.import_mesh.stl(filepath=path)
    else:
        raise SystemExit(f"unsupported mesh: {path}")
    meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in set(bpy.data.objects) - before - set(meshes):
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.parent = None
    ob.rotation_mode = "XYZ"  # glTF imports use quaternions, which ignore rotation_euler
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def normalise(ob, height_mm, yaw):
    """Scale to height (1 BU = 1 mm), feet on Z=0, centred on the Z axis."""
    ob.rotation_euler = (0, 0, math.radians(yaw))
    bpy.ops.object.transform_apply(rotation=True)
    zs = [v.co.z for v in ob.data.vertices]
    s = height_mm / (max(zs) - min(zs))
    ob.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    co = [v.co for v in ob.data.vertices]
    cx = (min(c.x for c in co) + max(c.x for c in co)) / 2
    cy = (min(c.y for c in co) + max(c.y for c in co)) / 2
    zmin = min(c.z for c in co)
    for v in ob.data.vertices:
        v.co -= Vector((cx, cy, zmin))
    ob.data.update()


def extents(ob):
    co = [v.co for v in ob.data.vertices]
    return [max(c[i] for c in co) - min(c[i] for c in co) for i in range(3)]


def finish(ob, hex_colour):
    bpy.ops.object.shade_smooth()
    ob.data.use_auto_smooth = True
    ob.data.auto_smooth_angle = math.radians(40)
    ob.data.materials.clear()
    m = bpy.data.materials.new("pvc")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb_to_linear(hex_colour)
    bsdf.inputs["Roughness"].default_value = 0.52  # matte soft vinyl
    bsdf.inputs["Specular IOR Level"].default_value = 0.4
    bsdf.inputs["Subsurface Weight"].default_value = 0.04
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.6, 0.4)
    bsdf.inputs["Subsurface Scale"].default_value = 0.8
    ob.data.materials.append(m)


def add_light(name, loc, energy, size, colour=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA")
    d.shape, d.size, d.energy, d.color = "DISK", size, energy, colour
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 140)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


def studio(height):
    # Shadow catcher floor; the background is composited to white afterwards.
    bpy.ops.mesh.primitive_plane_add(size=height * 6)
    floor = bpy.context.active_object
    floor.is_shadow_catcher = True
    h = height
    add_light("key", (-1.1 * h, -1.6 * h, 1.9 * h), 1.6e6 * (h / 280) ** 2, 0.8 * h)
    add_light("fill", (1.6 * h, -1.2 * h, 0.9 * h), 0.55e6 * (h / 280) ** 2, 1.4 * h, (0.96, 0.98, 1.0))
    add_light("rim", (0.6 * h, 1.6 * h, 1.6 * h), 0.7e6 * (h / 280) ** 2, 0.7 * h)
    add_light("top", (0, 0, 3.0 * h), 0.4e6 * (h / 280) ** 2, 1.2 * h)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = 0.5
    bpy.context.scene.world = world


def ortho_camera(frame_w, frame_h, centre_z, aspect):
    d = bpy.data.cameras.new("cam")
    d.type = "ORTHO"
    d.ortho_scale = max(frame_w, frame_h * aspect) if aspect >= 1 else max(frame_w / aspect, frame_h)
    d.clip_end = 10000
    o = bpy.data.objects.new("cam", d)
    bpy.context.collection.objects.link(o)
    o.location = (0, -2000, centre_z)
    o.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = o
    return d.ortho_scale


def hero_camera(dims, aspect, lens=85, elevation=9):
    """Perspective 3/4 camera, slightly above, framing the full figure."""
    d = bpy.data.cameras.new("hero")
    d.lens = lens
    d.clip_end = 20000
    sensor_h = 36 if aspect < 1 else 36 / aspect
    target_z = dims["H"] * 0.40  # sits low so the title block clears the feet
    dist = lens * dims["H"] * 1.55 / sensor_h
    el = math.radians(elevation)
    o = bpy.data.objects.new("hero", d)
    bpy.context.collection.objects.link(o)
    o.location = (0, -dist * math.cos(el), target_z + dist * math.sin(el))
    o.rotation_euler = (Vector((0, 0, target_z)) - o.location).to_track_quat("-Z", "Y").to_euler()
    return o


def dimension_lines(dr, to_px, dims, view, ink, lw, f_big):
    width_mm = dims["W"] if view.startswith(("FRONT", "BACK")) else dims["D"]
    label_w = "W" if view.startswith(("FRONT", "BACK")) else "D"
    # Height: vertical line to the left of the figure.
    x0 = -width_mm / 2 - 18
    (hx, hy0), (_, hy1) = to_px(x0, 0), to_px(x0, dims["H"])
    dr.line([(hx, hy0), (hx, hy1)], fill=ink, width=lw)
    for y in (hy0, hy1):
        dr.line([(hx - 14, y), (hx + 14, y)], fill=ink, width=lw)
        dr.line([(hx + 14, y), to_px(-width_mm / 2 - 3, 0 if y == hy0 else dims["H"])], fill=(170, 175, 172), width=1)
    t = f"H {dims['H']:.0f} mm"
    tw = dr.textlength(t, font=f_big)
    dr.text((hx - tw - 24, (hy0 + hy1) / 2 - f_big.size / 2), t, font=f_big, fill=ink)
    # Width/depth: horizontal line under the feet.
    (wx0, wy), (wx1, _) = to_px(-width_mm / 2, -14), to_px(width_mm / 2, -14)
    dr.line([(wx0, wy), (wx1, wy)], fill=ink, width=lw)
    for x in (wx0, wx1):
        dr.line([(x, wy - 14), (x, wy + 14)], fill=ink, width=lw)
    t = f"{label_w} {width_mm:.0f} mm"
    tw = dr.textlength(t, font=f_big)
    dr.text(((wx0 + wx1) / 2 - tw / 2, wy + 22), t, font=f_big, fill=ink)


def annotate(src, png, view, dims, px_per_mm, img_w, img_h, cam_z, a):
    from PIL import Image, ImageDraw, ImageFont  # Blender's bundled Python may lack PIL

    im = Image.open(src).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    im = Image.alpha_composite(bg, im).convert("RGB")
    dr = ImageDraw.Draw(im)
    ink = (40, 52, 48)
    f_big = ImageFont.truetype("DejaVuSans-Bold.ttf", int(img_h * 0.018))
    f_small = ImageFont.truetype("DejaVuSans.ttf", int(img_h * 0.012))
    f_tag = ImageFont.truetype("DejaVuSans-Bold.ttf", int(img_h * 0.011))

    def to_px(x_mm, z_mm):
        return img_w / 2 + x_mm * px_per_mm, img_h / 2 - (z_mm - cam_z) * px_per_mm

    lw = max(2, img_w // 900)
    ortho = not view.startswith("3/4")
    if ortho:
        dimension_lines(dr, to_px, dims, view, ink, lw, f_big)

    # Title block, bottom band.
    m = int(img_w * 0.04)
    top = img_h - int(img_h * 0.085)
    dr.line([(m, top), (img_w - m, top)], fill=ink, width=lw)
    left = " / ".join(x for x in (a.title, view) if x)
    dr.text((m, top + 14), left, font=f_big, fill=ink)
    meta = [f"{dims['H']:.0f} x {dims['W']:.0f} x {dims['D']:.0f} mm (H x W x D)", a.colour_name,
            "ORTHOGRAPHIC, 1:1 PROPORTION" if ortho else "PERSPECTIVE, NOT TO SCALE", a.rev or date.today().isoformat()]
    dr.text((m, top + 22 + f_big.size), "   |   ".join(x for x in meta if x), font=f_small, fill=ink)
    if a.note:
        dr.text((m, top + 30 + f_big.size + f_small.size), a.note, font=f_tag, fill=(150, 80, 50))
    im.save(png, optimize=True)


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 0.001

    ob = load_mesh(os.path.abspath(a.mesh))
    normalise(ob, a.height, a.yaw)
    ex = extents(ob)
    dims = {"H": ex[2], "W": ex[0], "D": ex[1]}
    stem = os.path.join(a.out, "figure")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.ops.export_mesh.stl(filepath=stem + ".stl", use_selection=True, global_scale=1.0)
    bpy.ops.wm.obj_export(filepath=stem + ".obj", export_selected_objects=True, export_materials=False)
    finish(ob, a.colour)
    studio(a.height)

    w, h = (int(v) for v in a.res.split("x"))
    aspect = w / h
    widest = max(dims["W"], dims["D"])
    # Leave room for dimension lines on the left and the title block below.
    frame_w, frame_h = widest * 1.9 + 80, dims["H"] * 1.24
    cam_z = dims["H"] * 0.45
    ortho = ortho_camera(frame_w, frame_h, cam_z, aspect)
    ortho_cam = scene.camera
    hero_cam = hero_camera(dims, aspect)
    px_per_mm = (w if aspect >= 1 else w) / (ortho if aspect >= 1 else ortho * aspect)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = a.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.004
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    wanted = [v.strip() for v in a.views.split(",")]
    out = {}
    for name, slug, yaw in VIEWS:
        if slug not in wanted:
            continue
        # Turn the figure, not the camera, so every view shares the lighting.
        ob.rotation_euler = (0, 0, math.radians(-yaw))
        scene.camera = hero_cam if slug == "hero" else ortho_cam
        raw = os.path.join(a.out, f"raw-{slug}.png")
        png = os.path.join(a.out, f"render-{slug}.png")
        scene.render.filepath = raw
        bpy.ops.render.render(write_still=True)
        out[name] = png
        try:
            annotate(raw, png, name, dims, px_per_mm, w, h, cam_z, a)
        except ImportError:
            print("PIL not available in Blender's Python; skipped annotation")

    with open(os.path.join(a.out, "dims.json"), "w") as f:
        json.dump({"units": "mm", **{k: round(v, 1) for k, v in dims.items()},
                   "triangles": sum(len(p.vertices) - 2 for p in ob.data.polygons), "renders": out}, f, indent=2)
    print("DIMS", json.dumps(dims))


main()
