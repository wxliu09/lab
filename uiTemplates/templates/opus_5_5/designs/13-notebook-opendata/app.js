/*
 * 澄港市 開放資料平台 · 資料集上架管理 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒、
 * 共用 UI（導覽、cell gutter、大綱）也已初始化。cell 的開場自動執行排在所有 DOMContentLoaded 之後，
 * 所以頁面在 DOMContentLoaded 內先把輸出畫好、再用 App.cell.define 註冊重跑邏輯即可。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 參考資料（全站共用，確保名稱、數字前後一致；只在記憶體中變動）
 *   App.DATA.datasets      60 個資料集（欄位見檔案下方「資料集欄位」）
 *   App.DATA.jobs          失敗工作（擷取／驗證／轉換／發布失敗，含 log）
 *   App.DATA.activity      最近活動（新到舊）
 *   App.DATA.pipeline      今日管線統計（各步驟處理中、今日件數、成功率）
 *   App.DATA.weekly        近 52 週下載量 [{week, api, file}]、App.DATA.onTimeWeekly 近 12 週準時率
 *   App.DISTRICTS · App.AGENCIES · App.THEMES · App.FORMATS · App.FREQS · App.LICENSES · App.PEOPLE
 *   App.STATUS（draft/validating/review/approval/published/returned/deprecated → {label, short, tone}）
 *   App.FLOW（上架流程五階段）· App.PIPE_STAGES（擷取/驗證/轉換/發布）· App.TYPES · App.QUALITY_DIMS · App.RULES
 *   App.ME（目前使用者 = 承辦 許雅婷）
 * 查詢與衍生
 *   App.dataset(id) · App.agency(key) · App.person(id) · App.theme(key) · App.job(id)
 *   App.health(ds) → 'ok'|'late'|'failed'|null（null = 尚未發布）· App.isLate(ds) · App.lateBy(ds) → ms
 *   App.grade(score) → 'A'|'B'|'C'|'D' · App.stats() → 平台彙總（見函式註解）
 *   App.pendingApps() → 待審上架（validating/review/approval，依送件時間排序）
 *   App.schema(ds) → 欄位定義 [{name, type, label, desc, nul?}] · App.sample(ds, n) → 預覽列（決定性產生）
 *   App.profile(ds) → 每欄 profiling {name,type,label,nullRate,distinct,min,max,mean,hist[],top[],bad}
 *   App.rules(ds) → 驗證規則結果 [{key,name,expr,state:'pass'|'fail'|'warn'|'skip',result,detail}]
 *   App.versions(ds) → 版本歷史 [{version,at,by,note,rows,delta}] · App.diff(ds) → 最新兩版差異
 *   App.csv.parse(text) → {headers, rows, delimiter} · App.inferType(values) → 'str'|'int'|'float'|'date'|'geo'|'bool'
 *   App.profileValues(values, type) → 與 App.profile 相同結構（上架頁即時 profiling 用）
 *   App.param(name) · App.datasetUrl(id) · App.rng(seed) → () => [0,1) · App.hash(str)
 * 時間與格式（一律以 UTC+8 計算，與使用者時區無關）
 *   App.now() → ms，以 2026-10-22 09:41 為起點持續走動 · App.time('2026-10-22T09:41') → ms
 *   App.fmt.num / pct / wan / date / md / time / clock / dateTime / full / weekday / rel / countdown / dur / bytes
 * 標記產生器（回傳 HTML 字串）
 *   App.esc · App.icon(name, cls) · App.typeBadge(type) · App.statusBadge(status, {pill}) · App.healthBadge(ds)
 *   App.formatBadges(formats) · App.gradeBadge(score, {lg}) · App.scoreCell(score) · App.stateIcon(state)
 *   App.avatar(personId, size) · App.person(id) · App.personChip(id) · App.agencyLabel(key)
 *   App.spark(values, {w,h,color,fill,dot,label}) · App.hist(bins, {w,h,color,flag}) · App.topk(top)
 *   App.nullBar(rate) · App.ring(score, {size, stroke, dims, sub, label}) · App.emptyState({title, text, action})
 *   App.flowHTML(steps) → .flow（steps: [{label, meta, state}]，state = done|active|todo|fail|warn|skip）
 * 互動
 *   App.toast(title, {desc, tone:'ok'|'info'|'warn'|'err', action:{label, onClick}, duration})
 *   App.modal({title, eyebrow, body, icon, tone, size:'sm'|'md'|'lg', actions:[{label, variant, icon, autofocus, onClick(close)}], note, onClose}) → {el, body, foot, close}
 *   App.confirm({title, message, confirmLabel, cancelLabel, tone:'primary'|'danger', icon}) → Promise<boolean>
 *   App.tabs(tablistEl, {onChange(index, tab)}) → {select(i)}（.tabs[data-tabs] 會自動初始化）
 *   App.highlight(root) 語法上色 pre.code > code（data-lang="py"|"sql"|"text"）
 *   App.stream(container, {selector, interval}) → Promise  逐行流入
 *   App.streamLines(logEl, lines:[{t, level, msg}], {interval}) → Promise  記錄一行一行打出來
 *   App.countUp(el, to?) · App.reveal(root) · App.watchAnim(el) 讓動態插入的 [data-anim] 也會離屏暫停
 * 資料異動（都會發出 'data' 事件；頁面以 App.on('data', render) 統一重繪，含復原）
 *   App.on(name, fn) / App.off(name, fn) / App.emit(name, detail)
 *   App.transition(dsId, toStatus, {note, actor}) → {undo()}  上架流程狀態流轉（自動寫活動紀錄）
 *   App.retryJob(jobId) → Promise<{ok, job}>  重試失敗工作（暫時性錯誤成功、資料錯誤再次失敗）
 *   App.setPaused(dsId, paused) → {undo()}  暫停／恢復更新排程
 *   App.log({kind, actor, ds, text, detail}) 新增活動（text 可含「{ds}」佔位，顯示時換成資料集名稱）· App.unlog(entry) 撤銷
 *   App.addDataset(partial) → ds（上架頁送審用）
 *   活動 kind：publish / fail / review / approve / return / submit / draft / notify / schedule
 * Notebook cell（section.cell[data-cell]；app.js 自動補 gutter、執行／程式碼工具鈕）
 *   App.cell.define(cellElOrId, {run(cell) → void | {state} | Promise}) 註冊「重新執行」時要重算的輸出
 *   App.cell.run(cell, {duration}) → Promise · App.cell.runAll() → Promise · App.cell.fold(cell, bool) · App.cell.foldAll(bool)
 *   App.cell.setState(cell, 'done'|'warn'|'error') · App.cell.badge(cell, text|null, tone) 更新大綱上的徽章
 *   cell 內 [data-out] 元素會在每次執行後顯示「Out[n]:」
 *   Shift+Enter 執行目前 cell；cell 執行時頁首「核心」顯示執行中
 * 招牌動畫引擎
 *   App.pipeline(rootEl, {stages:[{key,label,en,running,today,success}], source:{label,value,unit}, sink:{label,value},
 *     retry:{label,value,note}, failRate:{validate,transform}, rate, onSelect(stageKey|null), onEvent('publish'|'fail', key)})
 *     → {pause(), resume(), toggle(), paused, set('retry'|'sink', n) / set(stageKey, {running, today}), select(key), state}
 *     擷取→驗證→轉換→發布的即時流動點（canvas），驗證／轉換失敗的點落入重試佇列再繞回擷取；
 *     離開視窗、分頁隱藏時自動暫停；prefers-reduced-motion 時畫靜態畫面。
 * 自動行為（不需呼叫）
 *   導覽 active 標示、行動版選單 [data-nav-toggle]、全域搜尋 [data-gsearch]（/ 鍵聚焦）、[data-clock] 時鐘、
 *   [data-kernel] 核心狀態、[data-outline] 大綱（由 .cell 產生 + scroll spy）、[data-reveal] 進場、
 *   [data-count-to] 數字滾動、[data-ring] 圓環動畫、[data-anim] 離屏暫停、.tabs[data-tabs]、pre.code 語法上色
 *
 * 資料集欄位
 *   id, code, title, agency, theme, formats[], freq, status, quality(null=尚未驗證), dims{complete,valid,timely,consistent,meta},
 *   rows, cols, downloads30, weekly[12], updated(ms，最後成功更新), created, version, license, desc, tags[],
 *   paused, app{no, by, submitted, assignee, stageAt, reviewer, note}(上架申請；已發布者保留歷史), fails{ruleKey: {...}}
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------------
   * 事件匯流排：資料異動一律走 'data'，頁面只要訂閱一次就能讓所有衍生數字同步
   * ------------------------------------------------------------------ */
  const bus = new EventTarget();
  const on = (name, fn) => { const h = (e) => fn(e.detail); fn.__h = h; bus.addEventListener(name, h); };
  const off = (name, fn) => { if (fn.__h) bus.removeEventListener(name, fn.__h); };
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  /* ------------------------------------------------------------------
   * 時間：固定以 2026-10-22（四）09:41 為「現在」，頁面開著時跟著真實時間走
   * ------------------------------------------------------------------ */
  const TZ = 8 * 3600e3;
  const NOW_BASE = Date.parse('2026-10-22T09:41:00+08:00');
  const bootAt = Date.now();
  const now = () => NOW_BASE + (Date.now() - bootAt);
  const time = (s) => Date.parse(s.length <= 10 ? s + 'T00:00:00+08:00' : (s.length === 16 ? s + ':00+08:00' : s + '+08:00'));
  const parts = (ms) => {
    const d = new Date(ms + TZ);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds(), wd: d.getUTCDay() };
  };
  const p2 = (n) => String(n).padStart(2, '0');
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const DAY = 864e5, HOUR = 36e5, MIN = 6e4;

  const fmt = {
    num: (n, dp = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }),
    pct: (x, dp = 1) => (x * 100).toFixed(dp) + '%',
    wan: (n, dp = 1) => (Math.abs(n) >= 1e4 ? (n / 1e4).toFixed(dp) + ' 萬' : fmt.num(n)),
    date: (ms) => { const p = parts(ms); return `${p.y}-${p2(p.m)}-${p2(p.d)}`; },
    md: (ms) => { const p = parts(ms); return `${p2(p.m)}/${p2(p.d)}`; },
    time: (ms) => { const p = parts(ms); return `${p2(p.hh)}:${p2(p.mm)}`; },
    clock: (ms) => { const p = parts(ms); return `${p2(p.hh)}:${p2(p.mm)}:${p2(p.ss)}`; },
    dateTime: (ms) => `${fmt.md(ms)} ${fmt.time(ms)}`,
    full: (ms) => `${fmt.date(ms)} ${fmt.time(ms)}`,
    weekday: (ms) => WD[parts(ms).wd],
    dateLong: (ms) => { const p = parts(ms); return `${p.y} 年 ${p.m} 月 ${p.d} 日（${WD[p.wd]}）`; },
    // 相對時間：同一天用分鐘／小時，昨天顯示時刻，一週內用天數，更早顯示日期
    rel: (ms) => {
      const n = now();
      const diff = n - ms;
      if (diff < 0) {
        const f = -diff;
        if (f < HOUR) return `${Math.max(1, Math.round(f / MIN))} 分鐘後`;
        if (f < DAY) return `${Math.round(f / HOUR)} 小時後`;
        return `${Math.round(f / DAY)} 天後`;
      }
      if (diff < 45e3) return '剛剛';
      if (diff < HOUR) return `${Math.round(diff / MIN)} 分鐘前`;
      const a = parts(ms), b = parts(n);
      const sameDay = a.y === b.y && a.m === b.m && a.d === b.d;
      if (sameDay) return `${Math.floor(diff / HOUR)} 小時前`;
      const startToday = time(fmt.date(n));
      if (ms >= startToday - DAY) return `昨天 ${fmt.time(ms)}`;
      if (diff < 7 * DAY) return `${Math.ceil((startToday - ms) / DAY)} 天前`;
      return fmt.md(ms);
    },
    countdown: (ms) => {
      if (ms <= 0) return '0:00';
      const s = Math.floor(ms / 1000);
      if (s < 3600) return `${Math.floor(s / 60)}:${p2(s % 60)}`;
      return `${Math.floor(s / 3600)} 小時 ${Math.floor((s % 3600) / 60)} 分`;
    },
    dur: (sec) => (sec < 60 ? `${sec.toFixed(sec < 10 ? 2 : 1)} 秒` : `${Math.floor(sec / 60)} 分 ${Math.round(sec % 60)} 秒`),
    days: (ms) => { const d = ms / DAY; return d < 1 ? `${Math.max(1, Math.round(ms / HOUR))} 小時` : `${Math.round(d)} 天`; },
    bytes: (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`),
  };

  /* ------------------------------------------------------------------
   * 決定性亂數：同一個資料集每次開頁產生同樣的預覽列與 profiling
   * ------------------------------------------------------------------ */
  const hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const rng = (seed) => {
    let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------------
   * 參考資料
   * ------------------------------------------------------------------ */
  const DISTRICTS = ['港埕區', '北岸區', '舊城區', '山腳區', '新灣區', '鹽田區', '溪洲區', '雲嶺區'];

  const PEOPLE = {
    hsu: { name: '許雅婷', role: '承辦', unit: '數位發展處 資料治理科', hue: 170 },
    chen: { name: '陳柏翰', role: '承辦', unit: '數位發展處 資料治理科', hue: 215 },
    lin: { name: '林思妤', role: '承辦', unit: '數位發展處 資料治理科', hue: 330 },
    chou: { name: '周敬言', role: '資料長', unit: '數位發展處', hue: 265 },
    wang: { name: '王志豪', role: '資料窗口', unit: '交通局', hue: 200 },
    huang: { name: '黃詩涵', role: '資料窗口', unit: '環境保護局', hue: 140 },
    chang: { name: '張家銘', role: '資料窗口', unit: '都市發展局', hue: 30 },
    li: { name: '李孟蓉', role: '資料窗口', unit: '社會局', hue: 350 },
    wu: { name: '吳冠廷', role: '資料窗口', unit: '衛生局', hue: 190 },
    tsai: { name: '蔡宜蓁', role: '資料窗口', unit: '教育局', hue: 45 },
    cheng: { name: '鄭宇翔', role: '資料窗口', unit: '文化局', hue: 290 },
    liu: { name: '劉建宏', role: '資料窗口', unit: '工務局', hue: 20 },
    yang: { name: '楊淑芬', role: '資料窗口', unit: '經濟發展局', hue: 95 },
    hsieh: { name: '謝明哲', role: '資料窗口', unit: '消防局', hue: 5 },
    kuo: { name: '郭怡君', role: '資料窗口', unit: '民政局', hue: 250 },
    hung: { name: '洪國峰', role: '資料窗口', unit: '主計處', hue: 60 },
    fang: { name: '方子晴', role: '資料窗口', unit: '觀光旅遊局', hue: 160 },
    tseng: { name: '曾柏凱', role: '資料窗口', unit: '地政局', hue: 120 },
    system: { name: '排程器', role: '系統', unit: '開放資料平台', hue: 0, system: true },
  };
  Object.entries(PEOPLE).forEach(([id, p]) => { p.id = id; });
  const ME = PEOPLE.hsu;

  const AGENCIES = {
    tra: { name: '交通局', full: '澄港市政府交通局', code: 'TRA', contact: 'wang' },
    env: { name: '環保局', full: '澄港市政府環境保護局', code: 'ENV', contact: 'huang' },
    urb: { name: '都發局', full: '澄港市政府都市發展局', code: 'UDD', contact: 'chang' },
    soc: { name: '社會局', full: '澄港市政府社會局', code: 'SOC', contact: 'li' },
    hlt: { name: '衛生局', full: '澄港市政府衛生局', code: 'HLT', contact: 'wu' },
    edu: { name: '教育局', full: '澄港市政府教育局', code: 'EDU', contact: 'tsai' },
    cul: { name: '文化局', full: '澄港市政府文化局', code: 'CUL', contact: 'cheng' },
    pwb: { name: '工務局', full: '澄港市政府工務局', code: 'PWB', contact: 'liu' },
    eco: { name: '經發局', full: '澄港市政府經濟發展局', code: 'ECO', contact: 'yang' },
    fire: { name: '消防局', full: '澄港市政府消防局', code: 'FIR', contact: 'hsieh' },
    civ: { name: '民政局', full: '澄港市政府民政局', code: 'CIV', contact: 'kuo' },
    bud: { name: '主計處', full: '澄港市政府主計處', code: 'BUD', contact: 'hung' },
    tour: { name: '觀旅局', full: '澄港市政府觀光旅遊局', code: 'TOU', contact: 'fang' },
    land: { name: '地政局', full: '澄港市政府地政局', code: 'LND', contact: 'tseng' },
  };
  Object.entries(AGENCIES).forEach(([k, a]) => { a.key = k; });

  const THEMES = {
    transport: '交通運輸', environment: '環境品質', urban: '都市規劃', welfare: '社會福利',
    health: '醫療衛生', education: '教育學習', culture: '文化藝術', safety: '公共安全',
    economy: '經濟產業', population: '人口統計', finance: '財政主計', works: '公共工程', tourism: '觀光休閒',
  };
  const FORMATS = ['CSV', 'JSON', 'GeoJSON', 'XML', 'XLSX', 'API', 'SHP'];
  const FREQS = {
    realtime: { label: '即時', sub: '每 5 分鐘', window: 15 * MIN },
    hourly: { label: '每小時', sub: '整點', window: HOUR },
    daily: { label: '每日', sub: '02:00 批次', window: DAY },
    weekly: { label: '每週', sub: '週一 03:00', window: 7 * DAY },
    monthly: { label: '每月', sub: '每月 5 日前', window: 31 * DAY },
    quarterly: { label: '每季', sub: '季初 15 日前', window: 92 * DAY },
    half: { label: '每半年', sub: '1 月、7 月', window: 183 * DAY },
    yearly: { label: '每年', sub: '年度結算後', window: 366 * DAY },
    adhoc: { label: '不定期', sub: '異動時更新', window: null },
  };
  const LICENSES = {
    'cg-open-1': { label: '澄港開放授權 1.0', desc: '可自由重製、改作與商業利用，須標示來源「澄港市政府」。' },
    'cg-open-1-nc': { label: '澄港開放授權 1.0（非商業）', desc: '可重製與改作，限非商業用途並須標示來源。' },
    'public-domain': { label: '公眾領域貢獻宣告', desc: '放棄著作財產權，任何人得不受限制使用。' },
    restricted: { label: '限定使用', desc: '須經申請核准，僅供指定目的使用，不公開下載。' },
  };
  const STATUS = {
    draft: { label: '草稿', short: '草稿', tone: 'muted' },
    validating: { label: '自動驗證中', short: '驗證中', tone: 'muted' },
    review: { label: '承辦審核', short: '承辦審核', tone: 'info' },
    approval: { label: '資料長核定', short: '待核定', tone: 'cdo' },
    published: { label: '已發布', short: '已發布', tone: 'ok' },
    returned: { label: '退回補正', short: '退回', tone: 'warn' },
    deprecated: { label: '已下架', short: '下架', tone: 'muted' },
  };
  const FLOW = [
    { key: 'submit', label: '上架申請', status: 'draft' },
    { key: 'validating', label: '自動驗證', status: 'validating' },
    { key: 'review', label: '承辦審核', status: 'review' },
    { key: 'approval', label: '資料長核定', status: 'approval' },
    { key: 'published', label: '發布', status: 'published' },
  ];
  const PIPE_STAGES = [
    { key: 'extract', label: '擷取', en: 'Extract', desc: '自機關來源系統或 API 取得原始檔' },
    { key: 'validate', label: '驗證', en: 'Validate', desc: '結構、型別、範圍、編碼與詮釋資料檢核' },
    { key: 'transform', label: '轉換', en: 'Transform', desc: '正規化欄位、轉出多種格式、產生 profiling' },
    { key: 'publish', label: '發布', en: 'Publish', desc: '寫入平台、更新 API 與 CDN 快取' },
  ];
  const TYPES = {
    str: { label: '字串', desc: '文字或代碼' },
    int: { label: '整數', desc: '計數、代碼數值' },
    float: { label: '浮點數', desc: '量測值、比例' },
    date: { label: '日期', desc: 'ISO 8601 日期或時間' },
    geo: { label: '地理', desc: '經緯度或幾何（WGS84）' },
    bool: { label: '布林', desc: '是／否' },
  };
  const QUALITY_DIMS = [
    { key: 'complete', label: '完整性', desc: '必填欄位與空值比例' },
    { key: 'valid', label: '正確性', desc: '型別、範圍、格式規則通過率' },
    { key: 'timely', label: '時效性', desc: '依更新頻率是否準時' },
    { key: 'consistent', label: '一致性', desc: '與前版結構、代碼表一致' },
    { key: 'meta', label: '詮釋資料', desc: '欄位說明、授權、聯絡窗口完整度' },
  ];

  /* ------------------------------------------------------------------
   * 欄位定義（schema）。C() 定義一欄；PT / ST 是點位與統計兩種常見樣板
   * gen：id / enum / int / float / date / datetime / month / district / address / lat / lng / place / seq
   * ------------------------------------------------------------------ */
  const C = (name, type, label, gen, extra = {}) => ({ name, type, label, gen, ...extra });
  const PT = (prefix, suffixes, extra = []) => [
    C('id', 'str', '設施代碼', { id: prefix + '-####' }, { desc: '機關內部唯一代碼', pk: true }),
    C('name', 'str', '名稱', { place: suffixes }),
    C('district', 'str', '行政區', { district: 1 }),
    C('address', 'str', '地址', { address: 1 }, { nul: 0.008 }),
    C('lat', 'geo', '緯度', { lat: 1 }, { desc: 'WGS84' }),
    C('lng', 'geo', '經度', { lng: 1 }, { desc: 'WGS84' }),
    ...extra,
    C('updated_at', 'date', '資料更新日', { date: ['2026-06-01', '2026-10-21'] }),
  ];
  const ST = (metrics, period = 'month') => [
    period === 'month'
      ? C('period', 'date', '統計年月', { month: ['2024-10', '2026-09'] }, { pk: true })
      : C('year', 'int', '年度', { int: [2016, 2025] }, { pk: true }),
    C('district', 'str', '行政區', { district: 1 }, { pk: true }),
    ...metrics,
  ];

  // 空品測站：[站名, 行政區]，索引 + 1 即站碼 AQ-01…AQ-16（JOB-1022-0205 的記錄寫的是 鹽田 AQ-08、北岸工業 AQ-03）
  const AQ_SITES = [['港埕', '港埕區'], ['北岸', '北岸區'], ['北岸工業', '北岸區'], ['舊城', '舊城區'], ['山腳', '山腳區'], ['新灣', '新灣區'], ['新灣港區', '新灣區'], ['鹽田', '鹽田區'],
    ['鹽田濕地', '鹽田區'], ['溪洲', '溪洲區'], ['雲嶺', '雲嶺區'], ['雲嶺山區', '雲嶺區'], ['中正', '舊城區'], ['文昌', '舊城區'], ['興港', '港埕區'], ['望海', '新灣區']];
  /** 抽樣列依「最新整點往前 × 16 站」排列，讓 (site_id, measured_at) 主鍵、站名與行政區彼此吻合 */
  function fixAirRow(row, i) {
    const k = i % AQ_SITES.length, h = Math.floor(i / AQ_SITES.length);
    const t = time('2026-10-22T01:00') - h * HOUR;
    [row.site_name, row.district] = AQ_SITES[k];
    row.site_id = `AQ-${p2(k + 1)}`;
    row.measured_at = `${fmt.date(t)}T${fmt.time(t)}`;
    // 負值是鹽田（AQ-08）與北岸工業（AQ-03）的儀器歸零異常，其他站的隨機負值改回正常讀數
    const broken = (k === 7 && h % 3 !== 1) || (k === 2 && h % 2 === 0 && h < 12);
    if (broken && row.pm25 != null) row.pm25 = -Number((0.4 + ((h * 7 + k * 3) % 59) / 10).toFixed(1));
    else if (row.pm25 < 0) row.pm25 = Number((-row.pm25 + 5).toFixed(1));
    row.status = row.aqi <= 50 ? '良好' : row.aqi <= 100 ? '普通' : '對敏感族群不健康';
  }

  /* ------------------------------------------------------------------
   * 60 個資料集
   * ------------------------------------------------------------------ */
  const RAW = [
    { id: 'bus-eta', t: '公車動態即時到站', a: 'tra', th: 'transport', f: ['JSON', 'API'], fq: 'realtime', st: 'published', q: 88, rows: 1286, dl: 52310, upd: '2026-10-22T09:26', v: '4.12', lic: 'cg-open-1', created: '2021-03-15',
      d: '市區公車各站牌預估到站時間與車輛位置，每 5 分鐘更新，提供 API 即時查詢。', tags: ['公車', '即時', 'API'],
      cols: [C('stop_id', 'str', '站牌代碼', { id: 'BS-####' }, { pk: true }), C('route', 'str', '路線', { enum: ['1', '2', '5', '7', '12', '18', '22', '藍 3', '綠 1', '港埕幹線', '北岸快線'] }), C('stop_name', 'str', '站名', { place: ['站', '路口', '國小', '市場', '轉運站'] }), C('eta_min', 'int', '預估到站（分）', { int: [0, 42] }, { nul: 0.03 }), C('plate', 'str', '車牌', { id: 'KAA-###' }, { nul: 0.03 }), C('lat', 'geo', '緯度', { lat: 1 }), C('lng', 'geo', '經度', { lng: 1 }), C('reported_at', 'date', '回報時間', { datetime: ['2026-10-22T09:00', '2026-10-22T09:26'] })] },
    { id: 'parking-avail', fix: (row) => { if (row.car_avail > row.car_total) row.car_avail = Math.round(row.car_total * 0.4); }, t: '公有停車場剩餘車位', a: 'tra', th: 'transport', f: ['JSON', 'CSV', 'API'], fq: 'realtime', st: 'published', q: 91, rows: 64, dl: 31880, upd: '2026-10-22T09:30', v: '3.4', lic: 'cg-open-1', created: '2021-07-01',
      d: '市管路外停車場之汽機車總格位與即時剩餘格位，含收費費率與營業時間。', tags: ['停車', '即時'],
      cols: [C('lot_id', 'str', '停車場代碼', { id: 'PK-###' }, { pk: true }), C('name', 'str', '名稱', { place: ['停車場', '立體停車場', '地下停車場'] }), C('district', 'str', '行政區', { district: 1 }), C('car_total', 'int', '汽車總格位', { int: [40, 620] }), C('car_avail', 'int', '汽車剩餘', { int: [0, 380] }), C('moto_avail', 'int', '機車剩餘', { int: [0, 520] }, { nul: 0.05 }), C('rate', 'str', '費率', { enum: ['20 元/時', '30 元/時', '40 元/時', '計次 50 元'] }), C('lat', 'geo', '緯度', { lat: 1 }), C('lng', 'geo', '經度', { lng: 1 }), C('updated_at', 'date', '更新時間', { datetime: ['2026-10-22T09:20', '2026-10-22T09:30'] })] },
    { id: 'bike-stations', fix: (row) => { row.bikes %= row.capacity + 1; row.docks = row.capacity - row.bikes; }, t: '公共自行車租賃站', a: 'tra', th: 'transport', f: ['CSV', 'JSON', 'GeoJSON'], fq: 'realtime', st: 'published', q: 95, rows: 412, dl: 21450, upd: '2026-10-22T09:40', v: '5.2', lic: 'cg-open-1', created: '2020-11-02',
      d: '公共自行車各租賃站位置、車柱數與即時可借可還數量，每 5 分鐘自營運商系統同步。', tags: ['自行車', '即時', '地圖'],
      cols: [C('station_id', 'str', '站點代碼', { id: 'CB-####' }, { pk: true, desc: '營運商站點編號' }), C('name', 'str', '站名', { place: ['站', '捷運站', '公園站', '國小站', '市場站'] }), C('district', 'str', '行政區', { district: 1 }), C('capacity', 'int', '車柱數', { int: [12, 60] }), C('bikes', 'int', '可借車輛', { int: [0, 44] }), C('docks', 'int', '可還空位', { int: [0, 48] }), C('lat', 'geo', '緯度', { lat: 1 }, { desc: 'WGS84' }), C('lng', 'geo', '經度', { lng: 1 }, { desc: 'WGS84' }), C('active', 'bool', '營運中', { bool: 0.97 }), C('updated_at', 'date', '更新時間', { datetime: ['2026-10-22T09:35', '2026-10-22T09:40'] })] },
    { id: 'bike-lanes', t: '自行車道路網', a: 'tra', th: 'transport', f: ['GeoJSON', 'SHP'], fq: 'quarterly', st: 'published', q: 90, rows: 286, dl: 2140, upd: '2026-10-22T09:31', v: '1.0', lic: 'cg-open-1', created: '2026-10-22',
      d: '市區自行車專用道、共用道與河濱自行車道線形，含路段長度與鋪面類型。', tags: ['自行車', '路網', '地圖'],
      cols: [C('seg_id', 'str', '路段代碼', { id: 'BL-####' }, { pk: true }), C('name', 'str', '路段名稱', { road: 1 }), C('district', 'str', '行政區', { district: 1 }), C('lane_type', 'str', '車道類型', { enum: ['專用道', '人車共道', '河濱車道', '標線分隔'] }), C('length_km', 'float', '長度（公里）', { float: [0.2, 6.8, 2] }), C('surface', 'str', '鋪面', { enum: ['瀝青', '透水鋪面', '水泥'] }), C('geometry', 'geo', '線形', { line: 1 })] },
    { id: 'taxi-stands', t: '計程車招呼站位置', a: 'tra', th: 'transport', f: ['CSV', 'GeoJSON'], fq: 'adhoc', st: 'validating', q: null, rows: 138, dl: 0, upd: '2026-10-22T08:57', v: '0.1', lic: 'cg-open-1', created: '2026-10-22',
      d: '市區計程車招呼站與排班區位置、可停車輛數及設置路段。', tags: ['計程車', '地圖'],
      app: { no: 'APP-2026-0192', by: 'wang', submitted: '2026-10-22T08:57', assignee: 'hsu' },
      cols: PT('TX', ['招呼站', '排班站'], [C('slots', 'int', '可停車輛', { int: [2, 12] })]) },
    { id: 'traffic-volume', t: '主要路口車流量統計', a: 'tra', th: 'transport', f: ['CSV'], fq: 'monthly', st: 'published', q: 82, rows: 9840, dl: 2860, upd: '2026-10-08T10:20', v: '2.9', lic: 'cg-open-1', created: '2022-02-10',
      d: '主要路口車輛偵測器每月平均尖離峰流量，依車種分列。', tags: ['車流', '統計'],
      cols: [C('period', 'date', '統計年月', { month: ['2024-10', '2026-09'] }, { pk: true }), C('junction', 'str', '路口', { road: 2 }, { pk: true }), C('district', 'str', '行政區', { district: 1 }), C('peak_pcu', 'int', '尖峰流量（PCU/時）', { int: [820, 4600] }), C('offpeak_pcu', 'int', '離峰流量', { int: [300, 2200] }), C('heavy_ratio', 'float', '大型車比例', { float: [0.02, 0.21, 3] }, { nul: 0.04 })] },
    { id: 'ferry-schedule', t: '港埕渡輪班表', a: 'tra', th: 'transport', f: ['CSV', 'JSON'], fq: 'quarterly', st: 'published', q: 87, rows: 96, dl: 3420, upd: '2026-10-01T09:00', v: '3.1', lic: 'cg-open-1', created: '2021-05-20',
      d: '港埕—新灣、港埕—鹽田兩條渡輪航線平假日班次時刻與票價。', tags: ['渡輪', '時刻表'],
      cols: [C('trip_id', 'str', '班次', { id: 'FR-###' }, { pk: true }), C('route', 'str', '航線', { enum: ['港埕—新灣', '港埕—鹽田'] }), C('day_type', 'str', '日別', { enum: ['平日', '假日'] }), C('depart', 'str', '開航時刻', { clock: [6, 22] }), C('duration_min', 'int', '航程（分）', { int: [12, 28] }), C('fare', 'int', '全票（元）', { enum: [30, 40, 50] })] },
    { id: 'traffic-accidents', t: '交通事故統計', a: 'tra', th: 'safety', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 76, rows: 5210, dl: 3980, upd: '2026-08-28T16:40', v: '6.8', lic: 'cg-open-1', created: '2019-09-01',
      d: 'A1／A2 類道路交通事故件數、死傷人數，依行政區、肇事型態與時段分列。', tags: ['交通安全', '統計'],
      cols: ST([C('type', 'str', '事故類別', { enum: ['A1', 'A2'] }), C('cases', 'int', '件數', { int: [0, 180] }), C('deaths', 'int', '死亡', { int: [0, 4] }), C('injuries', 'int', '受傷', { int: [0, 230] }), C('hour_band', 'str', '時段', { enum: ['00-06', '06-12', '12-18', '18-24'] }, { nul: 0.06 })]) },

    { id: 'air-quality', fix: fixAirRow, t: '空氣品質監測小時值', a: 'env', th: 'environment', f: ['CSV', 'JSON', 'API'], fq: 'hourly', st: 'published', q: 71, rows: 140160, dl: 24930, upd: '2026-10-22T01:00', v: '7.3', lic: 'cg-open-1', created: '2019-01-10',
      d: '16 座空氣品質監測站每小時 PM2.5、PM10、臭氧與 AQI，含測站狀態註記。', tags: ['空品', 'AQI', 'API'],
      fails: { range: { count: 37, detail: 'pm25 有 37 列為負值（-0.4 ~ -6.2），疑似儀器歸零異常，集中於「鹽田」「北岸工業」兩站。' }, freshness: { detail: '最後成功更新為 01:00，已逾 8 小時（更新頻率每小時，寬限 1.5 倍）。' } },
      cols: [C('site_id', 'str', '測站代碼', { id: 'AQ-##' }, { pk: true }), C('site_name', 'str', '測站', { enum: ['港埕', '北岸', '北岸工業', '舊城', '山腳', '新灣', '新灣港區', '鹽田', '鹽田濕地', '溪洲', '雲嶺', '雲嶺山區', '中正', '文昌', '興港', '望海'] }), C('district', 'str', '行政區', { district: 1 }), C('measured_at', 'date', '監測時間', { datetime: ['2026-10-21T00:00', '2026-10-22T01:00'] }, { pk: true }), C('pm25', 'float', 'PM2.5（μg/m³）', { float: [3, 48, 1] }, { nul: 0.012, neg: 0.03 }), C('pm10', 'float', 'PM10（μg/m³）', { float: [8, 85, 1] }, { nul: 0.01 }), C('o3', 'float', '臭氧（ppb）', { float: [10, 62, 1] }, { nul: 0.02 }), C('aqi', 'int', '空氣品質指標', { int: [18, 112] }), C('status', 'str', '等級', { enum: ['良好', '良好', '普通', '普通', '對敏感族群不健康'] })] },
    { id: 'recycling-points', t: '資源回收站點', a: 'env', th: 'environment', f: ['CSV', 'GeoJSON'], fq: 'monthly', st: 'published', q: 89, rows: 326, dl: 1870, upd: '2026-10-06T11:15', v: '2.4', lic: 'cg-open-1', created: '2021-04-12',
      d: '各里資源回收定點、回收項目與開放時段。', tags: ['回收', '地圖'],
      cols: PT('RC', ['回收站', '資收點'], [C('items', 'str', '回收項目', { enum: ['紙類、塑膠、鐵鋁罐', '全品項', '廢電池、燈管', '舊衣、紙類'] }), C('hours', 'str', '開放時段', { enum: ['週一至週六 08-17', '每日 07-21', '週三、六 09-12'] }, { nul: 0.02 })]) },
    { id: 'garbage-truck', t: '垃圾車清運路線與時刻', a: 'env', th: 'environment', f: ['CSV', 'JSON'], fq: 'weekly', st: 'published', q: 84, rows: 4120, dl: 11260, upd: '2026-10-20T03:00', v: '5.6', lic: 'cg-open-1', created: '2020-06-08',
      d: '垃圾車與資源回收車各停靠點、抵達時刻與清運日。', tags: ['清運', '時刻表'],
      cols: [C('stop_id', 'str', '停靠點', { id: 'GT-#####' }, { pk: true }), C('route', 'str', '路線', { id: '線 ##' }), C('district', 'str', '行政區', { district: 1 }), C('address', 'str', '停靠地點', { address: 1 }), C('arrive', 'str', '抵達時刻', { clock: [16, 22] }), C('weekdays', 'str', '清運日', { enum: ['一二四五六', '一三五', '二四六', '每日（週日除外）'] }), C('lat', 'geo', '緯度', { lat: 1 }, { nul: 0.02 }), C('lng', 'geo', '經度', { lng: 1 }, { nul: 0.02 })] },
    { id: 'noise-monitor', t: '噪音監測結果', a: 'env', th: 'environment', f: ['CSV'], fq: 'quarterly', st: 'published', q: 79, rows: 1248, dl: 640, upd: '2026-07-21T14:30', v: '1.9', lic: 'cg-open-1', created: '2022-08-15',
      d: '一般地區與道路邊噪音監測站之日間、晚間、夜間均能音量。', tags: ['噪音'],
      cols: ST([C('site', 'str', '監測點', { place: ['測站', '路側站'] }), C('leq_day', 'float', '日間 Leq（dB）', { float: [52, 74, 1] }), C('leq_night', 'float', '夜間 Leq（dB）', { float: [44, 66, 1] }, { nul: 0.05 }), C('over_std', 'bool', '超過管制標準', { bool: 0.12 })]) },
    { id: 'river-quality', t: '河川水質監測', a: 'env', th: 'environment', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'review', q: 83, rows: 2760, dl: 0, upd: '2026-10-16T15:20', v: '0.1', lic: 'cg-open-1', created: '2026-10-16',
      d: '溪洲溪、雲嶺溪各測站溶氧、生化需氧量、懸浮固體與氨氮，計算河川污染指數。', tags: ['水質', '河川'],
      app: { no: 'APP-2026-0184', by: 'huang', submitted: '2026-10-16T15:20', assignee: 'hsu' },
      fails: { meta: { warn: true, detail: '「rpi」欄位缺少計算方式說明。' } },
      cols: [C('station', 'str', '測站', { enum: ['溪洲橋', '溪洲出海口', '雲嶺上游', '雲嶺橋', '新灣排水'] }, { pk: true }), C('sampled_on', 'date', '採樣日', { date: ['2024-01-05', '2026-09-28'] }, { pk: true }), C('do_mg', 'float', '溶氧（mg/L）', { float: [2.1, 8.9, 1] }), C('bod_mg', 'float', 'BOD（mg/L）', { float: [0.8, 12.4, 1] }), C('ss_mg', 'float', '懸浮固體（mg/L）', { float: [4, 96, 1] }, { nul: 0.02 }), C('nh3_mg', 'float', '氨氮（mg/L）', { float: [0.05, 4.2, 2] }), C('rpi', 'float', '污染指數', { float: [1, 7.5, 2] })] },

    { id: 'zoning', t: '都市計畫土地使用分區', a: 'urb', th: 'urban', f: ['GeoJSON', 'SHP'], fq: 'quarterly', st: 'published', q: 74, rows: 3184, dl: 6830, upd: '2026-07-15T10:00', v: '3.0', lic: 'cg-open-1', created: '2020-03-30',
      d: '都市計畫範圍內住宅區、商業區、工業區等土地使用分區圖資與計畫案號。', tags: ['都市計畫', '圖資'],
      fails: { geo: { count: 2, detail: '2 筆多邊形自我交錯（self-intersection），位於新灣區 Z-0812、Z-0815，無法轉出 GeoJSON。' } },
      cols: [C('zone_id', 'str', '分區代碼', { id: 'Z-####' }, { pk: true }), C('zone_type', 'str', '使用分區', { enum: ['第一種住宅區', '第二種住宅區', '第三種住宅區', '商業區', '乙種工業區', '公園用地', '學校用地', '機關用地'] }), C('district', 'str', '行政區', { district: 1 }), C('plan_no', 'str', '計畫案號', { id: '澄都計字第 ####### 號' }, { nul: 0.03 }), C('area_m2', 'float', '面積（m²）', { float: [380, 86000, 0] }), C('effective', 'date', '發布實施日', { date: ['1998-05-01', '2026-06-30'] }), C('geometry', 'geo', '範圍', { polygon: 1 })] },
    { id: 'building-permits', t: '建造執照核發統計', a: 'urb', th: 'urban', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 86, rows: 1932, dl: 2310, upd: '2026-10-05T09:30', v: '4.1', lic: 'cg-open-1', created: '2020-01-20',
      d: '每月建造執照核發件數、樓地板面積與工程造價，依用途分類。', tags: ['建築', '統計'],
      cols: ST([C('use_type', 'str', '用途', { enum: ['住宅', '商業', '工業', '公共設施', '混合使用'] }), C('permits', 'int', '核發件數', { int: [0, 46] }), C('floor_area', 'float', '樓地板面積（m²）', { float: [0, 128000, 0] }), C('cost_k', 'int', '工程造價（千元）', { int: [0, 2400000] }, { nul: 0.02 })]) },
    { id: 'urban-renewal', t: '都市更新案件位置', a: 'urb', th: 'urban', f: ['GeoJSON', 'CSV'], fq: 'adhoc', st: 'approval', q: 88, rows: 74, dl: 0, upd: '2026-10-17T10:30', v: '0.2', lic: 'cg-open-1', created: '2026-10-17',
      d: '已核定與審議中之都市更新事業計畫範圍、實施者與進度。', tags: ['都市更新', '地圖'],
      app: { no: 'APP-2026-0186', by: 'chang', submitted: '2026-10-17T10:30', assignee: 'chou', reviewer: 'lin', stageAt: '2026-10-19T16:05', note: '範圍圖已抽查 10 案，與公告圖說一致。' },
      cols: [C('case_id', 'str', '案號', { id: 'UR-###' }, { pk: true }), C('name', 'str', '更新單元', { place: ['更新單元', '整宅更新案'] }), C('district', 'str', '行政區', { district: 1 }), C('stage', 'str', '進度', { enum: ['事業概要', '事業計畫審議', '權利變換', '施工中', '完工'] }), C('area_m2', 'float', '基地面積（m²）', { float: [800, 18000, 0] }), C('approved_on', 'date', '核定日', { date: ['2016-03-01', '2026-09-30'] }, { nul: 0.18 }), C('geometry', 'geo', '範圍', { polygon: 1 })] },
    { id: 'public-housing', fix: (row) => { if (row.status === '興建中') row.rent_min = null; }, t: '社會住宅基本資料', a: 'urb', th: 'welfare', f: ['CSV', 'JSON'], fq: 'quarterly', st: 'published', q: 92, rows: 18, dl: 4760, upd: '2026-10-02T10:00', v: '2.2', lic: 'cg-open-1', created: '2022-05-05',
      d: '已完工與興建中社會住宅之戶數、房型、租金範圍與申請期間。', tags: ['社宅', '住宅'],
      cols: [C('project_id', 'str', '案場代碼', { id: 'SH-##' }, { pk: true }), C('name', 'str', '案名', { place: ['社宅', '青年住宅', '公共住宅'] }), C('district', 'str', '行政區', { district: 1 }), C('units', 'int', '戶數', { int: [86, 820] }), C('rent_min', 'int', '租金下限（元）', { int: [4200, 9000] }), C('rent_max', 'int', '租金上限（元）', { int: [9800, 26000] }), C('status', 'str', '狀態', { enum: ['招租中', '已滿租', '興建中'] }), C('lat', 'geo', '緯度', { lat: 1 }), C('lng', 'geo', '經度', { lng: 1 })] },

    { id: 'low-income', t: '低收入戶與中低收入戶統計', a: 'soc', th: 'welfare', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 80, rows: 1728, dl: 1590, upd: '2026-09-25T09:00', v: '5.0', lic: 'cg-open-1', created: '2019-06-18',
      d: '各行政區低收入戶、中低收入戶戶數與人數，依家庭類型分列。', tags: ['社福', '統計'],
      fails: { schema: { detail: '欄位「申請年度」型別由 int 變為 str（來源檔改填「115年」格式），與 v5.0 結構不一致。' } },
      cols: ST([C('apply_year', 'int', '申請年度', { int: [111, 115] }, { desc: '民國年' }), C('category', 'str', '類別', { enum: ['低收入戶', '中低收入戶'] }), C('households', 'int', '戶數', { int: [120, 2860] }), C('persons', 'int', '人數', { int: [210, 6120] })]) },
    { id: 'ltc-centers', t: '長照服務據點', a: 'soc', th: 'welfare', f: ['CSV', 'GeoJSON'], fq: 'monthly', st: 'approval', q: 90, rows: 244, dl: 0, upd: '2026-10-20T11:40', v: '0.1', lic: 'cg-open-1', created: '2026-10-20',
      d: '長期照顧 A／B／C 級服務據點、服務項目、聯絡電話與服務時間。', tags: ['長照', '地圖'],
      app: { no: 'APP-2026-0188', by: 'li', submitted: '2026-10-20T11:40', assignee: 'chou', reviewer: 'hsu', stageAt: '2026-10-22T09:20', note: '欄位說明完整，座標抽查 20 筆無誤。' },
      cols: PT('LTC', ['長照站', '日照中心', '巷弄長照站'], [C('level', 'str', '據點等級', { enum: ['A', 'B', 'C'] }), C('services', 'str', '服務項目', { enum: ['居家服務、日間照顧', '共餐、健康促進', '喘息服務', '交通接送、輔具'] })]) },
    { id: 'childcare', t: '公私立托嬰中心', a: 'soc', th: 'welfare', f: ['CSV'], fq: 'quarterly', st: 'published', q: 93, rows: 87, dl: 2980, upd: '2026-10-03T14:00', v: '3.3', lic: 'cg-open-1', created: '2021-01-11',
      d: '公設民營與私立托嬰中心名冊、收托人數與評鑑結果。', tags: ['托育'],
      cols: PT('CC', ['托嬰中心', '公共托育家園'], [C('capacity', 'int', '核定收托數', { int: [12, 80] }), C('rating', 'str', '評鑑等第', { enum: ['優等', '甲等', '乙等'] }, { nul: 0.09 })]) },
    { id: 'senior-meals', t: '社區關懷據點共餐', a: 'soc', th: 'welfare', f: ['CSV'], fq: 'quarterly', st: 'published', q: 85, rows: 156, dl: 870, upd: '2026-09-30T16:00', v: '2.0', lic: 'cg-open-1', created: '2022-03-03',
      d: '社區照顧關懷據點共餐服務日、每餐人數與承辦單位。', tags: ['長者', '共餐'],
      cols: PT('SM', ['關懷據點', '社區活動中心'], [C('meal_days', 'str', '共餐日', { enum: ['週一、三、五', '週二、四', '週一至週五'] }), C('seats', 'int', '每餐人數', { int: [15, 60] })]) },
    { id: 'disability-stats', t: '身心障礙者人數統計', a: 'soc', th: 'welfare', f: ['CSV', 'XLSX'], fq: 'quarterly', st: 'published', q: 88, rows: 2304, dl: 760, upd: '2026-10-12T10:00', v: '3.6', lic: 'cg-open-1', created: '2020-07-07',
      d: '依行政區、障礙類別、障礙等級與年齡層統計之身心障礙者人數。', tags: ['社福', '統計'],
      cols: ST([C('category', 'str', '障礙類別', { enum: ['肢體', '聽覺', '視覺', '智能', '慢性精神', '多重'] }), C('severity', 'str', '等級', { enum: ['輕度', '中度', '重度', '極重度'] }), C('persons', 'int', '人數', { int: [3, 940] })]) },

    { id: 'clinics', t: '醫療院所名冊', a: 'hlt', th: 'health', f: ['CSV', 'JSON', 'GeoJSON'], fq: 'monthly', st: 'published', q: 94, rows: 1386, dl: 8640, upd: '2026-10-10T08:30', v: '6.1', lic: 'cg-open-1', created: '2019-02-01',
      d: '醫院、診所與藥局之機構代碼、科別、地址、電話與看診時段。', tags: ['醫療', '地圖'],
      cols: PT('MD', ['診所', '醫院', '藥局', '聯合診所'], [C('category', 'str', '類別', { enum: ['西醫診所', '牙醫診所', '中醫診所', '醫院', '藥局'] }), C('phone', 'str', '電話', { phone: 1 }, { nul: 0.01 })]) },
    { id: 'flu-vaccine', t: '流感疫苗合約院所', a: 'hlt', th: 'health', f: ['CSV', 'JSON'], fq: 'weekly', st: 'published', q: 90, rows: 312, dl: 6120, upd: '2026-10-19T17:00', v: '2.7', lic: 'cg-open-1', created: '2023-09-25',
      d: '本季公費流感疫苗合約院所、剩餘劑量與接種時段，每週更新。', tags: ['疫苗', '季節性'],
      cols: PT('FV', ['診所', '衛生所', '醫院'], [C('doses_left', 'int', '剩餘劑量', { int: [0, 480] }), C('hours', 'str', '接種時段', { enum: ['週一至週五 上午', '週一至週六 全日', '週二、四 下午'] })]) },
    { id: 'food-inspection', t: '食品抽驗結果', a: 'hlt', th: 'health', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 78, rows: 2640, dl: 1430, upd: '2026-08-30T15:10', v: '4.4', lic: 'cg-open-1', created: '2020-04-14',
      d: '市售與餐飲業食品抽驗品項、檢驗項目、結果與處分情形。', tags: ['食安'],
      cols: [C('case_no', 'str', '抽驗編號', { id: '食抽-#####' }, { pk: true }), C('sampled_on', 'date', '抽驗日', { date: ['2025-09-01', '2026-07-31'] }), C('district', 'str', '行政區', { district: 1 }), C('item', 'str', '品項', { enum: ['蔬菜', '水果', '豆製品', '冰品', '肉品', '水產', '飲料', '烘焙'] }), C('test', 'str', '檢驗項目', { enum: ['農藥殘留', '防腐劑', '大腸桿菌群', '重金屬', '動物用藥'] }), C('passed', 'bool', '合格', { bool: 0.94 })] },
    { id: 'aed-locations', t: 'AED 設置地點', a: 'hlt', th: 'safety', f: ['CSV', 'GeoJSON'], fq: 'monthly', st: 'published', q: 92, rows: 1054, dl: 5880, upd: '2026-10-14T09:00', v: '3.8', lic: 'public-domain', created: '2020-10-20',
      d: '公共場所自動體外心臟電擊去顫器設置場所、樓層位置與開放時間。', tags: ['急救', '地圖'],
      cols: PT('AED', ['車站', '國小', '活動中心', '體育館', '市場', '圖書館'], [C('floor', 'str', '設置位置', { enum: ['1F 服務台', '1F 大廳', 'B1 警衛室', '2F 走廊'] }), C('open_24h', 'bool', '24 小時可取用', { bool: 0.38 })]) },
    { id: 'dengue-cases', t: '登革熱病例統計', a: 'hlt', th: 'health', f: ['CSV'], fq: 'weekly', st: 'review', q: 86, rows: 416, dl: 0, upd: '2026-10-20T16:45', v: '0.1', lic: 'cg-open-1', created: '2026-10-20',
      d: '本土與境外移入登革熱確定病例數，依行政區與發病週別統計。', tags: ['防疫', '統計'],
      app: { no: 'APP-2026-0189', by: 'wu', submitted: '2026-10-20T16:45', assignee: 'lin' },
      cols: [C('epi_week', 'str', '發病週別', { id: '2026-W##' }, { pk: true }), C('district', 'str', '行政區', { district: 1 }, { pk: true }), C('local_cases', 'int', '本土病例', { int: [0, 6] }), C('imported_cases', 'int', '境外移入', { int: [0, 3] })] },

    { id: 'schools', t: '各級學校名錄', a: 'edu', th: 'education', f: ['CSV', 'JSON', 'GeoJSON'], fq: 'yearly', st: 'published', q: 96, rows: 284, dl: 7920, upd: '2026-08-20T10:00', v: '8.0', lic: 'cg-open-1', created: '2019-01-02',
      d: '公私立國小、國中、高中職與大專校院名錄、地址、電話與學區。', tags: ['學校', '地圖'],
      cols: PT('SC', ['國小', '國中', '高中', '高工', '實驗小學'], [C('level', 'str', '學制', { enum: ['國小', '國中', '高中', '高職', '大專'] }), C('public', 'bool', '公立', { bool: 0.82 })]) },
    { id: 'student-stats', t: '學生人數統計', a: 'edu', th: 'education', f: ['CSV', 'XLSX'], fq: 'yearly', st: 'published', q: 91, rows: 3408, dl: 2150, upd: '2026-09-15T10:00', v: '6.0', lic: 'cg-open-1', created: '2019-01-02',
      d: '各學年度各級學校班級數、學生數與教師數，依行政區與性別分列。', tags: ['教育', '統計'],
      cols: ST([C('level', 'str', '學制', { enum: ['國小', '國中', '高中', '高職'] }), C('classes', 'int', '班級數', { int: [6, 220] }), C('students', 'int', '學生數', { int: [120, 6400] }), C('teachers', 'int', '教師數', { int: [12, 480] })], 'year') },
    { id: 'after-school', t: '課後照顧班', a: 'edu', th: 'education', f: ['CSV'], fq: 'half', st: 'published', q: 80, rows: 412, dl: 690, upd: '2026-09-05T13:00', v: '2.3', lic: 'cg-open-1', created: '2022-02-14',
      d: '國小課後照顧班開班校數、班級數、收費與弱勢學生補助人數。', tags: ['課後照顧'],
      cols: [C('school', 'str', '學校', { place: ['國小'] }, { pk: true }), C('district', 'str', '行政區', { district: 1 }), C('classes', 'int', '班級數', { int: [1, 9] }), C('fee', 'int', '月費（元）', { int: [2600, 4800] }, { nul: 0.04 }), C('subsidized', 'int', '補助人數', { int: [0, 64] })] },
    { id: 'school-lunch', t: '學校午餐食材登錄', a: 'edu', th: 'education', f: ['CSV', 'JSON'], fq: 'daily', st: 'published', q: 83, rows: 98420, dl: 1260, upd: '2026-10-22T02:30', v: '9.4', lic: 'cg-open-1', created: '2021-08-30',
      d: '各校每日午餐菜單、食材品項、供應商與產地標示。', tags: ['午餐', '食材'],
      cols: [C('served_on', 'date', '供餐日', { date: ['2026-09-01', '2026-10-21'] }, { pk: true }), C('school', 'str', '學校', { place: ['國小', '國中'] }, { pk: true }), C('dish', 'str', '菜色', { enum: ['滷雞腿', '三杯豆腐', '炒高麗菜', '紅燒魚丁', '味噌湯', '咖哩飯', '番茄炒蛋', '地瓜飯'] }), C('ingredient', 'str', '食材', { enum: ['雞腿', '板豆腐', '高麗菜', '鯛魚', '豆腐', '馬鈴薯', '番茄', '雞蛋', '地瓜'] }), C('origin', 'str', '產地', { enum: ['澄港市', '雲嶺區', '溪洲區', '國產', '進口'] }, { nul: 0.03 }), C('supplier', 'str', '供應商', { enum: ['溪洲農會', '鹽田漁產行', '雲嶺有機合作社', '港埕食品'] })] },

    { id: 'library-branches', t: '市立圖書館分館', a: 'cul', th: 'culture', f: ['CSV', 'GeoJSON'], fq: 'quarterly', st: 'published', q: 95, rows: 42, dl: 1980, upd: '2026-10-01T10:00', v: '2.1', lic: 'cg-open-1', created: '2021-06-01',
      d: '市立圖書館總館與各分館地址、開館時間、館藏量與閱覽座位數。', tags: ['圖書館', '地圖'],
      cols: PT('LB', ['分館', '圖書館'], [C('collection', 'int', '館藏冊數', { int: [18000, 420000] }), C('seats', 'int', '閱覽座位', { int: [40, 620] })]) },
    { id: 'heritage', t: '文化資產列冊', a: 'cul', th: 'culture', f: ['CSV', 'GeoJSON'], fq: 'adhoc', st: 'published', q: 89, rows: 168, dl: 2470, upd: '2026-09-18T15:30', v: '3.2', lic: 'cg-open-1', created: '2020-02-20',
      d: '市定古蹟、歷史建築、紀念建築與聚落建築群之指定公告與位置。', tags: ['古蹟', '地圖'],
      cols: PT('HR', ['古厝', '紀念館', '洋樓', '廟', '舊倉庫'], [C('category', 'str', '類別', { enum: ['市定古蹟', '歷史建築', '紀念建築', '聚落建築群'] }), C('listed_on', 'date', '公告日', { date: ['1985-01-01', '2026-06-30'] })]) },
    { id: 'arts-events', t: '藝文活動', a: 'cul', th: 'culture', f: ['JSON', 'XML', 'API'], fq: 'daily', st: 'published', q: 87, rows: 1840, dl: 12380, upd: '2026-10-22T03:00', v: '7.7', lic: 'cg-open-1', created: '2019-04-01',
      d: '展覽、表演、講座與節慶活動之時間、地點、票價與主辦單位。', tags: ['活動', 'API'],
      cols: [C('event_id', 'str', '活動代碼', { id: 'EV-#####' }, { pk: true }), C('title', 'str', '活動名稱', { enum: ['港邊爵士夜', '舊城散步導覽', '雲嶺山歌會', '鹽田光影展', '新灣市集音樂節', '溪洲稻草藝術季'] }), C('category', 'str', '類別', { enum: ['展覽', '音樂', '戲劇', '講座', '節慶'] }), C('starts_on', 'date', '開始日', { date: ['2026-10-01', '2026-12-31'] }), C('venue', 'str', '地點', { place: ['藝文中心', '演藝廳', '文化園區', '圖書館'] }), C('price', 'int', '票價（元）', { int: [0, 1200] }, { nul: 0.04 })] },
    { id: 'library-loans', t: '圖書借閱統計', a: 'cul', th: 'culture', f: ['CSV'], fq: 'monthly', st: 'draft', q: null, rows: 1440, dl: 0, upd: '2026-10-21T17:20', v: '0.0', lic: 'cg-open-1', created: '2026-10-21T17:20',
      d: '各分館每月借閱冊數、借閱人次與熱門分類號。', tags: ['圖書館', '統計'],
      app: { no: '草稿', by: 'cheng', submitted: null, assignee: null },
      cols: ST([C('branch', 'str', '分館', { place: ['分館'] }), C('loans', 'int', '借閱冊數', { int: [1200, 46000] }), C('borrowers', 'int', '借閱人次', { int: [420, 15800] })]) },

    { id: 'road-works', fix: (row) => { if (row.ends_on < row.starts_on) [row.starts_on, row.ends_on] = [row.ends_on, row.starts_on]; }, t: '道路挖掘施工路段', a: 'pwb', th: 'works', f: ['GeoJSON', 'CSV'], fq: 'daily', st: 'published', q: 77, rows: 528, dl: 4390, upd: '2026-10-21T04:05', v: '6.3', lic: 'cg-open-1', created: '2020-09-09',
      d: '核准之道路挖掘施工路段、施工期間、管線單位與交通維持措施。', tags: ['施工', '地圖'],
      fails: { encoding: { detail: '來源檔非 UTF-8（偵測為 Big5），第 1 列即解碼失敗。' } },
      cols: [C('permit_no', 'str', '許可證號', { id: '挖字 ######' }, { pk: true }), C('road', 'str', '路段', { road: 1 }), C('district', 'str', '行政區', { district: 1 }), C('utility', 'str', '管線單位', { enum: ['自來水', '電力', '電信', '天然氣', '污水下水道'] }), C('starts_on', 'date', '開工日', { date: ['2026-09-20', '2026-10-30'] }), C('ends_on', 'date', '完工日', { date: ['2026-10-25', '2026-12-31'] }), C('geometry', 'geo', '施工範圍', { line: 1 })] },
    { id: 'streetlights', t: '路燈設施位置', a: 'pwb', th: 'works', f: ['CSV', 'GeoJSON', 'SHP'], fq: 'monthly', st: 'published', q: 91, rows: 68420, dl: 1640, upd: '2026-10-09T10:00', v: '4.0', lic: 'cg-open-1', created: '2020-12-01',
      d: '市管路燈桿號、燈具型式、功率與座標。', tags: ['路燈', '地圖'],
      cols: [C('pole_no', 'str', '桿號', { id: 'SL-######' }, { pk: true }), C('district', 'str', '行政區', { district: 1 }), C('lamp', 'str', '燈具', { enum: ['LED 120W', 'LED 90W', 'LED 60W', '高壓鈉燈 150W'] }), C('watts', 'int', '功率（W）', { enum: [60, 90, 120, 150] }), C('lat', 'geo', '緯度', { lat: 1 }), C('lng', 'geo', '經度', { lng: 1 }), C('installed', 'date', '設置日', { date: ['2008-01-01', '2026-09-30'] }, { nul: 0.06 })] },
    { id: 'parks', t: '公園綠地', a: 'pwb', th: 'works', f: ['GeoJSON', 'CSV'], fq: 'quarterly', st: 'published', q: 93, rows: 412, dl: 3060, upd: '2026-10-02T09:00', v: '3.5', lic: 'cg-open-1', created: '2020-05-18',
      d: '鄰里公園、綠地與廣場之範圍、面積與遊戲設施。', tags: ['公園', '地圖'],
      cols: PT('PA', ['公園', '綠地', '廣場'], [C('area_m2', 'float', '面積（m²）', { float: [300, 64000, 0] }), C('playground', 'bool', '兒童遊戲場', { bool: 0.46 })]) },
    { id: 'manholes', t: '雨水下水道人孔', a: 'pwb', th: 'works', f: ['SHP', 'GeoJSON'], fq: 'yearly', st: 'validating', q: null, rows: 23816, dl: 0, upd: '2026-10-22T09:05', v: '0.1', lic: 'restricted', created: '2026-10-22',
      d: '雨水下水道人孔編號、深度、管徑與座標，供防汛與施工比對。', tags: ['防汛', '圖資'],
      app: { no: 'APP-2026-0193', by: 'liu', submitted: '2026-10-22T09:05', assignee: 'chen' },
      cols: [C('mh_no', 'str', '人孔編號', { id: 'MH-######' }, { pk: true }), C('district', 'str', '行政區', { district: 1 }), C('depth_m', 'float', '深度（m）', { float: [0.8, 5.6, 2] }), C('pipe_mm', 'int', '管徑（mm）', { enum: [400, 600, 800, 1000, 1200] }), C('lat', 'geo', '緯度', { lat: 1 }), C('lng', 'geo', '經度', { lng: 1 })] },
    { id: 'sidewalks', t: '人行道改善工程', a: 'pwb', th: 'works', f: ['CSV'], fq: 'quarterly', st: 'published', q: 81, rows: 96, dl: 520, upd: '2026-09-26T14:00', v: '1.4', lic: 'cg-open-1', created: '2023-04-10',
      d: '人行道拓寬、無障礙坡道與路平專案之路段、經費與完工日期。', tags: ['人行道', '工程'],
      cols: [C('project_no', 'str', '工程編號', { id: 'SW-###' }, { pk: true }), C('road', 'str', '路段', { road: 1 }), C('district', 'str', '行政區', { district: 1 }), C('length_m', 'int', '長度（m）', { int: [80, 1600] }), C('budget_k', 'int', '經費（千元）', { int: [600, 42000] }), C('done_on', 'date', '完工日', { date: ['2024-03-01', '2026-12-31'] }, { nul: 0.2 })] },

    { id: 'markets', t: '公有市場攤位資訊', a: 'eco', th: 'economy', f: ['CSV'], fq: 'quarterly', st: 'returned', q: 68, rows: 1284, dl: 0, upd: '2026-10-15T10:30', v: '0.1', lic: 'cg-open-1', created: '2026-10-15',
      d: '公有零售市場攤位編號、營業項目、面積與承租狀態。', tags: ['市場'],
      app: { no: 'APP-2026-0185', by: 'yang', submitted: '2026-10-15T10:30', assignee: 'chen', reviewer: 'chen', stageAt: '2026-10-22T08:40', note: '4 個欄位缺少說明；攤位面積單位混用坪與平方公尺。' },
      fails: { meta: { count: 4, detail: '4 個欄位缺少說明：stall_no、zone、trade、area。' }, consistency: { warn: true, detail: 'area 欄位單位混用（坪、m²），約 12% 列需換算。' } },
      cols: [C('market', 'str', '市場', { enum: ['港埕第一市場', '舊城市場', '北岸市場', '新灣市場', '鹽田市場'] }, { pk: true }), C('stall_no', 'str', '攤位編號', { id: 'A-###' }, { pk: true }), C('zone', 'str', '區域', { enum: ['生鮮區', '熟食區', '乾貨區', '蔬果區'] }), C('trade', 'str', '營業項目', { enum: ['豬肉', '雞鴨', '海產', '蔬菜', '水果', '南北貨', '小吃'] }, { nul: 0.07 }), C('area', 'str', '面積', { enum: ['3 坪', '4 坪', '9.9 m²', '13.2 m²'] }), C('leased', 'bool', '承租中', { bool: 0.86 })] },
    { id: 'factories', t: '工廠登記清冊', a: 'eco', th: 'economy', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 85, rows: 4126, dl: 2730, upd: '2026-10-07T09:00', v: '5.9', lic: 'cg-open-1', created: '2019-11-11',
      d: '已登記工廠名稱、產業類別、登記地址與設立日期。', tags: ['工廠', '產業'],
      cols: PT('FT', ['工業', '實業', '精密', '食品廠'], [C('industry', 'str', '產業類別', { enum: ['金屬製品', '食品製造', '塑膠製品', '電子零組件', '機械設備'] })]) },
    { id: 'company-stats', t: '公司登記統計', a: 'eco', th: 'economy', f: ['CSV'], fq: 'monthly', st: 'published', q: 88, rows: 960, dl: 1920, upd: '2026-10-06T09:00', v: '4.2', lic: 'cg-open-1', created: '2020-01-15',
      d: '每月新設立、解散與現存公司家數及資本額，依行業別統計。', tags: ['產業', '統計'],
      cols: ST([C('industry', 'str', '行業', { enum: ['批發零售', '營造', '製造', '住宿餐飲', '資訊通訊', '專業服務'] }), C('new_cos', 'int', '新設家數', { int: [0, 84] }), C('dissolved', 'int', '解散家數', { int: [0, 40] }), C('capital_m', 'float', '新設資本額（百萬元）', { float: [0, 960, 1] })]) },
    { id: 'night-markets', t: '夜市與商圈', a: 'eco', th: 'tourism', f: ['CSV', 'GeoJSON'], fq: 'yearly', st: 'published', q: 81, rows: 24, dl: 3340, upd: '2026-03-12T10:00', v: '2.0', lic: 'cg-open-1', created: '2021-03-01',
      d: '市內夜市與特色商圈之營業日、攤商數與周邊停車資訊。', tags: ['夜市', '觀光'],
      cols: PT('NM', ['夜市', '商圈', '觀光市集'], [C('open_days', 'str', '營業日', { enum: ['每日', '週二、四、六', '週五至週日'] }), C('stalls', 'int', '攤商數', { int: [40, 420] })]) },

    { id: 'hydrants', t: '消防栓位置', a: 'fire', th: 'safety', f: ['CSV', 'GeoJSON'], fq: 'quarterly', st: 'published', q: 94, rows: 9612, dl: 1310, upd: '2026-10-01T08:00', v: '3.9', lic: 'cg-open-1', created: '2020-08-08',
      d: '地上式與地下式消防栓編號、口徑、水壓檢測結果與座標。', tags: ['消防', '地圖'],
      cols: [C('hydrant_no', 'str', '編號', { id: 'FH-#####' }, { pk: true }), C('district', 'str', '行政區', { district: 1 }), C('type', 'str', '型式', { enum: ['地上式', '地下式'] }), C('bore_mm', 'int', '口徑（mm）', { enum: [65, 100, 150] }), C('pressure_ok', 'bool', '水壓合格', { bool: 0.96 }), C('lat', 'geo', '緯度', { lat: 1 }), C('lng', 'geo', '經度', { lng: 1 })] },
    { id: 'fire-stats', t: '火災出勤統計', a: 'fire', th: 'safety', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 90, rows: 1152, dl: 1080, upd: '2026-10-11T09:00', v: '4.6', lic: 'cg-open-1', created: '2019-05-05',
      d: '各分隊火災出勤次數、起火原因、財物損失與傷亡人數。', tags: ['消防', '統計'],
      cols: ST([C('cause', 'str', '起火原因', { enum: ['電氣因素', '爐火烹調', '菸蒂', '縱火', '其他'] }), C('dispatches', 'int', '出勤次數', { int: [0, 48] }), C('loss_k', 'int', '財損（千元）', { int: [0, 18000] }, { nul: 0.03 }), C('casualties', 'int', '傷亡', { int: [0, 5] })]) },
    { id: 'shelters', t: '避難收容處所', a: 'fire', th: 'safety', f: ['CSV', 'GeoJSON', 'JSON'], fq: 'quarterly', st: 'published', q: 97, rows: 318, dl: 6510, upd: '2026-10-04T10:00', v: '5.1', lic: 'public-domain', created: '2019-07-15',
      d: '天然災害避難收容處所名稱、收容人數、適用災別與無障礙設施。', tags: ['防災', '地圖'],
      cols: PT('SH', ['國小', '活動中心', '體育館', '國中'], [C('capacity', 'int', '收容人數', { int: [60, 1200] }), C('hazards', 'str', '適用災別', { enum: ['水災、地震', '地震', '水災、地震、海嘯', '土石流'] }), C('accessible', 'bool', '無障礙', { bool: 0.88 })]) },
    { id: 'ems-response', t: '緊急救護反應時間', a: 'fire', th: 'safety', f: ['CSV'], fq: 'monthly', st: 'review', q: 84, rows: 864, dl: 0, upd: '2026-10-21T10:15', v: '0.1', lic: 'cg-open-1', created: '2026-10-21',
      d: '各分隊緊急救護案件數、平均出勤反應時間與到院前心肺停止救活率。', tags: ['救護', '統計'],
      app: { no: 'APP-2026-0190', by: 'hsieh', submitted: '2026-10-21T10:15', assignee: 'hsu' },
      cols: ST([C('squad', 'str', '分隊', { place: ['分隊'] }), C('cases', 'int', '救護案件', { int: [80, 920] }), C('avg_response_s', 'float', '平均反應時間（秒）', { float: [210, 540, 0] }), C('ohca_rosc', 'float', 'OHCA 救活率', { float: [0.08, 0.31, 3] }, { nul: 0.05 })]) },

    { id: 'population', t: '各區人口統計', a: 'civ', th: 'population', f: ['CSV', 'XLSX', 'JSON'], fq: 'monthly', st: 'published', q: 98, rows: 2304, dl: 18240, upd: '2026-10-05T09:00', v: '9.9', lic: 'public-domain', created: '2018-12-01',
      d: '各行政區、里別之戶數與人口數，依性別與年齡層分列，每月 5 日前更新。', tags: ['人口', '統計'],
      cols: ST([C('village', 'str', '里別', { place: ['里'] }, { pk: true }), C('households', 'int', '戶數', { int: [380, 4200] }), C('male', 'int', '男', { int: [520, 6100] }), C('female', 'int', '女', { int: [540, 6400] }), C('age_65_ratio', 'float', '65 歲以上比例', { float: [0.11, 0.29, 3] })]) },
    { id: 'marriages', t: '結婚離婚登記', a: 'civ', th: 'population', f: ['CSV'], fq: 'monthly', st: 'published', q: 92, rows: 1536, dl: 1120, upd: '2026-10-05T09:10', v: '6.0', lic: 'public-domain', created: '2019-01-05',
      d: '各戶政事務所每月結婚、離婚登記對數，依配偶國籍分列。', tags: ['戶政', '統計'],
      cols: ST([C('marriages', 'int', '結婚對數', { int: [18, 240] }), C('divorces', 'int', '離婚對數', { int: [6, 96] }), C('foreign_spouse', 'int', '外籍配偶', { int: [0, 28] })]) },
    { id: 'village-offices', t: '里辦公處', a: 'civ', th: 'population', f: ['CSV', 'GeoJSON'], fq: 'adhoc', st: 'published', q: 87, rows: 318, dl: 1460, upd: '2026-08-12T10:00', v: '3.0', lic: 'cg-open-1', created: '2019-03-03',
      d: '各里辦公處地址、電話與里長姓名。', tags: ['里', '地圖'],
      cols: PT('VO', ['里辦公處'], [C('phone', 'str', '電話', { phone: 1 }, { nul: 0.02 })]) },
    { id: 'polling-places', t: '投開票所位置', a: 'civ', th: 'population', f: ['CSV', 'GeoJSON'], fq: 'adhoc', st: 'approval', q: 91, rows: 486, dl: 0, upd: '2026-10-18T16:00', v: '0.1', lic: 'cg-open-1', created: '2026-10-18',
      d: '2026 年地方公職人員選舉投開票所編號、地點、所屬里別與無障礙設施。', tags: ['選舉', '地圖'],
      app: { no: 'APP-2026-0187', by: 'kuo', submitted: '2026-10-18T16:00', assignee: 'chou', reviewer: 'chen', stageAt: '2026-10-21T11:30', note: '與選務系統比對 486 筆無差異。' },
      cols: PT('PP', ['國小', '活動中心', '里辦公處'], [C('station_no', 'int', '投開票所編號', { int: [1, 486] }), C('accessible', 'bool', '無障礙', { bool: 0.93 })]) },

    { id: 'budget', t: '總預算歲出', a: 'bud', th: 'finance', f: ['CSV', 'XLSX', 'JSON'], fq: 'yearly', st: 'published', q: 95, rows: 2860, dl: 5210, upd: '2026-01-15T10:00', v: '12.0', lic: 'public-domain', created: '2018-01-15',
      d: '年度總預算歲出依機關、政事別與經資門分列之預算數。', tags: ['預算', '財政'],
      cols: [C('fiscal_year', 'int', '年度', { int: [2022, 2026] }, { pk: true }), C('agency', 'str', '機關', { enum: ['交通局', '工務局', '社會局', '教育局', '衛生局', '環保局', '文化局', '消防局'] }, { pk: true }), C('function', 'str', '政事別', { enum: ['教育科學文化', '社會福利', '經濟發展', '社區發展及環保', '一般政務'] }), C('capital', 'bool', '資本門', { bool: 0.3 }), C('amount_k', 'int', '預算數（千元）', { int: [1200, 4800000] })] },
    { id: 'cpi', t: '消費者物價指數', a: 'bud', th: 'finance', f: ['CSV'], fq: 'monthly', st: 'published', q: 93, rows: 1248, dl: 3120, upd: '2026-10-08T16:00', v: '7.1', lic: 'public-domain', created: '2018-02-01',
      d: '本市消費者物價總指數與七大類指數（基期 2021 = 100）。', tags: ['物價', '統計'],
      cols: [C('period', 'date', '統計年月', { month: ['2016-01', '2026-09'] }, { pk: true }), C('category', 'str', '類別', { enum: ['總指數', '食物', '衣著', '居住', '交通', '醫藥保健', '教養娛樂', '雜項'] }, { pk: true }), C('index', 'float', '指數', { float: [92, 112, 2] }), C('yoy', 'float', '年增率', { float: [-0.015, 0.045, 4] })] },
    { id: 'household-income', t: '家庭收支調查', a: 'bud', th: 'finance', f: ['CSV', 'XLSX'], fq: 'yearly', st: 'published', q: 88, rows: 640, dl: 1470, upd: '2026-08-31T10:00', v: '5.0', lic: 'public-domain', created: '2019-08-31',
      d: '家庭可支配所得、消費支出與儲蓄，依所得五等分位組分列。', tags: ['所得', '統計'],
      cols: ST([C('quintile', 'str', '五等分位', { enum: ['第一分位', '第二分位', '第三分位', '第四分位', '第五分位'] }), C('income_k', 'int', '可支配所得（千元）', { int: [380, 2600] }), C('spend_k', 'int', '消費支出（千元）', { int: [320, 1480] })], 'year') },

    { id: 'attractions', t: '觀光景點', a: 'tour', th: 'tourism', f: ['JSON', 'CSV', 'GeoJSON'], fq: 'quarterly', st: 'published', q: 86, rows: 186, dl: 9870, upd: '2026-09-29T10:00', v: '4.3', lic: 'cg-open-1', created: '2019-05-20',
      d: '景點名稱、簡介、開放時間、票價、交通方式與座標。', tags: ['景點', '地圖'],
      cols: PT('AT', ['老街', '燈塔', '步道', '濕地', '觀景台', '漁港'], [C('fee', 'int', '門票（元）', { int: [0, 300] }, { nul: 0.03 }), C('category', 'str', '類型', { enum: ['自然生態', '歷史人文', '海港漁村', '親子休閒'] })]) },
    { id: 'hotels', t: '旅宿登記', a: 'tour', th: 'tourism', f: ['CSV', 'JSON'], fq: 'monthly', st: 'published', q: 89, rows: 642, dl: 2890, upd: '2026-10-13T09:00', v: '3.7', lic: 'cg-open-1', created: '2020-03-10',
      d: '合法旅館與民宿登記證號、房間數、地址與聯絡電話。', tags: ['住宿'],
      cols: PT('HT', ['旅店', '民宿', '飯店', '商旅'], [C('license_no', 'str', '登記證號', { id: '澄旅字 ####' }), C('rooms', 'int', '房間數', { int: [3, 280] })]) },
    { id: 'visitor-counts', t: '主要景點遊客人次', a: 'tour', th: 'tourism', f: ['CSV', 'XLSX'], fq: 'monthly', st: 'published', q: 75, rows: 2232, dl: 1580, upd: '2026-08-20T10:00', v: '4.8', lic: 'cg-open-1', created: '2019-05-20',
      d: '主要觀光遊憩據點每月遊客人次，依計數方式註記。', tags: ['觀光', '統計'],
      cols: ST([C('spot', 'str', '據點', { place: ['老街', '燈塔', '濕地', '漁港'] }), C('visitors', 'int', '遊客人次', { int: [1200, 186000] }), C('method', 'str', '計數方式', { enum: ['售票', '電子計數器', '推估'] }, { nul: 0.08 })]) },

    { id: 'land-prices', t: '公告土地現值', a: 'land', th: 'urban', f: ['CSV', 'XLSX'], fq: 'yearly', st: 'published', q: 90, rows: 412360, dl: 7480, upd: '2026-01-02T10:00', v: '6.0', lic: 'cg-open-1', created: '2020-01-02',
      d: '各地段地號之公告土地現值（元／平方公尺），每年 1 月 1 日公告。', tags: ['地價'],
      cols: [C('section', 'str', '地段', { place: ['段'] }, { pk: true }), C('parcel', 'str', '地號', { id: '####-####' }, { pk: true }), C('district', 'str', '行政區', { district: 1 }), C('value_per_m2', 'int', '公告現值（元/m²）', { int: [3200, 286000] }), C('year', 'int', '公告年度', { int: [2026, 2026] })] },
    { id: 'property-transfer', t: '不動產買賣移轉統計', a: 'land', th: 'economy', f: ['CSV'], fq: 'monthly', st: 'published', q: 87, rows: 1920, dl: 6970, upd: '2026-10-09T10:00', v: '5.5', lic: 'cg-open-1', created: '2020-02-15',
      d: '各行政區建物買賣移轉棟數與土地移轉筆數。', tags: ['不動產', '統計'],
      cols: ST([C('buildings', 'int', '建物移轉棟數', { int: [18, 620] }), C('parcels', 'int', '土地移轉筆數', { int: [40, 1240] }), C('first_time_ratio', 'float', '首購比例', { float: [0.18, 0.52, 3] })]) },
  ];

  /* ------------------------------------------------------------------
   * 由 RAW 建立完整資料集物件
   * ------------------------------------------------------------------ */
  const seqByAgency = {};
  const datasets = RAW.map((r) => {
    const ag = AGENCIES[r.a];
    seqByAgency[r.a] = (seqByAgency[r.a] || 0) + 1;
    const rand = rng('ds:' + r.id);
    // 五個品質構面：平台普遍「詮釋資料」最弱、「完整性」「一致性」較好；
    // 驗證失敗的資料集正確性偏低、逾期的時效性偏低。平移後平均仍等於總分
    const dims = {};
    if (r.q != null) {
      const bias = { complete: 3, valid: 2, timely: -2, consistent: 3, meta: -6 };
      const f = r.fails || {};
      if (f.range || f.schema || f.geo || f.encoding) bias.valid -= 14;
      const w = FREQS[r.fq].window;
      if (w && r.st === 'published' && NOW_BASE - time(r.upd) > w * 1.5) bias.timely -= 22;
      if (f.meta) bias.meta -= 10;
      const raw = QUALITY_DIMS.map((d) => r.q + bias[d.key] + (rand() - 0.5) * 8);
      const shift = r.q - raw.reduce((a, b) => a + b, 0) / raw.length;
      QUALITY_DIMS.forEach((d, i) => { dims[d.key] = clamp(Math.round(raw[i] + shift), 35, 100); });
    }
    // 近 12 週下載：以 30 日下載量為基準，加上緩升趨勢與雜訊
    const weekBase = r.dl * 7 / 30;
    const weekly = Array.from({ length: 12 }, (_, i) => Math.max(0, Math.round(weekBase * (0.82 + i * 0.018 + (rand() - 0.5) * 0.22))));
    const app = r.app ? {
      no: r.app.no, by: r.app.by, assignee: r.app.assignee, reviewer: r.app.reviewer || null, note: r.app.note || '',
      submitted: r.app.submitted ? time(r.app.submitted) : null,
      stageAt: r.app.stageAt ? time(r.app.stageAt) : (r.app.submitted ? time(r.app.submitted) : null),
    } : null;
    return {
      id: r.id,
      code: `${ag.code}-${String(seqByAgency[r.a]).padStart(3, '0')}`,
      title: r.t,
      agency: r.a,
      theme: r.th,
      formats: r.f,
      freq: r.fq,
      status: r.st,
      quality: r.q,
      dims,
      rows: r.rows,
      cols: r.cols.length,
      columns: r.cols,
      downloads30: r.dl,
      weekly,
      updated: time(r.upd),
      created: time(r.created),
      version: 'v' + r.v,
      license: r.lic,
      desc: r.d,
      tags: r.tags,
      paused: false,
      app,
      fails: r.fails || {},
      contact: ag.contact,
      fixRow: r.fix || null,
    };
  });
  const byId = new Map(datasets.map((d) => [d.id, d]));

  /* ------------------------------------------------------------------
   * 失敗工作（昨夜批次到現在）
   * ------------------------------------------------------------------ */
  const JOBS_RAW = [
    { id: 'JOB-1022-0931', ds: 'bus-eta', stage: 'extract', error: 'HTTPError 504', msg: '來源 API 逾時（30 秒）：GET /v2/eta/stops', attempts: 2, max: 3, started: '2026-10-22T09:29', next: '2026-10-22T09:47', transient: true,
      log: [['info', '工作開始：bus-eta（排程 */5 * * * *）'], ['info', 'GET https://api.tra.chenggang.gov.example/v2/eta/stops?page=1'], ['info', '已取得 14 / 27 頁，累計 668 列'], ['warn', 'page=15 回應時間 18.2 秒，超過警戒值 10 秒'], ['err', 'HTTPError 504 Gateway Timeout（等待 30.0 秒）'], ['info', '依退避策略排入重試：第 2 次，15 分鐘後'], ['warn', '本次不覆寫既有版本，API 持續提供 09:26 之資料']] },
    { id: 'JOB-1022-0932', ds: 'parking-avail', stage: 'publish', error: 'PublishError 403', msg: 'CDN 快取清除請求被拒（服務權杖過期）', attempts: 1, max: 3, started: '2026-10-22T09:32', next: '2026-10-22T09:52', transient: true,
      log: [['info', '工作開始：parking-avail'], ['ok', '擷取完成：64 列（0.8 秒）'], ['ok', '驗證通過：9 / 9 條規則'], ['ok', '轉換完成：CSV、JSON、API 快照'], ['info', '寫入平台儲存區 v3.4+20261022.0932'], ['err', 'POST /cdn/purge → 403 Forbidden：token expired（簽發於 2026-09-22）'], ['warn', '新版本已寫入，但 CDN 仍提供舊快取（最長 10 分鐘）'], ['info', '已通知平台維運：輪替服務權杖後自動重試']] },
    { id: 'JOB-1022-0205', ds: 'air-quality', stage: 'validate', error: 'ValidationError', msg: 'pm25 欄位 37 列為負值（範圍規則 0–500）', attempts: 3, max: 3, started: '2026-10-22T02:05', next: null, transient: false,
      log: [['info', '工作開始：air-quality（每小時）'], ['ok', '擷取完成：16 站 × 1 小時 = 16 列；併入近 24 小時共 384 列'], ['info', '執行驗證規則 9 條'], ['ok', 'schema、pk、required、date、encoding：通過'], ['err', 'range：pm25 between(0, 500) → 37 列失敗'], ['err', '  鹽田 AQ-08：-6.2、-5.9、-4.1 …（21 列）'], ['err', '  北岸工業 AQ-03：-2.7、-0.4 …（16 列）'], ['warn', '已重試 3 次結果相同，判定為資料錯誤，停止自動重試'], ['info', '已建立機關通知草稿：環保局 黃詩涵']] },
    { id: 'JOB-1022-0214', ds: 'zoning', stage: 'transform', error: 'GeometryError', msg: '2 筆多邊形自我交錯（self-intersection），無法轉出 GeoJSON', attempts: 3, max: 3, started: '2026-10-22T02:14', next: null, transient: false,
      log: [['info', '工作開始：zoning（每季，強制重算）'], ['ok', '擷取完成：SHP 3,184 筆，TWD97 → WGS84'], ['ok', '驗證通過：屬性欄位 8 / 8'], ['info', '轉換：簡化幾何（容差 0.5 m）並輸出 GeoJSON'], ['err', 'Z-0812：Ring Self-intersection at (120.3412, 23.0178)'], ['err', 'Z-0815：Ring Self-intersection at (120.3398, 23.0191)'], ['warn', '已重試 3 次，需機關修正圖資後重新上傳']] },
    { id: 'JOB-1022-0153', ds: 'low-income', stage: 'validate', error: 'SchemaError', msg: '欄位「申請年度」型別由 int 變為 str（值如「115年」）', attempts: 3, max: 3, started: '2026-10-22T01:53', next: null, transient: false,
      log: [['info', '工作開始：low-income（每月）'], ['ok', '擷取完成：XLSX 1 個工作表，144 列'], ['info', '比對前版結構 v5.0'], ['err', 'schema：apply_year 預期 int，實得 str（"115年"、"115年"、"114年" …）'], ['warn', '型別自動轉換未啟用（政策：統計資料不做隱性轉換）'], ['warn', '已重試 3 次，等待機關確認欄位格式']] },
    { id: 'JOB-1022-0408', ds: 'road-works', stage: 'extract', error: 'EncodingError', msg: '來源檔非 UTF-8（偵測為 Big5），第 1 列即解碼失敗', attempts: 2, max: 3, started: '2026-10-22T04:08', next: '2026-10-22T10:08', transient: false,
      log: [['info', '工作開始：road-works（每日 04:00）'], ['info', '下載 sftp://pwb-exchange/roadworks/20261022.csv（212 KB）'], ['err', "UnicodeDecodeError: 'utf-8' codec can't decode byte 0xb9 in position 0"], ['info', '編碼偵測：Big5（信心 0.98）'], ['warn', '平台規範要求 UTF-8，未自動轉碼'], ['info', '排入重試：第 3 次，10:08']] },
  ];
  const jobs = JOBS_RAW.map((j) => ({ ...j, started: time(j.started), next: j.next ? time(j.next) : null, state: j.next ? 'retrying' : 'exhausted' }));

  /* 最近活動（新到舊） */
  const ACT_RAW = [
    ['2026-10-22T09:32', 'system', 'fail', 'parking-avail', '「{ds}」發布失敗：CDN 快取清除被拒', 'JOB-1022-0932 · PublishError 403'],
    ['2026-10-22T09:31', 'chou', 'approve', 'bike-lanes', '核定「{ds}」上架，已發布 v1.0', '資料長核定 · 授權：澄港開放授權 1.0'],
    ['2026-10-22T09:29', 'system', 'fail', 'bus-eta', '「{ds}」擷取逾時，第 2 次重試排入 09:47', 'JOB-1022-0931 · HTTPError 504'],
    ['2026-10-22T09:20', 'hsu', 'review', 'ltc-centers', '審核通過「{ds}」，送資料長核定', '意見：欄位說明完整，座標抽查 20 筆無誤。'],
    ['2026-10-22T09:08', 'system', 'publish', null, '整點排程批次 09:00 完成，更新 12 個資料集', '214 個工作 · 失敗 1 · 耗時 7 分 42 秒'],
    ['2026-10-22T09:05', 'liu', 'submit', 'manholes', '提出「{ds}」上架申請', 'APP-2026-0193 · 自動驗證中'],
    ['2026-10-22T08:57', 'wang', 'submit', 'taxi-stands', '提出「{ds}」上架申請', 'APP-2026-0192 · 自動驗證中'],
    ['2026-10-22T08:40', 'chen', 'return', 'markets', '退回「{ds}」補正', '4 個欄位缺少說明；攤位面積單位混用坪與平方公尺。'],
    ['2026-10-22T04:08', 'system', 'fail', 'road-works', '「{ds}」擷取失敗：來源檔非 UTF-8', 'JOB-1022-0408 · EncodingError'],
    ['2026-10-22T02:14', 'system', 'fail', 'zoning', '「{ds}」轉換失敗：多邊形自我交錯', 'JOB-1022-0214 · GeometryError · 已重試 3 次'],
    ['2026-10-22T02:05', 'system', 'fail', 'air-quality', '「{ds}」驗證失敗：pm25 出現負值', 'JOB-1022-0205 · ValidationError · 37 列'],
    ['2026-10-22T01:53', 'system', 'fail', 'low-income', '「{ds}」驗證失敗：欄位型別變更', 'JOB-1022-0153 · SchemaError · 已重試 3 次'],
    ['2026-10-21T17:20', 'cheng', 'draft', 'library-loans', '建立「{ds}」上架草稿', '尚未送出'],
    ['2026-10-21T11:30', 'chen', 'review', 'polling-places', '審核通過「{ds}」，送資料長核定', '與選務系統比對 486 筆無差異。'],
    ['2026-10-21T10:15', 'hsieh', 'submit', 'ems-response', '提出「{ds}」上架申請', 'APP-2026-0190'],
    ['2026-10-20T16:45', 'wu', 'submit', 'dengue-cases', '提出「{ds}」上架申請', 'APP-2026-0189'],
  ];
  let actSeq = 0;
  const activity = ACT_RAW.map(([at, actor, kind, ds, text, detail]) => ({ id: 'a' + (++actSeq), at: time(at), actor, kind, ds, text, detail }));

  /* 今日管線統計（00:00 起） */
  const pipelineStats = {
    scheduledToday: 1248,
    perHour: 52,
    stages: {
      extract: { running: 7, today: 1206, success: 0.992, p95: 4.1 },
      validate: { running: 4, today: 1198, success: 0.979, p95: 2.6 },
      transform: { running: 3, today: 1173, success: 0.996, p95: 6.8 },
      publish: { running: 2, today: 1164, success: 0.998, p95: 1.2 },
    },
  };

  /* 近 52 週下載量（週一起算，最後一週 10/12–10/18）；颱風警報週（9/28 起）即時類 API 呼叫暴增 */
  const weekly = (() => {
    const rand = rng('weekly-downloads');
    const lastMonday = time('2026-10-12');
    const apiShare = datasets.filter((d) => d.formats.includes('API')).reduce((s, d) => s + d.downloads30, 0) * 0.85 /
      datasets.reduce((s, d) => s + d.downloads30, 0);
    const raw = Array.from({ length: 52 }, (_, i) => {
      const week = lastMonday - (51 - i) * 7 * DAY;
      const p = parts(week);
      const season = 1 + 0.06 * Math.sin((p.m - 3) / 12 * Math.PI * 2);
      const trend = 0.86 + i * 0.0032;
      const holiday = (p.m === 2 && p.d < 21) ? 0.82 : 1;
      const typhoon = (fmt.date(week) === '2026-09-28') ? 1.42 : (fmt.date(week) === '2026-07-13' ? 1.18 : 1);
      const total = season * trend * holiday * (1 + (rand() - 0.5) * 0.08);
      const api = total * apiShare * (typhoon > 1 ? typhoon * 1.12 : 1);
      const file = total * (1 - apiShare) * (typhoon > 1 ? 1 + (typhoon - 1) * 0.4 : 1);
      return { week, api, file };
    });
    // 讓最近 4 週合計等於 30 日下載量（換算為 28 天），兩處數字自洽
    const target = datasets.reduce((s, d) => s + d.downloads30, 0) * 28 / 30;
    const last4 = raw.slice(-4).reduce((s, w) => s + w.api + w.file, 0);
    const k = target / last4;
    return raw.map((w) => ({ week: w.week, api: Math.round(w.api * k), file: Math.round(w.file * k) }));
  })();
  const onTimeWeekly = [89.2, 90.4, 88.7, 91.0, 90.2, 89.6, 91.8, 90.8, 87.6, 90.6, 90.4];

  /* ------------------------------------------------------------------
   * 查詢與衍生
   * ------------------------------------------------------------------ */
  const dataset = (id) => byId.get(id) || null;
  const agency = (key) => AGENCIES[key];
  const person = (id) => PEOPLE[id] || null;
  const theme = (key) => THEMES[key];
  const job = (id) => jobs.find((j) => j.id === id) || null;
  const grade = (s) => (s == null ? null : s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : 'D');
  const lateBy = (ds) => {
    const w = FREQS[ds.freq].window;
    if (!w || ds.status !== 'published') return 0;
    return Math.max(0, now() - ds.updated - w * 1.5);
  };
  const isLate = (ds) => lateBy(ds) > 0;
  const openJob = (ds) => jobs.find((j) => j.ds === ds.id) || null;
  const health = (ds) => {
    if (ds.status !== 'published') return null;
    if (openJob(ds)) return 'failed';
    return isLate(ds) ? 'late' : 'ok';
  };
  const pendingApps = () => datasets
    .filter((d) => ['validating', 'review', 'approval'].includes(d.status))
    .sort((a, b) => a.app.submitted - b.app.submitted);

  /**
   * 平台彙總。回傳：
   * total, agencies, published, byStatus{status: n}, pending, pendingByStage{validating, review, approval},
   * onTime, onTimeRate, late[], failedJobs, transientJobs, exhaustedJobs, failedDatasets,
   * avgQuality, grades{A,B,C,D}, dims{key: avg}, downloads30, downloadsPrev30, apiShare, oldestPending{ds, waited}
   */
  const stats = () => {
    const pub = datasets.filter((d) => d.status === 'published');
    const byStatus = {};
    datasets.forEach((d) => { byStatus[d.status] = (byStatus[d.status] || 0) + 1; });
    const late = pub.filter(isLate);
    const pend = pendingApps();
    const grades = { A: 0, B: 0, C: 0, D: 0 };
    pub.forEach((d) => { grades[grade(d.quality)] += 1; });
    const dims = {};
    QUALITY_DIMS.forEach((q) => { dims[q.key] = pub.reduce((s, d) => s + d.dims[q.key], 0) / pub.length; });
    const dl = datasets.reduce((s, d) => s + d.downloads30, 0);
    const prev4 = weekly.slice(-8, -4).reduce((s, w) => s + w.api + w.file, 0);
    const last4 = weekly.slice(-4).reduce((s, w) => s + w.api + w.file, 0);
    const api4 = weekly.slice(-4).reduce((s, w) => s + w.api, 0);
    const oldest = pend[0] || null;
    return {
      total: datasets.length,
      agencies: new Set(datasets.map((d) => d.agency)).size,
      published: pub.length,
      byStatus,
      pending: pend.length,
      pendingByStage: { validating: byStatus.validating || 0, review: byStatus.review || 0, approval: byStatus.approval || 0 },
      returned: byStatus.returned || 0,
      onTime: pub.length - late.length,
      onTimeRate: (pub.length - late.length) / pub.length,
      late,
      failedJobs: jobs.length,
      transientJobs: jobs.filter((j) => j.transient && j.state === 'retrying').length,
      exhaustedJobs: jobs.filter((j) => j.state === 'exhausted').length,
      retryQueue: jobs.filter((j) => j.state === 'retrying').length,
      failedDatasets: pub.filter((d) => openJob(d)).length,
      avgQuality: pub.reduce((s, d) => s + d.quality, 0) / pub.length,
      grades,
      dims,
      downloads30: dl,
      downloadsDelta: last4 / prev4 - 1,
      apiShare: api4 / last4,
      oldestPending: oldest ? { ds: oldest, waited: now() - oldest.app.submitted } : null,
    };
  };

  /* ------------------------------------------------------------------
   * 樣本資料產生與 profiling
   * ------------------------------------------------------------------ */
  const PLACE_ROOTS = ['港埕', '北岸', '舊城', '山腳', '新灣', '鹽田', '溪洲', '雲嶺', '中正', '民生', '文昌', '興港', '望海', '柳營', '竹圍', '崙仔', '鳳鳴', '明德', '長安', '福田', '金沙', '白鷺', '海埔', '德和', '仁愛', '東興', '西濱', '南榮', '光明', '大同'];
  const ROADS = ['中正路', '民生路', '港埕大道', '北岸一路', '舊城街', '山腳路', '新灣路', '鹽田路', '溪洲路', '雲嶺路', '文昌街', '興港路', '海濱大道', '光復路', '建國路', '成功路', '自由路', '和平路', '復興路', '漁港路'];
  // 澄港市範圍（虛構城市座標框，驗證規則與預覽共用）
  const BBOX = { lat: [22.92, 23.14], lng: [120.12, 120.38] };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, a, b) => a + r() * (b - a);

  const schema = (ds) => ds.columns.map((c) => ({
    name: c.name, type: c.type, label: c.label, desc: c.desc || '', pk: !!c.pk, nul: c.nul || 0,
  }));

  function genValue(col, r, i) {
    const g = col.gen || {};
    if (col.nul && r() < col.nul) return null;
    if (g.id) {
      let n = i + 1 + (hash(col.name) % 37);
      return g.id.replace(/#+/g, (m) => { const s = String(n % 10 ** m.length).padStart(m.length, '0'); n = Math.floor(n / 10); return s; });
    }
    if (g.enum) return pick(r, g.enum);
    if (g.int) {
      const v = Math.round(between(r, g.int[0], g.int[1]));
      return col.neg && r() < col.neg ? -Math.round(between(r, 1, 6)) : v;
    }
    if (g.float) {
      if (col.neg && r() < col.neg) return -Number(between(r, 0.4, 6.2).toFixed(g.float[2]));
      return Number(between(r, g.float[0], g.float[1]).toFixed(g.float[2]));
    }
    if (g.date) return fmt.date(between(r, time(g.date[0]), time(g.date[1])));
    if (g.datetime) { const t = between(r, time(g.datetime[0]), time(g.datetime[1])); return `${fmt.date(t)}T${fmt.time(Math.floor(t / (5 * MIN)) * 5 * MIN)}`; }
    if (g.month) {
      const [y0, m0] = g.month[0].split('-').map(Number), [y1, m1] = g.month[1].split('-').map(Number);
      const span = (y1 - y0) * 12 + (m1 - m0);
      const k = Math.floor(r() * (span + 1));
      const y = y0 + Math.floor((m0 - 1 + k) / 12), m = ((m0 - 1 + k) % 12) + 1;
      return `${y}-${p2(m)}`;
    }
    if (g.clock) return `${p2(Math.floor(between(r, g.clock[0], g.clock[1])))}:${p2(Math.floor(r() * 12) * 5)}`;
    if (g.district) return pick(r, DISTRICTS);
    if (g.address) return `澄港市${pick(r, DISTRICTS)}${pick(r, ROADS)}${Math.floor(between(r, 1, 420))}號`;
    if (g.lat) return Number(between(r, BBOX.lat[0], BBOX.lat[1]).toFixed(5));
    if (g.lng) return Number(between(r, BBOX.lng[0], BBOX.lng[1]).toFixed(5));
    if (g.line) { const la = between(r, BBOX.lat[0], BBOX.lat[1]), ln = between(r, BBOX.lng[0], BBOX.lng[1]); return `LINESTRING(${ln.toFixed(4)} ${la.toFixed(4)}, ${(ln + 0.004).toFixed(4)} ${(la + 0.002).toFixed(4)})`; }
    if (g.polygon) { const la = between(r, BBOX.lat[0], BBOX.lat[1]), ln = between(r, BBOX.lng[0], BBOX.lng[1]); return `POLYGON((${ln.toFixed(4)} ${la.toFixed(4)}, ${(ln + 0.003).toFixed(4)} ${la.toFixed(4)}, …))`; }
    if (g.place) return pick(r, PLACE_ROOTS) + pick(r, g.place);
    if (g.road) return g.road === 2 ? `${pick(r, ROADS)}／${pick(r, ROADS)}` : `${pick(r, ROADS)}${pick(r, ['一段', '二段', '', ''])}`;
    if (g.phone) return `(07) ${Math.floor(between(r, 200, 899))}-${String(Math.floor(r() * 10000)).padStart(4, '0')}`;
    if (g.bool != null) return r() < g.bool;
    return null;
  }

  const sampleCache = new Map();
  /** 決定性樣本列：同一資料集每次相同；n 不超過資料列數 */
  const sample = (ds, n = 50) => {
    const key = ds.id + ':' + n;
    if (sampleCache.has(key)) return sampleCache.get(key);
    const r = rng('sample:' + ds.id);
    const rows = Array.from({ length: Math.min(n, Math.max(ds.rows, 1)) }, (_, i) => {
      const row = {};
      ds.columns.forEach((c) => { row[c.name] = genValue(c, r, i); });
      // 地址與行政區各自隨機產生會對不上：地址一律改用同列的行政區
      if (row.district) ds.columns.forEach((c) => { if (c.gen && c.gen.address && row[c.name]) row[c.name] = row[c.name].replace(/^澄港市..區/, '澄港市' + row.district); });
      // 欄位之間的邏輯關係（例如可借＋可還＝車柱數）由資料集自己的 fixRow 修正；列序號給依時間／站點排列的資料集用
      if (ds.fixRow) ds.fixRow(row, i);
      return row;
    });
    sampleCache.set(key, rows);
    return rows;
  };

  const isNull = (v) => v == null || v === '';
  /** 單欄 profiling：數值與日期做 12 格直方圖、字串列出前 4 名 */
  function profileValues(values, type, opts = {}) {
    const n = values.length;
    const nonNull = values.filter((v) => !isNull(v));
    const out = { type, n, nullRate: n ? (n - nonNull.length) / n : 0, distinct: new Set(nonNull.map(String)).size, hist: [], top: [], min: null, max: null, mean: null, bad: 0 };
    const numeric = type === 'int' || type === 'float' || (type === 'geo' && nonNull.every((v) => typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(v)));
    if (numeric) {
      const nums = nonNull.map(Number);
      out.min = Math.min(...nums); out.max = Math.max(...nums);
      out.mean = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
      out.bad = opts.min != null ? nums.filter((v) => v < opts.min).length : 0;
      const bins = 12, span = out.max - out.min || 1;
      out.hist = Array(bins).fill(0);
      nums.forEach((v) => { out.hist[Math.min(bins - 1, Math.floor((v - out.min) / span * bins))] += 1; });
      out.negBins = nums.some((v) => v < 0) ? out.hist.map((_, i) => out.min + span * (i + 1) / bins <= 0) : null;
    } else if (type === 'date') {
      const ts = nonNull.map((v) => time(String(v).length === 7 ? v + '-01' : String(v).slice(0, 16))).filter((t) => !Number.isNaN(t));
      out.min = ts.length ? fmt.date(Math.min(...ts)) : null;
      out.max = ts.length ? fmt.date(Math.max(...ts)) : null;
      const lo = Math.min(...ts), span = Math.max(...ts) - lo || 1, bins = 12;
      out.hist = Array(bins).fill(0);
      ts.forEach((t) => { out.hist[Math.min(bins - 1, Math.floor((t - lo) / span * bins))] += 1; });
    }
    if (!numeric) {
      const counts = new Map();
      nonNull.forEach((v) => counts.set(String(v), (counts.get(String(v)) || 0) + 1));
      out.top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([value, count]) => ({ value, count, pct: count / (nonNull.length || 1) }));
      if (type !== 'date') { const lens = nonNull.map((v) => String(v).length); out.min = lens.length ? Math.min(...lens) : null; out.max = lens.length ? Math.max(...lens) : null; }
    }
    return out;
  }
  const profileCache = new Map();
  const profile = (ds) => {
    if (profileCache.has(ds.id)) return profileCache.get(ds.id);
    const rows = sample(ds, 240);
    const res = ds.columns.map((c) => ({
      name: c.name, label: c.label, desc: c.desc || '', pk: !!c.pk,
      ...profileValues(rows.map((r) => r[c.name]), c.type, { min: c.neg ? 0 : null }),
      sampleSize: rows.length,
    }));
    profileCache.set(ds.id, res);
    return res;
  };

  /* ------------------------------------------------------------------
   * 驗證規則
   * ------------------------------------------------------------------ */
  const RULES = [
    { key: 'schema', name: '結構與前版一致', expr: (ds) => `assert df.schema == prev("${ds.version}").schema` },
    { key: 'pk', name: '主鍵唯一', expr: (ds) => `assert df[${ds.columns.filter((c) => c.pk).map((c) => `"${c.name}"`).join(', ') || '"_row"'}].is_unique` },
    { key: 'required', name: '必填欄位無空值', expr: () => 'assert df[REQUIRED].notna().all()' },
    { key: 'range', name: '數值落在合理範圍', expr: (ds) => {
      const c = ds.columns.find((x) => x.gen && (x.gen.float || x.gen.int));
      if (!c) return 'assert df.select_dtypes("number").ge(0).all()';
      const [lo, hi] = c.gen.float || c.gen.int;
      const upper = c.name === 'pm25' ? 500 : Math.ceil(hi * 2);
      return `assert df["${c.name}"].between(${Math.min(0, lo)}, ${upper}).all()`;
    } },
    { key: 'geo', name: '座標位於澄港市範圍', expr: () => `assert geo.within(df, CITY_BBOX)  # ${BBOX.lat.join('–')}°N, ${BBOX.lng.join('–')}°E` },
    { key: 'date', name: '日期符合 ISO 8601', expr: (ds) => { const c = ds.columns.find((x) => x.type === 'date'); return c ? `assert df["${c.name}"].str.match(ISO8601).all()` : 'assert True  # 無日期欄位'; } },
    { key: 'encoding', name: '檔案編碼為 UTF-8', expr: () => 'assert source.encoding == "utf-8"' },
    { key: 'freshness', name: '更新時效', expr: (ds) => `assert now() - df.updated <= ${FREQS[ds.freq].label === '不定期' ? 'None' : `freq("${ds.freq}") * 1.5`}` },
    { key: 'meta', name: '詮釋資料完整', expr: () => 'assert not meta.missing(["description", "license", "contact", "columns.*.desc"])' },
    { key: 'consistency', name: '代碼與單位一致', expr: () => 'assert units.consistent(df, CODEBOOK)' },
  ];
  /** 驗證結果：fails 內定義的規則為失敗（warn: true 為警示），其餘依欄位決定通過或略過 */
  const rules = (ds) => RULES.map((r) => {
    const f = ds.fails[r.key];
    const hasGeo = ds.columns.some((c) => c.type === 'geo');
    const hasDate = ds.columns.some((c) => c.type === 'date');
    let state = 'pass', result = '通過', detail = '';
    if (r.key === 'geo' && !hasGeo) { state = 'skip'; result = '略過'; detail = '無地理欄位'; }
    if (r.key === 'date' && !hasDate) { state = 'skip'; result = '略過'; detail = '無日期欄位'; }
    if (r.key === 'freshness' && !FREQS[ds.freq].window) { state = 'skip'; result = '略過'; detail = '不定期更新'; }
    if (r.key === 'schema' && ds.version === 'v0.1') { state = 'skip'; result = '略過'; detail = '首次上架，無前版可比'; }
    if (f) {
      state = f.warn ? 'warn' : 'fail';
      result = f.count ? `${f.count} 列${f.warn ? '警示' : '失敗'}` : (f.warn ? '警示' : '失敗');
      if (r.key === 'meta' || r.key === 'schema' || r.key === 'encoding' || r.key === 'freshness') result = f.warn ? '警示' : '失敗';
      if (r.key === 'meta' && f.count) result = `${f.count} 欄缺漏`;
      detail = f.detail;
    }
    return { key: r.key, name: r.name, expr: r.expr(ds), state, result, detail };
  });

  /** 版本歷史（新到舊），依更新頻率往回推 */
  const versions = (ds) => {
    const r = rng('ver:' + ds.id);
    const [maj, min] = ds.version.slice(1).split('.').map(Number);
    const step = FREQS[ds.freq].window || 60 * DAY;
    // 每版新增列數 ≈ 一個更新週期占一年的比例 × 總列數（每小時資料一版約 16 列、每日約數百列）
    const frac = FREQS[ds.freq].window ? Math.min(0.25, FREQS[ds.freq].window / (365 * DAY)) : 0.02;
    const out = [];
    let rows = ds.rows;
    // 版本說明只挑資料集真的有的欄位（沒有地址欄就不會「修正地址」）
    const notes = ['例行更新', '新增當期資料', '補齊空值'];
    if (ds.columns.some((c) => c.gen && c.gen.address)) notes.push('修正 3 筆地址');
    if (ds.columns.some((c) => c.type === 'geo')) notes.push('更新座標精度');
    for (let i = 0; i < 5; i++) {
      const mi = min - i;
      // v0.x 是上架申請時的版本，再往前沒有歷史；1.x 往回推到頭就是申請時的 v0.1
      if (i > 0 && maj === 0) break;
      const ver = mi >= 0 ? `v${maj}.${mi}` : maj > 1 ? `v${maj - 1}.${10 + mi}` : 'v0.1';
      // 最新版本就是最後更新時間；較舊的版本在每日以上的批次才有幾小時的時間差，每小時、即時的照排程整點產生，否則版本時間會前後顛倒
      const jitter = Math.floor(r() * 3) * HOUR;
      // 版本不會早於資料集建立時間（今天才核定上架的資料集，申請版 v0.1 也在今天）
      const at = Math.max(ds.created, ds.updated - i * Math.min(step, 40 * DAY) - (i > 0 && step >= DAY ? jitter : 0));
      const delta = Math.max(0, Math.round(rows * frac * (0.6 + r() * 0.8)));
      out.push({ version: ver, at, by: i % 3 === 2 ? ds.contact : 'system', rows, delta, note: i === 0 ? '最新版本' : pick(r, notes) });
      rows -= delta;
      if (ver === 'v0.1') break;
    }
    return out;
  };
  /** 最新兩版差異：欄位異動 + 列異動摘要 + 範例變更儲存格 */
  const diff = (ds) => {
    const vs = versions(ds);
    const rows = sample(ds, 12);
    const r = rng('diff:' + ds.id);
    const numCols = ds.columns.filter((c) => (c.type === 'int' || c.type === 'float') && !c.pk);
    const keyCols = ds.columns.filter((c) => c.pk).length ? ds.columns.filter((c) => c.pk) : [ds.columns[0]];
    const changes = rows.slice(0, 6).map((row, i) => {
      const c = numCols.length ? numCols[i % numCols.length] : ds.columns[1];
      const to = row[c.name];
      const from = typeof to === 'number' ? Number((to * (0.9 + r() * 0.2)).toFixed(c.gen.float ? c.gen.float[2] : 0)) : to;
      return { key: keyCols.map((k) => row[k.name]).join(' · '), col: c.name, label: c.label, from, to };
    }).filter((x) => x.from !== x.to && x.to != null);
    const schemaChanges = ds.fails.schema
      ? [{ op: 'mod', col: 'apply_year', from: 'int', to: 'str' }]
      : (ds.id === 'bike-stations' ? [{ op: 'add', col: 'active', from: null, to: 'bool' }] : []);
    return {
      from: vs[1] ? vs[1].version : null,
      to: vs[0].version,
      at: vs[0].at,
      schema: schemaChanges,
      added: Math.max(0, vs[0].delta),
      removed: Math.round(Math.abs(vs[0].delta) * 0.15),
      changed: changes.length * Math.max(1, Math.round(ds.rows / 400)),
      cells: changes,
    };
  };

  /* ------------------------------------------------------------------
   * CSV 解析與型別推斷（上架頁貼上 CSV 即時解析用）
   * ------------------------------------------------------------------ */
  const csv = {
    /** 支援逗號／Tab／分號、雙引號跳脫；自動偵測分隔字元 */
    parse(text) {
      const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      if (!src.trim()) return { headers: [], rows: [], delimiter: ',' };
      const first = src.split('\n')[0];
      const delimiter = [',', '\t', ';'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
      const out = [];
      let row = [], cell = '', q = false;
      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (q) {
          if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') q = false;
          else cell += ch;
        } else if (ch === '"' && cell === '') q = true;
        else if (ch === delimiter) { row.push(cell); cell = ''; }
        else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
        else cell += ch;
      }
      row.push(cell); out.push(row);
      const headers = out.shift().map((h) => h.trim());
      return { headers, rows: out.filter((r) => r.some((c) => c.trim() !== '')).map((r) => headers.map((_, i) => (r[i] ?? '').trim())), delimiter };
    },
  };
  /** 由值推斷型別：全數為整數→int、含小數→float、ISO 日期→date、經緯度或 WKT→geo、是否值→bool，其餘 str */
  const inferType = (values, name = '') => {
    const vs = values.filter((v) => !isNull(v)).map(String);
    if (!vs.length) return 'str';
    const all = (re) => vs.every((v) => re.test(v));
    if (all(/^(POINT|LINESTRING|POLYGON|MULTIPOLYGON)\s*\(/i)) return 'geo';
    if (all(/^(true|false|是|否|y|n|yes|no)$/i)) return 'bool';
    if (all(/^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2}(:\d{2})?)?$/)) return 'date';
    if (all(/^-?\d+$/)) return 'int';
    if (all(/^-?\d*\.\d+$|^-?\d+$/)) {
      const nums = vs.map(Number);
      if (/^(lat|lng|lon|latitude|longitude|緯度|經度|x|y)$/i.test(name) && nums.every((n) => Math.abs(n) <= 180)) return 'geo';
      return 'float';
    }
    return 'str';
  };

  /* ------------------------------------------------------------------
   * 資料異動
   * ------------------------------------------------------------------ */
  const log = ({ kind, actor = ME.id, ds = null, text, detail = '' }) => {
    const entry = { id: 'a' + (++actSeq), at: now(), actor, kind, ds, text, detail };
    activity.unshift(entry);
    emit('data', { type: 'activity', entry });
    return entry;
  };
  const removeActivity = (entry) => {
    const i = activity.indexOf(entry);
    if (i >= 0) activity.splice(i, 1);
  };
  /** 撤銷一筆活動（toast 的「復原」用） */
  const unlog = (entry) => {
    removeActivity(entry);
    emit('data', { type: 'activity', entry, undo: true });
  };

  const TRANSITION_TEXT = {
    review: { kind: 'review', text: '「{ds}」自動驗證通過，進入承辦審核' },
    approval: { kind: 'review', text: '審核通過「{ds}」，送資料長核定' },
    published: { kind: 'approve', text: '核定「{ds}」上架，已發布' },
    returned: { kind: 'return', text: '退回「{ds}」補正' },
    validating: { kind: 'submit', text: '重新送出「{ds}」，自動驗證中' },
  };
  /** 上架流程狀態流轉；回傳 undo() 可完整還原（含活動紀錄） */
  const transition = (dsId, to, { note = '', actor = ME.id } = {}) => {
    const ds = dataset(dsId);
    const prev = { status: ds.status, app: ds.app ? { ...ds.app } : null, updated: ds.updated, version: ds.version, quality: ds.quality, dims: ds.dims };
    ds.status = to;
    if (ds.quality == null && to !== 'returned') {
      // 自動驗證完成才有品質分數；以資料集 id 為種子，重複操作得到相同分數
      const r = rng('auto-q:' + ds.id);
      ds.quality = 82 + Math.floor(r() * 13);
      ds.dims = Object.fromEntries(QUALITY_DIMS.map((d) => [d.key, clamp(ds.quality + Math.round((r() - 0.5) * 12), 40, 100)]));
    }
    if (ds.app) {
      ds.app.stageAt = now();
      if (to === 'approval') { ds.app.reviewer = actor; ds.app.assignee = 'chou'; ds.app.note = note || ds.app.note; }
      if (to === 'returned') { ds.app.reviewer = actor; ds.app.note = note; }
    }
    if (to === 'published') { ds.updated = now(); ds.version = 'v1.0'; }
    const t = TRANSITION_TEXT[to] || { kind: 'review', text: `「{ds}」狀態變更為「${STATUS[to].label}」` };
    const entry = { id: 'a' + (++actSeq), at: now(), actor, kind: t.kind, ds: dsId, text: t.text + (to === 'published' ? ` ${ds.version}` : ''), detail: note };
    activity.unshift(entry);
    emit('data', { type: 'transition', ds, from: prev.status, to });
    return {
      undo() {
        ds.status = prev.status; ds.app = prev.app; ds.updated = prev.updated; ds.version = prev.version; ds.quality = prev.quality; ds.dims = prev.dims;
        removeActivity(entry);
        emit('data', { type: 'transition', ds, from: to, to: prev.status, undo: true });
      },
    };
  };

  /** 重試失敗工作：暫時性錯誤成功並更新資料集；資料錯誤再次失敗並累計次數 */
  const retryJob = async (jobId) => {
    const j = job(jobId);
    const ds = dataset(j.ds);
    await sleep(reduceMotion.matches ? 300 : 1400 + Math.random() * 700);
    // 在等待期間可能已被其他動作處理（例如連點兩次），以當下狀態為準
    if (!jobs.includes(j)) return { ok: true, job: j, ds };
    if (j.transient) {
      jobs.splice(jobs.indexOf(j), 1);
      ds.updated = now();
      log({ kind: 'publish', actor: ME.id, ds: ds.id, text: '手動重試「{ds}」成功，已更新', detail: `${j.id} · 第 ${j.attempts + 1} 次嘗試` });
      return { ok: true, job: j, ds };
    }
    j.attempts = Math.min(j.max, j.attempts + 1);
    j.state = j.attempts >= j.max ? 'exhausted' : 'retrying';
    j.next = j.state === 'retrying' ? now() + 30 * MIN : null;
    log({ kind: 'fail', actor: 'system', ds: ds.id, text: `重試「{ds}」仍失敗：${j.error}`, detail: `${j.id} · 第 ${j.attempts} / ${j.max} 次` });
    return { ok: false, job: j, ds };
  };

  /** 暫停／恢復更新排程 */
  const setPaused = (dsId, paused) => {
    const ds = dataset(dsId);
    const prev = ds.paused;
    ds.paused = paused;
    const entry = log({ kind: 'schedule', ds: dsId, text: paused ? '暫停「{ds}」更新排程' : '恢復「{ds}」更新排程', detail: `${FREQS[ds.freq].label} · ${FREQS[ds.freq].sub}` });
    return {
      undo() { ds.paused = prev; removeActivity(entry); emit('data', { type: 'schedule', ds, undo: true }); },
    };
  };

  let appSeq = 193; // 目前最新案號 APP-2026-0193
  /** 新增資料集（上架申請送出時呼叫）；回傳建立的物件 */
  const addDataset = (p) => {
    const ag = AGENCIES[p.agency];
    seqByAgency[p.agency] = (seqByAgency[p.agency] || 0) + 1;
    appSeq += 1;
    const appNo = `APP-2026-${String(appSeq).padStart(4, '0')}`;
    const ds = {
      id: p.id, code: `${ag.code}-${String(seqByAgency[p.agency]).padStart(3, '0')}`, title: p.title, agency: p.agency, theme: p.theme,
      formats: p.formats || ['CSV'], freq: p.freq || 'monthly', status: p.status || 'validating', quality: p.quality ?? null, dims: p.dims || {},
      rows: p.rows || 0, cols: (p.columns || []).length, columns: p.columns || [], downloads30: 0, weekly: Array(12).fill(0),
      updated: now(), created: now(), version: 'v0.1', license: p.license || 'cg-open-1', desc: p.desc || '', tags: p.tags || [],
      paused: false, fails: {}, contact: ag.contact,
      app: { no: appNo, by: p.by || ag.contact, submitted: now(), stageAt: now(), assignee: p.assignee || ME.id, reviewer: null, note: '' },
    };
    datasets.push(ds);
    byId.set(ds.id, ds);
    log({ kind: 'submit', actor: ds.app.by, ds: ds.id, text: '提出「{ds}」上架申請', detail: `${appNo} · 自動驗證中` });
    return ds;
  };

  /* ------------------------------------------------------------------
   * 圖示
   * ------------------------------------------------------------------ */
  const ICONS = {
    notebook: 'M3.5 1.75h7.75l1.25 1.25v11.25H3.5zM5.75 5h4.5M5.75 7.5h4.5M5.75 10h2.5M1.75 4h1.75M1.75 7h1.75M1.75 10h1.75',
    table: 'M2.25 3h11.5v10H2.25zM2.25 6.25h11.5M2.25 9.5h11.5M6.25 6.25V13',
    file: 'M4 1.75h5.5l3 3v9.5H4zM9.5 1.75v3h3M6 8h4.5M6 10.5h4.5',
    upload: 'M8 10.25V2.75M5 5.5l3-2.75 3 2.75M2.75 9.5v3.75h10.5V9.5',
    search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 14l-3.5-3.5',
    'arrow-left': 'M13 8H3M7 4L3 8l4 4',
    'arrow-right': 'M3 8h10M9 4l4 4-4 4',
    'arrow-up-right': 'M5 11l6-6M6 5h5v5',
    play: 'M5 3.25v9.5L12.75 8z',
    check: 'M3.5 8.5l3 3 6-7',
    x: 'M4 4l8 8M12 4l-8 8',
    plus: 'M8 3v10M3 8h10',
    alert: 'M8 2l6.25 11.25H1.75zM8 6.5v3M8 11.6v.01',
    info: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.25V11M8 5v.01',
    clock: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.75V8l2.25 1.5',
    retry: 'M13.25 8a5.25 5.25 0 1 1-1.55-3.72M13.25 2.5v3.25H10',
    terminal: 'M2.25 3h11.5v10H2.25zM4.75 6.25l2 1.75-2 1.75M8.5 10.25h2.75',
    pause: 'M5.5 3.5v9M10.5 3.5v9',
    bell: 'M4 6.5a4 4 0 0 1 8 0c0 3.5 1.5 4.75 1.5 4.75h-11S4 10 4 6.5zM6.5 13.75a1.6 1.6 0 0 0 3 0',
    download: 'M8 2.5v7.75M5 7.25l3 3 3-3M2.75 12.75h10.5',
    code: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5',
    eye: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'eye-off': 'M2 2l12 12M6.6 3.7A6.7 6.7 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.9 2.4M4.1 4.9A11.3 11.3 0 0 0 1.5 8S4 12.5 8 12.5a6.2 6.2 0 0 0 3-.8',
    'chevron-down': 'M4 6l4 4 4-4',
    'chevron-right': 'M6 4l4 4-4 4',
    'chevron-left': 'M10 4L6 8l4 4',
    database: 'M8 2c3 0 5.5.9 5.5 2s-2.5 2-5.5 2-5.5-.9-5.5-2S5 2 8 2zM2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
    calendar: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    pin: 'M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14zM8 8a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    user: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 14c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4',
    shield: 'M8 1.75l5 2v4c0 3-2.2 5.3-5 6.5-2.8-1.2-5-3.5-5-6.5v-4zM5.75 8l1.6 1.6 3-3.2',
    send: 'M14 2L7 9M14 2l-4.5 12-2.5-5-5-2.5z',
    undo: 'M5.5 3.5L2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7',
    filter: 'M2.5 3.5h11l-4.25 5v4l-2.5 1v-5z',
    star: 'M8 2l1.7 3.75 4.05.4-3.05 2.75.9 4L8 10.85 4.4 12.9l.9-4-3.05-2.75 4.05-.4z',
    flow: 'M2.25 5.5h3v3h-3zM10.75 7.5h3v3h-3zM5.25 7h2.5a1.25 1.25 0 0 1 1.25 1.25v.5A1.25 1.25 0 0 0 10.25 10h.5',
    activity: 'M1.5 8h3l2-5 3 10 2-5h3',
    globe: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14c-1.7-1.8-2.5-3.8-2.5-6S6.3 3.8 8 2z',
    more: 'M3.5 8h.5M7.75 8h.5M12 8h.5',
    gauge: 'M2.5 11a5.5 5.5 0 1 1 11 0M8 11l2.5-3.5M8 11h.01',
    chart: 'M2.5 2.5v11h11M5 10l2.5-3 2 2 3.5-4.5',
    layers: 'M8 2l6 3.25-6 3.25-6-3.25zM2 8.25l6 3.25 6-3.25M2 11.25l6 3.25 6-3.25',
    calendarClock: 'M2.5 3.5h11v4M2.5 3.5v10h5M2.5 6.5h11M5.5 2v3M10.5 2v3M11.5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM11.5 10.75V12l.9.6',
    link: 'M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2-2a2.75 2.75 0 0 0-3.9-3.9l-.6.6M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2 2a2.75 2.75 0 0 0 3.9 3.9l.6-.6',
    copy: 'M5.5 5.5h7.75v7.75H5.5zM10.5 5.5V2.75H2.75v7.75H5.5',
    trigger: 'M8.75 1.75L3.5 9h4l-.75 5.25L12.5 7h-4z',
    inbox: 'M2.5 9.5l1.6-5.2a1 1 0 0 1 .96-.7h5.88a1 1 0 0 1 .96.7l1.6 5.2v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM2.5 9.5h3l1 1.5h3l1-1.5h3',
  };
  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICONS[name] || ICONS.info}"/></svg>`;

  const TYPE_ICON = {
    str: '<path d="M3.5 4h9M8 4v8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    int: '<path d="M6.2 2.8 5 13.2M11 2.8 9.8 13.2M2.8 6h10.6M2.6 10h10.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    float: '<circle cx="3.6" cy="12.2" r="1.3" fill="currentColor"/><rect x="7" y="3" width="5.8" height="10" rx="2.9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    date: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 6.8h11M5.5 2v3M10.5 2v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    geo: '<path d="M8 14.2s4.6-4 4.6-7.6a4.6 4.6 0 0 0-9.2 0C3.4 10.2 8 14.2 8 14.2z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="6.6" r="1.6" fill="currentColor"/>',
    bool: '<rect x="1.8" y="4.3" width="12.4" height="7.4" rx="3.7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="8" r="2" fill="currentColor"/>',
  };
  const typeBadge = (t) => `<span class="type" data-type="${esc(t)}" title="${esc(TYPES[t] ? TYPES[t].label : t)}"><svg viewBox="0 0 16 16" aria-hidden="true">${TYPE_ICON[t] || TYPE_ICON.str}</svg>${esc(t)}</span>`;

  const STATE_SVG = {
    pass: '<circle cx="9" cy="9" r="8" fill="currentColor"/><path d="M5.4 9.3l2.4 2.4 4.8-5.2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    fail: '<circle cx="9" cy="9" r="8" fill="currentColor"/><path d="M6.2 6.2l5.6 5.6M11.8 6.2l-5.6 5.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    warn: '<path d="M9 1.6l7.6 13.4H1.4z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 6.6v3.8M9 12.6v.01" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    running: '<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="2"/><path d="M9 2a7 7 0 0 1 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    skip: '<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.6 2.4"/><path d="M6 9h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    idle: '<circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  };
  const STATE_LABEL = { pass: '通過', fail: '失敗', warn: '警示', running: '執行中', skip: '略過', idle: '未執行' };
  const stateIcon = (state) => `<span class="state-icon" data-state="${state}" role="img" aria-label="${STATE_LABEL[state] || state}"><svg viewBox="0 0 18 18">${STATE_SVG[state] || STATE_SVG.idle}</svg></span>`;

  /* ------------------------------------------------------------------
   * 標記產生器
   * ------------------------------------------------------------------ */
  const statusBadge = (status, { pill = false } = {}) => `<span class="status${pill ? ' status--pill' : ''}" data-status="${status}"><span class="status__dot" aria-hidden="true"></span>${esc(STATUS[status].label)}</span>`;
  const healthBadge = (ds) => {
    const h = health(ds);
    if (!h) return '<span class="health dim">—</span>';
    if (h === 'failed') return `<span class="health" data-health="failed">${icon('alert')}更新失敗</span>`;
    if (h === 'late') return `<span class="health" data-health="late">${icon('clock')}逾期 ${fmt.days(lateBy(ds))}</span>`;
    return `<span class="health" data-health="ok">${icon('check')}準時</span>`;
  };
  const formatBadges = (formats) => `<span class="fmt-list">${formats.map((f) => `<span class="fmt">${esc(f)}</span>`).join('')}</span>`;
  const gradeBadge = (score, { lg = false } = {}) => (score == null ? '<span class="grade" data-grade="none" style="--g: var(--line-3)" aria-label="尚未評分">–</span>' : `<span class="grade${lg ? ' grade--lg' : ''}" data-grade="${grade(score)}" aria-label="品質等級 ${grade(score)}">${grade(score)}</span>`);
  const scoreCell = (score) => (score == null
    ? '<span class="score dim">驗證中</span>'
    : `<span class="score" data-grade="${grade(score)}"><span class="score__n">${score}</span><span class="score__bar" aria-hidden="true"><span class="score__fill" style="transform:scaleX(${score / 100})"></span></span></span>`);
  const avatar = (id, size = '') => {
    const p = person(id);
    if (!p) return '';
    if (p.system) return `<span class="avatar avatar--sys${size ? ' avatar--' + size : ''}" aria-hidden="true">${icon('trigger', 'i--sm')}</span>`;
    return `<span class="avatar${size ? ' avatar--' + size : ''}" style="--h:${p.hue}" aria-hidden="true">${esc(p.name.slice(-2, -1) ? p.name.slice(-1) : p.name.slice(0, 1))}</span>`;
  };
  const personChip = (id) => {
    const p = person(id);
    return `<span class="person">${avatar(id, 'sm')}<span class="person__name">${esc(p.name)}</span><span class="person__role">${esc(p.system ? '系統' : p.unit.replace('數位發展處 ', '') + ' ' + p.role)}</span></span>`;
  };
  const agencyLabel = (key) => esc(AGENCIES[key].name);
  const datasetUrl = (id) => 'dataset.html?id=' + encodeURIComponent(id);
  const param = (name) => new URLSearchParams(location.search).get(name);

  /** 折線 sparkline；最後一點加端點圓 */
  const spark = (values, { w = 96, h = 28, color = 'var(--accent)', fill = true, dot = true, label = '' } = {}) => {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [i / (values.length - 1) * (w - 4) + 2, h - 3 - (v - min) / span * (h - 6)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const last = pts[pts.length - 1];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label || '趨勢')}">` +
      (fill ? `<path d="${d}L${last[0].toFixed(1)} ${h}L${pts[0][0].toFixed(1)} ${h}Z" fill="${color}" fill-opacity=".1" stroke="none"/>` : '') +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      (dot ? `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6" fill="${color}" stroke="#fff" stroke-width="1.5"/>` : '') + '</svg>';
  };
  /** 直方圖 sparkline；flag 為與 bins 等長的布林陣列，true 的格子畫成錯誤色（例如負值） */
  const hist = (bins, { w = 120, h = 28, color = 'var(--accent)', flag = null, label = '分布' } = {}) => {
    const max = Math.max(...bins, 1);
    const n = bins.length, gap = 1.5, bw = (w - gap * (n - 1)) / n;
    const bars = bins.map((v, i) => {
      const bh = v ? Math.max(2, v / max * (h - 2)) : 0;
      return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${flag && flag[i] ? 'var(--err)' : color}" fill-opacity="${flag && flag[i] ? 1 : 0.78}"/>`;
    }).join('');
    return `<svg class="hist" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><line x1="0" y1="${h - 0.5}" x2="${w}" y2="${h - 0.5}" stroke="var(--line-2)" stroke-width="1"/>${bars}</svg>`;
  };
  const topk = (top) => `<div class="topk">${top.map((t) => `<div class="topk__row"><span class="topk__bar"><span class="topk__fill" style="transform:scaleX(${t.pct.toFixed(3)})"></span><span class="topk__label">${esc(t.value)}</span></span><span class="topk__pct">${Math.round(t.pct * 100)}%</span></div>`).join('')}</div>`;
  const nullBar = (rate) => {
    const level = rate > 0.2 ? 'err' : rate > 0.05 ? 'warn' : 'ok';
    const pct = rate * 100;
    // 0% 不畫填色段：寬 0 的填色段左框線仍會在條尾留一道短線，看起來像有空值
    return `<span class="nullbar" data-level="${level}" role="img" aria-label="空值比例 ${pct.toFixed(1)}%"><span class="nullbar__track">${pct > 0 ? `<span class="nullbar__fill" style="width:${Math.max(2, pct)}%"></span>` : ''}</span><span class="nullbar__pct">${pct < 0.05 && pct > 0 ? '<0.1' : pct.toFixed(1)}%</span></span>`;
  };

  /** 品質分數圓環。dims 有值時畫五段（每段長度 = 該構面分數），否則單一圓弧 */
  const ring = (score, { size = 120, stroke = 9, dims = null, sub = null, label = '品質分數' } = {}) => {
    const r = 50 - stroke / 2 - 1;
    const C = 2 * Math.PI * r;
    const g = grade(score);
    const color = (s) => `var(--g-${grade(s).toLowerCase()})`;
    let arcs = '';
    if (dims) {
      const keys = QUALITY_DIMS.map((d) => d.key);
      const seg = C / keys.length, gap = 3.2;
      keys.forEach((k, i) => {
        const len = seg - gap;
        const fill = len * dims[k] / 100;
        const off = -(i * seg + gap / 2);
        arcs += `<circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--paper-3)" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`;
        arcs += `<circle class="ring__arc" cx="50" cy="50" r="${r}" fill="none" stroke="${color(dims[k])}" stroke-width="${stroke}" stroke-dashoffset="${off.toFixed(2)}" data-len="${fill.toFixed(2)}" data-c="${C.toFixed(2)}" style="stroke-dasharray:0 ${C.toFixed(2)}"/>`;
      });
    } else {
      arcs = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--paper-3)" stroke-width="${stroke}"/>` +
        `<circle class="ring__arc" cx="50" cy="50" r="${r}" fill="none" stroke="${color(score)}" stroke-width="${stroke}" stroke-linecap="round" data-len="${(C * score / 100).toFixed(2)}" data-c="${C.toFixed(2)}" style="stroke-dasharray:0 ${C.toFixed(2)}"/>`;
    }
    const dp = Number.isInteger(score) ? 0 : 1;
    return `<div class="ring${size < 72 ? ' ring--sm' : ''}" data-ring style="--size:${size}px" role="img" aria-label="${esc(label)} ${score.toFixed(dp)}，${g} 級">` +
      `<svg viewBox="0 0 100 100" aria-hidden="true">${arcs}</svg>` +
      `<div class="ring__label" aria-hidden="true"><span class="ring__value" data-count-to="${score.toFixed(dp)}" data-decimals="${dp}">${score.toFixed(dp)}</span><span class="ring__sub">${esc(sub ?? `${g} 級`)}</span></div></div>`;
  };

  const flowHTML = (steps) => `<div class="flow">${steps.map((s, i) => {
    const dot = s.state === 'done' ? `<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : s.state === 'fail' ? `<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
        : s.state === 'active' ? `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
          : esc(s.n ?? i + 1);
    const link = i < steps.length - 1 ? `<span class="flow__link" data-state="${s.state === 'done' ? (steps[i + 1].state === 'active' ? 'active' : steps[i + 1].state === 'fail' ? 'fail' : 'done') : 'todo'}" aria-hidden="true"></span>` : '';
    return `<div class="flow__node" data-state="${s.state}"><span class="flow__dot">${dot}</span><span class="flow__label">${esc(s.label)}</span>${s.meta != null ? `<span class="flow__meta">${esc(s.meta)}</span>` : ''}</div>${link}`;
  }).join('')}</div>`;

  const emptyState = ({ title = '沒有符合的資料', text = '', action = '' } = {}) => `<div class="empty">
    <svg class="empty__art" viewBox="0 0 132 88" aria-hidden="true">
      <rect x="18" y="10" width="96" height="68" rx="8" fill="#fff" stroke="#D9D8D2"/>
      <path d="M18 26h96" stroke="#E6E5E0"/>
      <text x="28" y="21" font-family="JetBrains Mono, monospace" font-size="8" fill="#9A9EA5">[ ]</text>
      <rect x="30" y="38" width="44" height="6" rx="3" fill="#F0F0EC"/><rect x="30" y="52" width="64" height="6" rx="3" fill="#F0F0EC"/><rect x="30" y="66" width="30" height="6" rx="3" fill="#F0F0EC"/>
      <circle cx="96" cy="56" r="13" fill="#F2FAF8" stroke="#0F9D8A" stroke-width="2"/><path d="M105.5 65.5l9 9" stroke="#0F9D8A" stroke-width="2.4" stroke-linecap="round"/>
    </svg>
    <p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}${action}</div>`;

  /* ------------------------------------------------------------------
   * 語法上色（python 風格 DSL 與 SQL），並把每行包成 .code__line 以顯示行號
   * ------------------------------------------------------------------ */
  const PY_KW = new Set(['import', 'from', 'as', 'def', 'return', 'for', 'in', 'if', 'elif', 'else', 'with', 'assert', 'and', 'or', 'not', 'is', 'lambda', 'await', 'async', 'yield', 'class', 'while', 'try', 'raise', 'None', 'True', 'False']);
  const SQL_KW = new Set(['select', 'from', 'where', 'group', 'by', 'order', 'limit', 'and', 'or', 'not', 'as', 'join', 'on', 'left', 'count', 'sum', 'avg', 'having', 'desc', 'asc', 'between', 'is', 'null', 'in', 'case', 'when', 'then', 'end', 'distinct']);
  const BUILTINS = new Set(['len', 'range', 'print', 'sum', 'max', 'min', 'now', 'freq', 'prev', 'round', 'sorted', 'df', 'geo', 'meta', 'source', 'units']);
  function highlightLine(line, lang) {
    if (lang === 'text') return esc(line);
    const re = /(#.*$|--.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_一-鿿][\w一-鿿]*)|(\s+)|(.)/g;
    let out = '', m;
    while ((m = re.exec(line))) {
      const [tok, com, str, num, ident, ws] = m;
      if (com && (lang !== 'sql' ? com.startsWith('#') : com.startsWith('--'))) out += `<span class="tok-com">${esc(com)}</span>`;
      else if (com) out += esc(com);
      else if (str) out += `<span class="tok-str">${esc(str)}</span>`;
      else if (num) out += `<span class="tok-num">${num}</span>`;
      else if (ident) {
        const rest = line.slice(re.lastIndex);
        const prev = line.slice(0, m.index);
        const kwSet = lang === 'sql' ? SQL_KW : PY_KW;
        if (kwSet.has(lang === 'sql' ? ident.toLowerCase() : ident)) out += `<span class="tok-kw">${ident}</span>`;
        else if (/^\s*\(/.test(rest)) out += `<span class="${BUILTINS.has(ident) && !/\.\s*$/.test(prev) ? 'tok-builtin' : 'tok-fn'}">${ident}</span>`;
        else if (/^=(?!=)/.test(rest) && /[(,]\s*$/.test(prev)) out += `<span class="tok-kwarg">${ident}</span>`;
        else if (/\.$/.test(prev)) out += `<span class="tok-attr">${ident}</span>`;
        else if (BUILTINS.has(ident) || /^[A-Z][A-Z_0-9]+$/.test(ident)) out += `<span class="tok-builtin">${ident}</span>`;
        else out += esc(ident);
      } else if (ws) out += ws;
      else out += `<span class="tok-op">${esc(tok)}</span>`;
    }
    return out;
  }
  const highlight = (root = document) => {
    $$('pre.code > code', root).forEach((code) => {
      if (code.dataset.hl) return;
      code.dataset.hl = '1';
      const lang = code.dataset.lang || 'py';
      const lines = code.textContent.replace(/^\n+|\s+$/g, '').split('\n');
      code.innerHTML = lines.map((l) => `<span class="code__line">${highlightLine(l, lang) || ' '}</span>`).join('');
    });
  };

  /* ------------------------------------------------------------------
   * Toast（開啟中的 modal 會把 toast 容器收進 dialog，避免被 top layer 蓋住）
   * ------------------------------------------------------------------ */
  let toastHost = null;
  const placeToasts = () => {
    if (!toastHost) return;
    const open = $$('dialog[open]').filter((d) => d.matches(':modal') && !d.classList.contains('is-closing'));
    const target = open.length ? open[open.length - 1] : document.body;
    if (toastHost.parentElement !== target) target.appendChild(toastHost);
  };
  const toast = (title, { desc = '', tone = 'ok', action = null, duration = 4800 } = {}) => {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
    }
    placeToasts();
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.tone = tone;
    const ic = { ok: 'check', info: 'info', warn: 'alert', err: 'alert', danger: 'alert' }[tone] || 'info';
    el.innerHTML = `<span class="toast__icon">${icon(ic)}</span><div><p class="toast__title">${esc(title)}</p>${desc ? `<p class="toast__desc">${esc(desc)}</p>` : ''}</div>` +
      `<div class="toast__actions">${action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : ''}<button type="button" class="toast__close" aria-label="關閉通知">${icon('x', 'i--sm')}</button></div>` +
      `<span class="toast__timer" aria-hidden="true"></span>`;
    toastHost.appendChild(el);
    while (toastHost.children.length > 4) toastHost.firstElementChild.remove();
    const timer = $('.toast__timer', el);
    timer.style.animation = `timer ${duration}ms linear forwards`;
    let left = duration, started = Date.now(), handle = 0;
    const dismiss = () => {
      clearTimeout(handle);
      if (!el.isConnected || el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 200);
    };
    const arm = () => { started = Date.now(); handle = setTimeout(dismiss, left); timer.style.animationPlayState = 'running'; };
    el.addEventListener('mouseenter', () => { clearTimeout(handle); left -= Date.now() - started; timer.style.animationPlayState = 'paused'; });
    el.addEventListener('mouseleave', arm);
    $('.toast__close', el).addEventListener('click', dismiss);
    if (action) $('.toast__action', el).addEventListener('click', () => { action.onClick(); dismiss(); });
    arm();
    return { dismiss };
  };

  /* ------------------------------------------------------------------
   * Modal / confirm
   * ------------------------------------------------------------------ */
  let modalSeq = 0;
  const openModals = [];
  const modal = ({ title, eyebrow = '', body = '', icon: ic = '', tone = '', size = 'md', actions = [], note = '', onClose = null } = {}) => {
    const d = document.createElement('dialog');
    const id = 'modal-title-' + (++modalSeq);
    d.className = 'modal' + (size !== 'md' ? ' modal--' + size : '');
    d.setAttribute('aria-labelledby', id);
    d.innerHTML = `<div class="modal__head">${ic ? `<span class="modal__icon" data-tone="${esc(tone)}">${icon(ic)}</span>` : ''}<div class="modal__titles">${eyebrow ? `<p class="modal__eyebrow">${esc(eyebrow)}</p>` : ''}<h2 class="modal__title" id="${id}">${esc(title)}</h2></div><button type="button" class="modal__close" aria-label="關閉">${icon('x')}</button></div>` +
      `<div class="modal__body"></div>` + (actions.length || note ? `<div class="modal__foot">${note ? `<span class="modal__note">${esc(note)}</span>` : ''}</div>` : '');
    const bodyEl = $('.modal__body', d);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const foot = $('.modal__foot', d);
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      d.classList.add('is-closing');
      placeToasts();
      setTimeout(() => d.close(), reduceMotion.matches ? 0 : 180);
    };
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.variant ? ' btn--' + a.variant : '');
      b.innerHTML = (a.icon ? icon(a.icon) : '') + esc(a.label);
      if (a.autofocus) b.autofocus = true;
      b.addEventListener('click', () => (a.onClick ? a.onClick(close, b) : close()));
      foot.appendChild(b);
    });
    $('.modal__close', d).addEventListener('click', close);
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.addEventListener('click', (e) => { if (e.target === d) close(); });
    d.addEventListener('close', () => {
      openModals.splice(openModals.indexOf(api), 1);
      d.remove();
      placeToasts();
      if (onClose) onClose();
    });
    document.body.appendChild(d);
    d.showModal();
    const api = { el: d, body: bodyEl, foot, close };
    openModals.push(api);
    placeToasts();
    highlight(d);
    return api;
  };
  const confirm = ({ title, message = '', confirmLabel = '確認', cancelLabel = '取消', tone = 'primary', icon: ic = 'info' } = {}) => new Promise((resolve) => {
    let result = false;
    modal({
      title, icon: ic, tone: tone === 'danger' ? 'danger' : '', size: 'sm',
      body: `<p>${message}</p>`,
      actions: [
        { label: cancelLabel, variant: 'ghost', onClick: (close) => close() },
        { label: confirmLabel, variant: tone === 'danger' ? 'danger-solid' : 'primary', autofocus: true, onClick: (close) => { result = true; close(); } },
      ],
      onClose: () => resolve(result),
    });
  });

  /* ------------------------------------------------------------------
   * Tabs
   * ------------------------------------------------------------------ */
  const tabs = (list, { onChange = null } = {}) => {
    const items = $$('[role="tab"]', list);
    let ink = $('.tabs__ink', list);
    if (!ink) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    const moveInk = () => {
      const cur = items.find((t) => t.getAttribute('aria-selected') === 'true');
      if (!cur) return;
      ink.style.width = '1px';
      ink.style.transform = `translateX(${cur.offsetLeft}px) scaleX(${cur.offsetWidth})`;
    };
    const select = (i, focus = false) => {
      items.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) items[i].focus();
      moveInk();
      if (onChange) onChange(i, items[i]);
    };
    items.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); select((i + k + items.length) % items.length, true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); }
        if (e.key === 'End') { e.preventDefault(); select(items.length - 1, true); }
      });
    });
    const start = Math.max(0, items.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    items.forEach((t, k) => { t.tabIndex = k === start ? 0 : -1; });
    requestAnimationFrame(moveInk);
    new ResizeObserver(moveInk).observe(list);
    return { select };
  };

  /* ------------------------------------------------------------------
   * 逐行流入、記錄打字、數字滾動、進場、離屏暫停
   * ------------------------------------------------------------------ */
  const stream = (root, { selector = null, interval = 42, max = 720 } = {}) => {
    if (!root) return Promise.resolve();
    let items = selector ? $$(selector, root) : $$('[data-stream]', root);
    if (!items.length) items = Array.from(root.children);
    if (reduceMotion.matches || !items.length) { items.forEach((el) => el.classList.remove('stream-item', 'is-in')); return Promise.resolve(); }
    const step = Math.min(interval, max / items.length);
    items.forEach((el) => { el.classList.add('stream-item'); el.classList.remove('is-in'); });
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        items.forEach((el, i) => setTimeout(() => el.classList.add('is-in'), i * step));
        setTimeout(resolve, items.length * step + 360);
      }));
    });
  };
  /** 把 log 一行行打進 .log 容器；回傳的 Promise 在全部印完後 resolve，cancel() 可中止 */
  const streamLines = (el, lines, { interval = 170 } = {}) => {
    let cancelled = false;
    const row = (l) => `<div class="log__line" data-level="${l.level || 'info'}"><span class="log__time">${esc(l.t || '')}</span><span class="log__msg">${esc(l.msg)}</span></div>`;
    if (reduceMotion.matches) { el.innerHTML = lines.map(row).join(''); const p = Promise.resolve(); p.cancel = () => {}; return p; }
    el.innerHTML = '';
    const p = (async () => {
      for (const l of lines) {
        if (cancelled || !el.isConnected) return;
        el.insertAdjacentHTML('beforeend', row(l));
        const last = el.lastElementChild;
        last.classList.add('stream-item');
        requestAnimationFrame(() => last.classList.add('is-in'));
        el.scrollTop = el.scrollHeight;
        await sleep(l.level === 'err' ? interval * 2 : interval);
      }
    })();
    p.cancel = () => { cancelled = true; };
    return p;
  };

  const countUp = (el, to) => {
    const target = to != null ? Number(to) : Number(el.dataset.countTo);
    const dp = Number(el.dataset.decimals || 0);
    const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    const render = (v) => { el.textContent = pre + fmt.num(v, dp) + suf; };
    if (reduceMotion.matches) { render(target); return; }
    // 從畫面目前顯示的值起跳；連續呼叫時以 token 取消前一段動畫，避免互相覆寫
    const from = Number((el.textContent || '0').replace(/[^\d.-]/g, '')) || 0;
    const token = (el.__countToken || 0) + 1;
    el.__countToken = token;
    const start = performance.now(), dur = 900;
    const tick = (t) => {
      if (el.__countToken !== token) return;
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      render(from + (target - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  let revealIO = null;
  const reveal = (root = document) => {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (reduceMotion.matches || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
      }), { rootMargin: '0px 0px -6% 0px' });
    }
    els.forEach((el) => {
      // 初次載入已在視窗內的直接顯示，不做進場
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
      else revealIO.observe(el);
    });
  };

  let animIO = null;
  const watchAnim = (el) => {
    if (!animIO) {
      animIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        e.target.__offscreen = !e.isIntersecting;
        e.target.classList.toggle('is-paused', e.target.__offscreen || document.hidden);
      }));
    }
    animIO.observe(el);
  };
  document.addEventListener('visibilitychange', () => {
    $$('[data-anim]').forEach((el) => el.classList.toggle('is-paused', document.hidden || !!el.__offscreen));
  });

  let ringIO = null;
  const animateRing = (el) => {
    if (el.__ringAnimated) return;
    el.__ringAnimated = true;
    $$('.ring__arc', el).forEach((a) => { a.style.strokeDasharray = `${a.dataset.len} ${a.dataset.c}`; });
    const v = $('[data-count-to]', el);
    if (v) { v.textContent = '0'; countUp(v); }
  };
  const watchRings = (root = document) => {
    const els = $$('[data-ring]:not([data-ring-done])', root);
    if (reduceMotion.matches) { els.forEach((el) => { el.dataset.ringDone = '1'; $$('.ring__arc', el).forEach((a) => { a.style.strokeDasharray = `${a.dataset.len} ${a.dataset.c}`; }); }); return; }
    if (!ringIO) {
      ringIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { ringIO.unobserve(e.target); animateRing(e.target); }
      }), { threshold: 0.3 });
    }
    els.forEach((el) => { el.dataset.ringDone = '1'; ringIO.observe(el); });
    // 保底：2.5 秒後仍未進場的圓環直接畫滿，避免靜態截圖或快速捲動時停在 0
    setTimeout(() => els.forEach((el) => { if (!el.__ringAnimated) { ringIO.unobserve(el); animateRing(el); } }), 2500);
  };

  let countIO = null;
  const watchCounts = (root = document) => {
    const els = $$('[data-count-to]:not([data-count-done])', root).filter((el) => !el.closest('[data-ring]'));
    els.forEach((el) => { el.dataset.countDone = '1'; });
    if (reduceMotion.matches) { els.forEach((el) => countUp(el)); return; }
    if (!countIO) {
      countIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.isIntersecting) { countIO.unobserve(e.target); countUp(e.target); }
      }));
    }
    els.forEach((el) => countIO.observe(el));
  };

  /* ------------------------------------------------------------------
   * Notebook cell 引擎
   * 執行流程：queued → running（gutter [*] + spinner、輸出變淡）→ 重算輸出 → done（[n] + 勾勾描繪、輸出逐行流入）
   * 使用者觸發的執行走同一條 kernel 佇列（一次一格，和真的 kernel 一樣）
   * ------------------------------------------------------------------ */
  const cellDefs = new WeakMap();
  let execCount = 0;
  let kernelBusy = 0;
  let kernelQueue = Promise.resolve();

  const GUTTER_SVG = '<svg class="st-queue" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--line-3)" stroke-width="1.5" stroke-dasharray="2 2.4"/></svg>' +
    '<svg class="st-spin" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--accent-soft)" stroke-width="2"/><path d="M9 2.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>' +
    '<svg class="st-done" viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9.5l3.2 3.2L14 5.5" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<svg class="st-warn" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.2l7 12.6H2z" fill="var(--warn)"/><path d="M9 7v3.6M9 12.6v.01" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>' +
    '<svg class="st-err" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.2" fill="var(--err)"/><path d="M6.4 6.4l5.2 5.2M11.6 6.4l-5.2 5.2" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>';

  const setKernel = () => {
    $$('[data-kernel]').forEach((k) => {
      k.dataset.busy = kernelBusy > 0 ? 'true' : 'false';
      const label = $('.kernel__label', k);
      if (label) label.textContent = kernelBusy > 0 ? `核心 執行中${kernelBusy > 1 ? ' · ' + kernelBusy : ''}` : '核心 閒置';
      k.setAttribute('aria-label', kernelBusy > 0 ? '核心執行中' : '核心閒置');
    });
  };

  const cellCount = (cell) => $('.cell__count', cell);
  const setMeta = (cell, state, sec) => {
    const meta = $('.cell__meta', cell);
    if (meta) meta.innerHTML = `${state === 'done' ? icon('check', 'i--sm') : ''}<span>${sec.toFixed(2)} 秒 · ${fmt.clock(now())}</span>`;
  };
  const markOut = (cell, n) => { $$('[data-out]', cell).forEach((e) => { e.textContent = `Out[${n}]:`; }); };
  const setState = (cell, state) => {
    cell.dataset.state = state;
    const n = cellCount(cell);
    if (n && !cell.classList.contains('cell--md')) {
      if (state === 'pending') n.textContent = '[ ]';
      else if (state === 'queued' || state === 'running') n.textContent = '[*]';
      else n.textContent = `[${cell.dataset.exec || ' '}]`;
    }
    cell.setAttribute('aria-busy', state === 'running' || state === 'queued' ? 'true' : 'false');
    syncOutline(cell);
  };

  const initCell = (cell) => {
    if (cell.__init) return;
    cell.__init = true;
    const md = cell.classList.contains('cell--md');
    if (!$(':scope > .cell__gutter', cell)) {
      const g = document.createElement('div');
      g.className = 'cell__gutter';
      g.setAttribute('aria-hidden', 'true');
      g.innerHTML = `<span class="cell__count">${md ? 'md' : '[ ]'}</span>${md ? '' : `<span class="cell__state">${GUTTER_SVG}</span>`}<span class="cell__scan"></span>`;
      cell.prepend(g);
    }
    const head = $('.cell__head', cell);
    if (head && !md && cell.dataset.tools !== 'none') {
      if (!$('.cell__meta', head)) {
        const meta = document.createElement('span');
        meta.className = 'cell__meta';
        head.appendChild(meta);
      }
      if (!$('.cell__tools', head)) {
        const tools = document.createElement('div');
        tools.className = 'cell__tools';
        const title = ($('.cell__title', cell) || {}).textContent || '此 cell';
        if ($('pre.code', cell)) tools.innerHTML += `<button type="button" class="cell-tool" data-cell-fold aria-expanded="true" aria-label="隱藏「${esc(title)}」的程式碼">${icon('code', 'i--sm')}<span class="cell-tool__label">程式碼</span></button>`;
        tools.innerHTML += `<button type="button" class="cell-tool" data-cell-run aria-label="重新執行「${esc(title)}」">${icon('play', 'i--sm')}<span class="cell-tool__label">執行</span></button>`;
        head.appendChild(tools);
      }
    }
    cell.addEventListener('click', (e) => {
      if (e.target.closest('[data-cell-run]')) { run(cell); return; }
      const fold = e.target.closest('[data-cell-fold]');
      if (fold) { foldCell(cell, !cell.classList.contains('is-folded')); return; }
      activate(cell);
    });
    cell.addEventListener('focusin', () => activate(cell));
  };
  const activate = (cell) => {
    if (cell.classList.contains('is-active')) return;
    $$('.cell.is-active').forEach((c) => c.classList.remove('is-active'));
    cell.classList.add('is-active');
  };
  const foldCell = (cell, folded) => {
    cell.classList.toggle('is-folded', folded);
    const b = $('[data-cell-fold]', cell);
    if (b) {
      b.setAttribute('aria-expanded', folded ? 'false' : 'true');
      b.innerHTML = `${icon(folded ? 'eye-off' : 'code', 'i--sm')}<span class="cell-tool__label">${folded ? '顯示程式碼' : '程式碼'}</span>`;
    }
  };

  /** 實際執行一格：duration 為模擬運算時間；replay 只重播輸出（開場自動執行用） */
  const exec = async (cell, { duration = null, replay = false, n: fixedN = null } = {}) => {
    kernelBusy += 1; setKernel();
    const n = fixedN ?? ++execCount;
    cell.classList.toggle('is-boot', replay);
    setState(cell, 'running');
    const t0 = performance.now();
    const ms = reduceMotion.matches ? 0 : (duration ?? 520 + Math.random() * 520);
    await sleep(ms);
    const def = cellDefs.get(cell);
    let result = null;
    if (def && def.run && !replay) result = await def.run(cell);
    const state = (result && result.state) || cell.dataset.result || 'done';
    cell.dataset.exec = n;
    markOut(cell, n);
    setState(cell, state);
    setMeta(cell, state, (performance.now() - t0) / 1000 + (replay ? 0.08 + Math.random() * 0.3 : 0));
    kernelBusy -= 1; setKernel();
    cell.classList.remove('is-boot');
    const out = $('.cell__output', cell);
    watchRings(cell);
    await stream(out);
    document.dispatchEvent(new CustomEvent('cell:done', { detail: { cell, count: n, state } }));
    return state;
  };

  const run = (cell, opts = {}) => {
    if (typeof cell === 'string') cell = document.getElementById(cell);
    if (cell.__running) return cell.__running;
    setState(cell, 'queued');
    const p = kernelQueue.then(() => exec(cell, opts));
    // 佇列只負責排序：前一格的錯誤不能卡住後面的 cell，錯誤本身仍會在 p 上拋出
    kernelQueue = p.then(() => {}, () => {});
    cell.__running = p;
    const clear = () => { cell.__running = null; };
    p.then(clear, clear);
    return p;
  };
  const runAll = () => Promise.all($$('.cell[data-cell]').map((c) => run(c)));

  /** 開場自動執行：進入視窗的 cell 依序（但不排 kernel 佇列）執行；3 秒保底全部執行 */
  const autorun = () => {
    const cells = $$('.cell[data-cell]');
    if (!cells.length) return;
    if (reduceMotion.matches) {
      cells.forEach((c) => {
        execCount += 1;
        c.dataset.exec = execCount;
        markOut(c, execCount);
        setState(c, c.dataset.result || 'done');
        setMeta(c, c.dataset.state, 0.12 + (hash(c.id || String(execCount)) % 40) / 100);
      });
      watchRings();
      return;
    }
    cells.forEach((c) => setState(c, 'pending'));
    // 開場序號依文件順序 [1]…[n]，不受捲動先後影響；之後使用者重跑才往上累加
    execCount = cells.length;
    let batchDelay = 0, batchTimer = 0;
    const start = (c, delay) => {
      if (c.dataset.state !== 'pending') return;
      setState(c, 'queued');
      setTimeout(() => exec(c, { duration: 240 + Math.random() * 200, replay: true, n: cells.indexOf(c) + 1 }), delay);
    };
    const io = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting)
        .sort((a, b) => cells.indexOf(a.target) - cells.indexOf(b.target))
        .forEach((e) => {
          io.unobserve(e.target);
          start(e.target, batchDelay);
          batchDelay += 160;
          clearTimeout(batchTimer);
          batchTimer = setTimeout(() => { batchDelay = 0; }, 200);
        });
    }, { rootMargin: '0px 0px -8% 0px' });
    cells.forEach((c) => io.observe(c));
    setTimeout(() => {
      cells.filter((c) => c.dataset.state === 'pending').forEach((c, i) => { io.unobserve(c); start(c, i * 60); });
    }, 3000);
  };

  const cell = {
    define(target, def) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      cellDefs.set(el, def);
    },
    run,
    runAll,
    fold: foldCell,
    foldAll(folded) { $$('.cell[data-cell]').forEach((c) => foldCell(c, folded)); },
    // 尚未開場執行的 cell 只記下結果狀態，避免輸出在開場前先閃現
    setState(el, state) { el.dataset.result = state; if (el.dataset.state && !['pending', 'queued', 'running'].includes(el.dataset.state)) setState(el, state); },
    badge(el, text, tone = '') { el.dataset.outlineBadge = text ?? ''; el.dataset.outlineTone = tone; syncOutline(el); },
    get count() { return execCount; },
  };

  /* ------------------------------------------------------------------
   * 大綱：由 .cell[id] 產生，scroll spy 標示目前 cell
   * ------------------------------------------------------------------ */
  const outlineLinks = new Map();
  function syncOutline(c) {
    const a = outlineLinks.get(c);
    if (!a) return;
    a.dataset.state = c.dataset.state || '';
    $('.outline__n', a).textContent = c.classList.contains('cell--md') ? 'md' : (['queued', 'running'].includes(c.dataset.state) ? '[*]' : `[${c.dataset.exec || ' '}]`);
    const b = $('.outline__badge', a);
    const text = c.dataset.outlineBadge;
    b.hidden = !text;
    b.textContent = text || '';
    b.className = 'outline__badge count' + (c.dataset.outlineTone ? ' count--' + c.dataset.outlineTone : '');
  }
  const buildOutline = () => {
    const nav = $('[data-outline]');
    if (!nav) return;
    const cells = $$('.cell[id]');
    nav.classList.add('outline');
    nav.innerHTML = '';
    cells.forEach((c) => {
      const t = c.dataset.outlineTitle || ($('.cell__title', c) || $('h1, h2', c) || {}).textContent || c.id;
      const a = document.createElement('a');
      a.className = 'outline__link';
      a.href = '#' + c.id;
      a.innerHTML = `<span class="outline__n"></span><span class="truncate">${esc(t.trim())}</span><span class="outline__badge count" hidden></span>`;
      a.addEventListener('click', () => activate(c));
      nav.appendChild(a);
      outlineLinks.set(c, a);
      syncOutline(c);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { e.target.__vis = e.isIntersecting ? e.intersectionRatio : 0; });
      const best = cells.filter((c) => c.__vis > 0)[0];
      if (best) outlineLinks.forEach((a, c) => a.classList.toggle('is-current', c === best));
    }, { rootMargin: '-70px 0px -55% 0px', threshold: [0, 0.01, 0.5, 1] });
    cells.forEach((c) => io.observe(c));
  };

  /* ------------------------------------------------------------------
   * 招牌動畫：即時處理管線（canvas 流動點）
   * ------------------------------------------------------------------ */
  function pipeline(root, opts) {
    const stages = opts.stages;
    const keys = stages.map((s) => s.key);
    const failRate = Object.assign({ validate: 0.06, transform: 0.03 }, opts.failRate || {});
    const rate = opts.rate || 1.5; // 每秒進入擷取的工作數
    const COLORS = { ok: '#0F9D8A', fail: '#D64545', retry: '#D98E04' };
    const state = {
      running: Object.fromEntries(stages.map((s) => [s.key, s.running])),
      today: Object.fromEntries(stages.map((s) => [s.key, s.today])),
      sink: opts.sink.value,
      retry: opts.retry.value,
      dwelling: Object.fromEntries([...keys, 'retry'].map((k) => [k, 0])),
    };

    root.classList.add('pipe');
    root.setAttribute('data-anim', '');
    root.innerHTML = `<canvas class="pipe__canvas" aria-hidden="true"></canvas><div class="pipe__grid">` +
      `<div class="pipe__end" data-pipe="src">${icon('calendarClock')}<span>${esc(opts.source.label)}</span><b>${esc(opts.source.value)}</b><span class="mono">${esc(opts.source.unit || '')}</span></div>` +
      stages.map((s, i) => `<button type="button" class="pipe__node" data-pipe="${s.key}" aria-pressed="false" aria-label="${esc(s.label)}：篩選此步驟處理中的工作">` +
        `<span class="pipe__step"><span>${p2(i + 1)} · ${esc(s.en.toUpperCase())}</span><span class="pipe__live" aria-hidden="true"></span></span>` +
        `<span class="pipe__name">${esc(s.label)}</span>` +
        `<span class="pipe__stats"><span class="pipe__stat"><span>處理中</span><b data-f="running">${s.running}</b></span><span class="pipe__stat"><span>今日</span><b data-f="today">${fmt.num(s.today)}</b></span><span class="pipe__stat"><span>成功率</span><b>${(s.success * 100).toFixed(1)}%</b></span></span>` +
        `<span class="pipe__bar" aria-hidden="true"><span style="transform:scaleX(${s.success})"></span></span></button>`).join('') +
      `<div class="pipe__end pipe__end--sink" data-pipe="sink">${icon('globe')}<span>${esc(opts.sink.label)}</span><b data-f="sink">${fmt.num(state.sink)}</b></div>` +
      `<div class="pipe__retry" data-pipe="retry">${icon('retry')}<span class="pipe__retry-text"><span>${esc(opts.retry.label)}</span>${opts.retry.note ? `<small>${esc(opts.retry.note)}</small>` : ''}</span><b data-f="retry">${state.retry}</b></div>` +
      `</div>`;
    const canvas = $('.pipe__canvas', root);
    const ctx = canvas.getContext('2d');
    const el = (k) => $(`[data-pipe="${k}"]`, root);
    const nodes = Object.fromEntries(['src', ...keys, 'sink', 'retry'].map((k) => [k, el(k)]));

    let W = 0, H = 0, dpr = 1, vertical = false;
    let paths = {};
    let particles = [];
    let paused = false, offscreen = false, raf = 0, last = 0, spawnAcc = 0;
    const lastPulse = {};

    const rectOf = (k) => {
      const r = nodes[k].getBoundingClientRect(), base = root.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, cx: r.left - base.left + r.width / 2, cy: r.top - base.top + r.height / 2 };
    };
    const P = (x, y) => ({ x, y });
    const L = (a, b) => ({ t: 'L', a, b });
    const Cb = (a, c1, c2, b) => ({ t: 'C', a, c1, c2, b });
    const cubic = (s, t) => {
      const u = 1 - t;
      return P(u * u * u * s.a.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.b.x,
        u * u * u * s.a.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.b.y);
    };
    const build = (segs, kind) => {
      const pts = [];
      segs.forEach((s, i) => {
        const n = s.t === 'L' ? Math.max(2, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 5)) : 32;
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const t = k / n;
          pts.push(s.t === 'L' ? P(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t) : cubic(s, t));
        }
      });
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      return { pts, cum, len: cum[cum.length - 1], kind };
    };
    const at = (path, s) => {
      s = clamp(s, 0, path.len);
      let lo = 0, hi = path.cum.length - 1;
      while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (path.cum[mid] < s) lo = mid; else hi = mid; }
      const seg = path.cum[hi] - path.cum[lo] || 1;
      const t = (s - path.cum[lo]) / seg;
      const a = path.pts[lo], b = path.pts[hi];
      return P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    };

    const layout = () => {
      const w = root.clientWidth;
      const wantVertical = w < 760;
      if (wantVertical !== vertical) { vertical = wantVertical; root.classList.toggle('is-vertical', vertical); }
      W = root.clientWidth; H = root.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const R = Object.fromEntries(Object.keys(nodes).map((k) => [k, rectOf(k)]));
      const chain = ['src', ...keys, 'sink'];
      const old = paths;
      paths = {};
      chain.slice(0, -1).forEach((k, i) => {
        const a = R[k], b = R[chain[i + 1]];
        paths[`${k}>${chain[i + 1]}`] = vertical
          ? build([L(P(a.cx, a.y + a.h), P(b.cx, b.y))], 'ok')
          : build([L(P(a.x + a.w, a.cy), P(b.x, b.cy))], 'ok');
      });
      const rt = R.retry;
      if (!vertical) {
        const v = R.validate, t = R.transform, e = R.extract;
        const rx1 = rt.x + rt.w * 0.22, rx2 = rt.x + rt.w * 0.78;
        paths['validate>retry'] = build([Cb(P(v.cx, v.y + v.h), P(v.cx, v.y + v.h + 30), P(rx1, rt.y - 30), P(rx1, rt.y))], 'fail');
        paths['transform>retry'] = build([Cb(P(t.cx, t.y + t.h), P(t.cx, t.y + t.h + 30), P(rx2, rt.y - 30), P(rx2, rt.y))], 'fail');
        paths['retry>extract'] = build([Cb(P(rt.x, rt.cy), P(rt.x - 90, rt.cy), P(e.cx, e.y + e.h + 46), P(e.cx, e.y + e.h))], 'retry');
      } else {
        const v = R.validate, t = R.transform, e = R.extract;
        const xr = W - 13, xl = 13;
        paths['validate>retry'] = build([Cb(P(v.x + v.w, v.cy), P(xr, v.cy), P(xr, v.cy), P(xr, v.cy + 18)), L(P(xr, v.cy + 18), P(xr, rt.cy - 18)), Cb(P(xr, rt.cy - 18), P(xr, rt.cy), P(xr, rt.cy), P(rt.x + rt.w, rt.cy))], 'fail');
        paths['transform>retry'] = build([Cb(P(t.x + t.w, t.cy), P(xr - 6, t.cy), P(xr - 6, t.cy), P(xr - 6, t.cy + 14)), L(P(xr - 6, t.cy + 14), P(xr - 6, rt.cy - 22)), Cb(P(xr - 6, rt.cy - 22), P(xr - 6, rt.cy - 6), P(xr - 6, rt.cy - 6), P(rt.x + rt.w, rt.cy - 4))], 'fail');
        paths['retry>extract'] = build([Cb(P(rt.x, rt.cy), P(xl, rt.cy), P(xl, rt.cy), P(xl, rt.cy - 18)), L(P(xl, rt.cy - 18), P(xl, e.cy + 18)), Cb(P(xl, e.cy + 18), P(xl, e.cy), P(xl, e.cy), P(e.x, e.cy))], 'retry');
      }
      // 版面改變時保留點在路徑上的相對位置
      particles.forEach((p) => {
        if (p.path && old[p.path] && paths[p.path]) p.s = p.s / old[p.path].len * paths[p.path].len;
      });
      if (!raf) draw();
    };

    const pulse = (k, fail = false) => {
      const n = nodes[k];
      const t = performance.now();
      if (!n || (lastPulse[k] && t - lastPulse[k] < 260)) return;
      lastPulse[k] = t;
      const cls = fail ? 'is-fail-pulse' : 'is-pulse';
      n.classList.remove('is-pulse', 'is-fail-pulse');
      void n.offsetWidth;
      n.classList.add(cls);
    };
    const shown = {};
    const setText = (sel, v) => {
      const e = $(sel, root);
      if (e && shown[sel] !== v) { e.textContent = v; shown[sel] = v; }
    };
    const updateDom = () => {
      keys.forEach((k) => {
        setText(`[data-pipe="${k}"] [data-f="running"]`, String(state.running[k] + state.dwelling[k]));
        setText(`[data-pipe="${k}"] [data-f="today"]`, fmt.num(state.today[k]));
        nodes[k].dataset.busy = state.dwelling[k] > 0 ? 'true' : 'false';
      });
      setText('[data-f="sink"]', fmt.num(state.sink));
      setText('[data-f="retry"]', String(state.retry + state.dwelling.retry));
    };

    const DWELL = { extract: [500, 1300], validate: [380, 900], transform: [300, 800], publish: [200, 520], retry: [2600, 4200] };
    const spawn = () => particles.push({ path: 'src>extract', s: 0, speed: 62 + Math.random() * 30, kind: 'ok', at: null, until: 0 });
    const next = (p, from) => {
      let to = null, kind = 'ok';
      if (from === 'extract') to = 'extract>validate';
      else if (from === 'validate') { if (Math.random() < failRate.validate) { to = 'validate>retry'; kind = 'fail'; pulse('validate', true); } else to = 'validate>transform'; }
      else if (from === 'transform') { if (Math.random() < failRate.transform) { to = 'transform>retry'; kind = 'fail'; pulse('transform', true); } else to = 'transform>publish'; }
      else if (from === 'publish') to = 'publish>sink';
      else if (from === 'retry') { to = 'retry>extract'; kind = 'retry'; }
      if (keys.includes(from)) state.today[from] += 1;
      if (kind === 'fail' && opts.onEvent) opts.onEvent('fail', from);
      p.path = to; p.s = 0; p.kind = kind; p.at = null;
      p.speed = (kind === 'ok' ? 62 : 84) + Math.random() * 30;
    };
    const arrive = (p) => {
      const target = p.path.split('>')[1];
      if (target === 'sink') {
        state.sink += 1;
        p.dead = true;
        pulse('sink');
        if (opts.onEvent) opts.onEvent('publish', 'sink');
        return;
      }
      p.at = target; p.path = null;
      const d = DWELL[target];
      p.until = performance.now() + d[0] + Math.random() * (d[1] - d[0]);
      state.dwelling[target] += 1;
      pulse(target);
    };

    const drawBase = () => {
      ctx.clearRect(0, 0, W, H);
      Object.values(paths).forEach((path) => {
        ctx.beginPath();
        path.pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.lineWidth = path.kind === 'ok' ? 2 : 1.5;
        ctx.strokeStyle = path.kind === 'ok' ? '#D9D8D2' : path.kind === 'fail' ? 'rgba(214,69,69,.35)' : 'rgba(217,142,4,.45)';
        ctx.setLineDash(path.kind === 'ok' ? [] : [4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        // 終點箭頭，讓方向一眼可讀
        const e = path.pts[path.pts.length - 1], b = at(path, path.len - 6);
        const ang = Math.atan2(e.y - b.y, e.x - b.x);
        ctx.beginPath();
        ctx.moveTo(e.x - Math.cos(ang - 0.5) * 6, e.y - Math.sin(ang - 0.5) * 6);
        ctx.lineTo(e.x, e.y);
        ctx.lineTo(e.x - Math.cos(ang + 0.5) * 6, e.y - Math.sin(ang + 0.5) * 6);
        ctx.strokeStyle = path.kind === 'ok' ? '#C2C1BA' : path.kind === 'fail' ? 'rgba(214,69,69,.5)' : 'rgba(217,142,4,.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    };
    const drawParticle = (path, s, kind) => {
      const color = COLORS[kind];
      const tail = 26;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = at(path, s - tail * (i + 1) / 6), b = at(path, s - tail * i / 6);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.5 * (1 - i / 6); ctx.lineWidth = 3 - i * 0.35;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const h = at(path, s);
      ctx.beginPath(); ctx.arc(h.x, h.y, 4.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(h.x, h.y, 3.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    };
    const draw = () => {
      drawBase();
      if (reduceMotion.matches) {
        // 靜態畫面：每條路徑放一到兩個點，畫面仍完整呈現「流向」
        Object.values(paths).forEach((path) => {
          drawParticle(path, path.len * 0.62, path.kind);
          if (path.kind === 'ok' && path.len > 40) drawParticle(path, path.len * 0.22, path.kind);
        });
        return;
      }
      particles.forEach((p) => { if (p.path && paths[p.path]) drawParticle(paths[p.path], p.s, p.kind); });
    };

    const frame = (t) => {
      raf = 0;
      if (paused || offscreen || document.hidden) return;
      const dt = Math.min(50, t - (last || t)) / 1000;
      last = t;
      spawnAcc += dt * rate * (0.7 + Math.random() * 0.6);
      while (spawnAcc >= 1) { spawnAcc -= 1; if (particles.length < 46) spawn(); }
      const nowT = performance.now();
      particles.forEach((p) => {
        if (p.at) {
          if (nowT >= p.until) { state.dwelling[p.at] -= 1; next(p, p.at); }
          return;
        }
        p.s += p.speed * dt;
        if (p.s >= paths[p.path].len) arrive(p);
      });
      particles = particles.filter((p) => !p.dead);
      draw();
      updateDom();
      raf = requestAnimationFrame(frame);
    };
    const loop = () => {
      if (raf || paused || offscreen || document.hidden || reduceMotion.matches) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

    keys.forEach((k) => nodes[k].addEventListener('click', () => {
      const on = nodes[k].getAttribute('aria-pressed') !== 'true';
      keys.forEach((x) => nodes[x].setAttribute('aria-pressed', on && x === k ? 'true' : 'false'));
      if (opts.onSelect) opts.onSelect(on ? k : null);
    }));

    new ResizeObserver(() => layout()).observe(root);
    new IntersectionObserver((entries) => {
      offscreen = !entries[entries.length - 1].isIntersecting;
      if (offscreen) stop(); else loop();
    }).observe(root);
    watchAnim(root);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else loop(); });

    // 開場先在路徑上撒幾個點，畫面一出現就是「流動中」而不是空的
    layout();
    if (!reduceMotion.matches) {
      Object.keys(paths).filter((k) => paths[k].kind === 'ok').forEach((k, i) => {
        particles.push({ path: k, s: paths[k].len * (0.25 + (i % 3) * 0.25), speed: 70, kind: 'ok', at: null, until: 0 });
      });
    }
    updateDom();
    loop();

    return {
      pause() { paused = true; stop(); },
      resume() { paused = false; loop(); },
      toggle() { if (paused) this.resume(); else this.pause(); return paused; },
      get paused() { return paused; },
      set(key, values) {
        if (key === 'retry') state.retry = values;
        else if (key === 'sink') state.sink = values;
        else Object.assign(state, { running: { ...state.running, [key]: values.running ?? state.running[key] }, today: { ...state.today, [key]: values.today ?? state.today[key] } });
        updateDom();
      },
      select(key) { keys.forEach((x) => nodes[x].setAttribute('aria-pressed', x === key ? 'true' : 'false')); },
      get state() { return state; },
    };
  }

  /* ------------------------------------------------------------------
   * 頁首：active 標示、行動版選單、全域搜尋、時鐘
   * ------------------------------------------------------------------ */
  const markNav = () => {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.mainnav__link').forEach((a) => {
      const href = (a.getAttribute('href') || '').split('?')[0].toLowerCase();
      a.classList.toggle('is-active', href === file);
      if (href === file) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  };

  const initMobileNav = () => {
    const btn = $('[data-nav-toggle]');
    const nav = $('.mainnav');
    if (!btn || !nav) return;
    const set = (open) => {
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    };
    btn.addEventListener('click', () => set(!nav.classList.contains('is-open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { set(false); btn.focus(); } });
    document.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.target) && !btn.contains(e.target)) set(false); });
    matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) set(false); });
  };

  const initSearch = (form) => {
    const input = $('input', form);
    const box = document.createElement('div');
    box.className = 'suggest';
    box.id = 'suggest-' + Math.random().toString(36).slice(2, 8);
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    form.appendChild(box);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', box.id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');
    let items = [], idx = -1;
    const mark = (s, q) => { const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    const render = () => {
      const q = input.value.trim();
      if (!q) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      const ql = q.toLowerCase();
      const hits = datasets.filter((d) => [d.title, d.code, AGENCIES[d.agency].name, AGENCIES[d.agency].full, THEMES[d.theme], ...d.tags].some((s) => s.toLowerCase().includes(ql))).slice(0, 6);
      items = hits.map((d) => ({ href: datasetUrl(d.id) }));
      items.push({ href: 'datasets.html?q=' + encodeURIComponent(q) });
      box.innerHTML = (hits.length ? `<p class="suggest__label">資料集 · ${hits.length} 筆</p>` + hits.map((d, i) => `<a class="suggest__item" role="option" id="${box.id}-${i}" href="${datasetUrl(d.id)}" aria-selected="false"><span class="suggest__title">${mark(d.title, q)}</span><span class="suggest__sub">${esc(AGENCIES[d.agency].name)} · ${esc(d.code)} · ${esc(FREQS[d.freq].label)}</span><span class="suggest__meta">${gradeBadge(d.quality)}</span></a>`).join('') : `<p class="suggest__empty">找不到「${esc(q)}」相關的資料集</p>`) +
        `<a class="suggest__all" role="option" id="${box.id}-${hits.length}" href="datasets.html?q=${encodeURIComponent(q)}" aria-selected="false">${icon('search', 'i--sm')}在資料集清單搜尋「${esc(q)}」</a>`;
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      idx = -1;
    };
    const move = (d) => {
      const opts = $$('[role="option"]', box);
      if (!opts.length) return;
      idx = (idx + d + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', i === idx ? 'true' : 'false'));
      input.setAttribute('aria-activedescendant', opts[idx].id);
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Escape') { box.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      const target = idx >= 0 && items[idx] ? items[idx].href : (q ? 'datasets.html?q=' + encodeURIComponent(q) : 'datasets.html');
      location.href = target;
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); } });
  };

  const initClock = () => {
    const els = $$('[data-clock]');
    if (!els.length) return;
    const tick = () => {
      const t = now();
      els.forEach((el) => { el.textContent = el.dataset.clock === 'time' ? fmt.clock(t) : `${fmt.date(t)}（${fmt.weekday(t)}）${fmt.clock(t)}`; });
    };
    tick();
    setInterval(tick, 1000);
  };

  /* ------------------------------------------------------------------
   * 初始化
   * ------------------------------------------------------------------ */
  const init = () => {
    markNav();
    initMobileNav();
    $$('[data-gsearch]').forEach(initSearch);
    initClock();
    setKernel();
    highlight();
    $$('.cell[data-cell], .cell--md').forEach(initCell);
    buildOutline();
    $$('.tabs[data-tabs]').forEach((t) => tabs(t));
    $$('[data-anim]').forEach(watchAnim);
    reveal();
    watchCounts();
    // "/" 聚焦搜尋；Shift+Enter 執行目前 cell；Escape 關閉最上層 modal
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        const input = $$('[data-gsearch] input').find((i) => i.offsetParent !== null);
        if (input) { e.preventDefault(); input.focus(); }
      }
      if (e.key === 'Enter' && e.shiftKey && !typing) {
        const c = $('.cell.is-active[data-cell]');
        if (c) { e.preventDefault(); run(c); }
      }
      if (e.key === 'Escape' && openModals.length && !e.defaultPrevented) openModals[openModals.length - 1].close();
    });
    // 開場自動執行排在所有 DOMContentLoaded handler（含頁面自己的輸出渲染）之後
    // app.js 以 defer 載入，執行時 DOMContentLoaded 尚未觸發；這裡註冊的 handler 會排在頁面 inline script 註冊的之後
    let kicked = false;
    const kick = () => {
      if (kicked) return;
      kicked = true;
      requestAnimationFrame(() => { highlight(); watchCounts(); watchRings(); reveal(); autorun(); });
    };
    document.addEventListener('DOMContentLoaded', kick);
    window.addEventListener('load', kick);
  };

  window.App = {
    DATA: { datasets, jobs, activity, pipeline: pipelineStats, weekly, onTimeWeekly },
    DISTRICTS, AGENCIES, THEMES, FORMATS, FREQS, LICENSES, PEOPLE, STATUS, FLOW, PIPE_STAGES, TYPES, QUALITY_DIMS, RULES, BBOX, ME,
    dataset, agency, person, theme, job, health, isLate, lateBy, grade, stats, pendingApps,
    schema, sample, profile, profileValues, rules, versions, diff, csv, inferType,
    param, datasetUrl, rng, hash,
    now, time, fmt,
    esc, icon, typeBadge, statusBadge, healthBadge, formatBadges, gradeBadge, scoreCell, stateIcon,
    avatar, personChip, agencyLabel, spark, hist, topk, nullBar, ring, flowHTML, emptyState,
    toast, modal, confirm, tabs, highlight, stream, streamLines, countUp, reveal, watchAnim, watchRings,
    on, off, emit, transition, retryJob, setPaused, log, unlog, addDataset,
    cell, pipeline,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
