"""Studio product render of relief plaques (STL in mm) with Blender/Cycles.

    blender -b -P scripts/relief/render_blender.py -- \
        --plaque out/single.stl:#C8705F --plaque out/single.stl:#8A9E8A \
        --out render.png --shot hero --res 1800x1200 --samples 128

Plaques stand left to right, leaning back slightly, on a seamless sweep.
--shot hero shows the whole set at a 3/4 angle; --shot detail is a raking
close-up of the upper half of the first plaque.
"""
import argparse
import math
import sys

import bpy
from mathutils import Vector

LEAN = math.radians(10)  # plaque leans back from vertical
GAP = 0.03  # m between plaques


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--plaque", action="append", required=True, help="path.stl:#RRGGBB")
    p.add_argument("--out", required=True)
    p.add_argument("--shot", choices=["hero", "detail", "front"], default="hero")
    p.add_argument("--res", default="1800x1200")
    p.add_argument("--samples", type=int, default=128)
    p.add_argument("--backdrop", default="#EEEAE4")
    p.add_argument("--light", type=float, default=4.5, help="overall light multiplier")
    p.add_argument("--denoise", action="store_true", help="needs a Blender build with OpenImageDenoise")
    return p.parse_args(argv)


def srgb_to_linear(hex_colour):
    h = hex_colour.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def material(name, hex_colour, roughness, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb_to_linear(hex_colour)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    bsdf.inputs["Coat Weight"].default_value = sheen
    bsdf.inputs["Coat Roughness"].default_value = 0.35
    return m


def import_plaque(path, hex_colour, index):
    bpy.ops.import_mesh.stl(filepath=path, global_scale=0.001)
    ob = bpy.context.selected_objects[0]
    ob.name = f"plaque_{index}"
    bpy.ops.object.shade_smooth()
    ob.data.use_auto_smooth = True
    ob.data.auto_smooth_angle = math.radians(35)
    ob.data.materials.append(material(f"resin_{index}", hex_colour, 0.48, 0.08))
    # STL lies in XY with relief toward +Z; stand it up facing -Y, leaning back.
    ob.rotation_euler = (math.pi / 2 - LEAN, 0, 0)
    bpy.context.view_layer.update()
    return ob


def layout(plaques):
    widths = [p.dimensions.x for p in plaques]
    x = -(sum(widths) + GAP * (len(plaques) - 1)) / 2
    for p, w in zip(plaques, widths):
        p.location = (x, 0, 0)
        bpy.context.view_layer.update()
        zmin = min((p.matrix_world @ v.co).z for v in p.data.vertices)
        p.location.z -= zmin
        x += w + GAP
    bpy.context.view_layer.update()


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def sweep(hex_colour, wall_y, r=0.5, half_w=4.0):
    """Floor that curves up into a back wall - a photographer's paper sweep."""
    prof = [(y, 0.0) for y in (-4.0, -1.0, wall_y)]
    prof += [(wall_y + r * math.sin(t), r - r * math.cos(t))
             for t in (math.pi / 2 * k / 24 for k in range(1, 25))]
    prof.append((wall_y + r, 4.0))
    verts = [(x, y, z) for x in (-half_w, half_w) for y, z in prof]
    n = len(prof)
    faces = [(i, i + 1, n + i + 1, n + i) for i in range(n - 1)]
    me = bpy.data.meshes.new("sweep")
    me.from_pydata(verts, [], faces)
    ob = bpy.data.objects.new("sweep", me)
    bpy.context.collection.objects.link(ob)
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(material("sweep", hex_colour, 0.9))
    return ob


def area_light(name, loc, target, size, energy, colour=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "DISK"
    data.size = size
    data.energy = energy
    data.color = colour
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


def camera(loc, target, lens):
    data = bpy.data.cameras.new("cam")
    data.lens = lens
    data.dof.use_dof = True
    data.dof.aperture_fstop = 8
    ob = bpy.data.objects.new("cam", data)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    data.dof.focus_distance = (Vector(target) - Vector(loc)).length
    bpy.context.scene.camera = ob
    return ob


def main():
    a = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene

    plaques = []
    for i, spec in enumerate(a.plaque):
        path, colour = spec.rsplit(":", 1)
        plaques.append(import_plaque(path, colour, i))
    layout(plaques)
    lo, hi = bounds(plaques)
    centre = (lo + hi) / 2
    span = max(hi.x - lo.x, hi.z - lo.z)

    sweep(a.backdrop, hi.y + 0.12)
    # Key: raking from upper left so folds and beads cast short shadows.
    # Energies scale with distance squared so exposure is independent of set size.
    area_light("key", (centre.x - span * 1.4, -span * 1.1, hi.z + span * 0.9), centre, span * 0.6, 6 * span**2 * a.light)
    area_light("fill", (centre.x + span * 1.6, -span * 1.4, centre.z), centre, span * 1.5, 1.5 * span**2 * a.light, (0.95, 0.97, 1.0))
    area_light("rim", (centre.x + span * 0.4, span * 0.8, hi.z + span * 1.2), centre, span * 0.8, 2 * span**2 * a.light)

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.79, 0.77, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.22
    scene.world = world

    w, h = (int(v) for v in a.res.split("x"))
    aspect = w / h
    # Blender fits the 36 mm sensor to the longer image side.
    sw, sh = (36, 36 / aspect) if aspect >= 1 else (36 * aspect, 36)

    def fit_dist(width, height, lens, margin):
        return lens * max(width / sw, height / sh) * margin

    size_w, size_h = hi.x - lo.x, hi.z - lo.z
    if a.shot == "hero":
        lens = 85
        camera(centre + Vector((-0.45, -1, 0.22)).normalized() * fit_dist(size_w, size_h, lens, 1.3), centre, lens)
    elif a.shot == "front":
        lens = 100
        camera(centre + Vector((0, -1, 0.08)).normalized() * fit_dist(size_w, size_h, lens, 1.2), centre, lens)
    else:
        p = plaques[0]
        plo, phi = bounds([p])
        tgt = Vector(((plo.x + phi.x) / 2, (plo.y + phi.y) / 2, plo.z + (phi.z - plo.z) * 0.72))
        lens = 100
        cam = camera(tgt + Vector((-0.55, -1, 0.15)).normalized() * fit_dist(phi.x - plo.x, (phi.z - plo.z) * 0.5, lens, 1.1), tgt, lens)
        cam.data.dof.aperture_fstop = 4

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = a.samples
    # Distro builds often lack OpenImageDenoise; enable only with --denoise.
    scene.cycles.use_denoising = a.denoise
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.005
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.filepath = a.out
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


main()
