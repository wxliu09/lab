window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const { STRATA, HORIZONS, PETRO, CO2_DENSITY, RESERVOIR, FAULTS, VIEW, MODEL_OUTLINE } = C;

/**
 * 岩石物理與流體性質模組。
 *
 * 提供三類能力：
 *   1. 三維屬性場 —— 孔隙度、滲透率、淨毛比、泥質含量、自然伽瑪、飽和度、
 *      體積密度與縱波速度。屬性場為「確定性」的，同一座標永遠得到同一組值，
 *      因此 3D 著色、合成測井與任意剖面三者必然一致。
 *   2. 地層溫壓與 CO₂ 流體性質 —— 依深度計算溫度、靜水壓力、上覆岩壓、
 *      破裂壓力與最大容許注入壓力；CO₂ 密度以 Span–Wagner 取樣表雙線性內插。
 *   3. 封存評估 —— 容積計算（GRV／淨孔隙體積／儲存容量）、構造閉合與溢出點、
 *      蓋層可滯留柱高、斷層泥質塗抹比（SGR）、捕獲機制隨時間之分配。
 *
 * 所有深度以公尺計，高程向下為負；深度 = −高程。
 */

const HS = PETRO.heteroScale;

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* ------------------------------------------------------------------ *
 * 確定性非均質場
 * ------------------------------------------------------------------ */

/**
 * 三階疊加的平滑確定性雜訊，值域約 −1 ~ +1。
 * 不使用亂數，確保重複開啟或不同版本之間得到完全相同的屬性場。
 */
