window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const { SITE, BASEMAPS, WELLS, MONITORS, VECTORS, STRATA, INJECTION, HORIZONS } = C;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let map = null;
let LY = null;
let markers = [];

function fail(msg) {
  const el = $('boot-error');
  el.style.display = 'block';
  el.querySelector('.msg').textContent = msg;
  console.error(msg);
}

/** 以 inline style JSON 建立 raster 底圖，完全不需要 vector tile 伺服器 */
function makeStyle(key) {
  const b = BASEMAPS[key];
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [b.url.replace('{s}', 'a')],
        tileSize: 256,
        maxzoom: b.maxZoom,
        attribution: b.attribution
      }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0d1620' } },
      { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 1 } }
    ]
  };
}

function start() {
  if (!window.maplibregl) { fail('MapLibre GL JS 未載入'); return; }
  if (!window.THREE) { fail('Three.js 未載入'); return; }
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    fail('此瀏覽器未啟用 WebGL'); return;
  }

  map = new maplibregl.Map({
    container: 'map',
    style: makeStyle('imagery'),
    center: [SITE.lon, SITE.lat],
    zoom: 12.6,
    pitch: 58,
    bearing: -28,
    antialias: true,
    attributionControl: { compact: true },
    maxPitch: 85
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

  LY = C.ccsLayer;

  map.on('load', () => {
    map.addLayer(LY.makeCustomLayer('ccs-3d'));
    addMapLibreFeatures();
    addMarkers();
    bindUI();
    showInfo(null);
    onView();
    $('loading').classList.add('done');
  });

  map.on('move', onView);
  map.on('rotate', onView);
  map.on('pitch', onView);
  map.on('click', (e) => {
    if (document.body.classList.contains('tool-active')) return;
    const hit = LY.pickAt(e.point.x, e.point.y);
    if (hit) showInfo(hit); else showInfo(null);
  });
  map.on('error', (e) => console.warn('maplibre:', e && e.error && e.error.message));
}

/* ---------------- MapLibre 原生向量圖層（示範共存） ---------------- */

function ll(e, n) {
  const p = C.worldToLonLat(e, -n);
  return [p.lon, p.lat];
}

function addMapLibreFeatures() {
  map.addSource('license', {
    type: 'geojson',
    data: {
      type: 'Feature', properties: { name: VECTORS.licenseArea.name },
      geometry: { type: 'Polygon', coordinates: [[...VECTORS.licenseArea.ring.map(([e, n]) => ll(e, n)), ll(...VECTORS.licenseArea.ring[0])]] }
    }
  });
  map.addLayer({
    id: 'license-fill', type: 'fill', source: 'license',
    paint: { 'fill-color': '#35e0d0', 'fill-opacity': 0.07 }
  });
  map.addLayer({
    id: 'license-line', type: 'line', source: 'license',
    paint: { 'line-color': '#35e0d0', 'line-width': 2 }
  });

  map.addSource('pipeline', {
    type: 'geojson',
    data: {
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: VECTORS.pipeline.line.map(([e, n]) => ll(e, n)) }
    }
  });
  map.addLayer({
    id: 'pipeline-line', type: 'line', source: 'pipeline',
    paint: { 'line-color': '#ff9d3c', 'line-width': 3, 'line-dasharray': [2, 1.4] }
  });

  map.addSource('river', {
    type: 'geojson',
    data: {
      type: 'Feature', properties: {},
      geometry: { type: 'LineString', coordinates: VECTORS.river.line.map(([e, n]) => ll(e, n)) }
    }
  });
  map.addLayer({
    id: 'river-line', type: 'line', source: 'river',
    paint: { 'line-color': '#4aa3ff', 'line-width': 2.4, 'line-opacity': 0.9 }
  });
}

