window.CCS = window.CCS || {};
(function () {
'use strict';

const THREE = window.THREE;
const C = window.CCS;
const { SITE, VIEW, INJECTION, STRATA } = C;

/**
 * 方案 C：MapLibre GL JS ＋ Three.js CustomLayer。
 *
 * MapLibre 原生支援 pitch / bearing，並提供 CustomLayerInterface，
 * 可把 Three.js 場景直接畫進地圖自己的 WebGL context —— 兩者共用同一顆
 * 相機與同一個投影矩陣，因此地質模型永遠貼齊地理座標，
 * 可同時傾斜、旋轉、縮放，且能與地形、向量圖層共存。
 *
 * 座標系轉換
 *   MapLibre 的世界座標為 Mercator 單位（整個世界 = 0~1）。
 *   以場址中心的 MercatorCoordinate 為模型原點，
 *   再用 meterInMercatorCoordinateUnits() 把「公尺」換算成 Mercator 單位，
 *   即可把既有的公尺制模型直接放進地圖。
 */

const state = {
  map: null, renderer: null, scene: null, camera: null,
  model: null, strata: null, plume: null, wells: null,
  faults: null, vectors: null, outlines: null, labels: null, terrain: null,
  clipPlanes: [],
  transform: null,
  mvp: null,
  ve: VIEW.verticalExaggeration,
  colorMode: 'lithology',
  sectionLine: null,
  year: INJECTION[INJECTION.length - 1].year,
  onSelect: null,
  ready: false
};

const CLIP_OFF = 1e7;

/** 建立模型原點的 Mercator 變換參數 */
function makeTransform() {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([SITE.lon, SITE.lat], 0);
  return {
    x: mc.x, y: mc.y, z: mc.z,
    scale: mc.meterInMercatorCoordinateUnits()
  };
}

function buildScene() {
  const scene = new THREE.Scene();

  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.5);
  sun.position.set(-0.6, 0.9, 0.5).normalize();
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fc8ff, 0.55);
  fill.position.set(0.7, 0.4, -0.6).normalize();
  scene.add(fill);

  state.clipPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), CLIP_OFF),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), CLIP_OFF)
  ];

  const model = new THREE.Group();
  model.scale.y = state.ve;
  scene.add(model);
  state.model = model;

  state.strata = C.buildStrata(state.clipPlanes);
  model.add(state.strata);
  state.faults = C.buildFaults(state.clipPlanes);
  model.add(state.faults);
  state.plume = C.buildPlume(state.clipPlanes);
  model.add(state.plume);
  state.wells = C.buildWells(state.clipPlanes);
  model.add(state.wells);
  state.vectors = C.buildVectors(12);
  model.add(state.vectors);
  state.outlines = C.buildOutlineProjections(6);
  state.outlines.visible = false;
  model.add(state.outlines);

  // 頂面貼上與底圖同源的瓦片影像，讓塊體頂部與 MapLibre 底圖視覺連續，
  // 而不是一塊擋住地圖的不透明蓋板。
  state.terrain = C.buildTerrain('imagery', () => {
    if (state.map) state.map.triggerRepaint();
  });
  state.terrain.mesh.material.clippingPlanes = state.clipPlanes;
  state.terrain.mesh.position.y = 3;
  state.terrain.mesh.renderOrder = 1;
  model.add(state.terrain.mesh);

  state.scene = scene;
  // 模型 → Mercator 的變換含 Y 軸鏡射（determinant < 0），面的正反會對調；
  // 統一改為雙面材質，避免井管等實體看起來被翻面。
  model.traverse((o) => {
    if (o.isMesh && o.material) o.material.side = THREE.DoubleSide;
  });
  return scene;
}

/**
 * MapLibre CustomLayerInterface 實作。
 * onAdd 取得地圖的 gl context 後，建立共用該 context 的 Three.js renderer；
 * render 每一幀由 MapLibre 傳入投影矩陣，直接指派給相機。
 */
