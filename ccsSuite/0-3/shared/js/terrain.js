window.CCS = window.CCS || {};
(function () {
'use strict';

const THREE = window.THREE;
const { SITE, VIEW, BASEMAPS } = window.CCS;
const { lonToTileX, latToTileY, tileXToLon, tileYToLat, lonLatToWorld, tileUrl,
  modelRadius, horizonElev } = window.CCS;

/**
 * 地表底圖。
 *
 * 作法：把 N×N 張 XYZ 瓦片先畫進單一 canvas，再以 destination-in 用塊體的
 * 不規則輪廓做遮罩，最後包成一張 CanvasTexture 貼在同形狀的地表網格上。
 * 相較「每張瓦片一個 Mesh + clipping plane」，此法可貼合任意輪廓，
 * 且整個地表只需一次 draw call。
 *
 * 若瓦片來源缺少 CORS 標頭導致 canvas 被污染（tainted），
 * WebGL 上傳材質會拋 SecurityError；本模組會在上傳前主動偵測，
 * 偵測到污染時改用程序式地形材質，確保 file:// 下永遠可以顯示。
 */

const TILE_PX = 256;

/** 地表輪廓＝模型塊體邊界，與各地層完全切齊 */
function terrainRadius(theta) {
  return modelRadius(theta);
}

function terrainOutline(count = 192) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    const r = terrainRadius(th);
    pts.push({ x: Math.cos(th) * r, z: Math.sin(th) * r, theta: th, r });
  }
  return pts;
}

/** 產生地表網格（極座標，與地層同構，頂面貼合 H0 界面起伏） */
function buildTerrainGeometry() {
  const rings = VIEW.rings;
  const sectors = VIEW.sectors;
  const pos = [];
  const uv = [];
  const idx = [];

  // UV 以「世界座標 → 瓦片圖框」的線性映射計算，於 buildTerrain 內填入
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let j = 0; j < sectors; j++) {
    const th = (j / sectors) * Math.PI * 2;
    const r = terrainRadius(th);
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
  }

  function vert(theta, t) {
    const r = terrainRadius(theta) * t;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = horizonElev(0, x, z);
    pos.push(x, y, z);
    uv.push(0, 0); // 佔位，稍後以 setTerrainUV 依實際圖框重算
  }

  vert(0, 0);
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < sectors; j++) vert((j / sectors) * Math.PI * 2, i / rings);
  }

  const ri = (i, j) => 1 + (i - 1) * sectors + (j % sectors);
  for (let j = 0; j < sectors; j++) idx.push(0, ri(1, j + 1), ri(1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      idx.push(ri(i, j), ri(i, j + 1), ri(i + 1, j),
        ri(i, j + 1), ri(i + 1, j + 1), ri(i + 1, j));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** 依圖框世界範圍重算 UV */
function setTerrainUV(geo, frame) {
  const p = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    uv.setXY(i, (x - frame.minX) / (frame.maxX - frame.minX),
      1 - (z - frame.minZ) / (frame.maxZ - frame.minZ));
  }
  uv.needsUpdate = true;
}

/** 判斷 canvas 是否被跨域影像污染 */
function isTainted(canvas) {
  try {
    canvas.getContext('2d').getImageData(0, 0, 1, 1);
    return false;
  } catch (e) {
    return true;
  }
}

/** 程序式地形材質（無網路或 CORS 失敗時的回退） */
function proceduralCanvas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#3f5b46');
  g.addColorStop(0.45, '#5c7350');
  g.addColorStop(1, '#7d8a63');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  // 疊上柔和雜訊，避免整片死板
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 26;
    c.fillStyle = `rgba(${20 + Math.random() * 60 | 0},${50 + Math.random() * 70 | 0},${30 + Math.random() * 50 | 0},0.05)`;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  return cv;
}

/** 在 canvas 上以不規則輪廓做遮罩（destination-in） */
function applyOutlineMask(canvas, frame) {
  const c = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  c.save();
  c.globalCompositeOperation = 'destination-in';
  c.beginPath();
  const pts = terrainOutline(256);
  pts.forEach((p, i) => {
    const px = ((p.x - frame.minX) / (frame.maxX - frame.minX)) * w;
    const py = ((p.z - frame.minZ) / (frame.maxZ - frame.minZ)) * h;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  });
  c.closePath();
  c.fillStyle = '#fff';
  c.fill();
  c.restore();
}

/**
 * 建立地表。
 * @param {string} basemapKey BASEMAPS 的鍵
 * @param {function} onStatus 進度回呼 (loaded, total, mode)
 * @returns {{mesh: THREE.Mesh, setBasemap: function, frame: object}}
 */
function buildTerrain(basemapKey, onStatus) {
  const z = VIEW.tileZoom;
  const cx = lonToTileX(SITE.lon, z);
  const cy = latToTileY(SITE.lat, z);
  const rad = VIEW.tileRadius;
  const x0 = Math.floor(cx) - rad;
  const y0 = Math.floor(cy) - rad;
  const n = rad * 2 + 1;

  // 圖框世界範圍（以瓦片邊界為準，確保像素與地理精確對應）
  const nw = lonLatToWorld(tileXToLon(x0, z), tileYToLat(y0, z));
  const se = lonLatToWorld(tileXToLon(x0 + n, z), tileYToLat(y0 + n, z));
  const frame = { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z };

  const geo = buildTerrainGeometry();
  setTerrainUV(geo, frame);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n * TILE_PX;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#26333f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearFilter;

  const mat = new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.96, metalness: 0.0, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.renderOrder = 0;

  let token = 0;

  function setBasemap(key) {
    const myToken = ++token;
    const src = BASEMAPS[key] || BASEMAPS.imagery;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#26333f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let loaded = 0;
    let failed = 0;
    const total = n * n;
    let finished = false;

    function done() {
      if (finished || myToken !== token) return;
      finished = true;
      if (failed === total || isTainted(canvas)) {
        // 全數失敗（離線）或被污染 → 改用程序式地形
        const proc = proceduralCanvas(canvas.width);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(proc, 0, 0);
        applyOutlineMask(canvas, frame);
        texture.needsUpdate = true;
        if (onStatus) onStatus(total, total, failed === total ? 'offline' : 'tainted');
        return;
      }
      applyOutlineMask(canvas, frame);
      texture.needsUpdate = true;
      if (onStatus) onStatus(total - failed, total, 'tiles');
    }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const tx = x0 + i;
        const ty = y0 + j;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (myToken !== token) return;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(img, i * TILE_PX, j * TILE_PX, TILE_PX, TILE_PX);
          loaded++;
          texture.needsUpdate = true;
          if (onStatus) onStatus(loaded, total, 'loading');
          if (loaded + failed === total) done();
        };
        img.onerror = () => {
          if (myToken !== token) return;
          failed++;
          if (loaded + failed === total) done();
        };
        img.src = tileUrl(src.url, tx, ty, z);
      }
    }

    // 保險：8 秒後不論結果先套遮罩，避免離線時卡住不顯示
    setTimeout(() => { if (myToken === token) done(); }, 8000);
  }

  setBasemap(basemapKey);

  return { mesh, setBasemap, frame, outline: terrainOutline };
}

Object.assign(window.CCS, {
  buildTerrain, terrainRadius, terrainOutline, buildTerrainGeometry, proceduralCanvas
});
})();
