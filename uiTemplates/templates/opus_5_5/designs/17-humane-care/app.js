/*
 * 澄港長照 · 申請與派案系統 — 共用行為 app.js
 *
 * 載入：<script src="app.js" defer></script>
 * 頁面專屬程式寫在 </body> 前的 inline <script>，並包在
 *   document.addEventListener('DOMContentLoaded', () => { ... });
 * 因為 inline script 會比 defer 的 app.js 先執行；DOMContentLoaded 觸發時 window.App 已就緒。
 *
 * ── window.App ─────────────────────────────────────────────────────────
 * 資料（全站共用，人名／案號／金額前後一致；只在記憶體中變動）
 *   App.ME                 目前登入者 id（'s1' 林語晴，照管專員）
 *   App.NOW                「現在」：2026-10-27（二）10:20，所有相對時間以此為準
 *   App.DATA.cases         26 位個案（欄位見下方「個案欄位」）
 *   App.DATA.caregivers    15 位照服員（技能、語言、所在區、可服務時段）
 *   App.DATA.staff         照管專員／督導
 *   App.DATA.visits        今日訪視行程（全組）
 *   App.DATA.reminders     需要關懷的提醒（open=false 表示已處理）
 *   App.DATA.districts     8 區照服員人力供需（本週 / 下週）
 *   App.SERVICES           長照服務代碼 → {name, price, unit, group}
 *   App.QUOTA              CMS 等級 → 每月照顧及專業服務額度
 *   App.STAGES             六階段流程 [{key, label, short, icon}]
 *   App.ADL_ITEMS / App.IADL_ITEMS  巴氏量表 10 項（含滿分）/ 工具性日常活動 8 項（0–3 分）
 *   App.TIES / App.KINDS   生態圖關係線型、資源類別
 * 查詢與衍生
 *   App.getCase(id) · App.getCaregiver(id) · App.getStaff(id) · App.stageOf(key)
 *   App.quotaOf(c) → {cap, used, remain, pct, items:[{code, name, count, amount}]}
 *   App.adlTotal(arr) · App.loadLevel(zarit) → {label, tone}
 *   App.bookingsOf(caregiverId) → [{day, from, to, caseId, label}]（day：1=週一 … 7=週日）
 *   App.match(c, caregiver) → {score, km, parts, missing, conflicts, outside, load}
 *   App.network(caseId) → 家系圖＋生態圖資料（王秀蘭為完整版，其餘由個案欄位推導）
 *   App.counts() → {newMonth, apply, assess, plan, dispatch, service, review, reminders, visitsMine, visitsMineDone, visitsAll}
 *   App.emit(type, detail)  資料改變後呼叫；會重繪所有 [data-count] 並在 document 發出 'app:data'
 * 格式
 *   App.fmt.num / money / md / date / dateLong / ymd / time / hour / dayName / rel / pct
 *   App.toDate('2026-10-27T10:20') → Date（一律當地時間解析）
 *   App.esc(str) · App.param(name) · App.$(sel, root) · App.$$(sel, root)
 * 標記產生器（回傳 HTML 字串）
 *   App.icon(name, cls) · App.seal(nameOrObj, {size:'sm'|'md'|'lg'|'xl', tone:'clay'|'sage'|'ink'})
 *   App.cms(level) · App.stage(key) · App.svc(code) · App.loadChip(zarit)
 *   App.scoreRing(score, {size, label}) · App.caseCard(c) · App.quotaBar(c) · App.emptyState({title, text, art})
 * 互動
 *   App.toast(title, {desc, tone:'ok'|'info'|'warn', action:{label, onClick}, duration})
 *   App.openDialog(dialogEl) · App.closeDialog(dialogEl)（toast 會自動移進開啟中的 dialog）
 *   App.modal({title, body, icon, size:'sm'|'md'|'lg', actions:[{label, variant, onClick(close)}]}) → {el, close}
 *   App.popover(anchor, html) → close()
 *   App.tabs(tablistEl, {onChange(index, tab)}) → {select(i)}
 *   App.seg(segEl, {onChange(value, btn)}) → {value(), set(v)}
 *   App.reveal(root) 重新掃描動態插入的 [data-reveal] · App.whenVisible(el, fn) 進入視窗時執行一次
 *   App.countUp(el, to) 數字滾動（連續呼叫會接續最新目標，不會重疊）
 *   App.tween({dur, ease, update(t), done}) → cancel()   App.ease.out / soft / inOut / back
 *   App.draw(scopeEl) 讓其中 [data-draw] 線條逐筆描繪、[data-draw-fill] 淡入
 * 招牌動態引擎
 *   App.ecomap(host, App.network(id), {title, onSelect(resource), immediate}) → {replay(), select(id|null), el}
 *     預設進入視窗才逐條描繪；immediate:true 立即播放（例如切換分頁後才顯示的圖）。減少動態時直接呈現完成狀態。
 *     host 建議包在 .diagram-scroll 內（手機以 700px 寬左右滑動）；節點寬度依文字長度自動計算
 *   App.ecomapLegend() → 線型圖例 HTML
 *   App.radar(host, {axes:[{label, max}], series:[{name, values, tone:'prev'|'now'|'clay'}], title, levels, immediate}) → {update(seriesIndex, values), el}
 *     最後一個 series 的數值會標在軸標籤下方；附螢幕報讀用的數值表
 *   App.dnd({root, items, zones, handle, check(item, zone) → 'ok'|'conflict'|false, onDrop(item, zone, verdict), onPick(item)}) → {cancel()}
 *     指標拖放＋「點選卡片再點時段」的鍵盤／觸控替代方案；zones 請用 <button>，鍵盤 Enter 才能放下
 * 動態插入的內容
 *   含 [data-reveal] → 插入後呼叫 App.reveal(容器)；含 [data-anim] → App.initAnim(容器)；含 [data-count] → App.renderCounts()
 * 自動行為（不需呼叫）
 *   導覽 active 標示、行動版選單 [data-nav-toggle]、字級切換 button[data-textsize]（寫到 html[data-fontsize]，記在 localStorage）、
 *   頁首捲動陰影、通知鈴 [data-bell]、[data-reveal] 進場、[data-count="key"] 計數（加 data-count-anim 會滾動）、
 *   [data-count-hide-zero]、.draw-scope 進入視窗時描繪、[data-anim] 離開視窗時暫停其中的 .loop 動畫與 SMIL、
 *   [data-open-dialog="id"] 開啟 dialog、dialog 內 [data-close] 關閉、[data-toast="訊息"] 直接給 toast 回饋
 *
 * 個案欄位
 *   id, name, gender('F'|'M'), age, birth, district, addr, xy[km], stage, cms(1–8 或 null=未評估),
 *   living, staff, aides[], carer{name, rel, age, zarit, zaritPrev, note}, services[], usage{code: 次數},
 *   schedule[{day, from, to, aide, svc[]}], request{skills, langs, gender, sessions[{day, from, to}], since}（待派案才有）,
 *   next{at, type}, flags[], dx, applied, assessed, channel, adl[10], adlPrev[10], iadl[8], iadlPrev[8], adlDate, adlPrevDate
 */
