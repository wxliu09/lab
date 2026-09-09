/*
 * petro.js — 岩石物理屬性場（決定性非均質實現）與屬性色階
 *
 * 性質：這是「統計實現」而非量測。以各層的均值（porosity / permeability / ntg / vshale）加上
 * 變異參數（phiSd、kSd、粒序趨勢）與三階決定性值域雜訊（lateral 相變、層內單層、垂向粒序）
 * 產生逐點屬性；同一座標永遠得到同一組值，因此 3D 著色、井柱與剖面三者一致。
 * 評估計算仍以各層均值為主，屬性場用於視覺化、井柱 P10/P50/P90 與 cutoff 容積。
 *
 * 輸出屬性：phi、perm(mD)、ntg、vsh、gr(API)、sw、sg、rhob(g/cm³)、vp(m/s)、ai
 */
window.CCSPetro = (function () {
  'use strict';
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  /** 依岩性給的變異參數預設值（場址 stratigraphy 可覆寫同名欄位） */
  const LITH_DEFAULTS = {
    'gravel-sand': { phiSd: 0.040, kSd: 0.40, grClean: 25, grShale: 110, rhoMa: 2.65, vpMa: 2200, trend: 'uniform' },
    conglomerate: { phiSd: 0.040, kSd: 0.45, grClean: 30, grShale: 115, rhoMa: 2.65, vpMa: 2600, trend: 'fining' },
    sandstone: { phiSd: 0.030, kSd: 0.45, grClean: 32, grShale: 135, rhoMa: 2.65, vpMa: 3600, trend: 'fining' },
    'sand-shale': { phiSd: 0.035, kSd: 0.55, grClean: 40, grShale: 135, rhoMa: 2.66, vpMa: 3200, trend: 'uniform' },
    shale: { phiSd: 0.012, kSd: 0.60, grClean: 50, grShale: 150, rhoMa: 2.70, vpMa: 3400, trend: 'uniform' },
    mudstone: { phiSd: 0.015, kSd: 0.60, grClean: 50, grShale: 145, rhoMa: 2.68, vpMa: 3000, trend: 'uniform' },
    'coal-sand': { phiSd: 0.030, kSd: 0.55, grClean: 40, grShale: 140, rhoMa: 2.60, vpMa: 3300, trend: 'uniform' },
    'marine-clastics': { phiSd: 0.035, kSd: 0.50, grClean: 40, grShale: 130, rhoMa: 2.66, vpMa: 2400, trend: 'uniform' },
    basement: { phiSd: 0.006, kSd: 0.70, grClean: 60, grShale: 150, rhoMa: 2.72, vpMa: 5200, trend: 'uniform' }
  };
  const DEFAULT_HETERO = { major: 1500, minor: 600, fine: 250 };   // 非均質尺度（m）

  function formationPetro(f, over) {
    const d = LITH_DEFAULTS[f.lithology] || LITH_DEFAULTS['sand-shale'];
    const o = over || {};
    return {
      phi: o.porosity != null ? o.porosity : f.porosity, k: o.permeability != null ? o.permeability : f.permeability,
      ntg: o.ntg != null ? o.ntg : (f.ntg == null ? 1 : f.ntg), vsh: o.vshale != null ? o.vshale : (f.vshale || 0),
      phiSd: o.phiSd != null ? o.phiSd : (f.phiSd != null ? f.phiSd : d.phiSd), kSd: o.kSd != null ? o.kSd : (f.kSd != null ? f.kSd : d.kSd),
      grClean: f.grClean != null ? f.grClean : d.grClean, grShale: f.grShale != null ? f.grShale : d.grShale,
      rhoMa: f.rhoMa != null ? f.rhoMa : d.rhoMa, vpMa: f.vpMa != null ? f.vpMa : d.vpMa,
      trend: o.trend || f.trend || d.trend
    };
  }

  // ---- 決定性值域雜訊（排列表 + 格點值表 + smoothstep 內插；固定種子，任何環境結果相同）----
  const PERM = new Uint8Array(512), VAL = new Float32Array(256);
  (function () {
    let s = 20260903;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const p = []; for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
    for (let i = 0; i < 256; i++) VAL[i] = rnd() * 2 - 1;
  })();
  function noise2(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const X = (ix + seed * 37) & 255, Y = iy & 255;
    const a = VAL[PERM[PERM[X] + Y]], b = VAL[PERM[PERM[X + 1] + Y]], c = VAL[PERM[PERM[X] + Y + 1]], d = VAL[PERM[PERM[X + 1] + Y + 1]];
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  }
  /** 三階疊加，值域約 −1～+1 */
  function fbm(x, y, scale, seed) {
    return (noise2(x / scale, y / scale, seed) + 0.5 * noise2(x / scale * 2.13 + 7.7, y / scale * 2.13 - 3.1, seed + 31)
      + 0.25 * noise2(x / scale * 4.37 - 1.9, y / scale * 4.37 + 5.3, seed + 67)) / 1.75;
  }

  /**
   * 建立屬性場取樣器。
   * ctx = { strat, formations(params 覆寫), hetero, swirr, rhoBrine, rhoCO2, plume?: {L, center:{x,y}, rMax, thickness(r), sgMax, resThick(x,y), ntg} }
   */
  function sampler(ctx) {
    const H = Object.assign({}, DEFAULT_HETERO, ctx.hetero || {});
    const fp = ctx.strat.map((f, i) => formationPetro(f, ctx.formations && ctx.formations[i]));
    const rhoW = ctx.rhoBrine || 1020, rhoC = ctx.rhoCO2 || 650, swirr = ctx.swirr != null ? ctx.swirr : 0.3;

    function co2Sat(L, x, y, zRel) {
      const pl = ctx.plume; if (!pl || pl.L !== L || !(pl.rMax > 0)) return 0;
      const r = Math.hypot(x - pl.center.x, y - pl.center.y);
      if (r >= pl.rMax) return 0;
      const hNet = pl.thickness(r); if (hNet <= 0) return 0;
      const gross = pl.resThick ? pl.resThick(x, y) : hNet;
      const hGross = Math.min(gross, hNet / Math.max(pl.ntg || 1, 0.05));
      const d = zRel * gross;
      if (d > hGross) return 0;
      const finger = 1 + 0.25 * fbm(x, y, 420, 21);
      return clamp(pl.sgMax * (1 - 0.35 * d / Math.max(hGross, 1)) * finger, 0, pl.sgMax);
    }

    function propsAt(L, x, y, zRel) {
      const p = fp[L]; zRel = clamp(zRel, 0.02, 0.98);
      let trend = 0;
      if (p.trend === 'fining') trend = (zRel - 0.5) * 2;          // 向上變細：底部品質較佳
      else if (p.trend === 'coarsening') trend = (0.5 - zRel) * 2;
      const lateral = 0.62 * fbm(x, y, H.major, L + 1) + 0.38 * fbm(x, y, H.minor, L + 5);
      const lamina = Math.sin(zRel * Math.PI * 5.5 + 3.0 * fbm(x, y, H.fine, L + 9));
      const g = 0.85 * lateral + 0.35 * lamina + 0.45 * trend;
      const phi = clamp(p.phi + p.phiSd * g * 1.25, 0.004, 0.45);
      const zPhi = p.phiSd > 0 ? (phi - p.phi) / p.phiSd : 0;
      const perm = Math.pow(10, Math.log10(Math.max(p.k, 1e-7)) + p.kSd * (zPhi + 0.3 * fbm(x, y, H.minor * 0.6, L + 13)));
      const vsh = clamp(p.vsh * (1 - 0.55 * g), 0, 1);
      const ntg = clamp(p.ntg + 0.20 * g, 0, 1);
      const gr = p.grClean + (p.grShale - p.grClean) * vsh;
      const sg = co2Sat(L, x, y, zRel), sw = 1 - sg;
      const rhoFluid = (rhoW * sw + rhoC * sg) / 1000;
      const rhob = p.rhoMa * (1 - phi) + rhoFluid * phi;
      const vp = (1 - phi) * (1 - phi) * p.vpMa + phi * (1500 * sw + 450 * sg);   // Raymer–Hunt–Gardner 型式
      return { phi, perm, ntg, vsh, gr, sw, sg, rhob, vp, ai: rhob * vp };
    }
    return { propsAt, co2Sat, petro: fp, hetero: H, swirr };
  }

  // ---- 色階 ----
  function ramp(stops, t) {
    t = clamp(t, 0, 1);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (t <= b[0] || i === stops.length - 2) {
        const u = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
        return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u];
      }
    }
    return stops[stops.length - 1][1];
  }
  const RAMPS = {
    // 近 viridis（相鄰色相，感知均勻，色覺缺陷友善）
    viridis: [[0, [0.267, 0.005, 0.329]], [0.25, [0.229, 0.322, 0.545]], [0.5, [0.127, 0.567, 0.551]], [0.75, [0.369, 0.788, 0.383]], [1, [0.993, 0.906, 0.144]]],
    // 泥質含量：砂（黃）→ 泥（灰藍）
    shaliness: [[0, [0.92, 0.78, 0.40]], [0.45, [0.68, 0.64, 0.50]], [1, [0.30, 0.36, 0.44]]],
    // CO₂ 飽和度：儲層底色 → 橙 → 紅
    heat: [[0, [0.86, 0.80, 0.55]], [0.15, [0.93, 0.62, 0.30]], [0.55, [0.92, 0.38, 0.20]], [1, [0.75, 0.10, 0.20]]]
  };
  const COLOR_MODES = [
    { key: 'lithology', label: '岩性（預設）', unit: '' },
    { key: 'phi', label: '孔隙率 φ', unit: '%', min: 0, max: 35, ramp: 'viridis', pick: p => p.phi * 100, fmt: v => v.toFixed(0) },
    { key: 'perm', label: '滲透率 k', unit: 'mD', min: -4, max: 3.5, ramp: 'viridis', log: true, pick: p => Math.log10(Math.max(1e-6, p.perm)),
      fmt: v => { const k = Math.pow(10, v); return k >= 10 ? k.toFixed(0) : k >= 0.1 ? k.toFixed(1) : k.toExponential(0); } },
    { key: 'ntg', label: '淨毛比 NTG', unit: '', min: 0, max: 1, ramp: 'viridis', pick: p => p.ntg, fmt: v => v.toFixed(2) },
    { key: 'vsh', label: '泥質含量 V_sh', unit: '', min: 0, max: 1, ramp: 'shaliness', pick: p => p.vsh, fmt: v => v.toFixed(2) },
    { key: 'sg', label: 'CO₂ 飽和度 S_g', unit: '', min: 0, max: 0.7, ramp: 'heat', pick: p => p.sg, fmt: v => v.toFixed(2) },
    { key: 'vp', label: '縱波速度 V_p', unit: 'm/s', min: 1500, max: 5000, ramp: 'viridis', pick: p => p.vp, fmt: v => v.toFixed(0) },
    { key: 'ai', label: '聲阻抗 AI', unit: '10³ g/cm³·m/s', min: 3000, max: 13000, ramp: 'viridis', pick: p => p.ai, fmt: v => (v / 1000).toFixed(1) }
  ];
  const MODE_MAP = {}; COLOR_MODES.forEach(m => { MODE_MAP[m.key] = m; });
  function colorFor(key, props) {
    const m = MODE_MAP[key]; if (!m || !m.pick) return null;
    return ramp(RAMPS[m.ramp], (m.pick(props) - m.min) / (m.max - m.min));
  }
  function rampCSS(key, n) {
    const m = MODE_MAP[key]; if (!m || !m.ramp) return '';
    const out = []; for (let i = 0; i < n; i++) { const c = ramp(RAMPS[m.ramp], i / (n - 1)); out.push('rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')'); }
    return 'linear-gradient(90deg,' + out.join(',') + ')';
  }
  function rampTicks(key, n) {
    const m = MODE_MAP[key]; if (!m || !m.pick) return [];
    const out = []; for (let i = 0; i < n; i++) out.push(m.fmt(m.min + (m.max - m.min) * i / (n - 1)));
    return out;
  }
  function percentiles(values) {
    const v = values.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null;
    const q = p => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
    return { p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: v.reduce((s, x) => s + x, 0) / v.length };
  }
  /** 岩性著色的明暗：依局部 φ 相對均值的偏差 */
  function lithoShade(props, petro) { return 0.84 + 0.32 * clamp((props.phi - petro.phi) / (2.5 * Math.max(petro.phiSd, 1e-4)) + 0.5, 0, 1); }

  return { sampler, formationPetro, fbm, COLOR_MODES, MODE_MAP, colorFor, rampCSS, rampTicks, ramp, RAMPS, percentiles, lithoShade, LITH_DEFAULTS, DEFAULT_HETERO };
})();
