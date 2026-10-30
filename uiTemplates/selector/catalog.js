/* 網站樣式選配器・選項目錄
 * 可以選的東西：版型、風格、色系、細節、功能模組、情境起手式，以及組合代碼與色彩計算。後面的 mock.js、selector.js 都會用到這裡的常數。
 */
'use strict';

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const byId=(arr,id)=>arr.find(x=>x.id===id);
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

/* ---------- catalogue ---------- */
const LAYOUTS=[
  {id:'l1',g:'front',name:'經典橫幅',desc:'上方導覽搭配大型主視覺，內容由上往下依序展開。',fit:'機關官網、企業形象'},
  {id:'l2',g:'front',name:'側欄導覽',desc:'左側固定選單，主區可容納多層分類與大量資料。',fit:'知識庫、法規、多層級資訊'},
  {id:'l3',g:'front',name:'入口服務',desc:'以搜尋框與服務圖示為核心，直接找到要辦的事。',fit:'民眾服務入口、申辦平台'},
  {id:'l4',g:'front',name:'雜誌格狀',desc:'大小卡片交錯排列，主打一則焦點內容。',fit:'新聞、活動、觀光導覽'},
  {id:'l5',g:'front',name:'單頁長捲',desc:'一頁講完，區塊交替帶出重點與行動按鈕。',fit:'活動宣傳、單一方案推廣'},
  {id:'l7',g:'front',name:'地圖據點',desc:'左側據點清單搭配右側地圖，可依類別篩選。',fit:'服務據點、場館、停車場查詢'},
  {id:'l8',g:'front',name:'申辦表單',desc:'分步驟的線上申請流程，含上傳文件與進度。',fit:'線上申辦、報名、補助申請'},
  {id:'l15',g:'front',name:'文章內頁',desc:'標題、內文、圖片與引言，側邊附本頁目錄與相關文章。',fit:'政策說明、新聞內頁、法規解說',isNew:1},
  {id:'l16',g:'front',name:'活動行事曆',desc:'月曆檢視搭配近期活動清單，可依類別篩選並報名。',fit:'藝文活動、課程報名、場館預約',isNew:1},
  {id:'l13',g:'admin',name:'登入頁',desc:'品牌視覺搭配登入表單，含驗證碼與自然人憑證登入。',fit:'後台入口、承辦人員登入'},
  {id:'l6',g:'admin',name:'管理儀表板',desc:'數據卡、趨勢圖與待辦並陳，登入後第一眼看全局。',fit:'主管總覽、每日工作入口'},
  {id:'l9',g:'admin',name:'資料列表',desc:'篩選列、可勾選的表格與分頁，後台最常用的頁面。',fit:'案件、帳號、訂單管理'},
  {id:'l10',g:'admin',name:'編輯詳情',desc:'分頁籤表單搭配右側案件資訊與審核歷程。',fit:'案件審核、資料維護'},
  {id:'l11',g:'admin',name:'流程看板',desc:'依處理階段分欄的卡片看板，進度一眼看清。',fit:'審核流程、任務追蹤'},
  {id:'l12',g:'admin',name:'權限設定',desc:'角色清單搭配權限矩陣，逐項勾選每個角色能做的事。',fit:'帳號管理、角色權限'},
  {id:'l14',g:'admin',name:'報表分析',desc:'期間篩選、趨勢圖、占比圖與各單位績效表。',fit:'統計報表、主管決策'},
  {id:'l17',g:'admin',name:'系統設定',desc:'分區設定卡片、開關與表單欄位，危險操作另外標示。',fit:'系統參數、通知設定、個人偏好',isNew:1}
];
const isAdmin=l=>(LAYOUTS.find(x=>x.id===l)||{}).g==='admin';
const STYLES=[
  {id:'s1',name:'簡約清爽',desc:'細線、小圓角、大量留白，讓內容自己說話。',radius:'8px',font:'Noto Sans TC（中等字重）',detail:'細線框、無陰影',rec:['c1','c3','c10']},
  {id:'s2',name:'圓潤親和',desc:'大圓角、膠囊按鈕、柔和陰影，親切好上手。',radius:'20px，按鈕為膠囊形',font:'Chiron GoRound TC（圓體）',detail:'柔和陰影、無框線',rec:['c2','c4','c9']},
  {id:'s3',name:'專業穩重',desc:'主色頂欄、近直角、粗標題，給人權威可信感。',radius:'2px',font:'Noto Sans TC 粗體',detail:'主色頂欄、深色頁尾',rec:['c1','c5','c12']},
  {id:'s4',name:'人文雜誌',desc:'明體標題、細線分隔、不加外框，閱讀感強。',radius:'直角',font:'Noto Serif TC 標題＋Noto Sans TC 內文',detail:'細線分隔、無外框',rec:['c5','c8','c10']},
  {id:'s5',name:'活力色塊',desc:'粗黑框加實色位移陰影，醒目、有個性。',radius:'14px',font:'Noto Sans TC Black',detail:'2px 黑框、位移陰影',rec:['c4','c7','c11']},
  {id:'s6',name:'暗色科技',desc:'深色底配亮色點綴與等寬字標籤，現代俐落。',radius:'10px',font:'Noto Sans TC＋IBM Plex Mono 標籤',detail:'深色底、格線與光暈',rec:['c3','c7','c1'],dark:true},
  {id:'s7',name:'玻璃透亮',desc:'半透明毛玻璃卡片疊在柔和色光上，輕盈有層次。',radius:'18px',font:'Noto Sans TC',detail:'毛玻璃、漸層按鈕、背景色光',rec:['c7','c3','c9']},
  {id:'s8',name:'文青手感',desc:'楷體字、手繪感框線與螢光筆標記，溫暖有人味。',radius:'不規則手繪框',font:'LXGW WenKai TC（楷體）',detail:'手繪框線、螢光筆標記、虛線分隔',rec:['c8','c2','c11']},
  {id:'s9',name:'效率工具',desc:'中性灰階、緊密排版、細框線，資料再多也不顯亂。',radius:'6px',font:'Noto Sans TC（14px 內文）',detail:'灰階側欄、細框線、緊密表格',rec:['c13','c1','c3']},
  {id:'s10',name:'瑞士網格',desc:'粗黑體大標、直角與粗分隔線，用網格和留白建立秩序。',radius:'直角',font:'Noto Sans TC 特粗標題',detail:'粗分隔線、主色方塊標記、灰色色塊卡片',rec:['c14','c1','c13'],isNew:1},
  {id:'s11',name:'柔和擬物',desc:'元件像從底色浮起或壓進去，柔光陰影、沒有框線。',radius:'18px',font:'Noto Sans TC',detail:'雙向柔光陰影、內凹輸入框、與底色同色的卡片',rec:['c10','c3','c16'],isNew:1},
  {id:'s12',name:'和風雅緻',desc:'明體寬字距標題、框中框與青海波底紋，沉靜有格調。',radius:'2px',font:'Noto Serif TC 標題＋Noto Sans TC 內文',detail:'雙層細框、青海波底紋、和紙色底',rec:['c17','c5','c16'],isNew:1}
];
const COLORS=[
  {id:'c1',name:'信賴藍',mood:'穩定、可信、公共服務感',p:'#1F5FAE',deep:'#123B6E',a:'#F2A93B',ink:'#16212F',pd:'#6FA6EC'},
  {id:'c2',name:'山林綠',mood:'自然、健康、永續',p:'#2D7A4E',deep:'#1B4D31',a:'#E3B23C',ink:'#15241B',pd:'#66C590'},
  {id:'c3',name:'湖水青',mood:'清新、理性、科技',p:'#0E7480',deep:'#0A4C55',a:'#F0845C',ink:'#112427',pd:'#45C6D0'},
  {id:'c4',name:'暖陽橘',mood:'熱情、活力、親民',p:'#B9501C',deep:'#7A3311',a:'#2B4C7E',ink:'#2A1B12',pd:'#F28C57'},
  {id:'c5',name:'酒紅',mood:'典雅、文化、質感',p:'#8E2B47',deep:'#5C1A2E',a:'#C9A15A',ink:'#24141A',pd:'#E57C9A'},
  {id:'c6',name:'墨金',mood:'沉穩、高級、權威',p:'#23272F',deep:'#111317',a:'#B48A3C',ink:'#15171B',pd:'#D9B46A'},
  {id:'c7',name:'紫藤',mood:'創意、溫柔、年輕',p:'#5A4A9C',deep:'#382D66',a:'#E8A33D',ink:'#1D1830',pd:'#AA9BF0'},
  {id:'c8',name:'大地棕',mood:'樸實、在地、溫暖',p:'#7A583A',deep:'#4F3824',a:'#4F7F6C',ink:'#261C14',pd:'#D6A877'},
  {id:'c9',name:'櫻花粉',mood:'浪漫、友善、親子',p:'#B83E6A',deep:'#7A2445',a:'#3E8E7E',ink:'#2A1620',pd:'#F08DB0'},
  {id:'c10',name:'霧灰藍',mood:'莫蘭迪、低調、知性',p:'#4A6886',deep:'#2F4459',a:'#D9A35B',ink:'#1C2530',pd:'#9DB9D6'},
  {id:'c11',name:'芥末黃',mood:'明亮、樂觀、醒目',p:'#E2A82B',deep:'#7A5710',a:'#2F4F6F',ink:'#2A2316',pd:'#F2C14E'},
  {id:'c12',name:'高對比',mood:'清晰易讀、無障礙優先',p:'#0B3D91',deep:'#061F4A',a:'#FFD400',ink:'#000000',pd:'#8FB8FF'},
  {id:'c13',name:'石墨灰',mood:'中性耐看、讓資料當主角',p:'#3D4654',deep:'#232A33',a:'#2F7DF6',ink:'#1A1F27',pd:'#AEB9C9'},
  {id:'c14',name:'珊瑚紅',mood:'熱情、醒目、有朝氣',p:'#C2453B',deep:'#7E2A23',a:'#2F7F8A',ink:'#2A1715',pd:'#F28A80',isNew:1},
  {id:'c15',name:'橄欖綠',mood:'自然、沉穩、在地農業',p:'#5E6A1F',deep:'#3B4313',a:'#C77B30',ink:'#1F2210',pd:'#B8C76A',isNew:1},
  {id:'c16',name:'靛青',mood:'智慧、專注、教育學習',p:'#3B3F9E',deep:'#23265F',a:'#E9A23B',ink:'#181A33',pd:'#A2A6F5',isNew:1},
  {id:'c17',name:'青瓷',mood:'溫潤、雅緻、東方韻味',p:'#3F7464',deep:'#284B40',a:'#C8875A',ink:'#17241F',pd:'#93CBB7',isNew:1}
];
// The array order is the order of digits in the combination code: never reorder, only append.
// sec = which group of the 細節 step the option is shown in.
const DETAILS=[
  {key:'mode',sec:'color',label:'色彩模式',hint:'深色模式會自動改用較亮的主色',opts:['依風格','淺色','深色'],short:['','淺色模式','深色模式']},
  {key:'font',sec:'type',label:'字體',hint:'標題與內文的字體搭配',opts:['依風格','黑體','明體','圓體','楷體','明體標題','圓體標題','楷體標題'],short:['','黑體','明體','圓體','楷體','明體標題配黑體內文','圓體標題配黑體內文','楷體標題配黑體內文']},
  {key:'density',sec:'layout',label:'資訊密度',hint:'控制留白、卡片與區塊間距',opts:['寬鬆','標準','緊湊'],short:['寬鬆排版','','緊湊排版'],def:1},
  {key:'button',sec:'shape',label:'按鈕形狀',hint:'覆蓋風格預設的按鈕圓角',opts:['依風格','直角','圓角','膠囊'],short:['','直角按鈕','圓角按鈕','膠囊按鈕']},
  {key:'nav',sec:'layout',label:'導覽列',hint:'頁首與側欄的底色',opts:['依風格','白底','主色','深色'],short:['','白底導覽','主色導覽','深色導覽']},
  {key:'hero',sec:'layout',label:'主視覺',hint:'首頁大圖區的呈現方式',opts:['幾何圖形','情境照片','數據看板','純文字'],short:['','情境照片主視覺','數據看板主視覺','純文字主視覺']},
  {key:'side',sec:'admin',label:'側欄樣式',hint:'後台主選單的擺法',opts:['展開側欄','收合圖示','頂部導覽','雙層選單'],short:['','收合側欄','頂部導覽','雙層選單']},
  {key:'table',sec:'admin',label:'表格樣式',hint:'資料列的分隔方式',opts:['簡潔線條','斑馬紋','完整格線'],short:['','斑馬紋表格','格線表格']},
  {key:'tabs',sec:'admin',label:'頁面切換',hint:'多頁籤可同時開著好幾個作業畫面',opts:['麵包屑','多頁籤'],short:['','多頁籤工作區']},
  {key:'accent',sec:'color',label:'強調色',hint:'點綴色的配法：行動區塊、裝飾圖形與重點標記會跟著變',opts:['依色系','互補色','相鄰色','同色系','中性灰'],short:['','互補強調色','相鄰強調色','同色系強調色','中性強調色']},
  {key:'heading',sec:'type',label:'標題',hint:'標題的大小與字重',opts:['依風格','含蓄','醒目','超大'],short:['','含蓄標題','醒目標題','超大標題']},
  {key:'radius',sec:'shape',label:'圓角',hint:'卡片、圖片與標籤的圓角（按鈕另外設定）',opts:['依風格','直角','小圓角','大圓角'],short:['','直角卡片','小圓角卡片','大圓角卡片']},
  {key:'card',sec:'shape',label:'卡片質感',hint:'卡片怎麼和背景區隔',opts:['依風格','細框線','柔和陰影','浮起陰影','色塊底'],short:['','細框線卡片','柔和陰影卡片','浮起陰影卡片','色塊底卡片']},
  {key:'icon',sec:'shape',label:'圖示底框',hint:'服務圖示外面的底框',opts:['依風格','圓形','方形','實心主色','無底框'],short:['','圓形圖示','方形圖示','實心圖示','無框圖示']},
  {key:'field',sec:'shape',label:'輸入欄位',hint:'搜尋框與表單欄位的樣式',opts:['依風格','框線','底線','填色'],short:['','框線欄位','底線欄位','填色欄位']},
  {key:'texture',sec:'shape',label:'背景紋理',hint:'頁面底色上的細紋，卡片本身不受影響',opts:['無','點陣','格線','斜紋','紙紋'],short:['','點陣背景','格線背景','斜紋背景','紙紋背景']},
  {key:'width',sec:'layout',label:'內容寬度',hint:'前台內容區的最大寬度',opts:['標準','窄版','寬版'],short:['','窄版內容','寬版內容']},
  {key:'header',sec:'layout',label:'頁首排列',hint:'前台頁首 Logo 與選單的擺法',opts:['標準','置中雙層','精簡選單'],short:['','置中雙層頁首','精簡頁首']},
  {key:'footer',sec:'layout',label:'頁尾',hint:'前台頁尾的底色',opts:['依風格','淺色','主色','深色'],short:['','淺色頁尾','主色頁尾','深色頁尾']}
];
const DSECS=[['color','色彩','色彩'],['type','字體與標題','字體'],['shape','形狀與質感','質感'],['layout','版面結構','版面'],['admin','後台介面','後台'],['mods','功能模組','模組']];
const MODULES=[
  {k:'alert',n:'公告橫幅',d:'頁面最上方的停班停課或系統維護公告',scope:'both'},
  {k:'chat',n:'智慧客服',d:'右下角浮動的線上客服按鈕',scope:'both'},
  {k:'cookie',n:'Cookie 同意',d:'底部的隱私權與 Cookie 提示列',scope:'front'},
  {k:'top',n:'回到頂端',d:'長頁面右下角的捲回按鈕',scope:'front'},
  {k:'feedback',n:'滿意度回饋',d:'頁尾前的「這頁有幫助嗎」與更新日期',scope:'front'},
  {k:'links',n:'相關連結',d:'頁尾前的友善連結區塊',scope:'front'},
  {k:'social',n:'社群連結',d:'頁尾的粉絲專頁、影音頻道圖示',scope:'front'},
  {k:'notify',n:'通知中心',d:'頂部鈴鐺與展開的待辦通知清單',scope:'admin'},
  {k:'watermark',n:'個資浮水印',d:'畫面鋪上登入者與時間，防止截圖外流',scope:'admin'},
  {k:'timeout',n:'閒置登出提醒',d:'閒置過久時提示即將自動登出',scope:'admin'},
  {k:'bulk',n:'批次操作列',d:'勾選多筆資料後浮出的操作列',scope:'admin'},
  {k:'a11y',n:'無障礙工具',d:'側邊的字級放大、高對比與語音朗讀',scope:'front'},
  {k:'survey',n:'問卷邀請',d:'左下角邀請填寫滿意度問卷的小卡',scope:'front'},
  {k:'env',n:'測試環境標示',d:'頂部條紋提醒現在是測試環境，避免誤操作',scope:'admin'}
];
const SHELL_ONLY=['notify','watermark','timeout','bulk'];
function modApplies(k,l){
  const m=MODULES.find(x=>x.k===k);if(!m)return false;
  if(m.scope==='front'&&isAdmin(l))return false;
  if(m.scope==='admin'&&!isAdmin(l))return false;
  if(l==='l13'&&SHELL_ONLY.includes(k))return false;
  if(k==='bulk'&&l!=='l9')return false;
  return true;
}
function detailApplies(key,l){
  if(key==='hero') return !!HERO_SCOPE[l];
  if(['side','table','tabs'].includes(key)) return isAdmin(l)&&l!=='l13';
  // front-only page chrome; l2 has a sidebar instead of a header and no centred content column
  if(key==='footer') return !isAdmin(l);
  if(key==='header'||key==='width') return !isAdmin(l)&&l!=='l2';
  return true;
}
const FEEL={s1:'俐落・乾淨・現代',s2:'親切・溫暖・好上手',s3:'權威・可信・正式',s4:'人文・質感・有深度',s5:'活潑・大膽・有記憶點',s6:'科技・專業・前衛',s7:'輕盈・時尚・通透',s8:'溫暖・手作・有故事',s9:'高效・清晰・不干擾',s10:'理性・秩序・設計感',s11:'柔和・觸感・新穎',s12:'沉靜・典雅・有文化'};
const PRESETS=[
  {g:'front',n:'政府機關官網',s:{layout:'l1',style:'s3',color:'c1',mods:['alert','feedback','social']}},
  {g:'front',n:'民眾服務入口',s:{layout:'l3',style:'s2',color:'c2',mods:['chat','feedback']}},
  {g:'front',n:'線上申辦流程',s:{layout:'l8',style:'s1',color:'c1',mods:['chat']}},
  {g:'front',n:'據點查詢',s:{layout:'l7',style:'s2',color:'c3'}},
  {g:'front',n:'觀光活動宣傳',s:{layout:'l5',style:'s5',color:'c4',hero:1,mods:['top','social']}},
  {g:'front',n:'藝文展館',s:{layout:'l4',style:'s4',color:'c5',hero:1,mods:['links']}},
  {g:'front',n:'科技產業',s:{layout:'l1',style:'s7',color:'c7',hero:2}},
  {g:'front',n:'親子社福',s:{layout:'l3',style:'s8',color:'c11',mods:['chat']}},
  {g:'front',n:'政策說明頁',s:{layout:'l15',style:'s12',color:'c17',mods:['feedback','a11y']}},
  {g:'admin',n:'後台登入',s:{layout:'l13',style:'s1',color:'c1'}},
  {g:'admin',n:'主管儀表板',s:{layout:'l6',style:'s9',color:'c13',mods:['notify']}},
  {g:'admin',n:'案件管理列表',s:{layout:'l9',style:'s9',color:'c1',table:1,mods:['notify','bulk']}},
  {g:'admin',n:'案件審核頁',s:{layout:'l10',style:'s1',color:'c3',tabs:1,mods:['timeout']}},
  {g:'admin',n:'審核流程看板',s:{layout:'l11',style:'s2',color:'c7',side:1,mods:['notify']}},
  {g:'admin',n:'帳號權限管理',s:{layout:'l12',style:'s3',color:'c1',mods:['watermark']}},
  {g:'admin',n:'統計報表中心',s:{layout:'l14',style:'s6',color:'c3',side:3}},
  {g:'admin',n:'系統設定頁',s:{layout:'l17',style:'s11',color:'c10',mods:['env']}},
  {g:'admin',n:'公文系統風',s:{layout:'l9',style:'s3',color:'c12',side:2,table:2,tabs:1,density:2,mods:['watermark','timeout']}}
];
// a random but not chaotic set of details: each applicable option has an even chance of staying at its default
function randomDetails(s){
  const o={};
  DETAILS.forEach(d=>{if(detailApplies(d.key,s.layout))o[d.key]=Math.random()<.5?(d.def||0):Math.floor(Math.random()*d.opts.length);});
  return o;
}
const resetDetails=s=>{DETAILS.forEach(d=>{s[d.key]=d.def||0;});s.mods=[];};
const FOOTER_MODS=['feedback','links','social'];
// [heading, body] per 字體 option
const FONTVARS=[null,...[['sans','sans'],['serif','serif'],['round','round'],['kai','kai'],['serif','sans'],['round','sans'],['kai','sans']].map(p=>p.map(f=>`var(--f-${f})`))];
const BTNR=[null,'0px','8px','999px'];
const HERO_SCOPE={l1:'all',l3:'all',l5:'all',l4:'photo',l13:'photo'};

