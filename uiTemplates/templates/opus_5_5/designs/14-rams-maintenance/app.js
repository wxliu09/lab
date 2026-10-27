/*
 * 澄港市 路燈與公共設施 維護工單系統（Model ML-26）— 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * 因為 inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 *
 * ── window.App ─────────────────────────────────────────────────────────────
 * 資料（全站共用；只在記憶體中變動，換頁即重置）
 *   App.DATA.districts   8 個行政區：code, name, en, lamps(路燈數), dark(不亮數), crew(責任班), density, label[x,y], poly
 *   App.DATA.types       設備類型 STL 路燈 / SIG 號誌 / PAV 人行地磚 / PRK 公園設施（name, en, unit, icon）
 *   App.DATA.prio        優先級 1–4：code, name, sla(修復時限 h), arrive(到場時限 h), desc
 *   App.DATA.status      new 待派工 / dispatched 已派工 / onsite 已到場 / repair 維修中 / review 待驗收 / closed 已結案
 *   App.DATA.sources     報修來源 1999 / app / patrol / auto / police
 *   App.DATA.crews       維修班 L1–L4、SG、RD、CT（承攬廠商）：name, short, shift, areas, leader, members, vehicle
 *   App.DATA.people      dispatcher 張書瑋（目前登入）、inspector 蘇怡君（驗收）、chief 何韋廷
 *   App.DATA.parts       零件目錄 code → {name, unit, price, type}
 *   App.DATA.models      燈具 / 設備型號（warranty 保固年、life 設計壽命年）
 *   App.DATA.assetTypes  設備總量、保固中、逾齡、本月巡檢完成率（assets 頁用）
 *   App.DATA.orders      53 張工單（欄位見檔尾「工單欄位」）
 *   App.STATUS_ORDER     ['new','dispatched','onsite','repair','review','closed']
 *   App.FLOW             處理流程五步：報修 → 派工 → 到場 → 維修 → 驗收（key, label, en, tkey）
 * 查詢 / 衍生值（每次呼叫都讀最新資料）
 *   App.getOrder(id) · App.district(code) · App.crew(id) · App.part(code) · App.typeOf(code)
 *   App.counts() → {new, dispatched, onsite, repair, review, closed, open, p1, today, overdue}
 *   App.network() → {total, dark, online, rate}（路燈在線率，rate 為 0–100）
 *   App.mttr(prio = 0) → {hours, n, target, hitRate}（已完修工單：報修 → 維修完成；prio 0 = 全部）
 *   App.sla(order) → {due, remain, state:'ok'|'soon'|'over'|'met'|'missed', label}
 *   App.crewState(id) → {state:'work'|'transit'|'standby'|'off', label, tone, order, next, overtime, done, total}
 *   App.suggestCrew(order) → crew id · App.flowIndex(order) → 0–5（已完成到第幾步）
 *   App.asset(code) → {code, type, model, modelName, installed, age, life, warrantyUntil, inWarranty, height, circuit, lastInspect}
 *   App.assetPoint(code, dist) → [x, y]（在點陣地圖 viewBox 760×440 中的位置，固定不變）
 *   App.history(order) → [{at, label, text, who}]（依時間排序）
 *   App.orderUrl(id) · App.param(name)
 * 資料變更（皆回傳 {undo()}；會發出 'app:orders' 事件，計數徽章與頁面重繪都掛在這個事件上）
 *   App.dispatch(ids, crewId, plannedMs, note)        派工 / 改派（批次）
 *   App.advance(id, toStatus, {note, who, crew})      推進流程：onsite / repair / review / closed
 *   App.createOrder({type, asset, dist, loc, fault, prio, src, desc, item}) → order（狀態 new）
 *   App.on('orders', fn(detail)) · App.emit(name, detail)
 * 時間與格式（固定以 UTC+8 計算；「現在」為 2026-10-23（五）18:40 起持續走動）
 *   App.now() → ms · App.time('10-23 18:31' | '2026-10-23 18:31') → ms · App.dayStart(ms)
 *   App.fmt.num / money / time / date / dateFull / dt / weekday / stamp / rel / hours / dur
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(str) · App.icon(name, cls) · App.typeIcon(type) · App.led(tone, {pulse:'breathe'|'blink'})
 *   App.statusBadge(status) · App.prioBadge(p) · App.typeTag(type) · App.slaTag(order)
 *   App.meter(value, max, {cells, tone}) LED 段數條 · App.emptyState({title, text})
 * 實體控制元件
 *   App.seg(host, {pattern:'8888' | '88:88', value, label, unit, tone:'orange'|'green'|'red'|'ink'}) → {set(v, {roll}), colon(on)}
 *       七段顯示器；pattern 的 8 = 一位數、: = 冒號；小數點附在前一位。值改變時變動的位數會「跳動」再定格。
 *   App.gauge(host, {min, max, value, labels[], target, caption, range, unit}) → {set(v), setRange({min,max,labels,target,range})}
 *       類比指針錶頭；指針以彈簧阻尼擺動（每幀讀最新目標，連續呼叫安全）。
 *   App.knob(host, {values:[{value,label}], value, label, sweep, onChange(value, index)}) → {get(), set(v, {silent})}
 *       旋鈕：拖曳（繞圓心轉）、滑鼠滾輪、方向鍵 / Home / End、點刻度字跳選；每過一個檔位有刻度回饋。
 *   .lever（button[role=switch|radio]）撥桿：自動綁定，點擊切換 aria-checked 並在按鈕上發出冒泡的 'change'。
 *       容器 [role=radiogroup] 內的 role=radio 撥桿互斥（方向鍵可切換）。App.setLever(el, on) 以程式設定（不發事件）。
 *   .lever-card（button[role=radio]，放在 [role=radiogroup] 內）大型選項卡（LED + 標題 + 說明），行為同 radio 撥桿。
 *   .keyrow[data-single] > .key   單選按鍵列：自動綁定 aria-pressed 互斥，在 .keyrow 上發出 'change'（detail.value = data-value）
 *   .key[data-toggle]             單顆切換鍵：自動切換 aria-pressed 並發出 'change'
 *   App.lever({label, on, role:'switch'|'radio', sm, attrs}) → 撥桿 HTML 字串 · App.fillLevers(root) 為動態插入的空 .lever 補零件
 *   App.holdKey(button, {duration, onComplete}) → {reset()} 長按簽核鍵（按住期間 --p 0→1，環形進度）
 *   App.tabs(tablist, {onChange(i, tab)}) → {select(i)}；[data-tabs] 自動初始化
 *   App.dotMap(svg, {interactive, highlight, selected, pins, sweep, labels, onSelect(code|null), onHover(code|null)})
 *       → {select(code, {silent}), refresh()}  區域路燈點陣地圖（喇叭網孔式；亮 / 暗 / 故障閃爍；P1 未結工單紅圈）
 *       interactive 只提供滑鼠 / 觸控點選；頁面需另放一排行政區 .key 給鍵盤使用（見 index.html 的 #district-keys）。
 *       pins 預設為未結 P1 工單；可傳 [{id, point:[x,y], label, tone:'red'|'orange'}] 自訂（例如工單詳情只標一個點）。
 * 浮層與回饋
 *   App.toast(title, {desc, tone:'ok'|'info'|'warn'|'danger', action:{label, onClick}, duration}) → {close()}
 *       toast 容器會自動移進目前開啟的 modal dialog（top layer），關閉時移回 body。
 *   App.modal({eyebrow, title, body(HTML 字串或 Node), actions:[{label, variant, onClick(close) → false 可阻止關閉}], size:'sm'|'md'|'lg', onClose}) → {el, body, close()}
 *   App.confirm({title, message, confirmLabel, cancelLabel, tone:'accent'|'danger'}) → Promise<boolean>
 *   App.openDispatch(ids, {onDone}) 派工對話框（選班別、預計到場、備註；完成後 toast 可復原）
 * 動態
 *   App.reveal(root) 重新掃描動態插入的 [data-reveal] · App.watchAnim(el) 讓動態插入的 [data-anim] 也會離開視窗暫停
 *   App.inView(el) · App.reducedMotion()
 * 自動行為（不需呼叫）
 *   導覽 active 與 aria-current（[data-nav] 內連結比對檔名）、行動版選單（[data-nav-toggle]）、頁首捲動陰影、
 *   [data-clock]（七段時鐘）、[data-date]（OCT 23 · FRI）、[data-count="new|dispatched|onsite|repair|review|closed|open|p1|today|overdue"]、
 *   [data-reveal] 進場（style="--i:n" 錯開）、[data-anim] 離開視窗或分頁隱藏時暫停其中所有 CSS 動畫（含偽元素）、
 *   Escape 關閉最上層 modal。
 *
 * 工單欄位
 *   id 'WO-2610-0089', type, asset（桿號 / 設備編號）, dist, loc, fault, prio 1–4, status, src,
 *   t {reported, dispatched, planned, arrived, finished, closed}（ms 或 null）, crew, desc, fix（處置說明）,
 *   parts [[code, qty]], sessions [[from, to]]（多日施工的每日作業時段，ms）, hold（待料 / 展延說明）, item（PRK / PAV 的設施名）,
 *   affects（影響盞數）, outage（地圖上斷電範圍半徑）, inspector, log [{at, who, text}]
 */
