#!/usr/bin/env python3
"""
Regenerate the georeferenced chart crop used by the C8 Diversion Trainer.

Given a CAA "VFR Chart - ICAO - Taipei FIR - 1:500,000" PDF, this fits the
Mercator transform from the graticule labels on the main Taiwan panel, crops
the southern region, and writes a quantised PNG plus a JSON sidecar holding
the bounds and provenance.

    pip install pymupdf pillow
    python make_chart.py chart.pdf -o assets/

Why fit rather than hardcode: the sheet is reissued every AIRAC cycle and the
panel can shift. The fit takes a second and tells you immediately if the
layout changed — watch the residuals it prints.
"""

import argparse
import base64
import json
import math
import os
import re
import sys

import pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

# Region the trainer needs: RCYU in the north through RCLY and Eluanbi.
CROP = dict(lon0=119.85, lon1=121.90, lat0=21.75, lat1=24.30)

# The sheet carries five panels. Graticule labels from the Kinmen/Matsu insets
# must not contaminate the fit, so labels are clustered by position and only
# the main panel's own column (latitudes) and row (longitudes) are used.
DEG = re.compile(r"^(\d{1,3})°(?:(\d{2})')?([NE])$")


def merc(lat):
    """Spherical Mercator northing, in degrees, matching the chart."""
    return 180 / math.pi * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def inv_merc(y):
    return math.degrees(2 * math.atan(math.exp(math.radians(y))) - math.pi / 2)


def linfit(xs, ys):
    n = len(xs)
    sx, sy = sum(xs), sum(ys)
    sxx = sum(v * v for v in xs)
    sxy = sum(a * b for a, b in zip(xs, ys))
    b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return (sy - b * sx) / n, b


def best_cluster(points, along):
    """points: [(value, cx, cy)]. Cluster on the axis the labels share, then
    return the fullest cluster, breaking ties toward the larger coordinate —
    the main panel is the rightmost/lowest set on the sheet."""
    idx = 1 if along == "x" else 2
    groups = {}
    for p in points:
        groups.setdefault(round(p[idx] / 6), []).append(p)
    return max(groups.values(), key=lambda g: (len(g), max(p[idx] for p in g)))


def collect_labels(page):
    """Return {lon: x_pt}, {lat: y_pt} for the main Taiwan panel."""
    lon_pts, lat_pts = [], []
    for x0, y0, x1, y1, text, *_ in page.get_text("words"):
        m = DEG.match(text.strip())
        if not m:
            continue
        deg, minutes, hemi = m.groups()
        value = int(deg) + (int(minutes) / 60 if minutes else 0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        (lon_pts if hemi == "E" else lat_pts).append((value, cx, cy))

    # longitude labels run along a horizontal edge → cluster on y
    # latitude labels run up a vertical edge      → cluster on x
    lons = {v: cx for v, cx, cy in best_cluster(lon_pts, "y")}
    lats = {v: cy for v, cx, cy in best_cluster(lat_pts, "x")}
    return lons, lats


def fit(page, verbose=True):
    lons, lats = collect_labels(page)
    if len(lons) < 3 or len(lats) < 4:
        sys.exit(
            f"only found {len(lons)} longitude and {len(lats)} latitude labels "
            "in the main panel's graticule — the sheet layout probably changed"
        )
    c, d = linfit(list(lons), [lons[k] for k in lons])
    a, b = linfit([merc(k) for k in lats], [lats[k] for k in lats])

    if verbose:
        rl = [lons[k] - (c + d * k) for k in sorted(lons)]
        rt = [lats[k] - (a + b * merc(k)) for k in sorted(lats)]
        print(f"  lon: x = {c:.6f} + {d:.6f}·lon      "
              f"max residual {max(map(abs, rl)):.3f} pt  ({len(lons)} labels)")
        print(f"  lat: y = {a:.6f} + {b:.6f}·Ymerc    "
              f"max residual {max(map(abs, rt)):.3f} pt  ({len(lats)} labels)")
        print(f"  anisotropy |b|/d = {abs(b)/d:.5f}   (corner-fitting absorbs this)")
        if max(map(abs, rl + rt)) > 1.0:
            print("  WARNING: residuals above 1 pt — check the panel filter")

    return (lambda lon: c + d * lon), (lambda lat: a + b * merc(lat)), (a, b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="CAA VFR chart PDF")
    ap.add_argument("-o", "--outdir", default=".", help="output directory")
    ap.add_argument("--name", default="chart-south", help="output basename")
    ap.add_argument("--width", type=int, default=1400, help="output width in px")
    ap.add_argument("--colors", type=int, default=128, help="palette size")
    ap.add_argument("--zoom", type=float, default=1.6, help="render zoom before downscale")
    ap.add_argument("--base64", action="store_true",
                    help="also write a .b64.txt for inlining into a single-file build")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    doc = pymupdf.open(args.pdf)
    page = doc[0]
    print(f"sheet: {page.rect.width:.0f} × {page.rect.height:.0f} pt")

    px, py, (ya, yb) = fit(page)
    x0, x1 = px(CROP["lon0"]), px(CROP["lon1"])
    y0, y1 = py(CROP["lat1"]), py(CROP["lat0"])
    print(f"  crop: {x1-x0:.0f} × {y1-y0:.0f} pt")

    pix = page.get_pixmap(clip=pymupdf.Rect(x0, y0, x1, y1),
                          matrix=pymupdf.Matrix(args.zoom, args.zoom))
    raw = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    h = round(raw.height * args.width / raw.width)
    img = raw.resize((args.width, h), Image.LANCZOS).quantize(
        colors=args.colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)

    png = os.path.join(args.outdir, args.name + ".png")
    img.save(png, optimize=True)
    size_kb = os.path.getsize(png) / 1024
    print(f"  wrote {png}  {args.width}×{h}  {size_kb:.0f} KB")

    meta = {
        "source": os.path.basename(args.pdf),
        "projection": "spherical Mercator, matches CAA sheet",
        "bounds": CROP,
        "pixels": {"width": args.width, "height": h},
        "sheet_transform": {
            "comment": "PDF points on the full sheet; Ymerc in degrees",
            "x_pt": [px(0.0), px(1.0) - px(0.0)],
            "y_pt": [ya, yb],
        },
        "note": ("Place by projecting the two opposite corners; the mapping is "
                 "linear in (lon, Ymerc) so interior points are exact."),
    }
    js = os.path.join(args.outdir, args.name + ".json")
    with open(js, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"  wrote {js}")

    if args.base64:
        b64 = os.path.join(args.outdir, args.name + ".b64.txt")
        with open(png, "rb") as f, open(b64, "w") as g:
            g.write(base64.b64encode(f.read()).decode())
        print(f"  wrote {b64}  {os.path.getsize(b64)/1024:.0f} KB")


if __name__ == "__main__":
    main()
