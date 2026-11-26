# Leonida Fieldnotes v2 — WebGL rebuild

A free, unofficial browser-local GTA VI fan companion. Static HTML/JavaScript;
no accounts, paid API, analytics integration or remote notebook writes.

**v2 is the same product on a new engine.** v1 (Leaflet, DOM markers) stays
live at gtavi.nexteleven.dev until v2 beats it; v2 replaces the renderer with
MapLibre GL JS (WebGL) — GPU clustering, GPU pin layers, smooth camera moves —
while keeping the data, the notebook format and every feature identical.
A v1 user's notebook loads in v2 untouched: same localStorage key
(`leonida-fieldnotes:v1`), same state shape, same backup format.

## The graphics leap

- **GPU GeoJSON clustering** (`places` source, clusterMaxZoom 4) with
  sunset-gradient cluster bubbles and vendored-glyph count labels — no DOM
  marker churn, no re-render on pan/zoom.
- **Category-coloured glow pins**: 21 categories, each with a colour from the
  GTA VI sunset spectrum, rendered as layered GPU circles (glow halo, coloured
  disc, white core). Found pins dim and take a mint stroke; the selected pin
  gets a halo + ring from its own source, so it stays visible at any zoom.
- **Smooth fly-to** camera moves (easeTo / fitBounds), reduced-motion aware.
- **Hover tooltips** via MapLibre Popup (DOM text nodes only — never markup).
- **Self-contained**: MapLibre GL JS 4.7.1 and the Noto Sans glyph ranges used
  by cluster counts are vendored under `dist/vendor/`. No runtime CDN.

## How the flat world rides a geographic engine

The Fieldnotes world is a flat 32,768 × 32,768 plane, not a globe. Pins and
tile pyramids live in canonical world units; MapLibre speaks lng/lat.
The bridge (`worldToLngLat` / `lngLatToWorld` in `dist/app.js`):

- longitude is linear in worldX;
- latitude is chosen through the inverse Mercator, so MapLibre's own
  projection lands every point — and every raster tile — exactly on the
  linear pixel grid the pyramids were rendered on
  (pixelX = (worldX + 16384) · 2^z / 32, pixelY = (16384 − worldY) · 2^z / 32,
  tileSize 1024). Tile requests at MapLibre zoom z are byte-for-byte the
  tiles v1's Leaflet grid requested at zoom z; the alignment is verified
  numerically for zooms 0–4 in the build report.

The official poster base rides the same bridge at 1/8192 of the world, so
poster tile zooms −2/−1/0 become MapLibre tile zooms 1/2/3. Only the folder
and file-name zoom prefixes changed (`official/1|2|3/`); every tile byte is
identical to v1. Pins reach the poster through the same measured affine+IDW
warp as v1 — "right neighbourhood, approximate", and the app says so.

## Content honesty — three basemaps (unchanged from v1)

1. **Fieldnotes (default)** — our own custom map of Leonida, drawn by
   NextEleven. Geography vectorised from the July 2025 community
   reconstruction and cross-checked town-by-town against Rockstar's official
   printed map; rendered by our own pipeline into day and night tile
   pyramids in a GTA VI sunset/neon theme. Canonical world space: pins are
   native, no transform. 203 tiles per edition, zooms 0–4.
2. **Official** — Rockstar's official printable map of Leonida ("The Great
   State of Leonida", released 2026-11-19), tiled from the cropped poster.
   © Rockstar Games; shown under fan use, not affiliated, removable on
   request. Pins reach it through a measured affine+IDW warp fitted on 58
   cross-checked control points (leave-one-out town median 146.8 poster
   px — the honest label is "right neighbourhood, approximate").
3. **Community** — the original July 2025 YANIS / gta6map reconstruction,
   kept for its street detail. Its source expressly permits reuse of its
   tiles as public domain; that declaration is not an independent
   clearance of all third-party rights.

