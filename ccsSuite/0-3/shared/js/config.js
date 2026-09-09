window.CCS = window.CCS || {};
(function () {
'use strict';

/**
 * 場址、地層、井、羽流與底圖設定。
 * 深度一律為「海平面下為負值」的真實公尺(m)，不含垂直放大。
 */

const SITE = {
  id: 'TCS-01',
  name: '鐵砧山 CO₂ 地質封存示範場址（示意資料）',
  lat: 24.4200,
  lon: 120.6600,
  halfExtent: 3000,
  defaultZoom: 14
};

const BASEMAPS = {
  imagery: {
    label: '衛星影像',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  },
  osm: {
    label: '街道圖',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  },
  light: {
    label: '淺色圖',
    url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }
};

/**
 * 地層界面（horizon）由淺至深。
 * elev : 界面基準高程 (m)
 * amp  : 構造起伏振幅 (m)，越深越明顯（差異壓實）
 * type : conformable = 整合接觸；unconformity = 不整合面
 */
const HORIZONS = [
  { id: 'H0', name: '地表', elev: 0, amp: 0, type: 'surface' },
  { id: 'H1', name: '沖積層底／臺地礫石層頂', elev: -120, amp: 18, type: 'unconformity' },
  { id: 'H2', name: '卓蘭層底（錦水頁岩頂）', elev: -600, amp: 55, type: 'conformable' },
  { id: 'H3', name: '錦水頁岩底（桂竹林層頂）', elev: -900, amp: 78, type: 'conformable' },
  { id: 'H4', name: '桂竹林層底（上福基砂岩頂）', elev: -1200, amp: 96, type: 'conformable' },
  { id: 'H5', name: '上福基砂岩底（打鹿頁岩頂）', elev: -1650, amp: 120, type: 'conformable' },
  { id: 'H6', name: '打鹿頁岩底', elev: -1900, amp: 132, type: 'conformable' },
  { id: 'H7', name: '基盤面（角度不整合）', elev: -2200, amp: 140, type: 'unconformity' }
];

/**
 * 地層單元，index 對應 HORIZONS[i] ~ HORIZONS[i+1]。
 *
 * 不規則性參數：
 *   extent   : 平面分布範圍，**以塊體邊界 MODEL_OUTLINE 的比例表示**。
 *              scale=基準比例（1 = 剛好到塊體邊界）；harmonics=諧波[振幅, 波數, 相位]。
 *              比例 < 1 的方位代表該層在塊體內就已尖滅（上超／相變）。
 *              null 代表分布連續，直達塊體邊界。
 *   pinch    : 方向性減薄。azimuth=減薄方位(度, 0=東, 90=北)；width=影響角幅(度)；
 *              strength=最大減薄比例(0~1)；start=自塊體中心多少比例開始減薄。
 *   erosion  : 頂部剝蝕截切強度(0~1)，模擬不整合面削截。
 *
 * 岩石物理（petro，供屬性場、測井合成與容積計算使用）：
 *   phi/phiSd  : 有效孔隙度平均與標準差（小數）
 *   k/kSd      : 滲透率幾何平均 (mD) 與 log10 標準差
 *   ntg        : 淨毛比 Net-to-Gross
 *   vsh        : 平均泥質含量
 *   grClean/grShale : 純砂與純泥的自然伽瑪值 (API)
 *   rhoMa      : 基質密度 (g/cm³)；vp：基質縱波速度 (m/s)
 *   swi        : 束縛水飽和度
 *   pc         : 毛細突破壓力 (MPa)，蓋層評估用
 *   trend      : 垂向粒序 fining（向上變細）／coarsening（向上變粗）／uniform
 *
 * 最下層（基盤）一律補滿到塊體底面，上覆各層尖滅處由基盤遞補。
 */
const STRATA = [
  {
    id: 'S1', name: '沖積層', en: 'Alluvium', role: 'overburden',
    lithology: '礫石、砂與黏土互層', color: 0xd9c9a3, pattern: 'gravel',
    age: { from: 0.8, to: 0, epoch: '中／晚更新世 – 全新世' },
    depoEnv: '辮狀河道與沖積扇',
    porosity: '25 – 35 %', permeability: '500 – 2000 mD',
    petro: { phi: 0.300, phiSd: 0.040, k: 900, kSd: 0.42, ntg: 0.80, vsh: 0.20,
             grClean: 30, grShale: 120, rhoMa: 2.65, vp: 1900, swi: 0.25,
             pc: null, trend: 'uniform' },
    note: '淺層地下水體所在，屬監測保護對象。現代河谷充填，分布受古河道控制而呈狹長不規則狀。',
    extent: { scale: 1.04, harmonics: [[0.15, 2, 0.45], [0.07, 3, -1.15]] },
    pinch: { azimuth: 205, width: 130, strength: 0.75, start: 0.42 }
  },
  {
    id: 'S2', name: '卓蘭層', en: 'Cholan Fm.', role: 'overburden',
    lithology: '細砂岩與泥岩薄互層', color: 0xb9a888, pattern: 'interbed',
    age: { from: 2.6, to: 0.8, epoch: '上新世晚期 – 早更新世' },
    depoEnv: '三角洲前緣至河口灣',
    porosity: '12 – 20 %', permeability: '1 – 50 mD',
    petro: { phi: 0.160, phiSd: 0.030, k: 12, kSd: 0.55, ntg: 0.45, vsh: 0.52,
             grClean: 42, grShale: 132, rhoMa: 2.66, vp: 2600, swi: 0.45,
             pc: 0.9, trend: 'uniform' },
    note: '上覆岩層，提供額外圍壓與二次阻隔。西北側受後期抬升剝蝕而缺失。',
    extent: { scale: 1.05, harmonics: [[0.12, 2, -0.70], [0.06, 4, 1.05]] },
    pinch: { azimuth: 138, width: 105, strength: 0.55, start: 0.55 },
    erosion: 0.35
  },
  {
    id: 'S3', name: '錦水頁岩', en: 'Chinshui Shale', role: 'seal',
    lithology: '深灰色頁岩、泥岩', color: 0x4f5f6d, pattern: 'shale',
    age: { from: 5.3, to: 2.6, epoch: '晚中新世 – 上新世' },
    depoEnv: '外濱至陸棚泥質沉積',
    porosity: '4 – 8 %', permeability: '< 0.001 mD',
    petro: { phi: 0.060, phiSd: 0.012, k: 0.0005, kSd: 0.60, ntg: 0.02, vsh: 0.88,
             grClean: 48, grShale: 148, rhoMa: 2.70, vp: 3000, swi: 1.00,
             pc: 4.2, trend: 'uniform' },
    note: '主要蓋層（Caprock）。厚度約 300 m，毛細突破壓力高，為封存安全關鍵。分布連續且完整覆蓋儲層，是本場址可行性的核心條件。',
    extent: null,
    pinch: null
  },
  {
    id: 'S4', name: '桂竹林層', en: 'Kueichulin Fm.', role: 'reservoir',
    lithology: '中細粒砂岩夾薄頁岩', color: 0xc99b62, pattern: 'sandstone',
    age: { from: 7.2, to: 5.3, epoch: '晚中新世' },
    depoEnv: '臨濱砂壩與濱外過渡帶',
    porosity: '14 – 19 %', permeability: '20 – 120 mD',
    petro: { phi: 0.165, phiSd: 0.026, k: 55, kSd: 0.50, ntg: 0.55, vsh: 0.38,
             grClean: 38, grShale: 140, rhoMa: 2.66, vp: 3300, swi: 0.40,
             pc: 0.6, trend: 'coarsening' },
    note: '次要儲層，兼作蓋層上方之洩漏監測層（AZMI）。東北側砂體向濱外方向減薄。',
    extent: { scale: 1.05, harmonics: [[0.14, 2, -0.20], [0.07, 3, 1.90]] },
    pinch: { azimuth: 52, width: 120, strength: 0.68, start: 0.40 }
  },
  {
    id: 'S5', name: '上福基砂岩', en: 'Shangfuchi Sandstone', role: 'reservoir',
    lithology: '厚層中粗粒石英砂岩', color: 0xe0b877, pattern: 'sandstone',
    age: { from: 9.0, to: 7.2, epoch: '中 – 晚中新世' },
    depoEnv: '三角洲分流河道與河口壩',
    porosity: '18 – 24 %', permeability: '150 – 600 mD',
    petro: { phi: 0.210, phiSd: 0.028, k: 320, kSd: 0.45, ntg: 0.78, vsh: 0.16,
             grClean: 32, grShale: 138, rhoMa: 2.65, vp: 3600, swi: 0.32,
             pc: 0.35, trend: 'fining' },
    note: '主要封存儲層。深度 > 800 m，CO₂ 以超臨界態存在，密度約 600–750 kg/m³。砂體為三角洲朵葉，向西南方尖滅形成地層圈閉。',
    extent: { scale: 1.02, harmonics: [[0.18, 2, 2.60], [0.09, 3, -0.55]] },
    pinch: { azimuth: 232, width: 150, strength: 0.82, start: 0.34 }
  },
  {
    id: 'S6', name: '打鹿頁岩', en: 'Talu Shale', role: 'seal',
    lithology: '緻密頁岩夾粉砂岩', color: 0x46545f, pattern: 'shale',
    age: { from: 13.0, to: 9.0, epoch: '中中新世' },
    depoEnv: '陸棚外緣至半深海泥',
    porosity: '3 – 6 %', permeability: '< 0.01 mD',
    petro: { phi: 0.045, phiSd: 0.010, k: 0.004, kSd: 0.55, ntg: 0.03, vsh: 0.85,
             grClean: 50, grShale: 145, rhoMa: 2.71, vp: 3900, swi: 1.00,
             pc: 3.1, trend: 'uniform' },
    note: '底部阻隔層，限制 CO₂ 向下運移。',
    extent: null,
    pinch: null
  },
  {
    id: 'S7', name: '基盤岩', en: 'Basement', role: 'basement',
    lithology: '變質砂岩、板岩', color: 0x6a6f78, pattern: 'basement',
    age: { from: 40, to: 23, epoch: '始新世 – 漸新世' },
    depoEnv: '深埋變質（原岩為濁流岩系）',
    porosity: '< 3 %', permeability: '極低',
    petro: { phi: 0.020, phiSd: 0.006, k: 0.0002, kSd: 0.70, ntg: 0.00, vsh: 0.50,
             grClean: 60, grShale: 150, rhoMa: 2.72, vp: 5000, swi: 1.00,
             pc: 5.5, trend: 'uniform' },
    note: '力學基盤，不具封存潛能。頂面為高低起伏的古地形（基盤隆起），上覆各層尖滅處即由基盤遞補。',
    extent: null,
    pinch: null
  }
];

/** 儲層索引（CO₂ 羽流所在層）：S5 = STRATA[4]，頂界面為 HORIZONS[4] */
const RESERVOIR = { strataIndex: 4, topHorizonIndex: 4, botHorizonIndex: 5 };

/**
 * 場址地溫、壓力與流體參數（示意場址之區域經驗值）。
 * 所有梯度以「深度公尺」為基準，深度取高程之絕對值。
 */
const PETRO = {
  surfaceTemp: 24,          // 地表年均溫 (°C)
  thermalGradient: 30,      // 地溫梯度 (°C/km)
  hydrostaticGradient: 10.4,// 靜水壓力梯度 (MPa/km)，對應地層水密度約 1.06 g/cm³
  lithostaticGradient: 23.0,// 上覆岩壓梯度 (MPa/km)
  fracGradientRatio: 0.62,  // 破裂壓力 = Pp + ratio × (Sv − Pp)
  safetyFactor: 0.90,       // 最大容許注入壓力 = 0.9 × 破裂壓力
  salinity: 32000,          // 地層水鹽度 (mg/L, TDS)
  brineDensity: 1022,       // 地層水密度 (kg/m³)
  storageEfficiency: 0.12,  // 儲存效率因子 E（DOE 鹽水層 P50）
  co2Rate: 0.28,            // 設計注入速率 (Mt/yr)
  /** 屬性場的非均質性尺度（公尺）：越小越破碎 */
  heteroScale: { major: 1500, minor: 620, fine: 260 }
};

/**
 * 超臨界／液態 CO₂ 密度表 (kg/m³)，依 Span–Wagner 狀態方程取樣後線性內插。
 * 列 = 溫度 (°C)，欄 = 壓力 (MPa)。屬示意用近似值，誤差約 ±5 %。
 */
const CO2_DENSITY = {
  temps: [30, 40, 50, 60, 70, 80, 90, 100],
  press: [6, 8, 10, 12, 14, 16, 18, 20, 25, 30],
  rho: [
    [216, 680, 731, 764, 789, 810, 828, 844, 879, 908],
    [150, 278, 629, 719, 760, 788, 811, 830, 868, 899],
    [124, 214, 384, 560, 669, 722, 756, 784, 830, 865],
    [108, 180, 291, 425, 546, 630, 683, 721, 785, 828],
    [ 96, 157, 241, 338, 442, 533, 601, 653, 738, 791],
    [ 87, 140, 209, 285, 367, 447, 518, 577, 683, 751],
    [ 80, 127, 186, 249, 315, 382, 446, 505, 622, 706],
    [ 74, 117, 168, 222, 277, 334, 390, 443, 561, 657]
  ]
};

/**
 * 模型塊體的共用平面邊界（不規則）。
 * 地表與所有地層都切齊此邊界，形成一圈完整的地層剖面崖面（block diagram），
 * 各地層自身的 extent 則決定它在塊體內部尖滅到哪裡。
 */
const MODEL_OUTLINE = {
  radius: 2950,
  harmonics: [[0.17, 2, 0.35], [0.10, 3, -1.45], [0.055, 4, 2.10], [0.03, 6, 0.80], [0.018, 8, -0.55]]
};

const WELLS = [
  {
    id: 'CCS-1', name: 'CCS-1 注入井', type: 'injector',
    lat: 24.4200, lon: 120.6600, depth: -1620,
    perf: [-1260, -1600], color: 0xff7a1a,
    detail: '注入速率 0.28 Mt/yr，井口壓力 8.6 MPa，配置分散式溫度感測（DTS）與井下壓力計。'
  },
  {
    id: 'OBS-1', name: 'OBS-1 觀測井', type: 'observer',
    lat: 24.4258, lon: 120.6672, depth: -1450,
    perf: [-1210, -1400], color: 0x2ec4ff,
    detail: '儲層內壓力／溫度與流體取樣，配置井下地震檢波器陣列。'
  },
  {
    id: 'OBS-2', name: 'OBS-2 斜向觀測井', type: 'observer',
    lat: 24.4142, lon: 120.6528, depth: -1180,
    deviation: { east: 620, north: 340 }, perf: [-950, -1150], color: 0x2ec4ff,
    detail: '斜井，穿越蓋層上方之桂竹林層，作為洩漏早期預警（AZMI）監測。'
  }
];

const MONITORS = [
  { id: 'M-01', name: '地表 CO₂ 通量站', lat: 24.4246, lon: 120.6552, kind: 'flux' },
  { id: 'M-02', name: '微震監測站', lat: 24.4162, lon: 120.6668, kind: 'seismic' },
  { id: 'M-03', name: '地下水質監測井', lat: 24.4224, lon: 120.6706, kind: 'water' },
  { id: 'M-04', name: 'InSAR 地表變形角隅反射器', lat: 24.4172, lon: 120.6572, kind: 'insar' }
];

/**
 * 斷層。
 * strike/dip : 走向（度，順時針自北）與傾角（度）；傾向為走向右手側。
 * throw      : 最大垂直斷距 (m)。位移沿走向與沿傾向皆呈橢圓分布，兩端尖滅為 0。
 * sense      : normal（上盤下降）／reverse（上盤上衝）
 * damage     : 破裂帶半寬 (m)，斷距在此範圍內平滑過渡（模擬拖曳褶皺與破碎帶）
 *
 * F1 與 F2 相向傾斜，夾出中央地壘（horst），與背斜穹丘疊加構成本場址的構造圈閉。
 */
const FAULTS = [
  {
    id: 'F1', name: 'F1 正斷層（非導通）',
    strike: 32, dip: 68, sense: 'normal',
    offsetEast: 1450, offsetNorth: -260,
    length: 4200, topElev: -250, botElev: -2150,
    throw: 45, damage: 130,
    note: '最大斷距 45 m（D/L ≈ 0.011），泥岩塗抹（shale smear）發育，經現地測試判定為封閉性斷層。位移在 -250 m 以上完全消散，未切穿淺層地下水體。'
  },
  {
    id: 'F2', name: 'F2 反向正斷層（盲斷層）',
    strike: 212, dip: 62, sense: 'normal',
    offsetEast: -1150, offsetNorth: 420,
    length: 3100, topElev: -820, botElev: -2200,
    throw: 110, damage: 150,
    note: '與 F1 相向傾斜之反向（antithetic）正斷層，上端尖滅於錦水頁岩內部（-820 m），未貫穿主蓋層，屬盲斷層。斷距最大 110 m，位於上福基砂岩層位。'
  }
];

/** 注入時序：year / 累積注入量 (Mt) / 羽流半徑 (m) / 羽流最大厚度 (m) */
const INJECTION = (() => {
  const rows = [];
  const startYear = 2026;
  const endYear = 2050;
  const rate = 0.28;
  const stopYear = 2046;
  let cum = 0;
  for (let y = startYear; y <= endYear; y++) {
    if (y > startYear && y <= stopYear) cum += rate;
    const drift = y > stopYear ? (y - stopYear) * 12 : 0;
    const radius = cum > 0 ? 210 * Math.sqrt(cum / rate) + drift : 0;
    const thickness = cum > 0 ? Math.min(62, 16 + 9 * Math.sqrt(cum / rate)) : 0;
    rows.push({
      year: y,
      cumulative: +cum.toFixed(2),
      radius: +radius.toFixed(0),
      thickness: +thickness.toFixed(1),
      phase: y <= stopYear ? '注入期' : '封存後監測期'
    });
  }
  return rows;
})();

/**
 * 場址向量圖徵（示意）。用於在 3D 地表與 2D 圖台同時呈現，
 * 座標為相對場址中心的位移（公尺，東/北為正）。
 */
const VECTORS = {
  licenseArea: {
    name: '封存許可區', color: 0x35e0d0,
    ring: [
      [-2450, 1980], [-900, 2420], [960, 2280], [2180, 1520], [2620, 260],
      [2280, -1180], [1150, -2180], [-560, -2420], [-1980, -1780], [-2600, -520]
    ]
  },
  pipeline: {
    name: 'CO₂ 輸送管線', color: 0xff9d3c,
    line: [[-4200, 2600], [-2800, 2050], [-1500, 1350], [-620, 640], [0, 0]]
  },
  river: {
    name: '大安溪（示意）', color: 0x4aa3ff,
    line: [[-3000, -1450], [-1750, -1180], [-500, -1320], [820, -1080], [2050, -1420], [3000, -1250]]
  }
};

/** 3D 視覺參數 */
const VIEW = {
  verticalExaggeration: 3,
  tileZoom: 15,
  tileRadius: 3,
  wellRadius: 9,
  rings: 34,        // 不規則地層：徑向細分
  sectors: 144,     // 不規則地層：環向細分
  background: 0x0a1018
};

Object.assign(window.CCS, {
  SITE, BASEMAPS, HORIZONS, STRATA, RESERVOIR, MODEL_OUTLINE, PETRO, CO2_DENSITY,
  WELLS, MONITORS, FAULTS, INJECTION, VECTORS, VIEW
});
})();
