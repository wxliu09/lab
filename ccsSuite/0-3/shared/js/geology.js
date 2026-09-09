window.CCS = window.CCS || {};
(function () {
'use strict';

const THREE = window.THREE;
const { HORIZONS, STRATA, WELLS, FAULTS, VIEW, SITE, RESERVOIR, VECTORS, MODEL_OUTLINE } = window.CCS;
const { lonLatToWorld } = window.CCS;
const PETRO_MOD = window.CCS.petro;

/**
 * 不規則地質體幾何建構。
 *
 * 與「正方形區塊」版本的差異：
 *   每個地層擁有自己的平面輪廓 R(θ)，由基準半徑疊加多階諧波構成，
 *   形成互不相同的不規則邊界（模擬沉積相帶／剝蝕邊界）；
 *   並支援方向性尖滅（pinch-out），使地層朝特定方位漸薄至零，
 *   形成實務上常見的地層圈閉。
 *
 * 網格採極座標（rings × sectors），中心為單一頂點，
 * 邊界頂點恰落在 R(θ) 上，因此輪廓完全貼合、無鋸齒。
 *
 * 所有幾何以「真實公尺」建立，垂直放大由父層 group.scale.y 控制。
 */

const D2R = Math.PI / 180;
const HALF = SITE.halfExtent;
const RINGS = VIEW.rings;
const SECTORS = VIEW.sectors;

/* ------------------------------------------------------------------ *
 * 構造形態
 * ------------------------------------------------------------------ */

/**
 * 無因次構造形狀函數：中央背斜穹丘 + 區域緩傾 + 次級波褶。
 * 乘上各界面的 amp 得到起伏量。
 */
function structureShape(x, z) {
  const a = 2050;
  const b = 1480;
  const dome = Math.exp(-((x * x) / (a * a) + (z * z) / (b * b)));
  const ripple = 0.11 * Math.sin(x / 880) * Math.cos(z / 1120);
  const regionalDip = -0.000085 * x - 0.00004 * z;
  return dome + ripple + regionalDip;
}

/** 第 k 個界面在 (x, z) 的高程（公尺，地下為負） */
function horizonElev(k, x, z) {
  const h = HORIZONS[k];
  return h.elev + h.amp * structureShape(x, z) + faultOffset(k, x, z);
}

/* ------------------------------------------------------------------ *
 * 斷層位移
 * ------------------------------------------------------------------ *
 * 斷層不只是一片裝飾用的面，它會實際錯開兩側的地層界面。
 * 斷層面隨深度沿傾向前移（run = Δ高程 / tan(dip)），因此同一條斷層
 * 在不同層位切過的平面位置不同，這是剖面上判讀上／下盤的依據。
 */

/**
 * 點 (x,z) 相對於斷層 f 在高程 y 處的局部座標。
 * l  = 沿走向距斷層中心的距離
 * sd = 沿傾向與斷層面的有號距離，> 0 為上盤（hanging wall）
 */
function faultLocal(f, x, z, y) {
  const strikeRad = f.strike * D2R;
  const sx = Math.sin(strikeRad), sz = -Math.cos(strikeRad);
  const dx = Math.cos(strikeRad), dz = Math.sin(strikeRad);
  const px = x - f.offsetEast;
  const pz = z + f.offsetNorth;
  const l = px * sx + pz * sz;
  const u = px * dx + pz * dz;
  const run = (f.topElev - y) / Math.tan(f.dip * D2R);
  // 與斷層面網格一致的跡線起伏
  const wob = 24 * Math.sin((l / f.length + 0.5) * Math.PI * 2.2 + 0.6);
  return { l, u, sd: u - run - wob };
}

/**
 * 第 k 個界面在 (x,z) 因斷層造成的高程位移（公尺，正值為上抬）。
 *
 * 位移沿走向與沿傾向皆採橢圓分布（displacement–length scaling），
 * 兩端與上下尖端衰減為 0；上盤與下盤各承擔一半斷距，
 * 因此區域平均高程不變，塊體不會整體上下平移。
 * 跨斷層以破裂帶半寬 damage 做平滑過渡，模擬拖曳褶皺與破碎帶。
 */
function faultOffset(k, x, z) {
  let total = 0;
  const yRef = HORIZONS[k].elev;
  for (let n = 0; n < FAULTS.length; n++) {
    const f = FAULTS[n];
    if (!f.throw) continue;
    if (yRef > f.topElev || yRef < f.botElev) continue;
    const hl = f.length / 2;
    const loc = faultLocal(f, x, z, yRef);
    if (Math.abs(loc.l) >= hl) continue;
    const tl = Math.sqrt(Math.max(0, 1 - (loc.l / hl) * (loc.l / hl)));
    const mid = (f.topElev + f.botElev) / 2;
    const halfD = (f.topElev - f.botElev) / 2;
    const td = Math.sqrt(Math.max(0, 1 - Math.pow((yRef - mid) / halfD, 2)));
    const w = f.damage || 120;
    const side = 2 * smoothstep(-w, w, loc.sd) - 1;   // −1 下盤 → +1 上盤
    const sign = f.sense === 'reverse' ? 1 : -1;      // 正斷層上盤下降
    total += sign * side * (f.throw / 2) * tl * td;
  }
  return total;
}

/** 斷層在某高程的跡線（平面上的一條線），供剖面圖與平面投影使用 */
function faultTrace(f, y, count = 48) {
  const strikeRad = f.strike * D2R;
  const sx = Math.sin(strikeRad), sz = -Math.cos(strikeRad);
  const dx = Math.cos(strikeRad), dz = Math.sin(strikeRad);
  const run = (f.topElev - y) / Math.tan(f.dip * D2R);
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const l = (i / count - 0.5) * f.length;
    const wob = 24 * Math.sin((i / count) * Math.PI * 2.2 + 0.6);
    pts.push({
      x: f.offsetEast + sx * l + dx * (run + wob),
      z: -f.offsetNorth + sz * l + dz * (run + wob)
    });
  }
  return pts;
}

/* ------------------------------------------------------------------ *
 * 不規則輪廓
 * ------------------------------------------------------------------ */

/**
 * 地層平面輪廓半徑 R(θ)。
 * 以基準半徑疊加數階諧波，得到平滑但不規則的閉合邊界。
 * 因為使用的是週期函數，θ=0 與 θ=2π 必然連續，輪廓保證閉合。
 */
function outlineRadius(outline, theta) {
  let f = 1;
  for (const [amp, wave, phase] of outline.harmonics) {
    f += amp * Math.cos(wave * theta + phase);
  }
  return outline.radius * Math.max(0.25, f);
}

/**
 * 地層分布範圍邊界 R(θ)：以「塊體邊界的比例」表示，而不是絕對半徑。
 * 這樣各層的尖滅界線永遠跟著塊體形狀走，不會因為兩者形狀不匹配
 * 而在某些方位整層提早消失、把崖面掏空。
 * 回傳 Infinity 代表該層分布連續，直達塊體邊界。
 */
function extentRadius(stratum, theta) {
  const e = stratum.extent;
  if (!e) return Infinity;
  let f = 1;
  for (const [amp, wave, phase] of e.harmonics) {
    f += amp * Math.cos(wave * theta + phase);
  }
  return modelRadius(theta) * e.scale * Math.max(0.25, f);
}

/** 取得某地層分布範圍邊界上的取樣點（世界座標，依序閉合） */
function outlinePoints(stratum, count = SECTORS) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    const r = Math.min(extentRadius(stratum, th), modelRadius(th));
    pts.push({ x: Math.cos(th) * r, z: Math.sin(th) * r });
  }
  return pts;
}

