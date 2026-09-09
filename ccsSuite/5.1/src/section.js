/*
 * section.js — 任意方位地質剖面（Canvas 2D）
 * 沿 A–A′ 密集取樣地層柱（與 3D 模型同一組層面函式），繪製地層填色／岩性花紋或屬性色帶、
 * 斷層跡（含斷距標註）、CO₂ 羽流透鏡、井軌跡投影、深度與距離刻度。
 */
window.CCSSection = (function () {
  'use strict';
  const THEMES = {
    light: { ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#fcfcfb', edge: 'rgba(11,11,11,0.55)' },
    dark: { ink: '#f2f1ec', ink2: '#c3c2b7', muted: '#8f8d85', grid: '#2c2c2a', axis: '#454540', surface: '#1a1a19', edge: 'rgba(0,0,0,0.6)' }
  };
  const TH = Object.assign({}, THEMES.light);
  function setTheme(mode) { Object.assign(TH, THEMES[mode] || THEMES.light); }
  const ON_FILL = '#1a1a19';
  const FONT = '11px system-ui, "Segoe UI", "Noto Sans TC", sans-serif';
  const M = { top: 30, right: 56, bottom: 36, left: 58 };

  /** 岩性花紋（依本體 lithology 鍵） */
  function lithoFill(ctx, x, y, w, h, f) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = f.color; ctx.fillRect(x, y, w, h);
    const dark = 'rgba(20,26,32,0.45)'; ctx.strokeStyle = dark; ctx.fillStyle = dark; ctx.lineWidth = 1;
    const lith = f.lithology || '';
    if (lith === 'sandstone' || lith === 'marine-clastics') {
      const sp = lith === 'sandstone' ? 7 : 10;
      for (let yy = y + 4; yy < y + h; yy += sp) for (let xx = x + 4 + (((yy / sp) | 0) % 2) * (sp / 2); xx < x + w; xx += sp + 1) { ctx.beginPath(); ctx.arc(xx, yy, 1, 0, Math.PI * 2); ctx.fill(); }
    } else if (lith === 'shale' || lith === 'mudstone') {
      if (lith === 'mudstone') ctx.setLineDash([6, 4]);
      for (let yy = y + 3; yy < y + h; yy += 4.5) { ctx.beginPath(); ctx.moveTo(x + 1, yy); ctx.lineTo(x + w - 1, yy); ctx.stroke(); }
    } else if (lith === 'sand-shale' || lith === 'coal-sand') {
      for (let yy = y + 3, n = 0; yy < y + h; yy += 5.5, n++) {
        if (n % 2 === 0) { if (lith === 'coal-sand') ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 1, yy); ctx.lineTo(x + w - 1, yy); ctx.stroke(); ctx.lineWidth = 1; }
        else for (let xx = x + 5; xx < x + w; xx += 9) { ctx.beginPath(); ctx.arc(xx, yy, 1, 0, Math.PI * 2); ctx.fill(); }
      }
    } else if (lith === 'gravel-sand' || lith === 'conglomerate') {
      const r = lith === 'conglomerate' ? 3.6 : 2.6;
      for (let yy = y + 6; yy < y + h; yy += 11) for (let xx = x + 7 + (((yy / 11) | 0) % 2) * 6; xx < x + w; xx += 13) { ctx.beginPath(); ctx.ellipse(xx, yy, r, r * 0.65, 0.4, 0, Math.PI * 2); ctx.stroke(); }
    } else if (lith === 'basement') {
      ctx.beginPath(); for (let k = -h; k < w + h; k += 9) { ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); } ctx.stroke();
    }
    ctx.restore();
  }

  function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) { // 回傳 A→B 的參數 t，無交點 null
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const den = rx * sy - ry * sx; if (Math.abs(den) < 1e-9) return null;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    return (t >= 0 && t <= 1 && u >= 0 && u <= 1) ? t : null;
  }

  /**
   * 取樣。opts: { n, plume:{center,rMax,thickness}, reservoir, wells:[{name,type,x,y,depth,perf,deviation,color}], monitors:[{id,x,y}] }
   */
  function sample(model, a, b, opts) {
    opts = opts || {};
    const n = opts.n || 260, nH = model.strat.length + 1;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const cols = []; let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + dx * t, y = a.y + dy * t;
      const tops = new Array(nH);
      for (let h = 0; h < nH; h++) tops[h] = model.depthNatural(h, x, y);
      if (tops[0] < zMin) zMin = tops[0]; if (tops[nH - 1] > zMax) zMax = tops[nH - 1];
      cols.push({ t, d: t * length, x, y, tops });
    }
    // 斷層跡：各深度取斷層面直線與剖面線交點
    const hx = model.grid.halfX, hy = model.grid.halfY;
    const faults = model.faults.map(f => {
      const d = f.def, pts = [];
      const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      let umin = Infinity, umax = -Infinity;
      for (const c of corners) { const u = f.u(c[0], c[1]); umin = Math.min(umin, u); umax = Math.max(umax, u); }
      const zTop = Math.max(0, (d.tipDepth || 0) - 50), zBot = d.bottomDepth || model.grid.depthMax;
      for (let j = 0; j <= 30; j++) {
        const z = zTop + (zBot - zTop) * j / 30;
        const p0 = f.point(umin, z), p1 = f.point(umax, z);
        const t = segIntersect(a.x, a.y, b.x, b.y, p0[0], p0[1], p1[0], p1[1]);
        if (t != null) pts.push({ d: t * length, z });
      }
      return { name: d.name, def: d, fault: f, pts, throwAt: f.throwAt.bind(f) };
    }).filter(f => f.pts.length >= 2);
    // 羽流透鏡（儲層頂面往下 h(r)）
    let plume = null;
    if (opts.plume && opts.plume.rMax > 0 && opts.reservoir != null) {
      const L = opts.reservoir, pl = opts.plume; plume = [];
      for (const c of cols) {
        const r = Math.hypot(c.x - pl.center.x, c.y - pl.center.y);
        if (r >= pl.rMax) { plume.push(null); continue; }
        const h = pl.thickness(r) / Math.max(pl.ntg || 1, 0.05);
        const top = c.tops[L], base = Math.min(c.tops[L + 1], top + h);
        plume.push(h > 0.5 ? { d: c.d, top, base } : null);
      }
    }
    // 井投影（走廊寬度 = 剖面長 8% 或 400 m）
    const ux = dx / length, uy = dy / length, corridor = Math.max(400, length * 0.08);
    const wells = (opts.wells || []).map(w => {
      const rx = w.x - a.x, ry = w.y - a.y, along = rx * ux + ry * uy, perp = Math.abs(-rx * uy + ry * ux);
      if (along < 0 || along > length || perp > corridor) return null;
      const surf = model.depthNatural(0, w.x, w.y);
      const path = [];
      const depth = w.depth != null ? w.depth : (w.perf ? w.perf[1] + 50 : surf + 1000);
      for (let k = 0; k <= 24; k++) {
        const f = k / 24, z = surf + (depth - surf) * f;
        let ox = 0, oy = 0;
        if (w.deviation) { const s = Math.max(0, (f - 0.35) / 0.65), ss = s * s * (3 - 2 * s); ox = w.deviation.east * ss; oy = w.deviation.north * ss; }
        const px = w.x + ox - a.x, py = w.y + oy - a.y;
        path.push({ d: px * ux + py * uy, z });
      }
      return { name: w.name, type: w.type, along, perp, surf, depth, perf: w.perf, color: w.color, path };
    }).filter(Boolean);
    const monitors = (opts.monitors || []).map(m => {
      const rx = m.x - a.x, ry = m.y - a.y, along = rx * ux + ry * uy, perp = Math.abs(-rx * uy + ry * ux);
      if (along < 0 || along > length || perp > corridor) return null;
      return { id: m.id, kind: m.kind, along, surf: model.depthNatural(0, m.x, m.y) };
    }).filter(Boolean);
    let bearing = Math.atan2(dx, dy) * 180 / Math.PI; if (bearing < 0) bearing += 360;
    return { cols, length, a, b, faults, plume, wells, monitors, zMin, zMax, bearing, nH };
  }

  /**
   * 繪製。opts: { width, height, strat, colorMode, sampler, reservoir, title, ve(optional fixed) }
   * 回傳 layout（供 hover 對應）
   */
  function draw(canvas, data, opts) {
    opts = opts || {};
    const dpr = window.devicePixelRatio || 1, W = opts.width || 860, H = opts.height || 420;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const strat = opts.strat, nL = strat.length;
    const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
    const zTop = Math.floor(Math.min(data.zMin, 0) / 100) * 100, zBot = Math.ceil(data.zMax / 100) * 100;
    const toX = d => M.left + d / data.length * pw, toY = z => M.top + (z - zTop) / (zBot - zTop) * ph;
    const ve = (ph / (zBot - zTop)) / (pw / data.length);
    ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, W, H);
    ctx.font = FONT; ctx.textBaseline = 'middle';
    // 地層（由深至淺疊繪）
    const mode = opts.colorMode || 'lithology';
    for (let i = nL - 1; i >= 0; i--) {
      const f = strat[i], segs = []; let cur = null;
      for (const c of data.cols) {
        if (c.tops[i + 1] - c.tops[i] > 0.4) { if (!cur) { cur = []; segs.push(cur); } cur.push(c); } else cur = null;
      }
      for (const seg of segs) {
        if (seg.length < 2) continue;
        ctx.beginPath();
        seg.forEach((c, k) => { const px = toX(c.d), py = toY(c.tops[i]); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        for (let k = seg.length - 1; k >= 0; k--) ctx.lineTo(toX(seg[k].d), toY(seg[k].tops[i + 1]));
        ctx.closePath();
        ctx.save(); ctx.clip();
        if (mode === 'lithology' || !opts.sampler) lithoFill(ctx, toX(seg[0].d), M.top, Math.max(1, toX(seg[seg.length - 1].d) - toX(seg[0].d)), ph, f);
        else paintProperty(ctx, seg, i, mode, opts.sampler, toX, toY);
        ctx.restore();
        ctx.beginPath(); seg.forEach((c, k) => { const px = toX(c.d), py = toY(c.tops[i]); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.strokeStyle = TH.edge; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // 羽流
    if (data.plume) {
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          ctx.beginPath(); seg.forEach((p, k) => { const x = toX(p.d), y = toY(p.top); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
          for (let k = seg.length - 1; k >= 0; k--) ctx.lineTo(toX(seg[k].d), toY(seg[k].base));
          ctx.closePath(); ctx.fillStyle = 'rgba(235,104,52,0.6)'; ctx.fill(); ctx.strokeStyle = '#eb6834'; ctx.lineWidth = 1.2; ctx.stroke();
        }
        seg = [];
      };
      for (const p of data.plume) { if (p) seg.push(p); else flush(); }
      flush();
    }
    // 斷層跡
    for (const f of data.faults) {
      ctx.beginPath(); f.pts.forEach((p, k) => { const x = toX(p.d), y = toY(p.z); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.strokeStyle = '#b0413e'; ctx.lineWidth = 2; ctx.stroke();
      const mid = f.pts[Math.floor(f.pts.length / 2)];
      const thr = opts.reservoir != null ? f.throwAt(0, mid.z) : f.def.throw;
      ctx.fillStyle = '#b0413e'; ctx.textAlign = 'left'; ctx.fillText(f.name + (thr > 1 ? `（斷距 ${thr.toFixed(0)} m）` : ''), toX(f.pts[0].d) + 4, toY(f.pts[0].z) + 8);
    }
    // 井
    for (const w of data.wells) {
      const col = w.color || (w.type === 'injection' ? TH.ink : '#2a78d6');
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      w.path.forEach((p, k) => { const x = toX(p.d), y = toY(p.z); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      if (w.perf) {
        const seg = w.path.filter(p => p.z >= w.perf[0] - 1 && p.z <= w.perf[1] + 1);
        if (seg.length > 1) { ctx.lineWidth = 6; ctx.strokeStyle = '#e34948'; ctx.beginPath(); seg.forEach((p, k) => { const x = toX(p.d), y = toY(p.z); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); }
      }
      ctx.fillStyle = TH.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(w.name, toX(w.path[0].d), toY(w.surf) - 4);
      ctx.fillStyle = TH.muted; ctx.fillText(w.perp < 30 ? '剖面上' : '投影 ' + w.perp.toFixed(0) + ' m', toX(w.path[0].d), toY(w.surf) - 16);
      ctx.textBaseline = 'middle';
    }
    for (const m of data.monitors) {
      const x = toX(m.along), y = toY(m.surf);
      ctx.fillStyle = '#1baf7a'; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x - 5, y - 12); ctx.lineTo(x + 5, y - 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = TH.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(m.id, x, y - 14); ctx.textBaseline = 'middle';
    }
    // 座標框與刻度
    ctx.strokeStyle = TH.axis; ctx.lineWidth = 1; ctx.strokeRect(M.left + 0.5, M.top + 0.5, pw, ph);
    const zStep = (zBot - zTop) > 3000 ? 1000 : 500;
    ctx.fillStyle = TH.muted; ctx.textAlign = 'right';
    for (let z = Math.ceil(zTop / zStep) * zStep; z <= zBot; z += zStep) {
      const y = toY(z); ctx.strokeStyle = TH.grid; ctx.beginPath(); ctx.moveTo(M.left, y); ctx.lineTo(M.left + pw, y); ctx.stroke();
      ctx.fillText(z.toFixed(0), M.left - 6, y); ctx.textAlign = 'left'; ctx.fillText(z.toFixed(0), M.left + pw + 6, y); ctx.textAlign = 'right';
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const dStep = data.length > 8000 ? 2000 : data.length > 3000 ? 1000 : 500;
    for (let d = 0; d <= data.length; d += dStep) {
      const x = toX(d); ctx.strokeStyle = TH.grid; ctx.beginPath(); ctx.moveTo(x, M.top); ctx.lineTo(x, M.top + ph); ctx.stroke();
      ctx.fillStyle = TH.muted; ctx.fillText((d / 1000).toFixed(1), x, M.top + ph + 5);
    }
    ctx.fillStyle = TH.ink2; ctx.fillText('沿剖面距離 (km)', M.left + pw / 2, H - 14);
    ctx.save(); ctx.translate(12, M.top + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText('深度 (m, 海平面下)', 0, 0); ctx.restore();
    // 標題與端點
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = TH.ink; ctx.font = '600 12px system-ui, "Segoe UI", "Noto Sans TC", sans-serif';
    ctx.fillText(opts.title || '地質剖面 A–A′', M.left, 12);
    ctx.font = FONT; ctx.fillStyle = TH.ink2; ctx.textAlign = 'right';
    ctx.fillText(`長度 ${(data.length / 1000).toFixed(2)} km｜方位 ${data.bearing.toFixed(0)}°｜垂直放大 ×${ve.toFixed(1)}`, M.left + pw, 12);
    ctx.font = '700 13px system-ui, "Segoe UI", sans-serif'; ctx.fillStyle = '#eb6834';
    ctx.textAlign = 'left'; ctx.fillText('A', M.left + 3, M.top + 10); ctx.textAlign = 'right'; ctx.fillText("A′", M.left + pw - 3, M.top + 10);
    // 地層名稱（左側，厚度足夠者）：畫在地層填色上，填色不隨主題變，故固定用深墨色
    ctx.font = FONT; ctx.fillStyle = ON_FILL; ctx.textAlign = 'left';
    const c0 = data.cols[Math.floor(data.cols.length * 0.04)];
    for (let i = 0; i < nL; i++) { const th = toY(c0.tops[i + 1]) - toY(c0.tops[i]); if (th > 11) ctx.fillText(strat[i].name, toX(c0.d) + 3, (toY(c0.tops[i]) + toY(c0.tops[i + 1])) / 2); }
    return { toX, toY, fromPx: px => (px - M.left) / pw * data.length, fromPy: py => zTop + (py - M.top) / ph * (zBot - zTop), ve, zTop, zBot, M, pw, ph };
  }

  function paintProperty(ctx, seg, index, mode, sampler, toX, toY) {
    const P = window.CCSPetro, nz = 24;
    for (let k = 0; k < seg.length; k++) {
      const c = seg[k];
      const xa = toX(k > 0 ? (c.d + seg[k - 1].d) / 2 : c.d), xb = toX(k < seg.length - 1 ? (c.d + seg[k + 1].d) / 2 : c.d);
      const w = Math.max(1, xb - xa + 1), top = c.tops[index], h = c.tops[index + 1] - top;
      for (let j = 0; j < nz; j++) {
        const zRel = (j + 0.5) / nz;
        const col = P.colorFor(mode, sampler.propsAt(index, c.x, c.y, zRel)); if (!col) continue;
        ctx.fillStyle = 'rgb(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ')';
        const y0 = toY(top + h * j / nz), y1 = toY(top + h * (j + 1) / nz);
        ctx.fillRect(xa, y0, w, Math.max(1, y1 - y0 + 1));
      }
    }
  }

  /** hover 對應：回傳距離、深度、地層索引、層內相對深度 */
  function locate(data, layout, px, py) {
    const d = layout.fromPx(px), z = layout.fromPy(py);
    if (d < 0 || d > data.length) return null;
    const i = Math.min(data.cols.length - 1, Math.max(0, Math.round(d / data.length * (data.cols.length - 1))));
    const c = data.cols[i];
    for (let L = 0; L < data.nH - 1; L++) if (z >= c.tops[L] && z < c.tops[L + 1]) return { d, z, x: c.x, y: c.y, formation: L, zRel: (z - c.tops[L]) / Math.max(c.tops[L + 1] - c.tops[L], 1e-6) };
    return { d, z, x: c.x, y: c.y, formation: -1, zRel: 0 };
  }

  return { sample, draw, locate, lithoFill, setTheme };
})();
