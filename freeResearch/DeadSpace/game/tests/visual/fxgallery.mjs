// 特效截圖自評（輸出 <outDir>/<名稱>.jpg）：node tests/visual/fxgallery.mjs <outDir> [群組或名稱篩選，逗號分隔] [quality]
// 需要先 build test 版並在背景跑 preview：
//   npx vite build --mode e2e --outDir .e2e-dist
//   npx vite preview --outDir .e2e-dist --port 4174 --strictPort
// 開局後用 window.__xcScene 直接呼叫 FX handler（傳假的 FxEvent），並在 client 世界放「假實體」來看 buff 與裝置模型。
// 群組：atk proj ab prim st buff dev space
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const out = process.argv[2] ?? '.'
const filter = (process.argv[3] ?? '').split(',').filter(Boolean)
const q = process.argv[4] ?? 'low'
/** 每個 render 幀特效時鐘前進的秒數（逐幀驅動，與 SwiftShader 的實際幀率無關）*/
const FDT = Number(process.env.XC_FDT ?? 0.05)
let fdtNow = FDT
const nf = (ms) => Math.max(1, Math.round(ms / 1000 / fdtNow))
const base = process.env.XC_URL ?? 'http://localhost:4174/'
mkdirSync(out, { recursive: true })

const ME = 'me'
const T = 900001 // 目標假人
const T2 = 900002
// [名稱, 群組, 規格]
// 規格：fakes: [[id, unitDef, dx, dy, extra]]、fx: [{...FxEvent, dx, dy, dx2, dy2, e, e2, at(ms)}]、wait(ms)、cam: [dx, dy, zoom]
const dummy = (dx = 3, dy = 0, extra = {}) => [T, 'personnel', dx, dy, { cl: 'security', c: 3, ...extra }]
const S = []
const add = (name, group, spec) => S.push([name, group, spec])

// ── 普攻與投射物 ──
for (const [s, w] of [
  ['rifle', 30],
  ['gatling', 20],
  ['tesla', 40],
  ['flame', 120],
  ['photon', 60],
  ['claw', 90],
  ['xenoArc', 80],
  ['chrono', 100],
  ['lightning', 60],
  ['operative', 30],
  ['saw', 30],
])
  add('atk-' + s, 'atk', { fakes: [dummy()], fx: [{ k: 'atk', e: ME, e2: T, dx2: 3, dy2: 0, s }], wait: w, cam: [1.5, 0, 0.12], fdt: 0.016 })
for (const [s, v] of [
  ['plasma', 5],
  ['rocket', 5],
  ['grenade', 4],
  ['acidSpit', 5],
  ['fire', 5],
  ['skyfire', 5],
  ['silk', 4],
  ['mutSpine', 6],
  ['rock', 4],
  ['flask', 4],
  ['wrench', 4],
  ['sludge', 3],
  ['quake', 4],
  ['pulseWave', 4],
  ['xenoOrb', 5],
  ['void', 5],
  ['cryo', 5],
  ['hiveSpore', 4],
])
  add('proj-' + s, 'proj', { fakes: [dummy(4.5)], fx: [{ k: 'proj', e: ME, e2: ['sludge', 'quake', 'pulseWave'].includes(s) ? undefined : T, dx2: 4.5, dy2: 0, v, s }], wait: 420, cam: [2, 0, 0.14] })
add('proj-impact-fire', 'proj', { fakes: [dummy(3)], fx: [{ k: 'proj', e: ME, e2: T, dx2: 3, dy2: 0, v: 12, s: 'fire' }], wait: 380, cam: [2, 0, 0.12] })
add('proj-impact-acid', 'proj', { fakes: [dummy(3)], fx: [{ k: 'proj', e: ME, e2: T, dx2: 3, dy2: 0, v: 12, s: 'acidSpit' }], wait: 450, cam: [2, 0, 0.12] })