const THUMBS={
  l1:'<rect class="t2" x="4" y="4" width="92" height="7" rx="1.5"/><rect class="t3" x="4" y="14" width="92" height="22" rx="2"/><rect class="t1" x="4" y="39" width="29" height="15" rx="2"/><rect class="t1" x="35.5" y="39" width="29" height="15" rx="2"/><rect class="t1" x="67" y="39" width="29" height="15" rx="2"/><rect class="t2" x="4" y="57" width="92" height="9" rx="1.5"/>',
  l2:'<rect class="t2" x="4" y="4" width="20" height="62" rx="2"/><rect class="t1" x="28" y="4" width="68" height="7" rx="1.5"/><rect class="t3" x="28" y="14" width="30" height="6" rx="1.5"/><rect class="t1" x="28" y="23" width="33" height="17" rx="2"/><rect class="t1" x="63" y="23" width="33" height="17" rx="2"/><rect class="t1" x="28" y="43" width="68" height="23" rx="2"/>',
  l3:'<rect class="t2" x="4" y="4" width="92" height="7" rx="1.5"/><rect class="t1" x="4" y="14" width="92" height="22" rx="2"/><rect class="t3" x="22" y="21" width="56" height="8" rx="4"/><rect class="t2" x="9" y="40" width="17" height="11" rx="2"/><rect class="t2" x="30.5" y="40" width="17" height="11" rx="2"/><rect class="t2" x="52" y="40" width="17" height="11" rx="2"/><rect class="t2" x="73.5" y="40" width="17" height="11" rx="2"/><rect class="t2" x="9" y="54" width="17" height="11" rx="2"/><rect class="t2" x="30.5" y="54" width="17" height="11" rx="2"/><rect class="t2" x="52" y="54" width="17" height="11" rx="2"/><rect class="t2" x="73.5" y="54" width="17" height="11" rx="2"/>',
  l4:'<rect class="t2" x="30" y="4" width="40" height="7" rx="1.5"/><rect class="t3" x="4" y="14" width="56" height="32" rx="2"/><rect class="t1" x="63" y="14" width="33" height="15" rx="2"/><rect class="t1" x="63" y="31" width="33" height="15" rx="2"/><rect class="t1" x="4" y="49" width="29" height="17" rx="2"/><rect class="t1" x="35.5" y="49" width="29" height="17" rx="2"/><rect class="t1" x="67" y="49" width="29" height="17" rx="2"/>',
  l5:'<rect class="t3" x="4" y="4" width="92" height="22" rx="2"/><rect class="t1" x="4" y="29" width="44" height="15" rx="2"/><rect class="t1" x="52" y="31" width="44" height="3" rx="1.5"/><rect class="t1" x="52" y="37" width="34" height="3" rx="1.5"/><rect class="t2" x="4" y="47" width="92" height="8" rx="1.5"/><rect class="t1" x="4" y="58" width="92" height="8" rx="1.5"/>',
  l6:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/><rect class="t3" x="21" y="14" width="17" height="10" rx="2"/><rect class="t1" x="40.3" y="14" width="17" height="10" rx="2"/><rect class="t1" x="59.6" y="14" width="17" height="10" rx="2"/><rect class="t1" x="79" y="14" width="17" height="10" rx="2"/><rect class="t1" x="21" y="27" width="48" height="21" rx="2"/><rect class="t2" x="25" y="38" width="4" height="7"/><rect class="t2" x="31" y="35" width="4" height="10"/><rect class="t2" x="37" y="36" width="4" height="9"/><rect class="t2" x="43" y="33" width="4" height="12"/><rect class="t3" x="49" y="31" width="4" height="14"/><rect class="t1" x="72" y="27" width="24" height="21" rx="2"/><rect class="t1" x="21" y="51" width="75" height="15" rx="2"/>',
  l7:'<rect class="t2" x="4" y="4" width="92" height="7" rx="1.5"/><rect class="t1" x="4" y="14" width="40" height="5" rx="1.5"/><rect class="t1" x="4" y="22" width="30" height="13" rx="2"/><rect class="t1" x="4" y="37.5" width="30" height="13" rx="2"/><rect class="t1" x="4" y="53" width="30" height="13" rx="2"/><rect class="t1" x="37" y="22" width="59" height="44" rx="2"/><rect class="t2" x="37" y="41" width="59" height="2"/><rect class="t2" x="62" y="22" width="2" height="44"/><circle class="t3" cx="52" cy="33" r="3.2"/><circle class="t3" cx="77" cy="52" r="3.2"/><circle class="t3" cx="86" cy="30" r="3.2"/>',
  l8:'<rect class="t2" x="4" y="4" width="92" height="7" rx="1.5"/><rect class="t1" x="4" y="14" width="44" height="5" rx="1.5"/><rect class="t3" x="4" y="22" width="21" height="2.5" rx="1"/><rect class="t3" x="27" y="22" width="21" height="2.5" rx="1"/><rect class="t3" x="50" y="22" width="21" height="2.5" rx="1"/><rect class="t1" x="73" y="22" width="23" height="2.5" rx="1"/><rect class="t1" x="4" y="28" width="62" height="38" rx="2"/><rect class="t2" x="8" y="33" width="26" height="6" rx="1.5"/><rect class="t2" x="36" y="33" width="26" height="6" rx="1.5"/><rect class="t2" x="8" y="43" width="54" height="11" rx="2"/><rect class="t3" x="44" y="58" width="18" height="5" rx="1.5"/><rect class="t1" x="70" y="28" width="26" height="20" rx="2"/><rect class="t1" x="70" y="51" width="26" height="15" rx="2"/>',
  l9:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/><rect class="t1" x="21" y="14" width="75" height="8" rx="2"/><rect class="t3" x="80" y="16" width="13" height="4" rx="1"/><rect class="t2" x="21" y="25" width="75" height="5" rx="1"/>'+[32,38,44,50,56].map((y,i)=>`<rect class="${i===1?'t3':'t1'}" x="21" y="${y}" width="3.5" height="3.5" rx=".8"/><rect class="t1" x="27" y="${y}" width="69" height="3.5" rx="1"/>`).join('')+'<rect class="t2" x="70" y="62" width="26" height="4" rx="1"/>',
  l10:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/><rect class="t1" x="21" y="14" width="34" height="5" rx="1.5"/><rect class="t3" x="80" y="14" width="16" height="5" rx="1.5"/><rect class="t1" x="21" y="23" width="50" height="43" rx="2"/><rect class="t2" x="24" y="28" width="21" height="5" rx="1"/><rect class="t2" x="47" y="28" width="21" height="5" rx="1"/><rect class="t2" x="24" y="36" width="21" height="5" rx="1"/><rect class="t2" x="47" y="36" width="21" height="5" rx="1"/><rect class="t2" x="24" y="44" width="44" height="12" rx="1"/><rect class="t3" x="56" y="59" width="12" height="4" rx="1"/><rect class="t1" x="74" y="23" width="22" height="18" rx="2"/><rect class="t1" x="74" y="44" width="22" height="22" rx="2"/><circle class="t2" cx="78" cy="50" r="1.6"/><circle class="t2" cx="78" cy="56" r="1.6"/><circle class="t3" cx="78" cy="62" r="1.6"/>',
  l11:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/>'+[[21,3],[40.5,2],[60,2],[79.5,3]].map(([x,n],c)=>`<rect class="t1" x="${x}" y="15" width="16.5" height="51" rx="2"/>`+Array.from({length:n},(_,i)=>`<rect class="${c===1&&i===0?'t3':'t2'}" x="${x+1.5}" y="${19+i*11}" width="13.5" height="9" rx="1.2"/>`).join('')).join(''),
  l12:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/><rect class="t1" x="21" y="15" width="22" height="51" rx="2"/>'+[0,1,2,3].map(i=>`<rect class="${i===1?'t3':'t2'}" x="23" y="${18+i*8}" width="18" height="5" rx="1"/>`).join('')+'<rect class="t1" x="46" y="15" width="50" height="51" rx="2"/>'+[0,1,2,3,4].map(r=>[0,1,2,3].map(c=>`<rect class="${(r+c)%3===0?'t3':'t2'}" x="${66+c*7}" y="${22+r*8}" width="4" height="4" rx=".8"/>`).join('')+`<rect class="t2" x="49" y="${22+r*8}" width="13" height="4" rx="1"/>`).join(''),
  l13:'<rect class="t3" x="4" y="4" width="44" height="62" rx="2"/><circle class="t2" cx="40" cy="14" r="9"/><rect class="t1" x="9" y="32" width="28" height="5" rx="1.5"/><rect class="t1" x="9" y="40" width="20" height="3" rx="1"/><rect class="t1" x="57" y="14" width="34" height="44" rx="2"/><rect class="t2" x="61" y="22" width="26" height="5" rx="1"/><rect class="t2" x="61" y="30" width="26" height="5" rx="1"/><rect class="t2" x="61" y="38" width="16" height="5" rx="1"/><rect class="t2" x="79" y="38" width="8" height="5" rx="1"/><rect class="t3" x="61" y="47" width="26" height="6" rx="1.5"/>',
  l14:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/><rect class="t1" x="21" y="14" width="23.5" height="9" rx="2"/><rect class="t1" x="47" y="14" width="23.5" height="9" rx="2"/><rect class="t1" x="73" y="14" width="23" height="9" rx="2"/><rect class="t1" x="21" y="26" width="46" height="24" rx="2"/><polyline class="tl" points="24,46 30,43 36,44 42,38 48,39 54,33 60,34 64,30"/><rect class="t1" x="70" y="26" width="26" height="24" rx="2"/><circle class="t3" cx="83" cy="38" r="7.5"/><circle class="t1" cx="83" cy="38" r="4"/><rect class="t1" x="21" y="53" width="75" height="13" rx="2"/><rect class="t2" x="24" y="57" width="40" height="2.5" rx="1"/><rect class="t2" x="24" y="61" width="32" height="2.5" rx="1"/>',
  l15:'<rect class="t2" x="4" y="4" width="92" height="7" rx="1.5"/><rect class="t1" x="4" y="14" width="26" height="3" rx="1"/><rect class="t3" x="4" y="20" width="58" height="6" rx="1.5"/><rect class="t1" x="4" y="29" width="38" height="3" rx="1"/><rect class="t2" x="4" y="35" width="62" height="16" rx="2"/><rect class="t1" x="4" y="54" width="62" height="3" rx="1"/><rect class="t1" x="4" y="60" width="52" height="3" rx="1"/><rect class="t1" x="70" y="14" width="26" height="30" rx="2"/><rect class="t2" x="73" y="18" width="16" height="2.5" rx="1"/><rect class="t3" x="73" y="24" width="18" height="2.5" rx="1"/><rect class="t2" x="73" y="30" width="14" height="2.5" rx="1"/><rect class="t2" x="73" y="36" width="17" height="2.5" rx="1"/><rect class="t1" x="70" y="47" width="26" height="19" rx="2"/>',
  l16:'<rect class="t2" x="4" y="4" width="92" height="7" rx="1.5"/><rect class="t1" x="4" y="14" width="34" height="5" rx="1.5"/><rect class="t2" x="4" y="21" width="60" height="2.5" rx="1"/><rect class="t1" x="4.0" y="25.0" width="7.4" height="7" rx="1"/><rect class="t2" x="12.6" y="25.0" width="7.4" height="7" rx="1"/><rect class="t1" x="21.2" y="25.0" width="7.4" height="7" rx="1"/><rect class="t1" x="29.8" y="25.0" width="7.4" height="7" rx="1"/><rect class="t1" x="38.4" y="25.0" width="7.4" height="7" rx="1"/><rect class="t1" x="47.0" y="25.0" width="7.4" height="7" rx="1"/><rect class="t2" x="55.6" y="25.0" width="7.4" height="7" rx="1"/><rect class="t3" x="4.0" y="33.2" width="7.4" height="7" rx="1"/><rect class="t1" x="12.6" y="33.2" width="7.4" height="7" rx="1"/><rect class="t1" x="21.2" y="33.2" width="7.4" height="7" rx="1"/><rect class="t1" x="29.8" y="33.2" width="7.4" height="7" rx="1"/><rect class="t2" x="38.4" y="33.2" width="7.4" height="7" rx="1"/><rect class="t1" x="47.0" y="33.2" width="7.4" height="7" rx="1"/><rect class="t1" x="55.6" y="33.2" width="7.4" height="7" rx="1"/><rect class="t1" x="4.0" y="41.4" width="7.4" height="7" rx="1"/><rect class="t1" x="12.6" y="41.4" width="7.4" height="7" rx="1"/><rect class="t2" x="21.2" y="41.4" width="7.4" height="7" rx="1"/><rect class="t3" x="29.8" y="41.4" width="7.4" height="7" rx="1"/><rect class="t1" x="38.4" y="41.4" width="7.4" height="7" rx="1"/><rect class="t1" x="47.0" y="41.4" width="7.4" height="7" rx="1"/><rect class="t1" x="55.6" y="41.4" width="7.4" height="7" rx="1"/><rect class="t2" x="4.0" y="49.6" width="7.4" height="7" rx="1"/><rect class="t1" x="12.6" y="49.6" width="7.4" height="7" rx="1"/><rect class="t1" x="21.2" y="49.6" width="7.4" height="7" rx="1"/><rect class="t1" x="29.8" y="49.6" width="7.4" height="7" rx="1"/><rect class="t1" x="38.4" y="49.6" width="7.4" height="7" rx="1"/><rect class="t3" x="47.0" y="49.6" width="7.4" height="7" rx="1"/><rect class="t1" x="55.6" y="49.6" width="7.4" height="7" rx="1"/><rect class="t1" x="4.0" y="57.8" width="7.4" height="7" rx="1"/><rect class="t1" x="12.6" y="57.8" width="7.4" height="7" rx="1"/><rect class="t1" x="21.2" y="57.8" width="7.4" height="7" rx="1"/><rect class="t2" x="29.8" y="57.8" width="7.4" height="7" rx="1"/><rect class="t1" x="38.4" y="57.8" width="7.4" height="7" rx="1"/><rect class="t1" x="47.0" y="57.8" width="7.4" height="7" rx="1"/><rect class="t1" x="55.6" y="57.8" width="7.4" height="7" rx="1"/><rect class="t1" x="68" y="14" width="28" height="15" rx="2"/><rect class="t3" x="71" y="17" width="6" height="9" rx="1"/><rect class="t1" x="68" y="32" width="28" height="15" rx="2"/><rect class="t2" x="71" y="35" width="6" height="9" rx="1"/><rect class="t1" x="68" y="50" width="28" height="16" rx="2"/><rect class="t2" x="71" y="53" width="6" height="9" rx="1"/>',
  l17:'<rect class="t2" x="4" y="4" width="13" height="62" rx="2"/><rect class="t1" x="21" y="4" width="75" height="7" rx="1.5"/><rect class="t1" x="21" y="14" width="30" height="5" rx="1.5"/><rect class="t3" x="82" y="14" width="14" height="5" rx="1.5"/><rect class="t1" x="21" y="22" width="75" height="22" rx="2"/>'+[26,32,38].map((y,i)=>`<rect class="t2" x="25" y="${y}" width="34" height="3" rx="1"/><rect class="${i===1?'t1':'t3'}" x="83" y="${y-.5}" width="9" height="4" rx="2"/>`).join('')+'<rect class="t1" x="21" y="47" width="75" height="19" rx="2"/><rect class="t2" x="25" y="51" width="30" height="5" rx="1"/><rect class="t2" x="59" y="51" width="30" height="5" rx="1"/><rect class="t2" x="25" y="59" width="30" height="4" rx="1"/>'
};

