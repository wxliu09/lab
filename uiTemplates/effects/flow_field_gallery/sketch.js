let sim;
let paletteIdx = 0;
let seedVal = 1234;
let exporting = null;

const EXPORT_W = 3840;
const EXPORT_H = 2160;
const EXPORT_STEPS = 400;
const EXPORT_CHUNK = 25;

function setup() {
  pixelDensity(1);
  const c = createCanvas(windowWidth, windowHeight);
  c.elt.style.display = 'block';

  const params = new URLSearchParams(location.search);
  seedVal = parseInt(params.get('seed'), 10);
  if (!Number.isFinite(seedVal)) seedVal = 1234;
  paletteIdx = constrain((parseInt(params.get('palette'), 10) || 1) - 1, 0, PALETTES.length - 1);

  bindUI();
  startSim();
}

function startSim() {
  background(PALETTES[paletteIdx].bg);
  noiseSeed(seedVal);
  sim = new FlowSim({
    width, height,
    ctx: drawingContext,
    palette: PALETTES[paletteIdx],
    seed: seedVal,
    count: 100000,
    noiseFn: (x, y, z) => noise(x, y, z),
  });
  sim.clear();
}

function draw() {
  if (exporting) { exportTick(); return; }
  sim.step();
}

// ---------- hi-res export ----------

function startExport() {
  const pg = createGraphics(EXPORT_W, EXPORT_H);
  pg.pixelDensity(1);
  noiseSeed(seedVal);
  const scaleCount = Math.round(100000 * (EXPORT_W * EXPORT_H) / (width * height));
  const esim = new FlowSim({
    width: EXPORT_W, height: EXPORT_H,
    ctx: pg.drawingContext,
    palette: PALETTES[paletteIdx],
    seed: seedVal,
    count: Math.min(scaleCount, 600000),
    noiseFn: (x, y, z) => noise(x, y, z),
  });
  esim.clear();
  exporting = { pg, esim, done: 0 };
}

function exportTick() {
  const ex = exporting;
  for (let s = 0; s < EXPORT_CHUNK && ex.done < EXPORT_STEPS; s++) {
    ex.esim.step();
    ex.done++;
  }
  background(10);
  fill(255); noStroke(); textAlign(CENTER, CENTER); textSize(20);
  text(`Rendering 4K export… ${Math.round(ex.done / EXPORT_STEPS * 100)}%`, width / 2, height / 2);
  if (ex.done >= EXPORT_STEPS) {
    save(ex.pg, `flowfield_seed${seedVal}_${PALETTES[paletteIdx].name.replace(/\s+/g, '-')}.png`);
    ex.pg.remove();
    exporting = null;
    startSim();
  }
}

// ---------- input ----------

function keyPressed() {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (exporting) return;
  if (key >= '1' && key <= String(PALETTES.length)) {
    paletteIdx = int(key) - 1;
    syncUI();
    startSim();
  } else if (key === 's' || key === 'S') {
    startExport();
  } else if (key === 'r' || key === 'R') {
    randomizeSeed();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (!exporting) startSim();
}

// ---------- DOM UI ----------

function bindUI() {
  syncUI();
  document.getElementById('apply').addEventListener('click', () => {
    const v = parseInt(document.getElementById('seed').value, 10);
    if (Number.isFinite(v)) { seedVal = v; startSim(); }
  });
  document.getElementById('seed').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('apply').click();
  });
  document.getElementById('random').addEventListener('click', randomizeSeed);
  document.getElementById('palette').addEventListener('click', () => {
    paletteIdx = (paletteIdx + 1) % PALETTES.length;
    syncUI();
    startSim();
  });
  document.getElementById('export').addEventListener('click', () => { if (!exporting) startExport(); });
}

function randomizeSeed() {
  seedVal = Math.floor(Math.random() * 1000000);
  syncUI();
  startSim();
}

function syncUI() {
  document.getElementById('seed').value = seedVal;
  document.getElementById('palette').textContent = `🎨 ${PALETTES[paletteIdx].name} (${paletteIdx + 1}/5)`;
}