function fbm(x, z, scale, seed) {
  let v = 0, amp = 1, f = 1 / scale, sum = 0;
  for (let o = 0; o < 3; o++) {
    v += amp * Math.sin(x * f * 1.13 + seed * 3.71 + o * 2.14) *
               Math.cos(z * f * 0.97 - seed * 1.93 + o * 1.31);
    sum += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return v / sum;
}

/**
 * 單一取樣點的岩石物理屬性。
 * @param {number} i     地層索引
 * @param {number} x     東向座標 (m)
 * @param {number} z     世界 Z（= 南向為正）(m)
 * @param {number} zRel  層內相對深度，0 = 層頂，1 = 層底
 * @param {number} sg    該點 CO₂ 飽和度（0~1），由呼叫端提供
 */
function propsAt(i, x, z, zRel, sg) {
  const s = STRATA[i];
  const p = s.petro;
  sg = sg || 0;

  // 垂向粒序趨勢：fining 向上變細（底部品質較佳），coarsening 反之
  let trend = 0;
  if (p.trend === 'fining') trend = (zRel - 0.5) * 2;
  else if (p.trend === 'coarsening') trend = (0.5 - zRel) * 2;

  // 側向相變（大尺度朵葉／小尺度砂體）＋ 層內紋理（單層／韻律）
  const lateral = fbm(x, z, HS.major, i + 1) * 0.62 + fbm(x, z, HS.minor, i + 5) * 0.38;
  const lamina = Math.sin(zRel * Math.PI * 5.5 + fbm(x, z, HS.fine, i + 9) * 3.0);
  const g = lateral * 0.85 + lamina * 0.35 + trend * 0.45;

  const phi = clamp(p.phi + p.phiSd * g * 1.25, 0.004, 0.42);
  // φ–k 轉換：以標準化的 φ 偏差驅動 log k，另加小幅獨立散布
  const zPhi = p.phiSd > 0 ? (phi - p.phi) / p.phiSd : 0;
  const logk = Math.log10(p.k) + p.kSd * (zPhi + 0.30 * fbm(x, z, HS.minor * 0.6, i + 13));
  const perm = Math.pow(10, logk);

  const vsh = clamp(p.vsh * (1 - 0.55 * g), 0, 1);
  const ntg = clamp(p.ntg + 0.20 * g, 0, 1);
  const gr = p.grClean + (p.grShale - p.grClean) * vsh;

  const swMin = p.swi;
  const sgMax = 1 - swMin;
  const sgEff = clamp(sg, 0, sgMax);
  const sw = 1 - sgEff;

  const depth = null; // 由呼叫端另行計算，density 用近似孔隙流體密度
  const rhoFluid = (PETRO.brineDensity * sw + 700 * sgEff) / 1000; // g/cm³
  const rhob = p.rhoMa * (1 - phi) + rhoFluid * phi;

  // Raymer–Hunt–Gardner：CO₂ 取代地層水會顯著降低縱波速度（4D 震測可偵測性）
  const vFluid = 1500 * sw + 450 * sgEff;
  const vp = Math.pow(1 - phi, 2) * p.vp + phi * vFluid;

  return { phi, perm, ntg, vsh, gr, sw, sg: sgEff, rhob, vp, ai: rhob * vp, depthPlaceholder: depth };
}

/* ------------------------------------------------------------------ *
 * 地層溫壓與流體
 * ------------------------------------------------------------------ */

/** 地層溫度 (°C)，depth 為正值深度 (m) */
function tempAt(depth) {
  return PETRO.surfaceTemp + PETRO.thermalGradient * depth / 1000;
}
/** 靜水（地層）壓力 (MPa) */
function pressureAt(depth) {
  return PETRO.hydrostaticGradient * depth / 1000;
}
/** 上覆岩壓 Sv (MPa) */
function lithostaticAt(depth) {
  return PETRO.lithostaticGradient * depth / 1000;
}
/** 破裂壓力 (MPa)：Pp + ratio × (Sv − Pp) */
function fracPressureAt(depth) {
  const pp = pressureAt(depth);
  return pp + PETRO.fracGradientRatio * (lithostaticAt(depth) - pp);
}
/** 最大容許注入壓力 (MPa) */
function maxInjectionPressureAt(depth) {
  return fracPressureAt(depth) * PETRO.safetyFactor;
}

/** CO₂ 密度 (kg/m³)：Span–Wagner 取樣表雙線性內插，超出表格範圍則夾至邊界 */
function co2Density(pressMPa, tempC) {
  const T = CO2_DENSITY.temps, P = CO2_DENSITY.press, R = CO2_DENSITY.rho;
  const ti = bracket(T, tempC), pi = bracket(P, pressMPa);
  const ft = (clamp(tempC, T[0], T[T.length - 1]) - T[ti]) / (T[ti + 1] - T[ti]);
  const fp = (clamp(pressMPa, P[0], P[P.length - 1]) - P[pi]) / (P[pi + 1] - P[pi]);
  const r00 = R[ti][pi], r01 = R[ti][pi + 1], r10 = R[ti + 1][pi], r11 = R[ti + 1][pi + 1];
  return (r00 * (1 - fp) + r01 * fp) * (1 - ft) + (r10 * (1 - fp) + r11 * fp) * ft;
}
function bracket(arr, v) {
  for (let i = arr.length - 2; i >= 0; i--) if (v >= arr[i]) return i;
  return 0;
}

/** CO₂ 動黏度近似 (mPa·s)，由密度線性估計；適用超臨界區間 */
function co2Viscosity(rho) {
  return 0.020 + 5.5e-5 * rho;
}

/** 綜合回傳某深度的原地條件 */
function insituAt(depth) {
  const t = tempAt(depth);
  const p = pressureAt(depth);
  const rho = co2Density(p, t);
  return {
    depth, temp: t, pressure: p,
    lithostatic: lithostaticAt(depth),
    fracPressure: fracPressureAt(depth),
    maxInjection: maxInjectionPressureAt(depth),
    co2Density: rho,
    co2Viscosity: co2Viscosity(rho),
    brineDensity: PETRO.brineDensity,
    // 超臨界判定：Tc = 31.0 °C、Pc = 7.38 MPa
    phase: (t > 31.0 && p > 7.38) ? '超臨界' : (p > 7.38 ? '液態' : '氣態')
  };
}

/* ------------------------------------------------------------------ *
 * 蓋層與斷層封閉性
 * ------------------------------------------------------------------ */

/**
 * 蓋層可滯留的 CO₂ 柱高 (m)：h = Pc / (Δρ · g)
 * Pc 為毛細突破壓力，Δρ 為地層水與 CO₂ 的密度差。
 */
function sealColumnHeight(stratum, depth) {
  const pc = stratum.petro && stratum.petro.pc;
  if (!pc) return null;
  const rhoC = co2Density(pressureAt(depth), tempAt(depth));
  const dRho = PETRO.brineDensity - rhoC;
  if (dRho <= 0) return null;
  return (pc * 1e6) / (dRho * 9.81);
}

/**
 * 斷層泥質塗抹比 SGR = Σ(Vsh · Δz) / 斷距。
 * 取斷層在其位移範圍內所切過之層段的泥質含量加權平均。
 * 一般以 SGR > 0.20 視為具側向封閉能力。
 */
function faultSGR(fault) {
  const top = fault.topElev, bot = fault.botElev;
  let sum = 0, span = 0;
  for (let i = 0; i < STRATA.length; i++) {
    const zTop = HORIZONS[i].elev, zBot = HORIZONS[i + 1].elev;
    const a = Math.min(top, zTop), b = Math.max(bot, zBot);
    const dz = a - b;
    if (dz <= 0) continue;
    sum += STRATA[i].petro.vsh * dz;
    span += dz;
  }
  if (!span || !fault.throw) return null;
  const meanVsh = sum / span;
  // 斷距範圍內所滑過的層段以平均 Vsh 代表
  return { sgr: meanVsh, meanVsh, span, sealing: meanVsh > 0.20 };
}

/* ------------------------------------------------------------------ *
 * 容積計算與構造閉合
 * ------------------------------------------------------------------ */

/** 視為「該層存在」的最小厚度（m）；低於此值即認定已尖滅 */
const MIN_NET_THICKNESS = 0.5;

/** 塊體邊界半徑（與 geology.js 同式，供本模組獨立取樣使用） */
function modelRadius(theta) {
  let f = 1;
  for (const [amp, wave, phase] of MODEL_OUTLINE.harmonics) f += amp * Math.cos(wave * theta + phase);
  return MODEL_OUTLINE.radius * Math.max(0.25, f);
}

/**
 * 在極座標網格上取樣儲層，計算容積與儲存容量。
 *
 * 儲存容量採 DOE／CSLF 之鹽水層公式：
 *   M_CO₂ = A · h · φ · (1 − Swi) · ρ_CO₂ · E
 * 其中 A·h·φ 即淨孔隙體積，E 為儲存效率因子。
 *
 * @param {object} opt
 *   opt.index    儲層索引（預設為主儲層）
 *   opt.phiCut   孔隙度下限（小數）
 *   opt.vshCut   泥質含量上限
 *   opt.closure  true = 僅計入構造閉合區（頂面高於溢出點）
 */
function volumetrics(opt) {
  opt = opt || {};
  const index = opt.index != null ? opt.index : RESERVOIR.strataIndex;
  const phiCut = opt.phiCut != null ? opt.phiCut : 0.10;
  const vshCut = opt.vshCut != null ? opt.vshCut : 0.40;
  const stackTop = C.stackTop, thicknessAt = C.thicknessAt;
  if (!stackTop || !thicknessAt) return null;

  const nR = VIEW.rings, nS = VIEW.sectors;
  const dTheta = Math.PI * 2 / nS;
  const closure = opt.closure ? closureAnalysis(index) : null;

  let grv = 0, netVol = 0, poreVol = 0, hcPore = 0;
  let phiSum = 0, phiW = 0, permLogSum = 0, permW = 0, ntgSum = 0;
  let topSum = 0, topW = 0, thickMax = 0;
  let cells = 0, netCells = 0;

  for (let j = 0; j < nS; j++) {
    const th = (j + 0.5) * dTheta;
    const R = modelRadius(th);
    for (let i = 1; i <= nR; i++) {
      const t0 = (i - 1) / nR, t1 = i / nR;
      const tm = (t0 + t1) / 2;
      const r = R * tm;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const h = thicknessAt(index, x, z);
      if (h < MIN_NET_THICKNESS) continue;
      const area = 0.5 * R * R * (t1 * t1 - t0 * t0) * dTheta;
      const top = stackTop(index, x, z);
      if (closure && top < closure.spillElev) continue;

      cells++;
      grv += area * h;
      topSum += top * area; topW += area;
      if (h > thickMax) thickMax = h;

      // 層內以 5 個垂向取樣點做 cutoff 判定，逐點累加淨孔隙體積
      const nz = 5;
      for (let k = 0; k < nz; k++) {
        const zRel = (k + 0.5) / nz;
        const pr = propsAt(index, x, z, zRel, 0);
        const dh = h / nz;
        if (pr.phi < phiCut || pr.vsh > vshCut) continue;
        netCells++;
        netVol += area * dh * pr.ntg;
        poreVol += area * dh * pr.ntg * pr.phi;
        hcPore += area * dh * pr.ntg * pr.phi * (1 - STRATA[index].petro.swi);
        phiSum += pr.phi * area * dh; phiW += area * dh;
        permLogSum += Math.log10(pr.perm) * area * dh; permW += area * dh;
        ntgSum += pr.ntg * area * dh;
      }
    }
  }

  const meanTop = topW ? topSum / topW : 0;
  const depth = Math.abs(meanTop) + thickMax / 2;
  const insitu = insituAt(depth);
  const capacityMt = hcPore * insitu.co2Density * PETRO.storageEfficiency / 1e9; // m³·kg/m³ → kg → Mt

  return {
    index, phiCut, vshCut, closureUsed: !!closure, closure,
    grv, netVol, poreVol, hcPore,
    meanPhi: phiW ? phiSum / phiW : 0,
    meanPerm: permW ? Math.pow(10, permLogSum / permW) : 0,
    meanNtg: phiW ? ntgSum / phiW : 0,
    netToGrossVol: grv ? netVol / grv : 0,
    meanTopElev: meanTop, maxThickness: thickMax,
    cells, netCells,
    insitu, capacityMt,
    efficiency: PETRO.storageEfficiency,
    swi: STRATA[index].petro.swi,
    /** 以設計注入速率換算之可注入年限 */
    yearsAtDesignRate: capacityMt / PETRO.co2Rate
  };
}

/**
 * 構造閉合分析：自頂點（crest）向下逐層淹沒，找出仍不接觸模型邊界的最低等高線，
 * 該高程即溢出點（spill point），其上為構造閉合區。
 * 以極座標網格做四鄰域連通標記，環向為週期性連通。
 * 目標層尖滅（厚度不足）之處視為地層邊界：CO₂ 無法通過，但也不算溢出。
 */
function closureAnalysis(index) {
  const stackTop = C.stackTop, thicknessAt = C.thicknessAt;
  if (!stackTop || !thicknessAt) return null;
  const nR = VIEW.rings, nS = VIEW.sectors;
  const n = nR * nS;
  const elev = new Float64Array(n);
  const live = new Uint8Array(n);
  let crest = -Infinity, crestIdx = -1;

  for (let j = 0; j < nS; j++) {
    const th = (j + 0.5) * (Math.PI * 2 / nS);
    const R = modelRadius(th);
    for (let i = 0; i < nR; i++) {
      const r = R * (i + 0.5) / nR;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const k = i * nS + j;
      if (thicknessAt(index, x, z) < MIN_NET_THICKNESS) { elev[k] = -Infinity; continue; }
      live[k] = 1;
      const e = stackTop(index, x, z);
      elev[k] = e;
      if (e > crest) { crest = e; crestIdx = k; }
    }
  }
  if (crestIdx < 0) return null;

  const visited = new Int32Array(n);
  let stamp = 0;

  /** 自 crest 泛洪出高於 level 的連通區；touchesEdge 表示已與模型邊界相通（溢出） */
  function flood(level) {
    stamp++;
    if (elev[crestIdx] < level) return { count: 0, lowest: crest, touchesEdge: false };
    const stack = [crestIdx];
    visited[crestIdx] = stamp;
    let count = 0, lowest = elev[crestIdx], touchesEdge = false;
    while (stack.length) {
      const cur = stack.pop();
      count++;
      if (elev[cur] < lowest) lowest = elev[cur];
      const i = (cur / nS) | 0, j = cur % nS;
      if (i === nR - 1) touchesEdge = true;
      const nb = [
        i > 0 ? (i - 1) * nS + j : -1,
        i < nR - 1 ? (i + 1) * nS + j : -1,
        i * nS + ((j + 1) % nS),
        i * nS + ((j - 1 + nS) % nS)
      ];
      for (const m of nb) {
        if (m < 0 || visited[m] === stamp || !live[m]) continue;
        if (elev[m] < level) continue;
        visited[m] = stamp;
        stack.push(m);
      }
    }
    return { count, lowest, touchesEdge };
  }

  // 自 crest 往下二分搜尋最低的「尚未溢出」等高線
  const full = flood(-Infinity);
  if (!full.touchesEdge) {
    // 目標層在模型範圍內即已尖滅圈閉，整段皆為封閉的地層圈閉
    return {
      crestElev: crest, spillElev: full.lowest, reliefM: crest - full.lowest,
      bounded: true, closedByPinchout: true
    };
  }
  let lo = full.lowest, hi = crest;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (flood(mid).touchesEdge) lo = mid; else hi = mid;
  }
  return { crestElev: crest, spillElev: hi, reliefM: crest - hi, bounded: true, closedByPinchout: false };
}

