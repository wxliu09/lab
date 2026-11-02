/* 網站樣式選配器・選配器介面
 * 狀態、步驟面板、結果／收藏比較／範本庫頁面與開機流程。
 */
'use strict';

/* ---------- state ---------- */
const KEY='site-style-picker-v2',SKEY='site-style-picker-saved';
const state=Object.assign({},DEF,{mods:[],step:0,device:'desktop'});
try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved){const ok=dec(enc(full(saved)));if(ok){Object.assign(state,ok);state.step=Number(saved.step)||0;state.device=saved.device==='phone'?'phone':'desktop';}}
}catch(e){}
let saved=[];
try{saved=(JSON.parse(localStorage.getItem(SKEY)||'[]')||[]).filter(x=>typeof x==='string'&&dec(x)).slice(0,6);}catch(e){saved=[];}
const NKEY='site-style-picker-notes';
let notes={};
try{const n=JSON.parse(localStorage.getItem(NKEY)||'{}');if(n&&typeof n==='object')notes=n;}catch(e){notes={};}
const persistNotes=()=>{try{localStorage.setItem(NKEY,JSON.stringify(notes));}catch(e){}};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}};
const persistSaved=()=>{try{localStorage.setItem(SKEY,JSON.stringify(saved));}catch(e){}};
const BKEY='site-style-picker-brand',RKEY='site-style-picker-recent';
try{const b=JSON.parse(localStorage.getItem(BKEY)||'null');if(b&&typeof b==='object')setBrand(b);}catch(e){}
let recent=[];
try{recent=(JSON.parse(localStorage.getItem(RKEY)||'[]')||[]).filter(r=>r&&typeof r.c==='string'&&dec(r.c)).slice(0,12);}catch(e){recent=[];}
const persistBrand=()=>{try{if(brandOn())localStorage.setItem(BKEY,JSON.stringify(brand));else localStorage.removeItem(BKEY);return true;}catch(e){return false;}};

/* ---------- links: #<code> for one combination, #set=<code>,<code>… for a comparison; &b= brand text, &n= notes ---------- */
const b64e=o=>{let t='';new TextEncoder().encode(JSON.stringify(o)).forEach(x=>{t+=String.fromCharCode(x);});return btoa(t).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const b64d=v=>{try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch(e){return null;}};
const brandText=()=>{const o={};for(const k in BRAND_DEF) if(k!=='logo'&&brand[k]!==BRAND_DEF[k]) o[k]=brand[k];return o;};
const brandParam=()=>Object.keys(brandText()).length?'&b='+b64e(brandText()):'';
const baseUrl=()=>location.href.split('#')[0];
function readHash(){
  const raw=(location.hash||'').slice(1);if(!raw) return null;
  const kv={};let code='';
  raw.split('&').forEach((part,i)=>{const j=part.indexOf('=');if(j<0){if(i===0)code=part;}else kv[part.slice(0,j)]=part.slice(j+1);});
  const b=kv.b?b64d(kv.b):null,br=b&&typeof b==='object'?b:null;
  if(kv.set){
    const codes=kv.set.split(',').filter(c=>dec(c)).slice(0,6),n=kv.n?b64d(kv.n):null;
    return codes.length?{set:codes,notes:Array.isArray(n)?n:[],brand:br}:null;
  }
  const combo=dec(code);
  return combo?{combo,brand:br}:null;
}

/* ---------- option lists ---------- */
const CHECK=`<span class="check">${ic('check',3)}</span>`;
const NEW='<span class="new">NEW</span>';
function buildOptions(){
  $('#optsL').innerHTML=LAYOUTS.map(l=>`<button class="opt" type="button" data-id="${l.id}" data-g="${l.g}" aria-pressed="false">${CHECK}<span class="thumb"><svg viewBox="0 0 100 70" aria-hidden="true">${THUMBS[l.id]}</svg></span><span class="opt-meta"><span class="code">${l.id.toUpperCase()}</span><span class="name">${l.name}</span>${l.isNew?NEW:''}</span><span class="desc">${l.desc}</span><span class="fit">適合　<b>${l.fit}</b></span></button>`).join('');
  $('#optsS').innerHTML=STYLES.map(s=>`<button class="opt" type="button" data-id="${s.id}" aria-pressed="false">${CHECK}<span class="mock swatch" data-style="${s.id}"><span class="m-card sw-card"><span class="sw-top"><span class="m-mark">青</span><span class="sw-tt"><span class="m-h3">市民服務</span><span class="sw-sub">最新消息・2026.10.28</span></span></span><span class="sw-act"><span class="m-btn m-btn-sm">線上申辦</span><span class="m-tag">公告</span></span></span></span><span class="opt-meta"><span class="code">${s.id.toUpperCase()}</span><span class="name">${s.name}</span>${s.isNew?NEW:''}</span><span class="desc">${s.desc}</span><span class="fit">感受　<b>${FEEL[s.id]}</b></span></button>`).join('');
  const strip='<span class="strip"><i></i><i></i><i></i><i></i><i></i></span>';
  const ratio='<span class="ratio"><code class="hex"></code><span>按鈕文字</span><code class="cr-v"></code><span class="badge"></span></span>';
  $('#optsC').innerHTML=COLORS.map(c=>`<button class="opt" type="button" data-id="${c.id}" aria-pressed="false">${CHECK}${strip}<span class="opt-meta"><span class="code">${c.id.toUpperCase()}</span><span class="name">${c.name}</span>${c.isNew?NEW:''}<span class="rec" hidden>推薦</span></span><span class="desc">${c.mood}</span>${ratio}</button>`).join('')
    +`<div class="opt opt-custom" data-id="c0" aria-pressed="false">${CHECK}${strip}<span class="opt-meta"><span class="code">C0</span><span class="name">自訂主色</span>${NEW}</span><span class="desc">輸入客戶的品牌色，自動推算深色、強調色，連結文字太淺時會自動加深。</span><span class="custom-row"><input type="color" id="customColor" value="#1F5FAE" aria-label="選擇主色"><input type="text" id="customHex" value="#1F5FAE" maxlength="7" spellcheck="false" aria-label="主色色碼"><span>按 Enter 套用色碼</span></span>${ratio}</div>`;
  const bind=(sel,key)=>$$(sel+' button.opt').forEach(b=>b.addEventListener('click',()=>{state[key]=b.dataset.id;update();}));
  bind('#optsL','layout');bind('#optsS','style');bind('#optsC','color');
  const card=$('#optsC .opt-custom'),cc=$('#customColor'),ch=$('#customHex');
  card.addEventListener('click',e=>{if(e.target.closest('input'))return;state.color='c0';update();});
  cc.addEventListener('input',()=>{state.custom=cc.value.toUpperCase();state.color='c0';update();});
  const applyHex=()=>{let v=ch.value.trim();if(v&&v[0]!=='#')v='#'+v;if(/^#[0-9a-fA-F]{6}$/.test(v)){state.custom=v.toUpperCase();state.color='c0';update();}else{ch.value=state.custom;toast('請輸入 6 位數色碼，例如 #1F5FAE');}};
  ch.addEventListener('change',applyHex);
  ch.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyHex();}});
}
const presetCode=p=>enc(full(Object.assign({},p.s,{custom:state.custom})));
const PKEY='site-style-picker-presets-open';
function buildPresets(){
  $('#presets').innerHTML=PRESETS.map((p,i)=>{
    const C=byId(COLORS,p.s.color);
    return `<button class="preset" type="button" data-i="${i}" data-g="${p.g}" aria-pressed="false" title="${byId(LAYOUTS,p.s.layout).name} × ${byId(STYLES,p.s.style).name} × ${C.name}"><i style="background:${C.p}"></i><span>${p.n}</span></button>`;
  }).join('');
  $('#presets').addEventListener('click',e=>{
    const b=e.target.closest('.preset');if(!b)return;
    const p=PRESETS[Number(b.dataset.i)],keep=state.custom;
    withUndo(()=>{Object.assign(state,full(p.s));state.custom=keep;update();},`已套用「${p.n}」，可再逐步微調`);
  });
  const box=$('#presetBox');
  try{if(localStorage.getItem(PKEY)==='0')box.open=false;}catch(e){}
  box.addEventListener('toggle',()=>{try{localStorage.setItem(PKEY,box.open?'1':'0');}catch(e){}});
}
function chipInner(d,i,label){
  if(d.key==='font'&&i>0) return `<span class="ff" style="font-family:${FONTVARS[i][0]}">${label}</span>`;
  if(d.key==='button'&&i>0) return `<i class="bs" style="border-radius:${['0','0','4px','99px'][i]}"></i>${label}`;
  return label;
}
function buildDetails(){
  const group=d=>`<div class="dgroup" data-key="${d.key}"><div class="dgroup-h"><b>${d.label}</b><span>${d.hint}</span></div><div class="chips" role="group" aria-label="${d.label}">${d.opts.map((o,i)=>`<button type="button" class="chip" data-v="${i}" aria-pressed="false">${chipInner(d,i,o)}</button>`).join('')}</div><p class="dgroup-note" hidden></p></div>`;
  const mods=`<div class="dgroup" data-key="mods"><div class="dgroup-h"><span></span></div><div class="mods">${MODULES.map(m=>`<button type="button" class="mod" data-k="${m.k}" data-scope="${m.scope}" aria-pressed="false"><span class="box">${ic('check',3)}</span><b>${m.n}</b><small>${m.d}</small></button>`).join('')}</div><p class="dgroup-note" hidden></p></div>`;
  $('#dnav').innerHTML=DSECS.map(([k,,n])=>`<button type="button" class="dnav-b" data-sec="${k}">${n}<span class="dnav-n"></span></button>`).join('');
  $('#details').innerHTML=DSECS.map(([k,n])=>`<section class="dsec" data-sec="${k}"><h3 class="dsec-h">${n}</h3>${k==='mods'?mods:DETAILS.filter(d=>d.sec===k).map(group).join('')}</section>`).join('');
  $('#details').addEventListener('click',e=>{
    const chip=e.target.closest('.chip');
    if(chip){state[chip.closest('.dgroup').dataset.key]=Number(chip.dataset.v);update();return;}
    const mod=e.target.closest('.mod');
    if(mod){const k=mod.dataset.k,i=state.mods.indexOf(k);if(i>=0)state.mods.splice(i,1);else state.mods.push(k);state.mods.sort((a,b)=>modIdx(a)-modIdx(b));update();}
  });
  // jump to a group: inside the panel's own scroll area on desktop, the page on phones
  $('#dnav').addEventListener('click',e=>{
    const b=e.target.closest('.dnav-b');if(!b)return;
    const sec=$(`.dsec[data-sec="${b.dataset.sec}"]`),ps=$('#panelScroll');
    if(getComputedStyle(ps).overflowY==='visible') sec.scrollIntoView({block:'start',behavior:'smooth'});
    else ps.scrollTo({top:sec.offsetTop-$('#dnav').offsetHeight-8,behavior:'smooth'});
  });
}