// ── 技能與事件 ──
const one = (k, extra = {}, wait = 250, cam = [0, 0, 0.14], fakes = [dummy(0, 0)]) => ({ fakes, fx: [{ k, dx: 0, dy: 0, e: T, ...extra }], wait, cam })
add('boom', 'ab', one('boom', { v: 1.75, e: undefined }, 160))
add('fusion', 'ab', one('fusion', { v: 5.5, e: undefined }, 350, [0, 0, 0.35]))
add('fusion-smoke', 'ab', one('fusion', { v: 5.5, e: undefined }, 1400, [0, 0, 0.35]))
add('seq-boom', 'seq', { ...one('boom', { v: 1.75, e: undefined }, 0), seq: [50, 200, 450, 1200], cam: [0, 0, 0.15] })
add('seq-fusion', 'seq', { ...one('fusion', { v: 5.5, e: undefined }, 0), seq: [60, 300, 800, 2000], cam: [0, 0, 0.35] })
add('seq-lightning', 'seq', { fakes: [], fx: [{ k: 'lightning', dx: 0, dy: 0 }], seq: [40, 160, 500, 1400], cam: [0, 0, 0.25], fdt: 0.02 })
add('beam-plasma', 'ab', { fakes: [dummy(3), [T2, 'rig.drainer', 0.8, 0.6, {}]], fx: [{ k: 'beam', e: T2, e2: T, s: 'plasma', dx: 0.8, dy: 0.6 }], wait: 250, cam: [1.5, 0, 0.12] })
add('beam-heal', 'ab', { fakes: [dummy(3)], fx: [{ k: 'beam', e: ME, e2: T, s: 'heal', dx: 0, dy: 0 }], wait: 250, cam: [1.5, 0, 0.12] })
add('deflect', 'ab', one('deflect', {}, 120))
add('mirageBreak', 'ab', one('mirageBreak', { e: undefined }, 150))
add('entropy', 'ab', one('entropy', { v: 3, e: undefined }, 300, [0, 0, 0.2]))
add('steal', 'ab', { fakes: [dummy(3)], fx: [{ k: 'steal', dx: 3, dy: 0, dx2: 0, dy2: 0, e: ME, e2: T, s: 'medkit' }], wait: 220, cam: [1.5, 0, 0.12] })
add('flux', 'ab', one('flux', {}, 300))
add('mute', 'ab', one('mute', {}, 260))
add('manifold', 'ab', one('manifold', { v: 3 }, 250))
add('petrify', 'ab', one('petrify', {}, 300))
add('unpetrify', 'ab', one('unpetrify', {}, 200))
add('swarmbolt', 'ab', { fakes: [dummy(3), [T2, 'personnel', 3.5, 2, { cl: 'medic', c: 5 }]], fx: [{ k: 'swarmbolt', dx: 0, dy: 0, dx2: 3, dy2: 0, e: ME, e2: T }, { k: 'swarmbolt', dx: 3, dy: 0, dx2: 3.5, dy2: 2, e2: T2 }], wait: 100, cam: [1.8, 1, 0.14] })
add('coreForm', 'ab', one('coreForm', {}, 200))
add('coreReform', 'ab', one('coreReform', {}, 300))
add('web', 'ab', one('web', { e: undefined }, 250))
add('webwire', 'ab', { fakes: [[T, 'xeno.webAnchor', -2, 0, {}], [T2, 'xeno.webAnchor', 2, 0.5, { x2: {} }]], fx: [{ k: 'webwire', dx: -2, dy: 0, dx2: 2, dy2: 0.5, e: T, e2: T2 }], wait: 250, cam: [0, 0, 0.14] })
add('weblink', 'ab', { fakes: [[T, 'xeno.webAnchor', -2.5, 0, { x2: { link: T2 } }], [T2, 'xeno.webAnchor', 2.5, 0.8, {}], [900003, 'personnel', 0, 2, { cl: 'janitor', c: 6, b: ['bf.xeno.tripped'] }]], fx: [], wait: 400, cam: [0, 0.5, 0.15] })
add('tripped', 'ab', one('tripped', {}, 150))
add('fountain', 'ab', one('fountain', { v: 3, e: undefined }, 900, [0, 0, 0.22]))
add('webGlob', 'ab', one('webGlob', { v: 1.2, e: undefined }, 450))
add('relocate', 'ab', one('relocate', {}, 260))
add('swap', 'ab', one('swap', {}, 160))
add('rewind', 'ab', one('rewind', {}, 250))
add('masks', 'ab', one('masks', {}, 250))
add('crush', 'ab', one('crush', { e: undefined }, 180))
add('smash', 'ab', one('smash', { v: 1.2, e: undefined }, 220))
add('bite', 'ab', one('bite', {}, 140))
add('burst', 'ab', one('burst', { s: 'worms' }, 200))
add('taint', 'ab', one('taint', {}, 300))
add('voidBurst', 'ab', one('voidBurst', { v: 2.5, e: undefined }, 220))
add('phaseShift', 'ab', one('phaseShift', {}, 140))
add('mirage', 'ab', one('mirage', {}, 200))
add('radBurst', 'ab', one('radBurst', { v: 4, e: undefined }, 300, [0, 0, 0.22]))
add('braced', 'ab', one('braced', {}, 150))
add('polarity', 'ab', one('polarity', {}, 250))
add('slivBurst', 'ab', one('slivBurst', { v: 6 }, 120))
add('weld', 'ab', one('weld', {}, 250))
add('cloak', 'ab', one('cloak', {}, 200))
add('deploy', 'ab', one('deploy', { s: 'dev.sentry', e: undefined }, 300))
add('doorLock', 'ab', one('doorLock', { v: 1, e: undefined }, 400))
add('doorUnlock', 'ab', one('doorLock', { v: 0, e: undefined }, 400))
add('doorSlam', 'ab', one('doorSlam', { e: undefined }, 160))
add('enhance', 'ab', one('enhance', {}, 500))
add('fusionArm', 'ab', { fakes: [[T, 'dev.fusionCharge', 0, 0, {}]], fx: [{ k: 'fusionArm', dx: 0, dy: 0, e: T, v: 3 }], wait: 1500, cam: [0, 0, 0.3] })
add('grav', 'ab', { fakes: [dummy(3)], fx: [{ k: 'grav', dx: 0, dy: 0, dx2: 3, dy2: 0, e: ME, e2: T, v: -1 }], wait: 200, cam: [1.5, 0, 0.12] })
add('holo', 'ab', one('holo', {}, 300))
add('portalCharge', 'ab', { fakes: [[T, 'dev.protoPortal', 0, 0, {}]], fx: [{ k: 'portalCharge', dx: 0, dy: 0, e: T, v: 3 }], wait: 1500, cam: [0, 0, 0.25] })
add('revive', 'ab', one('revive', {}, 300))
add('rummage', 'ab', one('rummage', {}, 200))
add('scan', 'ab', one('scan', { e: undefined }, 400))
add('skyDrop', 'ab', one('skyDrop', { e: undefined }, 450))
add('void', 'ab', { fakes: [[T, 'dev.singularity', 0, 0, {}]], fx: [{ k: 'void', dx: 0, dy: 0, v: 8 }], wait: 500, cam: [0, 0, 0.4] })
add('heal', 'ab', one('heal', { v: 4.5 }, 350, [0, 0, 0.2]))
add('emp', 'ab', one('emp', { v: 2.5, e: undefined }, 150))
add('blink', 'ab', one('blink', { dx2: 3, dy2: 1, e: undefined }, 150, [1.5, 0.5, 0.14]))

