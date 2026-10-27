/*
 * 澄港市 1999 市民熱線 · 陳情案件管理系統 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * 因為 inline script 比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒、外殼也已初始化。
 *
 * ── window.App ──────────────────────────────────────────────────────────
 * 時間（一律以 UTC+8 計算；「現在」= 2026-10-26（一）14:20，載入後隨真實時間往前走）
 *   App.now() → ms            App.T('10-26 14:06') → ms
 *   App.fmt.num / time / date / dateTime / day / full / dur / durShort / rel / slaHours
 *   App.isToday(ms) · App.param(name)（讀 URL query）
 *
 * 領域常數
 *   App.CATS        { pothole|noise|parking|light|litter|animal: {key, name, short, shape, sla(小時), unit, keywords} }
 *   App.CAT_KEYS    類別順序
 *   App.STATUS      { received|dispatched|bureau|field|replied|closed: {key, name, stage, shape, index} }
 *   App.FLOW        六階段 key 順序（受理 → 分類派案 → 局處承辦 → 區隊處理 → 回覆民眾 → 滿意度）
 *   App.UNITS       承辦單位 { works|lamp|epa|clean|traffic|animal|police|water: {org, name, full, short, officers[], cat} }
 *   App.DISTRICTS   [{name:'港埕區', short, code, pop, streets[], landmarks[], coastal}]
 *   App.PEOPLE      話務員 A03…/派案員 me、D05、D08 → {name, role}；App.ME = 目前使用者（周品妤，派案督導）
 *
 * 資料（只在記憶體中變動；重新整理即還原）
 *   App.DATA.cases     近 7 日約 220 件陳情，依受理時間新到舊（決定性亂數產生 + 12 件手寫重點案件，案號/人名/時間前後一致）
 *   App.DATA.featured  重點案件案號 {dog, noiseReturn, pothole, light, litter, hydrant, piling, fuqian, snake, pole, dumping, garage}
 *   App.DATA.defaultCaseId  case.html 沒帶 ?id= 時顯示的案件（文昌街坑洞，區隊處理中）
 *   App.DATA.calls     今日話務 {hourly[今日已過小時], forecast[24], online, seats, avgWait(秒), abandon(%), avgTalk(秒)}
 *   App.DATA.month     近 30 日彙總（不含近 7 日明細）{byCat, units, satisfaction}
 *   App.DATA.notices   通知
 *   App.getCase(id) · App.unitOf(c) · App.district(name) · App.person(id)
 *   App.sla(c) → {state:'ok'|'soon'|'over'|'done'|'late', remain, frac, label, short}
 *   App.isOpen(c)（尚未回覆民眾）· App.isActive(c)（已派案～區隊處理）
 *   App.PHONE_RE（手機/市話格式）· App.maskPhone(raw) → '0935-***-772' | '07-***4567' | ''（格式不符）
 *   App.count(key) → number；key：all|today|received|active|soon|over|replied|closed|callback|queue|notices|
 *                    cat:<key>|district:<名稱>|status:<key>
 *   App.queue() → [{c, kind:'dispatch'|'reassign'|'urge'|'callback', reason}]（待我處理，依急迫度排序）
 *   App.stats(range:'today'|'7d'|'30d') → {byCat, byDistrict, units:{key:{done,onTime,rate,avgH,open}}, slaRate, satisfaction}
 *   App.classify(text) → [{cat, score(0~1), hits[]}]（關鍵字規則推薦類別）
 *   App.route(cat, text) → [{unit, reason, primary}]（推薦承辦單位）
 *   App.teamFor(unitKey, districtName) → 區隊名稱
 *   App.findSimilar({cat, district, address, text, excludeId}, limit) → [{c, score, reasons[]}]（相似/重複案件）
 *   App.transcript(c) → [{who:'agent'|'caller', t, text}] | null（非電話來源回傳 null）
 *   App.replyVars(c) → {案號, 陳情人, 地點, 類別, 承辦單位, 處理區隊, 處理結果, 完成時間, 處理時限}
 *
 * 異動（每個都會觸發 'change' 事件，並回傳 undo()；undo 也會再觸發 'change'）
 *   App.createCase({phone, name, desc, cat, district, address, channel, priority, title}) → {c, undo}
 *   App.dispatch(ids, {unit, team, note}) → undo        派案 / 改派（received → dispatched）
 *   App.urge(id, note) → undo                           催辦（寫入紀錄、urged + 1）
 *   App.setStatus(id, status, {note, actor, result}) → undo   局處承辦 / 區隊處理 / 回覆等流轉
 *   App.reply(id, text) → undo                          回覆民眾（→ replied）
 *   App.closeWithRating(id, rating, feedback) → undo    回訪結案（→ closed）
 *   App.on('change', fn({type, ids})) → off()           也會在 document 發出 'app:change' CustomEvent
 *   [data-count="key"] 元素會自動以 App.count(key) 更新文字；為 0 時加上 data-zero
 *
 * 形狀與動態引擎
 *   App.shape.names · App.shape.path(name) · App.shape.svg(name, {cls, label, rotate})
 *   App.shape.morph(svg或path, name, {spring:'bouncy', rotate:度數增量})   狀態改變時形狀插值（含旋轉）
 *   <svg class="shape"><path data-shape="cookie12"/></svg> 會在載入時自動補上 d 與 fill
 *   形狀：circle oval pill squircle slanted cookie4 cookie6 cookie9 cookie12 sunny verySunny softBurst burst boom
 *         clover4 clover8 flower pentagon triangle gem diamond heart
 *   App.spring.run({spring, onUpdate(x), onDone}) → {stop()}；App.spring.easing(name) → linear() 字串（給 WAAPI）
 *   App.ticker.add(el, fn(t, dt)) → remove()   共用 rAF；元素離開視窗或分頁隱藏時自動暫停
 *   App.wavy(el, {value, target, amplitude, wavelength, thickness, speed}) → {set(value, opts)}   波浪線性進度
 *   App.wavyRing(el, {value, size, thickness, waves, amplitude}) → {set(value)}                波浪環形進度
 *   App.odometer(el, value, {format})   滾輪數字（連續快速呼叫只會以最新值重繪）
 *   App.countTo(el, value, {format, duration})   數字滾動（每格讀最新目標值）
 *   App.loader({size}) → HTMLElement   M3 形狀循環載入指示
 *   App.cityMap(container, {values, mode:'heat'|'select', selected, onSelect(name)}) → {update(values), select(name), highlight(name)}
 *                  heat：依數值著色、前兩名脈動、節點為 link；select：radiogroup，選中區塊變主色（受理表單選行政區用）
 *
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(s) · App.icon(name, cls) · App.catIcon(cat, cls) · App.catTag(cat)
 *   App.statusBadge(status, {lg}) · App.setStatusBadge(el, status)（形狀 morph + 標籤翻轉 + 彈跳）
 *   App.slaChip(c)（每 30 秒與資料異動時自動更新）· App.avatar(name, {size:'sm'|'lg', tone})
 *   App.stepper(c) · App.emptyState({title, text, shape}) · App.rating(el, {value, readonly, onChange}) → {set(v)}
 *
 * 互動元件
 *   App.toast(msg, {sub, tone:'success'|'error', action:{label, onClick}, duration, shape})
 *   App.modal({title, sub, icon, shape, body, actions:[{label, variant, icon, onClick(api) → false 可阻止關閉}], size, onClose}) → {el, body, close()}
 *   App.dispatchDialog(ids)（派案 / 改派對話框，cases.html 多選派案與 case.html 改派共用）
 *   App.callbackDialog(id)（回訪滿意度對話框）· App.urgeCase(id)（催辦 + toast 復原）
 *   App.popover(anchor, {content, className, onOpen(el)}) → {el, close()}
 *   App.tabs(tablist, {onChange(index, tab)}) → {select(i)}
 *   App.segmented(group, {onChange(value, btn)}) → {value(), set(value)}（.btn-group 內 button[data-value]）
 *   App.reveal(root)（重新掃描動態插入的 [data-reveal]）· App.hydrate(root)（補上 data-shape / data-icon）
 *   App.openQuickIntake() / App.closeQuickIntake()（FAB → sheet）
 *
 * 自動行為（不需呼叫）
 *   導覽 active 標示（rail、drawer、footer 依檔名加 aria-current="page"）、行動版選單（[data-drawer-open]）、
 *   搜尋（form[data-search]，/ 鍵聚焦）、通知（[data-notify]）、個人選單（[data-profile]）、值班切換（[data-duty]）、
 *   FAB（[data-fab]）捲動時收合、頂列捲動變色、[data-reveal] 進場、[data-anim] / .panel / .page-head 離開視窗暫停循環動畫、
 *   分頁隱藏暫停（動態插入的新容器呼叫 App.watchAnim(root)）、
 *   [data-count] 計數、[data-sla] 每 30 秒更新、[data-clock] 顯示現在時刻 HH:MM、[data-today] 顯示今天日期、rail 標誌 hover morph
 *
 * 案件欄位
 *   id, cat, status, title, desc, district, address, pole?, geo{x,y}(0~1), caller{name, phone, callback},
 *   channel('電話'|'App'|'網站'|'LINE'), agent(話務員 id), priority('normal'|'urgent'), created, due,
 *   unit(承辦單位 key|null), officer, team, log[{at, type, actor, note}], repliedAt, closedAt, result, reply,
 *   rating(1~5|null), feedback, callbackBy('me'|'A21'|null), returned{at, by, officer, reason}|null, urged, repeat, transcript?
 */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  /* ===================================================================
     基礎工具
     =================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mulberry32 = seed => () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  App.esc = esc;
  App.$ = $;
  App.$$ = $$;
  App.reduceMotion = () => reduceMotion.matches;
  App.param = name => new URLSearchParams(location.search).get(name);

  /* ===================================================================
     時間
     =================================================================== */
  const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3, TZ = 8 * HOUR;
  const BASE_NOW = Date.UTC(2026, 9, 26, 6, 20); // 2026-10-26 14:20（UTC+8）
  const loadedAt = performance.now();
  App.now = () => BASE_NOW + (performance.now() - loadedAt);
  const T = s => {
    const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
    return Date.UTC(2026, +m[1] - 1, +m[2], +m[3] - 8, +m[4]);
  };
  App.T = T;
  const parts = ms => {
    const d = new Date(ms + TZ);
    return { mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
  };
  const pad = n => String(n).padStart(2, '0');
  const WD = '日一二三四五六';
  const dayKey = ms => Math.floor((ms + TZ) / DAY);
  App.isToday = ms => dayKey(ms) === dayKey(App.now());
  const durShort = ms => {
    const m = Math.max(0, Math.round(Math.abs(ms) / MIN));
    const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
    if (d) return `${d} 天 ${h} 時`;
    if (h) return `${h} 時 ${pad(mm)} 分`;
    return `${mm} 分`;
  };
  const fmt = {
    num: n => Math.round(n).toLocaleString('en-US'),
    dec: (n, k = 1) => Number(n).toFixed(k),
    time: ms => { const p = parts(ms); return `${pad(p.h)}:${pad(p.mi)}`; },
    date: ms => { const p = parts(ms); return `${p.mo}/${p.d}`; },
    dateTime: ms => { const p = parts(ms); return `${p.mo}/${p.d} ${pad(p.h)}:${pad(p.mi)}`; },
    day: ms => { const p = parts(ms); return `${p.mo} 月 ${p.d} 日 星期${WD[p.wd]}`; },
    full: ms => { const p = parts(ms); return `2026 年 ${p.mo} 月 ${p.d} 日（${WD[p.wd]}）${pad(p.h)}:${pad(p.mi)}`; },
    dur: ms => {
      const m = Math.round(Math.abs(ms) / MIN);
      const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60;
      if (d) return `${d} 天 ${h} 小時`;
      if (h) return `${h} 小時 ${mm} 分`;
      return `${mm} 分鐘`;
    },
    durShort,
    rel: ms => {
      const diff = App.now() - ms;
      if (diff < MIN) return '剛剛';
      if (diff < HOUR) return `${Math.floor(diff / MIN)} 分鐘前`;
      if (diff < DAY) return `${Math.floor(diff / HOUR)} 小時前`;
      if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
      return fmt.date(ms);
    },
    slaHours: h => (h >= 48 && h % 24 === 0 ? `${h / 24} 天` : `${h} 小時`),
  };
  App.fmt = fmt;

  /* ===================================================================
     領域常數
     =================================================================== */
  const CATS = {
    pothole: {
      name: '道路坑洞', short: '坑洞', shape: 'cookie4', sla: 72, unit: 'works',
      keywords: [['坑洞', 3], ['坑', 2], ['凹陷', 2], ['下陷', 2], ['龜裂', 2], ['隆起', 2], ['路面', 1], ['柏油', 2], ['人孔蓋', 3], ['破洞', 2], ['不平', 1], ['回填', 2], ['鋼筋', 1], ['積水', 1], ['顛簸', 1]],
    },
    noise: {
      name: '噪音', short: '噪音', shape: 'sunny', sla: 12, unit: 'epa',
      keywords: [['噪音', 3], ['很吵', 2], ['吵', 2], ['擴音', 2], ['音量', 2], ['卡拉', 2], ['施工', 1], ['敲', 2], ['呼嘯', 2], ['排氣管', 2], ['冷氣主機', 2], ['室外機', 2], ['機台', 1], ['半夜', 1], ['深夜', 1], ['失眠', 2], ['睡不著', 2], ['聲音', 1], ['打樁', 2], ['分貝', 2]],
    },
    parking: {
      name: '違規停車', short: '違停', shape: 'pill', sla: 4, unit: 'traffic',
      keywords: [['違停', 3], ['違規停車', 3], ['停車', 2], ['紅線', 2], ['黃線', 2], ['擋住', 1], ['占用', 2], ['佔用', 2], ['車位', 2], ['停車格', 2], ['人行道', 1], ['消防栓', 2], ['車庫', 2], ['併排', 2], ['臨停', 2], ['車主', 1], ['拖吊', 2]],
    },
    light: {
      name: '路燈故障', short: '路燈', shape: 'gem', sla: 120, unit: 'lamp',
      keywords: [['路燈', 3], ['燈桿', 3], ['不亮', 2], ['熄滅', 2], ['閃爍', 2], ['照明', 2], ['很暗', 1], ['燈', 1], ['感光', 2]],
    },
    litter: {
      name: '環境髒亂', short: '髒亂', shape: 'clover4', sla: 48, unit: 'clean',
      keywords: [['垃圾', 3], ['髒亂', 3], ['異味', 2], ['臭', 2], ['堆置', 2], ['廢棄', 2], ['水溝', 2], ['側溝', 2], ['菸蒂', 2], ['落葉', 1], ['蚊蟲', 1], ['老鼠', 2], ['狗糞', 2], ['傾倒', 2], ['廢棄物', 2], ['床墊', 1], ['沙發', 1], ['清運', 2]],
    },
    animal: {
      name: '動物救援', short: '動物', shape: 'heart', sla: 6, unit: 'animal',
      keywords: [['狗', 2], ['犬', 2], ['貓', 2], ['受傷', 1], ['受困', 2], ['蛇', 3], ['鳥', 2], ['動物', 2], ['流浪', 2], ['救援', 2], ['咬', 2], ['幼貓', 2], ['猴', 2], ['虐待', 2], ['流血', 1]],
    },
  };
  const CAT_KEYS = Object.keys(CATS);
  CAT_KEYS.forEach(k => { CATS[k].key = k; });

  const STATUS = {
    received: { name: '待派案', stage: '受理', shape: 'circle' },
    dispatched: { name: '已派案', stage: '分類派案', shape: 'pentagon' },
    bureau: { name: '局處承辦', stage: '局處承辦', shape: 'cookie6' },
    field: { name: '區隊處理', stage: '區隊處理', shape: 'cookie9' },
    replied: { name: '已回覆', stage: '回覆民眾', shape: 'clover8' },
    closed: { name: '已結案', stage: '滿意度', shape: 'cookie12' },
  };
  const FLOW = Object.keys(STATUS);
  FLOW.forEach((k, i) => { STATUS[k].key = k; STATUS[k].index = i; });

  const DISTRICTS = [
    { name: '港埕區', short: '港埕', code: 'GC', pop: 18.2, coastal: true, police: '漁港派出所', streets: ['港埕路', '漁人碼頭街', '燈塔路', '船廠街', '海關路'], landmarks: ['港埕漁市場', '第三號碼頭', '港埕轉運站'] },
    { name: '北岸區', short: '北岸', code: 'BA', pop: 14.6, coastal: true, police: '觀潮派出所', streets: ['北岸一路', '北岸三路', '防風林道', '觀潮街', '長堤路'], landmarks: ['北岸海水浴場', '北岸國小', '觀潮公園'] },
    { name: '舊城區', short: '舊城', code: 'JC', pop: 16.8, coastal: false, police: '鼓樓派出所', streets: ['文昌街', '米市街', '府前路', '書院路', '鼓樓街'], landmarks: ['舊城文化市場', '鼓樓廣場', '府前圓環'] },
    { name: '山腳區', short: '山腳', code: 'SJ', pop: 9.4, coastal: false, police: '茶園派出所', streets: ['山腳路', '茶園街', '林場一路', '登山口道', '竹圍巷'], landmarks: ['山腳運動公園', '林場停車場', '茶園步道口'] },
    { name: '新灣區', short: '新灣', code: 'XW', pop: 21.5, coastal: true, police: '金帆派出所', streets: ['新灣大道', '灣岸一路', '科技二路', '海濱路', '金帆街'], landmarks: ['新灣轉運中心', '灣岸公園', '新灣購物城'] },
    { name: '鹽田區', short: '鹽田', code: 'YT', pop: 7.9, coastal: true, police: '潟湖派出所', streets: ['鹽田路', '曬鹽巷', '鹽埕二街', '潟湖路', '風車街'], landmarks: ['鹽田生態館', '潟湖自行車道', '鹽田國中'] },
    { name: '溪洲區', short: '溪洲', code: 'XZ', pop: 12.3, coastal: false, police: '渡船頭派出所', streets: ['溪洲路', '堤防路', '沙洲街', '渡船頭街', '中洲二路'], landmarks: ['溪洲河濱公園', '渡船頭廣場', '溪洲果菜市場'] },
    { name: '雲嶺區', short: '雲嶺', code: 'YL', pop: 4.1, coastal: false, police: '杉林派出所', streets: ['雲嶺路', '雲嶺產業道路', '霧林巷', '杉林街', '嶺頂路'], landmarks: ['雲嶺遊客中心', '嶺頂觀景台', '杉林社區活動中心'] },
  ];
  const DISTRICT_BY_NAME = Object.fromEntries(DISTRICTS.map(d => [d.name, d]));
  const ZH_NUM = ['一', '二', '三'];
  const zoneOf = name => DISTRICTS.findIndex(d => d.name === name) % 3;

  const UNITS = {
    works: { org: '工務局', name: '養護工程處', officers: ['陳志明', '葉怡君'], cat: 'pothole', team: d => `${d.short}養護分隊` },
    lamp: { org: '工務局', name: '路燈管理所', officers: ['鄭雅文', '高嘉宏'], cat: 'light', team: d => `路燈維護${ZH_NUM[zoneOf(d.name)]}班` },
    epa: { org: '環境保護局', name: '稽查大隊', officers: ['吳珮瑜', '曾國峰'], cat: 'noise', team: d => `稽查大隊第${ZH_NUM[zoneOf(d.name)]}中隊` },
    clean: { org: '環境保護局', name: '環境清潔隊', officers: ['蔡宗霖', '洪美玲'], cat: 'litter', team: d => `${d.short}區清潔隊` },
    traffic: { org: '警察局', name: '交通警察大隊', officers: ['李承翰', '江柏毅'], cat: 'parking', team: d => `${d.short}分局交通組` },
    animal: { org: '農業局', name: '動物保護處', officers: ['王思涵', '簡廷宇'], cat: 'animal', team: d => `動物救援${['北', '中', '南'][zoneOf(d.name)]}區組` },
    police: { org: '警察局', name: '轄區分局', officers: ['劉建廷'], cat: null, team: d => `${d.short}分局${d.police}` },
    water: { org: '工務局', name: '水利工程處', officers: ['邱子晴'], cat: null, team: () => '下水道維護隊' },
  };
  Object.entries(UNITS).forEach(([k, u]) => { u.key = k; u.full = `${u.org} ${u.name}`; u.short = u.name; });
  /** 六個主要承辦單位，與類別一一對應（處理時效面板用） */
  const MAIN_UNITS = CAT_KEYS.map(k => CATS[k].unit);

  const PEOPLE = {
    me: { name: '周品妤', role: '派案督導', team: '1999 話務中心 派案組', seat: 'D-02', shift: 'B 班 08:00–16:30' },
    D05: { name: '何俊賢', role: '派案員（夜班）' },
    D08: { name: '楊雅雯', role: '派案員（假日班）' },
    A03: { name: '黃郁婷', role: '話務員' },
    A07: { name: '許芷晴', role: '話務員' },
    A09: { name: '鄭博文', role: '話務員' },
    A12: { name: '林冠宇', role: '話務員' },
    A15: { name: '張家豪', role: '話務員' },
    A21: { name: '蘇若涵', role: '話務員' },
  };
  Object.entries(PEOPLE).forEach(([k, p]) => { p.id = k; });
  App.CATS = CATS; App.CAT_KEYS = CAT_KEYS; App.STATUS = STATUS; App.FLOW = FLOW;
  App.UNITS = UNITS; App.MAIN_UNITS = MAIN_UNITS; App.DISTRICTS = DISTRICTS; App.PEOPLE = PEOPLE; App.ME = PEOPLE.me;
  App.district = name => DISTRICT_BY_NAME[name];
  App.person = id => PEOPLE[id];
  App.teamFor = (unitKey, districtName) => UNITS[unitKey].team(DISTRICT_BY_NAME[districtName]);

  /* ===================================================================
     資料：重點案件（手寫）+ 決定性亂數產生
     =================================================================== */
  const STAGE_ACTION = {
    pothole: ['到場勘查，已設置警示錐並排定修補', '坑洞已以熱拌瀝青修補完成，路面恢復平整'],
    noise: ['稽查員到場量測噪音', '經量測超過管制標準，已依法告發並要求改善'],
    parking: ['員警到場處理', '已依法舉發，車輛已移置'],
    light: ['維修班到場檢測線路與燈具', '已更換燈具與電源驅動器，恢復照明'],
    litter: ['清潔隊到場清運', '已清運完畢，並列入加強巡查點'],
    animal: ['救援人員出勤', '動物已送至動物之家收容並安排獸醫檢查'],
  };
  // 回訪意見：通用句 + 各類別的 5 分感謝句（避免路燈案出現「謝謝清潔隊」這種錯置）
  const FEEDBACK = {
    5: ['隔天就處理好了，效率很好！', '處理人員很客氣，還主動回電說明。', '比想像中快很多，謝謝。'],
    4: ['有處理，但希望能更早通知進度。', '處理結果滿意，只是等了比較久。', '有改善，希望之後定期巡查。'],
    3: ['有來看過，但問題只解決一半。', '回覆內容有點制式。'],
    2: ['到現在還是常常發生，希望加強巡查。', '等很久才有人來。'],
    1: ['來了也沒有改善，覺得被敷衍。'],
  };
  const FEEDBACK_CAT = {
    pothole: '路面補得很平整，騎車安心多了。',
    noise: '晚上終於可以好好睡覺了，謝謝。',
    parking: '員警很快就到了，感謝。',
    light: '路燈修好後晚上散步安心多了。',
    litter: '謝謝清潔隊，巷子終於乾淨了。',
    animal: '狗狗有被好好照顧，謝謝救援人員。',
  };

  // 產生案件時使用的範本：{t: 標題, d: 描述}；{p} 會換成地點
  const TEMPLATES = {
    pothole: [
      { t: '{p}路面坑洞，機車險滑倒', d: '民眾表示{p}外側車道出現直徑約 40 公分的坑洞，雨後積水看不出深淺，已有機車騎士閃避不及差點摔車，希望盡快修補。' },
      { t: '{p}人孔蓋周邊下陷', d: '{p}的人孔蓋與路面落差約 3 公分，車輛經過時發出很大的撞擊聲，夜間騎機車容易顛簸，請派員檢修。' },
      { t: '{p}柏油龜裂隆起', d: '{p}一帶柏油路面大範圍龜裂、局部隆起，民眾騎單車經過時輪胎卡進裂縫，擔心有人受傷。' },
      { t: '{p}管線施工後未回填平整', d: '日前{p}有管線挖掘施工，完工後只用碎石簡單回填，現在明顯凹陷，車輛經過時碎石四散。' },
      { t: '{p}公車站前路面坑洞', d: '{p}公車站牌前有連續兩個坑洞，公車進站時乘客下車容易踩空，長者行動不便尤其危險。' },
      { t: '{p}路面破洞露出鋼筋', d: '{p}路面破了一個洞，裡面的鋼筋都露出來了，晚上燈光不足很難看到。' },
    ],
    noise: [
      { t: '{p}夜間施工噪音', d: '{p}的工地晚上 10 點以後仍在施工，機具運轉與敲擊聲很大，附近住戶無法入睡，希望派員稽查。' },
      { t: '{p}店家冷氣主機運轉噪音', d: '{p}一樓店家的冷氣室外機對著住家窗戶，24 小時運轉發出低頻嗡嗡聲，民眾已經失眠好幾天。' },
      { t: '{p}卡拉 OK 擴音過大', d: '{p}附近店家播放卡拉 OK 到半夜，音量很大，門窗關起來還是聽得很清楚。' },
      { t: '{p}改裝機車深夜呼嘯', d: '每天深夜 12 點過後都有改裝排氣管的機車在{p}一帶來回呼嘯，聲音非常刺耳。' },
      { t: '{p}工廠夜間機台噪音', d: '{p}旁的工廠夜間機台持續運轉，金屬撞擊聲和震動傳到住家，從晚上 9 點吵到清晨。' },
      { t: '{p}清晨卸貨噪音', d: '{p}的超市每天清晨 5 點卸貨，推車與貨車倒車警示聲吵醒附近住戶。' },
    ],
    parking: [
      { t: '{p}紅線違停擋住路口視線', d: '{p}轉角紅線上長期有自小客車違停，擋住路口視線，行人過馬路時看不到來車。' },
      { t: '{p}車輛占用身障車位', d: '{p}的身障專用停車格被一輛未掛身障證明的車輛占用超過兩小時。' },
      { t: '{p}違停堵住車庫出入口', d: '有車輛停在{p}住家車庫門口，民眾要開車出門無法出入，也聯絡不到車主。' },
      { t: '{p}機車停放人行道', d: '{p}人行道上停滿機車，推嬰兒車和坐輪椅的人只能走到車道上，非常危險。' },
      { t: '{p}公車站違停', d: '{p}公車站前常有車輛臨停甚至長時間停放，公車無法靠站，乘客要走到車道中間上車。' },
      { t: '{p}消防栓前違停', d: '{p}消防栓前停了一輛貨車，民眾擔心萬一發生火警消防車無法取水。' },
    ],
    light: [
      { t: '{p}路燈不亮已三天', d: '{p}的路燈（燈桿編號 {pole}）已經連續三個晚上沒亮，那一段路很暗，晚上走路很害怕。' },
      { t: '{p}路燈閃爍不停', d: '{p}的路燈（燈桿編號 {pole}）整晚一直閃爍，影響附近住戶睡眠，也讓開車的人分心。' },
      { t: '{p}路燈白天未熄滅', d: '{p}的路燈（燈桿編號 {pole}）白天也一直亮著，請派員檢查感光開關。' },
      { t: '{p}燈桿傾斜疑有倒塌風險', d: '{p}的燈桿（編號 {pole}）明顯傾斜，基座附近地面有裂痕，擔心颱風來時倒塌。' },
      { t: '{p}整排路燈熄滅', d: '{p}整排約 6 盞路燈同時熄滅，整段路伸手不見五指，可能是線路問題。' },
    ],
    litter: [
      { t: '{p}空地堆置廢棄家具', d: '{p}旁的空地被人堆了舊沙發、床墊和衣櫃，已經放了快一個禮拜，開始有蚊蟲。' },
      { t: '{p}垃圾車收運後遺留垃圾', d: '垃圾車經過{p}後，路邊還留了好幾袋破掉的垃圾，湯汁流滿地，氣味很重。' },
      { t: '{p}水溝阻塞發出異味', d: '{p}的側溝被落葉和垃圾塞住，積水發臭，最近還看到老鼠出沒。' },
      { t: '{p}遭人傾倒裝修廢棄物', d: '有人趁夜在{p}傾倒裝修廢棄物，磁磚、木板和水泥袋占了半條巷子。' },
      { t: '{p}廢棄機車長期停放', d: '{p}有一輛沒有車牌、輪胎已經消風的機車停了好幾個月，車廂內還被丟滿垃圾。' },
      { t: '{p}狗糞未清理', d: '{p}人行道上常有狗糞沒人清理，早上上學的小朋友常常踩到。' },
    ],
    animal: [
      { t: '{p}受傷犬隻需要救援', d: '{p}有一隻中型犬後腳受傷無法行走，躲在機車底下，民眾擔心牠被車撞到。' },
      { t: '{p}幼貓受困排水溝', d: '{p}的排水溝裡傳出小貓叫聲已經一個早上，民眾看到至少兩隻幼貓卡在溝蓋下面。' },
      { t: '{p}蛇類闖入民宅', d: '民眾在{p}住家後院發現一條約 150 公分的蛇，躲在花盆後面，家中有長輩和小孩很害怕。' },
      { t: '{p}流浪犬群追逐行人', d: '{p}附近有五、六隻流浪犬聚集，早上追著騎機車和走路的人吠叫，已經有人被嚇到摔倒。' },
      { t: '{p}擱淺受傷海鳥', d: '民眾在{p}海邊發現一隻翅膀受傷的海鳥，無法飛行，被浪打上岸。', coastal: true },
      { t: '{p}犬隻遭短鐵鍊勒傷', d: '{p}有一戶人家的狗長期用很短的鐵鍊綁著，脖子已經勒出傷口，民眾擔心有虐待情形。' },
    ],
  };
  const SURNAMES = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯翁魏孫戴';

  // 手寫重點案件：完整紀錄與逐字稿，作為各頁示範主角
  const FEATURED = [
    {
      key: 'dog', cat: 'animal', district: '新灣區', address: '新灣大道 220 號 新灣購物城 B 區停車場', created: '10-26 13:58',
      title: '新灣購物城停車場受傷犬隻需要救援', priority: 'urgent', channel: '電話', agent: 'A07',
      desc: '停車場 B 區 B12 柱子旁有一隻米白色中型犬，左後腳流血、無法站立，一直躲在車底下。民眾擔心牠被進出的車輛輾到，已先用紙箱在旁邊圍起來，希望盡快派人救援。',
      caller: { name: '黃小姐', phone: '0928-***-614', callback: true }, geo: { x: .62, y: .48 },
      log: [['received', '10-26 13:58', 'A07', '來電受理，通話 1 分 21 秒；民眾留在現場等候']],
      transcript: [
        ['agent', '00:00', '澄港市 1999 市民熱線您好，我是 07 號話務員許芷晴，請問有什麼可以協助您？'],
        ['caller', '00:05', '你好，新灣購物城的停車場有一隻狗受傷了，流很多血。'],
        ['agent', '00:11', '好的，請您先不要直接碰觸牠。請問是在停車場哪一區？'],
        ['caller', '00:16', 'B 區，靠近 B12 那根柱子，牠躲在一台車底下。'],
        ['agent', '00:24', '了解。狗狗大概多大、什麼顏色？有沒有戴項圈？'],
        ['caller', '00:30', '中型的，米白色，沒看到項圈。左後腳一直在流血，站不起來。'],
        ['agent', '00:41', '謝謝您。現場車輛進出多嗎？'],
        ['caller', '00:45', '蠻多的，我先拿紙箱在旁邊圍起來，怕有車子開過去。'],
        ['agent', '00:52', '這樣做很好。我會以緊急案件轉請動物保護處派救援人員過去，處理時限是 6 小時，通常會更快。救援人員可能會打給您確認位置，方便接聽嗎？'],
        ['caller', '01:08', '可以，我會在這邊等。'],
        ['agent', '01:12', '案號是 {id}，謝謝您的熱心。'],
      ],
    },
    {
      key: 'noiseReturn', cat: 'noise', district: '舊城區', address: '鼓樓街 38 巷 12 號', created: '10-26 09:12',
      title: '鼓樓街住宅樓上每日清晨敲擊噪音', channel: '電話', agent: 'A12',
      desc: '樓上住戶每天清晨 6 點就開始敲打、拖拉重物，持續一個多小時，已經連續兩個禮拜。管委會勸導過也沒有改善，家中長輩被吵到無法休息。',
      caller: { name: '李先生', phone: '0912-***-305', callback: true }, geo: { x: .44, y: .36 },
      returned: { at: '10-26 11:40', by: '環境保護局 稽查大隊', officer: '吳珮瑜', reason: '經電話了解屬住宅內人為敲擊、拖拉聲響，非噪音管制法稽查範圍，建請改派警察局轄區分局處理。' },
      log: [
        ['received', '10-26 09:12', 'A12', '來電受理，通話 1 分 12 秒'],
        ['dispatched', '10-26 09:20', 'me', '派至 環境保護局 稽查大隊'],
        ['bureau', '10-26 09:48', 'officer:吳珮瑜', '局處接案，電話聯繫陳情人了解狀況'],
        ['return', '10-26 11:40', 'officer:吳珮瑜', '退件：住宅人為噪音非本局權責，建請改派警察局轄區分局'],
      ],
      transcript: [
        ['agent', '00:00', '1999 市民熱線您好，我是 12 號話務員林冠宇。'],
        ['caller', '00:04', '你好，我要檢舉噪音。我樓上每天早上六點就開始敲敲打打，已經兩個禮拜了。'],
        ['agent', '00:12', '了解，請問是什麼樣的聲音？像是施工、機器，還是生活上的敲擊聲？'],
        ['caller', '00:18', '就是敲東西、拖椅子拖桌子那種，咚咚咚的，一個多小時。'],
        ['agent', '00:27', '請問地址是？'],
        ['caller', '00:30', '舊城區鼓樓街 38 巷 12 號，我住 3 樓，吵的是 4 樓。'],
        ['agent', '00:38', '有跟管委會或對方反映過嗎？'],
        ['caller', '00:42', '管委會貼過公告，也去敲過門，都沒用。我媽媽八十幾歲，每天都被吵醒。'],
        ['agent', '00:52', '辛苦了。我會先將案件轉請環保局稽查大隊了解，若屬其他單位權責會再改派，處理結果會以電話回覆您。'],
        ['caller', '01:05', '好，麻煩你們。'],
        ['agent', '01:08', '案號是 {id}，謝謝您的來電。'],
      ],
    },
    {
      key: 'pothole', cat: 'pothole', district: '舊城區', address: '文昌街與米市街口（往米市街方向）', created: '10-25 21:47',
      title: '文昌街與米市街口大型坑洞，機車險摔車', channel: '電話', agent: 'A12', repeat: 2,
      desc: '文昌街往米市街方向、路口斑馬線前的外側車道有一個大坑洞，直徑大概五、六十公分，下雨積水根本看不到。剛剛前面一台機車騎過去整個彈起來，差點摔車。這個坑上個月就報過一次，補完又破了。',
      caller: { name: '陳先生', phone: '0935-***-772', callback: false }, geo: { x: .52, y: .58 },
      unit: 'works', officer: '陳志明', team: '舊城養護分隊',
      log: [
        ['received', '10-25 21:47', 'A12', '來電受理，通話 1 分 18 秒；同地點 30 日內第 3 次陳情'],
        ['dispatched', '10-25 21:58', 'D05', '派至 工務局 養護工程處；註記重複陳情，請優先處理'],
        ['bureau', '10-26 08:12', 'officer:陳志明', '局處接案，交辦 舊城養護分隊，列為優先案件'],
        ['field', '10-26 09:34', 'team', '到場勘查：坑洞約 60×45 公分、深 8 公分，已設置警示錐，排定今日 15:00 以熱拌瀝青刨鋪修補'],
      ],
      transcript: [
        ['agent', '00:00', '澄港市 1999 市民熱線您好，我是 12 號話務員林冠宇，很高興為您服務。'],
        ['caller', '00:06', '你好，我要報路面的坑洞，文昌街這邊很危險。'],
        ['agent', '00:10', '了解，請問是文昌街哪一段？附近有沒有明顯的門牌或路口？'],
        ['caller', '00:15', '就是文昌街跟米市街的路口，往米市街方向，斑馬線前面外側車道。'],
        ['agent', '00:24', '好的，請問坑洞大概多大？目前有積水或造成事故嗎？'],
        ['caller', '00:29', '大概五、六十公分吧，下雨積水看不到深淺。剛剛前面一台機車騎過去整個彈起來，差點摔車。'],
        ['agent', '00:41', '謝謝您提供。系統顯示同一個路口上個月也有民眾反映過，這次會註記為重複陳情，請養護單位優先處理。'],
        ['caller', '00:52', '對，上個月就報過了，補完又破，可以請他們補好一點嗎？'],
        ['agent', '00:58', '會把您的意見一併轉達。處理時限是 72 小時，完成後會以簡訊回覆，請問用您來電的這支手機可以嗎？'],
        ['caller', '01:06', '可以，就這支。'],
        ['agent', '01:10', '好的，案號是 {id}。夜間騎車請小心，謝謝您的來電。'],
      ],
    },
    {
      key: 'light', cat: 'light', district: '北岸區', address: '長堤路與防風林道口', pole: 'BA-0417', created: '10-24 19:20',
      title: '長堤路防風林道口路燈不亮', channel: '電話', agent: 'A09',
      desc: '長堤路與防風林道口的路燈（燈桿編號 BA-0417）已經不亮好幾天，那邊晚上很多人去海堤散步，整段路很暗，上週還有人在那裡跌倒。',
      caller: { name: '吳小姐', phone: '0921-***-118', callback: true }, geo: { x: .38, y: .3 },
      unit: 'lamp', officer: '鄭雅文', team: '路燈維護二班', callbackBy: 'me',
      log: [
        ['received', '10-24 19:20', 'A09', '來電受理，通話 2 分 06 秒'],
        ['dispatched', '10-24 19:31', 'D08', '派至 工務局 路燈管理所'],
        ['bureau', '10-25 08:40', 'officer:鄭雅文', '局處接案，交辦 路燈維護二班'],
        ['field', '10-25 14:05', 'team', '維修班到場檢測，燈具電源驅動器燒毀'],
        ['replied', '10-26 11:05', 'officer:鄭雅文', '已更換 LED 燈具與電源驅動器，恢復照明；已簡訊回覆民眾'],
      ],
      result: '已更換 LED 燈具與電源驅動器，恢復照明',
      reply: '吳小姐您好：您於 10/24 反映長堤路與防風林道口路燈（BA-0417）不亮一事，路燈維護二班已於 10/26 更換 LED 燈具與電源驅動器，目前已恢復照明。如再有異常，歡迎隨時撥打 1999。澄港市政府工務局 路燈管理所 敬上',
    },
    {
      key: 'litter', cat: 'litter', district: '溪洲區', address: '堤防路 溪洲河濱公園入口', created: '10-26 08:35',
      title: '河濱公園入口遭傾倒裝修廢棄物', channel: 'App', agent: 'A15',
      desc: '有人在河濱公園入口旁傾倒裝修廢棄物，有木板、磁磚和好幾包水泥袋，擋住一半的自行車道，晚上騎車經過很危險。（附照片 3 張）',
      caller: { name: '游先生', phone: '0958-***-240', callback: false }, geo: { x: .3, y: .64 },
      unit: 'clean', officer: '蔡宗霖', team: '溪洲區清潔隊',
      log: [
        ['received', '10-26 08:35', 'A15', 'App 通報，附照片 3 張'],
        ['dispatched', '10-26 08:49', 'me', '派至 環境保護局 環境清潔隊'],
        ['bureau', '10-26 09:30', 'officer:蔡宗霖', '局處接案，排定溪洲區清潔隊下午清運，並調閱路口監視器追查行為人'],
      ],
    },
    {
      key: 'hydrant', cat: 'parking', district: '港埕區', address: '船廠街 46 號前', created: '10-26 09:05',
      title: '船廠街消防栓前貨車違停', channel: '電話', agent: 'A03', priority: 'urgent',
      desc: '船廠街 46 號前的消防栓被一輛白色廂型貨車擋住，從早上 7 點停到現在。附近都是老舊木造房子，萬一發生火警，消防車根本沒辦法取水。',
      caller: { name: '郭太太', phone: '0937-***-552', callback: true }, geo: { x: .7, y: .4 },
      unit: 'traffic', officer: '李承翰', team: '港埕分局交通組',
      log: [
        ['received', '10-26 09:05', 'A03', '來電受理，通話 0 分 51 秒'],
        ['dispatched', '10-26 09:12', 'me', '派至 警察局 交通警察大隊'],
        ['bureau', '10-26 09:25', 'officer:李承翰', '局處接案，交辦 港埕分局交通組'],
        ['field', '10-26 10:40', 'team', '員警到場，車主未在場，已舉發並聯繫拖吊；拖吊車調度中'],
      ],
      transcript: [
        ['agent', '00:00', '1999 市民熱線您好，我是 03 號話務員黃郁婷。'],
        ['caller', '00:04', '我要檢舉違規停車，有台貨車擋在消防栓前面。'],
        ['agent', '00:09', '請問地點在哪裡？'],
        ['caller', '00:11', '港埕區船廠街 46 號前面，白色的廂型貨車，車身有水電行的字。'],
        ['agent', '00:20', '了解，大概停多久了？'],
        ['caller', '00:23', '早上七點我出門就在了，到現在都沒移。我們這邊都是老房子，萬一火災怎麼辦。'],
        ['agent', '00:34', '謝謝您提醒，消防栓前違停我會轉請港埕分局交通組儘速到場處理，處理時限為 4 小時。'],
        ['caller', '00:44', '好，拜託快一點。'],
        ['agent', '00:47', '案號是 {id}，謝謝您的來電。'],
      ],
    },
    {
      key: 'piling', cat: 'noise', district: '新灣區', address: '科技二路 新灣科學園區三期工地', created: '10-26 04:40',
      title: '科技二路工地清晨打樁噪音', channel: '電話', agent: 'A21',
      desc: '科技二路的工地清晨 4 點多就開始打樁，咚咚咚的聲音整棟樓都在震，附近住戶完全沒辦法睡。工地告示寫的施工時間是早上 8 點以後。',
      caller: { name: '蔡先生', phone: '0975-***-031', callback: true }, geo: { x: .58, y: .3 },
      unit: 'epa', officer: '曾國峰', team: '稽查大隊第二中隊',
      log: [
        ['received', '10-26 04:40', 'A21', '來電受理，通話 1 分 37 秒'],
        ['dispatched', '10-26 04:52', 'D05', '派至 環境保護局 稽查大隊'],
        ['bureau', '10-26 08:15', 'officer:曾國峰', '局處接案，交辦 稽查大隊第二中隊'],
        ['field', '10-26 10:20', 'team', '稽查員到場量測，打樁作業持續中，等待量測結果'],
      ],
    },
    {
      key: 'fuqian', cat: 'pothole', district: '舊城區', address: '府前路 府前圓環公車站前', created: '10-23 08:10',
      title: '府前圓環公車站前路面坑洞', channel: '電話', agent: 'A03',
      desc: '府前圓環公車站前的路面有兩個坑洞，公車進站時乘客下車很容易踩空，早上有位阿嬤差點跌倒。',
      caller: { name: '林小姐', phone: '0910-***-487', callback: true }, geo: { x: .5, y: .5 },
      unit: 'works', officer: '葉怡君', team: '舊城養護分隊', callbackBy: 'me', rating: 5, feedback: '隔天早上就補好了，效率很好，謝謝養護分隊！',
      log: [
        ['received', '10-23 08:10', 'A03', '來電受理，通話 1 分 02 秒'],
        ['dispatched', '10-23 08:21', 'me', '派至 工務局 養護工程處'],
        ['bureau', '10-23 09:05', 'officer:葉怡君', '局處接案，交辦 舊城養護分隊'],
        ['field', '10-23 13:30', 'team', '到場勘查，設置警示錐'],
        ['replied', '10-24 09:40', 'officer:葉怡君', '坑洞已以熱拌瀝青修補完成，路面恢復平整'],
        ['closed', '10-24 15:10', 'me', '回訪完成，滿意度 5 分'],
      ],
      result: '坑洞已以熱拌瀝青修補完成，路面恢復平整',
    },
    {
      key: 'snake', cat: 'animal', district: '雲嶺區', address: '杉林街 72 號 後院', created: '10-25 16:22',
      title: '杉林街民宅後院發現蛇類', channel: '電話', agent: 'A15',
      desc: '後院花盆後面有一條大約 150 公分的蛇，灰褐色有斑紋，家裡有八十幾歲的長輩和兩個小孩，大家都不敢出門。',
      caller: { name: '詹先生', phone: '0919-***-663', callback: true }, geo: { x: .46, y: .52 },
      unit: 'animal', officer: '簡廷宇', team: '動物救援北區組', callbackBy: 'A21', rating: 4, feedback: '救援人員很快就到了，只是電話等了比較久。',
      log: [
        ['received', '10-25 16:22', 'A15', '來電受理，通話 1 分 44 秒'],
        ['dispatched', '10-25 16:30', 'D08', '派至 農業局 動物保護處'],
        ['bureau', '10-25 16:41', 'officer:簡廷宇', '局處接案，交辦 動物救援北區組'],
        ['field', '10-25 17:35', 'team', '救援人員出勤'],
        ['replied', '10-25 18:20', 'officer:簡廷宇', '已捕捉無毒錦蛇一條，野放至雲嶺山區'],
        ['closed', '10-26 10:15', 'A21', '回訪完成，滿意度 4 分'],
      ],
      result: '已捕捉無毒錦蛇一條，野放至雲嶺山區',
    },
    {
      key: 'pole', cat: 'light', district: '山腳區', address: '茶園街 18 號前', pole: 'SJ-0263', created: '10-26 13:41',
      title: '茶園街燈桿遭擦撞傾斜，疑有倒塌風險', priority: 'urgent', channel: '電話', agent: 'A15',
      desc: '茶園街 18 號前的燈桿（編號 SJ-0263）早上被貨車擦撞後明顯傾斜，基座的水泥裂開。燈桿就在國小學童放學會經過的人行道旁，擔心倒下來砸到人。',
      caller: { name: '彭先生', phone: '0987-***-350', callback: true }, geo: { x: .4, y: .44 },
      log: [['received', '10-26 13:41', 'A15', '來電受理，通話 2 分 03 秒；民眾表示燈桿遭車輛擦撞']],
    },
    {
      key: 'dumping', cat: 'litter', district: '鹽田區', address: '風車街 潟湖自行車道入口', created: '10-26 14:09',
      title: '潟湖自行車道入口遭棄置舊冰箱與紙箱', channel: 'LINE', agent: 'A21',
      desc: '潟湖自行車道入口旁被丟了兩台舊冰箱和一堆紙箱，紙箱被風吹得滿地都是，已經擋到自行車道。（LINE 通報，附照片 2 張）',
      caller: { name: '顏小姐', phone: '0952-***-781', callback: false }, geo: { x: .56, y: .5 },
      log: [['received', '10-26 14:09', 'A21', 'LINE 通報，附照片 2 張']],
    },
    {
      key: 'garage', cat: 'parking', district: '新灣區', address: '金帆街 15 號 車庫出入口', created: '10-26 07:42',
      title: '金帆街違停堵住車庫出入口', channel: '電話', agent: 'A07',
      desc: '一台黑色休旅車停在金帆街 15 號車庫門口，民眾要開車送小孩上學無法出門，車上沒有留電話。',
      caller: { name: '鄭先生', phone: '0966-***-209', callback: true }, geo: { x: .66, y: .62 },
      unit: 'traffic', officer: '江柏毅', team: '新灣分局交通組', callbackBy: 'me',
      log: [
        ['received', '10-26 07:42', 'A07', '來電受理，通話 0 分 58 秒'],
        ['dispatched', '10-26 07:49', 'D05', '派至 警察局 交通警察大隊'],
        ['bureau', '10-26 07:58', 'officer:江柏毅', '局處接案，交辦 新灣分局交通組'],
        ['field', '10-26 08:20', 'team', '員警到場處理'],
        ['replied', '10-26 09:20', 'officer:江柏毅', '已聯繫車主移車並依法舉發；民眾要求回電說明後續'],
      ],
      result: '已聯繫車主移車並依法舉發',
    },
  ];

  function buildCases() {
    const rnd = mulberry32(19991026);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const wpick = (keys, weights) => {
      let sum = 0;
      for (const w of weights) sum += w;
      let x = rnd() * sum;
      for (let i = 0; i < keys.length; i++) { x -= weights[i]; if (x <= 0) return keys[i]; }
      return keys[keys.length - 1];
    };
    const catWeight = { pothole: 18, noise: 16, parking: 28, light: 12, litter: 17, animal: 9 };
    const baseHour = [1, .6, .4, .3, .3, .6, 1.4, 2.6, 4.2, 5, 4.8, 4.4, 3.6, 4, 4.2, 4, 3.8, 3.6, 3.4, 3.2, 3, 2.6, 2, 1.4];
    const hourW = cat => baseHour.map((w, h) => {
      if (cat === 'noise') return w * (h >= 21 || h <= 2 ? 3.2 : h >= 7 && h <= 18 ? .55 : 1);
      if (cat === 'parking') return w * (h >= 7 && h <= 19 ? 1.4 : .3);
      if (cat === 'light') return w * (h >= 17 || h <= 1 ? 2.4 : .5);
      return w;
    });
    const hours = baseHour.map((_, i) => i);
    const placeOf = d => {
      const r = rnd();
      if (r < .55) return `${pick(d.streets)} ${Math.floor(rnd() * 240) + 3} 號前`;
      if (r < .8) {
        const a = pick(d.streets);
        let b = pick(d.streets);
        if (b === a) b = d.streets[(d.streets.indexOf(a) + 1) % d.streets.length];
        return `${a}與${b}口`;
      }
      return `${pick(d.landmarks)}旁`;
    };
    const caseList = [];

    // 手寫重點案件
    for (const f of FEATURED) {
      const created = T(f.created);
      const c = {
        id: null, key: f.key, cat: f.cat, status: 'received', title: f.title, desc: f.desc,
        district: f.district, address: f.address, pole: f.pole || null, geo: f.geo,
        caller: { ...f.caller }, channel: f.channel, agent: f.agent, priority: f.priority || 'normal',
        created, due: created + CATS[f.cat].sla * HOUR,
        unit: f.unit || null, officer: f.officer || null, team: f.team || null,
        log: [], repliedAt: null, closedAt: null, result: f.result || null, reply: f.reply || null,
        rating: f.rating || null, feedback: f.feedback || null, callbackBy: f.callbackBy || null,
        returned: null, urged: 0, repeat: f.repeat || 0, transcript: f.transcript || null,
      };
      for (const [type, at, actor, note] of f.log) {
        const entry = { at: T(at), type, actor: actorName(actor, c), note };
        c.log.push(entry);
        if (FLOW.includes(type)) c.status = type;
        if (type === 'replied') c.repliedAt = entry.at;
        if (type === 'closed') c.closedAt = entry.at;
        if (type === 'dispatched' && !c.unit) c.unit = CATS[c.cat].unit;
      }
      if (f.returned) {
        c.returned = { ...f.returned, at: T(f.returned.at) };
        c.status = 'received';
        c.unit = null; c.officer = null; c.team = null;
      }
      caseList.push(c);
    }

    // 產生近 7 日一般案件
    for (let day = 20; day <= 26; day++) {
      const weekend = day === 24 || day === 25;
      const dayStart = T(`10-${day} 00:00`);
      const n = weekend ? 26 : 34;
      for (let i = 0; i < n; i++) {
        let cat = wpick(CAT_KEYS, CAT_KEYS.map(k => catWeight[k] * (weekend && k === 'noise' ? 1.3 : 1)));
        const hour = wpick(hours, hourW(cat));
        const created = dayStart + hour * HOUR + Math.floor(rnd() * 60) * MIN;
        if (created > BASE_NOW - 4 * MIN) continue;
        const d = DISTRICTS[wpick(DISTRICTS.map((_, k) => k), DISTRICTS.map(x => x.pop + 3))];
        let tplList = TEMPLATES[cat].filter(t => !t.coastal || d.coastal);
        const tpl = pick(tplList);
        const place = placeOf(d);
        const pole = cat === 'light' ? `${d.code}-${String(Math.floor(rnd() * 900) + 100).padStart(4, '0')}` : null;
        const fill = s => s.replace(/\{p\}/g, place).replace('{pole}', pole);
        const agent = pick(['A03', 'A07', 'A09', 'A12', 'A15', 'A21']);
        const channel = wpick(['電話', 'App', '網站', 'LINE'], [70, 18, 8, 4]);
        const c = {
          id: null, key: null, cat, status: 'received', title: fill(tpl.t), desc: fill(tpl.d),
          district: d.name, address: place, pole, geo: { x: .2 + rnd() * .6, y: .2 + rnd() * .6 },
          caller: { name: pick(SURNAMES) + (rnd() < .5 ? '先生' : '小姐'), phone: `09${Math.floor(rnd() * 90 + 10)}-***-${String(Math.floor(rnd() * 1000)).padStart(3, '0')}`, callback: rnd() < .55 },
          channel, agent, priority: (cat === 'animal' && rnd() < .5) || /傾斜|鋼筋|消防栓/.test(tpl.t) ? 'urgent' : 'normal',
          created, due: created + CATS[cat].sla * HOUR,
          unit: null, officer: null, team: null, log: [], repliedAt: null, closedAt: null, result: null, reply: null,
          rating: null, feedback: null, callbackBy: null, returned: null, urged: 0, repeat: rnd() < .12 ? 1 : 0, transcript: null,
        };
        simulate(c, rnd, pick);
        caseList.push(c);
      }
    }

    // 依受理時間排序後編案號：每日流水號，其他類別的案件也會占號，所以號碼會跳
    caseList.sort((a, b) => a.created - b.created);
    let curDay = -1, seq = 0;
    for (const c of caseList) {
      const dk = dayKey(c.created);
      if (dk !== curDay) { curDay = dk; seq = 2 + Math.floor(rnd() * 5); }
      seq += 1 + Math.floor(rnd() * 6);
      const p = parts(c.created);
      c.id = `C${pad(p.mo)}${pad(p.d)}-${String(seq).padStart(4, '0')}`;
    }
    for (const c of caseList) {
      if (c.transcript) c.transcript = c.transcript.map(([who, t, text]) => ({ who, t, text: text.replace('{id}', c.id) }));
    }
    // 對外一律新到舊（列表、搜尋的預設順序）；createCase 以 unshift 維持此順序
    return caseList.reverse();
  }

  function actorName(code, c) {
    if (code === 'team') return c.team;
    if (code.startsWith('officer:')) return `${UNITS[c.unit || CATS[c.cat].unit].name} ${code.slice(8)}`;
    const p = PEOPLE[code];
    return p.role === '話務員' ? `話務員 ${p.name}（${code}）` : `${p.role.replace(/（.+）/, '')} ${p.name}`;
  }

  /** 依類別時限模擬各階段時間，再以「現在」決定狀態 */
  function simulate(c, rnd, pick) {
    const sla = CATS[c.cat].sla * HOUR;
    const unitKey = CATS[c.cat].unit;
    const u = UNITS[unitKey];
    const d = DISTRICT_BY_NAME[c.district];
    // 約 16% 案件描述不明確需人工判斷，派案會延後；今天午後派案組人力輪休，待派案會累積
    const manual = rnd() < .16;
    const lunchBacklog = dayKey(c.created) === dayKey(BASE_NOW) && parts(c.created).h >= 12;
    const tDispatch = c.created + (manual ? 35 + rnd() * 175 : lunchBacklog ? 25 + rnd() * 120 : 4 + rnd() * 26) * MIN;
    const tBureau = tDispatch + (6 + rnd() * 50) * MIN;
    const late = rnd() < .06;
    const f = late ? 1.04 + rnd() * .5 : .22 + rnd() * .7;
    const tReply = c.created + sla * f;
    const tField = tBureau + Math.max(8 * MIN, (tReply - tBureau) * (.15 + rnd() * .35));
    const tClose = tReply + (c.caller.callback ? (3 + rnd() * 30) * HOUR : 72 * HOUR);
    const now = BASE_NOW;
    const p = parts(tDispatch);
    const weekend = p.wd === 0 || p.wd === 6;
    const dispatcher = !weekend && p.h >= 8 && (p.h < 16 || (p.h === 16 && p.mi < 30)) ? 'me' : weekend && p.h >= 8 && p.h < 20 ? 'D08' : 'D05';
    const agent = PEOPLE[c.agent];
    const talk = `${Math.floor(rnd() * 3)} 分 ${pad(Math.floor(rnd() * 60))} 秒`;
    c.log.push({ at: c.created, type: 'received', actor: `話務員 ${agent.name}（${c.agent}）`, note: c.channel === '電話' ? `來電受理，通話 ${talk}` : `${c.channel} 通報${rnd() < .6 ? `，附照片 ${1 + Math.floor(rnd() * 3)} 張` : ''}` });
    if (tDispatch > now) return;
    c.status = 'dispatched'; c.unit = unitKey;
    c.log.push({ at: tDispatch, type: 'dispatched', actor: actorName(dispatcher, c), note: `派至 ${u.full}` });
    if (tBureau > now) return;
    c.status = 'bureau'; c.officer = pick(u.officers); c.team = u.team(d);
    c.log.push({ at: tBureau, type: 'bureau', actor: `${u.name} ${c.officer}`, note: `局處接案，交辦 ${c.team}` });
    if (tField > now) return;
    c.status = 'field';
    c.log.push({ at: tField, type: 'field', actor: c.team, note: STAGE_ACTION[c.cat][0] });
    if (tReply > now) return;
    c.status = 'replied'; c.repliedAt = tReply; c.result = STAGE_ACTION[c.cat][1];
    c.log.push({ at: tReply, type: 'replied', actor: `${u.name} ${c.officer}`, note: `${c.result}；已${c.caller.callback ? '電話' : '簡訊'}回覆民眾` });
    if (c.caller.callback) c.callbackBy = rnd() < .3 ? 'me' : 'A21';
    if (tClose > now) return;
    c.status = 'closed'; c.closedAt = tClose;
    if (c.caller.callback) {
      const r = late ? [3, 2, 4, 1][Math.floor(rnd() * 4)] : Number(['5', '5', '5', '4', '4', '4', '3', '5', '2', '5'][Math.floor(rnd() * 10)]);
      c.rating = r;
      c.feedback = rnd() < .6 ? (r === 5 && rnd() < .5 ? FEEDBACK_CAT[c.cat] : pick(FEEDBACK[r])) : null;
      c.log.push({ at: tClose, type: 'closed', actor: c.callbackBy === 'me' ? '派案督導 周品妤' : '話務員 蘇若涵（A21）', note: `回訪完成，滿意度 ${r} 分` });
    } else {
      c.log.push({ at: tClose, type: 'closed', actor: '系統', note: '民眾未要求回訪，系統自動結案' });
    }
  }

  const cases = buildCases();
  const caseById = new Map(cases.map(c => [c.id, c]));
  const featured = Object.fromEntries(cases.filter(c => c.key).map(c => [c.key, c.id]));

  const DATA = {
    cases,
    featured,
    defaultCaseId: featured.pothole,
    calls: {
      // 每小時來電數（00 時起；最後一格為進行中的 14 時）
      hourly: [22, 14, 9, 7, 6, 11, 24, 48, 86, 104, 97, 92, 78, 83, 40],
      forecast: [20, 13, 9, 7, 6, 12, 26, 50, 88, 102, 98, 90, 80, 86, 88, 84, 76, 70, 62, 55, 48, 40, 31, 24],
      online: 19, seats: 24, avgWait: 38, abandon: 2.6, avgTalk: 192,
    },
    // 近 30 日中「7 日以前」的彙總，與 7 日明細相加即為 30 日數字
    month: {
      byCat: { pothole: 168, noise: 201, parking: 274, light: 117, litter: 176, animal: 79 },
      byDistrict: { '港埕區': 178, '北岸區': 131, '舊城區': 162, '山腳區': 92, '新灣區': 196, '鹽田區': 71, '溪洲區': 119, '雲嶺區': 46 },
      units: {
        works: { done: 163, onTime: 152, hours: 31.4 * 163 },
        lamp: { done: 112, onTime: 104, hours: 52.8 * 112 },
        epa: { done: 196, onTime: 167, hours: 7.9 * 196 },
        clean: { done: 171, onTime: 160, hours: 19.6 * 171 },
        traffic: { done: 270, onTime: 258, hours: 1.9 * 270 },
        animal: { done: 77, onTime: 66, hours: 3.4 * 77 },
      },
      satisfaction: { n: 386, sum: 386 * 4.26, dist: { 5: 181, 4: 122, 3: 47, 2: 23, 1: 13 } },
    },
    notices: [],
  };
  App.DATA = DATA;
  App.getCase = id => caseById.get(id);
  App.unitOf = c => (c.unit ? UNITS[c.unit] : null);

  DATA.notices = [
    { id: 'n1', shape: 'boom', tone: 'error', title: `${featured.hydrant} 消防栓前違停已逾期`, sub: '港埕分局交通組 · 13:05 到期，拖吊車調度中', href: `case.html?id=${featured.hydrant}`, read: false },
    { id: 'n2', shape: 'slanted', tone: 'coral', title: `環保局稽查大隊退件 ${featured.noiseReturn}`, sub: '住宅人為噪音，建請改派警察局轄區分局', href: `case.html?id=${featured.noiseReturn}`, read: false },
    { id: 'n3', shape: 'sunny', tone: 'warn', title: `${featured.piling} 打樁噪音即將逾期`, sub: '稽查大隊第二中隊量測中 · 16:40 到期', href: `case.html?id=${featured.piling}`, read: false },
    { id: 'n4', shape: 'cookie12', tone: 'primary', title: '系統公告：10/28（三）02:00–04:00 例行維護', sub: '維護期間話務改以紙本受理單登錄，恢復後補登', href: null, read: true },
  ];

  /* ===================================================================
     領域函式
     =================================================================== */
  // 來電號碼：手機 0912-345-678 / 市話 07-1234567（連字號可省略）
  App.PHONE_RE = /^(09\d{2}-?\d{3}-?\d{3}|0\d{1,2}-?\d{6,8})$/;
  /** 存檔用遮蔽號碼：手機 0935-***-772（與既有案件同格式，才能比對來電紀錄），市話 07-***4567；格式不符回傳 '' */
  App.maskPhone = raw => {
    const v = String(raw).trim();
    if (!App.PHONE_RE.test(v)) return '';
    const d = v.replace(/\D/g, '');
    if (d.startsWith('09')) return `${d.slice(0, 4)}-***-${d.slice(7)}`;
    const area = v.includes('-') ? v.split('-')[0] : d.slice(0, 2);
    return `${area}-***${d.slice(-4)}`;
  };

  App.isOpen = c => !c.repliedAt;
  App.isActive = c => c.status === 'dispatched' || c.status === 'bureau' || c.status === 'field';

  App.sla = c => {
    const dur = CATS[c.cat].sla * HOUR;
    if (c.repliedAt) {
      const used = c.repliedAt - c.created;
      return c.repliedAt <= c.due
        ? { state: 'done', remain: c.due - c.repliedAt, frac: 1, label: `準時完成 · 用時 ${durShort(used)}`, short: '準時完成' }
        : { state: 'late', remain: c.due - c.repliedAt, frac: 0, label: `逾時 ${durShort(c.repliedAt - c.due)} 完成`, short: '逾時完成' };
    }
    const remain = c.due - App.now();
    const frac = clamp(remain / dur, 0, 1);
    if (remain < 0) return { state: 'over', remain, frac: 0, label: `逾期 ${durShort(-remain)}`, short: '已逾期' };
    // 即將逾期：剩餘不到時限的 25%（最多 6 小時、最少 30 分鐘）
    const soon = remain < Math.max(Math.min(dur * .25, 6 * HOUR), 30 * MIN);
    return { state: soon ? 'soon' : 'ok', remain, frac, label: `剩 ${durShort(remain)}`, short: soon ? '即將逾期' : '處理時限內' };
  };

  const QUEUE_RANK = { over: 0, dispatch: 1, reassign: 1, soon: 2, callback: 3 };
  App.queue = () => {
    const out = [];
    for (const c of cases) {
      if (c.status === 'received') {
        out.push(c.returned
          ? { c, kind: 'reassign', reason: `${c.returned.by}退件`, rank: QUEUE_RANK.reassign }
          : { c, kind: 'dispatch', reason: '待分類派案', rank: QUEUE_RANK.dispatch });
      } else if (App.isActive(c)) {
        const s = App.sla(c);
        if (s.state === 'over') out.push({ c, kind: 'urge', reason: '已逾期，待催辦', rank: QUEUE_RANK.over });
        else if (s.state === 'soon') out.push({ c, kind: 'urge', reason: '即將逾期', rank: QUEUE_RANK.soon });
      } else if (c.status === 'replied' && c.callbackBy === 'me') {
        out.push({ c, kind: 'callback', reason: '民眾要求回電', rank: QUEUE_RANK.callback });
      }
    }
    // 同級距內：緊急案件優先；待派案依等候時間、催辦依到期時間、回訪依回覆時間排序
    const key = x => x.kind === 'callback' ? x.c.repliedAt : x.kind === 'urge' ? x.c.due : x.c.created;
    return out.sort((a, b) => a.rank - b.rank || (b.c.priority === 'urgent') - (a.c.priority === 'urgent') || key(a) - key(b));
  };

  App.count = key => {
    const [k, v] = key.split(':');
    switch (k) {
      case 'all': return cases.length;
      case 'today': return cases.filter(c => App.isToday(c.created)).length;
      case 'received': return cases.filter(c => c.status === 'received').length;
      case 'active': return cases.filter(App.isActive).length;
      case 'soon': return cases.filter(c => App.isOpen(c) && App.sla(c).state === 'soon').length;
      case 'over': return cases.filter(c => App.isOpen(c) && App.sla(c).state === 'over').length;
      case 'replied': return cases.filter(c => c.status === 'replied').length;
      case 'closed': return cases.filter(c => c.status === 'closed').length;
      case 'callback': return cases.filter(c => c.status === 'replied' && c.callbackBy === 'me').length;
      case 'queue': return App.queue().length;
      case 'notices': return DATA.notices.filter(n => !n.read).length;
      case 'cat': return cases.filter(c => c.cat === v).length;
      case 'district': return cases.filter(c => c.district === v).length;
      case 'status': return cases.filter(c => c.status === v).length;
      default: throw new Error(`unknown count key: ${key}`);
    }
  };

  /** 統計：today / 7d 由案件明細計算；30d = 7d + 30 日彙總 */
  App.stats = range => {
    const now = App.now();
    const list = range === 'today' ? cases.filter(c => App.isToday(c.created)) : cases;
    const byCat = Object.fromEntries(CAT_KEYS.map(k => [k, 0]));
    const byDistrict = Object.fromEntries(DISTRICTS.map(d => [d.name, 0]));
    const units = Object.fromEntries(MAIN_UNITS.map(k => [k, { done: 0, onTime: 0, hours: 0, open: 0 }]));
    let ratingN = 0, ratingSum = 0;
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const c of list) {
      byCat[c.cat]++;
      byDistrict[c.district]++;
      const u = units[CATS[c.cat].unit];
      if (c.repliedAt) {
        u.done++;
        if (c.repliedAt <= c.due) u.onTime++;
        u.hours += (c.repliedAt - c.created) / HOUR;
      } else {
        u.open++;
        // 尚未完成但已逾期的案件也算未達標
        if (c.due < now) u.done++;
      }
      if (c.rating) { ratingN++; ratingSum += c.rating; dist[c.rating]++; }
    }
    if (range === '30d') {
      const m = DATA.month;
      CAT_KEYS.forEach(k => { byCat[k] += m.byCat[k]; });
      DISTRICTS.forEach(d => { byDistrict[d.name] += m.byDistrict[d.name]; });
      MAIN_UNITS.forEach(k => { units[k].done += m.units[k].done; units[k].onTime += m.units[k].onTime; units[k].hours += m.units[k].hours; });
      ratingN += m.satisfaction.n; ratingSum += m.satisfaction.sum;
      Object.keys(dist).forEach(r => { dist[r] += m.satisfaction.dist[r]; });
    }
    let doneAll = 0, onTimeAll = 0;
    MAIN_UNITS.forEach(k => {
      const u = units[k];
      const finished = cases.filter(c => CATS[c.cat].unit === k && c.repliedAt && (range !== 'today' || App.isToday(c.created))).length + (range === '30d' ? DATA.month.units[k].done : 0);
      u.rate = u.done ? u.onTime / u.done : 1;
      u.avgH = finished ? u.hours / finished : 0;
      doneAll += u.done; onTimeAll += u.onTime;
    });
    return {
      total: Object.values(byCat).reduce((a, b) => a + b, 0),
      byCat, byDistrict, units,
      slaRate: doneAll ? onTimeAll / doneAll : 1, slaDone: doneAll, slaOnTime: onTimeAll,
      satisfaction: { n: ratingN, avg: ratingN ? ratingSum / ratingN : 0, dist },
    };
  };

  App.classify = text => {
    const t = String(text || '');
    if (!t.trim()) return [];
    return CAT_KEYS.map(k => {
      let score = 0;
      const hits = [];
      for (const [kw, w] of CATS[k].keywords) {
        if (t.includes(kw)) { score += w; hits.push(kw); }
      }
      return { cat: k, raw: score, score: 1 - Math.exp(-score / 3.5), hits };
    }).filter(r => r.raw > 0).sort((a, b) => b.raw - a.raw);
  };

  App.route = (cat, text = '') => {
    const t = String(text);
    const main = { unit: CATS[cat].unit, reason: `${CATS[cat].name}權責單位`, primary: true };
    if (cat === 'noise' && /(樓上|樓下|鄰居|住戶|敲|拖拉|吵架|喧嘩|唱歌)/.test(t)) {
      return [{ unit: 'police', reason: '住宅人為噪音屬警察局權責', primary: true }, { ...main, primary: false, reason: '營業場所、工地噪音' }];
    }
    if (cat === 'litter' && /(水溝|側溝|排水)/.test(t)) {
      return [main, { unit: 'water', reason: '側溝清疏、排水不良', primary: false }];
    }
    if (cat === 'pothole' && /人孔蓋/.test(t)) {
      return [main, { unit: 'water', reason: '下水道人孔', primary: false }];
    }
    return [main];
  };

  const ALL_STREETS = DISTRICTS.flatMap(d => [...d.streets, ...d.landmarks]);
  App.findSimilar = ({ cat, district, address = '', text = '', excludeId = null }, limit = 3) => {
    const now = App.now();
    const streets = ALL_STREETS.filter(s => address.includes(s) || text.includes(s));
    const num = (/(\d+)\s*號/.exec(address) || [])[1];
    const out = [];
    for (const c of cases) {
      if (c.id === excludeId) continue;
      let score = 0;
      const reasons = [];
      const sameStreet = streets.some(s => c.address.includes(s));
      if (sameStreet) { score += 3; reasons.push('同路段'); }
      if (num && sameStreet && new RegExp(`(^|\\D)${num}\\s*號`).test(c.address)) { score += 2; reasons.push('同門牌'); }
      if (district && c.district === district) { score += 1; if (!sameStreet) reasons.push('同行政區'); }
      if (cat && c.cat === cat) { score += 2; reasons.push('同類別'); }
      if (now - c.created < 72 * HOUR) { score += 1; reasons.push('72 小時內'); }
      if (score >= 6 || (sameStreet && cat && c.cat === cat)) out.push({ c, score, reasons });
    }
    return out.sort((a, b) => b.score - a.score || b.c.created - a.c.created).slice(0, limit);
  };

  App.transcript = c => {
    if (c.transcript) return c.transcript;
    if (c.channel !== '電話') return null;
    const agent = PEOPLE[c.agent];
    const unit = UNITS[CATS[c.cat].unit];
    return [
      { who: 'agent', t: '00:00', text: `澄港市 1999 市民熱線您好，我是 ${c.agent.slice(1)} 號話務員${agent.name}，很高興為您服務。` },
      { who: 'caller', t: '00:06', text: `你好，我要反映${CATS[c.cat].name}的問題。` },
      { who: 'agent', t: '00:10', text: '好的，請問地點在哪裡？' },
      { who: 'caller', t: '00:14', text: `在${c.district}${c.address}。` },
      { who: 'agent', t: '00:22', text: '了解，可以描述一下現場的狀況嗎？' },
      { who: 'caller', t: '00:26', text: c.desc },
      { who: 'agent', t: '01:04', text: `我已經記錄下來，會轉請${unit.full}處理，處理時限為 ${fmt.slaHours(CATS[c.cat].sla)}，結果會${c.caller.callback ? '以電話' : '以簡訊'}回覆您。` },
      { who: 'caller', t: '01:16', text: '好，麻煩你們了。' },
      { who: 'agent', t: '01:19', text: `案號是 ${c.id}，謝謝您的來電。` },
    ];
  };

  App.replyVars = c => {
    const u = App.unitOf(c) || UNITS[CATS[c.cat].unit];
    return {
      案號: c.id,
      陳情人: c.caller.name,
      地點: `${c.district}${c.address}`,
      類別: CATS[c.cat].name,
      承辦單位: u.full,
      處理區隊: c.team || App.teamFor(u.key, c.district),
      處理結果: c.result || STAGE_ACTION[c.cat][1],
      完成時間: c.repliedAt ? fmt.dateTime(c.repliedAt) : fmt.dateTime(App.now()),
      處理時限: fmt.slaHours(CATS[c.cat].sla),
    };
  };

  /* ---------- 異動與事件 ---------- */
  const listeners = new Set();
  App.on = (type, fn) => {
    if (type !== 'change') throw new Error(`unknown event: ${type}`);
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  function emit(detail) {
    listeners.forEach(fn => fn(detail));
    document.dispatchEvent(new CustomEvent('app:change', { detail }));
    refreshCounts();
    refreshSla();
  }
  /** 以快照實作復原：異動前深拷貝，undo 時整筆還原 */
  function mutate(ids, fn, type) {
    const snaps = ids.map(id => {
      const c = caseById.get(id);
      if (!c) throw new Error(`case not found: ${id}`);
      return [c, JSON.parse(JSON.stringify(c))];
    });
    snaps.forEach(([c]) => fn(c));
    emit({ type, ids });
    let undone = false;
    return () => {
      if (undone) return;
      undone = true;
      snaps.forEach(([c, s]) => { Object.keys(c).forEach(k => delete c[k]); Object.assign(c, s); });
      emit({ type: 'undo', ids });
    };
  }
  const MY_NAME = `派案督導 ${PEOPLE.me.name}`;
  // 改派：局處退件的待派案，或已派出、正在承辦/處理中的案件再換單位
  const isReassign = c => !!c.returned || c.status !== 'received';

  App.dispatch = (ids, { unit, team, note = '' }) => mutate(ids, c => {
    const u = UNITS[unit];
    const reassign = isReassign(c);
    c.unit = unit;
    c.team = team || u.team(DISTRICT_BY_NAME[c.district]);
    c.officer = null;
    c.status = 'dispatched';
    c.returned = null;
    c.log.push({ at: App.now(), type: 'dispatched', actor: MY_NAME, note: `${reassign ? '改派至' : '派至'} ${u.full}${note ? `；${note}` : ''}` });
  }, 'dispatch');

  App.urge = (id, note = '') => mutate([id], c => {
    c.urged = (c.urged || 0) + 1;
    c.log.push({ at: App.now(), type: 'urge', actor: MY_NAME, note: `催辦 ${c.team || App.unitOf(c).full}${note ? `：${note}` : ''}（第 ${c.urged} 次）` });
  }, 'urge');

  App.setStatus = (id, status, { note = '', actor = MY_NAME, result = null } = {}) => mutate([id], c => {
    c.status = status;
    if (status === 'bureau' && !c.officer) c.officer = App.unitOf(c).officers[0];
    if (status === 'replied') { c.repliedAt = App.now(); if (result) c.result = result; }
    if (status === 'closed') c.closedAt = App.now();
    c.log.push({ at: App.now(), type: status, actor, note: note || STATUS[status].stage });
  }, 'status');

  App.reply = (id, text) => mutate([id], c => {
    c.status = 'replied';
    c.repliedAt = App.now();
    c.reply = text;
    if (!c.result) c.result = STAGE_ACTION[c.cat][1];
    if (c.caller.callback && !c.callbackBy) c.callbackBy = 'me';
    c.log.push({ at: App.now(), type: 'replied', actor: MY_NAME, note: `回覆民眾（${c.caller.callback ? '電話＋簡訊' : '簡訊'}）` });
  }, 'reply');

  App.closeWithRating = (id, rating, feedback = '') => mutate([id], c => {
    c.status = 'closed';
    c.closedAt = App.now();
    c.rating = rating;
    c.feedback = feedback || null;
    c.log.push({ at: App.now(), type: 'closed', actor: MY_NAME, note: `回訪完成，滿意度 ${rating} 分${feedback ? `：「${feedback}」` : ''}` });
  }, 'close');

  App.createCase = draft => {
    const now = App.now();
    const p = parts(now);
    const prefix = `C${pad(p.mo)}${pad(p.d)}-`;
    const maxSeq = cases.filter(c => c.id.startsWith(prefix)).reduce((m, c) => Math.max(m, +c.id.slice(6)), 0);
    const id = prefix + String(maxSeq + 1 + Math.floor(Math.random() * 3)).padStart(4, '0');
    const cat = draft.cat;
    const c = {
      id, key: null, cat, status: 'received',
      title: draft.title || `${draft.address}${CATS[cat].name}陳情`,
      desc: draft.desc, district: draft.district, address: draft.address, pole: null,
      geo: { x: .5, y: .5 },
      caller: { name: draft.name || '來電民眾', phone: draft.phone, callback: !!draft.callback },
      channel: draft.channel || '電話', agent: 'A07', priority: draft.priority || 'normal',
      created: now, due: now + CATS[cat].sla * HOUR,
      unit: null, officer: null, team: null,
      log: [{ at: now, type: 'received', actor: MY_NAME, note: `${draft.channel || '電話'}受理建案` }],
      repliedAt: null, closedAt: null, result: null, reply: null, rating: null, feedback: null,
      callbackBy: null, returned: null, urged: 0, repeat: 0, transcript: null,
    };
    cases.unshift(c);
    caseById.set(id, c);
    emit({ type: 'create', ids: [id] });
    let undone = false;
    return {
      c,
      undo: () => {
        if (undone) return;
        undone = true;
        cases.splice(cases.indexOf(c), 1);
        caseById.delete(id);
        emit({ type: 'undo', ids: [id] });
      },
    };
  };

  /* ===================================================================
     圖示
     =================================================================== */
  const ICONS = {
    dashboard: '<rect x="4" y="4" width="7" height="8" rx="1.6"/><rect x="13" y="4" width="7" height="5" rx="1.6"/><rect x="13" y="11" width="7" height="9" rx="1.6"/><rect x="4" y="14" width="7" height="6" rx="1.6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>',
    detail: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    callAdd: '<path d="M5.5 4h3l1.6 4.3-2 1.3a10.5 10.5 0 0 0 6.3 6.3l1.3-2 4.3 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4z"/><path d="M17.5 2.5v6M14.5 5.5h6"/>',
    phone: '<path d="M5.5 4h3l1.6 4.3-2 1.3a10.5 10.5 0 0 0 6.3 6.3l1.3-2 4.3 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/>',
    bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    send: '<path d="M4.5 12L20 4.5 15.5 20l-3.2-6.3z"/><path d="M12.3 13.7L20 4.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><path d="M4.5 14h3v6h-2a1 1 0 0 1-1-1zM19.5 14h-3v6h2a1 1 0 0 0 1-1z"/>',
    dispatch: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.8"/>',
    bolt: '<path d="M13 3L5 13.5h6.2L10 21l8-10.5h-6.2z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    warning: '<path d="M12 4L2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    open: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    more: '<path d="M12 5.5h.01M12 12h.01M12 18.5h.01" stroke-width="3"/>',
    map: '<path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    chat: '<path d="M4 5.5h16v11H9.5L4 20.5z"/><path d="M8 10h8M8 13h5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
    rows: '<rect x="4" y="5" width="16" height="5" rx="1.6"/><rect x="4" y="14" width="16" height="5" rx="1.6"/>',
    trend: '<path d="M4 16.5l5.5-5.5 4 4L20 8.5"/><path d="M15 8.5h5v5"/>',
    sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16v4M16.5 18h4"/>',
    mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4M12 8v4.5l3 1.8"/>',
    star: '<path d="M12 3.8l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.8l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z"/>',
    attach: '<path d="M8.5 12.5l6-6a3 3 0 0 1 4.2 4.2l-7.5 7.5a5 5 0 0 1-7-7L11 4.5"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    team: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.5a3 3 0 0 1 0 6M17 14.2a5 5 0 0 1 3.5 5.3"/>',
    building: '<path d="M4 20.5V6l8-3 8 3v14.5"/><path d="M9 20.5v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 12.5h.01M12 12.5h.01M16 12.5h.01" /><path d="M2.5 20.5h19"/>',
  };
  App.icon = (name, cls = '') => {
    if (!ICONS[name]) throw new Error(`unknown icon: ${name}`);
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  };

  /* ===================================================================
     形狀引擎：所有形狀都以「極座標半徑陣列」表示（N 個等角取樣），
     因此任兩個形狀之間只要逐點插值半徑就能 morph，不需要對應頂點。
     =================================================================== */
  const N = 72;
  const TAU = Math.PI * 2;
  const ANG = Array.from({ length: N }, (_, i) => -Math.PI / 2 + TAU * i / N);
  const lobed = (n, d, p, mode = 'tip', rot = 0) => ANG.map(a => {
    const x = n * (a + rot) / 2;
    return mode === 'tip' ? 1 - d * Math.pow(Math.abs(Math.sin(x)), p) : (1 - d) + d * Math.pow(Math.abs(Math.cos(x)), p);
  });
  const superE = (a, b, m, rot = 0) => ANG.map(t => {
    const th = t + rot;
    return Math.pow(Math.pow(Math.abs(Math.cos(th) / a), m) + Math.pow(Math.abs(Math.sin(th) / b), m), -1 / m);
  });
  const polygon = (n, rot = 0) => ANG.map(t => {
    const seg = TAU / n;
    const x = ((t - rot + Math.PI / 2) % seg + seg) % seg;
    return Math.cos(Math.PI / n) / Math.cos(x - seg / 2);
  });
  const smooth = (r, passes) => {
    let a = r.slice();
    for (let k = 0; k < passes; k++) a = a.map((v, i) => (a[(i - 1 + N) % N] + 2 * v + a[(i + 1) % N]) / 4);
    return a;
  };
  const fromCurve = (fn, cx, cy, samples = 1440) => {
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const [x, y] = fn(TAU * i / samples);
      pts.push({ a: Math.atan2(y - cy, x - cx), r: Math.hypot(x - cx, y - cy) });
    }
    return ANG.map(t => {
      const a = Math.atan2(Math.sin(t), Math.cos(t));
      let best = pts[0], bd = Infinity;
      for (const p of pts) {
        const dd = Math.abs(Math.atan2(Math.sin(p.a - a), Math.cos(p.a - a)));
        if (dd < bd) { bd = dd; best = p; }
      }
      return best.r;
    });
  };
  const SHAPE_DEFS = {
    circle: () => ANG.map(() => 1),
    oval: () => superE(1, .76, 2, -Math.PI / 5),
    pill: () => superE(1, .6, 3.2),
    squircle: () => superE(1, 1, 4.2),
    slanted: () => superE(1, 1, 4, .18),
    cookie4: () => lobed(4, .2, 2, 'tip', Math.PI / 4),
    cookie6: () => lobed(6, .13, 2),
    cookie9: () => lobed(9, .1, 2),
    cookie12: () => lobed(12, .07, 2),
    sunny: () => lobed(8, .16, 1.2),
    verySunny: () => lobed(8, .26, .9),
    softBurst: () => lobed(10, .2, 1.4),
    burst: () => lobed(12, .3, .75),
    boom: () => lobed(14, .34, .62),
    clover4: () => lobed(4, .42, .55, 'leaf', Math.PI / 4),
    clover8: () => lobed(8, .24, .7, 'leaf'),
    flower: () => lobed(6, .3, .8, 'leaf'),
    pentagon: () => smooth(polygon(5), 5),
    triangle: () => smooth(polygon(3), 9),
    gem: () => smooth(superE(.82, 1.06, 1.5), 1),
    diamond: () => smooth(polygon(4), 6),
    heart: () => smooth(fromCurve(t => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))], 0, 1.2), 1),
  };
  // 等面積正規化：不同形狀視覺重量一致；最大半徑不超過 1（不出 viewBox）
  const normalize = r => {
    const area = r.reduce((s, v) => s + v * v, 0) * Math.PI / N;
    let s = Math.sqrt(Math.PI * .86 * .86 / area);
    const mx = Math.max(...r) * s;
    if (mx > 1) s /= mx;
    return r.map(v => v * s);
  };
  const radiiCache = {};
  const radiiOf = name => {
    if (!radiiCache[name]) {
      if (!SHAPE_DEFS[name]) throw new Error(`unknown shape: ${name}`);
      radiiCache[name] = normalize(SHAPE_DEFS[name]());
    }
    return radiiCache[name];
  };
  const pathFromRadii = r => {
    const P = r.map((v, i) => [50 + 50 * v * Math.cos(ANG[i]), 50 + 50 * v * Math.sin(ANG[i])]);
    const f = n => (Math.round(n * 10) / 10).toString();
    let d = `M${f(P[0][0])} ${f(P[0][1])}`;
    // Catmull-Rom → cubic Bézier：取樣點之間平滑相接
    for (let i = 0; i < N; i++) {
      const p0 = P[(i - 1 + N) % N], p1 = P[i], p2 = P[(i + 1) % N], p3 = P[(i + 2) % N];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + 'Z';
  };
  const pathCache = {};
  const shapePath = name => (pathCache[name] ??= pathFromRadii(radiiOf(name)));
  const shapeState = new WeakMap();

  App.shape = {
    names: Object.keys(SHAPE_DEFS),
    path: shapePath,
    svg(name, { cls = '', label = '', rotate = 0, attrs = '' } = {}) {
      const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
      const tr = rotate ? ` style="transform:rotate(${rotate}deg)"` : '';
      return `<svg class="shape ${cls}" viewBox="0 0 100 100" ${a11y} ${attrs}><path fill="currentColor" data-shape="${name}" d="${shapePath(name)}"${tr}/></svg>`;
    },
    morph(target, name, { spring = 'bouncy', rotate = 0 } = {}) {
      const path = target.tagName.toLowerCase() === 'path' ? target : target.querySelector('path[data-shape]');
      const prev = shapeState.get(path) || {
        r: radiiOf(path.dataset.shape || 'circle').slice(),
        rot: parseFloat((/rotate\(([-\d.]+)deg\)/.exec(path.style.transform) || [])[1] || 0),
        anim: null,
      };
      prev.anim?.stop();
      const from = prev.r.slice();
      const to = radiiOf(name);
      const rot0 = prev.rot, rot1 = prev.rot + rotate;
      path.dataset.shape = name;
      const state = { r: from.slice(), rot: rot0, anim: null };
      shapeState.set(path, state);
      if (reduceMotion.matches) {
        state.r = to.slice(); state.rot = rot1;
        path.setAttribute('d', shapePath(name));
        path.style.transform = rot1 ? `rotate(${rot1}deg)` : '';
        return;
      }
      state.anim = App.spring.run({
        spring,
        onUpdate: x => {
          for (let i = 0; i < N; i++) state.r[i] = from[i] + (to[i] - from[i]) * x;
          state.rot = rot0 + (rot1 - rot0) * x;
          path.setAttribute('d', pathFromRadii(state.r));
          path.style.transform = `rotate(${state.rot.toFixed(2)}deg)`;
        },
        onDone: () => { state.anim = null; },
      });
    },
  };

  /* ===================================================================
     彈簧（與 style.css 的 linear() 同一組參數）
     =================================================================== */
  const SPRINGS = { bouncy: [520, .5], fast: [800, .6], default: [380, .8], slow: [200, .8], gentle: [120, .9] };
  const springFn = ([k, z]) => {
    const w = Math.sqrt(k), wd = w * Math.sqrt(1 - z * z);
    const x = t => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
    let dur = 0;
    for (let t = 0; t < 3; t += .004) if (Math.abs(1 - x(t)) > .002) dur = t;
    return { x, dur: dur + .004 };
  };
  const springCache = {};
  const getSpring = name => {
    if (!SPRINGS[name]) throw new Error(`unknown spring: ${name}`);
    return (springCache[name] ??= springFn(SPRINGS[name]));
  };
  App.spring = {
    run({ spring = 'bouncy', onUpdate, onDone }) {
      const s = getSpring(spring);
      const t0 = performance.now();
      let raf = 0, stopped = false;
      const step = now => {
        if (stopped) return;
        const t = (now - t0) / 1000;
        if (t >= s.dur) { onUpdate(1); onDone?.(); return; }
        onUpdate(s.x(t));
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return { stop() { stopped = true; cancelAnimationFrame(raf); } };
    },
    easing: name => getComputedStyle(document.documentElement).getPropertyValue(`--spring-${name}`).trim(),
    duration: name => Math.round(getSpring(name).dur * 1000),
  };

  /* ===================================================================
     Ticker：共用 rAF，只驅動「在視窗內」且分頁可見的項目
     =================================================================== */
  const tickItems = new Set();
  let tickRaf = 0, lastTick = 0;
  const tickIO = new IntersectionObserver(entries => {
    for (const e of entries) for (const it of tickItems) if (it.el === e.target) it.visible = e.isIntersecting;
    startTicker();
  }, { rootMargin: '60px' });
  function tickFrame(t) {
    tickRaf = 0;
    const dt = lastTick ? Math.min(64, t - lastTick) : 16;
    lastTick = t;
    let anyVisible = false;
    for (const it of tickItems) {
      if (!it.el.isConnected) { tickItems.delete(it); tickIO.unobserve(it.el); continue; }
      if (it.visible) { it.fn(t, dt); anyVisible = true; }
    }
    if (anyVisible && !document.hidden) tickRaf = requestAnimationFrame(tickFrame);
    else lastTick = 0;
  }
  function startTicker() {
    if (!tickRaf && !document.hidden && !reduceMotion.matches && [...tickItems].some(it => it.visible)) tickRaf = requestAnimationFrame(tickFrame);
  }
  App.ticker = {
    add(el, fn) {
      const it = { el, fn, visible: false };
      tickItems.add(it);
      tickIO.observe(el);
      return () => { tickItems.delete(it); tickIO.unobserve(el); };
    },
  };
  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('is-hidden', document.hidden);
    startTicker();
  });

  /* ===================================================================
     波浪進度（M3 Expressive wavy progress）
     =================================================================== */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  App.wavy = (el, opts = {}) => {
    const o = { value: 0, target: null, amplitude: 3, wavelength: 26, thickness: 4, speed: 1, ...opts };
    el.classList.add('wavy');
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    const svg = svgEl('svg', { 'aria-hidden': 'true' });
    const track = svgEl('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': o.thickness, 'stroke-linecap': 'round', opacity: '.22' });
    const active = svgEl('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': o.thickness, 'stroke-linecap': 'round' });
    const stop = svgEl('circle', { r: o.thickness / 2, fill: 'currentColor' });
    const mark = svgEl('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: '.55' });
    svg.append(track, active, stop, mark);
    el.replaceChildren(svg);
    let w = el.clientWidth || 200, h = el.clientHeight || 20;
    let shown = o.value, phase = 0, amp = o.amplitude, anim = null;
    const draw = () => {
      const cy = h / 2, th = o.thickness, x0 = th / 2, x1 = w - th / 2;
      const xa = x0 + (x1 - x0) * clamp(shown, 0, 1);
      const gap = th + 4;
      // 振幅在兩端收斂，避免 0% / 100% 時波浪突兀
      const a = amp * clamp(shown * 12, 0, 1) * clamp((1 - shown) * 30 + .4, 0, 1);
      let d = `M${x0.toFixed(1)} ${cy.toFixed(2)}`;
      for (let x = x0 + 2; x < xa; x += 2) d += `L${x.toFixed(1)} ${(cy + a * Math.sin(TAU * x / o.wavelength - phase)).toFixed(2)}`;
      if (xa > x0) d += `L${xa.toFixed(1)} ${(cy + a * Math.sin(TAU * xa / o.wavelength - phase)).toFixed(2)}`;
      active.setAttribute('d', shown > 0.001 ? d : '');
      const ts = Math.min(x1, xa + gap);
      track.setAttribute('d', ts < x1 - 1 ? `M${ts.toFixed(1)} ${cy}L${x1.toFixed(1)} ${cy}` : '');
      stop.setAttribute('cx', x1.toFixed(1));
      stop.setAttribute('cy', cy);
      stop.style.opacity = xa + gap < x1 - 2 ? '1' : '0';
      if (o.target != null) {
        const xt = x0 + (x1 - x0) * o.target;
        mark.setAttribute('d', `M${xt.toFixed(1)} ${cy - 9}L${xt.toFixed(1)} ${cy + 9}`);
      } else mark.setAttribute('d', '');
    };
    new ResizeObserver(() => { w = el.clientWidth || w; h = el.clientHeight || h; draw(); }).observe(el);
    App.ticker.add(el, (t, dt) => { phase += dt / 1000 * TAU * .7 * o.speed; draw(); });
    const set = (value, next = {}) => {
      Object.assign(o, next);
      if (next.amplitude != null) amp = next.amplitude;
      el.setAttribute('aria-valuenow', String(Math.round(value * 100)));
      anim?.stop();
      if (reduceMotion.matches) { shown = value; draw(); return; }
      const from = shown;
      anim = App.spring.run({ spring: 'slow', onUpdate: x => { shown = from + (value - from) * x; draw(); }, onDone: () => { anim = null; } });
    };
    el.setAttribute('aria-valuenow', String(Math.round(o.value * 100)));
    draw();
    return { set, el };
  };

  App.wavyRing = (el, opts = {}) => {
    const o = { value: 0, size: 120, thickness: 8, waves: 11, amplitude: 2.6, ...opts };
    el.classList.add('wavy-ring');
    el.style.width = el.style.height = `${o.size}px`;
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    const svg = svgEl('svg', { viewBox: `0 0 ${o.size} ${o.size}`, 'aria-hidden': 'true' });
    const track = svgEl('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': o.thickness, 'stroke-linecap': 'round', opacity: '.22' });
    const active = svgEl('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': o.thickness, 'stroke-linecap': 'round' });
    svg.append(track, active);
    el.prepend(svg);
    const c = o.size / 2, R = c - o.thickness / 2 - o.amplitude - 1;
    let shown = 0, phase = 0, anim = null;
    const pt = (ang, r) => `${(c + r * Math.cos(ang)).toFixed(2)} ${(c + r * Math.sin(ang)).toFixed(2)}`;
    const draw = () => {
      const start = -Math.PI / 2;
      const gap = (o.thickness + 6) / R;
      const end = start + TAU * clamp(shown, 0, 1);
      const activeEnd = shown >= .999 ? start + TAU : end;
      let d = '';
      for (let a = start; a <= activeEnd; a += .035) d += `${d ? 'L' : 'M'}${pt(a, R + o.amplitude * Math.sin(o.waves * a - phase) * clamp(shown * 10, 0, 1))}`;
      active.setAttribute('d', shown > .002 ? d : '');
      const ts = end + gap, te = start + TAU - gap;
      if (shown < .97 && te > ts) {
        const large = te - ts > Math.PI ? 1 : 0;
        track.setAttribute('d', `M${pt(ts, R)}A${R} ${R} 0 ${large} 1 ${pt(te, R)}`);
      } else track.setAttribute('d', '');
    };
    App.ticker.add(el, (t, dt) => { phase += dt / 1000 * 2.2; draw(); });
    const set = value => {
      el.setAttribute('aria-valuenow', String(Math.round(value * 1000) / 10));
      anim?.stop();
      if (reduceMotion.matches) { shown = value; draw(); return; }
      const from = shown;
      anim = App.spring.run({ spring: 'gentle', onUpdate: x => { shown = from + (value - from) * x; draw(); }, onDone: () => { anim = null; } });
    };
    set(o.value);
    return { set, el };
  };

  /* ===================================================================
     數字：odometer / countTo
     =================================================================== */
  App.odometer = (el, value, { format = fmt.num } = {}) => {
    el._odoTarget = value;
    el._odoFormat = format;
    if (el._odoPending) return;
    el._odoPending = true;
    requestAnimationFrame(() => {
      el._odoPending = false;
      // 讀執行當下的最新值，連續呼叫只會重繪一次
      const str = el._odoFormat(el._odoTarget);
      el.classList.add('odo');
      el.setAttribute('aria-label', str);
      const shape = str.replace(/\d/g, '0');
      const fresh = el._odoShape !== shape;
      if (fresh) {
        el._odoShape = shape;
        el.innerHTML = [...str].map(ch => /\d/.test(ch)
          ? `<span class="odo__d" aria-hidden="true"><span class="odo__strip">${'0123456789'.split('').map(n => `<span>${n}</span>`).join('')}</span></span>`
          : `<span class="odo__sep" aria-hidden="true">${esc(ch)}</span>`).join('');
      }
      // 套用時再讀一次最新值：延遲兩格的初次動畫不會蓋掉之後的新值
      const apply = () => {
        const latest = el._odoFormat(el._odoTarget);
        if (latest.replace(/\d/g, '0') !== el._odoShape) return;
        const strips = $$('.odo__strip', el);
        let i = 0;
        for (const ch of latest) if (/\d/.test(ch)) strips[i++].style.transform = `translateY(-${ch}em)`;
      };
      if (fresh && !reduceMotion.matches) requestAnimationFrame(() => requestAnimationFrame(apply));
      else apply();
    });
  };
  App.countTo = (el, to, { format = fmt.num, duration = 900 } = {}) => {
    el._countTarget = to;
    if (reduceMotion.matches) { el._countVal = to; el.textContent = format(to); return; }
    const from = el._countVal ?? 0;
    const t0 = performance.now();
    cancelAnimationFrame(el._countRaf);
    const step = now => {
      const target = el._countTarget;
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      el._countVal = p === 1 ? target : from + (target - from) * e;
      el.textContent = format(el._countVal);
      if (p < 1) el._countRaf = requestAnimationFrame(step);
    };
    el._countRaf = requestAnimationFrame(step);
  };

  /* ===================================================================
     標記產生器
     =================================================================== */
  App.catIcon = (cat, cls = '') => App.shape.svg(CATS[cat].shape, { cls, attrs: `data-cat="${cat}" style="color:var(--c)"` });
  App.catTag = cat => `<span class="cat-tag" data-cat="${cat}">${App.shape.svg(CATS[cat].shape)}${CATS[cat].name}</span>`;
  App.statusBadge = (status, { lg = false } = {}) =>
    `<span class="status${lg ? ' status--lg' : ''}" data-status="${status}">${App.shape.svg(STATUS[status].shape)}<span class="status__label">${STATUS[status].name}</span></span>`;
  App.setStatusBadge = (el, status) => {
    if (el.dataset.status === status) return;
    el.dataset.status = status;
    App.shape.morph(el.querySelector('svg'), STATUS[status].shape, { rotate: 72 });
    const label = el.querySelector('.status__label');
    if (reduceMotion.matches) { label.textContent = STATUS[status].name; return; }
    label.getAnimations().forEach(a => a.cancel());
    label.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-70%)', opacity: 0 }], { duration: 130, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => {
      // 以執行當下的狀態為準，連續切換時不會停在舊文字
      label.textContent = STATUS[el.dataset.status].name;
      label.animate([{ transform: 'translateY(70%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: App.spring.easing('bouncy'), fill: 'forwards' });
    }, 130);
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14, .88)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  };
  const SLA_SHAPE = { ok: 'cookie6', soon: 'sunny', over: 'boom', done: 'cookie12', late: 'boom' };
  const slaInner = c => {
    const s = App.sla(c);
    return { s, html: `${App.shape.svg(SLA_SHAPE[s.state])}<span class="sla__text">${s.label}</span>` };
  };
  App.slaChip = c => {
    const { s, html } = slaInner(c);
    return `<span class="sla" data-state="${s.state}" data-sla="${c.id}" title="處理時限 ${fmt.slaHours(CATS[c.cat].sla)}，${fmt.dateTime(c.due)} 到期">${html}</span>`;
  };
  function refreshSla() {
    for (const el of $$('[data-sla]')) {
      const c = caseById.get(el.dataset.sla);
      if (!c) continue;
      const s = App.sla(c);
      if (el.dataset.state !== s.state) {
        el.dataset.state = s.state;
        App.shape.morph(el.querySelector('svg'), SLA_SHAPE[s.state], { rotate: 45 });
      }
      el.querySelector('.sla__text').textContent = s.label;
    }
  }
  App.refreshSla = refreshSla;

  App.avatar = (name, { size = '', tone = 'primary', shape = 'cookie9' } = {}) => {
    const tones = { primary: ['var(--primary-container)', 'var(--on-primary-container)'], teal: ['var(--secondary-container)', 'var(--on-secondary-container)'], coral: ['var(--tertiary-container)', 'var(--on-tertiary-container)'], neutral: ['var(--surface-container-highest)', 'var(--on-surface-variant)'] };
    const [bg, fg] = tones[tone];
    // 民眾稱謂（陳先生）取姓；同仁取名字後兩字（品妤）
    const initials = /(先生|小姐|太太)$/.test(name) ? name[0] : name.length >= 3 ? name.slice(-2) : name.slice(-1);
    return `<span class="avatar${size ? ` avatar--${size}` : ''}" style="--av:${bg};--on-av:${fg}" aria-hidden="true">${App.shape.svg(shape)}<b>${esc(initials)}</b></span>`;
  };

  App.stepper = c => {
    const cur = STATUS[c.status].index;
    const allDone = c.status === 'closed';
    const at = {};
    for (const e of c.log) if (FLOW.includes(e.type)) at[e.type] = e.at;
    return `<ol class="stepper" aria-label="處理進度">${FLOW.map((k, i) => {
      const done = allDone || i < cur;
      const current = !allDone && i === cur;
      const shape = done ? 'cookie12' : current ? 'sunny' : 'circle';
      const mark = done ? App.icon('check') : `<b>${i + 1}</b>`;
      // 退件或改派後案件會退回前面的階段，舊一輪的接案/到場時間不屬於目前進度，只顯示已走到的階段
      const time = (done || current) && at[k] ? fmt.dateTime(at[k]) : current ? '進行中' : '—';
      return `<li class="stepper__step${done ? ' is-done' : ''}${current ? ' is-current' : ''}"${current ? ' aria-current="step"' : ''}>
        <span class="stepper__mark">${App.shape.svg(shape)}${mark}</span>
        <span class="stepper__name">${STATUS[k].stage}</span>
        <span class="stepper__time">${time}</span></li>`;
    }).join('')}</ol>`;
  };

  App.emptyState = ({ title, text = '', shape = 'cookie9' }) =>
    `<div class="empty">${App.shape.svg(shape)}<p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}</div>`;

  App.rating = (el, { value = 0, readonly = false, onChange, label = '滿意度' } = {}) => {
    let v = value;
    el.classList.add('rating');
    if (readonly) el.classList.add('rating--sm');
    el.setAttribute('role', readonly ? 'img' : 'radiogroup');
    el.setAttribute('aria-label', readonly ? `${label} ${v} 分（滿分 5 分）` : label);
    const tag = readonly ? 'span' : 'button';
    el.innerHTML = [1, 2, 3, 4, 5].map(n => `<${tag} ${readonly ? '' : `type="button" role="radio" aria-checked="${n === v}" aria-label="${n} 分"`} class="rating__btn${n <= v ? ' is-on' : ''}" data-v="${n}">${App.shape.svg(n <= v ? 'sunny' : 'circle')}</${tag}>`).join('');
    const paint = () => {
      $$('.rating__btn', el).forEach(b => {
        const n = +b.dataset.v;
        const on = n <= v;
        if (b.classList.contains('is-on') !== on) {
          b.classList.toggle('is-on', on);
          App.shape.morph(b.querySelector('svg'), on ? 'sunny' : 'circle', { rotate: on ? 45 : -45 });
        }
        if (!readonly) b.setAttribute('aria-checked', String(n === v));
      });
    };
    if (!readonly) {
      el.addEventListener('click', e => {
        const b = e.target.closest('.rating__btn');
        if (!b) return;
        v = +b.dataset.v;
        paint();
        onChange?.(v);
      });
      el.addEventListener('keydown', e => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        v = clamp(v + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1), 1, 5);
        paint();
        el.querySelector(`[data-v="${v}"]`).focus();
        onChange?.(v);
      });
    }
    return { set(n) { v = n; paint(); }, value: () => v };
  };

  App.loader = ({ size = 48, bare = false } = {}) => {
    const el = document.createElement('span');
    el.className = `loader${bare ? ' loader--bare' : ''}`;
    el.style.width = el.style.height = `${size}px`;
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-label', '處理中');
    el.innerHTML = App.shape.svg('softBurst');
    const seq = ['softBurst', 'cookie9', 'pentagon', 'pill', 'sunny', 'cookie4', 'oval'];
    let i = 0, last = 0;
    App.ticker.add(el, t => {
      if (t - last < 650) return;
      last = t;
      i = (i + 1) % seq.length;
      App.shape.morph(el.querySelector('svg'), seq[i], { spring: 'fast', rotate: 90 });
    });
    return el;
  };

  /* ===================================================================
     城市地圖：八個行政區以形狀呈現，依資料著色（熱度）或作為選擇器
     =================================================================== */
  const MAP_LAYOUT = {
    '雲嶺區': { x: 118, y: 108, r: 60, shape: 'cookie9', rot: 8 },
    '北岸區': { x: 300, y: 82, r: 52, shape: 'cookie6', rot: 0 },
    '山腳區': { x: 148, y: 240, r: 52, shape: 'squircle', rot: -12 },
    '舊城區': { x: 292, y: 206, r: 56, shape: 'cookie12', rot: 0 },
    '港埕區': { x: 452, y: 150, r: 56, shape: 'cookie9', rot: 20 },
    '溪洲區': { x: 214, y: 342, r: 48, shape: 'pentagon', rot: 6 },
    '新灣區': { x: 432, y: 300, r: 60, shape: 'cookie6', rot: 15 },
    '鹽田區': { x: 326, y: 362, r: 42, shape: 'oval', rot: 0 },
  };
  const HEAT = ['#F1EAFB', '#E2D4FA', '#CBB4F5', '#A98BE8', '#8466CC', '#5E43A8'];
  App.HEAT = HEAT;
  App.cityMap = (container, { values = {}, mode = 'heat', selected = null, onSelect } = {}) => {
    const LAND = 'M0 0H226C252 14 272 18 300 16C340 14 364 2 394 8C432 16 454 54 488 74C524 96 536 130 538 170C540 210 518 234 514 260C510 292 528 326 508 354C486 386 448 394 406 400C362 406 332 416 292 418L0 420Z';
    container.classList.add('city-map');
    container.classList.toggle('city-map--select', mode === 'select');
    container.innerHTML = `<svg viewBox="0 0 560 420" role="${mode === 'select' ? 'radiogroup' : 'group'}" aria-label="澄港市行政區${mode === 'select' ? '選擇' : '案件熱度'}地圖">
      <defs><clipPath id="cm-clip-${container.id || 'x'}"><rect width="560" height="420" rx="28"/></clipPath></defs>
      <g clip-path="url(#cm-clip-${container.id || 'x'})">
        <rect width="560" height="420" fill="#D8F3F1"/>
        <g fill="none" stroke="#7FD3CF" stroke-width="2" stroke-linecap="round" opacity=".7">
          <path d="M440 22c14-6 28-6 42 0s28 6 42 0"/><path d="M500 52c10-5 20-5 30 0s20 5 30 0"/>
          <path d="M520 400c10-5 20-5 30 0"/><path d="M430 414c14-6 28-6 42 0s28 6 42 0"/><path d="M536 300c8-4 16-4 24 0"/>
        </g>
        <path d="${LAND}" fill="#FFFFFF"/>
        <path d="M44 150C92 186 130 262 176 292S236 362 250 420" fill="none" stroke="#9EE3DF" stroke-width="9" stroke-linecap="round"/>
        <g fill="#E6E0E9">${[[44, 40], [70, 30], [58, 58]].map(([x, y]) => `<path d="M${x - 14} ${y + 10}L${x} ${y - 10}L${x + 14} ${y + 10}Z"/>`).join('')}</g>
        <text x="498" y="236" fill="#00696A" font-size="13" font-weight="700" letter-spacing="4" opacity=".75" style="writing-mode:vertical-rl">澄港灣</text>
      </g>
      <g class="city-map__districts"></g>
    </svg>`;
    const g = container.querySelector('.city-map__districts');
    const nodes = {};
    for (const d of DISTRICTS) {
      const L = MAP_LAYOUT[d.name];
      // heat 模式導向案件列表（link）；select 模式為單選（radio）
      const node = svgEl('g', { class: 'city-map__district', tabindex: '0', role: mode === 'select' ? 'radio' : 'link', 'data-district': d.name });
      node.innerHTML = `
        <circle class="pulse" cx="${L.x}" cy="${L.y}" r="${L.r * .9}" fill="none" stroke="var(--tertiary-vivid)" stroke-width="3" opacity="0"/>
        <circle class="focus-ring" cx="${L.x}" cy="${L.y}" r="${L.r + 7}" fill="none" stroke="var(--primary)" stroke-width="3"/>
        <g transform="translate(${L.x - L.r} ${L.y - L.r}) scale(${L.r / 50}) rotate(${L.rot} 50 50)"><path class="shape-path" d="${shapePath(L.shape)}"/></g>
        <text class="city-map__label" x="${L.x}" y="${mode === 'select' ? L.y + 6 : L.y - 3}" text-anchor="middle"></text>
        <text class="city-map__count" x="${L.x}" y="${L.y + 25}" text-anchor="middle"></text>`;
      node.addEventListener('click', () => onSelect?.(d.name));
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(d.name); } });
      g.append(node);
      nodes[d.name] = node;
    }
    let cur = { ...values }, sel = selected;
    const paint = () => {
      const vals = Object.values(cur);
      const max = Math.max(1, ...vals);
      const ranked = Object.entries(cur).sort((a, b) => b[1] - a[1]).map(e => e[0]);
      for (const d of DISTRICTS) {
        const n = nodes[d.name];
        const v = cur[d.name] ?? 0;
        let fill, ink;
        if (mode === 'select') {
          const on = sel === d.name;
          fill = on ? 'var(--primary)' : '#EDE6F6';
          ink = on ? '#fff' : 'var(--on-surface)';
          n.setAttribute('aria-checked', String(on));
          n.classList.toggle('is-active', on);
          n.setAttribute('aria-label', d.name);
        } else {
          const step = Math.min(HEAT.length - 1, Math.floor((v / max) * (HEAT.length - .01)));
          fill = HEAT[step];
          ink = step >= 3 ? '#fff' : 'var(--on-primary-container)';
          n.setAttribute('aria-label', `${d.name} ${v} 件，查看案件`);
          const hot = ranked.indexOf(d.name) < 2 && v > 0;
          n.querySelector('.pulse').classList.toggle('anim-pulse', hot);
        }
        n.querySelector('.shape-path').style.fill = fill;
        const label = n.querySelector('.city-map__label');
        label.textContent = d.short;
        label.setAttribute('fill', ink);
        const count = n.querySelector('.city-map__count');
        count.textContent = mode === 'select' ? '' : String(v);
        count.setAttribute('fill', ink);
      }
    };
    paint();
    return {
      update(v) { cur = { ...v }; paint(); },
      select(name) { sel = name; paint(); },
      highlight(name) { for (const [k, n] of Object.entries(nodes)) n.classList.toggle('is-active', k === name); },
    };
  };

  /* ===================================================================
     Toast（snackbar）：modal 開啟時移進最上層 dialog，避免被 top layer 蓋住
     =================================================================== */
  let toastHost = null;
  const openDialogs = [];
  const placeToastHost = () => {
    if (!toastHost) return;
    const top = openDialogs[openDialogs.length - 1];
    const parent = top || document.body;
    if (toastHost.parentElement !== parent) parent.append(toastHost);
  };
  App.toast = (msg, { sub = '', tone = '', action = null, duration = 4200, shape = null } = {}) => {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toast-host';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
    }
    placeToastHost();
    const t = document.createElement('div');
    t.className = `toast${tone ? ` toast--${tone}` : ''}`;
    const sh = shape || (tone === 'success' ? 'cookie12' : tone === 'error' ? 'boom' : 'sunny');
    t.innerHTML = `${App.shape.svg(sh)}<div class="toast__msg">${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>${action ? `<button type="button" class="toast__action">${esc(action.label)}</button>` : ''}<button type="button" class="icon-btn icon-btn--sm toast__close" aria-label="關閉通知">${App.icon('close')}</button>`;
    let timer = 0;
    const remove = () => {
      clearTimeout(timer);
      if (!t.isConnected || t.classList.contains('is-leaving')) return;
      t.classList.add('is-leaving');
      setTimeout(() => t.remove(), reduceMotion.matches ? 0 : 200);
    };
    if (action) t.querySelector('.toast__action').addEventListener('click', () => { action.onClick(); remove(); });
    t.querySelector('.toast__close').addEventListener('click', remove);
    toastHost.append(t);
    while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
    timer = setTimeout(remove, action ? Math.max(duration, 6000) : duration);
    t.addEventListener('pointerenter', () => clearTimeout(timer));
    t.addEventListener('pointerleave', () => { timer = setTimeout(remove, 2200); });
    return { close: remove };
  };

  /* ===================================================================
     Modal（<dialog>）
     =================================================================== */
  App.modal = ({ title, sub = '', icon = null, shape = 'cookie9', body = '', actions = [], size = '', onClose, note = '' }) => {
    const opener = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.className = `modal${size ? ` modal--${size}` : ''}`;
    const tid = `m${Math.random().toString(36).slice(2, 8)}`;
    dlg.setAttribute('aria-labelledby', tid);
    dlg.innerHTML = `
      <div class="modal__head">
        ${icon ? `<span class="modal__icon">${App.shape.svg(shape)}${App.icon(icon)}</span>` : ''}
        <div class="modal__titles"><h2 class="modal__title" id="${tid}">${esc(title)}</h2>${sub ? `<p class="modal__sub">${sub}</p>` : ''}</div>
        <button type="button" class="icon-btn modal__close" aria-label="關閉">${App.icon('close')}</button>
      </div>
      <div class="modal__body"></div>
      ${actions.length ? `<div class="modal__foot">${note ? `<span class="modal__note">${note}</span>` : ''}</div>` : ''}`;
    const bodyEl = dlg.querySelector('.modal__body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
    let closed = false;
    const close = value => {
      if (closed) return;
      closed = true;
      dlg.classList.add('is-closing');
      setTimeout(() => {
        dlg.close();
        dlg.remove();
        openDialogs.splice(openDialogs.indexOf(dlg), 1);
        placeToastHost();
        if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        onClose?.(value);
      }, reduceMotion.matches ? 0 : 160);
    };
    const api = { el: dlg, body: bodyEl, close };
    const foot = dlg.querySelector('.modal__foot');
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${a.variant && a.variant !== 'filled' ? ` btn--${a.variant}` : ''}`;
      b.innerHTML = `${a.icon ? App.icon(a.icon) : ''}${esc(a.label)}`;
      b.addEventListener('click', () => {
        const r = a.onClick ? a.onClick(api) : undefined;
        if (r !== false) close(a.value ?? a.label);
      });
      foot.append(b);
    });
    dlg.querySelector('.modal__close').addEventListener('click', () => close(null));
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(null); });
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(null);
    });
    document.body.append(dlg);
    dlg.showModal();
    openDialogs.push(dlg);
    placeToastHost();
    App.hydrate(dlg);
    const focusTarget = dlg.querySelector('[autofocus]') || dlg.querySelector('.modal__body input, .modal__body select, .modal__body textarea, .modal__body button') || foot?.lastElementChild;
    focusTarget?.focus();
    return api;
  };

  /* ---------- 共用流程對話框 ---------- */
  App.dispatchDialog = (ids, { onDone } = {}) => {
    const list = ids.map(id => caseById.get(id));
    const first = list[0];
    const sameCat = list.every(c => c.cat === first.cat);
    const reassign = list.some(isReassign);
    const options = sameCat ? App.route(first.cat, list.map(c => c.desc).join(' ')) : [];
    const rec = reassign && first.returned && options.every(o => o.unit !== 'police') && first.cat === 'noise'
      ? [{ unit: 'police', reason: '依局處退件意見改派', primary: true }, ...options.map(o => ({ ...o, primary: false }))]
      : options;
    const recKeys = rec.map(o => o.unit);
    const allUnits = [...recKeys, ...Object.keys(UNITS).filter(k => !recKeys.includes(k))];
    let unit = rec[0]?.unit || CATS[first.cat].unit;
    // 改派處理中的單一案件時標出目前承辦單位，派案員才知道要換到哪
    const currentUnit = ids.length === 1 && first.status !== 'received' ? first.unit : null;
    const body = document.createElement('div');
    body.className = 'stack';
    body.innerHTML = `
      ${reassign && first.returned ? `<div class="callout callout--warn">${App.icon('warning')}<div class="callout__title">${esc(first.returned.by)} 退件</div><div>${esc(first.returned.reason)}</div></div>` : ''}
      <div>
        <p class="modal__section-label">${ids.length > 1 ? `已選 ${ids.length} 件` : '案件'}</p>
        <div class="cluster">${list.slice(0, 4).map(c => `<span class="tag tag--outline mono">${c.id}</span>`).join('')}${list.length > 4 ? `<span class="tag">另 ${list.length - 4} 件</span>` : ''}${sameCat ? App.catTag(first.cat) : '<span class="tag tag--warn">類別不一致，請確認承辦單位</span>'}</div>
      </div>
      <div>
        <p class="modal__section-label">承辦單位</p>
        <div class="chip-set" role="radiogroup" aria-label="承辦單位">${allUnits.map(k => {
          const r = rec.find(o => o.unit === k);
          return `<button type="button" class="chip${r ? ' chip--suggest' : ''}" role="radio" aria-checked="${k === unit}" data-unit="${k}" title="${r ? esc(r.reason) : ''}"><span class="chip__check">${App.icon('check')}</span>${UNITS[k].org} ${UNITS[k].name}${k === currentUnit ? '<span class="chip__score">目前承辦</span>' : r?.primary ? '<span class="chip__score">建議</span>' : ''}</button>`;
        }).join('')}</div>
        <p class="t-small muted" data-reason style="margin-top:8px"></p>
      </div>
      <div class="tf tf--select">
        <select class="tf__input" id="dd-team"></select>
        <label class="tf__label" for="dd-team">交辦區隊</label>
      </div>
      <div class="tf">
        <textarea class="tf__input" id="dd-note" placeholder=" " maxlength="120" style="min-height:88px"></textarea>
        <label class="tf__label" for="dd-note">派案備註（選填）</label>
      </div>`;
    const teamSel = body.querySelector('#dd-team');
    const reasonEl = body.querySelector('[data-reason]');
    const paint = () => {
      body.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.unit === unit)));
      const teams = [...new Set(list.map(c => UNITS[unit].team(DISTRICT_BY_NAME[c.district])))];
      teamSel.innerHTML = (teams.length > 1 ? [`依案件行政區自動分配（${teams.length} 個區隊）`] : teams).map(t => `<option>${esc(t)}</option>`).join('');
      const r = rec.find(o => o.unit === unit);
      reasonEl.textContent = r ? `建議原因：${r.reason}` : `時限 ${sameCat ? fmt.slaHours(CATS[first.cat].sla) : '依各案類別'}，派案後由局處 30 分鐘內接案`;
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-unit]');
      if (b) { unit = b.dataset.unit; paint(); }
    });
    paint();
    App.modal({
      title: reassign ? '改派案件' : ids.length > 1 ? `批次派案（${ids.length} 件）` : '分類派案',
      sub: ids.length === 1 ? esc(first.title) : '依類別推薦承辦單位，可手動調整',
      icon: 'dispatch', shape: 'cookie9', body, size: 'lg',
      actions: [
        { label: '取消', variant: 'text' },
        {
          label: reassign ? '確認改派' : '確認派案', icon: 'send',
          onClick: () => {
            const teamVal = teamSel.value.startsWith('依案件') ? null : teamSel.value;
            const undo = App.dispatch(ids, { unit, team: teamVal, note: body.querySelector('#dd-note').value.trim() });
            App.toast(ids.length > 1 ? `已派案 ${ids.length} 件` : `${first.id} 已${reassign ? '改派' : '派案'}`, { sub: `${UNITS[unit].full}`, tone: 'success', action: { label: '復原', onClick: () => { undo(); App.toast('已復原派案'); } } });
            onDone?.(undo);
          },
        },
      ],
    });
  };

  App.urgeCase = id => {
    const c = caseById.get(id);
    const undo = App.urge(id);
    App.toast(`已催辦 ${c.team || App.unitOf(c).full}`, { sub: `${c.id} · ${App.sla(c).label}`, tone: 'success', shape: 'sunny', action: { label: '復原', onClick: () => { undo(); App.toast('已撤回催辦'); } } });
    return undo;
  };

  App.callbackDialog = (id, { onDone } = {}) => {
    const c = caseById.get(id);
    let rating = 0;
    const body = document.createElement('div');
    body.className = 'stack';
    body.innerHTML = `
      <div class="card card--lowest" style="display:grid;gap:6px">
        <div class="cluster">${App.catTag(c.cat)}<span class="mono strong">${c.id}</span><span class="muted t-small">${esc(c.caller.name)} · ${esc(c.caller.phone)}</span></div>
        <p class="t-small muted">處理結果：${esc(c.result || '—')}</p>
      </div>
      <div>
        <p class="modal__section-label">民眾滿意度</p>
        <div class="cluster"><div data-rating></div><span class="strong" data-rating-text>請點選 1–5 分</span></div>
        <p class="tf__support" data-rating-err hidden style="color:var(--error);margin-left:0">請先記錄滿意度分數</p>
      </div>
      <div class="tf">
        <textarea class="tf__input" id="cb-feedback" placeholder=" " maxlength="200" style="min-height:96px"></textarea>
        <label class="tf__label" for="cb-feedback">民眾意見（選填）</label>
      </div>`;
    const words = ['', '非常不滿意', '不滿意', '普通', '滿意', '非常滿意'];
    App.rating(body.querySelector('[data-rating]'), {
      value: 0,
      onChange: v => { rating = v; body.querySelector('[data-rating-text]').textContent = `${v} 分 · ${words[v]}`; body.querySelector('[data-rating-err]').hidden = true; },
    });
    App.modal({
      title: '回訪民眾', sub: `${esc(c.title)}`, icon: 'phone', shape: 'clover8', body,
      actions: [
        { label: '民眾未接，稍後再撥', variant: 'text', onClick: () => { App.toast('已排入 30 分鐘後重撥', { sub: c.id }); } },
        {
          label: '完成回訪並結案', icon: 'check',
          onClick: () => {
            if (!rating) { body.querySelector('[data-rating-err]').hidden = false; return false; }
            const undo = App.closeWithRating(id, rating, body.querySelector('#cb-feedback').value.trim());
            App.toast(`${c.id} 已結案`, { sub: `滿意度 ${rating} 分`, tone: 'success', action: { label: '復原', onClick: () => { undo(); App.toast('已復原結案'); } } });
            onDone?.(undo);
          },
        },
      ],
    });
  };

  /* ===================================================================
     Popover
     =================================================================== */
  let openPop = null;
  App.popover = (anchor, { content, className = '', onOpen } = {}) => {
    if (openPop) {
      const same = openPop.anchor === anchor;
      openPop.close();
      if (same) return null;
    }
    const el = document.createElement('div');
    el.className = `popover ${className}`;
    if (typeof content === 'string') el.innerHTML = content; else el.append(content);
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const left = clamp(r.right - w, 12, innerWidth - w - 12);
    el.style.left = `${left}px`;
    el.style.top = `${r.bottom + 8}px`;
    el.style.setProperty('--origin', `${r.left + r.width / 2 - left}px 0`);
    anchor.setAttribute('aria-expanded', 'true');
    const onDown = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') { close(); anchor.focus(); } };
    const close = () => {
      if (!el.isConnected || el.classList.contains('is-closing')) return;
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      removeEventListener('resize', close);
      el.classList.add('is-closing');
      setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 140);
      if (openPop?.el === el) openPop = null;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', close);
    openPop = { el, anchor, close };
    App.hydrate(el);
    onOpen?.(el, close);
    return { el, close };
  };

  /* ===================================================================
     Tabs / segmented
     =================================================================== */
  App.tabs = (list, { onChange } = {}) => {
    const tabs = $$('[role="tab"]', list);
    let ink = list.querySelector('.tabs__ink');
    if (!ink) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.append(ink); }
    const pill = list.classList.contains('tabs--pill');
    const place = () => {
      const t = tabs.find(x => x.getAttribute('aria-selected') === 'true') || tabs[0];
      const inset = pill ? 0 : 12;
      list.style.setProperty('--ink-x', `${t.offsetLeft + inset}px`);
      list.style.setProperty('--ink-w', `${t.offsetWidth - inset * 2}px`);
    };
    const select = (i, focus = false) => {
      // 多個 tab 共用同一個 panel（篩選型分頁）時，先全部隱藏再顯示選中的，避免被後面的 tab 蓋回 hidden
      const panelOf = t => t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
      tabs.forEach((t, k) => {
        t.setAttribute('aria-selected', String(k === i));
        t.tabIndex = k === i ? 0 : -1;
        const panel = panelOf(t);
        if (panel) panel.hidden = true;
      });
      const shown = panelOf(tabs[i]);
      if (shown) shown.hidden = false;
      if (focus) tabs[i].focus();
      place();
      onChange?.(i, tabs[i]);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); select((i + k + tabs.length) % tabs.length, true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); }
        if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
      });
    });
    tabs.forEach(t => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
    new ResizeObserver(place).observe(list);
    document.fonts?.ready.then(place);
    place();
    return { select, refresh: place };
  };

  App.segmented = (group, { onChange } = {}) => {
    const btns = $$('button[data-value]', group);
    const set = (v, fire = true) => {
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
      if (fire) onChange?.(v, btns.find(b => b.dataset.value === v));
    };
    btns.forEach(b => b.addEventListener('click', () => { if (b.getAttribute('aria-pressed') !== 'true') set(b.dataset.value); }));
    return { set, value: () => btns.find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.value };
  };

  /* ===================================================================
     Hydrate：補齊 data-shape / data-icon 的 SVG 內容
     =================================================================== */
  App.hydrate = (root = document) => {
    for (const p of $$('path[data-shape]:not([d])', root)) {
      p.setAttribute('d', shapePath(p.dataset.shape));
      if (!p.hasAttribute('fill')) p.setAttribute('fill', 'currentColor');
    }
    for (const s of $$('svg[data-icon]:not([data-hydrated])', root)) {
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2');
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
      s.setAttribute('aria-hidden', 'true');
      s.classList.add('ico');
      s.innerHTML = ICONS[s.dataset.icon];
      s.dataset.hydrated = '';
    }
  };

  /* ===================================================================
     Reveal / 動畫暫停
     =================================================================== */
  const revealIO = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
  App.reveal = (root = document) => {
    const els = $$('[data-reveal]:not(.is-in)', root);
    const vh = innerHeight;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      // 初次載入已在視窗內的直接顯示（仍有進場動畫），其餘交給 IO
      if (r.top < vh && r.bottom > 0) requestAnimationFrame(() => el.classList.add('is-in'));
      else revealIO.observe(el);
    }
    // 保底：無論 IO 是否觸發，2.5 秒後全部顯示
    setTimeout(() => els.forEach(el => el.classList.add('is-in')), 2500);
  };
  const animIO = new IntersectionObserver(entries => {
    for (const e of entries) e.target.classList.toggle('is-paused', !e.isIntersecting);
  });
  // 除了明確標記的 [data-anim]，所有 .panel 與頁首也自動納入（其中的 SLA 徽章、stepper 等都有循環動畫）
  const watchAnim = (root = document) => $$('[data-anim], .panel, .page-head', root).forEach(el => animIO.observe(el));
  App.watchAnim = watchAnim;

  /* ===================================================================
     計數同步
     =================================================================== */
  function refreshClock() {
    const now = App.now();
    $$('[data-clock]').forEach(el => { el.textContent = fmt.time(now); });
    $$('[data-today]').forEach(el => { el.textContent = fmt.day(now); });
  }
  App.refreshClock = refreshClock;

  function refreshCounts() {
    for (const el of $$('[data-count]')) {
      const n = App.count(el.dataset.count);
      el.textContent = fmt.num(n);
      el.toggleAttribute('data-zero', n === 0);
    }
  }
  App.refreshCounts = refreshCounts;

  /* ===================================================================
     外殼行為
     =================================================================== */
  const currentPage = () => {
    const f = location.pathname.split('/').pop() || 'index.html';
    return f.replace(/\.html?$/, '') || 'index';
  };

  function initNav() {
    const page = currentPage();
    for (const a of $$('[data-nav]')) {
      const on = a.dataset.nav === page;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    // rail 標誌：hover 時 morph
    const brand = $('.rail__brand .shape');
    if (brand) {
      const host = brand.closest('a');
      host.addEventListener('pointerenter', () => App.shape.morph(brand, 'sunny', { rotate: 30 }));
      host.addEventListener('pointerleave', () => App.shape.morph(brand, 'cookie12', { rotate: -30 }));
    }
  }

  function initDrawer() {
    const openers = $$('[data-drawer-open]');
    if (!openers.length) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'drawer';
    dlg.setAttribute('aria-label', '主要選單');
    const links = $$('.rail__item').map(a => {
      const label = a.querySelector('.rail__label').textContent;
      const icon = a.querySelector('.rail__ind svg').outerHTML;
      const badge = a.querySelector('[data-count]');
      return `<a class="drawer__link" href="${a.getAttribute('href')}" data-nav="${a.dataset.nav}">${icon}${esc(label)}${badge ? `<span class="badge" data-count="${badge.dataset.count}"></span>` : ''}</a>`;
    }).join('');
    dlg.innerHTML = `
      <div class="drawer__head">
        <span class="drawer__mark" aria-hidden="true">${App.shape.svg('cookie12')}<b>1999</b></span>
        <span class="drawer__name">陳情案件管理<small>澄港市 1999 市民熱線</small></span>
        <button type="button" class="icon-btn" data-drawer-close aria-label="關閉選單">${App.icon('close')}</button>
      </div>
      <nav class="drawer__nav" aria-label="主要導覽">${links}</nav>
      <div class="drawer__foot">
        <div><b style="color:var(--on-surface)">${PEOPLE.me.name}</b> · ${PEOPLE.me.role}<br>${PEOPLE.me.shift} · 席位 ${PEOPLE.me.seat}</div>
        <a href="../../index.html">${App.icon('back', 'ico--sm')}返回目錄</a>
      </div>`;
    document.body.append(dlg);
    const close = () => {
      if (!dlg.open || dlg.classList.contains('is-closing')) return;
      dlg.classList.add('is-closing');
      setTimeout(() => {
        dlg.classList.remove('is-closing');
        dlg.close();
        openDialogs.splice(openDialogs.indexOf(dlg), 1);
        placeToastHost();
      }, reduceMotion.matches ? 0 : 170);
    };
    openers.forEach(b => b.addEventListener('click', () => {
      if (dlg.open) return;
      dlg.showModal();
      openDialogs.push(dlg);
      placeToastHost();
    }));
    dlg.querySelector('[data-drawer-close]').addEventListener('click', close);
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX > r.right) close();
    });
  }

  function initSearch() {
    const form = $('form[data-search]');
    if (!form) return;
    const input = form.querySelector('input');
    const panel = document.createElement('div');
    panel.className = 'search__panel';
    panel.hidden = true;
    panel.id = 'search-panel';
    panel.setAttribute('role', 'listbox');
    form.append(panel);
    input.setAttribute('aria-controls', 'search-panel');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('autocomplete', 'off');
    let items = [], cursor = -1;
    const render = () => {
      const q = input.value.trim();
      if (!q) { panel.hidden = true; return; }
      const ql = q.toLowerCase();
      const hits = cases.filter(c => c.id.toLowerCase().includes(ql) || c.title.includes(q) || c.address.includes(q) || c.district.includes(q) || c.caller.phone.includes(q) || CATS[c.cat].name.includes(q)).slice(0, 6);
      items = hits;
      cursor = -1;
      panel.innerHTML = hits.length
        ? `<p class="search__head">案件 · 符合 ${hits.length} 筆${hits.length === 6 ? '以上' : ''}</p>${hits.map((c, i) => `<a class="search__item" role="option" id="sr-${i}" href="case.html?id=${c.id}" data-cat="${c.cat}">${App.shape.svg(CATS[c.cat].shape)}<span class="truncate"><b class="truncate">${esc(c.title)}</b><small>${c.id} · ${c.district}${esc(c.address)}</small></span>${App.statusBadge(c.status)}</a>`).join('')}<a class="search__all" href="cases.html?q=${encodeURIComponent(q)}">${App.icon('search', 'ico--sm')}在案件列表搜尋「${esc(q)}」</a>`
        : `<p class="search__empty">找不到符合「${esc(q)}」的案件。可輸入案號、地址、行政區或電話末三碼。</p>`;
      panel.hidden = false;
    };
    const move = d => {
      const opts = $$('.search__item', panel);
      if (!opts.length) return;
      cursor = (cursor + d + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === cursor)));
      input.setAttribute('aria-activedescendant', opts[cursor].id);
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      if (e.key === 'Escape') { panel.hidden = true; form.classList.remove('is-open'); input.blur(); }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (cursor >= 0 && items[cursor]) location.href = `case.html?id=${items[cursor].id}`;
      else if (q) location.href = `cases.html?q=${encodeURIComponent(q)}`;
      else input.focus();
    });
    document.addEventListener('pointerdown', e => {
      if (!form.contains(e.target) && !e.target.closest('[data-search-toggle]')) { panel.hidden = true; form.classList.remove('is-open'); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
        e.preventDefault();
        form.classList.add('is-open');
        input.focus();
      }
    });
    $$('[data-search-toggle]').forEach(b => b.addEventListener('click', () => { form.classList.add('is-open'); input.focus(); }));
  }

  function initNotify() {
    for (const btn of $$('[data-notify]')) {
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        const tones = { error: 'var(--error)', coral: 'var(--tertiary-vivid)', warn: 'var(--warn-vivid)', primary: 'var(--primary)' };
        const html = `<div class="popover__head"><span class="popover__title">通知</span><button type="button" class="btn btn--text btn--sm" data-read-all>全部標為已讀</button></div>
          ${DATA.notices.map(n => {
            const inner = `${App.shape.svg(n.shape, { attrs: `style="color:${tones[n.tone]}"` })}<span><b>${esc(n.title)}</b><small>${esc(n.sub)}</small></span>`;
            return n.href ? `<a class="popover__item${n.read ? ' is-read' : ''}" href="${n.href}" data-notice="${n.id}">${inner}</a>` : `<div class="popover__item${n.read ? ' is-read' : ''}" data-notice="${n.id}">${inner}</div>`;
          }).join('')}`;
        App.popover(btn, {
          content: html,
          onOpen: (el, close) => {
            el.querySelector('[data-read-all]').addEventListener('click', () => {
              DATA.notices.forEach(n => { n.read = true; });
              el.querySelectorAll('.popover__item').forEach(i => i.classList.add('is-read'));
              refreshCounts();
              App.toast('通知已全部標為已讀');
              close();
            });
            el.querySelectorAll('a[data-notice]').forEach(a => a.addEventListener('click', () => {
              DATA.notices.find(n => n.id === a.dataset.notice).read = true;
              refreshCounts();
            }));
          },
        });
      });
    }
  }

  let onDuty = true;
  function setDuty(v) {
    onDuty = v;
    for (const b of $$('[data-duty]')) {
      b.setAttribute('aria-pressed', String(v));
      const label = b.querySelector('[data-duty-label]');
      if (label) label.textContent = v ? '接聽中' : '暫離';
    }
    App.toast(v ? '已恢復接聽，來電將分配到你的席位' : '已設為暫離，來電暫停分配', { sub: `席位 ${PEOPLE.me.seat}` });
  }
  function initProfile() {
    $$('[data-duty]').forEach(b => b.addEventListener('click', () => setDuty(!onDuty)));
    for (const btn of $$('[data-profile]')) {
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-expanded', 'false');
      btn.addEventListener('click', () => {
        App.popover(btn, {
          content: `<div class="popover__head">${App.avatar(PEOPLE.me.name, { size: 'lg', tone: 'coral' })}<div><div class="popover__title">${PEOPLE.me.name}</div><div class="t-small muted">${PEOPLE.me.role} · ${PEOPLE.me.team}</div></div></div>
            <div class="popover__row"><span class="t-small muted">值班</span><span class="strong">${PEOPLE.me.shift}</span></div>
            <div class="popover__row"><span class="t-small muted">席位</span><span class="strong">${PEOPLE.me.seat}</span></div>
            <label class="popover__row" style="cursor:pointer"><span class="strong">接聽來電</span><input type="checkbox" class="switch" role="switch" data-duty-switch ${onDuty ? 'checked' : ''}></label>
            <div class="popover__row"><a href="../../index.html" class="btn btn--text btn--sm" style="margin-left:-12px">${App.icon('back')}返回目錄</a><span class="t-small muted">今日已派案 ${cases.filter(c => App.isToday(c.created) && c.log.some(e => e.type === 'dispatched' && e.actor === MY_NAME)).length} 件</span></div>`,
          onOpen: el => {
            el.querySelector('[data-duty-switch]').addEventListener('change', e => setDuty(e.target.checked));
          },
        });
      });
    }
  }

  /* ---------- 頂列捲動狀態、FAB 收合 ---------- */
  function initScroll() {
    const fab = $('[data-fab]');
    let lastY = scrollY, ticking = false;
    const update = () => {
      ticking = false;
      const y = scrollY;
      document.documentElement.toggleAttribute('data-scrolled', y > 8);
      if (fab) {
        if (y > lastY + 4 && y > 160) fab.classList.add('is-compact');
        else if (y < lastY - 4 || y < 160) fab.classList.remove('is-compact');
      }
      lastY = y;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ===================================================================
     FAB → 快速受理 sheet（container transform：clip-path 從 FAB 外框展開）
     =================================================================== */
  let sheet = null;
  function buildQuickIntake(fab) {
    const wrap = document.createElement('div');
    wrap.className = 'fab-sheet-wrap';
    const scrim = document.createElement('div');
    scrim.className = 'fab-scrim';
    wrap.innerHTML = `
      <section class="fab-sheet" id="quick-intake" role="dialog" aria-modal="false" aria-labelledby="qi-title">
        <div class="fab-sheet__content">
          <div class="fab-sheet__head">
            ${App.shape.svg('cookie9')}
            <div><h2 class="fab-sheet__title" id="qi-title">快速受理</h2><p class="fab-sheet__sub">1999 來電 · 席位 ${PEOPLE.me.seat} · ${PEOPLE.me.name}</p></div>
            <button type="button" class="icon-btn" data-qi-close aria-label="關閉快速受理">${App.icon('close')}</button>
          </div>
          <form class="fab-sheet__body" novalidate id="qi-form">
            <div class="tf" data-field="phone">
              <input class="tf__input" id="qi-phone" type="tel" inputmode="tel" placeholder=" " autocomplete="off" aria-describedby="qi-phone-s">
              <label class="tf__label" for="qi-phone">來電號碼<span class="tf__req">*</span></label>
              <p class="tf__support" id="qi-phone-s">例：0912-345-678 或 07-1234567</p>
            </div>
            <div class="tf" data-field="desc">
              <textarea class="tf__input" id="qi-desc" placeholder=" " maxlength="300" aria-describedby="qi-desc-s" style="min-height:104px"></textarea>
              <label class="tf__label" for="qi-desc">陳情內容<span class="tf__req">*</span></label>
              <p class="tf__support" id="qi-desc-s"><span data-desc-msg>描述地點與狀況，系統會即時推薦類別</span><span class="tf__count" data-desc-count>0/300</span></p>
            </div>
            <div data-field="cat">
              <p class="modal__section-label" style="display:flex;align-items:center;gap:6px">${App.icon('sparkle', 'ico--sm')}推薦類別</p>
              <div class="chip-set" role="radiogroup" aria-label="案件類別" data-qi-cats>${CAT_KEYS.map(k => `<button type="button" class="chip chip--cat" data-cat="${k}" role="radio" aria-checked="false">${App.shape.svg(CATS[k].shape)}${CATS[k].name}<span class="chip__score" hidden></span></button>`).join('')}</div>
              <p class="tf__support" data-cat-msg style="margin-left:0">承辦單位會依類別自動帶入</p>
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.4fr);gap:12px">
              <div class="tf tf--select" data-field="district">
                <select class="tf__input" id="qi-district"><option value="">請選擇</option>${DISTRICTS.map(d => `<option>${d.name}</option>`).join('')}</select>
                <label class="tf__label" for="qi-district">行政區<span class="tf__req">*</span></label>
              </div>
              <div class="tf" data-field="address">
                <input class="tf__input" id="qi-address" placeholder=" " autocomplete="off">
                <label class="tf__label" for="qi-address">地點 / 地址<span class="tf__req">*</span></label>
              </div>
            </div>
            <div data-qi-dup></div>
          </form>
          <div class="fab-sheet__foot">
            <a class="btn btn--text" href="intake.html" data-qi-full>${App.icon('open')}完整受理表單</a>
            <button type="submit" form="qi-form" class="btn">${App.icon('send')}建立案件</button>
          </div>
        </div>
      </section>`;
    document.body.append(scrim, wrap);
    const el = wrap.querySelector('.fab-sheet');
    const form = el.querySelector('form');
    const f = id => el.querySelector(id);
    let pickedCat = null, manualCat = false;

    const field = name => el.querySelector(`[data-field="${name}"]`);
    const setErr = (name, msg) => {
      const fe = field(name);
      fe.classList.toggle('is-error', !!msg);
      const sup = name === 'cat' ? fe.querySelector('[data-cat-msg]') : name === 'desc' ? fe.querySelector('[data-desc-msg]') : fe.querySelector('.tf__support');
      if (sup && msg) { sup.dataset.orig ??= sup.textContent; sup.textContent = msg; if (name === 'cat') sup.style.color = 'var(--error)'; }
      if (sup && !msg && sup.dataset.orig != null) { sup.textContent = sup.dataset.orig; sup.style.color = ''; }
    };
    const paintCats = () => {
      const desc = f('#qi-desc').value;
      const rank = App.classify(desc);
      if (!manualCat) pickedCat = rank[0]?.cat || null;
      const order = [...rank.map(r => r.cat), ...CAT_KEYS.filter(k => !rank.some(r => r.cat === k))];
      const box = el.querySelector('[data-qi-cats]');
      order.forEach(k => {
        const b = box.querySelector(`[data-cat="${k}"]`);
        box.append(b);
        const r = rank.find(x => x.cat === k);
        const sc = b.querySelector('.chip__score');
        sc.hidden = !r;
        if (r) sc.textContent = `${Math.round(r.score * 100)}%`;
        b.classList.toggle('chip--suggest', !!r && k !== pickedCat);
        b.setAttribute('aria-checked', String(k === pickedCat));
      });
      const msg = el.querySelector('[data-cat-msg]');
      if (pickedCat) {
        const routes = App.route(pickedCat, desc);
        msg.textContent = `承辦：${UNITS[routes[0].unit].full} · 時限 ${fmt.slaHours(CATS[pickedCat].sla)}${routes[0].unit !== CATS[pickedCat].unit ? `（${routes[0].reason}）` : ''}`;
        msg.style.color = '';
        delete msg.dataset.orig;
        field('cat').classList.remove('is-error');
      } else if (!field('cat').classList.contains('is-error')) {
        msg.textContent = desc.trim() ? '找不到明確關鍵字，請手動選擇類別' : '承辦單位會依類別自動帶入';
      }
      paintDup();
    };
    const paintDup = () => {
      const box = el.querySelector('[data-qi-dup]');
      const district = f('#qi-district').value;
      const address = f('#qi-address').value.trim();
      if (!pickedCat || (!district && address.length < 2)) { box.innerHTML = ''; return; }
      const sim = App.findSimilar({ cat: pickedCat, district, address, text: f('#qi-desc').value }, 2);
      box.innerHTML = sim.length
        ? `<div class="callout callout--warn">${App.icon('copy')}<div class="callout__title">可能重複陳情（${sim.length} 件）</div><div>${sim.map(s => `<a href="case.html?id=${s.c.id}">${s.c.id}</a> ${esc(s.c.title)}（${fmt.rel(s.c.created)}，${STATUS[s.c.status].name}）`).join('<br>')}</div></div>`
        : '';
    };
    const updateFullLink = () => {
      const q = new URLSearchParams();
      const vals = { phone: f('#qi-phone').value.trim(), desc: f('#qi-desc').value.trim(), district: f('#qi-district').value, address: f('#qi-address').value.trim(), cat: pickedCat || '' };
      Object.entries(vals).forEach(([k, v]) => { if (v) q.set(k, v); });
      el.querySelector('[data-qi-full]').href = `intake.html${q.toString() ? `?${q}` : ''}`;
    };
    let debounce = 0;
    f('#qi-desc').addEventListener('input', () => {
      el.querySelector('[data-desc-count]').textContent = `${f('#qi-desc').value.length}/300`;
      clearTimeout(debounce);
      debounce = setTimeout(paintCats, 140);
      if (f('#qi-desc').value.trim().length >= 8) setErr('desc', '');
      updateFullLink();
    });
    el.querySelector('[data-qi-cats]').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      manualCat = true;
      pickedCat = b.dataset.cat;
      paintCats();
      updateFullLink();
    });
    f('#qi-district').addEventListener('change', () => { setErr('district', ''); paintDup(); updateFullLink(); });
    f('#qi-address').addEventListener('input', () => { if (f('#qi-address').value.trim().length >= 3) setErr('address', ''); paintDup(); updateFullLink(); });
    f('#qi-phone').addEventListener('input', () => { setErr('phone', ''); updateFullLink(); });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const phone = f('#qi-phone').value.trim();
      const desc = f('#qi-desc').value.trim();
      const district = f('#qi-district').value;
      const address = f('#qi-address').value.trim();
      const errs = [];
      if (!App.PHONE_RE.test(phone)) { setErr('phone', phone ? '號碼格式不正確' : '請輸入來電號碼'); errs.push('#qi-phone'); }
      if (desc.length < 8) { setErr('desc', '請至少輸入 8 個字的陳情內容'); errs.push('#qi-desc'); }
      if (!pickedCat) { setErr('cat', '請選擇案件類別'); errs.push('[data-qi-cats] [data-cat]'); }
      if (!district) { setErr('district', '請選擇'); errs.push('#qi-district'); }
      if (address.length < 3) { setErr('address', '請輸入地點'); errs.push('#qi-address'); }
      if (errs.length) {
        el.querySelector(errs[0]).focus();
        App.toast(`尚有 ${errs.length} 個欄位需要確認`, { tone: 'error' });
        return;
      }
      const { c, undo } = App.createCase({ phone: App.maskPhone(phone), desc, cat: pickedCat, district, address, title: `${address}${CATS[pickedCat].name}陳情` });
      form.reset();
      manualCat = false; pickedCat = null;
      el.querySelector('[data-desc-count]').textContent = '0/300';
      paintCats();
      updateFullLink();
      close();
      App.toast(`已建立 ${c.id}`, { sub: `${CATS[c.cat].name} · ${c.district} · 待派案`, tone: 'success', action: { label: '復原', onClick: () => { undo(); App.toast(`已撤銷 ${c.id}`); } } });
    });

    // 依 FAB 實際位置算出 clip-path 起點，讓 sheet 從 FAB 外框長出來
    const clipFromFab = () => {
      const sr = el.getBoundingClientRect();
      const fr = fab.getBoundingClientRect();
      const top = Math.max(0, fr.top - sr.top), left = Math.max(0, fr.left - sr.left);
      const right = Math.max(0, sr.right - fr.right), bottom = Math.max(0, sr.bottom - fr.bottom);
      const radius = getComputedStyle(fab).borderRadius;
      el.style.setProperty('--clip-from', `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius})`);
    };
    const open = () => {
      if (el.classList.contains('is-open')) return;
      el.style.transition = 'none';
      clipFromFab();
      el.getBoundingClientRect();
      el.style.transition = '';
      el.classList.add('is-open');
      scrim.classList.add('is-open');
      fab.setAttribute('aria-expanded', 'true');
      setTimeout(() => { if (el.classList.contains('is-open')) f('#qi-phone').focus({ preventScroll: true }); }, reduceMotion.matches ? 0 : 220);
    };
    const close = () => {
      if (!el.classList.contains('is-open')) return;
      clipFromFab();
      el.classList.remove('is-open');
      scrim.classList.remove('is-open');
      fab.setAttribute('aria-expanded', 'false');
      if (el.contains(document.activeElement)) fab.focus({ preventScroll: true });
    };
    el.querySelector('[data-qi-close]').addEventListener('click', close);
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('is-open') && !openDialogs.length) close(); });
    paintCats();
    return { open, close, el };
  }
  function initFab() {
    const fab = $('[data-fab]');
    if (!fab) return;
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'quick-intake');
    sheet = buildQuickIntake(fab);
    fab.addEventListener('click', () => sheet.open());
  }
  App.openQuickIntake = () => sheet?.open();
  App.closeQuickIntake = () => sheet?.close();

  /* ===================================================================
     初始化（defer 腳本執行時 DOM 已解析完成）
     =================================================================== */
  App.hydrate();
  initNav();
  initDrawer();
  initSearch();
  initNotify();
  initProfile();
  initScroll();
  initFab();
  refreshCounts();
  refreshClock();
  watchAnim();
  App.reveal();
  // 「現在」持續往前走：每 30 秒刷新 SLA 倒數與計數
  setInterval(() => { if (!document.hidden) { refreshSla(); refreshCounts(); refreshClock(); } }, 30000);
})();
