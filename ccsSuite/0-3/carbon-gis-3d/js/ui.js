window.CCS3D = window.CCS3D || {};
(function () {
'use strict';
const C = window.CCS3D;
const { STRATA, WELLS, MONITORS, INJECTION, SITE } = window.CCS3D;
const { horizonElev } = window.CCS3D;
const { lonLatToWorld, formatLatLng } = window.CCS3D;

/**
 * UI 建構與事件綁定：圖層樹、剖切、時間軸、資訊卡、2D/3D 版面與視域同步。
 */


const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function initUI(scene, map) {
  buildStrataList(scene);
  buildFeatureList(scene, map);
  buildWellButtons(scene, map);
  buildLegend();
  buildColorModes(scene);

  bindLayout(scene, map);
  bindBasemap(scene, map);
  bindSliders(scene);
  bindClip(scene);
  bindTimeline(scene, map);
  bindToolbar(scene);
  bindSync(scene, map);
  C.analysis.init();

  $('hint-close').addEventListener('click', () => $('hint').remove());

  // 初始狀態
  applyYear(scene, map, INJECTION[INJECTION.length - 1].year);
  $('st-depth').textContent = `${Math.abs(Math.round(horizonElev(4, 0, 0)))} m`;
}

/* ---------------- 屬性著色 ---------------- */

function buildColorModes(scene) {
  const sel = $('color-mode');
  sel.innerHTML = C.petro.COLOR_MODES.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
  sel.value = scene.colorMode;
  sel.addEventListener('change', () => {
    scene.setColorMode(sel.value);
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
      `<i style="background:${hex(s.color)}" title="${s.name}"></i>`).join('');
    $('colorbar-ticks').innerHTML = '';
    $('colorbar-title').textContent = '依地層岩性著色，明暗反映局部孔隙度（單層與粒序）。';
    return;
  }
  $('colorbar').innerHTML = '';
  $('colorbar').style.background = 'linear-gradient(90deg,' + C.petro.rampSamples(key, 24).join(',') + ')';
  $('colorbar-ticks').innerHTML = C.petro.rampTicks(key, 5).map((t) => `<span>${t}</span>`).join('');
  $('colorbar-title').textContent = m.label + (m.unit ? '（' + m.unit + '）' : '') +
    (m.log ? '，對數色階' : '');
}

/* ---------------- 圖層清單 ---------------- */

function buildStrataList(scene) {
  const host = $('strata-list');
  STRATA.forEach((s) => {
    const tag =
      s.role === 'seal'
        ? '<span class="tag seal">蓋層</span>'
        : s.role === 'reservoir'
        ? '<span class="tag res">儲層</span>'
        : '';
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <label>
        <input type="checkbox" checked data-stratum="${s.id}">
        <i class="swatch" style="background:${hex(s.color)}"></i>
        <span class="name" title="${s.name} ${s.en}">${s.name}</span>
      </label>${tag}`;
    host.appendChild(row);
    row.querySelector('input').addEventListener('change', (e) => {
      scene.setLayerVisible(s.id, e.target.checked);
    });
  });
}

const FEATURES = [
  { key: 'surface', label: '地表底圖（3D）', on: true, map: null },
  { key: 'surfaceClip', label: '地表裁切至模型範圍', on: true, map: null },
  { key: 'grid', label: '地表格線與範圍框', on: true, map: 'boundary' },
  { key: 'wells', label: '井（注入／觀測）', on: true, map: 'wells' },
  { key: 'plume', label: 'CO₂ 羽流', on: true, map: 'plume' },
  { key: 'faults', label: '斷層面', on: true, map: 'faults' },
  { key: 'monitors', label: '地表監測站', on: true, map: 'monitors' },
  { key: 'labels', label: '3D 文字標籤', on: true, map: null },
  { key: 'axis', label: '深度標尺', on: true, map: null }
];

function buildFeatureList(scene, map) {
  const host = $('feature-list');
  FEATURES.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label><input type="checkbox" ${f.on ? 'checked' : ''}><span class="name">${f.label}</span></label>`;
    host.appendChild(row);
    row.querySelector('input').addEventListener('change', (e) => {
      scene.setLayerVisible(f.key, e.target.checked);
      if (f.map) map.setLayerVisible(f.map, e.target.checked);
    });
  });
}

function buildWellButtons(scene, map) {
  const host = $('well-buttons');
  WELLS.forEach((w) => {
    const b = document.createElement('button');
    b.className = 'tool';
    b.textContent = w.id;
    b.title = w.name;
    b.addEventListener('click', () => {
      scene.flyToWell(w.id);
      map.syncView(w.lat, w.lon);
      map.setCameraTarget(w.lat, w.lon);
    });
    host.appendChild(b);
  });
  const all = document.createElement('button');
  all.className = 'tool';
  all.textContent = '全場址';
  all.addEventListener('click', () => {
    scene.resetView();
    map.syncView(SITE.lat, SITE.lon, SITE.defaultZoom);
    map.setCameraTarget(SITE.lat, SITE.lon);
  });
  host.appendChild(all);
}

function buildLegend() {
  const host = $('legend');
  const items = [
    ...STRATA.map((s) => ({ c: hex(s.color), t: `${s.name}（${s.en}）` })),
    { c: '#35e0d0', t: 'CO₂ 羽流（超臨界態）' },
    { c: '#ff4d6d', t: '斷層面' },
    { c: '#ff7a1a', t: '注入井 / 射孔段' },
    { c: '#2ec4ff', t: '觀測井' },
    { c: '#9be564', t: '地表監測站' }
  ];
  items.forEach((i) => {
    const d = document.createElement('div');
    d.className = 'legend-item';
    d.innerHTML = `<i class="swatch" style="background:${i.c}"></i><span>${i.t}</span>`;
    host.appendChild(d);
  });
}

/* ---------------- 版面與底圖 ---------------- */

function bindLayout(scene, map) {
  const stage = $('stage');
  const modes = ['3d', 'split', '2d'];

  const setMode = (m) => {
    stage.className = `stage mode-${m}`;
    document.querySelectorAll('#mode-seg button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    map.invalidate();
    setTimeout(() => scene.resize(), 320);
  };

  document.querySelectorAll('#mode-seg button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  $('btn-expand').addEventListener('click', (e) => {
    e.stopPropagation();
    const cur = modes.find((m) => stage.classList.contains(`mode-${m}`)) || '3d';
    setMode(modes[(modes.indexOf(cur) + 1) % modes.length]);
  });
}

function bindBasemap(scene, map) {
  document.querySelectorAll('#basemap-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#basemap-seg button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      scene.setBasemap(b.dataset.basemap);
      map.setBasemap(b.dataset.basemap);
    });
  });
}

