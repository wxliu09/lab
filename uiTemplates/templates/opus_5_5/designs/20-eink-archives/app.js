/*
 * 澄港市 市政檔案 應用調閱申請 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 會比 defer 的 app.js 先被解析；DOMContentLoaded 觸發時 window.App 已就緒。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 時間（「現在」固定為 2026-10-27（二）09:14，UTC+8；與使用者時區無關）
 *   App.TODAY                       '2026-10-27'
 *   App.now() → ms                  自 09:14 起隨真實時間走動
 *   App.days(d) / App.diffDays(a,b) / App.addDays(d,n)
 *   App.fmt.date|md|wd|long|roc|num|time(ms)|rel(d)
 *   App.isOpenDay(d)（閱覽室週二至週六開放）· App.nextOpenDay(d, minAhead)
 *   App.SLOTS {am, pm, day} → {label, time}
 *
 * 列舉
 *   App.PEOPLE（館員 id → {name, unit, title, role}）· App.ME = 'lin'（林予安，應用服務課承辦）
 *   App.PURPOSES {research, rights, press, other} → {label, icon}
 *   App.RESTRICTIONS {none, privacy, security, trade} → {label, short, icon, basis}
 *   App.DECISIONS {pending, open, redact, deny} → {label}
 *   App.STAGES  六階段 [{key:'apply'|'review'|'retrieve'|'redact'|'approve'|'access', name, short}]
 *   App.STATUSES {pending, supplement, retrieving, redacting, approving, scheduled, closed, rejected} → {label, stage}
 *   App.MODES {read, copy, both} · App.ITEM_TYPES {photo, map, manuscript, letter, ledger, drawing}
 *
 * 檔案目錄（全宗 → 系列 → 案卷 → 件）
 *   App.catalog.fonds         樹狀根節點陣列；每個節點 {id, level:'fonds'|'series'|'file'|'item', code, title, children, parent}
 *     案卷另有 span, location（庫房架位）；件另有 date, type, pages, restriction, scene, seed, accession（新增典藏日）
 *   App.catalog.items         所有「件」的平面陣列 · App.catalog.get(id) · App.catalog.path(id) → [全宗, 系列, 案卷, 件]
 *   App.catalog.search(q)     依檔號/題名/全宗名稱比對「件」 · App.catalog.countOf(node) → 件數
 *   App.catalog.accessions()  近期新增典藏（依日期新到舊）
 *   App.itemUrl(id) 'catalog.html?item=…'
 *
 * 申請案件（記憶體內資料；改動後一律呼叫 App.commit 或用 App.actions）
 *   App.REQUESTS              44 件；欄位見檔尾「案件欄位」
 *   App.getRequest(id) · App.requestUrl(id) 'request.html?id=…' · App.FEATURED（request.html 無 id 時的預設案件）
 *   App.deadline(r) → {period, elapsed, remaining, due, state:'ok'|'soon'|'over'|'paused', extended} 或 null
 *   App.stageIndex(r) · App.flowState(r) → 六階段 [{key, name, state:'done'|'current'|'todo'|'skip'|'stop', date, by}]
 *   App.timelineOf(r) → [{key, date, title, by, text, current, future, tone}]
 *   App.decidedAt(r) · App.counts() → {pending, supplement, review, retrieving, redacting, approving, scheduled, closed,
 *     rejected, active, today, todayIn, cart, octReceived, overdue, dueSoon, retrieveTotal, retrieveDone, redactTotal, redactDone, avgDecision}
 *   App.monthly() → 近 12 個月 [{month:'2025-11', label, total, research, rights, press, other, partial}]
 *   App.restrictionStats() → {none:{open,redact,deny,pending,total}, privacy:…, security:…, trade:…}
 *
 * 閱覽室
 *   App.SEATS [{id, type:'desk'|'map'|'film'|'digital', x, y, off}] · App.SEAT_TYPES · App.ROOM {cols, rows, blocks, labels}
 *   App.occupancy(date, slot) → {seatId: {req, state:'booked'|'in'|'done'}}
 *   App.freeSeat(date, slot, type) · App.seatMap(el, {date, slot, selectable, selected, onSelect}) → {update(o), select(id), state()}
 *
 * 申請清單（catalog 的購物車；全站共用一份）
 *   App.cart.ids() / list() / has(id) / add(id) / remove(id) / clear()   皆會 commit('cart')
 *
 * 資料異動
 *   App.actions.decide(id, {itemId: 'open'|'redact'|'deny'}) · resume(id) · retrieved(id) · redacted(id) · approve(id)
 *     · checkin(id) · checkout(id) · reject(id, note) · assignSeat(id, {visit, slot, seat}) · create(data)
 *     除 create 外皆回傳 undo()；create 回傳 {req, undo}。全部會重算衍生欄位並 commit。
 *   App.commit(reason)   重算 [data-count] 並發出 'app:change'
 *   App.onChange(fn)     fn({reason, counts})；頁面用它重繪自己的區塊
 *   [data-count="key"]   自動同步 App.counts() 的值（加 data-hide-zero 則 0 時隱藏）
 *
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(s) · App.icon(name, {size, label, cls}) · App.dotNum(value, {px, label}) · App.setDotNum(host, value, {px})
 *   App.dots({total, value, partial, cols, label, cls}) · App.dueBar(r) · App.statusTag(status) · App.restrictTag(r, {short})
 *   App.purposeTag(p) · App.decisionTag(d) · App.flowMini(r) · App.flowSteps(r, {vertical}) · App.timeline(r)
 *   App.person(id) · App.avatar(name) · App.barcode(text, {height, unit}) · App.emptyState({title, text, icon})
 *   App.ICONS（可用圖示名稱）
 *
 * 電子紙引擎（招牌）
 *   App.eink.flash()                     全刷新：反相 → 全黑 → 全白 → 內容（頁首「全刷新」按鈕）
 *   App.eink.refresh(el, mutate, {ghost, invert})  局部刷新：mutate 改內容後，舊內容殘影淡出＋區塊反相一瞬
 *   App.eink.turn(el, mutate, {dir:1|-1}) 翻頁：一道反相掃描帶橫越區塊＋殘影
 *   App.eink.setText(el, text)           文字局部刷新（數字、時鐘）
 *   App.eink.blink(el)                   只做反相一瞬
 *   App.eink.navigate(href)              離頁刷新後換頁（站內 .html 連結已自動套用）
 *   ※ refresh/turn 期間 el 內會暫時多一個 aria-hidden、inert 的 .eink-ghost（舊內容複本，約 1 秒後移除）；
 *     不要用 textContent 讀回資料，在刷新區塊內 querySelectorAll 時請用 ':scope >' 或排除 .eink-ghost。
 *     目標請用區塊元素（div/section/ul），不要用 tbody/tr；el 若無背景會暫時補上紙色。
 *
 * 抖色影像（canvas）
 *   <canvas data-scene="hall" data-seed="1" data-method="fs" data-levels="2" data-px="2" role="img" aria-label="…">
 *   放在有尺寸的容器（.plate__screen / .thumb__screen / .scan）裡；進入視窗時自動以「條帶刷新」繪出。
 *   App.dither.render(canvas, {scene, seed, method, levels, px, animate, ghost}) → Promise
 *   App.dither.info(canvas) → {scene, seed, method, levels, px, w, h} · App.dither.refreshAll()
 *   App.dither.SCENES：hall 市府舊廈、harbor 碼頭、street 老街騎樓、saltfield 鹽田、bridge 鋼桁架橋、
 *                     map 舊街圖、manuscript 稿紙手稿、letter 公文、ledger 簿冊、blueprint 工程圖
 *   App.dither.METHODS {bayer, fs, atkinson} · App.dither.sceneOf(item) → {scene, seed}
 *
 * 互動元件
 *   App.toast(title, {desc, tone:'info'|'ok'|'warn', action:{label, onClick}, duration})
 *     toast 容器會自動移進目前開啟的 dialog（top layer），關閉後移回 body
 *   App.modal({title, code, body(html|Node), size:'sm'|'lg', actions:[{label, variant, icon, onClick(close)}], onClose})
 *     → {el, body, close}
 *   App.openDialog(dlg) / App.closeDialog(dlg)    頁面自寫 <dialog class="modal"> 用
 *   App.tabs(tablist, {onChange(i, tab)}) → {select(i)}    多個 tab 可共用同一個 tabpanel
 *   App.seg(el, {onChange(value, btn)}) → {value(), set(v)}  按鈕需 data-value
 *   App.search.open()      全站檢索（頁首 [data-search] 與快捷鍵 / 已自動綁定）
 *   App.reveal(root)       動態插入的 [data-reveal] 重新掃描；元素進場時收到不冒泡的 'reveal' 事件
 *   App.hydrate(root)      [data-icon] 轉成點陣圖示（MutationObserver 已自動處理新節點）
 *   App.param(name) · App.reduceMotion（matchMedia）
 *
 * 自動行為
 *   開機全刷新（CSS，body::before/::after 保留給它）、導覽 active 與 aria-current（含頁尾 .pageloc 與 [data-pageloc]）、行動版選單 [data-nav-toggle]、
 *   [data-search]、[data-full-refresh]、[data-clock]、[data-last-refresh]、[data-count]、[data-reveal]、
 *   [data-anim]（離開視窗加 .is-offscreen 暫停 CSS 動畫）、分頁隱藏時 html.is-hidden、Esc 關閉 dialog、
 *   站內換頁的離頁刷新、canvas[data-scene] 自動繪製與 resize 重繪。
 *
 * 案件欄位
 *   id '115-0219', no '檔應字第1150219號', name, kind（個人/學生/學術/媒體/團體/法人/律師）, org, purpose, reason,
 *   status, received, officer, retriever, redactor, items[件 id], mode, copy('paper'|'scan'), self（當事人/權利人）,
 *   wish / wishSlot（申請人希望閱覽日）, visit / slot / seat（已排定）, checkin / checkout（'HH:MM'）,
 *   retrieved（已調出件數）, redacted（已遮蔽頁數）, extended（展期 30 日）, returnedAt / note（補正）, decidedAt,
 *   copies（複製頁數）, dec{件 id: 決定}, channel（'online'|'counter'）, receivedTime（今日收件時間）, phone（遮罩）
 *   衍生：files[{...件, decision}], needsRedaction, needsApproval, redactPages, retrieveTotal
 */