The landmark pins come from the GTADB.ORG dataset — GTA VI Landmarks Data,
CC BY 4.0 (attribution: "GTA VI Landmarks Data (CC BY 4.0) —
https://map.gtadb.org"). The catalogue holds 4,553 community placements:
1,151 carry an in-game name, 1,386 carry a real-world counterpart name (the
details panel labels them exactly that — the in-game name is not yet
recorded), and 2,016 are unnamed points. All community placements are
approximate and none is personally verified in-game. Per-place photos are
GTADB URLs under the same CC BY 4.0 credit; where a record carries both an
in-game photo and a real-life counterpart photo, the details panel shows
them side by side, labelled.

The separate sourced guide corpus contains 167 entries (Easter eggs, hidden
locations, free vehicles, garages, money routes, collectible sets, services).
Most have no reliable coordinate evidence and remain deliberately unpinned —
a guide without coordinates is listed, never given a guessed pin.

## Guide pages, acts and tips (SEO)

Static, indexable pages generated for v1 from the datasets are carried over
unchanged: one page per guide entry plus category hubs under `dist/guides/`,
an acts progression guide under `dist/acts/` (from `dist/data/acts.json`),
play tips under `dist/tips/` (from `dist/data/tips.json`), and
`dist/privacy.html`. Their source data files ship byte-identical in
`dist/data/`, so they can be regenerated with v1's `scripts/build-seo.mjs`
after any dataset change.

## Premium

The map and all guides are free forever. Premium ($6.99 one-time) unlocks the
completion dashboard. `dist/premium.js` is v1's file, unchanged: unlock codes
are validated in the browser against SHA-256 hashes in
`dist/data/premium-codes.json`; no plaintext code ever ships. Unlock state
lives under `leonida-fieldnotes:premium`, separate from the notebook key.

## Local preview

```sh
node scripts/prepare-offline.mjs
python3 -m http.server 3151 --bind 127.0.0.1 --directory dist
```

Run the offline preparation after changes to HTML, JavaScript, CSS or data.
Its content-derived cache identifier updates application assets without
resetting `leonida-fieldnotes:v1`, the separate notebook storage key. Do not
couple app cache cleanup to deleting user progress.

## Behavior to preserve

- Pan, zoom, search, categories and cluster selection.
- Three-way basemap toggle (Fieldnotes default / Official / Community),
  persisted as `settings.baseMap`; old notebooks without it default to
  Fieldnotes. Day/night swaps the custom tile set on the Fieldnotes base.
- Per-category pin toggles: a `pinOff` array over the 21 categories, a Pins
  panel with switches, solo-tap on a category name, and sidebar chips as
  solo shortcuts — all persisted in the notebook.
- Fuzzy type-ahead search over all community places and all guides,
  grouped by kind, combined with the active category filter; every place
  card carries a "What's near here" list; guide-category found/total
  progress in the explore sidebar; the Easter Egg Trail and Free Car Run
  preload as editable plans. Nothing is hidden or spoiler-gated — the map
  is a finder.
- `#place=<id>` deep links; always-visible global search and area selector;
  all discovery names visible.
- Guides without reliable positions stay unpinned; area fitting uses
  existing community points rather than guessed guide coordinates.
- Version 1 notebooks migrate display preferences without changing
  discoveries.
- Found/favorite/notes/private pins and a straight-line planning list.
  Planning lines are not road directions, and no fictional units are
  called GPS distances.
- Local persistence with honest unavailable-storage warnings. An unreadable
  existing notebook is never overwritten; the original raw data can be
  exported.
- Strict, transactional backup merge. Keep existing nonempty notes on
  conflicts; reject invalid or over-limit imports without partially
  mutating progress.
- Source and imported strings render as text, never executable markup. No
  notebook data or private pin appears in a shared public location link.

## Publishing

v2 is **not published**. It ships only when it beats v1 in a side-by-side
check. The exact existing Sites identity is in `.openai/hosting.json` —
reuse it; never create another site to retry publication.

Do not commit credentials, screenshots or QA data.
MapLibre GL JS is BSD-3-Clause; its license is bundled in
`dist/vendor/MAPLIBRE-LICENSE.txt`. The vendored Noto Sans glyph ranges come
from the MapLibre demo-tile font service (fonts: Google Noto Sans, OFL).
Tile JPGs and `dist/assets/og-image.jpg` are binary assets that live outside
this repository (the push tooling carries text only), exactly as in v1.