/**
 * 方向性尖滅因子：回傳厚度保留比例 (0~1)。
 * @param {object|null} pinch 尖滅設定
 * @param {number} theta 方位角（弧度，0=+X=東，逆時針）
 * @param {number} t     徑向歸一化位置 0(中心)~1(邊界)
 */
function pinchFactor(pinch, theta, t) {
  if (!pinch) return 1;
  // 方位權重：以 cos 型鐘罩限制影響範圍，超出角幅則不受影響
  const az = pinch.azimuth * D2R;
  let d = theta - az;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const halfWidth = (pinch.width * D2R) / 2;
  if (Math.abs(d) >= halfWidth) return 1;
  const azWeight = Math.pow(Math.cos((d / halfWidth) * (Math.PI / 2)), 1.4);

  // 徑向權重：自 start 之後平滑遞減
  if (t <= pinch.start) return 1;
  const u = (t - pinch.start) / (1 - pinch.start);
  const radialWeight = u * u * (3 - 2 * u); // smoothstep

  return 1 - pinch.strength * azWeight * radialWeight;
}

/**
 * 頂部剝蝕截切係數：在輪廓外緣把頂面往下削，模擬不整合面削截。
 * 回傳應扣掉的厚度比例（0~1）。
 */
function erosionShare(stratum, theta, t) {
  if (!stratum.erosion) return 0;
  const wave = 0.5 + 0.5 * Math.cos(2.7 * theta + 1.1);
  const edge = Math.max(0, (t - 0.45) / 0.55);
  return stratum.erosion * wave * edge * edge;
}

/* ------------------------------------------------------------------ *
 * 地層實體
 * ------------------------------------------------------------------ *
 * 極座標網格：
 *   ring 0        = 中心單一頂點
 *   ring 1..RINGS = 每環 SECTORS 個頂點
 *   ring RINGS    = 落在「模型塊體邊界」MODEL_OUTLINE 上（所有層共用）
 *
 * 兩層不規則性：
 *   1. 塊體邊界不規則 → 整體不是正方形，四周是一圈起伏的地層剖面崖面
 *   2. 各地層自身輪廓不規則 → 決定它在塊體內尖滅到哪裡；超出自身輪廓者
 *      厚度平滑收斂為 0，下伏地層隨之相對抬升（上超 / 尖滅）
 *
 * 界面高程採「自地表往下累積」，因此層與層永遠緊貼，不會出現懸空空隙。
 */