// ── 效果原語 ──
add('lightningMark', 'prim', one('lightningMark', { e: undefined }, 600, [0, 0, 0.2]))
add('lightning', 'prim', one('lightning', { e: undefined }, 90, [0, 0, 0.25]))
add('blackness', 'prim', one('blackness', {}, 200))
add('teslaNova', 'prim', one('teslaNova', {}, 120))
add('cryoNova', 'prim', one('cryoNova', {}, 300, [0, 0, 0.22]))
add('plasmaBurst', 'prim', one('plasmaBurst', { e: undefined }, 160))
add('overheat', 'prim', one('overheat', {}, 200))
add('steamVent', 'prim', one('steamVent', {}, 600))
add('photonFlash', 'prim', one('photonFlash', {}, 120))
add('forceBurst', 'prim', one('forceBurst', { e: undefined }, 160))
add('phaseMark', 'prim', one('phaseMark', { e: undefined }, 700))
add('phasePulse', 'prim', one('phasePulse', { e: undefined }, 160))
add('verdictShot', 'prim', { fakes: [dummy(5)], fx: [{ k: 'verdictShot', dx: 5, dy: 0, dx2: 5, dy2: 0, e: ME }], wait: 90, cam: [2.5, 0, 0.15] })
add('repair', 'prim', one('repair', {}, 500))
add('rotary', 'prim', one('rotary', {}, 200))
add('nukeArm', 'prim', one('nukeArm', {}, 1400, [0, 0, 0.35]))
add('roar', 'prim', one('roar', {}, 260))
add('quake', 'prim', one('quake', {}, 400, [0, 0, 0.35]))
add('xenoBombMark', 'prim', one('xenoBombMark', { e: undefined }, 1500, [0, 0, 0.3]))
add('repairBeam', 'prim', { fakes: [dummy(4)], fx: [{ k: 'repairBeam', e: ME, dx: 4, dy: 0, dx2: 4, dy2: 0 }], wait: 180, cam: [2, 0, 0.14] })

