/* ==========================================================================
   澄港市 雲嶺森林遊樂區 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面 </body> 前的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     app.js 執行時會先 App.scan(document) 初始化所有宣告式元件；頁面用 innerHTML 動態插入的內容，
     插完後請呼叫 App.scan(容器)（重複呼叫安全，已初始化的元素會略過）。

   資料（全站單一來源，數字、人名、價格一律從這裡取）
     App.TODAY = '2026-10-23'（週五）  App.now() 故事時鐘：從 10:40 起跟著真實經過時間走
     App.data.park        園區基本資料（名稱、地址、電話、開放時間、海拔）
     App.data.today       今日狀態（天氣、氣溫逐時、人流指數逐時、停車場、日出日落）
     App.data.seasons     四季 {spring,summer,autumn,winter}：名稱、標語、期間、推薦步道 picks、活動
     App.data.trails      10 條步道（id、難度 diff、km、min、climb、status、profile 海拔取樣、route 地圖路徑）
                          霧林古道 id='mist' 另有 pois（沿途景點，km 對齊 profile 取樣點）
     App.data.facilities  園區設施（地圖座標 x/y 在 1000×640 的地圖空間）
     App.data.tickets     票種與平日／假日票價     App.data.parkingFees 停車費
     App.data.notices     園區公告（cat: trail|event|service|ticket）
     App.data.shuttle     Y1 雲嶺幹線公車與園區接駁時刻
     App.trail(id)  App.trailURL(t)（mist → trail.html，其他 → trails.html#trail-<id>）
     App.slots(iso)       該日分時段容量 [{id,start,end,cap,booked,left,full,past}]
     App.isClosed(iso)    每月第二個週二休園維護   App.isHoliday(iso) 週六日   App.price(key, iso)
     App.label.diff / status / type / notice   中文標籤對照

   格式
     App.esc(str)  App.fmt.num(1234) → "1,234"  App.fmt.km(6.8) → "6.8"
     App.fmt.dur(190) → "3 小時 10 分"  App.fmt.durShort(190) → "3h10m"
     App.fmt.md('2026-10-23') → "10/23"  App.fmt.date(iso) → "10 月 23 日"  App.fmt.wd(iso) → "五"
     App.fmt.full(iso) → "2026 年 10 月 23 日（五）"  App.fmt.time(date) → "10:40"
     App.date(iso) → Date   App.iso(date) → 'YYYY-MM-DD'   App.addDays(iso, n)   App.daysBetween(a, b)
     App.icon(name, cls='i')  內嵌線條圖示 SVG 字串（名稱見 App.ICONS）
     靜態 markup 可寫 <span data-icon="clock" class="i--sm"></span>，App.scan 時換成 svg
     App.rng(seed)  可重現的亂數（seed 可為字串）

   季節
     App.season.get() / App.season.set(key) / App.season.current（='autumn'，2026 年 10 月）
     App.season.list = ['spring','summer','autumn','winter']   App.season.meta(key) = App.data.seasons[key]
     [data-season-btn="spring"] 任何按鈕都會自動切換季節並同步 aria-pressed
     切換時 <html data-season> 改變、加 .is-season-shifting，document 觸發 'seasonchange'
       （detail: {season, prev}）。選擇記在 sessionStorage，跨頁沿用。

   剪紙（全部顏色走 CSS 變數，季節切換自動換色）
     [data-papercut="hero|page|band"]（data-seed 換構圖）  App.papercut(el, preset, {seed})
       hero＝首頁大場景；page＝子頁頁首；band＝小型風景帶（入園證頭、卡片底部，最前層是 --card 色）
       產生多層 .scene__layer；外層有 [data-scene] 的話自動啟動視差（滑鼠＋捲動）、飛鳥
       [data-scene-copy]  放在 [data-scene] 內的文字，捲動時下沉淡出
     [data-cut-divider="seed"] style="--from:…; --to:…"  三層剪紙山形分隔
     [data-particles] canvas  依季節飄落：春櫻瓣、夏螢火、秋楓葉、冬雪
     App.svg.ridge / ridgePath / trees / roundTrees / cloud / mist / flower / circle / smooth
       自己組剪紙插畫用的產生器（ridge 回傳點陣列，其餘回傳 path d 字串；maple 回傳整個 <path> 元素）
     App.animator(el, frame)   只在 el 進入視窗、分頁可見、未要求減少動態時才跑的 rAF 迴圈（frame(t, dt)）
     [data-playzone]          離開視窗或分頁隱藏時加 .is-paused，暫停裡面所有 CSS 動畫
     共用 SVG 濾鏡（app.js 注入，任何 inline svg 都能用）：
       url(#pc-shadow) 紙層上緣陰影  url(#pc-lift) 抬起的紙片  url(#pc-glow) 光暈  url(#pc-layer) 剪紙層
       ⚠ 會動的元素不要放在有濾鏡的群組裡（每格都要重算濾鏡），濾鏡只給靜態的紙層

   圖表
     App.profile.geom(trail, {w,h,pad,minSpan}) → {x(km), y(ele), line, area, pts, lo, hi, eleAt(km)}
     App.profile.card(trail)   步道卡上方的剪紙高度剖面（含描線動畫）
     [data-profile="mist"]     自動放入一張小剖面
     App.trailCardHTML(trail, {note, id:true, level:3, reveal:''})  步道卡（首頁推薦與步道列表共用）
       id:true 時 article 帶 id="trail-<id>"（trails.html 的錨點）；插入後記得 App.scan(容器)
     App.map.render(svg, {trails:true|[ids], facilities:true|[types], labels:true})
       剪紙等高線園區地圖；步道 g.map__trail[data-trail]、設施 g.map__fac[data-facility] 只給滑鼠／觸控點選，
       互動（點選、is-active、.map.has-active 淡化其他步道）由頁面自行掛事件
       ⚠ 地圖元素不進 Tab 順序：頁面要提供對應的 HTML 按鈕（圖例、設施清單、設施 chip）給鍵盤與報讀器，
         避免同一組選項出現兩次 Tab 停點
       App.map.facIcon[type] 設施類型 → 圖示名稱（列表、圖例用同一套）

   UI
     App.toast(msg, {title, tone:'ok'|'info'|'warn', timeout})（modal 開著時自動移進 dialog，不會被蓋住）
     App.modal.open(idOrEl) / App.modal.close(idOrEl?)
       宣告式：[data-modal-open="dialogId"]、[data-modal-close]；點背景或 Esc 關閉
     App.tabs(tablist)        [data-tabs] 自動初始化，切換時 tablist 觸發 'tabchange'（detail: {tab, panel, index}）
     App.segmented(group)     [data-segmented]，按鈕 .seg__btn[data-value]，觸發 'segchange'（detail: {value}）
     App.stepper(el)          [data-stepper]，改值時 input 觸發 'input' 與 'change'
     App.tip.show(html, x, y) / App.tip.hide()   浮動提示（clientX/Y）
     App.field.setError(input, msg) / App.field.clear(form)
     App.valid.required / email / phone（台灣手機 09xxxxxxxx）/ idCard（身分證格式）
     App.countTo(el, value, {dur, fmt})  數字滾動（連續呼叫會接續目前顯示值，不會打架）

   動態（prefers-reduced-motion 時皆停用或直接顯示終態；App.reduced 為目前狀態）
     [data-reveal]  "" | fade | left | right | paper | scale ；style="--rd:120ms" 錯開
     元素被顯示時加 .is-in 並觸發 'reveal' 事件；App.reveal.show(el) 可手動顯示
   ========================================================================== */
