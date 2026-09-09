window.CCS = window.CCS || {};
(function () {
'use strict';

/**
 * 座標轉換工具。
 *
 * 世界座標系（Three.js，右手座標）：
 *   +X = 東、-Z = 北、+Y = 上（地表為 0，地下為負）
 *   單位為「地表公尺」＝ Web Mercator 公尺 × cos(場址緯度)
 * 以此定義，地表瓦片（規則的 Mercator 格網）可與地層模型精確對齊。
 */

const { SITE } = window.CCS;

const R = 6378137;
const D2R = Math.PI / 180;

/** 經緯度 → Web Mercator (EPSG:3857) 公尺 */
function project(lon, lat) {
  return {
    x: R * lon * D2R,
    y: R * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2))
  };
}

/** Web Mercator 公尺 → 經緯度 */
function unproject(x, y) {
  return {
    lon: x / R / D2R,
    lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D2R
  };
}

/** Mercator 公尺 → 地表公尺的尺度修正係數 */
const MERCATOR_SCALE = Math.cos(SITE.lat * D2R);

const ORIGIN = project(SITE.lon, SITE.lat);

/** 經緯度 → 世界平面座標 {x, z}（公尺） */
function lonLatToWorld(lon, lat) {
  const p = project(lon, lat);
  return {
    x: (p.x - ORIGIN.x) * MERCATOR_SCALE,
    z: -(p.y - ORIGIN.y) * MERCATOR_SCALE
  };
}

/** 世界平面座標 → 經緯度 */
function worldToLonLat(x, z) {
  return unproject(ORIGIN.x + x / MERCATOR_SCALE, ORIGIN.y - z / MERCATOR_SCALE);
}

function lonToTileX(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}

function latToTileY(lat, z) {
  const rad = lat * D2R;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
}

function tileXToLon(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** 取得單張瓦片在世界座標中的範圍 */
function tileBoundsWorld(tx, ty, z) {
  const nw = lonLatToWorld(tileXToLon(tx, z), tileYToLat(ty, z));
  const se = lonLatToWorld(tileXToLon(tx + 1, z), tileYToLat(ty + 1, z));
  return {
    minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z,
    width: se.x - nw.x, height: se.z - nw.z,
    centerX: (nw.x + se.x) / 2, centerZ: (nw.z + se.z) / 2
  };
}

/** 將瓦片模板中的 {z}/{x}/{y}/{s} 代換為實際值 */
function tileUrl(template, x, y, z) {
  return template
    .replace('{s}', ['a', 'b', 'c'][(x + y) % 3])
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y);
}

/** 兩點間地表距離（公尺） */
function distance(aLon, aLat, bLon, bLat) {
  const a = lonLatToWorld(aLon, aLat);
  const b = lonLatToWorld(bLon, bLat);
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** 度分秒格式化 */
function formatLatLng(lat, lon) {
  const f = (v, pos, neg) => {
    const hemi = v >= 0 ? pos : neg;
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = ((a - d) * 60 - m) * 60;
    return `${hemi} ${d}° ${String(m).padStart(2, '0')}′ ${s.toFixed(2)}″`;
  };
  return `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`;
}

Object.assign(window.CCS, {
  project, unproject, MERCATOR_SCALE, lonLatToWorld, worldToLonLat,
  lonToTileX, latToTileY, tileXToLon, tileYToLat, tileBoundsWorld, tileUrl,
  distance, formatLatLng
});
})();
