// 站內天氣：餘燼衛星大氣護盾被打破後的暴風雪（世界公開狀態 wx[zone key] === 'blizzard'）。
// 低成本：一組 Points 的雪（跟著鏡頭的循環盒子，世界座標固定、只在盒子邊緣換位）＋兩層隨風飄移的雪霧平面＋
// 慢慢積起來的地面積雪（只蓋岩地，不蓋工廠建物的地板）。總共 4 個 draw call，不動共用材質、不新增燈光。
import * as THREE from 'three'
import { Cell, type ParsedLayout } from '../shared/layout'
import { withFog } from './materials'
import { fxTex } from './fx/tex'
import { decalTex } from './tex'
import { preset } from './quality'

/** 雪的循環盒子（three 座標的 x、y、z 尺寸）：涵蓋一般縮放下的畫面 */
const BOX = new THREE.Vector3(60, 7, 44)
/** 風向與落速（公尺／秒，three 座標）*/
const WIND = new THREE.Vector3(6.5, -3.4, 2.2)
/** 積雪從開始到最厚的秒數 */
const COVER_SECS = 40

/**
 * 版面遮罩（每格 1 texel，線性過濾讓邊緣柔一點）：
 * - 積雪：RGB = 岩地（自然地表）1、人造建物的房間與牆 0（當 alphaMap 用）；
 * - 雪霧：A = 版面內（含岩壁）1、版面外的虛空 0（當 map 用，map 的 alpha 乘進透明度），雪霧不會蓋到地圖外面。
 */
function layoutMasks(l: ParsedLayout, built: readonly string[]): { cover: THREE.DataTexture; land: THREE.DataTexture } {
  const cover = new Uint8Array(l.w * l.h * 4)
  // 雪霧遮罩外圍多一圈虛空（ClampToEdge 夾到的是 0，地圖外不會被邊緣格延伸出去）
  const LW = l.w + 2
  const land = new Uint8Array(LW * (l.h + 2) * 4)
  for (let row = 0; row < l.h; row++) {
    for (let col = 0; col < l.w; col++) {
      const i = row * l.w + col
      const c = l.cells[i] as Cell
      const r = l.roomOf[i]
      const inBuilt = r >= 0 && built.includes(l.rooms[r].spec.type)
      const v = c === Cell.Floor || c === Cell.Hazard || c === Cell.Crate || c === Cell.Fixture ? (inBuilt ? 0 : 255) : 0
      // DataTexture 的第 0 列在下方（v = 0）：版面第 0 列在最上方
      const k = ((l.h - 1 - row) * l.w + col) * 4
      cover[k] = cover[k + 1] = cover[k + 2] = v
      cover[k + 3] = 255
      const j = ((l.h - row) * LW + col + 1) * 4
      land[j] = land[j + 1] = land[j + 2] = 255
      land[j + 3] = c === Cell.Void ? 0 : 255
    }
  }
  const mk = (data: Uint8Array, w: number, h: number) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }
  return { cover: mk(cover, l.w, l.h), land: mk(land, LW, l.h + 2) }
}

/** 雪霧平面的大小（公尺；跟著鏡頭）*/
const HAZE_W = 90
const HAZE_H = 70

