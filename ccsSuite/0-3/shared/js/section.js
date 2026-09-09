window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const { STRATA, WELLS, FAULTS, RESERVOIR, MONITORS } = C;

/**
 * 任意方向地質剖面（Canvas 2D）。
 *
 * 沿使用者指定的兩點連線密集取樣地層柱，畫成標準的地質剖面圖：
 * 地層填色與岩性花紋、地層界線、斷層跡（含上／下盤位移）、
 * CO₂ 羽流、井位投影與射孔段、深度與距離刻度。
 *
 * 剖面所讀的每一個數值都來自與 3D 模型相同的 column() 與屬性場，
 * 因此剖面與 3D 塊體不會出現對不起來的情形。
 */

const MARGIN = { top: 34, right: 62, bottom: 38, left: 62 };

function lithoFill(ctx, x, y, w, h, stratum) {
  C.welllog.lithoFill(ctx, x, y, w, h, stratum);
}

/**
 * 沿剖面線取樣。
 * @returns {{cols:Array, length:number, minElev:number, maxElev:number}}
 */
function sample(x1, z1, x2, z2, n) {
  n = n || 260;
  const cols = [];
  const dx = x2 - x1, dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  let minElev = Infinity, maxElev = -Infinity;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + dx * t, z = z1 + dz * t;
    const col = C.column(x, z);
    cols.push({ t, d: t * length, x, z, tops: col.tops.slice(), thick: col.thick.slice(), base: col.base });
    if (col.tops[0] > maxElev) maxElev = col.tops[0];
    if (col.base < minElev) minElev = col.base;
  }
  return { cols, length, minElev, maxElev, x1, z1, x2, z2 };
}

/**
 * 繪製剖面。
 * @param {HTMLCanvasElement} canvas
 * @param {object} data  sample() 的輸出
 * @param {object} opts  { width, height, ve, colorMode, title }
 */
