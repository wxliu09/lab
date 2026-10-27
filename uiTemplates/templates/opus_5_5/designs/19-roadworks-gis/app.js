/*
 * 澄港市 道路挖掘 管線施工許可 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 時間（以 2026-10-22（四）10:24 為「現在」，日期一律 'YYYY-MM-DD' 字串）
 *   App.TODAY · App.NOW_TIME · App.day(iso)→整數日 · App.iso(n) · App.addDays(iso, n) · App.weekday(iso)
 *   App.weekRange(iso) → [週一, 週日]
 *   App.fmt.num / area / date / md / mdw / long / range / span(天數) / rel / station(1K+240) / coord
 * 資料（全站共用；只在記憶體中變動）
 *   App.DATA.permits   47 件許可（欄位見 buildPermit 註解）
 *   App.DATA.roads     14 條幹道（id、name、cls A/B/C、line 稠密折線、len）
 *   App.DATA.districts 8 行政區（id、name、poly、label）
 *   App.DATA.people    審查人員；App.DATA.activity 最近活動（新到舊）
 *   App.UTIL / App.UTIL_ORDER  管線類別（name、org、short、unit、contact、color、ink、soft）
 *   App.STATUS / App.STATUS_ORDER / App.STAGES（七階段：申請→衝突檢查→會辦→核准→施工→完工→刨鋪驗收）
 *   App.COSIGN_DEPTS（交通 / 管線協調 / 環保）· App.ACCEPTANCE（刨鋪驗收檢核項目）
 *   App.getPermit(id) · App.roadOf(p) · App.isPending(p) · App.onDate(p, iso) · App.progress(p, iso) → {day,total,frac}
 *   App.conflicts() → [{id:'CF-031', a, b, road, s0, s1, length, from, to, days, status:'open'|'coordinating'|'resolved', note, poly, center, bbox}]
 *   App.conflictsOf(p) · App.conflictsOn(iso) · App.CONFLICT_STATUS
 *   App.cosignOf(p) → [{dept, name, unit, person, state:'ok'|'pending'|'hold'|'returned'|'idle', date, note}]
 *   App.acceptanceOf(p) → [{key, label, spec, state:'pass'|'fail'|'pending', value, date}]
 *   App.trafficOf(p) → {closure, side, lanes, hours, detour, cones, signs, flaggers, speed}
 *   App.timelineOf(p) → [{stage, label, date, state:'done'|'current'|'hold'|'todo', note}]
 *   App.dailyLoad(from, to) → [{iso, counts:{power..}, total, clash}]
 *   App.counts() → {total, active, pending, review, conflicts, approvedWeek, paving}
 *   App.checkConflicts({poly, start, end, exclude}) → [{permit, from, to, days}]（自繪多邊形與既有許可）
 *   App.nearestRoad([x,y]) → {road, s, dist} · App.districtAt([x,y]) → district
 * 資料變更（都會觸發 'data' 事件，[data-count] 與各頁重繪掛在同一個事件上）
 *   App.setStatus(p, status, {note, by}) → {undo()}
 *   App.addPermit({utility, poly, start, end, purpose, ...}) → permit
 *   App.on(name, fn) / App.emit(name, detail)   事件：'data'
 * 標記產生器（回傳 HTML 字串）
 *   App.esc(s) · App.icon(name, cls) · App.utilChip(key, {plain, label}) · App.statusBadge(status)
 *   App.pidLink(id) · App.flowTrack(p) · App.emptyState({art:'map'|'search'|'doc', title, text})
 *   App.permitUrl(id) · App.param(name)
 * 互動元件
 *   App.toast(title, {desc, tone:'ok'|'warn'|'danger'|'info', action:{label, onClick}, duration})
 *   App.modal({eyebrow, title, body, size:'sm'|'md'|'lg', actions:[{label, variant, onClick(close), autofocus}], onClose}) → {el, body, close}
 *   App.confirm({title, message, confirmLabel, cancelLabel, tone:'primary'|'danger'}) → Promise<boolean>
 *   App.popover(anchor, html | Node, {className, onClose}) → {el, close}
 *   App.tabs(tablistEl, {onChange(i, tab)}) → {select(i), refresh()}
 *   App.openSearch()  快速搜尋（/、Ctrl+K、[data-search]）
 *   App.reveal(root) / App.countUp(el, to, {dur, format})
 * 地圖（招牌引擎；同頁可建多個）
 *   const map = App.map.create(el, {
 *     permits, date, layers, fit:[x0,y0,x1,y1] | 'permits', pad, interactive, controls:true|'compact'|false,
 *     frame(圖框座標刻度), titleblock:{title, no}, selectable, tooltip, maxK,
 *     inset:{left,top,right,bottom} 或 () => {...}（浮在地圖上的面板寬度；聚焦與全圖都會避開）,
 *     onSelect(p|null), onConflict(c), onClick({x,y,event}), onPointer([x,y]), onView({k}), onDate(iso)
 *   })
 *   map.setDate(iso) · map.date() · map.setLayer(key, on) · map.layers · map.setPermits(list)
 *   map.select(id|null, {fly}) · map.selected() · map.highlight(ids|null) · map.flash(permitId | conflictId)
 *   map.focusPermit(id, {pad}) · map.focusConflict(id) · map.focusBox(bbox, {pad, dur, maxK}) · map.panIntoView(bbox) · map.fit() · map.zoomBy(f)
 *   map.toScreen([x,y]) → [sx,sy]（相對地圖容器）· map.toWorld(clientX, clientY) → [x,y]
 *   map.overlay（<g> 世界座標，頁面自繪用）· map.hatch(polyA, polyB) → <g>（A∩B 斜線＋閃爍外框）
 *   map.slot('tl'|'tr'|'bl'|'br') → 疊加 UI 容器 · map.visible() → {permits, conflicts} · map.on(type, fn)
 *   App.map.layerPanel(map, {open, moreOpen}) 圖層面板（管線類別＋可收合的「圖面」群組，件數隨日期更新） · App.svgEl(tag, attrs) · App.geo（area、centroid、bbox、contains、intersects、pathD、strip…）
 * 時間軸
 *   App.timeline(el, {start, end, value, today, onInput(iso)}) → {get(), set(iso, emit), play(), pause(), refresh()}
 * 自動行為（不需呼叫）
 *   導覽 active 標示、行動版選單 [data-nav-toggle]、[data-search] 快速搜尋、[data-notify] 通知、[data-user] 使用者選單、
 *   [data-today] 今日日期、[data-count="active|pending|review|conflicts|approvedWeek|paving|total"] 計數、
 *   [data-reveal] 進場（style="--i:n" 錯開）、[data-count-to] 數字滾動、[data-anim] 離開視窗時暫停其中動畫、
 *   分頁隱藏時暫停所有 CSS 動畫、Escape 關閉最上層浮層
 */