/* ---------- color math ---------- */
const hexToRgb=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const rgbToHex=r=>'#'+r.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
const mix=(a,b,t)=>{const A=hexToRgb(a),B=hexToRgb(b);return rgbToHex(A.map((v,i)=>v*t+B[i]*(1-t)));};
const lum=h=>hexToRgb(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const onColor=bg=>{const w=contrast(bg,'#FFFFFF'),k=contrast(bg,'#111418');return (w>=4.5||w>=k)?'#FFFFFF':'#111418';};
const grade=r=>r>=7?['AAA','aaa']:r>=4.5?['AA','aa']:r>=3?['AA 大字','lg']:['未達 AA','fail'];
const fmtR=r=>r.toFixed(1)+':1';
function hexToHsl(hex){
  const [r,g,b]=hexToRgb(hex).map(v=>v/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;}
  return [h,s,l];
}
function hslToHex(h,s,l){
  h=((h%360)+360)%360;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return rgbToHex([(r+m)*255,(g+m)*255,(b+m)*255]);
}
function customPalette(hex){
  const [h,s,l]=hexToHsl(hex);
  return {id:'c0',name:'自訂色',mood:'依指定主色自動推算深色、強調色',p:hex.toUpperCase(),
    deep:hslToHex(h,Math.min(s,.7),Math.max(.12,l*.55)),
    a:hslToHex(h+150,Math.max(.55,Math.min(s,.8)),.56),
    ink:hslToHex(h,Math.min(s,.35),.11),
    pd:hslToHex(h,Math.max(.45,Math.min(s,.85)),.7)};
}
const paletteOf=s=>s.color==='c0'?customPalette(s.custom):byId(COLORS,s.color);

/* ---------- combination codes ---------- */
const DEF=Object.assign({layout:'l1',style:'s1',color:'c1',custom:'#1F5FAE'},...DETAILS.map(d=>({[d.key]:d.def||0})),{mods:[]});
const modIdx=k=>MODULES.findIndex(m=>m.k===k);
// code = layout-style-color-x<one digit per DETAILS entry>-g<module bitmask>. Trailing default digits are
// dropped (but at least 9 are kept), so combinations without newer details keep their old codes and notes.
function enc(s){
  const c=s.color==='c0'?'k'+s.custom.slice(1).toLowerCase():s.color;
  const mask=MODULES.reduce((m,x,i)=>s.mods.includes(x.k)?m|(1<<i):m,0);
  const x=DETAILS.map(d=>s[d.key]??(d.def||0));
  let n=x.length;while(n>9&&x[n-1]===(DETAILS[n-1].def||0))n--;
  return `${s.layout}-${s.style}-${c}-x${x.slice(0,n).join('')}-g${mask}`;
}
function dec(str){
  const m=/^(l\d{1,2})-(s\d{1,2})-(c\d{1,2}|k[0-9a-f]{6})(?:-x(\d{1,40}))?(?:-g(\d{1,9}))?$/.exec(String(str||'').toLowerCase());
  if(!m||!byId(LAYOUTS,m[1])||!byId(STYLES,m[2])) return null;
  const o={layout:m[1],style:m[2]};
  if(m[3][0]==='k'){o.color='c0';o.custom='#'+m[3].slice(1).toUpperCase();}
  else if(byId(COLORS,m[3])) o.color=m[3];
  else return null;
  const x=m[4]||'';
  DETAILS.forEach((d,i)=>{const v=i<x.length?Number(x[i]):(d.def||0);o[d.key]=v<d.opts.length?v:(d.def||0);});
  const g=m[5]?Number(m[5]):0;
  o.mods=MODULES.filter((x,i)=>g&(1<<i)).map(x=>x.k);
  return o;
}
const full=o=>Object.assign({},DEF,{mods:[]},o);
const shortCode=s=>`${s.layout}-${s.style}-${s.color}`.toUpperCase();
const colorName=s=>paletteOf(s).name;
const labelOf=s=>`${byId(LAYOUTS,s.layout).name} × ${byId(STYLES,s.style).name} × ${colorName(s)}`;
function detailList(s){
  const out=[];
  DETAILS.forEach(d=>{
    const v=s[d.key];
    if(v===(d.def||0)||!d.short[v]||!detailApplies(d.key,s.layout))return;
    if(d.key==='hero'&&HERO_SCOPE[s.layout]==='photo'&&v!==1)return;
    out.push(d.short[v]);
  });
  s.mods.forEach(k=>{const m=MODULES[modIdx(k)];if(m&&modApplies(k,s.layout))out.push(m.n);});
  return out;
}
