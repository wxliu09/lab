/*
 * welllog.js — 合成井柱／虛擬鑽井（Canvas 2D）
 * 道次：深度｜岩性柱｜GR + V_sh｜φ｜k（對數）｜S_w / S_g
 * 曲線取自 petro.js 屬性場，與 3D 著色、剖面完全一致。
 */
window.CCSWellLog = (function () {
  'use strict';
  const THEMES = {
    light: { ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#fcfcfb', edge: 'rgba(11,11,11,0.45)' },
    dark: { ink: '#f2f1ec', ink2: '#c3c2b7', muted: '#8f8d85', grid: '#2c2c2a', axis: '#454540', surface: '#1a1a19', edge: 'rgba(0,0,0,0.6)' }
  };
  const TH = Object.assign({}, THEMES.light);
  function setTheme(mode) { Object.assign(TH, THEMES[mode] || THEMES.light); }
  const FONT = '11px system-ui, "Segoe UI", "Noto Sans TC", sans-serif';
  const TRACKS = [
    { key: 'depth', w: 54 }, { key: 'litho', w: 44 },
    { key: 'gr', w: 100, title: 'GR (API) / V_sh' }, { key: 'phi', w: 88, title: 'φ (%)' },
    { key: 'perm', w: 100, title: 'k (mD, log)' }, { key: 'sat', w: 88, title: 'S_w / S_g' }
  ];
  const PAD = { top: 62, bottom: 26, left: 8, right: 8 };

  /** 沿垂直線取樣整個地層柱（step 公尺） */
  function sampleColumn(model, sampler, x, y, opts) {
    opts = opts || {}; const step = opts.step || 4;
    const n = model.strat.length, z = [];
    for (let h = 0; h <= n; h++) z.push(model.depthNatural(h, x, y));
    const tops = [];
    for (let i = 0; i < n; i++) if (z[i + 1] - z[i] > 0.5) tops.push({ index: i, top: z[i], base: z[i + 1], thickness: z[i + 1] - z[i] });
    if (!tops.length) return null;
    const top = tops[0].top, base = tops[tops.length - 1].base, samples = [];
    for (let d = top; d <= base; d += step) {
      const u = tops.find(t => d >= t.top && d < t.base) || tops[tops.length - 1];
      const zRel = Math.min(1, Math.max(0, (d - u.top) / u.thickness));
      samples.push({ z: d, index: u.index, zRel, props: sampler.propsAt(u.index, x, y, zRel) });
    }
    return { tops, samples, top, base, x, y };
  }

  function draw(canvas, data, opts) {
    opts = opts || {};
    const strat = opts.strat, dpr = window.devicePixelRatio || 1;
    const totalW = TRACKS.reduce((s, t) => s + t.w, 0) + PAD.left + PAD.right, height = opts.height || 620;
    canvas.width = totalW * dpr; canvas.height = height * dpr; canvas.style.width = totalW + 'px'; canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const plotTop = PAD.top, plotH = height - PAD.top - PAD.bottom;
    const toY = z => plotTop + (z - data.top) / (data.base - data.top) * plotH;
    ctx.fillStyle = TH.surface; ctx.fillRect(0, 0, totalW, height);
    const xs = {}; let cx = PAD.left; for (const t of TRACKS) { xs[t.key] = cx; cx += t.w; }
    ctx.font = FONT; ctx.textBaseline = 'middle';
    for (const t of TRACKS) {
      ctx.strokeStyle = TH.axis; ctx.lineWidth = 1; ctx.strokeRect(xs[t.key] + 0.5, plotTop + 0.5, t.w - 1, plotH);
      if (t.title) { ctx.fillStyle = TH.ink2; ctx.textAlign = 'center'; ctx.fillText(t.title, xs[t.key] + t.w / 2, plotTop - 14); }
    }
    ctx.fillStyle = TH.ink2; ctx.textAlign = 'center'; ctx.fillText('深度 m', xs.depth + TRACKS[0].w / 2, plotTop - 14); ctx.fillText('岩性', xs.litho + TRACKS[1].w / 2, plotTop - 14);
    const gridStep = (data.base - data.top) > 2500 ? 250 : 100;
    ctx.textAlign = 'right';
    for (let d = Math.ceil(data.top / gridStep) * gridStep; d <= data.base; d += gridStep) {
      const yy = toY(d); ctx.strokeStyle = TH.grid; ctx.beginPath(); ctx.moveTo(xs.gr, yy); ctx.lineTo(totalW - PAD.right, yy); ctx.stroke();
      ctx.fillStyle = TH.muted; ctx.fillText(String(d), xs.depth + TRACKS[0].w - 6, yy);
    }
    // 岩性柱
    for (const t of data.tops) {
      const f = strat[t.index], y0 = toY(t.top), y1 = toY(t.base);
      window.CCSSection.lithoFill(ctx, xs.litho, y0, TRACKS[1].w, Math.max(1, y1 - y0), f);
      ctx.strokeStyle = TH.edge; ctx.beginPath(); ctx.moveTo(xs.litho, y0 + 0.5); ctx.lineTo(totalW - PAD.right, y0 + 0.5); ctx.stroke();
      if (f.role === 'seal' || f.role === 'reservoir' || f.role === 'secondary') { ctx.fillStyle = f.role === 'seal' ? '#2a78d6' : '#eb6834'; ctx.fillRect(xs.litho - 4, y0, 3, Math.max(1, y1 - y0)); }
    }
    // 曲線
    const curve = (trackKey, pick, lo, hi, color, fill, dash) => {
      const t = TRACKS.find(k => k.key === trackKey), x0 = xs[trackKey];
      const toX = v => x0 + 3 + (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (t.w - 6);
      ctx.beginPath();
      data.samples.forEach((s, i) => { const px = toX(pick(s.props)), py = toY(s.z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      if (fill) { ctx.lineTo(toX(lo), toY(data.samples[data.samples.length - 1].z)); ctx.lineTo(toX(lo), toY(data.samples[0].z)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
      ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    };
    curve('gr', p => p.gr, 0, 160, '#008300');
    curve('gr', p => p.vsh * 160, 0, 160, '#898781', null, [3, 3]);
    curve('phi', p => p.phi * 100, 0, 40, '#2a78d6', 'rgba(42,120,214,0.15)');
    curve('perm', p => Math.log10(Math.max(1e-6, p.perm)), -4, 4, '#eb6834');
    curve('sat', p => p.sw, 0, 1, '#2a78d6');
    // S_g 紅色填充（自右側）
    const satT = TRACKS.find(k => k.key === 'sat'), sx = xs.sat;
    ctx.beginPath(); let started = false;
    data.samples.forEach(s => { const px = sx + 3 + (1 - s.props.sg) * (satT.w - 6), py = toY(s.z); if (!started) { ctx.moveTo(sx + satT.w - 3, py); started = true; } ctx.lineTo(px, py); });
    if (started) { ctx.lineTo(sx + satT.w - 3, toY(data.samples[data.samples.length - 1].z)); ctx.closePath(); ctx.fillStyle = 'rgba(227,73,72,0.55)'; ctx.fill(); }
    // 射孔段
    if (opts.perf) { const y0 = toY(opts.perf[0]), y1 = toY(opts.perf[1]); ctx.fillStyle = '#e34948'; for (let yy = y0; yy < y1; yy += 6) ctx.fillRect(xs.litho - 10, yy, 5, 3); }
    // 標題
    ctx.textAlign = 'left'; ctx.fillStyle = TH.ink; ctx.font = '600 12px system-ui, "Segoe UI", "Noto Sans TC", sans-serif';
    ctx.fillText(opts.title || '合成井柱', PAD.left, 13);
    ctx.font = FONT; ctx.fillStyle = TH.ink2;
    ctx.fillText((opts.location || '') + `｜總深 ${data.base.toFixed(0)} m`, PAD.left, 30);
    // 軸標
    ctx.fillStyle = TH.muted; const axisY = plotTop + plotH + 10;
    const ax = (key, lo, hi) => { ctx.textAlign = 'left'; ctx.fillText(lo, xs[key] + 3, axisY); ctx.textAlign = 'right'; ctx.fillText(hi, xs[key] + TRACKS.find(k => k.key === key).w - 3, axisY); };
    ax('gr', '0', '160'); ax('phi', '0', '40'); ax('perm', '1e-4', '1e4'); ax('sat', '0', '1');
    return { toY, fromPy: py => data.top + (py - plotTop) / plotH * (data.base - data.top), xs, plotTop, plotH, width: totalW };
  }

  /** 地層對比表（HTML）：頂深、厚度、原地 T/P、CO₂ 密度 */
  function topsTable(data, strat, field, props) {
    const rows = data.tops.map(t => {
      const f = strat[t.index], mid = (t.top + t.base) / 2, T = field.temp(mid), P = field.pore(mid);
      let rho = '–'; try { rho = props.co2Density(Math.max(P, 0.1), T + 273.15).toFixed(0); } catch (e) { }
      return `<tr><td><span class="sw" style="display:inline-block;width:10px;height:10px;background:${f.color};border:1px solid rgba(0,0,0,.25);margin-right:4px;vertical-align:-1px"></span>${f.name}</td><td class="num">${t.top.toFixed(0)}</td><td class="num">${t.thickness.toFixed(0)}</td><td class="num">${T.toFixed(0)}</td><td class="num">${P.toFixed(1)}</td><td class="num">${rho}</td></tr>`;
    }).join('');
    return `<table class="data"><thead><tr><th>地層</th><th class="num">頂深 m</th><th class="num">厚度 m</th><th class="num">T °C</th><th class="num">P MPa</th><th class="num">ρCO₂</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  return { sampleColumn, draw, topsTable, TRACKS, setTheme };
})();
