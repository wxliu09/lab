window.CCS = window.CCS || {};
(function () {
'use strict';

const THREE = window.THREE;
const C = window.CCS;
const { SITE, VIEW, WELLS, MONITORS, STRATA, HORIZONS, INJECTION, VECTORS, RESERVOIR } = C;

/**
 * 統一 3D 圖台。
 *
 * 設計取向（方案 B）：不把 3D 疊到 2D 圖台上，而是把整個 2D 圖台搬進 3D。
 * 地表貼的就是 GIS 底圖瓦片，井位／監測站以 CSS2DRenderer 的 HTML 元素呈現，
 * 行為等同 Leaflet marker（可點擊、有 popup、隨鏡頭遮擋淡出），
 * 向量圖層則直接以 3D 線段貼在地表。Leaflet 只保留為右下角迷你導覽圖。
 */

const state = {
  renderer: null,
  labelRenderer: null,
  scene: null,
  camera: null,
  controls: null,
  model: null,          // 受垂直放大影響的群組
  overlay: null,        // 不受垂直放大影響（標籤）
  strata: null,
  terrain: null,
  terrainCtl: null,
  plume: null,
  wells: null,
  faults: null,
  vectors: null,
  outlines: null,
  depthAxis: null,
  strataLabels: null,
  clipPlanes: [],
  markers: [],
  ve: VIEW.verticalExaggeration,
  exploded: 0,
  year: INJECTION[INJECTION.length - 1].year,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  colorMode: 'lithology',
  sectionLine: null,
  onSelect: null,
  onCamera: null
};

const CLIP_OFF = 1e7;

function init(container, labelContainer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VIEW.background);
  scene.fog = new THREE.Fog(VIEW.background, 12000, 34000);
  state.scene = scene;

  const camera = new THREE.PerspectiveCamera(
    48, container.clientWidth / container.clientHeight, 5, 90000);
  camera.position.set(4200, 3400, 6200);
  state.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  state.renderer = renderer;

  const labelRenderer = new THREE.CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.className = 'label-layer';
  labelContainer.appendChild(labelRenderer.domElement);
  state.labelRenderer = labelRenderer;

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 600;
  controls.maxDistance = 30000;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, -1100 * state.ve, 0);
  controls.update();
  state.controls = controls;

  // 光照
  scene.add(new THREE.HemisphereLight(0xbcd6f0, 0x2a2318, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.35);
  sun.position.set(-5200, 8600, 4200);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fc8ff, 0.42);
  fill.position.set(4800, 2600, -5200);
  scene.add(fill);

  // 剖切平面（+X / -X / +Z / -Z 四向），未啟用時 constant 設極大值
  state.clipPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), CLIP_OFF)
  ];

  const model = new THREE.Group();
  model.name = 'model';
  model.scale.y = state.ve;
  scene.add(model);
  state.model = model;

  const overlay = new THREE.Group();
  overlay.name = 'overlay';
  scene.add(overlay);
  state.overlay = overlay;

  // 地表
  state.terrainCtl = C.buildTerrain('imagery', (a, b, mode) => {
    if (state.onTerrainStatus) state.onTerrainStatus(a, b, mode);
  });
  state.terrain = state.terrainCtl.mesh;
  state.terrain.material.clippingPlanes = state.clipPlanes;
  // 抬高 3 m：地表與最上層地層的頂面都在高程 0，不錯開會 z-fighting
  state.terrain.position.y = 3;
  state.terrain.renderOrder = 1;
  model.add(state.terrain);

  // 地質體
  state.strata = C.buildStrata(state.clipPlanes);
  model.add(state.strata);

  state.faults = C.buildFaults(state.clipPlanes);
  model.add(state.faults);

  state.plume = C.buildPlume(state.clipPlanes);
  model.add(state.plume);

  state.wells = C.buildWells(state.clipPlanes);
  model.add(state.wells);

  state.vectors = C.buildVectors(14);
  model.add(state.vectors);

  state.outlines = C.buildOutlineProjections(8);
  state.outlines.visible = false;
  model.add(state.outlines);

  // 標籤群組（不受 scale.y 影響）
  state.depthAxis = C.buildDepthAxis();
  overlay.add(state.depthAxis);
  state.strataLabels = C.buildStrataLabels();
  overlay.add(state.strataLabels);

  buildMarkers();
  applyVerticalExaggeration(state.ve);
  setYear(state.year);

  // 互動
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onHover);
  window.addEventListener('resize', () => resize(container));

  controls.addEventListener('change', () => {
    if (state.onCamera) state.onCamera(cameraInfo());
  });

  animate();
  return state;
}

