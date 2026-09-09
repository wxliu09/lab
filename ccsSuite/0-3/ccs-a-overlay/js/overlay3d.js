window.CCS = window.CCS || {};
(function () {
'use strict';

const THREE = window.THREE;
const L = window.L;
const C = window.CCS;
const { SITE, VIEW, STRATA, RESERVOIR, INJECTION } = C;

/**
 * 方案 A：單一容器疊合。
 *
 * 把 Three.js 的透明 canvas 放進 Leaflet 自訂 pane，
 * 監聽 move / zoom / viewreset，每次用 Leaflet 的像素尺度重新對齊正交相機。
 * Leaflet 的 marker、popup、圖層控制、量測外掛全部照常可用。
 *
 * 兩種模式：
 *   aligned（對齊）— 正交俯視，與 Leaflet CRS 逐像素對齊。
 *     Leaflet 原生不支援 pitch/bearing，這是唯一能精確對齊的投影。
 *     透過「深度斜移」把地層依深度沿固定螢幕方向錯開（cavalier 斜投影），
 *     在維持頂面完全對齊的前提下讀出立體層序。
 *   free（自由 3D）— 切換為透視相機 + OrbitControls，可 360° 環繞，
 *     此時與 Leaflet 已不對齊，故自動淡出底圖並停用地圖拖曳。
 */

const state = {
  map: null, renderer: null, scene: null,
  orthoCam: null, persCam: null, controls: null,
  model: null, strata: null, terrain: null, terrainCtl: null,
  plume: null, wells: null, faults: null, vectors: null, outlines: null,
  clipPlanes: [],
  mode: 'aligned',
  ve: 3,
  oblique: 0.5,        // 深度斜移量（每公尺深度的水平位移）
  obliqueDir: 135,     // 斜移方向（螢幕方位角，0 = 上／北）
  year: INJECTION[INJECTION.length - 1].year,
  colorMode: 'lithology',
  sectionLine: null,
  needsRender: true,
  onSelect: null
};

const CLIP_OFF = 1e7;

function init(map, opts) {
  state.map = map;

  const pane = map.createPane('three3d');
  pane.style.zIndex = 450;
  pane.style.pointerEvents = 'none';

  const scene = new THREE.Scene();
  state.scene = scene;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'three-canvas';
  canvas.style.position = 'absolute';
  pane.appendChild(canvas);
  state.renderer = renderer;

  state.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80000);
  state.orthoCam.up.set(0, 0, -1);

  state.persCam = new THREE.PerspectiveCamera(48, 1, 5, 90000);
  state.persCam.position.set(4200, 3600, 6400);

  scene.add(new THREE.HemisphereLight(0xd6e6f6, 0x33291c, 1.15));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.25);
  sun.position.set(-5200, 8600, 4200);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fc8ff, 0.4);
  fill.position.set(4800, 2600, -5200);
  scene.add(fill);

  state.clipPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), CLIP_OFF)
  ];

  const model = new THREE.Group();
  model.matrixAutoUpdate = false;
  scene.add(model);
  state.model = model;

  state.terrainCtl = C.buildTerrain('imagery', (a, b, m) => {
    if (opts && opts.onTerrainStatus) opts.onTerrainStatus(a, b, m);
    state.needsRender = true;
  });
  state.terrain = state.terrainCtl.mesh;
  state.terrain.material.clippingPlanes = state.clipPlanes;
  state.terrain.visible = false; // 預設用 Leaflet 底圖，不重複繪製
  model.add(state.terrain);

  state.strata = C.buildStrata(state.clipPlanes);
  model.add(state.strata);
  state.faults = C.buildFaults(state.clipPlanes);
  model.add(state.faults);
  state.plume = C.buildPlume(state.clipPlanes);
  model.add(state.plume);
  state.wells = C.buildWells(state.clipPlanes);
  model.add(state.wells);
  state.vectors = C.buildVectors(10);
  state.vectors.visible = false; // Leaflet 已原生繪製同一組圖徵，避免重複
  model.add(state.vectors);
  state.outlines = C.buildOutlineProjections(4);
  model.add(state.outlines);

  updateModelMatrix();
  setGlobalOpacity(0.55);
  setYear(state.year);

  map.on('move zoom viewreset zoomend resize moveend', align);
  map.on('zoomanim', onZoomAnim);
  align();

  canvas.addEventListener('pointerdown', onCanvasPointerDown);

  animate();
  return state;
}

/* ------------------------------------------------------------------ *
 * 與 Leaflet 對齊
 * ------------------------------------------------------------------ */

/** 每公尺對應的螢幕像素數（以數值法量測，最不易受投影細節影響） */
function pixelsPerMeter() {
  const map = state.map;
  const z = map.getZoom();
  const a = C.worldToLonLat(0, 0);
  const b = C.worldToLonLat(1000, 0);
  const pa = map.project(L.latLng(a.lat, a.lon), z);
  const pb = map.project(L.latLng(b.lat, b.lon), z);
  return Math.hypot(pb.x - pa.x, pb.y - pa.y) / 1000;
}