/* ---------- render ---------- */
let live,resDesk,resPhone,cmpPreviews=[];
// front / admin follows the current layout; switching it jumps back to the last layout used in that group
const groupLayout={front:'l1',admin:'l6'};
function applyGroup(){
  const g=byId(LAYOUTS,state.layout).g;
  groupLayout[g]=state.layout;
  $$('#lgSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.g===g)));
  $$('#optsL .opt').forEach(o=>{o.hidden=o.dataset.g!==g;});
  $$('#presets .preset').forEach(b=>{b.hidden=b.dataset.g!==g;});
}
function update(){
  const L=byId(LAYOUTS,state.layout),S=byId(STYLES,state.style);
  const changes=detailList(state).length;
  $('#cL').textContent=L.id.toUpperCase();$('#cS').textContent=S.id.toUpperCase();$('#cC').textContent=state.color.toUpperCase();
  $('#cX').textContent=changes?`+${changes}`:'預設';
  $('#vL').textContent=L.name;$('#vS').textContent=S.name;$('#vC').textContent=colorName(state);$('#vX').textContent=changes?`${changes} 項調整`:'選填';
  $('#stageLabel').textContent=labelOf(state);
  $$('#optsL .opt').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===state.layout)));
  $$('#optsS .opt').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.id===state.style));applyMock($('.mock',b),Object.assign({},state,{style:b.dataset.id}));});
  $$('#optsC .opt').forEach(b=>{
    const id=b.dataset.id,t=theme(Object.assign({},state,{color:id})),g=grade(t.pRatio);
    b.setAttribute('aria-pressed',String(id===state.color));
    const cells=$$('.strip i',b);[t.p,t.deep,t.a,t.ink,t.bg].forEach((hex,i)=>{cells[i].style.background=hex;});
    $('.hex',b).textContent=t.p;
    $('.cr-v',b).textContent=fmtR(t.pRatio);
    const bd=$('.badge',b);bd.textContent=g[0];bd.className='badge '+g[1];
    const rec=$('.rec',b);if(rec)rec.hidden=!S.rec.includes(id);
  });
  const cc=$('#customColor'),ch=$('#customHex');
  if(cc.value.toUpperCase()!==state.custom) cc.value=state.custom.toLowerCase();
  if(document.activeElement!==ch) ch.value=state.custom;
  $('#recNote').innerHTML=`目前風格「${S.name}」最搭：<b>${S.rec.map(id=>byId(COLORS,id).name).join('、')}</b>`;
  applyGroup();
  // details: show only what applies to this kind of page
  const adm=isAdmin(state.layout),grp=adm?'admin':'front';
  $$('#details .dgroup').forEach(g=>{
    const key=g.dataset.key,note=$('.dgroup-note',g);
    if(key==='mods'){
      $$('.mod',g).forEach(m=>{
        const k=m.dataset.k,sc=m.dataset.scope;
        m.hidden=!(sc==='both'||sc===grp);
        m.setAttribute('aria-pressed',String(state.mods.includes(k)));
        m.classList.toggle('na',!modApplies(k,state.layout));
      });
      const off=state.mods.filter(k=>{const m=MODULES[modIdx(k)];return m&&(m.scope==='both'||m.scope===grp)&&!modApplies(k,state.layout);});
      let msg='';
      if(off.length) msg=state.layout==='l13'?'登入頁還沒進入系統，通知中心、浮水印、閒置提醒、批次操作列不會顯示。':'批次操作列只在「資料列表」版型顯示。';
      note.hidden=!msg;note.textContent=msg;
      $('.dgroup-h span',g).textContent=adm?'後台常見的附加功能，可複選':'前台網站常見的附加功能，可複選';
      return;
    }
    // 主視覺 stays visible on front pages without a hero so the note can explain why it does nothing
    g.hidden=key==='hero'?adm&&state.layout!=='l13':!detailApplies(key,state.layout);
    $$('.chip',g).forEach(c=>c.setAttribute('aria-pressed',String(Number(c.dataset.v)===state[key])));
    if(key==='hero'){
      const scope=HERO_SCOPE[state.layout];
      let msg='';
      if(!scope) msg=`「${L.name}」版型沒有主視覺區，這項設定不影響畫面。`;
      else if(scope==='photo'&&state.hero>1) msg=state.layout==='l13'?'登入頁只有「情境照片」會換掉左側品牌區。':'雜誌格狀只有「情境照片」會替換焦點圖。';
      note.hidden=!msg;note.textContent=msg;
    }
  });
  DSECS.forEach(([k])=>{
    const sec=$(`.dsec[data-sec="${k}"]`),b=$(`.dnav-b[data-sec="${k}"]`);
    const n=k==='mods'?state.mods.filter(m=>modApplies(m,state.layout)).length
      :DETAILS.filter(d=>d.sec===k&&detailApplies(d.key,state.layout)&&state[d.key]!==(d.def||0)).length;
    sec.hidden=b.hidden=!$$('.dgroup',sec).some(g=>!g.hidden);
    $('.dnav-n',b).textContent=n||'';
  });
  const code=enc(state);
  let onPreset=null;
  $$('#presets .preset').forEach(b=>{const p=PRESETS[Number(b.dataset.i)],on=presetCode(p)===code;b.setAttribute('aria-pressed',String(on));if(on)onPreset=p;});
  $('#presetSum').textContent=onPreset?`目前：${onPreset.n}`:'先套一組接近的，再逐步微調';
  $$('#presentBar .cyc').forEach(c=>{const k=c.dataset.key;$('b',c).textContent=k==='layout'?L.name:k==='style'?S.name:colorName(state);});
  refreshSaveUI();
  live.render(state);
  save();
  noteRecent();
}

function setStep(i){
  state.step=i;
  $$('.step-body').forEach(p=>{p.hidden=Number(p.dataset.panel)!==i;});
  $$('.step-tab').forEach(t=>{
    const n=Number(t.dataset.step);
    if(n===i) t.setAttribute('aria-current','step'); else t.removeAttribute('aria-current');
    t.classList.toggle('done',n<i);
  });
  $('#prev').disabled=i===0;
  const next=$('#next');
  next.textContent=['下一步：選風格','下一步：選色系','下一步：細節調整','產生示意畫面'][i];
  next.className='btn '+(i>=2?'btn-accent':'btn-primary');
  if(i===2) next.textContent='下一步：細節（選填）';
  $('#progress').textContent=`步驟 ${i+1} / 4`;
  revealPick(i);
  save();
}
// a step's list starts at its top, unless the current pick is out of sight further down
function revealPick(i){
  const ps=$('#panelScroll'),cur=$(`.step-body[data-panel="${i}"] .opt[aria-pressed="true"]`);
  ps.scrollTop=0;
  if(cur&&cur.offsetTop+60>ps.clientHeight) ps.scrollTop=cur.offsetTop-12;
}

