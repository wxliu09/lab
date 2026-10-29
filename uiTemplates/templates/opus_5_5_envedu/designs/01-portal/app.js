/*
 * 環境教育人員推廣運用管理系統（民眾網）— 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 * <head> 另有一行 <script>document.documentElement.classList.add('js')</script>（從 index.html 複製）。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 時間：App.NOW = 2026-10-28（民國 115 年 10 月 28 日，星期三）10:30；App.TODAY = '2026-10-28'
 * 字典
 *   App.COUNTIES   22 縣市 {id, name, short, col, row, lat, lng, region, island}；App.county(id)
 *   App.TOPICS     8 主題 {id, name, short, icon}；App.topic(id)
 *   App.AUDIENCES  8 服務對象 {id, name}；App.audience(id)
 *   App.LIFE       淨零綠生活 7 主題 {id, char, name, title, icon, desc, actions[], topics[]}；App.life(id)
 *   App.MODES      {onsite:'實體', online:'線上'}
 *   App.STAGES     案件 9 關卡 {key, label, desc, icon, tone}；App.stageIndex(key)
 *   App.APPLY_WINDOW 目前受理的活動日期區間 {min, max}（申請頁月曆與講師介紹頁的候選日期共用）
 *   App.FEE        講座鐘點費（示意費率）{note, minutes, rates[{key,label,rate}], travel[{max,label,amount}], island, travelNote}
 * 資料（只在記憶體中變動；人名／案號／數字全站一致）
 *   App.LECTURERS  42 位講師（欄位見下方 Lecturer 註解）；App.lecturer(id)
 *   App.CASES      15 件申請案（欄位見下方 Case 註解）；App.case(id)
 *   App.ME         講師專區的登入者 'L005'（陳思妤，花蓮縣）
 *   App.DEMO_TRACK 進度查詢的示範案號與電話 [{id, phone, hint}]
 *   App.NEWS       最新消息 6 則；App.FAQ  常見問題（apply / lecturer / fee 三組）
 *   App.STATS      115 年度推廣概況（系統上線後的虛構數據）
 *   App.FEED       首頁「最近媒合」動態 [{from(講師縣市), to(申請縣市), lecturer, org, place, topic}]
 *   App.TREND_YEARS / App.TREND_NOTE  講師歷年滿意度的年度與資料來源說明
 * 查詢與計算
 *   App.countByCounty('serve' | 'home') → {countyId: n}
 *   App.match({county, topic, audience, mode, month, exclude:[]}) → [{l, score, reasons[], warns[]}]（依條件篩選，規則式計分排序）
 *   App.distanceKm(fromId, toId) · App.travelTier(fromId, toId) → {label, amount, island}
 *   App.feeEstimate({rateKey, sessions, from, to, mode}) → {rate, sessions, minutes, lecture, km, tier, travel, total}
 *   App.availability(lecturerId, 'YYYY-MM') → {avail:[iso], busy:{iso: label}}
 *   App.schedule(lecturerId) → 該講師的案件（依日期排序）
 *   App.emit(reason) 資料改變後呼叫：重繪所有 [data-count] 並在 document 發出 'app:data'
 *   App.on(fn) 訂閱 'app:data'；App.registerCount(name, fn) 新增 [data-count="name"] 的計算
 * 格式
 *   App.fmt.num / money（2,000 元）/ roc（115/10/28）/ rocLong（115 年 10 月 28 日（三））/ rocYM / md / dow / rel / time
 *   App.toDate(iso) · App.iso(date) · App.esc(str) · App.param(name) · App.$(sel, root) · App.$$(sel, root) · App.rng(seed)
 * 標記產生器（回傳 HTML 字串）
 *   App.icon(name, cls) · App.avatar(l, size) · App.stars(v) · App.topicTag(id) · App.lifeTag(id) · App.modeBadges(l)
 *   App.lecturerCard(l, {pick, picked, reasons, warns, applyLink}) · App.stageBadge(c) · App.caseTimeline(c)
 *   App.emptyState({title, text, action:{label, href}}) · App.certLabel(l)
 * 互動
 *   App.toast(title, {desc, tone:'ok'|'info'|'warn'|'err', action:{label, onClick}, duration})
 *   App.openDialog(dialogEl) · App.closeDialog(dialogEl)（toast 會自動移進開啟中的 dialog）
 *   App.modal({title, lead, body, icon, tone:'clay'|'err', size:'sm'|'lg', actions:[{label, variant, onClick(close), keepOpen}]}) → {el, close}
 *   App.tabs(tablistEl, {onChange(index, tab)}) → {select(i)} · App.seg(segEl, {onChange(value, btn)}) → {value(), set(v)}
 *   App.accordion(rootEl, {single}) · App.reveal(root) · App.whenVisible(el, fn)
 *   App.countUp(el, to, {decimals, dur}) · App.odometer(el, value, {decimals})（連續呼叫會讀最新目標，不會重疊）
 *   App.loop(el, tick(dt)) → {start(), stop()}：rAF 迴圈，元素離開視窗或分頁隱藏時自動暫停
 *   App.reducedMotion() → boolean
 *   任何元素加 data-toast="訊息"（可加 data-toast-desc、data-toast-tone）點擊即出 toast，用於沒有實際目的地的動作
 * 招牌動態引擎
 *   App.tileMap(host, {theme:'paper'|'forest', mode:'static'|'select', values, showValue, unit, multi, required,
 *     selected:[], onChange(ids, id), compact, home, seeds:{order:[ids], dots:{id:n}}, matches:[{from,to,...}],
 *     onMatch(m), matchEvery, arcs:[{from,to}], label}) → {el, setValues(v), select(ids), getSelected(), replay(), center(id)}
 *       seeds：種子落下→新芽→講師點；matches：媒合弧線＋光點循環；arcs：授課足跡弧線（畫一次，接在方塊右上角）
 *       showValue 時數值 0 預設不顯示（hideZero:false 可顯示）；home 縣市加陶土色外框
 *   App.vine(container, {nodes:'[data-vine-node]'}) → {refresh(), destroy()}：藤蔓隨捲動長出（單調遞增），節點到達加 .is-reached
 *   App.calendar(host, {month:'YYYY-MM', min, max, avail:[iso]|fn, busy:{iso:label}, events:{iso:label}, selected:[],
 *     maxSelect, onSelect(list), onMonth(ym), onDay(iso), label}) → {setMonth(ym), setData({avail, busy, events}), setSelected(list), getSelected()}
 *   App.barChart(host, {data:[{label, value, note}], unit, highlight, height, onDark, title, format}) → wrap 元素
 *   App.lineChart(host, {labels:[], values:[], min, max, unit, title, decimals, notes:[], labelSuffix}) → wrap 元素
 *     （兩者都依容器寬度繪製並在寬度改變時重繪，文字固定 13px；進入視窗才播放成長動畫）
 *   App.hbars(host, {data:[{label, value}], unit, max, onDark, format}) → wrap 元素
 */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  /* ===================================================================
     基本工具
     =================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  App.$ = $;
  App.$$ = $$;
  App.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.param = name => new URLSearchParams(location.search).get(name);
  App.reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = n => String(n).padStart(2, '0');
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const easeInOut = p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  App.ease = { out: easeOut, inOut: easeInOut, back: easeBack };

  // 固定種子的亂數：同一位講師在每一頁產生的衍生資料都一樣
  function hashStr(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return (h >>> 0);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  App.rng = seed => mulberry32(hashStr(String(seed)));

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs = {}) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* ===================================================================
     日期與格式
     =================================================================== */
  App.NOW = new Date(2026, 9, 28, 10, 30);
  App.TODAY = '2026-10-28';
  const DOW = '日一二三四五六';
  App.toDate = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  App.iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  App.fmt = {
    num: (n, decimals = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    money: n => `${Number(n).toLocaleString('en-US')} 元`,
    roc: iso => { const d = App.toDate(iso); return `${d.getFullYear() - 1911}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; },
    rocLong: iso => { const d = App.toDate(iso); return `${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（${DOW[d.getDay()]}）`; },
    rocYM: ym => { const [y, m] = ym.split('-').map(Number); return `${y - 1911} 年 ${m} 月`; },
    md: iso => { const d = App.toDate(iso); return `${d.getMonth() + 1}/${d.getDate()}`; },
    dow: iso => DOW[App.toDate(iso).getDay()],
    rel: iso => {
      const diff = Math.round((App.toDate(iso) - App.toDate(App.TODAY)) / 864e5);
      if (diff === 0) return '今天';
      if (diff === 1) return '明天';
      if (diff === -1) return '昨天';
      return diff > 0 ? `${diff} 天後` : `${-diff} 天前`;
    },
    time: t => t,
    pct: (v, decimals = 0) => `${(v * 100).toFixed(decimals)}%`,
  };

  /* ===================================================================
     字典
     =================================================================== */
  // 方塊地圖座標：6 欄 × 8 列，依地理大致排列（東北在右上、離島在左欄）
  App.COUNTIES = [
    { id: 'LIE', name: '連江縣', short: '連江', col: 1, row: 1, lat: 26.16, lng: 119.95, region: '離島', island: true },
    { id: 'TPE', name: '臺北市', short: '臺北', col: 5, row: 1, lat: 25.04, lng: 121.56, region: '北部' },
    { id: 'KEE', name: '基隆市', short: '基隆', col: 6, row: 1, lat: 25.13, lng: 121.74, region: '北部' },
    { id: 'TAO', name: '桃園市', short: '桃園', col: 4, row: 2, lat: 24.99, lng: 121.30, region: '北部' },
    { id: 'NTP', name: '新北市', short: '新北', col: 5, row: 2, lat: 25.01, lng: 121.46, region: '北部' },
    { id: 'KIN', name: '金門縣', short: '金門', col: 1, row: 3, lat: 24.43, lng: 118.32, region: '離島', island: true },
    { id: 'HSC', name: '新竹市', short: '竹市', col: 3, row: 3, lat: 24.80, lng: 120.97, region: '北部' },
    { id: 'HSQ', name: '新竹縣', short: '竹縣', col: 4, row: 3, lat: 24.83, lng: 121.01, region: '北部' },
    { id: 'ILA', name: '宜蘭縣', short: '宜蘭', col: 5, row: 3, lat: 24.75, lng: 121.75, region: '東部' },
    { id: 'MIA', name: '苗栗縣', short: '苗栗', col: 3, row: 4, lat: 24.56, lng: 120.82, region: '中部' },
    { id: 'TXG', name: '臺中市', short: '臺中', col: 4, row: 4, lat: 24.15, lng: 120.67, region: '中部' },
    { id: 'HUA', name: '花蓮縣', short: '花蓮', col: 5, row: 4, lat: 23.99, lng: 121.60, region: '東部' },
    { id: 'CHA', name: '彰化縣', short: '彰化', col: 3, row: 5, lat: 24.08, lng: 120.54, region: '中部' },
    { id: 'NAN', name: '南投縣', short: '南投', col: 4, row: 5, lat: 23.91, lng: 120.68, region: '中部' },
    { id: 'PEN', name: '澎湖縣', short: '澎湖', col: 1, row: 6, lat: 23.57, lng: 119.58, region: '離島', island: true },
    { id: 'YUN', name: '雲林縣', short: '雲林', col: 2, row: 6, lat: 23.71, lng: 120.54, region: '中部' },
    { id: 'CYI', name: '嘉義市', short: '嘉市', col: 3, row: 6, lat: 23.48, lng: 120.45, region: '南部' },
    { id: 'CYQ', name: '嘉義縣', short: '嘉縣', col: 4, row: 6, lat: 23.46, lng: 120.33, region: '南部' },
    { id: 'TTT', name: '臺東縣', short: '臺東', col: 5, row: 6, lat: 22.76, lng: 121.14, region: '東部' },
    { id: 'TNN', name: '臺南市', short: '臺南', col: 3, row: 7, lat: 22.99, lng: 120.21, region: '南部' },
    { id: 'KHH', name: '高雄市', short: '高雄', col: 4, row: 7, lat: 22.63, lng: 120.30, region: '南部' },
    { id: 'PIF', name: '屏東縣', short: '屏東', col: 4, row: 8, lat: 22.67, lng: 120.49, region: '南部' },
  ];
  const countyMap = Object.fromEntries(App.COUNTIES.map(c => [c.id, c]));
  App.county = id => countyMap[id];

  App.TOPICS = [
    { id: 'climate', name: '氣候變遷與調適', short: '氣候調適', icon: 't-climate' },
    { id: 'netzero', name: '淨零綠生活', short: '淨零綠生活', icon: 't-netzero' },
    { id: 'circular', name: '循環經濟與資源回收', short: '循環經濟', icon: 't-circular' },
    { id: 'energy', name: '能源轉型與節能', short: '能源節能', icon: 't-energy' },
    { id: 'biodiv', name: '生物多樣性', short: '生物多樣性', icon: 't-biodiv' },
    { id: 'food', name: '綠色飲食', short: '綠色飲食', icon: 't-food' },
    { id: 'transit', name: '低碳交通', short: '低碳交通', icon: 't-transit' },
    { id: 'health', name: '環境與健康', short: '環境健康', icon: 't-health' },
  ];
  const topicMap = Object.fromEntries(App.TOPICS.map(t => [t.id, t]));
  App.topic = id => topicMap[id];

  App.AUDIENCES = [
    { id: 'preschool', name: '學前' },
    { id: 'elem', name: '國小' },
    { id: 'junior', name: '國中' },
    { id: 'senior', name: '高中職' },
    { id: 'college', name: '大專校院' },
    { id: 'community', name: '社區與長青' },
    { id: 'agency', name: '機關團體' },
    { id: 'enterprise', name: '企業' },
  ];
  const audMap = Object.fromEntries(App.AUDIENCES.map(a => [a.id, a]));
  App.audience = id => audMap[id];

  App.LIFE = [
    { id: 'food', char: '食', name: '食', title: '吃在地、吃當季', icon: 'l-food', topics: ['food', 'netzero'],
      desc: '一餐飯的碳足跡，藏在食材走過的距離、季節與剩下的份量裡。從菜單、採買到廚餘，都是減碳的起點。',
      actions: ['選擇在地當季食材，縮短食物里程', '依人數備餐、剩食再利用', '自備餐具與容器，少用一次性包裝'] },
    { id: 'cloth', char: '衣', name: '衣', title: '穿得久、穿得少', icon: 'l-cloth', topics: ['circular', 'netzero'],
      desc: '一件衣服從棉田、染整到運送都會排碳。延長衣物壽命、二手交換與修補，是最直接的循環行動。',
      actions: ['購買前先盤點衣櫃、減少衝動購物', '參與舊衣交換與修補工作坊', '選擇耐穿、可回收材質的衣物'] },
    { id: 'home', char: '住', name: '住', title: '省電節水的家', icon: 'l-home', topics: ['energy', 'climate'],
      desc: '家裡的冷氣、照明與熱水是排碳大宗。調整使用習慣、改善遮陽通風，就能兼顧舒適與節能。',
      actions: ['冷氣設定 26–28°C 並搭配電扇', '汰換老舊家電、選用節能標章產品', '裝設省水器材、回收雨水澆花'] },
    { id: 'move', char: '行', name: '行', title: '步行、單車、大眾運輸', icon: 'l-move', topics: ['transit', 'health'],
      desc: '交通是城市排碳的重要來源。短程步行或騎單車、中長程搭乘大眾運輸，同時也照顧了自己的健康。',
      actions: ['500 公尺內步行、3 公里內騎單車', '通勤通學優先搭乘大眾運輸', '共乘與合併出門行程'] },
    { id: 'edu', char: '育', name: '育', title: '從教室到社區的環境學習', icon: 'l-edu', topics: ['climate', 'biodiv'],
      desc: '環境教育不只在課堂。把校園、社區與自然當成教室，讓每個年齡層都能理解並參與淨零行動。',
      actions: ['把節能、減塑變成班級與社區公約', '參與環境教育講座與戶外學習', '把學到的行動分享給家人'] },
    { id: 'play', char: '樂', name: '樂', title: '低碳旅遊與自然休閒', icon: 'l-play', topics: ['biodiv', 'transit'],
      desc: '休閒也能很低碳：選擇大眾運輸可達的景點、無痕山林，並支持在地的生態旅遊與小店。',
      actions: ['搭乘大眾運輸前往旅遊景點', '遵守無痕山林、不帶走一草一木', '支持在地生態導覽與小農市集'] },
    { id: 'shop', char: '購', name: '購', title: '減塑、綠色消費與惜物', icon: 'l-shop', topics: ['circular', 'netzero'],
      desc: '每一次購買都是一次選擇。認識環保標章、自備購物袋、少買不需要的東西，就是有力的減碳行動。',
      actions: ['認明環保標章與碳足跡標籤', '自備購物袋、選擇無包裝商品', '先修理、再二手、最後才買新的'] },
  ];
  const lifeMap = Object.fromEntries(App.LIFE.map(l => [l.id, l]));
  App.life = id => lifeMap[id];

  App.MODES = { onsite: '實體', online: '線上' };
  App.CERT_FIELDS = ['學校環境教育', '環境及資源管理', '自然保育', '公害防治', '社區參與', '文化保存', '氣候變遷', '災害防救'];

  App.STAGES = [
    { key: 'submitted', label: '送件', icon: 'send', tone: 'neutral', desc: '申請已送出，系統產生案件編號並寄送確認信。' },
    { key: 'review', label: '初審', icon: 'clipboard', tone: 'info', desc: '承辦人員檢核申請資料與附件，必要時通知補件。' },
    { key: 'matching', label: '媒合中', icon: 'match', tone: 'info', desc: '依主題、對象、縣市與日期篩選講師並發出邀約。' },
    { key: 'confirm', label: '講師確認', icon: 'user', tone: 'clay', desc: '等待講師回覆檔期，講師須於 3 個工作天內回覆。' },
    { key: 'scheduled', label: '待執行', icon: 'calendar', tone: 'forest', desc: '講師已確認，活動前 7 天寄送行前通知。' },
    { key: 'done', label: '已執行', icon: 'presentation', tone: 'ok', desc: '活動已辦理完成，歡迎填寫滿意度問卷。' },
    { key: 'report', label: '成果回填', icon: 'file', tone: 'clay', desc: '講師回填實到人數、實際時數、簽到表與活動照片。' },
    { key: 'survey', label: '滿意度', icon: 'smile', tone: 'forest', desc: '彙整參與者與申請單位的滿意度回饋。' },
    { key: 'closed', label: '結案', icon: 'check', tone: 'ok', desc: '講座鐘點費與交通費核銷完成，案件結案。' },
  ];
  App.stageIndex = key => App.STAGES.findIndex(s => s.key === key);

  // 受理區間：今天起 14 天後（保留初審與媒合時間）到第 4 季截止的 116 年 2 月底
  App.APPLY_WINDOW = { min: '2026-11-11', max: '2027-02-28' };

  App.FEE = {
    note: '講座鐘點費（示意費率，可於系統設定調整）',
    minutes: 50,
    rates: [
      { key: 'expert', label: '外聘專家學者', rate: 2000 },
      { key: 'external', label: '外聘一般講師', rate: 1600 },
      { key: 'internal', label: '內聘講師', rate: 1000 },
    ],
    travel: [
      { max: 30, label: '30 公里以內', amount: 200 },
      { max: 80, label: '30–80 公里', amount: 600 },
      { max: 150, label: '80–150 公里', amount: 1200 },
      { max: 250, label: '150–250 公里', amount: 2000 },
      { max: Infinity, label: '250 公里以上', amount: 2800 },
    ],
    island: { label: '跨海往返離島（依實際票價，示意）', amount: 4000 },
    travelNote: '交通費依距離級距示意，實際依核定與單據核實支付',
  };
  App.rate = key => App.FEE.rates.find(r => r.key === key) || App.FEE.rates[0];

  /* ===================================================================
     講師
     Lecturer 欄位：id, name, gender, title, org, county(戶籍縣市), serve[可到場縣市], topics[], audiences[],
       modes['onsite','online'], months[可授課月份 1–12], cert{way, field, no, until}, rateKey, sessions(近一年場次),
       rating(平均滿意度 /5), life[七大主題], since(開始授課年), bio
     衍生欄位（App.lecturer 已計算）：color, weekdays[], modules[{title, topic, sessions, audiences}],
       trend[112–115 年度滿意度], footprint{countyId: 場次, online: 場次}, feedback[{text, who, score}], responses(問卷份數)
     =================================================================== */
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const SCHOOLYEAR = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12];
  const RAW_LECTURERS = [
    ['L001', '林予恩', 'F', '退休國小自然科教師', '溪畔社區大學', 'NTP', ['NTP', 'TPE', 'KEE', 'TAO'], ['netzero', 'climate', 'food'], ['elem', 'community', 'preschool'], 'both', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['經歷', '學校環境教育', '108-0214', '2028-06-30'], 'expert', 14, 4.9, ['food', 'edu', 'shop'], 2012,
      '在國小教自然二十年，退休後在社區大學開設「家庭淨零生活」課程。擅長用廚房裡的器材做小實驗，讓孩子與長輩都能動手算出自己的碳足跡。'],
    ['L002', '張皓鈞', 'M', '能源管理顧問', '綠光節能工作室', 'TPE', ['TPE', 'NTP', 'KEE', 'TAO', 'HSC'], ['energy', 'netzero', 'climate'], ['senior', 'college', 'agency', 'enterprise'], 'both', [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12], ['專長', '環境及資源管理', '107-0388', '2027-09-30'], 'expert', 11, 4.7, ['home', 'move'], 2014,
      '協助超過四十所學校與企業完成節能診斷。課程以真實電費單與用電曲線切入，帶學員找出最划算的節能行動。'],
    ['L003', '黃柏霖', 'M', '綠色餐飲推廣講師', '南瀛食農學會', 'TNN', ['TNN', 'KHH', 'CYQ', 'CYI'], ['food', 'netzero', 'circular'], ['elem', 'junior', 'community', 'enterprise'], 'onsite', SCHOOLYEAR, ['專長', '社區參與', '109-0167', '2029-02-28'], 'external', 12, 4.8, ['food', 'shop'], 2016,
      '曾任飯店主廚，現推廣在地當季與惜食料理。課程常搭配現場示範，從一道菜的食材里程談到剩食減量。'],
    ['L004', '李沛晴', 'F', '大學兼任講師（環境科學）', '中台灣永續發展學會', 'TXG', ['TXG', 'CHA', 'NAN', 'MIA'], ['climate', 'biodiv', 'health'], ['senior', 'college', 'agency'], 'both', [2, 3, 4, 5, 6, 9, 10, 11, 12], ['學歷', '氣候變遷', '110-0052', '2030-01-31'], 'expert', 9, 4.6, ['edu', 'play'], 2018,
      '專長氣候科學溝通，把國際氣候評估報告轉譯成高中生聽得懂的語言，並設計桌遊讓學員模擬城市的調適決策。'],
    ['L005', '陳思妤', 'F', '生態解說員', '洄瀾自然步道協會', 'HUA', ['HUA', 'TTT', 'ILA'], ['biodiv', 'netzero', 'climate'], ['elem', 'junior', 'senior', 'community'], 'both', SCHOOLYEAR, ['經歷', '自然保育', '106-0573', '2027-03-31'], 'expert', 16, 4.9, ['play', 'edu', 'food'], 2011,
      '在花東縱谷與海岸帶解說超過十年，擅長把步道上的一片葉子、一隻螃蟹變成課堂。近年推動「淨零登山」，教大家用低碳方式親近山海。'],
    ['L006', '王士豪', 'M', '循環經濟輔導顧問', '港都循環設計所', 'KHH', ['KHH', 'PIF', 'TNN'], ['circular', 'energy', 'netzero'], ['junior', 'senior', 'agency', 'enterprise'], 'both', ALL, ['專長', '公害防治', '108-0291', '2028-11-30'], 'expert', 10, 4.6, ['shop', 'cloth'], 2017,
      '輔導中小企業導入循環設計與資源回收流程，課程以工廠實例說明「廢棄物變資源」的商業模式。'],
    ['L007', '吳宜蓁', 'F', '社區營造工作者', '蘭陽溼地教育中心', 'ILA', ['ILA', 'KEE', 'NTP'], ['biodiv', 'health', 'food'], ['preschool', 'elem', 'community'], 'onsite', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['經歷', '社區參與', '107-0145', '2027-12-31'], 'external', 13, 4.8, ['food', 'play'], 2013,
      '長年陪伴宜蘭社區守護溼地，帶長輩與孩子一起做生態調查。課程溫暖、節奏慢，特別適合社區據點與幼兒園。'],
    ['L008', '蔡明哲', 'M', '低碳運輸規劃師', '桃園綠行交通協會', 'TAO', ['TAO', 'HSQ', 'HSC', 'NTP'], ['transit', 'netzero', 'climate'], ['senior', 'college', 'agency', 'enterprise'], 'both', [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], ['專長', '環境及資源管理', '109-0233', '2029-05-31'], 'expert', 8, 4.5, ['move'], 2019,
      '交通工程背景，擅長分析通勤數據，協助機關與企業規劃員工低碳通勤方案。'],
    ['L009', '劉安琪', 'F', '國中理化教師', '風城科學教育推廣會', 'HSC', ['HSC', 'HSQ', 'MIA', 'TAO'], ['energy', 'climate', 'netzero'], ['elem', 'junior', 'senior'], 'both', [1, 2, 6, 7, 8, 11, 12], ['學歷', '學校環境教育', '111-0018', '2031-04-30'], 'external', 7, 4.7, ['home', 'edu'], 2020,
      '把風力發電機、太陽能小車帶進教室，用動手做的方式解釋能源轉換。寒暑假與週末可支援各級學校。'],
    ['L010', '鄭家瑋', 'M', '友善農場主人', '八卦山食農教育農場', 'CHA', ['CHA', 'TXG', 'YUN', 'NAN'], ['food', 'biodiv', 'circular'], ['preschool', 'elem', 'community', 'enterprise'], 'onsite', [1, 2, 3, 4, 5, 10, 11, 12], ['經歷', '自然保育', '108-0377', '2028-08-31'], 'external', 9, 4.8, ['food', 'shop'], 2015,
      '返鄉經營友善耕作農場，課程從土壤裡的生物講到餐桌，可安排農場參訪或到校帶領種菜與堆肥實作。'],
    ['L011', '許雅雯', 'F', '護理師（環境與健康）', '諸羅健康城市促進會', 'CYI', ['CYI', 'CYQ', 'YUN', 'TNN'], ['health', 'climate', 'food'], ['senior', 'community', 'agency', 'enterprise'], 'both', ALL, ['專長', '公害防治', '110-0129', '2030-06-30'], 'external', 6, 4.7, ['food', 'home'], 2020,
      '在醫院服務十五年，關注高溫、空污與長者健康。課程提供社區據點可以立即使用的熱傷害預防清單。'],
    ['L012', '謝承恩', 'M', '綠色飲食講師', '大肚山食物森林', 'TXG', ['TXG', 'CHA', 'NAN', 'MIA'], ['food', 'netzero', 'biodiv'], ['elem', 'junior', 'community', 'enterprise'], 'both', SCHOOLYEAR, ['專長', '社區參與', '108-0402', '2028-09-30'], 'external', 15, 4.8, ['food', 'shop', 'play'], 2014,
      '推動「食物森林」與在地蔬食，擅長帶領社區共煮與剩食再利用。課程互動性高，長輩參與度佳。'],
    ['L013', '楊淑芬', 'F', '退休國小校長', '南國環境教育共學團', 'PIF', ['PIF', 'KHH', 'TTT'], ['netzero', 'biodiv', 'climate'], ['elem', 'junior', 'agency'], 'onsite', ALL, ['經歷', '學校環境教育', '105-0089', '2030-10-31'], 'expert', 12, 4.9, ['edu', 'food'], 2008,
      '擔任校長期間帶領學校成為綠色學校典範，現協助偏鄉學校規劃環境教育課程與校園節能改造。'],
    ['L014', '洪志偉', 'M', '森林療育師', '日月山林學苑', 'NAN', ['NAN', 'TXG', 'CHA', 'YUN', 'CYQ'], ['biodiv', 'health', 'climate'], ['senior', 'college', 'community', 'enterprise'], 'onsite', [3, 4, 5, 6, 9, 10, 11, 12], ['專長', '自然保育', '109-0281', '2029-07-31'], 'external', 10, 4.8, ['play', 'edu'], 2016,
      '結合森林療育與生態解說，帶領學員用五感認識森林，也協助企業規劃員工的低碳戶外學習日。'],
    ['L015', '郭品妍', 'F', '永續時尚設計師', '再織工作室', 'TPE', ['TPE', 'NTP', 'TAO'], ['circular', 'netzero'], ['junior', 'senior', 'college', 'enterprise'], 'both', ALL, ['專長', '環境及資源管理', '111-0064', '2031-03-31'], 'external', 8, 4.7, ['cloth', 'shop'], 2019,
      '從快時尚的碳足跡談起，帶學員拆解舊衣、重新設計，課程常以「一件衣服的一生」工作坊進行。'],
    ['L016', '曾信宏', 'M', '農業剩餘資材研究員', '濁水溪循環農業研究室', 'YUN', ['YUN', 'CHA', 'CYI', 'CYQ'], ['circular', 'energy', 'food'], ['senior', 'college', 'agency', 'enterprise'], 'both', ALL, ['學歷', '環境及資源管理', '110-0201', '2030-08-31'], 'expert', 6, 4.6, ['food', 'home'], 2018,
      '研究稻殼、菇包等農業剩餘資材的再利用，課程以實驗與案例說明農村的循環經濟機會。'],
    ['L017', '廖婉婷', 'F', '客家食農教育講師', '山城食農學堂', 'MIA', ['MIA', 'HSQ', 'HSC', 'TXG'], ['food', 'health', 'biodiv'], ['preschool', 'elem', 'community'], 'onsite', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['經歷', '文化保存', '109-0144', '2029-03-31'], 'external', 9, 4.8, ['food', 'edu'], 2015,
      '從客家醃漬與節氣飲食切入綠色飲食，帶孩子與長輩一起做曬菜、醃梅，體會惜物與在地的生活經驗。'],
    ['L018', '賴俊宏', 'M', '太陽光電工程師', '北海岸綠能合作社', 'NTP', ['NTP', 'TPE', 'KEE', 'ILA'], ['energy', 'netzero', 'climate'], ['junior', 'senior', 'community', 'enterprise'], 'both', ALL, ['專長', '環境及資源管理', '110-0311', '2030-12-31'], 'expert', 7, 4.6, ['home'], 2019,
      '參與社區型公民電廠建置，課程說明屋頂光電的原理、成本與回收，適合社區與企業決策者。'],
    ['L019', '周育萱', 'F', '部落生態導覽員', '都蘭山海文化協會', 'TTT', ['TTT', 'HUA', 'PIF'], ['biodiv', 'climate', 'food'], ['elem', 'junior', 'community'], 'onsite', SCHOOLYEAR, ['經歷', '文化保存', '108-0190', '2028-04-30'], 'external', 11, 4.9, ['food', 'play'], 2014,
      '以部落傳統生態知識帶領山海導覽，講述海岸與山林的互動，課程常結合野菜採集與分享餐。'],
    ['L020', '徐國書', 'M', '海洋廢棄物調查員', '雨港海洋保育聯盟', 'KEE', ['KEE', 'NTP', 'TPE', 'ILA'], ['circular', 'biodiv', 'climate'], ['elem', 'junior', 'senior', 'enterprise'], 'both', [3, 4, 5, 6, 7, 8, 9, 10, 11], ['專長', '公害防治', '109-0356', '2029-10-31'], 'external', 8, 4.7, ['shop', 'play'], 2017,
      '帶隊進行淨灘與海廢分類調查，用數據說明塑膠如何進入海洋，課程可搭配淨灘行動。'],
    ['L021', '蘇曉瑩', 'F', '幼教老師', '綠芽幼兒自然教育坊', 'KHH', ['KHH', 'PIF', 'TNN'], ['netzero', 'biodiv', 'food'], ['preschool', 'elem', 'community'], 'onsite', SCHOOLYEAR, ['學歷', '學校環境教育', '111-0122', '2031-06-30'], 'external', 10, 4.8, ['edu', 'food', 'play'], 2018,
      '專為幼兒設計的自然遊戲與繪本課程，透過種子盒、落葉拼貼，讓孩子從小養成惜物與觀察的習慣。'],
    ['L022', '葉建良', 'M', '氣候調適規劃師', '南方城市韌性研究室', 'TNN', ['TNN', 'KHH', 'CYQ', 'CYI'], ['climate', 'health', 'transit'], ['senior', 'college', 'agency', 'enterprise'], 'both', ALL, ['學歷', '氣候變遷', '110-0087', '2030-03-31'], 'expert', 9, 4.7, ['home', 'move'], 2017,
      '參與城市淹水與熱島調適規劃，課程以地圖與情境推演，帶機關同仁討論在地的調適優先順序。'],
    ['L023', '江怡君', 'F', '企業永續輔導顧問', '永續企業實踐協會', 'TAO', ['TAO', 'HSQ', 'HSC', 'NTP', 'TPE'], ['netzero', 'energy', 'circular'], ['agency', 'enterprise'], 'both', ALL, ['專長', '環境及資源管理', '111-0035', '2031-02-28'], 'expert', 7, 4.6, ['shop', 'move'], 2020,
      '協助企業盤查溫室氣體並訂定減量目標，課程聚焦員工可參與的淨零行動與綠色採購。'],
    ['L024', '何宗翰', 'M', '海洋教育教師', '菊島海洋教育中心', 'PEN', ['PEN'], ['biodiv', 'climate', 'circular'], ['elem', 'junior', 'senior', 'community'], 'both', SCHOOLYEAR, ['學歷', '自然保育', '110-0244', '2030-09-30'], 'external', 6, 4.8, ['play', 'food'], 2018,
      '在澎湖教書也研究潮間帶，課程帶學生認識石滬、珊瑚與海洋暖化，可支援線上連線教學。'],
    ['L025', '呂佳穎', 'F', '食農教育推廣員', '竹東綠食共學社', 'HSQ', ['HSQ', 'HSC', 'MIA', 'TAO'], ['food', 'netzero', 'health'], ['preschool', 'elem', 'junior', 'community'], 'onsite', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['經歷', '社區參與', '110-0298', '2030-07-31'], 'external', 8, 4.7, ['food', 'shop'], 2019,
      '帶領親子與學校認識在地小農，課程以「一餐的旅程」為主軸，從菜園走到餐桌，再談到廚餘回收。'],
    ['L026', '潘柏宇', 'M', '原住民族傳統生態知識講師', '太魯閣山林文化工作坊', 'HUA', ['HUA', 'TTT', 'ILA', 'NAN'], ['biodiv', 'climate', 'health'], ['elem', 'junior', 'senior', 'community'], 'onsite', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['薦舉', '文化保存', '109-0068', '2029-01-31'], 'external', 9, 4.8, ['play', 'edu'], 2015,
      '分享太魯閣族的山林知識與狩獵倫理，帶學員重新理解人與自然的分寸，課程深受高中職學生喜愛。'],
    ['L027', '簡詩涵', 'F', '綠色消費講師', '綠川社區學苑', 'TXG', ['TXG', 'CHA', 'MIA'], ['circular', 'netzero', 'food'], ['junior', 'senior', 'community', 'agency'], 'both', ALL, ['專長', '社區參與', '110-0175', '2030-05-31'], 'external', 11, 4.7, ['shop', 'cloth', 'food'], 2017,
      '教大家看懂環保標章與商品碳足跡，課程搭配超市實境挑戰，讓學員練習做出更好的消費選擇。'],
    ['L028', '林冠廷', 'M', '島嶼生態解說員', '浯洲生態保育協會', 'KIN', ['KIN'], ['biodiv', 'climate', 'netzero'], ['elem', 'junior', 'community'], 'both', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['經歷', '自然保育', '110-0263', '2030-10-31'], 'external', 5, 4.7, ['play', 'edu'], 2018,
      '熟悉金門的鸕鷀、鱟與溼地生態，課程介紹島嶼的生物多樣性保育，並可為離島學校提供在地化教材。'],
    ['L029', '陳映彤', 'F', '島嶼環境教育推廣員', '北竿島嶼生態工作室', 'LIE', ['LIE'], ['biodiv', 'circular', 'climate'], ['elem', 'junior', 'community'], 'both', [3, 4, 5, 6, 9, 10, 11], ['經歷', '自然保育', '111-0098', '2031-05-31'], 'external', 4, 4.8, ['play', 'shop'], 2020,
      '在馬祖推動減塑與海洋保育，課程結合燕鷗等島嶼生態；冬季以線上授課為主。'],
    ['L030', '方振宇', 'M', '建築節能講師', '都市綠建築研究社', 'TPE', ['TPE', 'NTP', 'KEE'], ['energy', 'climate', 'health'], ['senior', 'college', 'agency', 'enterprise'], 'both', ALL, ['學歷', '環境及資源管理', '109-0150', '2029-06-30'], 'expert', 7, 4.6, ['home'], 2016,
      '建築系背景，專長綠建築與室內熱舒適，帶學員從自己的教室、辦公室找出遮陽、通風與節電的改善點。'],
    ['L031', '陶心怡', 'F', '自然農法農夫', '冬山河友善農園', 'ILA', ['ILA', 'NTP', 'KEE'], ['food', 'biodiv', 'circular'], ['preschool', 'elem', 'community', 'enterprise'], 'onsite', [1, 2, 3, 4, 5, 10, 11, 12], ['經歷', '自然保育', '110-0219', '2030-04-30'], 'external', 9, 4.8, ['food', 'play'], 2016,
      '以自然農法種稻養鴨，課程帶學員下田觀察田間生物，談糧食、土地與氣候之間的關係。'],
    ['L032', '范書維', 'M', '森林生態研究員', '山村林下經濟促進會', 'CYQ', ['CYQ', 'CYI', 'YUN', 'NAN', 'TNN'], ['biodiv', 'climate', 'circular'], ['junior', 'senior', 'college', 'community'], 'both', ALL, ['學歷', '自然保育', '109-0333', '2029-09-30'], 'expert', 8, 4.7, ['play', 'edu'], 2015,
      '研究中海拔森林與林下經濟，課程介紹森林碳匯、生物多樣性與山村永續產業。'],
    ['L033', '沈雨潔', 'F', '環境心理學講師', '溪岸身心環境研究室', 'NTP', ['NTP', 'TPE', 'TAO'], ['health', 'climate', 'biodiv'], ['senior', 'college', 'agency', 'enterprise'], 'both', ALL, ['學歷', '社區參與', '111-0141', '2031-07-31'], 'external', 6, 4.7, ['play', 'home'], 2021,
      '探討綠地、噪音與氣候焦慮對身心的影響，課程協助學員建立與自然連結的日常習慣。'],
    ['L034', '魏正綸', 'M', '公共運輸規劃師', '南方軌道生活協會', 'KHH', ['KHH', 'TNN', 'PIF'], ['transit', 'netzero', 'health'], ['junior', 'senior', 'college', 'agency'], 'both', ALL, ['專長', '環境及資源管理', '110-0158', '2030-02-28'], 'external', 7, 4.6, ['move'], 2018,
      '從輕軌、公車到共享單車，分析城市交通的碳排放，帶學員規劃自己的低碳通學與通勤路線。'],
    ['L035', '傅佩珊', 'F', '長青據點環境教育講師', '鹿港長青樂活協會', 'CHA', ['CHA', 'TXG', 'YUN'], ['health', 'food', 'netzero'], ['community', 'agency'], 'onsite', ALL, ['經歷', '社區參與', '111-0077', '2031-01-31'], 'internal', 10, 4.9, ['food', 'home', 'play'], 2019,
      '專為長青族群設計的環境課程：語速慢、字卡大，以台語、國語雙語進行，常搭配手作與懷舊話題。'],
    ['L036', '康以諾', 'M', '生物多樣性調查員', '溪口生態調查團', 'TNN', ['TNN', 'CYQ', 'KHH', 'PEN'], ['biodiv', 'climate', 'circular'], ['elem', 'junior', 'senior', 'college'], 'both', SCHOOLYEAR, ['專長', '自然保育', '109-0217', '2029-11-30'], 'external', 8, 4.7, ['play', 'edu'], 2016,
      '長期記錄黑面琵鷺與河口生態，課程搭配望遠鏡與鳥類圖鑑，也可透過線上直播帶學生看候鳥。'],
    ['L037', '程若瑜', 'F', '零廢棄生活倡議者', '無包裝生活實驗室', 'TPE', ['TPE', 'NTP', 'TAO', 'KEE'], ['circular', 'netzero', 'food'], ['junior', 'senior', 'college', 'community', 'enterprise'], 'both', ALL, ['專長', '公害防治', '110-0094', '2030-11-30'], 'external', 12, 4.8, ['shop', 'food', 'cloth'], 2017,
      '經營無包裝商店多年，分享減塑與零廢棄的實踐經驗。課程輕鬆有趣，常以學員自己的垃圾桶為教材。'],
    ['L038', '羅偉誠', 'M', '農電共生顧問', '屏南農電共生研究會', 'PIF', ['PIF', 'KHH', 'TTT'], ['energy', 'food', 'climate'], ['senior', 'college', 'agency', 'enterprise'], 'both', ALL, ['專長', '環境及資源管理', '111-0105', '2031-03-31'], 'expert', 6, 4.5, ['home', 'food'], 2020,
      '協助農民評估農電共生與魚電共生，課程說明再生能源與農地利用的取捨，適合機關與農業團體。'],
    ['L039', '姚子晴', 'F', '製程節能工程師', '風城綠色製程協會', 'HSC', ['HSC', 'HSQ', 'TAO'], ['energy', 'netzero', 'circular'], ['college', 'enterprise'], 'both', ALL, ['專長', '公害防治', '111-0156', '2031-08-31'], 'expert', 5, 4.6, ['home', 'move'], 2021,
      '在科技廠負責製程節能與水資源回收，課程以實際改善專案說明企業如何兼顧產能與減碳。'],
    ['L040', '孫振凱', 'M', '河川守護講師', '溪流守護聯盟', 'MIA', ['MIA', 'HSQ', 'TXG'], ['biodiv', 'health', 'climate'], ['elem', 'junior', 'community'], 'onsite', [3, 4, 5, 6, 9, 10, 11], ['經歷', '社區參與', '110-0277', '2030-06-30'], 'external', 7, 4.7, ['play', 'edu'], 2017,
      '帶領社區定期巡守溪流，教學員檢測水質、辨識水生昆蟲，課程可搭配溪邊踏查。'],
    ['L041', '白芷涵', 'F', '慢食料理講師', '縱谷慢食廚房', 'TTT', ['TTT', 'HUA'], ['food', 'health', 'netzero'], ['elem', 'community', 'enterprise'], 'onsite', [1, 2, 3, 4, 5, 9, 10, 11, 12], ['經歷', '社區參與', '110-0302', '2030-12-31'], 'external', 8, 4.8, ['food'], 2018,
      '以縱谷米食與在地食材為主角，示範簡單的低碳料理。課程常以共食收尾，讓學員帶著食譜回家。'],
    ['L042', '杜孟哲', 'M', '水資源教育講師', '流域教育工作站', 'NAN', ['NAN', 'CHA', 'YUN', 'TXG'], ['climate', 'health', 'biodiv'], ['elem', 'junior', 'senior', 'agency'], 'both', ALL, ['學歷', '災害防救', '109-0198', '2029-08-31'], 'expert', 9, 4.7, ['home', 'edu'], 2015,
      '專長水資源與防災教育，以流域模型展示乾旱與豪雨的影響，協助學校規劃節水與防災行動。'],
  ];

  const MODULE_TITLES = {
    climate: ['極端天氣下的我們：氣候變遷入門', '校園與社區的氣候調適行動', '從熱島到綠蔭：城市降溫工作坊'],
    netzero: ['淨零綠生活：從一天的碳足跡開始', '家庭節電與減碳挑戰', '淨零生活實踐家：七大面向行動清單'],
    circular: ['垃圾去哪裡？資源循環的旅程', '惜物再生：舊物改造工作坊', '社區與企業的循環經濟實務'],
    energy: ['認識再生能源：太陽、風與水', '校園節能偵探', '能源轉型與我的電費單'],
    biodiv: ['走讀身邊的生物多樣性', '溼地、森林與海岸的生命網', '友善生態的社區行動'],
    food: ['在地當季飲食與食物里程', '惜食料理與剩食減量', '從產地到餐桌：食農教育體驗'],
    transit: ['低碳通勤怎麼選？', '單車、步行與大眾運輸的城市', '校園低碳交通週規劃'],
    health: ['空氣、水與我們的健康', '高溫時代的健康調適', '綠色空間與身心健康'],
  };
  const FEEDBACK_POOL = [
    { aud: 'elem', who: '國小四年級導師', text: '講師準備的實驗教具很吸睛，孩子下課還圍著問問題，回家也主動提醒家人關燈。' },
    { aud: 'elem', who: '國小學務主任', text: '課程節奏掌握得很好，兩節課從觀察到討論再到行動，學生的學習單寫得特別認真。' },
    { aud: 'junior', who: '國中自然科教師', text: '用真實數據帶學生推論，比課本更有說服力，學生分組報告時都能引用講師提供的資料。' },
    { aud: 'senior', who: '高中職公民科教師', text: '講師願意回應學生尖銳的提問，討論氣氛熱烈，是今年最受學生好評的講座。' },
    { aud: 'college', who: '大學通識課助教', text: '內容扎實又有在地案例，修課同學在期末專題中延伸了講師提到的調查方法。' },
    { aud: 'community', who: '社區發展協會總幹事', text: '長輩們聽得很投入，講師用台語穿插舉例，結束後大家還留下來交流自家的做法。' },
    { aud: 'community', who: '長青據點志工', text: '字卡大、講話慢，長輩看得清楚也聽得懂，動手做的環節大家都很開心。' },
    { aud: 'preschool', who: '幼兒園園長', text: '把自然觀察變成遊戲，小朋友一直搶著回答，老師們也學到很多帶活動的方法。' },
    { aud: 'agency', who: '公所承辦人員', text: '講師事前就主動確認同仁的需求，內容和業務很貼近，課後問卷滿意度很高。' },
    { aud: 'enterprise', who: '企業人資專員', text: '以員工日常行動為主軸，不流於口號，課後我們真的把幾項建議放進公司內規。' },
    { aud: 'enterprise', who: '企業永續專案經理', text: '講師對減碳盤查的實務很熟，回答問題精準，主管們都覺得收穫很大。' },
    { aud: 'junior', who: '國中二年級學生', text: '原來我們班一天的用電這麼多！下次換我們當節能小組的組長。' },
    { aud: 'elem', who: '國小五年級學生', text: '最喜歡戶外觀察的時間，我找到三種不同的蜘蛛和一隻青蛙。' },
    { aud: 'community', who: '社區媽媽', text: '學到很多剩食料理的小撇步，回家馬上試做，家人都說好吃。' },
  ];
  const WEEKDAY_PATTERNS = [[1, 2, 3, 4, 5], [2, 3, 4], [1, 3, 5], [3, 4, 5, 6], [2, 4, 6], [1, 2, 3, 4, 5, 6]];
  const AVATAR_COLORS = ['#1F5D4A', '#2A6D88', '#9A5223', '#184B3C', '#4F6B2C', '#35617A'];
  App.TREND_YEARS = ['112', '113', '114', '115'];
  App.TREND_NOTE = '112–114 年度為前案計畫紀錄匯入，115 年度起為本系統問卷統計';

  App.LECTURERS = RAW_LECTURERS.map((r, idx) => {
    const [id, name, gender, title, org, county, serve, topics, audiences, modes, months, cert, rateKey, sessions, rating, life, since, bio] = r;
    const rnd = App.rng(id);
    const l = {
      id, name, gender, title, org, county, serve, topics, audiences,
      modes: modes === 'both' ? ['onsite', 'online'] : [modes],
      months, cert: { way: cert[0], field: cert[1], no: `環教人認字第 ${cert[2]} 號`, until: cert[3] },
      rateKey, sessions, rating, life, since, bio,
    };
    l.color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    l.weekdays = WEEKDAY_PATTERNS[Math.floor(rnd() * WEEKDAY_PATTERNS.length)];
    l.responses = Math.round(sessions * (24 + rnd() * 14));
    l.modules = topics.map((t, i) => ({
      title: MODULE_TITLES[t][(idx + i) % 3],
      topic: t,
      sessions: rnd() < .55 ? 2 : 3,
      audiences: audiences.filter((a, j) => (j + i) % 2 === 0 || audiences.length <= 2),
    }));
    // 歷年滿意度：越近越接近目前平均，四捨五入到小數兩位
    l.trend = [0.32, 0.2, 0.09].map(d => Math.min(5, Math.round((rating - d + (rnd() - .5) * .08) * 100) / 100)).concat(rating);
    // 授課足跡：場次分配到可到場縣市（戶籍縣市最多），可線上者部分場次為線上
    const fp = {};
    let left = sessions;
    const online = l.modes.includes('online') ? Math.round(sessions * (.12 + rnd() * .12)) : 0;
    left -= online;
    const weights = serve.map((c, i) => (i === 0 ? 3 : 1 + rnd()));
    const wsum = weights.reduce((a, b) => a + b, 0);
    serve.forEach((c, i) => { fp[c] = Math.floor(left * weights[i] / wsum); });
    let assigned = Object.values(fp).reduce((a, b) => a + b, 0);
    for (let i = 0; assigned < left; i = (i + 1) % serve.length) { fp[serve[i]]++; assigned++; }
    Object.keys(fp).forEach(k => { if (!fp[k]) delete fp[k]; });
    if (online) fp.online = online;
    l.footprint = fp;
    const pool = FEEDBACK_POOL.filter(f => audiences.includes(f.aud));
    const picks = (pool.length >= 3 ? pool : FEEDBACK_POOL).slice();
    l.feedback = [];
    while (l.feedback.length < 3 && picks.length) {
      const f = picks.splice(Math.floor(rnd() * picks.length), 1)[0];
      l.feedback.push({ text: f.text, who: f.who, score: rnd() < .78 ? 5 : 4, date: ['2026-10-21', '2026-09-30', '2026-08-26', '2026-06-17', '2026-05-13'][l.feedback.length + Math.floor(rnd() * 2)] });
    }
    return l;
  });
  const lecturerMap = Object.fromEntries(App.LECTURERS.map(l => [l.id, l]));
  App.lecturer = id => lecturerMap[id];
  App.certLabel = l => `${l.cert.way}認證・${l.cert.field}`;

  /* ===================================================================
     申請案件
     Case 欄位：id, org, orgType, county, district, venue, contact, contactTitle, phone, email,
       topic, audience, people, mode, date, time, sessions(節數), candidates[候選日期], lecturer, invite{lecturer, sent, due, status},
       stage(目前關卡 key), log[[stageKey, iso]], note(目前關卡的說明), need(補件需求), result{people, hours}, feeStatus, cancelled
     =================================================================== */
  App.CASES = [
    { id: 'EE115-0412', org: '山稜國民小學', orgType: '學校', county: 'TTT', district: '卑南鄉', venue: '山稜國小 視聽教室', contact: '吳承翰', contactTitle: '教務主任', phone: '089-381-412', email: 'academic@shanling-es.example.tw',
      topic: 'netzero', audience: 'elem', people: 56, mode: 'onsite', date: '2026-11-12', time: '09:30–11:10', sessions: 2, lecturer: 'L005', stage: 'scheduled',
      log: [['submitted', '2026-09-30'], ['review', '2026-10-02'], ['matching', '2026-10-05'], ['confirm', '2026-10-07'], ['scheduled', '2026-10-08']],
      note: '陳思妤講師已確認檔期。行前通知將於 115/11/05 寄出，請預先準備投影設備與麥克風。' },
    { id: 'EE115-0398', org: '青禾社區發展協會', orgType: '社區', county: 'TXG', district: '西屯區', venue: '青禾社區活動中心', contact: '劉淑惠', contactTitle: '總幹事', phone: '04-2358-1123', email: 'qinghe.community@example.tw',
      topic: 'food', audience: 'community', people: 40, mode: 'onsite', date: '2026-10-21', time: '14:00–15:40', sessions: 2, lecturer: 'L012', stage: 'done',
      log: [['submitted', '2026-09-08'], ['review', '2026-09-10'], ['matching', '2026-09-11'], ['confirm', '2026-09-14'], ['scheduled', '2026-09-15'], ['done', '2026-10-21']],
      note: '活動已於 115/10/21 辦理完成。邀請您填寫申請單位滿意度問卷，協助我們改善服務。' },
    { id: 'EE115-0455', org: '河岸國民中學', orgType: '學校', county: 'NTP', district: '板橋區', venue: '河岸國中 大禮堂', contact: '郭建志', contactTitle: '設備組長', phone: '02-2960-3388', email: 'equip@heanjh.example.tw',
      topic: 'circular', audience: 'junior', people: 120, mode: 'onsite', date: null, time: '13:30–15:10', sessions: 2, candidates: ['2026-11-24', '2026-11-26', '2026-12-01'], lecturer: null,
      invite: { lecturer: 'L037', sent: '2026-10-27', due: '2026-10-30', status: 'pending' }, stage: 'matching',
      log: [['submitted', '2026-10-19'], ['review', '2026-10-21'], ['matching', '2026-10-23']],
      note: '已依條件篩選出 4 位符合的講師，第一順位邀約已於 115/10/27 發出，預計 10/30 前回覆。' },
    { id: 'EE115-0467', org: '港都綠能科技股份有限公司', orgType: '企業', county: 'KHH', district: '鳳山區', venue: '公司 3 樓訓練教室', contact: '張瑋婷', contactTitle: '人資專員', phone: '07-746-1205', email: 'hr@gangdu-green.example.com',
      topic: 'energy', audience: 'enterprise', people: 35, mode: 'onsite', date: null, time: '10:00–11:40', sessions: 2, candidates: ['2026-12-08', '2026-12-10', '2026-12-15'], lecturer: null, stage: 'review',
      log: [['submitted', '2026-10-22'], ['review', '2026-10-26']],
      need: '請補附活動場地照片或平面圖，以及參與員工的部門分布（可用簡表）。',
      note: '承辦人員已完成初步檢核，需補件後才能進入媒合。請於 115/11/04 前上傳補件。' },
    { id: 'EE115-0301', org: '蘭陽長青學苑', orgType: '社區', county: 'ILA', district: '羅東鎮', venue: '蘭陽長青學苑 多功能教室', contact: '游美玲', contactTitle: '執行秘書', phone: '03-954-0301', email: 'lanyang.elder@example.tw',
      topic: 'health', audience: 'community', people: 60, mode: 'onsite', date: '2026-08-19', time: '09:30–11:10', sessions: 2, lecturer: 'L007', stage: 'closed',
      log: [['submitted', '2026-07-06'], ['review', '2026-07-08'], ['matching', '2026-07-09'], ['confirm', '2026-07-10'], ['scheduled', '2026-07-13'], ['done', '2026-08-19'], ['report', '2026-08-22'], ['survey', '2026-08-29'], ['closed', '2026-09-15']],
      result: { people: 63, hours: 2 }, feeStatus: '已核銷',
      note: '案件已結案。實到 63 人，參與者滿意度 4.9 分。' },
    { id: 'EE115-0423', org: '員林好農合作社', orgType: '團體', county: 'CHA', district: '員林市', venue: '合作社 集貨場二樓', contact: '黃志明', contactTitle: '理事主席', phone: '04-832-5560', email: 'yuanlin.coop@example.tw',
      topic: 'food', audience: 'agency', people: 30, mode: 'onsite', date: '2026-11-20', time: '14:00–15:40', sessions: 2, lecturer: null,
      invite: { lecturer: 'L010', sent: '2026-10-26', due: '2026-10-29', status: 'pending' }, stage: 'confirm',
      log: [['submitted', '2026-10-12'], ['review', '2026-10-14'], ['matching', '2026-10-20'], ['confirm', '2026-10-26']],
      note: '已邀請鄭家瑋講師，等待講師確認 115/11/20 的檔期。' },
    { id: 'EE115-0379', org: '濱海高級中學', orgType: '學校', county: 'TNN', district: '安平區', venue: '濱海高中 國際會議廳', contact: '陳柏翰', contactTitle: '學務主任', phone: '06-298-0379', email: 'student@binhai-sh.example.tw',
      topic: 'climate', audience: 'senior', people: 80, mode: 'onsite', date: '2026-10-16', time: '13:10–14:50', sessions: 2, lecturer: 'L022', stage: 'report',
      log: [['submitted', '2026-08-31'], ['review', '2026-09-02'], ['matching', '2026-09-03'], ['confirm', '2026-09-07'], ['scheduled', '2026-09-08'], ['done', '2026-10-16'], ['report', '2026-10-20']],
      note: '葉建良講師正在回填授課成果，完成後將開放參與者滿意度統計。' },
    { id: 'EE115-0476', org: '海風國民小學', orgType: '學校', county: 'PEN', district: '馬公市', venue: '線上（視訊）', contact: '許家豪', contactTitle: '自然科教師', phone: '06-927-0476', email: 'science@haifeng-es.example.tw',
      topic: 'biodiv', audience: 'elem', people: 32, mode: 'online', date: null, time: '10:20–12:00', sessions: 2, candidates: ['2026-12-02', '2026-12-04', '2026-12-09'], lecturer: null, stage: 'submitted',
      log: [['submitted', '2026-10-28']],
      note: '申請已於今日送出，承辦人員將於 2 個工作天內完成初審。' },
    { id: 'EE115-0436', org: '稻香社區發展協會', orgType: '社區', county: 'HUA', district: '吉安鄉', venue: '稻香社區活動中心', contact: '林秀英', contactTitle: '理事長', phone: '03-852-0436', email: 'daoxiang@example.tw',
      topic: 'food', audience: 'community', people: 45, mode: 'onsite', date: '2026-11-18', time: '14:00–15:40', sessions: 2, lecturer: 'L005', stage: 'scheduled',
      log: [['submitted', '2026-10-05'], ['review', '2026-10-06'], ['matching', '2026-10-08'], ['confirm', '2026-10-12'], ['scheduled', '2026-10-13']],
      note: '講師已確認，活動前 7 天寄送行前通知。' },
    { id: 'EE115-0449', org: '冬山河國民中學', orgType: '學校', county: 'ILA', district: '冬山鄉', venue: '線上（視訊）', contact: '簡怡如', contactTitle: '生物科教師', phone: '03-958-0449', email: 'bio@dongshan-jh.example.tw',
      topic: 'biodiv', audience: 'junior', people: 90, mode: 'online', date: '2026-12-09', time: '10:10–11:50', sessions: 2, lecturer: 'L005', stage: 'scheduled',
      log: [['submitted', '2026-10-14'], ['review', '2026-10-15'], ['matching', '2026-10-16'], ['confirm', '2026-10-19'], ['scheduled', '2026-10-20']],
      note: '線上授課，視訊連結將於行前通知一併寄出。' },
    { id: 'EE115-0388', org: '洄瀾實驗高級中學', orgType: '學校', county: 'HUA', district: '花蓮市', venue: '洄瀾實驗高中 生態教室', contact: '王立德', contactTitle: '教學組長', phone: '03-835-0388', email: 'teach@huilan-sh.example.tw',
      topic: 'biodiv', audience: 'senior', people: 70, mode: 'onsite', date: '2026-10-14', time: '13:10–14:50', sessions: 2, lecturer: 'L005', stage: 'done',
      log: [['submitted', '2026-09-01'], ['review', '2026-09-03'], ['matching', '2026-09-04'], ['confirm', '2026-09-07'], ['scheduled', '2026-09-08'], ['done', '2026-10-14']],
      note: '活動已辦理完成，等待講師回填授課成果（期限 115/11/13）。' },
    { id: 'EE115-0362', org: '縱谷社區大學', orgType: '團體', county: 'TTT', district: '臺東市', venue: '縱谷社大 第二教室', contact: '鄭雅琪', contactTitle: '課程專員', phone: '089-331-362', email: 'course@zonggu-cc.example.tw',
      topic: 'netzero', audience: 'community', people: 38, mode: 'onsite', date: '2026-09-23', time: '19:00–20:40', sessions: 2, lecturer: 'L005', stage: 'closed',
      log: [['submitted', '2026-08-10'], ['review', '2026-08-12'], ['matching', '2026-08-13'], ['confirm', '2026-08-15'], ['scheduled', '2026-08-17'], ['done', '2026-09-23'], ['report', '2026-09-25'], ['survey', '2026-10-02'], ['closed', '2026-10-16']],
      result: { people: 41, hours: 2 }, feeStatus: '已核銷',
      note: '案件已結案，講座鐘點費與交通費已撥付。' },
    { id: 'EE115-0481', org: '鯉潭國民小學', orgType: '學校', county: 'HUA', district: '壽豐鄉', venue: '鯉潭國小 自然教室', contact: '高嘉玲', contactTitle: '教務主任', phone: '03-865-0481', email: 'academic@litan-es.example.tw',
      topic: 'netzero', audience: 'elem', people: 48, mode: 'onsite', date: '2026-11-18', time: '13:30–15:10', sessions: 2, lecturer: null,
      invite: { lecturer: 'L005', sent: '2026-10-27', due: '2026-10-30', status: 'pending' }, stage: 'confirm',
      log: [['submitted', '2026-10-16'], ['review', '2026-10-19'], ['matching', '2026-10-22'], ['confirm', '2026-10-27']],
      note: '已邀請陳思妤講師，等待講師確認 115/11/18 的檔期。' },
    { id: 'EE115-0488', org: '稻浪國民中學', orgType: '學校', county: 'TTT', district: '池上鄉', venue: '稻浪國中 圖書館', contact: '羅文傑', contactTitle: '學務主任', phone: '089-862-0488', email: 'student@daolang-jh.example.tw',
      topic: 'food', audience: 'junior', people: 85, mode: 'onsite', date: '2026-12-03', time: '09:30–11:10', sessions: 2, lecturer: null,
      invite: { lecturer: 'L005', sent: '2026-10-28', due: '2026-10-31', status: 'pending' }, stage: 'confirm',
      log: [['submitted', '2026-10-20'], ['review', '2026-10-22'], ['matching', '2026-10-26'], ['confirm', '2026-10-28']],
      note: '已邀請陳思妤講師，等待講師確認 115/12/03 的檔期。' },
    { id: 'EE115-0417', org: '北岸觀光漁業協會', orgType: '團體', county: 'KEE', district: '中正區', venue: '協會會議室', contact: '蔡國華', contactTitle: '總幹事', phone: '02-2462-0417', email: 'northshore@example.tw',
      topic: 'circular', audience: 'agency', people: 28, mode: 'onsite', date: '2026-11-06', time: '14:00–15:40', sessions: 2, lecturer: 'L020', stage: 'scheduled',
      log: [['submitted', '2026-10-01'], ['review', '2026-10-02'], ['matching', '2026-10-05'], ['confirm', '2026-10-07'], ['scheduled', '2026-10-08']],
      note: '徐國書講師已確認，活動後將搭配漁港周邊淨灘。' },
  ];
  const caseMap = Object.fromEntries(App.CASES.map(c => [c.id, c]));
  App.case = id => caseMap[String(id || '').trim().toUpperCase()];
  App.schedule = lecturerId => App.CASES.filter(c => c.lecturer === lecturerId && c.date && !c.cancelled).sort((a, b) => a.date.localeCompare(b.date));

  App.ME = 'L005';
  App.DEMO_TRACK = [
    { id: 'EE115-0412', phone: '089-381-412', hint: '待執行：講師已確認' },
    { id: 'EE115-0398', phone: '04-2358-1123', hint: '已執行：可填滿意度問卷' },
    { id: 'EE115-0455', phone: '02-2960-3388', hint: '媒合中：等待講師回覆' },
    { id: 'EE115-0467', phone: '07-746-1205', hint: '初審：需補件' },
    { id: 'EE115-0301', phone: '03-954-0301', hint: '結案' },
  ];

  /* ===================================================================
     統計（115 年度系統上線後的虛構數據，不含前案成果）
     =================================================================== */
  const delivered = App.LECTURERS.reduce((s, l) => s + l.sessions, 0);
  // 依比例分配且總和精確等於 total（最大餘數法）
  function apportion(weights, total) {
    const wsum = weights.reduce((a, b) => a + b, 0);
    const raw = weights.map(w => w / wsum * total);
    const out = raw.map(Math.floor);
    let rest = total - out.reduce((a, b) => a + b, 0);
    raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { out[i]++; rest--; } });
    return out;
  }
  const audienceW = [6, 27, 15, 11, 6, 19, 9, 7];
  const topicW = [13, 22, 12, 9, 15, 17, 5, 7];
  const audCounts = apportion(audienceW, delivered);
  const topicCounts = apportion(topicW, delivered);
  App.STATS = {
    launch: '2026-03-02',
    until: App.TODAY,
    applications: 486,
    matched: 438,
    delivered,
    participants: 15286,
    satisfaction: Math.round(App.LECTURERS.reduce((s, l) => s + l.rating * l.sessions, 0) / delivered * 100) / 100,
    avgMatchDays: 4.2,
    lecturers: App.LECTURERS.length,
    counties: new Set(App.LECTURERS.flatMap(l => l.serve)).size,
    monthly: [
      { label: '3月', value: 9 }, { label: '4月', value: 31 }, { label: '5月', value: 52 }, { label: '6月', value: 47 },
      { label: '7月', value: 29 }, { label: '8月', value: 33 }, { label: '9月', value: 74 }, { label: '10月', value: 0 },
    ],
    byAudience: App.AUDIENCES.map((a, i) => ({ id: a.id, label: a.name, value: audCounts[i] })),
    byTopic: App.TOPICS.map((t, i) => ({ id: t.id, label: t.name, value: topicCounts[i] })),
    onlineShare: .18,
  };
  // 10 月份＝已授課總數扣掉 3–9 月，確保月別加總與講師場次一致
  App.STATS.monthly[7].value = delivered - App.STATS.monthly.slice(0, 7).reduce((s, m) => s + m.value, 0);

  /* ===================================================================
     首頁「最近媒合」動態（講師縣市 → 申請單位縣市）
     =================================================================== */
  App.FEED = [
    { from: 'HUA', to: 'TTT', lecturer: '陳思妤', org: '山稜國小', place: '臺東縣卑南鄉', topic: 'netzero' },
    { from: 'TXG', to: 'MIA', lecturer: '李沛晴', org: '頭份樂齡學習中心', place: '苗栗縣頭份市', topic: 'climate' },
    { from: 'KHH', to: 'PIF', lecturer: '王士豪', org: '東港漁村社區發展協會', place: '屏東縣東港鎮', topic: 'circular' },
    { from: 'NTP', to: 'KEE', lecturer: '林予恩', org: '八斗海濱國中', place: '基隆市中正區', topic: 'netzero' },
    { from: 'CYI', to: 'CYQ', lecturer: '許雅雯', org: '竹崎綠野國小', place: '嘉義縣竹崎鄉', topic: 'health' },
    { from: 'TAO', to: 'HSQ', lecturer: '江怡君', org: '竹北綠能精密公司', place: '新竹縣竹北市', topic: 'energy' },
    { from: 'HUA', to: 'ILA', lecturer: '陳思妤', org: '冬山河國中', place: '宜蘭縣冬山鄉', topic: 'biodiv' },
    { from: 'TXG', to: 'NAN', lecturer: '謝承恩', org: '埔里山城社區協會', place: '南投縣埔里鎮', topic: 'food' },
    { from: 'TNN', to: 'PEN', lecturer: '康以諾', org: '海風國小', place: '澎湖縣馬公市', topic: 'biodiv' },
    { from: 'TPE', to: 'KIN', lecturer: '程若瑜', org: '金城樂齡學堂', place: '金門縣金城鎮', topic: 'circular' },
    { from: 'PIF', to: 'KHH', lecturer: '楊淑芬', org: '旗山香蕉社區發展協會', place: '高雄市旗山區', topic: 'food' },
    { from: 'HSQ', to: 'TAO', lecturer: '呂佳穎', org: '中壢綠埔國中', place: '桃園市中壢區', topic: 'food' },
    { from: 'KEE', to: 'ILA', lecturer: '徐國書', org: '頭城海岸社區', place: '宜蘭縣頭城鎮', topic: 'circular' },
    { from: 'CYQ', to: 'TNN', lecturer: '范書維', org: '新營綠園社區大學', place: '臺南市新營區', topic: 'biodiv' },
    { from: 'TTT', to: 'HUA', lecturer: '周育萱', org: '玉里溪畔國小', place: '花蓮縣玉里鎮', topic: 'biodiv' },
    { from: 'NTP', to: 'TPE', lecturer: '沈雨潔', org: '大安綠光國小', place: '臺北市大安區', topic: 'health' },
  ];

  /* ===================================================================
     最新消息與常見問題
     =================================================================== */
  App.NEWS = [
    { id: 'N115-031', date: '2026-10-27', cat: '公告', title: '115 年度第 4 季講師申請開放至 11 月 30 日',
      summary: '12 月至隔年 2 月的活動場次即日起受理，建議於活動日 30 日前送出申請。',
      body: ['第 4 季（115 年 12 月至 116 年 2 月）活動場次即日起受理申請，截止日為 115 年 11 月 30 日。為確保媒合時程，建議於活動日 30 日前送出申請。', '本季起，服務對象為「社區與長青」的場次，可於申請時勾選「需長者友善教材」，系統將優先列出具長青授課經驗的講師。', '離島縣市（澎湖、金門、連江）可選擇線上授課，或由本縣講師支援；跨海交通費依實際票價核實支付。'] },
    { id: 'N115-030', date: '2026-10-20', cat: '活動', title: '淨零綠生活講師共學工作坊（中區場）11/14 臺中登場',
      summary: '以「七大主題教案共備」為主題，開放已認證講師報名，名額 40 名。',
      body: ['為促進講師交流與教案共享，中區共學工作坊將於 115 年 11 月 14 日（六）在臺中市舉辦，主題為「淨零綠生活七大主題教案共備」。', '工作坊分為上午的教案分享與下午的分組共備，完成者可於講師專區下載共備教案。報名請至講師專區「活動報名」，名額 40 名，額滿為止。'] },
    { id: 'N115-029', date: '2026-10-15', cat: '系統', title: '進度查詢新增「補件上傳」功能',
      summary: '初審需補件的案件，可直接在進度查詢頁上傳附件，不必再以電子郵件寄送。',
      body: ['自 115 年 10 月 15 日起，案件於初審階段若需補件，申請單位可在「申請進度查詢」輸入案件編號與聯絡電話後，直接上傳補件檔案。', '支援 PDF、JPG、PNG 格式，單檔 10 MB 以內；上傳後承辦人員會收到通知並繼續審核。'] },
    { id: 'N115-028', date: '2026-10-02', cat: '公告', title: '提醒：授課成果與費用申請請於授課後 30 日內完成',
      summary: '逾期案件將暫停後續邀約，請講師留意講師專區的待辦提醒。',
      body: ['為利經費核銷作業，請講師於授課後 30 日內在講師專區完成成果回填（實到人數、實際時數、簽到表與活動照片）與費用申請。', '逾期未完成者，系統將暫停後續邀約至補齊為止。講師專區首頁的「待辦提醒」會列出即將到期的案件。'] },
    { id: 'N115-027', date: '2026-09-18', cat: '活動', title: '秋季「綠色飲食」主題講師招募說明會',
      summary: '歡迎具食農教育經驗的環境教育人員加入名錄，說明會採線上進行。',
      body: ['為因應各地社區與學校對「綠色飲食」主題的需求，本系統將招募具食農教育經驗的環境教育人員加入講師名錄。', '線上說明會將介紹講師權利義務、課程模組撰寫方式與系統操作，歡迎有興趣者報名參加。'] },
    { id: 'N115-026', date: '2026-09-01', cat: '系統', title: '講師專區新增檔期衝突提醒',
      summary: '接受邀約前，系統會比對既有行程，同日時段重疊時提示確認。',
      body: ['講師在講師專區回覆邀約時，系統會自動比對已確認的行程；若同日時段重疊或交通時間不足，會在接受前顯示提醒。', '講師仍可在確認後接受，承辦人員也會同步收到提示，以便協調調整。'] },
  ];

  App.FAQ = {
    apply: [
      ['哪些單位可以申請講師？', '學校（含幼兒園）、機關、社區發展協會與長青據點、企業及民間團體皆可申請。實體場次建議預估人數 20 人以上，線上場次 15 人以上。'],
      ['申請要多久前送出？媒合需要多久？', '建議於活動日 30 日前送出。送件後依序經過初審與媒合，115 年度平均 4.2 個工作天完成媒合；講師確認檔期後即可在進度查詢看到「待執行」。'],
      ['可以指定想邀請的講師嗎？', '可以。您可以在講師名錄勾選至多 3 位偏好講師，或在申請第 3 步直接指定；實際仍依講師檔期與承辦人員審核結果安排。'],
      ['送出後可以修改或取消嗎？', '初審完成前可在「申請進度查詢」取消申請或上傳補件；初審後如需變更日期，請來電服務專線，由承辦人員協助重新媒合。'],
    ],
    lecturer: [
      ['如何加入講師名錄？', '需具有效的環境教育人員認證。於講師專區填寫基本資料、課程模組與可授課縣市，經承辦人員審核後即列入名錄。'],
      ['收到邀約後多久要回覆？', '請於 3 個工作天內回覆；逾期未回覆，系統會通知承辦人員邀請下一順位講師。接受前系統會自動檢查檔期衝突。'],
      ['授課後需要做什麼？', '請於授課後 30 日內回填成果：實到人數、實際時數、簽到表與活動照片，並提出費用申請。完成後案件才能進入滿意度彙整與結案。'],
    ],
    fee: [
      ['講座鐘點費怎麼計算？', '講座鐘點費（示意費率，可於系統設定調整）：外聘專家學者每節 2,000 元、外聘一般講師每節 1,600 元、內聘講師每節 1,000 元，每節 50 分鐘。申請時的金額為預估，實際依核定結果支付。'],
      ['交通費怎麼算？', '依講師出發縣市與授課地點的距離級距示意計算，例如 30 公里以內 200 元、30–80 公里 600 元；跨海往返離島依實際票價核實支付。線上授課不另計交通費。'],
      ['申請單位需要負擔費用嗎？', '講座鐘點費與交通費由本系統經費支應，申請單位負責提供場地、投影設備與簽到協助。'],
    ],
  };

  /* ===================================================================
     查詢與計算
     =================================================================== */
  App.countByCounty = (kind = 'serve') => {
    const out = Object.fromEntries(App.COUNTIES.map(c => [c.id, 0]));
    App.LECTURERS.forEach(l => { (kind === 'home' ? [l.county] : l.serve).forEach(id => { out[id]++; }); });
    return out;
  };

  App.distanceKm = (from, to) => {
    if (from === to) return 15;
    const a = App.county(from), b = App.county(to);
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    // 直線距離 × 1.3 估算道路距離
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.3);
  };
  App.travelTier = (from, to) => {
    const a = App.county(from), b = App.county(to);
    if (a.id !== b.id && (a.island || b.island)) return { label: App.FEE.island.label, amount: App.FEE.island.amount, island: true };
    const km = App.distanceKm(from, to);
    const t = App.FEE.travel.find(x => km <= x.max);
    return { label: t.label, amount: t.amount, island: false };
  };
  App.feeEstimate = ({ rateKey = 'expert', sessions = 2, from, to, mode = 'onsite' }) => {
    const rate = App.rate(rateKey);
    const lecture = rate.rate * sessions;
    let km = 0, tier = null, travel = 0;
    if (mode !== 'online' && from && to) {
      km = App.distanceKm(from, to);
      tier = App.travelTier(from, to);
      travel = tier.amount;
    }
    return { rate, sessions, minutes: sessions * App.FEE.minutes, lecture, km, tier, travel, total: lecture + travel };
  };

  // 依條件篩選與排序推薦講師（規則式計分，列出符合理由與提醒）
  App.match = (c = {}) => {
    const exclude = new Set(c.exclude || []);
    return App.LECTURERS.filter(l => !exclude.has(l.id) && (!c.topic || l.topics.includes(c.topic))).map(l => {
      let score = 0;
      const reasons = [], warns = [];
      if (c.topic) { score += 40; reasons.push(`專長主題含「${App.topic(c.topic).name}」`); }
      if (c.audience) {
        if (l.audiences.includes(c.audience)) { score += 20; reasons.push(`具「${App.audience(c.audience).name}」授課經驗`); }
        else warns.push(`較少「${App.audience(c.audience).name}」授課經驗`);
      }
      if (c.mode === 'online') {
        if (l.modes.includes('online')) { score += 22; reasons.push('可線上授課'); }
        else { score -= 40; warns.push('僅提供實體授課'); }
      } else if (c.county) {
        if (l.serve.includes(c.county)) { score += 25; reasons.push(`可到場服務${App.county(c.county).name}`); }
        else { score -= 5; warns.push(`需由${App.county(l.county).name}跨縣市前往，交通費較高`); }
      }
      if (c.month) {
        if (l.months.includes(c.month)) { score += 10; reasons.push(`${c.month} 月開放授課`); }
        else { score -= 15; warns.push(`${c.month} 月未開放檔期`); }
      }
      score += (l.rating - 4.5) * 12 + Math.min(l.sessions, 15) * .3;
      reasons.push(`近一年 ${l.sessions} 場、滿意度 ${l.rating.toFixed(1)}`);
      return { l, score: Math.round(score * 10) / 10, reasons, warns };
    }).sort((a, b) => b.score - a.score);
  };

  App.availability = (lecturerId, ym) => {
    const l = App.lecturer(lecturerId);
    const [y, m] = ym.split('-').map(Number);
    const rnd = App.rng(lecturerId + ym);
    const days = new Date(y, m, 0).getDate();
    const avail = [], busy = {};
    App.CASES.forEach(c => {
      if (c.lecturer === lecturerId && c.date && c.date.startsWith(ym) && !c.cancelled) busy[c.date] = `${c.org}（${c.time}）`;
    });
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      const date = new Date(y, m - 1, d);
      const roll = rnd();
      if (iso <= App.TODAY || !l.months.includes(m) || !l.weekdays.includes(date.getDay()) || busy[iso]) continue;
      if (roll < .16) { busy[iso] = '已有其他行程'; continue; }
      avail.push(iso);
    }
    return { avail, busy };
  };

  /* ===================================================================
     資料同步：任何改變資料的動作（含復原）都呼叫 App.emit()
     =================================================================== */
  const counters = {
    lecturers: () => App.LECTURERS.length,
    counties: () => App.STATS.counties,
    delivered: () => App.STATS.delivered,
    invites: () => App.CASES.filter(c => c.invite && c.invite.lecturer === App.ME && c.invite.status === 'pending').length,
  };
  App.registerCount = (name, fn) => { counters[name] = fn; renderCounts(); };
  function renderCounts(root = document) {
    $$('[data-count]', root).forEach(el => {
      const fn = counters[el.dataset.count];
      if (!fn) return;
      const v = String(fn());
      if (el.textContent !== v) {
        el.textContent = v;
        if (el.dataset.countReady) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
      }
      el.dataset.countReady = '1';
    });
  }
  App.emit = reason => {
    renderCounts();
    document.dispatchEvent(new CustomEvent('app:data', { detail: { reason } }));
  };
  App.on = fn => document.addEventListener('app:data', e => fn(e.detail));

  /* ===================================================================
     圖示（單線條 sprite，由 app.js 注入，頁面以 <svg class="i"><use href="#i-名稱"/></svg> 使用）
     =================================================================== */
  const ICONS = {
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    'map-pin': '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
    users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.6c2 .6 3.2 2.3 3.6 4.9"/>',
    school: '<path d="M3 20.5h18M5 20.5V10l7-4.5 7 4.5v10.5"/><path d="M10 20.5v-5h4v5M12 5.5V2.5h3.5v2H12"/><circle cx="12" cy="11" r="1.6"/>',
    building: '<path d="M4 20.5h16M6 20.5V4.5h8v16M14 9.5h4v11"/><path d="M9 8h2M9 11.5h2M9 15h2"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    upload: '<path d="M12 15.5V4M7 8.5 12 4l5 4.5M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
    download: '<path d="M12 4v11.5M7 11l5 4.5 5-4.5M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
    file: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4"/>',
    print: '<path d="M7 9V3.5h10V9M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    alert: '<path d="M12 3.8 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7M12 16.8v.2"/>',
    star: '<path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1L3.2 9.6l6.1-.8z"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 14.5-14-.3 9.5-5.8 14.6-14.5 14z"/><path d="M5 19c3-4 6-6.5 10-8.5"/>',
    seed: '<path d="M12 4c3.8 3 5.5 6.3 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 10.3 8.2 7 12 4z"/><path d="M12 9.5v6"/>',
    sprout: '<path d="M12 20.5V12"/><path d="M12 13c-.3-4-3-6.5-7.5-6.5.2 4.2 3 6.6 7.5 6.5z"/><path d="M12 11c.2-3.6 2.7-6 6.8-6-.1 3.8-2.6 6-6.8 6z"/><path d="M8 20.5h8"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
    presentation: '<path d="M3.5 4.5h17M5 4.5v10h14v-10M12 14.5v3M8.5 21l3.5-3.5 3.5 3.5"/><path d="m8.5 11 2.5-2.5 2 2 3-3"/>',
    coin: '<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
    shield: '<path d="M12 3.2 19 6v5.5c0 4.4-3 7.8-7 9.3-4-1.5-7-4.9-7-9.3V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.8 13.5-1.6 7 4.8-2.5 4.8 2.5-1.6-7"/>',
    chart: '<path d="M4 20.5h16M7 17v-5M12 17V7M17 17v-8"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    message: '<path d="M4 5.5h16v11H9l-5 4z"/>',
    quote: '<path d="M9.5 7C6.5 8 5 10.3 5 13.5V17h4.5v-4.5H7c0-2 1-3.4 2.5-4M18.5 7c-3 1-4.5 3.3-4.5 6.5V17h4.5v-4.5H16c0-2 1-3.4 2.5-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
    login: '<path d="M14 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4M10 8l4 4-4 4M14 12H4"/>',
    flag: '<path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    match: '<circle cx="5.5" cy="16.5" r="2.5"/><circle cx="18.5" cy="16.5" r="2.5"/><path d="M7 14.5C8.5 8 15.5 8 17 14.5"/><path d="M12 9.6v.1"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2M9 9.5v.5M15 9.5v.5"/>',
    home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5v10h12v-10"/><path d="M10 19.5v-5h4v5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z"/>',
    // 八大主題
    't-climate': '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a3.5 3.5 0 1 1-4 0z"/><path d="M12 9v7"/><path d="M16.5 7.5c1 .8 2 .8 3 0M16.5 11c1 .8 2 .8 3 0"/>',
    't-netzero': '<circle cx="12" cy="12" r="8.5"/><path d="M8 16c0-5 3-8 8.5-8.5-.2 5.6-3.4 8.5-8.5 8.5z"/><path d="M8 16l4.5-4.5"/>',
    't-circular': '<path d="M7 7.5a7 7 0 0 1 11.3 2.3M17 16.5A7 7 0 0 1 5.7 14.2"/><path d="M18.8 5.5v4.6h-4.6M5.2 18.5v-4.6h4.6"/>',
    't-energy': '<path d="M13.5 3 5.5 13.5H12L10.5 21l8-10.5H12z"/>',
    't-biodiv': '<path d="M12 8v11"/><path d="M12 10c-1-3.5-4-5.5-7-5 0 3.5 1.8 6 5 6.3-2.4.6-3.8 2.4-3.6 4.7 2.6.2 4.6-1.2 5.6-3.8"/><path d="M12 10c1-3.5 4-5.5 7-5 0 3.5-1.8 6-5 6.3 2.4.6 3.8 2.4 3.6 4.7-2.6.2-4.6-1.2-5.6-3.8"/><path d="M10.5 5.5 12 8l1.5-2.5"/>',
    't-food': '<path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z"/><path d="M12 12V9"/><path d="M12 9.5c-.2-2.5-1.8-4-4.3-4 0 2.4 1.7 4 4.3 4zM12 9c.2-2.2 1.6-3.6 3.9-3.6-.1 2.2-1.6 3.6-3.9 3.6z"/>',
    't-transit': '<rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 11h14M8 17.5V20M16 17.5V20M8.5 14.2h.1M15.5 14.2h.1"/>',
    't-health': '<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/><path d="M7 12h2.5l1.5-2.5 2 4.5 1.5-2H17"/>',
    // 淨零綠生活七大主題
    'l-food': '<path d="M3.5 12.5h17a8.5 7.5 0 0 1-17 0z"/><path d="M9 20h6"/><path d="M14.5 3.5l-2.5 7M18.5 4.5 14 10.5"/><path d="M7.5 9.5c0-1.4 1.2-1.6 1.2-3S7.5 5 7.5 3.8"/>',
    'l-cloth': '<path d="M8.5 3.5 3.5 6.5l1.8 4 2.2-1v11h9v-11l2.2 1 1.8-4-5-3c-.5 1.6-1.8 2.5-3.5 2.5S9 5.1 8.5 3.5z"/><path d="M10 16c0-2.5 1.6-4.2 4-4.5-.1 2.5-1.6 4.2-4 4.5zM10 16l1.8-1.8"/>',
    'l-home': '<path d="M3.5 11.5 12 5l8.5 6.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/><circle cx="18.5" cy="4.5" r="1.6"/><path d="M18.5 1.3v.7M21.7 4.5H21M20.8 2.2l-.5.5"/>',
    'l-move': '<circle cx="6" cy="16.5" r="3.5"/><circle cx="18" cy="16.5" r="3.5"/><path d="M6 16.5 9.5 9h6l2.5 7.5M9.5 9 12 16.5H6M15.5 9l-1-2.5h-2M8 6.5h3"/>',
    'l-edu': '<path d="M3 8c3-1 6-.6 9 1.5 3-2.1 6-2.5 9-1.5v12c-3-1-6-.6-9 1.5-3-2.1-6-2.5-9-1.5z"/><path d="M12 9.5v12"/><path d="M12 7c-.1-1.8-1.3-3-3.2-3 0 1.8 1.3 3 3.2 3zM12 7c.1-1.6 1.2-2.6 2.9-2.6-.1 1.6-1.2 2.6-2.9 2.6z"/>',
    'l-play': '<path d="M2.5 19.5h19"/><path d="M4 19.5 10 8l6 11.5"/><path d="M13.2 14 16 9.5l5 10"/><path d="M8.3 11.3 10 13l1.6-1.6"/><circle cx="18" cy="5" r="1.8"/>',
    'l-shop': '<path d="M5 8h14l-1.2 12.5H6.2z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/><path d="M10 17c0-2.2 1.4-3.7 3.6-4-.1 2.2-1.5 3.7-3.6 4zM10 17l1.6-1.6"/>',
  };
  App.ICONS = Object.keys(ICONS);
  function injectSprite() {
    if (document.getElementById('app-sprite')) return;
    const symbols = Object.entries(ICONS).map(([k, v]) =>
      `<symbol id="i-${k}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${v}</g></symbol>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `<svg id="app-sprite" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${symbols}</svg>`);
  }

  /* ===================================================================
     標記產生器
     =================================================================== */
  App.icon = (name, cls = '') => `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  App.avatar = (l, size = 'md') => `<span class="seed-avatar seed-avatar--${size}" style="--av:${l.color}" aria-hidden="true">${App.esc(l.name.charAt(0))}</span>`;
  App.stars = v => `<span class="stars" style="--v:${v}" role="img" aria-label="滿意度 ${Number(v).toFixed(1)} 分（滿分 5 分）"><span class="stars__bg"></span><span class="stars__fg"></span></span>`;
  App.topicTag = id => { const t = App.topic(id); return `<span class="tag">${App.icon(t.icon)}${App.esc(t.name)}</span>`; };
  App.lifeTag = id => { const l = App.life(id); return `<span class="tag tag--life">${App.icon(l.icon)}${l.char}</span>`; };
  App.modeBadges = l => l.modes.map(m => `<span class="badge ${m === 'online' ? 'badge--sky' : 'badge--forest'}">${App.icon(m === 'online' ? 'video' : 'presentation')}${App.MODES[m]}</span>`).join('');

  App.lecturerCard = (l, o = {}) => {
    const serve = l.serve.map(id => App.county(id).name).join('、');
    const pick = o.pick ? `<label class="lcard__pick"><input type="checkbox" name="prefer" value="${l.id}"${o.picked ? ' checked' : ''}${o.pickDisabled ? ' disabled' : ''} aria-label="將 ${App.esc(l.name)} 加入偏好講師"><span class="check__box">${App.icon('check')}</span>偏好講師</label>` : '';
    const reasons = (o.reasons || []).length || (o.warns || []).length
      ? `<ul class="lcard__reasons">${(o.reasons || []).map(r => `<li>${App.icon('check')}<span>${App.esc(r)}</span></li>`).join('')}${(o.warns || []).map(r => `<li class="is-warn">${App.icon('alert')}<span>${App.esc(r)}</span></li>`).join('')}</ul>` : '';
    return `<article class="lcard${o.picked ? ' is-picked' : ''}" data-id="${l.id}">
  <div class="lcard__top">
    ${App.avatar(l, 'md')}
    <div class="lcard__who">
      <h3 class="lcard__name"><a href="instructor.html?id=${l.id}">${App.esc(l.name)}</a></h3>
      <p class="lcard__title">${App.esc(l.title)}・${App.esc(l.org)}</p>
    </div>
  </div>
  <p class="lcard__cert">${App.icon('shield')}<span><b>${App.esc(App.certLabel(l))}</b><br>${App.esc(l.cert.no)}</span></p>
  <div class="tags">${l.topics.map(App.topicTag).join('')}</div>
  ${reasons}
  <dl class="lcard__meta">
    <div><dt>服務縣市</dt><dd>${App.esc(serve)}</dd></div>
    <div><dt>近一年</dt><dd><b class="num">${l.sessions}</b> 場</dd></div>
    <div><dt>平均滿意度</dt><dd><b class="num">${l.rating.toFixed(1)}</b> / 5</dd></div>
  </dl>
  <div class="lcard__foot">
    <div class="cluster" style="--gap:6px">${App.modeBadges(l)}</div>
    ${pick || `<a class="link-arrow" href="${o.applyLink ? `apply.html?prefer=${l.id}` : `instructor.html?id=${l.id}`}">${o.applyLink ? '指定申請' : '查看介紹'}${App.icon('arrow-right')}</a>`}
  </div>
</article>`;
  };

  App.stageBadge = c => {
    if (c.cancelled) return '<span class="status" data-tone="err">已取消</span>';
    const s = App.STAGES[App.stageIndex(c.stage)];
    return `<span class="status" data-tone="${s.tone}">${s.label}</span>`;
  };

  App.caseTimeline = c => {
    const cur = App.stageIndex(c.stage);
    const dates = Object.fromEntries(c.log);
    const items = App.STAGES.map((s, i) => {
      if (c.cancelled && i > cur) return '';
      const state = i < cur ? 'is-done' : i === cur ? (c.stage === 'closed' ? 'is-done' : 'is-current') : 'is-todo';
      const date = dates[s.key] ? App.fmt.rocLong(dates[s.key]) : (i > cur ? '尚未進行' : '');
      const note = i === cur && !c.cancelled ? `<p class="tl-item__note">${App.esc(c.note || s.desc)}</p>` : '';
      const badge = i === cur && c.stage !== 'closed' && !c.cancelled ? '<span class="badge badge--sprout">目前進度</span>' : '';
      return `<li class="tl-item ${state}" data-stage="${s.key}"><span class="tl-item__node" data-vine-node>${App.icon(i < cur || c.stage === 'closed' ? 'check' : s.icon)}</span><div class="tl-item__body"><p class="tl-item__title">${s.label}${badge}</p><p class="tl-item__date">${date}</p>${note}</div></li>`;
    }).join('');
    const cancel = c.cancelled ? `<li class="tl-item is-cancel"><span class="tl-item__node">${App.icon('x')}</span><div class="tl-item__body"><p class="tl-item__title">已取消申請</p><p class="tl-item__date">${App.fmt.rocLong(c.cancelled)}</p><p class="tl-item__note">${App.esc(c.cancelReason || '申請單位已取消本案。')}</p></div></li>` : '';
    return `<ol class="timeline" aria-label="案件 ${c.id} 進度">${items}${cancel}</ol>`;
  };

  App.emptyState = ({ title, text, action } = {}) => `<div class="empty">
  <svg class="empty__art" viewBox="0 0 120 96" aria-hidden="true"><ellipse cx="60" cy="84" rx="44" ry="7" class="ill-fill-sprout"/><path d="M60 82V52" fill="none" stroke="#1F5D4A" stroke-width="2.4" stroke-linecap="round"/><path d="M60 58c-2-12-11-19-24-18 1 12 10 19 24 18z" class="ill-fill-sprout-strong" stroke="#1F5D4A" stroke-width="2.2" stroke-linejoin="round"/><path d="M60 52c2-10 10-16 21-15-1 10-9 16-21 15z" class="ill-fill-paper" stroke="#1F5D4A" stroke-width="2.2" stroke-linejoin="round"/><circle cx="88" cy="22" r="4" fill="none" stroke="#C8743C" stroke-width="2"/><path d="M26 30l4 4M30 30l-4 4" stroke="#C8743C" stroke-width="2" stroke-linecap="round"/></svg>
  <p class="empty__title">${App.esc(title || '沒有符合的結果')}</p>
  <p class="empty__text">${App.esc(text || '試著放寬篩選條件，或改用其他關鍵字。')}</p>
  ${action ? `<a class="btn btn--sm" href="${action.href || '#'}"${action.id ? ` id="${action.id}"` : ''}>${App.esc(action.label)}</a>` : ''}
</div>`;

  /* ===================================================================
     Toast / Dialog / Modal
     =================================================================== */
  let toastHost = null;
  function placeToastHost() {
    if (!toastHost) return;
    const open = $$('dialog[open]').pop();
    const parent = open || document.body;
    if (toastHost.parentElement !== parent) parent.appendChild(toastHost);
  }
  App.toast = (title, o = {}) => {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
    }
    placeToastHost();
    const tone = o.tone || 'ok';
    const icon = { ok: 'check', info: 'info', warn: 'alert', err: 'alert' }[tone];
    const t = document.createElement('div');
    t.className = `toast toast--${tone}`;
    t.innerHTML = `<span class="toast__icon">${App.icon(icon)}</span><div><p class="toast__title">${App.esc(title)}</p>${o.desc ? `<p class="toast__desc">${App.esc(o.desc)}</p>` : ''}${o.action ? `<button type="button" class="toast__action">${App.esc(o.action.label)}</button>` : ''}</div><button type="button" class="toast__close" aria-label="關閉通知">${App.icon('x')}</button>`;
    toastHost.appendChild(t);
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      if (!t.isConnected || t.classList.contains('is-leaving')) return;
      t.classList.add('is-leaving');
      setTimeout(() => t.remove(), App.reducedMotion() ? 0 : 220);
    };
    t.querySelector('.toast__close').addEventListener('click', close);
    if (o.action) t.querySelector('.toast__action').addEventListener('click', () => { o.action.onClick(); close(); });
    timer = setTimeout(close, o.duration || (o.action ? 6500 : 4200));
    while (toastHost.children.length > 4) toastHost.firstElementChild.remove();
    return { close };
  };

  App.openDialog = d => {
    if (d.open) return;
    if (!d.dataset.appDialog) {
      d.dataset.appDialog = '1';
      d.addEventListener('close', () => { d.classList.remove('is-closing'); placeToastHost(); });
      // 點擊背景（dialog 本身而非內容盒）關閉
      d.addEventListener('click', e => { if (e.target === d) App.closeDialog(d); });
    }
    d.showModal();
    placeToastHost();
  };
  App.closeDialog = d => {
    if (!d.open || d.classList.contains('is-closing')) return;
    if (App.reducedMotion()) { d.close(); return; }
    d.classList.add('is-closing');
    setTimeout(() => { if (d.open) d.close(); }, 200);
  };

  App.modal = (o = {}) => {
    const d = document.createElement('dialog');
    d.className = `modal${o.size ? ' modal--' + o.size : ''}`;
    const titleId = 'm-' + Math.random().toString(36).slice(2, 8);
    d.setAttribute('aria-labelledby', titleId);
    const actions = o.actions || [{ label: '關閉', variant: '' }];
    d.innerHTML = `<div class="modal__box">
  <div class="modal__head">
    ${o.icon ? `<span class="modal__icon${o.tone ? ' modal__icon--' + o.tone : ''}">${App.icon(o.icon)}</span>` : ''}
    <div class="modal__titles"><h2 class="modal__title" id="${titleId}">${App.esc(o.title || '')}</h2>${o.lead ? `<p class="modal__lead">${App.esc(o.lead)}</p>` : ''}</div>
    <button type="button" class="icon-btn icon-btn--sm modal__close" aria-label="關閉">${App.icon('x')}</button>
  </div>
  <div class="modal__body"></div>
  <div class="modal__foot">${actions.map((a, i) => `<button type="button" class="btn${a.variant ? ' btn--' + a.variant : ''}" data-act="${i}">${App.esc(a.label)}</button>`).join('')}</div>
</div>`;
    const body = d.querySelector('.modal__body');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    document.body.appendChild(d);
    const close = () => App.closeDialog(d);
    d.querySelector('.modal__close').addEventListener('click', close);
    d.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = actions[Number(b.dataset.act)];
      if (a.onClick) a.onClick(close, d);
      if (!a.keepOpen) close();
    }));
    d.addEventListener('close', () => { if (o.onClose) o.onClose(); setTimeout(() => d.remove(), 0); });
    App.openDialog(d);
    return { el: d, close };
  };

  /* ===================================================================
     Tabs / Seg / Accordion
     =================================================================== */
  App.tabs = (list, o = {}) => {
    const tabs = $$('[role="tab"]', list);
    let ink = list.querySelector('.tabs__ink');
    // 只有 .tabs 樣式的分頁列才加滑動底線；自訂樣式的 tablist 不加
    if (!ink && list.classList.contains('tabs') && !list.classList.contains('tabs--pill')) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    const moveInk = tab => { if (ink) { ink.style.width = tab.offsetWidth + 'px'; ink.style.transform = `translateX(${tab.offsetLeft}px)`; } };
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      moveInk(tabs[i]);
      if (focus) tabs[i].focus();
      if (o.onChange) o.onChange(i, tabs[i]);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        const k = e.key;
        let n = null;
        if (k === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (k === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (k === 'Home') n = 0;
        else if (k === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); select(n, true); }
      });
    });
    const initial = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    select(initial);
    if (ink) new ResizeObserver(() => moveInk(tabs.find(t => t.getAttribute('aria-selected') === 'true'))).observe(list);
    return { select };
  };

  App.seg = (seg, o = {}) => {
    const btns = $$('button', seg);
    const set = v => {
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
    };
    btns.forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return;
      set(b.dataset.value);
      if (o.onChange) o.onChange(b.dataset.value, b);
    }));
    return { value: () => (btns.find(b => b.getAttribute('aria-pressed') === 'true') || {}).dataset?.value, set };
  };

  App.accordion = (root, o = {}) => {
    root.addEventListener('click', e => {
      const btn = e.target.closest('.acc__btn');
      if (!btn || !root.contains(btn)) return;
      const item = btn.closest('.acc__item');
      const open = btn.getAttribute('aria-expanded') !== 'true';
      if (o.single && open) {
        $$('.acc__item.is-open', root).forEach(it => { if (it !== item) { it.classList.remove('is-open'); it.querySelector('.acc__btn').setAttribute('aria-expanded', 'false'); } });
      }
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  };

  /* ===================================================================
     Reveal / 可見性 / 動畫工具
     =================================================================== */
  let revealIO = null;
  const inViewport = el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
  App.reveal = (root = document) => {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (App.reducedMotion() || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    if (!revealIO) {
      // 不設底部負 rootMargin：首屏底部的元素也要能立刻觸發
      revealIO = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); }
      }), { threshold: 0 });
    }
    els.forEach(el => {
      // 已在視窗內的直接顯示，不先藏再淡入
      if (inViewport(el)) el.classList.add('is-in');
      else revealIO.observe(el);
    });
  };
  // 保底：快速跳轉時 IO 可能晚一步，捲動時順手把已經進入或超過視窗的元素顯示
  let revealTick = 0;
  function revealSweep() {
    revealTick = 0;
    $$('.reveal-ready [data-reveal]:not(.is-in)').forEach(el => {
      if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in');
    });
  }

  App.whenVisible = (el, fn, o = {}) => {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold: o.threshold || 0 });
    io.observe(el);
  };

  // rAF 迴圈：元素離開視窗或分頁隱藏時自動暫停，回來時接續
  App.loop = (el, tick) => {
    let wanted = false, inView = false, running = false, raf = 0, last = 0;
    const frame = now => {
      raf = 0;
      if (!running) return;
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      tick(dt);
      if (running) raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      const should = wanted && inView && !document.hidden;
      if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
      else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      el.classList.toggle('is-paused', wanted && !should);
    };
    const io = new IntersectionObserver(entries => { inView = entries[entries.length - 1].isIntersecting; sync(); }, { threshold: 0 });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    return { start() { wanted = true; sync(); }, stop() { wanted = false; sync(); } };
  };

  App.countUp = (el, to, o = {}) => {
    const decimals = o.decimals || 0;
    el._cuTarget = to;
    const format = v => App.fmt.num(v, decimals);
    if (App.reducedMotion()) { el.textContent = format(to); return; }
    if (el._cuRunning) return; // 進行中的動畫會在每一幀讀取最新目標
    el._cuRunning = true;
    const from = Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    const dur = o.dur || 1400;
    let t0 = 0;
    const step = now => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / dur);
      const target = el._cuTarget;
      el.textContent = format(from + (target - from) * easeOut(p));
      if (p < 1) requestAnimationFrame(step);
      else { el.textContent = format(el._cuTarget); el._cuRunning = false; }
    };
    requestAnimationFrame(step);
  };

  // 滾動數字：每位數一條 0–9 的直條，以 transform 捲到目標
  App.odometer = (el, value, o = {}) => {
    const decimals = o.decimals || 0;
    el._odoTarget = value;
    el._odoDecimals = decimals;
    if (App.reducedMotion()) { el.textContent = App.fmt.num(value, decimals); return; }
    if (el._odoRaf) return;
    el._odoRaf = requestAnimationFrame(() => {
      el._odoRaf = 0;
      // 執行當下才讀最新目標，連續快速呼叫只會套用最後一次
      const str = App.fmt.num(el._odoTarget, el._odoDecimals);
      const shape = str.replace(/\d/g, '0');
      if (el._odoShape !== shape) {
        el._odoShape = shape;
        el.innerHTML = `<span class="sr-only"></span><span class="odo" aria-hidden="true">${[...str].map((ch, i) => /\d/.test(ch)
          ? `<span class="odo__col"><span class="odo__strip" style="--d:${i}">${'0123456789'.split('').map(n => `<span>${n}</span>`).join('')}</span></span>`
          : `<span class="odo__sep">${ch}</span>`).join('')}</span>`;
        void el.offsetWidth; // 讓初始 0 位置先生效，下一步才有轉場
      }
      el.querySelector('.sr-only').textContent = str;
      const strips = el.querySelectorAll('.odo__strip');
      let k = 0;
      [...str].forEach(ch => { if (/\d/.test(ch)) { strips[k].style.transform = `translateY(${-Number(ch) * 1.1}em)`; k++; } });
    });
  };

  /* ===================================================================
     縣市方塊地圖引擎
     =================================================================== */
  const SEED_D = 'M0 -11 C 6 -5, 8 1, 6 6 C 4 11, -4 11, -6 6 C -8 1, -6 -5, 0 -11 Z';
  App.tileMap = (host, opts = {}) => {
    const o = Object.assign({ theme: 'paper', mode: 'static', values: null, showValue: false, hideZero: true, unit: '', multi: false, required: false, selected: [], label: '臺灣 22 縣市方塊地圖', compact: false, matchEvery: 2100 }, opts);
    const COLS = 6, ROWS = 8, U = 100;
    const interactive = o.mode === 'select';
    const reduced = App.reducedMotion();
    const root = document.createElement('div');
    root.className = `tilemap tilemap--${o.theme}${o.compact ? ' tilemap--compact' : ''}`;
    const grid = document.createElement('div');
    grid.className = 'tilemap__grid';
    grid.setAttribute('role', interactive ? 'group' : 'list');
    grid.setAttribute('aria-label', o.label);
    const tiles = {};
    App.COUNTIES.forEach(c => {
      const t = document.createElement(interactive ? 'button' : 'div');
      if (interactive) { t.type = 'button'; t.setAttribute('aria-pressed', 'false'); } else t.setAttribute('role', 'listitem');
      t.className = 'tm-tile' + (c.island ? ' is-island' : '') + (o.home === c.id ? ' is-home' : '');
      t.style.gridColumn = c.col;
      t.style.gridRow = c.row;
      t.dataset.id = c.id;
      t.dataset.level = '0';
      t.innerHTML = `<span class="tm-tile__name" aria-hidden="true">${c.short}</span><span class="tm-tile__val" aria-hidden="true"></span><span class="sr-only"></span>`;
      grid.appendChild(t);
      tiles[c.id] = t;
    });
    const fx = svgEl('svg', { class: 'tilemap__fx', viewBox: `0 0 ${COLS * U} ${ROWS * U}`, 'aria-hidden': 'true', focusable: 'false' });
    const L = {};
    ['arcs', 'marks', 'sprouts', 'dots', 'seeds'].forEach(k => { L[k] = svgEl('g'); fx.appendChild(L[k]); });
    root.append(grid, fx);
    host.innerHTML = '';
    host.appendChild(root);

    const center = id => { const c = App.county(id); return { x: (c.col - .5) * U, y: (c.row - .5) * U }; };
    let values = o.values || {};
    const seedMode = !!o.seeds;
    const grown = new Set();
    const levelOf = (v, max) => (v > 0 ? Math.max(1, Math.ceil(v / max * 5)) : 0);
    function paint() {
      const max = Math.max(1, ...Object.values(values));
      App.COUNTIES.forEach(c => {
        const t = tiles[c.id];
        const v = values[c.id] || 0;
        t.dataset.level = String(!seedMode || grown.has(c.id) ? levelOf(v, max) : 0);
        t.querySelector('.tm-tile__val').textContent = o.showValue && (v || !o.hideZero) ? App.fmt.num(v) : '';
        t.querySelector('.sr-only').textContent = o.showValue ? `${c.name} ${v}${o.unit}` : c.name;
        t.title = o.showValue ? `${c.name}：${v} ${o.unit}` : c.name;
      });
    }
    paint();

    let selected = new Set(o.selected);
    function syncSel() {
      Object.entries(tiles).forEach(([id, t]) => {
        const on = selected.has(id);
        t.classList.toggle('is-selected', on);
        if (interactive) t.setAttribute('aria-pressed', String(on));
      });
    }
    syncSel();
    if (interactive) {
      grid.addEventListener('click', e => {
        const t = e.target.closest('.tm-tile');
        if (!t) return;
        const id = t.dataset.id;
        if (o.multi) { if (selected.has(id)) selected.delete(id); else selected.add(id); }
        else if (selected.has(id)) { if (o.required) return; selected.clear(); }
        else { selected.clear(); selected.add(id); }
        syncSel();
        if (o.onChange) o.onChange([...selected], id);
      });
    }

    // ---- 動畫：actors 依「引擎時間」推進，離開視窗時時間暫停 ----
    let T = 0;
    let actors = [];
    let matchState = null;
    const loop = App.loop(root, dt => {
      T += dt;
      for (let i = actors.length - 1; i >= 0; i--) {
        const a = actors[i];
        if (T < a.t0) continue;
        const p = Math.min(1, (T - a.t0) / a.dur);
        a.update(p);
        if (p >= 1) { actors.splice(i, 1); if (a.done) a.done(); }
      }
      if (matchState) matchTick();
      if (!actors.length && !matchState) loop.stop();
    });
    const add = (delay, dur, update, done) => { actors.push({ t0: T + delay, dur, update, done }); loop.start(); };

    function sprout(id, instant) {
      const { x, y } = center(id);
      const g = svgEl('g', { transform: `translate(${x + 30} ${y - 26})` });
      const inner = svgEl('g', { transform: `scale(${instant ? 1 : 0})` });
      inner.append(
        svgEl('path', { class: 'fx-stem', d: 'M0 12 V1', 'stroke-width': '2.6', 'stroke-linecap': 'round' }),
        svgEl('path', { class: 'fx-leaf', d: 'M0 3 C -1 -5, -8 -9, -14 -7 C -12 0, -6 4, 0 3 Z' }),
        svgEl('path', { class: 'fx-leaf', d: 'M0 1 C 2 -8, 9 -12, 15 -10 C 13 -2, 7 2, 0 1 Z' }),
      );
      g.appendChild(inner);
      L.sprouts.appendChild(g);
      if (!instant) add(120, 650, p => inner.setAttribute('transform', `scale(${easeBack(p)})`));
      const n = Math.min(3, (o.seeds.dots || {})[id] || 1);
      const offs = n === 1 ? [0] : n === 2 ? [-12, 12] : [-20, 0, 20];
      offs.forEach((dx, j) => {
        const dot = svgEl('circle', { class: 'fx-dot', cx: x + dx, cy: y + 27, r: instant ? 6.5 : 0, 'stroke-width': '2.5' });
        L.dots.appendChild(dot);
        if (!instant) add(380 + j * 120, 420, p => dot.setAttribute('r', String(6.5 * easeBack(p))));
      });
    }
    function grow(id, instant) {
      grown.add(id);
      paint();
      if (!instant) {
        const { x, y } = center(id);
        const rp = svgEl('circle', { class: 'fx-ripple', cx: x, cy: y, r: 6, 'stroke-width': '2' });
        L.marks.appendChild(rp);
        add(0, 760, p => { rp.setAttribute('r', String(6 + 42 * easeOut(p))); rp.style.opacity = String(1 - p); }, () => rp.remove());
      }
      sprout(id, instant);
    }
    function plant(order, instant, then) {
      if (instant) { order.forEach(id => grow(id, true)); if (then) then(); return; }
      order.forEach((id, k) => {
        const { x, y } = center(id);
        const g = svgEl('g');
        g.appendChild(svgEl('path', { class: 'fx-seed', d: SEED_D }));
        g.style.opacity = '0';
        L.seeds.appendChild(g);
        const y0 = -70 - (k % 4) * 30;
        const sway = (k % 2 ? 1 : -1) * 16;
        add(k * 130, 950, p => {
          const e = p * p; // 重力：越落越快
          const yy = y0 + (y - 14 - y0) * e;
          const xx = x + Math.sin(p * Math.PI * 1.6) * sway * (1 - p);
          g.setAttribute('transform', `translate(${xx.toFixed(1)} ${yy.toFixed(1)}) rotate(${((1 - p) * 50 * (k % 2 ? 1 : -1)).toFixed(1)})`);
          g.style.opacity = String(Math.min(1, p * 5));
        }, () => {
          g.remove();
          grow(id, false);
          if (k === order.length - 1 && then) add(700, 1, () => {}, then);
        });
      });
    }

    // corner：足跡弧線接在方塊右上角，避開中央的縣市名稱；其餘接在講師點與申請單位標記
    function arcPath(fromId, toId, corner) {
      const a = center(fromId), b = center(toId);
      const ax = corner ? a.x + 26 : a.x, ay = corner ? a.y - 26 : a.y + 27;
      const bx = corner ? b.x + 26 : b.x - 22, by = corner ? b.y - 26 : b.y + 18;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy);
      let nx = -dy / dist, ny = dx / dist;
      if (ny > 0) { nx = -nx; ny = -ny; } // 弧線一律往上拱
      const k = Math.min(.42, 70 / dist + .22) * dist;
      return { d: `M${ax.toFixed(1)} ${ay.toFixed(1)} Q${(mx + nx * k).toFixed(1)} ${(my + ny * k).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`, bx, by };
    }
    function spawnMatch(m, staticAt) {
      const { d, bx, by } = arcPath(m.from, m.to);
      const shadow = svgEl('path', { class: 'fx-arc-shadow', d, 'stroke-width': '9' });
      const arc = svgEl('path', { class: 'fx-arc', d, 'stroke-width': '3', pathLength: '1', 'stroke-dasharray': '1', 'stroke-dashoffset': staticAt != null ? '0' : '1' });
      const mark = svgEl('path', { class: 'fx-mark', d: 'M0 -10 L10 0 L0 10 L-10 0 Z', 'stroke-width': '2.5', transform: `translate(${bx} ${by}) scale(${staticAt != null ? 1 : 0})` });
      const glow = svgEl('circle', { class: 'fx-glow', r: '12', cx: '-99', cy: '-99' });
      const spark = svgEl('circle', { class: 'fx-spark', r: '4.5', cx: '-99', cy: '-99' });
      const grp = svgEl('g');
      grp.append(shadow, arc, glow, spark);
      L.arcs.appendChild(grp);
      L.marks.appendChild(mark);
      const len = arc.getTotalLength();
      const at = p => { const pt = arc.getPointAtLength(len * p); glow.setAttribute('cx', pt.x); glow.setAttribute('cy', pt.y); spark.setAttribute('cx', pt.x); spark.setAttribute('cy', pt.y); };
      if (o.onMatch) o.onMatch(m);
      if (staticAt != null) { at(staticAt); return; }
      matchState.live++;
      add(0, 380, p => mark.setAttribute('transform', `translate(${bx} ${by}) scale(${easeBack(p)})`));
      add(180, 820, p => arc.setAttribute('stroke-dashoffset', String(1 - easeInOut(p))));
      [0, 1].forEach(trip => {
        add(900 + trip * 1550, 1450, p => at(easeInOut(p)), () => {
          const rp = svgEl('circle', { class: 'fx-ripple', cx: bx, cy: by, r: 8, 'stroke-width': '2' });
          rp.style.stroke = 'var(--fx-mark)';
          L.marks.appendChild(rp);
          add(0, 650, q => { rp.setAttribute('r', String(8 + 26 * easeOut(q))); rp.style.opacity = String(1 - q); }, () => rp.remove());
        });
      });
      add(4100, 700, p => { grp.style.opacity = String(1 - p); mark.style.opacity = String(1 - p); }, () => { grp.remove(); mark.remove(); matchState.live--; });
    }
    function matchTick() {
      const s = matchState;
      if (T >= s.next && s.live < 3) {
        spawnMatch(s.list[s.idx % s.list.length]);
        s.idx++;
        s.next = T + o.matchEvery;
      }
    }
    function startMatches() {
      if (!o.matches || !o.matches.length) return;
      if (reduced) { o.matches.slice(0, 3).forEach((m, i) => spawnMatch(m, [.35, .6, .8][i])); return; }
      matchState = { list: o.matches, idx: 0, next: T + 200, live: 0 };
      loop.start();
    }
    function drawArcs(list, instant) {
      list.forEach((a, i) => {
        const { d, bx, by } = arcPath(a.from, a.to, true);
        const arc = svgEl('path', { class: 'fx-arc', d, 'stroke-width': '2.6', pathLength: '1', 'stroke-dasharray': '1', 'stroke-dashoffset': instant ? '0' : '1' });
        const dot = svgEl('circle', { class: 'fx-mark', cx: bx, cy: by, r: instant ? 6 : 0, 'stroke-width': '2' });
        L.arcs.appendChild(arc);
        L.marks.appendChild(dot);
        if (!instant) {
          add(i * 160, 900, p => arc.setAttribute('stroke-dashoffset', String(1 - easeInOut(p))));
          add(i * 160 + 700, 400, p => dot.setAttribute('r', String(6 * easeBack(p))));
        }
      });
    }

    function run() {
      if (seedMode) plant(o.seeds.order, reduced, startMatches);
      else startMatches();
      if (o.arcs) drawArcs(o.arcs, reduced);
    }
    if (seedMode || o.matches || o.arcs) {
      if (reduced) run(); else App.whenVisible(root, run);
    }

    return {
      el: root,
      center,
      setValues(v) { values = v || {}; paint(); },
      select(ids) { selected = new Set(ids); syncSel(); },
      getSelected: () => [...selected],
      replay() {
        actors = [];
        matchState = null;
        grown.clear();
        Object.values(L).forEach(g => { g.innerHTML = ''; });
        paint();
        run();
      },
    };
  };

  /* ===================================================================
     藤蔓：隨捲動長出（只增不減），把節點連起來
     =================================================================== */
  App.vine = (container, opts = {}) => {
    const o = Object.assign({ nodes: '[data-vine-node]', leafEvery: 64, width: 3 }, opts);
    const svg = svgEl('svg', { class: 'vine', 'aria-hidden': 'true', focusable: 'false' });
    const track = svgEl('path', { class: 'vine__track', 'stroke-width': '2', 'stroke-dasharray': '2 8' });
    const stem = svgEl('path', { class: 'vine__stem', 'stroke-width': String(o.width), pathLength: '1', 'stroke-dasharray': '1', 'stroke-dashoffset': '1' });
    const leafG = svgEl('g');
    const bud = svgEl('circle', { class: 'vine__bud', r: '5', 'stroke-width': '2' });
    svg.append(track, stem, leafG, bud);
    container.classList.add('has-vine');
    container.prepend(svg);
    let nodes = [], nodeFrac = [], leaves = [], len = 0, vertical = false;
    let target = 0, shown = 0, raf = 0;

    function build() {
      const box = container.getBoundingClientRect();
      nodes = $$(o.nodes, container);
      if (nodes.length < 2 || !box.width) return;
      svg.setAttribute('viewBox', `0 0 ${box.width.toFixed(1)} ${box.height.toFixed(1)}`);
      const pts = nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top }; });
      vertical = Math.abs(pts[pts.length - 1].y - pts[0].y) > Math.abs(pts[pts.length - 1].x - pts[0].x);
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const s = i % 2 ? 1 : -1;
        // 橫向時振幅小一點，避免藤蔓鑽進下方卡片
        const amp = (vertical ? Math.abs(dy) * .2 : Math.abs(dx) * .12) * s;
        const c1 = vertical ? { x: a.x + amp, y: a.y + dy * .35 } : { x: a.x + dx * .35, y: a.y - amp };
        const c2 = vertical ? { x: b.x - amp, y: a.y + dy * .65 } : { x: a.x + dx * .65, y: b.y + amp };
        segs.push(` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      }
      const start = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      const d = start + segs.join('');
      stem.setAttribute('d', d);
      track.setAttribute('d', d);
      len = stem.getTotalLength();
      // 各節點在路徑上的位置比例
      const probe = svgEl('path');
      svg.appendChild(probe);
      nodeFrac = pts.map((p, i) => {
        if (i === 0) return 0;
        probe.setAttribute('d', start + segs.slice(0, i).join(''));
        return probe.getTotalLength() / len;
      });
      probe.remove();
      leafG.innerHTML = '';
      leaves = [];
      let side = 1;
      for (let s = 36; s < len - 20; s += o.leafEvery) {
        const f = s / len;
        if (nodeFrac.some(nf => Math.abs(nf - f) * len < 30)) continue;
        const p = stem.getPointAtLength(s), q = stem.getPointAtLength(Math.min(len, s + 2));
        const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + side * 52;
        const g = svgEl('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)})` });
        const leaf = svgEl('path', { class: 'vine__leaf', d: 'M0 0 C 5 -7, 14 -8, 20 -3 C 14 2, 6 3, 0 0 Z', 'stroke-width': '1.6' });
        g.appendChild(leaf);
        leafG.appendChild(g);
        leaves.push({ el: leaf, f });
        side = -side;
      }
      apply();
    }
    function apply() {
      stem.setAttribute('stroke-dashoffset', String(1 - shown));
      if (len) {
        const p = stem.getPointAtLength(len * shown);
        bud.setAttribute('cx', p.x);
        bud.setAttribute('cy', p.y);
        bud.style.opacity = shown > .002 && shown < .998 ? '1' : '0';
      }
      leaves.forEach(lf => lf.el.classList.toggle('is-on', shown >= lf.f));
      nodes.forEach((n, i) => {
        const on = shown >= nodeFrac[i] - .01;
        n.classList.toggle('is-reached', on);
        const step = n.closest('[data-vine-step]');
        if (step) step.classList.toggle('is-reached', on);
      });
    }
    function measure() {
      const r = container.getBoundingClientRect();
      const vh = innerHeight;
      const p = vertical ? (vh * .72 - r.top) / r.height : (vh * .86 - r.top) / (r.height + vh * .3);
      target = Math.max(target, clamp(p, 0, 1)); // 只增不減：捲回去不收回，截圖與返回閱讀都完整
      if (!raf && shown < target) raf = requestAnimationFrame(animate);
    }
    function animate() {
      raf = 0;
      shown += (target - shown) * .09 + .0015;
      if (shown >= target) shown = target;
      apply();
      if (shown < target) raf = requestAnimationFrame(animate);
    }
    if (App.reducedMotion()) { target = shown = 1; }
    build();
    if (!App.reducedMotion()) {
      measure();
      addEventListener('scroll', measure, { passive: true });
      addEventListener('resize', measure);
    }
    const ro = new ResizeObserver(() => build());
    ro.observe(container);
    return {
      refresh: build,
      // 容器會被整段重繪時（例如進度查詢換案件）先拆掉，避免捲動監聽隨重繪次數累積
      destroy() {
        removeEventListener('scroll', measure);
        removeEventListener('resize', measure);
        ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
      },
    };
  };

  /* ===================================================================
     月曆
     =================================================================== */
  App.calendar = (host, opts = {}) => {
    const o = Object.assign({ month: App.TODAY.slice(0, 7), avail: [], busy: {}, events: {}, selected: [], maxSelect: 1, label: '可授課月曆' }, opts);
    let ym = o.month;
    let selected = [...o.selected];
    let focusIso = null;
    const isAvail = iso => (typeof o.avail === 'function' ? o.avail(iso) : o.avail.includes(iso));
    const shift = (y, m, d) => { const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`; };
    function render() {
      const [y, m] = ym.split('-').map(Number);
      const first = new Date(y, m - 1, 1).getDay();
      const days = new Date(y, m, 0).getDate();
      const cells = [];
      for (let i = 0; i < first; i++) cells.push('<span class="cal__day is-out" aria-hidden="true"></span>');
      const candidates = [];
      for (let d = 1; d <= days; d++) {
        const iso = `${y}-${pad(m)}-${pad(d)}`;
        const av = isAvail(iso), busy = o.busy[iso], ev = o.events[iso], sel = selected.includes(iso);
        const cls = ['cal__day', av && 'is-avail', busy && 'is-busy', ev && 'is-event', sel && 'is-selected', iso === App.TODAY && 'is-today'].filter(Boolean).join(' ');
        const state = sel ? '已選擇' : ev ? ev : av ? '可授課' : busy ? busy : '不開放';
        const clickable = av || ev || sel;
        if (clickable) candidates.push(iso);
        cells.push(`<button type="button" class="${cls}" data-iso="${iso}" tabindex="-1" ${clickable ? '' : 'disabled'} aria-pressed="${sel}" aria-label="${App.fmt.rocLong(iso)} ${App.esc(state)}"${busy || ev ? ` title="${App.esc(busy || ev)}"` : ''}>${d}</button>`);
      }
      host.innerHTML = `<div class="cal" role="group" aria-label="${App.esc(o.label)}">
  <div class="cal__head">
    <button type="button" class="icon-btn icon-btn--sm" data-nav="-1" aria-label="上個月"${o.min && shift(y, m, -1) < o.min.slice(0, 7) ? ' disabled' : ''}>${App.icon('chevron-left')}</button>
    <h3 class="cal__title" aria-live="polite">${App.fmt.rocYM(ym)}</h3>
    <button type="button" class="icon-btn icon-btn--sm" data-nav="1" aria-label="下個月"${o.max && shift(y, m, 1) > o.max.slice(0, 7) ? ' disabled' : ''}>${App.icon('chevron-right')}</button>
  </div>
  <div class="cal__grid">${DOW.split('').map(w => `<span class="cal__dow" aria-hidden="true">${w}</span>`).join('')}${cells.join('')}</div>
</div>`;
      // roving tabindex：一個可 tab 的日期，其餘用方向鍵
      const btns = $$('.cal__day[data-iso]', host);
      const keep = btns.find(b => b.dataset.iso === focusIso) || btns.find(b => b.classList.contains('is-selected')) || btns.find(b => !b.disabled) || btns[0];
      if (keep) keep.tabIndex = 0;
    }
    host.addEventListener('click', e => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const [y, m] = ym.split('-').map(Number);
        ym = shift(y, m, Number(nav.dataset.nav));
        render();
        if (o.onMonth) o.onMonth(ym);
        return;
      }
      const b = e.target.closest('.cal__day[data-iso]');
      if (!b || b.disabled) return;
      const iso = b.dataset.iso;
      focusIso = iso;
      if (o.onDay) o.onDay(iso);
      if (!isAvail(iso) && !selected.includes(iso)) return;
      if (selected.includes(iso)) selected = selected.filter(x => x !== iso);
      else if (o.maxSelect === 1) selected = [iso];
      else if (selected.length < o.maxSelect) selected = [...selected, iso].sort();
      else { App.toast(`最多選擇 ${o.maxSelect} 個日期`, { tone: 'warn', desc: '請先取消一個已選日期再新增。' }); return; }
      render();
      const again = host.querySelector(`[data-iso="${iso}"]`);
      if (again) again.focus();
      if (o.onSelect) o.onSelect([...selected]);
    });
    host.addEventListener('keydown', e => {
      const b = e.target.closest('.cal__day[data-iso]');
      if (!b) return;
      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
      if (!delta) return;
      e.preventDefault();
      const btns = $$('.cal__day[data-iso]', host);
      const i = btns.indexOf(b);
      const next = btns[clamp(i + delta, 0, btns.length - 1)];
      b.tabIndex = -1;
      next.tabIndex = 0;
      focusIso = next.dataset.iso;
      next.focus();
    });
    render();
    return {
      setMonth(v) { ym = v; render(); },
      setData(d) { Object.assign(o, d); render(); },
      setSelected(list) { selected = [...list]; render(); },
      getSelected: () => [...selected],
      month: () => ym,
    };
  };

  /* ===================================================================
     圖表（單一數列：一個色相；hover 提示＋螢幕報讀用表格）
     =================================================================== */
  function chartTip(wrap) {
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('aria-hidden', 'true');
    wrap.appendChild(tip);
    return {
      show(html, x, y) { tip.innerHTML = html; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('is-on'); },
      hide() { tip.classList.remove('is-on'); },
    };
  }
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    // 細一點的刻度級距，避免最大值只佔圖高一半
    return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s) * p;
  }
  function srTable(caption, rows, unit) {
    return `<table class="sr-only"><caption>${App.esc(caption)}</caption><tbody>${rows.map(r => `<tr><th scope="row">${App.esc(r.label)}</th><td>${r.value}${App.esc(unit || '')}</td></tr>`).join('')}</tbody></table>`;
  }

  // 圖表以容器實際寬度作為 viewBox 寬，文字才不會隨縮放變小；寬度改變時重繪
  function responsive(host, draw) {
    let w = 0, shown = App.reducedMotion();
    const run = () => {
      const nw = Math.round(host.clientWidth) || 640;
      if (Math.abs(nw - w) < 2) return;
      w = nw;
      const wrap = draw(Math.max(280, w));
      if (shown) wrap.classList.remove('is-waiting');
      else App.whenVisible(wrap, () => { shown = true; wrap.classList.remove('is-waiting'); });
    };
    run();
    new ResizeObserver(run).observe(host);
    return host.firstElementChild;
  }

  App.barChart = (host, o) => responsive(host, W => drawBars(host, o, W));
  function drawBars(host, o, W) {
    const data = o.data;
    const H = o.height || 260, P = { t: 30, r: 8, b: 36, l: 40 };
    const max = niceMax(Math.max(...data.map(d => d.value)) * 1.08);
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const band = iw / data.length, bw = Math.min(46, band * .58);
    const fmt = o.format || (v => App.fmt.num(v));
    const hl = o.highlight ?? data.length - 1;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = max / 4 * i, y = P.t + ih - ih * i / 4;
      grid += `<line class="${i ? 'chart__grid' : 'chart__base'}" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke-width="1"/>` +
        `<text class="chart__label" x="${P.l - 8}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    const bars = data.map((d, i) => {
      const h = ih * d.value / max, x = P.l + band * i + (band - bw) / 2, y = P.t + ih - h, r = Math.min(4, h);
      const path = `M${x} ${P.t + ih}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${P.t + ih}Z`;
      const label = i === hl || d.value === Math.max(...data.map(q => q.value)) ? `<text class="chart__value" x="${x + bw / 2}" y="${y - 8}" text-anchor="middle">${fmt(d.value)}</text>` : '';
      return `<rect class="chart__bar-hit" x="${P.l + band * i}" y="${P.t}" width="${band}" height="${ih}" data-i="${i}"/>` +
        `<path class="chart__bar${i === hl ? ' is-hl' : ''}" d="${path}" style="--i:${i}"/>${label}` +
        `<text class="chart__label" x="${P.l + band * i + band / 2}" y="${H - 12}" text-anchor="middle">${App.esc(d.label)}</text>`;
    }).join('');
    host.innerHTML = `<div class="chart${o.onDark ? ' chart--on-dark' : ''}${App.reducedMotion() ? '' : ' is-waiting'}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${App.esc(o.title || '長條圖')}">${grid}${bars}</svg>${srTable(o.title || '', data, o.unit)}</div>`;
    const wrap = host.firstElementChild;
    const tip = chartTip(wrap);
    wrap.querySelectorAll('.chart__bar-hit').forEach(hit => {
      hit.addEventListener('mouseenter', () => {
        const d = data[Number(hit.dataset.i)];
        const bar = hit.nextElementSibling.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
        tip.show(`${App.esc(d.label)}　<b>${fmt(d.value)}</b> ${App.esc(o.unit || '')}${d.note ? `<br>${App.esc(d.note)}` : ''}`, bar.left - wb.left + bar.width / 2, bar.top - wb.top);
      });
      hit.addEventListener('mouseleave', tip.hide);
    });
    return wrap;
  }

  App.lineChart = (host, o) => responsive(host, W => drawLine(host, o, W));
  function drawLine(host, o, W) {
    const vals = o.values, labels = o.labels;
    const H = o.height || 240, P = { t: 30, r: 24, b: 36, l: 44 };
    const min = o.min ?? Math.floor(Math.min(...vals) * 2) / 2 - .5, max = o.max ?? 5;
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const dec = o.decimals ?? 2;
    const X = i => P.l + (vals.length === 1 ? iw / 2 : iw * i / (vals.length - 1));
    const Y = v => P.t + ih - ih * (v - min) / (max - min);
    let grid = '';
    const steps = 4;
    // 刻度若不是 0.1 的整數倍就多顯示一位，避免 4.25 被四捨五入成 4.3
    const tdec = Math.abs((max - min) / steps * 10 % 1) < 1e-9 ? 1 : 2;
    for (let i = 0; i <= steps; i++) {
      const v = min + (max - min) * i / steps, y = Y(v);
      grid += `<line class="${i ? 'chart__grid' : 'chart__base'}" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke-width="1"/><text class="chart__label" x="${P.l - 8}" y="${y + 4}" text-anchor="end">${v.toFixed(tdec)}</text>`;
    }
    const pts = vals.map((v, i) => [X(i), Y(v)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    const area = `${line}L${pts[pts.length - 1][0]} ${P.t + ih}L${pts[0][0]} ${P.t + ih}Z`;
    const last = pts.length - 1;
    host.innerHTML = `<div class="chart${App.reducedMotion() ? '' : ' is-waiting'}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${App.esc(o.title || '折線圖')}">${grid}
<path class="chart__area" d="${area}"/>
<path class="chart__line" d="${line}" stroke-width="2.5" pathLength="1" stroke-dasharray="1"/>
<line class="chart__cross" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" stroke-width="1" stroke-dasharray="3 3" style="opacity:0"/>
${pts.map((p, i) => `<circle class="chart__pt" cx="${p[0]}" cy="${p[1]}" r="${i === last ? 6 : 4.5}" stroke-width="2.5"/>`).join('')}
<text class="chart__value" x="${pts[last][0]}" y="${pts[last][1] - 14}" text-anchor="middle">${vals[last].toFixed(dec)}</text>
${labels.map((l, i) => `<text class="chart__label" x="${X(i)}" y="${H - 12}" text-anchor="middle">${App.esc(l)}</text>`).join('')}
<rect class="chart__bar-hit" x="${P.l}" y="${P.t}" width="${iw}" height="${ih}"/>
</svg>${srTable(o.title || '', labels.map((l, i) => ({ label: l, value: vals[i] })), o.unit)}</div>`;
    const wrap = host.firstElementChild;
    const svg = wrap.querySelector('svg');
    const cross = wrap.querySelector('.chart__cross');
    const tip = chartTip(wrap);
    const hit = wrap.querySelector('.chart__bar-hit');
    hit.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * W;
      const i = clamp(Math.round((sx - P.l) / (iw / Math.max(1, vals.length - 1))), 0, vals.length - 1);
      cross.setAttribute('x1', X(i));
      cross.setAttribute('x2', X(i));
      cross.style.opacity = '1';
      const wb = wrap.getBoundingClientRect();
      tip.show(`${App.esc(labels[i])}${App.esc(o.labelSuffix || '')}　<b>${vals[i].toFixed(dec)}</b> ${App.esc(o.unit || '')}${o.notes && o.notes[i] ? `<br>${App.esc(o.notes[i])}` : ''}`, r.left - wb.left + X(i) / W * r.width, r.top - wb.top + pts[i][1] / H * r.height);
    });
    hit.addEventListener('mouseleave', () => { cross.style.opacity = '0'; tip.hide(); });
    return wrap;
  }

  App.hbars = (host, o) => {
    const max = o.max || Math.max(...o.data.map(d => d.value));
    const fmt = o.format || (v => App.fmt.num(v));
    host.innerHTML = `<div class="hbars${o.onDark ? ' hbars--on-dark' : ''}${App.reducedMotion() ? '' : ' is-waiting'}" role="list">${o.data.map(d => `<div class="hbar" role="listitem"><span class="hbar__label">${App.esc(d.label)}</span><span class="hbar__track"><span class="hbar__fill" style="--p:${(d.value / max).toFixed(4)}"></span></span><span class="hbar__val">${fmt(d.value)}<span class="sr-only"> ${App.esc(o.unit || '')}</span></span></div>`).join('')}</div>`;
    const wrap = host.firstElementChild;
    if (!App.reducedMotion()) App.whenVisible(wrap, () => wrap.classList.remove('is-waiting'));
    return wrap;
  };

  /* ===================================================================
     頁面外殼初始化
     =================================================================== */
  function initNav() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const header = $('.site-header');
    const toggle = $('[data-nav-toggle]');
    if (!header) return;
    const setOpen = open => {
      header.classList.toggle('is-open', open);
      if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單'); }
    };
    if (toggle) toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    $$('.site-nav a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', e => { if (header.classList.contains('is-open') && !header.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); if (toggle) toggle.focus(); } });
    matchMedia('(min-width: 1081px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
    onScroll();
    addEventListener('scroll', () => {
      onScroll();
      if (!revealTick) revealTick = requestAnimationFrame(revealSweep);
    }, { passive: true });
  }

  function init() {
    injectSprite();
    initNav();
    renderCounts();
    App.reveal();
    // 先讓在視窗內的元素標記為 .is-in，再打開「隱藏未進場元素」的開關，避免首屏閃爍
    document.documentElement.classList.add('reveal-ready');
    // 沒有實際目的地的動作：data-toast 統一給回饋
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-toast]');
      if (!t) return;
      e.preventDefault();
      App.toast(t.dataset.toast, { desc: t.dataset.toastDesc, tone: t.dataset.toastTone || 'info' });
    });
    // 自動化測試或鍵盤送出的 Escape：關閉最上層由 App 開啟的對話框
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const d = $$('dialog[open][data-app-dialog]').pop();
      if (d) App.closeDialog(d);
    });
    addEventListener('beforeprint', () => $$('[data-reveal]').forEach(el => el.classList.add('is-in')));
    // 同頁錨點平滑捲動（不用 CSS scroll-behavior，避免程式化 scrollTo 也被拖慢）
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href*="#"]');
      if (!a || a.pathname !== location.pathname || !a.hash || a.hash === '#') return;
      const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: App.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      history.pushState(null, '', a.hash);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }
  init();
})();
