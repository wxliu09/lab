// 變身過場（美術聖經 §9：裂開、蠕動、光爆）。褪去人皮、披回人皮、結繭、破繭進化共用同一套：
//   1. 舊外形（變身前最後看到的視圖）留在原地顫抖、扭動、鼓脹，發光的裂紋爬滿全身；
//   2. 裂開：光爆、衝擊環、鏡頭震動、碎皮與體液，地上留下一張蛻下的皮；
//   3. 新外形延後到裂開那一刻才出現，彈出 0.7 → 1.05 → 1。
// 資訊隔離：只用公開的變身特效（xenoShift／cocoon／evolved，送給看得到的人）、快照裡的實體與自己最後看到的視圖。
// 詠唱中的顫抖與裂紋（第 0 步）只有施法者自己與知情的同陣營看得到（快照的 Mine／Ally 旗標）：
// 旁觀者看到的詠唱和其他技能一樣只有施法圈，詠唱被打斷也不會因此露餡。
import * as THREE from 'three'
import { regFx } from '../fxBinding'
import type { GameScene } from '../gameScene'
import type { ClientWorld } from '../../client/world'
import type { FxEvent } from '../../shared/protocol/messages'
import { EntFlag } from '../../shared/protocol/messages'
import { UNITS } from '../../shared/content/registry'
import { sfx } from '../../audio/sfx'
import { shake } from './kit'

interface MorphLook {
  /** 裂紋核心色、外暈色 */
  c: string
  c2: string
  flash: string
  ring: string
  /** 蛻下的皮（地上貼花）*/
  skin: string
  skinOp: number
  /** 體液（地上）*/
  pool?: string
  flesh: string[]
  metal?: boolean
  /** 舊外形掙扎多久才裂開（秒）*/
  dur: number
  shake: number
  /** 光爆／衝擊環的尺寸倍率 */
  size: number
}

const XENO: MorphLook = { c: '#c9b6ff', c2: '#7a3cff', flash: '#b28cff', ring: '#7a3cff', skin: '#c49a88', skinOp: 0.85, pool: '#1e0c34', flesh: ['#c49a88', '#7a3cff', '#3a1a5a'], dur: 0.42, shake: 0.35, size: 1 }
/** 披回人皮：異形甲殼裂開、縮回人形 */
const XENO_BACK: MorphLook = { ...XENO, c: '#7affe0', c2: '#33ffd1', flash: '#7affe0', ring: '#33ffd1', skin: '#2a1440', skinOp: 0.9, flesh: ['#2a1440', '#3a1a5a', '#33ffd1'] }
const COCOON_X: MorphLook = { ...XENO, c: '#7affe0', c2: '#33ffd1', skin: '#1e0c34', pool: '#12302a', flesh: ['#1e3a34', '#3a1a5a', '#33ffd1'], dur: 0.5, size: 1.3 }
const COCOON_M: MorphLook = { c: '#ffcf7a', c2: '#c8323c', flash: '#ff7a4a', ring: '#c8323c', skin: '#4a1414', skinOp: 0.9, pool: '#2a0204', flesh: ['#5a1414', '#c8323c', '#e8b04a'], dur: 0.5, shake: 0.35, size: 1.3 }
const EVOLVE_X: MorphLook = { ...COCOON_X, flash: '#b28cff', ring: '#b28cff', skin: '#2a1440', dur: 0.55, shake: 0.5, size: 1.8 }
const EVOLVE_M: MorphLook = { ...COCOON_M, dur: 0.55, shake: 0.5, size: 1.8 }
const EVOLVE_A: MorphLook = { c: '#ffe0a0', c2: '#ffb000', flash: '#fff0d0', ring: '#ffb000', skin: '#6a6e74', skinOp: 0.7, flesh: [], metal: true, dur: 0.55, shake: 0.5, size: 1.6 }

/** 會觸發變身過場的詠唱（自己與同陣營才看得到詠唱中的裂紋）*/
const SHIFT_ABILITIES: Record<string, MorphLook> = {
  'xeno.form': XENO,
  'xeno.spawnForm': XENO,
  'xeno.human': XENO_BACK,
  'xeno.spawnHuman': XENO_BACK,
}

