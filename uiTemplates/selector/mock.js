/* 網站樣式選配器・示意網站
 * 把一組選配畫成示意網站：範例內容、各版型模板、主題色計算與預覽框（Preview）。
 */
'use strict';

/* ---------- icons ---------- */
const ICONS={
  doc:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
  cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  card:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  bus:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14M8 17v3M16 17v3"/><path d="M8.5 13.5h.01M15.5 13.5h.01"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  home:'<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  leaf:'<path d="M5 19C5 11 10 6 19 5c0 9-5 14-14 14z"/><path d="M5 19l8-8"/>',
  search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  grid:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.8.6 3 2.3 3 4.7"/>',
  inbox:'<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  chart:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin:'<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  navi:'<path d="M12 3l7 18-7-4-7 4z"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  thumb:'<path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 3l-1 3h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>',
  play:'<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>',
  rss:'<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><path d="M6 18h.01"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  flow:'<rect x="4" y="4" width="4.5" height="16" rx="1"/><rect x="10" y="4" width="4.5" height="10" rx="1"/><rect x="16" y="4" width="4.5" height="13" rx="1"/>',
  download:'<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 18v2h16v-2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
  clip:'<path d="M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7"/>'
};
const ic=(n,w=1.7)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

/* ---------- sample content (fictional city) ---------- */
const SVCS=[
  {i:'doc',t:'線上申辦',d:'戶政、地政 128 項案件免臨櫃'},
  {i:'cal',t:'預約服務',d:'健檢、洽公時段線上預約'},
  {i:'card',t:'規費繳納',d:'信用卡、行動支付皆可'},
  {i:'chat',t:'市長信箱',d:'意見反映 7 日內回覆'},
  {i:'bus',t:'交通資訊',d:'公車動態與停車位查詢'},
  {i:'heart',t:'社會福利',d:'補助資格一鍵試算'},
  {i:'home',t:'住宅服務',d:'社宅申請與租金補貼'},
  {i:'leaf',t:'環境保護',d:'垃圾車即時位置查詢'}
];
const NEWS=[
  {d:'2026.10.28',tag:'公告',t:'115 年度市民健康檢查開放線上預約',u:'衛生局'},
  {d:'2026.10.24',tag:'活動',t:'青川河濱音樂節 11 月 8 日登場',u:'文化局'},
  {d:'2026.10.20',tag:'交通',t:'公車 32 路因道路工程改道行駛',u:'交通局'},
  {d:'2026.10.15',tag:'招募',t:'社區防災志工第二梯次招募中',u:'消防局'}
];
const STATS=[{n:'128',u:'項',l:'線上申辦服務'},{n:'24',u:'小時',l:'全年無休受理'},{n:'96.8',u:'%',l:'市民滿意度'},{n:'3',u:'分鐘',l:'平均申辦時間'}];
const KPIS=[
  {l:'今日新進案件',v:'342',d:'較昨日 +12%',c:'m-up'},
  {l:'處理中案件',v:'1,208',d:'較上週 −4%',c:'m-up'},
  {l:'平均結案天數',v:'2.4',d:'目標 3 天內',c:'m-up'},
  {l:'逾期案件',v:'17',d:'需優先處理',c:'m-down'}
];
const MONTHLY=[3120,2980,3410,3655,3890,3720,4105,4380,4210,4560];
const TODOS=[['審核 3 件低收入戶補助申請',1],['回覆市長信箱逾 5 日案件',0],['更新 11 月交通管制公告',0],['確認健檢合作院所名單',0]];
const CASES=[
  ['A11510280042','戶籍謄本','王○明','ok','已結案','2026.10.28'],
  ['A11510280037','育兒津貼','林○華','info','審核中','2026.10.28'],
  ['A11510270115','停車費退費','陳○宇','warn','待補件','2026.10.27'],
  ['A11510250089','低收入戶補助','張○婷','bad','已逾期','2026.10.25'],
  ['A11510250061','大型垃圾清運','黃○傑','ok','已結案','2026.10.25']
];
const LOCS=[
  {n:'中正區公所',t:'區公所',a:'青川市中正路 1 號',h:'08:30–17:30',d:'0.4 km',s:'ok',st:'服務中'},
  {n:'河濱戶政事務所',t:'戶政事務所',a:'青川市河濱路 128 號',h:'08:00–17:00',d:'1.2 km',s:'ok',st:'服務中'},
  {n:'青川市立圖書館',t:'圖書館',a:'青川市文化街 66 號',h:'09:00–21:00',d:'1.8 km',s:'ok',st:'開放中'},
  {n:'北區運動中心',t:'運動中心',a:'青川市興北路 210 號',h:'06:00–22:00',d:'2.6 km',s:'warn',st:'人潮較多'}
];
const PINS=[[44,30],[27,55],[66,38],[80,72],[18,82]];

