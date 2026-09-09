window.CCS = window.CCS || {};
(function () {
'use strict';

const L = window.L;
const C = window.CCS;
const { SITE, BASEMAPS, WELLS, MONITORS, VECTORS, STRATA, INJECTION, HORIZONS } = C;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let map = null;
let O = null;
let baseLayers = {};
let wellLayer = null;
let monitorLayer = null;

function fail(msg) {
  const el = $('boot-error');
  el.style.display = 'block';
  el.querySelector('.msg').textContent = msg;
  console.error(msg);
}

function start() {
  if (!window.L) { fail('Leaflet 未載入'); return; }
  if (!window.THREE) { fail('Three.js 未載入'); return; }
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    fail('此瀏覽器未啟用 WebGL'); return;
  }

  map = L.map('map', {
    center: [SITE.lat, SITE.lon],
    zoom: SITE.defaultZoom,
    zoomControl: false,
    minZoom: 10,
    maxZoom: 18
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

  Object.entries(BASEMAPS).forEach(([k, v]) => {
    baseLayers[k] = L.tileLayer(v.url, { maxZoom: v.maxZoom, attribution: v.attribution });
  });
  baseLayers.imagery.addTo(map);

  buildLeafletLayers();

  O = C.overlay3d;
  O.init(map, { onTerrainStatus });
  O.onSelect = onSelect;
  O.state.onSelect = onSelect;

  map.on('click', (e) => {
    if (O.state.mode !== 'aligned') return;
    if (document.body.classList.contains('tool-active')) return;
    const hit = O.pickFromMapEvent(e);
    if (hit) onSelect(hit);
    else showInfo(null);
  });

  bindUI();
  showInfo(null);
  updateScaleReadout();
  map.on('zoomend moveend', updateScaleReadout);

  $('loading').classList.add('done');
}

/* ---------------- Leaflet 原生圖層（示範生態可用） ---------------- */

function buildLeafletLayers() {
  const area = VECTORS.licenseArea;
  L.polygon(area.ring.map(([e, n]) => {
    const ll = C.worldToLonLat(e, -n); return [ll.lat, ll.lon];
  }), { color: '#35e0d0', weight: 2, fillOpacity: 0.06 })
    .bindPopup('<b>封存許可區</b><br>依 CCS 專法核發之地下封存權範圍。')
    .addTo(map);

  [VECTORS.pipeline, VECTORS.river].forEach((v) => {
    L.polyline(v.line.map(([e, n]) => {
      const ll = C.worldToLonLat(e, -n); return [ll.lat, ll.lon];
    }), {
      color: '#' + v.color.toString(16).padStart(6, '0'),
      weight: 3, opacity: 0.9,
      dashArray: v === VECTORS.pipeline ? '8 5' : null
    }).bindPopup(`<b>${v.name}</b>`).addTo(map);
  });

  wellLayer = L.layerGroup().addTo(map);
  WELLS.forEach((w) => {
    const icon = L.divIcon({
      className: 'well-pin ' + (w.type === 'injector' ? 'inj' : 'obs'),
      html: `<span class="pin-dot"></span><span class="pin-label">${w.id}</span>`,
      iconSize: [0, 0], iconAnchor: [0, 0]
    });
    L.marker([w.lat, w.lon], { icon })
      .bindPopup(`<b>${w.name}</b><br>總深 ${Math.abs(w.depth)} m<br>
        射孔 ${Math.abs(w.perf[0])} – ${Math.abs(w.perf[1])} m<br>
        <small>${w.detail}</small>`)
      .on('click', () => showInfo({ kind: 'well', data: w }))
      .addTo(wellLayer);
  });

  monitorLayer = L.layerGroup().addTo(map);
  MONITORS.forEach((m) => {
    L.circleMarker([m.lat, m.lon], {
      radius: 5, color: '#0b1119', weight: 1.5, fillColor: '#8fd3a0', fillOpacity: 1
    }).bindPopup(`<b>${m.name}</b><br>站號 ${m.id}`)
      .on('click', () => showInfo({ kind: 'monitor', data: m }))
      .addTo(monitorLayer);
  });

  L.control.layers(
    {
      '衛星影像': baseLayers.imagery,
      '街道圖': baseLayers.osm,
      '淺色圖': baseLayers.light
    },
    { '井位（Leaflet marker）': wellLayer, '監測站（Leaflet marker）': monitorLayer },
    { position: 'bottomright', collapsed: true }
  ).addTo(map);
}

/* ---------------- UI ---------------- */

function bindUI() {
  buildStrataList();
  buildColorModes();
  C.analysis.init();

  $('mode-aligned').addEventListener('click', () => switchMode('aligned'));
  $('mode-free').addEventListener('click', () => switchMode('free'));

  $('ve').addEventListener('input', (e) => {
    $('ve-val').textContent = '×' + e.target.value;
    O.setVerticalExaggeration(+e.target.value);
  });
  $('oblique').addEventListener('input', (e) => {
    const v = +e.target.value;
    $('oblique-val').textContent = v.toFixed(2);
    O.setOblique(v);
    $('align-note').classList.toggle('warn-on', v > 0);
  });
  $('oblique-dir').addEventListener('input', (e) => {
    $('oblique-dir-val').textContent = e.target.value + '°';
    O.setObliqueDir(+e.target.value);
  });
  $('opacity').addEventListener('input', (e) => {
    $('opacity-val').textContent = Math.round(e.target.value * 100) + '%';
    O.setGlobalOpacity(+e.target.value);
  });

  document.querySelectorAll('input[data-layer]').forEach((el) => {
    el.addEventListener('change', () => O.setLayerVisible(el.dataset.layer, el.checked));
  });

  $('section-mode').addEventListener('change', (e) => {
    $('section-offset').disabled = e.target.value === 'off';
    O.setSection(e.target.value, +$('section-offset').value);
  });
  $('section-offset').addEventListener('input', (e) => {
    $('section-offset-val').textContent = e.target.value + ' m';
    O.setSection($('section-mode').value, +e.target.value);
  });

  $('panel-toggle').addEventListener('click', () => {
    document.body.classList.toggle('panel-collapsed');
    setTimeout(() => { map.invalidateSize(); O.align(); }, 260);
  });

  const sl = $('year');
  sl.min = INJECTION[0].year;
  sl.max = INJECTION[INJECTION.length - 1].year;
  sl.value = sl.max;
  sl.addEventListener('input', () => setYear(+sl.value));
  let playing = false, timer = null;
  $('play').addEventListener('click', () => {
    playing = !playing;
    $('play').textContent = playing ? '⏸ 暫停' : '▶ 播放';
    if (playing) timer = setInterval(() => {
      let v = +sl.value + 1; if (v > +sl.max) v = +sl.min;
      sl.value = v; setYear(v);
    }, 420);
    else clearInterval(timer);
  });
  setYear(+sl.value);

  document.querySelectorAll('button[data-preset]').forEach((b) => {
    b.addEventListener('click', () => applyPreset(b.dataset.preset));
  });
}

function switchMode(m) {
  O.setMode(m);
  $('mode-aligned').classList.toggle('on', m === 'aligned');
  $('mode-free').classList.toggle('on', m === 'free');
  document.body.classList.toggle('free', m === 'free');
  $('mode-note').textContent = m === 'aligned'
    ? '對齊模式：3D 與 Leaflet 逐像素對齊，marker／popup／圖層控制照常可用。'
    : '自由 3D 模式：已切為透視相機，可 360° 環繞；此時與 Leaflet 底圖不再對齊，地圖拖曳已停用。';
}

function applyPreset(k) {
  if (k === 'flat') {
    $('oblique').value = 0; $('oblique-val').textContent = '0.00'; O.setOblique(0);
    $('opacity').value = 1; $('opacity-val').textContent = '100%'; O.setGlobalOpacity(1);
    $('align-note').classList.remove('warn-on');
  } else if (k === 'stack') {
    $('oblique').value = 0.55; $('oblique-val').textContent = '0.55'; O.setOblique(0.55);
    $('opacity').value = 1; $('opacity-val').textContent = '100%'; O.setGlobalOpacity(1);
    $('align-note').classList.add('warn-on');
  } else if (k === 'xray') {
    $('oblique').value = 0; $('oblique-val').textContent = '0.00'; O.setOblique(0);
    $('opacity').value = 0.3; $('opacity-val').textContent = '30%'; O.setGlobalOpacity(0.3);
    $('align-note').classList.remove('warn-on');
  }
}

function buildStrataList() {
  const box = $('strata-list');
  box.innerHTML = STRATA.map((s, i) => `
    <div class="stratum-row">
      <label class="chk">
        <input type="checkbox" data-strat="${i}" checked>
        <span class="swatch" style="background:#${s.color.toString(16).padStart(6, '0')}"></span>
        <span class="s-name">${esc(s.name)}</span>
      </label>
      <span class="role role-${s.role}">${roleLabel(s.role)}</span>
    </div>`).join('');
  box.querySelectorAll('input[data-strat]').forEach((el) => {
    el.addEventListener('change', () => C.overlay3d.setStratumVisible(+el.dataset.strat, el.checked));
  });
}

function roleLabel(r) {
  return { overburden: '上覆層', seal: '蓋層', reservoir: '儲層', basement: '基盤' }[r] || r;
}

/* ---------------- 屬性著色 ---------------- */

function buildColorModes() {
  const sel = $('color-mode');
  sel.innerHTML = C.petro.COLOR_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
  sel.value = O.state.colorMode;
  sel.addEventListener('change', () => {
    O.setColorMode(sel.value);
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
  $('colorbar-ticks').innerHTML = C.petro.rampTicks(key, 5).map((t) => `<span>${t}</span>`).join('');
  $('colorbar-title').textContent = m.label + (m.unit ? '（' + m.unit + '）' : '') +
    (m.log ? '，對數色階' : '');
}

/** 由模型局部座標取得地層柱狀（虛擬鑽井） */
function columnAt(x, z) {
  const rows = [];
  STRATA.forEach((s, i) => {
    const d = C.stratumDepthAt(i, x, z);
    if (d && d.thickness > 0.5) rows.push({ stratum: s, ...d });
  });
  return rows;
}

function setYear(y) {
  const row = O.setYear(y);
  $('year-label').textContent = row.year;
  $('year-phase').textContent = row.phase;
  $('year-phase').className = 'phase ' + (row.phase === '注入期' ? 'inj' : 'post');
  $('kpi-cum').textContent = row.cumulative.toFixed(2);
  $('kpi-radius').textContent = row.radius;
}

function updateScaleReadout() {
  const ppm = O.pixelsPerMeter();
  $('st-zoom').textContent = map.getZoom().toFixed(1);
  $('st-ppm').textContent = ppm.toFixed(4);
  const c = map.getCenter();
  $('st-center').textContent = C.formatLatLng(c.lat, c.lng);
}

function onTerrainStatus(loaded, total, mode) {
  const el = $('st-tiles');
  if (mode === 'loading') el.textContent = `3D 地表 ${loaded}/${total}`;
  else if (mode === 'tiles') el.textContent = `3D 地表就緒 ${loaded}/${total}`;
  else if (mode === 'offline') el.textContent = '離線：程序式地形';
  else el.textContent = '底圖跨域受限：程序式地形';
}

/* ---------------- 資訊 ---------------- */

function onSelect(hit) { showInfo(hit); }

function showInfo(hit) {
  const box = $('info-body');
  if (!hit) {
    $('info-title').textContent = '方案 A 說明';
    box.innerHTML = `
      <p class="hint">點選地圖上的地層、井或羽流以查看屬性；Leaflet 原生 marker 亦可直接點擊開啟 popup。</p>
      <dl class="kv">
        <dt>底圖引擎</dt><dd>Leaflet（原生互動全保留）</dd>
        <dt>3D 引擎</dt><dd>Three.js，置於自訂 pane <code>three3d</code></dd>
        <dt>對齊方式</dt><dd>正交相機，視框 = 視窗像素 ÷ 每公尺像素</dd>
        <dt>限制</dt><dd>Leaflet 無 pitch／bearing，正射俯視才能精確對齊</dd>
      </dl>
      <p class="note">要看地下構造，可用「深度斜移」把各層沿固定螢幕方向錯開（頂面仍完全對齊），
      或用「透視」把地層調成半透明。需要真正 360° 環繞時再切到自由 3D 模式。</p>
      <p class="note tight">左側「屬性著色」可切換孔隙度、滲透率、Vsh、CO₂ 飽和度等屬性場；
      「地質分析」提供合成井柱、任意剖面與容積計算。</p>`;
    return;
  }
  if (hit.kind === 'stratum') {
    const s = hit.data;
    const i = hit.index;
    const top = HORIZONS[i];
    const bot = HORIZONS[i + 1];
    const lp = hit.point ? O.state.model.worldToLocal(hit.point.clone()) : null;
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
    const p = C.lonLatToWorld(w.lon, w.lat);
    const col = columnAt(p.x, p.z);
    $('info-title').textContent = w.name;
    box.innerHTML = `<dl class="kv">
        <dt>井別</dt><dd>${w.type === 'injector' ? 'CO₂ 注入井' : '監測觀測井'}</dd>
        <dt>井口座標</dt><dd>${C.formatLatLng(w.lat, w.lon)}</dd>
        <dt>總深</dt><dd>${Math.abs(w.depth)} m</dd>
        <dt>射孔段</dt><dd>${Math.abs(w.perf[0])} ～ ${Math.abs(w.perf[1])} m</dd>
        ${w.deviation ? `<dt>造斜位移</dt><dd>東 ${w.deviation.east} m、北 ${w.deviation.north} m</dd>` : ''}
      </dl><p class="note">${esc(w.detail)}</p>
      <div class="col-title">井位地層柱狀（依實際不規則模型計算）</div>
      <div class="column">
        ${col.map((r) => `<div class="col-row">
            <span class="swatch" style="background:#${r.stratum.color.toString(16).padStart(6, '0')}"></span>
            <span class="c-name">${esc(r.stratum.name)}</span>
            <span class="c-depth">${r.top.toFixed(0)} ～ ${r.bot.toFixed(0)} m</span>
            <span class="c-th">${r.thickness.toFixed(0)} m</span>
          </div>`).join('')}
      </div>
      <button class="btn full" id="info-well-log">此井合成測井</button>`;
    $('info-well-log').addEventListener('click', () => {
      C.analysis.showLog(p.x, p.z, w.name + '　合成測井', w);
    });
    return;
  }
  if (hit.kind === 'monitor') {
    const m = hit.data;
    $('info-title').textContent = m.name;
    box.innerHTML = `<dl class="kv"><dt>站號</dt><dd>${esc(m.id)}</dd>
      <dt>座標</dt><dd>${C.formatLatLng(m.lat, m.lon)}</dd></dl>`;
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
    const row = INJECTION.find((r) => r.year === O.state.year);
    $('info-title').textContent = 'CO₂ 羽流';
    box.innerHTML = `<dl class="kv"><dt>年份</dt><dd>${row.year}</dd>
      <dt>累積注入</dt><dd>${row.cumulative.toFixed(2)} Mt</dd>
      <dt>羽流半徑</dt><dd>${row.radius} m</dd></dl>
      <p class="note">羽流位於上福基砂岩頂部，其地表投影可直接與 Leaflet 圖徵套疊比對。</p>`;
    return;
  }
  showInfo(null);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.CCS_DEBUG = { get map() { return map; }, get o() { return C.overlay3d.state; } };
})();
