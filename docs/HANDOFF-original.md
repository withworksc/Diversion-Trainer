# C8 Diversion Trainer — Handoff

A single-file browser tool that generates diversion problems for the
cross-country route RCFN → RCKW via the C8 VFR corridor, and shows the model
answer against a georeferenced crop of the CAA VFR chart.

Current deliverable: `diversion-trainer.html`, ~590 lines, no build step, no
dependencies. Opens by double-click. Ready to serve from GitHub Pages as-is.

This document is for whoever takes it from prototype to project.

---

## 1. What the tool does

The user is a cadet pilot practising the diversion drill an examiner gives
mid-route on the XC check. One press of **出題** produces a scenario; the user
works it on a kneeboard; **顯示答案** reveals the model answer. There is no
grading — that was a deliberate choice by the user.

The eight answer slots come directly from the school's drill:

1. Current time
2. Current position
3. Turn or Hold
4. Heading
5. Altitude
6. Time and distance
7. Fuel required & remain
8. Revise to ATC and Brief to IP

A stopwatch starts when the question appears and stops on reveal. Green under
3:00, amber 3:00–5:00, red beyond.

---

## 2. Domain data — the part that is expensive to rebuild

Most of the value in this file is the aeronautical data, not the code. Several
figures were measured off the chart PDF and corrected things that were
initially wrong. Preserve these.

### 2.1 Chart georeferencing

The background raster is a crop of *VFR Chart – ICAO – Taipei FIR – 1:500,000,
20 Sep 2025*. Panel 1 (the main Taiwan sheet) was fitted from its graticule
label positions, extracted with PyMuPDF from the page text layer.

```
x_pt = -72921.123214 + 631.132143 · lon
y_pt =  16811.734086 - 627.537027 · Ymerc(lat)

Ymerc(lat) = (180/π) · ln( tan(π/4 + lat/2) )      # spherical, degrees
```

Residuals against all eight latitude labels and all seven longitude labels are
under 0.15 pt on a 4309 × 3033 pt sheet. The y and x scale factors differ by
0.57%, so the chart is very slightly anisotropic — irrelevant, because the
raster is placed by corner-fitting, which absorbs it exactly (see §3.3).

Crop actually used: `lon 119.85–121.90`, `lat 21.75–24.30`. That covers RCYU in
the north through RCLY and Eluanbi in the south, with margin.

### 2.2 Navaids — one important correction

**HCN (Hengchun VOR, 113.7) is not at Hengchun airport.** Its compass rose on
the chart sits near Eluanbi at the southern tip, roughly 11 NM southeast of
RCKW. Measured centre: **21.930 N / 120.840 E**. An earlier version of this
tool used the airport coordinates and every HCN radial/DME in it was wrong.

GID (Ludao VOR, 116.9) is at the Green Island aerodrome, **22.673 N /
121.465 E**.

VOR selection rule in the tool: positions south of roughly Daren use HCN,
north of it use GID, because the Central Range shadows HCN from the northern
half of the route.

### 2.3 Magnetic variation

The chart's isogonic lines put **3.5°W** through the Hengchun peninsula and
**4.0°W** further north. The tool uses a flat 4°W (`var VAR`) and says so in
the footnote. A per-position interpolation would be more correct and is a
reasonable enhancement; it is not what the school teaches.

### 2.4 The C8 chain

Nine coastal checkpoints, south → north, stored as `CHAIN` in base (on-shore)
coordinates:

| key | name | lat | lon |
|---|---|---|---|
| ELB | 鵝鑾鼻 | 21.900 | 120.850 |
| JLS | 佳樂水 | 22.033 | 120.850 |
| JP | 九棚 | 22.100 | 120.883 |
| XH | 旭海 | 22.183 | 120.867 |
| DR | 達仁 | 22.275 | 120.867 |
| DW | 大武 | 22.350 | 120.892 |
| JL | 金崙 | 22.533 | 120.967 |
| TML | 太麻里 | 22.608 | 121.008 |
| ZB | 知本 | 22.700 | 121.050 |

At load an IIFE shifts every point **1 NM seaward** (`OFFSHORE`), along the
local coast normal, because the corridor is flown just off the coastline and
not overland. The normal is taken from the neighbouring points and rotated 90°
clockwise from the northbound tangent, so the bends at the southern tip come
out right.

Scenario positions are drawn from a **continuous** fractional index `fi` along
this chain (1.2 to 8.0), not snapped to checkpoints, and described relative to
the nearest one: `大武外海`, `旭海南方 2 NM 外海`.

### 2.5 Aerodromes

