/*
 * 澄港市政府 公文線上簽核 流程中樞 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 比 defer 的 app.js 先「執行」，但 DOMContentLoaded 觸發時 window.App 已就緒，
 * 且 app.js 自己的初始化（導覽、reveal、tabs、seg…）已在那之前跑完。
 *
 * ── window.App ─────────────────────────────────────────────────────────────
 * 時間（固定以 UTC+8 計算；資料的「現在」為 2026-10-27（二）14:20，App.now() 從此持續走動）
 *   App.NOW0                         資料基準時間（ms），所有統計以它計算，畫面不會因秒針跳動而改變
 *   App.now() → ms                   會走動的現在（時鐘、新動作的時間戳）
 *   App.time('2026-10-27 14:20' | '10-27 14:20' | '10-27') → ms
 *   App.dayStart(ms) · App.isWorkday(ms) · App.addWork(ms, hours) · App.workHours(a, b) · App.addBizDays(ms, n)
 *       工作時間為週一至週五 08:30–17:30（每日 9 小時）；「天」= 9 個工作小時
 *   App.fmt.num / date('10-27') / dateFull('2026-10-27') / roc('115.10.27') / rocLong('中華民國115年10月27日')
 *          / time('14:20') / dt('10-27 14:20') / weekday('二') / clock('10/27（二）14:20:05') / rel('3 小時前')
 *          / dur(workHours → '4.5 小時' | '1.8 天') / days(workHours → '1.8')
 * 資料（只在記憶體中變動，換頁即重置）
 *   App.DATA.me                目前登入者 id（王正宏，交通局運輸規劃科 科長）
 *   App.DATA.people            id → {id, name, title, unit, lane}
 *   App.DATA.units             8 個承辦單位 {code, org, name, word(發文字), staff[], chief, director}
 *   App.DATA.cosignUnits       法制處 LAW / 主計處 BUD / 政風處 ETH / 人事處 HR {code, org, name, branch, person}
 *   App.DATA.lanes             5 條泳道 {id: mail|unit|cosign|lead|head, label, sub}
 *   App.DATA.stages            9 個關卡 {key, label, short, lane, node, glyph}（register → … → closed）
 *   App.DATA.speeds            urgent 最速件(1 日) / fast 速件(3 日) / normal 普通件(6 日)
 *   App.DATA.secrets           none 普通 / restricted 密 / confidential 機密
 *   App.DATA.levels            1 第一層（市長）/ 2 第二層（局處首長）/ 3 第三層（科長）
 *   App.DATA.districts         8 個行政區
 *   App.DATA.process           公文簽核 v3.2 的 BPMN 模型（給 App.Flow；要編輯請用 App.processModel() 取副本）
 *   App.DATA.docs              約 600 件公文（欄位見檔尾「公文欄位」），依收文時間排序
 *   App.DATA.featured          精選公文 slug → id：bikeway（核稿中、今日到期、三單位平行會辦完成，待我核）
 *                              winter（最速件，卡在主計處會辦、已逾期）、zoning（密，市長決行中）
 *                              pothole（1999 陳情，承辦中）、audit（機密，曾退回，已結案）
 * 查詢 / 衍生值（每次呼叫都讀最新資料）
 *   App.doc(id) · App.featured(slug) → doc · App.person(id) · App.unit(code)（含會辦單位）· App.stage(key)
 *   App.isOpen(doc)（尚未決行）· App.isOverdue(doc) · App.dueState(doc) → {state:'ok'|'soon'|'today'|'over'|'done'|'late', label, days}
 *   App.stageLabel(doc) → '會辦中（主計處）' 之類 · App.nodesOf(doc) → 目前所在的流程節點 id[]
 *   App.actors(doc) → 目前該處理的人 id[] · App.pending(doc) → [{key, node, lane, who, since, branch?}]
 *   App.draftOf(doc) → 函稿 {org, kind, to, cc[], date, no, speed, secret, attachments[], subject, desc[], actions[], signer}
 *   App.counts() → {open, overdue, assign(待分文), mine(待我核), today(今日收文), cosign(會辦中)}
 *   App.stageStats({speed, unit}) → { nodeId: {id, count, avgDwell(工作時數), overdue, done7, docs[], dist[5], heat 0–1} }
 *   App.gatewayStats() → { 'gw-cosign': {yes, no}, 'gw-level': {1,2,3}, 'gw-send': {send, file}, review:{returned, total} }
 *   App.kpis('today'|'7d'|'30d') → {recv, sent, overdue, avgDays}（各含 value / prev / series[]）
 *   App.unitLoad() → [{code, org, name, open, overdue, byStage:{draft,cosign,review,approve}}]
 *   App.hourly() → [{h, recv, sent}]（今日 08–17 時）
 *   App.recent(n) → 最近 n 筆流轉事件 [{at, doc, entry}]
 *   App.processModel() → 可編輯的流程模型深拷貝（順序流 weight 已依實際資料計算）
 *   App.docUrl(id) → 'doc.html?id=…' · App.param(name)
 * 資料變更（皆回傳 {undo()}；變更與復原都會發出 'docs' 事件，[data-count] 徽章自動重繪）
 *   App.assign(ids, unitCode, ownerId, note) → {count, skipped, undo}   批次分文（只處理 stage 為 assign 的公文）
 *   App.act(id, action, {note, units, branch, who}) → {undo}
 *       action：approve 核可（依關卡前進；第三層於核稿即決行）/ return 退回承辦 / cosign 加會（units:['LAW','BUD',…]）
 *               escalate 陳核（提高決行層級）/ dispatch 發文 / archive 歸檔
 *   App.on(name, fn(detail)) → off()  · App.emit(name, detail)
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(str) · App.icon(name, cls) · App.glyph(type, cls)（BPMN 符號：start / start-msg / end / end-msg / timer /
 *     task / task-user / xor / and / or / flow / token / lane / return / escalate）
 *   App.speedBadge(speed) · App.secretBadge(secret) · App.dueTag(doc) · App.stageTag(doc) · App.docNo(id)
 *   App.avatar(personId, {size:'sm'|'lg'}) · App.personTag(personId, {role:true})
 *   App.miniFlow(doc, {lg:false}) 八關卡迷你進度（lg 版含關卡名稱）
 *   App.seal({name, title, date(ms), kind:'name'|'decide'}) 電子簽章 svg（加 .is-stamping 播放蓋印）
 *   App.spark(values, {w, h}) sparkline svg · App.emptyState({title, text, glyph, actions})
 * UI
 *   App.toast(text, {tone:'ok'|'warn'|'danger'|'token', action:{label, onClick}, duration}) → {close()}
 *       有 modal 開著時 toast 容器會自動移進該 dialog，避免被 top layer 蓋住
 *   App.modal.open(dialog) / App.modal.close(dialog)；[data-modal-open="dialogId"] 與 dialog 內 [data-modal-close] 自動綁定
 *   App.confirm({title, text, ok, cancel, tone}) → Promise<boolean>（自繪 dialog，不用 window.confirm）
 *   App.tabs(root)（[data-tabs] 自動）· App.countTo(el, value, {decimals, duration})（連續呼叫安全）
 *   App.reveal(root)：為動態插入的 [data-reveal] 補上進場 · App.watchAnim(root)：為動態插入的 [data-anim] 掛上離開視窗暫停
 *   App.heatColor(0–1) → 'rgb(…)'（黃 → 橙 → 紅）· App.reducedMotion() → boolean · App.$ / App.$$
 *   .seg[data-seg] / .chips[data-chips] / button.switch 由 app.js 自動綁定，在元素上發出 'change'
 * 流程圖引擎
 *   const flow = App.Flow(svgEl, model, opts)
 *     opts: {live:false, prewarm:0(秒), rate:1.1(每秒新 token), speed:120(單位/秒), interactive:true, editable:false,
 *            snap:10, label, meta(同 setMeta，預熱前套用), onNodeClick(node, el, ev), onSelect(sel|null), onChange(kind, payload), onBackgroundClick(ev)}
 *     flow.play() / pause() / playing          即時 token 流（離開視窗或分頁隱藏時自動暫停；reduced-motion 時為靜態快照）
 *     flow.setMeta({nodeId: {count, dwell(工作時數), heat 0–1, text}})   節點積壓徽章、停留時間與熱度光暈
 *     flow.simulate({start, pick(node, outs) → edge|edge[], speed, dwell, onVisit(node, edge), onEdge(edge)}) → Promise<{ok, nodes, edges, order, deadEnds}>
 *     flow.markPath({nodes, edges}) / flow.clearPath() / flow.spotlight(nodeId|null)
 *     flow.select({type:'node'|'edge', id} | null) / flow.selected
 *     flow.addNode(n) → node · updateNode(id, patch) · removeNode(id) · moveNode(id, x, y)
 *     flow.addEdge(e) → edge · updateEdge(id, patch) · removeEdge(id)
 *     flow.node(id) / edge(id) / outEdges(id) / inEdges(id) / laneAt(y) / clientToSvg(x, y) / nodeEl(id) / edgeEl(id)
 *     flow.toJSON() / load(model) / render() / destroy()
 *     使用者在圖上拖曳或用方向鍵移動節點時才會呼叫 onChange('move', {id, x, y})；程式呼叫的 API 不觸發回呼。
 *   App.Flow.route(a, b, edge) → 折線點 · App.Flow.pathD(points, r) → 圓角路徑 d（畫自訂連線用）
 */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  /* ── 基本工具 ─────────────────────────────────────────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  App.esc = esc;
  App.$ = $;
  App.$$ = $$;
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => reducedQuery.matches;
  App.reducedMotion = reducedMotion;
  App.param = name => new URLSearchParams(location.search).get(name);

  /* ── 時間：固定 UTC+8，與觀看者時區無關 ─────────────────── */
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5, TZ = 8 * HOUR;
  const NOW0 = Date.UTC(2026, 9, 27, 14, 20, 0) - TZ;
  const loadedAt = Date.now();
  App.NOW0 = NOW0;
  App.now = () => NOW0 + (Date.now() - loadedAt);

  const parts = ms => {
    const d = new Date(ms + TZ);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
  };
  App.time = str => {
    const m = String(str).trim().match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (!m) throw new Error('App.time: invalid time string "' + str + '"');
    return Date.UTC(+(m[1] || 2026), +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - TZ;
  };
  const dayStart = ms => Math.floor((ms + TZ) / DAY) * DAY - TZ;
  const isWorkday = ms => { const wd = parts(ms).wd; return wd !== 0 && wd !== 6; };
  const WORK_START = 8.5 * HOUR, WORK_END = 17.5 * HOUR, WORK_DAY_H = 9;
  // 落在非工作時間的時刻，移到下一個工作時段的起點
  function nextWorkMoment(ms) {
    let ds = dayStart(ms);
    if (isWorkday(ds)) {
      if (ms < ds + WORK_START) return ds + WORK_START;
      if (ms < ds + WORK_END) return ms;
    }
    do { ds += DAY; } while (!isWorkday(ds));
    return ds + WORK_START;
  }
  function addWork(ms, hours) {
    if (!(hours >= 0) || !isFinite(hours)) throw new Error('addWork: hours must be a finite number ≥ 0');
    let t = nextWorkMoment(ms), remain = hours * HOUR;
    while (remain > 0) {
      const end = dayStart(t) + WORK_END;
      if (t + remain <= end) return t + remain;
      remain -= end - t;
      t = nextWorkMoment(end);
    }
    return t;
  }
  function workHours(a, b) {
    if (b <= a) return 0;
    let total = 0;
    for (let ds = dayStart(a); ds < b; ds += DAY) {
      if (!isWorkday(ds)) continue;
      const s = Math.max(a, ds + WORK_START), e = Math.min(b, ds + WORK_END);
      if (e > s) total += e - s;
    }
    return total / HOUR;
  }
  function addBizDays(ms, n) {
    let ds = dayStart(ms), k = 0;
    while (k < n) { ds += DAY; if (isWorkday(ds)) k++; }
    return ds;
  }
  // (a, b] 之間的工作日數（以日界計）
  function bizDaysBetween(a, b) {
    let n = 0;
    for (let ds = dayStart(a) + DAY; ds <= dayStart(b); ds += DAY) if (isWorkday(ds)) n++;
    return n;
  }
  Object.assign(App, { dayStart, isWorkday, addWork, workHours, addBizDays });

  const pad = n => String(n).padStart(2, '0');
  const WD = '日一二三四五六';
  App.fmt = {
    num: n => Number(n).toLocaleString('zh-TW'),
    date: ms => { const p = parts(ms); return `${pad(p.m)}-${pad(p.d)}`; },
    dateFull: ms => { const p = parts(ms); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; },
    roc: ms => { const p = parts(ms); return `${p.y - 1911}.${pad(p.m)}.${pad(p.d)}`; },
    rocLong: ms => { const p = parts(ms); return `中華民國${p.y - 1911}年${p.m}月${p.d}日`; },
    time: ms => { const p = parts(ms); return `${pad(p.h)}:${pad(p.mi)}`; },
    dt: ms => `${App.fmt.date(ms)} ${App.fmt.time(ms)}`,
    weekday: ms => WD[parts(ms).wd],
    clock: ms => { const p = parts(ms); return `${pad(p.m)}/${pad(p.d)}（${WD[p.wd]}）${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`; },
    rel: ms => {
      const diff = App.now() - ms;
      if (diff < MIN) return '剛剛';
      if (diff < HOUR) return `${Math.floor(diff / MIN)} 分鐘前`;
      if (dayStart(ms) === dayStart(App.now())) return `${Math.floor(diff / HOUR)} 小時前`;
      if (dayStart(ms) === dayStart(App.now()) - DAY) return `昨天 ${App.fmt.time(ms)}`;
      return App.fmt.dt(ms);
    },
    dur: h => h < WORK_DAY_H ? `${h < 1 ? h.toFixed(1) : h.toFixed(h < 10 ? 1 : 0)} 小時` : `${(h / WORK_DAY_H).toFixed(1)} 天`,
    days: h => (h / WORK_DAY_H).toFixed(1),
  };

  /* ── 組織與人員 ─────────────────────────────────────────── */
  const ME = 'wang-zh';
  const P = (id, name, title, unit, lane) => [id, { id, name, title, unit, lane }];
  const PEOPLE = Object.fromEntries([
    P('cai-yz', '蔡宜蓁', '收發人員', 'SEC', 'mail'),
    P('zheng-wc', '鄭偉丞', '分文人員', 'SEC', 'mail'),
    P('guo-py', '郭品妤', '發文人員', 'SEC', 'mail'),
    P('wen-zh', '溫子豪', '檔案管理員', 'SEC', 'mail'),
    P('lin-yt', '林郁婷', '技士', 'TRN', 'unit'), P('chen-gt', '陳冠廷', '科員', 'TRN', 'unit'),
    P('wang-zh', '王正宏', '科長', 'TRN', 'lead'), P('jiang-zy', '江振宇', '局長', 'TRN', 'lead'),
    P('huang-br', '黃柏睿', '技士', 'UDB', 'unit'), P('jian-sh', '簡詩涵', '科員', 'UDB', 'unit'),
    P('li-jr', '李佳蓉', '科長', 'UDB', 'lead'), P('fan-sh', '范書豪', '局長', 'UDB', 'lead'),
    P('wu-ps', '吳佩珊', '技士', 'PWD', 'unit'), P('liao-zx', '廖子翔', '技佐', 'PWD', 'unit'),
    P('zhang-zy', '張志遠', '科長', 'PWD', 'lead'), P('ye-zh', '葉宗翰', '局長', 'PWD', 'lead'),
    P('xu-jh', '許家豪', '技士', 'EPB', 'unit'), P('pan-yx', '潘怡萱', '科員', 'EPB', 'unit'),
    P('liu-jy', '劉靜宜', '科長', 'EPB', 'lead'), P('zhong-ya', '鍾怡安', '局長', 'EPB', 'lead'),
    P('chen-yj', '陳怡君', '社工督導', 'SWD', 'unit'), P('you-jj', '游俊傑', '科員', 'SWD', 'unit'),
    P('hong-jg', '洪建國', '科長', 'SWD', 'lead'), P('lai-sf', '賴淑芬', '局長', 'SWD', 'lead'),
    P('zhou-mz', '周明哲', '專員', 'FIN', 'unit'), P('xiao-yw', '蕭雅文', '科員', 'FIN', 'unit'),
    P('su-ml', '蘇美玲', '科長', 'FIN', 'lead'), P('fang-ld', '方立德', '局長', 'FIN', 'lead'),
    P('yang-yz', '楊雅筑', '專員', 'EDU', 'unit'), P('dai-ch', '戴承翰', '科員', 'EDU', 'unit'),
    P('zeng-gf', '曾國峰', '科長', 'EDU', 'lead'), P('wen-xy', '溫心怡', '局長', 'EDU', 'lead'),
    P('xie-ce', '謝承恩', '科員', 'CIV', 'unit'), P('deng-jy', '鄧佳穎', '科員', 'CIV', 'unit'),
    P('jian-hr', '簡慧如', '科長', 'CIV', 'lead'), P('qiu-xy', '邱信義', '局長', 'CIV', 'lead'),
    P('luo-wy', '羅文彥', '科長', 'LAW', 'cosign'),
    P('he-pr', '何佩蓉', '科長', 'BUD', 'cosign'),
    P('shi-zl', '施宗廉', '科長', 'ETH', 'cosign'),
    P('zhuang-yq', '莊雅琪', '科長', 'HR', 'cosign'),
    P('shen-sy', '沈書韞', '市長', 'MAYOR', 'head'),
    P('tang-zy', '唐致遠', '副市長', 'MAYOR', 'head'),
  ]);
  const UNITS = [
    { code: 'TRN', org: '交通局', name: '運輸規劃科', word: '府交運', staff: ['lin-yt', 'chen-gt'], chief: 'wang-zh', director: 'jiang-zy' },
    { code: 'UDB', org: '都市發展局', name: '都市計畫科', word: '府都計', staff: ['huang-br', 'jian-sh'], chief: 'li-jr', director: 'fan-sh' },
    { code: 'PWD', org: '工務局', name: '養護工程科', word: '府工養', staff: ['wu-ps', 'liao-zx'], chief: 'zhang-zy', director: 'ye-zh' },
    { code: 'EPB', org: '環境保護局', name: '空氣品質科', word: '府環空', staff: ['xu-jh', 'pan-yx'], chief: 'liu-jy', director: 'zhong-ya' },
    { code: 'SWD', org: '社會局', name: '社會救助科', word: '府社助', staff: ['chen-yj', 'you-jj'], chief: 'hong-jg', director: 'lai-sf' },
    { code: 'FIN', org: '財政局', name: '公產管理科', word: '府財產', staff: ['zhou-mz', 'xiao-yw'], chief: 'su-ml', director: 'fang-ld' },
    { code: 'EDU', org: '教育局', name: '學務管理科', word: '府教學', staff: ['yang-yz', 'dai-ch'], chief: 'zeng-gf', director: 'wen-xy' },
    { code: 'CIV', org: '民政局', name: '戶政科', word: '府民戶', staff: ['xie-ce', 'deng-jy'], chief: 'jian-hr', director: 'qiu-xy' },
  ];
  const COSIGN_UNITS = [
    { code: 'LAW', org: '法制處', name: '審議科', branch: 'legal', person: 'luo-wy' },
    { code: 'BUD', org: '主計處', name: '公務預算科', branch: 'budget', person: 'he-pr' },
    { code: 'ETH', org: '政風處', name: '預防科', branch: 'agency', person: 'shi-zl' },
    { code: 'HR', org: '人事處', name: '考訓科', branch: 'agency', person: 'zhuang-yq' },
  ];
  const UNIT_MAP = Object.fromEntries([...UNITS, ...COSIGN_UNITS].map(u => [u.code, u]));
  UNIT_MAP.SEC = { code: 'SEC', org: '秘書處', name: '文書科' };
  UNIT_MAP.MAYOR = { code: 'MAYOR', org: '市長室', name: '' };

  const LANES = [
    { id: 'mail', label: '收發室', sub: '秘書處文書科' },
    { id: 'unit', label: '承辦科', sub: '各局處業務科' },
    { id: 'cosign', label: '會辦單位', sub: '法制 · 主計 · 相關局處' },
    { id: 'lead', label: '主管', sub: '科長 · 局處首長' },
    { id: 'head', label: '首長', sub: '市長 · 副市長' },
  ];
  const STAGES = [
    { key: 'register', label: '收文登錄', short: '收文', lane: 'mail', node: 'register', glyph: 'start-msg' },
    { key: 'assign', label: '分文', short: '分文', lane: 'mail', node: 'assign', glyph: 'task' },
    { key: 'draft', label: '承辦擬辦', short: '承辦', lane: 'unit', node: 'draft', glyph: 'task-user' },
    { key: 'cosign', label: '會辦', short: '會辦', lane: 'cosign', node: 'split', glyph: 'and' },
    { key: 'review', label: '核稿', short: '核稿', lane: 'lead', node: 'review', glyph: 'task-user' },
    { key: 'approve', label: '決行', short: '決行', lane: 'lead', node: 'approve-dg', glyph: 'xor' },
    { key: 'dispatch', label: '發文', short: '發文', lane: 'mail', node: 'dispatch', glyph: 'end-msg' },
    { key: 'archive', label: '歸檔', short: '歸檔', lane: 'mail', node: 'archive', glyph: 'task' },
    { key: 'closed', label: '結案', short: '結案', lane: 'mail', node: 'end', glyph: 'end' },
  ];
  const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
  const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
  const OPEN_STAGES = new Set(['register', 'assign', 'draft', 'cosign', 'review', 'approve']);
  const SPEEDS = { urgent: { key: 'urgent', label: '最速件', days: 1 }, fast: { key: 'fast', label: '速件', days: 3 }, normal: { key: 'normal', label: '普通件', days: 6 } };
  const SECRETS = { none: { key: 'none', label: '普通' }, restricted: { key: 'restricted', label: '密' }, confidential: { key: 'confidential', label: '機密' } };
  const LEVELS = { 1: { level: 1, label: '第一層', who: '市長' }, 2: { level: 2, label: '第二層', who: '局處首長' }, 3: { level: 3, label: '第三層', who: '科長' } };
  const BRANCH_LABEL = { legal: '法制處', budget: '主計處', agency: '相關單位' };

  /* ── BPMN 流程模型：公文簽核 v3.2 ───────────────────────── */
  const PROCESS = {
    id: 'doc-routing', name: '公文簽核', version: 'v3.2', effective: '2026-09-30',
    width: 1556, poolHead: 28, laneHead: 42, poolLabel: '澄港市政府 · 公文簽核流程',
    lanes: [
      { id: 'mail', label: '收發室', sub: '秘書處文書科', h: 108 },
      { id: 'unit', label: '承辦科', sub: '各局處業務科', h: 108 },
      { id: 'cosign', label: '會辦單位', sub: '法制 · 主計 · 相關局處', h: 168 },
      { id: 'lead', label: '主管', sub: '科長 · 局處首長', h: 108 },
      { id: 'head', label: '首長', sub: '市長 · 副市長', h: 100 },
    ],
    nodes: [
      { id: 'recv', type: 'start', event: 'message', label: '來文', lane: 'mail', x: 108, y: 54 },
      { id: 'register', type: 'task', label: '收文登錄', lane: 'mail', x: 202, y: 54, w: 104, role: '收發人員', sla: 2, wip: 6 },
      { id: 'assign', type: 'task', label: '分文', lane: 'mail', x: 330, y: 54, w: 100, role: '分文人員', sla: 4, wip: 8 },
      { id: 'draft', type: 'task', label: '承辦擬辦', lane: 'unit', x: 330, y: 162, w: 108, role: '承辦人', sla: 24, wip: 70 },
      { id: 'gw-cosign', type: 'xor', label: '需會辦？', lane: 'unit', x: 452, y: 162 },
      { id: 'split', type: 'and', label: '平行會辦', lane: 'cosign', x: 524, y: 300, labelPos: 'bl' },
      { id: 'cs-legal', type: 'task', label: '法制處會辦', lane: 'cosign', x: 640, y: 252, w: 128, h: 40, role: '法制處審議科', sla: 16, wip: 10 },
      { id: 'cs-budget', type: 'task', label: '主計處會辦', lane: 'cosign', x: 640, y: 300, w: 128, h: 40, role: '主計處公務預算科', sla: 16, wip: 10 },
      { id: 'cs-agency', type: 'task', label: '相關單位會辦', lane: 'cosign', x: 640, y: 348, w: 128, h: 40, role: '權責局處／政風／人事', sla: 16, wip: 12 },
      { id: 'join', type: 'and', label: '會辦完成', lane: 'cosign', x: 756, y: 300, labelPos: 'tr' },
      { id: 'review', type: 'task', label: '核稿', lane: 'lead', x: 858, y: 438, w: 104, role: '科長', sla: 8, wip: 18 },
      { id: 'gw-level', type: 'xor', label: '決行層級', lane: 'lead', x: 966, y: 438, labelPos: 'tr' },
      { id: 'approve-dg', type: 'task', label: '局長決行', sub: '第二層', lane: 'lead', x: 1090, y: 438, w: 104, role: '局處首長', sla: 16, wip: 12 },
      { id: 'approve-mayor', type: 'task', label: '市長決行', sub: '第一層', lane: 'head', x: 1090, y: 542, w: 104, role: '市長／副市長', sla: 24, wip: 4 },
      { id: 'gw-send', type: 'xor', label: '發文？', lane: 'mail', x: 1190, y: 54, labelPos: 'l' },
      { id: 'dispatch', type: 'task', label: '發文', lane: 'mail', x: 1292, y: 54, w: 96, role: '發文人員', sla: 4, wip: 10 },
      { id: 'archive', type: 'task', label: '歸檔', lane: 'mail', x: 1410, y: 54, w: 96, role: '檔案管理員', sla: 36, wip: 80 },
      { id: 'end', type: 'end', label: '結案', lane: 'mail', x: 1510, y: 54 },
    ],
    edges: [
      { id: 'e-recv', from: 'recv', to: 'register' },
      { id: 'e-reg', from: 'register', to: 'assign' },
      { id: 'e-assign', from: 'assign', to: 'draft' },
      { id: 'e-draft', from: 'draft', to: 'gw-cosign' },
      { id: 'e-cs-yes', from: 'gw-cosign', to: 'split', label: '需會辦', cond: '會辦單位 ≥ 1' },
      { id: 'e-cs-no', from: 'gw-cosign', to: 'review', label: '免會辦', cond: '預設', exit: 'r', enter: 't', lx: 668, ly: 154 },
      { id: 'e-split-legal', from: 'split', to: 'cs-legal' },
      { id: 'e-split-budget', from: 'split', to: 'cs-budget' },
      { id: 'e-split-agency', from: 'split', to: 'cs-agency' },
      { id: 'e-legal-join', from: 'cs-legal', to: 'join' },
      { id: 'e-budget-join', from: 'cs-budget', to: 'join' },
      { id: 'e-agency-join', from: 'cs-agency', to: 'join' },
      { id: 'e-join', from: 'join', to: 'review', exit: 'r', enter: 'l' },
      { id: 'e-review', from: 'review', to: 'gw-level' },
      { id: 'e-return', from: 'review', to: 'draft', label: '退回補正', kind: 'return', cond: '核稿退回', exit: 'b', enter: 'b', my: 480, lx: 600, ly: 472 },
      { id: 'e-l2', from: 'gw-level', to: 'approve-dg', label: '第二層', cond: '決行層級 = 2', lx: 1013, ly: 452 },
      { id: 'e-l1', from: 'gw-level', to: 'approve-mayor', label: '第一層', cond: '決行層級 = 1', lx: 1008, ly: 534 },
      { id: 'e-l3', from: 'gw-level', to: 'gw-send', label: '第三層 · 科長決行', cond: '決行層級 = 3', exit: 't', enter: 'b', my: 200, lx: 1078, ly: 192 },
      { id: 'e-dg', from: 'approve-dg', to: 'gw-send' },
      { id: 'e-mayor', from: 'approve-mayor', to: 'gw-send' },
      { id: 'e-send', from: 'gw-send', to: 'dispatch', label: '發文', cond: '需對外發文' },
      { id: 'e-file', from: 'gw-send', to: 'archive', label: '存查', cond: '預設', exit: 't', enter: 't', my: 14, lx: 1300, ly: 8 },
      { id: 'e-dispatch', from: 'dispatch', to: 'archive' },
      { id: 'e-archive', from: 'archive', to: 'end' },
    ],
  };
  const TASK_NODES = PROCESS.nodes.filter(n => n.type === 'task').map(n => n.id);

  /* ── 擬真公文產生器（固定種子，每次載入結果相同） ─────────── */
  const DISTRICTS = ['港埕區', '北岸區', '舊城區', '山腳區', '新灣區', '鹽田區', '溪洲區', '雲嶺區'];
  const ROADS = {
    '港埕區': ['港埕路', '碼頭街', '帆影路'], '北岸區': ['燈塔路', '北岸一路', '海晴路'],
    '舊城區': ['府前路', '舊城街', '城隍廟街'], '山腳區': ['山腳路', '望山街', '茶園路'],
    '新灣區': ['新灣大道', '灣景路', '科創路'], '鹽田區': ['鹽埕二路', '漁人路', '曬鹽街'],
    '溪洲區': ['溪洲大道', '河堤路', '竹圍街'], '雲嶺區': ['雲嶺路', '嶺頂街', '松林路'],
  };
  const ZONES = ['部分住宅區為公園用地', '部分工業區為商業區', '部分農業區為道路用地', '部分機關用地為社會福利設施用地'];
  const PLACES = ['衛生所舊址', '區公所舊辦公廳舍', '第一公有市場二樓', '原清潔隊宿舍'];
  // [公文類別, 來文來源, 主旨]；{d} 行政區、{r}/{r2} 路名、{s} 學校、{n} 數字、{g} 年級/批次、{m} 月份、{z} 分區、{p} 場所
  const TEMPLATES = {
    TRN: [
      ['函', 'district', '有關{d}{r}與{r2}口增設行人專用時相一案，請惠予協處。'],
      ['函', 'bus', '有關本公司市區公車{n}路調整行駛路線及{d}站位遷移一案，請核備。'],
      ['函', 'metro', '檢送「捷運轉乘接駁公車路網檢討」第 {n} 次工作會議紀錄 1 份，請查照。'],
      ['函', 'council', '函轉本會議員質詢{d}{s}周邊通學步道改善事項，請於期限內查復。'],
      ['簽', 'self', '擬辦理{d}{r}路邊停車格位重新劃設及收費時段調整案。'],
      ['函', 'county', '有關兩縣市跨域公車{n}路營運補貼分攤比例協商一案，請查照。'],
    ],
    UDB: [
      ['簽', 'self', '擬公開展覽「變更{d}都市計畫（{z}）細部計畫」案。'],
      ['函', 'district', '檢送{d}{r}周邊都市更新事業計畫幹事會議紀錄 1 份，請查照。'],
      ['函', 'citizen', '民眾陳情{d}{r}建築線指定疑義，請查明逕復。'],
      ['函', 'port', '有關新灣區水岸再生計畫第 {n} 街廓土地使用分區調整一案，請惠示意見。'],
      ['函', 'council', '函轉本會審議 115 年度都市計畫通盤檢討附帶決議第 {n} 案，請辦理見復。'],
    ],
    PWD: [
      ['簽', 'self', '擬辦理{d}{r}人行道平整改善工程（第 {n} 標）驗收結算案。'],
      ['函', 'district', '有關颱風過後{d}側溝清淤及護欄修復經費追加一案，請惠予支援。'],
      ['函', 'citizen', '民眾陳情{d}{r}路面坑洞修補，請查處逕復。'],
      ['簽', 'self', '擬辦理雲嶺區山區道路邊坡監測系統建置採購案（第 {n} 標）。'],
      ['函', 'county', '有關兩縣市交界溪洲大橋 P{n} 橋墩定期檢測結果及補強分工一案，請查照。'],
    ],
    EPB: [
      ['簽', 'self', '擬核處{d}工業區揮發性有機物稽查違規案（第 {n} 件）。'],
      ['函', 'district', '有關{d}營建工地逸散粉塵陳情案件處理情形，請查照。'],
      ['函', 'citizen', '民眾陳情{d}{r}一帶夜間異味，請查明見復。'],
      ['函', 'port', '有關港區第 {n} 號碼頭船舶岸電設施設置補助申請一案，請核示。'],
      ['函', 'ngo', '函請協助辦理{d}海岸淨灘活動垃圾清運事宜。'],
    ],
    SWD: [
      ['簽', 'self', '擬核定{d}低收入戶年度總清查結果（計 {n} 戶）案。'],
      ['函', 'district', '有關{d}里辦公處反映獨居長者急難救助需求一案，請協處。'],
      ['函', 'foundation', '有關本會捐贈{d}弱勢家庭兒童課後輔導經費一案，請惠予協助轉介。'],
      ['函', 'hospital', '有關醫療社工轉介{d}個案緊急生活扶助申請一案，請查照。'],
      ['簽', 'self', '擬辦理{d}社區關懷據點年度評鑑結果核定案。'],
    ],
    FIN: [
      ['簽', 'self', '擬辦理{d}市有閒置空間（原{p}）活化標租案。'],
      ['函', 'district', '有關{d}市有土地遭占用排除及補償金追收一案，請查照。'],
      ['函', 'commerce', '有關{d}市有攤商用地續租租金調整建議，請惠予研議。'],
      ['簽', 'self', '擬召開市有房地清查專案第 {n} 次工作會議。'],
    ],
    EDU: [
      ['函', 'school', '檢送本校 {g} 年級學生校外教學安全計畫 1 份，請備查。'],
      ['簽', 'self', '擬通報 115 學年度第 1 學期{d}校園午餐食材抽驗結果案。'],
      ['函', 'citizen', '家長陳情{d}國中校門口接送區動線規劃，請查明逕復。'],
      ['函', 'school', '有關本校 {m} 月份防災避難演練辦理情形，請備查。'],
      ['簽', 'self', '擬辦理{d}學生交通車委外駕駛資格查核案。'],
    ],
    CIV: [
      ['簽', 'self', '擬公告{d}門牌整編作業（{r}）案。'],
      ['函', 'district', '有關{d}里鄰調整規劃草案說明會辦理情形，請查照。'],
      ['函', 'council', '函轉本會議員建議{d}戶政事務所增設假日服務時段案，請研處見復。'],
      ['簽', 'self', '擬辦理戶籍登記資料跨機關介接（第 {g} 批）測試排程案。'],
    ],
  };
  const SOURCES = {
    district: d => ({ name: `澄港市${d}公所`, word: `${d.slice(0, 2)}民字` }),
    council: () => ({ name: '澄港市議會', word: '澄議秘字' }),
    port: () => ({ name: '澄港港務管理處', word: '澄港務規字' }),
    metro: () => ({ name: '澄港捷運股份有限公司', word: '澄捷營字' }),
    bus: () => ({ name: '澄港客運股份有限公司', word: '澄客業字' }),
    county: () => ({ name: '海濱縣政府', word: '海府綜字' }),
    hospital: () => ({ name: '澄港市立澄海醫院', word: '澄海醫社字' }),
    foundation: () => ({ name: '財團法人澄港文化基金會', word: '澄文基字' }),
    commerce: () => ({ name: '澄港市商業會', word: '澄商總字' }),
    ngo: () => ({ name: '澄港市環保志工聯盟', word: '澄環盟字' }),
    school: d => ({ name: `澄港市${d}${d.slice(0, 2)}國民小學`, word: `${d.slice(0, 2)}小學字` }),
    citizen: () => ({ name: '1999 市民專線（陳情轉辦）', word: null }),
    self: (d, unit) => ({ name: `本府${unit.org}`, word: null }),
  };
  // 擬辦、核稿、決行、退回意見依公文來源與會辦單位挑選，避免「簽」寫成函復來文、沒會主計卻說會請主計處
  const NOTES = {
    draft: {
      self: ['擬稿完成，陳核。', '已會勘現場，擬依會勘結論辦理。', '擬簽請核示後依程序辦理。', '所需經費於本局年度預算項下支應，擬簽請核示。'],
      selfBud: '擬簽請同意辦理，所需經費會請主計處表示意見。',
      citizen: ['擬函復陳情人並副知議員服務處。', '已會勘現場，擬依會勘結論函復陳情人。', '已電洽陳情人說明處理方式，擬如稿函復。', '擬稿完成，陳核。'],
      other: ['擬稿完成，陳核。', '已洽來文機關承辦人確認細節，擬如稿函復。', '本案依往例辦理，擬准予備查。', '已會勘現場，擬依會勘結論辦理。'],
    },
    legal: ['本處無意見。', '旨揭事項於法無違，請依權責辦理。', '建議於說明二補充法令依據條次。', '契約第 7 條違約責任文字請再酌修。'],
    budget: ['所需經費由 115 年度相關科目項下勻支。', '本案經費請依預算法第 62 條規定辦理流用。', '請補列經費概算明細後再會。', '本處無意見。'],
    agency: ['敬會，本局無意見。', '請副知本局，以利後續配合。', '本局將於下月起配合辦理。', '本局意見詳如附件。'],
    review: ['如擬。', '文字已修正，如擬。', '核稿，陳請核示。'],
    reviewLaw: '請依法制處意見修正後陳核，本次先行核稿。',
    approve: ['如擬。', '可。', '准予備查。', '如擬，並請於擴大會報提出說明。'],
    approveSelf: ['如擬。', '可。', '准如所擬辦理。', '如擬，並請於擴大會報提出說明。'],
    ret: ['請補充經費來源及分年需求後再陳。', '說明二數據與附件不符，請查明修正。', '主旨文字過長，請精簡後再陳。'],
    retLaw: ['請先會辦法制處再陳。', '請依法制處會辦意見修正後再陳。'],
  };
  const FILE_CLASS = { TRN: '0702', UDB: '0401', PWD: '0503', EPB: '0610', SWD: '0807', FIN: '0305', EDU: '0901', CIV: '0102' };

  // 精選公文：子頁示範用，時間軸刻意設計（今日到期、卡在瓶頸、曾退回…）
  const FEATURED = [
    {
      slug: 'bikeway', received: '2026-10-22 09:40', unit: 'TRN', owner: 'lin-yt', speed: 'fast', secret: 'none', level: 2, send: true,
      kind: '函', fromKey: 'port', ref: '澄港務規字第1150002871號', attachments: 2,
      subject: '有關北岸區濱海自行車道延伸工程（第二期）用地協議及經費分攤一案，請查照惠復。',
      hours: { register: .4, assign: 1.1, draft: 9.5 },
      cosign: [
        { unit: 'LAW', hours: 5.5, note: '協議書草案第 7 條「違約責任」僅課予本府單方義務，建議修正為雙方對等條款；其餘無意見。' },
        { unit: 'BUD', hours: 8, note: '臨時交通維持費 186 萬元，由交通局 115 年度「自行車道系統建置」計畫項下勻支，不足部分循 116 年度預算辦理。' },
        { unit: 'PWD', hours: 4, note: '本局同意於施工期間協助港區聯外道路臨時交通維持，請於開工前 14 日通知。' },
      ],
      stopAt: 'review',
      notes: {
        register: '電子交換收文，附件 2 件（協議書草案、路線圖）',
        draft: '擬依港務管理處所提條件辦理，違約責任條款依法制處意見修正；經費會請主計處表示意見，並會工務局協處交維。',
      },
      draft: {
        to: '澄港港務管理處',
        cc: ['本府工務局', '本府主計處', '本府法制處'],
        subject: '有關北岸區濱海自行車道延伸工程（第二期）行經貴處管有港區土地之用地協議及經費分攤一案，復如說明，請查照。',
        desc: [
          '復貴處 115 年 10 月 21 日澄港務規字第1150002871號函。',
          '旨揭工程第二期路段自北岸區燈塔路口至鹽田區漁人碼頭，全長 3.2 公里，其中 1.1 公里行經貴處管有之北岸段 512、513 地號土地；本府同意依貴處所提無償提供使用方式辦理。',
          '施工期間臨時交通維持費用新臺幣 186 萬元由本府負擔，於本府交通局 115 年度「自行車道系統建置」計畫項下支應，不足部分循 116 年度預算辦理。',
          '協議書草案第 7 條「違約責任」建議修正為雙方對等條款，修正對照表如附件 1。',
        ],
        actions: [
          '請貴處於 115 年 11 月 6 日前惠復協議書修正意見，俾利於 11 月中旬辦理簽約。',
          '本府工務局將於開工前 14 日通知貴處，協調港區聯外道路臨時交通維持事宜。',
        ],
        attachments: ['協議書修正對照表 1 份', '第二期路線圖 1 份'],
      },
    },
    {
      slug: 'winter', received: '2026-10-23 10:15', unit: 'SWD', owner: 'chen-yj', speed: 'urgent', secret: 'none', level: 2, send: false,
      kind: '簽', fromKey: 'self', attachments: 3,
      subject: '擬辦理 115 年度冬令救助物資採購及八區發放據點設置案。',
      hours: { register: .3, assign: .6, draft: 3 },
      cosign: [{ unit: 'BUD', hours: Infinity }],
      notes: { draft: '寒流預報提前，擬於 11 月 10 日前完成物資採購；所需經費 1,240 萬元，會請主計處表示意見。' },
    },
    {
      slug: 'zoning', received: '2026-10-19 09:05', unit: 'UDB', owner: 'huang-br', speed: 'normal', secret: 'restricted', level: 1, send: true,
      kind: '簽', fromKey: 'self', attachments: 4,
      subject: '擬公開展覽「變更港埕區都市計畫（部分工業區為商業區）細部計畫」案。',
      hours: { register: .5, assign: 1.5, draft: 13, review: 3.5 },
      cosign: [{ unit: 'LAW', hours: 6, note: '公開展覽期間及方式符合都市計畫法第 19 條規定，本處無意見。' }],
      stopAt: 'approve',
      notes: { draft: '本案業經都市計畫委員會專案小組三次審查，擬自 11 月 2 日起公開展覽 30 日。', review: '核稿，陳請市長核定公開展覽。' },
    },
    {
      slug: 'pothole', received: '2026-10-26 10:20', unit: 'PWD', owner: 'wu-ps', speed: 'normal', secret: 'none', level: 3, send: true,
      kind: '函', fromKey: 'citizen', ref: '陳情案號 C1999-1151026-0417', attachments: 3,
      subject: '民眾陳情鹽田區漁人路路面坑洞修補，請查處逕復。',
      hours: { register: .2, assign: .8 }, cosign: [],
      stopAt: 'draft',
    },
    {
      slug: 'audit', received: '2026-10-07 09:30', unit: 'EPB', owner: 'xu-jh', speed: 'fast', secret: 'confidential', level: 2, send: true, returned: true,
      kind: '簽', fromKey: 'self', attachments: 2,
      subject: '擬核處新灣區工業區揮發性有機物稽查違規案（第 3 件）。',
      hours: { register: .3, assign: .7, draft: 5, review: 1.5, redraft: 3, review2: 1, approve: 2.5, dispatch: 1.2, archive: 20 },
      cosign: [{ unit: 'LAW', hours: 4, note: '處分書應記載救濟期間及受理機關，請補正。' }],
      notes: { ret: '裁處金額計算基準請附稽查紀錄佐證後再陳。', approve: '如擬，並請持續追蹤改善。' },
    },
  ];

  function buildDocs() {
    const rnd = mulberry32(115102714);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const between = (a, b) => a + rnd() * (b - a);
    const chance = p => rnd() < p;

    // 1) 每個工作日的來文時刻
    const slots = [];
    const today = dayStart(NOW0);
    for (let day = App.time('2026-09-21'); day <= today; day += DAY) {
      if (!isWorkday(day)) continue;
      const n = day === today ? 15 : Math.round(between(17, 26));
      const latest = day === today ? NOW0 - 12 * MIN : day + WORK_END - 20 * MIN;
      for (let i = 0; i < n; i++) slots.push({ received: day + WORK_START + rnd() * (latest - day - WORK_START) });
    }
    FEATURED.forEach(f => slots.push({ received: App.time(f.received), spec: f }));
    slots.sort((a, b) => a.received - b.received);
    // 2) 收文號依時間遞增；中間的空號是紙本、其他系統等管道的收文
    let seq = 41620;
    for (let i = slots.length - 1; i >= 0; i--) { slots[i].seq = seq; seq -= 1 + Math.floor(rnd() * 3); }

    const unitWeights = [['TRN', 16], ['UDB', 12], ['PWD', 16], ['EPB', 12], ['SWD', 13], ['FIN', 9], ['EDU', 12], ['CIV', 10]];
    const pickUnit = () => {
      let r = rnd() * 100;
      for (const [code, w] of unitWeights) { if ((r -= w) < 0) return code; }
      return 'CIV';
    };
    const F = { urgent: .26, fast: .58, normal: 1 };

    return slots.map(slot => {
      const spec = slot.spec || {};
      const unit = UNIT_MAP[spec.unit || pickUnit()];
      const tpl = pick(TEMPLATES[unit.code]);
      const d = pick(DISTRICTS);
      const roads = ROADS[d];
      const vars = { d, r: roads[0], r2: roads[1 + Math.floor(rnd() * 2)], s: `${d.slice(0, 2)}國小`, n: 2 + Math.floor(rnd() * 38), z: pick(ZONES), p: pick(PLACES) };
      // g / m 由 n 推導，不多抽亂數，避免改動整批資料的隨機序列
      vars.g = 1 + vars.n % 6;
      vars.m = 9 + vars.n % 2;
      const fromKey = spec.fromKey || tpl[1];
      const src = SOURCES[fromKey](d, unit);
      const r1 = rnd(), r2 = rnd(), r3 = rnd();
      const speed = spec.speed || (r1 < .13 ? 'urgent' : r1 < .43 ? 'fast' : 'normal');
      const id = '115' + String(slot.seq).padStart(7, '0');
      const doc = {
        id,
        slug: spec.slug || null,
        received: slot.received,
        kind: spec.kind || tpl[0],
        from: src.name,
        fromKey,
        ref: spec.ref !== undefined ? spec.ref
          : src.word ? `${src.word}第115${String(Math.floor(rnd() * 9e6) + 1e6).slice(0, 7)}號`
          : fromKey === 'citizen' ? `陳情案號 C1999-${115}${String(parts(slot.received).m).padStart(2, '0')}${String(parts(slot.received).d).padStart(2, '0')}-${String(Math.floor(rnd() * 9000) + 1000)}` : null,
        subject: spec.subject || tpl[2].replace(/\{(\w+)\}/g, (_, k) => vars[k]),
        unit: unit.code,
        owner: null,
        speed,
        secret: spec.secret || (r2 < .03 ? 'confidential' : r2 < .11 ? 'restricted' : 'none'),
        level: spec.level || (r3 < .1 ? 1 : r3 < .45 ? 2 : 3),
        send: spec.send ?? (fromKey === 'self' ? chance(.55) : chance(.88)),
        attachments: spec.attachments ?? Math.floor(rnd() * 4),
        due: addBizDays(slot.received, SPEEDS[speed].days) + WORK_END,
        cosign: [],
        trail: [],
        stage: 'closed', stageAt: null, doneAt: null, dispatchedAt: null, closedAt: null, outNo: null,
        draft: spec.draft || null,
      };
      const owner = spec.owner || pick(unit.staff);
      const H = (key, def) => spec.hours && spec.hours[key] != null ? spec.hours[key] : def;
      const note = (key, pool) => (spec.notes && spec.notes[key]) || pick(pool);
      // 收文備註依來源與附件數產生；與原本的 pick 一樣只抽一次亂數，整批資料的隨機序列不變
      const regNote = () => {
        if (spec.notes && spec.notes.register) return spec.notes.register;
        const r = rnd(), n = doc.attachments;
        if (fromKey === 'self') return `${r < .5 ? '承辦單位線上創簽取號' : '創簽稿線上取號'}${n ? `，附件 ${n} 件` : ''}`;
        if (fromKey === 'citizen') return `1999 系統轉入${n ? `，陳情附件 ${n} 件` : ''}`;
        return r < .8 ? `電子交換收文${n ? `，附件 ${n} 件` : ''}` : `紙本來文，掃描 ${3 + n * 2} 頁${n ? `（含附件 ${n} 件）` : ''}`;
      };

      // 會辦單位
      if (spec.cosign) {
        doc.cosign = spec.cosign.map(c => cosignEntry(c.unit, c));
      } else if (chance(.52)) {
        const picks = [];
        if (chance(.45)) picks.push('LAW');
        if (chance(.62)) picks.push('BUD');
        if (chance(.42) || !picks.length) picks.push(pick([...UNITS.filter(u => u.code !== unit.code).map(u => u.code), 'ETH', 'HR']));
        doc.cosign = picks.map(code => cosignEntry(code, {}));
      }
      function cosignEntry(code, c) {
        const cu = UNIT_MAP[code];
        const branch = cu.branch || 'agency';
        // 政風處、人事處會辦時自稱「本處」
        const text = c.note || pick(NOTES[branch]).replace(/本局/g, cu.org.endsWith('處') ? '本處' : '本局');
        return { branch, unit: code, by: cu.person || cu.chief, state: 'pending', at: null, note: text, hours: c.hours };
      }
      // 意見候選依來源與會辦單位而定；每組都維持 4 句，抽法與原本相同
      const hasLaw = doc.cosign.some(c => c.unit === 'LAW');
      const draftPool = fromKey === 'self'
        ? (doc.cosign.some(c => c.unit === 'BUD') ? [...NOTES.draft.self.slice(0, 3), NOTES.draft.selfBud] : NOTES.draft.self)
        : fromKey === 'citizen' ? NOTES.draft.citizen
        // 「准予備查」只適用來文本身請備查、核備的案子；其餘來文要函復
        : NOTES.draft.other.map(s => /備查/.test(s) && !/備查|核備/.test(doc.subject) ? '本案依往例辦理，擬如稿函復。' : s);
      const reviewPool = [...NOTES.review, hasLaw ? NOTES.reviewLaw : '文字酌修後核稿，陳請核示。'];
      const approvePool = fromKey === 'self' ? NOTES.approveSelf
        : NOTES.approve.map(s => s === '准予備查。' && !/備查|核備/.test(doc.subject) ? '如擬辦理。' : s);
      const retPool = [...NOTES.ret, NOTES.retLaw[hasLaw ? 1 : 0]];

      // 3) 依關卡推進時間軸；碰到「現在」就停在該關卡
      let t = doc.received;
      const stopHere = key => { doc.stage = key; doc.stageAt = t; return false; };
      const run = (key, hours, entry) => {
        if (spec.stopAt === key && !(key === 'review' && entry.ret)) return stopHere(key);
        const done = addWork(t, Math.max(.1, hours));
        if (done > NOW0) return stopHere(key);
        doc.trail.push(Object.assign({ key, lane: STAGE_MAP[key].lane, node: STAGE_MAP[key].node, at: done }, entry));
        t = done;
        return true;
      };
      const uf = F[speed];
      const chief = unit.chief;
      // 精選公文的軌跡要固定，不能被隨機退回打亂
      const returned = spec.slug ? !!spec.returned : chance(.1);
      const finish = () => {
        doc.trail.sort((a, b) => a.at - b.at);
        if (STAGE_INDEX[doc.stage] >= STAGE_INDEX.draft) doc.owner = owner;
        return doc;
      };

      if (!run('register', H('register', between(.3, 2.2) * (speed === 'urgent' ? .5 : 1)), { who: 'cai-yz', action: '收文登錄', note: regNote() })) return finish();
      if (!run('assign', H('assign', between(.5, 4.5) * (speed === 'urgent' ? .4 : 1)), { who: 'zheng-wc', action: '分文', note: `分 ${unit.org} ${unit.name}，承辦人 ${PEOPLE[owner].name}` })) return finish();
      if (!run('draft', H('draft', between(4, 29) * uf), { who: owner, action: '擬辦', note: note('draft', draftPool) })) return finish();

      if (doc.cosign.length) {
        const start = t;
        let joinAt = start, pending = false;
        const base = { legal: [4, 20], budget: [10, 56], agency: [5, 24] };
        doc.cosign.forEach(c => {
          const hrs = c.hours != null ? c.hours : between(...base[c.branch]) * uf;
          delete c.hours;
          const done = hrs === Infinity ? Infinity : addWork(start, Math.max(.2, hrs));
          if (done > NOW0) { pending = true; return; }
          c.state = 'done'; c.at = done;
          doc.trail.push({ key: 'cosign', lane: 'cosign', node: 'cs-' + c.branch, branch: c.branch, unit: c.unit, at: done, who: c.by, action: '會辦', note: c.note });
          joinAt = Math.max(joinAt, done);
        });
        if (pending) { doc.stage = 'cosign'; doc.stageAt = start; return finish(); }
        t = joinAt;
      } else {
        doc.cosign.forEach(c => delete c.hours);
      }

      if (returned) {
        if (!run('review', H('review', between(1, 6) * uf), { who: chief, action: '退回', note: note('ret', retPool), ret: true })) return finish();
        if (!run('draft', H('redraft', between(2, 10) * uf), { who: owner, action: '修正後陳核', note: '已依核稿意見修正並補附佐證資料。' })) return finish();
      }
      const reviewEntry = doc.level === 3
        ? { who: chief, action: '核稿・決行', note: note('approve', approvePool) }
        : { who: chief, action: '核稿', note: note('review', reviewPool) };
      if (!run('review', H(returned ? 'review2' : 'review', between(1, 11) * uf), reviewEntry)) return finish();
      if (doc.level < 3) {
        const approver = doc.level === 2 ? unit.director : (chance(.8) ? 'shen-sy' : 'tang-zy');
        const ok = run('approve', H('approve', (doc.level === 2 ? between(3, 20) : between(14, 60)) * uf), { who: approver, action: approver === 'tang-zy' ? '決行（代判）' : '決行', note: note('approve', approvePool) });
        if (doc.level === 1) {
          const last = doc.trail[doc.trail.length - 1];
          if (last.key === 'approve') { last.lane = 'head'; last.node = 'approve-mayor'; }
        }
        if (!ok) return finish();
      }
      doc.doneAt = t;
      if (doc.send) {
        doc.outNo = `${unit.word}字第${id}號`;
        if (!run('dispatch', H('dispatch', between(.5, 5)), { who: 'guo-py', action: '發文', note: `電子交換發文，${doc.outNo}` })) { doc.outNo = null; return finish(); }
        doc.dispatchedAt = t;
      }
      if (!run('archive', H('archive', between(3, 36)), { who: 'wen-zh', action: '歸檔', note: `檔號 115/${FILE_CLASS[unit.code]}/${String(slot.seq % 1000).padStart(3, '0')}` })) return finish();
      doc.stage = 'closed'; doc.stageAt = t; doc.closedAt = t;
      return finish();
    });
  }

  const DOCS = buildDocs();
  const DOC_MAP = new Map(DOCS.map(d => [d.id, d]));
  const FEATURED_IDS = Object.fromEntries(DOCS.filter(d => d.slug).map(d => [d.slug, d.id]));

  App.DATA = {
    me: ME, people: PEOPLE, units: UNITS, cosignUnits: COSIGN_UNITS, lanes: LANES, stages: STAGES,
    speeds: SPEEDS, secrets: SECRETS, levels: LEVELS, districts: DISTRICTS, process: PROCESS,
    docs: DOCS, featured: FEATURED_IDS, branchLabel: BRANCH_LABEL,
  };

  /* ── 查詢與衍生值 ───────────────────────────────────────── */
  App.doc = id => DOC_MAP.get(String(id)) || null;
  App.featured = slug => {
    if (!FEATURED_IDS[slug]) throw new Error('Unknown featured doc: ' + slug);
    return DOC_MAP.get(FEATURED_IDS[slug]);
  };
  App.person = id => PEOPLE[id] || null;
  App.unit = code => UNIT_MAP[code] || null;
  App.stage = key => STAGE_MAP[key] || null;
  App.docUrl = id => `doc.html?id=${encodeURIComponent(id)}`;
  App.isOpen = doc => OPEN_STAGES.has(doc.stage);
  App.isOverdue = doc => App.isOpen(doc) && NOW0 > doc.due;

  App.dueState = doc => {
    if (!App.isOpen(doc)) {
      const late = doc.doneAt != null && doc.doneAt > doc.due;
      return { state: late ? 'late' : 'done', label: late ? '逾期辦結' : '如期辦結', days: 0 };
    }
    const today = dayStart(NOW0), dueDay = dayStart(doc.due);
    if (NOW0 > doc.due) {
      const d = Math.max(1, bizDaysBetween(dueDay, today));
      return { state: 'over', label: `逾 ${d} 天`, days: d };
    }
    if (dueDay === today) return { state: 'today', label: '今日到期', days: 0 };
    const left = bizDaysBetween(today, dueDay);
    if (left <= 1) return { state: 'soon', label: '明日到期', days: 1 };
    return { state: 'ok', label: `剩 ${left} 天`, days: left };
  };

  App.nodesOf = doc => {
    switch (doc.stage) {
      case 'cosign': return doc.cosign.filter(c => c.state === 'pending').map(c => 'cs-' + c.branch);
      case 'approve': return [doc.level === 1 ? 'approve-mayor' : 'approve-dg'];
      case 'closed': return [];
      default: return [doc.stage];
    }
  };
  App.stageLabel = doc => {
    if (doc.stage === 'cosign') {
      const names = [...new Set(doc.cosign.filter(c => c.state === 'pending').map(c => UNIT_MAP[c.unit].org))];
      return `會辦中（${names.join('、')}）`;
    }
    if (doc.stage === 'approve') return doc.level === 1 ? '決行（市長）' : '決行（局處首長）';
    if (doc.stage === 'review') return doc.level === 3 ? '核稿・決行' : '核稿';
    return STAGE_MAP[doc.stage].label;
  };
  App.pending = doc => {
    const u = UNIT_MAP[doc.unit];
    const one = (key, who, extra) => [Object.assign({ key, node: STAGE_MAP[key].node, lane: STAGE_MAP[key].lane, who, since: doc.stageAt }, extra)];
    switch (doc.stage) {
      case 'register': return one('register', 'cai-yz');
      case 'assign': return one('assign', 'zheng-wc');
      case 'draft': return one('draft', doc.owner);
      case 'cosign': return doc.cosign.filter(c => c.state === 'pending').map(c => ({ key: 'cosign', node: 'cs-' + c.branch, lane: 'cosign', who: c.by, since: doc.stageAt, branch: c.branch, unit: c.unit }));
      case 'review': return one('review', u.chief);
      case 'approve': return doc.level === 1 ? one('approve', 'shen-sy', { node: 'approve-mayor', lane: 'head' }) : one('approve', u.director);
      case 'dispatch': return one('dispatch', 'guo-py');
      case 'archive': return one('archive', 'wen-zh');
      default: return [];
    }
  };
  App.actors = doc => App.pending(doc).map(p => p.who);

  // 函稿用的敬稱：依來文機關性質決定「貴○」
  const honorific = from => [['議會', '貴會'], ['商業會', '貴會'], ['基金會', '貴基金會'], ['聯盟', '貴聯盟'], ['公所', '貴所'], ['管理處', '貴處'], ['公司', '貴公司'], ['縣政府', '貴府'], ['醫院', '貴院'], ['國民小學', '貴校']].find(([k]) => from.includes(k))?.[1] || '貴機關';
  App.draftOf = doc => {
    const u = UNIT_MAP[doc.unit];
    const ownerName = PEOPLE[doc.owner || u.staff[0]].name;
    const base = {
      org: '澄港市政府', kind: '函',
      addr: { line: '澄港市舊城區府前路 1 號', contact: ownerName, tel: `1999 轉 ${3100 + UNITS.indexOf(u) * 12}` },
      date: doc.dispatchedAt || null,
      no: doc.outNo,
      speed: SPEEDS[doc.speed].label,
      secret: SECRETS[doc.secret].label,
      signer: doc.level === 1 ? '市長　沈書韞' : doc.level === 2 ? `${u.org}局長　${PEOPLE[u.director].name}` : `${u.org}${u.name}科長　${PEOPLE[u.chief].name}`,
      cc: [], attachments: [],
    };
    if (doc.draft) return Object.assign(base, doc.draft);
    const r = parts(doc.received);
    const rocDate = `${r.y - 1911} 年 ${r.m} 月 ${r.d} 日`;
    const cosignOrgs = doc.cosign.map(c => UNIT_MAP[c.unit].org);
    const core = doc.subject.replace(/，請.*$/, '').replace(/。$/, '');
    if (doc.fromKey === 'self') {
      return Object.assign(base, {
        kind: '簽', to: ['', '市長', '局長', '科長'][doc.level],
        subject: `${core.replace(/^擬/, '為')}，簽請核示。`,
        desc: [
          `依本府 115 年度施政計畫及${u.org}業務職掌辦理。`,
          `本案由承辦人${ownerName}彙整相關資料${cosignOrgs.length ? `，並會辦${cosignOrgs.join('、')}` : ''}。`,
          `所需經費由${u.org} 115 年度相關計畫項下支應。`,
        ],
        actions: ['奉核後，即依程序辦理並將執行情形陳報。'],
      });
    }
    const citizen = doc.fromKey === 'citizen';
    const topic = core
      .replace(/^(有關|函轉本會|函轉|檢送|民眾陳情|家長陳情|函請協助辦理|函請)/, '')
      .replace(/(一案|案)$/, '').replace(/ 1 份$/, '')
      .replace(/^本公司/, '貴公司').replace(/^本會/, '貴會').replace(/^本校/, '貴校');
    return Object.assign(base, {
      kind: '函',
      to: citizen ? '陳情人（地址詳卷）' : doc.from,
      cc: cosignOrgs.map(o => `本府${o}`).concat(citizen ? ['本府秘書處（1999 管考）'] : []),
      subject: citizen ? `有關台端陳情${topic}一案，復如說明，請查照。` : `有關${topic}一案，復如說明，請查照。`,
      desc: [
        citizen ? `復台端 ${rocDate}陳情（${doc.ref.replace(/^陳情案號 /, '')}）。` : `復${honorific(doc.from)} ${rocDate}${doc.ref}函。`,
        `本府${u.org}已派員查明，處理情形詳如附件${doc.attachments ? '' : '說明'}。`,
      ],
      actions: ['後續如有疑義，請洽本府承辦人員。'],
      attachments: doc.attachments ? ['處理情形說明 1 份', '現場照片 1 份'].slice(0, Math.min(2, doc.attachments)) : [],
    });
  };

  App.counts = () => {
    const today = dayStart(NOW0);
    const c = { open: 0, overdue: 0, assign: 0, mine: 0, today: 0, cosign: 0 };
    for (const d of DOCS) {
      if (App.isOpen(d)) c.open++;
      if (App.isOverdue(d)) c.overdue++;
      if (d.stage === 'assign') c.assign++;
      if (d.stage === 'cosign') c.cosign++;
      if (d.received >= today) c.today++;
      if (App.actors(d).includes(ME)) c.mine++;
    }
    return c;
  };

  const matchFilter = f => d => (!f.speed || f.speed === 'all' || d.speed === f.speed) && (!f.unit || f.unit === 'all' || d.unit === f.unit);
  const HEAT_DIST = [[0, 4.5], [4.5, 9], [9, 18], [18, 36], [36, Infinity]];

  App.stageStats = (filter = {}) => {
    const out = {};
    TASK_NODES.forEach(id => { out[id] = { id, count: 0, dwellSum: 0, avgDwell: 0, overdue: 0, done7: 0, docs: [], dist: [0, 0, 0, 0, 0], heat: 0 }; });
    const since7 = dayStart(NOW0) - 6 * DAY;
    const docs = DOCS.filter(matchFilter(filter));
    for (const d of docs) {
      for (const id of App.nodesOf(d)) {
        const s = out[id];
        if (!s) continue;
        const h = workHours(Math.min(d.stageAt, NOW0), NOW0);
        s.count++; s.dwellSum += h; s.docs.push(d);
        if (App.isOverdue(d)) s.overdue++;
        s.dist[HEAT_DIST.findIndex(([a, b]) => h >= a && h < b)]++;
      }
      for (const e of d.trail) {
        if (e.at < since7) continue;
        if (out[e.node]) out[e.node].done7++;
      }
    }
    const nodeById = Object.fromEntries(PROCESS.nodes.map(n => [n.id, n]));
    for (const s of Object.values(out)) {
      s.avgDwell = s.count ? s.dwellSum / s.count : 0;
      s.docs.sort((a, b) => a.stageAt - b.stageAt);
      const n = nodeById[s.id];
      // 熱度：取「件數 / WIP 上限」與「平均停留 / SLA」較大者；0.55 以下不發熱
      const load = Math.max(s.count / n.wip, s.avgDwell / n.sla);
      s.load = load;
      s.heat = clamp((load - .55) / .9, 0, 1);
    }
    return out;
  };

  App.gatewayStats = () => {
    const past = (d, key) => d.trail.some(e => e.key === key);
    const drafted = DOCS.filter(d => past(d, 'draft'));
    const decided = DOCS.filter(d => d.doneAt != null);
    const reviewed = DOCS.filter(d => past(d, 'review'));
    return {
      'gw-cosign': { yes: drafted.filter(d => d.cosign.length).length, no: drafted.filter(d => !d.cosign.length).length },
      'gw-level': { 1: decided.filter(d => d.level === 1).length, 2: decided.filter(d => d.level === 2).length, 3: decided.filter(d => d.level === 3).length },
      'gw-send': { send: decided.filter(d => d.send).length, file: decided.filter(d => !d.send).length },
      review: { returned: reviewed.filter(d => d.trail.some(e => e.ret)).length, total: reviewed.length },
      split: Object.fromEntries(['legal', 'budget', 'agency'].map(b => [b, DOCS.filter(d => d.cosign.some(c => c.branch === b)).length / Math.max(1, DOCS.filter(d => d.cosign.length).length)])),
    };
  };

  App.processModel = () => {
    const m = structuredClone(PROCESS);
    const g = App.gatewayStats();
    const w = {
      'e-cs-yes': g['gw-cosign'].yes, 'e-cs-no': g['gw-cosign'].no,
      'e-split-legal': g.split.legal, 'e-split-budget': g.split.budget, 'e-split-agency': g.split.agency,
      'e-review': g.review.total - g.review.returned, 'e-return': g.review.returned,
      'e-l1': g['gw-level'][1], 'e-l2': g['gw-level'][2], 'e-l3': g['gw-level'][3],
      'e-send': g['gw-send'].send, 'e-file': g['gw-send'].file,
    };
    m.edges.forEach(e => { if (w[e.id] != null) e.weight = w[e.id]; });
    return m;
  };

  App.kpis = (range = 'today') => {
    const today = dayStart(NOW0);
    let from, to = NOW0, prevFrom, prevTo, buckets;
    if (range === 'today') {
      from = today;
      let pd = today - DAY; while (!isWorkday(pd)) pd -= DAY;
      prevFrom = pd; prevTo = pd + (NOW0 - today);
      buckets = Array.from({ length: 10 }, (_, i) => [today + (8 + i) * HOUR, today + (9 + i) * HOUR]);
    } else {
      const days = range === '7d' ? 7 : 30;
      from = today - (days - 1) * DAY;
      prevFrom = range === '7d' ? from - 7 * DAY : null; prevTo = range === '7d' ? from : null;
      buckets = Array.from({ length: days }, (_, i) => [from + i * DAY, from + (i + 1) * DAY]);
    }
    const recvIn = (a, b) => DOCS.filter(d => d.received >= a && d.received < b).length;
    const sentIn = (a, b) => DOCS.reduce((n, d) => n + d.trail.filter(e => e.key === 'dispatch' && e.at >= a && e.at < b).length, 0);
    const avgIn = (a, b) => {
      const done = DOCS.filter(d => d.doneAt != null && d.doneAt >= a && d.doneAt < b);
      return done.length ? done.reduce((s, d) => s + workHours(d.received, d.doneAt), 0) / done.length / WORK_DAY_H : null;
    };
    const overdueAt = T => DOCS.filter(d => d.received <= T && (d.doneAt == null || d.doneAt > T) && T > d.due).length;
    const bySpeed = { urgent: 0, fast: 0, normal: 0 };
    DOCS.forEach(d => { if (App.isOverdue(d)) bySpeed[d.speed]++; });
    // 平均處理天數與逾期趨勢固定看最近 10 個工作日
    const lastDays = [];
    for (let ds = today; lastDays.length < 10; ds -= DAY) if (isWorkday(ds)) lastDays.unshift(ds);
    return {
      range,
      recv: { value: recvIn(from, to), prev: prevFrom != null ? recvIn(prevFrom, prevTo) : null, series: buckets.map(([a, b]) => recvIn(a, Math.min(b, NOW0))) },
      sent: { value: sentIn(from, to), prev: prevFrom != null ? sentIn(prevFrom, prevTo) : null, series: buckets.map(([a, b]) => sentIn(a, Math.min(b, NOW0))) },
      // 每日快照取當天 24:00（今天取現在），當天 17:30 到期未決者算進當天
      overdue: { value: bySpeed.urgent + bySpeed.fast + bySpeed.normal, bySpeed, series: lastDays.map(ds => overdueAt(Math.min(ds + DAY - 1, NOW0))) },
      avgDays: {
        value: avgIn(range === 'today' ? today - 9 * DAY : from, to),
        prev: range === '30d' ? null : avgIn(range === 'today' ? today - 18 * DAY : from - 7 * DAY, range === 'today' ? today - 9 * DAY : from),
        target: 4, series: lastDays.map(ds => avgIn(ds, ds + DAY) ?? 0),
      },
    };
  };

  App.unitLoad = () => UNITS.map(u => {
    const docs = DOCS.filter(d => d.unit === u.code && App.isOpen(d) && STAGE_INDEX[d.stage] >= STAGE_INDEX.draft);
    const byStage = { draft: 0, cosign: 0, review: 0, approve: 0 };
    docs.forEach(d => { byStage[d.stage]++; });
    return { code: u.code, org: u.org, name: u.name, open: docs.length, overdue: docs.filter(App.isOverdue).length, byStage };
  });

  App.hourly = () => {
    const today = dayStart(NOW0);
    return Array.from({ length: 10 }, (_, i) => {
      const a = today + (8 + i) * HOUR, b = a + HOUR;
      return {
        h: 8 + i,
        recv: DOCS.filter(d => d.received >= a && d.received < b).length,
        sent: DOCS.reduce((n, d) => n + d.trail.filter(e => e.key === 'dispatch' && e.at >= a && e.at < b).length, 0),
        decided: DOCS.filter(d => d.doneAt != null && d.doneAt >= a && d.doneAt < b).length,
      };
    });
  };

  App.recent = (n = 8) => {
    const out = [];
    for (const doc of DOCS) for (const entry of doc.trail) if (entry.at <= App.now()) out.push({ at: entry.at, doc, entry });
    return out.sort((a, b) => b.at - a.at).slice(0, n);
  };

  /* ── 事件與資料變更 ─────────────────────────────────────── */
  const bus = new EventTarget();
  App.on = (name, fn) => {
    const h = e => fn(e.detail);
    bus.addEventListener(name, h);
    return () => bus.removeEventListener(name, h);
  };
  App.emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  const restore = (doc, snap) => { Object.keys(doc).forEach(k => delete doc[k]); Object.assign(doc, snap); };
  const setStage = (doc, key, at) => { doc.stage = key; doc.stageAt = at; };
  const laneFor = (doc, key) => key === 'approve' && doc.level === 1 ? 'head' : STAGE_MAP[key].lane;
  const nodeFor = (doc, key, branch) => key === 'cosign' ? 'cs-' + branch : key === 'approve' ? (doc.level === 1 ? 'approve-mayor' : 'approve-dg') : STAGE_MAP[key].node;

  App.assign = (ids, unitCode, ownerId, note = '') => {
    const unit = UNIT_MAP[unitCode];
    if (!unit || !unit.staff) throw new Error('App.assign: unknown unit ' + unitCode);
    if (!unit.staff.includes(ownerId)) throw new Error(`App.assign: ${ownerId} is not staff of ${unitCode}`);
    const snaps = [];
    let skipped = 0;
    const now = App.now();
    for (const id of ids) {
      const doc = App.doc(id);
      if (!doc || doc.stage !== 'assign') { skipped++; continue; }
      snaps.push([doc, structuredClone(doc)]);
      doc.unit = unitCode; doc.owner = ownerId;
      doc.trail.push({ key: 'assign', lane: 'mail', node: 'assign', at: now, who: ME, action: '分文', note: note || `分 ${unit.org} ${unit.name}，承辦人 ${PEOPLE[ownerId].name}` });
      setStage(doc, 'draft', now);
    }
    if (snaps.length) App.emit('docs', { type: 'assign', ids: snaps.map(([d]) => d.id) });
    return {
      count: snaps.length, skipped,
      undo() { snaps.forEach(([doc, snap]) => restore(doc, snap)); App.emit('docs', { type: 'undo', ids: snaps.map(([d]) => d.id) }); },
    };
  };

  App.act = (id, action, o = {}) => {
    const doc = App.doc(id);
    if (!doc) throw new Error('App.act: unknown doc ' + id);
    const snap = structuredClone(doc);
    const now = App.now();
    const who = o.who || ME;
    const push = (key, label, extra = {}) => doc.trail.push(Object.assign({ key, lane: laneFor(doc, key), node: nodeFor(doc, key, extra.branch), at: now, who, action: label, note: o.note || '' }, extra));
    const decide = () => { doc.doneAt = now; setStage(doc, doc.send ? 'dispatch' : 'archive', now); };
    const fail = () => { throw new Error(`App.act: cannot ${action} doc ${id} at stage ${doc.stage}`); };
    switch (action) {
      case 'approve':
        if (doc.stage === 'draft') { push('draft', '擬辦陳核'); setStage(doc, doc.cosign.some(c => c.state === 'pending') ? 'cosign' : 'review', now); }
        else if (doc.stage === 'cosign') {
          const c = doc.cosign.find(x => x.state === 'pending' && (!o.branch || x.branch === o.branch));
          if (!c) fail();
          c.state = 'done'; c.at = now; if (o.note) c.note = o.note;
          push('cosign', '會辦', { branch: c.branch, unit: c.unit, who: o.who || c.by });
          if (!doc.cosign.some(x => x.state === 'pending')) setStage(doc, 'review', now);
        } else if (doc.stage === 'review') {
          if (doc.level === 3) { push('review', '核稿・決行'); decide(); } else { push('review', '核稿'); setStage(doc, 'approve', now); }
        } else if (doc.stage === 'approve') { push('approve', '決行'); decide(); }
        else fail();
        break;
      case 'return':
        if (!['cosign', 'review', 'approve'].includes(doc.stage)) fail();
        push(doc.stage, '退回', { ret: true });
        doc.cosign.forEach(c => { if (c.state === 'pending') c.state = 'cancelled'; });
        setStage(doc, 'draft', now);
        break;
      case 'cosign': {
        if (!['draft', 'review', 'approve'].includes(doc.stage)) fail();
        const codes = (o.units || []).filter(code => UNIT_MAP[code] && code !== doc.unit && !doc.cosign.some(c => c.unit === code && c.state === 'pending'));
        if (!codes.length) throw new Error('App.act cosign: no valid units');
        codes.forEach(code => {
          const cu = UNIT_MAP[code];
          doc.cosign.push({ branch: cu.branch || 'agency', unit: code, by: cu.person || cu.chief, state: 'pending', at: null, note: '' });
        });
        push(doc.stage, '加會', { note: o.note || `加會 ${codes.map(c => UNIT_MAP[c].org).join('、')}` });
        setStage(doc, 'cosign', now);
        break;
      }
      case 'escalate':
        if (doc.stage === 'review') { if (doc.level === 3) doc.level = 2; push('review', '陳核'); setStage(doc, 'approve', now); }
        else if (doc.stage === 'approve' && doc.level === 2) { push('approve', '陳核'); doc.level = 1; doc.stageAt = now; }
        else fail();
        break;
      case 'dispatch':
        if (doc.stage !== 'dispatch') fail();
        doc.outNo = `${UNIT_MAP[doc.unit].word}字第${doc.id}號`;
        push('dispatch', '發文', { note: o.note || `電子交換發文，${doc.outNo}` });
        doc.dispatchedAt = now; setStage(doc, 'archive', now);
        break;
      case 'archive':
        if (doc.stage !== 'archive') fail();
        push('archive', '歸檔');
        doc.closedAt = now; setStage(doc, 'closed', now);
        break;
      default:
        throw new Error('App.act: unknown action ' + action);
    }
    App.emit('docs', { type: action, ids: [id] });
    return { undo() { restore(doc, snap); App.emit('docs', { type: 'undo', ids: [id] }); } };
  };

  /* ── 標記產生器 ─────────────────────────────────────────── */
  const ICONS = {
    search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/>',
    filter: '<path d="M3.5 5h13M6 10h8M8.5 15h3"/>',
    sort: '<path d="M7 4v12M4 7l3-3 3 3M13 16V4M10 13l3 3 3-3"/>',
    'chevron-down': '<path d="m5.5 8 4.5 4.5L14.5 8"/>',
    'chevron-up': '<path d="m5.5 12 4.5-4.5 4.5 4.5"/>',
    'chevron-right': '<path d="m8 5.5 4.5 4.5L8 14.5"/>',
    'chevron-left': '<path d="M12 5.5 7.5 10l4.5 4.5"/>',
    'arrow-right': '<path d="M4 10h11.5M11 5.5 15.5 10 11 14.5"/>',
    'arrow-left': '<path d="M16 10H4.5M9 5.5 4.5 10 9 14.5"/>',
    'arrow-up': '<path d="M10 16V4.5M5.5 9 10 4.5 14.5 9"/>',
    x: '<path d="m5.5 5.5 9 9m0-9-9 9"/>',
    check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
    plus: '<path d="M10 4.5v11M4.5 10h11"/>',
    minus: '<path d="M4.5 10h11"/>',
    clock: '<circle cx="10" cy="10" r="6.8"/><path d="M10 6.3V10l2.6 1.8"/>',
    alert: '<path d="M10 3.2 17.3 16H2.7z"/><path d="M10 8.3v3.4M10 13.9v.1"/>',
    info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.5v.1"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.8a3 3 0 0 1 6 0V9"/>',
    user: '<circle cx="10" cy="7" r="3"/><path d="M4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"/>',
    users: '<circle cx="7.5" cy="7.5" r="2.6"/><path d="M2.8 16c.6-2.8 2.4-4.3 4.7-4.3s4.1 1.5 4.7 4.3"/><circle cx="13.8" cy="6.5" r="2.2"/><path d="M13.6 10.6c2 0 3.4 1.3 3.9 3.8"/>',
    doc: '<path d="M5.5 2.5h6l3.5 3.5v11.5h-9.5z"/><path d="M11.5 2.5V6H15M8 10h5M8 13h5"/>',
    list: '<path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.5 5.5h.5M3.5 10h.5M3.5 14.5h.5"/>',
    flow: '<circle cx="3.6" cy="10" r="2"/><rect x="7.2" y="7" width="5.2" height="6" rx="1.3"/><path d="m16.5 7.2 2.8 2.8-2.8 2.8-2.8-2.8z"/><path d="M5.6 10h1.6M12.4 10h1.3"/>',
    designer: '<rect x="5" y="6" width="10" height="8" rx="1.8"/><path d="M2.5 3.5h2v2h-2zM15.5 3.5h2v2h-2zM2.5 14.5h2v2h-2zM15.5 14.5h2v2h-2z"/>',
    pen: '<path d="M13.5 3.5 16.5 6.5 7 16H4v-3z"/><path d="m11.5 5.5 3 3"/>',
    play: '<path d="M6.5 4.5v11l9-5.5z"/>',
    pause: '<path d="M7 4.5v11M13 4.5v11"/>',
    stop: '<rect x="5" y="5" width="10" height="10" rx="1.5"/>',
    undo: '<path d="M7.5 5 4 8.5 7.5 12"/><path d="M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9"/>',
    redo: '<path d="M12.5 5 16 8.5 12.5 12"/><path d="M16 8.5H8.5a4.5 4.5 0 0 0 0 9H11"/>',
    send: '<path d="M3.5 10 16.5 3.5 12 16.5 9.5 11z"/><path d="M9.5 11 16.5 3.5"/>',
    archive: '<rect x="3" y="4" width="14" height="4" rx="1"/><path d="M4.5 8v8h11V8M8 11h4"/>',
    stamp: '<path d="M8 3.5h4l-.6 6h-2.8z"/><path d="M4.5 12.5h11v2.5h-11zM5 17.5h10"/>',
    return: '<path d="M8 5.5 4.5 9 8 12.5"/><path d="M4.5 9H12a3.5 3.5 0 0 1 0 7h-1.5"/>',
    branch: '<circle cx="5" cy="4.5" r="1.8"/><circle cx="5" cy="15.5" r="1.8"/><circle cx="15" cy="7" r="1.8"/><path d="M5 6.3v7.4M15 8.8c0 3.5-5.5 2.5-9 5"/>',
    escalate: '<path d="M10 15V4.5M5.5 9 10 4.5 14.5 9"/><path d="M5 17.5h10"/>',
    comment: '<path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z"/>',
    paperclip: '<path d="M14.5 9.5 9 15a3.2 3.2 0 0 1-4.5-4.5l6-6a2.1 2.1 0 0 1 3 3l-6 6a1 1 0 0 1-1.5-1.5l5.2-5.2"/>',
    download: '<path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12"/>',
    print: '<path d="M6 7.5V3.5h8v4"/><rect x="3.5" y="7.5" width="13" height="6.5" rx="1.2"/><path d="M6 12h8v4.5H6z"/>',
    calendar: '<rect x="3.5" y="4.5" width="13" height="12" rx="1.5"/><path d="M3.5 8.5h13M7 3v3M13 3v3"/>',
    more: '<path d="M4.5 10h.1M10 10h.1M15.5 10h.1" stroke-width="2.4"/>',
    menu: '<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>',
    'zoom-in': '<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8M9 6.5v5M6.5 9h5"/>',
    'zoom-out': '<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8M6.5 9h5"/>',
    fit: '<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/>',
    trash: '<path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10.5h7.4L14.5 6"/>',
    copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="1.5"/><path d="M13 7V4.5A1 1 0 0 0 12 3.5H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1H7"/>',
    eye: '<path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
    link: '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9"/>',
    bolt: '<path d="M11 2.5 4.5 11h5l-1 6.5L15.5 9h-5z"/>',
    grid: '<rect x="3.5" y="3.5" width="5" height="5" rx="1"/><rect x="11.5" y="3.5" width="5" height="5" rx="1"/><rect x="3.5" y="11.5" width="5" height="5" rx="1"/><rect x="11.5" y="11.5" width="5" height="5" rx="1"/>',
    save: '<path d="M4 3.5h9.5l2.5 2.5v10.5H4z"/><path d="M7 3.5v4h6v-4M7 16.5v-5h6v5"/>',
    sim: '<circle cx="4.5" cy="10" r="2"/><path d="M6.5 10H11"/><path d="m10 6.5 5.5 3.5-5.5 3.5z"/>',
  };
  App.icon = (name, cls = '') => {
    if (!ICONS[name]) throw new Error('App.icon: unknown icon "' + name + '"');
    return `<svg class="icon ${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  };

  const DIAMOND = '<path d="M12 2.6 21.4 12 12 21.4 2.6 12Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>';
  const GLYPHS = {
    start: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    'start-msg': '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7.2" y="8.6" width="9.6" height="6.8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m7.6 9.2 4.4 3.3 4.4-3.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>',
    end: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="3.2"/>',
    'end-msg': '<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="3"/><rect x="7.6" y="9" width="8.8" height="6.2" rx=".8" fill="currentColor"/><path d="m8 9.4 4 3 4-3" fill="none" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/>',
    timer: '<circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 7.6V12l3 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    task: '<rect x="2.8" y="5.8" width="18.4" height="12.4" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    'task-user': '<rect x="2.8" y="5.8" width="18.4" height="12.4" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7.6" cy="10" r="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5 14.8c.4-1.7 1.4-2.6 2.6-2.6s2.2.9 2.6 2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
    xor: DIAMOND + '<path d="m9.2 9.2 5.6 5.6m0-5.6-5.6 5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    and: DIAMOND + '<path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    or: DIAMOND + '<circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    flow: '<path d="M2.5 12h15" stroke="currentColor" stroke-width="1.6"/><path d="M16 8.5 21.5 12 16 15.5z" fill="currentColor"/>',
    token: '<circle cx="12" cy="12" r="9" fill="#00A3FF" opacity=".18"/><circle cx="12" cy="12" r="4.6" fill="#00A3FF"/>',
    lane: '<rect x="2.5" y="4.5" width="19" height="15" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 4.5v15M6.5 12h15" stroke="currentColor" stroke-width="1.2"/>',
    return: '<path d="M19 8H8a4 4 0 0 0 0 8h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/><path d="m11.5 4.5-4 3.5 4 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(-3 0)"/>',
    escalate: '<circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 16.5v-9M8 11.5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  App.glyph = (type, cls = '') => {
    if (!GLYPHS[type]) throw new Error('App.glyph: unknown glyph "' + type + '"');
    return `<svg class="glyph ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${GLYPHS[type]}</svg>`;
  };

  App.docNo = id => `<span class="doc-no">${esc(id)}</span>`;
  App.speedBadge = s => `<span class="speed speed--${s}">${s === 'urgent' ? App.icon('bolt') : ''}${SPEEDS[s].label}</span>`;
  App.secretBadge = s => `<span class="secret secret--${s}">${s === 'none' ? '' : App.icon('lock')}${SECRETS[s].label}</span>`;
  App.dueTag = doc => {
    const st = App.dueState(doc);
    return `<span class="due due--${st.state}"><span class="due__date">${App.fmt.date(doc.due)}</span><span class="due__label">${st.label}</span></span>`;
  };
  App.stageTag = doc => {
    const st = STAGE_MAP[doc.stage];
    return `<span class="stage-tag${App.isOpen(doc) ? ' stage-tag--current' : ''}">${App.glyph(st.glyph)}${esc(App.stageLabel(doc))}</span>`;
  };
  App.avatar = (id, { size = '' } = {}) => {
    const p = PEOPLE[id];
    if (!p) throw new Error('App.avatar: unknown person ' + id);
    return `<span class="avatar${size ? ' avatar--' + size : ''}${id === ME ? ' avatar--me' : ''}" title="${esc(p.name)}" aria-hidden="true">${esc(p.name[0])}</span>`;
  };
  App.personTag = (id, { role = true, size = 'sm' } = {}) => {
    const p = PEOPLE[id];
    if (!p) throw new Error('App.personTag: unknown person ' + id);
    const u = UNIT_MAP[p.unit];
    return `<span class="person">${App.avatar(id, { size })}<span><span class="person__name">${esc(p.name)}</span>${role ? `<span class="person__role"> ${esc(u.code === 'MAYOR' ? '' : u.org)}${esc(p.title)}</span>` : ''}</span></span>`;
  };

  const MF_STEPS = [
    { k: 'register', label: '收文', shape: 'start' }, { k: 'assign', label: '分文', shape: 'task' },
    { k: 'draft', label: '承辦', shape: 'task' }, { k: 'cosign', label: '會辦', shape: 'and' },
    { k: 'review', label: '核稿', shape: 'task' }, { k: 'approve', label: '決行', shape: 'task' },
    { k: 'dispatch', label: '發文', shape: 'task' }, { k: 'archive', label: '歸檔', shape: 'end' },
  ];
  App.miniFlow = (doc, { lg = false } = {}) => {
    const cur = STAGE_INDEX[doc.stage];
    const gap = lg ? 64 : 18, pad = lg ? 16 : 7, cy = lg ? 13 : 8, s = lg ? 7 : 4.6;
    const W = pad * 2 + gap * 7, H = lg ? 44 : 16;
    let links = '', marks = '', labels = '';
    MF_STEPS.forEach((st, i) => {
      const x = pad + gap * i;
      const skip = (st.k === 'cosign' && !doc.cosign.length) || (st.k === 'approve' && doc.level === 3) || (st.k === 'dispatch' && !doc.send);
      const state = skip ? 'is-skip' : i < cur ? 'is-done' : i === cur ? 'is-current' : '';
      if (i > 0) links += `<line class="mf-link${i <= cur ? ' is-done' : ''}" x1="${x - gap + s + 1.5}" y1="${cy}" x2="${x - s - 1.5}" y2="${cy}"/>`;
      const cls = `mf-mark ${state}${st.shape === 'end' ? ' mf-end' : ''}`;
      if (st.shape === 'start' || st.shape === 'end') marks += `<circle class="${cls}" cx="${x}" cy="${cy}" r="${s}"/>`;
      else if (st.shape === 'and') marks += `<path class="${cls}" d="M${x} ${cy - s - 1}L${x + s + 1} ${cy}L${x} ${cy + s + 1}L${x - s - 1} ${cy}Z"/>`;
      else marks += `<rect class="${cls}" x="${x - s}" y="${cy - s * .8}" width="${s * 2}" height="${s * 1.6}" rx="${lg ? 2.5 : 1.6}"/>`;
      if (state === 'is-current') marks += `<circle class="mf-ring" cx="${x}" cy="${cy}" r="${s + 1}"/>`;
      if (lg) labels += `<text class="mf-label ${state}" x="${x}" y="${cy + s + 15}">${st.label}</text>`;
    });
    const label = doc.stage === 'closed' ? '已結案' : `目前關卡：${App.stageLabel(doc)}`;
    return `<svg class="mini-flow${lg ? ' mini-flow--lg' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${links}${marks}${labels}</svg>`;
  };

  let sealSeq = 0;
  App.seal = ({ name, title = '', date = null, kind = 'name' } = {}) => {
    if (!name) throw new Error('App.seal: name required');
    const fid = 'seal-rough-' + (++sealSeq);
    // 用雜訊位移讓印框與字邊緣不完美，像真的蓋上去
    const filter = `<defs><filter id="${fid}" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="${sealSeq * 7}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
    if (kind === 'decide') {
      const d = date != null ? App.fmt.roc(date) : '';
      return `<svg class="seal seal--decide" viewBox="0 0 92 60" role="img" aria-label="決行章 ${esc(name)} ${esc(d)}">${filter}<g filter="url(#${fid})"><rect x="2" y="2" width="88" height="56" rx="7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M2 20h88M2 42h88" stroke="currentColor" stroke-width="1.3"/><text x="46" y="11.5" font-size="12" font-weight="700" letter-spacing="6">決行</text><text class="seal__mono" x="46" y="31" font-size="12.5">${esc(d)}</text><text x="46" y="50" font-size="11.5" letter-spacing="3">${esc(name)}</text></g></svg>`;
    }
    const chars = [...name];
    const tchars = [...title];
    const nStep = 19, tStep = 13;
    const nameText = chars.map((c, i) => `<text x="22" y="${(42 - (chars.length - 1) * nStep / 2 + i * nStep).toFixed(1)}" font-size="16.5" font-weight="700">${esc(c)}</text>`).join('');
    const titleText = tchars.map((c, i) => `<text x="44" y="${(42 - (tchars.length - 1) * tStep / 2 + i * tStep).toFixed(1)}" font-size="11.5" font-weight="700">${esc(c)}</text>`).join('');
    return `<svg class="seal seal--name" viewBox="0 0 60 84" role="img" aria-label="${esc(title)} ${esc(name)} 職章">${filter}<g filter="url(#${fid})"><rect x="2.5" y="2.5" width="55" height="79" rx="3.5" fill="none" stroke="currentColor" stroke-width="3"/><rect x="6.5" y="6.5" width="47" height="71" rx="1.5" fill="none" stroke="currentColor" stroke-width="1"/><path d="M34 12v60" stroke="currentColor" stroke-width=".9"/>${nameText}${titleText}</g></svg>`;
  };

  App.spark = (values, { w = 200, h = 34 } = {}) => {
    const max = Math.max(1, ...values), n = values.length;
    const xs = i => n === 1 ? w / 2 : (i / (n - 1)) * w;
    const ys = v => h - 3 - (v / max) * (h - 8);
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${ys(v).toFixed(1)}`).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-area" d="${line}L${w} ${h}L0 ${h}Z"/><path class="spark-line" d="${line}" vector-effect="non-scaling-stroke"/></svg>`;
  };

  App.emptyState = ({ title = '沒有符合條件的公文', text = '', glyph = 'end', actions = '' } = {}) =>
    `<div class="empty">${App.glyph(glyph)}<p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}${actions ? `<div class="empty__actions">${actions}</div>` : ''}</div>`;

  /* ── UI：toast / modal / confirm ───────────────────────── */
  const openDialogs = [];
  let toastBox = null;
  const toastHost = () => openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
  function ensureToastBox() {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
    }
    const host = toastHost();
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
    return toastBox;
  }
  App.toast = (text, { tone = '', action = null, duration = 4200 } = {}) => {
    const box = ensureToastBox();
    const el = document.createElement('div');
    el.className = 'toast' + (tone ? ' toast--' + tone : '');
    const g = tone === 'ok' ? 'end' : tone === 'danger' ? 'timer' : tone === 'warn' ? 'timer' : 'token';
    el.innerHTML = `${App.glyph(g)}<span class="toast__text">${esc(text)}</span>`;
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      if (!el.isConnected || el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reducedMotion() ? 0 : 240);
    };
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast__action'; b.textContent = action.label;
      b.addEventListener('click', () => { action.onClick(); close(); });
      el.appendChild(b);
    }
    box.appendChild(el);
    timer = setTimeout(close, duration);
    return { close };
  };

  App.modal = {
    open(dlg) {
      if (!(dlg instanceof HTMLDialogElement)) throw new Error('App.modal.open: <dialog> required');
      if (dlg.open) return;
      dlg.showModal();
      openDialogs.push(dlg);
      if (toastBox) ensureToastBox();
      if (!dlg.dataset.bound) {
        dlg.dataset.bound = '1';
        dlg.addEventListener('close', () => {
          const i = openDialogs.indexOf(dlg);
          if (i >= 0) openDialogs.splice(i, 1);
          if (toastBox) ensureToastBox();
        });
        // 點背景（dialog 本身）關閉
        dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close('backdrop'); });
      }
    },
    close(dlg, value = '') { if (dlg.open) dlg.close(value); },
  };

  App.confirm = ({ title = '確認', text = '', ok = '確定', cancel = '取消', tone = '' } = {}) => new Promise(resolve => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = `<div class="modal__head"><h2 class="modal__title">${App.glyph(tone === 'danger' ? 'timer' : 'xor')}${esc(title)}</h2></div>
      <div class="modal__body"><p>${esc(text)}</p></div>
      <div class="modal__foot"><button type="button" class="btn btn--ghost" value="cancel">${esc(cancel)}</button><button type="button" class="btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}" value="ok">${esc(ok)}</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelectorAll('.modal__foot button').forEach(b => b.addEventListener('click', () => dlg.close(b.value)));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); setTimeout(() => dlg.remove(), 0); });
    App.modal.open(dlg);
    dlg.querySelector('[value="ok"]').focus();
  });

  /* ── UI：tabs / seg / chips / switch ───────────────────── */
  App.tabs = root => {
    const tabs = $$('[role="tab"]', root);
    if (!tabs.length || root.dataset.tabsBound) return;
    root.dataset.tabsBound = '1';
    const ink = document.createElement('span');
    ink.className = 'tabs__ink';
    root.appendChild(ink);
    const place = () => {
      const t = tabs.find(x => x.getAttribute('aria-selected') === 'true') || tabs[0];
      ink.style.transform = `translateX(${t.offsetLeft}px) scaleX(${t.offsetWidth})`;
    };
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      place();
      root.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, id: tab.id, value: tab.dataset.value } }));
    };
    tabs.forEach(t => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        const i = tabs.indexOf(t);
        const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    const initial = tabs.find(x => x.getAttribute('aria-selected') === 'true') || tabs[0];
    tabs.forEach(t => { t.tabIndex = t === initial ? 0 : -1; });
    requestAnimationFrame(place);
    new ResizeObserver(place).observe(root);
  };

  document.addEventListener('click', e => {
    const segBtn = e.target.closest('.seg[data-seg] > button');
    if (segBtn) {
      const seg = segBtn.parentElement;
      if (segBtn.getAttribute('aria-pressed') === 'true') return;
      $$(':scope > button', seg).forEach(b => b.setAttribute('aria-pressed', String(b === segBtn)));
      seg.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: segBtn.dataset.value } }));
      return;
    }
    const chip = e.target.closest('.chips[data-chips] .chip');
    if (chip) {
      const box = chip.closest('.chips');
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      const values = $$('.chip[aria-pressed="true"]', box).map(c => c.dataset.value);
      box.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { values } }));
      return;
    }
    const sw = e.target.closest('button.switch[role="switch"]');
    if (sw) {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      sw.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { checked: on } }));
      return;
    }
    const opener = e.target.closest('[data-modal-open]');
    if (opener) {
      const dlg = document.getElementById(opener.dataset.modalOpen);
      if (!dlg) throw new Error('data-modal-open: no dialog #' + opener.dataset.modalOpen);
      App.modal.open(dlg);
      return;
    }
    const closer = e.target.closest('dialog [data-modal-close]');
    if (closer) closer.closest('dialog').close(closer.dataset.modalClose || '');
  });

  /* ── 數字滾動：每幀讀最新目標值，連續呼叫只會改目標 ─────── */
  const countState = new WeakMap();
  App.countTo = (el, value, { decimals = 0, duration = 700 } = {}) => {
    const fmt = v => decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString('zh-TW');
    if (value == null || !isFinite(value)) { countState.delete(el); el.textContent = '—'; return; }
    if (reducedMotion()) { countState.delete(el); el.textContent = fmt(value); return; }
    const prev = countState.get(el);
    const shown = parseFloat(String(el.textContent).replace(/,/g, ''));
    const st = { from: isFinite(shown) ? shown : 0, to: value, start: performance.now(), duration, fmt };
    countState.set(el, st);
    if (prev && prev.running) { st.running = true; return; }
    st.running = true;
    const tick = now => {
      const cur = countState.get(el);
      if (!cur) return;
      const k = clamp((now - cur.start) / cur.duration, 0, 1);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = cur.fmt(cur.from + (cur.to - cur.from) * eased);
      if (k < 1) requestAnimationFrame(tick); else cur.running = false;
    };
    requestAnimationFrame(tick);
  };

  /* ── 捲動進場、動畫暫停 ─────────────────────────────────── */
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -6% 0px' });
  App.reveal = (root = document) => {
    const els = $$('[data-reveal]:not(.is-in)', root);
    const vh = innerHeight;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('is-in');
      else revealIO.observe(el);
    });
    // 保底：IntersectionObserver 沒觸發（列印、截圖、極快捲動）時也一定會出現
    setTimeout(() => els.forEach(el => el.classList.add('is-in')), 2600);
  };
  const animIO = new IntersectionObserver(entries => {
    entries.forEach(en => en.target.classList.toggle('is-offscreen', !en.isIntersecting));
  });
  App.watchAnim = (root = document) => $$('[data-anim]', root).forEach(el => animIO.observe(el));

  /* ── 外殼：導覽、選單、時鐘、計數 ───────────────────────── */
  function initShell() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const header = $('.site-header');
    const btn = $('[data-menu-toggle]');
    if (header && btn) {
      const set = open => {
        header.classList.toggle('is-nav-open', open);
        btn.setAttribute('aria-expanded', String(open));
        btn.innerHTML = App.icon(open ? 'x' : 'menu');
        btn.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      };
      btn.addEventListener('click', () => set(!header.classList.contains('is-nav-open')));
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-nav-open')) { set(false); btn.focus(); } });
      // 用 composedPath：切換鈕會換掉自己的圖示，事件目標此時已不在 DOM 裡，contains() 會誤判成點在外面
      document.addEventListener('click', e => { if (header.classList.contains('is-nav-open') && !e.composedPath().includes(header)) set(false); });
      matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) set(false); });
    }
    const tickClock = () => $$('[data-clock]').forEach(el => {
      const now = App.now();
      el.textContent = el.dataset.clock === 'time' ? App.fmt.time(now) : App.fmt.clock(now);
      if (el.tagName === 'TIME') el.dateTime = new Date(now).toISOString();
    });
    tickClock();
    setInterval(tickClock, 1000);
    const paintCounts = () => {
      const c = App.counts();
      $$('[data-count]').forEach(el => {
        const v = c[el.dataset.count];
        if (v == null) throw new Error('data-count: unknown key ' + el.dataset.count);
        el.textContent = v ? String(v) : '';
      });
    };
    paintCounts();
    App.on('docs', paintCounts);
    document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-tab-hidden', document.hidden));
  }

  /* ── 流程圖引擎 App.Flow ───────────────────────────────── */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const GATEWAYS = new Set(['xor', 'and', 'or']);
  const EVENTS = new Set(['start', 'end']);
  const NODE_TYPES = new Set(['start', 'end', 'task', 'xor', 'and', 'or']);
  let flowSeq = 0;
  const f1 = v => Math.round(v * 10) / 10;

  function nodeSize(n) {
    if (n.type === 'task') return { w: n.w || 104, h: n.h || 54 };
    if (EVENTS.has(n.type)) return { w: 36, h: 36 };
    return { w: 46, h: 46 };
  }
  function anchorPt(n, side) {
    const { w, h } = nodeSize(n);
    if (side === 'l') return [n.x - w / 2, n.y];
    if (side === 'r') return [n.x + w / 2, n.y];
    if (side === 't') return [n.x, n.y - h / 2];
    return [n.x, n.y + h / 2];
  }
  function autoSides(a, b, e) {
    const dx = b.x - a.x, dy = b.y - a.y, flatY = Math.abs(dy) < 4, flatX = Math.abs(dx) < 4;
    let exit = e.exit, enter = e.enter;
    if (!exit) {
      if (flatX && !flatY) exit = dy < 0 ? 't' : 'b';
      else if (dx < 0) exit = 'b';
      else if (!flatY && GATEWAYS.has(a.type)) exit = dy < 0 ? 't' : 'b';
      else exit = 'r';
    }
    if (!enter) {
      if (flatX && !flatY) enter = dy < 0 ? 'b' : 't';
      else if (dx < 0) enter = 'b';
      else if (!flatY && GATEWAYS.has(b.type) && exit === 'r') enter = dy < 0 ? 'b' : 't';
      else enter = 'l';
    }
    return [exit, enter];
  }
  // 正交路由：依出口/入口方向決定折點；e.mx / e.my 可指定折線位置
  function routePoints(a, b, e = {}) {
    const [exit, enter] = autoSides(a, b, e);
    const P = anchorPt(a, exit), Q = anchorPt(b, enter);
    const hz = s => s === 'l' || s === 'r';
    const pts = [P];
    if (hz(exit) && hz(enter)) {
      if (exit === 'r' && enter === 'l' && Q[0] < P[0] + 8) {
        const my = e.my ?? Math.max(a.y + nodeSize(a).h / 2, b.y + nodeSize(b).h / 2) + 24;
        pts.push([P[0] + 16, P[1]], [P[0] + 16, my], [Q[0] - 16, my], [Q[0] - 16, Q[1]]);
      } else if (Math.abs(P[1] - Q[1]) >= 1) {
        const mx = e.mx ?? (P[0] + Q[0]) / 2;
        pts.push([mx, P[1]], [mx, Q[1]]);
      }
    } else if (!hz(exit) && !hz(enter)) {
      const down = exit === 'b', fromBelow = enter === 'b';
      let my;
      if (e.my != null) my = e.my;
      else if (down && !fromBelow && Q[1] > P[1]) my = (P[1] + Q[1]) / 2;
      else if (!down && fromBelow && Q[1] < P[1]) my = (P[1] + Q[1]) / 2;
      else if (down) my = Math.max(P[1], Q[1]) + 24;
      else my = Math.min(P[1], Q[1]) - 24;
      if (Math.abs(P[0] - Q[0]) >= 1) pts.push([P[0], my], [Q[0], my]);
    } else if (!hz(exit)) {
      pts.push([P[0], Q[1]]);
    } else {
      pts.push([Q[0], P[1]]);
    }
    pts.push(Q);
    // 去掉重複點與共線中間點，避免零長度線段
    const clean = [];
    for (const p of pts) {
      const last = clean[clean.length - 1];
      if (last && Math.abs(last[0] - p[0]) < .5 && Math.abs(last[1] - p[1]) < .5) continue;
      clean.push(p);
    }
    for (let i = clean.length - 2; i > 0; i--) {
      const [a0, a1] = clean[i - 1], [b0, b1] = clean[i], [c0, c1] = clean[i + 1];
      if ((Math.abs(a0 - b0) < .5 && Math.abs(b0 - c0) < .5) || (Math.abs(a1 - b1) < .5 && Math.abs(b1 - c1) < .5)) clean.splice(i, 1);
    }
    return clean;
  }
  // 圓角折線 + 取樣多邊形（token 依此做等速移動，不依賴 DOM 的 getPointAtLength）
  function buildGeo(pts, r = 9) {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    const poly = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
      const d1 = Math.hypot(cx - px, cy - py), d2 = Math.hypot(nx - cx, ny - cy);
      const rr = Math.min(r, d1 / 2, d2 / 2);
      const ax = cx + (px - cx) / d1 * rr, ay = cy + (py - cy) / d1 * rr;
      const bx = cx + (nx - cx) / d2 * rr, by = cy + (ny - cy) / d2 * rr;
      d += ` L${f1(ax)} ${f1(ay)} Q${f1(cx)} ${f1(cy)} ${f1(bx)} ${f1(by)}`;
      poly.push([ax, ay]);
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, u = 1 - t;
        poly.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
      }
    }
    const last = pts[pts.length - 1];
    d += ` L${f1(last[0])} ${f1(last[1])}`;
    poly.push(last);
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
    return { pts, d, poly, cum, len: cum[cum.length - 1] };
  }
  function pointAt(geo, s) {
    const { poly, cum, len } = geo;
    if (s <= 0) return poly[0];
    if (s >= len) return poly[poly.length - 1];
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [poly[lo][0] + (poly[hi][0] - poly[lo][0]) * t, poly[lo][1] + (poly[hi][1] - poly[lo][1]) * t];
  }
  function labelPos(pts, e) {
    if (e.lx != null && e.ly != null) return { x: e.lx, y: e.ly, anchor: e.la || 'middle' };
    let best = -1, bi = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (len > best) { best = len; bi = i; }
    }
    const [x1, y1] = pts[bi], [x2, y2] = pts[bi + 1];
    if (Math.abs(y1 - y2) < 1) return { x: (x1 + x2) / 2, y: y1 - 8, anchor: 'middle' };
    return { x: x1 + 7, y: (y1 + y2) / 2, anchor: 'start' };
  }
  const HEAT_STOPS = [[0, [245, 183, 0]], [.5, [240, 140, 30]], [1, [229, 72, 77]]];
  function heatColor(h) {
    const k = clamp(h, 0, 1);
    const i = k <= .5 ? 0 : 1;
    const [a, ca] = HEAT_STOPS[i], [b, cb] = HEAT_STOPS[i + 1];
    const t = (k - a) / (b - a);
    return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * t)).join(',')})`;
  }
  App.heatColor = heatColor;

  const EXT_POS = {
    t: (hw, hh) => [0, -hh - 12, 'middle'], b: (hw, hh) => [0, hh + 14, 'middle'],
    l: (hw, hh) => [-hw - 8, 0, 'end'], r: (hw, hh) => [hw + 8, 0, 'start'],
    tl: (hw, hh) => [-hw * .5 - 4, -hh * .5 - 10, 'end'], tr: (hw, hh) => [hw * .5 + 4, -hh * .5 - 10, 'start'],
    bl: (hw, hh) => [-hw * .5 - 4, hh * .5 + 10, 'end'], br: (hw, hh) => [hw * .5 + 4, hh * .5 + 10, 'start'],
  };
  function nodeInner(n, uid) {
    const { w, h } = nodeSize(n), hw = w / 2, hh = h / 2;
    let s = '';
    if (n.type === 'task') {
      s += `<rect class="flow__halo" x="${-hw - 10}" y="${-hh - 10}" width="${w + 20}" height="${h + 20}" rx="18" filter="url(#${uid}-blur)"/>`;
      s += `<rect class="flow__focus" x="${-hw - 5}" y="${-hh - 5}" width="${w + 10}" height="${h + 10}" rx="14"/>`;
      s += `<rect class="flow__shape" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="10"/>`;
      s += `<rect class="flow__ring" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="10"/>`;
      s += `<text class="flow__label" y="${n.sub ? -8 : 0}">${esc(n.label)}</text>`;
      s += `<text class="flow__meta" y="${h < 50 ? 10 : 12}">${esc(n.sub || '')}</text>`;
      s += `<g class="flow__badge" transform="translate(${hw - 4} ${-hh + 1})" style="display:none"><rect class="flow__badge-bg" x="-14" y="-10" width="28" height="20" rx="10"/><text class="flow__badge-text"></text></g>`;
    } else if (EVENTS.has(n.type)) {
      s += `<circle class="flow__halo" r="26" filter="url(#${uid}-blur)"/>`;
      s += `<circle class="flow__focus" r="24"/>`;
      s += `<circle class="flow__shape" r="18"/>`;
      s += `<circle class="flow__ring" r="18"/>`;
      if (n.event === 'message') {
        s += n.type === 'end'
          ? '<rect class="flow__mark--fill" x="-8" y="-5.5" width="16" height="11" rx="1"/><path d="m-7.5 -5 7.5 5.5 7.5-5.5" fill="none" stroke="#fff" stroke-width="1.3"/>'
          : '<rect class="flow__mark--thin" x="-8" y="-5.5" width="16" height="11" rx="1"/><path class="flow__mark--thin" d="m-7.5 -5 7.5 5.5 7.5-5.5"/>';
      }
    } else {
      const dpath = `M0 ${-hh}L${hw} 0L0 ${hh}L${-hw} 0Z`;
      s += `<path class="flow__halo" d="${dpath}" filter="url(#${uid}-blur)"/>`;
      s += `<path class="flow__focus" d="M0 ${-hh - 6}L${hw + 6} 0L0 ${hh + 6}L${-hw - 6} 0Z"/>`;
      s += `<path class="flow__shape" d="${dpath}" stroke-linejoin="round"/>`;
      s += `<path class="flow__ring" d="${dpath}"/>`;
      if (n.type === 'xor') s += '<path class="flow__mark" d="M-7 -7L7 7M7 -7L-7 7"/>';
      else if (n.type === 'and') s += '<path class="flow__mark" d="M0 -10V10M-10 0H10"/>';
      else s += '<circle class="flow__mark" r="8" style="stroke-width:2.5"/>';
    }
    if (n.type !== 'task' && n.label) {
      const [x, y, anchor] = EXT_POS[n.labelPos || (EVENTS.has(n.type) ? 'b' : 't')](hw, hh);
      s += `<text class="flow__ext" x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}">${esc(n.label)}</text>`;
    }
    return s;
  }

  class FlowView {
    constructor(svg, model, opts) {
      if (!(svg instanceof SVGSVGElement)) throw new Error('App.Flow: an <svg> element is required');
      this.svg = svg;
      this.model = model;
      this.opts = Object.assign({ live: false, prewarm: 0, rate: 1.1, speed: 120, interactive: true, editable: false, snap: 10, maxTokens: 140, label: '', onNodeClick: null, onSelect: null, onChange: null, onBackgroundClick: null }, opts);
      this.uid = 'flow' + (++flowSeq);
      this.rnd = mulberry32(20261027 + flowSeq);
      this.nodeEls = new Map();
      this.edgeEls = new Map();
      this.geo = new Map();
      this.meta = new Map();
      this.tokens = [];
      this.joins = new Map();
      this.gid = 0;
      this.liveOn = false;
      this.simRuns = [];
      this.inView = true;
      this.raf = 0;
      this.lastTs = 0;
      this.spawnIn = 0;
      this.selected = null;
      this.lastPing = new Map();
      this.prewarming = false;
      this._tick = this._tick.bind(this);
      this.render();
      this._io = new IntersectionObserver(es => { this.inView = es[es.length - 1].isIntersecting; this._sync(); });
      this._io.observe(svg);
      this._onVis = () => this._sync();
      document.addEventListener('visibilitychange', this._onVis);
      this._onMotion = () => this._sync();
      reducedQuery.addEventListener('change', this._onMotion);
      this._bind();
      if (this.opts.meta) this.setMeta(this.opts.meta);
      if (this.opts.prewarm > 0) this._prewarm(this.opts.prewarm);
      if (this.opts.live) this.play(); else this._sync();
    }

    /* 查詢 */
    node(id) { return this.model.nodes.find(n => n.id === id) || null; }
    edge(id) { return this.model.edges.find(e => e.id === id) || null; }
    outEdges(id) { return this.model.edges.filter(e => e.from === id); }
    inEdges(id) { return this.model.edges.filter(e => e.to === id); }
    edgesOf(id) { return this.model.edges.filter(e => e.from === id || e.to === id); }
    nodeEl(id) { return this.nodeEls.get(id) || null; }
    edgeEl(id) { return this.edgeEls.get(id) || null; }
    get playing() { return this.liveOn; }
    laneAt(y) {
      let y0 = 0;
      for (const l of this.model.lanes) { if (y < y0 + l.h) return l; y0 += l.h; }
      return this.model.lanes[this.model.lanes.length - 1];
    }
    laneTop(id) {
      let y0 = 0;
      for (const l of this.model.lanes) { if (l.id === id) return y0; y0 += l.h; }
      throw new Error('Flow.laneTop: unknown lane ' + id);
    }
    clientToSvg(cx, cy) {
      const p = this.svg.createSVGPoint();
      p.x = cx; p.y = cy;
      const r = p.matrixTransform(this.svg.getScreenCTM().inverse());
      return { x: r.x, y: r.y };
    }

    /* 繪製 */
    render() {
      const m = this.model, svg = this.svg, uid = this.uid;
      const W = m.width, H = m.lanes.reduce((s, l) => s + l.h, 0);
      const PH = m.poolHead ?? 28, LH = m.laneHead ?? 42;
      this.W = W; this.H = H; this.HX = PH + LH;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.classList.add('flow');
      svg.classList.toggle('flow--editable', !!this.opts.editable);
      svg.setAttribute('role', 'group');
      svg.setAttribute('aria-label', this.opts.label || `${m.name || '流程'} ${m.version || ''} 流程圖`);
      let lanes = `<rect class="flow__pool" x=".75" y=".75" width="${W - 1.5}" height="${H - 1.5}"/><rect class="flow__pool-head" x="0" y="0" width="${PH}" height="${H}"/>`;
      lanes += `<text class="flow__pool-label" transform="translate(${PH / 2} ${H / 2}) rotate(-90)">${esc(m.poolLabel || m.name || '')}</text>`;
      let y = 0;
      m.lanes.forEach((l, i) => {
        lanes += `<rect class="flow__lane-bg${i % 2 ? ' flow__lane-bg--alt' : ''}" x="${this.HX}" y="${y}" width="${W - this.HX}" height="${l.h}"/>`;
        lanes += `<rect class="flow__lane-head" x="${PH}" y="${y}" width="${LH}" height="${l.h}"/>`;
        lanes += `<text class="flow__lane-label" transform="translate(${PH + LH / 2 - (l.sub ? 7 : 0)} ${y + l.h / 2}) rotate(-90)">${esc(l.label)}</text>`;
        if (l.sub) lanes += `<text class="flow__lane-sub" transform="translate(${PH + LH / 2 + 10} ${y + l.h / 2}) rotate(-90)">${esc(l.sub)}</text>`;
        if (i < m.lanes.length - 1) lanes += `<line class="flow__lane-line" x1="${PH}" y1="${y + l.h}" x2="${W}" y2="${y + l.h}"/>`;
        y += l.h;
      });
      lanes += `<line class="flow__lane-sep" x1="${this.HX}" y1="0" x2="${this.HX}" y2="${H}"/>`;
      const marker = (id, cls) => `<marker id="${uid}-${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path class="${cls}" d="M0 1L10 5L0 9Z"/></marker>`;
      svg.innerHTML = `<defs>${marker('arr', 'flow__arrow')}${marker('arr-hl', 'flow__arrow flow__arrow--hl')}${marker('arr-ret', 'flow__arrow flow__arrow--ret')}<filter id="${uid}-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter></defs><g class="flow__lanes">${lanes}</g><g class="flow__edges"></g><g class="flow__tokens"></g><g class="flow__nodes"></g>`;
      this.gEdges = svg.querySelector('.flow__edges');
      this.gTokens = svg.querySelector('.flow__tokens');
      this.gNodes = svg.querySelector('.flow__nodes');
      this.nodeEls.clear();
      this.edgeEls.clear();
      m.nodes.forEach(n => this._drawNode(n));
      m.edges.forEach(e => this._drawEdge(e));
      this.meta.forEach((_, id) => this._applyMeta(id));
      this.tokens.forEach(t => { t.el = this._tokenEl(!!t.sim); if (t.state !== 'edge') t.el.classList.add('is-hidden'); });
      this._renderTokens();
      if (this.selected) this.select(this.selected);
    }
    _drawNode(n) {
      if (!NODE_TYPES.has(n.type)) throw new Error('Flow: unknown node type ' + n.type);
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', `flow__node flow__node--${n.type}`);
      g.dataset.id = n.id;
      g.setAttribute('transform', `translate(${n.x} ${n.y})`);
      if (this.opts.interactive || this.opts.editable) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); }
      g.setAttribute('aria-label', this._aria(n));
      g.innerHTML = nodeInner(n, this.uid);
      // SVG 元素沒有 click()；補上讓節點跟 HTML 按鈕一樣能被程式或自動化測試觸發
      g.click = () => g.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const prev = this.nodeEls.get(n.id);
      if (prev) {
        ['is-selected', 'is-visited', 'is-error', 'is-spot'].forEach(c => { if (prev.classList.contains(c)) g.classList.add(c); });
        prev.replaceWith(g);
      } else this.gNodes.appendChild(g);
      this.nodeEls.set(n.id, g);
      if (this.meta.has(n.id)) this._applyMeta(n.id);
    }
    _aria(n) {
      const m = this.meta.get(n.id);
      const kind = { start: '開始事件', end: '結束事件', task: '任務', xor: '互斥閘道', and: '平行閘道', or: '包容閘道' }[n.type];
      return `${n.label}（${kind}）${m && m.count != null ? `：積壓 ${m.count} 件${m.dwell != null ? `，平均停留 ${App.fmt.dur(m.dwell)}` : ''}` : ''}`;
    }
    _drawEdge(e) {
      const a = this.node(e.from), b = this.node(e.to);
      if (!a || !b) throw new Error(`Flow: edge ${e.id} references a missing node`);
      const geo = buildGeo(routePoints(a, b, e));
      this.geo.set(e.id, geo);
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', `flow__edge${e.kind === 'return' ? ' flow__edge--return' : ''}`);
      g.dataset.id = e.id;
      const lp = e.label ? labelPos(geo.pts, e) : null;
      g.innerHTML = `<path class="flow__edge-hit" d="${geo.d}"/><path class="flow__edge-line" d="${geo.d}"/><path class="flow__edge-dash" d="${geo.d}"/>${lp ? `<text class="flow__edge-label" x="${f1(lp.x)}" y="${f1(lp.y)}" text-anchor="${lp.anchor}" dominant-baseline="central">${esc(e.label)}</text>` : ''}`;
      const prev = this.edgeEls.get(e.id);
      if (prev) {
        ['is-path', 'is-lit', 'is-spot', 'is-selected'].forEach(c => { if (prev.classList.contains(c)) g.classList.add(c); });
        prev.replaceWith(g);
      } else this.gEdges.appendChild(g);
      this.edgeEls.set(e.id, g);
      this._marker(e.id);
    }
    _marker(id) {
      const g = this.edgeEls.get(id), e = this.edge(id);
      if (!g || !e) return;
      const hl = ['is-path', 'is-lit', 'is-spot', 'is-selected'].some(c => g.classList.contains(c));
      g.querySelector('.flow__edge-line').setAttribute('marker-end', `url(#${this.uid}-${hl ? 'arr-hl' : e.kind === 'return' ? 'arr-ret' : 'arr'})`);
    }
    _edgeClass(id, cls, on) {
      const g = this.edgeEls.get(id);
      if (!g) return;
      g.classList.toggle(cls, on);
      this._marker(id);
    }

    /* 節點統計：徽章、停留時間、熱度 */
    setMeta(map) {
      Object.entries(map).forEach(([id, m]) => { this.meta.set(id, m); this._applyMeta(id); });
    }
    _applyMeta(id) {
      const g = this.nodeEls.get(id), m = this.meta.get(id), n = this.node(id);
      if (!g || !m || !n) return;
      const heat = clamp(m.heat ?? 0, 0, 1);
      g.style.setProperty('--heat', heat.toFixed(3));
      g.style.setProperty('--pulse', (2.9 - heat * 1.7).toFixed(2) + 's');
      g.classList.toggle('is-hot', heat > .04);
      const color = heatColor(heat);
      g.querySelector('.flow__halo').style.fill = color;
      if (n.type === 'task') {
        const badge = g.querySelector('.flow__badge');
        if (m.count != null) {
          const txt = String(m.count), bw = 14 + txt.length * 7.2;
          badge.style.display = '';
          const r = badge.querySelector('rect');
          r.setAttribute('x', f1(-bw / 2)); r.setAttribute('width', f1(bw));
          badge.querySelector('text').textContent = txt;
          r.style.fill = heat > .08 ? color : '';
          badge.classList.toggle('is-light', heat > .08 && heat < .72);
        } else badge.style.display = 'none';
        const text = m.text ?? (m.count === 0 ? '無積壓' : m.dwell != null ? `均 ${App.fmt.dur(m.dwell)}` : (n.sub || ''));
        g.querySelector('.flow__meta').textContent = text;
        g.querySelector('.flow__label').setAttribute('y', text ? (nodeSize(n).h < 50 ? -7 : -8) : 0);
      }
      g.setAttribute('aria-label', this._aria(n));
    }

    /* token 流 */
    play() { this.liveOn = true; this._sync(); }
    pause() { this.liveOn = false; this._sync(); }
    _active() { return (this.liveOn || this.simRuns.length > 0) && this.inView && !document.hidden; }
    _sync() {
      const active = this._active();
      this.svg.classList.toggle('is-paused', !active);
      const run = active && !reducedMotion();
      // 從暫停恢復時 lastTs 歸零，第一幀 dt = 0，token 不會因為暫停期間而瞬移
      if (run && !this.raf) { this.lastTs = 0; this.raf = requestAnimationFrame(this._tick); }
      if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    }
    _tick(ts) {
      const dt = this.lastTs ? Math.min(.05, (ts - this.lastTs) / 1000) : 0;
      this.lastTs = ts;
      this._step(dt);
      this._renderTokens();
      if (this._active() && !reducedMotion()) this.raf = requestAnimationFrame(this._tick);
      else { this.raf = 0; this._sync(); }
    }
    _prewarm(seconds) {
      // 先在背景跑一段，讓第一幀（含截圖與 reduced-motion 的靜態畫面）就有滿載的公文流
      this.prewarming = true;
      for (let t = 0; t < seconds; t += 1 / 20) this._step(1 / 20, true);
      this.prewarming = false;
      this._renderTokens();
    }
    _step(dt, spawn = this.liveOn) {
      if (spawn) {
        this.spawnIn -= dt;
        while (this.spawnIn <= 0) {
          this.spawnIn += (1 / this.opts.rate) * (.55 + this.rnd() * .9);
          this._spawnLive();
        }
      }
      for (const tk of this.tokens.slice()) {
        if (tk.state === 'node') {
          tk.wait -= dt;
          if (tk.wait <= 0) this._depart(tk, this.node(tk.at));
        } else if (tk.state === 'edge') {
          const geo = this.geo.get(tk.edge);
          if (!geo) { tk.state = 'dead'; continue; }
          tk.s += tk.speed * dt;
          if (tk.s >= geo.len) this._arrive(tk);
        }
      }
      if (this.tokens.some(t => t.state === 'dead')) {
        this.tokens = this.tokens.filter(t => {
          if (t.state !== 'dead') return true;
          t.el.remove();
          return false;
        });
      }
      for (const run of this.simRuns.slice()) {
        if (!this.tokens.some(t => t.sim === run)) {
          this.simRuns.splice(this.simRuns.indexOf(run), 1);
          run.resolve();
        }
      }
    }
    _spawnLive() {
      if (this.tokens.length >= this.opts.maxTokens) return;
      this.model.nodes.filter(n => n.type === 'start').forEach(s => {
        const outs = this.outEdges(s.id);
        if (!outs.length) return;
        const t = this._newToken(null);
        this._enter(t, this._weighted(outs, t));
      });
    }
    _newToken(sim) {
      const t = { el: this._tokenEl(!!sim), state: 'edge', s: 0, edge: null, at: null, wait: 0, group: [], sim, speed: sim ? sim.speed : this.opts.speed * (.8 + this.rnd() * .4) };
      this.tokens.push(t);
      return t;
    }
    _tokenEl(sim) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'flow__token' + (sim ? ' flow__token--sim' : ''));
      g.innerHTML = `<circle class="flow__token-glow" r="${sim ? 11 : 8.5}"/><circle class="flow__token-core" r="${sim ? 6 : 4.6}"/>`;
      this.gTokens.appendChild(g);
      return g;
    }
    _enter(tk, e) {
      tk.edge = e.id; tk.s = 0; tk.state = 'edge'; tk.at = null;
      tk.el.classList.remove('is-hidden');
      const p = pointAt(this.geo.get(e.id), 0);
      tk.el.setAttribute('transform', `translate(${f1(p[0])} ${f1(p[1])})`);
      if (tk.sim) tk.sim.edge(e);
    }
    _arrive(tk) {
      const e = this.edge(tk.edge);
      if (!e) { tk.state = 'dead'; return; }
      const n = this.node(e.to);
      this._ping(n);
      if (tk.sim) {
        tk.sim.visit(n, e);
        if (tk.sim.aborted) { tk.state = 'dead'; return; }
      }
      if (n.type === 'end') { tk.state = 'dead'; return; }
      if ((n.type === 'and' || n.type === 'or') && this.inEdges(n.id).length > 1 && tk.group.length) {
        const g = tk.group[tk.group.length - 1], key = n.id + '|' + g.id;
        const c = (this.joins.get(key) || 0) + 1;
        if (c < g.n) { this.joins.set(key, c); tk.state = 'dead'; return; }
        this.joins.delete(key);
        tk.group = tk.group.slice(0, -1);
      }
      if (n.type === 'task') {
        tk.state = 'node'; tk.at = n.id;
        tk.wait = tk.sim ? tk.sim.dwell : this._dwell(n);
        tk.el.classList.add('is-hidden');
        return;
      }
      this._depart(tk, n);
    }
    _dwell(n) {
      const m = this.meta.get(n.id);
      return .2 + (m ? clamp(m.heat ?? 0, 0, 1) : .15) * 1.7 + this.rnd() * .5;
    }
    _depart(tk, n) {
      const outs = this.outEdges(n.id);
      if (!outs.length) { tk.state = 'dead'; if (tk.sim) tk.sim.deadEnd(n); return; }
      let chosen = null;
      if (tk.sim && tk.sim.pick) {
        const r = tk.sim.pick(n, outs);
        if (r != null) chosen = [].concat(r).filter(Boolean);
      }
      if (!chosen || !chosen.length) {
        if (GATEWAYS.has(n.type) && n.type !== 'xor' && outs.length > 1) chosen = n.type === 'and' && tk.sim ? outs : this._subset(outs);
        else chosen = [outs.length > 1 ? this._weighted(outs, tk) : outs[0]];
      }
      if (chosen.length > 1) {
        const group = tk.group.concat({ id: ++this.gid, n: chosen.length });
        chosen.forEach((e, i) => {
          const t = i === 0 ? tk : this._newToken(tk.sim);
          t.group = group;
          this._enter(t, e);
        });
      } else this._enter(tk, chosen[0]);
    }
    // 平行會辦：依各分支實際出現機率抽子集合（至少一支），會合閘道等齊同一組才放行
    _subset(outs) {
      const picked = outs.filter(e => this.rnd() < (e.weight ?? 1));
      if (picked.length) return picked;
      return [outs.reduce((a, b) => ((b.weight ?? 1) > (a.weight ?? 1) ? b : a))];
    }
    _weighted(outs, tk) {
      let pool = outs;
      if (tk && tk.sim) {
        // 模擬時避免在退回迴圈裡打轉：走過兩次的順序流先排除
        const fresh = outs.filter(e => (tk.sim.edgeCount.get(e.id) || 0) < 2);
        if (fresh.length) pool = fresh;
      }
      const total = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
      let r = this.rnd() * total;
      for (const e of pool) { if ((r -= (e.weight ?? 1)) <= 0) return e; }
      return pool[pool.length - 1];
    }
    _ping(n) {
      if (this.prewarming || reducedMotion()) return;
      const now = performance.now();
      if (now - (this.lastPing.get(n.id) || 0) < 260) return;
      this.lastPing.set(n.id, now);
      const ring = this.nodeEls.get(n.id)?.querySelector('.flow__ring');
      if (ring) ring.animate([{ opacity: .85, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.22)' }], { duration: 720, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    _renderTokens() {
      for (const t of this.tokens) {
        if (t.state !== 'edge') continue;
        const p = pointAt(this.geo.get(t.edge), t.s);
        t.el.setAttribute('transform', `translate(${f1(p[0])} ${f1(p[1])})`);
      }
    }

    /* 單次模擬（流程設計器「模擬執行」） */
    simulate(o = {}) {
      const start = o.start ? this.node(o.start) : this.model.nodes.find(n => n.type === 'start');
      if (!start) return Promise.resolve({ ok: false, reason: 'no-start', nodes: [], edges: [], order: [], deadEnds: [] });
      const run = {
        speed: o.speed || 240, dwell: o.dwell ?? .45, pick: o.pick || null, edgeCount: new Map(),
        order: [start.id], edges: [], deadEnds: [], steps: 0, aborted: false,
      };
      run.visit = (n, e) => {
        run.order.push(n.id);
        this.nodeEls.get(n.id)?.classList.add('is-visited');
        if (o.onVisit) o.onVisit(n, e);
        if (++run.steps > 300) run.aborted = true;
      };
      run.edge = e => {
        run.edges.push(e.id);
        run.edgeCount.set(e.id, (run.edgeCount.get(e.id) || 0) + 1);
        this._edgeClass(e.id, 'is-path', true);
        if (o.onEdge) o.onEdge(e);
      };
      run.deadEnd = n => {
        run.deadEnds.push(n.id);
        this.nodeEls.get(n.id)?.classList.add('is-error');
      };
      this.nodeEls.get(start.id)?.classList.add('is-visited');
      if (o.onVisit) o.onVisit(start, null);
      return new Promise(resolve => {
        run.resolve = () => resolve({
          ok: !run.aborted && run.deadEnds.length === 0,
          reason: run.aborted ? 'loop' : run.deadEnds.length ? 'dead-end' : '',
          nodes: [...new Set(run.order)], edges: [...new Set(run.edges)], order: run.order, deadEnds: run.deadEnds,
        });
        this.simRuns.push(run);
        const t = this._newToken(run);
        this._depart(t, start);
        if (reducedMotion()) {
          for (let i = 0; i < 40000 && this.simRuns.includes(run); i++) this._step(.1, false);
          this._renderTokens();
        } else this._sync();
      });
    }
    markPath({ nodes = [], edges = [] } = {}) {
      nodes.forEach(id => this.nodeEls.get(id)?.classList.add('is-visited'));
      edges.forEach(id => this._edgeClass(id, 'is-path', true));
    }
    clearPath() {
      this.nodeEls.forEach(g => g.classList.remove('is-visited', 'is-error'));
      this.edgeEls.forEach((g, id) => this._edgeClass(id, 'is-path', false));
    }
    spotlight(id) {
      this.svg.classList.toggle('has-spotlight', !!id);
      this.nodeEls.forEach(g => g.classList.remove('is-spot'));
      this.edgeEls.forEach((g, eid) => this._edgeClass(eid, 'is-spot', false));
      if (!id) return;
      this.nodeEls.get(id)?.classList.add('is-spot');
      this.edgesOf(id).forEach(e => {
        this._edgeClass(e.id, 'is-spot', true);
        this.nodeEls.get(e.from === id ? e.to : e.from)?.classList.add('is-spot');
      });
    }

    /* 編輯 API（程式呼叫不觸發 onChange） */
    select(sel) {
      this.nodeEls.forEach(g => g.classList.remove('is-selected'));
      this.edgeEls.forEach((g, id) => this._edgeClass(id, 'is-selected', false));
      this.selected = sel && (sel.type === 'node' ? this.node(sel.id) : this.edge(sel.id)) ? { type: sel.type, id: sel.id } : null;
      if (!this.selected) return;
      if (sel.type === 'node') this.nodeEls.get(sel.id).classList.add('is-selected');
      else this._edgeClass(sel.id, 'is-selected', true);
    }
    _newId(prefix) {
      let i = this.model.nodes.length + this.model.edges.length + 1;
      while (this.node(prefix + i) || this.edge(prefix + i)) i++;
      return prefix + i;
    }
    addNode(n) {
      const node = Object.assign({ id: this._newId('n'), type: 'task', label: '新任務', x: this.HX + 80, y: 60 }, n);
      if (!NODE_TYPES.has(node.type)) throw new Error('Flow.addNode: unknown type ' + node.type);
      if (this.node(node.id)) throw new Error('Flow.addNode: duplicate id ' + node.id);
      node.lane = this.laneAt(node.y).id;
      this.model.nodes.push(node);
      this._drawNode(node);
      return node;
    }
    updateNode(id, patch) {
      const n = this.node(id);
      if (!n) throw new Error('Flow.updateNode: unknown node ' + id);
      Object.assign(n, patch);
      if (patch.y != null) n.lane = this.laneAt(n.y).id;
      this._drawNode(n);
      this.edgesOf(id).forEach(e => this._drawEdge(e));
      return n;
    }
    moveNode(id, x, y) {
      const n = this.node(id);
      if (!n) throw new Error('Flow.moveNode: unknown node ' + id);
      const { w, h } = nodeSize(n);
      n.x = Math.round(clamp(x, this.HX + w / 2 + 4, this.W - w / 2 - 4));
      n.y = Math.round(clamp(y, h / 2 + 4, this.H - h / 2 - 4));
      n.lane = this.laneAt(n.y).id;
      this.nodeEls.get(id).setAttribute('transform', `translate(${n.x} ${n.y})`);
      this.edgesOf(id).forEach(e => this._drawEdge(e));
      return n;
    }
    removeNode(id) {
      if (!this.node(id)) throw new Error('Flow.removeNode: unknown node ' + id);
      this.edgesOf(id).forEach(e => this.removeEdge(e.id));
      this.model.nodes = this.model.nodes.filter(n => n.id !== id);
      this.nodeEls.get(id).remove();
      this.nodeEls.delete(id);
      this.meta.delete(id);
      this.tokens.forEach(t => { if (t.at === id) t.state = 'dead'; });
      if (this.selected && this.selected.id === id) this.selected = null;
    }
    addEdge(e) {
      const edge = Object.assign({ id: this._newId('e') }, e);
      if (!this.node(edge.from) || !this.node(edge.to)) throw new Error('Flow.addEdge: from/to must be existing node ids');
      if (edge.from === edge.to) throw new Error('Flow.addEdge: self loop is not allowed');
      if (this.edge(edge.id)) throw new Error('Flow.addEdge: duplicate id ' + edge.id);
      this.model.edges.push(edge);
      this._drawEdge(edge);
      return edge;
    }
    updateEdge(id, patch) {
      const e = this.edge(id);
      if (!e) throw new Error('Flow.updateEdge: unknown edge ' + id);
      Object.assign(e, patch);
      this._drawEdge(e);
      return e;
    }
    removeEdge(id) {
      if (!this.edge(id)) throw new Error('Flow.removeEdge: unknown edge ' + id);
      this.model.edges = this.model.edges.filter(e => e.id !== id);
      this.edgeEls.get(id).remove();
      this.edgeEls.delete(id);
      this.geo.delete(id);
      this.tokens.forEach(t => { if (t.edge === id && t.state === 'edge') t.state = 'dead'; });
      if (this.selected && this.selected.id === id) this.selected = null;
    }
    toJSON() {
      const { id, name, version, effective, width, poolHead, laneHead, poolLabel, lanes, nodes, edges } = this.model;
      return JSON.parse(JSON.stringify({ id, name, version, effective, width, poolHead, laneHead, poolLabel, lanes, nodes, edges }));
    }
    load(model) {
      this.tokens.forEach(t => t.el.remove());
      this.tokens = [];
      this.joins.clear();
      this.meta.clear();
      this.selected = null;
      this.model = model;
      this.render();
    }
    destroy() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this._io.disconnect();
      document.removeEventListener('visibilitychange', this._onVis);
      reducedQuery.removeEventListener('change', this._onMotion);
      this._unbind();
      this.svg.innerHTML = '';
    }

    /* 互動 */
    _bind() {
      const svg = this.svg, o = this.opts;
      const hl = (el, on) => {
        const id = el && el.dataset.id;
        if (!id) return;
        this.edgesOf(id).forEach(e => this._edgeClass(e.id, 'is-lit', on));
      };
      const activate = (el, ev) => {
        const n = this.node(el.dataset.id);
        if (o.editable) { this.select({ type: 'node', id: n.id }); if (o.onSelect) o.onSelect(this.selected); }
        if (o.onNodeClick) o.onNodeClick(n, el, ev);
      };
      const h = {
        click: e => {
          if (this.suppressClick) { this.suppressClick = false; return; }
          const nodeEl = e.target.closest('.flow__node');
          if (nodeEl) { activate(nodeEl, e); return; }
          const edgeEl = e.target.closest('.flow__edge');
          if (edgeEl && o.editable) { this.select({ type: 'edge', id: edgeEl.dataset.id }); if (o.onSelect) o.onSelect(this.selected); return; }
          if (o.editable && this.selected) { this.select(null); if (o.onSelect) o.onSelect(null); }
          if (o.onBackgroundClick) o.onBackgroundClick(e);
        },
        keydown: e => {
          const nodeEl = e.target.closest && e.target.closest('.flow__node');
          if (!nodeEl) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(nodeEl, e); return; }
          const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (dir && o.editable) {
            e.preventDefault();
            const n = this.node(nodeEl.dataset.id), step = o.snap * (e.shiftKey ? 4 : 1);
            this.moveNode(n.id, n.x + dir[0] * step, n.y + dir[1] * step);
            if (o.onChange) o.onChange('move', { id: n.id, x: n.x, y: n.y });
          }
        },
        pointerover: e => hl(e.target.closest('.flow__node'), true),
        pointerout: e => hl(e.target.closest('.flow__node'), false),
        focusin: e => hl(e.target.closest('.flow__node'), true),
        focusout: e => hl(e.target.closest('.flow__node'), false),
        pointerdown: e => {
          if (!o.editable || e.button !== 0) return;
          const nodeEl = e.target.closest('.flow__node');
          if (!nodeEl) return;
          const n = this.node(nodeEl.dataset.id), p = this.clientToSvg(e.clientX, e.clientY);
          this.drag = { id: n.id, el: nodeEl, dx: n.x - p.x, dy: n.y - p.y, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
        },
        pointermove: e => {
          const d = this.drag;
          if (!d || e.pointerId !== d.pid) return;
          if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
          // 真的開始拖曳才擷取指標；按下就擷取會讓 click 的 target 變成 svg，單純點選節點會失效
          if (!d.moved) svg.setPointerCapture(e.pointerId);
          d.moved = true;
          d.el.classList.add('is-dragging');
          const p = this.clientToSvg(e.clientX, e.clientY), sn = o.snap || 1;
          this.moveNode(d.id, Math.round((p.x + d.dx) / sn) * sn, Math.round((p.y + d.dy) / sn) * sn);
        },
        pointerup: e => {
          const d = this.drag;
          if (!d || e.pointerId !== d.pid) return;
          this.drag = null;
          d.el.classList.remove('is-dragging');
          if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
          if (d.moved) {
            this.suppressClick = true;
            // 拖曳結束後不一定會有 click（指標移出元素時），下一輪清掉旗標
            setTimeout(() => { this.suppressClick = false; }, 0);
            const n = this.node(d.id);
            if (o.onChange) o.onChange('move', { id: n.id, x: n.x, y: n.y });
          }
        },
      };
      h.pointercancel = h.pointerup;
      Object.entries(h).forEach(([k, fn]) => svg.addEventListener(k, fn));
      this._unbind = () => Object.entries(h).forEach(([k, fn]) => svg.removeEventListener(k, fn));
    }
  }

  App.Flow = (svg, model, opts = {}) => new FlowView(svg, model, opts);
  App.Flow.route = (a, b, e = {}) => routePoints(a, b, e);
  App.Flow.pathD = (pts, r = 9) => buildGeo(pts, r).d;
  App.Flow.size = nodeSize;

  /* ── 啟動 ───────────────────────────────────────────────── */
  document.documentElement.classList.add('reveal-ready');
  initShell();
  $$('[data-tabs]').forEach(App.tabs);
  App.reveal();
  App.watchAnim();
})();

