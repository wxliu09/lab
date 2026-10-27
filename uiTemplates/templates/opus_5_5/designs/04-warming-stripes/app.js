/* ==========================================================================
   澄港市 氣候調適行動網 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒。
     app.js 載入時會自動 App.scan(document)；頁面用 innerHTML 動態插入的內容，
     插完後請呼叫 App.scan(容器) 讓 data-* 元件生效（重複呼叫是安全的）。
     <head> 內要有 <script>document.documentElement.classList.add('js')</script>，
     讓 [data-reveal] 在第一次繪製前就進入隱藏狀態，避免閃爍。

   資料（全站單一來源；數字請從這裡取，不要另外手打）
     App.data.now          「現在」＝2026-10-23；今年迄今距平、高溫日數等
     App.data.climate      1901–2025 年均溫距平（基準 1971–2000），125 筆
     App.data.series       1961–2025 觀測指標：heatDays 極端高溫日數、heavyRain 短延時強降雨場次、
                           maxHourly 年最大時雨量、rainDays 年降雨日數、cdd 冷房度日、
                           coldDays 寒害日數、seaLevel 港埕潮位站年均海平面（cm，相對 1961）
     App.data.emissions    2005–2025 溫室氣體排放（百萬噸 CO₂e）、減量目標、部門占比
     App.data.facets       六大調適面向 water / flood / health / energy / agri / coast
     App.data.agencies     負責局處    App.data.districts  八個行政區
     App.data.plans        24 項調適計畫（CA-W01 … CA-C04）
     App.data.focus        焦點計畫 CA-F01「港埕區海綿城市示範」的元件、成效、里程碑、文件、聯絡窗口
     App.data.news         8 則最新消息（cat：notice 公告 / press 新聞稿 / data 資料更新 / event 活動；
                           link 選填 {href, label}）；類別名稱在 App.data.newsCategories

   資料 helper
     App.climate           距平數列物件：.values .start .end .at(y) .mean(a,b) .color(v) .format(v)
                           .warming() → 1.40（2016–2025 平均 − 1901–1930 平均）
                           .rank(y) → 第幾熱（1 = 最熱）  .top(n, from, to) → [{year, value}]
     App.series(key)       指標數列物件（同上介面，另有 .label .def .unit .slope(a,b) .baseline；.signed 的數列 format 帶正負號）
     App.plan(id) / App.facet(key) / App.agency(key) / App.planURL(plan)
     App.statusLabel[status]  planning 規劃中 / ongoing 執行中 / delayed 進度落後 / done 已完成
     App.facetTotals()     → { water: {count, budget, progress}, …, all: {…} }（由 plans 即時計算）
     App.planCardHTML(plan, { level: 3 })  → .plan-card 的 HTML（焦點計畫標題連 action.html，
                           其他計畫標題是 <button data-plan-open="CA-xxx">，由頁面自行處理）

   條碼
     App.stripes.colorAt(t)            t ∈ [−1, 1] → 色階 hex（−1 最冷、0 白、1 最熱）
     App.stripes.color(v)              距平值 → hex（不對稱色域 −0.65 ~ +1.35°C）
     App.stripes.lift(hex)             最深的紅／藍往同色系提亮（畫成柱、點、線時用；條碼本身不提亮）
     App.stripes.gradient(colors)      顏色陣列 → 硬邊 linear-gradient 字串
     App.stripes.climate(from, to)     指定年段的距平條碼 gradient
     App.stripes.series(key, from, to) 指標數列條碼 gradient（以 1961–1990 為中性白）
     [data-stripes="climate|heatDays|…"] data-from / data-to：自動把元素背景換成該段條碼
     new App.StripeChart(host, opts)   招牌圖表引擎（canvas）：條碼 ⇄ 折線「融化」、逐條長出、
                                       滑過顯示該年數值、鍵盤 ←/→ 逐年、Home/End、Esc
       opts: { from, to, mode:'stripes'|'line', grow:true, axis:true, smooth:11,
               values, start, color(v), format(v), yDomain, yTicks, baselineLabel, annotateMax,
               label, onHover(info|null), onGrow(year, done), onMode(mode), onRange(from, to) }
       方法: setMode(mode, {instant}) / toggle() / setRange(from, to, {instant}) /
             highlight(year|null) / replay() / destroy()；屬性 .mode .range

   格式
     App.fmt.num(1234.5, 1) → "1,234.5"      App.fmt.signed(1.31) → "+1.31"（負號用 −）
     App.fmt.temp(-0.08) → "−0.08°C"          App.fmt.money(48600) → "4.86 億元"（單位：萬元）
     App.fmt.pct(62) → "62%"                  App.fmt.date('2026-10-21') → "2026.10.21"
     App.fmt.dateZh('2026-10-21') → "2026 年 10 月 21 日"   App.fmt.period(['2023-03','2027-12']) → "2023.03–2027.12"
     App.esc(str) HTML 跳脫
     App.icon(name, cls) → 線條圖示 SVG 字串（stroke 屬性寫在 SVG 上，CSS 只控尺寸）
       面向：water flood health energy agri coast
       介面：arrow arrow-up-right search close download mail info check alert replay stripes line
             calendar pin file sort filter chevron plus

   UI
     App.toast(msg, { title, tone:'default'|'hot'|'cool', timeout })（modal 開著時自動移進 modal 的 top layer）
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="dialogId"] 開啟、[data-modal-close] 關閉；點背景或 Esc 也會關；
       dialog 會觸發 'modal:open' / 'modal:close'
     App.tabs(tablist)     [data-tabs] 自動初始化；切換時 tablist 觸發 'tabchange'（detail: {tab, panel, index}）
                           分頁由 JS 產生時，插入後呼叫 App.scan(容器)；空的 tablist 不會被提前標記為已初始化
     App.seg(group)        [data-seg] 自動初始化；觸發 'segchange'（detail: {value, button}）；App.seg.set(group, value)
     App.tooltip.show(html, clientX, clientY) / App.tooltip.hide()
     App.field.setError(input, msg) / App.field.clear(input) / App.field.clearAll(form)
     App.valid.required / email / phone / int(v, min, max)
     [data-toast="訊息"]   沒有實際目的地的按鈕：點擊顯示 toast（data-toast-title 選填）
     form[data-subscribe]  頁尾極端天氣通知訂閱（驗證＋toast）

   動態（皆會在 prefers-reduced-motion 時停用或直接顯示終態）
     [data-reveal]         進場："" | "fade" | "wipe" | "scale"；style="--rd:120ms" 錯開
     [data-count="38"]     進入視窗時數字遞增（data-decimals、data-sign、data-prefix、data-suffix 選填）
                           App.count(el, n) 可再更新（連續呼叫安全，從目前顯示值接續）
     [data-progress="62"]  .progress 進入視窗時填到 62%
     [data-ring="26"]      .ring 進入視窗時把 .ring__value 畫到 26%
     [data-motion]         容器離開視窗時加 .is-paused，暫停內部所有 CSS 無限動畫
     App.inView(el, cb, { once, threshold, rootMargin }) → disconnect()
     App.animate(el, fn)   只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(t, dt)，回傳 stop()
     App.tween({ from, to, duration, ease, onUpdate, onDone }) → { cancel() }
     App.ease.outCubic / inOutCubic / outExpo / inCubic / linear
     App.reducedMotion     目前是否要求減少動態（getter）
   ========================================================================== */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  App.ease = {
    linear: t => t,
    inCubic: t => t * t * t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutCubic: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };

  App.esc = str => String(str ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));


  /* ------------------------------------------------------------------------
     1. 資料
     模擬數列：趨勢＋AR(1) 年際雜訊，離線以固定 seed 產生後寫死，
     讓每一頁、每一次載入看到的數字都一樣。
     ------------------------------------------------------------------------ */
  App.data = {};

  App.data.now = {
    date: '2026-10-23',
    station: '港埕氣象站',
    monthLabel: '10 月迄今',
    monthAnomaly: 1.6,       // 2026 年 10 月 1–22 日均溫距平
    ytdAnomaly: 1.38,        // 2026 年 1–9 月距平（暫定）
    ytdLabel: '1–9 月',
    heatDaysYtd: 43,         // 2026 年迄今日最高溫 ≥ 35°C 日數（已破 2024 年 41 日紀錄）
    hotNightsYtd: 52,        // 日最低溫 ≥ 28°C 的熱夜
  };

  App.data.climate = {
    label: '年均溫距平',
    def: '港埕氣象站年平均氣溫與 1971–2000 年平均的差',
    station: '港埕氣象站',
    unit: '°C',
    baseline: '1971–2000',
    start: 1901,
    domain: [-0.65, 1.35],
    values: [
      -0.49, -0.28, -0.44, -0.28, -0.41, -0.28, -0.23, -0.17, -0.48, -0.39,   // 1901–1910
      -0.27, -0.38, -0.52, -0.38, -0.48, -0.15, -0.17, -0.44, -0.59, -0.50,   // 1911–1920
      -0.20, -0.47, -0.20, -0.16, -0.26, 0.06, 0.12, -0.22, -0.19, -0.24,     // 1921–1930
      -0.43, -0.17, -0.43, -0.29, -0.32, -0.43, -0.41, -0.29, -0.23, -0.20,   // 1931–1940
      -0.32, -0.18, -0.25, -0.05, -0.15, -0.23, -0.22, -0.10, -0.33, -0.12,   // 1941–1950
      -0.14, -0.19, 0.00, -0.16, -0.30, -0.12, -0.08, 0.09, -0.09, -0.11,     // 1951–1960
      0.03, -0.14, -0.05, 0.03, 0.09, 0.02, -0.18, -0.17, -0.20, -0.26,       // 1961–1970
      -0.11, -0.12, -0.28, -0.16, -0.22, -0.31, -0.49, -0.41, -0.19, -0.16,   // 1971–1980
      -0.02, -0.24, -0.04, 0.29, 0.15, 0.09, -0.02, -0.02, 0.14, -0.01,       // 1981–1990
      -0.27, 0.00, -0.07, 0.06, 0.44, 0.27, 0.40, 0.39, 0.47, 0.44,           // 1991–2000
      0.24, 0.49, 0.47, 0.77, 0.46, 0.39, 0.47, 0.40, 0.58, 0.89,             // 2001–2010
      0.73, 0.78, 0.69, 0.88, 0.79, 1.04, 1.08, 0.94, 0.91, 1.00,             // 2011–2020
      1.23, 1.10, 1.04, 1.33, 1.31,                                           // 2021–2025
    ],
  };

  App.data.series = {
    heatDays: {
      label: '極端高溫日數', def: '日最高溫 ≥ 35°C 的日數', unit: '日', station: '港埕氣象站', start: 1961,
      values: [3, 3, 4, 1, 5, 7, 3, 5, 3, 2, 6, 3, 5, 5, 2, 7, 5, 5, 3, 2, 6, 4, 8, 12, 5, 3, 7, 7, 5, 5, 2, 5, 5, 3, 14, 12, 10, 8, 15, 11, 11, 11, 9, 24, 9, 15, 11, 13, 13, 23, 16, 17, 14, 24, 21, 24, 28, 23, 22, 25, 32, 29, 26, 41, 38],
    },
    heavyRain: {
      label: '短延時強降雨', def: '時雨量 ≥ 40 mm 的降雨場次', unit: '場', station: '港埕氣象站', start: 1961,
      values: [4, 2, 2, 3, 3, 2, 5, 1, 3, 1, 2, 2, 3, 2, 1, 2, 3, 2, 2, 0, 3, 2, 3, 1, 2, 3, 3, 1, 2, 4, 3, 4, 4, 3, 3, 3, 5, 4, 5, 3, 4, 4, 3, 5, 4, 7, 5, 6, 6, 7, 6, 6, 6, 7, 9, 9, 10, 6, 8, 11, 9, 11, 10, 11, 12],
    },
    maxHourly: {
      label: '年最大時雨量', def: '全年單一小時最大降雨量', unit: 'mm', decimals: 1, station: '港埕氣象站', start: 1961,
      values: [66.2, 55.6, 44.8, 71.4, 49.4, 59.3, 56.5, 59.3, 57.3, 57.1, 40.4, 48.7, 57.3, 50.8, 48.4, 55.8, 45.7, 70.5, 59.3, 44.5, 54.4, 59.3, 50.8, 37.7, 59.1, 52.8, 68.4, 51.4, 59.5, 56.7, 70.6, 60.8, 76, 55.8, 68.4, 67.6, 53.7, 58.8, 71.9, 63.8, 77, 65.8, 90.3, 58.3, 55.6, 53.5, 70.3, 80.3, 79.3, 67.9, 76.6, 67.3, 70.9, 66.9, 74.5, 69.8, 78.8, 86.3, 69.3, 92.6, 66, 90.6, 77.1, 76.1, 103.5],
    },
    rainDays: {
      label: '年降雨日數', def: '日雨量 ≥ 1 mm 的日數', unit: '日', invert: true, station: '港埕氣象站', start: 1961,
      values: [149, 147, 149, 150, 149, 151, 159, 154, 150, 151, 144, 146, 142, 160, 153, 145, 145, 152, 147, 153, 148, 149, 149, 157, 157, 150, 151, 152, 144, 148, 137, 147, 149, 137, 137, 142, 141, 144, 140, 143, 135, 143, 136, 141, 138, 143, 135, 129, 130, 137, 139, 141, 132, 133, 131, 133, 139, 131, 119, 132, 120, 126, 133, 124, 118],
    },
    cdd: {
      label: '冷房度日', def: '日均溫超過 24°C 部分的全年累計', unit: '度日', station: '港埕氣象站', start: 1961,
      values: [1014, 985, 894, 994, 1038, 1006, 916, 905, 924, 814, 963, 933, 847, 937, 849, 890, 783, 830, 958, 903, 978, 918, 984, 1105, 1047, 1015, 976, 941, 1011, 1003, 898, 962, 953, 948, 1156, 1087, 1159, 1131, 1149, 1111, 1027, 1158, 1169, 1269, 1126, 1118, 1216, 1176, 1184, 1317, 1214, 1313, 1295, 1287, 1259, 1341, 1358, 1296, 1284, 1378, 1436, 1417, 1364, 1518, 1445],
    },
    coldDays: {
      label: '寒害日數', def: '日最低溫 ≤ 10°C 的日數', unit: '日', invert: true, station: '港埕氣象站', start: 1961,
      values: [10, 9, 11, 8, 11, 9, 12, 9, 14, 9, 10, 7, 16, 13, 14, 9, 15, 14, 15, 12, 12, 13, 13, 13, 5, 10, 12, 13, 8, 10, 14, 12, 12, 15, 7, 10, 12, 8, 6, 2, 7, 13, 9, 0, 5, 11, 13, 8, 7, 4, 10, 5, 9, 0, 4, 5, 1, 5, 4, 1, 0, 3, 1, 0, 2],
    },
    seaLevel: {
      label: '年均海平面', def: '港埕潮位站年平均海平面，相對 1961 年', unit: 'cm', decimals: 1, signed: true, station: '港埕潮位站', start: 1961,
      values: [0, -0.2, 0.4, 1.2, 0.6, 1, 1.1, 1.2, 0.9, 1.7, 2.2, 2.9, 2, 4.4, 4, 3.6, 4.1, 3.1, 4, 4.8, 3.7, 4.7, 4.7, 5.5, 6.2, 5, 6.6, 7.6, 5.5, 6.2, 5.8, 6.6, 6, 7.4, 8.2, 8.2, 10, 9.2, 9.2, 10.6, 10.1, 9.4, 11.9, 11.5, 11.9, 11.8, 10.8, 12.3, 12.4, 12.9, 13, 13.2, 13.5, 15.6, 13.5, 15.3, 15.4, 15.5, 17.5, 16.3, 16.6, 17.4, 16.2, 18.1, 18.6],
    },
  };

  App.data.emissions = {
    label: '溫室氣體排放量',
    unit: '百萬噸 CO₂e',
    start: 2005,
    values: [11.80, 11.92, 12.06, 11.71, 11.18, 11.54, 11.49, 11.31, 11.12, 11.06, 10.87, 10.71, 10.58, 10.33, 10.02, 9.21, 9.64, 9.38, 9.12, 8.94, 8.73],
    targets: [
      { year: 2030, cut: 35, label: '2030 中期目標' },
      { year: 2040, cut: 62, label: '2040 階段目標' },
      { year: 2050, cut: 100, label: '2050 淨零' },
    ],
    sectors: [
      { key: 'power', label: '住商與工業用電', share: 54 },
      { key: 'transport', label: '運輸', share: 23 },
      { key: 'industry', label: '工業製程', share: 12 },
      { key: 'waste', label: '廢棄物', share: 6 },
      { key: 'agri', label: '農業', share: 5 },
    ],
  };

  App.data.districts = ['港埕區', '北岸區', '舊城區', '山腳區', '新灣區', '鹽田區', '溪洲區', '雲嶺區'];

  App.data.agencies = {
    wrb: { name: '水利局', en: 'Water Resources Bureau' },
    pwb: { name: '工務局', en: 'Public Works Bureau' },
    udb: { name: '都市發展局', en: 'Urban Development Bureau' },
    hb: { name: '衛生局', en: 'Health Bureau' },
    swb: { name: '社會局', en: 'Social Welfare Bureau' },
    lab: { name: '勞動局', en: 'Labor Bureau' },
    edb: { name: '經濟發展局', en: 'Economic Development Bureau' },
    epb: { name: '環境保護局', en: 'Environmental Protection Bureau' },
    agb: { name: '農業局', en: 'Agriculture Bureau' },
    mfb: { name: '海洋及漁業局', en: 'Marine and Fisheries Bureau' },
  };

  App.data.facets = [
    { key: 'water', code: 'W', no: '01', name: '水資源', en: 'WATER SUPPLY', indicator: 'rainDays',
      risk: '下雨的日子變少、單場雨變大，枯水期一年比一年長；供水要有備援，也要開始用再生水。' },
    { key: 'flood', code: 'F', no: '02', name: '防洪', en: 'FLOOD RESILIENCE', indicator: 'heavyRain',
      risk: '短延時強降雨是 1990 年代的 2.6 倍，舊的排水設計標準追不上，雨水得先就地留下。' },
    { key: 'health', code: 'H', no: '03', name: '健康', en: 'PUBLIC HEALTH', indicator: 'heatDays',
      risk: '極端高溫日數逐年攀升，熱傷害與病媒傳染病的風險季節同步拉長，長者與戶外工作者首當其衝。' },
    { key: 'energy', code: 'E', no: '04', name: '能源', en: 'ENERGY', indicator: 'cdd',
      risk: '冷房度日比 1990 年代多出三成，夏季尖峰用電逼近極限，需要屋頂光電、儲能與節能改造。' },
    { key: 'agri', code: 'A', no: '05', name: '農業', en: 'AGRICULTURE', indicator: 'coldDays',
      risk: '寒害日數幾近歸零，果樹需冷量不足；稻作抽穗期的高溫逆境則愈來愈頻繁。' },
    { key: 'coast', code: 'C', no: '06', name: '海岸', en: 'COASTAL DEFENCE', indicator: 'seaLevel',
      risk: '港埕潮位站年均海平面較 1961 年高 18.6 公分，大潮遇上颱風暴潮時，溢淹範圍持續擴大。' },
  ];

  // budget 單位：萬元；kpi.dir = 'down' 表示數值愈低愈好
  App.data.plans = [
    { id: 'CA-W01', facet: 'water', title: '鹽田再生水廠第二期擴建', district: '鹽田區', agency: 'wrb', budget: 128000, progress: 44, status: 'ongoing', period: ['2024-01', '2028-06'],
      kpi: { label: '再生水供應量', current: 2.6, target: 6, unit: '萬噸／日', decimals: 1 },
      summary: '把污水處理廠放流水再處理為工業用水，枯水期優先把自來水留給民生使用。' },
    { id: 'CA-W02', facet: 'water', title: '自來水管網漏水改善', district: '全市', agency: 'wrb', budget: 36500, progress: 71, status: 'ongoing', period: ['2021-07', '2027-12'],
      kpi: { label: '管網漏水率', current: 13.2, target: 10, unit: '%', decimals: 1, dir: 'down' },
      summary: '汰換 186 公里老舊管線並導入分區計量，每年省下的水量約等於一座小型水庫。' },
    { id: 'CA-W03', facet: 'water', title: '雲嶺水庫清淤與備援管線', district: '雲嶺區', agency: 'wrb', budget: 52400, progress: 88, status: 'ongoing', period: ['2022-03', '2026-12'],
      kpi: { label: '有效庫容', current: 410, target: 460, unit: '萬 m³' },
      summary: '清除颱風帶來的淤積並新建 9.4 公里備援管線，讓北岸與舊城可以互相調度。' },
    { id: 'CA-W04', facet: 'water', title: '公有建築雨水回收', district: '全市', agency: 'pwb', budget: 8600, progress: 100, status: 'done', period: ['2022-01', '2025-12'],
      kpi: { label: '設置棟數', current: 132, target: 120, unit: '棟' },
      summary: '學校、區公所與運動中心設置雨水回收系統，用於澆灌與沖廁。' },

    { id: 'CA-F01', facet: 'flood', title: '港埕區海綿城市示範', district: '港埕區', agency: 'wrb', co: ['udb'], budget: 48600, progress: 62, status: 'ongoing', period: ['2023-03', '2027-12'],
      kpi: { label: '逕流削減率', current: 31, target: 40, unit: '%' },
      summary: '以透水鋪面、雨水花園與地下滯洪槽，讓港埕的雨水「先留下、再慢慢走」。' },
    { id: 'CA-F02', facet: 'flood', title: '溪洲區抽水站韌性升級', district: '溪洲區', agency: 'wrb', budget: 31200, progress: 57, status: 'ongoing', period: ['2024-05', '2027-06'],
      kpi: { label: '抽水能力', current: 48, target: 72, unit: 'm³/s' },
      summary: '新增抽水機組並墊高機電設備，淹水 1.2 公尺時仍能持續運轉。' },
    { id: 'CA-F03', facet: 'flood', title: '舊城區雨水下水道瓶頸改善', district: '舊城區', agency: 'pwb', budget: 27800, progress: 35, status: 'delayed', period: ['2023-09', '2027-09'],
      kpi: { label: '已改善瓶頸段', current: 9, target: 26, unit: '處' },
      summary: '老街區管線交錯、施工空間有限，部分路段因既有管線遷移而延宕。' },
    { id: 'CA-F04', facet: 'flood', title: '北岸滯洪公園', district: '北岸區', agency: 'udb', budget: 22500, progress: 8, status: 'planning', period: ['2026-03', '2028-12'],
      kpi: { label: '滯洪量', current: 0, target: 8.5, unit: '萬 m³', decimals: 1 },
      summary: '平時是運動公園；豪雨時下凹草坪與球場可暫存 8.5 萬立方公尺雨水。' },

    { id: 'CA-H01', facet: 'health', title: '高溫健康預警簡訊', district: '全市', agency: 'hb', budget: 1850, progress: 100, status: 'done', period: ['2023-04', '2025-10'],
      kpi: { label: '預警觸及人數', current: 41.2, target: 35, unit: '萬人', decimals: 1 },
      summary: '依體感溫度分級發送預警，優先通知獨居長者、慢性病患與其照顧者。' },
    { id: 'CA-H02', facet: 'health', title: '社區涼適中心', district: '全市', agency: 'swb', budget: 6400, progress: 76, status: 'ongoing', period: ['2024-04', '2026-12'],
      kpi: { label: '開放中心數', current: 58, target: 76, unit: '處' },
      summary: '圖書館、活動中心與區公所大廳在高溫日開放休息，提供飲水與血壓量測。' },
    { id: 'CA-H03', facet: 'health', title: '戶外工作者熱危害管理', district: '全市', agency: 'lab', budget: 2300, progress: 49, status: 'ongoing', period: ['2025-01', '2027-06'],
      kpi: { label: '輔導事業單位', current: 312, target: 640, unit: '家' },
      summary: '協助營造、物流與外送業建立熱指數作業分級，以及強制休息與補水制度。' },
    { id: 'CA-H04', facet: 'health', title: '登革熱病媒智慧監測', district: '山腳區', agency: 'hb', co: ['epb'], budget: 4900, progress: 64, status: 'ongoing', period: ['2024-07', '2027-06'],
      kpi: { label: '高風險里數', current: 14, target: 5, unit: '里', dir: 'down' },
      summary: '以誘卵桶感測與社區通報建立熱點地圖，高溫季提前三週啟動孳生源清除。' },

    { id: 'CA-E01', facet: 'energy', title: '公有屋頂光電第三期', district: '全市', agency: 'edb', budget: 41000, progress: 81, status: 'ongoing', period: ['2023-01', '2026-12'],
      kpi: { label: '累計裝置容量', current: 96, target: 118, unit: 'MW' },
      summary: '在學校、市場與停車場屋頂設置光電，夏季午後尖峰時段就地發電、就地使用。' },
    { id: 'CA-E02', facet: 'energy', title: '新灣區智慧電網與儲能', district: '新灣區', agency: 'edb', budget: 58800, progress: 29, status: 'ongoing', period: ['2025-02', '2029-12'],
      kpi: { label: '儲能容量', current: 24, target: 80, unit: 'MWh' },
      summary: '以儲能與需量反應削減夏季尖峰負載；停電時優先維持醫院與抽水站供電。' },
    { id: 'CA-E03', facet: 'energy', title: '老舊公寓節能改造補助', district: '全市', agency: 'udb', budget: 9200, progress: 66, status: 'ongoing', period: ['2024-01', '2027-12'],
      kpi: { label: '完成戶數', current: 3960, target: 6000, unit: '戶' },
      summary: '補助外遮陽、隔熱屋頂與高效率冷氣，降低頂樓住戶的室溫與電費。' },
    { id: 'CA-E04', facet: 'energy', title: '路燈 LED 與智慧調光', district: '全市', agency: 'pwb', budget: 12600, progress: 100, status: 'done', period: ['2021-03', '2025-06'],
      kpi: { label: '節電率', current: 58, target: 50, unit: '%' },
      summary: '全市 7.2 萬盞路燈完成汰換，深夜依車流量自動調光。' },

    { id: 'CA-A01', facet: 'agri', title: '耐熱水稻品種推廣', district: '溪洲區', agency: 'agb', budget: 3400, progress: 70, status: 'ongoing', period: ['2024-02', '2027-01'],
      kpi: { label: '推廣面積', current: 1260, target: 1800, unit: '公頃' },
      summary: '推廣抽穗期耐高溫品種並調整插秧期，減少高溫造成的稔實率下降。' },
    { id: 'CA-A02', facet: 'agri', title: '山腳區果園智慧灌溉', district: '山腳區', agency: 'agb', budget: 5800, progress: 41, status: 'delayed', period: ['2024-06', '2027-06'],
      kpi: { label: '節水率', current: 18, target: 30, unit: '%' },
      summary: '以土壤水分感測控制滴灌；設備採購兩度流標，進度落後約五個月。' },
    { id: 'CA-A03', facet: 'agri', title: '農業氣象災害預警平台', district: '全市', agency: 'agb', budget: 2100, progress: 100, status: 'done', period: ['2022-09', '2025-08'],
      kpi: { label: '訂閱農戶', current: 8420, target: 6000, unit: '戶' },
      summary: '依作物別推播高溫、豪雨與寒害預警，並附上建議的田間管理措施。' },
    { id: 'CA-A04', facet: 'agri', title: '雲嶺高冷蔬菜設施化', district: '雲嶺區', agency: 'agb', budget: 7600, progress: 23, status: 'ongoing', period: ['2025-07', '2028-06'],
      kpi: { label: '設施面積', current: 14, target: 60, unit: '公頃' },
      summary: '以防雨網室與遮陰設施穩定夏季產量，減少強降雨後的菜價波動。' },

    { id: 'CA-C01', facet: 'coast', title: '鹽田區海堤加高與退縮', district: '鹽田區', agency: 'mfb', co: ['wrb'], budget: 76500, progress: 38, status: 'ongoing', period: ['2024-09', '2029-12'],
      kpi: { label: '堤頂高程', current: 3.2, target: 4.1, unit: 'm', decimals: 1 },
      summary: '依 2050 年海平面推估加高堤頂，並在低窪聚落退縮設置緩衝帶。' },
    { id: 'CA-C02', facet: 'coast', title: '新灣潮間帶濕地復育', district: '新灣區', agency: 'mfb', budget: 6300, progress: 52, status: 'ongoing', period: ['2024-03', '2027-12'],
      kpi: { label: '復育面積', current: 26, target: 48, unit: '公頃' },
      summary: '恢復潮間帶的自然地形，讓灘地在暴潮來臨前先消減波浪能量。' },
    { id: 'CA-C03', facet: 'coast', title: '港埕漁港防潮閘門', district: '港埕區', agency: 'mfb', budget: 19400, progress: 15, status: 'planning', period: ['2026-06', '2029-06'],
      kpi: { label: '閘門座數', current: 0, target: 3, unit: '座' },
      summary: '在漁港出海口設置可升降閘門，大潮遇上颱風暴潮時關閉，保護港埕老街。' },
    { id: 'CA-C04', facet: 'coast', title: '北岸沙灘養灘', district: '北岸區', agency: 'wrb', budget: 11800, progress: 84, status: 'ongoing', period: ['2023-10', '2026-12'],
      kpi: { label: '回補砂量', current: 21, target: 25, unit: '萬 m³' },
      summary: '以航道疏浚砂回補侵蝕海岸，恢復沙灘寬度與天然防護。' },
  ];

  App.data.focus = {
    id: 'CA-F01',
    en: 'HARBOUR DISTRICT SPONGE CITY PILOT',
    area: 38.5,                 // 公頃
    location: '港埕區海埕路、漁會街、新港一路一帶（港埕第 3 排水分區）',
    designStorm: '設計降雨由時雨量 78.8 mm 提高到 100 mm',
    spent: 30140,               // 萬元，統計至 2026 年 9 月
    components: [
      { key: 'paving', name: '透水鋪面', total: 4.2, done: 2.9, unit: '公頃', decimals: 1 },
      { key: 'garden', name: '雨水花園', total: 18, done: 11, unit: '處' },
      { key: 'swale', name: '植生溝', total: 2.6, done: 1.7, unit: '公里', decimals: 1 },
      { key: 'tank', name: '地下滯洪槽', total: 12400, done: 12400, unit: 'm³' },
      { key: 'roof', name: '屋頂雨水貯留', total: 26, done: 9, unit: '棟' },
    ],
    metrics: [
      { key: 'runoff', label: '逕流削減率', now: 31, target: 40, unit: '%', note: '同一場 50 mm/hr 降雨，與 2022 年基準相比的地表逕流量' },
      { key: 'delay', label: '尖峰流量延遲', now: 28, target: 35, unit: '分鐘', note: '雨水進入下水道的尖峰時間往後推' },
      { key: 'infiltration', label: '年雨水入滲量', now: 18.6, target: 24, unit: '萬 m³', decimals: 1, note: '透水鋪面與雨水花園每年讓雨水回到地下' },
      { key: 'reports', label: '積淹水通報', now: 3, base: 17, unit: '件／年', dir: 'down', note: '2022 年 17 件，2025 年 3 件' },
      { key: 'surface', label: '夏季午後地表溫度', now: -2.1, target: -2.5, unit: '°C', decimals: 1, dir: 'down', note: '透水鋪面路段與一般柏油路面相比' },
    ],
    milestones: [
      { date: '2023-03', title: '計畫核定', text: '市府核定總經費 4.86 億元，水利局主辦、都市發展局協辦。', state: 'done' },
      { date: '2023-10', title: '水文調查與基本設計完成', text: '布設 12 處雨量與水位計，建立排水分區模型。', state: 'done' },
      { date: '2024-06', title: '第一標 海埕路透水鋪面完工', text: '1.6 公頃透水鋪面與 5 處雨水花園啟用。', state: 'done' },
      { date: '2024-12', title: '漁會街地下滯洪槽完工', text: '設計容量 12,400 m³，延後尖峰流量進入雨水下水道。', state: 'done' },
      { date: '2025-08', title: '第一階段成效驗證', text: '逕流削減率 31%，積淹水通報由 17 件降至 3 件。', state: 'done' },
      { date: '2026-10', title: '第二標 新港一路透水鋪面施工', text: '10 月 27 日起分段施工，夜間單線通行。', state: 'now' },
      { date: '2027-06', title: '屋頂雨水貯留 26 棟完成', text: '公有建築 12 棟、私有建築補助 14 棟。', state: 'next' },
      { date: '2027-12', title: '全區完工與第二階段驗證', text: '目標逕流削減率 40%、尖峰延遲 35 分鐘。', state: 'next' },
    ],
    docs: [
      { title: '港埕區海綿城市示範計畫 核定本', type: 'PDF', size: '8.4 MB', date: '2023-03-20' },
      { title: '水文調查與排水分區模型報告', type: 'PDF', size: '21.7 MB', date: '2023-10-31' },
      { title: '第一階段成效驗證報告', type: 'PDF', size: '6.2 MB', date: '2025-09-15' },
      { title: '第二標 新港一路施工交通維持計畫', type: 'PDF', size: '3.1 MB', date: '2026-10-15' },
      { title: '監測資料（雨量、水位、逕流）2024–2026', type: 'CSV', size: '1.8 MB', date: '2026-10-01' },
      { title: '透水鋪面與雨水花園設計準則', type: 'ODT', size: '940 KB', date: '2024-02-08' },
    ],
    contact: { unit: '水利局 雨水下水道工程科', phone: '0800-021-325', email: 'sponge@climate.chenggang.example', hours: '週一至週五 08:30–17:30' },
  };

  App.data.newsCategories = { notice: '公告', press: '新聞稿', data: '資料更新', event: '活動' };

  App.data.news = [
    { id: 'N-261021', link: { href: 'data.html', label: '看完整高溫數列' }, date: '2026-10-21', cat: 'data', title: '2026 年極端高溫日數達 43 日，改寫 2024 年紀錄',
      excerpt: '港埕氣象站統計至 10 月 20 日，今年日最高溫 35°C 以上的日數已達 43 日，超越 2024 年全年的 41 日。',
      body: [
        '港埕氣象站統計至 10 月 20 日，今年日最高溫達 35°C 以上的日數累計 43 日，超越 2024 年全年 41 日的紀錄，也是 1991–2000 年平均（8.5 日）的五倍。',
        '今年的高溫來得晚：9 月下旬到 10 月中旬仍有 7 天超過 35°C，往年此時多已轉涼。夜間最低溫 28°C 以上的熱夜也有 52 夜，獨居長者與戶外工作者的累積熱壓力明顯增加。',
        '衛生局提醒，社區涼適中心延長開放至 10 月 31 日，高溫預警簡訊將持續發送到 11 月中旬。完整數列已更新至「氣候資料」頁。',
      ] },
    { id: 'N-261017', link: { href: 'action.html', label: '看海綿城市計畫' }, date: '2026-10-17', cat: 'notice', title: '海綿城市示範計畫：新港一路透水鋪面第二標 10/27 起分段施工',
      excerpt: '施工期間新港一路（漁會街至海埕路段）每日 22:00 至翌日 06:00 單線通行，預計 12 月 20 日完成路面工程。',
      body: [
        '港埕區海綿城市示範計畫第二標將於 10 月 27 日起施工，範圍為新港一路漁會街至海埕路段，長約 640 公尺，施作透水鋪面與 4 處雨水花園。',
        '為降低對商家與通勤的影響，主要工項安排在每日 22:00 至翌日 06:00 進行，期間單線雙向通行並派員指揮；白天維持雙向通車與人行道淨寬 1.5 公尺以上。',
        '施工交通維持計畫已公開於計畫頁的相關文件，施工期間如有問題，可透過計畫頁的意見信箱或撥打 0800-021-325 反映。',
      ] },
    { id: 'N-261014', date: '2026-10-14', cat: 'event', title: '「條碼裡的城市」氣候資料工作坊，11 月 8 日在舊城區開課',
      excerpt: '帶著自己的出生年，學會讀懂暖化條碼、降雨強度與海平面數列。免費參加，名額 40 人。',
      body: [
        '氣候變遷調適辦公室與舊城區社區大學合辦「條碼裡的城市」工作坊，11 月 8 日（日）14:00–17:00 於舊城區公所 3 樓多功能教室舉行。',
        '課程從每位學員的出生年開始，用澄港自己的觀測數列畫出個人條碼，再一起比較 1990 年代與這十年的高溫、強降雨與海平面變化。',
        '免費參加，名額 40 人，額滿為止；適合高中以上的市民，不需要任何程式或統計背景。',
      ] },
    { id: 'N-261008', link: { href: 'actions.html#energy', label: '看能源面向計畫' }, date: '2026-10-08', cat: 'press', title: '澄港市 2025 年溫室氣體排放 8.73 百萬噸，較 2005 年減少 26.0%',
      excerpt: '公有屋頂光電與路燈汰換貢獻最多；距離 2030 年減量 35% 的目標，還有 9 個百分點。',
      body: [
        '依最新盤查結果，澄港市 2025 年溫室氣體排放量為 8.73 百萬噸二氧化碳當量，較基準年 2005 年的 11.80 百萬噸減少 26.0%，連續六年下降。',
        '減量主要來自電力部門：公有屋頂光電累計裝置容量達 96 MW，全市 7.2 萬盞路燈完成 LED 汰換。運輸部門則因機車電動化進度不如預期，排放僅微幅下降。',
        '距離 2030 年減量 35% 的中期目標還有 9 個百分點。市府將在 2027 年度預算中提高老舊公寓節能改造與新灣區儲能計畫的經費。',
      ] },
    { id: 'N-260930', link: { href: 'actions.html#health', label: '看健康面向計畫' }, date: '2026-09-30', cat: 'notice', title: '社區涼適中心延長開放至 10 月 31 日',
      excerpt: '全市 58 處涼適中心（圖書館、活動中心、區公所大廳）延長開放，每日 10:00–18:00。',
      body: [
        '因應秋季持續高溫，全市 58 處社區涼適中心延長開放至 10 月 31 日，每日 10:00–18:00，提供冷氣休息空間、飲水與血壓量測。',
        '中心位置可在各區公所網站與 1999 市民專線查詢。行動不便的長者可由里辦公處協助預約接送。',
      ] },
    { id: 'N-260924', link: { href: 'data.html', label: '看海平面數列' }, date: '2026-09-24', cat: 'data', title: '港埕潮位站：2025 年均海平面較 1961 年上升 18.6 公分',
      excerpt: '近 20 年平均每年上升 3.7 毫米，是 1961–1990 年的 1.6 倍；鹽田區海堤加高工程同步檢討設計高程。',
      body: [
        '港埕潮位站 2025 年的年平均海平面較 1961 年高 18.6 公分。近 20 年（2006–2025）平均每年上升 3.7 毫米，是 1961–1990 年每年 2.4 毫米的 1.6 倍。',
        '海平面上升會讓同樣強度的颱風暴潮淹得更遠。海洋及漁業局已依最新數列檢討鹽田區海堤加高工程，堤頂高程目標維持 4.1 公尺，並增設低窪聚落的退縮緩衝帶。',
      ] },
    { id: 'N-260915', date: '2026-09-15', cat: 'event', title: '2026 澄港氣候調適論壇 11 月 21 日登場，即日起開放報名',
      excerpt: '主題「熱城市的下一個十年」，各局處、社區與研究單位將公開檢視 24 項調適計畫的進度。',
      body: [
        '2026 澄港氣候調適論壇將於 11 月 21 日（六）在新灣區會展中心舉行，主題是「熱城市的下一個十年」。',
        '上午由各局處報告 24 項調適計畫的進度與落後原因，下午分為高溫健康、都市防洪、海岸調適三個分組，與社區團體及研究單位對談。',
        '論壇全程開放市民參加並同步線上直播，現場座位 300 席，請於 11 月 14 日前報名。',
      ] },
    { id: 'N-260903', link: { href: 'actions.html#flood', label: '看防洪面向計畫' }, date: '2026-09-03', cat: 'press', title: '溪洲區抽水站韌性升級第一階段完工，抽水能力提升至 48 m³/s',
      excerpt: '新增 2 部抽水機組並墊高機電設備，淹水 1.2 公尺時仍能持續運轉。',
      body: [
        '溪洲區抽水站韌性升級工程第一階段完工，新增 2 部每秒 8 立方公尺的抽水機組，總抽水能力由 32 提升到每秒 48 立方公尺。',
        '機電設備全面墊高至淹水 1.2 公尺不停機的高度，並設置 72 小時備援發電。第二階段將再增設 3 部機組，2027 年 6 月完工後可達每秒 72 立方公尺。',
      ] },
  ];


  /* ------------------------------------------------------------------------
     2. 條碼色彩
     ------------------------------------------------------------------------ */
  const STOPS = ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7', '#f7fbff',
    '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'];
  const hexToRgb = hex => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  const rgbToHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const STOP_RGB = STOPS.map(hexToRgb);

  function colorAt(t) {
    const p = (clamp(t, -1, 1) + 1) / 2 * (STOPS.length - 1);
    const i = Math.min(STOPS.length - 2, Math.floor(p));
    const f = p - i;
    return rgbToHex(STOP_RGB[i].map((v, k) => v + (STOP_RGB[i + 1][k] - v) * f));
  }

  // 色階兩端最深的紅與藍（#67000d、#08306b）在夜色背景上幾乎看不見。畫成柱、點、線等「標記」時
  // 往同色系的亮色拉一點：保留色相，最熱的年份仍是最深的紅，而不是混灰後的暗粉紅。條碼本身不提亮。
  const LIFT_HOT = hexToRgb('#fb6a4a');
  const LIFT_COOL = hexToRgb('#6baed6');
  function lift(hex) {
    const rgb = hexToRgb(hex);
    const lum = (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255;
    if (lum >= .25) return hex;
    const target = rgb[0] >= rgb[2] ? LIFT_HOT : LIFT_COOL;
    const k = (.25 - lum) * 2.2;
    return rgbToHex(rgb.map((v, i) => v + (target[i] - v) * k));
  }

  function gradient(colors, dir = '90deg') {
    const n = colors.length;
    const pct = k => +(k / n * 100).toFixed(3) + '%';
    return `linear-gradient(${dir}, ${colors.map((c, k) => `${c} ${pct(k)} ${pct(k + 1)}`).join(', ')})`;
  }


  /* ------------------------------------------------------------------------
     3. 數列物件
     ------------------------------------------------------------------------ */
  function slope(xs, ys) {
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    return num / den;
  }

  function makeSeries(key, def) {
    // signed：相對某基準年的數列（海平面）顯示正負號
    const s = Object.assign({ key, decimals: 0, invert: false, signed: false }, def);
    s.end = s.start + s.values.length - 1;
    s.years = s.values.map((_, i) => s.start + i);
    s.at = year => (year >= s.start && year <= s.end ? s.values[year - s.start] : null);
    s.slice = (from = s.start, to = s.end) => s.values.slice(Math.max(0, from - s.start), Math.min(s.values.length, to - s.start + 1));
    s.mean = (from, to) => mean(s.slice(from, to));
    s.slope = (from, to) => slope(s.years.filter(y => y >= from && y <= to), s.slice(from, to));
    s.format = (v, withUnit = true) => (s.signed ? App.fmt.signed(v, s.decimals) : App.fmt.num(v, s.decimals)) + (withUnit ? ' ' + s.unit : '');
    return s;
  }

  App.climate = makeSeries('climate', App.data.climate);
  App.climate.decimals = 2;
  App.climate.color = v => {
    const [lo, hi] = App.climate.domain;
    return colorAt(v < 0 ? v / -lo : v / hi);
  };
  App.climate.format = v => App.fmt.temp(v);
  App.climate.warming = () => App.climate.mean(2016, 2025) - App.climate.mean(1901, 1930);
  App.climate.top = (n = 10, from = App.climate.start, to = App.climate.end) =>
    App.climate.years
      .filter(y => y >= from && y <= to)
      .map(year => ({ year, value: App.climate.at(year) }))
      .sort((a, b) => b.value - a.value || b.year - a.year)
      .slice(0, n);
  App.climate.rank = year => {
    const v = App.climate.at(year);
    if (v == null) return null;
    return App.climate.values.filter(x => x > v).length + 1;
  };

  const seriesCache = {};
  App.series = key => {
    if (seriesCache[key]) return seriesCache[key];
    const def = App.data.series[key];
    if (!def) throw new Error(`Unknown series: ${key}`);
    const s = makeSeries(key, def);
    // 指標條碼：1961–1990 平均為中性白，偏離最大的那年到色階端點；invert 表示「愈少愈熱」
    s.baseline = s.mean(1961, 1990);
    s.maxDev = Math.max(...s.values.map(v => Math.abs(v - s.baseline)));
    s.color = v => colorAt((v - s.baseline) / s.maxDev * (s.invert ? -1 : 1));
    seriesCache[key] = s;
    return s;
  };

  App.stripes = {
    stops: STOPS.slice(),
    colorAt,
    color: v => App.climate.color(v),
    lift,
    gradient,
    climate(from = App.climate.start, to = App.climate.end) {
      return gradient(App.climate.slice(from, to).map(App.climate.color));
    },
    series(key, from, to) {
      const s = App.series(key);
      return gradient(s.slice(from ?? s.start, to ?? s.end).map(s.color));
    },
    paint(el) {
      const key = el.dataset.stripes || 'climate';
      const from = el.dataset.from ? +el.dataset.from : undefined;
      const to = el.dataset.to ? +el.dataset.to : undefined;
      el.style.backgroundImage = key === 'climate' ? App.stripes.climate(from, to) : App.stripes.series(key, from, to);
    },
  };


  /* ------------------------------------------------------------------------
     4. 格式
     ------------------------------------------------------------------------ */
  const MINUS = '−';
  App.fmt = {
    num(n, d = 0) {
      const s = Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
      return s.replace('-', MINUS);
    },
    signed(n, d = 2) {
      const r = Number(Number(n).toFixed(d));
      if (r === 0) return '±' + (0).toFixed(d);
      return (r > 0 ? '+' : MINUS) + Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    temp: (n, d = 2) => App.fmt.signed(n, d) + '°C',
    money(wan) {
      // 先用整數四捨五入到 0.01 億元：直接 toFixed 會被二進位誤差拖累（625,550 萬元 → 62.55，應為 62.56）
      return wan >= 10000 ? (Math.round(wan / 100) / 100).toFixed(2) + ' 億元' : App.fmt.num(wan) + ' 萬元';
    },
    pct: (n, d = 0) => App.fmt.num(n, d) + '%',
    date: iso => iso.replace(/-/g, '.'),
    dateZh(iso) {
      const [y, m, d] = iso.split('-').map(Number);
      return d ? `${y} 年 ${m} 月 ${d} 日` : `${y} 年 ${m} 月`;
    },
    period: ([a, b]) => `${App.fmt.date(a)}–${App.fmt.date(b)}`,
  };


  /* ------------------------------------------------------------------------
     5. 圖示
     ------------------------------------------------------------------------ */
  const ICONS = {
    water: '<path d="M12 3.2c3.4 4.3 5.8 7.7 5.8 10.6a5.8 5.8 0 0 1-11.6 0c0-2.9 2.4-6.3 5.8-10.6z"/><path d="M8.8 14.8c1.1.8 2.1.8 3.2 0s2.1-.8 3.2 0"/>',
    flood: '<path d="M7.2 3.5 6 7M12.2 3.5 11 7M17.2 3.5 16 7"/><path d="M3 13c1.5 1.1 3 1.1 4.5 0s3-1.1 4.5 0 3 1.1 4.5 0 3-1.1 4.5 0"/><path d="M3 18c1.5 1.1 3 1.1 4.5 0s3-1.1 4.5 0 3 1.1 4.5 0 3-1.1 4.5 0"/>',
    health: '<path d="M9.5 4.6a2.5 2.5 0 0 1 5 0v8.6a4.6 4.6 0 1 1-5 0z"/><path d="M12 9.5v6.8"/>',
    energy: '<path d="M13.2 2.8 5 13.6h6.2l-.6 7.6L19 10.4h-6.2z"/>',
    agri: '<path d="M2.5 12h19"/><path d="M12 12 4.5 21M12 12l7.5 9M12 12v9M12 12l-3.6 9M12 12l3.6 9"/><path d="M8.5 9a3.5 3.5 0 0 1 7 0"/>',
    coast: '<path d="M15.5 3.5V20.5H21"/><path d="M15.5 9H21M15.5 14.5H21"/><path d="M2.5 11.5c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0"/><path d="M2.5 16c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0"/><path d="M2.5 20.5c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6 8-6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17v.1"/>',
    replay: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/>',
    stripes: '<path d="M4 5h2.2v14H4zM8.2 5h1.4v14H8.2zM11.6 5h2.6v14h-2.6zM16.2 5h1.2v14h-1.2zM19.4 5h1.6v14h-1.6z" fill="currentColor" stroke="none"/>',
    line: '<path d="M3 16.5 8 11l4 3 4.5-7L21 10"/><path d="M3 20.5h18"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    pin: '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    file: '<path d="M6.5 3.5h7.5l4.5 4.5v12.5h-12z"/><path d="M14 3.5V8h4.5"/>',
    sort: '<path d="M8 4v16M4.5 7.5 8 4l3.5 3.5M16 20V4M12.5 16.5 16 20l3.5-3.5"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  App.icon = (name, cls = '') => {
    if (!ICONS[name]) throw new Error(`Unknown icon: ${name}`);
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  };


  /* ------------------------------------------------------------------------
     6. 計畫
     ------------------------------------------------------------------------ */
  App.statusLabel = { planning: '規劃中', ongoing: '執行中', delayed: '進度落後', done: '已完成' };
  App.plan = id => App.data.plans.find(p => p.id === id) || null;
  App.facet = key => App.data.facets.find(f => f.key === key) || null;
  App.agency = key => {
    const a = App.data.agencies[key];
    if (!a) throw new Error(`Unknown agency: ${key}`);
    return a.name;
  };
  App.planURL = plan => (plan.id === App.data.focus.id ? 'action.html' : `actions.html#${plan.id}`);

  App.facetTotals = () => {
    const blank = () => ({ count: 0, budget: 0, progressSum: 0, progress: 0 });
    const out = { all: blank() };
    App.data.facets.forEach(f => { out[f.key] = blank(); });
    App.data.plans.forEach(p => {
      [out[p.facet], out.all].forEach(t => { t.count++; t.budget += p.budget; t.progressSum += p.progress; });
    });
    Object.values(out).forEach(t => { t.progress = t.count ? Math.round(t.progressSum / t.count) : 0; delete t.progressSum; });
    return out;
  };

  App.planCardHTML = (plan, { level = 3 } = {}) => {
    const f = App.facet(plan.facet);
    const esc = App.esc;
    const kd = plan.kpi.decimals || 0;
    const agencies = [plan.agency, ...(plan.co || [])].map(App.agency).join('、');
    const title = plan.id === App.data.focus.id
      ? `<a href="action.html">${esc(plan.title)}</a>`
      : `<button type="button" class="plan-card__open" data-plan-open="${plan.id}">${esc(plan.title)}</button>`;
    const tone = plan.status === 'done' ? ' progress--ice' : plan.status === 'delayed' ? ' progress--hot' : '';
    return `<article class="card card--edge plan-card" data-plan="${plan.id}" data-facet="${plan.facet}">
  <div class="plan-card__head">
    <span class="facet-tag">${App.icon(f.key)}${esc(f.name)}<span class="facet-tag__code">${f.code}</span></span>
    <span class="status status--${plan.status}">${App.statusLabel[plan.status]}</span>
  </div>
  <h${level} class="plan-card__title">${title}</h${level}>
  <p class="plan-card__meta">${plan.id} · ${esc(plan.district)} · ${esc(agencies)}</p>
  <p class="plan-card__summary">${esc(plan.summary)}</p>
  <div class="plan-card__kpi"><span>${esc(plan.kpi.label)}${plan.kpi.dir === 'down' ? '（愈低愈好）' : ''}</span><span><b>${App.fmt.num(plan.kpi.current, kd)}</b> <small>/ ${App.fmt.num(plan.kpi.target, kd)} ${esc(plan.kpi.unit)}</small></span></div>
  <div class="plan-card__progress"><span>進度</span><div class="progress${tone}" data-progress="${plan.progress}" role="progressbar" aria-label="${esc(plan.title)} 執行進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${plan.progress}"><div class="progress__bar"></div></div><b>${plan.progress}%</b></div>
  <div class="plan-card__foot"><span>預算 <b>${App.fmt.money(plan.budget)}</b></span><span>${App.fmt.period(plan.period)}</span></div>
</article>`;
  };


  /* ------------------------------------------------------------------------
     7. 動態基礎：tween / inView / animate
     ------------------------------------------------------------------------ */
  App.tween = ({ from = 0, to = 1, duration = 600, ease = App.ease.outCubic, onUpdate, onDone }) => {
    let raf = 0;
    let cancelled = false;
    const t0 = performance.now();
    const step = now => {
      if (cancelled) return;
      const p = clamp((now - t0) / duration, 0, 1);
      onUpdate(from + (to - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
      else if (onDone) onDone();
    };
    raf = requestAnimationFrame(step);
    return { cancel() { cancelled = true; cancelAnimationFrame(raf); } };
  };

  App.inView = (el, cb, { once = true, threshold = 0, rootMargin = '0px 0px -8% 0px' } = {}) => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        cb(entry);
        if (once) io.disconnect();
      });
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  };

  App.animate = (el, fn) => {
    let visible = false;
    let raf = 0;
    let last = 0;
    let stopped = false;
    const shouldRun = () => visible && !document.hidden && !App.reducedMotion && !stopped;
    const frame = now => {
      raf = 0;
      if (!shouldRun()) return;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      fn(now, dt);
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      if (shouldRun() && !raf) { last = 0; raf = requestAnimationFrame(frame); }
      else if (!shouldRun() && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    motionQuery.addEventListener('change', sync);
    return () => {
      stopped = true;
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
      if (raf) cancelAnimationFrame(raf);
    };
  };


  /* ------------------------------------------------------------------------
     8. 進場與資料動態：reveal / count / progress / ring / motion
     ------------------------------------------------------------------------ */
  let revealIO = null;
  const pendingReveal = new Set();
  function reveal(el) {
    el.classList.add('is-in');
    pendingReveal.delete(el);
    if (revealIO) revealIO.unobserve(el);
  }
  function initReveal(root) {
    const els = $$('[data-reveal]', root).filter(el => !el.classList.contains('is-in'));
    if (!els.length) return;
    if (App.reducedMotion) { els.forEach(reveal); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        entries.forEach(e => { if (e.isIntersecting) reveal(e.target); });
        // 快速跳轉（錨點、End 鍵）時，已經捲過頭的元素也一併顯示，保證內容最終可見
        pendingReveal.forEach(el => { if (el.getBoundingClientRect().top < innerHeight) reveal(el); });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    }
    els.forEach(el => {
      // 初次載入就在視窗內的直接顯示，不等 observer
      if (el.getBoundingClientRect().top < innerHeight * .94) { reveal(el); return; }
      pendingReveal.add(el);
      revealIO.observe(el);
    });
  }

  App.count = (el, value) => {
    const d = +(el.dataset.decimals || 0);
    const signed = el.hasAttribute('data-sign');
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    const render = v => { el.textContent = pre + (signed ? App.fmt.signed(v, d) : App.fmt.num(v, d)) + suf; };
    if (el._countTween) el._countTween.cancel();
    if (App.reducedMotion) { el._countValue = value; render(value); return; }
    const from = el._countValue ?? 0;
    el._countTween = App.tween({
      from, to: value, duration: 1600, ease: App.ease.outExpo,
      onUpdate: v => { el._countValue = v; render(v); },
      onDone: () => { el._countTween = null; },
    });
  };

  function initDataMotion(root) {
    $$('[data-count]:not([data-count-init])', root).forEach(el => {
      el.setAttribute('data-count-init', '');
      App.inView(el, () => App.count(el, parseFloat(el.dataset.count)));
    });
    $$('[data-progress]:not([data-progress-init])', root).forEach(el => {
      el.setAttribute('data-progress-init', '');
      const run = () => el.style.setProperty('--v', el.dataset.progress);
      if (App.reducedMotion) run();
      else App.inView(el, run, { rootMargin: '0px' });
    });
    $$('[data-ring]:not([data-ring-init])', root).forEach(el => {
      el.setAttribute('data-ring-init', '');
      const value = el.querySelector('.ring__value');
      if (!value) throw new Error('[data-ring] needs a .ring__value circle');
      App.inView(el, () => { value.style.strokeDashoffset = String(100 - parseFloat(el.dataset.ring)); }, { rootMargin: '0px' });
    });
    $$('[data-motion]:not([data-motion-init])', root).forEach(el => {
      el.setAttribute('data-motion-init', '');
      new IntersectionObserver(([entry]) => el.classList.toggle('is-paused', !entry.isIntersecting)).observe(el);
    });
    $$('[data-stripes]', root).forEach(App.stripes.paint);
  }


  /* ------------------------------------------------------------------------
     9. Toast / modal / tabs / seg / tooltip / field
     ------------------------------------------------------------------------ */
  let toastHost = null;
  const modalStack = [];
  const topModal = () => modalStack[modalStack.length - 1] || null;

  function ensureToastHost() {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastHost);
    }
    // showModal() 把 dialog 放進 top layer，body 上的 toast 會被蓋住，所以跟著最上層的 modal 走
    const parent = topModal() || document.body;
    if (toastHost.parentNode !== parent) parent.appendChild(toastHost);
    return toastHost;
  }

  App.toast = (msg, { title = '', tone = 'default', timeout = 4200 } = {}) => {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.style.setProperty('--toast-t', timeout + 'ms');
    el.innerHTML = `<span class="toast__mark" aria-hidden="true"></span>
      <div>${title ? `<p class="toast__title">${App.esc(title)}</p>` : ''}<p class="toast__msg">${App.esc(msg)}</p></div>
      <button type="button" class="icon-btn icon-btn--sm toast__close" aria-label="關閉通知">${App.icon('close')}</button>`;
    host.appendChild(el);
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), App.reducedMotion ? 0 : 300);
    };
    el.querySelector('.toast__close').addEventListener('click', close);
    timer = setTimeout(close, timeout);
    return { el, close };
  };

  const resolveDialog = target => {
    const dlg = typeof target === 'string' ? document.getElementById(target) : target;
    if (!dlg || dlg.tagName !== 'DIALOG') throw new Error(`App.modal: dialog not found (${target})`);
    return dlg;
  };

  function wireDialog(dlg) {
    if (dlg._wired) return;
    dlg._wired = true;
    dlg.addEventListener('close', () => {
      const i = modalStack.indexOf(dlg);
      if (i > -1) modalStack.splice(i, 1);
      if (!modalStack.length) document.documentElement.classList.remove('modal-open');
      if (toastHost) ensureToastHost();
      const opener = dlg._opener;
      dlg._opener = null;
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
      dlg.dispatchEvent(new CustomEvent('modal:close'));
    });
    // 點在 dialog 外框以外（::backdrop）時關閉
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  }

  App.modal = {
    open(target, opener) {
      const dlg = resolveDialog(target);
      if (dlg.open) return dlg;
      wireDialog(dlg);
      dlg._opener = opener || document.activeElement;
      dlg.showModal();
      modalStack.push(dlg);
      document.documentElement.classList.add('modal-open');
      if (toastHost) ensureToastHost();
      dlg.dispatchEvent(new CustomEvent('modal:open'));
      return dlg;
    },
    close(target) {
      const dlg = target ? resolveDialog(target) : topModal();
      if (dlg && dlg.open) dlg.close();
    },
  };

  App.tabs = list => {
    if (list._tabs) return;
    const tabs = $$('[role="tab"]', list);
    // 分頁由 JS 動態產生時，載入當下的 tablist 還是空的：先不標記，等頁面插入分頁後再 App.scan 一次
    if (!tabs.length) return;
    list._tabs = true;
    const panelOf = tab => document.getElementById(tab.getAttribute('aria-controls'));
    const apply = tab => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = panelOf(t);
        if (panel) panel.hidden = !on;
      });
    };
    const select = (tab, focus) => {
      apply(tab);
      if (focus) tab.focus();
      list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: panelOf(tab), index: tabs.indexOf(tab) } }));
    };
    list.addEventListener('click', e => {
      const tab = e.target.closest('[role="tab"]');
      if (tab && list.contains(tab)) select(tab, false);
    });
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
    apply(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  };

  App.seg = group => {
    if (group._seg) return;
    group._seg = true;
    group.addEventListener('click', e => {
      const btn = e.target.closest('.seg__btn');
      if (!btn || !group.contains(btn) || btn.getAttribute('aria-pressed') === 'true') return;
      App.seg.set(group, btn.dataset.value);
    });
  };
  App.seg.set = (group, value, { silent = false } = {}) => {
    let hit = null;
    $$('.seg__btn', group).forEach(b => {
      const on = b.dataset.value === value;
      b.setAttribute('aria-pressed', String(on));
      if (on) hit = b;
    });
    if (!hit) throw new Error(`App.seg.set: no button with data-value="${value}"`);
    if (!silent) group.dispatchEvent(new CustomEvent('segchange', { detail: { value, button: hit } }));
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
      tipEl.classList.add('is-on');
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      const left = clamp(x - w / 2, 8, innerWidth - w - 8);
      const top = y - h - 14 < 8 ? y + 18 : y - h - 14;
      tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    },
    hide() { if (tipEl) tipEl.classList.remove('is-on'); },
  };

  let uid = 0;
  App.field = {
    setError(input, msg) {
      const field = input.closest('.field');
      if (!field) throw new Error('App.field.setError: input must be inside .field');
      field.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      let err = $('.field__error', field);
      if (!err) { err = document.createElement('p'); err.className = 'field__error'; field.appendChild(err); }
      if (!err.id) err.id = (input.id || 'field-' + (++uid)) + '-err';
      err.textContent = msg;
      const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!ids.includes(err.id)) input.setAttribute('aria-describedby', [...ids, err.id].join(' '));
    },
    clear(input) {
      const field = input.closest('.field');
      if (!field) return;
      field.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      const err = $('.field__error', field);
      if (err) err.textContent = '';
    },
    clearAll(form) {
      $$('.field.is-invalid', form).forEach(f => f.classList.remove('is-invalid'));
      $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid'));
      $$('.field__error', form).forEach(e => { e.textContent = ''; });
    },
  };
  App.valid = {
    required: v => String(v ?? '').trim() !== '',
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()),
    phone: v => /^(09\d{2}-?\d{3}-?\d{3}|0\d{1,2}-?\d{6,8})$/.test(String(v).replace(/\s/g, '')),
    int: (v, min, max) => /^-?\d+$/.test(String(v).trim()) && +v >= min && +v <= max,
  };


  /* ------------------------------------------------------------------------
     10. StripeChart —— 招牌圖表引擎
     同一組資料在「條碼」與「折線」兩種表現間連續變形：
     morph = 0 時每條色帶填滿整個高度；morph = 1 時色帶縮成落在數值高度的一小段，
     再由折線與移動平均串起來。每條色帶有自己的延遲（由左而右＋固定擾動），
     上緣用 ease-in、下緣用 ease-out，看起來像蠟一樣往數值的位置「融化」。
     ------------------------------------------------------------------------ */
  const FONT_MONO = '500 11px "JetBrains Mono", ui-monospace, monospace';
  const noise = i => { const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };
  function movingAverage(values, win) {
    const half = Math.floor(win / 2);
    return values.map((_, i) => {
      const part = values.slice(Math.max(0, i - half), i + half + 1).filter(v => v != null);
      return part.length ? mean(part) : null;
    });
  }

  class StripeChart {
    constructor(host, opts = {}) {
      if (!host) throw new Error('StripeChart: host element is required');
      const o = Object.assign({
        values: App.climate.values,
        start: App.climate.start,
        from: null,
        to: null,
        mode: 'stripes',
        grow: true,
        growDuration: 2600,
        axis: true,
        smooth: 11,
        yDomain: [-0.8, 1.6],
        yTicks: [-0.5, 0, 0.5, 1, 1.5],
        tickFormat: v => App.fmt.signed(v, 1) + '°C',
        baselineLabel: '1971–2000 平均',
        annotateMax: true,
        color: App.climate.color,
        format: App.climate.format,
        label: '澄港市 1901–2025 年均溫距平條碼',
        onHover: null,
        onGrow: null,
        onMode: null,
        onRange: null,
      }, opts);
      this.o = o;
      this.host = host;
      this.values = o.values;
      this.start = o.start;
      this.end = o.start + o.values.length - 1;
      this.range = [o.from ?? this.start, o.to ?? this.end];
      this.view = this.range.slice();
      this.mode = o.mode;
      this.morph = o.mode === 'line' ? 1 : 0;
      this.growP = o.grow && !App.reducedMotion ? 0 : 1;
      this.hoverYear = null;
      this.colors = o.values.map(v => (v == null ? null : o.color(v)));
      this.rgb = this.colors.map(c => (c ? hexToRgb(c) : null));
      this.liftRgb = this.colors.map(c => (c ? hexToRgb(lift(c)) : null));
      this.smoothed = o.smooth ? movingAverage(o.values, o.smooth) : null;
      this.jitter = o.values.map((_, i) => noise(i));
      this.tweens = new Map();
      this.raf = 0;
      this.W = 0;
      this.H = 0;
      this._frame = this._frame.bind(this);
      this._build();
      if (this.growP < 1) {
        this._stopGrowWatch = App.inView(host, () => this.replay(), { threshold: .2, rootMargin: '0px' });
      } else if (o.onGrow) {
        o.onGrow(this.range[1], true);
      }
    }

    _build() {
      const host = this.host;
      host.classList.add('sc');
      host.tabIndex = 0;
      host.setAttribute('role', 'group');
      host.setAttribute('aria-roledescription', '互動圖表');
      host.setAttribute('aria-label', `${this.o.label}。可用左右方向鍵逐年查看，Shift 加方向鍵一次跳十年。`);
      host.dataset.mode = this.mode;
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      this.ctx = this.canvas.getContext('2d');
      this.tip = document.createElement('div');
      this.tip.className = 'sc__tip';
      this.tip.setAttribute('aria-hidden', 'true');
      this.live = document.createElement('p');
      this.live.className = 'sr-only';
      this.live.setAttribute('aria-live', 'polite');
      host.append(this.canvas, this.tip, this.live);

      this._onMove = e => {
        const r = host.getBoundingClientRect();
        this.highlight(this._yearAt(e.clientX - r.left));
      };
      this._onLeave = () => this.highlight(null);
      this._onKey = e => this._key(e);
      host.addEventListener('pointermove', this._onMove);
      host.addEventListener('pointerdown', this._onMove);
      host.addEventListener('pointerleave', this._onLeave);
      host.addEventListener('blur', this._onLeave);
      host.addEventListener('keydown', this._onKey);

      this.ro = new ResizeObserver(() => this._resize());
      this.ro.observe(host);
      // 字型載入後重畫，canvas 上的刻度才會用到 JetBrains Mono
      document.fonts.ready.then(() => this._requestDraw());
    }

    _resize() {
      const r = this.host.getBoundingClientRect();
      this.W = r.width;
      this.H = r.height;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      // 改尺寸會清空 canvas，立即重畫避免閃一格空白
      this._draw();
    }

    /* ---------- 幾何 ---------- */
    _geom() {
      const axisH = this.o.axis ? 26 : 0;
      const PH = this.H - axisH;
      const [v0, v1] = this.view;
      const span = v1 - v0 + 1;
      const sw = this.W / span;
      const [d0, d1] = this.o.yDomain;
      const pad = Math.min(30, PH * .09);
      return {
        PH, v0, v1, sw,
        xOf: y => (y - v0) * sw,
        yOf: v => pad + (1 - (v - d0) / (d1 - d0)) * (PH - pad * 2),
      };
    }

    _yearAt(x) {
      if (x < 0 || x > this.W) return null;
      const { v0, sw } = this._geom();
      const year = Math.floor(v0 + x / sw);
      const lo = Math.max(this.start, Math.ceil(this.view[0]));
      const hi = Math.min(this.end, Math.floor(this.view[1]));
      return clamp(year, lo, hi);
    }

    /* ---------- 動畫 ---------- */
    _tween(key, from, to, dur, set, done) {
      this.tweens.set(key, { from, to, dur, set, done, t0: performance.now() });
      this._requestDraw();
    }
    _requestDraw() {
      if (!this.raf) this.raf = requestAnimationFrame(this._frame);
    }
    _frame(now) {
      this.raf = 0;
      for (const [key, tw] of this.tweens) {
        const p = clamp((now - tw.t0) / tw.dur, 0, 1);
        tw.set(lerp(tw.from, tw.to, p));
        if (p >= 1) {
          this.tweens.delete(key);
          if (tw.done) tw.done();
        }
      }
      this._draw();
      if (this.tweens.size) this._requestDraw();
    }

    /* ---------- 繪製 ---------- */
    _draw() {
      const { ctx, W, H } = this;
      if (!W || !H) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const g = this._geom();
      const { PH, v0, v1, sw, xOf, yOf } = g;
      const m = this.morph;
      const gridA = smoothstep(.25, .85, m);
      const lineA = smoothstep(.5, 1, m);
      const yA = Math.max(this.start, Math.floor(v0));
      const yB = Math.min(this.end, Math.ceil(v1));
      const spanPos = Math.max(1, v1 - v0);

      // 1) 網格線（折線模式才浮現）
      if (gridA > 0) {
        ctx.lineWidth = 1;
        this.o.yTicks.forEach(t => {
          const y = Math.round(yOf(t)) + .5;
          ctx.strokeStyle = `rgba(236,237,239,${(t === 0 ? .32 : .08) * gridA})`;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        });
      }

      // 2) 色帶：長出（grow）＋融化（morph）
      const dot = clamp(sw * .55, 3, 6);
      const thin = Math.max(2, Math.min(sw * .6, 6));
      for (let year = yA; year <= yB; year++) {
        const i = year - this.start;
        const v = this.values[i];
        if (v == null) continue;
        const pos = clamp((year - v0) / spanPos, 0, 1);
        const gi = this.growP >= 1 ? 1 : clamp((this.growP - pos * .72) / .28, 0, 1);
        const mi = m <= 0 ? 0 : m >= 1 ? 1 : clamp(m * 1.6 - (pos * .38 + this.jitter[i] * .22), 0, 1);
        if (gi <= 0 && mi <= 0) continue;
        const yv = yOf(v);
        const topS = PH * (1 - App.ease.outCubic(gi));
        const top = lerp(topS, yv - dot / 2, App.ease.inCubic(mi));
        const bot = lerp(PH, yv + dot / 2, App.ease.outCubic(mi));
        const w = lerp(sw + .6, thin, App.ease.inOutCubic(mi));
        const c = this.rgb[i];
        const cl = this.liftRgb[i];
        // 融化成點時，兩端最深的藍與紅漸漸換成提亮版（同色系），避免在夜色背景上消失
        const k = App.ease.inOutCubic(mi);
        ctx.fillStyle = `rgb(${lerp(c[0], cl[0], k) | 0},${lerp(c[1], cl[1], k) | 0},${lerp(c[2], cl[2], k) | 0})`;
        ctx.fillRect(xOf(year) + (sw - w) / 2, top, w, Math.max(0, bot - top));
      }

      // 3) 年值折線＋移動平均（由左往右畫出）
      if (lineA > 0) {
        const reveal = W * smoothstep(.45, 1, m);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, reveal, PH);
        ctx.clip();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const path = (arr, alpha, width) => {
          ctx.strokeStyle = `rgba(247,251,255,${alpha})`;
          ctx.lineWidth = width;
          ctx.beginPath();
          let pen = false;
          for (let year = yA; year <= yB; year++) {
            const v = arr[year - this.start];
            if (v == null) { pen = false; continue; }
            const x = xOf(year) + sw / 2, y = yOf(v);
            if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            pen = true;
          }
          ctx.stroke();
        };
        path(this.values, .26 * lineA, 1);
        if (this.smoothed) path(this.smoothed, .95 * lineA, 2.25);
        ctx.restore();
      }

      // 4) 刻度文字（帶底色，壓在資料上仍可讀）
      if (gridA > 0) {
        ctx.font = FONT_MONO;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        this.o.yTicks.forEach(t => {
          const label = this.o.tickFormat(t);
          const y = yOf(t);
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = `rgba(11,13,18,${.82 * gridA})`;
          ctx.fillRect(12, y - 9, tw + 12, 18);
          ctx.fillStyle = `rgba(138,144,160,${gridA})`;
          ctx.fillText(label, 18, y);
        });
        if (this.o.baselineLabel) {
          const label = this.o.baselineLabel;
          const tw = ctx.measureText(label).width;
          const y = yOf(0) - 14;
          ctx.fillStyle = `rgba(11,13,18,${.82 * gridA})`;
          ctx.fillRect(W - tw - 26, y - 9, tw + 14, 18);
          ctx.fillStyle = `rgba(138,144,160,${gridA})`;
          ctx.textAlign = 'right';
          ctx.fillText(label, W - 18, y);
        }
      }

      // 5) 極值標註
      if (this.o.annotateMax && lineA > 0) {
        let best = null;
        for (let year = Math.ceil(v0); year <= yB; year++) {
          const v = this.values[year - this.start];
          if (v != null && (best == null || v > best.v)) best = { year, v };
        }
        if (best) {
          const x = xOf(best.year) + sw / 2, y = yOf(best.v);
          const label = `${best.year}  ${this.o.format(best.v)}  最高`;
          ctx.font = FONT_MONO;
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(label).width;
          const right = x + 14 + tw > W - 8;
          ctx.globalAlpha = lineA;
          ctx.strokeStyle = 'rgba(236,237,239,.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x, y - 18);
          ctx.lineTo(right ? x - 8 : x + 8, y - 18);
          ctx.stroke();
          ctx.fillStyle = '#ECEDEF';
          ctx.textAlign = right ? 'right' : 'left';
          ctx.fillText(label, right ? x - 12 : x + 12, y - 18);
          ctx.globalAlpha = 1;
        }
      }

      // 6) 滑過：條碼模式壓暗其他年份，折線模式畫準星
      const hy = this.hoverYear;
      if (hy != null && hy >= yA && hy <= yB) {
        const x = xOf(hy);
        const sA = 1 - m;
        if (sA > 0) {
          ctx.fillStyle = `rgba(11,13,18,${.5 * sA})`;
          ctx.fillRect(0, 0, Math.max(0, x), PH);
          ctx.fillRect(x + sw, 0, Math.max(0, W - x - sw), PH);
          if (sw >= 5) {
            ctx.strokeStyle = `rgba(247,251,255,${.85 * sA})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + .5, .5, sw - 1, PH - 1);
          }
        }
        if (m > 0) {
          const v = this.values[hy - this.start];
          const cx = x + sw / 2, cy = yOf(v);
          ctx.strokeStyle = `rgba(236,237,239,${.32 * m})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(cx) + .5, 0);
          ctx.lineTo(Math.round(cx) + .5, PH);
          ctx.stroke();
          ctx.globalAlpha = m;
          ctx.beginPath();
          ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = this.colors[hy - this.start];
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#0B0D12';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(247,251,255,.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // 7) 年份軸
      if (this.o.axis) this._drawAxis(g);
      this._placeTip(g);
    }

    _drawAxis({ PH, v0, v1, sw, xOf }) {
      const { ctx, W } = this;
      ctx.font = FONT_MONO;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#8A90A0';
      ctx.strokeStyle = 'rgba(236,237,239,.22)';
      ctx.lineWidth = 1;
      const base = this.H - 6;
      const first = Math.max(this.start, Math.ceil(v0));
      const last = Math.min(this.end, Math.floor(v1));
      const step = [1, 2, 5, 10, 20, 25, 50].find(s => s * sw >= 70) || 50;
      const marks = [{ year: first, align: 'left' }];
      for (let y = Math.ceil(first / step) * step; y < last; y += step) {
        // 太靠近端點的刻度省略，避免文字重疊
        if ((y - first) * sw < 52 || (last - y) * sw < 52) continue;
        marks.push({ year: y, align: 'center' });
      }
      if (last > first) marks.push({ year: last, align: 'right' });
      marks.forEach(({ year, align }) => {
        const cx = xOf(year) + sw / 2;
        ctx.beginPath();
        ctx.moveTo(Math.round(cx) + .5, PH + 2);
        ctx.lineTo(Math.round(cx) + .5, PH + 7);
        ctx.stroke();
        ctx.textAlign = align;
        // 兩端標籤內縮，滿版圖表時才不會貼齊視窗邊
        const tx = align === 'left' ? Math.max(10, xOf(year)) : align === 'right' ? Math.min(W - 10, xOf(year) + sw) : cx;
        ctx.fillText(String(year), tx, base);
      });
    }

    _placeTip({ PH, sw, xOf, yOf }) {
      const hy = this.hoverYear;
      if (hy == null) { this.tip.classList.remove('is-on'); return; }
      const i = hy - this.start;
      const v = this.values[i];
      const html = `<i style="--c:${this.colors[i]}"></i><b>${hy}</b>${App.esc(this.o.format(v))}`;
      if (this.tip.innerHTML !== html) this.tip.innerHTML = html;
      this.tip.classList.add('is-on');
      const tw = this.tip.offsetWidth;
      const th = this.tip.offsetHeight;
      const cx = xOf(hy) + sw / 2;
      const left = clamp(cx - tw / 2, 6, this.W - tw - 6);
      const topStripes = 12;
      const topLine = clamp(yOf(v) - th - 16, 6, PH - th - 6);
      const top = lerp(topStripes, topLine, smoothstep(.3, .9, this.morph));
      this.tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    /* ---------- 互動 ---------- */
    _key(e) {
      const lo = Math.max(this.start, Math.ceil(this.view[0]));
      const hi = Math.min(this.end, Math.floor(this.view[1]));
      const cur = this.hoverYear ?? hi;
      const jump = e.shiftKey ? 10 : 1;
      let next;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = this.hoverYear == null ? hi : cur + jump;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = this.hoverYear == null ? hi : cur - jump;
      else if (e.key === 'Home') next = lo;
      else if (e.key === 'End') next = hi;
      else if (e.key === 'Escape') { this.highlight(null); return; }
      else return;
      e.preventDefault();
      next = clamp(next, lo, hi);
      this.highlight(next);
      this.live.textContent = `${next} 年：${this.o.format(this.values[next - this.start])}`;
    }

    highlight(year) {
      if (year === this.hoverYear) return;
      this.hoverYear = year;
      this._requestDraw();
      if (this.o.onHover) {
        this.o.onHover(year == null ? null : { year, value: this.values[year - this.start], color: this.colors[year - this.start] });
      }
    }

    setMode(mode, { instant = false } = {}) {
      if (mode !== 'stripes' && mode !== 'line') throw new Error(`StripeChart.setMode: unknown mode ${mode}`);
      this.mode = mode;
      this.host.dataset.mode = mode;
      const target = mode === 'line' ? 1 : 0;
      if (instant || App.reducedMotion) {
        this.tweens.delete('morph');
        this.morph = target;
        this._requestDraw();
      } else {
        // 從目前的中間狀態接續，連點也不會跳格
        const dist = Math.abs(target - this.morph);
        this._tween('morph', this.morph, target, 500 + 1300 * dist, v => { this.morph = v; });
      }
      if (this.o.onMode) this.o.onMode(mode);
    }

    toggle() { this.setMode(this.mode === 'line' ? 'stripes' : 'line'); }

    setRange(from, to, { instant = false } = {}) {
      const a = clamp(Math.round(from), this.start, this.end);
      const b = clamp(Math.round(to), a, this.end);
      this.range = [a, b];
      if (this.hoverYear != null && (this.hoverYear < a || this.hoverYear > b)) this.highlight(null);
      if (instant || App.reducedMotion) {
        this.tweens.delete('range');
        this.view = [a, b];
        this._requestDraw();
      } else {
        const start = this.view.slice();
        this._tween('range', 0, 1, 750, p => {
          const e = App.ease.inOutCubic(p);
          this.view = [lerp(start[0], a, e), lerp(start[1], b, e)];
        });
      }
      if (this.o.onRange) this.o.onRange(a, b);
    }

    replay() {
      if (App.reducedMotion) {
        this.growP = 1;
        this._requestDraw();
        if (this.o.onGrow) this.o.onGrow(this.range[1], true);
        return;
      }
      let lastYear = null;
      const [r0, r1] = this.range;
      this.growP = 0;
      this._tween('grow', 0, 1, this.o.growDuration, v => {
        this.growP = v;
        if (!this.o.onGrow) return;
        // 「目前長到哪一年」：讓頁面可以同步跑年份讀數
        const year = Math.round(r0 + clamp((v - .14) / .72, 0, 1) * (r1 - r0));
        if (year !== lastYear) { lastYear = year; this.o.onGrow(year, false); }
      }, () => { if (this.o.onGrow) this.o.onGrow(r1, true); });
    }

    destroy() {
      this.ro.disconnect();
      if (this._stopGrowWatch) this._stopGrowWatch();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.tweens.clear();
      const h = this.host;
      h.removeEventListener('pointermove', this._onMove);
      h.removeEventListener('pointerdown', this._onMove);
      h.removeEventListener('pointerleave', this._onLeave);
      h.removeEventListener('blur', this._onLeave);
      h.removeEventListener('keydown', this._onKey);
      this.canvas.remove();
      this.tip.remove();
      this.live.remove();
    }
  }
  App.StripeChart = StripeChart;


  /* ------------------------------------------------------------------------
     11. 外殼：導覽、頁首、訂閱表單、宣告式 toast / modal
     ------------------------------------------------------------------------ */
  function initShell() {
    // 依目前檔名標示導覽（各頁靜態 markup 也要自己標好，這裡是保險）
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.site-nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    const toggle = $('.nav-toggle');
    const nav = $('#site-nav');
    if (toggle && nav) {
      const setOpen = open => {
        toggle.setAttribute('aria-expanded', String(open));
        nav.classList.toggle('is-open', open);
        document.documentElement.classList.toggle('nav-open', open);
      };
      toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
      nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
      });
      matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    }

    const header = $('.site-header');
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // 頁首即時讀數
    $$('[data-now-readout]').forEach(el => {
      const n = App.data.now;
      el.innerHTML = `<span class="swatch" style="--c:${App.climate.color(n.monthAnomaly)}" aria-hidden="true"></span>${App.esc(n.station.replace('氣象站', '站'))} ${n.monthLabel} 距平 <b>${App.fmt.temp(n.monthAnomaly, 1)}</b>`;
    });

    $$('form[data-subscribe]').forEach(form => {
      form.addEventListener('submit', e => {
        e.preventDefault();
        App.field.clearAll(form);
        const email = form.elements.email;
        const boxes = $$('input[name="topic"]', form);
        const topics = boxes.filter(i => i.checked).map(i => i.parentElement.textContent.trim());
        let first = null;
        if (!App.valid.required(email.value)) { App.field.setError(email, '請輸入 Email'); first = email; }
        else if (!App.valid.email(email.value)) { App.field.setError(email, 'Email 格式不正確，例如 name@example.com'); first = email; }
        if (boxes.length && !topics.length) { App.field.setError(boxes[0], '請至少勾選一種通知'); first = first || boxes[0]; }
        if (first) { first.focus(); return; }
        App.toast(`${topics.join('、')}通知將寄到 ${email.value.trim()}。每封信末都有取消訂閱連結。`, { title: '訂閱完成', tone: 'cool' });
        form.reset();
      });
    });

    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-modal-open]');
      if (opener) { e.preventDefault(); App.modal.open(opener.dataset.modalOpen, opener); return; }
      const closer = e.target.closest('[data-modal-close]');
      if (closer) { App.modal.close(closer.closest('dialog') || undefined); return; }
      const toaster = e.target.closest('[data-toast]');
      if (toaster) App.toast(toaster.dataset.toast, { title: toaster.dataset.toastTitle || '' });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && topModal()) App.modal.close();
    });
  }

  App.scan = (root = document) => {
    initReveal(root);
    initDataMotion(root);
    $$('[data-tabs]', root).forEach(App.tabs);
    $$('[data-seg]', root).forEach(App.seg);
    $$('dialog.modal', root).forEach(wireDialog);
  };

  document.documentElement.classList.add('js');
  initShell();
  App.scan(document);
})();
