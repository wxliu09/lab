window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const { STRATA, WELLS, MONITORS, INJECTION, FAULTS, SITE, HORIZONS, VECTORS } = C;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let S = null;

function init() {
  S = C.scene3d;
  buildStrataList();
  buildColorModes();
  bindControls();
  bindTimeline();
  C.analysis.init();
  S.state.onSelect = onSelect;
  S.state.onCamera = onCamera;
  S.state.onTerrainStatus = onTerrainStatus;
  onCamera(S.cameraInfo());
  showInfo(null);
}

/* ---------------- 屬性著色 ---------------- */

function buildColorModes() {
  const sel = $('color-mode');
  sel.innerHTML = C.petro.COLOR_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
  sel.value = S.state.colorMode;
  sel.addEventListener('change', () => {
    S.setColorMode(sel.value);
    updateColorbar();
    if ($('sec-follow').checked) { $('sec-mode').value = sel.value; C.analysis.redrawSection(); }
  });
  updateColorbar();
}

function updateColorbar() {
  const key = $('color-mode').value;
  const m = C.petro.MODE_MAP[key];
  if (!m.pick) {
    $('colorbar').style.background = '';
    $('colorbar').innerHTML = STRATA.map((s) =>
      `<i style="background:#${s.color.toString(16).padStart(6, '0')}" title="${esc(s.name)}"></i>`).join('');
    $('colorbar-ticks').innerHTML = '';
    $('colorbar-title').textContent = '依地層岩性著色，明暗反映局部孔隙度（單層與粒序）。';
    return;
  }
  const stops = C.petro.rampSamples(key, 24);
  $('colorbar').innerHTML = '';
  $('colorbar').style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
  const ticks = C.petro.rampTicks(key, 5);
  $('colorbar-ticks').innerHTML = ticks.map((t) => `<span>${t}</span>`).join('');
  $('colorbar-title').textContent = m.label + (m.unit ? '（' + m.unit + '）' : '') +
    (m.log ? '，對數色階' : '');
}

/* ---------------- 圖層清單 ---------------- */

function buildStrataList() {
  const box = $('strata-list');
  box.innerHTML = STRATA.map((s, i) => `
    <div class="stratum-row" data-i="${i}">
      <label class="chk">
        <input type="checkbox" data-strat="${i}" checked>
        <span class="swatch" style="background:#${s.color.toString(16).padStart(6, '0')}"></span>
        <span class="s-name">${esc(s.name)}</span>
      </label>
      <span class="role role-${s.role}">${roleLabel(s.role)}</span>
      <button class="mini-btn" data-focus="${i}" title="聚焦此層">◎</button>
    </div>`).join('');

  box.querySelectorAll('input[data-strat]').forEach((el) => {
    el.addEventListener('change', () => S.setStratumVisible(+el.dataset.strat, el.checked));
  });
  box.querySelectorAll('button[data-focus]').forEach((el) => {
    el.addEventListener('click', () => {
      const i = +el.dataset.focus;
      showInfo({ kind: 'stratum', index: i, data: STRATA[i] });
      // 只留該層與其上下界，其他半透明
      S.state.strata.children.forEach((m, k) => S.setStratumOpacity(k, k === i ? 1 : 0.18));
    });
  });
}

function roleLabel(r) {
  return { overburden: '上覆層', seal: '蓋層', reservoir: '儲層', basement: '基盤' }[r] || r;
}

/* ---------------- 控制項 ---------------- */

