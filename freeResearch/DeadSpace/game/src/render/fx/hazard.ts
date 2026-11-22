// 爆炸預警（熱融炸彈、戰術核爆、遠爆種）：細的脈動外框＋黃黑斜紋警示帶＋很淡的填色＋順時針的倒數扇形。
// 顏色用警示色（琥珀黃＋黑，美術聖經 §3.1「警示」），和燃燒的地板（橘）、敵意（紅）分得開；
// 不是整片實心圓盤，看得到底下的地板與人。爆炸的那一刻（fusion／boom 特效）立刻切掉，不會蓋在火球上；
// 炸彈在倒數中被打壞（實體消失）就很快淡掉。
import * as THREE from 'three'
import type { GameScene } from '../gameScene'
import type { ClientWorld } from '../../client/world'
import { GEO } from '../fx'
import { W } from './kit'

const VERT = `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAG = `
uniform float uR;
uniform float uT;
uniform float uK;
uniform float uA;
uniform float uHz;
uniform vec3 uAmber;
varying vec2 vP;
void main() {
  float r = length(vP) * uR;
  if (r > uR) discard;
  float band = min(0.34, uR * 0.12);
  float inBand = step(uR - band, r);
  float ang = atan(vP.y, vP.x);
  // 斜紋：沿圓周的弧長＋徑向距離 → 45° 斜線，慢慢往前跑
  float stripe = step(0.5, fract((ang * uR + r) / 0.42 - uT * 0.7));
  vec3 bandCol = mix(vec3(0.025, 0.022, 0.02), uAmber, stripe);
  // 外框細線（越接近引爆脈動越快）與警示帶內緣
  float pulse = 0.5 + 0.5 * sin(uT * uHz * 6.2831);
  float line = 1.0 - smoothstep(0.0, 0.05, abs(r - uR + 0.03));
  float inner = 1.0 - smoothstep(0.0, 0.035, abs(r - (uR - band)));
  // 往中心收的脈動環（每拍一圈）
  float wave = (1.0 - smoothstep(0.0, 0.09, abs(r - (uR - band) * (1.0 - fract(uT * uHz))))) * 0.3;
  // 倒數扇形：從 12 點鐘方向順時針掃過已經過去的時間
  float u = fract((ang + 1.5708) / 6.2831);
  float swept = step(u, uK);
  float hand = (1.0 - smoothstep(0.0, 0.012, abs(u - uK))) * 0.55;
  float fill = 0.035 + 0.035 * uK + swept * 0.05 + hand;
  float la = clamp(line * (0.55 + 0.45 * pulse) + inner * 0.45 + (wave + fill) * (1.0 - inBand), 0.0, 1.0);
  vec3 c = mix(uAmber * 1.25, bandCol, inBand * (1.0 - line));
  float a = max(inBand * 0.82, la);
  gl_FragColor = vec4(c, a * uA);
}`

interface Live {
  zone: number
  pos: THREE.Vector3
  cut: boolean
  /** 特效時鐘：過了就不算（特效被清掉時 tick 不會再跑，靠這個收）*/
  until: number
}

const live = new Set<Live>()

export interface HazardOpts {
  /** 跟著實體走（戰術核爆）*/
  follow?: () => THREE.Vector3 | null
  /** 炸彈實體：倒數中消失（被打壞）就淡掉 */
  ent?: number
  w?: ClientWorld
  /** 外框脈動的起始頻率（越接近引爆越快）*/
  hz?: number
}

/** 爆炸預警圈；dur = 倒數秒數 */
export function hazard(gs: GameScene, z: number, x: number, y: number, r: number, dur: number, o: HazardOpts = {}): void {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uR: { value: r },
      uT: { value: 0 },
      uK: { value: 0 },
      uA: { value: 0 },
      uHz: { value: o.hz ?? 1.4 },
      uAmber: { value: new THREE.Color('#ffc23d') },
    },
    transparent: true,
    depthWrite: false,
  })
  const m = new THREE.Mesh(GEO.flat, mat)
  m.raycast = () => {}
  m.frustumCulled = false
  m.renderOrder = 4
  m.position.copy(W(x, y, 0.045))
  m.scale.setScalar(r)
  for (const h of live) if (gs.fx.time > h.until) live.delete(h)
  const rec: Live = { zone: z, pos: m.position, cut: false, until: gs.fx.time + dur + 0.5 }
  live.add(rec)
  const u = mat.uniforms
  let gone = -1
  // 倒數結束後最多再留 0.4 秒等爆炸特效（網路延遲）；之後自己收掉
  gs.fx.addTransient(m, dur + 0.4, z, (k, t) => {
    const p = o.follow?.()
    if (p) m.position.set(p.x, 0.045, p.z)
    const el = k * (dur + 0.4)
    if (o.ent && o.w && gone < 0 && !o.w.ents.has(o.ent)) gone = t
    let a = Math.min(1, el / 0.15)
    if (gone >= 0) a *= Math.max(0, 1 - (t - gone) / 0.2)
    if (el > dur) a *= Math.max(0, 1 - (el - dur) / 0.4)
    if (rec.cut) a = 0
    u.uA.value = a
    u.uT.value = t
    u.uK.value = Math.min(1, el / dur)
    u.uHz.value = (o.hz ?? 1.4) * (1 + 2.2 * Math.min(1, el / dur) ** 2)
    if (a <= 0) m.scale.setScalar(0.0001)
    if (k >= 1) live.delete(rec)
  })
}

/** 爆炸了：切掉附近（rad 公尺內）的預警圈 */
export function cutHazards(z: number, x: number, y: number, rad = 2.5): void {
  for (const h of live) {
    if (h.zone !== z) continue
    if (Math.hypot(h.pos.x - x, -h.pos.z - y) <= rad) {
      h.cut = true
      live.delete(h)
    }
  }
}
