/*
 * sites.js — 候選場址定義（模擬資料，可整批以「匯入場址 JSON」取代）
 *
 * 資料性質：dataStatus = 'simulated'。每個場址的地層柱、物性與構造參數是依台灣西部與台灣海峽已發表的
 * 區域地質（Ho 1988《台灣地質概論》；中油探採資料所建立之西北部中新統—上新統地層序；Lin et al. 2003
 * 台灣海峽盆地演化；地調所/GSMMA 二氧化碳地質封存潛能調查系列）之「典型值」合成，
 * 深度、厚度、孔隙率、滲透率皆在文獻報導的範圍內，但非任何實際井或震測解釋成果。
 * 詳細假設見各場址的 basis 欄位。
 *
 * 格式：與 schema/site.schema.json 一致；座標系為場址中心為原點的局部座標（x 東、y 北，公尺），
 *       深度為海平面下深度（公尺，正值向下）。
 * 觀測井、監測站、許可區與管線為 MMV（監測、量測、驗證）規劃示意，位置依構造關係配置，非實際規劃。
 */
window.CCS_SITES = [

  // ───────────────────────────── 1. 鐵砧山枯竭氣田 ─────────────────────────────
  {
    id: 'TCS', name: '鐵砧山枯竭氣田', nameEn: 'Tiechenshan depleted gas field',
    type: 'depleted_gas', setting: 'coastal', region: '苗栗縣通霄鎮／台中市大甲區',
    location: { lon: 120.695, lat: 24.415 },
    dataStatus: 'simulated',
    description: '西部麓山帶西緣的鐵砧山背斜（斷層傳播褶皺）之上的枯竭氣田；中油規劃之 CO2 封存試驗場址。以枯竭氣層再充填為概念，封閉層為區域性錦水頁岩。',
    basis: '地層序依苗栗地區標準層序（頭嵙山層／卓蘭層／錦水頁岩／桂竹林層(上福基砂岩、十六份頁岩、魚藤坪砂岩)／南莊層／打鹿頁岩／北寮層／野柳群）；背斜振幅約 400 m、軸向 NNE，下伏東傾盲逆斷層；儲層深度 1.9–2.5 km、孔隙率 15–18%、滲透率數十至百餘 mD 為西北部中新統砂岩典型值。氣田現況壓力設為原始靜水壓之 55%。',
    references: ['Ho, C.S. (1988) An Introduction to the Geology of Taiwan (2nd ed.), CGS', '中油探採事業部 鐵砧山氣田 CO2 封存試驗規劃（公開資訊）', 'GSMMA 二氧化碳地質封存潛能調查系列報告'],
    model: { extent: [9000, 9000], grid: [64, 64], depthMax: 4500 },
    surface: { kind: 'coastal', elevation: 60, relief: [{ fold: 0, amplitude: 170 }], coastRamp: 2000, shoreElevation: 3, bathymetry: { slope: 0.003, maxDepth: 30 } },
    stratigraphy: [
      { name: '沖積層／台地堆積', nameEn: 'Alluvium & terrace deposits', age: '全新世–更新世', lithology: 'gravel-sand', role: 'overburden', top: 0, color: '#efe6cf', porosity: 0.30, permeability: 2000, ntg: 0.8, vshale: 0.2, entryPressure: 0.02 },
      { name: '頭嵙山層', nameEn: 'Toukoshan Fm', age: '更新世', lithology: 'conglomerate', role: 'overburden', top: 130, color: '#d8c08a', porosity: 0.25, permeability: 800, ntg: 0.7, vshale: 0.25, entryPressure: 0.03 },
      { name: '卓蘭層', nameEn: 'Cholan Fm', age: '上新世–更新世', lithology: 'sand-shale', role: 'secondary', top: 700, color: '#c8cfa2', porosity: 0.22, permeability: 120, ntg: 0.55, vshale: 0.45, entryPressure: 0.3 },
      { name: '錦水頁岩', nameEn: 'Chinshui Shale', age: '上新世', lithology: 'shale', role: 'seal', top: 2000, color: '#7d8f8f', porosity: 0.08, permeability: 1e-5, ntg: 0, vshale: 0.85, entryPressure: 4.5 },
      { name: '桂竹林層－上福基砂岩', nameEn: 'Kueichulin Fm – Shangfuchi Ss', age: '晚中新世', lithology: 'sandstone', role: 'reservoir', top: 2260, color: '#f1cf5e', porosity: 0.17, permeability: 85, ntg: 0.70, vshale: 0.2, entryPressure: 0.05 },
      { name: '桂竹林層－十六份頁岩', nameEn: 'Kueichulin Fm – Shihliufen Shale', age: '晚中新世', lithology: 'shale', role: 'seal', top: 2520, color: '#95a48f', porosity: 0.09, permeability: 1e-4, ntg: 0, vshale: 0.8, entryPressure: 2.5 },
      { name: '桂竹林層－魚藤坪砂岩', nameEn: 'Kueichulin Fm – Yutengping Ss', age: '晚中新世', lithology: 'sandstone', role: 'secondary', top: 2620, color: '#e5c67a', porosity: 0.15, permeability: 45, ntg: 0.65, vshale: 0.25, entryPressure: 0.08 },
      { name: '南莊層', nameEn: 'Nanchuang Fm', age: '晚中新世', lithology: 'coal-sand', role: 'overburden', top: 2900, color: '#b3a48c', porosity: 0.12, permeability: 12, ntg: 0.4, vshale: 0.5, entryPressure: 0.5 },
      { name: '打鹿頁岩', nameEn: 'Talu Shale', age: '中中新世', lithology: 'shale', role: 'seal', top: 3300, color: '#6f7f80', porosity: 0.07, permeability: 1e-5, ntg: 0, vshale: 0.9, entryPressure: 5.0 },
      { name: '北寮層（觀音山砂岩）', nameEn: 'Peiliao Fm (Kuanyinshan Ss)', age: '中中新世', lithology: 'sandstone', role: 'secondary', top: 3650, color: '#d9b34a', porosity: 0.11, permeability: 6, ntg: 0.6, vshale: 0.3, entryPressure: 0.2 },
      { name: '野柳群（未分）', nameEn: 'Yehliu Group (undiff.)', age: '早中新世', lithology: 'sand-shale', role: 'overburden', top: 4050, color: '#a89f91', porosity: 0.09, permeability: 2, ntg: 0.4, vshale: 0.55, entryPressure: 0.6 }
    ],
    structure: {
      regionalDip: { dip: 2.5, azimuth: 95 },
      folds: [
        { name: '鐵砧山背斜', nameEn: 'Tiechenshan Anticline', type: 'anticline', axisAzimuth: 25, through: [0, 0], amplitude: 420, halfWidth: 2300, shape: 'cosine',
          depthProfile: { type: 'growDown', z0: 200, z1: 2400 }, alongTaper: { center: 0, halfLength: 6000 } }
      ],
      faults: [
        { name: '鐵砧山斷層（盲逆斷層）', nameEn: 'Tiechenshan blind thrust', type: 'reverse', strike: 25, dip: 40, through: [-700, 0], zRef: 2500,
          throw: 220, tipDepth: 1500, fullThrowDepth: 2600 }
      ],
      basementTruncation: false
    },
    conditions: { surfaceTemp: 23, tempGradient: 27, pressureGradient: 10.4, fractureGradient: 17.5, maxBhpFraction: 0.9, salinity: 22000,
      stress: { svGradient: 23.5, shmaxRatio: 1.15, shminRatio: 0.82, shmaxAzimuth: 110 },
      depletion: 0.55, gasSaturation: 0.65, recoveryFactor: 0.78 },
    wells: [
      { name: 'TCS-INJ1', type: 'injection', x: 150, y: -300 },
      { name: 'TCS-OBS1', type: 'observation', x: -900, y: 1200, target: 'reservoir', note: '背斜軸部上傾側儲層壓力／飽和度監測' },
      { name: 'TCS-OBS2', type: 'observation', x: 1800, y: -1500, deviation: { east: -600, north: 400 }, target: 'aboveSeal', note: '斜井，射孔於錦水頁岩上方之卓蘭層（AZMI 洩漏預警）' }
    ],
    monitors: [
      { id: 'M-01', name: '土壤 CO₂ 通量站', kind: 'flux', x: -1500, y: -900 },
      { id: 'M-02', name: '微震監測站', kind: 'seismic', x: 2200, y: 1800 },
      { id: 'M-03', name: '淺層地下水監測井', kind: 'water', x: -2400, y: 2100 },
      { id: 'M-04', name: 'InSAR 角隅反射器', kind: 'insar', x: 900, y: -2600 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[-2600, 2400], [-600, 3000], [1800, 2600], [2900, 900], [2500, -1600], [900, -2800], [-1400, -2600], [-2900, -900]] },
      { name: 'CO₂ 輸送管線（自通霄電廠，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[-4500, 3600], [-3000, 2600], [-1500, 1200], [-500, 200], [150, -300]] }
    ],
    assessment: { injectionRate: 0.5, years: 25, efficiency: 0.02, closureFill: 0.8 , startYear: 2027 }
  },

  // ───────────────────────────── 2. 彰濱／台中港近岸鹽水層 ─────────────────────────────
  {
    id: 'CBN', name: '彰濱–台中港近岸鹽水層', nameEn: 'Changbin–Taichung coastal saline aquifer',
    type: 'saline_aquifer', setting: 'coastal', region: '彰化縣線西鄉／台中市龍井區沿海',
    location: { lon: 120.455, lat: 24.16 },
    dataStatus: 'simulated',
    description: '台中火力發電廠南側的海岸平原鹽水層場址（台電早期彰濱碳封存試驗場構想區）。前陸盆地緩東傾單斜，儲層為桂竹林層砂岩，區域封閉層為錦水頁岩；模型東南側納入彰化盲逆斷層前緣以評估斷層影響。',
    basis: '海岸平原地層序與厚度依中油鑽井區域概況：沖積層／頭嵙山層／卓蘭層／錦水頁岩（約 280 m）／桂竹林層／南莊層／打鹿頁岩／北寮層；區域傾角 3° 向東；彰化斷層以東傾 30° 盲逆斷層置於模型東緣深部（斷距 120 m，尖端 2.6 km）。孔隙率 20%、滲透率 150 mD 為桂竹林層典型值。',
    references: ['台灣電力公司 碳捕存示範計畫（台中電廠）公開資訊', 'Ho, C.S. (1988)', 'Yu, S.B. et al. 及 GSMMA 活動斷層資料（彰化斷層）'],
    model: { extent: [12000, 10000], grid: [72, 60], depthMax: 4200 },
    surface: { kind: 'coastal', elevation: 8, coastRamp: 4000, shoreElevation: 2, bathymetry: { slope: 0.0025, maxDepth: 25 } },
    stratigraphy: [
      { name: '沖積層', nameEn: 'Alluvium', age: '全新世', lithology: 'gravel-sand', role: 'overburden', top: 0, color: '#efe6cf', porosity: 0.32, permeability: 3000, ntg: 0.8, vshale: 0.2, entryPressure: 0.02 },
      { name: '頭嵙山層', nameEn: 'Toukoshan Fm', age: '更新世', lithology: 'conglomerate', role: 'overburden', top: 350, color: '#d8c08a', porosity: 0.26, permeability: 900, ntg: 0.7, vshale: 0.25, entryPressure: 0.03 },
      { name: '卓蘭層', nameEn: 'Cholan Fm', age: '上新世–更新世', lithology: 'sand-shale', role: 'secondary', top: 1100, color: '#c8cfa2', porosity: 0.23, permeability: 150, ntg: 0.5, vshale: 0.45, entryPressure: 0.3 },
      { name: '錦水頁岩', nameEn: 'Chinshui Shale', age: '上新世', lithology: 'shale', role: 'seal', top: 2300, color: '#7d8f8f', porosity: 0.08, permeability: 1e-5, ntg: 0, vshale: 0.85, entryPressure: 4.0 },
      { name: '桂竹林層', nameEn: 'Kueichulin Fm', age: '晚中新世', lithology: 'sandstone', role: 'reservoir', top: 2580, color: '#f1cf5e', porosity: 0.20, permeability: 150, ntg: 0.6, vshale: 0.3, entryPressure: 0.05 },
      { name: '南莊層', nameEn: 'Nanchuang Fm', age: '晚中新世', lithology: 'coal-sand', role: 'overburden', top: 3050, color: '#b3a48c', porosity: 0.13, permeability: 15, ntg: 0.4, vshale: 0.5, entryPressure: 0.5 },
      { name: '打鹿頁岩', nameEn: 'Talu Shale', age: '中中新世', lithology: 'shale', role: 'seal', top: 3420, color: '#6f7f80', porosity: 0.07, permeability: 1e-5, ntg: 0, vshale: 0.9, entryPressure: 5.0 },
      { name: '北寮層', nameEn: 'Peiliao Fm', age: '中中新世', lithology: 'sandstone', role: 'secondary', top: 3750, color: '#d9b34a', porosity: 0.12, permeability: 8, ntg: 0.6, vshale: 0.3, entryPressure: 0.2 },
      { name: '野柳群（未分）', nameEn: 'Yehliu Group (undiff.)', age: '早中新世', lithology: 'sand-shale', role: 'overburden', top: 4050, color: '#a89f91', porosity: 0.09, permeability: 2, ntg: 0.4, vshale: 0.55, entryPressure: 0.6 }
    ],
    structure: {
      regionalDip: { dip: 3, azimuth: 95 },
      folds: [],
      faults: [
        { name: '彰化斷層前緣（盲逆斷層）', nameEn: 'Changhua blind thrust (leading edge)', type: 'reverse', strike: 5, dip: 30, through: [4200, 0], zRef: 3500,
          throw: 120, tipDepth: 2600, fullThrowDepth: 3600 }
      ],
      basementTruncation: false
    },
    conditions: { surfaceTemp: 23, tempGradient: 28, pressureGradient: 10.4, fractureGradient: 17.0, maxBhpFraction: 0.9, salinity: 18000,
      stress: { svGradient: 23, shmaxRatio: 1.05, shminRatio: 0.78, shmaxAzimuth: 112 } },
    wells: [
      { name: 'CBN-INJ1', type: 'injection', x: -800, y: 400 },
      { name: 'CBN-OBS1', type: 'observation', x: 1500, y: -800, target: 'reservoir', note: '下傾側儲層壓力監測（單斜向東變深）' },
      { name: 'CBN-OBS2', type: 'observation', x: -2200, y: 1500, target: 'aboveSeal', note: '卓蘭層 AZMI 監測' }
    ],
    monitors: [
      { id: 'M-01', name: '土壤 CO₂ 通量站', kind: 'flux', x: 300, y: 1500 },
      { id: 'M-02', name: '微震監測站', kind: 'seismic', x: 3200, y: 2200 },
      { id: 'M-03', name: '淺層地下水監測井', kind: 'water', x: 1800, y: -2600 },
      { id: 'M-04', name: 'InSAR 角隅反射器', kind: 'insar', x: 4200, y: -1200 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[-3800, 2600], [-800, 3200], [2600, 2800], [4000, 600], [3200, -2400], [-600, -3200], [-3400, -2200], [-4200, 200]] },
      { name: 'CO₂ 輸送管線（自台中電廠，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[2400, 5000], [1600, 3200], [400, 1600], [-800, 400]] }
    ],
    assessment: { injectionRate: 1.0, years: 30, efficiency: 0.02, closureFill: 0.8 , startYear: 2030 }
  },

  // ───────────────────────────── 3. 台西盆地離岸鹽水層 ─────────────────────────────
  {
    id: 'TXB', name: '台西盆地離岸鹽水層', nameEn: 'Taihsi Basin offshore saline aquifer',
    type: 'saline_aquifer', setting: 'offshore', region: '台灣海峽中段（苗栗–台中外海約 60 km）', waterDepth: 55,
    location: { lon: 120.05, lat: 24.45 },
    dataStatus: 'simulated',
    description: '台西盆地半地塹：古近紀同裂谷楔形沉積受東南傾主生長斷層控制，中新統砂岩為主要儲層，上新統泥岩為區域封閉層。傾斜斷塊圈閉，CO2 沿層向東南上傾運移至次斷層。',
    basis: '台灣海峽地層序依中油海域探勘與 Lin et al. (2003)：更新統／上新統泥岩／上部中新統砂岩／中部中新統頁岩／下部中新統砂岩／漸新統／始新統／中生代基盤；主斷層 NE 走向、SE 傾 60°，斷距隨深度線性增至基盤 900 m（生長斷層），同裂谷層向斷層增厚 1.9–2.2 倍；儲層深度 1.2–1.6 km、孔隙率 24%、滲透率 320 mD 為海域中新統砂岩典型值；地層水鹽度 33,000 ppm。',
    references: ['Lin, A.T., Watts, A.B., Hesselbo, S.P. (2003) Basin Research 15, 453–478', '中油探採事業部 台灣海峽探勘概況（公開資訊）', 'GSMMA 海域二氧化碳地質封存潛能調查'],
    model: { extent: [16000, 14000], grid: [72, 64], depthMax: 4800 },
    surface: { kind: 'offshore', waterDepth: 55 },
    stratigraphy: [
      { name: '更新統海相碎屑岩', nameEn: 'Pleistocene marine clastics', age: '更新世', lithology: 'marine-clastics', role: 'overburden', top: 55, color: '#dfe5c8', porosity: 0.33, permeability: 500, ntg: 0.5, vshale: 0.5, entryPressure: 0.1 },
      { name: '上新統泥岩（錦水頁岩相當層）', nameEn: 'Pliocene mudstone (Chinshui eq.)', age: '上新世', lithology: 'mudstone', role: 'seal', top: 900, color: '#8c9a7e', porosity: 0.10, permeability: 1e-5, ntg: 0, vshale: 0.85, entryPressure: 3.5 },
      { name: '上部中新統砂岩（桂竹林層相當層）', nameEn: 'Upper Miocene sandstone (Kueichulin eq.)', age: '晚中新世', lithology: 'sandstone', role: 'reservoir', top: 1200, color: '#f1cf5e', porosity: 0.24, permeability: 320, ntg: 0.65, vshale: 0.25, entryPressure: 0.04 },
      { name: '中部中新統頁岩（打鹿頁岩相當層）', nameEn: 'Middle Miocene shale (Talu eq.)', age: '中中新世', lithology: 'shale', role: 'seal', top: 1600, color: '#7d8f8f', porosity: 0.09, permeability: 1e-5, ntg: 0, vshale: 0.85, entryPressure: 4.5 },
      { name: '下部中新統砂岩（北寮／木山層相當層）', nameEn: 'Lower Miocene sandstone (Peiliao/Mushan eq.)', age: '早–中中新世', lithology: 'sandstone', role: 'secondary', top: 1900, color: '#e5c67a', porosity: 0.19, permeability: 90, ntg: 0.6, vshale: 0.3, entryPressure: 0.08 },
      { name: '漸新統（同裂谷碎屑岩）', nameEn: 'Oligocene syn-rift clastics', age: '漸新世', lithology: 'sand-shale', role: 'overburden', top: 2450, color: '#b9ad9a', porosity: 0.13, permeability: 10, ntg: 0.4, vshale: 0.55, entryPressure: 0.6,
        thicknessMods: [{ type: 'wedge', fault: 0, side: 'hw', factor: 1.9, lambda: 4000 }] },
      { name: '始新統（同裂谷碎屑岩）', nameEn: 'Eocene syn-rift clastics', age: '始新世', lithology: 'sand-shale', role: 'overburden', top: 3150, color: '#a89f91', porosity: 0.10, permeability: 3, ntg: 0.35, vshale: 0.6, entryPressure: 0.8,
        thicknessMods: [{ type: 'wedge', fault: 0, side: 'hw', factor: 2.2, lambda: 3500 }] },
      { name: '中生代基盤', nameEn: 'Mesozoic basement', age: '中生代', lithology: 'basement', role: 'basement', top: 3900, color: '#c98c8c', porosity: 0.02, permeability: 0.001, ntg: 0, vshale: 0, entryPressure: 10 }
    ],
    structure: {
      regionalDip: { dip: 2.5, azimuth: 310 },
      folds: [
        { name: '橫向翹曲（沿走向閉合）', nameEn: 'Cross-structure (along-strike closure)', type: 'anticline', axisAzimuth: 130, through: [500, -200], amplitude: 70, halfWidth: 6500, shape: 'cosine' }
      ],
      faults: [
        { name: '主生長斷層 F1', nameEn: 'Main growth fault F1', type: 'normal', strike: 40, dip: 60, through: [-3500, 2500], zRef: 0,
          throw: 900, tipDepth: 650, fullThrowDepth: 3800, throwProfile: 'linear' },
        { name: '同向次斷層 F2', nameEn: 'Synthetic fault F2', type: 'normal', strike: 40, dip: 62, through: [2500, -1800], zRef: 0,
          throw: 350, tipDepth: 800, fullThrowDepth: 3600, throwProfile: 'linear' }
      ],
      basementTruncation: false
    },
    conditions: { surfaceTemp: 20, tempGradient: 30, pressureGradient: 10.5, fractureGradient: 16.5, maxBhpFraction: 0.9, salinity: 33000,
      stress: { svGradient: 22, shmaxRatio: 0.95, shminRatio: 0.68, shmaxAzimuth: 120 } },
    wells: [
      { name: 'TXB-INJ1', type: 'injection', x: 500, y: -200 },
      { name: 'TXB-OBS1', type: 'observation', x: 2800, y: -1200, target: 'reservoir', note: '上傾側（F2 斷層前）儲層壓力與飽和度監測' },
      { name: 'TXB-OBS2', type: 'observation', x: -1200, y: 1600, deviation: { east: 700, north: -500 }, target: 'reservoir', note: '斜井，監測 F1 側壓力傳遞' }
    ],
    monitors: [
      { id: 'M-01', name: '海底地震儀（OBS）', kind: 'seismic', x: -2500, y: 2500 },
      { id: 'M-02', name: '海底地震儀（OBS）', kind: 'seismic', x: 3500, y: 2000 },
      { id: 'M-03', name: '海水 pCO₂／氣泡聲納站', kind: 'flux', x: 1500, y: -3500 },
      { id: 'M-04', name: '井下壓力計（OBS1）', kind: 'pressure', x: 2800, y: -1200 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[-5000, 4500], [-1000, 5500], [4500, 4200], [6500, 800], [5500, -3800], [1500, -5800], [-3500, -5000], [-6200, -800]] },
      { name: 'CO₂ 海底輸送管線（自岸上，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[8000, -6500], [5000, -4000], [2500, -1800], [500, -200]] }
    ],
    assessment: { injectionRate: 2.0, years: 30, efficiency: 0.03, closureFill: 0.8 , startYear: 2032 }
  },

  // ───────────────────────────── 4. 長康枯竭氣田（新竹外海） ─────────────────────────────
  {
    id: 'CBK', name: '長康枯竭氣田（新竹外海）', nameEn: 'Changkang (CBK) offshore depleted gas field',
    type: 'depleted_gas', setting: 'offshore', region: '新竹外海約 20 km', waterDepth: 35,
    location: { lon: 120.66, lat: 24.90 },
    dataStatus: 'simulated',
    description: '觀音高區南翼的低幅度披覆背斜，遭東北走向正斷層切割成斷塊；中新統砂岩枯竭氣層再充填封存。',
    basis: '地層序採北部中新統命名（錦水頁岩相當層／桂竹林層相當層／打鹿頁岩相當層／北寮層–觀音山砂岩／石底層–大寮層／木山層／五指山層／基盤）；披覆背斜振幅 180 m（高斯脊、ENE 軸向），正斷層斷距 130 m；儲層深度 2.5–2.8 km、孔隙率 16%、滲透率 60 mD。氣田現況壓力設為原始壓力之 60%。',
    references: ['中油探採事業部 長康氣田公開資訊', 'Ho, C.S. (1988)'],
    model: { extent: [10000, 10000], grid: [64, 64], depthMax: 4500 },
    surface: { kind: 'offshore', waterDepth: 35 },
    stratigraphy: [
      { name: '更新統–上新統', nameEn: 'Plio-Pleistocene', age: '上新世–更新世', lithology: 'marine-clastics', role: 'overburden', top: 35, color: '#dfe5c8', porosity: 0.30, permeability: 400, ntg: 0.5, vshale: 0.5, entryPressure: 0.1 },
      { name: '錦水頁岩相當層', nameEn: 'Chinshui Shale eq.', age: '上新世', lithology: 'shale', role: 'seal', top: 1500, color: '#7d8f8f', porosity: 0.09, permeability: 1e-5, ntg: 0, vshale: 0.85, entryPressure: 3.5 },
      { name: '桂竹林層相當層', nameEn: 'Kueichulin Fm eq.', age: '晚中新世', lithology: 'sandstone', role: 'secondary', top: 1750, color: '#e5c67a', porosity: 0.21, permeability: 120, ntg: 0.6, vshale: 0.3, entryPressure: 0.06 },
      { name: '打鹿頁岩相當層', nameEn: 'Talu Shale eq.', age: '中中新世', lithology: 'shale', role: 'seal', top: 2150, color: '#6f7f80', porosity: 0.07, permeability: 1e-5, ntg: 0, vshale: 0.9, entryPressure: 5.0 },
      { name: '北寮層－觀音山砂岩', nameEn: 'Peiliao Fm – Kuanyinshan Ss', age: '中中新世', lithology: 'sandstone', role: 'reservoir', top: 2500, color: '#f1cf5e', porosity: 0.16, permeability: 60, ntg: 0.7, vshale: 0.2, entryPressure: 0.06 },
      { name: '石底層／大寮層', nameEn: 'Shihti / Taliao Fm', age: '早中新世', lithology: 'sand-shale', role: 'overburden', top: 2800, color: '#b3a48c', porosity: 0.10, permeability: 5, ntg: 0.4, vshale: 0.6, entryPressure: 0.7 },
      { name: '木山層', nameEn: 'Mushan Fm', age: '早中新世', lithology: 'sandstone', role: 'secondary', top: 3200, color: '#d9b34a', porosity: 0.12, permeability: 15, ntg: 0.55, vshale: 0.35, entryPressure: 0.2 },
      { name: '五指山層', nameEn: 'Wuchihshan Fm', age: '漸新世', lithology: 'sand-shale', role: 'overburden', top: 3700, color: '#a89f91', porosity: 0.08, permeability: 1, ntg: 0.3, vshale: 0.6, entryPressure: 0.9 },
      { name: '中生代基盤', nameEn: 'Mesozoic basement', age: '中生代', lithology: 'basement', role: 'basement', top: 4200, color: '#c98c8c', porosity: 0.02, permeability: 0.001, ntg: 0, vshale: 0, entryPressure: 10 }
    ],
    structure: {
      regionalDip: { dip: 1.5, azimuth: 330 },
      folds: [
        { name: '長康披覆背斜', nameEn: 'Changkang drape anticline', type: 'anticline', axisAzimuth: 60, through: [0, 0], amplitude: 180, halfWidth: 3200, shape: 'gaussian',
          depthProfile: { type: 'growDown', z0: 500, z1: 3000 }, alongTaper: { center: 0, halfLength: 5500 } }
      ],
      faults: [
        { name: '正斷層 F-A', nameEn: 'Normal fault F-A', type: 'normal', strike: 55, dip: 65, through: [800, -600], zRef: 0,
          throw: 130, tipDepth: 1200, fullThrowDepth: 2400, alongTaper: { center: 0, halfLength: 7000 } }
      ],
      basementTruncation: false
    },
    conditions: { surfaceTemp: 20, tempGradient: 29, pressureGradient: 10.5, fractureGradient: 16.8, maxBhpFraction: 0.9, salinity: 30000,
      stress: { svGradient: 22.5, shmaxRatio: 1.0, shminRatio: 0.72, shmaxAzimuth: 115 },
      depletion: 0.6, gasSaturation: 0.62, recoveryFactor: 0.7 },
    wells: [
      { name: 'CBK-INJ1', type: 'injection', x: -600, y: 500 },
      { name: 'CBK-OBS1', type: 'observation', x: 2200, y: -1800, target: 'reservoir', note: '正斷層 F-A 上盤側，監測斷層分隔區塊之壓力連通性' }
    ],
    monitors: [
      { id: 'M-01', name: '海底地震儀（OBS）', kind: 'seismic', x: -3000, y: -2500 },
      { id: 'M-02', name: '海水 pCO₂／氣泡聲納站', kind: 'flux', x: 1800, y: 2800 },
      { id: 'M-03', name: '井下壓力計（OBS1）', kind: 'pressure', x: 2200, y: -1800 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[-3600, 3000], [-800, 3800], [2800, 3200], [4000, 600], [3200, -2800], [-400, -3800], [-3200, -2800], [-4200, 200]] },
      { name: 'CO₂ 海底輸送管線（自新竹沿岸，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[5000, -4500], [2500, -2000], [600, -400], [-600, 500]] }
    ],
    assessment: { injectionRate: 0.6, years: 25, efficiency: 0.02, closureFill: 0.8 , startYear: 2030 }
  },

  // ───────────────────────────── 5. 台南盆地離岸鹽水層 ─────────────────────────────
  {
    id: 'TNB', name: '台南盆地離岸鹽水層', nameEn: 'Tainan Basin offshore saline aquifer',
    type: 'saline_aquifer', setting: 'offshore', region: '台南–高雄外海（澎湖水道西側）', waterDepth: 90,
    location: { lon: 120.0, lat: 22.85 },
    dataStatus: 'simulated',
    description: '台南盆地鏟狀生長斷層與滾覆背斜：上盤沿鏟狀斷層滑動形成滾覆背斜圈閉，厚層上新統泥岩（古亭坑層相當層）為區域封閉層。',
    basis: '地層序依台灣西南海域探勘概況：更新統／上新統泥岩（厚 700 m）／上部中新統砂岩／中部中新統頁岩／下部中新統砂岩／古近系同裂谷層／基盤；主斷層 ENE 走向，表層傾角 60° 至 5 km 深處減至 12°（鏟狀），斷距線性增至 650 m，上盤滾覆衰減距離 4.5 km；區域傾角 2° 向 SE，使滾覆背斜脊線落在斷層東南 3–6 km。儲層深度 2.0–2.4 km、孔隙率 22%、滲透率 220 mD。',
    references: ['Lin, A.T. et al. (2003)', '中油探採事業部 台南盆地探勘概況（公開資訊）'],
    model: { extent: [16000, 14000], grid: [72, 64], depthMax: 5200 },
    surface: { kind: 'offshore', waterDepth: 90 },
    stratigraphy: [
      { name: '更新統', nameEn: 'Pleistocene', age: '更新世', lithology: 'marine-clastics', role: 'overburden', top: 90, color: '#dfe5c8', porosity: 0.33, permeability: 600, ntg: 0.5, vshale: 0.5, entryPressure: 0.1 },
      { name: '上新統泥岩（古亭坑層相當層）', nameEn: 'Pliocene mudstone (Gutingkeng eq.)', age: '上新世', lithology: 'mudstone', role: 'seal', top: 1300, color: '#8c9a7e', porosity: 0.10, permeability: 1e-5, ntg: 0, vshale: 0.9, entryPressure: 3.5 },
      { name: '上部中新統砂岩', nameEn: 'Upper Miocene sandstone', age: '晚中新世', lithology: 'sandstone', role: 'reservoir', top: 2000, color: '#f1cf5e', porosity: 0.22, permeability: 220, ntg: 0.6, vshale: 0.3, entryPressure: 0.05 },
      { name: '中部中新統頁岩', nameEn: 'Middle Miocene shale', age: '中中新世', lithology: 'shale', role: 'seal', top: 2380, color: '#7d8f8f', porosity: 0.09, permeability: 1e-5, ntg: 0, vshale: 0.85, entryPressure: 4.5 },
      { name: '下部中新統砂岩', nameEn: 'Lower Miocene sandstone', age: '早中新世', lithology: 'sandstone', role: 'secondary', top: 2630, color: '#e5c67a', porosity: 0.17, permeability: 55, ntg: 0.55, vshale: 0.3, entryPressure: 0.1 },
      { name: '古近系（同裂谷層）', nameEn: 'Paleogene syn-rift', age: '古近紀', lithology: 'sand-shale', role: 'overburden', top: 3080, color: '#a89f91', porosity: 0.11, permeability: 4, ntg: 0.35, vshale: 0.6, entryPressure: 0.8,
        thicknessMods: [{ type: 'wedge', fault: 0, side: 'hw', factor: 2.0, lambda: 4500 }] },
      { name: '基盤', nameEn: 'Basement', age: '中生代', lithology: 'basement', role: 'basement', top: 4200, color: '#c98c8c', porosity: 0.02, permeability: 0.001, ntg: 0, vshale: 0, entryPressure: 10 }
    ],
    structure: {
      regionalDip: { dip: 2, azimuth: 150 },
      folds: [
        { name: '橫向翹曲（沿走向閉合）', nameEn: 'Cross-structure (along-strike closure)', type: 'anticline', axisAzimuth: 150, through: [1500, -1000], amplitude: 120, halfWidth: 6000, shape: 'cosine' }
      ],
      faults: [
        { name: '鏟狀生長斷層 F1', nameEn: 'Listric growth fault F1', type: 'normal', strike: 60, dip: 60, through: [-4000, 2500], zRef: 0,
          throw: 650, tipDepth: 500, fullThrowDepth: 2600, throwProfile: 'linear', listric: { detachDepth: 5000, minDip: 12 }, rollover: { lambda: 4500 }, alongTaper: { center: 1500, halfLength: 9500 } },
        { name: '同向次斷層 F2', nameEn: 'Synthetic fault F2', type: 'normal', strike: 60, dip: 62, through: [5000, -3500], zRef: 0,
          throw: 120, tipDepth: 1500, fullThrowDepth: 3000 }
      ],
      basementTruncation: false
    },
    conditions: { surfaceTemp: 18, tempGradient: 32, pressureGradient: 10.5, fractureGradient: 16.5, maxBhpFraction: 0.9, salinity: 34000,
      stress: { svGradient: 21.5, shmaxRatio: 0.9, shminRatio: 0.66, shmaxAzimuth: 125 } },
    wells: [
      { name: 'TNB-INJ1', type: 'injection', x: 1500, y: -1000 },
      { name: 'TNB-OBS1', type: 'observation', x: -1200, y: 900, target: 'reservoir', note: '滾覆背斜靠斷層側儲層監測' },
      { name: 'TNB-OBS2', type: 'observation', x: 3800, y: -2600, target: 'aboveSeal', note: '上新統泥岩上方更新統 AZMI 監測' }
    ],
    monitors: [
      { id: 'M-01', name: '海底地震儀（OBS）', kind: 'seismic', x: -3500, y: 3000 },
      { id: 'M-02', name: '海底地震儀（OBS）', kind: 'seismic', x: 4500, y: 1500 },
      { id: 'M-03', name: '海水 pCO₂／氣泡聲納站', kind: 'flux', x: 500, y: -4200 },
      { id: 'M-04', name: '井下壓力計（OBS1）', kind: 'pressure', x: -1200, y: 900 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[-4500, 4200], [-500, 5200], [4800, 4000], [6500, 500], [5500, -4200], [1500, -5800], [-3200, -5000], [-6000, -1000]] },
      { name: 'CO₂ 海底輸送管線（自興達／永安沿岸，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[8000, 2000], [5000, 800], [3000, -300], [1500, -1000]] }
    ],
    assessment: { injectionRate: 1.5, years: 30, efficiency: 0.03, closureFill: 0.8 , startYear: 2033 }
  },

  // ───────────────────────────── 6. 永安／興達近岸（泥貫入區） ─────────────────────────────
  {
    id: 'YA', name: '永安–興達近岸鹽水層（泥貫入區）', nameEn: 'Yong’an–Hsinta coastal saline aquifer (mud diapir province)',
    type: 'saline_aquifer', setting: 'coastal', region: '高雄市永安區／茄萣區沿海',
    location: { lon: 120.235, lat: 22.87 },
    dataStatus: 'simulated',
    description: '興達電廠鄰近的西南部海岸平原：厚層古亭坑層泥岩為極佳封閉層，但深部中新統砂岩儲層深、滲透率低且具超壓，並有泥貫入體與逆斷層，屬高風險場址，用於示範篩選邏輯。',
    basis: '地層序依西南部：沖積層／更新統砂泥岩（六雙層、二重溪層相當）／古亭坑層泥岩（厚 2.5 km）／中新統砂岩／中新統頁岩／古近系–基盤；泥貫入體以高斯穹隆（N–S 長軸 1.6 km、振幅 900 m）模擬，儲層面加邊緣向斜（抽離）；2.2 km 以深採 15 MPa/km 超壓梯度（古亭坑層典型）；東側置 NNE 走向東傾 45° 逆斷層（小崗山斷層型式）。',
    references: ['Ho, C.S. (1988)', '台灣西南部泥火山與泥貫入體相關研究（GSMMA、中央大學）', '台灣電力公司 興達電廠 CCS 評估（公開資訊）'],
    model: { extent: [10000, 10000], grid: [64, 64], depthMax: 5500 },
    surface: { kind: 'coastal', elevation: 6, coastRamp: 3000, shoreElevation: 2, bathymetry: { slope: 0.004, maxDepth: 30 } },
    stratigraphy: [
      { name: '沖積層', nameEn: 'Alluvium', age: '全新世', lithology: 'gravel-sand', role: 'overburden', top: 0, color: '#efe6cf', porosity: 0.34, permeability: 2500, ntg: 0.8, vshale: 0.2, entryPressure: 0.02 },
      { name: '更新統砂泥岩（六雙層／二重溪層相當）', nameEn: 'Pleistocene sand-mud (Liushuang/Erchungchi eq.)', age: '更新世', lithology: 'sand-shale', role: 'overburden', top: 250, color: '#dfe5c8', porosity: 0.27, permeability: 300, ntg: 0.45, vshale: 0.45, entryPressure: 0.2 },
      { name: '古亭坑層泥岩', nameEn: 'Gutingkeng Fm mudstone', age: '上新世–更新世', lithology: 'mudstone', role: 'seal', top: 1400, color: '#8c9a7e', porosity: 0.12, permeability: 1e-5, ntg: 0, vshale: 0.92, entryPressure: 4.0 },
      { name: '中新統砂岩', nameEn: 'Miocene sandstone', age: '中新世', lithology: 'sandstone', role: 'reservoir', top: 3900, color: '#f1cf5e', porosity: 0.12, permeability: 8, ntg: 0.55, vshale: 0.3, entryPressure: 0.15 },
      { name: '中新統頁岩', nameEn: 'Miocene shale', age: '中新世', lithology: 'shale', role: 'seal', top: 4350, color: '#7d8f8f', porosity: 0.07, permeability: 1e-5, ntg: 0, vshale: 0.9, entryPressure: 5.0 },
      { name: '古近系／基盤', nameEn: 'Paleogene / basement', age: '古近紀–中生代', lithology: 'basement', role: 'basement', top: 4900, color: '#c98c8c', porosity: 0.03, permeability: 0.01, ntg: 0, vshale: 0, entryPressure: 10 }
    ],
    structure: {
      regionalDip: { dip: 4, azimuth: 270 },
      folds: [],
      domes: [
        { name: '泥貫入體', nameEn: 'Mud diapir', kind: 'diapir', center: [1200, -800], radii: [900, 1600], azimuth: 10, amplitude: 900,
          depthProfile: { type: 'window', z0: 200, z1: 1400, z2: 1400, z3: 3200 },
          rim: { amplitude: 250, radiusFactor: 1.6, width: 0.5, depthProfile: { type: 'growDown', z0: 1400, z1: 3900 } } }
      ],
      faults: [
        { name: '逆斷層（小崗山斷層型式）', nameEn: 'Reverse fault (Hsiaokangshan-type)', type: 'reverse', strike: 20, dip: 45, through: [3800, 0], zRef: 1500,
          throw: 180, tipDepth: 600, fullThrowDepth: 1800, alongTaper: { center: 0, halfLength: 9000 } }
      ],
      basementTruncation: false
    },
    conditions: { surfaceTemp: 24, tempGradient: 24, pressureGradient: 10.4, overpressure: { startDepth: 2200, gradient: 15.0 }, fractureGradient: 17.5, maxBhpFraction: 0.9, salinity: 20000,
      stress: { svGradient: 22.5, shmaxRatio: 1.1, shminRatio: 0.8, shmaxAzimuth: 105 } },
    wells: [
      { name: 'YA-INJ1', type: 'injection', x: -1500, y: 800 },
      { name: 'YA-OBS1', type: 'observation', x: 600, y: 2200, target: 'reservoir', note: '泥貫入體北側儲層壓力監測' }
    ],
    monitors: [
      { id: 'M-01', name: '土壤 CO₂ 通量站', kind: 'flux', x: -2600, y: -400 },
      { id: 'M-02', name: '微震監測站（泥貫入體周緣）', kind: 'seismic', x: 1400, y: -2600 },
      { id: 'M-03', name: '淺層地下水監測井', kind: 'water', x: -600, y: 3200 },
      { id: 'M-04', name: 'InSAR 角隅反射器', kind: 'insar', x: 2800, y: 1800 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[-3800, 3000], [-1200, 3800], [1200, 3400], [2200, 1200], [1600, -1800], [-800, -3000], [-3200, -2400], [-4000, 200]] },
      { name: 'CO₂ 輸送管線（自興達電廠，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[-4600, -2400], [-3200, -600], [-1500, 800]] }
    ],
    assessment: { injectionRate: 0.5, years: 20, efficiency: 0.015, closureFill: 0.8 , startYear: 2030 },
    flags: ['泥貫入體', '超壓帶', '鄰近活動斷層']
  },

  // ───────────────────────────── 7. 北港高區（篩選示範：不適合） ─────────────────────────────
  {
    id: 'PKH', name: '北港高區（篩選對照）', nameEn: 'Peikang High (screening reference)',
    type: 'saline_aquifer', setting: 'onshore', region: '雲林縣口湖鄉／北港鎮',
    location: { lon: 120.30, lat: 23.62 },
    dataStatus: 'simulated',
    description: '北港基盤高區上的薄層蓋層：中新統砂岩超覆於中生代基盤而尖滅，上新統泥岩封閉層薄，儲層淺且容量小；用來對照篩選準則（深度、封閉層厚度、容量）。',
    basis: '北港高區基盤頂在雲林沿海約 1.2–2.5 km；模型以高斯穹隆（NE 長軸）抬升基盤頂至 1.25 km，中新統儲層（0.85–1.15 km）遭基盤截切而尖滅，上新統泥岩僅 90 m；地層水鹽度 8,000 ppm（淺層偏淡，低於 10,000 ppm 飲用水保護門檻）。',
    references: ['Ho, C.S. (1988)', 'Lin, A.T. et al. (2003)'],
    model: { extent: [10000, 10000], grid: [64, 64], depthMax: 3000 },
    surface: { kind: 'onshore', elevation: 5 },
    stratigraphy: [
      { name: '沖積層', nameEn: 'Alluvium', age: '全新世', lithology: 'gravel-sand', role: 'overburden', top: 0, color: '#efe6cf', porosity: 0.33, permeability: 2500, ntg: 0.8, vshale: 0.2, entryPressure: 0.02 },
      { name: '更新統（頭嵙山層相當）', nameEn: 'Pleistocene (Toukoshan eq.)', age: '更新世', lithology: 'conglomerate', role: 'overburden', top: 300, color: '#d8c08a', porosity: 0.28, permeability: 500, ntg: 0.6, vshale: 0.3, entryPressure: 0.05 },
      { name: '上新統泥岩', nameEn: 'Pliocene mudstone', age: '上新世', lithology: 'mudstone', role: 'seal', top: 760, color: '#8c9a7e', porosity: 0.12, permeability: 1e-4, ntg: 0, vshale: 0.8, entryPressure: 2.0 },
      { name: '中新統砂岩（超覆）', nameEn: 'Miocene sandstone (onlap)', age: '中新世', lithology: 'sandstone', role: 'reservoir', top: 850, color: '#f1cf5e', porosity: 0.21, permeability: 180, ntg: 0.6, vshale: 0.3, entryPressure: 0.05 },
      { name: '下部中新統／漸新統殘留層', nameEn: 'Lower Miocene–Oligocene remnant', age: '漸新世–早中新世', lithology: 'sand-shale', role: 'secondary', top: 1150, color: '#b9ad9a', porosity: 0.14, permeability: 20, ntg: 0.4, vshale: 0.5, entryPressure: 0.3 },
      { name: '中生代基盤（北港高區）', nameEn: 'Mesozoic basement (Peikang High)', age: '中生代', lithology: 'basement', role: 'basement', top: 2400, color: '#c98c8c', porosity: 0.02, permeability: 0.001, ntg: 0, vshale: 0, entryPressure: 10 }
    ],
    structure: {
      regionalDip: { dip: 1, azimuth: 300 },
      folds: [],
      domes: [
        { name: '北港基盤高區', nameEn: 'Peikang basement high', kind: 'basementHigh', center: [-1500, 500], radii: [4500, 7000], azimuth: 35, amplitude: 1150,
          depthProfile: { type: 'growDown', z0: 700, z1: 2400 } }
      ],
      faults: [],
      basementTruncation: true
    },
    conditions: { surfaceTemp: 24, tempGradient: 26, pressureGradient: 10.3, fractureGradient: 17.0, maxBhpFraction: 0.9, salinity: 8000,
      stress: { svGradient: 23, shmaxRatio: 1.05, shminRatio: 0.78, shmaxAzimuth: 110 } },
    wells: [
      { name: 'PKH-INJ1', type: 'injection', x: 2500, y: -2000 },
      { name: 'PKH-OBS1', type: 'observation', x: -800, y: -2800, target: 'reservoir', note: '基盤高區翼部儲層尖滅方向監測' }
    ],
    monitors: [
      { id: 'M-01', name: '土壤 CO₂ 通量站', kind: 'flux', x: 1200, y: -3600 },
      { id: 'M-02', name: '淺層地下水監測井', kind: 'water', x: 3800, y: -600 },
      { id: 'M-03', name: '微震監測站', kind: 'seismic', x: -2000, y: 1500 }
    ],
    vectors: [
      { name: '封存許可區（示意）', kind: 'license', color: '#1baf7a', closed: true, points: [[600, -4200], [3600, -3800], [4400, -1800], [3800, 200], [1400, 400], [-200, -1600]] },
      { name: 'CO₂ 輸送管線（自麥寮工業區，示意）', kind: 'pipeline', color: '#eb6834', closed: false, points: [[-4800, 4800], [-2400, 2000], [400, -600], [2500, -2000]] }
    ],
    assessment: { injectionRate: 0.3, years: 20, efficiency: 0.02, closureFill: 0.8 , startYear: 2030 },
    flags: ['儲層淺薄', '封閉層薄', '基盤截切']
  }
];