function resize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(w, h);
  state.labelRenderer.setSize(w, h);
}

/* ------------------------------------------------------------------ *
 * CSS2D 標籤（等同 Leaflet marker）
 * ------------------------------------------------------------------ */

function makeMarkerElement(cls, title, subtitle, badge) {
  const el = document.createElement('div');
  el.className = 'map-marker ' + cls;
  el.innerHTML =
    `<span class="mk-dot"></span>` +
    `<span class="mk-body"><span class="mk-title">${title}</span>` +
    (subtitle ? `<span class="mk-sub">${subtitle}</span>` : '') + `</span>` +
    (badge ? `<span class="mk-badge">${badge}</span>` : '');
  return el;
}

function buildMarkers() {
  state.markers.length = 0;

  WELLS.forEach((w) => {
    const p = C.lonLatToWorld(w.lon, w.lat);
    const el = makeMarkerElement(
      w.type === 'injector' ? 'is-injector' : 'is-observer',
      w.id, w.type === 'injector' ? '注入井' : '觀測井',
      Math.abs(w.depth) + ' m');
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (state.onSelect) state.onSelect({ kind: 'well', data: w });
    });
    const obj = new THREE.CSS2DObject(el);
    obj.position.set(p.x, 60, p.z);
    obj.userData = { baseY: 60, kind: 'well', data: w };
    state.overlay.add(obj);
    state.markers.push(obj);
  });

  MONITORS.forEach((m) => {
    const p = C.lonLatToWorld(m.lon, m.lat);
    const el = makeMarkerElement('is-monitor is-small', m.id, m.name, '');
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (state.onSelect) state.onSelect({ kind: 'monitor', data: m });
    });
    const obj = new THREE.CSS2DObject(el);
    obj.position.set(p.x, 30, p.z);
    obj.userData = { baseY: 30, kind: 'monitor', data: m };
    state.overlay.add(obj);
    state.markers.push(obj);
  });

  // 場址中心標籤
  const el = makeMarkerElement('is-site', SITE.id, SITE.name.split('（')[0], '');
  const obj = new THREE.CSS2DObject(el);
  obj.position.set(0, 320, 0);
  obj.userData = { baseY: 320, kind: 'site', data: SITE };
  state.overlay.add(obj);
  state.markers.push(obj);
}

/* ------------------------------------------------------------------ *
 * 視覺控制
 * ------------------------------------------------------------------ */

/** 垂直放大：只改 model.scale.y，標籤靠 baseY 手動重定位 */
function applyVerticalExaggeration(ve) {
  state.ve = ve;
  state.model.scale.y = ve;
  const relocate = (g) => {
    g.children.forEach((o) => {
      if (o.userData && typeof o.userData.baseY === 'number') o.position.y = o.userData.baseY * ve;
      if (o.children && o.children.length) relocate(o);
    });
  };
  relocate(state.overlay);
  state.markers.forEach((m) => { m.position.y = m.userData.baseY * ve; });
  if (state.sectionLine) {
    state.sectionLine.children.forEach((o) => { if (o.isMesh) o.scale.y = 1 / ve; });
  }
  applyExploded(state.exploded);
}

/** 地層分離（exploded view）：各層依序上移，露出層間關係 */
function applyExploded(amount) {
  state.exploded = amount;
  const n = STRATA.length;
  state.strata.children.forEach((mesh, i) => {
    mesh.position.y = (n - 1 - i) * amount;
  });
  // 羽流跟著儲層一起移動
  state.plume.position.y = (n - 1 - RESERVOIR.strataIndex) * amount;
  state.strataLabels.children.forEach((lab, i) => {
    lab.position.y = lab.userData.baseY * state.ve + (n - 1 - i) * amount * state.ve;
  });
}

