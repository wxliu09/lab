/*
 * 環境教育人員推廣運用管理系統（管理後台 MIS）— 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒、圖示 sprite 已注入。
 * <head> 另有一段內聯腳本（從 index.html 原樣複製）：加 .js，並在繪製前依 localStorage 套用 .is-senior。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 時間：App.NOW = 2026-10-28 10:30（民國 115 年 10 月 28 日，星期三）；App.TODAY = '2026-10-28'
 *       App.WEEK = {start:'2026-10-26', end:'2026-11-01'}（本週一～日）；App.LAUNCH = '2026-03-02'（系統上線）
 * 字典
 *   App.COUNTIES   22 縣市 {id, name, short, col, row, lat, lng, region, island, pop(萬人，示意約略值)}；App.county(id)
 *   App.REGIONS    ['北部','中部','南部','東部','離島']
 *   App.TOPICS     8 主題 {id, name, short, icon}；App.topic(id)
 *   App.AUDIENCES  8 服務對象 {id, name}；App.audience(id)
 *   App.LIFE       淨零綠生活 7 主題 {id, char, name, icon}；App.life(id)
 *   App.MODES      {onsite:'實體', online:'線上'}
 *   App.STAGES     案件 9 關卡 {key, label, icon, tone, sla(天，null=無時限), slaText, desc}；App.stage(key)、App.stageIndex(key)
 *   App.EXITS      非進行中狀態 {cancelled:'已取消', rejected:'退件', withdrawn:'撤回'}
 *   App.FEE        講座鐘點費（示意費率，可於系統設定調整）{note, minutes, rates[{key,label,rate}], travel[{max,label,amount}], island, travelNote}
 *   App.STAFF      承辦與行政人員 {id, name, role, area, color}；App.staff(id)；App.ME = 'S01'（周文琪，登入者）
 * 資料（只在記憶體中變動；人名、案號、數字全站一致）
 *   App.LECTURERS  54 位講師（42 位與民眾網相同＋12 位新進／待審／停用）；App.lecturer(id)。欄位見「講師」區塊註解
 *   App.CASES      491 件 115 年度申請案（486 件有效＋5 件撤回）；App.case(id)。欄位見「申請案件」區塊註解
 *   App.BATCHES    核銷批次 [{id, month, title, status, cases[], total, date}]
 *   App.SURVEY     滿意度問卷 {questions[], results{qid: …}, comments[], keywords[]}
 *   App.DEFAULT_CASE  application.html 沒帶 ?id 時預設開啟的案件
 * 查詢與計算（全部即時從資料算出，改資料後重算就會同步）
 *   App.kpis() → {applications, applicationsMonth, withdrawn, matchRate, inProgressMatch, avgMatchDays, delivered, deliveredMonth,
 *                 deliveredPrevMonth, onlineShare, participants, perSession, satisfaction, responses}
 *   App.stageStats() → [{...stage, count, avgDays, late, cases[]}]（各關卡現況；late＝超過 sla）；App.bottleneck(stats) → stage key
 *   App.exitStats() → {cancelled, rejected, withdrawn}
 *   App.todo({mine}) → {review[], matching[], noReply[], reportLate[], claim[]}（每項 {c, reason, due, urgent}）
 *   App.daySessions(iso) / App.weekSessions(startIso) → 該日／該週場次（含異常）
 *   App.sessionState(c) → {key:'done'|'live'|'today'|'upcoming'|'leave'|'resched'|'cancelled', label, tone}
 *   App.dataIssues() → {missing:[{l, fields}], expiring:[{l, days}]}；App.completeness(l) → 0~1；App.REQUIRED_FIELDS
 *   App.byCounty(metric:'sessions'|'people'|'per10k', filter) → {countyId: value}
 *   App.monthly(metric:'apps'|'sessions'|'people'|'satisfaction'|'matchDays', filter) → [{ym, label, value}]（3～10 月）
 *   App.filterCases({stage, status, county, audience, topic, from, to, owner, q}) → cases
 *   App.load30(lecturerId, refIso) → 前後 30 日場次數；App.isFree(lecturerId, iso) → {ok, reason}
 *   App.matchFunnel(c, criteria) → {pool, steps[{key,label,note,ids}], ranked[{l, score, reasons[], warns[]}]}（規則式條件篩選）
 *     criteria 預設 App.MATCH_DEFAULT = {region:'serve', topic:true, audience:true, slot:true, loadMax:6, minRating:4.5}
 *   App.inviteDue(inv) → ISO 時間（發出後 48 小時）；App.hoursLeft(isoDateTime) → 距 App.NOW 的小時數
 *   App.distanceKm(from,to) · App.travelTier(from,to) · App.feeEstimate({rateKey, sessions, from, to, mode}) · App.feeFor(c, hours)
 *   App.claimChecks(c) → [{key, label, detail, result:'pass'|'warn'|'fail'}]；App.claimVerdict(c) → 'pass'|'warn'|'fail'
 *   App.caseLog(c) → 處理紀錄 [{iso, time, title, by, note, tone}]（新到舊）
 *   App.notifications() → 頂列通知清單；App.state.read（已讀 id Set）
 *   App.emit(reason) 資料改變後呼叫：重繪所有 [data-count] 並在 document 發出 'app:data'；App.on(fn) 訂閱
 *   App.registerCount(name, fn) 新增 [data-count="name"] 的計算（內建：navReview navMatch navToday navClaims navLecturer
 *     notif todoAll todoMine review matching noReply reportLate claim today unassigned）
 * 格式
 *   App.fmt.num / money（2,000 元）/ roc（115/10/28）/ rocLong（115 年 10 月 28 日（三））/ rocShort（10/28（三））/ rocYM / md / dow
 *     / rel（3 天前）/ pct(v, d) / dt('2026-10-27T09:40' → 115/10/27 09:40) / hours(h → 「1 天 6 小時」)
 *   App.toDate(iso) · App.iso(date) · App.addDays(iso, n) · App.daysBetween(a, b)（b − a）· App.esc(str) · App.param(name) · App.$ · App.$$ · App.rng(seed)
 * 標記產生器（回傳 HTML 字串）
 *   App.icon(name, cls) · App.avatar(person, size) · App.stageBadge(c) · App.statusBadge(tone, text) · App.topicTag(id) · App.audienceTag(id)
 *   App.caseLink(c) · App.lecturerLink(l) · App.score(v) · App.sparkline(values, {tone, w, h}) · App.emptyState({title, text, action})
 *   App.timeline(entries) · App.checkRows(checks)
 * 互動
 *   App.toast(title, {desc, tone:'ok'|'info'|'warn'|'err', action:{label, onClick}, duration})
 *   App.openDialog(dialogEl) · App.closeDialog(dialogEl)（.modal 與 .drawer 都適用；toast 會自動移進開啟中的 dialog）
 *   App.modal({title, lead, body, icon, tone:'clay'|'err'|'sky', size:'sm'|'lg', actions:[{label, variant, onClick(close, dialog), keepOpen}]}) → {el, close}
 *   App.popover(buttonEl, panelEl, {onOpen, onClose}) → {open, close, toggle}（外點、Escape 關閉）
 *   App.tabs(tablistEl, {onChange(index, tab)}) → {select(i)} · App.seg(segEl, {onChange(value, btn)}) → {value(), set(v)}
 *   App.pager(host, {total, page, size, onChange(page)}) → {set(page, total)}
 *   App.bindSort(tableEl, {onSort(key, dir)})：th[data-sort="key"] 自動包 button.th-sort 並維護 aria-sort
 *   App.validate(formEl) → boolean（HTML 驗證屬性＋data-error 訊息，標 .is-invalid、聚焦第一個錯誤、填 .form-alert）
 *   App.downloadCSV(filename, rows[][])（UTF-8 BOM，Excel 可直接開）
 *   App.reveal(root) · App.whenVisible(el, fn) · App.loop(el, tick(dt)) → {start(), stop()}（離開視窗或分頁隱藏時自動暫停）
 *   App.countUp(el, to, {decimals}) · App.odometer(el, value, {decimals})（連續呼叫只套最後一次，不會重疊或 crash）
 *   App.reducedMotion() · App.calm()（減少動態或高齡模式時為 true：招牌動畫改靜態）
 *   任何元素加 data-toast="訊息"（可加 data-toast-desc、data-toast-tone）點擊即出 toast，用於沒有實際目的地的動作
 * 高齡友善模式
 *   App.senior.on() · App.senior.set(bool) · App.senior.toggle()；App.onMode(fn(isSenior))
 *   頂列 button[data-senior-toggle] 由 app.js 綁定；設定存在 localStorage 'envedu.mis.senior'
 *   表格：th、td 加 .col-2nd 的欄位在高齡模式收進「詳細」可展開列（app.js 自動處理，含重繪 tbody 後）
 * 招牌動態引擎
 *   App.pipeline(host, {stages, bottleneck, selected, metric:'days'|'sla', onSelect(key)}) → {select(key), setMetric(m), update(stages, bottleneck)}
 *   App.funnel(host, {pool:[ids], steps:[{label, note, ids}], nameOf(id)}) → {play(steps)}（條件逐條套用、候選點收斂；calm 時直接顯示結果）
 *   App.tileMap(host, {values, mode:'static'|'select', multi, selected, onChange(ids, id), unit, format, showValue, theme:'forest'|'clay',
 *     compact, label}) → {el, setValues(v), select(ids), getSelected()}
 *   App.barChart(host, {data:[{label, value, note}], unit, highlight, height, title, format, tone})
 *   App.lineChart(host, {labels, series:[{name, values, tone:'forest'|'clay'}], min, max, unit, title, decimals})
 *   App.hbars(host, {data:[{label, value, hl}], unit, max, format}) · App.donut(host, {data:[{label, value, color}], center, sub, title})
 *     圖表依容器寬度繪製，寬度或模式改變時重繪；文字跟 --fs-xs（一般 13px／高齡 16px）
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
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  App.ease = { out: easeOut };

  // 固定種子的亂數：每一頁產生的衍生資料都一樣（與民眾網同一套演算法）
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
  App.WEEK = { start: '2026-10-26', end: '2026-11-01' };
  App.LAUNCH = '2026-03-02';
  const DOW = '日一二三四五六';
  App.toDate = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  App.iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  App.addDays = (iso, n) => { const d = App.toDate(iso); d.setDate(d.getDate() + n); return App.iso(d); };
  App.daysBetween = (a, b) => Math.round((App.toDate(b) - App.toDate(a)) / 864e5);
  const toDT = s => { const [d, t = '00:00'] = s.split('T'); const [h, mi] = t.split(':').map(Number); const x = App.toDate(d); x.setHours(h, mi); return x; };
  const dtStr = d => `${App.iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  App.hoursLeft = dt => (toDT(dt) - App.NOW) / 36e5;
  // 順位邀請：每位講師 48 小時內回覆，逾時自動轉下一順位
  App.inviteDue = inv => { const d = toDT(inv.sent); d.setHours(d.getHours() + 48); return dtStr(d); };
  App.fmt = {
    num: (n, decimals = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    money: n => `${Number(n).toLocaleString('en-US')} 元`,
    roc: iso => { const d = App.toDate(iso); return `${d.getFullYear() - 1911}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; },
    rocLong: iso => { const d = App.toDate(iso); return `${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（${DOW[d.getDay()]}）`; },
    rocShort: iso => { const d = App.toDate(iso); return `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`; },
    rocYM: ym => { const [y, m] = ym.split('-').map(Number); return `${y - 1911} 年 ${m} 月`; },
    md: iso => { const d = App.toDate(iso); return `${d.getMonth() + 1}/${d.getDate()}`; },
    dow: iso => DOW[App.toDate(iso).getDay()],
    rel: iso => {
      const diff = App.daysBetween(App.TODAY, iso);
      if (diff === 0) return '今天';
      if (diff === 1) return '明天';
      if (diff === -1) return '昨天';
      return diff > 0 ? `${diff} 天後` : `${-diff} 天前`;
    },
    pct: (v, decimals = 0) => `${(v * 100).toFixed(decimals)}%`,
    dt: s => `${App.fmt.roc(s)} ${s.slice(11, 16)}`,
    hours: h => {
      const a = Math.max(0, Math.round(h));
      return a >= 24 ? `${Math.floor(a / 24)} 天 ${a % 24} 小時` : `${a} 小時`;
    },
  };

  /* ===================================================================
     字典
     =================================================================== */
  // 方塊地圖座標：6 欄 × 8 列，依地理大致排列（東北在右上、離島在左欄）；pop 為人口（萬人，示意約略值）
  App.COUNTIES = [
    { id: 'LIE', name: '連江縣', short: '連江', col: 1, row: 1, lat: 26.16, lng: 119.95, region: '離島', island: true, pop: 1.4 },
    { id: 'TPE', name: '臺北市', short: '臺北', col: 5, row: 1, lat: 25.04, lng: 121.56, region: '北部', pop: 249.0 },
    { id: 'KEE', name: '基隆市', short: '基隆', col: 6, row: 1, lat: 25.13, lng: 121.74, region: '北部', pop: 36.4 },
    { id: 'TAO', name: '桃園市', short: '桃園', col: 4, row: 2, lat: 24.99, lng: 121.30, region: '北部', pop: 232.9 },
    { id: 'NTP', name: '新北市', short: '新北', col: 5, row: 2, lat: 25.01, lng: 121.46, region: '北部', pop: 404.8 },
    { id: 'KIN', name: '金門縣', short: '金門', col: 1, row: 3, lat: 24.43, lng: 118.32, region: '離島', island: true, pop: 14.3 },
    { id: 'HSC', name: '新竹市', short: '竹市', col: 3, row: 3, lat: 24.80, lng: 120.97, region: '北部', pop: 45.4 },
    { id: 'HSQ', name: '新竹縣', short: '竹縣', col: 4, row: 3, lat: 24.83, lng: 121.01, region: '北部', pop: 59.3 },
    { id: 'ILA', name: '宜蘭縣', short: '宜蘭', col: 5, row: 3, lat: 24.75, lng: 121.75, region: '東部', pop: 45.1 },
    { id: 'MIA', name: '苗栗縣', short: '苗栗', col: 3, row: 4, lat: 24.56, lng: 120.82, region: '中部', pop: 53.3 },
    { id: 'TXG', name: '臺中市', short: '臺中', col: 4, row: 4, lat: 24.15, lng: 120.67, region: '中部', pop: 286.0 },
    { id: 'HUA', name: '花蓮縣', short: '花蓮', col: 5, row: 4, lat: 23.99, lng: 121.60, region: '東部', pop: 31.9 },
    { id: 'CHA', name: '彰化縣', short: '彰化', col: 3, row: 5, lat: 24.08, lng: 120.54, region: '中部', pop: 123.8 },
    { id: 'NAN', name: '南投縣', short: '南投', col: 4, row: 5, lat: 23.91, lng: 120.68, region: '中部', pop: 47.9 },
    { id: 'PEN', name: '澎湖縣', short: '澎湖', col: 1, row: 6, lat: 23.57, lng: 119.58, region: '離島', island: true, pop: 10.8 },
    { id: 'YUN', name: '雲林縣', short: '雲林', col: 2, row: 6, lat: 23.71, lng: 120.54, region: '中部', pop: 66.3 },
    { id: 'CYI', name: '嘉義市', short: '嘉市', col: 3, row: 6, lat: 23.48, lng: 120.45, region: '南部', pop: 26.3 },
    { id: 'CYQ', name: '嘉義縣', short: '嘉縣', col: 4, row: 6, lat: 23.46, lng: 120.33, region: '南部', pop: 48.4 },
    { id: 'TTT', name: '臺東縣', short: '臺東', col: 5, row: 6, lat: 22.76, lng: 121.14, region: '東部', pop: 21.3 },
    { id: 'TNN', name: '臺南市', short: '臺南', col: 3, row: 7, lat: 22.99, lng: 120.21, region: '南部', pop: 185.8 },
    { id: 'KHH', name: '高雄市', short: '高雄', col: 4, row: 7, lat: 22.63, lng: 120.30, region: '南部', pop: 273.6 },
    { id: 'PIF', name: '屏東縣', short: '屏東', col: 4, row: 8, lat: 22.67, lng: 120.49, region: '南部', pop: 79.3 },
  ];
  const countyMap = Object.fromEntries(App.COUNTIES.map(c => [c.id, c]));
  App.county = id => countyMap[id];
  App.REGIONS = ['北部', '中部', '南部', '東部', '離島'];

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
    { id: 'food', char: '食', name: '食', icon: 'l-food' },
    { id: 'cloth', char: '衣', name: '衣', icon: 'l-cloth' },
    { id: 'home', char: '住', name: '住', icon: 'l-home' },
    { id: 'move', char: '行', name: '行', icon: 'l-move' },
    { id: 'edu', char: '育', name: '育', icon: 'l-edu' },
    { id: 'play', char: '樂', name: '樂', icon: 'l-play' },
    { id: 'shop', char: '購', name: '購', icon: 'l-shop' },
  ];
  const lifeMap = Object.fromEntries(App.LIFE.map(l => [l.id, l]));
  App.life = id => lifeMap[id];

  App.MODES = { onsite: '實體', online: '線上' };

  App.STAGES = [
    { key: 'submitted', label: '申請', icon: 'inbox', tone: 'neutral', sla: 2, slaText: '2 日內受理', desc: '申請單位送出申請，等待承辦受理。' },
    { key: 'review', label: '初審', icon: 'clipboard', tone: 'info', sla: 3, slaText: '3 日內完成初審', desc: '檢核申請資格、附件與活動資訊，必要時退件補正。' },
    { key: 'matching', label: '媒合', icon: 'sliders', tone: 'info', sla: 5, slaText: '5 日內產出推薦名單', desc: '依服務區域、專長、對象經驗、檔期等條件篩選講師並排定順位。' },
    { key: 'confirm', label: '講師確認', icon: 'user-check', tone: 'clay', sla: 3, slaText: '邀請後 3 日內確認', desc: '順位邀請進行中：每位講師 48 小時未回覆即自動轉下一順位。' },
    { key: 'scheduled', label: '待執行', icon: 'calendar', tone: 'forest', sla: null, slaText: '活動前 7 日寄行前通知', desc: '講師已確認，等待活動日；活動前 7 日寄送行前通知。' },
    { key: 'done', label: '已執行', icon: 'presentation', tone: 'sprout', sla: 30, slaText: '授課後 30 日內回填成果', desc: '活動已辦理，等待講師回填成果與費用申請。' },
    { key: 'report', label: '成果回填', icon: 'file', tone: 'info', sla: 7, slaText: '回填後 7 日內完成勾稽', desc: '講師已回填成果與費用申請，等待承辦逐項勾稽。' },
    { key: 'claim', label: '核銷', icon: 'coin', tone: 'clay', sla: null, slaText: '月結批次，次月 12 日撥付', desc: '勾稽通過，已編入當月核銷批次，等待會計覆核與撥付。' },
    { key: 'closed', label: '結案', icon: 'check', tone: 'ok', sla: null, slaText: '—', desc: '費用撥付完成，案件結案。' },
  ];
  const stageMap = Object.fromEntries(App.STAGES.map(s => [s.key, s]));
  App.stage = key => stageMap[key];
  App.stageIndex = key => App.STAGES.findIndex(s => s.key === key);
  App.EXITS = { cancelled: '已取消', rejected: '退件', withdrawn: '撤回' };
  const EXEC = new Set(['done', 'report', 'claim', 'closed']);
  App.isExecuted = c => c.status === 'active' && EXEC.has(c.stage);

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

  App.STAFF = [
    { id: 'S01', name: '周文琪', role: '計畫承辦', area: '北區', regions: ['北部'], color: '#9A5223' },
    { id: 'S02', name: '蔡宗翰', role: '計畫承辦', area: '中區', regions: ['中部'], color: '#2A6D88' },
    { id: 'S03', name: '李佳穎', role: '計畫承辦', area: '南區', regions: ['南部'], color: '#4F6B2C' },
    { id: 'S04', name: '陳美惠', role: '行政專員', area: '東區與離島', regions: ['東部', '離島'], color: '#35617A' },
    { id: 'S05', name: '黃國棟', role: '會計', area: '核銷覆核', regions: [], color: '#184B3C' },
    { id: 'S06', name: '林雅雯', role: '計畫督導', area: '全區', regions: [], color: '#1F5D4A' },
  ];
  const staffMap = Object.fromEntries(App.STAFF.map(s => [s.id, s]));
  App.staff = id => staffMap[id];
  App.ME = 'S01';
  const ownerOf = countyId => (App.STAFF.find(s => s.regions.includes(App.county(countyId).region)) || App.STAFF[0]).id;

  /* ===================================================================
     講師
     欄位（與民眾網相同）：id, name, gender, title, org, county(戶籍縣市), serve[可到場縣市], topics[], audiences[],
       modes['onsite','online'], months[可授課月份], cert{way, field, no, until}, rateKey, sessions(115 年度已授課場次),
       rating(平均滿意度 /5，新進講師為 null), life[七大主題], since(開始授課年), bio
     衍生（與民眾網同演算法）：color, weekdays[], modules[{title, topic, sessions, audiences}], trend[112–115], footprint{countyId: 場次, online}
     後台欄位：status('active' 啟用｜'review' 待審核｜'inactive' 停用), statusNote, phone, email, bank(帳戶資料), photo,
       missing[缺漏欄位], joined(加入系統日), updated(最後異動日), changes[{iso, by, field, from, to}]（異動紀錄）
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
    // ↓ 後台才有：115 年新加入、待審核或停用的講師（不在民眾網名錄）
    ['L043', '鍾佩君', 'F', '社區營養師', '竹塹樂食協會', 'HSC', ['HSC', 'HSQ', 'MIA'], ['food', 'health', 'netzero'], ['elem', 'community', 'agency'], 'both', ALL, ['經歷', '社區參與', '110-0412', '2026-12-15'], 'external', 0, null, ['food', 'home'], 2019,
      '以營養師的角度談綠色飲食與蔬食減碳，擅長設計長者也能操作的低碳餐盤活動。'],
    ['L044', '邱建銘', 'M', '國中自然科教師', '嘉南平原教師共學社', 'CYQ', ['CYQ', 'CYI', 'TNN'], ['climate', 'energy', 'netzero'], ['junior', 'senior'], 'both', SCHOOLYEAR, ['學歷', '學校環境教育', '111-0187', '2027-01-20'], 'external', 0, null, ['home', 'edu'], 2021,
      '以校園能源數據與氣象觀測帶學生做專題，熟悉國中自然領域的跨科教學。'],
    ['L045', '詹淑惠', 'F', '退休護理師', '后里樂齡健康站', 'TXG', ['TXG', 'MIA'], ['health', 'food'], ['community', 'agency'], 'onsite', ALL, ['經歷', '社區參與', '112-0046', '2032-04-30'], 'internal', 0, null, ['food', 'home'], 2022,
      '長年在社區據點帶長輩做健康促進，課程結合高溫防護與在地飲食。'],
    ['L046', '游志豪', 'M', '生態攝影師', '雪霸山林影像工作室', 'MIA', ['MIA', 'HSQ', 'TXG'], ['biodiv', 'climate'], ['junior', 'senior', 'college'], 'both', ALL, ['專長', '自然保育', '112-0071', '2032-05-31'], 'external', 0, null, ['play', 'edu'], 2020,
      '用生態攝影記錄中海拔山林的季節變化，課程以影像帶學生認識氣候變遷對物種的影響。'],
    ['L047', '施怡伶', 'F', '減塑倡議講師', '港南零廢棄協會', 'KHH', ['KHH', 'PIF', 'TNN'], ['circular', 'netzero'], ['elem', 'junior', 'community', 'enterprise'], 'both', ALL, ['專長', '公害防治', '110-0388', '2026-11-30'], 'external', 0, null, ['shop', 'cloth'], 2018,
      '推動市場與夜市減塑，課程以學員一週的塑膠紀錄為起點，討論替代方案與社區行動。'],
    ['L048', '柯文傑', 'M', '社區防災講師', '曾文溪防災社區聯盟', 'TNN', [], ['climate', 'health'], ['community', 'agency'], 'onsite', ALL, ['專長', '災害防救', '112-0102', '2032-06-30'], 'external', 0, null, ['home'], 2020,
      '協助河川沿岸社區建立淹水應變與高溫關懷機制，課程以社區地圖推演為主。'],
    ['L049', '盧欣妤', 'F', '森林步道志工', '太平山步道協會', 'ILA', ['ILA', 'NTP'], ['biodiv', 'health'], ['elem', 'community'], 'onsite', ALL, ['經歷', '自然保育', '113-0015', '2033-01-31'], 'external', 0, null, ['play'], 2023,
      '在宜蘭山區擔任步道志工，帶領親子與長輩認識森林步道與無痕山林。'],
    ['L050', '翁國倫', 'M', '節能技師', '南投能源服務社', 'NAN', ['NAN', 'TXG', 'CHA'], ['energy', 'netzero'], ['agency', 'enterprise'], 'both', ALL, ['專長', '環境及資源管理', '113-0022', '2033-02-28'], 'expert', 0, null, ['home'], 2017,
      '協助中小企業與機關進行用電診斷，課程以設備汰換與契約容量調整為主。'],
    ['L051', '戴雅雯', 'F', '海洋教育講師', '東北角潮間帶工作室', 'NTP', ['NTP', 'KEE', 'ILA'], ['biodiv', 'circular'], ['elem', 'junior', 'community'], 'both', SCHOOLYEAR, ['學歷', '自然保育', '113-0031', '2033-03-31'], 'external', 0, null, ['play', 'shop'], 2022,
      '在東北角帶潮間帶觀察與淨灘，課程把海洋生物與海廢議題放在同一張觀察表上。'],
    ['L052', '梁振宇', 'M', '退休農業研究員', '嘉義農業循環學會', 'CYI', ['CYI', 'CYQ', 'YUN'], ['circular', 'food'], ['senior', 'agency', 'enterprise'], 'onsite', ALL, ['學歷', '環境及資源管理', '107-0255', '2027-08-31'], 'expert', 0, 4.6, ['food'], 2012,
      '退休前研究農業副產物再利用，課程說明稻草、果皮等資材的循環應用。'],
    ['L053', '顏秋萍', 'F', '退休國小教師', '屏東環境故事屋', 'PIF', ['PIF', 'KHH'], ['netzero', 'biodiv'], ['preschool', 'elem'], 'onsite', SCHOOLYEAR, ['經歷', '學校環境教育', '105-0331', '2026-09-30'], 'external', 0, 4.8, ['edu'], 2010,
      '以繪本與故事帶幼兒認識自然，常到偏鄉小校說故事。'],
    ['L054', '趙子賢', 'M', '綠建築設計師', '都會綠屋頂研究社', 'TPE', ['TPE', 'NTP'], ['energy', 'climate'], ['college', 'agency', 'enterprise'], 'both', ALL, ['專長', '環境及資源管理', '109-0402', '2029-04-30'], 'expert', 0, 4.3, ['home'], 2018,
      '專長綠屋頂與建築隔熱設計，課程以實際案例說明屋頂降溫與節能效益。'],
  ];
  // 後台狀態與資料完整度（42 位名錄講師預設啟用且資料完整）
  const LECTURER_ADMIN = {
    L029: { bank: false },
    L039: { bank: false },
    L043: { joined: '2026-09-07' },
    L044: { joined: '2026-09-14', bank: false },
    L045: { joined: '2026-09-21', photo: false, slots: false },
    L046: { joined: '2026-10-05', module: false },
    L047: { joined: '2026-08-24' },
    L048: { joined: '2026-10-12', bank: false },
    L049: { joined: '2026-10-20', status: 'review', statusNote: '115/10/20 新申請加入，待審核認證文件', photo: false },
    L050: { joined: '2026-10-23', status: 'review', statusNote: '115/10/23 新申請加入，待確認服務區域與費率類別' },
    L051: { joined: '2026-10-26', status: 'review', statusNote: '115/10/26 新申請加入，待審核', bank: false },
    L052: { joined: '2026-03-02', status: 'inactive', statusNote: '本人申請暫停邀約至 116 年 3 月' },
    L053: { joined: '2026-03-02', status: 'inactive', statusNote: '認證已於 115/09/30 到期，待換證後恢復' },
    L054: { joined: '2026-03-02', status: 'inactive', statusNote: '成果連續兩次逾期未回填，暫停邀約' },
  };
  App.REQUIRED_FIELDS = ['基本資料', '聯絡方式', '認證字號', '專長主題', '服務對象', '服務區域', '可授課時段', '課程模組簡介', '授課照片', '銀行帳戶'];

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
  const WEEKDAY_PATTERNS = [[1, 2, 3, 4, 5], [2, 3, 4], [1, 3, 5], [3, 4, 5, 6], [2, 4, 6], [1, 2, 3, 4, 5, 6]];
  const AVATAR_COLORS = ['#1F5D4A', '#2A6D88', '#9A5223', '#184B3C', '#4F6B2C', '#35617A'];
  App.TREND_YEARS = ['112', '113', '114', '115'];

  App.LECTURERS = RAW_LECTURERS.map((r, idx) => {
    const [id, name, gender, title, org, county, serve, topics, audiences, modes, months, cert, rateKey, sessions, rating, life, since, bio] = r;
    const rnd = App.rng(id);
    const l = {
      id, name, gender, title, org, county, serve, topics, audiences,
      modes: modes === 'both' ? ['onsite', 'online'] : [modes],
      months, cert: { way: cert[0], field: cert[1], no: `環教人認字第 ${cert[2]} 號`, until: cert[3] },
      rateKey, sessions, rating, life, since, bio,
    };
    // 以下衍生欄位與民眾網同一順序取亂數，確保授課足跡等資料兩邊一致
    l.color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
    l.weekdays = WEEKDAY_PATTERNS[Math.floor(rnd() * WEEKDAY_PATTERNS.length)];
    l.responses = Math.round(sessions * (24 + rnd() * 14));
    l.modules = topics.map((t, i) => ({
      title: MODULE_TITLES[t][(idx + i) % 3],
      topic: t,
      sessions: rnd() < .55 ? 2 : 3,
      audiences: audiences.filter((a, j) => (j + i) % 2 === 0 || audiences.length <= 2),
    }));
    l.trend = rating == null ? [] : [0.32, 0.2, 0.09].map(d => Math.min(5, Math.round((rating - d + (rnd() - .5) * .08) * 100) / 100)).concat(rating);
    const fp = {};
    let left = sessions;
    const online = l.modes.includes('online') ? Math.round(sessions * (.12 + rnd() * .12)) : 0;
    left -= online;
    const weights = serve.map((c, i) => (i === 0 ? 3 : 1 + rnd()));
    const wsum = sum(weights);
    serve.forEach((c, i) => { fp[c] = Math.floor(left * weights[i] / wsum); });
    let assigned = sum(Object.values(fp));
    for (let i = 0; assigned < left && serve.length; i = (i + 1) % serve.length) { fp[serve[i]]++; assigned++; }
    Object.keys(fp).forEach(k => { if (!fp[k]) delete fp[k]; });
    if (online) fp.online = online;
    l.footprint = fp;

    // 後台欄位
    const a = LECTURER_ADMIN[id] || {};
    const mr = App.rng(id + ':mis');
    l.status = a.status || 'active';
    l.statusNote = a.statusNote || '';
    l.phone = `09${String(10 + Math.floor(mr() * 89))}-${String(100 + Math.floor(mr() * 899))}-${String(100 + Math.floor(mr() * 899))}`;
    l.email = `lecturer.${id.toLowerCase()}@example.tw`;
    l.bank = a.bank !== false;
    l.photo = a.photo !== false;
    l.joined = a.joined || App.LAUNCH;
    const missing = [];
    if (!serve.length) missing.push('服務區域');
    if (a.slots === false) missing.push('可授課時段');
    if (a.module === false) missing.push('課程模組簡介');
    if (!l.photo) missing.push('授課照片');
    if (!l.bank) missing.push('銀行帳戶');
    l.missing = missing;
    const upd = ['2026-10-21', '2026-10-14', '2026-09-30', '2026-09-16', '2026-08-26', '2026-07-08', '2026-05-20'];
    l.updated = l.joined > upd[0] ? l.joined : upd[Math.floor(mr() * upd.length)];
    if (l.updated < l.joined) l.updated = l.joined;
    l.changes = [];
    if (idx % 3 === 0 && l.status === 'active') l.changes.push({ iso: l.updated, by: 'S04', field: '服務區域', from: serve.slice(0, -1).map(c => App.county(c).short).join('、') || '—', to: serve.map(c => App.county(c).short).join('、') });
    if (idx % 4 === 1) l.changes.push({ iso: App.addDays(l.updated, -41 - idx), by: '講師本人', field: '聯絡電話', from: '已更新', to: l.phone });
    if (idx < 42 && idx % 5 === 2) l.changes.push({ iso: '2026-03-02', by: '系統匯入', field: '講師資料', from: '前案名冊', to: '115 年度系統' });
    return l;
  });
  const lecturerMap = Object.fromEntries(App.LECTURERS.map(l => [l.id, l]));
  // 新增或批次匯入的講師只 push 進 App.LECTURERS，對照表查不到時退回 find
  App.lecturer = id => lecturerMap[id] || App.LECTURERS.find(l => l.id === id);
  App.activeLecturers = () => App.LECTURERS.filter(l => l.status === 'active');
  App.completeness = l => (App.REQUIRED_FIELDS.length - l.missing.length) / App.REQUIRED_FIELDS.length;
  App.certDays = l => App.daysBetween(App.TODAY, l.cert.until);

  /* ===================================================================
     距離與費用
     =================================================================== */
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
  // 依案件實際（或核定）節數計算應付金額
  App.feeFor = (c, hours = c.sessions) => {
    const l = App.lecturer(c.lecturer);
    return App.feeEstimate({ rateKey: l ? l.rateKey : 'external', sessions: Math.min(hours, c.sessions), from: l ? l.county : c.county, to: c.county, mode: c.mode });
  };

  /* ===================================================================
     申請案件
     Case 欄位：id, org, orgType, county, district, venue, contact, contactTitle, phone, email,
       topic, audience, people(申請人數), mode, date(活動日；未定為 null), time, sessions(核定節數), candidates[候選日期],
       lecturer(確認的講師 id), invites[{lecturer, rank, sent(ISO 時間), status:'pending'|'accepted'|'declined'|'expired', replied, designated}],
       stage(關卡 key), status('active'|'cancelled'|'rejected'|'withdrawn'), exitReason, exitDate,
       submitted(送件日), owner(承辦 staff id，未指派為 null), log[[stageKey, iso]], matchDays(媒合天數),
       need(補件需求), files[{name, size}], exception{type:'leave'|'resched', note, iso, newDate},
       result{people(實到), hours(實際節數), signin, photos, submitted}, claimed{lecture, travel, total}（講師申請金額）,
       batch(核銷批次 id), survey{invited, responses, avg}, reminders[iso]（承辦催覆紀錄）, note
     =================================================================== */
  const FIXED_CASES = [
    { id: 'EE115-0412', org: '山稜國民小學', orgType: '學校', county: 'TTT', district: '卑南鄉', venue: '山稜國小 視聽教室', contact: '吳承翰', contactTitle: '教務主任', phone: '089-381-412', email: 'academic@shanling-es.example.tw',
      topic: 'netzero', audience: 'elem', people: 56, mode: 'onsite', date: '2026-11-12', time: '09:30–11:10', sessions: 2, lecturer: 'L005', stage: 'scheduled',
      log: [['submitted', '2026-09-30'], ['review', '2026-10-02'], ['matching', '2026-10-05'], ['confirm', '2026-10-07'], ['scheduled', '2026-10-08']] },
    { id: 'EE115-0398', org: '青禾社區發展協會', orgType: '社區', county: 'TXG', district: '西屯區', venue: '青禾社區活動中心', contact: '劉淑惠', contactTitle: '總幹事', phone: '04-2358-1123', email: 'qinghe.community@example.tw',
      topic: 'food', audience: 'community', people: 40, mode: 'onsite', date: '2026-10-21', time: '14:00–15:40', sessions: 2, lecturer: 'L012', stage: 'done',
      log: [['submitted', '2026-09-08'], ['review', '2026-09-10'], ['matching', '2026-09-11'], ['confirm', '2026-09-14'], ['scheduled', '2026-09-15'], ['done', '2026-10-21']] },
    { id: 'EE115-0455', org: '河岸國民中學', orgType: '學校', county: 'NTP', district: '板橋區', venue: '河岸國中 大禮堂', contact: '郭建志', contactTitle: '設備組長', phone: '02-2960-3388', email: 'equip@heanjh.example.tw',
      topic: 'circular', audience: 'junior', people: 120, mode: 'onsite', date: null, time: '13:30–15:10', sessions: 2, candidates: ['2026-11-24', '2026-11-26', '2026-12-01'], lecturer: null,
      invites: [{ lecturer: 'L037', rank: 1, sent: '2026-10-27T15:20', status: 'pending' }], stage: 'matching',
      log: [['submitted', '2026-10-19'], ['review', '2026-10-21'], ['matching', '2026-10-23']] },
    { id: 'EE115-0467', org: '港都綠能科技股份有限公司', orgType: '企業', county: 'KHH', district: '鳳山區', venue: '公司 3 樓訓練教室', contact: '張瑋婷', contactTitle: '人資專員', phone: '07-746-1205', email: 'hr@gangdu-green.example.com',
      topic: 'energy', audience: 'enterprise', people: 35, mode: 'onsite', date: null, time: '10:00–11:40', sessions: 2, candidates: ['2026-12-08', '2026-12-10', '2026-12-15'], lecturer: null, stage: 'review',
      log: [['submitted', '2026-10-22'], ['review', '2026-10-26']],
      need: '請補附活動場地照片或平面圖，以及參與員工的部門分布（可用簡表）。' },
    { id: 'EE115-0301', org: '蘭陽長青學苑', orgType: '社區', county: 'ILA', district: '羅東鎮', venue: '蘭陽長青學苑 多功能教室', contact: '游美玲', contactTitle: '執行秘書', phone: '03-954-0301', email: 'lanyang.elder@example.tw',
      topic: 'health', audience: 'community', people: 60, mode: 'onsite', date: '2026-08-19', time: '09:30–11:10', sessions: 2, lecturer: 'L007', stage: 'closed',
      log: [['submitted', '2026-07-06'], ['review', '2026-07-08'], ['matching', '2026-07-09'], ['confirm', '2026-07-10'], ['scheduled', '2026-07-13'], ['done', '2026-08-19'], ['report', '2026-08-22'], ['claim', '2026-08-29'], ['closed', '2026-09-15']],
      result: { people: 63, hours: 2 } },
    { id: 'EE115-0423', org: '員林好農合作社', orgType: '團體', county: 'CHA', district: '員林市', venue: '合作社 集貨場二樓', contact: '黃志明', contactTitle: '理事主席', phone: '04-832-5560', email: 'yuanlin.coop@example.tw',
      topic: 'food', audience: 'agency', people: 30, mode: 'onsite', date: '2026-11-20', time: '14:00–15:40', sessions: 2, lecturer: null,
      invites: [{ lecturer: 'L010', rank: 1, sent: '2026-10-26T16:05', status: 'pending', designated: true }], stage: 'confirm',
      log: [['submitted', '2026-10-12'], ['review', '2026-10-14'], ['matching', '2026-10-20'], ['confirm', '2026-10-26']] },
    { id: 'EE115-0379', org: '濱海高級中學', orgType: '學校', county: 'TNN', district: '安平區', venue: '濱海高中 國際會議廳', contact: '陳柏翰', contactTitle: '學務主任', phone: '06-298-0379', email: 'student@binhai-sh.example.tw',
      topic: 'climate', audience: 'senior', people: 80, mode: 'onsite', date: '2026-10-16', time: '13:10–14:50', sessions: 2, lecturer: 'L022', stage: 'report',
      log: [['submitted', '2026-08-31'], ['review', '2026-09-02'], ['matching', '2026-09-03'], ['confirm', '2026-09-07'], ['scheduled', '2026-09-08'], ['done', '2026-10-16'], ['report', '2026-10-20']],
      result: { people: 76, hours: 2 } },
    { id: 'EE115-0476', org: '海風國民小學', orgType: '學校', county: 'PEN', district: '馬公市', venue: '線上（視訊）', contact: '許家豪', contactTitle: '自然科教師', phone: '06-927-0476', email: 'science@haifeng-es.example.tw',
      topic: 'biodiv', audience: 'elem', people: 32, mode: 'online', date: null, time: '10:20–12:00', sessions: 2, candidates: ['2026-12-02', '2026-12-04', '2026-12-09'], lecturer: null, stage: 'submitted',
      log: [['submitted', '2026-10-28']] },
    { id: 'EE115-0436', org: '稻香社區發展協會', orgType: '社區', county: 'HUA', district: '吉安鄉', venue: '稻香社區活動中心', contact: '林秀英', contactTitle: '理事長', phone: '03-852-0436', email: 'daoxiang@example.tw',
      topic: 'food', audience: 'community', people: 45, mode: 'onsite', date: '2026-11-18', time: '14:00–15:40', sessions: 2, lecturer: 'L005', stage: 'scheduled',
      log: [['submitted', '2026-10-05'], ['review', '2026-10-06'], ['matching', '2026-10-08'], ['confirm', '2026-10-12'], ['scheduled', '2026-10-13']] },
    { id: 'EE115-0449', org: '冬山河國民中學', orgType: '學校', county: 'ILA', district: '冬山鄉', venue: '線上（視訊）', contact: '簡怡如', contactTitle: '生物科教師', phone: '03-958-0449', email: 'bio@dongshan-jh.example.tw',
      topic: 'biodiv', audience: 'junior', people: 90, mode: 'online', date: '2026-12-09', time: '10:10–11:50', sessions: 2, lecturer: 'L005', stage: 'scheduled',
      log: [['submitted', '2026-10-14'], ['review', '2026-10-15'], ['matching', '2026-10-16'], ['confirm', '2026-10-19'], ['scheduled', '2026-10-20']] },
    { id: 'EE115-0388', org: '洄瀾實驗高級中學', orgType: '學校', county: 'HUA', district: '花蓮市', venue: '洄瀾實驗高中 生態教室', contact: '王立德', contactTitle: '教學組長', phone: '03-835-0388', email: 'teach@huilan-sh.example.tw',
      topic: 'biodiv', audience: 'senior', people: 70, mode: 'onsite', date: '2026-10-14', time: '13:10–14:50', sessions: 2, lecturer: 'L005', stage: 'done',
      log: [['submitted', '2026-09-01'], ['review', '2026-09-03'], ['matching', '2026-09-04'], ['confirm', '2026-09-07'], ['scheduled', '2026-09-08'], ['done', '2026-10-14']] },
    { id: 'EE115-0362', org: '縱谷社區大學', orgType: '團體', county: 'TTT', district: '臺東市', venue: '縱谷社大 第二教室', contact: '鄭雅琪', contactTitle: '課程專員', phone: '089-331-362', email: 'course@zonggu-cc.example.tw',
      topic: 'netzero', audience: 'community', people: 38, mode: 'onsite', date: '2026-09-23', time: '19:00–20:40', sessions: 2, lecturer: 'L005', stage: 'closed',
      log: [['submitted', '2026-08-10'], ['review', '2026-08-12'], ['matching', '2026-08-13'], ['confirm', '2026-08-15'], ['scheduled', '2026-08-17'], ['done', '2026-09-23'], ['report', '2026-09-25'], ['claim', '2026-10-02'], ['closed', '2026-10-16']],
      result: { people: 41, hours: 2 } },
    { id: 'EE115-0481', org: '鯉潭國民小學', orgType: '學校', county: 'HUA', district: '壽豐鄉', venue: '鯉潭國小 自然教室', contact: '高嘉玲', contactTitle: '教務主任', phone: '03-865-0481', email: 'academic@litan-es.example.tw',
      topic: 'netzero', audience: 'elem', people: 48, mode: 'onsite', date: '2026-11-18', time: '13:30–15:10', sessions: 2, lecturer: null,
      invites: [{ lecturer: 'L005', rank: 1, sent: '2026-10-27T10:15', status: 'pending', designated: true }], stage: 'confirm',
      log: [['submitted', '2026-10-16'], ['review', '2026-10-19'], ['matching', '2026-10-22'], ['confirm', '2026-10-27']] },
    { id: 'EE115-0488', org: '稻浪國民中學', orgType: '學校', county: 'TTT', district: '池上鄉', venue: '稻浪國中 圖書館', contact: '羅文傑', contactTitle: '學務主任', phone: '089-862-0488', email: 'student@daolang-jh.example.tw',
      topic: 'food', audience: 'junior', people: 85, mode: 'onsite', date: '2026-12-03', time: '09:30–11:10', sessions: 2, lecturer: null,
      invites: [{ lecturer: 'L005', rank: 1, sent: '2026-10-28T09:05', status: 'pending', designated: true }], stage: 'confirm',
      log: [['submitted', '2026-10-20'], ['review', '2026-10-22'], ['matching', '2026-10-26'], ['confirm', '2026-10-28']] },
    { id: 'EE115-0417', org: '北岸觀光漁業協會', orgType: '團體', county: 'KEE', district: '中正區', venue: '協會會議室', contact: '蔡國華', contactTitle: '總幹事', phone: '02-2462-0417', email: 'northshore@example.tw',
      topic: 'circular', audience: 'agency', people: 28, mode: 'onsite', date: '2026-11-06', time: '14:00–15:40', sessions: 2, lecturer: 'L020', stage: 'scheduled',
      log: [['submitted', '2026-10-01'], ['review', '2026-10-02'], ['matching', '2026-10-05'], ['confirm', '2026-10-07'], ['scheduled', '2026-10-08']] },
  ];

  // ---- 產生器用的字庫（單位名稱一律虛構）----
  const DISTRICTS = {
    TPE: ['中正區', '大安區', '信義區', '士林區', '北投區', '內湖區', '文山區', '萬華區'],
    NTP: ['板橋區', '三重區', '新店區', '淡水區', '三峽區', '汐止區', '中和區', '新莊區'],
    KEE: ['中正區', '仁愛區', '七堵區', '安樂區', '暖暖區'],
    TAO: ['桃園區', '中壢區', '龜山區', '大溪區', '龍潭區', '平鎮區'],
    HSC: ['東區', '北區', '香山區'],
    HSQ: ['竹北市', '竹東鎮', '湖口鄉', '新豐鄉', '關西鎮'],
    MIA: ['苗栗市', '頭份市', '竹南鎮', '苑裡鎮', '公館鄉'],
    TXG: ['西屯區', '北屯區', '豐原區', '大里區', '太平區', '沙鹿區', '霧峰區'],
    CHA: ['彰化市', '員林市', '鹿港鎮', '和美鎮', '溪湖鎮'],
    NAN: ['南投市', '埔里鎮', '草屯鎮', '竹山鎮', '魚池鄉'],
    YUN: ['斗六市', '虎尾鎮', '西螺鎮', '北港鎮', '麥寮鄉'],
    CYI: ['東區', '西區'],
    CYQ: ['太保市', '朴子市', '民雄鄉', '竹崎鄉', '布袋鎮'],
    TNN: ['安平區', '東區', '永康區', '新營區', '善化區', '麻豆區'],
    KHH: ['鳳山區', '苓雅區', '左營區', '楠梓區', '旗山區', '美濃區', '岡山區'],
    PIF: ['屏東市', '潮州鎮', '東港鎮', '恆春鎮', '內埔鄉'],
    ILA: ['宜蘭市', '羅東鎮', '冬山鄉', '礁溪鄉', '頭城鎮'],
    HUA: ['花蓮市', '吉安鄉', '壽豐鄉', '玉里鎮', '鳳林鎮'],
    TTT: ['臺東市', '卑南鄉', '池上鄉', '關山鎮', '成功鎮'],
    PEN: ['馬公市', '湖西鄉', '白沙鄉', '西嶼鄉'],
    KIN: ['金城鎮', '金湖鎮', '金沙鎮', '金寧鄉'],
    LIE: ['南竿鄉', '北竿鄉', '東引鄉'],
  };
  const AREA_CODE = { TPE: '02', NTP: '02', KEE: '02', TAO: '03', HSC: '03', HSQ: '03', ILA: '03', HUA: '03', MIA: '037', TXG: '04', CHA: '04', NAN: '049', YUN: '05', CYI: '05', CYQ: '05', TNN: '06', PEN: '06', KHH: '07', PIF: '08', TTT: '089', KIN: '082', LIE: '0836' };
  const ORG_PREFIX = ['青禾', '溪光', '霧林', '岩雀', '竹語', '星河', '雲杉', '晨露', '楓坡', '鷺洲', '苔石', '野薑', '稻穗', '海桐', '樟原', '月桃', '雁行', '栗坪', '曉山', '藍鵲',
    '芒野', '蘆荻', '檜嶺', '松蘿', '茶籽', '柚園', '薰風', '紅樹', '藻礁', '綠蔭', '蕨坡', '螢川', '鯨灣', '石楠', '竹籬', '澄溪', '青嵐', '霞岸', '槭葉', '秧田', '菱塘', '苧麻'];
  const ORG_TYPES = {
    preschool: [['幼兒園', '學校', '園長', '多功能教室'], ['非營利幼兒園', '學校', '教保組長', '律動教室']],
    elem: [['國民小學', '學校', '教務主任', '視聽教室'], ['國民小學', '學校', '學務主任', '自然教室'], ['國民小學', '學校', '自然科教師', '活動中心']],
    junior: [['國民中學', '學校', '學務主任', '大禮堂'], ['國民中學', '學校', '設備組長', '視聽教室'], ['國民中學', '學校', '生物科教師', '圖書館']],
    senior: [['高級中學', '學校', '學務主任', '國際會議廳'], ['高級工商職業學校', '學校', '實習主任', '演講廳'], ['高級中學', '學校', '教學組長', '視聽教室']],
    college: [['科技大學 通識教育中心', '學校', '專案助理', '演講廳'], ['大學 永續發展辦公室', '學校', '行政專員', '國際會議廳']],
    community: [['社區發展協會', '社區', '總幹事', '社區活動中心'], ['長青學苑', '社區', '執行秘書', '多功能教室'], ['樂齡學習中心', '社區', '專案督導', '研習教室'], ['社區照顧關懷據點', '社區', '據點組長', '據點教室']],
    agency: [['文教基金會', '團體', '執行長', '會議室'], ['環境志工隊', '團體', '隊長', '志工會館'], ['產業發展協會', '團體', '總幹事', '會議室'], ['農業產銷班', '團體', '班長', '集貨場二樓']],
    enterprise: [['科技股份有限公司', '企業', '人資專員', '3 樓訓練教室'], ['精密工業股份有限公司', '企業', '環安課長', '員工餐廳'], ['食品股份有限公司', '企業', '永續專員', '會議室'], ['物流股份有限公司', '企業', '行政經理', '訓練中心']],
  };
  const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴'.split('');
  const GIVEN = ['怡君', '志明', '雅婷', '俊傑', '淑芬', '家豪', '佳蓉', '冠宇', '美玲', '建宏', '宜庭', '承翰', '詩涵', '宗翰', '惠如', '柏宏', '欣怡', '信宏', '玉芳', '振宇', '佩珊', '文彬', '靜宜', '明哲', '秀英', '嘉玲', '世傑', '慧君', '品妤', '國華'];
  const PEOPLE_RANGE = { preschool: [18, 40], elem: [28, 110], junior: [40, 180], senior: [40, 150], college: [30, 80], community: [20, 60], agency: [18, 50], enterprise: [20, 60] };
  const START_TIMES = { school: ['09:00', '09:30', '10:10', '13:10', '13:30'], community: ['09:30', '14:00', '19:00'], work: ['10:00', '14:00', '15:00'] };
  const HOLIDAYS = new Set(['2026-04-03', '2026-04-06', '2026-06-19', '2026-09-25', '2026-10-09', '2026-10-10']);

  const timeRange = (start, sessions) => {
    const [h, m] = start.split(':').map(Number);
    const end = h * 60 + m + sessions * 50;
    return `${start}–${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
  };

  const gen = App.rng('mis-cases-115');
  const pick = arr => arr[Math.floor(gen() * arr.length)];
  const between = (a, b) => a + Math.floor(gen() * (b - a + 1));
  const wpick = (items, weights) => {
    let r = gen() * sum(weights);
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  };
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(gen() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  function makeCase(o) {
    const aud = o.audience;
    const [suffix, orgType, title, room] = pick(ORG_TYPES[aud]);
    const prefix = pick(ORG_PREFIX);
    const org = prefix + suffix;
    const short = prefix + (orgType === '學校' ? suffix.replace('國民小學', '國小').replace('國民中學', '國中').replace('高級中學', '高中').replace('高級工商職業學校', '高工').replace(/ .*/, '') : '');
    const county = o.county;
    const district = pick(DISTRICTS[county]);
    const sessions = o.sessions || wpick([1, 2, 3], [12, 74, 14]);
    const kind = orgType === '學校' ? 'school' : orgType === '社區' ? 'community' : 'work';
    const [lo, hi] = PEOPLE_RANGE[aud];
    const people = between(lo, hi);
    return Object.assign({
      date: null, org, orgType, county, district,
      venue: o.mode === 'online' ? '線上（視訊）' : `${orgType === '學校' ? short : orgType === '社區' ? prefix : '本單位'} ${room}`,
      contact: pick(SURNAMES) + pick(GIVEN), contactTitle: title,
      phone: `${AREA_CODE[county]}-${between(200, 989)}-${String(between(1000, 9999))}`,
      email: '',
      people: o.mode === 'online' ? Math.max(lo, Math.round(people * .8)) : people,
      sessions,
      time: timeRange(pick(START_TIMES[kind]), sessions),
      status: 'active',
    }, o);
  }
  const topicFor = l => wpick(l.topics, [5, 3, 2].slice(0, l.topics.length));
  const daysIn = (y, m) => new Date(y, m, 0).getDate();

  // ---- 1. 已執行場次：依每位講師的授課足跡展開，月份依年度月別場次分配 ----
  const MONTHLY_EXEC = { 3: 9, 4: 31, 5: 52, 6: 47, 7: 29, 8: 33, 9: 74 };
  const portalDelivered = sum(App.LECTURERS.slice(0, 42).map(l => l.sessions));
  MONTHLY_EXEC[10] = portalDelivered - sum(Object.values(MONTHLY_EXEC));
  const fixed = FIXED_CASES.map(c => Object.assign({ status: 'active', invites: [], candidates: [] }, c));
  const fixedExec = fixed.filter(c => EXEC.has(c.stage));
  const cap = Object.assign({}, MONTHLY_EXEC);
  fixedExec.forEach(c => { cap[App.toDate(c.date).getMonth() + 1]--; });
  const origCap = Object.assign({}, cap);
  const slots = [];
  App.LECTURERS.slice(0, 42).forEach(l => {
    const fp = Object.assign({}, l.footprint);
    fixedExec.filter(c => c.lecturer === l.id).forEach(c => {
      const k = c.mode === 'online' ? 'online' : c.county;
      if (fp[k] > 0) fp[k]--;
      else { const big = Object.keys(fp).sort((a, b) => fp[b] - fp[a])[0]; fp[big]--; }
    });
    Object.entries(fp).forEach(([k, n]) => { for (let i = 0; i < n; i++) slots.push({ l, online: k === 'online', county: k === 'online' ? null : k }); });
  });
  const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10];
  shuffle(slots);
  slots.sort((a, b) => a.l.months.filter(m => MONTHS.includes(m)).length - b.l.months.filter(m => MONTHS.includes(m)).length);
  slots.forEach(s => {
    const avail = MONTHS.filter(m => s.l.months.includes(m) && cap[m] > 0);
    const pool = avail.length ? avail : MONTHS.filter(m => cap[m] > 0);
    const m = pool.sort((a, b) => (cap[b] / origCap[b]) - (cap[a] / origCap[a]) + (gen() - .5) * .02)[0];
    s.month = m;
    cap[m]--;
  });
  const used = new Set(fixed.filter(c => c.date && c.lecturer).map(c => c.lecturer + c.date));
  // 本週一、二（10/26、10/27）各安排幾場剛辦完的活動
  const octSlots = slots.filter(s => s.month === 10);
  const forceDay = (day, dow, n) => {
    let k = 0;
    for (const s of octSlots) {
      if (k >= n) break;
      if (s.date || !s.l.weekdays.includes(dow)) continue;
      const iso = `2026-10-${day}`;
      if (used.has(s.l.id + iso)) continue;
      s.date = iso; used.add(s.l.id + iso); k++;
    }
  };
  forceDay(26, 1, 3);
  forceDay(27, 2, 2);
  slots.forEach(s => {
    if (s.date) return;
    const m = s.month;
    const first = m === 3 ? 9 : 1;
    const last = m === 10 ? 25 : daysIn(2026, m);
    const days = [];
    for (let d = first; d <= last; d++) days.push(`2026-${pad(m)}-${pad(d)}`);
    const ok = days.filter(iso => !HOLIDAYS.has(iso) && s.l.weekdays.includes(App.toDate(iso).getDay()) && !used.has(s.l.id + iso));
    const pool = ok.length ? ok : days.filter(iso => !used.has(s.l.id + iso) && App.toDate(iso).getDay() !== 0);
    s.date = pick(pool);
    used.add(s.l.id + s.date);
  });
  const generated = [];
  slots.forEach(s => {
    const l = s.l;
    // 線上場次多半服務講師可到場的縣市，少數支援離島學校
    const county = s.online ? pick(l.serve.concat(['PEN', 'KIN', 'LIE'])) : s.county;
    const audience = pick(l.audiences);
    generated.push(makeCase({ county, audience, topic: topicFor(l), mode: s.online ? 'online' : 'onsite', date: s.date, lecturer: l.id, stage: 'closed' }));
  });

  // 已執行案件的關卡：依「講師回填 → 承辦勾稽 → 月結撥付（次月 12 日）」的時程推算目前所在關卡
  const batchPaid = ym => { const [y, m] = ym.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-12`; };
  const ageOf = c => App.daysBetween(c.date, App.TODAY);
  const execGen = generated.slice().sort((a, b) => a.date.localeCompare(b.date));
  execGen.forEach(c => { c._rep = between(2, 24); c._rev = between(1, 6); });
  // 6 件成果逾期未回填；2 件勾稽擱置超過 7 天
  execGen.filter(c => ageOf(c) >= 34 && ageOf(c) <= 80).filter((c, i) => i % 5 === 2).slice(0, 6).forEach(c => { c._rep = ageOf(c) + 5; });
  execGen.filter(c => ageOf(c) >= 18 && ageOf(c) <= 26).slice(0, 2).forEach(c => { c._rep = ageOf(c) - 10; c._rev = 30; });
  execGen.forEach(c => {
    const rep = App.addDays(c.date, c._rep);
    if (rep > App.TODAY) { c.stage = 'done'; return; }
    const appr = App.addDays(rep, c._rev);
    if (appr > App.TODAY) { c.stage = 'report'; return; }
    c.stage = batchPaid(appr.slice(0, 7)) <= App.TODAY ? 'closed' : 'claim';
  });

  // ---- 2. 進行中（尚未執行）案件 ----
  const active = App.activeLecturers();
  const freeOn = (l, iso) => l.months.includes(App.toDate(iso).getMonth() + 1) && l.weekdays.includes(App.toDate(iso).getDay()) && !used.has(l.id + iso);
  const pickLecturerFor = (iso, relaxed) => shuffle(active.filter(l => l.serve.length && (relaxed ? !used.has(l.id + iso) : freeOn(l, iso))))[0] || null;
  // 產生期間 App.CASES 尚未建立，邀請順位用簡化規則排序（主題、區域、滿意度）
  const simpleRank = c => {
    const fit = active.filter(l => l.sessions > 0 && l.topics.includes(c.topic) && (c.mode === 'online' ? l.modes.includes('online') : l.serve.includes(c.county)));
    return (fit.length ? fit : active.filter(l => l.sessions > 0 && l.topics.includes(c.topic))).sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  };
  const SCHEDULED_DAYS = ['2026-10-28', '2026-10-28', '2026-10-28', '2026-10-29', '2026-10-29', '2026-10-30', '2026-10-30', '2026-10-30', '2026-10-31'];
  const TODAY_TIMES = ['09:30', '13:30', '19:00'];
  const futureDays = [];
  for (let d = App.addDays(App.TODAY, 5); d <= '2026-12-18'; d = App.addDays(d, 1)) if (App.toDate(d).getDay() % 6 !== 0) futureDays.push(d);
  const scheduledDates = SCHEDULED_DAYS.concat(Array.from({ length: 31 }, (_, i) => futureDays[Math.floor((i + .3) * futureDays.length / 31)]));
  scheduledDates.forEach((iso, i) => {
    // 新進講師 L043、L047 也排入幾場，讓媒合結果不只集中在資深講師
    const l = (i === 12 && freeOn(App.lecturer('L047'), iso) ? App.lecturer('L047') : i === 20 && freeOn(App.lecturer('L043'), iso) ? App.lecturer('L043') : null) || pickLecturerFor(iso) || pickLecturerFor(iso, true);
    used.add(l.id + iso);
    const online = l.modes.includes('online') && gen() < .16;
    const c = makeCase({ county: online ? pick(l.serve.concat(['PEN', 'KIN'])) : pick(l.serve), audience: pick(l.audiences), topic: topicFor(l), mode: online ? 'online' : 'onsite', date: iso, lecturer: l.id, stage: 'scheduled' });
    if (iso === App.TODAY) c.sessions = 2;
    generated.push(c);
  });
  // 今天的三場分別在上午（進行中）、下午、晚上；學校不會排晚上，晚上場次給社區或企業
  generated.filter(c => c.date === App.TODAY).sort((a, b) => (a.orgType === '學校' ? 0 : 1) - (b.orgType === '學校' ? 0 : 1)).forEach((c, i) => { c.time = timeRange(TODAY_TIMES[i], 2); });
  // 異常：講師請假（需代課）、改期申請
  const sched = generated.filter(c => c.stage === 'scheduled');
  sched[6].exception = { type: 'leave', iso: '2026-10-27', note: '講師家中長輩住院，無法前往授課，需安排代課講師。' };
  sched[22].exception = { type: 'leave', iso: '2026-10-26', note: '講師當日另有公務行程衝突，已來電請假。' };
  sched[17].exception = { type: 'resched', iso: '2026-10-25', note: '申請單位因段考調整，申請改期。', newDate: App.addDays(sched[17].date, 14) };

  const pendingCase = (stage, extra) => {
    const audience = wpick(App.AUDIENCES.map(a => a.id), [6, 27, 15, 11, 6, 19, 9, 7]);
    const county = wpick(App.COUNTIES.map(c => c.id), App.COUNTIES.map(c => Math.sqrt(c.pop) + (c.island ? 3 : 0)));
    const topic = wpick(App.TOPICS.map(t => t.id), [13, 22, 12, 9, 15, 17, 5, 7]);
    const mode = App.county(county).island && gen() < .5 ? 'online' : gen() < .1 ? 'online' : 'onsite';
    return makeCase(Object.assign({ county, audience, topic, mode, lecturer: null, stage }, extra));
  };
  const candDates = n => { const d0 = App.addDays(App.TODAY, n); const out = []; for (let d = d0; out.length < 3; d = App.addDays(d, between(1, 4))) if (App.toDate(d).getDay() % 6 !== 0) out.push(d); return out; };

  // 講師確認：8 件已發邀逾 3 日（4 件為申請單位指定講師、不自動轉送；4 件順位邀請已轉到後面順位）
  const CONFIRM_START = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-24',
    '2026-10-25', '2026-10-25', '2026-10-26', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28', '2026-10-28'];
  CONFIRM_START.forEach((start, i) => {
    const c = pendingCase('confirm', { confirmStart: start });
    c.date = futureDays[Math.min(futureDays.length - 1, 8 + i * 2)];
    const ranked = simpleRank(c).slice(0, 5);
    const designated = i < 8 && i % 2 === 0;
    let t = `${start}T${pad(between(9, 16))}:${pad(between(0, 5) * 10)}`;
    if (designated) {
      c.invites = [{ lecturer: ranked[0].id, rank: 1, sent: t, status: 'pending', designated: true }];
    } else {
      // 依順位發邀：婉拒（約 26 小時後）或 48 小時未回覆即轉下一順位，直到「現在」
      c.invites = [];
      for (let k = 0; k < ranked.length; k++) {
        const inv = { lecturer: ranked[k].id, rank: k + 1, sent: t, status: 'pending' };
        c.invites.push(inv);
        const declined = k % 2 === 1;
        const end = declined ? (() => { const d = toDT(t); d.setHours(d.getHours() + 26); return dtStr(d); })() : App.inviteDue(inv);
        if (toDT(end) >= App.NOW || k === ranked.length - 1) break;
        inv.status = declined ? 'declined' : 'expired';
        inv.replied = end;
        t = end;
      }
    }
    generated.push(c);
  });
  // 媒合：14 件尚未發邀
  const MATCH_START = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-23', '2026-10-24', '2026-10-26', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28', '2026-10-28'];
  MATCH_START.forEach((start, i) => generated.push(pendingCase('matching', { matchStart: start, candidates: candDates(26 + i * 2) })));
  // 初審：11 件（其中 3 件退件補正中）
  const REVIEW_START = ['2026-10-21', '2026-10-23', '2026-10-25', '2026-10-26', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28', '2026-10-28'];
  const NEEDS = ['請補附活動企劃書（含流程與參與對象說明）。', '活動日期與候選日期重疊，請重新確認可配合的 3 個日期。', '請補上場地可容納人數與投影設備資訊。'];
  REVIEW_START.forEach((start, i) => generated.push(pendingCase('review', { reviewStart: start, candidates: candDates(30 + i * 2), need: i % 4 === 1 ? NEEDS[(i - 1) / 4] : undefined })));
  // 申請：7 件新送件（最新 3 件尚未指派承辦）
  const SUBMIT_NEW = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-28'];
  SUBMIT_NEW.forEach((d, i) => generated.push(pendingCase('submitted', { submitted: d, candidates: candDates(35 + i * 3), unassigned: i >= 4 })));

  // ---- 3. 取消、退件、撤回 ----
  const CANCEL = [
    ['scheduled', '2026-04-28', '申請單位活動取消（校內行程調整）'],
    ['scheduled', '2026-05-22', '豪雨特報，學校停課'],
    ['scheduled', '2026-06-10', '講師請假，申請單位不需代課'],
    ['matching', '2026-06-30', '媒合失敗：指定日期無合適講師'],
    ['scheduled', '2026-07-24', '颱風停止上班上課'],
    ['scheduled', '2026-08-28', '申請單位改為自行辦理'],
    ['confirm', '2026-09-18', '申請單位改期至明年度'],
    ['scheduled', '2026-10-06', '參與對象人數不足，申請單位取消'],
    ['matching', '2026-10-13', '媒合失敗：離島實體場次無講師可配合'],
  ];
  CANCEL.forEach(([stage, iso, reason]) => {
    const c = pendingCase(stage, { status: 'cancelled', exitDate: iso, exitReason: reason, date: App.addDays(iso, between(3, 20)) });
    if (stage === 'scheduled') { const l = pickLecturerFor(c.date, true); c.lecturer = l.id; c.county = pick(l.serve); }
    generated.push(c);
  });
  const REJECT = ['營利性質活動，不符講師補助原則', '活動日期距申請日不足 14 日', '重複申請（與同單位前案相同場次）', '預估參與人數未達 15 人', '逾期未補件，依規定退件'];
  REJECT.forEach((reason, i) => generated.push(pendingCase('review', { status: 'rejected', exitDate: ['2026-05-06', '2026-06-17', '2026-08-12', '2026-09-09', '2026-10-15'][i], exitReason: reason })));
  const WITHDRAW = ['2026-04-14', '2026-06-02', '2026-07-21', '2026-09-03', '2026-10-19'];
  WITHDRAW.forEach((iso, i) => generated.push(pendingCase(i % 2 ? 'review' : 'submitted', { status: 'withdrawn', exitDate: iso, exitReason: '申請單位自行撤回申請' })));

  // ---- 4. 媒合天數：平均 4.2 天（媒合開始 → 講師確認）----
  const matchedGen = generated.filter(c => c.lecturer && (EXEC.has(c.stage) || c.stage === 'scheduled'));
  matchedGen.forEach(c => { c.matchDays = wpick([1, 2, 3, 4, 5, 6, 7, 8, 9, 11], [6, 14, 22, 20, 14, 9, 6, 4, 2, 1]); });
  fixed.forEach(c => {
    const d = Object.fromEntries(c.log);
    if (d.scheduled && d.matching) c.matchDays = App.daysBetween(d.matching, d.scheduled);
  });
  const allMatched = () => fixed.concat(matchedGen).filter(c => c.matchDays);
  // 3 月初的場次離上線日太近，媒合天數不可能太長
  matchedGen.forEach(c => { const room = App.daysBetween(App.LAUNCH, c.date) - 6; if (c.matchDays > room) c.matchDays = Math.max(1, room); });
  const tunable = matchedGen.filter(c => c.date >= '2026-05-01');
  for (let guard = 0; guard < 2000; guard++) {
    const list = allMatched();
    const avg = sum(list.map(c => c.matchDays)) / list.length;
    if (avg >= 4.15 && avg < 4.25) break;
    const c = tunable[guard * 7 % tunable.length];
    if (avg < 4.15 && c.matchDays < 11) c.matchDays++;
    else if (avg >= 4.25 && c.matchDays > 1) c.matchDays--;
  }

  // ---- 5. 依關卡回推處理紀錄（log）----
  const clampDate = (iso, lo, hi) => (iso < lo ? lo : iso > hi ? hi : iso);
  generated.forEach(c => {
    const log = [];
    if (c.lecturer && (EXEC.has(c.stage) || c.stage === 'scheduled') && c.status === 'active') {
      const lead = c.stage === 'scheduled' ? between(9, 30) : between(14, 40);
      let S = App.addDays(c.date, -lead);
      if (c.stage === 'scheduled' && S > App.addDays(App.TODAY, -1)) S = App.addDays(App.TODAY, -between(1, 4));
      const minS = App.addDays(App.LAUNCH, c.matchDays + 2);
      if (S < minS) S = minS;
      if (S >= c.date) S = App.addDays(c.date, -1);
      const M = App.addDays(S, -c.matchDays);
      const C = App.addDays(S, -Math.min(c.matchDays, between(1, 2)));
      const R = clampDate(App.addDays(M, -between(1, 2)), App.LAUNCH, M);
      const Sb = clampDate(App.addDays(R, -between(0, 2)), App.LAUNCH, R);
      log.push(['submitted', Sb], ['review', R], ['matching', M], ['confirm', C], ['scheduled', S]);
      if (EXEC.has(c.stage)) {
        log.push(['done', c.date]);
        if (c.stage !== 'done') {
          const rep = App.addDays(c.date, c._rep);
          log.push(['report', rep]);
          if (c.stage === 'claim' || c.stage === 'closed') {
            const appr = App.addDays(rep, c._rev);
            log.push(['claim', appr]);
            if (c.stage === 'closed') log.push(['closed', batchPaid(appr.slice(0, 7))]);
          }
        }
      }
    } else if (c.stage === 'confirm' && c.status === 'active') {
      const M = App.addDays(c.confirmStart, -between(1, 3));
      const R = App.addDays(M, -between(1, 2));
      log.push(['submitted', App.addDays(R, -between(0, 2))], ['review', R], ['matching', M], ['confirm', c.confirmStart]);
    } else if (c.stage === 'matching' && c.status === 'active') {
      const R = App.addDays(c.matchStart, -between(1, 2));
      log.push(['submitted', App.addDays(R, -between(0, 2))], ['review', R], ['matching', c.matchStart]);
    } else if (c.stage === 'review' && c.status === 'active') {
      log.push(['submitted', App.addDays(c.reviewStart, -between(0, 2))], ['review', c.reviewStart]);
    } else if (c.stage === 'submitted' && c.status === 'active') {
      log.push(['submitted', c.submitted]);
    } else {
      // 取消／退件／撤回：依結束時所在關卡回推
      const end = c.exitDate;
      const order = ['submitted', 'review', 'matching', 'confirm', 'scheduled'];
      const upto = order.indexOf(c.stage);
      let d = App.addDays(end, -(upto * 3 + between(2, 8)));
      if (d < App.LAUNCH) d = App.LAUNCH;
      order.slice(0, upto + 1).forEach((k, i) => { log.push([k, clampDate(App.addDays(d, i * 3), App.LAUNCH, end)]); });
      if (c.stage === 'scheduled' && !c.date) c.date = App.addDays(end, 7);
    }
    c.log = log;
    c.submitted = log[0][1];
    delete c.confirmStart; delete c.matchStart; delete c.reviewStart; delete c._rep; delete c._rev;
  });
  fixed.forEach(c => { c.submitted = c.log[0][1]; });

  // ---- 6. 編號：依送件日排序，填入民眾網既有案號以外的號碼 ----
  const fixedNums = new Set(fixed.map(c => Number(c.id.slice(-4))));
  generated.sort((a, b) => a.submitted.localeCompare(b.submitted) || (a.date || '').localeCompare(b.date || ''));
  let num = 1;
  generated.forEach(c => {
    while (fixedNums.has(num)) num++;
    c.id = `EE115-${String(num).padStart(4, '0')}`;
    num++;
  });
  App.CASES = fixed.concat(generated).sort((a, b) => a.id.localeCompare(b.id));
  const caseMap = Object.fromEntries(App.CASES.map(c => [c.id, c]));
  // 頁面在記憶體中新增的案件（代填申請）不在對照表內，退回 find；復原移除後自然查不到
  App.case = id => { const k = String(id || '').trim().toUpperCase(); return caseMap[k] || App.CASES.find(c => c.id === k); };
  App.logDate = (c, key) => { const e = c.log.find(x => x[0] === key); return e ? e[1] : null; };

  // ---- 7. 承辦、附件、聯絡信箱、成果、費用、問卷 ----
  App.CASES.forEach(c => {
    c.invites = c.invites || [];
    c.candidates = c.candidates || [];
    c.reminders = [];
    c.owner = c.unassigned ? null : ownerOf(c.county);
    delete c.unassigned;
    if (!c.email) c.email = `contact.${c.id.slice(-4)}@${c.orgType === '企業' ? 'example.com' : 'example.tw'}`;
    const r = App.rng(c.id);
    c.files = [{ name: '活動企劃書.pdf', size: `${(0.4 + r() * 1.6).toFixed(1)} MB` }];
    if (c.mode === 'onsite') c.files.push({ name: '場地照片.jpg', size: `${(1.2 + r() * 2.4).toFixed(1)} MB` });
    if (c.orgType === '學校' && r() < .5) c.files.push({ name: '參與班級名冊.xlsx', size: `${Math.round(18 + r() * 40)} KB` });
  });

  // 成果與費用：report 關卡刻意放入幾種勾稽異常，讓核銷頁有東西可審
  const ANOMALY = ['people-warn', 'signin', 'photo-warn', 'hours', 'amount', 'people-fail', 'photo-fail'];
  let anomalyIdx = 0;
  const withResult = App.CASES.filter(c => c.status === 'active' && ['report', 'claim', 'closed'].includes(c.stage));
  withResult.forEach(c => {
    const r = App.rng(c.id + ':result');
    const done = Object.fromEntries(c.log);
    if (!c.result) c.result = { people: Math.max(8, Math.round(c.people * (.82 + r() * .26))), hours: c.sessions };
    Object.assign(c.result, { signin: true, photos: 2 + Math.floor(r() * 5), submitted: done.report });
    const isFixed = fixedNums.has(Number(c.id.slice(-4)));
    let claimTravelExtra = 0;
    if (c.stage === 'report' && !isFixed && anomalyIdx < ANOMALY.length) {
      const kind = ANOMALY[anomalyIdx++];
      if (kind === 'people-warn') c.result.people = Math.round(c.people * .62);
      if (kind === 'people-fail') c.result.people = Math.round(c.people * .45);
      if (kind === 'signin') c.result.signin = false;
      if (kind === 'photo-warn') c.result.photos = 1;
      if (kind === 'photo-fail') c.result.photos = 0;
      if (kind === 'hours') { if (c.sessions >= 2) c.result.hours = c.sessions - 1; else c.result.people = Math.round(c.people * .6); }
      if (kind === 'amount') claimTravelExtra = 600;
    }
    const fee = App.feeFor(c, c.result.hours);
    c.claimed = { lecture: fee.lecture, travel: fee.travel + claimTravelExtra, total: fee.total + claimTravelExtra };
  });
  // 參與人次：以實到人數加總，精確對齊 15,286 人次（與民眾網公開數字相同）
  const PARTICIPANTS = 15286;
  const adjustable = withResult.filter(c => !fixedNums.has(Number(c.id.slice(-4))) && c.result.people >= c.people * .7);
  let diff = PARTICIPANTS - sum(withResult.map(c => c.result.people));
  for (let i = 0; diff !== 0 && i < 100000; i++) {
    const c = adjustable[i % adjustable.length];
    const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(1, Math.round(Math.abs(diff) / adjustable.length)));
    const next = c.result.people + step;
    if (next >= Math.round(c.people * .7) && next <= Math.round(c.people * 1.25)) { c.result.people = next; diff -= step; }
  }
  withResult.forEach(c => { const fee = App.feeFor(c, c.result.hours); const extra = c.claimed.travel - fee.travel; c.claimed = { lecture: fee.lecture, travel: fee.travel + extra, total: fee.total + extra }; });

  // 問卷：已執行案件寄送參與者滿意度問卷
  App.CASES.filter(App.isExecuted).forEach(c => {
    const l = App.lecturer(c.lecturer);
    const r = App.rng(c.id + ':survey');
    const invited = c.result ? c.result.people : c.people;
    const rate = c.stage === 'done' ? .3 + r() * .3 : .58 + r() * .3;
    c.survey = { invited, responses: Math.max(3, Math.round(invited * rate)), avg: Math.min(5, Math.round((l.rating + (r() - .5) * .3) * 100) / 100) };
  });

  // 核銷批次：依撥付月份成批（每月 12 日撥付上月勾稽通過者）；核銷中案件在 11 月批次（編製中）
  const batchMap = {};
  App.CASES.filter(c => c.status === 'active' && (c.stage === 'claim' || c.stage === 'closed')).forEach(c => {
    const ym = c.stage === 'claim' ? '2026-11' : App.logDate(c, 'closed').slice(0, 7);
    const id = `B115-${ym.slice(5)}`;
    c.batch = id;
    (batchMap[id] = batchMap[id] || { id, month: ym, cases: [] }).cases.push(c.id);
  });
  App.BATCHES = Object.values(batchMap).sort((a, b) => b.month.localeCompare(a.month)).map(b => {
    const open = b.month > App.TODAY.slice(0, 7);
    Object.assign(b, {
      title: `${App.fmt.rocYM(b.month)}撥付批次`,
      status: open ? '編製中' : '已撥付',
      date: open ? `${b.month}-12` : b.cases.map(id => App.logDate(App.case(id), 'closed')).sort().pop(),
    });
    // 合計金額即時從案件計算：核准、退回後批次金額自動同步
    Object.defineProperty(b, 'total', { enumerable: true, get: () => sum(b.cases.map(id => App.case(id).claimed.total)) });
    return b;
  });
  App.DEFAULT_CASE = 'EE115-0455';

  /* ===================================================================
     查詢與計算
     =================================================================== */
  const stageSince = c => c.log[c.log.length - 1][1];
  const isPending = c => c.status === 'active';

  App.kpis = () => {
    const valid = App.CASES.filter(c => c.status !== 'withdrawn');
    const executed = App.CASES.filter(App.isExecuted);
    const matched = App.CASES.filter(c => c.matchDays && (c.status === 'active' ? (EXEC.has(c.stage) || c.stage === 'scheduled') : c.lecturer && c.stage === 'scheduled'));
    const inMatch = App.CASES.filter(c => isPending(c) && (c.stage === 'matching' || c.stage === 'confirm'));
    const failed = App.CASES.filter(c => c.status === 'cancelled' && /媒合失敗/.test(c.exitReason || ''));
    const withRes = executed.filter(c => c.result);
    const participants = sum(withRes.map(c => c.result.people));
    const responses = sum(executed.map(c => c.survey.responses));
    const lect = App.LECTURERS.filter(l => l.sessions);
    const delivered = executed.length;
    return {
      applications: valid.length,
      applicationsMonth: valid.filter(c => c.submitted.startsWith('2026-10')).length,
      withdrawn: App.CASES.length - valid.length,
      matchRate: matched.length / (matched.length + inMatch.length + failed.length),
      matched: matched.length,
      inProgressMatch: inMatch.length,
      avgMatchDays: Math.round(sum(matched.map(c => c.matchDays)) / matched.length * 10) / 10,
      delivered,
      deliveredMonth: executed.filter(c => c.date.startsWith('2026-10')).length,
      deliveredPrevMonth: executed.filter(c => c.date.startsWith('2026-09')).length,
      onlineShare: executed.filter(c => c.mode === 'online').length / delivered,
      participants,
      perSession: Math.round(participants / withRes.length),
      // 平均滿意度：各講師滿意度依場次加權（與民眾網公開數字同一算法）
      satisfaction: Math.round(sum(lect.map(l => l.rating * l.sessions)) / sum(lect.map(l => l.sessions)) * 100) / 100,
      responses,
    };
  };

  App.stageStats = () => App.STAGES.map(s => {
    const cases = App.CASES.filter(c => isPending(c) && c.stage === s.key);
    const dwell = cases.map(c => (s.key === 'done' ? App.daysBetween(c.date, App.TODAY) : s.key === 'scheduled' ? App.daysBetween(App.TODAY, c.date) : App.daysBetween(stageSince(c), App.TODAY)));
    const late = s.sla == null ? 0 : dwell.filter(d => d > s.sla).length;
    return Object.assign({}, s, {
      count: cases.length,
      avgDays: cases.length ? Math.round(sum(dwell) / cases.length * 10) / 10 : 0,
      late,
      cases: cases.map((c, i) => ({ c, days: dwell[i] })).sort((a, b) => b.days - a.days),
    });
  });
  // 瓶頸：逾時比例最高（且至少 5 件）的關卡
  App.bottleneck = (stats = App.stageStats()) => {
    const cand = stats.filter(s => s.sla != null && s.count >= 5);
    return cand.sort((a, b) => b.late / b.count - a.late / a.count)[0].key;
  };
  App.exitStats = () => ({
    cancelled: App.CASES.filter(c => c.status === 'cancelled').length,
    rejected: App.CASES.filter(c => c.status === 'rejected').length,
    withdrawn: App.CASES.filter(c => c.status === 'withdrawn').length,
  });

  App.currentInvite = c => c.invites.find(i => i.status === 'pending') || null;

  App.todo = (o = {}) => {
    const mine = c => !o.mine || c.owner === App.ME;
    const act = App.CASES.filter(c => isPending(c) && mine(c));
    const dwell = c => App.daysBetween(stageSince(c), App.TODAY);
    const review = act.filter(c => c.stage === 'submitted' || c.stage === 'review').map(c => {
      const d = dwell(c);
      const s = App.stage(c.stage);
      return { c, urgent: d > s.sla, reason: c.need ? `退件補正中：${c.need}` : c.stage === 'submitted' ? `新申請・${d ? `已等待 ${d} 天` : '今日送件'}${c.owner ? '' : '・尚未指派承辦'}` : `初審第 ${d + 1} 天`, due: App.addDays(stageSince(c), s.sla) };
    }).sort((a, b) => a.due.localeCompare(b.due));
    const matching = act.filter(c => c.stage === 'matching' && !App.currentInvite(c)).map(c => {
      const d = dwell(c);
      return { c, urgent: d > 5, reason: `媒合第 ${d + 1} 天・候選日期 ${c.candidates.map(App.fmt.md).join('、') || '待確認'}`, due: App.addDays(stageSince(c), 5) };
    }).sort((a, b) => a.due.localeCompare(b.due));
    const noReply = act.filter(c => c.stage === 'confirm' && dwell(c) > 3).map(c => {
      const inv = App.currentInvite(c);
      const l = inv && App.lecturer(inv.lecturer);
      const left = inv ? App.hoursLeft(App.inviteDue(inv)) : 0;
      const txt = inv && inv.designated
        ? `指定講師 ${l.name} 已 ${App.daysBetween(inv.sent.slice(0, 10), App.TODAY)} 天未回覆（不自動轉送）`
        : `已發邀 ${dwell(c)} 天・目前第 ${inv ? inv.rank : '—'} 順位 ${l ? l.name : ''}${inv ? (left > 0 ? `，剩 ${App.fmt.hours(left)}` : '，已逾 48 小時') : ''}`;
      return { c, urgent: true, reason: txt, due: App.addDays(stageSince(c), 3) };
    }).sort((a, b) => a.due.localeCompare(b.due));
    const reportLate = act.filter(c => c.stage === 'done' && App.daysBetween(c.date, App.TODAY) > 30).map(c => ({
      c, urgent: true, reason: `${App.lecturer(c.lecturer).name} 講師授課後 ${App.daysBetween(c.date, App.TODAY)} 天未回填（期限 ${App.fmt.md(App.addDays(c.date, 30))}）`, due: App.addDays(c.date, 30),
    })).sort((a, b) => a.due.localeCompare(b.due));
    const claim = act.filter(c => c.stage === 'report').map(c => {
      const v = App.claimVerdict(c);
      return { c, urgent: v === 'fail' || dwell(c) > 7, reason: `申請 ${App.fmt.money(c.claimed.total)}・勾稽${v === 'pass' ? '全數通過' : v === 'warn' ? '有警示' : '有不符項目'}`, due: App.addDays(stageSince(c), 7), verdict: v };
    }).sort((a, b) => a.due.localeCompare(b.due));
    return { review, matching, noReply, reportLate, claim };
  };

  App.sessionState = c => {
    if (c.status === 'cancelled') return { key: 'cancelled', label: '已取消', tone: 'err' };
    if (c.exception && c.exception.type === 'leave') return { key: 'leave', label: '講師請假', tone: 'err' };
    if (c.exception && c.exception.type === 'resched') return { key: 'resched', label: '改期申請', tone: 'warn' };
    if (EXEC.has(c.stage)) return { key: 'done', label: '已執行', tone: 'ok' };
    if (c.date === App.TODAY) {
      const [s, e] = c.time.split('–');
      const now = `${pad(App.NOW.getHours())}:${pad(App.NOW.getMinutes())}`;
      if (now >= s && now < e) return { key: 'live', label: '進行中', tone: 'sprout' };
      return now >= e ? { key: 'done', label: '已執行', tone: 'ok' } : { key: 'today', label: '今日', tone: 'forest' };
    }
    if (c.stage === 'scheduled') return { key: 'upcoming', label: '待執行', tone: 'forest' };
    return { key: 'pending', label: '待確認', tone: 'clay' };
  };
  App.daySessions = iso => App.CASES.filter(c => c.date === iso && c.lecturer && (c.status === 'active' && (c.stage === 'scheduled' || EXEC.has(c.stage)))).sort((a, b) => a.time.localeCompare(b.time));
  App.weekSessions = (start = App.WEEK.start) => Array.from({ length: 7 }, (_, i) => { const iso = App.addDays(start, i); return { iso, sessions: App.daySessions(iso) }; });

  App.dataIssues = () => {
    const act = App.activeLecturers();
    return {
      missing: act.filter(l => l.missing.length).map(l => ({ l, fields: l.missing })).sort((a, b) => b.fields.length - a.fields.length),
      expiring: act.map(l => ({ l, days: App.certDays(l) })).filter(x => x.days <= 90).sort((a, b) => a.days - b.days),
    };
  };

  App.filterCases = (f = {}) => {
    const q = (f.q || '').trim().toLowerCase();
    return App.CASES.filter(c => {
      if (f.status && (f.status === 'active' ? c.status !== 'active' : c.status !== f.status)) return false;
      if (f.stage && (c.stage !== f.stage || c.status !== 'active')) return false;
      if (f.county && c.county !== f.county) return false;
      if (f.region && App.county(c.county).region !== f.region) return false;
      if (f.audience && c.audience !== f.audience) return false;
      if (f.topic && c.topic !== f.topic) return false;
      if (f.owner !== undefined && f.owner !== '' && c.owner !== f.owner) return false;
      const d = c.date || (c.candidates && c.candidates[0]) || c.submitted;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
      if (q) {
        const l = c.lecturer && App.lecturer(c.lecturer);
        const hay = `${c.id} ${c.org} ${c.contact} ${App.county(c.county).name} ${c.district} ${l ? l.name : ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };

  App.byCounty = (metric = 'sessions', f = {}) => {
    const out = Object.fromEntries(App.COUNTIES.map(c => [c.id, 0]));
    App.CASES.filter(App.isExecuted).filter(c => (!f.audience || c.audience === f.audience) && (!f.topic || c.topic === f.topic) && (!f.from || c.date >= f.from) && (!f.to || c.date <= f.to)).forEach(c => {
      out[c.county] += metric === 'people' ? (c.result ? c.result.people : 0) : 1;
    });
    if (metric === 'per10k') Object.keys(out).forEach(k => { out[k] = Math.round(out[k] / App.county(k).pop * 100) / 100; });
    return out;
  };

  App.monthly = (metric = 'sessions', f = {}) => MONTHS.map(m => {
    const ym = `2026-${pad(m)}`;
    const filt = c => (!f.county || c.county === f.county) && (!f.audience || c.audience === f.audience) && (!f.topic || c.topic === f.topic);
    let value;
    if (metric === 'apps') value = App.CASES.filter(c => c.status !== 'withdrawn' && c.submitted.startsWith(ym) && filt(c)).length;
    else {
      const ex = App.CASES.filter(c => App.isExecuted(c) && c.date.startsWith(ym) && filt(c));
      if (metric === 'sessions') value = ex.length;
      else if (metric === 'people') value = sum(ex.filter(c => c.result).map(c => c.result.people));
      else if (metric === 'satisfaction') { const r = sum(ex.map(c => c.survey.responses)); value = r ? Math.round(sum(ex.map(c => c.survey.avg * c.survey.responses)) / r * 100) / 100 : 0; }
      else if (metric === 'matchDays') { const mm = App.CASES.filter(c => c.matchDays && App.logDate(c, 'scheduled') && App.logDate(c, 'scheduled').startsWith(ym) && filt(c)); value = mm.length ? Math.round(sum(mm.map(c => c.matchDays)) / mm.length * 10) / 10 : 0; }
    }
    return { ym, label: `${m}月`, value };
  });

  App.load30 = (lecturerId, ref = App.TODAY) => App.CASES.filter(c => c.lecturer === lecturerId && c.date && c.status === 'active' && Math.abs(App.daysBetween(ref, c.date)) <= 30).length;
  App.isFree = (lecturerId, iso) => {
    const l = App.lecturer(lecturerId);
    const d = App.toDate(iso);
    const clash = App.CASES.find(c => c.lecturer === lecturerId && c.date === iso && c.status === 'active');
    if (clash) return { ok: false, reason: `${App.fmt.md(iso)} 已有 ${clash.id} ${clash.org} 場次` };
    if (!l.months.includes(d.getMonth() + 1)) return { ok: false, reason: `${d.getMonth() + 1} 月未開放檔期` };
    if (!l.weekdays.includes(d.getDay())) return { ok: false, reason: `週${DOW[d.getDay()]}不在可授課時段` };
    return { ok: true, reason: '' };
  };

  // 條件式媒合：逐條套用條件、記錄每一步剩下的講師（一般系統規則）
  App.MATCH_DEFAULT = { region: 'serve', topic: true, audience: true, slot: true, loadMax: 6, minRating: 4.5 };
  App.matchFunnel = (c, criteria = {}) => {
    const k = Object.assign({}, App.MATCH_DEFAULT, criteria);
    const dates = c.date ? [c.date] : (c.candidates || []);
    const exclude = new Set((c.invites || []).filter(i => i.status !== 'pending').map(i => i.lecturer));
    const pool = App.activeLecturers().filter(l => !exclude.has(l.id));
    let cur = pool.slice();
    const steps = [{ key: 'pool', label: '啟用中的講師', note: exclude.size ? `已排除 ${exclude.size} 位婉拒或逾時者` : '資料完整且認證有效', ids: cur.map(l => l.id) }];
    const apply = (key, label, note, test) => { cur = cur.filter(test); steps.push({ key, label, note, ids: cur.map(l => l.id) }); };
    if (k.region !== 'any') {
      const cn = App.county(c.county);
      if (c.mode === 'online') apply('region', '服務區域', '線上場次：需可線上授課', l => l.modes.includes('online'));
      else if (k.region === 'region') apply('region', '服務區域', `可到場${cn.region}縣市`, l => l.serve.some(id => App.county(id).region === cn.region));
      else apply('region', '服務區域', `可到場${cn.name}`, l => l.serve.includes(c.county));
    }
    if (k.topic) apply('topic', '專長主題', App.topic(c.topic).name, l => l.topics.includes(c.topic));
    if (k.audience) apply('audience', '服務對象經驗', App.audience(c.audience).name, l => l.audiences.includes(c.audience));
    if (k.slot && dates.length) apply('slot', '檔期', dates.length > 1 ? `候選 ${dates.length} 日至少一日可配合` : `${App.fmt.rocShort(dates[0])}可配合`, l => dates.some(d => App.isFree(l.id, d).ok));
    if (k.loadMax) apply('load', '近 30 日場次負載', `不超過 ${k.loadMax} 場`, l => App.load30(l.id, dates[0] || App.TODAY) <= k.loadMax);
    if (k.minRating) apply('rating', '滿意度門檻', `平均 ${k.minRating.toFixed(1)} 分以上（新進講師不受限）`, l => l.rating == null || l.rating >= k.minRating);
    const ranked = cur.map(l => {
      const reasons = [], warns = [];
      let score = 50;
      if (l.serve.includes(c.county)) { score += 15; reasons.push(l.county === c.county ? `戶籍即在${App.county(c.county).name}` : `可到場服務${App.county(c.county).name}`); }
      else if (c.mode === 'online') reasons.push('可線上授課');
      if (l.topics[0] === c.topic) { score += 12; reasons.push(`主要專長為「${App.topic(c.topic).name}」`); }
      else if (l.topics.includes(c.topic)) { score += 6; reasons.push(`專長含「${App.topic(c.topic).name}」`); }
      if (l.audiences.includes(c.audience)) { score += 8; reasons.push(`具「${App.audience(c.audience).name}」授課經驗`); }
      const free = dates.filter(d => App.isFree(l.id, d).ok);
      if (dates.length && free.length) reasons.push(dates.length > 1 ? `可配合 ${free.map(App.fmt.md).join('、')}` : '活動日檔期可配合');
      if (l.rating != null) { score += (l.rating - 4.5) * 30; reasons.push(`平均滿意度 ${l.rating.toFixed(1)}（${l.sessions} 場）`); }
      else { warns.push('新進講師，尚無滿意度紀錄'); score += 2; }
      const load = App.load30(l.id, dates[0] || App.TODAY);
      score -= load * 2;
      if (load >= Math.max(1, k.loadMax - 1)) warns.push(`近 30 日已有 ${load} 場，接近負載上限`);
      dates.forEach(d => { const f = App.isFree(l.id, d); if (!f.ok && dates.length > 1) warns.push(f.reason); });
      if (c.mode !== 'online') {
        const km = App.distanceKm(l.county, c.county);
        const tier = App.travelTier(l.county, c.county);
        if (tier.island) warns.push('需跨海往返，交通費依實際票價');
        else if (km > 80) warns.push(`距離約 ${km} 公里，交通費 ${App.fmt.money(tier.amount)}`);
      }
      const cd = App.certDays(l);
      if (cd <= 90) warns.push(`認證將於 ${cd} 天後到期`);
      return { l, score: Math.round(score * 10) / 10, reasons, warns: [...new Set(warns)] };
    }).sort((a, b) => b.score - a.score);
    return { pool: pool.map(l => l.id), steps, ranked, criteria: k };
  };

  App.claimChecks = c => {
    if (!c.result) return [];
    const out = [];
    const ratio = c.result.people / c.people;
    out.push({ key: 'people', label: '實到人數 vs 申請人數', detail: `實到 ${c.result.people} 人／申請 ${c.people} 人（${Math.round(ratio * 100)}%）`, result: ratio >= .7 ? 'pass' : ratio >= .5 ? 'warn' : 'fail' });
    const h = c.result.hours;
    out.push({ key: 'hours', label: '實際時數 vs 核定時數', detail: h === c.sessions ? `實際 ${h} 節＝核定 ${c.sessions} 節（每節 ${App.FEE.minutes} 分鐘）` : h < c.sessions ? `實際 ${h} 節，少於核定 ${c.sessions} 節，依實際節數支付` : `實際 ${h} 節超過核定 ${c.sessions} 節，僅支付核定節數`, result: h === c.sessions ? 'pass' : 'warn' });
    out.push({ key: 'signin', label: '簽到表', detail: c.result.signin ? '已上傳（PDF，1 份）' : '未上傳簽到表，需補件', result: c.result.signin ? 'pass' : 'fail' });
    out.push({ key: 'photos', label: '活動照片', detail: c.result.photos >= 2 ? `已上傳 ${c.result.photos} 張` : c.result.photos === 1 ? '僅 1 張，建議至少 2 張' : '未上傳活動照片', result: c.result.photos >= 2 ? 'pass' : c.result.photos === 1 ? 'warn' : 'fail' });
    const fee = App.feeFor(c, h);
    const ok = fee.total === c.claimed.total;
    out.push({ key: 'amount', label: '金額＝時數 × 費率＋交通費', detail: `${Math.min(h, c.sessions)} 節 × ${App.fmt.money(fee.rate.rate)}＋交通費 ${App.fmt.money(fee.travel)}＝${App.fmt.money(fee.total)}${ok ? '' : `；申請 ${App.fmt.money(c.claimed.total)}，不符`}`, result: ok ? 'pass' : 'fail' });
    return out;
  };
  App.claimVerdict = c => { const r = App.claimChecks(c).map(x => x.result); return r.includes('fail') ? 'fail' : r.includes('warn') ? 'warn' : 'pass'; };

  const LOG_TEXT = {
    submitted: c => ({ title: '申請單位送出申請', by: `${c.contact}（${c.org}）` }),
    review: c => ({ title: '受理並開始初審', by: c.owner ? App.staff(c.owner).name : '系統' }),
    matching: c => ({ title: '初審通過，進入媒合', by: c.owner ? App.staff(c.owner).name : '系統' }),
    confirm: c => { const inv = c.invites[0]; return { title: `發出講師邀請${inv ? `（第 1 順位 ${App.lecturer(inv.lecturer).name}）` : ''}`, by: c.owner ? App.staff(c.owner).name : '系統' }; },
    scheduled: c => ({ title: `${c.lecturer ? App.lecturer(c.lecturer).name : '講師'}接受邀請，確認授課`, by: '講師' }),
    done: () => ({ title: '活動辦理完成', by: '系統' }),
    report: c => ({ title: '講師回填成果與費用申請', by: c.lecturer ? App.lecturer(c.lecturer).name : '講師' }),
    claim: c => ({ title: `勾稽通過，編入核銷批次 ${c.batch || ''}`, by: c.owner ? App.staff(c.owner).name : '系統' }),
    closed: () => ({ title: '會計覆核完成，費用撥付、結案', by: App.staff('S05').name }),
  };
  const NOW_HM = `${pad(App.NOW.getHours())}:${pad(App.NOW.getMinutes())}`;
  const addMin = (hm, n) => { const m = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) + n; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
  App.caseLog = c => {
    const r = App.rng(c.id + ':log');
    // 示意時刻依案號固定產生；「今天」的紀錄收在上午（不能晚於現在 10:30），同一天的關卡依序發生
    const t = iso => {
      const h = 9 + Math.floor(r() * 8), m = Math.floor(r() * 6) * 10;
      return iso === App.TODAY ? `${pad(8 + (h % 2))}:${pad(m)}` : `${pad(h)}:${pad(m)}`;
    };
    let prev = null;
    const out = c.log.map(([k, iso]) => {
      let time = t(iso);
      if (prev && prev.iso === iso && time <= prev.time) time = addMin(prev.time, 20);
      if (iso === App.TODAY && time > NOW_HM) time = NOW_HM;
      prev = { iso, time };
      return Object.assign({ iso, time, tone: 'done', note: '' }, LOG_TEXT[k](c));
    });
    if (c.need) { const iso = App.logDate(c, 'review'); out.push({ iso, time: iso === App.TODAY ? NOW_HM : '16:40', title: '退件補正', by: c.owner ? App.staff(c.owner).name : '系統', note: c.need, tone: 'warn' }); }
    c.invites.slice(1).forEach(inv => out.push({ iso: inv.sent.slice(0, 10), time: inv.sent.slice(11, 16), title: `轉送第 ${inv.rank} 順位 ${App.lecturer(inv.lecturer).name}`, by: '系統（前一順位 48 小時未回覆或婉拒）', note: '', tone: 'warn' }));
    c.reminders.forEach(iso => out.push({ iso: iso.slice(0, 10), time: iso.slice(11, 16) || '10:30', title: '承辦催覆／提醒', by: App.staff(App.ME).name, note: '', tone: 'done' }));
    if (c.exception) out.push({ iso: c.exception.iso, time: '11:20', title: c.exception.type === 'leave' ? '講師請假' : '申請改期', by: c.exception.type === 'leave' ? '講師' : c.contact, note: c.exception.note, tone: 'err' });
    if (c.status !== 'active') out.push({ iso: c.exitDate, time: '15:00', title: App.EXITS[c.status], by: c.status === 'withdrawn' ? c.contact : c.owner ? App.staff(c.owner).name : '系統', note: c.exitReason, tone: 'err' });
    return out.sort((a, b) => (b.iso + b.time).localeCompare(a.iso + a.time));
  };

  /* ===================================================================
     滿意度問卷（題目、各題分布、開放意見）
     =================================================================== */
  App.SURVEY = (() => {
    const k = App.kpis();
    const R = k.responses;
    const scale = (id, title, mean) => {
      // 依目標平均分配 5～1 分的人數：4～1 分固定比例 .78/.17/.04/.01，平均扣分 1.28，反推 5 分占比
      const rest = clamp((5 - mean) / 1.28, .05, .6);
      const p5 = 1 - rest;
      const raw = [p5, rest * .78, rest * .17, rest * .04, rest * .01];
      const counts = raw.map(x => Math.round(x * R));
      counts[0] += R - sum(counts);
      return { id, type: 'scale', title, counts, mean: Math.round(sum(counts.map((n, i) => n * (5 - i))) / R * 100) / 100 };
    };
    const single = (id, title, options, weights) => {
      const counts = weights.map(w => Math.round(w / sum(weights) * R));
      counts[0] += R - sum(counts);
      return { id, type: 'single', title, options, counts };
    };
    const questions = [
      scale('q1', '整體而言，我對本次講座感到滿意', k.satisfaction),
      scale('q2', '講師的表達清楚、易於理解', k.satisfaction + .04),
      scale('q3', '課程內容與我的生活或工作相關', k.satisfaction - .09),
      scale('q4', '活動中的互動與實作安排適當', k.satisfaction - .03),
      scale('q5', '我願意在生活中實踐淨零綠生活行動', k.satisfaction + .02),
      single('q6', '您最想從哪一個面向開始實踐淨零綠生活？', ['食', '衣', '住', '行', '育', '樂', '購'], [31, 9, 18, 14, 8, 7, 13]),
      single('q7', '您是從哪裡得知本次活動？', ['學校／單位通知', '社群媒體', '親友介紹', '社區公告', '其他'], [62, 14, 9, 12, 3]),
      { id: 'q8', type: 'open', title: '對本次講座的建議或心得', count: Math.round(R * .34) },
    ];
    return {
      title: '115 年度環境教育講座 參與者滿意度問卷',
      sent: sum(App.CASES.filter(App.isExecuted).map(c => c.survey.invited)),
      responses: R,
      questions,
      keywords: [
        { word: '實作', n: 412 }, { word: '生活化', n: 366 }, { word: '互動', n: 341 }, { word: '淺顯易懂', n: 298 }, { word: '在地案例', n: 254 },
        { word: '節電', n: 203 }, { word: '剩食', n: 188 }, { word: '想再上', n: 176 }, { word: '教具', n: 152 }, { word: '長輩聽得懂', n: 139 },
        { word: '戶外觀察', n: 121 }, { word: '減塑', n: 117 }, { word: '時間太短', n: 96, neg: true }, { word: '音量', n: 41, neg: true }, { word: '場地太熱', n: 33, neg: true }, { word: '講義字太小', n: 27, neg: true },
      ],
      comments: [
        { case: 'EE115-0398', text: '講師帶大家煮了一道剩食料理，長輩們都說回家要做給孫子吃。', score: 5 },
        { case: 'EE115-0301', text: '字卡很大、講話慢，坐後面的長輩也看得清楚，希望明年再來。', score: 5 },
        { case: 'EE115-0362', text: '晚上的場次很適合上班族，但兩節課有點意猶未盡。', score: 4 },
        { case: 'EE115-0379', text: '用在地淹水地圖討論調適，比課本更有感覺。', score: 5 },
        { case: null, text: '實作的部分很好玩，希望講義的字可以再大一點。', score: 4 },
        { case: null, text: '禮堂後排聽不太清楚，建議準備無線麥克風。', score: 3 },
        { case: null, text: '節電小撇步很實用，回家馬上把冷氣調到 27 度。', score: 5 },
        { case: null, text: '戶外觀察時間太短，孩子們還想多找幾種昆蟲。', score: 4 },
      ],
    };
  })();

  /* ===================================================================
     通知（頂列）與記憶體狀態
     =================================================================== */
  App.state = { read: new Set() };
  App.notifications = () => {
    const t = App.todo();
    const stats = App.stageStats();
    const today = App.daySessions(App.TODAY);
    const issues = App.dataIssues();
    const leave = App.CASES.filter(c => c.status === 'active' && c.exception && c.exception.type === 'leave').sort((a, b) => a.date.localeCompare(b.date));
    const fresh = App.CASES.filter(c => c.status === 'active' && c.stage === 'submitted').sort((a, b) => b.submitted.localeCompare(a.submitted))[0];
    const batch = App.BATCHES.find(b => b.status === '編製中');
    const list = [
      { id: 'n-noreply', tone: 'clay', icon: 'hourglass', text: `${t.noReply.length} 件案件講師逾 3 日未回覆，「講師確認」關卡出現瓶頸`, time: '今天 08:00', href: 'applications.html?view=noreply' },
      leave[0] && { id: 'n-leave', tone: 'clay', icon: 'alert', text: `${leave[0].id} ${leave[0].org}：講師請假，${App.fmt.rocShort(leave[0].date)}場次需安排代課`, time: '昨天 11:20', href: `schedule.html?id=${leave[0].id}` },
      { id: 'n-today', tone: 'forest', icon: 'calendar', text: `今日有 ${today.length} 場活動，第一場 ${today[0] ? today[0].time.split('–')[0] : ''} 於${today[0] ? App.county(today[0].county).name : ''}`, time: '今天 07:30', href: 'schedule.html' },
      fresh && { id: 'n-new', tone: 'sky', icon: 'inbox', text: `新申請 ${fresh.id} ${fresh.org}（${App.county(fresh.county).name}）待受理`, time: '今天 09:12', href: `application.html?id=${fresh.id}` },
      issues.expiring[0] && { id: 'n-cert', tone: 'clay', icon: 'shield', text: `${issues.expiring[0].l.name} 講師認證將於 ${issues.expiring[0].days} 天後到期（${App.fmt.roc(issues.expiring[0].l.cert.until)}）`, time: '昨天 09:00', href: `instructors.html?id=${issues.expiring[0].l.id}` },
      { id: 'n-late', tone: 'clay', icon: 'file', text: `${stats.find(s => s.key === 'done').late} 件授課成果逾 30 日未回填`, time: '10/26 09:00', href: 'claims.html?view=late' },
      batch && { id: 'n-batch', tone: 'sky', icon: 'coin', text: `核銷批次 ${batch.id} 已編入 ${batch.cases.length} 件，待會計覆核`, time: '10/24 17:05', href: 'claims.html#batches' },
    ].filter(Boolean);
    list.forEach((n, i) => { n.unread = i < 4 && !App.state.read.has(n.id); });
    return list;
  };

  /* ===================================================================
     資料同步：任何改變資料的動作（含復原）都呼叫 App.emit()
     =================================================================== */
  const counters = {
    navReview: () => App.todo().review.length,
    navMatch: () => App.todo().matching.length + App.todo().noReply.length,
    navToday: () => App.daySessions(App.TODAY).length,
    navClaims: () => App.todo().claim.length,
    navLecturer: () => { const d = App.dataIssues(); return d.missing.length + d.expiring.length; },
    notif: () => App.notifications().filter(n => n.unread).length || '',
    todoAll: () => { const t = App.todo(); return sum(Object.values(t).map(a => a.length)); },
    todoMine: () => { const t = App.todo({ mine: true }); return sum(Object.values(t).map(a => a.length)); },
    review: () => App.todo().review.length,
    matching: () => App.todo().matching.length,
    noReply: () => App.todo().noReply.length,
    reportLate: () => App.todo().reportLate.length,
    claim: () => App.todo().claim.length,
    today: () => App.daySessions(App.TODAY).length,
    unassigned: () => App.CASES.filter(c => c.status === 'active' && !c.owner).length,
  };
  App.registerCount = (name, fn) => { counters[name] = fn; renderCounts(); };
  function renderCounts(root = document) {
    $$('[data-count]', root).forEach(el => {
      const fn = counters[el.dataset.count];
      if (!fn) return;
      const v = String(fn());
      if (el.textContent !== v) {
        el.textContent = v;
        if (el.dataset.countReady && !App.calm()) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
      }
      el.dataset.countReady = '1';
    });
  }
  App.emit = reason => {
    renderCounts();
    renderNotifs();
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
    'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m6 15 6-6 6 6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11"/><path d="M7.5 3.5c0 4.6 9 4.8 9 8.5s-9 3.9-9 8.5M16.5 3.5c0 4.6-9 4.8-9 8.5s9 3.9 9 8.5"/>',
    'map-pin': '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    map: '<path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5L3.5 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
    users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.6c2 .6 3.2 2.3 3.6 4.9"/>',
    'user-check': '<circle cx="10" cy="8" r="3.6"/><path d="M3.5 19.5c.7-3.6 3.4-5.6 6.5-5.6 1.4 0 2.7.4 3.8 1.1"/><path d="m15 17.5 2 2 4-4.5"/>',
    'user-plus': '<circle cx="10" cy="8" r="3.6"/><path d="M3.5 19.5c.7-3.6 3.4-5.6 6.5-5.6s5.8 2 6.5 5.6M18.5 6v6M15.5 9h6"/>',
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
    'trend-up': '<path d="M3.5 17 9 11.5l4 4L20.5 8"/><path d="M15 8h5.5v5.5"/>',
    pie: '<path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5z"/><path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15z"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    message: '<path d="M4 5.5h16v11H9l-5 4z"/>',
    send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
    inbox: '<path d="M3.5 13.5 6 5.5h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>',
    login: '<path d="M14 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4M10 8l4 4-4 4M14 12H4"/>',
    logout: '<path d="M10 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
    flag: '<path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    match: '<circle cx="5.5" cy="16.5" r="2.5"/><circle cx="18.5" cy="16.5" r="2.5"/><path d="M7 14.5C8.5 8 15.5 8 17 14.5"/><path d="M12 9.6v.1"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2M9 9.5v.5M15 9.5v.5"/>',
    home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5v10h12v-10"/><path d="M10 19.5v-5h4v5"/>',
    swap: '<path d="M7 4.5 4 7.5l3 3M4 7.5h12M17 13.5l3 3-3 3M20 16.5H8"/>',
    database: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
    layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    'text-size': '<path d="M2.8 18.5 7.6 5.5h1.3l4.8 13M4.5 14.2h7.5"/><path d="M14.2 18.5l3.2-8.5h1l3.2 8.5M15.3 15.6h5"/>',
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
  App.avatar = (p, size = 'md') => `<span class="avatar avatar--${size}" style="--av:${p.color}" aria-hidden="true">${App.esc(p.name.charAt(0))}</span>`;
  App.statusBadge = (tone, text) => `<span class="status" data-tone="${tone}">${App.esc(text)}</span>`;
  App.stageBadge = c => {
    if (c.status !== 'active') return App.statusBadge(c.status === 'withdrawn' ? 'neutral' : 'err', App.EXITS[c.status]);
    const s = App.stage(c.stage);
    return App.statusBadge(s.tone, s.label);
  };
  App.topicTag = id => { const t = App.topic(id); return `<span class="tag">${App.icon(t.icon)}${App.esc(t.short)}</span>`; };
  App.audienceTag = id => `<span class="tag tag--plain">${App.esc(App.audience(id).name)}</span>`;
  App.caseLink = (c, label) => `<a class="cell-id" href="application.html?id=${c.id}">${label ? App.esc(label) : c.id}</a>`;
  App.lecturerLink = l => `<a href="instructors.html?id=${l.id}">${App.esc(l.name)}</a>`;
  App.score = v => (v == null ? '<span class="subtle">尚無紀錄</span>' : `<span class="score${v < 4.5 ? ' score--low' : ''}"><span class="score__bar" aria-hidden="true"><span style="--p:${((v - 3) / 2).toFixed(3)}"></span></span>${v.toFixed(2)}</span>`);
  App.sparkline = (values, o = {}) => {
    const w = o.w || 120, h = o.h || 30;
    const min = Math.min(...values), max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [i / (values.length - 1) * w, h - 3 - (v - min) / span * (h - 8)]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return `<svg class="spark${o.tone === 'clay' ? ' spark--clay' : ''}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="spark__area" d="${line}L${w} ${h}L0 ${h}Z"/><path class="spark__line" d="${line}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/><circle class="spark__end" cx="${last[0]}" cy="${last[1]}" r="2.6"/></svg>`;
  };
  App.emptyState = ({ title, text, action } = {}) => `<div class="empty">
  <svg class="empty__art" viewBox="0 0 120 96" aria-hidden="true"><ellipse cx="60" cy="84" rx="44" ry="7" class="ill-fill-sprout"/><path d="M60 82V52" fill="none" stroke="#1F5D4A" stroke-width="2.4" stroke-linecap="round"/><path d="M60 58c-2-12-11-19-24-18 1 12 10 19 24 18z" class="ill-fill-sprout-strong" stroke="#1F5D4A" stroke-width="2.2" stroke-linejoin="round"/><path d="M60 52c2-10 10-16 21-15-1 10-9 16-21 15z" class="ill-fill-paper" stroke="#1F5D4A" stroke-width="2.2" stroke-linejoin="round"/><circle cx="88" cy="22" r="4" fill="none" stroke="#C8743C" stroke-width="2"/><path d="M26 30l4 4M30 30l-4 4" stroke="#C8743C" stroke-width="2" stroke-linecap="round"/></svg>
  <p class="empty__title">${App.esc(title || '沒有符合的資料')}</p>
  <p class="empty__text">${App.esc(text || '試著放寬篩選條件，或改用其他關鍵字。')}</p>
  ${action ? `<${action.href ? `a href="${action.href}"` : 'button type="button"'} class="btn btn--sm"${action.id ? ` id="${action.id}"` : ''}>${App.esc(action.label)}</${action.href ? 'a' : 'button'}>` : ''}
</div>`;
  App.timeline = entries => `<ol class="timeline">${entries.map((e, i) => `<li class="tl-item ${e.tone === 'warn' ? 'is-warn' : e.tone === 'err' ? 'is-err' : i === 0 ? 'is-current' : 'is-done'}"><span class="tl-item__node">${App.icon(e.tone === 'err' ? 'alert' : e.tone === 'warn' ? 'swap' : i === 0 ? 'sprout' : 'check')}</span><div class="tl-item__body"><p class="tl-item__title">${App.esc(e.title)}</p><p class="tl-item__meta">${App.fmt.roc(e.iso)} ${e.time}・${App.esc(e.by)}</p>${e.note ? `<p class="tl-item__note">${App.esc(e.note)}</p>` : ''}</div></li>`).join('')}</ol>`;
  App.checkRows = checks => `<ul class="checks">${checks.map(k => `<li class="check-row" data-result="${k.result}"><span class="check-row__icon">${App.icon(k.result === 'pass' ? 'check' : k.result === 'warn' ? 'alert' : 'x')}</span><div><p class="check-row__label">${App.esc(k.label)}</p><p class="check-row__detail">${App.esc(k.detail)}</p></div>${App.statusBadge(k.result === 'pass' ? 'ok' : k.result === 'warn' ? 'warn' : 'err', k.result === 'pass' ? '通過' : k.result === 'warn' ? '警示' : '不符')}</li>`).join('')}</ul>`;

  /* ===================================================================
     Toast / Dialog / Modal / Popover
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
      setTimeout(() => t.remove(), App.calm() ? 0 : 220);
    };
    t.querySelector('.toast__close').addEventListener('click', close);
    if (o.action) t.querySelector('.toast__action').addEventListener('click', () => { o.action.onClick(); close(); });
    // 高齡模式給較長的閱讀時間
    timer = setTimeout(close, (o.duration || (o.action ? 6500 : 4200)) * (App.senior.on() ? 1.6 : 1));
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
      d.addEventListener('cancel', e => { e.preventDefault(); App.closeDialog(d); });
    }
    d.showModal();
    placeToastHost();
  };
  App.closeDialog = d => {
    if (!d.open || d.classList.contains('is-closing')) return;
    if (App.calm()) { d.close(); return; }
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
    <button type="button" class="icon-btn modal__close">${App.icon('x')}<span class="icon-btn__label">關閉</span></button>
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
      if (a.onClick && a.onClick(close, d) === false) return;
      if (!a.keepOpen) close();
    }));
    d.addEventListener('close', () => { if (o.onClose) o.onClose(); setTimeout(() => d.remove(), 0); });
    App.openDialog(d);
    return { el: d, close };
  };

  const openPops = new Set();
  App.popover = (btn, panel, o = {}) => {
    const api = {
      open() {
        openPops.forEach(p => { if (p !== api) p.close(); });
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        openPops.add(api);
        if (o.onOpen) o.onOpen();
      },
      close(focusBack) {
        if (panel.hidden) return;
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        openPops.delete(api);
        if (o.onClose) o.onClose();
        if (focusBack) btn.focus();
      },
      toggle() { if (panel.hidden) api.open(); else api.close(); },
      contains: el => btn.contains(el) || panel.contains(el) || (o.within && o.within.contains(el)),
    };
    btn.addEventListener('click', e => { e.stopPropagation(); api.toggle(); });
    return api;
  };
  document.addEventListener('click', e => { openPops.forEach(p => { if (!p.contains(e.target)) p.close(); }); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !openPops.size) return;
    openPops.forEach(p => p.close(true));
  });

  /* ===================================================================
     Tabs / Seg / Pager / 排序 / 驗證 / CSV
     =================================================================== */
  App.tabs = (list, o = {}) => {
    const tabs = $$('[role="tab"]', list);
    const ids = tabs.map(t => t.getAttribute('aria-controls'));
    const shared = new Set(ids.filter((id, i) => id && ids.indexOf(id) !== i));
    let ink = list.querySelector('.tabs__ink');
    if (!ink && list.classList.contains('tabs') && !list.classList.contains('tabs--pill')) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    const moveInk = tab => { if (ink && tab) { ink.style.width = tab.offsetWidth + 'px'; ink.style.transform = `translateX(${tab.offsetLeft}px)`; } };
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        // 多個分頁共用同一個 panel（內容由 onChange 重繪）時不切換 hidden
        if (p && !shared.has(p.id)) p.hidden = !on;
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
    const set = v => { btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v))); };
    btns.forEach(b => b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return;
      set(b.dataset.value);
      if (o.onChange) o.onChange(b.dataset.value, b);
    }));
    return { value: () => { const on = btns.find(b => b.getAttribute('aria-pressed') === 'true'); return on ? on.dataset.value : undefined; }, set };
  };

  App.pager = (host, o) => {
    let page = o.page || 1, total = o.total;
    const size = o.size || 20;
    const render = () => {
      const pages = Math.max(1, Math.ceil(total / size));
      page = clamp(page, 1, pages);
      const nums = [];
      for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
      const parts = [];
      nums.forEach((p, i) => { if (i && p - nums[i - 1] > 1) parts.push('<span class="pager__gap" aria-hidden="true">…</span>'); parts.push(`<button type="button" class="pager__btn${p === page ? ' is-current' : ''}" data-page="${p}"${p === page ? ' aria-current="page"' : ''} aria-label="第 ${p} 頁">${p}</button>`); });
      const from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
      host.innerHTML = `<nav class="pager" aria-label="分頁"><span class="pager__info">第 ${from}–${to} 筆，共 ${App.fmt.num(total)} 筆</span><button type="button" class="pager__btn" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''}>${App.icon('chevron-left')}<span class="icon-btn__label">上一頁</span></button>${parts.join('')}<button type="button" class="pager__btn" data-page="${page + 1}"${page >= pages ? ' disabled' : ''}><span class="icon-btn__label">下一頁</span>${App.icon('chevron-right')}</button></nav>`;
    };
    host.addEventListener('click', e => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      page = Number(b.dataset.page);
      render();
      o.onChange(page);
    });
    render();
    return { set(p, t) { page = p; if (t != null) total = t; render(); }, page: () => page };
  };

  App.bindSort = (table, o) => {
    $$('th[data-sort]', table).forEach(th => {
      if (!th.querySelector('.th-sort')) th.innerHTML = `<button type="button" class="th-sort">${th.innerHTML}${App.icon('arrow-up')}</button>`;
      th.querySelector('.th-sort').addEventListener('click', () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        $$('th[aria-sort]', table).forEach(x => x.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', dir);
        o.onSort(th.dataset.sort, dir === 'ascending' ? 1 : -1);
      });
    });
  };

  App.validate = form => {
    const fields = $$('input, select, textarea', form).filter(el => !el.disabled && el.type !== 'hidden' && el.willValidate);
    const errors = [];
    fields.forEach(el => {
      const field = el.closest('.field');
      let msg = '';
      if (!el.checkValidity()) {
        const v = el.validity;
        msg = el.dataset.error || (v.valueMissing ? '此欄位為必填' : v.typeMismatch ? '格式不正確' : v.patternMismatch ? (el.title || '格式不正確') : v.rangeUnderflow ? `不可小於 ${el.min}` : v.rangeOverflow ? `不可大於 ${el.max}` : v.tooShort ? `至少 ${el.minLength} 個字` : '請確認此欄位');
      }
      if (field) {
        field.classList.toggle('is-invalid', !!msg);
        let err = field.querySelector('.field__error');
        if (msg && !err) { err = document.createElement('p'); err.className = 'field__error'; field.appendChild(err); }
        if (err) err.innerHTML = msg ? `${App.icon('alert')}${App.esc(msg)}` : '';
        el.setAttribute('aria-invalid', String(!!msg));
        if (err && msg) { err.id = err.id || `${el.id || el.name}-err`; el.setAttribute('aria-describedby', err.id); }
      }
      if (msg) errors.push({ el, msg, label: field ? (field.querySelector('.label') || {}).textContent : el.name });
    });
    const alert = $('.form-alert', form);
    if (alert) {
      alert.classList.toggle('is-on', errors.length > 0);
      alert.innerHTML = errors.length ? `${App.icon('alert')}<div>有 ${errors.length} 個欄位需要修正<ul>${errors.map(e => `<li>${App.esc((e.label || '').replace(/\s*\*$/, ''))}：${App.esc(e.msg)}</li>`).join('')}</ul></div>` : '';
    }
    if (errors.length) errors[0].el.focus();
    return errors.length === 0;
  };

  App.downloadCSV = (filename, rows) => {
    const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ===================================================================
     高齡友善模式
     =================================================================== */
  const SENIOR_KEY = 'envedu.mis.senior';
  App.senior = {
    on: () => document.documentElement.classList.contains('is-senior'),
    set(v) {
      document.documentElement.classList.toggle('is-senior', v);
      localStorage.setItem(SENIOR_KEY, v ? '1' : '0');
      syncSeniorButtons();
      document.dispatchEvent(new CustomEvent('app:mode', { detail: { senior: v } }));
    },
    toggle() { App.senior.set(!App.senior.on()); },
  };
  App.onMode = fn => document.addEventListener('app:mode', e => fn(e.detail.senior));
  App.calm = () => App.reducedMotion() || App.senior.on();
  function syncSeniorButtons() {
    const on = App.senior.on();
    $$('[data-senior-toggle]').forEach(b => {
      b.setAttribute('aria-pressed', String(on));
      const st = b.querySelector('.senior-toggle__state');
      if (st) st.textContent = on ? '開' : '關';
    });
  }

  // 表格次要欄位：高齡模式下收進「詳細」可展開列（一般模式由 CSS 隱藏這些輔助元素）
  function enhanceTable(table) {
    const head = table.tHead && table.tHead.rows[0];
    if (!head || !head.querySelector('.col-2nd')) return;
    if (!head.querySelector('.col-more')) head.insertAdjacentHTML('beforeend', '<th class="col-more" scope="col">詳細</th>');
    $$(':scope > tbody > tr', table).forEach(tr => {
      if (tr.classList.contains('row-more') || tr.querySelector(':scope > .col-more') || !tr.querySelector(':scope > .col-2nd')) return;
      tr.insertAdjacentHTML('beforeend', `<td class="col-more"><button type="button" class="more-btn" aria-expanded="false">${App.icon('chevron-down')}詳細</button></td>`);
    });
  }
  let tableTick = 0;
  const scanTables = () => { tableTick = 0; $$('table.table').forEach(enhanceTable); };
  document.addEventListener('click', e => {
    const btn = e.target.closest('.more-btn');
    if (!btn) return;
    const tr = btn.closest('tr');
    const table = tr.closest('table');
    let more = tr.nextElementSibling && tr.nextElementSibling.classList.contains('row-more') ? tr.nextElementSibling : null;
    const open = btn.getAttribute('aria-expanded') !== 'true';
    if (!more) {
      const heads = Array.from(table.tHead.rows[0].cells);
      const items = Array.from(tr.cells).map((td, i) => (td.classList.contains('col-2nd') ? `<div><dt>${App.esc(heads[i] ? heads[i].textContent.trim() : '')}</dt><dd>${td.innerHTML}</dd></div>` : '')).join('');
      tr.insertAdjacentHTML('afterend', `<tr class="row-more"><td colspan="${tr.cells.length}"><dl class="more-list">${items}</dl></td></tr>`);
      more = tr.nextElementSibling;
    }
    more.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.lastChild.textContent = open ? '收合' : '詳細';
  });

  /* ===================================================================
     Reveal / 可見性 / 動畫工具
     =================================================================== */
  let revealIO = null;
  const inViewport = el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; };
  App.reveal = (root = document) => {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (App.calm() || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    if (!revealIO) {
      // 不設底部負 rootMargin：首屏底部的元素也要能立刻觸發
      revealIO = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); }
      }), { threshold: 0 });
    }
    els.forEach(el => {
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
    if (App.calm()) { el.textContent = format(to); return; }
    if (el._cuRunning) return; // 進行中的動畫會在每一幀讀取最新目標
    el._cuRunning = true;
    const from = Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    const dur = o.dur || 1200;
    let t0 = 0;
    const step = now => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = format(from + (el._cuTarget - from) * easeOut(p));
      if (p < 1) requestAnimationFrame(step);
      else { el.textContent = format(el._cuTarget); el._cuRunning = false; }
    };
    requestAnimationFrame(step);
  };

  // 滾動數字：每位數一條 0–9 的直條，以 transform 捲到目標
  App.odometer = (el, value, o = {}) => {
    el._odoTarget = value;
    el._odoDecimals = o.decimals || 0;
    if (App.calm()) { el._odoShape = null; el.textContent = App.fmt.num(value, el._odoDecimals); return; }
    if (el._odoRaf) return;
    el._odoRaf = requestAnimationFrame(() => {
      el._odoRaf = 0;
      // 執行當下才讀最新目標，連續快速呼叫只會套用最後一次
      const str = App.fmt.num(el._odoTarget, el._odoDecimals);
      const shape = str.replace(/\d/g, '0');
      if (el._odoShape !== shape || !el.querySelector('.odo')) {
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
     招牌動態 1：案件流程管線
     節點以 HTML 排版（桌機橫排、窄螢幕直排），管線與種子以 SVG 依節點實際位置繪製，
     種子沿管線流動，在瓶頸關卡前減速堆積並轉為陶土色。
     =================================================================== */
  App.pipeline = (host, o) => {
    let stages = o.stages, bottleneck = o.bottleneck, metric = o.metric || 'days', selected = o.selected || bottleneck;
    const root = host.closest('.pipeline') || host;
    host.innerHTML = `<div class="pipe">
  <svg class="pipe__fx" aria-hidden="true" focusable="false"><path class="pipe__track" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path class="pipe__track-hi" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 10"/><g class="pipe__seeds"></g></svg>
  <ol class="pipe__nodes" aria-label="案件流程 ${stages.length} 個關卡"></ol>
</div>`;
    const pipe = host.firstElementChild;
    const fx = pipe.querySelector('.pipe__fx');
    const track = fx.querySelector('.pipe__track');
    const trackHi = fx.querySelector('.pipe__track-hi');
    const seedsG = fx.querySelector('.pipe__seeds');
    const list = pipe.querySelector('.pipe__nodes');

    const metaText = s => {
      const short = App.senior.on();
      if (metric === 'sla') return s.sla == null ? (s.key === 'scheduled' ? (short ? '前 7 日通知' : '活動前 7 日通知') : '—') : `時限 ${s.sla} 天`;
      if (s.key === 'scheduled') return s.count ? `${short ? '' : '平均 '}${Math.round(s.avgDays)} 天後` : '—';
      if (s.key === 'closed') return short ? '年度累計' : '本年度累計';
      return s.count ? `${short ? '停留' : '平均停留'} ${s.avgDays} 天` : '目前無案件';
    };
    // 節點只建一次；資料更新時 paint() 原地更新，計數器從舊值滾到新值
    function build() {
      list.innerHTML = stages.map((s, i) => `<li class="pipe__node${i === stages.length - 1 ? ' is-final' : ''}" data-key="${s.key}">
  <button type="button" class="pipe__btn" aria-pressed="false">
    <span class="pipe__dot">${App.icon(s.icon)}</span>
    <span class="pipe__count" data-odo>0</span>
    <span class="pipe__label">${s.label}<span class="pipe__hot">${App.icon('alert')}瓶頸</span></span>
    <span class="pipe__sub"><span class="pipe__meta"></span>${s.sla != null ? '<span class="pipe__late"></span>' : ''}</span>
  </button>
</li>`).join('');
    }
    function paint() {
      $$('.pipe__node', list).forEach((li, i) => {
        const s = stages[i];
        li.classList.toggle('is-bottleneck', s.key === bottleneck);
        const btn = li.firstElementChild;
        btn.setAttribute('aria-pressed', String(s.key === selected));
        btn.setAttribute('aria-label', `${s.label}：${s.count} 件${s.late ? `，${s.late} 件超過時限` : ''}${s.key === bottleneck ? '，目前瓶頸' : ''}`);
        li.querySelector('.pipe__meta').textContent = metaText(s);
        const late = li.querySelector('.pipe__late');
        if (late) { late.textContent = s.late ? `逾時 ${s.late}` : '無逾時'; late.classList.toggle('pipe__late--none', !s.late); }
        if (counted) App.odometer(li.querySelector('[data-odo]'), s.count);
      });
    }
    let counted = false;
    build();
    paint();
    App.whenVisible(pipe, () => { counted = true; paint(); });

    list.addEventListener('click', e => {
      const btn = e.target.closest('.pipe__btn');
      if (!btn) return;
      api.select(btn.parentElement.dataset.key);
    });

    // ---- 幾何：節點中心 → 折線 ----
    let pts = [], segs = [], L = 0, sB = 0, vertical = false;
    function measure() {
      const pr = pipe.getBoundingClientRect();
      fx.setAttribute('viewBox', `0 0 ${Math.round(pr.width)} ${Math.round(pr.height)}`);
      pts = $$('.pipe__dot', list).map(d => { const r = d.getBoundingClientRect(); return [r.left - pr.left + r.width / 2, r.top - pr.top + r.height / 2]; });
      if (!pts.length) return;
      vertical = pts.length > 1 && Math.abs(pts[1][0] - pts[0][0]) < 4;
      segs = []; L = 0;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const len = Math.hypot(x1 - x0, y1 - y0);
        segs.push({ x0, y0, x1, y1, len, s0: L, a: Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI });
        L += len;
      }
      const bi = stages.findIndex(s => s.key === bottleneck);
      sB = bi > 0 ? segs[bi - 1].s0 + segs[bi - 1].len : 0;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      track.setAttribute('d', d);
      trackHi.setAttribute('d', d);
      placeSeeds();
    }
    const at = s => {
      const sg = segs.find(g => s <= g.s0 + g.len) || segs[segs.length - 1];
      const t = clamp((s - sg.s0) / sg.len, 0, 1);
      return [sg.x0 + (sg.x1 - sg.x0) * t, sg.y0 + (sg.y1 - sg.y0) * t, sg.a];
    };

    // ---- 種子 ----
    const N = 26;
    const seeds = Array.from({ length: N }, (_, i) => ({ s: 0, v: .055 + (i % 5) * .006, el: null }));
    seedsG.innerHTML = seeds.map(() => '<ellipse class="pipe__seed" rx="6" ry="3.4"/>').join('');
    $$('ellipse', seedsG).forEach((el, i) => { seeds[i].el = el; });
    function placeSeeds() {
      // 初始／靜態分布：均勻撒在管線上，瓶頸前多放幾顆表現堆積
      seeds.forEach((sd, i) => {
        sd.s = i < 6 && sB ? Math.max(0, sB - 14 - i * 11) : (i - 6 + .5) / (N - 6) * L;
      });
      draw();
    }
    const slow = s => (sB && s > sB - 70 && s < sB + 4 ? .2 : 1);
    function draw() {
      if (!segs.length) return;
      seeds.forEach(sd => {
        const [x, y, a] = at(sd.s);
        const fade = Math.min(1, sd.s / 30, (L - sd.s) / 30);
        const queued = sB && sd.s > sB - 70 && sd.s < sB + 4;
        sd.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(0)})`);
        sd.el.setAttribute('opacity', Math.max(0, fade).toFixed(2));
        sd.el.classList.toggle('pipe__seed--late', !!queued);
      });
    }
    const loop = App.loop(root, dt => {
      seeds.forEach((sd, i) => {
        sd.s += sd.v * dt * slow(sd.s);
        // 堆積時保持間距，不讓種子疊成一顆
        const ahead = seeds.filter(o2 => o2 !== sd && o2.s > sd.s && o2.s - sd.s < 9);
        if (ahead.length && slow(sd.s) < 1) sd.s -= sd.v * dt * .2;
        if (sd.s > L) sd.s = -(i % 4) * 14;
      });
      draw();
    });
    const startStop = () => { if (App.calm()) { loop.stop(); placeSeeds(); } else loop.start(); };

    new ResizeObserver(() => measure()).observe(pipe);
    App.onMode(() => { paint(); requestAnimationFrame(() => { measure(); startStop(); }); });
    measure();
    startStop();

    const api = {
      select(key) {
        selected = key;
        $$('.pipe__btn', list).forEach(b => b.setAttribute('aria-pressed', String(b.parentElement.dataset.key === key)));
        if (o.onSelect) o.onSelect(key);
      },
      setMetric(m) { metric = m; paint(); },
      update(next, nextBottleneck) {
        stages = next;
        bottleneck = nextBottleneck || bottleneck;
        paint();
        measure();
      },
    };
    return api;
  };

  /* ===================================================================
     招牌動態 2：條件漏斗（媒合頁）
     每一列是一個條件，列中的種子＝仍符合的講師；條件逐條套用時，被篩掉的種子轉陶土色落下，
     長條寬度收斂到剩下的人數。calm 時直接畫出最終結果。
     =================================================================== */
  App.funnel = (host, o) => {
    let timers = [];
    const nameOf = o.nameOf || (id => (App.lecturer(id) || { name: id }).name);
    function play(steps) {
      timers.forEach(clearTimeout);
      timers = [];
      const max = steps[0].ids.length || 1;
      host.innerHTML = `<div class="funnel" role="list">${steps.map((s, i) => {
        const prev = i ? steps[i - 1].ids : s.ids;
        const drop = prev.length - s.ids.length;
        return `<div class="funnel__row" role="listitem" data-i="${i}">
  <p class="funnel__label">${i ? `${i}. ` : ''}${App.esc(s.label)}<span class="funnel__note">${App.esc(s.note || '')}</span></p>
  <div class="funnel__bar" style="--w:${(prev.length / max).toFixed(3)}">${prev.map(id => `<span class="funnel__seed" data-id="${id}" title="${App.esc(nameOf(id))}"></span>`).join('')}</div>
  <p class="funnel__count"><span data-odo>${prev.length}</span><span class="sr-only"> 位</span>${i ? `<span class="funnel__drop">${drop ? `−${drop}` : '±0'}</span>` : ''}</p>
</div>`;
      }).join('')}</div>`;
      const rows = $$('.funnel__row', host);
      const applyRow = (i, instant) => {
        const row = rows[i];
        const keep = new Set(steps[i].ids);
        row.classList.add('is-on');
        row.querySelector('.funnel__bar').style.setProperty('--w', Math.max(.06, keep.size / max).toFixed(3));
        $$('.funnel__seed', row).forEach(sd => {
          if (keep.has(sd.dataset.id)) return;
          if (instant) sd.remove();
          else { sd.classList.add('is-out'); setTimeout(() => sd.remove(), 520); }
        });
        const n = row.querySelector('[data-odo]');
        if (instant) n.textContent = keep.size; else App.countUp(n, keep.size, { dur: 600 });
      };
      if (App.calm()) { rows.forEach((r, i) => applyRow(i, true)); if (o.onDone) o.onDone(); return; }
      rows.forEach((r, i) => timers.push(setTimeout(() => applyRow(i, false), 160 + i * 560)));
      if (o.onDone) timers.push(setTimeout(o.onDone, 160 + rows.length * 560));
    }
    if (o.steps) play(o.steps);
    return { play };
  };

  /* ===================================================================
     縣市方塊地圖
     =================================================================== */
  App.tileMap = (host, opts = {}) => {
    const o = Object.assign({ mode: 'static', values: {}, showValue: true, unit: '', multi: false, selected: [], label: '臺灣 22 縣市方塊地圖', theme: 'forest', compact: false }, opts);
    const interactive = o.mode === 'select';
    const fmt = v => (o.format || App.fmt.num)(v);
    const root = document.createElement('div');
    root.className = `tilemap${o.theme === 'clay' ? ' tilemap--clay' : ''}${o.compact ? ' tilemap--compact' : ''}`;
    const grid = document.createElement('div');
    grid.className = 'tilemap__grid';
    grid.setAttribute('role', interactive ? 'group' : 'list');
    grid.setAttribute('aria-label', o.label);
    const tiles = {};
    App.COUNTIES.forEach(c => {
      const t = document.createElement(interactive ? 'button' : 'div');
      if (interactive) { t.type = 'button'; t.setAttribute('aria-pressed', 'false'); } else t.setAttribute('role', 'listitem');
      t.className = 'tm-tile' + (c.island ? ' is-island' : '');
      t.style.gridColumn = c.col;
      t.style.gridRow = c.row;
      t.dataset.id = c.id;
      t.dataset.level = '0';
      t.innerHTML = `<span class="tm-tile__name" aria-hidden="true">${c.short}</span><span class="tm-tile__val" aria-hidden="true"></span><span class="sr-only"></span>`;
      grid.appendChild(t);
      tiles[c.id] = t;
    });
    root.appendChild(grid);
    host.innerHTML = '';
    host.appendChild(root);
    let values = o.values;
    const levelOf = (v, max) => (v > 0 ? Math.max(1, Math.ceil(v / max * 5)) : 0);
    function paint() {
      const max = Math.max(...Object.values(values), 0) || 1;
      App.COUNTIES.forEach(c => {
        const t = tiles[c.id];
        const v = values[c.id] || 0;
        t.dataset.level = String(levelOf(v, max));
        t.querySelector('.tm-tile__val').textContent = o.showValue ? fmt(v) : '';
        t.querySelector('.sr-only').textContent = `${c.name} ${fmt(v)} ${o.unit}`;
        t.title = `${c.name}：${fmt(v)} ${o.unit}`;
      });
    }
    let selected = new Set(o.selected);
    function syncSel() {
      Object.entries(tiles).forEach(([id, t]) => {
        const on = selected.has(id);
        t.classList.toggle('is-selected', on);
        if (interactive) t.setAttribute('aria-pressed', String(on));
      });
    }
    paint();
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
    return {
      el: root,
      setValues(v, unit) { values = v; if (unit != null) o.unit = unit; paint(); },
      setFormat(f) { o.format = f; },
      select(ids) { selected = new Set(ids); syncSel(); },
      getSelected: () => [...selected],
    };
  };
  App.tileLegend = (theme = 'forest') => `<div class="tm-legend"><span>少</span><span class="tm-legend__ramp tilemap${theme === 'clay' ? ' tilemap--clay' : ''}" aria-hidden="true">${[1, 2, 3, 4, 5].map(l => `<span class="tm-tile" data-level="${l}" style="width:22px;height:12px;border-radius:3px;border:0"></span>`).join('')}</span><span>多</span></div>`;

  /* ===================================================================
     圖表（單一色相為主；hover 提示＋螢幕報讀用表格）
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
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => n <= s) * p;
  }
  function srTable(caption, rows, unit) {
    // 表格不吃 width／overflow，sr-only 要套在外層 div 上，否則手機會被撐出水平捲動
    return `<div class="sr-only"><table><caption>${App.esc(caption)}</caption><tbody>${rows.map(r => `<tr><th scope="row">${App.esc(r.label)}</th><td>${r.value}${App.esc(unit || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const chartFs = () => (App.senior.on() ? 16 : 13);
  // 圖表以容器實際寬度作為 viewBox 寬，文字才不會隨縮放變小；寬度或模式改變時重繪
  function responsive(host, draw) {
    let w = 0, shown = App.calm();
    const run = force => {
      const nw = Math.round(host.clientWidth) || 640;
      if (!force && Math.abs(nw - w) < 2) return;
      w = nw;
      const wrap = draw(Math.max(260, w));
      if (shown) wrap.classList.remove('is-waiting');
      else App.whenVisible(wrap, () => { shown = true; wrap.classList.remove('is-waiting'); });
    };
    run();
    new ResizeObserver(() => run()).observe(host);
    App.onMode(() => run(true));
    return host.firstElementChild;
  }

  App.barChart = (host, o) => responsive(host, W => drawBars(host, o, W));
  function drawBars(host, o, W) {
    const data = o.data;
    const fs = chartFs();
    const fmt = o.format || (v => App.fmt.num(v));
    const H = (o.height || 240) + (fs - 13) * 3;
    const maxV = Math.max(...data.map(d => d.value));
    const max = niceMax(maxV * 1.08);
    const P = { t: fs + 16, r: 8, b: fs + 22, l: Math.max(34, fmt(max).length * fs * .62 + 12) };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const band = iw / data.length, bw = Math.min(46, band * .6);
    const hl = o.highlight ?? data.length - 1;
    // 標籤太擠時隔一個顯示
    const every = band < fs * 3 ? 2 : 1;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = max / 4 * i, y = P.t + ih - ih * i / 4;
      grid += `<line class="${i ? 'chart__grid' : 'chart__base'}" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke-width="1"/><text class="chart__label" x="${P.l - 8}" y="${y + fs * .35}" text-anchor="end">${fmt(v)}</text>`;
    }
    const bars = data.map((d, i) => {
      const h = ih * d.value / max, x = P.l + band * i + (band - bw) / 2, y = P.t + ih - h, r = Math.min(4, h);
      const path = `M${x} ${P.t + ih}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${P.t + ih}Z`;
      const label = i === hl || d.value === maxV ? `<text class="chart__value" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${fmt(d.value)}</text>` : '';
      return `<rect class="chart__bar-hit" x="${P.l + band * i}" y="${P.t}" width="${band}" height="${ih}" data-i="${i}"/><path class="chart__bar${o.tone === 'clay' ? ' chart__bar--clay' : ''}${i === hl ? ' is-hl' : ''}" d="${path}" style="--i:${i}"/>${label}` +
        (i % every === 0 || i === data.length - 1 ? `<text class="chart__label" x="${P.l + band * i + band / 2}" y="${H - 10}" text-anchor="middle">${App.esc(d.label)}</text>` : '');
    }).join('');
    host.innerHTML = `<div class="chart${App.calm() ? '' : ' is-waiting'}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${App.esc(o.title || '長條圖')}">${grid}${bars}</svg>${srTable(o.title || '', data, o.unit)}</div>`;
    const wrap = host.firstElementChild;
    const tip = chartTip(wrap);
    $$('.chart__bar-hit', wrap).forEach(hit => {
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
    const labels = o.labels, series = o.series;
    const fs = chartFs();
    const all = series.flatMap(s => s.values);
    const dec = o.decimals ?? 0;
    const min = o.min ?? 0, max = o.max ?? niceMax(Math.max(...all) * 1.1);
    const H = (o.height || 240) + (fs - 13) * 3;
    const P = { t: fs + 16, r: 20, b: fs + 22, l: Math.max(36, App.fmt.num(max, dec).length * fs * .62 + 12) };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const X = i => P.l + (labels.length === 1 ? iw / 2 : iw * i / (labels.length - 1));
    const Y = v => P.t + ih - ih * (v - min) / (max - min);
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * i / 4, y = Y(v);
      grid += `<line class="${i ? 'chart__grid' : 'chart__base'}" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke-width="1"/><text class="chart__label" x="${P.l - 8}" y="${y + fs * .35}" text-anchor="end">${App.fmt.num(v, dec)}</text>`;
    }
    const every = iw / labels.length < fs * 3 ? 2 : 1;
    const lines = series.map((s, k) => {
      const pts = s.values.map((v, i) => [X(i), Y(v)]);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
      const area = k === 0 ? `<path class="chart__area" d="${line}L${pts[pts.length - 1][0]} ${P.t + ih}L${pts[0][0]} ${P.t + ih}Z"/>` : '';
      const last = pts[pts.length - 1];
      return `${area}<path class="chart__line${s.tone === 'clay' ? ' chart__line--2' : ''}" d="${line}" stroke-width="2.5" pathLength="1"/>${pts.map(p => `<circle class="chart__pt" cx="${p[0]}" cy="${p[1]}" r="4" stroke-width="2.5"${s.tone === 'clay' ? ' style="stroke:var(--clay)"' : ''}/>`).join('')}<text class="chart__value" x="${last[0]}" y="${k ? last[1] + fs + 8 : last[1] - 12}" text-anchor="end">${App.fmt.num(s.values[s.values.length - 1], dec)}</text>`;
    }).join('');
    host.innerHTML = `<div class="chart${App.calm() ? '' : ' is-waiting'}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${App.esc(o.title || '折線圖')}">${grid}${lines}
${labels.map((l, i) => (i % every === 0 || i === labels.length - 1 ? `<text class="chart__label" x="${X(i)}" y="${H - 10}" text-anchor="middle">${App.esc(l)}</text>` : '')).join('')}
<line class="chart__cross" x1="0" x2="0" y1="${P.t}" y2="${P.t + ih}" stroke-width="1" stroke-dasharray="3 3" style="opacity:0"/>
<rect class="chart__bar-hit" x="${P.l}" y="${P.t}" width="${iw}" height="${ih}"/>
</svg>${srTable(o.title || '', labels.map((l, i) => ({ label: l, value: series.map(s => `${s.name} ${s.values[i]}`).join('、') })), o.unit)}</div>`;
    const wrap = host.firstElementChild;
    const svg = $('svg', wrap);
    const cross = $('.chart__cross', wrap);
    const tip = chartTip(wrap);
    const hit = $('.chart__bar-hit', wrap);
    hit.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect();
      const sx = (e.clientX - r.left) / r.width * W;
      const i = clamp(Math.round((sx - P.l) / (iw / Math.max(1, labels.length - 1))), 0, labels.length - 1);
      cross.setAttribute('x1', X(i));
      cross.setAttribute('x2', X(i));
      cross.style.opacity = '1';
      const wb = wrap.getBoundingClientRect();
      tip.show(`${App.esc(labels[i])}　${series.map(s => `${App.esc(s.name)} <b>${App.fmt.num(s.values[i], dec)}</b>`).join('　')} ${App.esc(o.unit || '')}`, r.left - wb.left + X(i) / W * r.width, r.top - wb.top + Y(Math.max(...series.map(s => s.values[i]))) / H * r.height);
    });
    hit.addEventListener('mouseleave', () => { cross.style.opacity = '0'; tip.hide(); });
    return wrap;
  }

  App.hbars = (host, o) => {
    const max = o.max || Math.max(...o.data.map(d => d.value)) || 1;
    const fmt = o.format || (v => App.fmt.num(v));
    host.innerHTML = `<div class="hbars${App.calm() ? '' : ' is-waiting'}" role="list">${o.data.map(d => `<div class="hbar${d.hl ? ' is-hl' : ''}" role="listitem"><span class="hbar__label">${App.esc(d.label)}</span><span class="hbar__track"><span class="hbar__fill" style="--p:${(d.value / max).toFixed(4)}"></span></span><span class="hbar__val">${fmt(d.value)}<span class="sr-only"> ${App.esc(o.unit || '')}</span></span></div>`).join('')}</div>`;
    const wrap = host.firstElementChild;
    if (!App.calm()) App.whenVisible(wrap, () => wrap.classList.remove('is-waiting'));
    return wrap;
  };

  App.donut = (host, o) => {
    const total = sum(o.data.map(d => d.value)) || 1;
    const R = 52, C = 2 * Math.PI * R;
    let acc = 0;
    const segs = o.data.map(d => {
      const len = d.value / total * C;
      const s = `<circle class="donut__seg" cx="70" cy="70" r="${R}" stroke="${d.color}" stroke-width="18" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" style="--len:${(-acc + len).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
      acc += len;
      return s;
    }).join('');
    host.innerHTML = `<div class="donut"><svg viewBox="0 0 140 140" role="img" aria-label="${App.esc(o.title || '比例圖')}"><circle cx="70" cy="70" r="${R}" fill="none" stroke="#EEE9DC" stroke-width="18"/>${segs}<text class="donut__center" x="70" y="72" text-anchor="middle" font-size="24">${App.esc(o.center || '')}</text><text class="donut__center-sub" x="70" y="92" text-anchor="middle">${App.esc(o.sub || '')}</text></svg><ul class="legend">${o.data.map(d => `<li class="legend__item"><span class="legend__swatch" style="--sw:${d.color}"></span>${App.esc(d.label)}　<b class="num">${App.fmt.num(d.value)}</b>（${Math.round(d.value / total * 100)}%）</li>`).join('')}</ul></div>`;
    return host.firstElementChild;
  };

  /* ===================================================================
     頁面外殼：導覽、行動版側欄、全域搜尋、通知、使用者、高齡切換
     =================================================================== */
  function initNav() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const app = $('.app');
    const toggle = $('[data-nav-toggle]');
    if (!app || !toggle) return;
    const setOpen = open => {
      app.classList.toggle('is-nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.icon-btn__label').textContent = open ? '關閉選單' : '選單';
      if (open) { const cur = $('.sidebar .nav__link.is-active') || $('.sidebar a'); if (cur) cur.focus(); }
    };
    toggle.addEventListener('click', () => setOpen(!app.classList.contains('is-nav-open')));
    $$('[data-nav-close]').forEach(el => el.addEventListener('click', () => setOpen(false)));
    $$('.sidebar a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && app.classList.contains('is-nav-open')) { setOpen(false); toggle.focus(); } });
    matchMedia('(min-width: 1025px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
  }

  function initSearch() {
    const box = $('[data-gsearch]');
    if (!box) return;
    const input = $('.gsearch__input', box);
    const panel = $('.gsearch__panel', box);
    const openBtn = $('.gsearch__open', box);
    let items = [], active = -1;
    const hl = (text, q) => { const s = App.esc(text); if (!q) return s; const i = text.toLowerCase().indexOf(q); return i < 0 ? s : `${App.esc(text.slice(0, i))}<mark>${App.esc(text.slice(i, i + q.length))}</mark>${App.esc(text.slice(i + q.length))}`; };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      // 進行中的案件排前面，同組內新案在前
      const live = c => (c.status === 'active' && c.stage !== 'closed' ? 0 : 1);
      const cases = App.CASES.filter(c => `${c.id} ${c.org} ${c.contact} ${App.county(c.county).name}${c.district}`.toLowerCase().includes(q)).sort((x, y) => live(x) - live(y) || y.id.localeCompare(x.id)).slice(0, 6);
      const lects = App.LECTURERS.filter(l => `${l.id} ${l.name} ${l.org} ${l.title}`.toLowerCase().includes(q)).slice(0, 4);
      items = [];
      const group = (cap, html) => (html ? `<div class="gsearch__group" role="group" aria-label="${cap}"><p class="gsearch__cap">${cap}</p>${html}</div>` : '');
      const caseHtml = cases.map(c => { items.push(`application.html?id=${c.id}`); return `<a class="gsearch__item" role="option" id="gs-${items.length - 1}" href="application.html?id=${c.id}"><span class="mono">${hl(c.id, q)}</span><span><span class="gsearch__item-title">${hl(c.org, q)}</span><br><span class="gsearch__item-sub">${App.county(c.county).name}${c.district}・${c.date ? App.fmt.roc(c.date) : '日期待定'}</span></span>${App.stageBadge(c)}</a>`; }).join('');
      const lectHtml = lects.map(l => { items.push(`instructors.html?id=${l.id}`); return `<a class="gsearch__item" role="option" id="gs-${items.length - 1}" href="instructors.html?id=${l.id}">${App.avatar(l, 'sm')}<span><span class="gsearch__item-title">${hl(l.name, q)}</span><br><span class="gsearch__item-sub">${hl(l.title, q)}・${App.county(l.county).name}</span></span><span class="subtle">${l.id}</span></a>`; }).join('');
      panel.innerHTML = cases.length || lects.length ? group('申請案件', caseHtml) + group('講師', lectHtml) : `<p class="gsearch__empty">找不到「${App.esc(input.value.trim())}」相關的案件或講師</p>`;
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    };
    const move = d => {
      const opts = $$('.gsearch__item', panel);
      if (!opts.length) return;
      active = (active + d + opts.length) % opts.length;
      opts.forEach((o2, i) => o2.classList.toggle('is-active', i === active));
      input.setAttribute('aria-activedescendant', opts[active].id);
      opts[active].scrollIntoView({ block: 'nearest' });
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = items[active]; }
      else if (e.key === 'Escape') { panel.hidden = true; box.classList.remove('is-open'); input.setAttribute('aria-expanded', 'false'); if (openBtn && getComputedStyle(openBtn).display !== 'none') openBtn.focus(); }
    });
    document.addEventListener('click', e => { if (!box.contains(e.target)) { panel.hidden = true; box.classList.remove('is-open'); if (openBtn) openBtn.setAttribute('aria-expanded', 'false'); } });
    if (openBtn) openBtn.addEventListener('click', () => {
      const open = !box.classList.contains('is-open');
      box.classList.toggle('is-open', open);
      openBtn.setAttribute('aria-expanded', String(open));
      if (open) input.focus(); else panel.hidden = true;
    });
    // 「/」快速聚焦搜尋（輸入中不攔截）
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.target.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      if (openBtn && getComputedStyle(openBtn).display !== 'none') { box.classList.add('is-open'); openBtn.setAttribute('aria-expanded', 'true'); }
      input.focus();
    });
  }

  let notifList = null;
  function renderNotifs() {
    if (!notifList) return;
    notifList.innerHTML = App.notifications().map(n => `<a class="notif__item${n.unread ? ' is-unread' : ''}" data-tone="${n.tone}" data-id="${n.id}" href="${n.href}"><span class="notif__icon">${App.icon(n.icon)}</span><span><span class="notif__text">${App.esc(n.text)}</span><br><span class="notif__time">${n.time}</span></span></a>`).join('');
  }
  function initNotifs() {
    const btn = $('[data-notif-btn]');
    const panel = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    panel.innerHTML = `<div class="notif__head"><p class="notif__title">通知</p><button type="button" class="btn btn--ghost btn--sm" data-notif-read>${App.icon('check')}全部標為已讀</button></div><div class="notif__list"></div><div class="notif__foot"><a class="link-arrow" href="applications.html">前往申請案件${App.icon('arrow-right')}</a></div>`;
    notifList = $('.notif__list', panel);
    renderNotifs();
    App.popover(btn, panel);
    panel.addEventListener('click', e => {
      const item = e.target.closest('.notif__item');
      if (item) App.state.read.add(item.dataset.id);
      if (e.target.closest('[data-notif-read]')) {
        const before = new Set(App.state.read);
        App.notifications().forEach(n => App.state.read.add(n.id));
        App.emit('notif-read');
        App.toast('已將通知全部標為已讀', { action: { label: '復原', onClick: () => { App.state.read = before; App.emit('notif-undo'); } } });
      }
    });
  }

  function initUser() {
    const btn = $('[data-user-btn]');
    const panel = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    const me = App.staff(App.ME);
    panel.innerHTML = `<div class="user-menu__card">${App.avatar(me, 'lg')}<div><p class="strong">${me.name}</p><p class="subtle">${me.role}｜${me.area}</p></div></div>
<div class="menu-list">
  <button type="button" class="menu-item" data-toast="個人資料已是最新版本" data-toast-desc="帳號 wenqi.chou｜最後登入 115/10/28 08:42">${App.icon('user')}個人資料</button>
  <button type="button" class="menu-item" data-senior-toggle-menu>${App.icon('text-size')}<span>高齡友善模式</span><span class="subtle" data-senior-state style="margin-left:auto"></span></button>
  <a class="menu-item" href="claims.html#rates">${App.icon('settings')}示意費率設定</a>
  <button type="button" class="menu-item" data-toast="此為示範環境，不提供登出" data-toast-tone="info">${App.icon('logout')}登出</button>
</div>`;
    const syncState = () => { $('[data-senior-state]', panel).textContent = App.senior.on() ? '已開啟' : '未開啟'; };
    syncState();
    App.onMode(syncState);
    $('[data-senior-toggle-menu]', panel).addEventListener('click', () => toggleSenior());
    App.popover(btn, panel);
  }

  function toggleSenior() {
    App.senior.toggle();
    App.toast(App.senior.on() ? '已開啟高齡友善模式' : '已關閉高齡友善模式', {
      desc: App.senior.on() ? '字級放大、按鈕加高、關閉裝飾動態；次要欄位可從「詳細」展開。設定會保留到下次登入。' : '已恢復一般模式的字級與版面。',
      tone: 'info',
    });
  }

  function init() {
    injectSprite();
    initNav();
    initSearch();
    initNotifs();
    initUser();
    syncSeniorButtons();
    $$('[data-senior-toggle]').forEach(b => b.addEventListener('click', toggleSenior));
    renderCounts();
    scanTables();
    new MutationObserver(() => { if (!tableTick) tableTick = requestAnimationFrame(scanTables); }).observe(document.body, { childList: true, subtree: true });
    App.reveal();
    // 先讓在視窗內的元素標記為 .is-in，再打開「隱藏未進場元素」的開關，避免首屏閃爍
    document.documentElement.classList.add('reveal-ready');
    App.onMode(on => { if (on) $$('[data-reveal]').forEach(el => el.classList.add('is-in')); });
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
    addEventListener('scroll', () => { if (!revealTick) revealTick = requestAnimationFrame(revealSweep); }, { passive: true });
    addEventListener('beforeprint', () => $$('[data-reveal]').forEach(el => el.classList.add('is-in')));
  }
  init();
})();
