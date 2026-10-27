/* ==========================================================================
   澄港舊城 · 老屋再生 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒並已 App.scan(document)。
     用 innerHTML 動態插入含 data-* 元件的內容後，請呼叫 App.scan(容器)（重複呼叫安全）。

   資料（全站單一來源；人名、年份、地址、數字請從這裡取，不要另外手打）
     App.TODAY                 '2026-10-23'（故事裡的今天，週五）
     App.data.site             辦公室名稱、工作站地址、電話、開放時間
     App.data.styles           4 種風格 {minnan 閩式街屋, western 洋樓, wayo 和洋混合, modern 現代主義}
     App.data.statuses         3 種狀態 {restoring 修復中, revived 已活化, pending 待修}
     App.data.houses           32 棟列冊老屋（OT-01…OT-32）；OT-02 林家洋樓 1928 為焦點老屋（house.html）
                               欄位：id name year style status street no origin now owner tiles[] facade{}
                                     map{x,y} progress grant open summary featured
     App.data.tours            10–11 月街區導覽活動（T1024…）
     App.house(id)  App.tour(id)  App.houseURL(h)（焦點 → house.html，其餘 → houses.html#OT-xx）
     App.tileURL(id)           → tiles.html#MJ-xx
     App.countBy(list, key)    → { value: count }

   格式
     App.fmt.num(1862) → "1,862"    App.fmt.money(2860000) → "NT$ 2,860,000"
     App.fmt.md('2026-11-07') → "11.07"   App.fmt.wd(iso) → "六"   App.fmt.long(iso) → "2026 年 11 月 7 日（六）"
     App.esc(str)  HTML 跳脫      App.icon(name, cls)  線條圖示 SVG 字串
       （arrow arrow-left close check search pin clock calendar user users tile house download info
         map filter sort plus minus phone mail hammer leaf alert grid list undo shuffle eye ruler）

   標示 HTML
     App.styleTagHTML(key)     → <span class="style-tag style-tag--western">…</span>
     App.statusHTML(key)       → <span class="status status--restoring">…</span>
     App.houseCardHTML(h, {draw})  → .house-card（名錄、首頁、相關老屋共用）
                               draw:true（預設）時卡片帶 data-draw，插入 DOM 後請 App.scan(容器)，進入視窗才描線
     App.tileCardHTML(t)       → .tile-card（圖鑑、首頁預覽共用；帶 id="MJ-xx"，tiles.html#MJ-xx 錨點直接可用）
                               App.houseCardHTML 同理帶 id="OT-xx"（houses.html#OT-xx）

   花磚引擎（程式生成 SVG，viewBox 0 0 120 120）
     App.tile.svg(opts, {cls, title, standalone})  → SVG 字串
       opts = { fold: 4|8, palette, heart, ring, petal, corner, edge }
     App.tile.palettes / hearts / rings / petals / corners / edges  → [{id, name}] 選項清單（產生器 UI 用）
     App.tile.catalog          24 款圖鑑 {id:'MJ-01', name, cat, opts, house, year, count, note}
     App.tile.cats             4 類 {floral 花卉, geometric 幾何, medallion 圈帶, corner 角花}
     App.tile.get(id)          App.tile.dataURI(opts)（CSS background 四方連續用）
     App.tile.back()           磚背（素燒陶面＋窯印）SVG
     App.tile.download(svgString, filename)   Blob 下載
     宣告式：<span data-tile="MJ-07"></span> 自動填入該款花磚
     .tile__rose 是花磚中央的旋轉群組，設定 CSS 變數 --rot（deg）即可旋轉

   立面引擎（SVG 線稿）
     App.facade.svg(houseOrId, { state:'after'|'before', frame:'fixed'|'tight', lw, cls, draw })
       各構件包在 <g data-part="gable|parapet|tiles|cornice|window|column|arcade|arch|balcony|sign|roof|canopy|grille|fin|plinth">
     App.facade.parts          構件名稱與說明 { key: {name, desc} }
     宣告式：<div data-facade="OT-02" data-state="before" data-draw></div>

   地圖
     App.map.svg()             舊城街廓底圖 SVG（viewBox 0 0 1000 640）
     App.map.mount(el, { houses, active, onSelect, labels })  → { setActive(id), filter(fn), el }
       每個點位是 <button class="map__pin map__pin--{status}" data-id>

   UI
     App.toast(msg, { tone:'ink'|'brick'|'green'|'blue', title, timeout })
       （modal 開著時 toast 容器會搬進該 dialog，才不會被 top layer 蓋住）
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="dialogId"] 開啟、[data-modal-close] 關閉；點背景、Esc 也會關
     App.tabs(tablist)         [data-tabs] 自動初始化；切換時 tablist 觸發 'tabchange'（detail: {tab, panel, index}）
     App.chips(group)          [data-chips="single|multi"] 自動初始化；觸發 'chipchange'（detail: {values, button}）
     App.stepper(el)           [data-stepper] 自動初始化；改值時 input 觸發 'input' 與 'change'
     App.dualRange(el)         [data-dual-range] 雙把手年代區間；觸發 'rangechange'（detail: {min, max}）
     App.compare(el)           [data-compare] 修復前後對照 slider；el.setPos(0–100)
     App.field.setError(input, msg) / App.field.clear(form)
     App.valid.required / phone / email / int(v, min, max)
     form[data-newsletter]     頁尾街區通訊訂閱（驗證＋toast）

   動態（皆會在 prefers-reduced-motion 時停用或直接顯示終態）
     [data-reveal]             進場："" | "up" | "left" | "right" | "tile"；style="--rd:120ms" 錯開
     [data-draw]               線稿描繪：進入視窗時依序描出 .ln 線條、再淡入 .fl 色塊
                               多棟並排可在各棟群組設 style="--lag:240ms"，並在 svg 設 data-draw-lag="最大延遲ms"
     [data-count="32"]         數字遞增（data-decimals、data-suffix 選填）
     App.wall.mount(el, { cols, rows, tiles, order, idle, pointer })  → { shuffle(), flip(i), destroy() }
                               招牌花磚牆：一片片翻轉鋪成整面牆、滑鼠移動時花紋微旋轉、閒置時偶爾翻面
     App.draw(el)              手動觸發線稿描繪
     App.animate(el, fn)       只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(t, dt)，回傳 stop()
     App.reducedMotion         目前是否要求減少動態（getter）
   ========================================================================== */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const r2 = n => Math.round(n * 100) / 100;
  App.clamp = clamp;

  /* 以字串為種子的可重現亂數：同一棟老屋每次畫出來都一樣 */
  function rng(seed) {
    let h = 1779033703 ^ String(seed).length;
    for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  App.rng = rng;

  let uidCounter = 0;
  const uid = prefix => `${prefix}${++uidCounter}`;

  /* ---------- 0. 時間與格式 ---------- */
  App.TODAY = '2026-10-23';
  App.date = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const WD = '日一二三四五六';
  App.fmt = {
    num: n => Number(n).toLocaleString('en-US'),
    money: n => 'NT$ ' + Number(n).toLocaleString('en-US'),
    md: iso => iso.slice(5, 7) + '.' + iso.slice(8, 10),
    wd: iso => WD[App.date(iso).getDay()],
    long: iso => { const d = App.date(iso); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（${WD[d.getDay()]}）`; },
  };
  App.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.countBy = (list, key) => list.reduce((acc, it) => { acc[it[key]] = (acc[it[key]] || 0) + 1; return acc; }, {});

  /* ---------- 1. 資料 ---------- */
  App.data = {};
  App.data.site = {
    name: '澄港舊城 · 老屋再生',
    office: '澄港市政府文化局 舊城街區再生辦公室',
    station: '舊城再生工作站（合益商行）',
    address: '澄港市舊城區會館街 18 號',
    phone: '(07) 521-1928',
    email: 'oldtown@chenggang.example',
    hours: '週二至週日 09:30–17:30（週一休）',
  };

  App.data.styles = {
    minnan: { name: '閩式街屋', en: 'Minnan Shophouse', era: '1890–1925', desc: '紅磚砌築、亭仔腳連續，山牆刻商號，女兒牆嵌花磚。' },
    western: { name: '洋樓', en: 'Western Revival', era: '1910–1940', desc: '拱圈、洗石子柱與巴洛克山頭，二樓以上常見寶瓶欄杆。' },
    wayo: { name: '和洋混合', en: 'Wayo Hybrid', era: '1920–1945', desc: '日式屋瓦與雨淋板，搭配西式拱窗與簡化線腳。' },
    modern: { name: '現代主義', en: 'Postwar Modern', era: '1950–1970', desc: '平屋頂、水平遮陽板、洗石子牆與花格磚，直立招牌是時代記號。' },
  };
  App.data.statuses = {
    restoring: { name: '修復中', en: 'Restoring' },
    revived: { name: '已活化', en: 'Revived' },
    pending: { name: '待修', en: 'Awaiting' },
  };

  // [id, name, year, style, status, street, no, origin, now, owner, tiles, facade, map, extra]
  const H = (id, name, year, style, status, street, no, origin, now, owner, tiles, facade, map, summary, extra = {}) =>
    Object.assign({ id, name, year, style, status, district: '舊城區', street, no, address: `澄港市舊城區${street} ${no}`,
      origin, now, owner, tiles, facade, map, summary }, extra);

  App.data.houses = [
    H('OT-01', '陳記布行', 1912, 'minnan', 'revived', '布埕街', '23 號', '布行', '舊城布藝工坊與展示間', '陳家（第三代 陳宥廷）',
      ['MJ-05', 'MJ-12'], { floors: 2, bays: 3, w: 196, plaque: '陳', sign: '陳記布行' }, { x: 336, y: 503 },
      '布行三代經營的紅磚街屋，2024 年修復後成為布藝工坊，二樓窗楣保留 120 片胭脂心形花磚。',
      { grant: 1980000, open: '週三至週日 10:00–18:00', opened: '2024-05' }),
    H('OT-02', '林家洋樓', 1928, 'western', 'restoring', '會館街', '41 號', '振昌號米穀商行', '修復中，預計 2027 年夏季以「舊城生活史館」開放', '林素琴（林家第四代）',
      ['MJ-01', 'MJ-07', 'MJ-14'], { floors: 3, bays: 5, w: 236, plaque: '振昌', brick: true }, { x: 420, y: 156 },
      '三層紅磚洋樓，山頭嵌「振昌」二字，立面與女兒牆共 286 片花磚，是舊城花磚數量最多的單棟建築。',
      { featured: true, progress: 62, grant: 2860000, open: '每月最後一個週日 14:00 修復現場開放日（需報名）', tileCount: 286 }),
    H('OT-03', '黃氏古厝街屋', 1896, 'minnan', 'pending', '米市街', '8 號', '米舖', '閒置，屋主規劃申請 2027 年度補助', '黃家（共有人 7 位）',
      ['MJ-09'], { floors: 2, bays: 3, w: 182, plaque: '黃' }, { x: 120, y: 316 },
      '舊城現存最早的街屋之一，屋頂局部塌陷，正由辦公室協助七位共有人整合修復意願。', { open: '暫不開放' }),
    H('OT-04', '永泰醫院', 1931, 'western', 'revived', '會館街', '66 號', '私人診所', '社區健康據點與醫療史展間', '蘇家（蘇明哲醫師後代）',
      ['MJ-02', 'MJ-13'], { floors: 2, bays: 3, w: 214, plaque: '永泰', brick: false }, { x: 690, y: 148 },
      '洗石子立面的兩層洋樓，候診室的孔雀綠花磚地坪完整保存，現為長者健康據點。',
      { grant: 2400000, open: '週二至週六 09:00–17:00', opened: '2023-11' }),
    H('OT-05', '吳家和洋宅', 1936, 'wayo', 'restoring', '糖行街', '15 號', '糖商住宅', '修復中，未來作為家族文物展示與民宿', '吳承翰',
      ['MJ-17'], { floors: 2, bays: 3, w: 200, sign: '' }, { x: 280, y: 262 },
      '日式屋瓦搭配西式拱窗，屋架以檜木構成，目前進行屋瓦重鋪與白蟻防治。', { progress: 38, grant: 1650000, open: '修復期間暫不開放' }),
    H('OT-06', '大順五金行', 1962, 'modern', 'revived', '茶棧街', '3 號', '五金行', '社區修繕工具圖書館', '鄭家（鄭玉蘭）',
      [], { floors: 3, bays: 3, w: 190, sign: '大順五金' }, { x: 750, y: 92 },
      '直立招牌與水平遮陽板俱全的戰後店屋，現在借出 600 多件修繕工具給街坊。',
      { grant: 920000, open: '週四至週日 12:00–19:00', opened: '2025-03' }),
    H('OT-07', '春和茶棧', 1908, 'minnan', 'revived', '茶棧街', '28 號', '茶葉批發棧', '茶業史料館與茶席空間', '春和茶業（第四代 李品妤）',
      ['MJ-08', 'MJ-20'], { floors: 2, bays: 3, w: 204, plaque: '春和', sign: '春和茶棧' }, { x: 744, y: 412 },
      '百年茶棧保留焙茶間與木造閣樓，女兒牆的孔雀綠方勝花磚是修復時一片片清洗回貼。',
      { grant: 2150000, open: '週三至週一 10:00–17:00', opened: '2022-09' }),
    H('OT-08', '鄭家洋樓', 1926, 'western', 'pending', '米市街', '52 號', '布商住宅', '閒置，一樓出租為機車行', '鄭國棟',
      ['MJ-03'], { floors: 2, bays: 3, w: 206, plaque: '鄭', brick: true }, { x: 640, y: 372 },
      '山頭與欄杆大致完整，但正立面被鐵皮雨遮與招牌包覆，花磚有三成剝落。', { open: '暫不開放' }),
    H('OT-09', '南興碾米所', 1924, 'wayo', 'pending', '舊碼頭路', '7 號', '碾米廠', '閒置倉庫', '南興實業（林姓股東 4 位）',
      [], { floors: 2, bays: 3, w: 222 }, { x: 380, y: 538 },
      '碼頭邊的碾米廠，木構屋架與穀倉漏斗仍在，辦公室正協助評估結構補強。', { open: '暫不開放' }),
    H('OT-10', '舊城郵便局宿舍', 1934, 'wayo', 'revived', '竹仔巷', '4 號', '郵局員工宿舍', '青年駐村工作室', '澄港市政府（市有）',
      ['MJ-19'], { floors: 2, bays: 3, w: 184 }, { x: 150, y: 120 },
      '市有宿舍修復後提供六間駐村工作室，迴廊與緣側保留原貌。',
      { grant: 3000000, open: '每月第二個週六開放工作室', opened: '2024-10' }),
    H('OT-11', '金源銀樓', 1955, 'modern', 'restoring', '米市街', '31 號', '銀樓', '修復中，規劃為金工工藝教室', '張家（張美惠）',
      [], { floors: 3, bays: 3, w: 186, sign: '金源銀樓' }, { x: 380, y: 322 },
      '磨石子騎樓與直立招牌是戰後銀樓的典型，正在修復二樓水平遮陽板的鋼筋鏽蝕。', { progress: 54, grant: 1280000, open: '修復期間暫不開放' }),
    H('OT-12', '許氏街屋', 1902, 'minnan', 'restoring', '布埕街', '11 號', '雜貨舖', '修復中，屋主自住並保留一樓店面', '許文彥',
      ['MJ-16'], { floors: 2, bays: 3, w: 178, plaque: '許' }, { x: 150, y: 452 },
      '屋主許文彥本身是花磚修復師，正親手復原山牆上 64 片芥黃花磚。', { progress: 71, grant: 1460000, open: '每月第一個週六 10:00 開放工作現場' }),
    H('OT-13', '蔡家三連棟', 1918, 'minnan', 'revived', '打鐵巷', '2 號', '打鐵舖', '鐵件工藝教室與共同工作室', '蔡家（蔡俊男）',
      ['MJ-09', 'MJ-15'], { floors: 2, bays: 3, w: 224, plaque: '蔡', sign: '蔡記鐵工' }, { x: 540, y: 118 },
      '三間相連的打鐵舖，修復時保留燻黑的屋架，現在開設鐵件與門窗五金課程。',
      { grant: 2280000, open: '週二至週六 13:00–20:00', opened: '2023-06' }),
    H('OT-14', '合益商行', 1921, 'western', 'revived', '會館街', '18 號', '南北貨商行', '舊城再生工作站（辦公室與諮詢窗口）', '澄港市政府（價購）',
      ['MJ-10', 'MJ-22'], { floors: 2, bays: 3, w: 210, plaque: '合益', brick: true }, { x: 330, y: 206 },
      '市府價購修復的紅磚洋樓，現為舊城再生工作站：屋主諮詢、補助收件與導覽集合點都在這裡。',
      { grant: 0, open: '週二至週日 09:30–17:30', opened: '2021-08' }),
    H('OT-15', '光華戲院', 1958, 'modern', 'pending', '茶棧街', '50 號', '戲院', '閒置，產權移轉協商中', '光華興業（清算中）',
      [], { floors: 3, bays: 3, w: 238, sign: '光華戲院' }, { x: 806, y: 504 },
      '舊城唯一留存的戰後戲院，弧形雨庇與售票亭還在，是街區最受期待的活化對象。', { open: '暫不開放' }),
    H('OT-16', '何家洋樓', 1930, 'western', 'restoring', '糖行街', '40 號', '糖行', '修復中，規劃為糖業記憶館', '何家（何志遠）',
      ['MJ-06', 'MJ-21'], { floors: 2, bays: 3, w: 200, plaque: '何', brick: false }, { x: 232, y: 410 },
      '二樓陽台的寶瓶欄杆缺了 11 支，修復團隊依殘件翻模補齊。', { progress: 47, grant: 2050000, open: '修復期間暫不開放' }),
    H('OT-17', '益生藥房', 1915, 'minnan', 'pending', '會館街', '77 號', '中藥房', '一樓仍營業，二樓閒置', '周家（周益生後代）',
      ['MJ-24'], { floors: 2, bays: 3, w: 180, plaque: '益生', sign: '益生藥房' }, { x: 862, y: 188 },
      '仍在營業的老藥房，藥櫃與秤具完整；二樓山牆滲水，屋主正準備申請補助。', { open: '一樓營業時間可入內（週一至週六 08:00–19:00）' }),
    H('OT-18', '澄港商工會館', 1938, 'wayo', 'restoring', '會館街', '1 號', '商工會館', '修復中，未來為街區會議與展演空間', '澄港市政府（市有）',
      ['MJ-11'], { floors: 2, bays: 5, w: 240 }, { x: 92, y: 168 },
      '會館街名稱的由來，大屋頂與入口門廊正在進行木構件修補。', { progress: 29, grant: 3000000, open: '每季一次修復現場開放日' }),
    H('OT-19', '振發鐵工廠', 1966, 'modern', 'revived', '打鐵巷', '20 號', '鐵工廠', '街區共享廚房與市集', '振發鐵工（第二代 王振發）',
      [], { floors: 2, bays: 3, w: 226, sign: '振發鐵工' }, { x: 496, y: 432 },
      '鋸齒屋頂的老鐵工廠，週末是舊城最熱鬧的共享廚房與小農市集。',
      { grant: 1150000, open: '週五至週日 10:00–20:00', opened: '2025-08' }),
    H('OT-20', '王家街屋', 1899, 'minnan', 'pending', '竹仔巷', '13 號', '住家兼裁縫舖', '閒置', '王家（王秀鳳）',
      ['MJ-12'], { floors: 2, bays: 3, w: 172, plaque: '王' }, { x: 198, y: 172 },
      '竹仔巷底的窄面街屋，門楣仍留有裁縫舖的木招牌，二樓樓板需要更換。', { open: '暫不開放' }),
    H('OT-21', '協成米行', 1923, 'western', 'pending', '米市街', '70 號', '米行', '一樓為雜貨店，二樓閒置', '協成（侯家）',
      ['MJ-04'], { floors: 2, bays: 3, w: 198, plaque: '協成', brick: true }, { x: 880, y: 320 },
      '米市街東端的紅磚洋樓，芥黃日輪菊花磚只剩山頭 18 片。', { open: '暫不開放' }),
    H('OT-22', '廖氏洋樓', 1933, 'western', 'revived', '布埕街', '45 號', '布商住宅', '舊城旅人書房（獨立書店與閱覽室）', '廖家（廖心怡）',
      ['MJ-03', 'MJ-18'], { floors: 3, bays: 3, w: 208, plaque: '廖', brick: false }, { x: 680, y: 498 },
      '三樓洋樓的磚紅重瓣玫瑰花磚是舊城最常被拍的立面，一樓改為書店與閱覽室。',
      { grant: 2600000, open: '週二至週日 11:00–20:00', opened: '2024-12' }),
    H('OT-23', '舊城公會堂', 1940, 'wayo', 'revived', '米市街', '40 號', '公會堂', '街區活動中心與展演廳', '澄港市政府（市有）',
      ['MJ-13'], { floors: 2, bays: 5, w: 244 }, { x: 640, y: 300 },
      '面對公會堂前廣場的大型和洋建築，現在是說明會、展覽與市民講座的場地。',
      { grant: 3000000, open: '依活動開放；常設展週二至週日 10:00–17:00', opened: '2022-03' }),
    H('OT-24', '太平旅社', 1952, 'modern', 'restoring', '舊碼頭路', '19 號', '旅社', '修復中，規劃為碼頭文化青年旅館', '太平旅社（第二代 陳麗珠）',
      [], { floors: 3, bays: 3, w: 196, sign: '太平旅社' }, { x: 600, y: 542 },
      '碼頭工人與船員過去的落腳處，房間門牌與磨石子樓梯都會保留。', { progress: 18, grant: 1720000, open: '修復期間暫不開放' }),
    H('OT-25', '錦成布莊', 1910, 'minnan', 'restoring', '布埕街', '30 號', '布莊', '修復中，規劃為紡織職人工作室', '錦成（第三代 林志豪）',
      ['MJ-24'], { floors: 2, bays: 3, w: 190, plaque: '錦成', sign: '錦成布莊' }, { x: 440, y: 456 },
      '與陳記布行隔街相望的老布莊，正在補砌山牆紅磚。', { progress: 83, grant: 1840000, open: '預計 2026 年 12 月開放' }),
    H('OT-26', '謝家和洋宅', 1929, 'wayo', 'pending', '糖行街', '3 號', '住宅', '閒置', '謝家（謝明遠）',
      ['MJ-23'], { floors: 2, bays: 3, w: 188 }, { x: 228, y: 108 },
      '雨淋板外牆與夜藍花磚玄關保存良好，但屋瓦破損漏水嚴重。', { open: '暫不開放' }),
    H('OT-27', '三益冰果室', 1964, 'modern', 'pending', '米市街', '19 號', '冰果室', '一樓仍營業，樓上閒置', '三益（邱家）',
      [], { floors: 2, bays: 3, w: 176, sign: '三益冰果' }, { x: 204, y: 364 },
      '營業超過一甲子的冰果室，花格磚立面需要整修，店主希望修復時不必停業。', { open: '營業時間可入內（週二至週日 11:00–21:00）' }),
    H('OT-28', '楊家洋樓', 1927, 'western', 'revived', '茶棧街', '12 號', '茶商住宅', '舊城老屋旅宿（四間客房）', '楊家（楊子瑩）',
      ['MJ-04', 'MJ-01'], { floors: 2, bays: 3, w: 202, plaque: '楊', brick: true }, { x: 796, y: 262 },
      '修復後經營小型旅宿，客房地坪重鋪了原廠同款的芥黃日輪菊花磚。',
      { grant: 2320000, open: '住宿需預約；每週六 15:00 開放一樓參觀', opened: '2025-01' }),
    H('OT-29', '德昌碾米廠宿舍', 1943, 'wayo', 'pending', '舊碼頭路', '30 號', '員工宿舍', '閒置', '德昌（何家）',
      [], { floors: 2, bays: 3, w: 194 }, { x: 860, y: 532 },
      '戰爭末期興建的木造宿舍，構造簡省，是研究戰時建築的重要樣本。', { open: '暫不開放' }),
    H('OT-30', '東昇冰廠', 1957, 'modern', 'pending', '舊碼頭路', '26 號', '製冰廠', '部分仍供漁船用冰', '東昇冷凍（黃家）',
      [], { floors: 2, bays: 3, w: 230, sign: '東昇製冰' }, { x: 730, y: 578 },
      '仍在運轉的製冰廠，清晨會看到冰塊沿著滑道送上漁船。', { open: '暫不開放' }),
    H('OT-31', '源記漁具行', 1906, 'minnan', 'revived', '舊碼頭路', '2 號', '漁具行', '海港生活小館', '源記（第四代 吳佩珊）',
      ['MJ-02'], { floors: 2, bays: 3, w: 186, plaque: '源記', sign: '源記漁具' }, { x: 90, y: 530 },
      '碼頭口的老漁具行，修復後展示漁網、浮球與老照片，假日有補網示範。',
      { grant: 1560000, open: '週六、週日 10:00–17:00', opened: '2023-04' }),
    H('OT-32', '文成書局', 1969, 'modern', 'restoring', '會館街', '52 號', '書局', '修復中，規劃為出版與印刷史小館', '文成（林家）',
      [], { floors: 3, bays: 3, w: 192, sign: '文成書局' }, { x: 600, y: 198 },
      '舊城最晚興建的列冊老屋，三樓的花格磚與圓窗是 1960 年代的設計語彙。', { progress: 12, grant: 1380000, open: '修復期間暫不開放' }),
  ];
  const houseIndex = new Map(App.data.houses.map(h => [h.id, h]));
  App.house = id => houseIndex.get(id);
  App.houseURL = h => (h.featured ? 'house.html' : 'houses.html#' + h.id);
  App.tileURL = id => 'tiles.html#' + id;

  App.data.tours = [
    { id: 'T1024', date: '2026-10-24', start: '09:30', end: '11:30', type: 'walk', title: '花磚散步：從會館街走到米市街',
      guide: '周以寧（再生辦公室研究員）', place: '合益商行（舊城再生工作站）', cap: 25, booked: 21, fee: 0, house: 'OT-14',
      desc: '沿途看 9 棟老屋的山頭與女兒牆，學會分辨花磚的年代與產地痕跡。' },
    { id: 'T1025', date: '2026-10-25', start: '14:00', end: '15:30', type: 'site', title: '林家洋樓 修復現場開放日',
      guide: '黃建廷（修復工程建築師）', place: '林家洋樓（會館街 41 號）', cap: 20, booked: 20, fee: 0, house: 'OT-02',
      desc: '戴上安全帽走上鷹架，近看 286 片花磚的清洗、補釉與回貼。' },
    { id: 'T1031', date: '2026-10-31', start: '10:00', end: '12:00', type: 'family', title: '親子花磚拓印：把老屋的花帶回家',
      guide: '江若帆（藝術教育工作者）', place: '陳記布行（布埕街 23 號）', cap: 16, booked: 9, fee: 150, house: 'OT-01',
      desc: '用棉布與植物染拓印花磚紋樣，完成一只小提袋。適合 6–12 歲，一位孩子需一位大人陪同。' },
    { id: 'T1101', date: '2026-11-01', start: '13:30', end: '17:00', type: 'workshop', title: '花磚修復工作坊：清洗、補釉與回貼',
      guide: '許文彥（花磚修復師）', place: '蔡家三連棟（打鐵巷 2 號）', cap: 12, booked: 7, fee: 600, house: 'OT-13',
      desc: '實際操作清除水泥殘漿、以樹脂補缺與補釉，材料費含一片可帶走的練習磚。' },
    { id: 'T1107', date: '2026-11-07', start: '10:00', end: '17:00', type: 'walk', title: '秋季老屋開放日：十二棟老屋同時開門',
      guide: '各屋屋主與志工', place: '舊城歷史街區（領取地圖：合益商行）', cap: 0, booked: 0, fee: 0, house: 'OT-14',
      desc: '平常不開放的林家洋樓、吳家和洋宅等十二棟老屋同時開門，免報名，集章換限量花磚杯墊。' },
    { id: 'T1108', date: '2026-11-08', start: '18:30', end: '20:00', type: 'walk', title: '夜訪舊城：亭仔腳燈下的立面',
      guide: '周以寧（再生辦公室研究員）', place: '舊城公會堂前廣場', cap: 30, booked: 12, fee: 0, house: 'OT-23',
      desc: '開放日限定夜間場，騎樓點燈後看洗石子與花磚的光影，結束於廖氏洋樓書房。' },
    { id: 'T1114', date: '2026-11-14', start: '14:00', end: '16:00', type: 'walk', title: '戰後現代主義建築散步',
      guide: '羅以哲（建築史研究者）', place: '大順五金行（茶棧街 3 號）', cap: 25, booked: 4, fee: 0, house: 'OT-06',
      desc: '從直立招牌、遮陽板到花格磚，認識 1950–70 年代被忽略的「新」老屋。' },
    { id: 'T1121', date: '2026-11-21', start: '14:00', end: '16:00', type: 'talk', title: '屋主說明會：修復補助怎麼申請',
      guide: '舊城街區再生辦公室', place: '舊城公會堂 2 樓展演廳', cap: 60, booked: 38, fee: 0, house: 'OT-23',
      desc: '說明第二期補助的資格、比例與文件，現場提供一對一諮詢，屋主與承租人皆可參加。' },
  ];
  App.data.tourTypes = {
    walk: '街區散步', site: '修復現場', workshop: '花磚工作坊', family: '親子活動', talk: '說明會',
  };
  App.tour = id => App.data.tours.find(t => t.id === id);

  /* ---------- 2. 圖示 ---------- */
  const ICONS = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0113 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>',
    users: '<circle cx="9" cy="9" r="3.3"/><path d="M2.8 19.5c.9-3.4 3.2-5.2 6.2-5.2s5.3 1.8 6.2 5.2"/><path d="M15.5 5.9a3.2 3.2 0 010 6.2M17.6 14.6c1.8.7 3 2.3 3.6 4.9"/>',
    tile: '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M12 6.5l5.5 5.5-5.5 5.5L6.5 12z"/><circle cx="12" cy="12" r="1.6"/>',
    house: '<path d="M4 20.5V10l8-6 8 6v10.5"/><path d="M9.5 20.5v-6h5v6M3 20.5h18"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
    map: '<path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4.2-2 1.3a10.5 10.5 0 006 6l1.3-2 4.2 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.5 5.7a2 2 0 012-2.2z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1"/><path d="M4 6.5l8 6.2 8-6.2"/>',
    hammer: '<path d="M13.5 6.5l4 4M11 9l-7 7a1.8 1.8 0 002.5 2.5l7-7"/><path d="M12 5l3-2 6 6-2 3z"/>',
    leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15"/><path d="M5 19l8-8"/>',
    alert: '<path d="M12 4L2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.2"/>',
    grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M3.5 6.5h1M3.5 12h1M3.5 17.5h1"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    shuffle: '<path d="M3.5 7h3.5c4 0 6 10 10 10h3.5M17.5 14l3 3-3 3M3.5 17h3.5c1.6 0 2.8-1.6 3.8-3.4M13.4 9.4C14.4 8.1 15.5 7 17 7h3.5M17.5 4l3 3-3 3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    ruler: '<path d="M3.5 15.5l12-12 5 5-12 12z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>',
  };
  App.icon = (name, cls = '') =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

  /* ---------- 3. 花磚引擎 ---------- */
  const TC = 60; // 花磚中心
  const PALETTES = [
    { id: 'cobalt', name: '鈷藍', ground: '#F6EEDC', a: '#2B4C9B', b: '#1F6E6A', c: '#D9A441', d: '#B5443A', ridge: '#FFFBF2', line: '#2A1F1A' },
    { id: 'peacock', name: '孔雀綠', ground: '#F6EEDC', a: '#1F6E6A', b: '#D9A441', c: '#B5443A', d: '#2B4C9B', ridge: '#FFFBF2', line: '#2A1F1A' },
    { id: 'brick', name: '磚紅', ground: '#F6EEDC', a: '#B5443A', b: '#1F6E6A', c: '#D9A441', d: '#2B4C9B', ridge: '#FFFBF2', line: '#2A1F1A' },
    { id: 'mustard', name: '芥黃', ground: '#F4E6C4', a: '#D9A441', b: '#B5443A', c: '#1F6E6A', d: '#2B4C9B', ridge: '#FFFBF2', line: '#2A1F1A' },
    { id: 'night', name: '夜藍', ground: '#25407F', a: '#F6EEDC', b: '#D9A441', c: '#B5443A', d: '#1F6E6A', ridge: '#1A2F60', line: '#14244A' },
    { id: 'blush', name: '胭脂', ground: '#F6EEDC', a: '#D3867A', b: '#1F6E6A', c: '#D9A441', d: '#B5443A', ridge: '#FFFBF2', line: '#2A1F1A' },
  ];
  const HEARTS = [
    { id: 'rosette', name: '重瓣' }, { id: 'star', name: '星芒' }, { id: 'circle', name: '圓心' },
    { id: 'diamond', name: '方勝' }, { id: 'cross', name: '四葉' }, { id: 'bud', name: '花苞' },
  ];
  const RINGS = [
    { id: 'none', name: '無圈帶' }, { id: 'line', name: '雙線圈' }, { id: 'beads', name: '連珠圈' },
    { id: 'scallop', name: '花邊圈' }, { id: 'lattice', name: '菱格框' }, { id: 'octagon', name: '八角框' },
  ];
  const PETALS = [{ id: 'almond', name: '杏仁瓣' }, { id: 'round', name: '圓瓣' }, { id: 'heart', name: '心形瓣' }, { id: 'spike', name: '尖瓣' }];
  const CORNERS = [{ id: 'none', name: '無角花' }, { id: 'quarter', name: '四分花' }, { id: 'leaf', name: '葉角' }, { id: 'fan', name: '扇角' }];
  const EDGES = [{ id: 'none', name: '無' }, { id: 'half', name: '半圓' }, { id: 'bar', name: '邊條' }];
  const TILE_DEFAULTS = { fold: 4, palette: 'cobalt', heart: 'rosette', ring: 'line', petal: 'almond', corner: 'quarter', edge: 'none' };

  // 花瓣一律以 (0,0) 為基準、朝上（-y）繪製，再用 rotate() 擺到各方位
  function petalD(shape, r0, r1, w) {
    const m = r0 + (r1 - r0) * 0.45, q = r0 + (r1 - r0) * 0.32;
    switch (shape) {
      case 'round':
        return `M0 ${-r0}C${r2(w * 1.3)} ${r2(-q)} ${r2(w * 1.1)} ${-r1} 0 ${-r1}C${r2(-w * 1.1)} ${-r1} ${r2(-w * 1.3)} ${r2(-q)} 0 ${-r0}Z`;
      case 'heart': {
        const t = r2(r1 - (r1 - r0) * 0.2), qq = r2(-(r0 + (r1 - r0) * 0.42));
        return `M0 ${-r0}C${r2(w * 1.55)} ${qq} ${r2(w * 1.15)} ${r2(-r1 - 1)} ${r2(w * 0.42)} ${-r1}Q0 ${-r1} 0 ${-t}Q0 ${-r1} ${r2(-w * 0.42)} ${-r1}C${r2(-w * 1.15)} ${r2(-r1 - 1)} ${r2(-w * 1.55)} ${qq} 0 ${-r0}Z`;
      }
      case 'spike':
        return `M0 ${-r0}L${r2(w * 0.62)} ${r2(-m)}L0 ${-r1}L${r2(-w * 0.62)} ${r2(-m)}Z`;
      default:
        return `M0 ${-r0}Q${r2(w)} ${r2(-m)} 0 ${-r1}Q${r2(-w)} ${r2(-m)} 0 ${-r0}Z`;
    }
  }
  const at = (deg, inner, cx = TC, cy = TC) => `<g transform="translate(${cx} ${cy}) rotate(${r2(deg)})">${inner}</g>`;
  const circle = (cx, cy, r, fill, extra = '') => `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${fill}"${extra}/>`;
  const polar = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [r2(TC + r * Math.cos(a)), r2(TC + r * Math.sin(a))]; };
  const polyPts = (n, r, offset = 0) => Array.from({ length: n }, (_, i) => polar(r, offset + i * 360 / n).join(',')).join(' ');

  function tileBody(o, p) {
    const n = o.fold === 8 ? 8 : 4;
    const step = 360 / n;
    const rs = ` stroke="${p.ridge}" stroke-width="1"`;
    const ringed = o.ring === 'line' || o.ring === 'beads' || o.ring === 'scallop';
    const R = 44;
    const Ro = o.ring === 'none' ? 42 : (ringed ? 37 : 38);
    let s = `<rect width="120" height="120" fill="${p.ground}"/>`;

    // 邊緣：拼貼後相鄰兩片合成完整圖形（四方連續的關鍵）
    if (o.edge === 'bar') {
      s += `<path d="M0 6.5H120M0 113.5H120M6.5 0V120M113.5 0V120" fill="none" stroke="${p.b}" stroke-width="2.6"/>`;
      s += `<path d="M0 10.5H120M0 109.5H120M10.5 0V120M109.5 0V120" fill="none" stroke="${p.c}" stroke-width=".9"/>`;
    } else if (o.edge === 'half') {
      [[60, 0], [120, 60], [60, 120], [0, 60]].forEach(([x, y]) => {
        s += circle(x, y, 11, p.c, rs) + circle(x, y, 6, p.a, rs) + circle(x, y, 2.2, p.ground);
      });
    }

    // 角花：每個角畫一個以角點為圓心的圖形，四片拼起來就是完整的次要花
    if (o.corner !== 'none') {
      let c = '';
      if (o.corner === 'quarter') {
        c += circle(0, 0, 25, p.b, rs) + circle(0, 0, 17, p.c, rs) + circle(0, 0, 9, p.a, rs);
        [112, 135, 158].forEach(d => { c += `<path d="${petalD('almond', 26, 37, 4.6)}" transform="rotate(${d})" fill="${p.a}"${rs}/>`; });
        c += circle(0, 0, 3, p.ground);
      } else if (o.corner === 'leaf') {
        c += `<path d="${petalD('almond', 3, 33, 8)}" transform="rotate(135)" fill="${p.b}"${rs}/>`;
        [118, 152].forEach(d => { c += `<path d="${petalD('almond', 8, 27, 5.5)}" transform="rotate(${d})" fill="${p.a}"${rs}/>`; });
        const [dx, dy] = [Math.cos(Math.PI / 4) * 37, Math.sin(Math.PI / 4) * 37];
        c += circle(dx, dy, 2.6, p.c);
      } else if (o.corner === 'fan') {
        c += circle(0, 0, 22, p.a, rs);
        for (let d = 90; d <= 180; d += 15) {
          const a = d * Math.PI / 180;
          c += circle(Math.sin(a) * 23, -Math.cos(a) * 23, 4.2, p.a, rs);
        }
        c += `<path d="M0 0L0 20M0 0L10 17.3M0 0L17.3 10M0 0L20 0" stroke="${p.ridge}" stroke-width="1.1" fill="none"/>`;
        c += circle(0, 0, 8, p.c, rs);
      }
      s += [[0, 0, 0], [120, 0, 90], [120, 120, 180], [0, 120, 270]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${c}</g>`).join('');
    }

    // 不旋轉的框（菱格、八角）放在 rose 之外，滑鼠旋轉時才不會跟著轉
    if (o.ring === 'lattice') {
      s += `<path d="M60 7L113 60 60 113 7 60Z" fill="none" stroke="${p.a}" stroke-width="3.2"/>`;
      s += `<path d="M60 14L106 60 60 106 14 60Z" fill="none" stroke="${p.b}" stroke-width="1"/>`;
    } else if (o.ring === 'octagon') {
      s += `<polygon points="${polyPts(8, 50, 22.5)}" fill="none" stroke="${p.a}" stroke-width="2.8"/>`;
      s += `<polygon points="${polyPts(8, 45, 22.5)}" fill="none" stroke="${p.c}" stroke-width="1"/>`;
    }

    // 中央主花（.tile__rose）：圈帶 → 外瓣 → 間瓣 → 花心
    let r = '';
    if (o.ring === 'line') {
      r += circle(TC, TC, R, 'none', ` stroke="${p.a}" stroke-width="2.8"`) + circle(TC, TC, R - 4.2, 'none', ` stroke="${p.c}" stroke-width="1"`);
    } else if (o.ring === 'beads') {
      r += circle(TC, TC, R, 'none', ` stroke="${p.b}" stroke-width=".9"`);
      const k = n * 4;
      for (let i = 0; i < k; i++) { const [x, y] = polar(R, i * 360 / k); r += circle(x, y, i % 4 === 0 ? 3 : 2, i % 4 === 0 ? p.c : p.a); }
    } else if (o.ring === 'scallop') {
      const k = n * 3;
      for (let i = 0; i < k; i++) { const [x, y] = polar(R - 1, i * 360 / k + 180 / k); r += circle(x, y, 6, p.b, rs); }
      r += circle(TC, TC, R - 3.5, p.ground, rs);
    }
    const wo = n === 8 ? 7.4 : 11;
    for (let i = 0; i < n; i++) r += at(i * step, `<path d="${petalD(o.petal, 9, Ro, wo)}" fill="${p.a}"${rs}/>`);
    const inner = o.petal === 'spike' ? 'almond' : 'spike';
    for (let i = 0; i < n; i++) r += at(i * step + step / 2, `<path d="${petalD(inner, 8, Ro * 0.7, wo * 0.62)}" fill="${p.b}"${rs}/>`);
    if (n === 8 || o.ring === 'none') {
      for (let i = 0; i < n; i++) { const [x, y] = polar(Ro * 0.88, i * step + step / 2); r += circle(x, y, 2.1, p.c); }
    }
    r += heartSVG(o.heart, n, p, rs);
    s += `<g class="tile__rose">${r}</g>`;
    s += `<path d="M.75 .75H119.25V119.25H.75Z" fill="none" stroke="${p.line}" stroke-opacity=".2" stroke-width="1.5"/>`;
    return s;
  }

  function heartSVG(type, n, p, rs) {
    switch (type) {
      case 'star': {
        const pts = Array.from({ length: 16 }, (_, i) => polar(i % 2 ? 5.5 : 13, i * 22.5).join(',')).join(' ');
        return `<polygon points="${pts}" fill="${p.c}"${rs}/>` + circle(TC, TC, 3.4, p.d);
      }
      case 'circle':
        return circle(TC, TC, 11.5, p.d, rs) + circle(TC, TC, 7.2, p.ground, ` stroke="${p.c}" stroke-width="2.2"`) + circle(TC, TC, 2.6, p.c);
      case 'diamond':
        return `<rect x="50" y="50" width="20" height="20" transform="rotate(45 60 60)" fill="${p.c}"${rs}/>` +
          (n === 8 ? `<rect x="51.5" y="51.5" width="17" height="17" fill="${p.c}"${rs}/>` : '') +
          `<rect x="55" y="55" width="10" height="10" transform="rotate(45 60 60)" fill="${p.d}"${rs}/>`;
      case 'cross':
        return [0, 90, 180, 270].map(d => { const [x, y] = polar(6, d); return circle(x, y, 5.2, p.c, rs); }).join('') + circle(TC, TC, 3.6, p.d, rs);
      case 'bud':
        return Array.from({ length: n }, (_, i) => at(i * 360 / n, `<path d="${petalD('almond', 0, 13, 4.6)}" fill="${p.c}"${rs}/>`)).join('') + circle(TC, TC, 3, p.d, rs);
      default:
        return circle(TC, TC, 11.5, p.c, rs) + circle(TC, TC, 7, p.d, rs) + circle(TC, TC, 2.8, p.ground);
    }
  }

  const paletteOf = id => (typeof id === 'object' ? id : PALETTES.find(p => p.id === id) || PALETTES[0]);

  App.tile = {
    palettes: PALETTES, hearts: HEARTS, rings: RINGS, petals: PETALS, corners: CORNERS, edges: EDGES, defaults: TILE_DEFAULTS,
    cats: {
      floral: { name: '花卉', en: 'Floral' }, geometric: { name: '幾何', en: 'Geometric' },
      medallion: { name: '圈帶', en: 'Medallion' }, corner: { name: '角花', en: 'Corner' },
    },
    /* 回傳花磚 SVG 字串。standalone:true 時附 xmlns 與尺寸，適合下載 */
    svg(opts = {}, { cls = '', title = '', standalone = false, size = 120 } = {}) {
      const o = Object.assign({}, TILE_DEFAULTS, opts);
      const p = paletteOf(o.palette);
      const dims = standalone ? ` width="${size}" height="${size}"` : '';
      const t = title ? `<title>${App.esc(title)}</title>` : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" class="tile-svg ${cls}" viewBox="0 0 120 120"${dims}${title ? ' role="img"' : ' aria-hidden="true"'}>${t}${tileBody(o, p)}</svg>`;
    },
    dataURI(opts, size = 120) {
      return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(App.tile.svg(opts, { standalone: true, size }))}")`;
    },
    /* 磚背：素燒陶面的格狀凸肋與窯印，翻面動畫的背面 */
    back(cls = '') {
      let ribs = '';
      for (let i = 1; i < 6; i++) ribs += `M${i * 20} 8V112M8 ${i * 20}H112`;
      return `<svg class="tile-svg tile-back ${cls}" viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" fill="#C98A64"/>` +
        `<rect x="6" y="6" width="108" height="108" fill="#BF7D57"/><path d="${ribs}" stroke="#D69B76" stroke-width="3" fill="none"/>` +
        `<circle cx="60" cy="60" r="21" fill="#C98A64" stroke="#A9654A" stroke-width="1.4"/><circle cx="60" cy="60" r="17" fill="none" stroke="#A9654A" stroke-width=".7"/>` +
        `<text x="60" y="58" text-anchor="middle" font-family="'Noto Serif TC',serif" font-size="9" font-weight="700" fill="#8E4E37">澄港窯</text>` +
        `<text x="60" y="68" text-anchor="middle" font-family="'Playfair Display',serif" font-size="5.2" letter-spacing=".6" fill="#8E4E37">CHENGGANG</text></svg>`;
    },
    download(svgString, filename) {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 延後釋放，讓瀏覽器先開始下載
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    },
  };

  // 24 款圖鑑：[id, 名稱, 分類, opts, 發現地點, 推估年代, 舊城現存片數, 說明]
  App.tile.catalog = [
    ['MJ-01', '鈷藍八瓣菊', 'floral', { fold: 8, palette: 'cobalt', heart: 'rosette', ring: 'beads', petal: 'almond', corner: 'quarter', edge: 'none' }, 'OT-02', 1928, 164, '林家洋樓山頭兩側的主角（142 片），八瓣菊外圍一圈連珠，四角拼成第二朵小花；楊家洋樓也有 22 片。'],
    ['MJ-02', '孔雀綠四瓣蓮', 'floral', { fold: 4, palette: 'peacock', heart: 'circle', ring: 'line', petal: 'round', corner: 'leaf', edge: 'half' }, 'OT-04', 1931, 96, '永泰醫院候診室地坪整片鋪設，圓瓣飽滿，邊緣半圓拼成連續珠串。'],
    ['MJ-03', '磚紅重瓣玫瑰', 'floral', { fold: 8, palette: 'brick', heart: 'rosette', ring: 'scallop', petal: 'round', corner: 'quarter', edge: 'none' }, 'OT-22', 1933, 88, '廖氏洋樓三樓女兒牆，花邊圈像蕾絲，是舊城最常被拍的一款。'],
    ['MJ-04', '芥黃日輪菊', 'floral', { fold: 8, palette: 'mustard', heart: 'star', ring: 'line', petal: 'spike', corner: 'fan', edge: 'none' }, 'OT-28', 1927, 64, '尖瓣放射如日輪，楊家洋樓修復時依殘片重新燒製了 40 片。'],
    ['MJ-05', '胭脂心形瓣', 'floral', { fold: 4, palette: 'blush', heart: 'cross', ring: 'beads', petal: 'heart', corner: 'leaf', edge: 'none' }, 'OT-01', 1912, 120, '陳記布行二樓窗楣，心形瓣配四葉花心，是街屋最常見的嫁妝色。'],
    ['MJ-06', '夜藍白梅', 'floral', { fold: 8, palette: 'night', heart: 'bud', ring: 'none', petal: 'round', corner: 'quarter', edge: 'half' }, 'OT-16', 1930, 52, '深藍底上的白色圓瓣，何家洋樓陽台下緣僅存 52 片。'],
    ['MJ-07', '鈷藍菱格花', 'geometric', { fold: 4, palette: 'cobalt', heart: 'diamond', ring: 'lattice', petal: 'spike', corner: 'none', edge: 'half' }, 'OT-02', 1928, 76, '菱格框把整面牆切成斜向網格，林家洋樓一樓柱面使用。'],
    ['MJ-08', '孔雀綠方勝', 'geometric', { fold: 4, palette: 'peacock', heart: 'diamond', ring: 'octagon', petal: 'spike', corner: 'fan', edge: 'bar' }, 'OT-07', 1908, 84, '春和茶棧女兒牆，邊條拼貼後形成方格，八角框套方勝花心。'],
    ['MJ-09', '磚紅十字星', 'geometric', { fold: 4, palette: 'brick', heart: 'star', ring: 'lattice', petal: 'almond', corner: 'quarter', edge: 'none' }, 'OT-13', 1918, 58, '蔡家三連棟山牆，星芒花心與菱格交錯，遠看像一片十字繡。'],
    ['MJ-10', '芥黃八角窗', 'geometric', { fold: 8, palette: 'mustard', heart: 'circle', ring: 'octagon', petal: 'spike', corner: 'none', edge: 'bar' }, 'OT-14', 1921, 70, '合益商行（今工作站）入口地坪，八角框像一扇扇小窗。'],
    ['MJ-11', '夜藍星芒', 'geometric', { fold: 8, palette: 'night', heart: 'star', ring: 'octagon', petal: 'spike', corner: 'fan', edge: 'none' }, 'OT-18', 1938, 40, '商工會館玄關的深色地磚，昭和後期流行的冷調配色。'],
    ['MJ-12', '胭脂菱紋', 'geometric', { fold: 4, palette: 'blush', heart: 'diamond', ring: 'lattice', petal: 'heart', corner: 'leaf', edge: 'bar' }, 'OT-20', 1899, 36, '王家街屋門楣上方，菱紋與葉角疊合，是舊城最早的花磚樣式之一。'],
    ['MJ-13', '鈷藍連珠圈', 'medallion', { fold: 8, palette: 'cobalt', heart: 'circle', ring: 'beads', petal: 'round', corner: 'fan', edge: 'half' }, 'OT-23', 1940, 92, '公會堂舞台側牆，連珠圈與扇角在大面積拼貼時節奏感最強。'],
    ['MJ-14', '孔雀綠花邊圈', 'medallion', { fold: 8, palette: 'peacock', heart: 'rosette', ring: 'scallop', petal: 'almond', corner: 'leaf', edge: 'none' }, 'OT-02', 1928, 68, '林家洋樓二樓陽台的腰帶磚，花邊圈內再套八瓣。'],
    ['MJ-15', '磚紅雙圈', 'medallion', { fold: 4, palette: 'brick', heart: 'cross', ring: 'line', petal: 'spike', corner: 'fan', edge: 'none' }, 'OT-13', 1918, 54, '蔡家三連棟亭仔腳的柱腳磚，雙線圈簡潔，耐磨損。'],
    ['MJ-16', '芥黃花邊圈', 'medallion', { fold: 4, palette: 'mustard', heart: 'rosette', ring: 'scallop', petal: 'heart', corner: 'quarter', edge: 'none' }, 'OT-12', 1902, 64, '許氏街屋山牆的 64 片，由屋主許文彥親手清洗補釉。'],
    ['MJ-17', '夜藍連珠', 'medallion', { fold: 4, palette: 'night', heart: 'cross', ring: 'beads', petal: 'round', corner: 'quarter', edge: 'half' }, 'OT-05', 1936, 46, '吳家和洋宅玄關踢腳，夜藍底配芥黃連珠，在和式空間裡特別醒目。'],
    ['MJ-18', '胭脂花環', 'medallion', { fold: 8, palette: 'blush', heart: 'bud', ring: 'scallop', petal: 'almond', corner: 'none', edge: 'half' }, 'OT-22', 1933, 72, '廖氏洋樓樓梯間的花環磚，現在是書店閱覽室的背景牆。'],
    ['MJ-19', '鈷藍角花', 'corner', { fold: 4, palette: 'cobalt', heart: 'bud', ring: 'none', petal: 'heart', corner: 'quarter', edge: 'half' }, 'OT-10', 1934, 82, '郵便局宿舍浴室腰牆，四片拼合時角花才是真正的主角。'],
    ['MJ-20', '孔雀綠葉角', 'corner', { fold: 4, palette: 'peacock', heart: 'star', ring: 'none', petal: 'spike', corner: 'leaf', edge: 'bar' }, 'OT-07', 1908, 66, '春和茶棧焙茶間的牆裙，葉角拼成四出的葉叢。'],
    ['MJ-21', '磚紅扇角', 'corner', { fold: 8, palette: 'brick', heart: 'circle', ring: 'none', petal: 'round', corner: 'fan', edge: 'none' }, 'OT-16', 1930, 44, '何家洋樓客廳地坪的邊框磚，扇角拼合後像一朵朵圓扇。'],
    ['MJ-22', '芥黃角花', 'corner', { fold: 4, palette: 'mustard', heart: 'diamond', ring: 'none', petal: 'almond', corner: 'quarter', edge: 'bar' }, 'OT-14', 1921, 60, '合益商行二樓走廊，邊條與角花組成溫暖的格子地坪。'],
    ['MJ-23', '夜藍葉角', 'corner', { fold: 8, palette: 'night', heart: 'rosette', ring: 'none', petal: 'heart', corner: 'leaf', edge: 'none' }, 'OT-26', 1929, 38, '謝家和洋宅玄關，夜藍底上的葉角在燈下會泛出釉光。'],
    ['MJ-24', '胭脂扇角', 'corner', { fold: 4, palette: 'blush', heart: 'star', ring: 'none', petal: 'round', corner: 'fan', edge: 'half' }, 'OT-17', 1915, 50, '益生藥房櫃台立面，胭脂色扇角是藥房老闆娘當年親自挑選。'],
  ].map(([id, name, cat, opts, house, year, count, note]) => ({ id, name, cat, opts, house, year, count, note }));
  const tileIndex = new Map(App.tile.catalog.map(t => [t.id, t]));
  App.tile.get = id => tileIndex.get(id);
  App.tile.total = App.tile.catalog.reduce((s, t) => s + t.count, 0);

  /* ---------- 4. 立面引擎 ---------- */
  App.facade = {};
  App.facade.parts = {
    gable: { name: '山頭', desc: '女兒牆中央凸起的裝飾牆面，常刻商號、姓氏或興建年份，是一棟街屋的名片。' },
    parapet: { name: '女兒牆', desc: '屋頂邊緣的矮牆，兼具防護與收頭；洋樓多做寶瓶欄杆，街屋則嵌花磚。' },
    tiles: { name: '花磚', desc: '日治時期流行的彩釉浮雕磁磚，多貼在山頭、女兒牆與柱面，象徵家道興旺。' },
    cornice: { name: '簷口與腰線', desc: '樓層之間的水平線腳，劃分立面比例，也把雨水導離牆面。' },
    window: { name: '窗', desc: '上層開窗的形式最能看出年代：木板窗、拱窗、格子窗到水平帶窗。' },
    column: { name: '洗石子柱', desc: '水泥混合碎石粉刷後再沖洗出石粒質感，是 1920–60 年代最常見的柱面工法。' },
    arcade: { name: '亭仔腳', desc: '臨街的騎樓走廊，遮陽避雨，一家接一家連成街區共用的通道。' },
    arch: { name: '拱圈', desc: '亭仔腳開口上方的拱，中央的拱心石把重量分散到兩側柱子。' },
    balcony: { name: '陽台欄杆', desc: '寶瓶狀的欄杆柱一支支排列，多以洗石子或預鑄水泥製作。' },
    sign: { name: '招牌', desc: '商號名稱直接做在立面上，是老屋與店家歷史最直接的證據。' },
    roof: { name: '屋瓦', desc: '和洋混合建築保留日式黑瓦與鬼瓦，屋簷出挑以保護木造牆面。' },
    canopy: { name: '雨庇', desc: '一樓上方的懸臂板，取代傳統亭仔腳，是戰後店屋的典型做法。' },
    grille: { name: '花格磚', desc: '1960 年代流行的水泥鏤空磚，通風、遮陽又帶來光影圖樣。' },
    fin: { name: '直立招牌', desc: '垂直立在立面一側的招牌柱，讓遠處的行人也看得見店名。' },
    plinth: { name: '基座', desc: '立面最下緣的石材或洗石子基座，阻擋地面濕氣上升。' },
  };

  const INK = '#2A1F1A';
  const WALL = { brick: '#E6B9A5', stone: '#EFE4CF', wood: '#E9D7B6', modern: '#E7E1D4', trim: '#F7F0E2', shade: '#CDBBA2', glass: '#C9D6D2', dark: '#8C7B6B' };
  const mixHex = (a, b, t) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    return '#' + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
  };
  const fadePalette = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'string' && v[0] === '#' ? mixHex(v, '#A99C8A', 0.55) : v]));

  const rectD = (x, y, w, h) => `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z`;
  const circD = (cx, cy, r) => `M${r2(cx - r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)}A${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)}`;
  // 半圓拱（底在 y，開口寬 w）
  const archD = (x, y, w, bottom) => `M${r2(x)} ${r2(bottom)}V${r2(y)}A${r2(w / 2)} ${r2(w / 2)} 0 0 1 ${r2(x + w)} ${r2(y)}V${r2(bottom)}`;
  const segArchD = (x, y, w, rise, bottom) => {
    const R = (w * w / 4 + rise * rise) / (2 * rise);
    return `M${r2(x)} ${r2(bottom)}V${r2(y)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(x + w)} ${r2(y)}V${r2(bottom)}`;
  };

  /* 立面繪圖器：線條（.ln，描繪動畫）與色塊（.fl，描完後淡入）分開，構件以 data-part 分組 */
  function makeCanvas(seed) {
    let i = 0, cur = null;
    const parts = [];
    return {
      rand: rng(seed),
      panels: [],
      part(key) { cur = { key, fills: '', lines: '' }; parts.push(cur); return this; },
      fl(d, fill, extra = '') { cur.fills += `<path class="fl" d="${d}" fill="${fill}" stroke="none"${extra}/>`; return this; },
      raw(markup) { cur.fills += markup; return this; },
      ln(d, w = 1, extra = '') { cur.lines += `<path class="ln" d="${d}" pathLength="1" style="--i:${i++}"${w !== 1 ? ` stroke-width="${w}"` : ''}${extra}/>`; return this; },
      text(x, y, str, size, extra = '') {
        cur.fills += `<text class="fl" x="${r2(x)}" y="${r2(y)}" text-anchor="middle" font-size="${size}" fill="${INK}" stroke="none"${extra}>${App.esc(str)}</text>`;
        return this;
      },
      render() { return parts.map(p => `<g data-part="${p.key}">${p.fills}${p.lines}</g>`).join(''); },
    };
  }

  // 花磚面板：以 <pattern> 平鋪；記下位置，修復前狀態才知道缺磚該補在哪
  function tilePanel(cv, pid, x, y, w, h) {
    cv.fl(rectD(x, y, w, h), `url(#${pid})`).ln(rectD(x, y, w, h), 0.8);
    cv.panels.push({ x, y, w, h });
  }

  function balustrade(cv, x0, x1, top, bottom) {
    const railH = 3.2;
    cv.fl(rectD(x0, top, x1 - x0, bottom - top), WALL.trim);
    cv.ln(rectD(x0, top, x1 - x0, railH)).ln(rectD(x0, bottom - railH, x1 - x0, railH));
    const n = Math.max(2, Math.floor((x1 - x0) / 6.2));
    const gap = (x1 - x0) / n;
    let d = '';
    const h = bottom - top - railH * 2;
    for (let k = 0; k < n; k++) {
      const cx = x0 + gap * (k + 0.5), yt = top + railH, yb = bottom - railH;
      // 寶瓶：上細下粗的瓶身
      d += `M${r2(cx - 1.2)} ${r2(yt)}C${r2(cx - 1.2)} ${r2(yt + h * 0.35)} ${r2(cx - 2.6)} ${r2(yt + h * 0.5)} ${r2(cx - 2.4)} ${r2(yt + h * 0.75)}C${r2(cx - 2.2)} ${r2(yb - 1)} ${r2(cx - 1.4)} ${r2(yb)} ${r2(cx - 1.4)} ${r2(yb)}`;
      d += `M${r2(cx + 1.2)} ${r2(yt)}C${r2(cx + 1.2)} ${r2(yt + h * 0.35)} ${r2(cx + 2.6)} ${r2(yt + h * 0.5)} ${r2(cx + 2.4)} ${r2(yt + h * 0.75)}C${r2(cx + 2.2)} ${r2(yb - 1)} ${r2(cx + 1.4)} ${r2(yb)} ${r2(cx + 1.4)} ${r2(yb)}`;
    }
    cv.ln(d, 0.7);
  }

  function hatch(x, y, w, h, gap, horizontal = true) {
    let d = '';
    if (horizontal) for (let yy = y + gap; yy < y + h - 0.5; yy += gap) d += `M${r2(x)} ${r2(yy)}H${r2(x + w)}`;
    else for (let xx = x + gap; xx < x + w - 0.5; xx += gap) d += `M${r2(xx)} ${r2(y)}V${r2(y + h)}`;
    return d;
  }

  function drawFacade(h, state) {
    const f = Object.assign({ floors: 2, bays: 3, w: 200, plaque: '', sign: '' }, h.facade);
    const style = h.style;
    const before = state === 'before';
    const cv = makeCanvas(h.id + style);
    const R = cv.rand;
    const W = f.w, n = f.bays, bw = W / n;
    const gfH = 84, ufH = 68;
    const P = { western: 66, minnan: 56, wayo: 52, modern: 30 }[style];
    const Ht = P + gfH + ufH * (f.floors - 1);
    const floorTop = i => (i === 0 ? Ht - gfH : Ht - gfH - ufH * i);
    const pid = uid('fct');
    const tileDef = App.tile.get(h.tiles && h.tiles[0]) || App.tile.get(style === 'wayo' ? 'MJ-17' : 'MJ-13');
    const tileOpts = Object.assign({}, tileDef.opts, before ? { palette: fadePalette(paletteOf(tileDef.opts.palette)) } : {});
    const ts = style === 'western' ? 9 : 8;
    const defs = `<defs><pattern id="${pid}" width="${ts}" height="${ts}" patternUnits="userSpaceOnUse"><svg viewBox="0 0 120 120" width="${ts}" height="${ts}">${tileBody(Object.assign({}, TILE_DEFAULTS, tileOpts), paletteOf(tileOpts.palette))}</svg></pattern>` +
      `<pattern id="${pid}g" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${WALL.trim}"/><rect x=".6" y=".6" width="7.8" height="7.8" fill="none" stroke="${WALL.dark}" stroke-width=".6"/><circle cx="4.5" cy="4.5" r="2.6" fill="none" stroke="${WALL.dark}" stroke-width=".6"/><path d="M.6 .6L8.4 8.4M8.4 .6L.6 8.4" stroke="${WALL.dark}" stroke-width=".35"/></pattern></defs>`;
    const wallFill = before
      ? mixHex(style === 'minnan' || f.brick ? WALL.brick : style === 'wayo' ? WALL.wood : style === 'modern' ? WALL.modern : WALL.stone, '#A79A88', 0.35)
      : (style === 'minnan' || f.brick ? WALL.brick : style === 'wayo' ? WALL.wood : style === 'modern' ? WALL.modern : WALL.stone);
    const pw = { western: 10, minnan: 9, wayo: 7, modern: 6 }[style];
    const pierX = k => clamp(k * bw - pw / 2, 0, W - pw);

    /* 牆體 */
    cv.part('plinth').fl(rectD(0, P, W, Ht - P), wallFill);
    if (style === 'minnan' || f.brick) cv.raw(`<path class="fl" d="${hatch(0, P, W, Ht - P - 6, 4.2)}" stroke="#C98F78" stroke-width=".45" fill="none" opacity=".7"/>`);
    if (style === 'wayo') cv.raw(`<path class="fl" d="${hatch(0, P + 4, W, floorTop(0) - P - 4, 5)}" stroke="#BFA27C" stroke-width=".5" fill="none"/>`);
    if (style === 'modern') {
      let dots = '';
      for (let k = 0; k < 90; k++) dots += `M${r2(R() * W)} ${r2(P + R() * (Ht - P - 8))}h.01`;
      cv.raw(`<path class="fl" d="${dots}" stroke="#A69882" stroke-width="1.3" stroke-linecap="round" fill="none"/>`);
    }
    cv.fl(rectD(-3, Ht - 6, W + 6, 6), WALL.trim).ln(rectD(-3, Ht - 6, W + 6, 6)).ln(rectD(0, P, W, Ht - P), 1.1);

    /* 一樓：亭仔腳／店面 */
    const gTop = floorTop(0);
    const open = k => ({ x: pierX(k) + pw, w: pierX(k + 1) - pierX(k) - pw });
    cv.part('arcade');
    for (let k = 0; k < n; k++) {
      const o = open(k);
      const spring = gTop + 12 + o.w / 2;
      const shape = style === 'western' ? archD(o.x, spring, o.w, Ht - 6)
        : style === 'wayo' ? segArchD(o.x, gTop + 18, o.w, 8, Ht - 6)
        : rectD(o.x, gTop + (style === 'modern' ? 12 : 14), o.w, Ht - 6 - gTop - (style === 'modern' ? 12 : 14));
      cv.fl(shape + (style === 'western' || style === 'wayo' ? 'Z' : ''), WALL.shade);
      // 店門：木板門、玻璃門或鐵捲門
      const dw = o.w * 0.62, dx = o.x + (o.w - dw) / 2, dTop = Ht - 6 - 46;
      if (style === 'modern' && before) {
        cv.fl(rectD(dx - 4, dTop - 4, dw + 8, 50), '#B8B0A3').ln(rectD(dx - 4, dTop - 4, dw + 8, 50), 0.8).ln(hatch(dx - 4, dTop - 4, dw + 8, 50, 3.4), 0.4);
      } else {
        cv.fl(rectD(dx, dTop, dw, 46), style === 'modern' ? WALL.glass : '#B79C80').ln(rectD(dx, dTop, dw, 46), 0.8);
        cv.ln(style === 'modern' ? `M${r2(dx + dw / 2)} ${r2(dTop)}V${Ht - 6}M${r2(dx)} ${r2(dTop + 12)}H${r2(dx + dw)}` : hatch(dx, dTop, dw, 46, dw / 4, false) + `M${r2(dx)} ${r2(dTop + 9)}H${r2(dx + dw)}`, 0.55);
      }
    }
    if (style === 'western' || style === 'wayo') {
      cv.part('arch');
      for (let k = 0; k < n; k++) {
        const o = open(k);
        if (style === 'western') {
          const spring = gTop + 12 + o.w / 2;
          cv.ln(archD(o.x, spring, o.w, Ht - 6), 1.1).ln(archD(o.x - 3, spring, o.w + 6, spring + 0.01), 0.6);
          const kx = o.x + o.w / 2, ky = gTop + 12 - 3;
          cv.fl(`M${r2(kx - 4)} ${r2(ky)}H${r2(kx + 4)}L${r2(kx + 2.6)} ${r2(ky + 9)}H${r2(kx - 2.6)}Z`, WALL.trim).ln(`M${r2(kx - 4)} ${r2(ky)}H${r2(kx + 4)}L${r2(kx + 2.6)} ${r2(ky + 9)}H${r2(kx - 2.6)}Z`, 0.8);
        } else {
          cv.ln(segArchD(o.x, gTop + 18, o.w, 8, Ht - 6), 1.1);
        }
      }
    }

    /* 柱：洗石子柱／磚柱 */
    cv.part('column');
    for (let k = 0; k <= n; k++) {
      const x = pierX(k);
      cv.fl(rectD(x, gTop, pw, Ht - 6 - gTop), style === 'minnan' ? mixHex(wallFill, '#FFFFFF', 0.15) : WALL.trim).ln(rectD(x, gTop, pw, Ht - 6 - gTop), 0.9);
      if (style === 'western') cv.ln(rectD(x - 1.5, gTop + 2, pw + 3, 4) + rectD(x - 1, Ht - 14, pw + 2, 8), 0.7);
      if (style === 'minnan') cv.ln(rectD(x - 1, Ht - 16, pw + 2, 10), 0.7);
      if (style !== 'modern') {
        let dots = '';
        for (let j = 0; j < 6; j++) dots += `M${r2(x + 2 + R() * (pw - 4))} ${r2(gTop + 10 + R() * (Ht - gTop - 30))}h.01`;
        cv.raw(`<path class="fl" d="${dots}" stroke="#A79A88" stroke-width="1" stroke-linecap="round" fill="none"/>`);
      }
    }

    /* 腰線與簷口 */
    cv.part('cornice');
    for (let i = 1; i < f.floors; i++) {
      const y = floorTop(i - 1);
      if (style === 'modern') continue;
      cv.fl(rectD(-3, y - 4, W + 6, 6), WALL.trim).ln(rectD(-3, y - 4, W + 6, 6), 0.9);
    }
    if (style !== 'wayo') {
      const cy = P;
      cv.fl(rectD(-5, cy, W + 10, 7), WALL.trim).ln(rectD(-5, cy, W + 10, 7), 1);
      if (style === 'western') {
        let d = '';
        for (let x = -2; x < W + 4; x += 4.5) d += `M${r2(x)} ${cy + 7}v3`;
        cv.ln(d + `M-3 ${cy + 10}H${W + 3}`, 0.6);
      }
    }

    /* 上層窗 */
    cv.part('window');
    for (let i = 1; i < f.floors; i++) {
      const top = floorTop(i), bottom = floorTop(i - 1) - 4;
      const fh = bottom - top;
      if (style === 'modern') {
        // 水平帶窗＋遮陽板
        const wy = top + 16, wh = fh - 26;
        cv.fl(rectD(8, wy, W - 16, wh), before ? mixHex(WALL.glass, '#8C8172', 0.4) : WALL.glass).ln(rectD(8, wy, W - 16, wh), 0.9);
        let d = '';
        const panes = n * 2;
        for (let k = 1; k < panes; k++) d += `M${r2(8 + (W - 16) * k / panes)} ${r2(wy)}V${r2(wy + wh)}`;
        cv.ln(d + `M8 ${r2(wy + wh * 0.32)}H${W - 8}`, 0.6);
        cv.fl(rectD(-6, wy - 7, W + 12, 4), WALL.trim).ln(rectD(-6, wy - 7, W + 12, 4), 1);
        continue;
      }
      for (let k = 0; k < n; k++) {
        const o = open(k);
        const ww = Math.min(o.w * 0.58, 30), wx = o.x + (o.w - ww) / 2;
        const wh = fh * 0.62, wy = top + (fh - wh) * 0.6;
        if (style === 'western') {
          const d = archD(wx, wy + ww / 2, ww, wy + wh);
          cv.fl(d + 'Z', before && k === 0 ? '#9C8F7E' : WALL.glass).ln(d + 'Z', 0.9).ln(archD(wx - 3, wy + ww / 2, ww + 6, wy + ww / 2 + 0.01), 0.6);
          cv.ln(`M${r2(wx + ww / 2)} ${r2(wy)}V${r2(wy + wh)}M${r2(wx)} ${r2(wy + ww / 2 + 4)}H${r2(wx + ww)}`, 0.55);
          cv.fl(rectD(wx - 4, wy + wh, ww + 8, 3), WALL.trim).ln(rectD(wx - 4, wy + wh, ww + 8, 3), 0.7);
        } else if (style === 'minnan') {
          cv.fl(rectD(wx - 3, wy - 3, ww + 6, wh + 6), WALL.trim).ln(rectD(wx - 3, wy - 3, ww + 6, wh + 6), 0.8);
          cv.fl(rectD(wx, wy, ww, wh), '#9C7A5E').ln(rectD(wx, wy, ww, wh), 0.8).ln(hatch(wx, wy, ww, wh, 3.2), 0.4).ln(`M${r2(wx + ww / 2)} ${r2(wy)}V${r2(wy + wh)}`, 0.7);
        } else {
          cv.fl(rectD(wx, wy, ww, wh), WALL.glass).ln(rectD(wx, wy, ww, wh), 0.9);
          cv.ln(hatch(wx, wy, ww, wh, wh / 3) + hatch(wx, wy, ww, wh, ww / 2, false), 0.55);
          cv.fl(rectD(wx - 3, wy - 4, ww + 6, 3), WALL.trim).ln(rectD(wx - 3, wy - 4, ww + 6, 3), 0.7);
        }
      }
    }

    /* 陽台欄杆（洋樓二樓） */
    if (style === 'western') {
      cv.part('balcony');
      const bottom = floorTop(0) - 4;
      const by = bottom - 13;
      const ks = n === 5 ? [1, 2, 3] : [1];
      ks.forEach(k => { const o = open(k); balustrade(cv, o.x - 2, o.x + o.w + 2, by, bottom); });
      if (f.floors === 3) {
        const bottom2 = floorTop(1) - 4;
        [0, n - 1].forEach(k => { const o = open(k); balustrade(cv, o.x + 3, o.x + o.w - 3, bottom2 - 11, bottom2); });
      }
    }

    /* 花磚 */
    cv.part('tiles');
    if (style === 'western') {
      tilePanel(cv, pid, pw + 4, P + 13, W - pw * 2 - 8, ts);
      for (let i = 1; i < f.floors; i++) {
        const top = floorTop(i), bottom = floorTop(i - 1) - 4;
        for (let k = 0; k <= n; k++) tilePanel(cv, pid, pierX(k) + 0.5, top + (bottom - top) / 2 - ts, pw - 1, ts * 2);
      }
    } else if (style === 'minnan') {
      tilePanel(cv, pid, pw + 2, P + 10, W - pw * 2 - 4, ts);
      const top = floorTop(1);
      for (let k = 0; k < n; k++) {
        const o = open(k), ww = Math.min(o.w * 0.58, 30);
        tilePanel(cv, pid, o.x + (o.w - ww) / 2 - 3, top + 8, ww + 6, ts);
      }
    } else if (style === 'wayo') {
      tilePanel(cv, pid, 6, P + 4, W - 12, ts);
    } else {
      // 現代主義：花格磚取代花磚，做在一側的樓梯間
      cv.part('grille');
      const gx = W - bw + 6, gTop2 = floorTop(f.floors - 1) + 6;
      cv.fl(rectD(gx, gTop2, bw - 18, floorTop(0) - gTop2 - 2), `url(#${pid}g)`).ln(rectD(gx, gTop2, bw - 18, floorTop(0) - gTop2 - 2), 0.9);
    }

    /* 屋頂、女兒牆、山頭 */
    const cx = W / 2;
    if (style === 'western') {
      cv.part('parapet');
      const top = P - 26;
      const gw = Math.max(86, bw * 1.5);
      balustrade(cv, 0, cx - gw / 2, top, P);
      balustrade(cv, cx + gw / 2, W, top, P);
      for (let k = 0; k <= n; k++) {
        if (n === 5 && (k === 2 || k === 3)) continue;
        if (n === 3 && (k === 1 || k === 2) && gw > bw) continue;
        const x = pierX(k);
        cv.fl(rectD(x - 1, top - 6, pw + 2, P - top + 6), WALL.trim).ln(rectD(x - 1, top - 6, pw + 2, P - top + 6), 0.9);
        cv.ln(circD(x + pw / 2, top - 10, 3.6), 0.8);
      }
      cv.part('gable');
      const L = cx - gw / 2, Rr = cx + gw / 2, B = P, sh = top + 2, rr = Math.min(gw / 2 - 12, sh - 6);
      const g = `M${r2(L)} ${B}V${r2(sh + 6)}Q${r2(L)} ${r2(sh - 2)} ${r2(L + 9)} ${r2(sh - 2)}H${r2(cx - rr)}A${r2(rr)} ${r2(rr)} 0 0 1 ${r2(cx + rr)} ${r2(sh - 2)}H${r2(Rr - 9)}Q${r2(Rr)} ${r2(sh - 2)} ${r2(Rr)} ${r2(sh + 6)}V${B}Z`;
      cv.fl(g, before ? mixHex(WALL.trim, '#A79A88', 0.3) : WALL.trim).ln(g, 1.1);
      cv.ln(circD(L + 9, sh + 3, 3.2) + circD(Rr - 9, sh + 3, 3.2), 0.7);
      const plW = Math.min(46, gw - 30);
      cv.fl(rectD(cx - plW / 2, sh + 4, plW, 15), before ? '#D9CDBA' : '#FBF7EE').ln(rectD(cx - plW / 2, sh + 4, plW, 15), 0.8).ln(rectD(cx - plW / 2 + 2, sh + 6, plW - 4, 11), 0.4);
      cv.text(cx, sh + 15.6, f.plaque || h.name.slice(0, 2), 9.5, ` font-family="'Noto Serif TC',serif" font-weight="700" letter-spacing="2"`);
      cv.text(cx, sh - 8, String(h.year), 7.5, ` font-family="'Playfair Display',serif" font-style="italic" font-weight="600"`);
      cv.part('tiles');
      tilePanel(cv, pid, cx - rr + 10, sh - 2 - 24 + 4, 9, 9);
      tilePanel(cv, pid, cx + rr - 19, sh - 2 - 24 + 4, 9, 9);
    } else if (style === 'minnan') {
      cv.part('parapet');
      const top = 18;
      cv.fl(rectD(0, top, W, P - top), wallFill).ln(rectD(0, top, W, P - top), 1);
      cv.fl(rectD(-3, top - 3, W + 6, 4), WALL.trim).ln(rectD(-3, top - 3, W + 6, 4), 0.8);
      cv.part('tiles');
      const pnlW = (W - 92) / 2 - 10;
      if (pnlW > 14) { tilePanel(cv, pid, 8, top + 9, pnlW, ts * 2); tilePanel(cv, pid, W - 8 - pnlW, top + 9, pnlW, ts * 2); }
      cv.part('gable');
      const gw = 86, L = cx - gw / 2, Rr = cx + gw / 2;
      const g = `M${r2(L)} ${top}C${r2(L + 6)} ${top} ${r2(L + 4)} ${top - 10} ${r2(L + 14)} ${top - 10}C${r2(L + 22)} ${top - 10} ${r2(cx - 20)} 0 ${cx} 0C${r2(cx + 20)} 0 ${r2(Rr - 22)} ${top - 10} ${r2(Rr - 14)} ${top - 10}C${r2(Rr - 4)} ${top - 10} ${r2(Rr - 6)} ${top} ${r2(Rr)} ${top}Z`;
      cv.fl(g, wallFill).ln(g, 1.1);
      cv.fl(rectD(cx - 17, top - 4, 34, 22), before ? '#D9CDBA' : '#FBF7EE').ln(rectD(cx - 17, top - 4, 34, 22), 0.9).ln(rectD(cx - 14.5, top - 1.5, 29, 17), 0.4);
      cv.text(cx, top + 11.4, f.plaque || h.name.slice(0, 1), (f.plaque || '').length > 1 ? 10 : 12, ` font-family="'Noto Serif TC',serif" font-weight="900" letter-spacing="1"`);
      if (f.sign) {
        cv.part('sign');
        const sy = floorTop(0) - 17;
        cv.fl(rectD(cx - 34, sy, 68, 12), before ? '#B9AC98' : '#2A1F1A').ln(rectD(cx - 34, sy, 68, 12), 0.8);
        cv.raw(`<text class="fl" x="${cx}" y="${r2(sy + 9)}" text-anchor="middle" font-size="8" font-family="'Noto Serif TC',serif" font-weight="700" letter-spacing="3" fill="${before ? '#5E5246' : '#F6EEDC'}" stroke="none">${App.esc(f.sign)}</text>`);
      }
    } else if (style === 'wayo') {
      cv.part('roof');
      const eave = P, ridge = 10;
      const roof = `M-12 ${eave}L${r2(W * 0.16)} ${ridge}H${r2(W * 0.84)}L${W + 12} ${eave}Z`;
      cv.fl(roof, before ? '#8E8A84' : '#5B5550').ln(roof, 1.1);
      let tiles = '';
      for (let x = W * 0.16 + 4; x < W * 0.84; x += 5) {
        const t = (x - W * 0.16) / (W * 0.68);
        tiles += `M${r2(x)} ${ridge}L${r2(-12 + t * (W + 24))} ${eave}`;
      }
      cv.raw(`<path class="fl" d="${tiles}" stroke="#7D766F" stroke-width=".6" fill="none"/>`);
      cv.fl(rectD(W * 0.16 - 4, ridge - 4, W * 0.68 + 8, 5), '#3F3A36').ln(rectD(W * 0.16 - 4, ridge - 4, W * 0.68 + 8, 5), 0.8);
      cv.ln(circD(W * 0.16 - 4, ridge - 3, 4.5) + circD(W * 0.84 + 4, ridge - 3, 4.5), 0.8);
      cv.fl(rectD(-14, eave - 1, W + 28, 4), '#3F3A36').ln(rectD(-14, eave - 1, W + 28, 4), 0.9);
      cv.part('gable');
      const gw = Math.min(70, W * 0.36);
      const gab = `M${r2(cx - gw / 2)} ${eave}L${cx} ${ridge + 6}L${r2(cx + gw / 2)} ${eave}Z`;
      cv.fl(gab, WALL.trim).ln(gab, 1).ln(`M${r2(cx - gw / 2 - 4)} ${eave + 1}L${cx} ${ridge + 3}L${r2(cx + gw / 2 + 4)} ${eave + 1}`, 1.2);
      cv.ln(circD(cx, eave - 14, 6), 0.8).ln(`M${cx} ${eave - 20}V${eave - 8}M${cx - 6} ${eave - 14}H${cx + 6}`, 0.5);
    } else {
      cv.part('parapet');
      cv.fl(rectD(-8, P - 6, W + 16, 6), WALL.trim).ln(rectD(-8, P - 6, W + 16, 6), 1.1);
      cv.fl(rectD(0, 6, W, P - 12), wallFill).ln(rectD(0, 6, W, P - 12), 0.9);
      cv.part('canopy');
      const cy = floorTop(0) + 2;
      cv.fl(rectD(-10, cy, W + 20, 5), WALL.trim).ln(rectD(-10, cy, W + 20, 5), 1.1);
      if (f.sign) {
        cv.part('fin');
        const fx = 10, fw = 15, fy = 2, fh2 = Math.min(f.sign.length * 15 + 10, floorTop(0) - 10);
        cv.fl(rectD(fx, fy, fw, fh2), before ? '#C9BFAE' : '#B5443A').ln(rectD(fx, fy, fw, fh2), 1);
        const chars = [...f.sign];
        chars.forEach((ch, j) => cv.raw(`<text class="fl" x="${fx + fw / 2}" y="${r2(fy + 15 + j * 15)}" text-anchor="middle" font-size="10" font-family="'Noto Sans TC',sans-serif" font-weight="700" fill="${before ? '#6F6457' : '#FBF7EE'}" stroke="none">${App.esc(ch)}</text>`));
      }
    }

    /* 修復前：鐵皮、招牌、冷氣、裂縫、缺磚、雜草、電線 */
    let damage = '';
    if (before) {
      const g = floorTop(0);
      let corr = '';
      for (let x = -8; x < W + 8; x += 3) corr += `M${r2(x)} ${r2(g - 2)}L${r2(x + 2)} ${r2(g + 14)}`;
      damage += `<g data-part="damage"><path class="fl" d="M-10 ${r2(g - 3)}H${W + 10}L${W + 14} ${r2(g + 15)}H-14Z" fill="#B7B2A9" stroke="${INK}" stroke-width=".8"/>`;
      damage += `<path class="fl" d="${corr}" stroke="#8D877E" stroke-width=".5" fill="none"/>`;
      if (f.floors >= 2) {
        const t1 = floorTop(1);
        const sx = W * (0.08 + R() * 0.1), sw = W * 0.48;
        damage += `<rect class="fl" x="${r2(sx)}" y="${r2(t1 + 10)}" width="${r2(sw)}" height="22" fill="#E8E2D6" stroke="${INK}" stroke-width=".8"/>`;
        damage += `<text class="fl" x="${r2(sx + sw / 2)}" y="${r2(t1 + 25)}" text-anchor="middle" font-size="9.5" font-family="'Noto Sans TC',sans-serif" font-weight="700" fill="#B5443A" stroke="none">冷氣 · 水電 · 修理</text>`;
        const ax = W * 0.68, ay = floorTop(0) - 26;
        damage += `<rect class="fl" x="${r2(ax)}" y="${r2(ay)}" width="24" height="15" fill="#D9D5CD" stroke="${INK}" stroke-width=".8"/><circle class="fl" cx="${r2(ax + 8)}" cy="${r2(ay + 7.5)}" r="5" fill="none" stroke="${INK}" stroke-width=".6"/>`;
      }
      // 缺磚：對齊 pattern 格線，在花磚面板內蓋上水泥補丁
      cv.panels.forEach(pn => {
        const cols = Math.floor(pn.w / ts), rows = Math.max(1, Math.floor(pn.h / ts));
        const miss = Math.max(1, Math.round(cols * rows * 0.3));
        for (let k = 0; k < miss; k++) {
          const x = clamp(Math.ceil(pn.x / ts) * ts + Math.floor(R() * cols) * ts, pn.x, pn.x + pn.w - ts);
          const y = clamp(Math.ceil(pn.y / ts) * ts + Math.floor(R() * rows) * ts, pn.y, pn.y + pn.h - ts);
          damage += `<rect class="fl" x="${r2(x)}" y="${r2(y)}" width="${ts}" height="${ts}" fill="#C9BEAD"/>`;
        }
      });
      let crack = '';
      for (let c = 0; c < 3; c++) {
        let x = W * (0.2 + R() * 0.6), y = P + 10 + R() * 30;
        crack += `M${r2(x)} ${r2(y)}`;
        for (let s = 0; s < 6; s++) { x += (R() - 0.5) * 8; y += 4 + R() * 5; crack += `L${r2(x)} ${r2(y)}`; }
      }
      damage += `<path class="fl" d="${crack}" stroke="#4A3C33" stroke-width=".7" fill="none"/>`;
      let weeds = '';
      for (let k = 0; k < 4; k++) {
        const x = 8 + R() * (W - 16), y = style === 'wayo' ? P - 2 : (style === 'western' ? P - 26 : style === 'minnan' ? 15 : P - 6);
        weeds += `<path class="fl" d="M${r2(x)} ${r2(y)}q-5 -8 -9 -9q6 0 9 6q1 -9 6 -12q-3 6 -2 12q4 -4 9 -4q-6 3 -8 7z" fill="#6E8B4E" stroke="#3E5530" stroke-width=".4"/>`;
      }
      damage += weeds;
      damage += `<path class="fl" d="M-14 ${r2(floorTop(0) - 8)}Q${r2(W * 0.3)} ${r2(floorTop(0) + 4)} ${r2(W * 0.55)} ${r2(floorTop(0) - 6)}T${W + 14} ${r2(floorTop(0) - 10)}M-14 ${r2(floorTop(0) - 3)}Q${r2(W / 2)} ${r2(floorTop(0) + 10)} ${W + 14} ${r2(floorTop(0) - 2)}" stroke="${INK}" stroke-width=".7" fill="none"/>`;
      damage += `<rect class="fl" x="0" y="${P}" width="${W}" height="${Ht - P}" fill="#5A4636" opacity=".09"/></g>`;
    }

    const ground = `<g data-part="ground"><path class="ln" d="M-40 ${Ht}H${W + 40}" pathLength="1" style="--i:0" stroke-width="1.4"/></g>`;
    return { W, H: Ht, body: defs + cv.render() + damage + ground };
  }

  /* house 可以是 id 或 house 物件；frame:'fixed' 讓所有立面用同一個比例尺（名錄卡片並排時高低真實） */
  App.facade.svg = (src, { state = 'after', frame = 'fixed', lw = 1, cls = '', draw = false, title } = {}) => {
    const h = typeof src === 'string' ? App.house(src) : src;
    const fd = drawFacade(h, state);
    let vb;
    if (frame === 'fixed') {
      const FW = 300, FH = 312;
      vb = `${r2(-(FW - fd.W) / 2)} ${r2(fd.H + 8 - FH)} ${FW} ${FH}`;
    } else {
      vb = `-24 -8 ${fd.W + 48} ${fd.H + 16}`;
    }
    const label = title || `${h.name}立面線稿（${state === 'before' ? '修復前' : '現況'}）`;
    return `<svg class="facade ${cls}${draw ? ' draw-ready' : ''}" viewBox="${vb}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${App.esc(label)}">` +
      `<g fill="none" stroke="${INK}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round" font-family="'Noto Serif TC',serif">${fd.body}</g></svg>`;
  };
  App.facade.size = src => { const fd = drawFacade(typeof src === 'string' ? App.house(src) : src, 'after'); return { w: fd.W, h: fd.H }; };
  App.facade.group = (src, state = 'after') => drawFacade(typeof src === 'string' ? App.house(src) : src, state);

  /* ---------- 5. 地圖 ---------- */
  const STREETS = [
    { name: '會館街', d: 'M30 198C300 186 640 176 970 166', label: [520, 168, -1.6] },
    { name: '米市街', d: 'M20 340C320 334 660 352 980 342', label: [470, 330, 0.5] },
    { name: '布埕街', d: 'M40 474C330 482 620 480 960 462', label: [560, 470, -0.6] },
    { name: '舊碼頭路', d: 'M10 554C320 566 640 568 990 548', label: [470, 555, 0.4] },
    { name: '糖行街', d: 'M252 40C260 200 246 400 262 556', label: [244, 86, 88] },
    { name: '打鐵巷', d: 'M522 70C514 220 530 380 516 552', label: [512, 250, 89], narrow: true },
    { name: '茶棧街', d: 'M772 30C780 220 764 400 782 552', label: [764, 360, 90] },
    { name: '竹仔巷', d: 'M96 40C140 100 196 150 252 196', label: [150, 92, 46], narrow: true },
  ];
  const bez = (d, t) => {
    const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
    const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
    const u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
    const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
    const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
    return { x, y, a: Math.atan2(dy, dx) * 180 / Math.PI };
  };
  let mapCache = null;
  App.map = {
    streets: STREETS,
    svg() {
      if (mapCache) return mapCache;
      const R = rng('chenggang-old-town');
      let lots = '';
      // 沿街兩側排出一格格地籍（店屋面寬窄、進深長），只是底紋，所以用確定性亂數
      STREETS.forEach(s => {
        const steps = s.narrow ? 26 : 44;
        for (let i = 1; i < steps; i++) {
          const p = bez(s.d, i / steps);
          [-1, 1].forEach(side => {
            if (R() < 0.12) return;
            const w = 14 + R() * 8, dep = 22 + R() * 14, off = (s.narrow ? 9 : 12) + 1;
            lots += `<rect x="${r2(-w / 2)}" y="${r2(side > 0 ? off : -off - dep)}" width="${r2(w)}" height="${r2(dep)}" transform="translate(${r2(p.x)} ${r2(p.y)}) rotate(${r2(p.a)})"/>`;
          });
        }
      });
      let waves = '';
      for (let k = 0; k < 7; k++) waves += `<path d="M${30 + k * 140} ${606 + (k % 2) * 10}q14 -5 28 0t28 0" />`;
      const casing = STREETS.map(s => `<path d="${s.d}" stroke-width="${s.narrow ? 13 : 19}"/>`).join('');
      const fillSt = STREETS.map(s => `<path d="${s.d}" stroke-width="${s.narrow ? 10 : 16}"/>`).join('');
      const labels = STREETS.map(s => `<text transform="translate(${s.label[0]} ${s.label[1]}) rotate(${s.label[2]})" text-anchor="middle">${s.name}</text>`).join('');
      const compass = `<g transform="translate(930 74)"><svg x="-30" y="-30" width="60" height="60" viewBox="0 0 120 120">${tileBody(Object.assign({}, TILE_DEFAULTS, { fold: 8, palette: 'cobalt', heart: 'star', ring: 'beads', corner: 'none', petal: 'spike' }), PALETTES[0])}</svg><text y="-38" text-anchor="middle" class="map__n">N</text></g>`;
      mapCache = `<svg class="map__svg" viewBox="0 0 1000 640" aria-hidden="true" focusable="false">
        <rect width="1000" height="640" fill="#EFE5CF"/>
        <path d="M0 586C260 600 520 612 1000 584V640H0Z" fill="#CFE1DA"/>
        <g fill="none" stroke="#1F6E6A" stroke-width="1.2" stroke-linecap="round" opacity=".45">${waves}</g>
        <g fill="#E3D3B4" stroke="#CDB894" stroke-width=".8">${lots}</g>
        <rect x="536" y="262" width="80" height="64" fill="#F6EEDC" stroke="#CDB894" stroke-dasharray="3 3"/>
        <g fill="none" stroke="#9A866B" stroke-linecap="round">${casing}</g>
        <g fill="none" stroke="#FBF7EE" stroke-linecap="round">${fillSt}</g>
        <g class="map__labels" font-family="'Noto Serif TC',serif" font-size="15" font-weight="700" fill="#4E3F36" letter-spacing="4">${labels}</g>
        <g font-family="'Noto Serif TC',serif" font-size="13" fill="#1F6E6A" letter-spacing="6"><text x="120" y="626">澄　溪</text><text x="860" y="618">舊碼頭 →</text></g>
        <g font-family="'Noto Sans TC',sans-serif" font-size="11" fill="#75614F"><text x="576" y="298" text-anchor="middle">公會堂前廣場</text><text x="24" y="228">舊城門</text><text x="980" y="200" text-anchor="end">往港埕區 →</text><text x="560" y="24">↑ 往北岸區</text></g>
        <g stroke="#2A1F1A" stroke-width="1.4" fill="#F6EEDC"><path d="M20 186h22v-14h-22z"/><path d="M24 172v-6h14v6"/></g>
        ${compass}
      </svg>`;
      return mapCache;
    },
    mount(el, { houses = App.data.houses, active = null, onSelect = null, labels = true } = {}) {
      el.classList.add('map');
      el.innerHTML = App.map.svg() + '<div class="map__pins"></div>';
      const layer = el.querySelector('.map__pins');
      layer.innerHTML = houses.map(h => `<button type="button" class="map__pin map__pin--${h.status}${labels ? '' : ' map__pin--nolabel'}" data-id="${h.id}" style="left:${h.map.x / 10}%;top:${h.map.y / 6.4}%" aria-label="${App.esc(`${h.name}，${h.year} 年，${App.data.styles[h.style].name}，${App.data.statuses[h.status].name}`)}" aria-pressed="false"><span class="map__gem" aria-hidden="true"></span><span class="map__label" aria-hidden="true">${App.esc(h.name)}</span></button>`).join('');
      const api = {
        el,
        setActive(id) {
          layer.querySelectorAll('.map__pin').forEach(b => {
            const on = b.dataset.id === id;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', String(on));
          });
        },
        filter(fn) {
          layer.querySelectorAll('.map__pin').forEach(b => { b.hidden = !fn(App.house(b.dataset.id)); });
        },
      };
      layer.addEventListener('click', e => {
        const b = e.target.closest('.map__pin');
        if (!b) return;
        api.setActive(b.dataset.id);
        if (onSelect) onSelect(App.house(b.dataset.id), b);
      });
      if (active) api.setActive(active);
      return api;
    },
  };

  /* ---------- 6. 共用卡片 HTML ---------- */
  App.styleTagHTML = key => `<span class="style-tag style-tag--${key}">${App.data.styles[key].name}</span>`;
  App.statusHTML = key => `<span class="status status--${key}">${App.data.statuses[key].name}</span>`;
  App.houseCardHTML = (h, { draw = true } = {}) => `
    <article class="house-card" data-id="${h.id}" id="${h.id}"${draw ? ' data-draw' : ''}>
      <div class="house-card__art">${App.facade.svg(h, { draw })}<span class="house-card__no">${h.id}</span></div>
      <div class="house-card__body">
        <p class="house-card__year"><span class="latin">${h.year}</span>${App.styleTagHTML(h.style)}${App.statusHTML(h.status)}</p>
        <h3 class="house-card__name"><a href="${App.houseURL(h)}">${App.esc(h.name)}</a></h3>
        <p class="house-card__addr">${App.icon('pin')}${App.esc(h.street + ' ' + h.no)}</p>
        <p class="house-card__sum">${App.esc(h.summary)}</p>
        ${h.status === 'restoring' ? `<div class="meter" role="img" aria-label="修復進度 ${h.progress}%"><span class="meter__bar" style="--v:${h.progress}%"></span></div><p class="house-card__meta">修復進度 ${h.progress}%</p>` : ''}
      </div>
    </article>`;
  App.tileCardHTML = t => `
    <a class="tile-card" href="${App.tileURL(t.id)}" data-id="${t.id}" id="${t.id}">
      <span class="tile-card__art tile-box">${App.tile.svg(t.opts)}</span>
      <span class="tile-card__meta"><span class="tile-card__no latin">${t.id.replace('MJ-', 'No. ')}</span><span class="tile-card__cat">${App.tile.cats[t.cat].name}</span></span>
      <span class="tile-card__name">${App.esc(t.name)}</span>
    </a>`;

  /* ---------- 7. Toast 與 Modal ---------- */
  const toastHost = document.createElement('div');
  toastHost.className = 'toasts';
  toastHost.setAttribute('role', 'status');
  toastHost.setAttribute('aria-live', 'polite');
  const openDialogs = [];
  const placeToasts = () => {
    const top = openDialogs[openDialogs.length - 1];
    const parent = top || document.body;
    if (toastHost.parentNode !== parent) parent.appendChild(toastHost);
  };
  App.toast = (msg, { tone = 'ink', title = '', timeout = 3600 } = {}) => {
    placeToasts();
    const t = document.createElement('div');
    t.className = `toast toast--${tone}`;
    t.innerHTML = `<span class="toast__mark" aria-hidden="true"></span><div class="toast__text">${title ? `<strong>${App.esc(title)}</strong>` : ''}<span>${App.esc(msg)}</span></div>` +
      `<button type="button" class="toast__close" aria-label="關閉通知">${App.icon('close')}</button>`;
    toastHost.appendChild(t);
    const remove = () => {
      if (!t.isConnected) return;
      t.classList.add('is-leaving');
      setTimeout(() => t.remove(), App.reducedMotion ? 0 : 260);
    };
    t.querySelector('.toast__close').addEventListener('click', remove);
    setTimeout(remove, timeout);
    while (toastHost.children.length > 4) toastHost.firstElementChild.remove();
    return t;
  };

  App.modal = {
    open(d) {
      const dlg = typeof d === 'string' ? document.getElementById(d) : d;
      if (!dlg || dlg.open) return dlg;
      dlg.showModal();
      openDialogs.push(dlg);
      placeToasts();
      document.documentElement.classList.add('has-modal');
      return dlg;
    },
    close(d) {
      const dlg = d ? (typeof d === 'string' ? document.getElementById(d) : d) : openDialogs[openDialogs.length - 1];
      if (dlg && dlg.open) dlg.close();
    },
  };
  function bindDialog(dlg) {
    if (dlg.dataset.bound) return;
    dlg.dataset.bound = '1';
    dlg.addEventListener('close', () => {
      const i = openDialogs.indexOf(dlg);
      if (i > -1) openDialogs.splice(i, 1);
      placeToasts();
      if (!openDialogs.length) document.documentElement.classList.remove('has-modal');
    });
    // 點到 dialog 本身（即 ::backdrop 區域）才關，點內容不關
    dlg.addEventListener('click', e => { if (e.target === dlg) App.modal.close(dlg); });
  }
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { e.preventDefault(); App.modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { e.preventDefault(); App.modal.close(closer.closest('dialog')); }
  });

  /* ---------- 8. 表單 ---------- */
  App.valid = {
    required: v => String(v).trim().length > 0,
    phone: v => /^09\d{2}-?\d{3}-?\d{3}$/.test(String(v).trim()),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()),
    int: (v, min, max) => /^\d+$/.test(String(v).trim()) && +v >= min && +v <= max,
  };
  App.field = {
    setError(input, msg) {
      const field = input.closest('.field');
      if (!field) return;
      let err = field.querySelector('.field__error');
      if (!err) {
        err = document.createElement('p');
        err.className = 'field__error';
        err.id = uid('err');
        field.appendChild(err);
      }
      field.classList.toggle('is-invalid', !!msg);
      err.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const ids = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      if (msg) ids.add(err.id); else ids.delete(err.id);
      if (ids.size) input.setAttribute('aria-describedby', [...ids].join(' ')); else input.removeAttribute('aria-describedby');
    },
    clear(form) {
      form.querySelectorAll('.field.is-invalid').forEach(f => f.classList.remove('is-invalid'));
      form.querySelectorAll('.field__error').forEach(e => { e.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach(i => i.setAttribute('aria-invalid', 'false'));
    },
  };

  /* ---------- 9. 小元件 ---------- */
  App.tabs = list => {
    if (list.dataset.ready) return;
    list.dataset.ready = '1';
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: document.getElementById(tab.getAttribute('aria-controls')), index: tabs.indexOf(tab) } }));
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

  App.chips = group => {
    if (group.dataset.ready) return;
    group.dataset.ready = '1';
    const single = group.dataset.chips !== 'multi';
    group.addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b || !group.contains(b)) return;
      if (single) group.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
      else b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      const values = [...group.querySelectorAll('.chip[aria-pressed="true"]')].map(c => c.dataset.value);
      group.dispatchEvent(new CustomEvent('chipchange', { detail: { values, button: b } }));
    });
  };

  App.stepper = el => {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    const input = el.querySelector('input');
    // 上下限每次現讀：頁面會依剩餘名額改 input.max，不能在初始化時就寫死
    const min = () => +(input.min || 0), max = () => +(input.max || 99);
    const paintButtons = () => {
      el.querySelector('[data-step="-1"]').disabled = +input.value <= min();
      el.querySelector('[data-step="1"]').disabled = +input.value >= max();
    };
    const set = v => {
      input.value = clamp(v, min(), max());
      paintButtons();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (b) set((+input.value || 0) + +b.dataset.step);
    });
    input.addEventListener('blur', () => set(Math.round(+input.value || min())));
    paintButtons();
  };

  App.dualRange = el => {
    if (el.dataset.ready) return el.api;
    el.dataset.ready = '1';
    const lo = el.querySelector('[data-min]'), hi = el.querySelector('[data-max]');
    const min = +lo.min, max = +lo.max;
    const sync = src => {
      // 兩個把手不能交錯：動到哪一個就把它卡在另一個前面
      if (+lo.value > +hi.value) { if (src === lo) lo.value = hi.value; else hi.value = lo.value; }
      el.style.setProperty('--a', ((lo.value - min) / (max - min) * 100) + '%');
      el.style.setProperty('--b', ((hi.value - min) / (max - min) * 100) + '%');
      el.dispatchEvent(new CustomEvent('rangechange', { detail: { min: +lo.value, max: +hi.value } }));
    };
    lo.addEventListener('input', () => sync(lo));
    hi.addEventListener('input', () => sync(hi));
    sync(lo);
    el.api = { set(a, b) { lo.value = a; hi.value = b; sync(lo); } };
    return el.api;
  };

  App.compare = el => {
    if (el.dataset.ready) return;
    el.dataset.ready = '1';
    const range = el.querySelector('.compare__range');
    const set = v => { el.style.setProperty('--pos', clamp(+v, 0, 100) + '%'); };
    range.addEventListener('input', () => { el.classList.add('is-touched'); set(range.value); });
    el.setPos = v => { range.value = v; set(v); };
    set(range.value);
    // 第一次進入視窗時把手來回掃一次，提示可以拖曳
    if (!App.reducedMotion && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const keys = [[0, 50], [700, 76], [1500, 28], [2200, 50]];
        const t0 = performance.now();
        const stop = App.animate(el, () => {
          if (el.classList.contains('is-touched')) { stop(); return; }
          const t = performance.now() - t0;
          if (t >= 2200) { el.setPos(50); stop(); return; }
          let k = 0;
          while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
          const [ta, va] = keys[k], [tb, vb] = keys[k + 1];
          const u = (t - ta) / (tb - ta), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          el.setPos(va + (vb - va) * e);
        });
      }, { threshold: 0.5 });
      io.observe(el);
    }
  };

  /* ---------- 10. 動態 ---------- */
  App.animate = (el, fn) => {
    let visible = false, raf = 0, last = 0, stopped = false;
    const loop = t => {
      raf = 0;
      if (stopped || !visible || document.hidden || App.reducedMotion) return;
      fn(t, last ? Math.min(64, t - last) : 16);
      last = t;
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && visible && !document.hidden && !stopped && !App.reducedMotion) { last = 0; raf = requestAnimationFrame(loop); } };
    const io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; kick(); });
    io.observe(el);
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);
    return function stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  };

  /* 線稿描繪：draw-ready（藏）→ draw-run（描）→ draw-done（移除虛線，避免接縫） */
  App.draw = el => {
    const svgs = el.matches('svg.facade, svg[data-drawable]') ? [el] : [...el.querySelectorAll('svg.facade, svg[data-drawable]')];
    svgs.forEach(svg => {
      if (svg.classList.contains('draw-run') || svg.classList.contains('draw-done')) return;
      if (App.reducedMotion) { svg.classList.remove('draw-ready'); svg.classList.add('draw-done'); return; }
      svg.classList.add('draw-ready');
      void svg.getBoundingClientRect();
      svg.classList.replace('draw-ready', 'draw-run');
      // 多棟並排時各棟以 --lag 錯開，data-draw-lag 標出最大延遲，確保收尾計時涵蓋最後一棟
      const count = svg.querySelectorAll('.ln').length;
      const total = Math.min(count, 160) * 9 + 1400 + 1000 + (+svg.dataset.drawLag || 0);
      setTimeout(() => { svg.classList.remove('draw-run'); svg.classList.add('draw-done'); }, total);
    });
  };

  let revealIO = null;
  const pendingReveal = new Set();
  const revealNow = el => {
    pendingReveal.delete(el);
    if (revealIO) revealIO.unobserve(el);
    if (el.hasAttribute('data-reveal')) el.classList.add('is-in');
    if (el.hasAttribute('data-draw')) App.draw(el);
    if (el.hasAttribute('data-count') && !el.dataset.counted) countUp(el);
  };
  function setupReveal(root) {
    const els = [...root.querySelectorAll('[data-reveal], [data-draw], [data-count]')].filter(el => !el.dataset.watch);
    if (root.matches && root.matches('[data-reveal], [data-draw], [data-count]') && !root.dataset.watch) els.push(root);
    if (!els.length) return;
    if (!revealIO) {
      revealIO = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) revealNow(en.target); }), { rootMargin: '0px 0px -6% 0px' });
    }
    const vh = innerHeight;
    els.forEach(el => {
      el.dataset.watch = '1';
      if (el.hasAttribute('data-draw') && !App.reducedMotion) el.querySelectorAll('svg.facade, svg[data-drawable]').forEach(s => s.classList.add('draw-ready'));
      const r = el.getBoundingClientRect();
      // 首次載入就在視窗內：進場元素直接顯示（不閃一下），線稿與數字照常播放
      if (r.top < vh && r.bottom > 0 && r.width > 0) {
        if (el.hasAttribute('data-reveal')) el.classList.add('is-in', 'is-instant');
        revealNow(el);
        return;
      }
      pendingReveal.add(el);
      revealIO.observe(el);
    });
  }
  // 保底：錨點跳轉跳過的元素（已在視窗上方）也要顯示
  let revealTick = 0;
  addEventListener('scroll', () => {
    if (revealTick || !pendingReveal.size) return;
    revealTick = requestAnimationFrame(() => {
      revealTick = 0;
      pendingReveal.forEach(el => { if (el.getBoundingClientRect().top < innerHeight) revealNow(el); });
    });
  }, { passive: true });
  addEventListener('beforeprint', () => pendingReveal.forEach(revealNow));

  function countUp(el) {
    el.dataset.counted = '1';
    const target = +el.dataset.count, dec = +(el.dataset.decimals || 0), suffix = el.dataset.suffix || '';
    const fmt = v => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + suffix;
    if (App.reducedMotion) { el.textContent = fmt(target); return; }
    const t0 = performance.now(), dur = 1400;
    const step = t => {
      // 每格重新讀 data-count，數值在動畫途中被更新也會收斂到最新值
      const goal = +el.dataset.count;
      const u = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - u, 3);
      el.textContent = fmt(goal * e);
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /* 更新 data-count 數字：已播過動畫的直接改值 */
  App.setCount = (el, n) => {
    el.dataset.count = n;
    if (el.dataset.counted) el.textContent = (+n).toLocaleString('en-US') + (el.dataset.suffix || '');
  };

  /* ---------- 11. 招牌：花磚牆 ---------- */
  App.wall = {
    mount(el, opts = {}) {
      const o = Object.assign({ cols: 6, rows: 5, tiles: App.tile.catalog.map(t => t.id), order: 'diagonal', idle: true, pointer: true, stagger: 55 }, opts);
      // 每次載入都是不同的一面牆，不需要可重現的種子
      const R = Math.random;
      let slots = [], timer = 0, visible = true, raf = 0, destroyed = false, deck = [];
      const freshDeck = () => {
        const a = o.tiles.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
      };
      // 像發牌：一副洗好的花磚依序發完才換下一副，並避開相鄰同款。
      // 若照目錄順序循環，格數多於款數時會出現「整排重複」，一眼就看得出是程式排的
      const draw = avoid => {
        if (!deck.length) deck = freshDeck();
        let k = deck.findIndex(id => !avoid.includes(id));
        if (k < 0) { deck = deck.concat(freshDeck()); k = deck.findIndex(id => !avoid.includes(id)); }
        return deck.splice(Math.max(k, 0), 1)[0];
      };
      const neighbours = i => {
        const c = i % dims.cols, out = [];
        if (c > 0) out.push(i - 1);
        if (c < dims.cols - 1) out.push(i + 1);
        out.push(i - dims.cols, i + dims.cols, i);
        return out.map(k => slots[k] && slots[k].id).filter(Boolean);
      };
      const faceHTML = id => App.tile.svg(App.tile.get(id).opts);
      const layout = () => ({ cols: typeof o.cols === 'function' ? o.cols() : o.cols, rows: typeof o.rows === 'function' ? o.rows() : o.rows });
      let dims = layout();

      function build(animate) {
        el.classList.add('wall');
        el.style.setProperty('--cols', dims.cols);
        el.style.setProperty('--rows', dims.rows);
        const count = dims.cols * dims.rows;
        const html = [];
        slots = [];
        deck = [];
        for (let i = 0; i < count; i++) {
          const r = Math.floor(i / dims.cols), c = i % dims.cols;
          const order = o.order === 'diagonal' ? r + c : o.order === 'row' ? i : R() * (dims.cols + dims.rows);
          const id = draw(neighbours(i));
          slots.push({ id, flips: 0, rot: 0, target: 0 });
          html.push(`<div class="wall__slot"><div class="wall__tile" style="--d:${Math.round(order * o.stagger + R() * 40)}ms"><div class="wall__face wall__face--a">${faceHTML(id)}</div><div class="wall__face wall__face--b">${App.tile.back()}</div></div></div>`);
        }
        el.innerHTML = html.join('');
        if (animate && !App.reducedMotion) {
          el.classList.add('is-laying');
          const total = (dims.cols + dims.rows) * o.stagger + 1200;
          setTimeout(() => { el.classList.remove('is-laying'); el.classList.add('is-laid'); }, total);
        } else {
          el.classList.add('is-laid');
        }
      }

      function flip(i, next) {
        const slot = slots[i];
        const tileEl = el.children[i] && el.children[i].firstElementChild;
        if (!slot || !tileEl || el.classList.contains('is-laying')) return;
        const id = next || draw(neighbours(i));
        slot.flips++;
        slot.id = id;
        // 換到「背面」那張臉上，再整片翻過來
        const face = tileEl.querySelector(slot.flips % 2 ? '.wall__face--b' : '.wall__face--a');
        face.innerHTML = faceHTML(id);
        tileEl.style.transform = `rotateY(${slot.flips * 180}deg)`;
      }

      function shuffle() {
        if (el.classList.contains('is-laying')) return;
        slots.forEach((_, i) => {
          const r = Math.floor(i / dims.cols), c = i % dims.cols;
          setTimeout(() => flip(i), App.reducedMotion ? 0 : (r + c) * 60);
        });
      }

      const io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; });
      io.observe(el);
      // 閒置時偶爾翻一片：只在看得到、分頁在前景時進行
      if (o.idle) {
        timer = setInterval(() => {
          if (!visible || document.hidden || App.reducedMotion || !el.classList.contains('is-laid')) return;
          flip(Math.floor(R() * slots.length));
        }, 2600);
      }
      el.addEventListener('click', e => {
        const slot = e.target.closest('.wall__slot');
        if (slot) flip([...el.children].indexOf(slot));
      });

      // 滑鼠靠近時，花磚中央主花朝游標方向微轉；同時更新釉面反光位置
      const pointer = { x: 0, y: 0, in: false };
      const tick = () => {
        raf = 0;
        if (destroyed || !visible || document.hidden) return;
        const rect = el.getBoundingClientRect();
        const cw = rect.width / dims.cols, ch = rect.height / dims.rows;
        let moving = false;
        slots.forEach((s, i) => {
          const r = Math.floor(i / dims.cols), c = i % dims.cols;
          if (pointer.in) {
            const dx = pointer.x - (rect.left + (c + 0.5) * cw), dy = pointer.y - (rect.top + (r + 0.5) * ch);
            const dist = Math.hypot(dx, dy);
            s.target = Math.exp(-dist / 280) * 28 * (dx / (Math.abs(dx) + Math.abs(dy) + 40));
          } else s.target = 0;
          const next = s.rot + (s.target - s.rot) * 0.12;
          if (Math.abs(next - s.rot) > 0.02) moving = true;
          s.rot = next;
          el.children[i].style.setProperty('--rot', r2(s.rot) + 'deg');
        });
        if (moving || pointer.in) raf = requestAnimationFrame(tick);
      };
      const onMove = e => {
        if (App.reducedMotion || !visible) return;
        const rect = el.getBoundingClientRect();
        pointer.x = e.clientX; pointer.y = e.clientY;
        pointer.in = e.clientY > rect.top - 200 && e.clientY < rect.bottom + 200 && e.clientX > rect.left - 300 && e.clientX < rect.right + 200;
        el.style.setProperty('--mx', r2((e.clientX - rect.left) / rect.width * 100) + '%');
        el.style.setProperty('--my', r2((e.clientY - rect.top) / rect.height * 100) + '%');
        if (!raf) raf = requestAnimationFrame(tick);
      };
      if (o.pointer && finePointer.matches) {
        addEventListener('pointermove', onMove, { passive: true });
        el.addEventListener('pointerleave', () => { pointer.in = false; if (!raf) raf = requestAnimationFrame(tick); });
      }
      let resizeT = 0;
      const onResize = () => {
        clearTimeout(resizeT);
        resizeT = setTimeout(() => {
          const d = layout();
          if (d.cols !== dims.cols || d.rows !== dims.rows) { dims = d; build(false); }
        }, 200);
      };
      addEventListener('resize', onResize);

      build(true);
      return {
        shuffle, flip,
        get slots() { return slots.map(s => s.id); },
        destroy() {
          destroyed = true;
          clearInterval(timer);
          io.disconnect();
          removeEventListener('pointermove', onMove);
          removeEventListener('resize', onResize);
        },
      };
    },
  };

  /* ---------- 12. 外殼：導覽、頁首、電子報 ---------- */
  function setupShell() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.site-nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').split('#')[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.getElementById('site-nav');
    if (toggle && nav && header) {
      const setOpen = open => {
        header.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      };
      toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
      nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
      matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    }
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 24);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    document.querySelectorAll('[data-brand-mark]').forEach(el => {
      el.innerHTML = App.tile.svg({ fold: 8, palette: 'brick', heart: 'rosette', ring: 'beads', petal: 'almond', corner: 'quarter' });
    });
  }

  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-newsletter]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    if (!App.valid.email(input.value)) {
      App.field.setError(input, '請輸入有效的電子郵件，例如 name@example.com');
      input.focus();
      return;
    }
    App.field.setError(input, '');
    App.toast(`已訂閱，每月第一個週五寄到 ${input.value.trim()}`, { title: '街區通訊訂閱成功', tone: 'green' });
    form.reset();
  });

  /* ---------- 13. scan ---------- */
  App.scan = (root = document) => {
    root.querySelectorAll('[data-tile]').forEach(el => {
      if (el.dataset.tileReady) return;
      const t = App.tile.get(el.dataset.tile);
      if (!t) return;
      el.dataset.tileReady = '1';
      el.innerHTML = App.tile.svg(t.opts);
    });
    root.querySelectorAll('[data-facade]').forEach(el => {
      if (el.dataset.facadeReady) return;
      el.dataset.facadeReady = '1';
      el.innerHTML = App.facade.svg(el.dataset.facade, { state: el.dataset.state || 'after', frame: el.dataset.frame || 'fixed' });
    });
    root.querySelectorAll('dialog').forEach(bindDialog);
    root.querySelectorAll('[data-tabs]').forEach(App.tabs);
    root.querySelectorAll('[data-chips]').forEach(App.chips);
    root.querySelectorAll('[data-stepper]').forEach(App.stepper);
    root.querySelectorAll('[data-dual-range]').forEach(App.dualRange);
    root.querySelectorAll('[data-compare]').forEach(App.compare);
    setupReveal(root);
  };

  document.documentElement.classList.add('js');
  setupShell();
  App.scan(document);
})();