// ── 站點設施 ──
add('cageBuild', 'st', one('cageBuild', { v: 10, e: undefined }, 900))
add('cageDone', 'st', { fakes: [[T, 'fac.cage', 0, 0, { x2: { n: 2 } }]], fx: [{ k: 'cageDone', dx: 0, dy: 0, e: T }], wait: 250, cam: [0, 0, 0.14] })
add('cageBreak', 'st', one('cageBreak', { e: undefined }, 160))
add('fabricate', 'st', one('fabricate', { dx2: 2, dy2: 0, v: 30, e: undefined }, 1200, [1, 0, 0.16]))
add('fabricated', 'st', one('fabricated', {}, 300))
add('factoryStart', 'st', one('factoryStart', { s: 'x' }, 200))
add('moduleDone', 'st', one('moduleDone', { dx2: 2, dy2: 0, s: 'x', e: undefined }, 600, [1, 0, 0.14]))
add('moduleInstall', 'st', one('moduleInstall', { s: 'x' }, 250))
add('gitDraw', 'st', one('gitDraw', {}, 400))
add('neurotoxinGas', 'st', { ...one('neurotoxin', {}, 400), fx: [0, 1, 2].map((i) => ({ k: 'neurotoxin', dx: 0, dy: 0, e: T, at: i * 300 })) })
add('portCharge', 'st', one('portCharge', { v: 3, e: undefined }, 1200))
add('portDepart', 'st', one('portDepart', {}, 220))
add('portArrive', 'st', one('portArrive', {}, 220))
add('portalHop', 'st', one('portalHop', {}, 150))
add('powerMode', 'st', one('powerMode', { s: 'lab', e: undefined }, 400, [0, 0, 0.25]))
add('remote', 'st', one('remote', {}, 300))
add('cannonFireInside', 'st', one('cannonFire', { e: undefined }, 160, [0, 0, 0.2]))