function bindControls() {
  $('ve').addEventListener('input', (e) => {
    const v = +e.target.value;
    $('ve-val').textContent = '×' + v;
    S.applyVerticalExaggeration(v);
  });

  $('explode').addEventListener('input', (e) => {
    const v = +e.target.value;
    $('explode-val').textContent = v + ' m';
    S.applyExploded(v);
  });

  $('basemap').addEventListener('change', (e) => {
    S.setBasemap(e.target.value);
    C.minimap.setBasemap(e.target.value);
  });

  document.querySelectorAll('input[data-layer]').forEach((el) => {
    el.addEventListener('change', () => S.setLayerVisible(el.dataset.layer, el.checked));
  });

  $('section-mode').addEventListener('change', (e) => {
    const m = e.target.value;
    $('section-offset').disabled = m === 'off';
    S.setSection(m, +$('section-offset').value);
  });
  $('section-offset').addEventListener('input', (e) => {
    $('section-offset-val').textContent = e.target.value + ' m';
    S.setSection($('section-mode').value, +e.target.value);
  });

  $('reset-opacity').addEventListener('click', () => {
    S.state.strata.children.forEach((m, k) => S.setStratumOpacity(k, 1));
  });

  $('auto-rotate').addEventListener('change', (e) => S.setAutoRotate(e.target.checked));

  document.querySelectorAll('button[data-view]').forEach((b) => {
    b.addEventListener('click', () => applyView(b.dataset.view));
  });

  $('panel-toggle').addEventListener('click', () => {
    document.body.classList.toggle('panel-collapsed');
    C.minimap.invalidate();
    S.resize($('scene'));
  });

  $('mini-toggle').addEventListener('click', () => {
    document.getElementById('minimap-wrap').classList.toggle('collapsed');
    C.minimap.invalidate();
  });
}

const VIEWS = {
  bird: { bearing: 35, pitch: 34, distance: 12000 },
  top: { bearing: 0, pitch: 89, distance: 9600 },
  ns: { bearing: 90, pitch: 6, distance: 12500 },
  ew: { bearing: 0, pitch: 6, distance: 12500 },
  reservoir: null
};

function applyView(key) {
  if (key === 'reservoir') { S.focusOnWell('CCS-1'); return; }
  S.flyTo(VIEWS[key]);
}

/* ---------------- 時間軸 ---------------- */

function bindTimeline() {
  const sl = $('year');
  sl.min = INJECTION[0].year;
  sl.max = INJECTION[INJECTION.length - 1].year;
  sl.value = INJECTION[INJECTION.length - 1].year;
  sl.addEventListener('input', () => setYear(+sl.value));

  let playing = false;
  let timer = null;
  $('play').addEventListener('click', () => {
    playing = !playing;
    $('play').textContent = playing ? '⏸ 暫停' : '▶ 播放';
    if (playing) {
      timer = setInterval(() => {
        let v = +sl.value + 1;
        if (v > +sl.max) v = +sl.min;
        sl.value = v;
        setYear(v);
      }, 420);
    } else clearInterval(timer);
  });

  setYear(+sl.value);
}

function setYear(y) {
  const row = S.setYear(y);
  $('year-label').textContent = row.year;
  $('year-phase').textContent = row.phase;
  $('year-phase').className = 'phase ' + (row.phase === '注入期' ? 'inj' : 'post');
  $('kpi-cum').textContent = row.cumulative.toFixed(2);
  $('kpi-radius').textContent = row.radius;
  $('kpi-thick').textContent = row.thickness.toFixed(1);
}

/* ---------------- 資訊面板 ---------------- */

function onSelect(hit) { showInfo(hit); }

