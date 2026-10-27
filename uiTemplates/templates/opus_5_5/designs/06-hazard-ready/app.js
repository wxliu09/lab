/* ==========================================================================
   澄港市 防災資訊網 —— 共用行為 app.js
   以 <script src="app.js" defer></script> 載入，所有 API 掛在 window.App。

   ⚠ 載入順序
     頁面底部的 inline <script> 會比 defer 的 app.js「先」執行，所以頁面程式一律包在
       document.addEventListener('DOMContentLoaded', () => { ... });
     defer 腳本保證在 DOMContentLoaded 之前跑完，屆時 App 已就緒。
     app.js 會自動 App.scan(document)；用 innerHTML 動態插入含 data-* 元件的內容後，
     請呼叫 App.scan(容器)（重複呼叫安全）。

   時間（故事裡的「現在」）
     App.now()           → Date。從 2026-10-23（五）14:32:00 起算，跟著真實經過時間走。
                            所有警報、收容資料都以這個時間點為準，倒數與時鐘因此會動但永遠前後一致。
     App.date('2026-10-23T05:30') / App.date('2026-10-23') → 本地 Date（不受時區影響）

   資料（全站單一來源；數字、人名、案號都從這裡取，不要另外手打）
     App.data.city        全市警戒摘要 { level, eoc, since, updated, headline, landWarningAt }
     App.data.districts   8 個行政區 { gc, ba, jc, sj, xw, yt, xz, yl }：name / code(D01–D08) / en / level / note / rain24 / pop
     App.data.alerts      28 則警報（新→舊）{ id:'26-1023-04', type, level, status, title, issued, ended,
                           window?, districts:['yl'] 或 ['all'], source, summary, actions[], facts[[k,v]] }
     App.data.stats       過去 12 個月（2025-11 → 2026-10）各類型發布則數 { months[], counts{type:[12]}, totals }
     App.data.quake       最新地震報告（含各區震度）    App.data.typhoon  颱風「岬燈」（含路徑）
     App.data.shelters    24 處避難收容處所 { id:'S-YL-01', name, district, kind, x, y, cap, occ, status,
                           access, pet, elder, hazards[], elev, addr, phone, note }
     App.data.user        模擬目前位置 { x, y, label, addr }（地圖座標）
     App.data.kit         防災包品項 { id, cat, name, unit, base, per{person,infant,elder,pet}, grab, note }
     App.data.kitCats     防災包分類    App.data.phones  緊急電話
     App.data.stations    地震測站（招牌波形用）
     查詢：App.district(key) App.alert(id) App.shelter(id) App.activeAlerts() App.openShelters()
           App.alertsFor(districtKey) App.sheltersIn(districtKey) App.summary()（衍生統計，永遠即時計算）
           App.distance(a, b) → 公里（a、b 為含 x,y 的物件；地圖 1 單位 = 15 公尺）
           App.walkMin(km) → 步行分鐘   App.kitQty(item, household) → 數量

   定義
     App.LEVELS   normal 平時(綠) / info 資訊(藍) / advisory 注意(黃) / warning 警戒(紅)
     App.LEVEL_SHAPES  等級形狀（12 格 SVG 片段，不含 fill）：normal 方 / info 圓 / advisory 三角 / warning 八角
     App.HAZARDS  quake 地震 / rain 豪雨 / debris 土石流 / typhoon 颱風 / tsunami 海嘯 / utility 停水停電
                  （這也是圖表的固定系列順序，色票在 CSS --hz-*）
     App.STATUS   active 生效中 / scheduled 預告 / lifted 已解除；收容所 open 開設中 / standby 待命 / closed 暫停開設

   HTML 產生器（回傳字串）
     App.icon(name, cls)                線條 UI 圖示（24 格）：arrow-r arrow-l arrow-ur chev-d chev-r close search
                                        phone pin target clock check plus minus filter list map grid print copy info
                                        alert menu sort calendar users bell pause play wave refresh home layers
     App.sign(glyph, frame, {cls, label})  ISO 風格標誌：frame = warning(黃三角) safe(綠方) fire(紅方)
                                        mandatory(藍圓) info(藍方) ink(黑方黃圖) plain(只有圖，currentColor)
                                        glyph：quake typhoon rain debris tsunami utility flood fire shelter evac
                                        assembly firstaid aed phone access pet elder baby water food light radio
                                        battery medkit meds docs cash whistle clothes mask
     App.hazardSign(type, cls)          該災害類型的黃三角警告標誌
     App.levelBadge(level, {size:'sm'|'lg', en:true})   等級徽章（形狀＋文字，不只靠顏色）
     App.statusTag(status)              狀態小標      App.hzTag(type)  災害類型標籤（含小圖與類型色）
     App.featTags(shelter)              無障礙/寵物/長者照護標示    App.capBar(shelter)  容量條
     App.alertRowHTML(alert, {showStatus}) 警報列（button[data-alert]，點擊自動開詳情 modal）
     App.shelterCardHTML(shelter, {rank, km})  收容處所卡
     App.districtNames(keys)            ['yl','sj'] → '雲嶺區、山腳區'（'all' → '全市'）
     App.esc(str) / App.fmt.*：num dt date md wd time hm ago dur km

   UI
     App.toast(msg, { title, tone:'ink'|'yellow'|'red'|'green'|'blue', timeout })
       modal 開著時 toast 會自動移進 dialog（top layer）裡，關閉後移回 body。
     App.modal.open(dialogOrId) / App.modal.close(dialogOrId?)
       宣告式：[data-modal-open="dialogId"] 開啟、[data-modal-close] 關閉；點背景或 Esc 關閉。
       dialog 結構：<dialog class="modal"><div class="modal__box">…</div></dialog>
     App.openAlert(id)                  共用的警報詳情 modal（[data-alert="id"] 的按鈕自動綁定）
     App.alarm.show({ kicker, title, sub, countdown, countLabel, after, timeout }) / App.alarm.hide()
                                        頁首警示橫幅（紅底＋斜紋，可含秒數倒數）
     App.tabs        [data-tabs] 內含 [role=tablist] > [role=tab][aria-controls]；切換時 root 觸發 'tabchange'
     App.segmented   [data-segmented] > button[data-value]；觸發 'segchange'（detail.value）
     App.chips       [data-chips="multi"|"single"] > button.chip[data-value]；觸發 'chipchange'（detail.values）
     App.stepper     [data-stepper] > button[data-step="-1|1"] + input[type=number]；改值時 input 觸發 input/change
     App.field.setError(input, msg) / App.field.clear(formOrField)
     App.valid.required(v) / phone(v)（09 開頭手機或 8 碼市話）/ email(v)
     App.cityMap(svg, { mode:'status'|'plain', selected, onSelect(key), user:true, roads:true, labels:true })
       → { svg, select(key), markers(<g>), routes(<g>), point(x,y) }  地圖 viewBox 0 0 1000 640
     App.refresh()                      重算所有衍生顯示（[data-bind]、導覽徽章、頁首燈號）
     App.tip.show(html, clientX, clientY) / App.tip.hide()   圖表 hover 提示（.tooltip）

   宣告式綁定（app.js 自動處理）
     [data-clock]            "2026.10.23（五）14:32:07"；[data-clock="time"] 只顯示時間
     [data-countdown="2026-10-24T08:30"]  內含 [data-unit="d|h|m|s"]；或無子元素時直接寫入 HH:MM:SS
     [data-bind="activeAlerts|redDistricts|openShelters|sheltered|shelterCount|level|eoc"]  衍生數字
     [data-city-status]      頁首警戒燈號小標
     [data-reveal]           進場（"" | left | right | stamp），style="--rd:120ms" 錯開；保證最終可見
     [data-count="128"]      數字遞增；App.countUp(el, n) 可再更新（讀當下最新值，連續呼叫安全）
     [data-loop]             含無限 CSS 動畫的元素：離開視窗或分頁隱藏時加 .is-paused 暫停
     [data-sign="quake warning"]  內容替換成 App.sign(glyph, frame)（frame 省略＝warning）
     [data-icon="arrow-r"]        在元素開頭插入 App.icon(name)

   動態引擎
     App.animate(el, fn(t, dt))  只在 el 可見、分頁可見、未要求減少動態時每格呼叫；回傳 { stop() }
     App.reducedMotion           getter
     App.seismo(root, { station, firstEventAt, onEvent(ev), onTick({pga, intensity}) })
       root 內放一個 <svg class="seismo__svg">；引擎負責畫三分量波形、P/S 波標記與時間軸。
       → { trigger(peakGal), setStation(i), pause(bool), paused, station }
       ev = { time:Date, station, peak, intensity, sp(秒，S 波抵達倒數), prefill, arrived(減少動態/暫停時直接畫出已到達的 S 波) }
     App.intensity(gal) → { level:0–7, label:'3 級' }
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 時間 ---------- */
  // 故事時間錨定在 10/23 14:32；用經過時間推進，避免觀看者的真實時刻早於「最後更新」造成矛盾
  const STORY_START = new Date(2026, 9, 23, 14, 32, 0).getTime();
  const LOADED_AT = Date.now();
  const now = () => new Date(STORY_START + (Date.now() - LOADED_AT));
  const TODAY = '2026-10-23';

  function date(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) throw new Error('App.date: bad iso ' + iso);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  const toDate = v => (v instanceof Date ? v : date(v));
  const pad = n => String(n).padStart(2, '0');
  const WD = ['日', '一', '二', '三', '四', '五', '六'];

  const fmt = {
    num: n => Number(n).toLocaleString('en-US'),
    date: v => { const d = toDate(v); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; },
    md: v => { const d = toDate(v); return `${d.getMonth() + 1}/${d.getDate()}`; },
    wd: v => WD[toDate(v).getDay()],
    hm: v => { const d = toDate(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    time: v => { const d = toDate(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; },
    dt: v => `${fmt.md(v)} ${fmt.hm(v)}`,
    ago(v) {
      const diff = (now() - toDate(v)) / 60000;
      if (diff < 1) return '剛剛';
      if (diff < 60) return `${Math.floor(diff)} 分鐘前`;
      if (diff < 60 * 24) return `${Math.floor(diff / 60)} 小時前`;
      if (diff < 60 * 24 * 7) return `${Math.floor(diff / 1440)} 天前`;
      return fmt.date(v);
    },
    dur(ms) {
      const s = Math.max(0, Math.floor(ms / 1000));
      return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    },
    km: km => (km < 1 ? `${Math.round(km * 1000 / 10) * 10} 公尺` : `${km.toFixed(1)} 公里`)
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- 定義 ---------- */
  const LEVELS = {
    normal:   { key: 'normal',   name: '平時', en: 'NORMAL',   lamp: 'green',  rank: 0, color: '#009A44', desc: '無生效中的警戒，維持日常整備。' },
    info:     { key: 'info',     name: '資訊', en: 'INFO',     lamp: null,     rank: 1, color: '#005EB8', desc: '提供參考的資訊與預告，無須採取緊急行動。' },
    advisory: { key: 'advisory', name: '注意', en: 'ADVISORY', lamp: 'yellow', rank: 2, color: '#FFD100', desc: '災害可能發生，請留意最新資訊並完成避難準備。' },
    warning:  { key: 'warning',  name: '警戒', en: 'WARNING',  lamp: 'red',    rank: 3, color: '#E1251B', desc: '災害即將或正在發生，請依指示立即撤離或就地避難。' }
  };
  const LAMP_NAME = { green: '綠燈', yellow: '黃燈', red: '紅燈' };

  // 順序即圖表的固定系列順序（色票已用 dataviz validator 驗過相鄰對比）
  const HAZARDS = {
    quake:   { key: 'quake',   name: '地震',     en: 'EARTHQUAKE', glyph: 'quake',   shelterName: '地震' },
    rain:    { key: 'rain',    name: '豪雨',     en: 'HEAVY RAIN', glyph: 'rain',    shelterName: '淹水' },
    debris:  { key: 'debris',  name: '土石流',   en: 'DEBRIS FLOW', glyph: 'debris', shelterName: '土石流' },
    typhoon: { key: 'typhoon', name: '颱風',     en: 'TYPHOON',    glyph: 'typhoon', shelterName: '颱風' },
    tsunami: { key: 'tsunami', name: '海嘯',     en: 'TSUNAMI',    glyph: 'tsunami', shelterName: '海嘯' },
    utility: { key: 'utility', name: '停水停電', en: 'OUTAGE',     glyph: 'utility', shelterName: '停水停電' }
  };

  const STATUS = {
    active:    { name: '生效中' },
    scheduled: { name: '預告' },
    lifted:    { name: '已解除' },
    open:      { name: '開設中' },
    standby:   { name: '待命' },
    closed:    { name: '暫停開設' }
  };

  /* ---------- 資料 ---------- */
  const districts = {
    gc: { key: 'gc', code: 'D01', name: '港埕區', en: 'GANGCHENG', level: 'normal',   rain24: 88,  pop: 182400, note: '港區作業正常；颱風外圍強陣風 8 級，請注意招牌與高空墜物。' },
    ba: { key: 'ba', code: 'D02', name: '北岸區', en: "BEI'AN",    level: 'advisory', rain24: 142, pop: 96300,  note: '長浪與強陣風；漁港里、燈塔里局部停電搶修中。' },
    jc: { key: 'jc', code: 'D03', name: '舊城區', en: 'JIUCHENG',  level: 'normal',   rain24: 96,  pop: 128700, note: '10/27 計畫性停水預告；如颱風來襲將順延。' },
    sj: { key: 'sj', code: 'D04', name: '山腳區', en: 'SHANJIAO',  level: 'advisory', rain24: 312, pop: 74900,  note: '3 條潛勢溪流土石流黃色警戒，預防性撤離 16 人。' },
    xw: { key: 'xw', code: 'D05', name: '新灣區', en: 'XINWAN',    level: 'normal',   rain24: 74,  pop: 143200, note: '低窪地下道已預布抽水機 6 台。' },
    yt: { key: 'yt', code: 'D06', name: '鹽田區', en: 'YANTIAN',   level: 'advisory', rain24: 61,  pop: 58600,  note: '大潮與颱風暴潮疊加，嚴防海水倒灌；鹽埕里活動中心預防性開設。' },
    xz: { key: 'xz', code: 'D07', name: '溪洲區', en: 'XIZHOU',    level: 'advisory', rain24: 188, pop: 88400,  note: '澄溪溪洲橋水位二級警戒（4.62 公尺），持續上升。' },
    yl: { key: 'yl', code: 'D08', name: '雲嶺區', en: 'YUNLING',   level: 'warning',  rain24: 486, pop: 31200,  note: '坪頂溪、茶寮坑土石流紅色警戒，已撤離 112 人。' }
  };
  const DISTRICT_ORDER = ['gc', 'ba', 'jc', 'sj', 'xw', 'yt', 'xz', 'yl'];

  const city = {
    level: 'advisory',
    eoc: '二級開設',
    since: '2026-10-23T05:30',
    updated: '2026-10-23T14:20',
    headline: '颱風「岬燈」海上警報＋山區豪雨特報',
    landWarningAt: '2026-10-24T08:30'
  };

  const A = (id, type, level, status, title, issued, ended, districts, source, summary, actions, facts, extra) =>
    Object.assign({ id, type, level, status, title, issued, ended, districts, source, summary, actions, facts }, extra || {});
  const EOC = '澄港市災害應變中心';
  const alerts = [
    A('26-1023-06', 'utility', 'info', 'active', '北岸區漁港里、燈塔里局部停電', '2026-10-23T12:10', null, ['ba'], '澄港配電搶修中心',
      '颱風外圍強陣風造成北岸二號饋線跳脫，影響約 1,860 戶，搶修人員已到場，預計 18:00 前全數復電。',
      ['停電期間請勿使用蠟燭照明，改用手電筒。', '居家使用維生器材者，請撥 1999 轉 6 登記優先復電。', '冰箱盡量少開門，可保冷約 4 小時。'],
      [['影響戶數', '約 1,860 戶'], ['預計復電', '10/23 18:00'], ['受影響收容所', 'S-BA-02 暫停開設']]),
    A('26-1023-05', 'rain', 'advisory', 'active', '澄溪溪洲橋水位二級警戒', '2026-10-23T11:40', null, ['xz'], '澄港市水利處',
      '溪洲橋測站水位 4.62 公尺，已超過二級警戒線 4.50 公尺且持續上升；一級警戒線為 5.30 公尺。',
      ['沿岸低窪住戶請將車輛移至高處，備妥防災包準備撤離。', '請勿靠近河堤、便橋觀看水勢。', '行動不便者可撥 1999 預約撤離協助。'],
      [['目前水位', '4.62 m'], ['二級警戒', '4.50 m'], ['一級警戒', '5.30 m'], ['上升速率', '+0.18 m/h']]),
    A('26-1023-04', 'debris', 'warning', 'active', '雲嶺區坪頂溪、茶寮坑土石流紅色警戒', '2026-10-23T09:20', null, ['yl'], EOC,
      '坪頂雨量站 24 小時累積雨量 486 毫米，已超過土石流警戒基準值 450 毫米。坪頂里、茶寮里保全住戶已強制撤離，共 112 人。',
      ['保全範圍內住戶請立即依指示撤離，警戒解除前不可返家。', '已撤離者請至雲嶺國中或坪頂社區活動中心報到。', '雲嶺 1 號道路 12K–18K 預警性封閉，請改道。'],
      [['累積雨量', '486 mm'], ['警戒基準', '450 mm'], ['已撤離', '112 人'], ['封閉路段', '雲嶺 1 號道路 12K–18K']]),
    A('26-1023-03', 'debris', 'advisory', 'active', '山腳區 3 條潛勢溪流土石流黃色警戒', '2026-10-23T07:50', null, ['sj'], EOC,
      '石門坑、後壁溪、九芎坑預測雨量可能達警戒基準值，已通知保全住戶預防性撤離，目前 16 人進住山腳國小。',
      ['保全住戶請備妥防災包，依里長通知撤離。', '夜間請避免進入山區道路。'],
      [['潛勢溪流', '3 條'], ['預防性撤離', '16 人'], ['收容處所', 'S-SJ-01 山腳國小']]),
    A('26-1023-02', 'typhoon', 'advisory', 'active', '颱風「岬燈」海上警報', '2026-10-23T05:30', null, ['all'], EOC,
      '中度颱風「岬燈」中心位於澄港市東南方 430 公里海面，以每小時 17 公里向西北西移動，預估 10/24 08:30 前後發布陸上警報，10/25 清晨最接近本市。',
      ['檢查門窗、清理排水溝，固定陽台與屋頂物品。', '漁船請於 10/24 12:00 前回港避風。', '沿海地區請勿前往海邊觀浪、釣魚。'],
      [['強度', '中度颱風'], ['中心氣壓', '955 hPa'], ['最大風速', '43 m/s（14 級）'], ['七級風半徑', '220 km'], ['移動', '西北西 17 km/h']]),
    A('26-1023-01', 'rain', 'advisory', 'active', '豪雨特報：雲嶺、山腳山區大豪雨', '2026-10-23T04:10', null, ['yl', 'sj', 'xz'], EOC,
      '東北季風與颱風外圍環流共伴，山區持續有豪雨至大豪雨，平地亦有局部大雨。',
      ['山區請嚴防坍方、落石與土石流。', '低窪地區請預防積淹水，地下室車輛請移出。'],
      [['雲嶺 24h', '486 mm'], ['山腳 24h', '312 mm'], ['溪洲 24h', '188 mm']]),
    A('26-1022-02', 'quake', 'info', 'lifted', '地震報告：澄港外海 規模 4.6', '2026-10-22T21:47', '2026-10-22T21:47', ['all'], '澄港地震觀測網',
      '震央位於澄港市政府東南東方 38.2 公里海域，深度 12.4 公里。港埕區、新灣區、鹽田區最大震度 3 級，未接獲災情。',
      ['餘震可能持續，請留意懸掛物品與高處置物。'],
      [['規模', 'M4.6'], ['深度', '12.4 km'], ['最大震度', '3 級（港埕區）'], ['有感回報', '1,284 筆']]),
    A('26-1022-01', 'rain', 'info', 'lifted', '大雨特報', '2026-10-22T08:15', '2026-10-23T04:10', ['yl', 'sj', 'xz', 'ba'], EOC,
      '東北季風增強，迎風面山區有局部大雨；已於 10/23 04:10 升級為豪雨特報。',
      ['山區活動請注意天候變化。'], [['發布範圍', '4 區']]),
    A('26-1021-01', 'utility', 'info', 'scheduled', '舊城區計畫性停水（管線汰換）', '2026-10-21T10:00', null, ['jc'], '澄港市自來水處',
      '配合中正路主幹管汰換工程，舊城區鐘樓里、文廟里、北門里約 4,200 戶停水 7 小時，降壓供水至 10/28 08:00；如颱風來襲將順延並另行公告。',
      ['請於停水前儲備足夠用水。', '復水初期水質可能混濁，請放流數分鐘後再使用。'],
      [['影響戶數', '約 4,200 戶'], ['停水時間', '10/27 22:00–10/28 05:00']], { window: ['2026-10-27T22:00', '2026-10-28T05:00'] }),
    A('26-1009-01', 'quake', 'info', 'lifted', '地震報告：雲嶺區 規模 3.9', '2026-10-09T03:12', '2026-10-09T03:12', ['yl', 'sj'], '澄港地震觀測網',
      '震央位於雲嶺區公所西北方 6.3 公里，深度 8.1 公里，雲嶺區最大震度 2 級。', ['山區道路請留意落石。'],
      [['規模', 'M3.9'], ['深度', '8.1 km'], ['最大震度', '2 級（雲嶺區）']]),
    A('26-0918-01', 'rain', 'info', 'lifted', '大雨特報（午後對流）', '2026-09-18T13:30', '2026-09-18T20:00', ['gc', 'jc', 'xw'], EOC,
      '午後熱對流旺盛，港埕、舊城、新灣區最大時雨量 62 毫米，中正地下道一度積水 30 公分。', ['避免行經地下道與低窪路段。'],
      [['最大時雨量', '62 mm'], ['積水路段', '1 處']]),
    A('26-0902-01', 'typhoon', 'advisory', 'lifted', '颱風「藍帆」海上警報', '2026-09-02T11:30', '2026-09-03T17:30', ['all'], EOC,
      '輕度颱風「藍帆」通過本市東方海面，未發布陸上警報，北岸區沿海長浪明顯。', ['沿海地區請勿戲水、觀浪。'],
      [['強度', '輕度颱風'], ['最接近距離', '東方 260 km']]),
    A('26-0821-01', 'quake', 'info', 'lifted', '地震報告：北岸外海 規模 4.2', '2026-08-21T14:06', '2026-08-21T14:06', ['ba', 'gc'], '澄港地震觀測網',
      '震央位於北岸漁港東北方 22.5 公里海域，深度 21.7 公里，北岸區最大震度 2 級。', ['無須採取行動。'],
      [['規模', 'M4.2'], ['深度', '21.7 km'], ['最大震度', '2 級（北岸區）']]),
    A('26-0729-02', 'debris', 'warning', 'lifted', '雲嶺區土石流紅色警戒', '2026-07-29T06:40', '2026-07-30T12:00', ['yl'], EOC,
      '颱風「舵石」帶來豪雨，坪頂溪發布紅色警戒並撤離 64 人；坪頂里 2 戶農舍遭土石掩埋，無人傷亡。', ['警戒解除後返家前，請先確認道路與屋況安全。'],
      [['撤離人數', '64 人'], ['累積雨量', '612 mm']]),
    A('26-0729-01', 'utility', 'advisory', 'lifted', '颱風造成北岸區、港埕區停電', '2026-07-29T03:20', '2026-07-30T22:00', ['ba', 'gc'], '澄港配電搶修中心',
      '強風吹斷電桿 14 支，最多 12,480 戶停電，7/30 22:00 全數復電。', ['停電期間請勿使用蠟燭照明。'],
      [['最多停電', '12,480 戶'], ['復電歷時', '約 43 小時']]),
    A('26-0728-01', 'typhoon', 'warning', 'lifted', '颱風「舵石」陸上警報', '2026-07-28T08:30', '2026-07-30T05:30', ['all'], EOC,
      '強烈颱風「舵石」暴風圈籠罩全市，港埕測站最大陣風 17 級，全市停班停課 2 日。', ['颱風眼經過時風雨暫歇，請勿外出。'],
      [['強度', '強烈颱風'], ['最大陣風', '58.6 m/s（17 級）'], ['總雨量', '雲嶺 612 mm']]),
    A('26-0614-02', 'debris', 'advisory', 'lifted', '山腳區、雲嶺區土石流黃色警戒', '2026-06-14T17:20', '2026-06-15T09:00', ['sj', 'yl'], EOC,
      '梅雨鋒面帶來豪雨，山腳區、雲嶺區 5 條潛勢溪流發布黃色警戒，預防性撤離 21 人。', ['保全住戶請依里長通知撤離。'],
      [['潛勢溪流', '5 條'], ['預防性撤離', '21 人']]),
    A('26-0614-01', 'rain', 'warning', 'lifted', '超大豪雨特報（梅雨鋒面）', '2026-06-14T05:00', '2026-06-15T14:00', ['yl', 'sj', 'xz', 'jc'], EOC,
      '滯留鋒面通過，雲嶺區 24 小時累積雨量 538 毫米，溪洲區 6 處道路積水。', ['低窪地區請預防積淹水。'],
      [['雲嶺 24h', '538 mm'], ['積水路段', '6 處']]),
    A('26-0530-01', 'quake', 'info', 'lifted', '地震報告：港埕近海 規模 4.4', '2026-05-30T09:52', '2026-05-30T09:52', ['gc', 'xw', 'yt'], '澄港地震觀測網',
      '震央位於港埕區東方 16.8 公里海域，深度 15.0 公里，港埕區最大震度 3 級。', ['無須採取行動。'],
      [['規模', 'M4.4'], ['深度', '15.0 km'], ['最大震度', '3 級（港埕區）']]),
    A('26-0517-01', 'rain', 'advisory', 'lifted', '豪雨特報（梅雨鋒面）', '2026-05-17T15:40', '2026-05-18T10:00', ['yl', 'sj'], EOC,
      '梅雨鋒面南移，山區有豪雨，雲嶺區 24 小時累積雨量 247 毫米。', ['山區請嚴防坍方與落石。'],
      [['雲嶺 24h', '247 mm']]),
    A('26-0403-01', 'tsunami', 'info', 'lifted', '海嘯消息：西太平洋遠地地震', '2026-04-03T06:18', '2026-04-03T09:00', ['ba', 'gc', 'xw', 'yt'], EOC,
      '西太平洋發生規模 7.4 地震，預估抵達本市沿海之海嘯波高小於 0.3 公尺，無須撤離。', ['沿海活動請暫停至消息解除。'],
      [['震源規模', 'M7.4'], ['預估波高', '< 0.3 m'], ['預估抵達', '08:42']]),
    A('26-0226-02', 'utility', 'advisory', 'lifted', '新灣區地震後停電', '2026-02-26T23:10', '2026-02-27T06:40', ['xw'], '澄港配電搶修中心',
      '地震造成新灣變電所保護電驛跳脫，2,340 戶停電，2/27 06:40 全數復電。', ['停電期間請關閉電器開關，復電後再逐一開啟。'],
      [['停電戶數', '2,340 戶']]),
    A('26-0226-01', 'quake', 'advisory', 'lifted', '地震報告：舊城區 規模 5.9', '2026-02-26T22:58', '2026-02-26T22:58', ['all'], '澄港地震觀測網',
      '震央位於舊城區鐘樓西南方 4.1 公里，深度 9.6 公里，舊城區最大震度 4 級；3 棟老舊建物外牆剝落，2 人輕傷。', ['檢查瓦斯管線與牆面裂縫，發現異狀請撥 1999。'],
      [['規模', 'M5.9'], ['深度', '9.6 km'], ['最大震度', '4 級（舊城區）'], ['災情', '3 處']]),
    A('26-0117-01', 'quake', 'info', 'lifted', '地震報告：東部外海 規模 4.1', '2026-01-17T05:31', '2026-01-17T05:31', ['gc', 'xw'], '澄港地震觀測網',
      '震央位於新灣區東方 41.3 公里海域，深度 30.2 公里，最大震度 2 級。', ['無須採取行動。'],
      [['規模', 'M4.1'], ['深度', '30.2 km'], ['最大震度', '2 級（新灣區）']]),
    A('25-1219-02', 'tsunami', 'advisory', 'lifted', '海嘯警報：近海規模 6.8 地震', '2025-12-19T02:40', '2025-12-19T04:55', ['ba', 'gc', 'xw', 'yt'], EOC,
      '近海地震引發海嘯，預估波高 0.5–1 公尺，沿海低窪地區建議撤離至高處或垂直避難設施；實測最大波高 0.42 公尺。', ['海嘯警報期間請遠離海岸、河口。'],
      [['預估波高', '0.5–1 m'], ['實測最大', '0.42 m（新灣潮位站）']]),
    A('25-1219-01', 'quake', 'advisory', 'lifted', '地震報告：東南近海 規模 6.8', '2025-12-19T02:37', '2025-12-19T02:37', ['all'], '澄港地震觀測網',
      '震央位於鹽田區東南方 58.0 公里海域，深度 18.0 公里，新灣區最大震度 3 級。', ['留意後續海嘯警報。'],
      [['規模', 'M6.8'], ['深度', '18.0 km'], ['最大震度', '3 級（新灣區）']]),
    A('25-1120-01', 'utility', 'info', 'lifted', '溪洲區計畫性停水', '2025-11-20T22:00', '2025-11-21T05:00', ['xz'], '澄港市自來水處',
      '溪洲加壓站設備更新，溪洲區 3 里約 2,900 戶停水 7 小時。', ['請事先儲水。'],
      [['影響戶數', '約 2,900 戶']]),
    A('25-1109-01', 'quake', 'info', 'lifted', '地震報告：東北外海 規模 5.2', '2025-11-09T17:24', '2025-11-09T17:24', ['ba', 'gc'], '澄港地震觀測網',
      '震央位於北岸區東北方 47.6 公里海域，深度 41.5 公里，北岸區最大震度 3 級。', ['無須採取行動。'],
      [['規模', 'M5.2'], ['深度', '41.5 km'], ['最大震度', '3 級（北岸區）']])
  ];

  // 過去 12 個月發布則數（含未列入上表的小型有感地震與局部特報）；每格都 ≥ alerts 內同月同類型則數
  const stats = {
    months: ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
    counts: {
      quake:   [4, 3, 2, 5, 2, 1, 3, 2, 1, 3, 2, 4],
      rain:    [1, 0, 0, 0, 1, 2, 4, 5, 3, 4, 2, 3],
      debris:  [0, 0, 0, 0, 0, 0, 1, 2, 2, 0, 0, 2],
      typhoon: [0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 1],
      tsunami: [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      utility: [2, 1, 0, 2, 1, 0, 1, 1, 3, 2, 1, 2]
    },
    totals: { eocActivations: 6, evacuated: 213, maxIntensity: '4 級（2026-02-26 舊城區）' }
  };

  const quake = {
    id: '26-1022-02', time: '2026-10-22T21:47:16', mag: 4.6, depth: 12.4,
    epicenter: '澄港市政府東南東方 38.2 公里海域', felt: 1284,
    intensity: { gc: 3, xw: 3, yt: 3, ba: 2, jc: 2, xz: 2, sj: 2, yl: 1 }
  };

  const typhoon = {
    id: '26-1023-02', name: '岬燈', grade: '中度颱風', pressure: 955, wind: 43, windBft: 14, gust: 53, gustBft: 16,
    r7: 220, r10: 80, distance: 430, heading: '西北西', speed: 17,
    seaWarningAt: '2026-10-23T05:30', landWarningAt: '2026-10-24T08:30', closestAt: '2026-10-25T05:00',
    // 路徑座標為颱風小地圖（viewBox 0 0 400 260）上的點：past 已走、forecast 為 24/48/72 小時預測
    past: [[372, 236], [352, 222], [334, 210], [316, 197], [300, 186]],
    forecast: [{ at: '10/24 14:00', p: [262, 160], r: 22 }, { at: '10/25 14:00', p: [196, 116], r: 36 }, { at: '10/26 14:00', p: [140, 64], r: 52 }]
  };

  const S = (id, name, district, kind, x, y, cap, occ, status, access, pet, elder, hazards, elev, addr, phone, note) =>
    ({ id, name, district, kind, x, y, cap, occ, status, access, pet, elder, hazards, elev, addr, phone, note: note || '' });
  const shelters = [
    S('S-YL-01', '雲嶺國中活動中心', 'yl', 'indoor', 120, 300, 220, 74, 'open', true, false, true, ['quake', 'typhoon', 'rain', 'debris'], 412, '雲嶺區嶺頂路二段 88 號', '8270-6081', '土石流撤離主要收容點，設有醫護站。'),
    S('S-YL-02', '坪頂社區活動中心', 'yl', 'indoor', 200, 90, 80, 38, 'open', false, true, false, ['quake', 'typhoon'], 538, '雲嶺區坪頂里茶園路 12 號', '8270-6112', '位於坪頂溪保全範圍外。'),
    S('S-YL-03', '雲嶺溫泉國小', 'yl', 'indoor', 70, 520, 150, 0, 'standby', true, false, false, ['quake', 'typhoon', 'rain'], 286, '雲嶺區溫泉路 6 號', '8270-6135'),
    S('S-SJ-01', '山腳國小', 'sj', 'indoor', 300, 260, 300, 16, 'open', true, true, true, ['quake', 'typhoon', 'rain', 'debris'], 64, '山腳區山腳路 101 號', '8270-5021', '預防性撤離收容中，設有寵物安置區。'),
    S('S-SJ-02', '山腳區長青文康中心', 'sj', 'indoor', 420, 190, 90, 0, 'standby', true, false, true, ['quake', 'typhoon'], 58, '山腳區中山路 233 號', '8270-5046'),
    S('S-SJ-03', '茄苳里集會所', 'sj', 'indoor', 380, 300, 60, 0, 'closed', false, true, false, ['quake'], 41, '山腳區茄苳里成功街 7 號', '8270-5070', '屋頂整修中，暫停開設至 11/30。'),
    S('S-JC-01', '舊城國小', 'jc', 'indoor', 510, 190, 360, 0, 'standby', true, false, true, ['quake', 'typhoon', 'rain'], 22, '舊城區文廟路 15 號', '8270-3011'),
    S('S-JC-02', '鐘樓廣場', 'jc', 'outdoor', 560, 270, 1200, 0, 'standby', true, true, false, ['quake'], 18, '舊城區鐘樓街與中正路口', '1999', '戶外臨時避難集合點，僅供地震後短時間集合。'),
    S('S-JC-03', '澄港市立體育館', 'jc', 'indoor', 600, 180, 800, 0, 'standby', true, true, true, ['quake', 'typhoon', 'rain'], 25, '舊城區北門路 300 號', '8270-3058', '全市備援收容中心，可設置 120 張行軍床。'),
    S('S-GC-01', '港埕國中', 'gc', 'indoor', 650, 215, 420, 0, 'standby', true, false, true, ['quake', 'typhoon'], 12, '港埕區港埕大道 210 號', '8270-1021'),
    S('S-GC-02', '港埕市民活動中心', 'gc', 'indoor', 700, 262, 150, 0, 'standby', true, true, false, ['quake', 'typhoon'], 8, '港埕區海關路 9 號', '8270-1044'),
    S('S-GC-03', '澄港高中', 'gc', 'indoor', 650, 300, 520, 0, 'standby', true, true, true, ['quake', 'typhoon', 'tsunami'], 10, '港埕區學府路 1 號', '8270-1067', '海嘯垂直避難：請至 4 樓以上。'),
    S('S-BA-01', '北岸國小', 'ba', 'indoor', 420, 80, 260, 0, 'standby', true, false, true, ['quake', 'typhoon', 'tsunami'], 36, '北岸區濱海路 52 號', '8270-2015'),
    S('S-BA-02', '燈塔里活動中心', 'ba', 'indoor', 640, 50, 70, 0, 'closed', false, true, false, ['quake'], 6, '北岸區燈塔路 3 號', '8270-2038', '停電中，暫停開設。'),
    S('S-BA-03', '北岸運動公園', 'ba', 'outdoor', 530, 110, 2000, 0, 'standby', true, true, false, ['quake', 'tsunami'], 42, '北岸區運動公園路 1 號', '1999', '戶外臨時避難集合點。'),
    S('S-XW-01', '新灣國中', 'xw', 'indoor', 680, 380, 380, 0, 'standby', true, true, true, ['quake', 'typhoon', 'tsunami'], 5, '新灣區海埔路 66 號', '8270-4012', '海嘯垂直避難：請至 3 樓以上。'),
    S('S-XW-02', '新灣會展中心', 'xw', 'indoor', 790, 400, 1500, 0, 'standby', true, true, true, ['quake', 'typhoon', 'tsunami'], 4, '新灣區會展路 1 號', '8270-4030'),
    S('S-XW-03', '灣岸公園', 'xw', 'outdoor', 740, 420, 1000, 0, 'standby', true, true, false, ['quake'], 3, '新灣區灣岸路二段', '1999', '地震後臨時集合；海嘯警報時請勿前往。'),
    S('S-XZ-01', '溪洲國中', 'xz', 'indoor', 330, 380, 340, 0, 'standby', true, false, true, ['quake', 'typhoon'], 15, '溪洲區溪洲路 120 號', '8270-7016', '淹水時改用 2 樓以上教室。'),
    S('S-XZ-02', '溪洲區農會禮堂', 'xz', 'indoor', 470, 420, 120, 0, 'standby', false, true, false, ['quake', 'typhoon'], 11, '溪洲區農會街 8 號', '8270-7033'),
    S('S-XZ-03', '溪洲長青活動中心', 'xz', 'indoor', 560, 360, 100, 0, 'standby', true, false, true, ['quake', 'typhoon', 'rain'], 19, '溪洲區堤頂路 45 號', '8270-7048'),
    S('S-YT-01', '鹽田國小', 'yt', 'indoor', 300, 500, 280, 0, 'standby', true, true, false, ['quake', 'typhoon'], 7, '鹽田區鹽埕路 30 號', '8270-8011'),
    S('S-YT-02', '鹽埕里活動中心', 'yt', 'indoor', 520, 480, 90, 0, 'open', true, true, true, ['typhoon', 'rain'], 9, '鹽田區鹽埕里海堤街 2 號', '8270-8027', '颱風預防性開設，可隨時進住。'),
    S('S-YT-03', '鹽田海嘯避難塔', 'yt', 'tower', 600, 500, 300, 0, 'standby', true, false, false, ['tsunami'], 14, '鹽田區濱海公園內', '1999', '塔頂離地 18 公尺，附無障礙電梯。')
  ];
  const SHELTER_KIND = { indoor: '室內收容', outdoor: '戶外集合點', tower: '海嘯避難塔' };

  const user = { x: 540, y: 230, label: '目前位置（模擬）', addr: '舊城區鐘樓街 18 號附近' };

  const kitCats = [
    { key: 'water', name: '飲水糧食', glyph: 'water' },
    { key: 'light', name: '照明通訊', glyph: 'light' },
    { key: 'med',   name: '醫療衛生', glyph: 'medkit' },
    { key: 'docs',  name: '證件財物', glyph: 'docs' },
    { key: 'gear',  name: '衣物工具', glyph: 'clothes' },
    { key: 'care',  name: '特殊照護', glyph: 'baby' }
  ];
  const K = (id, cat, glyph, name, unit, base, per, grab, note) => ({ id, cat, glyph, name, unit, base, per, grab: !!grab, note: note || '' });
  const kit = [
    K('water',   'water', 'water',   '飲用水',             '公升', 0, { person: 9 }, true, '每人每天 3 公升，備 3 天。'),
    K('food',    'water', 'food',    '即食口糧／罐頭',     '份',   0, { person: 6 }, true, '免開火、易開罐，每人每天 2 份。'),
    K('light',   'light', 'light',   '手電筒',             '支',   1, { person: 0.5 }, true, '每 2 人 1 支，附備用電池。'),
    K('radio',   'light', 'radio',   '收音機',             '台',   1, {}, false, '手搖或電池式，停電時接收廣播。'),
    K('power',   'light', 'battery', '行動電源',           '顆',   1, { person: 0.5 }, false, '平時充飽，每 3 個月檢查。'),
    K('whistle', 'light', 'whistle', '哨子',               '個',   0, { person: 1 }, true, '受困時比喊叫省力。'),
    K('medkit',  'med',   'medkit',  '急救包',             '組',   1, {}, true, '紗布、繃帶、優碘、剪刀。'),
    K('meds',    'med',   'meds',    '個人常備藥（7 日份）', '份', 0, { person: 1 }, false, '慢性病藥物與處方箋影本。'),
    K('mask',    'med',   'mask',    '口罩',               '片',   0, { person: 10 }, false, '避難處所人多，降低感染。'),
    K('docs',    'docs',  'docs',    '證件影本（防水袋）', '份',   1, {}, true, '身分證、健保卡、存摺、保單影本。'),
    K('cash',    'docs',  'cash',    '小額現金',           '元',   1000, { person: 500 }, true, '百元鈔與零錢，停電時無法刷卡。'),
    K('clothes', 'gear',  'clothes', '保暖衣物與雨衣',     '套',   0, { person: 1 }, true, '輕便雨衣、外套、急救毯。'),
    K('infant',  'care',  'baby',    '奶粉／尿布',         '日份', 0, { infant: 3 }, false, '嬰幼兒 3 日份，含奶瓶與溫水。'),
    K('elder',   'care',  'elder',   '長者輔具與備用眼鏡', '組',   0, { elder: 1 }, false, '助行器、助聽器電池、老花眼鏡。'),
    K('pet',     'care',  'pet',     '寵物糧食與牽繩',     '日份', 0, { pet: 3 }, false, '外出籠、疫苗紀錄影本。')
  ];

  const phones = [
    { no: '119',       tel: '119',      name: '消防・救護',     desc: '火災、救護、受困、瓦斯外洩', tone: 'red' },
    { no: '110',       tel: '110',      name: '警察',           desc: '報案、交通事故、治安事件',   tone: 'blue' },
    { no: '112',       tel: '112',      name: '行動電話緊急',   desc: '無 SIM 卡或無訊號時仍可撥打', tone: 'yellow' },
    { no: '1999',      tel: '1999',     name: '澄港市民專線',   desc: '路樹倒塌、積水、停電通報（轉 6 防災）', tone: 'white' },
    { no: '8270-1190', tel: '82701190', name: '災害應變中心',   desc: '24 小時值勤・撤離協助登記', tone: 'green' }
  ];

  const stations = [
    { id: 'CG-03', name: '雲嶺', district: 'yl', site: '岩盤', noise: 0.055, micro: 0.05, amp: 0.8, range: 1.2 },
    { id: 'CG-01', name: '港埕', district: 'gc', site: '市區', noise: 0.11, micro: 0.07, amp: 1.25, range: 1.6 },
    { id: 'CG-05', name: '新灣', district: 'xw', site: '海埔地', noise: 0.08, micro: 0.11, amp: 1.6, range: 1.8 }
  ];

  const data = { city, districts, alerts, stats, quake, typhoon, shelters, user, kit, kitCats, phones, stations };

  /* ---------- 查詢與衍生 ---------- */
  const district = key => districts[key];
  const alertById = id => alerts.find(a => a.id === id);
  const shelterById = id => shelters.find(s => s.id === id);
  const activeAlerts = () => alerts.filter(a => a.status === 'active');
  const openShelters = () => shelters.filter(s => s.status === 'open');
  const alertsFor = key => alerts.filter(a => a.status !== 'lifted' && (a.districts.includes('all') || a.districts.includes(key)));
  const sheltersIn = key => shelters.filter(s => s.district === key);
  const districtNames = keys => (keys.includes('all') ? '全市' : keys.map(k => districts[k].name).join('、'));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 0.015;
  const walkMin = km => Math.max(1, Math.round(km / 4.5 * 60));

  function summary() {
    const open = openShelters();
    return {
      level: city.level,
      eoc: city.eoc,
      activeAlerts: activeAlerts().length,
      redDistricts: DISTRICT_ORDER.filter(k => districts[k].level === 'warning').length,
      openShelters: open.length,
      sheltered: open.reduce((n, s) => n + s.occ, 0),
      shelterCount: shelters.length
    };
  }

  function kitQty(item, hh) {
    const people = hh.adults + hh.children + hh.infants + hh.elders;
    const per = item.per;
    const q = item.base + (per.person || 0) * people + (per.infant || 0) * hh.infants + (per.elder || 0) * hh.elders + (per.pet || 0) * hh.pets;
    return Math.ceil(q);
  }

  function intensity(gal) {
    const steps = [0.8, 2.5, 8, 25, 80, 250, 400];
    let lv = 0;
    while (lv < steps.length && gal >= steps[lv]) lv++;
    return { level: lv, label: `${lv} 級` };
  }

  /* ---------- 圖示（24 格線條）---------- */
  const ICONS = {
    'arrow-r': '<path d="M4 12h15M13 6l6 6-6 6"/>',
    'arrow-l': '<path d="M20 12H5M11 6l-6 6 6 6"/>',
    'arrow-ur': '<path d="M7 17L17 7M9 7h8v8"/>',
    'chev-d': '<path d="M6 9l6 6 6-6"/>',
    'chev-r': '<path d="M9 6l6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    phone: '<path d="M5 3.5h4l2 5-2.5 1.6a11 11 0 0 0 5.4 5.4L15.5 13l5 2v4a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 3.5 5 1.5 1.5 0 0 1 5 3.5z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1.5M3 12h1.5M3 18h1.5"/>',
    map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
    grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
    copy: '<path d="M9 9h11v11H9z"/><path d="M5 15H4V4h11v1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    calendar: '<path d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    wave: '<path d="M2 12h4l2-6 3 12 3-14 3 10 2-4h3"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    home: '<path d="M3 11l9-8 9 8M5 9v12h14V9"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'
  };
  function icon(name, cls = '') {
    if (!ICONS[name]) throw new Error('App.icon: unknown ' + name);
    return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  }

  /* ---------- ISO 風格象形圖（64 格，粗線一致：5–6）----------
     圖形一律用 currentColor，外框（sign）透過 <g color> 決定前景色。 */
  const ST = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="currentColor"';
  const GLYPHS = {
    quake: `<g ${ST} stroke-width="5"><path d="M12 32 32 14 52 32"/><path d="M17 28v18h30V28"/><path d="M4 57l7-5 7 5 7-5 7 5 7-5 7 5 7-5 7 5"/></g><path ${ST} stroke-width="3.5" d="M33 18l-5 9 6 5-5 11"/>`,
    typhoon: `<g ${ST} stroke-width="5.5"><path d="M18 32a14 14 0 0 1 14-14c10 0 18-6 22-12"/><path d="M46 32a14 14 0 0 1-14 14c-10 0-18 6-22 12"/></g><circle ${F} cx="32" cy="32" r="6.5"/>`,
    rain: `<path ${F} d="M18 36a10 10 0 0 1 1-20 14 14 0 0 1 26 2 9 9 0 0 1 1 18z"/><path ${ST} stroke-width="5" d="M20 44l-4 10M32 44l-4 10M44 44l-4 10"/>`,
    debris: `<path ${F} d="M4 22l56 36H4z"/><circle ${F} cx="25" cy="24" r="6"/><circle ${F} cx="41" cy="35" r="5"/><circle ${F} cx="53" cy="44" r="3.8"/>`,
    tsunami: `<path ${F} d="M4 58V44C10 28 22 14 40 12c12-1 20 6 20 14-6-4-16-4-20 4s2 16 12 16h8v12z"/>`,
    utility: `<path ${F} d="M20 9S6 27 6 37a14 14 0 0 0 28 0C34 27 20 9 20 9z"/><path ${F} d="M48 4 37 32h10l-6 28 19-34H50l6-22z"/>`,
    flood: `<g ${ST} stroke-width="5"><path d="M13 30 32 13l19 17"/><path d="M19 25v12M45 25v12"/><path d="M5 45c6.5-5 13-5 13.5 0s7 5 13.5 0 7-5 13.5 0 7 5 13.5 0"/><path d="M5 56c6.5-5 13-5 13.5 0s7 5 13.5 0 7-5 13.5 0 7 5 13.5 0"/></g>`,
    fire: `<path ${F} d="M32 4c2 12 16 18 16 34 0 12-8 20-16 20-9 0-16-7-16-17 0-9 6-14 8-23 5 5 6 11 5 17 6-5 7-15 3-31z"/>`,
    shelter: `<path ${ST} stroke-width="5" d="M6 30 32 8l26 22M12 25v33h40V25"/><circle ${F} cx="32" cy="31" r="5.5"/><path ${F} d="M24 58V45a8 8 0 0 1 16 0v13z"/>`,
    evac: `<circle ${F} cx="37" cy="10" r="6.5"/><g ${ST} stroke-width="6.5"><path d="M31 22l-7 16"/><path d="M30 23l-10 5-6-4M30 23l8 7 8-4"/><path d="M24 38l10 8-2 12M24 38l-8 10H6"/></g>`,
    assembly: `<path ${F} d="M3 3h15L3 18zM61 3v15L46 3zM3 61V46l15 15zM61 61H46l15-15z"/><circle ${F} cx="17" cy="31" r="4.5"/><circle ${F} cx="32" cy="25" r="5.5"/><circle ${F} cx="47" cy="31" r="4.5"/><path ${F} d="M11 49v-8a6 6 0 0 1 12 0v8zM25 49V37a7 7 0 0 1 14 0v12zM41 49v-8a6 6 0 0 1 12 0v8z"/>`,
    firstaid: `<path ${F} d="M24 6h16v18h18v16H40v18H24V40H6V24h18z"/>`,
    aed: `<path ${ST} stroke-width="5" d="M32 56C14 44 6 34 6 24 6 14 14 8 21 8c5 0 9 3 11 7 2-4 6-7 11-7 7 0 15 6 15 16 0 10-8 20-26 32z"/><path ${F} d="M35 14 23 34h8l-4 14 15-21h-8l4-13z"/>`,
    phone: `<path ${F} d="M18 6h8l4 12-6 5c3 8 9 14 17 17l5-6 12 4v8c0 6-4 12-10 12C26 56 8 38 6 16c0-6 6-10 12-10z"/>`,
    access: `<circle ${F} cx="28" cy="9" r="6"/><g ${ST} stroke-width="5"><path d="M28 20v16h16l6 16"/><path d="M28 27h12"/><path d="M20 30a15 15 0 1 0 22 19"/></g>`,
    pet: `<ellipse ${F} cx="32" cy="43" rx="13" ry="11"/><ellipse ${F} cx="14" cy="29" rx="5.5" ry="7" transform="rotate(-22 14 29)"/><ellipse ${F} cx="25" cy="16" rx="5.5" ry="7.5"/><ellipse ${F} cx="39" cy="16" rx="5.5" ry="7.5"/><ellipse ${F} cx="50" cy="29" rx="5.5" ry="7" transform="rotate(22 50 29)"/>`,
    elder: `<circle ${F} cx="27" cy="9" r="6"/><g ${ST} stroke-width="6"><path d="M27 20c-3 7-3 13-2 20"/><path d="M26 25l11 7"/><path d="M25 40l-5 18M25 40l7 18"/></g><path ${ST} stroke-width="4" d="M38 31c2-2 5-1 5 2v25"/>`,
    baby: `<g ${ST} stroke-width="5"><path d="M21 23h22v31a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4z"/><path d="M26 23v-6h12v6"/></g><path ${F} d="M28 17c0-9 8-9 8 0z"/><path ${ST} stroke-width="3.5" d="M21 34h9M21 44h9"/>`,
    water: `<path ${ST} stroke-width="5" d="M24 6h16v6l6 8v36a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V20l6-8z"/><path ${F} d="M32 28s-8 10-8 15a8 8 0 0 0 16 0c0-5-8-15-8-15z"/>`,
    food: `<g ${ST} stroke-width="5"><ellipse cx="32" cy="16" rx="18" ry="6"/><path d="M14 16v32c0 4 8 8 18 8s18-4 18-8V16"/></g><path ${F} d="M14 28h36v12H14z"/>`,
    light: `<rect ${F} x="4" y="26" width="27" height="13" rx="3"/><path ${F} d="M30 20h12a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H30z"/><path ${F} d="M12 21h8v5h-8z"/><path ${ST} stroke-width="4" d="M51 22l8-5M51 32.5h9M51 43l8 5"/>`,
    radio: `<rect ${ST} stroke-width="5" x="6" y="22" width="52" height="34" rx="3"/><path ${ST} stroke-width="4" d="M16 22 44 7"/><circle ${F} cx="22" cy="39" r="8"/><path ${ST} stroke-width="4" d="M37 33h13M37 41h13M37 49h13"/>`,
    battery: `<rect ${ST} stroke-width="5" x="5" y="18" width="46" height="28" rx="3"/><path ${F} d="M51 26h8v12h-8z"/><path ${F} d="M31 21 18 34h10l-4 9 14-13H28z"/>`,
    medkit: `<rect ${ST} stroke-width="5" x="6" y="18" width="52" height="38" rx="3"/><path ${ST} stroke-width="5" d="M24 18v-8h16v8"/><path ${F} d="M28 26h8v7h7v8h-7v7h-8v-7h-7v-8h7z"/>`,
    meds: `<g transform="rotate(-40 32 32)"><rect ${ST} stroke-width="5" x="9" y="21" width="46" height="22" rx="11"/><path ${F} d="M32 21h12a11 11 0 0 1 0 22H32z"/></g>`,
    docs: `<rect ${ST} stroke-width="5" x="6" y="13" width="52" height="40" rx="3"/><circle ${F} cx="21" cy="29" r="6"/><path ${F} d="M12 46a9 9 0 0 1 18 0z"/><path ${ST} stroke-width="4" d="M36 26h14M36 34h14M36 42h9"/>`,
    cash: `<rect ${ST} stroke-width="5" x="4" y="16" width="56" height="32" rx="2"/><circle ${ST} stroke-width="4" cx="32" cy="32" r="8"/><path ${F} d="M10 22h7v5h-7zM47 37h7v5h-7z"/>`,
    whistle: `<circle ${F} cx="22" cy="38" r="16"/><path ${F} d="M22 22h36v12H32z"/><path ${ST} stroke-width="4" d="M42 13l4-7M52 15l6-5"/>`,
    clothes: `<path ${F} d="M22 6l10 8 10-8 16 10-6 14-6-3v31H18V27l-6 3L6 16z"/>`,
    mask: `<path ${ST} stroke-width="5" d="M14 22c10-4 26-4 36 0v18c-10 8-26 8-36 0z"/><path ${ST} stroke-width="4" d="M14 26c-8 0-10 10 0 12M50 26c8 0 10 10 0 12M21 30h22M21 37h22"/>`
  };

  const FRAMES = {
    // [背景圖形, 圖形前景色, 圖形變換]
    warning: ['<path d="M32 4.5 61.5 57h-59z" fill="#111" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M32 14.5 53 51.5H11z" fill="#FFD100" stroke="#FFD100" stroke-width="2" stroke-linejoin="round"/>', '#111', 'translate(20.5 27) scale(.36)'],
    safe: ['<rect x="2" y="2" width="60" height="60" rx="3" fill="#009A44"/>', '#fff', 'translate(10 10) scale(.6875)'],
    fire: ['<rect x="2" y="2" width="60" height="60" rx="3" fill="#E1251B"/>', '#fff', 'translate(10 10) scale(.6875)'],
    info: ['<rect x="2" y="2" width="60" height="60" rx="3" fill="#005EB8"/>', '#fff', 'translate(10 10) scale(.6875)'],
    ink: ['<rect x="2" y="2" width="60" height="60" rx="3" fill="#111"/>', '#FFD100', 'translate(10 10) scale(.6875)'],
    mandatory: ['<circle cx="32" cy="32" r="30" fill="#005EB8"/>', '#fff', 'translate(14 14) scale(.5625)'],
    plain: ['', null, '']
  };
  function sign(glyph, frame = 'warning', opts = {}) {
    if (!GLYPHS[glyph]) throw new Error('App.sign: unknown glyph ' + glyph);
    const [bg, fg, tf] = FRAMES[frame];
    const a11y = opts.label ? `role="img" aria-label="${esc(opts.label)}"` : 'aria-hidden="true"';
    const g = fg ? `<g color="${fg}" transform="${tf}">${GLYPHS[glyph]}</g>` : GLYPHS[glyph];
    return `<svg class="sign sign--${frame} ${opts.cls || ''}" viewBox="0 0 64 64" ${a11y} focusable="false">${bg}${g}</svg>`;
  }
  const hazardSign = (type, cls = '') => sign(HAZARDS[type].glyph, 'warning', { cls });

  /* ---------- 徽章與標籤 ---------- */
  // 等級形狀：平時方、資訊圓、注意三角、警戒八角 —— 色盲或黑白列印時仍可分辨
  // 12 格 viewBox；方與圓略放大，視覺面積才和三角、八角相當。各頁的等級標記與標誌牌一律用這份
  const LEVEL_SHAPES = {
    normal: '<rect x="1.5" y="1.5" width="9" height="9"/>',
    info: '<circle cx="6" cy="6" r="4.8"/>',
    advisory: '<path d="M6 1 11.2 10.5H.8z"/>',
    warning: '<path d="M4 1h4l3 3v4l-3 3H4L1 8V4z"/>'
  };
  function levelBadge(level, opts = {}) {
    const L = LEVELS[level];
    const size = opts.size ? ` level--${opts.size}` : '';
    const en = opts.en ? `<span class="level__en">${L.en}</span>` : '';
    return `<span class="level level--${level}${size}"><svg class="level__shape" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">${LEVEL_SHAPES[level]}</svg>${L.name}${en}</span>`;
  }
  // 生效中的閃爍點是無限動畫：帶 data-loop，插入後 App.scan() 會讓它離開視窗時暫停
  const statusTag = status => `<span class="status status--${status}"${status === 'active' ? ' data-loop' : ''}>${STATUS[status].name}</span>`;
  const hzTag = type => `<span class="hz-tag hz-tag--${type}">${sign(HAZARDS[type].glyph, 'plain', { cls: 'hz-tag__glyph' })}${HAZARDS[type].name}</span>`;

  function featTags(s) {
    const f = (on, glyph, label) =>
      `<span class="feat${on ? '' : ' is-off'}" title="${label}${on ? '' : '：不提供'}">${sign(glyph, 'plain', { cls: 'feat__glyph' })}<span class="feat__txt">${label}</span><span class="sr-only">${on ? '提供' : '不提供'}</span></span>`;
    return `<span class="feats">${f(s.access, 'access', '無障礙')}${f(s.pet, 'pet', '寵物友善')}${f(s.elder, 'elder', '長者照護')}</span>`;
  }

  function capBar(s) {
    const ratio = s.cap ? s.occ / s.cap : 0;
    const state = s.status !== 'open' ? 'idle' : ratio >= 0.9 ? 'full' : ratio >= 0.6 ? 'busy' : 'ok';
    const label = s.status === 'open' ? `收容 ${s.occ} / ${s.cap} 人` : `容量 ${fmt.num(s.cap)} 人（${STATUS[s.status].name}）`;
    const w = s.status === 'open' ? Math.max(ratio * 100, s.occ ? 2 : 0) : 0;
    return `<div class="cap cap--${state}" role="img" aria-label="${label}"><div class="cap__bar"><i style="width:${w.toFixed(1)}%"></i></div>` +
      `<div class="cap__txt">${s.status === 'open' ? `<b>${s.occ}</b> / ${fmt.num(s.cap)} 人` : `容量 <b>${fmt.num(s.cap)}</b> 人`}</div></div>`;
  }

  function alertRowHTML(a, opts = {}) {
    const H = HAZARDS[a.type];
    const time = a.window ? `${fmt.dt(a.window[0])} 起` : fmt.dt(a.issued);
    return `<button class="alert-row alert-row--${a.level}${a.status === 'lifted' ? ' is-lifted' : ''}" type="button" data-alert="${a.id}">` +
      `<span class="alert-row__sign">${hazardSign(a.type)}</span>` +
      `<span class="alert-row__main"><span class="alert-row__meta"><span class="alert-row__id">${a.id}</span>${H.name} · ${districtNames(a.districts)}</span>` +
      `<span class="alert-row__title">${esc(a.title)}</span></span>` +
      `<span class="alert-row__side">${levelBadge(a.level, { size: 'sm' })}${opts.showStatus === false ? '' : statusTag(a.status)}<time datetime="${a.window ? a.window[0] : a.issued}">${time}</time></span>` +
      `</button>`;
  }

  function shelterCardHTML(s, opts = {}) {
    const km = opts.km != null ? opts.km : distance(s, user);
    const rank = opts.rank ? `<span class="shelter-card__rank">${opts.rank}</span>` : '';
    return `<article class="shelter-card shelter-card--${s.status}" data-shelter="${s.id}">` +
      `<div class="shelter-card__head">${rank}<span class="shelter-card__id">${s.id}</span>${statusTag(s.status)}</div>` +
      `<h3 class="shelter-card__name">${esc(s.name)}</h3>` +
      `<p class="shelter-card__meta">${districts[s.district].name} · ${SHELTER_KIND[s.kind]}</p>` +
      `<p class="shelter-card__dist"><b>${fmt.km(km)}</b><span>步行約 ${walkMin(km)} 分</span></p>` +
      capBar(s) + featTags(s) + `</article>`;
  }

  /* ---------- 地圖 ---------- */
  const GEO = {
    viewBox: '0 0 1000 640',
    sea: '690,0 1000,0 1000,640 340,640 340,610 420,530 640,530 720,450 860,450 860,330 760,330 720,290 770,250 770,150 690,70',
    districts: {
      yl: { points: '0,0 300,0 300,150 230,220 230,450 150,530 150,640 0,640', label: [108, 230] },
      ba: { points: '300,0 690,0 690,70 770,150 300,150', label: [474, 64] },
      sj: { points: '300,150 470,150 470,330 230,330 230,220', label: [352, 208] },
      jc: { points: '470,150 620,150 620,330 470,330', label: [545, 310] },
      gc: { points: '620,150 770,150 770,250 720,290 760,330 620,330', label: [706, 180] },
      xw: { points: '620,330 860,330 860,450 620,450', label: [772, 360] },
      xz: { points: '230,330 620,330 620,450 230,450', label: [410, 392] },
      yt: { points: '230,450 720,450 640,530 420,530 340,610 340,640 150,640 150,530', label: [384, 492] }
    },
    river: 'M38 88 L118 160 L180 262 L262 362 L404 392 L540 400 L600 460 L652 512',
    mountains: [[52, 120], [170, 170], [64, 400], [180, 380], [40, 300], [220, 34]],
    roads: [
      { d: 'M230 240 H760', name: '港埕大道' },
      { d: 'M560 0 V530', name: '中正路' },
      { d: 'M300 150 L230 220 V450', name: '環山快速道路' }
    ]
  };
  let mapSeq = 0;
  function cityMap(svg, opts = {}) {
    const mode = opts.mode || 'status';
    const id = 'cm' + (++mapSeq);
    const roads = opts.roads != null ? opts.roads : mode === 'plain';
    const labels = opts.labels !== false;
    const fillFor = key => (mode === 'status' ? LEVELS[districts[key].level].color : '#F4F4F1');
    svg.setAttribute('viewBox', GEO.viewBox);
    svg.classList.add('map-svg');
    // 地圖是滑鼠的捷徑；鍵盤與輔助科技請在頁面上提供等價的 HTML 按鈕或下拉選單
    svg.setAttribute('role', 'img');
    // 目前位置的脈動圈與路線虛線都是無限動畫，整張地圖離開視窗時一起暫停
    svg.setAttribute('data-loop', '');
    loopIO.observe(svg);

    const defs = `<defs>
      <pattern id="${id}-sea" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#D9E6F4"/><path d="M0 0V14" stroke="#9DBBE0" stroke-width="2"/></pattern>
      <pattern id="${id}-hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d="M0 0V16" stroke="#111" stroke-width="5" stroke-opacity=".28"/></pattern>
    </defs>`;
    const sea = `<rect x="0" y="0" width="1000" height="640" fill="#fff"/><polygon points="${GEO.sea}" fill="url(#${id}-sea)"/>`;
    const dist = DISTRICT_ORDER.map(k => {
      const d = GEO.districts[k], D = districts[k];
      const hatch = mode === 'status' && D.level === 'warning' ? `<polygon points="${d.points}" fill="url(#${id}-hatch)"/>` : '';
      return `<g class="map-d" data-district="${k}">` +
        `<polygon class="map-d__fill" points="${d.points}" fill="${fillFor(k)}" stroke="#111" stroke-width="${mode === 'status' ? 3 : 2}" stroke-linejoin="round"/>${hatch}` +
        `<polygon class="map-d__hi" points="${d.points}" fill="none" stroke="#111" stroke-width="9" stroke-linejoin="round"/></g>`;
    }).join('');
    const mtn = GEO.mountains.map(([x, y]) =>
      `<path d="M${x} ${y}l12-18 12 18" fill="none" stroke="#111" stroke-width="2.5" stroke-linejoin="round" opacity=".55"/>`).join('');
    const river = `<path d="${GEO.river}" fill="none" stroke="#fff" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="${GEO.river}" fill="none" stroke="#005EB8" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`;
    const road = roads ? GEO.roads.map(r =>
      `<path d="${r.d}" fill="none" stroke="#8A8A84" stroke-width="10" stroke-linejoin="round"/><path d="${r.d}" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>`).join('') : '';
    const lab = labels ? DISTRICT_ORDER.map(k => {
      const [x, y] = GEO.districts[k].label, D = districts[k];
      const sub = mode === 'status' ? `${D.code} · ${LEVELS[D.level].name}` : D.code;
      // 外層只負責定位、內層負責大小：手機版用 CSS 放大內層，不會蓋掉定位用的 transform 屬性
      return `<g class="map-label" transform="translate(${x} ${y})"><g class="map-label__box"><rect x="-44" y="-21" width="88" height="42" fill="#fff" stroke="#111" stroke-width="2.5"/>` +
        `<text class="map-label__name" y="-1" text-anchor="middle" font-size="17" font-weight="900" fill="#111">${D.name}</text>` +
        `<text y="15" text-anchor="middle" font-size="11" font-weight="500" fill="#111" class="map-label__sub">${sub}</text></g></g>`;
    }).join('') +
      `<text class="map-label__geo" x="250" y="300" font-size="15" font-weight="700" fill="#005EB8" transform="rotate(52 250 300)">澄溪</text>` +
      `<text class="map-label__geo" x="900" y="230" text-anchor="middle" font-size="18" font-weight="900" fill="#005EB8">澄港灣</text>` +
      `<text class="map-label__geo map-label__en" x="900" y="250" text-anchor="middle" font-size="11" font-weight="700" fill="#005EB8" letter-spacing="2">CHENGGANG BAY</text>` : '';
    const compass = `<g transform="translate(948 560)" aria-hidden="true"><circle r="24" fill="#fff" stroke="#111" stroke-width="2.5"/><path d="M0-18 7 6 0 1-7 6z" fill="#111"/><text y="-28" text-anchor="middle" font-size="13" font-weight="700" fill="#111">N</text></g>` +
      `<g transform="translate(830 612)" aria-hidden="true"><path d="M0 0h100" stroke="#111" stroke-width="6"/><path d="M0 0h50" stroke="#fff" stroke-width="3"/><text x="0" y="-8" font-size="11" fill="#111">0</text><text x="100" y="-8" text-anchor="end" font-size="11" fill="#111">1.5 km</text></g>`;
    const usr = opts.user ? `<g class="map-user" transform="translate(${user.x} ${user.y})"><circle class="map-user__ring" r="16" fill="#005EB8" opacity=".25"/><circle r="9" fill="#005EB8" stroke="#fff" stroke-width="3"/></g>` : '';

    svg.innerHTML = defs + sea + `<g class="map-ds">${dist}</g>` + `<g aria-hidden="true">${mtn}${river}${road}</g>` +
      `<g class="map-routes" aria-hidden="true"></g>` + `<g class="map-labels" aria-hidden="true">${lab}</g>` + compass +
      `<g class="map-markers"></g>` + usr;

    const groups = qsa('.map-d', svg);
    const layer = qs('.map-ds', svg);
    function select(key) {
      groups.forEach(g => {
        const on = g.dataset.district === key;
        g.classList.toggle('is-selected', on);
        if (mode === 'plain') qs('.map-d__fill', g).setAttribute('fill', on ? '#FFE680' : '#F4F4F1');
        if (on) layer.appendChild(g); // 被選取的區移到最上層，粗外框才不會被鄰區蓋住
      });
    }
    groups.forEach(g => g.addEventListener('click', () => opts.onSelect && opts.onSelect(g.dataset.district)));
    if (opts.selected) select(opts.selected);
    return { svg, select, markers: qs('.map-markers', svg), routes: qs('.map-routes', svg), point: (x, y) => ({ x, y }) };
  }

  /* ---------- 動態基礎 ---------- */
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const loops = new Set();
  function animate(el, fn) {
    let visible = false, raf = 0, last = 0, stopped = false;
    const running = () => !stopped && visible && !document.hidden && !mqReduce.matches;
    function frame(ts) {
      raf = 0;
      if (!running()) { last = 0; return; }
      const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
      last = ts;
      fn(ts / 1000, dt);
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (running() && !raf) raf = requestAnimationFrame(frame); }
    const io = new IntersectionObserver(entries => { visible = entries[entries.length - 1].isIntersecting; kick(); });
    io.observe(el);
    const handle = { kick, stop() { stopped = true; io.disconnect(); loops.delete(handle); if (raf) cancelAnimationFrame(raf); raf = 0; } };
    loops.add(handle);
    return handle;
  }
  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('is-hidden', document.hidden);
    loops.forEach(l => l.kick());
  });
  mqReduce.addEventListener('change', () => loops.forEach(l => l.kick()));

  // CSS 無限動畫（斜紋、燈號、路線虛線、偽元素）離開視窗時暫停
  const loopIO = new IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle('is-paused', !e.isIntersecting)));

  /* ---------- 地震波形引擎 ---------- */
  const SPS = 30, PX_PER_SEC = 62, TAU = Math.PI * 2;
  const CHANNELS = [
    { id: 'HHZ', p: 1, s: 0.62, color: '#FFD100', w: 1.8 },
    { id: 'HHN', p: 0.42, s: 1, color: '#EDEDE8', w: 1.2 },
    { id: 'HHE', p: 0.36, s: 0.88, color: '#EDEDE8', w: 1.2 }
  ];
  function gauss() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  function seismo(root, opts = {}) {
    const svg = qs('svg', root);
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent && parent.appendChild(el); return el; };
    let st = stations[opts.station || 0];
    let W = 0, H = 0, cap = 0, chH = 0;
    let bufs = CHANNELS.map(() => []), ar = CHANNELS.map(() => 0), kLast = 0;
    const events = [];
    const startWall = now().getTime();
    const simNow = () => (now().getTime() - startWall) / 1000;
    let t = 0, lastWall = 0, nextAuto = opts.firstEventAt != null ? opts.firstEventAt : 10, nextIsBig = true;
    let paused = false, tickAcc = 0;
    let gGrid, paths, gPicks, gTicks, heads, labels;

    function makeEvent(t0, peak, notify) {
      const e = {
        t0, peak, notify, fired: !notify, sp: rnd(2.6, 4.6), decay: rnd(0.32, 0.55),
        f: CHANNELS.map(() => rnd(2.6, 6.5)), f2: CHANNELS.map(() => rnd(7, 11)),
        ph: CHANNELS.map(() => rnd(0, TAU)), ph2: CHANNELS.map(() => rnd(0, TAU)), els: null
      };
      events.push(e);
      return e;
    }
    function evalEvent(e, tk, c) {
      const dt = tk - e.t0;
      if (dt < 0 || dt > e.sp + 18) return 0;
      const amp = e.peak * st.amp, ch = CHANNELS[c];
      const pPart = amp * 0.3 * ch.p * (1 - Math.exp(-dt * 9)) * Math.exp(-dt * 0.25);
      let env = pPart;
      if (dt >= e.sp) {
        const d = dt - e.sp;
        env = pPart * Math.exp(-d * 2) + amp * ch.s * (1 - Math.exp(-d * 6)) * Math.exp(-d * e.decay);
      }
      // 載波峰值約 1，讓畫面上量到的 PGA 與偵測當下的估計值一致
      const carrier = Math.sin(TAU * e.f[c] * dt + e.ph[c]) * 0.6 + Math.sin(TAU * e.f2[c] * dt + e.ph2[c]) * 0.3 + gauss() * 0.1;
      return env * carrier;
    }
    function sample(k) {
      const tk = k / SPS;
      CHANNELS.forEach((ch, c) => {
        ar[c] = 0.78 * ar[c] + gauss() * st.noise;
        const micro = st.micro * (Math.sin(TAU * 0.21 * tk + c * 1.7) + 0.6 * Math.sin(TAU * 0.43 * tk + c * 2.9));
        let v = micro + ar[c];
        for (const e of events) v += evalEvent(e, tk, c);
        const b = bufs[c];
        b.push(v);
        if (b.length > cap) b.splice(0, b.length - cap);
      });
      kLast = k;
    }
    // 重新生成整個視窗（初次、換測站、離開視窗回來時）——讓時間軸永遠對得上故事時鐘
    function rebuild(tEnd) {
      bufs = CHANNELS.map(() => []);
      ar = CHANNELS.map(() => 0);
      const kEnd = Math.floor(tEnd * SPS);
      for (let k = kEnd - cap + 1; k <= kEnd; k++) sample(k);
    }

    function layout() {
      const r = svg.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h || (w === W && h === H)) return false;
      W = w; H = h;
      cap = Math.ceil(W / PX_PER_SEC * SPS) + 6;
      chH = (H - 30) / CHANNELS.length;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.textContent = '';
      gGrid = mk('g', { 'aria-hidden': 'true' }, svg);
      for (let x = W - 4; x > 0; x -= 40) mk('line', { x1: x, x2: x, y1: 0, y2: H - 30, stroke: '#232323', 'stroke-width': 1 }, gGrid);
      for (let i = 0; i <= CHANNELS.length; i++) mk('line', { x1: 0, x2: W, y1: i * chH, y2: i * chH, stroke: '#2E2E2E', 'stroke-width': 1 }, gGrid);
      gPicks = mk('g', {}, svg);
      paths = CHANNELS.map((ch, c) => {
        mk('line', { x1: 0, x2: W, y1: chH * (c + 0.5), y2: chH * (c + 0.5), stroke: '#3A3A3A', 'stroke-width': 1, 'stroke-dasharray': '2 6' }, gGrid);
        return mk('path', { d: '', fill: 'none', stroke: ch.color, 'stroke-width': ch.w, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, svg);
      });
      heads = CHANNELS.map(ch => mk('path', { d: 'M0 0 8 -5 8 5z', fill: ch.color }, svg));
      labels = CHANNELS.map((ch, c) => {
        const g = mk('g', { transform: `translate(10 ${c * chH + 16})` }, svg);
        mk('rect', { x: -4, y: -11, width: 92, height: 15, fill: '#111' }, g);
        const tx = mk('text', { x: 0, y: 0, fill: c ? '#BDBDB6' : '#FFD100', 'font-size': 11, 'font-weight': 700, class: 'sz-text' }, g);
        return tx;
      });
      mk('line', { x1: 0, x2: W, y1: H - 30, y2: H - 30, stroke: '#555', 'stroke-width': 1 }, svg);
      gTicks = mk('g', {}, svg);
      events.forEach(e => { e.els = null; });
      setLabels();
      return true;
    }
    function setLabels() { if (labels) labels.forEach((tx, c) => { tx.textContent = `${CHANNELS[c].id} · ±${st.range} gal`; }); }

    const yOf = (v, c) => chH * (c + 0.5) - (Math.tanh(v / st.range * 0.9) / 0.716) * (chH / 2 * 0.62);
    const xOf = k => W - 10 - (t - k / SPS) * PX_PER_SEC;

    function draw() {
      if (!W) return;
      CHANNELS.forEach((ch, c) => {
        const b = bufs[c], n = b.length;
        let d = '';
        for (let i = 0; i < n; i++) {
          const x = xOf(kLast - (n - 1 - i));
          if (x < -4) continue;
          d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + yOf(b[i], c).toFixed(1);
        }
        paths[c].setAttribute('d', d);
        heads[c].setAttribute('transform', `translate(${(xOf(kLast) + 2).toFixed(1)} ${yOf(b[n - 1] || 0, c).toFixed(1)})`);
      });
      // P/S 波到時標記與強震動區段
      const yBot = H - 30;
      for (const e of events) {
        const xp = W - 10 - (t - e.t0) * PX_PER_SEC, xs = xp + e.sp * PX_PER_SEC;
        if (xp > W || xs + 8 * PX_PER_SEC < 0) { if (e.els) { e.els.g.remove(); e.els = null; } continue; }
        if (!e.els) {
          const g = mk('g', {}, gPicks);
          const strong = intensity(e.peak * st.amp).level >= 2;
          const band = mk('rect', { y: 0, height: yBot, fill: strong ? '#E1251B' : '#FFD100', opacity: strong ? 0.18 : 0.08 }, g);
          const lp = mk('line', { y1: 0, y2: yBot, stroke: '#FFD100', 'stroke-width': 1.5, 'stroke-dasharray': '4 4' }, g);
          const ls = mk('line', { y1: 0, y2: yBot, stroke: '#E1251B', 'stroke-width': 2 }, g);
          const tp = mk('g', {}, g); mk('rect', { x: 0, y: 0, width: 16, height: 16, fill: '#FFD100' }, tp); mk('text', { x: 8, y: 12, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#111', class: 'sz-text' }, tp).textContent = 'P';
          const ts = mk('g', {}, g); mk('rect', { x: 0, y: 0, width: 16, height: 16, fill: '#E1251B' }, ts); mk('text', { x: 8, y: 12, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff', class: 'sz-text' }, ts).textContent = 'S';
          e.els = { g, band, lp, ls, tp, ts };
        }
        const visibleS = xs <= W - 10;
        e.els.lp.setAttribute('x1', xp); e.els.lp.setAttribute('x2', xp);
        e.els.tp.setAttribute('transform', `translate(${xp - 8} ${yBot - 18})`);
        e.els.ls.setAttribute('x1', xs); e.els.ls.setAttribute('x2', xs);
        e.els.ts.setAttribute('transform', `translate(${xs - 8} ${yBot - 18})`);
        e.els.ls.setAttribute('opacity', visibleS ? 1 : 0); e.els.ts.setAttribute('opacity', visibleS ? 1 : 0);
        const bandEnd = Math.min(W - 10, xs + 7 * PX_PER_SEC);
        e.els.band.setAttribute('x', xs); e.els.band.setAttribute('width', Math.max(0, bandEnd - xs));
      }
      // 時間軸：每秒一刻度、每 2 秒一個時間標籤
      gTicks.textContent = '';
      const tStart = t - W / PX_PER_SEC;
      for (let s = Math.ceil(tStart); s <= t; s++) {
        const x = W - 10 - (t - s) * PX_PER_SEC;
        const major = s % 2 === 0;
        mk('line', { x1: x, x2: x, y1: yBot, y2: yBot + (major ? 8 : 4), stroke: '#777', 'stroke-width': 1 }, gTicks);
        if (major && x > 30 && x < W - 30) {
          mk('text', { x, y: H - 8, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#9A9A93', class: 'sz-text' }, gTicks).textContent = fmt.time(new Date(startWall + s * 1000));
        }
      }
    }

    function peakNow() {
      const n = Math.min(SPS, bufs[0].length);
      let m = 0;
      for (const b of bufs) for (let i = b.length - n; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
      return m;
    }
    function fire(e, arrived) {
      e.fired = true;
      const peakGal = e.peak * st.amp;
      opts.onEvent && opts.onEvent({
        time: new Date(startWall + e.t0 * 1000), station: st, peak: peakGal,
        intensity: intensity(peakGal), sp: e.sp, prefill: !!e.prefill, arrived: !!arrived
      });
    }

    function step(dt) {
      const wallT = simNow();
      // 離開視窗 / 暫停後回來：直接跳回「現在」重建，不補算中間的樣本
      if (wallT - t > 0.4) {
        t = wallT;
        if (nextAuto < t) nextAuto = t + rnd(6, 14);
        rebuild(t);
      } else {
        t = wallT;
        const kTarget = Math.floor(t * SPS);
        while (kLast < kTarget) sample(kLast + 1);
      }
      if (t >= nextAuto) {
        const big = nextIsBig;
        makeEvent(t, big ? rnd(5, 11) : rnd(0.9, 2.1), true);
        nextIsBig = Math.random() < 0.3;
        nextAuto = t + rnd(18, 36);
      }
      for (const e of events) if (!e.fired && t >= e.t0) fire(e);
      for (let i = events.length - 1; i >= 0; i--) if (t - events[i].t0 > events[i].sp + 30) { if (events[i].els) events[i].els.g.remove(); events.splice(i, 1); }
      draw();
      tickAcc += dt;
      if (tickAcc >= 0.25 && opts.onTick) { tickAcc = 0; const pga = peakNow(); opts.onTick({ pga, intensity: intensity(pga) }); }
    }

    // 初次：預填一段視窗，含一筆 6 秒前的微小地動，讓靜態畫面也有起伏
    layout();
    makeEvent(-5.5, 1.5, true).prefill = true;
    rebuild(0);
    for (const e of events) if (!e.fired && 0 >= e.t0) fire(e);
    draw();
    if (opts.onTick) { const pga = peakNow(); opts.onTick({ pga, intensity: intensity(pga) }); }

    new ResizeObserver(() => { if (layout()) { rebuild(t); draw(); } }).observe(svg);
    const loop = animate(root, (_, dt) => { if (!paused) step(dt); });

    return {
      get paused() { return paused; },
      get station() { return st; },
      pause(on) { paused = !!on; if (!paused) loop.kick(); },
      setStation(i) { st = stations[i]; setLabels(); rebuild(t); draw(); },
      trigger(peak) {
        const p = peak || rnd(4, 10);
        if (mqReduce.matches || paused) {
          // 無動態或暫停時沒有時間推進：把畫面更新到「現在」，事件放在 S 波已抵達 3 秒的位置，一次畫出結果
          // 靜態畫面只保留這一筆，避免和視窗內較早的事件標記疊在一起
          t = simNow();
          events.forEach(old => { if (old.els) old.els.g.remove(); });
          events.length = 0;
          const e = makeEvent(0, p, true);
          e.t0 = t - (e.sp + 3);
          rebuild(t); draw(); fire(e, true);
          if (opts.onTick) { const pga = peakNow(); opts.onTick({ pga, intensity: intensity(pga) }); }
          return;
        }
        makeEvent(t + 0.05, p, true);
        nextAuto = Math.max(nextAuto, t + 16);
      }
    };
  }

  /* ---------- Toast / Modal / Alarm ---------- */
  let toastHost = null;
  function overlayParent() {
    const open = qsa('dialog[open]');
    return open.length ? open[open.length - 1] : document.body;
  }
  function placeOverlays() {
    const p = overlayParent();
    if (toastHost && toastHost.parentNode !== p) p.appendChild(toastHost);
    if (alarmEl && alarmEl.parentNode !== p) p.appendChild(alarmEl);
  }
  const TOAST_FRAME = { ink: ['alert', 'ink'], yellow: ['alert', 'warning'], red: ['alert', 'fire'], green: ['check', 'safe'], blue: ['info', 'info'] };
  function toast(msg, opts = {}) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('aria-live', 'polite');
      toastHost.setAttribute('role', 'status');
    }
    placeOverlays();
    const tone = opts.tone || 'ink';
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.innerHTML = `<span class="toast__icon">${icon(TOAST_FRAME[tone][0])}</span><div class="toast__body">${opts.title ? `<b class="toast__title">${esc(opts.title)}</b>` : ''}<p class="toast__msg">${esc(msg)}</p></div>` +
      `<button class="toast__close" type="button" aria-label="關閉通知">${icon('close')}</button>`;
    toastHost.appendChild(el);
    while (toastHost.children.length > 4) toastHost.firstElementChild.remove();
    const remove = () => { if (!el.isConnected || el.classList.contains('is-leaving')) return; el.classList.add('is-leaving'); setTimeout(() => el.remove(), 260); };
    el.querySelector('.toast__close').addEventListener('click', remove);
    setTimeout(remove, opts.timeout || 4200);
    return remove;
  }

  const lastFocus = new WeakMap();
  const modal = {
    open(d) {
      d = typeof d === 'string' ? document.getElementById(d) : d;
      if (!d || d.open) return;
      lastFocus.set(d, document.activeElement);
      d.showModal();
      placeOverlays();
    },
    close(d) {
      d = typeof d === 'string' ? document.getElementById(d) : (d || qsa('dialog[open]').pop());
      if (d && d.open) d.close();
    }
  };
  function wireDialog(d) {
    if (d.dataset.wired) return;
    d.dataset.wired = '1';
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => {
      placeOverlays();
      const f = lastFocus.get(d);
      if (f && f.isConnected) f.focus();
    });
  }

  let alarmEl = null, alarmTimer = 0, alarmCount = 0;
  const alarm = {
    show(o) {
      if (!alarmEl) {
        alarmEl = document.createElement('div');
        alarmEl.className = 'alarm';
        alarmEl.setAttribute('role', 'alert');
        alarmEl.innerHTML = `<div class="alarm__stripe" data-loop aria-hidden="true"></div><div class="alarm__inner container">
          <span class="alarm__sign">${sign('quake', 'warning')}</span>
          <div class="alarm__text"><p class="alarm__kicker"></p><p class="alarm__title"></p><p class="alarm__sub"></p></div>
          <div class="alarm__count" aria-live="off"><span class="alarm__num"></span><span class="alarm__lbl"></span></div>
          <button class="alarm__close" type="button" aria-label="關閉警示">${icon('close')}</button></div><div class="alarm__stripe" data-loop aria-hidden="true"></div>`;
        alarmEl.querySelector('.alarm__close').addEventListener('click', alarm.hide);
        qsa('[data-loop]', alarmEl).forEach(el => loopIO.observe(el));
      }
      placeOverlays();
      qs('.alarm__kicker', alarmEl).textContent = o.kicker || '';
      qs('.alarm__title', alarmEl).textContent = o.title || '';
      qs('.alarm__sub', alarmEl).textContent = o.sub || '';
      const box = qs('.alarm__count', alarmEl), num = qs('.alarm__num', alarmEl), lbl = qs('.alarm__lbl', alarmEl);
      clearInterval(alarmCount); clearTimeout(alarmTimer);
      box.hidden = o.countdown == null;
      if (o.countdown != null) {
        // 倒數依牆上時間計算，分頁切走再回來也不會停在半途
        const end = Date.now() + o.countdown * 1000;
        const tick = () => {
          const left = Math.ceil((end - Date.now()) / 1000);
          if (left > 0) { num.textContent = left; lbl.textContent = o.countLabel || '秒'; box.classList.remove('is-done'); }
          else { num.textContent = '!'; lbl.textContent = o.after || ''; box.classList.add('is-done'); clearInterval(alarmCount); }
        };
        tick();
        alarmCount = setInterval(tick, 200);
      }
      alarmEl.classList.remove('is-on');
      void alarmEl.offsetWidth;
      alarmEl.classList.add('is-on');
      alarmTimer = setTimeout(alarm.hide, o.timeout || 11000);
    },
    hide() {
      if (!alarmEl) return;
      clearInterval(alarmCount); clearTimeout(alarmTimer);
      alarmEl.classList.remove('is-on');
    }
  };

  /* ---------- 警報詳情 modal（全站共用）---------- */
  function openAlert(id) {
    const a = alertById(id);
    if (!a) throw new Error('App.openAlert: unknown ' + id);
    let d = document.getElementById('alert-dialog');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'alert-dialog';
      d.className = 'modal modal--alert';
      d.setAttribute('aria-labelledby', 'alert-dialog-title');
      document.body.appendChild(d);
      wireDialog(d);
    }
    const H = HAZARDS[a.type];
    const onAlertsPage = /alerts\.html$/.test(location.pathname);
    const related = a.status === 'lifted' ? [] : shelters.filter(s => s.status === 'open' && (a.districts.includes('all') || a.districts.includes(s.district)));
    const when = a.window ? `${fmt.dt(a.window[0])} – ${fmt.dt(a.window[1])}` : a.ended && a.ended !== a.issued ? `${fmt.dt(a.issued)} – ${fmt.dt(a.ended)}` : fmt.dt(a.issued);
    d.innerHTML = `<div class="modal__box">
      <header class="modal__head modal__head--${a.level}">
        <span class="modal__sign">${hazardSign(a.type)}</span>
        <div class="modal__headtext"><p class="modal__code">${a.id} · ${H.name} ${H.en}</p><h2 class="modal__title" id="alert-dialog-title">${esc(a.title)}</h2></div>
        <button class="modal__close" type="button" data-modal-close aria-label="關閉">${icon('close')}</button>
      </header>
      <div class="modal__body">
        <div class="cluster">${levelBadge(a.level, { en: true })}${statusTag(a.status)}${hzTag(a.type)}</div>
        <p class="modal__lede">${esc(a.summary)}</p>
        <dl class="kv">
          <div><dt>${a.window ? '影響時段' : '發布時間'}</dt><dd>${when}</dd></div>
          <div><dt>影響區域</dt><dd>${districtNames(a.districts)}</dd></div>
          <div><dt>發布單位</dt><dd>${esc(a.source)}</dd></div>
          ${a.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
        <h3 class="modal__sub">應變指引</h3>
        <ol class="steps-list">${a.actions.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
        ${related.length ? `<h3 class="modal__sub">已開設收容處所</h3><ul class="modal__shelters">${related.map(s => `<li><span class="modal__sid">${s.id}</span>${esc(s.name)}<span class="modal__socc">${s.occ} / ${s.cap} 人</span></li>`).join('')}</ul>` : ''}
      </div>
      <footer class="modal__foot">
        ${onAlertsPage ? '' : `<a class="btn btn--ghost" href="alerts.html#${a.id}">在警報頁查看${icon('arrow-r')}</a>`}
        <button class="btn btn--primary" type="button" data-modal-close>知道了</button>
      </footer></div>`;
    scan(d);
    modal.open(d);
  }

  /* ---------- Tooltip ---------- */
  let tipEl = null;
  const tip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.innerHTML = html;
      const r = tipEl.getBoundingClientRect();
      tipEl.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x + 14)) + 'px';
      tipEl.style.top = (y - r.height - 12 < 8 ? y + 18 : y - r.height - 12) + 'px';
      tipEl.classList.add('is-on');
    },
    hide() { if (tipEl) tipEl.classList.remove('is-on'); }
  };

  /* ---------- 元件：tabs / segmented / chips / stepper ---------- */
  function initTabs(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const tabs = qsa('[role="tab"]', root);
    const activate = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      root.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, index: tabs.indexOf(tab), panel: document.getElementById(tab.getAttribute('aria-controls')) } }));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => activate(t));
      t.addEventListener('keydown', e => {
        const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in map)) return;
        e.preventDefault();
        activate(tabs[(map[e.key] + tabs.length) % tabs.length], true);
      });
    });
    const sel = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0];
    tabs.forEach(t => {
      const p = document.getElementById(t.getAttribute('aria-controls'));
      t.tabIndex = t === sel ? 0 : -1;
      if (p) p.hidden = t !== sel;
    });
  }
  function initSegmented(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    root.addEventListener('click', e => {
      const b = e.target.closest('button[data-value]');
      if (!b || !root.contains(b)) return;
      qsa('button[data-value]', root).forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      root.dispatchEvent(new CustomEvent('segchange', { detail: { value: b.dataset.value, button: b } }));
    });
  }
  function initChips(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const single = root.dataset.chips === 'single';
    root.addEventListener('click', e => {
      const b = e.target.closest('button.chip');
      if (!b || !root.contains(b)) return;
      const all = qsa('button.chip', root);
      if (single) all.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      else b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      const values = all.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.value);
      root.dispatchEvent(new CustomEvent('chipchange', { detail: { values, button: b } }));
    });
  }
  function initStepper(root) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const input = qs('input', root);
    const clamp = v => Math.min(+(input.max || 99), Math.max(+(input.min || 0), v));
    const sync = () => qsa('[data-step]', root).forEach(b => {
      const v = +input.value, s = +b.dataset.step;
      b.disabled = (s < 0 && v <= +(input.min || 0)) || (s > 0 && v >= +(input.max || 99));
    });
    qsa('[data-step]', root).forEach(b => b.addEventListener('click', () => {
      input.value = clamp((+input.value || 0) + +b.dataset.step);
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
    input.addEventListener('change', () => { input.value = clamp(Math.round(+input.value || 0)); sync(); });
    sync();
  }

  /* ---------- 表單 ---------- */
  const field = {
    setError(input, msg) {
      const f = input.closest('.field');
      f.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      let err = qs('.field__error', f);
      if (!err) { err = document.createElement('p'); err.className = 'field__error'; f.appendChild(err); }
      err.id = err.id || (input.id || 'f' + Math.random().toString(36).slice(2, 8)) + '-err';
      err.textContent = msg;
      const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      ids.add(err.id);
      input.setAttribute('aria-describedby', [...ids].join(' '));
    },
    clear(root) {
      const fields = root.classList.contains('field') ? [root] : qsa('.field', root);
      fields.forEach(f => {
        f.classList.remove('is-invalid');
        qsa('[aria-invalid]', f).forEach(i => i.removeAttribute('aria-invalid'));
        const err = qs('.field__error', f);
        if (err) err.textContent = '';
      });
    }
  };
  const valid = {
    required: v => String(v).trim().length > 0,
    phone: v => /^(09\d{8}|\d{8}|0\d{1,2}-?\d{6,8})$/.test(String(v).replace(/[\s-]/g, '')),
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim())
  };

  /* ---------- 宣告式：時鐘 / 倒數 / 綁定 / 計數 ---------- */
  function renderClocks() {
    const n = now();
    qsa('[data-clock]').forEach(el => {
      el.textContent = el.dataset.clock === 'time' ? fmt.time(n) : `${fmt.date(n)}（${WD[n.getDay()]}）${fmt.time(n)}`;
      el.setAttribute('datetime', n.toISOString());
    });
    qsa('[data-countdown]').forEach(el => {
      const ms = date(el.dataset.countdown) - n;
      const s = Math.max(0, Math.floor(ms / 1000));
      const units = { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
      const parts = qsa('[data-unit]', el);
      if (parts.length) {
        // 沒有 d 欄位時把天數併進小時
        const hasD = parts.some(p => p.dataset.unit === 'd');
        parts.forEach(p => { const u = p.dataset.unit; p.textContent = pad(u === 'h' && !hasD ? Math.floor(s / 3600) : units[u]); });
      } else el.textContent = fmt.dur(ms);
      el.classList.toggle('is-done', s === 0);
    });
  }

  function refresh() {
    const s = summary();
    const L = LEVELS[s.level];
    qsa('[data-bind]').forEach(el => {
      const k = el.dataset.bind;
      if (!(k in s)) throw new Error('App.refresh: unknown bind ' + k);
      const v = k === 'level' ? L.name : s[k];
      if (el.hasAttribute('data-count') && el.dataset.counted) countUp(el, v);
      else if (!el.hasAttribute('data-count')) el.textContent = typeof v === 'number' ? fmt.num(v) : v;
      else el.dataset.count = v;
    });
    qsa('[data-city-status]').forEach(el => {
      el.className = `city-chip city-chip--${s.level}`;
      el.innerHTML = `<span class="city-chip__lamp" aria-hidden="true"></span><b>${LAMP_NAME[L.lamp]} ${L.name}</b><span class="city-chip__eoc">應變中心${s.eoc}</span>`;
    });
  }

  const countRuns = new WeakMap();
  function countUp(el, to) {
    // 每次都讀當下目標值；新的呼叫會取消前一次，避免連續觸發時互相覆寫
    el.dataset.count = to;
    el.dataset.counted = '1';
    const target = +el.dataset.count;
    const prev = countRuns.get(el);
    if (prev) cancelAnimationFrame(prev);
    if (mqReduce.matches) { el.textContent = fmt.num(target); return; }
    const from = +(el.textContent.replace(/[^\d.-]/g, '')) || 0;
    const t0 = performance.now(), dur = 900;
    const run = ts => {
      const p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt.num(Math.round(from + (target - from) * e));
      if (p < 1) countRuns.set(el, requestAnimationFrame(run));
      else countRuns.delete(el);
    };
    countRuns.set(el, requestAnimationFrame(run));
  }

  /* ---------- 進場 ---------- */
  const revealIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  const countIO = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { countUp(e.target, e.target.dataset.count); countIO.unobserve(e.target); }
  }));
  function revealAll() { qsa('[data-reveal]:not(.is-in)').forEach(el => el.classList.add('is-in')); }

  /* ---------- 掃描 ---------- */
  function scan(root = document) {
    qsa('[data-sign]', root).forEach(el => {
      if (el.dataset.signed) return;
      const [g, f] = el.dataset.sign.split(' ');
      el.innerHTML = sign(g, f || 'warning');
      el.dataset.signed = '1';
    });
    qsa('[data-icon]', root).forEach(el => {
      if (el.dataset.iconed) return;
      el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
      el.dataset.iconed = '1';
    });
    qsa('[data-tabs]', root).forEach(initTabs);
    qsa('[data-segmented]', root).forEach(initSegmented);
    qsa('[data-chips]', root).forEach(initChips);
    qsa('[data-stepper]', root).forEach(initStepper);
    qsa('dialog.modal', root).forEach(wireDialog);
    qsa('[data-loop]', root).forEach(el => loopIO.observe(el));
    const vh = innerHeight;
    qsa('[data-reveal]:not(.is-in)', root).forEach(el => {
      // 初次載入就在視窗內的直接顯示，不等 observer
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('is-in');
      else revealIO.observe(el);
    });
    qsa('[data-count]', root).forEach(el => {
      if (el.dataset.counted) return;
      el.textContent = '0';
      countIO.observe(el);
    });
  }

  /* ---------- 外殼 ---------- */
  function initShell() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    qsa('.site-nav__link').forEach(a => {
      const on = (a.getAttribute('href') || '').toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const header = qs('.site-header');
    const toggle = qs('.nav-toggle');
    const nav = qs('.site-nav');
    if (toggle && nav) {
      const set = open => {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        header.classList.toggle('is-open', open);
      };
      toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
      nav.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
      document.addEventListener('click', e => { if (header.classList.contains('is-open') && !header.contains(e.target)) set(false); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { set(false); toggle.focus(); } });
      matchMedia('(min-width: 1081px)').addEventListener('change', e => { if (e.matches) set(false); });
    }
    if (header) {
      const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 8);
      addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    // 頁尾訂閱表單（每頁都有，行為一致）
    qsa('form[data-subscribe]').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      field.clear(form);
      const input = form.elements.contact;
      const v = input.value.trim();
      if (!valid.required(v)) { field.setError(input, '請輸入手機號碼或 Email'); input.focus(); return; }
      if (!valid.phone(v) && !valid.email(v)) { field.setError(input, '格式不正確：手機請輸入 09 開頭 10 碼，或輸入有效 Email'); input.focus(); return; }
      const dsel = form.elements.district;
      const area = dsel.value === 'all' ? '全市' : districts[dsel.value].name;
      toast(`${area}的警報將傳送至 ${v}，可隨時回覆「退訂」取消。`, { title: '訂閱完成', tone: 'green' });
      form.reset();
    }));
  }

  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) { e.preventDefault(); modal.open(opener.dataset.modalOpen); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { modal.close(closer.closest('dialog')); return; }
    const al = e.target.closest('[data-alert]');
    if (al && !al.closest('a[href]')) openAlert(al.dataset.alert);
  });
  // 合成的 Escape（例如自動化測試）也能關掉最上層 modal 與警示橫幅
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = qsa('dialog[open]').pop();
    if (open) open.close();
    else alarm.hide();
  });

  window.App = {
    TODAY, now, date, fmt, esc, qs, qsa,
    LEVELS, LEVEL_SHAPES, HAZARDS, STATUS, SHELTER_KIND, DISTRICT_ORDER, data,
    district, alert: alertById, shelter: shelterById, activeAlerts, openShelters, alertsFor, sheltersIn, districtNames,
    summary, distance, walkMin, kitQty, intensity,
    icon, sign, hazardSign, levelBadge, statusTag, hzTag, featTags, capBar, alertRowHTML, shelterCardHTML,
    cityMap, toast, modal, alarm, openAlert, field, valid, countUp, refresh, scan, animate, seismo, tip,
    get reducedMotion() { return mqReduce.matches; }
  };

  document.documentElement.classList.add('js');
  initShell();
  refresh();
  scan(document);
  renderClocks();
  setInterval(renderClocks, 1000);
  addEventListener('load', () => setTimeout(revealAll, 6000));
  addEventListener('beforeprint', revealAll);
})();