/** MapLibre Marker（HTML）：隨 pitch/bearing 自動貼地 */
function addMarkers() {
  WELLS.forEach((w) => {
    const el = document.createElement('div');
    el.className = 'mk ' + (w.type === 'injector' ? 'inj' : 'obs');
    el.innerHTML = `<span class="mk-dot"></span><span class="mk-lab">${w.id}</span>`;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); showInfo({ kind: 'well', data: w }); });
    const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([w.lon, w.lat])
      .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(
        `<b>${w.name}</b><br>總深 ${Math.abs(w.depth)} m<br><small>${w.detail}</small>`))
      .addTo(map);
    markers.push(m);
  });

  MONITORS.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'mk mon';
    el.innerHTML = `<span class="mk-dot"></span><span class="mk-lab">${s.id}</span>`;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); showInfo({ kind: 'monitor', data: s }); });
    markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([s.lon, s.lat])
      .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${s.name}</b>`))
      .addTo(map));
  });
}

/* ---------------- UI ---------------- */

function bindUI() {
  buildStrataList();
  buildColorModes();
  C.analysis.init();

  $('basemap').addEventListener('change', (e) => {
    // 換底圖只替換 raster source 的 tiles，避免 setStyle 重建 custom layer
    const b = BASEMAPS[e.target.value];
    const src = map.getSource('base');
    src.setTiles([b.url.replace('{s}', 'a')]);
    LY.setBasemap(e.target.value);
    map.triggerRepaint();
  });

  $('ve').addEventListener('input', (e) => {
    $('ve-val').textContent = '×' + e.target.value;
    LY.setVerticalExaggeration(+e.target.value);
  });
  $('opacity').addEventListener('input', (e) => {
    $('opacity-val').textContent = Math.round(e.target.value * 100) + '%';
    LY.setGlobalOpacity(+e.target.value);
  });
  $('base-opacity').addEventListener('input', (e) => {
    $('base-opacity-val').textContent = Math.round(e.target.value * 100) + '%';
    map.setPaintProperty('base', 'raster-opacity', +e.target.value);
  });

  document.querySelectorAll('input[data-layer]').forEach((el) => {
    el.addEventListener('change', () => LY.setLayerVisible(el.dataset.layer, el.checked));
  });
  document.querySelectorAll('input[data-mlayer]').forEach((el) => {
    el.addEventListener('change', () => {
      el.dataset.mlayer.split(',').forEach((id) => {
        map.setLayoutProperty(id, 'visibility', el.checked ? 'visible' : 'none');
      });
    });
  });

  $('section-mode').addEventListener('change', (e) => {
    $('section-offset').disabled = e.target.value === 'off';
    LY.setSection(e.target.value, +$('section-offset').value);
  });
  $('section-offset').addEventListener('input', (e) => {
    $('section-offset-val').textContent = e.target.value + ' m';
    LY.setSection($('section-mode').value, +e.target.value);
  });

  $('pitch').addEventListener('input', (e) => map.setPitch(+e.target.value));
  $('bearing').addEventListener('input', (e) => map.setBearing(+e.target.value));

  document.querySelectorAll('button[data-view]').forEach((b) => {
    b.addEventListener('click', () => applyView(b.dataset.view));
  });

  $('spin').addEventListener('change', (e) => setSpin(e.target.checked));

  $('panel-toggle').addEventListener('click', () => {
    document.body.classList.toggle('panel-collapsed');
    setTimeout(() => map.resize(), 260);
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
}

const VIEWS = {
  bird: { pitch: 58, bearing: -28, zoom: 12.6 },
  top: { pitch: 0, bearing: 0, zoom: 12.9 },
  low: { pitch: 82, bearing: 35, zoom: 13.2 },
  well: { pitch: 70, bearing: -10, zoom: 14.6, center: [WELLS[0].lon, WELLS[0].lat] }
};

function applyView(k) {
  const v = VIEWS[k];
  map.easeTo({
    pitch: v.pitch, bearing: v.bearing, zoom: v.zoom,
    center: v.center || [SITE.lon, SITE.lat], duration: 1400
  });
}

let spinId = 0;
function setSpin(on) {
  if (spinId) { clearInterval(spinId); spinId = 0; }
  if (on) spinId = setInterval(() => map.setBearing(map.getBearing() + 0.25), 40);
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
    el.addEventListener('change', () => LY.setStratumVisible(+el.dataset.strat, el.checked));
  });
}

function roleLabel(r) {
  return { overburden: '上覆層', seal: '蓋層', reservoir: '儲層', basement: '基盤' }[r] || r;
}

/* ---------------- 屬性著色 ---------------- */

function buildColorModes() {
  const sel = $('color-mode');
  sel.innerHTML = C.petro.COLOR_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
  sel.value = LY.state.colorMode;
  sel.addEventListener('change', () => {
    LY.setColorMode(sel.value);
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
  const row = LY.setYear(y);
  $('year-label').textContent = row.year;
  $('year-phase').textContent = row.phase;
  $('year-phase').className = 'phase ' + (row.phase === '注入期' ? 'inj' : 'post');
  $('kpi-cum').textContent = row.cumulative.toFixed(2);
  $('kpi-radius').textContent = row.radius;
}

function onView() {
  const b = (map.getBearing() + 360) % 360;
  $('st-bearing').textContent = b.toFixed(0) + '°';
  $('st-pitch').textContent = map.getPitch().toFixed(0) + '°';
  $('st-zoom').textContent = map.getZoom().toFixed(2);
  const c = map.getCenter();
  $('st-center').textContent = C.formatLatLng(c.lat, c.lng);
  $('compass-needle').style.transform = `rotate(${-b}deg)`;
  const p = $('pitch'); if (document.activeElement !== p) p.value = map.getPitch();
  const br = $('bearing'); if (document.activeElement !== br) br.value = ((b + 180) % 360) - 180;
}

/* ---------------- 資訊 ---------------- */

function showInfo(hit) {
  const box = $('info-body');
  if (!hit) {
    $('info-title').textContent = '方案 C 說明';
    box.innerHTML = `
      <p class="hint">點選地質模型或標記以查看屬性。可直接用滑鼠右鍵拖曳（或 Ctrl＋拖曳）旋轉與傾斜。</p>
      <dl class="kv">
        <dt>底圖引擎</dt><dd>MapLibre GL JS 4（原生 pitch／bearing）</dd>
        <dt>3D 引擎</dt><dd>Three.js，經 <code>CustomLayerInterface</code> 注入</dd>
        <dt>共用資源</dt><dd>同一個 WebGL context、同一組投影矩陣</dd>
        <dt>座標</dt><dd>MercatorCoordinate ＋ meterInMercatorCoordinateUnits</dd>
      </dl>
      <p class="note">這是業界 CCS／地質 3D WebGIS 的主流做法：地質模型與地圖向量圖層在同一個
      場景中共存，傾斜、旋轉、縮放時模型永遠貼齊地理座標。</p>
      <p class="note tight">左側「屬性著色」可切換孔隙度、滲透率、Vsh、CO₂ 飽和度等屬性場；
      「地質分析」提供合成井柱、任意剖面與容積計算。</p>`;
    return;
  }
  if (hit.kind === 'stratum') {
    const s = hit.data;
    const i = hit.index;
    const top = HORIZONS[i];
    const bot = HORIZONS[i + 1];
    const lp = hit.point ? LY.state.model.worldToLocal(hit.point.clone()) : null;
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
    $('info-title').textContent = hit.data.name;
    box.innerHTML = `<dl class="kv"><dt>站號</dt><dd>${esc(hit.data.id)}</dd>
      <dt>座標</dt><dd>${C.formatLatLng(hit.data.lat, hit.data.lon)}</dd></dl>`;
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
    const row = INJECTION.find((r) => r.year === LY.state.year);
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
  showInfo(null);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.CCS_DEBUG = { get map() { return map; }, get layer() { return C.ccsLayer.state; } };
})();
