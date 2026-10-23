#!/usr/bin/env python3
"""Select Mama Comfort's jewellery on the single-shell reference mesh for gold deco.

    python3 scripts/relief/deco_mask.py figure.stl out/

The AI mesh is one fused shell, so the jewellery is picked from geometry:
  - beads (necklace, earring hoops): small spheres have high Gaussian and
    mean curvature, cloth folds are cylinders (Gaussian ~0). Bead crowns are
    clustered, grown over the bead, and the earring hoops flood-filled across
    their uniformly convex surface;
  - bangles, ring, pendant: the mesh is cut along concave creases inside a
    box around each, and the segments under known seed points are kept.
Boxes and seeds are in figure mm (280 mm tall, feet on Z=0, facing -Y) and
are specific to this mesh. Writes gold_centres.npy (face centres for
render_figure.py --deco), deco_parts.npz (per-part face masks) and
deco_parts.json (faces, visible area, centroid per part).
"""
import argparse
import json
import os

import numpy as np
import scipy.sparse as sp
import trimesh
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

EAR_BOXES = [([-44, -40, 182], [-26, 10, 212]), ([4, -40, 182], [24, 10, 212])]
BABY_FACE = lambda C: (C[:, 0] > 19.5) & (C[:, 1] < -5) & (C[:, 2] > 165)  # noqa: E731


def inbox(p, lo, hi):
    return np.all((p >= lo) & (p <= hi), 1)


def components(n, pairs):
    g = sp.coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
    return connected_components(g, directed=False)[1]


def crease_segments(m, lo, hi, degrees):
    """Face labels inside the box, split wherever the surface folds inward by more than `degrees`."""
    C = m.triangles_center
    box = inbox(C, lo, hi)
    adj, ang, cvx = m.face_adjacency, m.face_adjacency_angles, m.face_adjacency_convex
    ok = box[adj[:, 0]] & box[adj[:, 1]] & ~(~cvx & (ang > np.radians(degrees)))
    lab = components(len(C), adj[ok])
    lab[~box] = -1
    return lab


def at(m, lab, *points):
    C = m.triangles_center
    return np.isin(lab, [lab[np.argmin(((C - p) ** 2).sum(1))] for p in points])


def mean_curv(m, pts, r=1.2):
    return trimesh.curvature.discrete_mean_curvature_measure(m, pts, r) / (np.pi * r * r)


def bead_mask(m):
    """Vertex mask of beads around the neck and the earring hoops."""
    V = m.vertices
    idx = np.where((V[:, 2] > 150) & (V[:, 2] < 214) & (np.abs(V[:, 0]) < 48))[0]
    P = V[idx]
    H = mean_curv(m, P)
    K = trimesh.curvature.discrete_gaussian_curvature_measure(m, P, 1.0) / np.pi
    ear = np.zeros(len(P), bool)
    for lo, hi in EAR_BOXES:
        ear |= inbox(P, lo, hi)
    zone = (P[:, 2] < 196) | ear
    core = (((K > 0.2) & (H > 0.15)) | (ear & (K > 0.1) & (H > 0.2))) & zone
    cp = P[core]
    lab = components(len(cp), cKDTree(cp).query_pairs(3.2, output_type="ndarray"))
    cp = cp[np.bincount(lab)[lab] >= 12]  # bead chains, not stray crease spots
    dist, _ = cKDTree(cp).query(P)
    sel = (dist < np.where(ear, 2.0, 1.6)) & (H > np.where(ear, -0.15, -0.05)) & zone
    mk = np.zeros(len(V), bool)
    mk[idx[sel]] = True
    # Earrings: flood the seeds across each hoop's convex surface.
    hv = np.zeros(len(V))
    hv[idx] = H
    earv = np.zeros(len(V), bool)
    earv[idx[ear]] = True
    ok = earv & (hv > 0.3)
    e = m.edges_unique
    lab = components(len(V), e[ok[e[:, 0]] & ok[e[:, 1]]])
    mk |= ok & np.isin(lab, np.unique(lab[mk & ok]))
    return mk


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mesh")
    p.add_argument("out")
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    m = trimesh.load(a.mesh)
    C, F, A = m.triangles_center, m.faces, m.area_faces
    parts = {}

    # Bangles, left wrist: smooth bangle + flat band + each bead of the beaded row.
    lab = crease_segments(m, [5, -70, 96], [40, -30, 123], 12)
    u, n = np.unique(lab[lab >= 0], return_counts=True)
    beads = np.isin(lab, u[(n >= 200) & (n <= 1000)]) & (C[:, 2] > 98) & (C[:, 2] < 106.5)
    parts["bangles"] = at(m, lab, [25, -55.7, 116], [22.1, -53.8, 109.3]) | beads

    # Bangle on the hand behind the baby: its segment also takes in sling cloth,
    # so keep only the tight tube curvature.
    seg = at(m, crease_segments(m, [-42, 10, 118], [-12, 40, 146], 12), [-28, 24.2, 132])
    vs = np.unique(F[seg].ravel())
    hv = np.full(len(m.vertices), -9.0)
    hv[vs] = mean_curv(m, m.vertices[vs])
    fm = seg & (hv[F].min(1) > 0.2)
    adj = m.face_adjacency
    lab = components(len(F), adj[fm[adj[:, 0]] & fm[adj[:, 1]]])
    parts["rear bangle"] = fm & (lab == np.bincount(lab[fm]).argmax())

    # Ring: the two halves around the finger.
    lab = crease_segments(m, [14, -62, 78], [34, -40, 94], 12)
    u, n = np.unique(lab[lab >= 0], return_counts=True)
    parts["ring"] = np.isin(lab, u[(n >= 800) & (n <= 3000)])

    # Pendant: one segment at a shallower crease.
    parts["pendant"] = at(m, crease_segments(m, [-36, -46, 152], [-10, -22, 180], 8), [-24, -34.7, 166.4])

    # Beads: necklace and earrings, minus the baby's face; drop flecks smaller than a bead.
    vm = bead_mask(m)
    fm = (vm[F].sum(1) >= 2) & ~BABY_FACE(C)
    lab = components(len(F), adj[fm[adj[:, 0]] & fm[adj[:, 1]]])
    fm &= np.bincount(lab[fm], minlength=lab.max() + 1)[lab] >= 150
    ear = np.zeros(len(F), bool)
    for lo, hi in EAR_BOXES:
        ear |= inbox(C, [lo[0], lo[1], 193], hi)
    parts["earrings"] = fm & ear
    parts["necklace"] = fm & ~ear

    gold = np.logical_or.reduce(list(parts.values()))
    info = {k: {"faces": int(v.sum()), "area_mm2": round(float(A[v].sum()), 1),
                "centroid": [round(float(x), 1) for x in (C[v] * A[v, None]).sum(0) / A[v].sum()]}
            for k, v in parts.items()}
    np.save(os.path.join(a.out, "gold_centres.npy"), C[gold].astype(np.float32))
    np.savez_compressed(os.path.join(a.out, "deco_parts.npz"), **parts)
    info["total"] = {"faces": int(gold.sum()), "area_mm2": round(float(A[gold].sum()), 1)}
    json.dump(info, open(os.path.join(a.out, "deco_parts.json"), "w"), indent=1)
    print(json.dumps({k: v["area_mm2"] for k, v in info.items()}), "faces", int(gold.sum()),
          "area", round(float(A[gold].sum()), 1))


if __name__ == "__main__":
    main()
