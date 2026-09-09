window.CCS = window.CCS || {};
(function () {
'use strict';

const C = window.CCS;
const { STRATA, WELLS, RESERVOIR } = C;

/**
 * 合成測井與岩性柱繪製（Canvas 2D）。
 *
 * 曲線並非另外亂數產生，而是直接取自 petro.propsAt 的屬性場，
 * 因此測井圖、3D 著色與剖面圖三者必然一致：
 * 在同一座標點所讀到的孔隙度、滲透率、Vsh、飽和度都是同一個值。
 *
 * 道次配置（由左至右）：
 *   深度｜岩性柱｜GR + Vsh｜孔隙度 φ｜滲透率 k（對數）｜飽和度 Sw/Sg
 */

const TRACKS = [
  { key: 'depth', w: 58 },
  { key: 'litho', w: 46 },
  { key: 'gr',    w: 104, title: 'GR (API) / Vsh' },
  { key: 'phi',   w: 92,  title: 'φ (%)' },
  { key: 'perm',  w: 104, title: 'k (mD, log)' },
  { key: 'sat',   w: 92,  title: 'Sw / Sg' }
];

const PAD = { top: 64, bottom: 26, left: 10, right: 10 };

/* ------------------------------------------------------------------ *
 * 岩性花紋
 * ------------------------------------------------------------------ */

/** 依 STRATA[i].pattern 於指定矩形內畫出標準地質岩性符號 */
function lithoFill(ctx, x, y, w, h, stratum) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const base = '#' + stratum.color.toString(16).padStart(6, '0');
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);

  const dark = 'rgba(20,26,32,0.55)';
  ctx.strokeStyle = dark;
  ctx.fillStyle = dark;
  ctx.lineWidth = 1;

  switch (stratum.pattern) {
    case 'sandstone':       // 砂岩：散點
      for (let yy = y + 4; yy < y + h; yy += 7) {
        for (let xx = x + 4 + ((yy / 7) | 0) % 2 * 4; xx < x + w; xx += 8) {
          ctx.beginPath(); ctx.arc(xx, yy, 1.05, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    case 'shale':           // 頁岩：水平細線
      for (let yy = y + 3; yy < y + h; yy += 4.5) {
        ctx.beginPath(); ctx.moveTo(x + 2, yy); ctx.lineTo(x + w - 2, yy); ctx.stroke();
      }
      break;
    case 'interbed':        // 砂泥互層：線與點交替
      for (let yy = y + 3, n = 0; yy < y + h; yy += 5.5, n++) {
        if (n % 2 === 0) {
          ctx.beginPath(); ctx.moveTo(x + 2, yy); ctx.lineTo(x + w - 2, yy); ctx.stroke();
        } else {
          for (let xx = x + 5; xx < x + w; xx += 9) {
            ctx.beginPath(); ctx.arc(xx, yy, 1, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      break;
    case 'gravel':          // 礫石：橢圓顆粒
      for (let yy = y + 6; yy < y + h; yy += 11) {
        for (let xx = x + 7 + ((yy / 11) | 0) % 2 * 6; xx < x + w; xx += 13) {
          ctx.beginPath(); ctx.ellipse(xx, yy, 3.4, 2.2, 0.5, 0, Math.PI * 2); ctx.stroke();
        }
      }
      break;
    case 'basement':        // 基盤：交叉線
      ctx.beginPath();
      for (let k = -h; k < w + h; k += 9) {
        ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h);
        ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y);
      }
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 取樣
 * ------------------------------------------------------------------ */

/**
 * 沿垂直線取樣整個地層柱。
 * @returns {{tops:Array, samples:Array, top:number, bot:number}}
 */
function sampleColumn(x, z, step) {
  step = step || 4;
  const col = C.column(x, z);
  const tops = [];
  for (let i = 0; i < STRATA.length; i++) {
    if (col.thick[i] < 0.5) continue;
    tops.push({ index: i, top: col.tops[i], bot: col.tops[i] - col.thick[i], thickness: col.thick[i] });
  }
  if (!tops.length) return null;

  const top = tops[0].top;
  const bot = tops[tops.length - 1].bot;
  const samples = [];
  for (let y = top; y >= bot; y -= step) {
    const u = tops.find((t) => y <= t.top && y >= t.bot) || tops[tops.length - 1];
    const zRel = u.thickness > 0 ? (u.top - y) / u.thickness : 0;
    const sg = C.co2SaturationAt(u.index, x, z, zRel);
    const p = C.petro.propsAt(u.index, x, z, Math.min(1, Math.max(0, zRel)), sg);
    samples.push({ y, index: u.index, zRel, props: p });
  }
  return { tops, samples, top, bot, x, z };
}

/* ------------------------------------------------------------------ *
 * 繪製
 * ------------------------------------------------------------------ */

function draw(canvas, x, z, opts) {
  opts = opts || {};
  const data = sampleColumn(x, z, opts.step || 4);
  if (!data) return null;

  const dpr = window.devicePixelRatio || 1;
  const totalW = TRACKS.reduce((s, t) => s + t.w, 0) + PAD.left + PAD.right;
  const height = opts.height || 620;
  canvas.width = totalW * dpr;
  canvas.height = height * dpr;
  canvas.style.width = totalW + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const plotTop = PAD.top;
  const plotH = height - PAD.top - PAD.bottom;
  const yTop = data.top, yBot = data.bot;
  const toY = (elev) => plotTop + (yTop - elev) / (yTop - yBot) * plotH;

  ctx.fillStyle = '#0e151d';
  ctx.fillRect(0, 0, totalW, height);

  // 道次 x 起點
  const xs = {};
  let cx = PAD.left;
  for (const t of TRACKS) { xs[t.key] = cx; cx += t.w; }

  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // ---- 道次標頭與框線 ----
  for (const t of TRACKS) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xs[t.key] + 0.5, plotTop + 0.5, t.w - 1, plotH);
    if (t.title) {
      ctx.fillStyle = '#9fb2c4';
      ctx.textAlign = 'center';
      ctx.fillText(t.title, xs[t.key] + t.w / 2, plotTop - 14);
    }
  }
  ctx.fillStyle = '#9fb2c4';
  ctx.textAlign = 'center';
  ctx.fillText('深度 (m)', xs.depth + TRACKS[0].w / 2, plotTop - 14);
  ctx.fillText('岩性', xs.litho + TRACKS[1].w / 2, plotTop - 14);

  // ---- 刻度線（每 200 m）----
  const gridStep = (yTop - yBot) > 1600 ? 200 : 100;
  ctx.textAlign = 'right';
  for (let d = Math.ceil(-yTop / gridStep) * gridStep; -d >= yBot; d += gridStep) {
    const yy = toY(-d);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(xs.gr, yy); ctx.lineTo(totalW - PAD.right, yy);
    ctx.stroke();
    ctx.fillStyle = '#7d8fa1';
    ctx.fillText(String(d), xs.depth + TRACKS[0].w - 6, yy);
  }

  // ---- 岩性柱 + 地層界線 ----
  for (const t of data.tops) {
    const s = STRATA[t.index];
    const y0 = toY(t.top), y1 = toY(t.bot);
    lithoFill(ctx, xs.litho, y0, TRACKS[1].w, Math.max(1, y1 - y0), s);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xs.litho, y0 + 0.5); ctx.lineTo(totalW - PAD.right, y0 + 0.5);
    ctx.stroke();
    // 角色標記：蓋層 / 儲層
    if (s.role === 'seal' || s.role === 'reservoir') {
      ctx.fillStyle = s.role === 'seal' ? 'rgba(90,200,255,0.85)' : 'rgba(255,170,60,0.9)';
      ctx.fillRect(xs.litho - 4, y0, 3, Math.max(1, y1 - y0));
    }
  }

  // ---- 曲線 ----
  const curve = (trackKey, pick, lo, hi, color, fill) => {
    const t = TRACKS.find((k) => k.key === trackKey);
    const x0 = xs[trackKey];
    const toX = (v) => x0 + 3 + (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (t.w - 6);
    ctx.beginPath();
    data.samples.forEach((s, i) => {
      const px = toX(pick(s.props));
      const py = toY(s.y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    if (fill) {
      ctx.lineTo(toX(lo), toY(data.samples[data.samples.length - 1].y));
      ctx.lineTo(toX(lo), toY(data.samples[0].y));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  // GR（黃綠）+ Vsh（灰，虛線）
  curve('gr', (p) => p.gr, 0, 160, '#c8e06a');
  ctx.save();
  ctx.setLineDash([3, 3]);
  curve('gr', (p) => p.vsh * 160, 0, 160, 'rgba(160,180,200,0.75)');
  ctx.restore();

  curve('phi', (p) => p.phi * 100, 0, 40, '#4fc3f7', 'rgba(79,195,247,0.16)');
  curve('perm', (p) => Math.log10(Math.max(1e-6, p.perm)), -4, 4, '#ffb74d');
  curve('sat', (p) => p.sw, 0, 1, '#5aa9e6');

  // CO₂ 飽和度以紅色填充凸顯
  const satT = TRACKS.find((k) => k.key === 'sat');
  const satX = xs.sat;
  ctx.beginPath();
  let started = false;
  data.samples.forEach((s) => {
    const px = satX + 3 + (1 - s.props.sg) * (satT.w - 6);
    const py = toY(s.y);
    if (!started) { ctx.moveTo(satX + satT.w - 3, py); started = true; }
    ctx.lineTo(px, py);
  });
  if (started) {
    ctx.lineTo(satX + satT.w - 3, toY(data.samples[data.samples.length - 1].y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(226,84,52,0.55)';
    ctx.fill();
  }

  // ---- 射孔段（若取樣位置接近某口井）----
  const nearWell = opts.well || null;
  if (nearWell && nearWell.perf) {
    const y0 = toY(nearWell.perf[0]), y1 = toY(nearWell.perf[1]);
    ctx.fillStyle = 'rgba(255,122,26,0.9)';
    for (let yy = y0; yy < y1; yy += 6) ctx.fillRect(xs.litho - 10, yy, 5, 3);
  }

  // ---- 標題 ----
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8eef4';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(opts.title || '合成井柱', PAD.left, 14);
  ctx.fillStyle = '#7d8fa1';
  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  const g = C.worldToLonLat ? C.worldToLonLat(x, z) : null;
  const loc = g ? (g.lat.toFixed(4) + '°N, ' + g.lon.toFixed(4) + '°E') :
    ('E ' + x.toFixed(0) + ' m, N ' + (-z).toFixed(0) + ' m');
  ctx.fillText(loc + '｜總深 ' + Math.abs(yBot).toFixed(0) + ' m', PAD.left, 29);

  // ---- 軸標 ----
  ctx.fillStyle = '#6d7f91';
  ctx.textAlign = 'left';
  ctx.fillText('0', xs.gr + 3, plotTop + plotH + 10);
  ctx.textAlign = 'right';
  ctx.fillText('160', xs.gr + TRACKS[2].w - 3, plotTop + plotH + 10);
  ctx.textAlign = 'left';
  ctx.fillText('0', xs.phi + 3, plotTop + plotH + 10);
  ctx.textAlign = 'right';
  ctx.fillText('40', xs.phi + TRACKS[3].w - 3, plotTop + plotH + 10);
  ctx.textAlign = 'left';
  ctx.fillText('1e-4', xs.perm + 3, plotTop + plotH + 10);
  ctx.textAlign = 'right';
  ctx.fillText('1e4', xs.perm + TRACKS[4].w - 3, plotTop + plotH + 10);
  ctx.textAlign = 'left';
  ctx.fillText('0', xs.sat + 3, plotTop + plotH + 10);
  ctx.textAlign = 'right';
  ctx.fillText('1', xs.sat + TRACKS[5].w - 3, plotTop + plotH + 10);

  return data;
}

/** 產生地層對比表（HTML），與測井圖並列 */
function topsTable(data) {
  if (!data) return '';
  const rows = data.tops.map((t) => {
    const s = STRATA[t.index];
    const mid = (t.top + t.bot) / 2;
    const ins = C.petro.insituAt(Math.abs(mid));
    const col = '#' + s.color.toString(16).padStart(6, '0');
    return '<tr>' +
      '<td><i style="background:' + col + '"></i>' + s.name + '</td>' +
      '<td>' + Math.abs(t.top).toFixed(0) + '</td>' +
      '<td>' + t.thickness.toFixed(0) + '</td>' +
      '<td>' + ins.temp.toFixed(0) + '</td>' +
      '<td>' + ins.pressure.toFixed(1) + '</td></tr>';
  }).join('');
  return '<table class="tops"><thead><tr>' +
    '<th>地層</th><th>頂深 m</th><th>厚度 m</th><th>T °C</th><th>P MPa</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

/** 依井 id 取得該井位的柱狀資料 */
function wellColumn(wellId) {
  const w = WELLS.find((k) => k.id === wellId);
  if (!w) return null;
  const p = C.lonLatToWorld(w.lon, w.lat);
  return { well: w, x: p.x, z: p.z };
}

C.welllog = { draw, sampleColumn, topsTable, wellColumn, lithoFill, RESERVOIR_INDEX: RESERVOIR.strataIndex };
})();