(function () {
  'use strict';

  const App = (window.App = {});
  const doc = document;
  const root = doc.documentElement;
  App.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => App.reduceMotion.matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.esc = esc;
  App.param = (name) => new URLSearchParams(location.search).get(name);

  /* ===================================================================
     時間
     =================================================================== */
  const TODAY = '2026-10-27';
  const NOW_START = Date.UTC(2026, 9, 27, 1, 14, 0); // 09:14（UTC+8）
  const bootAt = Date.now();
  App.TODAY = TODAY;
  App.now = () => NOW_START + (Date.now() - bootAt);
  const toUTC = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  App.addDays = (d, n) => iso(toUTC(d) + n * 864e5);
  App.diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
  App.days = (d) => App.diffDays(TODAY, d);
  const WD = '日一二三四五六';
  App.fmt = {
    date: (d) => d.replace(/-/g, '/'),
    md: (d) => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; },
    wd: (d) => WD[new Date(toUTC(d)).getUTCDay()],
    long: (d) => { const [y, m, dd] = d.split('-'); return `${y} 年 ${+m} 月 ${+dd} 日（${App.fmt.wd(d)}）`; },
    roc: (d) => { const [y, m, dd] = d.split('-'); return `${y - 1911}/${m}/${dd}`; },
    num: (n) => Number(n).toLocaleString('zh-TW'),
    time: (ms) => { const t = new Date(ms + 8 * 36e5); return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`; },
    rel: (d) => {
      const n = App.days(d);
      return n === 0 ? '今天' : n === 1 ? '明天' : n === -1 ? '昨天' : n > 0 ? `${n} 日後` : `${-n} 日前`;
    },
  };
  App.isOpenDay = (d) => { const w = new Date(toUTC(d)).getUTCDay(); return w >= 2 && w <= 6; };
  App.nextOpenDay = (d, minAhead = 1) => { let x = App.addDays(d, minAhead); while (!App.isOpenDay(x)) x = App.addDays(x, 1); return x; };
  App.SLOTS = {
    am: { label: '上午', time: '09:00–12:00' },
    pm: { label: '下午', time: '13:30–17:00' },
    day: { label: '全日', time: '09:00–17:00' },
  };

  /* ===================================================================
     列舉
     =================================================================== */
  App.PEOPLE = {
    lin: { id: 'lin', name: '林予安', unit: '應用服務課', title: '承辦人', role: 'review' },
    tsai: { id: 'tsai', name: '蔡明哲', unit: '應用服務課', title: '承辦人', role: 'review' },
    hsu: { id: 'hsu', name: '許韻如', unit: '應用服務課', title: '課長', role: 'review' },
    chou: { id: 'chou', name: '周振宇', unit: '典藏管理課', title: '檔管員', role: 'retrieve' },
    huang: { id: 'huang', name: '黃怡君', unit: '典藏管理課', title: '檔管員', role: 'retrieve' },
    chen: { id: 'chen', name: '陳品妤', unit: '數位修護組', title: '影像遮蔽', role: 'redact' },
    wu: { id: 'wu', name: '吳承翰', unit: '數位修護組', title: '影像遮蔽', role: 'redact' },
    cheng: { id: 'cheng', name: '鄭懷遠', unit: '館長室', title: '館長', role: 'approve' },
  };
  App.ME = 'lin';
  App.PURPOSES = {
    research: { label: '學術研究', icon: 'book' },
    rights: { label: '個人權益', icon: 'user' },
    press: { label: '新聞', icon: 'news' },
    other: { label: '其他', icon: 'dot' },
  };
  App.RESTRICTIONS = {
    none: { label: '無限制', short: '一般', icon: 'dot', basis: '' },
    privacy: { label: '個人隱私', short: '個資', icon: 'user', basis: '應用辦法第 12 條第 1 款' },
    security: { label: '國家安全', short: '國安', icon: 'shield', basis: '應用辦法第 12 條第 2 款' },
    trade: { label: '營業秘密', short: '營業秘密', icon: 'key', basis: '應用辦法第 12 條第 3 款' },
  };
  App.DECISIONS = {
    pending: { label: '待判定' },
    open: { label: '准予提供' },
    redact: { label: '遮蔽後提供' },
    deny: { label: '不予提供' },
  };
  App.STAGES = [
    { key: 'apply', name: '線上申請', short: '申請' },
    { key: 'review', name: '承辦審核', short: '審核', note: '限制應用判定' },
    { key: 'retrieve', name: '檔管調卷', short: '調卷' },
    { key: 'redact', name: '遮蔽處理', short: '遮蔽' },
    { key: 'approve', name: '首長核定', short: '核定', note: '必要時' },
    { key: 'access', name: '閱覽／複製', short: '閱覽' },
  ];
  App.STATUSES = {
    pending: { label: '待審核', stage: 1 },
    supplement: { label: '補正中', stage: 1 },
    retrieving: { label: '調卷中', stage: 2 },
    redacting: { label: '遮蔽中', stage: 3 },
    approving: { label: '待核定', stage: 4 },
    scheduled: { label: '待閱覽', stage: 5 },
    closed: { label: '已結案', stage: 6 },
    rejected: { label: '不予提供', stage: 1 },
  };
  App.MODES = { read: '閱覽', copy: '複製', both: '閱覽＋複製' };
  App.COPY = { paper: '紙本影印', scan: '數位掃描檔' };
  App.ITEM_TYPES = { photo: '照片', map: '地圖', manuscript: '手稿', letter: '公文', ledger: '簿冊', drawing: '工程圖' };

  /* ===================================================================
     檔案目錄
     件：[件號, 日期, 題名, 類型, 頁數, 限制, 影像場景, 種子, 新增典藏日]
     =================================================================== */
  const CATALOG_SRC = [
    ['A01', '澄港市政府工務局', '1950–2008', '市府工務行政、都市計畫與公共工程檔案，含工程圖說、施工照片與建築執照存根。', [
      ['S01', '都市計畫', [
        ['041-0003', '舊城區街廓及道路系統規劃', '1952–1954', 'B2-03-11', [
          ['001', '1952-03-14', '舊城區現況街廓實測圖', 'map', 2, 'none', 'map', 3, '2026-10-19'],
          ['002', '1952-06-02', '舊城區道路拓寬計畫說明書', 'letter', 18, 'none', 'letter', 4],
          ['003', '1953-01-20', '道路拓寬拆遷戶補償名冊', 'ledger', 34, 'privacy', 'ledger', 2],
          ['004', '1954-08-11', '舊城區都市計畫公告圖', 'map', 1, 'none', 'map', 7],
        ]],
        ['067-0021', '新灣區填海新市鎮計畫', '1978–1983', 'B2-05-02', [
          ['001', '1978-05-09', '新灣區填海範圍及土地使用分區圖', 'map', 1, 'none', 'map', 15],
          ['002', '1979-11-30', '新灣區海埔地開發可行性研究報告', 'letter', 126, 'none', 'letter', 9],
          ['003', '1981-04-17', '新灣區填海工程施工照片', 'photo', 24, 'none', 'harbor', 11],
          ['004', '1983-02-25', '開發廠商投標及財務計畫文件', 'letter', 58, 'trade', 'letter', 13],
        ]],
      ]],
      ['S02', '公共工程', [
        ['050-0007', '市府大樓新建工程', '1959–1961', 'B2-01-07', [
          ['001', '1959-04-01', '市府大樓建築設計圖', 'drawing', 22, 'none', 'blueprint', 4],
          ['002', '1960-12-15', '市府大樓工程進度照片', 'photo', 18, 'none', 'hall', 9],
          ['003', '1961-10-25', '市府大樓落成典禮照片', 'photo', 9, 'none', 'hall', 1, '2026-10-20'],
        ]],
        ['057-0012', '溪洲大橋新建工程', '1968–1974', 'B2-02-14', [
          ['001', '1968-09-03', '溪洲大橋橋型比較及設計圖', 'drawing', 16, 'none', 'blueprint', 7],
          ['002', '1971-03-22', '溪洲大橋施工照片（第一冊）', 'photo', 40, 'none', 'bridge', 2, '2026-10-26'],
          ['003', '1972-07-08', '施工承攬契約及單價分析表', 'letter', 32, 'trade', 'letter', 6],
          ['004', '1974-10-10', '溪洲大橋通車典禮照片', 'photo', 12, 'none', 'bridge', 5],
        ]],
      ]],
      ['S03', '建築管理', [
        ['073-0044', '港埕區建築執照存根', '1984', 'B3-07-21', [
          ['001', '1984-03-02', '港埕區第 1–80 號建築執照存根', 'ledger', 160, 'privacy', 'ledger', 8],
          ['002', '1984-09-19', '違章建築查報紀錄', 'letter', 46, 'privacy', 'letter', 17],
        ]],
      ]],
    ]],
    ['A02', '澄港市地政局', '1950–2012', '土地重劃、地籍登記與地價查估檔案；多數簿冊含土地所有權人個人資料。', [
      ['S01', '土地重劃', [
        ['074-0005', '鹽田區第一期農地重劃', '1985–1988', 'B3-02-05', [
          ['001', '1985-06-30', '鹽田區鹽場現況照片', 'photo', 4, 'none', 'saltfield', 3, '2026-10-23'],
          ['002', '1985-11-12', '鹽場轉用協議及會議紀錄', 'letter', 38, 'none', 'letter', 21],
          ['003', '1986-04-08', '重劃前後地價查估表', 'ledger', 72, 'privacy', 'ledger', 5],
          ['004', '1988-01-20', '土地分配結果公告及清冊', 'letter', 12, 'privacy', 'letter', 25],
        ]],
      ]],
      ['S02', '地籍登記', [
        ['046-0031', '舊城區日式宿舍地籍清理', '1957', 'B3-01-18', [
          ['001', '1957-02-14', '舊城區地籍原圖', 'map', 6, 'none', 'map', 12],
          ['002', '1957-05-03', '土地所有權人清冊', 'ledger', 88, 'privacy', 'ledger', 11],
          ['003', '1957-09-28', '地籍清理異議案件', 'letter', 30, 'privacy', 'letter', 29],
        ]],
      ]],
    ]],
    ['A03', '澄港市政府社會局', '1950–2010', '社會救助、災害救助與安置紀錄；個案資料依法限制應用。', [
      ['S01', '災害救助', [
        ['080-0016', '雲嶺區 0718 豪雨災後安置', '1991', 'B3-09-03', [
          ['001', '1991-07-19', '雲嶺區災後街道照片', 'photo', 36, 'none', 'street', 8],
          ['002', '1991-07-25', '受災戶救助金發放名冊', 'ledger', 64, 'privacy', 'ledger', 14],
          ['003', '1991-08-30', '臨時安置所收容紀錄', 'letter', 52, 'privacy', 'letter', 33],
        ]],
      ]],
      ['S02', '社會救助', [
        ['062-0009', '北岸區低收入戶生活扶助', '1973', 'B3-08-12', [
          ['001', '1973-01-15', '北岸區低收入戶調查表', 'ledger', 210, 'privacy', 'ledger', 17],
          ['002', '1973-06-20', '扶助標準調整簽呈', 'letter', 8, 'none', 'letter', 37],
        ]],
      ]],
    ]],
    ['A04', '澄港港埠管理處', '1946–1998', '港區建設、碼頭營運與港區管制檔案；管制區資料存放於 B4 機密庫房。', [
      ['S01', '港區建設', [
        ['057-0002', '港埕區第三碼頭改建', '1968–1970', 'B2-04-09', [
          ['001', '1968-02-08', '第三碼頭改建前現況照片', 'photo', 20, 'none', 'harbor', 4, '2026-10-22'],
          ['002', '1968-10-30', '碼頭工人編組及工資冊', 'ledger', 96, 'privacy', 'ledger', 20],
          ['003', '1970-05-18', '第三碼頭竣工照片', 'photo', 14, 'none', 'harbor', 7],
        ]],
      ]],
      ['S02', '港區管制', [
        ['059-0001', '港區戒備及管制區劃設', '1970', 'B4-01-02', [
          ['001', '1970-03-03', '港區管制區範圍圖', 'map', 2, 'security', 'map', 21],
          ['002', '1970-03-10', '管制區通行證核發要點', 'letter', 6, 'none', 'letter', 41],
          ['003', '1970-04-01', '港區警戒哨配置表', 'ledger', 4, 'security', 'ledger', 23],
        ]],
      ]],
    ]],
    ['A05', '澄港市政府經濟發展局', '1955–2015', '工廠與商業登記檔案；製程、設備與財務文件涉營業秘密。', [
      ['S01', '工廠登記', [
        ['068-0027', '鹽田區製鹽及化工工廠登記', '1979–1980', 'B3-04-16', [
          ['001', '1979-08-14', '澄鹽化工股份有限公司工廠登記申請書', 'letter', 22, 'trade', 'letter', 45],
          ['002', '1979-08-14', '製程說明及設備配置圖', 'drawing', 14, 'trade', 'blueprint', 12],
          ['003', '1980-02-01', '工廠登記證存根', 'ledger', 3, 'none', 'ledger', 26],
        ]],
      ]],
      ['S02', '商業登記', [
        ['058-0040', '北岸區老街商號登記', '1969', 'B3-05-08', [
          ['001', '1969-04-11', '北岸區老街店屋照片', 'photo', 28, 'none', 'street', 3, '2026-10-24'],
          ['002', '1969-05-02', '商業登記申請書彙編', 'letter', 140, 'privacy', 'letter', 49],
        ]],
      ]],
    ]],
    ['A06', '澄港市議會', '1951–', '大會議事錄、議員提案與質詢紀錄；議事錄手稿已完成數位化。', [
      ['S01', '議事錄', [
        ['068-0001', '第八屆第三次定期大會議事錄', '1979', 'B2-08-01', [
          ['001', '1979-05-03', '大會議事錄手稿（上冊）', 'manuscript', 182, 'none', 'manuscript', 2, '2026-10-15'],
          ['002', '1979-05-21', '大會議事錄手稿（下冊）', 'manuscript', 166, 'none', 'manuscript', 6],
          ['003', '1979-06-10', '議員提案原件', 'manuscript', 44, 'none', 'manuscript', 9],
        ]],
      ]],
      ['S02', '質詢紀錄', [
        ['080-0003', '雲嶺區災害救助質詢案', '1991', 'B2-08-19', [
          ['001', '1991-09-12', '質詢紀錄及市府答覆', 'letter', 26, 'none', 'letter', 53],
          ['002', '1991-09-30', '救助款項流向查核報告', 'letter', 40, 'privacy', 'letter', 57],
        ]],
      ]],
    ]],
  ];

  const nodes = new Map();
  const flatItems = [];
  const fondsList = CATALOG_SRC.map(([code, title, span, scope, seriesSrc]) => {
    const f = { id: code, level: 'fonds', code, title, span, scope, children: [], parent: null };
    nodes.set(f.id, f);
    seriesSrc.forEach(([sc, stitle, filesSrc]) => {
      const s = { id: `${code}-${sc}`, level: 'series', code: sc, title: stitle, children: [], parent: f.id, fonds: f.id };
      f.children.push(s);
      nodes.set(s.id, s);
      filesSrc.forEach(([fno, ftitle, fspan, location, itemsSrc]) => {
        const fl = { id: `${code}-${fno}`, level: 'file', code: fno, title: ftitle, span: fspan, location, children: [], parent: s.id, series: s.id, fonds: f.id };
        s.children.push(fl);
        nodes.set(fl.id, fl);
        itemsSrc.forEach(([ino, date, ititle, type, pages, restriction, scene, seed, accession]) => {
          const it = {
            id: `${fl.id}-${ino}`, level: 'item', code: ino, date, title: ititle, type, pages, restriction, scene, seed,
            accession: accession || null, children: [], parent: fl.id, file: fl.id, series: s.id, fonds: f.id,
          };
          fl.children.push(it);
          nodes.set(it.id, it);
          flatItems.push(it);
        });
      });
    });
    return f;
  });
  const countOf = (n) => (n.level === 'item' ? 1 : n.children.reduce((s, c) => s + countOf(c), 0));
  App.catalog = {
    fonds: fondsList,
    items: flatItems,
    get: (id) => nodes.get(id),
    path: (id) => { const out = []; for (let n = nodes.get(id); n; n = n.parent ? nodes.get(n.parent) : null) out.unshift(n); return out; },
    countOf,
    search: (q) => {
      const k = q.trim().toLowerCase();
      if (!k) return [];
      return flatItems.filter((it) => [it.id, it.title, nodes.get(it.fonds).title, nodes.get(it.file).title].join(' ').toLowerCase().includes(k));
    },
    accessions: () => flatItems.filter((it) => it.accession).sort((a, b) => (a.accession < b.accession ? 1 : -1)),
  };
  App.itemUrl = (id) => `catalog.html?item=${encodeURIComponent(id)}`;

  /* ===================================================================
     申請案件
     =================================================================== */
  const REQUESTS = [
    // 待審核
    { id: '115-0264', name: '江俊傑', kind: '個人', org: '澄港高級中學 歷史科教師', purpose: 'other', reason: '編寫高中鄉土課程教材，需引用 1979 年市議會議事錄原件影像', status: 'pending', received: '2026-10-27', officer: 'lin', items: ['A06-068-0001-001'], mode: 'copy', copy: 'scan', wish: '2026-11-05', wishSlot: 'am', channel: 'online', receivedTime: '08:47' },
    { id: '115-0262', name: '曾子軒', kind: '學生', org: '澄港大學建築研究所 碩士生', purpose: 'research', reason: '碩士論文〈戰後市府建築的現代主義轉向〉', status: 'pending', received: '2026-10-26', officer: 'lin', items: ['A01-050-0007-001', 'A01-050-0007-002'], mode: 'read', wish: '2026-11-10', wishSlot: 'pm', channel: 'online' },
    { id: '115-0259', name: '鄭雅文', kind: '團體', org: '港都文史工作室', purpose: 'other', reason: '港埕區社區導覽解說牌之歷史照片查證', status: 'pending', received: '2026-10-23', officer: 'tsai', items: ['A04-057-0002-001', 'A04-057-0002-003'], mode: 'both', copy: 'scan', wish: '2026-11-04', wishSlot: 'am', channel: 'online' },
    { id: '115-0255', name: '王柏翰', kind: '媒體', org: '自由撰稿記者', purpose: 'press', reason: '〈港區管制七十年〉專題報導', status: 'pending', received: '2026-10-21', officer: 'lin', items: ['A04-059-0001-001', 'A04-059-0001-002', 'A04-059-0001-003'], mode: 'read', wish: '2026-11-06', wishSlot: 'day', channel: 'online' },
    { id: '115-0248', name: '李美華', kind: '個人', org: '', purpose: 'rights', reason: '查詢先父於鹽田區重劃之土地分配與地價資料', status: 'pending', received: '2026-10-16', officer: 'lin', items: ['A02-074-0005-003', 'A02-074-0005-004'], mode: 'copy', copy: 'paper', self: true, wish: '2026-11-03', wishSlot: 'am', channel: 'counter' },
    { id: '115-0241', name: '洪詩涵', kind: '個人', org: '紀錄片導演', purpose: 'other', reason: '紀錄片《鹽的記憶》影像使用授權評估', status: 'pending', received: '2026-10-08', officer: 'tsai', items: ['A02-074-0005-001', 'A05-068-0027-001'], mode: 'both', copy: 'scan', wish: '2026-11-07', wishSlot: 'pm', channel: 'online' },
    { id: '115-0236', name: '劉怡伶', kind: '媒體', org: '北岸日報 地方新聞中心', purpose: 'press', reason: '1991 年雲嶺區災後救助款流向追蹤報導', status: 'pending', received: '2026-10-03', officer: 'lin', items: ['A03-080-0016-002', 'A06-080-0003-002'], mode: 'read', wish: '2026-10-30', wishSlot: 'am', channel: 'online' },
    { id: '115-0233', name: '蘇明德', kind: '個人', org: '', purpose: 'rights', reason: '辦理遺產繼承，需確認祖父經營工廠之登記資料', status: 'pending', received: '2026-10-01', officer: 'hsu', items: ['A05-068-0027-003', 'A05-068-0027-001'], mode: 'copy', copy: 'paper', self: true, wish: '2026-10-31', wishSlot: 'am', channel: 'counter' },
    // 補正中
    { id: '115-0244', name: '黃志明', kind: '個人', org: '', purpose: 'rights', reason: '土地訴訟需調閱祖產地籍清理異議案卷', status: 'supplement', received: '2026-10-13', officer: 'tsai', items: ['A02-046-0031-002', 'A02-046-0031-003'], mode: 'copy', copy: 'paper', returnedAt: '2026-10-20', note: '請補附訴訟繫屬證明或土地登記謄本，以確認法律上利害關係', wish: '2026-11-12', wishSlot: 'am', channel: 'online' },
    { id: '115-0229', name: '楊淑芬', kind: '個人', org: '', purpose: 'rights', reason: '申請本人家庭於 1973 年接受生活扶助之紀錄', status: 'supplement', received: '2026-09-29', officer: 'tsai', items: ['A03-062-0009-001'], mode: 'copy', copy: 'paper', self: true, returnedAt: '2026-10-06', note: '請補附戶籍謄本，以證明與受扶助戶之關係', channel: 'counter' },
    // 調卷中
    { id: '115-0250', name: '許文彬', kind: '個人', org: '退休碼頭工人', purpose: 'rights', reason: '申請本人 1968 年碼頭工作紀錄，補正勞工保險年資', status: 'retrieving', received: '2026-10-19', officer: 'lin', retriever: 'chou', items: ['A04-057-0002-002'], mode: 'copy', copy: 'paper', self: true, retrieved: 0, wish: '2026-10-30', wishSlot: 'pm', channel: 'counter' },
    { id: '115-0245', name: '謝承恩', kind: '媒體', org: '澄港週報', purpose: 'press', reason: '〈新灣區填海四十年〉封面故事', status: 'retrieving', received: '2026-10-14', officer: 'tsai', retriever: 'huang', items: ['A01-067-0021-001', 'A01-067-0021-003'], mode: 'both', copy: 'scan', retrieved: 1, wish: '2026-11-03', wishSlot: 'am', channel: 'online' },
    { id: '115-0242', name: '郭建宏', kind: '學術', org: '澄港大學土木工程學系 教授', purpose: 'research', reason: '研究計畫：戰後鋼桁架橋梁技術史', status: 'retrieving', received: '2026-10-09', officer: 'lin', retriever: 'chou', items: ['A01-057-0012-001', 'A01-057-0012-002', 'A01-057-0012-004'], mode: 'read', retrieved: 2, wish: '2026-11-04', wishSlot: 'day', channel: 'online' },
    { id: '115-0238', name: '吳佩珊', kind: '學術', org: '澄港科技大學建築系 副教授', purpose: 'research', reason: '舊城區街廓演變之空間研究', status: 'retrieving', received: '2026-10-06', officer: 'lin', retriever: 'huang', items: ['A01-041-0003-001', 'A01-041-0003-002', 'A01-041-0003-004', 'A02-046-0031-001'], mode: 'both', copy: 'scan', retrieved: 2, wish: '2026-11-06', wishSlot: 'day', channel: 'online' },
    { id: '115-0230', name: '陳靜宜', kind: '學生', org: '澄港大學歷史學系 碩士生', purpose: 'research', reason: '碩士論文〈戰後港埕區碼頭工人社群〉', status: 'retrieving', received: '2026-09-30', officer: 'lin', retriever: 'chou', items: ['A04-057-0002-001', 'A04-057-0002-002', 'A04-057-0002-003'], mode: 'read', retrieved: 1, wish: '2026-10-29', wishSlot: 'am', channel: 'online' },
    // 遮蔽中
    { id: '115-0239', name: '張家豪', kind: '團體', org: '港埕社區發展協會 理事長', purpose: 'other', reason: '社區老屋保存調查，比對歷年違建查報紀錄', status: 'redacting', received: '2026-10-07', officer: 'tsai', retriever: 'chou', redactor: 'wu', items: ['A01-073-0044-002', 'A01-050-0007-003'], mode: 'both', copy: 'scan', redacted: 8, wish: '2026-11-05', wishSlot: 'pm', channel: 'online' },
    { id: '115-0232', name: '潘怡君', kind: '個人', org: '', purpose: 'rights', reason: '確認港埕區老屋 1984 年建築執照與產權資料', status: 'redacting', received: '2026-10-02', officer: 'lin', retriever: 'huang', redactor: 'chen', items: ['A01-073-0044-001'], mode: 'copy', copy: 'paper', redacted: 12, wish: '2026-10-31', wishSlot: 'pm', channel: 'counter' },
    { id: '115-0226', name: '周佳慧', kind: '媒體', org: '灣聲電台 節目製作人', purpose: 'press', reason: '〈老街的聲音〉口述歷史節目資料查證', status: 'redacting', received: '2026-09-25', officer: 'tsai', retriever: 'huang', redactor: 'chen', items: ['A05-058-0040-001', 'A05-058-0040-002'], mode: 'both', copy: 'scan', redacted: 96, extended: true, wish: '2026-11-03', wishSlot: 'pm', channel: 'online' },
    { id: '115-0224', name: '林冠宇', kind: '律師', org: '冠宇法律事務所', purpose: 'rights', reason: '受當事人委任，調閱地價查估資料作為訴訟證據', status: 'redacting', received: '2026-09-24', officer: 'hsu', retriever: 'chou', redactor: 'wu', items: ['A02-074-0005-003'], mode: 'copy', copy: 'paper', redacted: 40, extended: true, wish: '2026-10-30', wishSlot: 'am', channel: 'online' },
    { id: '115-0221', name: '蔡宛儒', kind: '學生', org: '澄港大學社會學研究所 博士生', purpose: 'research', reason: '博士論文〈災後安置與山城社區重建〉', status: 'redacting', received: '2026-09-22', officer: 'lin', retriever: 'huang', redactor: 'chen', items: ['A03-080-0016-001', 'A03-080-0016-003'], mode: 'read', redacted: 31, extended: true, wish: '2026-10-29', wishSlot: 'day', channel: 'online' },
    // 待核定
    { id: '115-0240', name: '鍾怡萍', kind: '學術', org: '澄港大學海洋研究所 博士後研究員', purpose: 'research', reason: '新灣區填海工程對潮間帶生態影響之歷史資料', status: 'approving', received: '2026-10-07', officer: 'lin', retriever: 'huang', redactor: 'wu', items: ['A01-067-0021-002', 'A01-067-0021-004'], mode: 'read', redacted: 58, wish: '2026-11-07', wishSlot: 'am', channel: 'online' },
    { id: '115-0227', name: '方志強', kind: '法人', org: '澄鹽化工股份有限公司 法務室', purpose: 'rights', reason: '本公司申請調閱自身歷年工廠登記資料（權利人申請）', status: 'approving', received: '2026-09-26', officer: 'hsu', retriever: 'chou', items: ['A05-068-0027-001', 'A05-068-0027-002'], mode: 'copy', copy: 'scan', self: true, dec: { 'A05-068-0027-001': 'open', 'A05-068-0027-002': 'open' }, wish: '2026-10-28', wishSlot: 'am', channel: 'online' },
    { id: '115-0219', name: '何建志', kind: '學術', org: '澄港大學法律學系 研究助理', purpose: 'research', reason: '戰後港區管制與碼頭勞動管理之法制史研究', status: 'approving', received: '2026-09-24', officer: 'lin', retriever: 'chou', redactor: 'chen', items: ['A04-059-0001-001', 'A04-059-0001-002', 'A04-059-0001-003', 'A04-057-0002-002'], mode: 'both', copy: 'paper', redacted: 100, extended: true, note: '涉國家安全檔案須會辦原移轉機關，依第 9 條延長 30 日', dec: { 'A04-059-0001-001': 'deny', 'A04-059-0001-003': 'redact' }, wish: '2026-10-30', wishSlot: 'am', channel: 'online' },
    // 待閱覽（今日）
    { id: '115-0217', name: '戴雅琪', kind: '學生', org: '澄港科技大學 都市計畫研究所', purpose: 'research', reason: '新灣區開發歷程與土地使用變遷', status: 'scheduled', received: '2026-09-14', officer: 'tsai', retriever: 'huang', items: ['A01-067-0021-001', 'A01-067-0021-003'], mode: 'read', visit: '2026-10-27', slot: 'day', seat: 'D3', channel: 'online' },
    { id: '115-0216', name: '簡明哲', kind: '個人', org: '', purpose: 'other', reason: '撰寫家族史，查閱祖父任職碼頭時期照片', status: 'scheduled', received: '2026-09-12', officer: 'lin', retriever: 'chou', items: ['A04-057-0002-001'], mode: 'read', visit: '2026-10-27', slot: 'am', seat: 'E2', channel: 'counter' },
    { id: '115-0214', name: '高子晴', kind: '媒體', org: '北岸日報 文化組', purpose: 'press', reason: '溪洲大橋通車五十週年回顧報導', status: 'scheduled', received: '2026-09-11', officer: 'tsai', retriever: 'chou', items: ['A01-057-0012-004', 'A01-057-0012-002'], mode: 'both', copy: 'scan', visit: '2026-10-27', slot: 'pm', seat: 'E1', channel: 'online' },
    { id: '115-0213', name: '徐若瑜', kind: '學生', org: '澄港大學歷史學系 大學部', purpose: 'research', reason: '專題研究：1970 年代市議會議事運作', status: 'scheduled', received: '2026-09-10', officer: 'lin', retriever: 'huang', items: ['A06-068-0001-003'], mode: 'read', visit: '2026-10-27', slot: 'am', seat: 'A2', checkin: '09:10', channel: 'online' },
    { id: '115-0211', name: '郭建宏', kind: '學術', org: '澄港大學土木工程學系 教授', purpose: 'research', reason: '比對溪洲大橋承攬契約之工料單價', status: 'scheduled', received: '2026-09-08', officer: 'lin', retriever: 'chou', redactor: 'wu', items: ['A01-057-0012-003'], mode: 'read', redacted: 32, visit: '2026-10-27', slot: 'pm', seat: 'C1', channel: 'online' },
    { id: '115-0209', name: '賴俊宏', kind: '個人', org: '', purpose: 'rights', reason: '確認舊城區祖厝之地籍原圖範圍', status: 'scheduled', received: '2026-09-07', officer: 'tsai', retriever: 'huang', items: ['A02-046-0031-001'], mode: 'copy', copy: 'paper', visit: '2026-10-27', slot: 'am', seat: 'B2', channel: 'counter' },
    { id: '115-0205', name: '吳佩珊', kind: '學術', org: '澄港科技大學建築系 副教授', purpose: 'research', reason: '舊城區都市計畫公告圖與市府大樓設計圖比對', status: 'scheduled', received: '2026-09-03', officer: 'lin', retriever: 'chou', items: ['A01-041-0003-004', 'A01-050-0007-001'], mode: 'both', copy: 'scan', visit: '2026-10-27', slot: 'day', seat: 'L1', checkin: '09:06', channel: 'online' },
    { id: '115-0198', name: '陳靜宜', kind: '學生', org: '澄港大學歷史學系 碩士生', purpose: 'research', reason: '碩士論文：1979 年議會對碼頭改建之質詢', status: 'scheduled', received: '2026-08-28', officer: 'lin', retriever: 'huang', items: ['A06-068-0001-001', 'A06-068-0001-002'], mode: 'read', visit: '2026-10-27', slot: 'am', seat: 'A1', checkin: '09:03', channel: 'online' },
    // 待閱覽（之後）
    { id: '115-0225', name: '范雅婷', kind: '學生', org: '澄港大學地理學系 碩士生', purpose: 'research', reason: '鹽田區地景變遷研究', status: 'scheduled', received: '2026-09-24', officer: 'tsai', retriever: 'huang', items: ['A02-074-0005-001', 'A02-074-0005-002'], mode: 'read', visit: '2026-11-03', slot: 'pm', seat: 'L2', channel: 'online' },
    { id: '115-0223', name: '宋佳穎', kind: '個人', org: '', purpose: 'rights', reason: '申請祖父於 1991 年豪雨後領取救助金之紀錄', status: 'scheduled', received: '2026-09-23', officer: 'lin', retriever: 'chou', redactor: 'chen', items: ['A03-080-0016-002'], mode: 'copy', copy: 'paper', redacted: 64, visit: '2026-10-31', slot: 'am', seat: 'C2', channel: 'counter' },
    { id: '115-0222', name: '王柏翰', kind: '媒體', org: '自由撰稿記者', purpose: 'press', reason: '市府大樓落成典禮史料查證', status: 'scheduled', received: '2026-09-21', officer: 'tsai', retriever: 'huang', items: ['A01-050-0007-003', 'A01-050-0007-002'], mode: 'both', copy: 'scan', visit: '2026-10-30', slot: 'am', seat: 'E2', channel: 'online' },
    { id: '115-0220', name: '葉書瑋', kind: '個人', org: '插畫創作者', purpose: 'other', reason: '繪本創作參考北岸老街景', status: 'scheduled', received: '2026-09-19', officer: 'lin', retriever: 'chou', items: ['A05-058-0040-001'], mode: 'read', visit: '2026-10-29', slot: 'pm', seat: 'B1', channel: 'online' },
    { id: '115-0218', name: '羅子豪', kind: '學生', org: '澄港大學歷史學系 碩士生', purpose: 'research', reason: '戰後市議會與地方派系研究', status: 'scheduled', received: '2026-09-15', officer: 'lin', retriever: 'huang', items: ['A06-080-0003-001'], mode: 'read', visit: '2026-10-28', slot: 'am', seat: 'A3', channel: 'online' },
    // 已結案
    { id: '115-0203', name: '許家銘', kind: '個人', org: '', purpose: 'other', reason: '社區刊物撰寫溪洲大橋故事', status: 'closed', received: '2026-09-01', officer: 'tsai', retriever: 'chou', items: ['A01-057-0012-004'], mode: 'both', copy: 'scan', visit: '2026-10-24', slot: 'pm', seat: 'E1', checkin: '13:40', checkout: '15:55', copies: 12, channel: 'online' },
    { id: '115-0201', name: '黃品妍', kind: '媒體', org: '澄港週報', purpose: 'press', reason: '北岸老街商號變遷報導', status: 'closed', received: '2026-08-31', officer: 'lin', retriever: 'huang', items: ['A05-058-0040-001'], mode: 'both', copy: 'scan', visit: '2026-10-24', slot: 'am', seat: 'E2', checkin: '09:20', checkout: '11:30', copies: 28, channel: 'online' },
    { id: '115-0195', name: '陳靜宜', kind: '學生', org: '澄港大學歷史學系 碩士生', purpose: 'research', reason: '碩士論文：港埕區碼頭空間史料初探', status: 'closed', received: '2026-08-25', officer: 'lin', retriever: 'chou', items: ['A04-057-0002-003'], mode: 'read', visit: '2026-10-17', slot: 'am', seat: 'A1', checkin: '09:05', checkout: '11:48', channel: 'online' },
    { id: '115-0193', name: '李志遠', kind: '個人', org: '', purpose: 'rights', reason: '確認本人 1984 年建築執照存根', status: 'closed', received: '2026-08-20', officer: 'hsu', retriever: 'huang', redactor: 'chen', items: ['A01-073-0044-001'], mode: 'copy', copy: 'paper', self: true, redacted: 160, visit: '2026-10-23', slot: 'pm', seat: 'B3', checkin: '14:02', checkout: '14:40', copies: 2, channel: 'counter' },
    { id: '115-0190', name: '鄭雅文', kind: '團體', org: '港都文史工作室', purpose: 'other', reason: '港埕區老照片展覽策展', status: 'closed', received: '2026-08-18', officer: 'tsai', retriever: 'chou', items: ['A04-057-0002-003', 'A04-057-0002-001'], mode: 'both', copy: 'scan', visit: '2026-10-22', slot: 'pm', seat: 'E1', checkin: '13:35', checkout: '16:50', copies: 34, channel: 'online' },
    { id: '115-0187', name: '郭建宏', kind: '學術', org: '澄港大學土木工程學系 教授', purpose: 'research', reason: '溪洲大橋設計圖說研究', status: 'closed', received: '2026-08-14', officer: 'lin', retriever: 'chou', items: ['A01-057-0012-001'], mode: 'read', visit: '2026-10-21', slot: 'am', seat: 'L1', checkin: '09:00', checkout: '11:55', channel: 'online' },
    // 不予提供
    { id: '115-0234', name: '杜孟軒', kind: '個人', org: '', purpose: 'other', reason: '個人興趣：港區警戒哨之歷史配置', status: 'rejected', received: '2026-10-02', officer: 'lin', items: ['A04-059-0001-003'], mode: 'read', decidedAt: '2026-10-20', note: '涉國家安全，依第 12 條第 2 款不予提供；已告知得於解密後再行申請', channel: 'online' },
    { id: '115-0207', name: '陳文雄', kind: '個人', org: '', purpose: 'other', reason: '調閱鄰居家庭之生活扶助紀錄', status: 'rejected', received: '2026-09-05', officer: 'tsai', items: ['A03-062-0009-001'], mode: 'read', decidedAt: '2026-09-16', note: '非當事人且無法律上利害關係，涉他人隱私不予提供', channel: 'counter' },
  ];
  App.REQUESTS = REQUESTS;
  App.FEATURED = '115-0219';

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const DEFAULT_DECISION = { none: 'open', privacy: 'redact', trade: 'redact', security: 'deny' };
  const DERIVED = ['files', 'needsRedaction', 'needsApproval', 'redactPages', 'retrieveTotal', 'no', 'phone'];

  // 衍生欄位：每次資料異動後重算，頁面直接讀 r.files 等即可
  function derive(r) {
    const undecided = r.status === 'pending' || r.status === 'supplement';
    r.files = r.items.map((id) => {
      const it = nodes.get(id);
      if (!it) throw new Error(`request ${r.id}: unknown item ${id}`);
      const decision = undecided ? 'pending' : r.status === 'rejected' ? 'deny' : (r.dec && r.dec[id]) || DEFAULT_DECISION[it.restriction];
      return { ...it, decision };
    });
    const live = r.files.filter((f) => f.decision !== 'deny');
    r.needsApproval = (undecided ? r.files : live).some((f) => f.restriction === 'security' || f.restriction === 'trade');
    r.needsRedaction = undecided ? r.files.some((f) => f.restriction !== 'none') : r.files.some((f) => f.decision === 'redact');
    r.redactPages = r.files.filter((f) => (undecided ? f.restriction !== 'none' : f.decision === 'redact')).reduce((s, f) => s + f.pages, 0);
    r.retrieveTotal = live.length;
    const h = hash(r.id);
    r.retriever = r.retriever || (h % 2 ? 'chou' : 'huang');
    r.redactor = r.redactor || ((h >> 3) % 2 ? 'chen' : 'wu');
    r.no = `檔應字第${r.id.replace('-', '')}號`;
    r.phone = `09${pad(h % 100)}-***-${pad((h >> 7) % 1000, 3)}`;
    return r;
  }
  REQUESTS.forEach(derive);

  App.getRequest = (id) => REQUESTS.find((r) => r.id === id);
  App.requestUrl = (id) => `request.html?id=${encodeURIComponent(id)}`;
  App.stageIndex = (r) => App.STATUSES[r.status].stage;

  const ACTIVE_DEADLINE = ['pending', 'supplement', 'retrieving', 'redacting', 'approving'];
  App.deadline = (r) => {
    if (!ACTIVE_DEADLINE.includes(r.status)) return null;
    const period = r.extended ? 60 : 30;
    const end = r.status === 'supplement' ? r.returnedAt : TODAY;
    const elapsed = App.diffDays(r.received, end);
    const remaining = period - elapsed;
    const state = r.status === 'supplement' ? 'paused' : remaining < 0 ? 'over' : remaining <= 5 ? 'soon' : 'ok';
    return { period, elapsed, remaining, due: App.addDays(r.received, period), state, extended: !!r.extended };
  };

  const personName = (id) => (App.PEOPLE[id] ? App.PEOPLE[id].name : '');
  const minDate = (a, b) => (a < b ? a : b);

  // 依案件狀態推算各階段完成日（資料只記錄收件日與目前狀態，歷程由此產生且前後一致）
  App.timelineOf = (r) => {
    const ev = [{ key: 'apply', date: r.received, title: r.channel === 'counter' ? '臨櫃申請收件' : '線上申請送件', by: r.name, text: `申請 ${r.items.length} 件・${App.MODES[r.mode]}${r.copy ? `（${App.COPY[r.copy]}）` : ''}` }];
    if (r.status === 'pending') {
      ev.push({ key: 'review', date: TODAY, current: true, title: '承辦審核中', by: personName(r.officer), text: '限制應用判定：逐件確認個資、國安、營業秘密' });
      return ev;
    }
    if (r.status === 'supplement') {
      ev.push({ key: 'review', date: r.returnedAt, title: '通知補正', by: personName(r.officer), text: r.note, tone: 'warn' });
      ev.push({ key: 'review', date: r.returnedAt, current: true, title: '等待申請人補正', by: r.name, text: '補正期間不計入法定期限' });
      return ev;
    }
    if (r.status === 'rejected') {
      ev.push({ key: 'review', date: r.decidedAt, title: '審核決定：不予提供', by: personName(r.officer), text: r.note, tone: 'stop' });
      return ev;
    }
    const h = hash(r.id);
    const seq = [['review', 3 + (h % 6)], ['retrieve', 2 + ((h >> 4) % 4)]];
    if (r.needsRedaction) seq.push(['redact', 3 + ((h >> 8) % 5)]);
    if (r.needsApproval) seq.push(['approve', 2 + ((h >> 12) % 3)]);
    const curIdx = { retrieving: 1, redacting: seq.findIndex((s) => s[0] === 'redact'), approving: seq.findIndex((s) => s[0] === 'approve'), scheduled: seq.length, closed: seq.length }[r.status];
    const done = seq.slice(0, curIdx);
    const limit = r.visit ? minDate(App.addDays(r.visit, -3), App.addDays(TODAY, -1)) : App.addDays(TODAY, -1);
    const avail = Math.max(done.length, App.diffDays(r.received, limit));
    const total = done.reduce((s, d) => s + d[1], 0);
    const k = total > avail ? avail / total : 1;
    let d = r.received;
    const decisions = () => {
      const c = { open: 0, redact: 0, deny: 0 };
      r.files.forEach((f) => { c[f.decision] += 1; });
      return `准予提供 ${c.open} 件・遮蔽後提供 ${c.redact} 件${c.deny ? `・不予提供 ${c.deny} 件` : ''}${r.needsApproval ? '；陳送首長核定' : ''}`;
    };
    const kinds = () => [...new Set(r.files.filter((f) => f.decision === 'redact').map((f) => App.RESTRICTIONS[f.restriction].short))].join('、');
    const stacks = () => [...new Set(r.files.filter((f) => f.decision !== 'deny').map((f) => nodes.get(f.file).location.split('-')[0]))].join('、');
    const doneEvent = {
      review: () => ({ title: '限制應用判定', by: personName(r.officer), text: decisions() }),
      retrieve: () => ({ title: '調卷完成', by: personName(r.retriever), text: `自 ${stacks()} 庫房調出 ${r.retrieveTotal} 件` }),
      redact: () => ({ title: '遮蔽處理完成', by: personName(r.redactor), text: `遮蔽 ${r.redactPages} 頁（${kinds()}）` }),
      approve: () => ({ title: '首長核定', by: personName('cheng'), text: '核定准予提供（依判定結果）' }),
    };
    done.forEach(([key, dur]) => {
      d = App.addDays(d, Math.max(1, Math.floor(dur * k)));
      ev.push({ key, date: d, ...doneEvent[key]() });
    });
    if (r.status === 'retrieving') ev.push({ key: 'retrieve', date: d, current: true, title: '調卷中', by: personName(r.retriever), text: `已調出 ${r.retrieved || 0}／${r.retrieveTotal} 件` });
    if (r.status === 'redacting') ev.push({ key: 'redact', date: d, current: true, title: '遮蔽處理中', by: personName(r.redactor), text: `已完成 ${r.redacted || 0}／${r.redactPages} 頁` });
    if (r.status === 'approving') ev.push({ key: 'approve', date: d, current: true, title: '陳核中', by: personName('cheng'), text: r.note || '待館長核定' });
    if (r.status === 'scheduled') {
      ev.push({ key: 'access', date: d, title: '通知准駁與預約', by: personName(r.officer), text: `${App.fmt.md(r.visit)}（${App.fmt.wd(r.visit)}）${App.SLOTS[r.slot].label}・座位 ${r.seat}` });
      if (r.checkin) ev.push({ key: 'access', date: r.visit, current: true, title: '報到入館', by: r.name, text: `${r.checkin} 報到・閱覽中` });
      else ev.push({ key: 'access', date: r.visit, future: true, title: '預約閱覽', by: r.name, text: `${App.SLOTS[r.slot].time}・座位 ${r.seat}` });
    }
    if (r.status === 'closed') {
      ev.push({ key: 'access', date: r.visit, title: '閱覽完畢・結案', by: r.name, text: `${r.checkin}–${r.checkout}・座位 ${r.seat}${r.copies ? `・複製 ${r.copies} 頁` : ''}` });
    }
    return ev;
  };

  App.decidedAt = (r) => {
    if (r.status === 'rejected') return r.decidedAt;
    if (r.status !== 'scheduled' && r.status !== 'closed') return null;
    const ev = App.timelineOf(r).filter((e) => !e.current && !e.future && e.key !== 'apply' && e.key !== 'access');
    return ev.length ? ev[ev.length - 1].date : null;
  };

  App.flowState = (r) => {
    const doneAt = {};
    App.timelineOf(r).forEach((e) => { if (!e.current && !e.future) doneAt[e.key] = e; });
    const cur = App.stageIndex(r);
    const undecided = r.status === 'pending' || r.status === 'supplement';
    const owner = { review: personName(r.officer), retrieve: personName(r.retriever), redact: personName(r.redactor), approve: personName('cheng'), access: '第一閱覽室' };
    return App.STAGES.map((s, i) => {
      const needed = s.key === 'redact' ? r.needsRedaction : s.key === 'approve' ? r.needsApproval : true;
      let state;
      if (r.status === 'rejected') state = i === 0 ? 'done' : i === 1 ? 'stop' : 'todo';
      else if (i < cur) state = needed ? 'done' : 'skip';
      else if (i === cur) state = 'current';
      else state = needed || undecided ? 'todo' : 'skip';
      const ev = doneAt[s.key];
      return { ...s, state, needed, date: ev ? ev.date : null, by: state === 'current' ? owner[s.key] : ev ? ev.by : '' };
    });
  };

  /* ===================================================================
     閱覽室
     =================================================================== */
  App.SEAT_TYPES = { desk: '一般座位', map: '大圖桌', film: '微縮閱讀機', digital: '數位閱覽機' };
  App.SEATS = [
    ...['A', 'B', 'C', 'D'].flatMap((z, zi) => {
      const x0 = zi % 2 ? 18 : 5, y0 = zi < 2 ? 3 : 11;
      return [[1, x0, y0], [2, x0 + 5, y0], [3, x0, y0 + 4], [4, x0 + 5, y0 + 4]].map(([n, x, y]) => ({ id: z + n, type: 'desk', x, y }));
    }),
    { id: 'L1', type: 'map', x: 32, y: 12 },
    { id: 'L2', type: 'map', x: 35, y: 12 },
    { id: 'M1', type: 'film', x: 31, y: 3 },
    { id: 'M2', type: 'film', x: 35, y: 3, off: '維修中，預計 11/05 恢復' },
    { id: 'E1', type: 'digital', x: 31, y: 16 },
    { id: 'E2', type: 'digital', x: 35, y: 16 },
  ];
  App.ROOM = {
    cols: 40,
    rows: 20,
    blocks: [
      { x: 4, y: 5, w: 10, h: 2, kind: 'table', label: 'A 桌' },
      { x: 17, y: 5, w: 10, h: 2, kind: 'table', label: 'B 桌' },
      { x: 4, y: 13, w: 10, h: 2, kind: 'table', label: 'C 桌' },
      { x: 17, y: 13, w: 10, h: 2, kind: 'table', label: 'D 桌' },
      { x: 31, y: 8, w: 7, h: 4, kind: 'table', label: '大圖桌' },
      { x: 31, y: 1, w: 2, h: 2, kind: 'machine' },
      { x: 35, y: 1, w: 2, h: 2, kind: 'machine' },
      { x: 31, y: 18, w: 2, h: 2, kind: 'machine' },
      { x: 35, y: 18, w: 2, h: 2, kind: 'machine' },
      { x: 2, y: 18, w: 9, h: 2, kind: 'desk', label: '服務台' },
      { x: 29, y: 1, w: 1, h: 6, kind: 'wall' },
      { x: 29, y: 15, w: 1, h: 6, kind: 'wall' },
    ],
    labels: [
      { x: 31, y: 5, w: 8, text: '微縮資料區' },
      { x: 31, y: 15, w: 8, text: '數位影像區' },
      { x: 13, y: 19, w: 4, text: '入口' },
    ],
    door: { x: 13, w: 4 },
  };
  App.occupancy = (date, slot) => {
    const map = {};
    REQUESTS.forEach((r) => {
      if (r.visit !== date || !r.seat || (r.status !== 'scheduled' && r.status !== 'closed')) return;
      if (!(r.slot === 'day' || slot === 'day' || r.slot === slot)) return;
      map[r.seat] = { req: r, state: r.checkout ? 'done' : r.checkin ? 'in' : 'booked' };
    });
    return map;
  };
  App.freeSeat = (date, slot, type = 'desk') => {
    const occ = App.occupancy(date, slot);
    const free = App.SEATS.filter((s) => !s.off && !occ[s.id]);
    const pick = free.find((s) => s.type === type) || free.find((s) => s.type === 'desk');
    return pick ? pick.id : null;
  };
  const seatTypeFor = (r) => (r.files.some((f) => f.type === 'map' || f.type === 'drawing') ? 'map' : r.files.some((f) => f.type === 'photo') ? 'digital' : 'desk');

  /* ===================================================================
     統計
     =================================================================== */
  const MONTHLY = [
    ['2025-11', 9, 6, 3, 3], ['2025-12', 7, 6, 2, 3], ['2026-01', 10, 7, 3, 3], ['2026-02', 6, 6, 2, 3],
    ['2026-03', 12, 7, 4, 3], ['2026-04', 10, 8, 3, 3], ['2026-05', 13, 8, 4, 4], ['2026-06', 12, 8, 3, 4],
    ['2026-07', 15, 8, 4, 4], ['2026-08', 13, 7, 4, 4], ['2026-09', 10, 8, 4, 3],
  ];
  App.monthly = () => {
    const rows = MONTHLY.map(([month, research, rights, press, other]) => ({ month, research, rights, press, other, total: research + rights + press + other, partial: false }));
    const oct = { month: '2026-10', research: 0, rights: 0, press: 0, other: 0, partial: true };
    REQUESTS.filter((r) => r.received.startsWith('2026-10')).forEach((r) => { oct[r.purpose] += 1; });
    oct.total = oct.research + oct.rights + oct.press + oct.other;
    rows.push(oct);
    return rows.map((m) => ({ ...m, label: `${+m.month.slice(5)} 月` }));
  };
  App.restrictionStats = () => {
    const out = {};
    Object.keys(App.RESTRICTIONS).forEach((k) => { out[k] = { open: 0, redact: 0, deny: 0, pending: 0, total: 0 }; });
    REQUESTS.forEach((r) => r.files.forEach((f) => { out[f.restriction][f.decision] += 1; out[f.restriction].total += 1; }));
    return out;
  };

  /* ===================================================================
     申請清單（購物車）
     =================================================================== */
  const cart = ['A01-041-0003-004', 'A06-068-0001-002'];
  App.cart = {
    ids: () => [...cart],
    list: () => cart.map((id) => nodes.get(id)),
    has: (id) => cart.includes(id),
    add(id) {
      if (!nodes.get(id) || nodes.get(id).level !== 'item') throw new Error('cart.add: not an item ' + id);
      if (cart.includes(id)) return false;
      cart.push(id);
      App.commit('cart');
      return true;
    },
    remove(id) {
      const i = cart.indexOf(id);
      if (i < 0) return false;
      cart.splice(i, 1);
      App.commit('cart');
      return true;
    },
    clear() { cart.length = 0; App.commit('cart'); },
  };

  /* ===================================================================
     計數與資料同步
     =================================================================== */
  App.counts = () => {
    const c = { pending: 0, supplement: 0, retrieving: 0, redacting: 0, approving: 0, scheduled: 0, closed: 0, rejected: 0 };
    REQUESTS.forEach((r) => { c[r.status] += 1; });
    c.review = c.pending + c.supplement;
    c.active = REQUESTS.length - c.closed - c.rejected;
    const today = REQUESTS.filter((r) => r.visit === TODAY && r.seat && (r.status === 'scheduled' || r.status === 'closed'));
    c.today = today.reduce((s, r) => s + (r.slot === 'day' ? 2 : 1), 0);
    c.todayVisitors = today.length;
    c.todayIn = today.filter((r) => r.checkin && !r.checkout).length;
    c.cart = cart.length;
    c.octReceived = REQUESTS.filter((r) => r.received.startsWith('2026-10')).length;
    const dl = REQUESTS.map(App.deadline).filter(Boolean);
    c.overdue = dl.filter((d) => d.state === 'over').length;
    c.dueSoon = dl.filter((d) => d.state === 'soon').length;
    const ret = REQUESTS.filter((r) => r.status === 'retrieving');
    c.retrieveTotal = ret.reduce((s, r) => s + r.retrieveTotal, 0);
    c.retrieveDone = ret.reduce((s, r) => s + (r.retrieved || 0), 0);
    const red = REQUESTS.filter((r) => r.status === 'redacting');
    c.redactTotal = red.reduce((s, r) => s + r.redactPages, 0);
    c.redactDone = red.reduce((s, r) => s + (r.redacted || 0), 0);
    const decided = REQUESTS.map((r) => [r, App.decidedAt(r)]).filter(([, d]) => d);
    c.avgDecision = decided.length ? Math.round((decided.reduce((s, [r, d]) => s + App.diffDays(r.received, d), 0) / decided.length) * 10) / 10 : 0;
    return c;
  };

  App.commit = (reason = '') => {
    const c = App.counts();
    doc.querySelectorAll('[data-count]').forEach((el) => syncCount(el, c, true));
    doc.dispatchEvent(new CustomEvent('app:change', { detail: { reason, counts: c } }));
  };
  App.onChange = (fn) => doc.addEventListener('app:change', (e) => fn(e.detail));
  function syncCount(el, c, animate) {
    const key = el.dataset.count;
    if (!(key in c)) throw new Error('unknown data-count key: ' + key);
    const s = String(c[key]);
    if (el.hasAttribute('data-hide-zero')) el.hidden = c[key] === 0;
    if (el.dataset.value === s) return;
    el.dataset.value = s;
    if (animate) App.eink.setText(el, s);
    else el.textContent = s;
  }

  /* ===================================================================
     資料異動（皆回傳 undo）
     =================================================================== */
  const snapshot = (r) => JSON.parse(JSON.stringify(r, (k, v) => (DERIVED.includes(k) ? undefined : v)));
  function mutate(id, fn, reason) {
    const r = App.getRequest(id);
    if (!r) throw new Error('request not found: ' + id);
    const before = snapshot(r);
    fn(r);
    derive(r);
    App.commit(reason);
    return () => {
      Object.keys(r).forEach((k) => delete r[k]);
      Object.assign(r, before);
      derive(r);
      App.commit(reason + ':undo');
    };
  }
  function schedule(r) {
    r.status = 'scheduled';
    if (!r.visit || r.visit < TODAY) {
      r.visit = r.wish && r.wish > TODAY && App.isOpenDay(r.wish) ? r.wish : App.nextOpenDay(TODAY, 2);
      r.slot = r.wishSlot || 'am';
    }
    if (!r.seat) r.seat = App.freeSeat(r.visit, r.slot, seatTypeFor(r));
  }
  const nowHM = () => App.fmt.time(App.now());
  App.actions = {
    decide: (id, dec) => mutate(id, (r) => { r.dec = { ...dec }; r.status = 'retrieving'; r.retrieved = 0; }, 'decide'),
    resume: (id) => mutate(id, (r) => { r.status = 'pending'; }, 'resume'),
    retrieved: (id) => mutate(id, (r) => {
      r.retrieved = r.retrieveTotal;
      if (r.needsRedaction) { r.status = 'redacting'; r.redacted = r.redacted || 0; } else if (r.needsApproval) r.status = 'approving'; else schedule(r);
    }, 'retrieved'),
    redacted: (id) => mutate(id, (r) => { r.redacted = r.redactPages; if (r.needsApproval) r.status = 'approving'; else schedule(r); }, 'redacted'),
    approve: (id) => mutate(id, (r) => schedule(r), 'approve'),
    checkin: (id) => mutate(id, (r) => { r.checkin = nowHM(); }, 'checkin'),
    checkout: (id) => mutate(id, (r) => { r.checkout = nowHM(); r.status = 'closed'; }, 'checkout'),
    reject: (id, note) => mutate(id, (r) => { r.status = 'rejected'; r.decidedAt = TODAY; r.note = note; }, 'reject'),
    assignSeat: (id, { visit, slot, seat }) => mutate(id, (r) => { r.visit = visit; r.slot = slot; r.seat = seat; }, 'seat'),
    create(data) {
      const n = Math.max(...REQUESTS.map((r) => +r.id.slice(4))) + 1;
      const r = derive({
        id: `115-${pad(n, 4)}`, kind: '個人', org: '', mode: 'read', channel: 'counter', ...data,
        status: 'pending', received: TODAY, officer: App.ME,
      });
      REQUESTS.unshift(r);
      App.commit('create');
      return {
        req: r,
        undo: () => { const i = REQUESTS.indexOf(r); if (i >= 0) REQUESTS.splice(i, 1); App.commit('create:undo'); },
      };
    },
  };

  /* ===================================================================
     點陣圖示（9×9，2 倍顯示；# 為墨點）
     =================================================================== */
  const BITMAPS = {
    overview: ['####.####', '#..#.#..#', '#..#.#..#', '####.####', '.........', '####.####', '#..#.####', '#..#.####', '####.####'],
    requests: ['..#######', '..#.....#', '#######.#', '#.....#.#', '#.###.#.#', '#.....#.#', '#.###.###', '#.....#..', '#######..'],
    request: ['######...', '#....##..', '#....#.#.', '#....####', '#.##....#', '#.......#', '#.#####.#', '#.......#', '#########'],
    box: ['#########', '#.......#', '#########', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.....#.', '.#.....#.', '.#######.'],
    fonds: ['....#....', '..#####..', '#########', '.........', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.........', '#########'],
    folder: ['.........', '####.....', '#...#####', '#.......#', '#.......#', '#.......#', '#.......#', '#########', '.........'],
    page: ['.#####...', '.#...##..', '.#....##.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#######.'],
    search: ['..###....', '.#...#...', '#.....#..', '#.....#..', '#.....#..', '.#...#...', '..###.#..', '.......#.', '........#'],
    refresh: ['..####.#.', '.#....##.', '#....###.', '#........', '#.......#', '........#', '.###....#', '.##....#.', '.#.####..'],
    user: ['...###...', '..#...#..', '..#...#..', '..#...#..', '...###...', '.........', '.#######.', '#.......#', '#.......#'],
    seat: ['.#.......', '.#.......', '.#.......', '.#.......', '.#######.', '.#.....#.', '.#.....#.', '.#.....#.', '.#.....#.'],
    lock: ['..#####..', '.#.....#.', '.#.....#.', '#########', '#.......#', '#...#...#', '#...#...#', '#.......#', '#########'],
    eye: ['.........', '...###...', '.##...##.', '#...#...#', '#..###..#', '#...#...#', '.##...##.', '...###...', '.........'],
    copy: ['#####....', '#...#....', '#.######.', '#.#....#.', '#.#....#.', '###....#.', '..#....#.', '..#....#.', '..######.'],
    redact: ['#########', '#.......#', '#.#####.#', '#.......#', '#.###...#', '#.......#', '#.#####.#', '#.......#', '#########'],
    stamp: ['...###...', '...###...', '....#....', '....#....', '.#######.', '#########', '.........', '#########', '.........'],
    check: ['.........', '........#', '.......##', '#.....##.', '##...##..', '.##.##...', '..###....', '...#.....', '.........'],
    x: ['.........', '.#.....#.', '..#...#..', '...#.#...', '....#....', '...#.#...', '..#...#..', '.#.....#.', '.........'],
    plus: ['.........', '....#....', '....#....', '....#....', '.#######.', '....#....', '....#....', '....#....', '.........'],
    minus: ['.........', '.........', '.........', '.........', '.#######.', '.........', '.........', '.........', '.........'],
    'chev-r': ['.........', '...#.....', '....#....', '.....#...', '......#..', '.....#...', '....#....', '...#.....', '.........'],
    'arrow-l': ['.........', '...#.....', '..#......', '.#.......', '#########', '.#.......', '..#......', '...#.....', '.........'],
    sort: ['....#....', '...###...', '..#####..', '.........', '.........', '.........', '..#####..', '...###...', '....#....'],
    'sort-up': ['....#....', '...###...', '..#####..', '.........', '.........', '.........', '..#...#..', '...#.#...', '....#....'],
    'sort-down': ['....#....', '...#.#...', '..#...#..', '.........', '.........', '.........', '..#####..', '...###...', '....#....'],
    filter: ['#########', '.#.....#.', '..#...#..', '...#.#...', '...#.#...', '...#.#...', '...#.#...', '...###...', '.........'],
    calendar: ['..#...#..', '#########', '#.......#', '#########', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#.#.#', '#########'],
    clock: ['..#####..', '.#.....#.', '#...#...#', '#...#...#', '#...###.#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
    list: ['...###...', '.##...##.', '.#.###.#.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#.###.#.', '.#.....#.', '.#######.'],
    image: ['.........', '#########', '#.......#', '#.##....#', '#.##..#.#', '#....####', '#..######', '#########', '.........'],
    pin: ['...###...', '..#...#..', '.#..#..#.', '.#.###.#.', '.#..#..#.', '..#...#..', '...#.#...', '....#....', '.........'],
    pen: ['.......##', '......#.#', '.....#.#.', '....#.#..', '...#.#...', '..#.#....', '.##......', '.#.......', '#........'],
    book: ['.........', '.###.###.', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '.###.###.', '....#....'],
    news: ['#########', '#.......#', '#.###.#.#', '#.......#', '#.###.#.#', '#.....#.#', '#.###...#', '#.......#', '#########'],
    dot: ['.........', '.........', '.........', '...###...', '...###...', '...###...', '.........', '.........', '.........'],
    shield: ['#########', '#.......#', '#...#...#', '#..###..#', '#...#...#', '.#.....#.', '..#...#..', '...#.#...', '....#....'],
    key: ['.........', '.........', '.###.....', '#...#....', '#.#.#####', '#...#..##', '.###...##', '.........', '.........'],
    info: ['..#####..', '.#.....#.', '#...#...#', '#.......#', '#...#...#', '#...#...#', '#...#...#', '.#.....#.', '..#####..'],
    warn: ['....#....', '...#.#...', '...#.#...', '..#.#.#..', '..#.#.#..', '.#..#..#.', '.#.....#.', '#...#...#', '#########'],
    menu: ['.........', '#########', '.........', '.........', '#########', '.........', '.........', '#########', '.........'],
    thermo: ['...#.....', '..#.#....', '..#.#....', '..#.#....', '..###....', '.#####...', '.#####...', '..###....', '.........'],
    print: ['..#####..', '..#...#..', '#########', '#.......#', '#.....#.#', '#########', '..#...#..', '..#####..', '.........'],
    download: ['....#....', '....#....', '....#....', '.#..#..#.', '..#.#.#..', '...###...', '....#....', '.........', '#########'],
    film: ['#########', '#.#.#.#.#', '#########', '#.......#', '#.......#', '#.......#', '#########', '#.#.#.#.#', '#########'],
    monitor: ['#########', '#.......#', '#.......#', '#.......#', '#.......#', '#########', '....#....', '..#####..', '.........'],
    dither: ['#.#.#.#.#', '.#.#.#.#.', '#.#.#.#.#', '.#...#...', '#...#...#', '.........', '#.......#', '.........', '....#....'],
    door: ['.#######.', '.#.....#.', '.#.....#.', '.#.....#.', '.#...#.#.', '.#.....#.', '.#.....#.', '.#.....#.', '#########'],
    logo: ['############', '#..........#', '#.########.#', '#.#......#.#', '#.#..##..#.#', '#.########.#', '#..........#', '#.########.#', '#.#......#.#', '#.#..##..#.#', '#.########.#', '############'],
    empty: ['..##########..', '.#..........#.', '#............#', '##############', '#............#', '#...######...#', '#............#', '#............#', '#............#', '#............#', '#............#', '##############'],
  };
  const mirrorH = (rows) => rows.map((r) => [...r].reverse().join(''));
  const rot90 = (rows) => rows[0].split('').map((_, x) => rows.map((r) => r[x]).reverse().join(''));
  BITMAPS['chev-l'] = mirrorH(BITMAPS['chev-r']);
  BITMAPS['chev-d'] = rot90(BITMAPS['chev-r']);
  BITMAPS['chev-u'] = rot90(rot90(BITMAPS['chev-d']));
  BITMAPS['arrow-r'] = mirrorH(BITMAPS['arrow-l']);
  BITMAPS['arrow-u'] = rot90(BITMAPS['arrow-l']);
  App.ICONS = Object.keys(BITMAPS);

  const pathCache = {};
  const bitmapPath = (rows) => {
    let d = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        if (row[x] !== '#') { x += 1; continue; }
        let run = 1;
        while (row[x + run] === '#') run += 1;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    });
    return d;
  };
  App.icon = (name, { size, label, cls } = {}) => {
    const rows = BITMAPS[name];
    if (!rows) throw new Error('unknown icon: ' + name);
    const w = rows[0].length, h = rows.length;
    const s = size || w * 2;
    const d = pathCache[name] || (pathCache[name] = bitmapPath(rows));
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
    return `<svg class="px${cls ? ' ' + cls : ''}" viewBox="0 0 ${w} ${h}" width="${s}" height="${Math.round((s * h) / w)}" ${a11y} focusable="false" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
  };
  App.hydrate = (rootEl = doc) => {
    rootEl.querySelectorAll('[data-icon]:not([data-icon-done])').forEach((el) => {
      el.innerHTML = App.icon(el.dataset.icon, { size: el.dataset.size ? +el.dataset.size : undefined });
      el.setAttribute('data-icon-done', '');
    });
  };

  /* ===================================================================
     點陣數字（5×7）
     =================================================================== */
  const DOT_FONT = {
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ':': ['.', '.', '#', '.', '#', '.', '.'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    '-': ['...', '...', '...', '###', '...', '...', '...'],
    ' ': ['..', '..', '..', '..', '..', '..', '..'],
  };
  function dotLayout(str) {
    const on = new Set();
    let x = 0;
    [...str].forEach((ch, i) => {
      const g = DOT_FONT[ch];
      if (!g) throw new Error('dotNum: unsupported char ' + ch);
      if (i) x += 1;
      g.forEach((row, y) => [...row].forEach((c, k) => { if (c === '#') on.add(`${x + k},${y}`); }));
      x += g[0].length;
    });
    return { on, w: x };
  }
  App.dotNum = (value, { px = 6, label, ghost } = {}) => {
    const str = String(value);
    const L = dotLayout(str);
    const W = Math.max(L.w, ghost ? ghost.w : 0);
    const cell = (x, y) => `M${x * px} ${y * px}h${px - 1}v${px - 1}h-${px - 1}z`;
    let off = '', on = '', gh = '';
    for (let x = 0; x < W; x++) for (let y = 0; y < 7; y++) {
      const k = `${x},${y}`;
      if (L.on.has(k)) on += cell(x, y);
      else if (ghost && ghost.on.has(k)) gh += cell(x, y);
      else off += cell(x, y);
    }
    return `<svg class="dotnum" viewBox="0 0 ${W * px} ${7 * px}" width="${W * px}" height="${7 * px}" role="img" aria-label="${esc(label ?? str)}" shape-rendering="crispEdges">` +
      `<path style="fill:var(--dotnum-off)" d="${off}"/>${gh ? `<path class="dotnum__ghost" style="fill:var(--dotnum-ghost)" d="${gh}"/>` : ''}<path style="fill:currentColor" d="${on}"/></svg>`;
  };
  // 數字改變時，舊數字亮過的點留下殘影再淡出（電子紙局部刷新）
  App.setDotNum = (host, value, opts = {}) => {
    const str = String(value);
    const prev = host.dataset.dotnum;
    if (prev === str) return;
    const ghost = prev != null && !reduced() ? dotLayout(prev) : null;
    host.dataset.dotnum = str;
    host.innerHTML = App.dotNum(str, { ...opts, ghost });
    if (ghost) App.eink.blink(host);
  };

  /* ===================================================================
     標記產生器
     =================================================================== */
  App.dots = ({ total, value = 0, partial = 0, cols, label = '', cls = '' } = {}) => {
    let cells = '';
    for (let i = 0; i < total; i++) cells += `<i class="${i < value ? 'on' : i < value + partial ? 'half' : ''}" style="--i:${i}"></i>`;
    return `<span class="dots${cls ? ' ' + cls : ''}" style="--cols:${cols || total}" role="img" aria-label="${esc(label || `${value}／${total}`)}">${cells}</span>`;
  };
  App.dueBar = (r) => {
    const d = App.deadline(r);
    if (!d) return '';
    const cells = 30;
    const filled = d.state === 'over' ? cells : Math.min(cells, Math.round((d.elapsed / d.period) * cells));
    const text = d.state === 'paused' ? `補正中・已用 ${d.elapsed} 日` : d.state === 'over' ? `逾期 ${-d.remaining} 日` : `第 ${d.elapsed} 日・剩 ${d.remaining} 日`;
    const label = `法定期限 ${d.period} 日${d.extended ? '（已展期）' : ''}，${text}`;
    return `<span class="duebar" data-state="${d.state}">${App.dots({ total: cells, value: filled, cls: 'dots--line', label })}<span class="duebar__label">${d.state === 'over' || d.state === 'soon' ? App.icon('warn', { size: 9 }) : ''}${esc(text)}${d.extended ? '<span class="duebar__ext">展期</span>' : ''}</span></span>`;
  };
  App.statusTag = (s) => `<span class="status" data-s="${s}"><i class="status__sw" aria-hidden="true"></i>${esc(App.STATUSES[s].label)}</span>`;
  App.restrictTag = (r, { short = true } = {}) => {
    const R = App.RESTRICTIONS[r];
    return `<span class="restrict" data-r="${r}" title="${esc(R.label + (R.basis ? '・' + R.basis : ''))}">${App.icon(R.icon, { size: 9 })}${esc(short ? R.short : R.label)}</span>`;
  };
  App.purposeTag = (p) => `<span class="purpose" data-p="${p}">${App.icon(App.PURPOSES[p].icon, { size: 9 })}${esc(App.PURPOSES[p].label)}</span>`;
  App.decisionTag = (d) => `<span class="decision" data-d="${d}">${esc(App.DECISIONS[d].label)}</span>`;
  App.flowMini = (r) => {
    const st = App.flowState(r);
    const cur = st.find((s) => s.state === 'current' || s.state === 'stop');
    const label = r.status === 'closed' ? '流程：已結案' : `流程：${cur ? cur.name : ''}（${App.stageIndex(r) + 1}／6）`;
    const cls = { done: 'done', current: 'cur', todo: '', skip: 'skip', stop: 'stop' };
    return `<span class="flowmini" role="img" aria-label="${esc(label)}">${st.map((s) => `<i class="${cls[s.state]}" title="${esc(s.name)}"></i>`).join('')}</span>`;
  };
  App.flowSteps = (r, { vertical = false } = {}) => {
    const meta = (s) => {
      if (s.state === 'done') return `${s.date ? App.fmt.md(s.date) : ''}${s.by ? ' · ' + s.by : ''}`;
      if (s.state === 'current') return `進行中${s.by ? ' · ' + s.by : ''}`;
      if (s.state === 'skip') return '免辦';
      if (s.state === 'stop') return '不予提供';
      return s.key === 'approve' ? '必要時' : '—';
    };
    const node = { done: App.icon('check', { size: 9 }), stop: App.icon('x', { size: 9 }), skip: App.icon('minus', { size: 9 }), current: '', todo: '' };
    return `<ol class="flow${vertical ? ' flow--v' : ''}" aria-label="審核流程">${App.flowState(r).map((s, i) =>
      `<li class="flow__step" data-state="${s.state}"${s.state === 'current' ? ' aria-current="step"' : ''}><span class="flow__node" aria-hidden="true">${node[s.state]}</span><span class="flow__no">${pad(i + 1)}</span><span class="flow__name">${esc(s.name)}</span><span class="flow__meta">${esc(meta(s))}</span></li>`).join('')}</ol>`;
  };
  App.timeline = (r) => `<ol class="timeline">${App.timelineOf(r).map((e) =>
    `<li class="tl-item${e.current ? ' tl-item--current' : ''}${e.future ? ' tl-item--future' : ''}${e.tone ? ' tl-item--' + e.tone : ''}"><div class="tl-item__head"><span class="tl-item__date">${App.fmt.date(e.date)}</span><span class="tl-item__title">${esc(e.title)}</span><span class="tl-item__by">${esc(e.by || '')}</span></div>${e.text ? `<p class="tl-item__text">${esc(e.text)}</p>` : ''}</li>`).join('')}</ol>`;
  App.avatar = (name, cls = '') => `<span class="avatar${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(String(name).slice(0, 1))}</span>`;
  App.person = (id) => {
    const p = App.PEOPLE[id];
    if (!p) throw new Error('unknown person: ' + id);
    return `<span class="person">${App.avatar(p.name)}<span class="person__text"><span class="person__name">${esc(p.name)}</span><span class="person__sub">${esc(p.unit)} ${esc(p.title)}</span></span></span>`;
  };
  App.barcode = (text, { height = 36, unit = 1.5 } = {}) => {
    let x = 0, d = '';
    const chars = `*${text}*`;
    [...chars].forEach((ch, ci) => {
      const code = ch.charCodeAt(0);
      for (let k = 0; k < 9; k++) {
        const wide = ((code * (k + 3) * 7 + ci) % 5) < 2;
        const w = (wide ? 3 : 1) * unit;
        if (k % 2 === 0) d += `M${x} 0h${w}v${height}h-${w}z`;
        x += w;
      }
      x += unit;
    });
    return `<svg class="barcode" viewBox="0 0 ${x} ${height}" width="${x}" height="${height}" role="img" aria-label="條碼 ${esc(text)}" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
  };
  App.emptyState = ({ title = '沒有符合的資料', text = '', icon = 'empty' } = {}) =>
    `<div class="empty"><span class="empty__art">${App.icon(icon, { size: icon === 'empty' ? 84 : 54 })}</span><p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}</div>`;

  /* ===================================================================
     電子紙引擎
     =================================================================== */
  const eink = (App.eink = {});
  const EINK_FX = '.eink-ghost, .eink-inv, .eink-scan';
  function overlayBox(el, node) {
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.classList.add('eink-host');
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent') {
      // 反相用 difference 混色，需要不透明底才會翻成黑；暫時補紙色
      el.classList.add('eink-host--fill');
      clearTimeout(el._einkFill);
      el._einkFill = setTimeout(() => el.classList.remove('eink-host--fill'), 1200);
    }
    Object.assign(node.style, {
      left: -parseFloat(cs.borderLeftWidth) + 'px',
      top: -parseFloat(cs.borderTopWidth) + 'px',
      width: el.offsetWidth + 'px',
      height: el.offsetHeight + 'px',
    });
    el.appendChild(node);
    return node;
  }
  function snapshotEl(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(EINK_FX).forEach((n) => n.remove());
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const src = el.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
    dst.forEach((c, i) => { if (src[i] && src[i].width) c.getContext('2d').drawImage(src[i], 0, 0); });
    return clone;
  }
  const canAnimate = (el) => el && el.isConnected && !reduced() && el.getClientRects().length > 0;
  eink.blink = (el) => {
    if (!canAnimate(el)) return;
    const inv = doc.createElement('i');
    inv.className = 'eink-inv';
    inv.setAttribute('aria-hidden', 'true');
    overlayBox(el, inv);
    setTimeout(() => inv.remove(), 160);
  };
  eink.refresh = (el, mutate, { ghost = true, invert = true } = {}) => {
    if (!canAnimate(el)) { if (mutate) mutate(); return; }
    const snap = ghost ? snapshotEl(el) : null;
    if (mutate) mutate();
    el.querySelectorAll(':scope > .eink-ghost').forEach((n) => n.remove());
    if (snap) {
      snap.classList.add('eink-ghost');
      snap.setAttribute('aria-hidden', 'true');
      snap.inert = true;
      overlayBox(el, snap);
      snap.addEventListener('animationend', () => snap.remove(), { once: true });
      setTimeout(() => snap.remove(), 1600);
    }
    if (invert) eink.blink(el);
  };
  eink.setText = (el, text) => {
    el.dataset.value = text;
    eink.refresh(el, () => { el.textContent = text; });
  };
  eink.turn = (el, mutate, { dir = 1, slices = 10 } = {}) => {
    if (!canAnimate(el)) { if (mutate) mutate(); return; }
    eink.refresh(el, mutate, { invert: false });
    const scan = doc.createElement('div');
    scan.className = 'eink-scan';
    scan.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < slices; i++) {
      const s = doc.createElement('i');
      s.style.left = (i * 100) / slices + '%';
      s.style.width = 100 / slices + 0.4 + '%';
      s.style.animationDelay = (dir > 0 ? i : slices - 1 - i) * 38 + 'ms';
      scan.appendChild(s);
    }
    overlayBox(el, scan);
    setTimeout(() => scan.remove(), slices * 38 + 260);
  };
  function flashLayer(mode) {
    const el = doc.createElement('div');
    el.className = `eink-flash eink-flash--${mode}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<i class="eink-flash__inv"></i><i class="eink-flash__solid"></i>';
    doc.body.appendChild(el);
    return el;
  }
  eink.flash = () => {
    if (reduced()) return Promise.resolve();
    const el = flashLayer('full');
    return new Promise((res) => setTimeout(() => { el.remove(); res(); }, 600));
  };
  eink.navigate = (href) => {
    if (reduced()) { location.href = href; return; }
    flashLayer('out');
    setTimeout(() => { location.href = href; }, 180);
  };
  addEventListener('pageshow', (e) => { if (e.persisted) doc.querySelectorAll('.eink-flash').forEach((n) => n.remove()); });

  /* ===================================================================
     抖色影像引擎
     =================================================================== */
  const dither = (App.dither = {});
  dither.METHODS = { bayer: 'Bayer 8×8', fs: 'Floyd–Steinberg', atkinson: 'Atkinson' };
  const BAYER8 = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ].map((v) => (v + 0.5) / 64);
  const INK = [17, 17, 17], PAPER = [242, 242, 238];
  const paletteOf = (levels) => Array.from({ length: levels }, (_, q) => INK.map((c, k) => Math.round(c + ((PAPER[k] - c) * q) / (levels - 1))));

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const G = (v, a) => (a === undefined ? `rgb(${v | 0},${v | 0},${v | 0})` : `rgba(${v | 0},${v | 0},${v | 0},${a})`);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (r, a, b) => a + (b - a) * r();
  const SERIF = '"Noto Serif TC", "Songti TC", serif';
  function vgrad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, v]) => g.addColorStop(o, G(v)));
    return g;
  }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function line(ctx, x1, y1, x2, y2, v, lw = 1, a) {
    ctx.strokeStyle = G(v, a);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  function sky(ctx, w, hz, r, top, bottom) {
    ctx.fillStyle = vgrad(ctx, 0, hz, [[0, top], [1, bottom]]);
    ctx.fillRect(0, 0, w, hz + 1);
    for (let i = 0; i < 6; i++) {
      const x = r() * w, y = rand(r, 0.05, 0.7) * hz, rw = rand(r, 0.1, 0.26) * w;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rw);
      g.addColorStop(0, G(248, 0.5));
      g.addColorStop(1, G(248, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rw * 0.36, 0, 0, 7);
      ctx.fill();
    }
  }
  function ridge(ctx, w, base, amp, v, r, rough) {
    ctx.fillStyle = G(v);
    ctx.beginPath();
    ctx.moveTo(0, base);
    let y = base - amp * rand(r, 0.4, 0.9);
    const step = Math.max(2, w / 40);
    for (let x = 0; x <= w + step; x += step) {
      y = Math.min(base - amp * 0.1, Math.max(base - amp, y + (r() - 0.5) * amp * rough));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fill();
  }
  function person(ctx, x, y, s, v) {
    ctx.fillStyle = G(v);
    ctx.fillRect(x - s * 0.22, y - s * 1.7, s * 0.44, s * 1.3);
    ctx.fillRect(x - s * 0.2, y - s * 0.45, s * 0.15, s * 0.45);
    ctx.fillRect(x + s * 0.05, y - s * 0.45, s * 0.15, s * 0.45);
    ctx.beginPath();
    ctx.arc(x, y - s * 1.95, s * 0.27, 0, 7);
    ctx.fill();
  }
  function grainPass(ctx, w, h, r, grain, fade, lift) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * (1 - fade) + lift * fade + (r() - 0.5) * grain;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }
  // 老照片：暗角、刮痕、灰塵、顆粒、褪色
  function photoFinish(ctx, w, h, r, o = {}) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${o.vignette ?? 0.5})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) { const x = r() * w; line(ctx, x, rand(r, 0, 0.4) * h, x + rand(r, -3, 3), rand(r, 0.6, 1) * h, 250, 0.6, rand(r, 0.25, 0.55)); }
    for (let i = 0; i < (w * h) / 700; i++) {
      ctx.fillStyle = r() < 0.5 ? G(16, 0.55) : G(250, 0.65);
      const s = rand(r, 0.5, 1.5);
      ctx.fillRect(r() * w, r() * h, s, s);
    }
    grainPass(ctx, w, h, r, o.grain ?? 26, 0.1, 140);
  }
  // 紙本：水漬、邊緣泛黃、纖維顆粒
  function paperFinish(ctx, w, h, r, o = {}) {
    for (let i = 0; i < (o.stains ?? 2); i++) {
      const x = r() * w, y = r() * h, rad = rand(r, 0.06, 0.16) * w;
      const g = ctx.createRadialGradient(x, y, rad * 0.5, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,0.03)');
      g.addColorStop(0.9, 'rgba(0,0,0,0.1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 7);
      ctx.fill();
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${o.vignette ?? 0.22})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    grainPass(ctx, w, h, r, o.grain ?? 9, 0, 0);
  }

  const SCENES = {
    hall: { label: '建築照片', kind: 'photo', draw(ctx, w, h, r) {
      const hz = h * 0.8;
      sky(ctx, w, hz, r, 158, 224);
      ctx.fillStyle = vgrad(ctx, hz, h, [[0, 150], [1, 96]]);
      ctx.fillRect(0, hz, w, h - hz);
      for (let i = -8; i <= 8; i++) line(ctx, w / 2 + i * w * 0.03, hz, w / 2 + i * w * 0.2, h, 120, 0.8, 0.5);
      const cx = w / 2 + rand(r, -0.03, 0.03) * w, bw = w * 0.84, bx = cx - bw / 2, top = h * 0.5, base = hz, bh = base - top;
      ctx.fillStyle = vgrad(ctx, top, base, [[0, 208], [1, 184]]);
      ctx.fillRect(bx, top, bw, bh);
      ctx.fillStyle = G(140, 0.5);
      ctx.fillRect(cx + bw * 0.36, top, bw * 0.14, bh);
      ctx.fillStyle = G(234);
      ctx.fillRect(bx - 3, top - 5, bw + 6, 4);
      line(ctx, bx - 3, top - 1, bx + bw + 3, top - 1, 70, 1.4);
      const cols = 16, cw = bw / cols;
      for (let row = 0; row < 2; row++) {
        const wy = top + bh * (0.16 + row * 0.42), wh = bh * 0.24;
        for (let c = 0; c < cols; c++) {
          const x = bx + c * cw + cw * 0.3;
          if (Math.abs(x + cw * 0.2 - cx) < bw * 0.2) continue;
          ctx.fillStyle = G(46);
          ctx.fillRect(x, wy, cw * 0.42, wh);
          ctx.fillStyle = G(140);
          ctx.fillRect(x, wy + wh * 0.45, cw * 0.42, Math.max(1, wh * 0.06));
          ctx.fillStyle = G(238);
          ctx.fillRect(x - 1, wy + wh, cw * 0.42 + 2, Math.max(1, bh * 0.025));
        }
      }
      const pw = bw * 0.36, p0 = cx - pw / 2, ptop = top - bh * 0.1, colTop = ptop + (base - ptop) * 0.2;
      ctx.fillStyle = G(58);
      ctx.fillRect(p0, ptop, pw, base - ptop);
      for (let i = 0; i < 6; i++) {
        const x = p0 + (pw * (i + 0.5)) / 6 - pw * 0.032;
        ctx.fillStyle = G(240);
        ctx.fillRect(x, colTop, pw * 0.064, base - colTop);
        ctx.fillStyle = G(172);
        ctx.fillRect(x + pw * 0.042, colTop, pw * 0.022, base - colTop);
      }
      ctx.fillStyle = G(216);
      ctx.fillRect(p0 - 4, ptop + (base - ptop) * 0.1, pw + 8, (base - ptop) * 0.1);
      poly(ctx, [[p0 - 6, ptop + (base - ptop) * 0.11], [cx, ptop - bh * 0.34], [p0 + pw + 6, ptop + (base - ptop) * 0.11]], G(228), G(80), 1.2);
      ctx.fillStyle = G(110);
      ctx.beginPath();
      ctx.arc(cx, ptop - bh * 0.1, bh * 0.05, 0, 7);
      ctx.fill();
      const tw = bw * 0.1, ttop = h * 0.11, tb = ptop - bh * 0.3;
      ctx.fillStyle = G(214);
      ctx.fillRect(cx - tw / 2, ttop + tw * 0.55, tw, tb - ttop);
      ctx.fillStyle = G(156, 0.8);
      ctx.fillRect(cx + tw * 0.18, ttop + tw * 0.55, tw * 0.32, tb - ttop);
      const ccy = ttop + tw * 1.3;
      ctx.fillStyle = G(244);
      ctx.beginPath();
      ctx.arc(cx, ccy, tw * 0.3, 0, 7);
      ctx.fill();
      ctx.strokeStyle = G(40);
      ctx.lineWidth = 1;
      ctx.stroke();
      line(ctx, cx, ccy, cx, ccy - tw * 0.22, 30, 1);
      line(ctx, cx, ccy, cx + tw * 0.15, ccy + tw * 0.05, 30, 1);
      ctx.fillStyle = G(52);
      ctx.fillRect(cx - tw * 0.2, ccy + tw * 0.5, tw * 0.4, tw * 0.7);
      poly(ctx, [[cx - tw * 0.65, ttop + tw * 0.6], [cx, ttop - tw * 0.35], [cx + tw * 0.65, ttop + tw * 0.6]], G(88));
      line(ctx, cx, ttop - tw * 0.35, cx, ttop - tw * 1.1, 40, 0.8);
      ctx.fillStyle = G(70);
      ctx.fillRect(cx, ttop - tw * 1.1, tw * 0.4, tw * 0.24);
      for (let i = 0; i < 6; i++) {
        const sw = pw + 10 + i * 8, sh = (h - base) * 0.045;
        ctx.fillStyle = G(i % 2 ? 166 : 208);
        ctx.fillRect(cx - sw / 2, base + i * sh, sw, sh);
      }
      const palm = (x, s) => {
        const tx = x + s * 0.1, ty = hz - s;
        ctx.strokeStyle = G(52);
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath();
        ctx.moveTo(x, hz + s * 0.04);
        ctx.quadraticCurveTo(x + s * 0.02, hz - s * 0.5, tx, ty);
        ctx.stroke();
        ctx.strokeStyle = G(32);
        ctx.lineWidth = Math.max(1, s * 0.03);
        for (let k = 0; k < 9; k++) {
          const a = -Math.PI / 2 + (k - 4) * 0.36 + rand(r, -0.1, 0.1), L = s * rand(r, 0.32, 0.44);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.7, ty + Math.sin(a) * L * 0.9, tx + Math.cos(a) * L * 1.2, ty + Math.sin(a) * L * 0.5 + L * 0.45);
          ctx.stroke();
        }
      };
      palm(w * 0.05, h * 0.44); palm(w * 0.14, h * 0.36); palm(w * 0.87, h * 0.4); palm(w * 0.95, h * 0.32);
      for (let i = 0; i < 16; i++) { const y = hz + rand(r, 0.15, 0.95) * (h - hz); person(ctx, rand(r, 0.06, 0.94) * w, y, 1.6 + ((y - hz) / (h - hz)) * 4.5, rand(r, 25, 70)); }
      const carX = w * rand(r, 0.18, 0.3), carY = h * 0.95, cs = w * 0.07;
      ctx.fillStyle = G(28);
      ctx.fillRect(carX, carY - cs * 0.32, cs * 1.4, cs * 0.22);
      ctx.fillRect(carX + cs * 0.3, carY - cs * 0.5, cs * 0.7, cs * 0.2);
      ctx.fillStyle = G(14);
      [0.28, 1.1].forEach((k) => { ctx.beginPath(); ctx.arc(carX + cs * k, carY - cs * 0.1, cs * 0.12, 0, 7); ctx.fill(); });
      photoFinish(ctx, w, h, r);
    } },

    harbor: { label: '港口照片', kind: 'photo', draw(ctx, w, h, r) {
      const hz = h * 0.52;
      sky(ctx, w, hz, r, 166, 228);
      ridge(ctx, w, hz, h * 0.16, 196, r, 0.6);
      ridge(ctx, w, hz, h * 0.08, 166, r, 0.5);
      ctx.fillStyle = vgrad(ctx, hz, h, [[0, 206], [1, 110]]);
      ctx.fillRect(0, hz, w, h - hz);
      for (let i = 0; i < (w * h) / 55; i++) {
        const t = Math.pow(r(), 1.5), y = hz + t * (h - hz);
        ctx.fillStyle = r() < 0.5 ? G(234, 0.55) : G(80, 0.45);
        ctx.fillRect(r() * w, y, 1 + t * w * 0.05, Math.max(1, t * 1.6));
      }
      for (let x = w * 0.56; x < w;) {
        const ww = rand(r, 0.07, 0.12) * w, wh = rand(r, 0.06, 0.1) * h, teeth = Math.max(2, Math.round(ww / (w * 0.025)));
        ctx.fillStyle = G(rand(r, 150, 192));
        ctx.fillRect(x, hz - wh, ww, wh + 2);
        for (let k = 0; k < teeth; k++) poly(ctx, [[x + (k * ww) / teeth, hz - wh], [x + ((k + 1) * ww) / teeth, hz - wh], [x + ((k + 1) * ww) / teeth, hz - wh - h * 0.022]], G(88));
        ctx.fillStyle = G(56);
        ctx.fillRect(x + ww * 0.3, hz - wh * 0.6, ww * 0.25, wh * 0.6);
        x += ww + 1;
      }
      const crane = (c0, s) => {
        const b = hz + 2;
        line(ctx, c0, b, c0 + s * 0.14, b - s * 0.72, 40, 1.4);
        line(ctx, c0 + s * 0.28, b, c0 + s * 0.14, b - s * 0.72, 40, 1.4);
        for (let k = 1; k < 5; k++) { const yy = b - (s * 0.72 * k) / 5; line(ctx, c0 + (s * 0.14 * k) / 5, yy, c0 + s * 0.28 - (s * 0.14 * k) / 5, yy, 50, 0.8); }
        ctx.fillStyle = G(45);
        ctx.fillRect(c0 + s * 0.08, b - s * 0.82, s * 0.14, s * 0.12);
        line(ctx, c0 + s * 0.14, b - s * 0.78, c0 - s * 0.55, b - s * 1.02, 35, 1.6);
        line(ctx, c0 - s * 0.5, b - s * 1.0, c0 - s * 0.5, b - s * 0.45, 60, 0.6);
        line(ctx, c0 + s * 0.2, b - s * 0.8, c0 + s * 0.45, b - s * 0.7, 40, 1.2);
      };
      crane(w * 0.66, h * 0.34);
      crane(w * 0.82, h * 0.3);
      const ship = (sx, sy, s) => {
        poly(ctx, [[sx, sy], [sx + s, sy], [sx + s * 1.1, sy - s * 0.15], [sx - s * 0.05, sy - s * 0.15]], G(36));
        ctx.fillStyle = G(224);
        ctx.fillRect(sx + s * 0.6, sy - s * 0.28, s * 0.28, s * 0.13);
        ctx.fillStyle = G(60);
        ctx.fillRect(sx + s * 0.66, sy - s * 0.25, s * 0.2, s * 0.035);
        ctx.fillStyle = G(70);
        ctx.fillRect(sx + s * 0.45, sy - s * 0.4, s * 0.08, s * 0.25);
        line(ctx, sx + s * 0.2, sy - s * 0.15, sx + s * 0.2, sy - s * 0.5, 40, 1);
        line(ctx, sx + s * 0.2, sy - s * 0.5, sx + s * 1.05, sy - s * 0.16, 60, 0.5);
        line(ctx, sx + s * 0.2, sy - s * 0.5, sx - s * 0.04, sy - s * 0.16, 60, 0.5);
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = G(120, 0.2);
          ctx.beginPath();
          ctx.ellipse(sx + s * (0.48 - k * 0.1), sy - s * (0.45 + k * 0.06), s * (0.05 + k * 0.03), s * (0.035 + k * 0.015), 0, 0, 7);
          ctx.fill();
        }
        for (let k = 0; k < 8; k++) { ctx.fillStyle = G(45, 0.3); ctx.fillRect(sx + r() * s, sy + 1 + k * s * 0.03, s * rand(r, 0.1, 0.3), Math.max(1, s * 0.015)); }
      };
      ship(w * 0.08, hz + h * 0.2, w * 0.34);
      ship(w * 0.45, hz + h * 0.07, w * 0.14);
      poly(ctx, [[w * 0.52, h], [w * 0.62, h * 0.8], [w, h * 0.8], [w, h]], G(76));
      line(ctx, w * 0.62, h * 0.8, w, h * 0.8, 170, 1.2);
      for (let k = 0; k < 4; k++) {
        const bx = w * (0.66 + k * 0.09);
        ctx.fillStyle = G(32);
        ctx.fillRect(bx, h * 0.77, w * 0.016, h * 0.03);
        ctx.fillStyle = G(150);
        ctx.fillRect(bx - 1, h * 0.766, w * 0.016 + 2, h * 0.008);
      }
      photoFinish(ctx, w, h, r);
    } },

    street: { label: '街景照片', kind: 'photo', draw(ctx, w, h, r) {
      const vx = w * rand(r, 0.46, 0.56), vy = h * 0.45;
      ctx.fillStyle = vgrad(ctx, 0, vy, [[0, 198], [1, 232]]);
      ctx.fillRect(0, 0, w, h);
      poly(ctx, [[0, h], [w, h], [vx + 2, vy], [vx - 2, vy]], vgrad(ctx, vy, h, [[0, 198], [1, 126]]));
      const side = (sign) => {
        const X = (t) => (sign < 0 ? lerp(0, vx, t) : lerp(w, vx, t));
        const yb = (t) => lerp(h * (sign < 0 ? 0.9 : 0.94), vy + h * 0.015, t);
        const yt = (t) => lerp(sign < 0 ? -h * 0.06 : -h * 0.12, vy - h * 0.07, t);
        const P = (t, f) => [X(t), lerp(yb(t), yt(t), f)];
        const ts = [];
        for (let i = 0; i < 16; i++) ts.push(1 - 1 / (1 + i * 0.5));
        for (let i = 0; i < ts.length - 1; i++) {
          const a = ts[i], b = ts[i + 1], span = b - a;
          poly(ctx, [P(a, 0), P(b, 0), P(b, 1), P(a, 1)], G(sign < 0 ? rand(r, 186, 222) : rand(r, 138, 176)));
          poly(ctx, [P(a + span * 0.08, 0), P(b - span * 0.08, 0), P(b - span * 0.08, 0.3), P(a + span * 0.08, 0.3)], G(sign < 0 ? 50 : 38));
          poly(ctx, [P(a + span * 0.22, 0.43), P(b - span * 0.22, 0.43), P(b - span * 0.22, 0.6), P(a + span * 0.22, 0.6)], G(68));
          poly(ctx, [P(a + span * 0.22, 0.7), P(b - span * 0.22, 0.7), P(b - span * 0.22, 0.85), P(a + span * 0.22, 0.85)], G(76));
          line(ctx, ...P(a, 0), ...P(a, 1), 108, 0.6);
          if (r() < 0.7) {
            const m = (a + b) / 2, [sx, s1] = P(m, 0.84), [, s2] = P(m, 0.4);
            const sw = Math.max(1.5, (1 - m) * w * 0.03) * (sign < 0 ? 1 : -1);
            poly(ctx, [[sx, s1], [sx + sw, s1], [sx + sw, s2], [sx, s2]], G(238), G(60), 0.6);
            for (let k = 0; k < 3; k++) { ctx.fillStyle = G(60); ctx.fillRect(Math.min(sx, sx + sw) + Math.abs(sw) * 0.25, lerp(s1, s2, 0.2 + k * 0.25), Math.abs(sw) * 0.5, Math.max(1, (s2 - s1) * -0.12)); }
          }
        }
      };
      side(-1);
      side(1);
      const poles = [];
      for (let i = 0; i < 6; i++) {
        const t = 1 - 1 / (1 + i * 0.55 + 0.2), x = lerp(w * 0.14, vx, t), yb = lerp(h * 0.97, vy + h * 0.02, t), ht = (1 - t) * h * 0.78;
        line(ctx, x, yb, x, yb - ht, 34, Math.max(1, (1 - t) * 3));
        line(ctx, x - (1 - t) * w * 0.03, yb - ht * 0.92, x + (1 - t) * w * 0.03, yb - ht * 0.92, 34, Math.max(0.6, (1 - t) * 1.5));
        poles.push([x, yb - ht * 0.92]);
      }
      ctx.strokeStyle = G(40, 0.8);
      ctx.lineWidth = 0.7;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        poles.forEach(([x, y], i) => {
          const yy = y + k * 2;
          if (!i) { ctx.moveTo(x + k * 3, yy); return; }
          const [px, py] = poles[i - 1];
          ctx.quadraticCurveTo((px + x) / 2, (py + yy) / 2 + 6, x, yy);
        });
        ctx.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const t = Math.pow(r(), 0.7) * 0.85, y = lerp(h * 0.98, vy + h * 0.02, t);
        person(ctx, vx + rand(r, -1, 1) * lerp(w * 0.42, w * 0.02, t), y, (1 - t) * h * 0.05 + 0.8, rand(r, 20, 80));
      }
      photoFinish(ctx, w, h, r);
    } },

    saltfield: { label: '鹽田照片', kind: 'photo', draw(ctx, w, h, r) {
      const hz = h * 0.42, vx = w * rand(r, 0.4, 0.6);
      sky(ctx, w, hz, r, 176, 238);
      for (let x = 0; x < w;) {
        const bw = rand(r, 0.02, 0.06) * w, bh = rand(r, 0.01, 0.035) * h;
        ctx.fillStyle = G(rand(r, 118, 160));
        ctx.fillRect(x, hz - bh, bw, bh + 1);
        x += bw + rand(r, 0, 0.08) * w;
      }
      ctx.fillStyle = G(96);
      ctx.fillRect(w * 0.78, hz - h * 0.12, w * 0.012, h * 0.12);
      ctx.fillStyle = G(150, 0.3);
      ctx.beginPath();
      ctx.ellipse(w * 0.8, hz - h * 0.15, w * 0.05, h * 0.02, -0.2, 0, 7);
      ctx.fill();
      const rows = 12, ys = [], cols = 11, xb = [];
      for (let k = 0; k <= rows; k++) ys.push(hz + (h - hz) * Math.pow(k / rows, 1.8));
      for (let j = 0; j <= cols; j++) xb.push(lerp(-w * 0.9, w * 1.9, j / cols));
      const xAt = (j, y) => vx + ((xb[j] - vx) * (y - hz)) / (h - hz);
      for (let k = 0; k < rows; k++) for (let j = 0; j < cols; j++) {
        const y0 = ys[k], y1 = ys[k + 1];
        poly(ctx, [[xAt(j, y0), y0], [xAt(j + 1, y0), y0], [xAt(j + 1, y1), y1], [xAt(j, y1), y1]], G(rand(r, 192, 244)));
      }
      ctx.strokeStyle = G(94);
      for (let k = 1; k <= rows; k++) { ctx.lineWidth = 0.4 + (k / rows) * 1.6; ctx.beginPath(); ctx.moveTo(0, ys[k]); ctx.lineTo(w, ys[k]); ctx.stroke(); }
      ctx.lineWidth = 1;
      for (let j = 0; j <= cols; j++) { ctx.beginPath(); ctx.moveTo(xAt(j, hz), hz); ctx.lineTo(xAt(j, h), h); ctx.stroke(); }
      for (let k = 2; k < rows - 1; k++) {
        if (r() < 0.45) continue;
        const y = (ys[k] + ys[k + 1]) / 2, s = (y - hz) / (h - hz);
        for (let n = 0; n < 3; n++) {
          const x = rand(r, 0.05, 0.95) * w, bw = s * w * 0.07 + 1, bh = bw * 0.55;
          poly(ctx, [[x - bw, y], [x, y - bh], [x, y]], G(250));
          poly(ctx, [[x, y - bh], [x + bw, y], [x, y]], G(160));
        }
      }
      for (let i = 0; i < 6; i++) {
        const k = 3 + Math.floor(r() * (rows - 5)), y = ys[k] + (ys[k + 1] - ys[k]) * 0.6, s = ((y - hz) / (h - hz)) * h * 0.06 + 0.6, x = rand(r, 0.1, 0.9) * w;
        person(ctx, x, y, s, 30);
        line(ctx, x + s * 0.2, y - s * 1.2, x + s * 1.3, y + s * 0.1, 40, Math.max(0.6, s * 0.12));
      }
      photoFinish(ctx, w, h, r, { vignette: 0.45 });
    } },

    bridge: { label: '橋梁照片', kind: 'photo', draw(ctx, w, h, r) {
      const hz = h * 0.5, rb = h * 0.86;
      sky(ctx, w, hz, r, 170, 230);
      ridge(ctx, w, hz, h * 0.2, 202, r, 0.5);
      ridge(ctx, w, hz, h * 0.12, 176, r, 0.6);
      ridge(ctx, w, hz + 2, h * 0.05, 138, r, 0.7);
      ctx.fillStyle = vgrad(ctx, hz, rb, [[0, 214], [1, 174]]);
      ctx.fillRect(0, hz, w, rb - hz);
      for (let i = 0; i < (w * h) / 80; i++) {
        const y = rand(r, hz, rb);
        ctx.fillStyle = r() < 0.5 ? G(238, 0.5) : G(118, 0.35);
        ctx.fillRect(r() * w, y, 1 + ((y - hz) / (rb - hz)) * w * 0.03, 1);
      }
      ctx.fillStyle = G(118);
      ctx.fillRect(0, hz, w, h * 0.022);
      poly(ctx, [[0, rb], [w, rb - h * 0.03], [w, h], [0, h]], G(90));
      for (let i = 0; i < w * 0.8; i++) { const x = r() * w, y = rand(r, rb - h * 0.02, h); line(ctx, x, y, x + rand(r, -1.5, 1.5), y - rand(r, 2, 6), rand(r, 40, 80), 0.6); }
      const deck = h * 0.62, chord = deck - h * 0.13, piers = [-0.06, 0.2, 0.46, 0.72, 0.98].map((t) => t * w);
      piers.forEach((px) => {
        ctx.fillStyle = G(68);
        ctx.fillRect(px - w * 0.012, deck, w * 0.024, rb - deck - h * 0.02);
        ctx.fillStyle = G(68, 0.3);
        ctx.fillRect(px - w * 0.012, rb - h * 0.02, w * 0.024, h * 0.05);
      });
      ctx.strokeStyle = G(36);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < piers.length - 1; i++) {
        const a = piers[i] + w * 0.012, b = piers[i + 1] - w * 0.012, n = 6, p = (b - a) / n;
        ctx.beginPath();
        ctx.moveTo(a + p, chord);
        ctx.lineTo(b - p, chord);
        for (let k = 1; k < n; k++) { ctx.moveTo(a + p * k, deck); ctx.lineTo(a + p * k, chord); }
        for (let k = 0; k < n; k++) {
          if (k < n / 2) { ctx.moveTo(a + p * k, deck); ctx.lineTo(a + p * (k + 1), chord); } else { ctx.moveTo(a + p * k, chord); ctx.lineTo(a + p * (k + 1), deck); }
        }
        ctx.stroke();
      }
      ctx.fillStyle = G(50);
      ctx.fillRect(0, deck, w, Math.max(2, h * 0.018));
      const bx = w * rand(r, 0.3, 0.6), bs = w * 0.07;
      ctx.fillStyle = G(26);
      ctx.fillRect(bx, deck - bs * 0.32, bs, bs * 0.3);
      ctx.fillStyle = G(204);
      for (let k = 0; k < 5; k++) ctx.fillRect(bx + bs * (0.08 + k * 0.18), deck - bs * 0.27, bs * 0.12, bs * 0.1);
      photoFinish(ctx, w, h, r);
    } },

    map: { label: '舊街圖', kind: 'doc', draw(ctx, w, h, r) {
      ctx.fillStyle = G(232);
      ctx.fillRect(0, 0, w, h);
      const m = Math.max(5, w * 0.035);
      ctx.strokeStyle = G(198);
      ctx.lineWidth = 0.5;
      for (let k = 1; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(m + ((w - 2 * m) * k) / 6, m); ctx.lineTo(m + ((w - 2 * m) * k) / 6, h - m);
        ctx.moveTo(m, m + ((h - 2 * m) * k) / 6); ctx.lineTo(w - m, m + ((h - 2 * m) * k) / 6);
        ctx.stroke();
      }
      const step = (w - 2 * m) / 50, coast = [];
      let y = h * rand(r, 0.6, 0.7);
      for (let i = 0; i <= 50; i++) { y = Math.min(h - m * 2, Math.max(h * 0.5, y + (r() - 0.45) * h * 0.025)); coast.push([m + i * step, y]); }
      const coastY = (x) => coast[Math.min(50, Math.max(0, Math.round((x - m) / step)))][1];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(m, h - m);
      coast.forEach(([x, yy]) => ctx.lineTo(x, yy));
      ctx.lineTo(w - m, h - m);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = G(214);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = G(146);
      ctx.lineWidth = 0.6;
      for (let yy = 0; yy < h; yy += 3) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = G(46);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      coast.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
      ctx.stroke();
      const river = [];
      let rx = w * rand(r, 0.56, 0.68);
      for (let yy = m; yy < coastY(rx); yy += h / 40) { rx += (r() - 0.5) * w * 0.03; river.push([rx, yy]); }
      river.push([rx, coastY(rx)]);
      const riverX = (yy) => river[Math.min(river.length - 1, Math.max(0, Math.round((yy - m) / (h / 40))))][0];
      ctx.strokeStyle = G(64);
      ctx.lineWidth = Math.max(3, w * 0.02);
      ctx.beginPath();
      river.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
      ctx.stroke();
      ctx.strokeStyle = G(216);
      ctx.lineWidth = Math.max(1.5, w * 0.013);
      ctx.stroke();
      const blocks = (x0, y0, x1, y1, ang, jit, cell) => {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, W = x1 - x0, H = y1 - y0, cos = Math.cos(ang), sin = Math.sin(ang);
        for (let by = -H / 2; by < H / 2; by += cell * rand(r, 0.85, 1.15)) for (let bx = -W / 2; bx < W / 2; bx += cell * rand(r, 0.9, 1.3)) {
          const gx = cx + bx * cos - by * sin, gy = cy + bx * sin + by * cos;
          if (gy + cell * 0.8 > coastY(gx) || gy < m + 2 || gx < m + 2 || gx > w - m - cell || Math.abs(gx - riverX(gy)) < cell * 0.9) continue;
          const bw = cell * rand(r, 0.55, 0.85), bh = cell * rand(r, 0.5, 0.8), tone = r();
          ctx.save();
          ctx.translate(gx + rand(r, -jit, jit), gy + rand(r, -jit, jit));
          ctx.rotate(ang);
          ctx.fillStyle = tone < 0.1 ? G(64) : G(rand(r, 194, 220));
          ctx.fillRect(0, 0, bw, bh);
          ctx.strokeStyle = G(66);
          ctx.lineWidth = 0.6;
          ctx.strokeRect(0, 0, bw, bh);
          if (tone > 0.88) for (let k = -bh; k < bw; k += 2.5) line(ctx, Math.max(0, k), Math.max(0, -k), Math.min(bw, k + bh), Math.min(bh, bh - (k + bh - Math.min(bw, k + bh))), 70, 0.4);
          ctx.restore();
        }
      };
      blocks(m, h * 0.18, w * 0.5, h * 0.62, 0.22, 1, w * 0.06);
      blocks(w * 0.52, m, w - m, h * 0.6, 0, 0, w * 0.055);
      ctx.setLineDash([5, 3]);
      line(ctx, m, h * 0.2, w - m, h * 0.3, 28, 2);
      ctx.setLineDash([]);
      const fs = Math.max(8, Math.round(w * 0.045));
      ctx.font = `700 ${fs}px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      [['舊城', w * 0.27, h * 0.4], ['北岸', w * 0.78, h * 0.18], ['港埕', w * 0.36, coastY(w * 0.36) - fs * 0.5], ['溪洲', riverX(h * 0.42) + fs * 1.4, h * 0.44]].forEach(([t, x, yy]) => {
        ctx.strokeStyle = G(232);
        ctx.lineWidth = 3;
        ctx.strokeText(t, x, yy);
        ctx.fillStyle = G(22);
        ctx.fillText(t, x, yy);
      });
      const cr = w * 0.05, ccx = w - m - cr * 1.6, ccy = m + cr * 1.6;
      ctx.strokeStyle = G(40);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, 7); ctx.stroke();
      poly(ctx, [[ccx, ccy - cr * 1.3], [ccx + cr * 0.25, ccy], [ccx, ccy + cr * 0.2]], G(30));
      poly(ctx, [[ccx, ccy - cr * 1.3], [ccx - cr * 0.25, ccy], [ccx, ccy + cr * 0.2]], G(230), G(30), 0.6);
      const sb = w * 0.05;
      for (let k = 0; k < 4; k++) { ctx.fillStyle = G(k % 2 ? 232 : 30); ctx.fillRect(m * 1.6 + k * sb, h - m * 2.2, sb, m * 0.45); }
      ctx.strokeStyle = G(30);
      ctx.strokeRect(m * 1.6, h - m * 2.2, sb * 4, m * 0.45);
      const cw = w * 0.3, ch = h * 0.13, cx0 = w - m - cw - m * 0.6, cy0 = h - m - ch - m * 0.6;
      ctx.fillStyle = G(236);
      ctx.fillRect(cx0, cy0, cw, ch);
      ctx.strokeStyle = G(30);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx0, cy0, cw, ch);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx0 + 2, cy0 + 2, cw - 4, ch - 4);
      ctx.fillStyle = G(20);
      ctx.font = `900 ${Math.max(8, Math.round(ch * 0.36))}px ${SERIF}`;
      ctx.fillText('澄港市街圖', cx0 + cw / 2, cy0 + ch * 0.52);
      ctx.font = `${Math.max(6, Math.round(ch * 0.2))}px ${SERIF}`;
      ctx.fillText('民國四十一年・一萬分之一', cx0 + cw / 2, cy0 + ch * 0.84);
      ctx.strokeStyle = G(30);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(m - 2, m - 2, w - 2 * m + 4, h - 2 * m + 4);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(m - 5, m - 5, w - 2 * m + 10, h - 2 * m + 10);
      paperFinish(ctx, w, h, r);
    } },

    manuscript: { label: '稿紙手稿', kind: 'doc', draw(ctx, w, h, r) {
      ctx.fillStyle = G(224);
      ctx.fillRect(0, 0, w, h);
      // 小縮圖時減少格數，讓字跡筆畫在抖色後仍看得出來
      const m = w * 0.07, cols = Math.max(8, Math.min(w > h ? 24 : 16, Math.round(w / 10))), cw = (w - 2 * m) / cols, top = m * 1.3;
      const rows = Math.max(6, Math.floor((h - top - m) / cw));
      ctx.strokeStyle = G(112);
      ctx.lineWidth = 1;
      ctx.strokeRect(m, top, cw * cols, cw * rows);
      for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(m + c * cw, top); ctx.lineTo(m + c * cw, top + rows * cw); ctx.stroke(); }
      ctx.lineWidth = 0.5;
      for (let k = 1; k < rows; k++) { ctx.beginPath(); ctx.moveTo(m, top + k * cw); ctx.lineTo(m + cols * cw, top + k * cw); ctx.stroke(); }
      const mid = Math.floor(cols / 2);
      ctx.fillStyle = G(210);
      ctx.fillRect(m + mid * cw, top, cw, rows * cw);
      ctx.font = `${Math.max(6, Math.round(cw * 0.72))}px ${SERIF}`;
      ctx.fillStyle = G(108);
      ctx.textAlign = 'center';
      '澄港市議會議事錄'.split('').slice(0, rows - 1).forEach((ch, i) => ctx.fillText(ch, m + mid * cw + cw / 2, top + cw * (i + 0.85)));
      ctx.lineCap = 'round';
      for (let c = cols - 1; c >= 0; c--) {
        if (c === mid) continue;
        const n = r() < 0.15 ? Math.floor(r() * rows * 0.4) : Math.floor(rows * rand(r, 0.55, 1));
        const start = r() < 0.2 ? 2 : 0;
        for (let k = start; k < n; k++) {
          const x0 = m + c * cw, y0 = top + k * cw, strokes = 3 + Math.floor(r() * 4);
          ctx.strokeStyle = G(rand(r, 8, 44));
          ctx.lineWidth = Math.max(1, cw * 0.14);
          for (let s = 0; s < strokes; s++) {
            const ax = x0 + cw * rand(r, 0.18, 0.82), ay = y0 + cw * rand(r, 0.18, 0.82), hor = r() < 0.5, len = cw * rand(r, 0.2, 0.55);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + (hor ? len : rand(r, -0.1, 0.1) * cw), ay + (hor ? rand(r, -0.08, 0.08) * cw : len));
            ctx.stroke();
          }
        }
        if (r() < 0.12 && n > 2) { const k = Math.floor(r() * (n - 2)); line(ctx, m + c * cw + cw * 0.5, top + k * cw, m + c * cw + cw * 0.5, top + (k + 2) * cw, 30, cw * 0.12); }
      }
      const ss = cw * 3, sx = m + cw * 0.5, sy = top + rows * cw - ss - cw * 0.6;
      ctx.strokeStyle = G(92);
      ctx.lineWidth = cw * 0.25;
      ctx.strokeRect(sx, sy, ss, ss);
      ctx.fillStyle = G(92);
      for (let k = 0; k < 9; k++) ctx.fillRect(sx + ss * rand(r, 0.15, 0.7), sy + ss * rand(r, 0.15, 0.7), ss * rand(r, 0.08, 0.2), ss * rand(r, 0.04, 0.1));
      ctx.strokeStyle = G(150, 0.5);
      ctx.lineWidth = w * 0.006;
      ctx.beginPath();
      ctx.arc(w * rand(r, 0.55, 0.85), h * rand(r, 0.55, 0.85), w * 0.08, 0, 5.6);
      ctx.stroke();
      line(ctx, w * 0.5, 0, w * 0.5, h, 250, 1, 0.6);
      line(ctx, w * 0.5 + 1, 0, w * 0.5 + 1, h, 150, 1, 0.4);
      paperFinish(ctx, w, h, r);
    } },

    letter: { label: '公文', kind: 'doc', draw(ctx, w, h, r) {
      ctx.fillStyle = G(234);
      ctx.fillRect(0, 0, w, h);
      const m = w * 0.09;
      ctx.textAlign = 'center';
      ctx.fillStyle = G(26);
      ctx.font = `900 ${Math.max(9, Math.round(w * 0.065))}px ${SERIF}`;
      ctx.fillText('澄港市政府　函', w / 2, h * 0.1 + w * 0.04);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = G(80); ctx.fillRect(w * 0.58, h * 0.16 + k * h * 0.025, w * rand(r, 0.18, 0.3), Math.max(1, h * 0.009)); }
      line(ctx, m, h * 0.27, w - m, h * 0.27, 60, 1);
      ctx.fillStyle = G(36);
      ctx.fillRect(m, h * 0.3, w * 0.1, h * 0.016);
      for (let x = m + w * 0.12; x < w - m * 1.5;) { const ww = rand(r, 0.02, 0.06) * w; ctx.fillRect(x, h * 0.3, ww, h * 0.016); x += ww + w * 0.01; }
      for (let y = h * 0.36; y < h * 0.8; y += h * 0.042) {
        const end = w - m - (r() < 0.3 ? rand(r, 0.1, 0.4) * w : 0);
        for (let x = m + (r() < 0.25 ? w * 0.05 : 0); x < end;) {
          const ww = rand(r, 0.015, 0.06) * w;
          ctx.fillStyle = G(rand(r, 46, 96));
          ctx.fillRect(x, y, Math.min(ww, end - x), Math.max(1, h * 0.012));
          x += ww + w * 0.008;
        }
      }
      const cx = w * 0.74, cy = h * 0.86, rad = w * 0.09;
      ctx.strokeStyle = G(88);
      ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.stroke();
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(cx, cy, rad * 0.72, 0, 7); ctx.stroke();
      ctx.font = `700 ${Math.max(6, Math.round(rad * 0.45))}px ${SERIF}`;
      ctx.fillStyle = G(88);
      ctx.fillText('收文', cx, cy + rad * 0.16);
      ctx.strokeStyle = G(28);
      ctx.lineWidth = Math.max(0.8, w * 0.006);
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.88);
      for (let k = 0; k < 8; k++) ctx.quadraticCurveTo(w * (0.22 + k * 0.03), h * (0.84 + (k % 2) * 0.08), w * (0.235 + k * 0.03), h * 0.88);
      ctx.stroke();
      paperFinish(ctx, w, h, r);
    } },

    ledger: { label: '簿冊', kind: 'doc', draw(ctx, w, h, r) {
      ctx.fillStyle = G(228);
      ctx.fillRect(0, 0, w, h);
      const m = w * 0.06, top = h * 0.14, rowH = Math.max(6, h * 0.055), colW = [0.08, 0.2, 0.16, 0.2, 0.16, 0.2];
      ctx.fillStyle = G(30);
      ctx.textAlign = 'left';
      ctx.font = `700 ${Math.max(8, Math.round(w * 0.045))}px ${SERIF}`;
      ctx.fillText('清　冊', m, top - h * 0.035);
      const xs = [m];
      colW.forEach((c) => xs.push(xs[xs.length - 1] + c * (w - 2 * m)));
      ctx.fillStyle = G(204);
      ctx.fillRect(m, top, w - 2 * m, rowH * 1.2);
      const y0 = top + rowH * 1.2, rowsN = Math.floor((h * 0.93 - y0) / rowH);
      for (let k = 0; k <= rowsN; k++) line(ctx, m, y0 + k * rowH, w - m, y0 + k * rowH, 80, k ? 0.8 : 1.4);
      line(ctx, m, top, w - m, top, 60, 1.2);
      xs.forEach((x) => line(ctx, x, top, x, y0 + rowsN * rowH, 80, 0.9));
      for (let c = 0; c < colW.length; c++) { ctx.fillStyle = G(50); ctx.fillRect(xs[c] + (xs[c + 1] - xs[c]) * 0.25, top + rowH * 0.45, (xs[c + 1] - xs[c]) * 0.5, Math.max(1, rowH * 0.25)); }
      const filled = rowsN - Math.floor(r() * 3);
      ctx.lineCap = 'round';
      for (let k = 0; k < filled; k++) for (let c = 0; c < colW.length; c++) {
        if (r() < 0.08) continue;
        const cx0 = xs[c] + 2, cw = (xs[c + 1] - xs[c]) * rand(r, 0.4, 0.85) - 4, cy = y0 + k * rowH + rowH * 0.55;
        ctx.strokeStyle = G(rand(r, 24, 70));
        ctx.lineWidth = Math.max(0.9, rowH * 0.11);
        ctx.beginPath();
        ctx.moveTo(cx0, cy);
        for (let x = cx0; x < cx0 + cw; x += rowH * 0.3) ctx.lineTo(x, cy + rand(r, -0.22, 0.22) * rowH);
        ctx.stroke();
      }
      const sk = Math.floor(r() * filled), sc = 4 + Math.floor(r() * 2), ss = rowH * 0.85;
      ctx.strokeStyle = G(96);
      ctx.lineWidth = Math.max(1, ss * 0.12);
      ctx.strokeRect(xs[sc] + rowH * 0.4, y0 + sk * rowH + rowH * 0.08, ss, ss);
      paperFinish(ctx, w, h, r);
    } },

    blueprint: { label: '工程圖', kind: 'doc', draw(ctx, w, h, r) {
      ctx.fillStyle = G(238);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = G(216);
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += w / 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += w / 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const gy = h * 0.7;
      line(ctx, w * 0.06, gy, w * 0.94, gy, 28, 1.4);
      for (let x = w * 0.06; x < w * 0.94; x += 4) line(ctx, x, gy + 1, x - 4, gy + 6, 96, 0.5);
      ctx.strokeStyle = G(36);
      ctx.lineWidth = 1;
      if (r() < 0.5) {
        const bx = w * 0.14, bw = w * 0.72, bt = gy - h * 0.3;
        ctx.strokeRect(bx, bt, bw, gy - bt);
        for (let row = 0; row < 2; row++) for (let c = 0; c < 12; c++) {
          const x = bx + (bw * (c + 0.3)) / 12;
          if (c >= 4 && c <= 7) continue;
          ctx.strokeRect(x, bt + (gy - bt) * (0.15 + row * 0.42), bw / 12 * 0.4, (gy - bt) * 0.25);
        }
        const p0 = bx + bw * (4 / 12), pw = bw * (4 / 12);
        for (let k = 0; k <= 6; k++) line(ctx, p0 + (pw * k) / 6, bt + (gy - bt) * 0.18, p0 + (pw * k) / 6, gy, 36, 0.8);
        poly(ctx, [[p0 - 4, bt], [p0 + pw / 2, bt - h * 0.1], [p0 + pw + 4, bt]], null, G(36), 1);
        ctx.strokeRect(p0 + pw * 0.4, bt - h * 0.28, pw * 0.2, h * 0.18);
        poly(ctx, [[p0 + pw * 0.36, bt - h * 0.28], [p0 + pw / 2, bt - h * 0.36], [p0 + pw * 0.64, bt - h * 0.28]], null, G(36), 1);
      } else {
        const deck = gy - h * 0.18, chord = deck - h * 0.14;
        line(ctx, w * 0.06, deck, w * 0.94, deck, 30, 1.6);
        line(ctx, w * 0.12, chord, w * 0.88, chord, 30, 1.2);
        for (let k = 0; k <= 10; k++) {
          const x = w * 0.12 + (w * 0.76 * k) / 10;
          line(ctx, x, deck, x, chord, 40, 0.8);
          if (k < 10) line(ctx, x, k < 5 ? deck : chord, x + (w * 0.76) / 10, k < 5 ? chord : deck, 40, 0.8);
        }
        [0.12, 0.5, 0.88].forEach((t) => ctx.strokeRect(w * t - w * 0.015, deck, w * 0.03, gy - deck + h * 0.06));
        ctx.setLineDash([4, 3]);
        line(ctx, w * 0.06, gy - h * 0.05, w * 0.94, gy - h * 0.05, 90, 0.7);
        ctx.setLineDash([]);
      }
      const dy = gy + h * 0.09;
      line(ctx, w * 0.14, dy, w * 0.86, dy, 40, 0.7);
      [w * 0.14, w * 0.86].forEach((x) => line(ctx, x, dy - 4, x, dy + 4, 40, 0.7));
      ctx.fillStyle = G(30);
      ctx.textAlign = 'center';
      ctx.font = `${Math.max(6, Math.round(w * 0.028))}px "IBM Plex Mono", monospace`;
      ctx.fillText(`${(rand(r, 42, 96)).toFixed(2)} m`, w / 2, dy - 3);
      const tx = w * 0.58, ty = h * 0.84, tw = w * 0.36, th = h * 0.11;
      ctx.strokeStyle = G(30);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(tx, ty, tw, th);
      line(ctx, tx, ty + th * 0.55, tx + tw, ty + th * 0.55, 30, 0.6);
      line(ctx, tx + tw * 0.65, ty + th * 0.55, tx + tw * 0.65, ty + th, 30, 0.6);
      ctx.font = `700 ${Math.max(7, Math.round(th * 0.32))}px ${SERIF}`;
      ctx.fillText('正立面圖', tx + tw / 2, ty + th * 0.42);
      ctx.font = `${Math.max(6, Math.round(th * 0.26))}px "IBM Plex Mono", monospace`;
      ctx.fillText('S=1/200', tx + tw * 0.32, ty + th * 0.88);
      paperFinish(ctx, w, h, r, { stains: 1, vignette: 0.12 });
    } },
  };
  dither.SCENES = Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [k, v.label]));
  dither.sceneOf = (item) => ({ scene: item.scene, seed: item.seed });
  // 照片保留中間調、文件拉高對比讓字跡乾淨
  const TONE = { photo: { contrast: 1.12, bright: 0 }, doc: { contrast: 1.6, bright: 0.1 } };

  const sourceCache = new Map();
  function getSource(scene, seed, w, h) {
    const key = `${scene}|${seed}|${w}x${h}`;
    if (sourceCache.has(key)) return sourceCache.get(key);
    const c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    SCENES[scene].draw(ctx, w, h, rng(seed * 9973 + 17));
    const d = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
    if (sourceCache.size > 40) sourceCache.delete(sourceCache.keys().next().value);
    sourceCache.set(key, gray);
    return gray;
  }
  function quantize(src, w, h, method, levels, tone) {
    const L = levels - 1, n = w * h, out = new Uint8Array(n), buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.min(1, Math.max(0, (src[i] - 0.5) * tone.contrast + 0.5 + tone.bright));
    if (method === 'bayer') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, v = buf[i] * L, b = Math.floor(v);
        out[i] = Math.min(L, b + (v - b > BAYER8[(y & 7) * 8 + (x & 7)] ? 1 : 0));
      }
      return out;
    }
    const atk = method === 'atkinson';
    for (let y = 0; y < h; y++) {
      const rtl = y & 1, dir = rtl ? -1 : 1;
      for (let k = 0; k < w; k++) {
        const x = rtl ? w - 1 - k : k, i = y * w + x, old = buf[i];
        const q = Math.min(L, Math.max(0, Math.round(old * L)));
        out[i] = q;
        const err = old - q / L;
        const add = (dx, dy, f) => { const xx = x + dx * dir, yy = y + dy; if (xx >= 0 && xx < w && yy < h) buf[yy * w + xx] += err * f; };
        if (atk) { add(1, 0, 0.125); add(2, 0, 0.125); add(-1, 1, 0.125); add(0, 1, 0.125); add(1, 1, 0.125); add(0, 2, 0.125); } else { add(1, 0, 7 / 16); add(-1, 1, 3 / 16); add(0, 1, 5 / 16); add(1, 1, 1 / 16); }
      }
    }
    return out;
  }
  function paint(q, w, h, levels, invert) {
    const c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), pal = paletteOf(levels), L = levels - 1;
    for (let i = 0; i < q.length; i++) {
      const p = pal[invert ? L - q[i] : q[i]];
      img.data[i * 4] = p[0]; img.data[i * 4 + 1] = p[1]; img.data[i * 4 + 2] = p[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  const drawRows = (ctx, src, y, rows, scale) => {
    const hh = Math.min(rows, src.height - y);
    if (hh <= 0) return;
    ctx.drawImage(src, 0, y, src.width, hh, 0, y * scale, src.width * scale, hh * scale);
  };
  // 條帶刷新：由上而下逐帶以反相畫出，最後讓上一張的殘影分三階淡出
  function sweep(canvas, ctx, st, token, low, inv, prev, resolve) {
    const bands = Math.max(6, Math.min(14, Math.round(st.lh / 12))), bh = Math.ceil(st.lh / bands), scale = st.scale;
    let frame = 0, last = -1e9;
    const tick = (t) => {
      if (st.token !== token) { resolve(false); return; }
      const wait = frame <= bands ? 40 : 130;
      if (t - last < wait) { requestAnimationFrame(tick); return; }
      last = t;
      if (frame <= bands) {
        if (prev) drawRows(ctx, prev, 0, st.lh, scale);
        else { ctx.fillStyle = '#F2F2EE'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        drawRows(ctx, low, 0, frame * bh, scale);
        drawRows(ctx, inv, frame * bh, bh, scale);
        frame += 1;
        requestAnimationFrame(tick);
        return;
      }
      const alpha = prev ? [0.34, 0.18, 0.08][frame - bands - 1] : undefined;
      drawRows(ctx, low, 0, st.lh, scale);
      if (alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'multiply';
        drawRows(ctx, prev, 0, st.lh, scale);
        ctx.restore();
        frame += 1;
        requestAnimationFrame(tick);
        return;
      }
      resolve(true);
    };
    requestAnimationFrame(tick);
  }
  const dstate = new WeakMap();
  const tracked = new Set();
  const readOpts = (c) => ({ scene: c.dataset.scene, seed: +(c.dataset.seed || 1), method: c.dataset.method || 'fs', levels: +(c.dataset.levels || 2), px: +(c.dataset.px || 2) });
  dither.render = (canvas, opts = {}) => {
    let st = dstate.get(canvas);
    if (!st) { st = { token: 0, opts: readOpts(canvas) }; dstate.set(canvas, st); }
    const { animate = true, ghost = true, ...rest } = opts;
    Object.assign(st.opts, rest);
    const o = st.opts;
    if (!SCENES[o.scene]) throw new Error('unknown dither scene: ' + o.scene);
    if (!dither.METHODS[o.method]) throw new Error('unknown dither method: ' + o.method);
    if (![2, 4, 16].includes(o.levels)) throw new Error('dither levels must be 2, 4 or 16');
    tracked.add(canvas);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.round(rect.width), cssH = Math.round(rect.height);
    if (!cssW || !cssH) { st.pending = true; return Promise.resolve(false); }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const lw = Math.ceil(cssW / o.px), lh = Math.ceil(cssH / o.px);
    const q = quantize(getSource(o.scene, o.seed, lw, lh), lw, lh, o.method, o.levels, TONE[SCENES[o.scene].kind]);
    const low = paint(q, lw, lh, o.levels, false);
    const prev = ghost && st.low && st.low.width === lw && st.low.height === lh ? st.low : null;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    Object.assign(st, { low, lw, lh, cssW, cssH, scale: o.px * dpr, rendered: true, pending: false });
    const token = ++st.token;
    canvas.dataset.rendered = `${lw}x${lh}`;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (!animate || reduced()) { drawRows(ctx, low, 0, lh, st.scale); return Promise.resolve(true); }
    const inv = paint(q, lw, lh, o.levels, true);
    return new Promise((resolve) => sweep(canvas, ctx, st, token, low, inv, prev, resolve));
  };
  dither.info = (canvas) => { const st = dstate.get(canvas); return st ? { ...st.opts, w: st.lw, h: st.lh } : null; };
  dither.refreshAll = () => tracked.forEach((c) => { if (c.isConnected && dstate.get(c) && dstate.get(c).rendered) dither.render(c, { ghost: false }); });

  // 第一次繪製要等網頁字型（canvas 內的標題字）與開機刷新結束
  const fontsReady = doc.fonts
    ? Promise.race([
      Promise.all([
        doc.fonts.load(`700 16px "Noto Serif TC"`, '澄港市政府函街圖議會舊城港埕北岸溪洲清冊收文正立面民國四十一年一萬分之事錄'),
        doc.fonts.load(`900 16px "Noto Serif TC"`, '澄港市政府函街圖'),
        doc.fonts.load(`400 12px "IBM Plex Mono"`, '0123456789.mS=/'),
      // 網路字型載入失敗時以系統字型繪製（有意降級，不影響其他功能）
      ]).catch(() => null),
      new Promise((res) => setTimeout(res, 1800)),
    ])
    : Promise.resolve();
  const bootDone = new Promise((res) => setTimeout(res, reduced() ? 0 : 520));
  const ready = Promise.all([fontsReady, bootDone]);

  let ditherIO = null, ditherRO = null;
  function bindCanvas(c) {
    if (c._ditherBound) return;
    c._ditherBound = true;
    tracked.add(c);
    if (ditherIO) ditherIO.observe(c);
    else ready.then(() => dither.render(c, { animate: false }));
    if (ditherRO) ditherRO.observe(c);
  }
  function initDither() {
    if ('IntersectionObserver' in window) {
      ditherIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        ditherIO.unobserve(e.target);
        ready.then(() => { const st = dstate.get(e.target); if (!st || !st.rendered) dither.render(e.target); });
      }), { rootMargin: '0px 0px -6% 0px' });
    }
    if ('ResizeObserver' in window) {
      const timers = new WeakMap();
      ditherRO = new ResizeObserver((entries) => entries.forEach((e) => {
        const c = e.target, st = dstate.get(c);
        if (!st || (!st.rendered && !st.pending)) return;
        const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height);
        if (Math.abs(w - st.cssW) < 3 && Math.abs(h - st.cssH) < 3 && !st.pending) return;
        clearTimeout(timers.get(c));
        timers.set(c, setTimeout(() => dither.render(c, { animate: false, ghost: false }), 140));
      }));
    }
    doc.querySelectorAll('canvas[data-scene]').forEach(bindCanvas);
    // 保底：3 秒後仍未進入視窗的影像直接畫好（全頁截圖、列印）
    setTimeout(() => ready.then(() => tracked.forEach((c) => { const st = dstate.get(c); if (c.isConnected && (!st || !st.rendered)) dither.render(c, { animate: false }); })), 3000);
  }

  /* ===================================================================
     Toast / Dialog
     =================================================================== */
  let toastHost = null;
  const openDialogs = [];
  function hostToasts() {
    if (!toastHost) {
      toastHost = doc.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('aria-live', 'polite');
    }
    const target = openDialogs[openDialogs.length - 1] || doc.body;
    if (toastHost.parentNode !== target) target.appendChild(toastHost);
    return toastHost;
  }
  App.toast = (title, { desc = '', tone = 'info', action, duration = 4600 } = {}) => {
    const host = hostToasts();
    const t = doc.createElement('div');
    t.className = `toast toast--${tone}`;
    t.setAttribute('role', 'status');
    t.innerHTML = `<span class="toast__icon">${App.icon(tone === 'ok' ? 'check' : tone === 'warn' ? 'warn' : 'info')}</span><div class="toast__body"><p class="toast__title">${esc(title)}</p>${desc ? `<p class="toast__desc">${esc(desc)}</p>` : ''}</div><div class="toast__side"></div>`;
    const side = t.querySelector('.toast__side');
    let timer;
    const close = () => { clearTimeout(timer); t.classList.add('is-leaving'); setTimeout(() => t.remove(), reduced() ? 0 : 200); };
    if (action) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'toast__action';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.onClick(); close(); });
      side.appendChild(b);
    }
    const x = doc.createElement('button');
    x.type = 'button';
    x.className = 'toast__close';
    x.setAttribute('aria-label', '關閉通知');
    x.innerHTML = App.icon('x', { size: 14 });
    x.addEventListener('click', close);
    side.appendChild(x);
    host.appendChild(t);
    while (host.children.length > 4) host.firstElementChild.remove();
    timer = setTimeout(close, duration);
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    t.addEventListener('mouseleave', () => { timer = setTimeout(close, 1800); });
    return { close };
  };
  App.openDialog = (dlg) => {
    if (dlg.open) return;
    dlg.showModal();
    openDialogs.push(dlg);
    hostToasts();
    if (!dlg._appBound) {
      dlg._appBound = true;
      dlg.addEventListener('close', () => {
        const i = openDialogs.indexOf(dlg);
        if (i >= 0) openDialogs.splice(i, 1);
        if (toastHost) hostToasts();
      });
      // 點背板（dialog 本身）關閉
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    }
  };
  App.closeDialog = (dlg) => { if (dlg.open) dlg.close(); };
  let dialogSeq = 0;
  App.modal = ({ title, code, body, size, actions = [], onClose } = {}) => {
    const id = `modal-title-${++dialogSeq}`;
    const dlg = doc.createElement('dialog');
    dlg.className = 'modal' + (size ? ` modal--${size}` : '');
    dlg.setAttribute('aria-labelledby', id);
    dlg.innerHTML = `<div class="modal__bar"><h2 class="modal__title" id="${id}">${esc(title)}</h2>${code ? `<span class="modal__code">${esc(code)}</span>` : ''}<button class="modal__close" type="button" aria-label="關閉">${App.icon('x', { size: 14 })}</button></div><div class="modal__body"></div>${actions.length ? '<div class="modal__foot"></div>' : ''}`;
    const bodyEl = dlg.querySelector('.modal__body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.appendChild(body);
    const close = () => App.closeDialog(dlg);
    dlg.querySelector('.modal__close').addEventListener('click', close);
    actions.forEach((a) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `btn${a.variant ? ' btn--' + a.variant : ''}`;
      b.innerHTML = `${a.icon ? App.icon(a.icon) : ''}<span>${esc(a.label)}</span>`;
      b.addEventListener('click', () => (a.onClick ? a.onClick(close) : close()));
      dlg.querySelector('.modal__foot').appendChild(b);
    });
    doc.body.appendChild(dlg);
    dlg.addEventListener('close', () => { if (onClose) onClose(); dlg.remove(); }, { once: true });
    App.openDialog(dlg);
    return { el: dlg, body: bodyEl, close };
  };

  /* ===================================================================
     Tabs / Seg
     =================================================================== */
  App.tabs = (list, { onChange } = {}) => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const panelOf = (t) => doc.getElementById(t.getAttribute('aria-controls'));
    const panels = [...new Set(tabs.map(panelOf).filter(Boolean))];
    const select = (i, focus) => {
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      const p = panelOf(tabs[i]);
      panels.forEach((pn) => { pn.hidden = pn !== p; });
      if (p) p.setAttribute('aria-labelledby', tabs[i].id);
      if (focus) tabs[i].focus();
      if (onChange) onChange(i, tabs[i]);
    };
    list.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t && tabs.includes(t)) select(tabs.indexOf(t)); });
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(doc.activeElement);
      if (i < 0) return;
      const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      select((n + tabs.length) % tabs.length, true);
    });
    const init = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    tabs.forEach((t, k) => { t.tabIndex = k === init ? 0 : -1; });
    return { select: (i) => select(i) };
  };
  App.seg = (el, { onChange } = {}) => {
    const btns = [...el.querySelectorAll('button[data-value]')];
    const set = (v, fire) => {
      btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
      if (fire && onChange) onChange(v, btns.find((b) => b.dataset.value === v));
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      set(b.dataset.value, true);
    });
    return { value: () => (btns.find((b) => b.getAttribute('aria-pressed') === 'true') || btns[0]).dataset.value, set: (v) => set(v, false) };
  };

  /* ===================================================================
     座位點陣圖
     =================================================================== */
  const SEAT_STATE = { free: '空位', booked: '已預約', in: '使用中', done: '已離館', off: '停用' };
  App.seatMap = (el, { date = TODAY, slot = 'am', selectable = false, selected = null, onSelect } = {}) => {
    const st = { date, slot, selected };
    const R = App.ROOM;
    el.classList.add('seatmap');
    el.style.setProperty('--cols', R.cols);
    el.style.setProperty('--rows', R.rows);
    el.setAttribute('role', 'group');
    const render = () => {
      const occ = App.occupancy(st.date, st.slot);
      el.setAttribute('aria-label', `第一閱覽室座位圖：${App.fmt.md(st.date)} ${App.SLOTS[st.slot].label}`);
      const area = (x, y, w, h) => `grid-area:${y}/${x}/span ${h}/span ${w}`;
      el.innerHTML = R.blocks.map((b) => `<div class="seatmap__block seatmap__block--${b.kind}" style="${area(b.x, b.y, b.w, b.h)}" aria-hidden="true">${b.label ? `<span>${esc(b.label)}</span>` : ''}</div>`).join('') +
        R.labels.map((l) => `<span class="seatmap__label" style="${area(l.x, l.y, l.w, 1)}" aria-hidden="true">${esc(l.text)}</span>`).join('') +
        `<i class="seatmap__door" style="${area(R.door.x, R.rows, R.door.w, 1)}" aria-hidden="true"></i>` +
        App.SEATS.map((s) => {
          const o = occ[s.id];
          const state = s.off ? 'off' : o ? o.state : 'free';
          const who = o ? `，${o.req.name}（${o.req.id}）` : s.off ? `，${s.off}` : '';
          const pick = selectable && state === 'free';
          return `<button type="button" class="seat" data-seat="${s.id}" data-state="${state}"${pick ? ' data-pick' : ''} style="${area(s.x, s.y, 2, 2)}" aria-pressed="${st.selected === s.id}" aria-label="${s.id} ${App.SEAT_TYPES[s.type]}：${SEAT_STATE[state]}${esc(who)}"${state === 'off' ? ' aria-disabled="true"' : ''}><span>${s.id}</span></button>`;
        }).join('');
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.seat');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      st.selected = b.dataset.seat;
      el.querySelectorAll(':scope > .seat').forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
      if (onSelect) onSelect(st.selected, App.occupancy(st.date, st.slot)[st.selected] || null, App.SEATS.find((s) => s.id === st.selected));
    });
    render();
    return {
      update(o = {}) { Object.assign(st, o); App.eink.refresh(el, render); },
      select(id) { st.selected = id; el.querySelectorAll(':scope > .seat').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.seat === id))); },
      state: () => ({ ...st }),
    };
  };

  /* ===================================================================
     全站檢索
     =================================================================== */
  let palette = null;
  function buildPalette() {
    const dlg = doc.createElement('dialog');
    dlg.className = 'modal palette';
    dlg.setAttribute('aria-label', '全站檢索');
    dlg.innerHTML = `<div class="palette__field">${App.icon('search')}<input class="palette__input" type="search" placeholder="輸入案號、申請人、檔號或題名" aria-label="檢索關鍵字" autocomplete="off"><kbd>Esc</kbd></div><div class="palette__results" role="listbox" aria-label="檢索結果"></div><div class="palette__hint"><span><kbd>↑</kbd><kbd>↓</kbd> 選擇</span><span><kbd>Enter</kbd> 開啟</span><span>案件 ${REQUESTS.length} 件・目錄 ${flatItems.length} 件</span></div>`;
    const input = dlg.querySelector('input');
    const results = dlg.querySelector('.palette__results');
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const reqs = (q ? REQUESTS.filter((r) => [r.id, r.name, r.org, r.reason].join(' ').toLowerCase().includes(q)) : REQUESTS.filter((r) => App.deadline(r)).sort((a, b) => App.deadline(b).elapsed - App.deadline(a).elapsed)).slice(0, 6);
      const items = (q ? App.catalog.search(q) : App.catalog.accessions()).slice(0, 6);
      const row = (href, icon, main, sub, tag) => `<a class="palette__item" role="option" aria-selected="false" href="${href}">${App.icon(icon)}<span class="palette__main">${main}<small>${sub}</small></span>${tag}</a>`;
      results.innerHTML = (reqs.length ? `<p class="palette__group">${q ? '申請案件' : '期限最緊的案件'}</p>` + reqs.map((r) => row(App.requestUrl(r.id), 'request', `<b class="mono">${esc(r.id)}</b> ${esc(r.name)}`, esc(r.reason), App.statusTag(r.status))).join('') : '') +
        (items.length ? `<p class="palette__group">${q ? '檔案目錄' : '近期新增典藏'}</p>` + items.map((it) => row(App.itemUrl(it.id), 'page', esc(it.title), `<span class="mono">${esc(it.id)}</span>・${esc(it.date.slice(0, 4))}`, App.restrictTag(it.restriction))).join('') : '') ||
        App.emptyState({ title: '查無符合項目', text: '請改用案號（如 115-0219）、申請人姓名或檔號檢索。', icon: 'search' });
      const first = results.querySelector(':scope > .palette__item');
      if (first) first.setAttribute('aria-selected', 'true');
    };
    input.addEventListener('input', () => App.eink.refresh(results, render, { invert: false }));
    input.addEventListener('keydown', (e) => {
      // 只取真實結果，排除局部刷新留下的殘影複本
      const items = [...results.querySelectorAll(':scope > .palette__item')];
      const i = items.findIndex((a) => a.getAttribute('aria-selected') === 'true');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((a, k) => a.setAttribute('aria-selected', String(k === n)));
        items[n].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && items[i]) {
        e.preventDefault();
        App.eink.navigate(items[i].getAttribute('href'));
      }
    });
    doc.body.appendChild(dlg);
    dlg._render = render;
    dlg._input = input;
    return dlg;
  }
  App.search = {
    open() {
      if (!palette) palette = buildPalette();
      palette._input.value = '';
      palette._render();
      App.openDialog(palette);
      palette._input.focus();
    },
  };

  /* ===================================================================
     頁面外殼行為
     =================================================================== */
  function markNav() {
    const file = decodeURIComponent(location.pathname.split('/').pop()) || 'index.html';
    doc.querySelectorAll('.nav-item, .pageloc a').forEach((a) => {
      const on = a.getAttribute('href') === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const loc = [...doc.querySelectorAll('.pageloc a')];
    const at = loc.findIndex((a) => a.getAttribute('href') === file);
    doc.querySelectorAll('[data-pageloc]').forEach((el) => { el.textContent = at >= 0 ? `${at + 1} / ${loc.length}` : `— / ${loc.length}`; });
  }
  function initNavToggle() {
    const btn = doc.querySelector('[data-nav-toggle]');
    const nav = doc.getElementById(btn ? btn.getAttribute('aria-controls') : '');
    if (!btn || !nav) return;
    const set = (open) => {
      nav.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      btn.innerHTML = App.icon(open ? 'x' : 'menu');
    };
    btn.addEventListener('click', () => { set(!nav.classList.contains('is-open')); if (nav.classList.contains('is-open')) App.eink.blink(nav); });
    doc.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !nav.contains(e.target) && !btn.contains(e.target)) set(false); });
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) set(false); });
  }
  function initClock() {
    const els = [...doc.querySelectorAll('[data-clock]')];
    const text = () => { const t = App.now(); return `${App.fmt.wd(TODAY)} ${App.fmt.md(TODAY)} ${App.fmt.time(t)}`; };
    els.forEach((el) => { el.textContent = text(); el.dataset.value = el.textContent; });
    setInterval(() => els.forEach((el) => { const s = text(); if (el.dataset.value !== s) App.eink.setText(el, s); }), 5000);
    doc.querySelectorAll('[data-last-refresh]').forEach((el) => { el.textContent = App.fmt.time(App.now()); });
  }
  function initGlobalButtons() {
    doc.addEventListener('click', (e) => {
      if (e.target.closest('[data-search]')) { App.search.open(); return; }
      if (e.target.closest('[data-full-refresh]')) {
        App.eink.flash().then(() => App.dither.refreshAll());
        doc.querySelectorAll('[data-last-refresh]').forEach((el) => { el.textContent = App.fmt.time(App.now()); });
        App.toast('已全刷新畫面', { desc: '清除局部刷新累積的殘影，並重新繪製所有抖色影像。', tone: 'ok', duration: 2600 });
      }
    });
    doc.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement.tagName) || doc.activeElement.isContentEditable;
      if (e.key === '/' && !typing && !openDialogs.length) { e.preventDefault(); App.search.open(); return; }
      if (e.key === 'Escape' && openDialogs.length) {
        // 原生 dialog 只對真實按鍵觸發 cancel；這裡統一處理並阻止原生再關一次
        e.preventDefault();
        App.closeDialog(openDialogs[openDialogs.length - 1]);
      }
    });
  }
  function initLinks() {
    doc.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!/^[\w-]+\.html(\?[^#]*)?$/.test(href) || reduced()) return;
      e.preventDefault();
      App.eink.navigate(href);
    });
  }

  /* ===================================================================
     進場（電子紙逐階顯影）與離開視窗暫停
     =================================================================== */
  let revealIO = null;
  const showEl = (el, instant) => {
    el.classList.add('is-in');
    if (instant) el.classList.add('is-instant');
    el.dispatchEvent(new CustomEvent('reveal'));
  };
  App.reveal = (rootEl = doc) => {
    const els = [...rootEl.querySelectorAll('[data-reveal]:not(.is-in)')];
    if (rootEl !== doc && rootEl.matches && rootEl.matches('[data-reveal]:not(.is-in)')) els.unshift(rootEl);
    if (reduced() || !revealIO) { els.forEach((el) => showEl(el, true)); return; }
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) {
        // 首屏內的元素直接顯示，開機刷新結束後才送出 reveal 讓區塊內動畫起跑
        el.classList.add('is-in', 'is-instant');
        bootDone.then(() => el.dispatchEvent(new CustomEvent('reveal')));
      } else revealIO.observe(el);
    });
  };
  function initReveal() {
    if ('IntersectionObserver' in window) {
      revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        revealIO.unobserve(e.target);
        showEl(e.target, false);
      }), { rootMargin: '0px 0px -8% 0px' });
    }
    App.reveal(doc);
    // 保底：任何原因沒觸發的元素 2.5 秒後一律顯示
    setTimeout(() => doc.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => showEl(el, true)), 2500);
  }
  function initAnimPause() {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting)));
      doc.querySelectorAll('[data-anim]').forEach((el) => io.observe(el));
    }
    doc.addEventListener('visibilitychange', () => root.classList.toggle('is-hidden', doc.hidden));
  }

  /* ===================================================================
     啟動
     =================================================================== */
  root.classList.add('js');
  App.hydrate(doc);
  markNav();
  const c0 = App.counts();
  doc.querySelectorAll('[data-count]').forEach((el) => syncCount(el, c0, false));
  initClock();
  initNavToggle();
  initGlobalButtons();
  initLinks();
  initReveal();
  initAnimPause();
  initDither();
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1 || n.classList.contains('eink-ghost')) return;
    if (n.matches('[data-icon]') || n.querySelector('[data-icon]')) App.hydrate(n.matches('[data-icon]') ? n.parentNode : n);
    if (n.matches('canvas[data-scene]')) bindCanvas(n);
    n.querySelectorAll('canvas[data-scene]').forEach(bindCanvas);
  }))).observe(doc.body, { childList: true, subtree: true });
})();