/* ------------------------------------------------------------------ *
 * 捕獲機制分配
 * ------------------------------------------------------------------ */

/**
 * 四種捕獲機制隨時間的比例（IPCC 2005 之定性趨勢，數值為示意）。
 * @param {number} yearsSinceStart 自注入開始的年數
 */
function trappingMix(yearsSinceStart) {
  const t = Math.max(0, yearsSinceStart);
  const dissolution = Math.min(0.22, 0.02 + 0.0062 * t);
  const residual = Math.min(0.35, 0.05 + 0.0110 * t);
  const mineral = Math.min(0.02, 0.0004 * t);
  const structural = Math.max(0, 1 - dissolution - residual - mineral);
  return { structural, residual, dissolution, mineral };
}

/* ------------------------------------------------------------------ *
 * 屬性色階
 * ------------------------------------------------------------------ */

/** 由控制點做線性內插的色階；輸入 0~1，輸出 [r,g,b] 0~1 */
function ramp(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t <= b[0] || i === stops.length - 2) {
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      const u = clamp(f, 0, 1);
      return [
        a[1][0] + (b[1][0] - a[1][0]) * u,
        a[1][1] + (b[1][1] - a[1][1]) * u,
        a[1][2] + (b[1][2] - a[1][2]) * u
      ];
    }
  }
  return stops[stops.length - 1][1];
}