/** 模型塊體邊界半徑（所有層共用） */
function modelRadius(theta) {
  return outlineRadius(MODEL_OUTLINE, theta);
}

/** 平滑階梯 */
function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * 地層分布範圍因子 (0~1)：在自身範圍內為 1，接近範圍邊界時平滑收斂為 0。
 * 過渡帶佔範圍半徑的 EXTENT_BAND，避免出現不連續的階梯。
 */
const EXTENT_BAND = 0.14;

function extentFactor(stratum, theta, r) {
  const rEdge = extentRadius(stratum, theta);
  if (!isFinite(rEdge)) return 1;
  const band = rEdge * EXTENT_BAND;
  return 1 - smoothstep(rEdge - band, rEdge, r);
}

/**
 * 某地層的厚度保留係數 (0~1)：綜合方向性尖滅、頂部剝蝕與分布範圍收斂。
 * 1 = 完整保留，0 = 已尖滅。
 */
function preservation(i, x, z) {
  const s = STRATA[i];
  const theta = Math.atan2(z, x);
  const r = Math.hypot(x, z);
  const t = Math.min(1, r / modelRadius(theta));
  let f = pinchFactor(s.pinch, theta, t) - erosionShare(s, theta, t);
  f *= extentFactor(s, theta, r);
  return Math.min(1, Math.max(0, f));
}

/** 某地層在 (x, z) 的「未疊加」厚度：以基準層厚乘上保留係數 */
function rawThickness(i, x, z) {
  return (horizonElev(i, x, z) - horizonElev(i + 1, x, z)) * preservation(i, x, z);
}

/**
 * 欄柱剖面：一次算出某 (x,z) 上所有地層的頂面高程與厚度。
 *
 * 由下往上堆疊（bottom-up）並採「上超填充」：每層自下伏層頂面往上長，
 * 填滿到自身的構造頂面為止，再乘上自身的保留係數。因此
 *   1. 深部儲層的頂面始終貼著自己的構造面，不會被上覆層的尖滅拉高，
 *      構造閉合分析才反映真實背斜形態；
 *   2. 某層尖滅所讓出的空間由「緊鄰的上覆層」增厚填補（onlap），
 *      而不是全部堆到地表覆蓋層。
 * 最上層一律補滿到地表，塊體四周永遠是完整高度的地層剖面崖。
 *
 * 同一個平面座標會被「各層的頂面與底面」重複查詢十餘次，
 * 逐層回溯會造成 O(n²) 的重算；改以快取的欄柱剖面後，
 * 每個座標只計算一次，網格密度才有提高的餘裕。
 */
const columnCache = new Map();

/** 單一地層藉上超填充所能增厚的上限（相對於自身基準層厚） */
const MAX_ONLAP_GROWTH = 1.7;

function column(x, z) {
  const key = Math.round(x * 64) + '|' + Math.round(z * 64);
  let c = columnCache.get(key);
  if (c) return c;

  const n = STRATA.length;
  const tops = new Array(n);
  const thick = new Array(n);
  const surface = horizonElev(0, x, z);
  const base = horizonElev(HORIZONS.length - 1, x, z);

  let y = base;
  let hTop = horizonElev(n, x, z);
  for (let i = n - 1; i >= 1; i--) {
    const hSelf = horizonElev(i, x, z);
    const f = preservation(i, x, z);
    // 填到自身構造頂面，但單層增厚不超過基準層厚的 MAX_ONLAP_GROWTH 倍，
    // 剩餘的空間再往上分配，避免全部集中在同一層。
    const th = Math.max(0, Math.min((hSelf - y) * f, (hSelf - hTop) * f * MAX_ONLAP_GROWTH));
    thick[i] = th;
    y += th;
    tops[i] = y;
    hTop = hSelf;
  }
  thick[0] = Math.max(0, surface - y);
  tops[0] = surface;

  c = { tops, thick, base };
  if (columnCache.size > 400000) columnCache.clear();
  columnCache.set(key, c);
  return c;
}

/** 某地層在 (x, z) 的實際厚度 */
function thicknessAt(i, x, z) {
  return column(x, z).thick[i];
}

/** 第 i 層頂面高程（i = 0 即地表） */
function stackTop(i, x, z) {
  return column(x, z).tops[i];
}

/* ------------------------------------------------------------------ *
 * CO₂ 飽和度場
 * ------------------------------------------------------------------ */

/** 目前羽流狀態（隨時間軸更新），供飽和度場與屬性著色共用 */
const plumeState = (() => {
  const w = WELLS[0];
  const p = lonLatToWorld(w.lon, w.lat);
  const last = window.CCS.INJECTION[window.CCS.INJECTION.length - 1];
  return { radius: last.radius, thickness: last.thickness, cx: p.x, cz: p.z };
})();

function setPlumeState(radius, thickness) {
  plumeState.radius = radius;
  plumeState.thickness = thickness;
}

