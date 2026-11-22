// 死亡的收尾：依「死前最後看到的樣子」噴濺（偽裝成人的異形死在人形時就是人的血；遊戲本身揭穿了才會不一樣），
// 倒地後留下一灘慢慢擴散、過一陣子淡掉的液體；大型單位再加鏡頭震動與低沉悶響。
//
// 觸發只看 sim 的死亡特效（k: 'die'）：sim 只把它送給「上一份快照就看得到這個單位、也看得到死亡地點」的人，
// 只帶 id 與位置；外觀由 client 自己最後看到的視圖決定（units.look），一次死亡只有一個事件，不會重複。
// 沒有視圖（別的 zone、從沒看到）就不做。不讀任何身分欄位。
import { regFx } from '../fxBinding'
import type { GameScene } from '../gameScene'
import type { UnitLook } from '../units'
import { sfx } from '../../audio/sfx'
import { familyOf } from '../../audio/combat'
import { UNITS, isZoneObject } from '../../shared/content/registry'
import { EntFlag } from '../../shared/protocol/messages'
import { shake } from './kit'

export type DeathKind = 'human' | 'suit' | 'beast' | 'mutant' | 'goo' | 'xeno' | 'xenoGoo' | 'android' | 'machine' | 'stone' | 'mirage' | 'none'

const GOO = /slime|prion|egg|cocoon|sludge|slug/
const FAILED = /creature\.(failed|freakman)/

/** 外觀 def＋可見旗標 → 死亡噴濺的種類（只看快照裡看得到的東西）*/
export function deathKind(l: { d: string; fl: number }): DeathKind {
  if (l.fl & EntFlag.Petrified) return 'stone'
  // 盟友才看得到的「幻象」旗標：知情的人看到的是幻象消散，不是血
  if (l.fl & EntFlag.Hallucination) return 'mirage'
  const d = l.d
  if (!d || d.startsWith('item:') || d.startsWith('station.')) return 'none'
  const def = UNITS.get(d)
  if (!def || isZoneObject(def) || def.tags.includes('corpse') || def.tags.includes('noTarget')) return 'none'
  if (def.tags.includes('chassis') || d.startsWith('android.')) return 'android'
  if (d.startsWith('suit.')) return 'suit'
  if (d.startsWith('xeno.')) return d === 'xeno.human' ? 'human' : GOO.test(d) ? 'xenoGoo' : 'xeno'
  if (d.startsWith('mut.')) return GOO.test(d) ? 'goo' : 'mutant'
  if (FAILED.test(d)) return 'mutant'
  if (GOO.test(d)) return 'goo'
  const fam = familyOf(d)
  if (fam === 'machine') return 'machine'
  if (fam === 'human') return 'human'
  if (fam === 'critter' || fam === 'beast') return 'beast'
  if (def.tags.includes('structure') || def.tags.includes('device') || def.tags.includes('drone') || def.tags.includes('mechanical')) return 'machine'
  return def.tags.includes('organic') || def.tags.includes('personnel') ? 'human' : 'none'
}

interface Fluid {
  /** 噴霧（smoke 層，非 additive）*/
  mist: string
  mist2: string
  /** 液滴 */
  drop: string
  drop2: string
  /** 液滴自己會發光（異形體液）*/
  glow?: boolean
  /** 地上那一灘（正常混色）*/
  pool: string
  poolOp: number
  /** 加一層會慢慢暗掉的發光液面 */
  glowPool?: string
  /** 命中點的光爆顏色 */
  flash: string
  flesh: string[]
  bone?: boolean
}

const FLUID: Partial<Record<DeathKind, Fluid>> = {
  human: { mist: '#8a1018', mist2: '#2a0306', drop: '#c0141e', drop2: '#3a0306', pool: '#4a0306', poolOp: 0.88, flash: '#ff3a2a', flesh: ['#7a1e28', '#5a0a10', '#c8323c'] },
  beast: { mist: '#8a1018', mist2: '#2a0306', drop: '#c0141e', drop2: '#3a0306', pool: '#4a0306', poolOp: 0.85, flash: '#ff3a2a', flesh: ['#7a1e28', '#5a2a22', '#8a5a3a'] },
  mutant: { mist: '#3e080a', mist2: '#140203', drop: '#5e0a0e', drop2: '#200203', pool: '#2a0204', poolOp: 0.92, flash: '#ff5a2a', flesh: ['#5a1414', '#3a0a0a', '#e8b04a'], bone: true },
  goo: { mist: '#4a5a1a', mist2: '#1a2208', drop: '#c8e040', drop2: '#5a7a10', pool: '#3e4e12', poolOp: 0.85, glowPool: '#a8c040', flash: '#d8ff6a', flesh: ['#5a6a1a', '#8a9a3a', '#3a4a10'] },
  xeno: { mist: '#36185a', mist2: '#10061c', drop: '#33ffd1', drop2: '#7a3cff', glow: true, pool: '#1e0c34', poolOp: 0.9, glowPool: '#33ffd1', flash: '#b28cff', flesh: ['#3a1a5a', '#7a3cff', '#1a0a2a'] },
  xenoGoo: { mist: '#1e3a34', mist2: '#0a1412', drop: '#33ffd1', drop2: '#1e6a5a', glow: true, pool: '#12302a', poolOp: 0.85, glowPool: '#33ffd1', flash: '#7affe0', flesh: ['#1e3a34', '#3a1a5a', '#33ffd1'] },
  // 仿生人：白色冷卻液（噴出時汽化成白霧）＋電火花
  android: { mist: '#e8f4ff', mist2: '#9fb8c8', drop: '#eaf8ff', drop2: '#7fb8d0', pool: '#b8dce8', poolOp: 0.55, flash: '#ffffff', flesh: [] },
}

