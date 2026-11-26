# Leonida Fieldnotes v2 — Build Report

Built 2026-11-26. v2 is a WebGL rebuild of the v1 Leaflet app in a new repo
(`seanebones-lang/leonida-fieldnotes-v2`). **Nothing was published** — v1
stays live at gtavi.nexteleven.dev until v2 beats it in a side-by-side
check. Benchmark: State of Leonida's feature set, matched from openly
licensed sources only (GTADB CC BY 4.0, our own basemap, Rockstar poster
under fan use). No State of Leonida data, tiles or code were touched.

## Architecture

- **Engine**: MapLibre GL JS 4.7.1, vendored (`dist/vendor/maplibre-gl.js`,
  `maplibre-gl.css`, BSD-3 license bundled). No runtime CDN anywhere: the
  Noto Sans glyph ranges used by cluster-count labels are vendored too
  (`dist/vendor/glyphs/Noto Sans {Regular,Bold}/0-255.pbf`, from the
  MapLibre demo-tile font service).
- **Coordinate bridge**: the flat 32,768² canonical world rides MapLibre's
  lng/lat engine — longitude linear in worldX, latitude through the inverse
  Mercator — so MapLibre's projection reproduces the exact linear pixel
  grid the tile pyramids were rendered on. Raster tile requests at
  MapLibre zoom *z* are the same tiles v1's Leaflet grid requested at
  zoom *z* (tileSize 1024 sources). The official poster rides the same
  bridge at 1/8192 world scale; its tile folders/files were renumbered
  −2/−1/0 → 1/2/3, tile bytes untouched. Pins reach the poster through
  v1's affine+IDW warp grids, ported verbatim (`gridAt`).
- **Rendering**: one GeoJSON `places` source (GPU clustering,
  clusterMaxZoom 4, radius 46) feeding layered circle layers — cluster
  glow/bubble/count, pin glow, an invisible 17px hit layer (mobile tap
  targets), category-coloured pin discs with white core, found-state
  dimming + mint stroke. Selection lives in its own source (halo + ring)
  so it renders at any zoom even inside a cluster. The plan/trail line is
  a GPU line layer with glow underlay. Camera moves are `easeTo` /
  `fitBounds`, reduced-motion aware.