function setYear(year) {
  state.year = year;
  const row = INJECTION.find((r) => r.year === year) || INJECTION[0];
  C.updatePlume(state.plume, row.radius, row.thickness);
  state.plume.visible = row.radius > 0;
  refreshSaturationColors();
  return row;
}

/** 羽流改變後，重算儲層的飽和度屬性；只有與飽和度相關的著色模式需要重繪 */
function refreshSaturationColors() {
  const mesh = state.strata && state.strata.children[RESERVOIR.strataIndex];
  if (!mesh) return;
  C.refreshSaturation(mesh);
  if (state.colorMode === 'sg' || state.colorMode === 'vp' || state.colorMode === 'ai') {
    C.applyColorMode(mesh, state.colorMode);
  }
}

/** 屬性著色模式：lithology / phi / perm / ntg / vsh / sg / vp / ai */
function setColorMode(mode) {
  state.colorMode = mode;
  state.strata.children.forEach((mesh) => C.applyColorMode(mesh, mode));
}

/** 剖切：mode = 'off' | 'ns' | 'ew' | 'quad' */
function setSection(mode, offset) {
  const p = state.clipPlanes;
  const o = offset || 0;
  const h = SITE.halfExtent * 1.4;
  if (mode === 'off') {
    p.forEach((pl) => { pl.constant = CLIP_OFF; });
  } else if (mode === 'ew') {
    p[0].constant = CLIP_OFF; p[1].constant = CLIP_OFF;
    p[2].constant = o;       p[3].constant = CLIP_OFF;
  } else if (mode === 'ns') {
    p[0].constant = o;       p[1].constant = CLIP_OFF;
    p[2].constant = CLIP_OFF; p[3].constant = CLIP_OFF;
  } else if (mode === 'quad') {
    p[0].constant = o; p[1].constant = CLIP_OFF;
    p[2].constant = o; p[3].constant = CLIP_OFF;
  }
  p.forEach((pl) => { if (pl.constant !== CLIP_OFF) pl.constant = Math.min(pl.constant, h); });
}

function setLayerVisible(key, on) {
  const map = {
    terrain: () => state.terrain,
    strata: () => state.strata,
    plume: () => state.plume,
    wells: () => state.wells,
    faults: () => state.faults,
    vectors: () => state.vectors,
    outlines: () => state.outlines,
    axis: () => state.depthAxis,
    strataLabels: () => state.strataLabels
  };
  if (key === 'markers') {
    state.markers.forEach((m) => { m.visible = on; });
    return;
  }
  const get = map[key];
  if (get) get().visible = on;
}

function setStratumVisible(index, on) {
  const m = state.strata.children[index];
  if (m) m.visible = on;
}

function setStratumOpacity(index, opacity) {
  const m = state.strata.children[index];
  if (m) { m.material.opacity = opacity; m.material.transparent = opacity < 1; }
}

function setBasemap(key) {
  state.terrainCtl.setBasemap(key);
}

/* ------------------------------------------------------------------ *
 * 相機
 * ------------------------------------------------------------------ */

function cameraInfo() {
  const cam = state.camera;
  const t = state.controls.target;
  const dx = cam.position.x - t.x;
  const dz = cam.position.z - t.z;
  const dist = Math.hypot(dx, dz);
  // 方位角：相機看向目標的方向（0=北，順時針）
  const bearing = (Math.atan2(-dx, dz) * 180) / Math.PI;
  const dy = cam.position.y - t.y;
  const pitch = (Math.atan2(dy, dist) * 180) / Math.PI;
  const ll = C.worldToLonLat(t.x, t.z);
  return {
    bearing: (bearing + 360) % 360,
    pitch,
    distance: cam.position.distanceTo(t),
    target: ll,
    camera: C.worldToLonLat(cam.position.x, cam.position.z)
  };
}

