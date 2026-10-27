/* ==========================================================================
   澄港市 2027 新公車路網 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，全部 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒。
     app.js 執行當下（DOMContentLoaded 之前）就會 App.scan(document)；頁面用 innerHTML
     動態插入、含 data-* 元件的內容，插完後呼叫 App.scan(容器)（重複呼叫安全）。

   資料（全站單一來源；站名、班距、數字一律從這裡取，不要另外手打）
     App.data.stations     67 座站點 {id,name,x,y,district,routes[],oldRoutes[],transfer,terminal}
     App.data.routes       19 條新路線 {id:'T1',code:'幹1',type,color,name,alias,desc,stops[],from,to,
                            headway{peak,off,holiday},first,last,replaces[](舊路線 id),km,minutes,loop}
                            type：'trunk' 幹線 | 'branch' 支線 | 'feeder' 接駁 | 'night' 夜間
                            color：'red'|'blue'|'green'|'orange'|'purple'|'yellow'|'ink'（對應 CSS .c-*）
     App.data.oldRoutes    13 條舊路線 {id:'207',code,name,stops[],headway,first,last,
                            to[](取代它的新路線 id),from,end(終點站 id),km,minutes,loop}
     App.data.districts    8 個行政區 [{name,pop(萬人),old,new(高頻覆蓋率 %)}]
     App.data.types        路線種類 {trunk:{label:'幹線',short:'幹'},...}
     App.data.timeline     改版時程 [{date,title,desc,state:'done'|'now'|'next'}]
     App.data.launch       '2027-01-01'（第一階段上路日）
     App.data.sim          模擬參數 {dwellMin(每站停靠分),oldSpeed(舊線時速),oldDetourPct(舊線繞駛加計 %),
                            walkSpeed(公尺/分),xferWalk{new,old}(轉乘步行公尺),xferPenalty(轉乘折算分)}
     App.route(id) / App.oldRoute(id) / App.station(id)
     App.routesOf(type?)   依 type 篩選，順序固定（幹→支→接→夜）
     App.findStations(q)   站名／行政區模糊搜尋，回傳 station[]
     App.routeURL(id)      → 'route.html?id=T1'；route.html 以 App.param('id') 讀取，預設 'T1'
     App.param(name)       讀 location.search

   計算（模擬，全部由路網幾何與班距推得，前後一致）
     App.stopOffsets(id, network?)   各站距起站分鐘數（舊路線 network='old'）
     App.schedule(id, day, dir?)     發車時刻（自午夜起分鐘數陣列）；day 'weekday'|'holiday'；dir 0 去程 1 返程
     App.headwayAt(route, minute, day)
     App.plan(fromId, toId, {network:'new'|'old', period:'peak'|'off'})
       → {minutes, ride, wait, walk(公尺), walkMin, transfers, legs:[{route, stops[], minutes}]} 或 null
     App.reach(stationId, network)   → {direct:Set, oneTransfer:Set}（直達／一次轉乘可達站）
     App.networkStats(network, period) → {pairs, avgMinutes, avgTransfers, avgWalk, avgWait, avgRide, directShare, oneXferShare}
                                       （全市 67×66 組站到站平均；首次呼叫約需數十毫秒，之後快取）
     App.coverageTotal(network)      → 人口加權高頻覆蓋率 %
     App.accessWalk(stationId, network) 該站所在行政區的平均走到站牌距離（公尺）
     App.legPoints(routeId, stops[], network) 一段搭乘在圖上的折線點（畫行程用）
     App.roundedPath(points, loop)   45°/90° 折線轉成圓角 SVG path d
     App.now()                       故事裡的「現在」：日期固定 2026-10-23（五），時分秒跟真實時鐘走
     App.TODAY / App.date(iso) / App.daysUntil(iso) / App.toMin('05:30')→330

   產生 HTML
     App.pillHTML(routeId, {link, size:'sm'|'lg', title})   路線 pill（新路線）
     App.oldPillHTML(oldId, {size})                          舊路線灰 pill
     App.lineStripSVG(routeId, {width, height, labels})      卡片用 mini 線形圖（SVG 字串）
     App.stopStripHTML(routeId, {times, transfers, current}) 橫向站序圖 .stop-strip 的 HTML
     App.esc(str)  HTML 跳脫
     App.fmt.num / pct / min / km / hm(分鐘→'HH:MM') / date('2027-01-01'→'2027 年 1 月 1 日') / md / wd

   路網圖引擎（招牌動態）
     const map = App.map.create(svgEl, {
       labels: 'major'|'all'|'none',        // major＝轉乘站與端點
       layers: {trunk, branch, feeder, night},
       animate: true,                       // 依序畫出路線（reduced-motion 時直接顯示終態）
       buses: true,                         // 小巴士沿線移動（離開視窗/分頁隱藏時暫停）
       interactive: true, link: true,       // hover 淡出其他路線；點路線前往 route.html?id=
       viewBox: [x,y,w,h],                  // 預設 [40,40,1170,690]
       old: false,                          // true 或 ['207',...]：疊上舊路線（灰虛線）
       onStation: id => {}                  // 點站點的 callback
     });
     map.focusRoute(id|null) / map.focusStation(id|null) / map.setLayers({...}) / map.layers（目前圖層）
     map.showOld(ids|null) / map.showJourney(planResult|null) / map.replay() / map.destroy()
     map.fit(ids, pad=60, minW=480)  縮放到路線／站點範圍（id 可混用新舊路線與站點）
     map.zoomTo([x,y,w,h] | null)    指定範圍；null 回到全圖（皆有補間動畫）
     svg 會觸發 'routehover'（detail:{id}）

   UI
     App.toast(msg, {tone:'info'|'ok'|'warn'|'error', title, timeout})  modal 開啟時自動移進 dialog
     App.modal.open(idOrEl) / App.modal.close(el?)；宣告式 [data-modal-open="id"]、[data-modal-close]
     App.tabs(el)          [data-tabs] 自動初始化；切換時觸發 'tabchange'（detail:{tab,panel,index}）
     App.chips(el)         [data-chips="single"|"multi"] 按鈕群組（aria-pressed）；觸發 'chipchange'（detail:{values}）
     App.combobox(input)   [data-station-input] 站名自動完成（input 需包在 .combo 內）；選取時 input 觸發
                           'stationselect'（detail:{station}，冒泡）、input.dataset.station 存站點 id；
                           回傳 {pick(id), close()}，重複呼叫回傳同一個
     App.tip.show(html, x, y) / App.tip.hide()
     App.field.setError(input, msg) / App.field.clear(formOrInput)
     App.count(el, value)  數字遞增到 value（[data-count] 進入視窗時自動）
     App.animate(el, fn)   只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(t, dt)；回傳 stop()
     App.reducedMotion     getter
     App.scrollTo(el)      平滑捲動（扣掉 sticky header）；App.headerOffset() 取得扣除量
     [data-toast="訊息"]   點擊即顯示 toast（data-toast-tone 選填）：給沒有實際目的地的動作用
     form[data-subscribe]  頁尾訂閱表單（email 驗證＋toast），複製頁尾即可運作

   自動行為
     .site-header 捲動後加 .is-scrolled；.nav-toggle 開合行動選單
     [data-stop="站名"] 區塊 → 桌機左側「捲動進度路線」與手機頂端進度條（body[data-rail] 才啟用）
     [data-reveal]（""|"left"|"right"|"scale"）進場；style="--rd:120ms" 錯開
     [data-count="1234"]（data-decimals、data-suffix 選填）
     [data-countdown="2027-01-01"] 填入剩餘天數
     [data-pause-offscreen] 離開視窗時暫停其內 CSS 無限動畫
   ========================================================================== */