/* ---------------- 滑桿 ---------------- */

function bindSliders(scene) {
  const so = $('surface-opacity');
  so.addEventListener('input', () => {
    const v = so.value / 100;
    scene.setSurfaceOpacity(v);
    $('surface-opacity-val').textContent = `${so.value}%`;
  });

  const ex = $('exaggeration');
  ex.addEventListener('input', () => {
    scene.setExaggeration(parseFloat(ex.value));
    $('exaggeration-val').textContent = `${parseFloat(ex.value).toFixed(1)}×`;
  });

  const op = $('strata-opacity');
  op.addEventListener('input', () => {
    scene.setStrataOpacity(op.value / 100);
    $('strata-opacity-val').textContent = `${op.value}%`;
  });
}

function bindClip(scene) {
  [['x', 'clip-x'], ['z', 'clip-z']].forEach(([axis, id]) => {
    const on = $(`${id}-on`);
    const sl = $(id);
    const val = $(`${id}-val`);
    const apply = () => {
      const t = sl.value / 100;
      sl.disabled = !on.checked;
      scene.setClip(axis, on.checked, t);
      val.textContent = on.checked ? `${Math.round(t * SITE.halfExtent)} m` : '關閉';
    };
    on.addEventListener('change', apply);
    sl.addEventListener('input', apply);
  });
}

/* ---------------- 時間軸 ---------------- */

function applyYear(scene, map, year) {
  const row = scene.setYear(year);
  map.setPlumeRadius(row.radius);
  $('tl-year').textContent = row.year;
  $('tl-phase').textContent = row.phase;
  $('st-cum').textContent = `${row.cumulative.toFixed(2)} Mt`;
  $('st-radius').textContent = `${row.radius} m`;
  $('st-thick').textContent = `${row.thickness} m`;
  $('year').value = row.year;
}

