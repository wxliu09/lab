/*
 * 澄港社宅 申請與抽籤管理 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 * <head> 另有一行 <script>document.documentElement.classList.add('js')</script>，
 * 讓進場動畫在第一次繪製前就生效（避免內容先出現再消失）。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 資料（全站共用、只在記憶體中變動；所有頁面讀同一份，人名／案號／數字才會一致）
 *   App.DATA.project      本期招租：港埕青年社宅 A/B 棟 420 戶、組別配額 quotas、戶型×組別供給 supply、租期
 *   App.DATA.buildings    兩棟樓的樓層與每層戶型排列（layout）
 *   App.DATA.units        420 戶清單 {code:'A-12F-07', building, floor, pos, type, size(坪), rent, group(保障配置)}
 *   App.DATA.timeline     七個流程階段 {key, label, start, end, state:'done'|'current'|'upcoming', note, milestone}
 *   App.DATA.applicants   審查二組工作清單 72 筆（完整資料，grid / kanban / 詳情頁用這份）
 *   App.DATA.all          全期 3,186 筆申請（含上面 72 筆的同一物件；其餘為輕量資料，getApplicant 時才補齊細節）
 *   App.DATA.staff        承辦與主管 {id: {name, title, team, hue}}；App.ME = 'lin'（目前登入者：林佩璇）
 *   App.DATA.rules        資格門檻（所得、動產、設籍）與評點用途說明
 *   App.DATA.lottery      公開抽籤資訊（時間、地點、公證人、種子組成、演算法）
 *   App.DATA.notifications 頁首通知
 *   App.GROUPS / App.GROUP_ORDER    一般戶 general · 弱勢戶 vulnerable · 在地青年 local（label, short, color, prefix）
 *   App.STATUS / App.STATUS_ORDER   初審中 screening · 待補件 supplement · 補件審查 resubmitted · 資格符合 qualified · 不符資格 ineligible
 *   App.UNITS / App.UNIT_ORDER      套房 studio · 一房型 one · 二房型 two · 三房型 three（label, color, size, rent, fit）
 *   App.SUBTYPES                    弱勢身分 low / midlow / disabled / senior / special / indigenous / kids3（label, color, pts）
 *   App.CHECKS / App.CHECK_RESULT   自動比對三項 income / property / residency；結果 pass / fail / review
 *   App.DOCS                        補件文件代碼 → 名稱
 *   App.DISTRICTS / App.DISTRICT_COLOR / App.BUILDING_PREF
 *   App.FIELDS                      申請人資料表欄位定義 {key, label, type(對應 App.fieldIcon), width}
 *
 * 查詢與異動（任何異動都會發出 document 事件 'app:data'，detail = {type, id, ...}；
 *            頁面只要監聽 App.on(fn) 並用同一個 render() 重繪即可同步計數）
 *   App.getApplicant(id)  → 完整紀錄（輕量資料會在這裡補齊家戶成員、所得、歷程）
 *   App.checksOf(a)       → [{key, label, result, source, syncedAt, value, limit, valueText, limitText, ratio, detail}]
 *   App.scoreOf(a)        → {total, max, items:[{key, label, pts}]}
 *   App.stats()           → 即時統計 {total, pending, byStatus, byGroup, byGroupStatus, byUnit, byGroupUnit, sub, checks, channel, rate}
 *   App.activity(limit)   → 最近活動（含本頁剛做的異動）[{at, by, type, text, from, to, a}]
 *   App.setStatus(id, to, {note, by}) → {undo()}      資格狀態變更（寫入歷程）
 *   App.setField(id, key, value, {by, text}) → {undo()} 其他欄位 inline 編輯（text 為歷程說明，省略時寫「更新欄位「…」」）
 *   App.setDoc(id, docKey, state) → {undo()}          補件文件狀態 missing / uploaded / accepted
 *   App.addNote(id, text, {by}) → {undo()}            新增備註
 *   App.on(fn) → off()    訂閱 'app:data'
 *   App.applicantUrl(id) · App.param(name) · App.DEFAULT_APPLICANT（詳情頁無 ?id 時的預設）
 * 抽籤
 *   App.lottery.pool(group, unit?)   名冊快照（10/22 10:30 已資格符合者）[{lot:'G0001', seq, id, name(遮罩), district, hh, unit, group}]
 *   App.lottery.quota(group, unit?)  正取名額（未給 unit 時為組別總配額）
 *   App.lottery.waitlist(group, unit?) 備取名額（正取 × 50%，無條件進位）
 *   App.lottery.rosterHash(group)    名冊 SHA-256（抽籤前公告，供事後驗證）
 *   App.lottery.draw(group, unit, seedHex) → {seed, order, winners, waitlist}  決定性抽籤：同種子必得同結果
 *   App.sha256(str) → hex（純 JS，file:// 下也能用）· App.prng(seed) → () => [0,1) · App.shuffle(arr, rng)
 * 時間與格式（一律以 UTC+8 計算；「現在」為 2026-10-22（四）10:30 起持續走動）
 *   App.now() · App.time('2026-10-30T14:00') → ms
 *   App.fmt.num / pct / money / wan / date('10/22') / dateW('10/22（四）') / dateFull / time / dateTime / rel
 *   App.fmt.days(from, to?) 經過的日曆日 · App.fmt.daysLeft('2026-10-28') 距該日剩幾個日曆日（今天為 0）
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(s) · App.icon(name, cls) · App.fieldIcon(type) · App.pill(text, color, {dot, cls, title})
 *   App.statusPill(s) · App.groupPill(g) · App.unitPill(u) · App.subPill(s) · App.districtPill(d) · App.buildingPill(b)
 *   App.checkIcon(result) · App.checkPill(result, label) · App.avatar(staffId | {name, hue}, size) · App.person(staffId)
 *   App.attachments(files) · App.floorplan(unit) · App.emptyState({title, text, action})
 * 互動元件
 *   App.toast(message, {tone:'info'|'success'|'warn'|'danger', desc, action:{label, onClick}, duration}) → {close}
 *   App.modal({title, eyebrow（兩者皆可含 HTML，文字請先 App.esc）, body, actions:[{label, variant, href, autofocus, onClick(close)}], size:'sm'|'md'|'lg'|'xl',
 *             from: 元素（從該元素展開的 expand 動畫，關閉時縮回）, onClose, className}) → {el, body, close}
 *   App.confirm({title, message, confirmLabel, cancelLabel, tone:'primary'|'danger'}) → Promise<boolean>
 *   App.menu(anchor, {items:[{label, value, color(顯示為 pill), icon, sub, desc, checked, danger, href} | 'sep' | {header}],
 *            search, placeholder, onSelect(value, item), align:'start'|'end', keepOpen}) → {close, el}
 *   App.tabs(tablistEl, {onChange(i, tab)}) → {select(i), index}     滑動底線；aria-controls 指到的 panel 會自動 hidden
 *   App.seg(container, {onChange(value, btn)}) → {select(value), value}  分段控制（按鈕 aria-pressed + data-value）
 *   App.reel(el, {value}) → {set(v), roll(v, opts), spin(v, opts) → Promise<bool>, value}   號碼滾輪（抽籤 / 倒數）
 *   App.odometer(el, number) 數字滾輪更新；HTML 寫 <span data-odometer="3186"></span> 會在進入畫面時自動轉入
 *   App.confetti({from: 元素 | x, y, count, spread, power, mode:'burst'|'cannons'})  彩帶（減少動態時不播）
 *   App.flip(nodes, mutate, {duration})  FLIP 位移動畫（排序、看板移動、名單插入）
 *   App.toggleHeight(el, open) → Promise  高度展開／收合（群組、列展開）
 *   App.stickyHead(scrollWrap) → {update}  .dg-wrap 內表頭在文件捲動時黏在 --sticky-top 下方
 *   App.reveal(root) · App.hydrate(root)  動態插入內容後重新掃描 [data-reveal] / [data-icon] / [data-odometer]
 *   App.csv(filename, rows) Blob 下載 CSV（含 BOM，Excel 開啟不亂碼）· App.copy(text) → Promise
 * 自動行為（不需呼叫）
 *   導覽 active 標示與 aria-current、行動版資料表選單（[data-nav-toggle]）、[data-action="help"] 說明、
 *   [data-action="notify"] 通知選單、[data-icon] / [data-field-icon] 圖示、[data-reveal] 進場、[data-odometer] 滾輪數字、
 *   [data-stat="qualified|pending|general.qualified|rate…"] 即時統計（data-stat-format="pct" 顯示百分比）、
 *   [data-countdown-to="2026-10-30T14:00"] 倒數滾輪（加 data-countdown-part="d|h|m|s" 只顯示該段）、[data-clock] 時鐘、[data-rel-time] 相對時間、
 *   [data-loop] 離開視窗時暫停其中的無限動畫、「/」聚焦 [data-search]、Esc 關閉最上層選單／對話框
 */