/**
 * 詠唱開始（castStart）時呼叫：觀看者本來就知道這是變身（施法者是自己、或快照標成同陣營）才顯示顫抖與裂紋。
 * 回傳是否顯示
 */
export function castStrain(gs: GameScene, w: ClientWorld, f: FxEvent, dur: number): boolean {
  const M = f.s ? SHIFT_ABILITIES[f.s] : undefined
  if (!M || !f.e) return false
  const fl = w.ents.get(f.e)?.s.fl ?? 0
  if (!(fl & (EntFlag.Mine | EntFlag.Ally))) return false
  gs.units.strain(f.e, dur, M.c, M.c2)
  return true
}

/** 共用的變身過場 */
function morph(gs: GameScene, w: ClientWorld, f: FxEvent, M: MorphLook, sound?: string): number {
  const z = f.z
  const x = f.x
  const y = f.y
  const husk = gs.units.takeHusk(x, y, f.e, (id) => !w.ents.has(id), M.dur + 0.15)
  const splitAt = husk ? M.dur : 0
  gs.units.popIn(f.e, splitAt)
  if (sound) sfx(sound, x, y)
  const H = husk?.height ?? 1.8
  const s = M.size * Math.max(0.8, Math.min(2.2, H / 1.9))
  if (husk) {
    const rig = husk.rig
    const k0 = husk.crackK
    let last = 0
    gs.fx.light(z, x, y, H * 0.6, M.c2, 14 * s, 4 * s, M.dur + 0.05, { attack: 0.9, flicker: 0.3 })
    gs.fx.addTransient(new THREE.Object3D(), M.dur, z, (k, t) => {
      const e = k * k
      gs.units.setCracks(husk, Math.min(1, k0 + (1 - k0) * Math.min(1, k * 1.3)), M.c, M.c2)
      const amp = 0.012 + 0.055 * e
      husk.body.position.set((Math.random() - 0.5) * amp, 0, (Math.random() - 0.5) * amp)
      husk.body.rotation.set(0.16 * k + Math.sin(t * 37) * 0.07 * k, Math.sin(t * 21) * 0.12 * k, Math.sin(t * 29) * 0.08 * k)
      const bulge = 1 + 0.1 * e + 0.035 * Math.sin(t * 47) * k
      husk.body.scale.set(bulge, 1 - 0.05 * k, bulge)
      if (rig) {
        // 弓身、抱住身體、頭往後仰的抽搐
        rig.torso.rotation.x = 0.5 * k + Math.sin(t * 27) * 0.1 * k
        rig.head.rotation.x = -0.2 * k + Math.sin(t * 19) * 0.25 * k
        rig.armL.rotation.x = -0.5 - 0.8 * k + Math.sin(t * 33) * 0.3 * k
        rig.armR.rotation.x = -0.5 - 0.8 * k + Math.sin(t * 31 + 1) * 0.3 * k
      }
      // 裂縫漏出來的光點
      if (t - last > 0.05) {
        last = t
        gs.fx.emit(z, x, y, H * (0.25 + Math.random() * 0.6), 2, { color: M.c, color2: M.c2, speed: 0.9 + k * 1.5, life: 0.45, size: 0.12, up: 0.4, area: 0.22 * s })
      }
    })
  }
  gs.fx.after(splitAt, () => split(gs, z, x, y, H, s, M, husk?.root ?? null))
  return splitAt
}

