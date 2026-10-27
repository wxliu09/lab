/*
 * 澄港市 建築執照圖說線上審查（Redline）— 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * 因為 inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 時間（「現在」固定為 2026-10-21（三）09:40，UTC+8；與使用者時區無關）
 *   App.TODAY                      '2026-10-21'
 *   App.now() → ms                 自 09:40 起隨真實時間走動
 *   App.days(dateStr) → 整數        距今天數（未來為正、過去為負）
 *   App.addDays(dateStr, n) → 'YYYY-MM-DD'
 *   App.fmt.date / md / wd / long / roc / num / area / clock
 *
 * 資料（全站共用；只在記憶體中變動，改完呼叫 App.commit()）
 *   App.DISC        五科：[{key:'arc'|'fir'|'str'|'acc'|'udr', name, short, en, unit}]；App.DISC_MAP[key]
 *   App.STAGES      五階段：[{key:'intake'|'admin'|'tech'|'fix'|'issued', name, short}]
 *   App.LAMPS       燈號：{pass, review, fix, wait, na} → {label}
 *   App.PEOPLE      人員：id → {id, name, disc('arc'…'udr' 或 'adm'), title}；App.ME = 'arc1'（許若晴，建築科）
 *   App.ARCHITECTS  建築師事務所：id → {name, architect, license}
 *   App.permits     40 件案件（欄位見下）；App.getPermit(id)
 *   App.FEATURED    焦點案件 115-0412：sheets[]、rounds[]、annotations[]（no, round, disc, status:'open'|'resolved', carried, box, bubble, note, short, text, cite, by, at, reply, resolvedAt）
 *   App.TREND       近 12 個月平均審查天數 {months[], admin[], tech[], fix[], target}
 *   App.counts()    → {intake, admin, tech, fix, issued, active, myQueue, dueWeek, overdue}
 *   App.load()      → 各科負載 [{disc, review, wait, fix, cap, people[]}]
 *   App.dueThisWeek() → 本週（10/19–10/25）到期與已逾期的案件，依期限排序
 *   App.opinionsOf(p) → 各科意見 [{disc, status, reviewer, date, items[]}]
 *   App.timelineOf(p) → 審查歷程 [{date, title, text, tone:'ok'|'red'|'current'|'', round}]
 *   App.noticeNo(p, round) → 補正通知書發文字號
 *   App.caseNo(p) '115建審字第0412號' · App.address(p) · App.stageName(key) · App.dueLabel(p)
 *   App.permitUrl(id) 'permit.html?id=…' · App.reviewUrl(id) · App.param(name)
 *
 * 資料同步
 *   App.commit(reason)      任何改變資料（含復原）後呼叫：重算 [data-count] 並發出 'app:change'
 *   App.onChange(fn)        訂閱 'app:change'（fn(detail)）；頁面用它觸發自己的重繪
 *   [data-count="intake|admin|tech|fix|issued|active|myQueue|dueWeek|overdue"] 自動同步
 *
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(s) · App.icon(name, cls) · App.lamp(status, {disc, label}) · App.lampRow(p, {labels})
 *   App.rev(round, {lg}) · App.stageChip(stage) · App.stageTrack(p, {label}) · App.dueChip(p 或 dateStr)
 *   App.disc(key, {lg}) · App.avatar(personId, size) · App.person(personId) · App.emptyState({title, text})
 *
 * 平面圖與紅筆（招牌）
 *   App.plan.svg({id, view:'r1'|'r2'|'diff', layers:['str','fir','acc'], annotations:true|陣列|false, title:true})
 *     → svg 字串；svg.plan 以 data-view / data-layers 控制回合與圖層（CSS 負責淡入淡出）
 *   App.plan.setView(svg, view) · App.plan.setLayers(svg, keys[]) · App.plan.toggleLayer(svg, key, on)
 *   App.plan.annoMarkup(a) → 單筆批註 <g class="anno-mark">（雲線＋編號氣泡＋手寫註）
 *   App.plan.animate(svg, {annotations, speed}) → Promise  依序描繪：軸線→牆→開口→設備→尺寸→文字→紅筆雲線
 *   App.plan.drawAnno(svg, no) → Promise  單筆雲線以紅筆筆尖描出
 *   App.plan.VIEWBOX / App.plan.MM（1 單位 = 30 mm）
 *   App.cloudPath(x, y, w, h, {arc, seed}) → 雲線 path d
 *   App.draw(elements, {duration, stagger, delay}) → Promise  stroke 描繪（填色或虛線元素改淡入）
 *   App.penTrace(path, {duration, delay, svg}) → Promise  紅筆筆尖沿 path 描出（傳 svg 會顯示筆尖）
 *   App.panZoom(svg, {host, min, max, wheel:'always'|'ctrl', onChange(scale), onTap(pt, e), onMove(pt)})
 *     → {zoomIn(), zoomOut(), fit(), zoomTo(scale), focus([x,y,w,h], {pad, max}), scale(), toSvg(clientX, clientY)}
 *
 * 互動元件
 *   App.toast(title, {desc, tone:'ok'|'red'|'info', action:{label, onClick}, duration})
 *     toast 容器會自動移進目前開啟的 modal dialog（top layer），關閉後移回 body
 *   App.modal({title, code, body(html|Node), size:'sm'|'lg', actions:[{label, variant:'primary'|'red'|'ghost', icon, onClick(close)}], onClose})
 *     → {el, body, close}
 *   App.openDialog(dialogEl) / App.closeDialog(dialogEl)  頁面自寫 <dialog class="modal"> 用
 *   App.tabs(tablistEl, {onChange(index, tab)}) → {select(i)}
 *   App.seg(segEl, {onChange(value, btn)}) → {value(), set(value)}   按鈕需 data-value
 *   App.search.open()       全站案件搜尋（頁首 [data-search] 與快捷鍵 / 自動綁定）
 *   App.reveal(root) / App.countUp(el)   動態插入內容後重新掃描 [data-reveal] / [data-count-to]
 *     進場時元素會收到不冒泡的 'reveal' 事件（可用來啟動該區塊的描繪動畫）
 *   App.reduceMotion    matchMedia(prefers-reduced-motion)；所有動畫函式已自行判斷
 *
 * 自動行為（不需呼叫）
 *   導覽 active 標示與 aria-current、行動版選單（[data-nav-toggle]）、[data-search]、
 *   [data-reveal] 進場（初次在視窗內者直接顯示，2.5 秒保底全部顯示）、[data-count-to] 數字滾動、
 *   [data-clock] 圖紙時間戳、[data-anim] 離開視窗暫停 CSS 動畫、分頁隱藏時暫停、Esc 關閉 modal
 *
 * 案件欄位
 *   id '115-0412', name, applicant, architect(id), district, addr, use, cls(使用類組), up, down, area(m²), struct,
 *   stage, round(1–3), lamps{arc,fir,str,acc,udr}, received, updated, due, officer(建築科承辦 id),
 *   reviewers{fir,str,acc,udr}, issuedAt, permitNo, height(m), site(m²), reminded(催辦日期或 null)
 */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /* ------------------------------------------------------------------
   * 時間：日期一律以 UTC 日序計算，避免使用者時區造成差一天
   * ------------------------------------------------------------------ */
  const DAY = 864e5;
  const TODAY = '2026-10-21';
  const NOW_START = Date.UTC(2026, 9, 21, 1, 40);   // 09:40 UTC+8
  const pageStart = Date.now();
  const now = () => NOW_START + (Date.now() - pageStart);
  const dayNum = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const TODAY_N = dayNum(TODAY);
  const days = (s) => dayNum(s) - TODAY_N;
  const addDays = (s, n) => isoOf(dayNum(s) + n);
  const WD = '日一二三四五六';
  const pad = (n) => String(n).padStart(2, '0');

  const fmt = {
    date: (s) => s ? s.replace(/-/g, '.') : '—',
    md: (s) => { const [, m, d] = s.split('-'); return `${+m}/${+d}`; },
    wd: (s) => WD[new Date(dayNum(s) * DAY).getUTCDay()],
    long: (s) => { const [y, m, d] = s.split('-'); return `${y} 年 ${+m} 月 ${+d} 日（${fmt.wd(s)}）`; },
    roc: (s) => { const [y, m, d] = s.split('-'); return `${y - 1911} 年 ${+m} 月 ${+d} 日`; },
    num: (n, digits = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    area: (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    clock: (ms) => { const d = new Date(ms + 8 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; },
  };

  /* ------------------------------------------------------------------
   * 基本定義
   * ------------------------------------------------------------------ */
  const DISC = [
    { key: 'arc', name: '建築', short: '建', en: 'ARC', unit: '建築管理處 建築科' },
    { key: 'fir', name: '消防', short: '消', en: 'FIR', unit: '消防局 火災預防科' },
    { key: 'str', name: '結構', short: '結', en: 'STR', unit: '結構外審（技師公會）' },
    { key: 'acc', name: '無障礙', short: '無', en: 'ACC', unit: '建築管理處 無障礙小組' },
    { key: 'udr', name: '都設', short: '都', en: 'UDR', unit: '都市設計科' },
  ];
  const DISC_MAP = Object.fromEntries(DISC.map((d) => [d.key, d]));
  const STAGES = [
    { key: 'intake', name: '掛號收件', short: '收件' },
    { key: 'admin', name: '行政審查', short: '行政' },
    { key: 'tech', name: '技術審查', short: '技術' },
    { key: 'fix', name: '補正中', short: '補正' },
    { key: 'issued', name: '核發', short: '核發' },
  ];
  const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
  const LAMPS = {
    pass: { label: '通過' },
    review: { label: '審查中' },
    fix: { label: '須補正' },
    wait: { label: '待審' },
    na: { label: '免審' },
  };
  const LAMP_CODE = { P: 'pass', R: 'review', F: 'fix', W: 'wait', N: 'na' };

  const PEOPLE = {
    arc1: { name: '許若晴', disc: 'arc', title: '建築科 審查員' },
    arc2: { name: '陳柏翰', disc: 'arc', title: '建築科 審查員' },
    arc3: { name: '林佳蓉', disc: 'arc', title: '建築科 股長' },
    fir1: { name: '鄭志豪', disc: 'fir', title: '消防局 審查員' },
    fir2: { name: '黃筱雯', disc: 'fir', title: '消防局 審查員' },
    str1: { name: '吳承恩', disc: 'str', title: '結構外審 技師' },
    str2: { name: '蔡宜蓁', disc: 'str', title: '結構外審 技師' },
    acc1: { name: '周育萱', disc: 'acc', title: '無障礙小組 審查員' },
    acc2: { name: '何佩珊', disc: 'acc', title: '無障礙小組 審查員' },
    udr1: { name: '簡文彬', disc: 'udr', title: '都市設計科 規劃師' },
    adm1: { name: '王淑芬', disc: 'adm', title: '收件櫃台' },
    adm2: { name: '李冠廷', disc: 'adm', title: '行政審查' },
  };
  Object.entries(PEOPLE).forEach(([id, p]) => { p.id = id; });
  const ME = 'arc1';
  // 各科每人同時在審上限（件），用於負載圖
  const CAP_PER_PERSON = 5;

  const ARCHITECTS = {
    a1: { name: '陳建宏建築師事務所', architect: '陳建宏', license: '建字第 0381 號' },
    a2: { name: '蘇映雪建築師事務所', architect: '蘇映雪', license: '建字第 0517 號' },
    a3: { name: '澄岸聯合建築師事務所', architect: '高雅琪', license: '建字第 0629 號' },
    a4: { name: '何立群建築師事務所', architect: '何立群', license: '建字第 0244 號' },
    a5: { name: '林與方建築師事務所', architect: '林以方', license: '建字第 0702 號' },
    a6: { name: '周以寧建築師事務所', architect: '周以寧', license: '建字第 0458 號' },
  };

  /* ------------------------------------------------------------------
   * 40 件案件
   * [id, 案名, 起造人, 建築師, 行政區, 地址, 用途, 類組, 地上, 地下, 樓地板m², 構造, 階段, 回合, 燈號(建消結無都), 收件, 異動, 期限, 承辦, 其他]
   * ------------------------------------------------------------------ */
  const ROWS = [
    ['115-0451', '北岸大道辦公大樓新建工程', '北岸興業建設股份有限公司', 'a3', '北岸區', '北岸大道二段 66 號', '辦公', 'G-2', 15, 4, 24860.12, 'SRC', 'intake', 1, 'WWWWW', '2026-10-20', '2026-10-20', '2026-10-27', 'arc2'],
    ['115-0452', '溪洲南路農產集貨場增建工程', '溪洲農產運銷合作社', 'a6', '溪洲區', '溪洲南路 210 號', '倉庫', 'C-2', 2, 0, 1842.5, 'SC', 'intake', 1, 'WWWWN', '2026-10-20', '2026-10-20', '2026-10-27', 'arc3'],
    ['115-0453', '雲嶺路獨棟住宅新建工程', '林秀玲', 'a4', '雲嶺區', '雲嶺路 88 巷 12 號', '獨棟住宅', 'H-2', 3, 0, 286.44, 'RC', 'intake', 1, 'WNWNN', '2026-10-21', '2026-10-21', '2026-10-28', 'arc2'],
    ['115-0454', '灣岸三路旅館新建工程', '新灣灣岸開發股份有限公司', 'a1', '新灣區', '灣岸三路 15 號', '旅館', 'B-4', 14, 3, 19320.88, 'RC', 'intake', 1, 'WWWWW', '2026-10-21', '2026-10-21', '2026-10-28', 'arc1'],
    ['115-0444', '鹽埕路冷鏈物流中心新建工程', '鹽田冷鏈物流股份有限公司', 'a5', '鹽田區', '鹽埕路 301 號', '倉儲', 'C-1', 4, 1, 12480.3, 'SC', 'admin', 1, 'WWWWN', '2026-10-13', '2026-10-16', '2026-10-20', 'arc3'],
    ['115-0446', '城隍街店鋪住宅新建工程', '陳美惠', 'a4', '舊城區', '城隍街 42 號', '店鋪住宅', 'H-2', 5, 1, 1128.66, 'RC', 'admin', 1, 'WWWWN', '2026-10-14', '2026-10-19', '2026-10-21', 'arc2'],
    ['115-0447', '山腳路長照服務中心新建工程', '財團法人澄港長青社會福利基金會', 'a6', '山腳區', '山腳路 520 號', '長照機構', 'H-1', 4, 1, 3640.25, 'RC', 'admin', 1, 'WWWWN', '2026-10-15', '2026-10-19', '2026-10-22', 'arc1'],
    ['115-0448', '北岸社會住宅第二期新建工程', '澄港市政府住宅發展處', 'a3', '北岸區', '北岸大道一段 210 號', '社會住宅', 'H-2', 13, 2, 21056.4, 'RC', 'admin', 1, 'WWWWW', '2026-10-16', '2026-10-19', '2026-10-26', 'arc1'],
    ['115-0449', '溪洲國小活動中心改建工程', '澄港市立溪洲國民小學', 'a5', '溪洲區', '學府路 5 號', '學校', 'D-3', 3, 1, 2980.12, 'RC', 'admin', 1, 'WWWWN', '2026-10-19', '2026-10-20', '2026-10-26', 'arc3'],

    ['115-0412', '海濱路集合住宅新建工程', '港埕置業股份有限公司', 'a1', '港埕區', '海濱路一段 128 號', '集合住宅', 'H-2', 12, 3, 18642.36, 'RC', 'tech', 2, 'RRRRP', '2026-07-02', '2026-10-21', '2026-10-28', 'arc1', { site: 2315.8, height: 41.6, units: 88 }],
    ['115-0398', '灣岸三路商場新建工程', '新灣灣岸開發股份有限公司', 'a3', '新灣區', '灣岸三路 26 號', '商場', 'B-2', 6, 3, 31204.7, 'SRC', 'tech', 2, 'PRRPR', '2026-06-16', '2026-10-20', '2026-10-23', 'arc2'],
    ['115-0421', '北岸大道集合住宅（甲區）新建工程', '北岸興業建設股份有限公司', 'a3', '北岸區', '北岸大道三段 18 號', '集合住宅', 'H-2', 15, 4, 26880.15, 'RC', 'tech', 1, 'RRWRR', '2026-08-04', '2026-10-16', '2026-10-24', 'arc1'],
    ['115-0426', '仁心醫院第二醫療大樓新建工程', '財團法人澄港仁心醫院', 'a2', '舊城區', '仁愛路 100 號', '醫院', 'F-1', 10, 3, 28415.6, 'SRC', 'tech', 1, 'RFRRP', '2026-08-11', '2026-10-21', '2026-10-22', 'arc3'],
    ['115-0430', '工業二路綠能設備廠房新建工程', '澄港綠能科技股份有限公司', 'a5', '鹽田區', '工業二路 12 號', '廠房', 'C-1', 3, 0, 8760, 'SC', 'tech', 1, 'PRRRN', '2026-08-20', '2026-10-14', '2026-10-27', 'arc2'],
    ['115-0433', '山腳溫泉旅館增建工程', '山腳溫泉旅館股份有限公司', 'a6', '山腳區', '溫泉路 3 號', '旅館', 'B-4', 7, 1, 6215.38, 'RC', 'tech', 2, 'RPPRN', '2026-07-22', '2026-10-15', '2026-10-21', 'arc1'],
    ['115-0436', '中正路老街都市更新 A 棟新建工程', '舊城老街都市更新會', 'a2', '舊城區', '中正路 77 號', '集合住宅', 'H-2', 14, 3, 16402.92, 'RC', 'tech', 1, 'RRRWR', '2026-09-01', '2026-10-13', '2026-10-30', 'arc3'],
    ['115-0437', '雲嶺國小新建校舍工程', '澄港市立雲嶺國民小學', 'a5', '雲嶺區', '雲嶺路 260 號', '學校', 'D-3', 4, 1, 9320.44, 'RC', 'tech', 1, 'RRRRN', '2026-09-03', '2026-10-12', '2026-11-02', 'arc2'],
    ['115-0439', '港口路辦公廠房新建工程', '澄港海運倉儲股份有限公司', 'a4', '港埕區', '港口路 45 號', '辦公廠房', 'G-2', 8, 2, 11230.06, 'SRC', 'tech', 1, 'WRRWN', '2026-09-08', '2026-10-09', '2026-11-06', 'arc3'],
    ['115-0440', '灣岸一路集合住宅（灣景）新建工程', '灣景建設股份有限公司', 'a1', '新灣區', '灣岸一路 88 號', '集合住宅', 'H-2', 18, 4, 32610.75, 'RC', 'tech', 1, 'RRRRR', '2026-09-10', '2026-10-19', '2026-11-09', 'arc1'],
    ['115-0441', '北興街透天住宅四戶新建工程', '鄭國華 等 4 人', 'a4', '北岸區', '北興街 31 巷 2–8 號', '透天住宅', 'H-2', 4, 0, 980.4, 'RC', 'tech', 1, 'RNPNN', '2026-09-15', '2026-10-08', '2026-10-27', 'arc2'],
    ['115-0442', '工業路物流倉庫新建工程', '溪洲快運股份有限公司', 'a6', '溪洲區', '工業路 66 號', '倉庫', 'C-2', 2, 0, 5410, 'SC', 'tech', 1, 'RRWRN', '2026-09-22', '2026-10-07', '2026-11-20', 'arc3'],
    ['115-0405', '港新路青年社會住宅新建工程', '澄港市政府住宅發展處', 'a3', '港埕區', '港新路 20 號', '社會住宅', 'H-2', 11, 2, 14880.2, 'RC', 'tech', 3, 'PPRPP', '2026-06-23', '2026-10-17', '2026-10-26', 'arc1'],

    ['115-0388', '海濱路觀光飯店新建工程', '港埕觀光開發股份有限公司', 'a2', '港埕區', '海濱路二段 8 號', '旅館', 'B-4', 20, 4, 38450.92, 'SRC', 'fix', 2, 'FPFPP', '2026-05-26', '2026-08-24', '2026-10-23', 'arc3'],
    ['115-0395', '北岸大道集合住宅（乙區）新建工程', '北岸興業建設股份有限公司', 'a3', '北岸區', '北岸大道三段 20 號', '集合住宅', 'H-2', 15, 4, 25960.33, 'RC', 'fix', 1, 'FFPFP', '2026-06-09', '2026-08-20', '2026-11-18', 'arc1'],
    ['115-0401', '廟前街店鋪住宅新建工程', '黃志明', 'a4', '舊城區', '廟前街 6 號', '店鋪住宅', 'H-2', 5, 1, 1036.7, 'RC', 'fix', 1, 'FPPFN', '2026-06-18', '2026-07-21', '2026-10-19', 'arc2'],
    ['115-0408', '工業一路食品加工廠新建工程', '鹽田食品工業股份有限公司', 'a5', '鹽田區', '工業一路 18 號', '廠房', 'C-1', 3, 0, 7860.5, 'SC', 'fix', 1, 'PFPPN', '2026-06-30', '2026-08-04', '2026-11-02', 'arc3'],
    ['115-0414', '雲嶺路護理之家新建工程', '財團法人雲嶺慈安護理之家', 'a6', '雲嶺區', '雲嶺路 150 號', '護理之家', 'H-1', 6, 1, 5688.2, 'RC', 'fix', 2, 'PPPFN', '2026-07-06', '2026-09-29', '2026-10-29', 'arc1'],
    ['115-0417', '灣岸金融中心新建工程', '灣岸金融中心開發股份有限公司', 'a1', '新灣區', '灣岸二路 1 號', '辦公', 'G-2', 22, 5, 46120.8, 'SRC', 'fix', 1, 'FPFPF', '2026-07-14', '2026-08-13', '2026-11-12', 'arc2'],
    ['115-0419', '山腳路集合住宅（山居）新建工程', '山居建設股份有限公司', 'a2', '山腳區', '山腳路 333 號', '集合住宅', 'H-2', 9, 2, 9845.66, 'RC', 'fix', 2, 'FPPPN', '2026-07-20', '2026-10-01', '2026-10-30', 'arc3'],
    ['115-0423', '溪洲區農會倉儲辦公大樓新建工程', '溪洲區農會', 'a5', '溪洲區', '溪洲路 1 號', '辦公倉儲', 'G-2', 4, 1, 3320.18, 'RC', 'fix', 1, 'PPFPN', '2026-08-06', '2026-08-27', '2026-11-25', 'arc2'],
    ['115-0428', '港埕國中體育館新建工程', '澄港市立港埕國民中學', 'a6', '港埕區', '學府路 2 號', '學校', 'D-3', 3, 1, 6240.3, 'SC', 'fix', 1, 'PFPFN', '2026-08-13', '2026-09-02', '2026-11-30', 'arc1'],
    ['115-0385', '安康路社區活動中心新建工程', '澄港市政府社會局', 'a4', '北岸區', '安康路 9 號', '社區活動中心', 'D-2', 3, 1, 2160, 'RC', 'fix', 3, 'PPPFP', '2026-05-18', '2026-09-22', '2026-10-22', 'arc3'],

    ['115-0352', '港新路集合住宅（港景）新建工程', '港景建設股份有限公司', 'a1', '港埕區', '港新路 66 號', '集合住宅', 'H-2', 14, 3, 19480.55, 'RC', 'issued', 2, 'PPPPP', '2026-04-21', '2026-10-16', null, 'arc1', { issuedAt: '2026-10-16', permitNo: '115建字第0221號' }],
    ['115-0360', '鹽埕路鋼構倉庫新建工程', '鹽田冷鏈物流股份有限公司', 'a5', '鹽田區', '鹽埕路 305 號', '倉庫', 'C-2', 1, 0, 3860, 'SC', 'issued', 1, 'PPPPN', '2026-05-04', '2026-10-08', null, 'arc3', { issuedAt: '2026-10-08', permitNo: '115建字第0218號' }],
    ['115-0364', '大埕街文創旅店新建工程', '舊城文旅股份有限公司', 'a2', '舊城區', '大埕街 12 號', '旅館', 'B-4', 7, 1, 3512.4, 'RC', 'issued', 2, 'PPPPP', '2026-05-08', '2026-10-02', null, 'arc2', { issuedAt: '2026-10-02', permitNo: '115建字第0214號' }],
    ['115-0368', '茶園路農舍新建工程', '吳家豪', 'a4', '雲嶺區', '茶園路 5 號', '農舍', 'H-2', 2, 0, 248.66, 'RC', 'issued', 1, 'PNPNN', '2026-05-15', '2026-09-25', null, 'arc2', { issuedAt: '2026-09-25', permitNo: '115建字第0209號' }],
    ['115-0371', '河堤路集合住宅（溪畔）新建工程', '溪畔建設股份有限公司', 'a6', '溪洲區', '河堤路 40 號', '集合住宅', 'H-2', 10, 2, 11640.2, 'RC', 'issued', 3, 'PPPPN', '2026-03-30', '2026-09-18', null, 'arc3', { issuedAt: '2026-09-18', permitNo: '115建字第0203號' }],
    ['115-0376', '灣岸四路商辦大樓新建工程', '新灣置地股份有限公司', 'a3', '新灣區', '灣岸四路 50 號', '辦公', 'G-2', 16, 4, 27330.18, 'SRC', 'issued', 2, 'PPPPP', '2026-04-07', '2026-09-04', null, 'arc1', { issuedAt: '2026-09-04', permitNo: '115建字第0197號' }],
    ['115-0379', '北岸路幼兒園新建工程', '澄港市立北岸幼兒園', 'a5', '北岸區', '北岸路 11 號', '幼兒園', 'F-3', 2, 0, 1420.3, 'RC', 'issued', 1, 'PPPPN', '2026-06-02', '2026-08-27', null, 'arc2', { issuedAt: '2026-08-27', permitNo: '115建字第0190號' }],
    ['115-0381', '竹林路透天住宅新建工程', '劉怡君', 'a4', '山腳區', '竹林路 8 號', '透天住宅', 'H-2', 3, 0, 312.5, 'RC', 'issued', 1, 'PNPNN', '2026-06-05', '2026-08-12', null, 'arc3', { issuedAt: '2026-08-12', permitNo: '115建字第0184號' }],
  ];

  const permits = ROWS.map((r, i) => {
    const [id, name, applicant, architect, district, addr, use, cls, up, down, area, struct, stage, round, lampStr, received, updated, due, officer, extra = {}] = r;
    const lamps = {};
    DISC.forEach((d, k) => { lamps[d.key] = LAMP_CODE[lampStr[k]]; });
    // 外科審查員依案件序號輪替，免審的科別不指派
    const reviewers = {
      fir: lamps.fir === 'na' ? null : (i % 2 ? 'fir2' : 'fir1'),
      str: lamps.str === 'na' ? null : (i % 3 === 0 ? 'str2' : 'str1'),
      acc: lamps.acc === 'na' ? null : (i % 2 ? 'acc1' : 'acc2'),
      udr: lamps.udr === 'na' ? null : 'udr1',
    };
    return {
      id, name, applicant, architect, district, addr, use, cls, up, down, area, struct, stage, round, lamps,
      received, updated, due, officer, reviewers,
      issuedAt: extra.issuedAt || null,
      permitNo: extra.permitNo || null,
      height: extra.height || Math.round((up * 3.3 + 1.2) * 10) / 10,
      site: extra.site || Math.round(area / Math.max(1, up) / 0.52 * 100) / 100,
      units: extra.units || null,
      reminded: null,
    };
  });
  // 直接查陣列：頁面新增的案件（如案件清單的掛號收件）推進 permits 後也查得到
  const getPermit = (id) => permits.find((p) => p.id === id) || null;

  /* ------------------------------------------------------------------
   * 焦點案件 115-0412：圖說、批註與回合（index / review / permit 共用）
   * box = [x, y, w, h]（平面圖座標，1 單位 = 30 mm）；bubble = 編號圈位置；note = 手寫短註位置與文字
   * ------------------------------------------------------------------ */
  const FEATURED = {
    id: '115-0412',
    sheets: [
      { no: 'A-001', name: '配置圖', rounds: [1, 2] },
      { no: 'A-101', name: '一層平面圖', rounds: [1, 2] },
      { no: 'A-201', name: '標準層平面圖（4F–12F）', rounds: [1, 2], current: true },
      { no: 'A-301', name: '立面圖（東、西向）', rounds: [1, 2] },
      { no: 'A-401', name: '剖面圖', rounds: [1] },
      { no: 'S-201', name: '標準層結構平面圖', rounds: [1, 2] },
    ],
    rounds: [
      { round: 1, submitted: '2026-07-02', adminDone: '2026-07-08', start: '2026-07-09', notice: '2026-08-06', noticeNo: '澄建審字第1150806112號', fixDue: '2026-11-04', resubmitted: '2026-09-30' },
      { round: 2, submitted: '2026-09-30', start: '2026-10-01', due: '2026-10-28' },
    ],
    annotations: [
      { no: 1, round: 1, disc: 'fir', status: 'resolved', box: [176, 436, 86, 86], bubble: [292, 428], note: null,
        short: '一號梯防火門開啟方向', text: '一號直通樓梯防火門開向走廊，應改為朝避難方向（梯間內）開啟，且開啟後不得妨礙走廊通行。', cite: '技規設施編 §76', by: 'fir1', at: '2026-07-24',
        reply: '已將門扇改為向梯間內開啟，並加註常時關閉式防火門。', resolvedAt: '2026-10-06' },
      { no: 2, round: 1, disc: 'arc', status: 'resolved', box: [1008, 486, 116, 210], bubble: [1146, 470], note: [990, 738, '淨寬 108 < 120'],
        short: '二號梯淨寬不足', text: '二號直通樓梯梯段淨寬 108 公分，未達 120 公分規定，請檢討梯間尺寸。', cite: '技規設施編 §33', by: 'arc1', at: '2026-07-30',
        reply: '梯間西移 1,020 mm 併入機電室，梯段淨寬改為 153 公分。', resolvedAt: '2026-10-08' },
      { no: 3, round: 1, disc: 'acc', status: 'resolved', box: [284, 590, 106, 102], bubble: [268, 738], note: [150, 780, '車廂深 126 < 135'],
        short: '昇降機車廂深度', text: '昇降機車廂深度 126 公分，未達無障礙昇降機 135 公分之規定。', cite: '無障礙規範 407.2', by: 'acc2', at: '2026-07-29',
        reply: '改採 15 人份車廂，深度 156 公分，坑道同步加深。', resolvedAt: '2026-10-07' },
      { no: 4, round: 1, disc: 'str', status: 'open', carried: true, box: [364, 480, 52, 212], bubble: [458, 742], note: [480, 780, 'SW1 配筋？'],
        short: 'SW1 剪力牆配筋', text: '核心區 C–D / 2 軸剪力牆 SW1 未附配筋詳圖及邊界構材設計，R2 仍未補附。', cite: 'RC 規範 第 11 章', by: 'str2', at: '2026-08-01',
        reply: '配筋詳圖將併 S-201 修正版提送。', resolvedAt: null },
      { no: 5, round: 1, disc: 'fir', status: 'open', carried: true, box: [116, 384, 68, 92], bubble: [226, 404], note: null,
        short: '走廊排煙口面積', text: '走廊西端排煙口有效開口面積計算書未附，請補附並標示開口尺寸。', cite: '技規設施編 §101', by: 'fir1', at: '2026-07-24',
        reply: '已補附計算書（附件 F-3），開口 0.9 m × 1.8 m。', resolvedAt: null },
      { no: 6, round: 1, disc: 'arc', status: 'resolved', box: [148, 296, 98, 92], bubble: [172, 264], note: null,
        short: 'A 戶浴廁通風', text: 'A、B 戶浴廁無對外開窗，應設機械通風設備並標示換氣量，或改設對外窗。', cite: '技規設施編 §43', by: 'arc1', at: '2026-07-30',
        reply: '浴廁外牆增設 0.6 m × 1.6 m 通風窗。', resolvedAt: '2026-10-08' },
      { no: 7, round: 2, disc: 'acc', status: 'open', box: [548, 386, 132, 80], bubble: [712, 426], note: null,
        short: 'C 戶入口迴轉空間', text: 'C 戶入口前走廊受 C/3 柱突出影響，迴轉空間未達直徑 150 公分。', cite: '無障礙規範 206.2.5', by: 'acc2', at: '2026-10-14',
        reply: null, resolvedAt: null },
      { no: 8, round: 2, disc: 'arc', status: 'open', box: [652, 122, 434, 54], bubble: [1146, 128], note: [1168, 135, '欄杆高？'],
        short: 'B 戶陽台欄杆高度', text: 'B 戶陽台欄杆扶手高度未標示；十層以上欄杆高度不得小於 120 公分，請於平面及剖面詳圖標註。', cite: '技規設施編 §38', by: 'arc1', at: '2026-10-20',
        reply: null, resolvedAt: null },
    ],
  };

  /* 近 12 個月平均審查天數（收件至核發）；2026-04 線上審查上線 */
  const TREND = {
    months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
    admin: [9, 9, 10, 8, 8, 7, 6, 6, 5, 5, 5, 5],
    tech: [34, 36, 38, 33, 31, 29, 27, 25, 24, 23, 22, 23],
    fix: [41, 44, 47, 40, 39, 37, 35, 33, 34, 31, 30, 32],
    cases: [21, 18, 16, 19, 23, 22, 25, 24, 27, 26, 25, 14],
    target: 30,
    launch: '2026-04',
  };

  /* ------------------------------------------------------------------
   * 衍生資料
   * ------------------------------------------------------------------ */
  const ACTIVE_STAGES = ['intake', 'admin', 'tech', 'fix'];
  const WEEK_END = '2026-10-25';

  function counts() {
    const c = { intake: 0, admin: 0, tech: 0, fix: 0, issued: 0, active: 0, myQueue: 0, dueWeek: 0, overdue: 0 };
    permits.forEach((p) => {
      c[p.stage] += 1;
      if (p.stage !== 'issued') c.active += 1;
      if (p.stage === 'tech' && p.officer === ME && p.lamps.arc === 'review') c.myQueue += 1;
      if (p.due && p.stage !== 'issued') {
        if (days(p.due) < 0) c.overdue += 1;
        if (dayNum(p.due) <= dayNum(WEEK_END)) c.dueWeek += 1;
      }
    });
    return c;
  }

  function load() {
    return DISC.map((d) => {
      const people = Object.values(PEOPLE).filter((p) => p.disc === d.key);
      const r = { disc: d, review: 0, wait: 0, fix: 0, cap: people.length * CAP_PER_PERSON, people };
      permits.forEach((p) => {
        if (p.stage === 'tech') {
          if (p.lamps[d.key] === 'review') r.review += 1;
          if (p.lamps[d.key] === 'wait') r.wait += 1;
        }
        if (p.stage === 'fix' && p.lamps[d.key] === 'fix') r.fix += 1;
      });
      return r;
    });
  }

  function dueThisWeek() {
    return permits
      .filter((p) => p.due && p.stage !== 'issued' && dayNum(p.due) <= dayNum(WEEK_END))
      .sort((a, b) => dayNum(a.due) - dayNum(b.due) || a.id.localeCompare(b.id));
  }

  const caseNo = (p) => `${p.id.slice(0, 3)}建審字第${p.id.slice(4)}號`;
  const address = (p) => `澄港市${p.district}${p.addr}`;
  const stageName = (k) => STAGE_MAP[k]?.name || k;
  const dueLabel = (p) => ({ intake: '收件審核期限', admin: '行政審查期限', tech: '技術審查期限', fix: '補正期限（申請人）' }[p.stage] || '');
  const permitUrl = (id) => `permit.html?id=${encodeURIComponent(id)}`;
  const reviewUrl = (id) => `review.html?id=${encodeURIComponent(id)}`;
  const param = (name) => new URLSearchParams(location.search).get(name);

  // 簡單雜湊：讓意見與文號依案號穩定產生（每次開頁相同）
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const noticeNo = (p, round) => `澄建審字第115${String(1000000 + (hash(p.id + round) % 8999999)).slice(0, 7)}號`;

  const OPINION_LIB = {
    arc: {
      fix: ['直通樓梯梯段淨寬未達 120 公分，請依技規設施編 §33 檢討修正。', '陽台欄杆扶手高度未標示，十層以上不得小於 120 公分（技規設施編 §38）。', '法定空地面積計算表與配置圖數值不符，請釐清並修正。', '停車空間尺寸及車道坡度未標示，請依技規設施編 §60 補正。', '居室採光面積檢討表漏列北向臥室，請補正。'],
      pass: ['建築計畫、面積計算及避難設施檢討符合規定。'],
    },
    fir: {
      fix: ['安全梯防火門開啟方向應朝避難方向（技規設施編 §76）。', '排煙口有效開口面積計算書未附（技規設施編 §101）。', '室內消防栓配置未能涵蓋全部樓地板，請調整箱體位置。', '地下層停車空間撒水頭配置間距超過規定，請修正。'],
      pass: ['消防安全設備圖說經審查符合規定，請於竣工時申請消防查驗。'],
    },
    str: {
      fix: ['剪力牆配筋詳圖及邊界構材設計未附。', '基礎開挖擋土支撐計算書與地質鑽探報告數據不一致，請釐清。', '用途係數 I 值採用有誤，請依建築物用途分類修正。', '鋼構接頭設計未檢討強柱弱梁，請補附計算。'],
      pass: ['結構計算書及結構圖說經外審簽證，符合規定。'],
    },
    acc: {
      fix: ['昇降機車廂深度未達 135 公分（無障礙規範 407）。', '無障礙通路迴轉空間未達直徑 150 公分（無障礙規範 206）。', '無障礙廁所盥洗室門淨寬不足 90 公分，請修正。', '室外通路坡道坡度大於 1/12，請增設平台或延長坡道。'],
      pass: ['無障礙設施檢討表及圖說符合規定。'],
    },
    udr: {
      fix: ['基地退縮帶人行步道舖面與鄰地未順平，請修正剖面。', '屋頂設備物遮蔽設施未依都市設計準則設置。', '開放空間植栽覆土深度未達 1.5 公尺，請檢討。'],
      pass: ['經都市設計審議幹事會決議通過，依核定圖說辦理。'],
    },
  };

  function opinionsOf(p) {
    const h = hash(p.id);
    if (p.id === FEATURED.id) {
      return DISC.map((d) => {
        const list = FEATURED.annotations.filter((a) => a.disc === d.key);
        return {
          disc: d,
          status: p.lamps[d.key],
          reviewer: d.key === 'arc' ? p.officer : p.reviewers[d.key],
          date: list.length ? list[list.length - 1].at : '2026-10-09',
          items: list.length ? list.map((a) => ({ no: a.no, text: a.text, cite: a.cite, round: a.round, status: a.status })) : OPINION_LIB[d.key].pass.map((t) => ({ text: t, status: 'resolved' })),
        };
      });
    }
    return DISC.map((d, k) => {
      const s = p.lamps[d.key];
      const lib = OPINION_LIB[d.key];
      let items = [];
      if (s === 'fix') {
        const n = 1 + ((h >> (k * 3)) % 2);
        for (let j = 0; j < n; j++) items.push({ text: lib.fix[(h + j * 7 + k) % lib.fix.length], status: 'open', round: p.round });
      } else if (s === 'pass') {
        items = lib.pass.map((t) => ({ text: t, status: 'resolved', round: p.round }));
      } else if (s === 'review') {
        items = [{ text: `第 ${p.round} 回合圖說審查中。`, status: 'review', round: p.round }];
      } else if (s === 'wait') {
        items = [{ text: '尚未開始審查。', status: 'wait', round: p.round }];
      } else {
        items = [{ text: '本案規模免經本科審查。', status: 'na' }];
      }
      return {
        disc: d,
        status: s,
        reviewer: d.key === 'arc' ? p.officer : p.reviewers[d.key],
        date: p.updated,
        items,
      };
    });
  }

  function timelineOf(p) {
    if (p.id === FEATURED.id) {
      const [r1, r2] = FEATURED.rounds;
      return [
        { date: r1.submitted, title: '掛號收件', text: '線上掛號，收件櫃台王淑芬完成書件點收。', tone: 'ok', round: 1 },
        { date: r1.adminDone, title: '行政審查完成', text: '起造人、設計人資格及土地權利證明文件齊備。', tone: 'ok', round: 1 },
        { date: r1.start, title: 'R1 技術審查開始', text: '分送建築、消防、結構、無障礙、都設五科同步審查。', tone: '', round: 1 },
        { date: r1.notice, title: 'R1 補正通知', text: `發文 ${r1.noticeNo}，共 6 項補正意見，補正期限 ${fmt.date(r1.fixDue)}。`, tone: 'red', round: 1 },
        { date: r1.resubmitted, title: 'R2 補正收件', text: '起造人提送修正圖說 14 張及回覆說明書。', tone: 'ok', round: 2 },
        { date: r2.start, title: 'R2 技術審查開始', text: '都設科於 10/9 先行通過；其餘四科審查中。', tone: '', round: 2 },
        { date: '2026-10-21', title: 'R2 審查中', text: `已改善 4 項、延續 2 項、新增 2 項；技術審查期限 ${fmt.date(r2.due)}。`, tone: 'current', round: 2 },
      ];
    }
    const ev = [{ date: p.received, title: '掛號收件', text: `收件櫃台 ${PEOPLE.adm1.name} 完成書件點收。`, tone: p.stage === 'intake' ? 'current' : 'ok', round: 1 }];
    if (p.stage === 'intake') return ev;
    const adminDone = addDays(p.received, 4);
    if (p.stage === 'admin') {
      ev.push({ date: p.updated, title: '行政審查中', text: `${PEOPLE.adm2.name} 檢核書件；期限 ${fmt.date(p.due)}。`, tone: 'current', round: 1 });
      return ev;
    }
    ev.push({ date: adminDone, title: '行政審查完成', text: '書件齊備，分送技術審查。', tone: 'ok', round: 1 });
    // 把每個回合平均攤在「行政完成」到「最後異動」之間，保證日期遞增
    const end = p.issuedAt || p.updated;
    const span = Math.max(p.round * 3, dayNum(end) - dayNum(adminDone));
    const step = span / p.round;
    for (let r = 1; r <= p.round; r++) {
      const start = addDays(adminDone, Math.round((r - 1) * step) + 1);
      ev.push({ date: start, title: r === 1 ? 'R1 技術審查開始' : `R${r} 補正收件・審查開始`, text: r === 1 ? '分送各科同步審查。' : '起造人提送修正圖說。', tone: '', round: r });
      const isLast = r === p.round;
      if (!isLast || p.stage === 'fix') {
        const notice = isLast ? p.updated : addDays(adminDone, Math.round(r * step - step * 0.45));
        ev.push({ date: notice, title: `R${r} 補正通知`, text: `發文 ${noticeNo(p, r)}。`, tone: 'red', round: r });
      }
    }
    if (p.stage === 'fix') ev.push({ date: p.due, title: '補正期限', text: '逾期未補正者依規定駁回。', tone: 'current', round: p.round });
    if (p.stage === 'tech') ev.push({ date: p.updated, title: `R${p.round} 審查中`, text: `技術審查期限 ${fmt.date(p.due)}。`, tone: 'current', round: p.round });
    if (p.stage === 'issued') ev.push({ date: p.issuedAt, title: '核發建造執照', text: `${p.permitNo}，副本送工務、消防與地政單位。`, tone: 'ok', round: p.round });
    return ev;
  }

  /* ------------------------------------------------------------------
   * 資料同步
   * ------------------------------------------------------------------ */
  // animate=false 用於初始化：只更新目標值，數字滾動交給進場（reveal）觸發
  function refreshCounts(animate = true) {
    const c = counts();
    $$('[data-count]').forEach((el) => {
      const k = el.dataset.count;
      if (!(k in c)) return;
      if (el.hasAttribute('data-count-to')) {
        el.dataset.countTo = c[k];
        if (animate) countUp(el); else el.textContent = fmt.num(c[k]);
      } else {
        el.textContent = c[k];
      }
    });
  }
  function commit(reason) {
    refreshCounts();
    emit('app:change', { reason });
  }
  const onChange = (fn) => document.addEventListener('app:change', (e) => fn(e.detail || {}));

  /* ------------------------------------------------------------------
   * 圖示（16×16、1.5 線寬；屬性寫在 svg 上，避免被通用 CSS 覆蓋）
   * ------------------------------------------------------------------ */
  const ICONS = {
    search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.4 10.4 3.4 3.4"/>',
    'arrow-left': '<path d="M13 8H3M7 4 3 8l4 4"/>',
    'arrow-right': '<path d="M3 8h10M9 4l4 4-4 4"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    minus: '<path d="M3 8h10"/>',
    fit: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
    layers: '<path d="m8 2.5 5.5 3L8 8.5l-5.5-3z"/><path d="m2.5 8.2 5.5 3 5.5-3M2.5 10.9l5.5 3 5.5-3"/>',
    check: '<path d="m3 8.5 3.2 3L13 4.5"/>',
    x: '<path d="m4 4 8 8M12 4l-8 8"/>',
    alert: '<path d="M8 2.2 14.2 13H1.8z"/><path d="M8 6.5v3M8 11.3v.2"/>',
    clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/>',
    calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    bell: '<path d="M4 11V7.2a4 4 0 0 1 8 0V11l1 1.3H3zM6.6 13.8a1.5 1.5 0 0 0 2.8 0"/>',
    file: '<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5.2h3.5M6 8.2h4.5M6 10.6h4.5"/>',
    pen: '<path d="M10.6 2.6 13.4 5.4 5.6 13.2 2.4 13.6l.4-3.2z"/><path d="m9.2 4 2.8 2.8"/>',
    cloud: '<path d="M3.5 11.5a2 2 0 0 1 0-4 2.3 2.3 0 0 1 3.4-2.8 2.4 2.4 0 0 1 4.2.5 2 2 0 0 1 1.4 3.6 1.8 1.8 0 0 1-1.6 2.7z"/>',
    undo: '<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7"/>',
    filter: '<path d="M2.5 3.5h11L9.3 8.6v4.3l-2.6-1.2V8.6z"/>',
    'chevron-down': '<path d="m4 6 4 4 4-4"/>',
    'chevron-right': '<path d="m6 4 4 4-4 4"/>',
    download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11"/>',
    print: '<path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2"/><rect x="4.5" y="9.5" width="7" height="4"/>',
    compare: '<rect x="2" y="3" width="7" height="9"/><rect x="7" y="5" width="7" height="9" stroke-dasharray="2 1.6"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5V5h-2.5"/>',
    menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
    external: '<path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v4h-9v-9h4"/>',
    send: '<path d="M14 2 7 9M14 2l-4.5 12L7 9 2 6.5z"/>',
    stamp: '<path d="M6 2.5h4v3.2l1.5 2.3h-7L6 5.7z"/><path d="M3 10h10v2H3zM3.5 14h9"/>',
    user: '<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 13.8a5.2 5.2 0 0 1 10.4 0"/>',
    list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5"/>',
    grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5"/><rect x="9" y="2.5" width="4.5" height="4.5"/><rect x="2.5" y="9" width="4.5" height="4.5"/><rect x="9" y="9" width="4.5" height="4.5"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
    play: '<path d="M5 3.2v9.6L12.5 8z"/>',
    ruler: '<path d="m2 11 9-9 3 3-9 9z"/><path d="m5 8 1.4 1.4M7 6l1 1M9 4l1.4 1.4"/>',
  };
  const icon = (name, cls = 'i') => `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ------------------------------------------------------------------
   * 標記產生器
   * ------------------------------------------------------------------ */
  const LAMP_SVG = {
    pass: '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="m4.8 8.2 2.1 2.1 4.3-4.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    review: '<circle cx="8" cy="8" r="6.3" fill="#fff" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.7a6.3 6.3 0 0 1 0 12.6z" fill="currentColor"/>',
    fix: '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.3v4.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.4" r="1.05" fill="#fff"/>',
    wait: '<circle cx="8" cy="8" r="6.3" fill="#fff" stroke="currentColor" stroke-width="1.5"/>',
    na: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M5.2 8h5.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  };
  function lamp(s, { disc, label } = {}) {
    const text = LAMPS[s]?.label || s;
    const name = disc ? `${DISC_MAP[disc].name}：${text}` : text;
    const svg = `<svg viewBox="0 0 16 16" aria-hidden="true">${LAMP_SVG[s]}</svg>`;
    if (label) {
      const shown = label === true ? text : label;
      return `<span class="lamp" data-s="${s}" title="${esc(name)}">${svg}<span>${esc(shown)}</span></span>`;
    }
    return `<span class="lamp" data-s="${s}" role="img" aria-label="${esc(name)}" title="${esc(name)}">${svg}</span>`;
  }
  function lampRow(p, { labels = false } = {}) {
    return `<span class="lamps${labels ? ' lamps--labeled' : ''}">${DISC.map((d) => lamp(p.lamps[d.key], { disc: d.key, label: labels ? d.name : false })).join('')}</span>`;
  }
  const rev = (n, { lg = false } = {}) => `<span class="rev${lg ? ' rev--lg' : ''}" data-round="${n}" role="img" aria-label="第 ${n} 回合（R${n}）" title="R${n}"><svg viewBox="0 0 26 22" aria-hidden="true"><path d="M13 1.8 24.4 20.4H1.6z" fill="#FFFEFA" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg><b>${n}</b></span>`;
  const stageChip = (s) => `<span class="stage" data-stage="${s}">${esc(stageName(s))}</span>`;
  function stageTrack(p, { label = false } = {}) {
    const idx = STAGES.findIndex((s) => s.key === p.stage);
    const segs = STAGES.map((s, i) => {
      let cls = 'stage-track__seg';
      if (p.stage === 'issued' || i < idx) cls += ' is-done';
      else if (i === idx) cls += ' is-current' + (p.stage === 'fix' ? ' is-fix' : '');
      return `<span class="${cls}" title="${s.name}"></span>`;
    }).join('');
    return `<span class="stage-track" role="img" aria-label="目前階段：${esc(stageName(p.stage))}">${segs}${label ? `<span class="stage-track__label">${esc(stageName(p.stage))}</span>` : ''}</span>`;
  }
  function dueChip(x) {
    const d = typeof x === 'string' ? x : x?.due;
    if (!d) return '<span class="due">—</span>';
    const n = days(d);
    let state = 'ok', text = `剩 ${n} 日`;
    if (n < 0) { state = 'over'; text = `逾期 ${-n} 日`; }
    else if (n === 0) { state = 'today'; text = '今日到期'; }
    else if (n <= 3) state = 'soon';
    return `<span class="due" data-state="${state}" title="期限 ${fmt.date(d)}">${text}</span>`;
  }
  const disc = (key, { lg = false } = {}) => `<span class="disc${lg ? ' disc--lg' : ''}" data-disc="${key}" title="${DISC_MAP[key].name}" aria-label="${DISC_MAP[key].name}">${DISC_MAP[key].short}</span>`;
  const avatar = (id, size = '') => {
    const p = PEOPLE[id];
    if (!p) return '';
    return `<span class="avatar${size ? ' avatar--' + size : ''}" data-disc="${p.disc}" title="${esc(p.name)}・${esc(p.title)}" aria-hidden="true">${esc(p.name[0])}</span>`;
  };
  const person = (id) => {
    const p = PEOPLE[id];
    if (!p) return '<span class="muted">未指派</span>';
    return `<span class="person">${avatar(id, 'sm')}<span class="person__text"><span class="person__name">${esc(p.name)}</span><span class="person__role">${esc(p.title)}</span></span></span>`;
  };
  const emptyState = ({ title = '沒有符合的資料', text = '' } = {}) => `
    <div class="empty">
      <svg viewBox="0 0 120 84" fill="none" aria-hidden="true">
        <rect x="18" y="8" width="70" height="66" fill="#FBFAF6" stroke="#8A939D" stroke-width="1.2" transform="rotate(-4 53 41)"/>
        <rect x="28" y="12" width="70" height="66" fill="#FFFEFA" stroke="#2D3A4A" stroke-width="1.2"/>
        <path d="M38 30h40M38 40h28M38 50h34" stroke="#8A939D" stroke-width="1.2"/>
        <path d="${cloudPath(56, 22, 52, 40, { arc: 7, seed: 3 })}" stroke="#D7263D" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>
      <div class="empty__title">${esc(title)}</div>
      ${text ? `<div class="empty__text">${esc(text)}</div>` : ''}
    </div>`;

  /* ------------------------------------------------------------------
   * 雲線（revision cloud）：沿矩形周邊等距取點，以向外凸的圓弧相連；
   * 半徑加一點可重現的抖動，讀起來像手繪而非機械重複。
   * ------------------------------------------------------------------ */
  function seeded(seed) {
    let s = seed * 9301 + 49297;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  function cloudPath(x, y, w, h, { arc = 14, seed = 1 } = {}) {
    const rnd = seeded(seed);
    const per = 2 * (w + h);
    const n = Math.max(6, Math.round(per / (arc * 1.6)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      // 順時針：上 → 右 → 下 → 左
      let t = (i / n) * per;
      if (t < w) pts.push([x + t, y]);
      else if ((t -= w) < h) pts.push([x + w, y + t]);
      else if ((t -= h) < w) pts.push([x + w - t, y + h]);
      else { t -= w; pts.push([x, y + h - t]); }
    }
    pts.push(pts[0]);
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const chord = Math.hypot(bx - ax, by - ay);
      const r = (chord / 2) * (1.02 + rnd() * 0.22);
      // 順時針走訪時 sweep=1 讓弧往外凸
      d += ` A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}`;
    }
    return d + 'Z';
  }

  /* ------------------------------------------------------------------
   * 平面圖產生器：A-201 標準層平面圖（四戶＋雙梯核心）
   * 座標單位 1 = 30 mm；軸線 X1–X5 間距 7,200，Y A–D = 6,300 / 2,700 / 6,300
   * 顏色一律 currentColor，由外層群組決定（底圖墨色、圖層色、疊圖色）
   * ------------------------------------------------------------------ */
  const VB = { w: 1260, h: 860 };
  const MM = 30;
  const GX = [150, 390, 630, 870, 1110];
  const GY = [170, 380, 470, 680];
  const GYL = ['A', 'B', 'C', 'D'];
  const n1 = (v) => Math.round(v * 10) / 10;
  const ln = (x1, y1, x2, y2, w = 1, extra = '') => `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" stroke="currentColor" stroke-width="${w}"${extra}/>`;
  const pathEl = (d, w = 1, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}"${extra}/>`;
  const txt = (x, y, s, size, cls = '', extra = '') => `<text x="${n1(x)}" y="${n1(y)}" font-size="${size}" fill="currentColor" text-anchor="middle"${cls ? ` class="${cls}"` : ''}${extra}>${esc(s)}</text>`;

  function wallH(y, x1, x2, w, gaps = []) {
    let out = '', cur = x1;
    gaps.forEach(([a, b]) => { if (a > cur) out += ln(cur, y, a, y, w); cur = Math.max(cur, b); });
    if (cur < x2) out += ln(cur, y, x2, y, w);
    return out;
  }
  function wallV(x, y1, y2, w, gaps = []) {
    let out = '', cur = y1;
    gaps.forEach(([a, b]) => { if (a > cur) out += ln(x, cur, x, a, w); cur = Math.max(cur, b); });
    if (cur < y2) out += ln(x, cur, x, y2, w);
    return out;
  }
  function winH(y, a, b, w) {
    const h = w / 2;
    return ln(a, y - h, a, y + h, 1) + ln(b, y - h, b, y + h, 1) + ln(a, y - h, b, y - h, .8) + ln(a, y + h, b, y + h, .8) + ln(a, y, b, y, 1.3);
  }
  function winV(x, a, b, w) {
    const h = w / 2;
    return ln(x - h, a, x + h, a, 1) + ln(x - h, b, x + h, b, 1) + ln(x - h, a, x - h, b, .8) + ln(x + h, a, x + h, b, .8) + ln(x, a, x, b, 1.3);
  }
  // 門：gap [a,b]、hinge 在 a 或 b、s=±1 為開啟側；弧以鉸鏈為圓心，sweep 由外積決定方向
  function doorH(y, a, b, hinge, s) {
    const d = b - a, hx = hinge === 'a' ? a : b, ox = hinge === 'a' ? b : a, ey = y + s * d;
    const cross = -s * d * (ox - hx);
    return ln(hx, y, hx, ey, 1.6) + pathEl(`M${hx} ${ey} A${d} ${d} 0 0 ${cross > 0 ? 1 : 0} ${ox} ${y}`, .8);
  }
  function doorV(x, a, b, hinge, s) {
    const d = b - a, hy = hinge === 'a' ? a : b, oy = hinge === 'a' ? b : a, ex = x + s * d;
    const cross = s * d * (oy - hy);
    return ln(x, hy, ex, hy, 1.6) + pathEl(`M${ex} ${hy} A${d} ${d} 0 0 ${cross > 0 ? 1 : 0} ${x} ${oy}`, .8);
  }
  // 雙跑樓梯（梯段沿 y 方向），x1–x2 為梯間淨寬，踏步自 t1 到 t2
  function stair(x1, x2, t1, t2) {
    const mid = (x1 + x2) / 2;
    let out = ln(mid - 3, t1, mid - 3, t2, .9) + ln(mid + 3, t1, mid + 3, t2, .9);
    for (let y = t1; y <= t2 + .1; y += 10) out += ln(x1, y, mid - 3, y, .8) + ln(mid + 3, y, x2, y, .8);
    const lx = (x1 + mid) / 2, rx = (mid + x2) / 2, ym = (t1 + t2) / 2;
    // 上行箭頭：左跑由下往上 → 平台 → 右跑往下到斷線
    out += pathEl(`M${n1(lx)} ${t2 + 14} V${t1 - 16} H${n1(rx)} V${ym - 8}`, 1);
    out += pathEl(`M${n1(rx - 5)} ${ym - 16} L${n1(rx)} ${ym - 6} L${n1(rx + 5)} ${ym - 16}`, 1);
    out += pathEl(`M${n1(mid + 3)} ${ym + 12} L${n1(rx - 4)} ${ym + 4} L${n1(rx + 4)} ${ym + 14} L${n1(x2)} ${ym + 6}`, 1);
    out += `<circle cx="${n1(lx)}" cy="${t2 + 14}" r="2.6" fill="currentColor"/>`;
    return { lines: out, label: txt(lx + 16, t2 + 22, '上', 12, '', ' font-weight="600"') };
  }
  function toilet(x, y, r = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${r})">` +
      `<rect x="-8" y="-12" width="16" height="6" rx="1" fill="none" stroke="currentColor" stroke-width=".8"/>` +
      `<ellipse cx="0" cy="2" rx="6.5" ry="8.5" fill="none" stroke="currentColor" stroke-width=".8"/></g>`;
  }
  function basin(x, y, w = 26, h = 16) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="none" stroke="currentColor" stroke-width=".8"/><ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2 - 4}" ry="${h / 2 - 3.5}" fill="none" stroke="currentColor" stroke-width=".7"/>`;
  }
  function counter(x, y, w, h, vertical) {
    let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width=".8"/>`;
    if (vertical) {
      out += `<rect x="${x + 3}" y="${y + 12}" width="${w - 6}" height="22" rx="2" fill="none" stroke="currentColor" stroke-width=".7"/>`;
      out += `<circle cx="${x + w / 2}" cy="${y + h - 30}" r="5" fill="none" stroke="currentColor" stroke-width=".7"/><circle cx="${x + w / 2}" cy="${y + h - 14}" r="5" fill="none" stroke="currentColor" stroke-width=".7"/>`;
    } else {
      out += `<rect x="${x + 12}" y="${y + 3}" width="22" height="${h - 6}" rx="2" fill="none" stroke="currentColor" stroke-width=".7"/>`;
      out += `<circle cx="${x + w - 30}" cy="${y + h / 2}" r="5" fill="none" stroke="currentColor" stroke-width=".7"/><circle cx="${x + w - 14}" cy="${y + h / 2}" r="5" fill="none" stroke="currentColor" stroke-width=".7"/>`;
    }
    return out;
  }
  function dimH(xs, y, ext) {
    let out = ln(xs[0] - 12, y, xs[xs.length - 1] + 12, y, .7);
    xs.forEach((x) => { out += ln(x, y - 7, x, y + ext, .6) + ln(x - 5, y + 5, x + 5, y - 5, 1.3); });
    let t = '';
    for (let i = 1; i < xs.length; i++) t += txt((xs[i - 1] + xs[i]) / 2, y - 6, fmt.num((xs[i] - xs[i - 1]) * MM), 12, 'pl-t-dim');
    return { lines: out, text: t };
  }
  function dimV(ys, x, ext) {
    let out = ln(x, ys[0] - 12, x, ys[ys.length - 1] + 12, .7);
    ys.forEach((y) => { out += ln(x - 7, y, x + ext, y, .6) + ln(x - 5, y + 5, x + 5, y - 5, 1.3); });
    let t = '';
    for (let i = 1; i < ys.length; i++) {
      const my = (ys[i - 1] + ys[i]) / 2;
      t += `<text x="${x - 6}" y="${my}" font-size="12" fill="currentColor" text-anchor="middle" class="pl-t-dim" transform="rotate(-90 ${x - 6} ${my})">${fmt.num((ys[i] - ys[i - 1]) * MM)}</text>`;
    }
    return { lines: out, text: t };
  }
  const roomLabel = (x, y, name, area) => txt(x, y, name, 16, 'pl-t-room', ' font-weight="600"') + (area ? txt(x, y + 16, `${area} m²`, 11, 'pl-t-area') : '');
  // 輪椅符號（無障礙圖層用）
  const wheelchair = (x, y) => `<g transform="translate(${x} ${y})"><circle cx="1" cy="-9" r="2.6" fill="currentColor"/><path d="M1-5.5V2h7l3 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M-1.5-1a6.5 6.5 0 1 0 8.5 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></g>`;

  function unitAGeometry() {
    // A 戶（X1–X3 / A–B）；B 戶以鏡射 transform 共用同一份幾何
    const walls =
      wallH(300, 150, 300, 5, [[250, 282]]) +
      wallV(240, 300, 380, 5, [[312, 339]]) +
      wallV(300, 170, 380, 5, [[316, 372]]) +
      wallV(510, 170, 380, 5, [[222, 254], [296, 366]]) +
      wallH(270, 510, 630, 5);
    const openings =
      doorH(300, 250, 282, 'b', -1) +
      doorV(240, 312, 339, 'a', -1) +
      doorV(510, 222, 254, 'b', 1) +
      doorH(380, 330, 360, 'b', -1);
    const fixtures = toilet(170, 368, 180) + basin(206, 352, 28, 18) + counter(604, 278, 22, 96, true);
    return { walls, openings, fixtures };
  }

  function planMarkup(opts = {}) {
    const pre = opts.id || 'plan';
    const A = unitAGeometry();
    const mirror = (s) => `<g transform="translate(1260 0) scale(-1 1)">${s}</g>`;

    /* 軸線與軸號 */
    let grid = '', axis = '';
    GX.forEach((x, i) => {
      grid += ln(x, 54, x, 718, .7, ' stroke-dasharray="22 5 3 5"');
      axis += `<circle cx="${x}" cy="36" r="15" fill="#FFFEFA" stroke="currentColor" stroke-width="1.2"/>` + txt(x, 41, String(i + 1), 14, 'pl-t-axis', ' font-weight="600"');
    });
    GY.forEach((y, i) => {
      grid += ln(54, y, 1196, y, .7, ' stroke-dasharray="22 5 3 5"');
      axis += `<circle cx="36" cy="${y}" r="15" fill="#FFFEFA" stroke="currentColor" stroke-width="1.2"/>` + txt(36, y + 5, GYL[i], 14, 'pl-t-axis', ' font-weight="600"');
    });

    /* 尺寸線 */
    const dTop1 = dimH([GX[0], GX[4]], 74, 8), dTop2 = dimH(GX, 100, 12);
    const dL1 = dimV([GY[0], GY[3]], 72, 8), dL2 = dimV(GY, 100, 12);
    const dims = dTop1.lines + dTop2.lines + dL1.lines + dL2.lines;
    const dimText = dTop1.text + dTop2.text + dL1.text + dL2.text;

    /* 外牆（厚 10）與分戶牆、走廊牆（厚 8） */
    const ext =
      wallH(170, 145, 1115, 10, [[180, 270], [330, 480], [530, 600], [660, 730], [780, 930], [990, 1080]]) +
      wallH(680, 145, 1115, 10, [[176, 236], [420, 500], [574, 706], [770, 850], [1052, 1092]]) +
      wallV(150, 165, 685, 10, [[200, 270], [312, 360], [395, 455]]) +
      wallV(1110, 165, 685, 10, [[200, 270], [312, 360], [395, 455]]);
    const extWin =
      winH(170, 180, 270, 10) + winH(170, 330, 480, 10) + winH(170, 530, 600, 10) +
      winH(170, 660, 730, 10) + winH(170, 780, 930, 10) + winH(170, 990, 1080, 10) +
      winH(680, 176, 236, 10) + winH(680, 420, 500, 10) + winH(680, 574, 706, 10) + winH(680, 770, 850, 10) + winH(680, 1052, 1092, 10) +
      winV(150, 200, 270, 10) + winV(150, 395, 455, 10) + winV(1110, 200, 270, 10) + winV(1110, 395, 455, 10);
    const core =
      wallV(630, 170, 380, 8) +
      wallH(380, 150, 1110, 8, [[330, 360], [900, 930]]) +
      wallH(470, 150, 990, 8, [[196, 236], [284, 382], [600, 630], [900, 930]]) +
      wallV(270, 470, 680, 8) +
      wallV(390, 470, 680, 8) +
      wallV(870, 470, 680, 8);
    const unitC =
      wallV(480, 470, 560, 5, [[520, 547]]) +
      wallH(560, 390, 530, 5, [[488, 520]]) +
      wallV(530, 560, 680, 5) +
      wallH(560, 740, 870, 5, [[752, 784]]) +
      wallV(740, 470, 680, 5, [[492, 519]]);
    const unitCOpen =
      doorV(480, 520, 547, 'b', -1) +
      doorH(560, 488, 520, 'a', 1) +
      doorH(560, 752, 784, 'b', 1) +
      doorV(740, 492, 519, 'a', 1) +
      doorH(470, 600, 630, 'b', 1) +
      doorH(470, 900, 930, 'a', 1);
    const mech = wallH(580, 870, 990, 5, [[900, 928]]) + doorH(580, 900, 928, 'b', 1);
    const s1 = stair(156, 264, 530, 640);
    /* 昇降機：坑道、車廂與配重（共同部分只有梯廳） */
    const fixC = toilet(406, 486, 0) + basin(440, 538, 28, 16) + counter(492, 476, 96, 20, false);
    /* 陽台（A、B 戶） */
    const balcony = (x1, x2) => ln(x1, 128, x2, 128, 1.2) + ln(x1, 133, x2, 133, .7) + ln(x1, 128, x1, 170, 1.2) + ln(x2, 128, x2, 170, 1.2);
    const balc = balcony(190, 600) + balcony(660, 1070);

    /* 柱 C1（72×72 → 24 單位） */
    let cols = '';
    GX.forEach((x) => GY.forEach((y) => { cols += `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" fill="currentColor"/>`; }));

    /* R1 / R2 差異 */
    // 昇降機坑道：top 為坑道上緣（門洞在上緣 312–348），車廂深度 = 662 - carTop
    const shaft = (top, carTop) =>
      wallV(292, top, 676, 5) + wallV(382, top, 676, 5) + wallH(top, 290, 384, 5, [[312, 348]]) +
      ln(312, top + 4, 348, top + 4, .8) +
      `<rect x="300" y="${carTop}" width="60" height="${662 - carTop}" fill="none" stroke="currentColor" stroke-width="1"/>` +
      ln(300, carTop, 360, 662, .7) + ln(360, carTop, 300, 662, .7) +
      `<rect x="364" y="${carTop}" width="12" height="${662 - carTop - 4}" fill="none" stroke="currentColor" stroke-width=".8"/>`;
    const r1 =
      // 一號梯防火門開向走廊（#1）
      doorH(470, 196, 236, 'a', -1) +
      // 二號梯梯間較窄（#2）：梯間牆在 x=1024，梯段淨寬 1,080
      wallV(1024, 470, 680, 8) + wallH(470, 990, 1110, 8, [[1046, 1080]]) + doorH(470, 1046, 1080, 'a', 1) +
      wallH(580, 990, 1024, 5) +
      stair(1028, 1106, 530, 640).lines +
      // 昇降機車廂深 1,260（#3）
      shaft(612, 620) +
      // 浴廁外牆無窗（#6）
      ln(150, 312, 150, 360, 10) + ln(1110, 312, 1110, 360, 10);
    const r2 =
      doorH(470, 196, 236, 'a', 1) +
      wallV(990, 470, 680, 8) + wallH(470, 990, 1110, 8, [[1032, 1072]]) + doorH(470, 1032, 1072, 'a', 1) +
      stair(996, 1104, 530, 640).lines +
      shaft(596, 610) +
      winV(150, 312, 360, 10) + winV(1110, 312, 360, 10);

    /* 疊圖模式的變更標記 */
    const dm = (x, y, n) => `<g transform="translate(${x} ${y})"><path d="M0-13 12 8H-12z" fill="#FFFEFA" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>${txt(0, 5, String(n), 11, 'pl-t-code', ' font-weight="700"')}</g>`;
    const diffMarks = `<g class="pl-diffmark" style="color:var(--diff-new)">${dm(216, 418, 1)}${dm(1004, 724, 2)}${dm(400, 592, 3)}${dm(126, 336, 4)}${dm(1134, 336, 5)}</g>`;

    /* 圖層：結構 */
    const beam = (x1, y1, x2, y2) => ln(x1, y1, x2, y2, 1.4, ' stroke-dasharray="9 5"');
    let beams = '';
    GY.forEach((y) => { for (let i = 0; i < 4; i++) beams += beam(GX[i] + 14, y, GX[i + 1] - 14, y); });
    GX.forEach((x) => { for (let j = 0; j < 3; j++) beams += beam(x, GY[j] + 14, x, GY[j + 1] - 14); });
    let colHatch = '';
    GX.forEach((x) => GY.forEach((y) => { colHatch += `<rect x="${x - 17}" y="${y - 17}" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.2"/>`; }));
    const swRect = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${pre}-hatch)" stroke="currentColor" stroke-width="1.4"/>`;
    const strLayer =
      `<defs><pattern id="${pre}-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" stroke-width="2.2" stroke-opacity=".55"/></pattern></defs>` +
      beams + colHatch +
      swRect(384, 492, 12, 176) + swRect(264, 492, 12, 176) + swRect(286, 590, 12, 90) +
      txt(500, 162, 'G1 50×80', 12, 'pl-t-code') + txt(870, 452, 'B1 40×65', 11, 'pl-t-code') +
      `<text x="378" y="548" font-size="12" fill="currentColor" class="pl-t-code" text-anchor="middle" transform="rotate(-90 378 548)">SW1 t=30</text>` +
      txt(184, 160, 'C1 72×72', 11, 'pl-t-code');

    /* 圖層：消防（避難路徑、偵煙、消防栓、滅火器、排煙口） */
    const arrowHead = (x, y, dir) => {
      const r = { down: 0, up: 180, left: 90, right: -90 }[dir];
      return `<path d="M-6-8 0 2 6-8" transform="translate(${x} ${y}) rotate(${r})" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    };
    const smoke = (x, y) => `<circle cx="${x}" cy="${y}" r="8" fill="#FFFEFA" stroke="currentColor" stroke-width="1.3"/>` + txt(x, y + 4, 'S', 10, 'pl-t-code', ' font-weight="700"');
    const firLayer =
      pathEl('M345 392V425H216V500', 2.6, ' stroke-dasharray="10 6" stroke-linecap="round"') + arrowHead(216, 502, 'down') +
      pathEl('M915 392V425H1052V500', 2.6, ' stroke-dasharray="10 6" stroke-linecap="round"') + arrowHead(1052, 502, 'down') +
      pathEl('M615 462V425', 2.6, ' stroke-dasharray="10 6" stroke-linecap="round"') +
      smoke(300, 446) + smoke(520, 446) + smoke(760, 446) + smoke(980, 446) +
      smoke(225, 210) + smoke(405, 210) + smoke(855, 210) + smoke(1035, 210) + smoke(460, 640) + smoke(640, 640) + smoke(805, 640) +
      `<rect x="586" y="386" width="46" height="12" fill="#FFFEFA" stroke="currentColor" stroke-width="1.3"/>` + txt(609, 396, '消防栓', 9, '', ' font-weight="600"') +
      `<path d="M170 444l7-12 7 12z" fill="currentColor"/><path d="M1076 444l7-12 7 12z" fill="currentColor"/>` +
      `<rect x="141" y="395" width="18" height="60" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1"/>` +
      `<rect x="1101" y="395" width="18" height="60" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1"/>` +
      txt(256, 462, 'FD', 11, 'pl-t-code', ' font-weight="700"') + txt(1094, 462, 'FD', 11, 'pl-t-code', ' font-weight="700"') +
      txt(470, 418, '步行距離 13.2 m ≤ 50 m', 12, '', ' font-weight="600"');

    /* 圖層：無障礙（迴轉空間、無障礙通路、門寬） */
    const accLayer =
      `<circle cx="330" cy="540" r="25" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4"/>` +
      `<circle cx="612" cy="425" r="25" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-width="1.3" stroke-dasharray="5 4"/>` +
      txt(330, 512, 'φ150', 11, 'pl-t-code', ' font-weight="600"') + txt(668, 452, 'φ150', 11, 'pl-t-code', ' font-weight="600"') +
      pathEl('M330 596V425H612V462', 2.2, ' stroke-dasharray="2 6" stroke-linecap="round"') +
      wheelchair(330, 646) + wheelchair(612, 498) +
      txt(560, 498, 'W90', 11, 'pl-t-code', ' font-weight="700"') + txt(345, 404, 'W90', 11, 'pl-t-code', ' font-weight="700"') +
      ln(400, 389, 590, 389, 1) + ln(640, 389, 880, 389, 1) + ln(400, 461, 590, 461, 1) + ln(640, 461, 880, 461, 1) +
      txt(760, 404, '扶手 H75/H85', 11, '', ' font-weight="600"');

    /* 房間名稱 */
    const labels =
      roomLabel(225, 232, '主臥室', '17.6') + roomLabel(195, 336, '浴室', '6.5') + roomLabel(405, 270, '客餐廳', '39.7') +
      roomLabel(570, 218, '臥室', '10.8') + roomLabel(564, 330, '廚房', '11.9') +
      roomLabel(1035, 232, '主臥室', '17.6') + roomLabel(1065, 336, '浴室', '6.5') + roomLabel(855, 270, '客餐廳', '39.7') +
      roomLabel(690, 218, '臥室', '10.8') + roomLabel(696, 330, '廚房', '11.9') +
      roomLabel(446, 500, '浴室', '7.3') + roomLabel(545, 530, '廚房', '') + roomLabel(460, 618, '臥室', '15.1') +
      roomLabel(636, 600, '客餐廳', '32.4') + roomLabel(805, 618, '主臥室', '14.0') + roomLabel(805, 538, '儲藏', '') +
      roomLabel(930, 520, '機電室', '') + roomLabel(930, 636, '垃圾儲存', '') +
      txt(330, 584, '梯廳', 14, 'pl-t-room', ' font-weight="600"') +
      txt(806, 432, '公共走廊', 14, 'pl-t-room', ' font-weight="600"') +
      txt(405, 244, 'A 戶', 12, 'pl-t-code', ' font-weight="600"') + txt(855, 244, 'B 戶', 12, 'pl-t-code', ' font-weight="600"') +
      txt(636, 576, 'C 戶', 12, 'pl-t-code', ' font-weight="600"') +
      txt(210, 496, '一號梯', 12, '', ' font-weight="600"') + txt(1050, 496, '二號梯', 12, '', ' font-weight="600"') +
      s1.label;

    /* 圖名、比例尺、指北針 */
    const titleBlock =
      `<text x="640" y="790" font-size="22" font-weight="700" fill="currentColor" class="pl-t-room">標準層平面圖</text>` +
      ln(640, 800, 820, 800, 1.6) + ln(640, 804, 820, 804, .6) +
      `<text x="640" y="824" font-size="12" fill="currentColor" class="pl-t-code">A-201 · 4F–12F · SCALE 1:100</text>` +
      `<g transform="translate(1214 70)"><circle r="22" fill="none" stroke="currentColor" stroke-width="1"/><path d="M0-30 8 10 0 4-8 10z" fill="currentColor"/>${txt(0, -36, 'N', 13, 'pl-t-axis', ' font-weight="700"')}</g>` +
      `<g transform="translate(900 806)">` +
      `<rect x="0" y="-6" width="33.3" height="6" fill="currentColor"/><rect x="33.3" y="-6" width="33.3" height="6" fill="none" stroke="currentColor" stroke-width=".8"/>` +
      `<rect x="66.6" y="-6" width="100" height="6" fill="currentColor"/>` +
      txt(0, 14, '0', 11, 'pl-t-dim') + txt(33.3, 14, '1', 11, 'pl-t-dim') + txt(66.6, 14, '2', 11, 'pl-t-dim') + txt(166.6, 14, '5 m', 11, 'pl-t-dim') + `</g>`;

    const annos = opts.annotations === false ? '' :
      (Array.isArray(opts.annotations) ? opts.annotations : FEATURED.annotations).map(annoMarkup).join('');

    // data-draw 標記描繪順序（App.plan.animate 依序處理）
    return `
      <g class="pl-grid" data-draw="0">${grid}</g>
      <g class="pl-dims" data-draw="4">${dims}${dimText}</g>
      <g class="pl-axis" data-draw="1">${axis}</g>
      <g class="pl-base">
        <g data-draw="1">${ext}${core}${A.walls}${mirror(A.walls)}${unitC}${mech}</g>
        <g data-draw="2">${extWin}${A.openings}${mirror(A.openings)}${unitCOpen}${balc}${s1.lines}</g>
        <g data-draw="3" class="pl-fade">${cols}</g>
      </g>
      <g class="pl-fix" data-draw="3">${A.fixtures}${mirror(A.fixtures)}${fixC}</g>
      <g class="pl-rev" data-rev="1" data-draw="2">${r1}</g>
      <g class="pl-rev" data-rev="2" data-draw="2">${r2}</g>
      <g class="pl-labels pl-fade" data-draw="5">${labels}${titleBlock}</g>
      ${diffMarks}
      <g class="pl-layer" data-layer="str">${strLayer}</g>
      <g class="pl-layer" data-layer="fir">${firLayer}</g>
      <g class="pl-layer" data-layer="acc">${accLayer}</g>
      <g class="pl-annos">${annos}</g>
      <g class="pl-pen" aria-hidden="true"></g>`;
  }

  function annoMarkup(a) {
    const [x, y, w, h] = a.box;
    const [bx, by] = a.bubble;
    const lx = clamp(bx, x, x + w), ly = clamp(by, y, y + h);
    const ang = Math.atan2(ly - by, lx - bx);
    const sx = bx + Math.cos(ang) * 15, sy = by + Math.sin(ang) * 15;
    const note = a.note ? `<text class="pl-t-note anno-note" x="${a.note[0]}" y="${a.note[1]}" font-size="20" fill="currentColor">${esc(a.note[2])}</text>` : '';
    return `<g class="anno-mark" data-anno="${a.no}" data-status="${a.status}" data-round="${a.round}" role="img" aria-label="批註 ${a.no}：${esc(a.short)}">` +
      `<rect class="anno-mark__halo" x="${x - 12}" y="${y - 12}" width="${w + 24}" height="${h + 24}" rx="8" fill="#FFF176" fill-opacity=".5"/>` +
      `<path class="anno-cloud" d="${cloudPath(x, y, w, h, { arc: 13, seed: a.no * 7 })}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<line class="anno-leader" x1="${n1(lx)}" y1="${n1(ly)}" x2="${n1(sx)}" y2="${n1(sy)}" stroke="currentColor" stroke-width="1.5"/>` +
      `<g class="anno-bubble"><circle cx="${bx}" cy="${by}" r="15" fill="#fff" stroke="currentColor" stroke-width="2.4"/>` +
      `<text x="${bx}" y="${by + 5.5}" font-size="15" font-weight="600" fill="currentColor" text-anchor="middle" class="pl-t-code">${a.no}</text></g>` +
      `<path class="anno-check" d="M${bx + 9} ${by - 18} l5 5 10-12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
      note +
      `<rect class="anno-mark__hit" x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent"/>` +
      `</g>`;
  }

  const plan = {
    VIEWBOX: VB,
    MM,
    svg(opts = {}) {
      const id = opts.id || 'plan';
      const layers = (opts.layers || []).join(' ');
      return `<svg class="plan${opts.className ? ' ' + opts.className : ''}" id="${esc(id)}" viewBox="0 0 ${VB.w} ${VB.h}" data-view="${opts.view || 'r2'}" data-layers="${layers}" role="img" aria-label="${esc(opts.label || 'A-201 標準層平面圖（4F–12F），含審查批註')}" xmlns="http://www.w3.org/2000/svg">${planMarkup(opts)}</svg>`;
    },
    annoMarkup,
    setView(svg, view) { svg.setAttribute('data-view', view); },
    setLayers(svg, keys) { svg.setAttribute('data-layers', keys.join(' ')); },
    toggleLayer(svg, key, on) {
      const set = new Set((svg.getAttribute('data-layers') || '').split(' ').filter(Boolean));
      if (on ?? !set.has(key)) set.add(key); else set.delete(key);
      svg.setAttribute('data-layers', [...set].join(' '));
      return set.has(key);
    },
    animate: animatePlan,
    drawAnno,
  };

  /* ------------------------------------------------------------------
   * 描繪引擎：stroke-dashoffset 從全長到 0。填色、文字或本身是虛線的元素改用淡入，
   * 免得描完突然跳成虛線。結束後移除 inline 樣式，回到元素原本的外觀。
   * ------------------------------------------------------------------ */
  const DRAWABLE = 'line, path, rect, circle, ellipse, polyline, polygon';
  function draw(elements, { duration = 900, stagger = 10, delay = 0, easing = 'cubic-bezier(.45,.05,.25,1)' } = {}) {
    const els = Array.from(elements);
    if (reduceMotion.matches || !els.length) return Promise.resolve();
    const anims = els.map((el, i) => {
      const d = delay + i * stagger;
      const isText = el.tagName === 'text' || el.tagName === 'g';
      const dashed = !isText && el.getAttribute('stroke-dasharray');
      const noStroke = !isText && (!el.getAttribute('stroke') || el.getAttribute('stroke') === 'none');
      if (isText || dashed || noStroke) {
        return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * .6, delay: d, easing: 'ease-out', fill: 'backwards' });
      }
      const len = el.getTotalLength();
      el.style.strokeDasharray = `${len} ${len}`;
      const a = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay: d, easing, fill: 'backwards' });
      a.finished.then(() => { el.style.strokeDasharray = ''; }, () => { el.style.strokeDasharray = ''; });
      return a;
    });
    // 被取消（例如重播）視同完成，避免 Promise 永遠 pending
    return Promise.all(anims.map((a) => a.finished.catch(() => null)));
  }

  /* 紅筆筆尖沿 path 前進：以 rAF 同步 dashoffset 與筆尖位置；分頁隱藏時 rAF 自然暫停 */
  const PEN = '<g class="pen-nib"><path d="M0 0 9-22 17-17 6 4z" fill="#FFFEFA" stroke="#2D3A4A" stroke-width="1.2" stroke-linejoin="round"/><path d="M0 0 4-9 9-6z" fill="#D7263D"/><path d="M9-22 17-17 26-34 18-39z" fill="#2D3A4A"/></g>';
  function penTrace(path, { duration = 900, delay = 0, svg } = {}) {
    if (reduceMotion.matches) return Promise.resolve();
    const len = path.getTotalLength();
    const host = svg && $('.pl-pen', svg);
    let nib = null;
    if (host) {
      host.insertAdjacentHTML('beforeend', PEN);
      nib = host.lastElementChild;
    }
    path.style.strokeDasharray = `${len} ${len}`;
    path.style.strokeDashoffset = len;
    return new Promise((resolve) => {
      // 延遲期間路徑已設成隱藏，避免先整條出現再被擦掉重描
      const t0 = performance.now() + delay;
      const ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const tick = (t) => {
        // 筆被移出 DOM（重繪）就直接收尾
        if (!path.isConnected) { nib?.remove(); resolve(); return; }
        const k = Math.max(0, Math.min(1, (t - t0) / duration));
        const l = len * ease(k);
        path.style.strokeDashoffset = len - l;
        if (nib) {
          const p = path.getPointAtLength(l);
          nib.setAttribute('transform', `translate(${n1(p.x)} ${n1(p.y)})`);
        }
        if (k < 1) requestAnimationFrame(tick);
        else {
          path.style.strokeDasharray = '';
          path.style.strokeDashoffset = '';
          nib?.remove();
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  // 批註在目前檢視是否可見：R1 檢視不顯示 R2 新增的批註；頁面可用 .is-hidden 篩掉
  const annoShown = (svg, g) => !(svg.getAttribute('data-view') === 'r1' && g.dataset.round === '2') && !g.classList.contains('is-hidden');
  // 已改善的批註在 R2 / 疊圖檢視是綠色虛線，不用紅筆描，直接淡入
  const annoQuiet = (svg, g) => svg.getAttribute('data-view') === 'diff' || (svg.getAttribute('data-view') === 'r2' && g.dataset.status === 'resolved');

  function drawAnno(svg, no) {
    const g = $(`.anno-mark[data-anno="${no}"]`, svg);
    if (!g || reduceMotion.matches) return Promise.resolve();
    g.classList.remove('is-pending');
    if (annoQuiet(svg, g)) {
      return g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' }).finished.catch(() => null);
    }
    const cloud = $('.anno-cloud', g);
    // 只處理目前可見的附屬元素，避免 CSS 隱藏的（如已改善的勾）被動畫閃出來
    const rest = $$('.anno-leader, .anno-bubble, .anno-note, .anno-check', g).filter((el) => getComputedStyle(el).opacity !== '0');
    rest.forEach((el) => { el.style.opacity = '0'; });
    return penTrace(cloud, { duration: 700, svg }).then(() => {
      rest.forEach((el, i) => {
        el.style.opacity = '';
        el.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 70, easing: 'ease-out', fill: 'backwards' });
      });
    });
  }

  // 每個 svg 一個 token：重播時舊流程讀到 token 不符就停止，不會和新流程搶著改樣式
  const animTokens = new WeakMap();
  function animatePlan(svg, { annotations = true, speed = 1 } = {}) {
    const token = {};
    animTokens.set(svg, token);
    svg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    $$('.pl-pen', svg).forEach((p) => { p.innerHTML = ''; });
    $$('.anno-mark *', svg).forEach((el) => { el.style.opacity = ''; el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; });
    const annos = $$('.anno-mark', svg);
    annos.forEach((g) => g.classList.remove('is-pending'));
    if (reduceMotion.matches) return Promise.resolve();
    const S = (ms) => ms / speed;
    const group = (n) => $$(`[data-draw="${n}"]`, svg);
    const leaves = (groups) => groups.flatMap((g) => $$(DRAWABLE + ', text', g).filter((el) => !el.closest('defs')));
    // 雲線在底圖描完前先藏起來
    if (annotations) annos.forEach((g) => g.classList.add('is-pending'));
    const seq = [
      draw(leaves(group(0)), { duration: S(600), stagger: S(14) }),
      draw(leaves(group(1)), { duration: S(800), stagger: S(6), delay: S(250) }),
      draw(leaves(group(2)), { duration: S(500), stagger: S(2), delay: S(800) }),
      draw(leaves(group(3)), { duration: S(450), stagger: S(3), delay: S(1150) }),
      draw(leaves(group(4)), { duration: S(500), stagger: S(8), delay: S(1250) }),
      draw(leaves(group(5)), { duration: S(450), stagger: S(6), delay: S(1500) }),
    ];
    // 牆與開口描到一半就開始下紅筆，不等文字淡入，整段節奏約 4 秒
    const annoStart = new Promise((res) => setTimeout(res, S(1600)));
    return Promise.all([annoStart, ...seq.slice(0, 3)]).then(() => {
      if (animTokens.get(svg) !== token) return null;
      const shown = annos.filter((g) => annoShown(svg, g));
      annos.filter((g) => !shown.includes(g)).forEach((g) => g.classList.remove('is-pending'));
      // 已改善者一起淡入；待處理者用紅筆依序描，下一筆在上一筆收尾前起筆，節奏才連貫
      shown.filter((g) => annoQuiet(svg, g)).forEach((g) => { drawAnno(svg, g.dataset.anno); });
      const loud = shown.filter((g) => !annoQuiet(svg, g));
      return Promise.all(loud.map((g, i) => new Promise((res) => {
        setTimeout(() => {
          if (animTokens.get(svg) !== token) { res(); return; }
          drawAnno(svg, g.dataset.anno).then(res);
        }, S(i * 460));
      })));
    });
  }

  /* ------------------------------------------------------------------
   * 畫布 pan / zoom：直接改 viewBox，向量線條在任何倍率都銳利。
   * 拖曳超過 4px 才 capture pointer，讓點擊仍能落在批註等子元素上。
   * ------------------------------------------------------------------ */
  function panZoom(svg, opts = {}) {
    const host = opts.host || svg.parentElement;
    const base = svg.viewBox.baseVal;
    const B = { x: base.x, y: base.y, w: base.width, h: base.height };
    const vb = { ...B };
    const min = opts.min ?? 1, max = opts.max ?? 8;
    let tween = 0;

    const scale = () => B.w / vb.w;
    const apply = () => {
      svg.setAttribute('viewBox', `${n1(vb.x)} ${n1(vb.y)} ${n1(vb.w)} ${n1(vb.h)}`);
      opts.onChange?.(scale());
    };
    const clampVB = () => {
      vb.w = clamp(vb.w, B.w / max, B.w / min);
      vb.h = vb.w * B.h / B.w;
      const cx = clamp(vb.x + vb.w / 2, B.x, B.x + B.w);
      const cy = clamp(vb.y + vb.h / 2, B.y, B.y + B.h);
      vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
    };
    const toSvg = (cx, cy) => new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse());
    const zoomAt = (factor, px, py) => {
      cancelAnimationFrame(tween);
      const nw = clamp(vb.w / factor, B.w / max, B.w / min);
      const k = nw / vb.w;
      vb.x = px - (px - vb.x) * k;
      vb.y = py - (py - vb.y) * k;
      vb.w = nw;
      clampVB();
      apply();
    };
    const animateTo = (target, dur = 420) => {
      cancelAnimationFrame(tween);
      if (reduceMotion.matches) { Object.assign(vb, target); clampVB(); apply(); return; }
      const from = { ...vb }, t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = ease(k);
        vb.x = from.x + (target.x - from.x) * e;
        vb.y = from.y + (target.y - from.y) * e;
        vb.w = from.w + (target.w - from.w) * e;
        vb.h = vb.w * B.h / B.w;
        apply();
        if (k < 1) tween = requestAnimationFrame(step);
        else { clampVB(); apply(); }
      };
      tween = requestAnimationFrame(step);
    };
    const center = () => ({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
    const zoomTo = (s) => {
      const c = center();
      const w = clamp(B.w / s, B.w / max, B.w / min);
      animateTo({ x: c.x - w / 2, y: c.y - w * B.h / B.w / 2, w });
    };

    /* 滾輪 */
    let hintTimer = 0;
    const hint = opts.hintEl;
    host.addEventListener('wheel', (e) => {
      if (opts.wheel === 'ctrl' && !e.ctrlKey && !e.metaKey) {
        if (hint) {
          hint.classList.add('is-show');
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => hint.classList.remove('is-show'), 1200);
        }
        return;
      }
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * unit * 0.0016), p.x, p.y);
    }, { passive: false });

    /* 拖曳與雙指縮放 */
    const pointers = new Map();
    let start = null, dragging = false, suppressClick = false, pinch = null;
    host.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, a, input, select, textarea')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { start = { x: e.clientX, y: e.clientY }; dragging = false; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        host.setPointerCapture(e.pointerId);
      }
    });
    host.addEventListener('pointermove', (e) => {
      if (opts.onMove) opts.onMove(toSvg(e.clientX, e.clientY));
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt(d / pinch.d, m.x, m.y);
        pinch.d = d;
        dragging = true;
        return;
      }
      if (!dragging && Math.hypot(cur.x - start.x, cur.y - start.y) > 4) {
        dragging = true;
        host.setPointerCapture(e.pointerId);
        host.classList.add('is-panning');
      }
      if (dragging) {
        cancelAnimationFrame(tween);
        const ctm = svg.getScreenCTM();
        vb.x -= (cur.x - prev.x) / ctm.a;
        vb.y -= (cur.y - prev.y) / ctm.d;
        clampVB();
        apply();
      }
    });
    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        if (dragging) suppressClick = true;
        dragging = false;
        host.classList.remove('is-panning');
      }
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
    host.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      opts.onTap?.(toSvg(e.clientX, e.clientY), e);
    });

    /* 鍵盤：畫布取得焦點時 +/- 縮放、方向鍵平移、0 置中 */
    if (!host.hasAttribute('tabindex')) host.tabIndex = 0;
    host.addEventListener('keydown', (e) => {
      if (e.target !== host) return;
      const k = e.key, stepPx = vb.w * 0.08;
      if (k === '+' || k === '=') zoomTo(scale() * 1.4);
      else if (k === '-' || k === '_') zoomTo(scale() / 1.4);
      else if (k === '0') ctrl.fit();
      else if (k === 'ArrowLeft') { vb.x -= stepPx; clampVB(); apply(); }
      else if (k === 'ArrowRight') { vb.x += stepPx; clampVB(); apply(); }
      else if (k === 'ArrowUp') { vb.y -= stepPx; clampVB(); apply(); }
      else if (k === 'ArrowDown') { vb.y += stepPx; clampVB(); apply(); }
      else return;
      e.preventDefault();
    });

    const ctrl = {
      zoomIn: () => zoomTo(scale() * 1.5),
      zoomOut: () => zoomTo(scale() / 1.5),
      fit: () => animateTo({ ...B }),
      zoomTo,
      focus([x, y, w, h], { pad = 80, max: m = 3.2 } = {}) {
        const vw = Math.max((w + pad * 2), (h + pad * 2) * B.w / B.h, B.w / m);
        const vh = vw * B.h / B.w;
        animateTo({ x: x + w / 2 - vw / 2, y: y + h / 2 - vh / 2, w: vw });
      },
      scale,
      toSvg,
    };
    apply();
    return ctrl;
  }

  /* ------------------------------------------------------------------
   * Toast：有 modal 開著時把容器移進該 dialog（top layer 會蓋住 body 的元素）
   * ------------------------------------------------------------------ */
  let toastHost = null;
  function placeToasts() {
    if (!toastHost) return;
    const open = $$('dialog[open]').filter((d) => d.matches(':modal'));
    const target = open[open.length - 1] || document.body;
    if (toastHost.parentElement !== target) target.appendChild(toastHost);
  }
  const TOAST_ICON = { ok: 'check', red: 'alert', info: 'bell', ink: 'pen' };
  function toast(title, { desc = '', tone = 'ink', action = null, duration = 4200 } = {}) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('aria-live', 'polite');
    }
    placeToasts();
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.setAttribute('role', tone === 'red' ? 'alert' : 'status');
    el.innerHTML = `${icon(TOAST_ICON[tone] || 'pen', 'toast__icon')}<div class="toast__title">${esc(title)}</div>${action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : ''}${desc ? `<div class="toast__desc">${esc(desc)}</div>` : ''}`;
    toastHost.appendChild(el);
    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      if (!el.isConnected || el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 220);
    };
    if (action) {
      $('.toast__action', el).addEventListener('click', () => { action.onClick?.(); dismiss(); });
    }
    timer = setTimeout(dismiss, duration);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1800); });
    return { dismiss };
  }
  // dialog 的 close 事件不冒泡，用 capture 監聽
  document.addEventListener('close', (e) => { if (e.target.tagName === 'DIALOG') placeToasts(); }, true);

  /* ------------------------------------------------------------------
   * Modal
   * ------------------------------------------------------------------ */
  let modalSeq = 0;
  function openDialog(d) {
    if (!d.open) d.showModal();
    placeToasts();
  }
  function closeDialog(d) {
    if (d.open) d.close();
    placeToasts();
  }
  function modal({ title, code = '', body = '', size = '', actions = [], onClose } = {}) {
    const id = `modal-title-${++modalSeq}`;
    const d = document.createElement('dialog');
    d.className = `modal${size ? ' modal--' + size : ''}`;
    d.setAttribute('aria-labelledby', id);
    d.innerHTML = `<div class="modal__inner">
      <header class="modal__head">${code ? `<span class="modal__code">${esc(code)}</span>` : ''}<h2 class="modal__title" id="${id}">${esc(title)}</h2>
        <button type="button" class="icon-btn icon-btn--sm icon-btn--ghost modal__close" aria-label="關閉">${icon('x')}</button></header>
      <div class="modal__body"></div>
      ${actions.length ? '<footer class="modal__foot"></footer>' : ''}
    </div>`;
    const bodyEl = $('.modal__body', d);
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const close = () => closeDialog(d);
    const foot = $('.modal__foot', d);
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${a.variant ? ' btn--' + a.variant : ''}`;
      b.innerHTML = `${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span>`;
      b.addEventListener('click', () => (a.onClick ? a.onClick(close, d) : close()));
      if (a.autofocus) b.autofocus = true;
      foot.appendChild(b);
    });
    $('.modal__close', d).addEventListener('click', close);
    // 點背景關閉：dialog 本身只在 backdrop 區被點到時成為 target
    d.addEventListener('click', (e) => { if (e.target === d) close(); });
    d.addEventListener('close', () => { onClose?.(); d.remove(); placeToasts(); });
    document.body.appendChild(d);
    openDialog(d);
    return { el: d, body: bodyEl, close };
  }
  // 合成的 Escape（或沒有原生 cancel 的情況）也能關閉最上層 modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const open = $$('dialog[open]');
    const top = open[open.length - 1];
    if (top) { e.preventDefault(); closeDialog(top); return; }
    const nav = $('.site-nav.is-open');
    if (nav) setNav(false);
  });

  /* ------------------------------------------------------------------
   * Tabs / Seg
   * ------------------------------------------------------------------ */
  function tabs(list, { onChange } = {}) {
    const items = $$('[role="tab"]', list);
    let ink = $('.tabs__ink', list);
    if (!ink) { ink = document.createElement('span'); ink.className = 'tabs__ink'; list.appendChild(ink); }
    const moveInk = (t) => {
      ink.style.width = `${t.offsetWidth - 16}px`;
      ink.style.transform = `translateX(${t.offsetLeft + 8}px)`;
    };
    const select = (i, focus = false) => {
      items.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      moveInk(items[i]);
      if (focus) items[i].focus();
      onChange?.(i, items[i]);
    };
    items.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const cur = items.indexOf(document.activeElement);
        if (e.key === 'ArrowRight') { e.preventDefault(); select((cur + 1) % items.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); select((cur - 1 + items.length) % items.length, true); }
      });
    });
    const initial = Math.max(0, items.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    requestAnimationFrame(() => moveInk(items[initial]));
    window.addEventListener('resize', () => moveInk(items.find((t) => t.getAttribute('aria-selected') === 'true') || items[0]));
    items.forEach((t, k) => { t.tabIndex = k === initial ? 0 : -1; });
    return { select };
  }
  function seg(el, { onChange } = {}) {
    const btns = $$('button[data-value]', el);
    const set = (v, fire = true) => {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
      if (fire) onChange?.(v, btns.find((b) => b.dataset.value === v));
    };
    btns.forEach((b) => b.addEventListener('click', () => set(b.dataset.value)));
    return {
      value: () => btns.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.value,
      set,
    };
  }

  /* ------------------------------------------------------------------
   * 進場、數字滾動
   * ------------------------------------------------------------------ */
  let revealIO = null;
  function reveal(root = document) {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); onRevealed(en.target); }
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
    }
    const vh = window.innerHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      // 初次載入已在視窗內者直接顯示，不做進場位移
      if (r.top < vh && r.bottom > 0) {
        el.classList.add('is-in', 'is-instant');
        onRevealed(el);
        requestAnimationFrame(() => el.classList.remove('is-instant'));
      } else {
        revealIO.observe(el);
      }
    });
  }
  function onRevealed(el) {
    const counters = el.matches('[data-count-to]') ? [el] : $$('[data-count-to]', el);
    counters.forEach(countUp);
    el.dispatchEvent(new CustomEvent('reveal', { bubbles: false }));
  }
  const countRaf = new WeakMap();
  const countCur = new WeakMap();
  function countUp(el) {
    cancelAnimationFrame(countRaf.get(el));
    // 從目前顯示中的數字接續（動畫進行中再觸發也不會跳回 0）；第一次從 0 開始
    const from = countCur.get(el) ?? 0;
    if (reduceMotion.matches) {
      const to = Number(el.dataset.countTo);
      el.textContent = fmt.num(to);
      countCur.set(el, to);
      return;
    }
    el.textContent = fmt.num(from);
    const t0 = performance.now(), dur = 900;
    const tick = (t) => {
      // 每一格都讀最新目標，連續觸發時不會停在舊值
      const to = Number(el.dataset.countTo);
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (to - from) * e);
      el.textContent = fmt.num(v);
      countCur.set(el, v);
      if (k < 1) countRaf.set(el, requestAnimationFrame(tick));
    };
    countRaf.set(el, requestAnimationFrame(tick));
  }

  /* ------------------------------------------------------------------
   * 全站搜尋
   * ------------------------------------------------------------------ */
  const search = {
    open() {
      const body = document.createElement('div');
      body.innerHTML = `<label class="search"><span class="sr-only">搜尋案件</span>${icon('search')}<input class="input" type="search" placeholder="案號、案名、起造人或地址" autocomplete="off"></label>
        <div class="search-results" role="list"></div>`;
      const input = $('input', body), results = $('.search-results', body);
      const render = () => {
        const q = input.value.trim().toLowerCase();
        const list = permits.filter((p) => !q || [p.id, caseNo(p), p.name, p.applicant, address(p), p.permitNo || ''].some((s) => s.toLowerCase().includes(q))).slice(0, 8);
        results.innerHTML = list.length ? list.map((p) => `<a href="${permitUrl(p.id)}" role="listitem">
            <span class="table__key">${p.id}</span><span class="table__title truncate">${esc(p.name)}</span>${stageChip(p.stage)}
            <span class="table__sub">${esc(p.applicant)}・${esc(address(p))}</span></a>`).join('')
          : emptyState({ title: '找不到符合的案件', text: '試試輸入案號末四碼，例如 0412。' });
      };
      input.addEventListener('input', render);
      render();
      const m = modal({ title: '搜尋案件', code: 'FIND', body });
      input.focus();
      return m;
    },
  };

  /* ------------------------------------------------------------------
   * 外殼：導覽 active、行動選單、時鐘、離開視窗暫停
   * ------------------------------------------------------------------ */
  function setNav(open) {
    const nav = $('#siteNav'), btn = $('[data-nav-toggle]');
    if (!nav || !btn) return;
    nav.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
  }
  function initShell() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav-tab').forEach((a) => {
      const on = (a.getAttribute('href') || '').split('?')[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const btn = $('[data-nav-toggle]');
    btn?.addEventListener('click', () => setNav(btn.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#siteNav, [data-nav-toggle]')) setNav(false);
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 960) setNav(false); });

    $$('[data-search]').forEach((b) => b.addEventListener('click', () => search.open()));
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !$('dialog[open]')) {
        e.preventDefault();
        search.open();
      }
    });

    const clocks = $$('[data-clock]');
    const tickClock = () => clocks.forEach((el) => { el.textContent = `PLOT ${fmt.clock(now())}`; });
    tickClock();
    if (clocks.length) setInterval(tickClock, 15000);

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((en) => en.target.classList.toggle('is-offscreen', !en.isIntersecting)));
      $$('[data-anim]').forEach((el) => io.observe(el));
    }
    document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('page-hidden', document.hidden));
  }

  /* ------------------------------------------------------------------
   * 匯出
   * ------------------------------------------------------------------ */
  window.App = {
    TODAY, now, days, addDays, fmt,
    DISC, DISC_MAP, STAGES, LAMPS, PEOPLE, ME, ARCHITECTS, FEATURED, TREND,
    permits, getPermit, counts, load, dueThisWeek, opinionsOf, timelineOf, noticeNo,
    caseNo, address, stageName, dueLabel, permitUrl, reviewUrl, param,
    commit, onChange, refreshCounts,
    esc, icon, lamp, lampRow, rev, stageChip, stageTrack, dueChip, disc, avatar, person, emptyState,
    plan, cloudPath, draw, penTrace, panZoom,
    toast, modal, openDialog, closeDialog, tabs, seg, search, reveal, countUp,
    reduceMotion,
  };

  document.addEventListener('DOMContentLoaded', () => {
    initShell();
    refreshCounts(false);
    document.documentElement.classList.add('reveal-ready');
    reveal();
    // 保底：任何原因沒觸發 IntersectionObserver，2.5 秒後全部顯示
    setTimeout(() => $$('[data-reveal]:not(.is-in)').forEach((el) => { el.classList.add('is-in'); onRevealed(el); }), 2500);
  });
})();
