/*
 * geomodel.js — 3D 地質構造建模器（不依賴 three.js，輸出 typed array 網格）
 *
 * 座標：x 東、y 北（公尺，場址中心為原點）、z 為海平面下深度（正值向下；地面高程為負值）
 *
 * 建模流程（運動學疊加）：
 *   1. 參考地層柱（各層 top 深度）+ 側向厚度變化（楔形/線性/褶皺頂部薄化）
 *   2. 區域傾斜、褶皺（cosine / gaussian 脊）、穹隆（泥貫入、基盤高區；含邊緣向斜）
 *   3. 斷層：正/逆斷層，平面或鏟狀；斷距隨深度（尖端漸滅）與走向（橢圓）變化；上盤可加滾覆
 *   4. 基盤截切（超覆）、地表/海床截切（露頭）
 * 網格：每個斷塊 × 每一地層以「純量場裁切」切割規則格網（斷層面、模型邊界與剖切面皆為 g(x,y)≤0 的場），
 *       上、下層面以邊界折線「拉鍊」縫合成側壁，形成封閉實體。
 *
 * 若場址提供 horizons（實測層面格網），則直接內插層面深度，略過運動學建模（斷層僅供顯示）。
 */
window.CCSGeoModel = (function () {
  'use strict';
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function depthProfileFactor(profile, zRef) {
    if (!profile || profile.type === 'constant') return 1;
    const t = clamp((zRef - profile.z0) / (profile.z1 - profile.z0), 0, 1);
    if (profile.type === 'growDown') return t;          // 由 z0 的 0 增至 z1 的 1（深處振幅大）
    if (profile.type === 'growUp') return 1 - t;        // 淺處振幅大
    if (profile.type === 'window') {                    // z0→z1 漸增至 1，z2→z3 漸減至 0
      if (zRef <= profile.z1) return t;
      if (zRef <= profile.z2) return 1;
      return clamp(1 - (zRef - profile.z2) / (profile.z3 - profile.z2), 0, 1);
    }
    return 1;
  }
  function alongTaperFactor(taper, u) {
    if (!taper) return 1;
    const s = (u - taper.center) / taper.halfLength;
    return clamp(1 - s * s, 0, 1);
  }
  function ridgeShape(shape, d, halfWidth) {
    const s = Math.abs(d) / halfWidth;
    if (shape === 'gaussian') return Math.exp(-s * s);
    return s >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * s)); // cosine（預設）
  }

  /** 斷層幾何：走向/傾角、平面或鏟狀（傾角隨深度線性減至 minDip），提供 v_f(z) 與側向判定 */
  function makeFault(def, index, depthMax) {
    const th = def.strike * D2R;
    const ux = Math.sin(th), uy = Math.cos(th);      // 走向單位向量
    const vx = Math.cos(th), vy = -Math.sin(th);     // 傾向（走向順時針 90°）
    const px = def.through ? def.through[0] : 0, py = def.through ? def.through[1] : 0;
    const zRef = def.zRef || 0;
    const u0 = px * ux + py * uy, v0 = px * vx + py * vy;
    // v(z) 查表（每 5 m，自 z=0 起累積水平位移）
    const step = 5, n = Math.ceil((depthMax + 2000) / step) + 1;
    const table = new Float64Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const zm = (i - 0.5) * step;
      let dip = def.dip;
      if (def.listric) {
        const t = clamp((zm - zRef) / (def.listric.detachDepth - zRef), 0, 1);
        dip = def.dip - (def.dip - def.listric.minDip) * t;
      }
      acc += step / Math.tan(dip * D2R);
      table[i] = acc;
    }
    function interp(z) {
      const zz = clamp(z, 0, (n - 1) * step), i = Math.floor(zz / step), t = zz / step - i;
      return i >= n - 1 ? table[n - 1] : table[i] * (1 - t) + table[i + 1] * t;
    }
    const offRef = interp(zRef);
    const sign = (def.type === 'reverse' || def.type === 'thrust') ? -1 : 1;  // 上盤位移方向（正斷層向下）
    const tip = def.tipDepth || 0, full = def.fullThrowDepth != null ? def.fullThrowDepth : tip + 500;
    return {
      def, index, ux, uy, vx, vy, u0, v0, sign,
      u(x, y) { return x * ux + y * uy; },
      v(x, y) { return x * vx + y * vy; },
      /** 斷層面在深度 z 的傾向座標 */
      vf(z) { return v0 + interp(z) - offRef; },
      /** 斷距（垂直分離量）隨深度與走向變化 */
      throwAt(u, z) {
        if (z <= tip) return 0;
        const fz = full > tip ? clamp((z - tip) / (full - tip), 0, 1) : 1;
        const s = def.throwProfile === 'linear' ? fz : fz * fz * (3 - 2 * fz); // 線性（生長斷層）或 smoothstep
        return def.throw * s * alongTaperFactor(def.alongTaper, u);
      },
      /** 上盤變形分布：rollover 時斷距隨離斷層距離衰減 */
      hwProfile(dist) {
        if (!def.rollover) return 1;
        return Math.exp(-Math.max(0, dist) / def.rollover.lambda);
      },
      /** 斷層面上 (u, z) 對應的 (x, y) */
      point(u, z) { const vv = this.vf(z); return [u * ux + vv * vx, u * uy + vv * vy]; }
    };
  }

  function buildModel(site, coast) {
    const S = site;
    const [Lx, Ly] = S.model.extent, nx = S.model.grid[0], ny = S.model.grid[1];
    const depthMax = S.model.depthMax;
    const halfX = Lx / 2, halfY = Ly / 2, dx = Lx / nx, dy = Ly / ny;
    const strat = S.stratigraphy;
    const nH = strat.length + 1;                       // 層面數 = 地層數 + 1（最後為模型底）
    const faults = ((S.structure && S.structure.faults) || []).map((d, i) => makeFault(d, i, depthMax));
    const cutFaults = faults.filter(f => f.def.cuts !== false && !S.horizons);
    const folds = (S.structure && S.structure.folds) || [];
    const domes = (S.structure && S.structure.domes) || [];
    const dipDef = S.structure && S.structure.regionalDip;
    const frame = window.CCSGeo.localFrame(S.location.lon, S.location.lat);

    // ---- 地表 / 海床 ----
    const surf = S.surface || { kind: 'onshore' };
    const landCache = new Map();
    function landInfo(x, y) { // 海岸場址：查海岸線；純陸/純海：固定
      if (surf.kind === 'onshore') return { land: true, dist: 1e9 };
      if (surf.kind === 'offshore') return { land: false, dist: 1e9 };
      const key = Math.round(x) + ',' + Math.round(y);
      let r = landCache.get(key);
      if (!r) {
        if (coast) { const ll = frame.toLonLat(x, y); r = coast.query(ll[0], ll[1]); }
        else r = { land: true, dist: 1e9 };
        landCache.set(key, r);
      }
      return r;
    }
    function reliefAt(x, y) {
      let e = surf.elevation || 0;
      for (const r of (surf.relief || [])) {
        if (r.fold != null) e += r.amplitude * foldShapeAt(folds[r.fold], x, y);
        else if (r.dome != null) e += r.amplitude * domeShapeAt(domes[r.dome], x, y);
      }
      return e;
    }
    function surfaceDepth(x, y) {
      const li = landInfo(x, y);
      if (li.land) {
        const e = reliefAt(x, y);
        // 海岸場址：地形自海岸線向內陸緩升
        if (surf.kind === 'coastal') { const ramp = clamp(li.dist / (surf.coastRamp || 1500), 0, 1); return -(e * ramp + (surf.shoreElevation || 2)); }
        return -e;
      }
      const b = surf.bathymetry || { slope: 0.002, maxDepth: 50 };
      if (surf.kind === 'offshore') return surf.waterDepth != null ? surf.waterDepth : b.maxDepth;
      return Math.min(b.maxDepth, 2 + li.dist * b.slope);
    }

    // ---- 幾何輔助 ----
    function foldShapeAt(f, x, y) {
      const az = f.axisAzimuth * D2R, px = f.through ? f.through[0] : 0, py = f.through ? f.through[1] : 0;
      const d = (x - px) * Math.cos(az) - (y - py) * Math.sin(az);          // 垂直軸向距離
      const u = (x - px) * Math.sin(az) + (y - py) * Math.cos(az);          // 沿軸距離
      return ridgeShape(f.shape, d, f.halfWidth) * alongTaperFactor(f.alongTaper, u);
    }
    function domeShapeAt(d, x, y) {
      const az = (d.azimuth || 0) * D2R, cx = d.center[0], cy = d.center[1];
      const X = (x - cx) * Math.cos(az) - (y - cy) * Math.sin(az);
      const Y = (x - cx) * Math.sin(az) + (y - cy) * Math.cos(az);
      const r2 = (X / d.radii[0]) * (X / d.radii[0]) + (Y / d.radii[1]) * (Y / d.radii[1]);
      return Math.exp(-r2);
    }
    function domeRimAt(d, x, y) { // 邊緣向斜（泥貫入抽離）：環狀下凹
      if (!d.rim) return 0;
      const az = (d.azimuth || 0) * D2R, cx = d.center[0], cy = d.center[1];
      const X = (x - cx) * Math.cos(az) - (y - cy) * Math.sin(az);
      const Y = (x - cx) * Math.sin(az) + (y - cy) * Math.cos(az);
      const r = Math.sqrt((X / d.radii[0]) * (X / d.radii[0]) + (Y / d.radii[1]) * (Y / d.radii[1]));
      const s = (r - d.rim.radiusFactor) / d.rim.width;
      return d.rim.amplitude * Math.exp(-s * s);
    }

    // ---- 厚度修正 ----
    function thicknessMult(mod, x, y, zRef, sides) {
      if (mod.type === 'wedge') {
        const f = faults[mod.fault]; if (!f) return 1;
        const hw = sides && sides.length ? sides[mod.fault] > 0 : (f.v(x, y) > f.vf(zRef));
        if ((mod.side || 'hw') === 'hw' ? !hw : hw) return 1;
        const dist = Math.abs(f.v(x, y) - f.vf(zRef));
        return 1 + (mod.factor - 1) * Math.exp(-dist / mod.lambda);
      }
      if (mod.type === 'linear') {
        const az = mod.azimuth * D2R;
        const s = (x * Math.sin(az) + y * Math.cos(az)) / 1000;
        return clamp(1 + mod.rate * s, 0.05, 10);
      }
      if (mod.type === 'fold') return 1 + (mod.factor - 1) * foldShapeAt(folds[mod.fold], x, y);
      if (mod.type === 'dome') return 1 + (mod.factor - 1) * domeShapeAt(domes[mod.dome], x, y);
      return 1;
    }

    // ---- 匯入層面格網內插 ----
    const hzGrids = S.horizons ? S.horizons.map(h => h.z) : null;
    function gridInterp(z, x, y) {
      const gx = clamp((x + halfX) / dx, 0, nx - 1e-9), gy = clamp((y + halfY) / dy, 0, ny - 1e-9);
      const i = Math.min(nx - 1, Math.floor(gx)), j = Math.min(ny - 1, Math.floor(gy));
      const tx = gx - i, ty = gy - j, w = nx + 1;
      const z00 = z[j * w + i], z10 = z[j * w + i + 1], z01 = z[(j + 1) * w + i], z11 = z[(j + 1) * w + i + 1];
      return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;
    }

    // ---- 層面深度（核心）----
    // sides: 各斷層 +1 = 上盤、-1 = 下盤（以 faults 索引）
    const basementIdx = strat.findIndex(f => f.role === 'basement');
    function rawDepth(h, x, y, sides) {
      if (h === 0) return surfaceDepth(x, y);
      if (hzGrids) return gridInterp(hzGrids[h], x, y);
      if (h >= nH - 1) return depthMax;
      const zRef = strat[h].top;
      // 1. 參考深度 + 厚度變化
      let z = zRef;
      for (let j = 1; j < h; j++) {
        const m = strat[j].thicknessMods; if (!m) continue;
        const t0 = (strat[j + 1] ? strat[j + 1].top : depthMax) - strat[j].top;
        let mult = 1; for (const mod of m) mult *= thicknessMult(mod, x, y, strat[j].top, sides);
        z += t0 * (mult - 1);
      }
      // 2. 區域傾斜、褶皺、穹隆
      if (dipDef) {
        const az = dipDef.azimuth * D2R, px = dipDef.through ? dipDef.through[0] : 0, py = dipDef.through ? dipDef.through[1] : 0;
        z += Math.tan(dipDef.dip * D2R) * ((x - px) * Math.sin(az) + (y - py) * Math.cos(az));
      }
      for (const f of folds) {
        const amp = f.amplitude * depthProfileFactor(f.depthProfile, zRef);
        z += (f.type === 'syncline' ? 1 : -1) * amp * foldShapeAt(f, x, y);
      }
      for (const d of domes) {
        const amp = d.amplitude * depthProfileFactor(d.depthProfile, zRef);
        z -= amp * domeShapeAt(d, x, y);
        if (d.rim) z += depthProfileFactor(d.rim.depthProfile, zRef) * domeRimAt(d, x, y);
      }
      // 3. 斷層位移（上盤）
      for (const f of cutFaults) {
        if (!sides || sides[f.index] <= 0) continue;
        const u = f.u(x, y), dist = f.v(x, y) - f.vf(z);
        z += f.sign * f.throwAt(u, z) * f.hwProfile(dist);
      }
      return z;
    }
    function depthAt(h, x, y, sides) {
      let z = rawDepth(h, x, y, sides);
      if (h === 0 || hzGrids) return z;
      if (h >= nH - 1) return z;
      if (basementIdx > 0 && h < basementIdx && S.structure && S.structure.basementTruncation) {
        z = Math.min(z, rawDepth(basementIdx, x, y, sides));   // 超覆於基盤之上
      }
      const z0 = surfaceDepth(x, y);
      return Math.max(z, z0);                                   // 不得高於地表 / 海床
    }

    // ---- 斷塊 ----
    // 假設模型內斷層彼此不相交：斷塊 = 各斷層側別的組合（僅列出實際存在者）
    const blocks = [];
    if (cutFaults.length === 0) blocks.push({ id: 0, sides: [] });
    else {
      const combos = new Set();
      for (let j = 0; j <= ny; j += 2) for (let i = 0; i <= nx; i += 2) {
        const x = -halfX + i * dx, y = -halfY + j * dy;
        for (const zz of [0, depthMax * 0.5, depthMax]) {
          const sides = faults.map(f => (cutFaults.includes(f) && f.v(x, y) > f.vf(zz) ? 1 : -1));
          combos.add(sides.join(','));
        }
      }
      let id = 0;
      for (const c of combos) blocks.push({ id: id++, sides: c.split(',').map(Number) });
    }
    // 自然側別：以下盤深度判定；位於斷層面投影帶內（正斷層缺口）視為下盤，逆衝重疊視為上盤
    function naturalSides(h, x, y) {
      const sides = faults.map(() => -1);
      for (const f of cutFaults) {
        const zfw = h === 0 ? surfaceDepth(x, y) : rawDepth(h, x, y, sides);
        if (f.v(x, y) > f.vf(zfw)) sides[f.index] = 1;
      }
      return sides;
    }
    function depthNatural(h, x, y) { return depthAt(h, x, y, naturalSides(h, x, y)); }

    function formationAt(x, y, z) {
      for (let h = 1; h < nH; h++) if (z < depthNatural(h, x, y)) return h - 1;
      return -1;
    }

    // ---- 網格：純量場裁切 ----
    // 場 g(x,y) ≤ 0 表示保留
    function clipPolygonByField(poly, g) {
      const out = [], n = poly.length;
      for (let i = 0; i < n; i++) {
        const A = poly[i], B = poly[(i + 1) % n];
        const ga = g(A[0], A[1]), gb = g(B[0], B[1]);
        if (ga <= 0) out.push(A);
        if ((ga <= 0) !== (gb <= 0)) {
          const t = ga / (ga - gb);
          out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
        }
      }
      return out;
    }

    /**
     * 建立網格。opts.clip = {xmin,xmax,ymin,ymax}（剖切）。
     * 回傳 { layers:[{formation, block, positions, normals, indices}], faults:[{index, def, positions, normals, indices}] }
     */
    function buildMeshes(opts) {
      opts = opts || {};
      const cx0 = opts.clip ? Math.max(-halfX, opts.clip.xmin) : -halfX, cx1 = opts.clip ? Math.min(halfX, opts.clip.xmax) : halfX;
      const cy0 = opts.clip ? Math.max(-halfY, opts.clip.ymin) : -halfY, cy1 = opts.clip ? Math.min(halfY, opts.clip.ymax) : halfY;
      const layers = [];
      const i0 = Math.max(0, Math.floor((cx0 + halfX) / dx)), i1 = Math.min(nx, Math.ceil((cx1 + halfX) / dx));
      const j0 = Math.max(0, Math.floor((cy0 + halfY) / dy)), j1 = Math.min(ny, Math.ceil((cy1 + halfY) / dy));
      if (i1 <= i0 || j1 <= j0) return { layers, faults: [] };

      for (const block of blocks) {
        const surfaces = [];
        for (let h = 0; h < nH; h++) {
          const fields = [
            { key: 'W', g: (x, y) => cx0 - x, param: (x, y) => y },
            { key: 'E', g: (x, y) => x - cx1, param: (x, y) => y },
            { key: 'S', g: (x, y) => cy0 - y, param: (x, y) => x },
            { key: 'N', g: (x, y) => y - cy1, param: (x, y) => x }
          ];
          for (const f of cutFaults) {
            const side = block.sides[f.index];
            const zf = (x, y) => depthAt(h, x, y, block.sides);
            fields.push({ key: 'F' + f.index, fault: f, side,
              g: side > 0 ? (x, y) => f.vf(zf(x, y)) - f.v(x, y) : (x, y) => f.v(x, y) - f.vf(zf(x, y)),
              param: (x, y) => f.u(x, y) });
          }
          surfaces.push(buildSurface(h, block, fields, i0, i1, j0, j1));
        }
        for (let L = 0; L < strat.length; L++) {
          const top = surfaces[L], bot = surfaces[L + 1];
          if (!top.tris.length && !bot.tris.length) continue;
          layers.push(assembleLayer(L, block, top, bot));
        }
      }
      const faultMeshes = faults.map(f => buildFaultMesh(f, cx0, cx1, cy0, cy1)).filter(Boolean);
      return { layers, faults: faultMeshes };
    }

    // 格點深度快取：key = blockId:h → Float64Array((nx+1)*(ny+1))
    const nodeZCache = new Map();
    function nodeZ(block, h) {
      const key = block.id + ":" + h;
      let arr = nodeZCache.get(key);
      if (!arr) {
        const w = nx + 1; arr = new Float64Array(w * (ny + 1));
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) arr[j * w + i] = depthAt(h, -halfX + i * dx, -halfY + j * dy, block.sides);
        nodeZCache.set(key, arr);
      }
      return arr;
    }

    function buildSurface(h, block, fields, i0, i1, j0, j1) {
      const verts = [];            // [x,y,z]
      const keyMap = new Map();    // 非格點頂點（裁切交點）
      const w = nx + 1;
      const nodeId = new Int32Array(w * (ny + 1)).fill(-1);
      const zN = nodeZ(block, h);
      const tris = [];
      const boundary = new Map();  // fieldKey -> Map(vertexIndex -> param)
      const zAt = (x, y) => depthAt(h, x, y, block.sides);
      const tol = 1e-3 * Math.max(dx, dy);
      // 各場在格點的值
      const gN = fields.map(fd => {
        const g = new Float64Array(w * (ny + 1));
        if (fd.fault) { const f = fd.fault, sgn = fd.side > 0 ? 1 : -1;
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = -halfX + i * dx, y = -halfY + j * dy; g[j * w + i] = sgn * (f.vf(zN[j * w + i]) - f.v(x, y)); }
        } else for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j * w + i] = fd.g(-halfX + i * dx, -halfY + j * dy);
        return g;
      });
      function nodeVid(i, j) {
        const k = j * w + i; let id = nodeId[k];
        if (id < 0) { id = verts.length; nodeId[k] = id; verts.push([-halfX + i * dx, -halfY + j * dy, zN[k]]); }
        return id;
      }
      function vid(p) {
        if (p.length > 2) return p[2];  // 已附格點 id
        const key = Math.round(p[0] * 100) + "," + Math.round(p[1] * 100);
        let id = keyMap.get(key);
        if (id == null) { id = verts.length; keyMap.set(key, id); verts.push([p[0], p[1], zAt(p[0], p[1])]); }
        return id;
      }
      // 對任意點求場值：格點直接查表，其餘精確計算
      const gAt = (fi, p) => p.length > 2 ? gN[fi][p[3]] : fields[fi].g(p[0], p[1]);
      const outerIdx = fields.map((fd, q) => fd.fault ? -1 : q).filter(q => q >= 0);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const x0 = -halfX + i * dx, x1 = x0 + dx, y0 = -halfY + j * dy, y1 = y0 + dy;
        const k00 = j * w + i, k10 = k00 + 1, k01 = k00 + w, k11 = k01 + 1;
        // 快速路徑：四角在所有場皆為內側 → 直接兩個三角形
        let fastIn = true, anyOut = false;
        for (let fi = 0; fi < fields.length && fastIn; fi++) {
          const g = gN[fi];
          if (g[k00] > tol || g[k10] > tol || g[k01] > tol || g[k11] > tol) fastIn = false;
        }
        if (fastIn) {
          const a = nodeVid(i, j), b = nodeVid(i + 1, j), c = nodeVid(i + 1, j + 1), d = nodeVid(i, j + 1);
          tris.push(a, b, c, a, c, d);
          for (const fi of outerIdx) {
            const g = gN[fi], fd = fields[fi];
            const ks = [k00, k10, k11, k01], ids4 = [a, b, c, d];
            for (let q = 0; q < 4; q++) if (Math.abs(g[ks[q]]) <= tol) {
              let m = boundary.get(fd.key); if (!m) { m = new Map(); boundary.set(fd.key, m); }
              const p = verts[ids4[q]]; m.set(ids4[q], fd.param(p[0], p[1]));
            }
          }
          continue;
        }
        // 頂點格式：[x, y, vertexId?, nodeKey?]（格點附 id 與 key）
        let poly = [[x0, y0, -1, k00], [x1, y0, -1, k10], [x1, y1, -1, k11], [x0, y1, -1, k01]];
        const touched = [];
        let ok = true;
        for (let fi = 0; fi < fields.length; fi++) {
          const fd = fields[fi];
          let allIn = true, allOut = true;
          for (const p of poly) { const g = gAt(fi, p); if (g > tol) allIn = false; if (g < -tol) allOut = false; }
          if (allOut && !allIn) { ok = false; break; }
          if (allIn) { if (!fd.fault) touched.push(fi); continue; }
          const out = [], n = poly.length;
          for (let q = 0; q < n; q++) {
            const A = poly[q], B = poly[(q + 1) % n];
            const ga = gAt(fi, A), gb = gAt(fi, B);
            if (ga <= 0) out.push(A);
            if ((ga <= 0) !== (gb <= 0)) { const t = ga / (ga - gb); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
          }
          poly = out; touched.push(fi);
          if (poly.length < 3) { ok = false; break; }
        }
        if (!ok || poly.length < 3) continue;
        const ids = poly.map(p => p.length > 2 ? nodeVid(p[3] % w, Math.floor(p[3] / w)) : vid(p));
        for (let k = 1; k + 1 < ids.length; k++) tris.push(ids[0], ids[k], ids[k + 1]);
        for (const fi of touched) {
          const fd = fields[fi]; let m = null;
          for (let k = 0; k < poly.length; k++) {
            const p = poly[k];
            if (Math.abs(gAt(fi, p)) <= tol) {
              if (!m) { m = boundary.get(fd.key); if (!m) { m = new Map(); boundary.set(fd.key, m); } }
              m.set(ids[k], fd.param(p[0], p[1]));
            }
          }
        }
      }
      return { h, verts, tris, boundary };
    }

    const WALL_STEPS = 8;   // 側壁垂向細分：讓剖切崖面可顯示層內屬性變化
    function assembleLayer(L, block, top, bot) {
      const pos = [], nrm = [], idx = [], zrel = [];
      function addSurface(s, flip) {
        const base = pos.length / 3;
        const n = s.verts.length, acc = new Float64Array(n * 3);
        for (let t = 0; t < s.tris.length; t += 3) {
          const a = s.verts[s.tris[t]], b = s.verts[s.tris[t + 1]], c = s.verts[s.tris[t + 2]];
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          const nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx;
          for (let q = 0; q < 3; q++) { const k = s.tris[t + q]; acc[k * 3] += nx_; acc[k * 3 + 1] += ny_; acc[k * 3 + 2] += nz_; }
        }
        for (let k = 0; k < n; k++) {
          const v = s.verts[k]; pos.push(v[0], v[1], v[2]); zrel.push(flip ? 1 : 0);
          let x = acc[k * 3], y = acc[k * 3 + 1], z = acc[k * 3 + 2];
          const len = Math.sqrt(x * x + y * y + z * z) || 1; x /= len; y /= len; z /= len;
          if (flip ? z < 0 : z > 0) { x = -x; y = -y; z = -z; }
          if (len <= 1e-12) { x = 0; y = 0; z = flip ? 1 : -1; }
          nrm.push(x, y, z);
        }
        for (let t = 0; t < s.tris.length; t += 3) {
          if (flip) idx.push(base + s.tris[t], base + s.tris[t + 2], base + s.tris[t + 1]);
          else idx.push(base + s.tris[t], base + s.tris[t + 1], base + s.tris[t + 2]);
        }
      }
      addSurface(top, false);
      const topCount = pos.length / 3;   // 頂面頂點數（供地表著色）
      addSurface(bot, true);
      // 側壁：頂/底邊界折線重取樣到共同參數，建立 (參數 × 垂向) 規則格網；兩折線同在斷層面或模型邊上，線性內插仍落在該面
      const interp = (P, p) => {
        if (p <= P[0].p) return P[0].v;
        if (p >= P[P.length - 1].p) return P[P.length - 1].v;
        let lo = 0, hi = P.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].p <= p) lo = m; else hi = m; }
        const A = P[lo], B = P[hi], t = (p - A.p) / Math.max(B.p - A.p, 1e-9);
        return [A.v[0] + (B.v[0] - A.v[0]) * t, A.v[1] + (B.v[1] - A.v[1]) * t, A.v[2] + (B.v[2] - A.v[2]) * t];
      };
      const keys = new Set([...top.boundary.keys(), ...bot.boundary.keys()]);
      for (const key of keys) {
        const tm = top.boundary.get(key), bm = bot.boundary.get(key);
        if (!tm || !bm || tm.size === 0 || bm.size === 0) continue;
        const T = [...tm.entries()].map(([id, p]) => ({ p, v: top.verts[id] })).sort((a, b) => a.p - b.p);
        const B = [...bm.entries()].map(([id, p]) => ({ p, v: bot.verts[id] })).sort((a, b) => a.p - b.p);
        const all = [...T.map(q => q.p), ...B.map(q => q.p)].sort((a, b) => a - b);
        const params = []; for (const p of all) if (!params.length || p - params[params.length - 1] > 1e-3) params.push(p);
        if (params.length < 2) continue;
        const cols = params.map(p => ({ t: interp(T, p), b: interp(B, p) }));
        const base = pos.length / 3, rows = WALL_STEPS + 1, nc = cols.length;
        for (let c = 0; c < nc; c++) for (let k = 0; k < rows; k++) {
          const f = k / WALL_STEPS, t = cols[c].t, bb = cols[c].b;
          pos.push(t[0] + (bb[0] - t[0]) * f, t[1] + (bb[1] - t[1]) * f, t[2] + (bb[2] - t[2]) * f);
          zrel.push(f);
        }
        const acc = new Float64Array(nc * rows * 3);
        const vid = (c, k) => c * rows + k;
        const tri = (i, j, k) => {
          const A = base + i, Bq = base + j, C = base + k;
          const ax = pos[A * 3], ay = pos[A * 3 + 1], az = pos[A * 3 + 2];
          const ux = pos[Bq * 3] - ax, uy = pos[Bq * 3 + 1] - ay, uz = pos[Bq * 3 + 2] - az;
          const vx = pos[C * 3] - ax, vy = pos[C * 3 + 1] - ay, vz = pos[C * 3 + 2] - az;
          const nx_ = uy * vz - uz * vy, ny_ = uz * vx - ux * vz, nz_ = ux * vy - uy * vx;
          if (nx_ * nx_ + ny_ * ny_ + nz_ * nz_ < 1e-12) return;
          idx.push(A, Bq, C);
          for (const q of [i, j, k]) { acc[q * 3] += nx_; acc[q * 3 + 1] += ny_; acc[q * 3 + 2] += nz_; }
        };
        for (let c = 0; c + 1 < nc; c++) for (let k = 0; k < WALL_STEPS; k++) {
          tri(vid(c, k), vid(c + 1, k), vid(c, k + 1));
          tri(vid(c + 1, k), vid(c + 1, k + 1), vid(c, k + 1));
        }
        for (let q = 0; q < nc * rows; q++) {
          let x = acc[q * 3], y = acc[q * 3 + 1], z = acc[q * 3 + 2];
          const len = Math.sqrt(x * x + y * y + z * z);
          if (len < 1e-12) { x = 0; y = 0; z = -1; } else { x /= len; y /= len; z /= len; }
          nrm.push(x, y, z);
        }
      }
      return { formation: L, block: block.id, topCount, positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint32Array(idx), zrel: new Float32Array(zrel) };
    }

    function buildFaultMesh(f, cx0, cx1, cy0, cy1) {
      const d = f.def;
      const zTop = Math.max(0, (d.tipDepth || 0) - 50), zBot = d.bottomDepth || depthMax;
      if (zBot <= zTop) return null;
      const corners = [[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]];
      let umin = Infinity, umax = -Infinity;
      for (const c of corners) { const u = f.u(c[0], c[1]); umin = Math.min(umin, u); umax = Math.max(umax, u); }
      if (d.alongTaper) { umin = Math.max(umin, d.alongTaper.center - d.alongTaper.halfLength); umax = Math.min(umax, d.alongTaper.center + d.alongTaper.halfLength); }
      if (umax <= umin) return null;
      const nu = 40, nz = 30, pos = [], nrm = [], idx = [];
      const box = [(x, y) => cx0 - x, (x, y) => x - cx1, (x, y) => cy0 - y, (x, y) => y - cy1];
      for (let a = 0; a < nu; a++) for (let b = 0; b < nz; b++) {
        const u0 = umin + (umax - umin) * a / nu, u1 = umin + (umax - umin) * (a + 1) / nu;
        const z0 = zTop + (zBot - zTop) * b / nz, z1 = zTop + (zBot - zTop) * (b + 1) / nz;
        let quad = [[...f.point(u0, z0), z0], [...f.point(u1, z0), z0], [...f.point(u1, z1), z1], [...f.point(u0, z1), z1]];
        for (const g of box) {
          const out = [];
          for (let k = 0; k < quad.length; k++) {
            const A = quad[k], Bq = quad[(k + 1) % quad.length];
            const ga = g(A[0], A[1]), gb = g(Bq[0], Bq[1]);
            if (ga <= 0) out.push(A);
            if ((ga <= 0) !== (gb <= 0)) { const t = ga / (ga - gb); out.push([A[0] + (Bq[0] - A[0]) * t, A[1] + (Bq[1] - A[1]) * t, A[2] + (Bq[2] - A[2]) * t]); }
          }
          quad = out; if (quad.length < 3) break;
        }
        if (quad.length < 3) continue;
        const base = pos.length / 3;
        const A = quad[0], B = quad[1], C = quad[2];
        let nx_ = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
        let ny_ = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
        let nz_ = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        const len = Math.sqrt(nx_ * nx_ + ny_ * ny_ + nz_ * nz_) || 1; nx_ /= len; ny_ /= len; nz_ /= len;
        for (const p of quad) { pos.push(p[0], p[1], p[2]); nrm.push(nx_, ny_, nz_); }
        for (let k = 1; k + 1 < quad.length; k++) idx.push(base, base + k, base + k + 1);
      }
      return { index: f.index, def: d, positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint32Array(idx) };
    }

    /** 取樣某地層頂/底面（自然側別）到規則格網，供羽流披覆、閉合分析與 2D 等深線 */
    function sampleFormationGrid(L) {
      const w = nx + 1, hgt = ny + 1, top = new Float32Array(w * hgt), base = new Float32Array(w * hgt);
      for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) {
        const x = -halfX + i * dx, y = -halfY + j * dy;
        top[j * w + i] = depthNatural(L, x, y);
        base[j * w + i] = depthNatural(L + 1, x, y);
      }
      return { w, h: hgt, top, base, dx, dy, x0: -halfX, y0: -halfY };
    }

    /** 各斷層在指定深度的投影線（供 2D 圖台顯示） */
    function faultTraces(z) {
      return faults.map(f => {
        const pts = [];
        const corners = [[-halfX, -halfY], [halfX, -halfY], [halfX, halfY], [-halfX, halfY]];
        let umin = Infinity, umax = -Infinity;
        for (const c of corners) { const u = f.u(c[0], c[1]); umin = Math.min(umin, u); umax = Math.max(umax, u); }
        for (let k = 0; k <= 40; k++) {
          const u = umin + (umax - umin) * k / 40; const p = f.point(u, z);
          if (p[0] >= -halfX && p[0] <= halfX && p[1] >= -halfY && p[1] <= halfY) pts.push(p);
        }
        return { fault: f, points: pts };
      });
    }

    return {
      site: S, frame, grid: { nx, ny, dx, dy, halfX, halfY, depthMax }, strat, faults, cutFaults, blocks,
      depthAt, depthNatural, surfaceDepth, landInfo, formationAt, naturalSides, buildMeshes, sampleFormationGrid, faultTraces
    };
  }

  return { buildModel, makeFault };
})();