function refreshSaveUI(){
  const on=saved.includes(enc(state));
  ['#saveLive','#saveRes','#presentSave'].forEach(sel=>{const b=$(sel);b.setAttribute('aria-pressed',String(on));$('.lbl',b).textContent=on?'已收藏':'收藏';});
  $('#savedCount').textContent=saved.length;
  $('#savedBtn').disabled=saved.length===0;
}
function toggleSaveCode(code){
  const i=saved.indexOf(code);
  if(i>=0){saved.splice(i,1);toast('已取消收藏');}
  else{if(saved.length>=6){toast('最多收藏 6 組，請先在收藏比較裡移除一組');return false;}saved.push(code);toast(`已收藏 ${shortCode(dec(code))}，共 ${saved.length} 組`);}
  persistSaved();refreshSaveUI();
  return true;
}
const toggleSave=()=>toggleSaveCode(enc(state));
const shareUrl=s=>baseUrl()+'#'+enc(s)+brandParam();
const setUrl=codes=>{const n=codes.map(c=>(notes[c]||'').trim());return baseUrl()+'#set='+codes.join(',')+(n.some(Boolean)?'&n='+b64e(n):'')+brandParam();};
const isHosted=()=>/^https?:$/.test(location.protocol);

function specText(){
  const L=byId(LAYOUTS,state.layout),S=byId(STYLES,state.style),C=paletteOf(state),t=theme(state);
  const det=DETAILS.filter(d=>state[d.key]!==(d.def||0)&&detailApplies(d.key,state.layout)&&!(d.key==='hero'&&HERO_SCOPE[state.layout]==='photo'&&state.hero!==1)).map(d=>`${d.label} ${d.opts[state[d.key]]}`);
  const mods=state.mods.filter(k=>modApplies(k,state.layout)).map(k=>MODULES[modIdx(k)].n);
  return [
    `【網站樣式選配】組合 ${shortCode(state)}`,
    ...(brandOn()?[`網站｜${brand.name}（${brand.org}）`]:[]),
    `版型｜${L.id.toUpperCase()} ${L.name}：${L.desc}（適合：${L.fit}）`,
    `風格｜${S.id.toUpperCase()} ${S.name}：圓角 ${S.radius}／字體 ${S.font}／${S.detail}`,
    `色系｜${state.color.toUpperCase()} ${C.name}（${C.mood}）：主色 ${t.p}、深色 ${t.deep}、強調 ${t.a}、文字 ${t.ink}、底色 ${t.bg}`,
    `細節｜${det.length?det.join('、'):'全部沿用風格預設'}`,
    `模組｜${mods.length?mods.join('、'):'無'}`,
    `對比｜按鈕文字 ${fmtR(t.pRatio)}（${grade(t.pRatio)[0]}）、連結文字 ${fmtR(t.ptRatio)}（${grade(t.ptRatio)[0]}）、內文 ${fmtR(t.bodyRatio)}（${grade(t.bodyRatio)[0]}）`,
    `備註｜${(notes[enc(state)]||'').trim()||'無'}`,
    `完整代碼｜${enc(state)}`
  ].concat(isHosted()?[`分享連結｜${shareUrl(state)}`]:[]).join('\n');
}
function renderSpec(){
  const L=byId(LAYOUTS,state.layout),S=byId(STYLES,state.style),C=paletteOf(state),t=theme(state);
  const sw=[['主色',t.p],['深色',t.deep],['強調',t.a],['文字',t.ink],['底色',t.bg]];
  const cr=(lbl,r)=>{const g=grade(r);return `<div class="cr"><span>${lbl}</span><span><code>${fmtR(r)}</code><span class="badge ${g[1]}">${g[0]}</span></span></div>`;};
  const dl=detailList(state);
  $('#spec').innerHTML=`
    <div class="spec-card"><span class="code">版型 ${L.id.toUpperCase()}・${L.g==='admin'?'後台系統':'前台網站'}</span><span class="nm">${L.name}</span><span class="ds">${L.desc}</span><small>適合：${L.fit}</small></div>
    <div class="spec-card"><span class="code">風格 ${S.id.toUpperCase()}</span><span class="nm">${S.name}</span><dl class="kv"><dt>圓角</dt><dd>${S.radius}</dd><dt>字體</dt><dd>${S.font}</dd><dt>質感</dt><dd>${S.detail}</dd></dl></div>
    <div class="spec-card"><span class="code">色系 ${state.color.toUpperCase()}</span><span class="nm">${C.name}</span><div class="sw-row">${sw.map(([k,h])=>`<span class="sw"><i style="background:${h}"></i><span>${k}</span><code>${h}</code></span>`).join('')}</div></div>
    <div class="spec-card"><span class="code">細節與模組</span><span class="nm">${dl.length?dl.length+' 項調整':'沿用風格預設'}</span>${dl.length?`<div class="tags">${dl.map(x=>`<span>${x}</span>`).join('')}</div>`:'<span class="ds">沒有額外調整，也沒有加掛功能模組。</span>'}</div>
    <div class="spec-card"><span class="code">無障礙對比</span><span class="nm">WCAG 2.x 文字對比</span>${cr('按鈕文字',t.pRatio)}${cr('連結文字',t.ptRatio)}${cr('內文',t.bodyRatio)}<small>${t.pt!==t.p?'主色直接當文字太淺，連結與標籤已自動加深。':'一般文字需 4.5:1 以上才符合 AA 等級。'}</small></div>`;
}

function showView(v){['workspace','result','compare','library','explore'].forEach(id=>{$('#'+id).hidden=id!==v;});}
function clearHash(){if(location.hash){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}}}
function showResult(setHash){
  showView('result');
  $('#rCode').textContent=shortCode(state);
  const dl=detailList(state);
  $('#rLabel').textContent=labelOf(state)+(dl.length?`・另有 ${dl.length} 項細節調整`:'');
  renderSpec();
  renderSimilar();
  resDesk.render(state);resPhone.render(state);
  $('#noteBox').value=notes[enc(state)]||'';
  $('#specPre').textContent=specText();
  const code=enc(state);
  if(setHash&&location.hash!=='#'+code){try{location.hash=code;}catch(e){}}
  window.scrollTo(0,0);
  update();
}
function showWorkspace(step){
  cmpShared=null;
  showView('workspace');clearHash();
  if(typeof step==='number') setStep(step);
  update();
}
// a comparison opened from a shared link; it never touches the viewer's own saved list
let cmpShared=null;
function showCompare(){
  showView('compare');
  if(!cmpShared) clearHash();
  renderCompare();
  window.scrollTo(0,0);
}
// every dimension a combination can differ in, as [label, value of a combination, default value]
const CMP_DIMS=[['版型',s=>byId(LAYOUTS,s.layout).name],['風格',s=>byId(STYLES,s.style).name],['色系',colorName],
  ...DETAILS.map(d=>[d.label,s=>detailApplies(d.key,s.layout)?d.opts[s[d.key]]:'不適用',d.opts[d.def||0]]),
  ['功能模組',s=>s.mods.filter(k=>modApplies(k,s.layout)).map(k=>MODULES[modIdx(k)].n).join('、')||'無','無']];
function renderCompare(){
  cmpPreviews.forEach(p=>p.destroy());cmpPreviews=[];
  const codes=cmpShared||saved,sh=!!cmpShared;
  $('#cmpKind').textContent=sh?'分享的比較':'收藏比較';
  $('#cmpCount').textContent=sh?`${codes.length} 組`:`${saved.length} / 6`;
  $('#cmpTitle').textContent=sh?'別人分享給你的候選組合':'並排比較收藏的組合';
  $('#cmpDesc').textContent=sh?'這些組合來自分享連結，不會改動你自己的收藏；喜歡的可以收藏起來。':'最多收藏 6 組。收藏只存在這台裝置的瀏覽器裡。';
  $('#cmpClear').hidden=sh;$('#cmpShare').hidden=sh||!saved.length;$('#cmpAddAll').hidden=!sh;
  const g=$('#cmpGrid'),cm=$('#cmpCommon');
  cm.hidden=codes.length<2;
  if(!codes.length){g.innerHTML='<div class="empty">還沒有收藏。挑到喜歡的組合時按「收藏」，就能在這裡並排比較。</div>';return;}
  const list=codes.map(code=>full(dec(code)));
  const vals=CMP_DIMS.map(([,f])=>list.map(f));
  // an option that only some pages have (後台側欄 vs 前台頁首) is not a difference by itself
  const differs=vals.map(v=>new Set(v.filter(x=>x!=='不適用')).size>1);
  if(codes.length>1){
    const same=CMP_DIMS.map((d,i)=>[d[0],vals[i][0],d[2],differs[i]]).filter(([,v,def,df])=>!df&&v!==def&&v!=='不適用').map(([n,v])=>`<span>${n}：${v}</span>`);
    const n=differs.filter(Boolean).length;
    cm.innerHTML=`<b>共同點</b>${same.join('')||'<span>沒有共同的設定</span>'}<small>${n} 項不同，標在各組下方；沒列出的細節都是預設值</small>`;
  }
  g.innerHTML=list.map((s,i)=>{
    const code=codes[i],dl=detailList(s);
    const diff=codes.length>1?`<div class="cmp-diff">${CMP_DIMS.map(([n],j)=>differs[j]&&vals[j][i]!=='不適用'?`<span><i>${n}</i>${vals[j][i]}</span>`:'').join('')}</div>`:`<span>${dl.length?'細節：'+dl.join('、'):'細節：沿用預設'}</span>`;
    return `<article class="cmp-card"><div class="frame-wrap" data-device="desktop"></div><div class="cmp-meta"><b>${shortCode(s)}</b><span>${labelOf(s)}</span>${diff}${notes[code]&&notes[code].trim()?`<span class="cmp-note">${esc(notes[code].trim())}</span>`:''}</div><div class="cmp-act"><button class="btn" type="button" data-open="${i}">看示意畫面</button>${sh?`<button class="btn" type="button" data-save="${i}" aria-pressed="${saved.includes(code)}">${saved.includes(code)?'已收藏':'收藏'}</button>`:`<button class="btn" type="button" data-del="${i}">移除</button>`}</div></article>`;
  }).join('');
  $$('.cmp-card',g).forEach((card,i)=>{const p=new Preview($('.frame-wrap',card));p.render(list[i]);cmpPreviews.push(p);});
}

