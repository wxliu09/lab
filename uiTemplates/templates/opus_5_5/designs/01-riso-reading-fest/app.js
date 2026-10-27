/* ==========================================================================
   澄港市立圖書館 · 2026 城市閱讀節 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒。
     app.js 載入時會自動 App.scan(document)；頁面用 innerHTML 動態插入的內容，
     插完後請呼叫 App.scan(容器) 讓 data-* 元件生效（重複呼叫是安全的）。

   資料（全站單一來源，數字與人名請從這裡取，不要另外手打）
     App.data.festival     會期、主題、開幕時間
     App.data.branches     5 座館舍 {main,north,old,bay,cloud}
     App.data.districts    8 個行政區名稱
     App.data.categories   6 種活動類型 {lecture,workshop,family,exhibit,market,night}
     App.data.speakers     10 位講者（含肖像參數）
     App.data.events       40 檔活動（RF26-xxx），RF26-L04 為焦點講座（event.html）
     App.data.challenge    全市閱讀挑戰累計、里程碑、各區頁數
     App.event(id) / App.branch(key) / App.category(key) / App.speaker(key)
     App.eventURL(ev)      焦點講座 → event.html，其他 → events.html#RF26-xxx

   時間
     App.TODAY = '2026-10-22'；App.now() 回傳「故事裡的現在」：日期固定 2026-10-22（週四），
     時分秒跟著真實時鐘走，所以倒數會動、但永遠停在開幕前。
     App.date(iso) 把 'YYYY-MM-DD' 轉成本地 Date。

   格式
     App.fmt.num(2184650) → "2,184,650"   App.fmt.md('2026-11-07') → "11.07"
     App.fmt.wd(iso) → "六"   App.fmt.wdEn(iso) → "SAT"   App.fmt.when(ev) → "11.07（六）14:30–16:30"
     App.esc(str) HTML 跳脫   App.icon(name, cls) 內嵌線條圖示 SVG 字串
       （pin clock calendar user heart arrow close check search list week info ticket book）

   名額
     App.quota(ev) → { state:'open'|'low'|'wait'|'full'|'free', left, ratio, label, short }
     App.quotaHTML(ev)       → .quota 元件 HTML
     App.statusHTML(ev)      → .status 小標 HTML
     App.eventCardHTML(ev, { desc, level }) → .card.event-card HTML（首頁、列表、同系列共用）

   UI
     App.toast(msg, { tone:'ink'|'pink'|'blue'|'yellow', title, timeout })（modal 開著時自動顯示在 modal 之上）
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="dialogId"] 開啟、[data-modal-close] 關閉；點背景或 Esc 也會關
     App.tabs(tablist)        [data-tabs] 自動初始化；切換時 tablist 觸發 'tabchange'（detail: {tab, panel, index}）
     App.segmented(group)     [data-segmented] 自動初始化；觸發 'segchange'（detail: {value, button}）
     App.stepper(el)          [data-stepper] 自動初始化；改值時 input 觸發 'input' 與 'change'
     App.tooltip.show(html, clientX, clientY) / App.tooltip.hide()
     App.field.setError(input, msg) / App.field.clear(form)
     App.valid.required / phone / card / email / int(v, min, max)
       借閱證號格式：CG + 8 位數字（例：CG20240518）
     [data-bookmark="RF26-xxx"] 收藏鈕（aria-pressed 切換＋toast），狀態在 App.bookmarks（Set），
       變更時 document 觸發 'bookmarkchange'（detail: {id, on}）
     form[data-newsletter]   頁尾電子報訂閱（驗證＋toast）

   動態（皆會在 prefers-reduced-motion 時停用或直接顯示終態）
     [data-reveal]           進場："" | "left" | "right" | "stamp" | "plate"；style="--rd:120ms" 錯開
     .scribble               手繪底線，進場時描出
     [data-drift="0.6"]      套印漂移：隨滑鼠與捲動位移（數值＝深度，負值反向）；用 CSS translate 屬性，
                             可與 transform 並存，但不要和 data-reveal 放在同一個元素
     [data-pulse]            半調網點隨捲動脈動（寫入 --pulse，.ht / .card / .sec-head__no 都吃這個變數）
     [data-odometer="n"]     進入視窗時滾動到 n；App.odometer(el, n) 可再更新
     [data-count="n"]        簡單數字遞增（data-decimals、data-suffix 選填）
     [data-marquee]          跑馬燈（data-speed 每秒像素，data-direction="reverse"）
     [data-countdown="2026-10-31T10:00:00"] 倒數；內含 [data-unit="d|h|m|s"]
     [data-portrait="han"]   講者疊印肖像   [data-barcode="RF26-L04"] 條碼   [data-art="cat"] 空狀態插畫
     App.animate(el, fn)     只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(t, dt)，回傳 stop()
     App.reducedMotion       目前是否要求減少動態（getter）
     App.ink()               取得目前油墨色（canvas 繪圖用）{ pink, blue, yellow, ink, paper, ... }
   ========================================================================== */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ------------------------------------------------------------------
     1. 資料
     ------------------------------------------------------------------ */
  App.TODAY = '2026-10-22';

  App.data = {
    festival: {
      name: '2026 城市閱讀節',
      edition: '第七屆',
      theme: '讀進城市的縫隙',
      org: '澄港市立圖書館',
      start: '2026-10-31',
      end: '2026-11-16',
      opening: '2026-10-31T10:00:00',
      registerOpen: '2026-10-15',
      days: 17,
    },

    districts: ['港埕區', '北岸區', '舊城區', '山腳區', '新灣區', '鹽田區', '溪洲區', '雲嶺區'],

    branches: {
      main:  { key: 'main',  name: '總館',     district: '港埕區', address: '港埕區書院路 1 號' },
      north: { key: 'north', name: '北岸分館', district: '北岸區', address: '北岸區燈塔街 88 號' },
      old:   { key: 'old',   name: '舊城分館', district: '舊城區', address: '舊城區城隍巷 3 號' },
      bay:   { key: 'bay',   name: '新灣分館', district: '新灣區', address: '新灣區海景大道 210 號' },
      cloud: { key: 'cloud', name: '雲嶺分館', district: '雲嶺區', address: '雲嶺區杉林路 15 號' },
    },

    // 順序即篩選器順序
    categories: {
      lecture:  { key: 'lecture',  label: '講座',   en: 'TALK' },
      workshop: { key: 'workshop', label: '工作坊', en: 'WORKSHOP' },
      family:   { key: 'family',   label: '親子',   en: 'FAMILY' },
      exhibit:  { key: 'exhibit',  label: '展覽',   en: 'EXHIBIT' },
      market:   { key: 'market',   label: '市集',   en: 'MARKET' },
      night:    { key: 'night',    label: '夜讀',   en: 'NIGHT' },
    },

    // look：肖像參數（bg 形狀/油墨、髮型、眼睛、眼鏡、配件）
    speakers: {
      han:   { key: 'han',   name: '韓若潮', role: '小說家・散文家', books: ['潮間帶的圖書館', '鹽田手記'],
               bio: '1984 年生於澄港鹽田區，做過八年港務局夜班調度員，下班後在堤防上寫字。著有散文集《鹽田手記》、長篇小說《潮間帶的圖書館》（2026）。',
               look: { bg: 'circle', bgInk: 'ht-yellow', hair: 'bob', eyes: 'closed', glasses: false, acc: 'scarf' } },
      zheng: { key: 'zheng', name: '鄭霧',   role: '詩人・夜班公車司機', books: ['夜班公車詩集', '路燈下的十四行'],
               bio: '開 27 路夜班公車十二年，把詩寫在交班單背面。著有《夜班公車詩集》《路燈下的十四行》。',
               look: { bg: 'arch', bgInk: 'ht-yellow', hair: 'short', eyes: 'open', glasses: true, acc: 'cap' } },
      du:    { key: 'du',    name: '杜望舒', role: '城市史研究者', books: ['舊城街名考', '新灣填海記'],
               bio: '澄港大學歷史系副教授，花了十年替舊城 96 條街道建立命名檔案。著有《舊城街名考》《新灣填海記》。',
               look: { bg: 'square', bgInk: 'ht-blue', hair: 'side', eyes: 'open', glasses: true, acc: 'tie' } },
      bai:   { key: 'bai',   name: '白芮安', role: '圖像小說家', books: ['港口的貓', '雲嶺郵差'],
               bio: '在雲嶺區的山坡上長大，作品只用兩種顏色印刷。著有繪本《港口的貓》、圖像小說《雲嶺郵差》。',
               look: { bg: 'arch', bgInk: 'ht-yellow', hair: 'bun', eyes: 'open', glasses: false, acc: 'pen' } },
      wu:    { key: 'wu',    name: '吳曉嵐', role: '出版史研究者', books: ['碼頭工人的讀書會'],
               bio: '研究澄港百年出版史，從碼頭邊的租書店一路追到今天的獨立出版。著有《碼頭工人的讀書會》。',
               look: { bg: 'circle', bgInk: 'ht-pink', hair: 'long', eyes: 'closed', glasses: false, acc: 'earring' } },
      lin:   { key: 'lin',   name: '林朝暉', role: '總館參考服務組館員', books: ['巷弄裡的索引'],
               bio: '「縫隙書架」主題書展策展人，走遍舊城 143 條巷子，替每一條巷子編一張書目卡。著有《巷弄裡的索引》。',
               look: { bg: 'square', bgInk: 'ht-pink', hair: 'buzz', eyes: 'open', glasses: true, acc: 'tie' } },
      su:    { key: 'su',    name: '蘇沐青', role: '浮島書室店主', books: [],
               bio: '在港埕碼頭邊經營二十坪的「浮島書室」第九年，專收海洋與旅行文學。',
               look: { bg: 'circle', bgInk: 'ht-yellow', hair: 'curly', eyes: 'closed', glasses: false, acc: 'scarf' } },
      chen:  { key: 'chen',  name: '陳硯',   role: '新灣夜讀社店主', books: ['星期五書與酒'],
               bio: '經營只在夜裡營業的「新灣夜讀社」，替失眠的人留一盞檯燈。著有《星期五書與酒》。',
               look: { bg: 'arch', bgInk: 'ht-yellow', hair: 'long', eyes: 'closed', glasses: false, acc: 'beret' } },
      xu:    { key: 'xu',    name: '許安',   role: '總館數位服務組館員', books: [],
               bio: '負責全市借閱數據分析，本站「閱讀數據」頁的資料整理者。',
               look: { bg: 'square', bgInk: 'ht-yellow', hair: 'bob', eyes: 'open', glasses: true, acc: null } },
      liang: { key: 'liang', name: '梁思遠', role: '文學譯者', books: ['退潮時間表（譯）'],
               bio: '譯有《退潮時間表》等二十餘部作品，近年將澄港作家的作品譯為英文與日文。',
               look: { bg: 'circle', bgInk: 'ht-blue', hair: 'side', eyes: 'open', glasses: false, acc: 'pen' } },
    },

    /* 活動：capacity 為 null 表示免報名；waitCap 為候補上限（0 = 不開放候補）
       日期皆為 2026 年；endDate 只有跨日活動才有 */
    events: [
      { id: 'RF26-E01', cat: 'exhibit', title: '縫隙書架：36 本關於城市角落的書', branch: 'main', venue: '總館 3F 主題書區', date: '2026-10-31', endDate: '2026-11-16', start: '08:30', end: '21:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, speakers: ['lin'], audience: '不限',
        desc: '分「巷弄」「水岸」「夜裡」三座書櫃，每本書都夾著館員手寫的「縫隙筆記」，展品可直接借回家。' },
      { id: 'RF26-E04', cat: 'exhibit', title: '北岸漁村手繪地圖展', branch: 'north', venue: '北岸分館 1F 走廊', date: '2026-10-31', endDate: '2026-11-16', start: '08:30', end: '21:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, audience: '不限',
        desc: '六十位北岸居民憑記憶畫出 1980 年代的漁村，與今日街景並排對照。' },
      { id: 'RF26-M01', cat: 'market', title: '開幕書市：港埕書街', branch: 'main', venue: '總館 前廣場', date: '2026-10-31', endDate: '2026-11-01', start: '10:00', end: '18:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, audience: '不限',
        desc: '24 攤獨立書店與小出版社沿書院路排開；10/31 上午 10 點由館長敲鐘開幕。' },
      { id: 'RF26-F01', cat: 'family', title: '貓咪館員說故事：鹽田的白鷺', branch: 'bay', venue: '新灣分館 2F 兒童室', date: '2026-10-31', start: '10:30', end: '11:30', capacity: 30, registered: 30, waitlist: 5, waitCap: 10, audience: '3–8 歲親子',
        desc: '館員戴上貓耳朵，用紙偶劇場講一隻在鹽田迷路的白鷺。' },
      { id: 'RF26-W01', cat: 'workshop', title: '孔版印刷小誌入門', branch: 'main', venue: '總館 4F 創客空間', date: '2026-10-31', start: '14:00', end: '17:00', capacity: 16, registered: 16, waitlist: 12, waitCap: 12, audience: '15 歲以上',
        desc: '兩色油墨、一台孔版印刷機，三小時做出你的第一本 8 頁小誌。材料費 150 元。' },
      { id: 'RF26-N01', cat: 'night', title: '開幕夜：圖書館不關燈', branch: 'main', venue: '總館 全館', date: '2026-10-31', start: '19:00', end: '23:00', capacity: 400, registered: 312, waitlist: 0, waitCap: 0, audience: '不限（未滿 12 歲需家長陪同）',
        desc: '閉館後的總館只留檯燈：書架間尋寶、頂樓朗讀、地下室默片放映，一路開到晚上 11 點。' },
      { id: 'RF26-L01', cat: 'lecture', title: '深夜公車上的十四行', branch: 'north', venue: '北岸分館 2F 多功能室', date: '2026-11-01', start: '15:00', end: '16:30', capacity: 60, registered: 60, waitlist: 8, waitCap: 15, speakers: ['zheng'], audience: '不限',
        desc: '開了十二年夜班公車的詩人，談那些寫在交班單背面的城市。' },
      { id: 'RF26-F02', cat: 'family', title: '紙箱城市：用回收紙蓋一座澄港', branch: 'north', venue: '北岸分館 1F 兒童室', date: '2026-11-01', start: '10:00', end: '12:00', capacity: 24, registered: 19, waitlist: 0, waitCap: 6, audience: '5–10 歲親子',
        desc: '跟著繪本《紙箱城市》，親子一起用回收紙箱蓋出自己的街區。' },
      { id: 'RF26-W02', cat: 'workshop', title: '街角速寫：舊城騎樓', branch: 'old', venue: '舊城分館 門口集合', date: '2026-11-01', start: '09:30', end: '12:00', capacity: 20, registered: 14, waitlist: 0, waitCap: 5, audience: '12 歲以上',
        desc: '從分館門口出發，沿城隍巷畫騎樓、招牌與鐵窗花，不需繪畫基礎。' },
      { id: 'RF26-E03', cat: 'exhibit', title: '借閱單上的城市：五十年借書卡展', branch: 'old', venue: '舊城分館 1F 展區', date: '2026-11-01', endDate: '2026-11-15', start: '08:30', end: '21:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, audience: '不限',
        desc: '五十年來的手寫借書卡，記下了誰在哪一年借走了哪一本書。' },
      { id: 'RF26-N02', cat: 'night', title: '週一不加班讀書會：《鹽田手記》', branch: 'bay', venue: '新灣分館 3F 討論室', date: '2026-11-02', start: '19:30', end: '21:00', capacity: 25, registered: 9, waitlist: 0, waitCap: 5, series: 'han', audience: '不限',
        desc: '下班後一起讀韓若潮的《鹽田手記》，11/7 講座前的暖身共讀。' },
      { id: 'RF26-L02', cat: 'lecture', title: '從漁港到書港：澄港出版百年', branch: 'main', venue: '總館 B1 演講廳', date: '2026-11-03', start: '19:00', end: '20:30', capacity: 180, registered: 97, waitlist: 0, waitCap: 30, speakers: ['wu'], audience: '不限',
        desc: '從碼頭邊的租書店到今天的獨立出版，一百年的澄港出版史。' },
      { id: 'RF26-W03', cat: 'workshop', title: '線裝書手作：縫一本自己的筆記', branch: 'cloud', venue: '雲嶺分館 2F 研習室', date: '2026-11-03', start: '14:00', end: '16:30', capacity: 15, registered: 11, waitlist: 0, waitCap: 5, audience: '12 歲以上',
        desc: '用麻線與和紙縫一本四眼線裝筆記本，帶回家寫你的城市筆記。' },
      { id: 'RF26-F03', cat: 'family', title: '繪本裡的港口', branch: 'bay', venue: '新灣分館 2F 兒童室', date: '2026-11-04', start: '10:00', end: '11:00', capacity: 30, registered: 22, waitlist: 0, waitCap: 6, audience: '3–8 歲親子',
        desc: '溪洲小舟繪本屋選出六本關於港口的繪本，邊讀邊摺紙船。' },
      { id: 'RF26-E02', cat: 'exhibit', title: '《雲嶺郵差》原畫展', branch: 'cloud', venue: '雲嶺分館 1F 藝廊', date: '2026-11-04', endDate: '2026-11-16', start: '08:30', end: '21:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, speakers: ['bai'], audience: '不限',
        desc: '白芮安圖像小說《雲嶺郵差》的 48 張雙色原稿首度公開。' },
      { id: 'RF26-N03', cat: 'night', title: '宵夜與詩：北岸夜讀', branch: 'north', venue: '北岸分館 2F 多功能室', date: '2026-11-04', start: '20:00', end: '22:00', capacity: 30, registered: 30, waitlist: 0, waitCap: 0, speakers: ['zheng'], audience: '12 歲以上',
        desc: '鄭霧帶大家邊吃鹹粥邊讀詩，讀完一起寫一行給夜班的人。' },
      { id: 'RF26-L03', cat: 'lecture', title: '為城市寫一份索引：館員的田野筆記', branch: 'old', venue: '舊城分館 2F 演講室', date: '2026-11-05', start: '19:00', end: '20:30', capacity: 80, registered: 38, waitlist: 0, waitCap: 20, speakers: ['lin'], audience: '不限',
        desc: '策展人林朝暉分享走遍舊城 143 條巷子、為每條巷子編目的田野筆記。' },
      { id: 'RF26-W04', cat: 'workshop', title: '城市聲音地圖：錄下你的街區', branch: 'bay', venue: '新灣分館 4F 數位創作室', date: '2026-11-05', start: '14:00', end: '17:00', capacity: 18, registered: 15, waitlist: 0, waitCap: 5, audience: '15 歲以上',
        desc: '帶上手機錄下你住的街區，拼成一張可以「聽」的澄港地圖。' },
      { id: 'RF26-N04', cat: 'night', title: '星期五書與酒', branch: 'bay', venue: '新灣分館 頂樓平台', date: '2026-11-06', start: '20:00', end: '23:00', capacity: 40, registered: 37, waitlist: 0, waitCap: 10, speakers: ['chen'], audience: '18 歲以上',
        desc: '新灣夜讀社店主陳硯在頂樓開一夜酒吧，每杯酒配一本書。' },
      { id: 'RF26-F04', cat: 'family', title: '床邊故事睡衣派對', branch: 'main', venue: '總館 1F 兒童館', date: '2026-11-06', start: '19:00', end: '20:30', capacity: 40, registered: 40, waitlist: 14, waitCap: 20, audience: '4–9 歲親子',
        desc: '穿著睡衣來圖書館！館員在兒童館搭帳篷，講三個床邊故事。' },
      { id: 'RF26-W05', cat: 'workshop', title: '寫給街區的一封信：散文寫作', branch: 'main', venue: '總館 4F 研習室', date: '2026-11-07', start: '10:00', end: '12:30', capacity: 24, registered: 24, waitlist: 6, waitCap: 10, speakers: ['han'], series: 'han', audience: '15 歲以上',
        desc: '韓若潮帶領的散文寫作課：選一條你熟悉的街，寫一封信給它。' },
      { id: 'RF26-L04', cat: 'lecture', title: '在港口與巷弄之間書寫', subtitle: '韓若潮《潮間帶的圖書館》新書講座', branch: 'main', venue: '總館 B1 演講廳', date: '2026-11-07', start: '14:30', end: '16:30', capacity: 180, registered: 162, waitlist: 0, waitCap: 30, speakers: ['han', 'su'], series: 'han', featured: true, audience: '不限',
        desc: '小說家韓若潮談新作《潮間帶的圖書館》：一座只在退潮時出現的圖書館，如何長成一部小說。由浮島書室店主蘇沐青主持。' },
      { id: 'RF26-M02', cat: 'market', title: '北岸二手書交換市集', branch: 'north', venue: '北岸分館 前庭', date: '2026-11-07', endDate: '2026-11-08', start: '10:00', end: '17:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, audience: '不限',
        desc: '帶一本舊書換一本好書；閱讀挑戰突破 200 萬頁，市集加碼延長至週日。' },
      { id: 'RF26-F05', cat: 'family', title: '小小館員一日體驗', branch: 'cloud', venue: '雲嶺分館 1F 服務台', date: '2026-11-07', start: '09:30', end: '12:00', capacity: 12, registered: 12, waitlist: 0, waitCap: 0, audience: '8–12 歲',
        desc: '穿上館員背心，學習上架、修書與借還書，完成任務可得館員證。' },
      { id: 'RF26-L05', cat: 'lecture', title: '獨立書店還能怎麼開？', branch: 'old', venue: '舊城分館 2F 演講室', date: '2026-11-08', start: '15:00', end: '17:00', capacity: 80, registered: 66, waitlist: 0, waitCap: 20, speakers: ['su', 'chen'], audience: '不限',
        desc: '浮島書室蘇沐青與新灣夜讀社陳硯，對談小書店在城市縫隙裡的生存之道。' },
      { id: 'RF26-F06', cat: 'family', title: '森林裡的圖書館：雲嶺步道說故事', branch: 'cloud', venue: '雲嶺分館 後山步道口集合', date: '2026-11-08', start: '09:00', end: '11:30', capacity: 25, registered: 18, waitlist: 0, waitCap: 5, audience: '5–12 歲親子',
        desc: '沿著雲嶺後山步道邊走邊聽故事，終點是一座樹屋小書櫃。' },
      { id: 'RF26-N05', cat: 'night', title: '靜默閱讀一小時', branch: 'main', venue: '總館 5F 閱覽室', date: '2026-11-09', start: '19:00', end: '21:00', capacity: 60, registered: 21, waitlist: 0, waitCap: 10, audience: '12 歲以上',
        desc: '不說話、不滑手機，和六十位陌生人一起安靜讀一本書。' },
      { id: 'RF26-L06', cat: 'lecture', title: '舊城牆的縫隙：街道命名考', branch: 'old', venue: '舊城分館 2F 演講室', date: '2026-11-10', start: '19:00', end: '20:30', capacity: 80, registered: 51, waitlist: 0, waitCap: 20, speakers: ['du'], audience: '不限',
        desc: '城市史研究者杜望舒帶你從街名讀出舊城牆的位置，與那些消失的城門。' },
      { id: 'RF26-W06', cat: 'workshop', title: '書封設計：兩色就夠了', branch: 'main', venue: '總館 4F 創客空間', date: '2026-11-11', start: '19:00', end: '21:30', capacity: 16, registered: 13, waitlist: 0, waitCap: 5, audience: '15 歲以上',
        desc: '只用兩種顏色設計一張書封，從版面、字體談到疊印錯位。' },
      { id: 'RF26-F07', cat: 'family', title: '繪本劇場：港口的貓', branch: 'north', venue: '北岸分館 1F 兒童室', date: '2026-11-11', start: '10:00', end: '11:00', capacity: 35, registered: 28, waitlist: 0, waitCap: 8, speakers: ['bai'], audience: '3–8 歲親子',
        desc: '白芮安的繪本《港口的貓》改編成光影劇場，演出後可與作者合影。' },
      { id: 'RF26-N06', cat: 'night', title: '《潮間帶的圖書館》共讀會', branch: 'main', venue: '總館 3F 主題書區', date: '2026-11-12', start: '19:30', end: '21:30', capacity: 30, registered: 17, waitlist: 0, waitCap: 5, series: 'han', audience: '不限',
        desc: '新書講座後的延伸共讀，在主題書區的檯燈下一起讀第一章。' },
      { id: 'RF26-L07', cat: 'lecture', title: '讀者到底在讀什麼：借閱數據裡的澄港', branch: 'bay', venue: '新灣分館 3F 演講室', date: '2026-11-12', start: '19:00', end: '20:30', capacity: 60, registered: 33, waitlist: 0, waitCap: 10, speakers: ['xu'], audience: '不限',
        desc: '數位服務組館員許安解讀全市借閱數據：哪一區最愛讀詩？深夜誰在借書？' },
      { id: 'RF26-N07', cat: 'night', title: '霧中讀信：雲嶺山屋夜讀', branch: 'cloud', venue: '雲嶺分館 山屋閱覽室', date: '2026-11-13', start: '19:00', end: '22:00', capacity: 20, registered: 20, waitlist: 3, waitCap: 6, audience: '12 歲以上',
        desc: '在雲嶺山屋點一盞燈，朗讀寄往山上的四十封信，附熱茶。' },
      { id: 'RF26-W07', cat: 'workshop', title: '拼貼詩：剪開報紙重組城市', branch: 'north', venue: '北岸分館 2F 多功能室', date: '2026-11-13', start: '14:00', end: '16:00', capacity: 20, registered: 8, waitlist: 0, waitCap: 5, audience: '12 歲以上',
        desc: '把舊報紙剪成一個一個字，重新拼成一首關於澄港的詩。' },
      { id: 'RF26-L08', cat: 'lecture', title: '畫一條回家的山路', branch: 'cloud', venue: '雲嶺分館 2F 演講室', date: '2026-11-14', start: '14:00', end: '15:30', capacity: 50, registered: 46, waitlist: 0, waitCap: 10, speakers: ['bai'], audience: '不限',
        desc: '圖像小說家白芮安談《雲嶺郵差》的創作：如何只用兩種顏色畫出霧。' },
      { id: 'RF26-M03', cat: 'market', title: '鹽田手作書市', branch: 'bay', venue: '新灣分館 海景廣場', date: '2026-11-14', endDate: '2026-11-15', start: '10:00', end: '18:00', capacity: null, registered: 0, waitlist: 0, waitCap: 0, audience: '不限',
        desc: '鹽田區的手工書、活版印刷與在地小誌，三十攤一次逛完。' },
      { id: 'RF26-F08', cat: 'family', title: '爸爸媽媽的童年書', branch: 'old', venue: '舊城分館 1F 兒童區', date: '2026-11-14', start: '10:30', end: '12:00', capacity: 30, registered: 12, waitlist: 0, waitCap: 6, audience: '親子不限年齡',
        desc: '請爸媽帶一本小時候讀過的書，和孩子交換彼此的故事。' },
      { id: 'RF26-L09', cat: 'lecture', title: '翻譯一座城市：在地文學外譯', branch: 'main', venue: '總館 B1 演講廳', date: '2026-11-15', start: '15:00', end: '16:30', capacity: 180, registered: 74, waitlist: 0, waitCap: 30, speakers: ['liang'], audience: '不限',
        desc: '譯者梁思遠談如何把澄港的街名、方言與潮汐，翻成另一種語言。' },
      { id: 'RF26-W08', cat: 'workshop', title: '藏書票版畫', branch: 'old', venue: '舊城分館 2F 研習室', date: '2026-11-15', start: '13:30', end: '16:30', capacity: 16, registered: 16, waitlist: 4, waitCap: 8, audience: '12 歲以上',
        desc: '刻一枚屬於自己的藏書票，用孔版印在你最愛的那本書裡。' },
      { id: 'RF26-N08', cat: 'night', title: '閉幕夜：最後一頁', branch: 'main', venue: '總館 1F 大廳', date: '2026-11-16', start: '19:00', end: '21:30', capacity: 300, registered: 188, waitlist: 0, waitCap: 0, audience: '不限',
        desc: '十位作家接力完成的小說《最後一頁》首度朗讀，為十七天的閱讀節闔上書。' },
    ],

    challenge: {
      title: '全市閱讀挑戰：一起讀 300 萬頁',
      start: '2026-09-01',
      end: '2026-11-16',
      asOf: '10.22 08:00',
      goal: 3000000,
      pages: 2184650,
      readers: 18426,
      yesterday: 47310,
      avg7d: 45900,
      eta: '11.09',
      milestones: [
        { at: 1000000, label: '100 萬頁', reward: '夜讀延長至 23:00', reached: '09.27' },
        { at: 2000000, label: '200 萬頁', reward: '二手書市加碼一天', reached: '10.18' },
        { at: 2500000, label: '250 萬頁', reward: '全市逾期金赦免週', reached: null },
        { at: 3000000, label: '300 萬頁', reward: '參加者獲限量孔版藏書票', reached: null },
      ],
      // 各區頁數總和＝pages，人數總和＝readers
      districts: [
        { name: '港埕區', pages: 412380, readers: 3412 },
        { name: '北岸區', pages: 336920, readers: 2688 },
        { name: '舊城區', pages: 298415, readers: 2451 },
        { name: '山腳區', pages: 187260, readers: 1602 },
        { name: '新灣區', pages: 351740, readers: 2973 },
        { name: '鹽田區', pages: 142305, readers: 1198 },
        { name: '溪洲區', pages: 205890, readers: 1836 },
        { name: '雲嶺區', pages: 249740, readers: 2266 },
      ],
    },
  };

  App.event = id => App.data.events.find(ev => ev.id === id);
  App.branch = key => App.data.branches[key];
  App.category = key => App.data.categories[key];
  App.speaker = key => App.data.speakers[key];
  App.eventURL = ev => (ev.featured ? 'event.html' : `events.html#${ev.id}`);

  /* ------------------------------------------------------------------
     2. 時間與格式
     ------------------------------------------------------------------ */
  App.date = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  App.now = () => {
    const real = new Date();
    return new Date(2026, 9, 22, real.getHours(), real.getMinutes(), real.getSeconds());
  };

  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const WD_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const pad = n => String(n).padStart(2, '0');

  App.fmt = {
    num: n => Number(n).toLocaleString('zh-TW'),
    md: iso => { const d = App.date(iso); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; },
    wd: iso => WD[App.date(iso).getDay()],
    wdEn: iso => WD_EN[App.date(iso).getDay()],
    pad,
    when(ev) {
      if (ev.endDate) return `${App.fmt.md(ev.date)}（${App.fmt.wd(ev.date)}）— ${App.fmt.md(ev.endDate)}（${App.fmt.wd(ev.endDate)}）`;
      return `${App.fmt.md(ev.date)}（${App.fmt.wd(ev.date)}）${ev.start}–${ev.end}`;
    },
  };

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  App.esc = str => String(str).replace(/[&<>"']/g, ch => ESC_MAP[ch]);

  const ICONS = {
    pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 1 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    week: '<rect x="3.5" y="4.5" width="17" height="15"/><path d="M3.5 9.5h17M9.2 9.5v10M14.8 9.5v10"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.01"/>',
    ticket: '<path d="M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z"/><path d="M14 8.5v1.5M14 12v1.5M14 15.5v1"/>',
    book: '<path d="M4 5.5c3-1 5.5-.6 8 1.2 2.5-1.8 5-2.2 8-1.2v13c-3-1-5.5-.6-8 1.2-2.5-1.8-5-2.2-8-1.2z"/><path d="M12 6.7v13"/>',
  };
  App.icon = (name, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  /* ------------------------------------------------------------------
     3. 名額與活動卡
     ------------------------------------------------------------------ */
  App.quota = ev => {
    if (ev.capacity == null) {
      return { state: 'free', left: null, ratio: 0, label: '免報名 · 自由入場', short: '免報名' };
    }
    const left = Math.max(ev.capacity - ev.registered, 0);
    const ratio = Math.min(ev.registered / ev.capacity, 1);
    if (left === 0) {
      if (ev.waitCap > ev.waitlist) {
        return { state: 'wait', left: 0, ratio: 1, label: `額滿 · 開放候補（已候補 ${ev.waitlist} 人）`, short: '可候補' };
      }
      return { state: 'full', left: 0, ratio: 1, label: '額滿 · 候補已截止', short: '額滿' };
    }
    // 「即將額滿」門檻：剩不到 12% 或 5 位以內
    if (left <= Math.max(5, ev.capacity * 0.12)) {
      return { state: 'low', left, ratio, label: `剩 ${left} 位 · 即將額滿`, short: `剩 ${left} 位` };
    }
    return { state: 'open', left, ratio, label: `剩 ${left} 位`, short: `剩 ${left} 位` };
  };

  App.quotaHTML = ev => {
    const q = App.quota(ev);
    const num = ev.capacity == null ? '免費' : `${App.fmt.num(ev.registered)} / ${App.fmt.num(ev.capacity)}`;
    const aria = ev.capacity == null ? '免報名，自由入場' : `已報名 ${ev.registered} 人，名額 ${ev.capacity} 人`;
    return `<div class="quota quota--${q.state}" style="--q:${q.ratio.toFixed(3)}">
      <div class="quota__head"><span class="quota__label">${q.label}</span><span class="quota__num">${num}</span></div>
      <div class="quota__bar" role="img" aria-label="${aria}"><span class="quota__fill"></span></div>
    </div>`;
  };

  App.statusHTML = ev => {
    const q = App.quota(ev);
    return `<span class="status status--${q.state}">${q.short}</span>`;
  };

  App.eventCardHTML = (ev, { desc = false, level = 3 } = {}) => {
    const cat = App.category(ev.cat);
    const br = App.branch(ev.branch);
    const date = ev.endDate
      ? `<span class="event-card__md">${App.fmt.md(ev.date)}</span><span class="event-card__wd">${App.fmt.wdEn(ev.date)} → ${App.fmt.md(ev.endDate)} ${App.fmt.wdEn(ev.endDate)}</span>`
      : `<span class="event-card__md">${App.fmt.md(ev.date)}</span><span class="event-card__wd">${App.fmt.wdEn(ev.date)} · ${ev.start}–${ev.end}</span>`;
    const pressed = App.bookmarks.has(ev.id);
    return `<article class="card card--plate event-card" data-event="${ev.id}">
      <div class="event-card__top">
        <span class="badge cat-${ev.cat}">${cat.label}</span>
        <span class="event-card__id">${ev.id}</span>
        <button class="icon-btn icon-btn--bare bookmark" type="button" data-bookmark="${ev.id}" data-title="${App.esc(ev.title)}" aria-pressed="${pressed}" aria-label="收藏「${App.esc(ev.title)}」">${App.icon('heart')}</button>
      </div>
      <p class="event-card__date">${date}</p>
      <h${level} class="event-card__title"><a href="${App.eventURL(ev)}"><span class="plates plates--ink" data-text="${App.esc(ev.title)}">${App.esc(ev.title)}</span></a></h${level}>
      <p class="event-card__meta"><span>${App.icon('pin')}${App.esc(ev.venue)}</span><span>${br.district}</span></p>
      ${desc ? `<p class="event-card__desc">${App.esc(ev.desc)}</p>` : ''}
      <div class="event-card__foot">${App.quotaHTML(ev)}</div>
    </article>`;
  };

  /* ------------------------------------------------------------------
     4. 插畫：SVG pattern、肖像、條碼、貓
     ------------------------------------------------------------------ */
  function injectDefs() {
    if (document.getElementById('rf-defs')) return;
    const dot = (id, cls, size, r) =>
      `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="${cls}"/></pattern>`;
    const hatch = (id, cls) =>
      `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.6" height="7" class="${cls}"/></pattern>`;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="rf-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
      ${dot('rf-ht-blue', 'ink-blue', 6, 1.7)}${dot('rf-ht-pink', 'ink-pink', 6, 1.7)}
      ${dot('rf-ht-yellow', 'ink-yellow', 6, 2.1)}${dot('rf-ht-ink', 'ink-ink', 6, 1.2)}
      ${dot('rf-ht-blue-lg', 'ink-blue', 11, 3.2)}${dot('rf-ht-pink-lg', 'ink-pink', 11, 3.2)}
      ${hatch('rf-hatch-blue', 'ink-blue')}${hatch('rf-hatch-pink', 'ink-pink')}
    </defs></svg>`;
    document.body.prepend(holder.firstElementChild);
  }

  const HAIR = {
    bob: '<path d="M58 120C50 74 72 50 101 50c31 0 51 24 42 70l1 22h-18c4-22 4-42-4-56-18 8-40 8-50 0-2 18-2 38 2 56H56z"/>',
    short: '<path d="M62 102C58 66 82 52 102 52c24 0 42 16 37 50-5-14-15-22-27-24-14 6-34 8-50 24z"/>',
    bun: '<circle cx="100" cy="42" r="17"/><path d="M62 100c-2-32 20-44 38-44 22 0 42 14 38 44-12-16-62-18-76 0z"/>',
    long: '<path d="M60 104C54 66 78 50 100 50c24 0 48 16 41 54l9 78h-22l4-82c-14-16-48-18-64 0l4 82H50z"/>',
    curly: '<circle cx="66" cy="90" r="15"/><circle cx="78" cy="68" r="17"/><circle cx="100" cy="58" r="19"/><circle cx="122" cy="68" r="17"/><circle cx="134" cy="90" r="15"/><circle cx="60" cy="112" r="11"/><circle cx="140" cy="112" r="11"/>',
    buzz: '<path fill="url(#rf-ht-blue)" d="M63 96c0-28 19-38 37-38 20 0 37 10 37 38-13-10-61-10-74 0z"/><path d="M63 96c0-28 19-38 37-38 20 0 37 10 37 38" fill="none" stroke-width="3" class="stroke-blue"/>',
    side: '<path d="M60 106C54 66 82 50 104 50c24 0 44 16 37 56-7-20-21-30-41-30-12 16-26 22-40 30z"/>',
  };

  const BG = {
    circle: '<circle cx="114" cy="90" r="78"/>',
    arch: '<path d="M30 220V98a70 70 0 0 1 140 0v122z"/>',
    square: '<rect x="22" y="26" width="160" height="176" transform="rotate(-4 100 114)"/>',
  };
  // 背景一律用網點：實色黃會和粉色臉疊成朱紅、讓頭髮變綠
  const BG_FILL = { 'ht-yellow': 'fill="url(#rf-ht-yellow)"', 'ht-blue': 'fill="url(#rf-ht-blue)"', 'ht-pink': 'fill="url(#rf-ht-pink)"' };

  App.art = {
    portrait(key, { title = true } = {}) {
      const sp = App.speaker(key);
      const L = sp.look;
      const eyes = L.eyes === 'closed'
        ? '<path class="stroke-blue" stroke-width="3.6" d="M80 108q6-6 12 0M108 108q6-6 12 0"/>'
        : '<circle cx="86" cy="108" r="3.8" class="ink-blue"/><circle cx="114" cy="108" r="3.8" class="ink-blue"/>';
      const glasses = L.glasses
        ? '<g class="stroke-blue" stroke-width="3.4"><circle cx="86" cy="107" r="12.5"/><circle cx="114" cy="107" r="12.5"/><path d="M98.5 106h3M73.5 105l-9-3M126.5 105l9-3"/></g>'
        : '';
      const acc = {
        scarf: { y: '<path d="M68 158q32 20 64 0l4 16q-36 22-72 0z"/><path d="M116 172l12 36-15 3-7-35z"/>' },
        cap: { b: '<path d="M60 84c0-34 80-34 80 0z"/><path d="M54 82h100q8 8-4 11H54z"/>', y: '<path d="M60 74h80v8H60z"/>' },
        tie: { y: '<path d="M93 166h14l4 30-11 11-11-11z"/>' },
        pen: { y: '<rect x="134" y="58" width="8" height="46" rx="2" transform="rotate(26 138 81)"/>', b: '<path d="M151 99l-6 9-2-11z"/>' },
        earring: { y: '<circle cx="62" cy="126" r="6"/>' },
        beret: { p: '<ellipse cx="96" cy="58" rx="50" ry="17" transform="rotate(-8 96 58)"/><rect x="92" y="34" width="6" height="10" rx="2"/>' },
      }[L.acc] || {};
      const label = title ? `<title>${App.esc(sp.name)}的疊印肖像</title>` : '';
      return `<svg class="portrait" viewBox="0 0 200 220" role="img" aria-label="${App.esc(sp.name)}">${label}
        <g class="py mult"><g ${BG_FILL[L.bgInk]}>${BG[L.bg]}</g><g class="ink-yellow"><circle cx="79" cy="124" r="8"/><circle cx="121" cy="124" r="8"/>${acc.y || ''}</g></g>
        <g class="pb mult ink-blue"><path d="M24 220c4-38 34-58 76-58s72 20 76 58z"/>${HAIR[L.hair]}${eyes}
          <path class="stroke-blue" stroke-width="3.4" d="M100 112l-4 13h7M90 136q10 7 20 0"/>${glasses}${acc.b || ''}</g>
        <g class="pp mult ink-pink"><path d="M86 132h28v32q-14 8-28 0z"/><ellipse cx="62" cy="110" rx="7" ry="10"/><ellipse cx="138" cy="110" rx="7" ry="10"/><ellipse cx="100" cy="104" rx="38" ry="46"/>${acc.p || ''}</g>
      </svg>`;
    },

    // 條碼：由字元碼決定線寬，僅作視覺（同一字串永遠產生同樣的條碼）
    barcode(code, { height = 40 } = {}) {
      const widths = [2, 1, 1, 1, 2]; // 起始符
      for (const ch of code) {
        const n = ch.charCodeAt(0);
        widths.push(1 + (n % 3), 1 + ((n >> 2) % 2), 1 + ((n >> 3) % 3), 1 + ((n >> 1) % 2));
      }
      widths.push(2, 1, 1, 2);
      let x = 0;
      let rects = '';
      widths.forEach((w, i) => {
        if (i % 2 === 0) rects += `<rect x="${x}" width="${w}" height="${height}"/>`;
        x += w;
      });
      return `<svg class="barcode" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" role="img" aria-label="條碼 ${App.esc(code)}"><g fill="currentColor">${rects}</g></svg>`;
    },

    // 空狀態：睡在攤開書本上的貓
    cat() {
      return `<svg class="art-cat" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
        <g class="mult ink-yellow"><circle cx="156" cy="34" r="17"/></g>
        <g class="mult ink-blue"><path d="M14 120q43-18 86 0 43-18 86 0v16q-43-18-86 0-43-18-86 0z"/><path d="M98 120h4v16h-4z"/>
          <path class="stroke-blue" stroke-width="3.2" d="M58 84q5 4 10 0M74 84q5 4 10 0"/>
          <text x="112" y="44" font-family="Space Mono, monospace" font-weight="700" font-size="15" class="ink-blue">z</text>
          <text x="124" y="30" font-family="Space Mono, monospace" font-weight="700" font-size="11" class="ink-blue">z</text></g>
        <g class="mult ink-pink"><ellipse cx="108" cy="102" rx="54" ry="22"/><circle cx="70" cy="86" r="21"/>
          <path d="M53 76l3-22 14 14zM75 66l12-14 3 22z"/>
          <path class="stroke-pink" stroke-width="11" d="M160 106q16 6 4 18-14 10-58 4"/></g>
      </svg>`;
    },
  };

  /* ------------------------------------------------------------------
     5. Toast / Modal / Tooltip
     ------------------------------------------------------------------ */
  let toastBox = null;
  // showModal 會把 dialog 放進 top layer、頁面其餘部分變成 inert：留在 body 的 toast 會被 modal 蓋住，
  // 螢幕閱讀器也讀不到。所以有 modal 開著時把 toast 容器搬進最上層的 dialog，關掉後再搬回 body
  const placeToasts = () => {
    if (toastBox) ($$('dialog.modal[open]').pop() || document.body).append(toastBox);
  };
  // close 事件不冒泡，用捕獲階段在 document 上統一接
  document.addEventListener('close', e => {
    if (toastBox && e.target instanceof HTMLDialogElement && e.target.contains(toastBox)) placeToasts();
  }, true);
  App.toast = (msg, { tone = 'ink', title = '', timeout = 3600 } = {}) => {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
    }
    placeToasts();
    const t = document.createElement('div');
    t.className = `toast toast--${tone}`;
    t.innerHTML = `${App.icon(tone === 'pink' ? 'info' : 'check', 'toast__icon')}<div>${title ? `<b class="toast__title">${App.esc(title)}</b>` : ''}${App.esc(msg)}</div>`;
    toastBox.append(t);
    // 同時最多疊 3 張，舊的先撕掉
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add('is-out');
      setTimeout(() => t.remove(), 320);
    }, timeout);
    return t;
  };

  const resolveDialog = target => (typeof target === 'string' ? document.getElementById(target) : target);
  App.modal = {
    open(target) {
      const d = resolveDialog(target);
      if (!d.open) d.showModal();
      placeToasts();
      d.dispatchEvent(new CustomEvent('modalopen'));
      return d;
    },
    close(target) {
      const d = target ? resolveDialog(target) : $$('dialog.modal[open]').pop();
      if (d && d.open) d.close();
    },
  };
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) {
      App.modal.open(opener.dataset.modalOpen);
      return;
    }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) {
      App.modal.close(closer.closest('dialog'));
      return;
    }
    // 點到 dialog 本體（內容外的背景區）就關閉
    if (e.target instanceof HTMLDialogElement && e.target.matches('.modal[open]')) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) e.target.close();
    }
  });

  let tipEl = null;
  App.tooltip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.append(tipEl);
      }
      tipEl.innerHTML = html;
      tipEl.classList.add('is-on');
      const w = tipEl.offsetWidth;
      const h = tipEl.offsetHeight;
      const left = clamp(x + 14, 8, innerWidth - w - 8);
      const top = y - h - 14 < 8 ? y + 18 : y - h - 14;
      tipEl.style.transform = `translate(${left}px, ${top}px)`;
    },
    hide() {
      if (tipEl) tipEl.classList.remove('is-on');
    },
  };

  /* ------------------------------------------------------------------
     6. 表單驗證
     ------------------------------------------------------------------ */
  App.valid = {
    required: v => String(v).trim().length > 0,
    // 手機 09xxxxxxxx 或市話 0x-xxxxxxx（允許空白與連字號）
    phone: v => /^(09\d{8}|0[2-8]\d{7,8})$/.test(String(v).replace(/[\s-]/g, '')),
    card: v => /^CG\d{8}$/.test(String(v).trim().toUpperCase()),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()),
    int: (v, min, max) => /^\d+$/.test(String(v).trim()) && Number(v) >= min && Number(v) <= max,
  };
  App.field = {
    setError(input, msg) {
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const field = input.closest('.field');
      field.classList.toggle('is-invalid', Boolean(msg));
      const err = field.querySelector('.field__error');
      err.textContent = msg || '';
      if (err.id && !input.getAttribute('aria-describedby')?.includes(err.id)) {
        input.setAttribute('aria-describedby', `${input.getAttribute('aria-describedby') || ''} ${err.id}`.trim());
      }
    },
    clear(form) {
      $$('[aria-invalid]', form).forEach(input => App.field.setError(input, ''));
    },
  };

  // 頁尾電子報（每頁都有，所以放在共用層）
  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-newsletter]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const v = input.value.trim();
    const msg = !v ? '請輸入 Email' : !App.valid.email(v) ? 'Email 格式不太對，例如 reader@example.com' : '';
    App.field.setError(input, msg);
    if (msg) {
      input.focus();
      return;
    }
    form.reset();
    App.toast(`每週五寄到 ${v}，第一期會附上活動總表 PDF。`, { tone: 'blue', title: '已訂閱閱讀節小誌' });
  });

  /* ------------------------------------------------------------------
     7. 收藏
     ------------------------------------------------------------------ */
  App.bookmarks = new Set();
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-bookmark]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.bookmark;
    const on = !App.bookmarks.has(id);
    if (on) App.bookmarks.add(id);
    else App.bookmarks.delete(id);
    // 同一活動可能同時出現在多個地方（例如首頁卡與講者卡），一起更新
    $$(`[data-bookmark="${id}"]`).forEach(b => b.setAttribute('aria-pressed', String(on)));
    const title = btn.dataset.title || id;
    App.toast(on ? `已收藏「${title}」，共 ${App.bookmarks.size} 檔。` : `已取消收藏「${title}」。`, { tone: on ? 'pink' : 'ink' });
    document.dispatchEvent(new CustomEvent('bookmarkchange', { detail: { id, on } }));
  });

  /* ------------------------------------------------------------------
     8. Tabs / Segmented / Stepper
     ------------------------------------------------------------------ */
  App.tabs = list => {
    if (list.dataset.tabsReady) return;
    list.dataset.tabsReady = '1';
    const tabs = $$('[role="tab"]', list);
    const panelOf = tab => document.getElementById(tab.getAttribute('aria-controls'));
    const select = (tab, { focus = false, emit = true } = {}) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = panelOf(t);
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      if (emit) list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: panelOf(tab), index: tabs.indexOf(tab) } }));
    };
    tabs.forEach(t => t.addEventListener('click', () => select(t)));
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], { focus: true });
    });
    select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0], { emit: false });
  };

  App.segmented = group => {
    if (group.dataset.segReady) return;
    group.dataset.segReady = '1';
    const buttons = $$('button', group);
    group.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      group.dispatchEvent(new CustomEvent('segchange', { detail: { value: btn.dataset.value, button: btn } }));
    });
  };

  App.stepper = el => {
    if (el.dataset.stepReady) return;
    el.dataset.stepReady = '1';
    const input = el.querySelector('input');
    const [dec, inc] = [el.querySelector('[data-step="-1"]'), el.querySelector('[data-step="1"]')];
    const min = Number(input.min || 0);
    const max = Number(input.max || 99);
    const sync = () => {
      dec.disabled = Number(input.value) <= min;
      inc.disabled = Number(input.value) >= max;
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      input.value = clamp((Number(input.value) || min) + Number(b.dataset.step), min, max);
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    input.addEventListener('input', sync);
    sync();
  };

  /* ------------------------------------------------------------------
     9. 頁首：行動選單、目前頁、捲動狀態
     ------------------------------------------------------------------ */
  function initHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const toggle = header.querySelector('.nav-toggle');
    const label = toggle.querySelector('.nav-toggle__label');
    const setOpen = open => {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      label.textContent = open ? '關閉' : '選單';
    };
    toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
    header.addEventListener('click', e => {
      if (e.target.closest('.site-nav__link')) setOpen(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    matchMedia('(min-width: 900px)').addEventListener('change', () => setOpen(false));

    // 目前頁：依檔名自動標記，複製 header 的頁面不用手動改
    const file = decodeURIComponent(location.pathname.split('/').pop()) || 'index.html';
    $$('.site-nav__link', header).forEach(a => {
      const on = a.getAttribute('href') === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Esc：關掉最上層 modal 與 tooltip（原生 dialog 也會處理實體 Esc，這裡補程式觸發的情況）
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    App.tooltip.hide();
    App.modal.close();
  });

  /* ------------------------------------------------------------------
     10. 進場（reveal）、滾動數字、計數
     ------------------------------------------------------------------ */
  const inView = el => {
    const r = el.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0 && (r.width > 0 || r.height > 0);
  };
  const pendingReveal = new Set();

  function enter(el) {
    pendingReveal.delete(el);
    revealIO.unobserve(el);
    if (el.classList.contains('is-in')) return;
    el.classList.add('is-in');
    if (el.hasAttribute('data-odometer')) App.odometer(el, Number(el.dataset.odometer));
    if (el.hasAttribute('data-count')) countUp(el);
  }
  const revealIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) enter(entry.target);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

  function registerReveal(el) {
    if (el.dataset.revealReady) return;
    el.dataset.revealReady = '1';
    if (App.reducedMotion || inView(el)) {
      enter(el);
      return;
    }
    pendingReveal.add(el);
    revealIO.observe(el);
  }
  // 保底：錨點跳轉、程式捲動或極快捲動時 IO 可能漏報；捲動停下後把已在視窗內或已捲過的元素補上
  function sweepReveal() {
    pendingReveal.forEach(el => {
      if (el.getBoundingClientRect().top < innerHeight) enter(el);
    });
  }
  let sweepTimer = 0;
  addEventListener('scroll', () => {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweepReveal, 160);
  }, { passive: true });
  addEventListener('load', () => setTimeout(sweepReveal, 1200));
  addEventListener('beforeprint', () => pendingReveal.forEach(enter));

  App.odometer = (el, value) => {
    const text = App.fmt.num(value);
    el.setAttribute('aria-label', text);
    el.setAttribute('role', 'img');
    const chars = [...text];
    // 結構不同（位數改變）才重建，否則只轉動每一位
    if (!el._odo || el._odo.length !== chars.length) {
      el.classList.add('odo');
      el.innerHTML = chars.map((ch, i) => (/\d/.test(ch)
        ? `<span class="odo__d" aria-hidden="true"><span class="odo__strip" style="--i:${i}">${'01234567890123456789'.split('').map(d => `<span>${d}</span>`).join('')}</span></span>`
        : `<span class="odo__sep" aria-hidden="true">${ch}</span>`)).join('');
      el._odo = chars;
      // 先讓瀏覽器畫出 0 的位置，下一格再轉，才會有滾動過程。
      // roll 讀的是「轉的當下」的 el._odo：兩格之內若又被呼叫（甚至位數又變、結構重建），不會拿舊值套到新結構上
      requestAnimationFrame(() => requestAnimationFrame(() => roll(el)));
      return;
    }
    el._odo = chars;
    roll(el);
  };
  function roll(el) {
    const strips = $$('.odo__strip', el);
    let k = 0;
    el._odo.forEach(ch => {
      if (!/\d/.test(ch)) return;
      // 轉到第二輪的數字（10–19），初次會滾過一整圈
      strips[k].style.transform = `translateY(${-(10 + Number(ch)) * 5}%)`;
      k += 1;
    });
  }

  function countUp(el) {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || '';
    const fmt = v => v.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (App.reducedMotion) {
      el.textContent = fmt(target);
      return;
    }
    const t0 = performance.now();
    const dur = 1400;
    const step = now => {
      const p = clamp((now - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     11. 招牌動態引擎：套印漂移（drift）＋ 半調脈動（pulse）
         一個共用的 rAF 迴圈，只在有事發生（滑鼠移動、捲動）時跑，停下就休眠
     ------------------------------------------------------------------ */
  const drift = new Map();          // el → { depth }
  const driftVisible = new Set();
  const pulseVisible = new Set();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let frameReq = 0;
  let scrollDirty = true;

  const visIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const set = entry.target.hasAttribute('data-drift') ? driftVisible : pulseVisible;
      if (entry.isIntersecting) set.add(entry.target);
      else set.delete(entry.target);
    });
    scrollDirty = true;
    requestFrame();
  }, { rootMargin: '120px 0px' });

  function requestFrame() {
    if (!frameReq && !document.hidden && !App.reducedMotion) frameReq = requestAnimationFrame(frame);
  }

  function frame() {
    frameReq = 0;
    pointer.x += (pointer.tx - pointer.x) * 0.075;
    pointer.y += (pointer.ty - pointer.y) * 0.075;
    const moving = Math.abs(pointer.tx - pointer.x) > 0.002 || Math.abs(pointer.ty - pointer.y) > 0.002;
    const vh = innerHeight;

    // 先讀後寫，避免強制同步版面
    const reads = [];
    driftVisible.forEach(el => reads.push([el, el.parentElement.getBoundingClientRect()]));
    reads.forEach(([el, r]) => {
      const { depth } = drift.get(el);
      // p：元素中心相對視窗中心的位置（-1 上方 … 1 下方），捲動時各版以不同速度移動
      const p = clamp((r.top + r.height / 2 - vh / 2) / vh, -1.2, 1.2);
      const x = pointer.x * 14 * depth;
      const y = pointer.y * 9 * depth + p * 30 * depth;
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
    });

    if (scrollDirty) {
      const sy = scrollY;
      let i = 0;
      pulseVisible.forEach(el => {
        el.style.setProperty('--pulse', (1 + 0.42 * Math.sin(sy / 115 + i * 1.7)).toFixed(3));
        i += 1;
      });
      scrollDirty = false;
    }
    if (moving) requestFrame();
  }

  addEventListener('pointermove', e => {
    if (!finePointer.matches || e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
    requestFrame();
  }, { passive: true });
  addEventListener('scroll', () => {
    scrollDirty = true;
    requestFrame();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frameReq) {
      cancelAnimationFrame(frameReq);
      frameReq = 0;
    } else requestFrame();
  });

  App.animate = (el, fn) => {
    let visible = false;
    let raf = 0;
    let last = 0;
    let stopped = false;
    const loop = t => {
      const dt = last ? Math.min(t - last, 64) : 16;
      last = t;
      fn(t, dt);
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      const run = visible && !stopped && !document.hidden && !App.reducedMotion;
      if (run && !raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    motionQuery.addEventListener('change', sync);
    return () => {
      stopped = true;
      sync();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
    };
  };

  App.ink = () => {
    const cs = getComputedStyle(document.documentElement);
    const get = name => cs.getPropertyValue(`--${name}`).trim();
    return {
      pink: get('pink'), blue: get('blue'), yellow: get('yellow'), ink: get('ink'),
      paper: get('paper'), paperHi: get('paper-hi'), pinkText: get('pink-text'), blueText: get('blue-text'),
      violet: get('violet'), tomato: get('tomato'), green: get('green'),
    };
  };

  /* ------------------------------------------------------------------
     12. 跑馬燈與倒數
     ------------------------------------------------------------------ */
  function initMarquee(el) {
    if (el.dataset.marqueeReady) return;
    el.dataset.marqueeReady = '1';
    const track = el.querySelector('.marquee__track');
    const items = [...track.children];
    const one = track.scrollWidth;
    // 半條軌道要比容器寬，translateX(-50%) 才能無縫接回
    // 多留 240px 餘裕：字型載入後寬度可能略縮
    const reps = Math.max(1, Math.ceil(((el.clientWidth || innerWidth) + 240) / Math.max(one, 1)));
    for (let r = 1; r < reps * 2; r++) {
      items.forEach(n => {
        const c = n.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        track.append(c);
      });
    }
    const speed = Number(el.dataset.speed || 60);
    el.style.setProperty('--marquee-dur', `${(track.scrollWidth / 2 / speed).toFixed(1)}s`);
    new IntersectionObserver(([entry]) => el.classList.toggle('is-paused', !entry.isIntersecting)).observe(el);
  }

  App.countdown = (el, iso) => {
    const target = new Date(iso);
    const flash = App.ink().pink;
    const units = { d: el.querySelector('[data-unit="d"]'), h: el.querySelector('[data-unit="h"]'), m: el.querySelector('[data-unit="m"]'), s: el.querySelector('[data-unit="s"]') };
    const tick = () => {
      const diff = Math.max(0, target - App.now());
      const values = {
        d: Math.floor(diff / 864e5),
        h: Math.floor(diff / 36e5) % 24,
        m: Math.floor(diff / 6e4) % 60,
        s: Math.floor(diff / 1e3) % 60,
      };
      Object.entries(values).forEach(([k, v]) => {
        const node = units[k];
        const text = pad(v);
        if (!node || node.textContent === text) return;
        node.textContent = text;
        if (!App.reducedMotion && el.dataset.cdReady) {
          node.animate(
            [{ transform: 'translate(4px,-40%)', opacity: 0, color: flash }, { transform: 'none', opacity: 1 }],
            { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' },
          );
        }
      });
      el.dataset.cdReady = '1';
    };
    tick();
    setInterval(tick, 1000);
  };

  /* ------------------------------------------------------------------
     13. scan：初始化 root 內所有 data-* 元件（可重複呼叫）
     ------------------------------------------------------------------ */
  App.scan = (root = document) => {
    const all = sel => (root instanceof Element && root.matches(sel) ? [root] : []).concat($$(sel, root));

    all('[data-portrait]').forEach(el => {
      if (el.dataset.artReady) return;
      el.dataset.artReady = '1';
      el.innerHTML = App.art.portrait(el.dataset.portrait);
    });
    all('[data-barcode]').forEach(el => {
      if (el.dataset.artReady) return;
      el.dataset.artReady = '1';
      el.innerHTML = App.art.barcode(el.dataset.barcode);
    });
    all('[data-art="cat"]').forEach(el => {
      if (el.dataset.artReady) return;
      el.dataset.artReady = '1';
      el.innerHTML = App.art.cat();
    });

    all('[data-reveal], .scribble, [data-odometer], [data-count]').forEach(registerReveal);
    all('[data-drift]').forEach(el => {
      if (drift.has(el)) return;
      drift.set(el, { depth: Number(el.dataset.drift) || 1 });
      if (!App.reducedMotion) visIO.observe(el);
    });
    all('[data-pulse]').forEach(el => {
      if (el.dataset.pulseReady) return;
      el.dataset.pulseReady = '1';
      if (!App.reducedMotion) visIO.observe(el);
    });
    all('[data-marquee]').forEach(initMarquee);
    all('[data-tabs]').forEach(App.tabs);
    all('[data-segmented]').forEach(App.segmented);
    all('[data-stepper]').forEach(App.stepper);
    all('[data-countdown]').forEach(el => {
      if (el.dataset.cdInit) return;
      el.dataset.cdInit = '1';
      App.countdown(el, el.dataset.countdown);
    });
  };

  /* ------------------------------------------------------------------
     14. 啟動
     ------------------------------------------------------------------ */
  injectDefs();
  initHeader();
  // 先把視窗內的進場元素標成 .is-in，再加 .js，避免首屏閃爍
  App.scan(document);
  document.documentElement.classList.add('js');
  requestFrame();
})();
