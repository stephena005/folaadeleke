"""Shop/marketing product shots of a figure mesh in monochrome studio sets.

    blender -b -P scripts/relief/product_shots.py -- figure.stl out/ \
        --shots catalogue,trio,box,detail,signed --label label.png --samples 160

Sets follow the site's monochrome rule: the figure carries the only colour.
  catalogue  front 3/4 on white, contact shadow (square); --colourway
  back       back 3/4 on white (square); --colourway
  side       left side on white (square); --colourway
  under      on its back, soles and base mark, white (square); --colourway
  trio       C01 / C02 / C03 on black gloss, rim-lit (wide banner)
  trio-white C01 / C02 / C03 front-on, side by side on white (wide)
  box        figure beside a black rigid box printed with --label (square)
  detail     face and bear close-up, shallow depth of field, black (square)
  signed     figure lying on its back, soles to camera, base mark (square)
Reuses load/normalise/material helpers from render_figure.py.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_figure as rf  # noqa: E402

COLOURS = {"C01": "#CD6F5E", "C02": "#8A9E8A", "C03": "#C9A064"}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:]
    p = argparse.ArgumentParser()
    p.add_argument("mesh")
    p.add_argument("out")
    p.add_argument("--shots", default="catalogue,trio,box,detail,signed")
    p.add_argument("--height", type=float, default=280.0)
    p.add_argument("--label", default="", help="PNG printed on the box front (white on transparent)")
    p.add_argument("--colourway", default="C02", choices=sorted(COLOURS), help="figure colour for single-figure shots")
    p.add_argument("--box", default="300x150x135", help="box H x W x D, mm")
    p.add_argument("--box-colour", default="#111111")
    p.add_argument("--box-yaw", type=float, default=-14.0, help="box rotation, degrees (negative shows its right side)")
    p.add_argument("--side-label", default="", help="PNG printed on the box's right side")
    p.add_argument("--samples", type=int, default=160)
    p.add_argument("--size", type=int, default=2000, help="square edge in px; trio is 1.6:1")
    p.add_argument("--square", action="store_true", help="render the trio shots square (for square galleries)")
    return p.parse_args(argv)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system, s.unit_settings.scale_length = "METRIC", 0.001
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.use_adaptive_sampling = True
    s.cycles.adaptive_threshold = 0.006
    s.cycles.use_denoising = False
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    s.render.image_settings.file_format = "PNG"
    return s


def figure(mesh, height, colour, name="figure"):
    ob = rf.load_mesh(os.path.abspath(mesh))
    rf.normalise(ob, height, 0)
    rf.finish(ob, colour)
    ob.name = name
    return ob


def mat(name, rgb, rough, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    return m


def sweep(colour_rgb, rough, wall_y=250, r=400, half_w=3000):
    """Floor curving up into a back wall."""
    prof = [(y, 0.0) for y in (-4000.0, -1000.0, wall_y)]
    prof += [(wall_y + r * math.sin(t), r - r * math.cos(t)) for t in (math.pi / 2 * k / 32 for k in range(1, 33))]
    prof.append((wall_y + r, 4000.0))
    verts = [(x, y, z) for x in (-half_w, half_w) for y, z in prof]
    n = len(prof)
    me = bpy.data.meshes.new("sweep")
    me.from_pydata(verts, [], [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)])
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat("sweep", colour_rgb, rough, 0.4))
    ob = bpy.data.objects.new("sweep", me)
    bpy.context.collection.objects.link(ob)
    return ob


def light(name, loc, target, energy, size, shape="DISK", size_y=None, colour=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA")
    d.shape, d.size, d.energy, d.color = shape, size, energy, colour
    if size_y:
        d.size_y = size_y
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def camera(loc, target, lens, fstop=11.0, focus=None):
    d = bpy.data.cameras.new("cam")
    d.lens, d.clip_end = lens, 50000
    d.dof.use_dof = True
    d.dof.aperture_fstop = fstop
    o = bpy.data.objects.new("cam", d)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    d.dof.focus_distance = (Vector(focus or target) - Vector(loc)).length
    bpy.context.scene.camera = o
    return o


def world(rgb, strength):
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*rgb, 1)
    bg.inputs["Strength"].default_value = strength
    bpy.context.scene.world = w


def from_dir(target, direction, dist):
    return Vector(target) + Vector(direction).normalized() * dist


def black_set():
    sweep((0.006, 0.006, 0.006), 0.5)
    world((0, 0, 0), 0.0)
    light("key", (-420, -520, 620), (0, 0, 140), 3.6e6, 420)
    # Rims sit high and behind so their reflections fall outside the frame.
    light("rim_l", (-360, 300, 620), (0, 0, 170), 1.8e6, 60, "RECTANGLE", 420)
    light("rim_r", (360, 300, 620), (0, 0, 170), 1.8e6, 60, "RECTANGLE", 420)
    light("fill", (520, -560, 180), (0, 0, 120), 0.6e6, 500)


def white_set():
    floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor"))
    floor.data.from_pydata([(-3000, -3000, 0), (3000, -3000, 0), (3000, 3000, 0), (-3000, 3000, 0)], [], [(0, 1, 2, 3)])
    bpy.context.collection.objects.link(floor)
    floor.is_shadow_catcher = True
    world((1, 1, 1), 0.55)
    light("key", (-420, -560, 640), (0, 0, 140), 1.7e6, 420)
    light("fill", (560, -420, 260), (0, 0, 140), 0.6e6, 520, colour=(0.97, 0.98, 1.0))
    light("rim", (200, 520, 520), (0, 0, 150), 0.8e6, 220)
    bpy.context.scene.render.film_transparent = True


def label_plane(png, w, h, loc, rot):
    img = bpy.data.images.load(os.path.abspath(png))
    m = bpy.data.materials.new("label")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.6
    m.blend_method = "HASHED"
    bpy.ops.mesh.primitive_plane_add(size=1)
    p = bpy.context.active_object
    p.scale = (w, h, 1)
    p.location, p.rotation_euler = loc, rot
    p.data.materials.append(m)
    return p


def render(scene, path, w, h, samples):
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if scene.render.film_transparent:
        from PIL import Image
        im = Image.open(path).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        Image.alpha_composite(bg, im).convert("RGB").save(path)
    print("SHOT", path)


def gallery(a, name, yaw):
    """White-set gallery shot: same camera and lights, the figure turned."""
    s = reset()
    ob = figure(a.mesh, a.height, COLOURS[a.colourway])
    ob.rotation_euler.z = math.radians(yaw)
    bpy.context.view_layer.update()
    # Aim at the turned figure's footprint centre so every angle sits centred.
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    white_set()
    t = (cx, cy, a.height * 0.47)
    camera(from_dir(t, (-0.42, -1, 0.16), 1000), t, 100)
    render(s, os.path.join(a.out, f"shot-{name}-{a.colourway.lower()}.png"), a.size, a.size, a.samples)


def shot_catalogue(a):
    gallery(a, "front", 0)


def shot_back(a):
    # Back three-quarter: sling, infant and the bear over the shoulder.
    gallery(a, "back", 200)


def shot_side(a):
    # Figure's left side (the sling and bear side) towards the camera.
    gallery(a, "side", -70)


def shot_under(a):
    """Underfoot on the white set: figure on its back, soles to camera."""
    s = reset()
    ob = figure(a.mesh, a.height, COLOURS[a.colourway])
    ob.rotation_euler = (math.radians(-90), 0, math.radians(8))
    bpy.context.view_layer.update()
    zmin = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
    ob.location.z -= zmin
    ob.location.y = 60
    white_set()
    sole = (31, 64, 39)
    light("rake", (-330, -40, 90), sole, 0.7e6, 120)
    camera(from_dir(sole, (0.2, -1, 0.38), 720), (0, 120, 50), 100, fstop=6.3, focus=sole)
    render(s, os.path.join(a.out, f"shot-under-{a.colourway.lower()}.png"), a.size, a.size, a.samples)


def shot_trio(a):
    s = reset()
    for i, (code, x, yaw) in enumerate((("C01", -150, 18), ("C02", 0, 0), ("C03", 150, -18))):
        ob = figure(a.mesh, a.height, COLOURS[code], code)
        ob.location.x = x
        ob.location.y = 30 if i != 1 else 0
        ob.rotation_euler.z = math.radians(yaw)
    black_set()
    t = (0, 0, a.height * 0.46)
    camera(from_dir(t, (0, -1, 0.10), 1180), t, 70)
    w = int(a.size * 1.6)
    render(s, os.path.join(a.out, "shot-trio-black.png"), w, a.size, a.samples)


def shot_trio_white(a):
    """All three colourways front-on, side by side, on the white set (wide)."""
    s = reset()
    for code, x in (("C01", -155), ("C02", 0), ("C03", 155)):
        ob = figure(a.mesh, a.height, COLOURS[code], code)
        ob.location.x = x
    white_set()
    t = (0, 0, a.height * 0.47)
    camera(from_dir(t, (0, -1, 0.12), 1180), t, 70)
    name = "shot-trio-white-front-square.png" if a.square else "shot-trio-white-front.png"
    render(s, os.path.join(a.out, name), a.size if a.square else int(a.size * 1.6), a.size, a.samples)


def shot_box(a):
    s = reset()
    ob = figure(a.mesh, a.height, COLOURS[a.colourway])
    ob.location.x = -70
    ob.rotation_euler.z = math.radians(20)
    bh, bw, bd = (float(v) for v in a.box.split("x"))
    bpy.ops.mesh.primitive_cube_add(size=1)
    box = bpy.context.active_object
    box.scale = (bw, bd, bh)
    bpy.ops.object.transform_apply(scale=True)  # bevel works in object space
    box.location = (95, 25, bh / 2)
    box.rotation_euler.z = math.radians(a.box_yaw)
    bev = box.modifiers.new("bevel", "BEVEL")
    bev.width, bev.segments = 1.2, 3
    box.data.materials.append(mat("box", rf.srgb_to_linear(a.box_colour)[:3], 0.55, 0.3))
    # Decals sit just proud of the faces and follow the box's yaw.
    yaw = box.rotation_euler.z
    if a.label:
        n = Vector((math.sin(yaw), -math.cos(yaw), 0))
        c = Vector(box.location) + n * (bd / 2 + 0.15)
        label_plane(a.label, bw * 0.9, bh * 0.9, c, (math.pi / 2, 0, yaw))
    if a.side_label:
        n = Vector((math.cos(yaw), math.sin(yaw), 0))
        c = Vector(box.location) + n * (bw / 2 + 0.15)
        label_plane(a.side_label, bd * 0.9, bh * 0.9, c, (math.pi / 2, 0, yaw + math.pi / 2))
    white_set()
    # Soft frontal fill so a light-coloured box face doesn't read grey.
    light("box_fill", (-150, -820, 260), (95, 25, bh / 2), 1.1e6, 520)
    t = (15, 0, a.height * 0.5)
    camera(from_dir(t, (-0.2, -1, 0.14), 1120), t, 85)
    render(s, os.path.join(a.out, f"shot-box-{a.colourway.lower()}.png"), a.size, a.size, a.samples)


def shot_detail(a):
    s = reset()
    ob = figure(a.mesh, a.height, COLOURS[a.colourway])
    ob.rotation_euler.z = math.radians(-22)  # turn the bear into view
    black_set()
    face = (-4, -34, a.height * 0.72)
    camera(from_dir(face, (-0.3, -1, 0.06), 600), (12, -10, a.height * 0.73), 135, fstop=3.2, focus=face)
    render(s, os.path.join(a.out, f"shot-detail-{a.colourway.lower()}.png"), a.size, a.size, a.samples)


def shot_signed(a):
    s = reset()
    ob = figure(a.mesh, a.height, COLOURS["C02"])
    # Lie it on its back: front to +Z, soles to -Y (towards the camera).
    ob.rotation_euler = (math.radians(-90), 0, math.radians(8))
    bpy.context.view_layer.update()
    zmin = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
    ob.location.z -= zmin
    ob.location.y = 60
    black_set()
    # Base mark centre after the turn, approx: (31, 64, 39) in scene mm.
    sole = (31, 64, 39)
    light("rake", (-330, -40, 90), sole, 0.9e6, 120)  # low raking light reads the deboss
    camera(from_dir(sole, (0.2, -1, 0.38), 580), (20, 90, 45), 100, fstop=6.3, focus=sole)
    render(s, os.path.join(a.out, "shot-signed-underside.png"), a.size, a.size, a.samples)


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)
    shots = {"catalogue": shot_catalogue, "back": shot_back, "side": shot_side, "under": shot_under,
             "trio": shot_trio, "trio-white": shot_trio_white, "box": shot_box, "detail": shot_detail, "signed": shot_signed}
    for name in (x.strip() for x in a.shots.split(",") if x.strip()):
        shots[name](a)


if __name__ == "__main__":
    main()
