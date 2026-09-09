window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const { STRATA, WELLS, FAULTS, RESERVOIR, PETRO, INJECTION, SITE } = C;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

/** 3D 場景所在的容器：B 版為 #scene，A／C 版為 #map，原始版為 #view3d */
const sceneEl = () => $('scene') || $('map') || $('view3d');

let S = null;
let tool = null;            // null | 'log' | 'section'
let pending = null;         // 剖面工具的第一點
let lastSection = null;     // 最近一次的剖面取樣結果
let lastLog = null;         // 最近一次的井柱位置
let volDone = false;        // 容積分頁是否已算過一次

/* ------------------------------------------------------------------ *
 * 初始化
 * ------------------------------------------------------------------ */

function init() {
  S = C.viewer;

  $('an-close').addEventListener('click', close);
  document.querySelectorAll('.an-tab').forEach((b) => {
    b.addEventListener('click', () => openTab(b.dataset.tab));
  });

  $('tool-log').addEventListener('click', () => setTool(tool === 'log' ? null : 'log'));
  $('tool-section').addEventListener('click', () => setTool(tool === 'section' ? null : 'section'));
  $('tool-vol').addEventListener('click', () => { open(); openTab('vol'); runVolumetrics(); });

  // 剖面屬性下拉
  const secSel = $('sec-mode');
  secSel.innerHTML = C.petro.COLOR_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
  secSel.addEventListener('change', () => { $('sec-follow').checked = false; redrawSection(); });
  $('sec-follow').addEventListener('change', () => {
    if ($('sec-follow').checked) { secSel.value = S.state.colorMode; redrawSection(); }
  });

  // 容積計算控制
  const volSel = $('vol-layer');
  volSel.innerHTML = STRATA
    .map((s, i) => ({ s, i }))
    .filter((o) => o.s.role === 'reservoir')
    .map((o) => `<option value="${o.i}"${o.i === RESERVOIR.strataIndex ? ' selected' : ''}>${esc(o.s.name)}</option>`).join('');
  $('vol-phi').addEventListener('input', (e) => { $('vol-phi-val').textContent = e.target.value + '%'; });
  $('vol-vsh').addEventListener('input', (e) => { $('vol-vsh-val').textContent = (+e.target.value).toFixed(2); });
  $('vol-run').addEventListener('click', runVolumetrics);
  volSel.addEventListener('change', runVolumetrics);
  $('vol-closure').addEventListener('change', runVolumetrics);

  // 工具點選：於場景容器的捕捉階段攔截，避免同時觸發地圖操作與一般拾取
  sceneEl().addEventListener('pointerdown', onScenePointer, true);

  window.addEventListener('resize', () => {
    if (!$('analysis').classList.contains('hidden')) redrawSection();
  });
}

/* ------------------------------------------------------------------ *
 * 視窗與工具狀態
 * ------------------------------------------------------------------ */

function open() { $('analysis').classList.remove('hidden'); }
function close() { $('analysis').classList.add('hidden'); setTool(null); }