/** 裂開的那一刻 */
function split(gs: GameScene, z: number, x: number, y: number, H: number, s: number, M: MorphLook, husk: THREE.Object3D | null): void {
  if (husk) husk.visible = false
  const hc = Math.min(1.4, H * 0.55)
  gs.fx.flash(z, x, y, hc, M.flash, 0.9 * s, 0.22)
  gs.fx.shock(z, x, y, 2.4 * s, M.ring, 0.5)
  gs.fx.ring(z, x, y, 0.3, 1.2 * s, '#ffffff', 0.22, { tex: 'ring', k: 2.6 })
  gs.fx.emit(z, x, y, hc, Math.round(26 * s), { color: M.c, color2: M.c2, speed: 3.2, life: 0.7, size: 0.22, up: 0.8, drag: 2.2, hArea: H * 0.5 })
  if (M.metal) {
    gs.fx.emit(z, x, y, hc, 30, { color: '#ffffff', color2: M.c2, speed: 5, life: 0.5, size: 1, up: 0.8, grav: 8, layer: 'spark' })
    gs.fx.debris(z, x, y, hc, 10, 'metal', { speed: 3.4, size: 0.07 })
    gs.fx.emit(z, x, y, 0.4, 10, { color: '#d8e0e6', speed: 1.2, life: 1.4, size: 0.6, grow: 2.2, up: 0.6, drag: 1.5, layer: 'smoke', alpha: 0.45, area: 0.4 })
  } else {
    // 碎皮與體液：濺開的碎片＋往下滴的液滴＋一團暗色濕氣
    gs.fx.debris(z, x, y, hc, Math.round(9 * s), 'flesh', { speed: 3.2, size: 0.07 * Math.sqrt(s), colors: M.flesh, up: 1 })
    gs.fx.emit(z, x, y, hc, Math.round(16 * s), { color: M.c2, color2: M.pool ?? M.c2, speed: 3, life: 0.7, size: 0.07, up: 0.9, grav: 10, drag: 0.5 })
    gs.fx.emit(z, x, y, 0.5, Math.round(8 * s), { color: M.pool ?? '#1a0a2a', speed: 1.2, life: 1.5, size: 0.7 * s, grow: 2.2, up: 0.5, drag: 1.4, layer: 'smoke', alpha: 0.6 })
  }
  // 蛻下的皮（與體液）留在地上
  gs.fx.decal(z, x, y, 1.5 * s, 'husk', M.skin, 24, { opacity: M.skinOp, fadeIn: 0.01 })
  if (M.pool) gs.fx.decal(z, x, y, 1.1 * s, 'pool', M.pool, 22, { opacity: 0.85, grow: 1.8, growT: 1.6, fadeIn: 0.01 })
  gs.fx.light(z, x, y, hc + 0.4, M.flash, 60 * s, 6 * s, 0.35)
  shake(gs, M.shake, x, y)
  sfx(M.metal ? 'shatterMetal' : 'squelch', x, y)
}

// ───────── 事件 ─────────

regFx('xenoShift', (gs, w, f) => {
  // 新外形是人形 → 披回人皮（異形甲殼裂開）；否則褪去人皮（人皮裂開）
  const d = f.e ? w.ents.get(f.e)?.s.d : undefined
  const back = UNITS.get(d ?? '')?.model === 'human'
  morph(gs, w, f, back ? XENO_BACK : XENO, 'morph')
})

regFx('cocoon', (gs, w, f) => {
  const mut = f.s === 'mutant'
  morph(gs, w, f, mut ? COCOON_M : COCOON_X, 'squelch')
  // 結繭：繭的四周一圈黏液
  gs.fx.decal(f.z, f.x, f.y, 2.4, 'splat', mut ? '#4a1414' : '#1e0c34', 20, { opacity: 0.8 })
})

regFx('evolved', (gs, w, f) => {
  const s = f.s ?? ''
  const M = s.startsWith('mut.') ? EVOLVE_M : s.startsWith('android.') || s.startsWith('chassis') ? EVOLVE_A : EVOLVE_X
  const at = morph(gs, w, f, M, 'evolve')
  // 破繭的餘波：大範圍衝擊環與光點（裂開時）
  gs.fx.after(at, () => {
    gs.fx.shock(f.z, f.x, f.y, 5, M.ring, 1)
    gs.fx.emit(f.z, f.x, f.y, 0.8, 60, { color: M.flash, color2: M.c2, speed: 5, life: 1, size: 0.4, up: 1 })
  })
})