(function () {
  'use strict';

  /* ==================================================================
   * 0. 基礎工具
   * ================================================================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !reduceMotion.matches;
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  let uid = 0;

  /* ==================================================================
   * 1. 時間與格式
   *    「現在」固定從 2026-10-22 10:30（UTC+8）起算並隨真實時間走動，
   *    讓倒數、相對時間在任何時區、任何日期開啟都一致。
   * ================================================================== */
  const TZ = 8 * 3600e3;
  const DAY = 86400e3;
  const NOW_BASE = Date.UTC(2026, 9, 22, 2, 30);
  const loadedAt = Date.now();
  const now = () => NOW_BASE + (Date.now() - loadedAt);

  function time(str) {
    const [d, t = '00:00'] = str.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [hh, mm] = t.split(':').map(Number);
    return Date.UTC(y, m - 1, day, hh, mm) - TZ;
  }
  function parts(ms) {
    const d = new Date(ms + TZ);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), w: d.getUTCDay() };
  }
  const toMs = (v) => (typeof v === 'number' ? v : time(v));
  // 天數一律以 UTC+8 的日曆日相減：10/20 下午到 10/22 上午算 2 天，
  // 「2 天前」「等待 2 天」「剩 6 天」在各頁才會是同一套算法
  const dayIndex = (v) => Math.floor((toMs(v) + TZ) / DAY);
  const WEEK = '日一二三四五六';

  const fmt = {
    num: (n) => Math.round(n).toLocaleString('en-US'),
    pct: (n, d = 1) => (n * 100).toFixed(d) + '%',
    money: (n) => 'NT$ ' + Math.round(n).toLocaleString('en-US'),
    wan: (n) => (n / 10000).toFixed(n >= 1e6 ? 0 : 1) + ' 萬',
    date: (v) => { const p = parts(toMs(v)); return `${pad(p.m)}/${pad(p.d)}`; },
    dateW: (v) => { const p = parts(toMs(v)); return `${p.m}/${p.d}（${WEEK[p.w]}）`; },
    dateFull: (v) => { const p = parts(toMs(v)); return `${p.y}/${pad(p.m)}/${pad(p.d)}`; },
    time: (v) => { const p = parts(toMs(v)); return `${pad(p.h)}:${pad(p.mi)}`; },
    dateTime: (v) => `${fmt.date(v)} ${fmt.time(v)}`,
    rel: (v) => {
      const m = Math.round((now() - toMs(v)) / 60e3);
      if (m < 1) return '剛剛';
      if (m < 60) return `${m} 分鐘前`;
      const h = Math.round(m / 60);
      if (h < 24) return `${h} 小時前`;
      const d = Math.max(1, fmt.days(v));
      return d < 30 ? `${d} 天前` : fmt.date(v);
    },
    days: (from, to = now()) => dayIndex(to) - dayIndex(from),
    daysLeft: (to) => Math.max(0, dayIndex(to) - dayIndex(now())),
  };

  /* ==================================================================
   * 2. 亂數與雜湊
   *    示範資料用 mulberry32（固定種子 → 每次開頁資料相同）；
   *    抽籤用 SHA-256 種子初始化 sfc32，任何人拿同一組種子都能重現同一份名單。
   * ================================================================== */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a |= 0; b |= 0; c |= 0; d |= 0;
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  // SHA-256：常數由質數的平方根／立方根小數部分算出，與標準表相同
  const isPrime = (n) => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return n > 1; };
  const PRIMES = (() => { const p = []; for (let n = 2; p.length < 64; n++) if (isPrime(n)) p.push(n); return p; })();
  const SHA_K = PRIMES.map((p) => ((Math.cbrt(p) % 1) * 2 ** 32) >>> 0);
  const SHA_H0 = PRIMES.slice(0, 8).map((p) => ((Math.sqrt(p) % 1) * 2 ** 32) >>> 0);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256(str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    const total = (((len + 9) + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(len / 0x20000000));
    dv.setUint32(total - 4, (len << 3) >>> 0);
    const H = SHA_H0.slice();
    const W = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const w15 = W[i - 15], w2 = W[i - 2];
        const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
        const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + W[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map((x) => x.toString(16).padStart(8, '0')).join('');
  }
  function prng(seed) {
    if (typeof seed === 'number') return mulberry32(seed);
    const hex = /^[0-9a-f]{32,}$/i.test(seed) ? seed : sha256(String(seed));
    const w = [0, 8, 16, 24].map((i) => parseInt(hex.slice(i, i + 8), 16));
    const rng = sfc32(w[0], w[1], w[2], w[3]);
    // sfc32 前幾個輸出與種子相關性較高，先丟掉讓狀態充分混合
    for (let i = 0; i < 12; i++) rng();
    return rng;
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const between = (lo, hi, rng) => lo + (hi - lo) * rng();

  /* ==================================================================
   * 3. 代碼表
   * ================================================================== */
  const DISTRICTS = ['港埕區', '北岸區', '舊城區', '山腳區', '新灣區', '鹽田區', '溪洲區', '雲嶺區'];
  const DISTRICT_COLOR = { 港埕區: 'blue', 北岸區: 'cyan', 舊城區: 'orange', 山腳區: 'green', 新灣區: 'teal', 鹽田區: 'yellow', 溪洲區: 'purple', 雲嶺區: 'pink' };
  const GROUPS = {
    general: { label: '一般戶', short: '一般', color: 'blue', prefix: 'G', desc: '設籍或在本市就學就業、符合所得與財產門檻' },
    vulnerable: { label: '弱勢戶', short: '弱勢', color: 'pink', prefix: 'V', desc: '具低收入、身心障礙、65 歲以上等弱勢身分' },
    local: { label: '在地青年', short: '青年', color: 'teal', prefix: 'L', desc: '18–40 歲，設籍港埕區或於港埕區就學就業' },
  };
  const GROUP_ORDER = ['general', 'vulnerable', 'local'];
  const STATUS = {
    screening: { label: '初審中', color: 'yellow', desc: '自動比對有待人工確認項目' },
    supplement: { label: '待補件', color: 'orange', desc: '已通知申請人補正文件' },
    resubmitted: { label: '補件審查', color: 'purple', desc: '補件已收件，等待審查' },
    qualified: { label: '資格符合', color: 'green', desc: '列入合格名冊，參加公開抽籤' },
    ineligible: { label: '不符資格', color: 'red', desc: '已寄發不合格通知，可於期限內申覆' },
  };
  const STATUS_ORDER = ['screening', 'supplement', 'resubmitted', 'qualified', 'ineligible'];
  const UNITS = {
    studio: { label: '套房', color: 'yellow', size: [9.2, 10.1], rent: [6800, 7400], fit: '1 人' },
    one: { label: '一房型', color: 'cyan', size: [12.6, 13.8], rent: [9200, 10200], fit: '1–2 人' },
    two: { label: '二房型', color: 'purple', size: [19.8, 21.6], rent: [13600, 15400], fit: '2–4 人' },
    three: { label: '三房型', color: 'orange', size: [27.2, 28.9], rent: [18200, 19800], fit: '4 人以上' },
  };
  const UNIT_ORDER = ['studio', 'one', 'two', 'three'];
  const SUBTYPES = {
    low: { label: '低收入戶', color: 'orange', pts: 3 },
    midlow: { label: '中低收入戶', color: 'yellow', pts: 2 },
    disabled: { label: '身心障礙', color: 'cyan', pts: 2 },
    senior: { label: '65 歲以上', color: 'purple', pts: 2 },
    special: { label: '特殊境遇家庭', color: 'pink', pts: 2 },
    indigenous: { label: '原住民', color: 'teal', pts: 1 },
    kids3: { label: '育有三名以上未成年子女', color: 'green', pts: 2 },
  };
  const CHECKS = {
    income: { label: '所得', long: '所得比對', source: '財稅資料中心 · 114 年度所得', syncedAt: '2026-10-21T22:00' },
    property: { label: '財產', long: '財產比對', source: '地政與財稅資料 · 財產歸屬清單', syncedAt: '2026-10-20T23:30' },
    residency: { label: '設籍', long: '設籍／就業比對', source: '戶政資訊系統 · 勞保投保資料', syncedAt: '2026-10-22T06:00' },
  };
  const CHECK_ORDER = ['income', 'property', 'residency'];
  const CHECK_RESULT = {
    pass: { label: '符合', color: 'green', icon: 'check' },
    fail: { label: '不符', color: 'red', icon: 'x' },
    review: { label: '待確認', color: 'yellow', icon: 'question' },
  };
  const DOCS = {
    household: '戶籍謄本（全戶、近三個月）',
    tax: '綜合所得稅各類所得資料清單',
    property: '全國財產稅總歸戶財產查詢清單',
    employment: '在職證明或勞保投保明細',
    study: '在學證明',
    lowincome: '低收入／中低收入戶證明',
    disability: '身心障礙證明',
    special: '特殊境遇家庭身分證明',
    custody: '未成年子女監護權證明',
    affidavit: '無自有住宅切結書',
    lease: '現住房屋租賃契約',
  };
  const BUILDING_PREF = { A: { label: 'A 棟', color: 'blue' }, B: { label: 'B 棟', color: 'purple' }, any: { label: '不限', color: 'gray' } };
  const DOC_STATE = { missing: { label: '待補', color: 'orange' }, uploaded: { label: '已上傳', color: 'cyan' }, accepted: { label: '已核可', color: 'green' } };

  const STAFF = {
    lin: { name: '林佩璇', title: '審查二組 組長', team: '二組', hue: 214 },
    hsu: { name: '許家豪', title: '審查二組 審查員', team: '二組', hue: 152 },
    chen: { name: '陳映彤', title: '審查二組 審查員', team: '二組', hue: 330 },
    wang: { name: '王柏翰', title: '審查二組 審查員', team: '二組', hue: 32 },
    chang: { name: '張毓庭', title: '審查一組 組長', team: '一組', hue: 268 },
    lee: { name: '李俊毅', title: '審查一組 審查員', team: '一組', hue: 190 },
    huang: { name: '黃馨慧', title: '審查三組 組長', team: '三組', hue: 2 },
    wu: { name: '吳政達', title: '審查三組 審查員', team: '三組', hue: 96 },
    tsai: { name: '蔡雅筑', title: '社會住宅科 科長', team: '科室', hue: 250 },
    cheng: { name: '鄭仲廷', title: '政風室 專員（抽籤監察）', team: '政風室', hue: 175 },
  };
  const ME = 'lin';
  const REVIEWERS = ['lin', 'hsu', 'chen', 'wang', 'chang', 'lee', 'huang', 'wu'];

  const RULES = {
    incomeCap: 1628000,       // 家庭年所得：本市 50% 分位點
    perCapitaMonthly: 51700,  // 每人每月平均所得上限
    movableCap: 3320000,      // 動產（存款＋投資）上限
    incomeYear: '114 年度',
    localYouthAge: [18, 40],
    scoreUse: '評點不影響中籤機率；中籤後依評點高低決定選屋順序，同分依籤序。',
    appealDeadline: '2026-10-30',
  };
  const incomeLimit = (hh) => Math.min(RULES.incomeCap, hh * RULES.perCapitaMonthly * 12);

  /* ==================================================================
   * 4. 本期招租與時程
   * ================================================================== */
  const BUILDINGS = [
    {
      id: 'A', name: 'A 棟', floors: 15, resFloors: [2, 15], perFloor: 17, units: 238,
      ground: '1F 大廳 · 社區客廳 · 社福據點',
      layout: ['two', 'one', 'studio', 'studio', 'one', 'studio', 'one', 'two', 'one', 'studio', 'one', 'studio', 'studio', 'one', 'studio', 'one', 'two'],
    },
    {
      id: 'B', name: 'B 棟', floors: 14, resFloors: [2, 14], perFloor: 14, units: 182,
      ground: '1F 托嬰中心 · 青創共享工作室',
      layout: ['three', 'two', 'one', 'two', 'one', 'two', 'three', 'two', 'one', 'two', 'one', 'two', 'one', 'three'],
    },
  ];
  const SUPPLY = {
    studio: { general: 50, vulnerable: 18, local: 30 },
    one: { general: 80, vulnerable: 46, local: 37 },
    two: { general: 60, vulnerable: 46, local: 14 },
    three: { general: 20, vulnerable: 16, local: 3 },
  };
  const PROJECT = {
    name: '港埕青年社宅',
    period: '2026 第 2 期招租',
    code: 'GCY-2026-2',
    org: '澄港市住宅發展處 社會住宅科',
    address: '澄港市港埕區港埕路 168 號',
    license: '2026 年 8 月取得使用執照',
    total: 420,
    quotas: { general: 210, vulnerable: 126, local: 84 },
    waitlistRatio: 0.5,
    supply: SUPPLY,
    lease: '租期 3 年，得續租至 6 年（弱勢戶最長 12 年）',
    applyWindow: ['2026-08-03', '2026-09-04'],
    channels: { online: 2904, counter: 282 },
    supplementNotices: 612,
  };
  const TIMELINE = [
    { key: 'apply', label: '申請受理', start: '2026-08-03', end: '2026-09-04', state: 'done', note: '線上 2,904 件、臨櫃 282 件，共 3,186 件' },
    { key: 'screen', label: '資格初審', start: '2026-08-04', end: '2026-09-18', state: 'done', note: '所得、財產、設籍與財稅／地政／戶政資料自動比對' },
    { key: 'supplement', label: '補件', start: '2026-09-21', end: '2026-10-16', state: 'done', note: '通知補件 612 件，已回覆 470 件' },
    { key: 'confirm', label: '資格確認', start: '2026-10-19', end: '2026-10-28', state: 'current', note: '人工複核與申覆處理，10/28 公告合格名冊' },
    { key: 'lottery', label: '公開抽籤', start: '2026-10-30', end: '2026-10-30', state: 'upcoming', milestone: true, note: '14:00 市府 1F 市民廣場，同步網路直播' },
    { key: 'select', label: '選屋', start: '2026-11-09', end: '2026-11-20', state: 'upcoming', note: '中籤者依評點與籤序分梯次選屋' },
    { key: 'sign', label: '簽約', start: '2026-11-30', end: '2026-12-11', state: 'upcoming', note: '簽約後 2027/1/8 起分批入住' },
  ];
  const LOTTERY = {
    at: '2026-10-30T14:00',
    rehearsalAt: '2026-10-27T10:00',
    rosterAt: '2026-10-28T10:00',
    venue: '澄港市政府 1 樓 市民廣場',
    stream: '澄港市政府網路直播（同步聽打字幕）',
    notary: '謝宛蓁',
    notaryTitle: '民間公證人',
    host: 'tsai',
    supervisor: 'cheng',
    witnesses: ['申請人代表（現場抽選 1 位）', '澄港市議會 觀察員', '住宅發展處 政風室'],
    seedRecipe: '種子 = SHA-256（三組名冊雜湊 ＋ 三位見證人現場各擲十面骰 6 次之數字）',
    algorithm: '以種子前 128 位元初始化 sfc32 偽亂數產生器，對名冊做 Fisher–Yates 洗牌；前 N 名為正取，其後依序為備取。',
    snapshot: '2026-10-22T10:30',
  };
  const NOTIFICATIONS = [
    { at: '2026-10-22T08:12', icon: 'refresh', title: '戶政資料介接完成', text: '設籍比對更新 3,186 筆，其中 12 筆轉為「待確認」', href: 'applicants.html' },
    { at: '2026-10-21T16:05', icon: 'flag', title: '合格名冊公告稿待核定', text: '請蔡雅筑科長於 10/26 前完成核定' },
    // 與 GC26-1406 歷程中陳映彤 10/20 15:35 的備註同一件事（補件 10/14 已上傳）
    { at: '2026-10-20T15:40', icon: 'file', title: '呂浩然 補件待組長核定', text: 'GC26-1406 · 補件所得與財稅資料差額約 8 萬元', href: 'applicant.html?id=GC26-1406' },
    { at: '2026-10-20T11:30', icon: 'ticket', title: '公開抽籤彩排排定', text: '10/27（二）10:00 市府 1F 市民廣場', href: 'lottery.html' },
  ];

  function unitSize(type, pos, b) {
    const [lo, hi] = UNITS[type].size;
    // 邊間（第一戶、最後一戶）面積較大
    const edge = pos === 0 || pos === b.layout.length - 1;
    return Math.round((edge ? hi : lo + (hi - lo) * ((pos * 7) % 5) / 8) * 10) / 10;
  }
  function unitRent(type, floor, b) {
    const [lo, hi] = UNITS[type].rent;
    const f = (floor - b.resFloors[0]) / (b.resFloors[1] - b.resFloors[0]);
    return Math.round((lo + (hi - lo) * f) / 100) * 100;
  }
  function buildUnits() {
    const list = [];
    for (const b of BUILDINGS) {
      for (let f = b.resFloors[0]; f <= b.resFloors[1]; f++) {
        b.layout.forEach((type, i) => list.push({
          code: `${b.id}-${f}F-${pad(i + 1)}`, building: b.id, floor: f, pos: i + 1, type,
          size: unitSize(type, i, b), rent: unitRent(type, f, b), group: 'general',
        }));
      }
    }
    // 保障配置：弱勢戶偏向低樓層（無障礙動線、緊急避難），在地青年與一般戶隨機分布
    const rng = mulberry32(4201030);
    for (const type of UNIT_ORDER) {
      const units = list.filter((u) => u.type === type)
        .map((u) => ({ u, k: u.floor + rng() * 7 }))
        .sort((x, y) => x.k - y.k)
        .map((x) => x.u);
      const s = SUPPLY[type];
      units.slice(0, s.vulnerable).forEach((u) => { u.group = 'vulnerable'; });
      shuffle(units.slice(s.vulnerable), rng).slice(0, s.local).forEach((u) => { u.group = 'local'; });
    }
    return list;
  }

  /* ==================================================================
   * 5. 申請人
   *    審查二組工作清單 72 筆為手寫資料；其餘 3,114 筆依各組別目標數以固定種子產生，
   *    兩者合起來剛好是首頁的 3,186 件與各狀態、戶型、弱勢身分的總數。
   * ================================================================== */
  // no|姓名|性別|年齡|組別|弱勢身分|設籍區|設籍型態(reg 設籍 / work 就業 / study 就學)|家戶人數|戶型|棟別|狀態|比對(所得財產設籍 P/F/R)|承辦|補件(* = 已上傳)
  const ROSTER = [
    '0042|張雅婷|F|31|general||北岸區|reg|2|one|any|qualified|PPP|hsu|',
    '0118|李冠廷|M|34|general||舊城區|reg|3|two|B|qualified|PPP|chen|',
    '0203|王怡君|F|28|general||新灣區|reg|1|studio|A|supplement|PRP|lin|property',
    '0267|黃柏翰|M|38|general||山腳區|reg|4|two|B|qualified|PPP|wang|',
    '0331|吳佩珊|F|42|general||溪洲區|reg|3|two|any|ineligible|FPP|hsu|',
    '0390|劉家瑋|M|27|general||港埕區|reg|1|studio|any|qualified|PPP|chen|',
    '0455|蔡宜蓁|F|33|general||鹽田區|reg|2|one|A|resubmitted|RPP|lin|tax*',
    '0512|楊承恩|M|36|general||雲嶺區|reg|4|three|B|screening|PPR|wang|',
    '0588|許詩涵|F|29|general||北岸區|work|1|one|any|qualified|PPP|hsu|',
    '0647|鄭宇軒|M|40|general||舊城區|reg|5|three|B|qualified|PPP|chen|',
    '0702|謝欣怡|F|35|general||新灣區|work|2|two|any|supplement|PPR|lin|household,employment',
    '0766|郭俊傑|M|45|general||溪洲區|reg|3|two|B|ineligible|PFP|wang|',
    '0839|洪筱涵|F|26|general||港埕區|reg|1|studio|A|qualified|PPP|hsu|',
    '0901|曾冠宇|M|32|general||山腳區|reg|2|one|any|screening|RPP|chen|',
    '0968|邱婉婷|F|38|general||鹽田區|reg|4|two|B|qualified|PPP|lin|',
    '1024|廖彥廷|M|30|general||雲嶺區|reg|1|studio|any|resubmitted|PRP|wang|property*,affidavit*',
    '1093|賴思妤|F|27|general||北岸區|study|1|one|A|qualified|PPP|hsu|',
    '1150|周志豪|M|47|general||舊城區|reg|3|two|any|supplement|RPP|chen|tax',
    '1217|徐郁婷|F|36|general||新灣區|reg|2|one|B|qualified|PPP|lin|',
    '1288|蘇承翰|M|29|general||溪洲區|work|2|one|any|ineligible|PPF|wang|',
    '1342|葉佳穎|F|34|general||港埕區|reg|3|two|B|qualified|PPP|hsu|',
    '1406|呂浩然|M|39|general||山腳區|reg|4|three|B|resubmitted|RPP|chen|tax*',
    '1471|莊依潔|F|25|general||鹽田區|reg|1|studio|A|qualified|PPP|lin|',
    '1530|江立揚|M|33|general||雲嶺區|reg|2|two|any|screening|PRP|wang|',
    '1597|何芷瑄|F|41|general||北岸區|reg|3|two|B|qualified|PPP|hsu|',
    '1663|羅昱廷|M|28|general||舊城區|work|1|one|any|supplement|PPR|chen|employment,lease',
    '1729|高雅雯|F|37|general||新灣區|reg|4|two|B|qualified|PPP|lin|',
    '1788|林冠霖|M|31|general||溪洲區|reg|2|one|A|qualified|PPP|wang|',
    '1850|潘怡萱|F|44|general||港埕區|reg|3|two|any|ineligible|FPP|hsu|',
    '1914|簡家豪|M|35|general||山腳區|reg|1|studio|any|qualified|PPP|chen|',
    '1977|朱品妍|F|29|general||鹽田區|reg|2|one|B|resubmitted|PPR|lin|household*',
    '2041|彭宗翰|M|42|general||雲嶺區|reg|5|three|B|qualified|PPP|wang|',
    '2110|游珮瑜|F|32|general||北岸區|reg|1|studio|A|supplement|RRP|hsu|tax,property',
    '2183|詹明德|M|50|general||舊城區|reg|3|two|any|screening|RRP|chen|',
    '2256|胡婉如|F|30|general||新灣區|reg|2|one|any|qualified|PPP|lin|',
    '2329|施柏睿|M|37|general||溪洲區|reg|4|three|B|supplement|PRP|wang|property',
    '0076|陳淑芬|F|58|vulnerable|low|舊城區|reg|2|one|any|qualified|PPP|chen|',
    '0154|林志明|M|67|vulnerable|senior|北岸區|reg|2|one|B|qualified|PPP|hsu|',
    '0239|黃美玲|F|39|vulnerable|special|溪洲區|reg|3|two|any|supplement|PPP|lin|special,custody',
    '0362|吳建宏|M|46|vulnerable|disabled|山腳區|reg|3|two|B|qualified|PPP|wang|',
    '0498|張秀英|F|71|vulnerable|senior|鹽田區|reg|1|studio|A|resubmitted|PRP|chen|property*',
    '0623|李國華|M|52|vulnerable|midlow|港埕區|reg|4|two|B|qualified|PPP|hsu|',
    '0745|王麗華|F|44|vulnerable|kids3|新灣區|reg|5|three|B|qualified|PPP|lin|',
    '0881|劉文彬|M|38|vulnerable|indigenous|雲嶺區|reg|4|two|any|screening|RPP|wang|',
    '0997|蔡慧敏|F|49|vulnerable|low|舊城區|reg|3|two|any|supplement|RPP|chen|lowincome,tax',
    '1116|楊正雄|M|69|vulnerable|senior|北岸區|reg|2|one|any|ineligible|PFP|hsu|',
    '1239|許玉珍|F|56|vulnerable|disabled|溪洲區|reg|2|one|B|qualified|PPP|lin|',
    '1377|鄭春嬌|F|74|vulnerable|senior|山腳區|reg|1|studio|A|qualified|PPP|wang|',
    '1502|謝宏明|M|41|vulnerable|kids3|鹽田區|reg|6|three|B|resubmitted|PPR|chen|household*',
    '1641|郭靜宜|F|35|vulnerable|special|港埕區|reg|2|one|any|qualified|PPP|hsu|',
    '1795|洪聖傑|M|29|vulnerable|disabled|新灣區|reg|1|studio|any|supplement|PPP|lin|disability',
    '1932|曾美惠|F|61|vulnerable|midlow|雲嶺區|reg|3|two|B|qualified|PPP|wang|',
    '2068|邱俊宏|M|45|vulnerable|indigenous|溪洲區|reg|4|three|B|qualified|PPP|chen|',
    '2204|廖淑惠|F|53|vulnerable|low|北岸區|reg|2|one|any|screening|RRP|hsu|',
    '2387|賴明輝|M|66|vulnerable|senior|舊城區|reg|2|two|any|qualified|PPP|lin|',
    '2511|周麗娟|F|47|vulnerable|special|山腳區|reg|3|two|B|ineligible|FPP|wang|',
    '0021|陳品睿|M|26|local||港埕區|reg|1|studio|A|qualified|PPP|chen|',
    '0187|林芊妤|F|24|local||港埕區|reg|1|studio|any|qualified|PPP|hsu|',
    '0306|黃子軒|M|31|local||北岸區|work|2|one|A|screening|PPR|lin|',
    '0437|吳宜庭|F|28|local||新灣區|work|1|one|any|resubmitted|PPR|wang|employment*',
    '0569|劉承佑|M|33|local||港埕區|reg|2|one|A|qualified|PPP|chen|',
    '0694|蔡沛涵|F|27|local||新灣區|work|1|studio|A|supplement|PPR|hsu|employment',
    '0812|楊凱翔|M|35|local||港埕區|reg|3|two|B|qualified|PPP|lin|',
    '0956|許若瑜|F|22|local||港埕區|study|1|studio|any|qualified|PPP|wang|',
    '1083|鄭宇翔|M|38|local||港埕區|reg|2|one|any|ineligible|FPP|chen|',
    '1199|謝佳蓉|F|30|local||鹽田區|work|2|one|A|qualified|PPP|hsu|',
    '1327|郭品翰|M|29|local||港埕區|reg|1|studio|A|screening|RPP|lin|',
    '1455|洪雨萱|F|25|local||港埕區|reg|1|studio|any|qualified|PPP|wang|',
    '1613|曾柏霖|M|36|local||港埕區|reg|4|two|B|supplement|PRP|chen|property,affidavit',
    '1868|邱詠晴|F|32|local||港埕區|reg|2|two|any|qualified|PPP|hsu|',
    '2152|廖哲維|M|27|local||北岸區|work|1|one|any|resubmitted|PPR|lin|employment*',
    '2466|賴姿穎|F|34|local||港埕區|reg|3|two|B|qualified|PPP|wang|',
  ];
  const NOTES = {
    '0203': '財產清單顯示名下有北岸區農地持分 1/12（繼承取得，非住宅），請申請人補正財產歸屬清單並說明，以排除自有住宅疑義。',
    '0331': '家庭年所得超過本市 50% 分位點；已寄發不合格通知，申覆期限 10/30。',
    '0455': '已上傳 114 年度所得清單；配偶 9 月到職新工作，薪資尚未入財稅檔，需以扣繳憑單人工核算。',
    '0512': '戶政資料顯示 2026/07 才遷入雲嶺區，與申請書所填設籍年限不符，已函詢雲嶺區戶政事務所，預計 10/23 回覆。',
    '0766': '配偶名下有溪洲區住宅一戶（2019 年取得），不符「無自有住宅」要件。',
    '0997': '補件期限 10/16 已屆；申請人來電表示社會局換證中，經組長同意展延至 10/26。',
    '1116': '名下有舊城區老屋持分 1/2（與胞弟共有），依規定視為自有住宅。',
    '1288': '設籍外縣市，檢附之在職證明為派遣公司開立，實際工作地點不在本市。',
    '1406': '補件所得清單已收，與財稅介接資料差額約 8 萬元（年終獎金年度歸屬），待組長核定。',
    '1502': '戶籍謄本已補，6 人中含 4 名未成年子女，符合育有三名以上未成年子女加分。',
    '1613': '配偶名下有車位持分，需補財產清單與無自有住宅切結書。',
    '1795': '身心障礙證明重新鑑定中，申請人已提供鑑定排程單；待新證明核發後補件。',
    '2152': '已上傳勞保投保明細，投保單位位於港埕區新創園區，待確認任職滿 6 個月。',
    '2204': '低收入戶身分 10/01 起轉為中低收入戶，所得及財產需以新身分重新比對。',
    '0306': '在職證明工作地點為港埕區港埕路，惟勞保投保單位登記於北岸區，待雇主出具派駐證明。',
    '0498': '財產清單有鹽田區土地一筆（道路用地），非住宅用途，確認後可排除。',
    '0239': '特殊境遇家庭身分 10/05 核定，需補身分證明與子女監護權文件。',
  };
  const FLAGGED = new Set(['0512', '1406', '2204', '0997']);
  const COUNTER = new Set(['0076', '0154', '0498', '1116', '1377']);

  const TARGETS = {
    general: {
      total: 1742,
      status: { qualified: 1288, supplement: 71, resubmitted: 49, screening: 30, ineligible: 304 },
      unit: { studio: 560, one: 682, two: 400, three: 100 },
    },
    vulnerable: {
      total: 618,
      status: { qualified: 452, supplement: 38, resubmitted: 27, screening: 16, ineligible: 85 },
      unit: { studio: 120, one: 196, two: 214, three: 88 },
      sub: { low: 96, midlow: 112, disabled: 138, senior: 124, special: 58, indigenous: 42, kids3: 48 },
    },
    local: {
      total: 826,
      status: { qualified: 621, supplement: 33, resubmitted: 20, screening: 12, ineligible: 140 },
      unit: { studio: 424, one: 320, two: 68, three: 14 },
    },
  };
  const TOTAL_APPS = 3186;

  const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯孫魏翁戴'.split('');
  const GIVEN_F = '雅婷 怡君 詩涵 欣怡 佩珊 宜蓁 郁婷 思妤 筱涵 婉婷 佳穎 依潔 芷瑄 雅雯 品妍 珮瑜 婉如 淑芬 美玲 秀英 麗華 慧敏 玉珍 靜宜 美惠 淑惠 麗娟 芊妤 宜庭 沛涵 若瑜 佳蓉 雨萱 詠晴 姿穎 家瑜 子晴 宥蓁 語彤 心妤 采潔 庭瑄 欣妤 惠雯 雅琪 書瑀 品瑄 怡蓉'.split(' ');
  const GIVEN_M = '冠廷 柏翰 家瑋 宇軒 俊傑 冠宇 彥廷 志豪 承翰 浩然 立揚 昱廷 冠霖 宗翰 明德 柏睿 志明 建宏 國華 文彬 正雄 宏明 聖傑 俊宏 明輝 品睿 子軒 承佑 凱翔 宇翔 品翰 柏霖 哲維 承恩 宥辰 柏宇 彥均 冠佑 睿哲 承諺 宇恩 子豪 建志 信宏 志偉 俊賢 嘉宏 振宇'.split(' ');
  const STREETS = {
    港埕區: ['港埕路', '海關街', '碼頭三街', '漁人路'], 北岸區: ['北岸大道', '燈塔路', '民生路'], 舊城區: ['府前街', '鐘樓街', '米市街'],
    山腳區: ['山腳路', '茶園街', '林道巷'], 新灣區: ['新灣大道', '灣景路', '科技一路'], 鹽田區: ['鹽埕路', '曬鹽街', '潮間路'],
    溪洲區: ['溪洲路', '堤防街', '河濱路'], 雲嶺區: ['雲嶺路', '松嶺街', '觀雲路'],
  };
  const DISTRICT_WEIGHT = { 港埕區: 14, 北岸區: 15, 舊城區: 16, 山腳區: 10, 新灣區: 15, 鹽田區: 10, 溪洲區: 12, 雲嶺區: 8 };

  const idOf = (no) => 'GC26-' + pad(no, 4);
  const maskName = (name) => name.length <= 2 ? name[0] + '○' : name[0] + '○'.repeat(name.length - 2) + name[name.length - 1];
  const APPLY_START = time('2026-08-03T09:00');
  const APPLY_END = time('2026-09-04T17:00');
  const submittedOf = (no) => Math.round((APPLY_START + (APPLY_END - APPLY_START) * ((no - 1) / (TOTAL_APPS - 1))) / 60e3) * 60e3;
  function weighted(map, rng) {
    const total = sum(Object.values(map));
    let r = rng() * total;
    for (const [k, w] of Object.entries(map)) { r -= w; if (r < 0) return k; }
    return Object.keys(map)[0];
  }
  // 在 [lo, hi] 之間取一個平日上班時段的時間（審查作業只在上班時間發生）
  function workTime(lo, hi, rng) {
    let t = between(toMs(lo), toMs(hi), rng);
    let p = parts(t);
    for (let i = 0; i < 7 && (p.w === 0 || p.w === 6); i++) { t += DAY; p = parts(t); }
    const minute = 9 * 60 + Math.floor(rng() * (8 * 60 + 20));
    return Date.UTC(p.y, p.m - 1, p.d, 0, minute) - TZ;
  }

  function parseRow(s) {
    const [no, name, sex, age, group, sub, district, residency, hh, unit, building, status, checks, reviewer, docs] = s.split('|');
    const c = { P: 'pass', F: 'fail', R: 'review' };
    const n = +no;
    return {
      id: idOf(n), no: n, name, sex, age: +age, group, sub, district, residency, hh: +hh, unit, building, status,
      checks: { income: c[checks[0]], property: c[checks[1]], residency: c[checks[2]] },
      reviewer,
      docs: docs ? docs.split(',').map((d) => ({ key: d.replace('*', ''), state: d.endsWith('*') ? 'uploaded' : 'missing' })) : [],
      note: NOTES[no] || '',
      flagged: FLAGGED.has(no),
      channel: COUNTER.has(no) ? 'counter' : 'online',
      submittedAt: submittedOf(n),
      detailed: true,
    };
  }

  function hhFor(unit, sub, rng) {
    if (sub === 'kids3') return unit === 'three' ? 5 + (rng() < 0.4 ? 1 : 0) : 5;
    const r = rng();
    switch (unit) {
      case 'studio': return 1;
      case 'one': return r < 0.42 ? 1 : 2;
      case 'two': return r < 0.35 ? 2 : r < 0.8 ? 3 : 4;
      default: return r < 0.55 ? 4 : r < 0.85 ? 5 : 6;
    }
  }
  function checksFor(status, rng) {
    const c = { income: 'pass', property: 'pass', residency: 'pass' };
    const which = () => { const r = rng(); return r < 0.45 ? 'income' : r < 0.8 ? 'property' : 'residency'; };
    if (status === 'ineligible') {
      const r = rng();
      c[r < 0.55 ? 'income' : r < 0.85 ? 'property' : 'residency'] = 'fail';
    } else if (status !== 'qualified') {
      c[which()] = 'review';
      if (status === 'screening' && rng() < 0.25) c[which()] = 'review';
    }
    return c;
  }
  function docsFor(a, rng) {
    if (a.status !== 'supplement' && a.status !== 'resubmitted') return [];
    const keys = [];
    if (a.checks.income === 'review') keys.push('tax');
    if (a.checks.property === 'review') { keys.push('property'); if (rng() < 0.3) keys.push('affidavit'); }
    if (a.checks.residency === 'review') keys.push(a.residency === 'work' ? 'employment' : a.residency === 'study' ? 'study' : 'household');
    if (a.group === 'vulnerable' && rng() < 0.3) keys.push({ low: 'lowincome', midlow: 'lowincome', disabled: 'disability', special: 'special', kids3: 'household' }[a.sub] || 'household');
    const uniq = [...new Set(keys.length ? keys : ['household'])];
    return uniq.map((key) => ({ key, state: a.status === 'resubmitted' ? 'uploaded' : 'missing' }));
  }

  function lightRecord(no, group, status, unit, sub, rng) {
    const sex = rng() < 0.53 ? 'F' : 'M';
    const name = pick(SURNAMES, rng) + pick(sex === 'F' ? GIVEN_F : GIVEN_M, rng);
    let residency = 'reg';
    let district;
    if (group === 'local') {
      if (rng() < 0.82) district = '港埕區';
      else { district = pick(DISTRICTS.slice(1), rng); residency = rng() < 0.85 ? 'work' : 'study'; }
    } else {
      district = weighted(DISTRICT_WEIGHT, rng);
      const r = rng();
      residency = r < 0.88 ? 'reg' : r < 0.97 ? 'work' : 'study';
    }
    const age = group === 'local' ? Math.round(between(21, 40, rng))
      : sub === 'senior' ? Math.round(between(65, 82, rng))
      : group === 'vulnerable' ? Math.round(between(27, 63, rng))
      : Math.round(between(23, 56, rng));
    const a = {
      id: idOf(no), no, name, sex, age, group, sub, district, residency,
      hh: hhFor(unit, sub, rng), unit,
      building: unit === 'studio' ? (rng() < 0.6 ? 'A' : 'any') : unit === 'three' ? (rng() < 0.6 ? 'B' : 'any') : pick(['A', 'B', 'any', 'any'], rng),
      status, checks: checksFor(status, rng),
      reviewer: REVIEWERS[no % REVIEWERS.length],
      note: '', flagged: false, channel: 'online', submittedAt: submittedOf(no), detailed: false,
    };
    a.docs = docsFor(a, rng);
    return a;
  }

  // 依目標數扣掉手寫資料後，剩下的名額做成「袋子」洗牌發放 → 總數一定精準
  function bagOf(counts, mine, key) {
    const used = {};
    mine.forEach((a) => { used[a[key]] = (used[a[key]] || 0) + 1; });
    const out = [];
    for (const [k, c] of Object.entries(counts)) for (let i = 0; i < c - (used[k] || 0); i++) out.push(k);
    return out;
  }

  function buildUniverse(detailed) {
    const rng = mulberry32(20261022);
    const taken = new Set(detailed.map((a) => a.no));
    const free = [];
    for (let n = 1; n <= TOTAL_APPS; n++) if (!taken.has(n)) free.push(n);
    const nos = shuffle(free, rng);
    const all = detailed.slice();
    let cursor = 0;
    for (const g of GROUP_ORDER) {
      const target = TARGETS[g];
      const mine = detailed.filter((a) => a.group === g);
      const count = target.total - mine.length;
      const myNos = nos.slice(cursor, cursor + count);
      cursor += count;
      const statuses = shuffle(bagOf(target.status, mine, 'status'), rng);
      const units = shuffle(bagOf(target.unit, mine, 'unit'), rng);
      let subs = myNos.map(() => '');
      if (target.sub) {
        // 「育有三名以上未成年子女」優先給大坪數戶型，其餘身分隨機，避免出現 5 口之家申請套房
        const bag = shuffle(bagOf(target.sub, mine, 'sub'), rng);
        const kids = bag.filter((s) => s === 'kids3');
        const others = bag.filter((s) => s !== 'kids3');
        const order = myNos.map((_, i) => i).sort((x, y) => UNIT_ORDER.indexOf(units[y]) - UNIT_ORDER.indexOf(units[x]));
        order.forEach((idx, k) => { subs[idx] = k < kids.length ? 'kids3' : others[k - kids.length]; });
      }
      myNos.forEach((no, i) => all.push(lightRecord(no, g, statuses[i], units[i], subs[i], rng)));
    }
    // 臨櫃送件總數固定為 282 件
    const counterLeft = PROJECT.channels.counter - detailed.filter((a) => a.channel === 'counter').length;
    shuffle(all.filter((a) => !a.detailed), rng).slice(0, counterLeft).forEach((a) => { a.channel = 'counter'; });
    all.sort((x, y) => x.no - y.no);
    // 籤號：名冊快照（10/22 10:30）時已資格符合者，依申請編號順序編號
    const seq = { general: 0, vulnerable: 0, local: 0 };
    all.forEach((a) => {
      if (a.status === 'qualified') { seq[a.group]++; a.lot = GROUPS[a.group].prefix + pad(seq[a.group], 4); a.lotSeq = seq[a.group]; }
      else a.lot = '';
    });
    all.forEach((a) => { a.initialStatus = a.status; });
    return all;
  }

  const APPLICANTS = ROSTER.map(parseRow);
  const ALL = buildUniverse(APPLICANTS);
  const BY_ID = new Map(ALL.map((a) => [a.id, a]));
  const UNITS_LIST = buildUnits();

  /* ---------- 細節補齊（家戶成員、所得、財產、歷程），以申請編號為種子 → 同一人每次都一樣 ---------- */
  const RELATION_INCOME = { 配偶: 0.42, 子女: 0.18, 父: 0.1, 母: 0.08 };
  function buildMembers(a, rng) {
    const members = [{ name: a.name, relation: '本人', age: a.age, sex: a.sex }];
    let left = a.hh - 1;
    const surname = a.name[0];
    const single = a.sub === 'special';
    if (left > 0 && !single && (a.age >= 27 || a.hh >= 3) && (a.hh >= 3 || rng() < 0.7)) {
      const sex = a.sex === 'F' ? 'M' : 'F';
      members.push({ name: pick(SURNAMES, rng) + pick(sex === 'F' ? GIVEN_F : GIVEN_M, rng), relation: '配偶', age: clamp(a.age + Math.round(between(-4, 4, rng)), 21, 88), sex });
      left--;
    }
    const kidSurname = a.sex === 'M' || !members[1] ? surname : members[1].name[0];
    const wantParent = a.sub !== 'kids3' && a.age <= 40 && left >= 2 && a.hh >= 5 && rng() < 0.5;
    if (wantParent) {
      members.push({ name: surname + pick(GIVEN_M, rng), relation: '父', age: a.age + 28 + Math.round(rng() * 4), sex: 'M' });
      left--;
    }
    let kidAge = a.age >= 55 ? a.age - 27 : Math.max(1, Math.min(17, a.age - 24));
    const kidsNeeded = a.sub === 'kids3' ? Math.max(3, left) : left;
    for (let i = 0; i < kidsNeeded && left > 0; i++) {
      const sex = rng() < 0.5 ? 'F' : 'M';
      const age = a.sub === 'kids3' ? Math.max(1, 14 - i * 3 - Math.round(rng() * 2)) : Math.max(1, kidAge - Math.round(rng() * 3));
      members.push({ name: kidSurname + pick(sex === 'F' ? GIVEN_F : GIVEN_M, rng), relation: '子女', age, sex });
      kidAge = Math.max(1, age - 2);
      left--;
    }
    return members;
  }
  function buildIncome(a, members, rng) {
    const lim = incomeLimit(a.hh);
    const r = a.checks.income;
    const total = Math.round(lim * (r === 'pass' ? between(0.42, 0.88, rng) : r === 'fail' ? between(1.07, 1.32, rng) : between(0.95, 1.03, rng)) / 100) * 100;
    // 依成員身分分配所得：本人為主，配偶次之，未成年子女為 0
    const weights = members.map((m) => (m.relation === '本人' ? (a.sub === 'senior' ? 0.6 : 1) : m.age < 20 ? 0 : m.age >= 65 ? 0.12 : RELATION_INCOME[m.relation] || 0.1));
    const wsum = sum(weights);
    // 其他成員先四捨五入到百元，捨入差額歸給本人，總和才會剛好等於家庭年所得
    members.forEach((m, i) => { if (i > 0) m.income = Math.round(total * weights[i] / wsum / 100) * 100; });
    members[0].income = total - sum(members.slice(1).map((m) => m.income));
    members.forEach((m) => {
      m.job = m.age < 6 ? '學齡前' : m.age < 18 ? '學生' : m.income === 0 ? '無' : m.age >= 65 ? '退休（年金）' : pick(['服務業', '製造業', '物流倉儲', '餐飲業', '資訊業', '營造業', '醫療照護', '教育業', '零售業'], rng);
    });
    return { annual: total, perCapitaMonthly: Math.round(total / a.hh / 12), limit: lim };
  }
  // 承辦備註點名的不動產以備註為準（行政區、持分、取得方式），詳情頁的比對清單才不會和備註互相矛盾
  const NOTED_ESTATE = {
    '0203': { kind: '土地', desc: '北岸區農地持分 1/12（繼承取得，非住宅）', value: 860000 },
    '0498': { kind: '土地', desc: '鹽田區道路用地一筆（非住宅用途）', value: 420000 },
    '0766': { kind: '住宅', desc: '溪洲區住宅一戶（配偶名下，2019 年取得）', value: 6380000 },
    '1116': { kind: '住宅', desc: '舊城區老屋一戶（持分 1/2，與胞弟共有）', value: 3240000 },
    '1613': { kind: '車位', desc: '港埕區停車位持分（配偶名下）', value: 1150000 },
  };
  function buildAssets(a, rng) {
    const r = a.checks.property;
    const cap = RULES.movableCap;
    const no = pad(a.no, 4);
    const failKind = r === 'fail' ? (['0766', '1116'].includes(no) || rng() < 0.7 ? 'house' : 'movable') : '';
    const movable = Math.round(cap * (failKind === 'movable' ? between(1.05, 1.4, rng) : between(0.03, 0.42, rng)) / 1000) * 1000;
    const realEstate = [];
    // 有備註的案件照樣抽亂數再覆蓋：亂數序列不變，後面產生的設籍年數、評點、電話等欄位才和原本一致
    if (failKind === 'house') {
      realEstate.push({ kind: '住宅', desc: `${pick(DISTRICTS, rng)}住宅一戶`, value: Math.round(between(3.2, 8.8, rng) * 1e6 / 1e4) * 1e4 });
    } else if (r === 'review') {
      realEstate.push({ kind: '土地', desc: `${pick(DISTRICTS, rng)}${pick(['農地', '道路用地', '畸零地'], rng)}持分 1/${pick([4, 6, 8, 12], rng)}`, value: Math.round(between(0.2, 1.6, rng) * 1e6 / 1e4) * 1e4 });
    }
    if (NOTED_ESTATE[no]) realEstate.splice(0, realEstate.length, { ...NOTED_ESTATE[no] });
    return { movable, cap, realEstate, failKind };
  }
  function residencyText(a, rng) {
    const r = a.checks.residency;
    const years = Math.max(1, Math.round(between(1, Math.min(30, a.age - 18), rng)));
    if (r === 'fail') return '設籍外縣市，未檢附本市就業或就學證明';
    if (a.group === 'local') {
      if (a.residency === 'reg') return r === 'review' ? `設籍港埕區，設籍年限待戶政確認` : `設籍港埕區 ${years} 年`;
      return a.residency === 'work' ? `設籍${a.district}，於港埕區就業${r === 'review' ? '（投保單位待確認）' : ' ' + Math.max(1, Math.round(years / 3)) + ' 年'}` : `設籍${a.district}，就讀港埕區學校`;
    }
    if (a.residency === 'work') return `於澄港市${a.district}就業${r === 'review' ? '（待補在職證明）' : '，勞保投保 ' + Math.max(1, Math.round(years / 3)) + ' 年'}`;
    if (a.residency === 'study') return `就讀澄港大學（${a.district}校區）`;
    return r === 'review' ? `設籍澄港市${a.district}，遷入日期待確認` : `設籍澄港市${a.district} ${years} 年`;
  }

  function buildHistory(a, rng) {
    const h = [];
    const att = a.attachments.length;
    h.push({ at: a.submittedAt, by: 'applicant', type: 'create', text: a.channel === 'online' ? `線上送出申請，附件 ${att} 件` : '臨櫃送件，由住宅發展處服務台代為建檔' });
    const batch = a.submittedAt + DAY + Math.round(rng() * 3) * 3600e3;
    const initial = a.initialChecks;
    h.push({ at: batch, by: 'system', type: 'check', text: '自動比對完成：' + CHECK_ORDER.map((k) => `${CHECKS[k].label}${CHECK_RESULT[initial[k]].label}`).join('、') });
    const docText = a.docs.map((d) => DOCS[d.key]).join('、');
    const rev = a.reviewer;
    if (a.status === 'qualified') {
      h.push({ at: workTime('2026-09-08', '2026-10-21', rng), by: rev, type: 'status', from: 'screening', to: 'qualified', text: '三項比對皆符合，資格確認' });
    } else if (a.status === 'ineligible') {
      const at = workTime('2026-09-10', '2026-10-20', rng);
      const reason = CHECK_ORDER.filter((k) => a.checks[k] === 'fail').map((k) => CHECKS[k].label + '不符').join('、');
      h.push({ at, by: rev, type: 'status', from: 'screening', to: 'ineligible', text: `判定不符資格：${reason}` });
      h.push({ at: at + 2 * 3600e3, by: 'system', type: 'notice', text: '寄發不合格通知（申覆期限 10/30）' });
    } else if (a.status === 'supplement') {
      h.push({ at: workTime('2026-09-21', '2026-10-02', rng), by: rev, type: 'status', from: 'screening', to: 'supplement', text: `通知補件：${docText}` });
    } else if (a.status === 'resubmitted') {
      h.push({ at: workTime('2026-09-21', '2026-10-02', rng), by: rev, type: 'status', from: 'screening', to: 'supplement', text: `通知補件：${docText}` });
      const up = workTime('2026-10-05', '2026-10-16', rng);
      h.push({ at: up, by: 'applicant', type: 'doc', text: `上傳補件：${docText}` });
      h.push({ at: up + 60e3, by: 'system', type: 'status', from: 'supplement', to: 'resubmitted', text: '補件已收件，進入補件審查' });
    } else {
      // 初審中：8 月首次比對就標記待確認，10 月資料更新後重新比對仍無法自動判定，才排進人工複核
      const keys = CHECK_ORDER.filter((k) => a.checks[k] === 'review');
      const reasons = { income: '所得資料年度差異，需人工核算', property: '財產清單有土地持分，需確認是否屬住宅', residency: '遷入日期與申請書不符，待戶政回覆' };
      h.push({ at: batch + 60e3, by: 'system', type: 'flag', text: '需人工確認：' + keys.map((k) => CHECKS[k].long).join('、') });
      h.push({ at: workTime('2026-10-06', '2026-10-21', rng), by: 'system', type: 'flag', text: '10 月資料重新比對：' + keys.map((k) => reasons[k]).join('；') });
    }
    h.sort((x, y) => x.at - y.at);
    if (a.note) {
      const last = h[h.length - 1].at;
      const at = Math.min(now() - 2 * 3600e3, Math.max(last + 2 * 3600e3, workTime('2026-10-14', '2026-10-21', rng)));
      h.push({ at, by: rev, type: 'note', text: a.note });
    }
    return h;
  }

  function hydrate(a) {
    if (a.members) return a;
    const rng = mulberry32(hashStr(a.id));
    a.initialChecks = { ...a.checks };
    a.members = buildMembers(a, rng);
    a.income = buildIncome(a, a.members, rng);
    a.assets = buildAssets(a, rng);
    a.residencyText = residencyText(a, rng);
    a.firstTime = rng() < 0.62;
    a.prevMissed = !a.firstTime && rng() < 0.6;
    a.phone = `09${pad(Math.floor(rng() * 90) + 10)}-***-${pad(Math.floor(rng() * 1000), 3)}`;
    a.address = `澄港市${a.district}${pick(STREETS[a.district], rng)}${rng() < 0.5 ? ' ' + (1 + Math.floor(rng() * 3)) + ' 段' : ''} ** 號 * 樓`;
    a.attachments = [
      { name: '申請書（簽章）.pdf', kind: 'pdf', size: 420 + Math.round(rng() * 300) },
      { name: '身分證正反面.jpg', kind: 'img', size: 860 + Math.round(rng() * 900) },
      { name: '戶口名簿影本.pdf', kind: 'pdf', size: 380 + Math.round(rng() * 500) },
    ];
    if (a.group === 'vulnerable') a.attachments.push({ name: SUBTYPES[a.sub].label + '證明.pdf', kind: 'pdf', size: 240 + Math.round(rng() * 300) });
    if (a.residency !== 'reg') a.attachments.push({ name: a.residency === 'work' ? '在職證明.pdf' : '在學證明.pdf', kind: 'pdf', size: 180 + Math.round(rng() * 200) });
    a.docs.filter((d) => d.state !== 'missing').forEach((d) => a.attachments.push({ name: DOCS[d.key] + '.pdf', kind: 'pdf', size: 300 + Math.round(rng() * 900), supplement: true }));
    a.history = buildHistory(a, rng);
    a.updatedAt = a.history[a.history.length - 1].at;
    return a;
  }
  // 工作清單 72 筆一開始就補齊，grid 才能直接顯示附件數與更新時間
  APPLICANTS.forEach(hydrate);

  const getApplicant = (id) => { const a = BY_ID.get(id); return a ? hydrate(a) : null; };

  function checksOf(a) {
    hydrate(a);
    const perCapLimit = RULES.perCapitaMonthly;
    return CHECK_ORDER.map((key) => {
      const base = { key, label: CHECKS[key].long, short: CHECKS[key].label, result: a.checks[key], source: CHECKS[key].source, syncedAt: toMs(CHECKS[key].syncedAt) };
      if (key === 'income') {
        return { ...base, value: a.income.annual, limit: a.income.limit, ratio: a.income.annual / a.income.limit,
          valueText: fmt.money(a.income.annual) + ' / 年', limitText: '≤ ' + fmt.money(a.income.limit),
          detail: `每人每月 ${fmt.money(a.income.perCapitaMonthly)}（上限 ${fmt.money(perCapLimit)}）` };
      }
      if (key === 'property') {
        const re = a.assets.realEstate;
        return { ...base, value: a.assets.movable, limit: a.assets.cap, ratio: a.assets.movable / a.assets.cap,
          valueText: '動產 ' + fmt.money(a.assets.movable), limitText: '≤ ' + fmt.money(a.assets.cap),
          detail: re.length ? re.map((r) => `${r.kind}：${r.desc}`).join('；') : '本人、配偶及戶內直系親屬於本市及鄰近縣市均無自有住宅' };
      }
      return { ...base, value: null, limit: null, ratio: null, valueText: a.residencyText, limitText: a.group === 'local' ? '設籍或就學就業於港埕區' : '設籍或就學就業於本市', detail: a.residencyText };
    });
  }

  function scoreOf(a) {
    hydrate(a);
    const items = [];
    if (a.group === 'vulnerable' && a.sub) items.push({ key: 'sub', label: SUBTYPES[a.sub].label, pts: SUBTYPES[a.sub].pts });
    if (a.hh >= 4) items.push({ key: 'hh', label: '家戶人數 4 人以上', pts: 1 });
    if (a.members.some((m) => m.relation !== '本人' && m.age >= 65)) items.push({ key: 'elder', label: '家戶內有 65 歲以上長者', pts: 1 });
    if (a.group === 'local') items.push(a.residency === 'reg' ? { key: 'local', label: '設籍港埕區', pts: 1 } : { key: 'local', label: '於港埕區就業／就學', pts: 1 });
    if (a.firstTime) items.push({ key: 'first', label: '首次申請本市社會住宅', pts: 1 });
    if (a.prevMissed) items.push({ key: 'missed', label: '前期申請未中籤', pts: 1 });
    return { total: sum(items.map((i) => i.pts)), max: 8, items };
  }

  /* ---------- 即時統計（每次呼叫都從記憶體資料重算，異動後自然同步） ---------- */
  function stats() {
    const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
    const s = {
      total: ALL.length,
      byStatus: zero(STATUS_ORDER),
      byGroup: zero(GROUP_ORDER),
      byGroupStatus: Object.fromEntries(GROUP_ORDER.map((g) => [g, zero(STATUS_ORDER)])),
      byUnit: zero(UNIT_ORDER),
      byGroupUnit: Object.fromEntries(GROUP_ORDER.map((g) => [g, zero(UNIT_ORDER)])),
      qualifiedByUnit: zero(UNIT_ORDER),
      qualifiedByGroupUnit: Object.fromEntries(GROUP_ORDER.map((g) => [g, zero(UNIT_ORDER)])),
      sub: zero(Object.keys(SUBTYPES)),
      checks: Object.fromEntries(CHECK_ORDER.map((k) => [k, { pass: 0, fail: 0, review: 0 }])),
      channel: { online: 0, counter: 0 },
      district: zero(DISTRICTS),
    };
    for (const a of ALL) {
      s.byStatus[a.status]++;
      s.byGroup[a.group]++;
      s.byGroupStatus[a.group][a.status]++;
      s.byUnit[a.unit]++;
      s.byGroupUnit[a.group][a.unit]++;
      if (a.status === 'qualified') { s.qualifiedByUnit[a.unit]++; s.qualifiedByGroupUnit[a.group][a.unit]++; }
      if (a.sub) s.sub[a.sub]++;
      for (const k of CHECK_ORDER) s.checks[k][a.checks[k]]++;
      s.channel[a.channel]++;
      s.district[a.district]++;
    }
    s.pending = s.byStatus.screening + s.byStatus.supplement + s.byStatus.resubmitted;
    s.rate = s.byStatus.qualified / s.total;
    s.odds = PROJECT.total / s.byStatus.qualified;
    return s;
  }
  function statValue(key, s = stats()) {
    if (key === 'total') return s.total;
    if (key === 'pending') return s.pending;
    if (key === 'rate') return s.rate;
    if (key === 'odds') return s.odds;
    if (STATUS[key]) return s.byStatus[key];
    if (GROUPS[key]) return s.byGroup[key];
    const [g, st] = key.split('.');
    if (GROUPS[g] && st === 'pending') return s.byGroupStatus[g].screening + s.byGroupStatus[g].supplement + s.byGroupStatus[g].resubmitted;
    if (GROUPS[g] && STATUS[st]) return s.byGroupStatus[g][st];
    throw new Error(`Unknown stat key: ${key}`);
  }

  /* ---------- 異動 ---------- */
  function mustGet(id) {
    const a = getApplicant(id);
    if (!a) throw new Error(`Unknown applicant: ${id}`);
    return a;
  }
  function pushEvent(a, ev) {
    a.history.push(ev);
    const prev = a.updatedAt;
    a.updatedAt = ev.at;
    return () => {
      const i = a.history.indexOf(ev);
      if (i >= 0) a.history.splice(i, 1);
      a.updatedAt = prev;
    };
  }
  function setStatus(id, to, { note = '', by = ME } = {}) {
    const a = mustGet(id);
    const from = a.status;
    if (from === to) return { undo() {} };
    a.status = to;
    const revert = pushEvent(a, { at: now(), by, type: 'status', from, to, text: note || `狀態由「${STATUS[from].label}」改為「${STATUS[to].label}」`, live: true });
    emit('app:data', { type: 'status', id, from, to });
    let done = false;
    return {
      undo() {
        if (done) return;
        done = true;
        a.status = from;
        revert();
        emit('app:data', { type: 'status', id, from: to, to: from, undo: true });
      },
    };
  }
  function setField(id, key, value, { by = ME, text = '' } = {}) {
    const a = mustGet(id);
    const prev = a[key];
    if (prev === value) return { undo() {} };
    a[key] = value;
    const revert = pushEvent(a, { at: now(), by, type: 'field', field: key, text: text || `更新欄位「${(FIELDS.find((f) => f.key === key) || { label: key }).label}」`, live: true });
    emit('app:data', { type: 'field', id, key, from: prev, to: value });
    let done = false;
    return {
      undo() {
        if (done) return;
        done = true;
        a[key] = prev;
        revert();
        emit('app:data', { type: 'field', id, key, from: value, to: prev, undo: true });
      },
    };
  }
  function setDoc(id, docKey, state, { by = ME } = {}) {
    const a = mustGet(id);
    const doc = a.docs.find((d) => d.key === docKey);
    if (!doc) throw new Error(`Unknown doc ${docKey} on ${id}`);
    const prev = doc.state;
    if (prev === state) return { undo() {} };
    doc.state = state;
    const revert = pushEvent(a, { at: now(), by, type: 'doc', text: `${DOCS[docKey]}：${DOC_STATE[state].label}`, live: true });
    emit('app:data', { type: 'doc', id, key: docKey, from: prev, to: state });
    let done = false;
    return {
      undo() {
        if (done) return;
        done = true;
        doc.state = prev;
        revert();
        emit('app:data', { type: 'doc', id, key: docKey, from: state, to: prev, undo: true });
      },
    };
  }
  function addNote(id, text, { by = ME } = {}) {
    const a = mustGet(id);
    const revert = pushEvent(a, { at: now(), by, type: 'note', text, live: true });
    emit('app:data', { type: 'note', id });
    let done = false;
    return {
      undo() {
        if (done) return;
        done = true;
        revert();
        emit('app:data', { type: 'note', id, undo: true });
      },
    };
  }
  const on = (fn) => {
    const h = (e) => fn(e.detail);
    document.addEventListener('app:data', h);
    return () => document.removeEventListener('app:data', h);
  };
  function activity(limit = 12) {
    const events = [];
    for (const a of APPLICANTS) for (const ev of a.history) if (ev.by !== 'applicant' || ev.type === 'doc') events.push({ ...ev, a });
    events.sort((x, y) => y.at - x.at);
    return events.slice(0, limit);
  }

  /* ---------- 抽籤 ---------- */
  const poolCache = new Map();
  const hashCache = new Map();
  const lottery = {
    info: LOTTERY,
    pool(group, unit) {
      const key = group + '|' + (unit || '');
      if (!poolCache.has(key)) {
        poolCache.set(key, ALL.filter((a) => a.lot && a.group === group && (!unit || a.unit === unit))
          .map((a) => ({ lot: a.lot, seq: a.lotSeq, id: a.id, name: maskName(a.name), district: a.district, hh: a.hh, unit: a.unit, group: a.group, detailed: a.detailed })));
      }
      return poolCache.get(key);
    },
    quota(group, unit) { return unit ? SUPPLY[unit][group] : PROJECT.quotas[group]; },
    waitlist(group, unit) { return Math.ceil(lottery.quota(group, unit) * PROJECT.waitlistRatio); },
    rosterHash(group) {
      if (!hashCache.has(group)) hashCache.set(group, sha256(lottery.pool(group).map((p) => `${p.lot},${p.id},${p.name}`).join('\n')));
      return hashCache.get(group);
    },
    draw(group, unit, seedHex) {
      const pool = lottery.pool(group, unit);
      const rng = prng(sha256(`${seedHex}|${group}|${unit || 'all'}`));
      const order = shuffle(pool, rng);
      const q = lottery.quota(group, unit);
      return { seed: seedHex, order, winners: order.slice(0, q), waitlist: order.slice(q, q + lottery.waitlist(group, unit)) };
    },
  };

  /* ==================================================================
   * 6. 欄位定義與圖示
   * ================================================================== */
  const FIELDS = [
    { key: 'name', label: '申請人', type: 'text', width: 168, primary: true },
    { key: 'id', label: '申請編號', type: 'autonumber', width: 112 },
    { key: 'group', label: '申請組別', type: 'select', width: 112 },
    { key: 'sub', label: '弱勢身分', type: 'select', width: 140 },
    { key: 'district', label: '設籍區', type: 'select', width: 104 },
    { key: 'hh', label: '家戶人數', type: 'number', width: 92 },
    { key: 'unit', label: '申請戶型', type: 'select', width: 104 },
    { key: 'building', label: '棟別意願', type: 'select', width: 96 },
    { key: 'checks', label: '自動比對', type: 'formula', width: 132 },
    { key: 'status', label: '資格狀態', type: 'select', width: 124 },
    { key: 'docs', label: '補件', type: 'attachment', width: 120 },
    { key: 'score', label: '評點', type: 'formula', width: 80 },
    { key: 'submittedAt', label: '送件日期', type: 'date', width: 104 },
    { key: 'reviewer', label: '承辦', type: 'user', width: 120 },
    { key: 'flagged', label: '主管複核', type: 'checkbox', width: 92 },
    { key: 'phone', label: '聯絡電話', type: 'phone', width: 128 },
  ];

  // 16×16、1.5 線寬；dots 為實心圓點（線段長度為 0 時看不清楚）
  const ICONS = {
    'arrow-left': 'M13 8H3M7 4L3 8l4 4',
    'arrow-right': 'M3 8h10M9 4l4 4-4 4',
    'arrow-up-right': 'M5 11l6-6M6 5h5v5',
    'chevron-down': 'M4 6l4 4 4-4',
    'chevron-up': 'M4 10l4-4 4 4',
    'chevron-right': 'M6 4l4 4-4 4',
    'chevron-left': 'M10 4L6 8l4 4',
    x: 'M4 4l8 8M12 4l-8 8',
    check: 'M3.5 8.5l3 3 6-7',
    question: 'M5.8 6a2.2 2.2 0 1 1 3.2 2c-.6.3-1 .8-1 1.4v.4',
    plus: 'M8 3v10M3 8h10',
    minus: 'M3 8h10',
    search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6L14 14',
    filter: 'M2 3.5h12M4.5 8h7M7 12.5h2',
    sort: 'M5 2.5v11M2.5 11L5 13.5 7.5 11M11 13.5v-11M8.5 5L11 2.5 13.5 5',
    group: 'M2.5 2.5h11v4h-11zM4.5 9.5h9M4.5 13h9M2.5 9.5V13',
    eye: 'M1.8 8S4 3.5 8 3.5 14.2 8 14.2 8 12 12.5 8 12.5 1.8 8 1.8 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'eye-off': 'M1.8 8S4 3.5 8 3.5 14.2 8 14.2 8 12 12.5 8 12.5 1.8 8 1.8 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 2.5l11 11',
    grid: 'M2.5 2.5h11v11h-11zM2.5 6.2h11M2.5 9.8h11M6.2 2.5v11',
    kanban: 'M2.5 2.5h3v11h-3zM6.5 2.5h3v7h-3zM10.5 2.5h3v9h-3z',
    gallery: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
    timeline: 'M2.5 3.5h6M5.5 8h8M3.5 12.5h5',
    home: 'M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H10v-4H6v4H3a.5.5 0 0 1-.5-.5z',
    building: 'M3 13.5v-10l5-1.5v11.5M8 5.5l5 1.5v6.5M1.5 13.5h13M5 5.5h1M5 8h1M5 10.5h1M10 8.5h1M10 11h1',
    users: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 7a2 2 0 1 0 0-4M12.5 9.7c1.3.5 2 1.8 2 3.3',
    user: 'M8 7.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 14c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5',
    bell: 'M4 11V7a4 4 0 1 1 8 0v4l1 1.5H3zM6.5 13.5a1.5 1.5 0 0 0 3 0',
    help: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.3a1.9 1.9 0 1 1 2.6 1.7c-.5.2-.8.6-.8 1.1v.4',
    info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v4',
    alert: 'M8 2l6.5 11.5h-13zM8 6.5v3',
    'check-circle': 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.3 8.2l1.9 1.9 3.5-4',
    'x-circle': 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6 6l4 4M10 6l-4 4',
    clock: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5',
    calendar: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
    download: 'M8 2.5v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11',
    upload: 'M8 11V3M4.5 6L8 2.5 11.5 6M2.5 13.5h11',
    paperclip: 'M13 7.5l-5.2 5.2a3 3 0 0 1-4.3-4.2l5.6-5.7a2 2 0 0 1 2.8 2.9l-5.5 5.5a1 1 0 0 1-1.4-1.4L10 4.8',
    file: 'M4 1.5h5l3.5 3.5v9.5H4zM9 1.5V5h3.5',
    expand: 'M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9',
    edit: 'M10.5 2.5l3 3L6 13H3v-3zM9 4l3 3',
    trash: 'M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.7 9h6.6l.7-9',
    undo: 'M5 3L2 6l3 3M2 6h7.5a3.5 3.5 0 0 1 0 7H6',
    refresh: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3',
    copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
    external: 'M9.5 2.5h4v4M13.5 2.5L8 8M12 9.5v4H2.5V4h4',
    link: 'M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1',
    lock: 'M3.5 7h9v6.5h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2',
    shield: 'M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4zM5.8 8l1.6 1.6 3-3.2',
    ticket: 'M2 4.5h12v2.2a1.5 1.5 0 0 0 0 2.6v2.2H2V9.3a1.5 1.5 0 0 0 0-2.6zM10 4.5v7',
    play: 'M5 3l8 5-8 5z',
    pause: 'M5.5 3v10M10.5 3v10',
    broadcast: 'M5 11a4.2 4.2 0 0 1 0-6M11 5a4.2 4.2 0 0 1 0 6M3 13a7 7 0 0 1 0-10M13 3a7 7 0 0 1 0 10',
    sparkle: 'M8 1.5l1.5 4.5L14 7.5 9.5 9 8 14.5 6.5 9 2 7.5 6.5 6z',
    star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z',
    flag: 'M3.5 14V2.5M3.5 3h8L10 6l1.5 3h-8',
    comment: 'M2.5 3h11v8h-6l-3 2.5V11h-2z',
    menu: 'M2.5 4h11M2.5 8h11M2.5 12h11',
    'row-height': 'M2.5 2.5h11M2.5 13.5h11M8 5v6M6.3 6.7L8 5l1.7 1.7M6.3 9.3L8 11l1.7-1.7',
    palette: 'M8 14.5a6.5 6.5 0 1 1 6.5-6.5c0 1.5-1.2 2.2-2.5 2.2h-1.4a1.3 1.3 0 0 0-1 2.1c.6.8.1 2.2-1.6 2.2z',
    share: 'M4 9.5v4h8v-4M8 2v8M5 5l3-3 3 3',
    'map-pin': 'M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14zM8 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    phone: 'M3 2.5h3l1.2 3-1.7 1.1a7 7 0 0 0 3.9 3.9l1.1-1.7 3 1.2v3a1 1 0 0 1-1 1A11.5 11.5 0 0 1 2 3.5a1 1 0 0 1 1-1z',
    mail: 'M2 3.5h12v9H2zM2 4l6 4.5L14 4',
    'id-card': 'M2 3.5h12v9H2zM4.4 10c.3-1 1-1.5 1.9-1.5s1.6.5 1.9 1.5M6.3 7.3a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM9.8 6h2.7M9.8 8.5h2',
    coins: 'M8 6.5c3 0 5.5-.9 5.5-2s-2.5-2-5.5-2-5.5.9-5.5 2 2.5 2 5.5 2zM2.5 4.5v7c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-7M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
    hash: 'M6 2.5l-1.5 11M11.5 2.5L10 13.5M3 6h10.5M2.5 10H13',
    shuffle: 'M2 4.5h2.5c2.5 0 3.5 7 6 7H14M2 11.5h2.5c1.1 0 1.9-1.4 2.6-3M14 4.5h-3.5c-1.1 0-1.9 1.4-2.6 3M12 2.5l2 2-2 2M12 9.5l2 2-2 2',
    layers: 'M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
    target: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    zap: 'M9 1.5L3 9h4.5L7 14.5 13 7H8.5z',
    inbox: 'M2.5 9.5l1.6-5.2a1 1 0 0 1 .96-.7h5.88a1 1 0 0 1 .96.7l1.6 5.2v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM2.5 9.5h3l1 1.5h3l1-1.5h3',
    settings: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4',
  };
  const ICON_DOTS = {
    more: [[3.5, 8], [8, 8], [12.5, 8]],
    question: [[8, 12]],
    info: [[8, 5]],
    alert: [[8, 11.8]],
    help: [[8, 11.6]],
    grip: [[6, 4], [10, 4], [6, 8], [10, 8], [6, 12], [10, 12]],
    dice: [[5.5, 5.5], [10.5, 5.5], [8, 8], [5.5, 10.5], [10.5, 10.5]],
    list: [[3, 4], [3, 8], [3, 12]],
    live: [[8, 8]],
  };
  const ICON_EXTRA = { dice: 'M2.5 2.5h11v11h-11z', list: 'M5.5 4h8M5.5 8h8M5.5 12h8', live: ICONS.broadcast };

  const FIELD_ICONS = {
    text: 'M4 13l4-10 4 10M5.6 9.5h4.8',
    longtext: 'M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h7',
    number: ICONS.hash,
    autonumber: 'M2.5 2.5h11v11h-11zM6.5 5.5L8 4.5v7M6.5 11.5h3',
    currency: 'M8 1.5v13M11 4.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.5 0-2.7-.6-3.2-1.7',
    percent: 'M12.5 3.5l-9 9M4.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    select: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.5 7l2.5 2.5L10.5 7',
    multiselect: 'M6 4h7.5M6 8h7.5M6 12h7.5M2.5 4l.8.8 1.4-1.6M2.5 8l.8.8 1.4-1.6M2.5 12l.8.8 1.4-1.6',
    date: ICONS.calendar,
    attachment: ICONS.paperclip,
    checkbox: 'M2.5 2.5h11v11h-11zM5 8l2 2 4-4.5',
    formula: 'M7.5 2.5C6 2.5 5.5 3.3 5.3 4.5l-1.1 7c-.2 1.2-.7 2-2.2 2M3 6.5h4.5M9 7.5l4.5 5M13.5 7.5l-4.5 5',
    user: ICONS.user,
    phone: ICONS.phone,
    email: ICONS.mail,
    link: 'M2.5 4.5h5v7h-5zM8.5 8h5M11 5.5L13.5 8 11 10.5',
    rating: ICONS.star,
    lookup: ICONS.search,
    duration: ICONS.clock,
  };

  function svg(d, dots, cls, sw = 1.5) {
    const circles = (dots || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.15" fill="currentColor" stroke="none"/>`).join('');
    return `<svg class="${cls}" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d ? `<path d="${d}"/>` : ''}${circles}</svg>`;
  }
  function icon(name, cls = '') {
    const d = ICONS[name] ?? ICON_EXTRA[name];
    if (d === undefined && !ICON_DOTS[name]) throw new Error(`Unknown icon: ${name}`);
    return svg(d, ICON_DOTS[name], ('i ' + cls).trim());
  }
  function fieldIcon(type, cls = '') {
    const d = FIELD_ICONS[type];
    if (!d) throw new Error(`Unknown field type: ${type}`);
    return `<span class="fi ${cls}" title="${esc(FIELD_TYPE_LABEL[type] || type)}">${svg(d, null, 'i')}</span>`;
  }
  const FIELD_TYPE_LABEL = {
    text: '單行文字', longtext: '長文字', number: '數字', autonumber: '自動編號', currency: '金額', percent: '百分比',
    select: '單選', multiselect: '多選', date: '日期', attachment: '附件', checkbox: '勾選', formula: '公式',
    user: '使用者', phone: '電話', email: '電子郵件', link: '連結記錄', rating: '評分', lookup: '查閱', duration: '期間',
  };

  /* ==================================================================
   * 7. 標記產生器
   * ================================================================== */
  const pill = (text, color = 'gray', { dot = false, cls = '', title = '' } = {}) =>
    `<span class="pill tone-${color}${cls ? ' ' + cls : ''}"${title ? ` title="${esc(title)}"` : ''}>${dot ? '<span class="pill__dot"></span>' : ''}<span class="pill__text">${esc(text)}</span></span>`;
  const statusPill = (s, o) => pill(STATUS[s].label, STATUS[s].color, o);
  const groupPill = (g, o) => pill(GROUPS[g].label, GROUPS[g].color, o);
  const unitPill = (u, o) => pill(UNITS[u].label, UNITS[u].color, o);
  const subPill = (s, o) => (s ? pill(SUBTYPES[s].label, SUBTYPES[s].color, o) : '');
  const districtPill = (d, o) => pill(d, DISTRICT_COLOR[d], o);
  const buildingPill = (b, o) => pill(BUILDING_PREF[b].label, BUILDING_PREF[b].color, o);
  const checkIcon = (result, label = '') =>
    `<span class="chk chk--${result}" title="${esc((label ? label + '：' : '') + CHECK_RESULT[result].label)}">${icon(CHECK_RESULT[result].icon)}<span class="sr-only">${esc((label ? label : '') + CHECK_RESULT[result].label)}</span></span>`;
  const checkPill = (result, label) => pill((label ? label + ' ' : '') + CHECK_RESULT[result].label, CHECK_RESULT[result].color, { dot: true });

  function avatar(who, size = '') {
    const p = typeof who === 'string' ? (STAFF[who] || { name: who === 'system' ? '系統' : '申請人', hue: who === 'system' ? 220 : 40 }) : who;
    // 承辦姓氏彼此不重複，單字頭像最清楚；系統事件用閃電圖示
    const inner = who === 'system' ? icon('zap') : esc(who === 'applicant' ? '申' : p.name[0]);
    return `<span class="avatar${size ? ' avatar--' + size : ''}${who === 'system' ? ' avatar--system' : ''}" style="--h:${p.hue}" title="${esc(p.name)}" aria-hidden="true">${inner}</span>`;
  }
  function person(who, size = 'sm') {
    const name = STAFF[who] ? STAFF[who].name : who === 'system' ? '系統自動' : '申請人';
    return `<span class="person">${avatar(who, size)}<span class="person__name">${esc(name)}</span></span>`;
  }
  function attachments(files) {
    if (!files || !files.length) return '';
    return `<span class="attach">${files.map((f) => `<span class="attach__item attach__item--${f.kind}" title="${esc(f.name)}">${f.kind === 'pdf' ? 'PDF' : '<svg viewBox="0 0 12 10" aria-hidden="true"><path d="M1 9l3-4 2 2.5L8 5l3 4z" fill="currentColor"/><circle cx="3.2" cy="2.6" r="1.1" fill="currentColor"/></svg>'}</span>`).join('')}</span>`;
  }

  // 戶型平面示意（gallery 封面、詳情頁）：只用線條與淺色塊，顏色跟著 tone
  const PLANS = {
    studio: '<rect x="14" y="10" width="92" height="60" rx="2"/><path d="M14 34h26V10M40 52v18M64 10v14"/><rect x="72" y="40" width="26" height="22" rx="2" class="fp-fill"/><path d="M18 14h18v16H18z" class="fp-soft"/><path d="M48 70v-4h12v4"/>',
    one: '<rect x="10" y="10" width="100" height="60" rx="2"/><path d="M62 10v60M10 36h28V10M62 44h48"/><rect x="74" y="16" width="28" height="22" rx="2" class="fp-fill"/><path d="M14 14h20v18H14z" class="fp-soft"/><path d="M30 70v-4h14v4M62 52h-4"/>',
    two: '<rect x="6" y="8" width="108" height="64" rx="2"/><path d="M42 8v34H6M78 8v64M42 42v30M78 40h36M6 58h18"/><rect x="86" y="14" width="22" height="20" rx="2" class="fp-fill"/><rect x="86" y="46" width="22" height="20" rx="2" class="fp-fill"/><path d="M10 12h28v26H10z" class="fp-soft"/>',
    three: '<rect x="4" y="6" width="112" height="68" rx="2"/><path d="M40 6v30H4M76 6v68M40 36v38M76 30h40M76 54h40M4 56h18"/><rect x="84" y="10" width="22" height="16" rx="2" class="fp-fill"/><rect x="84" y="34" width="22" height="16" rx="2" class="fp-fill"/><rect x="84" y="58" width="22" height="12" rx="2" class="fp-fill"/><path d="M8 10h28v22H8z" class="fp-soft"/>',
  };
  const floorplan = (unit) => `<svg class="floorplan tone-${UNITS[unit].color}" viewBox="0 0 120 80" role="img" aria-label="${esc(UNITS[unit].label)}平面示意"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${PLANS[unit]}</g></svg>`;

  function emptyState({ title = '沒有符合的資料', text = '試著調整篩選條件或清除搜尋關鍵字。', action = '' } = {}) {
    return `<div class="empty"><svg class="empty__art" viewBox="0 0 120 80" aria-hidden="true">
      <rect x="10" y="12" width="84" height="56" rx="6" fill="#fff" stroke="#DEE1E7"/>
      <path d="M10 26h84M38 12v56M66 12v56M10 40h84M10 54h84" stroke="#EBEDF1"/>
      <rect x="42" y="30" width="20" height="6" rx="3" fill="#FFEAB6"/><rect x="70" y="44" width="18" height="6" rx="3" fill="#D1F7C4"/><rect x="14" y="58" width="20" height="6" rx="3" fill="#FFDCE5"/>
      <circle cx="88" cy="50" r="14" fill="#fff" stroke="#2D7FF9" stroke-width="3"/><path d="M98 60l10 10" stroke="#2D7FF9" stroke-width="4" stroke-linecap="round"/>
    </svg><p class="empty__title">${esc(title)}</p><p class="empty__text">${esc(text)}</p>${action}</div>`;
  }

  /* ==================================================================
   * 8. Toast（有 modal 開著時移進該 dialog，避免被 top layer 蓋住）
   * ================================================================== */
  const toastBox = document.createElement('div');
  toastBox.className = 'toasts';
  toastBox.setAttribute('role', 'status');
  toastBox.setAttribute('aria-live', 'polite');
  const openDialogs = [];
  const topDialog = () => openDialogs[openDialogs.length - 1]?.el || null;
  function syncToastHost() {
    const host = topDialog() || document.body;
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
  }
  const TONE_ICON = { info: 'info', success: 'check-circle', warn: 'alert', danger: 'x-circle' };
  function toast(message, { tone = 'info', desc = '', action = null, duration } = {}) {
    syncToastHost();
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.innerHTML = `<span class="toast__icon">${icon(TONE_ICON[tone])}</span>
      <div class="toast__text"><p class="toast__msg">${esc(message)}</p>${desc ? `<p class="toast__desc">${esc(desc)}</p>` : ''}</div>
      ${action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : ''}
      <button type="button" class="toast__close" aria-label="關閉通知">${icon('x')}</button>`;
    toastBox.appendChild(el);
    while (toastBox.children.length > 4) toastBox.firstElementChild.remove();
    let timer = 0;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (!motionOK()) { el.remove(); return; }
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    };
    const ms = duration ?? (action ? 6500 : 4200);
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, ms); };
    arm();
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', arm);
    el.querySelector('.toast__close').addEventListener('click', close);
    if (action) el.querySelector('.toast__action').addEventListener('click', () => { action.onClick?.(); close(); });
    return { close };
  }

  /* ==================================================================
   * 9. Modal（<dialog>.showModal；from 參數做「列展開」expand 動畫）
   * ================================================================== */
  function modal({ title = '', eyebrow = '', body = '', actions = [], size = 'md', from = null, onClose = null, className = '' } = {}) {
    closeMenu();
    const dlg = document.createElement('dialog');
    const id = 'dlg-' + (++uid);
    dlg.className = `modal modal--${size}${className ? ' ' + className : ''}`;
    dlg.setAttribute('aria-labelledby', id + '-title');
    dlg.innerHTML = `<div class="modal__panel">
      <header class="modal__head">
        <div class="modal__heading">${eyebrow ? `<p class="modal__eyebrow">${eyebrow}</p>` : ''}<h2 class="modal__title" id="${id}-title">${title}</h2></div>
        <button type="button" class="icon-btn modal__close" aria-label="關閉">${icon('x')}</button>
      </header>
      <div class="modal__body"></div>
      ${actions.length ? '<footer class="modal__foot"></footer>' : ''}
    </div>`;
    const bodyEl = dlg.querySelector('.modal__body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    const foot = dlg.querySelector('.modal__foot');
    let closing = false;
    const record = { el: dlg };
    const returnFocus = document.activeElement;

    function close(result) {
      if (closing) return;
      closing = true;
      const finish = () => {
        dlg.close();
        dlg.remove();
        const i = openDialogs.indexOf(record);
        if (i >= 0) openDialogs.splice(i, 1);
        syncToastHost();
        onClose?.(result);
        // 優先把焦點還給開啟 modal 的按鈕；它被重繪掉時才退回 from 元素
        const back = returnFocus && returnFocus.isConnected && returnFocus !== document.body ? returnFocus : from;
        if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
      };
      if (!motionOK()) { finish(); return; }
      const panel = dlg.querySelector('.modal__panel');
      const target = from && from.isConnected && isVisible(from) ? from.getBoundingClientRect() : null;
      let anim;
      if (target) {
        const b = dlg.getBoundingClientRect();
        anim = dlg.animate([{ transform: 'none', opacity: 1 }, { transform: rectTransform(target, b), opacity: 0.4 }], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)' });
        panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      } else {
        anim = dlg.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(8px) scale(.98)', opacity: 0 }], { duration: 160, easing: 'ease-in' });
      }
      dlg.classList.add('is-closing');
      anim.onfinish = finish;
    }

    actions.forEach((a) => {
      const el = document.createElement(a.href ? 'a' : 'button');
      el.className = `btn${a.variant ? ' btn--' + a.variant : ''}`;
      if (a.href) el.href = a.href; else el.type = 'button';
      el.innerHTML = (a.icon ? icon(a.icon) : '') + `<span>${esc(a.label)}</span>`;
      if (a.onClick) el.addEventListener('click', (e) => { if (!a.href) e.preventDefault(); a.onClick(close); });
      else if (!a.href) el.addEventListener('click', () => close());
      if (a.autofocus) el.dataset.autofocus = '';
      foot.appendChild(el);
    });
    dlg.querySelector('.modal__close').addEventListener('click', () => close());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    // 點 backdrop（dialog 本身，而非 panel）關閉
    dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.dataset.downOnBackdrop = '1'; });
    dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg.dataset.downOnBackdrop) close(); delete dlg.dataset.downOnBackdrop; });

    document.body.appendChild(dlg);
    dlg.showModal();
    openDialogs.push(record);
    syncToastHost();
    const auto = dlg.querySelector('[data-autofocus]') || dlg.querySelector('.modal__close');
    auto.focus({ preventScroll: true });

    if (motionOK()) {
      const panel = dlg.querySelector('.modal__panel');
      if (from && isVisible(from)) {
        const a = from.getBoundingClientRect();
        const b = dlg.getBoundingClientRect();
        dlg.animate([{ transform: rectTransform(a, b), opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
        panel.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
      } else {
        dlg.animate([{ transform: 'translateY(10px) scale(.98)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    record.close = close;
    return { el: dlg, body: bodyEl, close };
  }
  const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const rectTransform = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${Math.max(0.02, from.width / to.width)}, ${Math.max(0.02, from.height / to.height)})`;

  function confirmDialog({ title = '確認操作', message = '', confirmLabel = '確認', cancelLabel = '取消', tone = 'primary' } = {}) {
    return new Promise((resolve) => {
      let result = false;
      modal({
        title, size: 'sm', body: `<p class="modal__text">${esc(message)}</p>`,
        actions: [
          { label: cancelLabel, variant: 'ghost', onClick: (close) => close() },
          { label: confirmLabel, variant: tone === 'danger' ? 'danger' : 'primary', autofocus: true, onClick: (close) => { result = true; close(); } },
        ],
        onClose: () => resolve(result),
      });
    });
  }

  /* ==================================================================
   * 10. 下拉選單（單選欄位的 inline 編輯也用這個）
   * ================================================================== */
  let activeMenu = null;
  function closeMenu(returnFocus = false) {
    if (!activeMenu) return;
    const m = activeMenu;
    activeMenu = null;
    m.anchor.setAttribute('aria-expanded', 'false');
    m.cleanup();
    m.el.remove();
    if (returnFocus && m.anchor.isConnected) m.anchor.focus({ preventScroll: true });
  }
  function menu(anchor, { items = [], search = false, placeholder = '搜尋選項…', onSelect = null, align = 'start', title = '', keepOpen = false, width = 0 } = {}) {
    if (activeMenu && activeMenu.anchor === anchor) { closeMenu(true); return { close() {}, el: null }; }
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    if (width) el.style.width = width + 'px';
    el.innerHTML = `${title ? `<p class="menu__title">${esc(title)}</p>` : ''}${search ? `<div class="menu__search search"><span class="search__icon">${icon('search')}</span><input class="input input--sm" type="text" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div>` : ''}<div class="menu__list"></div>`;
    const list = el.querySelector('.menu__list');
    const render = (q = '') => {
      const query = q.trim().toLowerCase();
      const visible = items.filter((it) => typeof it !== 'object' || it.header || !query || (it.label + ' ' + (it.sub || '') + ' ' + (it.desc || '')).toLowerCase().includes(query));
      list.innerHTML = visible.map((it, i) => {
        if (it === 'sep') return query ? '' : '<div class="menu__sep" role="separator"></div>';
        if (it.header) return query ? '' : `<p class="menu__header">${esc(it.header)}</p>`;
        const tag = it.href ? 'a' : 'button';
        const label = it.color ? pill(it.label, it.color) : `<span class="menu__label">${esc(it.label)}</span>`;
        return `<${tag} class="menu__item${it.danger ? ' menu__item--danger' : ''}" role="menuitem" ${it.href ? `href="${esc(it.href)}"` : 'type="button"'} data-i="${items.indexOf(it)}"${it.checked != null ? ` aria-checked="${!!it.checked}"` : ''}${it.disabled ? ' disabled' : ''}>
          ${it.checked != null ? `<span class="menu__check">${icon('check')}</span>` : ''}${it.icon ? `<span class="menu__icon">${icon(it.icon)}</span>` : ''}
          <span class="menu__main">${label}${it.desc ? `<span class="menu__desc">${esc(it.desc)}</span>` : ''}</span>${it.sub ? `<span class="menu__sub">${esc(it.sub)}</span>` : ''}</${tag}>`;
      }).join('') || '<p class="menu__empty">沒有符合的選項</p>';
    };
    render();
    (topDialog() || document.body).appendChild(el);

    const place = () => {
      const r = anchor.getBoundingClientRect();
      const mw = el.offsetWidth;
      const mh = el.offsetHeight;
      let left = align === 'end' ? r.right - mw : r.left;
      left = clamp(left, 8, innerWidth - mw - 8);
      let top = r.bottom + 4;
      if (top + mh > innerHeight - 8 && r.top - mh - 4 > 8) { top = r.top - mh - 4; el.classList.add('is-up'); }
      el.style.left = left + 'px';
      el.style.top = Math.max(8, top) + 'px';
    };
    place();
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-haspopup', 'menu');

    const focusables = () => $$('.menu__item:not([disabled])', el);
    const searchInput = $('.menu__search input', el);
    (searchInput || focusables()[0])?.focus({ preventScroll: true });
    if (searchInput) searchInput.addEventListener('input', () => render(searchInput.value));

    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.menu__item');
      if (!btn || btn.disabled) return;
      const it = items[+btn.dataset.i];
      if (!it.href) e.preventDefault();
      if (keepOpen && it.checked != null) {
        it.checked = !it.checked;
        btn.setAttribute('aria-checked', String(it.checked));
        onSelect?.(it.value, it);
        return;
      }
      closeMenu(!it.href);
      onSelect?.(it.value, it);
    });
    el.addEventListener('keydown', (e) => {
      const f = focusables();
      const i = f.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); f[(i + 1) % f.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); f[(i - 1 + f.length) % f.length]?.focus(); }
      else if (e.key === 'Enter' && document.activeElement === searchInput && f[0]) { e.preventDefault(); f[0].click(); }
      else if (e.key === 'Tab') closeMenu();
    });
    const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    const onScroll = (e) => { if (!el.contains(e.target)) place(); };
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    activeMenu = {
      el, anchor,
      cleanup() {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', place);
      },
    };
    return { close: () => { if (activeMenu && activeMenu.el === el) closeMenu(); }, el };
  }

  /* ==================================================================
   * 11. 分頁籤與分段控制
   * ================================================================== */
  function tabs(list, { onChange = null } = {}) {
    if (list._tabs) { list._tabs.onChange = onChange; return list._tabs; }
    const items = $$('[role="tab"]', list);
    const ink = document.createElement('span');
    ink.className = 'tabs__ink';
    ink.setAttribute('aria-hidden', 'true');
    list.appendChild(ink);
    list.classList.add('has-ink');
    let index = Math.max(0, items.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    const api = { onChange, select, get index() { return index; } };
    function moveInk() {
      const t = items[index];
      if (!t) return;
      ink.style.width = t.offsetWidth + 'px';
      ink.style.transform = `translateX(${t.offsetLeft}px)`;
    }
    function select(i, { focus = false, silent = false } = {}) {
      index = clamp(i, 0, items.length - 1);
      items.forEach((t, j) => {
        const on = j === index;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      moveInk();
      if (focus) items[index].focus();
      if (!silent) api.onChange?.(index, items[index]);
    }
    items.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const map = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 };
        if (e.key in map) { e.preventDefault(); select((map[e.key] + items.length) % items.length, { focus: true }); }
      });
    });
    select(index, { silent: true });
    new ResizeObserver(moveInk).observe(list);
    list._tabs = api;
    return api;
  }

  function seg(container, { onChange = null } = {}) {
    if (container._seg) { container._seg.onChange = onChange; return container._seg; }
    const btns = $$('button', container);
    const thumb = document.createElement('span');
    thumb.className = 'seg__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    container.prepend(thumb);
    container.classList.add('has-thumb');
    let value = (btns.find((b) => b.getAttribute('aria-pressed') === 'true') || btns[0]).dataset.value;
    const api = { onChange, select, get value() { return value; } };
    function moveThumb() {
      const b = btns.find((x) => x.dataset.value === value);
      thumb.style.width = b.offsetWidth + 'px';
      thumb.style.transform = `translateX(${b.offsetLeft}px)`;
    }
    function select(v, { silent = false } = {}) {
      value = v;
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
      moveThumb();
      if (!silent) api.onChange?.(v, btns.find((b) => b.dataset.value === v));
    }
    btns.forEach((b) => b.addEventListener('click', () => { if (b.dataset.value !== value) select(b.dataset.value); }));
    select(value, { silent: true });
    new ResizeObserver(moveThumb).observe(container);
    container._seg = api;
    return api;
  }

  /* ==================================================================
   * 12. 號碼滾輪（抽籤、倒數、計數共用）
   *     每一位數是一條 0–9 重複 5 輪的帶子，以 translateY 百分比定位；
   *     轉完後無動畫地跳回第一輪的同一個數字，畫面看不出差異，下次可以再轉多圈。
   *     每次呼叫遞增 token，舊的計時器發現 token 過期就不動作 → 連續快速呼叫也不會錯亂。
   * ================================================================== */
  const REEL_BANDS = 5;
  function reel(el, { value } = {}) {
    if (el._reel) { if (value != null && el._reel.value !== String(value)) el._reel.set(value); return el._reel; }
    el.classList.add('reel');
    let digits = [];
    let shape = '';
    let current = '';
    let token = 0;
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    const place = (d, idx, dur = 0, delay = 0, ease = 'linear') => {
      d.idx = idx;
      d.strip.style.transition = dur ? `transform ${dur}ms ${ease} ${delay}ms` : 'none';
      d.strip.style.transform = `translate3d(0, ${-idx * 100 / (REEL_BANDS * 10)}%, 0)`;
    };
    function build(str) {
      const vis = document.createElement('span');
      vis.className = 'reel__vis';
      vis.setAttribute('aria-hidden', 'true');
      digits = [];
      for (const ch of str) {
        if (/\d/.test(ch)) {
          const box = document.createElement('span');
          box.className = 'reel__d';
          const strip = document.createElement('span');
          strip.className = 'reel__strip';
          let html = '';
          for (let i = 0; i < REEL_BANDS * 10; i++) html += `<span>${i % 10}</span>`;
          strip.innerHTML = html;
          box.appendChild(strip);
          vis.appendChild(box);
          const d = { strip, idx: 0 };
          place(d, +ch);
          digits.push(d);
        } else {
          const s = document.createElement('span');
          s.className = 'reel__sep';
          s.textContent = ch;
          vis.appendChild(s);
        }
      }
      el.replaceChildren(vis, sr);
      shape = str.replace(/\d/g, '0');
    }
    const settle = (my, ms, target) => setTimeout(() => {
      if (my !== token) return;
      digits.forEach((d, i) => place(d, +target.replace(/\D/g, '')[i]));
    }, ms);
    const api = {
      get value() { return current; },
      set(v) {
        token++;
        const str = String(v);
        if (str.replace(/\d/g, '0') !== shape) build(str);
        else digits.forEach((d, i) => place(d, +str.replace(/\D/g, '')[i]));
        current = str;
        sr.textContent = str;
      },
      // 只滾動有變化的位數（計數、倒數）
      roll(v, { duration = 520, stagger = 40, ease = 'cubic-bezier(.3,1.4,.5,1)' } = {}) {
        const str = String(v);
        if (!motionOK() || str.replace(/\d/g, '0') !== shape) { api.set(str); return; }
        const my = ++token;
        const nums = str.replace(/\D/g, '');
        let longest = 0;
        digits.forEach((d, i) => {
          const cur = d.idx % 10;
          const t = +nums[i];
          if (cur === t) return;
          // 先無動畫移回第二輪的同一個數字，往上或往下滾都有空間
          place(d, cur + 10);
          d.strip.getBoundingClientRect();
          const delay = (digits.length - 1 - i) * stagger;
          place(d, t + 10, duration, delay, ease);
          longest = Math.max(longest, duration + delay);
        });
        current = str;
        sr.textContent = str;
        settle(my, longest + 40, str);
      },
      // 抽籤：高速旋轉數圈後由左到右依序停下；回傳 Promise<true>（被新的呼叫打斷時為 false）
      spin(v, { duration = 2400, stagger = 260, loops = 3, ease = 'cubic-bezier(.15,.6,.2,1.02)' } = {}) {
        const str = String(v);
        if (str.replace(/\d/g, '0') !== shape) build(str.replace(/\d/g, '0'));
        current = str;
        sr.textContent = str;
        if (!motionOK()) { api.set(str); return Promise.resolve(true); }
        const my = ++token;
        const nums = str.replace(/\D/g, '');
        const turns = clamp(loops, 1, REEL_BANDS - 1);
        let longest = 0;
        digits.forEach((d, i) => {
          place(d, d.idx % 10);
          d.strip.getBoundingClientRect();
          const dur = duration + i * stagger;
          place(d, turns * 10 + +nums[i], dur, 0, ease);
          longest = Math.max(longest, dur);
        });
        el.classList.add('is-spinning');
        return new Promise((resolve) => setTimeout(() => {
          if (my !== token) { resolve(false); return; }
          el.classList.remove('is-spinning');
          digits.forEach((d, i) => place(d, +nums[i]));
          resolve(true);
        }, longest + 30));
      },
    };
    api.set(String(value ?? '0'));
    el._reel = api;
    return api;
  }

  function odometer(el, n) {
    el.dataset.odometer = String(n);
    const fmtd = fmt.num(n);
    if (!el._reel) { reel(el, { value: fmtd }); return; }
    el._reel.roll(fmtd);
  }
  // [data-odometer]：先以 0 佔位，進入畫面時才轉到「當下」的數值（期間若被更新，以最新值為準）
  const odoIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      odoIO.unobserve(e.target);
      requestAnimationFrame(() => {
        const el = e.target;
        el._reel.spin(fmt.num(+el.dataset.odometer), { duration: 1100, stagger: 90, loops: 1, ease: 'cubic-bezier(.2,.7,.2,1)' });
      });
    });
  }, { threshold: 0.4 }) : null;
  function initOdometers(root = document) {
    $$('[data-odometer]', root).forEach((el) => {
      if (el._reel) return;
      const target = fmt.num(+el.dataset.odometer);
      if (!odoIO || !motionOK()) { reel(el, { value: target }); return; }
      reel(el, { value: target.replace(/\d/g, '0') });
      odoIO.observe(el);
    });
  }

  /* ==================================================================
   * 13. 彩帶（canvas；分頁隱藏時 rAF 自然暫停，dt 有上限避免回來時瞬移）
   * ================================================================== */
  const CONFETTI_COLORS = ['#2D7FF9', '#FCB400', '#F82B60', '#20C933', '#18BFFF', '#8B46FF', '#FF6F2C', '#20D9D2'];
  function confetti({ from = null, x, y, count = 150, spread = 70, power = 1, mode = 'burst' } = {}) {
    if (!motionOK()) return;
    const host = topDialog() || document.body;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    let ox = x ?? W / 2, oy = y ?? H * 0.4;
    if (from) { const r = from.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; }
    const parts = [];
    const add = (px, py, angle, n) => {
      for (let i = 0; i < n; i++) {
        const a = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
        const v = (520 + Math.random() * 640) * power;
        parts.push({
          x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12,
          tilt: Math.random() * Math.PI * 2, vt: 6 + Math.random() * 8, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          ribbon: Math.random() < 0.25,
        });
      }
    };
    if (mode === 'cannons') { add(0, H, -62, Math.round(count / 2)); add(W, H, -118, Math.round(count / 2)); }
    else add(ox, oy, -90, count);
    let last = performance.now();
    const t0 = last;
    const step = (t) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        p.vy += 1500 * dt;
        p.vx *= 1 - 1.6 * dt;
        p.vy *= 1 - 1.1 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.tilt += p.vt * dt;
        if (p.y > H + 40) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        if (p.ribbon) { ctx.fillRect(-p.w, -1.2, p.w * 2.2, 2.4); }
        else { ctx.beginPath(); ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 1.5); ctx.fill(); }
        ctx.restore();
      }
      if (alive && t - t0 < 5500) requestAnimationFrame(step);
      else cv.remove();
    };
    requestAnimationFrame(step);
  }

  /* ==================================================================
   * 14. 動態工具：FLIP、高度展開、黏性表頭、進場、無限動畫暫停
   * ================================================================== */
  function flip(nodes, mutate, { duration = 320, easing = 'cubic-bezier(.2,.8,.2,1)' } = {}) {
    const els = Array.from(nodes);
    const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
    mutate();
    if (!motionOK()) return;
    els.forEach((el) => {
      if (!el.isConnected) return;
      const a = first.get(el);
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing });
    });
  }

  function toggleHeight(el, open, { duration = 260 } = {}) {
    if (!motionOK()) { el.hidden = !open; return Promise.resolve(); }
    el.getAnimations().forEach((a) => a.cancel());
    if (open) el.hidden = false;
    const h = el.scrollHeight;
    const kf = open ? [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }] : [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }];
    el.style.overflow = 'hidden';
    const anim = el.animate(kf, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return anim.finished.then(() => {
      el.style.overflow = '';
      if (!open) el.hidden = true;
    }, () => { el.style.overflow = ''; });
  }

  // 表格放在 overflow-x 容器內時 position: sticky 只對容器有效；
  // 這裡改用 transform 讓表頭跟著文件捲動停在 --sticky-top 下方，同時保留水平捲動與凍結首欄。
  function stickyHead(wrap) {
    const table = wrap.querySelector('table');
    const head = table.tHead;
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = parseFloat(getComputedStyle(wrap).getPropertyValue('--sticky-top')) || 0;
      const r = wrap.getBoundingClientRect();
      const foot = table.tFoot ? table.tFoot.offsetHeight : 0;
      const y = clamp(top - r.top, 0, Math.max(0, r.height - head.offsetHeight - foot - 34));
      table.style.setProperty('--dg-head-y', y + 'px');
      wrap.classList.toggle('is-stuck', y > 0);
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    wrap.addEventListener('scroll', () => wrap.classList.toggle('is-scrolled', wrap.scrollLeft > 2), { passive: true });
    update();
    return { update };
  }

  let revealIO = null;
  function reveal(root = document) {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (!('IntersectionObserver' in window) || !motionOK()) { els.forEach((el) => el.classList.add('is-in')); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    }
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
      else revealIO.observe(el);
    });
  }
  // 保底：不論 IntersectionObserver 是否觸發，載入 3.5 秒後所有進場元素都會顯示
  setTimeout(() => $$('[data-reveal]:not(.is-in)').forEach((el) => el.classList.add('is-in')), 3500);

  const loopIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('is-paused', !e.isIntersecting))) : null;
  const initLoops = (root = document) => $$('[data-loop]', root).forEach((el) => loopIO?.observe(el));

  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon); });
    $$('[data-field-icon]', root).forEach((el) => { if (!el.firstElementChild) el.outerHTML = fieldIcon(el.dataset.fieldIcon, el.className); });
  }
  function hydrateAll(root = document) {
    hydrateIcons(root);
    reveal(root);
    initOdometers(root);
    initLoops(root);
    renderStats(root);
  }

  /* ==================================================================
   * 15. [data-stat] 即時統計、時鐘、倒數
   * ================================================================== */
  function renderStats(root = document) {
    const els = $$('[data-stat]', root);
    if (!els.length) return;
    const s = stats();
    els.forEach((el) => {
      const v = statValue(el.dataset.stat, s);
      if (el.hasAttribute('data-odometer')) {
        if (+el.dataset.odometer !== v) odometer(el, v);
      } else {
        el.textContent = el.dataset.statFormat === 'pct' ? fmt.pct(v) : el.dataset.statFormat === 'x' ? v.toFixed(1) + '×' : fmt.num(v);
      }
    });
  }

  // data-countdown-part="d|h|m|s" 時只顯示該段兩位數（各段分開排版、底下放單位字）
  function countdownText(target, part) {
    const diff = Math.max(0, toMs(target) - now());
    const v = { d: Math.floor(diff / DAY), h: Math.floor(diff / 3600e3) % 24, m: Math.floor(diff / 60e3) % 60, s: Math.floor(diff / 1000) % 60 };
    return part ? pad(v[part]) : `${pad(v.d)}:${pad(v.h)}:${pad(v.m)}:${pad(v.s)}`;
  }
  function initClocks() {
    const countdowns = $$('[data-countdown-to]');
    const text = (el) => countdownText(el.dataset.countdownTo, el.dataset.countdownPart);
    countdowns.forEach((el) => reel(el, { value: text(el) }));
    const tick = () => {
      if (document.hidden) return;
      countdowns.forEach((el) => el._reel.roll(text(el), { duration: 420, stagger: 30, ease: 'cubic-bezier(.3,1.25,.5,1)' }));
      $$('[data-clock]').forEach((el) => { el.textContent = fmt.time(now()); });
      $$('[data-rel-time]').forEach((el) => { el.textContent = fmt.rel(+el.dataset.relTime); });
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ==================================================================
   * 16. CSV / 剪貼簿
   * ================================================================== */
  function csv(filename, rows) {
    const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    // 舊瀏覽器或非安全環境：用隱藏 textarea + execCommand 退回
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  /* ==================================================================
   * 17. 外殼：導覽、行動版選單、說明、通知、快捷鍵
   * ================================================================== */
  function initNav() {
    const file = decodeURIComponent(location.pathname.split('/').pop() || 'index.html') || 'index.html';
    let currentLabel = '';
    $$('.tablebar__tab, .site-footer__nav a').forEach((a) => {
      const on = a.getAttribute('href').split('?')[0] === file;
      a.classList.toggle('is-active', on);
      if (on) { a.setAttribute('aria-current', 'page'); if (a.classList.contains('tablebar__tab')) currentLabel = a.dataset.label || a.textContent.trim(); }
      else a.removeAttribute('aria-current');
    });
    $$('[data-nav-current]').forEach((el) => { if (currentLabel) el.textContent = currentLabel; });

    const toggle = $('[data-nav-toggle]');
    if (!toggle) return;
    const nav = document.getElementById(toggle.getAttribute('aria-controls'));
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) $('.tablebar__tab', nav)?.focus({ preventScroll: true });
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    document.addEventListener('pointerdown', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
    navApi.close = () => { if (nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); return true; } return false; };
  }
  const navApi = { close: () => false };

  function openHelp(from) {
    const steps = TIMELINE.map((t) => `<li class="help-step help-step--${t.state}"><span class="help-step__dot"></span><span><b>${esc(t.label)}</b><small>${fmt.date(t.start)}${t.end !== t.start ? '–' + fmt.date(t.end) : ''}</small></span></li>`).join('');
    const keys = [['↑ ↓ ← →', '在資料格中移動儲存格'], ['Enter', '編輯儲存格／開啟選單'], ['Space', '展開目前列的完整紀錄'], ['/', '聚焦搜尋'], ['Esc', '取消編輯、關閉選單或對話框']];
    modal({
      title: '系統說明', eyebrow: icon('help') + '港埕青年社宅 · 2026 第 2 期', size: 'md', from,
      body: `<div class="help">
        <section><h3 class="help__h">申請流程</h3><ol class="help-steps">${steps}</ol></section>
        <section><h3 class="help__h">鍵盤操作</h3><dl class="help-keys">${keys.map(([k, d]) => `<div><dt>${k.split(' ').map((x) => `<kbd class="kbd">${esc(x)}</kbd>`).join('')}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl></section>
        <section><h3 class="help__h">資料來源與更新</h3><ul class="help-src">${CHECK_ORDER.map((k) => `<li>${fieldIcon('lookup')}<span><b>${esc(CHECKS[k].long)}</b>${esc(CHECKS[k].source)} · ${fmt.dateTime(CHECKS[k].syncedAt)} 介接</span></li>`).join('')}</ul></section>
      </div>`,
      actions: [{ label: '知道了', variant: 'primary', autofocus: true }],
    });
  }
  function openNotifications(anchor) {
    const dot = $('.appbar__dot', anchor);
    menu(anchor, {
      title: `通知 · ${NOTIFICATIONS.length} 則`, align: 'end', width: 340,
      items: NOTIFICATIONS.map((n) => ({ label: n.title, desc: `${n.text} · ${fmt.rel(n.at)}`, icon: n.icon, href: n.href, value: n })),
      onSelect: (n) => { if (!n.href) toast('已標示為已讀', { tone: 'success', desc: n.title }); },
    });
    if (dot) dot.remove();
    anchor.setAttribute('aria-label', '通知');
  }

  function initActions() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'help') openHelp(btn);
      else if (btn.dataset.action === 'notify') openNotifications(btn);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (activeMenu) { e.preventDefault(); closeMenu(true); return; }
        const top = openDialogs[openDialogs.length - 1];
        if (top) { e.preventDefault(); top.close(); return; }
        navApi.close();
        return;
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        const s = $('[data-search]');
        if (s) { e.preventDefault(); s.focus(); s.select?.(); }
      }
    });
  }

  /* ==================================================================
   * 18. 匯出
   * ================================================================== */
  const param = (name) => new URLSearchParams(location.search).get(name);
  const applicantUrl = (id) => 'applicant.html?id=' + encodeURIComponent(id);

  const App = {
    DATA: {
      project: PROJECT, buildings: BUILDINGS, units: UNITS_LIST, timeline: TIMELINE,
      applicants: APPLICANTS, all: ALL, staff: STAFF, rules: RULES, lottery: LOTTERY, notifications: NOTIFICATIONS,
    },
    ME, DEFAULT_APPLICANT: 'GC26-1406',
    GROUPS, GROUP_ORDER, STATUS, STATUS_ORDER, UNITS, UNIT_ORDER, SUBTYPES, CHECKS, CHECK_ORDER, CHECK_RESULT,
    DOCS, DOC_STATE, DISTRICTS, DISTRICT_COLOR, BUILDING_PREF, FIELDS, FIELD_TYPE_LABEL,
    getApplicant, checksOf, scoreOf, stats, statValue, activity, setStatus, setField, setDoc, addNote, on,
    applicantUrl, param, maskName, incomeLimit,
    lottery, sha256, prng, shuffle,
    now, time, fmt,
    esc, icon, fieldIcon, pill, statusPill, groupPill, unitPill, subPill, districtPill, buildingPill,
    checkIcon, checkPill, avatar, person, attachments, floorplan, emptyState,
    toast, modal, confirm: confirmDialog, menu, closeMenu, tabs, seg,
    reel, odometer, confetti, flip, toggleHeight, stickyHead,
    reveal, hydrate: hydrateAll, csv, copy,
    motionOK,
  };
  window.App = App;

  /* ---------- 初始化（defer 腳本執行時 DOM 已解析完成） ---------- */
  document.documentElement.classList.add('js');
  document.body.appendChild(toastBox);
  initNav();
  initActions();
  hydrateAll(document);
  initClocks();
  on(() => renderStats(document));
})();