/**
 * 某取樣點的 CO₂ 飽和度。
 * 羽流受浮力聚集於儲層頂面下方，因此飽和度在頂部最高、向下遞減（重力超覆），
 * 並隨徑向距離衰減；再乘上滲透率非均質性造成的指進（fingering）擾動。
 * @param {number} zRel 層內相對深度 0(頂)~1(底)
 */
function co2SaturationAt(index, x, z, zRel) {
  if (index !== RESERVOIR.strataIndex) return 0;
  if (plumeState.radius <= 0 || plumeState.thickness <= 0) return 0;
  const dx = x - plumeState.cx, dz = z - plumeState.cz;
  const r = Math.hypot(dx, dz);
  const theta = Math.atan2(dz, dx);
  const rMax = plumeRadiusAt(theta, plumeState.radius);
  const t = r / rMax;
  if (t >= 1) return 0;

  const col = column(x, z);
  const h = col.thick[index];
  if (h < 0.5) return 0;
  const roof = col.tops[index] - 6;
  const y = col.tops[index] - zRel * h;
  const localTh = plumeState.thickness * Math.pow(Math.max(0, 1 - t * t), 0.75);
  if (localTh <= 0) return 0;
  const below = roof - y;
  if (below < 0 || below > localTh) return 0;

  const radial = Math.pow(1 - t * t, 0.6);
  const vertical = 1 - 0.55 * (below / localTh);
  const finger = 1 + 0.28 * PETRO_MOD.fbm(x, z, 420, 21);
  const sgMax = (1 - STRATA[index].petro.swi) * 0.85;
  return Math.max(0, Math.min(sgMax, sgMax * radial * vertical * finger));
}

/* ------------------------------------------------------------------ *
 * 地層網格與屬性取樣
 * ------------------------------------------------------------------ */

/** 側牆的垂向細分數：讓塊體崖面顯示層內紋理與屬性垂向變化 */
const WALL_STEPS = 10;

/** 屬性欄位順序，與 geo.userData.props 的排列一致 */
const PROP_KEYS = ['phi', 'perm', 'ntg', 'vsh', 'gr', 'sw', 'sg', 'rhob', 'vp', 'ai'];

