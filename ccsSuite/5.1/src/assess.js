/*
 * assess.js — 碳封存場址評估計算（純函式，不碰 DOM）
 *
 * 內容：
 *  - 井位地層柱、溫壓場（靜水壓／超壓、岩壓、破裂壓）、CO2 與地層水物性（co2props.js）
 *  - 構造閉合分析（儲層頂面格網、漫流法找溢出點；封閉斷層視為屏障）
 *  - 儲存容量：鹽水層（US-DOE 體積法 M = A·h·φ·ρ·E；構造圈閉 M = V_trap·φ·(1−Swirr)·fill·ρ）
 *              枯竭氣田（CSLF：M = ρCO2(P_init)·A·h·φ·Sg·Rf·(1−Fiw)）
 *  - 注入性與壓力：穩態二區複合徑向流（CO2 區 + 鹵水區，影響半徑由 Theis 推估），Horner 關井回復
 *  - CO2 羽流：Nordbotten, Celia & Bachu (2005) 銳介面解（忽略重力分異），停注後沿儲層頂面梯度浮力運移
 *  - 封閉層毛細封阻：h_max = P_entry / ((ρw − ρCO2) g)
 *  - 斷層：SGR（Yielding et al. 1997）、並置關係、Coulomb 再活化臨界孔壓增量（Andersonian 應力場）
 *  - 篩選檢核表與綜合評分
 */