function bindTimeline(scene, map) {
  const slider = $('year');
  slider.min = INJECTION[0].year;
  slider.max = INJECTION[INJECTION.length - 1].year;
  slider.addEventListener('input', () => applyYear(scene, map, parseInt(slider.value, 10)));

  let timer = null;
  const btn = $('btn-play');
  btn.addEventListener('click', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      btn.textContent = '▶ 播放';
      btn.classList.remove('on');
      return;
    }
    btn.textContent = '❚❚ 暫停';
    btn.classList.add('on');
    if (parseInt(slider.value, 10) >= INJECTION[INJECTION.length - 1].year) {
      applyYear(scene, map, INJECTION[0].year);
    }
    timer = setInterval(() => {
      const next = parseInt(slider.value, 10) + 1;
      if (next > INJECTION[INJECTION.length - 1].year) {
        clearInterval(timer);
        timer = null;
        btn.textContent = '▶ 播放';
        btn.classList.remove('on');
        return;
      }
      applyYear(scene, map, next);
    }, 520);
  });
}

/* ---------------- 工具列 ---------------- */

function bindToolbar(scene) {
  $('btn-reset').addEventListener('click', () => scene.resetView());
  $('btn-top').addEventListener('click', () => scene.topView());

  const rot = $('btn-rotate');
  rot.addEventListener('click', () => {
    const on = !rot.classList.contains('on');
    rot.classList.toggle('on', on);
    scene.setAutoRotate(on);
  });

  $('btn-snap').addEventListener('click', () => {
    const url = scene.snapshot();
    const a = document.createElement('a');
    a.href = url;
    a.download = `ccs-3d-${Date.now()}.png`;
    a.click();
  });
}

/* ---------------- 同步與資訊卡 ---------------- */

function bindSync(scene, map) {
  scene.on('pick', (data) => renderInfo(data));

  scene.on('move', ({ lat, lon }) => {
    map.syncView(lat, lon);
    map.setCameraTarget(lat, lon);
    scene.updateSurface({ lat, lon, zoom: map.getView().zoom });
  });

  scene.on('progress', (n) => {
    const el = $('loading');
    el.classList.toggle('on', n > 0);
    el.textContent = `地表瓦片載入中… 剩餘 ${n}`;
  });
}

function renderInfo(data) {
  const host = $('info');
  if (!data) {
    host.innerHTML =
      '<div class="empty">未選取任何物件。<br>於 3D 圖台點選地層、井、羽流、斷層或地表以檢視屬性。</div>';
    return;
  }

  const rows = (data.rows || [])
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');

  let profile = '';
  if (data.profile) {
    profile =
      '<div class="profile">' +
      data.profile
        .map((p) => {
          const s = STRATA[p.index];
          return `<div class="pf"><i style="background:${hex(s.color)}"></i>
            <span>${s.name}</span>
            <span class="d">${Math.abs(p.top)}–${Math.abs(p.bot)} m（${p.thickness} m）</span></div>`;
        })
        .join('') +
      '</div>';
  }

  host.innerHTML = `
    <div class="info-title">${data.title}</div>
    ${rows ? `<table class="info-table">${rows}</table>` : ''}
    ${profile}
    ${data.note ? `<div class="info-note">${data.note}</div>` : ''}
    ${data.logAt ? '<button class="btn full" id="info-log">此處合成井柱</button>' : ''}`;

  if (data.logAt) {
    const { x, z, well } = data.logAt;
    $('info-log').addEventListener('click', () => {
      C.analysis.showLog(x, z, well ? `${well.name}　合成測井` : '合成井柱（點選位置）', well);
    });
  }
}

/** 供 2D 圖台點擊時產生虛擬鑽井剖面 */
function profileFromLonLat(lon, lat) {
  const p = lonLatToWorld(lon, lat);
  const list = [];
  for (let i = 0; i < STRATA.length; i++) {
    const d = C.stratumDepthAt(i, p.x, p.z);
    if (!d || d.thickness <= 0.5) continue;
    list.push({ index: i, top: Math.round(d.top), bot: Math.round(d.bot), thickness: Math.round(d.thickness) });
  }
  const inside = Math.hypot(p.x, p.z) <= C.modelRadius(Math.atan2(p.z, p.x));
  return {
    kind: 'surface',
    title: '2D 圖台點位剖面',
    rows: [
      ['座標', formatLatLng(lat, lon)],
      ['十進位', `${lat.toFixed(5)}, ${lon.toFixed(5)}`],
      ['距注入井', `${Math.round(Math.hypot(p.x, p.z))} m`],
      ['是否在模型範圍', inside ? '是' : '否（外插值僅供參考）']
    ],
    note: '虛擬鑽井剖面：依構造模型內插之各地層界面深度。',
    profile: list,
    logAt: inside ? { x: p.x, z: p.z } : null
  };
}


Object.assign(window.CCS3D, { initUI, profileFromLonLat, renderInfo });
})();