(function () {
  'use strict';

  const App = window.App = {};
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  App.$ = $; App.$$ = $$; App.esc = esc; App.clamp = clamp;

  // 固定種子的亂數：底圖每次產生都一樣，各頁地圖才對得起來
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* =====================================================================
     時間與格式
     ===================================================================== */
  const TODAY = '2026-10-22';
  const NOW_TIME = '10:24';
  const DAY = 86400000;
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const dayNum = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const isoOf = n => new Date(n * DAY).toISOString().slice(0, 10);
  const addDays = (iso, n) => isoOf(dayNum(iso) + n);
  const weekday = iso => WD[new Date(dayNum(iso) * DAY).getUTCDay()];
  function weekRange(iso) {
    const n = dayNum(iso);
    const mon = n - ((new Date(n * DAY).getUTCDay() + 6) % 7);
    return [isoOf(mon), isoOf(mon + 6)];
  }
  const fmt = {
    num: n => Math.round(n).toLocaleString('en-US'),
    dec: (n, d = 1) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
    area: n => Math.round(n).toLocaleString('en-US') + ' m²',
    date: iso => iso.replace(/-/g, '/'),
    md: iso => { const [, m, d] = iso.split('-'); return `${+m}/${+d}`; },
    mdw: iso => `${fmt.md(iso)}（${weekday(iso)}）`,
    long: iso => { const [y, m, d] = iso.split('-'); return `${y} 年 ${+m} 月 ${+d} 日（${weekday(iso)}）`; },
    range: (a, b) => `${fmt.md(a)} – ${fmt.md(b)}`,
    span: (a, b) => dayNum(b) - dayNum(a) + 1,
    rel(iso, base = TODAY) {
      const d = dayNum(iso) - dayNum(base);
      if (d === 0) return '今日';
      if (d === 1) return '明日';
      if (d === -1) return '昨日';
      return d > 0 ? `${d} 天後` : `${-d} 天前`;
    },
    station: s => { const r = Math.round(s); return `${Math.floor(r / 1000)}K+${String(r % 1000).padStart(3, '0')}`; },
    // 平面座標：數字以空白分節（測量圖慣例）
    coord: n => Math.round(n).toLocaleString('en-US').replace(/,/g, ' '),
  };
  Object.assign(App, { TODAY, NOW_TIME, day: dayNum, iso: isoOf, addDays, weekday, weekRange, fmt });

  /* =====================================================================
     幾何
     ===================================================================== */
  const geo = {
    dist: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]),
    cum(line) {
      const c = [0];
      for (let i = 1; i < line.length; i++) c.push(c[i - 1] + geo.dist(line[i - 1], line[i]));
      return c;
    },
    // 折線上距起點 s 公尺的點與單位切向量
    at(line, cum, s) {
      s = clamp(s, 0, cum[cum.length - 1]);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const a = line[i - 1], b = line[i], L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
    },
    slice(line, cum, s0, s1) {
      const out = [geo.at(line, cum, s0).slice(0, 2)];
      for (let i = 1; i < line.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(line[i]);
      out.push(geo.at(line, cum, s1).slice(0, 2));
      return out;
    },
    // 每個頂點的右側法向量（y 向下座標系，往前進方向的右手邊為正）；轉角用 miter 補償，偏移後寬度才不會在彎道變窄
    normals(line) {
      const n = line.length;
      const segN = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = line[i + 1][0] - line[i][0], dy = line[i + 1][1] - line[i][1], L = Math.hypot(dx, dy) || 1;
        segN.push([-dy / L, dx / L]);
      }
      return line.map((p, i) => {
        const a = segN[Math.max(0, i - 1)], b = segN[Math.min(n - 2, i)];
        let nx = a[0] + b[0], ny = a[1] + b[1];
        const L = Math.hypot(nx, ny) || 1;
        nx /= L; ny /= L;
        const s = 1 / Math.max(.45, nx * a[0] + ny * a[1]);
        return [nx * s, ny * s];
      });
    },
    offset(line, o) {
      const ns = geo.normals(line);
      return line.map((p, i) => [p[0] + ns[i][0] * o, p[1] + ns[i][1] * o]);
    },
    // 沿折線 s0–s1、橫向 o0–o1 的帶狀多邊形：施工範圍與衝突區都用它產生
    strip(line, cum, s0, s1, o0, o1) {
      const sub = geo.slice(line, cum, s0, s1);
      return geo.offset(sub, o0).concat(geo.offset(sub, o1).reverse());
    },
    area(poly) {
      let a = 0;
      for (let i = 0, n = poly.length; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
      return Math.abs(a) / 2;
    },
    centroid(poly) {
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, n = poly.length; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1];
        a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
      }
      if (Math.abs(a) < 1e-6) {
        return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
      }
      return [cx / (3 * a), cy / (3 * a)];
    },
    bbox(polys) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const poly of polys) for (const p of poly) {
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      }
      return [x0, y0, x1, y1];
    },
    contains(poly, pt) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      return inside;
    },
    segCross(a, b, c, d) {
      const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
    },
    intersects(A, B) {
      const ba = geo.bbox([A]), bb = geo.bbox([B]);
      if (ba[2] < bb[0] || bb[2] < ba[0] || ba[3] < bb[1] || bb[3] < ba[1]) return false;
      for (let i = 0; i < A.length; i++) {
        const a = A[i], b = A[(i + 1) % A.length];
        for (let j = 0; j < B.length; j++) if (geo.segCross(a, b, B[j], B[(j + 1) % B.length])) return true;
      }
      return geo.contains(B, A[0]) || geo.contains(A, B[0]);
    },
    distToLine(pt, line) {
      let best = Infinity, bestS = 0, acc = 0;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        const t = clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2, 0, 1);
        const d = Math.hypot(pt[0] - (a[0] + dx * t), pt[1] - (a[1] + dy * t));
        if (d < best) { best = d; bestS = acc + Math.sqrt(L2) * t; }
        acc += Math.sqrt(L2);
      }
      return [best, bestS];
    },
    pathD(poly, closed = true) {
      return 'M' + poly.map(p => (Math.round(p[0] * 10) / 10) + ',' + (Math.round(p[1] * 10) / 10)).join('L') + (closed ? 'Z' : '');
    },
    // Catmull-Rom 取樣：讓手給的控制點變成平順的河岸、海岸與道路
    spline(pts, seg = 8, closed = false) {
      const out = [], n = pts.length;
      const P = i => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        for (let j = 0; j < seg; j++) {
          const t = j / seg, t2 = t * t, t3 = t2 * t;
          out.push([0, 1].map(c => .5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
        }
      }
      if (!closed) out.push(pts[n - 1].slice());
      return out;
    },
  };
  App.geo = geo;

  /* =====================================================================
     城市圖資（虛構澄港市；平面座標單位 = 公尺，原點在圖幅左上角，y 向下）
     ===================================================================== */
  const WORLD = { w: 4000, h: 2600, e0: 212000, n0: 2673000 };
  App.WORLD = WORLD;

  const COAST_CTRL = [[0, 2330], [400, 2290], [800, 2340], [1200, 2310], [1600, 2250], [1900, 2200], [2300, 2140], [2700, 2080], [3050, 1960], [3300, 1760], [3480, 1560], [3620, 1340], [3760, 1080], [3880, 860], [4000, 760]];
  const RIVER_CTRL = [[-200, 740], [0, 760], [300, 800], [650, 900], [1000, 960], [1350, 980], [1700, 1010], [2050, 1080], [2400, 1180], [2750, 1260], [3100, 1380], [3480, 1560], [3620, 1650]];
  const BRANCH_CTRL = [[2050, 1080], [2250, 1330], [2600, 1480], [3000, 1620], [3300, 1760], [3420, 1840]];

  function waterBody(ctrl, w0, w1, phase) {
    const line = geo.spline(ctrl, 10), cum = geo.cum(line), L = cum[cum.length - 1], ns = geo.normals(line);
    const hw = cum.map(s => w0 + (w1 - w0) * (s / L) + 4 * Math.sin(s / 160 + phase));
    const left = line.map((p, i) => [p[0] - ns[i][0] * hw[i], p[1] - ns[i][1] * hw[i]]);
    const right = line.map((p, i) => [p[0] + ns[i][0] * hw[i], p[1] + ns[i][1] * hw[i]]);
    return { line, cum, ns, hw, poly: left.concat(right.slice().reverse()) };
  }
  const COAST = geo.spline(COAST_CTRL, 8);
  const SEA = COAST.concat([[4700, 700], [4700, 3300], [-700, 3300], [-700, 2330]]);
  const RIVER = waterBody(RIVER_CTRL, 34, 70, 0);
  const BRANCH = waterBody(BRANCH_CTRL, 16, 34, 2);
  const WATERS = [SEA, RIVER.poly, BRANCH.poly];
  const inWater = pt => WATERS.some(w => geo.contains(w, pt));

  const DISTRICTS = [
    { id: 'yunling', name: '雲嶺區', label: [470, 420], poly: [[0, 0], [1100, 0], [1100, 966], [1000, 960], [650, 900], [300, 800], [0, 760]] },
    { id: 'beian', name: '北岸區', label: [1840, 600], poly: [[1100, 0], [2700, 0], [2700, 1249], [2400, 1180], [2050, 1080], [1700, 1010], [1350, 980], [1100, 966]] },
    { id: 'xinwan', name: '新灣區', label: [3340, 640], poly: [[2700, 0], [4000, 0], [4000, 760], [3880, 860], [3760, 1080], [3620, 1340], [3480, 1560], [3100, 1380], [2750, 1260], [2700, 1249]] },
    { id: 'shanjiao', name: '山腳區', label: [400, 1200], poly: [[0, 760], [300, 800], [650, 900], [1000, 960], [1000, 1500], [0, 1500]] },
    { id: 'jiucheng', name: '舊城區', label: [1290, 1610], poly: [[1000, 960], [1350, 980], [1700, 1010], [2050, 1080], [2250, 1330], [2150, 1750], [1450, 1820], [1000, 1700], [1000, 1500]] },
    { id: 'xizhou', name: '溪洲區', label: [2700, 1420], poly: [[2050, 1080], [2400, 1180], [2750, 1260], [3100, 1380], [3480, 1560], [3300, 1760], [3000, 1620], [2600, 1480], [2250, 1330]] },
    { id: 'gangcheng', name: '港埕區', label: [2660, 1815], poly: [[2250, 1330], [2600, 1480], [3000, 1620], [3300, 1760], [3300, 2600], [1750, 2600], [1450, 1820], [2150, 1750]] },
    { id: 'yantian', name: '鹽田區', label: [540, 1960], poly: [[0, 1500], [1000, 1500], [1000, 1700], [1450, 1820], [1750, 2600], [0, 2600]] },
  ];
  const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));
  DISTRICTS.forEach(d => { d.bbox = geo.bbox([d.poly]); });
  const districtAt = pt => DISTRICTS.find(d => geo.contains(d.poly, pt)) || DISTRICTS[0];

  const ROAD_W = { A: 36, B: 26, C: 18 };
  const ROADS = [
    { id: 'R1', name: '北環路', cls: 'A', pts: [[0, 330], [700, 300], [1500, 250], [2300, 260], [3100, 230], [4000, 200]], lab: [.46, .2, .8] },
    { id: 'R2', name: '北岸路', cls: 'B', pts: [[300, 640], [700, 740], [1050, 820], [1400, 850], [1750, 880], [2100, 950], [2450, 1050], [2800, 1130], [3150, 1240], [3450, 1390]], lab: [.62, .3] },
    { id: 'R3', name: '澄江大道', cls: 'A', pts: [[0, 1030], [500, 1055], [1000, 1110], [1500, 1140], [1900, 1190], [2200, 1450], [2550, 1640], [2900, 1860]], lab: [.47, .18, .86] },
    { id: 'R4', name: '府前路', cls: 'B', pts: [[1000, 1460], [1500, 1470], [2000, 1485], [2220, 1470]], lab: [.32] },
    { id: 'R5', name: '濱海路', cls: 'A', pts: [[0, 2190], [500, 2160], [1000, 2200], [1500, 2130], [1900, 2060], [2400, 2000], [2800, 1900], [3200, 1740]], lab: [.56, .16] },
    { id: 'R6', name: '雲嶺路', cls: 'B', pts: [[620, 0], [650, 300], [720, 600], [760, 900], [780, 1300], [760, 1700], [720, 2178]], lab: [.2, .7] },
    { id: 'R7', name: '文昌路', cls: 'A', pts: [[1500, 0], [1520, 400], [1540, 800], [1560, 1200], [1570, 1600], [1560, 2120]], lab: [.24, .66] },
    { id: 'R8', name: '港埕路', cls: 'A', pts: [[2350, 0], [2360, 400], [2380, 800], [2400, 1200], [2410, 1500], [2420, 1800], [2430, 2000]], lab: [.2, .8] },
    { id: 'R9', name: '新灣大道', cls: 'A', pts: [[3000, 0], [3020, 400], [3060, 800], [3110, 1100], [3150, 1240]], lab: [.3] },
    { id: 'R10', name: '環港東路', cls: 'B', pts: [[3650, 0], [3700, 400], [3660, 800], [3560, 1150], [3450, 1390]], lab: [.36] },
    { id: 'R11', name: '山腳路', cls: 'B', pts: [[100, 1250], [500, 1450], [900, 1700], [1200, 1900], [1500, 2130]], lab: [.48] },
    { id: 'R12', name: '鹽田路', cls: 'B', pts: [[1000, 1460], [1020, 1900], [990, 2200]], lab: [.62] },
    { id: 'R13', name: '永安街', cls: 'C', pts: [[1100, 275], [1090, 600], [1080, 823]], lab: [.5] },
    { id: 'R14', name: '溪洲路', cls: 'C', pts: [[2240, 1238], [2650, 1380], [3000, 1497], [3250, 1610]], lab: [.62] },
  ];
  ROADS.forEach(r => {
    r.line = geo.spline(r.pts, 10);
    r.cum = geo.cum(r.line);
    r.len = r.cum[r.cum.length - 1];
    r.w = ROAD_W[r.cls];
  });
  const ROAD_BY_ID = Object.fromEntries(ROADS.map(r => [r.id, r]));
  function nearestRoad(pt) {
    let best = null;
    for (const r of ROADS) {
      const [d, s] = geo.distToLine(pt, r.line);
      if (!best || d < best.dist) best = { road: r, s, dist: d };
    }
    return best;
  }

  /* =====================================================================
     業務資料
     ===================================================================== */
  const UTIL = {
    power:   { key: 'power',   name: '電力',   org: '澄港電力股份有限公司', short: '澄港電力', unit: '配電工程處', contact: '張皓宇', color: '#F5A623', ink: '#8A5300', soft: '#FEF3DF', icon: 'power' },
    water:   { key: 'water',   name: '自來水', org: '澄港市自來水事業處', short: '自來水處', unit: '管線工程科', contact: '李品妤', color: '#2F80ED', ink: '#1B5FBF', soft: '#E5F0FD', icon: 'water' },
    gas:     { key: 'gas',     name: '瓦斯',   org: '澄港天然氣股份有限公司', short: '澄港天然氣', unit: '工務部', contact: '蔡承恩', color: '#EB5757', ink: '#B83232', soft: '#FDECEC', icon: 'gas' },
    telecom: { key: 'telecom', name: '電信',   org: '澄網電信股份有限公司', short: '澄網電信', unit: '網路建設處', contact: '王郁婷', color: '#9B51E0', ink: '#7434B5', soft: '#F3EAFC', icon: 'telecom' },
    sewer:   { key: 'sewer',   name: '污水',   org: '澄港市下水道工程處', short: '下水道處', unit: '污水工程科', contact: '鄭家豪', color: '#27AE60', ink: '#1B7F45', soft: '#E3F5EA', icon: 'sewer' },
  };
  const UTIL_ORDER = ['power', 'water', 'gas', 'telecom', 'sewer'];

  const STATUS = {
    returned:     { label: '退回補正', stage: 0, short: '退回' },
    checking:     { label: '衝突檢查', stage: 1, short: '檢查' },
    coordinating: { label: '衝突協調', stage: 1, short: '協調' },
    review:       { label: '會辦中',   stage: 2, short: '會辦' },
    approved:     { label: '已核准',   stage: 3, short: '核准' },
    active:       { label: '施工中',   stage: 4, short: '施工' },
    done:         { label: '已完工',   stage: 5, short: '完工' },
    paving:       { label: '刨鋪驗收', stage: 6, short: '驗收' },
    accepted:     { label: '已結案',   stage: 7, short: '結案' },
  };
  const STATUS_ORDER = ['returned', 'checking', 'coordinating', 'review', 'approved', 'active', 'done', 'paving', 'accepted'];
  const STAGES = ['申請', '衝突檢查', '會辦', '核准', '施工', '完工', '刨鋪驗收'];
  const PENDING = new Set(['returned', 'checking', 'coordinating', 'review']);

  const PEOPLE = {
    lin:   { id: 'lin',   name: '林雅雯', title: '技士',     unit: '工務局 道路管線科', role: '承辦' },
    zhou:  { id: 'zhou',  name: '周建宏', title: '科長',     unit: '工務局 道路管線科', role: '核定' },
    wu:    { id: 'wu',    name: '吳思妤', title: '股長',     unit: '工務局 管線協調股', role: '管線協調' },
    chen:  { id: 'chen',  name: '陳柏翰', title: '技正',     unit: '交通局 交通工程科', role: '交通會辦' },
    huang: { id: 'huang', name: '黃志豪', title: '技士',     unit: '環保局 空氣噪音科', role: '環保會辦' },
    xu:    { id: 'xu',    name: '許文傑', title: '工程司',   unit: '工務局 養護工程隊', role: '刨鋪驗收' },
    sys:   { id: 'sys',   name: '系統',   title: '',         unit: '自動衝突檢查', role: '系統' },
  };

  const COSIGN_DEPTS = [
    { key: 'traffic', name: '交通', unit: '交通局 交通工程科', who: 'chen' },
    { key: 'coord',   name: '管線協調', unit: '工務局 管線協調股', who: 'wu' },
    { key: 'env',     name: '環保', unit: '環保局 空氣噪音科', who: 'huang' },
  ];
  const ACCEPTANCE = [
    { key: 'flat',  label: '平整度',         spec: '3 m 直規量測高低差 ≤ 0.6 cm' },
    { key: 'mark',  label: '標線復原',       spec: '熱拌標線位置、線寬與原標線一致' },
    { key: 'mill',  label: '刨鋪範圍',       spec: '挖掘範圍外擴 ≥ 30 cm，全車道刨鋪' },
    { key: 'thick', label: '鋪面厚度',       spec: 'AC 面層 ≥ 5 cm（鑽心取樣）' },
    { key: 'comp',  label: '壓實度',         spec: '現場密度 ≥ 96%' },
    { key: 'cover', label: '人孔／閥蓋高程', spec: '與路面高差 ≤ 0.5 cm' },
    { key: 'clean', label: '交通設施撤除',   spec: '交通錐、鋼板、廢料全數撤離' },
  ];

  const CONTRACTORS = {
    power: ['鼎岳營造有限公司', '明築工程有限公司'],
    water: ['宏霖土木包工業', '海寧工程有限公司'],
    gas: ['承泰管線工程有限公司', '岳昇營造有限公司'],
    telecom: ['聚豐營造股份有限公司', '立崴土木包工業'],
    sewer: ['海寧工程有限公司', '鼎岳營造有限公司'],
  };
  const DEPTH = { power: 1.2, water: 1.5, gas: 1.2, telecom: 1.0, sewer: 3.2 };

  // [案號, 管線, 道路, 里程 s0, s1, 橫向 o0, o1（負=行進方向左側）, 開工, 完工, 狀態, 申請日, 核准日, 工程名稱, 其他]
  const RAW = [
    ['RW115-0369', 'sewer', 'R7', 300, 600, -6, 8, '2026-09-01', '2026-09-26', 'accepted', '2026-07-30', '2026-08-22', '雨污水分流改善', { accepted: '2026-10-06' }],
    ['RW115-0371', 'telecom', 'R8', 600, 850, 6, 16, '2026-09-03', '2026-09-18', 'accepted', '2026-08-05', '2026-08-26', '幹線光纜汰換', { accepted: '2026-10-01' }],
    ['RW115-0372', 'power', 'R1', 600, 880, -18, -8, '2026-09-07', '2026-09-30', 'accepted', '2026-08-10', '2026-08-28', '11.4 kV 地下配電饋線新設', { accepted: '2026-10-12' }],
    ['RW115-0375', 'power', 'R2', 2400, 2700, -13, -3, '2026-09-08', '2026-09-29', 'accepted', '2026-08-12', '2026-08-31', '路燈及號誌電源管路', { accepted: '2026-10-09' }],
    ['RW115-0377', 'water', 'R5', 900, 1150, -18, -8, '2026-09-10', '2026-10-02', 'accepted', '2026-08-14', '2026-09-02', '消防栓及配水管汰換', { accepted: '2026-10-14' }],
    ['RW115-0379', 'water', 'R9', 900, 1150, -18, -6, '2026-09-15', '2026-10-09', 'paving', '2026-08-20', '2026-09-08', 'DN300 配水管新設'],
    ['RW115-0381', 'gas', 'R13', 100, 400, -9, 0, '2026-09-14', '2026-10-06', 'paving', '2026-08-18', '2026-09-05', '老舊鑄鐵管汰換'],
    ['RW115-0383', 'gas', 'R3', 900, 1150, -18, -8, '2026-09-16', '2026-10-07', 'accepted', '2026-08-20', '2026-09-08', '管線遷移（配合澄江橋改建）', { accepted: '2026-10-19' }],
    ['RW115-0385', 'water', 'R4', 300, 520, -13, -2, '2026-09-22', '2026-10-16', 'done', '2026-08-25', '2026-09-15', 'DN300 配水管汰換'],
    ['RW115-0388', 'sewer', 'R11', 1100, 1400, -6, 8, '2026-09-20', '2026-10-31', 'active', '2026-08-24', '2026-09-12', '污水分管網及用戶接管'],
    ['RW115-0390', 'sewer', 'R1', 1700, 2000, -6, 8, '2026-09-24', '2026-10-15', 'done', '2026-08-28', '2026-09-16', '污水人孔加高及修復'],
    ['RW115-0391', 'power', 'R4', 380, 560, -13, -4, '2026-10-08', '2026-10-24', 'active', '2026-09-08', '2026-09-29', '配電變壓器箱基座遷移'],
    ['RW115-0394', 'gas', 'R12', 150, 400, -13, -3, '2026-10-02', '2026-10-23', 'active', '2026-09-03', '2026-09-25', '低壓管線延伸供氣'],
    ['RW115-0398', 'power', 'R3', 1580, 1840, -18, -7, '2026-10-05', '2026-10-30', 'active', '2026-09-01', '2026-09-24', '22.8 kV 主幹線電纜汰換'],
    ['RW115-0402', 'telecom', 'R1', 2200, 2480, 8, 18, '2026-09-28', '2026-10-20', 'done', '2026-09-01', '2026-09-21', '電信管道擴充'],
    ['RW115-0405', 'water', 'R11', 500, 760, -13, -3, '2026-10-01', '2026-10-21', 'done', '2026-09-02', '2026-09-24', '漏水修復及管線更新'],
    ['RW115-0409', 'power', 'R8', 300, 520, -18, -8, '2026-10-13', '2026-11-03', 'active', '2026-09-12', '2026-10-05', '低壓配電線路地下化'],
    ['RW115-0411', 'power', 'R9', 100, 380, 6, 18, '2026-10-12', '2026-10-26', 'active', '2026-09-14', '2026-10-06', '電動車充電站專用電源管路'],
    ['RW115-0412', 'water', 'R8', 1480, 1700, 6, 18, '2026-10-14', '2026-11-06', 'active', '2026-09-16', '2026-10-07', 'DN600 送水幹管汰換', { depth: 2.2 }],
    ['RW115-0414', 'gas', 'R2', 300, 560, 4, 13, '2026-10-12', '2026-10-29', 'active', '2026-09-15', '2026-10-06', '整壓站出口管線改善'],
    ['RW115-0416', 'water', 'R1', 3000, 3300, -18, -6, '2026-10-15', '2026-11-05', 'active', '2026-09-18', '2026-10-08', 'DN800 原水管檢修', { depth: 2.6 }],
    ['RW115-0419', 'telecom', 'R7', 1170, 1400, -16, -6, '2026-10-19', '2026-10-28', 'active', '2026-09-22', '2026-10-12', '光纖到府幹線佈纜'],
    ['RW115-0421', 'telecom', 'R12', 450, 700, 3, 13, '2026-10-16', '2026-10-30', 'active', '2026-09-20', '2026-10-09', '交接箱遷移及管道'],
    ['RW115-0423', 'sewer', 'R6', 500, 800, -13, -2, '2026-10-22', '2026-11-20', 'active', '2026-09-24', '2026-10-15', '污水次幹管埋設'],
    ['RW115-0425', 'water', 'R6', 1300, 1560, 3, 13, '2026-10-19', '2026-11-13', 'active', '2026-09-22', '2026-10-13', 'DN250 加壓管新設'],
    ['RW115-0427', 'telecom', 'R3', 1700, 1960, -6, 6, '2026-10-20', '2026-11-10', 'active', '2026-10-21', null, '光纜緊急搶修（遭外力挖斷）', { emergency: true }],
    ['RW115-0428', 'gas', 'R10', 1180, 1400, -13, -4, '2026-10-21', '2026-11-08', 'active', '2026-09-24', '2026-10-14', '高壓管線陰極防蝕檢修'],
    ['RW115-0431', 'gas', 'R8', 1540, 1720, -18, -7, '2026-10-26', '2026-11-14', 'approved', '2026-09-24', '2026-10-19', '中壓天然氣管線汰換', { cond: true }],
    ['RW115-0433', 'power', 'R7', 1080, 1340, 4, 16, '2026-10-27', '2026-11-12', 'approved', '2026-09-25', '2026-10-20', '地下配電管路擴充', { cond: true }],
    ['RW115-0434', 'sewer', 'R3', 2500, 2800, 6, 18, '2026-10-19', '2026-11-27', 'active', '2026-09-19', '2026-10-12', '污水幹管修復（CIPP 內襯）', { method: '非開挖（CIPP 內襯）', depth: 4.1 }],
    ['RW115-0437', 'telecom', 'R10', 900, 1150, 3, 13, '2026-10-28', '2026-11-18', 'approved', '2026-09-29', '2026-10-21', '海纜登陸站聯外管道', { method: '推進' }],
    ['RW115-0440', 'sewer', 'R2', 1400, 1760, -4, 10, '2026-11-02', '2026-12-15', 'approved', '2026-09-18', '2026-10-16', '污水幹管推進工程（北岸二期）', { method: '推進', depth: 5.8 }],
    ['RW115-0442', 'gas', 'R1', 1300, 1550, 8, 18, '2026-11-03', '2026-11-20', 'approved', '2026-09-30', '2026-10-14', '中壓管線延伸'],
    ['RW115-0444', 'sewer', 'R5', 400, 650, 0, 12, '2026-11-04', '2026-12-02', 'approved', '2026-10-01', '2026-10-22', '污水壓力管新設'],
    ['RW115-0446', 'water', 'R2', 1500, 1700, -13, -4, '2026-11-20', '2026-12-05', 'review', '2026-10-13', null, 'DN400 配水管遷移（配合污水工程）'],
    ['RW115-0449', 'power', 'R10', 300, 620, -13, -3, '2026-11-16', '2026-12-11', 'review', '2026-10-14', null, '新灣產業園區專用饋線'],
    ['RW115-0450', 'telecom', 'R4', 800, 1050, 2, 13, '2026-11-11', '2026-11-25', 'returned', '2026-10-08', null, '人孔新設及管道', { returned: '2026-10-20' }],
    ['RW115-0452', 'gas', 'R9', 500, 760, -18, -6, '2026-11-09', '2026-11-27', 'review', '2026-10-16', null, '鋼管汰換為 PE 管'],
    ['RW115-0453', 'sewer', 'R8', 1780, 1990, -6, 8, '2026-11-18', '2026-12-20', 'review', '2026-10-09', null, '用戶接管工程（港埕第 3 標）'],
    ['RW115-0455', 'telecom', 'R9', 620, 900, -6, 6, '2026-11-16', '2026-11-30', 'coordinating', '2026-10-19', null, '5G 小型基地台光纖管道'],
    ['RW115-0457', 'power', 'R6', 1800, 2050, -13, -3, '2026-11-12', '2026-12-04', 'approved', '2026-10-02', '2026-10-20', '老舊地下電纜汰換'],
    ['RW115-0458', 'water', 'R3', 400, 700, 6, 18, '2026-11-23', '2026-12-18', 'approved', '2026-10-05', '2026-10-21', 'DN500 幹管延伸', { depth: 2.0 }],
    ['RW115-0459', 'sewer', 'R14', 500, 760, -9, 0, '2026-11-25', '2026-12-30', 'review', '2026-10-12', null, '溪洲污水截流站聯絡管'],
    ['RW115-0461', 'power', 'R5', 2400, 2700, 6, 18, '2026-12-01', '2026-12-22', 'checking', '2026-10-21', null, '港區岸電系統配電管路'],
    ['RW115-0463', 'telecom', 'R5', 1800, 2050, -18, -8, '2026-12-03', '2026-12-18', 'review', '2026-10-15', null, '光纖環路新設'],
    ['RW115-0464', 'water', 'R7', 1700, 1950, 4, 16, '2026-12-08', '2026-12-29', 'checking', '2026-10-22', null, '用戶接水管集中改接'],
    ['RW115-0466', 'gas', 'R14', 200, 450, 0, 9, '2026-12-07', '2026-12-23', 'checking', '2026-10-21', null, '溪洲社區新設供氣管'],
  ];

  const SEC = ['一', '二', '三', '四', '五'];
  // 門牌：雙號在行進方向左側、單號在右側，長路才分段
  function addressOf(road, s0, s1, side) {
    const short = road.len < 1500;
    // 短路不分段，門牌從起點連續編；長路每 1000 m 一段重新編號
    const num = s => { let n = Math.max(1, Math.round((short ? s : s % 1000) / 4)); if (n % 2 !== side) n += 1; return n; };
    if (short) return `${road.name} ${num(s0)}–${num(s1)} 號`;
    const a = Math.floor(s0 / 1000), b = Math.floor(s1 / 1000);
    return a === b
      ? `${road.name}${SEC[a]}段 ${num(s0)}–${num(s1)} 號`
      : `${road.name}${SEC[a]}段 ${num(s0)} 號至${SEC[b]}段 ${num(s1)} 號`;
  }
  function segmentOf(road, s) { return road.len < 1500 ? road.name : `${road.name}${SEC[Math.floor(s / 1000)]}段`; }

  /*
   * permit 欄位：
   *   id、utility、org、contact、roadId、road（路名）、segment（路名＋段）、address（門牌範圍）、station（里程文字）
   *   s0/s1（里程 m）、o0/o1（橫向偏移 m）、poly（多邊形頂點）、center、bbox、area（m²）、length（m）
   *   start/end（佔用期間）、d0/d1（整數日）、days、status、applied、approved、accepted、returned
   *   purpose、method（工法）、depth（m）、hours（施工時段）、contractor、district（行政區名）、districtId
   *   emergency（緊急搶修補辦）、conditional（附條件核准）、flowD（施工中流動虛線路徑）
   */
  function buildPermit(row, idx) {
    const [id, utility, roadId, s0, s1, o0, o1, start, end, status, applied, approved, purpose, extra = {}] = row;
    const road = ROAD_BY_ID[roadId];
    const poly = geo.strip(road.line, road.cum, s0, s1, o0, o1);
    const center = geo.centroid(poly);
    const dist = districtAt(center);
    const oc = (o0 + o1) / 2;
    const flowLine = geo.offset(geo.slice(road.line, road.cum, s0, s1), oc);
    const hours = extra.emergency ? '24 小時（搶修）' : road.cls === 'A' ? '夜間 22:00–翌日 06:00' : road.cls === 'B' ? '日間 09:00–16:00' : '日間 08:30–17:00';
    return {
      id, utility, org: UTIL[utility].org, contact: UTIL[utility].contact,
      roadId, road: road.name, segment: segmentOf(road, s0), address: addressOf(road, s0, s1, oc < 0 ? 0 : 1),
      station: `${fmt.station(s0)} – ${fmt.station(s1)}`,
      s0, s1, o0, o1, poly, center, bbox: geo.bbox([poly]), area: Math.round(geo.area(poly)), length: s1 - s0,
      start, end, d0: dayNum(start), d1: dayNum(end), days: fmt.span(start, end),
      status, applied, approved, accepted: extra.accepted || null, returned: extra.returned || null,
      purpose, method: extra.method || '明挖', depth: extra.depth || DEPTH[utility], hours,
      contractor: CONTRACTORS[utility][idx % 2], district: dist.name, districtId: dist.id,
      emergency: !!extra.emergency, conditional: !!extra.cond,
      flowD: geo.pathD(flowLine, false),
    };
  }
  const PERMITS = RAW.map(buildPermit);
  const PERMIT_BY_ID = new Map(PERMITS.map(p => [p.id, p]));

  // 衝突的協調紀錄；偵測本身完全由資料計算，這裡只補人工狀態與意見
  const CONFLICT_META = {
    'RW115-0385|RW115-0391': { code: 'CF-026', status: 'resolved', note: '已協調錯開時段：自來水夜間、電力日間施工，10/16 自來水完工後解除。', by: 'wu' },
    'RW115-0412|RW115-0431': { code: 'CF-029', status: 'coordinating', note: '瓦斯同意 10/26 起改夜間施工並退縮至內側車道；待交通局確認修正後交維計畫。', by: 'wu' },
    'RW115-0419|RW115-0433': { code: 'CF-030', status: 'coordinating', note: '電信預計 10/26 提前完工；電力暫緩至 10/29 進場，如期即解除。', by: 'wu' },
    'RW115-0398|RW115-0427': { code: 'CF-031', status: 'open', note: '電信光纜遭外力挖斷，緊急搶修後補辦申請，與電力 22.8 kV 汰換同段施工，需當日現場協調車道配置。', by: 'wu' },
    'RW115-0440|RW115-0446': { code: 'CF-032', status: 'open', note: '污水推進工作井與自來水管線遷移位置重疊，建議併案採共同管溝施工。', by: 'wu' },
    'RW115-0452|RW115-0455': { code: 'CF-033', status: 'open', note: '自動檢查發現電信申請與瓦斯管線汰換重疊 140 m，待雙方提出施工順序。', by: 'wu' },
  };
  const CONFLICT_STATUS = {
    open: { label: '待協調', tone: 'danger' },
    coordinating: { label: '協調中', tone: 'warn' },
    resolved: { label: '已排解', tone: 'ok' },
  };

  const COSIGN_OVERRIDE = {
    'RW115-0449': { traffic: ['ok', '2026-10-17'], coord: ['ok', '2026-10-18'], env: ['pending'] },
    'RW115-0446': { traffic: ['ok', '2026-10-16'], coord: ['hold', null, '與 RW115-0440 污水推進工程重疊（CF-032），建議併案共同管溝施工，暫緩會辦。'], env: ['ok', '2026-10-21'] },
    'RW115-0452': { traffic: ['pending'], coord: ['hold', null, '與 RW115-0455 重疊 140 m（CF-033），待雙方提出施工順序後續辦。'], env: ['pending'] },
    'RW115-0463': { traffic: ['ok', '2026-10-20'], coord: ['pending'], env: ['pending'] },
    'RW115-0459': { traffic: ['pending'], coord: ['ok', '2026-10-16'], env: ['ok', '2026-10-19'] },
    'RW115-0453': { traffic: ['pending', null, '已逾會辦期限 3 日，10/21 已催辦。'], coord: ['ok', '2026-10-13'], env: ['ok', '2026-10-15'] },
    'RW115-0455': { traffic: ['idle'], coord: ['hold', null, '自動檢查發現與 RW115-0452 瓦斯管線汰換重疊 140 m（CF-033）。'], env: ['idle'] },
    'RW115-0450': { traffic: ['returned', '2026-10-20', '交通維持計畫缺夜間照明及警示燈配置，請補正後重送。'], coord: ['ok', '2026-10-14'], env: ['ok', '2026-10-15'] },
    'RW115-0427': { traffic: ['ok', '2026-10-21', '緊急搶修現場會勘同意，限佔用內側車道。'], coord: ['hold', null, '與 RW115-0398 電力汰換同段施工（CF-031），需現場協調車道配置。'], env: ['pending'] },
  };
  const COSIGN_NOTES = {
    traffic: ['同意，施工區前 100 m 須設置預告牌面及閃光警示燈。', '同意，尖峰時段（07–09、17–19）不得佔用車道。', '同意，夜間施工須設置 LED 導引燈號並派旗手指揮。'],
    coord: ['經比對管線圖資無衝突，同意。', '同意，開挖前應通知相鄰管線單位會同試挖。', '同意，請於開挖前 3 日申報開工並上傳試挖照片。'],
    env: ['同意，須使用低噪音機具並灑水抑制揚塵。', '同意，夜間施工噪音不得超過第三類管制區標準。', '同意，剩餘土石方須運至合法收容處理場所。'],
  };

  const ACTIVITY = [
    { t: '2026-10-22 09:42', who: 'zhou', tone: 'ok', text: '核准 {RW115-0444} 污水壓力管新設（濱海路）' },
    { t: '2026-10-22 09:05', who: 'sys', tone: 'accent', text: '自動衝突檢查完成：{RW115-0464} 文昌路，無衝突' },
    { t: '2026-10-22 08:30', who: 'org:sewer', tone: 'warn', text: '{RW115-0423} 雲嶺路申報開工' },
    { t: '2026-10-21 17:20', who: 'sys', tone: 'danger', text: '偵測衝突 CF-031：{RW115-0427} × {RW115-0398}（澄江大道）' },
    { t: '2026-10-21 16:48', who: 'org:telecom', tone: 'warn', text: '補辦緊急挖掘申請 {RW115-0427}' },
    { t: '2026-10-21 15:12', who: 'huang', tone: 'ok', text: '環保會辦同意 {RW115-0446}' },
    { t: '2026-10-21 14:30', who: 'zhou', tone: 'ok', text: '核准 {RW115-0437}、{RW115-0458}' },
    { t: '2026-10-21 10:02', who: 'org:water', tone: '', text: '{RW115-0405} 山腳路完工報告' },
    { t: '2026-10-20 16:40', who: 'chen', tone: 'danger', text: '退回 {RW115-0450}：交通維持計畫缺夜間照明配置' },
    { t: '2026-10-20 11:15', who: 'zhou', tone: 'ok', text: '核准 {RW115-0433}（附條件）、{RW115-0457}' },
  ];

  const DATA = { permits: PERMITS, roads: ROADS, districts: DISTRICTS, people: PEOPLE, activity: ACTIVITY };
  Object.assign(App, { DATA, UTIL, UTIL_ORDER, STATUS, STATUS_ORDER, STAGES, COSIGN_DEPTS, ACCEPTANCE, CONFLICT_STATUS });

  /* ---------- 查詢 ---------- */
  const getPermit = id => PERMIT_BY_ID.get(id) || null;
  const roadOf = p => ROAD_BY_ID[p.roadId] || null;
  const isPending = p => PENDING.has(p.status);
  const onDate = (p, iso) => { const n = dayNum(iso); return n >= p.d0 && n <= p.d1; };
  function progress(p, iso = TODAY) {
    const day = clamp(dayNum(iso) - p.d0 + 1, 0, p.days);
    return { day, total: p.days, frac: day / p.days };
  }
  const permitUrl = id => `permit.html?id=${encodeURIComponent(id)}`;
  const param = name => new URLSearchParams(location.search).get(name);

  let conflictCache = null;
  let newConflictSeq = 34;
  function conflicts() {
    if (conflictCache) return conflictCache;
    const list = [];
    const ps = PERMITS.filter(p => p.status !== 'returned');
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const from = Math.max(a.d0, b.d0), to = Math.min(a.d1, b.d1);
      if (from > to) continue;
      let poly = null, s0 = 0, s1 = 0, roadName;
      if (a.roadId && a.roadId === b.roadId) {
        // 「同路段時間重疊」：同一條路、里程區間重疊即視為衝突（即使車道不同，交通仍會疊加）
        s0 = Math.max(a.s0, b.s0); s1 = Math.min(a.s1, b.s1);
        if (s1 <= s0) continue;
        const road = ROAD_BY_ID[a.roadId];
        poly = geo.strip(road.line, road.cum, s0, s1, Math.min(a.o0, b.o0), Math.max(a.o1, b.o1));
        roadName = segmentOf(road, s0);
      } else if (!a.roadId || !b.roadId) {
        if (!geo.intersects(a.poly, b.poly)) continue;
        roadName = (a.roadId ? a : b).segment;
      } else continue;
      const key = [a.id, b.id].sort().join('|');
      const meta = CONFLICT_META[key] || (CONFLICT_META[key] = { code: 'CF-0' + (newConflictSeq++), status: 'open', note: '系統自動偵測：同路段施工期間重疊，待管線協調股確認施工順序。', by: 'sys' });
      const [first, second] = a.id < b.id ? [a, b] : [b, a];
      list.push({
        id: meta.code, key, a: first, b: second, roadId: a.roadId === b.roadId ? a.roadId : null, road: roadName,
        s0, s1, length: s1 - s0, from: isoOf(from), to: isoOf(to), d0: from, d1: to, days: to - from + 1,
        status: meta.status, note: meta.note, by: meta.by,
        poly, center: poly ? geo.centroid(poly) : geo.centroid(a.poly), bbox: poly ? geo.bbox([poly]) : geo.bbox([a.poly, b.poly]),
      });
    }
    list.sort((x, y) => x.d0 - y.d0);
    conflictCache = list;
    return list;
  }
  const conflictsOf = p => conflicts().filter(c => c.a === p || c.b === p);
  const conflictsOn = iso => { const n = dayNum(iso); return conflicts().filter(c => n >= c.d0 && n <= c.d1); };

  function cosignOf(p) {
    const ov = COSIGN_OVERRIDE[p.id];
    const h = hash(p.id);
    return COSIGN_DEPTS.map((d, i) => {
      const person = PEOPLE[d.who];
      let state, date = null, note = '';
      if (ov) {
        [state, date = null, note = ''] = ov[d.key];
      } else if (p.status === 'checking') {
        state = 'idle';
      } else if (p.status === 'review' || p.status === 'coordinating') {
        state = 'pending';
      } else {
        state = 'ok';
        // 會辦完成日落在申請與核准之間，三單位錯開 1–2 天
        const end = p.approved || p.start;
        date = isoOf(Math.min(dayNum(end) - 1, dayNum(p.applied) + 3 + i * 2 + (h % 2)));
      }
      if (!note && state === 'ok') note = COSIGN_NOTES[d.key][(h >> (i * 3)) % 3];
      if (!note && state === 'pending') note = '會辦中，尚未回覆。';
      if (!note && state === 'idle') note = '待衝突檢查完成後送會辦。';
      return { dept: d.key, name: d.name, unit: d.unit, person, state, date, note };
    });
  }

  function acceptanceOf(p) {
    const h = hash(p.id + 'acc');
    const vals = {
      flat: `${(0.3 + (h % 3) * 0.1).toFixed(1)} cm`, mark: '符合', mill: `外擴 ${32 + (h % 9)} cm`,
      thick: `${(5.1 + (h % 4) * 0.1).toFixed(1)} cm`, comp: `${(96.4 + (h % 15) / 10).toFixed(1)}%`,
      cover: `${(0.2 + (h % 3) * 0.1).toFixed(1)} cm`, clean: '完成',
    };
    return ACCEPTANCE.map(item => {
      let state = 'pending', value = '—', date = null;
      if (p.status === 'accepted') { state = 'pass'; value = vals[item.key]; date = p.accepted; }
      else if (p.status === 'paving') {
        // 兩件刨鋪驗收中的案子各有不同進度，W10 的平整度不合格需複驗
        const doneKeys = p.id === 'RW115-0379' ? ['flat', 'mill', 'thick', 'cover'] : ['flat', 'mill', 'cover'];
        if (doneKeys.includes(item.key)) {
          date = addDays(p.end, 9);
          if (p.id === 'RW115-0379' && item.key === 'flat') { state = 'fail'; value = '0.9 cm'; }
          else { state = 'pass'; value = vals[item.key]; }
        }
      }
      return { ...item, state, value, date };
    });
  }

  function trafficOf(p) {
    const road = roadOf(p);
    if (!road) return { closure: '依申請圖說佔用', side: '—', lanes: '—', hours: p.hours, detour: false, cones: Math.round(Math.sqrt(p.area) * 1.5), signs: 4, flaggers: 1, speed: '30 km/h' };
    const half = road.w / 2, ratio = (p.o1 - p.o0) / road.w, oc = (p.o0 + p.o1) / 2;
    const mid = geo.at(road.line, road.cum, (p.s0 + p.s1) / 2);
    // 依法向量判斷施工位於道路哪一側（地圖北方朝上）
    const nx = -mid[3] * Math.sign(oc || 1), ny = mid[2] * Math.sign(oc || 1);
    const side = Math.abs(ny) > Math.abs(nx) ? (ny < 0 ? '北側' : '南側') : (nx < 0 ? '西側' : '東側');
    const outer = Math.abs(oc) > half * .4;
    const detour = ratio > .45;
    return {
      closure: detour ? `封閉${side}全部車道，車流改道` : `封閉${side}${outer ? '外側' : '內側'}車道`,
      side, lanes: { A: '雙向 6 車道', B: '雙向 4 車道', C: '雙向 2 車道' }[road.cls],
      hours: p.hours, detour, cones: Math.round(p.length / 5), signs: detour ? 8 : 4,
      flaggers: road.cls === 'A' ? 2 : 1, speed: { A: '40 km/h', B: '30 km/h', C: '20 km/h' }[road.cls],
    };
  }

  // 流程節點：完成日來自資料，不另外存，避免與狀態不一致
  function timelineOf(p) {
    const st = STATUS[p.status].stage;
    const cos = cosignOf(p);
    const cosDone = cos.filter(c => c.date).map(c => c.date).sort();
    const hold = p.status === 'coordinating' || cos.some(c => c.state === 'hold');
    const dates = [
      p.applied, p.applied, cosDone.length === 3 ? cosDone[2] : null, p.approved,
      st >= 4 ? p.start : null, st >= 5 ? p.end : null, p.accepted,
    ];
    const notes = [
      p.emergency ? '緊急搶修補辦' : '線上申請',
      p.status === 'checking' ? '自動檢查中' : conflictsOf(p).length ? `${conflictsOf(p).length} 件衝突` : '無衝突',
      `${cos.filter(c => c.state === 'ok').length}/3 單位同意`,
      p.conditional ? '附條件核准' : p.approved ? '核准' : '',
      st >= 4 ? `${p.days} 天` : '', '', '',
    ];
    return STAGES.map((label, i) => {
      let state = 'todo';
      if (p.status === 'returned') state = i === 0 ? 'hold' : 'todo';
      else if (p.status === 'accepted') state = 'done';
      else if (i < st) state = 'done';
      else if (i === st) state = (hold && (i === 1 || i === 2)) ? 'hold' : 'current';
      // 緊急搶修先施工後補辦：會辦與核准尚未完成但已在施工
      if (p.emergency && (i === 2 || i === 3) && state === 'done') state = i === 2 ? 'hold' : 'todo';
      return { stage: i, label, date: dates[i], state, note: notes[i] };
    });
  }

  function dailyLoad(from, to) {
    const out = [];
    const d0 = dayNum(from), d1 = dayNum(to);
    const live = PERMITS.filter(p => p.status !== 'returned');
    const cs = conflicts();
    for (let n = d0; n <= d1; n++) {
      const counts = { power: 0, water: 0, gas: 0, telecom: 0, sewer: 0 };
      let total = 0;
      for (const p of live) if (n >= p.d0 && n <= p.d1) { counts[p.utility]++; total++; }
      out.push({ iso: isoOf(n), counts, total, clash: cs.some(c => n >= c.d0 && n <= c.d1) });
    }
    return out;
  }

  function counts() {
    const [w0, w1] = weekRange(TODAY);
    const n = s => PERMITS.filter(p => p.status === s).length;
    return {
      total: PERMITS.length,
      active: n('active'),
      review: n('review'),
      pending: n('review') + n('checking') + n('coordinating'),
      conflicts: conflicts().filter(c => c.status !== 'resolved').length,
      approvedWeek: PERMITS.filter(p => p.approved && p.approved >= w0 && p.approved <= w1).length,
      paving: n('done') + n('paving'),
    };
  }

  function checkConflicts({ poly, start, end, exclude = null }) {
    const d0 = dayNum(start), d1 = dayNum(end);
    return PERMITS.filter(p => p !== exclude && p.status !== 'returned' && p.d0 <= d1 && p.d1 >= d0 && geo.intersects(poly, p.poly))
      .map(p => { const from = Math.max(d0, p.d0), to = Math.min(d1, p.d1); return { permit: p, from: isoOf(from), to: isoOf(to), days: to - from + 1 }; });
  }

  /* ---------- 事件與資料變更 ---------- */
  const on = (name, fn) => document.addEventListener('app:' + name, e => fn(e.detail));
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent('app:' + name, { detail }));
  function dataChanged() { conflictCache = null; emit('data'); }

  function setStatus(p, status, { note = '', by = 'lin' } = {}) {
    const prev = { status: p.status, approved: p.approved, accepted: p.accepted, returned: p.returned };
    const entry = { t: `${TODAY} ${NOW_TIME}`, who: by, tone: status === 'returned' ? 'danger' : 'ok', text: `${STATUS[status].label} {${p.id}}${note ? '：' + note : ''}` };
    p.status = status;
    if (status === 'approved' && !p.approved) p.approved = TODAY;
    if (status === 'accepted' && !p.accepted) p.accepted = TODAY;
    if (status === 'returned') p.returned = TODAY;
    ACTIVITY.unshift(entry);
    dataChanged();
    return {
      undo() {
        Object.assign(p, prev);
        const i = ACTIVITY.indexOf(entry);
        if (i >= 0) ACTIVITY.splice(i, 1);
        dataChanged();
      },
    };
  }

  function addPermit(d) {
    const max = PERMITS.reduce((m, p) => Math.max(m, +p.id.slice(-4)), 0);
    const id = `RW115-${String(max + 1).padStart(4, '0')}`;
    const center = geo.centroid(d.poly);
    const near = nearestRoad(center);
    const dist = districtAt(center);
    const p = {
      id, utility: d.utility, org: UTIL[d.utility].org, contact: d.contact || UTIL[d.utility].contact,
      roadId: null, road: near.road.name, segment: segmentOf(near.road, near.s), address: d.address || `${segmentOf(near.road, near.s)} 一帶`,
      station: `${fmt.station(Math.max(0, near.s - 50))} 附近`,
      s0: 0, s1: 0, o0: 0, o1: 0, poly: d.poly, center, bbox: geo.bbox([d.poly]), area: Math.round(geo.area(d.poly)),
      length: Math.round(Math.max(geo.bbox([d.poly])[2] - geo.bbox([d.poly])[0], geo.bbox([d.poly])[3] - geo.bbox([d.poly])[1])),
      start: d.start, end: d.end, d0: dayNum(d.start), d1: dayNum(d.end), days: fmt.span(d.start, d.end),
      status: 'checking', applied: TODAY, approved: null, accepted: null, returned: null,
      purpose: d.purpose || '管線工程', method: d.method || '明挖', depth: d.depth || DEPTH[d.utility],
      hours: d.hours || '日間 09:00–16:00', contractor: d.contractor || CONTRACTORS[d.utility][0],
      district: dist.name, districtId: dist.id, emergency: false, conditional: false, flowD: '',
    };
    PERMITS.push(p);
    PERMIT_BY_ID.set(id, p);
    ACTIVITY.unshift({ t: `${TODAY} ${NOW_TIME}`, who: 'lin', tone: 'accent', text: `送出申請 {${id}}（${UTIL[d.utility].name}・${p.segment}）` });
    dataChanged();
    return p;
  }

  Object.assign(App, {
    getPermit, roadOf, isPending, onDate, progress, permitUrl, param, conflicts, conflictsOf, conflictsOn,
    cosignOf, acceptanceOf, trafficOf, timelineOf, dailyLoad, counts, checkConflicts, nearestRoad, districtAt,
    on, emit, setStatus, addPermit,
  });

  /* =====================================================================
     標記產生器
     ===================================================================== */
  const ICONS = {
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    draw: '<path d="M4 19 8 6l7 9 5-7"/><circle cx="4" cy="19" r="1.6"/><circle cx="8" cy="6" r="1.6"/><circle cx="15" cy="15" r="1.6"/><circle cx="20" cy="8" r="1.6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    locate: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevD: '<path d="m6 9 6 6 6-6"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    undo: '<path d="M9 5 4 10l5 5"/><path d="M4 10h10a6 6 0 0 1 0 12h-3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.1"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
    cone: '<path d="M9.5 4h5l4 15h-13l4-15Z"/><path d="M8.2 10h7.6M7 14.5h10M3 20h18"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    ruler: '<path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>',
    logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    power: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z"/>',
    water: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>',
    gas: '<path d="M12 21.5a6 6 0 0 0 6-6c0-4-3-6.5-4-10.5-2 2-3 4.5-3 6.5-1.2-.8-2-2-2.2-3.8C7 9.5 6 12.5 6 15.5a6 6 0 0 0 6 6Z"/>',
    telecom: '<path d="M12 12.5v9M8.5 21.5h7"/><circle cx="12" cy="10" r="2"/><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4"/>',
    sewer: '<path d="M3 7.5c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2M3 12.5c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2"/><path d="M12 15v6M9 18.5l3 2.5 3-2.5"/>',
    hard: '<path d="M4 17h16v2H4zM5 17a7 7 0 0 1 14 0"/><path d="M10 10.5V6.8a2 2 0 0 1 4 0v3.7"/>',
    paving: '<rect x="3" y="14" width="18" height="5" rx="1"/><circle cx="8" cy="9" r="3.5"/><path d="M11.5 9H19v5"/>',
    stack: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  };
  const icon = (name, cls = 'icon') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const utilChip = (key, { plain = false, label } = {}) => `<span class="util util--${key}${plain ? ' util--plain' : ''}">${esc(label || UTIL[key].name)}</span>`;
  const statusBadge = status => `<span class="status status--${status}">${STATUS[status].label}</span>`;
  const pidLink = id => `<a class="pid" href="${permitUrl(id)}">${esc(id)}</a>`;

  function flowTrack(p) {
    return `<ol class="flow" aria-label="許可流程">${timelineOf(p).map(s => `
      <li class="flow__step${s.state === 'done' ? ' is-done' : s.state === 'current' ? ' is-current' : s.state === 'hold' ? ' is-hold' : ''}"${s.state === 'current' || s.state === 'hold' ? ' aria-current="step"' : ''}>
        <span class="flow__node">${s.state === 'done' ? icon('check', 'icon icon--sm') : s.state === 'hold' ? '!' : s.stage + 1}</span>
        <span class="flow__label">${s.label}</span>
        <span class="flow__date">${s.date ? fmt.md(s.date) : (s.note || '—')}</span>
      </li>`).join('')}</ol>`;
  }

  const EMPTY_ART = {
    map: '<rect x="14" y="14" width="92" height="56" rx="6" fill="#EEF1EC" stroke="#CBD3C9"/><path d="M14 46c20-8 30 6 50-2s28-10 42-4" stroke="#BFD9F2" stroke-width="8" fill="none"/><path d="M40 14v56M14 32h92" stroke="#fff" stroke-width="5"/><circle cx="76" cy="36" r="13" fill="none" stroke="#18201D" stroke-width="2" stroke-dasharray="4 3"/><path d="m85 45 9 9" stroke="#18201D" stroke-width="3" stroke-linecap="round"/>',
    search: '<rect x="20" y="18" width="80" height="12" rx="3" fill="#EEF1EC"/><rect x="20" y="38" width="64" height="12" rx="3" fill="#EEF1EC"/><rect x="20" y="58" width="72" height="12" rx="3" fill="#EEF1EC"/><circle cx="82" cy="50" r="14" fill="#fff" stroke="#18201D" stroke-width="2.5"/><path d="m92 60 9 9" stroke="#18201D" stroke-width="3" stroke-linecap="round"/>',
    doc: '<path d="M36 10h36l14 14v52H36z" fill="#fff" stroke="#CBD3C9" stroke-width="2"/><path d="M72 10v14h14" fill="none" stroke="#CBD3C9" stroke-width="2"/><path d="M46 40h30M46 50h30M46 60h18" stroke="#DDE3DB" stroke-width="4" stroke-linecap="round"/>',
  };
  const emptyState = ({ art = 'search', title = '沒有符合條件的資料', text = '' } = {}) =>
    `<div class="empty"><svg class="empty__art" viewBox="0 0 120 84" aria-hidden="true">${EMPTY_ART[art]}</svg><p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}</div>`;

  function personName(who) {
    if (who.startsWith('org:')) { const u = UTIL[who.slice(4)]; return `${u.contact}（${u.short}）`; }
    return PEOPLE[who] ? PEOPLE[who].name : who;
  }
  // 活動文字中的 {案號} 轉成連結
  const linkify = text => esc(text).replace(/\{(RW\d{3}-\d{4})\}/g, (_, id) => pidLink(id));

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  Object.assign(App, { icon, utilChip, statusBadge, pidLink, flowTrack, emptyState, personName, linkify, svgEl });

  /* =====================================================================
     浮層：toast / modal / confirm / popover
     ===================================================================== */
  let toastRoot = null;
  // showModal 會把 dialog 放進 top layer，body 底下的 toast 會被蓋住；因此 toast 容器跟著最上層的 dialog 走
  function placeToasts() {
    if (!toastRoot) return;
    const dialogs = $$('dialog[open]');
    const host = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
    if (toastRoot.parentNode !== host) host.appendChild(toastRoot);
  }
  function toast(title, { desc = '', tone = 'info', action = null, duration = 4200 } = {}) {
    if (!toastRoot) {
      toastRoot = document.createElement('div');
      toastRoot.className = 'toasts';
      toastRoot.setAttribute('role', 'status');
      toastRoot.setAttribute('aria-live', 'polite');
    }
    placeToasts();
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    const ic = { ok: 'check', warn: 'alert', danger: 'alert', info: 'info' }[tone] || 'info';
    el.innerHTML = `<span class="toast__icon">${icon(ic, 'icon icon--sm')}</span>
      <div><p class="toast__title">${esc(title)}</p>${desc ? `<p class="toast__desc">${esc(desc)}</p>` : ''}</div>
      <div class="toast__actions">${action ? `<button class="toast__btn" type="button">${esc(action.label)}</button>` : ''}<button class="toast__x" type="button" aria-label="關閉通知">${icon('x', 'icon icon--sm')}</button></div>`;
    toastRoot.appendChild(el);
    let timer = 0;
    const close = () => {
      if (!el.isConnected || el.classList.contains('is-leaving')) return;
      clearTimeout(timer);
      el.classList.add('is-leaving');
      // reduced-motion 下沒有 animationend，直接移除
      if (reduceMotion()) el.remove(); else el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    el.querySelector('.toast__x').addEventListener('click', close);
    if (action) el.querySelector('.toast__btn').addEventListener('click', () => { action.onClick(); close(); });
    timer = setTimeout(close, duration);
    el.addEventListener('pointerenter', () => clearTimeout(timer));
    el.addEventListener('pointerleave', () => { timer = setTimeout(close, 2000); });
    return { close };
  }

  const openModals = [];
  function modal({ eyebrow = '', title = '', body = '', size = 'md', actions = [], onClose = null } = {}) {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    const titleId = 'mt-' + Math.random().toString(36).slice(2, 8);
    dlg.setAttribute('aria-labelledby', titleId);
    dlg.innerHTML = `<div class="modal__card modal__card--${size}">
      <div class="modal__head"><div>${eyebrow ? `<p class="modal__eyebrow">${esc(eyebrow)}</p>` : ''}<h2 class="modal__title" id="${titleId}">${esc(title)}</h2></div>
      <button class="icon-btn modal__close" type="button" aria-label="關閉">${icon('x')}</button></div>
      <div class="modal__body"></div>${actions.length ? '<div class="modal__foot"></div>' : ''}</div>`;
    const bodyEl = dlg.querySelector('.modal__body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (dlg.open) dlg.close();
    };
    dlg.addEventListener('close', () => {
      closed = true;
      const i = openModals.indexOf(api);
      if (i >= 0) openModals.splice(i, 1);
      dlg.remove();
      placeToasts();
      if (onClose) onClose();
    });
    const foot = dlg.querySelector('.modal__foot');
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${a.variant ? ' btn--' + a.variant : ''}`;
      b.textContent = a.label;
      if (a.autofocus) b.autofocus = true;
      b.addEventListener('click', () => a.onClick ? a.onClick(close) : close());
      foot.appendChild(b);
    });
    dlg.querySelector('.modal__close').addEventListener('click', close);
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    const api = { el: dlg, body: bodyEl, close };
    openModals.push(api);
    placeToasts();
    return api;
  }
  function confirmDialog({ title = '確認', message = '', confirmLabel = '確認', cancelLabel = '取消', tone = 'primary' } = {}) {
    return new Promise(resolve => {
      let answered = false;
      const answer = (v, close) => { answered = true; resolve(v); close(); };
      modal({
        title, body: `<p>${esc(message)}</p>`, size: 'sm',
        actions: [
          { label: cancelLabel, variant: 'ghost', onClick: c => answer(false, c) },
          { label: confirmLabel, variant: tone, autofocus: true, onClick: c => answer(true, c) },
        ],
        onClose: () => { if (!answered) resolve(false); },
      });
    });
  }

  let activePop = null;
  function popover(anchor, content, { className = '', onClose = null, width } = {}) {
    if (activePop) {
      const same = activePop.anchor === anchor;
      activePop.close();
      if (same) return null;
    }
    const el = document.createElement('div');
    el.className = 'pop ' + className;
    if (width) el.style.width = width + 'px';
    if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      el.style.top = Math.round(r.bottom + 8) + 'px';
      el.style.left = Math.round(clamp(r.right - w, 8, innerWidth - w - 8)) + 'px';
    };
    place();
    anchor.setAttribute('aria-expanded', 'true');
    const outside = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
    const close = () => {
      if (!el.isConnected) return;
      el.remove();
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('resize', place);
      if (activePop && activePop.el === el) activePop = null;
      if (onClose) onClose();
    };
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    addEventListener('resize', place);
    activePop = { el, anchor, close };
    return activePop;
  }

  // 由鍵盤觸發的 Escape（含程式送出的合成事件）也要能關閉浮層
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (activePop) { activePop.close(); return; }
    if (openModals.length) { e.preventDefault(); openModals[openModals.length - 1].close(); return; }
    if (document.documentElement.classList.contains('nav-open')) toggleNav(false);
  });

  /* ---------- Tabs ---------- */
  function tabs(list, { onChange } = {}) {
    const items = $$('[role="tab"]', list);
    let ink = list.querySelector('.tabs__ink');
    if (!ink) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    let current = Math.max(0, items.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    const moveInk = () => {
      const t = items[current];
      if (!t || !t.offsetWidth) return;
      ink.style.transform = `translateX(${t.offsetLeft}px) scaleX(${t.offsetWidth})`;
    };
    const select = (i, focus = false) => {
      current = i;
      items.forEach((t, j) => {
        const on = j === i;
        t.setAttribute('aria-selected', String(on));
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
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          select((i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length, true);
        }
      });
    });
    items.forEach((t, j) => { t.tabIndex = j === current ? 0 : -1; });
    requestAnimationFrame(moveInk);
    if ('ResizeObserver' in window) new ResizeObserver(moveInk).observe(list);
    return { select, refresh: moveInk, get index() { return current; } };
  }

  Object.assign(App, { toast, modal, confirm: confirmDialog, popover, tabs });

  /* =====================================================================
     地圖引擎
     ===================================================================== */
  const PARKS = (() => {
    const rot = (cx, cy, w, h, deg) => {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c]);
    };
    const bank = (body, s0, s1, sideSign, inner, outer) => {
      const idx = body.cum.map((s, i) => i).filter(i => body.cum[i] >= s0 && body.cum[i] <= s1);
      const at = (i, d) => [body.line[i][0] + body.ns[i][0] * sideSign * (body.hw[i] + d), body.line[i][1] + body.ns[i][1] * sideSign * (body.hw[i] + d)];
      return idx.map(i => at(i, outer)).concat(idx.slice().reverse().map(i => at(i, inner)));
    };
    const coastIdx = COAST.map((p, i) => i).filter(i => COAST[i][0] > 3560 && COAST[i][1] < 1300);
    const cn = geo.normals(COAST);
    const coastPark = coastIdx.map(i => [COAST[i][0] - cn[i][0] * 75, COAST[i][1] - cn[i][1] * 75])
      .concat(coastIdx.slice().reverse().map(i => [COAST[i][0] + cn[i][0] * 6, COAST[i][1] + cn[i][1] * 6]));
    return [
      { name: '中央公園', poly: rot(1300, 1290, 230, 150, 6) },
      { name: '文昌公園', poly: rot(1840, 1640, 140, 110, 6) },
      { name: '山腳運動公園', poly: rot(470, 1330, 190, 120, -14) },
      { name: '港埕公園', poly: rot(2060, 1930, 150, 100, -16) },
      { name: '北岸河濱公園', poly: bank(RIVER, 1150, 2560, -1, -4, 52) },
      { name: '舊城河濱步道', poly: bank(RIVER, 1100, 1780, 1, -4, 36) },
      { name: '新灣海濱公園', poly: coastPark },
      { name: '溪洲濕地', poly: [[3000, 1405], [3200, 1480], [3340, 1580], [3300, 1720], [3110, 1650], [2980, 1590]] },
    ];
  })();

  const GRIDS = [
    { d: 'yunling', ang: -8, bw: 120, bh: 92, sw: 9, dens: .5, drop: .14, clip: [[430, 560], [1100, 470], [1100, 966], [1000, 960], [650, 900], [300, 800], [430, 700]] },
    { d: 'beian', ang: 0, bw: 150, bh: 110, sw: 12, dens: .88, drop: .06 },
    { d: 'xinwan', ang: 3, bw: 230, bh: 170, sw: 16, dens: .78, drop: .03, big: true },
    { d: 'shanjiao', ang: -14, bw: 130, bh: 100, sw: 11, dens: .8, drop: .07 },
    { d: 'jiucheng', ang: 6, bw: 88, bh: 72, sw: 9, dens: .97, drop: .05, row: true },
    { d: 'xizhou', ang: 18, bw: 120, bh: 64, sw: 9, dens: .6, drop: .1 },
    { d: 'gangcheng', ang: -16, bw: 170, bh: 96, sw: 13, dens: .85, drop: .05, big: true },
    { d: 'yantian', ang: -4, bw: 220, bh: 140, sw: 10, dens: .5, drop: .12, clip: [[0, 1500], [1000, 1500], [1000, 1700], [1320, 1790], [1250, 1850], [0, 1700]] },
  ];
  const SALT = [[0, 1720], [300, 1715], [1240, 1868], [1470, 2040], [1470, 2110], [1000, 2172], [500, 2140], [0, 2170]];
  const PEAKS = [
    { c: [300, 150], n: 8, step: 44, ph: [.4, 2.1, 1.3] },
    { c: [880, 110], n: 5, step: 42, ph: [1.7, .3, 2.6] },
    { c: [140, 560], n: 3, step: 38, ph: [2.2, 1.1, .2] },
  ];

  // 底圖字串每頁只產生一次（建物數千筆），多個地圖共用；__P__ 會替換成各實例的 id 前綴
  let BASE = null;
  function buildBase() {
    if (BASE) return BASE;
    const R = rng(1150422);
    const f = n => Math.round(n * 10) / 10;
    const D = geo.pathD;
    const defs = [], out = [];

    // 地形：森林與等高線
    const blob = (c, r, ph, n = 72) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = i / n * Math.PI * 2;
        const rr = r * (1 + .14 * Math.sin(3 * t + ph[0]) + .08 * Math.sin(5 * t + ph[1]) + .05 * Math.sin(2 * t + ph[2]));
        pts.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr]);
      }
      return pts;
    };
    const yun = DISTRICT_BY_ID.yunling.poly;
    defs.push(`<clipPath id="__P__c-yun"><path d="${D(yun)}"/></clipPath>`);
    defs.push(`<pattern id="__P__trees" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="6" cy="7" r="3.2" fill="#C6DEBE"/><circle cx="19" cy="18" r="2.6" fill="#C6DEBE"/></pattern>`);
    let forest = '', contours = '', contoursIdx = '';
    PEAKS.forEach(pk => {
      const fd = D(blob(pk.c, pk.step * (pk.n + .6), pk.ph));
      forest += fd;
      for (let m = 1; m <= pk.n; m++) {
        const d = D(blob(pk.c, pk.step * m, pk.ph));
        if (m % 4 === 0) contoursIdx += d; else contours += d;
      }
    });
    out.push(`<g clip-path="url(#__P__c-yun)"><path class="bm-forest" d="${forest}"/><path d="${forest}" fill="url(#__P__trees)"/></g>`);

    // 公園
    out.push(`<path class="bm-park" d="${PARKS.map(p => D(p.poly)).join('')}"/>`);

    // 建物與巷道：每區一組旋轉網格，依區界裁切
    const majorNear = (pt, pad) => ROADS.some(r => {
      const b = r._bb || (r._bb = geo.bbox([r.line]));
      if (pt[0] < b[0] - 60 || pt[0] > b[2] + 60 || pt[1] < b[1] - 60 || pt[1] > b[3] + 60) return false;
      return geo.distToLine(pt, r.line)[0] < r.w / 2 + pad;
    });
    const inPark = pt => PARKS.some(p => geo.contains(p.poly, pt));
    const bldg = [], streets = [];
    GRIDS.forEach(g => {
      const clipPoly = g.clip || DISTRICT_BY_ID[g.d].poly;
      const cid = `__P__g-${g.d}`;
      defs.push(`<clipPath id="${cid}"><path d="${D(clipPoly)}"/></clipPath>`);
      const [x0, y0, x1, y1] = geo.bbox([clipPoly]);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const a = g.ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const toW = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [(x - cx) * ca + (y - cy) * sa, -(x - cx) * sa + (y - cy) * ca]);
      const umin = Math.min(...corners.map(c => c[0])), umax = Math.max(...corners.map(c => c[0]));
      const vmin = Math.min(...corners.map(c => c[1])), vmax = Math.max(...corners.map(c => c[1]));
      const i0 = Math.floor(umin / g.bw), i1 = Math.ceil(umax / g.bw), j0 = Math.floor(vmin / g.bh), j1 = Math.ceil(vmax / g.bh);
      let sd = '';
      const seg = (p, q) => { sd += `M${f(p[0])},${f(p[1])}L${f(q[0])},${f(q[1])}`; };
      for (let i = i0; i <= i1; i++) for (let j = j0; j < j1; j++) if (R() > g.drop) seg(toW(i * g.bw, j * g.bh), toW(i * g.bw, (j + 1) * g.bh));
      for (let j = j0; j <= j1; j++) for (let i = i0; i < i1; i++) if (R() > g.drop) seg(toW(i * g.bw, j * g.bh), toW((i + 1) * g.bw, j * g.bh));
      streets.push({ cid, d: sd, w: g.sw });

      let bd = '';
      const rect = (u, v, w, h) => {
        if (w < 3 || h < 3) return;
        const c = toW(u + w / 2, v + h / 2);
        if (majorNear(c, 4 + Math.max(w, h) * .25)) return;
        const p = [toW(u, v), toW(u + w, v), toW(u + w, v + h), toW(u, v + h)];
        bd += `M${f(p[0][0])},${f(p[0][1])}L${f(p[1][0])},${f(p[1][1])}L${f(p[2][0])},${f(p[2][1])}L${f(p[3][0])},${f(p[3][1])}Z`;
      };
      const inset = g.sw / 2 + 4;
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
        const c = toW((i + .5) * g.bw, (j + .5) * g.bh);
        if (!geo.contains(clipPoly, c) || R() > g.dens || inWater(c) || inPark(c)) continue;
        const a0 = i * g.bw + inset, b0 = j * g.bh + inset, W = g.bw - inset * 2, H = g.bh - inset * 2;
        const r = R();
        if (g.row) {
          // 舊城街屋：沿長邊排兩列連棟，背對背留出中庭
          const horiz = W >= H, Lx = horiz ? W : H, Dp = horiz ? H : W, depth = Dp * (.34 + R() * .1);
          for (let x = 0; x < Lx - 4;) {
            const w = Math.min(6 + R() * 8, Lx - x);
            if (R() > .06) horiz ? rect(a0 + x, b0, w - 1.2, depth) : rect(a0, b0 + x, depth, w - 1.2);
            if (R() > .12) { const d2 = depth * (.75 + R() * .25); horiz ? rect(a0 + x, b0 + H - d2, w - 1.2, d2) : rect(a0 + W - d2, b0 + x, d2, w - 1.2); }
            x += w;
          }
        } else if (g.big && r < .45) {
          const m = 6 + R() * 10;
          rect(a0 + m, b0 + m, W - m * 2, H - m * 2);
        } else if (r < .78) {
          const su = W * (.42 + R() * .16), sv = H * (.42 + R() * .16), gap = 6;
          rect(a0, b0, su - gap / 2, sv - gap / 2);
          if (R() > .15) rect(a0 + su + gap / 2, b0, W - su - gap / 2, sv - gap / 2);
          if (R() > .2) rect(a0, b0 + sv + gap / 2, su - gap / 2, H - sv - gap / 2);
          if (R() > .3) rect(a0 + su + gap / 2, b0 + sv + gap / 2, W - su - gap / 2, H - sv - gap / 2);
        } else {
          const horiz = W >= H, n = 3, gap = 5;
          const Lx = horiz ? W : H, Dp = (horiz ? H : W) * (.62 + R() * .2), w = (Lx - gap * (n - 1)) / n;
          for (let k = 0; k < n; k++) if (R() > .1) horiz ? rect(a0 + k * (w + gap), b0, w, Dp) : rect(a0, b0 + k * (w + gap), Dp, w);
        }
      }
      if (bd) bldg.push(`<g clip-path="url(#${cid})"><path class="bm-bldg" d="${bd}"/></g>`);
    });
    out.push(bldg.join(''));

    // 鹽田：鹽灘方格，三種結晶程度的色階
    defs.push(`<clipPath id="__P__c-salt"><path d="${D(SALT)}"/></clipPath>`);
    {
      const salt = ['', '', ''];
      const a = -4 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cx = 700, cy = 1950;
      const toW = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
      for (let i = -8; i <= 7; i++) for (let j = -3; j <= 3; j++) {
        const u = i * 118 + 4, v = j * 74 + 4, w = 110, h = 66;
        const c = toW(u + w / 2, v + h / 2);
        if (!geo.contains(SALT, c)) continue;
        const p = [toW(u, v), toW(u + w, v), toW(u + w, v + h), toW(u, v + h)];
        salt[Math.floor(R() * 3)] += D(p);
      }
      out.push(`<g clip-path="url(#__P__c-salt)"><path class="bm-salt-a" d="${salt[0]}"/><path class="bm-salt-b" d="${salt[1]}"/><path class="bm-salt-c" d="${salt[2]}"/></g>`);
    }

    // 巷道（先畫淺色邊線，再畫白色路面）
    out.push(streets.map(s => `<g clip-path="url(#${s.cid})"><path class="bm-street-casing" style="--w:${s.w}px" d="${s.d}"/><path class="bm-street" style="--w:${s.w}px" d="${s.d}"/></g>`).join(''));

    // 等高線
    out.push(`<g clip-path="url(#__P__c-yun)"><path class="bm-contour" d="${contours}"/><path class="bm-contour bm-contour--index" d="${contoursIdx}"/></g>`);

    // 行政區界：共用邊只畫一次，圖幅邊緣不畫
    {
      const seen = new Set();
      let bd = '';
      DISTRICTS.forEach(dd => dd.poly.forEach((p, i) => {
        const q = dd.poly[(i + 1) % dd.poly.length];
        const onEdge = (p[0] === q[0] && (p[0] === 0 || p[0] === WORLD.w)) || (p[1] === q[1] && (p[1] === 0 || p[1] === WORLD.h));
        const key = [p.join(','), q.join(',')].sort().join('|');
        if (onEdge || seen.has(key)) return;
        seen.add(key);
        bd += `M${p[0]},${p[1]}L${q[0]},${q[1]}`;
      }));
      out.push(`<path class="bm-bound" d="${bd}"/>`);
    }

    // 水域：先畫加粗的岸線，再用填色蓋掉內側，河海交界就不會留線
    const sea = D(SEA), river = D(RIVER.poly), branch = D(BRANCH.poly);
    defs.push(`<clipPath id="__P__water"><path d="${sea}"/><path d="${river}"/><path d="${branch}"/></clipPath>`);
    defs.push(`<clipPath id="__P__c-sea"><path d="${sea}"/></clipPath>`);
    out.push(`<path class="bm-water-edge" d="${sea}${river}${branch}"/><path class="bm-water" d="${sea}"/><path class="bm-water" d="${river}"/><path class="bm-water" d="${branch}"/>`);
    out.push(`<g clip-path="url(#__P__c-sea)"><path class="bm-bathy" d="${D(geo.offset(COAST, 150), false)}${D(geo.offset(COAST, 340), false)}${D(geo.offset(COAST, 560), false)}"/></g>`);

    // 港埕碼頭與防波堤
    {
      const coastY = x => { for (let i = 1; i < COAST.length; i++) if (COAST[i][0] >= x) { const a = COAST[i - 1], b = COAST[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return 0; };
      let piers = '', ware = '';
      [2030, 2250, 2470, 2690].forEach(x => {
        const y = coastY(x + 35);
        piers += D([[x, y - 30], [x + 70, y - 30], [x + 70, y + 190], [x, y + 190]]);
        ware += D([[x + 12, y + 18], [x + 58, y + 18], [x + 58, y + 86], [x + 12, y + 86]]) + D([[x + 12, y + 100], [x + 58, y + 100], [x + 58, y + 172], [x + 12, y + 172]]);
      });
      const bwLine = [[1880, 2440], [2400, 2395], [2920, 2338]];
      const bw = geo.strip(bwLine, geo.cum(bwLine), 0, geo.cum(bwLine)[2], -7, 7);
      out.push(`<path class="bm-breakwater" d="${D(bw)}"/><path class="bm-pier" d="${piers}"/><path class="bm-ware" d="${ware}"/>`);
    }

    // 幹道：橋梁邊線（只在水域內）→ 路緣 → 路面 → 車道線
    const order = ROADS.slice().sort((a, b) => 'CBA'.indexOf(a.cls) - 'CBA'.indexOf(b.cls));
    out.push(`<g clip-path="url(#__P__water)">${order.map(r => `<path class="bm-bridge" style="--w:${r.w}px" d="${D(r.line, false)}"/>`).join('')}</g>`);
    out.push(order.map(r => `<path class="bm-casing" style="--w:${r.w}px" d="${D(r.line, false)}"/>`).join(''));
    out.push(order.map(r => `<path class="bm-road" style="--w:${r.w}px" d="${D(r.line, false)}"/>`).join(''));
    out.push(`<path class="bm-lane" d="${ROADS.filter(r => r.cls === 'A').map(r => D(r.line, false)).join('')}"/>`);

    // 圖幅外：道路沿切線延伸一段，再蓋一層淡色遮罩與圖廓線，像紙本圖幅的邊界
    {
      const onEdge = p => p[0] <= 0 || p[1] <= 0 || p[0] >= WORLD.w || p[1] >= WORLD.h;
      const stubs = [];
      ROADS.forEach(r => {
        const n = r.line.length;
        [[r.line[0], r.line[1]], [r.line[n - 1], r.line[n - 2]]].forEach(([e, q]) => {
          if (!onEdge(e)) return;
          const dx = e[0] - q[0], dy = e[1] - q[1], L = Math.hypot(dx, dy) || 1;
          stubs.push({ w: r.w, d: `M${f(e[0])},${f(e[1])}L${f(e[0] + dx / L * 700)},${f(e[1] + dy / L * 700)}` });
        });
      });
      out.push(stubs.map(x => `<path class="bm-casing" style="--w:${x.w}px" d="${x.d}"/>`).join('') + stubs.map(x => `<path class="bm-road" style="--w:${x.w}px" d="${x.d}"/>`).join(''));
      out.push(`<path class="bm-outside" fill-rule="evenodd" d="M-3000,-3000H7000V6000H-3000ZM0,0V${WORLD.h}H${WORLD.w}V0Z"/><rect class="bm-sheet" x="0" y="0" width="${WORLD.w}" height="${WORLD.h}"/>`);
    }

    BASE = { defs: defs.join(''), body: out.join('') };
    return BASE;
  }

  // 標註（螢幕座標層，字級不隨縮放改變）
  const LABELS = (() => {
    const L = [];
    const norm = a => { while (a > 90) a -= 180; while (a <= -90) a += 180; return a; };
    ROADS.forEach(r => r.lab.forEach((t, i) => {
      const [x, y, dx, dy] = geo.at(r.line, r.cum, r.len * t);
      const ang = norm(Math.atan2(dy, dx) * 180 / Math.PI);
      const vert = Math.abs(ang) > 58;
      const minK = r.cls === 'A' ? (i === 0 ? 0 : .42) : r.cls === 'B' ? (i === 0 ? .26 : .55) : .62;
      L.push({ text: r.name, x, y, rot: vert ? norm(ang - 90) : ang, cls: `lbl--${r.cls}${vert ? ' lbl--vert' : ''}`, minK, maxK: 99 });
    }));
    DISTRICTS.forEach(d => L.push({ text: d.name, x: d.label[0], y: d.label[1], rot: 0, cls: 'lbl--district', minK: 0, maxK: 1.5 }));
    [.27, .6].forEach(t => {
      const [x, y, dx, dy] = geo.at(RIVER.line, RIVER.cum, RIVER.cum[RIVER.cum.length - 1] * t);
      L.push({ text: '澄江', x, y, rot: norm(Math.atan2(dy, dx) * 180 / Math.PI), cls: 'lbl--water', minK: 0, maxK: 99 });
    });
    {
      const [x, y, dx, dy] = geo.at(BRANCH.line, BRANCH.cum, BRANCH.cum[BRANCH.cum.length - 1] * .5);
      L.push({ text: '溪洲水道', x, y, rot: norm(Math.atan2(dy, dx) * 180 / Math.PI), cls: 'lbl--water', minK: .4, maxK: 99 });
    }
    L.push({ text: '澄港灣', x: 3380, y: 2210, rot: 0, cls: 'lbl--water lbl--sea', minK: 0, maxK: 99 });
    [['市政府', 1690, 1320, .38], ['中央公園', 1300, 1290, .5], ['雲嶺山 ▲412', 300, 150, .22], ['港埕碼頭', 2420, 2250, .36], ['新灣產業園區', 3330, 430, .42], ['溪洲濕地', 3150, 1585, .5]]
      .forEach(([text, x, y, minK]) => L.push({ text, x, y, rot: 0, cls: 'lbl--poi', minK, maxK: 99, poi: true }));
    return L;
  })();

  let mapSeq = 0;
  function createMap(el, opts = {}) {
    const o = Object.assign({
      interactive: true, controls: true, frame: false, titleblock: null,
      permits: null, date: TODAY, layers: null, fit: 'permits', pad: 28, inset: null,
      selectable: true, tooltip: true, maxK: 5, label: '澄港市道路挖掘施工地圖',
      onSelect: null, onConflict: null, onClick: null, onPointer: null, onView: null, onDate: null,
    }, opts);
    const P = 'm' + (++mapSeq) + '-';
    const base = buildBase();
    const layers = Object.assign({ power: true, water: true, gas: true, telecom: true, sewer: true, pending: true, soon: true, conflicts: true, boundaries: true, buildings: true, labels: true, grid: false }, o.layers || {});
    let list = o.permits || PERMITS;
    let date = o.date;
    let k = 1, tx = 0, ty = 0, W = 0, H = 0, userMoved = false, selectedId = null, raf = 0, anim = 0, lastK = 0;
    const listeners = {};
    const fire = (type, detail) => (listeners[type] || []).forEach(fn => fn(detail));

    el.classList.add('map');
    el.setAttribute('data-anim', '');
    el.innerHTML = `
      <svg class="map__svg" xmlns="${SVGNS}"${o.interactive ? ' tabindex="0"' : ''} role="group" aria-roledescription="地圖" aria-label="${esc(o.label)}${o.interactive ? '（方向鍵平移、加減號縮放、0 回到全圖）' : ''}">
        <defs>${base.defs.replace(/__P__/g, P)}
          <pattern id="${P}hatch" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#D92D20" fill-opacity=".12"/><rect width="3" height="8" fill="#D92D20" fill-opacity=".85"/></pattern>
        </defs>
        <rect class="bm-land" x="-3000" y="-3000" width="10000" height="9000"/>
        <g class="map__world">${base.body.replace(/__P__/g, P)}<g class="map__works"></g><g class="map__clashes"></g><g class="map__overlay"></g></g>
        <g class="map__screen"><g class="map__grid"></g><g class="map__labels"></g><g class="map__pins"></g><g class="map__frame"></g></g>
      </svg>
      <div class="map__ui"><div class="map__slot map__slot--tl"></div><div class="map__slot map__slot--tr"></div><div class="map__slot map__slot--bl"></div><div class="map__slot map__slot--br"></div></div>
      <div class="map-tip" aria-hidden="true"></div>`;
    const svg = el.querySelector('.map__svg');
    const landRect = svg.querySelector(':scope > .bm-land');
    const world = svg.querySelector('.map__world');
    const worksG = svg.querySelector('.map__works');
    const clashG = svg.querySelector('.map__clashes');
    const overlay = svg.querySelector('.map__overlay');
    const gridG = svg.querySelector('.map__grid');
    const labelsG = svg.querySelector('.map__labels');
    const pinsG = svg.querySelector('.map__pins');
    const frameG = svg.querySelector('.map__frame');
    const hatchPat = svg.querySelector(`#${P}hatch`);
    const tip = el.querySelector('.map-tip');
    const slots = { tl: el.querySelector('.map__slot--tl'), tr: el.querySelector('.map__slot--tr'), bl: el.querySelector('.map__slot--bl'), br: el.querySelector('.map__slot--br') };

    // 世界座標的大底色要跟著平移，否則縮小時圖幅外會露出容器底色
    world.insertBefore(landRect, world.firstChild);

    /* ---- 控制項 ---- */
    let scaleSvg = null, ratioEl = null, coordsEl = null, tbDate = null, tbScale = null;
    if (o.controls) {
      slots.tr.insertAdjacentHTML('beforeend', `
        <div class="map-zoom" role="group" aria-label="地圖縮放">
          <button type="button" data-z="in" aria-label="放大">${icon('plus')}</button>
          <button type="button" data-z="out" aria-label="縮小">${icon('minus')}</button>
          <button type="button" data-z="fit" aria-label="回到全圖">${icon('fit')}</button>
        </div>` + (o.controls === 'compact' ? '' : `
        <div class="map-north" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="#CBD3C9"/><path d="M20 5 25 21H15Z" fill="#18201D"/><path d="M20 35 15 21h10Z" fill="#fff" stroke="#18201D" stroke-width="1"/><text x="20" y="15.5" text-anchor="middle" font-size="7" font-weight="700" fill="#fff" font-family="Inter, sans-serif">N</text></svg></div>`));
      slots.bl.insertAdjacentHTML('beforeend', `
        <div class="map-scale"><svg class="map-scale__bar" height="22" width="120" aria-hidden="true"></svg><span class="map-scale__ratio"><small>比例尺</small><span data-ratio>1:10,000</span></span></div>` +
        (o.controls === 'compact' ? '' : `<div class="map-coords hide-sm" data-coords hidden></div>`));
      scaleSvg = slots.bl.querySelector('.map-scale__bar');
      ratioEl = slots.bl.querySelector('[data-ratio]');
      coordsEl = slots.bl.querySelector('[data-coords]');
      slots.tr.querySelector('.map-zoom').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        userMoved = true;
        if (b.dataset.z === 'fit') fitWorld(true); else zoomBy(b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
      });
    }
    if (o.titleblock) {
      slots.br.insertAdjacentHTML('beforeend', `
        <div class="titleblock titleblock--map hide-sm">
          <div class="titleblock__cell"><span class="titleblock__k">圖名</span><span class="titleblock__v">${esc(o.titleblock.title || '道路挖掘施工圖')}</span></div>
          <div class="titleblock__cell"><span class="titleblock__k">日期</span><span class="titleblock__v mono" data-tb-date></span></div>
          <div class="titleblock__cell"><span class="titleblock__k">比例</span><span class="titleblock__v mono" data-tb-scale></span></div>
          <div class="titleblock__cell"><span class="titleblock__k">圖號</span><span class="titleblock__v mono">${esc(o.titleblock.no || 'CG-RW-001')}</span></div>
        </div>`);
      tbDate = slots.br.querySelector('[data-tb-date]');
      tbScale = slots.br.querySelector('[data-tb-scale]');
    }

    /* ---- 標註 ---- */
    const labelEls = LABELS.map(l => {
      if (l.poi) {
        const g = svgEl('g', { class: 'lbl-poi' });
        g.innerHTML = `<circle class="poi-mark" r="3.5"/><text class="lbl lbl--poi" x="8" y="0"></text>`;
        g.querySelector('text').textContent = l.text;
        labelsG.appendChild(g);
        return { ...l, el: g };
      }
      const t = svgEl('text', { class: 'lbl ' + l.cls });
      t.textContent = l.text;
      labelsG.appendChild(t);
      return { ...l, el: t };
    });

    /* ---- 施工範圍與衝突 ---- */
    const workEls = new Map(), clashEls = new Map(), pinEls = new Map();
    let mapConflicts = [];
    let hatchSeq = 0;
    let ready = false;
    function buildWorks() {
      worksG.textContent = ''; clashG.textContent = ''; pinsG.textContent = '';
      workEls.clear(); clashEls.clear(); pinEls.clear();
      const ids = new Set(list.map(p => p.id));
      // 審查中的排在下層、施工中的排在上層，重疊時看得到實際施工
      const sorted = list.slice().sort((a, b) => (isPending(b) ? 1 : 0) - (isPending(a) ? 1 : 0) || b.area - a.area);
      for (const p of sorted) {
        const g = svgEl('g', { class: 'work', 'data-id': p.id, style: `--u:${UTIL[p.utility].color}` });
        const d = geo.pathD(p.poly);
        g.innerHTML = `<path class="work__halo" d="${d}"/><path class="work__fill" d="${d}"/>${p.flowD ? `<path class="work__flow" d="${p.flowD}"/>` : ''}`;
        worksG.appendChild(g);
        workEls.set(p.id, g);
      }
      mapConflicts = conflicts().filter(c => ids.has(c.a.id) && ids.has(c.b.id));
      for (const c of mapConflicts) {
        const g = svgEl('g', { class: 'clash', 'data-cid': c.id });
        if (c.poly) {
          const d = geo.pathD(c.poly);
          g.innerHTML = `<path d="${d}" fill="url(#${P}hatch)"/><path class="clash__edge" d="${d}"/>`;
        } else {
          g.appendChild(hatchShape(c.a.poly, c.b.poly));
        }
        clashG.appendChild(g);
        clashEls.set(c.id, g);
        const pin = svgEl('g', { class: 'pin is-off', 'data-cid': c.id });
        pin.innerHTML = `<circle class="pin__pulse" r="9"/><circle class="pin__dot" r="9"/><path class="pin__mark" d="M0 -4.4V1M0 4.3v.2"/>`;
        pinsG.appendChild(pin);
        pinEls.set(c.id, pin);
      }
      if (selectedId && !workEls.has(selectedId)) selectedId = null;
      if (selectedId) workEls.get(selectedId).classList.add('is-selected');
      applyDate();
    }
    // 任意兩多邊形的交集：用 clipPath 互相裁切，不必自己算多邊形交集
    function hatchShape(A, B) {
      const n = ++hatchSeq, da = geo.pathD(A), db = geo.pathD(B);
      const defs = svg.querySelector('defs');
      defs.insertAdjacentHTML('beforeend', `<clipPath id="${P}hx${n}a"><path d="${da}"/></clipPath><clipPath id="${P}hx${n}b"><path d="${db}"/></clipPath>`);
      const g = svgEl('g', { class: 'clash is-on', 'data-hatch': n });
      g.innerHTML = `<path d="${da}" fill="url(#${P}hatch)" clip-path="url(#${P}hx${n}b)"/><path class="clash__edge" d="${da}" clip-path="url(#${P}hx${n}b)"/><path class="clash__edge" d="${db}" clip-path="url(#${P}hx${n}a)"/>`;
      return g;
    }

    function applyDate() {
      const n = dayNum(date);
      let visible = 0;
      hideTip();
      for (const p of list) {
        const g = workEls.get(p.id);
        if (!g) continue;
        const pending = isPending(p);
        const inRange = n >= p.d0 && n <= p.d1 && p.status !== 'returned';
        const on = inRange && layers[p.utility] && (!pending || layers.pending);
        const soon = !on && !pending && layers.soon && layers[p.utility] && p.d0 > n && p.d0 - n <= 7;
        g.classList.toggle('is-on', on);
        g.classList.toggle('is-pending', pending);
        g.classList.toggle('is-soon', soon);
        if (on) visible++;
      }
      for (const c of mapConflicts) {
        const live = layers.conflicts && n >= c.d0 && n <= c.d1;
        clashEls.get(c.id).classList.toggle('is-on', live);
        pinEls.get(c.id).classList.toggle('is-off', !live);
      }
      if (tbDate) tbDate.textContent = date;
      // 建立期間不回呼：頁面的 const map = App.map.create(...) 此時尚未賦值
      if (ready) { fire('date', date); if (o.onDate) o.onDate(date); }
      return visible;
    }

    /* ---- 視圖 ---- */
    const kMin = () => Math.min(W / WORLD.w, H / WORLD.h) * .85;
    const center = () => [(W / 2 - tx) / k, (H / 2 - ty) / k];
    function setView(cx, cy, kk) {
      k = clamp(kk, kMin(), o.maxK);
      cx = clamp(cx, 0, WORLD.w); cy = clamp(cy, 0, WORLD.h);
      tx = W / 2 - cx * k; ty = H / 2 - cy * k;
      requestRender();
    }
    function flyTo(cx, cy, kk, dur = 700) {
      cancelAnimationFrame(anim);
      if (!W) return;
      if (reduceMotion() || dur === 0) { setView(cx, cy, kk); return; }
      const [cx0, cy0] = center(), k0 = k, k1 = clamp(kk, kMin(), o.maxK), t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setView(cx0 + (cx - cx0) * e, cy0 + (cy - cy0) * e, Math.exp(Math.log(k0) + (Math.log(k1) - Math.log(k0)) * e));
        if (t < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    // 可用區域 = 地圖扣掉圖框、浮在上面的面板（inset）；聚焦時讓目標落在這塊區域中央
    function area(pad = o.pad) {
      const v = (typeof o.inset === 'function' ? o.inset() : o.inset) || {};
      const framed = el.classList.contains('map--framed');
      let l = (v.left || 0) + (framed ? 22 : 0), t = (v.top || 0) + (framed ? 18 : 0), r = v.right || 0, b = v.bottom || 0;
      // 面板佔掉太多時（窄螢幕）退回整張地圖
      if (W - l - r - pad * 2 < 160) { l = framed ? 22 : 0; r = 0; }
      if (H - t - b - pad * 2 < 140) { t = framed ? 18 : 0; b = 0; }
      return { x0: l + pad, y0: t + pad, x1: W - r - pad, y1: H - b - pad };
    }
    function focusBox(b, { pad = o.pad, dur = 700, maxK = 2.4 } = {}) {
      if (!W) return;
      const a = area(pad);
      const bw = Math.max(b[2] - b[0], 30), bh = Math.max(b[3] - b[1], 30);
      const kk = clamp(Math.min((a.x1 - a.x0) / bw, (a.y1 - a.y0) / bh, maxK), kMin(), o.maxK);
      const sx = (a.x0 + a.x1) / 2, sy = (a.y0 + a.y1) / 2;
      flyTo((b[0] + b[2]) / 2 - (sx - W / 2) / kk, (b[1] + b[3]) / 2 - (sy - H / 2) / kk, kk, dur);
    }
    // 目標若被面板遮住或在畫面外，維持比例尺平移到可用區域內
    function panIntoView(b, { pad = 24 } = {}) {
      if (!W) return;
      const a = area(pad);
      const [x0, y0] = toScreen([b[0], b[1]]), [x1, y1] = toScreen([b[2], b[3]]);
      const fit = (lo, hi, a0, a1) => (hi - lo > a1 - a0) ? ((a0 + a1) / 2 - (lo + hi) / 2) : lo < a0 ? a0 - lo : hi > a1 ? a1 - hi : 0;
      const dx = fit(x0, x1, a.x0, a.x1), dy = fit(y0, y1, a.y0, a.y1);
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      const [cx, cy] = center();
      userMoved = true;
      flyTo(cx - dx / k, cy - dy / k, k, 450);
    }
    function fitWorld(animate) {
      const b = o.fit === 'world' ? [0, 0, WORLD.w, WORLD.h]
        : Array.isArray(o.fit) ? o.fit
        : geo.bbox(list.length ? list.map(p => p.poly) : [[[0, 0], [WORLD.w, WORLD.h]]]);
      focusBox(b, { dur: animate ? 600 : 0, maxK: o.maxK });
    }
    function zoomBy(fct, sx = W / 2, sy = H / 2) {
      cancelAnimationFrame(anim);
      const k2 = clamp(k * fct, kMin(), o.maxK);
      if (reduceMotion()) { zoomAt(k2, sx, sy); return; }
      const k0 = k, t0 = performance.now();
      const wx = (sx - tx) / k, wy = (sy - ty) / k;
      const step = now => {
        const t = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - t, 3);
        const kk = k0 * Math.pow(k2 / k0, e);
        tx = sx - wx * kk; ty = sy - wy * kk; k = kk;
        clampCenter(); requestRender();
        if (t < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    function zoomAt(k2, sx, sy) {
      const wx = (sx - tx) / k, wy = (sy - ty) / k;
      k = clamp(k2, kMin(), o.maxK);
      tx = sx - wx * k; ty = sy - wy * k;
      clampCenter(); requestRender();
    }
    function clampCenter() {
      const [cx, cy] = center();
      const ccx = clamp(cx, 0, WORLD.w), ccy = clamp(cy, 0, WORLD.h);
      if (ccx !== cx || ccy !== cy) { tx = W / 2 - ccx * k; ty = H / 2 - ccy * k; }
    }
    const toScreen = ([x, y]) => [x * k + tx, y * k + ty];
    function toWorld(clientX, clientY) {
      const r = svg.getBoundingClientRect();
      return [(clientX - r.left - tx) / k, (clientY - r.top - ty) / k];
    }

    function requestRender() { if (!raf) raf = requestAnimationFrame(render); }
    function render() {
      raf = 0;
      if (!W) return;
      world.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})`);
      if (k !== lastK) {
        lastK = k;
        // 線寬、斜線網紋都以螢幕像素為準，縮放時反向補償
        world.style.setProperty('--inv', (1 / k).toFixed(4));
        hatchPat.setAttribute('patternTransform', `rotate(45) scale(${(1 / k).toFixed(4)})`);
        const lod = k < .3 ? '0' : k < .85 ? '1' : '2';
        if (el.dataset.lod !== lod) el.dataset.lod = lod;
        renderScale();
      }
      const show = layers.labels;
      for (const l of labelEls) {
        const sx = l.x * k + tx, sy = l.y * k + ty;
        const off = !show || k < l.minK || k > l.maxK || sx < -60 || sy < -30 || sx > W + 60 || sy > H + 30;
        l.el.classList.toggle('is-off', off);
        if (!off) l.el.setAttribute('transform', `translate(${sx.toFixed(1)} ${sy.toFixed(1)})${l.rot ? ` rotate(${l.rot.toFixed(1)})` : ''}`);
      }
      for (const c of mapConflicts) {
        const [sx, sy] = toScreen(c.center);
        pinEls.get(c.id).setAttribute('transform', `translate(${sx.toFixed(1)} ${(sy - 16).toFixed(1)})`);
      }
      renderFrame();
      fire('view', { k });
      if (o.onView) o.onView({ k });
    }
    function niceStep(minPx) {
      const steps = [25, 50, 100, 200, 250, 500, 1000, 2000];
      return steps.find(s => s * k >= minPx) || 2000;
    }
    function renderScale() {
      if (!scaleSvg && !tbScale) return;
      const target = 110 / k;
      const L = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].reduce((a, c) => c <= target ? c : a, 10);
      const px = L * k;
      const den = 3779.5 / k;
      const mag = Math.pow(10, Math.floor(Math.log10(den)) - 1);
      const ratio = '1:' + fmt.num(Math.round(den / mag) * mag);
      if (scaleSvg) {
        scaleSvg.setAttribute('width', Math.ceil(px + 22));
        let s = '';
        for (let i = 0; i < 4; i++) s += `<rect x="${(i * px / 4).toFixed(1)}" y="14" width="${(px / 4).toFixed(1)}" height="5" fill="${i % 2 ? '#fff' : '#18201D'}" stroke="#18201D" stroke-width="1"/>`;
        s += `<text x="0" y="9" font-size="9.5" fill="#3B4741" font-family="Roboto Mono, monospace">0</text><text x="${px.toFixed(1)}" y="9" font-size="9.5" fill="#3B4741" font-family="Roboto Mono, monospace" text-anchor="middle">${L >= 1000 ? L / 1000 + ' km' : L + ' m'}</text>`;
        scaleSvg.innerHTML = s;
        ratioEl.textContent = ratio;
      }
      if (tbScale) tbScale.textContent = ratio;
    }
    // 圖框：上緣與左緣的白帶標座標刻度，模仿紙本測量圖的圖廓
    function renderFrame() {
      const framed = o.frame && W >= 560;
      el.classList.toggle('map--framed', framed);
      if (!framed && !layers.grid) { if (gridG.firstChild) gridG.textContent = ''; if (frameG.firstChild) frameG.textContent = ''; return; }
      const step = niceStep(framed ? 84 : 60);
      const x0 = -tx / k, x1 = (W - tx) / k, y0 = -ty / k, y1 = (H - ty) / k;
      let grid = '', fr = '';
      const BT = 18, BL = 22;
      if (framed) fr += `<rect class="grat-band" x="0" y="0" width="${W}" height="${BT}"/><rect class="grat-band" x="0" y="${BT}" width="${BL}" height="${H - BT}"/>`;
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const sx = Math.round(x * k + tx) + .5;
        if (layers.grid) grid += `<line class="grat-line" x1="${sx}" y1="0" x2="${sx}" y2="${H}"/>`;
        if (framed && sx > BL + 30 && sx < W - 30) fr += `<line class="grat-tick" x1="${sx}" y1="${BT - 6}" x2="${sx}" y2="${BT + 5}"/><line class="grat-tick" x1="${sx}" y1="${H - 6}" x2="${sx}" y2="${H}"/><text class="grat-label" x="${sx + 4}" y="${BT / 2}">E ${fmt.coord(WORLD.e0 + x)}</text>`;
      }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const sy = Math.round(y * k + ty) + .5;
        if (layers.grid) grid += `<line class="grat-line" x1="0" y1="${sy}" x2="${W}" y2="${sy}"/>`;
        if (framed && sy > BT + 30 && sy < H - 30) fr += `<line class="grat-tick" x1="${BL - 6}" y1="${sy}" x2="${BL + 5}" y2="${sy}"/><line class="grat-tick" x1="${W - 6}" y1="${sy}" x2="${W}" y2="${sy}"/><text class="grat-label" transform="translate(${BL / 2} ${sy - 4}) rotate(-90)">N ${fmt.coord(WORLD.n0 - y)}</text>`;
      }
      if (framed) fr += `<rect class="grat-neat" x="${BL + .5}" y="${BT + .5}" width="${W - BL - 1}" height="${H - BT - 1}"/>`;
      gridG.innerHTML = grid;
      frameG.innerHTML = fr;
    }

    /* ---- 互動 ---- */
    const pointers = new Map();
    let drag = null, pinch = null, hoverKey = '';
    function permitFromTarget(t) {
      const g = t.closest && t.closest('.work');
      return g && (g.classList.contains('is-on') || g.classList.contains('is-soon')) ? getPermit(g.dataset.id) : null;
    }
    function conflictFromTarget(t) {
      const g = t.closest && t.closest('.pin, .clash[data-cid]');
      return g && !g.classList.contains('is-off') ? mapConflicts.find(c => c.id === g.dataset.cid) : null;
    }
    if (o.interactive) {
      svg.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        cancelAnimationFrame(anim);
        pointers.set(e.pointerId, [e.clientX, e.clientY]);
        if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false, target: e.target };
        else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const r = svg.getBoundingClientRect();
          pinch = { d: Math.hypot(b[0] - a[0], b[1] - a[1]), k, cx: (a[0] + b[0]) / 2 - r.left, cy: (a[1] + b[1]) / 2 - r.top, tx, ty };
          drag = null;
        }
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', e => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const kk = clamp(pinch.k * Math.hypot(b[0] - a[0], b[1] - a[1]) / pinch.d, kMin(), o.maxK);
          const wx = (pinch.cx - pinch.tx) / pinch.k, wy = (pinch.cy - pinch.ty) / pinch.k;
          k = kk; tx = pinch.cx - wx * k; ty = pinch.cy - wy * k;
          clampCenter(); userMoved = true; requestRender();
          return;
        }
        if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; el.classList.add('is-dragging'); hideTip(); }
          if (drag.moved) { tx = drag.tx + dx; ty = drag.ty + dy; clampCenter(); userMoved = true; requestRender(); }
          return;
        }
        hover(e);
      });
      const end = e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        if (pinch) { if (pointers.size < 2) pinch = null; return; }
        if (drag && !drag.moved && e.type === 'pointerup') tap(drag.target, e);
        drag = null;
        el.classList.remove('is-dragging');
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', end);
      svg.addEventListener('pointerleave', () => { hideTip(); if (coordsEl) coordsEl.hidden = true; });
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        cancelAnimationFrame(anim);
        const r = svg.getBoundingClientRect();
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        userMoved = true;
        zoomAt(k * Math.exp(-dy * .0018), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      svg.addEventListener('keydown', e => {
        const pan = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key];
        if (pan) { e.preventDefault(); tx += pan[0]; ty += pan[1]; clampCenter(); userMoved = true; requestRender(); }
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); userMoved = true; zoomBy(1.5); }
        else if (e.key === '-' || e.key === '_') { e.preventDefault(); userMoved = true; zoomBy(1 / 1.5); }
        else if (e.key === '0') { e.preventDefault(); fitWorld(true); }
      });
    }
    function tap(target, e) {
      const c = conflictFromTarget(target);
      if (c) { fire('conflict', c); if (o.onConflict) o.onConflict(c); return; }
      const p = o.selectable ? permitFromTarget(target) : null;
      if (p) { select(p.id); return; }
      const [x, y] = toWorld(e.clientX, e.clientY);
      fire('click', { x, y, event: e });
      if (o.onClick) o.onClick({ x, y, event: e });
      if (o.selectable && selectedId) select(null);
    }
    function hover(e) {
      const [x, y] = toWorld(e.clientX, e.clientY);
      if (coordsEl) { coordsEl.hidden = false; coordsEl.textContent = `E ${fmt.coord(WORLD.e0 + x)} · N ${fmt.coord(WORLD.n0 - y)}`; }
      fire('pointer', [x, y]);
      if (o.onPointer) o.onPointer([x, y]);
      if (!o.tooltip) return;
      const c = conflictFromTarget(e.target);
      const p = c ? null : permitFromTarget(e.target);
      const key = c ? c.id : p ? p.id : '';
      if (key !== hoverKey) {
        hoverKey = key;
        if (!key) { hideTip(); return; }
        tip.classList.toggle('map-tip--danger', !!c);
        tip.innerHTML = c
          ? `<b>${c.id}</b> 衝突・${CONFLICT_STATUS[c.status].label}<br>${esc(c.road)} 重疊 ${c.length} m<small>${fmt.range(c.from, c.to)}・${c.a.id} × ${c.b.id}</small>`
          : `<b><span class="map-tip__u" style="--u:${UTIL[p.utility].color}"></span>${p.id}</b>・${UTIL[p.utility].name}<br>${esc(p.segment)} ${p.station}<small>${fmt.range(p.start, p.end)}・${STATUS[p.status].label}${p.d0 > dayNum(date) ? `・${p.d0 - dayNum(date)} 天後進場` : ''}</small>`;
        tip.classList.add('is-on');
      }
      if (key) {
        const r = el.getBoundingClientRect();
        let lx = e.clientX - r.left + 14, ly = e.clientY - r.top + 14;
        if (lx + tip.offsetWidth > r.width - 8) lx = e.clientX - r.left - tip.offsetWidth - 14;
        if (ly + tip.offsetHeight > r.height - 8) ly = e.clientY - r.top - tip.offsetHeight - 14;
        tip.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;
      }
    }
    function hideTip() { hoverKey = ''; tip.classList.remove('is-on'); }

    function select(id, { fly = false } = {}) {
      if (selectedId && workEls.has(selectedId)) workEls.get(selectedId).classList.remove('is-selected');
      selectedId = id && workEls.has(id) ? id : null;
      if (selectedId) workEls.get(selectedId).classList.add('is-selected');
      const p = selectedId ? getPermit(selectedId) : null;
      if (p && fly) focusPermit(p.id);
      fire('select', p);
      if (o.onSelect) o.onSelect(p);
    }
    function focusPermit(id, { pad = 60 } = {}) {
      const p = getPermit(id);
      if (!p) return;
      const [x0, y0, x1, y1] = p.bbox;
      userMoved = true;
      focusBox([x0 - 160, y0 - 160, x1 + 160, y1 + 160], { pad, maxK: 1.5 });
    }
    function focusConflict(id) {
      const c = mapConflicts.find(x => x.id === id) || conflicts().find(x => x.id === id);
      if (!c) return;
      const [x0, y0, x1, y1] = c.bbox;
      userMoved = true;
      focusBox([x0 - 260, y0 - 200, x1 + 260, y1 + 200], { maxK: 1.5 });
    }
    function flash(id) {
      const g = workEls.get(id) || clashEls.get(id);
      if (!g) return;
      g.classList.remove('is-flash');
      void g.getBoundingClientRect();
      g.classList.add('is-flash');
      setTimeout(() => g.classList.remove('is-flash'), 1800);
    }
    function highlight(ids) {
      const set = ids ? new Set(ids) : null;
      workEls.forEach((g, id) => g.classList.toggle('is-dim', !!set && !set.has(id)));
    }
    function setLayer(key, value) {
      layers[key] = value;
      if (key === 'buildings') el.classList.toggle('hide-buildings', !value);
      else if (key === 'boundaries') el.classList.toggle('hide-boundaries', !value);
      else if (key === 'labels') { el.classList.toggle('hide-labels', !value); requestRender(); }
      else if (key === 'grid') requestRender();
      else applyDate();
      fire('layers', layers);
    }
    function visibleNow() {
      const n = dayNum(date);
      return {
        permits: list.filter(p => workEls.get(p.id) && workEls.get(p.id).classList.contains('is-on')),
        soon: list.filter(p => workEls.get(p.id) && workEls.get(p.id).classList.contains('is-soon')),
        conflicts: mapConflicts.filter(c => layers.conflicts && n >= c.d0 && n <= c.d1),
      };
    }

    /* ---- 尺寸 ---- */
    function measure() {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const first = !W;
      const c = first ? null : center();
      W = r.width; H = r.height;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      el.classList.toggle('map--framed', !!o.frame && W >= 560);
      lastK = 0;
      if (first || !userMoved) fitWorld(false);
      else setView(c[0], c[1], k);
    }
    new ResizeObserver(measure).observe(el);
    buildWorks();
    measure();
    watchAnim(el);
    ready = true;

    const api = {
      el, svg, overlay,
      slot: name => slots[name],
      on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return api; },
      date: () => date,
      setDate(iso) { date = iso; applyDate(); },
      layers,
      setLayer,
      setPermits(next) { list = next; buildWorks(); requestRender(); },
      permits: () => list,
      conflicts: () => mapConflicts,
      select, selected: () => (selectedId ? getPermit(selectedId) : null),
      highlight, flash, focusPermit, focusConflict, focusBox, panIntoView,
      fit: () => { userMoved = false; fitWorld(true); },
      zoomBy: f => { userMoved = true; zoomBy(f); },
      toScreen, toWorld,
      view: () => ({ k, tx, ty, W, H }),
      hatch(A, B) { const g = hatchShape(A, B); overlay.appendChild(g); return g; },
      visible: visibleNow,
      refresh() { buildWorks(); requestRender(); },
    };
    // 資料變更（核准、送審、復原）後重建施工範圍與衝突
    on('data', () => { if (el.isConnected) { buildWorks(); requestRender(); } });
    return api;
  }

  // 圖層面板：依地圖目前日期即時顯示各類別件數
  let layerSeq = 0;
  // 「圖面」群組預設收合，讓面板不遮住太多地圖；moreOpen 可改為展開
  function layerPanel(map, { open = !matchMedia('(max-width: 760px)').matches, moreOpen = false } = {}) {
    const moreId = 'layer-more-' + (++layerSeq);
    const box = document.createElement('section');
    box.className = 'map-layers';
    box.dataset.open = String(open);
    const util = UTIL_ORDER.map(u => `
      <label class="layer-row" style="--u:${UTIL[u].color}"><input type="checkbox" data-layer="${u}"${map.layers[u] ? ' checked' : ''}><span class="layer-row__sym layer-row__sym--util"></span><span>${UTIL[u].name}</span><span class="layer-row__n" data-n="${u}">0</span></label>`).join('');
    const extra = [
      ['conflicts', '衝突範圍', 'clash'], ['pending', '審查中申請', 'pending'], ['soon', '7 日內進場', 'soon'],
      ['boundaries', '行政區界', 'bound'], ['buildings', '建物', 'bldg'], ['grid', '座標格網', 'grid'],
    ].map(([key, label, sym]) => `
      <label class="layer-row"><input type="checkbox" data-layer="${key}"${map.layers[key] ? ' checked' : ''}><span class="layer-row__sym layer-row__sym--${sym}"></span><span>${label}</span><span class="layer-row__n"${key === 'conflicts' ? ' data-n="conflicts"' : ''}></span></label>`).join('');
    box.innerHTML = `
      <button class="map-layers__toggle" type="button" aria-expanded="${open}">${icon('layers')}<span>圖層</span>${icon('chevD', 'icon icon--sm')}</button>
      <div class="map-layers__body">
        <p class="map-layers__group">管線類別</p>${util}
        <button class="map-layers__more" type="button" aria-expanded="${moreOpen}" aria-controls="${moreId}"><span>圖面</span>${icon('chevD', 'icon icon--sm')}</button>
        <div id="${moreId}"${moreOpen ? '' : ' hidden'}>${extra}</div>
      </div>`;
    const more = box.querySelector('.map-layers__more');
    more.addEventListener('click', () => {
      const next = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(next));
      box.querySelector('#' + moreId).hidden = !next;
    });
    const toggle = box.querySelector('.map-layers__toggle');
    toggle.addEventListener('click', () => {
      const next = box.dataset.open !== 'true';
      box.dataset.open = String(next);
      toggle.setAttribute('aria-expanded', String(next));
    });
    box.addEventListener('change', e => {
      const inp = e.target.closest('[data-layer]');
      if (inp) map.setLayer(inp.dataset.layer, inp.checked);
    });
    const update = () => {
      const v = map.visible();
      UTIL_ORDER.forEach(u => { box.querySelector(`[data-n="${u}"]`).textContent = v.permits.filter(p => p.utility === u).length; });
      box.querySelector('[data-n="conflicts"]').textContent = v.conflicts.length;
    };
    map.on('date', update).on('layers', update);
    update();
    map.slot('tl').appendChild(box);
    return box;
  }

  App.map = { create: createMap, layerPanel };

  /* =====================================================================
     時間軸：拖動日期 → 地圖施工範圍出現 / 消失
     ===================================================================== */
  function timeline(el, opts = {}) {
    const o = Object.assign({ start: '2026-09-01', end: '2026-12-31', value: TODAY, today: TODAY, label: '施工日期', onInput: null }, opts);
    const d0 = dayNum(o.start), N = dayNum(o.end) - d0;
    let value = clamp(dayNum(o.value) - d0, 0, N);
    let playing = false, raf = 0, lastT = 0, acc = 0;
    const pct = i => ((i + .5) / (N + 1) * 100).toFixed(3) + '%';
    el.classList.add('tl');
    el.innerHTML = `
      <div class="tl__head">
        <button class="tl__play" type="button" aria-label="播放時間軸" aria-pressed="false">${icon('play')}</button>
        <div class="tl__date" aria-live="polite"><span class="tl__ymd"></span><span class="tl__wd"></span><span class="tl__rel badge"></span></div>
        <div class="tl__legend" aria-hidden="true">${UTIL_ORDER.map(u => `<span><i class="swatch" style="--u:${UTIL[u].color}"></i>${UTIL[u].name}</span>`).join('')}<span><i class="hatch-swatch"></i>衝突期間</span></div>
        <div class="tl__steps">
          <button class="btn btn--sm btn--icon" type="button" data-step="-1" aria-label="前一天">${icon('chevL', 'icon icon--sm')}</button>
          <button class="btn btn--sm" type="button" data-step="today">今日</button>
          <button class="btn btn--sm btn--icon" type="button" data-step="1" aria-label="後一天">${icon('chevR', 'icon icon--sm')}</button>
        </div>
      </div>
      <div class="tl__body">
        <svg class="tl__clash" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="tl__future" aria-hidden="true"></div>
        <svg class="tl__hist" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="tl__axis" aria-hidden="true"></div>
        <div class="tl__todaymark" aria-hidden="true"><span>今日</span></div>
        <input class="tl__range" type="range" min="0" max="${N}" step="1" value="${value}" aria-label="${esc(o.label)}" style="left:calc(100% / ${2 * (N + 1)});right:calc(100% / ${2 * (N + 1)});width:auto">
        <div class="tl__cursor" aria-hidden="true"><span class="tl__knob"></span></div>
      </div>`;
    const range = el.querySelector('.tl__range');
    const cursor = el.querySelector('.tl__cursor');
    const knob = el.querySelector('.tl__knob');
    const ymd = el.querySelector('.tl__ymd'), wd = el.querySelector('.tl__wd'), rel = el.querySelector('.tl__rel');
    const playBtn = el.querySelector('.tl__play');
    const ti = dayNum(o.today) - d0;
    el.querySelector('.tl__todaymark').style.left = pct(ti);
    el.querySelector('.tl__future').style.left = pct(ti);

    function refresh() {
      const load = dailyLoad(o.start, o.end);
      const max = Math.max(4, ...load.map(d => d.total));
      let bars = '';
      load.forEach((d, i) => {
        let y = max;
        UTIL_ORDER.forEach(u => {
          const c = d.counts[u];
          if (!c) return;
          y -= c;
          bars += `<rect x="${i + .16}" y="${y}" width=".68" height="${c}" fill="${UTIL[u].color}"/>`;
        });
      });
      const hist = el.querySelector('.tl__hist');
      hist.setAttribute('viewBox', `0 0 ${N + 1} ${max}`);
      hist.innerHTML = bars;
      let clash = '', run = -1;
      load.forEach((d, i) => {
        if (d.clash && run < 0) run = i;
        if ((!d.clash || i === load.length - 1) && run >= 0) {
          const endI = d.clash ? i + 1 : i;
          clash += `<rect x="${run}" y="0" width="${endI - run}" height="1" fill="#D92D20"/>`;
          run = -1;
        }
      });
      const cs = el.querySelector('.tl__clash');
      cs.setAttribute('viewBox', `0 0 ${N + 1} 1`);
      cs.innerHTML = clash;
      // 月份與週一刻度
      let axis = '';
      for (let i = 0; i <= N; i++) {
        const iso = isoOf(d0 + i);
        if (iso.endsWith('-01')) axis += `<span class="tl__month" style="left:${(i / (N + 1) * 100).toFixed(3)}%">${+iso.slice(5, 7)} 月</span>`;
        else if (weekday(iso) === '一') axis += `<span class="tl__tick" style="left:${pct(i)}"></span>`;
      }
      el.querySelector('.tl__axis').innerHTML = axis;
    }

    function paint() {
      const iso = isoOf(d0 + value);
      cursor.style.left = pct(value);
      knob.textContent = fmt.md(iso);
      // 把手在兩端時往內收，避免超出時間軸造成水平捲動
      const bw = el.querySelector('.tl__body').clientWidth;
      const x = (value + .5) / (N + 1) * bw, half = knob.offsetWidth / 2;
      const shift = x < half ? half - x : x > bw - half ? (bw - half) - x : 0;
      knob.style.transform = `translateX(calc(-50% + ${shift.toFixed(1)}px))`;
      ymd.textContent = iso;
      wd.textContent = '週' + weekday(iso);
      const r = fmt.rel(iso, o.today);
      rel.textContent = r;
      rel.className = 'tl__rel badge' + (iso === o.today ? ' badge--dark' : iso < o.today ? '' : ' badge--accent');
      range.value = value;
      range.setAttribute('aria-valuetext', fmt.long(iso));
    }
    function set(iso, emit = true) {
      value = clamp(dayNum(iso) - d0, 0, N);
      paint();
      if (emit && o.onInput) o.onInput(isoOf(d0 + value));
    }
    function setIndex(i) { value = clamp(i, 0, N); paint(); if (o.onInput) o.onInput(isoOf(d0 + value)); }

    range.addEventListener('input', () => { pause(); setIndex(+range.value); });
    el.querySelector('.tl__steps').addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      pause();
      if (b.dataset.step === 'today') set(o.today); else setIndex(value + +b.dataset.step);
    });

    // 播放：每秒前進約 7 天；分頁隱藏時 rAF 自動停，回來後用 dt 上限避免一次跳太多天
    function loop(t) {
      if (!playing) return;
      const dt = Math.min(100, t - (lastT || t));
      lastT = t; acc += dt;
      if (acc >= 140) {
        acc = 0;
        if (value >= N) { pause(); return; }
        setIndex(value + 1);
      }
      raf = requestAnimationFrame(loop);
    }
    function play() {
      if (playing) return;
      if (value >= N) setIndex(0);
      playing = true; lastT = 0; acc = 0;
      playBtn.setAttribute('aria-pressed', 'true');
      playBtn.setAttribute('aria-label', '暫停時間軸');
      playBtn.innerHTML = icon('pause');
      raf = requestAnimationFrame(loop);
    }
    function pause() {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(raf);
      playBtn.setAttribute('aria-pressed', 'false');
      playBtn.setAttribute('aria-label', '播放時間軸');
      playBtn.innerHTML = icon('play');
    }
    playBtn.addEventListener('click', () => (playing ? pause() : play()));
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    if ('ResizeObserver' in window) new ResizeObserver(paint).observe(el);

    refresh();
    paint();
    on('data', refresh);
    return { el, get: () => isoOf(d0 + value), set, play, pause, refresh, get playing() { return playing; } };
  }
  App.timeline = timeline;

  /* =====================================================================
     動態：reveal、數字滾動、離開視窗暫停
     ===================================================================== */
  let revealIO = null;
  function reveal(root = document) {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || reduceMotion()) { els.forEach(e => e.classList.add('is-in')); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver(entries => entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); countUps(en.target); }
      }), { rootMargin: '0px 0px -6% 0px' });
    }
    // 已在視窗內的直接顯示，不等 observer 回呼，避免首屏閃爍
    els.forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) e.classList.add('is-in');
      else revealIO.observe(e);
    });
  }
  function countUp(el, to, { dur = 900, format = fmt.num } = {}) {
    el.dataset.countTo = to;
    cancelAnimationFrame(el._cu || 0);
    if (reduceMotion()) { el.textContent = format(to); return; }
    const from = parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    const t0 = performance.now();
    const step = now => {
      // 每一幀都讀最新目標值，連續快速更新時不會停在舊數字
      const target = +el.dataset.countTo;
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      el.textContent = format(from + (target - from) * e);
      if (t < 1) el._cu = requestAnimationFrame(step); else el.textContent = format(target);
    };
    el._cu = requestAnimationFrame(step);
  }
  function countUps(root) {
    $$('[data-count-to]', root).concat(root.matches && root.matches('[data-count-to]') ? [root] : []).forEach(el => {
      if (el._counted) return;
      el._counted = true;
      const to = +el.dataset.countTo;
      el.textContent = '0';
      countUp(el, to);
    });
  }
  let animIO = null;
  // root 本身帶 data-anim 也會被監看（地圖、動態插入的區塊建立後呼叫）
  function watchAnim(root = document) {
    if (!('IntersectionObserver' in window)) return;
    if (!animIO) animIO = new IntersectionObserver(entries => entries.forEach(en => en.target.classList.toggle('is-paused', !en.isIntersecting)));
    const els = $$('[data-anim]', root);
    if (root.matches && root.matches('[data-anim]')) els.push(root);
    els.forEach(e => { if (!e._anim) { e._anim = true; animIO.observe(e); } });
  }
  Object.assign(App, { reveal, countUp, countUps, watchAnim });

  /* =====================================================================
     外殼：導覽、搜尋、通知、使用者
     ===================================================================== */
  function toggleNav(force) {
    const root = document.documentElement;
    const open = force ?? !root.classList.contains('nav-open');
    root.classList.toggle('nav-open', open);
    $$('[data-nav-toggle]').forEach(b => b.setAttribute('aria-expanded', String(open)));
  }

  function openSearch() {
    if ($('dialog.cmd[open]')) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'cmd';
    dlg.setAttribute('aria-label', '快速搜尋許可');
    dlg.innerHTML = `<div class="cmd__card">
      <div class="cmd__input">${icon('search')}<input type="search" placeholder="輸入案號、路名、管線單位或工程名稱" aria-label="搜尋許可" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmd-list"><span class="kbd">Esc</span></div>
      <div class="cmd__list" id="cmd-list" role="listbox"></div>
      <div class="cmd__foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> 選擇</span><span><span class="kbd">Enter</span> 開啟許可</span><span>共 ${PERMITS.length} 件</span></div></div>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector('input'), listEl = dlg.querySelector('.cmd__list');
    let results = [], cur = 0;
    const render = () => {
      const q = input.value.trim().toLowerCase();
      results = PERMITS.filter(p => !q || [p.id, p.road, p.segment, p.org, p.purpose, p.district, UTIL[p.utility].name].join(' ').toLowerCase().includes(q))
        .sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || b.id.localeCompare(a.id)).slice(0, 8);
      cur = Math.min(cur, Math.max(0, results.length - 1));
      listEl.innerHTML = results.length ? results.map((p, i) => `
        <a class="cmd__item" role="option" id="cmd-${i}" aria-selected="${i === cur}" href="${permitUrl(p.id)}" style="--u:${UTIL[p.utility].color}">
          <span><span class="cmd__title"><span class="pid">${p.id}</span>　${esc(p.segment)}</span><br><span class="cmd__sub">${esc(UTIL[p.utility].short)}・${esc(p.purpose)}・${fmt.range(p.start, p.end)}</span></span>
          ${statusBadge(p.status)}
        </a>`).join('') : emptyState({ art: 'search', title: '找不到符合的許可', text: '試試案號後四碼，例如「0427」，或路名「港埕路」。' });
      if (results.length) input.setAttribute('aria-activedescendant', 'cmd-' + cur); else input.removeAttribute('aria-activedescendant');
    };
    input.addEventListener('input', () => { cur = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!results.length) return;
        cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        render();
        listEl.querySelector('[aria-selected="true"]').scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && results[cur]) {
        location.href = permitUrl(results[cur].id);
      }
    });
    const api = { el: dlg, close: () => { if (dlg.open) dlg.close(); } };
    dlg.addEventListener('close', () => { const i = openModals.indexOf(api); if (i >= 0) openModals.splice(i, 1); dlg.remove(); placeToasts(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) api.close(); });
    render();
    dlg.showModal();
    openModals.push(api);
    placeToasts();
    input.focus();
  }
  App.openSearch = openSearch;

  function notifyContent() {
    const live = conflictsOn(TODAY).filter(c => c.status !== 'resolved');
    const overdue = PERMITS.filter(p => p.status === 'review' && dayNum(TODAY) - dayNum(p.applied) > 10);
    const starts = PERMITS.filter(p => p.start === TODAY);
    const items = [
      ...live.map(c => `<a class="pop__item" href="index.html?focus=${c.id}"><span class="pop__icon pop__icon--danger">${icon('alert', 'icon icon--sm')}</span><span><b>${c.id} 當日衝突</b>・${esc(c.road)}<small>${c.a.id} × ${c.b.id}・重疊 ${c.length} m</small></span></a>`),
      ...overdue.map(p => `<a class="pop__item" href="${permitUrl(p.id)}"><span class="pop__icon pop__icon--warn">${icon('clock', 'icon icon--sm')}</span><span><b>會辦逾期</b>・${p.id}<small>${esc(p.segment)}・已等候 ${dayNum(TODAY) - dayNum(p.applied)} 天</small></span></a>`),
      ...starts.map(p => `<a class="pop__item" href="${permitUrl(p.id)}"><span class="pop__icon pop__icon--ok">${icon('hard', 'icon icon--sm')}</span><span><b>今日開工</b>・${p.id}<small>${esc(UTIL[p.utility].short)}・${esc(p.segment)}</small></span></a>`),
    ];
    return `<div class="pop__head"><span>通知</span><span class="count">${items.length}</span></div>${items.join('')}`;
  }
  function userContent() {
    const me = PEOPLE.lin;
    return `<div class="pop__head"><span>${me.name}<small class="muted" style="display:block;font-weight:400;font-size:12px">${me.unit}・${me.title}（承辦）</small></span></div>
      <button class="pop__item" type="button" data-user-act="settings"><span class="pop__icon">${icon('settings', 'icon icon--sm')}</span><span>個人設定<small>通知方式、預設地圖圖層</small></span></button>
      <button class="pop__item" type="button" data-user-act="proxy"><span class="pop__icon">${icon('user', 'icon icon--sm')}</span><span>代理人設定<small>目前未設定代理人</small></span></button>
      <button class="pop__item" type="button" data-user-act="logout"><span class="pop__icon">${icon('logout', 'icon icon--sm')}</span><span>登出</span></button>`;
  }

  function renderCounts() {
    const c = counts();
    $$('[data-count]').forEach(el => {
      const v = c[el.dataset.count];
      if (v == null) return;
      el.textContent = v;
      if (el.classList.contains('nav__count')) el.hidden = !v;
    });
    const dot = $('[data-notify] .icon-btn__dot');
    if (dot) dot.hidden = !(conflictsOn(TODAY).some(x => x.status !== 'resolved') || PERMITS.some(p => p.start === TODAY));
  }

  function initShell() {
    // 導覽 active：以檔名比對，子頁複製 header 後不必手動改
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav__link').forEach(a => {
      const href = (a.getAttribute('href') || '').split('?')[0].toLowerCase();
      if (href === file) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $$('[data-nav-toggle]').forEach(b => b.addEventListener('click', () => toggleNav()));
    $$('.nav a').forEach(a => a.addEventListener('click', () => toggleNav(false)));
    $$('[data-search]').forEach(b => b.addEventListener('click', openSearch));
    $$('[data-notify]').forEach(b => b.addEventListener('click', () => popover(b, notifyContent())));
    $$('[data-user]').forEach(b => b.addEventListener('click', () => {
      const pop = popover(b, userContent(), { width: 280 });
      if (!pop) return;
      pop.el.addEventListener('click', e => {
        const act = e.target.closest('[data-user-act]');
        if (!act) return;
        pop.close();
        const msg = { settings: ['個人設定為示範功能', '本示範環境不儲存個人偏好。'], proxy: ['代理人設定為示範功能', '請洽科內系統管理員設定差勤代理。'], logout: ['示範環境不提供登出', '所有資料僅存在於本頁記憶體中。'] }[act.dataset.userAct];
        toast(msg[0], { desc: msg[1], tone: 'info' });
      });
    }));
    $$('[data-today]').forEach(el => { el.innerHTML = `<span class="live" aria-hidden="true"></span>${fmt.date(TODAY)} 週${weekday(TODAY)} ${NOW_TIME}`; });
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        openSearch();
      }
    });
    document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-hidden', document.hidden));
    renderCounts();
    on('data', renderCounts);
  }

  document.documentElement.classList.add('reveal-ready');
  function boot() {
    initShell();
    reveal();
    watchAnim();
    // 保底：任何原因沒觸發進場的元素在 2.5 秒後一律顯示
    setTimeout(() => $$('[data-reveal]:not(.is-in)').forEach(e => { e.classList.add('is-in'); countUps(e); }), 2500);
    $$('[data-reveal].is-in').forEach(countUps);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