function openTab(key) {
  document.querySelectorAll('.an-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === key));
  document.querySelectorAll('.an-pane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + key));
  // 首次開啟時給一個預設結果，不必先在場景上點選
  if (key === 'log' && !lastLog) { defaultLog(); return; }
  if (key === 'section') { if (lastSection) redrawSection(); else defaultSection(); }
  if (key === 'vol' && !volDone) runVolumetrics();
}

function setTool(t, keepLine) {
  tool = t;
  pending = null;
  $('tool-log').classList.toggle('on', t === 'log');
  $('tool-section').classList.toggle('on', t === 'section');
  document.body.classList.toggle('tool-active', !!t);
  const hint = $('tool-hint');
  if (t === 'log') hint.textContent = '井柱模式：在模型上點一點，即產生該位置的合成測井。';
  else if (t === 'section') hint.textContent = '剖面模式：點第一點為 A，再點第二點為 A′。';
  else hint.textContent = '合成井柱：在模型上點一點；任意剖面：點兩點拉出 A–A′。';
  if (!t && !keepLine) S.setSectionLine(null);
}

function onScenePointer(e) {
  if (!tool || e.button !== 0) return;
  const p = S.pickGround(e);
  if (!p) return;
  e.stopPropagation();
  e.preventDefault();

  if (tool === 'log') {
    showLog(p.x, p.z, '合成井柱');
    setTool(null);
    return;
  }
  if (!pending) {
    pending = p;
    S.setSectionLine(p, null);
    $('tool-hint').textContent = '已定 A 點，請點選 A′ 點。';
  } else {
    S.setSectionLine(pending, p);
    runSection(pending, p);
    setTool(null, true);   // 保留剛拉出的 A–A′ 標線
  }
}

/* ------------------------------------------------------------------ *
 * 合成井柱
 * ------------------------------------------------------------------ */

function showLog(x, z, title, well) {
  lastLog = { x, z, title, well };
  open();
  openTab('log');
  const data = C.welllog.draw($('log-canvas'), x, z, {
    title: title || '合成井柱',
    height: 620,
    well: well || null
  });
  $('log-side').innerHTML = data ? sideInfo(data, x, z) : '<p class="hint">此位置無地層資料。</p>';
}

function sideInfo(data, x, z) {
  const res = data.tops.find((t) => t.index === RESERVOIR.strataIndex);
  const seal = data.tops.find((t) => STRATA[t.index].role === 'seal');
  let html = C.welllog.topsTable(data);

  if (res) {
    const mid = Math.abs((res.top + res.bot) / 2);
    const ins = C.petro.insituAt(mid);
    // 儲層段的屬性統計
    const seg = data.samples.filter((s) => s.index === RESERVOIR.strataIndex);
    const stat = (pick) => {
      const v = seg.map(pick).sort((a, b) => a - b);
      if (!v.length) return null;
      const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
      return { p10: q(0.10), p50: q(0.50), p90: q(0.90) };
    };
    const phi = stat((s) => s.props.phi);
    const perm = stat((s) => s.props.perm);
    const sg = stat((s) => s.props.sg);

    html += `<div class="an-sub">主儲層 ${esc(STRATA[RESERVOIR.strataIndex].name)}</div>
      <dl class="kv tight">
        <dt>頂／底深</dt><dd>${Math.abs(res.top).toFixed(0)} ／ ${Math.abs(res.bot).toFixed(0)} m</dd>
        <dt>厚度</dt><dd>${res.thickness.toFixed(0)} m</dd>
        <dt>φ（P10/P50/P90）</dt><dd>${(phi.p10 * 100).toFixed(1)} / ${(phi.p50 * 100).toFixed(1)} / ${(phi.p90 * 100).toFixed(1)} %</dd>
        <dt>k（P10/P50/P90）</dt><dd>${perm.p10.toFixed(0)} / ${perm.p50.toFixed(0)} / ${perm.p90.toFixed(0)} mD</dd>
        <dt>原地溫度</dt><dd>${ins.temp.toFixed(1)} °C</dd>
        <dt>地層壓力</dt><dd>${ins.pressure.toFixed(1)} MPa</dd>
        <dt>CO₂ 相態</dt><dd>${ins.phase}（${ins.co2Density.toFixed(0)} kg/m³）</dd>
        <dt>CO₂ 黏度</dt><dd>${ins.co2Viscosity.toFixed(3)} mPa·s</dd>
        <dt>破裂壓力</dt><dd>${ins.fracPressure.toFixed(1)} MPa（容許上限 ${ins.maxInjection.toFixed(1)}）</dd>
        <dt>最大 CO₂ 飽和度</dt><dd>${sg ? (sg.p90 * 100).toFixed(0) : 0} %</dd>
      </dl>`;
  }

  if (seal) {
    const s = STRATA[seal.index];
    const mid = Math.abs((seal.top + seal.bot) / 2);
    const h = C.petro.sealColumnHeight(s, mid);
    const plume = INJECTION.find((r) => r.year === S.state.year) || INJECTION[INJECTION.length - 1];
    html += `<div class="an-sub">蓋層 ${esc(s.name)}</div>
      <dl class="kv tight">
        <dt>厚度</dt><dd>${seal.thickness.toFixed(0)} m</dd>
        <dt>毛細突破壓力</dt><dd>${s.petro.pc} MPa</dd>
        <dt>可滯留柱高</dt><dd>${h ? h.toFixed(0) : '–'} m</dd>
        <dt>現況羽流厚度</dt><dd>${plume.thickness.toFixed(1)} m</dd>
        <dt>安全係數</dt><dd>${h && plume.thickness > 0 ? (h / plume.thickness).toFixed(0) + ' ×' : '–'}</dd>
      </dl>
      <p class="note tight">柱高由 h = P<sub>c</sub> / (Δρ·g) 求得，Δρ 取地層水與原地 CO₂ 的密度差。</p>`;
  }

  const g = C.worldToLonLat(x, z);
  html += `<p class="note tight">取樣位置 ${g.lat.toFixed(5)}°N, ${g.lon.toFixed(5)}°E</p>`;
  return html;
}

/* ------------------------------------------------------------------ *
 * 地質剖面
 * ------------------------------------------------------------------ */

function runSection(a, b) {
  lastSection = C.section.sample(a.x, a.z, b.x, b.z, 300);
  if ($('sec-follow').checked) $('sec-mode').value = S.state.colorMode;
  open();
  openTab('section');
}

function redrawSection() {
  if (!lastSection) {
    $('sec-meta').textContent = '尚未建立剖面';
    return;
  }
  const pane = $('tab-section');
  const w = Math.max(520, pane.clientWidth - 24);
  const r = C.section.draw($('sec-canvas'), lastSection, {
    width: w,
    height: 440,
    colorMode: $('sec-mode').value,
    title: '地質剖面 A–A′'
  });
  const cross = C.section.faultsCrossing(lastSection).map((f) => f.id).join('、');
  $('sec-meta').textContent = '長度 ' + (lastSection.length / 1000).toFixed(2) + ' km｜方位 ' +
    C.section.bearing(lastSection).toFixed(0) + '°｜垂直放大 ×' + r.ve.toFixed(1) +
    (cross ? '｜含斷層 ' + cross : '');
}

/** 沿注入井拉一條預設的東西向剖面，供初次開啟時直接有東西可看 */
function defaultSection() {
  const w = C.lonLatToWorld(WELLS[0].lon, WELLS[0].lat);
  const a = { x: -SITE.halfExtent * 0.95, z: w.z };
  const b = { x: SITE.halfExtent * 0.95, z: w.z };
  S.setSectionLine(a, b);
  runSection(a, b);
}

/** 預設以注入井位置產生合成測井 */
function defaultLog() {
  const w = WELLS.find((v) => v.type === 'injector') || WELLS[0];
  const p = C.lonLatToWorld(w.lon, w.lat);
  showLog(p.x, p.z, w.name + '　合成測井', w);
}

/* ------------------------------------------------------------------ *
 * 容積與封存量
 * ------------------------------------------------------------------ */

function runVolumetrics() {
  open();
  volDone = true;
  const index = +$('vol-layer').value;
  const phiCut = +$('vol-phi').value / 100;
  const vshCut = +$('vol-vsh').value;
  const useClosure = $('vol-closure').checked;
  const box = $('vol-body');
  box.innerHTML = '<p class="hint">計算中…</p>';

  // 讓「計算中」先畫出來再做重運算
  setTimeout(() => {
    const v = C.petro.volumetrics({ index, phiCut, vshCut, closure: useClosure });
    if (!v) { box.innerHTML = '<p class="hint">無法計算。</p>'; return; }
    const s = STRATA[index];
    const row = INJECTION.find((r) => r.year === S.state.year) || INJECTION[INJECTION.length - 1];
    const mix = C.petro.trappingMix(row.year - INJECTION[0].year);
    const cl = v.closure;

    box.innerHTML = `
      <div class="vol-grid">
        <div class="vol-card">
          <h3>容積</h3>
          <dl class="kv tight">
            <dt>目標層</dt><dd>${esc(s.name)}（${esc(s.en)}）</dd>
            <dt>毛體積 GRV</dt><dd>${fmt(v.grv / 1e9, 3)} km³</dd>
            <dt>淨岩體積</dt><dd>${fmt(v.netVol / 1e9, 3)} km³（N/G ${(v.netToGrossVol * 100).toFixed(0)} %）</dd>
            <dt>淨孔隙體積</dt><dd>${fmt(v.poreVol / 1e6, 1)} 百萬 m³</dd>
            <dt>可用孔隙體積</dt><dd>${fmt(v.hcPore / 1e6, 1)} 百萬 m³（扣除 Swi ${(v.swi * 100).toFixed(0)} %）</dd>
            <dt>最大厚度</dt><dd>${v.maxThickness.toFixed(0)} m</dd>
            <dt>平均 φ</dt><dd>${(v.meanPhi * 100).toFixed(1)} %</dd>
            <dt>幾何平均 k</dt><dd>${v.meanPerm >= 10 ? v.meanPerm.toFixed(0) : v.meanPerm.toFixed(2)} mD</dd>
          </dl>
        </div>

        <div class="vol-card">
          <h3>儲存容量</h3>
          <p class="formula">M<sub>CO₂</sub> = A · h · φ · (1 − S<sub>wi</sub>) · ρ<sub>CO₂</sub> · E</p>
          <dl class="kv tight">
            <dt>參考深度</dt><dd>${v.insitu.depth.toFixed(0)} m</dd>
            <dt>溫度／壓力</dt><dd>${v.insitu.temp.toFixed(1)} °C ／ ${v.insitu.pressure.toFixed(1)} MPa</dd>
            <dt>CO₂ 密度</dt><dd>${v.insitu.co2Density.toFixed(0)} kg/m³（${v.insitu.phase}）</dd>
            <dt>儲存效率 E</dt><dd>${(v.efficiency * 100).toFixed(0)} %</dd>
            <dt class="hl">儲存容量</dt><dd class="hl">${fmt(v.capacityMt, 2)} Mt</dd>
            <dt>可注入年限</dt><dd>${v.yearsAtDesignRate.toFixed(0)} 年（@ ${PETRO.co2Rate} Mt/yr）</dd>
            <dt>目前累積</dt><dd>${row.cumulative.toFixed(2)} Mt（利用率 ${(row.cumulative / v.capacityMt * 100).toFixed(1)} %）</dd>
          </dl>
        </div>

        <div class="vol-card">
          <h3>構造閉合</h3>
          ${cl ? `<dl class="kv tight">
            <dt>頂點高程</dt><dd>${cl.crestElev.toFixed(0)} m</dd>
            <dt>溢出點</dt><dd>${cl.spillElev.toFixed(0)} m</dd>
            <dt>閉合高差</dt><dd>${cl.reliefM.toFixed(0)} m</dd>
            <dt>閉合型式</dt><dd>${cl.closedByPinchout ? '地層尖滅封閉（模型內未溢出）' : '構造閉合，達溢出點'}</dd>
          </dl>
          <p class="note tight">溢出點由頂面高程自頂點向下泛洪求得：低於此高程的等高線即與模型邊界連通，CO₂ 將側向溢出；目標層尖滅處視為地層邊界，不計為溢出。</p>`
        : `<p class="note tight">目前計入整個模型範圍。勾選「僅計構造閉合區」可只統計溢出點以上的部分，得到保守的構造圈閉容量。</p>`}
          <dl class="kv tight">
            <dt>孔隙度下限</dt><dd>${(phiCut * 100).toFixed(0)} %</dd>
            <dt>Vsh 上限</dt><dd>${vshCut.toFixed(2)}</dd>
            <dt>通過 cutoff</dt><dd>${(v.netCells / Math.max(1, v.cells * 5) * 100).toFixed(0)} % 取樣點</dd>
          </dl>
        </div>

        <div class="vol-card">
          <h3>封閉性與力學</h3>
          ${sealRows(index)}
          ${faultRows()}
        </div>

        <div class="vol-card wide">
          <h3>捕獲機制分配（${row.year}，注入後 ${row.year - INJECTION[0].year} 年）</h3>
          ${trapBar(mix)}
          <p class="note tight">構造／地層捕獲隨時間逐步轉為殘餘、溶解與礦化捕獲，封存安全性隨之提高；此處為示意趨勢，非場址模擬結果。</p>
        </div>
      </div>`;
  }, 30);
}

function sealRows(resIndex) {
  const seal = STRATA.slice(0, resIndex).reverse().find((s) => s.role === 'seal');
  if (!seal) return '';
  const i = STRATA.indexOf(seal);
  const mid = Math.abs((C.HORIZONS[i].elev + C.HORIZONS[i + 1].elev) / 2);
  const h = C.petro.sealColumnHeight(seal, mid);
  const resMid = Math.abs((C.HORIZONS[resIndex].elev + C.HORIZONS[resIndex + 1].elev) / 2);
  const ins = C.petro.insituAt(resMid);
  return `<dl class="kv tight">
      <dt>主蓋層</dt><dd>${esc(seal.name)}</dd>
      <dt>Pc 突破壓力</dt><dd>${seal.petro.pc} MPa</dd>
      <dt>可滯留柱高</dt><dd>${h ? h.toFixed(0) : '–'} m</dd>
      <dt>上覆岩壓 Sv</dt><dd>${ins.lithostatic.toFixed(1)} MPa</dd>
      <dt>壓力裕度</dt><dd>${(ins.maxInjection - ins.pressure).toFixed(1)} MPa</dd>
    </dl>`;
}

function faultRows() {
  return FAULTS.map((f) => {
    const r = C.petro.faultSGR(f);
    if (!r) return '';
    return `<dl class="kv tight">
      <dt>${esc(f.id)} 斷距</dt><dd>${f.throw} m（D/L ${(f.throw / f.length).toFixed(3)}）</dd>
      <dt>${esc(f.id)} SGR</dt><dd>${(r.sgr * 100).toFixed(0)} %　${r.sealing ? '<span class="ok">具側向封閉</span>' : '<span class="warn">封閉性存疑</span>'}</dd>
    </dl>`;
  }).join('');
}

function trapBar(mix) {
  const items = [
    ['構造／地層捕獲', mix.structural, '#35e0d0'],
    ['殘餘捕獲', mix.residual, '#ffb74d'],
    ['溶解捕獲', mix.dissolution, '#4fc3f7'],
    ['礦化捕獲', mix.mineral, '#c8e06a']
  ];
  const bar = items.map(([, v, c]) =>
    `<span style="width:${(v * 100).toFixed(2)}%;background:${c}"></span>`).join('');
  const legend = items.map(([n, v, c]) =>
    `<span class="lg"><i style="background:${c}"></i>${n} ${(v * 100).toFixed(1)}%</span>`).join('');
  return `<div class="trap-bar">${bar}</div><div class="trap-legend">${legend}</div>`;
}

C.analysis = { init, open, close, openTab, showLog, runSection, runVolumetrics, defaultSection, setTool, redrawSection };
})();