/* ---------- mock templates ---------- */
const LOGO='<span class="m-logo"><span class="m-mark">青</span><span class="m-name">青川市民服務網<small>QINGCHUAN CITY</small></span></span>';
function header(util=true,nav=['首頁','市政新聞','便民服務','資料開放','關於本府'],cta='會員登入'){
  return `<header class="m-header">${util?'<div class="m-util"><div class="m-wrap"><span>網站導覽</span><span>無障礙說明</span><span>English</span><span class="m-fs">字級 <b>小</b><b class="on">中</b><b>大</b></span></div></div>':''}<div class="m-wrap m-hbar">${LOGO}<nav class="m-nav">${nav.map((n,i)=>`<span class="${i===0?'is-active':''}">${n}</span>`).join('')}</nav><div class="m-tools"><span class="m-icon-btn">${ic('search')}</span><span class="m-btn m-btn-sm">${cta}</span><span class="m-burger">${ic('menu')}</span></div></div></header>`;
}
const ALERT=`<div class="m-alert"><div class="m-wrap m-alert-in"><span class="m-alert-ic">!</span><b>颱風警報</b><span class="m-alert-txt">10/30（四）全市停止上班上課，各區公所暫停臨櫃服務。</span><span class="m-alert-more">詳細資訊</span></div></div>`;
function footer(c){
  let h='';
  if(c.mods.has('links')) h+=`<section class="m-links"><div class="m-wrap"><h2 class="m-h3">相關連結</h2><div class="m-links-grid">${['青川觀光旅遊網','青川數位學堂','1999 市民熱線','開放資料平台','藝文活動網','市民卡服務網'].map(t=>`<span class="m-card m-linkbox">${t}${ic('ext')}</span>`).join('')}</div></div></section>`;
  if(c.mods.has('feedback')) h+=`<section class="m-feedback"><div class="m-wrap m-fb-in"><b>這個頁面的資訊對您有幫助嗎？</b><div class="m-fb-btns"><span class="m-btn m-btn-sm m-btn-ghost">${ic('thumb')}有幫助</span><span class="m-btn m-btn-sm m-btn-ghost">沒有幫助</span></div><span class="m-meta">更新日期 2026.10.28・瀏覽人次 12,804</span></div></section>`;
  const social=c.mods.has('social')?`<div class="m-social"><span>追蹤我們</span>${['thumb','play','chat','rss'].map(i=>`<span class="m-soc">${ic(i)}</span>`).join('')}</div>`:'';
  h+=`<footer class="m-footer"><div class="m-wrap m-foot-in"><div class="m-foot-main">${LOGO}<p>青川市政府　青川市中正路 1 號<br>服務專線 1999・週一至週五 08:30–17:30</p>${social}</div><div class="m-foot-links"><span>隱私權保護政策</span><span>資訊安全政策</span><span>政府網站資料開放宣告</span></div><span class="m-aa">無障礙 AA</span></div></footer>`;
  return h;
}
const visual=(b,n,e)=>`<div class="m-visual"><span class="v-a"></span><span class="v-b"></span><span class="v-c"></span><span class="v-card"><b>${b}</b><strong>${n}</strong><em>${e}</em></span></div>`;
const scene=cls=>`<div class="m-scene ${cls}"><span class="sc-sun"></span><span class="sc-hill"></span><span class="sc-city"></span><span class="sc-water"></span><span class="sc-tag">${ic('camera')}示意照片</span></div>`;
function dataPanel(){
  const V=MONTHLY,lo=2800,hi=4700;
  const pts=V.map((v,i)=>`${(i/(V.length-1)*200).toFixed(1)},${(56-(v-lo)/(hi-lo)*50).toFixed(1)}`).join(' ');
  return `<div class="m-card m-datahero"><div class="m-dh-head"><span>即時服務數據</span><span class="m-live">● 即時更新</span></div><div class="m-dh-big"><strong>4,560</strong><span>10 月線上申辦件數</span><em class="m-up">較 9 月 +8.3%</em></div><svg class="m-spark" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true"><polygon class="ar" points="0,60 ${pts} 200,60"/><polyline class="ln" points="${pts}"/></svg><div class="m-dh-grid"><div><b>342</b><span>今日受理</span></div><div><b>3 分鐘</b><span>平均申辦</span></div><div><b>96.8%</b><span>市民滿意度</span></div></div></div>`;
}
function heroArt(c,b,n,e){
  if(c.hero===1) return scene('m-photo-frame');
  if(c.hero===2) return dataPanel();
  if(c.hero===3) return '';
  return visual(b,n,e);
}
const newsRows=arr=>arr.map(n=>`<div class="m-news-row"><span class="m-date">${n.d}</span><span class="m-tag">${n.tag}</span><span class="m-news-t">${n.t}</span><span class="m-arr">${ic('arrow')}</span></div>`).join('');
const svcCard=s=>`<div class="m-card m-svc"><span class="m-ico">${ic(s.i)}</span><div><h3 class="m-h3">${s.t}</h3><p class="m-p">${s.d}</p></div></div>`;
const statsBand=()=>`<section class="m-band"><div class="m-wrap m-stats">${STATS.map(s=>`<div class="m-stat"><strong>${s.n}<small>${s.u}</small></strong><p>${s.l}</p></div>`).join('')}</div></section>`;
const sideNav=items=>`<nav class="m-sidenav">${items.map(([i,t,a])=>`<span class="${a?'is-active':''}">${ic(i)}${t}</span>`).join('')}</nav>`;
const mobileTop=(logo=LOGO)=>`<div class="m-mtop">${logo}<span class="m-burger" style="display:grid">${ic('menu')}</span></div>`;
function chart(){
  const fmt=v=>v.toLocaleString('en-US');
  return `<div class="m-plot">${[0,2500,5000].map(t=>`<div class="m-gl" style="bottom:${t/50}%"><i>${fmt(t)}</i></div>`).join('')}<div class="m-bars">${MONTHLY.map((v,i)=>`<span class="m-bar${i===MONTHLY.length-1?' is-last':''}" style="height:${v/50}%">${i===MONTHLY.length-1?`<b>${fmt(v)}</b>`:''}</span>`).join('')}</div></div><div class="m-months">${MONTHLY.map((_,i)=>`<span>${i+1}月</span>`).join('')}</div>`;
}