function play(gs: GameScene, z: number, L: UnitLook, kind: DeathKind): void {
  const s = Math.max(0.7, Math.min(2.4, L.h / 1.9))
  const hc = Math.min(1.5, L.h * 0.55)
  const dir = L.dir ?? undefined
  // 倒地的方向：人形以腳為支點往後倒（軀幹落在原地後方約 0.7 m）
  const bx = L.x - L.fx * (L.human ? 0.36 * L.h : 0)
  const by = L.y - L.fy * (L.human ? 0.36 * L.h : 0)
  const land = L.human ? 0.4 : 0.15
  const fluid = FLUID[kind]
  if (fluid) {
    // 命中點：小光爆（暗處也讀得到）＋血霧＋液滴（受重力落地）＋碎塊
    gs.fx.flash(z, L.x, L.y, hc, fluid.flash, 0.35 * s, 0.12)
    // 噴出的一瞬間：一小團亮色（暗處也讀得到的「噗」）
    gs.fx.emit(z, L.x, L.y, hc, Math.round(8 * s), { color: fluid.flash, color2: fluid.mist2, speed: 2.8, life: 0.28, size: 0.2 * s, up: 0.4, drag: 3, dir, spread: dir ? 0.6 : undefined })
    gs.fx.emit(z, L.x, L.y, hc, Math.round(13 * s), { color: fluid.mist, color2: fluid.mist2, speed: 2.5, life: 1.2, size: 0.42 * s, grow: 2.6, up: 0.3, drag: 3, dir, spread: dir ? 0.75 : undefined, layer: 'smoke', alpha: kind === 'android' ? 0.6 : 0.85 })
    gs.fx.emit(z, L.x, L.y, hc, Math.round(24 * s), { color: fluid.drop, color2: fluid.drop2, speed: 3.6, life: 0.85, size: 0.1 * Math.sqrt(s), grow: 0.8, up: 0.9, grav: 11, drag: 0.5, dir, spread: dir ? 0.9 : undefined, layer: fluid.glow ? 'glow' : 'smoke', alpha: 0.95 })
    if (fluid.flesh.length) gs.fx.debris(z, L.x, L.y, hc, Math.round(4 * s), 'flesh', { speed: 2.6, size: 0.05 * s, colors: fluid.flesh, dir, spread: 0.9 })
    if (fluid.bone) gs.fx.debris(z, L.x, L.y, hc, 3, 'bone', { speed: 2.2, size: 0.04 * s, life: 1.6 })
    if (kind === 'android') {
      // 冷卻液汽化的白霧往上竄＋電火花＋零件
      gs.fx.emit(z, L.x, L.y, hc, 8, { color: '#f4fbff', color2: '#b8d0dc', speed: 0.8, life: 1.6, size: 0.45, grow: 2.4, up: 1.6, drag: 1.4, layer: 'smoke', alpha: 0.45 })
      gs.fx.emit(z, L.x, L.y, hc, 22, { color: '#ffffff', color2: '#ffb000', speed: 4.5, life: 0.45, size: 1, up: 0.8, grav: 9, layer: 'spark' })
      gs.fx.debris(z, L.x, L.y, hc, 5, 'metal', { speed: 2.8, size: 0.06 })
      for (let i = 0; i < 4; i++) gs.fx.after(0.12 + i * 0.22, () => gs.fx.emit(z, L.x + (Math.random() - 0.5) * 0.5, L.y + (Math.random() - 0.5) * 0.5, 0.3, 6, { color: '#ffffff', color2: '#7fd8ff', speed: 2.4, life: 0.3, size: 1, up: 0.9, grav: 8, layer: 'spark' }))
    }
    if (kind === 'suit') gs.fx.emit(z, L.x, L.y, hc, 10, { color: '#ffffff', color2: '#ffc23d', speed: 3.5, life: 0.35, size: 1, up: 0.7, grav: 9, layer: 'spark' })
    // 倒地：一灘慢慢擴散的液體（2 秒長到最大、30 秒後淡掉）＋地面揚起的灰
    const size = 0.5 * s
    gs.fx.after(land, () => {
      gs.fx.decal(z, bx, by, size, 'pool', fluid.pool, 30, { opacity: fluid.poolOp, grow: 2.7, growT: 2.2, fadeIn: 0.01 })
      gs.fx.decal(z, (bx + L.x) / 2, (by + L.y) / 2, 1.1 * s, 'splat', fluid.pool, 24, { opacity: fluid.poolOp * 0.55, fadeIn: 0.01 })
      if (fluid.glowPool) gs.fx.decal(z, bx, by, size * 1.3, 'pool', fluid.glowPool, 8, { add: true, k: 0.5, opacity: 0.42, grow: 1.7, growT: 2.2 })
      gs.fx.emit(z, bx, by, 0.08, Math.round(6 * s), { color: '#6a625a', speed: 1.4 * s, life: 0.9, size: 0.4 * s, grow: 2, up: 0.15, drag: 3, layer: 'smoke', alpha: 0.35, area: 0.25 * s, radial: 1 })
    })
  } else if (kind === 'machine') {
    gs.fx.flash(z, L.x, L.y, hc, '#ffd9a0', 0.45 * s, 0.14)
    gs.fx.emit(z, L.x, L.y, hc, Math.round(26 * s), { color: '#ffffff', color2: '#ff8a2a', speed: 4.5, life: 0.5, size: 1, up: 0.8, grav: 9, layer: 'spark' })
    gs.fx.emit(z, L.x, L.y, hc, Math.round(7 * s), { color: '#2a2622', speed: 0.9, life: 2, size: 0.55 * s, grow: 2.2, up: 1.1, drag: 1.2, layer: 'smoke', alpha: 0.6 })
    gs.fx.debris(z, L.x, L.y, hc, Math.round(6 * s), 'metal', { speed: 3, size: 0.07 * s })
    gs.fx.decal(z, L.x, L.y, 1.2 * s, 'scorch', '#ffffff', 20, { opacity: 0.6 })
    gs.fx.light(z, L.x, L.y, hc + 0.3, '#ffb46b', 20 * s, 4 * s, 0.25)
  } else if (kind === 'stone') {
    // 石像碎裂：沒有血，只有石塊與粉塵
    gs.fx.debris(z, L.x, L.y, hc, Math.round(10 * s), 'rock', { speed: 2.6, size: 0.09 * s, up: 0.6 })
    gs.fx.emit(z, L.x, L.y, hc * 0.6, Math.round(10 * s), { color: '#8a8278', speed: 1.4, life: 1.4, size: 0.55 * s, grow: 2.2, up: 0.4, drag: 2, layer: 'smoke', alpha: 0.55, hArea: L.h * 0.6 })
    gs.fx.decal(z, L.x, L.y, 1.3 * s, 'crack', '#1a1612', 20, { opacity: 0.7 })
    sfx('crumble', L.x, L.y)
  } else if (kind === 'mirage') {
    gs.fx.emit(z, L.x, L.y, hc, 24, { color: '#c9b6ff', color2: '#33ffd1', speed: 1.6, life: 0.6, size: 0.18, up: 0.6, area: 0.35, hArea: L.h * 0.7 })
    gs.fx.ring(z, L.x, L.y, 0.9, 0.1, '#b28cff', 0.35, { tex: 'ring', k: 2 })
  }
  if (L.big && kind !== 'mirage') {
    // 大型單位：鏡頭震動＋低沉悶響（機械再加一聲爆）
    shake(gs, 0.42, L.x, L.y)
    gs.fx.after(land * 0.6, () => {
      sfx('thud', L.x, L.y)
      if (kind === 'machine' || kind === 'android') sfx('boom', L.x, L.y)
      else if (kind !== 'stone') sfx('squelch', L.x, L.y)
      gs.fx.ring(z, L.x, L.y, L.radius, L.radius * 3.2, '#a89a88', 0.5, { tex: 'ring', k: 0.8, add: false, opacity: 0.45 })
    })
  }
}

