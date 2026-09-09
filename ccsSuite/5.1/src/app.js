/*
 * app.js — 應用整合：狀態、場址切換、參數面板、評估結果、圖表、2D/3D 連動、屬性場著色、
 *          合成井柱、任意剖面、資訊卡、時間軸播放、MMV 圖徵、視域同步、匯入/匯出
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const G = window.CCSGeo, GM = window.CCSGeoModel, AS = window.CCSAssess, CH = window.CCSCharts, PT = window.CCSPetro, SEC = window.CCSSection, WL = window.CCSWellLog, PR = window.CCSProps;
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = (v, d) => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d }) : '–';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ROLE = { reservoir: '主要儲層', secondary: '次要儲層', seal: '封閉層', overburden: '覆蓋層／夾層', basement: '基盤' };
  const LITH = { 'gravel-sand': '礫砂', conglomerate: '礫岩', sandstone: '砂岩', 'sand-shale': '砂頁岩互層', shale: '頁岩', mudstone: '泥岩', 'coal-sand': '含煤砂頁岩', 'marine-clastics': '海相碎屑岩', basement: '基盤岩' };
  const RATING = { suitable: ['✔', '適合'], conditional: ['⚠', '有條件適合'], unsuitable: ['✖', '不適合'] };
  const RISK = { low: '低', moderate: '中', high: '高', critical: '臨界（原地應力已近破壞）' };
  const MON = { flux: 'CO₂ 通量／海水 pCO₂', seismic: '微震／海底地震儀', water: '地下水質', insar: 'InSAR 地表變形', pressure: '井下壓力' };
  const TREND = { uniform: '均一', fining: '向上變細（底部較佳）', coarsening: '向上變粗（頂部較佳）' };

  const App = { sites: clone(window.CCS_SITES), models: {}, grids: {}, results: {}, paramsBySite: {}, active: null, params: null, result: null, meshes: null,
    cut: { x: 0.65, y: 0.65 }, mode: null, charts: {}, plumeVisible: true, map: null, view: null, sampler: null, samplerKey: null,
    section: { a: null, b: null, data: null, layout: null }, log: null, follow3D: false, playing: null, explode: 0, camera: null, wells: [] };

  // ---------- 模型 ----------
  function getModel(site) {
    if (App.models[site.id]) return App.models[site.id];
    let coast = null;
    if (site.surface && site.surface.kind === 'coastal') {
      const d = 0.02 + Math.max(site.model.extent[0], site.model.extent[1]) / 2 / 100000;
      coast = G.coastQuery(window.CCS_BASEMAP.counties, [site.location.lon - d, site.location.lat - d, site.location.lon + d, site.location.lat + d]);
    }
    return (App.models[site.id] = GM.buildModel(site, coast));
  }
  function getGrid(site, L) {
    const key = site.id + ':' + L;
    if (!App.grids[key]) App.grids[key] = getModel(site).sampleFormationGrid(L);
    return App.grids[key];
  }
  function invalidateSite(id) { delete App.models[id]; for (const k of Object.keys(App.grids)) if (k.startsWith(id + ':')) delete App.grids[k]; }
  function defaultReservoir(site) { const i = site.stratigraphy.findIndex(f => f.role === 'reservoir'); return i >= 0 ? i : Math.max(0, site.stratigraphy.findIndex(f => f.role === 'secondary')); }
  function injectionWell(site) { return (site.wells || []).find(w => (w.type || 'injection') === 'injection') || { name: 'INJ-1', x: 0, y: 0 }; }
  function defaultParams(site) {
    const w = injectionWell(site);
    const p = AS.fillDefaults(site, { reservoir: defaultReservoir(site), well: { x: w.x, y: w.y, name: w.name },
      formations: site.stratigraphy.map(f => { const pf = PT.formationPetro(f); return { porosity: f.porosity, permeability: f.permeability, ntg: f.ntg == null ? 1 : f.ntg, vshale: f.vshale || 0, entryPressure: f.entryPressure || 0, phiSd: pf.phiSd, kSd: pf.kSd, trend: pf.trend }; }),
      hetero: Object.assign({}, PT.DEFAULT_HETERO, site.hetero || {}) });
    p.time = p.years;
    if (p.startYear == null) p.startYear = 2030;
    if (p.phiCut == null) p.phiCut = 0.10;
    if (p.vshCut == null) p.vshCut = 0.40;
    return p;
  }
  function evaluateSite(site, params) { return AS.evaluate(getModel(site), getGrid(site, params.reservoir), params); }
  function gridInterp(grid, x, y, arr) {
    const { w, h, dx, dy, x0, y0 } = grid; arr = arr || grid.top;
    const gx = Math.max(0, Math.min(w - 1.0001, (x - x0) / dx)), gy = Math.max(0, Math.min(h - 1.0001, (y - y0) / dy));
    const i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j;
    return (arr[j * w + i] * (1 - tx) + arr[j * w + i + 1] * tx) * (1 - ty) + (arr[(j + 1) * w + i] * (1 - tx) + arr[(j + 1) * w + i + 1] * tx) * ty;
  }

  /** 解析井（注入井取自參數；觀測井依 target 推算射孔層位） */
  function resolveWells() {
    const site = App.active, model = getModel(site), p = App.params, strat = site.stratigraphy, L = p.reservoir, r = App.result;
    const out = [];
    out.push({ name: p.well.name, type: 'injection', x: p.well.x, y: p.well.y, top: r.surfaceDepth, base: r.reservoir.base + 60, perfTop: r.reservoir.top, perfBase: r.reservoir.base, formation: L, note: '注入井（位置可於 2D/3D 點選調整）' });
    for (const w of (site.wells || [])) {
      if ((w.type || 'injection') !== 'observation') continue;
      const bx = w.x + (w.deviation ? w.deviation.east : 0), by = w.y + (w.deviation ? w.deviation.north : 0);
      let Lt = L;
      if (w.target === 'aboveSeal') { let sealIdx = -1; for (let i = L - 1; i >= 0; i--) if (strat[i].role === 'seal') { sealIdx = i; break; } Lt = sealIdx > 0 ? sealIdx - 1 : Math.max(0, L - 1); }
      else if (w.target && w.target !== 'reservoir') { const i = strat.findIndex(f => f.name === w.target); if (i >= 0) Lt = i; }
      const top = model.depthNatural(0, w.x, w.y);
      const perfTop = w.perf ? w.perf[0] : model.depthNatural(Lt, bx, by), perfBase = w.perf ? w.perf[1] : model.depthNatural(Lt + 1, bx, by);
      out.push({ name: w.name, type: 'observation', x: w.x, y: w.y, top, base: w.depth != null ? w.depth : perfBase + 40, perfTop, perfBase, deviation: w.deviation || null, formation: Lt, note: w.note || '', color: w.color });
    }
    return out;
  }
  function monitorsFor() { const model = getModel(App.active); return (App.active.monitors || []).map(m => Object.assign({}, m, { z: model.depthNatural(0, m.x, m.y) })); }
  function vectorsFor() {
    const model = getModel(App.active);
    return (App.active.vectors || []).map(v => {
      const pts = v.points ? v.points : (v.lonlat || []).map(c => model.frame.toLocal(c[0], c[1]));
      return { name: v.name, kind: v.kind, color: v.color, closed: !!v.closed, points2d: pts, points: pts.map(q => ({ x: q[0], y: q[1], z: model.depthNatural(0, q[0], q[1]) })) };
    });
  }

  // ---------- 屬性場取樣器 ----------
  function buildSampler() {
    const site = App.active, p = App.params, r = App.result, grid = getGrid(site, p.reservoir);
    const key = JSON.stringify([p.formations, p.hetero, p.swirr, p.reservoir]);
    const plume = r && r.plume.rMax > 0 ? { L: p.reservoir, center: r.plume.center, rMax: r.plume.rMax, thickness: r.plume.thickness, sgMax: (1 - p.swirr) * 0.9, ntg: p.formations[p.reservoir].ntg,
      resThick: (x, y) => Math.max(0, gridInterp(grid, x, y, grid.base) - gridInterp(grid, x, y, grid.top)) } : null;
    const sampler = PT.sampler({ strat: site.stratigraphy, formations: p.formations, hetero: p.hetero, swirr: p.swirr, rhoBrine: r ? r.rhoW : 1020, rhoCO2: r ? r.rhoC : 650, plume });
    const plumeOnly = key === App.samplerKey;
    App.sampler = sampler; App.samplerKey = key;
    return { sampler, plumeOnly };
  }

  // ---------- 場址切換 ----------
  function selectSite(id) {
    const site = App.sites.find(s => s.id === id); if (!site) return;
    stopPlay(); setMode(null); closeInfo();
    App.active = site;
    App.params = App.paramsBySite[id] || (App.paramsBySite[id] = defaultParams(site));
    App.section = { a: null, b: null, data: null, layout: null }; App.log = null; App.samplerKey = null;
    $('siteSelect').value = id;
    $('siteBadge').textContent = site.dataStatus === 'simulated' ? '模擬資料' : '匯入資料';
    $('modelTitle').textContent = site.name + '（' + site.model.extent[0] / 1000 + ' × ' + site.model.extent[1] / 1000 + ' km，深 ' + site.model.depthMax / 1000 + ' km）';
    App.map.setActive(id);
    App.map.zoomTo(site.location.lon, site.location.lat, Math.min($('map').clientWidth, $('map').clientHeight) / (Math.max(site.model.extent[0], site.model.extent[1]) * 2.2));
    $('loading').style.display = 'flex';
    App.cut = { x: 0.65, y: 0.65 }; $('cutX').value = 65; $('cutY').value = 65; $('cutXOut').textContent = '65%'; $('cutYOut').textContent = '65%';
    App.explode = 0; $('explode').value = 0; $('explodeOut').textContent = '0 m';
    setTimeout(() => {
      const model = getModel(site), hx = model.grid.halfX, hy = model.grid.halfY;
      const clip = { xmin: -hx, xmax: -hx + 2 * hx * App.cut.x, ymin: -hy, ymax: -hy + 2 * hy * App.cut.y };
      App.meshes = model.buildMeshes({ clip });
      App.view.setModel(model, App.meshes, clip);
      App.view.setFaultsVisible($('chkFaults').checked); App.view.setWaterVisible($('chkWater').checked);
      App.view.setMonitors(monitorsFor()); App.view.setVectors(vectorsFor());
      buildLegend(); buildParamsPanel(); buildStratTable(); updateColorbar();
      recompute();
      $('loading').style.display = 'none';
    }, 30);
  }

  let recomputeTimer = null;
  function scheduleRecompute() { clearTimeout(recomputeTimer); recomputeTimer = setTimeout(recompute, 40); }
  function recompute() {
    const site = App.active, p = App.params;
    try { App.result = evaluateSite(site, p); }
    catch (e) { console.error(e); alert('評估計算失敗：' + e.message); return; }
    App.results[site.id] = App.result;
    const { plumeOnly } = buildSampler();
    if (plumeOnly) App.view.refreshSaturation(p.reservoir); else App.view.setSampler(App.sampler);
    App.wells = resolveWells();
    renderResults(); updateStratValues(); update3D(); updateMapOverlay(); renderSiteList(); updateTimeline();
    App.map.setResults(App.results);
    if (!$('analysis').hidden) { if (App.section.data) runSection(App.section.a, App.section.b, true); if (App.log) showLog(App.log.x, App.log.y, App.log.title, App.log.well, true); }
  }

  function update3D() {
    const r = App.result, p = App.params, grid = getGrid(App.active, p.reservoir);
    App.view.setWells(App.wells);
    if (!App.plumeVisible || !(r.plume.rMax > 0)) { App.view.setPlume(null); return; }
    const t = p.time, sPt = r.series.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
    const path = r.migration.points.filter(q => q.t <= t + 1e-6).map(q => ({ x: q.x, y: q.y, z: gridInterp(grid, q.x, q.y) }));
    const pos = r.plume.center; path.push({ x: pos.x, y: pos.y, z: gridInterp(grid, pos.x, pos.y) });
    App.view.setPlume({ L: p.reservoir, center: { x: pos.x, y: pos.y }, rMax: r.plume.rMax, thickness: r.plume.thickness, zTop: (x, y) => gridInterp(grid, x, y),
      rInf: t <= p.years ? sPt.rInf : 0, well: p.well, path: t > p.years ? path : null, migrationLabel: fmt(pos.s, 0) + ' m @ ' + fmt(t, 0) + ' yr' });
  }
  function updateMapOverlay() {
    const r = App.result, p = App.params, model = getModel(App.active), grid = getGrid(App.active, p.reservoir), t = p.time;
    const sPt = r.series.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a);
    const hx = model.grid.halfX, hy = model.grid.halfY;
    App.map.setOverlay({
      origin: model.frame.origin, extent: App.active.model.extent, grid: { dx: grid.dx, dy: grid.dy },
      faultTraces: model.faultTraces(r.reservoir.top), well: p.well, wells: App.wells, monitors: App.active.monitors || [],
      vectors: vectorsFor().map(v => ({ name: v.name, kind: v.kind, color: v.color, closed: v.closed, points: v.points2d })),
      rInf: t <= p.years ? sPt.rInf : 0,
      plume: { x: r.plume.center.x, y: r.plume.center.y, r: r.plume.rMax },
      migration: t > p.years ? r.migration.points.filter(q => q.t <= t + 1e-6).concat([r.plume.center]) : null,
      closureCells: r.closure.exists ? r.closure.cells.map(k => [grid.x0 + (k % grid.w) * grid.dx, grid.y0 + Math.floor(k / grid.w) * grid.dy]) : null,
      cut: { xmax: -hx + 2 * hx * App.cut.x, ymax: -hy + 2 * hy * App.cut.y },
      section: App.section.a ? { a: App.section.a, b: App.section.b } : null,
      pickMarker: App.log ? { x: App.log.x, y: App.log.y, label: '井柱' } : null,
      camera: App.camera
    });
  }

  // ---------- 剖切 ----------
  let cutTimer = null;
  function applyCut() {
    clearTimeout(cutTimer);
    cutTimer = setTimeout(() => {
      const model = getModel(App.active), hx = model.grid.halfX, hy = model.grid.halfY;
      const clip = { xmin: -hx, xmax: -hx + 2 * hx * App.cut.x, ymin: -hy, ymax: -hy + 2 * hy * App.cut.y };
      App.meshes = model.buildMeshes({ clip });
      App.view.updateMeshes(App.meshes, clip);
      updateMapOverlay();
    }, 90);
  }

  // ---------- 圖例 ----------
  function buildLegend() {
    const site = App.active, el = $('legend');
    const rows = site.stratigraphy.map((f, i) => `<div class="legend-row ${f.role === 'reservoir' ? 'res' : ''}" data-i="${i}">
      <input type="checkbox" class="lv" checked title="顯示/隱藏"><span class="sw" style="background:${f.color}"></span>
      <span class="nm" title="${esc(f.nameEn || '')}">${esc(f.name)} <small>${ROLE[f.role] || ''}</small></span>
      <input type="range" class="lo" min="0.05" max="1" step="0.05" value="1" title="透明度"></div>`).join('');
    el.innerHTML = `<h4>地層 <small style="font-weight:400;color:var(--muted)">（勾選顯示・滑桿透明度）</small><button id="legendToggle" style="margin-left:auto;padding:0 6px;font-size:11px" title="收合／展開">－</button></h4><div id="legendBody">
      <div class="legend-btns"><button data-act="all">全部顯示</button><button data-act="rs">僅儲層與封閉層</button><button data-act="ob">覆蓋層半透明</button></div>${rows}
      <div class="legend-row"><span></span><span class="sw" style="background:#b0413e;opacity:.6"></span><span class="nm">斷層面</span><span></span></div>
      <div class="legend-row"><span></span><span class="sw" style="background:#eb6834"></span><span class="nm">CO₂ 羽流（顯示時刻）</span><span></span></div>
      <div class="legend-row"><span></span><span class="sw" style="background:var(--surface);border-color:#2a78d6;border-width:2px"></span><span class="nm">壓力影響半徑</span><span></span></div>
      <div class="legend-row"><span></span><span class="sw" style="background:#2a78d6"></span><span class="nm">觀測井（射孔綠）</span><span></span></div>
      <div class="legend-row"><span></span><span class="sw" style="background:#1baf7a"></span><span class="nm">監測站／許可區</span><span></span></div></div>`;
    $('legendToggle').addEventListener('click', () => { const b = $('legendBody'); b.hidden = !b.hidden; $('legendToggle').textContent = b.hidden ? '＋' : '－'; });
    el.querySelectorAll('.legend-row[data-i]').forEach(row => {
      const i = +row.dataset.i;
      row.querySelector('.lv').addEventListener('change', e => App.view.setLayerVisible(i, e.target.checked));
      row.querySelector('.lo').addEventListener('input', e => App.view.setLayerOpacity(i, +e.target.value));
    });
    el.querySelectorAll('.legend-btns button').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act;
      el.querySelectorAll('.legend-row[data-i]').forEach(row => {
        const i = +row.dataset.i, f = site.stratigraphy[i], lv = row.querySelector('.lv'), lo = row.querySelector('.lo');
        let vis = true, op = 1;
        if (act === 'rs') vis = (f.role === 'reservoir' || f.role === 'secondary' || f.role === 'seal');
        if (act === 'ob') op = (i < App.params.reservoir && f.role !== 'seal') ? 0.25 : 1;
        lv.checked = vis; lo.value = op; App.view.setLayerVisible(i, vis); App.view.setLayerOpacity(i, op);
      });
    }));
  }

  // ---------- 參數面板 ----------
  const getPath = (o, p) => p.split('.').reduce((a, k) => a == null ? undefined : a[k], o);
  const setPath = (o, p, v) => { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]]; a[ks[ks.length - 1]] = v; };
  function paramGroups() {
    const site = App.active, p = App.params, strat = site.stratigraphy, L = p.reservoir, depleted = site.type === 'depleted_gas';
    let sealIdx = -1; for (let i = L - 1; i >= 0; i--) if (strat[i].role === 'seal') { sealIdx = i; break; }
    const groups = [];
    groups.push({ title: '注入設計', open: true, fields: [
      { kind: 'select', label: '目標儲層', get: () => p.reservoir, set: v => { p.reservoir = +v; }, rebuild: true,
        options: strat.map((f, i) => ({ v: i, t: f.name + (f.role === 'reservoir' ? '（主要儲層）' : f.role === 'secondary' ? '（次要儲層）' : '（非儲層）'), disabled: !(f.role === 'reservoir' || f.role === 'secondary') })) },
      { path: 'injectionRate', label: '注入率', unit: 'Mt CO₂/yr', min: 0.05, max: 10, step: 0.05, digits: 2 },
      { path: 'years', label: '注入年限', unit: 'yr', min: 1, max: 60, step: 1, digits: 0, after: () => { if (p.time > p.years + p.postInjectionYears) p.time = p.years; } },
      { path: 'startYear', label: '注入起始年', unit: '西元', min: 2020, max: 2060, step: 1, digits: 0 },
      { path: 'time', label: '顯示時刻（羽流／運移）', unit: 'yr', min: 0, max: p.years + p.postInjectionYears, step: 1, digits: 0, hint: '超過注入年限即為停注後的浮力運移階段；與下方時間軸同步' },
      { path: 'postInjectionYears', label: '停注後模擬年數', unit: 'yr', min: 10, max: 500, step: 10, digits: 0, rebuild: true },
      { path: 'wellRadius', label: '井半徑 r_w', unit: 'm', min: 0.05, max: 0.3, step: 0.005, digits: 3 }
    ] });
    const resF = [
      { path: `formations.${L}.porosity`, label: '孔隙率 φ（均值）', min: 0.02, max: 0.4, step: 0.005, digits: 3 },
      { path: `formations.${L}.phiSd`, label: 'φ 標準差（屬性場）', min: 0, max: 0.1, step: 0.002, digits: 3 },
      { path: `formations.${L}.permeability`, label: '滲透率 k（幾何均值）', unit: 'mD', log: true, min: 0.01, max: 5000, digits: 2 },
      { path: `formations.${L}.kSd`, label: 'log₁₀k 標準差（屬性場）', min: 0, max: 1.2, step: 0.02, digits: 2 },
      { kind: 'select', label: '垂向粒序趨勢（屬性場）', get: () => p.formations[L].trend, set: v => { p.formations[L].trend = v; }, options: Object.keys(TREND).map(k => ({ v: k, t: TREND[k] })) },
      { path: `formations.${L}.ntg`, label: '淨毛比 NTG', min: 0.05, max: 1, step: 0.01, digits: 2 },
      { path: 'swirr', label: '不可動水飽和度 S_wirr', min: 0.05, max: 0.6, step: 0.01, digits: 2 },
      { path: 'sgr', label: '殘餘 CO₂ 飽和度 S_gr', min: 0.05, max: 0.5, step: 0.01, digits: 2, hint: '殘餘捕獲潛勢 = S_gr/(1−S_wirr)' },
      { path: 'krco2', label: 'CO₂ 端點相對滲透率 k_rCO₂', min: 0.1, max: 1, step: 0.01, digits: 2 },
      { path: 'rockCompressibility', label: '岩石壓縮係數 c_r', unit: '1/MPa', min: 1e-4, max: 2e-3, step: 1e-5, digits: 5 }
    ];
    if (depleted) resF.push(
      { path: 'conditions.depletion', label: '現況壓力／原始壓力（枯竭程度）', min: 0.1, max: 1, step: 0.01, digits: 2 },
      { path: 'conditions.gasSaturation', label: '原始含氣飽和度 S_g', min: 0.3, max: 0.9, step: 0.01, digits: 2 },
      { path: 'conditions.recoveryFactor', label: '天然氣採收率 R_f', min: 0.3, max: 0.95, step: 0.01, digits: 2 },
      { path: 'waterInvasion', label: '水侵佔孔隙比例 F_iw', min: 0, max: 0.5, step: 0.01, digits: 2 });
    groups.push({ title: '儲層物性：' + strat[L].name, open: true, fields: resF });
    const sealF = [];
    if (sealIdx >= 0) sealF.push(
      { path: `formations.${sealIdx}.entryPressure`, label: '封閉層 CO₂–鹵水毛細進入壓力 P_e（' + strat[sealIdx].name + '）', unit: 'MPa', min: 0.1, max: 15, step: 0.1, digits: 1, hint: '由水銀壓汞量測換算至 CO₂–鹵水系統（約 ×0.07–0.1）' },
      { path: `formations.${sealIdx}.vshale`, label: '封閉層泥質含量 V_sh', min: 0.3, max: 1, step: 0.01, digits: 2 });
    sealF.push(
      { path: 'sgrThreshold', label: '斷層 SGR 封閉門檻', min: 0.1, max: 0.4, step: 0.01, digits: 2, hint: 'Yielding et al. (1997)：SGR ≥ 15–20% 通常具封閉能力' },
      { path: 'friction', label: '斷層摩擦係數 μ', min: 0.3, max: 0.9, step: 0.01, digits: 2 },
      { path: 'cohesion', label: '斷層凝聚力 c', unit: 'MPa', min: 0, max: 10, step: 0.1, digits: 1 });
    groups.push({ title: '封閉層與斷層', fields: sealF });
    const tp = [
      { path: 'conditions.surfaceTemp', label: '地表／海床溫度', unit: '°C', min: 10, max: 30, step: 0.5, digits: 1 },
      { path: 'conditions.tempGradient', label: '地溫梯度', unit: '°C/km', min: 15, max: 45, step: 0.5, digits: 1 },
      { path: 'conditions.pressureGradient', label: '靜水壓梯度', unit: 'MPa/km', min: 9.5, max: 11.5, step: 0.05, digits: 2 }
    ];
    if (p.conditions.overpressure) tp.push(
      { path: 'conditions.overpressure.startDepth', label: '超壓起始深度', unit: 'm', min: 500, max: 5000, step: 50, digits: 0 },
      { path: 'conditions.overpressure.gradient', label: '超壓帶壓力梯度', unit: 'MPa/km', min: 10.5, max: 20, step: 0.1, digits: 1 });
    tp.push(
      { path: 'conditions.fractureGradient', label: '破裂壓力梯度', unit: 'MPa/km', min: 12, max: 22, step: 0.1, digits: 1 },
      { path: 'maxBhpFraction', label: '允許井底壓力／破裂壓力', min: 0.5, max: 1, step: 0.01, digits: 2 },
      { path: 'conditions.salinity', label: '地層水鹽度 TDS', unit: 'ppm', min: 1000, max: 250000, step: 500, digits: 0 },
      { path: 'conditions.stress.svGradient', label: '岩壓梯度 S_v', unit: 'MPa/km', min: 18, max: 27, step: 0.1, digits: 1 },
      { path: 'conditions.stress.shmaxRatio', label: 'S_Hmax / S_v', min: 0.5, max: 1.8, step: 0.01, digits: 2 },
      { path: 'conditions.stress.shminRatio', label: 'S_hmin / S_v', min: 0.4, max: 1.2, step: 0.01, digits: 2 },
      { path: 'conditions.stress.shmaxAzimuth', label: 'S_Hmax 方位', unit: '°', min: 0, max: 180, step: 1, digits: 0 });
    groups.push({ title: '溫壓場與地應力', fields: tp });
    groups.push({ title: '容量估算係數與屬性場 cutoff', fields: [
      { path: 'efficiency', label: '儲存效率係數 E（區域體積法）', min: 0.005, max: 0.1, step: 0.005, digits: 3, hint: 'US-DOE：鹽水層 P10–P90 約 0.5–5.5%' },
      { path: 'closureFill', label: '構造圈閉充填率', min: 0.1, max: 1, step: 0.05, digits: 2 },
      { path: 'phiCut', label: '屬性場容積：孔隙率下限', min: 0, max: 0.3, step: 0.01, digits: 2 },
      { path: 'vshCut', label: '屬性場容積：V_sh 上限', min: 0.05, max: 1, step: 0.05, digits: 2 },
      { path: 'hetero.major', label: '非均質尺度（大）', unit: 'm', min: 300, max: 5000, step: 50, digits: 0, hint: '屬性場側向相變／砂體尺度；影響著色、井柱與剖面' },
      { path: 'hetero.minor', label: '非均質尺度（中）', unit: 'm', min: 100, max: 2000, step: 25, digits: 0 },
      { path: 'hetero.fine', label: '非均質尺度（細）', unit: 'm', min: 50, max: 800, step: 10, digits: 0 }
    ] });
    return groups;
  }
  function buildParamsPanel() {
    const el = $('tab-params'), site = App.active;
    const openState = {}; el.querySelectorAll('details.group').forEach(d => { openState[d.dataset.title] = d.open; });
    el.innerHTML = `<div class="desc"><b>${esc(site.name)}</b> <span class="badge sim">${site.dataStatus === 'simulated' ? '模擬資料' : '匯入資料'}</span><br>${esc(site.description || '')}</div>
      <div class="desc" style="font-size:11px"><b>井位</b> <span id="wellPos"></span> <button id="btnResetParams" style="float:right;font-size:11px">重設參數</button></div>`;
    for (const g of paramGroups()) {
      const d = document.createElement('details'); d.className = 'group'; d.dataset.title = g.title;
      d.open = openState[g.title] != null ? openState[g.title] : !!g.open;
      d.innerHTML = `<summary>${esc(g.title)}</summary><div class="body"></div>`;
      const body = d.querySelector('.body');
      for (const f of g.fields) body.appendChild(fieldRow(f));
      el.appendChild(d);
    }
    $('btnResetParams').addEventListener('click', () => { App.paramsBySite[site.id] = App.params = defaultParams(site); buildParamsPanel(); buildStratTable(); recompute(); });
    updateWellPos();
  }
  function fieldRow(f) {
    const p = App.params, row = document.createElement('div'); row.className = 'prow';
    if (f.kind === 'select') {
      row.innerHTML = `<span class="lbl">${esc(f.label)}</span><span></span><select>${f.options.map(o => `<option value="${o.v}" ${o.disabled ? 'disabled' : ''} ${String(o.v) === String(f.get()) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
      row.querySelector('select').addEventListener('change', e => { f.set(e.target.value); if (f.rebuild) { buildParamsPanel(); buildLegend(); buildStratTable(); } recompute(); });
      return row;
    }
    const cur = getPath(p, f.path), dg = f.digits == null ? 2 : f.digits;
    const toS = f.log ? v => Math.log10(v) : v => v, fromS = f.log ? s => Math.pow(10, s) : s => s;
    const smin = toS(f.min), smax = toS(typeof f.max === 'function' ? f.max() : f.max), sstep = f.log ? 0.01 : f.step;
    row.dataset.path = f.path;
    row.innerHTML = `<span class="lbl">${esc(f.label)} ${f.unit ? `<small>(${esc(f.unit)})</small>` : ''}</span>
      <input type="number" step="${f.log ? 'any' : f.step}" value="${(+cur).toFixed(dg)}">
      <input type="range" min="${smin}" max="${smax}" step="${sstep}" value="${toS(cur)}">${f.hint ? `<div class="hint" style="grid-column:1/3">${esc(f.hint)}</div>` : ''}`;
    const num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
    row._sync = () => { const v = getPath(p, f.path); num.value = (+v).toFixed(dg); rng.value = toS(v); };
    const commit = v => {
      if (!Number.isFinite(v)) return;
      v = Math.max(f.min, Math.min(typeof f.max === 'function' ? f.max() : f.max, v));
      setPath(p, f.path, v); num.value = v.toFixed(dg); rng.value = toS(v);
      if (f.after) f.after();
      if (f.rebuild) { buildParamsPanel(); recompute(); } else scheduleRecompute();
    };
    rng.addEventListener('input', () => commit(fromS(+rng.value)));
    num.addEventListener('change', () => commit(+num.value));
    return row;
  }
  function syncParamInputs() { document.querySelectorAll('#tab-params .prow').forEach(r => { if (r._sync) r._sync(); }); }
  function updateWellPos() {
    const el = $('wellPos'); if (!el || !App.active) return;
    const p = App.params, model = getModel(App.active), ll = model.frame.toLonLat(p.well.x, p.well.y), tm = model.frame.toTM2(p.well.x, p.well.y);
    el.textContent = `${p.well.name}：局部 (${fmt(p.well.x, 0)}, ${fmt(p.well.y, 0)}) m ｜ TM2 E ${fmt(tm[0], 0)} N ${fmt(tm[1], 0)} ｜ ${ll[1].toFixed(4)}°N ${ll[0].toFixed(4)}°E`;
  }

  // ---------- 地層表 ----------
  function buildStratTable() {
    const site = App.active, p = App.params, el = $('tab-strat');
    const cols = ['porosity', 'permeability', 'ntg', 'vshale', 'entryPressure'];
    el.innerHTML = `<div class="desc">井位地層柱（可直接編輯物性，立即反映於評估與屬性場）。深度為海平面下（m）；地表高程為負值。</div>
      <div style="overflow-x:auto"><table class="data strat" id="stratTable"><thead><tr><th>地層</th><th class="num">頂深 m</th><th class="num">厚度 m</th><th class="num">φ</th><th class="num">k mD</th><th class="num">NTG</th><th class="num">V_sh</th><th class="num">P_e MPa</th></tr></thead><tbody>
      ${site.stratigraphy.map((f, i) => `<tr data-i="${i}"><td class="nm"><span class="sw" style="display:inline-block;width:11px;height:11px;background:${f.color};border:1px solid rgba(0,0,0,.25);margin-right:4px;vertical-align:-1px"></span><b>${esc(f.name)}</b><br><small style="color:var(--muted)">${ROLE[f.role] || f.role}・${esc(f.age || '')}・${LITH[f.lithology] || esc(f.lithology || '')}</small></td>
        <td class="num top"></td><td class="num thk"></td>
        ${cols.map(c => `<td class="num"><input type="number" data-c="${c}" step="any" value="${p.formations[i][c]}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="hint">φ 孔隙率、k 滲透率、NTG 淨毛比、V_sh 泥質含量（用於 SGR）、P_e CO₂–鹵水毛細進入壓力。屬性場之標準差與粒序趨勢在「參數」頁籤的儲層物性群組調整。</div>`;
    el.querySelectorAll('input[data-c]').forEach(inp => inp.addEventListener('change', e => {
      const i = +e.target.closest('tr').dataset.i, c = e.target.dataset.c, v = +e.target.value;
      if (!Number.isFinite(v) || v < 0) { e.target.value = p.formations[i][c]; return; }
      p.formations[i][c] = v; buildParamsPanel(); recompute();
    }));
  }
  function updateStratValues() {
    const r = App.result; if (!r) return;
    document.querySelectorAll('#stratTable tbody tr').forEach(tr => {
      const L = r.column.layers[+tr.dataset.i];
      tr.querySelector('.top').textContent = fmt(L.top, 0); tr.querySelector('.thk').textContent = fmt(L.thickness, 0);
      tr.classList.toggle('res', +tr.dataset.i === App.params.reservoir);
    });
  }

  // ---------- 評估結果 ----------
  function tile(k, v, unit, s, cls) { return `<div class="tile ${cls || ''}"><div class="k">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`; }
  function renderResults() {
    const r = App.result, p = App.params, site = App.active, el = $('tab-results');
    const [icon, txt] = RATING[r.rating];
    const cap = r.capacity, inj = r.injection;
    if (!el.dataset.built) {
      el.innerHTML = `<div id="resRating"></div><div id="resWarn"></div><div id="resTiles" class="tiles"></div>
        <details class="group" open><summary>屬性場容積（cutoff）</summary><div class="body" id="resVol"></div></details>
        <details class="group" open><summary>篩選檢核表</summary><div class="body" id="resChecks"></div></details>
        <details class="group" open><summary>斷層封閉與再活化</summary><div class="body" id="resFaults"></div></details>
        <details class="group" open><summary>圖表</summary><div class="body" id="resCharts">
          ${['cPD', 'cRho', 'cDp', 'cR'].map(id => `<div class="chart-head"><span id="${id}Title" style="font-weight:600;font-size:12px"></span><button data-tbl="${id}">表格</button></div><div id="${id}"></div><div id="${id}Tbl" class="chart-table" hidden></div>`).join('')}
        </div></details>
        <details class="group"><summary>計算方法與依據</summary><div class="body method" id="resMethod"></div></details>`;
      el.dataset.built = '1';
      for (const id of ['cPD', 'cRho', 'cDp', 'cR']) App.charts[id] = null;
      el.querySelectorAll('button[data-tbl]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.tbl, box = $(id + 'Tbl'); box.hidden = !box.hidden; b.textContent = box.hidden ? '表格' : '圖';
        if (!box.hidden) renderChartTable(id);
      }));
    }
    $('resRating').innerHTML = `<div class="rating ${r.rating}"><div class="icon">${icon}</div><div class="txt"><b>${txt}</b>　綜合評分 ${r.score}/100<br><small>${esc(site.name)}｜${site.type === 'depleted_gas' ? '枯竭氣田' : '鹽水層'}｜${site.setting === 'offshore' ? '海域' : site.setting === 'coastal' ? '海岸' : '陸域'}｜儲層 ${esc(site.stratigraphy[p.reservoir].name)}</small></div></div>`;
    $('resWarn').innerHTML = r.warnings.length ? `<div class="warn-list">${r.warnings.map(w => '⚠ ' + esc(w)).join('<br>')}</div>` : '';
    const util = r.utilization;
    const tiles = [];
    if (cap.type === 'depleted') tiles.push(tile('封存容量（枯竭氣田，CSLF）', fmt(cap.mass, 1), 'Mt', `面積 ${fmt(cap.area / 1e6, 1)} km²・ρ ${fmt(cap.detail.rho, 0)} kg/m³・R_f ${cap.detail.Rf}`));
    else tiles.push(tile('封存容量（區域體積法）', fmt(cap.regional, 1), 'Mt', `E=${(cap.detail.E * 100).toFixed(1)}%・淨厚 ${fmt(cap.detail.hNetAvg, 0)} m・ρ ${fmt(cap.detail.rho, 0)} kg/m³`),
      tile('構造圈閉容量', r.closure.exists ? fmt(cap.closure, 1) : '無閉合', r.closure.exists ? 'Mt' : '', r.closure.exists ? `閉合高 ${fmt(r.closure.height, 0)} m・面積 ${fmt(r.closure.area / 1e6, 1)} km²・溢出點 ${fmt(r.closure.spillDepth, 0)} m` : '開放型（單斜／無四向閉合）'));
    tiles.push(tile('規劃注入總量／容量利用率', fmt(r.planned, 1), 'Mt', `${fmt(p.injectionRate, 2)} Mt/yr × ${p.years} yr → ${Number.isFinite(util) ? (util * 100).toFixed(0) + '%' : '–'}`, util > 1 ? 'bad' : util > 0.5 ? 'warn' : 'good'));
    tiles.push(tile('注入末期井底壓力 / 允許上限', `${fmt(inj.bhpEnd, 1)} / ${fmt(r.pMax, 1)}`, 'MPa', `ΔP ${fmt(inj.dpWellEnd, 2)} MPa・餘裕 ${fmt(inj.margin, 1)} MPa・儲層壓力 ${fmt(r.pRes, 1)} MPa`, inj.margin < 0 ? 'bad' : inj.margin < 2 ? 'warn' : 'good'));
    tiles.push(tile('最大安全注入率（單井）', fmt(Math.min(inj.qMax, 999), 2), 'Mt/yr', `注入指數 ${fmt(inj.injectivity, 2)} Mt/yr/MPa`));
    tiles.push(tile('儲層條件 CO₂ 物性', `${fmt(r.rhoC, 0)}`, 'kg/m³', `${r.supercritical ? '超臨界' : '非超臨界'}・μ ${fmt(r.muC * 1e6, 1)} µPa·s・T ${fmt(r.temperature, 1)} °C・λ(CO₂/鹵水) ${fmt(r.lambda, 2)}`, r.supercritical ? '' : 'warn'));
    tiles.push(tile(`CO₂ 羽流半徑 @ ${fmt(p.time, 0)} yr`, fmt(r.plume.rMax / 1000, 2), 'km', `中心厚度 ${fmt(r.plume.H, 0)} m・停注後運移 ${fmt(r.plume.center.s || 0, 0)} m・壓力影響半徑（注入末期）${fmt(inj.rInfEnd / 1000, 0)} km`));
    tiles.push(tile('封閉層毛細封阻高度 vs CO₂ 柱高', `${fmt(r.capillary.hMax, 0)} / ${fmt(r.capillary.column, 0)}`, 'm', r.seal ? `${esc(r.seal.name)} 厚 ${fmt(r.seal.thickness, 0)} m・上覆封閉層總厚 ${fmt(r.sealTotal, 0)} m` : '無封閉層', r.capillary.hMax < r.capillary.column ? 'bad' : ''));
    tiles.push(tile('殘餘捕獲潛勢 S_gr/(1−S_wirr)', fmt(p.sgr / (1 - p.swirr) * 100, 0), '%', `停注後運移抵達 ${r.migration.arrivalTime >= p.years + p.postInjectionYears ? '仍在運移' : fmt(r.migration.arrivalTime, 0) + ' yr 停止'}・總距離 ${fmt(r.migration.totalDistance, 0)} m`));
    $('resTiles').innerHTML = tiles.join('');
    // 屬性場容積
    const vol = AS.volumetrics(getModel(site), getGrid(site, p.reservoir), App.sampler, { reservoir: p.reservoir, phiCut: p.phiCut, vshCut: p.vshCut, swirr: p.swirr, rhoCO2: r.rhoC, efficiency: p.efficiency, closureFill: p.closureFill, closureMask: r.closure.exists ? r.closure.mask : null });
    const volRow = (name, A) => `<tr><td>${name}</td><td class="num">${fmt(A.grv / 1e9, 2)}</td><td class="num">${fmt(A.net / 1e9, 2)}</td><td class="num">${fmt(A.pore / 1e6, 0)}</td><td class="num">${fmt(A.hc / 1e6, 0)}</td><td class="num">${(A.meanPhi * 100).toFixed(1)}</td><td class="num">${A.geoK >= 10 ? A.geoK.toFixed(0) : A.geoK.toFixed(2)}</td><td class="num">${(A.passFrac * 100).toFixed(0)}%</td></tr>`;
    $('resVol').innerHTML = `<table class="data"><thead><tr><th>範圍</th><th class="num">GRV km³</th><th class="num">淨岩 km³</th><th class="num">淨孔隙 10⁶m³</th><th class="num">可用孔隙 10⁶m³</th><th class="num">φ̄ %</th><th class="num">k̄ mD</th><th class="num">通過 cutoff</th></tr></thead><tbody>
      ${volRow('模型範圍', vol.all)}${vol.closure ? volRow('構造閉合區', vol.closure) : ''}</tbody></table>
      <div class="tiles"><div class="tile"><div class="k">屬性場容量（E=${(p.efficiency * 100).toFixed(1)}%，cutoff φ≥${(p.phiCut * 100).toFixed(0)}%、V_sh≤${p.vshCut.toFixed(2)}）</div><div class="v">${fmt(vol.all.capacity, 1)}<small>Mt</small></div><div class="s">可用孔隙 × ρCO₂ × E；與區域體積法比較</div></div>
      ${vol.closure ? `<div class="tile"><div class="k">閉合區屬性場容量（充填率 ${p.closureFill}）</div><div class="v">${fmt(vol.closure.capacityClosure, 1)}<small>Mt</small></div><div class="s">閉合區可用孔隙 × ρCO₂ × 充填率</div></div>` : ''}</div>
      <div class="hint">屬性場為依各層均值與標準差產生之決定性統計實現，供非均質性敏感度比較；均值法結果見上方方塊。</div>`;
    $('resChecks').innerHTML = `<table class="data"><thead><tr><th>準則</th><th>結果</th><th>數值</th></tr></thead><tbody>${r.checks.map(c => `<tr><td>${esc(c.name)}${c.note ? `<br><small style="color:var(--muted)">${esc(c.note)}</small>` : ''}</td><td><span class="st ${c.status}">${c.status === 'pass' ? '✔ 通過' : c.status === 'warn' ? '⚠ 注意' : '✖ 不符'}</span></td><td class="num">${esc(c.value)}</td></tr>`).join('')}</tbody></table>`;
    $('resFaults').innerHTML = r.faults.length ? `<table class="data"><thead><tr><th>斷層</th><th class="num">儲層處斷距</th><th class="num">距井</th><th class="num">SGR</th><th>並置關係</th><th>封閉</th><th class="num">滑動傾向 τ/σn′</th><th class="num">ΔP_crit</th><th class="num">ΔP@斷層</th><th>再活化風險</th></tr></thead><tbody>
      ${r.faults.map(f => `<tr><td>${esc(f.name)}<br><small style="color:var(--muted)">${f.type === 'normal' ? '正斷層' : '逆斷層'}</small></td><td class="num">${fmt(f.throwAtReservoir, 0)} m</td><td class="num">${fmt(f.distanceFromWell / 1000, 2)} km</td><td class="num">${fmt(f.sgr * 100, 0)}%</td><td><small>${esc(f.juxtaposition)}</small></td><td>${f.cutsReservoir ? (f.sealing ? '<span class="st pass">封閉</span>' : '<span class="st warn">可能滲漏</span>') : '–'}</td><td class="num">${fmt(f.slipTendency, 2)}</td><td class="num">${fmt(f.dPcrit, 1)} MPa</td><td class="num">${fmt(f.dpAtFault, 2)} MPa</td><td><span class="st ${f.reactivationRisk === 'low' ? 'pass' : f.reactivationRisk === 'moderate' ? 'warn' : 'fail'}">${RISK[f.reactivationRisk]}</span></td></tr>`).join('')}</tbody></table>
      <div class="hint">SGR 依儲層頂面上方厚度＝斷距之地層區間 V_sh 加權；ΔP_crit 為 Coulomb 準則（μ=${p.friction}, c=${p.cohesion} MPa）下使斷層達破壞所需孔壓增量；ΔP@斷層為注入末期在斷層距離處的壓力增量。</div>` : '<div class="hint">模型範圍內無斷層。</div>';
    renderCharts();
    $('resMethod').innerHTML = `<ul>
      <li><b>CO₂ 物性</b>：密度 Duan, Møller & Weare (1992) EOS；黏度 Fenghour et al. (1998)。地層水：Batzle & Wang (1992)。</li>
      <li><b>溫壓場</b>：T = T₀ + 梯度·深度；孔隙壓 = 靜水壓（可設超壓帶）；破裂壓 = 破裂梯度·深度；允許井底壓 = ${(p.maxBhpFraction * 100).toFixed(0)}% 破裂壓（於儲層頂）。</li>
      <li><b>容量</b>：鹽水層區域法 M = A·h_net·φ·ρ·E（US-DOE, Goodman et al. 2011）；構造圈閉 M = V_trap·NTG·φ·(1−S_wirr)·充填率·ρ，V_trap 以儲層頂面格網漫流法至溢出點（封閉斷層為屏障）；枯竭氣田 M = ρ(P_init)·A·h_net·φ·S_g·R_f·(1−F_iw)（CSLF, Bachu et al. 2007）；屬性場容積另以逐格 cutoff 統計。</li>
      <li><b>注入壓力</b>：穩態二區複合徑向流（CO₂ 區半徑 R_c 內用 μ_CO₂/k_rCO₂，外側鹵水至影響半徑 R_inf = √(2.25 k t/(φ μ_w c_t))）；停注後以 Horner 關井回復估算。</li>
      <li><b>羽流</b>：Nordbotten, Celia & Bachu (2005) 銳介面解 h(r)/H = (r_max/r − 1)/(λ−1)，λ = k_rCO₂ μ_w/μ_CO₂，忽略重力分異與溶解；停注後沿儲層頂面最陡上傾方向以浮力達西速度運移，遇構造高點、封閉斷層或模型邊界停止。屬性場之 CO₂ 飽和度依同一羽流幾何分配。</li>
      <li><b>封閉層</b>：毛細封阻高度 h_max = P_e/((ρ_w − ρ_CO₂) g)。<b>斷層</b>：SGR（Yielding et al. 1997）、並置分析；Andersonian 應力張量投影於斷層面，Coulomb 準則求 ΔP_crit。</li>
      <li><b>屬性場</b>：各層均值 ± 標準差 × 決定性值域雜訊（側向相變、層內單層、垂向粒序），GR 由 V_sh 線性換算，V_p 採 Raymer–Hunt–Gardner 型式；為統計實現，非量測。</li>
      <li>本工具為<b>篩選層級（screening）</b>解析解，不取代數值模擬；模擬資料之地質假設見「資料」頁籤。</li></ul>`;
  }
  function chartSpecs() {
    const r = App.result, p = App.params, PAL = CH.PAL.series;
    const prof = r.profiles.filter(q => q.z >= Math.max(r.surfaceDepth, 0));
    const zmax = getModel(App.active).grid.depthMax;
    const hasOP = !!p.conditions.overpressure;
    const cPD = { xLabel: '壓力 (MPa)', yLabel: '深度 (m)', yInvert: true, height: 250, xUnit: 'MPa', yUnit: 'm', yDomain: [Math.max(0, r.surfaceDepth), zmax],
      series: [
        { name: '靜水壓', color: PAL[0], points: prof.map(q => [q.hydro, q.z]) },
        ...(hasOP ? [{ name: '孔隙壓（含超壓）', color: PAL[2], points: prof.map(q => [q.pore, q.z]) }] : []),
        { name: '允許井底壓', color: PAL[1], points: prof.map(q => [q.pmax, q.z]) },
        { name: '破裂壓', color: PAL[7], points: prof.map(q => [q.frac, q.z]) },
        { name: '岩壓 S_v', color: PAL[6], points: prof.map(q => [q.litho, q.z]) }
      ],
      markers: [{ x: r.injection.bhpEnd, y: r.reservoir.top, label: `BHP ${fmt(r.injection.bhpEnd, 1)} MPa`, color: CH.PAL.ink }, { x: r.pRes, y: r.reservoir.mid, label: `儲層壓力 ${fmt(r.pRes, 1)}`, color: PAL[0], dy: -14 }],
      hlines: [{ y: r.reservoir.top, label: '儲層頂' }, { y: r.reservoir.base, label: '儲層底' }] };
    const cRho = { xLabel: 'CO₂ 密度 (kg/m³)', yLabel: '深度 (m)', yInvert: true, height: 220, xUnit: 'kg/m³', yUnit: 'm', yDomain: [Math.max(0, r.surfaceDepth), zmax],
      series: [{ name: 'ρ CO₂（靜水壓・地溫）', color: PAL[0], points: prof.filter(q => Number.isFinite(q.rhoCO2)).map(q => [q.rhoCO2, q.z]) }],
      markers: [{ x: r.rhoC, y: r.reservoir.mid, label: `儲層 ${fmt(r.rhoC, 0)} kg/m³`, color: PAL[1] }], hlines: [{ y: 800, label: '≈ 超臨界深度 800 m' }] };
    const cDp = { xLabel: '時間 (yr)', yLabel: '井壓力增量 ΔP (MPa)', height: 210, xUnit: 'yr', yUnit: 'MPa', yZero: true,
      series: [{ name: '注入井 ΔP', color: PAL[1], points: r.series.map(q => [q.t, q.dpWell]) }],
      hlines: [{ y: Math.max(0, r.pMax - r.pRes), label: `允許增量 ${fmt(r.pMax - r.pRes, 1)} MPa`, color: PAL[7] }], vlines: [{ x: p.years, label: '停注' }, { x: p.time, label: '顯示時刻', color: PAL[3] }] };
    const cR = { xLabel: '時間 (yr)', yLabel: '半徑 (km)', height: 210, xUnit: 'yr', yUnit: 'km', yZero: true,
      series: [{ name: 'CO₂ 羽流 r_max', color: PAL[1], points: r.series.map(q => [q.t, q.rMax / 1000]) }, { name: '停注後運移距離', color: PAL[2], points: r.series.map(q => [q.t, q.drift / 1000]) }],
      vlines: [{ x: p.years, label: '停注' }] };
    return { cPD, cRho, cDp, cR };
  }
  function renderCharts() {
    const specs = chartSpecs();
    const titles = { cPD: '壓力–深度剖面', cRho: 'CO₂ 密度–深度', cDp: '注入井壓力增量–時間', cR: '羽流半徑／停注後運移距離–時間（壓力影響半徑見統計方塊）' };
    for (const id of Object.keys(specs)) {
      $(id + 'Title').textContent = titles[id];
      if (!App.charts[id]) App.charts[id] = CH.create($(id), specs[id]); else App.charts[id].update(specs[id]);
      if (!$(id + 'Tbl').hidden) renderChartTable(id);
    }
  }
  function renderChartTable(id) {
    const t = App.charts[id].toTable();
    $(id + 'Tbl').innerHTML = `<table class="data"><thead><tr>${t.columns.map(c => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.filter((_, i) => i % Math.ceil(t.rows.length / 40) === 0).map(row => `<tr>${row.map(v => `<td class="num">${fmt(v, 2)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ---------- 場址清單 ----------
  function renderSiteList() {
    const el = $('siteList');
    el.innerHTML = `<table><thead><tr><th>場址</th><th>類型</th><th class="num">容量 Mt</th><th>評估</th></tr></thead><tbody>${App.sites.map(s => {
      const r = App.results[s.id];
      return `<tr data-id="${s.id}" class="${App.active && s.id === App.active.id ? 'active' : ''}"><td><span class="sym ${s.type === 'depleted_gas' ? 'depleted' : 'saline'} ${s.setting === 'offshore' ? 'offshore' : ''}"></span>${esc(s.id)} ${esc(s.name)}</td>
        <td><small>${s.type === 'depleted_gas' ? '枯竭氣田' : '鹽水層'}・${s.setting === 'offshore' ? '海域' : s.setting === 'coastal' ? '海岸' : '陸域'}</small></td>
        <td style="text-align:right">${r ? fmt(r.capacity.mass, 0) : '…'}</td><td>${r ? `<span class="badge ${r.rating}">${RATING[r.rating][1]} ${r.score}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>`;
    el.querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', () => selectSite(tr.dataset.id)));
  }
  function fillSiteSelect() { $('siteSelect').innerHTML = App.sites.map(s => `<option value="${s.id}">${esc(s.id)}　${esc(s.name)}</option>`).join(''); }
  function evaluateOthersInBackground() {
    const pending = App.sites.filter(s => !App.results[s.id]);
    const next = () => {
      const s = pending.shift(); if (!s) return;
      try { App.results[s.id] = evaluateSite(s, App.paramsBySite[s.id] || (App.paramsBySite[s.id] = defaultParams(s))); } catch (e) { console.error('評估失敗', s.id, e); }
      renderSiteList(); App.map.setResults(App.results);
      setTimeout(next, 20);
    };
    setTimeout(next, 200);
  }

  // ---------- 時間軸 ----------
  function updateTimeline() {
    const p = App.params, r = App.result, tEnd = p.years + p.postInjectionYears;
    const sl = $('tlSlider'); sl.max = tEnd; sl.value = p.time;
    $('tlYear').textContent = String(Math.round(p.startYear + p.time));
    const inj = p.time <= p.years;
    $('tlPhase').textContent = inj ? `注入期（第 ${fmt(p.time, 0)} 年）` : `停注後監測期（停注後 ${fmt(p.time - p.years, 0)} 年）`; $('tlPhase').className = 'tl-phase ' + (inj ? 'inj' : 'post');
    $('tlStart').textContent = `${p.startYear} 開始注入`; $('tlStop').textContent = `${p.startYear + p.years} 停止注入`; $('tlEnd').textContent = `${p.startYear + tEnd}`;
    const sPt = r.series.reduce((a, b) => Math.abs(b.t - p.time) < Math.abs(a.t - p.time) ? b : a);
    $('kpiCum').textContent = fmt(Math.min(p.time, p.years) * p.injectionRate, 1) + ' Mt';
    $('kpiRadius').textContent = fmt(r.plume.rMax / 1000, 2) + ' km';
    $('kpiDrift').textContent = fmt(r.plume.center.s || 0, 0) + ' m';
    $('kpiDp').textContent = fmt(sPt.dpWell, 2) + ' MPa';
  }
  function setTime(t) {
    const p = App.params; p.time = Math.max(0, Math.min(p.years + p.postInjectionYears, Math.round(t)));
    syncParamInputs(); recompute();
  }
  function stopPlay() { if (App.playing) { clearInterval(App.playing); App.playing = null; } $('tlPlay').textContent = '▶ 播放'; $('tlPlay').classList.remove('on'); }
  function togglePlay() {
    if (App.playing) { stopPlay(); return; }
    const p = App.params; if (p.time >= p.years + p.postInjectionYears) p.time = 0;
    $('tlPlay').textContent = '❚❚ 暫停'; $('tlPlay').classList.add('on');
    App.playing = setInterval(() => { const q = App.params; if (q.time >= q.years + q.postInjectionYears) { stopPlay(); return; } setTime(q.time + 1); }, 380);
  }

  // ---------- 屬性著色 ----------
  function buildColorModes() {
    const sel = $('colorMode'); sel.innerHTML = PT.COLOR_MODES.map(m => `<option value="${m.key}">${esc(m.label)}${m.unit ? '（' + esc(m.unit) + '）' : ''}</option>`).join('');
    sel.addEventListener('change', () => { App.view.setColorMode(sel.value); updateColorbar(); if ($('secFollow').checked && App.section.data) { $('secMode').value = sel.value; redrawSection(); } });
    const sm = $('secMode'); sm.innerHTML = sel.innerHTML;
    sm.addEventListener('change', () => { $('secFollow').checked = false; redrawSection(); });
    $('secFollow').addEventListener('change', () => { if ($('secFollow').checked) { sm.value = sel.value; redrawSection(); } });
    updateColorbar();
  }
  function updateColorbar() {
    const key = $('colorMode').value, m = PT.MODE_MAP[key];
    if (!m.ramp) { $('colorbar').hidden = true; $('colorbarTicks').innerHTML = ''; $('colorbarSwatches').innerHTML = App.active ? App.active.stratigraphy.map(f => `<i style="background:${f.color}" title="${esc(f.name)}"></i>`).join('') : ''; return; }
    $('colorbarSwatches').innerHTML = ''; $('colorbar').hidden = false; $('colorbar').style.background = PT.rampCSS(key, 24);
    $('colorbarTicks').innerHTML = PT.rampTicks(key, 5).map(t => `<span>${t}</span>`).join('');
    $('colorbar').title = m.label + (m.log ? '（對數色階）' : '');
  }

  // ---------- 取點模式 ----------
  const MODE_HINT = { well: '井位設定：在 2D 圖台模型範圍內或 3D 模型上點選新井位（Esc 取消）', log: '合成井柱：在 2D 圖台或 3D 模型上點一點（Esc 取消）', section: '任意剖面：點 A 點，再點 A′（Esc 取消）' };
  function setMode(mode) {
    App.mode = mode || null;
    App.map.setMode(App.mode);
    $('btnWellMode').classList.toggle('active', mode === 'well'); $('btnLogMode').classList.toggle('active', mode === 'log'); $('btnSectionMode').classList.toggle('active', mode === 'section');
    $('modeHint').hidden = !mode; if (mode) $('modeHint').textContent = MODE_HINT[mode];
    if (mode === 'section') { App.section.a = null; App.section.b = null; }
  }
  function handlePick(x, y) {
    const mode = App.mode;
    if (mode === 'well') { moveWell(x, y); setMode(null); return true; }
    if (mode === 'log') { showLog(x, y, '合成井柱（點選位置）'); setMode(null); return true; }
    if (mode === 'section') {
      if (!App.section.a) { App.section.a = { x, y }; $('modeHint').textContent = '已定 A 點，請點選 A′'; App.map.patchOverlay({ section: { a: App.section.a, b: null } }); App.view.setSectionLine(App.section.a, null, surfZ()); }
      else { App.section.b = { x, y }; setMode(null); runSection(App.section.a, App.section.b); }
      return true;
    }
    return false;
  }
  const surfZ = () => { const m = getModel(App.active); return (x, y) => m.depthNatural(0, x, y); };
  function moveWell(x, y) {
    const site = App.active, hx = site.model.extent[0] / 2, hy = site.model.extent[1] / 2;
    App.params.well.x = Math.max(-hx, Math.min(hx, Math.round(x))); App.params.well.y = Math.max(-hy, Math.min(hy, Math.round(y)));
    updateWellPos(); recompute();
  }

  // ---------- 分析面板：井柱與剖面 ----------
  function openAnalysis(tab) {
    $('analysis').hidden = false; $('btnAnalysis').classList.add('on');
    document.querySelectorAll('#analysis [data-atab]').forEach(b => b.classList.toggle('active', b.dataset.atab === tab));
    $('anLog').classList.toggle('active', tab === 'log'); $('anSection').classList.toggle('active', tab === 'section');
    $('anSectionCtl').hidden = tab !== 'section';
    if (tab === 'log' && !App.log) { const p = App.params; showLog(p.well.x, p.well.y, p.well.name + '　合成測井', App.wells[0]); }
    if (tab === 'section' && !App.section.data) defaultSection();
    App.view.resize();
  }
  function closeAnalysis() { $('analysis').hidden = true; $('btnAnalysis').classList.remove('on'); App.view.resize(); }
  function showLog(x, y, title, well, silent) {
    const model = getModel(App.active), r = App.result, p = App.params, strat = App.active.stratigraphy;
    App.log = { x, y, title, well };
    const data = WL.sampleColumn(model, App.sampler, x, y, { step: 4 });
    if (!data) return;
    const ll = model.frame.toLonLat(x, y);
    WL.draw($('logCanvas'), data, { strat, height: Math.max(420, $('analysis').clientHeight - 70), title, location: `${ll[1].toFixed(4)}°N ${ll[0].toFixed(4)}°E｜局部 (${fmt(x, 0)}, ${fmt(y, 0)})`, perf: well && well.perfTop != null ? [well.perfTop, well.perfBase] : null });
    let html = WL.topsTable(data, strat, r.field, PR);
    const L = p.reservoir, seg = data.samples.filter(s => s.index === L);
    if (seg.length) {
      const st = PT.percentiles(seg.map(s => s.props.phi)), sk = PT.percentiles(seg.map(s => s.props.perm)), sg = PT.percentiles(seg.map(s => s.props.sg));
      const top = data.tops.find(t => t.index === L), mid = (top.top + top.base) / 2, T = r.field.temp(mid), P = r.field.pore(mid);
      html += `<div style="font-weight:600;margin:6px 0 2px">儲層 ${esc(strat[L].name)}（${fmt(top.top, 0)}–${fmt(top.base, 0)} m，厚 ${fmt(top.thickness, 0)} m）</div>
        <dl style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:0 0 6px">
        <dt>φ P10/P50/P90</dt><dd>${(st.p10 * 100).toFixed(1)} / ${(st.p50 * 100).toFixed(1)} / ${(st.p90 * 100).toFixed(1)} %</dd>
        <dt>k P10/P50/P90</dt><dd>${fmt(sk.p10, 0)} / ${fmt(sk.p50, 0)} / ${fmt(sk.p90, 0)} mD</dd>
        <dt>原地 T／P</dt><dd>${T.toFixed(1)} °C／${P.toFixed(1)} MPa</dd>
        <dt>CO₂ 密度／黏度</dt><dd>${fmt(r.rhoC, 0)} kg/m³／${fmt(r.muC * 1e6, 1)} µPa·s（${r.supercritical ? '超臨界' : '非超臨界'}）</dd>
        <dt>允許井底壓</dt><dd>${fmt(r.pMax, 1)} MPa（餘裕 ${fmt(r.injection.margin, 1)} MPa）</dd>
        <dt>最大 S_g（P90）</dt><dd>${sg ? (sg.p90 * 100).toFixed(0) : 0} %</dd></dl>`;
    }
    if (r.seal) html += `<div style="font-weight:600;margin:6px 0 2px">封閉層 ${esc(r.seal.name)}</div><dl style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:0">
      <dt>厚度（井位）</dt><dd>${fmt(r.seal.thickness, 0)} m</dd><dt>毛細進入壓力</dt><dd>${r.seal.entryPressure} MPa</dd><dt>可滯留柱高</dt><dd>${fmt(r.capillary.hMax, 0)} m</dd><dt>目前羽流厚度</dt><dd>${fmt(r.plume.H, 0)} m</dd></dl>`;
    $('logSide').innerHTML = html;
    App.view.setPickMarker({ x, y });
    App.map.patchOverlay({ pickMarker: { x, y, label: '井柱' } });
    if (!silent) openAnalysis('log');
  }
  function defaultSection() {
    const hx = getModel(App.active).grid.halfX, p = App.params;
    runSection({ x: -hx * 0.95, y: p.well.y }, { x: hx * 0.95, y: p.well.y });
  }
  function runSection(a, b, silent) {
    const model = getModel(App.active), r = App.result, p = App.params;
    App.section.a = a; App.section.b = b;
    const plume = r.plume.rMax > 0 ? { center: r.plume.center, rMax: r.plume.rMax, thickness: r.plume.thickness, ntg: p.formations[p.reservoir].ntg } : null;
    App.section.data = SEC.sample(model, a, b, { n: 260, plume, reservoir: p.reservoir, wells: App.wells.map(w => ({ name: w.name, type: w.type, x: w.x, y: w.y, depth: w.base, perf: [w.perfTop, w.perfBase], deviation: w.deviation, color: w.color })), monitors: monitorsFor() });
    if ($('secFollow').checked) $('secMode').value = $('colorMode').value;
    App.view.setSectionLine(a, b, surfZ());
    App.map.patchOverlay({ section: { a, b } });
    if (!silent) openAnalysis('section'); else redrawSection();
    if (!silent) redrawSection();
  }
  function redrawSection() {
    const d = App.section.data; if (!d) return;
    const pane = $('anSection'), w = Math.max(520, pane.clientWidth - 8), h = Math.max(300, $('analysis').clientHeight - 60);
    App.section.layout = SEC.draw($('secCanvas'), d, { width: w, height: h, strat: App.active.stratigraphy, colorMode: $('secMode').value, sampler: App.sampler, reservoir: App.params.reservoir, title: '地質剖面 A–A′' });
    $('secMeta').textContent = `長度 ${(d.length / 1000).toFixed(2)} km｜方位 ${d.bearing.toFixed(0)}°｜垂直放大 ×${App.section.layout.ve.toFixed(1)}${d.faults.length ? '｜穿越斷層 ' + d.faults.map(f => f.name).join('、') : ''}`;
  }
  function bindSectionHover() {
    const c = $('secCanvas'), tip = $('secTip');
    c.addEventListener('mousemove', e => {
      const d = App.section.data, lay = App.section.layout; if (!d || !lay) return;
      const r = c.getBoundingClientRect(), loc = SEC.locate(d, lay, e.clientX - r.left, e.clientY - r.top);
      if (!loc || loc.formation < 0) { tip.hidden = true; return; }
      const f = App.active.stratigraphy[loc.formation], pr = App.sampler.propsAt(loc.formation, loc.x, loc.y, loc.zRel);
      tip.innerHTML = `<b>${esc(f.name)}</b>　深度 ${fmt(loc.z, 0)} m　距 A ${fmt(loc.d / 1000, 2)} km<br>φ ${(pr.phi * 100).toFixed(1)}%　k ${pr.perm >= 1 ? fmt(pr.perm, 0) : pr.perm.toExponential(1)} mD　V_sh ${pr.vsh.toFixed(2)}${pr.sg > 0.005 ? '　S_g ' + (pr.sg * 100).toFixed(0) + '%' : ''}`;
      tip.hidden = false; tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
    });
    c.addEventListener('mouseleave', () => { tip.hidden = true; });
  }

  // ---------- 資訊卡 ----------
  function closeInfo() { $('infoCard').hidden = true; if (App.view) App.view.setSelection(null); }
  function infoButtons(x, y, z) {
    return `<div class="btnrow"><button data-act="log">此處合成井柱</button><button data-act="secA">以此為剖面 A</button><button data-act="fly">飛往</button><button data-act="close">關閉</button></div>`;
  }
  function showInfo(kind, d) {
    const card = $('infoCard'), site = App.active, r = App.result, p = App.params, strat = site.stratigraphy, model = getModel(site);
    let html = '';
    const loc = d.x != null ? (() => { const ll = model.frame.toLonLat(d.x, d.y); return `${ll[1].toFixed(4)}°N ${ll[0].toFixed(4)}°E｜局部 (${fmt(d.x, 0)}, ${fmt(d.y, 0)})`; })() : '';
    if (kind === 'layer') {
      const f = strat[d.formation], col = r.column.layers[d.formation];
      const top = model.depthNatural(d.formation, d.x, d.y), base = model.depthNatural(d.formation + 1, d.x, d.y), zRel = base > top ? Math.min(1, Math.max(0, (d.z - top) / (base - top))) : 0.5;
      const pr = App.sampler.propsAt(d.formation, d.x, d.y, zRel), mid = (top + base) / 2, T = r.field.temp(mid), P = r.field.pore(mid);
      let rho = '–'; try { rho = fmt(PR.co2Density(Math.max(P, 0.1), T + 273.15), 0); } catch (e) { }
      const fp = p.formations[d.formation];
      html = `<h4><span class="sw" style="display:inline-block;width:12px;height:12px;background:${f.color};border:1px solid rgba(0,0,0,.25)"></span>${esc(f.name)} <small style="color:var(--muted);font-weight:400">${esc(f.nameEn || '')}</small><span class="grow"></span><span class="badge sim">${ROLE[f.role]}</span></h4>
        <dl><dt>年代／岩性</dt><dd>${esc(f.age || '')}・${LITH[f.lithology] || esc(f.lithology)}</dd>
        <dt>點位頂／底深</dt><dd>${fmt(top, 0)} / ${fmt(base, 0)} m（厚 ${fmt(base - top, 0)} m，點在層內 ${(zRel * 100).toFixed(0)}%）</dd>
        <dt>井位厚度</dt><dd>${fmt(col.thickness, 0)} m</dd>
        <dt>均值 φ／k</dt><dd>${(fp.porosity * 100).toFixed(1)} %／${fp.permeability} mD（NTG ${fp.ntg}，V_sh ${fp.vshale}）</dd>
        <dt>點位屬性場</dt><dd>φ ${(pr.phi * 100).toFixed(1)} %・k ${pr.perm >= 1 ? fmt(pr.perm, 0) : pr.perm.toExponential(1)} mD・V_sh ${pr.vsh.toFixed(2)}・GR ${pr.gr.toFixed(0)} API</dd>
        <dt>ρ_b／V_p</dt><dd>${pr.rhob.toFixed(2)} g/cm³／${pr.vp.toFixed(0)} m/s${pr.sg > 0.005 ? `・S_g ${(pr.sg * 100).toFixed(0)}%` : ''}</dd>
        <dt>原地 T／P</dt><dd>${T.toFixed(1)} °C／${P.toFixed(1)} MPa（ρCO₂ ${rho} kg/m³）</dd>
        ${f.role === 'seal' ? `<dt>毛細進入壓力</dt><dd>${fp.entryPressure} MPa（可滯留柱高 ${fmt(fp.entryPressure * 1e6 / ((r.rhoW - r.rhoC) * 9.80665), 0)} m）</dd>` : ''}</dl>
        <div class="note">${loc}</div>` + infoButtons();
    } else if (kind === 'fault') {
      const f = r.faults.find(q => q.index === d.index) || {}, def = d.def;
      html = `<h4>斷層：${esc(d.name)}<span class="grow"></span><span class="badge sim">${def.type === 'normal' ? '正斷層' : '逆斷層'}</span></h4>
        <dl><dt>走向／傾角</dt><dd>${def.strike}° / ${def.dip}°${def.listric ? '（鏟狀，滑脫深度 ' + def.listric.detachDepth + ' m）' : ''}</dd>
        <dt>最大斷距</dt><dd>${def.throw} m（尖端 ${def.tipDepth || 0} m）</dd>
        <dt>儲層處斷距</dt><dd>${fmt(f.throwAtReservoir, 0)} m｜${esc(f.juxtaposition || '')}</dd>
        <dt>SGR</dt><dd>${fmt((f.sgr || 0) * 100, 0)} %（${f.sealing ? '具封閉能力' : '封閉性存疑'}）</dd>
        <dt>滑動傾向／ΔP_crit</dt><dd>${fmt(f.slipTendency, 2)}／${fmt(f.dPcrit, 1)} MPa</dd>
        <dt>注入末期 ΔP@斷層</dt><dd>${fmt(f.dpAtFault, 2)} MPa → 風險 ${RISK[f.reactivationRisk] || '–'}</dd></dl>
        <div class="note">${loc}</div>` + infoButtons();
    } else if (kind === 'plume') {
      html = `<h4>CO₂ 羽流<span class="grow"></span><span class="badge sim">${p.startYear + p.time}</span></h4>
        <dl><dt>時刻</dt><dd>${fmt(p.time, 0)} yr（${p.time <= p.years ? '注入期' : '停注後'}）</dd><dt>累積注入</dt><dd>${fmt(Math.min(p.time, p.years) * p.injectionRate, 1)} Mt</dd>
        <dt>半徑 r_max／中心厚度</dt><dd>${fmt(r.plume.rMax / 1000, 2)} km／${fmt(r.plume.H, 0)} m</dd><dt>停注後運移</dt><dd>${fmt(r.plume.center.s || 0, 0)} m</dd>
        <dt>賦存層</dt><dd>${esc(strat[p.reservoir].name)}</dd></dl><div class="note">NCB 2005 銳介面解；${loc}</div>` + infoButtons();
    } else if (kind === 'well') {
      const w = d.well, col = AS.wellColumn(model, w.x + (w.deviation ? w.deviation.east : 0), w.y + (w.deviation ? w.deviation.north : 0));
      html = `<h4>${esc(w.name)}<span class="grow"></span><span class="badge sim">${w.type === 'observation' ? '觀測井' : '注入井'}</span></h4>
        <dl><dt>井口</dt><dd>${(() => { const ll = model.frame.toLonLat(w.x, w.y); return `${ll[1].toFixed(4)}°N ${ll[0].toFixed(4)}°E`; })()}</dd>
        <dt>井底深度</dt><dd>${fmt(w.base, 0)} m${w.deviation ? `（斜井，井底位移 東 ${w.deviation.east} m、北 ${w.deviation.north} m）` : ''}</dd>
        <dt>射孔段</dt><dd>${fmt(w.perfTop, 0)}–${fmt(w.perfBase, 0)} m（${esc(strat[w.formation].name)}）</dd></dl>
        ${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}
        <div style="font-weight:600;margin:4px 0 2px">井底位置地層柱</div>${col.layers.filter(L => L.thickness > 0.5).map(L => `<div class="col-row"><span class="sw" style="background:${strat[L.index].color}"></span><span>${esc(strat[L.index].name)}</span><span>${fmt(L.top, 0)}–${fmt(L.base, 0)} m</span><span>${fmt(L.thickness, 0)} m</span></div>`).join('')}
        <div class="btnrow"><button data-act="wellLog">此井合成測井</button><button data-act="fly">飛往</button><button data-act="close">關閉</button></div>`;
    } else if (kind === 'monitor') {
      const m = d.monitor;
      html = `<h4>${esc(m.name || m.id)}<span class="grow"></span><span class="badge sim">${MON[m.kind] || m.kind}</span></h4>
        <dl><dt>站號</dt><dd>${esc(m.id)}</dd><dt>位置</dt><dd>${(() => { const ll = model.frame.toLonLat(m.x, m.y); return `${ll[1].toFixed(4)}°N ${ll[0].toFixed(4)}°E`; })()}</dd></dl>
        <div class="note">MMV（監測、量測與驗證）網示意：驗證封存完整性與早期洩漏預警。${m.note ? esc(m.note) : ''}</div>
        <div class="btnrow"><button data-act="fly">飛往</button><button data-act="close">關閉</button></div>`;
    } else if (kind === 'virtual') {
      const col = AS.wellColumn(model, d.x, d.y);
      html = `<h4>虛擬鑽井剖面<span class="grow"></span></h4><div class="note">${loc}</div>
        ${col.layers.filter(L => L.thickness > 0.5).map(L => `<div class="col-row"><span class="sw" style="background:${strat[L.index].color}"></span><span>${esc(strat[L.index].name)}</span><span>${fmt(L.top, 0)}–${fmt(L.base, 0)} m</span><span>${fmt(L.thickness, 0)} m</span></div>`).join('')}` + infoButtons();
    } else if (kind === 'water') {
      html = `<h4>海面／海水柱</h4><dl><dt>海床深度</dt><dd>${fmt(model.depthNatural(0, d.x, d.y), 0)} m</dd></dl><div class="note">${loc}</div>` + infoButtons();
    } else return;
    card.innerHTML = html; card.hidden = false;
    card.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'close') closeInfo();
      else if (act === 'log') showLog(d.x, d.y, '合成井柱（點選位置）');
      else if (act === 'wellLog') { const w = d.well; showLog(w.x + (w.deviation ? w.deviation.east : 0), w.y + (w.deviation ? w.deviation.north : 0), w.name + '　合成測井', w); }
      else if (act === 'secA') { setMode('section'); App.section.a = { x: d.x, y: d.y }; $('modeHint').textContent = '已定 A 點，請點選 A′'; App.map.patchOverlay({ section: { a: App.section.a, b: null } }); App.view.setSectionLine(App.section.a, null, surfZ()); }
      else if (act === 'fly') { const x = d.x != null ? d.x : (d.well ? d.well.x : d.monitor.x), y = d.y != null ? d.y : (d.well ? d.well.y : d.monitor.y); const z = d.z != null ? d.z : r.reservoir.top; App.view.flyTo({ target: { x, y, z }, dist: Math.max(site.model.extent[0], site.model.extent[1]) * 0.9 }); }
    }));
  }

  // ---------- 匯入／匯出 ----------
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = typeof text === 'string' && text.startsWith('data:') ? text : URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportSite() {
    const site = clone(App.active), p = App.params;
    site.stratigraphy.forEach((f, i) => Object.assign(f, p.formations[i]));
    site.conditions = clone(p.conditions);
    const inj = site.wells.findIndex(w => (w.type || 'injection') === 'injection');
    if (inj >= 0) Object.assign(site.wells[inj], { x: p.well.x, y: p.well.y }); else site.wells.unshift({ name: p.well.name, type: 'injection', x: p.well.x, y: p.well.y });
    site.assessment = {}; for (const k of Object.keys(AS.DEFAULTS)) if (k !== 'time') site.assessment[k] = p[k];
    Object.assign(site.assessment, { reservoir: p.reservoir, startYear: p.startYear, phiCut: p.phiCut, vshCut: p.vshCut });
    site.hetero = clone(p.hetero);
    download(`ccs-site-${site.id}.json`, JSON.stringify(site, null, 2));
  }
  function exportReport() {
    const r = App.result, p = App.params, site = App.active;
    const out = { site: { id: site.id, name: site.name, location: site.location, type: site.type, setting: site.setting, dataStatus: site.dataStatus }, generated: new Date().toISOString(), params: p,
      results: { rating: r.rating, score: r.score, reservoir: r.reservoir, seal: r.seal, temperature: r.temperature, pRes: r.pRes, pInit: r.pInit, pMax: r.pMax, rhoCO2: r.rhoC, muCO2: r.muC, rhoBrine: r.rhoW, muBrine: r.muW, supercritical: r.supercritical,
        capacity: r.capacity, planned: r.planned, closure: r.closure.exists ? { height: r.closure.height, area: r.closure.area, rockVolume: r.closure.rockVolume, spillDepth: r.closure.spillDepth, crest: r.closure.crest } : null,
        injection: r.injection, capillary: r.capillary, faults: r.faults.map(f => Object.assign({}, f)), checks: r.checks, warnings: r.warnings, migration: { totalDistance: r.migration.totalDistance, arrivalTime: r.migration.arrivalTime, path: r.migration.points }, series: r.series, profiles: r.profiles, wells: App.wells } };
    download(`ccs-assessment-${site.id}.json`, JSON.stringify(out, null, 2));
    const csv = ['t_yr,dpWell_MPa,bhp_MPa,rMax_m,rInf_m,mass_Mt,drift_m', ...r.series.map(q => [q.t, q.dpWell, q.bhp, q.rMax, q.rInf, q.mass, q.drift].map(v => Number.isFinite(v) ? +v.toFixed(4) : '').join(','))].join('\n');
    download(`ccs-series-${site.id}.csv`, csv, 'text/csv');
  }
  function validateSite(s) {
    const err = [];
    const num = (v, name, lo, hi) => { if (typeof v !== 'number' || !Number.isFinite(v)) err.push(`${name} 須為數值`); else if ((lo != null && v < lo) || (hi != null && v > hi)) err.push(`${name} 超出範圍 [${lo}, ${hi}]`); };
    const optNum = (v, name, lo, hi) => { if (v != null) num(v, name, lo, hi); };
    const xy = (v, name) => { if (!Array.isArray(v) || v.length !== 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) err.push(`${name} 須為 [x, y] 兩個數值（局部座標 m），不是 {x, y} 物件`); };
    const oneOf = (v, name, list, optional) => { if (optional && v == null) return; if (!list.includes(v)) err.push(`${name} 須為 ${list.join(' | ')}${v == null ? '' : '（目前 ' + JSON.stringify(v) + '）'}`); };
    const isObj = (v, name) => { if (v && typeof v === 'object' && !Array.isArray(v)) return true; err.push(`${name} 須為物件${typeof v === 'number' ? '（目前為數值 ' + v + '）' : Array.isArray(v) ? '（目前為陣列）' : ''}`); return false; };
    const arr = (v, name) => { if (v == null) return []; if (Array.isArray(v)) return v; err.push(`${name} 須為陣列`); return []; };
    const idx = (v, name, n, what) => { if (!Number.isInteger(v) || v < 0 || v >= n) err.push(`${name} 須為 ${what} 的索引（0–${n - 1}）`); };
    const profile = (v, name) => {
      if (v == null || !isObj(v, name)) return;
      oneOf(v.type, name + '.type', ['constant', 'growDown', 'growUp', 'window']);
      if (v.type && v.type !== 'constant') { num(v.z0, name + '.z0'); num(v.z1, name + '.z1'); if (Number.isFinite(v.z0) && Number.isFinite(v.z1) && v.z1 <= v.z0) err.push(`${name}.z1 須大於 z0`); }
      if (v.type === 'window') { num(v.z2, name + '.z2'); num(v.z3, name + '.z3'); if (Number.isFinite(v.z2) && Number.isFinite(v.z3) && v.z3 <= v.z2) err.push(`${name}.z3 須大於 z2`); }
    };
    const taper = (v, name) => { if (v == null || !isObj(v, name)) return; num(v.center, name + '.center'); num(v.halfLength, name + '.halfLength', 1); };
    if (!s || typeof s !== 'object') return ['不是 JSON 物件'];
    if (!s.id || typeof s.id !== 'string') err.push('缺少 id（字串）');
    if (!s.name) err.push('缺少 name');
    if (!['saline_aquifer', 'depleted_gas'].includes(s.type)) err.push('type 須為 saline_aquifer 或 depleted_gas');
    if (!s.location) err.push('缺少 location'); else { num(s.location.lon, 'location.lon', 118, 123); num(s.location.lat, 'location.lat', 21, 26.5); }
    if (!s.model) err.push('缺少 model'); else {
      if (!Array.isArray(s.model.extent) || s.model.extent.length !== 2) err.push('model.extent 須為 [Lx, Ly]'); else { num(s.model.extent[0], 'model.extent[0]', 500, 200000); num(s.model.extent[1], 'model.extent[1]', 500, 200000); }
      if (s.model.grid && (!Array.isArray(s.model.grid) || s.model.grid.length !== 2 || s.model.grid[0] < 8 || s.model.grid[1] < 8 || s.model.grid[0] > 200 || s.model.grid[1] > 200)) err.push('model.grid 須為 [nx, ny]，8–200');
      num(s.model.depthMax, 'model.depthMax', 200, 20000);
    }
    // 構造：先取出清單，供 relief / thicknessMods 的索引檢查
    const S = s.structure != null && isObj(s.structure, 'structure') ? s.structure : {};
    const folds = arr(S.folds, 'structure.folds'), domes = arr(S.domes, 'structure.domes'), faults = arr(S.faults, 'structure.faults');
    if (!Array.isArray(s.stratigraphy) || s.stratigraphy.length < 2) err.push('stratigraphy 至少需 2 層');
    else s.stratigraphy.forEach((f, i) => {
      if (!f.name) err.push(`stratigraphy[${i}].name 缺少`);
      if (!['reservoir', 'secondary', 'seal', 'overburden', 'basement'].includes(f.role)) err.push(`stratigraphy[${i}].role 無效`);
      num(f.top, `stratigraphy[${i}].top`, -3000, 20000); num(f.porosity, `stratigraphy[${i}].porosity`, 0, 0.6); num(f.permeability, `stratigraphy[${i}].permeability`, 0, 1e6);
      if (i > 0 && typeof f.top === 'number' && typeof s.stratigraphy[i - 1].top === 'number' && f.top <= s.stratigraphy[i - 1].top) err.push(`stratigraphy[${i}].top 須大於上一層`);
      arr(f.thicknessMods, `stratigraphy[${i}].thicknessMods`).forEach((m, k) => {
        const n = `stratigraphy[${i}].thicknessMods[${k}]`; if (!isObj(m, n)) return;
        oneOf(m.type, n + '.type', ['wedge', 'linear', 'fold', 'dome']);
        if (m.type === 'wedge') { idx(m.fault, n + '.fault', faults.length, 'structure.faults'); oneOf(m.side, n + '.side', ['hw', 'fw'], true); num(m.factor, n + '.factor', 0); num(m.lambda, n + '.lambda', 1); }
        else if (m.type === 'linear') { num(m.azimuth, n + '.azimuth', 0, 360); num(m.rate, n + '.rate'); }
        else if (m.type === 'fold') { idx(m.fold, n + '.fold', folds.length, 'structure.folds'); num(m.factor, n + '.factor', 0); }
        else if (m.type === 'dome') { idx(m.dome, n + '.dome', domes.length, 'structure.domes'); num(m.factor, n + '.factor', 0); }
      });
    });
    if (s.stratigraphy && !s.stratigraphy.some(f => f.role === 'reservoir' || f.role === 'secondary')) err.push('至少需一層 role = reservoir 或 secondary');
    if (!s.conditions) err.push('缺少 conditions'); else {
      for (const k of ['surfaceTemp', 'tempGradient', 'pressureGradient', 'fractureGradient', 'salinity']) num(s.conditions[k], 'conditions.' + k);
      if (!s.conditions.stress) err.push('缺少 conditions.stress'); else for (const k of ['svGradient', 'shmaxRatio', 'shminRatio', 'shmaxAzimuth']) num(s.conditions.stress[k], 'conditions.stress.' + k);
      if (s.conditions.overpressure != null && isObj(s.conditions.overpressure, 'conditions.overpressure')) { num(s.conditions.overpressure.startDepth, 'conditions.overpressure.startDepth'); num(s.conditions.overpressure.gradient, 'conditions.overpressure.gradient'); }
    }
    if (s.surface != null && isObj(s.surface, 'surface')) {
      const u = s.surface;
      oneOf(u.kind, 'surface.kind', ['onshore', 'coastal', 'offshore'], true);
      optNum(u.elevation, 'surface.elevation'); optNum(u.shoreElevation, 'surface.shoreElevation'); optNum(u.waterDepth, 'surface.waterDepth', 0);
      if (u.coastRamp != null) num(u.coastRamp, 'surface.coastRamp（自海岸線向內陸的距離 m，數值）', 1);
      if (u.bathymetry != null && isObj(u.bathymetry, 'surface.bathymetry')) { num(u.bathymetry.slope, 'surface.bathymetry.slope', 0); num(u.bathymetry.maxDepth, 'surface.bathymetry.maxDepth', 0); }
      arr(u.relief, 'surface.relief').forEach((r, i) => {
        const n = `surface.relief[${i}]`; if (!isObj(r, n)) return;
        if (r.fold != null) idx(r.fold, n + '.fold', folds.length, 'structure.folds'); else if (r.dome != null) idx(r.dome, n + '.dome', domes.length, 'structure.domes'); else err.push(`${n} 需 fold 或 dome（structure.folds／domes 的索引）`);
        num(r.amplitude, n + '.amplitude');
      });
    }
    if (S.regionalDip != null && isObj(S.regionalDip, 'structure.regionalDip')) { num(S.regionalDip.dip, 'structure.regionalDip.dip', 0, 89); num(S.regionalDip.azimuth, 'structure.regionalDip.azimuth', 0, 360); if (S.regionalDip.through != null) xy(S.regionalDip.through, 'structure.regionalDip.through'); }
    folds.forEach((f, i) => {
      const n = `structure.folds[${i}]`; if (!isObj(f, n)) return;
      oneOf(f.type, n + '.type', ['anticline', 'syncline']); num(f.axisAzimuth, n + '.axisAzimuth', 0, 360); num(f.amplitude, n + '.amplitude'); num(f.halfWidth, n + '.halfWidth', 1);
      if (f.through != null) xy(f.through, n + '.through'); oneOf(f.shape, n + '.shape', ['cosine', 'gaussian'], true); profile(f.depthProfile, n + '.depthProfile'); taper(f.alongTaper, n + '.alongTaper');
    });
    domes.forEach((d, i) => {
      const n = `structure.domes[${i}]`; if (!isObj(d, n)) return;
      oneOf(d.kind, n + '.kind', ['dome', 'diapir', 'basementHigh'], true); xy(d.center, n + '.center'); xy(d.radii, n + '.radii');
      if (Array.isArray(d.radii) && !(d.radii[0] > 0 && d.radii[1] > 0)) err.push(`${n}.radii 須為正值`);
      optNum(d.azimuth, n + '.azimuth', 0, 360); num(d.amplitude, n + '.amplitude'); profile(d.depthProfile, n + '.depthProfile');
      if (d.rim != null && isObj(d.rim, n + '.rim')) { num(d.rim.amplitude, n + '.rim.amplitude'); num(d.rim.radiusFactor, n + '.rim.radiusFactor', 0); num(d.rim.width, n + '.rim.width', 0.01); profile(d.rim.depthProfile, n + '.rim.depthProfile'); }
    });
    faults.forEach((f, i) => {
      const n = `structure.faults[${i}]`; if (!isObj(f, n)) return;
      oneOf(f.type, n + '.type', ['normal', 'reverse', 'thrust']); num(f.strike, n + '.strike', 0, 360); num(f.dip, n + '.dip', 5, 90);
      if (f.through != null) xy(f.through, n + '.through'); optNum(f.zRef, n + '.zRef'); num(f.throw, n + '.throw', 0, 10000);
      optNum(f.tipDepth, n + '.tipDepth'); optNum(f.fullThrowDepth, n + '.fullThrowDepth'); optNum(f.bottomDepth, n + '.bottomDepth'); oneOf(f.throwProfile, n + '.throwProfile', ['smooth', 'linear'], true);
      if (f.cuts != null && typeof f.cuts !== 'boolean') err.push(`${n}.cuts 須為布林值（斷層預設切穿所有地層；false = 僅顯示斷層面）`);
      if (f.listric != null && isObj(f.listric, n + '.listric')) { num(f.listric.detachDepth, n + '.listric.detachDepth', 1); num(f.listric.minDip, n + '.listric.minDip', 1, 90); }
      if (f.rollover != null && isObj(f.rollover, n + '.rollover')) num(f.rollover.lambda, n + '.rollover.lambda', 1);
      taper(f.alongTaper, n + '.alongTaper');
    });
    if (S.basementTruncation != null && typeof S.basementTruncation !== 'boolean') err.push('structure.basementTruncation 須為布林值（true：基盤以上各層以基盤頂面截切）');
    if (s.wells) s.wells.forEach((w, i) => { num(w.x, `wells[${i}].x`); num(w.y, `wells[${i}].y`); if (w.type && !['injection', 'observation'].includes(w.type)) err.push(`wells[${i}].type 無效`); });
    if (s.monitors) s.monitors.forEach((m, i) => { num(m.x, `monitors[${i}].x`); num(m.y, `monitors[${i}].y`); if (!m.id) err.push(`monitors[${i}].id 缺少`); });
    if (s.vectors) s.vectors.forEach((v, i) => { if (!v.points && !v.lonlat) err.push(`vectors[${i}] 需 points 或 lonlat`); });
    if (s.horizons) {
      if (!s.model || !s.model.grid) err.push('提供 horizons 時 model.grid 必填');
      else { const n = (s.model.grid[0] + 1) * (s.model.grid[1] + 1); if (!Array.isArray(s.horizons) || s.horizons.length !== s.stratigraphy.length + 1) err.push(`horizons 須有 ${s.stratigraphy.length + 1} 個層面（地表 + 每層頂面 + 模型底）`); else s.horizons.forEach((h, i) => { if (!h.z || h.z.length !== n) err.push(`horizons[${i}].z 長度須為 ${n}`); }); }
    }
    return err;
  }
  function normalizeSite(s) {
    s.setting = s.setting || 'onshore';
    s.surface = s.surface || { kind: s.setting === 'offshore' ? 'offshore' : s.setting === 'coastal' ? 'coastal' : 'onshore', waterDepth: s.waterDepth || 0 };
    s.model.grid = s.model.grid || [64, 64];
    s.structure = s.structure || {}; s.structure.faults = s.structure.faults || []; s.structure.folds = s.structure.folds || []; s.structure.domes = s.structure.domes || [];
    s.wells = s.wells && s.wells.length ? s.wells : [{ name: 'INJ-1', type: 'injection', x: 0, y: 0 }];
    if (!s.wells.some(w => (w.type || 'injection') === 'injection')) s.wells.unshift({ name: 'INJ-1', type: 'injection', x: 0, y: 0 });
    s.monitors = s.monitors || []; s.vectors = s.vectors || [];
    s.assessment = s.assessment || {}; s.dataStatus = s.dataStatus || 'imported';
    s.stratigraphy.forEach((f, i) => { f.color = f.color || ['#efe6cf', '#d8c08a', '#c8cfa2', '#7d8f8f', '#f1cf5e', '#95a48f', '#e5c67a', '#b3a48c', '#6f7f80', '#d9b34a', '#a89f91', '#c98c8c'][i % 12]; if (f.ntg == null) f.ntg = f.role === 'seal' ? 0 : 1; if (f.vshale == null) f.vshale = f.role === 'seal' ? 0.8 : 0.3; if (f.entryPressure == null) f.entryPressure = f.role === 'seal' ? 3 : 0.1; });
    if (s.horizons) s.horizons.forEach(h => { if (!(h.z instanceof Float32Array)) h.z = Float32Array.from(h.z); });
    return s;
  }
  function importSiteJSON(text, msgEl) {
    let obj; try { obj = JSON.parse(text); } catch (e) { msgEl.className = 'msg err'; msgEl.textContent = 'JSON 解析失敗：' + e.message; return; }
    const list = Array.isArray(obj) ? obj : [obj];
    const allErr = [];
    list.forEach((s, i) => { const e = validateSite(s); if (e.length) allErr.push(`[${i}] ${s && s.id ? s.id : ''}：\n  ` + e.join('\n  ')); });
    if (allErr.length) { msgEl.className = 'msg err'; msgEl.textContent = '驗證失敗：\n' + allErr.join('\n'); return; }
    for (const s of list) {
      normalizeSite(s);
      const idx = App.sites.findIndex(x => x.id === s.id);
      if (idx >= 0) App.sites[idx] = s; else App.sites.push(s);
      invalidateSite(s.id); delete App.results[s.id]; delete App.paramsBySite[s.id];
    }
    fillSiteSelect(); App.map.setSites(App.sites); renderSiteList();
    msgEl.className = 'msg ok'; msgEl.textContent = `已匯入 ${list.length} 個場址：` + list.map(s => s.id).join(', ');
    selectSite(list[0].id); evaluateOthersInBackground();
  }
  function importOverlayGeoJSON(text, msgEl) {
    let fc; try { fc = JSON.parse(text); } catch (e) { msgEl.className = 'msg err'; msgEl.textContent = 'JSON 解析失敗：' + e.message; return; }
    if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) { msgEl.className = 'msg err'; msgEl.textContent = '須為 GeoJSON FeatureCollection'; return; }
    const kinds = { source: 'sources', field: 'fields', fault: 'faults', basin: 'basins', high: 'basins' };
    const counts = {};
    for (const ft of fc.features) {
      const k = kinds[ft.properties && ft.properties.kind]; if (!k) continue;
      const geol = window.CCS_GEOLOGY[k];
      const i = geol.features.findIndex(x => x.properties.name === ft.properties.name);
      if (i >= 0) geol.features[i] = ft; else geol.features.push(ft);
      counts[k] = (counts[k] || 0) + 1;
    }
    const container = $('map'); container.innerHTML = '';
    App.map = window.CCSMap2D.create(container, { basemap: window.CCS_BASEMAP, geology: window.CCS_GEOLOGY });
    bindMapEvents(); App.map.setSites(App.sites); App.map.setResults(App.results); buildMapLayerToggles();
    if (App.active) { App.map.setActive(App.active.id); updateMapOverlay(); App.map.zoomTo(App.active.location.lon, App.active.location.lat); }
    msgEl.className = 'msg ok'; msgEl.textContent = '已合併圖層：' + (Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('、') || '（無可辨識的 properties.kind）');
  }
  function importHorizonCSV(text, msgEl) {
    const site = App.active, model = getModel(site), nx = site.model.grid[0], ny = site.model.grid[1], w = nx + 1;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const byName = new Map();
    let coordMode = 'tm2';
    for (const l of lines) {
      const c = l.split(/[,\t;]/).map(s => s.trim());
      if (c.length < 4) continue;
      if (isNaN(+c[1])) { if (/local/i.test(l)) coordMode = 'local'; continue; }
      const key = c[0]; let x = +c[1], y = +c[2]; const z = +c[3];
      if (coordMode === 'tm2') { x -= model.frame.origin.x; y -= model.frame.origin.y; }
      if (!byName.has(key)) byName.set(key, []); byName.get(key).push([x, y, z]);
    }
    if (!byName.size) { msgEl.className = 'msg err'; msgEl.textContent = '未解析到任何資料列（格式：horizon,x,y,z）'; return; }
    const names = site.stratigraphy.map(f => f.name);
    const horizons = [];
    const hx = model.grid.halfX, hy = model.grid.halfY, dx = model.grid.dx, dy = model.grid.dy;
    for (let h = 0; h <= site.stratigraphy.length; h++) {
      const key = h === 0 ? 'surface' : h === site.stratigraphy.length ? 'base' : names[h];
      const pts = byName.get(key) || byName.get(String(h));
      const z = new Float32Array(w * (ny + 1));
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = -hx + i * dx, y = -hy + j * dy;
        if (!pts) { z[j * w + i] = model.depthNatural(h, x, y); continue; }
        let num = 0, den = 0, best = Infinity, bz = 0;
        for (const q of pts) { const d2 = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y); if (d2 < best) { best = d2; bz = q[2]; } if (d2 < 9 * dx * dx) { const wgt = 1 / (d2 + 1); num += wgt * q[2]; den += wgt; } }
        z[j * w + i] = den > 0 ? num / den : bz;
      }
      horizons.push({ name: key, z, source: pts ? 'imported' : 'procedural' });
    }
    site.horizons = horizons; site.dataStatus = 'imported';
    invalidateSite(site.id); delete App.results[site.id];
    msgEl.className = 'msg ok'; msgEl.textContent = `已匯入層面：${[...byName.keys()].join(', ')}（${lines.length} 列）；未提供的層面沿用程序式模型。`;
    selectSite(site.id);
  }

  function formatDoc() {
    return `<div class="doc">
<h4>1. 場址模型 JSON（單一物件或陣列；schema：<code>schema/site.schema.json</code>）</h4>
<p>可從「匯出場址 JSON」取得完整範本。座標系：場址中心為原點的局部座標（x 東、y 北，公尺）；深度為海平面下（m，正值向下）。</p>
<table class="data"><thead><tr><th>欄位</th><th>型別</th><th>說明</th></tr></thead><tbody>
<tr><td>id, name, nameEn</td><td>string</td><td>識別碼（唯一）、名稱</td></tr>
<tr><td>type</td><td>enum</td><td><code>saline_aquifer</code>｜<code>depleted_gas</code></td></tr>
<tr><td>setting</td><td>enum</td><td><code>onshore</code>｜<code>coastal</code>｜<code>offshore</code></td></tr>
<tr><td>location</td><td>{lon, lat}</td><td>WGS84；模型原點</td></tr>
<tr><td>model</td><td>{extent:[Lx,Ly], grid:[nx,ny], depthMax}</td><td>範圍（m）、格網、模型底深度</td></tr>
<tr><td>surface</td><td>object</td><td>kind（<code>onshore</code>｜<code>coastal</code>｜<code>offshore</code>）、elevation(m)、relief[{fold:索引 | dome:索引, amplitude}]（地形跟隨 structure.folds／domes）、coastRamp（數值，自海岸線向內陸達基準高程的距離 m）、shoreElevation、bathymetry{slope,maxDepth}、waterDepth（offshore 固定水深）</td></tr>
<tr><td>stratigraphy[]</td><td>array（由淺至深）</td><td>name、nameEn、age、lithology、role（reservoir/secondary/seal/overburden/basement）、top（參考深度 m）、color、porosity、permeability(mD)、ntg、vshale、entryPressure(MPa，CO₂–鹵水)、thicknessMods[]；屬性場選用：phiSd、kSd、trend(uniform/fining/coarsening)、grClean、grShale、rhoMa、vpMa</td></tr>
<tr><td>structure.regionalDip</td><td>object</td><td>{dip, azimuth, through:[x,y]}；所有 through／center 一律為 [x, y] 陣列（局部座標 m）</td></tr>
<tr><td>structure.folds[]</td><td>array</td><td>type（<code>anticline</code>｜<code>syncline</code>）、axisAzimuth、through:[x,y]、amplitude(m)、halfWidth(m)、shape（<code>cosine</code>｜<code>gaussian</code>）、depthProfile{type: constant｜growDown｜growUp｜window, z0, z1, z2, z3}、alongTaper{center, halfLength}</td></tr>
<tr><td>structure.domes[]</td><td>array</td><td>kind（dome｜diapir｜basementHigh）、center:[x,y]、radii:[rx,ry]、azimuth、amplitude(m)、depthProfile、rim{amplitude, radiusFactor, width, depthProfile}（邊緣向斜）</td></tr>
<tr><td>structure.faults[]</td><td>array</td><td>type（<code>normal</code>｜<code>reverse</code>｜<code>thrust</code>）、strike、dip、through:[x,y]（深度 zRef 處的通過點）、zRef、throw(m)、tipDepth、fullThrowDepth、throwProfile（smooth｜linear）、listric{detachDepth,minDip}、rollover{lambda}、alongTaper{center,halfLength}、cuts（布林；預設切穿所有地層，false 僅顯示）；假設斷層彼此不相交</td></tr>
<tr><td>structure.basementTruncation</td><td>boolean</td><td>true：基盤（role=basement）以上各層以基盤頂面截切（超覆尖滅）</td></tr>
<tr><td>stratigraphy[].thicknessMods[]</td><td>array</td><td>{type: wedge, fault:索引, side: hw｜fw, factor, lambda}｜{type: linear, azimuth, rate}｜{type: fold, fold:索引, factor}｜{type: dome, dome:索引, factor}</td></tr>
<tr><td>conditions</td><td>object</td><td>surfaceTemp(°C)、tempGradient(°C/km)、pressureGradient(MPa/km)、overpressure{startDepth,gradient}、fractureGradient、maxBhpFraction、salinity(ppm)、stress{svGradient, shmaxRatio, shminRatio, shmaxAzimuth}、depletion、gasSaturation、recoveryFactor</td></tr>
<tr><td>wells[]</td><td>[{name,type,x,y,…}]</td><td>type=injection（第一口為評估用注入井）｜observation；觀測井以 target（reservoir / aboveSeal / 地層名）推算射孔層位，或直接給 depth、perf:[頂,底]；deviation{east,north} 為斜井井底位移；note</td></tr>
<tr><td>monitors[]</td><td>[{id,name,kind,x,y}]</td><td>kind：flux / seismic / water / insar / pressure</td></tr>
<tr><td>vectors[]</td><td>[{name,kind,color,closed,points|lonlat}]</td><td>許可區、管線等；points 為局部座標，lonlat 為 WGS84</td></tr>
<tr><td>hetero</td><td>{major,minor,fine}</td><td>屬性場非均質尺度（m）</td></tr>
<tr><td>assessment</td><td>object</td><td>injectionRate(Mt/yr)、years、startYear、efficiency、closureFill、swirr、sgr、krco2、phiCut、vshCut … 等評估預設值</td></tr>
<tr><td>horizons[]（選用）</td><td>[{name, z:number[(nx+1)(ny+1)]}]</td><td><b>實測層面格網</b>：共 stratigraphy.length+1 個（地表、各層頂面、模型底），列優先（j 北向、i 東向）；提供時略過程序式構造建模，faults 僅顯示</td></tr>
<tr><td>dataStatus, description, basis, references, flags</td><td>—</td><td>資料狀態與說明</td></tr>
</tbody></table>
<h4>2. 層面 CSV（作用中場址）</h4>
<p>每列 <code>horizon,x,y,z</code>；x,y 為 TWD97 TM2（EPSG:3826）公尺（標頭含 <code>local</code> 則視為局部座標）；z 為海平面下深度（m）。horizon 為地層名稱（該層頂面）、<code>surface</code>（地表/海床）或 <code>base</code>（模型底）。散點以 IDW 重取樣至模型格網；未提供的層面沿用程序式模型。</p>
<h4>3. 圖層 GeoJSON</h4>
<p>FeatureCollection，每個 Feature 的 <code>properties.kind</code> 為 <code>source</code>（Point，需 name、emission_mtpa、sector）、<code>field</code>（Point）、<code>fault</code>（LineString，name、type）、<code>basin</code>／<code>high</code>（Polygon，name）；同名者覆蓋。</p>
<h4>4. 底圖</h4>
<p><code>data/taiwan-basemap.js</code> 由 <code>tools/build-basemap.mjs</code> 產生（g0v 縣市界 CC0 + Natural Earth 等深線，public domain）；可改指向其他 GeoJSON 來源重新產生。</p>
</div>`;
  }
  function buildDataTab() {
    const el = $('tab-data');
    el.innerHTML = `<div class="desc"><b>資料狀態</b>：內建 7 個場址為<b>模擬資料</b>（依區域地質典型值合成，非實測）；觀測井、監測站與許可區為 MMV 規劃示意。以下介面可整批置換。</div>
      <details class="group" open><summary>匯入場址模型 JSON</summary><div class="body">
        <input type="file" id="fileSite" accept=".json,application/json"><div class="hint">或貼上 JSON：</div><textarea id="txtSite" placeholder='{"id":"...", ...} 或 [ {...}, {...} ]'></textarea>
        <div class="btnrow"><button class="primary" id="btnImportSite">驗證並匯入</button><button id="btnTemplate">下載目前場址作為範本</button></div><div id="msgSite" class="msg" hidden></div></div></details>
      <details class="group"><summary>匯入層面格網 CSV（覆蓋作用中場址的構造）</summary><div class="body">
        <input type="file" id="fileHz" accept=".csv,.txt"><div class="btnrow"><button id="btnImportHz">匯入</button><button id="btnClearHz">移除匯入層面（回復程序式模型）</button></div><div id="msgHz" class="msg" hidden></div></div></details>
      <details class="group"><summary>匯入圖層 GeoJSON（排放源／斷層／盆地／油氣田）</summary><div class="body">
        <input type="file" id="fileGeo" accept=".json,.geojson"><div class="btnrow"><button id="btnImportGeo">匯入並合併</button></div><div id="msgGeo" class="msg" hidden></div></div></details>
      <details class="group"><summary>匯出</summary><div class="body"><div class="btnrow"><button id="btnExport2">場址 JSON（含目前參數）</button><button id="btnReport2">評估結果 JSON + 時間序列 CSV</button><button id="btnSnap3d2">3D 圖片 PNG</button><button id="btnSnap2d2">2D 圖台 PNG</button></div></div></details>
      <details class="group"><summary>資料格式說明</summary><div class="body">${formatDoc()}</div></details>
      <details class="group"><summary>作用中場址的地質假設</summary><div class="body" id="siteBasis"></div></details>`;
    const readFile = (input, cb) => { const f = input.files && input.files[0]; if (!f) return false; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsText(f, 'utf-8'); return true; };
    $('btnImportSite').addEventListener('click', () => { const m = $('msgSite'); m.hidden = false; if (!readFile($('fileSite'), t => importSiteJSON(t, m))) { if ($('txtSite').value.trim()) importSiteJSON($('txtSite').value, m); else { m.className = 'msg err'; m.textContent = '請選擇檔案或貼上 JSON'; } } });
    $('btnTemplate').addEventListener('click', exportSite);
    $('btnImportHz').addEventListener('click', () => { const m = $('msgHz'); m.hidden = false; if (!readFile($('fileHz'), t => importHorizonCSV(t, m))) { m.className = 'msg err'; m.textContent = '請選擇 CSV 檔'; } });
    $('btnClearHz').addEventListener('click', () => { const s = App.active; if (!s.horizons) return; delete s.horizons; s.dataStatus = window.CCS_SITES.find(x => x.id === s.id) ? 'simulated' : 'imported'; invalidateSite(s.id); selectSite(s.id); });
    $('btnImportGeo').addEventListener('click', () => { const m = $('msgGeo'); m.hidden = false; if (!readFile($('fileGeo'), t => importOverlayGeoJSON(t, m))) { m.className = 'msg err'; m.textContent = '請選擇 GeoJSON 檔'; } });
    $('btnExport2').addEventListener('click', exportSite); $('btnReport2').addEventListener('click', exportReport);
    $('btnSnap3d2').addEventListener('click', snap3d); $('btnSnap2d2').addEventListener('click', snap2d);
  }
  function updateSiteBasis() {
    const s = App.active, el = $('siteBasis'); if (!el) return;
    el.innerHTML = `<p><b>${esc(s.name)}</b>（${esc(s.nameEn || '')}）｜${esc(s.region || '')}</p><p>${esc(s.description || '')}</p><p><b>模擬假設：</b>${esc(s.basis || '—')}</p>
      ${s.flags ? `<p><b>風險旗標：</b>${s.flags.map(esc).join('、')}</p>` : ''}<p class="refs">參考：${(s.references || []).map(esc).join('；')}</p>
      ${s.horizons ? `<p><b>層面來源：</b>${s.horizons.map(h => esc(h.name) + '(' + (h.source || 'imported') + ')').join('、')}</p>` : ''}`;
  }
  function snap3d() { download(`ccs-3d-${App.active.id}-${Date.now()}.png`, App.view.snapshot()); }
  function snap2d() { download(`ccs-map-${App.active.id}-${Date.now()}.png`, App.map.snapshot()); }

  // ---------- 地圖事件 ----------
  function bindMapEvents() {
    App.map.on('siteclick', s => selectSite(s.id));
    App.map.on('pick', pk => handlePick(pk.x, pk.y));
    App.map.on('click', info => { if (info.inside && App.active) showInfo('virtual', { x: info.local.x, y: info.local.y }); });
    App.map.on('mousemove', info => {
      const st = $('mapStatus');
      if (!info) { st.textContent = '—'; return; }
      const tm = `E ${fmt(info.x, 0)}  N ${fmt(info.y, 0)}`;
      let h = '';
      if (info.hover) {
        const it = info.hover.item, pr = it.properties || {};
        if (info.hover.kind === 'site') h = `｜場址 ${it.id} ${it.name}（點選載入）`;
        else if (info.hover.kind === 'well') h = `｜${it.type === 'observation' ? '觀測井' : '注入井'} ${it.name}：射孔 ${fmt(it.perfTop, 0)}–${fmt(it.perfBase, 0)} m`;
        else if (info.hover.kind === 'monitor') h = `｜監測站 ${it.id} ${it.name || ''}（${MON[it.kind] || it.kind}）`;
        else if (info.hover.kind === 'source') h = `｜排放源 ${pr.name}：約 ${pr.emission_mtpa} Mt CO₂/yr（${pr.sector}，${pr.operator}）`;
        else if (info.hover.kind === 'field') h = `｜油氣田 ${pr.name}：${pr.note || ''}`;
        else if (info.hover.kind === 'fault') h = `｜${pr.name}（${pr.type}）${pr.note ? '：' + pr.note : ''}`;
        else if (info.hover.kind === 'basin') h = `｜${pr.name}：${pr.note || ''}`;
      }
      st.textContent = `${info.lat.toFixed(4)}°N ${info.lon.toFixed(4)}°E ｜ TM2 ${tm}${h}`;
    });
  }
  /** 跟隨 3D 視點：地圖中心對準 3D 軌道目標點（比例尺不變） */
  function followCamera(info) {
    const ll = getModel(App.active).frame.toLonLat(info.target.x, info.target.y);
    App.map.centerOn(ll[0], ll[1]);
  }
  function buildMapLayerToggles() {
    const el = $('mapLayers');
    const names = { bathymetry: '等深線', basins: '盆地', faults: '活動斷層', sources: '排放源', fields: '油氣田', cities: '城市', graticule: '經緯網', camera: '3D 視錐' };
    el.innerHTML = Object.keys(names).map(k => `<label><input type="checkbox" data-l="${k}" ${App.map.layers[k] ? 'checked' : ''}>${names[k]}</label>`).join('');
    el.querySelectorAll('input').forEach(i => i.addEventListener('change', e => { App.map.layers[e.target.dataset.l] = e.target.checked; App.map.render(); }));
  }

  // ---------- 初始化 ----------
  // ---------- 主題 ----------
  function applyTheme(mode, persist) {
    document.documentElement.dataset.theme = mode;
    // 隱私模式等無法寫入 localStorage 時只套用本次，不視為錯誤
    if (persist) { try { localStorage.setItem('ccs-theme', mode); } catch (e) { /* 忽略 */ } }
    CH.setTheme(mode); SEC.setTheme(mode); WL.setTheme(mode); App.map.setTheme(mode); App.view.setTheme(mode);
    $('btnTheme').title = mode === 'dark' ? '切換為淺色模式' : '切換為深色模式';
    if (!App.result) return;
    // canvas / WebGL 內容不吃 CSS 變數，需重繪：圖表、3D 文字標籤與線色、分析面板
    renderResults(); update3D(); App.view.setMonitors(monitorsFor());
    if (App.section.a) App.view.setSectionLine(App.section.a, App.section.b, surfZ());
    if (!$('analysis').hidden) { if (App.section.data) redrawSection(); if (App.log) showLog(App.log.x, App.log.y, App.log.title, App.log.well, true); }
  }
  function bindTheme() {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', false);
    $('btnTheme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
    // 使用者未手動選過時跟隨系統切換
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) mq.addEventListener('change', e => { let saved = null; try { saved = localStorage.getItem('ccs-theme'); } catch (err) { /* 忽略 */ } if (!saved) applyTheme(e.matches ? 'dark' : 'light', false); });
  }

  function init() {
    if (!window.THREE) { $('view3d').innerHTML = '<div style="padding:20px">找不到 vendor/three.min.js，3D 檢視無法啟動。</div>'; }
    App.map = window.CCSMap2D.create($('map'), { basemap: window.CCS_BASEMAP, geology: window.CCS_GEOLOGY });
    bindMapEvents(); buildMapLayerToggles();
    App.map.setSites(App.sites); App.map.fitTaiwan();
    App.view = window.CCSView3D.create($('view3d'));
    bindTheme();
    const tip = $('tip3d');
    App.view.onHover(info => {
      if (!info || !App.active || !App.result) { tip.hidden = true; return; }
      const model = getModel(App.active), ll = model.frame.toLonLat(info.x, info.y), tm = model.frame.toTM2(info.x, info.y);
      let what = '', extra = '';
      const u = info.object;
      if (u.kind === 'layer') {
        const f = App.active.stratigraphy[u.formation]; what = `<b>${esc(f.name)}</b> ${ROLE[f.role] || ''}`;
        if (App.sampler) { const top = model.depthNatural(u.formation, info.x, info.y), base = model.depthNatural(u.formation + 1, info.x, info.y); const zRel = base > top ? Math.min(1, Math.max(0, (info.z - top) / (base - top))) : 0.5; const pr = App.sampler.propsAt(u.formation, info.x, info.y, zRel); extra = `<br>φ ${(pr.phi * 100).toFixed(1)}%　k ${pr.perm >= 1 ? fmt(pr.perm, 0) : pr.perm.toExponential(1)} mD　V_sh ${pr.vsh.toFixed(2)}${pr.sg > 0.005 ? '　S_g ' + (pr.sg * 100).toFixed(0) + '%' : ''}`; }
      }
      else if (u.kind === 'fault') what = `<b>斷層：${esc(u.name)}</b>（${u.def.type === 'normal' ? '正' : '逆'}斷層，走向 ${u.def.strike}°，傾角 ${u.def.dip}°）`;
      else if (u.kind === 'plume') what = '<b>CO₂ 羽流</b>';
      else if (u.kind === 'well') what = `<b>${esc(u.well.name)}</b>（${u.well.type === 'observation' ? '觀測井' : '注入井'}）`;
      else if (u.kind === 'monitor') what = `<b>監測站 ${esc(u.monitor.id)}</b> ${esc(u.monitor.name || '')}`;
      else what = esc(u.kind || '');
      tip.innerHTML = `${what}${extra}<br>深度 ${fmt(info.z, 0)} m ｜ 局部 (${fmt(info.x, 0)}, ${fmt(info.y, 0)})<br>TM2 E ${fmt(tm[0], 0)} N ${fmt(tm[1], 0)} ｜ ${ll[1].toFixed(4)}°N ${ll[0].toFixed(4)}°E${App.mode ? '<br><i>點選以取點</i>' : '<br><i>點選顯示屬性卡</i>'}`;
      tip.hidden = false; tip.style.left = (info.screen.x + 14) + 'px'; tip.style.top = (info.screen.y + 14) + 'px';
    });
    App.view.onClick(info => {
      if (!App.active) return;
      if (!info) { if (App.mode) $('modeHint').textContent = MODE_HINT[App.mode] + '｜上一點在模型範圍外，未採用'; return; }
      if (App.mode) { handlePick(info.x, info.y); return; }
      const u = info.object;
      App.view.setSelection(u.kind === 'layer' || u.kind === 'fault' || u.kind === 'plume' ? info.mesh : null);
      if (u.kind === 'layer') showInfo('layer', { formation: u.formation, x: info.x, y: info.y, z: info.z });
      else if (u.kind === 'fault') showInfo('fault', { index: u.index, name: u.name, def: u.def, x: info.x, y: info.y, z: info.z });
      else if (u.kind === 'plume') showInfo('plume', { x: info.x, y: info.y, z: info.z });
      else if (u.kind === 'well') showInfo('well', { well: u.well, x: u.well.x, y: u.well.y, z: u.well.perfTop });
      else if (u.kind === 'monitor') showInfo('monitor', { monitor: u.monitor });
      else if (u.kind === 'water') showInfo('water', { x: info.x, y: info.y, z: 0 });
      else if (u.kind === 'ground') showInfo('virtual', { x: info.x, y: info.y });
    });
    App.view.onCamera(info => {
      App.camera = info;
      if (!App.active) return;
      if (App.map.layers.camera) App.map.patchOverlay({ camera: info });
      if (App.follow3D) followCamera(info);
    });
    fillSiteSelect(); buildDataTab(); renderSiteList(); buildColorModes(); bindSectionHover();
    $('siteSelect').addEventListener('change', e => selectSite(e.target.value));
    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab-body').forEach(x => x.classList.toggle('active', x.id === 'tab-' + b.dataset.tab));
      if (b.dataset.tab === 'results') renderCharts();
      if (b.dataset.tab === 'data') updateSiteBasis();
    }));
    document.querySelectorAll('.pane-head button[data-view]').forEach(b => b.addEventListener('click', () => App.view.setView(b.dataset.view)));
    $('btnRotate').addEventListener('click', () => { const on = !$('btnRotate').classList.contains('on'); $('btnRotate').classList.toggle('on', on); App.view.setAutoRotate(on); });
    $('ve').addEventListener('input', e => { App.view.setVE(+e.target.value); $('veOut').textContent = (+e.target.value).toFixed(1) + '×'; });
    $('cutX').addEventListener('input', e => { App.cut.x = +e.target.value / 100; $('cutXOut').textContent = e.target.value + '%'; applyCut(); });
    $('cutY').addEventListener('input', e => { App.cut.y = +e.target.value / 100; $('cutYOut').textContent = e.target.value + '%'; applyCut(); });
    $('explode').addEventListener('input', e => { App.explode = +e.target.value; $('explodeOut').textContent = e.target.value + ' m'; App.view.setExplode(App.explode); });
    $('chkFaults').addEventListener('change', e => App.view.setFaultsVisible(e.target.checked));
    $('chkWater').addEventListener('change', e => App.view.setWaterVisible(e.target.checked));
    $('chkPlume').addEventListener('change', e => { App.plumeVisible = e.target.checked; update3D(); });
    $('chkWells').addEventListener('change', e => App.view.setGroupVisible('wells', e.target.checked));
    $('chkMonitors').addEventListener('change', e => App.view.setGroupVisible('monitors', e.target.checked));
    $('chkVectors').addEventListener('change', e => App.view.setGroupVisible('vectors', e.target.checked));
    $('chkFollow').addEventListener('change', e => { App.follow3D = e.target.checked; if (App.follow3D && App.camera) followCamera(App.camera); });
    $('btnWellMode').addEventListener('click', () => setMode(App.mode === 'well' ? null : 'well'));
    $('btnLogMode').addEventListener('click', () => setMode(App.mode === 'log' ? null : 'log'));
    $('btnSectionMode').addEventListener('click', () => setMode(App.mode === 'section' ? null : 'section'));
    $('btnAnalysis').addEventListener('click', () => { if ($('analysis').hidden) openAnalysis(App.section.data ? 'section' : 'log'); else closeAnalysis(); });
    $('anClose').addEventListener('click', closeAnalysis);
    document.querySelectorAll('#analysis [data-atab]').forEach(b => b.addEventListener('click', () => openAnalysis(b.dataset.atab)));
    $('tlPlay').addEventListener('click', togglePlay);
    $('tlSlider').addEventListener('input', e => { stopPlay(); setTime(+e.target.value); });
    $('btnExport').addEventListener('click', exportSite);
    $('btnReport').addEventListener('click', exportReport);
    $('btnSnap3d').addEventListener('click', snap3d); $('btnSnap2d').addEventListener('click', snap2d);
    $('btnHelp').addEventListener('click', () => { $('modalBox').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">資料格式說明</h3><button id="modalClose">關閉</button></div>${formatDoc()}`; $('modal').classList.add('open'); $('modalClose').addEventListener('click', () => $('modal').classList.remove('open')); });
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').classList.remove('open'); });
    $('btnFit').addEventListener('click', () => App.map.fitTaiwan());
    $('btnZoomSite').addEventListener('click', () => { const s = App.active; App.map.zoomTo(s.location.lon, s.location.lat, Math.min($('map').clientWidth, $('map').clientHeight) / (Math.max(s.model.extent[0], s.model.extent[1]) * 2.2)); });
    $('btnToggleMap').addEventListener('click', () => { const c = $('paneMap').classList.toggle('collapsed'); $('btnToggleMapLabel').textContent = c ? '展開圖台' : '收合圖台'; document.querySelector('.layout').style.gridTemplateColumns = c ? 'minmax(420px,1fr) 470px' : ''; App.view.resize(); });
    // 下拉選單／彈出面板：點選項目或點外部即關閉
    document.querySelectorAll('details.menu .menu-body button').forEach(b => b.addEventListener('click', () => { b.closest('details').open = false; }));
    document.addEventListener('click', e => { document.querySelectorAll('details.menu[open], details.layer-pop[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape') { setMode(null); $('modal').classList.remove('open'); } });
    new ResizeObserver(() => { if (!$('analysis').hidden && App.section.data) redrawSection(); }).observe($('analysis'));
    selectSite(App.sites[0].id);
    evaluateOthersInBackground();
  }
  window.CCSApp = App;
  window.addEventListener('DOMContentLoaded', init);
})();