/* ---------- explore: variations that change one thing ---------- */
let expAxis='color',expItems=[],expPreviews=[];
const shuffled=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
function variations(axis,base){
  const one=o=>Object.assign({},base,{mods:base.mods.slice()},o);
  if(axis==='color'){
    const rec=byId(STYLES,base.style).rec.filter(id=>id!==base.color);
    return [...rec,...shuffled(COLORS.map(c=>c.id).filter(id=>id!==base.color&&!rec.includes(id)))].slice(0,6).map(id=>({s:one({color:id}),why:rec.includes(id)?['推薦色系']:[]}));
  }
  if(axis==='style') return shuffled(STYLES.filter(x=>x.id!==base.style)).slice(0,6).map(x=>({s:one({style:x.id}),why:[]}));
  if(axis==='layout'){
    const g=byId(LAYOUTS,base.layout).g;
    return shuffled(LAYOUTS.filter(l=>l.g===g&&l.id!==base.layout)).slice(0,6).map(l=>({s:one({layout:l.id}),why:[]}));
  }
  return Array.from({length:6},()=>{
    const s=one(randomDetails(base));
    return {s,why:DETAILS.filter(d=>detailApplies(d.key,s.layout)&&s[d.key]!==base[d.key]).map(d=>`${d.label}：${d.opts[s[d.key]]}`)};
  });
}
function renderExplore(){
  expPreviews.forEach(p=>p.destroy());expPreviews=[];
  const base=full(dec(enc(state)));base.custom=state.custom;
  $('#expBase').textContent=shortCode(base);
  $$('#expAxis button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===expAxis)));
  expItems=variations(expAxis,base);
  $('#expGrid').innerHTML=expItems.map((it,i)=>{
    const on=saved.includes(enc(it.s));
    const why=it.why.length?it.why:(expAxis==='details'?['和目前一樣']:[]);
    return `<article class="cmp-card exp-card"><div class="frame-wrap" data-device="desktop"></div><div class="cmp-meta"><b>${shortCode(it.s)}</b><span>${labelOf(it.s)}</span>${why.length?`<div class="cmp-diff">${why.map(w=>`<span>${w}</span>`).join('')}</div>`:''}</div><div class="cmp-act"><button class="btn btn-primary" type="button" data-use="${i}">套用這組</button><button class="btn" type="button" data-save="${i}" aria-pressed="${on}">${on?'已收藏':'收藏'}</button></div></article>`;
  }).join('');
  $$('.exp-card').forEach((card,i)=>{const p=new Preview($('.frame-wrap',card));p.render(expItems[i].s);expPreviews.push(p);});
}
function showExplore(){showView('explore');clearHash();renderExplore();window.scrollTo(0,0);}

const LOCKKEY='site-style-picker-locks',LOCKNAME={layout:'版型',style:'風格',color:'色系',details:'細節'};
const locks={layout:false,style:false,color:false,details:true};
try{const l=JSON.parse(localStorage.getItem(LOCKKEY)||'null');if(l&&typeof l==='object')for(const k in locks)if(typeof l[k]==='boolean')locks[k]=l[k];}catch(e){}
const refreshLocks=()=>$$('.combo [data-lock]').forEach(b=>b.setAttribute('aria-pressed',String(locks[b.dataset.lock])));
function shuffle(){
  if(Object.values(locks).every(Boolean)){toast('四項都鎖定了，先點上方的代碼解鎖想換的項目');return;}
  const pick=(arr,cur)=>{const pool=arr.filter(x=>x!==cur);return pool[Math.floor(Math.random()*pool.length)];};
  withUndo(()=>{
    const g=byId(LAYOUTS,state.layout).g;
    if(!locks.layout) state.layout=pick(LAYOUTS.filter(l=>l.g===g).map(x=>x.id),state.layout);
    if(!locks.style) state.style=pick(STYLES.map(x=>x.id),state.style);
    if(!locks.color){
      const rec=byId(STYLES,state.style).rec.filter(id=>id!==state.color);
      state.color=Math.random()<.75&&rec.length?rec[Math.floor(Math.random()*rec.length)]:pick(COLORS.map(x=>x.id),state.color);
    }
    if(!locks.details) Object.assign(state,randomDetails(state));
    if(!$('#result').hidden) showResult(true); else update();
  },()=>{const kept=Object.keys(locks).filter(k=>locks[k]).map(k=>LOCKNAME[k]);return `已換成 ${shortCode(state)}${kept.length?`，保留${kept.join('、')}`:''}`;});
}

let tt;
function toast(msg,onUndo){
  const el=$('#toast');el.textContent=msg;
  if(onUndo){const b=document.createElement('button');b.type='button';b.className='toast-act';b.textContent='復原';b.addEventListener('click',onUndo);el.append(b);}
  el.classList.toggle('has-act',!!onUndo);
  el.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('show'),onUndo?6000:2200);
}
// for one-click changes that overwrite several picks at once (presets, shuffle, templates, reset)
function withUndo(fn,msg){
  const before=Object.assign(dec(enc(state)),{custom:state.custom});
  fn();
  toast(typeof msg==='function'?msg():msg,()=>{Object.assign(state,before);if(!$('#result').hidden)showResult(true);else update();toast('已復原上一個組合');});
}

function copyText(txt,done,fallback){
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(()=>{if(done)toast(done);}).catch(fallback);}
    else fallback();
  }catch(e){fallback();}
}
function copySpec(){
  copyText(specText(),'已複製規格文字',()=>{const d=$('#specDetails');d.open=true;const r=document.createRange();r.selectNodeContents($('#specPre'));const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);toast('已選取規格文字，請按 Ctrl+C 複製');});
}
function copyLink(){
  const url=shareUrl(state);
  copyText(url,isHosted()?'已複製連結，對方打開就會看到這組示意畫面':'已複製連結；這是本機檔案的路徑，放上網站後才能傳給別人',()=>window.prompt('複製這個連結',url));
}