// ── buff 持續視覺 ──
for (const [name, b, fl] of [
  ['stim', ['bf.stim']],
  ['cloak', ['bf.cloak.phase'], 2],
  ['shield', ['bf.chassis.blastShield']],
  ['solace', ['bf.solace']],
  ['forceWard', ['bf.forceWard']],
  ['forcePull', ['bf.force.pull']],
  ['petrify', ['bf.xeno.petrified'], 4096],
  ['cryo', ['bf.cryo.deep']],
  ['burn', ['bf.pyro.burn']],
  ['overheat', ['bf.pyro.overheat']],
  ['acid', ['bf.acid.corrode']],
  ['neurotoxin', ['bf.xeno.neurotoxin']],
  ['sludge', ['bf.mut.sludged']],
  ['rad', ['bf.rad.sick']],
  ['plasmaDrain', ['bf.plasma.drain']],
  ['emp', ['bf.empSilence']],
  ['tesla', ['bf.tesla.charged']],
  ['rage', ['bf.mut.rollingThunder']],
  ['roar', ['bf.mut.roar']],
  ['entropy', ['bf.xeno.entropy']],
  ['flux', ['bf.xeno.fluxSlow']],
  ['stasis', ['bf.xeno.fluxStasis', 'bf.xeno.fluxSlow']],
  ['web', ['bf.xeno.webbed']],
  ['tripped', ['bf.xeno.tripped']],
  ['stun', [], 4],
  ['lifeSupport', ['bf.criticalCare']],
  ['mag', ['bf.mag.sliv']],
  ['photon', ['bf.photon.blind']],
  ['blackness', ['bf.xeno.blackness']],
  ['rotary', ['bf.chassis.rotary']],
  ['gatling', ['bf.gatling.setup']],
  ['void', ['bf.void.phase']],
  ['hatFestive', ['bf.festiveHat']],
  ['hatPirate', ['bf.pirateHat']],
])
  add('buff-' + name, 'buff', { fakes: [dummy(0, 0, { b, fl: fl ?? 0 })], fx: [], wait: 700, cam: [0, 0, 0.06] })
add('buff-hats-models', 'buff', {
  fakes: [
    [T, 'personnel', -1.5, 0, { cl: 'captain', c: 1, b: ['bf.pirateHat'] }],
    [T2, 'xeno.brute', 1.5, 0, { b: ['bf.festiveHat'] }],
    [900003, 'mut.brawn', 0, 1.6, { b: ['bf.pirateHat'] }],
  ],
  fx: [],
  wait: 600,
  cam: [0, 0.5, 0.12],
})
add('buff-stim-run', 'buff', { fakes: [dummy(0, 0, { b: ['bf.stim'] })], fx: [], wait: 900, cam: [0, 0, 0.08], move: T })
add('buff-petrify-xeno', 'buff', { fakes: [[T, 'xeno.brute', 0, 0, { b: ['bf.xeno.petrified'], fl: 4096 }]], fx: [], wait: 600, cam: [0, 0, 0.1] })
add('buff-shield-mut', 'buff', { fakes: [[T, 'mut.brawn', 0, 0, { b: ['bf.mut.blastShield'] }]], fx: [], wait: 600, cam: [0, 0, 0.12] })

// ── 裝置與區域物件 ──
for (const [name, d, zoom] of [
  ['camera', 'dev.camera', 0.06],
  ['motionSensor', 'dev.motionSensor', 0.16],
  ['sentry', 'dev.sentry', 0.06],
  ['forceBarrier', 'dev.forceBarrier', 0.2],
  ['regenBeacon', 'dev.regenBeacon', 0.2],
  ['fusionCharge', 'dev.fusionCharge', 0.04],
  ['protoPortal', 'dev.protoPortal', 0.08],
  ['gitResolver', 'dev.gitResolver', 0.08],
  ['singularity', 'dev.singularity', 0.3],
  ['wormBait', 'dev.wormBait', 0.04],
  ['teslaStorm', 'rig.teslaStorm', 0.22],
  ['plasmaBall', 'rig.plasmaBall', 0.06],
  ['fireField', 'rig.fireField', 0.14],
  ['radZone', 'rig.radZone', 0.22],
  ['acidPool', 'rig.acidPool', 0.16],
  ['cloud', 'rig.blindCloud', 0.16],
  ['drainer', 'rig.drainer', 0.04],
  ['rdg', 'rig.rdg', 0.02],
  ['firefly', 'rig.firefly', 0.08],
  ['energyBank', 'rig.energyBank', 0.06],
  ['metal', 'rig.metal', 0.05],
  ['cage', 'fac.cage', 0.08],
])
  add('dev-' + name, 'dev', { fakes: [[T, d, 0, 0, { mp: 70, mmp: 100, x2: d === 'fac.cage' ? { n: 2 } : undefined }]], fx: [], wait: 900, cam: [0, 0, zoom] })