function showInfo(hit) {
  const box = $('info-body');
  if (!hit) {
    box.innerHTML = `
      <p class="hint">點選任一地層、井、斷層或 CO₂ 羽流以查看屬性。</p>
      <dl class="kv">
        <dt>場址</dt><dd>${esc(SITE.name)}</dd>
        <dt>中心座標</dt><dd>${C.formatLatLng(SITE.lat, SITE.lon)}</dd>
        <dt>模型範圍</dt><dd>約 ${(SITE.halfExtent * 2 / 1000).toFixed(1)} × ${(SITE.halfExtent * 2 / 1000).toFixed(1)} km</dd>
        <dt>建模深度</dt><dd>0 ～ ${HORIZONS[HORIZONS.length - 1].elev} m</dd>
        <dt>地層數</dt><dd>${STRATA.length} 層（${HORIZONS.length} 個界面）</dd>
      </dl>
      <p class="note">各地層採不規則平面輪廓，並依沉積相帶方向設定尖滅（pinch-out）；兩條相向傾斜的正斷層夾出中央地壘，與背斜穹丘疊加構成構造圈閉。地層界面在斷層兩側有實際位移。</p>
      <p class="note tight">左側「屬性著色」可切換孔隙度、滲透率、Vsh、CO₂ 飽和度等屬性場；「地質分析」提供合成井柱、任意剖面與容積計算。</p>`;
    $('info-title').textContent = '場址概況';
    return;
  }

  if (hit.kind === 'stratum') {
    const s = hit.data;
    const i = hit.index;
    const top = HORIZONS[i];
    const bot = HORIZONS[i + 1];
    const lp = hit.point ? S.state.model.worldToLocal(hit.point.clone()) : null;
    const col = lp ? C.stratumDepthAt(i, lp.x, lp.z) : null;
    const zRel = col && col.thickness > 0 ? Math.min(1, Math.max(0, (col.top - lp.y) / col.thickness)) : 0.5;
    const pr = lp ? C.petro.propsAt(i, lp.x, lp.z, zRel, C.co2SaturationAt(i, lp.x, lp.z, zRel)) : null;
    const midDepth = Math.abs(col ? (col.top + col.bot) / 2 : (top.elev + bot.elev) / 2);
    const ins = C.petro.insituAt(midDepth);
    const sealH = s.role === 'seal' ? C.petro.sealColumnHeight(s, midDepth) : null;
    $('info-title').textContent = `${s.name}　${s.en}`;
    box.innerHTML = `
      <div class="tag-row"><span class="role role-${s.role}">${roleLabel(s.role)}</span>
        <span class="swatch lg" style="background:#${s.color.toString(16).padStart(6, '0')}"></span></div>
      <dl class="kv">
        <dt>時代</dt><dd>${esc(s.age.epoch)}（${s.age.from} – ${s.age.to} Ma）</dd>
        <dt>沉積環境</dt><dd>${esc(s.depoEnv)}</dd>
        <dt>岩性</dt><dd>${esc(s.lithology)}</dd>
        <dt>孔隙率（文獻）</dt><dd>${esc(s.porosity)}</dd>
        <dt>滲透率（文獻）</dt><dd>${esc(s.permeability)}</dd>
        <dt>基準深度</dt><dd>${top.elev} ～ ${bot.elev} m</dd>
        ${col ? `<dt>點位厚度</dt><dd>${col.thickness.toFixed(0)} m（頂 ${col.top.toFixed(0)} m）</dd>` : ''}
        <dt>平面形態</dt><dd>${s.extent ? `不規則，最大約塊體邊界的 ${Math.round(s.extent.scale * 100)}%` : '分布連續，覆蓋整個塊體'}</dd>
        <dt>尖滅</dt><dd>${s.pinch ? `朝方位 ${s.pinch.azimuth}° 減薄至 ${((1 - s.pinch.strength) * 100).toFixed(0)}%` : '無（範圍內厚度連續）'}</dd>
      </dl>
      ${pr ? `<div class="sub-title">點位屬性（層內 ${(zRel * 100).toFixed(0)} % 深度）</div>
      <dl class="kv tight">
        <dt>有效孔隙度 φ</dt><dd>${(pr.phi * 100).toFixed(1)} %</dd>
        <dt>滲透率 k</dt><dd>${pr.perm >= 1 ? pr.perm.toFixed(0) : pr.perm.toExponential(2)} mD</dd>
        <dt>淨毛比 NTG</dt><dd>${pr.ntg.toFixed(2)}</dd>
        <dt>泥質含量 Vsh</dt><dd>${pr.vsh.toFixed(2)}</dd>
        <dt>自然伽瑪 GR</dt><dd>${pr.gr.toFixed(0)} API</dd>
        <dt>體積密度</dt><dd>${pr.rhob.toFixed(2)} g/cm³</dd>
        <dt>縱波速度 Vp</dt><dd>${pr.vp.toFixed(0)} m/s</dd>
        ${pr.sg > 0.005 ? `<dt>CO₂ 飽和度</dt><dd>${(pr.sg * 100).toFixed(0)} %</dd>` : ''}
      </dl>` : ''}
      <div class="sub-title">原地條件（深度 ${midDepth.toFixed(0)} m）</div>
      <dl class="kv tight">
        <dt>溫度／壓力</dt><dd>${ins.temp.toFixed(1)} °C ／ ${ins.pressure.toFixed(1)} MPa</dd>
        <dt>CO₂ 相態</dt><dd>${ins.phase}，${ins.co2Density.toFixed(0)} kg/m³</dd>
        ${sealH ? `<dt>可滯留柱高</dt><dd>${sealH.toFixed(0)} m（Pc ${s.petro.pc} MPa）</dd>` : ''}
      </dl>
      <p class="note">${esc(s.note)}</p>
      ${lp ? `<button class="btn full" id="info-log">此處合成井柱</button>` : ''}`;
    if (lp) {
      $('info-log').addEventListener('click', () => C.analysis.showLog(lp.x, lp.z, '合成井柱（點選位置）'));
    }
    return;
  }

  if (hit.kind === 'well' || hit.kind === 'perf') {
    const w = hit.data;
    $('info-title').textContent = w.name;
    const p = C.lonLatToWorld(w.lon, w.lat);
    const col = C.scene3d.columnAt(p.x, p.z);
    box.innerHTML = `
      <dl class="kv">
        <dt>井別</dt><dd>${w.type === 'injector' ? 'CO₂ 注入井' : '監測觀測井'}</dd>
        <dt>井口座標</dt><dd>${C.formatLatLng(w.lat, w.lon)}</dd>
        <dt>總深</dt><dd>${Math.abs(w.depth)} m</dd>
        <dt>射孔段</dt><dd>${Math.abs(w.perf[0])} ～ ${Math.abs(w.perf[1])} m</dd>
        ${w.deviation ? `<dt>造斜位移</dt><dd>東 ${w.deviation.east} m、北 ${w.deviation.north} m</dd>` : ''}
      </dl>
      <p class="note">${esc(w.detail)}</p>
      <div class="col-title">井位地層柱狀（依實際不規則模型計算）</div>
      <div class="column">
        ${col.map((r) => `<div class="col-row">
            <span class="swatch" style="background:#${r.stratum.color.toString(16).padStart(6, '0')}"></span>
            <span class="c-name">${esc(r.stratum.name)}</span>
            <span class="c-depth">${r.top.toFixed(0)} ～ ${r.bot.toFixed(0)} m</span>
            <span class="c-th">${r.thickness.toFixed(0)} m</span>
          </div>`).join('')}
      </div>
      <button class="btn full" onclick="window.CCS.scene3d.focusOnWell('${w.id}')">飛往此井</button>
      <button class="btn full" id="info-well-log">此井合成測井</button>`;
    $('info-well-log').addEventListener('click', () => {
      C.analysis.showLog(p.x, p.z, w.name + '　合成測井', w);
    });
    return;
  }

  if (hit.kind === 'monitor') {
    const m = hit.data;
    $('info-title').textContent = m.name;
    const kind = { flux: '地表 CO₂ 通量', seismic: '微震', water: '地下水質', insar: '地表變形' }[m.kind];
    box.innerHTML = `<dl class="kv">
        <dt>站號</dt><dd>${esc(m.id)}</dd>
        <dt>監測項目</dt><dd>${esc(kind)}</dd>
        <dt>座標</dt><dd>${C.formatLatLng(m.lat, m.lon)}</dd>
      </dl>
      <p class="note">地表監測網用於驗證封存完整性，依 MMV（Measurement, Monitoring &amp; Verification）計畫定期採樣。</p>`;
    return;
  }

  if (hit.kind === 'fault') {
    const f = hit.data;
    const sgr = C.petro.faultSGR(f);
    $('info-title').textContent = f.name;
    box.innerHTML = `<dl class="kv">
        <dt>走向 / 傾角</dt><dd>${f.strike}° / ${f.dip}°</dd>
        <dt>運動性質</dt><dd>${f.sense === 'reverse' ? '逆斷層（上盤上衝）' : '正斷層（上盤下降）'}</dd>
        <dt>延伸長度</dt><dd>${(f.length / 1000).toFixed(1)} km</dd>
        <dt>切穿深度</dt><dd>${f.topElev} ～ ${f.botElev} m</dd>
        <dt>最大斷距</dt><dd>${f.throw} m（D/L ${(f.throw / f.length).toFixed(3)}）</dd>
        <dt>破裂帶半寬</dt><dd>${f.damage} m</dd>
        ${sgr ? `<dt>SGR 泥質塗抹比</dt><dd>${(sgr.sgr * 100).toFixed(0)} %　${sgr.sealing ? '<span class="ok">具側向封閉</span>' : '<span class="warn">封閉性存疑</span>'}</dd>` : ''}
      </dl>
      <p class="note">${esc(f.note)}</p>
      <p class="note tight">斷距沿走向與沿傾向皆呈橢圓分布，兩端與上下尖端衰減為零；上盤與下盤各承擔一半位移，因此在剖面上可直接量到兩側同一界面的高程差。</p>`;
    return;
  }

  if (hit.kind === 'plume') {
    const row = INJECTION.find((r) => r.year === S.state.year);
    $('info-title').textContent = 'CO₂ 羽流';
    box.innerHTML = `<dl class="kv">
        <dt>年份</dt><dd>${row.year}（${row.phase}）</dd>
        <dt>累積注入量</dt><dd>${row.cumulative.toFixed(2)} Mt</dd>
        <dt>羽流半徑</dt><dd>約 ${row.radius} m</dd>
        <dt>最大厚度</dt><dd>${row.thickness.toFixed(1)} m</dd>
        <dt>賦存層</dt><dd>${esc(STRATA[C.RESERVOIR.strataIndex].name)}</dd>
      </dl>
      <p class="note">超臨界 CO₂ 因浮力聚集於儲層頂面，受蓋層阻擋而側向擴展。平面形狀不規則，反映儲層滲透率的非均質性。</p>`;
    return;
  }

  if (hit.kind === 'vector') {
    $('info-title').textContent = hit.data.name;
    box.innerHTML = `<p class="note">場址向量圖徵，已由 2D 圖台搬入 3D 場景並貼合地表起伏。</p>`;
    return;
  }

  showInfo(null);
}

/* ---------------- 狀態列 ---------------- */

function onCamera(info) {
  $('st-bearing').textContent = info.bearing.toFixed(0) + '°';
  $('st-pitch').textContent = info.pitch.toFixed(0) + '°';
  $('st-dist').textContent = (info.distance / 1000).toFixed(2) + ' km';
  $('st-center').textContent = C.formatLatLng(info.target.lat, info.target.lon);
  C.minimap.update(info);
  $('compass-needle').style.transform = `rotate(${-info.bearing}deg)`;
}

function onTerrainStatus(loaded, total, mode) {
  const el = $('st-tiles');
  if (mode === 'loading') el.textContent = `底圖 ${loaded}/${total}`;
  else if (mode === 'tiles') el.textContent = `底圖就緒 ${loaded}/${total}`;
  else if (mode === 'offline') el.textContent = '離線：程序式地形';
  else if (mode === 'tainted') el.textContent = '底圖跨域受限：程序式地形';
}

Object.assign(C, { ui: { init, showInfo, setYear } });
})();
