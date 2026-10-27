/* ==========================================================================
   澄港市 港埕夜市導覽 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒。
     app.js 執行時會自動 App.scan(document)；頁面用 innerHTML 動態插入的內容，
     插完後呼叫 App.scan(容器) 讓 data-* 元件生效（重複呼叫是安全的）。

   資料（全站單一來源：攤名、價格、排隊、評分一律從這裡取，不要另外手打）
     App.data.market        夜市基本資料（名稱、地址、營業時間、管理單位）
     App.data.categories    5 類 {food 小吃, drink 飲品, dessert 甜點, game 遊戲, goods 雜貨}
                            每類 {key,label,en,color,neon,icon}
     App.data.grades        衛生評核 {A 優, B 良, C 輔導中}；遊戲、雜貨攤 grade = null（免評核）
     App.data.stalls        48 攤，欄位：
                              id 'A07'、name、cat、sign('red'|'yellow'|'white'|'black' 招牌配色)
                              since 創業年、owner、queue 目前排隊分鐘、votes 人氣票數、rating、reviews
                              grade、hours、rest 公休、pay[]、tags[]、blurb、menu [[品名, 價格], ...]
                            衍生欄位（自動算）：dish/dishPrice（menu 第一道＝招牌）、price [min,max]、
                              priceLevel 1–3、heat 0–100（票數相對最高者）、zone、url（stall.html?id=XXX）
                            A07「阿娥蚵仔煎」是焦點攤，另有 stall.detail（評價分布、留言、白板備註、衛生評核細項）
     App.data.zones         5 個人潮區 {id,name,rect:[x,y,w,h],base,weight}
     App.data.facilities    廁所 toilet / 垃圾分類站 trash / ATM atm / 服務台 info，含地圖座標
     App.data.facilityTypes 各設施的 {label,color,icon}
     App.data.routes        3 條建議動線 {id,name,time,dist,desc,stops[],points[[x,y],...]}（地圖座標）
     App.data.events        本週活動（2026-10-19 ~ 10-25），App.data.eventTypes 活動類型色
     App.data.parking       停車場（P1–P3 汽車、M1 機車），App.data.transit 捷運／公車／單車
     App.data.hygiene       本季評核資訊（季別、公布日、評核項目）
     App.data.crowdCurve    今晚每半小時人潮指數（17:00–00:30，含預估）
     App.stall(id)  App.category(key)  App.stallsBy(cat)  App.sorters.{popular,rating,queue,price}
     App.rank(kind, n)      'popular'|'rating'|'queue' 的必吃排行（只含小吃／飲品／甜點）
     App.ratingDist(stall)  → [5★,4★,3★,2★,1★] 則數（合計 = reviews，平均 ≈ rating）
     App.gradeCounts()      → {A,B,C} 各等級攤數

   時間
     App.now()   故事裡的「現在」：2026-10-23（五）20:40 起算，之後跟著真實經過時間走
     App.TODAY = '2026-10-23'；App.date('2026-10-25') → Date
     App.market.status() → {open,label,closeAt,openAt}（營業 17:00–00:30，跨午夜）

   格式
     App.fmt.num(3482)→"3,482"  .price(75)→"NT$75"  .range([50,115])→"NT$50–115"
     .hm(date)→"20:41"  .dur(ms)→"3:49:12"  .md(iso)→"10/23"  .wd(iso)→"五"  .day(iso)→"10/23（五）"
     .queue(26)→"約 26 分"（0 → "免排隊"）  .cnYear(1983)→"一九八三"
     App.esc(str)   HTML 跳脫
     App.icon(name, cls)  內嵌線條圖示 SVG 字串：search pin clock heart star fire arrow chevron close check
       toilet trash atm info metro bus car scooter bike walk parking calendar bell map route people
       shield leaf drop bowl cup ice target bag menu filter phone grid list
     App.art('stool')     空狀態插畫（紅色塑膠椅）

   等級
     App.queueLevel(min)  → {key:'short'|'mid'|'long', label:'順暢'|'稍候'|'久候', color}
     App.crowdLevel(v)    → {key:'calm'|'lively'|'busy'|'packed', label:'舒適'|'熱絡'|'擁擠'|'爆滿', color}

   HTML 片段（回傳字串；插入後若含 data-* 元件記得 App.scan）
     App.signHTML(text, {variant, sub, seal, size, off, cls})   直式壓克力招牌 .signboard
     App.stallCardHTML(stall, {fav=true, off=true})              攤位招牌卡 .stall-card（hover 通電）
     App.catHTML(cat)  App.gradeHTML(grade, 'sm'|'lg')  App.queueHTML(min)
     App.priceBandHTML(stall)  App.starsHTML(rating, reviews)  App.favBtnHTML(id)
     App.gradeSealSVG(grade)   大型衛生評核圓章（環形文字），給攤位詳情頁

   即時人潮（全站共用同一個模擬器，首頁與地圖數字一致）
     App.crowd.subscribe(fn)  → fn({index, level, updatedAt, zones:[{id,name,value,level}]})
                                立即呼叫一次，之後每 5 秒更新；回傳 unsubscribe()
     App.crowd.state          目前快照

   口袋名單（收藏）
     App.favs.has(id) / .toggle(id, on?) / .list() / .size
     [data-fav="A07"] 按鈕自動切換（aria-pressed＋toast＋復原）；document 觸發 'favchange' {id,on}
     [data-fav-count] 自動顯示數量；頁首「口袋名單」對話框由 app.js 自動注入

   夜市平面圖（stall.html、map.html、首頁共用）
     App.map.render(host, {labels, interactive, onSelect(stall, el), highlight:'A07',
                           facilities:true|['toilet',...]|false, zones:false, title})
       → { svg, cell(id), highlight(id|null), filter([cats]|null), showFacilities([types]),
           zone(id), focusZone(id|null), layer('overlay'|'zones'|'cells'|'facilities'|'marker'), destroy() }
       座標系 viewBox 0 0 1200 760；路線請畫進 layer('overlay')。
     App.map.cellRect(id) → {x,y,w,h}   App.map.cellCenter(id) → [x,y]
     App.map.meters(單位) → 公尺（取整到 10）  App.map.walkMeters(ax,ay,bx,by) → 步行估算公尺（直線 ×1.25）
     App.map.nearestFacility(type, x, y) → {f, m}  離座標最近的某類設施與步行公尺數
     App.map.aisle = {west:8, east:1192, upper:322, lower:344, laneX:615, plazaX:[410,448]}

   UI
     App.toast(msg, {tone:'pink'|'cyan'|'yellow'|'green'|'red', title, action:{label,onClick}, timeout})
       modal 開著時 toast 會自動移進 dialog（top layer）以保持可見
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="dialogId"] 開啟、[data-modal-close] 關閉；點背景或 Esc 也會關
     App.tabs(tablist)        [data-tabs] 自動初始化；切換時 tablist 觸發 'tabchange' {tab,panel,index}
     App.segmented(group)     [data-segmented] 自動初始化；觸發 'segchange' {value,button}
     App.tooltip.show(html, clientX, clientY) / .move(x, y) / .hide()
     App.field.setError(input, msg) / App.field.clear(form)
     App.valid.required / phone / email
     [data-toast="訊息"]      沒有實際目的地的按鈕：點了顯示該訊息
     [data-open-status]       營業狀態膠囊   [data-countdown] 距打烊倒數   [data-clock] 故事時間 HH:MM

   招牌動態（皆在 prefers-reduced-motion 時直接顯示終態；離開視窗或分頁隱藏時暫停）
     [data-neon="pink|cyan|yellow|red|green|violet|white"]  霓虹燈管字：逐字點亮＋偶發閃爍
         data-neon-delay="600"（ms 後開始）data-neon-step="150"（每字間隔）
         data-neon-glitch="off"（關閉偶發閃爍）data-neon-buzz="2"（第 3 個字是接觸不良的燈管）
         可加在 .neon-frame 上：外框燈管跟著通電。點亮完成觸發 'neon:on'
     App.neon(el).glitch()     手動觸發一次閃爍
     App.ignite(signboard)     讓 .signboard 播一次「通電」閃爍（例：地圖點選後對應招牌亮起）
     [data-bulbs]              燈泡串跑馬燈 SVG（容器需有寬高）
         data-bulbs-gap="34" data-bulbs-sag="12" data-bulbs-spans="3" data-bulbs-colors="warm|mix" data-bulbs-r="4"
     [data-steam="3"]          攤位蒸氣（容器 absolute 定位，預設 60×120）
     [data-marquee] > .led__track > .led__item   紅色 LED 跑馬燈（data-speed 每秒像素）
     [data-reveal]             進場："" | "left" | "right" | "swing" | "flicker"；style="--rd:120ms" 錯開
     [data-count="74"]         數字遞增（data-decimals 選填）；App.setCount(el, n) 更新
     [data-live]               讓元素內的 CSS 無限動畫在離開視窗時暫停（加 .is-paused）
     App.animate(el, fn)       只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(t, dt)，回傳 stop()
     App.reducedMotion         目前是否要求減少動態（getter）
   ========================================================================== */