/** 最近被 mirageBreak 揭穿的幻象位置：同一處的死亡不噴血（遊戲本身已經公開那是幻象）*/
const mirages: { z: number; x: number; y: number; t: number }[] = []

export function noteMirageBreak(gs: GameScene, z: number, x: number, y: number): void {
  mirages.push({ z, x, y, t: gs.fx.time })
  if (mirages.length > 8) mirages.shift()
}

function wasMirage(gs: GameScene, z: number, x: number, y: number): boolean {
  const t = gs.fx.time
  return mirages.some((m) => m.z === z && t - m.t < 0.6 && Math.hypot(m.x - x, m.y - y) < 1)
}

regFx('die', (gs, _w, f) => {
  if (f.z === 0) return
  const L = gs.units.look(f.e)
  if (!L) return
  const kind = deathKind(L)
  if (kind === 'none') return
  const red = kind === 'human' || kind === 'beast' || kind === 'mutant' || kind === 'suit'
  if (red && L.mobile) gs.units.markDeath(L.x, L.y, L.dir)
  // 幻象的 mirageBreak 跟在同一份快照的 die 後面：延到下一幀再看是不是幻象
  gs.fx.after(0, () => {
    if (!wasMirage(gs, f.z, L.x, L.y)) play(gs, f.z, L, kind === 'suit' ? 'suit' : kind)
  })
})

// 防護服：人的血＋金屬火花（FLUID 沒有 suit，play 裡用 human 的液體）
FLUID.suit = FLUID.human