function makeCustomLayer(id) {
  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    onAdd(map, gl) {
      state.map = map;
      state.transform = makeTransform();
      state.camera = new THREE.Camera();
      buildScene();

      state.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true
      });
      state.renderer.autoClear = false;
      state.renderer.localClippingEnabled = true;
      state.renderer.outputColorSpace = THREE.SRGBColorSpace;
      state.ready = true;
      setYear(state.year);
    },

    render(gl, args) {
      const t = state.transform;
      // MapLibre 4 傳入 args.defaultProjectionData.mainMatrix；舊版直接傳矩陣陣列
      const m = Array.isArray(args) ? args
        : (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args;

      // 模型 → Mercator（MapLibre 官方 CustomLayer 範例的標準變換）：
      // 先繞 X 軸轉 90° 把 Y-up 轉成 Z-up，再依 meterInMercatorCoordinateUnits
      // 縮放（Y 取負，因為 Mercator 的 y 向南），最後平移到場址中心。
      const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const local = new THREE.Matrix4()
        .makeTranslation(t.x, t.y, t.z)
        .scale(new THREE.Vector3(t.scale, -t.scale, t.scale))
        .multiply(rotX);

      state.camera.projectionMatrix = new THREE.Matrix4().fromArray(m).multiply(local);
      // 保留本幀的 世界 → 裁剪 矩陣，供畫面拾取反算射線
      state.mvp = state.camera.projectionMatrix;

      state.renderer.resetState();
      state.renderer.render(state.scene, state.camera);
    }
  };
}

/* ------------------------------------------------------------------ *
 * 控制
 * ------------------------------------------------------------------ */

function setVerticalExaggeration(v) {
  state.ve = v;
  state.model.scale.y = v;
  if (state.sectionLine) {
    state.sectionLine.children.forEach((o) => { if (o.isMesh) o.scale.y = 1 / v; });
  }
  if (state.map) state.map.triggerRepaint();
}

function setYear(y) {
  state.year = y;
  const row = INJECTION.find((r) => r.year === y) || INJECTION[0];
  if (state.plume) {
    C.updatePlume(state.plume, row.radius, row.thickness);
    state.plume.visible = row.radius > 0;
  }
  refreshSaturationColors();
  if (state.map) state.map.triggerRepaint();
  return row;
}

function setLayerVisible(key, on) {
  const m = {
    strata: state.strata, plume: state.plume, wells: state.wells,
    faults: state.faults, vectors: state.vectors, outlines: state.outlines,
    terrain: state.terrain && state.terrain.mesh
  };
  if (m[key]) m[key].visible = on;
  if (state.map) state.map.triggerRepaint();
}

/** 頂面貼圖跟著底圖切換 */
function setBasemap(key) {
  if (state.terrain) state.terrain.setBasemap(key);
  if (state.map) state.map.triggerRepaint();
}

function setStratumVisible(i, on) {
  const mesh = state.strata.children[i];
  if (mesh) mesh.visible = on;
  if (state.map) state.map.triggerRepaint();
}

function setGlobalOpacity(o) {
  state.strata.children.forEach((m) => {
    m.material.opacity = o;
    m.material.transparent = o < 1;
    m.material.depthWrite = o >= 0.98;
  });
  if (state.map) state.map.triggerRepaint();
}

function setSection(mode, offset) {
  const p = state.clipPlanes;
  const o = offset || 0;
  if (mode === 'off') p.forEach((pl) => { pl.constant = CLIP_OFF; });
  else if (mode === 'ew') { p[0].constant = CLIP_OFF; p[1].constant = CLIP_OFF; p[2].constant = o; p[3].constant = CLIP_OFF; }
  else if (mode === 'ns') { p[0].constant = o; p[1].constant = CLIP_OFF; p[2].constant = CLIP_OFF; p[3].constant = CLIP_OFF; }
  else if (mode === 'quad') { p[0].constant = o; p[1].constant = CLIP_OFF; p[2].constant = o; p[3].constant = CLIP_OFF; }
  if (state.map) state.map.triggerRepaint();
}