// ── 太空層 ──
const sp = (name, spec) => add(name, 'space', { space: true, ...spec })
sp('space-solar', { fx: [{ k: 'solar', x: 6.5, y: -2.9 }], wait: 900, cam: [6.5, -2.9, 0.55] })
sp('space-solar-late', { fx: [{ k: 'solar', x: 6.5, y: -2.9 }], wait: 2600, cam: [6.5, -2.9, 0.75] })
sp('space-orbitFail', { fx: [{ k: 'orbitFail', x: 6.5, y: -2.9 }], wait: 1500, cam: [6.5, -2.9, 0.6] })
sp('space-asteroid', { fakes: [[T, 'space.asteroid', 0, 0, { x2: { sc: 2.2 }, f: 1.2 }], [T2, 'space.asteroid', 5, 3, { x2: { sc: 0.8 } }]], fx: [], wait: 1200, cam: [2, 1, 0.1] })
sp('space-asteroidHit', { fx: [{ k: 'asteroidHit', x: 0, y: 0, v: 1.8 }], wait: 300, cam: [0, 0, 0.1] })
sp('space-cannonOrb', { fakes: [[T, 'space.cannonOrb', 0, 0, {}]], fx: [], wait: 800, cam: [0, 0, 0.05] })
sp('space-gravTargeter', { fakes: [[T, 'space.gravTargeter', 0, 0, {}]], fx: [], wait: 600, cam: [0, 0, 0.05] })
sp('space-cannonHit', { fx: [{ k: 'cannonHit', x: 0, y: 0, v: 3 }], wait: 300, cam: [0, 0, 0.12] })
sp('space-atmStrike', { fx: [{ k: 'atmStrike', x: 0, y: 0, v: 3 }], wait: 1000, cam: [0, 0, 0.2] })
sp('space-atmLock', { fx: [{ k: 'atmLock', x: 0, y: 0, v: 60 }], wait: 900, cam: [0, 0, 0.12] })
sp('space-jumpArrive', { fx: [{ k: 'jumpArrive', x: 4, y: 0, x2: -6, y2: 0 }], wait: 200, cam: [0, 0, 0.18] })
sp('space-hiveSpore', { fx: [{ k: 'proj', x: -5, y: 0, x2: 5, y2: 0, v: 8, s: 'hiveSpore' }], wait: 600, cam: [0, 0, 0.1] })
sp('space-shipGun', { fx: [{ k: 'proj', x: -5, y: 0, x2: 5, y2: 0, v: 10, s: 'shipGun' }], wait: 500, cam: [0, 0, 0.1] })

// ── 效能：20 個同時爆炸＋10 個熱融炸彈（量 fx.update 的 CPU 時間與存活物件數）──
const many = (k, n, r, v) => Array.from({ length: n }, (_, i) => ({ k, dx: Math.cos(i * 2.4) * r * Math.sqrt((i + 1) / n), dy: Math.sin(i * 2.4) * r * Math.sqrt((i + 1) / n), v }))
add('perf-20booms', 'perf', { fx: many('boom', 20, 6, 1.75), wait: 250, cam: [0, 0, 0.45], perf: true })
add('perf-10fusion', 'perf', { fx: many('fusion', 10, 6, 5.5), wait: 400, cam: [0, 0, 0.55], perf: true })

const want = (name, group) => !filter.length || filter.some((f) => f === group || name.includes(f))

