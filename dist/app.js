/* Fieldnotes v2: WebGL engine (MapLibre GL JS). Browser-local progress; no accounts, analytics or remote writes.
   Notebook format is identical to v1: same storage key, same state shape, same backup format. */
(() => {
  'use strict';
  const KEY = 'leonida-fieldnotes:v1';
  const $ = s => document.querySelector(s);
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const symbols = {landmark:'◇',easter:'✦',hidden:'◈',region:'◎',personal:'＋',vehicle:'▣',garage:'⌂',money:'＄',collectible:'❖',service:'⚙',hotel:'▤',residential:'▥',retail:'▦',restaurant:'▧',transportation:'➤',industrial:'⚒',government:'⚖',leisure:'♞',natural:'♣',utilities:'⚡',office:'◫',public:'⚑',agriculture:'♧'};
  const BASES = ['fieldnotes','official','community'];
  const CATS = ['easter','hidden','vehicle','garage','money','collectible','service','hotel','residential','retail','restaurant','transportation','industrial','government','leisure','natural','utilities','office','public','landmark','personal'];
  const CAT_LABELS = {easter:'Easter eggs',hidden:'Hidden places',vehicle:'Free vehicles',garage:'Garages',money:'Money',collectible:'Collectibles',service:'Services',hotel:'Hotels',residential:'Homes',retail:'Retail',restaurant:'Food & drink',transportation:'Transport',industrial:'Industrial',government:'Government',leisure:'Leisure',natural:'Nature',utilities:'Utilities',office:'Offices',public:'Public',landmark:'Landmarks',personal:'My pins'};
  /* Sunset-spectrum category colours, shared by the GPU pin layers. */
  const CAT_COLORS = {easter:'#ff7ad9',hidden:'#ffb25e',vehicle:'#ffd75e',garage:'#67e8f9',money:'#7bf1a8',collectible:'#a78bfa',service:'#2dd4bf',hotel:'#f9a8d4',residential:'#fda4af',retail:'#fbbf24',restaurant:'#fb923c',transportation:'#38bdf8',industrial:'#d6d3d1',government:'#93c5fd',leisure:'#e879f9',natural:'#4ade80',utilities:'#facc15',office:'#818cf8',public:'#f472b6',landmark:'#e2e8f0',personal:'#5eead4'};
  const colorMatch = ['match', ['get','category'], ...CATS.flatMap(c => [c, CAT_COLORS[c]]), '#e2e8f0'];
  const fresh = () => ({schemaVersion:1,uiVersion:2,found:[],favorites:[],notes:{},pins:[],plan:[],revealed:[],pinOff:[],settings:{hideFound:false,spoilers:true,includeUnknown:true,favoritesOnly:false,day:true,baseMap:'fieldnotes'}});
  let state = fresh(), readOnly = false, unreadable = '', catalog = [], byId = new Map(), selected = null;
  let view = 'explore', query = '', area = '', map, config, placing = false, pendingPosition;
  let toastTimer, ready = false, mapReady = false, base = 'fieldnotes', hoverPopup = null;
  const validId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(s) && !['__proto__','constructor','prototype'].includes(s);
  const cleanString = (s, max=5000) => typeof s === 'string' && s.length <= max;
  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== 1) throw new Error('This is not a supported Fieldnotes backup.');
    const d = fresh();
    for (const k of ['found','favorites','plan','revealed']) {
      if (!Array.isArray(raw[k]) || raw[k].length > 2500 || !raw[k].every(validId)) throw new Error('Invalid '+k+' list.');
      d[k] = [...new Set(raw[k])];
    }
    if (raw.pinOff !== undefined) {
      if (!Array.isArray(raw.pinOff) || raw.pinOff.length > CATS.length || !raw.pinOff.every(c=>CATS.includes(c))) throw new Error('Invalid pinOff list.');
      d.pinOff = [...new Set(raw.pinOff)];
    }
    if (!raw.notes || typeof raw.notes !== 'object' || Array.isArray(raw.notes) || Object.keys(raw.notes).length > 2500) throw new Error('Invalid notes.');
    for (const [id,note] of Object.entries(raw.notes)) { if (!validId(id) || !cleanString(note)) throw new Error('Invalid note.'); d.notes[id] = note; }
    if (!Array.isArray(raw.pins) || raw.pins.length > 500) throw new Error('Invalid private pins.');
    const ids = new Set();
    for (const p of raw.pins) {
      if (!p || !validId(p.id) || !p.id.startsWith('personal-') || ids.has(p.id) || !cleanString(p.name,100) || !p.name.trim() || !cleanString(p.note || '') || !Array.isArray(p.position) || p.position.length !== 2 || !p.position.every(n => Number.isFinite(n) && Math.abs(n) <= 16384)) throw new Error('Invalid private pin.');
      ids.add(p.id); d.pins.push({id:p.id,name:p.name.trim(),note:p.note || '',position:[...p.position]});
    }
    if (raw.settings && typeof raw.settings === 'object') {
      for (const k of Object.keys(d.settings)) if (typeof raw.settings[k] === 'boolean') d.settings[k] = raw.settings[k];
      if (BASES.includes(raw.settings.baseMap)) d.settings.baseMap = raw.settings.baseMap;
    }
    // Older notebooks retain discoveries; only obsolete visibility preferences migrate.
    if (raw.uiVersion !== 2) Object.assign(d.settings,{hideFound:false,spoilers:true,includeUnknown:true,favoritesOnly:false,day:true});
    d.settings.spoilers=true;d.settings.includeUnknown=true;
    d.plan = d.plan.slice(0,30);
    return d;
  }
  function toast(text) { clearTimeout(toastTimer); $('#toast').textContent=text; $('#toast').hidden=false; toastTimer=setTimeout(()=>$('#toast').hidden=true,4200); }
  function warnStorage(message) { readOnly=true; $('#storage-warning').textContent=message; $('#storage-warning').hidden=false; $('#save-status').textContent='Temporary session · export to keep changes'; $('#export-raw').hidden=!unreadable; }
  try { const stored=localStorage.getItem(KEY); if(stored) { unreadable=stored; state=validateBackup(JSON.parse(stored)); unreadable=''; } }
  catch { warnStorage('Saved data could not be read. Your old data has not been overwritten. Export it from Backup & restore before clearing or restoring.'); }
  base = state.settings.baseMap || 'fieldnotes';
  function persist() {
    if (readOnly) return false;
    try { localStorage.setItem(KEY,JSON.stringify(state)); return true; }
    catch { warnStorage('This browser cannot save more data. Your current discoveries remain on screen; download a backup to keep them.'); return false; }
  }
  const has = (key,id) => state[key].includes(id);
  function toggle(key,id) { state[key]=has(key,id) ? state[key].filter(x=>x!==id) : [...state[key],id]; persist(); render(); }
  function currentPlaces() {
    return [...catalog,...state.pins.map(p=>({...p,category:'personal',region:'Your private placement',hint:p.note,description:p.note,sourceName:'Your notebook',confidence:'personal',spoiler:false,hiddenByDefault:false}))];
  }
  const secret = p => p.category === 'easter' || p.category === 'hidden';
  const revealed = () => true; // All available discovery names are visible. Legacy backup fields remain compatible.
  const displayName = p => revealed(p) ? p.name : (p.category==='easter' ? 'An Easter egg to uncover' : 'A hidden place to uncover');
  function filtered() {
    const q=normalize(query).trim();
    return currentPlaces().filter(p=>{
      if(area && p.areaKey!==area) return false;
      if(view==='secrets' && !secret(p)) return false;
      if(view==='notebook' && !(has('found',p.id)||has('favorites',p.id)||state.notes[p.id]||p.category==='personal')) return false;
      if(state.pinOff.includes(p.category)) return false;
      if(state.settings.hideFound && has('found',p.id)) return false;
      if(state.settings.favoritesOnly && !has('favorites',p.id)) return false;
      const hay=normalize([p.name,p.region,p.areaKey,p.sourceLabel,p.sourceCategory,p.category,({easter:'Easter eggs',hidden:'Hidden places',landmark:'Landmarks',region:'Areas regions',personal:'My pins',vehicle:'Free vehicles cars standout',garage:'Garages properties storage safehouse',money:'Money making cash selling payouts',collectible:'Collectibles sets',service:'Services unlocks tools apps',hotel:'Hotels lodging motels',residential:'Homes houses apartments residential',retail:'Shops stores retail commercial',restaurant:'Restaurants food dining fast food',transportation:'Transport transit stations airport trains buses',industrial:'Industrial factories warehouses',government:'Government civic offices',leisure:'Leisure entertainment nightlife',natural:'Nature parks lakes water',utilities:'Utilities power water services infrastructure',office:'Offices business',public:'Public civic churches schools',agriculture:'Farms agriculture rural'})[p.category],p.hint,...(p.tags||[])].filter(Boolean).join(' '));
      return !q || q.split(/\s+/).every(term=>hay.includes(term));
    }).sort((a,b)=>{const rank=p=>q&&normalize(p.name)===q?0:q&&normalize(p.name).startsWith(q)?1:p.hiddenByDefault?3:2;return rank(a)-rank(b)||a.name.localeCompare(b.name);});
  }
  const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  const areaKey = value => normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  function refreshIndex() { byId=new Map(currentPlaces().map(p=>[p.id,p])); }

  /* ---------- coordinate bridges ----------
     Canonical space is the Fieldnotes world: worldX/worldY in [-16384, 16384], positions stored [worldY, worldX].
     MapLibre speaks lng/lat, so canonical points ride an affine bridge: longitude is linear in worldX, and
     latitude is chosen through the inverse Mercator so MapLibre's own projection lands every point — and every
     raster tile — exactly on the linear pixel grid the tile pyramids were rendered on
     (pixelX = (worldX + 16384) * 2^z / 32, pixelY = (16384 - worldY) * 2^z / 32 at tileSize 1024). */
  const WORLD = 32768;
  const mercLat = y01 => (2*Math.atan(Math.exp(Math.PI*(1-2*y01))) - Math.PI/2) * 180/Math.PI;
  const mercY01 = lat => { const r = lat*Math.PI/180; return (1 - Math.log(Math.tan(Math.PI/4 + r/2))/Math.PI)/2; };
  function worldToLngLat(position) { // [worldY, worldX] -> [lng, lat]
    return [(position[1] + 16384) * 360 / WORLD - 180, mercLat((16384 - position[0]) / WORLD)];
  }
  function lngLatToWorld(lngLat) { // -> [worldY, worldX]
    return [16384 - mercY01(lngLat.lat) * WORLD, (lngLat.lng + 180) * WORLD / 360 - 16384];
  }
  /* Official poster space: poster pixels (5395 x 7521) mapped onto the same bridge at 1/8192 of the
     MapLibre world, so poster tile zooms -2/-1/0 become MapLibre tile zooms 1/2/3 (folders renamed). */
  const POSTER_SCALE = 8192;
  function posterToLngLat(px, py) { return [px * 360 / POSTER_SCALE - 180, mercLat(py / POSTER_SCALE)]; }
  function lngLatToPoster(lngLat) { return [(lngLat.lng + 180) * POSTER_SCALE / 360, mercY01(lngLat.lat) * POSTER_SCALE]; }

  /* ---------- basemaps & the official-map warp ---------- */
  function gridAt(grid, x, y) {
    const gx=Math.min(Math.max((x-grid.minX)/grid.step,0),grid.nx-1.001);
    const gy=Math.min(Math.max((y-grid.minY)/grid.step,0),grid.ny-1.001);
    const ix=Math.floor(gx), iy=Math.floor(gy), fx=gx-ix, fy=gy-iy;
    const at=(j,i)=>grid.values[j*grid.nx+i];
    const a=at(iy,ix), b=at(iy,ix+1), c=at(iy+1,ix), d=at(iy+1,ix+1);
    return [(a[0]*(1-fx)+b[0]*fx)*(1-fy)+(c[0]*(1-fx)+d[0]*fx)*fy,
            (a[1]*(1-fx)+b[1]*fx)*(1-fy)+(c[1]*(1-fx)+d[1]*fx)*fy];
  }
  // p.position is canonical [worldY, worldX]; returns [lng, lat] for the active base.
  function toDisplay(p) {
    if (!p || !p.position) return null;
    if (base !== 'official') return worldToLngLat(p.position);
    const w = gridAt(config.bases.official.warp.forward, p.position[1], p.position[0]);
    return posterToLngLat(w[0], w[1]);
  }
  function fromDisplay(lngLat) {
    if (base !== 'official') { const w = lngLatToWorld(lngLat); return [Math.round(w[0]), Math.round(w[1])]; }
    const poster = lngLatToPoster(lngLat);
    const w = gridAt(config.bases.official.warp.inverse, poster[0], poster[1]);
    return [Math.round(w[1]), Math.round(w[0])];
  }
  function baseDef() {
    if (base === 'official') return {kind:'official', minZoom:0, maxZoom:6};
    return {kind:'canonical', minZoom:-.75, maxZoom:6};
  }
  function baseBounds() {
    if (base === 'official') {
      const b = new maplibregl.LngLatBounds(posterToLngLat(0, config.bases.official.poster.height), posterToLngLat(config.bases.official.poster.width, 0));
      return b;
    }
    const vb = config.viewBounds;
    return new maplibregl.LngLatBounds(worldToLngLat([vb.minY, vb.minX]), worldToLngLat([vb.maxY, vb.maxX]));
  }
  function baseStyle() {
    const fn = config.bases.fieldnotes[state.settings.day ? 'day' : 'night'];
    const notCluster = ['!', ['has', 'point_count']];
    return {
      version: 8,
      glyphs: 'vendor/glyphs/{fontstack}/{range}.pbf',
      sources: {
        'base-fieldnotes': {type:'raster', tiles:[fn.tileUrl], tileSize:1024, minzoom:0, maxzoom:fn.maxNativeZoom, attribution:config.bases.fieldnotes.attribution || ''},
        'base-official': {type:'raster', tiles:[config.bases.official.tileUrl], tileSize:1024, minzoom:1, maxzoom:3, attribution:config.bases.official.attribution + ' · Pins shown via transform — approximate'},
        'base-community': {type:'raster', tiles:[config.tileUrl], tileSize:1024, minzoom:0, maxzoom:config.maxNativeZoom, attribution:config.bases.community.attribution || ''},
        'places': {type:'geojson', data:{type:'FeatureCollection', features:[]}, cluster:true, clusterRadius:46, clusterMaxZoom:4},
        'plan': {type:'geojson', data:{type:'FeatureCollection', features:[]}},
        'selected': {type:'geojson', data:{type:'FeatureCollection', features:[]}},
      },
      layers: [
        {id:'base-fieldnotes', type:'raster', source:'base-fieldnotes', layout:{visibility: base==='fieldnotes' ? 'visible' : 'none'}, paint:{'raster-fade-duration':150}},
        {id:'base-official', type:'raster', source:'base-official', layout:{visibility: base==='official' ? 'visible' : 'none'}, paint:{'raster-fade-duration':150}},
        {id:'base-community', type:'raster', source:'base-community', layout:{visibility: base==='community' ? 'visible' : 'none'}, paint:{'raster-fade-duration':150}},
        {id:'plan-glow', type:'line', source:'plan', paint:{'line-color':'#ff7ad9','line-width':9,'line-opacity':.22,'line-blur':4}},
        {id:'plan-line', type:'line', source:'plan', paint:{'line-color':'#ff7ad9','line-width':3,'line-opacity':.95,'line-dasharray':[1.6,1.6]}},
        {id:'clusters-glow', type:'circle', source:'places', filter:['has','point_count'], paint:{'circle-color':['step',['get','point_count'],'#e879f9',50,'#ff7ad9',200,'#ffb25e'],'circle-radius':['step',['get','point_count'],24,50,30,200,38],'circle-opacity':.35,'circle-blur':1}},
        {id:'clusters', type:'circle', source:'places', filter:['has','point_count'], paint:{'circle-color':['step',['get','point_count'],'#e879f9',50,'#ff7ad9',200,'#ffb25e'],'circle-radius':['step',['get','point_count'],17,50,22,200,29],'circle-stroke-color':'#ffe4f5','circle-stroke-width':1.5,'circle-opacity':.96}},
        {id:'clusters-count', type:'symbol', source:'places', filter:['has','point_count'], layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Bold'],'text-size':13,'text-allow-overlap':true}, paint:{'text-color':'#33092b'}},
        {id:'pins-glow', type:'circle', source:'places', filter:notCluster, paint:{'circle-color':colorMatch,'circle-radius':14,'circle-opacity':['case',['boolean',['get','found'],false],.18,.5],'circle-blur':1}},
        {id:'pins-hit', type:'circle', source:'places', filter:notCluster, paint:{'circle-color':'#000000','circle-radius':17,'circle-opacity':0}},
        {id:'pins', type:'circle', source:'places', filter:notCluster, paint:{'circle-color':colorMatch,'circle-radius':8.5,'circle-stroke-color':['case',['boolean',['get','found'],false],'#5eead4','#ffffff'],'circle-stroke-width':1.6,'circle-opacity':['case',['boolean',['get','found'],false],.55,1]}},
        {id:'pins-core', type:'circle', source:'places', filter:notCluster, paint:{'circle-color':'#ffffff','circle-radius':2.6,'circle-opacity':['case',['boolean',['get','found'],false],.5,.9]}},
        {id:'selected-halo', type:'circle', source:'selected', paint:{'circle-color':'#ff7ad9','circle-radius':19,'circle-opacity':.26,'circle-blur':1}},
        {id:'selected-ring', type:'circle', source:'selected', paint:{'circle-color':'#ff7ad9','circle-opacity':0,'circle-radius':13,'circle-stroke-color':'#ff7ad9','circle-stroke-width':3}},
      ],
    };
  }
  function placesGeoJSON() {
    const features = [];
    for (const p of filtered()) {
      const dp = toDisplay(p); if (!dp) continue;
      features.push({type:'Feature', geometry:{type:'Point', coordinates:dp},
        properties:{id:p.id, category:p.category, found:has('found',p.id), personal:p.category==='personal'}});
    }
    return {type:'FeatureCollection', features};
  }
  function planGeoJSON() {
    refreshIndex();
    const pts = state.plan.map(id=>byId.get(id)).filter(p=>p&&p.position);
    $('#plan-bar').hidden = pts.length < 1;
    $('#plan-count').textContent = pts.length+' '+(pts.length===1?'stop':'stops');
    if (pts.length < 2) return {type:'FeatureCollection', features:[]};
    return {type:'FeatureCollection', features:[{type:'Feature', geometry:{type:'LineString', coordinates:pts.map(p=>toDisplay(p))}, properties:{}}]};
  }
  function selectedGeoJSON() {
    if (!selected || !byId.has(selected)) return {type:'FeatureCollection', features:[]};
    const dp = toDisplay(byId.get(selected));
    if (!dp) return {type:'FeatureCollection', features:[]};
    return {type:'FeatureCollection', features:[{type:'Feature', geometry:{type:'Point', coordinates:dp}, properties:{id:selected}}]};
  }
  function refreshMapData() {
    if (!mapReady || !map) return;
    map.getSource('places').setData(placesGeoJSON());
    map.getSource('plan').setData(planGeoJSON());
    map.getSource('selected').setData(selectedGeoJSON());
  }
  function syncBaseChrome() {
    document.querySelectorAll('[data-base]').forEach(b=>{const on=b.dataset.base===base;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
    $('.map-shell').classList.toggle('night-dim', base!=='fieldnotes' && !state.settings.day);
    const creditLines = {fieldnotes:'Fieldnotes custom map · drawn by NextEleven · Landmark data © GTADB.ORG contributors, CC BY 4.0',
                         official:'Official map © Rockstar Games · fan use, not affiliated · Pins transformed, approximate',
                         community:'Map data © GTADB.ORG contributors, CC BY 4.0 · Basemap: YANIS / gta6map'};
    $('.map-credit').textContent = creditLines[base];
    const labelLines = {fieldnotes:['LEONIDA, DRAWN BY FIELDNOTES','Our own custom basemap · pins sit exactly where the data puts them'],
                        official:['ROCKSTAR’S OFFICIAL MAP','Pins shown via a measured transform · right neighbourhood, approximate'],
                        community:['COMMUNITY RECONSTRUCTION','Pre-release community map · approximate positions']};
    const ll = labelLines[base];
    $('.map-label').firstChild.textContent = ll[0];
    $('.map-label span').textContent = ll[1];
  }
  function createMap() {
    const def = baseDef();
    map = new maplibregl.Map({
      container:'map', style:baseStyle(), center:[0,0], zoom:0,
      minZoom:def.minZoom, maxZoom:def.maxZoom, maxBounds:baseBounds(),
      attributionControl:{compact:true}, renderWorldCopies:false,
      dragRotate:false, pitchWithRotate:false, touchPitch:false, fadeDuration:120,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({visualizePitch:false, showCompass:false}), 'bottom-right');
    let tileErrors = 0;
    map.on('error', () => { if (++tileErrors === 4) toast('Some map tiles could not load. Your notebook is still available.'); });
    map.on('click', 'clusters', e => {
      if (placing) return;
      const f = e.features && e.features[0]; if (!f) return;
      map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
        if (err) return;
        map.easeTo({center:f.geometry.coordinates, zoom, duration: reducedMotion() ? 0 : 500});
      });
    });
    map.on('click', 'pins-hit', e => {
      if (placing) return;
      const f = e.features && e.features[0]; if (!f) return;
      selectPlace(f.properties.id, false);
    });
    map.on('click', e => {
      if (!placing) return;
      const hits = map.queryRenderedFeatures(e.point, {layers:['pins-hit','clusters']});
      if (hits.length) return;
      pendingPosition = fromDisplay(e.lngLat);
      if (pendingPosition.some(n=>Math.abs(n)>16384)) return toast('Place the pin inside the map.');
      stopPinMode(); $('#pin-name').value=''; $('#pin-note').value=''; $('#pin-dialog').showModal(); $('#pin-name').focus();
    });
    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mousemove', 'pins-hit', e => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features && e.features[0]; if (!f) return;
      const p = byId.get(f.properties.id); if (!p) return;
      if (!hoverPopup) hoverPopup = new maplibregl.Popup({closeButton:false, closeOnClick:false, offset:20, className:'fn-tip'});
      const label = make('span','',displayName(p));
      hoverPopup.setLngLat(e.lngLat).setDOMContent(label).addTo(map);
    });
    map.on('mouseleave', 'pins-hit', () => { map.getCanvas().style.cursor=''; if (hoverPopup) hoverPopup.remove(); });
    syncBaseChrome();
    map.on('load', () => {
      mapReady = true;
      buildPinsPanel(); render();
      const id = new URLSearchParams(location.hash.slice(1)).get('place');
      if (id && validId(id) && byId.has(id)) selectPlace(id);
      else { fitPlaces(catalog.filter(p=>p.position)); if (id && validId(id)) toast('That place is not in this atlas. Private pins are stored only on their original browser.'); }
    });
  }
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setBase(next) {
    if (!BASES.includes(next) || next === base) return;
    const kindChanged = baseDef().kind !== (next === 'official' ? 'official' : 'canonical');
    base = next; state.settings.baseMap = next; persist();
    for (const b of BASES) map.setLayoutProperty('base-'+b, 'visibility', b === base ? 'visible' : 'none');
    const def = baseDef();
    map.setMinZoom(def.minZoom); map.setMaxZoom(def.maxZoom); map.setMaxBounds(baseBounds());
    syncBaseChrome();
    if (kindChanged) {
      refreshMapData();
      if (selected && byId.has(selected)) { const p = byId.get(selected); const dp = toDisplay(p); if (dp) map.easeTo({center:dp, zoom:Math.max(map.getZoom(), 2), duration: reducedMotion() ? 0 : 500}); }
      else fitPlaces(catalog.filter(p=>p.position));
    }
    render();
  }

  function closeDetails() { selected=null; $('#details').hidden=true; $('#discovery-card').hidden=true; history.replaceState(null,'',location.pathname+location.search); refreshMapData(); }
  function selectPlace(id,move=true) {
    refreshIndex(); const p=byId.get(id); if(!p) return;
    selected=id; $('#discovery-card').hidden=true; $('#details').hidden=false; renderDetails(p); renderList();
    $('.workspace').classList.remove('browse-open');
    if(p.category!=='personal') history.replaceState(null,'','#place='+encodeURIComponent(id));
    const dp = toDisplay(p);
    if(move && dp && mapReady) map.easeTo({center:dp, zoom:Math.max(map.getZoom(),2.5), duration: reducedMotion() ? 0 : 600});
    if(move && !p.position && p.category==='region') fitPlaces(catalog.filter(x=>x.position&&x.areaKey===p.areaKey));
    refreshMapData();
  }
  function sourceLink(url,text) {
    const a=make('a','',text);
    try { const u=new URL(url); if(u.protocol!=='https:') throw new Error(); a.href=u.href; a.target='_blank'; a.rel='noopener noreferrer'; }
    catch { return make('span','muted',text+' · source unavailable'); }
    return a;
  }
  function renderDetails(p) {
    const box=$('#details'); box.replaceChildren();
    const header=make('div','details-header');header.append(make('span','eyebrow',({easter:'EASTER EGG',hidden:'HIDDEN PLACE',personal:'PRIVATE PIN',region:'OFFICIAL REGION NAME',vehicle:'FREE VEHICLE',garage:'GARAGE & PROPERTY',money:'MONEY MAKING',collectible:'COLLECTIBLE',service:'SERVICE & UNLOCK',hotel:'HOTEL',residential:'RESIDENTIAL',retail:'RETAIL',restaurant:'FOOD & DRINK',transportation:'TRANSPORT',industrial:'INDUSTRIAL',government:'GOVERNMENT',leisure:'LEISURE',natural:'NATURE',utilities:'UTILITIES',office:'OFFICE',public:'PUBLIC',agriculture:'AGRICULTURE',landmark:'COMMUNITY LANDMARK'})[p.category]||'COMMUNITY LANDMARK'));
    const close=make('button','icon-button','×');close.setAttribute('aria-label','Close selected place');close.onclick=closeDetails;header.append(close);box.append(header);
    box.append(make('h2','',displayName(p)),make('div','place-region',p.spoiler&&!revealed(p)?'Location details hidden':p.region||'Region not established'));
    const isConfirmed=p.confidence==='confirmed'&&!p.community&&p.category!=='personal';
    const label=p.category==='personal'?'Your own placement':p.confidence==='official'?'Official name · no mapped position':p.community&&p.nameKind==='counterpart'?'Real-world counterpart name · in-game name not yet recorded':p.community?'Community placement · approximate':isConfirmed?'Confirmed by multiple guides · not personally verified':'Reported discovery · not personally verified';
    box.append(make('span','status-badge'+(isConfirmed?' is-confirmed':''),label));
    if(p.community&&p.position&&base!=='official') box.append(make('p','position-confidence','Position: '+(p.coordinateConfidence||'approximate')+' — community dataset'));
    const description=revealed(p) ? (p.description || p.hint) : p.hint;
    if(description) box.append(make('p','',description));
    const photoFig=(url,cap)=>{ let u=null; try { u=new URL(url); } catch {} if(!u||u.protocol!=='https:') return; const fig=make('figure','place-photo');const img=make('img');img.loading='lazy';img.alt='';img.src=u.href;img.addEventListener('error',()=>fig.remove());fig.append(img,make('figcaption','photo-credit',cap));box.append(fig); };
    if(p.photo) photoFig(p.photo, p.photoRl?'In-game · Photo: GTADB.ORG contributors, CC BY 4.0':'Photo: GTADB.ORG contributors, CC BY 4.0');
    if(p.photoRl) photoFig(p.photoRl,'Real-life counterpart · Photo: GTADB.ORG contributors, CC BY 4.0');
    if(p.spoiler && !revealed(p)) { const reveal=make('button','secondary-button','Reveal this discovery');reveal.onclick=()=>{state.revealed.push(p.id);persist();render();};box.append(reveal); }
    const officialNote = base==='official' && p.position && p.category!=='personal';
    box.append(make('p','precision-note', officialNote ? 'Shown on the official map via transform — right neighbourhood, approximate.'
      : p.positionNote || (p.position ? (p.category==='personal'?'A private point you placed. It is drawn on every basemap from the same saved position.':p.origin==='gtadb-2026'?'In-game coordinates from the GTADB community dataset, converted onto this basemap. Treat the exact spot as approximate.':'Pre-release community coordinates. The place name and position may differ in the released game.') : 'No reliable map coordinates yet. This guide is listed without a guessed pin. Read its source for location instructions.')));
    const actions=make('div','details-actions');const found=make('button','primary-button',has('found',p.id)?'✓ Found · undo':'Mark as found');found.onclick=()=>toggle('found',p.id);const favorite=make('button','square-button'+(has('favorites',p.id)?' active':''),has('favorites',p.id)?'★':'☆');favorite.setAttribute('aria-label',has('favorites',p.id)?'Remove favorite':'Add favorite');favorite.setAttribute('aria-pressed',String(has('favorites',p.id)));favorite.onclick=()=>toggle('favorites',p.id);actions.append(found,favorite);box.append(actions);
    const tools=make('div','detail-tools');
    if(p.position) { const plan=make('button','secondary-button',has('plan',p.id)?'Remove from plan':'Add to my plan');plan.onclick=()=>{if(!has('plan',p.id)&&state.plan.length>=30) return toast('A planning list can contain up to 30 places.');toggle('plan',p.id);};tools.append(plan); }
    if(p.category!=='personal') { const share=make('button','secondary-button','Copy place link');share.onclick=async()=>{const url=location.origin+location.pathname+'#place='+encodeURIComponent(p.id);try{await navigator.clipboard.writeText(url);toast('Place link copied. Your notes stay private.');}catch{const field=make('input');field.value=url;field.readOnly=true;field.setAttribute('aria-label','Place link to copy');tools.append(field);field.select();toast('Select and copy the place link.');}};tools.append(share); }
    box.append(tools);
    if(p.position) {
      const near = currentPlaces().filter(x=>x.position && x.id!==p.id)
        .map(x=>({x, d: Math.hypot(x.position[1]-p.position[1], x.position[0]-p.position[0])}))
        .sort((a,b)=>a.d-b.d).slice(0,6);
      if(near.length) {
        const sec=make('div','near-here');sec.append(make('h3','near-title','What’s near here'));
        for(const {x,d} of near) {
          const b=make('button','near-row'); b.dataset.category=x.category;
          b.append(make('span','result-symbol',symbols[x.category]||'◇'),
                   make('span','near-name',displayName(x)),
                   make('span','near-dist',Math.round(d).toLocaleString('en-US')+' units'));
          b.onclick=()=>selectPlace(x.id);
          sec.append(b);
        }
        box.append(sec);
      }
    }
    const note=make('label','note-label','Your field notes');const textarea=make('textarea');textarea.maxLength=5000;textarea.placeholder='A clue, a route, a reason to come back…';textarea.value=state.notes[p.id]||'';textarea.setAttribute('aria-label','Private notes for this place');textarea.addEventListener('input',()=>{state.notes[p.id]=textarea.value;persist();updateNotebookCount();});note.append(textarea,make('small','',readOnly?'Temporary session · export a backup.':'Private · saved in this browser'));box.append(note);
    if(p.sourceUrl) { const section=make('details','source-section');section.append(make('summary','',p.spoiler&&!revealed(p)?'Source & accuracy · may contain spoilers':'Source & accuracy'),sourceLink(p.sourceUrl,p.sourceName||'Read the source'));if(p.evidence) section.append(make('p','',p.evidence));box.append(section); }
    if(p.category==='personal') { const remove=make('button','danger-button','Delete this private pin');remove.style.marginTop='18px';remove.onclick=()=>{if(!confirm('Delete this private pin and its note? Other discoveries will stay.'))return;state.pins=state.pins.filter(x=>x.id!==p.id);for(const k of ['found','favorites','plan','revealed']) state[k]=state[k].filter(x=>x!==p.id);delete state.notes[p.id];persist();closeDetails();render();};box.append(remove); }
  }
  function updateNotebookCount() { const count=currentPlaces().filter(p=>has('found',p.id)||has('favorites',p.id)||state.notes[p.id]||p.category==='personal').length;$('#notebook-count').textContent=count; }
  function renderProgress() {
    const box = $('#guide-progress'); if (!box) return;
    const cats = [['vehicle','Free vehicles'],['garage','Garages'],['money','Money'],['collectible','Collectibles'],['service','Services'],['easter','Easter eggs'],['hidden','Hidden places'],['region','Regions']];
    const guides = catalog.filter(p=>!p.community);
    let totalAll = 0, foundAll = 0;
    const rows = [];
    for (const [cat,label] of cats) {
      const entries = guides.filter(p=>p.category===cat);
      if (!entries.length) continue;
      const f = entries.filter(p=>has('found',p.id)).length;
      totalAll += entries.length; foundAll += f;
      rows.push({label, f, total: entries.length});
    }
    box.replaceChildren();
    const sum = make('summary','', 'Guide progress · '+foundAll+'/'+totalAll+' found');
    box.append(sum);
    for (const r of rows) {
      const row = make('div','progress-row');
      row.append(make('span','progress-label',r.label), make('span','progress-count',r.f+'/'+r.total));
      const bar = make('div','progress-bar'); const fill = make('div','progress-fill');
      fill.style.width = (r.total ? Math.round(100*r.f/r.total) : 0)+'%'; bar.append(fill); row.append(bar);
      box.append(row);
    }
  }
  function renderList() {
    const list=filtered(); const results=$('#results');results.replaceChildren();
    const unmapped=list.filter(p=>!p.position).length;
    $('#result-count').textContent=list.length+' '+(list.length===1?'place':'places')+(unmapped?' · '+unmapped+' unpinned':'');$('#mobile-count').textContent=list.length;$('#show-results').textContent='Places ('+list.length+')';
    $('#result-count').title=unmapped?'Unpinned source guides have no reliable map coordinates.':'';
    if(!list.length) { const empty=make('div','empty');empty.append(make('strong','',view==='notebook'?'Your notebook starts here.':'Nothing in this view.'),make('span','',view==='notebook'?'Star a place, mark a discovery or add a private pin.':'Try another search or clear your filters.'));results.append(empty);return; }
    for(const p of list.slice(0,600)) {
      const row=make('button','result-row'+(p.id===selected?' selected':''));row.dataset.id=p.id;row.dataset.category=p.category;row.setAttribute('aria-label',displayName(p)+(has('found',p.id)?', found':''));
      const text=make('span');text.append(make('span','result-name',displayName(p)),make('span','result-meta',(p.spoiler&&!revealed(p)?p.hint:p.region||'Region unknown')+' · '+(p.position?(p.category==='personal'?'Private pin':'Approximate'):'Unpinned guide')+(p.confidence==='confirmed'?' · Confirmed by multiple guides':'')));
      row.append(make('span','result-symbol',symbols[p.category]||'◇'),text,make('span','found-tick',has('found',p.id)?'✓':''));row.onclick=()=>selectPlace(p.id);results.append(row);
    }
    if(list.length>600) results.append(make('div','unmapped-note','Showing the first 600 of '+list.length+' places — narrow the search or pick a category to see the rest.'));
  }
  function render() { refreshIndex();renderList();refreshMapData();renderProgress();updateNotebookCount();if(selected&&byId.has(selected))renderDetails(byId.get(selected)); }
  function setView(next) {
    view=next;state.pinOff=[];query='';area='';$('#area-select').value='';$('#search').value='';state.settings.favoritesOnly=false;$('#favorites-only').checked=false;
    $('.workspace').classList.add('browse-open');
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
    const titles={explore:['ALL AREAS OPEN','Find a place.','Search above, choose an area, or tap a pin. Everything is available from the start.'],secrets:['ALL DISCOVERIES VISIBLE','Secrets & hidden places','Tap a guide to read it. Unpinned guides have no reliable coordinates yet.'],notebook:['SAVED ON THIS DEVICE','My notebook','Your found places, favorites, private pins and notes.']};
    const t=titles[next];$('#view-eyebrow').textContent=t[0];$('#view-title').textContent=t[1];$('#view-description').textContent=t[2];
    syncFilterUI();
    closeDetails();persist();render();
  }
  function download(name,data,type='application/json') { const url=URL.createObjectURL(new Blob([data],{type}));const a=make('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000); }
  function addPinMode() { if(!ready)return;placing=true;$('.map-shell').classList.add('placing');$('#pin-instruction').hidden=false;$('.workspace').classList.remove('browse-open');closeDetails();$('#discovery-card').hidden=true; }
  function stopPinMode() {placing=false;$('.map-shell').classList.remove('placing');$('#pin-instruction').hidden=true;}
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  function syncFilterUI() {
    const off = state.pinOff;
    document.querySelectorAll('[data-filter]').forEach(b=>{
      const c=b.dataset.filter;
      const solo = c!=='all' && off.length===CATS.length-1 && !off.includes(c);
      const active = c==='all' ? off.length===0 : solo;
      b.classList.toggle('active',active);
      b.classList.toggle('is-off',c!=='all'&&off.includes(c));
      b.setAttribute('aria-pressed',String(active));
    });
    const badge=$('#pins-off-count'); if(badge){badge.hidden=off.length===0;badge.textContent=off.length;}
    document.querySelectorAll('.pins-row').forEach(r=>{
      const on=!off.includes(r.dataset.category);
      r.classList.toggle('is-off',!on);
      const sw=r.querySelector('.pin-switch'); if(sw) sw.setAttribute('aria-checked',String(on));
    });
  }
  function setPinOff(next) { state.pinOff=[...new Set(next)].filter(c=>CATS.includes(c)); persist(); syncFilterUI(); render(); }
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{ const c=b.dataset.filter; setPinOff(c==='all'?[]:CATS.filter(x=>x!==c)); });
  function buildPinsPanel() {
    const list=$('#pins-list'); if(!list) return; list.replaceChildren();
    const places=currentPlaces();
    for(const c of CATS) {
      const n=places.filter(p=>p.category===c&&p.position).length;
      const row=make('div','pins-row'); row.dataset.category=c;
      const name=make('button','pins-name',CAT_LABELS[c]); name.title='Show only '+CAT_LABELS[c].toLowerCase();
      name.onclick=()=>setPinOff(CATS.filter(x=>x!==c));
      const sw=make('button','pin-switch'); sw.setAttribute('role','switch'); sw.setAttribute('aria-checked',String(!state.pinOff.includes(c))); sw.setAttribute('aria-label','Show '+CAT_LABELS[c]+' pins');
      sw.onclick=()=>setPinOff(state.pinOff.includes(c)?state.pinOff.filter(x=>x!==c):[...state.pinOff,c]);
      row.append(make('span','result-symbol',symbols[c]||'◇'),name,make('span','pins-count',String(n)),sw);
      list.append(row);
    }
    syncFilterUI();
  }
  const pinsPanel=$('#pins-panel');
  if(pinsPanel) {
    $('#pins-toggle').onclick=()=>{ const open=pinsPanel.hidden; pinsPanel.hidden=!open; $('#pins-toggle').setAttribute('aria-expanded',String(open)); };
    $('#pins-close').onclick=()=>{ pinsPanel.hidden=true; $('#pins-toggle').setAttribute('aria-expanded','false'); };
    $('#pins-all').onclick=()=>setPinOff([]);
    $('#pins-none').onclick=()=>setPinOff([...CATS]);
  }
  function clearScope() {
    view='explore';state.pinOff=[];state.settings.hideFound=false;state.settings.favoritesOnly=false;
    $('#hide-found').checked=false;$('#favorites-only').checked=false;
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='explore'));
    syncFilterUI();
    $('#view-eyebrow').textContent='ALL AREAS OPEN';$('#view-title').textContent='Find a place.';$('#view-description').textContent='Search above, choose an area, or tap a pin. Everything is available from the start.';
  }
  function fitPlaces(points) {
    if(!mapReady||!points.length)return false;
    const bounds = new maplibregl.LngLatBounds();
    for (const p of points) { const dp = toDisplay(p); if (dp) bounds.extend(dp); }
    if (bounds.isEmpty()) return false;
    map.fitBounds(bounds,{padding:55, maxZoom:3, duration: reducedMotion() ? 0 : 600});
    return true;
  }
  /* ---------- type-ahead search across everything ---------- */
  let searchItems = [], searchActive = -1;
  function fuzzyScore(name, q) {
    const n = normalize(name);
    if (n === q) return 100;
    if (n.startsWith(q)) return 82;
    if (n.includes(q)) return 64;
    const nt = n.split(/[^a-z0-9]+/).filter(Boolean), qt = q.split(/\s+/).filter(Boolean);
    if (qt.length && qt.every(t=>nt.some(x=>x.startsWith(t)))) return 48;
    let i = 0; for (const ch of n) if (ch === q[i]) i++;
    return i === q.length && q.length > 2 ? 30 : 0;
  }
  function closeSearchResults() { const box=$('#search-results'); if(box){box.hidden=true;box.replaceChildren();} searchItems=[]; searchActive=-1; }
  function updateSearchResults() {
    const box = $('#search-results'); if (!box) return;
    const q = normalize(query).trim();
    if (q.length < 2) { closeSearchResults(); return; }
    const pool = currentPlaces().filter(p=>!state.pinOff.includes(p.category));
    const scored = [];
    for (const p of pool) { const s = fuzzyScore(p.name, q); if (s) scored.push({p, s}); }
    scored.sort((a,b)=>b.s-a.s || a.p.name.localeCompare(b.p.name));
    const groups = [['Guides', scored.filter(x=>!x.p.community && x.p.category!=='region')],
                    ['Areas', scored.filter(x=>!x.p.community && x.p.category==='region')],
                    ['Places', scored.filter(x=>x.p.community)]];
    box.replaceChildren(); searchItems = [];
    if (!scored.length) {
      box.append(make('div','search-empty','No matches for “'+query+'” — try a shorter name.'));
    } else for (const [label, items] of groups) {
      if (!items.length) continue;
      box.append(make('div','search-group',label));
      for (const {p} of items.slice(0,7)) {
        const row = make('button','search-row'); row.dataset.category=p.category;
        row.append(make('span','result-symbol',symbols[p.category]||'◇'),
                   make('span','search-row-name',displayName(p)),
                   make('span','search-row-meta',(p.region||p.category||'')+(p.position?'':' · unpinned')));
        row.dataset.id = p.id;
        row.addEventListener('click',()=>{ closeSearchResults(); selectPlace(p.id); $('#search').blur(); });
        box.append(row); searchItems.push(row);
      }
    }
    box.hidden = false; searchActive = -1;
  }
  function moveSearchActive(dir) {
    if (!searchItems.length) return;
    searchActive = (searchActive + dir + searchItems.length) % searchItems.length;
    searchItems.forEach((r,i)=>r.classList.toggle('active', i===searchActive));
    searchItems[searchActive].scrollIntoView({block:'nearest'});
  }
  $('#search').addEventListener('input',e=>{query=e.target.value;area='';$('#area-select').value='';clearScope();closeDetails();$('.workspace').classList.add('browse-open');render();updateSearchResults();});
  $('#search').addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){e.preventDefault();moveSearchActive(1);}
    else if(e.key==='ArrowUp'){e.preventDefault();moveSearchActive(-1);}
    else if(e.key==='Escape'){closeSearchResults();}
    else if(e.key==='Enter'){
      if(searchActive>=0 && searchItems[searchActive]){e.preventDefault();const id=searchItems[searchActive].dataset.id;closeSearchResults();selectPlace(id);$('#search').blur();return;}
      const first=filtered()[0];if(first){e.preventDefault();closeSearchResults();selectPlace(first.id);$('#search').blur();}
    }
  });
  document.addEventListener('click',e=>{ if(!e.target.closest('.search-wrap')) closeSearchResults(); });
  $('#show-results').onclick=()=>{$('.workspace').classList.toggle('browse-open');};
  $('#clear-search').onclick=()=>{query='';area='';$('#search').value='';$('#area-select').value='';closeSearchResults();clearScope();closeDetails();render();fitPlaces(catalog.filter(p=>p.position));$('.workspace').classList.remove('browse-open');persist();};
  $('#area-select').onchange=e=>{area=e.target.value;query='';$('#search').value='';closeSearchResults();clearScope();closeDetails();render();if(!fitPlaces(filtered().filter(p=>p.position))&&area)toast('This area has a guide only; no reliable mapped points yet.');$('.workspace').classList.remove('browse-open');};
  for(const [id,key] of [['hide-found','hideFound'],['favorites-only','favoritesOnly']]) {$('#'+id).checked=state.settings[key];$('#'+id).onchange=e=>{state.settings[key]=e.target.checked;persist();render();};}
  $('#discover-secrets').onclick=()=>setView('secrets');$('#mobile-browse').onclick=()=>$('.workspace').classList.add('browse-open');$('#mobile-close').onclick=()=>$('.workspace').classList.remove('browse-open');
  $('.about-open').onclick=()=>$('#about-dialog').showModal();$('#data-open').onclick=()=>$('#data-dialog').showModal();$('#more-open').onclick=()=>$('#more-dialog').showModal();
  $('#add-pin').onclick=addPinMode;$('#cancel-pin').onclick=stopPinMode;$('#close-pin').onclick=()=>$('#pin-dialog').close();
  $('#pin-form').onsubmit=e=>{e.preventDefault();if(!pendingPosition)return; if(state.pins.length>=500)return toast('This notebook supports up to 500 private pins. Export a backup before starting another.');const id='personal-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36));state.pins.push({id,name:$('#pin-name').value.trim().slice(0,100),note:$('#pin-note').value.slice(0,5000),position:pendingPosition});if($('#pin-note').value)state.notes[id]=$('#pin-note').value.slice(0,5000);const saved=persist();$('#pin-dialog').close();buildPinsPanel();setView('explore');render();selectPlace(id,false);toast(saved?'Private pin saved to your notebook.':'Private pin kept for this session. Export a backup to keep it.');};
  $('#fit-map').onclick=()=>{fitPlaces(catalog.filter(p=>p.position));};
  $('#fit-results').onclick=()=>{const pts=filtered().filter(p=>p.position);if(!pts.length)return toast('These guides do not have reliable map coordinates yet.');fitPlaces(pts);$('.workspace').classList.remove('browse-open');};
  $('#toggle-style').onclick=()=>{
    state.settings.day=!state.settings.day;persist();
    if(base==='fieldnotes' && mapReady){
      const b = config.bases.fieldnotes[state.settings.day ? 'day' : 'night'];
      map.getSource('base-fieldnotes').setTiles([b.tileUrl]);
    }
    syncBaseChrome();
    toast(state.settings.day?'Day map.':'Night map.');
  };
  document.querySelectorAll('[data-base]').forEach(b=>b.onclick=()=>setBase(b.dataset.base));
  $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Full screen is not available in this browser.');}};
  $('#clear-plan').onclick=()=>{state.plan=[];persist();render();};
  function orderByRoute(stops) {
    if (stops.length < 3) return stops;
    let start = stops.reduce((a,p)=>p.position[1]<a.position[1]?p:a, stops[0]);
    const rest = stops.filter(p=>p!==start); const out = [start];
    while (rest.length) {
      const last = out[out.length-1];
      let bi = 0, bd = Infinity;
      rest.forEach((p,i)=>{const d=Math.hypot(p.position[1]-last.position[1],p.position[0]-last.position[0]);if(d<bd){bd=d;bi=i;}});
      out.push(rest.splice(bi,1)[0]);
    }
    return out;
  }
  function loadTrail(kind) {
    let stops;
    if (kind === 'eggs') {
      stops = orderByRoute(catalog.filter(p=>!p.community && (p.category==='easter'||p.category==='hidden') && p.position));
    } else {
      const veh = catalog.filter(p=>!p.community && p.category==='vehicle' && p.position);
      const svc = catalog.filter(p=>!p.community && p.category==='service' && p.position && /Moses/.test(p.name));
      const gar = catalog.filter(p=>!p.community && p.category==='garage' && p.position && /Port Gellhorn Station/.test(p.name));
      stops = [...veh, ...svc, ...gar];
    }
    if (stops.length < 2) return toast('This trail does not have enough pinned stops yet.');
    state.plan = stops.map(p=>p.id).slice(0,30); persist(); render(); fitPlaces(stops);
    $('.workspace').classList.remove('browse-open');
    toast((kind==='eggs'?'Easter Egg Trail':'Free Car Run')+' loaded into your plan — '+stops.length+' stops. It edits like any plan.');
  }
  $('#trail-eggs').onclick=()=>loadTrail('eggs');
  $('#trail-cars').onclick=()=>loadTrail('cars');
  $('#export-backup').onclick=()=>download('fieldnotes-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2));
  $('#export-raw').onclick=()=>download('fieldnotes-unreadable-backup.txt',unreadable,'text/plain');
  $('#import-backup').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try {
      if(file.size>16*1024*1024)throw new Error('Backup is too large (maximum 16 MB).');
      const incoming=validateBackup(JSON.parse(await file.text()));
      if(readOnly&&unreadable) {$('#import-result').textContent='Export your unreadable saved data first, then use Clear this browser’s notebook before restoring.';return;}
      const merged=validateBackup(JSON.parse(JSON.stringify(state)));
      for(const k of ['found','favorites','revealed'])merged[k]=[...new Set([...merged[k],...incoming[k]])];
      for(const [id,note] of Object.entries(incoming.notes))if(!merged.notes[id])merged.notes[id]=note;
      const existing=new Set(merged.pins.map(p=>p.id));for(const pin of incoming.pins)if(!existing.has(pin.id)){if(merged.pins.length>=500)throw new Error('Too many private pins to merge. Export your current notebook first.');merged.pins.push(pin);existing.add(pin.id);}
      merged.plan=[...new Set([...merged.plan,...incoming.plan])].slice(0,30);state=validateBackup(merged);const saved=persist();base=state.settings.baseMap||'fieldnotes';
      if (mapReady) { for (const b of BASES) map.setLayoutProperty('base-'+b, 'visibility', b === base ? 'visible' : 'none'); const def=baseDef(); map.setMinZoom(def.minZoom); map.setMaxZoom(def.maxZoom); map.setMaxBounds(baseBounds()); const fnb=config.bases.fieldnotes[state.settings.day ? 'day' : 'night']; map.getSource('base-fieldnotes').setTiles([fnb.tileUrl]); syncBaseChrome(); }
      buildPinsPanel();render();$('#import-result').textContent=saved?'Backup merged. Your existing notes were kept.':'Backup merged for this session. Download a backup: browser saving is unavailable.';
    } catch(err) {$('#import-result').textContent='Import not completed: '+err.message;}
    finally {e.target.value='';}
  };
  $('#reset-data').onclick=()=>{if(!confirm('Clear only this browser’s Fieldnotes notebook? Export a backup first. This cannot be undone here.'))return;try{localStorage.removeItem(KEY);readOnly=false;unreadable='';state=fresh();base='fieldnotes';const saved=persist();if(saved){$('#storage-warning').hidden=true;$('#save-status').textContent='Saved in this browser · no account';}$('#export-raw').hidden=true;$('#data-dialog').close();selected=null;$('#details').hidden=true;
    if (mapReady) { for (const b of BASES) map.setLayoutProperty('base-'+b, 'visibility', b === base ? 'visible' : 'none'); const def=baseDef(); map.setMinZoom(def.minZoom); map.setMaxZoom(def.maxZoom); map.setMaxBounds(baseBounds()); const fn=config.bases.fieldnotes.day; map.getSource('base-fieldnotes').setTiles([fn.tileUrl]); syncBaseChrome(); }
    buildPinsPanel();render();toast(saved?'This browser’s notebook was cleared.':'Notebook cleared for this session. Export future changes to keep them.');}catch{toast('Browser storage is unavailable. Your saved data was not changed.');}};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){stopPinMode();closeSearchResults();if(!document.querySelector('dialog[open]')){closeDetails();$('.workspace').classList.remove('browse-open');}}if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('.workspace').classList.add('browse-open');$('#search').focus();}});
  window.addEventListener('hashchange',()=>{const id=new URLSearchParams(location.hash.slice(1)).get('place');if(id&&validId(id))selectPlace(id);});
  window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{state=validateBackup(JSON.parse(e.newValue));render();toast('Notebook updated from another tab.');}catch{toast('Another tab saved unreadable data. This view was kept.');}});

  async function load() {
    try {
      if(!window.maplibregl)throw new Error('Map library unavailable');
      const read=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Could not load '+url);return r.json();};
      const [community,guides,cfg]=await Promise.all([read('data/community.json'),read('data/guides.json'),read('data/map-config.json')]);config=cfg;
      if(!BASES.includes(base)) base='fieldnotes';
      catalog=community.locations.map(p=>{const gtadb=p.origin==='gtadb-2026';return {...p,community:true,sourceLabel:p.sourceName,sourceCategory:p.category,areaKey:areaKey(p.region),category:p.category||'landmark',position:[p.worldY,p.worldX],hint:gtadb?'A point from the current GTADB community landmarks dataset.':'A named point from the pre-release community reconstruction.',description:gtadb?'Community source label: '+p.sourceName+'. Position converted from GTADB in-game coordinates onto this basemap; placements are approximate.'+(p.nameKind==='counterpart'?' The name shown for this pin is the real-world counterpart GTADB records for this spot; its in-game name is not yet recorded.':''):'Community source label: '+p.sourceName+'. This label and placement have not been checked against the released game.',sourceName:gtadb?'GTADB.ORG — GTA VI Landmarks Data (CC BY 4.0)':'YANIS / gta6map community · July 2025',sourceUrl:gtadb?'https://map.gtadb.org':cfg.source.repository+'/blob/'+cfg.source.pin+'/readme.md',spoiler:false,evidence:gtadb?'GTADB.ORG community dataset (CC BY 4.0), snapshot 26 November 2026. In-game coordinates converted onto the Fieldnotes basemap with an empirically validated transform (leave-one-out median error about 30 map units across 431 control landmarks). Not personally verified in-game.':'Publisher-declared public-domain community data. Real-world counterpart labels do not establish in-game confirmation.'};});
      catalog.push(...guides.entries.map(p=>{const located=!!(p.coordinates&&p.map_status&&p.map_status!=='unlocated');return {id:p.id,name:p.name,areaKey:p.region||areaKey(p.area?.split(';')[0]),category:p.category==='easter-egg'?'easter':p.category==='hidden-location'?'hidden':p.category,region:p.area||p.region||'',hint:p.hint,description:p.spoiler_details,spoiler:p.spoiler_level!=='none',position:located?[p.coordinates.worldY,p.coordinates.worldX]:null,positionNote:located?'Position matched to a GTADB community dataset record — see Source & accuracy. Not personally verified.':null,confidence:p.confidence,sourceName:p.source.title,sourceUrl:p.source.url,evidence:p.source.evidence_level+'. '+p.evidence_note+(p.coordinate_evidence?' Position: '+p.coordinate_evidence:''),hiddenByDefault:false};}));
      const areas=new Map();for(const p of catalog)if(p.position||p.category==='region')areas.set(p.areaKey,p.position?p.region:p.name);
      for(const [value,label] of [...areas].sort((a,b)=>a[1].localeCompare(b[1]))) {const option=make('option','',label);option.value=value;$('#area-select').append(option);}
      refreshIndex();
      createMap();
      ready=true;
      const credits=$('#credits');
      credits.append(
        make('p','muted','Designed & built by Baxter McDonnell · NextEleven.'),
        sourceLink(cfg.source.repository+'/blob/'+cfg.source.pin+'/readme.md','Fieldnotes custom basemap · drawn by NextEleven from the YANIS / gta6map reconstruction (public-domain declaration), checked against Rockstar’s official reference map'),
        sourceLink('https://map.gtadb.org','Landmark data · GTADB.ORG (CC BY 4.0)'),
        make('p','muted','Map data © GTADB.ORG contributors, CC BY 4.0 — GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org. Landmark snapshot: 26 November 2026; positions converted onto the basemap and approximate. Research guides: November 2026.'),
        sourceLink(cfg.officialMapUrl,'Official map artwork · © Rockstar Games — shown under fan use; will remove on request'),
        make('p','muted','MapLibre GL JS 4.7, BSD-3-Clause. Fieldnotes interface by NextEleven; built with AI assistance.'));
      document.body.dataset.ready='true';
      if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
    } catch(err){$('#map-error').hidden=false;$('#result-count').textContent='Atlas unavailable';console.error('Atlas load failed:',err.message);}
  }
  load();
})();
