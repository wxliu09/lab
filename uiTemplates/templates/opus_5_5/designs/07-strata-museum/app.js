/* ==========================================================================
   澄港市立 鹽田考古遺址博物館 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒並已執行 App.scan(document)。
     頁面用 innerHTML 動態插入內容後，呼叫 App.scan(容器) 讓 data-* 元件生效（重複呼叫安全）。

   資料（全站單一來源；人名、編號、數字請從這裡取，不要另外手打）
     App.data.museum      館名、地址、電話、交通、開館時間
     App.data.layers      6 個文化層 L1–L6 {key,name,era,top,bottom,ageTop,ageBottom,munsell,soil,summary,color}
     App.data.materials   6 種材質 {pottery 陶, stone 石, bone 骨, shell 貝, metal 金屬, glass 玻璃}
     App.data.trenches    8 個探方 T1–T8 {key,x,y,status,seasons}（每方 4×4 m，x/y 為遺址座標原點）
     App.data.artifacts   31 件典藏 {id,name,layer,mat,trench,e,n,depth,size,weight,kind,dated,c14?,ce?,note,hall,found,featured?}
                          招牌文物 YT-T3-L4-017（繩紋陶罐殘件，featured:true）
     App.data.tickets     票種與票價        App.data.tours   導覽場次（10/23–11/08，週一休館）
     App.data.camp        小小考古家體驗營（含場次與名額）   App.data.zones   館區 9 個展區 A–I
     App.data.diary       田野日誌（最新消息）
     App.layer(key) / App.material(key) / App.artifact(id) / App.trench(key) / App.zone(key)
     App.artifactURL(a)   → 'artifact.html#YT-…'（artifact.html 依 hash 顯示，未帶 hash 為 017）
     App.counts()         → { layers:{L1:n…}, mats:{pottery:n…}, total }（徽章、分布圖請用它即時算）

   年代與深度
     App.TODAY = '2026-10-23'（週五）；App.date(iso) → 本地 Date
     App.depthToYear(m)   深度（公尺）→ 西元年（負數＝西元前），依層位錨點線性內插
     App.yearLabel(year)  → '西元 1683 年' 或 '距今 3,180 年'（1600 年以前改用「距今」）
     App.layerAt(m)       → 該深度所在的層位物件
     App.ageOf(a)         → 文物年代字串；App.sortYear(a) → 排序用的西元年（越小越古老）

   格式
     App.fmt.num(1286) → "1,286"   App.fmt.m(2.38) → "2.38 m"   App.fmt.md('2026-11-07') → "11/07"
     App.fmt.wd(iso) → "六"   App.fmt.wdEn(iso) → "SAT"   App.fmt.date(iso) → "2026 年 11 月 7 日（六）"   App.fmt.money(150) → "NT$150"
     App.esc(str) HTML 跳脫   App.icon(name, cls) 內嵌線條圖示 SVG 字串
       （arrow arrow-down arrow-up arrow-left close search check info clock pin ticket calendar layers
         zoom-in zoom-out reset trowel grid user）

   線描與剖面
     App.drawing(kind, { dig, title, cls, count })  文物線描 SVG 字串（viewBox 0 0 200 200，線條吃 currentColor）
       kind：cordjar sherd rim bowl spindle anping porcelain tile bottle bead coin nail hook
             adze chipped arrow jue netsinker whetstone needle pin awl bracelet shell oyster
       dig:true 會加上「從土裡刷出來」的 mask；容器（或祖先）加上 .is-dug 時顯露。
       data-reveal="dig" 的元素進場時 App 會自動加 .is-dug。
     App.artifactSVG(a, opts)  = App.drawing(a.kind, { title: a.name, ...opts })（自動帶入 a.count 顆數）
     App.artifactCardHTML(a, { headingLevel }) → .artifact-card HTML（典藏牆、相關文物共用）
     App.labelCardHTML(a)      → .labelcard HTML（編號、名稱、材質、層位、深度、探方座標、年代）
     App.profileSVG({ depth, highlight, width, height, labels }) → 小剖面柱 SVG 字串（svg.profile-col）
     App.edgePath(w, h, seed, amp) → 不規則層界 path d（上緣鋸齒、下緣填滿）
     App.rand(seed)            → 可重現的亂數函式（同 seed 同結果，讓剖面每次長得一樣）

   UI
     App.toast(msg, { tone:'ok'|'warn'|'tag', title, timeout })（modal 開著時會移進 dialog，仍在最上層）
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="dialogId"] 開啟、[data-modal-close] 關閉；點背景或 Esc 也會關
     App.tabs(tablist)         [data-tabs] 自動初始化；切換時 tablist 觸發 'tabchange'（detail: {tab, panel, index}）
     App.segmented(group)      [data-segmented] 自動初始化；觸發 'segchange'（detail: {value, button}）
     App.stepper(el)           [data-stepper] 自動初始化；改值時 input 觸發 'input' 與 'change'
     App.tooltip.show(html, clientX, clientY) / App.tooltip.hide()
     App.field.setError(input, msg) / App.field.clearError(input) / App.field.clear(form)
     App.valid.required / phone / email / int(v, min, max) / date(v)
     App.zoom(el)              .zoom 線描放大檢視（滾輪、拖曳、雙擊、+/- 按鈕）；回傳 { set(scale), reset() }
     App.searchClear(input)    .search 內的清除鈕；[data-search] 自動初始化

   動態（prefers-reduced-motion 時直接顯示終態）
     [data-reveal]             "" | "up" | "left" | "dig" | "line"；style="--rd:120ms" 錯開
     [data-count="31"]         數字遞增（data-decimals 選填）；App.countTo(el, n) 可再更新（讀最新值，可連續呼叫）
     App.animate(el, fn)       只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(t, dt)，回傳 stop()
     App.reducedMotion         目前是否要求減少動態（getter）
   ========================================================================== */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  App.clamp = clamp;

  /* ========================================================================
     1. 資料
     ======================================================================== */
  App.TODAY = '2026-10-23';

  const data = App.data = {};

  data.museum = {
    name: '澄港市立鹽田考古遺址博物館',
    short: '鹽田考古館',
    en: 'Chenggang Yantian Archaeological Site Museum',
    address: '澄港市鹽田區鹽埕路 88 號',
    phone: '(06) 2715-4800',
    email: 'visit@yantian-museum.example',
    hours: { open: '09:00', close: '17:00', lastEntry: '16:30', closedDay: 1 },
    transit: [
      { mode: '港鐵', text: '鹽田線「鹽埕站」2 號出口，沿鹽埕路步行 6 分鐘' },
      { mode: '公車', text: '市區公車 18、紅 7 於「鹽田考古館」站下車' },
      { mode: '自行車', text: '鹽埕自行車道終點，館前設停車架 40 格' },
      { mode: '開車', text: '館區無停車場，請停鹽埕市場立體停車場（步行 4 分鐘）' }
    ],
    history: [
      { year: 2009, text: '鹽埕路排水箱涵工程挖到密集貝殼層，工程暫停。' },
      { year: 2011, text: '搶救發掘開始，三年間完成 T1–T6 六個探方。' },
      { year: 2016, text: '博物館開館，T3 北壁剖面原址保存於地層剖面廳。' },
      { year: 2026, text: '秋季擴掘 T7，現場步道開放民眾參觀。' }
    ],
    registered: 1286   // 館藏登錄總件數（典藏查詢只公開其中 31 件精選）
  };

  /* 層位：top/bottom 為深度（m），ageTop/ageBottom 為西元年（負數＝西元前）。
     L3 與 L4 之間有約兩千年的沉積間斷，所以 L3 底與 L4 頂的年代不連續。 */
  data.layers = [
    { key: 'L1', name: '現代填土', en: 'Modern fill', era: '西元 1895–2026', top: 0, bottom: 0.6, ageTop: 2026, ageBottom: 1895,
      color: '#E8DCC4', munsell: '10YR 7/3', soil: '灰黃色砂質填土，夾磚瓦與鹽田瓦盤碎片',
      summary: '日治時期開闢鹽田，戰後填平成鹽埕路。一百多年的人為堆積，最上面還壓著柏油。' },
    { key: 'L2', name: '清代', en: 'Qing period', era: '西元 1683–1895', top: 0.6, bottom: 1.3, ageTop: 1895, ageBottom: 1683,
      color: '#C9A97A', munsell: '10YR 6/4', soil: '黃褐色砂質壤土，含大量蚵殼灰與瓷片',
      summary: '清代漢人漁村的生活面：青花碗、銅錢、魚鉤，還有燒蚵殼製石灰的灰坑。' },
    { key: 'L3', name: '明鄭', en: 'Koxinga period', era: '西元 1661–1683', top: 1.3, bottom: 1.8, ageTop: 1683, ageBottom: 1661,
      color: '#A07850', munsell: '7.5YR 5/4', soil: '紅褐色黏質壤土，含炭屑與板瓦',
      summary: '鄭氏時期的屯墾與港口貿易。安平壺和越洋而來的藍色玻璃珠埋在同一層。' },
    { key: 'L4', name: '新石器晚期', en: 'Late Neolithic', era: '距今 3,500–2,500 年', top: 1.8, bottom: 2.9, ageTop: -474, ageBottom: -1474,
      color: '#6E4E37', munsell: '7.5YR 4/3', soil: '暗褐色砂質黏土，含炭屑與燒土塊',
      summary: '聚落最興盛的時候：繩紋陶罐、磨製石錛、骨針與貝環，生活面上還留著柱洞。' },
    { key: 'L5', name: '新石器中期', en: 'Middle Neolithic', era: '距今 4,800–3,500 年', top: 2.9, bottom: 3.9, ageTop: -1474, ageBottom: -2774,
      color: '#4A3426', munsell: '7.5YR 3/2', soil: '黑褐色貝塚堆積，文蛤與牡蠣殼密集',
      summary: '最早的居民在沙洲上採貝、結網、捕魚，吃剩的貝殼堆成將近一公尺厚的貝塚。' },
    { key: 'L6', name: '生土', en: 'Sterile soil', era: '距今 4,800 年以前', top: 3.9, bottom: 4.2, ageTop: -2774, ageBottom: -2774,
      color: '#2C1F17', munsell: '2.5Y 4/2', soil: '灰黑色細砂與海相黏土互層，無人為遺留',
      summary: '沒有任何人類活動痕跡的自然沉積。發掘到這裡就停了——再往下，沒有人來過。' }
  ];
  data.maxDepth = 4.2;

  data.materials = [
    { key: 'pottery', name: '陶', full: '陶瓷', en: 'Ceramic' },
    { key: 'stone', name: '石', full: '石器', en: 'Stone' },
    { key: 'bone', name: '骨', full: '骨角器', en: 'Bone & antler' },
    { key: 'shell', name: '貝', full: '貝類', en: 'Shell' },
    { key: 'metal', name: '金屬', full: '金屬器', en: 'Metal' },
    { key: 'glass', name: '玻璃', full: '玻璃', en: 'Glass' }
  ];

  data.trenches = [
    { key: 'T1', x: 0, y: 4, status: '已回填', seasons: '2011' },
    { key: 'T2', x: 4, y: 4, status: '已回填', seasons: '2011–2012' },
    { key: 'T3', x: 8, y: 4, status: '北壁剖面原址保存（B 地層剖面廳）', seasons: '2011–2013' },
    { key: 'T4', x: 12, y: 4, status: '已回填', seasons: '2012' },
    { key: 'T5', x: 0, y: 0, status: '已回填', seasons: '2012–2013' },
    { key: 'T6', x: 4, y: 0, status: '已回填', seasons: '2013' },
    { key: 'T7', x: 8, y: 0, status: '2026 秋季擴掘中（G 戶外發掘步道）', seasons: '2026' },
    { key: 'T8', x: 12, y: 0, status: '保留未掘', seasons: '—' }
  ];

  /* 31 件精選典藏。e/n 為探方內座標（m，自探方西南角起算），depth 為出土深度（m）。
     史前文物以 c14（碳十四 BP、±1σ、實驗室編號）定年；歷史時期以 ce [起, 迄] 表示。 */
  data.artifacts = [
    { id: 'YT-T2-L1-006', name: '玻璃彈珠', layer: 'L1', mat: 'glass', trench: 'T2', e: 1.20, n: 2.85, depth: 0.18, size: '直徑 1.6 cm', weight: 4.1, kind: 'bead', count: 1,
      ce: [1960, 1980], note: '鹽工宿舍旁孩子們的遊戲遺留。同一層還撿到 11 顆，彩色螺旋紋各不相同。', hall: 'A', found: 2011 },
    { id: 'YT-T3-L1-009', name: '汽水玻璃瓶', layer: 'L1', mat: 'glass', trench: 'T3', e: 2.60, n: 3.40, depth: 0.28, size: '高 22.4 × 腹徑 6.1 cm', weight: 380, kind: 'bottle',
      ce: [1958, 1972], note: '瓶身浮印「澄泉汽水」，是戰後澄港本地汽水廠的產品；瓶口還留著開瓶器的撬痕。', hall: 'B', found: 2011 },
    { id: 'YT-T1-L1-003', name: '鹽田瓦盤殘片', layer: 'L1', mat: 'pottery', trench: 'T1', e: 0.80, n: 1.55, depth: 0.42, size: '殘長 18.0 × 寬 12.5 × 厚 1.8 cm', weight: 820, kind: 'tile',
      ce: [1920, 1960], note: '鋪在鹽田結晶池底的方形陶瓦，表面仍看得到鹽滷侵蝕出的白色結晶痕。', hall: 'H', found: 2011 },
    { id: 'YT-T6-L1-014', name: '鐵製鹽耙齒', layer: 'L1', mat: 'metal', trench: 'T6', e: 3.10, n: 0.70, depth: 0.51, size: '長 14.2 cm', weight: 96, kind: 'nail',
      ce: [1930, 1950], note: '木製鹽耙上的鐵齒，鏽得厲害；X 光片顯示內部仍保留方形斷面。', hall: 'H', found: 2013 },

    { id: 'YT-T2-L2-007', name: '蚵殼灰塊', layer: 'L2', mat: 'shell', trench: 'T2', e: 2.05, n: 1.10, depth: 0.75, size: '殘長 9.6 cm', weight: 142, kind: 'oyster',
      ce: [1720, 1800], note: '燒蚵殼製石灰後的殘塊，與灰坑 F2 一起出土，說明清代這裡曾有一座灰窯。', hall: 'C', found: 2012 },
    { id: 'YT-T3-L2-005', name: '青花纏枝紋碗殘片', layer: 'L2', mat: 'pottery', trench: 'T3', e: 1.40, n: 2.20, depth: 0.88, size: '殘長 7.8 × 殘寬 6.2 cm', weight: 58, kind: 'porcelain',
      ce: [1740, 1780], note: '外壁繪纏枝花卉，圈足內黏著一圈窯砂，是閩南民窯的日用碗，搭船渡海而來。', hall: 'B', found: 2012 },
    { id: 'YT-T3-L2-011', name: '乾隆通寶銅錢', layer: 'L2', mat: 'metal', trench: 'T3', e: 3.05, n: 0.95, depth: 0.94, size: '直徑 2.4 cm', weight: 3.6, kind: 'coin',
      ce: [1736, 1795], note: '方孔圓錢，背面的滿文局名清楚可辨，和青花碗殘片出在同一個生活面。', hall: 'B', found: 2012 },
    { id: 'YT-T5-L2-002', name: '醬釉硬陶罐口沿', layer: 'L2', mat: 'pottery', trench: 'T5', e: 0.55, n: 3.20, depth: 1.05, size: '殘長 11.3 × 殘高 6.8 cm', weight: 210, kind: 'rim',
      ce: [1780, 1860], note: '厚唇、外翻口沿，內外施醬褐釉。這類罐子用來醃漬魚蝦，在沿海聚落很常見。', hall: 'B', found: 2013 },
    { id: 'YT-T4-L2-019', name: '銅製魚鉤', layer: 'L2', mat: 'metal', trench: 'T4', e: 2.70, n: 2.40, depth: 1.12, size: '長 4.8 cm', weight: 5.2, kind: 'hook',
      ce: [1800, 1880], note: '倒鉤完整，鉤柄末端有綁線用的凹槽，是清代沿岸漁業最直接的證據。', hall: 'C', found: 2012 },
    { id: 'YT-T7-L2-004', name: '骨製髮簪', layer: 'L2', mat: 'bone', trench: 'T7', e: 1.85, n: 1.30, depth: 1.18, size: '長 12.6 cm', weight: 7.8, kind: 'pin',
      ce: [1820, 1890], note: '2026 年秋季 T7 擴掘的新出土品，簪首刻著簡單的回紋，尖端有長期使用的磨亮。', hall: 'G', found: 2026 },

    { id: 'YT-T4-L3-010', name: '布紋板瓦殘片', layer: 'L3', mat: 'pottery', trench: 'T4', e: 0.95, n: 2.75, depth: 1.38, size: '殘長 21.0 × 寬 16.4 cm', weight: 1140, kind: 'tile',
      ce: [1661, 1683], note: '弧形板瓦，凹面留有製坯時墊布的布紋，推測來自鄭氏時期的倉儲建築。', hall: 'B', found: 2012 },
    { id: 'YT-T3-L3-008', name: '安平壺殘件', layer: 'L3', mat: 'pottery', trench: 'T3', e: 2.20, n: 1.75, depth: 1.46, size: '殘高 16.2 × 腹徑 13.5 cm', weight: 1020, kind: 'anping',
      ce: [1661, 1683], note: '直口、豐肩、施白釉的小罐，常被用來裝酒或火藥。肩部有一道燒成時的裂紋。', hall: 'B', found: 2012 },
    { id: 'YT-T3-L3-012', name: '藍色玻璃珠串', layer: 'L3', mat: 'glass', trench: 'T3', e: 2.45, n: 1.60, depth: 1.52, size: '單珠直徑 0.4–0.6 cm，共 7 顆', weight: 2.9, kind: 'bead', count: 7,
      ce: [1650, 1683], note: '七顆鈷藍色拉製玻璃珠在 20 公分內集中出土，原本可能串在一起。成分分析指向東南亞貿易港。', hall: 'B', found: 2013 },
    { id: 'YT-T5-L3-003', name: '方頭鐵釘', layer: 'L3', mat: 'metal', trench: 'T5', e: 3.30, n: 2.10, depth: 1.61, size: '長 9.7 cm', weight: 31, kind: 'nail',
      ce: [1661, 1683], note: '鍛打的方頭方身鐵釘，釘身附著木材纖維，可能來自拆解的船板。', hall: 'D', found: 2013 },
    { id: 'YT-T6-L3-001', name: '永曆通寶銅錢', layer: 'L3', mat: 'metal', trench: 'T6', e: 1.15, n: 3.55, depth: 1.70, size: '直徑 2.6 cm', weight: 4.2, kind: 'coin',
      ce: [1651, 1683], note: '明鄭沿用南明年號鑄造的銅錢，錢文篆書，邊緣有使用磨損。', hall: 'B', found: 2013 },

    { id: 'YT-T4-L4-009', name: '貝環殘件', layer: 'L4', mat: 'shell', trench: 'T4', e: 3.40, n: 0.85, depth: 2.05, size: '外徑 7.2 × 寬 1.1 cm（殘存約 1/2）', weight: 11, kind: 'bracelet',
      c14: { bp: 2620, sd: 35, lab: 'CGU-2398' }, note: '以大型貝殼磨成的手環，內緣拋光。碳十四年代已做海洋碳庫校正。', hall: 'C', found: 2012 },
    { id: 'YT-T5-L4-031', name: '磨製石錛', layer: 'L4', mat: 'stone', trench: 'T5', e: 2.70, n: 0.40, depth: 2.21, size: '長 8.6 × 刃寬 4.1 × 厚 1.9 cm', weight: 124, kind: 'adze',
      c14: { bp: 2890, sd: 40, lab: 'CGU-2402' }, note: '橄欖石玄武岩通體磨光，單面刃。刃部的細微崩口顯示它真的被拿來砍過木頭。', hall: 'B', found: 2013 },
    { id: 'YT-T3-L4-017', name: '繩紋陶罐殘件', layer: 'L4', mat: 'pottery', trench: 'T3', e: 2.35, n: 1.10, depth: 2.38, size: '殘高 18.6 × 口徑 14.2 × 腹徑 21.0 cm', weight: 1460, kind: 'cordjar', featured: true,
      c14: { bp: 3180, sd: 40, lab: 'CGU-2417' }, note: '夾砂紅褐陶，侈口、圓腹，器身拍印細密繩紋，口沿下一道附加堆紋。罐內壁留有碳化的食物殘渣，是本館最常被借展的一件。', hall: 'B', found: 2012 },
    { id: 'YT-T2-L4-022', name: '骨針', layer: 'L4', mat: 'bone', trench: 'T2', e: 0.65, n: 2.30, depth: 2.47, size: '長 7.4 × 最寬 0.4 cm', weight: 1.2, kind: 'needle',
      c14: { bp: 3210, sd: 35, lab: 'CGU-2403' }, note: '用鹿的掌骨削磨而成，針眼由兩面對鑽。針尖完整，在整個遺址只出土 4 件。', hall: 'B', found: 2011 },
    { id: 'YT-T3-L4-030', name: '板岩石鏃', layer: 'L4', mat: 'stone', trench: 'T3', e: 3.60, n: 2.95, depth: 2.55, size: '長 5.1 × 寬 1.8 cm', weight: 6.4, kind: 'arrow',
      c14: { bp: 3240, sd: 45, lab: 'CGU-2419' }, note: '柳葉形、兩面磨薄的箭頭，基部有凹槽方便綁在箭桿上。', hall: 'B', found: 2012 },
    { id: 'YT-T3-L4-025', name: '陶紡輪', layer: 'L4', mat: 'pottery', trench: 'T3', e: 1.05, n: 0.60, depth: 2.62, size: '直徑 4.4 × 厚 1.3 cm', weight: 28, kind: 'spindle',
      c14: { bp: 3310, sd: 40, lab: 'CGU-2421' }, note: '算盤珠形，中央穿孔。說明當時已用植物纖維紡線織布。', hall: 'B', found: 2012 },
    { id: 'YT-T6-L4-014', name: '圈足陶碗', layer: 'L4', mat: 'pottery', trench: 'T6', e: 2.10, n: 1.90, depth: 2.74, size: '高 7.9 × 口徑 15.6 cm', weight: 312, kind: 'bowl',
      c14: { bp: 3380, sd: 45, lab: 'CGU-2408' }, note: '素面紅陶碗，圈足上有四個鏤孔。修復後約九成完整。', hall: 'B', found: 2013 },
    { id: 'YT-T7-L4-006', name: '玉玦', layer: 'L4', mat: 'stone', trench: 'T7', e: 2.90, n: 3.15, depth: 2.81, size: '外徑 3.2 × 厚 0.5 cm', weight: 6.7, kind: 'jue',
      c14: { bp: 3420, sd: 50, lab: 'CGU-2611' }, note: '2026 年 10 月 20 日於 T7 出土的閃玉耳飾，帶一道缺口。本遺址第二件玦飾，目前在修復室清理中。', hall: 'D', found: 2026 },

    { id: 'YT-T6-L5-002', name: '牡蠣殼', layer: 'L5', mat: 'shell', trench: 'T6', e: 0.40, n: 1.25, depth: 3.05, size: '長 11.8 × 寬 6.3 cm', weight: 64, kind: 'oyster',
      c14: { bp: 3620, sd: 40, lab: 'CGU-2405' }, note: '貝塚最上部的牡蠣殼，殼緣有被石器撬開的缺口。碳十四年代已做海洋碳庫校正。', hall: 'C', found: 2013 },
    { id: 'YT-T3-L5-008', name: '文蛤殼', layer: 'L5', mat: 'shell', trench: 'T3', e: 1.75, n: 2.60, depth: 3.12, size: '長 6.9 × 高 5.8 cm', weight: 38, kind: 'shell',
      c14: { bp: 3710, sd: 35, lab: 'CGU-2422' }, note: '貝塚裡數量最多的種類，佔貝類總重的 61%。殼頂磨損程度推測多為夏季採集。', hall: 'C', found: 2012 },
    { id: 'YT-T2-L5-004', name: '骨鏃', layer: 'L5', mat: 'bone', trench: 'T2', e: 3.25, n: 0.75, depth: 3.20, size: '長 6.2 × 寬 1.0 cm', weight: 2.8, kind: 'arrow',
      c14: { bp: 3790, sd: 45, lab: 'CGU-2404' }, note: '以獸骨磨成的三角形箭頭，尖端略有崩損。', hall: 'C', found: 2011 },
    { id: 'YT-T4-L5-012', name: '打製石錛', layer: 'L5', mat: 'stone', trench: 'T4', e: 1.60, n: 3.30, depth: 3.35, size: '長 10.4 × 刃寬 5.2 cm', weight: 210, kind: 'chipped',
      c14: { bp: 3980, sd: 50, lab: 'CGU-2410' }, note: '以河礫打剝成形，只有刃部稍加磨製，比上層的磨製石錛粗獷許多。', hall: 'C', found: 2012 },
    { id: 'YT-T3-L5-019', name: '石網墜', layer: 'L5', mat: 'stone', trench: 'T3', e: 0.70, n: 1.45, depth: 3.48, size: '長 6.8 × 寬 5.1 cm', weight: 96, kind: 'netsinker',
      c14: { bp: 4150, sd: 45, lab: 'CGU-2424' }, note: '扁平礫石兩側打出缺口，用來綁在漁網下緣。同層共出 23 件。', hall: 'C', found: 2013 },
    { id: 'YT-T5-L5-015', name: '繩紋陶片', layer: 'L5', mat: 'pottery', trench: 'T5', e: 2.15, n: 2.55, depth: 3.62, size: '殘長 6.4 × 殘寬 5.0 cm', weight: 44, kind: 'sherd',
      c14: { bp: 4330, sd: 50, lab: 'CGU-2412' }, note: '本遺址最早的陶器之一，胎土夾粗砂，繩紋比上層粗而淺。', hall: 'C', found: 2013 },
    { id: 'YT-T3-L5-021', name: '鹿角錐', layer: 'L5', mat: 'bone', trench: 'T3', e: 3.10, n: 1.85, depth: 3.71, size: '長 13.5 cm', weight: 22, kind: 'awl',
      c14: { bp: 4520, sd: 55, lab: 'CGU-2426' }, note: '取鹿角尖端磨成的錐子，可用來鑽孔或編織，握柄處被手磨得發亮。', hall: 'C', found: 2013 },
    { id: 'YT-T1-L5-011', name: '砂岩磨石', layer: 'L5', mat: 'stone', trench: 'T1', e: 2.40, n: 0.95, depth: 3.80, size: '長 15.2 × 寬 8.8 × 厚 3.6 cm', weight: 690, kind: 'whetstone',
      c14: { bp: 4710, sd: 60, lab: 'CGU-2401' }, note: '貼近生土面出土，表面有一道凹槽，是磨製骨器、石器留下的痕跡。也是遺址最深處的人工遺物。', hall: 'C', found: 2011 }
  ];

  data.tickets = [
    { key: 'full', name: '全票', price: 150, note: '一般民眾' },
    { key: 'citizen', name: '澄港市民票', price: 100, note: '憑市民卡或身分證件' },
    { key: 'concession', name: '優待票', price: 80, note: '學生、65 歲以上、軍警' },
    { key: 'group', name: '團體票', price: 120, note: '20 人以上，需於 7 日前預約' },
    { key: 'free', name: '免費', price: 0, note: '6 歲以下、身心障礙者及陪同者一名' }
  ];
  data.freeDay = '每月第一個週三全館免費';

  data.guides = ['林予安', '陳澈', '黃湘婷', '吳明哲', '蔡沛恩'];

  data.zones = [
    { key: 'A', name: '入口大廳', floor: '1F', desc: '售票、寄物、語音導覽租借。地板嵌著一條 4.2 公尺的地層色帶。' },
    { key: 'B', name: '地層剖面廳', floor: 'B1', desc: 'T3 探方北壁原址保存，六個文化層與 120 件出土文物依原位展示。' },
    { key: 'C', name: '貝塚展示廳', floor: 'B1', desc: '新石器中期貝塚的切片標本，以及漁獵、採集用具。' },
    { key: 'D', name: '文物修復室', floor: '1F', desc: '隔著玻璃看修復師清理新出土文物，週二、四 14:00 有修復師解說。' },
    { key: 'E', name: '典藏庫房', floor: 'B1', desc: '恆溫恆濕庫房，週末限額預約見學。' },
    { key: 'F', name: '小小考古家工作坊', floor: '1F', desc: '模擬探方沙坑、陶片拼對桌與線描工作台。' },
    { key: 'G', name: '戶外發掘步道', floor: '戶外', desc: '沿 T7 擴掘現場的高架步道，可看到考古隊工作（雨天暫停開放）。' },
    { key: 'H', name: '鹽田記憶園區', floor: '戶外', desc: '復原的結晶池與鹽工寮，展示日治至戰後的曬鹽工具。' },
    { key: 'I', name: '咖啡與紀念品', floor: '1F', desc: '「貝塚咖啡」與出版品、複製文物紀念品。' }
  ];

  /* 導覽場次：以日期與時段算出固定的已預約人數，讓每次開頁都一致 */
  data.tours = (function () {
    const slots = [
      { time: '10:00', title: '常設展導覽', mins: 60, cap: 25 },
      { time: '11:30', title: '地層剖面廳深度導覽', mins: 45, cap: 20 },
      { time: '14:00', title: '常設展導覽', mins: 60, cap: 25 },
      { time: '15:30', title: '典藏庫房見學', mins: 50, cap: 12, weekendOnly: true }
    ];
    const out = [];
    const start = new Date(2026, 9, 23);
    for (let i = 0; i < 17; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const wd = d.getDay();
      if (wd === 1) continue; // 週一休館
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      slots.forEach((s, si) => {
        if (s.weekendOnly && wd !== 0 && wd !== 6) return;
        const weekend = wd === 0 || wd === 6;
        const seed = (d.getDate() * 37 + si * 11 + d.getMonth() * 5) % 17;
        const ratio = Math.min(1, (weekend ? 0.55 : 0.2) + seed / (weekend ? 30 : 40) - i * 0.012);
        const booked = Math.max(0, Math.min(s.cap, Math.round(s.cap * ratio)));
        out.push({
          id: 'TR-' + iso.slice(5).replace('-', '') + '-' + s.time.replace(':', ''),
          date: iso, time: s.time, title: s.title, mins: s.mins, cap: s.cap, booked,
          guide: data.guides[(d.getDate() + si) % data.guides.length]
        });
      });
    }
    return out;
  })();

  data.camp = {
    name: '小小考古家體驗營',
    age: '7–12 歲',
    fee: 300,
    cap: 16,
    desc: '在工作坊的模擬探方裡拿起手鏟，從挖掘、刷土、記錄座標到陶片拼對，完成一張屬於自己的出土標籤卡。',
    program: [
      { time: '0:00', text: '認識地層：用透明土柱看懂「越深越老」' },
      { time: '0:30', text: '模擬探方發掘：手鏟、毛刷與座標記錄' },
      { time: '1:30', text: '陶片拼對與線描' },
      { time: '2:10', text: '製作出土標籤卡，帶回家' }
    ],
    bring: ['可弄髒的衣服與包鞋', '水壺', '家長證件（報到核對）'],
    sessions: [
      { id: 'LA-1107A', date: '2026-11-07', time: '09:30–12:00', booked: 16 },
      { id: 'LA-1107P', date: '2026-11-07', time: '14:00–16:30', booked: 11 },
      { id: 'LA-1108A', date: '2026-11-08', time: '09:30–12:00', booked: 14 },
      { id: 'LA-1114A', date: '2026-11-14', time: '09:30–12:00', booked: 7 },
      { id: 'LA-1115A', date: '2026-11-15', time: '09:30–12:00', booked: 9 },
      { id: 'LA-1115P', date: '2026-11-15', time: '14:00–16:30', booked: 3 },
      { id: 'LA-1121A', date: '2026-11-21', time: '09:30–12:00', booked: 0 },
      { id: 'LA-1122A', date: '2026-11-22', time: '09:30–12:00', booked: 2 }
    ]
  };

  data.diary = [
    { date: '2026-10-20', tag: 'T7 擴掘', title: '第 38 天：2.81 公尺深處出土玉玦', text: '在 T7 東南角的新石器晚期層找到一件帶缺口的閃玉耳飾（YT-T7-L4-006），是本遺址第二件玦飾，已送進修復室清理。' },
    { date: '2026-10-15', tag: '活動', title: '小小考古家 11 月場次開放報名', text: '11/7 起每週末共 8 場，每場 16 名。11/7 上午場已額滿，其餘場次仍可預約。' },
    { date: '2026-10-09', tag: '研究', title: '繩紋陶罐重新定年：3,180 ± 40 BP', text: '以罐內壁碳化物重新送測（CGU-2417），結果與 2013 年的木炭樣本吻合，確認 L4 聚落的年代。' },
    { date: '2026-09-12', tag: 'T7 擴掘', title: '秋季發掘開工', text: '睽違十三年再度動土。T7 預計挖到生土面為止，發掘期間戶外步道每天 10:00–16:00 開放。' }
  ];

  App.layer = key => data.layers.find(l => l.key === key);
  App.material = key => data.materials.find(m => m.key === key);
  App.artifact = id => data.artifacts.find(a => a.id === id);
  App.trench = key => data.trenches.find(t => t.key === key);
  App.zone = key => data.zones.find(z => z.key === key);
  App.artifactURL = a => 'artifact.html#' + a.id;

  App.counts = function (list) {
    const items = list || data.artifacts;
    const layers = {}, mats = {};
    data.layers.forEach(l => { layers[l.key] = 0; });
    data.materials.forEach(m => { mats[m.key] = 0; });
    items.forEach(a => { layers[a.layer]++; mats[a.mat]++; });
    return { layers, mats, total: items.length };
  };


  /* ========================================================================
     2. 年代、深度與格式
     ======================================================================== */
  App.date = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  App.layerAt = m => data.layers.find(l => m < l.bottom) || data.layers[data.layers.length - 1];

  /* 深度 → 西元年。每層內線性內插；層與層之間的年代跳躍（沉積間斷）保留不連續，
     捲動時的平滑過渡交給呼叫端去 tween，這裡只回傳「真實」的對應值。 */
  App.depthToYear = function (m) {
    const d = clamp(m, 0, data.maxDepth);
    const l = App.layerAt(d);
    const t = (d - l.top) / (l.bottom - l.top);
    return l.ageTop + (l.ageBottom - l.ageTop) * t;
  };

  App.yearLabel = function (year) {
    if (year >= 1600) return '西元 ' + Math.round(year) + ' 年';
    const bp = 2026 - year;
    // 史前用十年為單位，避免假裝精確到「一年」
    return '距今 ' + App.fmt.num(Math.round(bp / 10) * 10) + ' 年';
  };

  App.ageOf = function (a) {
    if (a.c14) return '距今 ' + App.fmt.num(a.c14.bp) + ' ± ' + a.c14.sd + ' 年';
    return a.ce[0] === a.ce[1] ? '西元 ' + a.ce[0] + ' 年' : '西元 ' + a.ce[0] + '–' + a.ce[1] + ' 年';
  };
  App.sortYear = a => a.c14 ? 2026 - a.c14.bp : (a.ce[0] + a.ce[1]) / 2;

  App.fmt = {
    num: n => Number(n).toLocaleString('en-US'),
    m: n => Number(n).toFixed(2) + ' m',
    money: n => n === 0 ? '免費' : 'NT$' + App.fmt.num(n),
    md: iso => iso.slice(5).replace('-', '/'),
    wd: iso => '日一二三四五六'[App.date(iso).getDay()],
    wdEn: iso => ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][App.date(iso).getDay()],
    date: iso => {
      const d = App.date(iso);
      return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日（' + App.fmt.wd(iso) + '）';
    },
    coord: a => 'E ' + a.e.toFixed(2) + ' · N ' + a.n.toFixed(2)
  };

  App.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* 可重現亂數（mulberry32）：剖面、層界、顆粒每次開頁都長一樣 */
  App.rand = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  let uidCounter = 0;
  App.uid = prefix => (prefix || 'yt') + '-' + (++uidCounter);

  /* 不規則層界：上緣是起伏的土層界面，下緣填滿到 h。
     用三組不同週期的正弦疊加＋細碎抖動，比純亂數更像沉積面。 */
  App.edgePath = function (w, h, seed, amp) {
    const r = App.rand(seed);
    const A = amp == null ? h * 0.42 : amp;
    const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
    const step = Math.max(8, w / 90);
    let d = 'M0 ' + h;
    for (let x = 0; x <= w + 0.1; x += step) {
      const u = x / w;
      const y = h * 0.55
        - A * 0.5 * Math.sin(u * 6.28 * 1.3 + p1)
        - A * 0.28 * Math.sin(u * 6.28 * 3.7 + p2)
        - A * 0.12 * Math.sin(u * 6.28 * 9.1 + p3)
        + (r() - 0.5) * A * 0.22;
      d += ' L' + x.toFixed(1) + ' ' + clamp(y, 1, h - 2).toFixed(1);
    }
    return d + ' L' + w + ' ' + h + ' Z';
  };


  /* ========================================================================
     3. 圖示
     ======================================================================== */
  const ICONS = {
    'arrow': '<path d="M3 8h10M9 4l4 4-4 4"/>',
    'arrow-left': '<path d="M13 8H3M7 4L3 8l4 4"/>',
    'arrow-down': '<path d="M8 3v10M4 9l4 4 4-4"/>',
    'arrow-up': '<path d="M8 13V3M4 7l4-4 4 4"/>',
    'close': '<path d="M4 4l8 8M12 4l-8 8"/>',
    'search': '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
    'check': '<path d="M3 8.5l3.2 3L13 4.5"/>',
    'info': '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2V11.5M8 4.8v.1"/>',
    'clock': '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.5V8l2.4 1.6"/>',
    'pin': '<path d="M8 14.5s-4.6-4.3-4.6-7.9a4.6 4.6 0 0 1 9.2 0c0 3.6-4.6 7.9-4.6 7.9z"/><circle cx="8" cy="6.6" r="1.6"/>',
    'ticket': '<path d="M2 5V3.5h12V5a1.8 1.8 0 0 0 0 3.6V12.5H2V8.6A1.8 1.8 0 0 0 2 5z"/><path d="M10 3.5v9" stroke-dasharray="1.4 1.4"/>',
    'calendar': '<rect x="2.2" y="3.2" width="11.6" height="10.6"/><path d="M2.2 6.6h11.6M5.2 1.8v2.8M10.8 1.8v2.8"/>',
    'layers': '<path d="M8 2l6 3-6 3-6-3 6-3z"/><path d="M2 8l6 3 6-3M2 11l6 3 6-3"/>',
    'zoom-in': '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4"/>',
    'zoom-out': '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4"/>',
    'reset': '<path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.6h2.6"/>',
    'trowel': '<path d="M9.8 2.2l4 4-6.6 3.4-0.8-0.8z"/><path d="M6.4 8.8L2.2 13"/>',
    'grid': '<rect x="2" y="2" width="12" height="12"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12"/>',
    'user': '<circle cx="8" cy="5.4" r="2.8"/><path d="M2.6 14c.6-3 2.8-4.6 5.4-4.6s4.8 1.6 5.4 4.6"/>'
  };
  App.icon = (name, cls) =>
    '<svg class="' + (cls || 'i') + '" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';


  /* ========================================================================
     4. 文物線描
     考古線圖慣例：器物以中軸虛線分左右，左半畫外觀與紋飾、右半畫剖面（實心）；
     復原的部分用虛線。所有座標在 200×200 內，線條吃 currentColor，
     主線 1.6、細部 0.8 寫在元素屬性上（通用 CSS 不碰 stroke-width）。
     ======================================================================== */
  const fine = inner => '<g stroke-width="0.8">' + inner + '</g>';
  const solid = d => '<path d="' + d + '" fill="currentColor" stroke="none"/>';
  const axis = (y0, y1) => '<path d="M100 ' + y0 + 'V' + y1 + '" stroke-width="0.6" stroke-dasharray="8 3 2 3"/>';
  const dots = (seed, n, x0, y0, w, h, r) => {
    const rnd = App.rand(seed);
    let s = '';
    for (let i = 0; i < n; i++) s += '<circle cx="' + (x0 + rnd() * w).toFixed(1) + '" cy="' + (y0 + rnd() * h).toFixed(1) + '" r="' + (r || 0.8) + '"/>';
    return '<g fill="currentColor" stroke="none">' + s + '</g>';
  };

  const DRAW = {
    cordjar() {
      // 左半外觀：口沿下附加堆紋＋拍印繩紋；左下破損以鋸齒斷口表示，虛線為復原輪廓
      let cord = '';
      for (let y = 72; y <= 126; y += 7) {
        const r = 38 + 32 * Math.sin(Math.min(1, (y - 54) / 66) * Math.PI / 2);
        for (let x = 100 - r + 6; x < 95; x += 5) cord += 'M' + x.toFixed(1) + ' ' + y + 'l3 5';
      }
      return axis(26, 188) +
        '<path d="M56 38H144"/>' +
        '<path d="M56 38C58 46 62 50 62 54C40 70 28 96 30 120L31 132"/>' +
        '<path d="M31 132L40 128L47 135L56 131L63 139L72 136L80 144L88 141L100 150" stroke-width="1.1"/>' +
        '<path d="M31 132C34 152 62 172 100 178" stroke-width="0.9" stroke-dasharray="4 3"/>' +
        '<path d="M62 63q4.5-4 9 0t9 0t9 0t9 0" stroke-width="1.2"/>' +
        '<path d="M60 58H100M61 68H100" stroke-width="0.6"/>' +
        '<path d="' + cord + '" stroke-width="0.7"/>' +
        solid('M144 38C142 46 138 50 138 54C160 70 172 96 170 120C168 148 140 172 100 178L100 172C137 167 162 145 164 120C165 97 154 72 133 56C133 52 137 47 139 40Z') +
        dots(17, 46, 112, 146, 40, 20, 0.7);
    },
    sherd() {
      const id = App.uid('clip');
      let cord = '';
      for (let x = 56; x < 230; x += 6) cord += 'M' + x + ' 36l-52 128';
      const shape = 'M48 70L86 44L132 52L158 84L150 128L118 156L72 150L44 116Z';
      return '<defs><clipPath id="' + id + '"><path d="' + shape + '"/></clipPath></defs>' +
        '<path d="' + cord + '" stroke-width="0.7" clip-path="url(#' + id + ')"/>' +
        '<path d="' + shape + '"/>' +
        solid('M172 52C180 86 180 122 172 156L166 156C173 122 173 86 166 52Z') +
        fine('<path d="M160 52h18M160 156h18" stroke-dasharray="2 2"/>');
    },
    rim() {
      return '<path d="M28 66C40 54 160 54 172 66L170 78C150 73 50 73 30 78Z"/>' +
        '<path d="M34 78C40 100 44 120 46 140L58 134L66 146L80 138L94 150L108 140L122 148L136 136L150 142L154 140C156 120 160 100 166 78"/>' +
        fine('<path d="M66 77c1 9-1 15 0 24M92 76c1 6-1 12 0 18M128 77c1 10-1 18 0 28M146 78c1 6 0 9 0 13"/><path d="M32 70C50 62 150 62 168 70" stroke-dasharray="3 3"/>') +
        solid('M184 50C192 52 194 62 189 68L186 80C184 100 186 122 188 142L183 142C180 122 180 100 182 80L180 66C179 58 180 52 184 50Z');
    },
    bowl() {
      return axis(56, 164) +
        '<path d="M24 66H176"/>' +
        '<path d="M24 66C26 104 50 130 64 136L58 154H100"/>' +
        fine('<path d="M64 136H100"/><path d="M27 86Q60 92 100 92M34 108Q66 114 100 114"/><path d="M68 141h6v8h-6zM82 141h6v8h-6z"/>') +
        solid('M176 66C174 104 150 130 136 136L142 154L133 154L130 140L100 140L100 133C138 131 168 104 171 66Z');
    },
    spindle() {
      let ring = '';
      for (let i = 0; i < 14; i++) {
        const t = i / 14 * Math.PI * 2;
        ring += '<circle cx="' + (148 + 27 * Math.cos(t)).toFixed(1) + '" cy="' + (100 + 27 * Math.sin(t)).toFixed(1) + '" r="1.3"/>';
      }
      return '<path d="M20 100L36 84H86L102 100L86 116H36Z"/>' +
        fine('<path d="M57 84V116M65 84V116" stroke-dasharray="3 2"/><path d="M36 84L44 100L36 116M86 84L78 100L86 116"/><path d="M106 84H112M106 116H112" stroke-dasharray="2 2"/>') +
        '<circle cx="148" cy="100" r="36"/><circle cx="148" cy="100" r="6"/>' +
        fine('<circle cx="148" cy="100" r="19"/>') +
        '<g fill="currentColor" stroke="none">' + ring + '</g>';
    },
    anping() {
      return axis(24, 186) +
        '<path d="M78 34H122"/>' +
        '<path d="M82 34V48C60 52 48 64 48 82C48 120 62 160 68 176H100"/>' +
        fine('<path d="M82 48H100"/><path d="M62 148q6 4 10 0t10 2t10-1t8 1" /><path d="M70 60l6 6l-2 5l5 7l-1 4"/><path d="M52 96Q76 100 100 100" stroke-dasharray="2 3"/>') +
        solid('M118 34V48C140 52 152 64 152 82C152 120 138 160 132 176H100V170H126C132 156 146 120 146 82C146 67 136 56 113 52V34Z');
    },
    porcelain() {
      const id = App.uid('clip');
      const shape = 'M40 60C80 40 130 42 166 64L158 92L170 118L140 150L96 158L62 140L50 108Z';
      const leaf = (x, y, r) => '<path d="M' + x + ' ' + y + 'q8-10 16-4q-8 10-16 4z" transform="rotate(' + r + ' ' + x + ' ' + y + ')" fill="currentColor" fill-opacity="0.35"/>';
      return '<defs><clipPath id="' + id + '"><path d="' + shape + '"/></clipPath></defs>' +
        '<g clip-path="url(#' + id + ')">' +
        fine('<path d="M46 72C84 54 128 56 160 76M48 80C86 62 128 64 158 84"/>') +
        '<path d="M40 126C64 96 92 138 116 108S154 88 176 104" stroke-width="1.1"/>' +
        '<path d="M116 108c-9-6-3-17 6-13c6 4 0 10-3 7M70 116c-6-8 2-16 9-11c5 4-1 9-4 6" stroke-width="1"/>' +
        leaf(84, 120, -20) + leaf(96, 128, 30) + leaf(130, 100, -40) + leaf(146, 96, 10) + leaf(58, 112, 60) +
        '</g>' +
        '<path d="' + shape + '"/>';
    },
    tile() {
      return '<path d="M30 80L120 52L150 72L146 80L160 82L176 92L86 124Z"/>' +
        '<path d="M30 80V94L86 138V124M86 138L176 106V92"/>' +
        fine('<path d="M60 84c6-4 14-2 16 4c-4 6-12 6-16-4zM104 70c8-3 16 0 15 6c-6 4-14 2-15-6zM118 96c5-2 10 0 10 4c-4 3-9 2-10-4z"/>') +
        dots(31, 40, 50, 66, 110, 46, 0.7);
    },
    bottle() {
      return '<path d="M90 28H110V36C108 38 108 40 108 44V66C108 82 132 88 132 104V172C132 178 128 180 122 180H78C72 180 68 178 68 172V104C68 88 92 82 92 66V44C92 40 92 38 90 36Z"/>' +
        fine('<path d="M90 33H110M92 44H108"/><rect x="78" y="118" width="44" height="34" rx="2"/>' +
          '<circle cx="100" cy="131" r="8"/><path d="M93 131q3.5-3 7 0t7 0M95 135q2.5-2 5 0t5 0M82 131h8M110 131h8"/><path d="M84 144H116" stroke-dasharray="2 2"/>' +
          '<path d="M75 108V168M97 48V70"/><path d="M70 166H130"/>');
    },
    bead(o) {
      const n = o.count || 1;
      if (n === 1) {
        return '<circle cx="100" cy="100" r="46"/>' +
          '<path d="M64 112C72 74 128 70 130 104C132 128 98 134 92 110C88 96 104 90 110 100" stroke-width="1.2"/>' +
          fine('<path d="M76 74a36 36 0 0 1 22-14"/><path d="M60 94C66 88 70 90 72 96M128 128c-8 6-16 8-24 8"/>') +
          '<circle cx="84" cy="76" r="3" fill="currentColor" stroke="none"/>';
      }
      let s = '<path d="M14 82C50 160 150 160 186 82" stroke-width="0.8" stroke-dasharray="3 2"/>';
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const ang = (155 - t * 130) * Math.PI / 180;
        const cx = 100 + 98 * Math.cos(ang), cy = 30 + 98 * Math.sin(ang) * 0.92;
        const r = 10 + (i % 3) * 1.6;
        s += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="currentColor" fill-opacity="0.22"/>' +
          '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="2.6" ry="1.6" stroke-width="0.8"/>' +
          '<path d="M' + (cx - r * 0.55).toFixed(1) + ' ' + (cy - r * 0.35).toFixed(1) + 'a' + (r * 0.7).toFixed(1) + ' ' + (r * 0.7).toFixed(1) + ' 0 0 1 ' + (r * 0.4).toFixed(1) + '-' + (r * 0.35).toFixed(1) + '" stroke-width="0.8"/>';
      }
      return s;
    },
    coin() {
      const glyph = (cx, cy, k) => {
        const g = [
          'M' + (cx - 9) + ' ' + (cy - 8) + 'h18M' + cx + ' ' + (cy - 12) + 'v24M' + (cx - 8) + ' ' + (cy + 2) + 'h16M' + (cx - 6) + ' ' + (cy + 10) + 'l12-4',
          'M' + (cx - 8) + ' ' + (cy - 10) + 'v20M' + (cx - 8) + ' ' + (cy - 10) + 'h16v20M' + (cx - 8) + ' ' + cy + 'h16M' + (cx - 4) + ' ' + (cy + 10) + 'h8',
          'M' + (cx - 10) + ' ' + (cy - 6) + 'h20M' + (cx - 6) + ' ' + (cy - 12) + 'l4 6M' + (cx + 6) + ' ' + (cy - 12) + 'l-4 6M' + (cx - 8) + ' ' + (cy + 2) + 'h16v8h-16z',
          'M' + (cx - 10) + ' ' + (cy - 10) + 'h20M' + (cx - 2) + ' ' + (cy - 10) + 'v22M' + (cx - 9) + ' ' + (cy + 1) + 'l7-5l7 5M' + (cx - 10) + ' ' + (cy + 12) + 'h20'
        ][k];
        return '<path d="' + g + '" stroke-width="1.8"/>';
      };
      return '<circle cx="100" cy="100" r="70"/>' + fine('<circle cx="100" cy="100" r="62"/>') +
        '<rect x="85" y="85" width="30" height="30"/>' + fine('<rect x="80" y="80" width="40" height="40"/>') +
        glyph(100, 52, 0) + glyph(100, 148, 1) + glyph(52, 100, 2) + glyph(148, 100, 3) +
        fine('<path d="M40 70c6-6 10-4 12 2M150 150c4-2 8 0 8 4"/><circle cx="62" cy="140" r="3"/><circle cx="140" cy="62" r="2"/>');
    },
    nail() {
      const bumps = App.rand(57);
      let b = '';
      for (let i = 0; i < 7; i++) {
        const y = 48 + i * 15 + bumps() * 6, side = i % 2 ? 1 : -1;
        b += '<circle cx="' + (100 + side * (6 - i * 0.4)).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (2 + bumps() * 2.2).toFixed(1) + '"/>';
      }
      return '<g transform="rotate(32 100 100)">' +
        '<path d="M84 22L116 21L117 31L83 33Z"/>' +
        '<path d="M92 32L108 32L104 150L100 178L96 150Z"/>' +
        fine('<path d="M100 32V168"/>' + b + '<path d="M88 52l-10 6M88 60l-10 6M88 68l-8 5"/>') +
        '</g>';
    },
    hook() {
      return '<path d="M114 30V124C114 162 58 162 58 124V92L64 84"/>' +
        '<path d="M106 30V124C106 150 66 150 66 124V112L68 104L64 84"/>' +
        '<path d="M106 30H114"/>' +
        fine('<path d="M106 38h-3M114 38h3M106 44h-3M114 44h3"/><path d="M110 30C110 20 120 14 130 18S150 10 162 16" stroke-dasharray="3 2"/><path d="M110 60V118" stroke-dasharray="1 3"/>');
    },
    adze() {
      return '<path d="M62 34H90C93 34 94 36 94 40L100 154C88 162 64 162 52 154L58 40C58 36 59 34 62 34Z"/>' +
        fine('<path d="M54 138C66 144 86 144 99 138"/><path d="M66 60l18 30M62 84l22 36M70 50l14 22" stroke-opacity="0.6"/><path d="M70 158l2-3l2 3M84 159l2-3l2 3"/><path d="M98 34H128M101 160H128" stroke-dasharray="2 3"/>') +
        '<path d="M138 34C146 34 150 38 150 46L148 140C146 150 142 158 136 164C134 150 130 140 130 130V46C130 38 132 34 138 34Z"/>' +
        fine('<path d="M131 132C138 136 144 138 149 136"/>');
    },
    chipped() {
      return '<path d="M70 30L104 26L122 40L130 72L136 110L144 150C120 170 82 172 60 156L66 120L58 86L62 54Z"/>' +
        fine('<path d="M76 40q14 10 30 2M66 70q20 12 40 0M100 60q14 16 28 10M64 100q22 14 46 4M112 100q10 20 26 18M66 130q30 16 70 6"/>' +
          '<path d="M80 46q8 4 16 0M74 78q12 6 24 0M72 110q14 6 28 0M80 138q18 8 40 2" stroke-opacity="0.55"/><path d="M64 148C90 160 120 158 142 146"/>');
    },
    arrow() {
      return '<path d="M100 24C114 56 124 90 122 120L120 156Q100 140 80 156L78 120C76 90 86 56 100 24Z"/>' +
        fine('<path d="M100 30V146"/><path d="M100 36C110 62 116 92 115 120M100 36C90 62 84 92 85 120"/><path d="M84 150l-4-8M116 150l4-8"/>');
    },
    jue() {
      return '<path d="M103.35 40.09A64 64 0 1 1 96.65 40.09L98.85 82.03A22 22 0 1 0 101.15 82.03Z"/>' +
        fine('<path d="M104.8 52.2A52 52 0 1 1 95.2 52.2M103.3 64.1A40 40 0 1 1 96.7 64.1"/><path d="M58 76a48 48 0 0 1 16-18" stroke-width="1.4"/>');
    },
    netsinker() {
      return '<path d="M100 56C134 56 158 70 158 92L148 100L158 108C158 130 134 144 100 144C66 144 42 130 42 108L52 100L42 92C42 70 66 56 100 56Z"/>' +
        dots(91, 60, 60, 66, 80, 68, 0.8) +
        fine('<path d="M26 100H52M148 100H174" stroke-dasharray="3 2"/><path d="M52 100C60 76 140 76 148 100" stroke-dasharray="3 2" stroke-opacity="0.6"/><path d="M60 82c10-10 30-14 46-12" />');
    },
    whetstone() {
      return '<path d="M30 70C30 62 36 58 44 58L156 52C164 52 170 56 170 64L172 128C172 136 166 140 158 140L46 146C38 146 32 142 32 134Z"/>' +
        '<path d="M32 134L34 150C34 158 40 162 48 162L160 156C168 156 174 152 174 144L172 128"/>' +
        fine('<path d="M50 92C80 86 120 86 152 90M50 108C80 102 120 102 152 106"/><path d="M52 100C82 94 120 94 150 98" stroke-dasharray="2 3"/>') +
        dots(77, 70, 40, 62, 126, 74, 0.6);
    },
    needle() {
      const id = App.uid('clip');
      return '<g transform="rotate(30 100 100)">' +
        '<path d="M96 24C96 18 104 18 104 24L103 150L100 186L97 150Z"/>' +
        '<ellipse cx="100" cy="34" rx="1.4" ry="4" stroke-width="1"/>' +
        fine('<path d="M100 44V150" stroke-opacity="0.5"/>') + '</g>' +
        fine('<path d="M88 52L130 43" stroke-dasharray="2 2"/>') +
        '<defs><clipPath id="' + id + '"><circle cx="58" cy="56" r="30"/></clipPath></defs>' +
        '<circle cx="58" cy="56" r="30"/>' +
        '<g clip-path="url(#' + id + ')"><path d="M46 100V40C46 28 70 28 70 40V100"/><ellipse cx="58" cy="50" rx="4" ry="10"/>' +
        fine('<path d="M50 70l16 4M50 80l16 4M50 90l16 4" stroke-opacity="0.6"/>') + '</g>';
    },
    pin() {
      return '<g transform="rotate(28 100 100)">' +
        '<path d="M93 18H107V44L103 54L101 184H99L97 54L93 44Z"/>' +
        fine('<path d="M96 22h8v6h-6v6h6v6h-8"/><path d="M100 60V176" stroke-opacity="0.5"/>') + '</g>';
    },
    awl() {
      return '<path d="M58 44C66 32 86 32 92 46C108 82 130 130 152 178C138 146 110 100 80 66C70 58 60 54 58 44Z"/>' +
        '<ellipse cx="75" cy="40" rx="17" ry="7" transform="rotate(14 75 40)"/>' +
        fine('<path d="M70 50C92 76 112 108 132 142M80 46C100 76 120 112 140 152" stroke-opacity="0.6"/><path d="M66 54l8-6M72 60l9-6M78 66l9-6"/>');
    },
    bracelet() {
      return '<path d="M31.06 107.84A70 70 0 0 1 168.94 107.84L164 113L160 108L155.15 110.28A56 56 0 0 0 44.85 110.28L40 106L36 112Z"/>' +
        fine('<path d="M38 106A64 64 0 0 1 162 106M42 108A60 60 0 0 1 158 108" stroke-dasharray="6 3"/>') +
        solid('M140 150C140 144 160 144 160 150V160C160 166 140 166 140 160Z') +
        fine('<path d="M100 120V150H136" stroke-dasharray="2 2"/>');
    },
    shell() {
      let growth = '';
      [0.84, 0.69, 0.55, 0.42, 0.3].forEach(k => {
        growth += '<path d="M36 96C24 126 40 158 76 166C92 170 108 170 124 166C160 158 176 126 164 96" transform="translate(100 44) scale(' + k + ') translate(-100 -44)" vector-effect="non-scaling-stroke"/>';
      });
      return '<path d="M100 40C118 40 150 62 164 96C176 126 160 158 124 166C108 170 92 170 76 166C40 158 24 126 36 96C50 62 82 40 100 40Z"/>' +
        fine(growth + '<path d="M100 46L100 166M100 46L60 160M100 46L140 160" stroke-opacity="0.35"/><path d="M90 44q10-8 20 0"/>');
    },
    oyster() {
      // 牡蠣殼：外緣層層翻起的鱗片（lamellae），輪廓刻意不平滑
      return '<path d="M64 34C76 22 98 26 108 38C118 48 124 44 132 56C142 70 136 80 146 92C156 108 150 120 154 134C158 152 146 170 126 176C108 182 92 178 80 172C62 164 58 150 56 134C54 116 62 106 58 90C54 72 46 60 52 48C56 40 58 38 64 34Z"/>' +
        fine('<path d="M60 62q6 4 10-1t10 2t10-3t10 3t10-1t12 6M62 88q6 5 12-1t12 3t12-3t12 3t12-2t14 8M62 114q7 5 14-1t14 3t14-3t14 3t14-1t12 6M62 140q8 5 16-1t16 3t16-3t16 3t16-1t10 4M74 162q8 4 16-1t16 2t16-2t18 2"/>' +
          '<path d="M80 40c-6 8-8 18-6 28M98 36c2 10 0 20-4 28" stroke-opacity="0.55"/><ellipse cx="84" cy="48" rx="7" ry="4.5"/>');
    }
  };

  // 刷土的五個圓（最後一個大圓保證最終完整顯露）
  const DIG_BLOBS = [[104, 96, 46], [62, 70, 44], [142, 134, 44], [66, 146, 40], [146, 60, 40], [100, 100, 150]];

  App.drawing = function (kind, opts) {
    const o = opts || {};
    let body = (DRAW[kind] || DRAW.sherd)(o);
    const label = (o.title ? App.esc(o.title) : '文物') + '線描';
    if (o.dig) {
      const id = App.uid('dig');
      const blobs = DIG_BLOBS.map((b, i) => '<circle class="dig-blob" style="--i:' + i + '" cx="' + b[0] + '" cy="' + b[1] + '" r="' + b[2] + '" fill="#fff"/>').join('');
      body = '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="-30" y="-30" width="260" height="260">' +
        '<rect x="-30" y="-30" width="260" height="260" fill="#000"/>' + blobs + '</mask></defs>' +
        '<g mask="url(#' + id + ')">' + body + '</g>' +
        '<g class="dig-dust" opacity="0.5">' + dots(kind.length * 13 + 7, 34, 30, 40, 140, 120, 1.1) + '</g>';
    }
    return '<svg class="drawing' + (o.cls ? ' ' + o.cls : '') + '" viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="' + label + '">' + body + '</svg>';
  };
  App.drawingKinds = Object.keys(DRAW);

  App.artifactSVG = (a, opts) => App.drawing(a.kind, Object.assign({ title: a.name, count: a.count }, opts));


  /* ========================================================================
     5. 共用 HTML 片段
     ======================================================================== */
  App.labelCardHTML = function (a, opts) {
    const o = opts || {};
    const l = App.layer(a.layer), m = App.material(a.mat);
    return '<div class="labelcard' + (o.cls ? ' ' + o.cls : '') + '" data-layer="' + a.layer + '">' +
      '<p class="labelcard__id"><span>' + a.id + '</span><span class="mat" data-mat="' + a.mat + '">' + m.name + '</span></p>' +
      '<p class="labelcard__name">' + App.esc(a.name) + '</p>' +
      '<dl class="labelcard__rows">' +
        '<dt>層位</dt><dd>' + l.key + ' ' + l.name + '</dd>' +
        '<dt>出土</dt><dd>' + a.trench + ' · ' + App.fmt.m(a.depth) + '（' + App.fmt.coord(a) + '）</dd>' +
        '<dt>年代</dt><dd>' + App.ageOf(a) + '</dd>' +
      '</dl></div>';
  };

  App.artifactCardHTML = function (a, opts) {
    const o = opts || {};
    const h = 'h' + (o.headingLevel || 3);
    const l = App.layer(a.layer), m = App.material(a.mat);
    return '<a class="artifact-card" href="' + App.artifactURL(a) + '" data-layer="' + a.layer + '" data-id="' + a.id + '">' +
      '<div class="artifact-card__art"><span class="tag tag--sm artifact-card__layer">' + l.key + ' ' + l.name + '</span>' +
        App.artifactSVG(a) + '</div>' +
      '<div class="artifact-card__body">' +
        '<p class="artifact-card__id">' + a.id + '</p>' +
        '<' + h + ' class="artifact-card__name">' + App.esc(a.name) + '</' + h + '>' +
        '<p class="artifact-card__meta"><span class="mat" data-mat="' + a.mat + '">' + m.full + '</span><span>' + App.fmt.m(a.depth) + ' · ' + App.ageOf(a) + '</span></p>' +
      '</div></a>';
  };

  /* 小剖面柱：六層依厚度比例堆疊，層界不規則；depth 會畫出橘色出土位置標記 */
  App.profileSVG = function (opts) {
    const o = Object.assign({ depth: null, highlight: null, width: 160, height: 320, labels: true }, opts);
    const padL = 34, padR = o.labels ? 58 : 6, padT = 6, padB = 6;
    const colW = o.width - padL - padR, colH = o.height - padT - padB;
    const y = m => padT + m / data.maxDepth * colH;
    let s = '';
    data.layers.forEach((l, i) => {
      const r = App.rand(101 + i * 17);
      let d = 'M' + padL + ' ' + y(l.top).toFixed(1);
      if (i > 0) {
        for (let x = padL; x <= padL + colW + 0.1; x += colW / 10) {
          d += ' L' + x.toFixed(1) + ' ' + (y(l.top) + (r() - 0.5) * 5).toFixed(1);
        }
      } else {
        d += ' H' + (padL + colW);
      }
      d += ' V' + (padT + colH) + ' H' + padL + ' Z';
      s += '<path d="' + d + '" fill="' + l.color + '"/>';
    });
    // 探方線白
    for (let k = 1; k < 4; k++) {
      const x = padL + colW * k / 4;
      s += '<path d="M' + x.toFixed(1) + ' ' + padT + 'V' + (padT + colH) + '" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/>';
    }
    s += '<rect x="' + padL + '" y="' + padT + '" width="' + colW + '" height="' + colH + '" fill="none" stroke="#22160E" stroke-width="1"/>';
    // 深度刻度
    for (let m = 0; m <= 4; m++) {
      s += '<path d="M' + (padL - 5) + ' ' + y(m).toFixed(1) + 'H' + padL + '" stroke="#22160E" stroke-width="1"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y(m) + 3).toFixed(1) + '" font-size="9" text-anchor="end" fill="#6B5643">' + m + ' m</text>';
    }
    if (o.labels) {
      data.layers.forEach(l => {
        const mid = (y(l.top) + y(l.bottom)) / 2;
        const hi = o.highlight === l.key;
        s += '<text x="' + (padL + colW + 8) + '" y="' + (mid + 3).toFixed(1) + '" font-size="9.5" fill="' + (hi ? '#A8401A' : '#47372A') + '" font-weight="' + (hi ? 700 : 500) + '">' + l.key + (hi ? ' ◂' : '') + '</text>';
      });
    }
    if (o.highlight) {
      const l = App.layer(o.highlight);
      s += '<rect x="' + (padL + 1) + '" y="' + (y(l.top) + 1).toFixed(1) + '" width="' + (colW - 2) + '" height="' + (y(l.bottom) - y(l.top) - 2).toFixed(1) + '" fill="none" stroke="#E8642C" stroke-width="2" stroke-dasharray="5 3"/>';
    }
    if (o.depth != null) {
      const yy = y(o.depth).toFixed(1);
      s += '<path d="M' + (padL - 4) + ' ' + yy + 'H' + (padL + colW + 4) + '" stroke="#E8642C" stroke-width="2.4"/>' +
        '<circle cx="' + (padL + colW * 0.58).toFixed(1) + '" cy="' + yy + '" r="5" fill="#E8642C" stroke="#22160E" stroke-width="1"/>';
    }
    return '<svg class="profile-col" viewBox="0 0 ' + o.width + ' ' + o.height + '" role="img" aria-label="地層剖面柱' +
      (o.depth != null ? '，出土深度 ' + o.depth.toFixed(2) + ' 公尺' : '') + '">' + s + '</svg>';
  };


  /* ========================================================================
     6. UI：toast、modal、tabs、segmented、stepper、表單、tooltip、zoom
     ======================================================================== */
  let toastHost = null;
  function toastContainer() {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
    }
    // showModal 會把 dialog 放進 top layer，掛在 body 的 toast 會被蓋住，所以跟著開啟中的 dialog 走
    const open = [...document.querySelectorAll('dialog[open]')].pop();
    const parent = open || document.body;
    if (toastHost.parentNode !== parent) parent.appendChild(toastHost);
    return toastHost;
  }
  document.addEventListener('close', e => {
    if (toastHost && e.target.contains(toastHost)) document.body.appendChild(toastHost);
  }, true);

  App.toast = function (msg, opts) {
    const o = opts || {};
    const host = toastContainer();
    const el = document.createElement('div');
    el.className = 'toast' + (o.tone ? ' toast--' + o.tone : '');
    const icon = o.tone === 'ok' ? 'check' : o.tone === 'warn' ? 'info' : 'trowel';
    el.innerHTML = App.icon(icon, 'toast__icon') +
      '<div>' + (o.title ? '<strong class="toast__title">' + App.esc(o.title) + '</strong>' : '') + App.esc(msg) + '</div>' +
      '<button class="toast__close" type="button" aria-label="關閉通知">' + App.icon('close') + '</button>';
    host.appendChild(el);
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      if (App.reducedMotion) { el.remove(); return; }
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    el.querySelector('.toast__close').addEventListener('click', remove);
    setTimeout(remove, o.timeout || 4200);
    while (host.children.length > 4) host.firstElementChild.remove();
    return el;
  };

  const getDialog = d => typeof d === 'string' ? document.getElementById(d) : d;
  App.modal = {
    open(d) {
      const dlg = getDialog(d);
      if (!dlg || dlg.open) return dlg;
      dlg.showModal();
      dlg.dispatchEvent(new CustomEvent('modalopen'));
      return dlg;
    },
    close(d) {
      const dlg = d ? getDialog(d) : [...document.querySelectorAll('dialog[open]')].pop();
      if (dlg && dlg.open) dlg.close();
    }
  };
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { e.preventDefault(); App.modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { App.modal.close(closer.closest('dialog')); return; }
    // 點 dialog 本身（不是內容）＝點到背景
    if (e.target.tagName === 'DIALOG' && e.target.open) { e.target.close(); return; }
    const t = e.target.closest('[data-toast]');
    if (t) App.toast(t.dataset.toast, { tone: t.dataset.toastTone, title: t.dataset.toastTitle });
  });
  // 頁內錨點平滑捲動：不用 CSS scroll-behavior，避免程式呼叫的 scrollTo 也被拖成動畫
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2 || e.defaultPrevented) return;
    const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: App.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    // 焦點跟著移過去（跳到主要內容、回到某一層），鍵盤使用者才不會被留在原處
    if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    history.pushState(null, '', a.getAttribute('href'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const dlg = [...document.querySelectorAll('dialog[open]')].pop();
      if (dlg) dlg.close();
    }
  });

  App.tabs = function (list) {
    if (list.dataset.tabsReady) return;
    list.dataset.tabsReady = '1';
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) {
          p.hidden = !on;
          if (on) { p.classList.remove('is-entering'); void p.offsetWidth; p.classList.add('is-entering'); }
        }
      });
      if (focus) tab.focus();
      list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: document.getElementById(tab.getAttribute('aria-controls')), index: tabs.indexOf(tab) } }));
    };
    tabs.forEach(t => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        const i = tabs.indexOf(t);
        const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] :
          e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    const initial = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
    tabs.forEach(t => {
      const on = t === initial;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
    list.select = t => select(typeof t === 'number' ? tabs[t] : t);
  };

  App.segmented = function (group) {
    if (group.dataset.segReady) return;
    group.dataset.segReady = '1';
    group.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !group.contains(b)) return;
      group.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      group.dispatchEvent(new CustomEvent('segchange', { detail: { value: b.dataset.value, button: b } }));
    });
  };

  App.stepper = function (el) {
    if (el.dataset.stepReady) return;
    el.dataset.stepReady = '1';
    const input = el.querySelector('input');
    const minus = el.querySelector('[data-step="-1"]'), plus = el.querySelector('[data-step="1"]');
    const min = Number(input.min || 0), max = Number(input.max || 99);
    const sync = () => {
      const v = Number(input.value);
      minus.disabled = v <= min;
      plus.disabled = v >= max;
    };
    const set = v => {
      input.value = clamp(Math.round(v) || 0, min, max);
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    minus.addEventListener('click', () => set(Number(input.value) - 1));
    plus.addEventListener('click', () => set(Number(input.value) + 1));
    input.addEventListener('change', e => { if (e.isTrusted) set(Number(input.value)); });
    sync();
  };

  App.field = {
    setError(input, msg) {
      const f = input.closest('.field');
      if (!f) return;
      f.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      let err = f.querySelector('.field__error');
      if (!err) { err = document.createElement('p'); err.className = 'field__error'; f.appendChild(err); }
      if (!err.id) err.id = App.uid('err');
      err.textContent = msg;
      const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (!ids.includes(err.id)) input.setAttribute('aria-describedby', ids.concat(err.id).join(' '));
    },
    clearError(input) {
      const f = input.closest('.field');
      if (!f) return;
      f.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    },
    clear(form) {
      form.querySelectorAll('.field.is-invalid').forEach(f => f.classList.remove('is-invalid'));
      form.querySelectorAll('[aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
    }
  };

  App.valid = {
    required: v => String(v == null ? '' : v).trim().length > 0,
    phone: v => /^(09\d{2}-?\d{3}-?\d{3}|0\d{1,2}-?\d{3,4}-?\d{4})$/.test(String(v).trim()),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()),
    int: (v, min, max) => /^-?\d+$/.test(String(v).trim()) && Number(v) >= (min == null ? -Infinity : min) && Number(v) <= (max == null ? Infinity : max),
    date: v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(App.date(v).getTime())
  };

  let tipEl = null;
  App.tooltip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = html;
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      const left = clamp(x + 14, 8, innerWidth - w - 8);
      const top = y - h - 14 < 8 ? y + 18 : y - h - 14;
      tipEl.style.transform = 'translate(' + left + 'px,' + top + 'px)';
      tipEl.classList.add('is-on');
    },
    hide() { if (tipEl) tipEl.classList.remove('is-on'); }
  };

  /* 線描放大：拖曳平移、雙擊放大、Ctrl/⌘＋滾輪或觸控板縮放、按鈕 [data-zoom="in|out|reset"]。
     一般滾輪不攔截，避免使用者捲頁時卡在圖上。 */
  App.zoom = function (el) {
    if (el._zoom) return el._zoom;
    const stage = el.querySelector('.zoom__stage');
    const level = el.querySelector('.zoom__level');
    const st = { s: 1, x: 0, y: 0 };
    const MIN = 1, MAX = 4;
    const apply = () => {
      const w = el.clientWidth, h = el.clientHeight;
      st.x = clamp(st.x, w - w * st.s, 0);
      st.y = clamp(st.y, h - h * st.s, 0);
      stage.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.s + ')';
      if (level) level.textContent = Math.round(st.s * 100) + '%';
      el.dispatchEvent(new CustomEvent('zoomchange', { detail: { scale: st.s } }));
    };
    const zoomAt = (s, cx, cy) => {
      const ns = clamp(s, MIN, MAX);
      st.x = cx - (cx - st.x) * ns / st.s;
      st.y = cy - (cy - st.y) * ns / st.s;
      st.s = ns;
      apply();
    };
    const center = () => [el.clientWidth / 2, el.clientHeight / 2];
    el.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(st.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('dblclick', e => {
      const r = el.getBoundingClientRect();
      zoomAt(st.s >= MAX ? 1 : st.s * 1.8, e.clientX - r.left, e.clientY - r.top);
    });
    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (st.s === 1 || e.target.closest('button')) return;
      drag = { x: e.clientX - st.x, y: e.clientY - st.y };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      st.x = e.clientX - drag.x;
      st.y = e.clientY - drag.y;
      apply();
    });
    const end = () => { drag = null; el.classList.remove('is-dragging'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      const [cx, cy] = center();
      if (b.dataset.zoom === 'in') zoomAt(st.s * 1.5, cx, cy);
      else if (b.dataset.zoom === 'out') zoomAt(st.s / 1.5, cx, cy);
      else { st.s = 1; st.x = 0; st.y = 0; apply(); }
    }));
    el._zoom = {
      set: s => { const [cx, cy] = center(); zoomAt(s, cx, cy); },
      reset: () => { st.s = 1; st.x = 0; st.y = 0; apply(); },
      get scale() { return st.s; }
    };
    apply();
    return el._zoom;
  };

  App.searchClear = function (input) {
    if (input.dataset.searchReady) return;
    input.dataset.searchReady = '1';
    const btn = input.parentElement.querySelector('.search__clear');
    if (!btn) return;
    const sync = () => { btn.hidden = !input.value; };
    input.addEventListener('input', sync);
    btn.addEventListener('click', () => {
      input.value = '';
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    sync();
  };


  /* ========================================================================
     7. 動態：reveal、數字遞增、可暫停的動畫迴圈
     ======================================================================== */
  const revealed = el => {
    el.classList.add('is-revealed');
    if (el.dataset.reveal === 'dig' || el.querySelector('.dig-blob')) el.classList.add('is-dug');
    if (el.hasAttribute('data-count') && !el.dataset.counted) {
      el.dataset.counted = '1';
      App.countTo(el, Number(el.dataset.count));
    }
  };
  const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { revealed(en.target); revealIO.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;

  App.reveal = function (root) {
    const scope = root || document;
    const els = [...scope.querySelectorAll('[data-reveal], [data-count]')];
    if (scope !== document && scope.matches && scope.matches('[data-reveal], [data-count]')) els.push(scope);
    els.forEach(el => {
      if (el.classList.contains('is-revealed')) return;
      // 初次載入已在視窗內（或已捲過）的直接顯示，不等 observer，保證首屏不會空白
      const r = el.getBoundingClientRect();
      if (App.reducedMotion || !revealIO || r.top < innerHeight * 0.96) revealed(el);
      else revealIO.observe(el);
    });
  };
  // 保底：分頁回到前景、列印前，把已捲過的內容全部顯示
  const revealPassed = () => document.querySelectorAll('[data-reveal]:not(.is-revealed), [data-count]:not(.is-revealed)').forEach(el => {
    if (el.getBoundingClientRect().top < innerHeight) revealed(el);
  });
  document.addEventListener('visibilitychange', revealPassed);
  addEventListener('beforeprint', () => document.querySelectorAll('[data-reveal], [data-count]').forEach(revealed));
  motionQuery.addEventListener('change', () => { if (App.reducedMotion) document.querySelectorAll('[data-reveal], [data-count]').forEach(revealed); });

  /* 數字遞增：連續呼叫只更新起點、終點與起始時間，迴圈每格都讀 el 上的最新狀態，不會疊出多個迴圈 */
  App.countTo = function (el, n) {
    const decimals = Number(el.dataset.decimals || 0);
    const render = v => { el.textContent = decimals ? v.toFixed(decimals) : App.fmt.num(Math.round(v)); };
    el._countTarget = n;
    if (App.reducedMotion) { el._countValue = n; render(n); return; }
    el._countFrom = el._countValue || 0;
    el._countT0 = performance.now();
    if (el._countRaf) return;
    const tick = now => {
      const p = Math.min(1, (now - el._countT0) / 1200);
      const v = el._countFrom + (el._countTarget - el._countFrom) * (1 - Math.pow(1 - p, 3));
      el._countValue = v;
      render(v);
      el._countRaf = p < 1 ? requestAnimationFrame(tick) : null;
    };
    el._countRaf = requestAnimationFrame(tick);
  };

  /* 只在元素可見、分頁可見、未要求減少動態時執行的 rAF 迴圈 */
  App.animate = function (el, fn) {
    let visible = false, raf = 0, last = 0, stopped = false;
    const loop = now => {
      raf = 0;
      if (stopped || !visible || document.hidden || App.reducedMotion) return;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      fn(now, dt);
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && visible && !document.hidden && !stopped && !App.reducedMotion) { last = 0; raf = requestAnimationFrame(loop); } };
    const io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; kick(); });
    io.observe(el);
    document.addEventListener('visibilitychange', kick);
    motionQuery.addEventListener('change', kick);
    return function stop() {
      stopped = true;
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', kick);
      motionQuery.removeEventListener('change', kick);
    };
  };


  /* ========================================================================
     8. 外殼：導覽 active、行動版選單、頁首陰影、今日開館狀態
     ======================================================================== */
  function initShell() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.site-nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').split('#')[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    if (header && toggle) {
      const setOpen = open => {
        header.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open);
        const label = toggle.querySelector('.nav-toggle__label');
        if (label) label.textContent = open ? '關閉' : '選單';
      };
      toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
      header.querySelectorAll('.site-nav a').forEach(a => a.addEventListener('click', () => setOpen(false)));
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
      });
      document.addEventListener('click', e => {
        if (header.classList.contains('is-open') && !header.contains(e.target)) setOpen(false);
      });
      matchMedia('(min-width: 1021px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    }
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    const h = data.museum.hours;
    const closed = App.date(App.TODAY).getDay() === h.closedDay;
    document.querySelectorAll('[data-open-status]').forEach(el => {
      el.dataset.state = closed ? 'closed' : 'open';
      el.textContent = closed ? '今日休館（週一）' : '今日開館 ' + h.open + '–' + h.close;
    });
  }


  /* ========================================================================
     9. 初始化
     ======================================================================== */
  App.scan = function (root) {
    const scope = root || document;
    scope.querySelectorAll('[data-tabs]').forEach(App.tabs);
    scope.querySelectorAll('[data-segmented]').forEach(App.segmented);
    scope.querySelectorAll('[data-stepper]').forEach(App.stepper);
    scope.querySelectorAll('[data-search], .search__input').forEach(App.searchClear);
    scope.querySelectorAll('.zoom').forEach(App.zoom);
    App.reveal(scope);
  };

  initShell();
  App.scan(document);
})();