function buildStratumGeometry(stratum, index) {
  const pos = [];
  const uv = [];
  const idx = [];
  const sample = [];              // 每頂點的 (x, z, zRel)，供屬性重算
  const props = [];               // 每頂點的屬性值，長度 = 頂點數 × PROP_KEYS.length

  function pushProps(x, z, zRel) {
    sample.push(x, z, zRel);
    const p = PETRO_MOD.propsAt(index, x, z, zRel, co2SaturationAt(index, x, z, zRel));
    for (let k = 0; k < PROP_KEYS.length; k++) props.push(p[PROP_KEYS[k]]);
  }

  function surf(theta, t) {
    const r = modelRadius(theta) * t;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const top = stackTop(index, x, z);
    const bot = top - thicknessAt(index, x, z);
    return { x, z, top, bot };
  }

  // ---- 頂點：中心點 + 各環 ----
  const center = surf(0, 0);
  const topCenter = pos.length / 3;
  pos.push(center.x, center.top, center.z);
  uv.push(0.5, 0.5);
  pushProps(center.x, center.z, 0.02);

  const topRingStart = pos.length / 3;
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;
    for (let j = 0; j < SECTORS; j++) {
      const th = (j / SECTORS) * Math.PI * 2;
      const s = surf(th, t);
      pos.push(s.x, s.top, s.z);
      uv.push(0.5 + Math.cos(th) * t * 0.5, 0.5 + Math.sin(th) * t * 0.5);
      pushProps(s.x, s.z, 0.02);
    }
  }

  const botCenter = pos.length / 3;
  pos.push(center.x, center.bot, center.z);
  uv.push(0.5, 0.5);
  pushProps(center.x, center.z, 0.98);

  const botRingStart = pos.length / 3;
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;
    for (let j = 0; j < SECTORS; j++) {
      const th = (j / SECTORS) * Math.PI * 2;
      const s = surf(th, t);
      pos.push(s.x, s.bot, s.z);
      uv.push(0.5 + Math.cos(th) * t * 0.5, 0.5 + Math.sin(th) * t * 0.5);
      pushProps(s.x, s.z, 0.98);
    }
  }

  const ringIdx = (start, i, j) => start + (i - 1) * SECTORS + (j % SECTORS);

  // ---- 頂面（法線朝上）----
  for (let j = 0; j < SECTORS; j++) {
    idx.push(topCenter, ringIdx(topRingStart, 1, j + 1), ringIdx(topRingStart, 1, j));
  }
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const a = ringIdx(topRingStart, i, j);
      const b = ringIdx(topRingStart, i, j + 1);
      const c = ringIdx(topRingStart, i + 1, j);
      const d = ringIdx(topRingStart, i + 1, j + 1);
      idx.push(a, b, c, b, d, c);
    }
  }

  // ---- 底面（法線朝下，繞序相反）----
  for (let j = 0; j < SECTORS; j++) {
    idx.push(botCenter, ringIdx(botRingStart, 1, j), ringIdx(botRingStart, 1, j + 1));
  }
  for (let i = 1; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const a = ringIdx(botRingStart, i, j);
      const b = ringIdx(botRingStart, i, j + 1);
      const c = ringIdx(botRingStart, i + 1, j);
      const d = ringIdx(botRingStart, i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }

  // ---- 外緣側牆 ----
  // 崖面另建一組垂向細分的頂點，使層內的粒序、單層與屬性變化
  // 能在剖面崖上顯示出來（僅用頂／底兩排頂點只會得到一段線性漸層）。
  const wallStart = pos.length / 3;
  for (let j = 0; j < SECTORS; j++) {
    const th = (j / SECTORS) * Math.PI * 2;
    const s = surf(th, 1);
    const h = s.top - s.bot;
    for (let k = 0; k <= WALL_STEPS; k++) {
      const zRel = k / WALL_STEPS;
      pos.push(s.x, s.top - h * zRel, s.z);
      uv.push(j / SECTORS, 1 - zRel);
      pushProps(s.x, s.z, zRel);
    }
  }
  const wallIdx = (j, k) => wallStart + (j % SECTORS) * (WALL_STEPS + 1) + k;
  for (let j = 0; j < SECTORS; j++) {
    for (let k = 0; k < WALL_STEPS; k++) {
      const a = wallIdx(j, k);
      const b = wallIdx(j + 1, k);
      const c = wallIdx(j, k + 1);
      const d = wallIdx(j + 1, k + 1);
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.userData.sample = new Float32Array(sample);
  geo.userData.props = new Float32Array(props);
  geo.userData.stratumIndex = index;
  return geo;
}

/** 取得某頂點的屬性物件 */
function vertexProps(geo, v) {
  const arr = geo.userData.props;
  const base = v * PROP_KEYS.length;
  const out = {};
  for (let k = 0; k < PROP_KEYS.length; k++) out[PROP_KEYS[k]] = arr[base + k];
  return out;
}

/**
 * 依著色模式重建 mesh 的頂點色。
 * lithology 模式仍以岩性底色為主，但依局部孔隙度做明暗調變，
 * 讓崖面上的單層與粒序看得出來，而不是一片死板的色塊。
 */
function applyColorMode(mesh, modeKey) {
  const geo = mesh.geometry;
  const n = geo.attributes.position.count;
  const arr = geo.userData.props;
  if (!arr) return;
  const index = geo.userData.stratumIndex;
  const s = STRATA[index];
  let colors = geo.attributes.color;
  if (!colors || colors.count !== n) {
    colors = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('color', colors);
  }
  const cArr = colors.array;
  const stride = PROP_KEYS.length;
  const phiIdx = PROP_KEYS.indexOf('phi');
  const base = new THREE.Color(s.color);
  const p = s.petro;

  for (let v = 0; v < n; v++) {
    const o = v * stride;
    let r, g, b;
    if (modeKey === 'lithology') {
      const shade = 0.84 + 0.32 * PETRO_MOD.clamp((arr[o + phiIdx] - p.phi) / (2.5 * p.phiSd) + 0.5, 0, 1);
      r = base.r * shade; g = base.g * shade; b = base.b * shade;
    } else {
      const props = {};
      for (let k = 0; k < stride; k++) props[PROP_KEYS[k]] = arr[o + k];
      const c = PETRO_MOD.colorFor(modeKey, props);
      if (!c) { r = base.r; g = base.g; b = base.b; }
      else { r = c[0]; g = c[1]; b = c[2]; }
    }
    cArr[v * 3] = r; cArr[v * 3 + 1] = g; cArr[v * 3 + 2] = b;
  }
  colors.needsUpdate = true;
  mesh.material.vertexColors = true;
  mesh.material.color.setRGB(1, 1, 1);
  mesh.material.needsUpdate = true;
}

/** 羽流改變後，重算儲層的 CO₂ 飽和度屬性（其餘層不受影響） */
function refreshSaturation(mesh) {
  const geo = mesh.geometry;
  const index = geo.userData.stratumIndex;
  if (index !== RESERVOIR.strataIndex) return;
  const sample = geo.userData.sample;
  const arr = geo.userData.props;
  const stride = PROP_KEYS.length;
  const sgIdx = PROP_KEYS.indexOf('sg');
  const swIdx = PROP_KEYS.indexOf('sw');
  const vpIdx = PROP_KEYS.indexOf('vp');
  const aiIdx = PROP_KEYS.indexOf('ai');
  const rhoIdx = PROP_KEYS.indexOf('rhob');
  const n = sample.length / 3;
  for (let v = 0; v < n; v++) {
    const x = sample[v * 3], z = sample[v * 3 + 1], zRel = sample[v * 3 + 2];
    const p = PETRO_MOD.propsAt(index, x, z, zRel, co2SaturationAt(index, x, z, zRel));
    const o = v * stride;
    arr[o + sgIdx] = p.sg;
    arr[o + swIdx] = p.sw;
    arr[o + vpIdx] = p.vp;
    arr[o + aiIdx] = p.ai;
    arr[o + rhoIdx] = p.rhob;
  }
}

/**
 * 建立全部地層 Mesh。
 * @param {THREE.Plane[]} clipPlanes 供剖切使用的平面陣列（與材質共用參考）
 */
function buildStrata(clipPlanes) {
  const group = new THREE.Group();
  group.name = 'strata';

  STRATA.forEach((s, i) => {
    const geo = buildStratumGeometry(s, i);
    const mat = new THREE.MeshStandardMaterial({
      color: s.color,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      clippingPlanes: clipPlanes,
      clipShadows: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'stratum-' + s.id;
    mesh.userData = { kind: 'stratum', index: i, data: s };
    applyColorMode(mesh, 'lithology');
    group.add(mesh);
  });

  return group;
}

/** 取得某地層在指定平面位置的頂／底深度，供虛擬鑽井剖面使用 */
function stratumDepthAt(index, x, z) {
  const th = thicknessAt(index, x, z);
  if (th < 0.5) return null;
  const top = stackTop(index, x, z);
  return { top, bot: top - th, thickness: th };
}

/* ------------------------------------------------------------------ *
 * CO₂ 羽流
 * ------------------------------------------------------------------ */

/**
 * 羽流：受浮力聚集於儲層頂面下方的透鏡體。
 * 平面形狀亦為不規則（受滲透率非均質性控制），
 * 但整體仍以注入井為中心。
 */
function plumeRadiusAt(theta, baseRadius) {
  return baseRadius * (1 + 0.22 * Math.cos(2 * theta + 0.8) + 0.12 * Math.sin(3 * theta - 1.6) + 0.07 * Math.cos(5 * theta + 0.3));
}

function buildPlumeGeometry(cx, cz, radius, maxTh) {
  const rings = 18;
  const sectors = 64;
  const pos = [];
  const idx = [];
  const resIdx = RESERVOIR.strataIndex;

  function pt(theta, t) {
    const r = plumeRadiusAt(theta, radius) * t;
    const x = cx + Math.cos(theta) * r;
    const z = cz + Math.sin(theta) * r;
    const roof = stackTop(resIdx, x, z) - 6;
    const th = maxTh * Math.pow(Math.max(0, 1 - t * t), 0.75);
    return { x, z, top: roof, bot: roof - th };
  }

  const c = pt(0, 0);
  const topCenter = 0;
  pos.push(c.x, c.top, c.z);
  const topStart = 1;
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const s = pt((j / sectors) * Math.PI * 2, i / rings);
      pos.push(s.x, s.top, s.z);
    }
  }
  const botCenter = pos.length / 3;
  pos.push(c.x, c.bot, c.z);
  const botStart = pos.length / 3;
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const s = pt((j / sectors) * Math.PI * 2, i / rings);
      pos.push(s.x, s.bot, s.z);
    }
  }

  const ri = (start, i, j) => start + (i - 1) * sectors + (j % sectors);

  for (let j = 0; j < sectors; j++) idx.push(topCenter, ri(topStart, 1, j + 1), ri(topStart, 1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      idx.push(ri(topStart, i, j), ri(topStart, i, j + 1), ri(topStart, i + 1, j),
        ri(topStart, i, j + 1), ri(topStart, i + 1, j + 1), ri(topStart, i + 1, j));
    }
  }
  for (let j = 0; j < sectors; j++) idx.push(botCenter, ri(botStart, 1, j), ri(botStart, 1, j + 1));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      idx.push(ri(botStart, i, j), ri(botStart, i + 1, j), ri(botStart, i, j + 1),
        ri(botStart, i, j + 1), ri(botStart, i + 1, j), ri(botStart, i + 1, j + 1));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function buildPlume(clipPlanes) {
  const w = WELLS[0];
  const p = lonLatToWorld(w.lon, w.lat);
  const last = window.CCS.INJECTION[window.CCS.INJECTION.length - 1];
  const geo = buildPlumeGeometry(p.x, p.z, last.radius, last.thickness);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x35e0d0,
    emissive: 0x0d6b62,
    roughness: 0.35,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    clippingPlanes: clipPlanes
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'plume';
  mesh.userData = { kind: 'plume', center: p };
  return mesh;
}

/** 依年份更新羽流幾何，並同步飽和度場所使用的羽流狀態 */
function updatePlume(mesh, radius, thickness) {
  const c = mesh.userData.center;
  setPlumeState(radius, thickness);
  const geo = buildPlumeGeometry(c.x, c.z, Math.max(1, radius), Math.max(0.5, thickness));
  mesh.geometry.dispose();
  mesh.geometry = geo;
}

/* ------------------------------------------------------------------ *
 * 井
 * ------------------------------------------------------------------ */

function wellWorldPosition(wellId) {
  const w = WELLS.find((x) => x.id === wellId);
  if (!w) return null;
  const p = lonLatToWorld(w.lon, w.lat);
  return { x: p.x, z: p.z, well: w };
}

function wellPath(w) {
  const p = lonLatToWorld(w.lon, w.lat);
  const pts = [];
  const depth = w.depth;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * depth;
    let dx = 0;
    let dz = 0;
    if (w.deviation) {
      // 造斜段自 35% 深度開始，以平滑曲線偏移
      const k = Math.max(0, (t - 0.35) / 0.65);
      const s = k * k * (3 - 2 * k);
      dx = w.deviation.east * s;
      dz = -w.deviation.north * s;
    }
    pts.push(new THREE.Vector3(p.x + dx, y, p.z + dz));
  }
  return pts;
}