(function () {
  'use strict';

  const App = {};
  window.App = App;
  document.documentElement.classList.add('js');

  /* =========================================================
     0. 小工具
     ========================================================= */
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  App.$ = $;
  App.$$ = $$;
  App.clamp = clamp;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
  App.esc = esc;

  // 可重現的亂數（mulberry32）：同一個 seed 每次載入結果相同，截圖與文案中的數字才對得上
  App.rng = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* =========================================================
     1. 時間與格式
     ========================================================= */
  // 故事裡的「現在」固定從 2026-10-23（五）20:40 起算，之後跟著真實經過的時間走：
  // 倒數與即時數字會動，但畫面永遠停在「今晚營業中」的尖峰時段。
  const STORY_START = new Date(2026, 9, 23, 20, 40, 0).getTime();
  const BOOT = Date.now();
  App.TODAY = '2026-10-23';
  App.now = () => new Date(STORY_START + (Date.now() - BOOT));
  App.date = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const WD = '日一二三四五六';
  const CN_DIGIT = '〇一二三四五六七八九';
  const pad = n => String(n).padStart(2, '0');
  App.fmt = {
    num: n => Math.round(Number(n)).toLocaleString('zh-TW'),
    price: n => 'NT$' + n,
    range: ([a, b]) => (a === b ? 'NT$' + a : `NT$${a}–${b}`),
    hm: d => pad(d.getHours()) + ':' + pad(d.getMinutes()),
    dur: ms => {
      const s = Math.max(0, Math.floor(ms / 1000));
      return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    },
    md: iso => {
      const d = App.date(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    },
    wd: iso => WD[App.date(iso).getDay()],
    day: iso => `${App.fmt.md(iso)}（${App.fmt.wd(iso)}）`,
    queue: m => (m <= 0 ? '免排隊' : `約 ${m} 分`),
    cnYear: y => String(y).split('').map(d => CN_DIGIT[+d]).join(''),
  };

  /* =========================================================
     2. 資料
     ========================================================= */
  const market = {
    name: '港埕夜市',
    en: 'GANGCHENG NIGHT MARKET',
    since: 1968,
    district: '港埕區',
    address: '澄港市港埕區港埕路 120 號一帶（福安宮前至魚市巷）',
    hours: { open: '17:00', close: '00:30' },
    rest: '全年無休（部分攤位另有公休日）',
    phone: '服務台 2361-1968',
    organizer: '港埕夜市自治會',
    advisor: '澄港市政府經濟發展局 市場管理處',
    weather: '今晚 22°C · 東北風 2 級 · 降雨機率 10%',
  };
  market.status = (now = App.now()) => {
    const m = now.getHours() * 60 + now.getMinutes();
    const OPEN = 17 * 60;
    const CLOSE = 30; // 隔日 00:30
    if (m >= OPEN || m < CLOSE) {
      const closeAt = new Date(now);
      if (m >= OPEN) closeAt.setDate(closeAt.getDate() + 1);
      closeAt.setHours(0, 30, 0, 0);
      return { open: true, label: '營業中', closeAt, openAt: null };
    }
    const openAt = new Date(now);
    openAt.setHours(17, 0, 0, 0);
    return { open: false, label: '準備中', closeAt: null, openAt };
  };
  App.market = market;

  const categories = {
    food: { key: 'food', label: '小吃', en: 'EATS', color: '#FF2E88', neon: 'pink', icon: 'bowl' },
    drink: { key: 'drink', label: '飲品', en: 'DRINKS', color: '#2EF2FF', neon: 'cyan', icon: 'cup' },
    dessert: { key: 'dessert', label: '甜點', en: 'SWEETS', color: '#FFC93C', neon: 'yellow', icon: 'ice' },
    game: { key: 'game', label: '遊戲', en: 'GAMES', color: '#7CFF6B', neon: 'green', icon: 'target' },
    goods: { key: 'goods', label: '雜貨', en: 'GOODS', color: '#B98CFF', neon: 'violet', icon: 'bag' },
  };

  const grades = {
    A: { key: 'A', label: '優', full: '衛生評核 優等', color: '#3DDC97', desc: '五大項皆達標，冷藏溫度與餐具消毒有完整紀錄。' },
    B: { key: 'B', label: '良', full: '衛生評核 良好', color: '#2EF2FF', desc: '整體合格，有一至兩項需在下季前改善。' },
    C: { key: 'C', label: '輔導中', full: '衛生評核 輔導中', color: '#FF8A3D', desc: '有待改善項目，衛生所兩週內複查，複查通過即可升級。' },
  };

  const DEFAULT_HOURS = '17:00–00:30';
  const CASH = ['現金'];
  const BOTH = ['現金', '行動支付'];

  /* 攤位：A 排＝港埕路北側、B 排＝港埕路南側（B08 與 B09 之間是魚市巷口）、
     C／D 排＝魚市巷西／東側、E 區＝福安宮廟埕遊戲攤。menu 第一道是招牌。 */
  const stalls = [
    { id: 'A01', name: '港口大腸包小腸', cat: 'food', sign: 'yellow', since: 1996, owner: '黃俊雄', queue: 12, votes: 1842, rating: 4.4, reviews: 642, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['炭烤', '可外帶'],
      blurb: '糯米腸先烤到外皮焦脆再剖開夾香腸，蒜片、酸菜、小黃瓜自己加。',
      menu: [['原味大腸包小腸', 70], ['黑胡椒大腸包小腸', 75], ['蒜味香腸', 45], ['糯米腸', 40]] },
    { id: 'A02', name: '北岸炭窯胡椒餅', cat: 'food', sign: 'red', since: 2004, owner: '吳家豪', queue: 18, votes: 2210, rating: 4.6, reviews: 903, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['現烤', '整點出爐'],
      blurb: '每二十分鐘出一爐，餅貼在甕窯壁上烤到起酥，咬開小心肉汁燙口。',
      menu: [['胡椒餅', 60], ['蔥多多胡椒餅', 65], ['素胡椒餅', 55]] },
    { id: 'A03', name: '阿堂臭豆腐', cat: 'food', sign: 'white', since: 1988, owner: '陳文堂', queue: 22, votes: 2950, rating: 4.6, reviews: 1104, grade: 'A', rest: '週二', pay: CASH, tags: ['老字號', '泡菜自製'],
      blurb: '外酥內嫩，台式泡菜醃足三天；麻辣臭豆腐的鴨血每天下午現滷。',
      menu: [['酥炸臭豆腐', 60], ['大份酥炸臭豆腐', 90], ['麻辣臭豆腐', 80], ['清蒸臭豆腐', 70]] },
    { id: 'A04', name: '港埕木瓜牛奶', cat: 'drink', sign: 'yellow', since: 1979, owner: '許美玲', queue: 6, votes: 1520, rating: 4.3, reviews: 488, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['現打', '老字號'],
      blurb: '溪洲區契作木瓜現打，不加冰塊改用冰牛奶，濃到要用粗吸管。',
      menu: [['木瓜牛奶', 60], ['香蕉牛奶', 55], ['酪梨牛奶', 80], ['綜合果汁', 50]] },
    { id: 'A05', name: '港埕鹽酥雞', cat: 'food', sign: 'red', since: 1999, owner: '林正雄', queue: 15, votes: 2380, rating: 4.5, reviews: 977, grade: 'B', rest: '全年無休', pay: BOTH, tags: ['九層塔', '可加辣'],
      blurb: '雞肉醃一晚、下鍋炸兩次，九層塔最後才丟，撒胡椒鹽和梅粉。',
      menu: [['鹽酥雞', 70], ['甜不辣', 40], ['四季豆', 40], ['炸魷魚', 100], ['綜合大份', 150]] },
    { id: 'A06', name: '舊城當歸鴨麵線', cat: 'food', sign: 'black', since: 1985, owner: '蔡麗卿', queue: 9, votes: 1310, rating: 4.4, reviews: 455, grade: 'A', rest: '全年無休', pay: CASH, tags: ['湯品', '老字號'],
      blurb: '當歸、川芎、枸杞熬六小時，鴨腿燉到骨肉分離，麵線另外燙不糊。',
      menu: [['當歸鴨肉麵線', 75], ['當歸鴨腿', 120], ['當歸湯麵線', 55], ['當歸鴨肉冬粉', 75]] },
    { id: 'A07', name: '阿娥蚵仔煎', cat: 'food', sign: 'red', since: 1983, owner: '林秀娥', queue: 26, votes: 3482, rating: 4.7, reviews: 1286, grade: 'A', hours: '17:00–00:00', rest: '週一', pay: BOTH, tags: ['老字號', '排隊名店', '鹽田蚵'],
      blurb: '鹽田區每天直送的小顆鮮蚵，地瓜粉漿煎到邊緣酥脆，淋上自調甜辣醬。',
      menu: [['蚵仔煎', 75], ['蝦仁煎', 85], ['綜合煎', 110], ['蚵仔湯', 50], ['蚵仔煎＋蚵仔湯', 115]] },
    { id: 'A08', name: '老街青草茶', cat: 'drink', sign: 'black', since: 1972, owner: '張金滿', queue: 3, votes: 980, rating: 4.2, reviews: 301, grade: 'A', hours: '17:00–23:30', rest: '全年無休', pay: CASH, tags: ['老字號', '退火'],
      blurb: '十二種青草在舊城老家煎煮，退火解膩，吃完鹽酥雞剛好。',
      menu: [['青草茶', 30], ['苦茶', 35], ['洛神花茶', 35], ['青草茶（大）', 45]] },
    { id: 'A09', name: '新灣巨無霸雞排', cat: 'food', sign: 'yellow', since: 2008, owner: '劉子瑋', queue: 14, votes: 2105, rating: 4.3, reviews: 812, grade: 'B', rest: '全年無休', pay: BOTH, tags: ['比臉大', '可切塊'],
      blurb: '雞排先拍薄再裹地瓜粉，起司款會牽絲，建議在攤前趁熱吃。',
      menu: [['香雞排', 85], ['辣味雞排', 85], ['起司雞排', 100], ['雞皮', 40]] },
    { id: 'A10', name: '阿伯章魚燒', cat: 'food', sign: 'white', since: 2011, owner: '鄭國華', queue: 10, votes: 1180, rating: 4.2, reviews: 390, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['柴魚多', '現烤'],
      blurb: '章魚腳切大塊，柴魚片多到會跳舞；明太子口味是隱藏版。',
      menu: [['章魚燒（6 顆）', 60], ['章魚燒（10 顆）', 90], ['明太子章魚燒', 80]] },
    { id: 'A11', name: '古早味粉圓冰', cat: 'dessert', sign: 'white', since: 1981, owner: '王秀琴', queue: 7, votes: 1690, rating: 4.5, reviews: 612, grade: 'A', rest: '全年無休', pay: CASH, tags: ['老字號', '黑糖'],
      blurb: '粉圓每天下午現煮，黑糖水用二砂慢熬；四料自己挑，芋頭最快賣完。',
      menu: [['粉圓冰', 45], ['綜合剉冰（四料）', 55], ['紅豆牛奶冰', 60], ['黑糖粉圓（熱）', 45]] },
    { id: 'A12', name: '阿水麻油雞', cat: 'food', sign: 'black', since: 1990, owner: '何清水', queue: 11, votes: 1240, rating: 4.5, reviews: 420, grade: 'A', rest: '週一', pay: CASH, tags: ['湯品', '暖身'],
      blurb: '黑麻油和老薑煸到焦香才下雞肉，湯頭全用米酒，喝完暖到手心。',
      menu: [['麻油雞麵線', 110], ['麻油雞腿', 140], ['麻油腰子', 150], ['麻油麵線', 50]] },
    { id: 'A13', name: '港口炭烤魷魚', cat: 'food', sign: 'red', since: 2002, owner: '蘇建志', queue: 8, votes: 1050, rating: 4.3, reviews: 356, grade: 'B', rest: '全年無休', pay: BOTH, tags: ['炭烤', '可加辣'],
      blurb: '整尾魷魚邊烤邊刷醬，剪成一口大小，撒七味粉再加一把蔥花。',
      menu: [['炭烤魷魚', 120], ['炭烤小卷', 100], ['烤杏鮑菇', 60], ['烤玉米筍', 50]] },
    { id: 'A14', name: '黑糖珍珠鮮奶', cat: 'drink', sign: 'yellow', since: 2017, owner: '謝宜庭', queue: 13, votes: 1960, rating: 4.4, reviews: 734, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['現炒黑糖', '虎紋'],
      blurb: '珍珠在攤前大鍋現炒黑糖，杯壁掛出虎紋；預設全糖，少糖要先說。',
      menu: [['黑糖珍珠鮮奶', 65], ['珍珠奶茶', 50], ['冬瓜檸檬', 45], ['仙草凍奶茶', 55]] },

    { id: 'B01', name: '鹽田碳烤玉米', cat: 'food', sign: 'red', since: 1993, owner: '李財發', queue: 16, votes: 1720, rating: 4.4, reviews: 588, grade: 'A', rest: '全年無休', pay: CASH, tags: ['炭烤', '沙茶'],
      blurb: '玉米先蒸熟再上炭火，醬油膏、沙茶刷三輪，等待時間就是香氣。',
      menu: [['古早味烤玉米', 80], ['辣味烤玉米', 85], ['烤玉米（特大）', 100]] },
    { id: 'B02', name: '雲嶺山豬肉香腸', cat: 'food', sign: 'yellow', since: 2000, owner: '高志明', queue: 5, votes: 1390, rating: 4.3, reviews: 467, grade: 'B', rest: '全年無休', pay: CASH, tags: ['擲骰子', '炭烤'],
      blurb: '雲嶺區自家灌的香腸，可以擲骰子比大小，贏了多送一支。',
      menu: [['山豬肉香腸', 45], ['飛魚卵香腸', 50], ['蒜味香腸', 45], ['香腸三支', 120]] },
    { id: 'B03', name: '溪洲蚵嗲', cat: 'food', sign: 'white', since: 1991, owner: '陳寶珠', queue: 8, votes: 1120, rating: 4.4, reviews: 362, grade: 'A', rest: '全年無休', pay: CASH, tags: ['鹽田蚵', '現炸'],
      blurb: '米漿麵糊包高麗菜、韭菜和滿滿的蚵仔，炸到金黃後撒胡椒鹽。',
      menu: [['蚵嗲', 55], ['蝦嗲', 55], ['韭菜嗲', 40], ['綜合嗲', 70]] },
    { id: 'B04', name: '阿嬤紅豆餅', cat: 'dessert', sign: 'yellow', since: 1986, owner: '簡月英', queue: 9, votes: 1450, rating: 4.5, reviews: 520, grade: 'A', rest: '全年無休', pay: CASH, tags: ['老字號', '手熬紅豆'],
      blurb: '紅豆自己熬、不打成泥留顆粒；十個一盒最划算，冷了也好吃。',
      menu: [['紅豆車輪餅', 15], ['奶油車輪餅', 15], ['芋頭車輪餅', 18], ['十個綜合盒', 140]] },
    { id: 'B05', name: '老曹滷味', cat: 'food', sign: 'black', since: 1995, owner: '曹永福', queue: 17, votes: 1660, rating: 4.4, reviews: 610, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['自選', '可加辣'],
      blurb: '四十多種料自己夾，滷汁每天濾一次；酸菜、蔥花、辣油要多少說一聲。',
      menu: [['滷味自選組合', 80], ['鴨翅', 35], ['王子麵', 15], ['燙青菜', 30]] },
    { id: 'B06', name: '甘蔗伯原汁', cat: 'drink', sign: 'yellow', since: 1977, owner: '鄭德發', queue: 4, votes: 760, rating: 4.1, reviews: 233, grade: 'A', rest: '全年無休', pay: CASH, tags: ['現榨', '老字號'],
      blurb: '紅甘蔗當場去皮壓榨，加一點檸檬更清爽，一晚大概榨掉三百支。',
      menu: [['現榨甘蔗汁', 50], ['甘蔗檸檬', 55], ['甘蔗汁（大）', 70]] },
    { id: 'B07', name: '雞蛋糕小舖', cat: 'dessert', sign: 'white', since: 2013, owner: '楊佩珊', queue: 6, votes: 980, rating: 4.3, reviews: 340, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['造型', '親子'],
      blurb: '小熊、海豚、章魚造型模具，外皮微脆，裡面像蜂蜜蛋糕。',
      menu: [['動物雞蛋糕（10 顆）', 50], ['巧克力雞蛋糕', 60], ['雞蛋糕（20 顆）', 90]] },
    { id: 'B08', name: '三代刈包', cat: 'food', sign: 'red', since: 1970, owner: '周志遠', queue: 10, votes: 1280, rating: 4.5, reviews: 431, grade: 'A', rest: '週三', pay: CASH, tags: ['老字號', '三代傳承'],
      blurb: '肥瘦相間的滷五花、酸菜、花生糖粉、香菜，第三代仍照爺爺的比例。',
      menu: [['刈包', 65], ['瘦肉刈包', 70], ['四神湯', 50], ['刈包＋四神湯', 110]] },
    { id: 'B09', name: '小林生煎包', cat: 'food', sign: 'yellow', since: 2006, owner: '林志豪', queue: 12, votes: 1350, rating: 4.4, reviews: 498, grade: 'B', rest: '全年無休', pay: CASH, tags: ['底部焦脆', '會噴湯'],
      blurb: '大平底鍋一次排滿八十顆，淋水蓋鍋悶到底部焦脆，一咬會噴湯。',
      menu: [['高麗菜生煎包', 15], ['鮮肉生煎包', 18], ['韭菜生煎包', 15], ['四顆綜合', 60]] },
    { id: 'B10', name: '糖葫蘆張', cat: 'dessert', sign: 'red', since: 2015, owner: '張詩涵', queue: 3, votes: 620, rating: 4.1, reviews: 205, grade: 'A', hours: '17:30–23:00', rest: '全年無休', pay: CASH, tags: ['麥芽糖', '拍照'],
      blurb: '麥芽糖熬到拉絲才裹，冷卻後一咬會碎；草莓款十二月才開賣。',
      menu: [['番茄蜜餞糖葫蘆', 40], ['葡萄糖葫蘆', 45], ['綜合水果串', 50]] },
    { id: 'B11', name: '鹽田西瓜汁', cat: 'drink', sign: 'white', since: 2010, owner: '黃詩婷', queue: 4, votes: 700, rating: 4.0, reviews: 198, grade: 'C', rest: '全年無休', pay: CASH, tags: ['現打'],
      blurb: '鹽田區沙地西瓜現打不加水，西瓜牛奶是夏天賣最好的一杯。',
      menu: [['鮮榨西瓜汁', 50], ['西瓜牛奶', 60], ['芭樂汁', 50]] },
    { id: 'B12', name: '北岸蔥油餅', cat: 'food', sign: 'yellow', since: 1998, owner: '江淑芬', queue: 14, votes: 1580, rating: 4.5, reviews: 556, grade: 'A', rest: '全年無休', pay: CASH, tags: ['炸蛋', '半熟蛋黃'],
      blurb: '整顆蛋下油鍋炸到蛋白起泡，蓋上蔥油餅一起翻面，蛋黃保持半熟。',
      menu: [['炸蛋蔥油餅', 50], ['起司蔥油餅', 55], ['九層塔蔥油餅', 50], ['原味蔥油餅', 35]] },

    { id: 'C01', name: '魚市巷花枝羹', cat: 'food', sign: 'black', since: 1975, owner: '吳金鳳', queue: 9, votes: 1230, rating: 4.4, reviews: 401, grade: 'A', rest: '全年無休', pay: CASH, tags: ['老字號', '羹湯'],
      blurb: '花枝漿包整塊花枝肉，羹湯用柴魚和大白菜熬甜，加烏醋最對味。',
      menu: [['花枝羹', 65], ['花枝羹麵', 75], ['花枝羹米粉', 75], ['炸花枝丸', 50]] },
    { id: 'C02', name: '阿美碗粿', cat: 'food', sign: 'white', since: 1980, owner: '李美雲', queue: 2, votes: 540, rating: 4.2, reviews: 176, grade: 'A', hours: '17:00–22:00', rest: '週日', pay: CASH, tags: ['老字號', '賣完為止'],
      blurb: '在來米漿蒸到軟Q，碗底藏滷肉和鹹蛋黃，淋上甜醬油膏和蒜泥。',
      menu: [['碗粿', 40], ['菜粿', 35], ['肉粿', 45]] },
    { id: 'C03', name: '雲嶺豆花', cat: 'dessert', sign: 'white', since: 1994, owner: '邱淑惠', queue: 5, votes: 1100, rating: 4.6, reviews: 388, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['山泉水', '冷熱皆有'],
      blurb: '雲嶺山泉水磨黃豆，石膏點得嫩；冬天加薑汁糖水，夏天吃冰的。',
      menu: [['花生豆花', 45], ['粉圓豆花', 45], ['薑汁豆花（熱）', 50], ['三料豆花', 55]] },
    { id: 'C04', name: '山腳炸肉圓', cat: 'food', sign: 'red', since: 1989, owner: '廖國棟', queue: 7, votes: 890, rating: 4.3, reviews: 300, grade: 'B', rest: '全年無休', pay: CASH, tags: ['油炸', '老字號'],
      blurb: '地瓜粉皮炸到半透明，內餡是筍丁和紅糟肉，醬汁甜中帶辣。',
      menu: [['炸肉圓', 50], ['清蒸肉圓', 50], ['魚丸湯', 30]] },
    { id: 'C05', name: '鹽田檸檬愛玉', cat: 'drink', sign: 'yellow', since: 2001, owner: '盧佳玲', queue: 2, votes: 650, rating: 4.2, reviews: 214, grade: 'A', rest: '全年無休', pay: CASH, tags: ['手洗愛玉', '解渴'],
      blurb: '愛玉籽每天手洗，檸檬現擠不用濃縮汁，酸度剛好解油膩。',
      menu: [['檸檬愛玉', 40], ['蜂蜜檸檬愛玉', 50], ['百香愛玉', 45]] },
    { id: 'C06', name: '三雙一百', cat: 'goods', sign: 'yellow', since: 2007, owner: '陳雅惠', queue: 0, votes: 320, rating: 4.0, reviews: 96, grade: null, hours: '17:30–23:00', rest: '全年無休', pay: CASH, tags: ['襪子', '銅板價'],
      blurb: '棉襪、毛巾襪、船型襪一字排開，三雙一百元，可以混搭挑。',
      menu: [['棉襪三雙', 100], ['毛巾襪三雙', 150], ['船型襪五雙', 100]] },
    { id: 'C07', name: '阿龍手機殼', cat: 'goods', sign: 'white', since: 2016, owner: '黃家龍', queue: 0, votes: 280, rating: 3.9, reviews: 88, grade: null, hours: '17:30–23:00', rest: '全年無休', pay: BOTH, tags: ['3C 配件', '現場貼膜'],
      blurb: '主流機型手機殼與充電線都有，玻璃保護貼現場免費代貼。',
      menu: [['透明防摔殼', 199], ['造型手機殼', 250], ['快充線', 150], ['行動電源', 590]] },
    { id: 'C08', name: '溪洲手工皂', cat: 'goods', sign: 'white', since: 2019, owner: '蔡宛蓁', queue: 0, votes: 240, rating: 4.6, reviews: 72, grade: null, hours: '17:30–23:00', rest: '週一', pay: BOTH, tags: ['冷製皂', '伴手禮'],
      blurb: '溪洲區苦茶油與艾草做的冷製皂，熟成四十天，攤上可以試洗。',
      menu: [['苦茶油手工皂', 120], ['艾草皂', 120], ['三塊禮盒', 330]] },

    { id: 'D01', name: '冬瓜茶王', cat: 'drink', sign: 'black', since: 1968, owner: '楊坤山', queue: 2, votes: 820, rating: 4.3, reviews: 266, grade: 'A', rest: '全年無休', pay: CASH, tags: ['第一攤', '老字號'],
      blurb: '港埕夜市的第一攤：冬瓜塊與二砂熬一整個下午，甜而不膩。',
      menu: [['古早味冬瓜茶', 25], ['冬瓜檸檬', 40], ['冬瓜鮮奶', 50]] },
    { id: 'D02', name: '杏仁茶油條', cat: 'drink', sign: 'white', since: 1982, owner: '唐德明', queue: 3, votes: 590, rating: 4.4, reviews: 190, grade: 'A', hours: '18:00–00:30', rest: '全年無休', pay: CASH, tags: ['熱飲', '老字號'],
      blurb: '南杏北杏比例三比一，加米漿煮到濃稠；油條每半小時現炸。',
      menu: [['杏仁茶', 40], ['杏仁茶＋油條', 55], ['杏仁豆腐', 40]] },
    { id: 'D03', name: '拔絲地瓜球', cat: 'dessert', sign: 'yellow', since: 2009, owner: '鄭雅文', queue: 8, votes: 1020, rating: 4.3, reviews: 345, grade: 'B', rest: '全年無休', pay: BOTH, tags: ['現炸', '拉絲'],
      blurb: '地瓜球壓扁再膨起，外脆內空；拔絲款裹麥芽糖，夾起來會牽絲。',
      menu: [['拔絲地瓜球', 50], ['原味地瓜球', 40], ['QQ 蛋', 40]] },
    { id: 'D04', name: '芋圓燒仙草', cat: 'dessert', sign: 'red', since: 2003, owner: '羅文傑', queue: 6, votes: 1150, rating: 4.5, reviews: 402, grade: 'A', rest: '全年無休', pay: BOTH, tags: ['手作芋圓', '熱甜湯'],
      blurb: '仙草乾熬八小時勾芡，芋圓、地瓜圓手揉，花生煮到入口即化。',
      menu: [['芋圓燒仙草', 55], ['花生燒仙草', 50], ['芋圓冰', 55]] },
    { id: 'D05', name: '雪花冰小築', cat: 'dessert', sign: 'white', since: 2014, owner: '方婉婷', queue: 9, votes: 870, rating: 4.4, reviews: 290, grade: 'C', rest: '全年無休', pay: BOTH, tags: ['綿綿冰', '分享'],
      blurb: '牛奶冰磚刨成薄片，花生醬和煉乳層層淋，兩人分一盤剛好。',
      menu: [['花生牛奶雪花冰', 110], ['黑糖珍珠雪花冰', 120], ['芋頭雪花冰', 110]] },
    { id: 'D06', name: '小花髮飾', cat: 'goods', sign: 'white', since: 2018, owner: '吳小涵', queue: 0, votes: 260, rating: 4.2, reviews: 81, grade: null, hours: '17:30–23:00', rest: '全年無休', pay: BOTH, tags: ['手作', '小物'],
      blurb: '店主手縫的布花髮夾與大腸髮圈，一款通常只做五個。',
      menu: [['手作布花髮夾', 80], ['大腸髮圈', 50], ['鯊魚夾', 120]] },
    { id: 'D07', name: '古早童玩', cat: 'goods', sign: 'yellow', since: 1988, owner: '許東山', queue: 0, votes: 410, rating: 4.5, reviews: 133, grade: null, hours: '17:30–23:00', rest: '全年無休', pay: CASH, tags: ['陀螺', '老師傅'],
      blurb: '木頭陀螺自己車、竹蜻蜓自己削，老闆會教到你打得起來為止。',
      menu: [['木頭陀螺', 150], ['竹蜻蜓', 50], ['尪仔標一疊', 40]] },
    { id: 'D08', name: '小森多肉', cat: 'goods', sign: 'white', since: 2020, owner: '林欣妤', queue: 0, votes: 230, rating: 4.4, reviews: 64, grade: null, hours: '17:30–23:00', rest: '週二', pay: BOTH, tags: ['盆栽', '療癒'],
      blurb: '雲嶺區溫室直送的多肉與空氣鳳梨，附手寫照顧小卡。',
      menu: [['多肉小盆栽', 120], ['仙人掌組盆', 260], ['空氣鳳梨', 80]] },

    { id: 'E01', name: '神射手射氣球', cat: 'game', sign: 'red', since: 1999, owner: '洪志成', queue: 6, votes: 720, rating: 4.2, reviews: 210, grade: null, hours: '18:00–23:30', rest: '全年無休', pay: CASH, tags: ['射擊', '換獎品'],
      blurb: '十發射中八顆換大娃娃，彈道很直，老闆會先示範一次。',
      menu: [['射氣球十發', 100], ['射氣球二十五發', 200]] },
    { id: 'E02', name: '大家來套圈圈', cat: 'game', sign: 'yellow', since: 1985, owner: '鄭麗華', queue: 8, votes: 860, rating: 4.3, reviews: 254, grade: null, hours: '18:00–23:30', rest: '全年無休', pay: CASH, tags: ['擂台賽', '親子'],
      blurb: '地上擺滿彈珠汽水和玩偶，套中哪個拿哪個，週六有擂台賽。',
      menu: [['套圈圈十五圈', 100], ['套圈圈四十圈', 200]] },
    { id: 'E03', name: '古早彈珠台', cat: 'game', sign: 'white', since: 1978, owner: '林添福', queue: 4, votes: 540, rating: 4.4, reviews: 170, grade: null, hours: '18:00–23:30', rest: '全年無休', pay: CASH, tags: ['懷舊', '親子'],
      blurb: '木框彈珠台是老闆父親親手做的，打進中間洞口可換一支冰棒。',
      menu: [['彈珠台一盤', 50], ['彈珠台三盤', 120]] },
    { id: 'E04', name: '九宮格投球', cat: 'game', sign: 'red', since: 2005, owner: '莊文雄', queue: 5, votes: 480, rating: 4.1, reviews: 140, grade: null, hours: '18:00–23:30', rest: '全年無休', pay: CASH, tags: ['投球', '連線'],
      blurb: '十二顆球打九宮格，連成一線換小獎，全倒換大獎。',
      menu: [['九宮格十二球', 100], ['連線挑戰三十球', 200]] },
    { id: 'E05', name: '阿全釣青蛙', cat: 'game', sign: 'yellow', since: 1992, owner: '黃全福', queue: 3, votes: 390, rating: 4.2, reviews: 118, grade: null, hours: '18:00–23:30', rest: '全年無休', pay: CASH, tags: ['釣魚竿', '親子'],
      blurb: '塑膠青蛙在水道裡繞圈，用小磁鐵竿釣起來，釣滿十隻換玩具。',
      menu: [['釣青蛙一回', 50], ['釣青蛙三回', 120]] },
    { id: 'E06', name: '撈撈樂', cat: 'game', sign: 'white', since: 2012, owner: '蘇美珠', queue: 2, votes: 350, rating: 4.0, reviews: 102, grade: null, hours: '18:00–23:30', rest: '全年無休', pay: CASH, tags: ['彈力球', '親子'],
      blurb: '紙網撈彈力球，撈到幾顆帶走幾顆，網子破了可以補一張。',
      menu: [['撈彈力球一網', 50], ['撈彈力球三網', 120]] },
  ];

  // 焦點攤位「阿娥蚵仔煎」的詳細內容：評價分布合計必須等於 reviews（1,286），平均 ≈ 4.7
  const focusDetail = {
    story: [
      '1983 年，林秀娥在魚市巷口推著一台鐵板車開始賣蚵仔煎。那時魚市巷還是清晨的漁獲拍賣場，她用收市後的鮮蚵，煎給收工的漁工當宵夜。',
      '四十多年過去，攤子搬到港埕路北側，鐵板從一面變成四面。2012 年兒子陳志明接手掌鍋，阿娥阿姨退到前台收錢、記誰不要香菜。',
    ],
    boardNotes: ['蚵仔每天下午從鹽田區蚵寮直送', '不吃辣、醬少，點餐時先說', '內用座位 18 個，尖峰請併桌'],
    soldOut: ['蚵仔湯'],
    addOns: [['加蛋', 15], ['加蚵仔', 30], ['醬汁另外裝', 0]],
    seats: 18,
    peak: '19:30–21:00',
    bestTime: '17:00–18:00 或 22:30 之後',
    hygiene: {
      score: 92, date: '2026-09-14', inspector: '港埕區衛生所',
      items: [['從業人員健康與衛生', 'A'], ['食材保存與冷藏溫度', 'A'], ['用水與洗滌設備', 'A'], ['餐具清潔與消毒', 'B'], ['廢棄物與病媒防治', 'A']],
    },
    dist: [1001, 207, 52, 16, 10],
    reviewsList: [
      { name: '鹽田蚵農的女兒', district: '鹽田區', date: '2026-10-22', stars: 5, text: '蚵仔小顆但很鮮，一份大概十五顆，邊邊煎得脆脆的。醬是甜辣偏甜，喜歡的人會很喜歡。' },
      { name: '陳先生', district: '北岸區', date: '2026-10-20', stars: 5, text: '排了快半小時，阿娥阿姨一次顧四個鍋子還能記得誰不要香菜，值得。' },
      { name: '夜貓子小雨', district: '港埕區', date: '2026-10-18', stars: 4, text: '綜合煎份量很夠，兩個人分剛好。尖峰時段座位要搶，建議外帶到廟埕吃。' },
      { name: '林小姐', district: '新灣區', date: '2026-10-16', stars: 5, text: '從國中吃到現在，換兒子掌鍋味道沒變，粉漿一樣 Q。' },
      { name: '阿哲', district: '舊城區', date: '2026-10-13', stars: 3, text: '好吃，但晚上七點半排了 35 分鐘，希望之後可以發號碼牌。' },
      { name: '黃太太', district: '雲嶺區', date: '2026-10-09', stars: 4, text: '蚵仔湯薑絲很多很暖，九點以後去常常已經賣完。' },
    ],
  };

  /* ---------- 地圖幾何（viewBox 0 0 1200 760） ---------- */
  const SLOT_X0 = 60;
  const SLOT_PITCH = 62;
  const slotX = i => SLOT_X0 + i * SLOT_PITCH;
  function cellRect(id) {
    const row = id[0];
    const n = +id.slice(1);
    // A 排：A01–A04 在廟埕口以西（第 0–3 格），廟埕口佔 4–7 格，A05–A14 在 8–17 格
    if (row === 'A') return { x: slotX(n <= 4 ? n - 1 : n + 3), y: 240, w: 56, h: 54 };
    // B 排：B01–B08 在第 0–7 格，魚市巷口佔 8–9 格，B09–B12 在 10–13 格，14–17 格是東口廣場
    if (row === 'B') return { x: slotX(n <= 8 ? n - 1 : n + 1), y: 370, w: 56, h: 54 };
    if (row === 'C') return { x: 560, y: 444 + (n - 1) * 38, w: 40, h: 32 };
    if (row === 'D') return { x: 630, y: 444 + (n - 1) * 38, w: 40, h: 32 };
    // E 區：廟埕兩側，E01–E03 在西側、E04–E06 在東側
    return { x: n <= 3 ? 312 : 506, y: 112 + ((n - 1) % 3) * 40, w: 40, h: 34 };
  }
  const cellCenter = id => {
    const r = cellRect(id);
    return [r.x + r.w / 2, r.y + r.h / 2];
  };

  const zones = [
    { id: 'temple', name: '福安宮廟埕', rect: [304, 24, 250, 208], base: 61, weight: 0.16 },
    { id: 'west', name: '港埕路西段', rect: [52, 232, 500, 200], base: 80, weight: 0.27 },
    { id: 'east', name: '港埕路東段', rect: [552, 232, 372, 200], base: 87, weight: 0.27 },
    { id: 'alley', name: '魚市巷', rect: [552, 432, 126, 320], base: 55, weight: 0.14 },
    { id: 'gate', name: '東口廣場', rect: [924, 232, 272, 330], base: 68, weight: 0.16 },
  ];
  const zoneOf = s => {
    if (s.id[0] === 'E') return 'temple';
    if (s.id[0] === 'C' || s.id[0] === 'D') return 'alley';
    const x = cellRect(s.id).x;
    return x < 552 ? 'west' : x < 924 ? 'east' : 'gate';
  };

  const facilityTypes = {
    toilet: { label: '廁所', color: '#2EF2FF', icon: 'toilet' },
    trash: { label: '垃圾分類站', color: '#3DDC97', icon: 'trash' },
    atm: { label: 'ATM', color: '#FFC93C', icon: 'atm' },
    info: { label: '服務台', color: '#FF2E88', icon: 'info' },
  };
  const facilities = [
    { id: 'T1', type: 'toilet', name: '廟埕公廁', note: '含無障礙廁所與尿布台，24 小時開放', x: 333, y: 62 },
    { id: 'T2', type: 'toilet', name: '魚市巷公廁', note: '巷尾東側，夜市營業時間有清潔人員', x: 712, y: 722 },
    { id: 'W1', type: 'trash', name: '西口分類站', note: '一般垃圾、資源回收、廚餘、殘液四桶', x: 30, y: 290 },
    { id: 'W2', type: 'trash', name: '魚市巷口分類站', note: '設有洗杯水槽，環保杯可在這裡沖洗', x: 712, y: 458 },
    { id: 'W3', type: 'trash', name: '廟埕分類站', note: '竹籤、木筷集中回收筒在這裡', x: 526, y: 62 },
    { id: 'M1', type: 'atm', name: '東口 ATM', note: '跨行提款，24 小時', x: 1184, y: 262 },
    { id: 'M2', type: 'atm', name: '西口 ATM', note: '跨行提款，夜市營業時間', x: 30, y: 376 },
    { id: 'S1', type: 'info', name: '夜市服務台', note: '失物招領、輪椅與嬰兒車借用、急救箱、集章兌換', x: 1000, y: 470 },
  ];

  const routes = [
    { id: 'classic', name: '經典吃一輪', time: '約 70 分', dist: '1.2 公里',
      desc: '從捷運東口進場，蚵仔煎、臭豆腐、滷味一路吃過去，最後到魚市巷吃豆花收尾。',
      stops: ['A07', 'E02', 'A03', 'B05', 'C03'],
      points: [[1192, 322], [448, 322], [448, 140], [410, 140], [410, 322], [70, 322], [70, 344], [615, 344], [615, 742]] },
    { id: 'family', name: '親子慢慢逛', time: '約 90 分', dist: '1.0 公里',
      desc: '從西口進場，先吃紅豆餅，再到廟埕玩彈珠台、釣青蛙，最後去魚市巷買童玩。',
      stops: ['B04', 'E03', 'E05', 'C03', 'D07'],
      points: [[8, 344], [410, 344], [410, 140], [448, 140], [448, 344], [615, 344], [615, 742]] },
    { id: 'quick', name: '下班快吃 30 分', time: '約 30 分', dist: '0.6 公里',
      desc: '捷運出站直接開吃：珍奶、粉圓冰、蚵仔煎、生煎包，原路回東口搭車。',
      stops: ['A14', 'A11', 'A07', 'B09'],
      points: [[1192, 322], [660, 322], [660, 344], [1192, 344]] },
  ];

  const eventTypes = {
    show: { label: '表演', color: '#FF2E88' },
    tour: { label: '走讀', color: '#2EF2FF' },
    food: { label: '美食', color: '#FFC93C' },
    eco: { label: '環保', color: '#3DDC97' },
    game: { label: '比賽', color: '#B98CFF' },
    family: { label: '親子', color: '#FF8A3D' },
  };
  const events = [
    { id: 'EV-1019', date: '2026-10-19', start: '19:00', end: '20:00', title: '夜市志工招募說明會', type: 'eco', place: '東口廣場服務台', zone: 'gate', host: '港埕夜市自治會', fee: '免費',
      desc: '分類站引導、失物招領、外語問路，每週排班一晚即可。參加說明會送志工背心，還有一碗麻油麵線。' },
    { id: 'EV-1020', date: '2026-10-20', start: '17:00', end: '00:30', title: '環保杯日', type: 'eco', place: '全區 8 家飲品攤', zone: null, host: '港埕夜市自治會', fee: '自備杯折 5 元',
      desc: '每週二自備環保杯買飲品，每杯折 5 元；魚市巷口分類站有洗杯水槽可以先沖一下。' },
    { id: 'EV-1021', date: '2026-10-21', start: '19:30', end: '20:30', title: '魚市巷老攤走讀', type: 'tour', place: '魚市巷口（C01 花枝羹前）集合', zone: 'alley', host: '冬瓜茶王 楊家第二代', fee: '免費・限 30 人',
      desc: '從 1968 年的第一攤冬瓜茶說起，走過花枝羹、碗粿、豆花四家老攤，聽魚市巷從漁獲拍賣場變成夜市的故事。' },
    { id: 'EV-1022', date: '2026-10-22', start: '20:00', end: '21:30', title: '澄港大學熱音社街頭演出', type: 'show', place: '東口廣場', zone: 'gate', host: '澄港大學熱門音樂社', fee: '免費',
      desc: '三組學生樂團輪番上場，從台語老歌改編到原創搖滾，現場投票選出今晚的「港埕之聲」。' },
    { id: 'EV-1023A', date: '2026-10-23', start: '18:00', end: '22:00', title: '鹽田蚵季集章', type: 'food', place: 'A07 阿娥蚵仔煎、B03 溪洲蚵嗲', zone: 'east', host: '鹽田區漁會 × 港埕夜市自治會', fee: '消費即可參加',
      desc: '10/23–10/25 連續三晚，兩攤各消費一次即可集滿兩章，到服務台換鹽田蚵乾一包，每晚限 200 份。' },
    { id: 'EV-1023B', date: '2026-10-23', start: '21:00', end: '22:00', title: '廟埕布袋戲〈港埕三俠〉', type: 'show', place: '福安宮廟埕戲台', zone: 'temple', host: '舊城明光閣掌中劇團', fee: '免費',
      desc: '改編自港埕老漁村傳說：三位少年俠客夜闖魚市巷，智取偷蚵賊。台語演出、後場樂師現場伴奏，散場後可上台看戲偶。' },
    { id: 'EV-1024A', date: '2026-10-24', start: '19:00', end: '21:00', title: '那卡西走唱之夜', type: 'show', place: '東口廣場', zone: 'gate', host: '港埕那卡西同好會', fee: '免費',
      desc: '電子琴、吉他和手鼓，客人點歌、樂師即興伴奏。點歌單現場免費索取，第一首由阿娥阿姨開唱。' },
    { id: 'EV-1024B', date: '2026-10-24', start: '20:30', end: '22:00', title: '套圈圈擂台賽', type: 'game', place: 'E02 大家來套圈圈', zone: 'temple', host: 'E02 攤主 鄭麗華', fee: '報名費 50 元・限 40 人',
      desc: '每人 15 圈、限時 90 秒，套中的分數加總。前三名分別得夜市禮券 500、300、100 元。' },
    { id: 'EV-1025A', date: '2026-10-25', start: '18:30', end: '20:30', title: '親子童玩市集', type: 'family', place: '福安宮廟埕', zone: 'temple', host: 'D07 古早童玩 許東山', fee: '免費',
      desc: '許東山老師教打陀螺、削竹蜻蜓。十二歲以下完成闖關卡，可到 A11 換粉圓冰一碗（限 100 份）。' },
    { id: 'EV-1025B', date: '2026-10-25', start: '22:30', end: '00:00', title: '打烊前惜食時段', type: 'eco', place: '參與攤位 12 家', zone: null, host: '港埕夜市自治會', fee: '熟食甜點 7 折',
      desc: '當日熟食與甜點 7 折，攤位掛綠色「惜食」小牌即為參與店家；自備餐盒再折 5 元。' },
  ];

  const parking = [
    { id: 'P1', name: '港埕立體停車場', kind: 'car', total: 420, free: 37, walk: 4, fee: '每小時 40 元', hours: '24 小時' },
    { id: 'P2', name: '魚市巷平面停車場', kind: 'car', total: 86, free: 5, walk: 2, fee: '每小時 50 元', hours: '07:00–01:00' },
    { id: 'P3', name: '北岸臨時停車場', kind: 'car', total: 150, free: 92, walk: 12, fee: '夜間單次 100 元', hours: '週五六 17:00–01:30', note: '接駁車每 15 分一班' },
    { id: 'M1', name: '港埕路機車停車格', kind: 'scooter', total: 360, free: 41, walk: 1, fee: '每次 20 元', hours: '24 小時' },
  ];

  const transit = {
    metro: { line: '澄港捷運 環港線', station: '港埕站', exit: '2 號出口', walk: 3, last: '末班車 00:12（往新灣）／00:18（往雲嶺）' },
    bus: [
      { route: '12', stop: '港埕夜市', from: '舊城區 ↔ 新灣區', freq: '每 12 分' },
      { route: '36', stop: '港埕夜市', from: '北岸區 ↔ 山腳區', freq: '每 15 分' },
      { route: '紅 7', stop: '福安宮', from: '鹽田區 ↔ 港埕區', freq: '每 20 分' },
      { route: '夜 1', stop: '港埕夜市', from: '夜間公車 港埕 ↔ 溪洲區', freq: '22:00–01:30 每 20 分' },
    ],
    bike: { name: '公共自行車 港埕站', docks: 32, bikes: 9 },
    shuttle: { name: '北岸接駁車', route: 'P3 北岸臨時停車場 ↔ 夜市西口', freq: '每 15 分', hours: '週五六 18:00–01:00' },
  };

  const hygiene = {
    season: '2026 年第三季',
    published: '2026-09-30',
    agency: '澄港市政府衛生局',
    next: '第四季評核 2026-12 進行',
    items: ['從業人員健康與衛生', '食材保存與冷藏溫度', '用水與洗滌設備', '餐具清潔與消毒', '廢棄物與病媒防治'],
  };

  // 今晚每半小時的人潮指數；20:30 以前是實測，之後是預估（預估值仍會由即時模擬覆蓋「現在」那一點）
  const crowdCurve = [
    ['17:00', 18], ['17:30', 26], ['18:00', 41], ['18:30', 55], ['19:00', 66], ['19:30', 74], ['20:00', 79], ['20:30', 76],
    ['21:00', 73], ['21:30', 69], ['22:00', 61], ['22:30', 50], ['23:00', 39], ['23:30', 28], ['00:00', 17], ['00:30', 6],
  ];

  /* ---------- 衍生欄位 ---------- */
  const maxVotes = Math.max(...stalls.map(s => s.votes));
  const byId = {};
  stalls.forEach(s => {
    const prices = s.menu.map(m => m[1]);
    s.price = [Math.min(...prices), Math.max(...prices)];
    s.dish = s.menu[0][0];
    s.dishPrice = s.menu[0][1];
    const avg = (s.price[0] + s.price[1]) / 2;
    s.priceLevel = avg < 50 ? 1 : avg < 100 ? 2 : 3;
    s.heat = Math.round((s.votes / maxVotes) * 100);
    s.hours = s.hours || DEFAULT_HOURS;
    s.zone = zoneOf(s);
    s.url = 'stall.html?id=' + s.id;
    byId[s.id] = s;
  });
  byId.A07.detail = focusDetail;

  App.data = { market, categories, grades, stalls, zones, facilities, facilityTypes, routes, events, eventTypes, parking, transit, hygiene, crowdCurve };
  App.stall = id => byId[id];
  App.category = key => categories[key];
  App.stallsBy = cat => stalls.filter(s => s.cat === cat);

  App.sorters = {
    popular: (a, b) => b.votes - a.votes,
    rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    queue: (a, b) => a.queue - b.queue || b.rating - a.rating,
    price: (a, b) => a.price[0] - b.price[0] || a.price[1] - b.price[1],
  };
  const EATS = new Set(['food', 'drink', 'dessert']);
  App.rank = (kind = 'popular', n = 10) => {
    let pool = stalls.filter(s => EATS.has(s.cat));
    // 「免排隊榜」只收評分 4.4 以上的攤，免得排行變成冷門攤清單
    if (kind === 'queue') pool = pool.filter(s => s.rating >= 4.4);
    return pool.slice().sort(App.sorters[kind]).slice(0, n);
  };

  App.gradeCounts = () => {
    const c = { A: 0, B: 0, C: 0 };
    stalls.forEach(s => { if (s.grade) c[s.grade] += 1; });
    return c;
  };

  // 以指數分布逼近平均星等（λ 越大越集中在 5 星），計數取整後的差額補在 5 星，合計必等於 reviews
  App.ratingDist = s => {
    if (s.detail && s.detail.dist) return s.detail.dist.slice();
    const weights = l => [5, 4, 3, 2, 1].map(k => Math.exp(-l * (5 - k)));
    const meanOf = l => {
      const w = weights(l);
      const sum = w.reduce((a, b) => a + b, 0);
      return w.reduce((a, x, i) => a + x * (5 - i), 0) / sum;
    };
    let lo = 0;
    let hi = 8;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (meanOf(mid) < s.rating) lo = mid; else hi = mid;
    }
    const w = weights(lo);
    const sum = w.reduce((a, b) => a + b, 0);
    const counts = w.map(x => Math.floor((x / sum) * s.reviews));
    counts[0] += s.reviews - counts.reduce((a, b) => a + b, 0);
    return counts;
  };

  App.queueLevel = m => (m <= 8
    ? { key: 'short', label: '順暢', color: '#3DDC97' }
    : m <= 19
      ? { key: 'mid', label: '稍候', color: '#FFC93C' }
      : { key: 'long', label: '久候', color: '#FF4D5E' });

  App.crowdLevel = v => (v < 40
    ? { key: 'calm', label: '舒適', color: '#3DDC97' }
    : v < 65
      ? { key: 'lively', label: '熱絡', color: '#FFC93C' }
      : v < 85
        ? { key: 'busy', label: '擁擠', color: '#FF8A3D' }
        : { key: 'packed', label: '爆滿', color: '#FF3B5C' });

  /* =========================================================
     3. 圖示與插畫
     ========================================================= */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    heart: '<path d="M12 19.5s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.5-7.5 10-7.5 10z"/>',
    star: '<path d="M12 3.8l2.5 5.2 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>',
    fire: '<path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.6 2.8-5.3 3.6-8.7 2 1.3 2.9 3.3 2.7 5 1-.6 1.8-1.8 2-3.2 1.8 1.6 3.7 4 3.7 7 0 3.3-2.4 5.7-6 5.7z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    toilet: '<circle cx="7" cy="5" r="1.9"/><path d="M7 9v11M4.5 12h5"/><circle cx="17" cy="5" r="1.9"/><path d="M17 8.5l3 7h-6zM12 3.5v17"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    atm: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10.5h18M7 14.5h4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
    metro: '<rect x="6" y="3.5" width="12" height="14" rx="3"/><path d="M6 11h12M9 20.5l1.5-3M15 20.5l-1.5-3M9.2 14.3h.01M14.8 14.3h.01"/>',
    bus: '<rect x="4.5" y="4" width="15" height="13" rx="2.5"/><path d="M4.5 11h15M8 20v-3M16 20v-3M8 14.3h.01M16 14.3h.01"/>',
    car: '<path d="M4 16.5v-4l2-5h12l2 5v4zM4 16.5V19M20 16.5V19M4 12.5h16M7.5 14.5h.01M16.5 14.5h.01"/>',
    scooter: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17h7l-2.5-8h3M13 9l-1.5-4H9"/>',
    bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3.5 7M8.5 6h3"/>',
    walk: '<circle cx="13" cy="4.5" r="1.7"/><path d="M10 21l2.5-6 2.5 2V21M12.5 15l-1-5 3 1.5 2 2.5M11.5 10L8 12v3"/>',
    parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16.5V7.5h3a2.6 2.6 0 0 1 0 5.2h-3"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5zM10 20.5h4"/>',
    map: '<path d="M9 5L4 7v12l5-2 6 2 5-2V5l-5 2zM9 5v12M15 7v12"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
    people: '<circle cx="9" cy="8" r="2.6"/><circle cx="16.5" cy="9" r="2.1"/><path d="M4 19c.4-3.4 2.4-5.4 5-5.4s4.6 2 5 5.4M14.5 13.8c.6-.3 1.3-.4 2-.4 2.2 0 3.7 1.7 4 4.6"/>',
    shield: '<path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/>',
    drop: '<path d="M12 3.5s-5.5 6.2-5.5 10a5.5 5.5 0 0 0 11 0c0-3.8-5.5-10-5.5-10z"/>',
    bowl: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0zM8 20h8M9 7.5c0-1 1-1.5 1-2.5M13 7.5c0-1 1-1.5 1-2.5"/>',
    cup: '<path d="M7 7h10l-1.2 13H8.2zM6 7h12M12 7l1.5-4h3"/>',
    ice: '<path d="M5.5 11h13l-2 9h-9zM6.5 11a5.5 5.5 0 0 1 11 0"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    bag: '<path d="M5.5 8h13l-1 12h-11zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7L16 13l4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  };
  App.icons = ICONS;
  App.icon = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;

  // 紅色塑膠椅：夜市最常見的家具，當空狀態插畫
  App.art = name => {
    if (name !== 'stool') return '';
    return `<svg class="art-stool" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="112" rx="40" ry="5" fill="#000" opacity=".35"/>
      <path d="M26 40 L18 108 h12 l8-56 h44 l8 56 h12 L94 40z" fill="#C42A23"/>
      <path d="M38 52 h44 l3 22 H35z" fill="#E23A2E"/>
      <path d="M44 58 h8 l-1 10 h-8z M56 58 h8 v10 h-8z M68 58 h8 l1 10 h-8z" fill="#8E1C17"/>
      <ellipse cx="60" cy="40" rx="36" ry="10" fill="#E8463A"/>
      <ellipse cx="60" cy="38" rx="30" ry="7" fill="#F2645A"/>
      <circle cx="60" cy="38" r="3" fill="#C42A23"/>
      <path d="M34 36 q10 -5 20 -4" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;
  };

  /* =========================================================
     4. HTML 片段
     ========================================================= */
  App.signHTML = (text, { variant = 'red', sub = '', seal = '', size = '', off = false, cls = '' } = {}) => {
    const classes = ['signboard', 'signboard--' + variant];
    if (size) classes.push('signboard--' + size);
    if (off) classes.push('is-off');
    if (cls) classes.push(cls);
    return `<span class="${classes.join(' ')}">${seal ? `<span class="signboard__seal">${esc(seal)}</span>` : ''}<span class="signboard__text">${esc(text)}</span>${sub ? `<span class="signboard__sub">${esc(sub)}</span>` : ''}</span>`;
  };

  App.catHTML = cat => {
    const c = categories[cat];
    return `<span class="cat" data-cat="${cat}">${App.icon(c.icon)}${c.label}</span>`;
  };

  App.gradeHTML = (grade, size = '') => {
    if (!grade) return '<span class="grade grade--none" title="遊戲、雜貨攤免評核"><b>免</b><span class="sr-only">衛生評核：免評核</span></span>';
    const g = grades[grade];
    return `<span class="grade grade--${grade}${size ? ' grade--' + size : ''}" title="${g.full}"><b>${grade === 'C' ? (size === 'sm' ? '輔' : '輔導') : g.label}</b><span class="sr-only">衛生評核：${g.label}</span></span>`;
  };

  App.queueHTML = min => {
    const q = App.queueLevel(min);
    return `<span class="queue queue--${q.key}"><span class="queue__lamps" aria-hidden="true"><i></i><i></i><i></i></span><span class="queue__text">${min <= 0 ? '免排隊' : '排隊 ' + App.fmt.queue(min)}</span></span>`;
  };

  App.priceBandHTML = s => `<span class="price-band" data-level="${s.priceLevel}"><span class="price-band__marks" aria-hidden="true"><i>$</i><i>$</i><i>$</i></span><span class="price-band__text">${App.fmt.range(s.price)}</span></span>`;

  App.starsHTML = (rating, reviews) => `<span class="stars" role="img" aria-label="評分 ${rating.toFixed(1)}，共 ${App.fmt.num(reviews)} 則評價" style="--r:${rating}"><span class="stars__glyphs" aria-hidden="true"></span><b aria-hidden="true">${rating.toFixed(1)}</b>${reviews != null ? `<span class="stars__n" aria-hidden="true">(${App.fmt.num(reviews)})</span>` : ''}</span>`;

  App.favBtnHTML = id => {
    const on = favs.has(id);
    return `<button class="fav-btn" type="button" data-fav="${id}" aria-pressed="${on}" aria-label="收藏 ${esc(byId[id].name)}">${App.icon('heart')}<span class="fav-btn__label">${on ? '已收藏' : '收藏'}</span></button>`;
  };

  App.stallCardHTML = (s, { fav = true, off = true } = {}) => `
    <article class="stall-card" data-id="${s.id}" data-cat="${s.cat}">
      <a class="stall-card__sign" href="${s.url}" tabindex="-1" aria-hidden="true">${App.signHTML(s.name, { variant: s.sign, sub: '創業' + App.fmt.cnYear(s.since), seal: s.since < 1990 ? '老店' : '', off })}</a>
      <div class="stall-card__body">
        <div class="stall-card__meta">${App.catHTML(s.cat)}<span class="stall-card__code">${s.id}</span>${s.grade ? App.gradeHTML(s.grade, 'sm') : ''}</div>
        <h3 class="stall-card__name"><a href="${s.url}">${esc(s.name)}</a></h3>
        <p class="stall-card__dish"><span class="stall-card__label">招牌</span>${esc(s.dish)}<b>${App.fmt.price(s.dishPrice)}</b></p>
        <div class="stall-card__stats">${App.queueHTML(s.queue)}${App.priceBandHTML(s)}</div>
        <div class="stall-card__foot">${App.starsHTML(s.rating, s.reviews)}${fav ? App.favBtnHTML(s.id) : ''}</div>
      </div>
    </article>`;

  let sealUid = 0;
  App.gradeSealSVG = grade => {
    const g = grade ? grades[grade] : null;
    const id = 'seal' + (++sealUid);
    const color = g ? g.color : '#A8959D';
    const big = g ? (grade === 'C' ? '輔導' : g.label) : '免';
    return `<svg class="grade-seal" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${g ? g.full : '免評核'}">
      <defs><path id="${id}" d="M100 100 m-72 0 a72 72 0 1 1 144 0 a72 72 0 1 1 -144 0"/></defs>
      <circle cx="100" cy="100" r="94" fill="#120A0F" stroke="${color}" stroke-width="4"/>
      <circle cx="100" cy="100" r="84" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="2 4"/>
      <circle cx="100" cy="100" r="58" fill="none" stroke="${color}" stroke-width="2"/>
      <text font-size="14" font-weight="700" fill="${color}"><textPath href="#${id}" textLength="440" lengthAdjust="spacing">${esc(hygiene.agency)} · 夜市攤商衛生評核 ·</textPath></text>
      <text x="100" y="${grade === 'C' ? 110 : 116}" text-anchor="middle" font-size="${grade === 'C' ? 34 : 56}" font-weight="900" fill="${color}" style="font-family: var(--font-sign)">${big}</text>
      <text x="100" y="140" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${esc(hygiene.season)}</text>
    </svg>`;
  };

  /* =========================================================
     5. 可見性：離開視窗就暫停動畫
     ========================================================= */
  const hasIO = 'IntersectionObserver' in window;
  const liveIO = hasIO ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      const el = e.target;
      el.__visible = e.isIntersecting;
      el.classList.toggle('is-paused', !e.isIntersecting);
      if (e.isIntersecting && el.__onVisible) {
        const fn = el.__onVisible;
        el.__onVisible = null;
        fn();
      }
    });
  }, { rootMargin: '80px 0px' }) : null;

  const live = (el, onVisible) => {
    if (onVisible) el.__onVisible = onVisible;
    if (!liveIO) {
      el.__visible = true;
      if (el.__onVisible) { const fn = el.__onVisible; el.__onVisible = null; fn(); }
      return;
    }
    if (!el.__live) {
      el.__live = true;
      liveIO.observe(el);
    } else if (onVisible && el.__visible) {
      el.__onVisible = null;
      onVisible();
    }
  };
  App.live = el => live(el);

  App.animate = (el, fn) => {
    let raf = 0;
    let last = 0;
    live(el);
    const loop = t => {
      raf = requestAnimationFrame(loop);
      if (el.__visible === false || document.hidden || App.reducedMotion) { last = 0; return; }
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      fn(t, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  };

  /* =========================================================
     6. 霓虹燈管引擎
     ========================================================= */
  const NEON_COLORS = ['pink', 'cyan', 'yellow', 'red', 'green', 'violet', 'white'];

  function neonLightAll(el) {
    const st = el.__neon;
    st.chars.forEach(ch => ch.classList.add('is-on'));
    el.classList.add('is-powered', 'is-full');
  }

  function neonScheduleGlitch(el) {
    const st = el.__neon;
    if (!st.glitch || App.reducedMotion || !st.chars.length) return;
    clearTimeout(st.glitchTimer);
    st.glitchTimer = setTimeout(() => {
      if (!el.isConnected) return;
      // 只在看得到的時候跳電；看不到就直接排下一次，不累積
      if (st.visible !== false && !document.hidden) neonGlitchOnce(el);
      neonScheduleGlitch(el);
    }, 2600 + Math.random() * 5600);
  }

  function neonGlitchOnce(el) {
    const st = el.__neon;
    if (!st || !st.chars.length || App.reducedMotion) return;
    const ch = st.chars[Math.floor(Math.random() * st.chars.length)];
    ch.classList.remove('is-glitch');
    void ch.offsetWidth; // 重新觸發同名動畫
    ch.classList.add('is-glitch');
    setTimeout(() => ch.classList.remove('is-glitch'), 900);
    // 偶爾整面招牌一起電壓不穩
    if (Math.random() < 0.2) {
      el.classList.add('is-surge');
      setTimeout(() => el.classList.remove('is-surge'), 520);
    }
  }

  function neonPowerOn(el) {
    const st = el.__neon;
    if (st.started) return;
    st.started = true;
    if (App.reducedMotion || !st.chars.length) { neonLightAll(el); return; }
    const last = st.chars.length - 1;
    st.chars.forEach((ch, i) => {
      setTimeout(() => {
        ch.classList.add('is-on', 'is-igniting');
        setTimeout(() => ch.classList.remove('is-igniting'), 700);
        if (i === 0) el.classList.add('is-powered');
        if (i === last) {
          el.classList.add('is-full');
          el.dispatchEvent(new CustomEvent('neon:on'));
          neonScheduleGlitch(el);
        }
      }, st.delay + i * st.step + Math.random() * 90);
    });
  }

  App.neon = el => {
    if (el.__neon) return el.__neon.api;
    const color = NEON_COLORS.includes(el.dataset.neon) ? el.dataset.neon : 'pink';
    const text = el.textContent.trim();
    el.classList.add('neon', 'neon--' + color);
    el.innerHTML = `<span class="sr-only">${esc(text)}</span><span class="neon__tubes" aria-hidden="true">${Array.from(text).map(ch => (ch === ' '
      ? '<span class="neon__sp"> </span>'
      : `<span class="neon__ch" data-ch="${esc(ch)}">${esc(ch)}</span>`)).join('')}</span>`;
    const st = {
      chars: $$('.neon__ch', el),
      started: false,
      visible: true,
      delay: +(el.dataset.neonDelay || 0),
      step: +(el.dataset.neonStep || 150),
      glitch: el.dataset.neonGlitch !== 'off',
      glitchTimer: 0,
    };
    const buzz = el.dataset.neonBuzz;
    if (buzz != null && st.chars[+buzz]) st.chars[+buzz].classList.add('is-buzz');
    st.api = { glitch: () => neonGlitchOnce(el), lightAll: () => neonLightAll(el) };
    el.__neon = st;
    if (App.reducedMotion) { neonLightAll(el); return st.api; }
    live(el, () => neonPowerOn(el));
    // 追蹤可見性給偶發閃爍用（live 的 IO 已經寫入 __visible）
    Object.defineProperty(st, 'visible', { get: () => el.__visible !== false });
    return st.api;
  };

  // 招牌通電：播一次閃爍後亮著（用在地圖點選、排行切換等）
  App.ignite = sign => {
    if (!sign) return;
    sign.classList.remove('is-off', 'is-igniting');
    if (App.reducedMotion) return;
    void sign.offsetWidth;
    sign.classList.add('is-igniting');
    setTimeout(() => sign.classList.remove('is-igniting'), 800);
  };

  /* =========================================================
     7. 燈泡串、蒸氣、LED 跑馬燈
     ========================================================= */
  const BULB_PALETTES = {
    warm: ['#FFC93C'],
    mix: ['#FFC93C', '#FF2E88', '#2EF2FF', '#7CFF6B', '#FF6A3D'],
  };

  App.bulbs = host => {
    if (host.__bulbs) { host.__bulbs(); return; }
    const opt = {
      gap: +(host.dataset.bulbsGap || 34),
      sag: +(host.dataset.bulbsSag || 12),
      spans: +(host.dataset.bulbsSpans || 0),
      r: +(host.dataset.bulbsR || 4),
      palette: BULB_PALETTES[host.dataset.bulbsColors] || BULB_PALETTES.warm,
    };
    let lastW = 0;
    const build = () => {
      const w = Math.round(host.clientWidth);
      const h = Math.round(host.clientHeight) || 30;
      if (!w || w === lastW) return;
      lastW = w;
      const r = opt.r;
      const y0 = 3;
      const sag = Math.max(2, Math.min(opt.sag, h - r * 2 - 10));
      const cy = y0 + sag * 2; // 二次貝茲控制點：中點下垂量 = sag
      const spans = opt.spans || Math.max(1, Math.round(w / 320));
      const segW = w / spans;
      let d = `M0 ${y0}`;
      for (let i = 0; i < spans; i++) d += ` Q${(i * segW + segW / 2).toFixed(1)} ${cy} ${((i + 1) * segW).toFixed(1)} ${y0}`;
      const n = Math.max(2, Math.floor(w / opt.gap));
      let html = `<svg class="bulbs__svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="#3A2B31" stroke-width="1.6"/>`;
      for (let k = 0; k < n; k++) {
        const x = (k + 0.5) * (w / n);
        const seg = Math.min(spans - 1, Math.floor(x / segW));
        const t = (x - seg * segW) / segW;
        const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y0;
        const col = opt.palette[k % opt.palette.length];
        html += `<g class="bulb" style="--k:${k % 3}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle class="bulb__halo" cy="${r + 4}" r="${(r * 2.9).toFixed(1)}" fill="${col}" opacity=".2"/><rect x="-1.7" y="0" width="3.4" height="3.6" rx=".6" fill="#4A3B40"/><circle cy="${r + 3.6}" r="${r}" fill="${col}"/><circle cx="${(-r * 0.32).toFixed(1)}" cy="${(r + 2.5).toFixed(1)}" r="${(r * 0.34).toFixed(1)}" fill="#FFFDF0" opacity=".75"/></g>`;
      }
      host.innerHTML = html + '</svg>';
    };
    host.__bulbs = build;
    host.classList.add('bulbs');
    build();
    if ('ResizeObserver' in window) new ResizeObserver(build).observe(host);
    live(host);
  };

  App.steam = host => {
    if (host.__steam) return;
    host.__steam = true;
    const n = clamp(+(host.dataset.steam || 3), 1, 5);
    let html = '<svg class="steam__svg" viewBox="0 0 60 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">';
    for (let i = 0; i < n; i++) {
      const x = 30 + (i - (n - 1) / 2) * 11;
      html += `<path class="steam__wisp" style="--i:${i}" d="M${x} 118 C${x - 9} 98 ${x + 9} 84 ${x} 66 S${x - 8} 36 ${x + 2} 16" fill="none" stroke="#FFF4EA" stroke-width="7" stroke-linecap="round"/>`;
    }
    host.classList.add('steam');
    host.insertAdjacentHTML('beforeend', html + '</svg>');
    live(host);
  };

  App.marquee = el => {
    if (el.__marquee) return;
    el.__marquee = true;
    const track = $('.led__track', el);
    if (!track) return;
    Array.from(track.children).forEach(c => {
      const dup = c.cloneNode(true);
      dup.setAttribute('aria-hidden', 'true');
      track.appendChild(dup);
    });
    const speed = +(el.dataset.speed || 70);
    const setDur = () => track.style.setProperty('--led-dur', (track.scrollWidth / 2 / speed).toFixed(1) + 's');
    setDur();
    if (document.fonts) document.fonts.ready.then(setDur);
    live(el);
  };

  /* =========================================================
     8. 進場、數字遞增
     ========================================================= */
  const revealIO = hasIO ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      revealIO.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 }) : null;

  function initReveal(root) {
    const els = $$('[data-reveal]', root).filter(el => !el.__reveal);
    if (!els.length) return;
    els.forEach(el => {
      el.__reveal = true;
      if (App.reducedMotion || !revealIO) { el.classList.add('is-in'); return; }
      const r = el.getBoundingClientRect();
      // 初次載入已在視窗內的直接顯示，不做進場（避免首屏閃爍）
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in', 'is-instant');
      else revealIO.observe(el);
    });
    document.documentElement.classList.add('reveal-ready');
  }
  // 保底：列印或從書籤直接跳到頁中時，把已經捲過的全部顯示
  const revealPassed = () => $$('[data-reveal]:not(.is-in)').forEach(el => {
    if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in');
  });
  addEventListener('beforeprint', () => $$('[data-reveal]').forEach(el => el.classList.add('is-in')));
  addEventListener('load', () => setTimeout(revealPassed, 1200));
  addEventListener('hashchange', () => setTimeout(revealPassed, 400));

  const fmtCount = (v, dec) => (dec ? v.toFixed(dec) : App.fmt.num(v));
  function countUp(el) {
    if (el.__count) return;
    el.__count = 'pending';
    live(el, () => {
      const dec = +(el.dataset.decimals || 0);
      if (App.reducedMotion) {
        el.textContent = fmtCount(parseFloat(el.dataset.count), dec);
        el.__count = 'done';
        return;
      }
      const t0 = performance.now();
      const dur = 1100;
      const step = now => {
        // 每格都讀最新目標值：動畫進行中被 App.setCount 改值也不會錯
        const target = parseFloat(el.dataset.count);
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = fmtCount(target * (1 - Math.pow(1 - p, 3)), dec);
        if (p < 1) requestAnimationFrame(step); else el.__count = 'done';
      };
      requestAnimationFrame(step);
    });
  }
  App.setCount = (el, n) => {
    el.dataset.count = n;
    if (el.__count === 'done' || !el.__count) el.textContent = fmtCount(+n, +(el.dataset.decimals || 0));
  };

  /* =========================================================
     9. Toast、Modal、Tooltip
     ========================================================= */
  let toastHost = null;
  const toastContainer = () => {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastHost);
    }
    return toastHost;
  };

  App.toast = (msg, opts = {}) => {
    const host = toastContainer();
    const el = document.createElement('div');
    el.className = 'toast toast--' + (opts.tone || 'pink');
    el.innerHTML = `<span class="toast__lamp" aria-hidden="true"></span><div class="toast__body">${opts.title ? `<strong class="toast__title">${esc(opts.title)}</strong>` : ''}<span class="toast__msg">${esc(msg)}</span></div>`;
    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 320);
    };
    if (opts.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast__action';
      b.textContent = opts.action.label;
      b.addEventListener('click', () => { opts.action.onClick(); dismiss(); });
      el.appendChild(b);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast__close';
    x.setAttribute('aria-label', '關閉通知');
    x.innerHTML = App.icon('close');
    x.addEventListener('click', dismiss);
    el.appendChild(x);
    host.appendChild(el);
    while (host.children.length > 4) host.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('is-in'));
    timer = setTimeout(dismiss, opts.timeout || (opts.action ? 6000 : 4200));
    return { dismiss };
  };

  const resolveDialog = d => (typeof d === 'string' ? document.getElementById(d) : d);
  App.modal = {
    open(d) {
      d = resolveDialog(d);
      if (!d || d.open) return;
      d.dispatchEvent(new CustomEvent('modal:open'));
      d.showModal();
      // showModal 會把 dialog 放進 top layer，body 上的 toast 會被蓋住：移進 dialog
      d.appendChild(toastContainer());
    },
    close(d) {
      d = d ? resolveDialog(d) : $$('dialog[open]').pop();
      if (d && d.open) d.close();
    },
  };
  document.addEventListener('close', e => {
    if (e.target.tagName !== 'DIALOG') return;
    const stillOpen = $$('dialog[open]').pop();
    (stillOpen || document.body).appendChild(toastContainer());
  }, true);
  document.addEventListener('click', e => {
    const d = e.target;
    if (d.tagName !== 'DIALOG' || !d.open) return;
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    // 點到 dialog 本身（不是內容面板）就是點背景
    if (!inside || e.target === d) d.close();
  });

  let tipEl = null;
  App.tooltip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = html;
      tipEl.classList.add('is-on');
      App.tooltip.move(x, y);
    },
    move(x, y) {
      if (!tipEl) return;
      const r = tipEl.getBoundingClientRect();
      let left = x + 14;
      let top = y + 16;
      if (left + r.width > innerWidth - 8) left = x - r.width - 14;
      if (top + r.height > innerHeight - 8) top = y - r.height - 12;
      tipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
    },
    hide() { if (tipEl) tipEl.classList.remove('is-on'); },
  };

  /* =========================================================
     10. Tabs、Segmented、表單
     ========================================================= */
  App.tabs = list => {
    if (list.__tabs) return;
    list.__tabs = true;
    const tabs = $$('[role="tab"]', list);
    const panelOf = t => document.getElementById(t.getAttribute('aria-controls'));
    const select = (tab, { focus = false, emit = true } = {}) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const p = panelOf(t);
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      if (emit) list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: panelOf(tab), index: tabs.indexOf(tab) } }));
    };
    list.addEventListener('click', e => {
      const t = e.target.closest('[role="tab"]');
      if (t && tabs.includes(t)) select(t);
    });
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const vertical = list.getAttribute('aria-orientation') === 'vertical';
      const next = { [vertical ? 'ArrowDown' : 'ArrowRight']: i + 1, [vertical ? 'ArrowUp' : 'ArrowLeft']: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], { focus: true });
    });
    select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0], { emit: false });
  };

  App.segmented = group => {
    if (group.__seg) return;
    group.__seg = true;
    group.addEventListener('click', e => {
      const b = e.target.closest('button[data-value]');
      if (!b || !group.contains(b)) return;
      $$('button[data-value]', group).forEach(x => x.setAttribute('aria-pressed', x === b));
      group.dispatchEvent(new CustomEvent('segchange', { detail: { value: b.dataset.value, button: b } }));
    });
  };

  App.field = {
    setError(input, msg) {
      const field = input.closest('.field');
      if (!field) return;
      let err = $('.field__error', field);
      if (!err) {
        err = document.createElement('p');
        err.className = 'field__error';
        err.id = (input.id || 'f' + Math.random().toString(36).slice(2, 7)) + '-err';
        field.appendChild(err);
      }
      field.classList.toggle('is-invalid', !!msg);
      err.textContent = msg || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) input.setAttribute('aria-describedby', err.id); else input.removeAttribute('aria-describedby');
    },
    clear(form) {
      $$('.field.is-invalid', form).forEach(f => f.classList.remove('is-invalid'));
      $$('.field__error', form).forEach(e => { e.textContent = ''; });
      $$('[aria-invalid]', form).forEach(i => i.setAttribute('aria-invalid', 'false'));
    },
  };
  App.valid = {
    required: v => String(v).trim() !== '',
    phone: v => /^09\d{2}-?\d{3}-?\d{3}$/.test(String(v).trim()),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()),
  };

  /* =========================================================
     11. 口袋名單（收藏）
     ========================================================= */
  const favs = new Set(['A07', 'C03']);
  App.favs = {
    has: id => favs.has(id),
    list: () => [...favs],
    get size() { return favs.size; },
    toggle(id, on = !favs.has(id)) {
      if (!byId[id]) return false;
      if (on) favs.add(id); else favs.delete(id);
      syncFavUI();
      document.dispatchEvent(new CustomEvent('favchange', { detail: { id, on } }));
      return on;
    },
  };

  function syncFavUI(root = document) {
    $$('[data-fav-count]').forEach(el => { el.textContent = favs.size; });
    $$('[data-fav]', root).forEach(btn => {
      const on = favs.has(btn.dataset.fav);
      btn.setAttribute('aria-pressed', on);
      const label = $('.fav-btn__label', btn);
      if (label) label.textContent = on ? '已收藏' : '收藏';
    });
    renderPocket();
  }

  // 收藏/取消都走同一條路（含 toast 的「復原」），所以數字、按鈕、清單永遠一起重繪
  function toggleFavWithToast(id) {
    const on = App.favs.toggle(id);
    const s = byId[id];
    App.toast(on ? `已把「${s.name}」放進口袋名單` : `已從口袋名單移除「${s.name}」`, {
      tone: on ? 'pink' : 'yellow',
      title: `口袋名單 ${favs.size} 攤`,
      action: { label: '復原', onClick: () => App.favs.toggle(id, !on) },
    });
  }

  function injectPocket() {
    if ($('#pocket-dialog')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="modal" id="pocket-dialog" aria-labelledby="pocket-title">
        <div class="modal__panel">
          <header class="modal__head">
            <p class="modal__kicker">MY POCKET LIST</p>
            <h2 class="modal__title" id="pocket-title">我的口袋名單</h2>
            <button class="icon-btn modal__close" type="button" data-modal-close aria-label="關閉">${App.icon('close')}</button>
          </header>
          <div class="modal__body">
            <p class="modal__lead">今晚想吃的攤先存起來，逛的時候照著吃。名單只存在這個分頁，重新整理就會清空。</p>
            <ul class="pocket-list" data-pocket-list></ul>
          </div>
          <footer class="modal__foot">
            <a class="btn btn--ghost" href="map.html">${App.icon('map')}在地圖上看</a>
            <button class="btn btn--primary" type="button" data-modal-close>好，出發</button>
          </footer>
        </div>
      </dialog>`);
  }

  function renderPocket() {
    const list = $('[data-pocket-list]');
    if (!list) return;
    const items = [...favs].map(id => byId[id]);
    list.innerHTML = items.length ? items.map(s => `
      <li class="pocket-item" data-cat="${s.cat}">
        ${App.signHTML(s.name, { variant: s.sign, size: 'chip' })}
        <div class="pocket-item__info">
          <a class="pocket-item__name" href="${s.url}">${esc(s.name)}</a>
          <span class="pocket-item__meta">${s.id} · ${esc(s.dish)} ${App.fmt.price(s.dishPrice)}</span>
        </div>
        ${App.queueHTML(s.queue)}
        <button class="icon-btn icon-btn--sm" type="button" data-pocket-remove="${s.id}" aria-label="從口袋名單移除 ${esc(s.name)}">${App.icon('close')}</button>
      </li>`).join('') : `<li class="empty empty--compact">${App.art('stool')}<p class="empty__title">口袋還是空的</p><p class="empty__text">在攤位卡按「收藏」，想吃的攤就會出現在這裡。</p><a class="btn btn--neon btn--sm" href="stalls.html">去逛攤位</a></li>`;
  }

  /* =========================================================
     12. 即時人潮模擬（全站共用）
     ========================================================= */
  App.crowd = (() => {
    const rand = App.rng(20261023);
    const state = zones.map(z => ({ id: z.id, name: z.name, weight: z.weight, base: z.base, value: z.base + (rand() - 0.5) * 4 }));
    const subs = new Set();
    let updatedAt = App.now();
    // 21:00 廟埕布袋戲開演：20:45 起廟埕人潮逐步升高
    const targetOf = (z, now) => {
      if (z.id !== 'temple') return z.base;
      const min = now.getHours() * 60 + now.getMinutes();
      return z.base + clamp((min - (20 * 60 + 45)) / 30, 0, 1) * 18;
    };
    const snapshot = () => {
      const index = Math.round(state.reduce((a, z) => a + z.value * z.weight, 0));
      return {
        index,
        level: App.crowdLevel(index),
        updatedAt,
        zones: state.map(z => ({ id: z.id, name: z.name, value: Math.round(z.value), level: App.crowdLevel(z.value) })),
      };
    };
    const tick = () => {
      if (document.hidden) return;
      const now = App.now();
      state.forEach(z => {
        z.value = clamp(z.value + (targetOf(z, now) - z.value) * 0.25 + (rand() - 0.5) * 7, 8, 98);
      });
      updatedAt = now;
      const snap = snapshot();
      subs.forEach(fn => fn(snap));
    };
    setInterval(tick, 5000);
    return {
      subscribe(fn) {
        subs.add(fn);
        fn(snapshot());
        return () => subs.delete(fn);
      },
      get state() { return snapshot(); },
    };
  })();

  /* =========================================================
     13. 夜市平面圖
     ========================================================= */
  const BLOCKS = [[0, 0, 300, 228], [558, 0, 642, 228], [0, 436, 548, 324], [682, 436, 238, 324], [924, 566, 276, 194]];
  let mapUid = 0;

  function mapBase(uid) {
    const p = [];
    p.push('<rect width="1200" height="760" fill="#160C12"/>');
    BLOCKS.forEach(([x, y, w, h]) => {
      p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0E080B"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${uid}-hatch)"/>`);
    });
    // 地面：港埕路、魚市巷、廟埕、東口廣場
    p.push('<rect x="0" y="232" width="1200" height="200" fill="#22151C"/>');
    p.push('<rect x="552" y="432" width="126" height="328" fill="#22151C"/>');
    p.push('<rect x="304" y="24" width="250" height="208" fill="#281A21"/>');
    p.push('<rect x="924" y="432" width="276" height="134" fill="#22151C"/>');
    // 騎樓柱
    for (let i = 0; i < 20; i++) {
      const x = 26 + i * 62;
      if (x < 300 || x > 558) p.push(`<rect x="${x}" y="225" width="5" height="7" fill="#3B2830"/>`);
      if (x < 548 || (x > 682 && x < 924)) p.push(`<rect x="${x}" y="432" width="5" height="7" fill="#3B2830"/>`);
    }
    // 福安宮：燕尾脊＋戲台
    p.push('<rect x="372" y="54" width="114" height="44" fill="#3A1418" stroke="#D7262E" stroke-opacity=".55" stroke-width="1.5"/>');
    p.push('<path d="M352 58 Q429 34 506 58 L498 50 Q429 26 360 50 Z" fill="#5C1A1F" stroke="#F2C14E" stroke-opacity=".6" stroke-width="1.2"/>');
    p.push('<path d="M352 58 l-8 -10 M506 58 l8 -10" stroke="#F2C14E" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>');
    p.push('<text x="429" y="84" text-anchor="middle" font-size="16" font-weight="900" fill="#F2C14E" letter-spacing="4" style="font-family:var(--font-sign)">福安宮</text>');
    p.push('<rect x="394" y="108" width="70" height="22" rx="2" fill="#2E1D25" stroke="#FFC93C" stroke-opacity=".45"/>');
    p.push('<text x="429" y="123" text-anchor="middle" font-size="11" fill="#C9A86A">戲台</text>');
    // 地名
    const label = (x, y, t, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-size="13" fill="#9C8590" letter-spacing="5" ${extra}>${t}</text>`;
    p.push(label(222, 337, '港埕路'));
    p.push(label(800, 337, '港埕路'));
    p.push(label(429, 196, '廟埕'));
    p.push(label(1060, 512, '東口廣場'));
    p.push('<text x="615" y="508" text-anchor="middle" font-size="13" fill="#9C8590" letter-spacing="4" style="writing-mode:vertical-rl">魚市巷</text>');
    // 入口
    const gate = (x, y, t) => `<g class="mm-gate"><rect x="${x - 22}" y="${y - 11}" width="44" height="22" rx="11" fill="#120A0F" stroke="#F7EEE6" stroke-opacity=".5"/><text x="${x}" y="${y + 4.5}" text-anchor="middle" font-size="12" font-weight="700" fill="#F7EEE6">${t}</text></g>`;
    p.push(gate(30, 333, '西口'));
    p.push(gate(1176, 333, '東口'));
    p.push('<g class="mm-gate"><rect x="579" y="744" width="72" height="16" rx="8" fill="#120A0F" stroke="#F7EEE6" stroke-opacity=".5"/><text x="615" y="756" text-anchor="middle" font-size="11" font-weight="700" fill="#F7EEE6">魚市巷口</text></g>');
    // 捷運出口、停車場
    p.push('<g><rect x="1140" y="168" width="34" height="34" rx="8" fill="#0B3D44" stroke="#2EF2FF" stroke-width="1.5"/><text x="1157" y="191" text-anchor="middle" font-size="16" font-weight="900" fill="#2EF2FF">捷</text><text x="1130" y="190" text-anchor="end" font-size="12" fill="#9FDDE3">港埕站 2 號出口</text></g>');
    p.push('<g><rect x="780" y="600" width="40" height="40" rx="6" fill="#16264A" stroke="#7FA6FF" stroke-width="1.5"/><text x="800" y="628" text-anchor="middle" font-size="22" font-weight="900" fill="#BFD2FF">P</text><text x="800" y="660" text-anchor="middle" font-size="11" fill="#9AA8C8">P2 魚市巷停車場</text></g>');
    p.push('<g><rect x="720" y="92" width="40" height="40" rx="6" fill="#16264A" stroke="#7FA6FF" stroke-width="1.5"/><text x="740" y="120" text-anchor="middle" font-size="22" font-weight="900" fill="#BFD2FF">P</text><text x="740" y="152" text-anchor="middle" font-size="11" fill="#9AA8C8">P1 港埕立體停車場</text></g>');
    // 指北與比例尺
    p.push('<g transform="translate(64 64)"><circle r="22" fill="none" stroke="#5E4952" stroke-width="1.5"/><path d="M0 -16 L6 6 L0 2 L-6 6Z" fill="#F7EEE6"/><text y="-28" text-anchor="middle" font-size="11" font-weight="700" fill="#BCA9B1">N</text></g>');
    p.push('<g transform="translate(40 712)"><path d="M0 0h156M0 -5v10M78 -4v8M156 -5v10" stroke="#BCA9B1" stroke-width="1.5"/><text x="78" y="-10" text-anchor="middle" font-size="11" fill="#BCA9B1">50 公尺</text></g>');
    return p.join('');
  }

  // 比例尺：156 座標單位＝50 公尺（平面圖左下角那把尺），公尺數取整到 10
  const M_PER_UNIT = 50 / 156;
  const meters = units => Math.max(10, Math.round((units * M_PER_UNIT) / 10) * 10);
  // 攤位之間要繞過攤車與人群，步行距離以直線 ×1.25 估算；地圖頁與攤位頁共用，同一處設施的公尺數才會一致
  const walkMeters = (ax, ay, bx, by) => meters(Math.hypot(ax - bx, ay - by) * 1.25);

  App.map = {
    cellRect,
    cellCenter,
    meters,
    walkMeters,
    nearestFacility(type, x, y) {
      const f = facilities.filter(v => v.type === type).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      return { f, m: walkMeters(f.x, f.y, x, y) };
    },
    aisle: { west: 8, east: 1192, upper: 322, lower: 344, laneX: 615, plazaX: [410, 448] },
    render(host, opts = {}) {
      const o = Object.assign({ labels: true, interactive: false, onSelect: null, highlight: null, facilities: true, zones: false, tooltip: true, title: '港埕夜市平面圖' }, opts);
      const uid = 'mm' + (++mapUid);
      const p = [];
      p.push(`<svg class="market-map" viewBox="0 0 1200 760" ${o.interactive ? 'role="group"' : 'role="img"'} aria-labelledby="${uid}-t">`);
      p.push(`<title id="${uid}-t">${esc(o.title)}</title>`);
      p.push(`<defs><pattern id="${uid}-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V12" stroke="#1E1318" stroke-width="4"/></pattern>`);
      ['calm', 'lively', 'busy', 'packed'].forEach(k => {
        const c = App.crowdLevel({ calm: 10, lively: 50, busy: 70, packed: 90 }[k]).color;
        p.push(`<radialGradient id="${uid}-heat-${k}"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".55" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`);
      });
      p.push('</defs>');
      p.push(`<g class="mm-base">${mapBase(uid)}</g>`);
      p.push('<g class="mm-zones">');
      if (o.zones) {
        zones.forEach(z => {
          const [x, y, w, h] = z.rect;
          p.push(`<g class="mm-zone" data-zone="${z.id}"><ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${(w / 2) * 1.08}" ry="${(h / 2) * 1.08}" fill="url(#${uid}-heat-busy)" opacity=".6"/></g>`);
        });
      }
      p.push('</g>');
      p.push('<g class="mm-cells">');
      stalls.forEach(s => {
        const r = cellRect(s.id);
        const c = categories[s.cat].color;
        const a11y = o.interactive ? ` tabindex="0" role="button" aria-label="${s.id} ${esc(s.name)}（${categories[s.cat].label}）"` : '';
        p.push(`<g class="mm-cell" data-id="${s.id}" data-cat="${s.cat}" style="--c:${c}"${a11y}>`);
        p.push(`<rect class="mm-cell__box" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="${c}" fill-opacity=".16" stroke="${c}" stroke-width="1.5"/>`);
        if (o.labels) p.push(`<text class="mm-cell__code" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + (r.w < 50 ? 4 : 4.5)}" text-anchor="middle" font-size="${r.w < 50 ? 11 : 13}" fill="${c}">${s.id}</text>`);
        p.push('</g>');
      });
      p.push('</g>');
      p.push('<g class="mm-overlay"></g>');
      p.push('<g class="mm-facilities">');
      if (o.facilities) {
        const show = Array.isArray(o.facilities) ? o.facilities : Object.keys(facilityTypes);
        facilities.forEach(f => {
          const t = facilityTypes[f.type];
          p.push(`<g class="mm-fac${show.includes(f.type) ? '' : ' is-hidden'}" data-type="${f.type}" data-id="${f.id}" transform="translate(${f.x} ${f.y})"><title>${esc(f.name)}：${esc(f.note)}</title><circle r="14" fill="#120A0F" stroke="${t.color}" stroke-width="2"/><g transform="translate(-8.5 -8.5) scale(.71)" fill="none" stroke="${t.color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[t.icon]}</g></g>`);
        });
      }
      p.push('</g>');
      p.push('<g class="mm-marker"></g>');
      p.push('</svg>');
      host.innerHTML = p.join('');

      const svg = $('svg', host);
      const layers = {};
      ['zones', 'cells', 'overlay', 'facilities', 'marker'].forEach(k => { layers[k] = $('.mm-' + k, svg); });
      const cellEl = id => $(`.mm-cell[data-id="${id}"]`, svg);

      const highlight = id => {
        $$('.mm-cell.is-current', svg).forEach(c => c.classList.remove('is-current'));
        layers.marker.innerHTML = '';
        if (!id || !byId[id]) return;
        const s = byId[id];
        const r = cellRect(id);
        const [cx, cy] = cellCenter(id);
        const w = Array.from(s.name).length * 15 + 26;
        // E 區與 A 排上方是建築，標籤放上面；魚市巷窄，標籤放到右側
        const side = s.id[0] === 'C' || s.id[0] === 'D';
        const lx = side ? (s.id[0] === 'C' ? r.x - w / 2 - 14 : r.x + r.w + w / 2 + 14) : clamp(cx, w / 2 + 6, 1194 - w / 2);
        const ly = side ? cy - 2 : r.y - 16;
        cellEl(id).classList.add('is-current');
        layers.marker.innerHTML = `
          <circle class="mm-marker__pulse" cx="${cx}" cy="${cy}" r="${Math.max(r.w, r.h) * 0.75}" fill="none" stroke="#FFF4F8" stroke-width="2"/>
          <rect x="${r.x - 3}" y="${r.y - 3}" width="${r.w + 6}" height="${r.h + 6}" rx="6" fill="none" stroke="#FFF4F8" stroke-width="2.5"/>
          <g transform="translate(${lx} ${ly})">
            <rect x="${-w / 2}" y="-24" width="${w}" height="28" rx="5" fill="#FF2E88"/>
            ${side ? '' : '<path d="M-7 4 L7 4 L0 12Z" fill="#FF2E88"/>'}
            <text y="-4.5" text-anchor="middle" font-size="15" font-weight="900" fill="#1A0710" style="font-family:var(--font-sign)">${esc(s.name)}</text>
          </g>`;
      };

      const filter = cats => {
        $$('.mm-cell', svg).forEach(c => {
          const on = !cats || cats.includes(c.dataset.cat);
          c.classList.toggle('is-dim', !on);
          c.classList.toggle('is-lit', !!cats && on);
        });
      };

      const showFacilities = types => {
        $$('.mm-fac', svg).forEach(f => f.classList.toggle('is-hidden', !types.includes(f.dataset.type)));
      };

      const zoneEl = id => $(`.mm-zone[data-zone="${id}"]`, svg);
      const focusZone = id => {
        $$('.mm-zone', svg).forEach(z => {
          z.classList.toggle('is-focus', z.dataset.zone === id);
          z.classList.toggle('is-dim', !!id && z.dataset.zone !== id);
        });
      };

      let unsub = null;
      if (o.zones) {
        unsub = App.crowd.subscribe(st => {
          st.zones.forEach(z => {
            const el = zoneEl(z.id);
            if (!el) return;
            const e = $('ellipse', el);
            e.setAttribute('fill', `url(#${uid}-heat-${z.level.key})`);
            e.setAttribute('opacity', (0.3 + (z.value / 100) * 0.6).toFixed(2));
          });
        });
      }

      if (o.interactive) {
        const pick = g => { if (g && o.onSelect) o.onSelect(byId[g.dataset.id], g); };
        layers.cells.addEventListener('click', e => pick(e.target.closest('.mm-cell')));
        layers.cells.addEventListener('keydown', e => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          pick(e.target.closest('.mm-cell'));
        });
      }
      if (o.tooltip) {
        const tipHTML = s => `<b>${esc(s.name)}</b><span>${s.id} · ${categories[s.cat].label} · ${esc(s.dish)} ${App.fmt.price(s.dishPrice)}</span><span>${s.queue <= 0 ? '免排隊' : '排隊 ' + App.fmt.queue(s.queue)}</span>`;
        layers.cells.addEventListener('pointerover', e => {
          const g = e.target.closest('.mm-cell');
          if (g) App.tooltip.show(tipHTML(byId[g.dataset.id]), e.clientX, e.clientY);
        });
        layers.cells.addEventListener('pointermove', e => App.tooltip.move(e.clientX, e.clientY));
        layers.cells.addEventListener('pointerleave', () => App.tooltip.hide());
        layers.cells.addEventListener('focusin', e => {
          const g = e.target.closest('.mm-cell');
          if (!g) return;
          const r = g.getBoundingClientRect();
          App.tooltip.show(tipHTML(byId[g.dataset.id]), r.right, r.top);
        });
        layers.cells.addEventListener('focusout', () => App.tooltip.hide());
      }

      if (o.highlight) highlight(o.highlight);
      live(host);
      return {
        svg,
        cell: cellEl,
        highlight,
        filter,
        showFacilities,
        zone: zoneEl,
        focusZone,
        layer: name => layers[name],
        destroy() { if (unsub) unsub(); host.innerHTML = ''; },
      };
    },
  };

  /* =========================================================
     14. 頁首、營業狀態、全域事件
     ========================================================= */
  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    const toggle = $('.nav-toggle', header);
    const setOpen = open => {
      header.classList.toggle('is-open', open);
      if (toggle) {
        toggle.setAttribute('aria-expanded', open);
        const label = $('.nav-toggle__label', toggle);
        if (label) label.textContent = open ? '關閉' : '選單';
      }
    };
    if (toggle) toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    $$('.site-nav a', header).forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
    matchMedia('(min-width: 1025px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // 依檔名標示目前頁面（複製頁首時忘了改 active 也會被修正）
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.site-nav__link', header).forEach(a => {
      const on = a.getAttribute('href').split(/[?#]/)[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function renderOpenStatus() {
    const st = market.status();
    $$('[data-open-status]').forEach(el => {
      el.classList.toggle('is-closed', !st.open);
      const html = `<span class="lamp" aria-hidden="true"></span><b>${st.label}</b><span class="open-pill__time">${st.open ? '至 ' + market.hours.close : market.hours.open + ' 開市'}</span>`;
      if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
    });
  }
  function renderClock() {
    const now = App.now();
    const st = market.status(now);
    $$('[data-countdown]').forEach(el => { el.textContent = App.fmt.dur(st.open ? st.closeAt - now : st.openAt - now); });
    $$('[data-clock]').forEach(el => { el.textContent = App.fmt.hm(now); });
  }

  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { e.preventDefault(); App.modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { App.modal.close(closer.closest('dialog') || undefined); return; }
    const fav = e.target.closest('[data-fav]');
    if (fav) { toggleFavWithToast(fav.dataset.fav); return; }
    const rm = e.target.closest('[data-pocket-remove]');
    if (rm) { toggleFavWithToast(rm.dataset.pocketRemove); return; }
    const t = e.target.closest('[data-toast]');
    if (t) App.toast(t.dataset.toast, { tone: t.dataset.toastTone || 'cyan' });
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    App.tooltip.hide();
    // 原生 Esc 會自己關 dialog；這裡處理程式觸發的 Escape 事件，讓狀態一致
    if (!e.defaultPrevented) App.modal.close();
  });

  App.scan = (root = document) => {
    $$('[data-tabs]', root).forEach(App.tabs);
    $$('[data-segmented]', root).forEach(App.segmented);
    $$('[data-neon]', root).forEach(el => App.neon(el));
    $$('[data-bulbs]', root).forEach(App.bulbs);
    $$('[data-steam]', root).forEach(App.steam);
    $$('[data-marquee]', root).forEach(App.marquee);
    $$('[data-count]', root).forEach(countUp);
    $$('[data-live]', root).forEach(el => live(el));
    initReveal(root);
    syncFavUI(root);
  };

  injectPocket();
  initHeader();
  renderOpenStatus();
  renderClock();
  setInterval(renderOpenStatus, 30000);
  setInterval(renderClock, 1000);
  App.scan(document);
})();
