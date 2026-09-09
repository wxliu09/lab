/*
 * co2props.js — CO2 與地層水物性
 * - CO2 密度：Duan, Møller & Weare (1992) 狀態方程式（0–1000 °C、0–800 MPa；對 NIST 參考值誤差多在 1% 內，近臨界點約 2–3%）
 * - CO2 黏度：Fenghour, Wakeham & Vesovic (1998)（零密度項 + 剩餘項，略去臨界增強項）
 * - 地層水密度 / 黏度：Batzle & Wang (1992)
 * 單位：壓力 MPa、溫度 K 或 °C（函式註明）、密度 kg/m³、黏度 Pa·s
 */
window.CCSProps = (function () {
  'use strict';
  const R = 8.314462618;              // J/(mol·K)
  const M_CO2 = 44.0095e-3;           // kg/mol
  // Duan et al. (1992) CO2 參數（該文採用 Tc = 304.20 K、Pc = 73.825 bar、Vc ≡ R·Tc/Pc）
  const Tc = 304.20, Pc = 73.825e5, Vc = R * Tc / Pc;
  const a = [8.99288497e-2, -4.94783127e-1, 4.77922245e-2, 1.03808883e-2, -2.82516861e-2, 9.49887563e-2,
    5.20600880e-4, -2.93540971e-4, -1.77265112e-3, -2.51101973e-5, 8.93353441e-5, 7.88998563e-5,
    -1.66727022e-2, 1.398, 2.96e-2];

  function coeffs(Tr) {
    const T2 = Tr * Tr, T3 = T2 * Tr;
    return { B: a[0] + a[1] / T2 + a[2] / T3, C: a[3] + a[4] / T2 + a[5] / T3, D: a[6] + a[7] / T2 + a[8] / T3,
      E: a[9] + a[10] / T2 + a[11] / T3, F: a[12] / T3 };
  }
  function Zof(Vr, c) {
    const V2 = Vr * Vr, V4 = V2 * V2;
    return 1 + c.B / Vr + c.C / V2 + c.D / V4 + c.E / (V4 * Vr) + c.F / V2 * (a[13] + a[14] / V2) * Math.exp(-a[14] / V2);
  }
  function lnPhi(Vr, c) { // 逸度係數（Duan et al. 1992 式），用於三根時選穩定相
    const V2 = Vr * Vr, V4 = V2 * V2, Z = Zof(Vr, c);
    return Z - 1 - Math.log(Z) + c.B / Vr + c.C / (2 * V2) + c.D / (4 * V4) + c.E / (5 * V4 * Vr)
      + c.F / (2 * a[14]) * (a[13] + 1 - (a[13] + 1 + a[14] / V2) * Math.exp(-a[14] / V2));
  }

  /** CO2 密度 (kg/m³)，P: MPa，T: K */
  function co2Density(P_MPa, T_K) {
    const Tr = T_K / Tc, Pr = P_MPa * 1e6 / Pc, c = coeffs(Tr);
    const f = v => Pr * v / Tr - Zof(v, c);
    // 對數等距掃描找根區間，再以二分法收斂；多根時取逸度最低者（穩定相）
    const roots = [];
    let vPrev = 0.02, fPrev = f(vPrev);
    for (let lv = Math.log(0.02) + 0.04; lv <= Math.log(4000); lv += 0.04) {
      const v = Math.exp(lv), fv = f(v);
      if (fPrev * fv < 0) {
        let lo = vPrev, hi = v, flo = fPrev;
        for (let k = 0; k < 50; k++) { const m = 0.5 * (lo + hi), fm = f(m); if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } }
        roots.push(0.5 * (lo + hi));
      }
      vPrev = v; fPrev = fv;
    }
    if (!roots.length) throw new Error('CO2 EOS: no root for P=' + P_MPa + ' MPa, T=' + T_K + ' K');
    let best = roots[0];
    if (roots.length > 1) best = roots.reduce((p, q) => lnPhi(q, c) < lnPhi(p, c) ? q : p);
    return M_CO2 / (best * Vc);
  }

  /** CO2 黏度 (Pa·s)，rho: kg/m³，T: K — Fenghour et al. (1998) */
  function co2Viscosity(rho, T_K) {
    const Ts = T_K / 251.196, lnTs = Math.log(Ts);
    const aa = [0.235156, -0.491266, 5.211155e-2, 5.347906e-2, -1.537102e-2];
    let lnG = 0; for (let i = 0; i < 5; i++) lnG += aa[i] * Math.pow(lnTs, i);
    const eta0 = 1.00697 * Math.sqrt(T_K) / Math.exp(lnG);
    const r2 = rho * rho, r6 = r2 * r2 * r2, r8 = r6 * r2;
    const ex = 0.4071119e-2 * rho + 0.7198037e-4 * r2 + 0.2411697e-16 * r6 / (Ts * Ts * Ts)
      + 0.2971072e-22 * r8 - 0.1627888e-22 * r8 / Ts;
    return (eta0 + ex) * 1e-6;
  }

  /** 地層水密度 (kg/m³)，T: °C，P: MPa，S: NaCl 重量分率 — Batzle & Wang (1992) */
  function brineDensity(T_C, P_MPa, S) {
    const T = T_C, P = P_MPa;
    const rw = 1 + 1e-6 * (-80 * T - 3.3 * T * T + 0.00175 * T * T * T + 489 * P - 2 * T * P
      + 0.016 * T * T * P - 1.3e-5 * T * T * T * P - 0.333 * P * P - 0.002 * T * P * P);
    const rb = rw + S * (0.668 + 0.44 * S + 1e-6 * (300 * P - 2400 * P * S
      + T * (80 + 3 * T - 3300 * S - 13 * P + 47 * P * S)));
    return rb * 1000;
  }

  /** 地層水黏度 (Pa·s)，T: °C，S: NaCl 重量分率 — Batzle & Wang (1992) */
  function brineViscosity(T_C, S) {
    const T = T_C;
    const cP = 0.1 + 0.333 * S + (1.65 + 91.9 * S * S * S)
      * Math.exp(-(0.42 * Math.pow(Math.pow(S, 0.8) - 0.17, 2) + 0.045) * Math.pow(T, 0.8));
    return cP * 1e-3;
  }

  /** ppm (mg/kg) → 重量分率 */
  function ppmToWeightFraction(ppm) { return ppm / 1e6; }

  return { co2Density, co2Viscosity, brineDensity, brineViscosity, ppmToWeightFraction, constants: { Tc, Pc: Pc / 1e6, M_CO2 } };
})();
