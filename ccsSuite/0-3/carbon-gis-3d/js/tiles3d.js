window.CCS3D = window.CCS3D || {};
(function () {
'use strict';
const THREE = window.THREE;
const { BASEMAPS, SITE, VIEW } = window.CCS3D;
const { lonToTileX, latToTileY, tileBoundsWorld, tileUrl, MERCATOR_SCALE } = window.CCS3D;
const C = window.CCS3D;

/* 依模型不規則輪廓遮罩地表瓦片：把 r(θ) 烘成 LUT 貼圖，於片段著色器內 discard */
const MASK_ON = { value: 1 };
const MASK_MAX = { value: 1 };
const MASK_LUT = { value: null };

function buildOutlineLUT() {
  const n = 1024;
  const rs = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    rs[i] = C.modelRadius((i / n) * Math.PI * 2 - Math.PI);
    if (rs[i] > max) max = rs[i];
  }
  max *= 1.02;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round((rs[i] / max) * 65535);
    data[i * 4] = v >> 8;
    data[i * 4 + 1] = v & 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  MASK_LUT.value = tex;
  MASK_MAX.value = max;
}

function applyOutlineMask(mat) {
  if (!MASK_LUT.value) buildOutlineLUT();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMaskLUT = MASK_LUT;
    shader.uniforms.uMaskMax = MASK_MAX;
    shader.uniforms.uMaskOn = MASK_ON;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMaskPos;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vMaskPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vMaskPos;\nuniform sampler2D uMaskLUT;\nuniform float uMaskMax;\nuniform float uMaskOn;')
      .replace('#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  if (uMaskOn > 0.5) {
    float th = atan(vMaskPos.z, vMaskPos.x);
    vec4 e = texture2D(uMaskLUT, vec2(th / 6.283185307 + 0.5, 0.5));
    float rr = (e.r * 255.0 * 256.0 + e.g * 255.0) / 65535.0 * uMaskMax;
    if (length(vMaskPos.xz) > rr) discard;
  }`);
  };
}

/** 地表瓦片是否裁切至模型不規則輪廓 */
function setOutlineMask(on) { MASK_ON.value = on ? 1 : 0; }

/**
 * 3D 地表瓦片：把 GIS 圖台的底圖瓦片以正確的地理範圍貼在 Y = 0 的地表平面，
 * 使地下地質模型與圖台共用同一組平面座標，達成「模型嵌入圖台 Z 軸」。
 */


const SURFACE_Y = 2; // 略高於地層頂面，避免 z-fighting

class SurfaceTiles {
  /**
   * @param {THREE.Plane[]} clipPlanes 與地層共用的剖切平面
   * @param {number} anisotropy renderer.capabilities.getMaxAnisotropy()
   */
  constructor(clipPlanes, anisotropy = 4) {
    this.group = new THREE.Group();
    this.group.name = 'surface-tiles';
    this.clipPlanes = clipPlanes;
    this.anisotropy = anisotropy;
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this.opacity = 1;
    this.key = null;
    this.pending = 0;
    this.onProgress = null;
  }

  /** 依緯度與縮放層級計算單張瓦片的地表寬度（公尺） */
  static tileSizeMeters(zoom) {
    return (40075016.686 * MERCATOR_SCALE) / Math.pow(2, zoom);
  }

  /** 自動計算需要的瓦片圈數，確保覆蓋整個模型範圍 */
  static autoRadius(zoom) {
    const size = SurfaceTiles.tileSizeMeters(zoom);
    return Math.min(8, Math.max(1, Math.ceil(SITE.halfExtent / size) + 1));
  }

  /**
   * 重建地表瓦片。
   * @param {{lat:number, lon:number, zoom:number, basemap:string}} view
   */
  update({ lat, lon, zoom, basemap }) {
    const z = Math.round(zoom);
    const cx = Math.floor(lonToTileX(lon, z));
    const cy = Math.floor(latToTileY(lat, z));
    const key = `${basemap}/${z}/${cx}/${cy}`;
    if (key === this.key) return false;
    this.key = key;

    this.clear();

    const cfg = BASEMAPS[basemap] || BASEMAPS.imagery;
    const r = SurfaceTiles.autoRadius(z);
    const n = Math.pow(2, z);
    const tiles = [];

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = ((cx + dx) % n + n) % n;
        const ty = cy + dy;
        if (ty < 0 || ty >= n) continue;
        tiles.push({ tx, ty, bounds: tileBoundsWorld(cx + dx, ty, z) });
      }
    }

    this.pending = tiles.length;
    this.notify();

    tiles.forEach(({ tx, ty, bounds }) => {
      const geo = new THREE.PlaneGeometry(bounds.width, bounds.height);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x33414f,
        transparent: true,
        opacity: this.opacity,
        depthWrite: true,
        side: THREE.DoubleSide,
        clippingPlanes: this.clipPlanes,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const mesh = new THREE.Mesh(geo, mat);
      applyOutlineMask(mat);
      mesh.position.set(bounds.centerX, SURFACE_Y, bounds.centerZ);
      mesh.renderOrder = 1;
      mesh.userData = { kind: 'surface', id: `tile-${z}/${tx}/${ty}`, title: '地表底圖', rows: [], note: '' };
      this.group.add(mesh);

      const url = tileUrl(cfg.url, tx, ty, z);
      this.loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.anisotropy;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.generateMipmaps = true;
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
          this.pending--;
          this.notify();
        },
        undefined,
        () => {
          this.pending--;
          this.notify();
        }
      );
    });

    return true;
  }

  notify() {
    if (this.onProgress) this.onProgress(Math.max(0, this.pending));
  }

  setOpacity(v) {
    this.opacity = v;
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.material.opacity = v;
        o.material.visible = v > 0.02;
      }
    });
  }

  setVisible(v) {
    this.group.visible = v;
  }

  clear() {
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      const m = this.group.children[i];
      this.group.remove(m);
      m.geometry.dispose();
      if (m.material.map) m.material.map.dispose();
      m.material.dispose();
    }
  }
}

/** 地表輔助圖徵：場址邊界框與方位標示 */
function buildSurfaceHelpers() {
  const group = new THREE.Group();
  group.name = 'surface-helpers';
  const h = SITE.halfExtent;
  const y = SURFACE_Y + 1;

  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 256 }, (_, i) => {
        const th = (i / 256) * Math.PI * 2;
        const r = C.modelRadius(th);
        return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      })
    ),
    new THREE.LineBasicMaterial({ color: 0x62e0ff, transparent: true, opacity: 0.9 })
  );
  boundary.name = 'site-boundary';
  group.add(boundary);

  const grid = new THREE.GridHelper(h * 2, 12, 0x3f7ea8, 0x2a4a63);
  grid.position.y = y;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.name = 'surface-grid';
  group.add(grid);

  return group;
}


Object.assign(window.CCS3D, { SurfaceTiles, buildSurfaceHelpers, setOutlineMask, SURFACE_Y });
})();
