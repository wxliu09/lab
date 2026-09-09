// Gallery: renders each (seed, palette) combo as a live thumbnail via p5 instance mode.
const THUMB_W = 480;
const THUMB_H = 270;
const THUMB_STEPS = 220;   // total simulation steps per thumbnail
const STEPS_PER_FRAME = 8; // renders fast, then stops

const COMBOS = [
  { seed: 7,     palette: 0 },
  { seed: 42,    palette: 1 },
  { seed: 1337,  palette: 2 },
  { seed: 9001,  palette: 3 },
  { seed: 31415, palette: 4 },
  { seed: 808,   palette: 2 },
  { seed: 20240, palette: 0 },
  { seed: 555,   palette: 3 },
];

for (const combo of COMBOS) {
  const card = document.createElement('a');
  card.className = 'card';
  card.href = `index.html?seed=${combo.seed}&palette=${combo.palette + 1}`;

  const holder = document.createElement('div');
  holder.className = 'thumb';
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.textContent = `seed ${combo.seed} · ${PALETTES[combo.palette].name}`;
  card.appendChild(holder);
  card.appendChild(caption);
  document.getElementById('grid').appendChild(card);

  new p5(p => {
    let gsim, steps = 0;
    p.setup = () => {
      p.pixelDensity(1);
      p.createCanvas(THUMB_W, THUMB_H);
      p.noiseSeed(combo.seed);
      gsim = new FlowSim({
        width: THUMB_W, height: THUMB_H,
        ctx: p.drawingContext,
        palette: PALETTES[combo.palette],
        seed: combo.seed,
        count: 9000,
        noiseFn: (x, y, z) => p.noise(x, y, z),
      });
      gsim.clear();
    };
    p.draw = () => {
      for (let s = 0; s < STEPS_PER_FRAME && steps < THUMB_STEPS; s++) {
        gsim.step();
        steps++;
      }
      if (steps >= THUMB_STEPS) p.noLoop();
    };
  }, holder);
}
