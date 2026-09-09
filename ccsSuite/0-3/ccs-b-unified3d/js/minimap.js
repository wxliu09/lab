window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const L = window.L;
const { SITE, BASEMAPS, WELLS, MONITORS, VECTORS } = C;

/**
 * 迷你導覽圖（Leaflet）。
 *
 * 在方案 B 中，Leaflet 已不是主圖台，只負責兩件事：
 *   1. 顯示 3D 相機此刻的位置與視野方向（視錐投影）
 *   2. 讓使用者在小圖上點擊，把 3D 鏡頭飛過去
 */

let map = null;
let frustum = null;
let camDot = null;
let targetDot = null;
let baseLayers = {};
let onPick = null;

function init(el, opts) {
  onPick = opts && opts.onPick;

  map = L.map(el, {
    center: [SITE.lat, SITE.lon],
    zoom: 13,
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: true
  });

  Object.entries(BASEMAPS).forEach(([k, v]) => {
    baseLayers[k] = L.tileLayer(v.url, { maxZoom: v.maxZoom, attribution: v.attribution });
  });
  baseLayers.imagery.addTo(map);

  // 許可區
  L.polygon(VECTORS.licenseArea.ring.map(([e, n]) => {
    const ll = C.worldToLonLat(e, -n);
    return [ll.lat, ll.lon];
  }), { color: '#35e0d0', weight: 1.5, fillOpacity: 0.08 }).addTo(map);

  // 管線與河川
  [VECTORS.pipeline, VECTORS.river].forEach((v) => {
    L.polyline(v.line.map(([e, n]) => {
      const ll = C.worldToLonLat(e, -n);
      return [ll.lat, ll.lon];
    }), {
      color: '#' + v.color.toString(16).padStart(6, '0'),
      weight: 2, opacity: 0.85,
      dashArray: v === VECTORS.pipeline ? '6 4' : null
    }).addTo(map);
  });

  WELLS.forEach((w) => {
    L.circleMarker([w.lat, w.lon], {
      radius: w.type === 'injector' ? 6 : 4,
      color: '#fff', weight: 1.4,
      fillColor: w.type === 'injector' ? '#ff7a1a' : '#2ec4ff',
      fillOpacity: 1
    }).addTo(map).bindTooltip(w.id, { direction: 'top', offset: [0, -6] });
  });

  MONITORS.forEach((m) => {
    L.circleMarker([m.lat, m.lon], {
      radius: 3, color: '#cfe3f5', weight: 1, fillColor: '#8fd3a0', fillOpacity: 0.95
    }).addTo(map).bindTooltip(m.id, { direction: 'top', offset: [0, -4] });
  });

  frustum = L.polygon([[SITE.lat, SITE.lon]], {
    color: '#ffd24a', weight: 1.2, opacity: 0.9,
    fillColor: '#ffd24a', fillOpacity: 0.14, interactive: false
  }).addTo(map);

  targetDot = L.circleMarker([SITE.lat, SITE.lon], {
    radius: 4, color: '#ffd24a', weight: 2, fillOpacity: 0, interactive: false
  }).addTo(map);

  camDot = L.circleMarker([SITE.lat, SITE.lon], {
    radius: 4, color: '#0b1119', weight: 1.5,
    fillColor: '#ffd24a', fillOpacity: 1, interactive: false
  }).addTo(map);

  map.on('click', (e) => {
    if (onPick) onPick(e.latlng.lat, e.latlng.lng);
  });

  return map;
}

/** 依 3D 相機狀態更新導覽圖上的視錐 */
function update(info) {
  if (!map) return;
  const t = info.target;
  const c = info.camera;
  targetDot.setLatLng([t.lat, t.lon]);
  camDot.setLatLng([c.lat, c.lon]);

  // 視錐：自相機位置往目標方向張開約 ±26°
  const groundDist = C.distance(c.lon, c.lat, t.lon, t.lat) || 1;
  const reach = groundDist * 2.1;
  const brg = (info.bearing * Math.PI) / 180;
  const half = (26 * Math.PI) / 180;
  const pts = [[c.lat, c.lon]];
  for (let a = -half; a <= half + 1e-6; a += half / 6) {
    const ang = brg + a;
    const w = C.lonLatToWorld(c.lon, c.lat);
    const ll = C.worldToLonLat(w.x + Math.sin(ang) * reach, w.z - Math.cos(ang) * reach);
    pts.push([ll.lat, ll.lon]);
  }
  frustum.setLatLngs(pts);
}

function setBasemap(key) {
  Object.entries(baseLayers).forEach(([k, layer]) => {
    if (k === key) { if (!map.hasLayer(layer)) layer.addTo(map); }
    else if (map.hasLayer(layer)) map.removeLayer(layer);
  });
}

function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 60); }

Object.assign(C, { minimap: { init, update, setBasemap, invalidate, get map() { return map; } } });
})();
