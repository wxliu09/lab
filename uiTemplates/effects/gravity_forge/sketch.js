// GRAVITY FORGE — 15k particles accreting onto a draggable singularity.
// Additive blending + speed-mapped hue = plasma glow. Pure p5 2D, no assets.

const COUNT = 15000;
const SOFTENING = 900;      // gravity softening to avoid singular accel
const CORE_R = 14;          // particles inside get recycled to the rim
const FADE_ALPHA = 18;      // trail persistence (lower = longer trails)

// color spectra: [cool hue, hot hue] in HSB 0-360
const SPECTRA = [
  { name: 'ION STORM',  cool: 210, hot: 320 },
  { name: 'SOLAR FLARE', cool: 5,  hot: 55  },
  { name: 'TOXIC BLOOM', cool: 90, hot: 190 },
  { name: 'ULTRAVIOLET', cool: 260, hot: 300 },
];
let spectrumIdx = 0;

let px, py, pvx, pvy;         // particle state
let ax, ay;                   // attractor (singularity) position
let gravity = 1400;
let burstFlash = 0;
let lastInteract = -9999;
let t = 0;

function setup() {
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  px = new Float32Array(COUNT); py = new Float32Array(COUNT);
  pvx = new Float32Array(COUNT); pvy = new Float32Array(COUNT);
  ax = width / 2; ay = height / 2;
  for (let i = 0; i < COUNT; i++) spawnOnDisk(i, ax, ay);
  background(0);
}

// spawn at a random radius with circular-orbit velocity -> instant accretion disk
function spawnOnDisk(i, cx, cy) {
  const r = 60 + Math.pow(Math.random(), 1.6) * Math.min(width, height) * 0.62;
  const a = Math.random() * TWO_PI;
  px[i] = cx + Math.cos(a) * r;
  py[i] = cy + Math.sin(a) * r;
  const v = Math.sqrt(gravity / r) * (0.72 + Math.random() * 0.4); // slightly under orbital speed -> spirals in
  pvx[i] = -Math.sin(a) * v;
  pvy[i] =  Math.cos(a) * v;
}

function draw() {
  t += 0.008;

  // idle > 4s: singularity wanders on a Lissajous path
  let tx = mouseX, ty = mouseY;
  if (millis() - lastInteract > 4000) {
    tx = width  * (0.5 + 0.33 * Math.sin(t * 0.9) * Math.cos(t * 0.31));
    ty = height * (0.5 + 0.33 * Math.sin(t * 0.53 + 1.7));
  }
  ax = lerp(ax, tx, 0.06);
  ay = lerp(ay, ty, 0.06);

  // trail fade (keep BLEND for the veil, then ADD for plasma)
  blendMode(BLEND);
  noStroke();
  fill(0, FADE_ALPHA);
  rect(0, 0, width, height);
  blendMode(ADD);

  const spec = SPECTRA[spectrumIdx];
  // integrate + bucket segments by quantized heat, then one batched stroke per bucket
  const NB = 24;
  if (!draw.buckets) {
    draw.buckets = [];
    draw.ox = new Float32Array(COUNT); draw.oy = new Float32Array(COUNT);
    for (let b = 0; b < NB; b++) draw.buckets[b] = [];
  }
  const { buckets, ox, oy } = draw;
  for (let b = 0; b < NB; b++) buckets[b].length = 0;

  for (let i = 0; i < COUNT; i++) {
    const dx = ax - px[i], dy = ay - py[i];
    const d2 = dx * dx + dy * dy + SOFTENING;
    const d = Math.sqrt(d2);
    const f = gravity / (d2 * d) * 60;   // a = G/r^2, dt folded in
    pvx[i] += dx * f * 0.016;
    pvy[i] += dy * f * 0.016;

    // faint Perlin turbulence so streams braid instead of locking into rings
    const na = noise(px[i] * 0.0016, py[i] * 0.0016, t * 0.4) * TWO_PI * 2;
    pvx[i] += Math.cos(na) * 0.045;
    pvy[i] += Math.sin(na) * 0.045;

    ox[i] = px[i]; oy[i] = py[i];
    px[i] += pvx[i]; py[i] += pvy[i];

    const sp = Math.sqrt(pvx[i] * pvx[i] + pvy[i] * pvy[i]);
    buckets[Math.min(NB - 1, (sp / 26 * NB) | 0)].push(i);

    if (d < CORE_R || px[i] < -60 || px[i] > width + 60 || py[i] < -60 || py[i] > height + 60) {
      spawnOnDisk(i, ax, ay);
    }
  }

  const ctx = drawingContext;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let b = 0; b < NB; b++) {
    const list = buckets[b];
    if (!list.length) continue;
    const heat = (b + 0.5) / NB;
    stroke(lerp(spec.cool, spec.hot, heat), lerp(70, 8, heat), lerp(28, 100, heat), 55);
    ctx.beginPath();
    for (let j = 0; j < list.length; j++) {
      const i = list[j];
      ctx.moveTo(ox[i], oy[i]);
      ctx.lineTo(px[i], py[i]);
    }
    ctx.stroke();
  }

  drawCore(spec);
  if (burstFlash > 0) { burstFlash *= 0.88; }
  drawVignette();
}

function drawCore(spec) {
  // layered translucent discs = cheap bloom around the singularity
  noStroke();
  const pulse = 1 + 0.12 * Math.sin(t * 6);
  for (let r = 130; r > 6; r -= 12) {
    const k = r / 130;
    fill(lerp(spec.cool, spec.hot, 1 - k), 60 * k + 20, 90, (1 - k) * 5 + burstFlash * 30);
    circle(ax, ay, r * pulse * (1 + burstFlash * 1.6));
  }
  fill(spec.hot, 5, 100, 60 + burstFlash * 40);
  circle(ax, ay, 10 * pulse);
}

function drawVignette() {
  blendMode(BLEND);
  noStroke();
  for (let i = 0; i < 4; i++) {
    noFill();
    stroke(0, 0, 0, 26);
    strokeWeight(30 + i * 26);
    rect(-10 - i * 13, -10 - i * 13, width + 20 + i * 26, height + 20 + i * 26, 24);
  }
  noStroke();
}

// supernova: radial impulse + flash
function detonate() {
  for (let i = 0; i < COUNT; i++) {
    const dx = px[i] - ax, dy = py[i] - ay;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const kick = 34 * Math.exp(-d / 320) + 4;
    pvx[i] += (dx / d) * kick + (Math.random() - 0.5) * 3;
    pvy[i] += (dy / d) * kick + (Math.random() - 0.5) * 3;
  }
  burstFlash = 1;
  lastInteract = millis();
}

function mouseMoved() { lastInteract = millis(); }
function mouseDragged() { lastInteract = millis(); return false; }
function mousePressed() { detonate(); return false; }
function mouseWheel(e) {
  gravity = constrain(gravity * (e.delta > 0 ? 0.9 : 1.11), 300, 6000);
  lastInteract = millis();
  return false;
}
function touchStarted() { detonate(); return false; }

function keyPressed() {
  if (key >= '1' && key <= String(SPECTRA.length)) spectrumIdx = int(key) - 1;
  else if (key === ' ') { detonate(); return false; }
  else if (key === 's' || key === 'S') saveCanvas('gravity-forge', 'png');
  else if (key === 'c' || key === 'C') background(0);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(0);
}