(function () {
  'use strict';

  const App = (window.App = {});
  const ME = 's1';
  const NOW = new Date(2026, 9, 27, 10, 20);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =====================================================================
     資料
     ===================================================================== */

  const SERVICES = {
    BA01: { name: '基本身體清潔', price: 260, unit: '次', group: '身體照顧' },
    BA02: { name: '基本日常照顧', price: 195, unit: '30 分鐘', group: '日常生活' },
    BA04: { name: '協助進食或管灌', price: 130, unit: '次', group: '身體照顧' },
    BA05: { name: '餐食照顧', price: 310, unit: '次', group: '日常生活' },
    BA07: { name: '協助沐浴及洗頭', price: 325, unit: '次', group: '身體照顧' },
    BA10: { name: '翻身拍背', price: 155, unit: '次', group: '身體照顧' },
    BA13: { name: '陪同外出就醫', price: 195, unit: '30 分鐘', group: '外出' },
    BA15: { name: '家務協助', price: 195, unit: '30 分鐘', group: '日常生活' },
    BA16: { name: '代購代領', price: 130, unit: '次', group: '日常生活' },
    BA20: { name: '陪伴服務', price: 175, unit: '30 分鐘', group: '陪伴' },
    CA07: { name: 'IADLs 復能照護', price: 1500, unit: '次', group: '專業服務' },
    DA01: { name: '交通接送', price: 190, unit: '趟', group: '交通' },
    GA09: { name: '居家喘息', price: 770, unit: '2 小時', group: '喘息' },
  };

  // CMS 1 級未達長照給付標準，轉介社區資源
  const QUOTA = { 1: 0, 2: 10020, 3: 15460, 4: 18580, 5: 24100, 6: 28070, 7: 32090, 8: 36180 };

  const STAGES = [
    { key: 'apply', label: '申請受理', short: '新申請', icon: 'clipboard' },
    { key: 'assess', label: '到宅評估', short: '待評估', icon: 'home' },
    { key: 'plan', label: '擬定計畫', short: '擬計畫', icon: 'note' },
    { key: 'dispatch', label: '派案媒合', short: '待派案', icon: 'route' },
    { key: 'service', label: '服務提供', short: '服務中', icon: 'hand' },
    { key: 'review', label: '定期複評', short: '複評', icon: 'calendar' },
  ];

  const ADL_ITEMS = [
    { key: 'eat', label: '進食', max: 10 }, { key: 'bath', label: '洗澡', max: 5 },
    { key: 'groom', label: '個人衛生', max: 5 }, { key: 'dress', label: '穿脫衣', max: 10 },
    { key: 'bowel', label: '大便控制', max: 10 }, { key: 'bladder', label: '小便控制', max: 10 },
    { key: 'toilet', label: '如廁', max: 10 }, { key: 'transfer', label: '移位', max: 15 },
    { key: 'walk', label: '平地走動', max: 15 }, { key: 'stairs', label: '上下樓梯', max: 10 },
  ];
  const IADL_ITEMS = ['使用電話', '購物', '備餐', '家務', '洗衣', '外出交通', '服藥', '財務管理'].map(label => ({ label, max: 3 }));

  const STAFF = [
    { id: 's1', name: '林語晴', role: '照管專員', areas: ['舊城區', '港埕區'], seal: '語晴' },
    { id: 's2', name: '陳柏宇', role: '照管專員', areas: ['北岸區'], seal: '柏宇' },
    { id: 's3', name: '張雅筑', role: '照管專員', areas: ['新灣區', '鹽田區'], seal: '雅筑' },
    { id: 's4', name: '吳佩珊', role: '照管專員', areas: ['山腳區', '雲嶺區'], seal: '佩珊' },
    { id: 's5', name: '黃志明', role: '照管督導', areas: ['溪洲區'], seal: '志明' },
  ];

  // 可服務時段：days 為星期字串（1=週一），extra 覆寫個別日子
  const av = (days, from, to, extra = {}) => {
    const out = {};
    for (const d of days) out[d] = [from, to];
    return Object.assign(out, extra);
  };

  const CAREGIVERS = [
    { id: 'cg01', name: '蔡美玲', gender: 'F', age: 52, district: '舊城區', xy: [12.0, 9.6], years: 11, skills: ['沐浴', '失智照顧', '備餐', '翻身拍背'], langs: ['台語'], vehicle: '機車', cap: 40, rating: 4.9, avail: av('12345', 8, 17, { 6: [8, 12] }), others: [['24', 14, 16]] },
    { id: 'cg02', name: '阮氏秋', seal: '秋', gender: 'F', age: 41, district: '港埕區', xy: [6.4, 8.2], years: 6, skills: ['沐浴', '翻身拍背', '備餐', '家務'], langs: ['台語', '越南語'], vehicle: '機車', cap: 40, rating: 4.8, avail: av('123456', 8, 17), others: [['135', 13, 16]] },
    { id: 'cg03', name: '郭建宏', gender: 'M', age: 46, district: '北岸區', xy: [12.6, 2.8], years: 9, skills: ['移位', '陪同就醫', '沐浴'], langs: ['台語'], vehicle: '汽車', cap: 44, rating: 4.7, avail: av('12345', 8, 18), others: [['135', 13, 15]] },
    { id: 'cg04', name: '許淑芬', gender: 'F', age: 58, district: '舊城區', xy: [11.4, 8.6], years: 15, skills: ['管灌', '翻身拍背', '失智照顧', '沐浴'], langs: ['台語', '客語'], vehicle: '機車', cap: 36, rating: 4.9, avail: av('12345', 8, 16), others: [['24', 9, 12]] },
    { id: 'cg05', name: '潘怡君', gender: 'F', age: 35, district: '雲嶺區', xy: [27.2, 13.4], years: 5, skills: ['復能', '陪同就醫', '移位'], langs: ['客語'], vehicle: '汽車', cap: 40, rating: 4.8, avail: av('123456', 8, 17), others: [['24', 9, 11]] },
    { id: 'cg06', name: '李俊傑', gender: 'M', age: 29, district: '新灣區', xy: [5.6, 14.4], years: 3, skills: ['移位', '復能', '陪同就醫'], langs: [], vehicle: '機車', cap: 44, rating: 4.6, avail: av('123456', 9, 18), others: [['246', 10, 12]] },
    { id: 'cg07', name: '王麗華', gender: 'F', age: 55, district: '鹽田區', xy: [10.6, 17.6], years: 12, skills: ['備餐', '家務', '沐浴', '失智照顧'], langs: ['台語'], vehicle: '機車', cap: 40, rating: 4.8, avail: av('12345', 8, 17), others: [['135', 9, 11]] },
    { id: 'cg08', name: '楊惠如', gender: 'F', age: 44, district: '溪洲區', xy: [17.4, 12.6], years: 8, skills: ['失智照顧', '沐浴', '備餐'], langs: ['台語'], vehicle: '機車', cap: 40, rating: 4.7, avail: av('12345', 9, 18), others: [['24', 14, 16]] },
    { id: 'cg09', name: '洪秀琴', gender: 'F', age: 61, district: '山腳區', xy: [21.6, 7.4], years: 14, skills: ['家務', '備餐', '陪伴'], langs: ['客語', '台語'], vehicle: '機車', cap: 32, rating: 4.9, avail: av('12345', 8, 15), others: [['13', 14, 15]] },
    { id: 'cg10', name: '謝明哲', gender: 'M', age: 38, district: '溪洲區', xy: [18.6, 11.4], years: 7, skills: ['移位', '沐浴', '管灌', '翻身拍背'], langs: ['台語'], vehicle: '汽車', cap: 44, rating: 4.6, avail: av('123456', 7, 16), others: [['12345', 8, 10]] },
    { id: 'cg11', name: '曾雅雯', gender: 'F', age: 33, district: '港埕區', xy: [6.8, 9.0], years: 4, skills: ['復能', '失智照顧', '陪同就醫', '家務'], langs: ['手語'], vehicle: '機車', cap: 40, rating: 4.8, avail: av('12345', 9, 17), others: [['135', 13, 15]] },
    { id: 'cg12', name: '范姜育誠', seal: '育誠', gender: 'M', age: 50, district: '山腳區', xy: [22.6, 6.6], years: 10, skills: ['移位', '陪同就醫', '管灌', '翻身拍背'], langs: ['客語'], vehicle: '汽車', cap: 40, rating: 4.7, avail: av('123456', 8, 17), others: [['24', 9, 12]] },
    { id: 'cg13', name: '周佳蓉', gender: 'F', age: 47, district: '北岸區', xy: [11.6, 2.2], years: 9, skills: ['管灌', '翻身拍背', '沐浴'], langs: ['台語'], vehicle: '機車', cap: 40, rating: 4.8, avail: av('12345', 8, 17), others: [['135', 9, 12]] },
    { id: 'cg14', name: '林秋月', gender: 'F', age: 57, district: '新灣區', xy: [5.0, 15.6], years: 13, skills: ['備餐', '家務', '沐浴', '失智照顧'], langs: ['台語'], vehicle: '機車', cap: 36, rating: 4.9, avail: av('12345', 8, 16), others: [['24', 9, 11]] },
    { id: 'cg15', name: '鄭宇翔', gender: 'M', age: 31, district: '舊城區', xy: [12.8, 9.8], years: 4, skills: ['復能', '移位', '沐浴', '陪同就醫'], langs: [], vehicle: '機車', cap: 44, rating: 4.6, avail: av('123456', 10, 19), others: [['24', 15, 17]] },
  ];

  const S = (days, from, to, aide, svc) => [...days].map(d => ({ day: +d, from, to, aide, svc }));

  const CASES = [
    {
      id: 'LC115-0418', name: '王秀蘭', gender: 'F', age: 82, birth: '1944-03-18', district: '舊城區', addr: '舊城區鼓樓街 18 巷 6 號 2 樓', xy: [12.4, 9.2],
      stage: 'service', cms: 6, living: '與女兒同住', staff: 's1', aides: ['cg01'],
      carer: { name: '陳淑惠', rel: '女兒', age: 54, zarit: 46, zaritPrev: 32, note: '白天經營麵攤，晚上接手照顧，夜裡常被叫醒' },
      services: ['BA01', 'BA07', 'BA15', 'CA07', 'GA09'], usage: { BA01: 12, BA07: 12, BA15: 24, CA07: 4 }, // GA09 居家喘息 11/5 才開始，本月尚未使用
      schedule: S('135', 9, 11, 'cg01', ['BA01', 'BA07', 'BA15']),
      next: { at: '2026-11-03T14:00', type: '喘息服務啟動訪視' }, flags: ['失智初期', '跌倒風險'],
      dx: '輕度失智症、退化性膝關節炎、高血壓', applied: '2025-11-03', assessed: '2026-10-13', channel: '醫院出院準備轉介',
      adl: [10, 0, 0, 5, 10, 5, 5, 5, 10, 0], adlPrev: [10, 0, 5, 5, 10, 10, 5, 10, 10, 0], adlDate: '2026-10-13', adlPrevDate: '2026-04-14',
      iadl: [2, 0, 0, 0, 0, 1, 1, 0], iadlPrev: [2, 1, 1, 1, 1, 1, 1, 1],
    },
    {
      id: 'LC115-0397', name: '李阿土', gender: 'M', age: 86, birth: '1940-06-02', district: '舊城區', addr: '舊城區鼓樓街 22 號', xy: [12.6, 9.4],
      stage: 'service', cms: 4, living: '獨居', staff: 's1', aides: ['cg15'],
      carer: { name: '李志遠', rel: '姪子', age: 49, zarit: 18, zaritPrev: 16, note: '住北岸區，每週日探視' },
      services: ['BA02', 'BA05', 'BA16', 'BA20'], usage: { BA02: 24, BA05: 16, BA16: 6, BA20: 12 },
      schedule: S('12345', 11.5, 13, 'cg15', ['BA02', 'BA05']),
      next: { at: '2026-11-04T10:00', type: '關懷訪視' }, flags: ['獨居', '聽力退化'],
      dx: '慢性阻塞性肺病、輕度聽力障礙', applied: '2025-08-19', assessed: '2026-08-21', channel: '社區關懷據點轉介',
      adl: [10, 0, 5, 10, 10, 10, 10, 10, 10, 0], adlPrev: [10, 5, 5, 10, 10, 10, 10, 10, 10, 5], adlDate: '2026-08-21', adlPrevDate: '2026-02-20',
      iadl: [1, 1, 1, 1, 1, 2, 2, 2], iadlPrev: [1, 2, 1, 1, 1, 2, 2, 2],
    },
    {
      id: 'LC115-0452', name: '張美珠', gender: 'F', age: 79, birth: '1947-01-25', district: '港埕區', addr: '港埕區漁港路 5 號', xy: [6.2, 7.6],
      stage: 'service', cms: 5, living: '與先生同住', staff: 's1', aides: ['cg02'],
      carer: { name: '張國雄', rel: '先生', age: 81, zarit: 38, zaritPrev: 35, note: '本身有糖尿病，屬老老照顧' },
      services: ['BA01', 'BA07', 'BA15', 'DA01'], usage: { BA01: 16, BA07: 16, BA15: 52, DA01: 14 },
      schedule: S('246', 9, 11, 'cg02', ['BA01', 'BA07', 'BA15']),
      next: { at: '2026-10-27T13:30', type: '額度與服務調整說明' }, flags: ['老老照顧'],
      dx: '腦中風後遺症（左側偏癱）、第二型糖尿病', applied: '2025-12-08', assessed: '2026-06-10', channel: '電話申請',
      adl: [10, 0, 0, 5, 10, 10, 5, 5, 10, 0], adlPrev: [10, 0, 0, 5, 10, 10, 5, 10, 10, 0], adlDate: '2026-06-10', adlPrevDate: '2025-12-15',
      iadl: [2, 0, 0, 0, 0, 0, 1, 1], iadlPrev: [2, 0, 0, 0, 0, 1, 1, 1],
    },
    {
      id: 'LC115-0331', name: '陳水木', gender: 'M', age: 87, birth: '1938-10-29', district: '北岸區', addr: '北岸區燈塔路 3 巷 12 號', xy: [12.2, 2.6],
      stage: 'service', cms: 3, living: '與兒子媳婦同住', staff: 's2', aides: ['cg03'],
      carer: { name: '林惠珍', rel: '媳婦', age: 58, zarit: 22, zaritPrev: 24, note: '全職照顧，熟悉服務流程' },
      services: ['BA02', 'BA13', 'DA01'], usage: { BA02: 28, BA13: 8, DA01: 6 },
      schedule: S('24', 9, 11, 'cg03', ['BA02', 'BA13']),
      next: { at: '2026-11-12T09:30', type: '關懷訪視' }, flags: [],
      dx: '高血壓、白內障術後、輕度認知障礙', applied: '2025-05-20', assessed: '2026-10-27', channel: '線上申請',
      adl: [10, 5, 5, 10, 10, 10, 10, 10, 10, 5], adlPrev: [10, 5, 5, 10, 10, 10, 10, 10, 10, 5], adlDate: '2026-10-27', adlPrevDate: '2026-04-28',
      iadl: [3, 1, 1, 1, 1, 1, 2, 2], iadlPrev: [3, 1, 1, 1, 1, 1, 2, 2],
    },
    {
      id: 'LC115-0475', name: '黃金枝', gender: 'F', age: 91, birth: '1935-04-09', district: '山腳區', addr: '山腳區茶園路 66 號', xy: [22.4, 7.2],
      stage: 'dispatch', cms: 7, living: '與兒子同住', staff: 's4', aides: [],
      carer: { name: '黃文斌', rel: '兒子', age: 63, zarit: 41, zaritPrev: null, note: '退休教師，夜間需協助翻身' },
      services: ['BA01', 'BA04', 'BA10', 'BA07', 'GA09'], usage: {},
      request: { skills: ['管灌', '翻身拍背', '沐浴'], langs: ['客語'], gender: 'F', sessions: [{ day: 1, from: 9, to: 11 }, { day: 3, from: 9, to: 11 }, { day: 5, from: 9, to: 11 }], since: '2026-10-14' },
      next: { at: '2026-11-03T10:00', type: '派案後首次訪視' }, flags: ['臥床', '鼻胃管'],
      dx: '腦梗塞、吞嚥困難', applied: '2026-09-22', assessed: '2026-10-08', channel: '醫院出院準備轉介',
      adl: [5, 0, 0, 0, 5, 5, 0, 0, 0, 0], adlPrev: null, adlDate: '2026-10-08',
      iadl: [1, 0, 0, 0, 0, 0, 0, 0], iadlPrev: null,
    },
    {
      id: 'LC115-0481', name: '吳添福', gender: 'M', age: 76, birth: '1950-02-14', district: '雲嶺區', addr: '雲嶺區杉林巷 8 號', xy: [27.6, 14.2],
      stage: 'dispatch', cms: 4, living: '與太太同住', staff: 's4', aides: [],
      carer: { name: '吳秀英', rel: '太太', age: 72, zarit: 30, zaritPrev: null, note: '可協助日常，但無法獨力扶抱' },
      services: ['CA07', 'BA13', 'BA20'], usage: {},
      request: { skills: ['復能', '移位', '陪同就醫'], langs: ['客語'], gender: null, sessions: [{ day: 2, from: 14, to: 16 }, { day: 4, from: 14, to: 16 }], since: '2026-10-16' },
      next: { at: '2026-11-04T14:00', type: '派案後首次訪視' }, flags: ['中風復健期', '山區偏遠'],
      dx: '腦中風（右側無力）', applied: '2026-09-30', assessed: '2026-10-12', channel: '醫院出院準備轉介',
      adl: [10, 0, 5, 5, 10, 10, 5, 10, 10, 0], adlPrev: null, adlDate: '2026-10-12',
      iadl: [2, 0, 1, 1, 1, 0, 2, 1], iadlPrev: null,
    },
    {
      id: 'LC115-0486', name: '林阿嬌', gender: 'F', age: 84, birth: '1942-07-30', district: '鹽田區', addr: '鹽田區曬鹽巷 21 號', xy: [11.2, 18.2],
      stage: 'dispatch', cms: 5, living: '獨居，女兒每日下午探視', staff: 's3', aides: [],
      carer: { name: '林美惠', rel: '女兒', age: 57, zarit: 44, zaritPrev: null, note: '住新灣區，每天通勤照顧' },
      services: ['BA02', 'BA05', 'BA07', 'BA20'], usage: {},
      request: { skills: ['失智照顧', '備餐', '沐浴'], langs: ['台語'], gender: 'F', sessions: [1, 2, 3, 4, 5].map(day => ({ day, from: 11, to: 13 })), since: '2026-10-17' },
      next: { at: '2026-11-02T11:00', type: '派案後首次訪視' }, flags: ['失智中度', '獨居'],
      dx: '阿茲海默症（中度）', applied: '2026-10-02', assessed: '2026-10-15', channel: '電話申請',
      adl: [10, 0, 5, 5, 10, 5, 5, 15, 15, 5], adlPrev: null, adlDate: '2026-10-15',
      iadl: [1, 0, 0, 0, 0, 0, 0, 0], iadlPrev: null,
    },
    {
      id: 'LC115-0490', name: '鄭國棟', gender: 'M', age: 68, birth: '1958-05-11', district: '新灣區', addr: '新灣區海景路 128 號 7 樓', xy: [5.2, 14.8],
      stage: 'dispatch', cms: 3, living: '與太太同住', staff: 's3', aides: [],
      carer: { name: '鄭麗雲', rel: '太太', age: 66, zarit: 26, zaritPrev: null, note: '仍在兼職工作，週三、週六較需人手' },
      services: ['CA07', 'BA13'], usage: {},
      request: { skills: ['復能', '移位'], langs: [], gender: null, sessions: [{ day: 3, from: 9, to: 11 }, { day: 6, from: 9, to: 11 }], since: '2026-10-19' },
      next: { at: '2026-11-04T09:00', type: '派案後首次訪視' }, flags: ['巴金森氏症'],
      dx: '巴金森氏症（中期）', applied: '2026-10-03', assessed: '2026-10-16', channel: '線上申請',
      adl: [10, 5, 5, 5, 10, 10, 10, 10, 10, 5], adlPrev: null, adlDate: '2026-10-16',
      iadl: [3, 2, 1, 2, 2, 1, 2, 2], iadlPrev: null,
    },
    {
      id: 'LC115-0493', name: '蘇玉蓮', gender: 'F', age: 88, birth: '1938-01-06', district: '溪洲區', addr: '溪洲區河堤街 40 號', xy: [17.8, 12.2],
      stage: 'dispatch', cms: 6, living: '獨居', staff: 's5', aides: [],
      carer: { name: '蘇怡伶', rel: '外甥女', age: 45, zarit: 24, zaritPrev: null, note: '住外縣市，以電話聯繫為主' },
      services: ['BA02', 'BA05', 'BA07', 'BA13', 'BA16'], usage: {},
      request: { skills: ['沐浴', '備餐', '陪同就醫'], langs: ['台語'], gender: 'F', sessions: [{ day: 1, from: 15, to: 17 }, { day: 4, from: 15, to: 17 }, { day: 6, from: 10, to: 12 }], since: '2026-10-20' },
      next: { at: '2026-11-02T15:00', type: '派案後首次訪視' }, flags: ['獨居', '視力退化'],
      dx: '黃斑部病變、骨質疏鬆', applied: '2026-10-04', assessed: '2026-10-17', channel: '電話申請',
      adl: [10, 0, 5, 5, 10, 10, 5, 10, 5, 0], adlPrev: null, adlDate: '2026-10-17',
      iadl: [1, 0, 0, 1, 0, 0, 1, 1], iadlPrev: null,
    },
    {
      id: 'LC115-0499', name: '何振興', gender: 'M', age: 81, birth: '1945-09-03', district: '港埕區', addr: '港埕區船塢街 9 號', xy: [5.8, 8.8],
      stage: 'dispatch', cms: 4, living: '與兒子同住', staff: 's1', aides: [],
      carer: { name: '何俊賢', rel: '兒子', age: 50, zarit: 28, zaritPrev: null, note: '上班族，平日白天不在家' },
      services: ['BA13', 'BA15', 'BA16', 'DA01'], usage: {},
      request: { skills: ['陪同就醫', '家務'], langs: ['手語'], gender: null, sessions: [{ day: 2, from: 9, to: 11 }, { day: 5, from: 9, to: 11 }], since: '2026-10-21' },
      next: { at: '2026-11-03T09:00', type: '派案後首次訪視' }, flags: ['聽障（使用手語）'],
      dx: '重度聽障、退化性關節炎', applied: '2026-10-06', assessed: '2026-10-19', channel: '線上申請',
      adl: [10, 5, 5, 10, 10, 10, 10, 10, 10, 5], adlPrev: null, adlDate: '2026-10-19',
      iadl: [0, 1, 1, 1, 1, 1, 2, 2], iadlPrev: null,
    },
    {
      id: 'LC115-0503', name: '周美英', gender: 'F', age: 77, birth: '1949-12-01', district: '舊城區', addr: '舊城區文廟路 2 巷 3 號', xy: [11.8, 9.8],
      stage: 'plan', cms: 4, living: '與先生同住', staff: 's1', aides: [],
      carer: { name: '趙德勝', rel: '先生', age: 80, zarit: 29, zaritPrev: null, note: '行動尚可，但不擅長家務' },
      services: ['BA02', 'BA15', 'BA20'], usage: {},
      next: { at: '2026-10-29T10:00', type: '照顧計畫說明' }, flags: ['情緒低落'],
      dx: '憂鬱症、退化性膝關節炎', applied: '2026-10-05', assessed: '2026-10-20', channel: '電話申請',
      adl: [10, 5, 5, 10, 10, 10, 10, 10, 10, 0], adlPrev: null, adlDate: '2026-10-20',
      iadl: [2, 1, 0, 1, 1, 1, 1, 2], iadlPrev: null,
    },
    {
      id: 'LC115-0505', name: '謝阿財', gender: 'M', age: 83, birth: '1943-08-16', district: '溪洲區', addr: '溪洲區竹圍路 15 號', xy: [18.4, 13.0],
      stage: 'plan', cms: 5, living: '與女兒同住', staff: 's5', aides: [],
      carer: { name: '謝淑娟', rel: '女兒', age: 52, zarit: 35, zaritPrev: null, note: '請了一個月照顧假' },
      services: ['BA01', 'BA07', 'BA10', 'DA01'], usage: {},
      next: { at: '2026-10-30T10:30', type: '照顧計畫說明' }, flags: ['跌倒風險'],
      dx: '髖關節骨折術後', applied: '2026-10-06', assessed: '2026-10-21', channel: '醫院出院準備轉介',
      adl: [10, 0, 5, 5, 10, 10, 5, 5, 5, 0], adlPrev: null, adlDate: '2026-10-21',
      iadl: [2, 0, 0, 0, 0, 0, 1, 1], iadlPrev: null,
    },
    {
      id: 'LC115-0508', name: '許碧雲', gender: 'F', age: 74, birth: '1952-03-27', district: '北岸區', addr: '北岸區望海路 77 號', xy: [13.4, 2.0],
      stage: 'plan', cms: 2, living: '獨居', staff: 's2', aides: [],
      carer: { name: '許文傑', rel: '兒子', age: 46, zarit: 12, zaritPrev: null, note: '住港埕區，週末探視' },
      services: ['BA15', 'BA16'], usage: {},
      next: { at: '2026-10-31T14:00', type: '照顧計畫說明' }, flags: ['獨居'],
      dx: '類風濕性關節炎', applied: '2026-10-07', assessed: '2026-10-22', channel: '線上申請',
      adl: [10, 5, 5, 10, 10, 10, 10, 15, 10, 5], adlPrev: null, adlDate: '2026-10-22',
      iadl: [3, 1, 2, 1, 1, 2, 3, 3], iadlPrev: null,
    },
    {
      id: 'LC115-0511', name: '楊再發', gender: 'M', age: 90, birth: '1936-11-20', district: '雲嶺區', addr: '雲嶺區雲霧路 3 號', xy: [28.4, 12.8],
      stage: 'assess', cms: null, living: '與孫子同住', staff: 's4', aides: [],
      carer: { name: '楊承恩', rel: '孫子', age: 28, zarit: null, zaritPrev: null, note: '在鎮上上班，晚上回家' },
      services: [], usage: {},
      next: { at: '2026-10-27T14:00', type: '初評到宅評估' }, flags: ['山區偏遠'],
      dx: '心衰竭、聽力退化', applied: '2026-10-21', assessed: null, channel: '電話申請',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0514', name: '劉素卿', gender: 'F', age: 80, birth: '1946-02-08', district: '舊城區', addr: '舊城區城隍街 30 號', xy: [12.2, 8.8],
      stage: 'assess', cms: null, living: '與兒子媳婦同住', staff: 's1', aides: [],
      carer: { name: '陳怡君', rel: '媳婦', age: 51, zarit: null, zaritPrev: null, note: '希望優先安排日間照顧' },
      services: [], usage: {},
      next: { at: '2026-10-27T08:30', type: '初評到宅評估' }, flags: ['疑似失智'],
      dx: '記憶力退化（待確診）、高血壓', applied: '2026-10-22', assessed: null, channel: '線上申請',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0517', name: '蔡進財', gender: 'M', age: 72, birth: '1954-06-30', district: '鹽田區', addr: '鹽田區海口路 19 號', xy: [10.2, 18.8],
      stage: 'assess', cms: null, living: '與太太同住', staff: 's3', aides: [],
      carer: { name: '蔡月琴', rel: '太太', age: 70, zarit: null, zaritPrev: null, note: '' },
      services: [], usage: {},
      next: { at: '2026-10-29T10:00', type: '初評到宅評估' }, flags: ['輪椅使用'],
      dx: '糖尿病足截肢術後', applied: '2026-10-23', assessed: null, channel: '醫院出院準備轉介',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0520', name: '方玉珍', gender: 'F', age: 85, birth: '1941-05-19', district: '港埕區', addr: '港埕區魚市街 11 號 3 樓', xy: [6.6, 8.4],
      stage: 'assess', cms: null, living: '與兒子同住', staff: 's1', aides: [],
      carer: { name: '方志豪', rel: '兒子', age: 60, zarit: null, zaritPrev: null, note: '' },
      services: [], usage: {},
      next: { at: '2026-10-27T15:30', type: '初評到宅評估' }, flags: ['無電梯公寓'],
      dx: '慢性腎臟病、行動緩慢', applied: '2026-10-24', assessed: null, channel: '電話申請',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0523', name: '江明德', gender: 'M', age: 79, birth: '1947-04-12', district: '新灣區', addr: '新灣區新灣三路 66 號', xy: [5.4, 15.2],
      stage: 'apply', cms: null, living: '與女兒同住', staff: 's3', aides: [],
      carer: { name: '江美玲', rel: '女兒', age: 50, zarit: null, zaritPrev: null, note: '' },
      services: [], usage: {},
      next: null, flags: [],
      dx: '輕度中風', applied: '2026-10-26', assessed: null, channel: '電話申請',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0525', name: '邱月娥', gender: 'F', age: 92, birth: '1934-09-09', district: '山腳區', addr: '山腳區龍眼林 5 號', xy: [21.8, 8.0],
      stage: 'apply', cms: null, living: '與兒子同住', staff: 's4', aides: [],
      carer: { name: '鍾國華', rel: '兒子', age: 68, zarit: null, zaritPrev: null, note: '' },
      services: [], usage: {},
      next: null, flags: ['衰弱'],
      dx: '肺炎出院、衰弱', applied: '2026-10-26', assessed: null, channel: '醫院出院準備轉介',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0526', name: '潘志強', gender: 'M', age: 66, birth: '1960-12-24', district: '北岸區', addr: '北岸區北岸二街 8 號', xy: [11.0, 2.4],
      stage: 'apply', cms: null, living: '與太太同住', staff: 's2', aides: [],
      carer: { name: '潘陳美雪', rel: '太太', age: 63, zarit: null, zaritPrev: null, note: '' },
      services: [], usage: {},
      next: null, flags: ['輪椅使用'],
      dx: '脊髓損傷（車禍）', applied: '2026-10-27', assessed: null, channel: '線上申請',
      adl: null, adlPrev: null, iadl: null, iadlPrev: null,
    },
    {
      id: 'LC115-0288', name: '高淑貞', gender: 'F', age: 81, birth: '1945-08-08', district: '新灣區', addr: '新灣區港灣路 30 巷 5 號', xy: [4.8, 14.6],
      stage: 'review', cms: 4, living: '與兒子同住', staff: 's3', aides: ['cg14'],
      carer: { name: '劉建國', rel: '兒子', age: 55, zarit: 27, zaritPrev: 25, note: '自營水電行，時間彈性' },
      services: ['BA02', 'BA15', 'BA20'], usage: { BA02: 32, BA15: 16, BA20: 16 },
      schedule: S('135', 14, 16, 'cg14', ['BA02', 'BA15', 'BA20']),
      next: { at: '2026-10-27T10:30', type: '複評到宅評估' }, flags: ['失智初期'],
      dx: '輕度失智症、高血脂', applied: '2025-04-12', assessed: '2026-05-05', channel: '電話申請', reviewDue: '2026-11-05',
      adl: [10, 0, 5, 10, 10, 10, 10, 10, 10, 0], adlPrev: [10, 5, 5, 10, 10, 10, 10, 10, 10, 5], adlDate: '2026-05-05', adlPrevDate: '2025-11-04',
      iadl: [2, 1, 1, 1, 1, 1, 1, 1], iadlPrev: [2, 1, 1, 2, 1, 1, 2, 1],
    },
    {
      id: 'LC115-0301', name: '簡明輝', gender: 'M', age: 85, birth: '1941-03-03', district: '溪洲區', addr: '溪洲區中正堤 2 號', xy: [17.0, 11.8],
      stage: 'review', cms: 5, living: '與太太同住', staff: 's5', aides: ['cg08'],
      carer: { name: '簡林秀琴', rel: '太太', age: 82, zarit: 40, zaritPrev: 34, note: '自己也有高血壓，體力漸差' },
      services: ['BA01', 'BA07', 'BA20', 'GA09'], usage: { BA01: 12, BA07: 12, BA20: 24, GA09: 4 },
      schedule: S('135', 9, 11, 'cg08', ['BA01', 'BA07', 'BA20']),
      next: { at: '2026-11-06T09:30', type: '複評到宅評估' }, flags: ['老老照顧'],
      dx: '血管型失智症', applied: '2025-05-02', assessed: '2026-05-08', channel: '醫院出院準備轉介', reviewDue: '2026-11-08',
      adl: [10, 0, 5, 5, 10, 5, 5, 10, 10, 0], adlPrev: [10, 0, 5, 5, 10, 10, 5, 10, 10, 5], adlDate: '2026-05-08', adlPrevDate: '2025-11-06',
      iadl: [1, 0, 0, 0, 0, 0, 1, 0], iadlPrev: [1, 1, 0, 0, 0, 1, 1, 0],
    },
    {
      id: 'LC115-0356', name: '羅秀枝', gender: 'F', age: 78, birth: '1948-11-15', district: '鹽田區', addr: '鹽田區鹽埕路 7 號', xy: [11.6, 17.4],
      stage: 'service', cms: 3, living: '與先生同住', staff: 's3', aides: ['cg07'],
      carer: { name: '郭天來', rel: '先生', age: 80, zarit: 20, zaritPrev: 21, note: '' },
      services: ['BA02', 'BA15', 'DA01'], usage: { BA02: 24, BA15: 16, DA01: 4 },
      schedule: S('24', 14, 16, 'cg07', ['BA02', 'BA15']),
      next: { at: '2026-11-10T14:00', type: '關懷訪視' }, flags: [],
      dx: '心律不整、骨質疏鬆', applied: '2025-06-30', assessed: '2026-07-02', channel: '電話申請',
      adl: [10, 5, 5, 10, 10, 10, 10, 10, 10, 5], adlPrev: [10, 5, 5, 10, 10, 10, 10, 15, 10, 5], adlDate: '2026-07-02', adlPrevDate: '2026-01-05',
      iadl: [3, 1, 2, 1, 1, 1, 2, 2], iadlPrev: [3, 2, 2, 1, 1, 1, 2, 2],
    },
    {
      id: 'LC115-0372', name: '葉天賜', gender: 'M', age: 89, birth: '1937-02-02', district: '雲嶺區', addr: '雲嶺區雲嶺老街 41 號', xy: [28.0, 13.6],
      stage: 'service', cms: 6, living: '與太太同住', staff: 's4', aides: ['cg05'],
      carer: { name: '葉陳阿梅', rel: '太太', age: 84, zarit: 43, zaritPrev: 39, note: '照顧意願高，但體力有限' },
      services: ['BA01', 'BA07', 'BA10', 'CA07', 'DA01'], usage: { BA01: 16, BA07: 12, BA10: 24, CA07: 4, DA01: 4 },
      schedule: S('135', 9, 11, 'cg05', ['BA01', 'BA07', 'BA10']),
      next: { at: '2026-10-27T16:00', type: '關懷訪視' }, flags: ['老老照顧', '山區偏遠'],
      dx: '慢性阻塞性肺病、壓傷（一級）', applied: '2025-07-14', assessed: '2026-07-20', channel: '衛生所轉介',
      adl: [10, 0, 0, 5, 10, 5, 5, 5, 5, 0], adlPrev: [10, 0, 5, 5, 10, 5, 5, 10, 10, 0], adlDate: '2026-07-20', adlPrevDate: '2026-01-22',
      iadl: [1, 0, 0, 0, 0, 0, 1, 1], iadlPrev: [1, 0, 0, 0, 0, 1, 1, 1],
    },
    {
      id: 'LC115-0409', name: '杜美雲', gender: 'F', age: 73, birth: '1953-10-10', district: '山腳區', addr: '山腳區山腳一路 25 號', xy: [21.2, 7.0],
      stage: 'service', cms: 2, living: '獨居', staff: 's4', aides: ['cg09'],
      carer: { name: '杜宏志', rel: '兒子', age: 44, zarit: 10, zaritPrev: 11, note: '住港埕區，每週三晚上探視' },
      services: ['BA15', 'BA16', 'BA20'], usage: { BA15: 20, BA16: 8, BA20: 12 },
      schedule: S('25', 9, 11, 'cg09', ['BA15', 'BA20']),
      next: { at: '2026-11-18T10:00', type: '關懷訪視' }, flags: ['獨居'],
      dx: '輕度憂鬱、高血壓', applied: '2025-09-01', assessed: '2026-09-03', channel: '線上申請',
      adl: [10, 5, 5, 10, 10, 10, 10, 15, 15, 5], adlPrev: [10, 5, 5, 10, 10, 10, 10, 15, 15, 5], adlDate: '2026-09-03', adlPrevDate: '2026-03-04',
      iadl: [3, 2, 2, 2, 2, 2, 3, 3], iadlPrev: [3, 2, 2, 2, 2, 2, 3, 3],
    },
    {
      id: 'LC115-0428', name: '莊文雄', gender: 'M', age: 80, birth: '1946-07-07', district: '舊城區', addr: '舊城區府前街 12 號', xy: [12.8, 9.0],
      stage: 'service', cms: 5, living: '與兒子同住', staff: 's1', aides: ['cg04'],
      carer: { name: '莊志明', rel: '兒子', age: 52, zarit: 33, zaritPrev: 31, note: '在家接案設計，可就近協助' },
      services: ['BA01', 'BA04', 'BA07', 'BA10'], usage: { BA01: 16, BA04: 40, BA07: 12, BA10: 30 },
      schedule: S('135', 9, 11, 'cg04', ['BA01', 'BA04', 'BA07', 'BA10']),
      next: { at: '2026-10-27T11:30', type: '服務品質督導' }, flags: ['鼻胃管'],
      dx: '腦中風後吞嚥障礙', applied: '2025-12-20', assessed: '2026-06-22', channel: '醫院出院準備轉介',
      adl: [5, 0, 0, 5, 10, 5, 5, 5, 5, 0], adlPrev: [5, 0, 0, 5, 10, 5, 5, 5, 5, 0], adlDate: '2026-06-22', adlPrevDate: '2025-12-23',
      iadl: [1, 0, 0, 0, 0, 0, 0, 0], iadlPrev: [1, 0, 0, 0, 0, 0, 0, 0],
    },
  ];

  // 今日訪視（2026-10-27 週二）；status 以 10:20 當下為準
  const VISITS = [
    { id: 'v01', caseId: 'LC115-0514', staff: 's1', from: '08:30', to: '09:30', type: '初評到宅評估', status: 'done', note: '已完成 CMS 量表，待輸入系統；媳婦希望優先安排日間照顧。' },
    { id: 'v02', caseId: 'LC115-0331', staff: 's2', from: '09:00', to: '10:00', type: '複評到宅評估', status: 'done', note: '狀況穩定，維持 CMS 3 級。' },
    { id: 'v03', caseId: 'LC115-0418', staff: 's1', from: '10:00', to: '11:00', type: '照顧計畫調整（家屬會談）', status: 'ongoing', note: '與女兒淑惠討論增加居家喘息與夜間協助。' },
    { id: 'v04', caseId: 'LC115-0288', staff: 's3', from: '10:30', to: '11:30', type: '複評到宅評估', status: 'upcoming', note: '複評 11/05 到期，提前完成。' },
    { id: 'v05', caseId: 'LC115-0428', staff: 's1', from: '11:30', to: '12:15', type: '服務品質督導', status: 'upcoming', note: '確認照服員許淑芬的管灌流程與口腔清潔紀錄。' },
    { id: 'v06', caseId: 'LC115-0452', staff: 's1', from: '13:30', to: '14:30', type: '額度與服務調整說明', status: 'upcoming', note: '本月額度將用罄，與張先生討論下月家務協助頻率。' },
    { id: 'v07', caseId: 'LC115-0511', staff: 's4', from: '14:00', to: '15:30', type: '初評到宅評估', status: 'upcoming', note: '山區路段，預留 50 分鐘車程。' },
    { id: 'v08', caseId: 'LC115-0520', staff: 's1', from: '15:30', to: '16:30', type: '初評到宅評估', status: 'upcoming', note: '無電梯公寓 3 樓，評估是否需要爬梯機。' },
    { id: 'v09', caseId: 'LC115-0372', staff: 's4', from: '16:00', to: '17:00', type: '關懷訪視', status: 'upcoming', note: '入冬前確認電暖器與居家用電安全。' },
  ];

  const DISTRICTS = [
    { name: '港埕區', carers: 52, demand: [1180, 1210], supply: [1240, 1230], tile: [1, 2] },
    { name: '北岸區', carers: 38, demand: [960, 985], supply: [880, 900], tile: [2, 1] },
    { name: '舊城區', carers: 61, demand: [1420, 1450], supply: [1510, 1480], tile: [2, 2] },
    { name: '山腳區', carers: 26, demand: [740, 760], supply: [610, 640], tile: [3, 1] },
    { name: '新灣區', carers: 47, demand: [1050, 1060], supply: [1130, 1150], tile: [1, 3] },
    { name: '鹽田區', carers: 24, demand: [680, 700], supply: [590, 600], tile: [2, 3] },
    { name: '溪洲區', carers: 33, demand: [820, 830], supply: [790, 820], tile: [3, 2] },
    { name: '雲嶺區', carers: 13, demand: [460, 480], supply: [290, 330], tile: [4, 2] },
  ];

  // 記憶體外的案量（全市其餘個案），與記憶體內個案相加得到總覽數字
  const STATS = {
    base: { newMonth: 72, apply: 9, assess: 30, plan: 18, dispatch: 13, service: 1240, review: 55 },
    lastMonth: { newMonth: 77, assess: 38, dispatch: 16, service: 1227 },
    waitDays: { apply: 1.6, assess: 4.2, plan: 3.1, dispatch: 6.8, service: null, review: null },
    targetDays: { dispatch: 5 },
  };

  const byId = (list, id) => list.find(x => x.id === id);

  /* =====================================================================
     查詢與衍生
     ===================================================================== */

  const getCase = id => byId(CASES, id);
  const getCaregiver = id => byId(CAREGIVERS, id);
  const getStaff = id => byId(STAFF, id);

  function quotaOf(c) {
    const cap = c.cms ? QUOTA[c.cms] : 0;
    const items = Object.entries(c.usage || {}).map(([code, count]) => ({ code, name: SERVICES[code].name, count, amount: count * SERVICES[code].price }));
    const used = items.reduce((s, it) => s + it.amount, 0);
    return { cap, used, remain: cap - used, pct: cap ? used / cap : 0, items };
  }

  const adlTotal = arr => (arr ? arr.reduce((s, v) => s + v, 0) : null);

  // 照顧者負荷（Zarit 0–88）：用溫和的字眼與色調，不用紅色警示
  function loadLevel(z) {
    if (z == null) return { label: '尚未評估', tone: 'muted' };
    if (z >= 41) return { label: '負荷偏高', tone: 'clay' };
    if (z >= 21) return { label: '負荷中等', tone: 'sun' };
    return { label: '負荷輕', tone: 'sage' };
  }

  function bookingsOf(cgId) {
    const out = [];
    CASES.forEach(c => (c.schedule || []).forEach(s => {
      if (s.aide === cgId) out.push({ day: s.day, from: s.from, to: s.to, caseId: c.id, label: c.name });
    }));
    getCaregiver(cgId).others.forEach(([days, from, to]) => {
      for (const d of days) out.push({ day: +d, from, to, caseId: null, label: '其他個案' });
    });
    return out.sort((a, b) => a.day - b.day || a.from - b.from);
  }

  const distKm = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 1.25 * 10) / 10; // 1.25：直線距離換算道路距離

  // 配對分數：技能 40、語言 15、性別偏好 10、距離 20、時段 15
  function match(c, cg) {
    const req = c.request || { skills: [], langs: [], gender: null, sessions: [] };
    const missSkills = req.skills.filter(s => !cg.skills.includes(s));
    const missLangs = req.langs.filter(l => !cg.langs.includes(l));
    const skill = req.skills.length ? 40 * (1 - missSkills.length / req.skills.length) : 40;
    const lang = req.langs.length ? 15 * (1 - missLangs.length / req.langs.length) : 15;
    const gender = req.gender && req.gender !== cg.gender ? 0 : 10;
    const km = distKm(c.xy, cg.xy);
    const distance = 20 * clamp(1 - (km - 2) / 18, 0, 1);
    const booked = bookingsOf(cg.id);
    const conflicts = [], outside = [];
    req.sessions.forEach(s => {
      const win = cg.avail[s.day];
      if (!win || s.from < win[0] || s.to > win[1]) outside.push(s);
      const hit = booked.find(b => b.day === s.day && b.from < s.to && s.from < b.to);
      if (hit) conflicts.push({ session: s, with: hit });
    });
    const okSessions = req.sessions.filter(s => !outside.includes(s) && !conflicts.some(x => x.session === s)).length;
    const time = req.sessions.length ? 15 * okSessions / req.sessions.length : 15;
    const hours = booked.reduce((s, b) => s + (b.to - b.from), 0);
    return {
      score: Math.round(skill + lang + gender + distance + time),
      km,
      parts: { skill: Math.round(skill), lang: Math.round(lang), gender, distance: Math.round(distance), time: Math.round(time) },
      missing: { skills: missSkills, langs: missLangs, gender: gender === 0 },
      conflicts, outside,
      load: { hours, cap: cg.cap, pct: hours / cg.cap },
    };
  }

  /* 家系圖＋生態圖資料。座標 at 以家庭圈中心為原點（px）。 */
  const NETWORKS = {
    'LC115-0418': {
      family: {
        members: [
          { id: 'm1', name: '陳天助', gender: 'M', deceased: '2019', rel: '先生', at: [-50, -62] },
          { id: 'm2', name: '王秀蘭', gender: 'F', age: 82, rel: '個案', client: true, home: true, at: [50, -62] },
          { id: 'm3', name: '陳淑惠', gender: 'F', age: 54, rel: '長女・主照', home: true, carer: true, at: [-80, 40] },
          { id: 'm4', name: '陳志豪', gender: 'M', age: 51, rel: '長子', at: [0, 40] },
          { id: 'm5', name: '陳淑芬', gender: 'F', age: 47, rel: '次女', at: [80, 40] },
        ],
        unions: [{ a: 'm1', b: 'm2', type: 'married', kids: ['m3', 'm4', 'm5'] }],
        links: [],
        label: '王秀蘭一家',
      },
      resources: [
        { id: 'r1', label: '市立醫院神經內科', sub: '每月回診・失智追蹤', kind: 'health', tie: 'normal', flow: 'in', note: '主治醫師黃醫師，下次回診 11/12。' },
        { id: 'r2', label: '照服員 蔡美玲', sub: '週一三五 沐浴清潔', kind: 'service', tie: 'strong', flow: 'in', note: '服務 11 個月，阿嬤很信任她，會主動分享心情。' },
        { id: 'r3', label: '鼓樓關懷據點', sub: '週二共餐・健康操', kind: 'community', tie: 'normal', flow: 'both', note: '阿嬤以前是據點志工，現在每週二由淑惠接送參加。' },
        { id: 'r4', label: '長子 陳志豪', sub: '北岸區・每月探視', kind: 'family', tie: 'stress', flow: 'both', note: '對是否送機構與淑惠意見不同，家庭會議時需要協助溝通。' },
        { id: 'r5', label: '淑惠的麵攤', sub: '每日 6–14 時營業', kind: 'work', tie: 'stress', flow: 'out', note: '收入來源，但工時長，是淑惠照顧負荷升高的主因之一。' },
        { id: 'r6', label: '次女 陳淑芬', sub: '新灣區・週末支援', kind: 'family', tie: 'normal', flow: 'in', note: '每週六接阿嬤回家住一晚，讓淑惠休息。' },
        { id: 'r7', label: '鄰居 吳太太', sub: '同棟・偶爾看顧', kind: 'neighbor', tie: 'weak', flow: 'in', note: '淑惠出攤時會幫忙留意，但不便長時間陪伴。' },
        { id: 'r8', label: '居家喘息服務', sub: '規劃中・每月 2 次', kind: 'service', tie: 'planned', flow: 'in', note: '本次照顧計畫新增 GA09，11/3 到宅說明、11/5（四）第一次服務。' },
      ],
    },
  };

  const KIN_REL = { 先生: 'spouse', 太太: 'spouse', 女兒: 'child', 兒子: 'child' };

  // 沒有完整訪談資料的個案，由個案欄位推導最小可用的網絡
  function network(caseId) {
    if (NETWORKS[caseId]) return NETWORKS[caseId];
    const c = getCase(caseId);
    const client = { id: 'm1', name: c.name, gender: c.gender, age: c.age, rel: '個案', client: true, home: true };
    const carer = c.carer;
    const kind = KIN_REL[carer.rel] || 'other';
    const carerGender = /女|太太|媳婦|甥女/.test(carer.rel) ? 'F' : 'M';
    const cm = { id: 'm2', name: carer.name, gender: carerGender, age: carer.age, rel: carer.rel + '・主照', carer: true, home: !/獨居/.test(c.living) && !/住/.test(carer.note || '') };
    const family = { members: [client, cm], unions: [], links: [], label: c.name + '一家' };
    if (kind === 'spouse') {
      const male = client.gender === 'M' ? client : cm, female = male === client ? cm : client;
      male.at = [-50, 0]; female.at = [50, 0];
      family.unions.push({ a: male.id, b: female.id, type: 'married', kids: [] });
    } else if (kind === 'child') {
      client.at = [0, -50]; cm.at = [0, 50];
      family.links.push({ a: 'm1', b: 'm2', type: 'parent' });
    } else {
      client.at = [-55, 0]; cm.at = [55, 0];
      family.links.push({ a: 'm1', b: 'm2', type: 'other' });
    }
    const resources = [];
    c.aides.forEach(id => resources.push({ id: 'a-' + id, label: '照服員 ' + getCaregiver(id).name, sub: c.schedule ? '每週 ' + c.schedule.filter(s => s.aide === id).length + ' 次' : '定期服務', kind: 'service', tie: 'strong', flow: 'in', note: '' }));
    resources.push({ id: 'hosp', label: '主要就醫院所', sub: c.dx.split('、')[0].replace(/（.*?）/g, ''), kind: 'health', tie: 'normal', flow: 'in', note: '' });
    resources.push({ id: 'staff', label: '照管專員 ' + getStaff(c.staff).name, sub: '長照管理中心', kind: 'gov', tie: c.stage === 'apply' ? 'weak' : 'normal', flow: 'both', note: '' });
    resources.push({ id: 'hub', label: c.district.slice(0, 2) + '關懷據點', sub: '社區共餐・電話問安', kind: 'community', tie: /獨居/.test(c.living) ? 'normal' : 'weak', flow: 'in', note: '' });
    if (carer.zarit >= 41) resources.push({ id: 'strain', label: carer.name + '的工作與家務', sub: '照顧負荷偏高', kind: 'work', tie: 'stress', flow: 'out', note: '' });
    if (!c.aides.length && c.stage === 'dispatch') resources.push({ id: 'plan', label: '居家照顧服務', sub: '派案媒合中', kind: 'service', tie: 'planned', flow: 'in', note: '' });
    return { family, resources };
  }

  function counts() {
    const by = s => CASES.filter(c => c.stage === s).length;
    const b = STATS.base;
    const mine = VISITS.filter(v => v.staff === ME);
    return {
      newMonth: b.newMonth + CASES.filter(c => c.applied >= '2026-10-01').length,
      apply: b.apply + by('apply'),
      assess: b.assess + by('assess'),
      plan: b.plan + by('plan'),
      dispatch: b.dispatch + by('dispatch'),
      service: b.service + by('service'),
      review: b.review + by('review'),
      reminders: REMINDERS.filter(r => r.open).length,
      visitsMine: mine.length,
      visitsMineDone: mine.filter(v => v.status === 'done').length,
      visitsAll: VISITS.length,
    };
  }

  /* =====================================================================
     小工具與格式
     ===================================================================== */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    out: t => 1 - Math.pow(1 - t, 3),
    soft: t => 1 - Math.pow(1 - t, 4),
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  };

  function toDate(v) {
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v);
    if (!m) throw new Error('Invalid date string: ' + v);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }

  const WD = '日一二三四五六';
  const pad = n => String(n).padStart(2, '0');
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fmt = {
    num: n => Number(n).toLocaleString('zh-TW'),
    money: n => Number(n).toLocaleString('zh-TW') + ' 元',
    md: v => { const d = toDate(v); return `${d.getMonth() + 1}/${d.getDate()}`; },
    date: v => { const d = toDate(v); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; },
    dateLong: v => { const d = toDate(v); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${WD[d.getDay()]}`; },
    ymd: v => { const d = toDate(v); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; },
    time: v => { const d = toDate(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    hour: h => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`,
    dayName: i => '週' + '一二三四五六日'[i - 1],
    rel: v => {
      const n = Math.round((dayStart(toDate(v)) - dayStart(NOW)) / 864e5);
      if (n === 0) return '今天';
      if (n === 1) return '明天';
      if (n === 2) return '後天';
      if (n === -1) return '昨天';
      return n > 0 ? `${n} 天後` : `${-n} 天前`;
    },
    pct: v => Math.round(v * 100) + '%',
  };

  function param(name) { return new URLSearchParams(location.search).get(name); }

  /* =====================================================================
     事件：資料改變 → 同一套重繪
     ===================================================================== */

  function emit(type, detail = {}) {
    renderCounts();
    document.dispatchEvent(new CustomEvent('app:data', { detail: Object.assign({ type }, detail) }));
  }

  function renderCounts() {
    const c = counts();
    $$('[data-count]').forEach(el => {
      const key = el.dataset.count;
      if (!(key in c)) throw new Error('Unknown data-count key: ' + key);
      const v = c[key];
      if (el.hasAttribute('data-count-hide-zero')) el.hidden = v === 0;
      const prev = el.dataset.countValue;
      if (el.hasAttribute('data-count-anim') && !reduceMotion.matches) {
        // 首次：等進入視窗再從 0 滾上來；之後：從目前數字接續到新值
        if (prev === undefined) {
          el.dataset.countValue = v;
          el.textContent = '0';
          whenVisible(el, () => countUp(el, Number(el.dataset.countValue)));
        } else if (Number(prev) !== v) {
          countUp(el, v);
          bump(el);
        }
      } else {
        el.textContent = fmt.num(v);
        if (prev !== undefined && Number(prev) !== v) bump(el);
        el.dataset.countValue = v;
      }
    });
  }

  function bump(el) {
    el.classList.remove('is-bump');
    void el.offsetWidth; // 重新觸發 CSS 動畫
    el.classList.add('is-bump');
  }

  /* =====================================================================
     圖示
     ===================================================================== */

  const ICONS = {
    home: '<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 9.6V20h12.4V9.6"/><path d="M10 20v-5.2h4V20"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"/><path d="M15.2 5.6a3 3 0 0 1 0 5.8"/><path d="M17 14.6c2 .5 3.2 2.1 3.6 4.9"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
    folder: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5"/><path d="M12.2 17.4s-3.2-1.9-3.2-3.9a1.6 1.6 0 0 1 3.2-.8 1.6 1.6 0 0 1 3.2.8c0 2-3.2 3.9-3.2 3.9z"/>',
    route: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h6.5"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    filter: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.8 6.5h.4M4.8 12h.4M4.8 17.5h.4"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    phone: '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
    'phone-missed': '<path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/><path d="m15 3.5 4.5 4.5M19.5 3.5 15 8"/>',
    car: '<path d="M4.5 16.5v-4l2-5A2 2 0 0 1 8.4 6h7.2a2 2 0 0 1 1.9 1.5l2 5v4"/><path d="M4.5 12.5h15v4h-15z"/><path d="M7.5 16.5v2M16.5 16.5v2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.2"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'arrow-right': '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
    'arrow-left': '<path d="M19 12H5M10.5 6.5 5 12l5.5 5.5"/>',
    'chevron-down': '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    'chevron-right': '<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z"/>',
    hand: '<path d="M3.5 14.5 7 12.6a3 3 0 0 1 2.5-.2l4.6 1.7a1.5 1.5 0 0 1-1 2.8l-3-.8"/><path d="M3.5 19.5 7.6 18l6 1.4 6.4-3.9a1.6 1.6 0 0 0-1.7-2.7L14.6 15"/><path d="M14.5 4.6c1-1.2 3-1 3.2.9.2 1.6-2.2 3.2-3.2 3.8-1-.6-3.4-2.2-3.2-3.8.2-1.9 2.2-2.1 3.2-.9z"/>',
    leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l8-8"/>',
    cake: '<path d="M4.5 20h15v-6.5a2 2 0 0 0-2-2h-11a2 2 0 0 0-2 2z"/><path d="M4.5 15.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0"/><path d="M12 11.5V8"/><path d="M12 5.8c-.8-.7-.8-1.6 0-2.6.8 1 .8 1.9 0 2.6z"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11v3"/><rect x="4" y="8" width="16" height="11.5" rx="2.5"/><path d="M15.5 13.75h1.5"/>',
    clipboard: '<rect x="5.5" y="5" width="13" height="16" rx="2.5"/><path d="M9 5V3.5h6V5"/><path d="M9 11h6M9 15h4"/>',
    note: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    wind: '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 17h7"/>',
    bath: '<path d="M4 12h16v2.5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 14.5z"/><path d="M6.5 12V6a2 2 0 0 1 3.8-.9"/><path d="M7 19l-1 1.5M17 19l1 1.5"/>',
    meal: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9 8.5c0-1 1-1.5 1-2.5M13 8.5c0-1 1-1.5 1-2.5"/>',
    walk: '<circle cx="13" cy="4.8" r="1.8"/><path d="M10 21l2.2-6.5L15 17v4"/><path d="M12.2 14.5 12.8 9l-3 2-1.3 3"/><path d="M12.8 9l2.4 2.5 2.8.8"/>',
    cane: '<path d="M8.5 7.5a3.5 3.5 0 0 1 7 0V21"/>',
    chat: '<path d="M5 19.5V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6a2.5 2.5 0 0 1-2.5 2.5H9z"/><path d="M9 9.5h6M9 12.5h3.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    sparkle: '<path d="M12 4c.6 4.2 3.8 7.4 8 8-4.2.6-7.4 3.8-8 8-.6-4.2-3.8-7.4-8-8 4.2-.6 7.4-3.8 8-8z"/>',
    undo: '<path d="M9 7.5 5 11.5l4 4"/><path d="M5 11.5h9.5a4.5 4.5 0 0 1 0 9H12"/>',
    type: '<path d="M4 18 8.5 6h1L14 18M5.6 14h6.8"/><path d="M15 18l2.8-7.5h.4L21 18M15.9 15.6h4.2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    grip: '<path d="M9 6.5h.01M15 6.5h.01M9 12h.01M15 12h.01M9 17.5h.01M15 17.5h.01" stroke-width="3"/>',
    flag: '<path d="M6 21V4.5"/><path d="M6 5h11l-2 4 2 4H6"/>',
    external: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    star: '<path d="m12 4.5 2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z"/>',
    send: '<path d="M4 11 20 4l-7 16-2-7z"/>',
    tea: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 6c0-1 1-1.4 1-2.4M12.5 6c0-1 1-1.4 1-2.4"/>',
    map: '<path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2z"/><path d="M9 5v12M15 7v12"/>',
    mountain: '<path d="M3 19l6-10 4 6 2.5-3.5L21 19z"/>',
    wave: '<path d="M3 10c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    refresh: '<path d="M19 8.5A7.5 7.5 0 0 0 5.2 9.2"/><path d="M5 15.5a7.5 7.5 0 0 0 13.8-.7"/><path d="M19 4v4.5h-4.5M5 20v-4.5h4.5"/>',
    sign: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.6-2.5L4 14.5a1.5 1.5 0 0 1 2.5-1.6L8 15"/>',
  };

  function icon(name, cls = '') {
    if (!ICONS[name]) throw new Error('Unknown icon: ' + name);
    return `<svg class="i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  }

  function injectSprite() {
    const symbols = Object.entries(ICONS).map(([k, v]) =>
      `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `<svg class="sprite" width="0" height="0" aria-hidden="true" style="position:absolute">${symbols}</svg>`);
  }

  /* =====================================================================
     標記產生器
     ===================================================================== */

  // 姓名縮寫圓章：預設取名字後兩字直排，可用 seal 欄位覆寫（如「秋」「育誠」）
  function seal(who, { size = 'md', tone = 'clay' } = {}) {
    const name = typeof who === 'string' ? who : who.name;
    const chars = (typeof who === 'object' && who.seal) || (name.length >= 3 ? name.slice(-2) : name);
    return `<span class="seal seal--${size} seal--${tone}${chars.length === 1 ? ' seal--one' : ''}" aria-hidden="true"><span class="seal__t">${esc(chars)}</span></span>`;
  }

  function cms(level) {
    if (!level) return '<span class="cms cms--none" title="尚未完成照顧管理評估">待評估</span>';
    const pips = Array.from({ length: 8 }, (_, i) => `<i${i < level ? ' class="on"' : ''}></i>`).join('');
    return `<span class="cms" title="長照需要等級 ${level} 級"><span class="cms__label">CMS</span><b class="cms__num">${level}</b><span class="cms__pips" aria-hidden="true">${pips}</span></span>`;
  }

  function stageOf(key) {
    const s = STAGES.find(x => x.key === key);
    if (!s) throw new Error('Unknown stage: ' + key);
    return s;
  }

  function stage(key) {
    const idx = STAGES.findIndex(x => x.key === key);
    const s = stageOf(key);
    const pips = STAGES.map((_, i) => `<i${i <= idx ? ' class="on"' : ''}></i>`).join('');
    return `<span class="stage stage--${key}"><span class="stage__pips" aria-hidden="true">${pips}</span>${esc(s.label)}</span>`;
  }

  function svc(code) {
    const s = SERVICES[code];
    if (!s) throw new Error('Unknown service code: ' + code);
    return `<span class="svc" title="${esc(s.name)}（${s.price} 元／${s.unit}）"><b class="svc__code">${code}</b>${esc(s.name)}</span>`;
  }

  function loadChip(z) {
    const l = loadLevel(z);
    return `<span class="badge badge--${l.tone}">${esc(l.label)}${z != null ? `<span class="badge__num">${z}</span>` : ''}</span>`;
  }

  function scoreRing(score, { size = 56, label = '配對分數' } = {}) {
    const tone = score >= 80 ? 'good' : score >= 60 ? 'fair' : 'low';
    return `<span class="score-ring score-ring--${tone}" style="--size:${size}px;--v:${score}" role="img" aria-label="${esc(label)} ${score} 分">` +
      '<svg viewBox="0 0 36 36" aria-hidden="true"><path class="score-ring__track" d="M18 2.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31"/>' +
      '<path class="score-ring__bar" pathLength="100" d="M18 2.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31"/></svg>' +
      `<b class="score-ring__num">${score}</b></span>`;
  }

  function caseCard(c) {
    const sv = c.services.slice(0, 3).map(svc).join('');
    const more = c.services.length > 3 ? `<span class="tag">+${c.services.length - 3}</span>` : '';
    const next = c.next ? `<span class="case-card__when">${fmt.rel(c.next.at)}・${fmt.date(c.next.at)} ${fmt.time(c.next.at)}</span><span class="case-card__what">${esc(c.next.type)}</span>` : '<span class="case-card__what">待聯繫安排評估</span>';
    return `<article class="case-card" data-case="${c.id}">
      <header class="case-card__head">
        ${seal(c, { size: 'lg' })}
        <div class="case-card__who">
          <h3 class="case-card__name"><a class="stretched" href="case.html?id=${c.id}">${esc(c.name)}</a></h3>
          <p class="case-card__meta">${c.gender === 'F' ? '女' : '男'}・${c.age} 歲・${esc(c.district)}<span class="case-card__id">${c.id}</span></p>
        </div>
        ${cms(c.cms)}
      </header>
      <dl class="case-card__facts">
        <div><dt>主要照顧者</dt><dd>${esc(c.carer.name)}<span class="muted">（${esc(c.carer.rel)}）</span> ${c.carer.zarit != null ? loadChip(c.carer.zarit) : ''}</dd></div>
        <div><dt>服務項目</dt><dd class="cluster cluster--tight">${sv || '<span class="muted">尚未擬定</span>'}${more}</dd></div>
        <div><dt>下次訪視</dt><dd class="case-card__next">${next}</dd></div>
      </dl>
      <footer class="case-card__foot">${stage(c.stage)}${c.flags.slice(0, 2).map(f => `<span class="tag tag--soft">${esc(f)}</span>`).join('')}</footer>
    </article>`;
  }

  const QUOTA_COLORS = ['var(--sage-700)', 'var(--sage)', 'var(--sage-300)', 'var(--sun-600)', 'var(--sun)', 'var(--clay)', 'var(--clay-200)'];
  function quotaBar(c) {
    const q = quotaOf(c);
    if (!q.cap) return `<p class="notice"><span class="notice__icon">${icon('info')}</span><span>尚未核定 CMS 等級，完成到宅評估後才會有每月照顧額度。</span></p>`;
    const segs = q.items.map((it, k) => `<span class="quota__seg" style="--w:${(it.amount / q.cap * 100).toFixed(2)}%;--c:${QUOTA_COLORS[k % QUOTA_COLORS.length]};--k:${k}" title="${it.code} ${esc(it.name)}：${fmt.money(it.amount)}"></span>`).join('');
    const legend = q.items.map((it, k) => `<li><i style="--c:${QUOTA_COLORS[k % QUOTA_COLORS.length]}"></i>${it.code} ${esc(it.name)}<span class="muted num">${it.count} 次・${fmt.money(it.amount)}</span></li>`).join('');
    return `<div class="quota${q.pct >= 0.9 ? ' is-tight' : ''}">
      <div class="quota__top"><span><span class="quota__used">${fmt.num(q.used)}</span> <span class="quota__cap">／ ${fmt.num(q.cap)} 元<span class="nowrap">（CMS ${c.cms} 級每月額度）</span></span></span>
      <span class="quota__pct">已用 ${fmt.pct(q.pct)}・剩 ${fmt.num(q.remain)} 元</span></div>
      <div class="quota__bar" role="img" aria-label="本月額度已使用 ${fmt.pct(q.pct)}">${segs}</div>
      ${legend ? `<ul class="quota__legend">${legend}</ul>` : '<p class="muted">本月尚未使用服務。</p>'}
    </div>`;
  }

  function emptyState({ title, text = '', art = 'tea' } = {}) {
    return `<div class="empty"><span class="empty__art">${icon(art)}</span><p class="empty__title">${esc(title)}</p>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}</div>`;
  }

  /* =====================================================================
     動態工具
     ===================================================================== */

  function tween({ dur = 600, ease: e = ease.out, update, done }) {
    if (reduceMotion.matches || dur <= 0) { update(1); if (done) done(); return () => {}; }
    let raf, start = null;
    const step = now => {
      if (start === null) start = now;
      const t = clamp((now - start) / dur, 0, 1);
      update(e(t));
      if (t < 1) raf = requestAnimationFrame(step);
      else if (done) done();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }

  const counting = new WeakMap();
  function countUp(el, to, { dur = 1100 } = {}) {
    el.dataset.countValue = to; // 每一格都讀這個最新目標，連續呼叫不會互相覆蓋
    if (reduceMotion.matches) { el.textContent = fmt.num(to); return; }
    const prev = counting.get(el);
    const from = prev ? prev.current : Number(el.textContent.replace(/[^\d.-]/g, '')) || 0;
    const state = { current: from };
    counting.set(el, state);
    let start = null;
    const step = now => {
      if (counting.get(el) !== state) return; // 已被新的呼叫接手
      if (start === null) start = now;
      const t = clamp((now - start) / dur, 0, 1);
      state.current = Math.round(lerp(from, Number(el.dataset.countValue), ease.soft(t)));
      el.textContent = fmt.num(state.current);
      if (t < 1) requestAnimationFrame(step);
      else counting.delete(el);
    };
    requestAnimationFrame(step);
  }

  const visibleCallbacks = new WeakMap();
  // 不用比例門檻：比視窗高很多的元素永遠達不到 20%，改以「頂端進入視窗」為準。
  // 也不留底部 margin：首屏底部那一條裡的元素（例如 1440×900 下的照顧旅程計數）不捲動就永遠停在 0 / 未描繪
  const visibleIO = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    visibleIO.unobserve(en.target);
    const fns = visibleCallbacks.get(en.target) || [];
    visibleCallbacks.delete(en.target);
    fns.forEach(fn => fn());
  }));

  function whenVisible(el, fn) {
    if (!visibleCallbacks.has(el)) { visibleCallbacks.set(el, []); visibleIO.observe(el); }
    visibleCallbacks.get(el).push(fn);
  }

  const revealIO = new IntersectionObserver(entries => entries.forEach(en => {
    // 已捲過（在視窗上方）的元素也直接顯示，避免快速捲動後留下空白
    if (en.isIntersecting || en.boundingClientRect.bottom < 0) {
      en.target.classList.add('is-in');
      revealIO.unobserve(en.target);
    }
  }), { rootMargin: '0px 0px -6% 0px' });

  function reveal(root = document) {
    const els = $$('[data-reveal]:not(.is-in)', root);
    if (reduceMotion.matches) { els.forEach(el => el.classList.add('is-in')); return; }
    const inView = [];
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) inView.push(el);
      else revealIO.observe(el);
    });
    // 初次就在視窗內的：下一格直接顯示（保留柔和淡入）
    requestAnimationFrame(() => inView.forEach(el => el.classList.add('is-in')));
  }

  function draw(scope) {
    if (reduceMotion.matches) scope.classList.add('is-static');
    scope.classList.add('is-drawn');
  }

  // [data-anim] 容器離開視窗或分頁隱藏時，暫停其中的循環動畫與 SMIL
  const animState = new WeakMap();
  function setPaused(el, paused) {
    el.classList.toggle('is-paused', paused);
    $$('svg', el).forEach(svg => {
      if (typeof svg.pauseAnimations !== 'function') return;
      if (paused) svg.pauseAnimations(); else svg.unpauseAnimations();
    });
  }
  const animIO = new IntersectionObserver(entries => entries.forEach(en => {
    animState.set(en.target, en.isIntersecting);
    setPaused(en.target, !en.isIntersecting || document.hidden);
  }));
  function initAnim(root = document) {
    $$('[data-anim]', root).forEach(el => { if (!animState.has(el)) { animState.set(el, false); animIO.observe(el); } });
  }
  document.addEventListener('visibilitychange', () => {
    $$('[data-anim]').forEach(el => setPaused(el, document.hidden || !animState.get(el)));
  });

  /* =====================================================================
     Toast / Dialog / Popover
     ===================================================================== */

  let toastHost;
  // showModal 會把 dialog 放到 top layer；toast 容器要跟著移進最上層的 dialog 才不會被蓋住
  function placeToastHost() {
    const open = $$('dialog[open]').filter(d => d.matches(':modal'));
    const target = open.length ? open[open.length - 1] : document.body;
    if (toastHost.parentNode !== target) target.appendChild(toastHost);
  }

  const TOAST_ICON = { ok: 'check-circle', info: 'info', warn: 'leaf' };
  function toast(title, opts = {}) {
    placeToastHost();
    const tone = opts.tone || 'ok';
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.innerHTML = `<span class="toast__icon">${icon(opts.icon || TOAST_ICON[tone])}</span>
      <div class="toast__text"><p class="toast__title">${esc(title)}</p>${opts.desc ? `<p class="toast__desc">${esc(opts.desc)}</p>` : ''}</div>
      ${opts.action ? `<button type="button" class="toast__action">${icon('undo')}${esc(opts.action.label)}</button>` : ''}
      <button type="button" class="toast__close" aria-label="關閉通知">${icon('x')}</button>`;
    toastHost.appendChild(el);
    while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
    let timer;
    const close = () => {
      clearTimeout(timer);
      if (!el.isConnected || el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 260);
    };
    const arm = () => { clearTimeout(timer); timer = setTimeout(close, opts.duration || (opts.action ? 7000 : 4200)); };
    // 指標停在 toast 上或鍵盤聚焦時暫停倒數，讓使用者有足夠時間按「復原」
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', arm);
    el.addEventListener('focusin', () => clearTimeout(timer));
    el.querySelector('.toast__close').addEventListener('click', close);
    if (opts.action) el.querySelector('.toast__action').addEventListener('click', () => { opts.action.onClick(); close(); });
    arm();
    return { close };
  }

  function openDialog(dlg) {
    if (!dlg || dlg.tagName !== 'DIALOG') throw new Error('openDialog expects a <dialog> element');
    if (!dlg.open) dlg.showModal();
    placeToastHost();
  }
  function closeDialog(dlg) { dlg.close(); }

  function modal({ title, body = '', icon: ic = 'info', size = 'md', actions = [{ label: '關閉', variant: 'primary' }] }) {
    const dlg = document.createElement('dialog');
    const tid = 'mdl-' + (++uid);
    dlg.className = `modal modal--${size}`;
    dlg.setAttribute('aria-labelledby', tid);
    dlg.innerHTML = `<div class="modal__head"><span class="modal__icon">${icon(ic)}</span><h2 class="modal__title" id="${tid}">${esc(title)}</h2>
      <button type="button" class="icon-btn modal__close" data-close aria-label="關閉">${icon('x')}</button></div>
      <div class="modal__body"></div><div class="modal__foot"></div>`;
    const bodyEl = $('.modal__body', dlg);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    const close = () => dlg.close();
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn--${a.variant || 'quiet'}`;
      b.textContent = a.label;
      b.addEventListener('click', () => (a.onClick ? a.onClick(close) : close()));
      $('.modal__foot', dlg).appendChild(b);
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    openDialog(dlg);
    return { el: dlg, body: bodyEl, close };
  }

  let openPopover = null;
  function popover(anchor, html) {
    if (openPopover) { const same = openPopover.anchor === anchor; openPopover.close(); if (same) return () => {}; }
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    // 錨點多在 sticky 頁首內，用 fixed 定位才會跟著它，不隨頁面捲走
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = `${r.bottom + 10}px`;
    pop.style.left = `${clamp(r.right - w, 12, document.documentElement.clientWidth - w - 12)}px`;
    anchor.setAttribute('aria-expanded', 'true');
    const onDoc = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') { close(); anchor.focus(); } };
    function close() {
      pop.remove();
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey);
      openPopover = null;
    }
    setTimeout(() => document.addEventListener('click', onDoc, true));
    document.addEventListener('keydown', onKey);
    openPopover = { anchor, close };
    return close;
  }

  /* =====================================================================
     Tabs / Seg
     ===================================================================== */

  function tabs(list, { onChange } = {}) {
    const items = $$('[role="tab"]', list);
    let ink = $('.tabs__ink', list);
    if (!ink) { ink = document.createElement('span'); ink.className = 'tabs__ink'; ink.setAttribute('aria-hidden', 'true'); list.appendChild(ink); }
    const place = tab => {
      // 位移用 transform；寬度直接設定，避免 scaleX 把膠囊兩端圓角壓扁
      ink.style.width = tab.offsetWidth + 'px';
      ink.style.transform = `translateX(${tab.offsetLeft}px)`;
    };
    function select(i, focus = false) {
      items.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      place(items[i]);
      if (focus) items[i].focus();
      if (onChange) onChange(i, items[i]);
    }
    items.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (k) { e.preventDefault(); select((i + k + items.length) % items.length, true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); }
        if (e.key === 'End') { e.preventDefault(); select(items.length - 1, true); }
      });
    });
    const initial = Math.max(0, items.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    items.forEach((t, j) => {
      t.setAttribute('aria-selected', j === initial);
      t.tabIndex = j === initial ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = j !== initial;
    });
    requestAnimationFrame(() => { list.classList.add('is-ready'); place(items[initial]); });
    new ResizeObserver(() => place(items.find(t => t.getAttribute('aria-selected') === 'true'))).observe(list);
    return { select };
  }

  function seg(el, { onChange } = {}) {
    const btns = $$('button', el);
    const set = (v, notify = true) => {
      const btn = btns.find(b => b.dataset.value === v);
      if (!btn) throw new Error('seg: unknown value ' + v);
      btns.forEach(b => b.setAttribute('aria-pressed', b === btn));
      if (notify && onChange) onChange(v, btn);
    };
    btns.forEach(b => b.addEventListener('click', () => set(b.dataset.value)));
    return { value: () => (btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0]).dataset.value, set };
  }

  /* =====================================================================
     招牌：家系圖＋生態圖
     ===================================================================== */

  const SVGNS = 'http://www.w3.org/2000/svg';
  let uid = 0;
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  const TIES = {
    strong: { label: '強連結', desc: '穩定、可依靠的支持' },
    normal: { label: '一般連結', desc: '有往來，互動平穩' },
    weak: { label: '薄弱連結', desc: '偶有往來，支持有限' },
    stress: { label: '壓力／衝突', desc: '關係緊張或帶來負擔' },
    planned: { label: '規劃中', desc: '照顧計畫將建立的連結' },
  };
  const KINDS = {
    health: { label: '醫療', icon: 'heart' }, service: { label: '長照服務', icon: 'hand' }, community: { label: '社區', icon: 'users' },
    neighbor: { label: '鄰里', icon: 'home' }, family: { label: '親屬', icon: 'user' }, work: { label: '工作', icon: 'clock' },
    gov: { label: '公部門', icon: 'clipboard' }, faith: { label: '信仰', icon: 'sparkle' },
  };
  const FLOW_LABEL = { in: '資源流向家庭', out: '家庭付出', both: '雙向往來' };

  // 估算 SVG 文字寬度：中文全形 1em、半形約 .58em、空白 .3em。
  // 不用 getComputedTextLength，因為網頁字型可能還沒載入，量到的是後備字型的寬度
  const textW = (s, size) => [...s].reduce((w, ch) => w + (ch === ' ' ? 0.3 : /[\u0000-ÿ–]/.test(ch) ? 0.58 : 1), 0) * size;
  // 與 style.css 的 .eco-node__label / .eco-node__sub 字級一致，節點寬度依文字長度決定
  const ECO_LABEL_FS = 17, ECO_SUB_FS = 14.5;

  function ecomap(host, net, opts = {}) {
    const W = 860, H = 640, cx = W / 2, cy = H / 2, R = 150, RX = 322, RY = 240, NH = 64;
    const id = 'eco' + (++uid);
    const cancels = [];
    host.innerHTML = '';
    host.classList.add('ecomap');
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ecomap__svg', role: 'group', 'aria-label': opts.title || '家系圖與生態圖' }, host);
    const defs = svgEl('defs', {}, svg);
    Object.keys(TIES).forEach(t => {
      const m = svgEl('marker', { id: `${id}-a-${t}`, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 13, markerHeight: 13, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
      svgEl('path', { d: 'M1.5 1.5 8.5 5l-7 3.5z', class: `eco-arrow eco-arrow--${t}` }, m);
    });

    // 家庭圈
    const famG = svgEl('g', { class: 'eco-fam' }, svg);
    // 用 path 畫圓：pathLength 在 path 上各瀏覽器都支援，描繪動畫才可靠
    svgEl('path', { d: `M${cx} ${cy - R}a${R} ${R} 0 1 1 0 ${2 * R}a${R} ${R} 0 1 1 0 ${-2 * R}`, class: 'eco-family', pathLength: 1 }, famG);
    const famLabel = svgEl('text', { x: cx, y: cy - R + 30, class: 'eco-family__label', 'text-anchor': 'middle' }, famG);
    famLabel.textContent = net.family.label || '家庭';

    // 家系圖
    const geno = svgEl('g', { class: 'eco-geno', transform: `translate(${cx} ${cy + 8})` }, svg);
    const mem = Object.fromEntries(net.family.members.map(m => [m.id, m]));
    const half = 16;
    const kinPath = (d, extra = '') => svgEl('path', { d, class: 'eco-kin' + extra, pathLength: 1 }, geno);
    net.family.unions.forEach(u => {
      const a = mem[u.a], b = mem[u.b];
      const [l, r] = a.at[0] < b.at[0] ? [a, b] : [b, a];
      kinPath(`M${l.at[0] + half} ${l.at[1]}H${r.at[0] - half}`);
      const mx = (l.at[0] + r.at[0]) / 2;
      if (u.type === 'divorced') kinPath(`M${mx - 6} ${l.at[1] + 7}l6-14M${mx} ${l.at[1] + 7}l6-14`);
      if (u.kids.length) {
        const kids = u.kids.map(k => mem[k]);
        const barY = Math.min(...kids.map(k => k.at[1])) - half - 18;
        const xs = kids.map(k => k.at[0]).concat(mx);
        kinPath(`M${mx} ${l.at[1]}V${barY}M${Math.min(...xs)} ${barY}H${Math.max(...xs)}` + kids.map(k => `M${k.at[0]} ${barY}V${k.at[1] - half - 2}`).join(''));
      }
    });
    net.family.links.forEach(lk => {
      const a = mem[lk.a], b = mem[lk.b];
      kinPath(`M${a.at[0]} ${a.at[1] + (b.at[1] > a.at[1] ? half + 2 : 0)}L${b.at[0]} ${b.at[1] - (b.at[1] > a.at[1] ? half + 2 : 0)}`, lk.type === 'other' ? ' eco-kin--other' : '');
    });
    net.family.members.forEach((m, i) => {
      const g = svgEl('g', { transform: `translate(${m.at[0]} ${m.at[1]})` }, geno);
      const pop = svgEl('g', { class: 'eco-member' + (m.client ? ' is-client' : '') + (m.home ? ' is-home' : '') + (m.deceased ? ' is-deceased' : ''), style: `--d:${i}` }, g);
      const shape = (r, cls) => (m.gender === 'M'
        ? svgEl('rect', { x: -r, y: -r, width: r * 2, height: r * 2, rx: 3, class: cls }, pop)
        : svgEl('circle', { r: r + 1, class: cls }, pop));
      if (m.client) shape(half + 5, 'eco-member__ring');
      shape(half, 'eco-member__shape');
      if (m.deceased) svgEl('path', { d: m.gender === 'M' ? 'M-16-16 16 16M16-16-16 16' : 'M-11.5-11.5 11.5 11.5M11.5-11.5-11.5 11.5', class: 'eco-member__x' }, pop);
      else if (m.age) { const t = svgEl('text', { y: 5, class: 'eco-member__age', 'text-anchor': 'middle' }, pop); t.textContent = m.age; }
      const nameY = half + (m.client ? 25 : 20);
      const n = svgEl('text', { y: nameY, class: 'eco-member__name', 'text-anchor': 'middle' }, pop);
      n.textContent = m.name;
      const rel = svgEl('text', { y: nameY + 17, class: 'eco-member__rel', 'text-anchor': 'middle' }, pop);
      rel.textContent = m.deceased ? `${m.rel}・${m.deceased} 歿` : m.rel;
    });

    // 資源節點與關係線
    const tiesG = svgEl('g', { class: 'eco-ties' }, svg);
    const nodesG = svgEl('g', { class: 'eco-nodes' }, svg);
    const items = net.resources.map((res, i) => {
      const deg = res.angle != null ? res.angle : -90 + (360 / net.resources.length) * i;
      const th = deg * Math.PI / 180;
      const NW = Math.max(150, Math.ceil(58 + Math.max(textW(res.label, ECO_LABEL_FS), textW(res.sub, ECO_SUB_FS)) + 20));
      // 文字長的節點變寬，左右兩側時把中心往內收，整顆留在 viewBox 內
      const nx = clamp(cx + RX * Math.cos(th), NW / 2 + 4, W - NW / 2 - 4), ny = cy + RY * Math.sin(th);
      const len = Math.hypot(nx - cx, ny - cy), ux = (nx - cx) / len, uy = (ny - cy) / len;
      const x1 = cx + ux * (R + 3), y1 = cy + uy * (R + 3);
      const d = Math.min(Math.abs(ux) > 1e-6 ? (NW / 2) / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? (NH / 2) / Math.abs(uy) : Infinity) + 5;
      const x2 = nx - ux * d, y2 = ny - uy * d;
      const line = svgEl('line', { x1, y1, x2: x1, y2: y1, class: `eco-tie eco-tie--${res.tie}` }, tiesG);
      const hatch = res.tie === 'stress' ? svgEl('path', { d: '', class: 'eco-hatch' }, tiesG) : null;

      const g = svgEl('g', { transform: `translate(${nx} ${ny})`, class: 'eco-node-wrap' }, nodesG);
      const node = svgEl('g', {
        class: `eco-node eco-node--${res.kind} eco-node--${res.tie}`, tabindex: 0, role: 'button',
        'aria-label': `${res.label}，${res.sub}，${TIES[res.tie].label}，${FLOW_LABEL[res.flow]}`,
      }, g);
      svgEl('rect', { x: -NW / 2, y: -NH / 2, width: NW, height: NH, rx: NH / 2, class: 'eco-node__box' }, node);
      svgEl('circle', { cx: -NW / 2 + 30, cy: 0, r: 19, class: 'eco-node__iconbg' }, node);
      svgEl('use', { href: '#i-' + (KINDS[res.kind] || KINDS.community).icon, x: -NW / 2 + 19, y: -11, width: 22, height: 22, class: 'eco-node__icon' }, node);
      const lb = svgEl('text', { x: -NW / 2 + 58, y: -4, class: 'eco-node__label' }, node);
      lb.textContent = res.label;
      const sb = svgEl('text', { x: -NW / 2 + 58, y: 18, class: 'eco-node__sub' }, node);
      sb.textContent = res.sub;
      return { res, line, hatch, node, x1, y1, x2, y2 };
    });

    function setLine(it, t) {
      const x = lerp(it.x1, it.x2, t), y = lerp(it.y1, it.y2, t);
      it.line.setAttribute('x2', x);
      it.line.setAttribute('y2', y);
      if (it.hatch) {
        // 壓力線：沿線每 15px 一道斜短線，隨線條長出
        const L = Math.hypot(x - it.x1, y - it.y1), dx = (it.x2 - it.x1), dy = (it.y2 - it.y1), full = Math.hypot(dx, dy);
        const ux = dx / full, uy = dy / full, px = -uy, py = ux;
        let d = '';
        for (let s = 14; s < L - 8; s += 15) {
          const bx = it.x1 + ux * s, by = it.y1 + uy * s;
          d += `M${(bx + px * 7 - ux * 4).toFixed(1)} ${(by + py * 7 - uy * 4).toFixed(1)}L${(bx - px * 7 + ux * 4).toFixed(1)} ${(by - py * 7 + uy * 4).toFixed(1)}`;
        }
        it.hatch.setAttribute('d', d);
      }
    }
    function finishLine(it) {
      setLine(it, 1);
      const mk = `url(#${id}-a-${it.res.tie})`;
      if (it.res.flow === 'out' || it.res.flow === 'both') it.line.setAttribute('marker-end', mk);
      if (it.res.flow === 'in' || it.res.flow === 'both') it.line.setAttribute('marker-start', mk);
      it.node.classList.add('is-in');
    }

    function play() {
      cancels.splice(0).forEach(fn => fn());
      svg.classList.remove('is-on');
      items.forEach(it => { it.line.removeAttribute('marker-end'); it.line.removeAttribute('marker-start'); it.node.classList.remove('is-in'); setLine(it, 0); });
      if (reduceMotion.matches) { svg.classList.add('is-on', 'is-static'); items.forEach(finishLine); return; }
      void svg.getBoundingClientRect();
      svg.classList.add('is-on');
      items.forEach((it, i) => {
        const timer = setTimeout(() => {
          cancels.push(tween({ dur: 440, ease: ease.inOut, update: t => setLine(it, t), done: () => finishLine(it) }));
        }, 520 + i * 115);
        cancels.push(() => clearTimeout(timer));
      });
    }

    function select(rid) {
      items.forEach(it => {
        const on = it.res.id === rid;
        it.node.classList.toggle('is-active', on);
        it.line.classList.toggle('is-active', on);
        if (it.hatch) it.hatch.classList.toggle('is-active', on);
      });
      svg.classList.toggle('is-focusing', !!rid);
      const it = items.find(x => x.res.id === rid);
      if (it && opts.onSelect) opts.onSelect(it.res);
    }

    items.forEach(it => {
      const hot = on => {
        it.line.classList.toggle('is-hot', on);
        it.node.classList.toggle('is-hot', on);
        if (it.hatch) it.hatch.classList.toggle('is-hot', on);
        svg.classList.toggle('is-hovering', on);
      };
      it.node.addEventListener('mouseenter', () => hot(true));
      it.node.addEventListener('mouseleave', () => hot(false));
      it.node.addEventListener('focus', () => hot(true));
      it.node.addEventListener('blur', () => hot(false));
      it.node.addEventListener('click', () => select(it.res.id));
      // SVG 元素沒有 HTMLElement.click()；補上讓程式化觸發（自動化測試、其他頁面呼叫）與按鈕一致
      it.node.click = () => it.node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      it.node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(it.res.id); } });
    });

    // 放在 .diagram-scroll（手機可左右滑）裡時，先捲到中央，讓家庭圈在畫面正中
    const scroller = host.closest('.diagram-scroll');
    if (scroller) requestAnimationFrame(() => { scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2; });

    // 減少動態時不等捲動，直接畫出完成狀態
    if (opts.immediate || reduceMotion.matches) play(); else whenVisible(host, play);
    return { el: svg, replay: play, select };
  }

  function ecomapLegend() {
    const sample = t => `<svg class="eco-legend__sample" viewBox="0 0 64 16" aria-hidden="true"><line x1="4" y1="8" x2="60" y2="8" class="eco-tie eco-tie--${t}"/>${t === 'stress' ? '<path class="eco-hatch" d="M14 15 22 1M29 15 37 1M44 15 52 1"/>' : ''}</svg>`;
    return `<ul class="eco-legend">${Object.entries(TIES).map(([k, v]) => `<li>${sample(k)}<span><b>${v.label}</b>${v.desc}</span></li>`).join('')}
      <li><svg class="eco-legend__sample" viewBox="0 0 64 16" aria-hidden="true"><line x1="4" y1="8" x2="52" y2="8" class="eco-tie eco-tie--normal"/><path class="eco-arrow eco-arrow--normal" d="M50 3.5 59 8l-9 4.5z"/></svg><span><b>箭頭</b>資源或心力流動的方向</span></li></ul>`;
  }

  /* =====================================================================
     招牌：ADL / IADL 雷達圖
     ===================================================================== */

  function radar(host, cfg) {
    // 外圍留足空間：手機上 style.css 會把標籤字級放大，四字標籤仍放得下
    const S = 480, c = S / 2, r = 128, levels = cfg.levels || 4;
    const n = cfg.axes.length;
    const ang = i => (-90 + (360 / n) * i) * Math.PI / 180;
    const pt = (i, v) => [c + r * v * Math.cos(ang(i)), c + r * v * Math.sin(ang(i))];
    const norm = vals => vals.map((v, i) => v / cfg.axes[i].max);
    host.innerHTML = '';
    host.classList.add('radar');
    const svg = svgEl('svg', { viewBox: `0 0 ${S} ${S}`, class: 'radar__svg', role: 'img', 'aria-label': cfg.title || '能力雷達圖' }, host);

    const grid = svgEl('g', { class: 'radar__grid' }, svg);
    for (let l = levels; l >= 1; l--) {
      svgEl('polygon', { points: cfg.axes.map((_, i) => pt(i, l / levels).join(',')).join(' '), class: 'radar__ring' + (l % 2 ? '' : ' radar__ring--alt') }, grid);
    }
    cfg.axes.forEach((_, i) => { const [x, y] = pt(i, 1); svgEl('line', { x1: c, y1: c, x2: x, y2: y, class: 'radar__spoke' }, grid); });

    const last = cfg.series[cfg.series.length - 1];
    const labels = cfg.axes.map((ax, i) => {
      const [x, y] = pt(i, 1.16);
      const cos = Math.cos(ang(i)), sin = Math.sin(ang(i));
      const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
      // 兩行文字（項目＋分數）依所在象限往外排：上方整塊往上、下方往下、兩側垂直置中。
      // 用 em 位移，CSS 改字級時行距自動跟著變
      const firstDy = sin < -0.5 ? '-1.05em' : sin > 0.5 ? '.9em' : '-.1em';
      const t = svgEl('text', { x, y, class: 'radar__label', 'text-anchor': anchor }, svg);
      svgEl('tspan', { x, dy: firstDy }, t).textContent = ax.label;
      const v = svgEl('tspan', { x, dy: '1.25em', class: 'radar__value' }, t);
      v.textContent = `${last.values[i]} / ${ax.max}`;
      return v;
    });

    const series = cfg.series.map((s, k) => {
      const g = svgEl('g', { class: `radar__series radar__series--${s.tone || 'now'}`, style: `--d:${k};transform-origin:${c}px ${c}px` }, svg);
      const poly = svgEl('polygon', { class: 'radar__area' }, g);
      const dots = cfg.axes.map(() => svgEl('circle', { r: 4.5, class: 'radar__dot' }, g));
      const state = { vals: norm(s.values) };
      const paint = vals => {
        const pts = vals.map((v, i) => pt(i, Math.max(v, 0.02)));
        poly.setAttribute('points', pts.map(p => p.map(q => q.toFixed(1)).join(',')).join(' '));
        dots.forEach((d, i) => { d.setAttribute('cx', pts[i][0].toFixed(1)); d.setAttribute('cy', pts[i][1].toFixed(1)); });
      };
      paint(state.vals);
      return { g, state, paint, src: s };
    });

    // 無障礙：螢幕報讀用的數值表
    // 表格會撐開到內容寬度、無視 1px，所以把 sr-only 套在外層 div
    const srWrap = document.createElement('div');
    srWrap.className = 'sr-only';
    const table = document.createElement('table');
    srWrap.appendChild(table);
    table.innerHTML = `<caption>${esc(cfg.title || '能力評估')}</caption><thead><tr><th scope="col">項目</th>${cfg.series.map(s => `<th scope="col">${esc(s.name)}</th>`).join('')}</tr></thead>
      <tbody>${cfg.axes.map((ax, i) => `<tr><th scope="row">${esc(ax.label)}（滿分 ${ax.max}）</th>${cfg.series.map(s => `<td>${s.values[i]}</td>`).join('')}</tr>`).join('')}</tbody>`;
    host.appendChild(srWrap);

    const start = () => svg.classList.add('is-on');
    if (reduceMotion.matches) svg.classList.add('is-on', 'is-static');
    else if (cfg.immediate) requestAnimationFrame(start);
    else whenVisible(host, start);

    let cancel = () => {};
    function update(k, values) {
      const s = series[k];
      const from = s.state.vals.slice(), to = norm(values);
      s.src.values = values;
      cancel();
      cancel = tween({ dur: 700, ease: ease.inOut, update: t => { s.state.vals = from.map((v, i) => lerp(v, to[i], t)); s.paint(s.state.vals); } });
      if (k === series.length - 1) labels.forEach((l, i) => { l.textContent = `${values[i]} / ${cfg.axes[i].max}`; });
      $$('tbody tr', table).forEach((tr, i) => { tr.children[k + 1].textContent = values[i]; });
    }
    return { el: svg, update };
  }

  /* =====================================================================
     招牌：拖放（指標拖曳＋點選放置）
     ===================================================================== */

  function dnd({ root = document, items, zones, handle = null, check = () => 'ok', onDrop, onPick }) {
    let picked = null, drag = null, suppressClick = false;
    const allZones = () => $$(zones, root);
    const clearMarks = () => allZones().forEach(z => z.classList.remove('is-over', 'is-conflict', 'is-armed', 'is-blocked'));

    function unpick() {
      if (!picked) return;
      picked.classList.remove('is-picked');
      picked.setAttribute('aria-pressed', 'false');
      picked = null;
      root.classList && root.classList.remove('is-picking');
      clearMarks();
    }
    function pick(item) {
      unpick();
      picked = item;
      item.classList.add('is-picked');
      item.setAttribute('aria-pressed', 'true');
      if (root.classList) root.classList.add('is-picking');
      allZones().forEach(z => {
        const v = check(item, z);
        z.classList.add(v === false ? 'is-blocked' : 'is-armed');
        if (v === 'conflict') z.classList.add('is-conflict');
      });
      if (onPick) onPick(item);
    }
    function drop(item, zone) {
      const v = check(item, zone);
      clearMarks();
      if (v === false) return;
      onDrop(item, zone, v);
    }

    root.addEventListener('click', e => {
      if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
      const zone = e.target.closest(zones);
      if (picked && zone && root.contains(zone)) { const it = picked; unpick(); drop(it, zone); return; }
      const item = e.target.closest(items);
      if (item && root.contains(item) && !e.target.closest('a, input, select, textarea, [data-no-drag]')) {
        if (picked === item) unpick(); else pick(item);
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape' && picked) { const it = picked; unpick(); it.focus(); return; }
      const item = e.target.closest(items);
      if (item && (e.key === 'Enter' || e.key === ' ') && e.target === item) { e.preventDefault(); item.click(); }
    });

    root.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const item = e.target.closest(items);
      if (!item || !root.contains(item)) return;
      if (handle && !e.target.closest(handle)) return;
      if (e.target.closest('a, input, select, textarea, [data-no-drag]')) return;
      drag = { item, x0: e.clientX, y0: e.clientY, ghost: null, zone: null, id: e.pointerId, scroll: 0 };
    });

    function autoScroll() {
      if (!drag || !drag.ghost) return;
      const y = drag.y, edge = 70;
      const v = y < edge ? -(edge - y) / 4 : y > innerHeight - edge ? (y - innerHeight + edge) / 4 : 0;
      if (v) scrollBy(0, v);
      drag.scroll = requestAnimationFrame(autoScroll);
    }

    window.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      drag.y = e.clientY;
      if (!drag.ghost) {
        if (Math.hypot(dx, dy) < 6) return;
        unpick();
        const r = drag.item.getBoundingClientRect();
        const ghost = drag.item.cloneNode(true);
        ghost.classList.add('dnd-ghost');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        drag.item.classList.add('is-dragging');
        document.documentElement.classList.add('is-dnd');
        drag.scroll = requestAnimationFrame(autoScroll);
      }
      drag.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(1.5deg)`;
      const zone = document.elementFromPoint(e.clientX, e.clientY)?.closest(zones);
      if (zone !== drag.zone) {
        if (drag.zone) drag.zone.classList.remove('is-over', 'is-conflict', 'is-blocked');
        drag.zone = zone && root.contains(zone) ? zone : null;
        if (drag.zone) {
          const v = check(drag.item, drag.zone);
          drag.zone.classList.add(v === false ? 'is-blocked' : 'is-over');
          if (v === 'conflict') drag.zone.classList.add('is-conflict');
        }
      }
    });

    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.ghost) return;
      cancelAnimationFrame(d.scroll);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      d.ghost.remove();
      d.item.classList.remove('is-dragging');
      document.documentElement.classList.remove('is-dnd');
      if (d.zone && e.type === 'pointerup') drop(d.item, d.zone); else clearMarks();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    return { cancel: unpick };
  }

  /* =====================================================================
     頁首、導覽、字級、通知
     ===================================================================== */

  // file:// 或隱私模式下 localStorage 可能被瀏覽器封鎖；字級偏好屬錦上添花，封鎖時改存記憶體
  const prefs = (() => {
    const mem = {};
    let ls = null;
    try { ls = window.localStorage; ls.getItem('probe'); } catch (err) { ls = null; console.info('localStorage unavailable, text size will not persist:', err.message); }
    return {
      get: k => (ls ? ls.getItem(k) : mem[k] ?? null),
      set: (k, v) => { if (ls) ls.setItem(k, v); else mem[k] = v; },
    };
  })();

  const TEXT_SIZES = ['md', 'lg', 'xl'];
  let fitHeader = () => {}; // initHeader 內換成實際的量測函式
  function setTextSize(size) {
    if (!TEXT_SIZES.includes(size)) throw new Error('Unknown text size: ' + size);
    // 根元素用 data-fontsize，避免和按鈕的 [data-textsize] 選擇器撞名
    document.documentElement.dataset.fontsize = size;
    prefs.set('humane-care:textsize', size);
    $$('button[data-textsize]').forEach(b => b.setAttribute('aria-pressed', b.dataset.textsize === size));
    fitHeader();
  }

  function initHeader() {
    const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.site-nav a.nav__link').forEach(a => {
      const on = a.getAttribute('href').split(/[?#]/)[0].toLowerCase() === file;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    const header = $('.site-header');
    const toggle = $('[data-nav-toggle]');
    if (toggle) {
      const setOpen = open => {
        header.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open);
        toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      };
      toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
      $$('.site-nav a').forEach(a => a.addEventListener('click', () => setOpen(false)));
      matchMedia('(min-width: 1081px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
    }

    // 頁首擠不下（字級放大、視窗偏窄）時改用選單；先拿掉 compact 再量，才量得到完整寬度
    const inner = $('.site-header__inner');
    const navList = $('.site-nav .nav');
    fitHeader = () => {
      if (!header || !inner) return;
      header.classList.remove('is-compact');
      const over = inner.scrollWidth > inner.clientWidth + 1 || (navList && navList.scrollWidth > navList.parentElement.clientWidth + 1);
      header.classList.toggle('is-compact', over);
    };
    let fitRaf = 0;
    addEventListener('resize', () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitHeader); });
    document.fonts.ready.then(() => fitHeader());

    const onScroll = () => header && header.classList.toggle('is-scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    setTextSize(prefs.get('humane-care:textsize') || 'md');
    $$('button[data-textsize]').forEach(b => b.addEventListener('click', () => {
      setTextSize(b.dataset.textsize);
      toast(`字級已調整為「${b.getAttribute('aria-label') || b.textContent.trim()}」`, { tone: 'info', icon: 'type', desc: '各頁面都會沿用這個設定。' });
    }));

    $$('[data-bell]').forEach(b => b.addEventListener('click', () => {
      const open = REMINDERS.filter(r => r.open);
      const onIndex = file === 'index.html';
      const html = `<div class="popover__head"><b>需要關懷的提醒</b><span class="badge badge--sun">${open.length} 則</span></div>` +
        (open.length ? `<ul class="popover__list">${open.map(r => `<li><a href="${onIndex ? '' : 'index.html'}#care-${r.id}" class="popover__item"><span class="popover__icon popover__icon--${r.tone}">${icon(r.icon)}</span><span><b>${esc(r.title)}</b><small>${esc(r.when)}</small></span></a></li>`).join('')}</ul>`
          : emptyState({ title: '今天的提醒都處理好了', text: '辛苦了，記得喝口水。' })) +
        `<a class="popover__foot" href="${onIndex ? '' : 'index.html'}#care">到總覽查看全部 ${icon('arrow-right')}</a>`;
      popover(b, html);
    }));
  }

  /* =====================================================================
     提醒（依資料組字，數字與個案同步）
     ===================================================================== */

  const qZhang = quotaOf(getCase('LC115-0452'));
  const wang = getCase('LC115-0418');
  const REMINDERS = [
    {
      id: 'r1', kind: 'carer', tone: 'clay', icon: 'heart', open: true, caseId: 'LC115-0418', when: '今天 10:00 會談',
      title: `${wang.carer.name}的照顧負荷明顯升高`,
      body: `王秀蘭阿嬤的女兒${wang.carer.name}，照顧者負荷量表由 ${wang.carer.zaritPrev} 分升到 ${wang.carer.zarit} 分。她說夜裡常被叫醒，白天還要顧麵攤。`,
      hint: '建議今天會談時一併說明居家喘息（GA09），每月可安排 2 次。',
      action: { label: '加入會談重點', done: '已加入 10:00 會談重點' },
    },
    {
      id: 'r2', kind: 'alone', tone: 'sun', icon: 'phone-missed', open: true, caseId: 'LC115-0397', when: '10/25、10/26 未接通',
      title: '李阿土阿公兩天沒接問安電話',
      body: '鼓樓關懷據點志工 10/25、10/26 致電都沒有接通。阿公有聽力退化，可能沒聽見鈴聲。',
      hint: '阿公住鼓樓街 22 號，離 11:30 督導訪視的府前街很近，可以順路探視。',
      action: { label: '加入今日行程', done: '已加入今日行程 12:20' },
    },
    {
      id: 'r3', kind: 'quota', tone: 'sun', icon: 'wallet', open: true, caseId: 'LC115-0452', when: '今天 13:30 訪視',
      title: `張美珠本月額度已用 ${fmt.pct(qZhang.pct)}`,
      body: `本月額度剩 ${fmt.num(qZhang.remain)} 元，月底前還排了 2 次沐浴（每次 325 元）與 1 趟交通接送，仍在額度內。`,
      hint: '下午訪視時可和張先生討論下月家務協助的頻率。',
      action: { label: '列入訪視提醒', done: '已列入 13:30 訪視提醒' },
    },
    {
      id: 'r4', kind: 'birthday', tone: 'sun', icon: 'cake', open: true, caseId: 'LC115-0331', when: '10/29（四）',
      title: '陳水木阿公週四滿 88 歲',
      body: '米壽快樂！照服員郭建宏想在週四服務時，帶一張全家人簽名的祝壽卡片。',
      hint: '可請中心準備祝壽小卡，週三前交給建宏。',
      action: { label: '準備祝壽小卡', done: '已通知行政準備祝壽小卡' },
    },
    {
      id: 'r5', kind: 'weather', tone: 'sage', icon: 'wind', open: true, caseId: 'LC115-0372', when: '10/29 起',
      title: '週四起轉冷，雲嶺區低溫約 9°C',
      body: '雲嶺區葉天賜阿公有慢性肺病，對低溫較敏感；太太阿梅姨也 84 歲了。',
      hint: '請照服員服務時提醒加衣，並檢查電暖器擺放位置。',
      action: { label: '通知雲嶺區照服員', done: '已傳送提醒給雲嶺區 13 位照服員' },
    },
    {
      id: 'r6', kind: 'review', tone: 'sage', icon: 'calendar', open: true, caseId: 'LC115-0288', when: '11/05、11/08 到期',
      title: '兩位長輩的複評將在 11 月初到期',
      body: '新灣區高淑貞（11/05）與溪洲區簡明輝（11/08）。張雅筑今天上午會先去看高淑貞阿嬤。',
      hint: '簡明輝阿公的太太照顧負荷上升，複評時請一併評估喘息需求。',
      action: { label: '排入複評行程', done: '已排入 11/06 上午複評' },
    },
  ];

  /* =====================================================================
     初始化
     ===================================================================== */

  function init() {
    injectSprite();
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
    // close 事件不冒泡，用捕獲監聽；dialog 關閉後把 toast 容器移回 body
    document.addEventListener('close', e => { if (e.target.tagName === 'DIALOG') setTimeout(placeToastHost); }, true);

    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-open-dialog]');
      if (opener) { openDialog(document.getElementById(opener.dataset.openDialog)); return; }
      const closer = e.target.closest('dialog [data-close]');
      if (closer) { closer.closest('dialog').close(); return; }
      // 頁內錨點平滑捲動：不用全域 CSS scroll-behavior，因為它也會讓程式化的 scrollTo 變慢
      const hashLink = e.target.closest('a[href^="#"]');
      if (hashLink && hashLink.getAttribute('href').length > 1) {
        const target = document.getElementById(decodeURIComponent(hashLink.getAttribute('href').slice(1)));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
          // 焦點跟著移過去（跳到主要內容等），鍵盤使用者才不會留在原處
          if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
          history.pushState(null, '', hashLink.getAttribute('href'));
          dispatchEvent(new HashChangeEvent('hashchange'));
          return;
        }
      }
      const t = e.target.closest('[data-toast]');
      if (t) toast(t.dataset.toast, { tone: t.dataset.toastTone || 'info' });
      // 點 dialog 外的 backdrop 關閉（鍵盤觸發的 click 目標是按鈕，不會走到這裡）
      if (e.target.tagName === 'DIALOG' && e.target.open) {
        const r = e.target.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
      }
    });

    initHeader();
    renderCounts();
    reveal();
    initAnim();
    $$('.draw-scope').forEach(s => (reduceMotion.matches ? draw(s) : whenVisible(s, () => draw(s))));

    // 保底：載入 2.5 秒後，視窗內與已捲過的 [data-reveal] 一律顯示
    setTimeout(() => $$('[data-reveal]:not(.is-in)').forEach(el => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); }), 2500);
  }

  Object.assign(App, {
    ME, NOW,
    DATA: { cases: CASES, caregivers: CAREGIVERS, staff: STAFF, visits: VISITS, reminders: REMINDERS, districts: DISTRICTS, stats: STATS },
    SERVICES, QUOTA, STAGES, ADL_ITEMS, IADL_ITEMS, TIES, KINDS,
    getCase, getCaregiver, getStaff, stageOf, quotaOf, adlTotal, loadLevel, bookingsOf, match, network, counts, emit, renderCounts,
    fmt, toDate, esc, param, $, $$, ease,
    icon, seal, cms, stage, svc, loadChip, scoreRing, caseCard, quotaBar, emptyState,
    toast, openDialog, closeDialog, modal, popover, tabs, seg, reveal, whenVisible, countUp, tween, draw,
    ecomap, ecomapLegend, radar, dnd,
    initAnim, setTextSize,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