function draw(canvas, data, opts) {
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  const W = opts.width || 860;
  const H = opts.height || 420;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const plotW = W - MARGIN.left - MARGIN.right;
  const plotH = H - MARGIN.top - MARGIN.bottom;
  const eTop = Math.ceil(data.maxElev / 100) * 100;
  const eBot = Math.floor(data.minElev / 100) * 100;
  const toX = (d) => MARGIN.left + d / data.length * plotW;
  const toY = (e) => MARGIN.top + (eTop - e) / (eTop - eBot) * plotH;
  const ve = (plotH / (eTop - eBot)) / (plotW / data.length);

  ctx.fillStyle = '#0e151d';
  ctx.fillRect(0, 0, W, H);

  // ---- 地層填色（由下而上疊繪，確保尖滅處被上覆層正確覆蓋）----
  const mode = opts.colorMode || 'lithology';
  for (let i = STRATA.length - 1; i >= 0; i--) {
    const s = STRATA[i];
    const segs = [];
    let cur = null;
    for (const c of data.cols) {
      if (c.thick[i] > 0.4) {
        if (!cur) { cur = []; segs.push(cur); }
        cur.push(c);
      } else cur = null;
    }
    for (const seg of segs) {
      if (seg.length < 2) continue;
      ctx.beginPath();
      seg.forEach((c, k) => {
        const px = toX(c.d), py = toY(c.tops[i]);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      for (let k = seg.length - 1; k >= 0; k--) {
        const c = seg[k];
        ctx.lineTo(toX(c.d), toY(c.tops[i] - c.thick[i]));
      }
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (mode === 'lithology') {
        const x0 = toX(seg[0].d), x1 = toX(seg[seg.length - 1].d);
        lithoFill(ctx, x0, MARGIN.top, Math.max(1, x1 - x0), plotH, s);
      } else {
        paintProperty(ctx, seg, i, mode, toX, toY);
      }
      ctx.restore();
      // 層界線
      ctx.beginPath();
      seg.forEach((c, k) => {
        const px = toX(c.d), py = toY(c.tops[i]);
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = 'rgba(12,18,24,0.85)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  // ---- CO₂ 羽流 ----
  drawPlume(ctx, data, toX, toY);

  // ---- 斷層跡 ----
  drawFaults(ctx, data, toX, toY);

  // ---- 井位投影（距剖面線 250 m 內）----
  drawWells(ctx, data, toX, toY);

  // ---- 座標框與刻度 ----
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(MARGIN.left + 0.5, MARGIN.top + 0.5, plotW, plotH);

  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#8ea0b2';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const dStep = (eTop - eBot) > 1800 ? 400 : 200;
  for (let e = Math.ceil(eBot / dStep) * dStep; e <= eTop; e += dStep) {
    const y = toY(e);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(MARGIN.left + plotW, y); ctx.stroke();
    ctx.fillText(String(e), MARGIN.left - 6, y);
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.abs(e)), MARGIN.left + plotW + 6, y);
    ctx.textAlign = 'right';
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xStep = data.length > 4000 ? 1000 : 500;
  for (let d = 0; d <= data.length; d += xStep) {
    const x = toX(d);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, MARGIN.top + plotH); ctx.stroke();
    ctx.fillStyle = '#8ea0b2';
    ctx.fillText((d / 1000).toFixed(1), x, MARGIN.top + plotH + 6);
  }

  // ---- 標題與端點標記 ----
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8eef4';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(opts.title || '地質剖面', MARGIN.left, 8);
  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#7d8fa1';
  ctx.textAlign = 'right';
  ctx.fillText('長度 ' + (data.length / 1000).toFixed(2) + ' km｜垂直放大 ×' + ve.toFixed(1) +
    '｜方位 ' + bearing(data).toFixed(0) + '°', MARGIN.left + plotW, 8);

  ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#35e0d0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('A', MARGIN.left, MARGIN.top - 2);
  ctx.textAlign = 'right';
  ctx.fillText("A'", MARGIN.left + plotW, MARGIN.top - 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#7d8fa1';
  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('沿剖面距離 (km)', MARGIN.left + plotW / 2, H - 16);

  return { ve, eTop, eBot };
}

/** 剖面方位角（自北順時針，度） */
function bearing(data) {
  const dE = data.x2 - data.x1;
  const dN = -(data.z2 - data.z1);
  let b = Math.atan2(dE, dN) * 180 / Math.PI;
  if (b < 0) b += 360;
  return b;
}

/** 以屬性值著色的剖面填充：逐取樣柱畫細長方塊 */
function paintProperty(ctx, seg, index, mode, toX, toY) {
  const nz = 26;
  for (let k = 0; k < seg.length; k++) {
    const c = seg[k];
    const xa = toX(k > 0 ? (c.d + seg[k - 1].d) / 2 : c.d);
    const xb = toX(k < seg.length - 1 ? (c.d + seg[k + 1].d) / 2 : c.d);
    const w = Math.max(1, xb - xa + 1);
    const top = c.tops[index], h = c.thick[index];
    for (let j = 0; j < nz; j++) {
      const zRel = (j + 0.5) / nz;
      const sg = C.co2SaturationAt(index, c.x, c.z, zRel);
      const p = C.petro.propsAt(index, c.x, c.z, zRel, sg);
      const col = C.petro.colorFor(mode, p);
      if (!col) continue;
      ctx.fillStyle = 'rgb(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ')';
      const y0 = toY(top - h * (j / nz));
      const y1 = toY(top - h * ((j + 1) / nz));
      ctx.fillRect(xa, y0, w, Math.max(1, y1 - y0 + 1));
    }
  }
}

function drawPlume(ctx, data, toX, toY) {
  const idx = RESERVOIR.strataIndex;
  const pts = [];
  for (const c of data.cols) {
    if (c.thick[idx] < 0.5) { pts.push(null); continue; }
    const roof = c.tops[idx] - 6;
    let hi = null, lo = null;
    const n = 40;
    for (let j = 0; j <= n; j++) {
      const zRel = j / n;
      const sg = C.co2SaturationAt(idx, c.x, c.z, zRel);
      if (sg > 0.02) {
        const y = c.tops[idx] - zRel * c.thick[idx];
        if (hi === null) hi = y;
        lo = y;
      }
    }
    pts.push(hi === null ? null : { d: c.d, hi: Math.min(hi, roof), lo });
  }
  let seg = [];
  const flush = () => {
    if (seg.length > 1) {
      ctx.beginPath();
      seg.forEach((p, k) => { const x = toX(p.d), y = toY(p.hi); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      for (let k = seg.length - 1; k >= 0; k--) ctx.lineTo(toX(seg[k].d), toY(seg[k].lo));
      ctx.closePath();
      ctx.fillStyle = 'rgba(53,224,208,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(53,224,208,0.95)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    seg = [];
  };
  for (const p of pts) { if (p) seg.push(p); else flush(); }
  flush();
}

function drawFaults(ctx, data, toX, toY) {
  const len = Math.hypot(data.x2 - data.x1, data.z2 - data.z1);

  for (const f of FAULTS) {
    const pts = [];
    for (let j = 0; j <= 24; j++) {
      const y = f.topElev + (j / 24) * (f.botElev - f.topElev);
      const trace = C.faultTrace(f, y, 64);
      // 找出斷層跡與剖面線的交點
      const hit = intersect(data.x1, data.z1, data.x2, data.z2, trace);
      if (hit) pts.push({ d: hit * len, y });
    }
    if (pts.length < 2) continue;
    ctx.beginPath();
    pts.forEach((p, k) => { const x = toX(p.d), y = toY(p.y); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([]);
    ctx.stroke();

    // 標註與位移方向箭頭
    const mid = pts[(pts.length / 2) | 0];
    ctx.fillStyle = '#ff8fa3';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(f.id + '（斷距 ' + f.throw + ' m）', toX(mid.d) + 5, toY(pts[0].y) - 2);
  }
}

/**
 * 求折線與線段 A→B 的交點，回傳交點在 A→B 上的參數 t (0~1)；無交點回傳 null。
 */
function intersect(ax, az, bx, bz, poly) {
  for (let i = 0; i < poly.length - 1; i++) {
    const cx = poly[i].x, cz = poly[i].z;
    const dxp = poly[i + 1].x - cx, dzp = poly[i + 1].z - cz;
    const rx = bx - ax, rz = bz - az;
    const den = rx * dzp - rz * dxp;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((cx - ax) * dzp - (cz - az) * dxp) / den;
    const u = ((cx - ax) * rz - (cz - az) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  }
  return null;
}

function drawWells(ctx, data, toX, toY) {
  const dx = data.x2 - data.x1, dz = data.z2 - data.z1;
  const len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const corridor = 300;

  const items = WELLS.map((w) => {
    const p = C.lonLatToWorld(w.lon, w.lat);
    return { kind: 'well', id: w.id, data: w, x: p.x, z: p.z, depth: w.depth, perf: w.perf, color: w.color };
  }).concat(MONITORS.map((m) => {
    const p = C.lonLatToWorld(m.lon, m.lat);
    return { kind: 'monitor', id: m.id, data: m, x: p.x, z: p.z };
  }));

  for (const it of items) {
    const rx = it.x - data.x1, rz = it.z - data.z1;
    const along = rx * ux + rz * uz;
    const perp = Math.abs(rx * (-uz) + rz * ux);
    if (along < 0 || along > len || perp > corridor) continue;
    const x = toX(along);
    const col = C.column(it.x, it.z);
    const surf = col.tops[0];

    if (it.kind === 'monitor') {
      ctx.fillStyle = '#8fd3ff';
      ctx.beginPath();
      ctx.moveTo(x, toY(surf) - 4); ctx.lineTo(x - 4, toY(surf) - 11); ctx.lineTo(x + 4, toY(surf) - 11);
      ctx.closePath(); ctx.fill();
      continue;
    }

    const c = '#' + it.color.toString(16).padStart(6, '0');
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, toY(surf));
    ctx.lineTo(x, toY(it.depth));
    ctx.stroke();
    if (it.perf) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(x, toY(it.perf[0]));
      ctx.lineTo(x, toY(it.perf[1]));
      ctx.stroke();
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = '#e8eef4';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(it.id, x, toY(surf) - 4);
    ctx.fillStyle = '#7d8fa1';
    ctx.fillText(perp < 30 ? '剖面上' : '投影 ' + perp.toFixed(0) + ' m', x, toY(surf) - 15);
  }
}

/** 判斷哪些斷層與剖面線相交（供標註使用） */
function faultsCrossing(data) {
  const out = [];
  for (const f of FAULTS) {
    let hit = false;
    for (let j = 0; j <= 8 && !hit; j++) {
      const y = f.topElev + (j / 8) * (f.botElev - f.topElev);
      if (intersect(data.x1, data.z1, data.x2, data.z2, C.faultTrace(f, y, 64)) !== null) hit = true;
    }
    if (hit) out.push(f);
  }
  return out;
}

C.section = { sample, draw, bearing, faultsCrossing };
})();