/*
 * 公文欄位（App.DATA.docs 的每一筆）
 *   id          收文號（10 碼，115 + 流水號）
 *   slug        精選公文代號或 null
 *   received    收文時間 ms · due 限辦期限 ms（收文後依速別 1/3/6 個工作日的 17:30）
 *   kind        函 / 簽 · from 來文機關（簽為「本府○○局」）· fromKey 來源類型 · ref 來文字號（簽為 null）
 *   subject     主旨 · unit 承辦單位代碼 · owner 承辦人 id（未分文為 null）
 *   speed       urgent / fast / normal · secret none / restricted / confidential · level 決行層級 1/2/3
 *   send        決行後是否對外發文（false = 存查）· attachments 附件數
 *   cosign      [{branch:'legal'|'budget'|'agency', unit, by, state:'pending'|'done'|'cancelled', at, note}]
 *   trail       已完成的軌跡 [{key, lane, node, at, who, action, note, branch?, unit?, ret?}]（依時間排序）
 *   stage       目前關卡 register|assign|draft|cosign|review|approve|dispatch|archive|closed · stageAt 進入該關卡時間
 *   doneAt      決行完成時間 · dispatchedAt 發文時間 · closedAt 歸檔結案時間 · outNo 發文字號
 *   draft       精選公文的函稿內容（其他公文用 App.draftOf(doc) 產生）
 */