/**
 * 由畫面座標對模型做射線拾取。
 *
 * MapLibre 沒有 Mapbox 的 getFreeCameraOptions()，但 CustomLayer 每一幀都會拿到
 * 「世界 → 裁剪空間」的矩陣；取其反矩陣即可把畫面上的 NDC 座標反算回場景座標，
 * 用近平面與中距離兩點構成射線。
 */
function pickAt(x, y) {
  const map = state.map;
  if (!map || !state.mvp) return null;
  const canvas = map.getCanvas();
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const nx = (x / w) * 2 - 1;
  const ny = 1 - (y / h) * 2;

  const inv = new THREE.Matrix4().copy(state.mvp).invert();
  const near = new THREE.Vector3(nx, ny, -1).applyMatrix4(inv);
  const mid = new THREE.Vector3(nx, ny, 0).applyMatrix4(inv);
  const dir = mid.clone().sub(near).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 0.5) return null;

  const ray = new THREE.Raycaster(near, dir);
  ray.far = Infinity;
  const targets = [];
  state.model.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = ray.intersectObjects(targets, false);
  for (const hit of hits) {
    if (hit.object.userData && hit.object.userData.kind) {
      return Object.assign({}, hit.object.userData, { point: hit.point });
    }
  }
  return null;
}

/** 由畫面座標取得地表位置（模型局部座標，公尺）；工具點選用 */
function pickGround(event) {
  const map = state.map;
  if (!map || !state.mvp) return null;
  const canvas = map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const nx = ((event.clientX - rect.left) / w) * 2 - 1;
  const ny = 1 - ((event.clientY - rect.top) / h) * 2;

  const inv = new THREE.Matrix4().copy(state.mvp).invert();
  const near = new THREE.Vector3(nx, ny, -1).applyMatrix4(inv);
  const mid = new THREE.Vector3(nx, ny, 0).applyMatrix4(inv);
  const dir = mid.clone().sub(near).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 0.5) return null;

  const ray = new THREE.Raycaster(near, dir);
  ray.far = Infinity;
  const targets = [];
  state.model.traverse((o) => { if (o.isMesh && o.visible) targets.push(o); });
  const hits = ray.intersectObjects(targets, false);
  if (hits.length) {
    const p = state.model.worldToLocal(hits[0].point.clone());
    return { x: p.x, z: p.z };
  }
  const out = new THREE.Vector3();
  if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out)) {
    const p = state.model.worldToLocal(out);
    return { x: p.x, z: p.z };
  }
  return null;
}

/** 羽流改變後重算儲層飽和度屬性；只有與飽和度相關的著色模式需要重繪 */
function refreshSaturationColors() {
  const mesh = state.strata && state.strata.children[C.RESERVOIR.strataIndex];
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
  if (state.map) state.map.triggerRepaint();
}

/** 在地表畫出剖面線 A–A'；傳入 null 則移除 */
function setSectionLine(a, b) {
  if (state.sectionLine) {
    state.model.remove(state.sectionLine);
    state.sectionLine.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    state.sectionLine = null;
  }
  if (a) {
    const g = new THREE.Group();
    g.name = 'section-line';
    const y = 40;
    const mark = (p) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(60, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x35e0d0, depthTest: false, side: THREE.DoubleSide })
      );
      dot.renderOrder = 20;
      dot.position.set(p.x, y, p.z);
      dot.scale.y = 1 / state.ve;
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
  }
  if (state.map) state.map.triggerRepaint();
}

Object.assign(C, {
  ccsLayer: {
    state, makeCustomLayer, setVerticalExaggeration, setYear, setBasemap,
    setLayerVisible, setStratumVisible, setGlobalOpacity, setSection, pickAt,
    setColorMode, refreshSaturationColors, pickGround, setSectionLine
  }
});
C.viewer = C.ccsLayer;
})();
