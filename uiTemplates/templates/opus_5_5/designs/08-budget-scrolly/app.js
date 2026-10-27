/* ==========================================================================
   澄港市 · 你的稅金去哪裡？2027 年度總預算 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入；所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面 </body> 前的 inline <script> 會比 defer 的 app.js「先」執行，
     所以頁面程式一律包在 document.addEventListener('DOMContentLoaded', () => { ... }) 裡；
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒。
     頁面用 innerHTML 動態插入的內容，插完呼叫 App.scan(容器) 讓 data-* 元件生效（重複呼叫安全）。

   資料（全站單一來源；金額單位一律「百萬元」，顯示時用 App.fmt.yi() 轉成「億」）
     App.data.meta           年度、送議會日、人口、資料來源…
     App.data.categories     六大政事別（固定順序 edu wel trn pol hea oth），每筆：
                               { key, name, short, color, ink, blurb, amount, prev, change, changePct,
                                 share, per1000, agencies:[{ key, name, amount, prev, programs:[...] }] }
                             program：{ id, name, amount, prev, desc, cat, agency }（prev 為 0 代表新興計畫）
     App.data.total / App.data.prevTotal     歲出總額（186,200 / 178,130 百萬）
     App.data.nature         各政事別經濟性質 { edu:{ personnel, operating, capital }, ... }（百萬）
     App.data.history        2018–2027 各政事別歲出（億元，1 位小數）{ years:[...], edu:[...], ..., total:[...] }
     App.data.welfareParts   社福拆解十年序列（億元）{ years, series:[{ key, name, values }] }，加總＝history.wel
     App.data.demographics   { years, elderlyShare(%), births, population }
     App.data.revenue        歲入結構與差短財源 { total, items:[{ name, amount, items? }], financing }
     App.data.units          等值換算物件 [{ key, cat, name, unit, cost(元/單位), note }]
     App.cat(key) / App.agency(key) / App.program(id) / App.programs()（扁平陣列，共 101 項、25 個機關）
                             計畫 id ＝「機關 key-兩位序號」，例如 social-02（兒少福利與育兒津貼）、metro-01（捷運環狀線第二期）
                             跨頁深連結慣例：explorer.html#program=<id>（首頁「三個值得追的數字」已使用）
     App.data.meta.today     '2026-10-23'：本站的「現在」與資料更新日
     App.CAT_KEYS            ['edu','wel','trn','pol','hea','oth']

   格式（App.fmt）
     num(1862.04, 1) → "1,862.0"     yi(59240) → "592.4 億"     yi(59240, 0) → "592 億"
     yiNum(59240) → "592.4"          money(69131) → "69,131 元"  pct(.318) → "31.8%"
     signedPct(.0453) → "+4.5%"、負數用真正的減號 "−4.1%"       signed(-11.1, 1) → "−11.1"
     deltaHTML(amount, prev) → <span class="delta delta--up">9.1%</span>（prev 為 0 時輸出「新增」）
     App.esc(str) HTML 跳脫     App.clamp(v, min, max)

   UI
     App.scan(root)      讓 root 內的 data-* 元件生效（載入時已對 document 執行一次）
     svg[data-art="thousand|treemap|receipt|trend"]  導流卡縮圖，四頁共用同一份繪圖（見 NEXT_ART）
     App.toast(msg, { title, cat:'edu'|…, timeout })   modal 開著時自動搬進 dialog（top layer）內顯示
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="id"] 開啟、[data-modal-close] 關閉；點背景或 Esc 關閉；觸發 'modalopen' / 'close'
     App.tooltip.show(html, clientX, clientY) / App.tooltip.hide()
     App.field.setError(input, msg) / App.field.clear(formOrInput)
     [data-tabs]         分頁籤；切換時 tablist 觸發 'tabchange'（detail: { tab, panel, index }）
     [data-segmented]    分段切換；觸發 'segchange'（detail: { value, button }），按鈕用 data-value
     [data-stepper]      ± 數量；改值時 input 觸發 'input' 與 'change'
     input.range         自動同步 --fill
     table[data-sortable] 表頭 <button class="sort-btn" data-type="num|text">；儲存格可用 data-value 指定排序值；
                         排序後 table 觸發 'sortchange'
     [data-bind="key"]   填入資料：total totalRound prevTotal growth growthAmount population perCapita
                         programCount agencyCount revenue deficit，或 cat.<key>.<per1000|amount|prev|share|changePct|name|short>
     [data-count="318"]  進入視窗時從 0 滾到目標（data-decimals、data-format="yi" 選填）
     App.countTo(el, value, { from, duration, decimals, format })  滾動計數；連續呼叫會從目前值接續，執行當下讀最新目標
     [data-reveal]       進場："" | up | left | fade | scale；style="--rd:120ms" 錯開；初次已在視窗內的直接顯示

   動態與視覺化
     App.reducedMotion   是否要求減少動態（getter）
     a[href="#id"]       頁內錨點自動平滑捲動（考慮 sticky 頁首），目標加 .is-target 並取得焦點
     .live-dot / .scroll-cue / [data-loop]  無限循環 CSS 動畫，離開視窗時自動加 .is-paused
     App.animate(el, fn) 只在 el 可見、分頁可見、未要求減少動態時每格呼叫 fn(now, dt)；回傳 stop()
     App.scroller(steps, { offset:.55, onStep(index, el, dir) })  scrollytelling 段落觸發；回傳 { index, refresh(), destroy() }
       offset 為觸發線在視窗中的高度比例，也可傳函式（例如手機 .74、桌機 .58）；段落頂端越過觸發線即切換
     new App.DotField(canvas, { count, duration, stagger, seed })  招牌點陣引擎（canvas）：
       .to(targets, { duration, stagger, delay(i, t) → 0~1 })  targets[i] = { x, y, r, color:'#hex', alpha, hollow:0~1 }
       .jump(targets)  .setEmphasis(fn(i) → 0~1 | null)  .setIdle(px)  .resize()  .hit(x, y) → index | -1
       .onresize = fn(w, h)  尺寸改變時呼叫（請在裡面重新算版面並 jump）；整頁截圖或列印時會短暫收到 0 高，
                       w 或 h 太小時請直接 return，等尺寸恢復會再呼叫一次
       畫布離開視窗或分頁隱藏時自動暫停；減少動態時 to() 直接跳到終態、idle 關閉
     App.layouts.scatter / clusters / donut / treemap / bars / waffle   點陣版面（純函式，回傳點座標與標籤錨點）
       scatter(n, box)              → { points, s }
       clusters(groups, box)        → { points, s, centers:[{ key, cx, cy, R }] }      groups = [{ key, n }]
       donut(groups, box, { rOut }) → { points, s, cx, cy, rIn, rOut, sectors:[{ key, a0, a1, mid }] }
       treemap(groups, box, { header, bias }) → { points, s, rects:[{ key, n, x, y, w, h }] }
       bars(columns, box, { continuous }) → { points, s, m, cols:[{ key, x, x0, w, top, base, segments }] }
       waffle(groups, box, { cols, rows, order:'col'|'row' }) → { points, s, frame, bands }
       box = { x, y, w, h }（canvas CSS 像素）；points 依 groups 順序攤平，與點的索引一一對應
     App.squarify(items, { x, y, w, h }, d => d.value) → [{ item, x, y, w, h }]   squarified treemap（探索器可直接用）
     App.sparkline(values, { width, height, color, area, dot, min, max, highlight }) → SVG 字串
     App.largestRemainder(values, total) → 整數陣列（最大餘數法，總和恰為 total）
     App.rng(seed) → 可重現的亂數函式     App.rgb('#hex') → [r,g,b]     App.mix(hexA, hexB, t) → '#hex'
     App.catColor(key) / App.catInk(key)  資料色與 text-safe 色
   ========================================================================== */