function align() {
  const map = state.map;
  const size = map.getSize();
  const canvas = state.renderer.domElement;

  state.renderer.setSize(size.x, size.y, false);
  canvas.style.width = size.x + 'px';
  canvas.style.height = size.y + 'px';
  canvas.style.transform = '';
  L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));

  const ppm = pixelsPerMeter();
  state.ppm = ppm;
  const halfW = size.x / 2 / ppm;
  const halfH = size.y / 2 / ppm;
  const c = map.getCenter();
  const w = C.lonLatToWorld(c.lng, c.lat);

  const cam = state.orthoCam;
  cam.left = -halfW; cam.right = halfW;
  cam.top = halfH; cam.bottom = -halfH;
  cam.position.set(w.x, 30000, w.z);
  cam.lookAt(w.x, 0, w.z);
  cam.updateProjectionMatrix();

  state.persCam.aspect = size.x / size.y;
  state.persCam.updateProjectionMatrix();

  state.needsRender = true;
}

/** 縮放動畫期間比照 Leaflet 圖磚做 CSS 縮放，動畫結束再精確重繪 */
function onZoomAnim(e) {
  const map = state.map;
  const canvas = state.renderer.domElement;
  const scale = map.getZoomScale(e.zoom, map.getZoom());
  const offset = map._latLngToNewLayerPoint(
    map.containerPointToLatLng([0, 0]), e.zoom, e.center);
  L.DomUtil.setTransform(canvas, offset, scale);
}

/* ------------------------------------------------------------------ *
 * 模型變換：垂直放大 + 深度斜移（cavalier 斜投影）
 * ------------------------------------------------------------------ */

function updateModelMatrix() {
  const ve = state.ve;
  const k = state.oblique;
  const a = (state.obliqueDir * Math.PI) / 180;
  // 螢幕上：+X 為東、-Z 為北（畫面上方）。深度 y 為負值，
  // 故位移量取 -y，使「斜移方向」與畫面方位角一致。
  const kx = -Math.sin(a) * k;
  const kz = Math.cos(a) * k;

  const scale = new THREE.Matrix4().makeScale(1, ve, 1);
  const shear = new THREE.Matrix4().set(
    1, kx, 0, 0,
    0, 1, 0, 0,
    0, kz, 1, 0,
    0, 0, 0, 1
  );
  state.model.matrix.multiplyMatrices(shear, scale);
  state.model.matrixWorldNeedsUpdate = true;
  state.needsRender = true;
}

function setVerticalExaggeration(v) { state.ve = v; updateModelMatrix(); rescaleSectionLine(); }
function setOblique(k) { state.oblique = k; updateModelMatrix(); }
function setObliqueDir(deg) { state.obliqueDir = deg; updateModelMatrix(); }

/* ------------------------------------------------------------------ *
 * 模式切換
 * ------------------------------------------------------------------ */

function setMode(mode) {
  state.mode = mode;
  const map = state.map;
  const pane = map.getPane('three3d');
  const container = map.getContainer();

  if (mode === 'free') {
    pane.style.pointerEvents = 'auto';
    container.classList.add('free-mode');
    map.dragging.disable();
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    if (!state.controls) {
      state.controls = new THREE.OrbitControls(state.persCam, state.renderer.domElement);
      state.controls.enableDamping = true;
      state.controls.dampingFactor = 0.08;
      state.controls.minDistance = 600;
      state.controls.maxDistance = 32000;
      state.controls.maxPolarAngle = Math.PI * 0.495;
      state.controls.addEventListener('change', () => { state.needsRender = true; });
    }
    state.controls.target.set(0, -1100 * state.ve, 0);
    flyTo({ bearing: 320, pitch: 30, distance: 13000 });
    state.terrain.visible = true;
    state.controls.enabled = true;
  } else {
    pane.style.pointerEvents = 'none';
    container.classList.remove('free-mode');
    map.dragging.enable();
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
    if (state.controls) state.controls.enabled = false;
    state.terrain.visible = false;
    align();
  }
  state.needsRender = true;
}

