// FlowSim: resolution-independent flow-field particle engine.
// p5-agnostic: inject noiseFn + a 2D canvas context, works on-screen or offscreen.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const PALETTES = [
  { name: 'Neon Dusk',  bg: '#0b0614', colors: ['#f72585', '#b5179e', '#7209b7', '#3f37c9', '#4cc9f0'] },
  { name: 'Ember Glow', bg: '#100703', colors: ['#ffba08', '#faa307', '#f48c06', '#e85d04', '#ff5d8f'] },
  { name: 'Deep Ocean', bg: '#02070f', colors: ['#90e0ef', '#48cae4', '#00b4d8', '#0096c7', '#caf0f8'] },
  { name: 'Aurora',     bg: '#03110c', colors: ['#80ffdb', '#64dfdf', '#48bfe3', '#5390d9', '#b8f2e6'] },
  { name: 'Prism',      bg: '#0a0a10', colors: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'] },
];

class FlowSim {
  constructor(opts) {
    this.w = opts.width;
    this.h = opts.height;
    this.ctx = opts.ctx;
    this.palette = opts.palette;
    this.seed = opts.seed;
    this.count = opts.count ?? 100000;
    this.noiseFn = opts.noiseFn;
    this.alpha = opts.alpha ?? 0.08;
    this.curl = opts.curl ?? 2.5;
    // normalize field + motion to a 1920-wide reference so hi-res export matches the preview
    this.k = 4.2 / this.w;
    this.speed = 1.8 * (this.w / 1920);
    this.lineWidth = Math.max(1, this.w / 1920);
    this.zoff = 0;
    this.strokes = this.palette.colors.map(c => hexToRgba(c, this.alpha));
    this.reset();
  }

  reset() {
    const rng = mulberry32(this.seed >>> 0);
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.life = new Int32Array(this.count);
    this.maxLife = new Int32Array(this.count);
    this.byColor = [];
    for (let c = 0; c < this.palette.colors.length; c++) this.byColor.push([]);
    for (let i = 0; i < this.count; i++) {
      this.x[i] = rng() * this.w;
      this.y[i] = rng() * this.h;
      this.maxLife[i] = 100 + (rng() * 300) | 0;
      this.life[i] = (rng() * this.maxLife[i]) | 0;
      this.byColor[i % this.palette.colors.length].push(i);
    }
    this.rng = rng;
  }

  clear() {
    const ctx = this.ctx;
    ctx.fillStyle = this.palette.bg;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  respawn(i) {
    this.x[i] = this.rng() * this.w;
    this.y[i] = this.rng() * this.h;
    this.life[i] = 0;
  }

  step() {
    const { ctx, w, h, k, speed, curl, zoff } = this;
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';
    for (let c = 0; c < this.byColor.length; c++) {
      const list = this.byColor[c];
      ctx.strokeStyle = this.strokes[c];
      ctx.beginPath();
      for (let j = 0; j < list.length; j++) {
        const i = list[j];
        const a = this.noiseFn(this.x[i] * k, this.y[i] * k, zoff) * Math.PI * 2 * curl;
        const nx = this.x[i] + Math.cos(a) * speed;
        const ny = this.y[i] + Math.sin(a) * speed;
        ctx.moveTo(this.x[i], this.y[i]);
        ctx.lineTo(nx, ny);
        this.x[i] = nx; this.y[i] = ny;
        this.life[i]++;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || this.life[i] > this.maxLife[i]) this.respawn(i);
      }
      ctx.stroke();
    }
    this.zoff += 0.0015;
  }
}

if (typeof module !== 'undefined') module.exports = { FlowSim, PALETTES, mulberry32 };
