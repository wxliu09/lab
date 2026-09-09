/*
 * view3d.js — three.js 3D 地質模型檢視
 * 座標轉換：模型 (x 東, y 北, z 深度向下) → three.js (x, -z, -y)（y 向上、右手系）
 * 內容：地層實體（每斷塊/每地層一個 mesh，頂點著色：岩性或屬性場）、斷層面、海面、注入井與觀測井（含斜井）、
 *       監測站、向量圖徵、CO₂ 羽流（披覆於儲層頂面）、壓力影響半徑／羽流外緣環線、浮力運移路徑、
 *       剖面線 A–A′、取點標記、模型外框與深度刻度、指北。
 * 互動：自訂軌道控制（左鍵旋轉、右鍵/中鍵/Shift 平移、滾輪縮放、觸控）、平滑飛行、自動環繞、
 *       hover 拾取、點選（回傳物件與位置）、選取高亮、相機事件（含地面視錐投影，供 2D 圖台同步）。
 */
window.CCSView3D = (function () {
  'use strict';
  const T = () => window.THREE;
  const toV = (x, y, z) => [x, -z, -y];
  const MONITOR_COLORS = { flux: 0x1baf7a, seismic: 0xeda100, water: 0x2a78d6, insar: 0x4a3aa7, pressure: 0xe87ba4 };

  function textSprite(text, opts) {
    const THREE = T(); opts = opts || {};
    const c = document.createElement('canvas'), fs = 40, pad = 10;
    const cx = c.getContext('2d'); cx.font = `600 ${fs}px system-ui, "Segoe UI", "Noto Sans TC", sans-serif`;
    const w = Math.ceil(cx.measureText(text).width) + pad * 2, h = fs + pad * 2;
    c.width = w; c.height = h;
    cx.font = `600 ${fs}px system-ui, "Segoe UI", "Noto Sans TC", sans-serif`; cx.textBaseline = 'middle';
    if (opts.bg) { cx.fillStyle = opts.bg; cx.fillRect(0, 0, w, h); }
    cx.fillStyle = opts.color || '#0b0b0b'; cx.fillText(text, pad, h / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const scale = opts.scale || 1;
    sp.scale.set(w / h * scale, scale, 1);
    sp.renderOrder = 10;
    return sp;
  }

  function create(container) {
    const THREE = T();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // 墨色／背景依主題切換；圖層與圖徵色不變
    const INKS = {
      light: { ink: '#0b0b0b', ink2: '#52514e', obs: '#1c5cab', line: 0x0b0b0b, clear: 0xf3f2ec },
      dark: { ink: '#f2f1ec', ink2: '#c3c2b7', obs: '#86b4f0', line: 0xf2f1ec, clear: 0x1a1a19 }
    };
    let theme = 'light';
    const tk = () => INKS[theme];
    renderer.setClearColor(INKS.light.clear, 1);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 5, 400000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.55, 1, 0.7).multiplyScalar(50000); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-0.6, 0.4, -0.5).multiplyScalar(50000); scene.add(fill);

    const root = new THREE.Group(); scene.add(root);
    const groups = {};
    for (const k of ['layers', 'faults', 'wells', 'monitors', 'vectors', 'plume', 'lines', 'section', 'frame', 'water']) { groups[k] = new THREE.Group(); root.add(groups[k]); }

    const state = { model: null, ve: 1.5, layerVisible: {}, layerOpacity: {}, faultsVisible: true, waterVisible: true, extent: [10000, 10000], depthMax: 4000, dirty: true,
      hoverCb: null, clickCb: null, cameraCb: null, clip: null, plume: null, colorMode: 'lithology', sampler: null, explode: 0, autoRotate: false, selected: null };
    const clipBox = () => { const hx = state.extent[0] / 2, hy = state.extent[1] / 2, c = state.clip || {}; return { xmin: c.xmin != null ? c.xmin : -hx, xmax: c.xmax != null ? c.xmax : hx, ymin: c.ymin != null ? c.ymin : -hy, ymax: c.ymax != null ? c.ymax : hy }; };
    const clampXY = (x, y) => { const b = clipBox(); return [Math.max(b.xmin, Math.min(b.xmax, x)), Math.max(b.ymin, Math.min(b.ymax, y))]; };
    const ctl = { target: new THREE.Vector3(0, -1500, 0), dist: 18000, theta: 0.6, phi: 1.0 };
    let flight = null, W = 1, H = 1, lastTime = performance.now(), cameraPending = false;

    function applyCamera() {
      const t = ctl.target;
      camera.position.set(t.x + ctl.dist * Math.sin(ctl.phi) * Math.sin(ctl.theta), t.y + ctl.dist * Math.cos(ctl.phi), t.z + ctl.dist * Math.sin(ctl.phi) * Math.cos(ctl.theta));
      camera.lookAt(t); state.dirty = true;
      if (state.cameraCb && !cameraPending) { cameraPending = true; setTimeout(() => { cameraPending = false; state.cameraCb(cameraInfo()); }, 80); }
    }
    /** 相機資訊 + 地面視錐投影（模型座標），供 2D 圖台同步 */
    function cameraInfo() {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], foot = [];
      camera.updateMatrixWorld();
      for (const [nx, ny] of corners) {
        const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera), dir = v.sub(camera.position).normalize();
        let p;
        if (dir.y < -1e-4) { const tt = -camera.position.y / dir.y; p = camera.position.clone().addScaledVector(dir, Math.min(tt, ctl.dist * 6)); }
        else p = camera.position.clone().addScaledVector(dir, ctl.dist * 4);
        foot.push([p.x, -p.z]);
      }
      return { target: { x: ctl.target.x, y: -ctl.target.z, z: -ctl.target.y / state.ve }, dist: ctl.dist, theta: ctl.theta, phi: ctl.phi,
        camera: { x: camera.position.x, y: -camera.position.z }, footprint: foot, bearing: ((-ctl.theta * 180 / Math.PI) % 360 + 360) % 360 };
    }
    function resize() {
      W = container.clientWidth || 1; H = container.clientHeight || 1;
      renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); state.dirty = true;
    }
    new ResizeObserver(resize).observe(container);
    resize();
    (function loop() {
      requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.1, (now - lastTime) / 1000); lastTime = now;
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / 0.9);
        const e = 1 - Math.pow(1 - flight.t, 3);
        ctl.target.lerpVectors(flight.from.target, flight.to.target, e);
        ctl.dist = flight.from.dist + (flight.to.dist - flight.from.dist) * e;
        ctl.theta = flight.from.theta + (flight.to.theta - flight.from.theta) * e;
        ctl.phi = flight.from.phi + (flight.to.phi - flight.from.phi) * e;
        if (flight.t >= 1) flight = null;
        applyCamera();
      } else if (state.autoRotate) { ctl.theta += dt * 0.25; applyCamera(); }
      if (state.dirty) { state.dirty = false; renderer.render(scene, camera); }
    })();

    // ---- 控制 ----
    const el = renderer.domElement;
    let drag = null, pinch = null;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') return;
      drag = { x: e.clientX, y: e.clientY, mode: (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rotate', moved: 0 };
      el.setPointerCapture(e.pointerId); flight = null;
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.mode === 'rotate') { ctl.theta -= dx * 0.005; ctl.phi = Math.max(0.05, Math.min(1.5, ctl.phi - dy * 0.005)); }
        else pan(dx, dy);
        applyCamera();
      } else pick(e, false);
    });
    el.addEventListener('pointerleave', () => { if (state.hoverCb) state.hoverCb(null); });
    el.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch') return;
      if (drag && drag.moved < 4 && e.button === 0) pick(e, true);
      drag = null;
    });
    el.addEventListener('wheel', e => { e.preventDefault(); flight = null; ctl.dist = Math.max(500, Math.min(150000, ctl.dist * Math.exp(e.deltaY * 0.0012))); applyCamera(); }, { passive: false });
    el.addEventListener('touchstart', e => {
      flight = null;
      if (e.touches.length === 1) drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: 'rotate', moved: 0 };
      else if (e.touches.length === 2) { pinch = { d: dist2(e.touches), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 }; drag = null; }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && drag) { const dx = e.touches[0].clientX - drag.x, dy = e.touches[0].clientY - drag.y; drag.x = e.touches[0].clientX; drag.y = e.touches[0].clientY; ctl.theta -= dx * 0.005; ctl.phi = Math.max(0.05, Math.min(1.5, ctl.phi - dy * 0.005)); applyCamera(); }
      else if (e.touches.length === 2 && pinch) {
        const d = dist2(e.touches), cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        ctl.dist = Math.max(500, Math.min(150000, ctl.dist * pinch.d / d)); pan(cx - pinch.cx, cy - pinch.cy); pinch = { d, cx, cy }; applyCamera();
      }
    }, { passive: false });
    el.addEventListener('touchend', () => { drag = null; pinch = null; });
    function dist2(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function pan(dx, dy) {
      const right = new THREE.Vector3(), up = new THREE.Vector3();
      camera.matrix.extractBasis(right, up, new THREE.Vector3());
      const k = ctl.dist * 0.0016;
      ctl.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    }

    // ---- 拾取 ----
    const ray = new THREE.Raycaster();
    let pickPending = null;
    function pickTargets() {
      return [...groups.layers.children.filter(o => o.visible), ...groups.faults.children.filter(o => o.visible), ...groups.plume.children,
        ...groups.wells.children.filter(o => o.isMesh), ...groups.monitors.children.filter(o => o.isMesh), ...groups.water.children.filter(o => o.visible)];
    }
    function pick(e, isClick) {
      const r = el.getBoundingClientRect();
      const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const run = () => {
        pickPending = null;
        ray.setFromCamera(m, camera);
        const hits = ray.intersectObjects(pickTargets(), false);
        let info = null;
        for (const h of hits) {
          if (h.object.userData.kind === 'water' && !isClick) continue;   // hover 穿透海面
          const p = h.point, u = h.object.userData;
          const off = h.object.position.y;   // 層間分離時還原位移
          info = { x: p.x, y: -p.z, z: -(p.y - off * state.ve) / state.ve, object: u, mesh: h.object, screen: { x: e.clientX - r.left, y: e.clientY - r.top } };
          break;
        }
        // 點選未命中物件：改取與地面（z=0）的交點，仍在模型範圍內則視為地面點（供取點模式與虛擬鑽井）
        if (isClick && !info) {
          const p = new THREE.Vector3();
          if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) {
            const hx = state.extent[0] / 2, hy = state.extent[1] / 2;
            if (Math.abs(p.x) <= hx && Math.abs(-p.z) <= hy) info = { x: p.x, y: -p.z, z: 0, object: { kind: 'ground' }, mesh: null, screen: { x: e.clientX - r.left, y: e.clientY - r.top } };
          }
        }
        if (isClick) { if (state.clickCb) state.clickCb(info); }
        else if (state.hoverCb) state.hoverCb(info);
      };
      if (isClick) run(); else if (!pickPending) pickPending = requestAnimationFrame(run);
    }

    // ---- 建構 ----
    function disposeGroup(gp) { for (const o of [...gp.children]) { gp.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } } }
    function makeGeometry(m) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(m.positions.length), nrm = new Float32Array(m.normals.length);
      for (let i = 0; i < m.positions.length; i += 3) {
        pos[i] = m.positions[i]; pos[i + 1] = -m.positions[i + 2]; pos[i + 2] = -m.positions[i + 1];
        nrm[i] = m.normals[i]; nrm[i + 1] = -m.normals[i + 2]; nrm[i + 2] = -m.normals[i + 1];
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      return geo;
    }
    const PROP_KEYS = ['phi', 'perm', 'ntg', 'vsh', 'gr', 'sw', 'sg', 'rhob', 'vp', 'ai'];
    function ensureProps(mesh) {
      const u = mesh.userData; if (u.props || !state.sampler) return;
      const m = u.src, n = m.positions.length / 3, arr = new Float32Array(n * PROP_KEYS.length);
      for (let v = 0; v < n; v++) {
        const p = state.sampler.propsAt(u.formation, m.positions[v * 3], m.positions[v * 3 + 1], m.zrel[v]);
        for (let k = 0; k < PROP_KEYS.length; k++) arr[v * PROP_KEYS.length + k] = p[PROP_KEYS[k]];
      }
      u.props = arr;
    }
    function refreshSaturation(mesh, L) {
      const u = mesh.userData; if (!u.props || u.formation !== L || !state.sampler) return;
      const m = u.src, n = m.positions.length / 3, S = PROP_KEYS.length;
      for (let v = 0; v < n; v++) {
        const p = state.sampler.propsAt(u.formation, m.positions[v * 3], m.positions[v * 3 + 1], m.zrel[v]);
        u.props[v * S + 5] = p.sw; u.props[v * S + 6] = p.sg; u.props[v * S + 7] = p.rhob; u.props[v * S + 8] = p.vp; u.props[v * S + 9] = p.ai;
      }
    }
    function applyColors(mesh) {
      const u = mesh.userData, m = u.src, n = m.positions.length / 3, P = window.CCSPetro;
      let attr = mesh.geometry.getAttribute('color');
      if (!attr || attr.count !== n) { attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3); mesh.geometry.setAttribute('color', attr); }
      const arr = attr.array, base = new THREE.Color(u.baseColor), mode = state.colorMode;
      const isSurf = u.formation === 0 && state.model && state.model.site.surface && state.model.site.surface.kind !== 'onshore';
      const sea = new THREE.Color('#8fb8dc'), deep = new THREE.Color('#5a8fc0');
      const useProps = mode !== 'lithology' && u.props;
      const petro = state.sampler ? state.sampler.petro[u.formation] : null;
      for (let v = 0; v < n; v++) {
        let r = base.r, g = base.g, b = base.b;
        if (isSurf && v < m.topCount && !state.model.landInfo(m.positions[v * 3], m.positions[v * 3 + 1]).land) {
          const t = Math.min(1, Math.max(0, m.positions[v * 3 + 2] / 60)), c = sea.clone().lerp(deep, t); r = c.r; g = c.g; b = c.b;
        } else if (useProps) {
          const o = v * PROP_KEYS.length, props = {};
          for (let k = 0; k < PROP_KEYS.length; k++) props[PROP_KEYS[k]] = u.props[o + k];
          const c = P.colorFor(mode, props);
          if (c) { r = c[0]; g = c[1]; b = c[2]; }
        } else if (u.props && petro) {
          const sh = P.lithoShade({ phi: u.props[v * PROP_KEYS.length] }, petro); r *= sh; g *= sh; b *= sh;
        }
        arr[v * 3] = r; arr[v * 3 + 1] = g; arr[v * 3 + 2] = b;
      }
      attr.needsUpdate = true; state.dirty = true;
    }

    function buildLayers(meshes) {
      disposeGroup(groups.layers); disposeGroup(groups.faults); state.selected = null;
      const model = state.model, strat = model.strat;
      for (const m of meshes.layers) {
        const f = strat[m.formation];
        const geo = makeGeometry(m);
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: true, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { kind: 'layer', formation: m.formation, block: m.block, name: f.name, src: m, baseColor: f.color, props: null };
        const vis = state.layerVisible[m.formation] !== false, op = state.layerOpacity[m.formation] != null ? state.layerOpacity[m.formation] : 1;
        mesh.visible = vis; mat.opacity = op; mat.transparent = op < 1; mat.depthWrite = op >= 0.999;
        mesh.position.y = -m.formation * state.explode;
        if (state.colorMode !== 'lithology') ensureProps(mesh);
        applyColors(mesh);
        groups.layers.add(mesh);
      }
      for (const fm of meshes.faults) {
        const geo = makeGeometry(fm);
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xb0413e, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.userData = { kind: 'fault', index: fm.index, name: fm.def.name, def: fm.def };
        mesh.visible = state.faultsVisible; mesh.renderOrder = 2;
        groups.faults.add(mesh);
      }
      state.dirty = true;
    }

    function buildFrame() {
      disposeGroup(groups.frame); disposeGroup(groups.water);
      const [Lx, Ly] = state.extent, hx = Lx / 2, hy = Ly / 2, zTop = -Math.max(250, Lx * 0.03), zBot = state.depthMax;
      const pts = [];
      const corner = (x, y, z) => new THREE.Vector3(...toV(x, y, z));
      const box = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
      for (let i = 0; i < 4; i++) {
        const a = box[i], b = box[(i + 1) % 4];
        pts.push(corner(a[0], a[1], zTop), corner(b[0], b[1], zTop), corner(a[0], a[1], zBot), corner(b[0], b[1], zBot), corner(a[0], a[1], zTop), corner(a[0], a[1], zBot));
      }
      const step = zBot > 6000 ? 1000 : 500, tick = Lx * 0.012;
      for (const [x, y, dir] of [[-hx, -hy, -1], [hx, hy, 1]]) for (let z = 0; z <= zBot; z += step) {
        pts.push(corner(x, y, z), corner(x + dir * tick, y, z));
        if (z % 1000 === 0) { const sp = textSprite(z + ' m', { color: tk().ink2, scale: Lx * 0.03 }); sp.position.set(...toV(x + dir * tick * 3.2, y, z)); groups.frame.add(sp); }
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      groups.frame.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x898781 })));
      const n0 = corner(0, hy, zTop), n1 = corner(0, hy + Ly * 0.06, zTop);
      groups.frame.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([n0, n1]), new THREE.LineBasicMaterial({ color: tk().line })));
      const nl = textSprite('N', { color: tk().ink, scale: Lx * 0.045 }); nl.position.copy(n1).add(new THREE.Vector3(0, 0, -Ly * 0.03)); groups.frame.add(nl);
      const el2 = textSprite('E', { color: tk().ink2, scale: Lx * 0.035 }); el2.position.set(...toV(hx + Lx * 0.05, 0, zTop)); groups.frame.add(el2);
      const sc = textSprite((Lx / 1000).toFixed(0) + ' km × ' + (Ly / 1000).toFixed(0) + ' km，VE ×' + state.ve.toFixed(1), { color: tk().ink2, scale: Lx * 0.03 });
      sc.position.set(...toV(-hx * 0.6, -hy - Ly * 0.07, zBot)); groups.frame.add(sc);
      if (state.model && state.model.site.surface && state.model.site.surface.kind !== 'onshore') {
        const cb = clipBox(), wx = cb.xmax - cb.xmin, wy = cb.ymax - cb.ymin;
        const pg = new THREE.PlaneGeometry(wx, wy); pg.rotateX(-Math.PI / 2);
        const water = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: 0x5b93c9, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
        water.position.set((cb.xmin + cb.xmax) / 2, 0, -(cb.ymin + cb.ymax) / 2); water.renderOrder = 3; water.userData = { kind: 'water' };
        water.visible = state.waterVisible;
        groups.water.add(water);
      }
      state.dirty = true;
    }

    function setVE(ve) { state.ve = ve; root.scale.set(1, ve, 1); buildFrame(); state.dirty = true; }
    function setExplode(gap) {
      state.explode = gap;
      for (const o of groups.layers.children) o.position.y = -o.userData.formation * gap;
      const L = state.plume && state.plume.L != null ? state.plume.L : null;
      for (const o of groups.plume.children) o.position.y = L != null ? -L * gap : 0;
      for (const o of groups.lines.children) o.position.y = L != null ? -L * gap : 0;
      state.dirty = true;
    }

    function wellPath(wl) {
      const pts = [], n = 32;
      for (let k = 0; k <= n; k++) {
        const f = k / n, z = wl.top + (wl.base - wl.top) * f;
        let ox = 0, oy = 0;
        if (wl.deviation) { const s = Math.max(0, (f - 0.35) / 0.65), ss = s * s * (3 - 2 * s); ox = wl.deviation.east * ss; oy = wl.deviation.north * ss; }
        pts.push(new THREE.Vector3(...toV(wl.x + ox, wl.y + oy, z)));
      }
      return pts;
    }
    function setWells(list) {
      disposeGroup(groups.wells);
      const Lx = state.extent[0], r = Lx * 0.0022;
      for (const wl of (list || [])) {
        const inj = wl.type !== 'observation';
        const col = wl.color ? new THREE.Color(wl.color) : (inj ? 0x2b2b2b : 0x2a78d6);
        const pts = wellPath(wl);
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, r, 10, false), new THREE.MeshLambertMaterial({ color: col }));
        tube.userData = { kind: 'well', well: wl }; groups.wells.add(tube);
        if (wl.perfTop != null && wl.perfBase != null && wl.perfBase > wl.perfTop) {
          const seg = pts.filter(p => { const z = -p.y; return z >= wl.perfTop - 5 && z <= wl.perfBase + 5; });
          if (seg.length > 1) {
            const pm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), 16, r * 2.2, 10, false), new THREE.MeshLambertMaterial({ color: inj ? 0xe34948 : 0x1baf7a }));
            pm.userData = { kind: 'well', well: wl }; groups.wells.add(pm);
          }
        }
        const head = new THREE.Mesh(new THREE.ConeGeometry(r * 4, Lx * 0.03, 12), new THREE.MeshLambertMaterial({ color: inj ? tk().line : 0x2a78d6 }));
        head.position.set(...toV(wl.x, wl.y, wl.top - Lx * 0.035)); head.userData = { kind: 'well', well: wl }; groups.wells.add(head);
        const lb = textSprite(wl.name || 'INJ', { color: inj ? tk().ink : tk().obs, scale: Lx * (inj ? 0.035 : 0.028) }); lb.position.set(...toV(wl.x, wl.y, wl.top - Lx * 0.07)); groups.wells.add(lb);
      }
      state.dirty = true;
    }
    function setMonitors(list) {
      disposeGroup(groups.monitors);
      const Lx = state.extent[0];
      for (const m of (list || [])) {
        const col = MONITOR_COLORS[m.kind] || 0x898781;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(Lx * 0.006, Lx * 0.02, 6), new THREE.MeshLambertMaterial({ color: col }));
        cone.position.set(...toV(m.x, m.y, m.z - Lx * 0.01)); cone.userData = { kind: 'monitor', monitor: m }; groups.monitors.add(cone);
        const lb = textSprite(m.id, { color: tk().ink2, scale: Lx * 0.024 }); lb.position.set(...toV(m.x, m.y, m.z - Lx * 0.035)); groups.monitors.add(lb);
      }
      state.dirty = true;
    }
    function setVectors(list) {
      disposeGroup(groups.vectors);
      for (const v of (list || [])) {
        const pts = v.points.map(p => new THREE.Vector3(...toV(p.x, p.y, p.z - 4)));
        if (v.closed && pts.length) pts.push(pts[0].clone());
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(v.color || '#1baf7a') }));
        line.userData = { kind: 'vector', vector: v }; groups.vectors.add(line);
      }
      state.dirty = true;
    }
    function setSectionLine(a, b, surfaceZ) {
      for (const o of [...groups.section.children]) if (!o.userData.pickMarker) { groups.section.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
      if (!a) { state.dirty = true; return; }
      const Lx = state.extent[0];
      const mark = (p, label) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(Lx * 0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xeb6834, depthTest: false }));
        s.position.set(...toV(p.x, p.y, surfaceZ(p.x, p.y) - 5)); s.renderOrder = 20; groups.section.add(s);
        const lb = textSprite(label, { color: '#eb6834', scale: Lx * 0.045 }); lb.position.set(...toV(p.x, p.y, surfaceZ(p.x, p.y) - Lx * 0.05)); groups.section.add(lb);
      };
      mark(a, 'A');
      if (b) {
        mark(b, 'A′');
        const pts = []; for (let k = 0; k <= 40; k++) { const x = a.x + (b.x - a.x) * k / 40, y = a.y + (b.y - a.y) * k / 40; pts.push(new THREE.Vector3(...toV(x, y, surfaceZ(x, y) - 6))); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xeb6834, dashSize: Lx * 0.01, gapSize: Lx * 0.006, depthTest: false }));
        line.computeLineDistances(); line.renderOrder = 20; groups.section.add(line);
      }
      state.dirty = true;
    }
    function setPickMarker(p) {
      for (const o of [...groups.section.children]) if (o.userData.pickMarker) { groups.section.remove(o); o.geometry.dispose(); o.material.dispose(); }
      if (!p) { state.dirty = true; return; }
      const Lx = state.extent[0];
      const m = new THREE.Mesh(new THREE.CylinderGeometry(Lx * 0.004, Lx * 0.004, state.depthMax * 1.05, 8), new THREE.MeshBasicMaterial({ color: 0x1baf7a, transparent: true, opacity: 0.8 }));
      m.position.set(...toV(p.x, p.y, state.depthMax * 0.5)); m.userData = { pickMarker: true }; groups.section.add(m);
      state.dirty = true;
    }

    function setPlume(pl) {
      state.plume = pl;
      disposeGroup(groups.plume); disposeGroup(groups.lines);
      if (!pl) { state.dirty = true; return; }
      const nr = 30, na = 64, pos = [], idx = [];
      const rr = k => pl.rMax * Math.pow(k / nr, 0.75);
      const ang = j => j / na * Math.PI * 2;
      for (let k = 0; k <= nr; k++) for (let j = 0; j < na; j++) {
        const r = rr(k), [x, y] = clampXY(pl.center.x + r * Math.cos(ang(j)), pl.center.y + r * Math.sin(ang(j)));
        pos.push(...toV(x, y, pl.zTop(x, y) + 1.5));
      }
      const off = (nr + 1) * na;
      for (let k = 0; k <= nr; k++) for (let j = 0; j < na; j++) {
        const r = rr(k), [x, y] = clampXY(pl.center.x + r * Math.cos(ang(j)), pl.center.y + r * Math.sin(ang(j)));
        pos.push(...toV(x, y, pl.zTop(x, y) + 1.5 + pl.thickness(r)));
      }
      for (let k = 0; k < nr; k++) for (let j = 0; j < na; j++) {
        const a = k * na + j, b = k * na + (j + 1) % na, c = (k + 1) * na + (j + 1) % na, d = (k + 1) * na + j;
        idx.push(a, c, b, a, d, c);
        idx.push(off + a, off + b, off + c, off + a, off + c, off + d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xeb6834, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      mesh.userData = { kind: 'plume' }; mesh.renderOrder = 1;
      groups.plume.add(mesh);
      const ring = (cx, cy, r, color, dz) => {
        if (!(r > 0)) return;
        const p = []; for (let j = 0; j <= 96; j++) { const [x, y] = clampXY(cx + r * Math.cos(j / 96 * Math.PI * 2), cy + r * Math.sin(j / 96 * Math.PI * 2)); p.push(new THREE.Vector3(...toV(x, y, pl.zTop(x, y) - dz))); }
        groups.lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color })));
      };
      const hx = state.extent[0] / 2, hy = state.extent[1] / 2;
      ring(pl.center.x, pl.center.y, pl.rMax, 0xeb6834, 4);
      if (pl.rInf) ring(pl.well.x, pl.well.y, Math.min(pl.rInf, Math.hypot(hx, hy) * 2), 0x2a78d6, 6);
      if (pl.path && pl.path.length > 1) {
        const p = pl.path.map(q => { const [x, y] = clampXY(q.x, q.y); return new THREE.Vector3(...toV(x, y, q.z - 6)); });
        groups.lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: tk().line })));
        const end = pl.path[pl.path.length - 1];
        const sp = textSprite('浮力運移 ' + (pl.migrationLabel || ''), { color: tk().ink, scale: state.extent[0] * 0.03 }); sp.position.set(...toV(end.x, end.y, end.z - state.extent[0] * 0.03)); groups.lines.add(sp);
      }
      setExplode(state.explode);
      state.dirty = true;
    }

    function homeFor(kind) {
      const [Lx, Ly] = state.extent;
      const target = new THREE.Vector3(0, -state.depthMax * 0.45 * state.ve, 0);
      const dist = Math.max(Lx, Ly, state.depthMax * state.ve * 1.2) * 2.3;
      const v = { target, dist, theta: 0.7, phi: 1.05 };
      if (kind === 'top') { v.theta = 0; v.phi = 0.05; }
      else if (kind === 'north') { v.theta = 0; v.phi = 1.35; }
      // θ 為相機相對目標的方位（θ=0 在南側朝北看）；向東看須把相機放在西側（θ=−π/2）
      else if (kind === 'east') { v.theta = -Math.PI / 2; v.phi = 1.35; }
      else if (kind === 'west') { v.theta = Math.PI / 2; v.phi = 1.35; }
      return v;
    }
    function flyTo(to, immediate) {
      const dest = { target: to.target ? new THREE.Vector3(to.target.x, -(to.target.z || 0) * state.ve, -to.target.y) : ctl.target.clone(),
        dist: to.dist != null ? to.dist : ctl.dist, theta: to.theta != null ? to.theta : ctl.theta, phi: to.phi != null ? to.phi : ctl.phi };
      if (to.targetThree) dest.target = to.targetThree;
      while (dest.theta - ctl.theta > Math.PI) dest.theta -= Math.PI * 2;
      while (dest.theta - ctl.theta < -Math.PI) dest.theta += Math.PI * 2;
      if (immediate) { ctl.target.copy(dest.target); ctl.dist = dest.dist; ctl.theta = dest.theta; ctl.phi = dest.phi; flight = null; applyCamera(); return; }
      flight = { t: 0, from: { target: ctl.target.clone(), dist: ctl.dist, theta: ctl.theta, phi: ctl.phi }, to: dest };
    }
    function setView(kind, immediate) { const h = homeFor(kind); flyTo({ targetThree: h.target, dist: h.dist, theta: h.theta, phi: h.phi }, immediate); }

    function setSelection(mesh) {
      if (state.selected && state.selected.material && state.selected.material.emissive) state.selected.material.emissive.setHex(0x000000);
      state.selected = mesh || null;
      if (mesh && mesh.material && mesh.material.emissive) mesh.material.emissive.setHex(0x2f6fff).multiplyScalar(0.35);
      state.dirty = true;
    }

    return {
      setModel(model, meshes, clip) {
        state.model = model; state.extent = model.site.model.extent; state.depthMax = model.grid.depthMax;
        state.layerVisible = {}; state.layerOpacity = {}; state.clip = clip || null; state.plume = null; state.sampler = null;
        disposeGroup(groups.plume); disposeGroup(groups.lines); disposeGroup(groups.section); disposeGroup(groups.wells); disposeGroup(groups.monitors); disposeGroup(groups.vectors);
        buildLayers(meshes); buildFrame(); setVE(state.ve); setView('iso', true);
      },
      updateMeshes(meshes, clip) { state.clip = clip || null; buildLayers(meshes); buildFrame(); if (state.plume) setPlume(state.plume); },
      setLayerVisible(i, v) { state.layerVisible[i] = v; for (const o of groups.layers.children) if (o.userData.formation === i) o.visible = v; state.dirty = true; },
      setLayerOpacity(i, a) { state.layerOpacity[i] = a; for (const o of groups.layers.children) if (o.userData.formation === i) { o.material.opacity = a; o.material.transparent = true; o.material.depthWrite = a >= 0.999; o.material.needsUpdate = true; } state.dirty = true; },
      setFaultsVisible(v) { state.faultsVisible = v; for (const o of groups.faults.children) o.visible = v; state.dirty = true; },
      setWaterVisible(v) { state.waterVisible = v; for (const o of groups.water.children) o.visible = v; state.dirty = true; },
      setGroupVisible(name, v) { if (groups[name]) { groups[name].visible = v; state.dirty = true; } },
      setSampler(sampler) { state.sampler = sampler; for (const o of groups.layers.children) o.userData.props = null; for (const o of groups.layers.children) { if (state.colorMode !== 'lithology') ensureProps(o); applyColors(o); } },
      setColorMode(key) { state.colorMode = key; for (const o of groups.layers.children) { if (key !== 'lithology') ensureProps(o); applyColors(o); } },
      refreshSaturation(L) { for (const o of groups.layers.children) if (o.userData.formation === L && o.userData.props) { refreshSaturation(o, L); if (state.colorMode !== 'lithology') applyColors(o); } },
      setVE, setExplode, setWells, setMonitors, setVectors, setPlume, setSectionLine, setPickMarker, setView, flyTo, resize, setSelection,
      setAutoRotate(v) { state.autoRotate = v; state.dirty = true; },
      setTheme(mode) { theme = mode === 'dark' ? 'dark' : 'light'; renderer.setClearColor(tk().clear, 1); buildFrame(); state.dirty = true; },
      snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
      cameraInfo,
      onHover(fn) { state.hoverCb = fn; }, onClick(fn) { state.clickCb = fn; }, onCamera(fn) { state.cameraCb = fn; },
      get ve() { return state.ve; }, get colorMode() { return state.colorMode; }
    };
  }
  return { create };
})();
