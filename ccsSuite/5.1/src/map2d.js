/*
 * map2d.js — 2D 圖台（canvas，TWD97 TM2 投影）
 * 圖層：海域底色、等深線（NE 10m）、福建沿岸、縣市界、沉積盆地／基盤高區、活動斷層、CO2 排放源、油氣田、城市、經緯網
 * 覆疊：作用中場址的模型範圍、斷層投影線、注入井與觀測井、監測站、向量圖徵、CO₂ 羽流、壓力影響半徑、
 *       運移路徑、閉合區、剖切線、剖面線 A–A′、取點標記、3D 相機視錐投影
 * 互動：拖曳平移、滾輪縮放、hover 提示、點選場址、取點模式（井位／剖面／井柱）、一般點選（虛擬鑽井）
 */
window.CCSMap2D = (function () {
  'use strict';
  const G = () => window.CCSGeo;
  const THEMES = {
    light: {
      sea: '#dbe7f2', sea200: '#c5d8ea', sea1000: '#b0c9e0', sea2000: '#9dbad6',
      land: '#f4f0e6', landEdge: '#c9c2b2', mainland: '#ebe6da',
      basin: 'rgba(42,120,214,0.10)', basinEdge: 'rgba(42,120,214,0.55)', basinLabel: '#1c5cab', high: 'rgba(201,140,140,0.16)', highEdge: 'rgba(160,80,80,0.6)', highLabel: '#7a3f3f',
      fault: '#b0413e', source: 'rgba(82,81,78,0.55)', sourceEdge: '#52514e', field: '#6b5b95', city: '#52514e',
      grat: 'rgba(0,0,0,0.08)', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', halo: 'rgba(255,255,255,0.85)', scaleBg: 'rgba(255,255,255,0.8)',
      saline: '#2a78d6', depleted: '#eb6834', active: '#0b0b0b', footprint: 'rgba(11,11,11,0.75)',
      plume: 'rgba(235,104,52,0.35)', plumeEdge: '#eb6834', pressure: '#2a78d6', closure: 'rgba(237,161,0,0.35)', cut: '#898781', well: '#0b0b0b', obs: '#2a78d6', obsLabel: '#1c5cab',
      section: '#eb6834', camera: 'rgba(74,58,167,0.07)', cameraEdge: 'rgba(74,58,167,0.5)', pick: '#1baf7a'
    },
    // 深色底圖：海域深藍灰、陸域暖灰，圖徵色略提亮以維持對比
    dark: {
      sea: '#18222d', sea200: '#1c2a39', sea1000: '#213345', sea2000: '#263c51',
      land: '#2c2b26', landEdge: '#4d4b43', mainland: '#26251f',
      basin: 'rgba(57,135,229,0.14)', basinEdge: 'rgba(57,135,229,0.65)', basinLabel: '#86b4f0', high: 'rgba(201,140,140,0.18)', highEdge: 'rgba(220,120,120,0.6)', highLabel: '#e0a0a0',
      fault: '#e06a66', source: 'rgba(195,194,183,0.5)', sourceEdge: '#c3c2b7', field: '#b7a9f0', city: '#c3c2b7',
      grat: 'rgba(255,255,255,0.08)', ink: '#f2f1ec', ink2: '#c3c2b7', muted: '#8f8d85', halo: 'rgba(18,18,17,0.85)', scaleBg: 'rgba(28,28,27,0.8)',
      saline: '#3987e5', depleted: '#d95926', active: '#ffffff', footprint: 'rgba(242,241,236,0.8)',
      plume: 'rgba(217,89,38,0.4)', plumeEdge: '#f08a5c', pressure: '#3987e5', closure: 'rgba(237,161,0,0.35)', cut: '#8f8d85', well: '#f2f1ec', obs: '#6fa8ec', obsLabel: '#86b4f0',
      section: '#f08a5c', camera: 'rgba(144,133,233,0.09)', cameraEdge: 'rgba(144,133,233,0.6)', pick: '#2fd396'
    }
  };
  const C = Object.assign({}, THEMES.light);
  function applyTheme(mode) { Object.assign(C, THEMES[mode] || THEMES.light); }
  const MONITOR_COLORS = { flux: '#1baf7a', seismic: '#eda100', water: '#2a78d6', insar: '#4a3aa7', pressure: '#e87ba4' };
  const FONT = '11px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';

  function create(container, data) {
    const canvas = document.createElement('canvas');
    canvas.className = 'map-canvas';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const geo = G();
    const view = { cx: 160000, cy: 2600000, scale: 0.0012 };
    const layers = { bathymetry: true, basins: true, faults: true, sources: true, fields: true, cities: true, graticule: true, camera: true };
    const state = { sites: [], activeId: null, overlay: null, hover: null, mode: null, results: {} };
    const handlers = {};
    const on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
    const emit = (ev, arg) => { (handlers[ev] || []).forEach(fn => fn(arg)); };
    let W = 0, H = 0, dpr = 1;

    const proj = fc => ({ features: fc.features.map(ft => ({ properties: ft.properties, geometry: projGeom(ft.geometry) })) });
    function projRing(r) { return r.map(c => { const p = geo.tm2Forward(c[0], c[1]); return [p.x, p.y]; }); }
    function projGeom(g) {
      if (!g) return null;
      if (g.type === 'Polygon') return { type: 'Polygon', rings: g.coordinates.map(projRing) };
      if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', polys: g.coordinates.map(p => p.map(projRing)) };
      if (g.type === 'LineString') return { type: 'LineString', line: projRing(g.coordinates) };
      if (g.type === 'Point') { const p = geo.tm2Forward(g.coordinates[0], g.coordinates[1]); return { type: 'Point', x: p.x, y: p.y }; }
      return null;
    }
    const D = {
      counties: proj(data.basemap.counties), mainland: proj(data.basemap.mainland), bathy: proj(data.basemap.bathymetry),
      basins: proj(data.geology.basins), faults: proj(data.geology.faults), sources: proj(data.geology.sources), fields: proj(data.geology.fields),
      cities: data.geology.cities.map(c => { const p = geo.tm2Forward(c[1], c[2]); return { name: c[0], x: p.x, y: p.y }; })
    };
    for (const ft of D.basins.features) { const r = ft.geometry.rings[0]; let sx = 0, sy = 0; for (const p of r) { sx += p[0]; sy += p[1]; } ft.label = [sx / r.length, sy / r.length]; }

    const sx = x => (x - view.cx) * view.scale + W / 2;
    const sy = y => H / 2 - (y - view.cy) * view.scale;
    const toWorld = (px, py) => ({ x: (px - W / 2) / view.scale + view.cx, y: view.cy - (py - H / 2) / view.scale });

    function resize() {
      dpr = window.devicePixelRatio || 1;
      W = container.clientWidth; H = container.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      render();
    }
    function pathRings(rings) {
      for (const r of rings) { for (let i = 0; i < r.length; i++) { const x = sx(r[i][0]), y = sy(r[i][1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); }
    }
    function fillGeom(g, fill, stroke, lw) {
      ctx.beginPath();
      if (g.type === 'Polygon') pathRings(g.rings); else if (g.type === 'MultiPolygon') g.polys.forEach(pathRings);
      if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }
    function label(text, x, y, opts) {
      opts = opts || {};
      ctx.font = opts.font || FONT; ctx.textAlign = opts.align || 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
      ctx.fillStyle = opts.color || C.ink2; ctx.fillText(text, x, y);
    }

    function render() {
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C.sea; ctx.fillRect(0, 0, W, H);
      if (layers.bathymetry) {
        for (const d of [200, 1000, 2000]) for (const ft of D.bathy.features) if (ft.properties.depth === d) fillGeom(ft.geometry, d === 200 ? C.sea200 : d === 1000 ? C.sea1000 : C.sea2000, null);
        if (view.scale > 0.0008) for (const ft of D.bathy.features) fillGeom(ft.geometry, null, 'rgba(42,120,214,0.25)', 1);
      }
      for (const ft of D.mainland.features) fillGeom(ft.geometry, C.mainland, C.landEdge, 1);
      for (const ft of D.counties.features) fillGeom(ft.geometry, C.land, C.landEdge, 0.8);
      if (layers.basins) for (const ft of D.basins.features) {
        const isHigh = ft.properties.kind === 'high';
        fillGeom(ft.geometry, isHigh ? C.high : C.basin, isHigh ? C.highEdge : C.basinEdge, 1);
        label(ft.properties.name, sx(ft.label[0]), sy(ft.label[1]), { align: 'center', color: isHigh ? C.highLabel : C.basinLabel, font: '600 11px system-ui, "Segoe UI", "Noto Sans TC", sans-serif' });
      }
      if (layers.graticule) drawGraticule();
      if (layers.faults) for (const ft of D.faults.features) {
        const l = ft.geometry.line; ctx.beginPath();
        for (let i = 0; i < l.length; i++) { const x = sx(l[i][0]), y = sy(l[i][1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = C.fault; ctx.lineWidth = 1.5; ctx.stroke();
        if (view.scale > 0.0025) label(ft.properties.name, sx(l[0][0]) + 4, sy(l[0][1]) - 6, { color: C.fault });
      }
      if (layers.cities) for (const c of D.cities) {
        const x = sx(c.x), y = sy(c.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        ctx.fillStyle = C.city; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        label(c.name, x + 5, y, { color: C.ink2 });
      }
      if (layers.fields) for (const ft of D.fields.features) {
        const x = sx(ft.geometry.x), y = sy(ft.geometry.y);
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.field; ctx.lineWidth = 1.5; ctx.stroke();
        if (view.scale > 0.002) label(ft.properties.name, x + 7, y + 8, { color: C.field });
      }
      if (layers.sources) for (const ft of D.sources.features) {
        const x = sx(ft.geometry.x), y = sy(ft.geometry.y), r = 3 + 2.2 * Math.sqrt(ft.properties.emission_mtpa);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = C.source; ctx.fill(); ctx.strokeStyle = C.sourceEdge; ctx.lineWidth = 1; ctx.stroke();
      }
      drawOverlay();
      drawSites();
      drawScaleBar();
      const hints = { well: '井位設定模式：在模型範圍內點選以移動注入井', section: '剖面模式：在模型範圍內點 A、再點 A′', log: '井柱模式：在模型範圍內點一點' };
      if (state.mode && hints[state.mode]) { ctx.fillStyle = 'rgba(235,104,52,0.95)'; ctx.font = '600 12px system-ui, "Segoe UI", "Noto Sans TC", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(hints[state.mode], 12, 18); }
    }

    function drawGraticule() {
      const tl = toWorld(0, 0), br = toWorld(W, H);
      const a = geo.tm2Inverse(tl.x, tl.y), b = geo.tm2Inverse(br.x, br.y);
      const step = view.scale > 0.006 ? 0.1 : view.scale > 0.0025 ? 0.25 : view.scale > 0.0009 ? 0.5 : 1;
      ctx.strokeStyle = C.grat; ctx.lineWidth = 1;
      for (let lon = Math.floor(a.lon / step) * step; lon <= b.lon + step; lon += step) {
        ctx.beginPath(); for (let k = 0; k <= 10; k++) { const lat = b.lat + (a.lat - b.lat) * k / 10; const p = geo.tm2Forward(lon, lat); const x = sx(p.x), y = sy(p.y); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
        const p = geo.tm2Forward(lon, b.lat); label(lon.toFixed(step < 1 ? 2 : 0) + '°E', sx(p.x) + 3, H - 8, { color: C.muted });
      }
      for (let lat = Math.floor(b.lat / step) * step; lat <= a.lat + step; lat += step) {
        ctx.beginPath(); for (let k = 0; k <= 10; k++) { const lon = a.lon + (b.lon - a.lon) * k / 10; const p = geo.tm2Forward(lon, lat); const x = sx(p.x), y = sy(p.y); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
        const p = geo.tm2Forward(a.lon, lat); label(lat.toFixed(step < 1 ? 2 : 0) + '°N', 4, sy(p.y) - 7, { color: C.muted });
      }
    }

    function siteScreen(s) { return { x: sx(s._tm.x), y: sy(s._tm.y) }; }
    function drawSites() {
      for (const s of state.sites) {
        const { x, y } = siteScreen(s), active = s.id === state.activeId, hov = state.hover && state.hover.kind === 'site' && state.hover.item === s;
        const col = s.type === 'depleted_gas' ? C.depleted : C.saline, r = active ? 9 : hov ? 8 : 6.5;
        ctx.beginPath();
        if (s.type === 'depleted_gas') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
        else ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = s.setting === 'offshore' ? '#fff' : col; ctx.fill();
        ctx.lineWidth = active ? 3 : 2; ctx.strokeStyle = active ? C.active : col; ctx.stroke();
        if (s.setting === 'offshore') { ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
        const res = state.results[s.id];
        label(s.id + ' ' + s.name + (res ? '  ' + res.capacity.mass.toFixed(0) + ' Mt' : ''), x + r + 4, y - 1, { color: active ? C.ink : C.ink2, font: active ? '600 12px system-ui, "Segoe UI", "Noto Sans TC", sans-serif' : FONT });
      }
    }

    function drawOverlay() {
      const o = state.overlay; if (!o) return;
      const ox = o.origin.x, oy = o.origin.y;
      const L = (x, y) => [sx(ox + x), sy(oy + y)];
      const hx = o.extent[0] / 2, hy = o.extent[1] / 2;
      // 相機視錐投影
      if (layers.camera && o.camera && o.camera.footprint) {
        ctx.beginPath(); o.camera.footprint.forEach((p, i) => { const q = L(p[0], p[1]); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }); ctx.closePath();
        ctx.fillStyle = C.camera; ctx.fill(); ctx.strokeStyle = C.cameraEdge; ctx.lineWidth = 1; ctx.stroke();
        const t = L(o.camera.target.x, o.camera.target.y); ctx.fillStyle = C.cameraEdge; ctx.beginPath(); ctx.arc(t[0], t[1], 3.5, 0, Math.PI * 2); ctx.fill();
        const c = L(o.camera.camera.x, o.camera.camera.y); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(c[0], c[1], 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      }
      if (o.closureCells && view.scale > 0.004) {
        ctx.fillStyle = C.closure;
        const cw = o.grid.dx * view.scale + 0.5, ch = o.grid.dy * view.scale + 0.5;
        for (const [x, y] of o.closureCells) { const p = L(x - o.grid.dx / 2, y + o.grid.dy / 2); ctx.fillRect(p[0], p[1], cw, ch); }
      }
      ctx.beginPath(); const c0 = L(-hx, -hy), c1 = L(hx, -hy), c2 = L(hx, hy), c3 = L(-hx, hy);
      ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath();
      ctx.strokeStyle = C.footprint; ctx.lineWidth = 1.5; ctx.stroke();
      if (state.mode) { ctx.fillStyle = 'rgba(235,104,52,0.08)'; ctx.fill(); }
      if (o.cut && view.scale > 0.002) {
        ctx.strokeStyle = C.cut; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        if (o.cut.xmax < hx) { const a = L(o.cut.xmax, -hy), b = L(o.cut.xmax, hy); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        if (o.cut.ymax < hy) { const a = L(-hx, o.cut.ymax), b = L(hx, o.cut.ymax); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
        ctx.setLineDash([]);
      }
      // 向量圖徵
      for (const v of (o.vectors || [])) {
        ctx.beginPath(); v.points.forEach((p, i) => { const q = L(p[0], p[1]); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
        if (v.closed) { ctx.closePath(); ctx.fillStyle = (v.color || '#1baf7a') + '22'; ctx.fill(); }
        ctx.strokeStyle = v.color || '#1baf7a'; ctx.lineWidth = 1.5; ctx.setLineDash(v.kind === 'pipeline' ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([]);
        if (view.scale > 0.003 && v.points.length) { const q = L(v.points[0][0], v.points[0][1]); label(v.name, q[0] + 4, q[1] - 6, { color: v.color || '#1baf7a' }); }
      }
      if (o.faultTraces) for (const tr of o.faultTraces) {
        if (tr.points.length < 2) continue;
        ctx.beginPath(); tr.points.forEach((p, i) => { const q = L(p[0], p[1]); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
        ctx.strokeStyle = C.fault; ctx.lineWidth = 2; ctx.stroke();
        if (view.scale > 0.004) { const q = L(tr.points[0][0], tr.points[0][1]); label(tr.fault.def.name, q[0] + 4, q[1] - 8, { color: C.fault }); }
      }
      if (o.well) {
        const w = L(o.well.x, o.well.y);
        if (o.rInf > 0) { ctx.beginPath(); ctx.arc(w[0], w[1], o.rInf * view.scale, 0, Math.PI * 2); ctx.strokeStyle = C.pressure; ctx.lineWidth = 1; ctx.stroke(); }
        if (o.migration && o.migration.length > 1) {
          ctx.beginPath(); o.migration.forEach((p, i) => { const q = L(p.x, p.y); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
          ctx.strokeStyle = C.plumeEdge; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (o.plume && o.plume.r > 0) {
          const c = L(o.plume.x, o.plume.y);
          ctx.beginPath(); ctx.arc(c[0], c[1], o.plume.r * view.scale, 0, Math.PI * 2); ctx.fillStyle = C.plume; ctx.fill(); ctx.strokeStyle = C.plumeEdge; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      // 井：注入井十字、觀測井雙圈（斜井加井底連線）
      for (const wl of (o.wells || [])) {
        const w = L(wl.x, wl.y);
        if (wl.type === 'observation') {
          if (wl.deviation) { const b = L(wl.x + wl.deviation.east, wl.y + wl.deviation.north); ctx.strokeStyle = C.obs; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.beginPath(); ctx.arc(b[0], b[1], 3, 0, Math.PI * 2); ctx.fillStyle = C.obs; ctx.fill(); }
          ctx.strokeStyle = C.obs; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w[0], w[1], 5, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(w[0], w[1], 1.8, 0, Math.PI * 2); ctx.fillStyle = C.obs; ctx.fill();
          if (view.scale > 0.002) label(wl.name, w[0] + 8, w[1] + 8, { color: C.obsLabel });
        } else {
          ctx.strokeStyle = C.well; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w[0], w[1], 5, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(w[0] - 8, w[1]); ctx.lineTo(w[0] + 8, w[1]); ctx.moveTo(w[0], w[1] - 8); ctx.lineTo(w[0], w[1] + 8); ctx.stroke();
          if (view.scale > 0.002) label(wl.name || 'INJ', w[0] + 9, w[1] + 10, { color: C.ink });
        }
      }
      for (const m of (o.monitors || [])) {
        const p = L(m.x, m.y), col = MONITOR_COLORS[m.kind] || C.muted;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - 6); ctx.lineTo(p[0] + 5.5, p[1] + 4); ctx.lineTo(p[0] - 5.5, p[1] + 4); ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        if (view.scale > 0.004) label(m.id, p[0] + 7, p[1], { color: col });
      }
      // 剖面線與取點
      if (o.section && o.section.a) {
        const a = L(o.section.a.x, o.section.a.y);
        ctx.fillStyle = C.section; ctx.beginPath(); ctx.arc(a[0], a[1], 4, 0, Math.PI * 2); ctx.fill();
        label('A', a[0] - 12, a[1] - 8, { color: C.section, font: '700 13px system-ui, "Segoe UI", sans-serif' });
        if (o.section.b) {
          const b = L(o.section.b.x, o.section.b.y);
          ctx.strokeStyle = C.section; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(b[0], b[1], 4, 0, Math.PI * 2); ctx.fill();
          label('A′', b[0] + 6, b[1] - 8, { color: C.section, font: '700 13px system-ui, "Segoe UI", sans-serif' });
        }
      }
      if (o.pickMarker) { const p = L(o.pickMarker.x, o.pickMarker.y); ctx.strokeStyle = C.pick; ctx.lineWidth = 2; ctx.strokeRect(p[0] - 5, p[1] - 5, 10, 10); label(o.pickMarker.label || '井柱', p[0] + 8, p[1] + 9, { color: C.pick }); }
    }

    function drawScaleBar() {
      const target = 120 / view.scale;
      const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000].reduce((p, c) => Math.abs(c - target) < Math.abs(p - target) ? c : p);
      const px = nice * view.scale, x0 = 12, y0 = H - 22;
      ctx.fillStyle = C.scaleBg; ctx.fillRect(x0 - 4, y0 - 14, px + 8, 24);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0 + 4); ctx.moveTo(x0 + px, y0 - 4); ctx.lineTo(x0 + px, y0 + 4); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m', x0 + px / 2, y0 - 8);
    }

    // ---- 互動 ----
    let drag = null, moved = false;
    canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy }; moved = false; });
    window.addEventListener('mousemove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        view.cx = drag.cx - dx / view.scale; view.cy = drag.cy + dy / view.scale; render();
      }
    });
    window.addEventListener('mouseup', () => { drag = null; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const w = toWorld(px, py), ll = geo.tm2Inverse(w.x, w.y);
      const h = hitTest(px, py);
      const changed = (h && h.item) !== (state.hover && state.hover.item);
      state.hover = h;
      canvas.style.cursor = h && h.kind === 'site' ? 'pointer' : state.mode && insideFootprint(w) ? 'crosshair' : 'grab';
      emit('mousemove', { lon: ll.lon, lat: ll.lat, x: w.x, y: w.y, hover: h, px, py });
      if (changed) render();
    });
    canvas.addEventListener('mouseleave', () => { state.hover = null; emit('mousemove', null); render(); });
    canvas.addEventListener('click', e => {
      if (moved) return;
      const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const h = hitTest(px, py);
      if (h && h.kind === 'site') { emit('siteclick', h.item); return; }
      const w = toWorld(px, py), ll = geo.tm2Inverse(w.x, w.y);
      const inside = !!state.overlay && insideFootprint(w);
      const local = inside ? { x: w.x - state.overlay.origin.x, y: w.y - state.overlay.origin.y } : null;
      if (state.mode) { if (inside) emit('pick', { mode: state.mode, x: local.x, y: local.y }); return; }
      emit('click', { inside, local, lon: ll.lon, lat: ll.lat, x: w.x, y: w.y, hover: h });
    });
    canvas.addEventListener('dblclick', e => { const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    function zoomAt(px, py, f) {
      const before = toWorld(px, py);
      view.scale = Math.max(0.0002, Math.min(0.2, view.scale * f));
      const after = toWorld(px, py);
      view.cx += before.x - after.x; view.cy += before.y - after.y; render();
    }
    function insideFootprint(w) {
      const o = state.overlay; if (!o) return false;
      return Math.abs(w.x - o.origin.x) <= o.extent[0] / 2 && Math.abs(w.y - o.origin.y) <= o.extent[1] / 2;
    }
    function hitTest(px, py) {
      let best = null;
      const consider = (kind, item, x, y, tol) => { const d = Math.hypot(x - px, y - py); if (d <= tol && (!best || d < best.d)) best = { kind, item, d }; };
      for (const s of state.sites) { const p = siteScreen(s); consider('site', s, p.x, p.y, 12); }
      const o = state.overlay;
      if (o) {
        for (const wl of (o.wells || [])) consider('well', wl, sx(o.origin.x + wl.x), sy(o.origin.y + wl.y), 9);
        for (const m of (o.monitors || [])) consider('monitor', m, sx(o.origin.x + m.x), sy(o.origin.y + m.y), 8);
      }
      if (layers.sources) for (const ft of D.sources.features) consider('source', ft, sx(ft.geometry.x), sy(ft.geometry.y), 4 + 2.2 * Math.sqrt(ft.properties.emission_mtpa));
      if (layers.fields) for (const ft of D.fields.features) consider('field', ft, sx(ft.geometry.x), sy(ft.geometry.y), 8);
      if (layers.faults && !best) for (const ft of D.faults.features) {
        const l = ft.geometry.line;
        for (let i = 0; i + 1 < l.length; i++) { const d = geo.distPointSegment(px, py, sx(l[i][0]), sy(l[i][1]), sx(l[i + 1][0]), sy(l[i + 1][1])); if (d <= 5 && (!best || d < best.d)) best = { kind: 'fault', item: ft, d }; }
      }
      if (layers.basins && !best) { const w = toWorld(px, py); for (const ft of D.basins.features) { const g = ft.geometry; const inside = g.type === 'Polygon' ? geo.pointInPolygon(w.x, w.y, g.rings) : g.polys.some(p => geo.pointInPolygon(w.x, w.y, p)); if (inside) best = { kind: 'basin', item: ft, d: 99 }; } }
      return best;
    }

    const ro = new ResizeObserver(resize); ro.observe(container);
    resize();

    return {
      on, render, layers,
      setSites(sites) { state.sites = sites.map(s => { const p = geo.tm2Forward(s.location.lon, s.location.lat); return Object.assign(s, { _tm: p }); }); render(); },
      setActive(id) { state.activeId = id; render(); },
      setOverlay(o) { state.overlay = o; render(); },
      patchOverlay(part) { if (state.overlay) { Object.assign(state.overlay, part); render(); } },
      setResults(map) { state.results = map; render(); },
      setMode(m) { state.mode = m || null; render(); },
      zoomTo(lon, lat, scale) { const p = geo.tm2Forward(lon, lat); view.cx = p.x; view.cy = p.y; if (scale) view.scale = scale; render(); },
      centerOn(lon, lat) { const p = geo.tm2Forward(lon, lat); view.cx = p.x; view.cy = p.y; render(); },
      fitTaiwan() { view.cx = 195000; view.cy = 2600000; view.scale = Math.min(W / 420000, H / 460000); render(); },
      getView() { return Object.assign({}, view); },
      setTheme(mode) { applyTheme(mode); render(); },
      snapshot() { return canvas.toDataURL('image/png'); }
    };
  }
  return { create, colors: C };
})();