(function () {
  'use strict';

  const App = window.App = window.App || {};
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  App.$ = $;
  App.$$ = $$;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });

  App.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.param = name => new URLSearchParams(location.search).get(name);

  /* ---------- 時間：故事裡的「現在」 ---------- */
  App.TODAY = '2026-10-23';
  App.date = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  App.now = () => {
    // 日期鎖在 2026-10-23，時分秒跟真實時鐘走：即時到站、倒數才會「活著」
    const real = new Date();
    const d = App.date(App.TODAY);
    d.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
    return d;
  };
  App.daysUntil = iso => Math.round((App.date(iso) - App.date(App.TODAY)) / 86400000);

  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const pad = n => String(n).padStart(2, '0');
  App.fmt = {
    num: (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
    pct: (n, d = 0) => Number(n).toFixed(d) + '%',
    min: n => Math.round(n) + ' 分',
    km: n => Number(n).toFixed(1) + ' km',
    hm: mins => { const m = ((Math.round(mins) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); },
    date: iso => { const [y, m, d] = iso.split('-').map(Number); return `${y} 年 ${m} 月 ${d} 日`; },
    md: iso => { const [, m, d] = iso.split('-'); return `${Number(m)}.${pad(Number(d))}`; },
    wd: iso => WD[App.date(iso).getDay()],
  };
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  App.toMin = toMin;

  /* ==========================================================================
     路網資料
     座標系：路網圖 viewBox 單位，40 為一格；所有路段只走水平、垂直或 45°。
     比例：1 單位 ≈ 14 公尺（示意圖，僅用於推算車程）。
     ========================================================================== */
  const COLORS = {
    red:    { hex: '#E53935', on: '#FFFFFF', text: '#C62828', name: '紅' },
    blue:   { hex: '#1E88E5', on: '#FFFFFF', text: '#1565C0', name: '藍' },
    green:  { hex: '#43A047', on: '#1C1C1C', text: '#2E7D32', name: '綠' },
    orange: { hex: '#FB8C00', on: '#1C1C1C', text: '#A84E00', name: '橘' },
    purple: { hex: '#8E24AA', on: '#FFFFFF', text: '#7B1FA2', name: '紫' },
    yellow: { hex: '#FDD835', on: '#1C1C1C', text: '#7A6100', name: '黃' },
    ink:    { hex: '#1C1C1C', on: '#FFFFFF', text: '#1C1C1C', name: '墨' },
    old:    { hex: '#A3A39C', on: '#1C1C1C', text: '#6B6B66', name: '灰' },
  };
  App.colors = COLORS;
  App.color = key => (COLORS[key] || COLORS.ink).hex;

  const TYPES = {
    trunk:  { label: '幹線', short: '幹', en: 'Trunk',  lw: 8, speed: 21 },
    branch: { label: '支線', short: '支', en: 'Branch', lw: 6, speed: 18 },
    feeder: { label: '接駁', short: '接', en: 'Feeder', lw: 4, speed: 16 },
    night:  { label: '夜間', short: '夜', en: 'Night',  lw: 3, speed: 26 },
  };
  const TYPE_ORDER = ['trunk', 'branch', 'feeder', 'night'];

  // [id, 站名, x, y, 行政區, 標籤方位]
  const STATIONS = [
    ['gcPier', '港埕碼頭', 120, 400, '港埕區', 'n'],
    ['fishMkt', '漁市場', 200, 400, '港埕區', 's'],
    ['gcHall', '港埕區公所', 280, 400, '港埕區', 'n'],
    ['gcSchool', '港埕國小', 360, 400, '港埕區', 'n'],
    ['gcMkt', '港埕市場', 280, 480, '港埕區', 'e'],
    ['gcLight', '港埕燈塔', 120, 520, '港埕區', 'e'],
    ['gcPark', '港埕公園', 200, 320, '港埕區', 'e'],
    ['gcNorth', '港埕北站', 200, 240, '港埕區', 'e'],

    ['ximen', '西門', 440, 400, '舊城區', 'sw'],
    ['temple', '舊城廟口', 520, 400, '舊城區', 's'],
    ['central', '澄港車站', 600, 400, '舊城區', 'ne'],
    ['cityHall', '市府', 680, 400, '舊城區', 's'],
    ['dongmen', '東門', 760, 400, '舊城區', 'ne'],
    ['beimen', '北門', 600, 280, '舊城區', 'ne'],
    ['hospital', '市立醫院', 720, 320, '舊城區', 'w'],
    ['sports', '運動公園', 700, 500, '舊城區', 'e2'],
    ['nanmen', '南門', 600, 520, '舊城區', 'se'],
    ['oldMkt', '舊城市場', 480, 480, '舊城區', 'e'],
    ['culture', '文化中心', 500, 300, '舊城區', 'e'],

    ['nbPort', '北岸漁港', 200, 160, '北岸區', 'n'],
    ['nbBeach', '北岸海濱', 360, 160, '北岸區', 'n'],
    ['nbMkt', '北岸市場', 480, 160, '北岸區', 'n'],
    ['nbHall', '北岸區公所', 600, 160, '北岸區', 'ne'],
    ['nbTerm', '北岸總站', 600, 80, '北岸區', 'e'],
    ['nbHigh', '北岸高中', 600, 220, '北岸區', 'e'],
    ['nbSchool', '北岸國小', 430, 230, '北岸區', 'w'],
    ['science', '北岸科學園區', 720, 160, '北岸區', 'se'],
    ['univ', '澄港大學', 720, 240, '北岸區', 'e'],
    ['nbLight', '北岸燈塔', 480, 80, '北岸區', 'n'],
    ['nbVillage', '北岸漁村', 360, 80, '北岸區', 'n'],

    ['teaHill', '茶山', 840, 160, '山腳區', 'n'],
    ['sjSports', '山腳運動園區', 920, 160, '山腳區', 'n'],
    ['sjJunior', '山腳國中', 920, 240, '山腳區', 'ne'],
    ['sjMkt', '山腳市場', 920, 320, '山腳區', 'e'],
    ['sjHall', '山腳區公所', 1000, 240, '山腳區', 'e'],
    ['sjInd', '山腳工業區', 1000, 320, '山腳區', 'e'],
    ['sjHosp', '山腳醫院', 1000, 400, '山腳區', 'e'],
    ['sjComm', '山腳社區', 840, 240, '山腳區', 'n'],
    ['sjOld', '山腳老街', 780, 300, '山腳區', 's'],

    ['ylTrail', '雲嶺登山口', 1040, 200, '雲嶺區', 'e'],
    ['ylTerm', '雲嶺總站', 1080, 160, '雲嶺區', 'e'],
    ['ylSpring', '雲嶺溫泉', 1000, 160, '雲嶺區', 'n'],
    ['ylSchool', '雲嶺國小', 1080, 80, '雲嶺區', 'w'],
    ['ylLake', '雲嶺天池', 1160, 80, '雲嶺區', 's'],

    ['xzBridge', '溪洲橋', 840, 400, '溪洲區', 's'],
    ['xzNight', '溪洲夜市', 740, 540, '溪洲區', 'w'],
    ['xzHall', '溪洲區公所', 780, 580, '溪洲區', 'e2'],
    ['xzRiver', '溪洲河濱公園', 860, 660, '溪洲區', 's'],
    ['xzJunior', '溪洲國中', 850, 510, '溪洲區', 'e'],
    ['xzOrchard', '溪洲果園', 1000, 480, '溪洲區', 'e'],
    ['xzFarm', '溪洲農會', 1000, 560, '溪洲區', 'e'],
    ['xzFerry', '溪洲渡口', 940, 660, '溪洲區', 's'],

    ['xwHub', '新灣轉運站', 600, 680, '新灣區', 's'],
    ['xwPark', '新灣公園', 600, 600, '新灣區', 'e'],
    ['xwMkt', '新灣市場', 520, 680, '新灣區', 's'],
    ['xwCivic', '新灣行政中心', 440, 680, '新灣區', 's'],
    ['xwPier', '新灣漁人碼頭', 360, 680, '新灣區', 'ne45'],
    ['xwTech', '新灣科技園區', 680, 680, '新灣區', 'se'],
    ['xwJunior', '新灣國中', 360, 600, '新灣區', 'w'],
    ['xwNorth', '新灣北站', 420, 540, '新灣區', 'e'],

    ['ytTerm', '鹽田總站', 120, 680, '鹽田區', 'ne45'],
    ['ytHall', '鹽田區公所', 200, 680, '鹽田區', 'ne45'],
    ['ytWet', '鹽田濕地', 280, 680, '鹽田區', 'ne45'],
    ['ytInd', '鹽田工業區', 280, 580, '鹽田區', 'e'],
    ['ytDike', '鹽田海堤', 120, 600, '鹽田區', 'e'],
    ['ytSalt', '鹽田鹽場', 200, 600, '鹽田區', 'e'],
    ['ytComm', '鹽田社區', 200, 520, '鹽田區', 'e'],
  ];

  // path：站點 id 或 [x,y] 轉折點；stops 由 path 中的站點 id 推得
  const ROUTES = [
    { id: 'T1', code: '幹1', type: 'trunk', color: 'red', name: '港埕—雲嶺', alias: '東西快線',
      path: ['gcPier', 'fishMkt', 'gcHall', 'gcSchool', 'ximen', 'temple', 'central', 'cityHall', 'dongmen', 'xzBridge', 'sjMkt', 'sjHall', 'ylTrail', 'ylTerm'],
      headway: { peak: 5, off: 8, holiday: 10 }, first: '05:30', last: '23:50', replaces: ['18', '207', '52'],
      desc: '橫貫全市的東西主軸，串起港埕、舊城與山腳，終點直上雲嶺。全日固定班距，尖峰 5 分鐘一班。' },
    { id: 'T2', code: '幹2', type: 'trunk', color: 'blue', name: '北岸—新灣', alias: '南北快線',
      path: ['nbTerm', 'nbHall', 'nbHigh', 'beimen', 'central', 'nanmen', 'xwPark', 'xwHub'],
      headway: { peak: 6, off: 10, holiday: 12 }, first: '05:40', last: '23:40', replaces: ['3', '301'],
      desc: '南北向直線縱貫，北岸與新灣兩大住宅區直達澄港車站，取代原本繞行舊城的 3 路與 301 路。' },
    { id: 'T3', code: '幹3', type: 'trunk', color: 'green', name: '鹽田—山腳', alias: '南環快線',
      path: ['ytTerm', 'ytHall', 'ytWet', 'xwPier', 'xwCivic', 'xwMkt', 'xwHub', 'xwTech', 'xzHall', 'xzJunior', [920, 440], 'sjMkt', 'sjJunior', 'sjSports'],
      headway: { peak: 7, off: 12, holiday: 12 }, first: '05:50', last: '23:30', replaces: ['215', '25'],
      desc: '沿南岸與溪洲外圍繞行，不進舊城，讓鹽田、新灣到山腳免經市中心轉車。' },
    { id: 'T4', code: '幹4', type: 'trunk', color: 'orange', name: '舊城環線', alias: '雙向環狀',
      path: ['beimen', [680, 280], 'hospital', [760, 360], 'dongmen', [760, 440], 'sports', [680, 520], 'nanmen', [520, 520], 'oldMkt', [440, 440], 'ximen', [440, 360], 'culture', [520, 280]],
      loop: true, headway: { peak: 8, off: 10, holiday: 10 }, first: '06:00', last: '23:00', replaces: ['7'],
      desc: '繞舊城一圈、雙向行駛，八個城門與市場站都能和幹線同站轉乘。' },
    { id: 'T5', code: '幹5', type: 'trunk', color: 'purple', name: '北岸—溪洲', alias: '斜向快線',
      path: ['nbBeach', 'nbSchool', 'culture', 'central', 'sports', 'xzNight', 'xzHall', 'xzRiver'],
      headway: { peak: 7, off: 12, holiday: 12 }, first: '05:50', last: '23:30', replaces: ['3', '31'],
      desc: '西北到東南的斜向直線，北岸海濱經澄港車站直達溪洲夜市與河濱公園。' },
    { id: 'T6', code: '幹6', type: 'trunk', color: 'yellow', name: '北岸—雲嶺', alias: '山海線',
      path: ['nbPort', 'nbBeach', 'nbMkt', 'nbHall', 'science', 'teaHill', 'sjSports', 'ylSpring', 'ylTerm'],
      headway: { peak: 10, off: 15, holiday: 12 }, first: '06:00', last: '22:30', replaces: ['12', '66'],
      desc: '沿北岸一路向東進山，串起漁港、科學園區、茶山與雲嶺溫泉；假日加開觀光班次。' },

    { id: 'B11', code: '支11', type: 'branch', color: 'red', name: '港埕區公所—鹽田濕地',
      path: ['gcHall', 'gcMkt', 'ytInd', 'ytWet'],
      headway: { peak: 15, off: 20, holiday: 25 }, first: '06:00', last: '22:00', replaces: ['18', '215'],
      desc: '港埕與鹽田之間的南北短線，兩端分別接幹1、幹3。' },
    { id: 'B12', code: '支12', type: 'branch', color: 'red', name: '山腳區公所—溪洲果園',
      path: ['sjHall', 'sjInd', 'sjHosp', 'xzOrchard'],
      headway: { peak: 15, off: 25, holiday: 30 }, first: '06:10', last: '21:30', replaces: ['603', '207'],
      desc: '服務山腳工業區與山腳醫院，於山腳區公所接幹1。' },
    { id: 'B21', code: '支21', type: 'branch', color: 'blue', name: '北岸總站—北岸漁村',
      path: ['nbTerm', 'nbLight', 'nbVillage'],
      headway: { peak: 20, off: 30, holiday: 30 }, first: '06:20', last: '21:00', replaces: ['8'],
      desc: '北岸海岸線短支線，於北岸總站接幹2。' },
    { id: 'B31', code: '支31', type: 'branch', color: 'green', name: '鹽田總站—港埕碼頭',
      path: ['ytTerm', 'ytDike', 'gcLight', 'gcPier'],
      headway: { peak: 15, off: 25, holiday: 30 }, first: '06:00', last: '21:30', replaces: ['18', '215'],
      desc: '沿西岸海堤行駛，兩端分別接幹3與幹1。' },
    { id: 'B41', code: '支41', type: 'branch', color: 'orange', name: '市立醫院—北岸科學園區',
      path: ['hospital', 'univ', 'science'],
      headway: { peak: 10, off: 15, holiday: 20 }, first: '06:30', last: '22:30', replaces: ['66'],
      desc: '大學與園區通勤線，於市立醫院接幹4、北岸科學園區接幹6。' },
    { id: 'B42', code: '支42', type: 'branch', color: 'orange', name: '舊城市場—新灣漁人碼頭',
      path: ['oldMkt', 'xwNorth', 'xwJunior', 'xwPier'],
      headway: { peak: 12, off: 20, holiday: 20 }, first: '06:00', last: '22:00', replaces: ['301'],
      desc: '舊城西南角斜向接新灣，國中上下學時段加密。' },
    { id: 'B51', code: '支51', type: 'branch', color: 'purple', name: '溪洲河濱公園—溪洲果園',
      path: ['xzRiver', 'xzFerry', [1000, 600], 'xzFarm', 'xzOrchard'],
      headway: { peak: 20, off: 30, holiday: 30 }, first: '06:20', last: '21:00', replaces: ['31', '603'],
      desc: '溪洲東側農村線，於溪洲河濱公園接幹5、溪洲果園接支12。' },
    { id: 'B61', code: '支61', type: 'branch', color: 'yellow', name: '北岸漁港—漁市場',
      path: ['nbPort', 'gcNorth', 'gcPark', 'fishMkt'],
      headway: { peak: 15, off: 20, holiday: 25 }, first: '06:00', last: '22:00', replaces: ['8'],
      desc: '漁港到漁市場的西側縱線，兩端分別接幹6與幹1。' },

    { id: 'F1', code: '接1', type: 'feeder', color: 'yellow', name: '雲嶺總站—雲嶺天池',
      path: ['ylTerm', 'ylSchool', 'ylLake'],
      headway: { peak: 30, off: 40, holiday: 20 }, first: '07:00', last: '19:00', replaces: ['52'],
      desc: '山區接駁小巴，假日配合登山客加密為 20 分鐘一班。' },
    { id: 'F2', code: '接2', type: 'feeder', color: 'green', name: '山腳國中—山腳老街',
      path: ['sjJunior', 'sjComm', 'sjOld'],
      headway: { peak: 25, off: 40, holiday: 40 }, first: '06:30', last: '20:00', replaces: ['52', '207'],
      desc: '山腳社區巷弄接駁，於山腳國中接幹3。' },
    { id: 'F3', code: '接3', type: 'feeder', color: 'green', name: '鹽田區公所—鹽田社區',
      path: ['ytHall', 'ytSalt', 'ytComm'],
      headway: { peak: 30, off: 45, holiday: 45 }, first: '06:30', last: '19:30', replaces: ['215'],
      desc: '鹽田鹽場與社區接駁，於鹽田區公所接幹3。' },

    { id: 'N1', code: '夜1', type: 'night', color: 'ink', name: '港埕碼頭—溪洲河濱公園',
      path: ['gcPier', 'fishMkt', 'gcHall', 'gcSchool', 'ximen', 'temple', 'central', 'sports', 'xzNight', 'xzHall', 'xzRiver'],
      headway: { peak: 20, off: 20, holiday: 20 }, first: '23:30', last: '04:30', replaces: [],
      desc: '新增夜間路線：沿幹1、幹5 走廊，服務港埕漁市與溪洲夜市的夜間工作者。' },
    { id: 'N2', code: '夜2', type: 'night', color: 'ink', name: '北岸總站—新灣行政中心',
      path: ['nbTerm', 'nbHall', 'nbHigh', 'beimen', 'central', 'nanmen', 'xwPark', 'xwHub', 'xwMkt', 'xwCivic'],
      headway: { peak: 30, off: 30, holiday: 30 }, first: '23:40', last: '04:40', replaces: [],
      desc: '新增夜間路線：沿幹2 南北走廊延伸至新灣行政中心。' },
  ];

  // 舊路網：以站點序列描述，路線彎繞、彼此重疊，班距較疏
  const OLD_ROUTES = [
    { id: '3', name: '北岸—車站', stops: ['nbTerm', 'nbHall', 'nbMkt', 'nbSchool', 'culture', 'beimen', 'central'],
      headway: { peak: 15, off: 25, holiday: 30 }, first: '06:00', last: '22:30' },
    { id: '7', name: '舊城循環', loop: true, stops: ['central', 'temple', 'ximen', 'culture', 'beimen', 'hospital', 'dongmen', 'sports', 'nanmen', 'oldMkt'],
      headway: { peak: 20, off: 30, holiday: 30 }, first: '06:30', last: '21:30' },
    { id: '8', name: '港埕北線', stops: ['gcPier', 'fishMkt', 'gcPark', 'gcNorth', 'nbPort', 'nbVillage', 'nbLight', 'nbTerm'],
      headway: { peak: 30, off: 45, holiday: 60 }, first: '06:20', last: '21:00' },
    { id: '12', name: '北岸線', stops: ['nbPort', 'nbBeach', 'nbMkt', 'nbHall', 'nbHigh', 'science', 'teaHill'],
      headway: { peak: 20, off: 30, holiday: 40 }, first: '06:10', last: '22:00' },
    { id: '18', name: '港埕線', stops: ['gcLight', 'gcPier', 'fishMkt', 'gcHall', 'gcMkt', 'gcSchool', 'ximen', 'oldMkt', 'nanmen', 'central'],
      headway: { peak: 12, off: 20, holiday: 25 }, first: '05:50', last: '22:40' },
    { id: '25', name: '新灣溪洲線', stops: ['xwHub', 'xwTech', 'xzNight', 'xzHall', 'xzJunior', 'xzRiver'],
      headway: { peak: 20, off: 30, holiday: 30 }, first: '06:10', last: '22:00' },
    { id: '31', name: '溪洲線', stops: ['dongmen', 'sports', 'xzNight', 'xzHall', 'xzFerry', 'xzFarm', 'xzOrchard'],
      headway: { peak: 25, off: 40, holiday: 40 }, first: '06:20', last: '21:30' },
    { id: '52', name: '雲嶺線', stops: ['central', 'cityHall', 'dongmen', 'xzBridge', 'sjOld', 'sjMkt', 'sjComm', 'sjJunior', 'sjHall', 'ylTrail', 'ylTerm', 'ylSchool', 'ylLake'],
      headway: { peak: 20, off: 40, holiday: 30 }, first: '06:00', last: '21:30' },
    { id: '66', name: '山海線', stops: ['nbHall', 'nbHigh', 'beimen', 'hospital', 'univ', 'science', 'teaHill', 'sjSports', 'ylSpring', 'ylTerm'],
      headway: { peak: 30, off: 45, holiday: 40 }, first: '06:30', last: '21:00' },
    { id: '207', name: '港埕—山腳', stops: ['gcSchool', 'ximen', 'temple', 'central', 'cityHall', 'hospital', 'sjOld', 'sjMkt', 'sjInd', 'sjHosp'],
      headway: { peak: 15, off: 25, holiday: 30 }, first: '05:50', last: '22:30' },
    { id: '215', name: '鹽田線', stops: ['xwHub', 'xwMkt', 'xwCivic', 'xwJunior', 'ytInd', 'ytWet', 'ytHall', 'ytTerm', 'ytDike', 'ytSalt', 'ytComm'],
      headway: { peak: 20, off: 35, holiday: 40 }, first: '06:00', last: '22:00' },
    { id: '301', name: '新灣線', stops: ['central', 'nanmen', 'xwNorth', 'xwJunior', 'xwPier', 'xwCivic', 'xwHub', 'xwPark'],
      headway: { peak: 15, off: 25, holiday: 30 }, first: '05:50', last: '22:40' },
    { id: '603', name: '山腳工業線', stops: ['sjHall', 'sjInd', 'sjHosp', 'xzOrchard', 'xzFarm', 'xzFerry'],
      headway: { peak: 40, off: 60, holiday: 60 }, first: '06:40', last: '20:00' },
  ];

  // 各區人口（萬人）與「300 公尺內有尖峰 10 分鐘內班距公車」的人口覆蓋率
  const DISTRICTS = [
    { name: '港埕區', pop: 12.4, old: 54, new: 81 },
    { name: '北岸區', pop: 9.8, old: 41, new: 72 },
    { name: '舊城區', pop: 16.1, old: 78, new: 94 },
    { name: '山腳區', pop: 7.2, old: 33, new: 64 },
    { name: '新灣區', pop: 18.6, old: 62, new: 88 },
    { name: '鹽田區', pop: 5.3, old: 29, new: 58 },
    { name: '溪洲區', pop: 8.9, old: 45, new: 76 },
    { name: '雲嶺區', pop: 2.1, old: 12, new: 37 },
  ];

  const TIMELINE = [
    { date: '2025-11-03', title: '路網規劃啟動', desc: '分析全市一年 1,280 萬筆刷卡起訖資料，找出 13 條舊路線的重疊與繞駛。', state: 'done' },
    { date: '2026-04-11', title: '八區說明會', desc: '32 場說明會、2,316 位市民到場，收到 4,870 則意見。', state: 'done' },
    { date: '2026-07-15', title: '路網定案公告', desc: '公告 19 條新路線與 67 座站點，舊路線對照表同步上線。', state: 'done' },
    { date: '2026-10-01', title: '站牌更換與試營運', desc: '10 月至 11 月分區更換站牌，轉乘站改為膠囊形站牌。', state: 'now' },
    { date: '2027-01-01', title: '第一階段上路', desc: '幹1–幹6 與夜1、夜2 正式營運，舊路線並行。', state: 'next' },
    { date: '2027-03-01', title: '第二階段：支線', desc: '支11–支61 共 8 條支線上路，重疊的舊路線併入。', state: 'next' },
    { date: '2027-05-01', title: '第三階段：接駁', desc: '接1–接3 上路，13 條舊路線全數退場。', state: 'next' },
  ];

  App.data = {
    colors: COLORS, types: TYPES, typeOrder: TYPE_ORDER,
    districts: DISTRICTS, timeline: TIMELINE, launch: '2027-01-01',
    stations: [], routes: [], oldRoutes: [],
  };

  /* ---------- 衍生資料：站點↔路線關聯、幾何、車程 ---------- */
  const PX_KM = 0.014;
  const DWELL = 0.35;          // 每站停靠分鐘
  const OLD_SPEED = 19;        // 舊路線平均時速（繞駛、站距短）
  const OLD_DETOUR = 1.1;      // 舊路線實際行駛距離相對站間直線的係數
  const WALK_SPEED = 75;       // 公尺／分
  const XFER_WALK = { new: 40, old: 180 };   // 新路網轉乘站為同站轉乘，舊路網要走到另一個站牌
  const XFER_PENALTY = 5;      // 規劃時把轉乘的不便折算成分鐘（不計入回報的時間）
  // 模擬參數對外公開：頁面上的說明文字（計算方式、步行距離）與站間動畫都從這裡取，數字才不會各寫各的
  App.data.sim = {
    dwellMin: DWELL, oldSpeed: OLD_SPEED, oldDetourPct: Math.round((OLD_DETOUR - 1) * 100),
    walkSpeed: WALK_SPEED, xferWalk: XFER_WALK, xferPenalty: XFER_PENALTY,
  };

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  const stations = STATIONS.map(([id, name, x, y, district, label]) => ({
    id, name, x, y, district, label, routes: [], oldRoutes: [], transfer: false, terminal: false,
  }));
  const S = Object.fromEntries(stations.map(s => [s.id, s]));

  const routes = ROUTES.map(def => {
    const r = Object.assign({ loop: false }, def);
    r.points = r.path.map(p => typeof p === 'string' ? [S[p].x, S[p].y] : p);
    r.stopIdx = [];                       // 各站在 points 中的索引
    r.path.forEach((p, i) => { if (typeof p === 'string') r.stopIdx.push(i); });
    r.stops = r.stopIdx.map(i => r.path[i]);
    r.from = r.stops[0];
    r.to = r.loop ? r.stops[0] : r.stops[r.stops.length - 1];
    // 相鄰兩站之間的路徑長度（含轉折點）
    const segLen = (a, b) => { let L = 0; for (let i = a; i < b; i++) L += dist(r.points[i], r.points[i + 1]); return L; };
    r.segPx = [];
    for (let k = 0; k < r.stopIdx.length - 1; k++) r.segPx.push(segLen(r.stopIdx[k], r.stopIdx[k + 1]));
    if (r.loop) {
      let L = 0; const n = r.points.length;
      for (let i = r.stopIdx[r.stopIdx.length - 1]; i < n; i++) L += dist(r.points[i], r.points[(i + 1) % n]);
      r.segPx.push(L);
    }
    const speed = TYPES[r.type].speed;
    r.segMin = r.segPx.map(px => px * PX_KM / speed * 60 + DWELL);
    r.lengthPx = r.segPx.reduce((a, b) => a + b, 0);
    r.km = Math.round(r.lengthPx * PX_KM * 10) / 10;
    r.minutes = Math.round(r.segMin.reduce((a, b) => a + b, 0));
    r.colorHex = COLORS[r.color].hex;
    return r;
  });
  const R = Object.fromEntries(routes.map(r => [r.id, r]));

  const oldRoutes = OLD_ROUTES.map(def => {
    const o = Object.assign({ loop: false, code: def.id, to: [] }, def);
    o.points = o.stops.map(id => [S[id].x, S[id].y]);
    o.segPx = [];
    for (let i = 0; i < o.points.length - 1; i++) o.segPx.push(dist(o.points[i], o.points[i + 1]) * OLD_DETOUR);
    if (o.loop) o.segPx.push(dist(o.points[o.points.length - 1], o.points[0]) * OLD_DETOUR);
    o.segMin = o.segPx.map(px => px * PX_KM / OLD_SPEED * 60 + DWELL);
    o.km = Math.round(o.segPx.reduce((a, b) => a + b, 0) * PX_KM * 10) / 10;
    o.minutes = Math.round(o.segMin.reduce((a, b) => a + b, 0));
    o.from = o.stops[0];
    o.end = o.loop ? o.stops[0] : o.stops[o.stops.length - 1];
    return o;
  });
  const O = Object.fromEntries(oldRoutes.map(o => [o.id, o]));

  routes.forEach(r => {
    r.stops.forEach(id => { if (!S[id].routes.includes(r.id)) S[id].routes.push(r.id); });
    r.replaces.forEach(oid => O[oid].to.push(r.id));
  });
  oldRoutes.forEach(o => o.stops.forEach(id => { if (!S[id].oldRoutes.includes(o.id)) S[id].oldRoutes.push(o.id); }));
  stations.forEach(s => {
    const day = s.routes.filter(id => R[id].type !== 'night');
    s.transfer = day.length >= 2;
    s.terminal = day.some(id => !R[id].loop && (R[id].from === s.id || R[id].to === s.id));
  });

  App.data.stations = stations;
  App.data.routes = routes;
  App.data.oldRoutes = oldRoutes;
  App.station = id => S[id];
  App.route = id => R[id];
  App.oldRoute = id => O[id];
  App.routesOf = type => {
    const list = type ? routes.filter(r => r.type === type) : routes;
    return [...list].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  };
  App.routeURL = id => 'route.html?id=' + encodeURIComponent(id);
  App.findStations = q => {
    const k = String(q || '').trim().replace(/\s+/g, '');
    if (!k) return [];
    const score = s => s.name === k ? 0 : s.name.startsWith(k) ? 1 : s.name.includes(k) ? 2 : s.district.includes(k) ? 3 : 9;
    return stations.filter(s => score(s) < 9).sort((a, b) => score(a) - score(b) || b.routes.length - a.routes.length);
  };

  /* ---------- 車程與班表 ---------- */
  App.stopOffsets = (id, network = 'new') => {
    const r = network === 'old' ? O[id] : R[id];
    const out = [0];
    for (let i = 0; i < r.stops.length - 1; i++) out.push(out[i] + r.segMin[i]);
    return out.map(Math.round);
  };

  App.headwayAt = (r, minute, day = 'weekday') => {
    if (r.type === 'night') return r.headway.off;
    if (day === 'holiday') return r.headway.holiday;
    const h = (minute % 1440) / 60;
    if ((h >= 7 && h < 9) || (h >= 17 && h < 19.5)) return r.headway.peak;
    if (h >= 21) return Math.round(r.headway.off * 1.5);   // 晚間 21 點後疏運
    return r.headway.off;
  };

  App.schedule = (id, day = 'weekday', dir = 0) => {
    const r = R[id] || O[id];
    let t = toMin(r.first);
    let end = toMin(r.last);
    if (end <= t) end += 1440;                             // 夜間路線跨午夜
    // 返程由另一端發車並錯開半個班距，兩端時刻表才不會完全相同
    if (dir === 1 && !r.loop) t += Math.round(App.headwayAt(r, t, day) / 2);
    const out = [];
    while (t <= end) { out.push(t % 1440); t += App.headwayAt(r, t, day); }
    return out;
  };

  /* ---------- 旅運規劃（Dijkstra，狀態＝站點×路線） ---------- */
  const graphs = {};
  function graphFor(network, period) {
    const key = network + '|' + period;
    if (graphs[key]) return graphs[key];
    const list = network === 'old'
      ? oldRoutes
      : routes.filter(r => period === 'night' ? r.type === 'night' : r.type !== 'night');
    const states = [];                 // {r, k, s}
    const at = {};                     // stationId → 狀態索引[]
    const idx = new Map();
    list.forEach(r => r.stops.forEach((s, k) => {
      (at[s] = at[s] || []).push(states.length);
      idx.set(r.id + '|' + k, states.length);
      states.push({ r, k, s });
    }));
    const hw = r => period === 'peak' ? r.headway.peak : r.headway.off;
    return (graphs[key] = { network, period, list, states, at, idx, wait: r => hw(r) / 2 });
  }

  function dijkstra(g, fromId) {
    const n = g.states.length;
    const cost = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    (g.at[fromId] || []).forEach(i => { cost[i] = g.wait(g.states[i].r); });
    const xferMin = XFER_WALK[g.network] / WALK_SPEED;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && cost[i] < best) { best = cost[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      const { r, k, s } = g.states[u];
      const m = r.stops.length;
      const relax = (v, c) => { if (c < cost[v]) { cost[v] = c; prev[v] = u; } };
      // 沿線前後各一站（環線首尾相接）
      if (k + 1 < m) relax(g.idx.get(r.id + '|' + (k + 1)), best + r.segMin[k]);
      else if (r.loop) relax(g.idx.get(r.id + '|0'), best + r.segMin[k]);
      if (k > 0) relax(g.idx.get(r.id + '|' + (k - 1)), best + r.segMin[k - 1]);
      else if (r.loop) relax(g.idx.get(r.id + '|' + (m - 1)), best + r.segMin[m - 1]);
      // 同站轉乘
      g.at[s].forEach(v => { if (g.states[v].r !== r) relax(v, best + xferMin + g.wait(g.states[v].r) + XFER_PENALTY); });
    }
    return { cost, prev };
  }

  App.accessWalk = (stationId, network) => {
    const d = DISTRICTS.find(x => x.name === S[stationId].district);
    // 覆蓋率越高代表站點越密，平均走到站牌的距離越短
    return Math.round(200 + (100 - d[network]) * 3.2);
  };

  function buildResult(g, tree, fromId, toId) {
    let end = -1, best = Infinity;
    (g.at[toId] || []).forEach(i => { if (tree.cost[i] < best) { best = tree.cost[i]; end = i; } });
    if (end < 0) return null;
    const chain = [];
    for (let i = end; i >= 0; i = tree.prev[i]) chain.unshift(i);
    const legs = [];
    let ride = 0, wait = 0;
    chain.forEach((i, c) => {
      const st = g.states[i];
      const last = legs[legs.length - 1];
      if (!last || last.route !== st.r.id) {
        wait += g.wait(st.r);
        legs.push({ route: st.r.id, stops: [st.s], minutes: 0 });
        return;
      }
      const p = g.states[chain[c - 1]];
      const m = st.r.stops.length;
      // 往前一站用 p.k 的路段，往後一站用 st.k 的路段
      const seg = st.r.segMin[(p.k + 1) % m === st.k ? p.k : st.k];
      last.minutes += seg;
      ride += seg;
      last.stops.push(st.s);
    });
    const transfers = legs.length - 1;
    const walk = App.accessWalk(fromId, g.network) + App.accessWalk(toId, g.network) + transfers * XFER_WALK[g.network];
    const walkMin = walk / WALK_SPEED;
    legs.forEach(l => { l.minutes = Math.round(l.minutes); });
    return {
      network: g.network, period: g.period, from: fromId, to: toId,
      minutes: Math.round(ride + wait + walkMin), ride: Math.round(ride), wait: Math.round(wait),
      walk, walkMin: Math.round(walkMin), transfers, legs,
    };
  }

  const trees = {};
  App.plan = (fromId, toId, opts = {}) => {
    if (!S[fromId] || !S[toId] || fromId === toId) return null;
    const g = graphFor(opts.network || 'new', opts.period || 'off');
    const key = g.network + '|' + g.period + '|' + fromId;
    return buildResult(g, trees[key] || (trees[key] = dijkstra(g, fromId)), fromId, toId);
  };

  App.reach = (stationId, network = 'new') => {
    const g = graphFor(network, 'off');
    const direct = new Set(), oneTransfer = new Set();
    const own = g.list.filter(r => r.stops.includes(stationId));
    own.forEach(r => r.stops.forEach(s => direct.add(s)));
    own.forEach(r => r.stops.forEach(s => g.list.forEach(r2 => {
      if (r2 !== r && r2.stops.includes(s)) r2.stops.forEach(t => oneTransfer.add(t));
    })));
    direct.delete(stationId);
    oneTransfer.delete(stationId);
    direct.forEach(s => oneTransfer.delete(s));
    return { direct, oneTransfer };
  };

  const statsCache = {};
  App.networkStats = (network = 'new', period = 'off') => {
    const key = network + '|' + period;
    if (statsCache[key]) return statsCache[key];
    let n = 0, mins = 0, xf = 0, walk = 0, wait = 0, ride = 0, direct = 0, one = 0;
    stations.forEach(a => stations.forEach(b => {
      const p = App.plan(a.id, b.id, { network, period });
      if (!p) return;
      n++; mins += p.minutes; xf += p.transfers; walk += p.walk; wait += p.wait; ride += p.ride;
      if (p.transfers === 0) direct++;
      if (p.transfers <= 1) one++;
    }));
    return (statsCache[key] = {
      pairs: n, avgMinutes: mins / n, avgTransfers: xf / n, avgWalk: walk / n, avgWait: wait / n, avgRide: ride / n,
      directShare: direct / n * 100, oneXferShare: one / n * 100,
    });
  };

  App.coverageTotal = network => {
    const pop = DISTRICTS.reduce((a, d) => a + d.pop, 0);
    return DISTRICTS.reduce((a, d) => a + d.pop * d[network], 0) / pop;
  };

  /* ---------- HTML 片段 ---------- */
  App.pillHTML = (id, opts = {}) => {
    const r = R[id];
    const cls = `pill pill--${r.type} c-${r.color}${opts.size ? ' pill--' + opts.size : ''}${opts.cls ? ' ' + opts.cls : ''}`;
    const title = opts.title === false ? '' : ` title="${App.esc(r.code + '　' + r.name)}"`;
    return opts.link
      ? `<a class="${cls}" href="${App.routeURL(id)}"${title}>${r.code}</a>`
      : `<span class="${cls}"${title}>${r.code}</span>`;
  };
  App.oldPillHTML = (id, opts = {}) =>
    `<span class="pill pill--old${opts.size ? ' pill--' + opts.size : ''}" title="${App.esc('舊 ' + id + ' 路　' + O[id].name)}">${id}</span>`;

  // 卡片用 mini 線形圖：等距排站，轉乘站畫膠囊、端點加粗
  App.lineStripSVG = (id, opts = {}) => {
    const r = R[id];
    const w = opts.width || 280, h = opts.height || (opts.labels ? 52 : 28);
    const pad = 10, y = opts.labels ? 16 : h / 2;
    const lw = TYPES[r.type].lw - 2;
    const n = r.stops.length;
    const xs = r.stops.map((_, i) => Math.round(pad + (w - pad * 2) * i / (n - 1)));
    const c = r.colorHex;
    const dash = r.type === 'feeder' ? ' stroke-dasharray="7 5"' : r.type === 'night' ? ' stroke-dasharray="1 6"' : '';
    const label = `${r.code} 共 ${n} 站：${S[r.from].name}${r.loop ? '（環狀）' : '至' + S[r.to].name}`;
    let out = `<svg class="line-strip" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${App.esc(label)}">`;
    out += `<line x1="${xs[0]}" y1="${y}" x2="${xs[n - 1]}" y2="${y}" stroke="${c}" stroke-width="${lw}" stroke-linecap="round"${dash}/>`;
    r.stops.forEach((sid, i) => {
      const s = S[sid];
      const end = i === 0 || i === n - 1;
      out += s.transfer
        ? `<rect x="${xs[i] - 7}" y="${y - 5}" width="14" height="10" rx="5" fill="#FFFFFF" stroke="#1C1C1C" stroke-width="2"/>`
        : `<circle cx="${xs[i]}" cy="${y}" r="${end ? 4 : 3}" fill="#FFFFFF" stroke="${r.type === 'night' ? '#1C1C1C' : c}" stroke-width="${end ? 2.5 : 2}"/>`;
    });
    if (opts.labels) {
      out += `<text x="${xs[0] - 4}" y="${h - 6}" font-size="11" fill="#3D3D3A">${App.esc(S[r.from].name)}</text>`;
      out += `<text x="${xs[n - 1] + 4}" y="${h - 6}" font-size="11" fill="#3D3D3A" text-anchor="end">${App.esc(r.loop ? '回到' + S[r.from].name : S[r.to].name)}</text>`;
    }
    return out + '</svg>';
  };

  // 橫向站序圖（route.html 用）：每站標示可轉乘路線，外層可水平捲動
  App.stopStripHTML = (id, opts = {}) => {
    const r = R[id];
    const offs = App.stopOffsets(id);
    const items = r.stops.map((sid, i) => {
      const s = S[sid];
      const others = s.routes.filter(x => x !== id);
      const cls = ['stop-strip__stop'];
      if (s.transfer) cls.push('is-transfer');
      if (i === 0 || (!r.loop && i === r.stops.length - 1)) cls.push('is-terminal');
      if (opts.current === sid) cls.push('is-current');
      return `<li class="${cls.join(' ')}" data-station="${sid}">`
        + `<span class="stop-strip__dot" aria-hidden="true"></span>`
        + (opts.times !== false ? `<span class="stop-strip__time">${offs[i]}<small> 分</small></span>` : '')
        + `<span class="stop-strip__name">${App.esc(s.name)}</span>`
        + (opts.transfers !== false && others.length ? `<span class="stop-strip__xfer">${others.map(x => App.pillHTML(x, { size: 'sm', link: true })).join('')}</span>` : '')
        + `</li>`;
    }).join('');
    return `<div class="stop-strip c-${r.color}${r.loop ? ' is-loop' : ''}" style="--n:${r.stops.length}"><ol class="stop-strip__list">${items}</ol></div>`;
  };

  /* ==========================================================================
     路網圖引擎 App.map
     圖層由下而上：網格與水域 → 舊路線 → 路線 → 夜間 → 感應區 → 巴士 → 站點 → 站名 → 疊加層
     顏色、線寬一律寫成 SVG presentation attribute；CSS 只管 opacity / transform 等狀態，
     避免通用 class 蓋掉個別路線的 stroke。
     ========================================================================== */
  const PAPER = '#FFFFFF';
  const SEA = '#E8F1F6';
  const INK = '#1C1C1C';
  const OLD_GRAY = '#A3A39C';
  let mapSeq = 0;

  function roundedPath(pts, loop, rad = 14) {
    const n = pts.length;
    const f = v => Math.round(v * 10) / 10;
    const step = (A, P, B) => {
      const ax = A[0] - P[0], ay = A[1] - P[1], bx = B[0] - P[0], by = B[1] - P[1];
      if (Math.abs(ax * by - ay * bx) < 1e-6) return ` L${P[0]} ${P[1]}`;   // 直行通過不需圓角
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const r = Math.min(rad, la / 2, lb / 2);
      return ` L${f(P[0] + ax / la * r)} ${f(P[1] + ay / la * r)} Q${P[0]} ${P[1]} ${f(P[0] + bx / lb * r)} ${f(P[1] + by / lb * r)}`;
    };
    if (!loop) {
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < n - 1; i++) d += step(pts[i - 1], pts[i], pts[i + 1]);
      return d + ` L${pts[n - 1][0]} ${pts[n - 1][1]}`;
    }
    // 環線從第 0、1 點的中點起筆，閉合處的圓角才接得起來
    const m0 = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    let d = `M${m0[0]} ${m0[1]}`;
    for (let i = 1; i <= n; i++) d += step(pts[(i - 1) % n], pts[i % n], pts[(i + 1) % n]);
    return d + ` L${m0[0]} ${m0[1]} Z`;
  }
  App.roundedPath = roundedPath;

  // 依實際搭乘的站序，取出路線上兩站之間（含轉折點）的折線
  function legPoints(routeId, stops, network) {
    if (network === 'old') return stops.map(id => [S[id].x, S[id].y]);
    const r = R[routeId];
    const last = r.stops.length - 1;
    const pts = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = r.stops.indexOf(stops[i]), b = r.stops.indexOf(stops[i + 1]);
      const pa = r.stopIdx[a], pb = r.stopIdx[b];
      let seg;
      if (b === a + 1) seg = r.points.slice(pa, pb + 1);
      else if (a === b + 1) seg = r.points.slice(pb, pa + 1).reverse();
      else if (a === last) seg = [...r.points.slice(pa), r.points[0]];            // 環線跨越起點
      else seg = [...r.points.slice(pb), r.points[0]].reverse();
      pts.push(...(i ? seg.slice(1) : seg));
    }
    return pts;
  }
  App.legPoints = legPoints;

  const LABEL_POS = {
    n: [0, -12, 'middle'], s: [0, 21, 'middle'], e: [12, 5, 'start'], e2: [22, 5, 'start'], w: [-12, 5, 'end'],
    ne: [9, -9, 'start'], nw: [-9, -9, 'end'], se: [9, 19, 'start'], sw: [-9, 19, 'end'],
    ne45: [13, -11, 'start', -45],   // 45° 斜排：站距密的一整排站名（Beck 式路網圖的作法）
  };

  class NetworkMap {
    constructor(svg, opts = {}) {
      this.svg = svg;
      this.uid = 'nm' + (++mapSeq);
      this.o = Object.assign({
        labels: 'major', animate: true, buses: true, interactive: true, link: true,
        viewBox: [40, 40, 1170, 690], old: false, onStation: null,
      }, opts);
      this.layers = Object.assign({ trunk: true, branch: true, feeder: true, night: false }, opts.layers);
      this.hover = null;
      this.locked = null;
      this.stationFocus = null;
      this.timers = [];
      this.render();
      if (this.o.old) this.showOld(this.o.old === true ? oldRoutes.map(o => o.id) : this.o.old);
      if (this.o.interactive) this.bind();
      this.intro(this.o.animate && !App.reducedMotion);
    }

    render() {
      const { svg, uid } = this;
      const [vx, vy, vw, vh] = this.o.viewBox;
      svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
      svg.classList.add('nm');
      if (!svg.hasAttribute('role')) svg.setAttribute('role', 'img');
      const lines = App.routesOf().map(r => {
        const d = roundedPath(r.points, r.loop);
        const lw = TYPES[r.type].lw;
        const common = `d="${d}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
        let inner = '';
        // 黃線在白底上對比低，多畫一圈同色系的深黃外框
        if (r.color === 'yellow') inner += `<path ${common} stroke="#D9B300" stroke-width="${lw + 2.5}"/>`;
        const dash = r.type === 'feeder' ? ' stroke-dasharray="9 6"' : r.type === 'night' ? ' stroke-dasharray="0.1 7"' : '';
        inner += `<path class="nm-line" ${common} stroke="${r.colorHex}" stroke-width="${lw}"${dash}/>`;
        return `<g class="nm-rt" data-route="${r.id}" data-type="${r.type}">${inner}</g>`;
      }).join('');
      const hits = [...App.routesOf()].reverse().map(r =>
        `<path class="nm-hit" data-route="${r.id}" data-type="${r.type}" d="${roundedPath(r.points, r.loop)}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="22" pointer-events="stroke"/>`).join('');
      svg.innerHTML = `
        <defs>
          <pattern id="${uid}-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="1.3" fill="${INK}" fill-opacity="0.12"/>
          </pattern>
        </defs>
        <g class="nm-geo" aria-hidden="true">
          <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${PAPER}"/>
          <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#${uid}-grid)"/>
          <path d="M40 40 H860 L846 54 H96 V698 L110 712 H760 L778 730 H40 Z" fill="${SEA}"/>
          <path d="M1210 444 H1080 L960 564 L900 624 H820 L748 696 L732 712" fill="none" stroke="${SEA}" stroke-width="12" stroke-linejoin="round"/>
          <text x="68" y="300" transform="rotate(-90 68 300)" text-anchor="middle" font-size="12" letter-spacing="5" fill="#5E7F92" font-weight="600">CHENGGANG BAY · 澄港灣</text>
          <text x="1140" y="434" text-anchor="middle" font-size="12" letter-spacing="4" fill="#5E7F92" font-weight="600">澄溪</text>
          <g transform="translate(1064 700)">
            <path d="M0 0 H71.4 M0 -5 V0 M35.7 -3 V0 M71.4 -5 V0" fill="none" stroke="${INK}" stroke-width="1.5"/>
            <text x="0" y="16" font-size="11" fill="#6B6B66">0</text>
            <text x="71.4" y="16" font-size="11" fill="#6B6B66" text-anchor="end">1 km</text>
          </g>
          <g transform="translate(1176 676)">
            <path d="M0 -18 L7 4 L0 0 L-7 4 Z" fill="${INK}"/>
            <text x="0" y="20" font-size="11" font-weight="700" fill="${INK}" text-anchor="middle">N</text>
          </g>
        </g>
        <g class="nm-old"></g>
        <g class="nm-lines">${lines}</g>
        <g class="nm-hits">${this.o.interactive ? hits : ''}</g>
        <g class="nm-buses"></g>
        <g class="nm-stations"></g>
        <g class="nm-labels"></g>
        <g class="nm-overlay"></g>`;
      this.g = {
        old: svg.querySelector('.nm-old'), buses: svg.querySelector('.nm-buses'),
        stations: svg.querySelector('.nm-stations'), labels: svg.querySelector('.nm-labels'),
        overlay: svg.querySelector('.nm-overlay'),
      };
      this.applyLayers();
    }

    visibleRoutes(s) {
      return s.routes.filter(id => this.layers[R[id].type]);
    }

    renderStations() {
      let st = '', lb = '', i = 0;
      stations.forEach(s => {
        const vis = this.visibleRoutes(s);
        if (!vis.length) return;
        const day = vis.filter(id => R[id].type !== 'night');
        let shape;
        if (day.length >= 2) {
          const big = day.length >= 3;
          const w = big ? 30 : 22, h = big ? 17 : 14;
          shape = `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>`;
        } else {
          const r = day.length ? R[day[0]] : R[vis[0]];
          const end = s.terminal;
          shape = `<circle r="${end ? 5.5 : 4.5}" fill="${PAPER}" stroke="${r.type === 'night' ? INK : r.colorHex}" stroke-width="${end ? 3.5 : 3}"/>`;
        }
        st += `<g class="nm-st" data-st="${s.id}" transform="translate(${s.x} ${s.y})" style="--i:${i++}">${shape}</g>`;
        const major = s.transfer || s.terminal;
        if (this.o.labels === 'none') return;
        const [dx, dy, anchor, rot] = LABEL_POS[s.label];
        const extra = day.length >= 2 ? (s.label.startsWith('e') ? 4 : s.label === 'w' ? -4 : 0) : 0;
        const cls = 'nm-lb' + (this.o.labels === 'major' && !major ? ' is-minor' : '');
        const lx = s.x + dx + extra, ly = s.y + dy;
        lb += `<text class="${cls}" data-st="${s.id}" x="${lx}" y="${ly}"${rot ? ` transform="rotate(${rot} ${lx} ${ly})"` : ''} text-anchor="${anchor}" font-size="${major ? 15 : 13.5}" font-weight="${major ? 700 : 500}" fill="${INK}" stroke="${PAPER}" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke">${App.esc(s.name)}</text>`;
      });
      this.g.stations.innerHTML = st;
      this.g.labels.innerHTML = lb;
    }

    applyLayers() {
      this.svg.querySelectorAll('.nm-rt, .nm-hit').forEach(el => el.classList.toggle('is-off', !this.layers[el.dataset.type]));
      this.renderStations();
      this.buildBuses();
      this.applyFocus();
    }

    setLayers(next) {
      Object.assign(this.layers, next);
      this.applyLayers();
    }

    /* ---------- 進場：路線依序畫出 → 站點彈出 → 巴士出發 ---------- */
    intro(animate) {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      const svg = this.svg;
      svg.classList.remove('is-drawn', 'is-live');
      const paths = [...svg.querySelectorAll('.nm-rt')];
      if (!animate) {
        paths.forEach(g => g.querySelectorAll('path').forEach(p => { p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }));
        svg.classList.add('is-drawn', 'is-live');
        this.startBuses();
        return;
      }
      svg.classList.add('is-drawing');
      let trunkI = 0, branchI = 0;
      paths.forEach(g => {
        const type = g.dataset.type;
        const delay = type === 'trunk' ? 150 + trunkI++ * 220 : type === 'branch' ? 1100 + branchI++ * 110 : 1900;
        const dur = type === 'trunk' ? 1500 : 900;
        // 虛線（接駁、夜間）不能用 dashoffset 描線，改淡入
        if (type === 'feeder' || type === 'night') return;
        g.querySelectorAll('path').forEach(p => {
          const L = p.getTotalLength();
          p.style.transition = 'none';
          p.style.strokeDasharray = `${L} ${L}`;
          p.style.strokeDashoffset = L;
          p.getBoundingClientRect();
          p.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(.45,0,.2,1) ${delay}ms`;
          p.style.strokeDashoffset = 0;
        });
      });
      const t1 = 1700, t2 = 2900;
      this.timers.push(setTimeout(() => svg.classList.add('is-drawn'), t1));
      this.timers.push(setTimeout(() => {
        // 描線結束後拿掉 inline dash，之後縮放、重繪都不受影響
        paths.forEach(g => g.querySelectorAll('path').forEach(p => { p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }));
        svg.classList.remove('is-drawing');
        svg.classList.add('is-live');
        this.startBuses();
      }, t2));
    }

    replay() {
      this.stopBuses();
      this.intro(!App.reducedMotion);
    }

    /* ---------- 巴士：沿路徑移動（getPointAtLength） ---------- */
    buildBuses() {
      const list = [];
      let html = '';
      // buses:false 的圖（疊圖、覆蓋率圖）完全不建巴士；否則 is-live 時會顯示停在原位的車
      if (this.o.buses) App.routesOf().forEach(r => {
        if (!this.layers[r.type] || r.type === 'night') return;
        const path = this.svg.querySelector(`.nm-rt[data-route="${r.id}"] .nm-line`);
        const L = path.getTotalLength();
        const n = r.type === 'trunk' ? (r.loop ? 4 : 3) : 1;
        // 模擬時間 1 分鐘＝真實 1 秒
        const speed = r.lengthPx / r.minutes;
        for (let k = 0; k < n; k++) {
          const cycle = r.loop ? L : L * 2;
          list.push({ r, path, L, speed, offset: cycle * (k / n) + (r.id.charCodeAt(1) * 37) % cycle, el: null });
          html += `<g class="nm-bus" data-route="${r.id}"><rect x="-10" y="-5.5" width="20" height="11" rx="5.5" fill="${INK}" stroke="${PAPER}" stroke-width="2.2"/><circle cx="5" r="1.8" fill="${PAPER}"/></g>`;
        }
      });
      this.g.buses.innerHTML = html;
      [...this.g.buses.children].forEach((el, i) => { list[i].el = el; });
      this.buses = list;
      this.placeBuses(this.simT || 0);
      if (this.svg.classList.contains('is-live')) this.startBuses();
    }

    placeBuses(t) {
      this.buses.forEach(b => {
        const cycle = b.r.loop ? b.L : b.L * 2;
        let d = (b.offset + t * b.speed) % cycle;
        if (!b.r.loop && d > b.L) d = cycle - d;              // 端點折返
        const p = b.path.getPointAtLength(d);
        const q = b.path.getPointAtLength(Math.min(b.L, d + 1));
        const a = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
        b.el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${a.toFixed(1)})`);
      });
    }

    startBuses() {
      this.stopBuses();
      if (!this.o.buses) return;
      // 模擬時鐘獨立累加：切換圖層重建巴士時不會跳回起點
      this.simT = this.simT || 0;
      this.placeBuses(this.simT);
      this.stopAnim = App.animate(this.svg, (t, dt) => { this.simT += dt; this.placeBuses(this.simT); });
    }

    stopBuses() {
      if (this.stopAnim) this.stopAnim();
      this.stopAnim = null;
    }

    /* ---------- 互動：hover 單線、站點提示 ---------- */
    bind() {
      const svg = this.svg;
      svg.addEventListener('pointerover', e => {
        const hit = e.target.closest('.nm-hit');
        const st = e.target.closest('.nm-st');
        if (hit) {
          this.hover = hit.dataset.route;
          this.applyFocus();
          const r = R[this.hover];
          App.tip.show(`${App.pillHTML(r.id, { title: false })}<strong>${App.esc(r.name)}</strong><span>尖峰 ${r.headway.peak} 分・離峰 ${r.headway.off} 分　點擊看詳情</span>`, e.clientX, e.clientY);
          svg.dispatchEvent(new CustomEvent('routehover', { detail: { id: this.hover } }));
        } else if (st) {
          const s = S[st.dataset.st];
          const pills = s.routes.map(id => App.pillHTML(id, { size: 'sm', title: false })).join('');
          App.tip.show(`<strong>${App.esc(s.name)}</strong><span>${s.district}${s.transfer ? '・轉乘站' : ''}</span><span class="tip__pills">${pills}</span>`, e.clientX, e.clientY);
        }
      });
      svg.addEventListener('pointermove', e => {
        if (e.target.closest('.nm-hit, .nm-st')) App.tip.move(e.clientX, e.clientY);
      });
      svg.addEventListener('pointerout', e => {
        const hit = e.target.closest('.nm-hit');
        if (hit && !hit.contains(e.relatedTarget)) {
          this.hover = null;
          this.applyFocus();
          svg.dispatchEvent(new CustomEvent('routehover', { detail: { id: null } }));
        }
        if (e.target.closest('.nm-hit, .nm-st')) App.tip.hide();
      });
      svg.addEventListener('click', e => {
        const hit = e.target.closest('.nm-hit');
        const st = e.target.closest('.nm-st');
        if (st && this.o.onStation) this.o.onStation(st.dataset.st);
        else if (hit && this.o.link) location.href = App.routeURL(hit.dataset.route);
      });
    }

    focusSet() {
      if (this.journey) return new Set(this.journey.legs.map(l => l.route));
      const f = this.hover || this.locked;
      if (f) return new Set([f]);
      if (this.stationFocus) return new Set(this.visibleRoutes(S[this.stationFocus]));
      return null;
    }

    applyFocus() {
      const set = this.focusSet();
      const svg = this.svg;
      svg.classList.toggle('has-focus', !!set);
      const onRoute = new Set();
      if (set) set.forEach(id => (R[id] || O[id]).stops.forEach(s => onRoute.add(s)));
      svg.querySelectorAll('.nm-rt, .nm-bus').forEach(el => el.classList.toggle('is-focus', !!set && set.has(el.dataset.route)));
      svg.querySelectorAll('.nm-st, .nm-lb').forEach(el => el.classList.toggle('is-focus', onRoute.has(el.dataset.st)));
    }

    focusRoute(id) {
      this.locked = id || null;
      this.applyFocus();
    }

    focusStation(id) {
      this.stationFocus = id || null;
      this.g.overlay.querySelectorAll('.nm-here').forEach(el => el.remove());
      if (id) {
        const s = S[id];
        this.g.overlay.insertAdjacentHTML('beforeend',
          `<g class="nm-here" transform="translate(${s.x} ${s.y})"><circle class="nm-here__ring" r="20" fill="none" stroke="${INK}" stroke-width="2"/><circle r="7" fill="${INK}" stroke="${PAPER}" stroke-width="2.5"/></g>`);
      }
      this.applyFocus();
    }

    showOld(ids) {
      this.g.old.innerHTML = (ids || []).map(id => {
        const o = O[id];
        const pts = (o.loop ? [...o.points, o.points[0]] : o.points).map(p => p.join(',')).join(' ');
        return `<polyline class="nm-oldrt" data-old="${id}" points="${pts}" fill="none" stroke="${OLD_GRAY}" stroke-width="3.5" stroke-dasharray="7 6" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('');
      this.svg.classList.toggle('has-old', !!(ids && ids.length));
    }

    showJourney(plan) {
      this.journey = plan || null;
      this.g.overlay.querySelectorAll('.nm-journey').forEach(el => el.remove());
      this.svg.classList.toggle('has-journey', !!plan);
      if (plan) {
        let html = '<g class="nm-journey">';
        plan.legs.forEach(l => {
          const pts = legPoints(l.route, l.stops, plan.network);
          const isOld = plan.network === 'old';
          const d = isOld ? 'M' + pts.map(p => p.join(' ')).join(' L') : roundedPath(pts, false);
          html += `<path d="${d}" fill="none" stroke="${INK}" stroke-opacity="0.14" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>`;
          html += `<path class="nm-journey__leg" d="${d}" fill="none" stroke="${isOld ? '#6B6B66' : R[l.route].colorHex}" stroke-width="${isOld ? 5 : 9}"${isOld ? ' stroke-dasharray="8 6"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`;
        });
        const ends = [plan.from, ...plan.legs.slice(1).map(l => l.stops[0]), plan.to];
        ends.forEach((sid, i) => {
          const s = S[sid];
          const tip = i === 0 ? '起' : i === ends.length - 1 ? '訖' : '轉';
          html += `<g transform="translate(${s.x} ${s.y})"><circle r="12" fill="${INK}" stroke="${PAPER}" stroke-width="3"/><text y="4.5" font-size="12" font-weight="700" fill="${PAPER}" text-anchor="middle">${tip}</text></g>`;
        });
        this.g.overlay.insertAdjacentHTML('beforeend', html + '</g>');
      }
      this.applyFocus();
    }

    /* ---------- 縮放：viewBox 補間，長寬比固定為原圖，且不超出原範圍 ---------- */
    fitBox([x, y, w, h]) {
      const [bx, by, bw, bh] = this.o.viewBox;
      const ar = bw / bh;
      const cx = x + w / 2, cy = y + h / 2;
      if (w / h > ar) h = w / ar; else w = h * ar;
      w = Math.min(w, bw);
      h = Math.min(h, bh);
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      return [clamp(cx - w / 2, bx, bx + bw - w), clamp(cy - h / 2, by, by + bh - h), w, h];
    }

    setViewBox(v) {
      this.vb = v;
      this.svg.setAttribute('viewBox', v.map(n => n.toFixed(1)).join(' '));
    }

    zoomTo(box, animate = true) {
      const target = box ? this.fitBox(box) : this.o.viewBox.slice();
      const from = this.vb || this.o.viewBox.slice();
      cancelAnimationFrame(this.zoomRaf);
      if (!animate || App.reducedMotion) { this.setViewBox(target); return; }
      const t0 = performance.now(), dur = 700;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur);
        const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        this.setViewBox(from.map((v, i) => v + (target[i] - v) * e));
        if (k < 1) this.zoomRaf = requestAnimationFrame(step);
      };
      this.zoomRaf = requestAnimationFrame(step);
    }

    // 縮放到一組路線／站點（id 混用）的範圍；minW 避免單站時放太大
    fit(ids, pad = 60, minW = 480) {
      const pts = [];
      ids.forEach(id => {
        if (R[id]) pts.push(...R[id].points);
        else if (O[id]) pts.push(...O[id].points);
        else if (S[id]) pts.push([S[id].x, S[id].y]);
      });
      if (!pts.length) { this.zoomTo(null); return; }
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
      const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
      this.zoomTo([x0, y0, x1 - x0, y1 - y0]);
    }

    destroy() {
      cancelAnimationFrame(this.zoomRaf);
      this.stopBuses();
      this.timers.forEach(clearTimeout);
      this.svg.innerHTML = '';
    }
  }

  App.map = { create: (svg, opts) => new NetworkMap(svg, opts) };

  /* ==========================================================================
     UI 元件
     ========================================================================== */

  /* ---------- 可見性閘門的動畫迴圈 ---------- */
  App.animate = (el, fn) => {
    let raf = 0, visible = false, stopped = false, last = null, t = 0;
    const can = () => !stopped && visible && !document.hidden && !App.reducedMotion;
    const frame = now => {
      raf = 0;
      if (!can()) return;
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);   // 分頁切回來時不要一次跳一大段
      last = now;
      t += dt;
      fn(t, dt);
      raf = requestAnimationFrame(frame);
    };
    const wake = () => { if (can() && !raf) { last = null; raf = requestAnimationFrame(frame); } };
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); });
    io.observe(el);
    document.addEventListener('visibilitychange', wake);
    motionQuery.addEventListener('change', wake);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', wake);
      motionQuery.removeEventListener('change', wake);
    };
  };

  App.headerOffset = () => {
    const h = $('.site-header');
    return (h ? h.getBoundingClientRect().height : 0) + 16;
  };
  App.scrollTo = el => {
    const top = el.getBoundingClientRect().top + window.scrollY - App.headerOffset();
    window.scrollTo({ top, behavior: App.reducedMotion ? 'auto' : 'smooth' });
  };

  /* ---------- 浮動提示 ---------- */
  App.tip = (() => {
    let el = null;
    const ensure = () => {
      if (!el) { el = document.createElement('div'); el.className = 'tip'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); }
      return el;
    };
    const move = (x, y) => {
      if (!el || !el.classList.contains('is-on')) return;
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      let left = x + 16, top = y + 18;
      if (left + r.width > vw - 8) left = x - r.width - 16;
      if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
      el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
    };
    return {
      show(html, x, y) { const t = ensure(); t.innerHTML = html; t.classList.add('is-on'); move(x, y); },
      move,
      hide() { if (el) el.classList.remove('is-on'); },
    };
  })();

  /* ---------- Toast（modal 開啟時移進 dialog，才不會被 top layer 蓋住） ---------- */
  let toastBox = null;
  App.toast = (msg, opts = {}) => {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('aria-live', 'polite');
      toastBox.setAttribute('aria-atomic', 'false');
    }
    const host = $$('dialog[open]').pop() || document.body;
    if (toastBox.parentElement !== host) host.appendChild(toastBox);
    const tone = opts.tone || 'info';
    const t = document.createElement('div');
    t.className = `toast toast--${tone}`;
    t.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    t.innerHTML = `<span class="toast__dot" aria-hidden="true"></span><div class="toast__body">${opts.title ? `<strong class="toast__title">${App.esc(opts.title)}</strong>` : ''}<span>${App.esc(msg)}</span></div><button class="toast__close" type="button" aria-label="關閉通知"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
    toastBox.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    const close = () => {
      t.classList.remove('is-in');
      t.classList.add('is-out');
      setTimeout(() => t.remove(), App.reducedMotion ? 0 : 260);
    };
    t.querySelector('.toast__close').addEventListener('click', close);
    setTimeout(close, opts.timeout || 3600);
    return close;
  };
  // dialog 關閉（含 Esc）時把 toast 容器移回 body
  document.addEventListener('close', e => {
    if (toastBox && e.target.contains(toastBox)) document.body.appendChild(toastBox);
  }, true);

  /* ---------- Modal ---------- */
  App.modal = {
    open(target) {
      const dlg = typeof target === 'string' ? document.getElementById(target) : target;
      if (!dlg || dlg.open) return dlg;
      dlg._opener = document.activeElement;
      dlg.showModal();
      if (toastBox && toastBox.parentElement === document.body && toastBox.children.length) dlg.appendChild(toastBox);
      return dlg;
    },
    close(target) {
      const dlg = target ? (typeof target === 'string' ? document.getElementById(target) : target) : $$('dialog[open]').pop();
      if (!dlg || !dlg.open) return;
      dlg.close();
      if (dlg._opener && dlg._opener.focus) dlg._opener.focus();
    },
  };
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { App.modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { App.modal.close(closer.closest('dialog')); return; }
    // 點 dialog 本身（背景區）關閉
    if (e.target.tagName === 'DIALOG' && e.target.classList.contains('modal')) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside || e.clientX === 0) App.modal.close(e.target);
    }
    const toaster = e.target.closest('[data-toast]');
    if (toaster) App.toast(toaster.dataset.toast, { tone: toaster.dataset.toastTone || 'info' });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { App.tip.hide(); }
  });

  /* ---------- Tabs ---------- */
  App.tabs = root => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const list = root.querySelector('[role="tablist"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      root.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: document.getElementById(tab.getAttribute('aria-controls')), index: tabs.indexOf(tab) } }));
    };
    tabs.forEach(t => t.addEventListener('click', () => select(t)));
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
    select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  };

  /* ---------- Chips（單選／複選按鈕群組） ---------- */
  App.chips = root => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const multi = root.dataset.chips === 'multi';
    const btns = () => [...root.querySelectorAll('button[aria-pressed]')];
    root.addEventListener('click', e => {
      const b = e.target.closest('button[aria-pressed]');
      if (!b || !root.contains(b)) return;
      if (multi) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
      else btns().forEach(x => x.setAttribute('aria-pressed', x === b));
      const values = btns().filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.value);
      root.dispatchEvent(new CustomEvent('chipchange', { detail: { values, value: values[0] ?? null, button: b } }));
    });
  };

  /* ---------- 站名自動完成 combobox ---------- */
  let comboSeq = 0;
  App.combobox = (input, opts = {}) => {
    // 重複呼叫回傳同一個控制器（App.scan 已自動初始化 [data-station-input]）
    if (input._combo) return input._combo;
    const wrap = input.closest('.combo');
    const id = 'combo-' + (++comboSeq);
    const list = document.createElement('ul');
    list.className = 'combo__list';
    list.id = id;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', id);
    input.setAttribute('autocomplete', 'off');
    let items = [], active = -1;
    const mark = (name, q) => {
      const i = name.indexOf(q);
      return i < 0 ? App.esc(name) : App.esc(name.slice(0, i)) + '<mark>' + App.esc(q) + '</mark>' + App.esc(name.slice(i + q.length));
    };
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const setActive = i => {
      active = i;
      [...list.children].forEach((li, k) => li.setAttribute('aria-selected', k === i));
      if (i >= 0) { input.setAttribute('aria-activedescendant', `${id}-${i}`); list.children[i].scrollIntoView({ block: 'nearest' }); }
    };
    const render = () => {
      const q = input.value.trim();
      items = App.findStations(q).slice(0, 8);
      if (!q) { close(); return; }
      list.innerHTML = items.length
        ? items.map((s, i) => `<li id="${id}-${i}" class="combo__opt" role="option" aria-selected="false" data-id="${s.id}">
            <span class="combo__name">${mark(s.name, q)}</span><span class="combo__meta">${s.district}</span>
            <span class="combo__pills">${s.routes.map(r => App.pillHTML(r, { size: 'sm', title: false })).join('')}</span></li>`).join('')
        : `<li class="combo__empty" role="presentation">找不到「${App.esc(q)}」，試試行政區名稱，例如「新灣」</li>`;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      setActive(items.length ? 0 : -1);
    };
    const pick = s => {
      input.value = s.name;
      input.dataset.station = s.id;
      close();
      input.dispatchEvent(new CustomEvent('stationselect', { bubbles: true, detail: { station: s } }));
      if (opts.onSelect) opts.onSelect(s);
    };
    input.addEventListener('input', () => { delete input.dataset.station; render(); });
    input.addEventListener('focus', () => { if (input.value.trim() && !input.dataset.station) render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) render(); else setActive(Math.min(items.length - 1, active + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
      else if (e.key === 'Enter') {
        if (!list.hidden && items[active]) { e.preventDefault(); pick(items[active]); }
      } else if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    list.addEventListener('mousedown', e => e.preventDefault());   // 點選項時不要先觸發 blur 把清單關掉
    list.addEventListener('click', e => {
      const li = e.target.closest('.combo__opt');
      if (li) pick(S[li.dataset.id]);
    });
    input._combo = { pick: sid => pick(S[sid]), close };
    return input._combo;
  };

  /* ---------- 表單欄位錯誤 ---------- */
  App.field = {
    setError(input, msg) {
      const field = input.closest('.field');
      if (!field) return;
      field.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      let err = field.querySelector('.field__error');
      if (!err) {
        err = document.createElement('p');
        err.className = 'field__error';
        err.id = (input.id || input.name || 'f' + Math.random().toString(36).slice(2)) + '-err';
        field.appendChild(err);
      }
      err.textContent = msg;
      const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      ids.add(err.id);
      input.setAttribute('aria-describedby', [...ids].join(' '));
    },
    clear(root) {
      const fields = root.classList && root.classList.contains('field') ? [root]
        : root.closest && root.closest('.field') && !root.querySelectorAll('.field').length ? [root.closest('.field')]
        : [...root.querySelectorAll('.field')];
      fields.forEach(f => {
        f.classList.remove('is-invalid');
        f.querySelectorAll('[aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
        const err = f.querySelector('.field__error');
        if (err) err.textContent = '';
      });
    },
  };

  /* ---------- 數字遞增 ---------- */
  App.count = (el, value) => {
    if (value !== undefined) el.dataset.count = value;
    cancelAnimationFrame(el._countRaf);
    const dec = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || '';
    const fmt = v => App.fmt.num(v, dec) + suffix;
    // 每一格都重新讀 data-count：連續呼叫時以最新目標為準
    const target = () => Number(el.dataset.count);
    if (App.reducedMotion) { el.textContent = fmt(target()); return; }
    const from = Number(el.dataset.shown || 0);
    const t0 = performance.now(), dur = 1100;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = from + (target() - from) * e;
      el.dataset.shown = v;
      el.textContent = fmt(v);
      if (k < 1) el._countRaf = requestAnimationFrame(step);
      else { el.dataset.shown = target(); el.textContent = fmt(target()); }
    };
    el._countRaf = requestAnimationFrame(step);
  };

  /* ---------- 進場、計數、暫停：IntersectionObserver ---------- */
  const revealIO = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('is-in');
    revealIO.unobserve(en.target);
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  const countIO = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    App.count(en.target);
    countIO.unobserve(en.target);
  }), { threshold: 0.3 });

  const pauseIO = new IntersectionObserver(entries => entries.forEach(en => {
    en.target.classList.toggle('is-offscreen', !en.isIntersecting);
  }));

  // 保底：已經捲過去（在視窗上方）的元素直接顯示，不必等觀察器
  const revealPassed = () => $$('[data-reveal]:not(.is-in)').forEach(el => {
    if (el.getBoundingClientRect().top < window.innerHeight) { el.classList.add('is-in'); revealIO.unobserve(el); }
  });

  App.scan = (root = document) => {
    $$('[data-tabs]', root).forEach(App.tabs);
    $$('[data-chips]', root).forEach(App.chips);
    $$('[data-station-input]', root).forEach(i => App.combobox(i));
    $$('[data-reveal]:not(.is-in)', root).forEach(el => {
      const r = el.getBoundingClientRect();
      if (App.reducedMotion || (r.top < window.innerHeight && r.bottom > 0)) el.classList.add('is-in');
      else revealIO.observe(el);
    });
    $$('[data-count]', root).forEach(el => {
      if (el.dataset.countReady) return;
      el.dataset.countReady = '1';
      el.textContent = App.fmt.num(0, Number(el.dataset.decimals || 0)) + (el.dataset.suffix || '');
      countIO.observe(el);
    });
    $$('[data-countdown]', root).forEach(el => { el.textContent = Math.max(0, App.daysUntil(el.dataset.countdown)); });
    $$('[data-pause-offscreen]', root).forEach(el => pauseIO.observe(el));
  };

  /* ---------- 頁首：捲動狀態、行動選單、目前頁 ---------- */
  function initHeader() {
    const header = $('.site-header');
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.site-nav a[href]', header).forEach(a => {
      const on = a.getAttribute('href').split(/[?#]/)[0].toLowerCase() === here;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    const toggle = $('.nav-toggle', header);
    if (!toggle) return;
    const set = open => {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    };
    toggle.addEventListener('click', () => set(!header.classList.contains('is-open')));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { set(false); toggle.focus(); } });
    $$('.site-nav a', header).forEach(a => a.addEventListener('click', () => set(false)));
    window.matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) set(false); });
  }

  /* ---------- 捲動進度路線：各區塊是一個「站」 ---------- */
  function initRail() {
    const body = document.body;
    if (!body.hasAttribute('data-rail')) return;
    const secs = $$('[data-stop]');
    if (!secs.length) return;
    const color = body.dataset.rail || 'red';
    const rail = document.createElement('nav');
    rail.className = `rail c-${color}`;
    rail.setAttribute('aria-label', '本頁站序');
    rail.innerHTML = `<span class="rail__track" aria-hidden="true"></span><span class="rail__fill" aria-hidden="true"></span>`
      + secs.map((s, i) => `<button class="rail__stop" type="button" data-i="${i}"><span class="rail__label">${App.esc(s.dataset.stop)}</span></button>`).join('')
      + `<span class="rail__bus" aria-hidden="true"></span>`;
    const bar = document.createElement('div');
    bar.className = `rail-bar c-${color}`;
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<span class="rail-bar__fill"></span>';
    body.append(rail, bar);
    const stops = $$('.rail__stop', rail);
    stops.forEach((b, i) => b.addEventListener('click', () => App.scrollTo(secs[i])));
    let pos = [], raf = 0;
    const measure = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      pos = secs.map(s => Math.min(1, Math.max(0, (s.getBoundingClientRect().top + window.scrollY - App.headerOffset()) / max)));
      stops.forEach((b, i) => { b.style.top = (pos[i] * 100) + '%'; });
      update();
    };
    const update = () => {
      raf = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / max));
      rail.style.setProperty('--p', p);
      bar.style.setProperty('--p', p);
      let cur = 0;
      pos.forEach((v, i) => { if (p >= v - 0.002) cur = i; });
      stops.forEach((b, i) => {
        b.classList.toggle('is-passed', p >= pos[i] - 0.002);
        b.classList.toggle('is-current', i === cur);
        if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);
    if (document.fonts) document.fonts.ready.then(measure);
    measure();
  }

  /* ---------- 頁尾：路網異動通知訂閱 ---------- */
  function initSubscribe() {
    $$('form[data-subscribe]').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      App.field.clear(form);
      const v = input.value.trim();
      if (!v) { App.field.setError(input, '請輸入電子郵件'); input.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { App.field.setError(input, '電子郵件格式不正確，例如 name@example.com'); input.focus(); return; }
      form.reset();
      App.toast(`之後路線或班距異動時，我們會寄信到 ${v}。`, { tone: 'ok', title: '已訂閱路網通知' });
    }));
  }

  /* ---------- 啟動 ---------- */
  document.documentElement.classList.add('js');
  const syncHidden = () => document.documentElement.classList.toggle('is-hidden', document.hidden);
  document.addEventListener('visibilitychange', syncHidden);
  syncHidden();
  window.addEventListener('scroll', () => requestAnimationFrame(revealPassed), { passive: true });

  const boot = () => {
    initHeader();
    initRail();
    initSubscribe();
    App.scan(document);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