const T00 = Date.now()
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: Number(process.env.XC_W ?? 1024), height: Number(process.env.XC_H ?? 576) } })
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300))
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.addInitScript((q) => localStorage.setItem('xc.quality', q), q)
await page.goto(base + '?net=bc')
await page.waitForTimeout(1500)
await page.getByTestId('name').fill('FxGallery')
await page.getByTestId('create').click()
await page.getByTestId('lobby').waitFor({ timeout: 30000 })
await page.getByTestId('start').click()
console.log('starting', ((Date.now() - T00) / 1000).toFixed(1) + 's')
await page.waitForFunction(() => window.__xcScene && window.__xcScene.myUnit(), null, { timeout: 180000 })
console.log('in game', ((Date.now() - T00) / 1000).toFixed(1) + 's')
await page.waitForTimeout(3000)
await page.evaluate(() => window.__xcTest.hook('vision', [0, true]))
// 只看畫面：隱藏 HUD
await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas.view { visibility: visible !important; }' })
await page.evaluate(() => {
  const G = {
    base: null,
    fakes: [],
    gs: () => window.__xcScene,
    init() {
      const gs = this.gs()
      const u = gs.myUnit()
      this.base = { x: u.x, y: u.y, z: gs.zone, me: u.s.i }
    },
    abs(dx, dy) {
      return { x: this.base.x + dx, y: this.base.y + dy }
    },
    fake(id, d, dx, dy, extra, space) {
      const gs = this.gs()
      const p = space ? { x: dx, y: dy } : this.abs(dx, dy)
      const s = { i: id, d, z: space ? 0 : this.base.z, x: Math.round(p.x * 100), y: Math.round(p.y * 100), f: -157, hp: 100, mhp: 100, o: -1, c: -1, st: 0, ...extra }
      for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k]
      gs.world.ents.set(id, { s, samples: [], x: p.x, y: p.y, f: (extra.f ?? -1.57), firstSeen: 0, lastUpdate: 0 })
      this.fakes.push(id)
    },
    clear() {
      for (const id of this.fakes) this.gs().world.ents.delete(id)
      this.fakes = []
      this.gs().fx.clear()
    },
    fx(f, space) {
      const gs = this.gs()
      const ev = { ...f, z: space ? 0 : this.base.z }
      const me = this.base.me
      if (ev.e === 'me') ev.e = me
      if (ev.e2 === 'me') ev.e2 = me
      if (!space) {
        if (ev.dx !== undefined) Object.assign(ev, this.abs(ev.dx, ev.dy))
        if (ev.dx2 !== undefined) {
          const p = this.abs(ev.dx2, ev.dy2)
          ev.x2 = p.x
          ev.y2 = p.y
        }
        if (ev.x === undefined) Object.assign(ev, this.abs(0, 0))
      }
      delete ev.dx
      delete ev.dy
      delete ev.dx2
      delete ev.dy2
      delete ev.at
      for (const k of Object.keys(ev)) if (ev[k] === undefined) delete ev[k]
      gs.world.onFx(ev)
    },
    cam(dx, dy, zoom, space) {
      // zoom 0..1 → 鏡頭距離 5..45 m（比遊戲內允許的更近，方便看細節）
      const gs = this.gs()
      const p = space ? { x: dx, y: dy } : this.abs(dx, dy)
      gs.rts.follow = null
      gs.rts.minDist = 4
      gs.rts.maxDist = 60
      gs.rts.jump(p.x, p.y)
      gs.rts.zoom = (5 + 40 * zoom - 4) / 56
      gs.rts.zs = gs.rts.zoom
    },
    /**
     * 逐幀驅動：每幀 render 完 gl.finish()（避免 SwiftShader 堆積幀），特效時鐘每幀固定前進 fdt 秒，
     * 截圖等「第 N 幀」render 完後立刻讀 canvas — 結果與 GPU 快慢無關
     */
    install(fdt) {
      const gs = this.gs()
      const canvas = document.querySelector('canvas.view')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      const up = gs.update
      const G = window.__fxg
      G.fdt = fdt
      G.waiters = []
      G.frame = 0
      gs.update = function (dt, t) {
        up.call(this, dt, t)
        G.frame++
        queueMicrotask(() => {
          gl.finish()
          const ready = G.waiters.filter((w) => G.frame >= w.at)
          G.waiters = G.waiters.filter((w) => G.frame < w.at)
          for (const w of ready) w.res(w.cap ? canvas.toDataURL('image/jpeg', 0.92) : G.frame)
        })
      }
      const fx = gs.fx
      const fu = fx.update.bind(fx)
      let ft = null
      fx.update = (_dt, t, z) => {
        if (ft === null) ft = t
        ft += G.fdt
        const a = performance.now()
        fu(G.fdt, ft, z)
        if (G.perf) G.perf.push(performance.now() - a)
      }
    },
    frames(n, cap = false) {
      return new Promise((res) => this.waiters.push({ at: this.frame + Math.max(1, n), res, cap }))
    },
    space(on) {
      const gs = this.gs()
      if (on) {
        const o = { zone: 0, x: 0, y: 0 }
        gs.viewOverride = () => o
      } else gs.viewOverride = null
    },
  }
  window.__fxg = G
  G.init()
})
await page.evaluate((k) => window.__fxg.install(k), FDT)