/* ---------- client brand dialog ---------- */
let draftLogo='';
function refreshBrandUI(){
  $$('#optsS .swatch .m-mark').forEach(m=>{m.className='m-mark'+(brand.logo?' has-img':'');m.innerHTML=brandMark();});
  $('#brandBtn').classList.toggle('is-on',brandOn());
}
function brandChanged(){
  refreshBrandUI();live.render(state);
  if(!$('#result').hidden){resDesk.render(state);resPhone.render(state);$('#specPre').textContent=specText();}
}
function logoPreview(){
  const f=$('#brandForm').elements,el=$('#logoPrev');
  el.innerHTML=draftLogo?`<img src="${esc(draftLogo)}" alt="">`:esc(f.mark.value.trim()||f.name.value.trim().charAt(0)||BRAND_DEF.mark);
  el.classList.toggle('has-img',!!draftLogo);$('#logoClear').hidden=!draftLogo;
}
const readFile=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f);});
const loadImg=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
// a small PNG is plenty for a 40px mark and keeps localStorage light
function shrinkLogo(img){
  const w=img.naturalWidth||160,h=img.naturalHeight||160,k=Math.min(1,160/Math.max(w,h)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/png');
}
// the logo's main colours: saturated pixels bucketed by hue and lightness, biggest buckets first
function logoColors(img){
  const c=document.createElement('canvas');c.width=c.height=48;
  const x=c.getContext('2d');x.drawImage(img,0,0,48,48);
  const d=x.getImageData(0,0,48,48).data,bins={},out=[];
  for(let i=0;i<d.length;i+=4){
    if(d[i+3]<128) continue;
    const [h,sat,l]=hexToHsl(rgbToHex([d[i],d[i+1],d[i+2]]));
    if(sat<.25||l<.14||l>.88) continue;
    const k=Math.round(h/20)%18+'-'+Math.round(l*3);
    (bins[k]=bins[k]||[]).push([d[i],d[i+1],d[i+2]]);
  }
  Object.values(bins).sort((p,q)=>q.length-p.length).forEach(px=>{
    if(px.length<12||out.length>=4) return;
    const hex=rgbToHex([0,1,2].map(j=>px.reduce((t,v)=>t+v[j],0)/px.length)),[h,,l]=hexToHsl(hex);
    if(!out.some(o=>{const [oh,,ol]=hexToHsl(o);return hueDist(oh,h)<18&&Math.abs(ol-l)<.15;})) out.push(hex);
  });
  return out;
}
async function showLogoColors(src){
  const box=$('#logoColors'),hint=$('#logoColorHint');
  let cs=[];
  try{cs=logoColors(await loadImg(src));}catch(e){cs=[];}
  box.hidden=false;
  $('#logoSwatches').innerHTML=cs.map(h=>`<button type="button" class="dlg-swb" data-hex="${h}" aria-pressed="${state.color==='c0'&&state.custom===h}" title="設為主色 ${h}"><i style="background:${h}"></i><code>${h}</code></button>`).join('');
  hint.textContent=cs.length?'點一下設為主色（色系會切換成自訂主色）':'這個 Logo 主要是黑白灰，建議選石墨灰、墨金或高對比色系。';
}
function openBrand(){
  const f=$('#brandForm').elements;
  for(const k in BRAND_DEF) if(k!=='logo'){f[k].value=brand[k];f[k].placeholder=BRAND_DEF[k];}
  draftLogo=brand.logo;logoPreview();$('#logoColors').hidden=true;
  if(draftLogo) showLogoColors(draftLogo);
  $('#brandDlg').showModal();
}

/* ---------- design tokens, read back from the rendered result preview ---------- */
function cssHex(v){
  let m=/rgba?\(([^)]+)\)/.exec(v),c;
  if(m) c=m[1].split(/[\s,/]+/).filter(Boolean).slice(0,3).map(Number);
  else if((m=/color\(srgb ([^)]+)\)/.exec(v))) c=m[1].split(/\s+/).slice(0,3).map(x=>Number(x)*255);
  return c?rgbToHex(c):v;
}
// browsers report mixed colours as color(srgb r g b / a); spell them as rgba() for readability
const tidyColors=v=>v.replace(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/g,(m,r,g,b,a)=>`rgba(${[r,g,b].map(x=>Math.round(x*255)).join(', ')}, ${a===undefined?1:Number(Number(a).toFixed(3))})`);
const TOKEN_COLORS=[['primary','--m-p','主色'],['primary-text','--m-pt','主色文字（連結、標籤）'],['on-primary','--m-on-p','主色上的文字'],['deep','--m-deep','深色'],['on-deep','--m-on-deep','深色上的文字'],['accent','--m-a','強調色'],['on-accent','--m-on-a','強調色上的文字'],['text','--m-ink','內文'],['muted','--m-muted','次要文字'],['border','--m-line','框線'],['background','--m-bg','頁面底色'],['surface','--m-surface','卡片底色'],['soft','--m-soft','主色淡底'],['subtle','--m-alt','區塊淡底'],['success','--m-ok','成功'],['warning','--m-warn','警告'],['danger','--m-bad','錯誤']];
function readTokens(){
  const m=resDesk.mock,pr=document.createElement('div');
  pr.style.cssText='position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
  m.appendChild(pr);
  const cs=getComputedStyle(pr),get=(prop,val,out)=>{pr.style[prop]=val;const r=cs[out||prop];pr.style[prop]='';return r;};
  const v=name=>getComputedStyle(m).getPropertyValue(name).trim();
  const type=cls=>{const e=document.createElement('div');e.className=cls;e.textContent='字';pr.appendChild(e);const c=getComputedStyle(e),r={size:c.fontSize,weight:c.fontWeight,line:(parseFloat(c.lineHeight)/parseFloat(c.fontSize)).toFixed(2).replace(/\.?0+$/,'')};e.remove();return r;};
  const wrap=m.querySelector('.m-wrap'),front=!isAdmin(state.layout);
  const t={
    color:TOKEN_COLORS.map(([k,name,label])=>[k,cssHex(get('color',`var(${name})`)),label]),
    font:[['heading',get('fontFamily','var(--m-fh)')],['body',get('fontFamily','var(--m-fb)')],['label',get('fontFamily','var(--m-fl)')]],
    text:[['h1',type('m-h1')],['h2',type('m-h2')],['h3',type('m-h3')],['base',{size:getComputedStyle(m).fontSize,weight:'400',line:'1.65'}]],
    radius:[['card',v('--m-r')],['button',v('--m-rb')],['tag',v('--m-rt')],['icon',v('--m-rm')]],
    shadow:[['card',tidyColors(get('boxShadow','var(--m-shadow)'))],['button',tidyColors(get('boxShadow','var(--m-bshadow)'))]],
    space:[['gap',get('width','var(--m-g)')],['card',get('padding','var(--m-cpad)','paddingTop')]],
    width:front&&wrap?getComputedStyle(wrap).maxWidth:'none'
  };
  pr.style.borderTopStyle='solid';t.border=get('borderTopWidth','var(--m-bw)');   // a width only computes with a style
  pr.remove();
  return t;
}
const tokenNote=()=>`網站樣式選配器・${shortCode(state)}（${labelOf(state)}）${theme(state).dark?'深色':'淺色'}模式
 * 完整代碼 ${enc(state)}・${new Date().toLocaleDateString('zh-TW')} 匯出；字級以桌機 1200px 版面為準`;
