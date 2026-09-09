window.CCS3D = window.CCS3D || {};
(function () {
'use strict';
const { Scene3D } = window.CCS3D;
const { Map2D } = window.CCS3D;
const { initUI, renderInfo, profileFromLonLat } = window.CCS3D;

/**
 * 應用進入點：建立 3D 場景與 2D 圖台，完成雙向串接。
 */


function fatal(msg) {
  document.body.innerHTML = `<div style="padding:40px;font-family:system-ui;color:#e7eef7;background:#070c13;height:100%">
    <h2 style="color:#ff7a1a">無法啟動圖台</h2><p>${msg}</p></div>`;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function boot() {
  if (!window.L) {
    fatal('Leaflet 未載入，請確認 ../shared/vendor/leaflet/leaflet.js 檔案存在。');
    return;
  }
  if (!window.THREE) {
    fatal('Three.js 未載入，請確認 ../shared/vendor/three/three.js 檔案存在。');
    return;
  }
  if (!hasWebGL()) {
    fatal('此瀏覽器未啟用 WebGL，無法顯示 3D 地質模型。');
    return;
  }

  const scene = new Scene3D(document.getElementById('view3d')).init();
  window.CCS.viewer = scene;   // 供 analysis / petro 等共用模組取用

  const map = new Map2D('view2d', {
    onMove: ({ lat, lon, zoom }) => scene.updateSurface({ lat, lon, zoom }),
    onSelectWell: (id) => {
      scene.flyToWell(id);
      const btn = document.querySelector('#mode-seg button[data-mode="3d"]');
      if (btn && !btn.classList.contains('active')) btn.click();
    },
    onClickPoint: ({ lat, lon }) => renderInfo(profileFromLonLat(lon, lat))
  });

  initUI(scene, map);

  // 圖台初始化後對齊一次地表瓦片範圍
  const v = map.getView();
  scene.updateSurface({ lat: v.lat, lon: v.lon, zoom: v.zoom });
  map.invalidate();

  window.CCS_DEBUG = { scene, map };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