let inSpace = false
const T0 = Date.now()
for (const [name, group, spec] of S) {
  if (!want(name, group)) continue
  const space = !!spec.space
  if (space !== inSpace) {
    await page.evaluate((on) => window.__fxg.space(on), space)
    inSpace = space
    await page.evaluate(() => window.__fxg.frames(4))
  }
  const tp = Date.now()
  const lapP = (s) => process.env.XC_PROF && console.log('  ', s, Date.now() - tp)
  await page.evaluate(([fakes, space]) => {
    window.__fxg.clear()
    for (const [id, d, dx, dy, extra] of fakes) window.__fxg.fake(id, d, dx, dy, extra ?? {}, space)
  }, [spec.fakes ?? [], space])
  await page.evaluate(([c, space]) => window.__fxg.cam(c[0], c[1], c[2], space), [spec.cam ?? [0, 0, 0.15], space])
  lapP('fakes')
  // 讓視圖建好、鏡頭到位
  await page.evaluate(() => window.__fxg.frames(3))
  lapP('settle')
  if (spec.move) {
    // 讓假人移動（殘影只在移動時出現）
    await page.evaluate((id) => {
      const gs = window.__xcScene
      const e = gs.world.ents.get(id)
      const x0 = e.x
      let k = 0
      const up = gs.fx.update
      gs.fx.update = (dt, t, z) => {
        k += dt
        e.x = x0 + Math.sin(k * 3) * 1.5
        up(dt, t, z)
        if (k > 6) gs.fx.update = up
      }
    }, spec.move)
  }
  await page.evaluate((on) => (window.__fxg.perf = on ? [] : null), !!spec.perf)
  fdtNow = spec.fdt ?? FDT
  await page.evaluate((k) => (window.__fxg.fdt = k), fdtNow)
  let frame = 0
  for (const f of spec.fx ?? []) {
    const at = nf(f.at ?? 0)
    if (f.at && at > frame) {
      await page.evaluate((n) => window.__fxg.frames(n), at - frame)
      frame = at
    }
    await page.evaluate(([f, space]) => window.__fxg.fx(f, space), [f, space])
  }
  lapP('fx')
  if (spec.seq) {
    // 時間序列：同一個特效在幾個時間點各截一張（name-1、name-2…）
    let prev = 0
    for (let i = 0; i < spec.seq.length; i++) {
      const u = await page.evaluate((n) => window.__fxg.frames(n, true), nf(spec.seq[i]) - prev)
      prev = nf(spec.seq[i])
      writeFileSync(`${out}/${name}-${i + 1}.jpg`, Buffer.from(u.split(',')[1], 'base64'))
    }
  } else {
    const url = await page.evaluate((n) => window.__fxg.frames(n, true), nf(spec.wait ?? 300))
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(url.split(',')[1], 'base64'))
  }
  lapP('capture')
  console.log('shot', name, ((Date.now() - T0) / 1000).toFixed(1) + 's', JSON.stringify(await page.evaluate(() => window.__xcScene.fx.stats())))
  if (spec.perf) {
    await page.evaluate(() => window.__fxg.frames(20))
    const ms = await page.evaluate(() => {
      const a = window.__fxg.perf ?? []
      const s = [...a].sort((x, y) => x - y)
      return { frames: a.length, avg: a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), p95: s[Math.floor(s.length * 0.95)] ?? 0, max: s[s.length - 1] ?? 0 }
    })
    console.log('perf', name, JSON.stringify(ms), JSON.stringify(await page.evaluate(() => window.__xcScene.fx.stats())))
  }
}
await page.evaluate(() => window.__fxg.clear())
await browser.close()
