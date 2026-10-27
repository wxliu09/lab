/*
 * 澄港市 青年創業補助 審核台 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * 因為 inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 資料（全站共用，確保人名、案號、金額前後一致；只在記憶體中變動）
 *   App.DATA.program     計畫設定：期別、預算、方案上限與補助比例、資格、預算科目
 *   App.DATA.people      承辦 / 審查委員 / 主管（id → {name, role, title, hue}）
 *   App.DATA.cases       40 件案件（見下方欄位說明）
 *   App.DATA.activity    最近活動（新到舊）
 *   App.DATA.committee   下一場審議委員會
 *   App.DATA.rubric      評分項目（創新性 25、市場可行性 25、團隊能力 20、財務規劃 15、在地效益 15）
 *   App.DATA.docs        應備文件清單
 *   App.STATUS / App.STATUS_ORDER / App.STAGES / App.CATEGORIES / App.DISTRICTS
 *   App.getCase(id) · App.person(id) · App.stageOf(c) · App.isActive(c)
 *   App.funnel() → [{label, status, reached, pending, dropped}]（六階段累計）
 *   App.reviewerLoad() → [{person, pending, capacity, done}]
 *   App.score(c, reviewerId) → {total, items, at, note} | null · App.avgScore(c) · App.scoreGap(c)
 *   App.transition(c, toStatus, {note}) → {undo()}  狀態流轉（自動更新 SLA、活動紀錄並發出 'app:case' 事件）
 *   App.caseUrl(id) · App.param(name)
 * 時間與格式（所有時間以 UTC+8 計算，與使用者時區無關）
 *   App.now() → ms，以 2026-10-22 10:30 為起點持續走動
 *   App.time('2026-10-22T10:30') → ms
 *   App.fmt.num / money / wan / date / dateLong / time / dateTime / weekday / rel / dur / clock / countdown
 *   App.sla(c 或 {due, start}) → {state:'ok'|'soon'|'crit'|'over', remain, frac, label}
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(str) · App.icon(name, cls) · App.statusIcon(status, cls) · App.statusChip(status, {pill})
 *   App.avatar(personId 或 {name, hue}, size) · App.slaBadge(c, {countdown, size, text, ring}) · App.stageTrack(c)
 *   App.sparkline(values, {w, h, color, label}) · App.emptyState({art, title, text})
 *   App.casePeek(c) 抽屜內容（不含標題；搭配 drawer.open({eyebrow: c.id, title: c.title})）
 *   App.monotonePath(points) → SVG path d（單調三次曲線，不會過衝）
 * 互動元件
 *   App.toast(title, {desc, tone:'success'|'info'|'warn'|'danger'|'accent', action:{label, onClick}, duration})
 *   App.modal({title, body, tone, icon, size:'sm'|'md'|'lg', note, actions:[{label, variant, kbd, autofocus, onClick(close)}], onClose}) → {el, body, close}
 *   App.confirm({title, message, confirmLabel, cancelLabel, tone:'primary'|'danger'|'ok', icon}) → Promise<boolean>
 *   App.drawer.open({eyebrow, title, body, foot, href, onClose}) / .close() / .isOpen
 *   App.menu(anchor, {title, items:[{label, sub, meta, icon, checked, danger, value} | 'sep'], search, onSelect}) → close()
 *   App.pickPerson(anchor, {role:'officer'|'reviewer', current, onPick(person)})
 *   App.setStatus(svg.sd 或其容器, status)  狀態小點 morph（容器內 [data-status-label] 文字會跟著換）
 *   App.tabs(tablistEl, {onChange(index, tab)}) → {select(i), refresh()}
 *   App.listNav(container, {item, onOpen, onPeek, onAssign, onToggle, onSnooze, onCursor}) → {setIndex, current, index, move}
 *   App.registerCommands([{id, group, label, sub, icon, meta, keywords, run}])  加入指令面板
 *   App.shortcut(key, handler, {desc, group})  註冊單鍵快捷鍵（同時列入 ? 說明）
 *   App.role · App.persona() · App.setRole(role)；切換時 document 發出 'app:role'
 *   App.tasks() → [{c, reason, flag, action:{label, to, confirm, href}}]  目前角色的待辦（依 SLA 排序）
 *   App.reveal(root) / App.countUps(root) 重新掃描動態插入的 [data-reveal] / [data-count-to] · App.countUp(el)
 * 自動行為（不需呼叫）
 *   導覽 active 標示、行動版側欄（[data-nav-toggle]）、⌘K / Ctrl+K / [data-cmdk] 指令面板、
 *   ? 或 [data-shortcuts] 快捷鍵說明、G 再按 O/Q/C/A 跳頁、[data-notify] 通知選單、[data-role-switch] 角色選單、
 *   [data-reveal] 進場、[data-count-to] 數字滾動、[data-band] 列表光帶、[data-sla] 每秒更新、
 *   [data-clock] 時鐘、[data-countdown-to] 倒數、[data-anim] 離開視窗時暫停其中的 .anim-loop、[data-mod] 依平台顯示 ⌘ / Ctrl、
 *   [data-count="tasks|active|mine|sla|committee"] 計數（狀態流轉、切換角色後自動更新）
 *
 * 案件欄位
 *   id, title, applicant, age, org, cat, district, tier('seed'|'growth'), total, request, jobs, summary,
 *   status, owner(承辦 id 或 null), reviewers[], scores{reviewerId: {items[5], at, note}},
 *   submitted, updated, sla{kind, start, due} | null, missing[{doc, note}], uploaded[docKey],
 *   approvedAt, granted, disbursedAt, closedAt, droppedAt(退件時所在階段 0–5), closeReason
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /* ------------------------------------------------------------------
   * 圖示（16×16、1.5 線寬）
   * ------------------------------------------------------------------ */
  const ICONS = {
    overview: 'M2.75 2.75h4v4h-4zM9.25 2.75h4v4h-4zM2.75 9.25h4v4h-4zM9.25 9.25h4v4h-4z',
    inbox: 'M2.5 9.5l1.6-5.2a1 1 0 0 1 .96-.7h5.88a1 1 0 0 1 .96.7l1.6 5.2v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM2.5 9.5h3l1 1.5h3l1-1.5h3',
    queue: 'M5.75 4h7.75M5.75 8h7.75M5.75 12h7.75M2.5 4h.01M2.5 8h.01M2.5 12h.01',
    file: 'M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V4.75zM9.5 1.75v3h3M5.75 8.25h4.5M5.75 11h3',
    'file-plus': 'M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V4.75zM9.5 1.75v3h3M8 7.5v4M6 9.5h4',
    search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 14l-3.5-3.5',
    bell: 'M4 6.5a4 4 0 0 1 8 0c0 3.5 1.5 4.75 1.5 4.75h-11S4 10 4 6.5zM6.5 13.75a1.6 1.6 0 0 0 3 0',
    plus: 'M8 3v10M3 8h10',
    x: 'M4 4l8 8M12 4l-8 8',
    check: 'M3.5 8.5l3 3 6-7',
    'check-circle': 'M8 14.25A6.25 6.25 0 1 0 8 1.75a6.25 6.25 0 0 0 0 12.5zM5.5 8.2l1.7 1.7 3.3-3.6',
    info: 'M8 14.25A6.25 6.25 0 1 0 8 1.75a6.25 6.25 0 0 0 0 12.5zM8 7.25v3.5M8 5.2v.01',
    'chevron-down': 'M4 6l4 4 4-4',
    'chevron-right': 'M6 4l4 4-4 4',
    'chevron-left': 'M10 4L6 8l4 4',
    'chevron-up': 'M4 10l4-4 4 4',
    clock: 'M8 14.25A6.25 6.25 0 1 0 8 1.75a6.25 6.25 0 0 0 0 12.5zM8 4.5V8l2.5 1.5',
    alert: 'M8 2.25L14.5 13.5h-13zM8 6.5v3M8 11.6v.01',
    user: 'M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8zM2.75 14a5.25 5.25 0 0 1 10.5 0',
    users: 'M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5a4.5 4.5 0 0 1 9 0M10.5 2.6a2.5 2.5 0 0 1 0 4.8M12 9.4a4.5 4.5 0 0 1 2.5 4.1',
    'arrow-right': 'M3 8h10M9 4l4 4-4 4',
    'arrow-left': 'M13 8H3M7 4L3 8l4 4',
    external: 'M5 11l6-6M6 5h5v5',
    snooze: 'M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z',
    filter: 'M2.5 3.5h11l-4.25 5v4l-2.5 1.25V8.5z',
    sort: 'M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5',
    more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
    paperclip: 'M13 7.5l-5.3 5.3a3.2 3.2 0 0 1-4.5-4.5L8.6 2.9a2.1 2.1 0 0 1 3 3L6.2 11.3a1.05 1.05 0 0 1-1.5-1.5L9.5 5',
    comment: 'M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5h-.5a1 1 0 0 1-1-1z',
    upload: 'M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
    download: 'M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2',
    calendar: 'M3 3.5h10a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    coin: 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 6.2c-.4-.6-1.1-.95-2-.95-1.1 0-1.9.55-1.9 1.35 0 1.9 4 1 4 2.9 0 .8-.85 1.35-2.1 1.35-.9 0-1.65-.35-2.05-.95M8 4.25v7.5',
    keyboard: 'M2 4h12a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-7A.5.5 0 0 1 2 4zM4.5 6.5h.01M7 6.5h.01M9.5 6.5h.01M12 6.5h.01M5 9.5h6',
    menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
    eye: 'M1.75 8S4 3.5 8 3.5 14.25 8 14.25 8 12 12.5 8 12.5 1.75 8 1.75 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    layers: 'M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
    undo: 'M5.5 6.5H10a3 3 0 0 1 0 6H6.5M7.5 4L5 6.5 7.5 9',
    flag: 'M3.5 14V2.5M3.5 3h8l-1.75 3 1.75 3h-8',
    trash: 'M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.1a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4',
    scale: 'M8 2.5v11M4.5 13.5h7M3 4.5h10M3 4.5L1.5 8.5a1.6 1.6 0 0 0 3 0zM13 4.5l-1.5 4a1.6 1.6 0 0 0 3 0z',
    bolt: 'M9 1.75L3.5 9h4L7 14.25 12.5 7h-4z',
    send: 'M14 2L7 9M14 2l-4.5 12-2.5-5-5-2.5z',
    command: 'M6 6V4.25a1.75 1.75 0 1 0-1.75 1.75H6zm0 0h4m-4 0v4m4-4V4.25A1.75 1.75 0 1 1 11.75 6H10zm0 0v4m0 0h1.75A1.75 1.75 0 1 1 10 11.75V10zm0 0H6m0 0v1.75A1.75 1.75 0 1 1 4.25 10H6z',
    sparkle: 'M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2L12 12M12 4l-1.8 1.8M5.8 10.2L4 12',
    swap: 'M3 5.5h10M10.5 3L13 5.5 10.5 8M13 10.5H3M5.5 8L3 10.5 5.5 13',
    pin: 'M8 14.5s4.75-4.2 4.75-8.25a4.75 4.75 0 1 0-9.5 0C3.25 10.3 8 14.5 8 14.5zM8 8a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 8 8z',
    briefcase: 'M2.5 5h11a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5zM5.75 5V3.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V5M2 8.5h12',
    gauge: 'M2.5 11.5a5.5 5.5 0 1 1 11 0M8 11.5l2.5-3.5',
    trend: 'M2 11.5l4-4 2.5 2.5L14 4.5M10 4.5h4v4',
  };
  function icon(name, cls = '') {
    return `<svg class="i ${cls}" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  }

  /* ------------------------------------------------------------------
   * 時間：固定以 UTC+8 計算，任何時區開啟都顯示同一組時間
   * ------------------------------------------------------------------ */
  const TZ = 8 * 3600e3;
  const DAY = 864e5;
  const time = (s) => typeof s === 'number' ? s
    : Date.parse(s.length === 10 ? `${s}T00:00:00+08:00` : `${s}${s.length === 16 ? ':00' : ''}+08:00`);
  // 敘事上的「現在」：2026-10-22（四）10:30，之後隨真實時間流動，讓 SLA 倒數會動
  const BASE = time('2026-10-22T10:30');
  const T0 = performance.now();
  const now = () => BASE + (performance.now() - T0);
  const parts = (ms) => {
    const d = new Date(ms + TZ);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  };
  const pad = (n) => String(n).padStart(2, '0');
  const WD = '日一二三四五六';
  const atTime = (ms, h, m) => { const p = parts(ms); return Date.UTC(p.y, p.mo - 1, p.d, h, m) - TZ; };
  const addWorkdays = (ms, n) => {
    let t = ms;
    while (n > 0) { t += DAY; const wd = parts(t).wd; if (wd !== 0 && wd !== 6) n -= 1; }
    return atTime(t, 17, 0);
  };

  const fmt = {
    num: (n) => Number(n).toLocaleString('en-US'),
    money: (n) => 'NT$ ' + Number(n).toLocaleString('en-US'),
    wan: (n) => (n / 10000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' 萬',
    date(v, withYear = false) { const p = parts(time(v)); return (withYear ? p.y + '/' : '') + pad(p.mo) + '/' + pad(p.d); },
    dateLong(v) { const p = parts(time(v)); return `${p.y} 年 ${p.mo} 月 ${p.d} 日（${WD[p.wd]}）`; },
    time(v) { const p = parts(time(v)); return pad(p.h) + ':' + pad(p.mi); },
    dateTime(v) { return fmt.date(v) + ' ' + fmt.time(v); },
    weekday(v) { return '週' + WD[parts(time(v)).wd]; },
    clock(v) { const p = parts(time(v)); return `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`; },
    rel(v) {
      const ms = time(v);
      const diff = now() - ms;
      if (diff < 60e3) return '剛剛';
      if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分鐘前';
      const a = parts(ms), b = parts(now());
      const days = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY);
      if (days === 0) return Math.floor(diff / 3600e3) + ' 小時前';
      if (days === 1) return '昨天 ' + fmt.time(ms);
      if (days < 7) return days + ' 天前';
      return fmt.date(ms);
    },
    dur(ms) {
      const a = Math.abs(ms);
      const d = Math.floor(a / DAY), h = Math.floor((a % DAY) / 3600e3), m = Math.floor((a % 3600e3) / 60e3);
      if (d >= 1) return d + ' 天' + (h ? ` ${h} 時` : '');
      if (h >= 1) return `${h} 時 ${m} 分`;
      return Math.max(m, 1) + ' 分';
    },
    countdown(ms) {
      const a = Math.max(0, Math.abs(ms));
      const d = Math.floor(a / DAY), h = Math.floor((a % DAY) / 3600e3), m = Math.floor((a % 3600e3) / 60e3), s = Math.floor((a % 60e3) / 1000);
      return (d ? d + ' 天 ' : '') + `${pad(h)}:${pad(m)}:${pad(s)}`;
    },
  };

  /* ------------------------------------------------------------------
   * 資料
   * ------------------------------------------------------------------ */
  const STATUS = {
    received: { label: '待收件', stage: 0 },
    formal: { label: '形式審查', stage: 1 },
    supplement: { label: '補件中', stage: 1 },
    substantive: { label: '實質審查', stage: 2 },
    committee: { label: '委員會', stage: 3 },
    approved: { label: '核定', stage: 4 },
    disbursed: { label: '已撥款', stage: 5 },
    rejected: { label: '退件', stage: null },
  };
  const STATUS_ORDER = ['received', 'formal', 'supplement', 'substantive', 'committee', 'approved', 'disbursed', 'rejected'];
  const STAGES = [
    { key: 'intake', label: '收件', status: 'received' },
    { key: 'formal', label: '形式審查', status: 'formal' },
    { key: 'substantive', label: '實質審查', status: 'substantive' },
    { key: 'committee', label: '委員會', status: 'committee' },
    { key: 'approved', label: '核定', status: 'approved' },
    { key: 'disbursed', label: '撥款', status: 'disbursed' },
  ];
  const CATEGORIES = {
    food: '餐飲美食', culture: '文化創意', tech: '科技應用',
    agri: '農漁創新', social: '社會創新', service: '生活服務',
  };
  const DISTRICTS = ['港埕區', '北岸區', '舊城區', '山腳區', '新灣區', '鹽田區', '溪洲區', '雲嶺區'];

  const people = {
    'u-lin': { name: '林語彤', role: 'officer', title: '承辦人 · 收件值班', hue: 262 },
    'u-chen': { name: '陳柏諺', role: 'officer', title: '承辦人', hue: 205 },
    'u-huang': { name: '黃郁晴', role: 'officer', title: '承辦人', hue: 330 },
    'u-wu': { name: '吳承翰', role: 'officer', title: '承辦人', hue: 160 },
    'u-wang': { name: '王思穎', role: 'chief', title: '創業發展科 科長', hue: 32 },
    'r-hsu': { name: '許文馨', role: 'reviewer', title: '澄港大學 創業管理學系 副教授', hue: 290 },
    'r-cheng': { name: '鄭凱元', role: 'reviewer', title: '品牌策略顧問', hue: 14 },
    'r-tsai': { name: '蔡佩珊', role: 'reviewer', title: '執業會計師', hue: 188 },
    'r-chou': { name: '周孟儒', role: 'reviewer', title: '社會企業 執行長', hue: 140 },
    'r-hsieh': { name: '謝秉宏', role: 'reviewer', title: '澄港科技大學 資訊工程系 教授', hue: 222 },
    'r-yeh': { name: '葉芷瑄', role: 'reviewer', title: '創投公司 投資經理', hue: 48 },
  };
  Object.keys(people).forEach((id) => { people[id].id = id; });

  const program = {
    name: '澄港市青年創業補助計畫',
    agency: '澄港市政府青年事務局 創業發展科',
    period: '115 年度第 2 期',
    open: '2026-08-01',
    close: '2026-10-31T17:00',
    budget: 12000000,
    tiers: {
      seed: { label: '種子型', max: 300000, ratio: 0.7, desc: '籌備中或設立未滿 2 年' },
      growth: { label: '成長型', max: 1000000, ratio: 0.5, desc: '設立滿 2 年、未滿 5 年' },
    },
    eligibility: { ageMin: 20, ageMax: 45, residencyMonths: 6, companyMaxYears: 5, grantCooldownYears: 3 },
    excluded: ['金融投資及其教學', '加盟展店', '菸酒及電子菸', '博弈及彩券'],
    budgetItems: ['人事費', '設備費', '租金', '行銷推廣', '原物料', '顧問及專業服務', '其他'],
    passScore: 70,
    gapAlert: 15,
    nextSerial: 443,
  };

  const rubric = [
    { key: 'innovation', label: '創新性', max: 25 },
    { key: 'market', label: '市場可行性', max: 25 },
    { key: 'team', label: '團隊能力', max: 20 },
    { key: 'finance', label: '財務規劃', max: 15 },
    { key: 'local', label: '在地效益', max: 15 },
  ];

  const docs = [
    { key: 'form', label: '申請書（線上填寫）', required: true },
    { key: 'plan', label: '創業計畫書', required: true },
    { key: 'budget', label: '經費預算表', required: true },
    { key: 'id', label: '身分證明文件', required: true },
    { key: 'residency', label: '設籍證明（戶籍謄本）', required: true },
    { key: 'registration', label: '公司 / 商業登記事項卡', required: false, note: '籌備中免附' },
    { key: 'tax', label: '無欠稅證明', required: true },
    { key: 'pledge', label: '切結書', required: true },
  ];

  const committee = {
    no: 4,
    title: '115 年度第 4 次審議委員會',
    at: '2026-10-29T14:00',
    place: '市府行政中心 B 棟 7 樓 第 2 會議室',
    chair: 'u-wang',
    previous: { no: 3, at: '2026-09-24T14:00' },
  };

  // 評分 items 依序對應 rubric：創新性、市場可行性、團隊能力、財務規劃、在地效益
  const cases = [
    { id: 'YSG-115-0304', title: '「潮間帶」海廢再製文具品牌', applicant: '簡沛恩', age: 28, org: '潮間設計工作室', cat: 'culture', district: '新灣區', tier: 'seed', total: 420000, request: 290000, jobs: 2,
      summary: '回收新灣區沿岸廢棄漁網與浮球，再製為筆記本封面與文具，並與在地國小合作淨灘教育。',
      status: 'disbursed', owner: 'u-lin', reviewers: ['r-cheng', 'r-chou'], submitted: '2026-08-03T14:20', updated: '2026-10-14T16:10', sla: null,
      approvedAt: '2026-09-30', granted: 290000, disbursedAt: '2026-10-14T16:10',
      scores: { 'r-cheng': { items: [22, 21, 17, 13, 13], at: '2026-09-11', note: '海廢再製題材具話題性，通路規劃清楚；建議補強量產後的原料穩定度。' },
                'r-chou': { items: [20, 20, 17, 12, 13], at: '2026-09-12', note: '淨灘教育與國小合作具在地效益，財務規劃保守可行。' } } },
    { id: 'YSG-115-0309', title: '山腳高冷蔬菜冷鏈共配', applicant: '曾冠廷', age: 34, org: '嶺鮮物流有限公司', cat: 'agri', district: '山腳區', tier: 'growth', total: 2100000, request: 980000, jobs: 6,
      summary: '整合山腳區 23 戶小農的高冷蔬菜，以共配冷藏車每日直送港埕區餐廳，降低損耗與運費。',
      status: 'disbursed', owner: 'u-chen', reviewers: ['r-yeh', 'r-tsai'], submitted: '2026-08-05T10:02', updated: '2026-10-16T11:30', sla: null,
      approvedAt: '2026-10-02', granted: 900000, disbursedAt: '2026-10-16T11:30',
      scores: { 'r-yeh': { items: [22, 23, 18, 13, 12], at: '2026-09-14', note: '冷鏈共配解決實際痛點，已有 23 戶簽約，擴張性佳。' },
                'r-tsai': { items: [20, 21, 17, 14, 12], at: '2026-09-15', note: '冷藏車購置占比高，折舊攤提需再確認；委員會建議核減 8 萬元。' } } },
    { id: 'YSG-115-0315', title: '舊城老屋共享廚房', applicant: '鄧又寧', age: 31, org: '灶咖餐飲有限公司', cat: 'food', district: '舊城區', tier: 'growth', total: 1560000, request: 760000, jobs: 4,
      summary: '活化舊城區閒置街屋為合規共享廚房，以時段出租給餐飲新創與市集攤商。',
      status: 'disbursed', owner: 'u-lin', reviewers: ['r-cheng', 'r-tsai'], submitted: '2026-08-10T16:45', updated: '2026-10-20T16:45', sla: null,
      approvedAt: '2026-10-02', granted: 760000, disbursedAt: '2026-10-20T16:45',
      scores: { 'r-cheng': { items: [19, 20, 16, 12, 12], at: '2026-09-16', note: '空間活化構想佳，但時段出租的定價策略稍嫌樂觀。' },
                'r-tsai': { items: [20, 21, 17, 13, 12], at: '2026-09-17', note: '已取得 6 家餐飲新創進駐意向書，現金流估算可信。' } } },
    { id: 'YSG-115-0318', title: '鹽田曬鹽體驗與海鹽選物', applicant: '洪若涵', age: 29, org: '鹽光小舖', cat: 'agri', district: '鹽田區', tier: 'seed', total: 380000, request: 260000, jobs: 2,
      summary: '復興鹽田區傳統曬鹽工法，結合半日曬鹽體驗與海鹽調味品選物店。',
      status: 'approved', owner: 'u-huang', reviewers: ['r-chou', 'r-yeh'], submitted: '2026-08-12T09:18', updated: '2026-10-02T15:00',
      sla: { kind: '撥款', start: '2026-10-02T15:00', due: '2026-10-22T17:00' }, approvedAt: '2026-10-02', granted: 260000,
      scores: { 'r-chou': { items: [21, 19, 16, 11, 14], at: '2026-09-17', note: '曬鹽工法保存具文化價值，體驗設計完整。' },
                'r-yeh': { items: [20, 18, 15, 11, 13], at: '2026-09-18', note: '客單價偏低、規模化有限，但符合種子型定位。' } } },
    { id: 'YSG-115-0322', title: 'AI 輔助長照排班系統', applicant: '范承恩', age: 36, org: '照程科技股份有限公司', cat: 'tech', district: '港埕區', tier: 'growth', total: 2400000, request: 1000000, jobs: 5,
      summary: '以排班最佳化演算法協助居家長照機構安排照服員路線，試辦機構平均交通時間減少 22%。',
      status: 'approved', owner: 'u-wu', reviewers: ['r-hsieh', 'r-yeh'], submitted: '2026-08-14T11:40', updated: '2026-10-06T10:20',
      sla: { kind: '撥款', start: '2026-10-06T10:20', due: '2026-10-26T17:00' }, approvedAt: '2026-10-06', granted: 1000000,
      scores: { 'r-hsieh': { items: [24, 22, 18, 13, 13], at: '2026-09-18', note: '排班演算法有試辦數據佐證，技術門檻高。' },
                'r-yeh': { items: [23, 22, 17, 13, 12], at: '2026-09-19', note: '長照市場需求明確，建議補充資安與個資保護規劃。' } } },
    { id: 'YSG-115-0327', title: '溪洲稻鴨共生米品牌', applicant: '劉品妤', age: 27, org: '稻鴨田作社', cat: 'agri', district: '溪洲區', tier: 'seed', total: 360000, request: 250000, jobs: 2,
      summary: '推廣無農藥稻鴨共生農法，建立溪洲區產地品牌並開發小包裝禮盒通路。',
      status: 'approved', owner: 'u-lin', reviewers: ['r-chou', 'r-tsai'], submitted: '2026-08-18T13:55', updated: '2026-10-08T14:10',
      sla: { kind: '撥款', start: '2026-10-08T14:10', due: '2026-10-28T17:00' }, approvedAt: '2026-10-08', granted: 250000,
      scores: { 'r-chou': { items: [21, 20, 16, 12, 15], at: '2026-09-19', note: '農法友善環境，與在地農會合作關係穩固。' },
                'r-tsai': { items: [20, 19, 16, 12, 13], at: '2026-09-20', note: '禮盒通路毛利試算合理。' } } },
    { id: 'YSG-115-0331', title: '視障者語音導覽 App', applicant: '江柏翰', age: 33, org: '聲景無障礙股份有限公司', cat: 'social', district: '北岸區', tier: 'growth', total: 1800000, request: 880000, jobs: 4,
      summary: '為北岸區 12 處公共場館建置室內語音導覽與觸覺地圖，讓視障者能自主參觀。',
      status: 'approved', owner: 'u-chen', reviewers: ['r-hsieh', 'r-chou'], submitted: '2026-08-21T10:12', updated: '2026-10-13T09:40',
      sla: { kind: '撥款', start: '2026-10-13T09:40', due: '2026-11-02T17:00' }, approvedAt: '2026-10-13', granted: 880000,
      scores: { 'r-hsieh': { items: [23, 21, 17, 13, 14], at: '2026-09-20', note: 'App 架構成熟，觸覺地圖製作成本需控管。' },
                'r-chou': { items: [23, 22, 18, 13, 15], at: '2026-09-21', note: '社會影響力顯著，已取得 3 個視障團體支持。' } } },
    { id: 'YSG-115-0336', title: '雲嶺高山茶冷萃飲品', applicant: '蘇冠宇', age: 30, org: '雲上茶研所', cat: 'food', district: '雲嶺區', tier: 'seed', total: 400000, request: 280000, jobs: 2,
      summary: '以雲嶺區高山烏龍製作冷萃瓶裝茶，主打登山客與咖啡館通路。',
      status: 'rejected', owner: 'u-huang', reviewers: ['r-cheng', 'r-yeh'], submitted: '2026-08-25T15:30', updated: '2026-09-24T17:20', sla: null,
      droppedAt: 3, closedAt: '2026-09-24T17:20', closeReason: '第 3 次審議委員會決議不予補助：產品與既有茶飲品牌區隔不足。',
      scores: { 'r-cheng': { items: [17, 18, 15, 12, 12], at: '2026-09-21', note: '產品差異化不足，品牌定位需再聚焦。' },
                'r-yeh': { items: [16, 17, 15, 11, 12], at: '2026-09-22', note: '冷萃茶市場競爭激烈，通路規劃薄弱。' } } },
    { id: 'YSG-115-0342', title: '港埕夜市行動支付整合', applicant: '楊子晴', age: 32, org: '夜行數位有限公司', cat: 'tech', district: '港埕區', tier: 'growth', total: 1900000, request: 900000, jobs: 5,
      summary: '為港埕夜市 180 個攤位導入整合收款與點餐看板，並提供攤商營收儀表板。',
      status: 'committee', owner: 'u-wu', reviewers: ['r-hsieh', 'r-yeh'], submitted: '2026-08-27T09:50', updated: '2026-10-08T16:00',
      sla: { kind: '委員會', start: '2026-10-08T16:00', due: '2026-10-29T14:00' },
      scores: { 'r-hsieh': { items: [21, 21, 16, 12, 12], at: '2026-10-06', note: '支付整合技術可行，需注意與既有金流業者的合約限制。' },
                'r-yeh': { items: [22, 22, 17, 12, 12], at: '2026-10-07', note: '已有 46 個攤位簽署合作意向，推廣策略務實。' } } },
    { id: 'YSG-115-0347', title: '北岸單車維修與共享站', applicant: '廖晨皓', age: 26, org: '北岸輪轉工作室', cat: 'service', district: '北岸區', tier: 'seed', total: 330000, request: 230000, jobs: 2,
      summary: '於北岸自行車道設置維修站與二手單車共享，並培訓中輟青年成為單車技師。',
      status: 'committee', owner: 'u-lin', reviewers: ['r-cheng', 'r-chou'], submitted: '2026-08-31T14:05', updated: '2026-10-12T11:15',
      sla: { kind: '委員會', start: '2026-10-12T11:15', due: '2026-10-29T14:00' },
      scores: { 'r-cheng': { items: [19, 19, 15, 11, 14], at: '2026-10-09', note: '社會目的明確，品牌識別可再加強。' },
                'r-chou': { items: [18, 18, 15, 11, 14], at: '2026-10-10', note: '培訓中輟青年的成效指標設計良好。' } } },
    { id: 'YSG-115-0351', title: '新住民媽媽南洋便當', applicant: '阮秋恆', age: 38, org: '秋恆廚房', cat: 'social', district: '鹽田區', tier: 'seed', total: 300000, request: 210000, jobs: 5,
      summary: '聘用鹽田區新住民媽媽製作東南亞風味便當，供應企業團膳並開設料理課程。',
      status: 'committee', owner: 'u-huang', reviewers: ['r-chou', 'r-tsai'], submitted: '2026-09-02T10:30', updated: '2026-10-14T15:40',
      sla: { kind: '委員會', start: '2026-10-14T15:40', due: '2026-10-29T14:00' },
      scores: { 'r-chou': { items: [21, 21, 17, 13, 15], at: '2026-10-11', note: '提供新住民就業機會，在地連結深厚，料理課程已有穩定報名。' },
                'r-tsai': { items: [17, 16, 14, 9, 12], at: '2026-10-13', note: '團膳報價低於成本結構，第二年起恐有虧損，財務規劃需大幅修正。' } } },
    { id: 'YSG-115-0356', title: '舊城古蹟 AR 實境解謎', applicant: '唐以樂', age: 29, org: '拾光互動有限公司', cat: 'culture', district: '舊城區', tier: 'growth', total: 1450000, request: 700000, jobs: 4,
      summary: '以舊城區 8 處歷史建築為場景設計 AR 實境解謎路線，並與沿線店家合作導流。',
      status: 'committee', owner: 'u-lin', reviewers: ['r-cheng', 'r-hsieh'], submitted: '2026-09-04T13:25', updated: '2026-10-16T10:05',
      sla: { kind: '委員會', start: '2026-10-16T10:05', due: '2026-10-29T14:00' },
      scores: { 'r-cheng': { items: [23, 21, 16, 12, 13], at: '2026-10-14', note: 'AR 路線設計精緻，與店家導流機制具體。' },
                'r-hsieh': { items: [21, 20, 15, 12, 12], at: '2026-10-15', note: '技術團隊有遊戲開發經驗，內容更新成本需估列。' } } },
    { id: 'YSG-115-0360', title: '溪洲魚菜共生示範場', applicant: '白宇倫', age: 35, org: '共生農創有限公司', cat: 'agri', district: '溪洲區', tier: 'growth', total: 2000000, request: 950000, jobs: 6,
      summary: '建置 600 坪魚菜共生溫室，提供學校食農教育與社區蔬菜訂閱。',
      status: 'committee', owner: 'u-chen', reviewers: ['r-yeh', 'r-tsai'], submitted: '2026-09-07T09:05', updated: '2026-10-21T15:12',
      sla: { kind: '委員會', start: '2026-10-21T15:12', due: '2026-10-29T14:00' },
      scores: { 'r-yeh': { items: [19, 18, 15, 12, 12], at: '2026-10-19', note: '示範場資本支出大，回收期約 6 年偏長。' },
                'r-tsai': { items: [20, 19, 15, 13, 12], at: '2026-10-20', note: '訂閱制收入穩定性尚可，建議分期建置。' } } },
    { id: 'YSG-115-0364', title: '寵物鮮食訂閱', applicant: '何芊卉', age: 25, org: '毛日子鮮食', cat: 'service', district: '新灣區', tier: 'seed', total: 450000, request: 300000, jobs: 2,
      summary: '以人食等級食材製作寵物鮮食，提供每週冷凍配送訂閱。',
      status: 'rejected', owner: 'u-wu', reviewers: ['r-cheng', 'r-tsai'], submitted: '2026-09-08T17:40', updated: '2026-10-09T10:00', sla: null,
      droppedAt: 2, closedAt: '2026-10-09T10:00', closeReason: '實質審查平均 60 分，未達 70 分門檻。',
      scores: { 'r-cheng': { items: [15, 14, 13, 9, 11], at: '2026-10-07', note: '市場已有多家同質業者，缺乏差異化。' },
                'r-tsai': { items: [14, 13, 12, 8, 11], at: '2026-10-08', note: '食材成本估算偏低，毛利結構不合理。' } } },
    { id: 'YSG-115-0368', title: '山腳露營地數位預約', applicant: '羅士杰', age: 31, org: '山野營地管理顧問有限公司', cat: 'tech', district: '山腳區', tier: 'seed', total: 380000, request: 260000, jobs: 2,
      summary: '整合山腳區 14 處合法露營地的線上預約與動態定價，並提供營主管理後台。',
      status: 'substantive', owner: 'u-wu', reviewers: ['r-hsieh', 'r-yeh'], submitted: '2026-09-10T08:30', updated: '2026-10-21T16:05',
      sla: { kind: '實質審查', start: '2026-10-06T10:00', due: '2026-10-20T17:00' },
      scores: { 'r-hsieh': { items: [21, 19, 16, 12, 12], at: '2026-10-21T16:05', note: '預約系統功能完整，動態定價模型需更多資料驗證。' } } },
    { id: 'YSG-115-0371', title: '港埕漁市直播拍賣', applicant: '張書豪', age: 28, org: '漁獲直送有限公司', cat: 'agri', district: '港埕區', tier: 'growth', total: 1700000, request: 820000, jobs: 4,
      summary: '於港埕魚市每日清晨直播競標當日漁獲，產地直送餐廳與家庭。',
      status: 'substantive', owner: 'u-chen', reviewers: ['r-yeh', 'r-tsai'], submitted: '2026-09-14T11:20', updated: '2026-10-20T14:02',
      sla: { kind: '實質審查', start: '2026-10-09T10:00', due: '2026-10-23T12:00' }, scores: {} },
    { id: 'YSG-115-0375', title: '銀髮健走社群與保健課程', applicant: '許家瑜', age: 37, org: '樂齡行社會企業', cat: 'social', district: '北岸區', tier: 'seed', total: 350000, request: 240000, jobs: 3,
      summary: '規劃北岸區 6 條銀髮健走路線，搭配物理治療師的肌力課程與社群陪走員。',
      status: 'substantive', owner: 'u-lin', reviewers: ['r-chou', 'r-tsai'], submitted: '2026-09-16T15:10', updated: '2026-10-21T18:22',
      sla: { kind: '實質審查', start: '2026-10-11T10:00', due: '2026-10-25T17:00' },
      scores: { 'r-chou': { items: [20, 21, 16, 12, 14], at: '2026-10-21T18:10', note: '健走路線規劃結合在地資源，陪走員培訓設計用心。' } } },
    { id: 'YSG-115-0379', title: '手作皮件職人學院', applicant: '鄭宇彤', age: 30, org: '革物所', cat: 'culture', district: '舊城區', tier: 'seed', total: 410000, request: 285000, jobs: 3,
      summary: '開設皮件製作職訓課程並承接品牌代工，協助結訓學員以工作室形式獨立接單。',
      status: 'substantive', owner: 'u-huang', reviewers: ['r-cheng', 'r-hsu'], submitted: '2026-09-18T10:45', updated: '2026-10-22T09:48',
      sla: { kind: '實質審查', start: '2026-10-14T10:00', due: '2026-10-28T17:00' }, scores: {} },
    { id: 'YSG-115-0383', title: '雲嶺民宿循環布草洗滌', applicant: '黎俊宏', age: 39, org: '雲白洗衣有限公司', cat: 'service', district: '雲嶺區', tier: 'growth', total: 1650000, request: 780000, jobs: 5,
      summary: '為雲嶺區 40 家民宿提供布草租洗循環服務，以熱回收設備降低 30% 能耗。',
      status: 'substantive', owner: 'u-wu', reviewers: ['r-tsai', 'r-hsu'], submitted: '2026-09-21T09:35', updated: '2026-10-16T10:00',
      sla: { kind: '實質審查', start: '2026-10-16T10:00', due: '2026-10-30T17:00' }, scores: {} },
    { id: 'YSG-115-0385', title: '加密貨幣投資教學社群', applicant: '方俊傑', age: 29, org: '個人（籌備中）', cat: 'service', district: '港埕區', tier: 'seed', total: 300000, request: 210000, jobs: 1,
      summary: '經營付費會員制的加密貨幣投資教學社群與線上課程。',
      status: 'rejected', owner: 'u-chen', reviewers: [], submitted: '2026-09-22T22:10', updated: '2026-10-03T11:00', sla: null,
      droppedAt: 1, closedAt: '2026-10-03T11:00', closeReason: '形式審查不合格：金融投資教學屬本計畫排除業別。', scores: {} },
    { id: 'YSG-115-0388', title: '校園二手教科書交換', applicant: '邱詠晴', age: 23, org: '書循環工作室', cat: 'social', district: '新灣區', tier: 'seed', total: 260000, request: 180000, jobs: 2,
      summary: '建立大專院校二手教科書寄售與交換平台，以校園取書櫃降低交易成本。',
      status: 'substantive', owner: 'u-lin', reviewers: ['r-hsu', 'r-tsai'], submitted: '2026-09-24T13:15', updated: '2026-10-20T09:05',
      sla: { kind: '實質審查', start: '2026-10-13T10:00', due: '2026-10-27T17:00' },
      scores: { 'r-hsu': { items: [20, 18, 15, 11, 13], at: '2026-10-20T09:05', note: '校園需求明確，取書櫃設置點需與校方確認。' } } },
    { id: 'YSG-115-0392', title: '無人機農藥精準噴灑', applicant: '詹承佑', age: 33, org: '翔農科技有限公司', cat: 'tech', district: '溪洲區', tier: 'growth', total: 2600000, request: 1000000, jobs: 5,
      summary: '以多光譜影像判讀病蟲害熱區，提供溪洲區稻農精準噴灑代工服務，減少用藥 35%。',
      status: 'substantive', owner: 'u-chen', reviewers: ['r-hsieh', 'r-tsai'], submitted: '2026-09-25T16:20', updated: '2026-10-20T10:20',
      sla: { kind: '實質審查', start: '2026-10-20T10:20', due: '2026-11-03T17:00' }, scores: {} },
    { id: 'YSG-115-0395', title: '港區咖啡烘焙與職人培訓', applicant: '林芮安', age: 27, org: '灣岸烘豆所', cat: 'food', district: '新灣區', tier: 'seed', total: 440000, request: 300000, jobs: 3,
      summary: '於新灣區設立小型烘豆廠，提供咖啡師職能培訓並供應在地咖啡館熟豆。',
      status: 'substantive', owner: 'u-lin', reviewers: ['r-cheng', 'r-hsu'], submitted: '2026-09-28T10:40', updated: '2026-10-21T11:30',
      sla: { kind: '實質審查', start: '2026-10-21T11:30', due: '2026-11-04T17:00' }, scores: {} },
    { id: 'YSG-115-0398', title: '鹽田蚵殼再生建材', applicant: '蔡宗翰', age: 33, org: '蚵殼循環材料有限公司', cat: 'agri', district: '鹽田區', tier: 'growth', total: 1850000, request: 900000, jobs: 6,
      summary: '回收鹽田區蚵殼煅燒為環保建材與透水磚，已與 2 家營造廠完成試用。',
      status: 'supplement', owner: 'u-lin', reviewers: [], submitted: '2026-09-29T14:50', updated: '2026-10-22T10:12',
      sla: { kind: '補件期限', start: '2026-10-08T15:00', due: '2026-10-22T23:59' },
      missing: [{ doc: 'tax', note: '原附證明開立日期逾 3 個月' }, { doc: 'registration', note: '登記地址與計畫書營運地址不符' }], uploaded: ['tax'], scores: {} },
    { id: 'YSG-115-0401', title: '北岸海景輕食餐車', applicant: '宋怡君', age: 26, org: '個人（籌備中）', cat: 'food', district: '北岸區', tier: 'seed', total: 320000, request: 224000, jobs: 2,
      summary: '以電動餐車於北岸海濱經營輕食與在地果汁，假日進駐市集活動。',
      status: 'formal', owner: 'u-lin', reviewers: [], submitted: '2026-10-08T19:30', updated: '2026-10-12T09:00',
      sla: { kind: '形式審查', start: '2026-10-12T09:00', due: '2026-10-21T17:00' }, scores: {} },
    { id: 'YSG-115-0403', title: '親子共學木工教室', applicant: '嚴詩涵', age: 31, org: '小木匠工坊', cat: 'culture', district: '山腳區', tier: 'seed', total: 350000, request: 245000, jobs: 2,
      summary: '於山腳區開設親子木工共學課程，並以社區修繕服務培養在地木工人才。',
      status: 'supplement', owner: 'u-huang', reviewers: [], submitted: '2026-10-08T21:05', updated: '2026-10-16T14:30',
      sla: { kind: '補件期限', start: '2026-10-16T14:30', due: '2026-10-30T23:59' },
      missing: [{ doc: 'plan', note: '第 4 章財務預估未附' }], uploaded: [], scores: {} },
    { id: 'YSG-115-0405', title: '智慧停車感測共享', applicant: '馮子豪', age: 34, org: '泊點科技有限公司', cat: 'tech', district: '港埕區', tier: 'growth', total: 2200000, request: 1000000, jobs: 5,
      summary: '於港埕區商圈私有停車格加裝地磁感測器，釋出閒置時段供分時共享。',
      status: 'formal', owner: 'u-chen', reviewers: [], submitted: '2026-10-09T10:15', updated: '2026-10-13T09:00',
      sla: { kind: '形式審查', start: '2026-10-13T09:00', due: '2026-10-22T17:00' }, scores: {} },
    { id: 'YSG-115-0407', title: '新灣手搖飲加盟店', applicant: '柯家豪', age: 46, org: '個人（籌備中）', cat: 'food', district: '新灣區', tier: 'seed', total: 500000, request: 300000, jobs: 3,
      summary: '加盟連鎖手搖飲品牌，於新灣區捷運站周邊開設門市。',
      status: 'rejected', owner: 'u-huang', reviewers: [], submitted: '2026-10-09T13:40', updated: '2026-10-14T16:00', sla: null,
      droppedAt: 1, closedAt: '2026-10-14T16:00', closeReason: '資格不符：申請人年齡逾 45 歲上限，且加盟展店屬排除業別。', scores: {} },
    { id: 'YSG-115-0409', title: '溪洲有機堆肥社區循環', applicant: '葛欣怡', age: 32, org: '土壤銀行社會企業', cat: 'social', district: '溪洲區', tier: 'seed', total: 300000, request: 210000, jobs: 2,
      summary: '回收社區廚餘製作有機堆肥，以「堆肥換蔬菜」機制回饋參與家戶。',
      status: 'formal', owner: 'u-lin', reviewers: [], submitted: '2026-10-12T08:50', updated: '2026-10-14T09:00',
      sla: { kind: '形式審查', start: '2026-10-14T09:00', due: '2026-10-23T17:00' }, scores: {} },
    { id: 'YSG-115-0411', title: '社區長者共餐外送', applicant: '莊博文', age: 40, org: '好食伴社會企業', cat: 'social', district: '溪洲區', tier: 'seed', total: 300000, request: 210000, jobs: 4,
      summary: '與溪洲區 5 間社區關懷據點合作，提供獨居長者共餐與送餐服務。',
      status: 'supplement', owner: 'u-lin', reviewers: [], submitted: '2026-10-12T15:30', updated: '2026-10-19T17:10',
      sla: { kind: '補件期限', start: '2026-10-19T17:10', due: '2026-11-02T23:59' },
      missing: [{ doc: 'residency', note: '設籍未滿 6 個月，需附遷入日期證明' }], uploaded: [], scores: {} },
    { id: 'YSG-115-0414', title: '傳統糕餅文創禮盒', applicant: '鍾佳穎', age: 29, org: '鍾記餅舖', cat: 'food', district: '舊城區', tier: 'seed', total: 390000, request: 270000, jobs: 3,
      summary: '承接家族三代糕餅老店，以舊城區街景插畫重新設計伴手禮盒並開發電商通路。',
      status: 'formal', owner: 'u-huang', reviewers: [], submitted: '2026-10-13T11:05', updated: '2026-10-15T09:00',
      sla: { kind: '形式審查', start: '2026-10-15T09:00', due: '2026-10-26T17:00' }, scores: {} },
    { id: 'YSG-115-0416', title: '復古底片沖洗與暗房', applicant: '魏若晴', age: 24, org: '顯影室', cat: 'culture', district: '舊城區', tier: 'seed', total: 330000, request: 231000, jobs: 2,
      summary: '提供底片沖洗掃描與暗房租借，並開設黑白放相工作坊。',
      status: 'supplement', owner: 'u-wu', reviewers: [], submitted: '2026-10-13T20:20', updated: '2026-10-22T09:20',
      sla: { kind: '補件期限', start: '2026-10-22T09:20', due: '2026-11-05T23:59' },
      missing: [{ doc: 'budget', note: '人事費占總經費 58%，需說明編列依據' }], uploaded: [], scores: {} },
    { id: 'YSG-115-0418', title: '視障按摩預約與職能平台', applicant: '尤建廷', age: 41, org: '光手按摩工作坊', cat: 'social', district: '港埕區', tier: 'seed', total: 280000, request: 196000, jobs: 6,
      summary: '建置視障按摩師線上預約與企業到點服務，協助 12 位視障按摩師穩定接案。',
      status: 'formal', owner: 'u-wu', reviewers: [], submitted: '2026-10-14T09:25', updated: '2026-10-16T09:00',
      sla: { kind: '形式審查', start: '2026-10-16T09:00', due: '2026-10-27T17:00' }, scores: {} },
    { id: 'YSG-115-0423', title: '雲嶺森林療癒步道導覽', applicant: '胡曉雯', age: 35, org: '林間學校有限公司', cat: 'service', district: '雲嶺區', tier: 'seed', total: 360000, request: 250000, jobs: 3,
      summary: '培訓森林療癒引導員，於雲嶺區規劃 4 條療癒步道並承接企業紓壓團體。',
      status: 'formal', owner: 'u-lin', reviewers: [], submitted: '2026-10-15T14:40', updated: '2026-10-19T09:00',
      sla: { kind: '形式審查', start: '2026-10-19T09:00', due: '2026-10-28T17:00' }, scores: {} },
    { id: 'YSG-115-0427', title: '電動機車電池交換站', applicant: '盧冠霖', age: 38, org: '換電行動股份有限公司', cat: 'tech', district: '新灣區', tier: 'growth', total: 3000000, request: 1000000, jobs: 7,
      summary: '於新灣區住宅密集處布建 8 座電池交換站，與外送平台合作提供騎士月租方案。',
      status: 'formal', owner: 'u-chen', reviewers: [], submitted: '2026-10-16T10:50', updated: '2026-10-20T09:00',
      sla: { kind: '形式審查', start: '2026-10-20T09:00', due: '2026-10-29T17:00' }, scores: {} },
    { id: 'YSG-115-0433', title: '港埕二手家電維修再生', applicant: '潘志明', age: 36, org: '再生電器行', cat: 'service', district: '港埕區', tier: 'seed', total: 340000, request: 238000, jobs: 2,
      summary: '回收港埕區汰換家電進行檢修再生，提供社福單位與租屋族平價保固家電。',
      status: 'received', owner: null, reviewers: [], submitted: '2026-10-20T08:52', updated: '2026-10-20T08:52',
      sla: { kind: '收件分派', start: '2026-10-20T08:52', due: '2026-10-22T08:52' }, scores: {} },
    { id: 'YSG-115-0436', title: '雲嶺手工皂與植萃保養', applicant: '高語晨', age: 28, org: '山城皂坊', cat: 'culture', district: '雲嶺區', tier: 'seed', total: 300000, request: 210000, jobs: 1,
      summary: '以雲嶺區契作香草製作冷製手工皂與植萃保養品，結合民宿通路與 DIY 體驗。',
      status: 'received', owner: null, reviewers: [], submitted: '2026-10-20T15:31', updated: '2026-10-20T15:31',
      sla: { kind: '收件分派', start: '2026-10-20T15:31', due: '2026-10-22T15:31' }, scores: {} },
    { id: 'YSG-115-0438', title: '跨境電商物流代集運', applicant: '侯冠伶', age: 33, org: '渡口物流有限公司', cat: 'service', district: '港埕區', tier: 'growth', total: 1600000, request: 760000, jobs: 4,
      summary: '利用港埕區港口優勢提供跨境電商小包集運與退貨處理，服務在地中小品牌出海。',
      status: 'received', owner: null, reviewers: [], submitted: '2026-10-21T10:05', updated: '2026-10-21T10:05',
      sla: { kind: '收件分派', start: '2026-10-21T10:05', due: '2026-10-23T10:05' }, scores: {} },
    { id: 'YSG-115-0440', title: '青銀共居媒合平台', applicant: '甘承恩', age: 30, org: '同一屋簷社會企業', cat: 'social', district: '北岸區', tier: 'seed', total: 320000, request: 224000, jobs: 2,
      summary: '媒合北岸區獨居長者的閒置房間與在學青年，以陪伴時數折抵租金。',
      status: 'received', owner: null, reviewers: [], submitted: '2026-10-21T22:47', updated: '2026-10-21T22:47',
      sla: { kind: '收件分派', start: '2026-10-21T22:47', due: '2026-10-23T22:47' }, scores: {} },
    { id: 'YSG-115-0442', title: '山腳自然農法果醬', applicant: '姚安琪', age: 26, org: '果醬山舍', cat: 'food', district: '山腳區', tier: 'seed', total: 280000, request: 196000, jobs: 1,
      summary: '收購山腳區自然農法格外品水果製作低糖果醬，以訂閱制與市集販售。',
      status: 'received', owner: null, reviewers: [], submitted: '2026-10-22T08:14', updated: '2026-10-22T08:14',
      sla: { kind: '收件分派', start: '2026-10-22T08:14', due: '2026-10-26T08:14' }, scores: {} },
  ];

  // who：人員 id、'applicant'（該案申請人）或 'system'
  const activity = [
    { at: '2026-10-22T10:12', who: 'applicant', case: 'YSG-115-0398', type: 'supplement', text: '上傳補件「無欠稅證明」' },
    { at: '2026-10-22T09:48', who: 'r-hsu', case: 'YSG-115-0379', type: 'comment', text: '財務預估第 3 年營收成長 180% 偏樂觀，建議請申請人補充品牌代工的合作證明。' },
    { at: '2026-10-22T09:20', who: 'u-wu', case: 'YSG-115-0416', type: 'status', from: 'formal', to: 'supplement', text: '要求補件：經費預算表' },
    { at: '2026-10-22T08:14', who: 'system', case: 'YSG-115-0442', type: 'received', text: '收到線上申請' },
    { at: '2026-10-21T18:22', who: 'r-chou', case: 'YSG-115-0375', type: 'comment', text: '我這邊已完成評分，另一位委員的部分可能需要承辦協助提醒。' },
    { at: '2026-10-21T16:05', who: 'r-hsieh', case: 'YSG-115-0368', type: 'score', text: '提交評分 80 分' },
    { at: '2026-10-21T15:12', who: 'u-wang', case: 'YSG-115-0360', type: 'status', from: 'substantive', to: 'committee', text: '排入第 4 次審議委員會' },
    { at: '2026-10-21T11:30', who: 'u-lin', case: 'YSG-115-0395', type: 'assign', text: '指派審查委員 鄭凱元、許文馨' },
    { at: '2026-10-20T16:45', who: 'u-lin', case: 'YSG-115-0315', type: 'status', from: 'approved', to: 'disbursed', text: '撥款完成 NT$ 760,000' },
    { at: '2026-10-20T14:02', who: 'r-yeh', case: 'YSG-115-0371', type: 'comment', text: '本週出差，評分預計 10/23 上午完成。' },
    { at: '2026-10-20T10:20', who: 'u-chen', case: 'YSG-115-0392', type: 'assign', text: '指派審查委員 謝秉宏、蔡佩珊' },
    { at: '2026-10-20T09:05', who: 'r-hsu', case: 'YSG-115-0388', type: 'score', text: '提交評分 77 分' },
    { at: '2026-10-19T17:10', who: 'u-lin', case: 'YSG-115-0411', type: 'status', from: 'formal', to: 'supplement', text: '要求補件：設籍證明（戶籍謄本）' },
  ];

  const DATA = { program, people, cases, activity, committee, rubric, docs };

  /* ------------------------------------------------------------------
   * 資料查詢
   * ------------------------------------------------------------------ */
  const caseIndex = new Map(cases.map((c) => [c.id, c]));
  const getCase = (id) => caseIndex.get(id) || null;
  const person = (id) => people[id] || null;
  const stageOf = (c) => c.status === 'rejected' ? c.droppedAt : STATUS[c.status].stage;
  const isActive = (c) => c.status !== 'rejected' && c.status !== 'disbursed';
  const closedTime = (c) => c.status === 'disbursed' ? time(c.disbursedAt) : c.status === 'rejected' ? time(c.closedAt) : null;

  function score(c, rid) {
    const s = c.scores && c.scores[rid];
    if (!s) return null;
    return { total: s.items.reduce((a, b) => a + b, 0), items: s.items, at: s.at, note: s.note };
  }
  function avgScore(c) {
    const list = c.reviewers.map((r) => score(c, r)).filter(Boolean);
    return list.length ? list.reduce((a, s) => a + s.total, 0) / list.length : null;
  }
  function scoreGap(c) {
    const list = c.reviewers.map((r) => score(c, r)).filter(Boolean);
    return list.length === 2 ? Math.abs(list[0].total - list[1].total) : null;
  }
  function funnel() {
    return STAGES.map((st, i) => ({
      ...st,
      index: i,
      reached: cases.filter((c) => stageOf(c) >= i).length,
      pending: cases.filter((c) => isActive(c) && stageOf(c) === i).length,
      dropped: cases.filter((c) => c.status === 'rejected' && c.droppedAt === i).length,
    }));
  }
  function reviewerLoad() {
    return Object.values(people).filter((p) => p.role === 'reviewer').map((p) => {
      const assigned = cases.filter((c) => c.status === 'substantive' && c.reviewers.includes(p.id));
      return {
        person: p,
        capacity: 5,
        pending: assigned.filter((c) => !score(c, p.id)).length,
        done: cases.filter((c) => score(c, p.id)).length,
      };
    });
  }

  /* ------------------------------------------------------------------
   * 狀態流轉：所有頁面共用同一套規則，SLA 與活動紀錄才會一致
   * ------------------------------------------------------------------ */
  const SLA_RULES = {
    received: { kind: '收件分派', due: (t) => addWorkdays(t, 2) },
    formal: { kind: '形式審查', due: (t) => addWorkdays(t, 7) },
    supplement: { kind: '補件期限', due: (t) => atTime(t + 14 * DAY, 23, 59) },
    substantive: { kind: '實質審查', due: (t) => atTime(t + 14 * DAY, 17, 0) },
    committee: { kind: '委員會', due: () => time(committee.at) },
    approved: { kind: '撥款', due: (t) => atTime(t + 20 * DAY, 17, 0) },
  };
  function transition(c, to, { note } = {}) {
    const snapshot = JSON.stringify(c);
    const from = c.status;
    const t = Math.round(now());
    const me = persona();
    c.status = to;
    c.updated = t;
    if (to === 'rejected') {
      c.droppedAt = STATUS[from].stage;
      c.closedAt = t;
      c.closeReason = note || '經審查不符補助要件。';
      c.sla = null;
    } else if (to === 'disbursed') {
      c.disbursedAt = t;
      c.sla = null;
    } else {
      const rule = SLA_RULES[to];
      c.sla = { kind: rule.kind, start: t, due: rule.due(t) };
    }
    if (to === 'approved') { c.approvedAt = t; c.granted = c.granted || c.request; }
    if (!c.owner) c.owner = me.role === 'officer' ? me.id : 'u-lin';
    const entry = { at: t, who: me.id, case: c.id, type: 'status', from, to, text: note || `狀態變更為「${STATUS[to].label}」` };
    activity.unshift(entry);
    emit('app:case', { case: c, from, to });
    return {
      undo() {
        const restored = JSON.parse(snapshot);
        Object.keys(c).forEach((k) => { delete c[k]; });
        Object.assign(c, restored);
        const i = activity.indexOf(entry);
        if (i >= 0) activity.splice(i, 1);
        emit('app:case', { case: c, from: to, to: from, undo: true });
      },
    };
  }

  /* ------------------------------------------------------------------
   * SLA
   * ------------------------------------------------------------------ */
  function sla(src) {
    const s = src.sla !== undefined ? src.sla : src;
    if (!s) return null;
    const due = time(s.due), start = time(s.start);
    const remain = due - now();
    const frac = Math.min(1, Math.max(0, remain / (due - start)));
    const state = remain < 0 ? 'over' : remain < 8 * 3600e3 ? 'crit' : remain < 48 * 3600e3 ? 'soon' : 'ok';
    let label;
    if (state === 'over') label = '逾期 ' + fmt.dur(remain);
    else if (state === 'ok' && remain >= 7 * DAY) label = fmt.date(due) + ' 到期';
    else label = '剩 ' + fmt.dur(remain);
    return { due, start, remain, frac, state, label, kind: s.kind };
  }
  function slaRingSvg(info, size) {
    const off = info.state === 'over' ? 0 : 100 - info.frac * 100;
    return `<svg class="sla__ring" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">`
      + '<circle class="sla__pulse" cx="10" cy="10" r="8"/>'
      + '<circle class="sla__track" cx="10" cy="10" r="8"/>'
      + `<circle class="sla__bar" cx="10" cy="10" r="8" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="${off.toFixed(2)}"/></svg>`;
  }
  function slaBadge(src, { countdown = false, size = 16, text = true, ring = true } = {}) {
    const info = sla(src);
    if (!info) return '';
    const label = countdown ? (info.state === 'over' ? '+' : '') + fmt.countdown(info.remain) : info.label;
    return `<span class="sla" data-sla data-due="${info.due}" data-start="${info.start}"${countdown ? ' data-countdown' : ''} data-state="${info.state}" title="${esc(info.kind || 'SLA')}：${fmt.dateTime(info.due)} 到期">`
      + (ring ? slaRingSvg(info, size) : '') + (text ? `<span class="sla__text">${label}</span>` : `<span class="sr-only">${info.label}</span>`) + '</span>';
  }
  function tickSla() {
    $$('[data-sla]').forEach((el) => {
      const info = sla({ due: Number(el.dataset.due), start: Number(el.dataset.start) });
      if (el.dataset.state !== info.state) el.dataset.state = info.state;
      const bar = el.querySelector('.sla__bar');
      if (bar) bar.setAttribute('stroke-dashoffset', (info.state === 'over' ? 0 : 100 - info.frac * 100).toFixed(2));
      const txt = el.querySelector('.sla__text');
      if (txt) {
        const label = el.hasAttribute('data-countdown') ? (info.state === 'over' ? '+' : '') + fmt.countdown(info.remain) : info.label;
        if (txt.textContent !== label) txt.textContent = label;
      }
    });
    $$('[data-clock]').forEach((el) => { el.textContent = fmt.clock(now()); });
    $$('[data-countdown-to]').forEach((el) => { el.textContent = fmt.countdown(time(el.dataset.countdownTo) - now()); });
  }

  /* ------------------------------------------------------------------
   * 標記產生器
   * ------------------------------------------------------------------ */
  function statusIcon(s, cls = '') {
    return `<svg class="sd ${cls}" data-s="${s}" viewBox="0 0 16 16" aria-hidden="true">`
      + '<circle class="sd__ring" cx="8" cy="8" r="6" pathLength="100"/>'
      + '<circle class="sd__pie" cx="8" cy="8" r="2.25" pathLength="100" transform="rotate(-90 8 8)"/>'
      + '<path class="sd__check" d="M5.4 8.2l1.75 1.75 3.5-3.8" pathLength="1"/>'
      + '<path class="sd__cross" d="M6 6l4 4M10 6l-4 4"/></svg>';
  }
  function statusChip(s, { pill = false } = {}) {
    return `<span class="status${pill ? ' status--pill' : ''}" data-status="${s}">${statusIcon(s)}<span class="status__label" data-status-label>${STATUS[s].label}</span></span>`;
  }
  function setStatus(target, s) {
    const svgs = target.matches && target.matches('.sd') ? [target] : $$('.sd', target);
    svgs.forEach((svg) => {
      svg.setAttribute('data-s', s);
      svg.classList.remove('is-morph');
      // 強制 reflow 讓同一元素連續 morph 時動畫能重新播放
      void svg.getBoundingClientRect();
      svg.classList.add('is-morph');
      svg.addEventListener('animationend', () => svg.classList.remove('is-morph'), { once: true });
    });
    if (!(target.matches && target.matches('.sd'))) {
      $$('[data-status-label]', target).forEach((lab) => {
        lab.classList.add('is-swap');
        setTimeout(() => { lab.textContent = STATUS[s].label; lab.classList.remove('is-swap'); }, 180);
      });
      $$('[data-status]', target).forEach((el) => { el.dataset.status = s; });
      if (target.dataset && 'status' in target.dataset) target.dataset.status = s;
    }
  }
  function avatar(who, size = '') {
    const p = typeof who === 'string' ? person(who) : who;
    if (!p) return `<span class="avatar avatar--empty ${size ? 'avatar--' + size : ''}" role="img" aria-label="未分派" title="未分派">${icon('user')}</span>`;
    const ch = p.name.length >= 3 ? p.name.slice(1, 2) : p.name.slice(0, 1);
    return `<span class="avatar ${size ? 'avatar--' + size : ''}" style="--h:${p.hue}" role="img" aria-label="${esc(p.name)}" title="${esc(p.name)}">${esc(ch)}</span>`;
  }
  function applicantPerson(c) {
    let h = 0;
    for (const ch of c.applicant) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return { name: c.applicant, hue: h };
  }
  function stageTrack(c, { labels = true } = {}) {
    const cur = stageOf(c);
    const rejected = c.status === 'rejected';
    const segs = STAGES.map((st, i) => {
      let cls = '';
      if (rejected && i === cur) cls = 'is-dropped';
      else if (i < cur || (c.status === 'disbursed' && i === cur)) cls = 'is-done';
      else if (i === cur) cls = 'is-current';
      return `<div class="stage-track__seg ${cls}" style="--seg-c:var(--st-${st.status})"><span class="stage-track__bar"></span>${labels ? `<span class="stage-track__label">${st.label}</span>` : ''}</div>`;
    }).join('');
    const where = rejected ? `於${STAGES[cur].label}階段退件` : `目前在${STAGES[cur].label}階段`;
    return `<div class="stage-track" role="img" aria-label="流程進度：${where}">${segs}</div>`;
  }

  // Fritsch–Carlson 單調三次插值：累計數列畫成曲線時不會出現假的下凹或過衝
  function monotonePath(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const dx = [], dy = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${(pts[i][0] + h).toFixed(1)} ${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)} ${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
    }
    return d;
  }
  function sparkline(values, { w = 88, h = 30, color = 'var(--accent)', label = '' } = {}) {
    const max = Math.max(...values), min = Math.min(...values);
    const x = (i) => 3 + (i / (values.length - 1)) * (w - 6);
    const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
    const pts = values.map((v, i) => [x(i), y(v)]);
    const d = monotonePath(pts);
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="--spark-c:${color}" role="img" aria-label="${esc(label)}">`
      + `<path class="spark__area" d="${d}L${last[0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}Z"/>`
      + `<path class="spark__line" d="${d}" pathLength="1"/>`
      + `<circle class="spark__dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3"/></svg>`;
  }

  const EMPTY_ART = {
    inbox: '<rect class="fl" x="30" y="22" width="72" height="50" rx="8"/><path class="ln" d="M30 52h20l5 8h22l5-8h20"/><path class="ac" d="M55 36l7 7 14-15"/><path class="ln" d="M14 30h8M110 30h8M18 18l5 5M114 18l-5 5"/>',
    search: '<circle class="fl" cx="58" cy="40" r="22"/><path class="ln" d="M74 56l18 18"/><path class="ac" d="M50 40h16"/><path class="ln" d="M16 70h22M100 22h18M104 30h10"/>',
    done: '<circle class="fl" cx="66" cy="44" r="26"/><path class="ac" d="M54 44l8 8 16-17"/><path class="ln" d="M22 26l6 3M110 26l-6 3M20 62h8M104 62h8"/>',
  };
  function emptyState({ art = 'inbox', title, text = '' }) {
    return `<div class="empty"><svg class="empty__art" viewBox="0 0 132 88" aria-hidden="true">${EMPTY_ART[art]}</svg><div class="empty__title">${esc(title)}</div>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}</div>`;
  }

  function whoName(a) {
    if (a.who === 'applicant') { const c = getCase(a.case); return c ? c.applicant : '申請人'; }
    if (a.who === 'system') return '系統';
    return person(a.who).name;
  }
  const ACTIVITY_ICON = { comment: 'comment', status: 'swap', supplement: 'paperclip', received: 'inbox', assign: 'users', score: 'gauge' };

  function casePeek(c) {
    const tier = program.tiers[c.tier];
    const ratio = (c.request / c.total * 100).toFixed(1);
    const sections = [];
    // 標題由抽屜標頭承載（eyebrow 放案號、title 放計畫名稱），這裡從狀態列開始
    sections.push(`<div class="cluster">${statusChip(c.status, { pill: true })}${c.sla ? slaBadge(c) : ''}<span class="tag">${tier.label}</span><span class="tag">${CATEGORIES[c.cat]}</span></div>
      <p class="peek-summary">${esc(c.summary)}</p>`);
    sections.push(`<div class="peek-section__title">流程進度</div>${stageTrack(c)}`);
    sections.push(`<dl class="kv">
      <dt>申請人</dt><dd>${esc(c.applicant)}（${c.age} 歲）</dd>
      <dt>事業名稱</dt><dd>${esc(c.org)}</dd>
      <dt>行政區</dt><dd>${c.district}</dd>
      <dt>總經費</dt><dd class="num">${fmt.money(c.total)}</dd>
      <dt>申請補助</dt><dd class="num">${fmt.money(c.request)} <span class="muted">· ${ratio}%</span></dd>
      ${c.granted ? `<dt>核定金額</dt><dd class="num">${fmt.money(c.granted)}</dd>` : ''}
      <dt>預計新增就業</dt><dd>${c.jobs} 人</dd>
      <dt>送件時間</dt><dd>${fmt.dateTime(c.submitted)}</dd>
      <dt>承辦</dt><dd>${c.owner ? `<span class="person">${avatar(c.owner, 'sm')}<span class="person__name">${person(c.owner).name}</span></span>` : '<span class="muted">尚未分派</span>'}</dd>
    </dl>`);
    if (c.reviewers.length) {
      const rows = c.reviewers.map((rid) => {
        const s = score(c, rid);
        return `<div class="peek-reviewer"><span class="person">${avatar(rid)}<span class="person__name">${person(rid).name}</span></span>${s ? `<span class="peek-score">${s.total}<span class="muted" style="font-size:12px;font-weight:400"> / 100</span></span>` : '<span class="badge badge--warn">評分中</span>'}</div>`;
      }).join('');
      const avg = avgScore(c), gap = scoreGap(c);
      sections.push(`<div class="peek-section__title"><span>審查委員評分</span>${avg !== null ? `<span>平均 <b class="strong num">${avg.toFixed(1)}</b></span>` : ''}</div>${rows}`
        + (gap !== null && gap > program.gapAlert ? `<div class="callout callout--warn">${icon('alert')}<div>兩位委員分數差 <b>${gap} 分</b>，超過 ${program.gapAlert} 分門檻，建議於委員會中討論或加派第三位委員。</div></div>` : ''));
    }
    if (c.missing && c.missing.length) {
      const items = c.missing.map((m) => {
        const d = docs.find((x) => x.key === m.doc);
        const up = c.uploaded && c.uploaded.includes(m.doc);
        return `<div class="peek-reviewer"><span><span class="strong" style="font-weight:500">${d.label}</span><br><span class="muted" style="font-size:12px">${esc(m.note)}</span></span>${up ? '<span class="badge badge--info">已上傳待檢核</span>' : '<span class="badge badge--serious">待補件</span>'}</div>`;
      }).join('');
      sections.push(`<div class="peek-section__title">補件項目</div>${items}`);
    }
    if (c.status === 'rejected') {
      sections.push(`<div class="callout callout--danger">${icon('x')}<div><b>${fmt.date(c.closedAt)} 結案</b><br>${esc(c.closeReason)}</div></div>`);
    }
    const acts = activity.filter((a) => a.case === c.id).slice(0, 3);
    if (acts.length) {
      sections.push(`<div class="peek-section__title">最近活動</div><div class="timeline">${acts.map((a) => `
        <div class="tl-item"><span class="tl-item__dot">${icon(ACTIVITY_ICON[a.type])}</span><div class="tl-item__body">
          <div class="tl-item__head"><b>${esc(whoName(a))}</b> ${a.type === 'comment' ? '留言' : esc(a.text)}<span class="tl-item__time">${fmt.rel(a.at)}</span></div>
          ${a.type === 'comment' ? `<div class="comment">${esc(a.text)}</div>` : ''}</div></div>`).join('')}</div>`);
    }
    return sections.map((s, i) => `<section class="peek-section" style="--i:${i}">${s}</section>`).join('');
  }

  const caseUrl = (id) => `case.html?id=${encodeURIComponent(id)}`;
  const param = (name) => new URLSearchParams(location.search).get(name);

  /* ------------------------------------------------------------------
   * Toast：從底部堆疊，滑鼠移入時展開
   * ------------------------------------------------------------------ */
  const TONE_ICON = { success: 'check-circle', info: 'info', warn: 'alert', danger: 'alert', accent: 'bolt' };
  const toaster = (() => {
    let wrap = null;
    let expanded = false;
    const items = [];
    function host() {
      if (wrap) return wrap;
      wrap = document.createElement('section');
      wrap.className = 'toasts';
      wrap.setAttribute('aria-label', '系統通知');
      wrap.addEventListener('pointerenter', () => { expanded = true; layout(); items.forEach((t) => t.pause()); });
      wrap.addEventListener('pointerleave', () => { expanded = false; layout(); items.forEach((t) => t.resume()); });
      document.body.appendChild(wrap);
      return wrap;
    }
    function layout() {
      let y = 0;
      const frontH = items.length ? items[0].h : 0;
      items.forEach((t, i) => {
        const el = t.el;
        el.style.zIndex = String(50 - i);
        if (expanded) {
          el.classList.remove('is-behind');
          el.style.height = t.h + 'px';
          el.style.transform = `translateY(${-y}px)`;
          el.style.opacity = '1';
          y += t.h + 8;
        } else {
          el.classList.toggle('is-behind', i > 0);
          el.style.height = (i === 0 ? t.h : frontH) + 'px';
          el.style.transform = `translateY(${-i * 9}px) scale(${1 - i * 0.05})`;
          el.style.opacity = i > 2 ? '0' : '1';
        }
      });
      // 容器高度跟著堆疊長，滑鼠經過 toast 之間的縫隙才不會誤觸收合
      if (wrap) wrap.style.height = (expanded ? Math.max(0, y - 8) : frontH + Math.max(0, Math.min(items.length - 1, 2)) * 9) + 'px';
    }
    function dismiss(t) {
      const i = items.indexOf(t);
      if (i < 0) return;
      items.splice(i, 1);
      t.pause();
      t.el.classList.add('is-leaving');
      t.el.style.transform += ' translateY(16px)';
      setTimeout(() => t.el.remove(), 240);
      layout();
    }
    function show(title, opts = {}) {
      const { desc = '', tone = 'info', action = null } = opts;
      const duration = opts.duration || (action ? 6500 : 4200);
      const el = document.createElement('div');
      el.className = `toast toast--${tone} is-entering`;
      el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
      el.innerHTML = `${icon(TONE_ICON[tone], 'toast__icon')}<div class="toast__body"><div class="toast__title">${esc(title)}</div>${desc ? `<div class="toast__desc">${esc(desc)}</div>` : ''}</div>`
        + (action ? `<button class="btn btn--sm toast__action" type="button">${esc(action.label)}</button>` : '')
        + `<button class="icon-btn icon-btn--sm toast__close" type="button" aria-label="關閉通知">${icon('x')}</button>`;
      host().appendChild(el);
      const t = {
        el, h: el.offsetHeight, timer: null, left: duration, started: 0,
        start() { t.started = Date.now(); t.timer = setTimeout(() => dismiss(t), t.left); },
        pause() { if (t.timer) { clearTimeout(t.timer); t.timer = null; t.left -= Date.now() - t.started; } },
        resume() { if (!t.timer && items.includes(t)) t.start(); },
      };
      el.querySelector('.toast__close').addEventListener('click', () => dismiss(t));
      if (action) el.querySelector('.toast__action').addEventListener('click', () => { action.onClick(); dismiss(t); });
      items.unshift(t);
      while (items.length > 5) dismiss(items[items.length - 1]);
      layout();
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-entering')));
      if (!expanded) t.start();
      return { dismiss: () => dismiss(t) };
    }
    return { show };
  })();

  /* ------------------------------------------------------------------
   * Modal / Confirm（原生 <dialog>：焦點圈限與 inert 背景交給瀏覽器）
   * ------------------------------------------------------------------ */
  const modalStack = [];
  let uid = 0;
  function modal({ title, body = '', tone = '', icon: ic = '', size = 'md', note = '', actions = [], onClose } = {}) {
    const id = 'modal-title-' + (++uid);
    const dlg = document.createElement('dialog');
    dlg.className = `modal modal--${size}`;
    dlg.setAttribute('aria-labelledby', id);
    dlg.innerHTML = `<div class="modal__panel">
      <header class="modal__head">${ic ? `<span class="modal__icon ${tone ? 'modal__icon--' + tone : ''}">${icon(ic)}</span>` : ''}
        <h2 class="modal__title" id="${id}">${esc(title)}</h2>
        <button class="icon-btn icon-btn--sm" type="button" data-modal-x aria-label="關閉">${icon('x')}</button></header>
      <div class="modal__body"></div>
      ${actions.length ? `<footer class="modal__foot">${note ? `<span class="modal__foot-note">${esc(note)}</span>` : ''}</footer>` : ''}</div>`;
    const bodyEl = $('.modal__body', dlg);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    let closed = false;
    const ctrl = { el: dlg, body: bodyEl, close };
    function close() {
      if (closed) return;
      closed = true;
      const i = modalStack.indexOf(ctrl);
      if (i >= 0) modalStack.splice(i, 1);
      dlg.classList.add('is-closing');
      setTimeout(() => { dlg.close(); dlg.remove(); if (onClose) onClose(); }, reduceMotion.matches ? 0 : 150);
    }
    const foot = $('.modal__foot', dlg);
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.variant ? 'btn--' + a.variant : ''}`;
      b.innerHTML = esc(a.label) + (a.kbd ? ` <kbd class="kbd">${esc(a.kbd)}</kbd>` : '');
      if (a.autofocus) b.autofocus = true;
      b.addEventListener('click', () => (a.onClick ? a.onClick(close) : close()));
      foot.appendChild(b);
    });
    $('[data-modal-x]', dlg).addEventListener('click', close);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    modalStack.push(ctrl);
    return ctrl;
  }
  function confirmDialog({ title, message = '', confirmLabel = '確認', cancelLabel = '取消', tone = 'primary', icon: ic, note = '' }) {
    return new Promise((resolve) => {
      const variant = tone === 'danger' ? 'danger' : tone === 'ok' ? 'ok' : 'primary';
      const defaultIcon = tone === 'danger' ? 'alert' : tone === 'ok' ? 'check-circle' : 'info';
      modal({
        title, body: message, size: 'sm', note,
        tone: tone === 'primary' ? '' : tone, icon: ic || defaultIcon,
        actions: [
          { label: cancelLabel, variant: 'ghost', onClick: (close) => { resolve(false); close(); } },
          { label: confirmLabel, variant, autofocus: true, onClick: (close) => { resolve(true); close(); } },
        ],
        onClose: () => resolve(false),
      });
    });
  }

  /* ------------------------------------------------------------------
   * Drawer：右側預覽抽屜（非 modal，開著時 J/K 仍可換案件）
   * ------------------------------------------------------------------ */
  const drawer = (() => {
    let el = null, backdrop = null, onCloseCb = null, lastFocus = null;
    function build() {
      el = document.createElement('aside');
      el.className = 'drawer';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-labelledby', 'drawer-title');
      el.innerHTML = `<div class="drawer__head"><div class="drawer__heading"><div class="drawer__eyebrow" data-drawer-eyebrow></div><h2 class="drawer__title" id="drawer-title"></h2></div>
        <div class="drawer__tools"><a class="icon-btn" data-drawer-link href="index.html" aria-label="開啟完整頁面" data-tip="開啟完整頁面" data-tip-pos="bottom" hidden>${icon('external')}</a>
        <button class="icon-btn" type="button" data-drawer-close aria-label="關閉預覽" data-tip="關閉 Esc" data-tip-pos="left">${icon('x')}</button></div></div>
        <div class="drawer__body"></div><div class="drawer__foot" hidden></div>`;
      backdrop = document.createElement('div');
      backdrop.className = 'drawer-backdrop';
      backdrop.addEventListener('click', close);
      $('[data-drawer-close]', el).addEventListener('click', close);
      document.body.append(backdrop, el);
    }
    function open({ eyebrow = '', title = '', body = '', foot = '', href = '', onClose } = {}) {
      if (!el) build();
      const wasOpen = el.classList.contains('is-open');
      $('[data-drawer-eyebrow]', el).textContent = eyebrow;
      $('#drawer-title', el).textContent = title;
      const b = $('.drawer__body', el);
      if (typeof body === 'string') b.innerHTML = body; else b.replaceChildren(body);
      b.scrollTop = 0;
      const f = $('.drawer__foot', el);
      f.hidden = !foot;
      if (typeof foot === 'string') f.innerHTML = foot; else f.replaceChildren(foot);
      const link = $('[data-drawer-link]', el);
      link.hidden = !href;
      if (href) link.href = href;
      onCloseCb = onClose || null;
      el.classList.add('is-open');
      backdrop.classList.add('is-open');
      if (!wasOpen) {
        lastFocus = document.activeElement;
        $('[data-drawer-close]', el).focus({ preventScroll: true });
      }
      return el;
    }
    function close() {
      if (!el || !el.classList.contains('is-open')) return;
      el.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
      if (onCloseCb) onCloseCb();
    }
    return { open, close, get isOpen() { return !!el && el.classList.contains('is-open'); }, get el() { return el; } };
  })();

  /* ------------------------------------------------------------------
   * Menu：彈出選單（指派、排序、角色切換等）
   * ------------------------------------------------------------------ */
  let openMenu = null;
  function menu(anchor, { title = '', items = [], search = false, onSelect, align = 'start', placeholder = '搜尋…' } = {}) {
    if (openMenu) openMenu.close(true);
    const host = anchor.closest('dialog') || document.body;
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    if (title) el.setAttribute('aria-label', title);
    el.innerHTML = (search ? `<div class="menu__search"><input class="input" type="text" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off"></div>` : '')
      + (title ? `<div class="menu__label">${esc(title)}</div>` : '') + '<div class="menu__list"></div>';
    const list = $('.menu__list', el);
    function render(q = '') {
      const ql = q.trim().toLowerCase();
      const shown = items.filter((it) => it === 'sep' ? !ql : !ql || (it.label + ' ' + (it.sub || '') + ' ' + (it.keywords || '')).toLowerCase().includes(ql));
      list.innerHTML = shown.length ? shown.map((it) => it === 'sep' ? '<div class="menu__sep" role="separator"></div>'
        : `<button type="button" class="menu__item${it.danger ? ' menu__item--danger' : ''}" role="${it.checked !== undefined ? 'menuitemradio' : 'menuitem'}"${it.checked !== undefined ? ` aria-checked="${!!it.checked}"` : ''} data-i="${items.indexOf(it)}">`
          + (it.checked !== undefined ? icon('check', 'menu__tick') : '') + (it.icon || '')
          + `<span class="menu__item-text"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>`
          + (it.meta ? `<span class="menu__meta">${it.meta}</span>` : '') + '</button>').join('')
        : '<div class="menu__empty">沒有符合的項目</div>';
    }
    render();
    host.appendChild(el);
    // 定位：預設在錨點下方，空間不足時翻到上方，並夾在視窗內
    const r = anchor.getBoundingClientRect();
    const mw = el.offsetWidth, mh = el.offsetHeight;
    let left = align === 'end' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, innerWidth - mw - 8));
    let top = r.bottom + 6;
    let origin = 'top';
    if (top + mh > innerHeight - 8 && r.top - mh - 6 > 8) { top = r.top - mh - 6; origin = 'bottom'; }
    top = Math.max(8, Math.min(top, innerHeight - mh - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.setProperty('--origin', `${origin} ${align === 'end' ? 'right' : 'left'}`);
    anchor.setAttribute('aria-expanded', 'true');

    const focusables = () => $$('.menu__item', el);
    let closed = false;
    function close(silent) {
      if (closed) return;
      closed = true;
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      openMenu = null;
      el.classList.add('is-closing');
      setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 110);
      if (!silent && anchor.isConnected) anchor.focus({ preventScroll: true });
    }
    function outside(e) { if (!el.contains(e.target) && !anchor.contains(e.target)) close(true); }
    document.addEventListener('pointerdown', outside, true);
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.menu__item');
      if (!b) return;
      const it = items[Number(b.dataset.i)];
      close();
      if (onSelect) onSelect(it);
    });
    el.addEventListener('keydown', (e) => {
      const f = focusables();
      const i = f.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (f[i + 1] || f[0])?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? f[f.length - 1] : f[i - 1])?.focus(); }
      else if (e.key === 'Enter' && search && document.activeElement.matches('.menu__search input') && f[0]) { e.preventDefault(); f[0].click(); }
      else if (e.key === 'Tab') close(true);
    });
    if (search) {
      const input = $('.menu__search input', el);
      input.addEventListener('input', () => render(input.value));
      input.focus();
    } else {
      focusables()[0]?.focus();
    }
    openMenu = { close, el };
    return close;
  }
  function pickPerson(anchor, { role: r = 'officer', current = null, onPick, title } = {}) {
    const loads = new Map(reviewerLoad().map((l) => [l.person.id, l]));
    const items = Object.values(people).filter((p) => p.role === r).map((p) => ({
      label: p.name, sub: p.title, value: p, icon: avatar(p.id, 'sm'), checked: Array.isArray(current) ? current.includes(p.id) : current === p.id,
      meta: r === 'reviewer' ? `${loads.get(p.id).pending}/5` : `${cases.filter((c) => c.owner === p.id && isActive(c)).length} 件`,
    }));
    return menu(anchor, { title: title || (r === 'reviewer' ? '指派審查委員' : '指派承辦人'), items, search: true, placeholder: '搜尋姓名…', onSelect: (it) => onPick && onPick(it.value) });
  }

  /* ------------------------------------------------------------------
   * Tabs：ARIA tablist + 滑動底線
   * ------------------------------------------------------------------ */
  function tabs(list, { onChange } = {}) {
    const all = $$('[role="tab"]', list);
    let ink = $('.tabs__ink', list);
    if (!ink) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    list.classList.add('has-ink');
    function refresh() {
      const t = all.find((x) => x.getAttribute('aria-selected') === 'true');
      if (!t) return;
      ink.style.width = Math.max(0, t.offsetWidth - 16) + 'px';
      ink.style.transform = `translateX(${t.offsetLeft + 8}px)`;
    }
    function select(i, focus = false) {
      all.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panelId = t.getAttribute('aria-controls');
        if (panelId && document.getElementById(panelId)) document.getElementById(panelId).hidden = !on;
      });
      refresh();
      if (focus) all[i].focus();
      if (onChange) onChange(i, all[i]);
    }
    all.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
        if (k === undefined) return;
        e.preventDefault();
        select((k + all.length) % all.length, true);
      });
    });
    const sel = Math.max(0, all.findIndex((x) => x.getAttribute('aria-selected') === 'true'));
    all.forEach((t, k) => { t.tabIndex = k === sel ? 0 : -1; });
    refresh();
    document.fonts.ready.then(refresh);
    window.addEventListener('resize', refresh);
    return { select, refresh };
  }

  /* ------------------------------------------------------------------
   * 列表鍵盤導覽（J/K、Enter、Space、E、X、H）
   * ------------------------------------------------------------------ */
  const navLists = [];
  let activeList = null;
  function listNav(container, opts = {}) {
    const o = { item: '[data-nav-item]', ...opts };
    let idx = -1;
    const items = () => $$(o.item, container).filter((el) => el.getClientRects().length && !el.classList.contains('is-leaving'));
    const api = {
      container, opts: o,
      get index() { return idx; },
      current: () => items()[idx] || null,
      items,
      setIndex(i, { scroll = true, silent = false } = {}) {
        const list = items();
        $$('.is-cursor', container).forEach((el) => el.classList.remove('is-cursor'));
        if (!list.length) { idx = -1; return; }
        idx = Math.max(0, Math.min(list.length - 1, i));
        list[idx].classList.add('is-cursor');
        if (scroll) list[idx].scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
        if (!silent && o.onCursor) o.onCursor(list[idx]);
      },
      move(d) {
        const list = items();
        if (!list.length) return;
        const cur = container.querySelector('.is-cursor');
        const at = cur ? list.indexOf(cur) : -1;
        api.setIndex(at < 0 ? 0 : at + d);
      },
    };
    container.addEventListener('pointermove', (e) => {
      const el = e.target.closest(o.item);
      if (!el || !container.contains(el) || el.classList.contains('is-cursor')) return;
      activeList = api;
      api.setIndex(items().indexOf(el), { scroll: false, silent: true });
    });
    container.addEventListener('focusin', () => { activeList = api; });
    navLists.push(api);
    if (!activeList) activeList = api;
    return api;
  }
  function isInteractive(t) {
    return !!(t && t.closest && t.closest('button, a[href], input, select, textarea, summary, [role="tab"], [role="menuitem"], [contenteditable="true"]'));
  }
  function isTyping(t) {
    return !!(t && t.closest && t.closest('input, select, textarea, [contenteditable="true"]'));
  }

  /* ------------------------------------------------------------------
   * 快捷鍵
   * ------------------------------------------------------------------ */
  const pageShortcuts = [];
  function shortcut(key, handler, { desc = '', group = '本頁' } = {}) {
    pageShortcuts.push({ key, handler, desc, group });
  }
  const G_MAP = { o: 'index.html', q: 'queue.html', c: 'case.html', a: 'apply.html' };
  const modKey = () => (isMac ? '⌘' : 'Ctrl');
  const kbd = (...keys) => `<span class="kbd-combo">${keys.map((k) => `<kbd class="kbd">${esc(k)}</kbd>`).join('')}</span>`;

  function showShortcuts() {
    const groups = [
      { title: '全域', rows: [['開啟指令面板', kbd(modKey(), 'K')], ['搜尋案件', kbd('/')], ['顯示快捷鍵', kbd('?')], ['關閉浮層', kbd('Esc')]] },
      { title: '前往', rows: [['總覽', kbd('G', 'O')], ['案件佇列', kbd('G', 'Q')], ['案件詳情', kbd('G', 'C')], ['申請表單', kbd('G', 'A')]] },
    ];
    if (navLists.length) {
      const o = Object.assign({}, ...navLists.map((l) => l.opts));
      const rows = [['上下移動', `<span class="kbd-combo">${kbd('J')}<span class="muted">/</span>${kbd('K')}</span>`]];
      if (o.onOpen) rows.push(['開啟案件', kbd('↵')]);
      if (o.onPeek) rows.push(['預覽抽屜', kbd('Space')]);
      if (o.onAssign) rows.push(['指派', kbd('E')]);
      if (o.onToggle) rows.push(['選取 / 取消選取', kbd('X')]);
      if (o.onSnooze) rows.push(['延後到明天', kbd('H')]);
      groups.push({ title: '列表', rows });
    }
    if (pageShortcuts.length) {
      const byGroup = {};
      pageShortcuts.forEach((s) => { (byGroup[s.group] = byGroup[s.group] || []).push([s.desc, kbd(s.key.toUpperCase())]); });
      Object.entries(byGroup).forEach(([title, rows]) => groups.push({ title, rows }));
    }
    modal({
      title: '鍵盤快捷鍵', icon: 'keyboard', size: 'lg',
      body: `<div class="shortcut-grid">${groups.map((g) => `<section class="shortcut-group"><h3>${g.title}</h3>${g.rows.map(([d, k]) => `<div class="shortcut-row"><span>${d}</span>${k}</div>`).join('')}</section>`).join('')}</div>`,
    });
  }

  /* ------------------------------------------------------------------
   * 指令面板（⌘K / Ctrl+K）
   * ------------------------------------------------------------------ */
  const extraCommands = [];
  function registerCommands(list) { extraCommands.push(...list); }

  // 子序列模糊比對：連續命中與字首命中加權，整段子字串命中再加分
  function fuzzy(q, text) {
    const t = text.toLowerCase();
    const query = q.toLowerCase().replace(/\s+/g, '');
    if (!query) return { score: 0, idx: [] };
    let from = 0, prev = -2, sc = 0;
    const idx = [];
    for (const ch of query) {
      const f = t.indexOf(ch, from);
      if (f < 0) return null;
      sc += f === prev + 1 ? 6 : 1;
      if (f === 0 || /[\s\-·/「」（）]/.test(t[f - 1])) sc += 3;
      idx.push(f);
      prev = f;
      from = f + 1;
    }
    const sub = t.indexOf(query);
    if (sub >= 0) sc += 18 + (sub === 0 ? 8 : 0);
    sc -= (idx[idx.length - 1] - idx[0]) * 0.05;
    return { score: sc, idx };
  }
  function highlight(label, idx) {
    const set = new Set(idx.filter((i) => i < label.length));
    return [...label].map((ch, i) => set.has(i) ? `<mark>${esc(ch)}</mark>` : esc(ch)).join('');
  }
  function baseCommands() {
    const nav = [
      { id: 'go-index', label: '前往總覽', icon: icon('overview'), meta: kbd('G', 'O'), keywords: 'overview dashboard 首頁 inbox 待辦', run: () => { location.href = 'index.html'; } },
      { id: 'go-queue', label: '前往案件佇列', icon: icon('queue'), meta: kbd('G', 'Q'), keywords: 'queue list 列表', run: () => { location.href = 'queue.html'; } },
      { id: 'go-case', label: '前往案件詳情', icon: icon('file'), meta: kbd('G', 'C'), keywords: 'case detail', run: () => { location.href = 'case.html'; } },
      { id: 'go-apply', label: '開啟申請表單', icon: icon('file-plus'), meta: kbd('G', 'A'), keywords: 'apply form 新增 申請', run: () => { location.href = 'apply.html'; } },
    ].map((c) => ({ ...c, group: '前往' }));
    const views = [
      { id: 'view-mine', label: '檢視：我負責的案件', icon: icon('user'), keywords: 'mine 我的', run: () => { location.href = 'queue.html#view=mine'; } },
      { id: 'view-sla', label: '檢視：SLA 逾期與即將逾期', icon: icon('clock'), keywords: 'sla overdue 逾期', run: () => { location.href = 'queue.html#view=sla'; } },
      { id: 'view-committee', label: `檢視：第 ${committee.no} 次審議委員會`, icon: icon('scale'), keywords: 'committee 委員會 議程', run: () => { location.href = 'queue.html#view=committee'; } },
    ].map((c) => ({ ...c, group: '檢視' }));
    const actions = [
      { id: 'act-new', label: '新增補助申請', icon: icon('plus'), keywords: 'new create 建立', run: () => { location.href = 'apply.html'; } },
      ...Object.entries(ROLES).filter(([k]) => k !== role).map(([k, r]) => ({
        id: 'role-' + k, label: `切換角色：${r.label}（${person(r.person).name}）`, icon: icon('swap'), keywords: 'role switch 角色', run: () => setRole(k),
      })),
      { id: 'act-keys', label: '顯示鍵盤快捷鍵', icon: icon('keyboard'), meta: kbd('?'), keywords: 'shortcut help 說明', run: showShortcuts },
      { id: 'act-back', label: '返回作品目錄', icon: icon('arrow-left'), keywords: 'back catalogue 目錄', run: () => { location.href = '../../index.html'; } },
    ].map((c) => ({ ...c, group: '動作' }));
    return [...nav, ...views, ...actions];
  }
  function caseCommand(c) {
    return {
      id: 'case-' + c.id, group: '案件', label: c.title,
      sub: `<span class="mono">${c.id}</span> · ${esc(c.applicant)} · ${c.district}`,
      hay: `${c.id} ${c.applicant} ${c.org} ${c.district} ${CATEGORIES[c.cat]} ${STATUS[c.status].label}`,
      icon: statusIcon(c.status),
      meta: c.sla ? slaBadge(c, { text: false, size: 14 }) + `<span>${STATUS[c.status].label}</span>` : `<span>${STATUS[c.status].label}</span>`,
      run: () => { location.href = caseUrl(c.id); },
    };
  }

  const cmdk = (() => {
    let dlg = null, input, list, countEl;
    let results = [], sel = 0, closing = false;
    function build() {
      dlg = document.createElement('dialog');
      dlg.className = 'cmdk';
      dlg.setAttribute('aria-label', '指令面板');
      dlg.innerHTML = `<div class="cmdk__panel">
        <div class="cmdk__bar">${icon('search')}<input class="cmdk__input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="搜尋案件或指令" placeholder="搜尋案號、申請人、計畫名稱或指令…" autocomplete="off" spellcheck="false"><span class="cmdk__scope">${program.period}</span></div>
        <div class="cmdk__list" id="cmdk-list" role="listbox" aria-label="搜尋結果"></div>
        <div class="cmdk__foot"><span>${kbd('↑')}${kbd('↓')} 選擇</span><span>${kbd('↵')} 執行</span><span>${kbd('Esc')} 關閉</span><span class="cmdk__count"></span></div></div>`;
      document.body.appendChild(dlg);
      input = $('.cmdk__input', dlg);
      list = $('.cmdk__list', dlg);
      countEl = $('.cmdk__count', dlg);
      input.addEventListener('input', () => { sel = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
        else if (e.key === 'Home' && !input.value) { e.preventDefault(); sel = 0; paint(); }
      });
      list.addEventListener('pointermove', (e) => {
        const it = e.target.closest('.cmdk__item');
        if (it && Number(it.dataset.i) !== sel) { sel = Number(it.dataset.i); paint(false); }
      });
      list.addEventListener('click', (e) => {
        const it = e.target.closest('.cmdk__item');
        if (it) run(Number(it.dataset.i));
      });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    }
    function compute(q) {
      const cmds = [...baseCommands(), ...extraCommands.map((c) => ({ group: '本頁', ...c }))];
      if (!q.trim()) {
        const urgent = cases.filter((c) => c.sla && isActive(c)).sort((a, b) => time(a.sla.due) - time(b.sla.due)).slice(0, 4).map((c) => ({ ...caseCommand(c), group: '即將到期' }));
        return [...urgent, ...extraCommands.map((c) => ({ group: '本頁', ...c })), ...cmds.filter((c) => c.group !== '本頁')];
      }
      const scored = [];
      cases.forEach((c) => {
        const cc = caseCommand(c);
        const m = fuzzy(q, cc.label + '\u0001' + cc.hay);
        if (m) scored.push({ ...cc, score: m.score + 2, hl: highlight(cc.label, m.idx) });
      });
      cmds.forEach((c) => {
        const m = fuzzy(q, c.label + '\u0001' + (c.keywords || ''));
        if (m) scored.push({ ...c, score: m.score, hl: highlight(c.label, m.idx) });
      });
      scored.sort((a, b) => b.score - a.score);
      const caseHits = scored.filter((r) => r.group === '案件').slice(0, 8);
      const others = scored.filter((r) => r.group !== '案件').slice(0, 6);
      const caseFirst = caseHits.length && (!others.length || caseHits[0].score >= others[0].score);
      return caseFirst ? [...caseHits, ...others] : [...others, ...caseHits];
    }
    function render() {
      results = compute(input.value);
      let html = '', lastGroup = '';
      results.forEach((r, i) => {
        if (r.group !== lastGroup) { html += `<div class="cmdk__group" role="presentation">${esc(r.group)}</div>`; lastGroup = r.group; }
        html += `<div class="cmdk__item" role="option" id="cmdk-opt-${i}" data-i="${i}" aria-selected="false">${r.icon || ''}<span class="cmdk__text"><span class="cmdk__label">${r.hl || esc(r.label)}</span>${r.sub ? `<span class="cmdk__sub">${r.sub}</span>` : ''}</span><span class="cmdk__meta">${r.meta || ''}</span></div>`;
      });
      list.innerHTML = html || `<div class="cmdk__empty">找不到「${esc(input.value)}」相關的案件或指令</div>`;
      countEl.textContent = input.value.trim() ? `${results.length} 筆結果` : `${cases.length} 件案件可搜尋`;
      sel = Math.min(sel, Math.max(0, results.length - 1));
      paint();
    }
    function paint(scroll = true) {
      $$('.cmdk__item', list).forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.i) === sel)));
      const cur = $(`#cmdk-opt-${sel}`, list);
      if (cur) {
        input.setAttribute('aria-activedescendant', cur.id);
        if (scroll) cur.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }
    function move(d) {
      if (!results.length) return;
      sel = (sel + d + results.length) % results.length;
      paint();
    }
    function run(i) {
      const r = results[i];
      if (!r) return;
      close();
      r.run();
    }
    function open(q = '') {
      if (!dlg) build();
      if (dlg.open) return;
      if (openMenu) openMenu.close(true);
      closing = false;
      dlg.classList.remove('is-closing');
      input.value = q;
      sel = 0;
      render();
      dlg.showModal();
      input.focus();
    }
    function close() {
      if (!dlg || !dlg.open || closing) return;
      closing = true;
      dlg.classList.add('is-closing');
      setTimeout(() => { dlg.close(); closing = false; }, reduceMotion.matches ? 0 : 140);
    }
    return { open, close, toggle: () => (dlg && dlg.open ? close() : open()), get isOpen() { return !!dlg && dlg.open; } };
  })();

  /* ------------------------------------------------------------------
   * 角色
   * ------------------------------------------------------------------ */
  const ROLES = {
    officer: { label: '承辦人', person: 'u-lin' },
    reviewer: { label: '審查委員', person: 'r-hsu' },
    chief: { label: '主管', person: 'u-wang' },
  };
  // file:// 下若使用者封鎖網站資料，localStorage 會拋 SecurityError；角色只是偏好設定，取不到就用預設值
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch (err) { if (err.name === 'SecurityError') return null; throw err; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch (err) { if (err.name !== 'SecurityError') throw err; }
    },
  };
  const savedRole = store.get('ysg.role');
  let role = ROLES[savedRole] ? savedRole : 'officer';
  const persona = () => person(ROLES[role].person);
  function paintRole() {
    const p = persona();
    $$('[data-role-name]').forEach((el) => { el.textContent = p.name; });
    $$('[data-role-label]').forEach((el) => { el.textContent = ROLES[role].label; });
    $$('[data-role-avatar]').forEach((el) => { el.innerHTML = avatar(p.id); });
  }
  function setRole(r) {
    if (!ROLES[r] || r === role) return;
    role = r;
    store.set('ysg.role', r);
    paintRole();
    emit('app:role', { role: r, persona: persona() });
    toaster.show(`已切換為${ROLES[r].label}`, { desc: `目前以「${persona().name}」的身分檢視`, tone: 'accent' });
  }

  /* ------------------------------------------------------------------
   * 進場、數字滾動、光帶、離開視窗暫停
   * ------------------------------------------------------------------ */
  let revealIO = null;
  function reveal(root = document) {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (!els.length) return;
    if (reduceMotion.matches || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    const vh = innerHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('is-in');
    });
    document.documentElement.classList.add('js-reveal');
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); }
      }), { rootMargin: '0px 0px -6% 0px' });
    }
    els.filter((el) => !el.classList.contains('is-in')).forEach((el) => revealIO.observe(el));
    // 保底：截圖、列印或背景分頁時 IO 可能不觸發，3 秒後一律顯示，避免內容永遠隱藏
    setTimeout(() => els.forEach((el) => el.classList.add('is-in')), 3000);
  }

  function countUp(el) {
    const target = parseFloat(el.dataset.countTo);
    const dec = Number(el.dataset.decimals || 0);
    const out = (v) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduceMotion.matches) { el.textContent = out(target); return; }
    const t0 = performance.now(), dur = 1100;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = out(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  let countIO = null;
  function countUps(root = document) {
    const els = $$('[data-count-to]:not([data-counted])', root);
    els.forEach((el) => el.setAttribute('data-counted', ''));
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(countUp); return; }
    if (!countIO) {
      countIO = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { countUp(en.target); countIO.unobserve(en.target); }
      }));
    }
    els.forEach((el) => countIO.observe(el));
  }

  function initBand() {
    let raf = 0, pending = null;
    document.addEventListener('pointermove', (e) => {
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const row = pending.target.closest && pending.target.closest('[data-band] .row');
        if (!row) return;
        const r = row.getBoundingClientRect();
        row.style.setProperty('--mx', (pending.clientX - r.left).toFixed(0) + 'px');
      });
    }, { passive: true });
  }

  // 一次性的繪製 / 進場動畫播完就移除動畫屬性，之後即使樣式重算也不會重播
  const ONCE = new Set(['spark-draw', 'meter-grow', 'drawer-item']);
  document.addEventListener('animationend', (e) => {
    if (ONCE.has(e.animationName) && e.target.classList) e.target.classList.add('is-drawn');
  });

  function initAnimPause() {
    document.addEventListener('visibilitychange', () => {
      document.documentElement.classList.toggle('is-page-hidden', document.hidden);
    });
    const els = $$('[data-anim]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => en.target.classList.toggle('is-offscreen', !en.isIntersecting)));
    els.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------
   * 外殼：導覽 active、行動版側欄、全域按鈕
   * ------------------------------------------------------------------ */
  function initShell() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.sidenav__link').forEach((a) => {
      const on = (a.getAttribute('href') || '').toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('[data-mod]').forEach((el) => { el.textContent = modKey(); });

    const backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    document.body.appendChild(backdrop);
    const toggles = $$('[data-nav-toggle]');
    const setNav = (open) => {
      document.documentElement.classList.toggle('nav-open', open);
      toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
      if (open) $('.sidebar a, .sidebar button')?.focus({ preventScroll: true });
    };
    toggles.forEach((t) => t.addEventListener('click', () => setNav(!document.documentElement.classList.contains('nav-open'))));
    backdrop.addEventListener('click', () => setNav(false));
    $$('.sidebar a').forEach((a) => a.addEventListener('click', () => setNav(false)));
    window.addEventListener('resize', () => { if (innerWidth > 960) setNav(false); });
    shell.closeNav = () => {
      if (!document.documentElement.classList.contains('nav-open')) return false;
      setNav(false);
      toggles[0]?.focus({ preventScroll: true });
      return true;
    };

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cmdk], [data-shortcuts], [data-role-switch], [data-notify]');
      if (!t) return;
      if (t.matches('[data-cmdk]')) { setNav(false); cmdk.open(); }
      else if (t.matches('[data-shortcuts]')) showShortcuts();
      else if (t.matches('[data-role-switch]')) {
        menu(t, {
          title: '切換檢視角色',
          items: Object.entries(ROLES).map(([k, r]) => {
            const p = person(r.person);
            return { label: p.name, sub: p.title.startsWith(r.label) ? p.title : `${r.label} · ${p.title}`, icon: avatar(p.id, 'sm'), checked: k === role, value: k };
          }),
          onSelect: (it) => setRole(it.value),
        });
      } else if (t.matches('[data-notify]')) {
        const me = persona().id;
        const mine = activity.filter((a) => a.who !== me && a.who !== 'system' && (getCase(a.case).owner === me || getCase(a.case).reviewers.includes(me) || me === 'u-wang')).slice(0, 5);
        t.querySelector('.icon-btn__dot')?.remove();
        menu(t, {
          title: '通知', align: 'end',
          items: mine.length ? mine.map((a) => ({
            label: `${whoName(a)} ${a.type === 'comment' ? '留言' : a.text}`, sub: `${a.case} · ${fmt.rel(a.at)}`,
            icon: a.who === 'applicant' ? avatar(applicantPerson(getCase(a.case)), 'sm') : avatar(a.who, 'sm'), value: a.case,
          })) : [{ label: '目前沒有新通知', sub: '有人留言或上傳補件時會出現在這裡', value: null }],
          onSelect: (it) => { if (it.value) location.href = caseUrl(it.value); },
        });
      }
    });
  }
  const shell = { closeNav: () => false };

  function closeTopLayer() {
    if (openMenu) { openMenu.close(); return true; }
    if (cmdk.isOpen) { cmdk.close(); return true; }
    if (modalStack.length) { modalStack[modalStack.length - 1].close(); return true; }
    if (drawer.isOpen) { drawer.close(); return true; }
    return shell.closeNav();
  }

  let gPending = false, gTimer = 0;
  function onKeydown(e) {
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && k.toLowerCase() === 'k') { e.preventDefault(); cmdk.toggle(); return; }
    if (k === 'Escape') { if (closeTopLayer()) e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (isTyping(e.target)) return;
    if (openMenu || cmdk.isOpen || modalStack.length) return;
    const key = k.length === 1 ? k.toLowerCase() : k;

    if (gPending) {
      gPending = false;
      clearTimeout(gTimer);
      if (G_MAP[key]) { e.preventDefault(); location.href = G_MAP[key]; }
      return;
    }
    if (key === 'g') { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 1200); return; }
    if (k === '?') { e.preventDefault(); showShortcuts(); return; }
    if (k === '/') { e.preventDefault(); cmdk.open(); return; }

    const sc = pageShortcuts.find((s) => s.key === key);
    if (sc) { e.preventDefault(); sc.handler(e); return; }

    const L = activeList;
    if (!L || !L.container.isConnected) return;
    const o = L.opts;
    if (key === 'j') { e.preventDefault(); L.move(1); return; }
    if (key === 'k') { e.preventDefault(); L.move(-1); return; }
    const cur = L.current();
    if (!cur) return;
    if (k === 'Enter' && o.onOpen && !isInteractive(e.target)) { e.preventDefault(); o.onOpen(cur); }
    else if (k === ' ' && o.onPeek && !isInteractive(e.target)) { e.preventDefault(); o.onPeek(cur); }
    else if (key === 'e' && o.onAssign) { e.preventDefault(); o.onAssign(cur); }
    else if (key === 'x' && o.onToggle) { e.preventDefault(); o.onToggle(cur); }
    else if (key === 'h' && o.onSnooze) { e.preventDefault(); o.onSnooze(cur); }
  }

  /* ------------------------------------------------------------------
   * 待辦：依目前角色推導「需要我處理」的案件（總覽 inbox 與側欄計數共用）
   * ------------------------------------------------------------------ */
  function tasks() {
    const me = persona().id;
    const list = [];
    cases.forEach((c) => {
      if (role === 'officer') {
        if (c.status === 'received' && !c.owner) list.push({ c, reason: '新案件待收件分派（本週收件值班）', action: { label: '收件', to: 'formal' } });
        else if (c.owner !== me) return;
        else if (c.status === 'formal') list.push({ c, reason: '形式審查：檢核 8 項應備文件', action: { label: '通過形式審查', to: 'substantive' } });
        else if (c.status === 'supplement' && c.uploaded && c.uploaded.length) list.push({ c, reason: `申請人已上傳 ${c.uploaded.length}/${c.missing.length} 項補件，待檢核`, action: { label: '補件完成', to: 'formal' } });
        else if (c.status === 'approved') list.push({ c, reason: `已核定 ${fmt.money(c.granted)}，待辦理撥款`, action: { label: '撥款完成', to: 'disbursed' } });
      } else if (role === 'reviewer') {
        if (c.status === 'substantive' && c.reviewers.includes(me) && !score(c, me)) {
          list.push({ c, reason: '實質審查：評分表尚未提交', action: { label: '填寫評分', href: caseUrl(c.id) + '#rubric' } });
        }
      } else if (c.status === 'committee') {
        const gap = scoreGap(c);
        list.push({
          c, flag: gap > program.gapAlert,
          reason: `第 ${committee.no} 次審議會提案 · 平均 ${avgScore(c).toFixed(1)} 分` + (gap > program.gapAlert ? ` · 委員評分差 ${gap} 分` : ''),
          action: { label: '決議核定', to: 'approved', confirm: true },
        });
      }
    });
    return list.sort((a, b) => time(a.c.sla.due) - time(b.c.sla.due));
  }

  // 側欄與頁面上的 [data-count] 計數：狀態流轉或切換角色後自動重算
  function paintCounts() {
    const me = persona().id;
    const active = cases.filter(isActive);
    const counts = {
      tasks: tasks().length,
      active: active.length,
      mine: active.filter((c) => role === 'officer' ? c.owner === me : role === 'reviewer' ? c.reviewers.includes(me) : true).length,
      sla: active.filter((c) => c.sla && sla(c).state !== 'ok').length,
      committee: cases.filter((c) => c.status === 'committee').length,
    };
    $$('[data-count]').forEach((el) => {
      const v = counts[el.dataset.count];
      if (v !== undefined) el.textContent = v;
    });
  }

  /* ------------------------------------------------------------------
   * 公開 API
   * ------------------------------------------------------------------ */
  const App = {
    DATA, STATUS, STATUS_ORDER, STAGES, CATEGORIES, DISTRICTS, ICONS,
    getCase, person, stageOf, isActive, closedTime, funnel, reviewerLoad, score, avgScore, scoreGap, transition,
    caseUrl, param,
    now, time, fmt, sla, addWorkdays,
    esc, icon, statusIcon, statusChip, setStatus, avatar, applicantPerson, slaBadge, stageTrack, sparkline, monotonePath, casePeek, emptyState, kbd, whoName,
    toast: (title, opts) => toaster.show(title, opts),
    modal, confirm: confirmDialog, drawer, menu, pickPerson, tabs, listNav, registerCommands, shortcut,
    openCommandPalette: (q) => cmdk.open(q), showShortcuts,
    get role() { return role; }, ROLES, persona, setRole, tasks,
    reveal, countUp, countUps,
  };
  window.App = App;

  initShell();
  paintRole();
  paintCounts();
  document.addEventListener('app:case', paintCounts);
  document.addEventListener('app:role', paintCounts);
  reveal();
  countUps();
  initBand();
  initAnimPause();
  document.addEventListener('keydown', onKeydown);
  tickSla();
  setInterval(() => { if (!document.hidden) tickSla(); }, 1000);
})();
