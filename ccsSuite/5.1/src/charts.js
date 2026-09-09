/*
 * charts.js — 輕量 canvas 折線圖（無外部依賴）
 * 規格：細線（2px）、髮線格線、≥2 條序列時顯示圖例、線尾直接標註、hover 十字線 + tooltip、可輸出表格資料。
 * 配色：固定序列色（不依排名重排），文字用墨色 token。
 */
window.CCSCharts = (function () {
  'use strict';
  // 深色模式的序列色是同一色階的另一階（對深色底重新驗證過），不是直接反相
  const THEMES = {
    light: {
      series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
      ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#fcfcfb',
      status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' }
    },
    dark: {
      series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
      ink: '#f2f1ec', ink2: '#c3c2b7', muted: '#8f8d85', grid: '#2c2c2a', axis: '#454540', surface: '#1a1a19',
      status: { good: '#2fbf2f', warning: '#fab219', serious: '#ec835a', critical: '#e05252' }
    }
  };
  const PAL = Object.assign({}, THEMES.light);
  function setTheme(mode) { Object.assign(PAL, THEMES[mode] || THEMES.light); }
  const FONT = '11px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';

  function niceStep(span, target) {
    const raw = span / Math.max(target, 1), p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m >= 5 ? 10 : m >= 2 ? 5 : m >= 1 ? 2 : 1) * p;
  }
  function ticks(lo, hi, target) {
    if (!(hi > lo)) return [lo];
    const st = niceStep(hi - lo, target), out = [];
    for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-6; v += st) out.push(+v.toFixed(10));
    return out;
  }
  function fmt(v, unit) {
    if (!Number.isFinite(v)) return '–';
    const a = Math.abs(v);
    const s = a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
    return unit ? s + ' ' + unit : s;
  }

  function create(container, spec) {
    container.classList.add('chart');
    const canvas = document.createElement('canvas');
    const tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true;
    container.appendChild(canvas); container.appendChild(tip);
    const ctx = canvas.getContext('2d');
    let S = spec, layout = null, hover = null;

    function computeDomain() {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of S.series) for (const p of s.points) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      }
      for (const m of (S.markers || [])) { if (m.x < x0) x0 = m.x; if (m.x > x1) x1 = m.x; if (m.y < y0) y0 = m.y; if (m.y > y1) y1 = m.y; }
      for (const l of (S.hlines || [])) { if (l.y < y0) y0 = l.y; if (l.y > y1) y1 = l.y; }
      for (const l of (S.vlines || [])) { if (l.x < x0) x0 = l.x; if (l.x > x1) x1 = l.x; }
      if (S.xDomain) [x0, x1] = S.xDomain; if (S.yDomain) [y0, y1] = S.yDomain;
      if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; } if (!Number.isFinite(y0)) { y0 = 0; y1 = 1; }
      if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
      if (!S.yDomain) { const pad = (y1 - y0) * 0.06; if (S.yZero) y0 = Math.min(0, y0); y1 += pad; if (!S.yZero) y0 -= pad; }
      return { x0, x1, y0, y1 };
    }

    function render() {
      const W = container.clientWidth || 300, H = S.height || 220, dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PAL.surface; ctx.fillRect(0, 0, W, H);
      const multi = S.series.length >= 2;
      const labelRight = S.directLabels !== false && S.series.length <= 4 && !S.yInvert;
      const m = { l: 54, r: labelRight ? 78 : 18, t: (S.title ? 22 : 8) + (multi ? 18 : 0), b: 34 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const d = computeDomain();
      const sx = x => m.l + (x - d.x0) / (d.x1 - d.x0) * pw;
      const sy = y => S.yInvert ? m.t + (y - d.y0) / (d.y1 - d.y0) * ph : m.t + ph - (y - d.y0) / (d.y1 - d.y0) * ph;
      layout = { m, pw, ph, d, sx, sy, W, H };
      ctx.font = FONT; ctx.textBaseline = 'middle';
      // 標題
      if (S.title) { ctx.fillStyle = PAL.ink; ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, "Segoe UI", "Noto Sans TC", sans-serif'; ctx.fillText(S.title, m.l, 11); ctx.font = FONT; }
      // 圖例
      if (multi) {
        let lx = m.l; const ly = m.t - 10;
        for (const s of S.series) {
          ctx.fillStyle = s.color; ctx.fillRect(lx, ly - 4, 10, 8); lx += 14;
          ctx.fillStyle = PAL.ink2; ctx.textAlign = 'left'; ctx.fillText(s.name, lx, ly); lx += ctx.measureText(s.name).width + 14;
        }
      }
      // 格線與刻度
      const xt = ticks(d.x0, d.x1, Math.max(3, pw / 70)), yt = ticks(d.y0, d.y1, Math.max(3, ph / 40));
      ctx.strokeStyle = PAL.grid; ctx.lineWidth = 1;
      for (const v of yt) { const y = Math.round(sy(v)) + 0.5; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke(); }
      for (const v of xt) { const x = Math.round(sx(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke(); }
      ctx.strokeStyle = PAL.axis; ctx.beginPath(); ctx.moveTo(m.l + 0.5, m.t); ctx.lineTo(m.l + 0.5, m.t + ph); ctx.lineTo(m.l + pw, m.t + ph); ctx.stroke();
      ctx.fillStyle = PAL.muted; ctx.textAlign = 'right';
      for (const v of yt) ctx.fillText(fmt(v), m.l - 6, sy(v));
      ctx.textAlign = 'center';
      for (const v of xt) ctx.fillText(fmt(v), sx(v), m.t + ph + 12);
      ctx.fillStyle = PAL.ink2;
      if (S.xLabel) ctx.fillText(S.xLabel, m.l + pw / 2, H - 8);
      if (S.yLabel) { ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(S.yLabel, 0, 0); ctx.restore(); }
      // 剪裁繪圖區
      ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
      (S.hlines || []).forEach((l, li) => {
        const y = sy(l.y); ctx.strokeStyle = l.color || PAL.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); ctx.stroke();
        if (l.label) { ctx.fillStyle = PAL.ink2; ctx.textAlign = 'right'; ctx.fillText(l.label, m.l + pw - 4, y - 7); }
      });
      (S.vlines || []).forEach((l, li) => {
        const x = sx(l.x); ctx.strokeStyle = l.color || PAL.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
        if (l.label) { ctx.fillStyle = PAL.ink2; ctx.textAlign = 'left'; ctx.fillText(l.label, x + 4, m.t + 8 + li * 13); }
      });
      for (const s of S.series) {
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash ? [5, 4] : []);
        ctx.beginPath(); let started = false;
        for (const p of s.points) {
          if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) { started = false; continue; }
          const x = sx(p[0]), y = sy(p[1]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      for (const mk of (S.markers || [])) {
        const x = sx(mk.x), y = sy(mk.y);
        ctx.fillStyle = PAL.surface; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = mk.color || PAL.ink; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        if (mk.label) { ctx.fillStyle = PAL.ink2; ctx.textAlign = 'left'; ctx.fillText(mk.label, x + 8, y - (mk.dy || 0)); }
      }
      ctx.restore();
      // 線尾直接標註（≤4 條）
      if (labelRight) {
        const placed = [];
        for (const s of S.series) {
          const last = [...s.points].reverse().find(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
          if (!last) continue;
          let y = sy(last[1]);
          for (const py of placed) if (Math.abs(py - y) < 12) y = py + 12;
          placed.push(y);
          ctx.fillStyle = PAL.ink2; ctx.textAlign = 'left'; ctx.fillText(s.name, m.l + pw + 6, y);
        }
      }
      if (hover) drawHover();
    }

    function nearest(mx, my) {
      if (!layout) return null;
      const { sx, sy } = layout;
      let best = null;
      for (let si = 0; si < S.series.length; si++) {
        const s = S.series[si];
        for (const p of s.points) {
          if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
          const dist = S.yInvert || S.hoverAxis === 'y' ? Math.abs(sy(p[1]) - my) : Math.abs(sx(p[0]) - mx);
          if (!best || dist < best.dist) best = { dist, p, si };
        }
      }
      return best && best.dist < 40 ? best : null;
    }
    function drawHover() {
      const { m, pw, ph, sx, sy } = layout, { p } = hover;
      ctx.save(); ctx.strokeStyle = PAL.axis; ctx.lineWidth = 1; ctx.setLineDash([]);
      const alongY = S.yInvert || S.hoverAxis === 'y';
      ctx.beginPath();
      if (alongY) { const y = sy(p[1]); ctx.moveTo(m.l, y); ctx.lineTo(m.l + pw, y); }
      else { const x = sx(p[0]); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); }
      ctx.stroke();
      // 各序列在該 x（或 y）的值
      const rows = [];
      for (const s of S.series) {
        let q = null, bd = Infinity;
        for (const pt of s.points) {
          if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
          const dd = alongY ? Math.abs(pt[1] - p[1]) : Math.abs(pt[0] - p[0]);
          if (dd < bd) { bd = dd; q = pt; }
        }
        if (q) {
          rows.push({ name: s.name, color: s.color, v: alongY ? q[0] : q[1] });
          ctx.fillStyle = PAL.surface; ctx.beginPath(); ctx.arc(sx(q[0]), sy(q[1]), 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(sx(q[0]), sy(q[1]), 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
      const key = alongY ? fmt(p[1], S.yUnit) : fmt(p[0], S.xUnit);
      tip.innerHTML = '<div class="chart-tip-key">' + (alongY ? (S.yLabel || 'y') : (S.xLabel || 'x')) + ' = ' + key + '</div>' +
        rows.map(r => '<div><span class="sw" style="background:' + r.color + '"></span>' + r.name + '：<b>' + fmt(r.v, alongY ? S.xUnit : S.yUnit) + '</b></div>').join('');
      tip.hidden = false;
      const px = alongY ? layout.m.l + layout.pw * 0.55 : sx(p[0]), py = alongY ? sy(p[1]) : layout.m.t + 8;
      tip.style.left = Math.min(px + 10, layout.W - tip.offsetWidth - 4) + 'px';
      tip.style.top = Math.max(0, Math.min(py, layout.H - tip.offsetHeight - 4)) + 'px';
    }
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      const n = nearest(e.clientX - r.left, e.clientY - r.top);
      hover = n; render(); if (!n) tip.hidden = true;
    });
    canvas.addEventListener('mouseleave', () => { hover = null; tip.hidden = true; render(); });
    const ro = new ResizeObserver(() => render()); ro.observe(container);
    render();
    return {
      update(newSpec) { S = newSpec; hover = null; tip.hidden = true; render(); },
      destroy() { ro.disconnect(); container.innerHTML = ''; },
      toTable() { // 以第一序列的 x 為列
        const xs = new Set(); for (const s of S.series) for (const p of s.points) if (Number.isFinite(p[0])) xs.add(+p[0].toFixed(6));
        const sorted = [...xs].sort((a, b) => a - b);
        const rows = sorted.map(x => [x, ...S.series.map(s => { const q = s.points.find(p => Math.abs(p[0] - x) < 1e-6); return q ? q[1] : NaN; })]);
        return { columns: [S.xLabel || 'x', ...S.series.map(s => s.name)], rows };
      }
    };
  }

  return { create, setTheme, PAL, fmt };
})();