Values taken from the chart data blocks (`elev - runway hundreds of metres`,
`L` = lit).

| ICAO | chart block | elev ft | longest rwy | lights | airspace |
|---|---|---|---|---|---|
| RCFN 豐年 | `143 L H24` | 143 | 2,400 m | yes | Taitung D GND-3000 |
| RCGI 綠島 | `28 - H9` | 28 | 900 m | **no** | Ludao E GND-2500 |
| RCLY 蘭嶼 | `44 - H11` | 44 | 1,100 m | **no** | Lanyu E GND-2500 |
| RCKW 恆春 | `46 - H17` | 46 | 1,700 m | **no** | Hengchun E GND-2500 |
| RCKH 高雄 | `31 L H32` | 31 | 3,200 m | yes | Kaohsiung D GND-5000 |
| RCYU 花蓮 | `51 L H28` | 51 | 2,800 m | yes | Hualien D GND-3000 |

The three unlit fields are **day-only**. The tool flags this in the fuel answer
but does **not** yet compute sunset — see §5.

### 2.6 VFR corridors, read off the chart

| corridor | route |
|---|---|
| C8 | RCFN ↔ 太麻里 ↔ 大武 ↔ 港仔鼻 ↔ 恆春 (the XC route) |
| C9 | 恆春 ↔ 楓港 ↔ 枋寮 ↔ 東港 ↔ RCKH (west coast) |
| C12 | RCFN north toward RCYU |
| C14 | RCFN ↔ RCGI |
| C16 / C22 | Taitung area ↔ RCLY — two lines, see open question §6 |
| C18 | RCKW ↔ RCLY |
| C20 | RCGI ↔ RCLY |

Corridor altitudes on C8 per the user's own standing notes: southbound
3,000 ft or below, northbound 2,500 ft or below.

### 2.7 Aircraft and fuel model

DA40-NG. Fuel planning uses **6.6 gal/hr** and a **30-minute reserve =
3.3 gal**, matching the endurance rule the user applies on ICAO flight plans
(gallons ÷ 6.6). Remaining fuel at the moment of diversion is generated as
17.5–23 gal for a standard tank (≈65% of scenarios) and 25.5–32 gal for long
range.

---

## 3. Code map

Everything lives in `diversion-trainer.html`: one `<style>` block, one
`<script>` IIFE. Section comments already mark the boundaries.

### 3.1 Sections in order

| section | contents |
|---|---|
| constants | `VAR`, `BURN`, `RESERVE` |
| data | `CHAIN`, `WPT`, `VOR`, `AD` |
| geometry | `rad`, `deg`, `dxy`, `dist`, `trueBrg`, `mag`, `fmt3` |
| offshore IIFE | shifts `CHAIN` seaward by `OFFSHORE` |
| route | `makePos`, `buildRoute`, `crossesRidge` |
| generation | `WEIGHT`, `pickDest`, `TRIGGERS`, `makeScenario` |
| calculation | `compute` |
| map | `IMG`, `mercY`, `wx`/`wy`, `makeProj`, `mapSVG` |
| render | `briefHTML`, `legTable`, `ITEMS`, `answers`, `render` |
| clock + wiring | `paint`, `tick`, `idle`, `newQ`, listeners |

Two coordinate systems coexist deliberately:

- **Navigation** — `dxy`/`dist`/`trueBrg` use a local flat-earth approximation
  in nautical miles. This is what produces headings, distances and DME.
- **Display** — `wx`/`wy` use spherical Mercator in degrees, to match the
  chart's projection. Used only by `makeProj` and `mapSVG`.

Do not merge them. The navigation side must stay in NM; the display side must
stay in the chart's projection.

### 3.2 Routing

Currently **always a straight line** from the aircraft to the diversion field
(`buildRoute` returns two points). The user asked for this explicitly: the
exercise is the computation, not terrain avoidance. `crossesRidge` survives
only to append a plain MSA note to the Altitude answer when the direct track
crosses the Central Range (highest spot elevation in that band: 5,538 ft,
大漢山).

An earlier version routed around the coast via the corridors and drew a red ×
on the blocked direct line. That code is gone, but `legTable` and `r.multi`
remain and will render a per-leg table if multi-point routes are reintroduced.

### 3.3 Map rendering

The map is a `<div class="mapwrap">` containing an absolutely positioned
`<img class="chartbg">` and an `<svg class="mapfg">` overlay on top.

**This split matters.** The raster was originally an `<image>` element inside
the SVG, and the page tore visibly while scrolling — the browser re-rasterised
an 837 KB image inside a vector tree on every frame. As a plain `<img>` with
CSS percentage positioning it is decoded once. `contain:paint` on the wrapper
keeps the repaint region bounded. Do not move the raster back into the SVG.

