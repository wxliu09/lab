window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;

function fail(msg) {
  const el = document.getElementById('boot-error');
  if (el) {
    el.style.display = 'block';
    el.querySelector('.msg').textContent = msg;
  }
  console.error(msg);
}

function start() {
  if (!window.THREE) { fail('Three.js 未載入，請確認 ../shared/vendor/three/three.js 存在。'); return; }
  if (!window.L) { fail('Leaflet 未載入，請確認 ../shared/vendor/leaflet/leaflet.js 存在。'); return; }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) { fail('此瀏覽器未啟用 WebGL，無法顯示 3D 模型。'); return; }

  try {
    C.scene3d.init(document.getElementById('scene'), document.getElementById('label-root'));
    C.minimap.init(document.getElementById('minimap'), {
      onPick: (lat, lon) => {
        const w = C.lonLatToWorld(lon, lat);
        const info = C.scene3d.cameraInfo();
        C.scene3d.flyTo({
          target: new window.THREE.Vector3(w.x, C.scene3d.state.controls.target.y, w.z),
          bearing: info.bearing, pitch: info.pitch, distance: info.distance
        });
      }
    });
    C.ui.init();
    C.minimap.invalidate();

    document.getElementById('loading').classList.add('done');
    // 開場：緩慢環繞並拉近，展示 360° 能力
    C.scene3d.flyTo({ bearing: 318, pitch: 34, distance: 17000 });
    let t = 0;
    const intro = setInterval(() => {
      t += 1;
      C.scene3d.flyTo({ bearing: 318 + t * 1.5, pitch: 34 - t * 0.05, distance: 17000 - t * 66 });
      if (t >= 45) clearInterval(intro);
    }, 26);
    document.getElementById('scene').addEventListener('pointerdown', () => clearInterval(intro), { once: true });
  } catch (e) {
    fail('初始化失敗：' + (e && e.message ? e.message : e));
    throw e;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

// 除錯用
window.CCS_DEBUG = { get scene() { return C.scene3d.state; }, get map() { return C.minimap.map; } };
})();