const TPL={
  l1:c=>{const art=heroArt(c,'今日已受理','342','件線上申辦');return `${header()}
  <section class="m-hero"><div class="m-wrap m-hero-grid${art?'':' is-text'}"><div><div class="m-eyebrow">市民服務・線上辦</div><h1 class="m-h1">市民服務，<br>一次辦好</h1><p class="m-lead">128 項案件線上申辦、預約與繳費，不用跑區公所，手機就能完成。</p><div class="m-actions"><span class="m-btn">開始線上申辦 ${ic('arrow')}</span><span class="m-btn m-btn-ghost">服務指南</span></div></div>${art}</div></section>
  <section class="m-section"><div class="m-wrap"><div class="m-sec-head"><h2 class="m-h2">熱門服務</h2><span class="m-more">全部服務 ${ic('arrow')}</span></div><div class="m-grid-3">${SVCS.slice(0,6).map(svcCard).join('')}</div></div></section>
  <section class="m-section m-alt"><div class="m-wrap m-news-split"><div><div class="m-sec-head"><h2 class="m-h2">最新消息</h2><span class="m-more">更多消息 ${ic('arrow')}</span></div><div class="m-news">${newsRows(NEWS)}</div></div><aside class="m-card m-notice"><div class="m-eyebrow">重要公告</div><h3 class="m-h3">11/8 河濱音樂節交通管制</h3><p class="m-p">當日 14:00–22:00 河濱路封閉，建議搭乘接駁公車前往會場。</p><span class="m-btn m-btn-sm m-btn-ghost">查看管制範圍</span></aside></div></section>
  ${footer(c)}`;},

  l2:c=>`<div class="m-shell"><aside class="m-side">${LOGO}${sideNav([['home','首頁'],['doc','線上申辦',1],['cal','預約服務'],['card','規費繳納'],['grid','資料開放'],['chat','意見信箱']])}<div class="m-side-foot"><b>服務專線 1999</b><br>週一至週五 08:30–17:30</div></aside>
  <div class="m-main">${mobileTop()}<div class="m-topbar"><div class="m-crumb">首頁<i>/</i>便民服務<i>/</i><b>線上申辦</b></div><div class="m-search">${ic('search')}<span>搜尋服務、表單…</span></div></div>
  <div class="m-main-in"><div><div class="m-eyebrow">便民服務</div><h1 class="m-h1 m-h1-sm">線上申辦</h1><p class="m-lead">依類別找到要辦的案件，可直接線上送件，或下載書表臨櫃辦理。</p></div>
  <div class="m-chips">${['全部','戶政','地政','社會福利','交通','環境'].map((t,i)=>`<span class="m-tag${i===0?' is-on':''}">${t}</span>`).join('')}</div>
  <div class="m-grid-2">${SVCS.slice(0,4).map(s=>`<div class="m-card m-svc m-svc-row"><span class="m-ico">${ic(s.i)}</span><div class="m-svc-body"><h3 class="m-h3">${s.t}</h3><p class="m-p">${s.d}</p><div class="m-svc-foot"><span class="m-link">線上送件 ${ic('arrow')}</span><span class="m-meta">約 5 分鐘</span></div></div></div>`).join('')}</div>
  <div class="m-card m-table-card"><div class="m-table-head"><h3 class="m-h3">近期公告</h3><span class="m-more">全部 ${ic('arrow')}</span></div><div class="m-table-scroll"><table class="m-table"><thead><tr><th>發布日期</th><th class="m-hide-s">類別</th><th>標題</th><th class="m-hide-s">單位</th></tr></thead><tbody>${NEWS.map(n=>`<tr><td class="m-date">${n.d}</td><td class="m-hide-s"><span class="m-tag">${n.tag}</span></td><td>${n.t}</td><td class="m-muted m-hide-s">${n.u}</td></tr>`).join('')}</tbody></table></div></div>
  </div>${footer(c)}</div></div>`,

  l3:c=>`${header()}
  <section class="m-portal${c.hero===1?' has-photo':''}">${c.hero===1?scene('m-scene-bg'):''}${c.hero===0?'<span class="m-deco d1"></span><span class="m-deco d2"></span><span class="m-deco d3"></span>':''}<div class="m-wrap"><div class="m-eyebrow">青川市民服務網</div><h1 class="m-h1">您今天想辦理什麼？</h1><div class="m-bigsearch">${ic('search')}<span class="m-ph">輸入關鍵字，例如：戶籍謄本、育兒津貼</span><span class="m-btn">搜尋</span></div><div class="m-hot"><span>熱門搜尋</span>${['戶籍謄本','育兒津貼','停車費','垃圾清運','健康檢查'].map(t=>`<span class="m-tag">${t}</span>`).join('')}</div>${c.hero===2?'<div class="m-qstats"><span><b>342</b>今日受理</span><span><b>3 分鐘</b>平均申辦</span><span><b>96.8%</b>市民滿意度</span></div>':''}</div></section>
  <section class="m-section"><div class="m-wrap"><div class="m-sec-head"><h2 class="m-h2">常用服務</h2><span class="m-more">全部 128 項 ${ic('arrow')}</span></div><div class="m-icon-grid">${SVCS.map(s=>`<div class="m-card m-icon-tile"><span class="m-ico">${ic(s.i)}</span><h3 class="m-h3">${s.t}</h3><p class="m-p">${s.d}</p></div>`).join('')}</div></div></section>
  <section class="m-section m-alt"><div class="m-wrap"><div class="m-tabs"><span class="is-active">最新消息</span><span>活動訊息</span><span>徵才公告</span></div><div class="m-news m-news-2col">${newsRows(NEWS)}</div></div></section>
  ${footer(c)}`,

  l4:c=>{
    const side=[{v:2,tag:'交通',t:'公車 32 路因道路工程改道行駛',d:'2026.10.20'},{v:3,tag:'健康',t:'115 年度市民健康檢查開放線上預約',d:'2026.10.28'}];
    const more=[{v:4,tag:'招募',t:'社區防災志工第二梯次招募中',d:'2026.10.15'},{v:1,tag:'環境',t:'舊城區人行道改善工程年底完工',d:'2026.10.12'},{v:3,tag:'觀光',t:'秋季山線健行路線地圖上線',d:'2026.10.08'}];
    return `${header()}
  <section class="m-section"><div class="m-wrap"><div class="m-mag"><article class="m-card m-feature">${c.hero===1?scene('m-thumb'):'<div class="m-thumb" data-v="1"></div>'}<div class="m-feature-body"><span class="m-tag">焦點</span><h2 class="m-h2 m-h2-lg">青川河濱音樂節 11 月 8 日登場，三十組樂團連演兩天</h2><p class="m-p">今年首度延伸至舊碼頭倉庫群，並加開夜間接駁公車，市民可免費入場。</p><span class="m-date">2026.10.24・文化局</span></div></article>
  <div class="m-mag-side">${side.map(m=>`<article class="m-card m-mini"><div class="m-thumb" data-v="${m.v}"></div><div class="m-mini-body"><span class="m-tag">${m.tag}</span><h3 class="m-h3">${m.t}</h3><span class="m-date">${m.d}</span></div></article>`).join('')}</div></div>
  <div class="m-sec-head"><h2 class="m-h2">更多市政消息</h2><span class="m-more">消息總覽 ${ic('arrow')}</span></div>
  <div class="m-grid-3">${more.map(m=>`<article class="m-card m-story"><div class="m-thumb" data-v="${m.v}"></div><div class="m-story-body"><span class="m-tag">${m.tag}</span><h3 class="m-h3">${m.t}</h3><span class="m-date">${m.d}</span></div></article>`).join('')}</div></div></section>
  ${statsBand()}${footer(c)}`;
  },

  l5:c=>{const art=c.hero===1?visual('本週預約','1,286','人次'):heroArt(c,'本週預約','1,286','人次');return `${header(false,['方案特色','申辦流程','常見問題','聯絡我們'],'立即申辦')}
  <section class="m-hero m-hero-full${c.hero===1?' has-photo':''}">${c.hero===1?scene('m-scene-bg'):''}<div class="m-wrap"><div class="m-eyebrow">115 年度・市民健康檢查</div><h1 class="m-h1">每年一次，<br>免費全身健檢</h1><p class="m-lead">設籍青川市年滿 30 歲市民，線上預約即可在 42 家合作院所免費受檢。</p><div class="m-actions"><span class="m-btn">立即線上預約 ${ic('arrow')}</span><span class="m-btn m-btn-ghost">查看合作院所</span></div></div></section>
  <section class="m-section"><div class="m-wrap m-hero-grid${art?'':' is-solo'}">${art}<div><div class="m-eyebrow">申辦流程</div><h2 class="m-h2">三個步驟完成預約</h2><div class="m-steps">${[['確認資格','輸入身分證字號與生日，系統自動判斷是否符合。'],['選擇院所與時段','依地圖或行政區挑選，即時顯示剩餘名額。'],['收到預約簡訊','檢查前一天再提醒一次，當天出示證件即可。']].map((s,i)=>`<div class="m-step"><span class="m-step-n">${i+1}</span><div><h3 class="m-h3">${s[0]}</h3><p class="m-p">${s[1]}</p></div></div>`).join('')}</div></div></div></section>
  ${statsBand()}
  <section class="m-section"><div class="m-wrap"><div class="m-sec-head"><h2 class="m-h2">常見問題</h2></div><div class="m-faq">${['可以幫家人一起預約嗎？','預約後臨時不能去怎麼辦？','檢查報告多久會出來？'].map((q,i)=>`<div class="m-card m-faq-item"><span>${q}</span><span class="m-faq-ic">${i===0?'−':'+'}</span></div>`).join('')}</div></div></section>
  <section class="m-cta"><div class="m-wrap m-cta-in"><div><h2 class="m-h2">今年度預約至 12 月 15 日止</h2><p>已有 18,240 位市民完成預約</p></div><span class="m-btn">立即預約</span></div></section>
  ${footer(c)}`;},

  l6:c=>adminShell(c,{active:'總覽',crumb:['總覽','案件管理總覽'],tabs:['總覽','案件列表','統計報表'],tab:0,subOn:0,body:`<div class="a-head"><div><h1 class="m-h1 m-h1-sm">案件管理總覽</h1><div class="a-head-meta">早安，陳○安・今天有 ${TODOS.length} 件待辦</div></div><div class="a-actions"><span class="a-range">${ic('cal')}2026/10/29（四）</span></div></div>
  <div class="m-kpis">${KPIS.map(k=>`<div class="m-card m-kpi"><span>${k.l}</span><strong>${k.v}</strong><em class="${k.c}">${k.d}</em></div>`).join('')}</div>
  <div class="m-dash-row"><div class="m-card m-chart"><div class="m-table-head"><h3 class="m-h3">每月申辦件數</h3><span class="m-meta">2026 年 1–10 月</span></div>${chart()}</div>
  <div class="m-card m-todo"><div class="m-table-head"><h3 class="m-h3">待辦事項</h3><span class="m-tag">${TODOS.length}</span></div>${TODOS.map(([t,d])=>`<div class="m-todo-item${d?' done':''}"><span class="m-cbx${d?' on':''}">${d?ic('check',3):''}</span><span>${t}</span></div>`).join('')}</div></div>
  <div class="m-card m-table-card"><div class="m-table-head"><h3 class="m-h3">最新案件</h3><span class="m-more">全部案件 ${ic('arrow')}</span></div><div class="m-table-scroll"><table class="m-table"><thead><tr><th>案件編號</th><th class="m-hide-s">類別</th><th class="m-hide-s">申請人</th><th>狀態</th><th class="m-hide-s">收件日期</th></tr></thead><tbody>${CASES.map(r=>`<tr><td class="m-id">${r[0]}</td><td class="m-hide-s">${r[1]}</td><td class="m-hide-s">${r[2]}</td><td><span class="m-pill ${r[3]}">${r[4]}</span></td><td class="m-date m-hide-s">${r[5]}</td></tr>`).join('')}</tbody></table></div></div>`}),

  l7:c=>`${header()}
  <section class="m-section m-sec-tight"><div class="m-wrap">
  <div class="m-page-top"><div><div class="m-eyebrow">服務據點</div><h1 class="m-h1 m-h1-sm">找離您最近的服務據點</h1></div><div class="m-search m-search-lg">${ic('search')}<span>輸入地址、地標或據點名稱</span></div></div>
  <div class="m-chips">${['全部據點','區公所','戶政事務所','圖書館','運動中心'].map((t,i)=>`<span class="m-tag${i===0?' is-on':''}">${t}</span>`).join('')}</div>
  <div class="m-mapwrap"><div class="m-loclist"><div class="m-meta">共 ${LOCS.length} 個據點・依距離排序</div>${LOCS.map((l,i)=>`<div class="m-card m-loc${i===0?' is-active':''}"><div class="m-loc-top"><div><h3 class="m-h3">${l.n}</h3><span class="m-meta">${l.t}</span></div><span class="m-dist">${l.d}</span></div><div class="m-loc-row">${ic('pin')}${l.a}</div><div class="m-loc-row">${ic('clock')}${l.h}<span class="m-pill ${l.s}">${l.st}</span></div>${i===0?`<div class="m-loc-act"><span class="m-btn m-btn-sm">${ic('navi')}導航</span><span class="m-btn m-btn-sm m-btn-ghost">${ic('phone')}撥打電話</span></div>`:''}</div>`).join('')}</div>
  <div class="m-card m-map"><span class="mp-ground"></span><span class="mp-park"></span><span class="mp-water"></span><span class="mp-rd h1"></span><span class="mp-rd h2"></span><span class="mp-rd v1"></span><span class="mp-rd v2"></span><span class="mp-rd d1"></span><span class="mp-lbl" style="left:12%;top:18%">河濱公園</span><span class="mp-lbl" style="left:58%;top:68%">青川河</span><span class="m-you" style="left:52%;top:47%"></span>${PINS.map((p,i)=>`<span class="m-pin${i===0?' is-active':''}" style="left:${p[0]}%;top:${p[1]}%"></span>`).join('')}<div class="m-pop" style="left:${PINS[0][0]}%;top:${PINS[0][1]}%"><b>${LOCS[0].n}</b><span>${LOCS[0].h}・${LOCS[0].d}</span></div><div class="m-zoom"><span>+</span><span>−</span></div><div class="m-legend"><span><i class="lg-p"></i>服務據點</span><span><i class="lg-a"></i>目前選取</span></div></div></div>
  </div></section>${footer(c)}`,

  l8:c=>`${header()}
  <section class="m-section m-sec-tight"><div class="m-wrap">
  <div class="m-crumb">首頁<i>/</i>線上申辦<i>/</i>社會福利<i>/</i><b>育兒津貼</b></div>
  <div class="m-form-head"><h1 class="m-h1 m-h1-sm">育兒津貼線上申請</h1><span class="m-meta">暫存編號 A1151029-0128・2 分鐘前自動儲存</span></div>
  <ol class="m-stepper">${[['申請資格','done'],['填寫資料','done'],['上傳文件','now'],['確認送出','']].map((s,i)=>`<li class="${s[1]}"><span class="n">${s[1]==='done'?ic('check',3):i+1}</span>${s[0]}</li>`).join('')}</ol>
  <div class="m-form-grid"><div class="m-card m-form">
    <div><h2 class="m-h2 m-h2-sm">上傳證明文件</h2><p class="m-p">請上傳以下文件的照片或 PDF，單一檔案 10 MB 以內。</p></div>
    <div class="m-field-row"><div class="m-field"><label>申請人</label><div class="m-input ro">林○華</div></div><div class="m-field"><label>子女出生日期</label><div class="m-input">2026 / 08 / 14 ${ic('cal')}</div></div></div>
    <div class="m-field"><label>文件類型 <em>*</em></label><div class="m-input">戶口名簿影本（需含子女頁）<span class="m-muted">▾</span></div></div>
    <div class="m-drop"><span class="m-ico">${ic('upload')}</span><b>拖曳檔案到這裡，或 <u>選擇檔案</u></b><span>支援 JPG、PNG、PDF</span></div>
    <div class="m-file"><span class="m-ico m-ico-sm">${ic('doc')}</span><div><b>戶口名簿影本.pdf</b><span class="m-meta">1.2 MB・上傳完成</span></div><span class="m-pill ok">完成</span></div>
    <div class="m-file"><span class="m-ico m-ico-sm">${ic('doc')}</span><div><b>存摺封面.jpg</b><span class="m-meta">2.4 MB・上傳中 64%</span><div class="m-prog"><i></i></div></div><span class="m-x">${ic('x')}</span></div>
    <div class="m-agree"><span class="m-cbx on">${ic('check',3)}</span>本人確認上傳的文件內容屬實</div>
    <div class="m-form-act"><span class="m-btn m-btn-ghost">上一步</span><span class="m-btn">下一步：確認送出 ${ic('arrow')}</span></div>
  </div>
  <aside class="m-form-side"><div class="m-card m-notice"><div class="m-eyebrow">申請須知</div><ul class="m-list"><li>設籍青川市滿 6 個月</li><li>子女未滿 2 歲</li><li>審核約 7 個工作天</li><li>核准後次月 10 日撥款</li></ul></div><div class="m-card m-notice"><h3 class="m-h3">需要協助？</h3><p class="m-p">撥打 1999 轉社會局，或使用線上客服。</p><span class="m-btn m-btn-sm m-btn-ghost">線上客服</span></div></aside>
  </div></div></section>${footer(c)}`
};
/* ---------- admin system templates ---------- */
const ALOGO='<span class="m-logo"><span class="m-mark">青</span><span class="m-name">案件管理系統<small>QINGCHUAN ADMIN</small></span></span>';
const ALERT_SYS=`<div class="m-alert is-sys"><div class="m-wrap m-alert-in"><span class="m-alert-ic" style="color:#7A4F00">!</span><b>系統維護公告</b><span class="m-alert-txt">11/2（日）22:00–24:00 進行系統維護，期間暫停所有服務，請提前儲存作業。</span><span class="m-alert-more">查看說明</span></div></div>`;
const ANAV=[['grid','總覽'],['inbox','案件管理','12'],['flow','流程看板'],['chart','統計報表'],['users','帳號權限'],['gear','系統設定']];
const ASUB={
  '總覽':[['今日概況'],['我的待辦','4'],['系統公告','2']],
  '案件管理':[['全部案件','1,284'],['待受理','12'],['審核中','37'],['待補件','9'],['已結案','1,209'],['逾期案件','17']],
  '流程看板':[['我的看板'],['全部承辦'],['已封存']],
  '統計報表':[['申辦統計'],['處理效率'],['滿意度調查'],['匯出紀錄']],
  '帳號權限':[['角色權限'],['帳號管理','34'],['登入紀錄'],['操作紀錄']]
};
const NOTIF=`<div class="a-notif"><div class="a-notif-h"><b>通知</b><span class="m-link">全部標為已讀</span></div>${[['bad','A11510250089 已逾期 2 天，請優先處理','10 分鐘前'],['warn','主管退回 1 件育兒津貼申請','1 小時前'],['info','系統將於 11/2 22:00 進行維護','昨天']].map(([k,t,w])=>`<div class="a-notif-i"><span class="a-dot ${k}"></span><div><b>${t}</b><small>${w}</small></div></div>`).join('')}</div>`;
function adminShell(c,o){
  const notif=c.mods.has('notify');
  const nav=`<nav class="m-sidenav">${ANAV.map(([i,t,n])=>`<span class="${t===o.active?'is-active':''}">${ic(i)}<em>${t}</em>${n?`<i class="a-count">${n}</i>`:''}</span>`).join('')}</nav>`;
  const sub=`<aside class="a-sub"><h4>${o.active}</h4>${(ASUB[o.active]||[]).map(([t,n],i)=>`<span class="${i===(o.subOn||0)?'is-active':''}">${t}${n?`<em>${n}</em>`:''}</span>`).join('')}</aside>`;
  const crumb=o.crumb.map((x,i,a)=>i===a.length-1?`<b>${x}</b>`:x).join('<i>/</i>');
  const top=`<div class="m-topbar a-top"><div class="a-topnav">${ALOGO}<nav>${ANAV.map(([,t])=>`<span class="${t===o.active?'is-active':''}">${t}</span>`).join('')}</nav></div><div class="m-crumb">${crumb}</div><div class="m-top-r"><div class="m-search">${ic('search')}<span>搜尋案件編號、申請人</span></div>${notif?`<span class="a-bell">${ic('bell')}<i>3</i></span>`:''}<span class="a-user"><span class="m-avatar">陳</span><span class="a-user-t"><b>陳○安</b><small>承辦人員</small></span></span></div>${notif?NOTIF:''}</div>`;
  const tabs=`<div class="a-tabs">${(o.tabs||[]).map((t,i)=>`<span class="a-tab${i===o.tab?' is-active':''}">${t}<i>×</i></span>`).join('')}</div>`;
  return `<div class="m-shell a-shell"><aside class="m-side a-side">${ALOGO}${nav}<div class="m-side-foot"><b>陳○安</b><br>承辦人員・社會局</div></aside>${sub}<div class="m-main">${c.mods.has('watermark')?'<div class="a-wm"></div>':''}${mobileTop(ALOGO)}${top}${tabs}<div class="m-main-in">${o.body}</div></div></div>`;
}
const fld=(l,v,o={})=>`<div class="m-field${o.span?' a-span':''}"><label>${l}</label><div class="m-input${o.ro?' ro':''}">${v}${o.icon?ic(o.icon):''}</div></div>`;
const LIST=[
  ['A11510290012','育兒津貼','周○豪','陳○安','info','待受理','2026.10.29','11.05',0],
  ['A11510280042','戶籍謄本','王○明','李○婷','ok','已結案','2026.10.28','—',0],
  ['A11510280037','育兒津貼','林○華','陳○安','info','審核中','2026.10.28','11.04',0],
  ['A11510270115','停車費退費','陳○宇','張○文','warn','待補件','2026.10.27','11.03',0],
  ['A11510260078','低收入戶補助','吳○儀','張○文','info','審核中','2026.10.26','11.02',0],
  ['A11510250089','低收入戶補助','張○婷','李○婷','bad','已逾期','2026.10.25','10.27',1],
  ['A11510250061','大型垃圾清運','黃○傑','張○文','ok','已結案','2026.10.25','—',0],
  ['A11510240033','租金補貼','蔡○萱','陳○安','warn','待補件','2026.10.24','10.31',0]
];
function tplList(c){
  const bulk=c.mods.has('bulk'),selIdx=[0,2,4];
  const body=`<div class="a-head"><div><h1 class="m-h1 m-h1-sm">案件列表</h1><div class="a-head-meta">共 1,284 筆・今日新增 34 筆</div></div><div class="a-actions"><span class="m-btn m-btn-ghost">${ic('download')}匯出</span><span class="m-btn">${ic('plus')}新增案件</span></div></div>
  <div class="m-card a-filter"><div class="a-filter-row"><div class="m-search">${ic('search')}<span>案件編號、申請人姓名</span></div><span class="a-sel"><em>類別</em>全部</span><span class="a-sel"><em>狀態</em>全部</span><span class="a-sel">${ic('cal')}2026/10/01 – 10/29</span><span class="m-btn m-btn-sm">篩選</span></div><div class="a-chipline"><span>篩選條件</span><span class="a-fchip">收件日期：10/01–10/29 ${ic('x')}</span><span class="a-fchip">承辦單位：社會局 ${ic('x')}</span><span class="m-link">清除全部</span></div></div>
  <div class="m-card m-table-card"><div class="m-table-scroll"><table class="m-table a-table"><thead><tr><th><span class="a-cb${bulk?' part':''}"></span></th><th>案件編號</th><th class="m-hide-s">類別</th><th>申請人</th><th class="m-hide-s">承辦人</th><th>狀態</th><th class="m-hide-s">收件日期 ▾</th><th class="m-hide-s">處理期限</th><th class="m-hide-s"></th></tr></thead><tbody>${LIST.map((r,i)=>{const sel=bulk&&selIdx.includes(i);return `<tr class="${sel?'is-sel':''}"><td><span class="a-cb${sel?' on':''}">${sel?ic('check',3):''}</span></td><td class="m-id">${r[0]}</td><td class="m-hide-s">${r[1]}</td><td>${r[2]}</td><td class="m-hide-s">${r[3]}</td><td><span class="m-pill ${r[4]}">${r[5]}</span></td><td class="m-date m-hide-s">${r[6]}</td><td class="m-hide-s m-num${r[8]?' a-late':''}">${r[7]}</td><td class="m-hide-s a-more">⋯</td></tr>`;}).join('')}</tbody></table></div><div class="a-pager"><span>顯示第 1–8 筆，共 1,284 筆</span><div class="a-pages"><span>‹</span><span class="is-on">1</span><span>2</span><span>3</span><span class="gap">…</span><span>161</span><span>›</span></div><span class="a-sel">每頁 8 筆</span></div></div>`;
  return adminShell(c,{active:'案件管理',crumb:['案件管理','案件列表'],tabs:['總覽','案件列表','A11510280037'],tab:1,subOn:0,body});
}
function tplDetail(c){
  const body=`<span class="a-back">${ic('back')}返回案件列表</span>
  <div class="a-head"><div><h1 class="m-h1 m-h1-sm">育兒津貼申請</h1><div class="a-head-meta"><span class="m-id">A11510280037</span><span class="m-pill info">審核中</span><span>收件 2026.10.28 14:02</span></div></div><div class="a-actions"><span class="m-btn m-btn-ghost">退回補件</span><span class="m-btn">${ic('check')}核准</span></div></div>
  <div class="a-detail"><div class="m-card a-form"><div class="a-stabs"><span class="is-active">基本資料</span><span>附件文件（2）</span><span>審核意見</span><span>異動紀錄</span></div><div class="a-form-body">
  <p class="a-sec-t">申請人</p><div class="a-grid2">${fld('姓名','林○華',{ro:1})}${fld('身分證字號','A2••••••89',{ro:1,icon:'lock'})}${fld('聯絡電話','0912-•••-321')}${fld('電子郵件','lin••••@mail.example')}</div>
  <p class="a-sec-t">申請內容</p><div class="a-grid2">${fld('子女姓名','黃○安')}${fld('子女出生日期','2026 / 08 / 14',{icon:'cal'})}${fld('戶籍地址','青川市河濱路 128 號 5 樓',{span:1})}${fld('補助金額','每月 NT$ 5,000',{ro:1})}${fld('撥款帳戶','•••-•••••-1234',{ro:1,icon:'lock'})}</div>
  <div class="m-field"><label>審核意見</label><div class="m-textarea">文件齊全，戶籍與子女出生資料經戶政系統比對相符，建議核准。</div></div>
  </div><div class="a-savebar"><span class="a-dot warn"></span><span class="grow">有 1 項未儲存的變更</span><span class="m-btn m-btn-sm m-btn-ghost">取消</span><span class="m-btn m-btn-sm">儲存</span></div></div>
  <aside class="a-side-col"><div class="m-card a-meta"><h3 class="m-h3">案件資訊</h3><dl class="a-kv"><dt>承辦人</dt><dd>陳○安</dd><dt>申請來源</dt><dd>線上申辦</dd><dt>處理期限</dt><dd>2026.11.04（剩 6 天）</dd><dt>附件</dt><dd>2 份</dd></dl></div><div class="m-card a-meta"><h3 class="m-h3">審核歷程</h3><ol class="a-tl"><li>民眾線上送件<small>10.28 14:02・林○華</small></li><li>系統自動檢核通過<small>10.28 14:03・系統</small></li><li>分案給承辦人<small>10.28 16:30・李○婷</small></li><li class="now">審核中<small>10.29 09:15・陳○安</small></li></ol></div></aside></div>`;
  return adminShell(c,{active:'案件管理',crumb:['案件管理','案件列表','A11510280037'],tabs:['總覽','案件列表','A11510280037'],tab:2,subOn:2,body});
}
const KCOLS=[
  {n:'待受理',c:'--m-pt',items:[['A11510290012','育兒津貼・周○豪','11/05',0,2,'陳'],['A11510290008','租金補貼・何○琪','11/05',0,1,'李'],['A11510280051','身障補助・許○維','11/04',0,3,'陳']]},
  {n:'審核中',c:'--m-warn',items:[['A11510280037','育兒津貼・林○華','11/04',0,2,'陳'],['A11510260078','低收入戶補助・吳○儀','11/02',0,4,'張']]},
  {n:'待補件',c:'--m-bad',items:[['A11510250089','低收入戶補助・張○婷','逾期 2 天',1,1,'李'],['A11510240033','租金補貼・蔡○萱','10/31',0,0,'陳']]},
  {n:'已結案',c:'--m-ok',items:[['A11510280042','戶籍謄本・王○明','10/28 結案',0,1,'李'],['A11510250061','大型垃圾清運・黃○傑','10/26 結案',0,0,'張']]}
];
function tplBoard(c){
  const total=KCOLS.reduce((s,col)=>s+col.items.length,0);
  const body=`<div class="a-head"><div><h1 class="m-h1 m-h1-sm">審核流程看板</h1><div class="a-head-meta">社會局・本週 ${total} 件案件</div></div><div class="a-actions"><span class="a-viewseg"><span class="is-on">看板</span><span>列表</span></span><span class="m-btn">${ic('plus')}新增案件</span></div></div>
  <div class="m-chips"><span class="m-tag is-on">我負責的</span><span class="m-tag">全部承辦</span><span class="m-tag">即將到期</span></div>
  <div class="a-board">${KCOLS.map(col=>`<div class="a-col"><div class="a-col-h"><i style="background:var(${col.c})"></i>${col.n}<em>${col.items.length}</em></div>${col.items.map(k=>`<div class="m-card a-kcard"><span class="m-id">${k[0]}</span><b>${k[1]}</b><div class="a-kfoot"><span class="a-due${k[3]?' late':''}">${ic('clock')}${k[2]}</span><span class="a-kmeta">${k[4]?`<span class="a-due">${ic('clip')}${k[4]}</span>`:''}<span class="a-av">${k[5]}</span></span></div></div>`).join('')}<div class="a-kadd">＋ 新增卡片</div></div>`).join('')}</div>`;
  return adminShell(c,{active:'流程看板',crumb:['流程看板','我的看板'],tabs:['總覽','流程看板','A11510280037'],tab:1,subOn:0,body});
}
const ROLES=[['系統管理員','完整權限',2],['承辦人員','處理指派的案件',18],['主管審核','核准與退回案件',4],['唯讀查詢','只能檢視與匯出',7],['委外廠商','限系統維護設定',3]];
const PERMS=[['案件管理',[1,1,1,0,1]],['流程看板',[1,1,1,0,0]],['統計報表',[1,0,0,0,1]],['帳號權限',[0,0,0,0,0]],['系統設定',[0,0,0,0,0]],['個資欄位',[1,0,0,0,0],'遮蔽顯示，匯出需主管核准']];
function tplPerm(c){
  const total=ROLES.reduce((s,r)=>s+r[2],0);
  const body=`<div class="a-head"><div><h1 class="m-h1 m-h1-sm">角色權限設定</h1><div class="a-head-meta">共 ${ROLES.length} 個角色・${total} 個帳號</div></div><div class="a-actions"><span class="m-btn m-btn-ghost">${ic('download')}匯出權限表</span><span class="m-btn">${ic('plus')}新增角色</span></div></div>
  <div class="a-perm"><div class="m-card a-roles">${ROLES.map((r,i)=>`<div class="a-role${i===1?' is-active':''}"><div><b>${r[0]}</b><small>${r[1]}</small></div><span class="a-count">${r[2]}</span></div>`).join('')}</div>
  <div class="m-card a-matrix-card"><div class="a-mhead"><div><h3 class="m-h3">承辦人員</h3><p class="m-p">處理指派給自己的案件，可檢視與編輯，不能刪除資料或管理帳號。</p></div><span class="m-pill info">${ROLES[1][2]} 位成員</span></div><div class="m-table-scroll"><table class="m-table a-matrix"><thead><tr><th>功能</th>${['檢視','新增','編輯','刪除','匯出'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${PERMS.map(p=>`<tr><td><b>${p[0]}</b>${p[2]?`<span class="a-lock">${ic('lock')}${p[2]}</span>`:''}</td>${p[1].map(v=>`<td><span class="a-tg${v?' on':''}">${v?ic('check',3):''}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="a-members"><span class="a-stack">${['陳','李','張','吳','劉'].map(x=>`<span class="a-av">${x}</span>`).join('')}</span><span>陳○安、李○婷、張○文等 ${ROLES[1][2]} 位成員</span><span class="m-link">管理成員 ${ic('arrow')}</span></div><div class="a-savebar"><span class="grow">權限異動需經主管核准才會生效，並留存操作紀錄。</span><span class="m-btn m-btn-sm m-btn-ghost">還原</span><span class="m-btn m-btn-sm">送出審核</span></div></div></div>`;
  return adminShell(c,{active:'帳號權限',crumb:['帳號權限','角色權限'],tabs:['總覽','角色權限','帳號管理'],tab:1,subOn:0,body});
}
function tplLogin(c){
  const photo=c.hero===1;
  return `<div class="a-login"><div class="a-brand${photo?' has-photo':''}">${photo?scene('m-scene-bg'):'<span class="m-deco d1"></span><span class="m-deco d2"></span><span class="m-deco d3"></span>'}<div>${ALOGO}</div><div><div class="m-eyebrow">青川市政府・社會局</div><h1 class="m-h1">案件管理系統</h1><p class="m-lead">受理、審核、追蹤，所有申辦案件在同一個地方處理。</p></div><div class="a-brand-foot"><span>系統問題請洽資訊室，分機 2268</span><span>建議使用 Chrome、Edge 最新版本瀏覽</span></div></div>
  <div class="a-login-main"><div class="m-card a-login-card"><div><h2 class="m-h2">登入系統</h2><p class="m-p">請使用機關配發的帳號登入。</p></div><div class="a-ltabs"><span class="is-active">帳號密碼</span><span>自然人憑證</span></div>${fld('帳號','chen.an')}${fld('密碼','••••••••••',{icon:'eye'})}<div class="m-field"><label>驗證碼</label><div class="a-captcha"><div class="m-input"></div><span class="a-cimg">7K3P</span><span class="a-refresh">${ic('refresh')}</span></div></div><div class="a-remember"><span class="m-agree"><span class="m-cbx on">${ic('check',3)}</span>記住帳號</span><span class="m-link">忘記密碼？</span></div><span class="m-btn">登入</span><p class="a-legal">本系統僅限授權人員使用，所有操作均留存紀錄。<br>首次登入請先變更預設密碼。</p></div></div></div>`;
}
const CLOSED=[2850,2900,3200,3480,3600,3650,3890,4120,4080,4300];
const CATS=[['戶政',34],['社會福利',26],['地政',18],['交通',12],['其他',10]];
const DIST=[['中正區','9,820','2.1',96],['河濱區','8,145','2.6',92],['東湖區','7,410','2.9',89],['北區','6,980','3.4',84],['山城區','5,675','2.4',94]];
function lineChart(){
  const fmt=v=>v.toLocaleString('en-US'),n=MONTHLY.length;
  const pts=a=>a.map((v,i)=>`${(i/(n-1)*100).toFixed(2)},${(100-v/50).toFixed(2)}`).join(' ');
  const last=MONTHLY[n-1];
  return `<div class="a-lplot">${[0,2500,5000].map(t=>`<div class="m-gl" style="bottom:${t/50}%"><i>${fmt(t)}</i></div>`).join('')}<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon class="a-la" points="0,100 ${pts(MONTHLY)} 100,100"/><polyline class="a-l2" points="${pts(CLOSED)}"/><polyline class="a-l1" points="${pts(MONTHLY)}"/></svg><span class="a-pt" style="left:100%;bottom:${last/50}%"></span><span class="a-pt-l" style="left:100%;bottom:${last/50}%">${fmt(last)}</span></div><div class="a-months">${MONTHLY.map((_,i)=>`<span style="left:${(i/(n-1)*100).toFixed(2)}%">${i+1}月</span>`).join('')}</div>`;
}
function tplReport(c){
  const sum=a=>a.reduce((s,v)=>s+v,0),fmt=v=>v.toLocaleString('en-US');
  const inN=sum(MONTHLY),outN=sum(CLOSED),rate=(outN/inN*100).toFixed(1);
  const kp=[['本年累計申辦',fmt(inN),'較去年同期 +6.2%','m-up'],['本年累計結案',fmt(outN),'較去年同期 +7.9%','m-up'],['結案率',rate+'%','目標 92%，已達成','m-up']];
  const dv=['--d1','--d2','--d3','--d4','--d5'];
  const body=`<div class="a-head"><div><h1 class="m-h1 m-h1-sm">統計報表</h1><div class="a-head-meta">資料更新於 2026.10.29 06:00</div></div><div class="a-actions"><span class="a-range">${ic('cal')}2026/01/01 – 2026/10/29</span><span class="a-viewseg"><span>日</span><span>週</span><span class="is-on">月</span></span><span class="m-btn m-btn-ghost">${ic('download')}匯出 Excel</span></div></div>
  <div class="a-kpis3">${kp.map(k=>`<div class="m-card m-kpi"><span>${k[0]}</span><strong>${k[1]}</strong><em class="${k[3]}">${k[2]}</em></div>`).join('')}</div>
  <div class="a-charts"><div class="m-card a-line"><div class="m-table-head"><h3 class="m-h3">每月申辦與結案件數</h3><div class="a-legend"><span><i style="background:var(--m-p)"></i>申辦</span><span><i class="dash"></i>結案</span></div></div>${lineChart()}</div>
  <div class="m-card a-donut-card"><div class="m-table-head"><h3 class="m-h3">案件類別占比</h3><span class="m-meta">本年累計</span></div><div class="a-donut-wrap"><div class="a-dn"><div class="a-donut"></div><div class="a-dn-c"><b>${fmt(inN)}</b><span>件</span></div></div><ul class="a-dleg">${CATS.map((x,i)=>`<li><i style="background:var(${dv[i]})"></i>${x[0]}<b>${x[1]}%</b></li>`).join('')}</ul></div></div></div>
  <div class="m-card m-table-card"><div class="m-table-head"><h3 class="m-h3">各區處理效率</h3><span class="m-meta">目標：3 天內結案、達成率 90% 以上</span></div><div class="m-table-scroll"><table class="m-table"><thead><tr><th>行政區</th><th class="m-hide-s">受理件數</th><th>平均天數</th><th>達成率</th></tr></thead><tbody>${DIST.map(d=>`<tr><td>${d[0]}</td><td class="m-hide-s m-num">${d[1]}</td><td class="m-num">${d[2]} 天</td><td><span class="a-rate"><i><b class="${d[3]<90?'lo':''}" style="width:${d[3]}%"></b></i><span class="m-num">${d[3]}%</span></span></td></tr>`).join('')}</tbody></table></div></div>`;
  return adminShell(c,{active:'統計報表',crumb:['統計報表','申辦統計'],tabs:['總覽','案件列表','統計報表'],tab:2,subOn:0,body});
}
Object.assign(TPL,{l9:tplList,l10:tplDetail,l11:tplBoard,l12:tplPerm,l13:tplLogin,l14:tplReport});

function floats(m,l){
  const has=k=>m.has(k)&&modApplies(k,l);
  let h='';
  const parts=[];
  if(has('top')) parts.push(`<span class="m-fab m-fab-top">${ic('up')}</span>`);
  if(has('chat')) parts.push(`<span class="m-chat-bubble">您好！有什麼可以幫您？</span><span class="m-fab m-fab-chat">${ic('chat')}<b>線上客服</b></span>`);
  if(parts.length) h+=`<div class="m-fabs">${parts.join('')}</div>`;
  const mid=[];
  if(has('timeout')) mid.push(`<div class="a-timeout"><span class="t-ic">${ic('clock')}</span><div class="t-tx"><b>閒置提醒</b><span>您已 28 分鐘沒有操作，系統將於 <code>01:58</code> 後自動登出。</span></div><span class="m-btn m-btn-sm m-btn-ghost">立即登出</span><span class="m-btn m-btn-sm">繼續使用</span></div>`);
  if(has('bulk')) mid.push(`<div class="a-bulk"><b>已選取 3 筆</b><span class="sep"></span><span>${ic('users')}批次指派</span><span>${ic('flow')}變更狀態</span><span>${ic('download')}匯出</span><span class="sep"></span><span>${ic('x')}取消選取</span></div>`);
  if(mid.length) h+=`<div class="a-floats">${mid.join('')}</div>`;
  if(has('cookie')) h+=`<div class="m-cookie"><div><b>本網站使用 Cookie</b>　用於統計瀏覽人次與改善服務，詳見隱私權保護政策。</div><span class="m-btn m-btn-sm m-btn-ghost">僅限必要</span><span class="m-btn m-btn-sm">全部接受</span></div>`;
  return h;
}

function theme(s){
  const st=byId(STYLES,s.style),c=paletteOf(s),W='#FFFFFF';
  const dark=s.mode===2||(s.mode!==1&&!!st.dark);
  let bg,surface,ink,p,deep;
  if(dark){
    bg=st.id==='s8'?'#16140F':'#0C1015';
    surface=st.id==='s4'?bg:st.id==='s8'?'#1F1C16':'#141A22';
    ink='#E4E9EF';p=c.pd;deep=mix(c.pd,bg,.16);
  }else{
    ink=c.ink;p=c.p;deep=c.deep;
    bg={s1:W,s2:mix(c.p,W,.04),s3:mix(c.ink,W,.035),s4:'#FAFAF7',s5:mix(c.a,W,.09),s6:'#F6F8FA',s7:mix(c.p,'#F4F6FA',.06),s8:mix(c.a,'#FBF8F1',.05),s9:'#F7F8FA'}[st.id]||W;
    surface=st.id==='s4'?bg:st.id==='s8'?'#FFFDF8':W;
  }
  const onP=onColor(p);
  let pt=p;
  for(let t=.92;contrast(pt,bg)<4.6&&t>0;t-=.08) pt=mix(p,ink,t);
  if(contrast(pt,bg)<4.6) pt=ink;
  return {dark,bg,surface,ink,p,pt,deep,a:c.a,onP,onDeep:onColor(deep),onA:onColor(c.a),pRatio:contrast(p,onP),bodyRatio:contrast(ink,bg),ptRatio:contrast(pt,bg)};
}
const navEff=s=>s.nav===1?'plain':s.nav===2?'brand':s.nav===3?'deep':(s.style==='s3'?'brand':(s.side===3&&isAdmin(s.layout))?'deep':'plain');
function applyMock(el,s){
  const t=theme(s);
  const map={'--m-bg':t.bg,'--m-surface':t.surface,'--m-ink':t.ink,'--m-p':t.p,'--m-pt':t.pt,'--m-on-p':t.onP,'--m-deep':t.deep,'--m-on-deep':t.onDeep,'--m-a':t.a,'--m-on-a':t.onA};
  for(const k in map) el.style.setProperty(k,map[k]);
  if(s.font){el.style.setProperty('--m-fh',FONTVARS[s.font]);el.style.setProperty('--m-fb',FONTVARS[s.font]);}
  else{el.style.removeProperty('--m-fh');el.style.removeProperty('--m-fb');}
  if(s.button) el.style.setProperty('--m-rb',BTNR[s.button]); else el.style.removeProperty('--m-rb');
  el.dataset.style=s.style;
  el.dataset.nav=navEff(s);
  el.dataset.density='d'+s.density;
  el.dataset.side=String(s.side||0);
  el.dataset.table=String(s.table||0);
  el.dataset.tabs=String(s.tabs||0);
  el.toggleAttribute('data-dark',t.dark);
  return t;
}

/* ---------- preview frames ---------- */
class Preview{
  constructor(root){
    this.root=root;
    root.innerHTML=`<div class="device"><div class="browser-bar"><i></i><i></i><i></i><span class="url">https://www.qingchuan.example</span></div><div class="viewport" tabindex="0" aria-label="網站示意畫面，可捲動檢視"><div class="scaler"><div class="mock" inert></div></div><div class="vp-float"><div class="mock mock-float" inert></div></div></div></div>`;
    this.vp=$('.viewport',root);this.scaler=$('.scaler',root);this.mock=$('.scaler>.mock',root);this.float=$('.mock-float',root);
    this.raf=0;
    if('ResizeObserver' in window){this.ro=new ResizeObserver(()=>this.queue());this.ro.observe(this.vp);this.ro.observe(this.mock);}
  }
  get base(){return this.root.dataset.device==='phone'?390:1200;}
  setDevice(d){this.root.dataset.device=d;}
  render(s){
    const dev=this.root.dataset.device,mods=new Set(s.mods);
    applyMock(this.mock,s);applyMock(this.float,s);
    this.mock.style.width=this.base+'px';this.float.style.width=this.base+'px';
    const act=new Set([...mods].filter(k=>modApplies(k,s.layout)));
    const ck=[s.layout,dev,s.hero,['alert','links','feedback','social','notify','watermark','bulk'].filter(k=>act.has(k)).join('.')].join('|');
    if(this.ck!==ck){
      const prevLayout=this.ck?this.ck.split('|')[0]+this.ck.split('|')[1]:'';
      this.mock.innerHTML=(act.has('alert')?(isAdmin(s.layout)?ALERT_SYS:ALERT):'')+TPL[s.layout]({hero:s.hero,mods:act,layout:s.layout});
      if(prevLayout!==s.layout+dev) this.vp.scrollTop=0;
      this.ck=ck;
    }
    const fk=s.layout+':'+['chat','cookie','top','timeout','bulk'].filter(k=>act.has(k)).join('.');
    if(this.fk!==fk){
      this.float.innerHTML=floats(act,s.layout);
      this.float.classList.toggle('has-cookie',act.has('cookie'));
      this.float.classList.toggle('has-fab',act.has('chat')||act.has('top'));
      this.fk=fk;
    }
    const key=enc(s)+dev;
    if(this.key&&this.key!==key){this.mock.classList.remove('swap');void this.mock.offsetWidth;this.mock.classList.add('swap');}
    this.key=key;
    this.fit();
  }
  queue(){cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(()=>this.fit());}
  fit(){
    const w=this.vp.clientWidth;if(!w)return;
    const k=w/this.base;
    this.mock.style.transform=`scale(${k})`;
    this.float.style.transform=`scale(${k})`;
    this.scaler.style.width=w+'px';
    this.scaler.style.height=Math.ceil(this.mock.offsetHeight*k)+'px';
  }
  destroy(){if(this.ro)this.ro.disconnect();cancelAnimationFrame(this.raf);}
}

(function injectWatermark(){
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><text x='160' y='96' text-anchor='middle' transform='rotate(-22 160 90)' font-family='sans-serif' font-size='15' fill='black'>陳○安 A10427・2026/10/29 14:32</text></svg>`;
  const u=`url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  const st=document.createElement('style');
  st.textContent=`.a-wm{-webkit-mask-image:${u};mask-image:${u}}`;
  (document.head||document.documentElement).appendChild(st);
})();