- **State**: identical to v1 — same localStorage key
  `leonida-fieldnotes:v1`, same `validateBackup` (copied verbatim,
  including the `pinOff` validation and the uiVersion migration), same
  merge-on-import semantics, same premium key and hash check
  (`dist/premium.js` is v1's file, byte-identical).
- **Layout/DOM**: v1's `index.html` with only the two vendor asset lines
  changed; v1's `styles.css` with Leaflet rules replaced by MapLibre
  equivalents and a full 21-category colour palette for list/panel
  symbols. All data strings still render via `textContent` — no
  `innerHTML` with data anywhere (MapLibre Popup uses `setDOMContent`).
- **Offline**: `scripts/prepare-offline.mjs` + `sw.template.js` carried
  from v1; the CORE list swaps Leaflet for MapLibre + the two glyph
  files. Generated cache id: `leonida-fieldnotes-82ceaeb7650a7b6c`.

## v1-parity checklist

| Feature | Status | Notes |
|---|---|---|
| Three basemaps + toggle, persisted | Ported | Layer visibility on one map; camera survives canonical↔canonical switches, refits across the official warp like v1 |
| Fieldnotes day/night tile swap | Ported | `setTiles` on the fieldnotes source |
| Night dimming on official/community | Ported (approx.) | CSS filter on the GL canvas; in v1 only tiles dimmed, in v2 pins dim with the base — visually coherent, noted as a difference |
| GPU clustering | Ported + upgraded | Native MapLibre clustering replaces v1's hand-rolled pixel-grid DOM clusters; click expands to expansion zoom |
| Category glow pins | Upgraded | GPU circles, sunset-spectrum `CAT_COLORS` match expression; v1 used DOM glyph pins |
| Pin category toggles (`pinOff`) | Ported | Same state model, Pins panel, switches, solo-tap names, sidebar chips as solo shortcuts, hidden-count badge |
| Unified fuzzy search + grouped type-ahead | Ported | Same scoring, groups (Guides/Areas/Places), keyboard navigation |
| Sidebar results list (600 cap) | Ported | Identical rendering code |
| Details panel | Ported | Same content, honest `nameKind` labelling, position-confidence line, precision notes |
| In-game + real-life photos side by side | Ported (code) | Both `photo` and `photoRl` render with CC BY 4.0 credits — **but the current dataset carries `photoRl` on 0 records** (see Open items) |
| "What's near here" | Ported | Same nearest-6 computation in world units |
| Found / favourite / notes | Ported | Same toggles, same notebook writes |
| Private pins (place on map, dialog, delete) | Ported | Placement converts through the active base incl. the official inverse warp |
| Plan list + line | Ported | GPU line replaces Leaflet polyline; same 30-stop cap |
| Trails (Easter Egg Trail, Free Car Run) | Ported | Same selection + nearest-neighbour ordering |
| Guide progress box | Ported | Identical |
| Area picker + fit | Ported | |
| `#place=<id>` deep links + copy link | Ported | |
| Backup export / import-merge / raw export / reset | Ported | `validateBackup` verbatim; import/reset now also re-sync base layers + day/night tiles in place (v1 recreated the map) |
| Storage warnings, unreadable-notebook protection | Ported | Verbatim |
| Cross-tab storage sync | Ported | Verbatim |
| Premium dialog + dashboard | Ported | `premium.js` byte-identical; same dialog DOM ids |
| Static guides/acts/tips/privacy pages | Carried over | Byte-identical files |
| Service worker offline | Ported | See Architecture |
| Hover name tooltip | Ported | MapLibre Popup replaces Leaflet tooltip |
| Keyboard-focusable map pins | **Missing** | GPU pins are not DOM-focusable (v1's Leaflet markers were). Mitigation: the results list and search give full keyboard access to every place. Accepted for the graphics leap; revisit if a11y review demands it |
| Selected pin excluded from clusters | **Different** | GPU clustering can't exclude one feature; the selection halo source draws on top of any cluster instead |

## Validation evidence

- `node --check` passes: `dist/app.js`, `dist/premium.js`, `dist/sw.js`.
- **DOM audit**: all 59 static `$('#id')` references in app.js and all 7 in
  premium.js resolve to ids present in index.html; the two dynamically
  built ids (`hide-found`, `favorites-only`) are present; every layer id
  referenced by event handlers exists in the style, and every layer's
  source exists.
- **Coordinate math** (Node, replicating app.js functions exactly):
  canonical round-trip error < 0.01 world units on sample points incl.
  corners; ML tile x/y == Leaflet-grid tile x/y for zooms 0–4 across the
  world; poster round-trip error < 0.05 px; poster tile at official zoom
  oz == ML tile at zoom oz+3 for all poster zooms.
- **Data integrity**: sha256 of all six `dist/data/*.json` files identical
  to v1 (community, guides, map-config, premium-codes, acts, tips).
- **Tiles**: all 509 JPGs hash-verified against v1 — 445 canonical-tree
  files identical in place; 64 official tiles identical after the zoom
  renumber. `guides/`, `acts/`, `tips/` trees diff-clean vs v1.
- **HTTP smoke test** (local `python3 -m http.server` over `dist/`): 200
  for index, both app scripts, styles, sw.js, MapLibre JS/CSS, both glyph
  PBFs (via %20 URLs), all data files, brand SVG, og-image, sample tiles
  from every base incl. official zooms 1/2/3, and sample static pages.
- **Media card**: `dist/assets/og-image.jpg` is byte-identical to the
  provided `media-card-poster.jpg`; index.html's og:image/twitter:image
  already point at it.
- **Not done**: no real-browser/WebGL render test was possible from this
  environment. First side-by-side check should confirm: cluster rendering
  and count glyphs, tile alignment at several zooms on all three bases,
  day/night swap, pin tap targets on a phone viewport, and the official
  warp overlay against v1.

## Open items

1. **`photoRl` coverage is 0 in the current dataset.** The details panel
   renders real-life counterpart photos wherever a record carries
   `photoRl`, but v1's `dist/data/community.json` as copied contains no
   `photoRl` fields (the v1 photo-pair patch had not landed in dist when
   v2 branched). When the v1 data gains `photoRl`, drop the new
   community.json into v2's `dist/data/` unchanged — no code change
   needed.
2. **Browser render QA** (above) before any cutover decision.
3. **Glyph ranges**: only 0–255 is vendored; cluster labels are digits and
   "k" abbreviations, fully covered. If future symbol layers need more
   characters, vendor the matching ranges.
4. **SEO regeneration**: v2 ships v1's generated static pages; regenerating
   them after a data change uses v1's `scripts/build-seo.mjs` (not copied;
   the data files it consumes are here and byte-identical).

## Repository notes

The GitHub push tooling carries text files only, so the binary assets are
**not in the repo**: all `*.jpg` map tiles, `dist/assets/og-image.jpg`,
and the two glyph `*.pbf` files exist in the local build and must travel
with `dist/` at publish time — exactly how v1's repo treats its tile
JPGs. Everything else (HTML/CSS/JS/JSON/SVG, including the vendored
MapLibre JS/CSS) is pushed. The repo's initial README (from repo
creation) is replaced by this project's README.md.

## Post-build data refresh (Baxter, 2026-11-26)

- dist/data/community.json replaced with v1's photo-patched dataset (sha256 da15599cb28ae16e…): 2,106 pins with in-game photos, 1,346 with real-life photos, 1,211 with both. The side-by-side photo rendering described above now has full data behind it — no code change was needed.
- Service worker restamped: cache leonida-fieldnotes-b546fa6f53066099.
