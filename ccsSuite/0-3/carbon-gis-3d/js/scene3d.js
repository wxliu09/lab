window.CCS3D = window.CCS3D || {};
(function () {
'use strict';
const THREE = window.THREE;
const { OrbitControls } = window.THREE;
const C = window.CCS3D;
const { SITE, VIEW, INJECTION, MONITORS, WELLS, RESERVOIR, STRATA } = window.CCS3D;
const { lonLatToWorld, worldToLonLat } = window.CCS3D;
const { SurfaceTiles, buildSurfaceHelpers, SURFACE_Y } = window.CCS3D;
const { buildStrata, buildPlume, updatePlume, buildWells, buildFaults, buildDepthAxis, buildStrataLabels, makeLabel, horizonElev, wellWorldPosition } = window.CCS3D;

/**
 * Three.js 3D 場景：地表圖台 + 地下地質模型，支援 360° 環繞瀏覽、
 * 垂直放大、剖切、物件拾取與時間軸羽流演化。
 */


const HALF = SITE.halfExtent;

class Scene3D {
  constructor(container) {
    this.container = container;
    this.exaggeration = VIEW.verticalExaggeration;
    this.year = INJECTION[INJECTION.length - 1].year;
    this.basemap = 'imagery';
    this.tileZoom = VIEW.tileZoom;
    this.hovered = null;
    this.selected = null;
    this.listeners = { pick: [], move: [], progress: [] };
    this.clock = new THREE.Clock();
    this.flight = null;
    this.injecting = true;
    this.colorMode = 'lithology';
    this.sectionLine = null;
  }

  init() {
    const { container } = this;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VIEW.background);
    this.scene.fog = new THREE.FogExp2(VIEW.background, 0.000032);

    this.camera = new THREE.PerspectiveCamera(
      48,
      container.clientWidth / container.clientHeight,
      5,
      120000
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 260;
    this.controls.maxDistance = 42000;
    // 允許越過天頂與地平面，達成完整 360 度環繞（含由下往上仰視）
    this.controls.minPolarAngle = 0.02;
    this.controls.maxPolarAngle = Math.PI - 0.02;

    const home = this.#homeView();
    this.camera.position.copy(home.pos);
    this.controls.target.copy(home.target);
    this.controls.update();

    this.#buildLights();
    this.#buildContent();
    this.#bindEvents();

    this.setExaggeration(this.exaggeration);
    this.setYear(this.year);
    this.updateSurface({ lat: SITE.lat, lon: SITE.lon, zoom: this.tileZoom });

    this.#animate();
    return this;
  }

  /* ---------------- 場景組成 ---------------- */

  #buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x2a2118, 0.85));

    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(6200, 9800, 4200);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x8fc3ff, 0.42);
    fill.position.set(-6800, 3200, -5600);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd9a0, 0.28);
    rim.position.set(0, -4000, 8000);
    this.scene.add(rim);

    // 跟隨相機的補光，確保任何環繞角度下的剖面都可辨識
    this.headLamp = new THREE.DirectionalLight(0xffffff, 0.5);
    this.scene.add(this.headLamp);
    this.scene.add(this.headLamp.target);
  }

  #buildContent() {
    // 剖切平面（constant 給大值代表未啟用）
    this.clipX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF * 4);
    this.clipZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), HALF * 4);
    this.clipPlanes = [this.clipX, this.clipZ];

    // 將地表底圖裁切至模型不規則輪廓，形成「地質區塊圖」：頂面為 GIS 圖台、四側為地層剖面
    this.surfaceClip = true;

    // 地表圖台（不受垂直放大影響）
    this.tiles = new SurfaceTiles(
      this.clipPlanes,
      this.renderer.capabilities.getMaxAnisotropy()
    );
    this.tiles.onProgress = (n) => this.#emit('progress', n);
    this.scene.add(this.tiles.group);

    this.helpers = buildSurfaceHelpers();
    this.scene.add(this.helpers);

    // 地下模型（統一套用垂直放大）
    this.model = new THREE.Group();
    this.model.name = 'model';
    this.scene.add(this.model);

    this.strata = buildStrata(this.clipPlanes);
    this.model.add(this.strata);

    this.faults = buildFaults(this.clipPlanes);
    this.model.add(this.faults);

    this.plume = buildPlume(this.clipPlanes);
    this.model.add(this.plume);

    this.wells = buildWells(this.clipPlanes);
    this.model.add(this.wells);

    const axis = buildDepthAxis();
    this.depthAxis = axis;

    // 標籤：不隨垂直放大變形，改以程式更新 Y 位置
    this.labels = new THREE.Group();
    this.labels.name = 'labels';
    this.scene.add(this.labels);
    this.labels.add(axis);
    this.strataLabels = buildStrataLabels();
    this.labels.add(this.strataLabels);
    this.#buildWellLabels();

    // 地表監測站
    this.monitors = this.#buildMonitors();
    this.scene.add(this.monitors);

    // 羽流地表投影輪廓
    this.plumeFootprint = this.#buildFootprint();
    this.scene.add(this.plumeFootprint);
  }

  #buildWellLabels() {
    this.wellLabels = new THREE.Group();
    this.wellLabels.name = 'well-labels';
    WELLS.forEach((w) => {
      const p = lonLatToWorld(w.lon, w.lat);
      const sp = makeLabel(w.id, {
        fontSize: 42,
        worldHeight: 130,
        border: `#${new THREE.Color(w.color).getHexString()}`
      });
      sp.position.set(p.x, 260, p.z);
      sp.userData.baseY = 260;
      sp.userData.fixed = true;
      this.wellLabels.add(sp);
    });
    this.labels.add(this.wellLabels);
  }

  #buildMonitors() {
    const group = new THREE.Group();
    group.name = 'monitors';
    const colors = { flux: 0x9be564, seismic: 0xffd166, water: 0x5ac8fa, insar: 0xd08bff };
    MONITORS.forEach((m) => {
      const p = lonLatToWorld(m.lon, m.lat);
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(55, 190, 5),
        new THREE.MeshStandardMaterial({
          color: colors[m.kind] || 0xffffff,
          emissive: colors[m.kind] || 0xffffff,
          emissiveIntensity: 0.35,
          roughness: 0.5,
          clippingPlanes: this.clipPlanes
        })
      );
      mesh.position.set(p.x, SURFACE_Y + 95, p.z);
      mesh.userData = {
        kind: 'monitor',
        id: m.id,
        title: m.name,
        rows: [
          ['站別代碼', m.id],
          ['監測類型', { flux: '地表 CO₂ 通量', seismic: '微震', water: '地下水質', insar: '地表變形' }[m.kind]],
          ['座標', `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`]
        ],
        note: '屬場址監測、驗證與認證（MVA）計畫之一環，資料同步回傳至 GIS 圖台。'
      };
      group.add(mesh);
    });
    return group;
  }

  #buildFootprint() {
    const group = new THREE.Group();
    group.name = 'plume-footprint';

    const ringGeo = new THREE.RingGeometry(0.93, 1, 96);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x35e0d0,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.renderOrder = 901;
    group.add(ring);

    const discGeo = new THREE.CircleGeometry(1, 96);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x35e0d0,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.renderOrder = 900;
    group.add(disc);

    this.footprintMats = { ring: ringMat, disc: discMat };

    const inj = WELLS.find((w) => w.type === 'injector');
    const p = lonLatToWorld(inj.lon, inj.lat);
    group.position.set(p.x, SURFACE_Y + 3, p.z);
    return group;
  }

  /* ---------------- 控制 API ---------------- */

  /** 設定垂直放大倍率（同步平移視點，維持構圖不跑掉） */
  setExaggeration(v) {
    const prev = this.exaggeration || 1;
    this.exaggeration = v;
    this.model.scale.y = v;
    if (this.sectionLine) {
      this.sectionLine.children.forEach((o) => { if (o.isMesh) o.scale.y = 1 / v; });
    }
    if (this.controls) {
      const dy = this.controls.target.y * (v / prev - 1);
      this.controls.target.y += dy;
      this.camera.position.y += dy;
    }
    this.labels.traverse((o) => {
      if (o.isSprite && o.userData.baseY !== undefined) {
        o.position.y = o.userData.fixed ? o.userData.baseY : o.userData.baseY * v;
      }
    });
  }

  /** 更新地表圖台範圍（由 2D 圖台或程式驅動） */
  updateSurface({ lat, lon, zoom, basemap }) {
    if (basemap) this.basemap = basemap;
    if (zoom !== undefined) this.tileZoom = Math.max(11, Math.min(17, Math.round(zoom)));
    if (lat !== undefined && lon !== undefined) this.lastView = { lat, lon };
    if (!this.lastView) this.lastView = { lat: SITE.lat, lon: SITE.lon };
    // 裁切至模型範圍時，瓦片格網固定以場址為中心，確保區塊頂面完整覆蓋
    const c = this.surfaceClip ? { lat: SITE.lat, lon: SITE.lon } : this.lastView;
    this.tiles.update({ lat: c.lat, lon: c.lon, zoom: this.tileZoom, basemap: this.basemap });
  }

  setBasemap(key) {
    this.basemap = key;
    this.tiles.key = null;
    this.updateSurface({});
  }

  /** 切換「地表裁切至模型範圍」（區塊圖 / 廣域脈絡） */
  setSurfaceClip(on) {
    this.surfaceClip = on;
    C.setOutlineMask(on);
    this.tiles.key = null;
    this.updateSurface({});
  }

  setSurfaceOpacity(v) {
    this.tiles.setOpacity(v);
  }

  /** 圖層顯示切換 */
  setLayerVisible(name, on) {
    const map = {
      surface: () => this.tiles.setVisible(on),
      surfaceClip: () => this.setSurfaceClip(on),
      grid: () => (this.helpers.visible = on),
      wells: () => {
        this.wells.visible = on;
        this.wellLabels.visible = on;
      },
      plume: () => {
        this.plume.userData.layerOn = on;
        this.plume.visible = on && this.plumeVisibleByYear;
        this.plumeFootprint.visible = on && this.plumeVisibleByYear;
      },
      faults: () => (this.faults.visible = on),
      monitors: () => (this.monitors.visible = on),
      labels: () => (this.labels.visible = on),
      axis: () => (this.depthAxis.visible = on)
    };
    if (map[name]) map[name]();
    else {
      const mesh = this.strata.children.find((m) => m.name === `stratum-${name}`);
      if (mesh) {
        mesh.visible = on;
        const label = this.strataLabels.children.find((s) => s.userData.strataId === name);
        if (label) label.visible = on;
      }
    }
  }

  /** 單一地層透明度 */
  setStratumOpacity(id, v) {
    const mesh = this.strata.children.find((m) => m.name === `stratum-${id}`);
    if (mesh) {
      mesh.material.opacity = v;
      mesh.material.transparent = true;
      mesh.material.depthWrite = v > 0.95;
      mesh.material.needsUpdate = true;
    }
  }

  /** 全體地層透明度 */
  setStrataOpacity(v) {
    this.strata.children.forEach((m) => {
      m.material.opacity = v;
      m.material.depthWrite = v > 0.95;
      m.material.needsUpdate = true;
    });
  }

  /** 剖切：axis 為 'x' 或 'z'，t 為 -1 ~ 1 的相對位置 */
  setClip(axis, enabled, t = 1) {
    const plane = axis === 'x' ? this.clipX : this.clipZ;
    plane.constant = enabled ? t * HALF * 1.15 : HALF * 4;
  }

  /** 時間軸：更新羽流大小與注入狀態 */
  setYear(year) {
    this.year = year;
    const row = INJECTION.find((r) => r.year === year) || INJECTION[0];
    this.plumeVisibleByYear = row.radius > 1;
    updatePlume(this.plume, row.radius, row.thickness);
    this.plume.visible = this.plumeVisibleByYear && this.plume.userData.layerOn !== false;

    const s = Math.max(row.radius, 0.001);
    this.plumeFootprint.scale.set(s, 1, s);
    this.plumeFootprint.visible = this.plume.visible;
    this.injecting = row.phase === '注入期' && row.radius > 1;
    this.refreshSaturationColors();
    return row;
  }

  /** 相機飛行至指定世界座標 */
  flyTo(target, distance = 3200, elevationRatio = 0.55) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.6, 0.55, 0.6).normalize();
    dir.y = Math.max(dir.y, elevationRatio * 0.5);
    dir.normalize();
    this.flight = {
      t: 0,
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      fromPos: this.camera.position.clone(),
      toPos: target.clone().add(dir.multiplyScalar(distance))
    };
  }

  /** 飛到指定井 */
  flyToWell(wellId) {
    const w = WELLS.find((x) => x.id === wellId);
    const p = wellWorldPosition(wellId);
    if (!p) return;
    p.y = (w.perf[0] * this.exaggeration) / 2;
    this.flyTo(p, 2600);
  }

  /** 重置為預設視角 */
  resetView() {
    const home = this.#homeView();
    this.flight = {
      t: 0,
      fromTarget: this.controls.target.clone(),
      toTarget: home.target,
      fromPos: this.camera.position.clone(),
      toPos: home.pos
    };
  }

  /** 依目前垂直放大倍率計算可完整框住區塊模型的預設視角 */
  #homeView() {
    const bottom = -2200 * this.exaggeration;
    const target = new THREE.Vector3(0, bottom / 2, 0);
    const dist = Math.max(9000, HALF * 1.7 + Math.abs(bottom) * 0.9);
    const dir = new THREE.Vector3(0.52, 0.45, 0.72).normalize();
    return { target, pos: target.clone().add(dir.multiplyScalar(dist)) };
  }

  /** 預設視角：正射俯視（等同 2D 圖台視角） */
  topView() {
    this.flight = {
      t: 0,
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(0, 0, 0),
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(0.1, 9200, 0.1)
    };
  }

  /** 自動環繞 360 度 */
  setAutoRotate(on, speed = 0.6) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = speed;
  }

  /** 目前圖台中心的經緯度（供 2D 同步） */
  getTargetLonLat() {
    return worldToLonLat(this.controls.target.x, this.controls.target.z);
  }

  /** 截圖輸出 */
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  on(evt, cb) {
    if (this.listeners[evt]) this.listeners[evt].push(cb);
  }

  #emit(evt, payload) {
    (this.listeners[evt] || []).forEach((cb) => cb(payload));
  }

  /* ---------------- 事件與拾取 ---------------- */

  #bindEvents() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const el = this.renderer.domElement;

    const toPointer = (e) => {
      const rect = el.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    let downPos = null;
    el.addEventListener('pointerdown', (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointerup', (e) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 5) return; // 視為旋轉操作，不觸發選取
      toPointer(e);
      const hit = this.#pick();
      this.#select(hit);
      this.#emit('pick', hit ? this.#describe(hit) : null);
    });

    el.addEventListener('pointermove', (e) => {
      toPointer(e);
      this.pointerMoved = true;
    });

    el.addEventListener('pointerleave', () => {
      this.#hover(null);
      this.pointerMoved = false;
    });

    this.controls.addEventListener('change', () => {
      if (this.moveTimer) clearTimeout(this.moveTimer);
      this.moveTimer = setTimeout(() => {
        const ll = this.getTargetLonLat();
        this.#emit('move', { ...ll, distance: this.camera.position.distanceTo(this.controls.target) });
      }, 120);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  #pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [this.model, this.tiles.group, this.monitors];
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (h.object.isMesh && h.object.userData && h.object.userData.kind) {
        if (h.object.material && h.object.material.visible === false) continue;
        if (!h.object.visible) continue;
        return h;
      }
    }
    return null;
  }

  /** 供分析工具使用：把畫面座標打到模型上，回傳模型局部座標（公尺） */
  pickGround(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.model, this.tiles.group], true);
    for (const h of hits) {
      if (!h.object.isMesh || !h.object.visible) continue;
      const p = this.model.worldToLocal(h.point.clone());
      return { x: p.x, z: p.z };
    }
    const out = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out)) {
      const p = this.model.worldToLocal(out);
      return { x: p.x, z: p.z };
    }
    return null;
  }

  /** 屬性著色模式：lithology / phi / perm / ntg / vsh / sg / vp / ai */
  setColorMode(mode) {
    this.colorMode = mode;
    this.strata.children.forEach((mesh) => C.applyColorMode(mesh, mode));
  }

  /** 羽流改變後重算儲層飽和度屬性 */
  refreshSaturationColors() {
    const mesh = this.strata && this.strata.children[RESERVOIR.strataIndex];
    if (!mesh) return;
    C.refreshSaturation(mesh);
    if (this.colorMode === 'sg' || this.colorMode === 'vp' || this.colorMode === 'ai') {
      C.applyColorMode(mesh, this.colorMode);
    }
  }

  /** 在地表畫出剖面線 A–A'；傳入 null 則移除 */
  setSectionLine(a, b) {
    if (this.sectionLine) {
      this.model.remove(this.sectionLine);
      this.sectionLine.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.sectionLine = null;
    }
    if (!a) return;
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
      dot.scale.y = 1 / this.exaggeration;
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
    this.model.add(g);
    this.sectionLine = g;
  }

  /** 分析模組以 viewer.state.xxx 取用場景物件，本版場景即狀態本身 */
  get state() { return this; }

  #describe(hit) {
    const u = hit.object.userData;
    if (u.kind === 'surface') {
      const ll = worldToLonLat(hit.point.x, hit.point.z);
      const rows = [
        ['經緯度', `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}`],
        ['距注入井', `${Math.round(Math.hypot(hit.point.x, hit.point.z))} m`]
      ];
      return {
        kind: 'surface',
        title: '地表點位剖面',
        rows,
        note: '此處為虛擬鑽井剖面：顯示該點各地層界面深度。',
        profile: this.#profileAt(hit.point.x, hit.point.z),
        logAt: { x: hit.point.x, z: hit.point.z },
        point: { lat: ll.lat, lon: ll.lon }
      };
    }

    if (u.kind === 'stratum') {
      const s = u.data;
      const i = u.index;
      const lp = this.model.worldToLocal(hit.point.clone());
      const col = C.stratumDepthAt(i, lp.x, lp.z);
      const zRel = col && col.thickness > 0
        ? Math.min(1, Math.max(0, (col.top - lp.y) / col.thickness)) : 0.5;
      const pr = C.petro.propsAt(i, lp.x, lp.z, zRel, C.co2SaturationAt(i, lp.x, lp.z, zRel));
      const midDepth = Math.abs(col ? (col.top + col.bot) / 2 : 0);
      const ins = C.petro.insituAt(midDepth);
      const rows = [
        ['時代', `${s.age.epoch}（${s.age.from} – ${s.age.to} Ma）`],
        ['沉積環境', s.depoEnv],
        ['岩性', s.lithology],
        ['孔隙率（文獻）', s.porosity],
        ['滲透率（文獻）', s.permeability],
        ['點位厚度', col ? `${col.thickness.toFixed(0)} m（頂 ${col.top.toFixed(0)} m）` : '—'],
        ['平面形態', s.extent ? `不規則，最大約塊體邊界的 ${Math.round(s.extent.scale * 100)}%` : '覆蓋整個塊體'],
        ['尖滅', s.pinch ? `朝方位 ${s.pinch.azimuth}° 減薄至 ${((1 - s.pinch.strength) * 100).toFixed(0)}%` : '無'],
        [`點位 φ（層內 ${(zRel * 100).toFixed(0)}%）`, `${(pr.phi * 100).toFixed(1)} %`],
        ['點位 k', pr.perm >= 1 ? `${pr.perm.toFixed(0)} mD` : `${pr.perm.toExponential(2)} mD`],
        ['NTG / Vsh', `${pr.ntg.toFixed(2)} / ${pr.vsh.toFixed(2)}`],
        ['GR / ρb / Vp', `${pr.gr.toFixed(0)} API ／ ${pr.rhob.toFixed(2)} g/cm³ ／ ${pr.vp.toFixed(0)} m/s`],
        ['原地溫壓', `${ins.temp.toFixed(1)} °C ／ ${ins.pressure.toFixed(1)} MPa`],
        ['CO₂ 相態', `${ins.phase}，${ins.co2Density.toFixed(0)} kg/m³`]
      ];
      if (pr.sg > 0.005) rows.push(['CO₂ 飽和度', `${(pr.sg * 100).toFixed(0)} %`]);
      if (s.role === 'seal') {
        const h = C.petro.sealColumnHeight(s, midDepth);
        if (h) rows.push(['可滯留柱高', `${h.toFixed(0)} m（Pc ${s.petro.pc} MPa）`]);
      }
      return { kind: 'stratum', title: `${s.name}｜${s.en}`, rows, note: s.note, id: s.id,
        logAt: { x: lp.x, z: lp.z } };
    }

    if (u.kind === 'well' || u.kind === 'perf') {
      const w = u.data;
      const p = lonLatToWorld(w.lon, w.lat);
      const rows = [
        ['井別', w.type === 'injector' ? 'CO₂ 注入井' : '監測觀測井'],
        ['井口座標', C.formatLatLng(w.lat, w.lon)],
        ['總深', `${Math.abs(w.depth)} m`],
        ['射孔段', `${Math.abs(w.perf[0])} ～ ${Math.abs(w.perf[1])} m`]
      ];
      if (w.deviation) rows.push(['造斜位移', `東 ${w.deviation.east} m、北 ${w.deviation.north} m`]);
      return { kind: 'well', title: w.name, rows, note: w.detail, id: w.id,
        profile: this.#profileAt(p.x, p.z), logAt: { x: p.x, z: p.z, well: w } };
    }

    if (u.kind === 'fault') {
      const f = u.data;
      const sgr = C.petro.faultSGR(f);
      const rows = [
        ['走向 / 傾角', `${f.strike}° / ${f.dip}°`],
        ['運動性質', f.sense === 'reverse' ? '逆斷層（上盤上衝）' : '正斷層（上盤下降）'],
        ['延伸長度', `${(f.length / 1000).toFixed(1)} km`],
        ['切穿深度', `${f.topElev} ～ ${f.botElev} m`],
        ['最大斷距', `${f.throw} m（D/L ${(f.throw / f.length).toFixed(3)}）`],
        ['破裂帶半寬', `${f.damage} m`]
      ];
      if (sgr) rows.push(['SGR 泥質塗抹比', `${(sgr.sgr * 100).toFixed(0)} %　${sgr.sealing ? '具側向封閉' : '封閉性存疑'}`]);
      return { kind: 'fault', title: f.name, rows, note: f.note, id: f.id };
    }

    if (u.kind === 'plume') {
      const row = INJECTION.find((r) => r.year === this.year);
      return {
        kind: 'plume', title: 'CO₂ 羽流',
        rows: [
          ['模擬年份', `${row.year}（${row.phase}）`],
          ['累積注入量', `${row.cumulative} Mt`],
          ['羽流半徑', `${row.radius} m`],
          ['最大厚度', `${row.thickness} m`],
          ['所在層位', '上福基砂岩（主儲層）']
        ],
        note: '超臨界 CO₂ 因浮力聚集於儲層頂面，受蓋層阻擋而側向擴展；平面形狀不規則，反映儲層滲透率的非均質性。'
      };
    }

    return { kind: u.kind, title: u.title, rows: [...(u.rows || [])], note: u.note, id: u.id };
  }

  /** 指定平面位置的虛擬井剖面（依實際不規則模型計算） */
  #profileAt(x, z) {
    const list = [];
    for (let i = 0; i < STRATA.length; i++) {
      const d = C.stratumDepthAt(i, x, z);
      if (!d || d.thickness <= 0.5) continue;
      list.push({ index: i, top: Math.round(d.top), bot: Math.round(d.bot), thickness: Math.round(d.thickness) });
    }
    return list;
  }

  #select(hit) {
    if (this.selected) {
      this.selected.material.emissive.setHex(this.selected.userData.__emissive ?? 0x000000);
      this.selected.material.emissiveIntensity = this.selected.userData.__ei ?? 1;
      this.selected = null;
    }
    if (hit && hit.object.material && hit.object.material.emissive && hit.object.userData.kind !== 'surface') {
      const m = hit.object;
      m.userData.__emissive = m.material.emissive.getHex();
      m.userData.__ei = m.material.emissiveIntensity;
      m.material.emissive.setHex(0x2f6fff);
      m.material.emissiveIntensity = 0.75;
      this.selected = m;
    }
  }

  #hover(hit) {
    const obj = hit ? hit.object : null;
    if (this.hovered === obj) return;
    if (this.hovered && this.hovered !== this.selected) {
      this.hovered.material.emissive.setHex(this.hovered.userData.__hEmissive ?? 0x000000);
      this.hovered.material.emissiveIntensity = this.hovered.userData.__hEi ?? 1;
    }
    this.hovered = null;
    this.renderer.domElement.style.cursor = obj ? 'pointer' : 'grab';
    if (obj && obj !== this.selected && obj.material && obj.material.emissive) {
      obj.userData.__hEmissive = obj.material.emissive.getHex();
      obj.userData.__hEi = obj.material.emissiveIntensity;
      obj.material.emissive.setHex(0x1b3f8f);
      obj.material.emissiveIntensity = 0.45;
      this.hovered = obj;
    }
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ---------------- 主迴圈 ---------------- */

  #animate() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      const t = this.clock.elapsedTime;

      if (this.flight) {
        this.flight.t = Math.min(1, this.flight.t + dt * 1.35);
        const e = 1 - Math.pow(1 - this.flight.t, 3);
        this.controls.target.lerpVectors(this.flight.fromTarget, this.flight.toTarget, e);
        this.camera.position.lerpVectors(this.flight.fromPos, this.flight.toPos, e);
        if (this.flight.t >= 1) this.flight = null;
      }

      // 注入中的射孔段脈動
      if (this.wells.visible) {
        const pulse = this.injecting ? 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.2)) : 0.25;
        this.wells.children.forEach((c) => {
          if (c.isMesh && c.geometry.type === 'CylinderGeometry' && c.material.emissive) {
            c.material.emissiveIntensity = pulse;
          }
        });
      }

      if (this.plume.visible) {
        this.plume.material.emissiveIntensity = 0.42 + 0.16 * Math.sin(t * 1.6);
        this.footprintMats.ring.opacity = 0.6 + 0.35 * Math.abs(Math.sin(t * 1.1));
      }

      this.headLamp.position.copy(this.camera.position);
      this.headLamp.target.position.copy(this.controls.target);

      if (this.pointerMoved) {
        this.#hover(this.#pick());
        this.pointerMoved = false;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}

Object.assign(window.CCS3D, { Scene3D });
})();