function buildWells(clipPlanes) {
  const group = new THREE.Group();
  group.name = 'wells';

  WELLS.forEach((w) => {
    const pts = wellPath(w);
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 64, VIEW.wellRadius, 10, false);
    const mat = new THREE.MeshStandardMaterial({
      color: w.color, roughness: 0.4, metalness: 0.7, clippingPlanes: clipPlanes
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'well-' + w.id;
    mesh.userData = { kind: 'well', data: w };
    group.add(mesh);

    // 射孔段：以加粗的環狀套管表示
    const perfPts = pts.filter((v) => v.y <= w.perf[0] && v.y >= w.perf[1]);
    if (perfPts.length > 1) {
      const pc = new THREE.CatmullRomCurve3(perfPts);
      const pg = new THREE.TubeGeometry(pc, 24, VIEW.wellRadius * 2.1, 10, false);
      const pm = new THREE.MeshStandardMaterial({
        color: 0xffd24a, emissive: 0x6b4a00, roughness: 0.35,
        metalness: 0.6, transparent: true, opacity: 0.9, clippingPlanes: clipPlanes
      });
      const pmesh = new THREE.Mesh(pg, pm);
      pmesh.name = 'perf-' + w.id;
      pmesh.userData = { kind: 'perf', data: w };
      group.add(pmesh);
    }

    // 井口設施
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(VIEW.wellRadius * 3, VIEW.wellRadius * 3.6, 34, 12),
      new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.5, metalness: 0.6, clippingPlanes: clipPlanes })
    );
    const p0 = pts[0];
    head.position.set(p0.x, 17, p0.z);
    head.userData = { kind: 'well', data: w };
    group.add(head);
  });

  return group;
}