(() => {
  'use strict';

  const App = (window.App = {});
  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, scope = doc) => scope.querySelector(sel);
  const $$ = (sel, scope = doc) => [...scope.querySelectorAll(sel)];
  App.$ = $;
  App.$$ = $$;
  root.classList.add('js');

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  App.reduced = motionQuery.matches;
  motionQuery.addEventListener('change', e => {
    App.reduced = e.matches;
    doc.dispatchEvent(new CustomEvent('motionchange', { detail: { reduced: e.matches } }));
  });


  /* ------------------------------------------------------------------
     1. 工具
     ------------------------------------------------------------------ */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  App.esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const r1 = v => Math.round(v * 10) / 10;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  App.clamp = clamp;

  const hashStr = s => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  // mulberry32：同一個 seed 每次都畫出同一座山，換頁、換季都不會「跳」
  App.rng = seed => {
    let a = typeof seed === 'number' ? seed >>> 0 : hashStr(String(seed));
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const pad2 = n => String(n).padStart(2, '0');
  App.date = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  App.iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  App.addDays = (iso, n) => {
    const d = App.date(iso);
    d.setDate(d.getDate() + n);
    return App.iso(d);
  };
  App.daysBetween = (a, b) => Math.round((App.date(b) - App.date(a)) / 864e5);

  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  App.fmt = {
    num: n => Number(n).toLocaleString('en-US'),
    km: n => Number(n).toFixed(1),
    dur: min => {
      const h = Math.floor(min / 60), m = min % 60;
      return h ? `${h} 小時${m ? ` ${m} 分` : ''}` : `${m} 分鐘`;
    },
    durShort: min => {
      const h = Math.floor(min / 60), m = min % 60;
      return h ? `${h}h${m ? pad2(m) + 'm' : ''}` : `${m}m`;
    },
    md: iso => { const d = App.date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; },
    date: iso => { const d = App.date(iso); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; },
    wd: iso => WD[App.date(iso).getDay()],
    full: iso => { const d = App.date(iso); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（${WD[d.getDay()]}）`; },
    time: d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };

  App.TODAY = '2026-10-23';
  const storyStart = new Date(2026, 9, 23, 10, 40, 0).getTime();
  const perfStart = performance.now();
  // 故事裡的「現在」：日期固定在 10/23，時間從 10:40 開始跟著真實時間走，讓「更新於」會前進
  App.now = () => new Date(storyStart + (performance.now() - perfStart));


  /* ------------------------------------------------------------------
     2. 資料
     ------------------------------------------------------------------ */
  App.label = {
    diff: { family: '親子', general: '一般', challenge: '挑戰' },
    diffNote: { family: '平緩、可推車，適合全家', general: '有連續上坡，需基本體力', challenge: '陡上與長距離，需登山經驗' },
    status: { open: '開放', partial: '部分開放', closed: '封閉' },
    type: { loop: '環線', oneway: '單程', return: '原路往返' },
    notice: { trail: '路況', event: '活動', service: '服務', ticket: '票務' },
  };

  App.data = {
    park: {
      name: '雲嶺森林遊樂區',
      en: 'Yunling Forest Recreation Area',
      org: '澄港市政府 雲嶺森林遊樂區管理所',
      address: '澄港市雲嶺區雲嶺路三段 88 號',
      phone: '(06) 5718-2026',
      emergency: '(06) 5718-2119',
      hours: '07:00–17:00',
      lastEntry: '16:00',
      eleMin: 620,
      eleMax: 1846,
      area: 9860,
    },

    today: {
      date: '2026-10-23',
      open: true,
      weather: { icon: 'cloud-sun', label: '多雲時晴', rain: 20, humidity: 82, wind: '東北風 2 級', cloudSea: 40 },
      // 06:00–18:00 逐時氣溫
      temp: { now: 14, low: 9, high: 17, feels: 12, hours: [9, 9, 10, 12, 13, 14, 15, 16, 17, 16, 15, 13, 12] },
      // 07:00–17:00 逐時人流指數（0–100）
      crowd: { now: 62, peak: '13:00–15:00', hours: [12, 24, 41, 62, 66, 72, 81, 79, 64, 38, 15] },
      parking: [
        { key: 'p1', name: 'P1 遊客中心', free: 38, total: 220 },
        { key: 'p2', name: 'P2 鏡湖', free: 112, total: 180 },
        { key: 'moto', name: '機車停車區', free: 46, total: 120 },
      ],
      entered: 1284,
      sun: { rise: '05:58', set: '17:23' },
    },

    seasons: {
      spring: {
        key: 'spring', short: '春', name: '春櫻', en: 'Spring', months: '3–4 月',
        tagline: '櫻色沿著稜線，<br>一層一層往上爬。',
        period: '2027 年 3 月 13 日 – 4 月 6 日', start: '2027-03-13', end: '2027-04-06',
        headline: '3,200 株山櫻，沿坡開成粉色的紙雕',
        body: '雲嶺的櫻花從海拔 800 公尺的櫻花坡開始，一路往上開到霧林古道的柳杉林邊。山櫻先開、吉野櫻接力，滿開期約在 3 月下旬。',
        spots: ['sakura', 'mist', 'lake'],
        events: [
          { date: '3/20–3/29', title: '夜櫻點燈', note: '櫻花坡 18:00–20:30，須預約夜間時段' },
          { date: '每週六日', title: '賞櫻專車', note: '山腳區轉乘站每 20 分鐘一班' },
          { date: '3/13 起', title: '櫻花季分時段入園', note: '假日每時段 600 人' },
        ],
        meter: null,
        picks: [
          { id: 'sakura', note: '3,200 株山櫻沿坡盛開，3 月下旬滿開。' },
          { id: 'ferns', note: '春雨後蕨葉新捲，帶孩子找「蕨芽」。' },
          { id: 'mist', note: '0.8K 柳杉林旁的山櫻，是古道最早開的一株。' },
          { id: 'lake', note: '湖面倒映櫻色，環湖平緩好推嬰兒車。' },
        ],
      },
      summer: {
        key: 'summer', short: '夏', name: '夏螢', en: 'Summer', months: '4–6 月',
        tagline: '螢火在溪谷裡，<br>一盞一盞亮起來。',
        period: '2027 年 4 月 18 日 – 6 月 14 日', start: '2027-04-18', end: '2027-06-14',
        headline: '螢溪的夜晚，比星空還亮',
        body: '每年 4 到 6 月，螢溪下游的黑翅螢在入夜後同步閃爍。夜間觀螢採預約制，步道燈光經過遮光設計，請勿使用手電筒與閃光燈。',
        spots: ['firefly', 'lake', 'ferns'],
        events: [
          { date: '每晚', title: '夜間觀螢導覽', note: '19:00–20:30，每晚限 120 人' },
          { date: '5/16', title: '螢火蟲生態講座', note: '自然教育中心，免費入場' },
          { date: '6/1 起', title: '溪谷避暑步道', note: '蕨谷步道加開午後導覽' },
        ],
        meter: null,
        picks: [
          { id: 'firefly', note: '4–6 月夜間觀螢，每晚限 120 人。' },
          { id: 'lake', note: '樹蔭覆蓋率 80%，夏天最涼的一條。' },
          { id: 'summit', note: '清晨出發，避開午後雷陣雨。' },
          { id: 'mist', note: '霧林最濃的季節，吊橋下溪水豐沛。' },
        ],
      },
      autumn: {
        key: 'autumn', short: '秋', name: '秋楓', en: 'Autumn', months: '10–12 月',
        tagline: '楓紅一層一層，<br>染上了山。',
        period: '2026 年 10 月 25 日 – 12 月 7 日', start: '2026-10-25', end: '2026-12-07',
        headline: '楓香由黃轉紅，整條林道像剪好的色紙',
        body: '楓香林道兩側是 1970 年代種下的楓香與青楓，10 月下旬開始轉色，11 月中旬最豔。秋楓季期間週末加開導覽，假日採分時段入園。',
        spots: ['maple', 'mist', 'cloudsea'],
        events: [
          { date: '每週六日', title: '楓林週末導覽', note: '09:30、14:00 兩梯，每梯 30 人' },
          { date: '10/15–12/31', title: '「紙上的山」剪紙特展', note: '遊客中心 2 樓展示室' },
          { date: '11/14', title: '雲嶺夜觀星空', note: '限額 80 人，11/1 起報名' },
        ],
        meter: { label: '楓紅進度', value: 35, note: '預估 11 月 12 日前後最豔' },
        picks: [
          { id: 'maple', note: '楓香 10 月下旬轉紅，11 月中最豔。' },
          { id: 'mist', note: '鐵杉林段青楓轉黃，石階鋪滿落葉。' },
          { id: 'cloudsea', note: '秋季晨間雲海機率約 40%。' },
          { id: 'ferns', note: '全程平緩，秋天的落葉最好撿。' },
        ],
      },
      winter: {
        key: 'winter', short: '冬', name: '冬雲海', en: 'Winter', months: '12–2 月',
        tagline: '雲海漫過山腰，<br>只剩稜線浮在上面。',
        period: '2026 年 12 月 – 2027 年 2 月', start: '2026-12-01', end: '2027-02-28',
        headline: '日出前三十分鐘，雲海最滿',
        body: '東北季風帶來的水氣在山腰凝成雲海，冬季平均出現機率 62%。雲海觀景台與望雲亭是最佳觀賞點，跨年元旦清晨提前開園。',
        spots: ['cloudsea', 'mist', 'summit'],
        events: [
          { date: '2027/1/1', title: '第一道曙光', note: '05:30 提前開園，須預約' },
          { date: '每週六', title: '雲海晨間導覽', note: '06:00 雲海觀景台集合' },
          { date: '12/20', title: '冬至湯圓與熱茶', note: '遊客中心前廣場' },
        ],
        meter: null,
        picks: [
          { id: 'cloudsea', note: '冬季雲海機率 62%，日出前最壯觀。' },
          { id: 'summit', note: '晴朗時可遠眺澄港海岸線。' },
          { id: 'mist', note: '望雲亭可看雲海漫過山腰。' },
          { id: 'lake', note: '清晨湖面起霧，偶見霧淞。' },
        ],
      },
    },

    // profile：沿步道等距取樣的海拔（m），第一點在起點、最後一點在終點
    // route：在 1000×640 地圖空間的路徑
    trails: [
      {
        id: 'mist', name: '霧林古道', en: 'Mist Forest Old Trail', diff: 'general', km: 6.8, min: 190, type: 'oneway',
        status: 'open', statusNote: '全線開放 · 3.6K 霧林吊橋單次限 10 人',
        from: '雲嶺遊客中心', to: '望雲亭', tags: ['古道', '吊橋', '雲海', '森林浴'], best: ['spring', 'summer', 'autumn', 'winter'],
        desc: '清末挑茶人走出來的石階路，穿過柳杉林、跨過螢溪上游的吊橋，一路爬進終年起霧的鐵杉林，終點望雲亭可眺整片雲海。',
        profile: [780, 806, 838, 866, 898, 934, 952, 984, 1022, 986, 1030, 1078, 1112, 1140, 1176, 1204, 1236, 1262],
        route: 'M300,505 C335,470 385,425 430,392 C468,366 495,338 515,325 C548,304 585,284 605,262 C620,246 630,236 640,228',
        pois: [
          { km: 0, name: '霧林古道登山口', type: 'start', desc: '位於遊客中心後方，入口有步道志工站，可借登山杖。' },
          { km: 0.8, name: '柳杉林隧道', type: 'forest', desc: '1960 年代造林的柳杉，樹冠在頭頂合攏成一條綠色隧道。' },
          { km: 2.0, name: '古道茶亭遺址', type: 'history', desc: '清末挑茶人歇腳的石砌茶亭，僅存地基與一口石井。' },
          { km: 3.6, name: '霧林吊橋', type: 'bridge', desc: '橫跨螢溪上游，長 64 公尺，單次限 10 人通行。' },
          { km: 4.8, name: '鐵杉林觀景台', type: 'view', desc: '海拔 1,100 公尺以上的鐵杉純林，秋季青楓轉黃。' },
          { km: 6.0, name: '苔蘚石階', type: 'forest', desc: '終年雲霧滋養的苔蘚步道，雨後濕滑請放慢腳步。' },
          { km: 6.8, name: '望雲亭', type: 'end', desc: '古道終點，東望雲海與雲嶺主峰，日出前後最美。' },
        ],
      },
      {
        id: 'ferns', name: '蕨谷親子步道', en: 'Fern Valley Loop', diff: 'family', km: 1.6, min: 50, type: 'loop',
        status: 'open', statusNote: '全線開放 · 嬰兒車可通行',
        from: '蕨谷入口', to: '蕨谷入口', tags: ['蕨類', '親水', '無障礙'], best: ['spring', 'summer', 'autumn'],
        desc: '沿溪谷繞一圈的平緩木棧道，筆筒樹與各種蕨類貼著步道生長，全程無階梯，嬰兒車與輪椅可通行。',
        profile: [760, 768, 778, 786, 781, 772, 766, 762, 760],
        route: 'M405,520 C410,495 460,492 470,515 C480,540 450,565 425,556 C410,550 402,535 405,520Z',
      },
      {
        id: 'lake', name: '鏡湖環湖步道', en: 'Mirror Lake Circuit', diff: 'family', km: 2.4, min: 60, type: 'loop',
        status: 'open', statusNote: '全線開放',
        from: '鏡湖停車場', to: '鏡湖停車場', tags: ['湖景', '賞鳥', '無障礙'], best: ['spring', 'summer', 'winter'],
        desc: '繞鏡湖一圈的碎石步道，湖面倒映四季山色；沿途 6 座觀景平台與水鳥解說牌。',
        profile: [742, 746, 751, 745, 749, 754, 748, 745, 742],
        route: 'M135,397 C135,352 297,352 297,397 C297,442 135,442 135,397Z',
      },
      {
        id: 'maple', name: '楓香林道', en: 'Sweetgum Forest Road', diff: 'general', km: 3.9, min: 110, type: 'oneway',
        status: 'open', statusNote: '全線開放 · 楓紅約 35%',
        from: '楓香林道口', to: '雲嶺登山口', tags: ['楓紅', '森林浴'], best: ['autumn'],
        desc: '從楓香林道口緩升到雲嶺登山口，兩側是 1970 年代種下的楓香與青楓，秋天整條路由黃轉紅。',
        profile: [790, 806, 828, 842, 860, 884, 902, 918, 930, 948, 962, 976, 992, 1010],
        route: 'M470,452 C505,432 540,420 575,405 C610,392 650,380 690,368',
      },
      {
        id: 'firefly', name: '螢溪步道', en: 'Firefly Creek Path', diff: 'family', km: 1.2, min: 40, type: 'oneway',
        status: 'open', statusNote: '日間開放 · 夜間觀螢季已結束',
        from: '螢溪橋', to: '鏡湖出水口', tags: ['螢火蟲', '夜間', '親水'], best: ['summer'],
        desc: '沿螢溪下游的夜間友善步道，地面燈光經過遮光設計；4–6 月是觀螢季，夜間須預約。',
        profile: [700, 704, 709, 714, 719, 725, 730],
        route: 'M42,505 C62,494 82,480 98,468 C116,452 136,434 158,418',
      },
      {
        id: 'ridge', name: '雲嶺稜線步道', en: 'Yunling Ridge Traverse', diff: 'challenge', km: 9.6, min: 330, type: 'oneway',
        status: 'partial', statusNote: '2.1K–3.4K 崩塌，改走林道替代路線（+0.6 km）',
        from: '雲海觀景台', to: '北峰', tags: ['稜線', '展望'], best: ['autumn', 'winter'],
        desc: '沿雲嶺東稜走到北峰的縱走路線，視野開闊、風大，部分路段需拉繩，請結伴並於 10:00 前出發。',
        profile: [1180, 1236, 1302, 1360, 1412, 1398, 1456, 1520, 1574, 1548, 1590, 1632, 1608, 1650, 1684, 1670, 1702],
        route: 'M815,262 C790,232 770,202 745,172 C722,146 690,118 660,100 C640,90 625,84 610,80',
      },
      {
        id: 'summit', name: '雲嶺主峰步道', en: 'Yunling Summit Trail', diff: 'challenge', km: 7.2, min: 290, type: 'oneway',
        status: 'open', statusNote: '全線開放 · 13:00 後請勿上行',
        from: '雲嶺登山口', to: '雲嶺主峰', tags: ['登頂', '展望', '日出'], best: ['summer', 'autumn', 'winter'],
        desc: '直上雲嶺主峰 1,846 公尺的經典路線，連續陡上，天氣好時能看見澄港的海岸線。',
        profile: [1010, 1088, 1170, 1242, 1318, 1390, 1452, 1530, 1596, 1660, 1728, 1790, 1846],
        route: 'M708,372 C760,360 800,332 830,284 C852,246 868,170 885,118',
      },
      {
        id: 'sakura', name: '櫻花坡步道', en: 'Cherry Slope Loop', diff: 'family', km: 1.8, min: 55, type: 'loop',
        status: 'open', statusNote: '全線開放',
        from: '櫻花坡廣場', to: '櫻花坡廣場', tags: ['賞櫻', '親子'], best: ['spring'],
        desc: '園區最早開花的山坡，種有 3,200 株山櫻與吉野櫻；平緩環線，步行約一小時。',
        profile: [800, 822, 846, 860, 842, 818, 800],
        route: 'M150,555 C150,528 200,522 208,548 C216,576 170,588 156,574 C151,569 150,562 150,555Z',
      },
      {
        id: 'cedar', name: '神木巡禮步道', en: 'Old Cypress Trail', diff: 'general', km: 4.8, min: 140, type: 'return',
        status: 'closed', statusNote: '颱風倒木整修中，預計 11/15 重新開放',
        from: '神木步道口', to: '雲嶺老爺', tags: ['巨木', '森林浴'], best: ['summer', 'autumn'],
        desc: '探訪樹齡約 1,800 年的紅檜「雲嶺老爺」，林下陰涼，原路往返。',
        profile: [920, 948, 972, 990, 1012, 1036, 1050, 1036, 1012, 990, 972, 948, 920],
        route: 'M585,432 C610,455 640,470 665,486 C688,500 708,505 728,500',
      },
      {
        id: 'cloudsea', name: '雲海觀景步道', en: 'Sea of Clouds Path', diff: 'general', km: 3.2, min: 100, type: 'oneway',
        status: 'open', statusNote: '全線開放 · 觀景台 05:30 起開放',
        from: '雲嶺登山口', to: '雲海觀景台', tags: ['雲海', '日出', '展望'], best: ['autumn', 'winter'],
        desc: '從雲嶺登山口緩坡上行到雲海觀景台，是看雲海與日出最省力的一條路線。',
        profile: [1010, 1046, 1082, 1110, 1136, 1150, 1164, 1172, 1180],
        route: 'M700,372 C722,350 742,330 762,308 C780,290 798,274 815,262',
      },
    ],

    facilities: [
      { id: 'gate', type: 'entrance', name: '入口收費站', x: 72, y: 606, hours: '06:30–16:00', desc: '購票、驗票與預約入園 QR Code 報到；在地居民請出示澄港市民卡。' },
      { id: 'vc', type: 'visitor', name: '雲嶺遊客中心', x: 300, y: 505, hours: '07:00–17:00', desc: '服務台、步道諮詢、急救站、哺乳室；2 樓「紙上的山」剪紙特展。' },
      { id: 'p1', type: 'parking', name: 'P1 遊客中心停車場', x: 352, y: 530, hours: '24 小時', desc: '小型車 220 格、機車 120 格，假日 10:00 前常滿。' },
      { id: 'p2', type: 'parking', name: 'P2 鏡湖停車場', x: 262, y: 447, hours: '06:30–17:30', desc: '小型車 180 格；10/27–10/31 路面重鋪暫停開放。' },
      { id: 'food', type: 'food', name: '雲嶺食堂', x: 252, y: 532, hours: '10:30–15:30', desc: '山蔬便當、愛玉與熱茶；週二公休。' },
      { id: 'shuttle-vc', type: 'shuttle', name: '接駁車・遊客中心站', x: 340, y: 478, hours: '07:30–16:30', desc: '園區環線接駁起點，每 30 分鐘一班，單程 20 元。' },
      { id: 'shuttle-lake', type: 'shuttle', name: '接駁車・鏡湖站', x: 214, y: 456, hours: '07:40–16:40', desc: '鏡湖環湖步道與螢溪步道最近的站。' },
      { id: 'shuttle-trailhead', type: 'shuttle', name: '接駁車・登山口站', x: 676, y: 398, hours: '08:00–17:00', desc: '雲嶺主峰、雲海觀景與楓香林道的共同起訖站。' },
      { id: 'wc-lake', type: 'toilet', name: '鏡湖廁所', x: 150, y: 372, hours: '全天', desc: '含無障礙廁所與親子廁所。' },
      { id: 'wc-bridge', type: 'toilet', name: '吊橋前廁所', x: 492, y: 352, hours: '全天', desc: '霧林古道 3.4K，古道沿線唯一一座廁所。' },
      { id: 'wc-trailhead', type: 'toilet', name: '登山口廁所', x: 740, y: 398, hours: '全天', desc: '含無障礙廁所，旁有飲水機。' },
      { id: 'aid', type: 'aid', name: '第二急救站', x: 724, y: 348, hours: '08:00–17:00', desc: '駐有救護技術員，備 AED 與高山症急救用品。' },
      { id: 'pavilion', type: 'view', name: '望雲亭', x: 640, y: 228, hours: '全天', desc: '霧林古道終點，東望雲海與雲嶺主峰。' },
      { id: 'deck', type: 'view', name: '雲海觀景台', x: 815, y: 262, hours: '05:30–17:00', desc: '雲海與日出的最佳觀景點，可容納 120 人。' },
      { id: 'bridge', type: 'bridge', name: '霧林吊橋', x: 515, y: 322, hours: '07:00–16:30', desc: '長 64 公尺，單次限 10 人通行，強風時封閉。' },
      { id: 'camp', type: 'camp', name: '雲嶺露營區', x: 528, y: 560, hours: '入營 14:00', desc: '24 個營位，需另行預約；備有炊事亭與熱水淋浴。' },
      { id: 'edu', type: 'edu', name: '自然教育中心', x: 452, y: 596, hours: '09:00–16:00', desc: '森林生態展示與預約制環境教育課程。' },
    ],

    tickets: [
      { key: 'adult', name: '全票', weekday: 150, holiday: 200, note: '18–64 歲' },
      { key: 'concession', name: '優待票', weekday: 80, holiday: 100, note: '學生、65 歲以上、身心障礙者及陪同者 1 名，須出示證件' },
      { key: 'local', name: '在地居民', weekday: 50, holiday: 50, note: '設籍澄港市，出示澄港市民卡' },
      { key: 'child', name: '兒童', weekday: 0, holiday: 0, note: '6 歲以下免費，須由成人陪同' },
    ],
    parkingFees: [
      { name: '小型車', fee: 100, unit: '次' },
      { name: '機車', fee: 20, unit: '次' },
      { name: '大客車', fee: 300, unit: '次' },
    ],

    notices: [
      { id: 'N261021', date: '2026-10-21', cat: 'trail', pinned: true, title: '神木巡禮步道颱風後整修，預計 11 月 15 日重新開放',
        body: '10 月 12 日颱風造成 1.2K–1.9K 多處倒木與邊坡滑落，目前由工務課進行倒木清除與護欄重建。施工期間步道全線封閉，請勿進入；想看巨木的遊客可改走霧林古道鐵杉林段。' },
      { id: 'N261020', date: '2026-10-20', cat: 'event', pinned: true, title: '2026 雲嶺秋楓季 10/25 開幕，週末加開楓林導覽',
        body: '秋楓季自 10 月 25 日至 12 月 7 日，每週六、日 09:30 與 14:00 於楓香林道口出發，每梯 30 人、全程約 2 小時，現場報名額滿為止。導覽免費，入園門票另計。' },
      { id: 'N261018', date: '2026-10-18', cat: 'trail', title: '雲嶺稜線步道 2.1K–3.4K 崩塌，請改走林道替代路線',
        body: '崩塌路段已設置圍籬與改道指標，替代路線沿舊林道繞行，總長增加約 0.6 公里、多 20 分鐘。請於 10:00 前出發，並確保 15:30 前下撤至雲海觀景台。' },
      { id: 'N261015', date: '2026-10-15', cat: 'service', title: '遊客中心 2 樓「紙上的山」剪紙特展開幕',
        body: '邀集 12 位剪紙創作者，以雲嶺的四季為題完成 48 件作品，展期至 12 月 31 日，每日 09:00–16:30 免費參觀。每週六 10:30 有剪紙體驗，每場 20 人。' },
      { id: 'N261012', date: '2026-10-12', cat: 'ticket', title: '11 月 1 日起，在地居民票須出示澄港市民卡',
        body: '為落實在地居民優惠，自 11 月 1 日起購買在地居民票（50 元）須出示澄港市民卡或戶籍證明；線上預約者於入口收費站驗證即可。' },
      { id: 'N261008', date: '2026-10-08', cat: 'service', title: 'P2 鏡湖停車場 10/27–10/31 路面重鋪，暫停開放',
        body: '施工期間請改停 P1 遊客中心停車場，或於山腳區雲嶺轉乘停車場搭乘接駁車。鏡湖環湖步道照常開放，可由遊客中心步行 12 分鐘抵達。' },
      { id: 'N261002', date: '2026-10-02', cat: 'event', title: '11 月 14 日「雲嶺夜觀星空」開放報名，限額 80 人',
        body: '由澄港天文協會志工帶領，於雲海觀景台認識秋季星空，18:30 集合、21:00 結束，需自備保暖衣物。11 月 1 日 10:00 起開放線上報名，每人每次限報 4 位。' },
      { id: 'N260926', date: '2026-09-26', cat: 'ticket', title: '秋楓季週末及連續假期實施分時段入園預約',
        body: '10 月 25 日至 12 月 7 日之週六、日，入園採分時段預約，每時段上限 600 人（15:00 時段 300 人）。平日不須預約，現場購票即可入園。' },
    ],

    shuttle: {
      bus: {
        name: 'Y1 雲嶺幹線', from: '澄港轉運站', to: '雲嶺遊客中心', minutes: 72, fare: 60,
        stops: ['澄港轉運站', '舊城區公所', '山腳區轉乘站', '溪洲橋', '雲嶺國小', '雲嶺遊客中心'],
        up: ['06:20', '07:00', '07:40', '08:20', '09:00', '09:40', '10:20', '11:00', '12:20', '13:40', '15:00'],
        down: ['08:40', '10:00', '11:20', '12:40', '13:20', '14:00', '14:40', '15:20', '16:00', '16:40', '17:20'],
      },
      park: { name: '園區環線接駁', interval: 30, first: '07:30', last: '16:30', fare: 20 },
      transfer: { name: '假日轉乘接駁', from: '山腳區雲嶺轉乘停車場', interval: 20, first: '07:30', last: '16:30', fare: 30 },
    },
  };

  // 由取樣海拔算出總爬升與最高最低點，避免卡片上的數字和剖面圖對不起來
  for (const t of App.data.trails) {
    let climb = 0;
    for (let i = 1; i < t.profile.length; i++) climb += Math.max(0, t.profile[i] - t.profile[i - 1]);
    t.climb = climb;
    t.eleMax = Math.max(...t.profile);
    t.eleMin = Math.min(...t.profile);
  }

  App.trail = id => App.data.trails.find(t => t.id === id);
  App.trailURL = t => (t.id === 'mist' ? 'trail.html' : `trails.html#trail-${t.id}`);
  App.isHoliday = iso => [0, 6].includes(App.date(iso).getDay());
  // 每月第二個週二休園維護
  App.isClosed = iso => {
    const d = App.date(iso);
    return d.getDay() === 2 && d.getDate() >= 8 && d.getDate() <= 14;
  };
  App.price = (key, iso) => {
    const t = App.data.tickets.find(x => x.key === key);
    return App.isHoliday(iso) ? t.holiday : t.weekday;
  };

  const SLOT_DEFS = [
    { id: '0700', start: '07:00', end: '09:00', cap: 600 },
    { id: '0900', start: '09:00', end: '11:00', cap: 600 },
    { id: '1100', start: '11:00', end: '13:00', cap: 600 },
    { id: '1300', start: '13:00', end: '15:00', cap: 600 },
    { id: '1500', start: '15:00', end: '16:00', cap: 300 },
  ];
  // 秋楓季開幕週末的熱門時段已額滿（首頁公告與預約頁要說同一件事）
  const FULL_SLOTS = { '2026-10-24': ['0900', '1100'], '2026-10-25': ['0900', '1100'], '2026-10-31': ['0900'], '2026-11-07': ['0900'] };
  App.slots = iso => {
    if (App.isClosed(iso)) return [];
    const rnd = App.rng('slots-' + iso);
    const ahead = App.daysBetween(App.TODAY, iso);
    const weekend = App.isHoliday(iso);
    const fest = iso >= '2026-10-25' && iso <= '2026-12-07';
    const base = weekend ? [.72, .94, .9, .7, .42] : [.26, .44, .4, .28, .12];
    const nowHM = App.fmt.time(App.now());
    return SLOT_DEFS.map((s, i) => {
      const ratio = clamp(base[i] * (fest && weekend ? 1.05 : 1) * Math.max(.3, 1 - ahead / 34) + (rnd() - .5) * .14, .02, .97);
      const full = (FULL_SLOTS[iso] || []).includes(s.id);
      const booked = full ? s.cap : Math.round(s.cap * ratio);
      return { ...s, booked, left: s.cap - booked, full, past: iso === App.TODAY && s.end <= nowHM };
    });
  };


  /* ------------------------------------------------------------------
     3. 季節
     ------------------------------------------------------------------ */
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const SEASON_KEY = 'yunling-season';
  let shiftTimer = 0;

  const storage = {
    // 停用儲存（隱私模式、封鎖網站資料）時讀寫會丟例外；季節只是「不跨頁記憶」，屬可接受的降級
    get() {
      try { return sessionStorage.getItem(SEASON_KEY); } catch (err) { return null; }
    },
    set(v) {
      try { sessionStorage.setItem(SEASON_KEY, v); } catch (err) { /* 同上：只影響跨頁記憶 */ }
    },
  };

  const syncSeasonButtons = () => {
    const s = root.dataset.season;
    $$('[data-season-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seasonBtn === s)));
  };

  App.season = {
    list: SEASONS,
    current: 'autumn',
    get: () => root.dataset.season,
    meta: key => App.data.seasons[key || root.dataset.season],
    set(key) {
      if (!SEASONS.includes(key)) throw new Error(`Unknown season: ${key}`);
      const prev = root.dataset.season;
      if (prev === key) return;
      root.dataset.season = key;
      // 重新觸發「一層層抽換」的動畫：先拿掉再加回
      root.classList.remove('is-season-shifting');
      void root.offsetWidth;
      root.classList.add('is-season-shifting');
      clearTimeout(shiftTimer);
      shiftTimer = setTimeout(() => root.classList.remove('is-season-shifting'), 2200);
      storage.set(key);
      syncSeasonButtons();
      doc.dispatchEvent(new CustomEvent('seasonchange', { detail: { season: key, prev } }));
    },
  };

  // 盡早套用上一頁選的季節，並關掉這一次的換色過場
  (() => {
    const saved = storage.get();
    if (!root.dataset.season) root.dataset.season = App.season.current;
    if (saved && SEASONS.includes(saved) && saved !== root.dataset.season) {
      root.classList.add('no-season-transition');
      root.dataset.season = saved;
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-season-transition')));
    }
  })();

  doc.addEventListener('click', e => {
    const btn = e.target.closest('[data-season-btn]');
    if (btn) App.season.set(btn.dataset.seasonBtn);
  });


  /* ------------------------------------------------------------------
     4. 圖示
     ------------------------------------------------------------------ */
  const petal = 'M12 12C9.8 10.6 9.4 7.8 10.6 5.6L12 6.6l1.4-1C14.6 7.8 14.2 10.6 12 12z';
  const ICONS = {
    'arrow-right': 'M5 12h14M13 6l6 6-6 6',
    'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
    'arrow-up-right': 'M7 17L17 7M8 7h9v9',
    'chevron-down': 'M6 9l6 6 6-6',
    'chevron-right': 'M9 6l6 6-6 6',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.2 4.2L19 7',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    menu: 'M4 7h16M4 12h16M4 17h16',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
    filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
    sort: 'M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5',
    clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2',
    calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
    pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7.4a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4z',
    distance: 'M5 18c4 0 3.5-6 7-6s3-6 7-6M5 16.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2zM19 4.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z',
    climb: 'M2 20l6.5-9.5 4 5.5 3-4L21 20M16 3v6M13.5 5.5L16 3l2.5 2.5',
    users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7zM2.5 20c.6-3.6 3.2-6 6.5-6s5.9 2.4 6.5 6M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.2c2 .7 3.2 2.8 3.5 5.8',
    car: 'M5 16v-4l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4M3.5 16h17M5 12h14M7 16v2.5M17 16v2.5',
    bus: 'M6 3h12a2 2 0 0 1 2 2v11H4V5a2 2 0 0 1 2-2zM4 11h16M7 16v3M17 16v3M8 6h8M8 13.5h.01M16 13.5h.01',
    parking: 'M5 3h14v18H5zM9.5 17V7h3.5a3 3 0 0 1 0 6H9.5',
    ticket: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zM14 6v2.5M14 10.8v2.4M14 15.5V18',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    cloud: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1A4.5 4.5 0 0 0 7 18z',
    'cloud-sun': 'M9 4.5V3M4.6 6.6L3.5 5.5M15.4 6.6l1.1-1.1M6.2 10.5a3.5 3.5 0 0 1 6.4-1.7M8 20h9a3.5 3.5 0 0 0 .5-7A5 5 0 0 0 8.4 12A4 4 0 0 0 8 20z',
    rain: 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 6.1A4.5 4.5 0 0 0 7 15zM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5',
    mist: 'M4 8h12M7 12h13M4 16h14M8 20h8',
    thermo: 'M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0zM12 10v6',
    drop: 'M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z',
    wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7',
    sunrise: 'M12 3v4M5.6 8.6L7 10M18.4 8.6L17 10M2 17h20M7 17a5 5 0 0 1 10 0M5 21h14',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    leaf: 'M5 19c0-8 5-14 15-15c-1 10-7 15-15 15zM5 19l8-8',
    maple: 'M12 2l1.6 3.6 2.6-1.2-.6 4 3.6-.8-1.4 3 3.2 1.4-3.8 2.6.8 2.2-4-.6L12 22l-2-5.8-4 .6.8-2.2L3 12l3.2-1.4-1.4-3 3.6.8-.6-4 2.6 1.2z',
    flower: `<path d="${petal}"/><path d="${petal}" transform="rotate(72 12 12)"/><path d="${petal}" transform="rotate(144 12 12)"/><path d="${petal}" transform="rotate(216 12 12)"/><path d="${petal}" transform="rotate(288 12 12)"/>`,
    firefly: 'M12 9.5a2 2 0 0 1 2 2V15a2 2 0 0 1-4 0v-3.5a2 2 0 0 1 2-2zM10.4 10.2L5.5 7.6a2.4 2.4 0 0 1 3.2-3.2l2.4 4.4M13.6 10.2l4.9-2.6a2.4 2.4 0 0 0-3.2-3.2l-2.4 4.4M12 19.5v1M8.5 19l-.8.8M15.5 19l.8.8',
    snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5',
    mountain: 'M2 20l7.5-12 4 6 2.5-3.5L22 20zM7.6 11l1.9 1.6 1.6-1.2',
    tree: 'M12 3l5 7h-3l4 6h-5v5h-2v-5H6l4-6H7z',
    bridge: 'M3 15h18M3 15c3-5 15-5 18 0M6 15v-2.4M10 15v-3.6M14 15v-3.6M18 15v-2.4M3 19h18',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z',
    toilet: 'M7 6.5a1.75 1.75 0 1 0 0-3.5a1.75 1.75 0 1 0 0 3.5zM17 6.5a1.75 1.75 0 1 0 0-3.5a1.75 1.75 0 1 0 0 3.5zM5 9h4l.5 6H8v6H6v-6H4.5zM17 9l3 7h-2v5h-2v-5h-2zM12 3v18',
    food: 'M3 11h18a9 9 0 0 1-18 0zM8 7.5c0-1.5 1-2 1-3.5M12 7.5c0-1.5 1-2 1-3.5M16 7.5c0-1.5 1-2 1-3.5',
    aid: 'M4 6h16v13H4zM12 9v7M8.5 12.5h7M9 6V4h6v2',
    info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v6M12 7.5h.01',
    alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
    home: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6',
    tent: 'M3 20L12 4l9 16zM9 20l3-6 3 6',
    view: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    pavilion: 'M3 9l9-5 9 5zM6 9l-.5 1.5h13L18 9M7 10.5V20M17 10.5V20M4 20h16',
    book: 'M4 5c3-1 5-1 8 1c3-2 5-2 8-1v13c-3-1-5-1-8 1c-3-2-5-2-8-1zM12 6v13',
    loop: 'M17 8a7 7 0 1 0 1.5 6M17 3v5h-5',
    oneway: 'M4 12h14M14 7l5 5-5 5',
    return: 'M4 9h14M15 6l3 3-3 3M20 15H6M9 12l-3 3 3 3',
    bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
    mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
    route: 'M6 17a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM18 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM6 17V9a3 3 0 0 1 6 0v6a3 3 0 0 0 6 0V7',
    boot: 'M6 3h5v7l6.5 2.6A3.5 3.5 0 0 1 20 16v2H4V5a2 2 0 0 1 2-2zM4 21h16M11 6.5H8M11 9H8',
    backpack: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 13h8v4H8z',
    flashlight: 'M8 3h8v5l-2 3v10h-4V11L8 8zM8 6h8M12 14v2',
    shop: 'M4 8h16l-1 12H5zM9 8V6a3 3 0 0 1 6 0v2',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    gauge: 'M4 17a8 8 0 1 1 16 0M12 17l4-5M3 17h2M19 17h2',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  };
  App.ICONS = Object.keys(ICONS);
  App.icon = (name, cls = 'i') => {
    const body = ICONS[name];
    if (!body) throw new Error(`Unknown icon: ${name}`);
    const inner = body.startsWith('<') ? body : `<path d="${body}"/>`;
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  };


  /* ------------------------------------------------------------------
     5. 剪紙產生器（全部回傳 SVG path 字串）
     ------------------------------------------------------------------ */
  // Catmull-Rom → 三次貝茲。剪紙的邊是剪刀順著走出來的，要圓滑但不能過衝
  const smooth = (pts, { closed = false, move = true } = {}) => {
    const n = pts.length;
    const P = i => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
    let d = move ? `M${r1(pts[0][0])},${r1(pts[0][1])}` : '';
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)},${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)},${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])},${r1(p2[1])}`;
    }
    return closed ? d + 'Z' : d;
  };

  // 稜線：幾座高斯山峰（取最大值，峰才分明）＋低頻起伏＋一點點剪刀抖動
  const ridge = ({ w = 1600, base, amp, seed, peaks = 3, step = 32, jag = 1 }) => {
    const rnd = App.rng(seed);
    const P = Array.isArray(peaks)
      ? peaks.map(([c, a, s]) => ({ c: c * w, a, s: s * w }))
      : Array.from({ length: peaks }, () => ({ c: (rnd() * 1.1 - .05) * w, a: .45 + rnd() * .55, s: (.06 + rnd() * .12) * w }));
    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    const pts = [];
    for (let x = -step * 2; x <= w + step * 2; x += step) {
      const u = x / w;
      let v = 0;
      for (const p of P) v = Math.max(v, p.a * Math.exp(-((x - p.c) ** 2) / (2 * p.s * p.s)));
      v += .13 * Math.sin(u * 6.283 * 1.3 + ph[0]) + .06 * Math.sin(u * 6.283 * 4.3 + ph[1]) + .025 * Math.sin(u * 6.283 * 11 + ph[2]);
      v += (rnd() - .5) * .05 * jag;
      pts.push([x, base - amp * v]);
    }
    return pts;
  };
  const ridgeAt = (pts, x) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
      }
    }
    return pts[pts.length - 1][1];
  };
  const ridgePath = (pts, w = 1600, h = 900) => `${smooth(pts)}L${w + 160},${h + 20}L-160,${h + 20}Z`;

  // 針葉樹：三層鋸齒的剪紙樹形（座標以樹高為 1、底部中心為原點）
  const CONIFER = [[0, -1], [.13, -.75], [.07, -.75], [.22, -.5], [.12, -.5], [.31, -.2], [.05, -.2], [.05, 0], [-.05, 0], [-.05, -.2], [-.31, -.2], [-.12, -.5], [-.22, -.5], [-.07, -.75], [-.13, -.75]];
  const conifer = (x, y, h, wf = 1) => 'M' + CONIFER.map(([px, py]) => `${r1(x + px * h * .78 * wf)},${r1(y + py * h)}`).join('L') + 'Z';
  const circle = (cx, cy, r) => `M${r1(cx - r)},${r1(cy)}a${r1(r)},${r1(r)} 0 1,0 ${r1(r * 2)},0a${r1(r)},${r1(r)} 0 1,0 ${r1(-r * 2)},0`;

  // 沿稜線種一排樹；only 限定在某些 x 區段（0–1），sink 讓樹根埋進山裡
  const trees = (pts, { seed, w = 1600, h = [20, 40], gap = [12, 24], sink = .18, only = null, skip = 0 }) => {
    const rnd = App.rng(seed);
    let d = '';
    for (let x = gap[0] * rnd(); x < w + 20; x += gap[0] + rnd() * (gap[1] - gap[0])) {
      if (only && !only.some(([a, b]) => x >= a * w && x <= b * w)) continue;
      if (rnd() < skip) continue;
      const th = h[0] + rnd() * (h[1] - h[0]);
      d += conifer(x, ridgeAt(pts, x) + th * sink, th, .85 + rnd() * .3);
    }
    return d;
  };
  // 闊葉樹（季節花葉色）：樹幹在 trunk、樹冠在 crown，分開上色
  const roundTrees = (pts, { seed, w = 1600, h = [30, 50], gap = [60, 140], sink = .12, only = null }) => {
    const rnd = App.rng(seed);
    let crown = '', trunk = '';
    for (let x = gap[0] * rnd(); x < w + 20; x += gap[0] + rnd() * (gap[1] - gap[0])) {
      if (only && !only.some(([a, b]) => x >= a * w && x <= b * w)) continue;
      const th = h[0] + rnd() * (h[1] - h[0]);
      const y = ridgeAt(pts, x) + th * sink;
      const cr = th * .3;
      trunk += `M${r1(x - th * .035)},${r1(y)}L${r1(x - th * .02)},${r1(y - th * .62)}L${r1(x + th * .02)},${r1(y - th * .62)}L${r1(x + th * .035)},${r1(y)}Z`;
      crown += circle(x, y - th + cr, cr) + circle(x - cr * .78, y - th * .58, cr * .82) + circle(x + cr * .8, y - th * .6, cr * .78);
    }
    return { crown, trunk };
  };
  // 平底的剪紙雲：四段圓弧
  const cloud = (x, y, w) => `M${r1(x)},${r1(y)}a${r1(w * .16)},${r1(w * .16)} 0 0,1 ${r1(w * .22)},${r1(-w * .12)}a${r1(w * .2)},${r1(w * .2)} 0 0,1 ${r1(w * .36)},${r1(-w * .06)}a${r1(w * .14)},${r1(w * .14)} 0 0,1 ${r1(w * .26)},${r1(w * .06)}a${r1(w * .11)},${r1(w * .11)} 0 0,1 ${r1(w * .16)},${r1(w * .12)}Z`;
  // 霧帶：週期 = w/2，畫兩倍寬，往左平移 50% 就能無縫循環
  const mist = ({ w = 1600, y, a = 12, th = 40, seed }) => {
    const rnd = App.rng(seed);
    const ph = rnd() * 6.283, ph2 = rnd() * 6.283;
    const top = [], bot = [];
    for (let x = 0; x <= w * 2; x += 40) {
      const u = (x / (w / 2)) * 6.283;
      top.push([x, y - a * Math.sin(u + ph) - a * .45 * Math.sin(2 * u + ph2)]);
      bot.push([x, y + th + a * .5 * Math.sin(u + ph2)]);
    }
    return smooth(top) + `L${r1(bot[bot.length - 1][0])},${r1(bot[bot.length - 1][1])}` + smooth(bot.reverse(), { move: false }) + 'Z';
  };
  // 五瓣櫻花（花瓣尖端有缺口）
  const flower = (cx, cy, r, rot = 0) => {
    const local = [[0, 0], [-.55 * r, -.25 * r], [-.6 * r, -.85 * r], [-.22 * r, -r], [0, -.8 * r], [.22 * r, -r], [.6 * r, -.85 * r], [.55 * r, -.25 * r]];
    let d = '';
    for (let k = 0; k < 5; k++) {
      const a = rot + k * 1.2566;
      const c = Math.cos(a), s = Math.sin(a);
      const p = local.map(([x, y]) => [r1(cx + x * c - y * s), r1(cy + x * s + y * c)]);
      d += `M${p[0]}C${p[1]} ${p[2]} ${p[3]}L${p[4]}L${p[5]}C${p[6]} ${p[7]} ${p[0]}Z`;
    }
    return d;
  };
  const MAPLE = ICONS.maple;
  const maple = (cx, cy, size, rot = 0) => `<path d="${MAPLE}" transform="translate(${r1(cx)} ${r1(cy)}) rotate(${r1(rot)}) scale(${r1(size / 20 * 100) / 100}) translate(-12 -12)"/>`;

  App.svg = { smooth, ridge, ridgeAt, ridgePath, conifer, trees, roundTrees, circle, cloud, mist, flower, maple };


  /* ------------------------------------------------------------------
     6. 剪紙場景
     ------------------------------------------------------------------ */
  // 每一層的設定：fill 是季節色票、depth 是視差深度（0 最遠、1 最近；null = 不動）
  const PRESETS = {
    hero: {
      w: 1600, h: 900,
      sun: [960, 250, 70],
      clouds: [[120, 205, 190], [420, 128, 120], [1200, 318, 160], [1390, 170, 110], [700, 100, 90]],
      // 飛鳥從右側飛入、在太陽前爬升後從上緣飛出：始終在標題欄右側與季節籤下方，不會劃過文字
      birds: 'M1700,580 C1500,520 1320,460 1160,410 S910,160 850,-80',
      layers: [
        { fill: 'l1', base: 540, amp: 260, peaks: [[.58, 1, .1], [.79, .8, .085], [.36, .42, .12], [.97, .55, .07], [.08, .34, .1]], depth: .1 },
        { fill: 'l2', base: 600, amp: 190, peaks: [[.45, .86, .09], [.7, .72, .11], [.16, .5, .1], [.92, .62, .08]], depth: .18, trees: { h: [9, 15], gap: [6, 12], sink: .25, skip: .25 } },
        { mist: true, y: 590, th: 52, a: 12, depth: .24, drift: 12 },
        { fill: 'l3', base: 668, amp: 130, peaks: [[.63, .84, .09], [.27, .7, .1], [.9, .62, .08]], depth: .32, trees: { h: [15, 26], gap: [8, 15], sink: .22 } },
        { fill: 'l4', base: 732, amp: 108, peaks: [[.4, .8, .1], [.78, .7, .09], [.06, .6, .08]], depth: .44, trees: { h: [24, 40], gap: [11, 22], sink: .2 }, flora: { h: [30, 46], gap: [70, 170] } },
        { mist: true, y: 728, th: 44, a: 10, depth: .5, drift: 18 },
        { fill: 'l5', base: 800, amp: 80, peaks: [[.18, .8, .1], [.56, .66, .12], [.94, .8, .07]], depth: .62, trees: { h: [40, 66], gap: [16, 32], sink: .18 }, flora: { h: [52, 72], gap: [90, 210] } },
        { fill: 'l6', base: 858, amp: 64, peaks: [[.05, .9, .08], [.5, .3, .2], [.97, .9, .07]], depth: .8, trees: { h: [90, 170], gap: [24, 44], sink: .14, only: [[0, .15], [.86, 1]] }, flora: { h: [100, 130], gap: [70, 130], only: [[.14, .22], [.78, .87]] } },
        { fill: 'paper', base: 896, amp: 24, peaks: [[.3, .6, .2], [.75, .5, .18]], depth: null, flat: false },
      ],
    },
    page: {
      w: 1600, h: 600,
      sun: [1220, 236, 46],
      clouds: [[960, 250, 130], [1420, 300, 90], [700, 238, 80]],
      // 同上：子頁頁首的文字在左側，鳥群只在右半邊的天空飛，從上緣離開
      birds: 'M1700,420 C1500,380 1300,330 1160,260 S1000,90 960,-40',
      layers: [
        { fill: 'l1', base: 380, amp: 190, peaks: [[.66, .95, .09], [.86, .7, .08], [.45, .4, .1]], depth: .1 },
        { fill: 'l2', base: 440, amp: 130, peaks: [[.55, .8, .1], [.8, .7, .1], [.2, .3, .12]], depth: .2, trees: { h: [9, 15], gap: [7, 13], sink: .25, skip: .2 } },
        { mist: true, y: 430, th: 40, a: 10, depth: .26, drift: 14 },
        { fill: 'l3', base: 500, amp: 74, peaks: [[.72, .8, .1], [.35, .5, .12], [.98, .7, .06]], depth: .4, trees: { h: [20, 32], gap: [10, 19], sink: .2 }, flora: { h: [28, 40], gap: [90, 200] } },
        { fill: 'l5', base: 556, amp: 48, peaks: [[.04, .9, .07], [.6, .35, .15], [.96, .9, .06]], depth: .62, trees: { h: [56, 100], gap: [22, 40], sink: .14, only: [[0, .1], [.9, 1]] }, flora: { h: [60, 76], gap: [80, 160], only: [[.08, .16], [.84, .92]] } },
        { fill: 'paper', base: 602, amp: 24, peaks: [[.4, .6, .2], [.85, .4, .15]], depth: null },
      ],
    },
    band: {
      w: 840, h: 300,
      sun: [640, 90, 34],
      // 雲放在中段、偏低：入園證頭這類矮的 band 會裁掉上緣，左上角又有標題，放左上會只剩一條白邊
      clouds: [[420, 108, 84]],
      layers: [
        { fill: 'l2', base: 190, amp: 110, peaks: [[.62, .9, .12], [.3, .6, .12]], depth: null },
        { fill: 'l4', base: 236, amp: 70, peaks: [[.2, .8, .12], [.8, .7, .1]], depth: null, trees: { h: [16, 28], gap: [10, 18], sink: .2 } },
        { fill: 'l6', base: 276, amp: 40, peaks: [[.05, .8, .1], [.95, .8, .1]], depth: null, trees: { h: [40, 70], gap: [16, 28], sink: .14, only: [[0, .12], [.88, 1]] } },
        { fill: 'card', base: 298, amp: 10, peaks: [[.5, .6, .3]], depth: null },
      ],
    },
  };

  // data-depth：視差深度；data-drift：霧帶每秒漂移（viewBox 單位）；data-float：「振幅px,週期秒」的左右浮動
  // 紙張陰影用 svg 內的濾鏡（畫一次就快取），不用 CSS filter：
  // 合成層上的 CSS filter 會在每一格視差位移時重算，八層加起來非常吃效能
  const layerSVG = (cfg, i, P, extra = '') => {
    const body = cfg.flat ? extra : `<g filter="url(#${cfg.filter || 'pc-layer'})">${extra}</g>`;
    const attrs = (cfg.depth == null ? '' : ` data-depth="${cfg.depth}"`) + (cfg.drift ? ` data-drift="${cfg.drift}"` : '') + (cfg.float ? ` data-float="${cfg.float}"` : '');
    return `<svg class="scene__layer" viewBox="0 0 ${P.w} ${P.h}" preserveAspectRatio="xMidYMax slice" style="--i:${i}"${attrs} aria-hidden="true" focusable="false">${body}</svg>`;
  };

  App.papercut = (el, preset = el.dataset.papercut, { seed = el.dataset.seed || preset } = {}) => {
    if (el._papercut) return el;
    el._papercut = true;
    const P = PRESETS[preset];
    if (!P) throw new Error(`Unknown papercut preset: ${preset}`);
    el.classList.add('scene');
    el.setAttribute('aria-hidden', 'true');
    let html = '';
    let i = 0;

    // 天空層：太陽（同心紙圈）
    if (P.sun) {
      const [sx, sy, sr] = P.sun;
      html += layerSVG({ depth: .03 }, i++, P, `<circle class="f-sun" cx="${sx}" cy="${sy}" r="${r1(sr * 1.7)}" opacity=".22"/><circle class="f-sun" cx="${sx}" cy="${sy}" r="${r1(sr * 1.34)}" opacity=".42"/><circle class="f-sun" cx="${sx}" cy="${sy}" r="${sr}"/>`);
    }
    // 雲分遠近兩層，整層一起浮動：動畫只改 transform，不必每格重算紙張陰影
    // 雲的外框很扁，pc-layer 以外框比例算的濾鏡範圍會把陰影切成一個方框，改用涵蓋整層的 pc-cloud
    const clouds = P.clouds || [];
    [[0, { depth: .05, float: '26,21', filter: 'pc-cloud' }], [1, { depth: .12, float: '38,15', filter: 'pc-cloud' }]].forEach(([odd, cfg]) => {
      const d = clouds.filter((c, k) => k % 2 === odd).map(([x, y, w]) => cloud(x, y, w)).join('');
      if (d) html += layerSVG(cfg, i++, P, `<path class="f-mist" d="${d}"/>`);
    });

    if (P.birds) {
      let birds = `<path d="${P.birds}" fill="none" data-bird-path/>`;
      for (let k = 0; k < 3; k++) {
        birds += `<g data-bird="${k}" transform="translate(-200 -200)"><path class="f-l7" d="M0,0Q-6,-7 -15,-3Q-7,-3 0,3Z M0,0Q6,-7 15,-3Q7,-3 0,3Z"/></g>`;
      }
      html += layerSVG({ depth: .07, flat: true }, i++, P, birds);
    }

    P.layers.forEach((cfg, k) => {
      const s = `${seed}-${k}`;
      if (cfg.mist) {
        const d = mist({ w: P.w, y: cfg.y, a: cfg.a, th: cfg.th, seed: s });
        html += layerSVG(cfg, i++, P, `<path class="f-mist" opacity=".72" d="${d}"/>`);
        return;
      }
      const pts = ridge({ w: P.w, base: cfg.base, amp: cfg.amp, peaks: cfg.peaks, seed: s });
      let body = `<path class="f-${cfg.fill}" d="${ridgePath(pts, P.w, P.h)}"/>`;
      if (cfg.trees) body += `<path class="f-${cfg.fill}" d="${trees(pts, { seed: s + 't', w: P.w, ...cfg.trees })}"/>`;
      if (cfg.flora) {
        const rt = roundTrees(pts, { seed: s + 'f', w: P.w, ...cfg.flora });
        body += `<path class="f-${cfg.fill}" d="${rt.trunk}"/><path class="f-flora" d="${rt.crown}"/>`;
      }
      html += layerSVG(cfg, i++, P, body);
    });

    el.insertAdjacentHTML('beforeend', html);
    if (!App.reduced) {
      el.classList.add('is-intro');
      setTimeout(() => el.classList.remove('is-intro'), 1300 + i * 110 + 200);
    }
    const host = el.closest('[data-scene]');
    if (host) App.scene(host);
    return el;
  };

  // 段落之間的剪紙山形：兩層季節色＋最前面一層是下一段的底色
  App.cutDivider = el => {
    if (el._divider) return;
    el._divider = true;
    const seed = el.dataset.cutDivider || 'divider';
    const W = 1600, H = 160;
    const back = ridge({ w: W, base: 120, amp: 90, peaks: 4, seed: seed + 'a' });
    const mid = ridge({ w: W, base: 140, amp: 62, peaks: 3, seed: seed + 'b' });
    const front = ridge({ w: W, base: 158, amp: 40, peaks: 3, seed: seed + 'c' });
    const svg = (cls, body, i) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" style="--i:${i}" aria-hidden="true" focusable="false"><path class="${cls}" d="${body}"/></svg>`;
    el.innerHTML =
      svg('f-l3', ridgePath(back, W, H) + trees(back, { seed: seed + 't', w: W, h: [8, 14], gap: [8, 16], skip: .4 }), 0) +
      svg('f-l5', ridgePath(mid, W, H) + trees(mid, { seed: seed + 'u', w: W, h: [14, 24], gap: [10, 20], skip: .3 }), 1) +
      svg('f-to', ridgePath(front, W, H), 2);
  };


  /* ------------------------------------------------------------------
     7. 動畫引擎：視差、飛鳥、飄落粒子
     ------------------------------------------------------------------ */
  // 只在可見時跑的 rAF 迴圈；離開視窗、切到別的分頁、要求減少動態時都會停
  App.animator = (el, frame) => {
    let raf = 0, last = 0, visible = false;
    const loop = t => {
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      frame(t, dt);
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      const run = visible && !doc.hidden && !App.reduced;
      if (run && !raf) { last = 0; raf = requestAnimationFrame(loop); }
      else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(el);
    doc.addEventListener('visibilitychange', sync);
    doc.addEventListener('motionchange', sync);
    return { sync, get running() { return raf !== 0; } };
  };

  App.scene = host => {
    if (host._scene) return host._scene;
    const layers = $$('[data-depth]', host).map(n => {
      const vb = n.viewBox.baseVal;
      const [amp = 0, period = 1] = (n.dataset.float || '').split(',').map(Number);
      return { n, d: +n.dataset.depth, drift: +n.dataset.drift || 0, amp, period, vw: vb.width, vh: vb.height, scale: 1, ph: Math.random() * 6.283 };
    });
    // slice 縮放比：霧帶漂移一個週期（viewBox 寬的一半）換算成 px 才能無縫循環
    const measure = () => layers.forEach(L => {
      const r = L.n.getBoundingClientRect();
      L.scale = Math.max(r.width / L.vw, r.height / L.vh);
    });
    measure();
    new ResizeObserver(measure).observe(host);
    const copies = $$('[data-scene-copy]', host);
    const birdPath = $('[data-bird-path]', host);
    const birds = $$('[data-bird]', host);
    const birdLen = birdPath ? birdPath.getTotalLength() : 0;
    const FORMATION = [[0, 0, 1], [.022, 16, .82], [.041, -12, .7]];
    let mx = 0, my = 0, cx = 0, cy = 0;

    const placeBirds = (t, flapOn) => {
      birds.forEach((b, k) => {
        const [lag, dy, sc] = FORMATION[k];
        const u = ((t / 34000 + .18 - lag) % 1 + 1) % 1;
        const p = birdPath.getPointAtLength(u * birdLen);
        const q = birdPath.getPointAtLength(Math.min(birdLen, u * birdLen + 4));
        const ang = Math.atan2(q.y - p.y, q.x - p.x) * 57.3;
        const flap = flapOn ? .35 + .65 * Math.abs(Math.cos(t / 190 + k * 1.7)) : .8;
        b.setAttribute('transform', `translate(${r1(p.x)} ${r1(p.y + dy)}) rotate(${r1(ang * .5)}) scale(${sc * 1.3} ${r1(sc * 1.3 * flap * 100) / 100})`);
      });
    };

    const frame = t => {
      cx += (mx - cx) * .06;
      cy += (my - cy) * .06;
      const rect = host.getBoundingClientRect();
      const s = clamp(-rect.top, 0, rect.height);
      for (const L of layers) {
        let x = cx * L.d * 26;
        if (L.drift) x -= ((t / 1000) * L.drift * L.scale) % ((L.vw / 2) * L.scale);
        if (L.amp) x += L.amp * Math.sin((t / (L.period * 1000)) * 6.283 + L.ph);
        L.n.style.transform = `translate3d(${x.toFixed(2)}px,${(cy * L.d * 9 + s * (1 - L.d) * .34).toFixed(2)}px,0)`;
      }
      for (const c of copies) {
        c.style.transform = `translate3d(0,${(s * .22).toFixed(1)}px,0)`;
        c.style.opacity = String(clamp(1 - s / (rect.height * .75), 0, 1));
      }
      if (birdLen) placeBirds(t, true);
    };

    host.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = host.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      my = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    host.addEventListener('pointerleave', () => { mx = 0; my = 0; });

    const resetStatic = () => {
      if (!App.reduced) return;
      layers.forEach(L => { L.n.style.transform = ''; });
      copies.forEach(c => { c.style.transform = ''; c.style.opacity = ''; });
      if (birdLen) placeBirds(9000, false);
    };
    if (birdLen) placeBirds(9000, false);
    host._scene = App.animator(host, frame);
    doc.addEventListener('motionchange', resetStatic);
    return host._scene;
  };

  // 季節粒子：春櫻瓣、夏螢火、秋楓葉、冬雪
  const MAPLE_PATH = typeof Path2D === 'function' ? new Path2D(MAPLE) : null;
  App.particles = canvas => {
    if (canvas._particles) return;
    canvas._particles = true;
    const ctx = canvas.getContext('2d');
    const parts = [];
    let W = 0, H = 0, colors = {};
    const readColors = () => {
      const cs = getComputedStyle(root);
      colors = { flora: cs.getPropertyValue('--flora').trim(), flora2: cs.getPropertyValue('--flora-2').trim(), l4: cs.getPropertyValue('--l4').trim(), l5: cs.getPropertyValue('--l5').trim() };
    };
    const spawn = (p, scatter) => {
      const kind = root.dataset.season;
      const R = Math.random;
      Object.assign(p, {
        kind, dying: false, alpha: scatter ? 1 : 0,
        x: R() * W, y: scatter ? R() * H : -30 - R() * 60,
        size: kind === 'winter' ? 1.6 + R() * 2.4 : kind === 'summer' ? 2 + R() * 2.2 : kind === 'autumn' ? 13 + R() * 11 : 8 + R() * 7,
        vx: (R() - .3) * .5, vy: kind === 'winter' ? .25 + R() * .35 : .45 + R() * .55,
        rot: R() * 6.283, vr: (R() - .5) * .035, ph: R() * 6.283,
        tone: ['flora', 'flora2', 'l5'][Math.floor(R() * 3)],
      });
      if (kind === 'summer') {
        p.x = R() * W;
        p.y = H * (.5 + R() * .45);
        p.vx = (R() - .5) * .35;
        p.vy = (R() - .5) * .2;
      }
    };
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = W < 640 ? 14 : 28;
      while (parts.length < want) { const p = {}; spawn(p, true); parts.push(p); }
      parts.length = want;
      if (App.reduced) draw(9000);
    };
    const drawOne = (p, t) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'summer') {
        const blink = .25 + .75 * Math.max(0, Math.sin(t / 700 + p.ph));
        ctx.globalAlpha = p.alpha * blink;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 4);
        g.addColorStop(0, colors.flora2);
        g.addColorStop(.25, colors.flora);
        g.addColorStop(1, 'rgba(227,240,110,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 4, 0, 6.283);
        ctx.fill();
      } else if (p.kind === 'winter') {
        ctx.globalAlpha = p.alpha * .9;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(40,60,80,.35)';
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, 6.283);
        ctx.fill();
      } else {
        ctx.globalAlpha = p.alpha;
        ctx.rotate(p.rot);
        // 翻面：水平縮放隨時間在 -1..1 之間擺動，像紙片在空中翻轉
        ctx.scale(Math.cos(t / 900 + p.ph), 1);
        ctx.fillStyle = colors[p.tone] || colors.flora;
        ctx.shadowColor = 'rgba(60,30,10,.25)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1.5;
        if (p.kind === 'autumn' && MAPLE_PATH) {
          const s = p.size / 20;
          ctx.scale(s, s);
          ctx.translate(-12, -12);
          ctx.fill(MAPLE_PATH);
        } else {
          const s = p.size * .6;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.bezierCurveTo(s * .9, -s * .6, s * .7, s * .8, 0, s);
          ctx.bezierCurveTo(-s * .7, s * .8, -s * .9, -s * .6, 0, -s);
          ctx.fill();
        }
      }
      ctx.restore();
    };
    const draw = t => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) drawOne(p, t);
    };
    const frame = (t, dt) => {
      const k = dt / 16;
      for (const p of parts) {
        if (p.kind === 'summer') {
          p.vx += (Math.random() - .5) * .04;
          p.vy += (Math.random() - .5) * .04;
          p.vx = clamp(p.vx, -.5, .5);
          p.vy = clamp(p.vy, -.35, .35);
          p.x += p.vx * k;
          p.y += p.vy * k;
          if (p.y < H * .4 || p.y > H) p.vy *= -1;
        } else {
          p.x += (p.vx + Math.sin(t / 1300 + p.ph) * .45) * k;
          p.y += p.vy * k;
          p.rot += p.vr * k;
        }
        p.alpha = p.dying ? p.alpha - .03 * k : Math.min(1, p.alpha + .02 * k);
        if (p.dying && p.alpha <= 0) {
          spawn(p, true);
          p.alpha = 0;
        } else if (p.y > H + 30 || p.x < -40 || p.x > W + 40) {
          spawn(p, false);
        }
      }
      draw(t);
    };
    readColors();
    new ResizeObserver(resize).observe(canvas);
    doc.addEventListener('seasonchange', () => {
      readColors();
      if (App.reduced) { parts.forEach(p => spawn(p, true)); draw(9000); return; }
      // 舊季節的葉片淡出後，在原處長出新季節的
      parts.forEach(p => { p.dying = true; });
    });
    doc.addEventListener('motionchange', () => { if (App.reduced) draw(9000); });
    App.animator(canvas, frame);
  };


  /* ------------------------------------------------------------------
     8. 高度剖面
     ------------------------------------------------------------------ */
  // 單調三次插值：剖面不會畫出比取樣點還高或還低的假山頭
  const monotone = P => {
    const n = P.length;
    const dx = [], m = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = P[i + 1][0] - P[i][0];
      m[i] = (P[i + 1][1] - P[i][1]) / dx[i];
    }
    const t = [m[0]];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    t[n - 1] = m[n - 2];
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { const s = 3 / Math.sqrt(h); t[i] = s * a * m[i]; t[i + 1] = s * b * m[i]; }
    }
    let d = `M${r1(P[0][0])},${r1(P[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${r1(P[i][0] + h)},${r1(P[i][1] + t[i] * h)} ${r1(P[i + 1][0] - h)},${r1(P[i + 1][1] - t[i + 1] * h)} ${r1(P[i + 1][0])},${r1(P[i + 1][1])}`;
    }
    return d;
  };

  App.profile = {
    geom(trail, { w = 340, h = 148, pad = [44, 14, 10, 14], minSpan = 220, lo, hi } = {}) {
      const e = trail.profile;
      const n = e.length;
      const span = Math.max(trail.eleMax - trail.eleMin, minSpan);
      const mid = (trail.eleMax + trail.eleMin) / 2;
      const yLo = lo ?? mid - span * .62;
      const yHi = hi ?? mid + span * .5;
      const x = km => pad[3] + (km / trail.km) * (w - pad[1] - pad[3]);
      const y = ele => pad[0] + (1 - (ele - yLo) / (yHi - yLo)) * (h - pad[0] - pad[2]);
      const pts = e.map((ele, i) => {
        const km = (i * trail.km) / (n - 1);
        return { km, ele, x: x(km), y: y(ele) };
      });
      const line = monotone(pts.map(p => [p.x, p.y]));
      const area = `${line}L${r1(pts[n - 1].x)},${h + 2}L${r1(pts[0].x)},${h + 2}Z`;
      const eleAt = km => {
        const f = clamp(km / trail.km, 0, 1) * (n - 1);
        const i = Math.min(n - 2, Math.floor(f));
        return e[i] + (e[i + 1] - e[i]) * (f - i);
      };
      return { w, h, pad, lo: yLo, hi: yHi, x, y, pts, line, area, eleAt };
    },

    // 卡片用：遠山＋剖面紙層＋描線，起訖海拔用 HTML 標籤（svg 會被非等比拉伸）
    card(trail) {
      const W = 340, H = 148;
      const g = App.profile.geom(trail, { w: W, h: H });
      const far = ridge({ w: W, base: 92, amp: 44, peaks: 2, step: 20, seed: trail.id + 'far' });
      const top = g.pts.reduce((a, p) => (p.ele > a.ele ? p : a), g.pts[0]);
      const end = g.pts[g.pts.length - 1];
      const fmt = App.fmt.num;
      const peakTag = top !== end && top !== g.pts[0]
        ? `<span class="profile-tag profile-tag--peak" style="left:${r1((top.x / W) * 100)}%;top:${r1((top.y / H) * 100)}%">${fmt(top.ele)}<small>m</small></span>`
        : '';
      // 剖面紙層兩端水平延伸到卡片邊緣：是一整張剪開的紙，而不是框在圖表裡的面積圖
      const first = g.pts[0];
      const land = `M-4,${r1(first.y)}L${r1(first.x)},${r1(first.y)}${g.line.slice(g.line.indexOf('C'))}L${W + 4},${r1(end.y)}L${W + 4},${H + 4}L-4,${H + 4}Z`;
      return `<svg class="profile profile--card" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path class="f-l2" d="${ridgePath(far, W, H)}"/>
        <path class="f-l4" filter="url(#pc-shadow)" d="${land}"/>
        <path class="profile__line s-ink" d="${g.line}" fill="none" stroke-width="2.2" stroke-linecap="round" pathLength="1"/>
        <path class="f-card" filter="url(#pc-shadow)" d="M-4,${H - 7} C80,${H - 12} 200,${H - 3} ${W + 4},${H - 9} L${W + 4},${H + 4} L-4,${H + 4}Z"/>
      </svg>
      <span class="profile-tag profile-tag--start">${fmt(g.pts[0].ele)}<small>m</small></span>
      <span class="profile-tag profile-tag--end">${fmt(end.ele)}<small>m</small></span>${peakTag}`;
    },

    mount(el) {
      if (el._profile) return;
      el._profile = true;
      const t = App.trail(el.dataset.profile);
      if (!t) throw new Error(`Unknown trail: ${el.dataset.profile}`);
      el.classList.add('profile-host');
      el.innerHTML = App.profile.card(t);
      if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', 'fade');
    },
  };

  App.trailCardHTML = (t, { note = '', id = true, level = 3, reveal = '' } = {}) => {
    const L = App.label;
    const h = Math.floor(t.min / 60), m = t.min % 60;
    const time = h ? `${h}<small>h</small>${m ? `${m}<small>m</small>` : ''}` : `${m}<small>m</small>`;
    const route = t.type === 'loop' ? `${App.esc(t.from)} 環線` : `${App.esc(t.from)} ${t.type === 'return' ? '⇄' : '→'} ${App.esc(t.to)}`;
    return `<article class="trail-card card card--stack card--lift"${id ? ` id="trail-${t.id}"` : ''} data-trail="${t.id}" data-status="${t.status}" data-reveal="${reveal}">
      <div class="trail-card__art profile-host">${App.profile.card(t)}
        <div class="trail-card__flags"><span class="badge badge--${t.diff}">${L.diff[t.diff]}</span><span class="status status--${t.status} status--pill">${L.status[t.status]}</span></div>
      </div>
      <div class="trail-card__body">
        <p class="trail-card__en">${App.esc(t.en)}</p>
        <h${level} class="trail-card__name"><a class="stretched" href="${App.trailURL(t)}">${App.esc(t.name)}</a></h${level}>
        ${note ? `<p class="trail-card__note">${App.esc(note)}</p>` : ''}
        <dl class="trail-stats">
          <div><dt>距離</dt><dd>${App.fmt.km(t.km)}<small>km</small></dd></div>
          <div><dt>爬升</dt><dd>${App.fmt.num(t.climb)}<small>m</small></dd></div>
          <div><dt>時間</dt><dd>${time}</dd></div>
        </dl>
      </div>
      <footer class="trail-card__foot"><span class="trail-card__route">${App.icon('route', 'i i--sm')}${route}</span><span>${L.type[t.type]}</span></footer>
    </article>`;
  };


  /* ------------------------------------------------------------------
     9. 園區地圖
     ------------------------------------------------------------------ */
  const blob = (cx, cy, rx, ry, seed) => {
    const rnd = App.rng(seed);
    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    const pts = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * 6.283;
      const f = 1 + .09 * Math.sin(3 * a + ph[0]) + .05 * Math.sin(5 * a + ph[1]) + .025 * Math.sin(9 * a + ph[2]);
      pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
    }
    return smooth(pts, { closed: true });
  };
  // 等高線色帶由低到高：l1（入口）→ l7（主峰）
  const TERRAIN = [
    ['f-l2', 700, 232, 560, 340],
    ['f-l3', 726, 205, 420, 250],
    ['f-l4', 752, 176, 316, 176],
    ['f-l5', 800, 156, 210, 118],
    ['f-l5', 616, 96, 150, 76],
    ['f-l6', 846, 134, 124, 80],
    ['f-l6', 612, 86, 72, 40],
    ['f-l7', 880, 118, 60, 40],
  ];
  const FOREST = [[150, 250, 'f-l4'], [330, 300, 'f-l4'], [470, 250, 'f-l5'], [930, 330, 'f-l5'], [600, 520, 'f-l4'], [880, 470, 'f-l4'], [80, 120, 'f-l3']];
  const FAC_ICON = { entrance: 'ticket', visitor: 'home', parking: 'parking', food: 'food', shuttle: 'bus', toilet: 'toilet', aid: 'aid', view: 'pavilion', bridge: 'bridge', camp: 'tent', edu: 'book' };
  const DIFF_STROKE = { family: 'var(--d-family)', general: 'var(--d-general)', challenge: 'var(--d-challenge)' };

  App.map = {
    W: 1000,
    H: 640,
    facIcon: FAC_ICON,
    render(svg, { trails = true, facilities = true, labels = true } = {}) {
      svg.setAttribute('viewBox', '0 0 1000 640');
      let h = `<rect class="f-l1" width="1000" height="640"/>`;
      h += `<g class="map__terrain" filter="url(#pc-shadow)">${TERRAIN.map(([c, x, y, rx, ry], i) => `<path class="${c}" style="--i:${i}" d="${blob(x, y, rx, ry, 'terrain' + i)}"/>`).join('')}</g>`;
      // 零星的針葉林
      let forest = '';
      FOREST.forEach(([fx, fy, c], k) => {
        const rnd = App.rng('forest' + k);
        let d = '';
        for (let j = 0; j < 9; j++) d += conifer(fx + (rnd() - .5) * 70, fy + (rnd() - .5) * 34, 12 + rnd() * 9);
        forest += `<path class="${c}" d="${d}"/>`;
      });
      h += `<g class="map__forest" opacity=".75">${forest}</g>`;
      // 水系：鏡湖與螢溪
      h += `<g class="map__water"><path class="s-water" fill="none" stroke-width="6" stroke-linecap="round" d="M862,188 C800,230 760,250 700,268 S590,300 540,322 S460,372 420,392 S330,402 290,398 S258,396 250,395"/><path class="s-water" fill="none" stroke-width="5" stroke-linecap="round" d="M168,412 C138,430 116,450 96,470 S48,500 8,518"/><path class="f-water" filter="url(#pc-shadow)" d="${blob(216, 396, 64, 36, 'lake')}"/><path fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round" d="M188,386 q14,-6 30,-2 M206,404 q12,-4 22,0"/></g>`;
      // 道路：紙條（白底＋細邊）
      const road = 'M40,628 C110,590 150,560 200,540 S280,505 305,500 S380,478 430,470 S520,450 560,440 S650,402 704,372';
      h += `<g class="map__roads" fill="none" stroke-linecap="round"><path stroke="rgb(0 0 0 / .18)" stroke-width="9" d="${road}"/><path class="s-card" stroke-width="6" d="${road}"/><path stroke="rgb(0 0 0 / .18)" stroke-width="6" d="M262,503 C252,484 258,466 262,450"/><path class="s-card" stroke-width="3.5" d="M262,503 C252,484 258,466 262,450"/></g>`;
      if (trails) {
        const list = trails === true ? App.data.trails : App.data.trails.filter(t => trails.includes(t.id));
        h += `<g class="map__trails">${list.map(t => `<g class="map__trail" data-trail="${t.id}">
          <path class="map__trail-casing" d="${t.route}" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
          <path class="map__trail-line" d="${t.route}" fill="none" style="stroke:${DIFF_STROKE[t.diff]}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"${t.status === 'closed' ? ' stroke-dasharray="2 7"' : t.diff === 'challenge' ? ' stroke-dasharray="10 5"' : ''}/>
        </g>`).join('')}</g>`;
      }
      if (labels) {
        h += `<g class="map__labels">
          <path class="f-ink" d="M885,104 l7,12 h-14z"/><text class="map__label map__label--peak" x="885" y="94" text-anchor="middle">雲嶺主峰</text><text class="map__label map__label--sub" x="904" y="124">1,846 m</text>
          <path class="f-ink" d="M610,66 l7,12 h-14z"/><text class="map__label map__label--peak" x="610" y="56" text-anchor="middle">北峰</text><text class="map__label map__label--sub" x="629" y="88">1,702 m</text>
          <text class="map__label" x="216" y="403" text-anchor="middle">鏡湖</text>
          <text class="map__label map__label--sub" x="590" y="296" transform="rotate(-22 590 296)">螢溪</text>
        </g>`;
      }
      if (facilities) {
        const list = facilities === true ? App.data.facilities : App.data.facilities.filter(f => facilities.includes(f.type));
        h += `<g class="map__facilities">${list.map(f => `<g class="map__fac" data-facility="${f.id}">
          <g class="map__fac-pin"><circle class="map__fac-disc f-card" cx="${f.x}" cy="${f.y}" r="15" stroke="rgb(0 0 0 / .22)" stroke-width="1"/>
          <svg class="map__fac-glyph" x="${f.x - 10}" y="${f.y - 10}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[FAC_ICON[f.type]].startsWith('<') ? ICONS[FAC_ICON[f.type]] : `<path d="${ICONS[FAC_ICON[f.type]]}"/>`}</svg></g>
        </g>`).join('')}</g>`;
      }
      // 指北與比例尺：霧林古道 6.8 km 在圖上約 420 單位 → 1 km ≈ 62
      h += `<g class="map__legend" transform="translate(930 580)"><path class="f-ink" d="M0,-34 l8,20 l-8,-5 l-8,5z"/><text class="map__label map__label--sub" x="0" y="-40" text-anchor="middle">N</text><path class="s-ink" d="M-62,10 h62 M-62,5 v10 M0,5 v10" stroke-width="2" fill="none"/><text class="map__label map__label--sub" x="-31" y="32" text-anchor="middle">1 km</text></g>`;
      svg.innerHTML = h;
      svg.classList.add('map__svg');
      return svg;
    },
  };


  /* ------------------------------------------------------------------
     10. 頁首、導覽
     ------------------------------------------------------------------ */
  const wireHeader = () => {
    const header = $('[data-header]');
    const page = location.pathname.split('/').pop() || 'index.html';
    $$('.nav__link').forEach(a => {
      const on = a.getAttribute('href') === page;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (!header) return;
    const toggle = $('.nav-toggle', header);
    const setOpen = open => {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.nav-toggle__label').textContent = open ? '關閉' : '選單';
    };
    toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    doc.addEventListener('keydown', e => {
      if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    doc.addEventListener('click', e => {
      if (header.classList.contains('is-open') && !header.contains(e.target)) setOpen(false);
    });
    $$('.nav__link', header).forEach(a => a.addEventListener('click', () => setOpen(false)));
    matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  };


  /* ------------------------------------------------------------------
     11. Toast / Modal / Tooltip / 表單
     ------------------------------------------------------------------ */
  let toastBox = null;
  // showModal 會把 dialog 放進 top layer、其餘頁面變成 inert：留在 body 的 toast 會被蓋住，
  // 所以有 modal 開著時把 toast 容器搬進最上層的 dialog，關掉後再搬回 body
  const placeToasts = () => {
    if (toastBox) ($$('dialog.modal[open]').pop() || doc.body).append(toastBox);
  };
  doc.addEventListener('close', e => {
    if (toastBox && e.target instanceof HTMLDialogElement && e.target.contains(toastBox)) placeToasts();
  }, true);

  const TOAST_ICON = { ok: 'check', info: 'info', warn: 'alert' };
  App.toast = (msg, { title = '', tone = 'ok', timeout = 3800 } = {}) => {
    if (!toastBox) {
      toastBox = doc.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
    }
    placeToasts();
    const t = doc.createElement('div');
    t.className = `toast toast--${tone}`;
    t.innerHTML = `${App.icon(TOAST_ICON[tone] || 'info', 'toast__icon')}<div>${title ? `<b class="toast__title">${App.esc(title)}</b>` : ''}${App.esc(msg)}</div>`;
    toastBox.append(t);
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 340);
    }, timeout);
    return t;
  };

  const resolveDialog = target => (typeof target === 'string' ? doc.getElementById(target) : target);
  App.modal = {
    open(target) {
      const d = resolveDialog(target);
      if (!d) throw new Error(`Modal not found: ${target}`);
      if (!d.open) d.showModal();
      placeToasts();
      return d;
    },
    close(target) {
      const d = target ? resolveDialog(target) : $$('dialog.modal[open]').pop();
      if (d && d.open) d.close();
    },
  };
  doc.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { App.modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { App.modal.close(closer.closest('dialog')); return; }
    // 點到 dialog 本身（＝背景區）就關閉
    if (e.target instanceof HTMLDialogElement && e.target.classList.contains('modal') && e.target.open) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) e.target.close();
    }
  });

  let tipEl = null;
  App.tip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = doc.createElement('div');
        tipEl.className = 'tip';
        tipEl.setAttribute('role', 'tooltip');
        doc.body.append(tipEl);
      }
      tipEl.innerHTML = html;
      tipEl.style.left = `${clamp(x, 140, innerWidth - 140)}px`;
      tipEl.style.top = `${y}px`;
      tipEl.classList.add('is-on');
    },
    hide() { if (tipEl) tipEl.classList.remove('is-on'); },
  };

  App.field = {
    setError(input, msg) {
      const f = input.closest('.field');
      if (!f) throw new Error('setError: input is not inside .field');
      let err = $('.field__error', f);
      if (!err) {
        err = doc.createElement('p');
        err.className = 'field__error';
        err.id = `${input.id || input.name}-error`;
        f.append(err);
      }
      if (msg) {
        err.textContent = msg;
        f.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', err.id);
      } else {
        f.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
      }
      return !msg;
    },
    clear(form) {
      $$('.field.is-invalid', form).forEach(f => f.classList.remove('is-invalid'));
      $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid'));
    },
  };
  App.valid = {
    required: v => String(v).trim().length > 0,
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()),
    phone: v => /^09\d{8}$/.test(String(v).replace(/[\s-]/g, '')),
    idCard: v => /^[A-Z][12]\d{8}$/.test(String(v).trim().toUpperCase()),
  };


  /* ------------------------------------------------------------------
     12. 宣告式元件：tabs / segmented / stepper
     ------------------------------------------------------------------ */
  App.tabs = list => {
    if (list._tabs) return;
    list._tabs = true;
    list.setAttribute('role', 'tablist');
    const tabs = $$('[role="tab"], .tab', list);
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = doc.getElementById(t.getAttribute('aria-controls'));
        if (panel) {
          panel.hidden = !on;
          if (on) {
            panel.classList.remove('is-entering');
            void panel.offsetWidth;
            panel.classList.add('is-entering');
          }
        }
      });
      if (focus) tab.focus();
      list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: doc.getElementById(tab.getAttribute('aria-controls')), index: tabs.indexOf(tab) } }));
    };
    tabs.forEach(t => {
      t.setAttribute('role', 'tab');
      const panel = doc.getElementById(t.getAttribute('aria-controls'));
      if (panel) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', t.id);
        panel.tabIndex = 0;
      }
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', e => {
        const i = tabs.indexOf(t);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length], true);
      });
    });
    select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0], false);
  };

  App.segmented = group => {
    if (group._seg) return;
    group._seg = true;
    group.addEventListener('click', e => {
      const btn = e.target.closest('.seg__btn');
      if (!btn || !group.contains(btn)) return;
      $$('.seg__btn', group).forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      group.dispatchEvent(new CustomEvent('segchange', { detail: { value: btn.dataset.value, button: btn } }));
    });
  };

  App.stepper = el => {
    if (el._stepper) return;
    el._stepper = true;
    const input = $('.stepper__input', el);
    const btns = $$('.stepper__btn', el);
    const min = Number(input.min || 0), max = Number(input.max || 99);
    const sync = () => btns.forEach(b => { b.disabled = Number(b.dataset.step) < 0 ? Number(input.value) <= min : Number(input.value) >= max; });
    const set = v => {
      input.value = String(clamp(Math.round(v) || 0, min, max));
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    btns.forEach(b => b.addEventListener('click', () => set(Number(input.value) + Number(b.dataset.step))));
    input.addEventListener('change', e => { if (e.isTrusted) set(Number(input.value)); });
    sync();
  };


  /* ------------------------------------------------------------------
     13. 進場、數字滾動、動畫區暫停
     ------------------------------------------------------------------ */
  const pendingReveal = new Set();
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) showReveal(e.target); });
  }, { rootMargin: '0px 0px -6% 0px' });
  const showReveal = el => {
    pendingReveal.delete(el);
    revealIO.unobserve(el);
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    el.dispatchEvent(new CustomEvent('reveal'));
  };
  const registerReveal = el => {
    if (el._reveal) return;
    el._reveal = true;
    const r = el.getBoundingClientRect();
    // 初次載入就在視窗內（或已捲過）的直接顯示，不等 IO
    if (App.reduced || r.top < innerHeight) { showReveal(el); return; }
    pendingReveal.add(el);
    revealIO.observe(el);
  };
  // 保底：錨點跳轉、程式捲動或極快捲動時 IO 可能漏報，捲動停下後補上已在視窗內或已捲過的
  const sweepReveal = () => {
    pendingReveal.forEach(el => { if (el.getBoundingClientRect().top < innerHeight) showReveal(el); });
  };
  let sweepTimer = 0;
  addEventListener('scroll', () => { clearTimeout(sweepTimer); sweepTimer = setTimeout(sweepReveal, 160); }, { passive: true });
  addEventListener('load', () => setTimeout(sweepReveal, 1200));
  addEventListener('beforeprint', () => pendingReveal.forEach(showReveal));
  App.reveal = { show: showReveal, sweep: sweepReveal };

  App.countTo = (el, to, { dur = 900, fmt = App.fmt.num } = {}) => {
    cancelAnimationFrame(el._countRaf);
    const from = el._countVal ?? 0;
    if (App.reduced || from === to || dur <= 0) {
      el._countVal = to;
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = 1 - (1 - k) ** 3;
      const v = from + (to - from) * e;
      el._countVal = k === 1 ? to : v;
      el.textContent = fmt(Math.round(v));
      if (k < 1) el._countRaf = requestAnimationFrame(step);
    };
    el._countRaf = requestAnimationFrame(step);
  };

  const zoneIO = new IntersectionObserver(entries => {
    entries.forEach(e => { e.target._zoneVisible = e.isIntersecting; syncZone(e.target); });
  });
  const syncZone = el => el.classList.toggle('is-paused', !el._zoneVisible || doc.hidden);
  doc.addEventListener('visibilitychange', () => $$('[data-playzone]').forEach(syncZone));
  const registerZone = el => {
    if (el._zone) return;
    el._zone = true;
    el._zoneVisible = true;
    zoneIO.observe(el);
  };


  /* ------------------------------------------------------------------
     14. 初始化
     ------------------------------------------------------------------ */
  const injectDefs = () => {
    if ($('#pc-defs')) return;
    doc.body.insertAdjacentHTML('afterbegin', `<svg id="pc-defs" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true" focusable="false"><defs>
      <filter id="pc-layer" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow class="pc-flood" dx="0" dy="-2" stdDeviation="2.5" flood-opacity=".2"/><feDropShadow class="pc-flood" dx="0" dy="-7" stdDeviation="11" flood-opacity=".15"/></filter>
      <filter id="pc-cloud" filterUnits="userSpaceOnUse" x="-200" y="-300" width="2100" height="1500"><feDropShadow class="pc-flood" dx="0" dy="-2" stdDeviation="2.5" flood-opacity=".2"/><feDropShadow class="pc-flood" dx="0" dy="-7" stdDeviation="11" flood-opacity=".15"/></filter>
      <filter id="pc-shadow" x="-10%" y="-40%" width="120%" height="180%"><feDropShadow dx="0" dy="-1.2" stdDeviation="1.8" flood-color="#3c2410" flood-opacity=".26"/></filter>
      <filter id="pc-lift" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3c2410" flood-opacity=".3"/></filter>
      <filter id="pc-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs></svg>`);
  };

  App.scan = (scope = doc) => {
    const within = sel => {
      const list = $$(sel, scope);
      if (scope !== doc && scope.matches(sel)) list.unshift(scope);
      return list;
    };
    // 靜態 markup 裡寫 <span data-icon="clock" class="i--sm"></span>，換成對應的 svg（class 會帶過去）
    within('[data-icon]').forEach(el => { el.outerHTML = App.icon(el.dataset.icon, `i ${el.className}`.trim()); });
    within('[data-papercut]').forEach(el => App.papercut(el));
    within('[data-cut-divider]').forEach(App.cutDivider);
    within('[data-particles]').forEach(App.particles);
    within('[data-profile]').forEach(el => App.profile.mount(el));
    within('[data-tabs]').forEach(App.tabs);
    within('[data-segmented]').forEach(App.segmented);
    within('[data-stepper]').forEach(App.stepper);
    within('[data-playzone]').forEach(registerZone);
    within('[data-reveal]').forEach(registerReveal);
    syncSeasonButtons();
  };

  injectDefs();
  wireHeader();
  App.scan(doc);
})();
