window.CCS3D = window.CCS3D || {};
(function () {
'use strict';
const { BASEMAPS, SITE, WELLS, MONITORS, FAULTS } = window.CCS3D;
const { worldToLonLat, lonLatToWorld } = window.CCS3D;
const C = window.CCS3D;

/**
 * Leaflet 2D GIS 圖台：底圖、場址範圍、井位、監測站、CO₂ 羽流足跡，
 * 並與 3D 場景雙向同步視域。
 */


const L = window.L;

class Map2D {
  constructor(elementId, handlers = {}) {
    this.handlers = handlers;
    this.silent = false;
    this.basemapKey = 'imagery';

    this.map = L.map(elementId, {
      center: [SITE.lat, SITE.lon],
      zoom: SITE.defaultZoom,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(this.map);

    this.baseLayers = {};
    Object.entries(BASEMAPS).forEach(([key, cfg]) => {
      this.baseLayers[key] = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
        crossOrigin: true
      });
    });
    this.baseLayers[this.basemapKey].addTo(this.map);

    this.layers = {
      boundary: this.#buildBoundary(),
      faults: this.#buildFaults(),
      plume: this.#buildPlume(),
      wells: this.#buildWells(),
      monitors: this.#buildMonitors(),
      camera: this.#buildCameraMarker()
    };
    Object.values(this.layers).forEach((l) => l.addTo(this.map));

    this.map.on('moveend zoomend', () => {
      if (this.silent) return;
      const c = this.map.getCenter();
      if (this.handlers.onMove) {
        this.handlers.onMove({ lat: c.lat, lon: c.lng, zoom: this.map.getZoom() });
      }
    });

    this.map.on('click', (e) => {
      if (this.handlers.onClickPoint) {
        this.handlers.onClickPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
    });
  }

  /* ---------------- 圖層建構 ---------------- */

  #buildBoundary() {
    const ring = [];
    for (let i = 0; i < 128; i++) {
      const th = (i / 128) * Math.PI * 2;
      const r = C.modelRadius(th);
      const p = worldToLonLat(Math.cos(th) * r, Math.sin(th) * r);
      ring.push([p.lat, p.lon]);
    }
    const poly = L.polygon(ring, {
      color: '#62e0ff', weight: 2, dashArray: '8 6',
      fill: true, fillColor: '#62e0ff', fillOpacity: 0.06
    });
    poly.bindTooltip('3D 地質模型範圍（不規則塊體輪廓）', { sticky: true });
    return L.layerGroup([poly]);
  }

  #buildFaults() {
    const group = L.layerGroup();
    FAULTS.forEach((f) => {
      const sr = (f.strike * Math.PI) / 180;
      const sx = Math.sin(sr);
      const sz = -Math.cos(sr);
      const ox = f.offsetEast;
      const oz = -f.offsetNorth;
      const a = worldToLonLat(ox - (sx * f.length) / 2, oz - (sz * f.length) / 2);
      const b = worldToLonLat(ox + (sx * f.length) / 2, oz + (sz * f.length) / 2);
      const line = L.polyline(
        [
          [a.lat, a.lon],
          [b.lat, b.lon]
        ],
        { color: '#ff4d6d', weight: 3, opacity: 0.85 }
      );
      line.bindTooltip(`${f.name}｜走向 N${f.strike}°E`, { sticky: true });
      group.addLayer(line);
    });
    return group;
  }

  #buildPlume() {
    const inj = WELLS.find((w) => w.type === 'injector');
    this.plumeCircle = L.circle([inj.lat, inj.lon], {
      radius: 400,
      color: '#35e0d0',
      weight: 2,
      fillColor: '#35e0d0',
      fillOpacity: 0.22
    });
    this.plumeCircle.bindTooltip('CO₂ 羽流地表投影範圍', { sticky: true });
    return L.layerGroup([this.plumeCircle]);
  }

  #buildWells() {
    const group = L.layerGroup();
    WELLS.forEach((w) => {
      const cls = w.type === 'injector' ? 'wm wm-inj' : 'wm wm-obs';
      const icon = L.divIcon({
        className: 'well-marker-wrap',
        html: `<span class="${cls}"></span><span class="wm-label">${w.id}</span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      const m = L.marker([w.lat, w.lon], { icon, title: w.name });
      m.bindPopup(
        `<b>${w.name}</b><br>井底深度 ${Math.abs(w.depth)} m<br>射孔 ${Math.abs(w.perf[0])}–${Math.abs(
          w.perf[1]
        )} m<br><small>${w.detail}</small><br><a href="#" data-fly="${w.id}">▶ 於 3D 檢視此井</a>`
      );
      m.on('popupopen', (e) => {
        const a = e.popup.getElement().querySelector('[data-fly]');
        if (a) {
          a.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.handlers.onSelectWell) this.handlers.onSelectWell(w.id);
          });
        }
      });

      // 斜井井底投影
      if (w.deviation) {
        const p = lonLatToWorld(w.lon, w.lat);
        const end = worldToLonLat(p.x + w.deviation.east, p.z - w.deviation.north);
        group.addLayer(
          L.polyline(
            [
              [w.lat, w.lon],
              [end.lat, end.lon]
            ],
            { color: '#2ec4ff', weight: 2, dashArray: '4 4', opacity: 0.9 }
          ).bindTooltip(`${w.id} 井軌跡水平投影`, { sticky: true })
        );
      }
      group.addLayer(m);
    });
    return group;
  }

  #buildMonitors() {
    const group = L.layerGroup();
    const colors = { flux: '#9be564', seismic: '#ffd166', water: '#5ac8fa', insar: '#d08bff' };
    MONITORS.forEach((m) => {
      const marker = L.circleMarker([m.lat, m.lon], {
        radius: 6,
        color: '#0b121b',
        weight: 2,
        fillColor: colors[m.kind],
        fillOpacity: 1
      });
      marker.bindTooltip(`${m.id}｜${m.name}`, { sticky: true });
      group.addLayer(marker);
    });
    return group;
  }

  #buildCameraMarker() {
    const icon = L.divIcon({
      className: 'cam-marker-wrap',
      html: '<span class="cam-marker"></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    this.cameraMarker = L.marker([SITE.lat, SITE.lon], { icon, interactive: false, zIndexOffset: 500 });
    this.cameraMarker.bindTooltip('3D 視角中心', { direction: 'top' });
    return L.layerGroup([this.cameraMarker]);
  }

  /* ---------------- 對外 API ---------------- */

  setBasemap(key) {
    if (!this.baseLayers[key] || key === this.basemapKey) return;
    this.map.removeLayer(this.baseLayers[this.basemapKey]);
    this.baseLayers[key].addTo(this.map);
    this.baseLayers[key].bringToBack();
    this.basemapKey = key;
  }

  setPlumeRadius(r) {
    this.plumeCircle.setRadius(Math.max(r, 0.1));
    const on = r > 1;
    this.plumeCircle.setStyle({ opacity: on ? 1 : 0, fillOpacity: on ? 0.22 : 0 });
  }

  setLayerVisible(name, on) {
    const layer = this.layers[name];
    if (!layer) return;
    if (on) layer.addTo(this.map);
    else this.map.removeLayer(layer);
  }

  /** 由 3D 端同步視域（不回拋事件） */
  syncView(lat, lon, zoom) {
    this.silent = true;
    if (zoom !== undefined && zoom !== this.map.getZoom()) this.map.setView([lat, lon], zoom, { animate: false });
    else this.map.panTo([lat, lon], { animate: false });
    setTimeout(() => {
      this.silent = false;
    }, 60);
  }

  setCameraTarget(lat, lon) {
    this.cameraMarker.setLatLng([lat, lon]);
  }

  getView() {
    const c = this.map.getCenter();
    return { lat: c.lat, lon: c.lng, zoom: this.map.getZoom() };
  }

  invalidate() {
    setTimeout(() => this.map.invalidateSize(), 60);
  }
}

Object.assign(window.CCS3D, { Map2D });
})();