(function () {
  'use strict';

  const App = {};
  window.App = App;

  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  Object.defineProperty(App, 'reducedMotion', { get: () => motionQuery.matches });

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  App.clamp = clamp;


  /* ========================================================================
     1. 資料
     金額單位：百萬元。program 欄位 [名稱, 2027 預算案, 2026 法定預算, 說明]
     ======================================================================== */
  const CAT_DEFS = [
    {
      key: 'edu', name: '教育科學文化', short: '教育', color: '#2F6BFF', ink: '#1F55E0',
      blurb: '國中小與高中職、幼兒園、圖書館、體育與市立大學',
      agencies: [
        { key: 'doe', name: '教育局', programs: [
          ['國中小教職員人事費', 26420, 25710, '全市 214 所國中小、約 1.9 萬名教職員的薪資、保險與加班費'],
          ['高中職教育經費', 6180, 5960, '23 所市立高中職的人事與營運，含技職實作設備'],
          ['學前教育與公共化幼兒園', 4350, 3870, '新增 46 班公共化幼兒園，2 歲以上就學補助'],
          ['國中小營養午餐', 2960, 2640, '國中小午餐全面免費第二年，含食材價格調整'],
          ['校舍耐震補強與新建', 3870, 4260, '31 棟老舊校舍補強；北岸國中新校舍進入第二期'],
          ['特殊教育與融合支持', 1760, 1610, '特教助理員、巡迴輔導與無障礙校園改善'],
          ['數位學習與教室設備', 1340, 1480, '學習載具汰換與校園網路；前一年度採購高峰已過'],
          ['教育行政與其他', 2980, 2940, '教育局本部、學生輔導中心與家長會業務'],
        ] },
        { key: 'culture', name: '文化局', programs: [
          ['市立圖書館營運與分館', 1280, 1190, '總館與 27 間分館營運；溪洲分館遷建開工'],
          ['藝文團隊與展演補助', 860, 840, '在地劇團、樂團與獨立書店的年度補助'],
          ['文化資產與古蹟修復', 1140, 1020, '舊城區糖業倉庫群與鹽田百年鹽場修復'],
          ['港埕藝術季', 310, 290, '每年 11 月於港埕碼頭舉辦的城市藝術季'],
          ['文化行政', 530, 520, '文化局本部與藝文中心場館管理'],
        ] },
        { key: 'sports', name: '體育局', programs: [
          ['國民運動中心營運', 720, 690, '8 座國民運動中心的委外營運與設備更新'],
          ['雲嶺區綜合體育園區興建', 980, 360, '含 5,000 席室內球館，預計 2028 年完工'],
          ['全民運動與賽會', 460, 520, '城市馬拉松與市長盃；前一年度主辦全國運動會'],
          ['基層運動選手培訓', 250, 240, '學校代表隊與重點運動項目培訓'],
        ] },
        { key: 'univ', name: '澄港市立大學', programs: [
          ['教學與研究', 1690, 1640, '教師人事、研究計畫配合款與教學設備'],
          ['鹽田校區第二期工程', 760, 940, '教學大樓與學生宿舍，預計 2027 年底完工'],
          ['學生助學與獎學金', 400, 380, '弱勢助學、學雜費減免與研究生獎學金'],
        ] },
      ],
    },
    {
      key: 'wel', name: '社會福利', short: '社福', color: '#FF6B4A', ink: '#BF3D24',
      blurb: '長期照顧、育兒津貼與托育、社會住宅、老人與身障福利',
      agencies: [
        { key: 'social', name: '社會局', programs: [
          ['敬老津貼與老人福利', 4620, 4410, '65 歲以上市民敬老津貼、老人健保自付額補助'],
          ['兒少福利與育兒津貼', 6480, 5690, '0–6 歲育兒津貼每月 5,000 元，第三胎加碼'],
          ['托育公共化與準公共托育', 2950, 2610, '公共托嬰中心增至 58 處，準公共保母補助'],
          ['身心障礙者福利', 3410, 3300, '生活補助、個人助理與日間作業設施'],
          ['社會救助與急難紓困', 2130, 2090, '低收入與中低收入戶生活扶助、急難救助'],
          ['全民健保與國民年金補助', 3060, 2990, '依法由市府負擔的健保費與國保保費補助'],
          ['保護服務與家暴防治', 710, 680, '家暴、兒少保護個案處遇與 24 小時通報'],
          ['社工人力與行政', 500, 490, '社會局本部與 8 區社會福利服務中心'],
        ] },
        { key: 'ltc', name: '長期照顧服務處', programs: [
          ['居家與社區照顧服務', 5210, 4720, '居家服務、喘息與交通接送，服務約 4.1 萬人'],
          ['日間照顧中心擴建', 1860, 1330, '新增 12 處日照中心，目標一國中學區一日照'],
          ['失智照護與家庭支持', 1280, 1140, '失智共照中心、社區據點與家庭照顧者支持'],
          ['機構住宿式照顧補助', 1940, 2010, '住宿機構住民補助；資源逐步轉向社區照顧'],
          ['輔具與無障礙居家改善', 650, 620, '輔具租借與購置補助、居家無障礙修繕'],
        ] },
        { key: 'housing', name: '住宅發展處', programs: [
          ['社會住宅興建', 4870, 4190, '新灣、北岸兩處基地共 2,860 戶社宅工程'],
          ['租金補貼', 1620, 1410, '中央與市府合辦租金補貼，約 6.7 萬戶受惠'],
          ['社宅營運管理', 830, 740, '已完工 14 處社宅的物業管理與修繕'],
        ] },
        { key: 'labor', name: '勞動局', programs: [
          ['就業服務與職業訓練', 1240, 1260, '就業服務站、失業者職訓與中高齡再就業'],
          ['勞工福利與托兒', 560, 520, '勞工育兒補助、企業托兒與勞工休閒'],
          ['勞動檢查與職安', 410, 390, '營造業與高風險行業的勞動與職安檢查'],
          ['身障就業促進', 360, 370, '支持性就業與庇護工場'],
        ] },
      ],
    },
    {
      key: 'trn', name: '交通及經濟建設', short: '交通建設', color: '#12A37F', ink: '#0B7A5E',
      blurb: '捷運與輕軌、道路與人行道、公車補貼、排水與產業園區',
      agencies: [
        { key: 'traffic', name: '交通局', programs: [
          ['公車營運虧損補貼', 2870, 2640, '142 條市區公車路線中偏遠與虧損路線的補貼'],
          ['智慧號誌與路口改善', 640, 580, '380 處路口號誌連網與行人友善改善'],
          ['停車場興建與管理', 720, 860, '公有停車場委外管理；前一年度兩座立體停車場完工'],
          ['自行車道與共享單車', 470, 430, '自行車道串連與公共自行車站點補助'],
          ['交通行政', 310, 300, '交通局本部與交通事件裁決'],
        ] },
        { key: 'metro', name: '捷運工程局', programs: [
          ['捷運環狀線第二期', 5480, 6870, '市府自籌款；土建高峰已過，進入機電階段'],
          ['港埕輕軌延伸段', 1960, 1210, '港埕站至鹽田的 6.2 公里延伸，預計 2029 年通車'],
          ['工程管理', 380, 370, '捷運工程局本部與工程監造'],
        ] },
        { key: 'works', name: '工務局', programs: [
          ['道路養護與刨鋪', 3120, 3350, '全市 1,840 公里市區道路的刨鋪與坑洞修補'],
          ['人行道與騎樓整平', 1460, 1180, '新增與改善 46 公里人行道、騎樓整平'],
          ['雨水下水道與排水', 1980, 2110, '山腳、溪洲易淹水區的雨水下水道與滯洪池'],
          ['橋梁耐震補強', 1140, 1450, '23 座橋梁耐震補強，溪洲大橋改建完工'],
          ['公園與路燈維護', 1280, 1230, '312 座公園與 14.6 萬盞路燈的維護與電費'],
          ['工務行政', 440, 510, '工務局本部、建築管理與公共工程品管'],
        ] },
        { key: 'econ', name: '經濟發展局', programs: [
          ['新灣科技園區開發', 1840, 2210, '第二期公共設施與招商；用地取得已大致完成'],
          ['中小企業與青年創業', 760, 720, '青創貸款利息補貼與創業基地'],
          ['市場與商圈活化', 690, 650, '公有市場改建與 9 處商圈輔導'],
          ['觀光行銷與節慶', 530, 510, '港埕夜市、雲嶺山城等觀光行銷'],
        ] },
      ],
    },
    {
      key: 'pol', name: '警政消防', short: '警消', color: '#F2B705', ink: '#8A6400',
      blurb: '警察與消防人力、監視器與救護車、防災整備',
      agencies: [
        { key: 'police', name: '警察局', programs: [
          ['警察人事費', 7320, 6980, '約 8,600 名警察的薪資、保險與超勤加班費'],
          ['治安科技與監錄系統', 820, 760, '1.2 萬支路口監視器的維運與汰換'],
          ['交通執法與事故處理', 960, 930, '交通疏導、科技執法與事故處理'],
          ['警用裝備與車輛', 690, 640, '巡邏車、機車與防彈裝備汰換'],
          ['婦幼與少年警察', 280, 270, '婦幼安全、少年輔導與詐騙防制宣導'],
          ['警政行政', 410, 400, '警察局本部與 8 個分局的行政運作'],
        ] },
        { key: 'fire', name: '消防局', programs: [
          ['消防人事費', 3710, 3520, '約 2,900 名消防與救護人員的薪資與超勤費'],
          ['救護車與救災車輛汰換', 720, 610, '汰換 18 輛救護車與 6 輛雲梯車'],
          ['消防分隊廳舍新建', 590, 470, '雲嶺、溪洲兩座消防分隊新建'],
          ['緊急醫療救護', 380, 360, '救護耗材、高級救護員訓練與 119 派遣'],
          ['防災教育與住警器', 240, 230, '住宅用火災警報器補助與防災教育館'],
        ] },
        { key: 'disaster', name: '災害防救辦公室', programs: [
          ['防災整備與避難收容', 380, 430, '避難收容處所整備與防災物資儲備'],
          ['災害應變中心', 260, 290, '應變中心系統維運；前一年度完成系統更新'],
        ] },
      ],
    },
    {
      key: 'hea', name: '衛生及環境保護', short: '衛生環保', color: '#9B5DE5', ink: '#7A3FC4',
      blurb: '市立醫院、疫苗與防疫、垃圾清運與焚化、空氣品質',
      agencies: [
        { key: 'health', name: '衛生局', programs: [
          ['市立醫院營運補助', 2140, 2060, '市立聯合醫院 4 個院區的公衛與急重症補助'],
          ['預防接種與疾病防治', 1180, 1150, '公費疫苗、傳染病監測與結核病防治'],
          ['社區心理健康', 520, 410, '心理諮商補助擴大至 15–45 歲，自殺防治'],
          ['食品藥物安全', 430, 420, '市場與餐飲抽驗、食安稽查'],
          ['健康促進與癌症篩檢', 680, 640, '四癌篩檢、戒菸與高齡健康促進'],
          ['衛生所與公衛行政', 870, 850, '8 區衛生所與衛生局本部'],
        ] },
        { key: 'env', name: '環境保護局', programs: [
          ['垃圾清運與資源回收', 3860, 3710, '每日約 2,350 噸垃圾清運與資源回收'],
          ['焚化廠營運與更新', 1640, 1450, '鹽田焚化廠延役更新工程'],
          ['空氣品質維護', 620, 640, '空品監測、電動機車補助與工地揚塵稽查'],
          ['河川與海岸清潔', 480, 450, '溪洲溪與港埕海岸的清淤與淨灘'],
          ['環保行政', 640, 630, '環保局本部與 8 區清潔隊行政'],
        ] },
        { key: 'animal', name: '動物保護處', programs: [
          ['收容所營運', 210, 200, '2 處動物之家營運與醫療'],
          ['絕育與認養推廣', 150, 130, '犬貓絕育補助與認養活動'],
        ] },
        { key: 'funeral', name: '殯葬管理處', programs: [
          ['第二殯儀館改建', 480, 330, '北岸第二殯儀館改建，預計 2028 年啟用'],
          ['公墓與納骨設施', 250, 250, '公墓遷葬與納骨堂維護'],
        ] },
      ],
    },
    {
      key: 'oth', name: '一般政務及其他', short: '其他', color: '#8A8F98', ink: '#5F636B',
      blurb: '退休撫卹、公債利息、區公所與議會、預備金',
      agencies: [
        { key: 'personnel', name: '人事處', programs: [
          ['公務人員退休撫卹', 8920, 8460, '市府與學校退休人員月退休金、撫卹金'],
          ['員工福利與訓練', 920, 890, '員工文康、訓練與健康檢查'],
        ] },
        { key: 'finance', name: '財政局', programs: [
          ['公債付息', 2310, 2050, '長期債務約 1,320 億元的利息支出'],
          ['稅務與財產管理', 1150, 1120, '稅捐稽徵處與市有財產管理'],
        ] },
        { key: 'civil', name: '民政局', programs: [
          ['八區區公所營運', 3240, 3150, '港埕、北岸等 8 區區公所人事與業務'],
          ['戶政與役政', 980, 950, '戶政事務所與兵役行政'],
          ['里鄰建設與宗教禮俗', 640, 610, '里辦公處、里鄰小型工程與宗教禮俗'],
        ] },
        { key: 'council', name: '市議會', programs: [
          ['議員研究費與助理', 740, 720, '64 席議員研究費與公費助理'],
          ['議事運作', 440, 430, '議事、法制與議會行政'],
        ] },
        { key: 'admin', name: '秘書處等行政機關', programs: [
          ['秘書與資訊行政', 1410, 1380, '市府秘書處、資訊中心與公共關係'],
          ['法務與消費者保護', 380, 370, '國家賠償、法律扶助與消費爭議調解'],
          ['研考與數位治理', 760, 640, '1999 市民熱線、開放資料與數位服務'],
          ['地政與測量', 770, 760, '地政事務所、土地測量與地籍管理'],
        ] },
        { key: 'reserve', name: '統籌支撥科目', programs: [
          ['第二預備金', 1800, 1600, '年度中無法預見的支出，動支須送議會備查'],
          ['災害準備金', 830, 550, '颱風、豪雨等災後復建的準備款'],
        ] },
      ],
    },
  ];

  const HISTORY_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];

  const data = {
    meta: {
      city: '澄港市',
      fiscalYear: 2027,
      prevYear: 2026,
      today: '2026-10-23',      // 本站資料更新日（故事裡的「現在」）
      submitted: '2026-08-31',      // 市府將預算案送市議會
      expectedVote: '2026-12-18',   // 議會預計三讀
      population: 2693418,          // 2026 年 9 月底
      households: 1082560,
      unit: '百萬元',
      source: '澄港市政府主計處《2027 年度澄港市地方總預算案》',
      historySource: '2018–2026 年度為法定預算，2027 年度為預算案',
    },
    nature: {
      edu: { personnel: 36730, operating: 17180, capital: 5330 },
      wel: { personnel: 3580, operating: 34850, capital: 6260 },
      trn: { personnel: 2350, operating: 7820, capital: 15900 },
      pol: { personnel: 12400, operating: 3020, capital: 1340 },
      hea: { personnel: 3110, operating: 9200, capital: 1840 },
      oth: { personnel: 13150, operating: 11630, capital: 510 },
    },
    natureLabels: { personnel: '人事費', operating: '業務與補助', capital: '資本支出' },
    history: {
      years: HISTORY_YEARS,
      edu: [498.2, 506.3, 515.0, 524.6, 533.9, 541.7, 552.4, 560.8, 571.0, 592.4],
      wel: [223.4, 236.8, 251.9, 274.5, 296.2, 318.4, 343.7, 372.5, 409.6, 446.9],
      trn: [262.1, 268.5, 276.4, 289.7, 284.6, 281.3, 276.5, 274.0, 271.8, 260.7],
      pol: [128.4, 131.0, 134.7, 138.2, 142.0, 146.1, 150.3, 154.6, 158.9, 167.6],
      hea: [104.6, 107.2, 112.8, 121.3, 124.9, 125.8, 127.6, 130.1, 133.2, 141.5],
      oth: [235.9, 239.1, 240.9, 242.1, 246.4, 254.2, 251.8, 246.6, 236.8, 252.9],
    },
    welfareParts: {
      years: HISTORY_YEARS,
      series: [
        { key: 'ltc', name: '長期照顧', values: [28.6, 33.1, 39.4, 47.2, 55.8, 64.9, 74.3, 85.6, 98.2, 109.4] },
        { key: 'child', name: '兒少福利與托育', values: [31.2, 33.0, 36.5, 41.8, 48.6, 55.1, 63.9, 72.4, 83.0, 94.3] },
        { key: 'housing', name: '社會住宅與租金補貼', values: [12.4, 15.8, 19.6, 25.3, 30.1, 36.8, 44.5, 52.9, 63.4, 73.2] },
        { key: 'elder', name: '老人與身障福利', values: [58.7, 60.4, 62.1, 64.8, 67.0, 69.5, 72.2, 74.6, 77.1, 80.3] },
        { key: 'insure', name: '健保與國保補助', values: [24.3, 24.9, 25.6, 26.4, 27.0, 27.8, 28.5, 29.2, 29.9, 30.6] },
        { key: 'other', name: '救助、保護與勞動', values: [68.2, 69.6, 68.7, 69.0, 67.7, 64.3, 60.3, 57.8, 58.0, 59.1] },
      ],
    },
    demographics: {
      years: HISTORY_YEARS,
      elderlyShare: [14.6, 15.2, 15.9, 16.7, 17.5, 18.3, 19.2, 20.1, 20.9, 21.7],   // 65 歲以上人口占比 %，2027 為推估
      births: [19840, 19120, 17960, 16730, 15980, 15210, 14630, 13870, 13250, 12900], // 2026、2027 為推估
      population: 2693418,
    },
    revenue: {
      total: 174150,
      items: [
        { name: '稅課收入', amount: 103480, items: [
          { name: '統籌分配稅款', amount: 41260 },
          { name: '土地增值稅', amount: 17250 },
          { name: '地價稅', amount: 11830 },
          { name: '房屋稅', amount: 9620 },
          { name: '使用牌照稅', amount: 5890 },
          { name: '契稅', amount: 2840 },
          { name: '印花稅', amount: 1460 },
          { name: '娛樂稅', amount: 310 },
          { name: '其他稅課（含菸酒稅分配）', amount: 13020 },
        ] },
        { name: '補助及協助收入', amount: 49860 },
        { name: '規費及罰款收入', amount: 6230 },
        { name: '財產收入', amount: 5870 },
        { name: '營業盈餘及事業收入', amount: 3190 },
        { name: '其他收入', amount: 5520 },
      ],
      // 歲出 186,200 − 歲入 174,150 ＝ 差短 12,050，以舉債與以前年度賸餘支應
      financing: { gap: 12050, borrowing: 9500, surplus: 2550 },
    },
    units: [
      { key: 'lunch', cat: 'edu', name: '營養午餐', unit: '份', cost: 72, note: '國中小午餐每份的食材與人力成本' },
      { key: 'book', cat: 'edu', name: '圖書館新書', unit: '本', cost: 380, note: '市立圖書館平均每冊採購價' },
      { key: 'care', cat: 'wel', name: '長照居家服務', unit: '小時', cost: 450, note: '居家照顧服務每小時給付' },
      { key: 'childcare', cat: 'wel', name: '育兒津貼', unit: '天', cost: 164, note: '每月 5,000 元換算為每日' },
      { key: 'sidewalk', cat: 'trn', name: '人行道', unit: '公尺', cost: 18000, note: '寬 2.5 公尺、含排水側溝，每公尺造價' },
      { key: 'bus', cat: 'trn', name: '公車行駛', unit: '公里', cost: 46, note: '虧損路線每車公里補貼' },
      { key: 'streetlight', cat: 'trn', name: '路燈點亮', unit: '盞·月', cost: 270, note: '電費與維護，每盞每年約 3,200 元' },
      { key: 'firefighter', cat: 'pol', name: '消防員執勤', unit: '小時', cost: 620, note: '含薪資、保險與裝備攤提' },
      { key: 'cctv', cat: 'pol', name: '路口監視器維運', unit: '天', cost: 26, note: '每支每年約 9,600 元' },
      { key: 'garbage', cat: 'hea', name: '垃圾清運', unit: '戶·月', cost: 210, note: '每戶每月清運與處理成本' },
      { key: 'vaccine', cat: 'hea', name: '公費疫苗', unit: '劑', cost: 320, note: '流感疫苗含接種處置費' },
      { key: 'office', cat: 'oth', name: '區公所櫃台服務', unit: '人次', cost: 95, note: '戶政、里政等臨櫃服務每人次成本' },
    ],
  };

  // ---- 由明細往上加總：政事別與機關金額一律算出來，不手打，確保全站一致 ----
  const programIndex = new Map();
  const agencyIndex = new Map();
  data.categories = CAT_DEFS.map(def => {
    const agencies = def.agencies.map(a => {
      const programs = a.programs.map(([name, amount, prev, desc], i) => {
        const p = { id: `${a.key}-${String(i + 1).padStart(2, '0')}`, name, amount, prev, desc, cat: def.key, agency: a.key };
        programIndex.set(p.id, p);
        return p;
      });
      const agency = {
        key: a.key, name: a.name, cat: def.key, programs,
        amount: sum(programs.map(p => p.amount)),
        prev: sum(programs.map(p => p.prev)),
      };
      agency.change = agency.amount - agency.prev;
      agency.changePct = agency.prev ? agency.change / agency.prev : null;
      agencyIndex.set(a.key, agency);
      return agency;
    });
    const cat = {
      key: def.key, name: def.name, short: def.short, color: def.color, ink: def.ink, blurb: def.blurb, agencies,
      amount: sum(agencies.map(a => a.amount)),
      prev: sum(agencies.map(a => a.prev)),
    };
    cat.change = cat.amount - cat.prev;
    cat.changePct = cat.change / cat.prev;
    return cat;
  });
  data.total = sum(data.categories.map(c => c.amount));
  data.prevTotal = sum(data.categories.map(c => c.prev));

  App.largestRemainder = function (values, total) {
    const s = sum(values);
    if (s <= 0) return values.map(() => 0);
    const raw = values.map(v => v / s * total);
    const out = raw.map(Math.floor);
    let left = total - sum(out);
    raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
      if (left > 0) { out[i] += 1; left -= 1; }
    });
    return out;
  };

  const per1000 = App.largestRemainder(data.categories.map(c => c.amount), 1000);
  data.categories.forEach((c, i) => {
    c.share = c.amount / data.total;
    c.per1000 = per1000[i];
  });
  data.history.total = HISTORY_YEARS.map((_, i) =>
    Math.round(sum(data.categories.map(c => data.history[c.key][i])) * 10) / 10);

  App.data = data;
  App.CAT_KEYS = data.categories.map(c => c.key);
  App.cat = key => data.categories.find(c => c.key === key);
  App.agency = key => agencyIndex.get(key);
  App.program = id => programIndex.get(id);
  App.programs = () => [...programIndex.values()];
  App.catColor = key => App.cat(key).color;
  App.catInk = key => App.cat(key).ink;


  /* ========================================================================
     2. 格式
     ======================================================================== */
  const nfCache = new Map();
  const nf = d => {
    if (!nfCache.has(d)) nfCache.set(d, new Intl.NumberFormat('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }));
    return nfCache.get(d);
  };
  const MINUS = '−';
  App.fmt = {
    num: (n, d = 0) => nf(d).format(n).replace('-', MINUS),
    yiNum: (m, d = 1) => nf(d).format(m / 100),
    yi: (m, d = 1) => `${nf(d).format(m / 100)} 億`,
    money: n => `${nf(0).format(Math.round(n))} 元`,
    pct: (x, d = 1) => `${nf(d).format(x * 100)}%`,
    signed: (n, d = 1) => (n > 0 ? '+' : n < 0 ? MINUS : '') + nf(d).format(Math.abs(n)),
    signedPct: (x, d = 1) => (x > 0 ? '+' : x < 0 ? MINUS : '') + nf(d).format(Math.abs(x * 100)) + '%',
    deltaClass: x => (x > 0.0005 ? 'up' : x < -0.0005 ? 'down' : 'flat'),
    deltaHTML(amount, prev, d = 1) {
      if (!prev) return '<span class="delta delta--new">新增</span>';
      const x = (amount - prev) / prev;
      const cls = App.fmt.deltaClass(x);
      const label = cls === 'up' ? '增加' : cls === 'down' ? '減少' : '持平';
      return `<span class="delta delta--${cls}"><span class="sr-only">${label}</span>${nf(d).format(Math.abs(x * 100))}%</span>`;
    },
  };
  App.esc = str => String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));


  /* ========================================================================
     3. 色彩與亂數
     ======================================================================== */
  const rgbCache = new Map();
  App.rgb = hex => {
    if (!rgbCache.has(hex)) {
      const h = hex.replace('#', '');
      rgbCache.set(hex, [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
    }
    return rgbCache.get(hex);
  };
  App.mix = (a, b, t) => {
    const A = App.rgb(a), B = App.rgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  // mulberry32：版面要可重現（每次重繪散佈圖都一樣），所以不用 Math.random
  App.rng = seed => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };


  /* ========================================================================
     4. 外殼：導覽、閱讀進度
     ======================================================================== */
  function initShell() {
    const masthead = document.querySelector('.masthead');
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');

    // 依目前檔名標示 active，避免各頁複製 header 時漏改
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.site-nav__link').forEach(a => {
      const target = (a.getAttribute('href') || '').split(/[?#]/)[0].toLowerCase();
      const on = target === here;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    if (masthead && toggle && nav) {
      const setOpen = open => {
        masthead.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.querySelector('.sr-only').textContent = open ? '關閉選單' : '開啟選單';
      };
      toggle.addEventListener('click', () => setOpen(!masthead.classList.contains('is-open')));
      nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && masthead.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
      });
      document.addEventListener('click', e => {
        if (masthead.classList.contains('is-open') && !masthead.contains(e.target)) setOpen(false);
      });
      matchMedia('(min-width: 900px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    }

    // 頁內錨點平滑捲動。不用 CSS scroll-behavior，因為它會讓所有程式化 scrollTo 也變成動畫；
    // pushState 不會更新 :target，所以另外加 .is-target 供樣式使用，並把焦點移到目標（鍵盤使用者接著往下讀）
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      history.pushState(null, '', '#' + id);
      document.querySelectorAll('.is-target').forEach(el => el.classList.remove('is-target'));
      target.classList.add('is-target');
      target.scrollIntoView({ behavior: App.reducedMotion ? 'auto' : 'smooth', block: 'start' });
      if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });

    // 無限循環的 CSS 動畫（含偽元素）離開視窗就暫停，回到視窗再繼續
    const loopObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-paused', !entry.isIntersecting));
    });
    document.querySelectorAll('.live-dot, .scroll-cue, [data-loop]').forEach(el => loopObserver.observe(el));

    const progressBars = document.querySelectorAll('.budget-rule--progress');
    if (progressBars.length) {
      let queued = false;
      const update = () => {
        queued = false;
        const max = document.documentElement.scrollHeight - innerHeight;
        const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
        progressBars.forEach(bar => bar.style.setProperty('--progress', p.toFixed(4)));
      };
      const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
      addEventListener('scroll', queue, { passive: true });
      addEventListener('resize', queue);
      update();
    }
  }


  /* ========================================================================
     5. Toast / Modal / Tooltip / 表單
     ======================================================================== */
  const toastRegion = document.createElement('div');
  toastRegion.className = 'toast-region';
  toastRegion.setAttribute('role', 'status');
  toastRegion.setAttribute('aria-live', 'polite');

  App.toast = function (msg, { title, cat, timeout = 3600 } = {}) {
    if (!toastRegion.isConnected) document.body.append(toastRegion);
    const el = document.createElement('div');
    el.className = 'toast' + (cat ? ` cat-${cat}` : '');
    el.innerHTML = `<div>${title ? `<strong class="toast__title">${App.esc(title)}</strong>` : ''}${App.esc(msg)}</div>`;
    toastRegion.append(el);
    // 最多同時 3 則，舊的先走
    while (toastRegion.children.length > 3) toastRegion.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    }, timeout);
    return el;
  };

  const openDialogs = [];
  const resolveDialog = target => (typeof target === 'string' ? document.getElementById(target) : target);
  // showModal 會把 dialog 放進 top layer，掛在 body 的 toast 會被蓋住，所以跟著搬進最上層的 dialog
  const parkToasts = () => {
    const host = openDialogs[openDialogs.length - 1] || document.body;
    if (toastRegion.parentElement !== host) host.append(toastRegion);
  };
  App.modal = {
    open(target) {
      const dlg = resolveDialog(target);
      if (!dlg || dlg.open) return dlg;
      dlg.showModal();
      openDialogs.push(dlg);
      parkToasts();
      dlg.dispatchEvent(new CustomEvent('modalopen'));
      return dlg;
    },
    close(target) {
      const dlg = target ? resolveDialog(target) : openDialogs[openDialogs.length - 1];
      if (dlg && dlg.open) dlg.close();
    },
  };
  function initDialog(dlg) {
    if (dlg.dataset.modalInit) return;
    dlg.dataset.modalInit = '1';
    dlg.addEventListener('close', () => {
      const i = openDialogs.indexOf(dlg);
      if (i > -1) openDialogs.splice(i, 1);
      parkToasts();
    });
    // 點到 dialog 本體外框（也就是背景）才關
    dlg.addEventListener('click', e => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) dlg.close();
    });
  }
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { e.preventDefault(); App.modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { e.preventDefault(); App.modal.close(closer.closest('dialog')); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openDialogs.length) { e.preventDefault(); App.modal.close(); }
  });

  let tipEl = null;
  App.tooltip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('aria-hidden', 'true');
        document.body.append(tipEl);
      }
      tipEl.innerHTML = html;
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let left = x + 16, top = y + 16;
      if (left + w > innerWidth - 8) left = x - w - 16;
      if (top + h > innerHeight - 8) top = y - h - 16;
      tipEl.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
      tipEl.classList.add('is-shown');
    },
    hide() { if (tipEl) tipEl.classList.remove('is-shown'); },
  };

  App.field = {
    setError(input, msg) {
      const field = input.closest('.field');
      input.setAttribute('aria-invalid', 'true');
      if (!field) return;
      field.classList.add('is-invalid');
      let err = field.querySelector('.field__error');
      if (!err) {
        err = document.createElement('p');
        err.className = 'field__error';
        field.append(err);
      }
      if (!err.id) err.id = (input.id || 'f' + Math.random().toString(36).slice(2, 8)) + '-error';
      err.textContent = msg;
      const ids = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      ids.add(err.id);
      input.setAttribute('aria-describedby', [...ids].join(' '));
    },
    clear(target) {
      const scope = target.matches && target.matches('input, select, textarea') ? [target] : target.querySelectorAll('input, select, textarea');
      scope.forEach(input => {
        input.removeAttribute('aria-invalid');
        const field = input.closest('.field');
        if (field) field.classList.remove('is-invalid');
      });
    },
  };


  /* ========================================================================
     6. 宣告式元件：tabs / segmented / stepper / range / sortable / bind / count / reveal
     ======================================================================== */
  function initTabs(list) {
    if (list.dataset.tabsInit) return;
    list.dataset.tabsInit = '1';
    list.setAttribute('role', 'tablist');
    const tabs = [...list.querySelectorAll('[role="tab"], .tab')];
    const select = (tab, focus) => {
      tabs.forEach((t, i) => {
        const on = t === tab;
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
        if (on) list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab: t, panel, index: i } }));
      });
      if (focus) tab.focus();
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
  }

  function initSegmented(group) {
    if (group.dataset.segInit) return;
    group.dataset.segInit = '1';
    group.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn || !group.contains(btn) || btn.getAttribute('aria-pressed') === 'true') return;
      group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      group.dispatchEvent(new CustomEvent('segchange', { detail: { value: btn.dataset.value, button: btn } }));
    });
  }

  function initStepper(el) {
    if (el.dataset.stepperInit) return;
    el.dataset.stepperInit = '1';
    const input = el.querySelector('input');
    const buttons = el.querySelectorAll('[data-step]');
    const min = input.min === '' ? -Infinity : +input.min;
    const max = input.max === '' ? Infinity : +input.max;
    const sync = () => buttons.forEach(b => {
      const dir = Math.sign(+b.dataset.step);
      b.disabled = (dir < 0 && +input.value <= min) || (dir > 0 && +input.value >= max);
    });
    buttons.forEach(b => b.addEventListener('click', () => {
      const step = +b.dataset.step * (+input.step || 1);
      input.value = clamp((+input.value || 0) + step, min, max);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    }));
    input.addEventListener('input', sync);
    sync();
  }

  function initRange(input) {
    if (input.dataset.rangeInit) return;
    input.dataset.rangeInit = '1';
    const sync = () => {
      const min = +input.min || 0, max = input.max === '' ? 100 : +input.max;
      input.style.setProperty('--fill', `${((+input.value - min) / (max - min || 1)) * 100}%`);
    };
    input.addEventListener('input', sync);
    sync();
  }

  function initSortable(table) {
    if (table.dataset.sortInit) return;
    table.dataset.sortInit = '1';
    const headers = [...table.tHead.rows[0].cells];
    headers.forEach((th, col) => {
      const btn = th.querySelector('.sort-btn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : 'descending';
        headers.forEach(h => { if (h.querySelector('.sort-btn')) h.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', dir);
        const isNum = btn.dataset.type === 'num';
        const val = row => {
          const cell = row.cells[col];
          const raw = cell.dataset.value ?? cell.textContent.trim();
          return isNum ? parseFloat(raw) : raw;
        };
        const tbody = table.tBodies[0];
        const rows = [...tbody.rows].sort((a, b) => {
          const va = val(a), vb = val(b);
          const c = isNum ? va - vb : String(va).localeCompare(String(vb), 'zh-Hant');
          return dir === 'ascending' ? c : -c;
        });
        tbody.append(...rows);
        table.dispatchEvent(new CustomEvent('sortchange', { detail: { column: col, direction: dir } }));
      });
    });
  }

  const BINDINGS = {
    total: () => App.fmt.yi(data.total),
    totalRound: () => App.fmt.yi(data.total, 0),
    prevTotal: () => App.fmt.yi(data.prevTotal),
    growth: () => App.fmt.signedPct((data.total - data.prevTotal) / data.prevTotal),
    growthAmount: () => App.fmt.yi(data.total - data.prevTotal),
    population: () => App.fmt.num(data.meta.population),
    perCapita: () => App.fmt.num(Math.round(data.total * 1e6 / data.meta.population)),
    programCount: () => String(programIndex.size),
    agencyCount: () => String(agencyIndex.size),
    revenue: () => App.fmt.yi(data.revenue.total),
    deficit: () => App.fmt.yi(data.revenue.financing.gap),
  };
  function resolveBinding(key) {
    if (BINDINGS[key]) return BINDINGS[key]();
    const m = key.match(/^cat\.(\w+)\.(\w+)$/);
    const cat = m && App.cat(m[1]);
    if (!cat) throw new Error(`Unknown data-bind key: ${key}`);
    switch (m[2]) {
      case 'per1000': return String(cat.per1000);
      case 'amount': return App.fmt.yi(cat.amount);
      case 'prev': return App.fmt.yi(cat.prev);
      case 'share': return App.fmt.pct(cat.share);
      case 'changePct': return App.fmt.signedPct(cat.changePct);
      case 'name': return cat.name;
      case 'short': return cat.short;
      default: throw new Error(`Unknown data-bind field: ${key}`);
    }
  }

  const COUNT_FORMATS = {
    yi: (v, d) => App.fmt.yiNum(v, d),
  };
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  App.countTo = function (el, value, opts = {}) {
    const decimals = opts.decimals ?? +(el.dataset.decimals || 0);
    const format = opts.format || (v => App.fmt.num(v, decimals));
    el._countTarget = value;
    el._countFormat = format;
    cancelAnimationFrame(el._countRaf);
    if (App.reducedMotion) {
      el._countValue = value;
      el.textContent = format(value);
      return;
    }
    const from = opts.from ?? el._countValue ?? 0;
    const duration = opts.duration ?? 1100;
    const start = performance.now();
    const step = now => {
      // 每一格都讀最新目標，連續快速呼叫時不會用到過期的值
      const target = el._countTarget;
      const t = Math.min(1, (now - start) / duration);
      const v = from + (target - from) * easeOutCubic(t);
      el._countValue = v;
      el.textContent = el._countFormat(t < 1 ? v : target);
      if (t < 1) el._countRaf = requestAnimationFrame(step);
      else el._countValue = target;
    };
    el._countRaf = requestAnimationFrame(step);
  };

  // reveal 與 count 共用一個觀察者；另有捲動保底，確保內容最終一定顯示
  const pending = new Set();
  const activate = el => {
    pending.delete(el);
    io.unobserve(el);
    if (el.hasAttribute('data-reveal')) el.classList.add('is-revealed');
    if (el.hasAttribute('data-count') && !el.dataset.counted) {
      el.dataset.counted = '1';
      const fmt = COUNT_FORMATS[el.dataset.format];
      const d = +(el.dataset.decimals || 0);
      App.countTo(el, +el.dataset.count, { from: 0, decimals: d, format: fmt ? v => fmt(v, d) : undefined });
    }
  };
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) activate(entry.target); });
  }, { rootMargin: '0px 0px -6% 0px' });
  let sweepQueued = false;
  const sweep = () => {
    sweepQueued = false;
    pending.forEach(el => { if (el.getBoundingClientRect().top < innerHeight) activate(el); });
  };
  addEventListener('scroll', () => { if (pending.size && !sweepQueued) { sweepQueued = true; requestAnimationFrame(sweep); } }, { passive: true });
  addEventListener('beforeprint', () => pending.forEach(activate));

  function initWatch(el) {
    if (el.dataset.watchInit) return;
    el.dataset.watchInit = '1';
    if (App.reducedMotion) {
      // HTML 裡寫的就是終值，直接保留
      el.classList.add('is-revealed');
      el.dataset.counted = '1';
      return;
    }
    document.documentElement.classList.add('has-reveal');
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) {
      // 初次載入已在視窗內：進場直接給終態（同一格加上 is-revealed，不會閃）；數字仍滾動
      activate(el);
      return;
    }
    if (el.hasAttribute('data-count')) {
      const d = +(el.dataset.decimals || 0);
      const fmt = COUNT_FORMATS[el.dataset.format];
      el.textContent = fmt ? fmt(0, d) : App.fmt.num(0, d);
    }
    pending.add(el);
    io.observe(el);
  }

  // 「繼續讀下去」導流卡縮圖（viewBox 0 0 320 168）：每頁都會連到另外三頁，同一張圖只在這裡畫一次
  const NEXT_ART = {
    // 首頁：1,000 個點依各政事別每 1,000 元直行排列
    thousand() {
      const ROWS = 20, PITCH = 5.1;
      let k = 0;
      return data.categories.map(c => {
        let dots = '';
        for (let i = 0; i < c.per1000; i++, k++) {
          dots += `<circle cx="${(35 + Math.floor(k / ROWS) * PITCH).toFixed(1)}" cy="${(30 + (k % ROWS) * PITCH).toFixed(1)}" r="1.95"/>`;
        }
        return `<g fill="${c.color}">${dots}</g>`;
      }).join('') + '<text class="axis-text" x="35" y="152" fill="#6B6862">1,000 個點 ＝ 你繳的 1,000 元</text>';
    },
    // 探索器：六大政事別方塊與放大鏡
    treemap: () => `<g stroke="#EFEADF" stroke-width="3">
        <rect x="24" y="24" width="86" height="120" fill="#2F6BFF"/>
        <rect x="110" y="24" width="65" height="120" fill="#FF6B4A"/>
        <rect x="175" y="24" width="61" height="75" fill="#12A37F"/>
        <rect x="236" y="24" width="60" height="75" fill="#8A8F98"/>
        <rect x="175" y="99" width="66" height="45" fill="#F2B705"/>
        <rect x="241" y="99" width="55" height="45" fill="#9B5DE5"/>
      </g>
      <path d="M111.5 82 H173.5 M146 82 V142.5 M111.5 116 H146" stroke="#EFEADF" stroke-width="1.5" fill="none"/>
      <circle cx="150" cy="66" r="25" fill="#F7F4EE" fill-opacity=".28" stroke="#1A1A1A" stroke-width="3"/>
      <path d="M168 84 L184 100" stroke="#1A1A1A" stroke-width="6" stroke-linecap="round"/>`,
    // 計算器：計算器預設條件（一年 30,000 元）的預算尺與換算物件
    receipt: () => `<text class="axis-text" x="24" y="24" fill="#6B6862">例：一年貢獻 30,000 元</text>
      <rect x="24" y="34" width="86.5" height="24" fill="#2F6BFF"/>
      <rect x="112.5" y="34" width="63.3" height="24" fill="#FF6B4A"/>
      <rect x="177.8" y="34" width="36.1" height="24" fill="#12A37F"/>
      <rect x="215.9" y="34" width="22.5" height="24" fill="#F2B705"/>
      <rect x="240.4" y="34" width="18.7" height="24" fill="#9B5DE5"/>
      <rect x="261.1" y="34" width="34.9" height="24" fill="#8A8F98"/>
      <path d="M67 62 V78" stroke="#1A1A1A" stroke-width="1.25"/>
      <g fill="none" stroke="#1F55E0" stroke-width="1.6">
        <rect x="24" y="86" width="16" height="12" rx="2.5"/><rect x="46" y="86" width="16" height="12" rx="2.5"/>
        <rect x="68" y="86" width="16" height="12" rx="2.5"/><rect x="90" y="86" width="16" height="12" rx="2.5"/>
        <rect x="112" y="86" width="16" height="12" rx="2.5"/><rect x="134" y="86" width="16" height="12" rx="2.5"/>
        <rect x="24" y="104" width="16" height="12" rx="2.5"/><rect x="46" y="104" width="16" height="12" rx="2.5"/>
        <rect x="68" y="104" width="16" height="12" rx="2.5"/><rect x="90" y="104" width="16" height="12" rx="2.5"/>
        <rect x="112" y="104" width="16" height="12" rx="2.5"/><rect x="134" y="104" width="16" height="12" rx="2.5"/>
      </g>
      <text class="annot-text" x="24" y="140" fill="#45433F">＝ 132 份營養午餐</text>
      <g fill="#12A37F"><rect x="184" y="92" width="112" height="8"/></g>
      <g stroke="#F7F4EE" stroke-width="1.5"><path d="M212 92 V100 M240 92 V100 M268 92 V100"/></g>
      <text class="annot-text" x="184" y="120" fill="#45433F">＋ 0.23 公尺人行道</text>`,
    // 專題：社福十年走勢與倍數
    trend: () => `<path d="M24 144 H296" stroke="#1A1A1A" stroke-width="1.25"/>
      <path d="M24 92 H296 M24 40 H296" stroke="#1A1A1A" stroke-opacity=".12" stroke-width="1"/>
      <path d="M24 134.2 L51.8 128.5 L79.6 122.2 L107.3 112.7 L135.1 103.6 L162.9 94.3 L190.7 83.6 L218.4 71.6 L246.2 56 L274 40.3 L274 144 L24 144 Z" fill="#FF6B4A" fill-opacity=".16"/>
      <polyline points="24,134.2 51.8,128.5 79.6,122.2 107.3,112.7 135.1,103.6 162.9,94.3 190.7,83.6 218.4,71.6 246.2,56 274,40.3" fill="none" stroke="#FF6B4A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="24" cy="134.2" r="4" fill="#F7F4EE" stroke="#FF6B4A" stroke-width="2.5"/>
      <circle cx="274" cy="40.3" r="5" fill="#FF6B4A"/>
      <text class="axis-text" x="24" y="160" fill="#6B6862">2018</text>
      <text class="axis-text" x="274" y="160" text-anchor="middle" fill="#6B6862">2027</text>
      <text x="258" y="36" text-anchor="end" fill="#BF3D24" font-family="IBM Plex Mono, monospace" font-size="22" font-weight="600">×2.0</text>`,
  };
  function drawArt(svg) {
    if (svg.childElementCount) return;
    const draw = NEXT_ART[svg.dataset.art];
    if (!draw) throw new Error(`Unknown data-art: ${svg.dataset.art}`);
    svg.innerHTML = draw();
  }

  App.scan = function (root = document) {
    root.querySelectorAll('svg[data-art]').forEach(drawArt);
    root.querySelectorAll('[data-tabs]').forEach(initTabs);
    root.querySelectorAll('[data-segmented]').forEach(initSegmented);
    root.querySelectorAll('[data-stepper]').forEach(initStepper);
    root.querySelectorAll('input.range').forEach(initRange);
    root.querySelectorAll('table[data-sortable]').forEach(initSortable);
    root.querySelectorAll('dialog').forEach(initDialog);
    root.querySelectorAll('[data-bind]').forEach(el => { el.textContent = resolveBinding(el.dataset.bind); });
    root.querySelectorAll('[data-reveal], [data-count]').forEach(initWatch);
  };


  /* ========================================================================
     7. 動態工具
     ======================================================================== */
  App.animate = function (el, fn) {
    let visible = false, raf = 0, last = 0, stopped = false;
    const loop = now => {
      raf = 0;
      if (stopped || !visible || document.hidden || App.reducedMotion) return;
      fn(now, last ? Math.min(64, now - last) : 16);
      last = now;
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && !stopped) { last = 0; raf = requestAnimationFrame(loop); } };
    const obs = new IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) kick();
    });
    obs.observe(el);
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      obs.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  };

  // scrollytelling：找出「頂端已越過視窗 offset 線」的最後一段；用捲動計算而非 IO，任何視窗高度都穩定
  App.scroller = function (steps, { offset = 0.55, onStep } = {}) {
    steps = [...steps];
    let current = -1, queued = false;
    const check = () => {
      queued = false;
      // offset 可為函式：手機與桌機的觸發線位置不同時，每次檢查都讀當下的值
      const line = innerHeight * (typeof offset === 'function' ? offset() : offset);
      let idx = 0;
      steps.forEach((el, i) => { if (el.getBoundingClientRect().top <= line) idx = i; });
      if (idx !== current) {
        const dir = idx > current ? 'down' : 'up';
        current = idx;
        steps.forEach((el, i) => el.classList.toggle('is-active', i === idx));
        if (onStep) onStep(idx, steps[idx], dir);
      }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    check();
    return {
      get index() { return current; },
      refresh: check,
      destroy() { removeEventListener('scroll', queue); removeEventListener('resize', queue); },
    };
  };


  /* ========================================================================
     8. 視覺化：squarify、sparkline、點陣版面
     ======================================================================== */
  App.squarify = function (items, rect, value = d => d.value) {
    const total = sum(items.map(value));
    const out = [];
    const nodes = items
      .map(item => ({ item, v: value(item) }))
      .filter(n => n.v > 0)
      .sort((a, b) => b.v - a.v);
    items.filter(item => !(value(item) > 0)).forEach(item => out.push({ item, x: rect.x, y: rect.y, w: 0, h: 0 }));
    if (!nodes.length || total <= 0) return out;
    const scale = (rect.w * rect.h) / sum(nodes.map(n => n.v));
    nodes.forEach(n => { n.a = n.v * scale; });
    let { x, y, w, h } = rect;
    const worst = (row, len) => {
      const s = sum(row.map(n => n.a));
      const max = Math.max(...row.map(n => n.a)), min = Math.min(...row.map(n => n.a));
      return Math.max((len * len * max) / (s * s), (s * s) / (len * len * min));
    };
    const layoutRow = row => {
      const s = sum(row.map(n => n.a));
      if (w >= h) {
        const cw = s / h;
        let cy = y;
        row.forEach(n => { const nh = n.a / cw; out.push({ item: n.item, x, y: cy, w: cw, h: nh }); cy += nh; });
        x += cw; w -= cw;
      } else {
        const rh = s / w;
        let cx = x;
        row.forEach(n => { const nw = n.a / rh; out.push({ item: n.item, x: cx, y, w: nw, h: rh }); cx += nw; });
        y += rh; h -= rh;
      }
    };
    let row = [];
    let i = 0;
    while (i < nodes.length) {
      const len = Math.min(w, h);
      if (!row.length || worst([...row, nodes[i]], len) <= worst(row, len)) {
        row.push(nodes[i]);
        i++;
      } else {
        layoutRow(row);
        row = [];
      }
    }
    if (row.length) layoutRow(row);
    return out;
  };

  App.sparkline = function (values, opts = {}) {
    const { width = 120, height = 28, color = 'currentColor', area = false, dot = true, strokeWidth = 1.6 } = opts;
    const min = opts.min ?? Math.min(...values), max = opts.max ?? Math.max(...values);
    const pad = dot ? 3 : 1;
    const xs = i => pad + (i / (values.length - 1)) * (width - pad * 2);
    const ys = v => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
    const pts = values.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`);
    const last = values.length - 1;
    const hi = opts.highlight ?? last;
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
      (area ? `<path d="M${pts[0]} L${pts.join(' L')} L${xs(last).toFixed(1)},${height} L${xs(0).toFixed(1)},${height} Z" fill="${color}" fill-opacity=".14"/>` : '') +
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
      (dot ? `<circle cx="${xs(hi).toFixed(1)}" cy="${ys(values[hi]).toFixed(1)}" r="2.6" fill="${color}"/>` : '') +
      `</svg>`;
  };

  // 將 n 個點以分組順序攤平：groups = [{ key, n }]，各版面函式回傳的 points 都依此順序
  App.layouts = {
    /* 均勻散佈：分層抽樣（jittered grid）避免純亂數的團塊；再隨機打散順序 */
    scatter(n, box, { seed = 11, jitter = 0.42 } = {}) {
      const rand = App.rng(seed);
      const cols = Math.max(1, Math.round(Math.sqrt(n * box.w / box.h)));
      const rows = Math.ceil(n / cols) + 1;
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      const cw = box.w / cols, ch = box.h / rows;
      const points = cells.slice(0, n).map(([c, r]) => ({
        x: box.x + (c + 0.5 + (rand() - 0.5) * 2 * jitter) * cw,
        y: box.y + (r + 0.5 + (rand() - 0.5) * 2 * jitter) * ch,
      }));
      return { points, s: Math.min(cw, ch) };
    },

    /* 分群：每群以向日葵螺旋排成圓，嘗試所有「連續分列」方式，取點距最大者 */
    clusters(groups, box, { labelH = 48, gap = 24, maxS = 15 } = {}) {
      const unitR = groups.map(g => Math.sqrt(g.n) / 1.9 + 0.6);   // 以點距 s 為單位的半徑
      const k = groups.length;
      let best = null;
      for (let mask = 0; mask < (1 << (k - 1)); mask++) {
        const rows = [[0]];
        for (let i = 1; i < k; i++) { if (mask & (1 << (i - 1))) rows.push([i]); else rows[rows.length - 1].push(i); }
        if (rows.length > 4) continue;
        const sW = Math.min(...rows.map(row => (box.w - gap * (row.length - 1)) / sum(row.map(i => unitR[i] * 2))));
        const sH = (box.h - labelH * rows.length - gap * (rows.length - 1)) / sum(rows.map(row => Math.max(...row.map(i => unitR[i] * 2))));
        const s = Math.min(sW, sH, maxS);
        if (!best || s > best.s + 0.01) best = { s, rows };
      }
      const { s, rows } = best;
      const rowH = rows.map(row => Math.max(...row.map(i => unitR[i] * 2 * s)) + labelH);
      const totalH = sum(rowH) + gap * (rows.length - 1);
      let y = box.y + (box.h - totalH) / 2;
      const centers = new Array(k);
      rows.forEach((row, ri) => {
        const widths = row.map(i => unitR[i] * 2 * s);
        let x = box.x + (box.w - sum(widths) - gap * (row.length - 1)) / 2;
        row.forEach((i, j) => {
          centers[i] = { key: groups[i].key, cx: x + widths[j] / 2, cy: y + labelH + (rowH[ri] - labelH) / 2, R: unitR[i] * s };
          x += widths[j] + gap;
        });
        y += rowH[ri] + gap;
      });
      const golden = Math.PI * (3 - Math.sqrt(5));
      const c = s / 1.9;
      const points = [];
      groups.forEach((g, gi) => {
        const { cx, cy } = centers[gi];
        for (let i = 0; i < g.n; i++) {
          const rr = c * Math.sqrt(i + 0.5), a = i * golden;
          points.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
        }
      });
      return { points, s, centers };
    },

    /* 甜甜圈：多軌同心圓，依「欄」填入，各組佔連續扇形，組間留 gapCols 欄空隙 */
    donut(groups, box, { gapCols = 1, rOut } = {}) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const Rout = rOut ?? Math.min(box.w, box.h) * 0.46;
      let best = null;
      for (let t = 3; t <= 24; t++) {
        const cols = sum(groups.map(g => Math.ceil(g.n / t))) + gapCols * groups.length;
        const s = (2 * Math.PI * Rout) / (cols + 2 * Math.PI * (t - 1));
        if ((t - 1) * s > Rout * 0.42) break;
        if (!best || s > best.s) best = { s, t, cols };
      }
      const { s, t, cols } = best;
      const step = (2 * Math.PI) / cols;
      const points = [];
      const sectors = [];
      let col = 0;
      groups.forEach(g => {
        const a0 = -Math.PI / 2 + col * step;
        for (let i = 0; i < g.n; i++) {
          const c = col + Math.floor(i / t), track = i % t;
          const a = -Math.PI / 2 + (c + 0.5) * step;
          const rr = Rout - track * s;
          points.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
        }
        col += Math.ceil(g.n / t);
        const a1 = -Math.PI / 2 + col * step;
        sectors.push({ key: g.key, a0, a1, mid: (a0 + a1) / 2 });
        col += gapCols;
      });
      return { points, s, cx, cy, rIn: Rout - (t - 1) * s, rOut: Rout, sectors };
    },

    /* 方格 treemap：squarify 切格，每格扣掉標題列後以「全圖一致」的點距逐列填點。
       bias：切格時每組多算的點數。小畫面上標題列占掉的比例很大，小格會先塞滿、拖累全圖點距，
       補上 bias 讓各格扣掉標題後的空間更接近點數比例（點數本身不變，每點仍是 1 元） */
    treemap(groups, box, { header = 40, pad = 8, gap = 4, bias = 0 } = {}) {
      const rects = App.squarify(groups, box, g => g.n + bias).map(r => ({
        key: r.item.key, n: r.item.n,
        x: r.x + gap / 2, y: r.y + gap / 2, w: r.w - gap, h: r.h - gap,
      }));
      const fits = (s, r) => Math.floor((r.w - pad * 2) / s) * Math.floor((r.h - header - pad) / s) >= r.n;
      let s = Math.sqrt(sum(rects.map(r => Math.max(1, (r.w - pad * 2) * (r.h - header - pad)))) / sum(rects.map(r => r.n)));
      while (s > 2 && !rects.every(r => fits(s, r))) s *= 0.97;
      const byKey = new Map(rects.map(r => [r.key, r]));
      const points = [];
      groups.forEach(g => {
        const r = byKey.get(g.key);
        const cols = Math.max(1, Math.floor((r.w - pad * 2) / s));
        const x0 = r.x + pad + ((r.w - pad * 2) - cols * s) / 2;
        const y0 = r.y + header;
        for (let i = 0; i < g.n; i++) {
          points.push({ x: x0 + ((i % cols) + 0.5) * s, y: y0 + (Math.floor(i / cols) + 0.5) * s });
        }
      });
      return { points, s, rects: groups.map(g => byKey.get(g.key)) };
    },

    /* 堆疊柱狀：columns = [{ key, groups:[{ key, n }] }]；每欄 m 點寬。
       預設每組從新的一列開始（組界清楚）；continuous: true 時各組接續填點，
       點數相同的欄高度就完全相同（適合「每欄都是 100%」的比例柱），組界以分數列表示 */
    bars(columns, box, { labelTop = 30, labelBottom = 30, maxS = 16, continuous = false } = {}) {
      const C = columns.length;
      const rowsOf = (col, m) => (continuous
        ? Math.ceil(sum(col.groups.map(g => g.n)) / m)
        : sum(col.groups.map(g => Math.ceil(g.n / m))));
      let best = null;
      for (let m = 1; m <= 10; m++) {
        const gapDots = Math.max(1, Math.round(m * 0.55));
        const maxRows = Math.max(...columns.map(col => rowsOf(col, m)));
        const sW = box.w / (C * m + (C - 1) * gapDots);
        const sH = (box.h - labelTop - labelBottom) / maxRows;
        const s = Math.min(sW, sH, maxS);
        if (!best || s > best.s + 0.01) best = { s, m, gapDots, maxRows };
      }
      const { s, m, gapDots } = best;
      const totalW = C * m * s + (C - 1) * gapDots * s;
      const left = box.x + (box.w - totalW) / 2;
      const base = box.y + box.h - labelBottom;
      const points = [];
      const cols = columns.map((col, ci) => {
        const x0 = left + ci * (m + gapDots) * s;
        let row = 0, k = 0;
        const segments = col.groups.map(g => {
          if (continuous) {
            const start = k;
            for (let i = 0; i < g.n; i++, k++) {
              points.push({ x: x0 + ((k % m) + 0.5) * s, y: base - (Math.floor(k / m) + 0.5) * s });
            }
            return { key: g.key, bottom: base - (start / m) * s, top: base - (k / m) * s, n: g.n };
          }
          const bottom = base - row * s;
          for (let i = 0; i < g.n; i++) {
            points.push({ x: x0 + ((i % m) + 0.5) * s, y: base - (row + Math.floor(i / m) + 0.5) * s });
          }
          row += Math.ceil(g.n / m);
          return { key: g.key, bottom, top: base - row * s, n: g.n };
        });
        if (continuous) row = Math.ceil(k / m);
        return { key: col.key, x: x0 + (m * s) / 2, x0, w: m * s, top: base - row * s, base, segments };
      });
      return { points, s, m, cols };
    },

    /* 鈔票形方格：cols × rows；order 'col' 讓各組成直條帶，'row' 成橫條帶 */
    waffle(groups, box, { cols, rows, order = 'col', fill = 0.86 } = {}) {
      const s = Math.min((box.w * fill) / cols, (box.h * fill) / rows);
      const w = cols * s, h = rows * s;
      const x0 = box.x + (box.w - w) / 2, y0 = box.y + (box.h - h) / 2;
      const points = [];
      const bands = [];
      let k = 0;
      groups.forEach(g => {
        const start = k;
        for (let i = 0; i < g.n; i++, k++) {
          const c = order === 'col' ? Math.floor(k / rows) : k % cols;
          const r = order === 'col' ? k % rows : Math.floor(k / cols);
          points.push({ x: x0 + (c + 0.5) * s, y: y0 + (r + 0.5) * s });
        }
        const per = order === 'col' ? rows : cols;
        bands.push({ key: g.key, from: start / per, to: k / per });   // 以欄（或列）為單位的起訖
      });
      return { points, s, frame: { x: x0, y: y0, w, h }, bands };
    },
  };


  /* ========================================================================
     9. DotField：招牌點陣引擎
     每個點有目前／起點／終點三組值（位置、半徑、透明度、空心程度、顏色），
     to() 以交錯延遲＋弧線路徑補間，像一群鳥換隊形；不在畫面上時不跑 rAF。
     ======================================================================== */
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const makeState = n => ({
    x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n), a: new Float32Array(n),
    o: new Float32Array(n), R: new Float32Array(n), G: new Float32Array(n), B: new Float32Array(n),
  });
  const FIELDS = ['x', 'y', 'r', 'a', 'o', 'R', 'G', 'B'];

  class DotField {
    constructor(canvas, { count = 1000, duration = 1100, stagger = 650, seed = 5 } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.n = count;
      this.duration = duration;
      this.stagger = stagger;
      this.cur = makeState(count);
      this.from = makeState(count);
      this.dst = makeState(count);
      this.delay = new Float32Array(count);
      this.bend = new Float32Array(count);
      this.phase = new Float32Array(count);
      this.freq = new Float32Array(count);
      this.jit = new Float32Array(count);
      this.em = new Float32Array(count).fill(1);
      this.emT = new Float32Array(count).fill(1);
      const rand = App.rng(seed);
      for (let i = 0; i < count; i++) {
        this.bend[i] = (rand() - 0.5) * 0.7;
        this.phase[i] = rand() * Math.PI * 2;
        this.freq[i] = 0.0005 + rand() * 0.0007;
        this.jit[i] = rand();
      }
      this.idle = 0;
      this.idleT = 0;
      this.tweening = false;
      this.t0 = 0;
      this.dur = duration;
      this.last = 0;
      this.raf = 0;
      this.onScreen = true;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.onresize = null;
      this.tick = this.tick.bind(this);

      new IntersectionObserver(entries => {
        this.onScreen = entries[entries.length - 1].isIntersecting;
        this.kick();
      }).observe(canvas);
      document.addEventListener('visibilitychange', () => this.kick());
      new ResizeObserver(() => {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (Math.abs(w - this.width) < 1 && Math.abs(h - this.height) < 1) return;
        this.resize();
        if (this.onresize) this.onresize(this.width, this.height);
      }).observe(canvas);
      this.resize();
    }

    resize() {
      this.width = this.canvas.clientWidth;
      this.height = this.canvas.clientHeight;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
      this.draw(performance.now());
    }

    writeTargets(targets) {
      const d = this.dst;
      for (let i = 0; i < this.n; i++) {
        const t = targets[i];
        const [R, G, B] = App.rgb(t.color);
        d.x[i] = t.x; d.y[i] = t.y; d.r[i] = t.r; d.a[i] = t.alpha ?? 1; d.o[i] = t.hollow ?? 0;
        d.R[i] = R; d.G[i] = G; d.B[i] = B;
      }
    }

    // 直接跳到終態（初次繪製、resize、減少動態）
    jump(targets) {
      this.writeTargets(targets);
      FIELDS.forEach(f => this.cur[f].set(this.dst[f]));
      this.tweening = false;
      this.draw(performance.now());
      this.kick();
    }

    to(targets, { duration = this.duration, stagger = this.stagger, delay } = {}) {
      if (App.reducedMotion || duration <= 0) { this.jump(targets); return; }
      const now = performance.now();
      this.advance(now);   // 先把目前值推進到「此刻」，畫面暫停時也不會從過期位置出發
      FIELDS.forEach(f => this.from[f].set(this.cur[f]));
      this.writeTargets(targets);
      const w = this.width || 1;
      for (let i = 0; i < this.n; i++) {
        const k = delay ? delay(i, targets[i]) : 0.6 * clamp(this.dst.x[i] / w, 0, 1) + 0.4 * this.jit[i];
        this.delay[i] = k * stagger;
      }
      this.t0 = now;
      this.dur = duration;
      this.tweening = true;
      this.kick();
    }

    setEmphasis(fn) {
      for (let i = 0; i < this.n; i++) this.emT[i] = fn ? fn(i) : 1;
      if (App.reducedMotion) { this.em.set(this.emT); this.draw(performance.now()); }
      this.kick();
    }

    setIdle(px) {
      this.idleT = App.reducedMotion ? 0 : px;
      this.kick();
    }

    kick() {
      if (this.raf || !this.onScreen || document.hidden) return;
      this.raf = requestAnimationFrame(this.tick);
    }

    advance(now) {
      let busy = false;
      const { cur, from, dst } = this;
      if (this.tweening) {
        let done = true;
        const n = this.n;
        for (let i = 0; i < n; i++) {
          const t = clamp((now - this.t0 - this.delay[i]) / this.dur, 0, 1);
          if (t < 1) done = false;
          const e = easeInOutCubic(t);
          const dx = dst.x[i] - from.x[i], dy = dst.y[i] - from.y[i];
          // 垂直於位移方向的弧線偏移，距離越遠彎越多
          const arc = Math.sin(Math.PI * e) * this.bend[i];
          cur.x[i] = from.x[i] + dx * e - dy * arc;
          cur.y[i] = from.y[i] + dy * e + dx * arc;
          cur.r[i] = from.r[i] + (dst.r[i] - from.r[i]) * e;
          cur.a[i] = from.a[i] + (dst.a[i] - from.a[i]) * e;
          cur.o[i] = from.o[i] + (dst.o[i] - from.o[i]) * e;
          cur.R[i] = from.R[i] + (dst.R[i] - from.R[i]) * e;
          cur.G[i] = from.G[i] + (dst.G[i] - from.G[i]) * e;
          cur.B[i] = from.B[i] + (dst.B[i] - from.B[i]) * e;
        }
        if (done) this.tweening = false; else busy = true;
      }
      const dt = this.last ? Math.min(64, now - this.last) : 16;
      this.last = now;
      const k = 1 - Math.exp(-dt / 110);
      for (let i = 0; i < this.n; i++) {
        const diff = this.emT[i] - this.em[i];
        if (Math.abs(diff) > 0.004) { this.em[i] += diff * k; busy = true; } else this.em[i] = this.emT[i];
      }
      this.idle += (this.idleT - this.idle) * k * 0.5;
      if (Math.abs(this.idleT - this.idle) < 0.02) this.idle = this.idleT;
      if (this.idle > 0.02 || this.idle !== this.idleT) busy = true;
      return busy;
    }

    tick(now) {
      this.raf = 0;
      const busy = this.advance(now);
      this.draw(now);
      if (busy) this.kick(); else this.last = 0;
    }

    draw(now) {
      const { ctx, cur, em } = this;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      const idle = this.idle;
      const TAU = Math.PI * 2;
      for (let i = 0; i < this.n; i++) {
        const alpha = cur.a[i] * em[i];
        const r = cur.r[i];
        if (alpha < 0.01 || r < 0.2) continue;
        let x = cur.x[i], y = cur.y[i];
        if (idle > 0.02) {
          x += Math.sin(now * this.freq[i] + this.phase[i]) * idle;
          y += Math.cos(now * this.freq[i] * 0.8 + this.phase[i] * 1.7) * idle;
        }
        const rgb = `${cur.R[i] | 0},${cur.G[i] | 0},${cur.B[i] | 0}`;
        const o = cur.o[i];
        if (o < 0.99) {
          ctx.fillStyle = `rgba(${rgb},${(alpha * (1 - o)).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
        if (o > 0.01) {
          const lw = Math.max(1, r * 0.4);
          ctx.lineWidth = lw;
          ctx.strokeStyle = `rgba(${rgb},${(alpha * o).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.5, r - lw / 2), 0, TAU);
          ctx.stroke();
        }
      }
    }

    hit(px, py) {
      const { cur, em } = this;
      let best = -1, bd = Infinity;
      for (let i = 0; i < this.n; i++) {
        if (cur.a[i] * em[i] < 0.15) continue;
        const dx = cur.x[i] - px, dy = cur.y[i] - py;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return -1;
      const rr = Math.max(cur.r[best] + 4, 9);
      return bd <= rr * rr ? best : -1;
    }
  }
  App.DotField = DotField;


  /* ========================================================================
     10. 啟動
     ======================================================================== */
  initShell();
  App.scan(document);
})();