export class Blizzard {
  readonly group = new THREE.Group()
  /** 目前強度 0..1（淡入淡出）*/
  k = 0
  /** 目標強度 */
  target = 0
  private snowMat: THREE.PointsMaterial
  private snowU = { uSnowT: { value: 0 }, uSnowO: { value: new THREE.Vector3() }, uSnowK: { value: 0 }, uSnowLand: { value: null as THREE.Texture | null }, uSnowLandK: { value: new THREE.Vector2(1, 1) } }
  private haze: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; tex: THREE.Texture; scale: number; speed: number; op: number }[] = []
  private cover: THREE.Mesh
  private coverMat: THREE.MeshBasicMaterial
  private coverK = 0
  private mask: THREE.DataTexture
  private land: THREE.DataTexture
  private owned: { dispose(): void }[] = []
  private nextGust = 3
  private layoutW = 1
  private layoutH = 1

  constructor(layout: ParsedLayout, built: readonly string[] = []) {
    this.group.name = 'blizzard'
    // ── 雪：位置是盒子裡的固定亂數，shader 加上風的位移後在盒子裡循環 ──
    const n = Math.round(preset().particles * 2.4)
    const pos = new Float32Array(n * 3)
    const ph = new Float32Array(n * 2)
    let a = 0x9e3779b1
    const rnd = () => {
      a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x6d2b79f5) | 0
      return ((a ^ (a >>> 13)) >>> 0) / 4294967296
    }
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rnd() * BOX.x
      pos[i * 3 + 1] = rnd() * BOX.y
      pos[i * 3 + 2] = rnd() * BOX.z
      ph[i * 2] = rnd()
      ph[i * 2 + 1] = rnd()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSnow', new THREE.BufferAttribute(ph, 2))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    const mat = new THREE.PointsMaterial({ color: '#f4f8ff', size: 0.75, map: decalTex('glow', '#ffffff'), transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true })
    const u = this.snowU
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aSnow;\nuniform float uSnowT;\nuniform vec3 uSnowO;\nuniform float uSnowK;\nuniform sampler2D uSnowLand;\nuniform vec2 uSnowLandK;\nvarying float vSnowA;')
        .replace(
          '#include <begin_vertex>',
          // 每片雪速度略有不同，加上一點亂流；循環在 uSnowO 起算的盒子裡（世界座標固定，鏡頭移動時雪不會跟著跑）
          `vec3 sv = vec3(${WIND.x.toFixed(2)}, ${WIND.y.toFixed(2)}, ${WIND.z.toFixed(2)}) * (0.7 + aSnow.y * 0.6);
          vec3 transformed = position + sv * uSnowT;
          transformed.x += sin(uSnowT * 1.7 + aSnow.x * 6.2832) * 0.7;
          transformed.z += cos(uSnowT * 1.1 + aSnow.x * 4.0) * 0.5;
          vec3 sb = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
          transformed = mod(transformed - uSnowO, sb) + uSnowO;
          // 盒子邊緣淡出（換位時不會突然冒出來）；強度低時只留一部分雪
          vec3 se = min(transformed - uSnowO, uSnowO + sb - transformed);
          vSnowA = smoothstep(0.0, 4.0, min(se.x, se.z)) * smoothstep(0.0, 1.0, se.y) * step(aSnow.x, uSnowK);
          // 地圖外的虛空不下雪（版面遮罩的 alpha；外圍一圈是 0）
          vSnowA *= texture2D(uSnowLand, vec2((transformed.x + 1.0) * uSnowLandK.x, (1.0 - transformed.z) * uSnowLandK.y)).a;`,
        )
        .replace('gl_PointSize = size;', 'gl_PointSize = size * (0.55 + aSnow.y * 0.9);')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSnowA;')
        .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\ngl_FragColor.a *= vSnowA;')
    }
    mat.customProgramCacheKey = () => 'xcsnow'
    this.snowMat = withFog(mat)
    const pts = new THREE.Points(geo, this.snowMat)
    pts.frustumCulled = false
    pts.matrixAutoUpdate = false
    pts.renderOrder = 3
    this.group.add(pts)
    this.owned.push(geo, this.snowMat)

    // ── 雪霧：兩層大平面跟著鏡頭，貼圖用世界座標偏移（雪霧本身固定在世界上、被風吹著走）──
    // 低的一層貼著地面吹（腳邊的雪流），高的一層在牆頂上方（岩壁頂也蒙上一層白）；單位站在兩層之間，讀得出來
    const masks = layoutMasks(layout, built)
    this.mask = masks.cover
    this.land = masks.land
    this.land.repeat.set(HAZE_W / (layout.w + 2), HAZE_H / (layout.h + 2))
    this.snowU.uSnowLand.value = this.land
    this.snowU.uSnowLandK.value.set(1 / (layout.w + 2), 1 / (layout.h + 2))
    this.owned.push(this.land)
    this.layoutW = layout.w + 2
    this.layoutH = layout.h + 2
    for (const [h, scale, speed, op] of [
      [0.3, 9, 1.0, 0.3],
      [3.3, 16, 0.6, 0.2],
    ] as const) {
      const tex = fxTex('noise', true).clone()
      tex.needsUpdate = true
      tex.repeat.set(HAZE_W / scale, HAZE_H / scale)
      const m = withFog(new THREE.MeshBasicMaterial({ color: '#e4edf8', map: this.land, alphaMap: tex, transparent: true, opacity: 0, depthWrite: false }))
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(HAZE_W, HAZE_H), m)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = h
      mesh.renderOrder = 4
      mesh.frustumCulled = false
      this.group.add(mesh)
      this.haze.push({ mesh, mat: m, tex, scale, speed, op })
      this.owned.push(tex, m, mesh.geometry)
    }

    // ── 地面積雪：整張地圖一片，遮罩只留岩地；雜訊斑駁 ──
    const ctex = fxTex('noise', true).clone()
    ctex.needsUpdate = true
    ctex.repeat.set(layout.w / 7, layout.h / 7)
    // 積雪的斑駁＝雜訊貼圖（顏色，乘上大於 1 的顏色讓亮處接近白）× 遮罩（alphaMap）
    this.coverMat = withFog(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.35, 1.4, 1.5), map: ctex, alphaMap: this.mask, transparent: true, opacity: 0, depthWrite: false }))
    this.cover = new THREE.Mesh(new THREE.PlaneGeometry(layout.w, layout.h), this.coverMat)
    this.cover.rotation.x = -Math.PI / 2
    this.cover.position.set(layout.w / 2, 0.028, -layout.h / 2)
    this.cover.renderOrder = 1
    this.group.add(this.cover)
    this.owned.push(ctex, this.mask, this.coverMat, this.cover.geometry)
    this.group.visible = false
  }

  /** 進站時已經在下雪：直接滿強度、積雪也已經積好（cover = true）*/
  snapTo(on: boolean, cover = on): void {
    this.target = this.k = on ? 1 : 0
    this.coverK = cover ? 1 : 0
  }

  /**
   * 每幀：淡入淡出、雪的時間、雪霧位置與貼圖偏移；cx、cy = 鏡頭焦點（sim 座標）。
   * 回傳要不要播一聲風（由 gameScene 播，這裡不碰音訊）。
   */
  update(dt: number, t: number, cx: number, cy: number): boolean {
    this.k += Math.sign(this.target - this.k) * Math.min(Math.abs(this.target - this.k), dt / 4)
    const k = this.k
    this.group.visible = k > 0.001
    if (!this.group.visible) return false
    if (this.target > 0) this.coverK = Math.min(1, this.coverK + dt / COVER_SECS)
    const u = this.snowU
    u.uSnowT.value = t
    u.uSnowO.value.set(cx - BOX.x / 2, 0, -cy - BOX.z / 2)
    u.uSnowK.value = k
    // 版面遮罩跟著雪霧平面換算到世界座標（兩層平面同大小、同位置，共用一張）
    this.land.offset.set((cx - HAZE_W / 2 + 1) / this.layoutW, (cy - HAZE_H / 2 + 1) / this.layoutH)
    for (const hz of this.haze) {
      hz.mesh.position.x = cx
      hz.mesh.position.z = -cy
      // 貼圖以世界座標對齊：平面跟著鏡頭移動時抵銷位移，再加上風的漂移（貼圖 v 軸朝 -z）
      const ox = (cx - HAZE_W / 2) / hz.scale - (t * WIND.x * hz.speed) / hz.scale
      const oy = (cy - HAZE_H / 2) / hz.scale + (t * WIND.z * hz.speed) / hz.scale
      hz.tex.offset.set(ox, oy)
      hz.mat.opacity = hz.op * k * (0.85 + 0.15 * Math.sin(t * 0.7 + hz.scale))
    }
    this.coverMat.opacity = 0.36 * Math.min(k, this.coverK)
    this.nextGust -= dt
    if (this.nextGust <= 0 && this.target > 0) {
      this.nextGust = 6 + ((t * 7.31) % 1) * 6
      return true
    }
    return false
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const o of this.owned) o.dispose()
    this.owned = []
  }
}