(function () {
  'use strict';

  const App = (window.App = {});
  const doc = document;
  const html = doc.documentElement;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  App.reducedMotion = () => motionQuery.matches;

  const $$ = (sel, root = doc) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  App.esc = esc;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // 字串雜湊 + mulberry32：同一個桿號在每一頁都得到相同的「隨機」屬性與地圖位置
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* =======================================================================
   * 時間（固定 UTC+8，讓不同時區的瀏覽者看到相同的「現在」）
   * ===================================================================== */
  const TZ = 8 * 3600e3;
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const NOW_BASE = Date.parse('2026-10-23T18:40:00+08:00');
  const perfBase = performance.now();
  App.now = () => NOW_BASE + (performance.now() - perfBase);
  App.time = (str) => {
    const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(str);
    if (!m) throw new Error('App.time: invalid time string "' + str + '"');
    return Date.parse(`${m[1] || '2026'}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);
  };
  App.dayStart = (ms) => ms - ((ms + TZ) % DAY);
  const parts = (ms) => {
    const d = new Date(ms + TZ);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  };
  const WEEK = '日一二三四五六';
  const WEEK_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  App.fmt = {
    num: (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
    money: (n) => 'NT$ ' + App.fmt.num(n),
    time: (ms) => { const p = parts(ms); return pad(p.h) + ':' + pad(p.mi); },
    date: (ms) => { const p = parts(ms); return pad(p.mo) + '/' + pad(p.d); },
    dateFull: (ms) => { const p = parts(ms); return `${p.y}/${pad(p.mo)}/${pad(p.d)}（${WEEK[p.wd]}）`; },
    dt: (ms) => App.fmt.date(ms) + ' ' + App.fmt.time(ms),
    weekday: (ms) => WEEK[parts(ms).wd],
    stamp: (ms) => { const p = parts(ms); return `${MONTH_EN[p.mo - 1]} ${pad(p.d)} · ${WEEK_EN[p.wd]}`; },
    rel(ms, base = App.now()) {
      const diff = ms - base;
      const a = Math.abs(diff);
      const tail = diff < 0 ? '前' : '後';
      if (a < 60e3) return '剛剛';
      if (a < HOUR) return Math.round(a / 60e3) + ' 分鐘' + tail;
      if (a < DAY) return Math.round(a / HOUR) + ' 小時' + tail;
      return Math.round(a / DAY) + ' 天' + tail;
    },
    hours: (h, d = 1) => App.fmt.num(h, d) + ' h',
    dur(ms) {
      const m = Math.round(Math.abs(ms) / 60e3);
      if (m < 60) return m + ' 分';
      const h = Math.floor(m / 60);
      if (h < 24) return h + ' 小時' + (m % 60 ? ' ' + (m % 60) + ' 分' : '');
      return Math.floor(h / 24) + ' 天' + (h % 24 ? ' ' + (h % 24) + ' 小時' : '');
    },
  };

  /* =======================================================================
   * 資料
   * ===================================================================== */
  // 點陣地圖幾何（viewBox 760×440）：各區多邊形共用頂點，確保邊界無縫
  const V = {
    TL: [48, 34], T1: [252, 34], T2: [468, 34], TR: [736, 34],
    L1: [38, 110], L2: [54, 196], L3: [42, 262], L4: [64, 336],
    B1: [120, 378], B2: [206, 398], B3: [292, 384], B4: [336, 350], B5: [372, 328], B6: [424, 322],
    B7: [468, 338], B8: [508, 376], B9: [600, 398], B10: [690, 392], BR: [736, 380],
    I1: [256, 112], I2: [250, 188], I3: [150, 196], I4: [380, 204], I5: [498, 200], I6: [480, 120],
    I7: [620, 226], I8: [736, 236], I9: [150, 282], I10: [252, 292], I11: [336, 300], I12: [430, 292], I13: [520, 300],
  };
  const poly = (...keys) => keys.map((k) => V[k]);

  const districts = [
    { code: 'GC', name: '港埕區', en: 'GANGCHENG', lamps: 1962, dark: 38, crew: 'L1', density: 1, label: [150, 324], poly: poly('L3', 'I9', 'I10', 'B3', 'B2', 'B1', 'L4') },
    { code: 'BA', name: '北岸區', en: 'BEI-AN', lamps: 1548, dark: 31, crew: 'L2', density: 0.86, label: [146, 112], poly: poly('TL', 'T1', 'I1', 'I2', 'I3', 'L2', 'L1') },
    { code: 'JC', name: '舊城區', en: 'JIUCHENG', lamps: 2236, dark: 72, crew: 'L1', density: 1, label: [150, 240], poly: poly('L2', 'I3', 'I2', 'I10', 'I9', 'L3') },
    { code: 'SJ', name: '山腳區', en: 'SHANJIAO', lamps: 1104, dark: 29, crew: 'L4', density: 0.62, label: [346, 104], poly: poly('T1', 'T2', 'I6', 'I5', 'I4', 'I2', 'I1') },
    { code: 'XW', name: '新灣區', en: 'XINWAN', lamps: 2410, dark: 41, crew: 'L3', density: 0.95, label: [318, 330], poly: poly('I10', 'I11', 'I12', 'I13', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3') },
    { code: 'YT', name: '鹽田區', en: 'YANTIAN', lamps: 1286, dark: 52, crew: 'L3', density: 0.7, label: [630, 312], poly: poly('I5', 'I7', 'I8', 'BR', 'B10', 'B9', 'B8', 'I13') },
    { code: 'XZ', name: '溪洲區', en: 'XIZHOU', lamps: 1412, dark: 47, crew: 'L2', density: 0.82, label: [330, 246], poly: poly('I2', 'I4', 'I5', 'I13', 'I12', 'I11', 'I10') },
    { code: 'YL', name: '雲嶺區', en: 'YUNLING', lamps: 876, dark: 36, crew: 'L4', density: 0.3, label: [612, 118], poly: poly('T2', 'TR', 'I8', 'I7', 'I5', 'I6') },
  ];
  // 溪流（由雲嶺山區流經山腳、溪洲，注入新灣）
  const RIVER = [[420, 34], [432, 90], [410, 150], [424, 210], [400, 262], [396, 300], [398, 326]];
  const CITY = poly('TL', 'T1', 'T2', 'TR', 'I8', 'BR', 'B10', 'B9', 'B8', 'B7', 'B6', 'B5', 'B4', 'B3', 'B2', 'B1', 'L4', 'L3', 'L2', 'L1');

  const types = {
    STL: { code: 'STL', name: '路燈', en: 'STREETLIGHT', unit: '盞', icon: 'lamp' },
    SIG: { code: 'SIG', name: '號誌', en: 'SIGNAL', unit: '處', icon: 'signal' },
    PAV: { code: 'PAV', name: '人行地磚', en: 'PAVING', unit: '段', icon: 'paving' },
    PRK: { code: 'PRK', name: '公園設施', en: 'PARK', unit: '件', icon: 'park' },
  };

  const prio = {
    1: { p: 1, code: 'P1', name: '緊急', en: 'URGENT', sla: 4, arrive: 1, desc: '危及人車安全：號誌全滅、電桿傾倒、漏電、整段回路不亮' },
    2: { p: 2, code: 'P2', name: '高', en: 'HIGH', sla: 24, arrive: 8, desc: '幹道單燈不亮、號誌部分故障、遊具安全疑慮' },
    3: { p: 3, code: 'P3', name: '一般', en: 'NORMAL', sla: 72, arrive: 48, desc: '巷弄單燈不亮、地磚鬆動、設施損壞但不影響安全' },
    4: { p: 4, code: 'P4', name: '排程', en: 'SCHEDULED', sla: 168, arrive: 120, desc: '外觀破損、污損，可併入定期巡檢處理' },
  };

  const status = {
    new: { key: 'new', name: '待派工', en: 'NEW', tone: 'red', pulse: 'blink' },
    dispatched: { key: 'dispatched', name: '已派工', en: 'DISPATCHED', tone: 'orange', pulse: null },
    onsite: { key: 'onsite', name: '已到場', en: 'ON SITE', tone: 'orange', pulse: 'breathe' },
    repair: { key: 'repair', name: '維修中', en: 'REPAIR', tone: 'green', pulse: 'breathe' },
    review: { key: 'review', name: '待驗收', en: 'REVIEW', tone: 'green', pulse: null },
    closed: { key: 'closed', name: '已結案', en: 'CLOSED', tone: 'off', pulse: null },
  };
  App.STATUS_ORDER = ['new', 'dispatched', 'onsite', 'repair', 'review', 'closed'];
  App.FLOW = [
    { key: 'reported', label: '報修', en: 'REPORT', tkey: 'reported' },
    { key: 'dispatched', label: '派工', en: 'DISPATCH', tkey: 'dispatched' },
    { key: 'arrived', label: '到場', en: 'ON SITE', tkey: 'arrived' },
    { key: 'finished', label: '維修', en: 'REPAIR', tkey: 'finished' },
    { key: 'closed', label: '驗收', en: 'ACCEPT', tkey: 'closed' },
  ];

  const sources = {
    1999: { key: '1999', name: '1999 專線', short: '1999' },
    app: { key: 'app', name: '市民 APP', short: 'APP' },
    patrol: { key: 'patrol', name: '巡檢發現', short: '巡檢' },
    auto: { key: 'auto', name: '智慧路燈回報', short: '自動' },
    police: { key: 'police', name: '警消通報', short: '警消' },
  };

  // shift：day 08–17、night 17–翌日 01、swing 07–23（小時，night 以 25 表示翌日 01:00）
  const SHIFTS = { day: [8, 17, '日班 08:00–17:00'], night: [17, 25, '夜班 17:00–01:00'], swing: [7, 23, '輪值 07:00–23:00'] };
  const crews = [
    { id: 'L1', name: '路燈一班', short: '一班', shift: 'night', areas: ['GC', 'JC'], leader: '陳建宏', members: ['林志偉', '吳俊賢'], vehicle: 'ML-301 高空作業車' },
    { id: 'L2', name: '路燈二班', short: '二班', shift: 'night', areas: ['BA', 'XZ'], leader: '黃國峰', members: ['張家豪', '蔡明哲'], vehicle: 'ML-302 高空作業車' },
    { id: 'L3', name: '路燈三班', short: '三班', shift: 'day', areas: ['XW', 'YT'], leader: '李文雄', members: ['王柏翰', '許志明'], vehicle: 'ML-303 高空作業車' },
    { id: 'L4', name: '路燈四班', short: '四班', shift: 'day', areas: ['SJ', 'YL'], leader: '劉振宇', members: ['鄭凱文'], vehicle: 'ML-304 高空作業車' },
    { id: 'SG', name: '號誌班', short: '號誌', shift: 'swing', areas: ['ALL'], leader: '周世傑', members: ['謝承恩', '楊子賢'], vehicle: 'SG-11 號誌工程車' },
    { id: 'RD', name: '道路設施班', short: '設施', shift: 'day', areas: ['ALL'], leader: '郭淑芬', members: ['洪偉倫', '曾雅婷'], vehicle: 'RD-07 工具車' },
    { id: 'CT', name: '恆明電業（承攬）', short: '承攬', shift: 'day', areas: ['ALL'], leader: '羅志成', members: ['承攬廠商作業人員 4 名'], vehicle: '包商吊卡車 KX-2271', contractor: true },
  ];

  const people = {
    dispatcher: { name: '張書瑋', title: '派工員', unit: '公共設施維護科' },
    inspector: { name: '蘇怡君', title: '驗收工程司', unit: '公共設施維護科' },
    chief: { name: '何韋廷', title: '科長', unit: '公共設施維護科' },
  };

  const partsList = {
    'LD-90': { name: 'LED 路燈燈具 90W', unit: '組', price: 7800, type: 'STL' },
    'LD-120': { name: 'LED 路燈燈具 120W', unit: '組', price: 9600, type: 'STL' },
    'DR-150': { name: 'LED 驅動電源 150W', unit: '只', price: 2350, type: 'STL' },
    'PC-01': { name: '光控器（光敏開關）', unit: '只', price: 680, type: 'STL' },
    'FU-10': { name: '回路保險絲 10A', unit: '只', price: 45, type: 'STL' },
    'CB-14': { name: '地下電纜 14mm²', unit: '公尺', price: 128, type: 'STL' },
    'JB-01': { name: '防水接線盒', unit: '只', price: 420, type: 'STL' },
    'BR-60': { name: '鍍鋅燈臂 60mm', unit: '支', price: 1900, type: 'STL' },
    'LC-01': { name: 'PC 透光燈罩', unit: '只', price: 1150, type: 'STL' },
    'BS-01': { name: '燈桿基座螺栓組', unit: '組', price: 2600, type: 'STL' },
    'PL-8': { name: '鍍鋅燈桿 8m', unit: '支', price: 18500, type: 'STL' },
    'SG-LR': { name: 'LED 號誌燈頭（紅）300mm', unit: '只', price: 4200, type: 'SIG' },
    'SG-CD': { name: '行人倒數顯示器', unit: '台', price: 12800, type: 'SIG' },
    'TC-RL': { name: '控制箱繼電器', unit: '只', price: 860, type: 'SIG' },
    'TC-CPU': { name: '號誌控制板', unit: '片', price: 23500, type: 'SIG' },
    'TC-PSU': { name: '控制器電源供應器', unit: '只', price: 6400, type: 'SIG' },
    'PV-30': { name: '透水磚 30×30 cm', unit: '片', price: 85, type: 'PAV' },
    'PV-TG': { name: '導盲磚 30×30 cm', unit: '片', price: 160, type: 'PAV' },
    'MR-25': { name: '水泥砂漿 25kg', unit: '包', price: 210, type: 'PAV' },
    'PK-SEAT': { name: '鞦韆座椅（EPDM）', unit: '只', price: 1850, type: 'PRK' },
    'PK-CH': { name: '不鏽鋼鞦韆鏈條', unit: '條', price: 1300, type: 'PRK' },
    'PK-WD': { name: '塑木座椅條', unit: '支', price: 640, type: 'PRK' },
    'PK-BT': { name: '健身器材固定螺栓組', unit: '組', price: 520, type: 'PRK' },
  };

  const models = {
    'CL-L90': { type: 'STL', name: '澄光 CL-L90 LED 路燈 90W', warranty: 5, life: 15 },
    'CL-L120': { type: 'STL', name: '澄光 CL-L120 LED 路燈 120W', warranty: 5, life: 15 },
    'HS-150': { type: 'STL', name: 'HS-150 高壓鈉燈 150W（汰換中）', warranty: 2, life: 10 },
    'TS-300': { type: 'SIG', name: 'TS-300 LED 號誌燈頭 ／ TC-8 控制器', warranty: 3, life: 12 },
    'PV-STD': { type: 'PAV', name: '透水磚鋪面 30×30（含導盲磚）', warranty: 2, life: 10 },
    'PK-GEN': { type: 'PRK', name: '公園設施（遊具 ／ 健身 ／ 休憩）', warranty: 3, life: 12 },
  };

  const assetTypes = {
    STL: { total: 12834, unit: '盞', warranty: 7420, aging: 1186, inspected: 0.82, note: 'LED 化 86%，鈉燈 1,796 盞預計 2027 年底前汰換' },
    SIG: { total: 486, unit: '處路口', warranty: 212, aging: 58, inspected: 0.91, note: '控制器 TC-8 共 486 台，含 64 處行人倒數' },
    PAV: { total: 1920, unit: '段', warranty: 640, aging: 236, inspected: 0.64, note: '人行道鋪面以 100 m 為一段，總長 192 公里' },
    PRK: { total: 1264, unit: '件', warranty: 498, aging: 141, inspected: 0.77, note: '分布於 42 座公園，遊具每月安全檢查' },
  };

  // 工單：時間以 'MM-DD HH:mm'（2026 年）撰寫，初始化時轉為 ms
  const RAW_ORDERS = [
    // ── 待派工 new ──
    { id: 'WO-2610-0089', type: 'STL', asset: 'XZ-1133', dist: 'XZ', loc: '溪濱路三段 堤防側自行車道', fault: '整段回路不亮', prio: 1, status: 'new', src: 'auto', affects: 12, outage: 24,
      t: { reported: '10-23 18:31' },
      desc: '智慧路燈平台 18:31 回報回路 XZ-C14 通訊中斷，堤防側自行車道 12 盞同時熄滅；同時段 1999 另有 2 通民眾來電反映堤防很暗。研判回路總開關跳脫或地下電纜故障。' },
    { id: 'WO-2610-0088', type: 'STL', asset: 'GC-0412', dist: 'GC', loc: '海港路 118 號前', fault: '燈具不亮', prio: 3, status: 'new', src: 'app',
      t: { reported: '10-23 18:22' },
      desc: '市民 APP 附照片報修：單盞路燈不亮，相鄰兩盞正常。智慧節點仍在線，疑為燈具或驅動電源故障。' },
    { id: 'WO-2610-0086', type: 'SIG', asset: 'SG-XW-014', dist: 'XW', loc: '新灣大道與灣景一街口', fault: '行人倒數器故障', prio: 2, status: 'new', src: '1999',
      t: { reported: '10-23 18:05' },
      desc: '北側行人倒數顯示器停在「88」不再變動，行人燈號本身正常。路口緊鄰轉運站出口，晚間人潮多。' },
    { id: 'WO-2610-0084', type: 'STL', asset: 'YT-0907', dist: 'YT', loc: '鹽埕三路 77 巷口', fault: '燈具閃爍', prio: 3, status: 'new', src: 'auto',
      t: { reported: '10-23 17:48' },
      desc: '智慧節點回報電流異常波動，點燈後每數秒閃爍一次。鹽田區沿海鹽害嚴重，同批燈具今年已更換 6 組驅動電源。' },
    { id: 'WO-2610-0083', type: 'PAV', asset: 'PV-JC-0108', dist: 'JC', loc: '大井頭街 32 號騎樓前', fault: '地磚鬆動翹起', prio: 3, status: 'new', src: '1999', item: '人行道透水磚鋪面',
      t: { reported: '10-23 16:30' },
      desc: '民眾反映騎樓前人行道約 4 塊地磚鬆動翹起，長者行走易絆倒。位於老街觀光動線，週末人潮多。' },
    { id: 'WO-2610-0079', type: 'PRK', asset: 'PK-BA-04-02', dist: 'BA', loc: '北岸親水公園 西側入口', fault: '飲水機漏水', prio: 4, status: 'new', src: 'app', item: '飲水機',
      t: { reported: '10-23 11:15' },
      desc: '飲水機底座持續滲水，地面濕滑並開始長青苔。公園管理員已張貼暫停使用告示。' },
    { id: 'WO-2610-0077', type: 'STL', asset: 'YL-0233', dist: 'YL', loc: '茶園道 4.5K', fault: '燈罩破損', prio: 4, status: 'new', src: 'patrol',
      t: { reported: '10-23 09:40' },
      desc: '巡檢發現燈罩裂開約 10 公分，燈具運作正常。山區濕氣重，需於雨季前更換以免進水。' },

    // ── 已派工 dispatched ──
    { id: 'WO-2610-0081', type: 'STL', asset: 'BA-0521', dist: 'BA', loc: '北岸一路 260 號', fault: '燈具不亮', prio: 2, status: 'dispatched', src: '1999', crew: 'L2',
      t: { reported: '10-23 15:02', dispatched: '10-23 15:40', planned: '10-23 19:00' },
      desc: '幹道單盞路燈不亮，位於公車站牌旁，夜間候車民眾反映照度不足。' },
    { id: 'WO-2610-0080', type: 'STL', asset: 'XZ-0876', dist: 'XZ', loc: '溪洲國小側門', fault: '晝夜常亮', prio: 3, status: 'dispatched', src: 'app', crew: 'L2',
      t: { reported: '10-23 13:20', dispatched: '10-23 14:05', planned: '10-23 20:30' },
      desc: '白天仍持續點亮，研判光控器故障。屬上學路段，順道檢查周邊 3 盞照度。' },
    { id: 'WO-2610-0078', type: 'STL', asset: 'GC-0198', dist: 'GC', loc: '漁人碼頭街 15 號', fault: '燈具鬆脫下垂', prio: 2, status: 'dispatched', src: 'patrol', crew: 'L1',
      t: { reported: '10-23 10:22', dispatched: '10-23 11:00', planned: '10-23 21:00' },
      desc: '巡檢發現燈具固定螺栓鏽蝕斷裂，燈具以電線懸吊下垂約 20 公分，有掉落風險，已先以束帶臨時固定。' },
    { id: 'WO-2610-0073', type: 'STL', asset: 'JC-1290', dist: 'JC', loc: '城隍廟口 廟埕廣場', fault: '燈具不亮', prio: 3, status: 'dispatched', src: '1999', crew: 'L1',
      t: { reported: '10-22 21:10', dispatched: '10-23 08:50', planned: '10-23 22:00' },
      desc: '廟埕廣場邊單盞不亮，週末夜市擺攤時段照明需求高。' },
    { id: 'WO-2610-0069', type: 'SIG', asset: 'SG-YT-006', dist: 'YT', loc: '鹽田路與港濱路口', fault: '號誌燈頭偏移', prio: 3, status: 'dispatched', src: 'patrol', crew: 'SG',
      t: { reported: '10-22 15:40', dispatched: '10-23 09:30', planned: '10-24 09:00' },
      desc: '西向燈頭受東北季風吹襲偏移約 20 度，駕駛視認角度不佳，需高空作業車調整並加固支架。' },
    { id: 'WO-2610-0065', type: 'PRK', asset: 'PK-SJ-12-03', dist: 'SJ', loc: '山腳運動公園 體健區', fault: '健身器材鬆脫', prio: 3, status: 'dispatched', src: 'app', crew: 'RD', item: '健身器材・腰背伸展器',
      t: { reported: '10-22 08:40', dispatched: '10-22 13:00', planned: '10-24 13:30' },
      desc: '腰背伸展器底座螺栓鬆脫，使用時明顯晃動，已以警示帶圍起暫停使用。' },
    { id: 'WO-2610-0062', type: 'PAV', asset: 'PV-XW-0233', dist: 'XW', loc: '灣景一街 48 號前', fault: '樹根隆起', prio: 3, status: 'dispatched', src: '1999', crew: 'RD', item: '人行道透水磚鋪面',
      t: { reported: '10-21 10:05', dispatched: '10-21 14:20', planned: '10-24 09:30' },
      desc: '行道樹根系隆起造成地磚高低差約 5 公分，需會同公園處修根後重鋪。' },
    { id: 'WO-2610-0059', type: 'STL', asset: 'XW-1642', dist: 'XW', loc: '港灣大橋引道 北側', fault: '燈具閃爍', prio: 4, status: 'dispatched', src: 'auto', crew: 'L3',
      t: { reported: '10-20 22:15', dispatched: '10-21 09:10', planned: '10-26 10:00' },
      desc: '偶發性閃爍，不影響通行安全，併入 10/26 大橋引道定期巡檢一併處理。' },

    // ── 已到場 onsite ──
    { id: 'WO-2610-0087', type: 'SIG', asset: 'SG-JC-021', dist: 'JC', loc: '中山路與民權路口', fault: '東向紅燈不亮', prio: 1, status: 'onsite', src: '1999', crew: 'SG',
      t: { reported: '10-23 18:10', dispatched: '10-23 18:13', arrived: '10-23 18:34' },
      desc: '民眾來電：東向車道紅燈燈頭全暗，僅黃燈與綠燈正常，下班尖峰有闖越風險。已通報交通隊派員現場指揮。' },
    { id: 'WO-2610-0085', type: 'STL', asset: 'GC-0730', dist: 'GC', loc: '燈塔路 2 號（渡輪站前）', fault: '漏電疑慮（桿身帶電）', prio: 1, status: 'onsite', src: 'police', crew: 'L1', outage: 9,
      t: { reported: '10-23 17:56', dispatched: '10-23 18:00', arrived: '10-23 18:21' },
      desc: '消防局轉報：候船民眾觸碰燈桿有明顯麻電感。到場以驗電筆確認桿身帶電，已拉封鎖線並斷開回路 GC-C07，周邊 4 盞暫時熄燈。疑為桿內接線盒進水、絕緣劣化。' },

    // ── 維修中 repair ──
    { id: 'WO-2610-0082', type: 'STL', asset: 'YL-0451', dist: 'YL', loc: '雲嶺路 12K 彎道', fault: '電桿遭撞擊傾斜', prio: 1, status: 'repair', src: 'police', crew: 'L4',
      t: { reported: '10-23 16:12', dispatched: '10-23 16:15', arrived: '10-23 16:58' }, parts: [['PL-8', 1], ['BS-01', 1]],
      desc: '小貨車失控撞擊燈桿，桿身傾斜約 15 度、燈具懸垂於車道上方，警方已管制單線通行。現場評估需拆除舊桿，更換 8 米燈桿與基座螺栓組。' },
    { id: 'WO-2610-0057', type: 'PAV', asset: 'PV-JC-0102', dist: 'JC', loc: '大井頭街（城隍廟段）人行道', fault: '樹根隆起、大面積翹起', prio: 3, status: 'repair', src: 'patrol', crew: 'RD', item: '人行道透水磚鋪面（約 18 m²）',
      t: { reported: '10-20 10:00', dispatched: '10-20 14:00', arrived: '10-22 08:30' }, parts: [['PV-30', 48], ['MR-25', 6]],
      sessions: [['10-22 08:30', '10-22 16:00'], ['10-23 08:30', '10-23 12:00']],
      desc: '巡檢發現約 18 平方公尺鋪面因樹根隆起翹曲。已設置圍籬分段施工，預計 10/24 完成重鋪與養護。' },
    { id: 'WO-2610-0053', type: 'SIG', asset: 'SG-SJ-002', dist: 'SJ', loc: '山腳路與林場路口', fault: '控制器間歇重開機', prio: 2, status: 'repair', src: 'auto', crew: 'SG',
      t: { reported: '10-18 06:40', dispatched: '10-18 07:30', arrived: '10-18 09:00' }, parts: [['TC-PSU', 1]],
      hold: '待料：號誌控制板 TC-CPU 已叫貨，預計 10/26 到貨；目前以閃黃運轉，尖峰加派義交指揮。',
      desc: '號誌控制器每日不定時重開機 3–5 次，重開期間全路口閃黃。已先更換電源供應器但未改善，判定為控制板故障。' },
    { id: 'WO-2610-0051', type: 'STL', asset: 'XZ-1020', dist: 'XZ', loc: '溪濱路二段', fault: '電纜遭竊', prio: 2, status: 'repair', src: 'patrol', crew: 'CT', affects: 14,
      t: { reported: '10-17 09:30', dispatched: '10-17 10:00', arrived: '10-17 14:00' }, parts: [['CB-14', 180]],
      sessions: [['10-22 08:30', '10-22 16:30'], ['10-23 08:30', '10-23 16:30']],
      hold: '已核准展延至 10/25：需重新佈設地下管路電纜，期間以臨時架空線供電。',
      desc: '地下管路電纜遭竊約 180 公尺，14 盞路燈無法點亮。10/17 先以臨時架空線恢復供電，委外廠商重新佈設電纜並加裝防竊鎖，已報警處理。' },

    // ── 待驗收 review ──
    { id: 'WO-2610-0076', type: 'STL', asset: 'GC-0233', dist: 'GC', loc: '漁市街 6 號', fault: '燈具不亮', prio: 2, status: 'review', src: '1999', crew: 'L1',
      t: { reported: '10-23 07:30', dispatched: '10-23 08:10', arrived: '10-23 17:25', finished: '10-23 17:55' }, parts: [['LD-120', 1]],
      desc: '漁市街出入口單盞不亮，清晨卸貨作業照明不足。', fix: '燈具 LED 模組燒毀，更換 120W 燈具一組，點燈測試正常。' },
    { id: 'WO-2610-0075', type: 'STL', asset: 'BA-0388', dist: 'BA', loc: '北岸一路 102 巷', fault: '燈具閃爍', prio: 3, status: 'review', src: 'auto', crew: 'L2',
      t: { reported: '10-23 06:50', dispatched: '10-23 09:00', arrived: '10-23 17:30', finished: '10-23 18:10' }, parts: [['DR-150', 1], ['JB-01', 1]],
      desc: '智慧節點回報電流異常，巷內住戶反映整夜閃爍。', fix: '驅動電源老化，更換驅動電源與防水接線盒，觀察 20 分鐘無閃爍。' },
    { id: 'WO-2610-0074', type: 'STL', asset: 'XW-0977', dist: 'XW', loc: '港灣大橋引道 南側', fault: '燈具不亮', prio: 3, status: 'review', src: '1999', crew: 'L3',
      t: { reported: '10-22 22:40', dispatched: '10-23 08:20', arrived: '10-23 15:00', finished: '10-23 16:15' }, parts: [['LD-90', 1]],
      desc: '引道南側人行道單盞不亮。', fix: '燈具進水短路，更換 90W 燈具並重新施作止水。' },
    { id: 'WO-2610-0072', type: 'STL', asset: 'YT-0318', dist: 'YT', loc: '鹽埕一路 33 號', fault: '晝夜常亮', prio: 3, status: 'review', src: 'app', crew: 'L3',
      t: { reported: '10-22 20:05', dispatched: '10-23 08:20', arrived: '10-23 10:20', finished: '10-23 10:55' }, parts: [['PC-01', 1]],
      desc: '民眾反映白天路燈仍亮著。', fix: '光控器受潮失效，更換後以遮光測試動作正常。' },
    { id: 'WO-2610-0071', type: 'STL', asset: 'XW-1490', dist: 'XW', loc: '新灣大道一段 210 號', fault: '燈具不亮', prio: 3, status: 'review', src: 'auto', crew: 'L3',
      t: { reported: '10-22 19:20', dispatched: '10-23 08:20', arrived: '10-23 08:50', finished: '10-23 09:35' }, parts: [['FU-10', 1]],
      desc: '智慧節點回報單燈離線。', fix: '燈桿內保險絲熔斷，更換後量測絕緣正常。' },
    { id: 'WO-2610-0070', type: 'PRK', asset: 'PK-BA-04-06', dist: 'BA', loc: '北岸親水公園 兒童遊戲場', fault: '鞦韆鏈條斷裂', prio: 2, status: 'review', src: 'app', crew: 'RD', item: '組合遊具・鞦韆',
      t: { reported: '10-22 16:45', dispatched: '10-22 17:10', arrived: '10-23 13:05', finished: '10-23 14:10' }, parts: [['PK-CH', 2]],
      desc: '鞦韆單側鏈條斷裂，座椅垂落，已以警示帶封閉。', fix: '更換兩側不鏽鋼鏈條並檢查吊環磨耗，荷重測試通過。' },
    { id: 'WO-2610-0068', type: 'STL', asset: 'YT-0590', dist: 'YT', loc: '港濱路 140 號', fault: '燈臂斷裂', prio: 2, status: 'review', src: 'patrol', crew: 'L3',
      t: { reported: '10-22 15:30', dispatched: '10-22 16:00', arrived: '10-23 13:00', finished: '10-23 14:30' }, parts: [['BR-60', 1], ['LD-120', 1]],
      desc: '巡檢發現燈臂根部鏽蝕龜裂，燈具下垂。', fix: '燈臂根部鏽蝕斷裂，更換鍍鋅燈臂與燈具，加做防鏽處理。' },
    { id: 'WO-2610-0066', type: 'STL', asset: 'SJ-0712', dist: 'SJ', loc: '山腳路 88 號（社區活動中心）', fault: '燈具不亮', prio: 3, status: 'review', src: '1999', crew: 'L4',
      t: { reported: '10-22 11:10', dispatched: '10-22 14:00', arrived: '10-23 08:45', finished: '10-23 09:50' }, parts: [['LD-90', 1]],
      desc: '活動中心前廣場單盞不亮，晚間長者共餐散場照明不足。', fix: '燈具光衰嚴重，更換 90W LED 燈具。' },
    { id: 'WO-2610-0064', type: 'SIG', asset: 'SG-JC-011', dist: 'JC', loc: '城隍廟前 行人穿越道', fault: '行人按鈕失效', prio: 2, status: 'review', src: '1999', crew: 'SG',
      t: { reported: '10-22 08:10', dispatched: '10-22 09:00', arrived: '10-23 13:40', finished: '10-23 14:50' }, parts: [['TC-RL', 1]],
      desc: '按鈕式行人號誌按下後無反應，行人需等待完整週期。', fix: '按鈕盒內繼電器接點氧化，更換後行人時相觸發正常。' },

    // ── 已結案 closed ──
    { id: 'WO-2610-0067', type: 'STL', asset: 'YL-0602', dist: 'YL', loc: '茶園道 2K', fault: '燈具不亮', prio: 3, status: 'closed', src: 'patrol', crew: 'L4', inspector: '蘇怡君',
      t: { reported: '10-22 13:20', dispatched: '10-22 14:00', arrived: '10-23 10:40', finished: '10-23 11:50', closed: '10-23 16:00' }, parts: [['DR-150', 1]],
      desc: '巡檢夜測發現單盞不亮。', fix: '驅動電源故障，更換後點燈正常。' },
    { id: 'WO-2610-0063', type: 'STL', asset: 'XW-0855', dist: 'XW', loc: '灣景一街 120 號', fault: '燈具不亮', prio: 3, status: 'closed', src: '1999', crew: 'L3', inspector: '蘇怡君',
      t: { reported: '10-21 20:10', dispatched: '10-22 08:30', arrived: '10-22 09:40', finished: '10-22 10:30', closed: '10-23 10:20' }, parts: [['LD-90', 1]],
      desc: '住宅區巷口單盞不亮。', fix: '更換 90W LED 燈具。' },
    { id: 'WO-2610-0061', type: 'STL', asset: 'XZ-0920', dist: 'XZ', loc: '溪濱路一段', fault: '晝夜常亮', prio: 4, status: 'closed', src: 'patrol', crew: 'L2', inspector: '蘇怡君',
      t: { reported: '10-21 10:00', dispatched: '10-21 13:30', arrived: '10-22 18:10', finished: '10-22 18:30', closed: '10-23 09:40' }, parts: [['PC-01', 1]],
      desc: '日間巡檢發現常亮。', fix: '更換光控器。' },
    { id: 'WO-2610-0060', type: 'SIG', asset: 'SG-YT-002', dist: 'YT', loc: '鹽田路與堤防路口', fault: '號誌全滅', prio: 1, status: 'closed', src: 'police', crew: 'SG', inspector: '蘇怡君',
      t: { reported: '10-21 05:40', dispatched: '10-21 05:45', arrived: '10-21 06:30', finished: '10-21 09:40', closed: '10-21 14:20' }, parts: [['TC-PSU', 1]],
      desc: '清晨警方通報路口號誌全滅。', fix: '控制器電源供應器故障，更換後恢復正常時相。' },
    { id: 'WO-2610-0058', type: 'STL', asset: 'BA-0459', dist: 'BA', loc: '港北路 210 號', fault: '燈具不亮', prio: 2, status: 'closed', src: 'auto', crew: 'L2', inspector: '蘇怡君',
      t: { reported: '10-20 18:50', dispatched: '10-21 08:30', arrived: '10-21 17:40', finished: '10-21 18:05', closed: '10-22 10:10' }, parts: [['LD-120', 1]],
      desc: '智慧節點回報單燈離線。', fix: '更換 120W LED 燈具。' },
    { id: 'WO-2610-0056', type: 'STL', asset: 'GC-0301', dist: 'GC', loc: '渡船頭街 12 號', fault: '漏電疑慮', prio: 1, status: 'closed', src: '1999', crew: 'L1', inspector: '蘇怡君',
      t: { reported: '10-19 19:50', dispatched: '10-19 19:52', arrived: '10-19 20:15', finished: '10-19 22:56', closed: '10-20 09:30' }, parts: [['CB-14', 12], ['JB-01', 1]],
      desc: '民眾反映燈桿有麻電感。', fix: '桿內電纜絕緣破損，更換 12 公尺電纜與接線盒，接地電阻量測合格。' },
    { id: 'WO-2610-0055', type: 'PAV', asset: 'PV-JC-0081', dist: 'JC', loc: '中山路 騎樓段', fault: '導盲磚缺損', prio: 3, status: 'closed', src: '1999', crew: 'RD', inspector: '蘇怡君', item: '導盲磚',
      t: { reported: '10-19 09:30', dispatched: '10-19 13:00', arrived: '10-21 09:00', finished: '10-21 11:40', closed: '10-21 16:30' }, parts: [['PV-TG', 6], ['MR-25', 1]],
      desc: '視障團體反映導盲磚缺損中斷。', fix: '補鋪導盲磚 6 片。' },
    { id: 'WO-2610-0054', type: 'STL', asset: 'YT-0712', dist: 'YT', loc: '港濱路 66 號', fault: '燈具鏽蝕鬆脫', prio: 2, status: 'closed', src: 'patrol', crew: 'L3', inspector: '蘇怡君',
      t: { reported: '10-18 10:15', dispatched: '10-18 10:40', arrived: '10-18 14:00', finished: '10-18 15:20', closed: '10-19 09:40' }, parts: [['BR-60', 1], ['LD-120', 1]],
      desc: '巡檢發現燈具鏽蝕鬆脫。', fix: '更換燈臂與燈具。' },
    { id: 'WO-2610-0052', type: 'STL', asset: 'JC-1104', dist: 'JC', loc: '大井頭街 9 號', fault: '燈具閃爍', prio: 3, status: 'closed', src: 'app', crew: 'L1', inspector: '蘇怡君',
      t: { reported: '10-17 20:30', dispatched: '10-18 09:00', arrived: '10-19 19:40', finished: '10-19 20:10', closed: '10-20 10:00' }, parts: [['DR-150', 1]],
      desc: '老街巷內燈具閃爍。', fix: '更換驅動電源。' },
    { id: 'WO-2610-0050', type: 'SIG', asset: 'SG-BA-003', dist: 'BA', loc: '北岸一路與港北路口', fault: '時相異常（長紅）', prio: 2, status: 'closed', src: 'police', crew: 'SG', inspector: '蘇怡君',
      t: { reported: '10-17 07:10', dispatched: '10-17 07:20', arrived: '10-17 08:05', finished: '10-17 09:50', closed: '10-17 14:00' }, parts: [['TC-CPU', 1]],
      desc: '上班尖峰北向長紅不轉綠。', fix: '控制板韌體異常，更換號誌控制板（庫存最後一片）。' },
    { id: 'WO-2610-0048', type: 'STL', asset: 'SJ-0340', dist: 'SJ', loc: '林場路一段', fault: '整段回路不亮', prio: 1, status: 'closed', src: 'auto', crew: 'L4', inspector: '蘇怡君',
      t: { reported: '10-16 18:22', dispatched: '10-16 18:25', arrived: '10-16 19:15', finished: '10-16 22:46', closed: '10-17 10:30' }, parts: [['FU-10', 3], ['CB-14', 40]],
      desc: '回路 SJ-C03 整段 9 盞熄滅。', fix: '回路保險絲熔斷並查出 40 公尺電纜受潮，更換後恢復送電。' },
    { id: 'WO-2610-0047', type: 'PRK', asset: 'PK-XW-02-11', dist: 'XW', loc: '灣岸公園 觀景平台', fault: '座椅木條破損', prio: 4, status: 'closed', src: 'app', crew: 'RD', inspector: '蘇怡君', item: '休憩座椅',
      t: { reported: '10-15 15:20', dispatched: '10-16 09:00', arrived: '10-17 13:40', finished: '10-17 15:00', closed: '10-18 10:00' }, parts: [['PK-WD', 3]],
      desc: '座椅木條斷裂外露鐵件。', fix: '更換塑木座椅條 3 支。' },
    { id: 'WO-2610-0045', type: 'STL', asset: 'XZ-0611', dist: 'XZ', loc: '溪洲路 102 號', fault: '燈具不亮', prio: 2, status: 'closed', src: '1999', crew: 'L2', inspector: '蘇怡君',
      t: { reported: '10-14 22:05', dispatched: '10-15 08:40', arrived: '10-15 18:10', finished: '10-15 18:45', closed: '10-16 11:20' }, parts: [['LD-120', 1]],
      desc: '主要道路單盞不亮。', fix: '更換 120W LED 燈具。' },
    { id: 'WO-2610-0043', type: 'STL', asset: 'GC-0655', dist: 'GC', loc: '燈塔路 24 號', fault: '晝夜常亮', prio: 3, status: 'closed', src: 'app', crew: 'L1', inspector: '蘇怡君',
      t: { reported: '10-14 11:30', dispatched: '10-14 14:00', arrived: '10-15 18:30', finished: '10-15 18:55', closed: '10-16 10:10' }, parts: [['PC-01', 1]],
      desc: '白天常亮。', fix: '更換光控器。' },
    { id: 'WO-2610-0042', type: 'STL', asset: 'YT-0455', dist: 'YT', loc: '鹽田路五段', fault: '燈罩破損', prio: 4, status: 'closed', src: 'patrol', crew: 'L3', inspector: '蘇怡君',
      t: { reported: '10-13 10:00', dispatched: '10-14 08:30', arrived: '10-16 09:10', finished: '10-16 09:50', closed: '10-16 15:00' }, parts: [['LC-01', 1]],
      desc: '燈罩破損。', fix: '更換 PC 透光燈罩。' },
    { id: 'WO-2610-0040', type: 'SIG', asset: 'SG-XW-009', dist: 'XW', loc: '灣景二街與海濱路口', fault: '行人倒數器故障', prio: 2, status: 'closed', src: '1999', crew: 'SG', inspector: '蘇怡君',
      t: { reported: '10-13 08:20', dispatched: '10-13 08:50', arrived: '10-13 13:30', finished: '10-13 16:40', closed: '10-14 09:30' }, parts: [['SG-CD', 1]],
      desc: '倒數器顯示亂碼。', fix: '更換行人倒數顯示器。' },
    { id: 'WO-2610-0039', type: 'STL', asset: 'BA-0207', dist: 'BA', loc: '北岸二路 17 巷', fault: '燈具不亮', prio: 3, status: 'closed', src: '1999', crew: 'L2', inspector: '蘇怡君',
      t: { reported: '10-12 21:40', dispatched: '10-13 09:00', arrived: '10-14 19:20', finished: '10-14 19:50', closed: '10-15 10:40' }, parts: [['LD-90', 1]],
      desc: '巷內單盞不亮。', fix: '更換 90W LED 燈具。' },
    { id: 'WO-2610-0038', type: 'STL', asset: 'YL-0118', dist: 'YL', loc: '雲嶺路 3K', fault: '電桿傾斜', prio: 1, status: 'closed', src: 'patrol', crew: 'L4', inspector: '蘇怡君',
      t: { reported: '10-12 09:15', dispatched: '10-12 09:20', arrived: '10-12 10:10', finished: '10-12 12:51', closed: '10-12 16:30' }, parts: [['BS-01', 1]],
      desc: '邊坡土石鬆動致燈桿傾斜。', fix: '扶正燈桿並更換基座螺栓組，邊坡另案通報。' },
    { id: 'WO-2610-0036', type: 'PRK', asset: 'PK-JC-03-07', dist: 'JC', loc: '城南公園 遊戲場', fault: '鞦韆座椅破裂', prio: 2, status: 'closed', src: 'app', crew: 'RD', inspector: '蘇怡君', item: '組合遊具・鞦韆',
      t: { reported: '10-11 10:12', dispatched: '10-11 11:00', arrived: '10-11 14:30', finished: '10-11 15:40', closed: '10-12 09:50' }, parts: [['PK-SEAT', 1]],
      desc: '鞦韆座椅破裂有夾手風險。', fix: '更換 EPDM 座椅。' },
    { id: 'WO-2610-0035', type: 'STL', asset: 'XW-1208', dist: 'XW', loc: '新灣大道二段 88 號', fault: '燈具閃爍', prio: 2, status: 'closed', src: 'auto', crew: 'L3', inspector: '蘇怡君',
      t: { reported: '10-10 19:05', dispatched: '10-11 08:30', arrived: '10-11 09:20', finished: '10-11 10:10', closed: '10-12 11:30' }, parts: [['DR-150', 1]],
      desc: '幹道燈具閃爍。', fix: '更換驅動電源。' },
    { id: 'WO-2610-0034', type: 'PAV', asset: 'PV-GC-0045', dist: 'GC', loc: '漁人碼頭街 人行道', fault: '地磚破裂', prio: 3, status: 'closed', src: 'app', crew: 'RD', inspector: '蘇怡君', item: '人行道透水磚鋪面',
      t: { reported: '10-09 14:30', dispatched: '10-10 08:40', arrived: '10-11 09:00', finished: '10-11 16:00', closed: '10-12 10:00' }, parts: [['PV-30', 12], ['MR-25', 2]],
      desc: '貨車輾壓致地磚破裂。', fix: '更換透水磚 12 片並重新整平。' },
    { id: 'WO-2610-0032', type: 'SIG', asset: 'SG-GC-004', dist: 'GC', loc: '海港路與漁市街口', fault: '號誌全滅', prio: 1, status: 'closed', src: 'police', crew: 'SG', inspector: '蘇怡君',
      t: { reported: '10-09 07:42', dispatched: '10-09 07:45', arrived: '10-09 08:20', finished: '10-09 10:35', closed: '10-09 15:10' }, parts: [['FU-10', 2], ['TC-RL', 1]],
      desc: '路口號誌全滅。', fix: '控制箱進水跳脫，更換保險絲與繼電器並加強止水。' },
    { id: 'WO-2610-0031', type: 'STL', asset: 'JC-0877', dist: 'JC', loc: '民權路 45 號前', fault: '燈具不亮', prio: 3, status: 'closed', src: '1999', crew: 'L1', inspector: '蘇怡君',
      t: { reported: '10-08 20:15', dispatched: '10-09 09:10', arrived: '10-09 19:30', finished: '10-09 20:05', closed: '10-10 10:20' }, parts: [['DR-150', 1]],
      desc: '單盞不亮。', fix: '驅動電源燒毀，更換後恢復。' },
  ];

  // 桿號在地圖上的固定位置（重點案件手動指定，其餘依雜湊落在所屬行政區內）
  const ASSET_POINTS = { 'XZ-1133': [446, 238], 'GC-0730': [100, 352], 'SG-JC-021': [176, 226], 'YL-0451': [640, 150] };
  // 個別設備的已知屬性（其餘由雜湊推得）
  const ASSET_OVERRIDES = {
    'GC-0730': { model: 'HS-150', installed: 2011, height: 10, circuit: 'GC-C07' },
    'XZ-1133': { model: 'CL-L120', installed: 2019, height: 10, circuit: 'XZ-C14' },
    'YL-0451': { model: 'CL-L90', installed: 2016, height: 8, circuit: 'YL-C05' },
  };

  const T_KEYS = ['reported', 'dispatched', 'planned', 'arrived', 'finished', 'closed'];
  const ORDERS = RAW_ORDERS.map((r) => {
    const t = {};
    T_KEYS.forEach((k) => { t[k] = r.t[k] ? App.time(r.t[k]) : null; });
    return Object.assign({ crew: null, parts: [], sessions: null, hold: null, item: null, affects: 1, outage: 0, inspector: null, fix: '' }, r, {
      t,
      sessions: r.sessions ? r.sessions.map(([a, b]) => [App.time(a), App.time(b)]) : null,
      parts: (r.parts || []).map((p) => p.slice()),
      log: [],
    });
  });

  App.DATA = {
    districts, types, prio, status, sources, crews, people, models, assetTypes,
    parts: partsList, orders: ORDERS, river: RIVER, city: CITY, shifts: SHIFTS,
  };

  /* =======================================================================
   * 查詢與衍生值
   * ===================================================================== */
  const byId = (list, key = 'id') => Object.fromEntries(list.map((x) => [x[key], x]));
  const districtMap = byId(districts, 'code');
  const crewMap = byId(crews);
  App.getOrder = (id) => ORDERS.find((o) => o.id === id) || null;
  App.district = (code) => districtMap[code];
  App.crew = (id) => crewMap[id];
  App.part = (code) => partsList[code];
  App.typeOf = (code) => types[code];
  App.orderUrl = (id) => 'order.html?id=' + encodeURIComponent(id);
  App.param = (name) => new URLSearchParams(location.search).get(name);
  const isOpen = (o) => o.status !== 'closed';

  App.sla = (o) => {
    const p = prio[o.prio];
    const due = o.t.reported + p.sla * HOUR;
    if (o.t.finished) {
      const met = o.t.finished <= due;
      return { due, remain: due - o.t.finished, state: met ? 'met' : 'missed', label: met ? '時限內完修' : '逾時 ' + App.fmt.dur(o.t.finished - due) };
    }
    const remain = due - App.now();
    if (remain < 0) return { due, remain, state: 'over', label: '逾時 ' + App.fmt.dur(-remain) };
    return { due, remain, state: remain < p.sla * HOUR * 0.25 ? 'soon' : 'ok', label: '剩 ' + App.fmt.dur(remain) };
  };

  App.counts = () => {
    const c = { new: 0, dispatched: 0, onsite: 0, repair: 0, review: 0, closed: 0, open: 0, p1: 0, today: 0, overdue: 0 };
    const today = App.dayStart(App.now());
    ORDERS.forEach((o) => {
      c[o.status]++;
      if (isOpen(o)) {
        c.open++;
        if (o.prio === 1) c.p1++;
        if (App.sla(o).state === 'over') c.overdue++;
      }
      if (o.t.reported >= today) c.today++;
    });
    return c;
  };

  App.network = () => {
    const total = districts.reduce((s, d) => s + d.lamps, 0);
    const dark = districts.reduce((s, d) => s + d.dark, 0);
    return { total, dark, online: total - dark, rate: ((total - dark) / total) * 100 };
  };

  App.mttr = (p = 0) => {
    const done = ORDERS.filter((o) => o.t.finished && (!p || o.prio === p));
    const hours = done.length ? done.reduce((s, o) => s + (o.t.finished - o.t.reported), 0) / done.length / HOUR : 0;
    const hit = done.filter((o) => App.sla(o).state === 'met').length;
    return { hours, n: done.length, target: p ? prio[p].sla : null, hitRate: done.length ? hit / done.length : 0 };
  };

  App.flowIndex = (o) => {
    let i = 0;
    App.FLOW.forEach((f, k) => { if (o.t[f.tkey]) i = k + 1; });
    return i;
  };

  App.suggestCrew = (o) => {
    if (o.type === 'SIG') return 'SG';
    if (o.type === 'PAV' || o.type === 'PRK') return 'RD';
    return districtMap[o.dist].crew;
  };

  function inShift(crew, now) {
    const [a, b] = SHIFTS[crew.shift];
    const h = (now - App.dayStart(now)) / HOUR;
    return (h >= a && h < b) || (b > 24 && h < b - 24);
  }

  App.crewState = (id) => {
    const crew = crewMap[id];
    const now = App.now();
    const today = App.dayStart(now);
    const mine = ORDERS.filter((o) => o.crew === id);
    const live = mine.find((o) => (o.status === 'onsite' || o.status === 'repair') &&
      (o.sessions ? o.sessions.some(([a, b]) => a <= now && now <= b) : o.t.arrived && now - o.t.arrived < 12 * HOUR));
    const next = mine.filter((o) => o.status === 'dispatched' && o.t.planned).sort((a, b) => a.t.planned - b.t.planned)
      .find((o) => o.t.planned >= now - HOUR);
    const shift = inShift(crew, now);
    const done = mine.filter((o) => o.t.finished && o.t.finished >= today).length;
    const planned = mine.filter((o) => o.status === 'dispatched' && o.t.planned < today + DAY + HOUR).length;
    const total = done + planned + (live ? 1 : 0);
    let state = 'off', label = '已收班', tone = 'off';
    if (live) { state = 'work'; label = shift ? '作業中' : '加班作業'; tone = 'green'; }
    else if (next && next.t.planned - now <= 1.5 * HOUR) { state = 'transit'; label = '前往中'; tone = 'orange'; }
    else if (shift) { state = 'standby'; label = '待命'; tone = 'orange'; }
    return { state, label, tone, order: live || null, next: next || null, overtime: !!live && !shift, done, total, shift: SHIFTS[crew.shift][2] };
  };

  App.asset = (code) => {
    const r = rng(code);
    const prefix = code.split('-')[0];
    const type = prefix === 'SG' ? 'SIG' : prefix === 'PV' ? 'PAV' : prefix === 'PK' ? 'PRK' : 'STL';
    const dist = type === 'STL' ? prefix : code.split('-')[1];
    const o = ASSET_OVERRIDES[code] || {};
    let model = o.model;
    if (!model) {
      if (type === 'STL') { const x = r(); model = x < 0.14 ? 'HS-150' : x < 0.55 ? 'CL-L90' : 'CL-L120'; }
      else model = { SIG: 'TS-300', PAV: 'PV-STD', PRK: 'PK-GEN' }[type];
    }
    const m = models[model];
    const installed = o.installed || (model === 'HS-150' ? 2006 + Math.floor(r() * 7) : 2013 + Math.floor(r() * 12));
    const age = 2026 - installed;
    const warrantyUntil = installed + m.warranty;
    const inspectDay = 1 + Math.floor(r() * 22);
    return {
      code, type, dist, model, modelName: m.name, installed, age, life: m.life,
      lifeUsed: age / m.life, warrantyUntil, inWarranty: warrantyUntil >= 2026,
      height: o.height || (type === 'STL' ? [8, 10, 12][Math.floor(r() * 3)] : null),
      circuit: o.circuit || (type === 'STL' ? dist + '-C' + pad(1 + Math.floor(r() * 24)) : null),
      lastInspect: App.time(`10-${pad(inspectDay)} ${pad(9 + Math.floor(r() * 9))}:${pad(Math.floor(r() * 6) * 10)}`),
    };
  };

  function pointInPoly([x, y], pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToPolyline([x, y], pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return best;
  }
  App.assetPoint = (code, dist) => {
    if (ASSET_POINTS[code]) return ASSET_POINTS[code];
    const d = districtMap[dist];
    const xs = d.poly.map((p) => p[0]), ys = d.poly.map((p) => p[1]);
    const r = rng('pt:' + code);
    for (let k = 0; k < 200; k++) {
      const p = [Math.min(...xs) + r() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + r() * (Math.max(...ys) - Math.min(...ys))];
      if (pointInPoly(p, d.poly) && distToPolyline(p, RIVER) > 10) return [Math.round(p[0]), Math.round(p[1])];
    }
    return d.label;
  };

  App.history = (o) => {
    const crewName = o.crew ? crewMap[o.crew].name : '';
    const rows = [];
    if (o.t.reported) rows.push({ at: o.t.reported, label: '報修', who: sources[o.src].name, text: `${sources[o.src].name}受理：${o.fault}` });
    if (o.t.dispatched) rows.push({ at: o.t.dispatched, label: '派工', who: people.dispatcher.name, text: `派工至 ${crewName}` + (o.t.planned ? `，預計 ${App.fmt.dt(o.t.planned)} 到場` : '') });
    if (o.t.arrived) rows.push({ at: o.t.arrived, label: '到場', who: crewName, text: `${crewName}抵達現場` });
    if (o.t.finished) rows.push({ at: o.t.finished, label: '維修', who: crewName, text: o.fix || '維修完成' });
    if (o.t.closed) rows.push({ at: o.t.closed, label: '驗收', who: o.inspector || people.inspector.name, text: '驗收合格，結案' });
    o.log.forEach((l) => rows.push(Object.assign({ label: '紀錄' }, l)));
    return rows.sort((a, b) => a.at - b.at);
  };

  /* =======================================================================
   * 事件與資料變更
   * ===================================================================== */
  App.on = (name, fn) => doc.addEventListener('app:' + name, (e) => fn(e.detail));
  App.emit = (name, detail) => doc.dispatchEvent(new CustomEvent('app:' + name, { detail }));

  // 以快照實作復原：只還原這次變更動到的欄位
  const snap = (ids) => ids.map((id) => {
    const o = App.getOrder(id);
    return { o, state: JSON.parse(JSON.stringify({ status: o.status, t: o.t, crew: o.crew, log: o.log, hold: o.hold, inspector: o.inspector })) };
  });
  const undoer = (snaps, action) => ({
    undo() {
      snaps.forEach(({ o, state }) => Object.assign(o, state));
      App.emit('orders', { action: 'undo:' + action, ids: snaps.map((s) => s.o.id) });
    },
  });
  const getOrThrow = (id) => {
    const o = App.getOrder(id);
    if (!o) throw new Error('Unknown order ' + id);
    return o;
  };

  App.dispatch = (ids, crewId, planned, note = '') => {
    if (!crewMap[crewId]) throw new Error('Unknown crew ' + crewId);
    const snaps = snap(ids);
    const now = App.now();
    ids.forEach((id) => {
      const o = getOrThrow(id);
      const again = o.status === 'dispatched';
      o.status = 'dispatched';
      o.crew = crewId;
      o.t.dispatched = now;
      o.t.planned = planned;
      o.log.push({ at: now, who: people.dispatcher.name, text: `${again ? '改派' : '派工'}至 ${crewMap[crewId].name}，預計 ${App.fmt.dt(planned)} 到場${note ? '；' + note : ''}` });
    });
    App.emit('orders', { action: 'dispatch', ids });
    return undoer(snaps, 'dispatch');
  };

  App.advance = (id, to, { note = '', who, crew } = {}) => {
    const o = getOrThrow(id);
    const snaps = snap([id]);
    const now = App.now();
    if (crew) o.crew = crew;
    if (to === 'onsite') o.t.arrived = now;
    if (to === 'repair') o.t.arrived = o.t.arrived || now;
    if (to === 'review') { o.t.arrived = o.t.arrived || now; o.t.finished = now; o.hold = null; }
    if (to === 'closed') { o.t.finished = o.t.finished || now; o.t.closed = now; o.inspector = who || people.inspector.name; }
    o.status = to;
    o.log.push({ at: now, who: who || people.dispatcher.name, text: `狀態變更為「${status[to].name}」${note ? '：' + note : ''}` });
    App.emit('orders', { action: 'advance', ids: [id], to });
    return undoer(snaps, 'advance');
  };

  App.createOrder = (f) => {
    ['type', 'asset', 'dist', 'loc', 'fault', 'prio'].forEach((k) => { if (!f[k]) throw new Error('createOrder: missing ' + k); });
    const now = App.now();
    const p = parts(now);
    const prefix = `WO-${String(p.y).slice(2)}${pad(p.mo)}-`;
    const seq = ORDERS.filter((o) => o.id.startsWith(prefix)).reduce((m, o) => Math.max(m, +o.id.slice(-4)), 0) + 1;
    const o = Object.assign({ crew: null, parts: [], sessions: null, hold: null, item: null, affects: 1, outage: 0, inspector: null, fix: '', src: 'patrol', desc: '' }, f, {
      id: prefix + pad(seq, 4), status: 'new',
      t: { reported: now, dispatched: null, planned: null, arrived: null, finished: null, closed: null },
      log: [],
    });
    ORDERS.unshift(o);
    App.emit('orders', { action: 'create', ids: [o.id] });
    return o;
  };

  /* =======================================================================
   * 標記產生器
   * ===================================================================== */
  const ICONS = {
    lamp: 'M5 14.5h6M8 14.5V5.5M8 5.5c0-2 1.2-3 3-3h1.5M10 2.5h4l-.6 1.8h-2.8z',
    signal: 'M5.5 1.5h5v10h-5zM8 11.5v3M8 4h.01M8 6.5h.01M8 9h.01',
    paving: 'M1.5 4.5h13v7h-13zM1.5 8h13M5.5 4.5V8M10.5 4.5V8M3.5 8v3.5M8 8v3.5M12.5 8v3.5',
    park: 'M8 14.5v-4M4.5 10.5h7l-3.5-8zM2 14.5h12',
    arrow: 'M3 8h10M9 4l4 4-4 4',
    back: 'M13 8H3M7 4L3 8l4 4',
    close: 'M4 4l8 8M12 4l-8 8',
    check: 'M3.5 8.5l3 3 6-7',
    plus: 'M8 3v10M3 8h10',
    search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 14l-3.5-3.5',
    wrench: 'M10.2 2.2a3.5 3.5 0 0 0-3.9 4.6L2 11.1 4.9 14l4.3-4.3a3.5 3.5 0 0 0 4.6-3.9l-2 2-2.2-.6-.6-2.2z',
    truck: 'M1.5 4h8v7h-8zM9.5 6.5h2.8l2.2 2.4V11h-5M4.5 13a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zM11.5 13a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z',
    user: 'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8zM2.75 14a5.25 5.25 0 0 1 10.5 0',
    alert: 'M8 2.25L14.5 13.5h-13zM8 6.5v3M8 11.6v.01',
    clock: 'M8 14.25A6.25 6.25 0 1 0 8 1.75a6.25 6.25 0 0 0 0 12.5zM8 4.5V8l2.5 1.5',
    pin: 'M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8zM8 8a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 8 8z',
    undo: 'M5.5 3.5L2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7',
    chevron: 'M4 6l4 4 4-4',
    sort: 'M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5',
    download: 'M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
    refresh: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3',
    calendar: 'M3 3.5h10a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    bolt: 'M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z',
    menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
    filter: 'M2.5 3.5h11l-4.25 5v4l-2.5 1.25V8.5z',
    list: 'M5.75 4h7.75M5.75 8h7.75M5.75 12h7.75M2.5 4h.01M2.5 8h.01M2.5 12h.01',
    doc: 'M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V4.75zM9.5 1.75v3h3M5.75 8.25h4.5M5.75 11h3',
    grid: 'M2.75 2.75h4v4h-4zM9.25 2.75h4v4h-4zM2.75 9.25h4v4h-4zM9.25 9.25h4v4h-4z',
    box: 'M8 1.75l5.75 3v6.5L8 14.25l-5.75-3v-6.5zM2.25 4.75L8 7.75l5.75-3M8 7.75v6.5',
    sign: 'M2 13.5c2-.2 3-1.6 4.2-3.4 1-1.5 2.2-3.4 3.3-2.2.9 1-.9 3.4.4 3.6 1 .1 1.6-1.3 2.4-1.5.6-.1.6.9 1.7 1M2 14.5h12',
  };
  App.icon = (name, cls = '') => {
    if (!ICONS[name]) throw new Error('Unknown icon ' + name);
    return `<svg class="ic ${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  };
  App.typeIcon = (type) => App.icon(types[type].icon);
  App.led = (tone = 'green', { pulse } = {}) => `<i class="led led--${tone}${pulse ? ' led--' + pulse : ''}" aria-hidden="true"></i>`;
  App.statusBadge = (s) => {
    const st = status[s];
    return `<span class="status" data-status="${s}">${App.led(st.tone, { pulse: st.pulse })}<span>${st.name}</span></span>`;
  };
  App.prioBadge = (p) => `<span class="prio" data-p="${p}" title="${prio[p].code} ${prio[p].name}：${prio[p].sla} 小時內修復">${prio[p].code}</span>`;
  App.typeTag = (t) => `<span class="typetag">${App.typeIcon(t)}${types[t].name}</span>`;
  App.slaTag = (o) => {
    const s = App.sla(o);
    return `<span class="sla" data-state="${s.state}">${s.label}</span>`;
  };
  App.meter = (value, max, { cells = 16, tone = 'ink' } = {}) => {
    const lit = max ? Math.round(clamp(value / max, 0, 1) * cells) : 0;
    let out = `<span class="meter meter--${tone}" role="img" aria-label="${esc(value)} / ${esc(max)}">`;
    for (let i = 0; i < cells; i++) out += `<i${i < lit ? ' class="on"' : ''}></i>`;
    return out + '</span>';
  };
  App.emptyState = ({ title, text = '' }) =>
    `<div class="empty"><span class="empty__grille" aria-hidden="true"></span><p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}</div>`;

  /* =======================================================================
   * 可見性與動態暫停
   * ===================================================================== */
  App.inView = (el) => {
    if (doc.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
  };
  // [data-anim] 容器離開視窗時加上 .is-paused，CSS 會暫停其中所有動畫（含偽元素）
  const animIO = new IntersectionObserver((entries) => entries.forEach((en) => en.target.classList.toggle('is-paused', !en.isIntersecting)));
  App.watchAnim = (el) => animIO.observe(el);
  doc.addEventListener('visibilitychange', () => html.classList.toggle('is-hidden', doc.hidden));

  /* ---------- 捲動進場 ---------- */
  const revealIO = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); }
  }), { rootMargin: '0px 0px -6% 0px' });
  App.reveal = (scope = doc) => {
    $$('[data-reveal]:not(.is-in)', scope).forEach((el) => {
      // 初次載入已在視窗內的直接顯示，不播進場，避免首屏閃一下
      if (App.reducedMotion() || el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in', 'is-instant');
      else revealIO.observe(el);
    });
  };
  // 保底：任何原因漏掉觀察（例如容器尺寸晚到）的元素，只要捲到視窗內就一定顯示
  let revealTick = 0;
  addEventListener('scroll', () => {
    if (revealTick) return;
    revealTick = requestAnimationFrame(() => {
      revealTick = 0;
      $$('[data-reveal]:not(.is-in)').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); });
    });
  }, { passive: true });
  addEventListener('beforeprint', () => $$('[data-reveal]').forEach((el) => el.classList.add('is-in')));

  /* =======================================================================
   * 七段顯示器
   * ===================================================================== */
  const SEG_GLYPH = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    '-': 'g', ' ': '', _: 'd', A: 'abcefg', b: 'cdefg', C: 'adef', c: 'deg', d: 'bcdeg', E: 'adefg', F: 'aefg', H: 'bcefg',
    h: 'cefg', L: 'def', n: 'ceg', o: 'cdeg', P: 'abefg', r: 'eg', t: 'defg', U: 'bcdef', u: 'cde', y: 'bcdfg',
  };
  const SEG = { W: 40, H: 70, T: 8.6, GAP: 13, COLON: 10, SKEW: 6 };
  const SEG_POLYS = (() => {
    const { W, H, T } = SEG, h = T / 2, g = 1.7, m = H / 2;
    const hz = (x1, x2, y) => `${x1},${y} ${x1 + h},${y - h} ${x2 - h},${y - h} ${x2},${y} ${x2 - h},${y + h} ${x1 + h},${y + h}`;
    const vt = (x, y1, y2) => `${x},${y1} ${x + h},${y1 + h} ${x + h},${y2 - h} ${x},${y2} ${x - h},${y2 - h} ${x - h},${y1 + h}`;
    return {
      a: hz(h + g, W - h - g, h), b: vt(W - h, h + g, m - g), c: vt(W - h, m + g, H - h - g),
      d: hz(h + g, W - h - g, H - h), e: vt(h, m + g, H - h - g), f: vt(h, h + g, m - g), g: hz(h + g, W - h - g, m),
    };
  })();
  const segStore = new WeakMap();

  function parseSeg(value, cells) {
    const out = [];
    for (const ch of String(value)) {
      if (ch === '.') { if (!out.length) out.push({ ch: ' ', dp: true }); else out[out.length - 1].dp = true; }
      else if (ch === ':') continue;
      else {
        if (!(ch in SEG_GLYPH)) throw new Error('App.seg: unsupported glyph "' + ch + '"');
        out.push({ ch, dp: false });
      }
    }
    if (out.length > cells) throw new Error(`App.seg: "${value}" does not fit ${cells} digits`);
    while (out.length < cells) out.unshift({ ch: ' ', dp: false });
    return out;
  }

  App.seg = (host, opts = {}) => {
    if (segStore.has(host)) {
      const inst = segStore.get(host);
      if ('value' in opts) inst.set(opts.value, { roll: false });
      return inst;
    }
    const o = Object.assign({ pattern: host.dataset.pattern || '8888', value: host.dataset.value ?? '', label: host.dataset.label || '', unit: '', tone: host.dataset.tone || 'orange' }, opts);
    const { W, H, GAP, COLON, SKEW } = SEG;
    const ov = H * Math.tan((SKEW * Math.PI) / 180);
    let x = 0, inner = '', digitCount = 0;
    const cellsMeta = [];
    [...o.pattern].forEach((ch, i, arr) => {
      const last = i === arr.length - 1;
      if (ch === ':') {
        inner += `<g class="seg__colon" transform="translate(${x + ov},0) skewX(-${SKEW})"><rect class="seg__s" x="${COLON / 2 - 3.6}" y="${H * 0.3 - 3.6}" width="7.2" height="7.2" rx="1"/><rect class="seg__s" x="${COLON / 2 - 3.6}" y="${H * 0.7 - 3.6}" width="7.2" height="7.2" rx="1"/></g>`;
        x += COLON + (last ? 0 : GAP);
      } else {
        inner += `<g class="seg__cell" transform="translate(${x + ov},0) skewX(-${SKEW})">` +
          Object.entries(SEG_POLYS).map(([k, pts]) => `<polygon class="seg__s" data-s="${k}" points="${pts}"/>`).join('') +
          `<circle class="seg__s seg__dp" cx="${W + GAP / 2}" cy="${H - SEG.T / 2}" r="${SEG.T / 2 + 0.4}"/></g>`;
        cellsMeta.push(digitCount++);
        x += W + (last ? 0 : GAP);
      }
    });
    const width = x + ov + GAP * 0.6;
    host.classList.add('seg', 'seg--' + o.tone);
    host.setAttribute('role', 'img');
    host.innerHTML = `<svg viewBox="0 -2 ${width.toFixed(1)} ${H + 4}" aria-hidden="true" focusable="false">${inner}</svg>`;
    const cellEls = $$('.seg__cell', host).map((g) => ({ segs: Object.fromEntries($$('polygon', g).map((p) => [p.dataset.s, p])), dp: g.querySelector('.seg__dp') }));
    const colonEls = $$('.seg__colon .seg__s', host);

    const drawCell = (i, glyph) => {
      const on = SEG_GLYPH[glyph.ch];
      const c = cellEls[i];
      for (const k in c.segs) c.segs[k].classList.toggle('on', on.includes(k));
      c.dp.classList.toggle('on', glyph.dp);
    };
    const inst = {
      el: host,
      target: '',
      settled: parseSeg('', digitCount),
      running: false,
      start: 0,
      changed: [],
      set(value, { roll = true } = {}) {
        const glyphs = parseSeg(value, digitCount); // 先解析，格式錯誤時在呼叫端就失敗
        inst.target = String(value);
        host.setAttribute('aria-label', [o.label, inst.target + (o.unit || '')].filter(Boolean).join(' '));
        if (!roll || App.reducedMotion() || !App.inView(host)) {
          glyphs.forEach((g, i) => drawCell(i, g));
          inst.settled = glyphs;
          inst.running = false;
          return inst;
        }
        inst.changed = glyphs.map((g, i) => g.ch !== inst.settled[i].ch);
        inst.start = performance.now();
        if (!inst.running) { inst.running = true; requestAnimationFrame(tick); }
        return inst;
      },
      colon(on) { colonEls.forEach((r) => r.classList.toggle('on', on)); },
    };
    function tick(now) {
      if (!inst.running) return;
      // 每幀都重讀最新目標：連續快速 set() 只會延長滾動，不會重入或錯位
      const glyphs = parseSeg(inst.target, digitCount);
      const elapsed = now - inst.start;
      let busy = false;
      glyphs.forEach((g, i) => {
        const settleAt = 170 + i * 70;
        if (inst.changed[i] && elapsed < settleAt && g.ch !== ' ') {
          busy = true;
          drawCell(i, { ch: String(Math.floor((now / 48 + i * 3) % 10)), dp: g.dp });
        } else drawCell(i, g);
      });
      if (busy) requestAnimationFrame(tick);
      else { inst.settled = glyphs; inst.running = false; }
    }
    segStore.set(host, inst);
    inst.set(o.value, { roll: false });
    return inst;
  };

  /* =======================================================================
   * 類比錶頭（彈簧阻尼指針）
   * ===================================================================== */
  let uid = 0;
  App.gauge = (host, opts = {}) => {
    const o = Object.assign({ min: 0, max: 100, value: 0, labels: null, target: null, caption: '', range: '', unit: '', sweep: 92 }, opts);
    const id = 'g' + ++uid;
    const CX = 160, CY = 206, R = 150;
    host.classList.add('gauge');
    host.innerHTML = `
      <svg viewBox="0 0 320 184" role="img" aria-labelledby="${id}-t">
        <title id="${id}-t"></title>
        <defs>
          <linearGradient id="${id}-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
          <clipPath id="${id}-clip"><rect x="0" y="0" width="320" height="184" rx="12"/></clipPath>
        </defs>
        <g clip-path="url(#${id}-clip)">
          <rect class="gauge__face" x="0" y="0" width="320" height="184"/>
          <text class="gauge__cap" x="18" y="26">${esc(o.caption)}</text>
          <text class="gauge__range" x="302" y="26" text-anchor="end"></text>
          <g class="gauge__scale"></g>
          <g class="gauge__needle"><line class="gauge__shadow" x1="${CX + 2}" y1="${CY + 1}" x2="${CX + 2}" y2="${CY - R + 3}"/><line class="gauge__hand" x1="${CX}" y1="${CY}" x2="${CX}" y2="${CY - R + 2}"/></g>
          <rect class="gauge__hub" x="0" y="150" width="320" height="34"/>
          <text class="gauge__unit" x="${CX}" y="172" text-anchor="middle">${esc(o.unit)}</text>
          <rect x="0" y="0" width="320" height="150" fill="url(#${id}-glass)" pointer-events="none"/>
        </g>
      </svg>`;
    const svg = host.querySelector('svg');
    const scaleG = host.querySelector('.gauge__scale');
    const needle = host.querySelector('.gauge__needle');
    const title = host.querySelector('title');
    const rangeT = host.querySelector('.gauge__range');
    const toAngle = (v) => {
      const f = (v - o.min) / (o.max - o.min);
      return clamp(-o.sweep / 2 + f * o.sweep, -o.sweep / 2 - 3, o.sweep / 2 + 3); // 超出量程時指針「頂表」
    };
    const polar = (a, r) => [CX + r * Math.sin((a * Math.PI) / 180), CY - r * Math.cos((a * Math.PI) / 180)];
    function drawScale() {
      const labels = o.labels || [o.min, (o.min + o.max) / 2, o.max];
      const majors = labels.length - 1, minors = 5;
      let s = '';
      if (o.target != null && o.target < o.max) {
        const a0 = toAngle(o.target), a1 = o.sweep / 2;
        const [x0, y0] = polar(a0, R + 5), [x1, y1] = polar(a1, R + 5);
        s += `<path class="gauge__zone" d="M${x0.toFixed(1)},${y0.toFixed(1)} A${R + 5},${R + 5} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}"/>`;
        const [tx, ty] = polar(a0, R + 11);
        s += `<path class="gauge__target" transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) rotate(${a0})" d="M0,6 L-4.5,-2 L4.5,-2 Z"/>`;
      }
      for (let i = 0; i <= majors * minors; i++) {
        const a = -o.sweep / 2 + (i / (majors * minors)) * o.sweep;
        const major = i % minors === 0;
        const [x1, y1] = polar(a, major ? R - 16 : R - 9), [x2, y2] = polar(a, R);
        s += `<line class="gauge__tick${major ? ' is-major' : ''}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
      }
      labels.forEach((lb, i) => {
        const a = -o.sweep / 2 + (i / majors) * o.sweep;
        const [x, y] = polar(a, R - 32);
        s += `<text class="gauge__num" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${esc(lb)}</text>`;
      });
      s += `<path class="gauge__arc" d="M${polar(-o.sweep / 2, R).map((n) => n.toFixed(1)).join(',')} A${R},${R} 0 0 1 ${polar(o.sweep / 2, R).map((n) => n.toFixed(1)).join(',')}"/>`;
      scaleG.innerHTML = s;
      rangeT.textContent = o.range;
    }
    let angle = toAngle(o.min), vel = 0, raf = 0, last = 0, fadeTimer = 0;
    const draw = (a) => needle.setAttribute('transform', `rotate(${a.toFixed(2)} ${CX} ${CY})`);
    const label = () => { title.textContent = `${o.caption} ${App.fmt.num(o.value, 1)} ${o.unit}`.trim(); };
    // 欠阻尼彈簧：指針越過目標再回擺，模擬動圈式錶頭的機械慣性
    const K = 150, C = 10.5;
    function step(t) {
      const dt = Math.min(0.034, (t - last) / 1000 || 0.016);
      last = t;
      const target = toAngle(o.value);
      for (let i = 0; i < 4; i++) {
        const acc = -K * (angle - target) - C * vel;
        vel += acc * (dt / 4);
        angle += vel * (dt / 4);
      }
      draw(angle);
      if (Math.abs(angle - target) < 0.03 && Math.abs(vel) < 0.08) { angle = target; vel = 0; draw(angle); raf = 0; return; }
      raf = requestAnimationFrame(step);
    }
    function kick() {
      label();
      if (App.reducedMotion() || !App.inView(host)) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0; angle = toAngle(o.value); vel = 0; draw(angle);
        return;
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
    }
    drawScale();
    draw(angle);
    const api = {
      el: host,
      set(v) { o.value = v; kick(); return api; },
      setRange(r) {
        Object.assign(o, r);
        clearTimeout(fadeTimer);
        if (App.reducedMotion()) { drawScale(); kick(); return api; }
        scaleG.classList.add('is-fading');
        // 刻度先淡出再換，避免舊刻度與新指針位置同時出現造成誤讀
        fadeTimer = setTimeout(() => { drawScale(); scaleG.classList.remove('is-fading'); }, 160);
        kick();
        return api;
      },
    };
    svg.addEventListener('pointerdown', () => { vel += 60; kick(); }); // 輕敲錶面，指針會晃一下
    if (o.value !== o.min) requestAnimationFrame(() => kick());
    return api;
  };

  /* =======================================================================
   * 旋鈕
   * ===================================================================== */
  App.knob = (host, opts) => {
    const o = Object.assign({ values: [], value: null, label: '旋鈕', sweep: 240, onChange: null }, opts);
    const n = o.values.length;
    if (n < 2) throw new Error('App.knob needs at least 2 values');
    const step = o.sweep / (n - 1);
    const angleOf = (i) => -o.sweep / 2 + i * step;
    let idx = -1;
    host.classList.add('knob');
    let ticks = '';
    const minors = 3;
    for (let i = 0; i <= (n - 1) * minors; i++) {
      const a = (-o.sweep / 2 + (i / ((n - 1) * minors)) * o.sweep) * (Math.PI / 180);
      const major = i % minors === 0;
      const r1 = major ? 30.5 : 31.5, r2 = major ? 36 : 34;
      ticks += `<line class="knob__tick${major ? ' is-major' : ''}" data-i="${major ? i / minors : ''}" x1="${(r1 * Math.sin(a)).toFixed(2)}" y1="${(-r1 * Math.cos(a)).toFixed(2)}" x2="${(r2 * Math.sin(a)).toFixed(2)}" y2="${(-r2 * Math.cos(a)).toFixed(2)}"/>`;
    }
    host.innerHTML = `
      <svg class="knob__ticks" viewBox="-50 -50 100 100" aria-hidden="true">${ticks}</svg>
      <div class="knob__labels">${o.values.map((v, i) => {
        const a = angleOf(i) * (Math.PI / 180);
        return `<button type="button" class="knob__label" tabindex="-1" data-i="${i}" style="left:${(50 + 44 * Math.sin(a)).toFixed(2)}%;top:${(50 - 44 * Math.cos(a)).toFixed(2)}%">${esc(v.label)}</button>`;
      }).join('')}</div>
      <div class="knob__body" role="slider" tabindex="0" aria-label="${esc(o.label)}" aria-valuemin="0" aria-valuemax="${n - 1}">
        <span class="knob__skirt"></span><span class="knob__cap"><i class="knob__mark"></i></span>
      </div>`;
    const body = host.querySelector('.knob__body');
    const labelEls = $$('.knob__label', host);
    const tickEls = $$('.knob__tick.is-major', host);
    const rotate = (a) => body.style.setProperty('--a', a.toFixed(2) + 'deg');
    function setIndex(i, { silent = false, snap = true } = {}) {
      i = clamp(i, 0, n - 1);
      const changed = i !== idx;
      idx = i;
      body.setAttribute('aria-valuenow', i);
      body.setAttribute('aria-valuetext', o.values[i].text || o.values[i].label);
      labelEls.forEach((el, k) => el.classList.toggle('is-active', k === i));
      tickEls.forEach((el) => el.classList.toggle('is-active', +el.dataset.i === i));
      if (snap) rotate(angleOf(i));
      if (changed) {
        // 檔位回饋：刻度字與旋鈕輕微「咔」一下
        host.classList.remove('is-detent');
        void host.offsetWidth;
        host.classList.add('is-detent');
        if (!silent) {
          if (o.onChange) o.onChange(o.values[i].value, i);
          host.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: o.values[i].value, index: i } }));
        }
      }
    }
    // 拖曳：以圓心角的「增量」累加，避免按下瞬間跳到指標位置
    let drag = null;
    const pointerAngle = (e) => (Math.atan2(e.clientX - drag.cx, -(e.clientY - drag.cy)) * 180) / Math.PI;
    body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = body.getBoundingClientRect();
      drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, a: angleOf(idx), last: 0, y: e.clientY };
      drag.last = pointerAngle(e);
      body.setPointerCapture(e.pointerId);
      host.classList.add('is-dragging');
      body.focus({ preventScroll: true });
      e.preventDefault();
    });
    body.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dist = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
      let delta;
      if (dist < 10) {
        // 太靠近圓心時角度不穩定，改用垂直位移（上推 = 順時針）
        delta = (drag.y - e.clientY) * 1.4;
      } else {
        const a = pointerAngle(e);
        delta = a - drag.last;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        drag.last = a;
      }
      drag.y = e.clientY;
      drag.a = clamp(drag.a + delta, -o.sweep / 2 - 10, o.sweep / 2 + 10);
      const near = Math.round((drag.a + o.sweep / 2) / step);
      setIndex(near, { snap: false });
      // 磁吸感：視覺角度往最近檔位偏 40%
      rotate(drag.a + (angleOf(clamp(near, 0, n - 1)) - drag.a) * 0.4);
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      host.classList.remove('is-dragging');
      rotate(angleOf(idx));
    };
    body.addEventListener('pointerup', endDrag);
    body.addEventListener('pointercancel', endDrag);
    let wheelAcc = 0;
    body.addEventListener('wheel', (e) => {
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) >= 40) { setIndex(idx + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; }
    }, { passive: false });
    body.addEventListener('keydown', (e) => {
      const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 1, PageDown: -1 };
      if (e.key in map) { setIndex(idx + map[e.key]); e.preventDefault(); }
      else if (e.key === 'Home') { setIndex(0); e.preventDefault(); }
      else if (e.key === 'End') { setIndex(n - 1); e.preventDefault(); }
    });
    labelEls.forEach((el) => el.addEventListener('click', () => { setIndex(+el.dataset.i); body.focus({ preventScroll: true }); }));
    setIndex(Math.max(0, o.values.findIndex((v) => v.value === o.value)), { silent: true });
    host.classList.remove('is-detent');
    return {
      el: host,
      get: () => o.values[idx].value,
      set(v, { silent = false } = {}) { setIndex(o.values.findIndex((x) => x.value === v), { silent }); },
    };
  };

  /* =======================================================================
   * 撥桿、按鍵、分頁籤、長按簽核
   * ===================================================================== */
  App.setLever = (el, on) => {
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  const LEVER_PARTS = '<span class="lever__plate"></span><span class="lever__stick"></span><span class="lever__nut"></span>';
  // 產生撥桿 HTML；頁面上寫成空的 <button class="lever" role="switch" aria-checked="…" aria-label="…"></button> 也會自動補上零件
  App.lever = ({ label, on = false, role = 'switch', sm = false, attrs = '' }) =>
    `<button type="button" class="lever${sm ? ' lever--sm' : ''}" role="${role}" aria-checked="${on}" aria-label="${esc(label)}" ${attrs}>${LEVER_PARTS}</button>`;
  App.fillLevers = (root = doc) => $$('.lever', root).forEach((el) => { if (!el.children.length) el.innerHTML = LEVER_PARTS; });
  doc.addEventListener('click', (e) => {
    const lever = e.target.closest('.lever, .lever-card');
    if (lever && !lever.disabled) {
      if (lever.getAttribute('role') === 'radio') {
        if (lever.getAttribute('aria-checked') === 'true') return;
        const group = lever.closest('[role="radiogroup"]');
        if (group) $$('[role="radio"]', group).forEach((l) => App.setLever(l, l === lever));
        else App.setLever(lever, true);
      } else {
        App.setLever(lever, lever.getAttribute('aria-checked') !== 'true');
      }
      lever.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const key = e.target.closest('.key');
    if (!key || key.disabled) return;
    const row = key.closest('.keyrow[data-single]');
    if (row) {
      if (key.getAttribute('aria-pressed') === 'true') return;
      $$('.key', row).forEach((k) => k.setAttribute('aria-pressed', k === key ? 'true' : 'false'));
      row.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: key.dataset.value } }));
    } else if (key.hasAttribute('data-toggle')) {
      key.setAttribute('aria-pressed', key.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      key.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  // radiogroup 內的撥桿 / 選項卡以方向鍵切換（符合 WAI-ARIA radio 慣例）
  doc.addEventListener('keydown', (e) => {
    const lever = e.target.closest && e.target.closest('.lever[role="radio"], .lever-card[role="radio"]');
    if (!lever || !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    const group = lever.closest('[role="radiogroup"]');
    if (!group) return;
    const all = $$('[role="radio"]:not(:disabled)', group);
    const next = all[(all.indexOf(lever) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
    next.focus();
    next.click();
    e.preventDefault();
  });

  App.tabs = (list, { onChange } = {}) => {
    const tabs = $$('[role="tab"]', list);
    let ink = list.querySelector('.tabs__ink');
    if (!ink) { ink = doc.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    const place = (t) => { ink.style.width = t.offsetWidth + 'px'; ink.style.transform = `translateX(${t.offsetLeft}px)`; };
    function select(i, focus = false) {
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute('aria-controls') && doc.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      place(tabs[i]);
      if (focus) tabs[i].focus();
      if (onChange) onChange(i, tabs[i]);
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { select((i + 1) % tabs.length, true); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { select((i - 1 + tabs.length) % tabs.length, true); e.preventDefault(); }
      });
    });
    const start = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    select(start);
    addEventListener('resize', () => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
    doc.fonts.ready.then(() => place(tabs.find((t) => t.getAttribute('aria-selected') === 'true')));
    return { select };
  };

  App.holdKey = (btn, { duration = 1200, onComplete }) => {
    let start = 0, raf = 0, done = false;
    const setP = (p) => btn.style.setProperty('--p', p.toFixed(3));
    function loop(t) {
      const p = Math.min(1, (t - start) / duration);
      setP(p);
      if (p >= 1) {
        raf = 0; done = true;
        btn.classList.remove('is-holding');
        btn.classList.add('is-done');
        btn.setAttribute('aria-pressed', 'true');
        onComplete();
        return;
      }
      raf = requestAnimationFrame(loop);
    }
    const begin = () => {
      if (btn.disabled || raf || done) return;
      start = performance.now();
      btn.classList.add('is-holding');
      raf = requestAnimationFrame(loop);
    };
    const cancel = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      btn.classList.remove('is-holding');
      setP(0);
      App.toast('簽核未完成', { desc: `請按住按鍵約 ${(duration / 1000).toFixed(1)} 秒，直到環形燈號走滿。`, tone: 'warn' });
    };
    btn.addEventListener('pointerdown', (e) => { if (e.button === 0) begin(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); } });
    // keyup 也要 preventDefault，否則空白鍵放開時瀏覽器會再合成一次 click
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cancel(); } });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // 單擊（含輔助科技觸發的 click）不會簽核，改給提示，避免誤觸就送出
    btn.addEventListener('click', (e) => {
      if (e.detail === 0 && !raf && !done) App.toast('需長按才能簽核', { desc: '按住空白鍵或滑鼠約 1 秒完成簽核。', tone: 'info' });
    });
    return {
      reset() { done = false; btn.classList.remove('is-done'); btn.setAttribute('aria-pressed', 'false'); setP(0); },
    };
  };

  /* =======================================================================
   * Toast 與 Modal
   * ===================================================================== */
  let toastBox = null;
  // showModal() 會把 dialog 放進 top layer，掛在 body 的 toast 會被蓋住；因此 toast 容器跟著最上層 modal 走
  function placeToasts() {
    if (!toastBox) return;
    const modals = doc.querySelectorAll('dialog:modal');
    const host = modals.length ? modals[modals.length - 1] : doc.body;
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
  }
  doc.addEventListener('close', () => queueMicrotask(placeToasts), true);

  App.toast = (title, { desc = '', tone = 'ok', action = null, duration = 4600 } = {}) => {
    if (!toastBox) {
      toastBox = doc.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
    }
    placeToasts();
    const t = doc.createElement('div');
    t.className = 'toast toast--' + tone;
    const ledTone = { ok: 'green', info: 'orange', warn: 'orange', danger: 'red' }[tone] || 'green';
    t.innerHTML = `${App.led(ledTone, { pulse: tone === 'danger' ? 'blink' : null })}<div class="toast__body"><p class="toast__title">${esc(title)}</p>${desc ? `<p class="toast__desc">${esc(desc)}</p>` : ''}</div>` +
      (action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : '') +
      `<button type="button" class="toast__x" aria-label="關閉通知">${App.icon('close')}</button>`;
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    let timer = 0, closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      t.classList.remove('is-in');
      t.classList.add('is-out');
      setTimeout(() => t.remove(), App.reducedMotion() ? 0 : 240);
    };
    const arm = () => { timer = setTimeout(close, duration); };
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    t.addEventListener('mouseleave', arm);
    t.querySelector('.toast__x').addEventListener('click', close);
    if (action) t.querySelector('.toast__action').addEventListener('click', () => { action.onClick(); close(); });
    arm();
    return { close };
  };

  const modalStack = [];
  App.modal = ({ eyebrow = '', title, body = '', actions = [], size = 'md', onClose } = {}) => {
    const dlg = doc.createElement('dialog');
    const tid = 'm' + ++uid;
    dlg.className = 'modal modal--' + size;
    dlg.setAttribute('aria-labelledby', tid);
    dlg.innerHTML = `<div class="modal__panel">
        <header class="modal__head"><div>${eyebrow ? `<p class="modal__eyebrow">${esc(eyebrow)}</p>` : ''}<h2 class="modal__title" id="${tid}">${esc(title)}</h2></div>
          <button type="button" class="modal__x" aria-label="關閉">${App.icon('close')}</button></header>
        <div class="modal__body"></div>
        ${actions.length ? '<footer class="modal__foot"></footer>' : ''}
      </div>`;
    const bodyEl = dlg.querySelector('.modal__body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else bodyEl.appendChild(body);
    let closed = false;
    const api = { el: dlg, body: bodyEl, close };
    function close(result) {
      if (closed) return;
      closed = true;
      modalStack.splice(modalStack.indexOf(api), 1);
      dlg.classList.add('is-closing');
      setTimeout(() => {
        dlg.close();
        // 先把 toast 容器搬回 body 再移除 dialog；已脫離文件的 dialog 發出的 close 事件傳不到 document
        placeToasts();
        dlg.remove();
        if (onClose) onClose(result);
      }, App.reducedMotion() ? 0 : 170);
    }
    const foot = dlg.querySelector('.modal__foot');
    actions.forEach((a) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.variant ? 'btn--' + a.variant : '');
      b.textContent = a.label;
      if (a.autofocus) b.autofocus = true;
      b.addEventListener('click', () => { if (!a.onClick || a.onClick(close) !== false) close(a.value); });
      foot.appendChild(b);
    });
    dlg.querySelector('.modal__x').addEventListener('click', () => close());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    doc.body.appendChild(dlg);
    dlg.showModal();
    modalStack.push(api);
    placeToasts();
    return api;
  };
  // 程式觸發的 Escape（含自動化測試）也能關閉最上層 modal；原生 cancel 事件會再呼叫一次 close，已做冪等
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close();
  });

  App.confirm = ({ title, message = '', confirmLabel = '確認', cancelLabel = '取消', tone = 'accent' }) => new Promise((resolve) => {
    let result = false;
    App.modal({
      title, size: 'sm', body: `<p class="modal__msg">${esc(message)}</p>`,
      actions: [
        { label: cancelLabel, variant: 'ghost' },
        { label: confirmLabel, variant: tone, autofocus: true, onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });

  /* ---------- 派工對話框（index、orders、order 共用） ---------- */
  App.openDispatch = (ids, { onDone } = {}) => {
    const list = ids.map(getOrThrow);
    const tally = {};
    list.forEach((o) => { const c = App.suggestCrew(o); tally[c] = (tally[c] || 0) + 1; });
    const suggested = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    const now = App.now();
    const today = App.dayStart(now);
    const slots = [
      { v: 'now', label: '立即出發', at: now + 30 * 60e3, sub: '約 ' + App.fmt.time(now + 30 * 60e3) },
      { v: 'hour', label: '1 小時內', at: now + HOUR, sub: App.fmt.time(now + HOUR) },
      { v: 'tonight', label: '今晚 21:30', at: today + 21.5 * HOUR, sub: '夜間巡修' },
      { v: 'tomorrow', label: '明日 09:00', at: today + DAY + 9 * HOUR, sub: '日班排程' },
    ];
    const hasP1 = list.some((o) => o.prio === 1);
    const crewRow = (c) => {
      const st = App.crewState(c.id);
      return `<button type="button" class="lever-card" role="radio" aria-checked="${c.id === suggested}" data-crew="${c.id}">
          ${App.led(st.tone, { pulse: st.state === 'work' ? 'breathe' : null })}
          <span class="lever-card__main"><b>${esc(c.name)}</b><small>${esc(c.leader)} · ${esc(c.vehicle)}</small></span>
          <span class="lever-card__meta">${esc(st.label)}${c.id === suggested ? '<em>建議</em>' : ''}</span>
        </button>`;
    };
    const body = `
      <div class="dispatch">
        <ul class="dispatch__orders">${list.slice(0, 4).map((o) => `<li>${App.prioBadge(o.prio)}<span class="mono">${o.id}</span><span class="truncate">${esc(App.district(o.dist).name)} ${esc(o.loc)} · ${esc(o.fault)}</span></li>`).join('')}
          ${list.length > 4 ? `<li class="dispatch__more">另 ${list.length - 4} 件</li>` : ''}</ul>
        <p class="caps-label" id="dsp-crew">指派班別</p>
        <div class="dispatch__crews" role="radiogroup" aria-labelledby="dsp-crew">${crews.map(crewRow).join('')}</div>
        <p class="caps-label" id="dsp-slot">預計到場</p>
        <div class="keyrow keyrow--fill" data-single role="group" aria-labelledby="dsp-slot">${slots.map((s, i) => `<button type="button" class="key" data-value="${s.v}" aria-pressed="${(hasP1 ? i === 0 : i === 2) ? 'true' : 'false'}"><span>${s.label}</span><small>${s.sub}</small></button>`).join('')}</div>
        <label class="field"><span class="field__label">派工備註</span><textarea class="textarea" rows="2" maxlength="120" placeholder="例如：需會同交通隊、攜帶 120W 燈具備品"></textarea></label>
        ${hasP1 ? `<p class="callout callout--danger">${App.icon('alert')}含 P1 緊急工單：須於派工後 1 小時內到場，系統將同步簡訊通知班長。</p>` : ''}
      </div>`;
    const m = App.modal({
      eyebrow: `DISPATCH · ${list.length} 件`,
      title: list.length === 1 ? `派工 ${list[0].id}` : `批次派工 ${list.length} 件`,
      body, size: 'md',
      actions: [
        { label: '取消', variant: 'ghost' },
        {
          label: '確認派工', variant: 'accent',
          onClick: () => {
            const crewBtn = m.body.querySelector('.lever-card[aria-checked="true"]');
            const slot = slots.find((s) => s.v === m.body.querySelector('.keyrow .key[aria-pressed="true"]').dataset.value);
            const note = m.body.querySelector('textarea').value.trim();
            const crew = crewMap[crewBtn.dataset.crew];
            const res = App.dispatch(ids, crew.id, slot.at, note);
            App.toast(`已派工 ${list.length} 件 → ${crew.name}`, {
              desc: `預計 ${App.fmt.time(slot.at)} 到場${App.crewState(crew.id).overtime ? '（加班出勤）' : ''}`,
              action: { label: '復原', onClick: () => { res.undo(); App.toast('已復原派工', { tone: 'info' }); } },
            });
            if (onDone) onDone(res);
          },
        },
      ],
    });
    return m;
  };

  /* =======================================================================
   * 區域路燈點陣地圖
   * ===================================================================== */
  App.dotMap = (svg, opts = {}) => {
    const o = Object.assign({ pitch: 11, interactive: false, labels: true, sweep: true, highlight: null, selected: null, pins: null, onSelect: null, onHover: null }, opts);
    const NS = 'http://www.w3.org/2000/svg';
    const id = 'dm' + ++uid;
    svg.setAttribute('viewBox', '0 0 760 440');
    svg.classList.add('dotmap');
    if (o.highlight) svg.classList.add('has-highlight');
    const pts = (arr) => arr.map((p) => p.join(',')).join(' ');
    const riverD = 'M' + RIVER.map((p) => p.join(',')).join(' L');
    // 地圖骨架：海面斜紋、鄰近陸地、海岸線、市界、河流
    let base = `
      <defs>
        <pattern id="${id}-sea" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><line x1="0" y1="3.5" x2="3.6" y2="3.5" class="dm-sea-hatch"/></pattern>
      </defs>
      <rect class="dm-sea" x="0" y="0" width="760" height="440" fill="url(#${id}-sea)"/>
      <path class="dm-neighbor" d="M0,0 H760 V384 L736,380 V34 H48 L38,110 L30,0 Z"/>
      <polygon class="dm-land" points="${pts(CITY)}"/>
      <path class="dm-limit" d="M48,34 H736 V380"/>
      <path class="dm-river" d="${riverD}"/>`;
    // 點陣：每點代表一段供電回路；同一 seed 讓每次開頁圖案一致
    const groups = districts.map((d) => {
      const r = rng('dots:' + d.code);
      const dots = [];
      const xs = d.poly.map((p) => p[0]), ys = d.poly.map((p) => p[1]);
      const x0 = Math.ceil(Math.min(...xs) / o.pitch) * o.pitch, y0 = Math.ceil(Math.min(...ys) / o.pitch) * o.pitch;
      for (let y = y0; y <= Math.max(...ys); y += o.pitch) {
        for (let x = x0; x <= Math.max(...xs); x += o.pitch) {
          if (!pointInPoly([x, y], d.poly)) continue;
          if (distToPolyline([x, y], RIVER) < 8) continue;
          if (r() > d.density) continue;
          dots.push({ x, y, fault: false });
        }
      }
      // 故障點數量依該區不亮比例決定，位置以 seed 挑選
      const faultN = Math.max(1, Math.round((dots.length * d.dark) / d.lamps));
      for (let k = 0; k < faultN; k++) dots[Math.floor(r() * dots.length)].fault = true;
      return { d, dots };
    });
    const g = (cls, attrs = '') => `<g class="${cls}" ${attrs}>`;
    let body = '';
    groups.forEach(({ d, dots }) => {
      body += g('dm-d' + (o.highlight === d.code ? ' is-highlight' : '') + (o.interactive ? ' is-interactive' : ''), `data-d="${d.code}"`) +
        `<polygon class="dm-hit" points="${pts(d.poly)}"/>` +
        dots.map((p) => `<circle class="dm-dot${p.fault ? ' is-fault' : ''}" cx="${p.x}" cy="${p.y}" r="2.6" style="--dl:${Math.round(p.x * 1.6 + p.y * 0.4)}ms"/>`).join('') +
        `<polygon class="dm-edge" points="${pts(d.poly)}"/></g>`;
    });
    let labels = '';
    if (o.labels) {
      districts.forEach((d) => {
        labels += `<g class="dm-label${o.highlight && o.highlight !== d.code ? ' is-dim' : ''}" data-d="${d.code}" transform="translate(${d.label[0]},${d.label[1]})">` +
          `<text class="dm-label__name" y="0" text-anchor="middle">${esc(d.name)}</text>` +
          `<text class="dm-label__code" y="13" text-anchor="middle">${d.code} · ${App.fmt.num(((d.lamps - d.dark) / d.lamps) * 100, 1)}%</text></g>`;
      });
    }
    const deco = `
      <g class="dm-compass" transform="translate(712,420)"><path d="M0,-16 L4,-4 L0,-7 L-4,-4 Z"/><text y="6" text-anchor="middle">N</text></g>
      <g class="dm-scale" transform="translate(560,420)"><line x1="0" y1="0" x2="80" y2="0"/><line x1="0" y1="-4" x2="0" y2="4"/><line x1="40" y1="-3" x2="40" y2="3"/><line x1="80" y1="-4" x2="80" y2="4"/><text x="40" y="-7" text-anchor="middle">2 km</text></g>`;
    svg.innerHTML = base + `<g class="dm-dots">${body}</g><g class="dm-labels">${labels}</g><g class="dm-pins"></g>` + deco;
    const pinLayer = svg.querySelector('.dm-pins');
    // 點燈掃描只在地圖真的進入視窗時播放一次；播完（或逾時）一定移除，
    // 避免離開視窗時被暫停在「全暗」的中間狀態
    if (o.sweep && !App.reducedMotion()) {
      const dotsG = svg.querySelector('.dm-dots');
      const sweepIO = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        sweepIO.disconnect();
        dotsG.classList.add('is-sweep');
        setTimeout(() => dotsG.classList.remove('is-sweep'), 2600);
      }, { threshold: 0.35 });
      sweepIO.observe(svg);
    }
    const dGroups = $$('.dm-d', svg);
    const allDots = $$('.dm-dot', svg).map((c) => ({ el: c, x: +c.getAttribute('cx'), y: +c.getAttribute('cy') }));

    function refresh() {
      // 斷電範圍：未結案且帶 outage 半徑的工單，周邊回路熄燈
      const outages = ORDERS.filter((x) => isOpen(x) && x.outage).map((x) => ({ p: App.assetPoint(x.asset, x.dist), r: x.outage }));
      allDots.forEach((d) => d.el.classList.toggle('is-dark', outages.some(({ p, r }) => Math.hypot(d.x - p[0], d.y - p[1]) <= r)));
      // 標籤上的在線率跟著遙測資料走
      $$('.dm-label', svg).forEach((el) => {
        const d = districtMap[el.dataset.d];
        el.querySelector('.dm-label__code').textContent = `${d.code} · ${App.fmt.num(((d.lamps - d.dark) / d.lamps) * 100, 1)}%`;
      });
      const pins = o.pins || ORDERS.filter((x) => isOpen(x) && x.prio === 1).map((x) => ({ id: x.id, point: App.assetPoint(x.asset, x.dist), label: x.fault, tone: 'red' }));
      pinLayer.innerHTML = pins.map((p) => `<g class="dm-pin dm-pin--${p.tone || 'red'}" transform="translate(${p.point[0]},${p.point[1]})"><title>${esc((p.id ? p.id + ' ' : '') + (p.label || ''))}</title><circle class="dm-pin__pulse" r="8"/><circle class="dm-pin__ring" r="8"/><circle class="dm-pin__core" r="2.8"/></g>`).join('');
    }
    let selected = null;
    function select(code, { silent = false } = {}) {
      selected = code;
      svg.classList.toggle('has-selection', !!code);
      dGroups.forEach((el) => el.classList.toggle('is-selected', el.dataset.d === code));
      $$('.dm-label', svg).forEach((el) => el.classList.toggle('is-selected', el.dataset.d === code));
      if (!silent && o.onSelect) o.onSelect(code);
    }
    // 地圖上的點選只是滑鼠 / 觸控的捷徑；鍵盤與輔助科技請在頁面上另放一排行政區按鍵呼叫 select()
    if (o.interactive) {
      dGroups.forEach((el) => {
        el.addEventListener('click', () => select(selected === el.dataset.d ? null : el.dataset.d));
        el.addEventListener('pointerenter', () => { el.classList.add('is-hover'); if (o.onHover) o.onHover(el.dataset.d); });
        el.addEventListener('pointerleave', () => { el.classList.remove('is-hover'); if (o.onHover) o.onHover(null); });
      });
    }
    refresh();
    if (o.selected) select(o.selected, { silent: true });
    return { el: svg, select, refresh, get selected() { return selected; } };
  };

  /* =======================================================================
   * 外殼：導覽、行動版選單、時鐘、計數同步
   * ===================================================================== */
  html.classList.add('js');
  // 比對解析後的完整路徑：「../../index.html」（返回目錄）與本套的 index.html 同檔名但不是同一頁
  $$('[data-nav] a[href]').forEach((a) => {
    const on = new URL(a.href).pathname.toLowerCase() === location.pathname.toLowerCase();
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const masthead = doc.querySelector('[data-masthead]');
  const navToggle = doc.querySelector('[data-nav-toggle]');
  if (navToggle && masthead) {
    const setOpen = (open) => {
      masthead.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    navToggle.addEventListener('click', () => setOpen(!masthead.classList.contains('is-open')));
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && masthead.classList.contains('is-open')) { setOpen(false); navToggle.focus(); } });
    matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }
  if (masthead) {
    const onScroll = () => masthead.classList.toggle('is-stuck', scrollY > 36);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const clocks = $$('[data-clock]').map((el) => App.seg(el, { pattern: '88:88', label: '目前時間', tone: el.dataset.tone || 'orange' }));
  function tickClock() {
    const now = App.now();
    const p = parts(now);
    clocks.forEach((c) => { const v = pad(p.h) + pad(p.mi); if (c.target !== v) c.set(v, { roll: false }); c.colon(p.s % 2 === 0); });
    $$('[data-date]').forEach((el) => { el.textContent = App.fmt.stamp(now); });
  }
  tickClock();
  setInterval(tickClock, 500);

  function syncCounts() {
    const c = App.counts();
    $$('[data-count]').forEach((el) => {
      const k = el.dataset.count;
      if (!(k in c)) throw new Error('Unknown data-count key ' + k);
      el.textContent = c[k];
      el.classList.toggle('is-zero', c[k] === 0);
    });
  }
  App.on('orders', syncCounts);
  syncCounts();

  App.fillLevers();
  $$('[data-anim]').forEach(App.watchAnim);
  $$('[data-tabs]').forEach((el) => App.tabs(el));
  App.reveal();
  html.classList.add('reveal-on');
})();