window.CCSAssess = (function () {
  'use strict';
  const g = 9.80665, D2R = Math.PI / 180, YEAR = 365.25 * 86400, MD = 9.869233e-16;
  const P = () => window.CCSProps;

  const DEFAULTS = {
    efficiency: 0.02, closureFill: 0.8, swirr: 0.30, sgr: 0.25, krco2: 0.40,
    rockCompressibility: 4.5e-4, brineCompressibility: 4.5e-4, // 1/MPa
    wellRadius: 0.108, waterInvasion: 0.10, sgrThreshold: 0.20, friction: 0.6, cohesion: 0,
    maxBhpFraction: 0.9, postInjectionYears: 100, injectionRate: 1.0, years: 30, time: 30
  };

  function fillDefaults(site, overrides) {
    const p = Object.assign({}, DEFAULTS, site.assessment || {}, overrides || {});
    p.conditions = Object.assign({}, site.conditions, (overrides && overrides.conditions) || {});
    p.conditions.stress = Object.assign({}, site.conditions.stress || {}, (overrides && overrides.conditions && overrides.conditions.stress) || {});
    if (p.maxBhpFraction == null && p.conditions.maxBhpFraction != null) p.maxBhpFraction = p.conditions.maxBhpFraction;
    return p;
  }

  /** 井位地層柱：各層在井位的頂/底/厚度 */
  function wellColumn(model, wx, wy) {
    const n = model.strat.length, out = [];
    const z = []; for (let h = 0; h <= n; h++) z.push(model.depthNatural(h, wx, wy));
    for (let i = 0; i < n; i++) out.push({ index: i, top: z[i], base: z[i + 1], thickness: Math.max(0, z[i + 1] - z[i]) });
    return { surface: z[0], layers: out };
  }

  function makeField(model, C, zSurf) {
    const wd = Math.max(0, zSurf);                      // 海域：水深
    const pSeabed = 0.101325 + 10.1 * wd / 1000;        // 海水柱壓力
    const hydro = z => pSeabed + C.pressureGradient * Math.max(0, z - zSurf) / 1000;
    const pore = z => {
      const op = C.overpressure;
      if (op && z > op.startDepth) return hydro(op.startDepth) + op.gradient * (z - op.startDepth) / 1000;
      return hydro(z);
    };
    const litho = z => pSeabed + C.stress.svGradient * Math.max(0, z - zSurf) / 1000;
    const frac = z => pSeabed + C.fractureGradient * Math.max(0, z - zSurf) / 1000;
    const temp = z => C.surfaceTemp + C.tempGradient * Math.max(0, z - zSurf) / 1000;
    return { hydro, pore, litho, frac, temp, wd };
  }

  // ---------- 構造閉合（漫流法） ----------
  function closureAnalysis(model, grid, wx, wy, barrierFaults) {
    const { w, h, top, base, dx, dy, x0, y0 } = grid;
    const idx = (i, j) => j * w + i;
    const iw = Math.max(0, Math.min(w - 1, Math.round((wx - x0) / dx))), jw = Math.max(0, Math.min(h - 1, Math.round((wy - y0) / dy)));
    // 各格點的斷層側別（以儲層頂面）
    const sideKey = new Array(w * h);
    if (model.cutFaults.length) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const s = model.naturalSides(grid.horizon, x0 + i * dx, y0 + j * dy);
      sideKey[idx(i, j)] = s.map((v, k) => (barrierFaults.has(k) ? v : 0)).join(',');
    }
    const blocked = (a, b) => sideKey.length && sideKey[a] !== sideKey[b];
    // 爬升至局部最高點（最淺）
    let ci = iw, cj = jw;
    for (let it = 0; it < w * h; it++) {
      let best = top[idx(ci, cj)], bi = ci, bj = cj;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= w || j >= h) continue;
        if (blocked(idx(ci, cj), idx(i, j))) continue;
        if (top[idx(i, j)] < best - 1e-6) { best = top[idx(i, j)]; bi = i; bj = j; }
      }
      if (bi === ci && bj === cj) break; ci = bi; cj = bj;
    }
    const zCrest = top[idx(ci, cj)];
    const flood = thr => {
      const seen = new Uint8Array(w * h), stack = [idx(ci, cj)]; seen[stack[0]] = 1;
      let spill = false, cells = [];
      while (stack.length) {
        const k = stack.pop(); const i = k % w, j = Math.floor(k / w); cells.push(k);
        if (i === 0 || j === 0 || i === w - 1 || j === h - 1) spill = true;
        const nb = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
        for (const [a, b] of nb) {
          if (a < 0 || b < 0 || a >= w || b >= h) continue;
          const kk = idx(a, b); if (seen[kk]) continue;
          if (top[kk] > thr || blocked(k, kk)) continue;
          seen[kk] = 1; stack.push(kk);
        }
      }
      return { spill, cells };
    };
    let zmax = -Infinity; for (let k = 0; k < top.length; k++) if (top[k] > zmax) zmax = top[k];
    if (flood(zCrest + 0.5).spill) return { exists: false, crest: { i: ci, j: cj, x: x0 + ci * dx, y: y0 + cj * dy, z: zCrest } };
    let lo = zCrest + 0.5, hi = zmax + 1;
    for (let it = 0; it < 24; it++) { const m = 0.5 * (lo + hi); if (flood(m).spill) hi = m; else lo = m; }
    const res = flood(lo);
    const cellArea = dx * dy; let vol = 0;
    for (const k of res.cells) vol += Math.max(0, Math.min(lo, base[k]) - top[k]) * cellArea;
    const inClosure = new Uint8Array(w * h); for (const k of res.cells) inClosure[k] = 1;
    return { exists: true, crest: { i: ci, j: cj, x: x0 + ci * dx, y: y0 + cj * dy, z: zCrest }, spillDepth: lo,
      height: lo - zCrest, area: res.cells.length * cellArea, rockVolume: vol, cells: res.cells, mask: inClosure };
  }

  // ---------- 斷層 SGR / 並置 ----------
  function faultSealAnalysis(model, col, res, resIdx, P, wx, wy, T, faultDists) {
    const strat = model.strat;
    return model.faults.map(f => {
      const u = f.u(wx, wy);
      const throwAtRes = f.throwAt(u, res.top);
      const dist = Math.abs(f.v(wx, wy) - f.vf(res.top));
      // SGR：儲層頂面上方厚度 = 斷距的地層區間（下盤地層柱）之 Vsh 厚度加權平均
      let sgr = 0;
      if (throwAtRes > 1) {
        const zA = res.top - throwAtRes, zB = res.top; let acc = 0;
        for (const L of col.layers) {
          const o = Math.max(0, Math.min(zB, L.base) - Math.max(zA, L.top));
          if (o > 0) acc += o * (P.formations[L.index].vshale || 0);
        }
        sgr = acc / throwAtRes;
      }
      const above = resIdx > 0 ? strat[resIdx - 1] : null;
      const juxtaposedAgainstSeal = throwAtRes >= res.gross && above && above.role === 'seal';
      const sealing = throwAtRes > 1 && (sgr >= P.sgrThreshold || juxtaposedAgainstSeal);
      return { index: f.index, name: f.def.name, type: f.def.type, throwAtReservoir: throwAtRes, distanceFromWell: dist, sgr,
        juxtaposition: throwAtRes < 1 ? '未切穿儲層（斷層尖端在儲層之下或以上）' : juxtaposedAgainstSeal ? '儲層完全與封閉層並置' : throwAtRes >= res.gross ? '儲層完全錯開' : '砂岩–砂岩部分並置',
        sealing, cutsReservoir: throwAtRes > 1 };
    });
  }

  // ---------- 斷層再活化（Coulomb，Andersonian 應力） ----------
  function faultReactivation(f, C, field, zMid, P) {
    const st = C.stress;
    const Sv = field.litho(zMid), SH = st.shmaxRatio * Sv, Sh = st.shminRatio * Sv, Pp = field.pore(zMid);
    const az = st.shmaxAzimuth * D2R;
    const nH = [Math.sin(az), Math.cos(az), 0], nh = [Math.cos(az), -Math.sin(az), 0], nv = [0, 0, 1];
    // σ = SH nH nHᵀ + Sh nh nhᵀ + Sv nv nvᵀ
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] = SH * nH[a] * nH[b] + Sh * nh[a] * nh[b] + Sv * nv[a] * nv[b];
    const th = f.def.strike * D2R, dip = f.def.dip * D2R;
    const n = [Math.cos(th) * Math.sin(dip), -Math.sin(th) * Math.sin(dip), Math.cos(dip)];
    const t = [0, 1, 2].map(a => S[a][0] * n[0] + S[a][1] * n[1] + S[a][2] * n[2]);
    const sn = t[0] * n[0] + t[1] * n[1] + t[2] * n[2];
    const ts = [t[0] - sn * n[0], t[1] - sn * n[1], t[2] - sn * n[2]];
    const tau = Math.hypot(ts[0], ts[1], ts[2]);
    const snEff = sn - Pp;
    const slipTendency = snEff > 0 ? tau / snEff : Infinity;
    const dPcrit = snEff - (tau - P.cohesion) / P.friction;   // 使斷層達 Coulomb 破壞所需孔壓增量
    return { Sv, SHmax: SH, Shmin: Sh, Pp, sigmaN: sn, tau, sigmaNEff: snEff, slipTendency, dPcrit };
  }

  // ---------- 主評估 ----------
  function evaluate(model, grid, params) {
    const site = model.site, strat = model.strat, C = params.conditions;
    const L = params.reservoir, F = params.formations[L];
    const wx = params.well.x, wy = params.well.y;
    const col = wellColumn(model, wx, wy);
    const res = { index: L, top: col.layers[L].top, base: col.layers[L].base };
    res.gross = res.base - res.top; res.net = res.gross * (F.ntg || 1); res.mid = 0.5 * (res.top + res.base);
    // 模型層面若為 NaN，後續溫壓／EOS 只會丟出難懂的錯誤，在此明確失敗
    if (![col.surface, res.top, res.base].every(Number.isFinite)) throw new Error(`模型層面深度為非數值（地表 ${col.surface}、${strat[L].name} 頂 ${res.top}／底 ${res.base}）；請檢查 structure／surface 參數或匯入的層面格網`);
    const field = makeField(model, C, col.surface);
    const warnings = [];

    // 封閉層
    let sealIdx = -1; for (let i = L - 1; i >= 0; i--) if (strat[i].role === 'seal') { sealIdx = i; break; }
    const seal = sealIdx >= 0 ? { index: sealIdx, thickness: col.layers[sealIdx].thickness, entryPressure: params.formations[sealIdx].entryPressure, direct: sealIdx === L - 1, name: strat[sealIdx].name } : null;
    if (!seal) warnings.push('儲層上方無指定為封閉層（seal）的地層');
    else if (!seal.direct) warnings.push('儲層直接上覆為非封閉層（' + strat[L - 1].name + '），封閉層為更上方的 ' + seal.name);
    let sealTotal = 0; for (let i = 0; i < L; i++) if (strat[i].role === 'seal') sealTotal += col.layers[i].thickness;

    // 溫壓與流體
    const T = field.temp(res.mid), TK = T + 273.15;
    const pHydro = field.hydro(res.mid), pInit = field.pore(res.mid);
    const depleted = site.type === 'depleted_gas';
    const pRes = depleted ? (C.depletion != null ? C.depletion : 1) * pInit : pInit;
    const pFracTop = field.frac(res.top), pMax = params.maxBhpFraction * pFracTop;
    const props = P();
    const rhoC = props.co2Density(pRes, TK), muC = props.co2Viscosity(rhoC, TK);
    const rhoCcap = props.co2Density(depleted ? pInit : pRes, TK);       // 容量計算用密度（枯竭氣田回充至原始壓力）
    const S = props.ppmToWeightFraction(C.salinity);
    const rhoW = props.brineDensity(T, pRes, S), muW = props.brineViscosity(T, S);
    const supercritical = TK > props.constants.Tc && pRes > props.constants.Pc;

    // 斷層封閉與閉合
    const faultSeal = faultSealAnalysis(model, col, res, L, params, wx, wy, T);
    const barrier = new Set(faultSeal.filter(f => f.sealing).map(f => f.index));
    grid.horizon = L;
    const closure = closureAnalysis(model, grid, wx, wy, barrier);
    // 儲層平均淨厚（模型範圍）
    let hsum = 0; for (let k = 0; k < grid.top.length; k++) hsum += Math.max(0, grid.base[k] - grid.top[k]);
    const hGrossAvg = hsum / grid.top.length, modelArea = model.grid.halfX * 2 * model.grid.halfY * 2;

    // 容量
    const phi = F.porosity, k = F.permeability * MD, ntg = F.ntg || 1;
    const capacity = {};
    if (depleted) {
      const A = closure.exists ? closure.area : modelArea * 0.2;
      if (!closure.exists) warnings.push('未偵測到構造閉合，枯竭氣田面積以模型面積 20% 估算');
      const Sg = C.gasSaturation != null ? C.gasSaturation : 0.65, Rf = C.recoveryFactor != null ? C.recoveryFactor : 0.7;
      capacity.type = 'depleted';
      capacity.area = A; capacity.poreVolume = A * res.net * phi;
      capacity.mass = rhoCcap * A * res.net * phi * Sg * Rf * (1 - params.waterInvasion) / 1e9;  // Mt
      capacity.detail = { Sg, Rf, Fiw: params.waterInvasion, rho: rhoCcap };
    } else {
      capacity.type = 'saline';
      capacity.regional = modelArea * hGrossAvg * ntg * phi * rhoC * params.efficiency / 1e9;
      capacity.closure = closure.exists ? closure.rockVolume * ntg * phi * (1 - params.swirr) * params.closureFill * rhoC / 1e9 : 0;
      capacity.mass = capacity.regional;
      capacity.detail = { E: params.efficiency, area: modelArea, hNetAvg: hGrossAvg * ntg, rho: rhoC };
    }
    const planned = params.injectionRate * params.years;

    // 注入性與壓力（穩態複合徑向流）
    const Qm = params.injectionRate * 1e9 / YEAR;              // kg/s
    const Qv = Qm / rhoC;                                       // m³/s（儲層條件）
    const phiEff = phi * (1 - params.swirr), H = Math.max(res.net, 1);
    const lambda = params.krco2 * muW / muC;                    // 流動度比 CO2/鹵水
    const ct = (params.rockCompressibility + params.brineCompressibility) / 1e6;  // 1/Pa
    const rw = params.wellRadius;
    const plumeRadius = tYr => { const V = Qv * Math.min(tYr, params.years) * YEAR; return Math.sqrt(Math.max(V, 0) / (Math.PI * phiEff * H)); };
    const rInf = tYr => Math.max(2 * plumeRadius(tYr) + 1, Math.sqrt(2.25 * k * Math.max(tYr, 1e-3) * YEAR / (phi * muW * ct)));
    const dpAt = (r, tYr) => { // MPa
      const Rc = Math.max(plumeRadius(tYr), rw * 1.01), Ri = rInf(tYr);
      if (r >= Ri) return 0;
      const brine = Qv * muW / (2 * Math.PI * k * H) * Math.log(Ri / Math.max(r, Rc));
      const co2 = r < Rc ? Qv * muC / (2 * Math.PI * k * params.krco2 * H) * Math.log(Rc / Math.max(r, rw)) : 0;
      return (brine + co2) / 1e6;
    };
    const dpWellEnd = dpAt(rw, params.years);
    const bhpEnd = pRes + dpWellEnd, margin = pMax - bhpEnd;
    const qMax = dpWellEnd > 0 ? params.injectionRate * Math.max(0, pMax - pRes) / dpWellEnd : Infinity;
    const injectivity = dpWellEnd > 0 ? params.injectionRate / dpWellEnd : Infinity;   // Mt/yr per MPa

    // 羽流（NCB 2005）於顯示時刻
    const tNow = Math.max(0, params.time);
    const Vnow = Qv * Math.min(tNow, params.years) * YEAR;
    const lam = Math.max(lambda, 1.0001);
    const rMax = Math.sqrt(lam * Vnow / (Math.PI * phiEff * H)), rMin = Math.sqrt(Vnow / (lam * Math.PI * phiEff * H));
    const plumeThickness = r => r <= rMin ? H : r >= rMax ? 0 : H * (rMax / r - 1) / (lam - 1);

    // 浮力運移（停注後）：沿頂面梯度爬升；封閉斷層為屏障
    const vBuoy = sinT => k * params.krco2 * (rhoW - rhoC) * g * sinT / (muC * phiEff);
    const migration = migrationPath(model, grid, wx, wy, vBuoy, params.years, params.years + params.postInjectionYears, barrier);
    const center = migration.positionAt(tNow);

    // 毛細封阻
    const hMaxCap = seal ? seal.entryPressure * 1e6 / ((rhoW - rhoC) * g) : 0;
    const column = Math.min(H, closure.exists ? Math.max(closure.height, 1) : H);

    // 斷層再活化
    const faults = faultSeal.map(fs => {
      const f = model.faults[fs.index];
      const re = faultReactivation(f, C, field, res.mid, params);
      const dpFault = dpAt(Math.max(fs.distanceFromWell, rw), params.years);
      return Object.assign(fs, re, { dpAtFault: dpFault, reactivationRisk: re.dPcrit <= 0 ? 'critical' : dpFault >= re.dPcrit ? 'high' : dpFault >= 0.5 * re.dPcrit ? 'moderate' : 'low' });
    });

    // 深度剖面
    const profiles = [];
    for (let i = 0; i <= 80; i++) {
      const z = col.surface + (model.grid.depthMax - col.surface) * i / 80;
      const Tz = field.temp(z) + 273.15, Pz = field.pore(z);
      profiles.push({ z, hydro: field.hydro(z), pore: Pz, litho: field.litho(z), frac: field.frac(z), pmax: params.maxBhpFraction * field.frac(z), temp: field.temp(z),
        rhoCO2: z > col.surface + 5 ? props.co2Density(Math.max(Pz, 0.1), Tz) : NaN });
    }
    // 時間序列
    const series = [], tEnd = params.years + params.postInjectionYears, A = Qv * muW / (4 * Math.PI * k * H) / 1e6;
    for (let i = 0; i <= 80; i++) {
      const t = tEnd * i / 80;
      const injecting = t <= params.years;
      const dp = injecting ? dpAt(rw, t) : A * Math.log(t / (t - params.years + 1e-6));   // Horner 關井回復
      const V = Qv * Math.min(t, params.years) * YEAR;
      series.push({ t, dpWell: Math.max(0, dp), bhp: pRes + Math.max(0, dp), rMax: Math.sqrt(lam * V / (Math.PI * phiEff * H)), mass: params.injectionRate * Math.min(t, params.years),
        drift: migration.distanceAt(t), rInf: injecting ? rInf(t) : NaN });
    }

    // 篩選檢核
    const checks = [];
    const add = (name, status, value, note) => checks.push({ name, status, value, note });
    add('儲層頂深度 ≥ 800 m（超臨界）', res.top >= 800 ? 'pass' : 'fail', res.top.toFixed(0) + ' m', supercritical ? 'CO2 於儲層為超臨界' : 'CO2 於儲層非超臨界（密度低）');
    if (closure.exists) add('構造高點儲層頂深度 ≥ 800 m（CO2 聚集處）', closure.crest.z >= 800 ? 'pass' : closure.crest.z >= 700 ? 'warn' : 'fail', closure.crest.z.toFixed(0) + ' m');
    add('儲層頂深度 ≤ 3,500 m（注入性／成本）', res.top <= 3500 ? 'pass' : res.top <= 4500 ? 'warn' : 'fail', res.top.toFixed(0) + ' m');
    add('滲透率 ≥ 10 mD', F.permeability >= 100 ? 'pass' : F.permeability >= 10 ? 'warn' : 'fail', F.permeability + ' mD');
    add('淨厚度 ≥ 20 m', res.net >= 50 ? 'pass' : res.net >= 20 ? 'warn' : 'fail', res.net.toFixed(0) + ' m');
    add('封閉層厚度 ≥ 50 m（建議 ≥ 100 m）', !seal ? 'fail' : seal.thickness >= 100 ? 'pass' : seal.thickness >= 50 ? 'warn' : 'fail', seal ? seal.thickness.toFixed(0) + ' m' : '無');
    add('毛細封阻 h_max ≥ CO2 柱高', !seal ? 'fail' : hMaxCap >= column ? 'pass' : hMaxCap >= 0.5 * column ? 'warn' : 'fail', hMaxCap.toFixed(0) + ' m vs ' + column.toFixed(0) + ' m');
    add('地層水鹽度 ≥ 10,000 ppm（非飲用水）', C.salinity >= 10000 ? 'pass' : 'fail', C.salinity + ' ppm');
    add('井底壓力 ≤ 允許上限', margin >= 0 ? 'pass' : margin >= -2 ? 'warn' : 'fail', bhpEnd.toFixed(1) + ' / ' + pMax.toFixed(1) + ' MPa');
    add('容量 ≥ 規劃注入總量', capacity.mass >= planned ? 'pass' : capacity.mass >= 0.5 * planned ? 'warn' : 'fail', capacity.mass.toFixed(1) + ' / ' + planned.toFixed(1) + ' Mt');
    const worstFault = faults.reduce((w, f) => (f.reactivationRisk === 'critical' || f.reactivationRisk === 'high') ? 'fail' : (f.reactivationRisk === 'moderate' && w !== 'fail') ? 'warn' : w, 'pass');
    add('斷層再活化（Coulomb）', faults.length ? worstFault : 'pass', faults.length ? faults.map(f => f.reactivationRisk).join(', ') : '模型內無斷層');
    if (site.flags && site.flags.length) add('場址風險旗標', 'warn', site.flags.join('、'));
    if (C.overpressure) add('超壓帶', res.mid > C.overpressure.startDepth ? 'warn' : 'pass', C.overpressure.gradient + ' MPa/km 自 ' + C.overpressure.startDepth + ' m');
    const score = Math.round(100 * checks.reduce((s, c) => s + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / checks.length);
    const failCount = checks.filter(c => c.status === 'fail').length;
    const rating = failCount === 0 && score >= 80 ? 'suitable' : failCount <= 1 && score >= 55 ? 'conditional' : 'unsuitable';

    return {
      site: site.id, reservoir: res, seal, sealTotal, column: col, field, surfaceDepth: col.surface,
      temperature: T, pHydro, pInit, pRes, pMax, pFracTop, rhoC, muC, rhoW, muW, supercritical, lambda,
      closure, capacity, planned, utilization: capacity.mass > 0 ? planned / capacity.mass : Infinity,
      injection: { Qv, dpWellEnd, bhpEnd, margin, qMax, injectivity, rInfEnd: rInf(params.years), plumeRadiusEnd: Math.sqrt(lam * Qv * params.years * YEAR / (Math.PI * phiEff * H)) },
      plume: { t: tNow, rMax, rMin, thickness: plumeThickness, H, center, volume: Vnow },
      migration, capillary: { hMax: hMaxCap, column }, faults, profiles, series, checks, score, rating, warnings, params
    };
  }

  /** 停注後浮力運移路徑：由井位沿儲層頂面最陡上傾方向前進，於構造高點、模型邊界或封閉斷層停止 */
  function migrationPath(model, grid, wx, wy, vBuoy, tStart, tEnd, barrier) {
    const { w, h, top, dx, dy, x0, y0 } = grid;
    const zAt = (x, y) => { // 雙線性
      const gx = Math.max(0, Math.min(w - 1.0001, (x - x0) / dx)), gy = Math.max(0, Math.min(h - 1.0001, (y - y0) / dy));
      const i = Math.floor(gx), j = Math.floor(gy), tx = gx - i, ty = gy - j;
      return (top[j * w + i] * (1 - tx) + top[j * w + i + 1] * tx) * (1 - ty) + (top[(j + 1) * w + i] * (1 - tx) + top[(j + 1) * w + i + 1] * tx) * ty;
    };
    const pts = [{ x: wx, y: wy, t: tStart, s: 0, z: zAt(wx, wy) }];
    let x = wx, y = wy, t = tStart, s = 0;
    const step = Math.min(dx, dy) * 0.5, eps = Math.min(dx, dy) * 0.25;
    const sidesOf = (px, py) => model.naturalSides(grid.horizon, px, py).map((v, k) => barrier.has(k) ? v : 0).join(',');
    let side0 = sidesOf(x, y);
    for (let it = 0; it < 2000 && t < tEnd; it++) {
      const gx = (zAt(x + eps, y) - zAt(x - eps, y)) / (2 * eps), gy = (zAt(x, y + eps) - zAt(x, y - eps)) / (2 * eps);
      const grad = Math.hypot(gx, gy);
      if (grad < 0.002) break;                          // 坡度 < 0.1°：視為抵達構造高點
      const sinT = grad / Math.sqrt(1 + grad * grad);
      const v = vBuoy(sinT); if (v <= 0) break;
      const nx = x - step * gx / grad, ny = y - step * gy / grad;
      if (nx < x0 || ny < y0 || nx > x0 + (w - 1) * dx || ny > y0 + (h - 1) * dy) break;
      if (sidesOf(nx, ny) !== side0) break;             // 封閉斷層阻擋
      const dt = step / v / YEAR;
      if (t + dt > tEnd) { const f = (tEnd - t) / dt; x += (nx - x) * f; y += (ny - y) * f; s += step * f; t = tEnd; pts.push({ x, y, t, s, z: zAt(x, y) }); break; }
      x = nx; y = ny; t += dt; s += step; pts.push({ x, y, t, s, z: zAt(x, y) });
    }
    const at = tt => {
      if (tt <= pts[0].t) return pts[0];
      for (let i = 1; i < pts.length; i++) if (pts[i].t >= tt) {
        const a = pts[i - 1], b = pts[i], f = (tt - a.t) / Math.max(b.t - a.t, 1e-9);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, s: a.s + (b.s - a.s) * f, z: a.z + (b.z - a.z) * f, t: tt };
      }
      return pts[pts.length - 1];
    };
    return { points: pts, totalDistance: s, arrivalTime: pts[pts.length - 1].t, positionAt: at, distanceAt: tt => at(tt).s };
  }

  /**
   * 屬性場容積：以儲層格網 × 5 個垂向取樣點套用 φ 下限與 V_sh 上限，累計 GRV／淨岩體積／淨孔隙體積／可用孔隙體積，
   * 並以區域效率係數 E 換算容量；closureMask 存在時另計閉合區內數值。
   */
  function volumetrics(model, grid, sampler, opts) {
    const { w, h, top, base, dx, dy } = grid, L = opts.reservoir, area = dx * dy, nz = 5;
    const acc = () => ({ grv: 0, net: 0, pore: 0, hc: 0, phiW: 0, phiSum: 0, logkSum: 0, cells: 0, netCells: 0 });
    const all = acc(), clo = acc();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, thick = base[k] - top[k]; if (thick < 0.5) continue;
      const x = grid.x0 + i * dx, y = grid.y0 + j * dy, inClo = opts.closureMask && opts.closureMask[k];
      for (const A of (inClo ? [all, clo] : [all])) { A.grv += area * thick; A.cells++; }
      for (let q = 0; q < nz; q++) {
        const p = sampler.propsAt(L, x, y, (q + 0.5) / nz), dh = thick / nz;
        if (p.phi < opts.phiCut || p.vsh > opts.vshCut) continue;
        for (const A of (inClo ? [all, clo] : [all])) {
          A.netCells++; A.net += area * dh * p.ntg; A.pore += area * dh * p.ntg * p.phi; A.hc += area * dh * p.ntg * p.phi * (1 - opts.swirr);
          A.phiSum += p.phi * area * dh; A.logkSum += Math.log10(Math.max(p.perm, 1e-7)) * area * dh; A.phiW += area * dh;
        }
      }
    }
    const fin = A => ({ grv: A.grv, net: A.net, pore: A.pore, hc: A.hc, cells: A.cells, netCells: A.netCells, passFrac: A.cells ? A.netCells / (A.cells * nz) : 0,
      meanPhi: A.phiW ? A.phiSum / A.phiW : 0, geoK: A.phiW ? Math.pow(10, A.logkSum / A.phiW) : 0, capacity: A.hc * opts.rhoCO2 * opts.efficiency / 1e9, capacityClosure: A.hc * opts.rhoCO2 * opts.closureFill / 1e9 });
    return { all: fin(all), closure: opts.closureMask ? fin(clo) : null, phiCut: opts.phiCut, vshCut: opts.vshCut };
  }

  return { evaluate, wellColumn, fillDefaults, volumetrics, DEFAULTS };
})();