/* ------------------------------------------------------------------ *
 * 斷層
 * ------------------------------------------------------------------ */

function buildFaults(clipPlanes) {
  const group = new THREE.Group();
  group.name = 'faults';

  FAULTS.forEach((f) => {
    const strikeRad = f.strike * D2R;
    const dipRad = f.dip * D2R;
    // 走向向量（+X 東、-Z 北）
    const sx = Math.sin(strikeRad);
    const sz = -Math.cos(strikeRad);
    // 傾向為走向右側，水平位移隨深度增加
    const dx = Math.cos(strikeRad);
    const dz = Math.sin(strikeRad);

    const pos = [];
    const idx = [];
    const nL = 40;
    const nD = 16;
    for (let i = 0; i <= nL; i++) {
      const l = (i / nL - 0.5) * f.length;
      // 斷層跡線起伏，避免呆板平面
      const wob = 120 * Math.sin(i / nL * Math.PI * 2.2 + 0.6);
      for (let j = 0; j <= nD; j++) {
        const y = f.topElev + (j / nD) * (f.botElev - f.topElev);
        const run = (f.topElev - y) / Math.tan(dipRad);
        let x = f.offsetEast + sx * l + dx * run + dx * wob * 0.2;
        let z = -f.offsetNorth + sz * l + dz * run + dz * wob * 0.2;
        // 夾在塊體輪廓內，避免斷層面伸出地層外變成一片突兀的平板
        const r = Math.hypot(x, z);
        if (r > 1e-6) {
          const lim = modelRadius(Math.atan2(z, x)) * 0.995;
          if (r > lim) { const k = lim / r; x *= k; z *= k; }
        }
        pos.push(x, y, z);
      }
    }
    for (let i = 0; i < nL; i++) {
      for (let j = 0; j < nD; j++) {
        const a = i * (nD + 1) + j;
        const b = a + 1;
        const c = a + (nD + 1);
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xff4d6d, roughness: 0.6, side: THREE.DoubleSide,
      transparent: true, opacity: 0.42, clippingPlanes: clipPlanes
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'fault-' + f.id;
    mesh.userData = { kind: 'fault', data: f };
    group.add(mesh);
  });

  return group;
}

/* ------------------------------------------------------------------ *
 * 標籤與輔助
 * ------------------------------------------------------------------ */

function makeLabel(text, opts = {}) {
  const fontSize = opts.fontSize || 44;
  const pad = 16;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${fontSize}px "Segoe UI", "Microsoft JhengHei", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  c.font = `600 ${fontSize}px "Segoe UI", "Microsoft JhengHei", sans-serif`;
  c.fillStyle = opts.bg || 'rgba(8,16,26,0.82)';
  c.strokeStyle = opts.border || 'rgba(120,180,220,0.55)';
  c.lineWidth = 2;
  const r = 10;
  c.beginPath();
  c.moveTo(r, 0); c.lineTo(w - r, 0); c.quadraticCurveTo(w, 0, w, r);
  c.lineTo(w, h - r); c.quadraticCurveTo(w, h, w - r, h);
  c.lineTo(r, h); c.quadraticCurveTo(0, h, 0, h - r);
  c.lineTo(0, r); c.quadraticCurveTo(0, 0, r, 0);
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = opts.color || '#e7eef7';
  c.textBaseline = 'middle';
  c.fillText(text, pad, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: opts.depthTest !== false, transparent: true
  }));
  const scale = opts.scale || 1;
  sprite.scale.set((w / h) * 150 * scale, 150 * scale, 1);
  return sprite;
}