function flyTo(opts) {
  const { bearing = 45, pitch = 32, distance = 8200, target } = opts || {};
  const t = target || state.controls.target.clone();
  const b = (bearing * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const horiz = Math.cos(p) * distance;
  state.controls.target.copy(t);
  state.camera.position.set(
    t.x - Math.sin(b) * horiz,
    t.y + Math.sin(p) * distance,
    t.z + Math.cos(b) * horiz
  );
  state.camera.lookAt(t);
  state.controls.update();
  if (state.onCamera) state.onCamera(cameraInfo());
}

function focusOnWell(wellId) {
  const w = WELLS.find((x) => x.id === wellId);
  if (!w) return;
  const p = C.lonLatToWorld(w.lon, w.lat);
  flyTo({
    target: new THREE.Vector3(p.x, (w.depth / 2) * state.ve, p.z),
    bearing: 35, pitch: 22, distance: 3200
  });
}

let autoRotate = false;
function setAutoRotate(on) {
  autoRotate = on;
  state.controls.autoRotate = on;
  state.controls.autoRotateSpeed = 0.55;
}

/* ------------------------------------------------------------------ *
 * 拾取
 * ------------------------------------------------------------------ */

function pick(event) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const targets = [];
  state.model.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = state.raycaster.intersectObjects(targets, false);
  for (const h of hits) {
    const u = h.object.userData;
    if (u && u.kind) return { ...u, point: h.point };
  }
  return null;
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  const hit = pick(e);
  if (state.onSelect) state.onSelect(hit);
}

let hoverTimer = 0;
function onHover(e) {
  const now = performance.now();
  if (now - hoverTimer < 60) return;
  hoverTimer = now;
  const hit = pick(e);
  state.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  if (state.onHover) state.onHover(hit, e);
}

/**
 * 取得滑鼠對應的平面座標（供剖面線工具使用）。
 * 先與模型求交，若未命中則落在 y = 0 的水平面上。
 */
function pickGround(event) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const targets = [];
  state.model.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = state.raycaster.intersectObjects(targets, false);
  if (hits.length) {
    const p = state.model.worldToLocal(hits[0].point.clone());
    return { x: p.x, z: p.z };
  }
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const out = new THREE.Vector3();
  if (state.raycaster.ray.intersectPlane(plane, out)) {
    const p = state.model.worldToLocal(out);
    return { x: p.x, z: p.z };
  }
  return null;
}

/** 在地表畫出剖面線 A–A'；傳入 null 則移除 */
function setSectionLine(a, b) {
  if (state.sectionLine) {
    state.model.remove(state.sectionLine);
    state.sectionLine.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    state.sectionLine = null;
  }
  if (!a) return;
  const g = new THREE.Group();
  g.name = 'section-line';
  const y = 40;
  const mark = (p) => {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x35e0d0 })
    );
    dot.position.set(p.x, y, p.z);
    dot.scale.y = 1 / state.ve;   // 抵銷父層的垂直放大，避免球體被拉長
    g.add(dot);
  };
  mark(a);
  if (b) {
    mark(b);
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z)
      ]),
      new THREE.LineDashedMaterial({ color: 0x35e0d0, dashSize: 90, gapSize: 60 })
    ).computeLineDistances());
  }
  state.model.add(g);
  state.sectionLine = g;
}

/** 由世界座標取得地表以下的地層柱狀（虛擬鑽井） */
function columnAt(x, z) {
  const rows = [];
  STRATA.forEach((s, i) => {
    const d = C.stratumDepthAt(i, x, z);
    if (d && d.thickness > 0.5) rows.push({ stratum: s, ...d });
  });
  return rows;
}

/* ------------------------------------------------------------------ *
 * 主迴圈
 * ------------------------------------------------------------------ */

function animate() {
  requestAnimationFrame(animate);
  state.controls.update();
  state.renderer.render(state.scene, state.camera);
  state.labelRenderer.render(state.scene, state.camera);
  if (autoRotate && state.onCamera) state.onCamera(cameraInfo());
}

Object.assign(C, {
  scene3d: {
    state, init, resize, applyVerticalExaggeration, applyExploded, setYear,
    setSection, setLayerVisible, setStratumVisible, setStratumOpacity, setBasemap,
    setColorMode, refreshSaturationColors, pickGround, setSectionLine,
    cameraInfo, flyTo, focusOnWell, setAutoRotate, columnAt, pick
  }
});
C.viewer = C.scene3d;
})();

