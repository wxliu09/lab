/*
 * 澄港市 城市通 CityPass — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已完成初始化
 * （app.js 執行當下就同步初始化，因為 defer script 跑的時候 DOM 已解析完）。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 資料（全站共用、只存在記憶體；人名、卡號、金額請一律從這裡取，確保四頁一致）
 *   App.DATA.user          市民：林語彤、北岸區、市民卡號、銀級、點數 2,860
 *   App.DATA.transit       澄港通卡：餘額、自動加值、最近乘車 trips[]
 *   App.DATA.bikeStations  澄港單車站點 [{id, name, district, dist, bikes, ebikes, docks}]
 *   App.DATA.parking       車牌與停車單 bills[{id, place, date, duration, amount, due, paid}]
 *   App.DATA.clinic        市立醫院掛號：醫院、科別、醫師、days[{date, slots{時間: 剩餘}}]、booking
 *   App.DATA.library       北岸分館：loans[{id, title, author, due, renewals, color}]、holds[]
 *   App.DATA.garbage       北岸 2 線垃圾車：路線 points、stops[{id, name, addr, v, time, lx, ly, anchor}]、
 *                          myStop、days（收運日）、recycle（各星期回收項目）、map（街區幾何）
 *   App.DATA.services      40 項服務（數量一律用 services.length / data-bind="services.count"，不要寫死） [{id, cat, name, desc, icon, users, login, isNew, href}]
 *   App.DATA.bindings      綁定服務 [{id, name, detail, icon, cat, bound, since}]
 *   App.DATA.consents      資料授權 [{id, app, icon, cat, fields[], granted, since, lastUsed}]
 *   App.CATS               服務分類 [{id:'transit'|'life'|'health'|'pay'|'culture', name, full, icon}]
 *   App.update(key, mutate)  修改資料的唯一入口：mutate(App.DATA[key]) 後重繪所有 [data-bind]，
 *                            並發出 document 事件 'cp:data'（detail.key）。復原也走同一個入口。
 *   App.value(path)          取值，支援計算欄位（見下方 data-bind）
 * 時間與格式（一律以 UTC+8 計算；「現在」= 2026-10-23（五）18:52 起持續走動）
 *   App.now() → ms · App.time('2026-10-23T18:58') → ms · App.parts(ms) → {y, m, d, h, min, s, dow}
 *   App.fmt.num / money / signed / wan / date / dateWeek / dateLong / weekday / time / dateTime / rel / mmss
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(str) · App.icon(name, {cls, sw, label}) · App.ICON_NAMES
 *   App.qrSVG(seed, {n, animate, label}) 偽 QR 碼（同 seed 同圖，animate 時模組依對角線波浪彈出）
 *   App.ring(value, max, {size, stroke, label, cls}) 漸層進度環 · App.setRing(svg, value, max)
 *   App.emptyState({art:'search'|'list'|'bell', title, text, actions}) 空狀態
 *   App.garbageMap({labels, stopLabels, viewBox, slice, cls, title}) 北岸 2 線街區地圖 SVG（slice=true 時填滿容器裁切）
 * 垃圾車模擬（依時刻表內插位置，四頁共用同一套）
 *   App.garbage.truck(t?) → {x, y, dist, total, status:'before'|'running'|'done'|'off', next(stop)}
 *   App.garbage.eta(stopId, t?) → 距離表定到站的秒數（負數 = 已過站）
 *   App.garbage.stop(id) · App.garbage.stopDist(id) · App.garbage.setTruck(svg, dist) 在地圖上擺車與軌跡
 *   App.garbage.measure  路線量測結果 {pts, cum, total}
 *   App.polyline.measure(points) / .at(measure, dist) → {x, y, angle}
 * 互動元件
 *   App.toast(title, {desc, tone:'info'|'ok'|'warn'|'danger', icon, action:{label, onClick}, duration}) → {dismiss}
 *     toast 容器會自動移進目前開啟的 modal dialog（top layer），關閉後移回 body。
 *   App.modal({title, eyebrow, body(html|Node), actions:[{label, variant, onClick(close), autofocus}], size:'sm'|'md'|'lg', onClose, returnFocus}) → {el, body, close}
 *     returnFocus: () => Element，開啟它的按鈕在 modal 期間被重繪換掉時，關閉後改把焦點交給這個元素
 *   App.openDialog(dialogEl) / App.closeDialog(dialogEl)  頁面內預先寫好的 <dialog class="modal">
 *   App.seg(el, {onChange(value, index, btn)}) → {select(i|btn), value(), refresh()}
 *   App.tabs(el, {onChange(index, tab)}) → {select(i), index(), refresh()}
 *     兩者都會在容器上發出 'cp:change' 事件（detail: {value, index, button}）
 *   App.odometer(el, value, {format, reset}) 數字滾輪（連續快速呼叫安全；動畫執行當下讀最新值；reset 時從 0 滾起）
 *   App.countUp(el, to, {duration, format})
 *   App.theme.pref() / resolved() / set('auto'|'light'|'dark', originEvent?) / toggle(originEvent?)；切換時 document 發出 'cp:theme'
 *   App.inView(el, cb(visible), {threshold, rootMargin}) → disconnect()
 *   App.loop(fn(dt, t)) → {start(), stop(), running}  rAF 迴圈，分頁隱藏時自動暫停；fn 回傳 false 即停止
 *   App.every(ms, fn) → stop()  分頁隱藏時跳過的 interval
 *   App.reveal(root) / App.hydrate(root)  動態插入內容後重新掃描（icons、bind、reveal、tilt、demo、seg/tabs、accordion、range、search）
 *   App.scrollSpy(navEl) → {update()}  次導覽依捲動位置標示目前段落（[data-scrollspy] 自動套用）
 *   App.param(name)  讀取網址 query（例如 services.html?cat=transit）
 * 自動行為（寫好 markup 即生效）
 *   [data-icon="name"]（空元素內塞 SVG；在 .app-icon 內自動用粗線）
 *   [data-bind="transit.balance"][data-format="money"]（資料變動時自動重繪；加 data-odo 則用數字滾輪）
 *     計算欄位：services.count、parking.dueCount、parking.dueTotal、library.loanCount、library.nextDue、
 *              user.toNextTier、user.tierPct、consents.granted、bindings.bound
 *     data-format：num（預設）、money、signed、wan、dec1（一位小數）、date、dateWeek、text、pct
 *   [data-count-to="40"][data-format]（進入視窗時從 0 數上去；元素原本的文字就寫最終值）
 *   [data-reveal]（捲動進場；同批進場自動錯開；初次載入已在視窗內者直接顯示；保底：捲過即顯示）
 *   [data-tilt]（滑鼠 3D 傾斜＋光暈，寫入 --mx/--my；可給數值當最大角度）
 *   [data-demo]（滑鼠移入 / 鍵盤聚焦 / 觸控裝置進入視窗 60% 時加 .is-live 並發出 'cp:demo' 事件 detail.active；
 *               桌機第一次進入視窗時會自動「試播」2.6 秒）
 *   [data-anim]（離開視窗時加 .is-paused 暫停 CSS 動畫）、分頁隱藏時 <html> 加 .is-hidden 暫停全部 CSS 動畫
 *   [data-seg] / [data-tabs] 自動初始化 · details.acc 開合動畫（.acc-group[data-acc-single] 同時只開一個）
 *   input.range 填色 · .search 清除鈕 · [data-clock="time|dateWeek"] 時鐘
 *   [data-toast="訊息"][data-toast-desc][data-toast-tone] 點擊顯示 toast
 *   [data-legal="privacy|terms|a11y"] 開啟條款 modal · [data-open-dialog="id"] / [data-close-dialog]
 *   [data-theme-toggle] 深淺切換鈕 · [data-theme-option="auto|light|dark"]（放在 .seg 內）
 *   [data-menu-toggle][aria-controls] 行動版選單 · 導覽 active 與 aria-current 依檔名自動標示
 *   指向本頁的 #錨點連結自動平滑捲動（style.css 刻意不設 scroll-behavior: smooth）
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  const emit = (name, detail, target = document) => target.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

  document.documentElement.classList.add('cp-js');

  /* ------------------------------------------------------------------
   * 時間：固定以 UTC+8 計算，與瀏覽器時區無關
   * ------------------------------------------------------------------ */
  const TZ_OFFSET = 8 * 3600 * 1000;
  const BASE = Date.UTC(2026, 9, 23, 10, 52, 0); // 2026-10-23（五）18:52（UTC+8）
  const T0 = performance.now();
  const now = () => BASE + (performance.now() - T0);
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const pad = (n) => String(n).padStart(2, '0');
  function parts(ms) {
    const d = new Date(ms + TZ_OFFSET);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() };
  }
  function time(str) {
    const [date, clock = '00:00'] = String(str).split('T');
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = clock.split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh - 8, mm);
  }
  const toMs = (v) => (typeof v === 'number' ? v : time(v));
  const minutesOfDay = (ms) => (((ms + TZ_OFFSET) % 86400000) + 86400000) % 86400000 / 60000;

  const fmt = {
    num: (n, d = 0) => Number(n).toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }),
    money: (n) => (n < 0 ? '−' : '') + 'NT$ ' + fmt.num(Math.abs(n)),
    signed: (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt.num(Math.abs(n)),
    wan: (n, d = 1) => fmt.num(n / 10000, d) + ' 萬',
    pct: (n) => fmt.num(n) + '%',
    date: (v) => { const p = parts(toMs(v)); return `${p.m}/${p.d}`; },
    dateWeek: (v) => { const p = parts(toMs(v)); return `${p.m}/${p.d}（${WEEK[p.dow]}）`; },
    dateLong: (v) => { const p = parts(toMs(v)); return `${p.y} 年 ${p.m} 月 ${p.d} 日`; },
    weekday: (v) => '週' + WEEK[parts(toMs(v)).dow],
    time: (v) => { const p = parts(toMs(v)); return `${pad(p.h)}:${pad(p.min)}`; },
    dateTime: (v) => `${fmt.date(v)} ${fmt.time(v)}`,
    mmss: (sec) => { const s = Math.max(0, Math.round(sec)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; },
    rel(v) {
      const ms = toMs(v);
      const diff = (now() - ms) / 1000;
      if (diff < 60) return '剛剛';
      if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
      const a = parts(now()), b = parts(ms);
      if (a.y === b.y && a.m === b.m && a.d === b.d) return `${Math.floor(diff / 3600)} 小時前`;
      const days = Math.round((time(`${a.y}-${a.m}-${a.d}`) - time(`${b.y}-${b.m}-${b.d}`)) / 86400000);
      if (days === 1) return `昨天 ${fmt.time(ms)}`;
      if (days < 7) return `${days} 天前`;
      return fmt.date(ms);
    },
  };
  const FORMATS = {
    num: (v) => fmt.num(v),
    money: (v) => fmt.money(v),
    signed: (v) => fmt.signed(v),
    wan: (v) => fmt.wan(v),
    pct: (v) => fmt.pct(v),
    dec1: (v) => fmt.num(v, 1),
    date: (v) => fmt.date(v),
    dateWeek: (v) => fmt.dateWeek(v),
    text: (v) => String(v),
  };

  /* ------------------------------------------------------------------
   * 資料
   * ------------------------------------------------------------------ */
  const CATS = [
    { id: 'transit', name: '交通', full: '交通出行', icon: 'bus' },
    { id: 'life', name: '生活', full: '生活便民', icon: 'home' },
    { id: 'health', name: '健康', full: '醫療健康', icon: 'heart-pulse' },
    { id: 'pay', name: '繳費', full: '繳費服務', icon: 'receipt' },
    { id: 'culture', name: '文化', full: '文化休閒', icon: 'ticket' },
  ];

  const DATA = {
    user: {
      name: '林語彤',
      shortName: '語彤',
      district: '北岸區',
      cardNo: '8860 2611 0927 4415',
      tier: '銀級市民',
      nextTier: '金級市民',
      tierGoal: 5000,
      points: 2860,
      weekPoints: 120,
      expiring: { points: 320, date: '2026-12-31' },
      since: '2023-03-14',
      phone: '0912-***-678',
    },
    transit: {
      card: '澄港通卡',
      cardNo: '3392 1047 5520 4415',
      balance: 486,
      cap: 10000,
      autoTopup: { enabled: true, threshold: 100, amount: 500 },
      monthSpent: 1240,
      trips: [
        { id: 'T-1023-03', t: '2026-10-23T17:58', mode: 'bike', title: '澄港單車', detail: '河濱公園站 → 北岸轉運站', amount: -10 },
        { id: 'T-1023-02', t: '2026-10-23T12:40', mode: 'bus', title: '公車 217', detail: '舊城區公所 → 北岸國小', amount: -15 },
        { id: 'T-1023-01', t: '2026-10-23T08:12', mode: 'metro', title: '捷運 藍線', detail: '北岸站 → 港埕站', amount: -25 },
        { id: 'T-1022-04', t: '2026-10-22T19:05', mode: 'ferry', title: '港埕—北岸渡輪', detail: '港埕碼頭 → 北岸碼頭', amount: -30 },
      ],
    },
    bikeStations: [
      { id: 'CB-0412', name: '河濱公園站', district: '北岸區', dist: 180, bikes: 12, ebikes: 3, docks: 8 },
      { id: 'CB-0398', name: '北岸轉運站', district: '北岸區', dist: 420, bikes: 5, ebikes: 1, docks: 23 },
      { id: 'CB-0455', name: '漁會大樓站', district: '北岸區', dist: 650, bikes: 17, ebikes: 4, docks: 3 },
    ],
    parking: {
      plate: 'BXR-2071',
      autoPay: false,
      pointsRate: 10, // 每 NT$ 10 回饋 1 點
      bills: [
        { id: 'PK-2610-88213', place: '舊城區 中正路路邊停車格', date: '2026-10-20', duration: '2 小時 10 分', amount: 80, due: '2026-11-03', paid: false },
        { id: 'PK-2610-90457', place: '港埕區 漁人碼頭停車場', date: '2026-10-22', duration: '1 小時 30 分', amount: 60, due: '2026-11-05', paid: false },
      ],
    },
    clinic: {
      hospital: '澄港市立聯合醫院 北岸院區',
      dept: '家庭醫學科',
      doctor: '許文謙 醫師',
      room: '第 12 診',
      days: [
        { date: '2026-10-26', slots: { '09:00': 0, '09:30': 3, '10:00': 5, '14:00': 2, '14:30': 6, '15:00': 1 } },
        { date: '2026-10-27', slots: { '09:00': 4, '09:30': 2, '10:00': 0, '14:00': 0, '14:30': 3, '15:00': 5 } },
        { date: '2026-10-28', slots: { '09:00': 6, '09:30': 6, '10:00': 4, '14:00': 3, '14:30': 1, '15:00': 0 } },
        { date: '2026-10-29', slots: { '09:00': 1, '09:30': 0, '10:00': 0, '14:00': 4, '14:30': 4, '15:00': 2 } },
        { date: '2026-10-30', slots: { '09:00': 5, '09:30': 3, '10:00': 2, '14:00': 6, '14:30': 5, '15:00': 3 } },
      ],
      booking: null,
    },
    library: {
      branch: '澄港市立圖書館 北岸分館',
      cardNo: 'L-0927-4415',
      maxRenewals: 2,
      renewDays: 14,
      loans: [
        { id: 'BK-20817', title: '港口的潮汐', author: '沈若蘅', due: '2026-10-30', renewals: 0, color: '#E9B44C' },
        { id: 'BK-31220', title: '城市的第二層皮膚', author: '柯以樂', due: '2026-11-06', renewals: 1, color: '#5B8DEF' },
        { id: 'BK-11873', title: '給孩子的海洋圖鑑', author: '澄港海洋生態協會', due: '2026-11-11', renewals: 0, color: '#3FB984' },
      ],
      holds: [{ id: 'BK-40562', title: '夜行的鹽田', author: '韓靜知', status: '已到館', pickupBy: '2026-10-29', color: '#E46C6C' }],
    },
    garbage: {
      route: '北岸 2 線',
      district: '北岸區',
      plate: 'KEA-3021',
      team: '北岸區清潔隊 第三分隊',
      depart: '18:30',
      days: [1, 2, 4, 5, 6], // 週三、週日停收
      myStop: 'S4',
      points: [[80, 70], [140, 70], [320, 70], [320, 110], [320, 160], [260, 160], [200, 160], [200, 220], [200, 250], [330, 250], [440, 250], [440, 205], [440, 160], [540, 160], [540, 190], [540, 250]],
      stops: [
        { id: 'S1', name: '北岸國小', addr: '北岸大道 120 號（校門口）', v: 1, time: '18:34', lx: 0, ly: -16, anchor: 'middle' },
        { id: 'S2', name: '漁會大樓', addr: '漁會街 26 號前', v: 3, time: '18:41', lx: 14, ly: 4, anchor: 'start' },
        { id: 'S3', name: '和平市場', addr: '和平路 112 號（市場側門）', v: 5, time: '18:47', lx: 0, ly: -14, anchor: 'middle' },
        { id: 'S4', name: '紅樹林社區', addr: '紅樹林街 8 巷口', v: 7, time: '18:58', lx: -16, ly: 5, anchor: 'end' },
        { id: 'S5', name: '燈塔里活動中心', addr: '河濱路 210 號', v: 9, time: '19:06', lx: 0, ly: 24, anchor: 'middle' },
        { id: 'S6', name: '河濱公園', addr: '燈塔路三段（公園東門）', v: 11, time: '19:14', lx: -14, ly: 4, anchor: 'end' },
        { id: 'S7', name: '長榮新村', addr: '長榮街 45 號', v: 14, time: '19:22', lx: 14, ly: 4, anchor: 'start' },
        { id: 'S8', name: '港濱停車場', addr: '河濱路與長榮街口', v: 15, time: '19:30', lx: 0, ly: 24, anchor: 'middle' },
      ],
      // 0=日 … 6=六；空陣列為停收日
      recycle: {
        0: [],
        1: ['紙類', '紙容器'],
        2: ['塑膠類', '鐵鋁罐', '玻璃瓶'],
        3: [],
        4: ['紙類', '舊衣', '乾電池'],
        5: ['塑膠類', '鐵鋁罐', '玻璃瓶', '保麗龍'],
        6: ['紙類', '紙容器', '小家電'],
      },
      map: {
        w: 600,
        h: 330,
        xs: [0, 80, 200, 320, 440, 540, 600],
        ys: [0, 70, 160, 250],
        roads: ['M0 70H600', 'M0 160H600', 'M0 250H600', 'M80 0V330', 'M200 0V330', 'M320 0V330', 'M440 0V330', 'M540 0V330'],
        minor: ['M80 115H320', 'M440 115H600', 'M200 205H440', 'M260 70V160', 'M380 160V250', 'M500 70V160', 'M0 205H80', 'M140 0V70', 'M380 0V70'],
        water: 'M0 282C70 274 130 292 210 289S350 272 430 280 560 296 600 284V330H0Z',
        parks: [{ x: 452, y: 172, w: 76, h: 66, name: '北岸公園' }, { x: 92, y: 172, w: 96, h: 22, name: '' }],
        skipBlocks: ['4-2'],
        labels: [
          { x: 590, y: 62, text: '北岸大道', anchor: 'end' },
          { x: 12, y: 152, text: '和平路', anchor: 'start' },
          { x: 12, y: 242, text: '河濱路', anchor: 'start' },
          { x: 300, y: 318, text: '澄港灣', anchor: 'middle', water: true },
        ],
      },
    },
    services: [
      // 交通
      { id: 'transit-card', cat: 'transit', name: '交通卡餘額與加值', desc: '查餘額、線上加值、設定自動加值，乘車紀錄即時同步。', icon: 'card', users: 128400, login: true, isNew: false, href: null },
      { id: 'bus', cat: 'transit', name: '公車到站動態', desc: '全市 86 條公車路線的即時到站時間與車廂擁擠度。', icon: 'bus', users: 211300, login: false, isNew: false, href: null },
      { id: 'metro', cat: 'transit', name: '捷運乘車碼', desc: '免掏卡，以手機 QR 碼進出澄港捷運藍線與橘線。', icon: 'train', users: 97800, login: true, isNew: false, href: null },
      { id: 'bike', cat: 'transit', name: '澄港單車', desc: '342 個站點即時可借、可還數量，掃碼即可租借。', icon: 'bike', users: 96200, login: true, isNew: false, href: null },
      { id: 'parking-pay', cat: 'transit', name: '路邊停車繳費', desc: '輸入車牌查詢待繳停車單，綁定後可一鍵繳清。', icon: 'parking', users: 84300, login: true, isNew: false, href: null },
      { id: 'parking-spaces', cat: 'transit', name: '停車場即時空位', desc: '128 座公有停車場的剩餘車位、費率與導航。', icon: 'car', users: 61200, login: false, isNew: false, href: null },
      { id: 'ferry', cat: 'transit', name: '港埕—北岸渡輪', desc: '渡輪時刻、船班動態與電子船票，碼頭免排隊。', icon: 'ship', users: 23900, login: true, isNew: true, href: null },
      { id: 'tow', cat: 'transit', name: '拖吊查詢', desc: '輸入車牌查詢是否遭拖吊，以及保管場位置與費用。', icon: 'tow', users: 8400, login: false, isNew: false, href: null },
      // 生活
      { id: 'garbage', cat: 'life', name: '垃圾車動態', desc: '垃圾車即時位置、各站預估時間與到站提醒。', icon: 'truck', users: 152700, login: false, isNew: false, href: 'service.html' },
      { id: 'recycle', cat: 'life', name: '資源回收日曆', desc: '依行政區顯示每日回收項目與停收日。', icon: 'recycle', users: 74100, login: false, isNew: false, href: 'service.html#calendar' },
      { id: 'bulky', cat: 'life', name: '大型廢棄物清運', desc: '線上預約家具、床墊等大型廢棄物到府清運。', icon: 'sofa', users: 12600, login: true, isNew: false, href: null },
      { id: 'report', cat: 'life', name: '市容與道路通報', desc: '拍照回報坑洞、路燈故障，處理進度即時推播。', icon: 'megaphone', users: 33800, login: true, isNew: false, href: null },
      { id: 'outage', cat: 'life', name: '停水停電公告', desc: '依住址訂閱計畫性停水、停電與道路施工通知。', icon: 'bolt', users: 41500, login: false, isNew: false, href: null },
      { id: 'air', cat: 'life', name: '空氣品質與天氣', desc: '8 個行政區的即時 AQI、紫外線與降雨機率。', icon: 'cloud-sun', users: 88600, login: false, isNew: false, href: null },
      { id: 'pet', cat: 'life', name: '寵物登記與認養', desc: '晶片登記、狂犬病疫苗提醒與收容所線上認養。', icon: 'paw', users: 9700, login: true, isNew: false, href: null },
      { id: 'venue', cat: 'life', name: '運動場地預約', desc: '羽球場、籃球場與游泳池的線上預約與付款。', icon: 'ball', users: 27400, login: true, isNew: false, href: null },
      { id: 'lost', cat: 'life', name: '失物招領', desc: '公車、捷運、渡輪與市府場館的遺失物查詢。', icon: 'box', users: 6800, login: false, isNew: false, href: null },
      // 健康
      { id: 'clinic', cat: 'health', name: '市立醫院預約掛號', desc: '3 家市立醫院、42 個科別的線上掛號與取消。', icon: 'stethoscope', users: 63900, login: true, isNew: false, href: null },
      { id: 'clinic-queue', cat: 'health', name: '看診進度', desc: '即時叫號，輪到前 5 號時推播提醒你出發。', icon: 'queue', users: 58200, login: false, isNew: false, href: null },
      { id: 'vaccine', cat: 'health', name: '疫苗接種預約', desc: '流感、肺炎鏈球菌等公費疫苗的接種預約。', icon: 'syringe', users: 19800, login: true, isNew: false, href: null },
      { id: 'senior-check', cat: 'health', name: '長者健康檢查', desc: '65 歲以上市民免費健檢的名額查詢與報告下載。', icon: 'heart-pulse', users: 7600, login: true, isNew: false, href: null },
      { id: 'pharmacy', cat: 'health', name: '夜間藥局與急診', desc: '附近營業中的藥局，以及各急診室等候人數。', icon: 'pill', users: 22400, login: false, isNew: false, href: null },
      { id: 'gym', cat: 'health', name: '運動中心課程', desc: '5 座國民運動中心的課表、名額與線上報名。', icon: 'dumbbell', users: 18300, login: true, isNew: false, href: null },
      { id: 'ltc', cat: 'health', name: '長照服務申請', desc: '居家照顧、日間照顧與交通接送的線上申請與進度查詢。', icon: 'heart', users: 12900, login: true, isNew: false, href: null },
      { id: 'counsel', cat: 'health', name: '心理健康諮詢', desc: '免費心理諮商預約，全程保密、可選視訊會談。', icon: 'chat-heart', users: 4100, login: true, isNew: true, href: null },
      // 繳費
      { id: 'water', cat: 'pay', name: '水費帳單', desc: '查詢帳單、申請電子帳單與線上繳費。', icon: 'droplet', users: 39600, login: true, isNew: false, href: null },
      { id: 'house-tax', cat: 'pay', name: '房屋稅與地價稅', desc: '查繳稅單、申請電子稅單與分期繳納。', icon: 'house', users: 26100, login: true, isNew: false, href: null },
      { id: 'vehicle-tax', cat: 'pay', name: '使用牌照稅', desc: '依車牌查詢應繳稅額，下載繳納證明。', icon: 'car', users: 14800, login: true, isNew: false, href: null },
      { id: 'fines', cat: 'pay', name: '交通罰鍰', desc: '查詢違規紀錄，以信用卡或帳戶線上繳納。', icon: 'fine', users: 21700, login: true, isNew: false, href: null },
      { id: 'certificates', cat: 'pay', name: '證明書與規費', desc: '戶籍、地籍謄本線上申請與規費繳納。', icon: 'file-text', users: 16900, login: true, isNew: false, href: null },
      { id: 'school-fee', cat: 'pay', name: '學雜費與午餐費', desc: '市立國中小與幼兒園各項費用繳納。', icon: 'graduation', users: 11200, login: true, isNew: false, href: null },
      { id: 'auto-debit', cat: 'pay', name: '自動扣繳設定', desc: '一次設定水費、停車費與稅款的扣繳帳戶。', icon: 'repeat', users: 9300, login: true, isNew: false, href: null },
      // 文化
      { id: 'library', cat: 'culture', name: '圖書借閱與續借', desc: '全市 14 間分館館藏查詢、預約與一鍵續借。', icon: 'book', users: 71500, login: true, isNew: false, href: null },
      { id: 'tickets', cat: 'culture', name: '展演購票', desc: '澄港文化中心、港埕音樂廳節目與電子票券。', icon: 'ticket', users: 26700, login: true, isNew: false, href: null },
      { id: 'museum', cat: 'culture', name: '美術館預約參觀', desc: '澄港市立美術館特展時段預約與語音導覽。', icon: 'frame', users: 15300, login: true, isNew: false, href: null },
      { id: 'salt-museum', cat: 'culture', name: '鹽田考古遺址博物館', desc: '參觀預約、導覽場次與線上典藏查詢。', icon: 'amphora', users: 8900, login: true, isNew: false, href: null },
      { id: 'events', cat: 'culture', name: '市民活動行事曆', desc: '節慶、市集與運動賽事，一個月曆全部看。', icon: 'calendar-star', users: 43200, login: false, isNew: false, href: null },
      { id: 'points', cat: 'culture', name: '市民卡點數兌換', desc: '以點數折抵停車費、兌換場館門票與課程。', icon: 'gift', users: 37900, login: true, isNew: false, href: 'account.html#points' },
      { id: 'heritage', cat: 'culture', name: '舊城區文化散步', desc: '18 條語音導覽路線與老屋開放時間。', icon: 'landmark', users: 6200, login: false, isNew: false, href: null },
      { id: 'lectures', cat: 'culture', name: '市民講堂', desc: '每月 30 場免費講座，線上報名與講義下載。', icon: 'mic', users: 5400, login: true, isNew: false, href: null },
    ],
    bindings: [
      { id: 'b-transit', name: '澄港通卡', detail: '卡號末四碼 4415 · 自動加值', icon: 'card', cat: 'transit', bound: true, since: '2023-03-14' },
      { id: 'b-plate', name: '車牌 BXR-2071', detail: '停車單通知、拖吊查詢', icon: 'car', cat: 'transit', bound: true, since: '2023-08-09' },
      { id: 'b-library', name: '圖書館借書證', detail: 'L-0927-4415 · 北岸分館', icon: 'book', cat: 'culture', bound: true, since: '2023-03-14' },
      { id: 'b-clinic', name: '市立醫院病歷號', detail: '綁定後可直接掛號、查看診進度', icon: 'stethoscope', cat: 'health', bound: false, since: null },
      { id: 'b-water', name: '水費帳號', detail: '綁定後每期帳單自動通知', icon: 'droplet', cat: 'pay', bound: false, since: null },
    ],
    consents: [
      { id: 'c-bike', app: '澄港單車', icon: 'bike', cat: 'transit', fields: ['交通卡號', '餘額'], granted: true, since: '2024-05-02', lastUsed: '2026-10-23T17:58' },
      { id: 'c-library', app: '市立圖書館', icon: 'book', cat: 'culture', fields: ['姓名', '借書證號'], granted: true, since: '2023-03-14', lastUsed: '2026-10-21T15:20' },
      { id: 'c-parking', app: '停車管理處', icon: 'parking', cat: 'transit', fields: ['車牌號碼', '手機號碼'], granted: true, since: '2023-08-09', lastUsed: '2026-10-22T19:05' },
      { id: 'c-gym', app: '北岸國民運動中心', icon: 'dumbbell', cat: 'health', fields: ['姓名', '出生年'], granted: false, since: null, lastUsed: '2026-02-11T09:00' },
    ],
  };

  const unpaidBills = () => DATA.parking.bills.filter((b) => !b.paid);
  const COMPUTED = {
    'services.count': () => DATA.services.length,
    'parking.dueCount': () => unpaidBills().length,
    'parking.dueTotal': () => unpaidBills().reduce((s, b) => s + b.amount, 0),
    'library.loanCount': () => DATA.library.loans.length,
    'library.nextDue': () => Math.min(...DATA.library.loans.map((l) => time(l.due))),
    'user.toNextTier': () => Math.max(0, DATA.user.tierGoal - DATA.user.points),
    'user.tierPct': () => Math.round((DATA.user.points / DATA.user.tierGoal) * 100),
    'consents.granted': () => DATA.consents.filter((c) => c.granted).length,
    'bindings.bound': () => DATA.bindings.filter((b) => b.bound).length,
  };
  function value(path) {
    if (COMPUTED[path]) return COMPUTED[path]();
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), DATA);
    if (v === undefined) throw new Error(`App.value: unknown path "${path}"`);
    return v;
  }
  function formatter(name) {
    const f = FORMATS[name || 'num'];
    if (!f) throw new Error(`App: unknown format "${name}"`);
    return f;
  }
  function bindAll(root = document) {
    $$('[data-bind]', root).forEach((el) => {
      const v = value(el.dataset.bind);
      if ('odo' in el.dataset) odometer(el, v, { format: el.dataset.format });
      // 數字正在 countUp 時只改目標值：直接寫 textContent 會被下一格蓋掉，動畫結束時停在舊值
      else if (el._countActive) el._countTarget = v;
      else el.textContent = formatter(el.dataset.format)(v);
    });
  }
  function update(key, mutate) {
    if (!(key in DATA)) throw new Error(`App.update: unknown data key "${key}"`);
    mutate(DATA[key]);
    bindAll();
    emit('cp:data', { key });
  }

  /* ------------------------------------------------------------------
   * 圖示（24×24、圓角線條；顏色走 currentColor）
   * ------------------------------------------------------------------ */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
    'chevron-left': '<path d="M14.5 6l-6 6 6 6"/>',
    'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-up-right': '<path d="M7 17L17 7M8 7h9v9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
    bell: '<path d="M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.4M6.4 6.5C3.9 8.2 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.7-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    fingerprint: '<path d="M12 11v3.5c0 2.3-.6 4.4-1.7 6.1"/><path d="M8.6 12.5c0-1.9 1.5-3.4 3.4-3.4s3.4 1.5 3.4 3.4v1.5c0 2-.4 3.9-1.1 5.6"/><path d="M5.6 15.5c.3-1 .4-2 .4-3a6 6 0 0 1 12 0v1.2"/><path d="M4.2 9.2A8.5 8.5 0 0 1 19.7 8"/>',
    face: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.5 1.2 3.5 1.2 5 0"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4M16 7l2.5 2.5M14 9l2 2"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h.01M20 14h.01"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M16 13.5h.01"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    'map-pin': '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
    navigation: '<path d="M4 11l16-7-7 16-2-7z"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    'calendar-star': '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><path d="M12 12.4l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 18.5h18"/>',
    tablet: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M11 18h2"/>',
    watch: '<rect x="6.5" y="6.5" width="11" height="11" rx="3"/><path d="M9 6.5l.5-3h5l.5 3M9 17.5l.5 3h5l.5-3M12 10v2.2l1.4 1"/>',
    logout: '<path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M10.3 4.3L2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
    'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8"/>',
    'x-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
    'plus-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    sparkle: '<path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z"/>',
    accessibility: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5l-3 6M12 14.5l3 6"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19z"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10z"/>',
    'heart-pulse': '<path d="M12 19.5s-7.5-4.4-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10z"/><path d="M6.5 12h3l1.5-2.5 2 4.5 1.5-2h3"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    unlink: '<path d="M15.7 14l3-3a4 4 0 0 0-5.7-5.7l-1 1M8.3 10l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16"/>',
    trash: '<path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-12"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    edit: '<path d="M15 5l4 4L9 19H5v-4z"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9M12 8v4l3 2"/>',
    receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    fine: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M12 8v4.5M12 15.5h.01"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
    message: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5a2 2 0 0 1-1.5-2z"/>',
    bus: '<rect x="5" y="3.5" width="14" height="14" rx="3"/><path d="M5 10.5h14M8 17.5V20M16 17.5V20M8.5 14h.01M15.5 14h.01"/>',
    train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12M9 20.5l1.5-3.5M15 20.5l-1.5-3.5M9.5 13.5h.01M14.5 13.5h.01"/>',
    bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l3.5-7h6L18 16M9.5 9L12 16l3.5-7M8 6.5h3M15 6.5h2"/>',
    parking: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 16.5v-9h3a2.75 2.75 0 0 1 0 5.5h-3"/>',
    car: '<path d="M5 16.5v2M19 16.5v2M4 16.5v-4.2l2-5A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.3l2 5v4.2z"/><path d="M4 12.3h16M7.5 14.5h.01M16.5 14.5h.01"/>',
    ship: '<path d="M4 15.5l1.5 4h13l1.5-4-8-3z"/><path d="M7 13.4V8.5h10v4.9M12 8.5V4.5M10 4.5h4"/>',
    tow: '<path d="M4 18.5v-4.2l1.6-3.6a1.8 1.8 0 0 1 1.6-1.2h9.6a1.8 1.8 0 0 1 1.6 1.2l1.6 3.6v4.2z"/><path d="M12 9.5V3.5M9.5 6L12 3.5 14.5 6"/>',
    truck: '<rect x="3" y="6.5" width="11" height="10" rx="1.5"/><path d="M14 9.5h3.5l3 3.5v3.5H14"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    recycle: '<path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3M4.5 12a7.5 7.5 0 0 1 12.8-5.3"/><path d="M17.5 3.5v3.3h-3.3M6.5 20.5v-3.3h3.3"/>',
    sofa: '<path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11"/><path d="M3.5 13a2 2 0 0 1 4 0v1.5h9V13a2 2 0 0 1 4 0v4.5h-17zM5.5 17.5v2M18.5 17.5v2"/>',
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5v-15L7 9H5a1 1 0 0 0-1 1z"/><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5M8 15l1 4.5"/>',
    bolt: '<path d="M13 3L5 13.5h6l-1 7.5 8-10.5h-6z"/>',
    'cloud-sun': '<path d="M8 3.5v1M3.5 8h1M4.8 4.8l.7.7M11.2 4.8l-.7.7"/><path d="M5.3 10.6A3.3 3.3 0 1 1 11 7.4"/><path d="M8.5 19.5h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2 3 3 0 0 0 .2 5.8z"/>',
    paw: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6.3" r="1.8"/><circle cx="14" cy="6.3" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M12 11.5c-2.4 0-5 3.6-5 6a2.5 2.5 0 0 0 3 2.4 7 7 0 0 1 4 0 2.5 2.5 0 0 0 3-2.4c0-2.4-2.6-6-5-6z"/>',
    ball: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5v17M6 6c2.4 2 3.5 4 3.5 6S8.4 16 6 18M18 6c-2.4 2-3.5 4-3.5 6s1.1 4 3.5 6"/>',
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="3.5" y="13" width="4" height="6" rx="1.5"/><rect x="16.5" y="13" width="4" height="6" rx="1.5"/><path d="M18.5 19c0 1.4-1.6 2-4 2h-2"/>',
    box: '<path d="M4 7.5l8-4 8 4v9l-8 4-8-4z"/><path d="M4 7.5l8 4 8-4M12 11.5v9"/>',
    stethoscope: '<path d="M6 3.5v5a4 4 0 0 0 8 0v-5"/><path d="M10 12.5v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="10.5" r="2"/>',
    queue: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2.5 2.5 0 0 0 0-5z"/><path d="M10.5 9.5l-1 5M14.5 9.5l-1 5M8.8 11h6.5M8.2 13h6.5"/>',
    ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5v-2a2.5 2.5 0 0 0 0-5z"/><path d="M14.5 6v2M14.5 11v2M14.5 16v2"/>',
    syringe: '<path d="M17 3.5l3.5 3.5M18.75 5.25L15 9"/><path d="M14 7l3 3-8 8H6v-3z"/><path d="M6 18l-2.5 2.5M10 11l1.5 1.5M8 13l1.5 1.5"/>',
    pill: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    dumbbell: '<path d="M8 12h8"/><rect x="4.5" y="7.5" width="3.5" height="9" rx="1"/><rect x="16" y="7.5" width="3.5" height="9" rx="1"/><path d="M2.5 10v4M21.5 10v4"/>',
    'chat-heart': '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5z"/><path d="M12.5 14.5s-3-1.7-3-3.7a1.5 1.5 0 0 1 3-.6 1.5 1.5 0 0 1 3 .6c0 2-3 3.7-3 3.7z"/>',
    droplet: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
    house: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9v10.5h12V9"/><path d="M10 19.5v-5h4v5"/>',
    'file-text': '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 12.5h6M9 16h4"/>',
    graduation: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.5 3.5 2.5 5.5 2.5s4-1 5.5-2.5V11M21.5 9v5"/>',
    repeat: '<path d="M17 3.5l3 3-3 3"/><path d="M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20M7 20.5l-3-3 3-3"/><path d="M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/>',
    frame: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="8.5" r="1.5"/>',
    amphora: '<path d="M9.5 3.5h5M10 3.5v2.2c-2.8 1.3-4.5 4.2-4.5 7.3 0 3 1.6 5.6 4 7.5h5c2.4-1.9 4-4.5 4-7.5 0-3.1-1.7-6-4.5-7.3V3.5"/><path d="M6 11h12"/>',
    gift: '<rect x="4" y="9" width="16" height="11.5" rx="1.5"/><path d="M3 9h18M12 9v11.5"/><path d="M12 9S10.5 4 8 4.5 7.5 9 12 9zM12 9s1.5-5 4-4.5S16.5 9 12 9z"/>',
    landmark: '<path d="M3.5 20.5h17M5 17.5h14M6 10v7.5M10 10v7.5M14 10v7.5M18 10v7.5M3.5 10h17L12 4z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  };
  function icon(name, { cls = '', sw = 1.75, label = '' } = {}) {
    const body = ICONS[name];
    if (!body) throw new Error(`App.icon: unknown icon "${name}"`);
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
    return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${a11y} focusable="false">${body}</svg>`;
  }
  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((el) => {
      if (el.firstElementChild) return;
      const inAppIcon = el.classList.contains('app-icon') || !!el.closest('.app-icon');
      el.innerHTML = icon(el.dataset.icon, { sw: Number(el.dataset.sw) || (inAppIcon ? 2.1 : 1.75) });
    });
  }

  /* 共用 SVG 漸層：環、路線、空狀態都用 url(#cp-grad…) 參照 */
  function injectDefs() {
    if (document.getElementById('cp-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = '<svg id="cp-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">'
      + '<defs>'
      + '<linearGradient id="cp-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B5BF6"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>'
      + '<linearGradient id="cp-grad-map" gradientUnits="userSpaceOnUse" x1="80" y1="0" x2="540" y2="0"><stop offset="0" stop-color="#5B5BF6"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>'
      + '</defs></svg>';
    document.body.prepend(holder.firstChild);
  }

  /* ------------------------------------------------------------------
   * 主題：自動 / 淺色 / 深色；切換時以 View Transition 從點擊處圓形擴散
   * ------------------------------------------------------------------ */
  const THEME_KEY = 'citypass-theme';
  let themeTransition = null;
  const theme = {
    pref: () => document.documentElement.dataset.theme || 'auto',
    resolved() {
      const p = theme.pref();
      return p === 'auto' ? (sysDark.matches ? 'dark' : 'light') : p;
    },
    set(pref, originEvent) {
      if (!['auto', 'light', 'dark'].includes(pref)) throw new Error(`App.theme.set: unknown theme "${pref}"`);
      const apply = () => {
        if (pref === 'auto') {
          delete document.documentElement.dataset.theme;
          localStorage.removeItem(THEME_KEY);
        } else {
          document.documentElement.dataset.theme = pref;
          localStorage.setItem(THEME_KEY, pref);
        }
        syncThemeControls();
        emit('cp:theme', { pref, resolved: theme.resolved() });
      };
      // 轉場進行中、減少動態、或不支援時直接套用，避免連點造成轉場互相中斷
      if (!document.startViewTransition || reduceMotion.matches || themeTransition || !originEvent) { apply(); return; }
      const r = originEvent.currentTarget && originEvent.currentTarget.getBoundingClientRect ? originEvent.currentTarget.getBoundingClientRect() : null;
      const x = r ? r.left + r.width / 2 : innerWidth / 2;
      const y = r ? r.top + r.height / 2 : 0;
      themeTransition = document.startViewTransition(apply);
      themeTransition.ready.then(() => {
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 620, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      }, (err) => {
        // 分頁被隱藏等情況瀏覽器會略過轉場（AbortError / InvalidStateError）；主題已在 apply() 套用，不需補救
        if (err.name !== 'AbortError' && err.name !== 'InvalidStateError') throw err;
      });
      const done = () => { themeTransition = null; };
      themeTransition.finished.then(done, done);
    },
    toggle(originEvent) { theme.set(theme.resolved() === 'dark' ? 'light' : 'dark', originEvent); },
  };
  function syncThemeControls() {
    const pref = theme.pref();
    const dark = theme.resolved() === 'dark';
    $$('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-label', dark ? '切換為淺色模式' : '切換為深色模式'));
    $$('[data-theme-option]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOption === pref)));
    $$('[data-theme-option]').map((b) => b.closest('[data-seg]')).forEach((s) => s && s._seg && s._seg.refresh());
  }
  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-theme-toggle]');
      if (t) { theme.toggle({ currentTarget: t }); return; }
      const o = e.target.closest('[data-theme-option]');
      if (o) theme.set(o.dataset.themeOption, { currentTarget: o });
    });
    sysDark.addEventListener('change', () => { syncThemeControls(); emit('cp:theme', { pref: theme.pref(), resolved: theme.resolved() }); });
    syncThemeControls();
  }

  /* ------------------------------------------------------------------
   * 頁首：捲動陰影、導覽 active、行動版選單
   * ------------------------------------------------------------------ */
  let menuApi = null;
  function syncLock() {
    const modalOpen = $$('dialog[open]').some((d) => d.matches(':modal'));
    document.documentElement.classList.toggle('is-locked', modalOpen || !!(menuApi && menuApi.isOpen()));
  }
  function initHeader() {
    const header = $('.site-header');
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const file = decodeURIComponent(location.pathname.split('/').pop() || 'index.html') || 'index.html';
    $$('.nav__link, .mobile-menu__link').forEach((a) => {
      const active = a.getAttribute('href').split('#')[0] === file;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const toggle = $('[data-menu-toggle]', header);
    const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    if (!toggle || !menu) return;
    $$('.mobile-menu__link', menu).forEach((a, i) => a.style.setProperty('--i', i));
    let closeTimer = 0;
    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const open = () => {
      clearTimeout(closeTimer);
      menu.hidden = false;
      void menu.offsetHeight; // 先讓 hidden 移除生效，轉場才有起點
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', '關閉選單');
      header.classList.add('is-menu-open');
      syncLock();
    };
    const close = () => {
      if (!isOpen()) return;
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '開啟選單');
      header.classList.remove('is-menu-open');
      closeTimer = setTimeout(() => { menu.hidden = true; }, reduceMotion.matches ? 0 : 280);
      syncLock();
    };
    menuApi = { open, close, isOpen };
    toggle.addEventListener('click', () => (isOpen() ? close() : open()));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    window.matchMedia('(min-width: 835px)').addEventListener('change', (e) => { if (e.matches) close(); });
  }

  /* ------------------------------------------------------------------
   * 捲動進場：同一批進入視窗的元素依位置錯開；保底機制確保最終一定可見
   * ------------------------------------------------------------------ */
  let revealIO = null;
  const revealNow = (el, delay = 0, instant = false) => {
    el.style.setProperty('--reveal-delay', `${delay}ms`);
    el.classList.add('is-in');
    if (instant) el.classList.add('is-instant');
    if (revealIO) revealIO.unobserve(el);
  };
  function reveal(root = document, { initial = false } = {}) {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (reduceMotion.matches || !('IntersectionObserver' in window)) { els.forEach((el) => revealNow(el, 0, true)); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => {
        const batch = entries.filter((e) => e.isIntersecting).map((e) => e.target);
        batch.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return Math.round(ra.top - rb.top) || ra.left - rb.left;
        });
        batch.forEach((el, i) => revealNow(el, Math.min(i, 8) * 75));
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    }
    const vh = window.innerHeight;
    els.forEach((el) => {
      if (initial) {
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) { revealNow(el, 0, true); return; }
      }
      revealIO.observe(el);
    });
  }
  // 保底：任何已經捲過（頂端在視窗底以上）卻還沒顯示的元素立即顯示，例如錨點跳轉略過的區塊
  function revealSweep() {
    const vh = window.innerHeight;
    $$('[data-reveal]:not(.is-in)').forEach((el) => { if (el.getBoundingClientRect().top < vh) revealNow(el); });
  }

  function countUp(el, to, { duration = 1400, format } = {}) {
    const f = formatter(format || el.dataset.format);
    el._countTarget = to;
    if (reduceMotion.matches) { el.textContent = f(to); return; }
    cancelAnimationFrame(el._countRaf);
    el._countActive = true;
    const start = performance.now();
    const decimals = Number(el.dataset.decimals || 0);
    const step = (t) => {
      const k = clamp((t - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      const target = el._countTarget; // 每格讀最新目標，連續呼叫不會錯亂
      const v = target * eased;
      el.textContent = f(k < 1 ? Number(v.toFixed(decimals)) : target);
      if (k < 1) el._countRaf = requestAnimationFrame(step);
      else el._countActive = false;
    };
    el._countRaf = requestAnimationFrame(step);
  }
  function initCountUps(root = document) {
    const els = $$('[data-count-to]', root).filter((el) => !el._countBound);
    els.forEach((el) => {
      el._countBound = true;
      inView(el, (visible, stop) => {
        if (!visible) return;
        stop();
        countUp(el, Number(el.dataset.countTo));
      }, { threshold: 0.5 });
    });
  }

  /* ------------------------------------------------------------------
   * 可見性工具
   * ------------------------------------------------------------------ */
  function inView(el, cb, { threshold = 0, rootMargin = '0px' } = {}) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => cb(e.isIntersecting, () => io.disconnect(), e));
    }, { threshold, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }
  function initAnim(root = document) {
    $$('[data-anim]', root).filter((el) => !el._animBound).forEach((el) => {
      el._animBound = true;
      inView(el, (visible) => el.classList.toggle('is-paused', !visible), { rootMargin: '80px' });
    });
  }
  function loop(fn) {
    let raf = 0, last = 0, running = false;
    const tick = (t) => {
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      if (fn(dt, t) === false) { api.stop(); return; }
      raf = requestAnimationFrame(tick);
    };
    const api = {
      start() {
        if (running) return api;
        running = true; last = 0;
        if (!document.hidden) raf = requestAnimationFrame(tick);
        return api;
      },
      stop() { running = false; cancelAnimationFrame(raf); raf = 0; return api; },
      get running() { return running; },
    };
    document.addEventListener('visibilitychange', () => {
      if (!running) return;
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (!document.hidden) raf = requestAnimationFrame(tick);
    });
    return api;
  }
  function every(ms, fn) {
    const id = setInterval(() => { if (!document.hidden) fn(); }, ms);
    return () => clearInterval(id);
  }

  /* ------------------------------------------------------------------
   * 3D 傾斜＋指標光暈（只在滑鼠裝置、未要求減少動態時）
   * ------------------------------------------------------------------ */
  function tilt(el) {
    if (el._tilt) return;
    el._tilt = true;
    let raf = 0, px = 0.5, py = 0.5, active = false, max = 4;
    const apply = () => {
      raf = 0;
      if (!active) return;
      const rx = (0.5 - py) * max * 2;
      const ry = (px - 0.5) * max * 2;
      el.style.transform = `perspective(1400px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`;
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    };
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || reduceMotion.matches) return;
      const r = el.getBoundingClientRect();
      // 大卡片轉同樣角度位移太大，依尺寸縮小最大角度
      max = Number(el.dataset.tilt) || clamp(1500 / Math.max(r.width, r.height), 1.6, 4.5);
      px = clamp((e.clientX - r.left) / r.width, 0, 1);
      py = clamp((e.clientY - r.top) / r.height, 0, 1);
      if (!active) { active = true; el.classList.add('is-tilting'); }
      if (!raf) raf = requestAnimationFrame(apply);
    });
    el.addEventListener('pointerleave', () => {
      active = false;
      el.classList.remove('is-tilting');
      el.style.transform = '';
    });
  }

  /* ------------------------------------------------------------------
   * Demo 啟動：hover / focus（滑鼠裝置）或進入視窗（觸控）時 .is-live
   * ------------------------------------------------------------------ */
  function demo(el) {
    if (el._demo) return;
    el._demo = true;
    let introTimer = 0;
    const set = (v) => {
      if (el.classList.contains('is-live') === v) return;
      el.classList.toggle('is-live', v);
      el.dispatchEvent(new CustomEvent('cp:demo', { detail: { active: v } }));
    };
    if (finePointer.matches) {
      el.addEventListener('pointerenter', () => { clearTimeout(introTimer); set(true); });
      // 滑鼠點過按鈕後焦點會留在卡內，只有鍵盤焦點（:focus-visible）才讓卡片在滑鼠離開後維持啟動
      el.addEventListener('pointerleave', () => { if (!el.querySelector(':focus-visible')) set(false); });
      el.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) set(true); });
      el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget) && !el.matches(':hover')) set(false); });
      // 第一次進入視窗時自動試播，讓沒有滑過的人也看得到動態
      if (!reduceMotion.matches) {
        inView(el, (visible, stop) => {
          if (!visible) return;
          stop();
          set(true);
          introTimer = setTimeout(() => { if (!el.matches(':hover') && !el.matches(':focus-within')) set(false); }, 2600);
        }, { threshold: 0.55 });
      }
    } else {
      inView(el, (visible) => set(visible), { threshold: 0.6 });
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) set(false); });
  }

  /* ------------------------------------------------------------------
   * 數字滾輪
   * ------------------------------------------------------------------ */
  const DIGIT_STRIP = '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>';
  const isDigit = (ch) => ch >= '0' && ch <= '9';
  function applyOdo(el) {
    const text = el._odoText; // 執行當下讀最新值
    const digits = [...text].filter(isDigit);
    const strips = $$('.odo__strip', el._odoVis);
    if (strips.length !== digits.length) return; // 欄位已被較新的呼叫重建，交給那次排程處理
    strips.forEach((s, i) => s.style.setProperty('--n', digits[i]));
  }
  function odometer(el, val, { format, reset = false } = {}) {
    const text = typeof format === 'function' ? format(val) : formatter(format || el.dataset.format)(val);
    el._odoText = text;
    if (!el._odoVis) {
      el.textContent = '';
      el.classList.add('odo');
      el._odoSr = document.createElement('span');
      el._odoSr.className = 'sr-only';
      el._odoVis = document.createElement('span');
      el._odoVis.className = 'odo__vis';
      el._odoVis.setAttribute('aria-hidden', 'true');
      el.append(el._odoSr, el._odoVis);
    }
    el._odoSr.textContent = text;
    const prev = el._odoBuilt || '';
    const same = !reset && prev.length === text.length && [...prev].every((ch, i) => (isDigit(ch) && isDigit(text[i])) || ch === text[i]);
    if (same) { applyOdo(el); return; }
    // 形狀改變（位數或分隔符不同）時重建：新欄位先停在 0，下一個 frame 再滾到目標
    let di = 0;
    el._odoVis.innerHTML = [...text].map((ch) => (isDigit(ch)
      ? `<span class="odo__col"><span class="odo__strip" style="--n:0;--dd:${(di++) * 55}ms">${DIGIT_STRIP}</span></span>`
      : `<span class="odo__ch">${esc(ch)}</span>`)).join('');
    el._odoBuilt = text;
    if (reduceMotion.matches) { applyOdo(el); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => applyOdo(el)));
  }

  /* ------------------------------------------------------------------
   * Toast（容器跟著最上層的 modal dialog 走，避免被 top layer 蓋住）
   * ------------------------------------------------------------------ */
  let toastHost = null;
  function placeToastHost() {
    if (!toastHost) return;
    const top = $$('dialog[open]').filter((d) => d.matches(':modal')).pop();
    const parent = top || document.body;
    if (toastHost.parentElement !== parent) parent.append(toastHost);
  }
  const TONE_ICON = { info: 'info', ok: 'check-circle', warn: 'alert', danger: 'x-circle' };
  function toast(title, { desc = '', tone = 'info', icon: iconName, action, duration = 4200 } = {}) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
    }
    placeToastHost();
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.innerHTML = icon(iconName || TONE_ICON[tone] || 'info', { cls: 'toast__icon' })
      + `<div class="toast__body"><p class="toast__title">${esc(title)}</p>${desc ? `<p class="toast__desc">${esc(desc)}</p>` : ''}</div>`
      + (action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : '<span></span>')
      + `<button type="button" class="toast__close" aria-label="關閉通知">${icon('x')}</button>`;
    let timer = 0, gone = false;
    const dismiss = () => {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      if (reduceMotion.matches) { el.remove(); return; }
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 260);
    };
    const arm = (ms) => { clearTimeout(timer); timer = setTimeout(dismiss, ms); };
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', () => arm(2200));
    $('.toast__close', el).addEventListener('click', dismiss);
    if (action) $('.toast__action', el).addEventListener('click', () => { action.onClick(); dismiss(); });
    toastHost.append(el);
    // 最多同時 3 則，舊的先退場
    const live = $$('.toast:not(.is-leaving)', toastHost);
    live.slice(0, Math.max(0, live.length - 3)).forEach((t) => t.remove());
    arm(duration);
    return { dismiss };
  }

  /* ------------------------------------------------------------------
   * Modal（原生 <dialog>；動畫做在 .modal__panel）
   * ------------------------------------------------------------------ */
  function bindDialog(dlg) {
    if (dlg._cpBound) return;
    dlg._cpBound = true;
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dlg); });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) closeDialog(dlg);
      else if (e.target.closest('[data-close-dialog]')) closeDialog(dlg);
    });
  }
  function openDialog(dlg) {
    bindDialog(dlg);
    if (dlg.open) return;
    dlg._closing = false;
    dlg.classList.remove('is-closing');
    dlg.showModal();
    placeToastHost();
    syncLock();
  }
  function closeDialog(dlg, returnValue) {
    if (!dlg.open || dlg._closing) return;
    dlg._closing = true;
    const finish = () => {
      dlg._closing = false;
      dlg.classList.remove('is-closing');
      dlg.close(returnValue);
      // 開啟 modal 的按鈕若在 modal 期間被重繪換掉，原生 close() 還不回焦點（焦點留在已關閉的 dialog 內，隨後掉到 body），
      // 改由呼叫端指定替代目標
      const active = document.activeElement;
      if (dlg._returnFocus && (!active || active === document.body || dlg.contains(active))) {
        const el = dlg._returnFocus();
        if (el) el.focus();
      }
      placeToastHost();
      syncLock();
    };
    if (reduceMotion.matches) { finish(); return; }
    dlg.classList.add('is-closing');
    setTimeout(finish, 230);
  }
  let modalSeq = 0;
  function modal({ title, eyebrow = '', body = '', actions = [{ label: '好', variant: 'primary' }], size = 'md', onClose, returnFocus } = {}) {
    const dlg = document.createElement('dialog');
    const id = `cp-modal-${++modalSeq}`;
    dlg._returnFocus = returnFocus;
    dlg.className = `modal${size === 'md' ? '' : ' modal--' + size}`;
    dlg.setAttribute('aria-labelledby', `${id}-title`);
    dlg.innerHTML = '<div class="modal__panel">'
      + `<header class="modal__head"><div>${eyebrow ? `<p class="modal__eyebrow">${esc(eyebrow)}</p>` : ''}<h2 class="modal__title" id="${id}-title">${esc(title)}</h2></div>`
      + `<button type="button" class="icon-btn modal__close" data-close-dialog aria-label="關閉">${icon('x')}</button></header>`
      + '<div class="modal__body"></div>'
      + (actions.length ? '<footer class="modal__foot"></footer>' : '')
      + '</div>';
    const bodyEl = $('.modal__body', dlg);
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else bodyEl.append(body);
    const close = () => closeDialog(dlg);
    const foot = $('.modal__foot', dlg);
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn--${a.variant || 'ghost'}`;
      b.textContent = a.label;
      if (a.autofocus) b.autofocus = true;
      b.addEventListener('click', () => (a.onClick ? a.onClick(close) : close()));
      foot.append(b);
    });
    dlg.addEventListener('close', () => { if (onClose) onClose(); dlg.remove(); });
    document.body.append(dlg);
    hydrate(bodyEl);
    openDialog(dlg);
    return { el: dlg, body: bodyEl, close };
  }

  /* ------------------------------------------------------------------
   * 分段控制 / 分頁籤（共用滑動 thumb）
   * ------------------------------------------------------------------ */
  function placeThumb(thumb, cur, animate) {
    if (!cur || !cur.offsetWidth) { thumb.style.opacity = '0'; return; }
    thumb.style.opacity = '1';
    if (!animate) thumb.style.transition = 'none';
    thumb.style.setProperty('--x', `${cur.offsetLeft}px`);
    thumb.style.setProperty('--w', `${cur.offsetWidth}px`);
    if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
  }
  function seg(container, { onChange } = {}) {
    if (container._seg) { if (onChange) container._seg.handlers.push(onChange); return container._seg; }
    const btns = () => $$('.seg__btn', container);
    const thumb = document.createElement('span');
    thumb.className = 'seg__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    container.prepend(thumb);
    const current = () => btns().find((b) => b.getAttribute('aria-pressed') === 'true');
    const api = {
      handlers: onChange ? [onChange] : [],
      value: () => { const b = current(); return b ? (b.dataset.value ?? b.textContent.trim()) : null; },
      refresh: () => placeThumb(thumb, current(), false),
      select(target, { silent = false } = {}) {
        const list = btns();
        const b = typeof target === 'number' ? list[target] : target;
        if (!b) throw new Error('App.seg.select: no such option');
        list.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        placeThumb(thumb, b, true);
        if (silent) return;
        const index = list.indexOf(b);
        const v = b.dataset.value ?? b.textContent.trim();
        api.handlers.forEach((h) => h(v, index, b));
        container.dispatchEvent(new CustomEvent('cp:change', { bubbles: true, detail: { value: v, index, button: b } }));
      },
    };
    container.addEventListener('click', (e) => {
      const b = e.target.closest('.seg__btn');
      if (!b || !container.contains(b) || b.disabled) return;
      api.select(b);
    });
    new ResizeObserver(() => api.refresh()).observe(container);
    container.classList.add('is-ready');
    container._seg = api;
    api.refresh();
    return api;
  }
  function tabs(container, { onChange } = {}) {
    if (container._tabs) { if (onChange) container._tabs.handlers.push(onChange); return container._tabs; }
    const list = () => $$('[role="tab"]', container);
    const ink = document.createElement('span');
    ink.className = 'tabs__ink';
    ink.setAttribute('aria-hidden', 'true');
    container.prepend(ink);
    const current = () => list().find((t) => t.getAttribute('aria-selected') === 'true') || list()[0];
    const syncPanels = () => list().forEach((t) => {
      const sel = t === current();
      t.tabIndex = sel ? 0 : -1;
      const panel = t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !sel;
    });
    const api = {
      handlers: onChange ? [onChange] : [],
      index: () => list().indexOf(current()),
      refresh: () => placeThumb(ink, current(), false),
      select(i, { focus = false, silent = false } = {}) {
        const all = list();
        const t = typeof i === 'number' ? all[i] : i;
        if (!t) throw new Error('App.tabs.select: no such tab');
        all.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
        syncPanels();
        placeThumb(ink, t, true);
        if (focus) t.focus();
        t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        if (silent) return;
        const index = all.indexOf(t);
        api.handlers.forEach((h) => h(index, t));
        container.dispatchEvent(new CustomEvent('cp:change', { bubbles: true, detail: { value: t.dataset.value ?? t.textContent.trim(), index, button: t } }));
      },
    };
    container.addEventListener('click', (e) => {
      const t = e.target.closest('[role="tab"]');
      if (t && container.contains(t)) api.select(t);
    });
    container.addEventListener('keydown', (e) => {
      const all = list();
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      api.select((next + all.length) % all.length, { focus: true });
    });
    new ResizeObserver(() => api.refresh()).observe(container);
    container.classList.add('is-ready');
    container._tabs = api;
    syncPanels();
    api.refresh();
    return api;
  }

  /* ------------------------------------------------------------------
   * Accordion：<details class="acc"> 開合動畫
   * ------------------------------------------------------------------ */
  function collapse(d) {
    const body = $('.acc__body', d);
    const pb = getComputedStyle(body).paddingBottom;
    const anim = body.animate([{ height: `${body.offsetHeight}px`, paddingBottom: pb, opacity: 1 }, { height: '0px', paddingBottom: '0px', opacity: 0 }], { duration: 280, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    d._anim = anim;
    anim.onfinish = () => { d.open = false; d._anim = null; };
  }
  function accordion(d) {
    if (d._acc) return;
    d._acc = true;
    const sum = $('summary', d);
    const body = $('.acc__body', d);
    if (!sum || !body) return;
    body.style.overflow = 'hidden';
    sum.addEventListener('click', (e) => {
      const group = d.closest('[data-acc-single]');
      if (reduceMotion.matches) {
        // 原生開合即可，但同組只開一個的規則仍要成立
        if (!d.open && group) $$('details.acc[open]', group).forEach((o) => { if (o !== d) o.open = false; });
        return;
      }
      e.preventDefault();
      if (d._anim) { d._anim.cancel(); d._anim = null; }
      if (d.open) { collapse(d); return; }
      if (group) $$('details.acc[open]', group).forEach((o) => { if (o !== d) collapse(o); });
      d.open = true;
      const pb = getComputedStyle(body).paddingBottom;
      d._anim = body.animate([{ height: '0px', paddingBottom: '0px', opacity: 0 }, { height: `${body.offsetHeight}px`, paddingBottom: pb, opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      d._anim.onfinish = () => { d._anim = null; };
    });
  }

  /* ------------------------------------------------------------------
   * 次導覽 scroll spy：捲到哪一節，對應的 .subnav__link 就標 is-active / aria-current
   * ------------------------------------------------------------------ */
  function scrollSpy(nav) {
    if (nav._spy) return nav._spy;
    const links = $$('a[href^="#"]', nav).filter((l) => document.getElementById(decodeURIComponent(l.getAttribute('href').slice(1))));
    const sections = links.map((l) => document.getElementById(decodeURIComponent(l.getAttribute('href').slice(1))));
    let current = -2, raf = 0;
    const update = () => {
      raf = 0;
      const line = nav.getBoundingClientRect().bottom + 48;
      let idx = -1;
      sections.forEach((s, k) => { if (s.getBoundingClientRect().top <= line) idx = k; });
      // 最後一節太短到不了判定線時，捲到底就算它
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 && sections.length) idx = sections.length - 1;
      if (idx === current) return;
      current = idx;
      links.forEach((l, k) => {
        l.classList.toggle('is-active', k === idx);
        if (k === idx) l.setAttribute('aria-current', 'true');
        else l.removeAttribute('aria-current');
      });
      const active = links[idx];
      const box = links.length && links[0].parentElement;
      if (box && box.scrollWidth > box.clientWidth) {
        // 回到頁首（沒有目前段落）時捲回最左，否則窄螢幕上第一個連結會停在被裁切的位置
        const left = active
          ? box.scrollLeft + (active.getBoundingClientRect().left - box.getBoundingClientRect().left) - (box.clientWidth - active.offsetWidth) / 2
          : 0;
        box.scrollTo({ left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', () => { current = -2; update(); });
    update();
    nav._spy = { update };
    return nav._spy;
  }

  function initRange(r) {
    if (r._range) return;
    r._range = true;
    const upd = () => {
      const min = Number(r.min || 0), max = Number(r.max || 100);
      r.style.setProperty('--p', String(((Number(r.value) - min) / (max - min)) * 100));
    };
    r.addEventListener('input', upd);
    upd();
  }
  function initSearch(box) {
    if (box._search) return;
    box._search = true;
    const input = $('.search__input', box);
    const clear = $('.search__clear', box);
    if (!input || !clear) return;
    const sync = () => { clear.hidden = !input.value; };
    input.addEventListener('input', sync);
    clear.addEventListener('click', () => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    sync();
  }

  /* ------------------------------------------------------------------
   * 偽 QR 碼：定位眼、時序線、對位點固定，資料區由 seed 決定
   * ------------------------------------------------------------------ */
  function hashSeed(str) {
    let h = 2166136261;
    for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function qrSVG(seed, { n = 25, animate = false, label = '行動條碼', cls = '' } = {}) {
    const rnd = mulberry32(hashSeed(seed));
    const reserved = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8)
      || (Math.abs(r - (n - 7)) <= 2 && Math.abs(c - (n - 7)) <= 2);
    let mods = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (reserved(r, c)) continue;
        const timing = (r === 6 || c === 6);
        const on = timing ? (r + c) % 2 === 0 : rnd() < 0.5;
        if (!on) continue;
        const d = animate ? ` style="--d:${(r + c) * 13}ms"` : '';
        mods += `<rect class="qr__m" x="${c + 0.08}" y="${r + 0.08}" width=".84" height=".84" rx=".28"${d}/>`;
      }
    }
    const eye = (r0, c0) => `<g class="qr__eye"><rect x="${c0 + 0.5}" y="${r0 + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="currentColor" stroke-width="1"/><rect x="${c0 + 2}" y="${r0 + 2}" width="3" height="3" rx=".9"/></g>`;
    const a = n - 7;
    const align = `<g class="qr__eye"><rect x="${a - 1.5}" y="${a - 1.5}" width="4" height="4" rx="1.2" fill="none" stroke="currentColor" stroke-width="1"/><rect x="${a + 0.1}" y="${a + 0.1}" width=".8" height=".8" rx=".25"/></g>`;
    return `<svg class="qr${animate ? ' is-gen' : ''} ${cls}" viewBox="-1.5 -1.5 ${n + 3} ${n + 3}" fill="currentColor" role="img" aria-label="${esc(label)}">${eye(0, 0)}${eye(0, n - 7)}${eye(n - 7, 0)}${align}${mods}</svg>`;
  }

  /* ------------------------------------------------------------------
   * 進度環
   * ------------------------------------------------------------------ */
  function ring(val, max, { size = 120, stroke = 10, label = '', cls = '' } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const p = clamp(val / max, 0, 1);
    const mid = size / 2;
    return `<svg class="ring ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}" data-c="${c.toFixed(2)}">`
      + `<circle class="ring__track" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${stroke}"/>`
      + `<circle class="ring__bar" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="url(#cp-grad)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p)).toFixed(2)}" transform="rotate(-90 ${mid} ${mid})"/>`
      + '</svg>';
  }
  function setRing(svg, val, max) {
    const c = Number(svg.dataset.c);
    $('.ring__bar', svg).setAttribute('stroke-dashoffset', (c * (1 - clamp(val / max, 0, 1))).toFixed(2));
  }

  /* ------------------------------------------------------------------
   * 折線量測與垃圾車模擬
   * ------------------------------------------------------------------ */
  const polyline = {
    measure(pts) {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts, cum, total: cum[cum.length - 1] };
    },
    at(m, dist) {
      const d = clamp(dist, 0, m.total);
      let i = 1;
      while (i < m.cum.length - 1 && m.cum[i] < d) i++;
      const a = m.pts[i - 1], b = m.pts[i];
      const seg = m.cum[i] - m.cum[i - 1] || 1;
      const t = (d - m.cum[i - 1]) / seg;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI };
    },
  };
  const G = DATA.garbage;
  const gMeasure = polyline.measure(G.points);
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const gSchedule = [{ v: 0, min: toMin(G.depart), stop: null }, ...G.stops.map((s) => ({ v: s.v, min: toMin(s.time), stop: s }))];
  const garbage = {
    measure: gMeasure,
    stop(id) {
      const s = G.stops.find((x) => x.id === id);
      if (!s) throw new Error(`App.garbage: unknown stop "${id}"`);
      return s;
    },
    stopDist: (id) => gMeasure.cum[garbage.stop(id).v],
    truck(t = now()) {
      const m = minutesOfDay(t);
      const dow = parts(t).dow;
      let dist = 0, status = 'running', next = null;
      if (!G.days.includes(dow)) status = 'off';
      else if (m <= gSchedule[0].min) { status = 'before'; next = G.stops[0]; }
      else if (m >= gSchedule[gSchedule.length - 1].min) { status = 'done'; dist = gMeasure.total; }
      else {
        let k = 0;
        while (gSchedule[k + 1].min <= m) k++;
        const a = gSchedule[k], b = gSchedule[k + 1];
        dist = gMeasure.cum[a.v] + (gMeasure.cum[b.v] - gMeasure.cum[a.v]) * ((m - a.min) / (b.min - a.min));
        next = b.stop;
      }
      return { ...polyline.at(gMeasure, dist), dist, status, next, total: gMeasure.total };
    },
    eta: (id, t = now()) => (toMin(garbage.stop(id).time) - minutesOfDay(t)) * 60,
    setTruck(svg, dist) {
      const p = polyline.at(gMeasure, dist);
      $('[data-role="truck"]', svg).setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      $('[data-role="trail"]', svg).setAttribute('stroke-dasharray', `${Math.max(0, dist).toFixed(1)} ${(gMeasure.total + 40).toFixed(0)}`);
      $$('.gmap__stop', svg).forEach((g) => g.classList.toggle('is-passed', garbage.stopDist(g.dataset.stop) <= dist + 0.5));
    },
  };
  function garbageMap({ labels = false, stopLabels = false, viewBox = '0 0 600 330', slice = false, cls = '', title = '北岸 2 線垃圾車路線地圖' } = {}) {
    const M = G.map;
    let blocks = '';
    for (let i = 0; i < M.xs.length - 1; i++) {
      for (let j = 0; j < M.ys.length - 1; j++) {
        if (M.skipBlocks.includes(`${i}-${j}`)) continue;
        const x = M.xs[i] === 0 ? -12 : M.xs[i] + 11;
        const y = M.ys[j] === 0 ? -12 : M.ys[j] + 11;
        const w = (M.xs[i + 1] === M.w ? M.w + 12 : M.xs[i + 1] - 11) - x;
        const h = M.ys[j + 1] - 11 - y;
        blocks += `<rect class="gmap__block" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>`;
      }
    }
    const pts = G.points.map((p) => p.join(',')).join(' ');
    const t = garbage.truck();
    const stops = G.stops.map((s) => {
      const [x, y] = G.points[s.v];
      const mine = s.id === G.myStop;
      const passed = gMeasure.cum[s.v] <= t.dist + 0.5;
      return `<g class="gmap__stop${mine ? ' is-mine' : ''}${passed ? ' is-passed' : ''}" data-stop="${s.id}" transform="translate(${x} ${y})">`
        + (mine ? '<circle class="gmap__pulse" r="10"/>' : '')
        + `<circle class="gmap__stop-dot" r="${mine ? 8 : 6.5}" stroke-width="3"/>`
        + (stopLabels ? `<text class="gmap__stop-name" x="${s.lx}" y="${s.ly}" text-anchor="${s.anchor}" stroke-width="4">${esc(s.name)}</text>` : '')
        + '</g>';
    }).join('');
    const streetLabels = labels ? M.labels.map((l) => `<text class="gmap__label${l.water ? ' gmap__label--water' : ''}" x="${l.x}" y="${l.y}" text-anchor="${l.anchor}">${esc(l.text)}</text>`).join('')
      + M.parks.filter((p) => p.name).map((p) => `<text class="gmap__label" x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 4}" text-anchor="middle">${esc(p.name)}</text>`).join('') : '';
    const [dx, dy] = G.points[0];
    return `<svg class="gmap ${cls}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid ${slice ? 'slice' : 'meet'}" role="img" aria-label="${esc(title)}">`
      + `<rect class="gmap__land" x="-20" y="-20" width="${M.w + 40}" height="${M.h + 40}"/>${blocks}`
      + M.parks.map((p) => `<rect class="gmap__park" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10"/>`).join('')
      + `<g class="gmap__minor" fill="none" stroke-width="6" stroke-linecap="round">${M.minor.map((d) => `<path d="${d}"/>`).join('')}</g>`
      + `<g class="gmap__roads" fill="none" stroke-width="12" stroke-linecap="round">${M.roads.map((d) => `<path d="${d}"/>`).join('')}</g>`
      + `<path class="gmap__water" d="${M.water}"/>`
      + streetLabels
      + `<polyline class="gmap__route" points="${pts}" fill="none" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<polyline class="gmap__trail" data-role="trail" points="${pts}" fill="none" stroke="url(#cp-grad-map)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${t.dist.toFixed(1)} ${(gMeasure.total + 40).toFixed(0)}"/>`
      + `<rect class="gmap__depot" x="${dx - 7}" y="${dy - 7}" width="14" height="14" rx="4"/>`
      + stops
      + `<g class="gmap__truck" data-role="truck" transform="translate(${t.x.toFixed(1)} ${t.y.toFixed(1)})"><circle class="gmap__truck-halo" r="20"/><circle class="gmap__truck-body" r="13" stroke-width="3"/>`
      + `<g transform="translate(-8 -8.5) scale(.667)" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${ICONS.truck}</g></g>`
      + '</svg>';
  }

  /* ------------------------------------------------------------------
   * 空狀態
   * ------------------------------------------------------------------ */
  const EMPTY_ART = {
    search: '<rect x="28" y="30" width="58" height="68" rx="14" style="fill:var(--surface)"/><rect x="39" y="45" width="30" height="5" rx="2.5" style="fill:var(--fill-2)"/><rect x="39" y="57" width="22" height="5" rx="2.5" style="fill:var(--fill-2)"/><rect x="39" y="69" width="26" height="5" rx="2.5" style="fill:var(--fill-2)"/><circle cx="84" cy="78" r="17" fill="none" stroke="url(#cp-grad)" stroke-width="6"/><path d="M96.5 90.5L108 102" stroke="url(#cp-grad)" stroke-width="7" stroke-linecap="round"/>',
    list: '<rect x="30" y="34" width="72" height="18" rx="9" style="fill:var(--surface)"/><rect x="30" y="58" width="72" height="18" rx="9" style="fill:var(--surface)"/><rect x="30" y="82" width="72" height="18" rx="9" style="fill:var(--surface)"/><circle cx="40" cy="43" r="4" fill="url(#cp-grad)"/><rect x="50" y="41" width="34" height="4" rx="2" style="fill:var(--fill-2)"/><circle cx="40" cy="67" r="4" style="fill:var(--fill-2)"/><rect x="50" y="65" width="26" height="4" rx="2" style="fill:var(--fill-2)"/><circle cx="40" cy="91" r="4" style="fill:var(--fill-2)"/><rect x="50" y="89" width="30" height="4" rx="2" style="fill:var(--fill-2)"/>',
    bell: '<path d="M44 62a22 22 0 0 1 44 0c0 18 8 24 8 24H36s8-6 8-24z" style="fill:var(--surface)"/><path d="M58 92a8 8 0 0 0 16 0" fill="none" stroke="url(#cp-grad)" stroke-width="6" stroke-linecap="round"/><path d="M92 40l8-8M98 52h10M40 40l-8-8" fill="none" stroke="url(#cp-grad)" stroke-width="5" stroke-linecap="round"/>',
  };
  function emptyState({ art = 'search', title, text = '', actions = '' }) {
    if (!EMPTY_ART[art]) throw new Error(`App.emptyState: unknown art "${art}"`);
    return '<div class="empty">'
      + `<svg class="empty__art" viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="60" style="fill:var(--fill)"/>${EMPTY_ART[art]}</svg>`
      + `<p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}`
      + (actions ? `<div class="empty__actions">${actions}</div>` : '')
      + '</div>';
  }

  /* ------------------------------------------------------------------
   * 條款 modal（頁尾共用）
   * ------------------------------------------------------------------ */
  const LEGAL = {
    privacy: {
      eyebrow: '最後更新 2026 年 9 月 30 日',
      title: '隱私權政策摘要',
      body: '<p>城市通由<strong>澄港市政府數位服務處</strong>營運。我們只在你使用特定服務時取得該服務需要的最少欄位，例如繳停車費時需要車牌號碼，不會額外蒐集通訊錄或背景位置。</p>'
        + '<p>資料加密保存於市府自建機房，每一次查詢與調用都會留下紀錄；你可以在「我的市民卡 › 綁定服務」查看各單位的授權，並隨時撤回。</p>'
        + '<p>我們不販售、不出租個人資料，也不使用第三方廣告追蹤工具。如對個資處理有疑問，請來電 1999 轉 8，或寄信至數位服務處個資窗口。</p>',
    },
    terms: {
      eyebrow: '版本 4.0 · 2026 年 10 月 1 日生效',
      title: '使用條款摘要',
      body: '<p>城市通為澄港市民與在澄港工作、就學者提供的免費服務。註冊時請使用本人身分，帳號不得轉讓或借予他人使用。</p>'
        + '<p>透過城市通完成的繳費、預約與掛號，效力等同臨櫃辦理；各項服務的退費與取消規定，依各主管單位公告為準。</p>'
        + '<p>系統維護會提前 3 天於 App 內公告，緊急維護則以推播通知。</p>',
    },
    a11y: {
      eyebrow: '無障礙',
      title: '無障礙聲明',
      body: '<p>城市通依 WCAG 2.2 AA 原則設計：支援螢幕閱讀器、完整鍵盤操作、系統字級放大至 200%，並在系統開啟「減少動態效果」時關閉非必要的動畫。</p>'
        + '<p>介面提供繁體中文、English、日本語、Tiếng Việt 與 Bahasa Indonesia 五種語言。</p>'
        + '<p>若遇到任何使用障礙，請來電 1999 轉 7，我們會在 3 個工作天內回覆。</p>',
    },
  };

  /* ------------------------------------------------------------------
   * 全域委派與初始化
   * ------------------------------------------------------------------ */
  function initDelegation() {
    // 頁內錨點平滑捲動（只處理指向本頁且目標存在的連結），並把焦點移到目標方便鍵盤與報讀器接續
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname || !url.hash) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      history.pushState(null, '', url.hash);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-toast]');
      if (t) toast(t.dataset.toast, { desc: t.dataset.toastDesc || '', tone: t.dataset.toastTone || 'info' });
      const l = e.target.closest('[data-legal]');
      if (l) {
        const doc = LEGAL[l.dataset.legal];
        if (!doc) throw new Error(`App: unknown legal doc "${l.dataset.legal}"`);
        modal({ eyebrow: doc.eyebrow, title: doc.title, body: doc.body, actions: [{ label: '我知道了', variant: 'primary' }] });
      }
      const o = e.target.closest('[data-open-dialog]');
      if (o) {
        const dlg = document.getElementById(o.dataset.openDialog);
        if (!dlg) throw new Error(`App: dialog #${o.dataset.openDialog} not found`);
        openDialog(dlg);
      }
    });
    // Esc：先關最上層 modal，再關行動版選單（原生 cancel 也會走 closeDialog，已有防重入）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const top = $$('dialog[open]').filter((d) => d.matches(':modal')).pop();
      if (top) { closeDialog(top); return; }
      if (menuApi && menuApi.isOpen()) menuApi.close();
    });
    // 頁面程式直接呼叫 showModal() 時也讓 toast 容器跟上
    new MutationObserver(() => { placeToastHost(); syncLock(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-hidden', document.hidden));
    window.addEventListener('beforeprint', () => $$('[data-reveal]:not(.is-in)').forEach((el) => revealNow(el, 0, true)));
  }
  function initClocks() {
    const els = $$('[data-clock]');
    if (!els.length) return;
    const tick = () => els.forEach((el) => {
      const kind = el.dataset.clock || 'time';
      if (!fmt[kind]) throw new Error(`App: unknown clock format "${kind}"`);
      el.textContent = fmt[kind](now());
    });
    tick();
    every(1000, tick);
  }
  function hydrate(root = document) {
    hydrateIcons(root);
    if (root !== document) bindAll(root);
    $$('[data-seg]', root).forEach((el) => seg(el));
    $$('[data-tabs]', root).forEach((el) => tabs(el));
    $$('details.acc', root).forEach(accordion);
    $$('input.range', root).forEach(initRange);
    $$('.search', root).forEach(initSearch);
    $$('[data-scrollspy]', root).forEach(scrollSpy);
    if (finePointer.matches) $$('[data-tilt]', root).forEach(tilt);
    $$('[data-demo]', root).forEach(demo);
    initAnim(root);
    initCountUps(root);
    reveal(root);
  }

  function init() {
    // 有 sticky 次導覽時，錨點跳轉要多讓出次導覽的高度（建議頁面也直接在 <html> 寫上 has-subnav，首次載入的 #hash 才準）
    if ($('.subnav')) document.documentElement.classList.add('has-subnav');
    injectDefs();
    initTheme();
    hydrateIcons();
    bindAll();
    initHeader();
    initDelegation();
    initClocks();
    reveal(document, { initial: true });
    hydrate(document);
    let sweepRaf = 0;
    window.addEventListener('scroll', () => {
      if (sweepRaf) return;
      sweepRaf = requestAnimationFrame(() => { sweepRaf = 0; revealSweep(); });
    }, { passive: true });
    setTimeout(revealSweep, 2500);
    if (document.fonts) document.fonts.ready.then(() => $$('[data-seg], [data-tabs]').forEach((el) => (el._seg || el._tabs).refresh()));
  }

  window.App = {
    DATA, CATS,
    update, value,
    now, time, parts, fmt,
    esc, icon, ICON_NAMES: Object.keys(ICONS),
    qrSVG, ring, setRing, emptyState, garbageMap,
    garbage, polyline,
    toast, modal, openDialog, closeDialog,
    seg, tabs, odometer, countUp,
    theme, inView, loop, every,
    reveal: (root) => reveal(root || document),
    hydrate, scrollSpy,
    param: (name) => new URLSearchParams(location.search).get(name),
    reduceMotion: () => reduceMotion.matches,
  };

  init();
})();