function flyTo(o) {
  const { bearing = 45, pitch = 32, distance = 10000 } = o || {};
  const t = state.controls.target;
  const b = (bearing * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const horiz = Math.cos(p) * distance;
  state.persCam.position.set(
    t.x - Math.sin(b) * horiz, t.y + Math.sin(p) * distance, t.z + Math.cos(b) * horiz);
  state.persCam.lookAt(t);
  state.controls.update();
  state.needsRender = true;
}

/* ------------------------------------------------------------------ *
 * 圖層／屬性
 * ------------------------------------------------------------------ */

function setLayerVisible(key, on) {
  const m = {
    terrain: state.terrain, strata: state.strata, plume: state.plume,
    wells: state.wells, faults: state.faults, vectors: state.vectors,
    outlines: state.outlines
  };
  if (m[key]) m[key].visible = on;
  state.needsRender = true;
}

function setStratumVisible(i, on) {
  const mesh = state.strata.children[i];
  if (mesh) mesh.visible = on;
  state.needsRender = true;
}

function setStratumOpacity(i, o) {
  const mesh = state.strata.children[i];
  if (mesh) { mesh.material.opacity = o; mesh.material.transparent = o < 1; }
  state.needsRender = true;
}

function setGlobalOpacity(o) {
  state.strata.children.forEach((m) => {
    m.material.opacity = o;
    m.material.transparent = o < 1;
    m.material.depthWrite = o >= 0.98;
  });
  state.needsRender = true;
}

function setSection(mode, offset) {
  const p = state.clipPlanes;
  const o = offset || 0;
  if (mode === 'off') p.forEach((pl) => { pl.constant = CLIP_OFF; });
  else if (mode === 'ew') { p[0].constant = CLIP_OFF; p[1].constant = CLIP_OFF; p[2].constant = o; p[3].constant = CLIP_OFF; }
  else if (mode === 'ns') { p[0].constant = o; p[1].constant = CLIP_OFF; p[2].constant = CLIP_OFF; p[3].constant = CLIP_OFF; }
  else if (mode === 'quad') { p[0].constant = o; p[1].constant = CLIP_OFF; p[2].constant = o; p[3].constant = CLIP_OFF; }
  state.needsRender = true;
}

function setYear(y) {
  state.year = y;
  const row = INJECTION.find((r) => r.year === y) || INJECTION[0];
  C.updatePlume(state.plume, row.radius, row.thickness);
  state.plume.visible = row.radius > 0;
  refreshSaturationColors();
  state.needsRender = true;
  return row;
}

/** 羽流改變後重算儲層飽和度屬性；只有與飽和度相關的著色模式需要重繪 */
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
  state.needsRender = true;
}

function setBasemap(k) { state.terrainCtl.setBasemap(k); }

/* ------------------------------------------------------------------ *
 * 拾取
 * ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function pickAt(clientX, clientY) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, state.mode === 'free' ? state.persCam : state.orthoCam);
  const targets = [];
  state.model.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = raycaster.intersectObjects(targets, false);
  for (const h of hits) {
    if (h.object.userData && h.object.userData.kind) {
      return { ...h.object.userData, point: h.point };
    }
  }
  return null;
}

function onCanvasPointerDown(e) {
  if (state.mode !== 'free') return;
  const hit = pickAt(e.clientX, e.clientY);
  if (state.onSelect) state.onSelect(hit);
}

/** 對齊模式下由 Leaflet 的 click 事件轉呼叫 */
function pickFromMapEvent(e) {
  return pickAt(e.originalEvent.clientX, e.originalEvent.clientY);
}

/* ------------------------------------------------------------------ *
 * 繪製
 * ------------------------------------------------------------------ */

function animate() {
  requestAnimationFrame(animate);
  if (state.mode === 'free' && state.controls) {
    state.controls.update();
    state.needsRender = true;
  }
  if (!state.needsRender) return;
  state.needsRender = false;
  state.renderer.render(state.scene, state.mode === 'free' ? state.persCam : state.orthoCam);
}

/** 由畫面座標取得地表位置（模型局部座標，公尺）；工具點選用 */
function pickGround(event) {
  const rect = state.renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, state.mode === 'free' ? state.persCam : state.orthoCam);
  const targets = [];
  state.model.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length) {
    const p = state.model.worldToLocal(hits[0].point.clone());
    return { x: p.x, z: p.z };
  }
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const out = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, out)) {
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
  if (!a) { state.needsRender = true; return; }
  const g = new THREE.Group();
  g.name = 'section-line';
  const y = 40;
  const mark = (p) => {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(60, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x35e0d0, depthTest: false })
    );
    dot.renderOrder = 20;
    dot.position.set(p.x, y, p.z);
    dot.scale.y = 1 / state.ve;   // 抵銷父層的垂直放大，避免球體被拉長
    g.add(dot);
  };
  mark(a);
  if (b) {
    mark(b);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z)
      ]),
      new THREE.LineDashedMaterial({ color: 0x35e0d0, dashSize: 90, gapSize: 60, depthTest: false })
    );
    line.computeLineDistances();
    line.renderOrder = 20;
    g.add(line);
  }
  state.model.add(g);
  state.sectionLine = g;
  state.needsRender = true;
}

function rescaleSectionLine() {
  if (!state.sectionLine) return;
  state.sectionLine.children.forEach((o) => { if (o.isMesh) o.scale.y = 1 / state.ve; });
}

Object.assign(C, {
  overlay3d: {
    state, init, align, setMode, setVerticalExaggeration, setOblique, setObliqueDir,
    setLayerVisible, setStratumVisible, setStratumOpacity, setGlobalOpacity,
    setSection, setYear, setBasemap, pickAt, pickFromMapEvent, flyTo, pixelsPerMeter,
    setColorMode, refreshSaturationColors, pickGround, setSectionLine
  }
});
C.viewer = C.overlay3d;
})();