const RAMPS = {
  // 由低到高：深藍 → 青 → 黃 → 橙紅（類 viridis／spectral，對色覺缺陷相對友善）
  spectral: [
    [0.00, [0.19, 0.21, 0.42]],
    [0.25, [0.16, 0.47, 0.60]],
    [0.50, [0.31, 0.71, 0.53]],
    [0.75, [0.86, 0.80, 0.36]],
    [1.00, [0.87, 0.35, 0.24]]
  ],
  // 泥質含量：砂（黃）→ 泥（灰藍）
  shaliness: [
    [0.00, [0.90, 0.76, 0.42]],
    [0.45, [0.66, 0.62, 0.48]],
    [1.00, [0.28, 0.34, 0.40]]
  ],
  // 飽和度：儲層底色 → 紅
  saturation: [
    [0.00, [0.62, 0.58, 0.50]],
    [0.15, [0.85, 0.62, 0.28]],
    [0.55, [0.92, 0.36, 0.18]],
    [1.00, [0.78, 0.10, 0.24]]
  ]
};

/**
 * 著色模式定義。
 *   key/label/unit
 *   min/max  色階值域（log = true 時為 log10 值域）
 *   pick(p)  由屬性物件取值
 */
const COLOR_MODES = [
  { key: 'lithology', label: '岩性', unit: '', legend: 'lithology' },
  { key: 'phi', label: '有效孔隙度', unit: '%', min: 0, max: 35, ramp: 'spectral',
    pick: (p) => p.phi * 100, fmt: (v) => v.toFixed(1) },
  { key: 'perm', label: '滲透率', unit: 'mD', min: -4, max: 3.2, ramp: 'spectral', log: true,
    pick: (p) => Math.log10(Math.max(1e-6, p.perm)),
    fmt: (v) => { const k = Math.pow(10, v); return k >= 10 ? k.toFixed(0) : k >= 0.1 ? k.toFixed(2) : k.toExponential(1); } },
  { key: 'ntg', label: '淨毛比 NTG', unit: '', min: 0, max: 1, ramp: 'spectral',
    pick: (p) => p.ntg, fmt: (v) => v.toFixed(2) },
  { key: 'vsh', label: '泥質含量 Vsh', unit: '', min: 0, max: 1, ramp: 'shaliness',
    pick: (p) => p.vsh, fmt: (v) => v.toFixed(2) },
  { key: 'sg', label: 'CO₂ 飽和度', unit: '', min: 0, max: 0.7, ramp: 'saturation',
    pick: (p) => p.sg, fmt: (v) => v.toFixed(2) },
  { key: 'vp', label: '縱波速度 Vp', unit: 'm/s', min: 1500, max: 4600, ramp: 'spectral',
    pick: (p) => p.vp, fmt: (v) => v.toFixed(0) },
  { key: 'ai', label: '聲阻抗 AI', unit: '10³ (g/cm³)(m/s)', min: 3000, max: 12500, ramp: 'spectral',
    pick: (p) => p.ai, fmt: (v) => (v / 1000).toFixed(1) }
];