Placement maths: `makeProj` fits the viewport to the scenario's points, then
the image is positioned by projecting its two opposite corners and expressing
them as percentages of the SVG viewBox. Because the projection is linear in
`(lon, Ymerc)` and the chart is linear in the same pair, corner-fitting is
geometrically exact for every interior point — including across the 0.57%
anisotropy noted in §2.1.

The overlay carries no place names. The chart underneath already labels
everything, and a second layer of text just obscured it. What remains: the ND
own-ship chevron (oriented on the pre-diversion track), a 10 NM range ring, the
dashed bearing line to the active VOR, the magenta track, a ring on the
diversion field, a north arrow and a scale bar.

### 3.4 Theme

Palette is taken from the chart itself so the embedded raster does not read as
a foreign patch: page white, panels in chart cream `#F4F0E4` and sea blue
`#DCE9EF`, chrome in corridor blue `#0F4C81`, and a single crimson `#C41E5A`
reserved for answers — the track, the diversion field, the key figures. All
tokens are CSS custom properties in `:root`.

---

## 4. Suggested project shape

The single file has earned its keep as a prototype, but the base64 raster is
1.1 MB of the 1.12 MB file and makes diffs useless. First move:

```
c8-diversion-trainer/
  index.html            # markup + mount point
  src/
    data.js             # CHAIN, VOR, AD, WPT, corridors — the §2 tables
    geo.js              # nav maths + Mercator display projection
    scenario.js         # makePos, makeScenario, TRIGGERS, WEIGHT
    compute.js          # the answer model
    map.js              # mapSVG + image placement
    ui.js               # render, clock, wiring
  styles/app.css
  assets/
    chart-south.png     # the georeferenced crop, external not base64
    chart-south.json    # its lon/lat bounds + provenance
  tools/
    make_chart.py       # regenerates both from a new AIRAC PDF
  HANDOFF.md
  README.md
```

`chart-south.json` should carry the bounds, the AIRAC date, and the fitted
transform, so nothing has to be re-derived by hand when the chart is reissued.

Keep it dependency-free if you can — it runs on a tablet on a kneeboard and
offline. Plain ES modules are enough; no framework is warranted.

---

## 5. Worth building next

Roughly in order of value to the user.

**Daylight check.** Three of six diversion fields have no runway lights. The
scenario already carries a local time; computing sunset for the position turns
"這個場日間限定" from a footnote into a real decision point. Sunset for 22°N
is a short closed-form calculation, no library needed.

**Session log.** Per-question elapsed time, destination, distance. Lets the
user see whether they are actually getting faster. `localStorage` is fine
outside claude.ai.

**Printable kneeboard sheet.** A print stylesheet that lays out N blank
scenarios with the maps, for practising away from a screen. Answers on the
reverse.

**Wind mode.** Removed at the user's request — scenarios now give GS directly.
If it comes back, it should be a toggle, not the default, and the answer must
solve the wind triangle per leg since a diversion changes the track.

**Other routes.** The architecture is C8-specific but not deeply so. A second
corridor needs a new `CHAIN`, its own aerodrome set, and possibly a different
chart crop. `data.js` is the seam.

---

## 6. Open questions for the user

Do not guess at these; ask.

1. **C16 vs C22.** Both run from the Taitung area to Lanyu on the chart. The
   user's own corridor reference card badges C16 as RCFN-relevant and not C22,
   which suggests C16 is the RCFN↔RCLY leg — but this was never confirmed. The
   `AD.RCLY.note` currently hedges with "C16／C22".

2. **Variation.** 4°W flat, or interpolate toward 3.5°W in the south?

3. **Groundspeed range.** Currently 85–160 kt in 5 kt steps. Confirmed as
   realistic by the user but the upper end was a late change.

4. **Trigger list.** Six examiner prompts, one of which is the Hold case. More
   variety, or different ones, would come straight from what examiners
   actually say.

---

## 7. Provenance and limits

The background raster is a crop of a Civil Aviation Administration (MOTC,
Taiwan) publication, embedded for the user's personal flight-training
practice. Keep the AIRAC date visible in the UI — it is currently in the header
subtitle — and regenerate the asset when a new cycle is published;
`tools/make_chart.py` exists for exactly that.

Distances and tracks are computed from coordinates, not measured off the sheet,
and carry roughly 1–2 NM and 2–3° of error against a plotter. The footnote in
the UI says so. This is a practice aid, not a planning tool, and nothing in it
should be used for an actual flight.
