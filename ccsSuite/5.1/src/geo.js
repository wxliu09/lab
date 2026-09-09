/*
 * geo.js — 座標投影與地理工具
 * - TWD97 TM2 (EPSG:3826)：GRS80 橢球、中央經線 121°E、尺度 0.9999、假東距 250,000 m
 * - 場址局部座標系：以場址中心為原點的 TM2 平移座標（x 東、y 北，公尺）
 * - GeoJSON 幾何工具：point-in-polygon、點到多邊形距離、bbox
 */
window.CCSGeo = (function () {
  'use strict';

  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  // GRS80
  const a = 6378137.0, f = 1 / 298.257222101;
  const e2 = 2 * f - f * f, ep2 = e2 / (1 - e2);
  const k0 = 0.9999, lon0 = 121 * D2R, FE = 250000, FN = 0;

  function meridianArc(phi) {
    const e4 = e2 * e2, e6 = e4 * e2;
    return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
      - (35 * e6 / 3072) * Math.sin(6 * phi));
  }

  /** WGS84/TWD97 經緯度 → TM2 (E, N)。TWD97 與 WGS84 差異在公尺以下，此處視為相同。 */
  function tm2Forward(lon, lat) {
    const phi = lat * D2R, lam = lon * D2R;
    const sinP = Math.sin(phi), cosP = Math.cos(phi), tanP = Math.tan(phi);
    const N = a / Math.sqrt(1 - e2 * sinP * sinP);
    const T = tanP * tanP, C = ep2 * cosP * cosP, A = (lam - lon0) * cosP;
    const M = meridianArc(phi);
    const A2 = A * A, A3 = A2 * A, A4 = A3 * A, A5 = A4 * A, A6 = A5 * A;
    const x = FE + k0 * N * (A + (1 - T + C) * A3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5 / 120);
    const y = FN + k0 * (M + N * tanP * (A2 / 2 + (5 - T + 9 * C + 4 * C * C) * A4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6 / 720));
    return { x, y };
  }

  /** TM2 (E, N) → 經緯度 */
  function tm2Inverse(x, y) {
    const e4 = e2 * e2, e6 = e4 * e2;
    const M = (y - FN) / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
      + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu)
      + (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu);
    const sinP = Math.sin(phi1), cosP = Math.cos(phi1), tanP = Math.tan(phi1);
    const C1 = ep2 * cosP * cosP, T1 = tanP * tanP;
    const N1 = a / Math.sqrt(1 - e2 * sinP * sinP);
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinP * sinP, 1.5);
    const D = (x - FE) / (N1 * k0);
    const D2 = D * D, D3 = D2 * D, D4 = D3 * D, D5 = D4 * D, D6 = D5 * D;
    const phi = phi1 - (N1 * tanP / R1) * (D2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6 / 720);
    const lam = lon0 + (D - (1 + 2 * T1 + C1) * D3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5 / 120) / cosP;
    return { lon: lam * R2D, lat: phi * R2D };
  }

  /** 以場址中心為原點的局部座標框架（公尺，x 東 / y 北）。 */
  function localFrame(lon, lat) {
    const c = tm2Forward(lon, lat);
    return {
      origin: { lon, lat, x: c.x, y: c.y },
      toLocal(lo, la) { const p = tm2Forward(lo, la); return [p.x - c.x, p.y - c.y]; },
      toLonLat(x, y) { const p = tm2Inverse(c.x + x, c.y + y); return [p.lon, p.lat]; },
      toTM2(x, y) { return [c.x + x, c.y + y]; }
    };
  }

  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function pointInPolygon(x, y, polygon) { // polygon = [outer, hole, hole...]
    if (!pointInRing(x, y, polygon[0])) return false;
    for (let i = 1; i < polygon.length; i++) if (pointInRing(x, y, polygon[i])) return false;
    return true;
  }
  function pointInGeometry(x, y, geom) {
    if (geom.type === 'Polygon') return pointInPolygon(x, y, geom.coordinates);
    if (geom.type === 'MultiPolygon') return geom.coordinates.some(p => pointInPolygon(x, y, p));
    return false;
  }
  function pointInFeatureCollection(x, y, fc) {
    return fc.features.some(ft => ft.geometry && pointInGeometry(x, y, ft.geometry));
  }

  function bboxOfCoords(coords, bb) {
    if (typeof coords[0] === 'number') {
      if (coords[0] < bb[0]) bb[0] = coords[0]; if (coords[1] < bb[1]) bb[1] = coords[1];
      if (coords[0] > bb[2]) bb[2] = coords[0]; if (coords[1] > bb[3]) bb[3] = coords[1];
    } else for (const c of coords) bboxOfCoords(c, bb);
    return bb;
  }
  function bboxOfGeometry(geom) { return bboxOfCoords(geom.coordinates, [Infinity, Infinity, -Infinity, -Infinity]); }

  function distPointSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx, qy = ay + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  /**
   * 建立海岸線距離場查詢器：把 FeatureCollection 的所有環線段轉成 TM2 座標，
   * 提供 (lon,lat) → { land:boolean, dist:公尺 } 查詢（僅取指定 bbox 內的線段，加速）。
   */
  function clipRingToBox(ring, bb) { // Sutherland–Hodgman 矩形裁切（僅外環）
    let poly = ring.slice(0, ring.length - 1);
    for (const side of [0, 1, 2, 3]) {
      const axis = (side === 0 || side === 2) ? 0 : 1, val = bb[side];
      const inside = p => (side < 2) ? p[axis] >= val : p[axis] <= val;
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const pi = inside(p), qi = inside(q);
        if (pi) out.push(p);
        if (pi !== qi) { const t = (val - p[axis]) / (q[axis] - p[axis]); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
      }
      poly = out; if (poly.length < 3) return null;
    }
    poly.push(poly[0]);
    return poly;
  }

  /**
   * 建立海岸線查詢器（限定 bbox）：
   * - land：以裁切到 bbox（外擴 0.02°）的多邊形做 point-in-polygon（避免逐點掃描全島兩萬個頂點）
   * - dist：到 bbox 外擴 0.2° 範圍內海岸線段的最短距離（TM2 公尺）
   */
  function coastQuery(fc, bboxLonLat) {
    const segs = [], clipped = [];
    const big = [bboxLonLat[0] - 0.2, bboxLonLat[1] - 0.2, bboxLonLat[2] + 0.2, bboxLonLat[3] + 0.2];
    const small = [bboxLonLat[0] - 0.02, bboxLonLat[1] - 0.02, bboxLonLat[2] + 0.02, bboxLonLat[3] + 0.02];
    const inBig = c => c[0] >= big[0] && c[0] <= big[2] && c[1] >= big[1] && c[1] <= big[3];
    const addRing = (ring, outer) => {
      for (let i = 0; i + 1 < ring.length; i++) {
        if (!inBig(ring[i]) && !inBig(ring[i + 1])) continue;
        const p = tm2Forward(ring[i][0], ring[i][1]), q = tm2Forward(ring[i + 1][0], ring[i + 1][1]);
        segs.push([p.x, p.y, q.x, q.y, Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)]);
      }
      if (outer) { const c = clipRingToBox(ring, small); if (c) clipped.push(c); }
    };
    for (const ft of fc.features) {
      const g = ft.geometry; if (!g) continue;
      if (g.type === 'Polygon') g.coordinates.forEach((r, i) => addRing(r, i === 0));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => poly.forEach((r, i) => addRing(r, i === 0)));
    }
    return {
      segmentCount: segs.length, ringCount: clipped.length,
      query(lon, lat) {
        const land = clipped.some(r => pointInRing(lon, lat, r));
        const p = tm2Forward(lon, lat), px = p.x, py = p.y;
        let best = Infinity;   // 平方距離；先以線段 bbox 快速排除（Math.hypot 在 V8 很慢，改用平方距離）
        for (let i = 0; i < segs.length; i++) {
          const sg = segs[i];
          const bx = px < sg[4] ? sg[4] - px : px > sg[6] ? px - sg[6] : 0, by = py < sg[5] ? sg[5] - py : py > sg[7] ? py - sg[7] : 0;
          if (bx * bx + by * by >= best) continue;
          const ax = sg[0], ay = sg[1], dx = sg[2] - ax, dy = sg[3] - ay, l2 = dx * dx + dy * dy;
          let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + t * dx - px, qy = ay + t * dy - py, dd = qx * qx + qy * qy;
          if (dd < best) best = dd;
        }
        return { land, dist: Math.sqrt(best) };
      }
    };
  }

  function fmtLon(lon) { return (lon >= 0 ? 'E ' : 'W ') + Math.abs(lon).toFixed(4) + '°'; }
  function fmtLat(lat) { return (lat >= 0 ? 'N ' : 'S ') + Math.abs(lat).toFixed(4) + '°'; }

  return { tm2Forward, tm2Inverse, localFrame, pointInRing, pointInPolygon, pointInGeometry,
    pointInFeatureCollection, bboxOfGeometry, distPointSegment, coastQuery, fmtLon, fmtLat, D2R, R2D };
})();