const MODE_MAP = {};
COLOR_MODES.forEach((m) => { MODE_MAP[m.key] = m; });

/** 取得某模式下的顏色（回傳 [r,g,b]，0~1） */
function colorFor(modeKey, props) {
  const m = MODE_MAP[modeKey];
  if (!m || !m.pick) return null;
  const v = m.pick(props);
  const t = (v - m.min) / (m.max - m.min);
  return ramp(RAMPS[m.ramp], t);
}

/** 產生色階條的取樣（供 UI 繪製 colorbar） */
function rampSamples(modeKey, n) {
  const m = MODE_MAP[modeKey];
  if (!m || !m.ramp) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const c = ramp(RAMPS[m.ramp], t);
    out.push('rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')');
  }
  return out;
}

/** 色階刻度標籤 */
function rampTicks(modeKey, n) {
  const m = MODE_MAP[modeKey];
  if (!m || !m.pick) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(m.fmt(m.min + (m.max - m.min) * t));
  }
  return out;
}

C.petro = {
  propsAt, fbm, clamp,
  tempAt, pressureAt, lithostaticAt, fracPressureAt, maxInjectionPressureAt,
  co2Density, co2Viscosity, insituAt,
  sealColumnHeight, faultSGR,
  volumetrics, closureAnalysis, trappingMix,
  COLOR_MODES, MODE_MAP, colorFor, rampSamples, rampTicks, ramp, RAMPS
};
})();