function tokensText(fmt){
  const t=readTokens(),L=[];
  if(fmt==='json'){
    const o={$description:`網站樣式選配器 ${shortCode(state)}：${labelOf(state)}`,color:{},font:{},typography:{},radius:{},shadow:{},space:{},size:{}};
    t.color.forEach(([k,h,d])=>{o.color[k]={$type:'color',$value:h,$description:d};});
    t.font.forEach(([k,f])=>{o.font[k]={$type:'fontFamily',$value:f.split(',').map(x=>x.trim().replace(/^"|"$/g,''))};});
    t.text.forEach(([k,x])=>{o.typography[k]={$type:'typography',$value:{fontFamily:k==='base'?'{font.body}':'{font.heading}',fontSize:x.size,fontWeight:Number(x.weight),lineHeight:Number(x.line)}};});
    t.radius.forEach(([k,r])=>{o.radius[k]={$type:'dimension',$value:r};});
    t.shadow.forEach(([k,r])=>{o.shadow[k]={$value:r};});
    t.space.forEach(([k,r])=>{o.space[k]={$type:'dimension',$value:r};});
    o.size['border-width']={$type:'dimension',$value:t.border};
    if(t.width!=='none') o.size['content-width']={$type:'dimension',$value:t.width};
    return JSON.stringify(o,null,2);
  }
  const tw=fmt==='tailwind',p=tw?{text:'--text-',radius:'--radius-',shadow:'--shadow-',space:'--spacing-',width:'--container-content'}:{text:'--text-',radius:'--radius-',shadow:'--shadow-',space:'--space-',width:'--content-width'};
  L.push(tw?`@import "tailwindcss";\n\n/*\n * ${tokenNote()}\n * 用法：bg-primary text-on-primary font-heading text-h1 rounded-card shadow-card max-w-content\n */\n@theme {`:`/*\n * ${tokenNote()}\n */\n:root {`);
  L.push('  /* 顏色 */');t.color.forEach(([k,h,d])=>L.push(`  --color-${k}: ${h};${tw?'':` /* ${d} */`}`));
  L.push('  /* 字體 */');t.font.forEach(([k,f])=>L.push(`  --font-${k}: ${f};`));
  L.push('  /* 字級 */');t.text.forEach(([k,x])=>{L.push(`  ${p.text}${k}: ${x.size};`);L.push(`  ${p.text}${k}--line-height: ${x.line};`);L.push(`  ${p.text}${k}--font-weight: ${x.weight};`);});
  L.push('  /* 形狀 */');t.radius.forEach(([k,r])=>L.push(`  ${p.radius}${k}: ${r};`));
  if(!tw) L.push(`  --border-width: ${t.border};`);
  t.shadow.forEach(([k,r])=>L.push(`  ${p.shadow}${k}: ${r};`));
  L.push('  /* 間距與寬度 */');t.space.forEach(([k,r])=>L.push(`  ${p.space}${k}: ${r};`));
  if(t.width!=='none') L.push(`  ${p.width}: ${t.width};`);
  L.push('}');
  return L.join('\n');
}
let tokensFmt='css';
const TOKEN_FILE={css:['tokens.css','text/css'],tailwind:['tailwind-theme.css','text/css'],json:['tokens.json','application/json']};
function renderTokens(){
  $$('#tokensSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===tokensFmt)));
  $('#tokensPre').textContent=tokensText(tokensFmt);
  $('#tokensNote').textContent=`${shortCode(state)}・${theme(state).dark?'深色':'淺色'}模式`;
}

/* ---------- accessibility view on the live preview: colour-vision filters and page zoom ---------- */
const view={vision:'',zoom:1};
function applyView(){
  const lp=$('#livePreview');
  lp.dataset.vision=view.vision;lp.dataset.zoom=String(view.zoom);
  $$('#visionSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===view.vision)));
  $$('#zoomSeg button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.v)===view.zoom)));
  $('#a11yBtn').classList.toggle('is-on',!$('#a11yBar').hidden);
  live.render(state);
}

/* ---------- recently viewed: combinations that stayed on screen for a moment ---------- */
let recentT=0;
function noteRecent(){
  clearTimeout(recentT);
  recentT=setTimeout(()=>{
    const c=enc(state);if(recent[0]&&recent[0].c===c) return;
    recent=[{c,t:Date.now()},...recent.filter(r=>r.c!==c)].slice(0,12);
    try{localStorage.setItem(RKEY,JSON.stringify(recent));}catch(e){}
    if(!$('#recentPop').hidden) renderRecent();
  },1500);
}
const ago=t=>{const m=Math.round((Date.now()-t)/60000);return m<1?'剛剛':m<60?`${m} 分鐘前`:m<1440?`${Math.round(m/60)} 小時前`:`${Math.round(m/1440)} 天前`;};
function renderRecent(){
  const cur=enc(state);
  $('#recentPop').innerHTML=`<div class="pop-h"><b>最近看過</b><small>停留超過 1.5 秒的組合會記在這裡</small></div>`+(recent.length?recent.map(r=>{
    const s=full(dec(r.c)),t=theme(s);
    return `<button type="button" class="rc${r.c===cur?' is-cur':''}" data-c="${r.c}"><span class="rc-sw">${[t.p,t.a,t.bg].map(h=>`<i style="background:${h}"></i>`).join('')}</span><span class="rc-t"><b>${shortCode(s)}</b><span>${labelOf(s)}</span></span><small>${r.c===cur?'目前':ago(r.t)}</small></button>`;
  }).join(''):'<p class="pop-empty">還沒有紀錄。換幾個組合看看，這裡會自動記下來。</p>');
}
function toggleRecent(open){
  const pop=$('#recentPop');pop.hidden=!open;$('#recentBtn').setAttribute('aria-expanded',String(open));
  if(open) renderRecent();
}

/* ---------- template library (data from template-library.js) ---------- */
const TL=Array.isArray(window.TEMPLATE_LIBRARY)?window.TEMPLATE_LIBRARY.filter(t=>t&&t.id&&t.path&&/^#[0-9a-fA-F]{6}$/.test(t.color||'')):[];
const TSET=window.TEMPLATE_SETS||{};
const KIND_NAME={front:'前台網站',admin:'後台系統'};
const LKEY='site-style-picker-libscope';
const HAS_FEAT=TL.some(t=>t.featured);
const lib={scope:'featured',kind:'all',tone:'all',style:'all',q:'',sort:'default'};
try{if(localStorage.getItem(LKEY)==='all')lib.scope='all';}catch(e){}
const pool=()=>(lib.scope==='all'||!HAS_FEAT)?TL:TL.filter(t=>t.featured);
function refreshScopeUI(){
  const n=pool().length;
  $('#libCount').textContent=n;$('#libTotal').textContent=n;
  $('#libScopeName').textContent=(lib.scope==='all'||!HAS_FEAT)?'全部範本':'精選範本';
  $$('#libScope .scope-n').forEach(s=>{s.textContent=s.dataset.n==='all'?TL.length:TL.filter(t=>t.featured).length;});
  $('#libScope').hidden=!HAS_FEAT;
}
function setScope(v){
  lib.scope=v==='all'?'all':'featured';
  try{localStorage.setItem(LKEY,lib.scope);}catch(e){}
  refreshScopeUI();
}
const hueDist=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d);};
function simScore(t,s){
  const L=byId(LAYOUTS,s.layout),th=theme(s),why=[];
  let sc=t.kind===L.g?4:-6;
  if(t.style===s.style){sc+=3;why.push('風格相同');}
  else if((t.alt||[]).includes(s.style)){sc+=1.5;why.push('風格相近');}
  // a template whose home page is another kind can still have an inner page of the chosen layout
  const page=t.layout===s.layout?null:(t.pages||[]).find(p=>p[2]===s.layout);
  if(t.layout===s.layout){sc+=2;why.push('版型相同');}
  else if(page){sc+=2;why.push(`含${L.name}`);}
  const a=hexToHsl(t.color),b=hexToHsl(paletteOf(s).p);
  let cs=0;
  if(a[1]<.18&&b[1]<.18) cs=1;
  else if(a[1]>=.18&&b[1]>=.18) cs=Math.max(0,1-hueDist(a[0],b[0])/70);
  sc+=cs*2.5;if(cs>=.55)why.push('色調相近');
  if(!!t.dark===th.dark){sc+=1;why.push(th.dark?'同為深色':'同為淺色');}
  return {score:sc,why,page};
}
function tplParts(t,why,page){
  const L=byId(LAYOUTS,t.layout),S=byId(STYLES,t.style),home=esc(t.path+(t.home||'index.html'));
  const feat=HAS_FEAT&&lib.scope==='all'&&t.featured?'<span class="tpl-feat">精選</span>':'';
  return {
    home,
    shot:`<a class="tpl-shot" href="${home}" target="_blank" rel="noopener" aria-label="開啟範本：${esc(t.name)}"><img src="${esc(t.thumb)}" alt="" loading="lazy" width="720" height="450"><span class="tpl-kind">${KIND_NAME[t.kind]||''}</span>${feat}</a>`,
    top:`<div class="tpl-top"><span class="tpl-dot" style="background:${esc(t.color)}"></span><span class="tpl-name" title="${esc(t.name)}">${esc(t.name)}</span><span class="tpl-set">${esc(TSET[t.set]||t.set)}</span></div>`,
    why:why&&why.length?`<div class="why">${why.slice(0,3).map(x=>`<span>${x}</span>`).join('')}</div>`:'',
    map:`<div class="tpl-map">${L?`<span>${L.id.toUpperCase()} ${L.name}</span>`:''}${S?`<span>${S.id.toUpperCase()} ${S.name}</span>`:''}${(t.tags||[]).slice(0,2).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`,
    match:page?`<a class="tpl-match" href="${esc(t.path+page[0])}" target="_blank" rel="noopener">對應頁面：${esc(page[1])} ↗</a>`:'',
    pages:`<div class="tpl-pages">${(t.pages||[]).map(([f,l])=>`<a href="${esc(t.path+f)}" target="_blank" rel="noopener"${page&&f===page[0]?' class="is-match"':''}>${esc(l)}</a>`).join('')}</div>`
  };
}
function libCard(t,why,page){
  const p=tplParts(t,why,page);
  return `<article class="tpl-card">${p.shot}<div class="tpl-body">${p.top}<p class="tpl-desc">${esc(t.desc)}</p>${p.why}${p.match}${p.map}${p.pages}<div class="tpl-act"><a class="btn" href="${p.home}" target="_blank" rel="noopener">開啟範本</a><button class="btn btn-primary" type="button" data-apply="${esc(t.id)}">用這個方向選配</button></div></div></article>`;
}
function simCard(t,why,page){
  const p=tplParts(t,why,page);
  return `<article class="sim-card">${p.shot}<div class="tpl-body">${p.top}${p.why}${p.match}<p class="tpl-desc">${esc(t.desc)}</p><div class="tpl-act"><a class="btn" href="${p.home}" target="_blank" rel="noopener">開啟範本</a><button class="btn" type="button" data-apply="${esc(t.id)}">用這個方向選配</button></div></div></article>`;
}
function renderLibrary(){
  const P=pool(),counts={};
  P.forEach(t=>{counts[t.style]=(counts[t.style]||0)+1;});
  if(lib.style!=='all'&&!counts[lib.style]) lib.style='all';
  $('#libStyles').innerHTML=`<button type="button" class="chip" data-v="all" aria-pressed="${lib.style==='all'}">全部風格</button>`+STYLES.filter(s=>counts[s.id]).map(s=>`<button type="button" class="chip" data-v="${s.id}" aria-pressed="${lib.style===s.id}">${s.name}<span class="count">${counts[s.id]}</span></button>`).join('');
  [['#libScope','scope'],['#libKind','kind'],['#libTone','tone'],['#libSort','sort']].forEach(([sel,key])=>$$(sel+' button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===lib[key]))));
  const q=lib.q.trim().toLowerCase();
  const list=P.filter(t=>(lib.kind==='all'||t.kind===lib.kind)
    &&(lib.tone==='all'||(lib.tone==='dark')===!!t.dark)
    &&(lib.style==='all'||t.style===lib.style||(t.alt||[]).includes(lib.style))
    &&(!q||[t.name,t.desc,(t.tags||[]).join(' '),TSET[t.set]||'',(t.pages||[]).map(x=>x[1]).join(' ')].join(' ').toLowerCase().includes(q)));
  const rows=list.map(t=>Object.assign({t},simScore(t,state)));
  if(lib.sort==='similar') rows.sort((a,b)=>b.score-a.score);
  $('#libResult').innerHTML=`顯示 <b>${rows.length}</b> / ${P.length} 套${HAS_FEAT&&lib.scope!=='all'?`（精選，另有 ${TL.length-P.length} 套未顯示）`:''}`;
  $('#libBasis').textContent=lib.sort==='similar'?`依目前組合 ${shortCode(state)}（${labelOf(state)}）排序`:'';
  $('#libGrid').innerHTML=rows.length?rows.map(r=>lib.sort==='similar'?libCard(r.t,r.why,r.page):libCard(r.t,null)).join(''):'<div class="empty">沒有符合條件的範本，試著放寬篩選或換個關鍵字。</div>';
}
function renderSimilar(){
  const sec=$('#similar');
  if(!TL.length){sec.hidden=true;return;}
  const g=byId(LAYOUTS,state.layout).g,cand=pool().filter(t=>t.kind===g);
  const ranked=cand.map(t=>Object.assign({t},simScore(t,state))).sort((a,b)=>b.score-a.score);
  // inner-page layouts (行事曆、系統設定…) are rarely a home page: if no pick shares the layout,
  // give the third slot to the best template that has such a page, so that page is always offered
  const top=ranked.slice(0,3);
  if(top.length===3&&!top.some(r=>r.t.layout===state.layout||r.page)){const r=ranked.find(r=>r.page);if(r)top[2]=r;}
  sec.hidden=!top.length;
  const scopeWord=HAS_FEAT?(lib.scope==='all'?'全部':'精選的'):'';
  $('#simNote').textContent=`依版型、風格、主色與深淺，從${scopeWord} ${cand.length} 套${g==='admin'?'後台':'前台'}範本挑出最接近的 ${top.length} 套。`;
  const sb=$('#simScope');sb.hidden=!HAS_FEAT;
  sb.textContent=lib.scope==='all'?'只用精選範本推薦':`改從全部 ${TL.length} 套推薦`;
  $('#simGrid').innerHTML=top.map(r=>simCard(r.t,r.why,r.page)).join('');
}
function showLibrary(opts){
  if(!TL.length) return;
  if(opts) Object.assign(lib,opts);
  $('#libSearch').value=lib.q;
  showView('library');clearHash();renderLibrary();window.scrollTo(0,0);
}
function applyTemplate(id){
  const t=TL.find(x=>x.id===id);if(!t)return;
  const st=byId(STYLES,t.style)||{};
  withUndo(()=>{
    Object.assign(state,{layout:t.layout,style:t.style,color:'c0',custom:t.color.toUpperCase(),mode:t.dark?(st.dark?0:2):(st.dark?1:0)});
    showWorkspace();
    window.scrollTo(0,0);
  },`已帶入「${t.name}」的版型、風格與主色，可再微調`);
}

/* ---------- presenting ---------- */
let fsEntered=false;
function startPresent(){
  document.body.classList.add('presenting');
  $('#presentBar').hidden=false;
  showView('workspace');
  window.scrollTo(0,0);
  const el=document.documentElement;
  try{
    if(el.requestFullscreen){el.requestFullscreen().then(()=>{fsEntered=true;}).catch(()=>{});}
  }catch(e){}
  live.queue();
  toast('投影模式：用下方箭頭切換，按 Esc 結束');
}
function stopPresent(){
  document.body.classList.remove('presenting');
  $('#presentBar').hidden=true;
  if(fsEntered&&document.fullscreenElement){try{document.exitFullscreen().catch(()=>{});}catch(e){}}
  fsEntered=false;
  live.queue();
}
function cycle(key,d){
  const ids=key==='layout'?LAYOUTS.map(x=>x.id):key==='style'?STYLES.map(x=>x.id):COLORS.map(x=>x.id);
  let i=ids.indexOf(state[key]);
  if(i<0) i=d>0?-1:0;
  state[key]=ids[(i+d+ids.length)%ids.length];
  update();
}

/* ---------- boot ---------- */
const TKEY='site-style-picker-theme',THEME_NAME={system:'跟隨系統',light:'亮色',dark:'暗色'};
let themeT=0;
function setTheme(t,announce){
  const root=document.documentElement;
  if(t!=='light'&&t!=='dark') t='system';
  if(announce&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){root.classList.add('theme-anim');clearTimeout(themeT);themeT=setTimeout(()=>root.classList.remove('theme-anim'),360);}
  if(t==='system') root.removeAttribute('data-ui-theme'); else root.setAttribute('data-ui-theme',t);
  try{if(t==='system')localStorage.removeItem(TKEY);else localStorage.setItem(TKEY,t);}catch(e){}
  $$('#themeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.t===t)));
  if(announce) toast(`介面主題：${THEME_NAME[t]}`);
}
$$('#themeSeg button').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.t,true)));
setTheme(document.documentElement.getAttribute('data-ui-theme')||'system',false);
const topbar=$('.topbar'),setTopH=()=>document.documentElement.style.setProperty('--top-h',topbar.offsetHeight+'px');
setTopH();
if('ResizeObserver' in window) new ResizeObserver(setTopH).observe(topbar);
buildPresets();
buildOptions();
buildDetails();
live=new Preview($('#livePreview'));
resDesk=new Preview($('#resDesk'));
resPhone=new Preview($('#resPhone'));
live.setDevice(state.device);
$$('#devSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===state.device)));

$$('.step-tab').forEach(t=>t.addEventListener('click',()=>{const n=Number(t.dataset.step);if(n===4)showResult(true);else setStep(n);}));
$('#prev').addEventListener('click',()=>{if(state.step>0)setStep(state.step-1);});
$('#next').addEventListener('click',()=>{if(state.step<3)setStep(state.step+1);else showResult(true);});
$('#back').addEventListener('click',()=>showWorkspace(3));
$('#shuffle').addEventListener('click',shuffle);
$('#shuffle2').addEventListener('click',shuffle);
$('#copy').addEventListener('click',copySpec);
$('#shareLink').addEventListener('click',copyLink);
$('#printBtn').addEventListener('click',()=>window.print());
// printing the result page: A4 sheets with the spec first and the previews after (print rules in selector.css)
window.addEventListener('beforeprint',()=>{
  if($('#result').hidden) return;
  document.body.classList.add('print-result');
  const d=$('#specDetails');d.dataset.wasOpen=d.open?'1':'';d.open=true;
  $('#printNote').textContent=(notes[enc(state)]||'').trim()||'（沒有討論紀錄）';
  $('#printMeta').textContent=`產出日期 ${new Date().toLocaleDateString('zh-TW')}${isHosted()?`・線上檢視 ${shareUrl(state)}`:''}`;
});
window.addEventListener('afterprint',()=>{
  if(!document.body.classList.contains('print-result')) return;
  document.body.classList.remove('print-result');
  const d=$('#specDetails');d.open=!!d.dataset.wasOpen;
  [resDesk,resPhone].forEach(p=>p.queue());
});
refreshLocks();
$$('.combo [data-lock]').forEach(b=>b.addEventListener('click',()=>{
  const k=b.dataset.lock;locks[k]=!locks[k];refreshLocks();
  try{localStorage.setItem(LOCKKEY,JSON.stringify(locks));}catch(e){}
  toast(locks[k]?`已鎖定${LOCKNAME[k]}，隨機組合時不會換掉`:`已解鎖${LOCKNAME[k]}，隨機組合時會一起換`);
}));
$('#exploreBtn').addEventListener('click',showExplore);
$('#brandBtn').addEventListener('click',openBrand);
$('#brandForm').addEventListener('input',e=>{if(e.target.name==='mark'||e.target.name==='name')logoPreview();});
$('#logoFile').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f) return;
  try{const img=await loadImg(await readFile(f));try{draftLogo=shrinkLogo(img);}catch(err){draftLogo=img.src;}logoPreview();showLogoColors(draftLogo);}
  catch(err){$('#logoColors').hidden=false;$('#logoSwatches').innerHTML='';$('#logoColorHint').textContent='讀不出這個檔案，請換成 PNG、JPG 或 SVG 圖片。';}
});
$('#logoClear').addEventListener('click',()=>{draftLogo='';logoPreview();$('#logoColors').hidden=true;});
$('#logoSwatches').addEventListener('click',e=>{
  const b=e.target.closest('[data-hex]');if(!b) return;
  state.custom=b.dataset.hex;state.color='c0';update();
  $$('#logoSwatches [data-hex]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  $('#logoColorHint').textContent=`主色已換成 ${b.dataset.hex}，關掉視窗就能在預覽看到`;
});
$('#brandReset').addEventListener('click',()=>{const f=$('#brandForm').elements;for(const k in BRAND_DEF) if(k!=='logo') f[k].value=BRAND_DEF[k];draftLogo='';logoPreview();$('#logoColors').hidden=true;});
$('#brandDlg').addEventListener('close',()=>{
  if($('#brandDlg').returnValue!=='save') return;
  const f=$('#brandForm').elements,o={logo:draftLogo};
  for(const k in BRAND_DEF) if(k!=='logo') o[k]=f[k].value.trim();
  if(!o.mark&&o.name) o.mark=o.name.charAt(0);
  setBrand(o);
  if(!persistBrand()){setBrand(Object.assign(o,{logo:''}));persistBrand();toast('Logo 圖片太大存不進瀏覽器，已先用文字標誌');}
  else toast(brandOn()?`已換成「${brand.name}」，所有預覽都會用這個名稱`:'已恢復範例名稱');
  brandChanged();
});
$('#tokensBtn').addEventListener('click',()=>{renderTokens();$('#tokensDlg').showModal();});
$$('#tokensSeg button').forEach(b=>b.addEventListener('click',()=>{tokensFmt=b.dataset.v;renderTokens();}));
$('#tokensClose').addEventListener('click',()=>$('#tokensDlg').close());
$('#tokensCopy').addEventListener('click',()=>{
  const b=$('#tokensCopy');
  copyText($('#tokensPre').textContent,null,()=>{const r=document.createRange();r.selectNodeContents($('#tokensPre'));const sel=getSelection();sel.removeAllRanges();sel.addRange(r);});
  b.textContent='已複製';setTimeout(()=>{b.textContent='複製';},1600);
});
$('#tokensDl').addEventListener('click',()=>{
  const [name,mime]=TOKEN_FILE[tokensFmt],a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([$('#tokensPre').textContent],{type:mime}));a.download=`${shortCode(state).toLowerCase()}-${name}`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
$('#a11yBtn').addEventListener('click',()=>{
  const bar=$('#a11yBar');bar.hidden=!bar.hidden;$('#a11yBtn').setAttribute('aria-expanded',String(!bar.hidden));
  if(bar.hidden){view.vision='';view.zoom=1;}
  applyView();
});
$$('#visionSeg button').forEach(b=>b.addEventListener('click',()=>{view.vision=b.dataset.v;applyView();}));
$$('#zoomSeg button').forEach(b=>b.addEventListener('click',()=>{view.zoom=Number(b.dataset.v);applyView();}));
$('#recentBtn').addEventListener('click',()=>toggleRecent($('#recentPop').hidden));
$('#recentPop').addEventListener('click',e=>{
  const b=e.target.closest('[data-c]');if(!b) return;
  toggleRecent(false);
  if(b.dataset.c===enc(state)) return;
  withUndo(()=>{Object.assign(state,dec(b.dataset.c));update();},`已切回 ${shortCode(dec(b.dataset.c))}`);
});
document.addEventListener('click',e=>{if(!$('#recentPop').hidden&&!e.target.closest('#recentPop,#recentBtn'))toggleRecent(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#recentPop').hidden){toggleRecent(false);$('#recentBtn').focus();}});
$('#expBack').addEventListener('click',()=>showWorkspace());
$('#expMore').addEventListener('click',renderExplore);
$$('#expAxis button').forEach(b=>b.addEventListener('click',()=>{expAxis=b.dataset.v;renderExplore();}));
$('#expGrid').addEventListener('click',e=>{
  const use=e.target.closest('[data-use]'),sv=e.target.closest('[data-save]');
  if(use){const it=expItems[Number(use.dataset.use)];withUndo(()=>{Object.assign(state,it.s,{mods:it.s.mods.slice()});showWorkspace();window.scrollTo(0,0);},`已套用 ${shortCode(it.s)}，可再微調`);}
  else if(sv){const code=enc(expItems[Number(sv.dataset.save)].s);if(toggleSaveCode(code)){const on=saved.includes(code);sv.setAttribute('aria-pressed',String(on));sv.textContent=on?'已收藏':'收藏';}}
});
$('#saveLive').addEventListener('click',toggleSave);
$('#saveRes').addEventListener('click',toggleSave);
$('#savedBtn').addEventListener('click',()=>{cmpShared=null;showCompare();});
if(TL.length){
  $('#libBtn').hidden=false;
  refreshScopeUI();
  $('#libBtn').addEventListener('click',()=>showLibrary());
  $$('#libScope button').forEach(b=>b.addEventListener('click',()=>{setScope(b.dataset.v);renderLibrary();}));
  $('#simScope').addEventListener('click',()=>{setScope(lib.scope==='all'?'featured':'all');renderSimilar();toast(lib.scope==='all'?`推薦範圍改為全部 ${TL.length} 套`:'推薦範圍改回精選範本');});
  $('#libBack').addEventListener('click',()=>showWorkspace());
  [['#libKind','kind'],['#libTone','tone'],['#libSort','sort']].forEach(([sel,key])=>$$(sel+' button').forEach(b=>b.addEventListener('click',()=>{lib[key]=b.dataset.v;renderLibrary();})));
  $('#libStyles').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b){lib.style=b.dataset.v;renderLibrary();}});
  let qT=0;
  $('#libSearch').addEventListener('input',e=>{clearTimeout(qT);qT=setTimeout(()=>{lib.q=e.target.value;renderLibrary();},150);});
  $('#seeAllSimilar').addEventListener('click',()=>showLibrary({kind:byId(LAYOUTS,state.layout).g,sort:'similar',style:'all',tone:'all',q:''}));
  ['#libGrid','#simGrid'].forEach(sel=>$(sel).addEventListener('click',e=>{const b=e.target.closest('[data-apply]');if(b)applyTemplate(b.dataset.apply);}));
}
$('#presentBtn').addEventListener('click',startPresent);
$('#presentExit').addEventListener('click',stopPresent);
$('#presentSave').addEventListener('click',toggleSave);
$$('#presentBar .cyc button').forEach(b=>b.addEventListener('click',()=>cycle(b.closest('.cyc').dataset.key,Number(b.dataset.d))));
document.addEventListener('keydown',e=>{
  if(!document.body.classList.contains('presenting'))return;
  if(e.key==='Escape'){stopPresent();}
  else if(e.key==='ArrowRight'&&!e.target.closest('input,textarea')){cycle('color',1);}
  else if(e.key==='ArrowLeft'&&!e.target.closest('input,textarea')){cycle('color',-1);}
});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&fsEntered&&document.body.classList.contains('presenting'))stopPresent();});
let noteT;
$('#noteBox').addEventListener('input',e=>{
  const code=enc(state),v=e.target.value;
  if(v.trim()) notes[code]=v; else delete notes[code];
  $('#specPre').textContent=specText();
  clearTimeout(noteT);noteT=setTimeout(persistNotes,300);
});
$('#cmpBack').addEventListener('click',()=>showWorkspace());
$('#resetDetails').addEventListener('click',()=>withUndo(()=>{resetDetails(state);update();},'細節已恢復預設'));
$('#randDetails').addEventListener('click',()=>withUndo(()=>{Object.assign(state,randomDetails(state));update();},()=>{const n=detailList(state).length-state.mods.filter(k=>modApplies(k,state.layout)).length;return n?`隨機搭配了 ${n} 項細節`:'這次抽到全部預設，再按一次試試';}));
$$('#lgSeg button').forEach(b=>b.addEventListener('click',()=>{
  const g=b.dataset.g;if(byId(LAYOUTS,state.layout).g===g)return;
  state.layout=groupLayout[g];update();
  if(state.step===0) revealPick(0);
}));
let clearArmed=0;
$('#cmpClear').addEventListener('click',e=>{
  if(!saved.length)return;
  const b=e.currentTarget;
  if(!clearArmed){clearArmed=setTimeout(()=>{clearArmed=0;b.textContent='清空收藏';},3000);b.textContent='再按一次確認清空';return;}
  clearTimeout(clearArmed);clearArmed=0;b.textContent='清空收藏';
  saved=[];persistSaved();refreshSaveUI();renderCompare();toast('已清空收藏');
});
$('#cmpGrid').addEventListener('click',e=>{
  const o=e.target.closest('[data-open]'),d=e.target.closest('[data-del]'),sv=e.target.closest('[data-save]');
  const codes=cmpShared||saved;
  if(o){Object.assign(state,dec(codes[Number(o.dataset.open)]));cmpShared=null;showResult(true);}
  else if(d){saved.splice(Number(d.dataset.del),1);persistSaved();refreshSaveUI();renderCompare();toast('已移除');}
  else if(sv&&toggleSaveCode(codes[Number(sv.dataset.save)])) renderCompare();
});
$('#cmpShare').addEventListener('click',()=>{
  const n=saved.filter(c=>(notes[c]||'').trim()).length;
  copyText(setUrl(saved),`已複製分享連結：${saved.length} 組${n?`與 ${n} 則討論紀錄`:''}，對方打開會直接看到並排比較`,()=>window.prompt('複製這個連結',setUrl(saved)));
});
$('#cmpAddAll').addEventListener('click',()=>{
  const add=cmpShared.filter(c=>!saved.includes(c)),room=6-saved.length,n=Math.min(add.length,room);
  saved.push(...add.slice(0,room));persistSaved();refreshSaveUI();renderCompare();
  toast(!add.length?'這些組合都已經在你的收藏裡':n<add.length?`收藏已滿 6 組，只加入了 ${n} 組`:`已加入 ${n} 組到你的收藏`);
});
$$('#devSeg button').forEach(b=>b.addEventListener('click',()=>{
  state.device=b.dataset.device;live.setDevice(state.device);
  $$('#devSeg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  live.render(state);save();
}));
function openHash(h){
  if(h.brand&&Object.keys(h.brand).length&&JSON.stringify(h.brand)!==JSON.stringify(brandText())){
    setBrand(h.brand);persistBrand();brandChanged();
    setTimeout(()=>toast(`已套用連結裡的客戶名稱「${brand.name}」，可在「客戶品牌」修改`),400);
  }
  if(h.set){
    // shared notes fill in only where this browser has none, so nothing local is overwritten
    h.set.forEach((c,i)=>{const t=typeof h.notes[i]==='string'?h.notes[i].trim():'';if(t&&!(notes[c]||'').trim())notes[c]=t;});
    persistNotes();
    cmpShared=h.set;showCompare();return;
  }
  Object.assign(state,h.combo);showResult(false);
}
window.addEventListener('hashchange',()=>{
  const h=readHash();
  if(h) openHash(h);
  else if(!$('#result').hidden){showWorkspace(3);}
});
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(()=>{[live,resDesk,resPhone].concat(cmpPreviews).forEach(p=>p.queue());});}

const fromHash=readHash();
update();
setStep(Math.min(Math.max(Number(state.step)||0,0),3));
refreshBrandUI();
if(fromHash) openHash(fromHash);