/** 深度標尺 */
function buildDepthAxis() {
  const group = new THREE.Group();
  group.name = 'depth-axis';
  const x = HALF * 1.16;
  const z = HALF * 0.92;
  const bottom = HORIZONS[HORIZONS.length - 1].elev;

  const pts = [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, bottom, z)];
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.7 })
  );
  group.add(line);

  for (let d = 0; d >= bottom; d -= 400) {
    const tick = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, d, z), new THREE.Vector3(x - 130, d, z)
      ]),
      new THREE.LineBasicMaterial({ color: 0x7fa8c9, transparent: true, opacity: 0.7 })
    );
    group.add(tick);
    const lab = makeLabel(d === 0 ? '地表 0 m' : d + ' m', { fontSize: 34, scale: 0.62 });
    lab.position.set(x + 320, d, z);
    lab.userData.baseY = d;
    group.add(lab);
  }
  return group;
}

/** 地層名稱標籤：貼在塊體東南側崖面上，各層取自身厚度中點 */
function buildStrataLabels() {
  const group = new THREE.Group();
  group.name = 'strata-labels';
  const theta = -Math.PI / 4; // 東南
  const rWall = modelRadius(theta);
  const ex = Math.cos(theta) * rWall * 0.995;
  const ez = Math.sin(theta) * rWall * 0.995;
  STRATA.forEach((s, i) => {
    const top = stackTop(i, ex, ez);
    const th = thicknessAt(i, ex, ez);
    const y = top - th / 2;
    const r = rWall + 300;
    const lab = makeLabel(`${s.name}｜${s.en}`, { fontSize: 38, scale: 0.72 });
    lab.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
    lab.userData.baseY = y;
    lab.visible = th > 12;
    group.add(lab);
  });
  return group;
}

/**
 * 地表向量圖徵（許可區邊界、管線、河川）。
 * 貼在地表略上方，避免與底圖 z-fighting。
 */
function buildVectors(y = 8) {
  const group = new THREE.Group();
  group.name = 'vectors';

  const area = VECTORS.licenseArea;
  const ring = area.ring.map(([e, n]) => new THREE.Vector3(e, y, -n));
  ring.push(ring[0].clone());
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ring),
    new THREE.LineBasicMaterial({ color: area.color, transparent: true, opacity: 0.95 })
  ));

  // 半透明填充
  const shape = new THREE.Shape(area.ring.map(([e, n]) => new THREE.Vector2(e, -n)));
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: area.color, transparent: true, opacity: 0.09,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  fill.position.y = y - 2;
  fill.userData = { kind: 'vector', data: area };
  group.add(fill);

  [VECTORS.pipeline, VECTORS.river].forEach((v) => {
    const pts = v.line.map(([e, n]) => new THREE.Vector3(e, y, -n));
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: v.color, transparent: true, opacity: 0.9 })
    ));
  });

  return group;
}

/** 各地層尖滅界線在地表的投影（顯示層與層的平面分布差異） */
function buildOutlineProjections(y = 6) {
  const group = new THREE.Group();
  group.name = 'outline-proj';
  STRATA.forEach((s) => {
    if (!s.extent) return;
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const th = (i / 128) * Math.PI * 2;
      const r = Math.min(extentRadius(s, th), modelRadius(th) * 0.998);
      pts.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
    }
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.6 })
    ));
  });
  return group;
}

Object.assign(window.CCS, {
  structureShape, horizonElev, outlineRadius, outlinePoints, pinchFactor,
  modelRadius, extentRadius, extentFactor, thicknessAt, stackTop, smoothstep,
  column, rawThickness, preservation, faultOffset, faultLocal, faultTrace,
  buildStratumGeometry, buildStrata, stratumDepthAt,
  applyColorMode, refreshSaturation, vertexProps, PROP_KEYS,
  co2SaturationAt, setPlumeState, plumeState,
  buildPlumeGeometry, buildPlume, updatePlume,
  buildWells, wellWorldPosition, buildFaults,
  makeLabel, buildDepthAxis, buildStrataLabels, buildVectors, buildOutlineProjections
});
})();

