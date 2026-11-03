// 站體建構器：ParsedLayout → three.js 場景（architecture §5、美術聖經 §7）
import * as THREE from 'three'
import { Cell, cellCenter, type ParsedLayout, type RoomInstance } from '../shared/layout'
import type { StationDef } from '../shared/content/stations/types'
import { Batcher, box, rbox } from './batch'
import { FILL_SCALE, Mat, isSharedMaterial, withFog } from './materials'
import { decalTex, isSharedTexture } from './tex'
import { preset } from './quality'
import { facingToRotY, poiModel, roomProp, type Animated } from './props'
import { theme, type Theme } from './themes'
import { buildRockWallsSteps, classifyOutdoor, groundTone } from './rockWalls'
import { runSteps, type Steps } from './steps'
import { lang, type Lang } from '../ui/i18n'

export const WALL_H = 2.4
const DOOR_H = 2.15

export interface RoomLight {
  x: number
  y: number
  z: number
  color: THREE.Color
  intensity: number
  distance: number
  room: number
}

export interface DoorView {
  index: number
  group: THREE.Group
  panels: [THREE.Mesh, THREE.Mesh]
  lamp: THREE.Mesh
  horizontal: boolean
  width: number
  open: number
  target: number
  state: number
}

export interface StationView {
  group: THREE.Group
  layout: ParsedLayout
  theme: Theme
  lights: RoomLight[]
  doors: DoorView[]
  anim: Animated[]
  /** POI 模型：key = `${col},${row}` */
  pois: Map<string, THREE.Group>
  /** 烘焙補光圖（世界 XZ，2 texel／m；null = 室外站不補）*/
  fill: THREE.DataTexture | null
  /** 牆面燈條（緊急照明時換成紅色材質）*/
  strips: THREE.Mesh[]
  dispose(): void
}

/** 設施的地面互動光圈（gameScene 換上損毀外觀時也用）*/
export function addPoiRing(root: THREE.Object3D, color: string): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.set(0, 0.02, 0)
  root.add(ring)
  return ring
}

/** sim 公尺座標 → three 世界座標 */
export const W = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y)

function isSolidCell(c: Cell): boolean {
  return c === Cell.Wall || c === Cell.Void
}

function isFloorish(c: Cell): boolean {
  return c === Cell.Floor || c === Cell.Door || c === Cell.Hazard || c === Cell.Crate || c === Cell.Fixture || c === Cell.Window
}

/** 房名地貼的畫布：600×160（約 98 px／m，地貼 6.1 × 1.6 m，剛好是 labelSpot 找的 6×2 格），主名稱一行、副名稱一行 */
const LABEL_W = 600
const LABEL_H = 160
const LABEL_M = [6.1, 1.6]

/**
 * 房名地貼：主次依建站當下的介面語言（zh＝大字中文＋小字英文；en＝大字英文＋小字中文），切換語言後下一次建站生效。
 * 字太長時縮小到放得進畫布（「失敗實驗體隔間」、「CONTAINMENT CONTROL」）。
 */
function roomLabelTex(name: { zh: string; en: string }, major: Lang): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = LABEL_W
  c.height = LABEL_H
  const x = c.getContext('2d')!
  const en = name.en.toUpperCase()
  const big = major === 'en' ? { text: en, font: (px: number) => `700 ${px}px "Chakra Petch", sans-serif`, px: 64 } : { text: name.zh, font: (px: number) => `bold ${px}px "Noto Sans TC", sans-serif`, px: 76 }
  const small = major === 'en' ? { text: name.zh, font: (px: number) => `${px}px "Noto Sans TC", sans-serif`, px: 30 } : { text: en, font: (px: number) => `600 ${px}px "Chakra Petch", sans-serif`, px: 30 }
  const fit = (f: (px: number) => string, px: number, text: string) => {
    x.font = f(px)
    const w = x.measureText(text).width
    return w > LABEL_W - 16 ? Math.floor((px * (LABEL_W - 16)) / w) : px
  }
  const draw = () => {
    x.clearRect(0, 0, LABEL_W, LABEL_H)
    x.fillStyle = '#ffffff'
    x.textAlign = 'center'
    x.font = big.font(fit(big.font, big.px, big.text))
    x.fillText(big.text, LABEL_W / 2, 84)
    x.font = small.font(fit(small.font, small.px, small.text))
    x.fillText(small.text, LABEL_W / 2, 134)
  }
  draw()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  // canvas 文字不會觸發 unicode-range 子集下載：先要求字型載入再重畫（字寬也要重新量）
  const fonts = document.fonts
  if (fonts)
    void Promise.all([fonts.load(big.font(big.px), big.text), fonts.load(small.font(small.px), small.text)]).then(() => {
      draw()
      t.needsUpdate = true
    })
  return t
}

function hashId(id: string): number {
  let h = 7
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0
  return h & 0xffff
}

export function buildStation(st: StationDef, l: ParsedLayout): StationView {
  return runSteps(buildStationSteps(st, l))
}

/**
 * 分段建站：每一列格子、每一扇門、每個道具與設施之後 yield 一次（GameScene 的預建依空閒時間推進，一片只有幾 ms）。
 * 同步呼叫 buildStation 時一路跑完，結果完全相同。
 */
export function* buildStationSteps(st: StationDef, l: ParsedLayout): Steps<StationView> {
  const th = theme(st.theme)
  const group = new THREE.Group()
  group.name = 'station:' + st.id
  const anim: Animated[] = []
  const lights: RoomLight[] = []
  const doors: DoorView[] = []
  const pois = new Map<string, THREE.Group>()
  const cellAt = (col: number, row: number): Cell => (col < 0 || row < 0 || col >= l.w || row >= l.h ? Cell.Void : (l.cells[row * l.w + col] as Cell))
  const roomType = (col: number, row: number): string => {
    const r = l.roomOf[row * l.w + col]
    return r >= 0 ? l.rooms[r].spec.type : 'corridor'
  }

  // 室外（行星、衛星）：自然岩壁＋人造建物牆（rockWalls.ts），岩壁沒有燈條
  const outdoor = !!st.outdoor
  const ocls = outdoor ? classifyOutdoor(l, th, cellAt, roomType) : null

  // ───── 45° 斜牆：連續的對角階梯牆格只改外觀（sim 的格子不變），切成斜牆片＋露出的三角地板 ─────
  const diag = outdoor ? new Map<number, Diag>() : findDiagonals(l, cellAt)

  // ───── 地板：依房間類型分材質，世界座標 UV，頂點 AO ─────
  const floorGeo = new Map<string, { pos: number[]; uv: number[]; col: number[]; nrm: number[] }>()
  const blockedCorner = (col: number, row: number) => {
    // 頂點在格子 (col,row) 的左上角：周圍四格
    let n = 0
    for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const c = cellAt(col + dc, row + dr)
      if (isSolidCell(c)) n++
    }
    return n
  }
  for (let row = 0; row < l.h; row++) {
    for (let col = 0; col < l.w; col++) {
      const c = cellAt(col, row)
      const dg = diag.get(row * l.w + col)
      if (dg) {
        // 斜牆格：開口那一半鋪地板（材質跟著鄰接的房間）
        const f = th.floor[roomType(col + dg.ox, row)] ?? th.defaultFloor
        const key = `${f.variant}|${f.tint}`
        let g = floorGeo.get(key)
        if (!g) floorGeo.set(key, (g = { pos: [], uv: [], col: [], nrm: [] }))
        const us = f.variant === 'rock' ? 0.25 : 0.5
        const tri = diagFloorTri(l, col, row, dg)
        for (const [x, y] of tri) {
          g.pos.push(x, 0, -y)
          g.uv.push(x * us, y * us)
          g.nrm.push(0, 1, 0)
          g.col.push(0.82, 0.82, 0.82)
        }
        continue
      }
      let rt: string
      if (!isFloorish(c)) {
        // 室外：自然岩壁的邊緣格底下也鋪地板（輪廓平滑後岩壁會往內縮，不能露出底下的黑色背景）
        const i = row * l.w + col
        if (!ocls || c !== Cell.Wall || ocls.built[i] || ocls.dist[i] !== 1) continue
        let nb: [number, number] | null = null
        for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const k = cellAt(col + dc, row + dr)
          if (isFloorish(k) && k !== Cell.Door) {
            nb = [col + dc, row + dr]
            break
          }
        }
        if (!nb) continue
        rt = roomType(nb[0], nb[1])
      } else rt = c === Cell.Door ? 'corridor' : roomType(col, row) // 門格跟隨走廊
      const f = th.floor[rt] ?? th.defaultFloor
      const key = `${f.variant}|${f.tint}`
      let g = floorGeo.get(key)
      if (!g) floorGeo.set(key, (g = { pos: [], uv: [], col: [], nrm: [] }))
      const x0 = col
      const x1 = col + 1
      const y1 = l.h - row
      const y0 = y1 - 1
      const corners: [number, number, number, number][] = [
        [x0, y0, col, row + 1],
        [x1, y0, col + 1, row + 1],
        [x1, y1, col + 1, row],
        [x0, y1, col, row],
      ]
      const ao = corners.map(([, , cc, rr]) => 1 - Math.min(2, blockedCorner(cc, rr)) * 0.22)
      // 站內：每格一點隨機明暗；室外：跨格連續的低頻明暗（打散草地／岩地貼圖的重複感）
      const jitter = outdoor ? 1 : 0.94 + (((col * 73856093) ^ (row * 19349663)) >>> 0) % 1000 / 1000 * 0.1
      // 岩地貼圖 4 m 一個 tile（其他 2 m）
      const us = f.variant === 'rock' ? 0.25 : 0.5
      const tri = [0, 1, 2, 0, 2, 3]
      for (const k of tri) {
        const [x, y] = corners[k]
        g.pos.push(x, 0, -y)
        g.uv.push(x * us, y * us)
        g.nrm.push(0, 1, 0)
        const a = ao[k] * jitter * (c === Cell.Hazard ? 0.8 : 1) * (outdoor ? groundTone(x, y) : 1)
        g.col.push(a, a, a)
      }
    }
    yield
  }
  for (const [key, g] of floorGeo) {
    const [variant, tint] = key.split('|') as ['plate' | 'grate' | 'tile' | 'rubber' | 'concrete', string]
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3))
    geo.computeBoundingSphere()
    const mesh = new THREE.Mesh(geo, Mat.floor(variant, tint))
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = false
    group.add(mesh)
    yield
  }

  // ───── 牆面：只畫朝向非牆格的面 ─────
  const wallMat = Mat.wall(th.wall, th.wallAccent)
  const capMat = Mat.metal(th.hull, 0.6)
  const wpos: number[] = []
  const wuv: number[] = []
  const wcol: number[] = []
  const wnrm: number[] = []
  const cap = new Batcher()
  const trimMat = Mat.metal(th.trim, 0.5, false)
  const strips = new Map<string, Batcher>()
  // 有機腔壁（未識別物體）不放金屬燈條：改成牆上零星的發光膿泡，牆面本身的血管紋會發光
  const flesh = th.wall.startsWith('flesh:')
  const blisters = new Batcher()
  const blisterGeo = new THREE.IcosahedronGeometry(1, 0)
  const blisterBase = flesh ? Mat.organic(th.hull.slice(6), th.wallAccent) : null
  const face = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, uStart: number) => {
    // 由 a 到 b 的垂直牆面（底 0、頂 WALL_H）
    const v = [
      [ax, 0, az, uStart, 0, 0.5],
      [bx, 0, bz, uStart + 0.5, 0, 0.5],
      [bx, WALL_H, bz, uStart + 0.5, 1, 1],
      [ax, WALL_H, az, uStart, 1, 1],
    ]
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const [x, y, z, u, vv, a] = v[k]
      wpos.push(x, y, z)
      wuv.push(u, vv)
      wnrm.push(nx, 0, nz)
      wcol.push(a, a, a)
    }
  }
  /** 面向房間的牆面裝飾：站內牆每 3 格亮 2 格燈條；有機腔壁改成零星的發光膿泡 */
  const decorate = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, ri: number, col: number, row: number, u: number) => {
    if (ri < 0) return
    const len = Math.hypot(bx - ax, bz - az)
    const tx = (bx - ax) / len
    const tz = (bz - az) / len
    const rotY = Math.atan2(-tz, tx)
    const color = l.rooms[ri].spec.light ?? th.light
    if (flesh) {
      // 約每 4 面牆一簇 1–3 顆膿泡：底下一團肉、上面一顆發光的囊
      const hsh = ((col * 73856093) ^ (row * 19349663) ^ (u * 83492791)) >>> 0
      if (hsh % 4 !== 0) return
      const glow = Mat.emissive(hsh % 3 === 0 ? th.wallAccent : color, 1.8)
      const n = 1 + ((hsh >>> 3) % 3)
      for (let k = 0; k < n; k++) {
        const f = ((hsh >>> (5 + k * 4)) % 16) / 16
        const along = (f - 0.5) * 0.7 * len
        const hy = 0.45 + (((hsh >>> (9 + k * 3)) % 13) / 13) * 1.5
        const px = (ax + bx) / 2 + tx * along + nx * 0.02
        const pz = (az + bz) / 2 + tz * along + nz * 0.02
        const sz = 0.07 + (((hsh >>> (13 + k)) % 5) / 5) * 0.06
        blisters.add(blisterGeo, blisterBase!, px, hy, pz, f * 6, sz * 1.7, sz * 1.4, sz * 1.7)
        blisters.add(blisterGeo, glow, px + nx * sz * 0.6, hy + sz * 0.15, pz + nz * sz * 0.6, f * 3, sz, sz * 0.9, sz)
      }
      return
    }
    if ((col + row) % 3 === 0) return
    let bt = strips.get(color)
    if (!bt) strips.set(color, (bt = new Batcher()))
    bt.add(box(0.86 * len, 0.06, 0.04), Mat.emissive(color, 2.6), (ax + bx) / 2 + nx * 0.03, 1.62, (az + bz) / 2 + nz * 0.03, rotY)
  }
  if (ocls) yield* buildRockWallsSteps({ l, th, group, cls: ocls, cellAt, wallH: WALL_H, seed: hashId(st.id) })
  for (let row = 0; row < l.h && !outdoor; row++) {
    for (let col = 0; col < l.w; col++) {
      if (cellAt(col, row) !== Cell.Wall) continue
      const x0 = col
      const x1 = col + 1
      const zTop = -(l.h - row)
      const zBot = -(l.h - row - 1)
      const nb = (dc: number, dr: number) => cellAt(col + dc, row + dr)
      // 北（row-1）→ -z 方向
      const sides: [Cell, number, number, number, number, number, number, number][] = [
        [nb(0, -1), x1, zTop, x0, zTop, 0, -1, col],
        [nb(0, 1), x0, zBot, x1, zBot, 0, 1, col],
        [nb(-1, 0), x0, zTop, x0, zBot, -1, 0, row],
        [nb(1, 0), x1, zBot, x1, zTop, 1, 0, row],
      ]
      const dg = diag.get(row * l.w + col)
      if (dg) {
        // 斜牆片：從開口兩側的格角拉一面斜牆，牆頂只蓋封閉的那一半
        const [[ax, az], [bx, bz]] = diagEnds(l, col, row, dg)
        const nx = dg.ox * Math.SQRT1_2
        const nz = dg.oy * Math.SQRT1_2
        face(ax, az, bx, bz, nx, nz, (col + row) * 0.25)
        decorate(ax, az, bx, bz, nx, nz, l.roomOf[row * l.w + col + dg.ox], col, row, row * 7)
        const tri = diagCapTri(l, col, row, dg)
        const cg = new THREE.BufferGeometry()
        cg.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap(([x, y]) => [x, WALL_H + 0.06, -y]), 3))
        cg.setAttribute('uv', new THREE.Float32BufferAttribute(tri.flatMap(([x, y]) => [x * 0.5, y * 0.5]), 2))
        cg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3))
        cap.add(cg, capMat, 0, 0, 0)
        cg.dispose()
        // 斜邊飾條
        cap.add(box(Math.SQRT2, 0.08, 0.06), trimMat, (ax + bx) / 2 - nx * 0.03, WALL_H + 0.04, (az + bz) / 2 - nz * 0.03, Math.atan2(-(bz - az), bx - ax))
        continue
      }
      for (const [n, ax, az, bx, bz, nx, nz, u] of sides) {
        if (n === Cell.Wall) continue
        face(ax, az, bx, bz, nx, nz, u * 0.5)
        if (n === Cell.Void) continue
        const nc = col + (nx > 0 ? 1 : nx < 0 ? -1 : 0)
        const nr = row + (nz > 0 ? 1 : nz < 0 ? -1 : 0)
        decorate(ax, az, bx, bz, nx, nz, l.roomOf[nr * l.w + nc], col, row, u)
      }
      // 牆頂：暗色船殼板＋亮邊
      cap.add(box(1, 0.06, 1), capMat, col + 0.5, WALL_H + 0.03, -(l.h - row - 0.5))
      // 面向房間的牆頂邊緣飾條
      for (const [dc, dr, ox, oz, sx, sz] of [
        [0, -1, 0, -0.47, 1, 0.06],
        [0, 1, 0, 0.47, 1, 0.06],
        [-1, 0, -0.47, 0, 0.06, 1],
        [1, 0, 0.47, 0, 0.06, 1],
      ] as const) {
        const n = nb(dc, dr)
        if (n === Cell.Wall || n === Cell.Void) continue
        cap.add(box(sx, 0.08, sz), trimMat, col + 0.5 + ox, WALL_H + 0.04, -(l.h - row - 0.5) + oz)
      }
    }
    yield
  }
  if (wpos.length) {
    const wg = new THREE.BufferGeometry()
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(wnrm, 3))
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2))
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3))
    wg.computeBoundingSphere()
    const walls = new THREE.Mesh(wg, wallMat)
    walls.castShadow = true
    walls.receiveShadow = true
    walls.matrixAutoUpdate = false
    group.add(walls)
  }
  yield* cap.buildSteps(group, { cast: false, receive: true })
  const stripMeshes: THREE.Mesh[] = []
  for (const bt of strips.values()) stripMeshes.push(...(yield* bt.buildSteps(group, { cast: false, receive: false })))
  if (flesh) {
    stripMeshes.push(...(yield* blisters.buildSteps(group, { cast: false, receive: true })).filter((m) => m.material !== blisterBase))
    // 肉壁血管的光慢慢脈動（像心跳把體液推過去）
    const fm = Mat.wall(th.wall, th.wallAccent)
    anim.push({ obj: group, update: (t) => (fm.emissiveIntensity = 0.75 + 0.35 * Math.max(0, Math.sin(t * 1.15)) ** 2) })
  }
  blisterGeo.dispose()
  yield

  // ───── 窗：矮牆＋玻璃＋上樑 ─────
  const props = new Batcher()
  const glassMat = Mat.glass('#a9e4ff', 0.2)
  for (let row = 0; row < l.h; row++) {
    for (let col = 0; col < l.w; col++) {
      if (cellAt(col, row) !== Cell.Window) continue
      const { x, y } = cellCenter(l, col, row)
      props.add(box(1, 0.8, 1), capMat, x, 0.4, -y)
      props.add(box(1, 0.3, 1), capMat, x, WALL_H - 0.15, -y)
      props.add(box(1.02, 0.05, 1.02), trimMat, x, 0.82, -y)
      const horizontal = cellAt(col - 1, row) === Cell.Window || cellAt(col + 1, row) === Cell.Window || isSolidCell(cellAt(col - 1, row))
      const pane = new THREE.Mesh(box(horizontal ? 1 : 0.04, WALL_H - 1.1, horizontal ? 0.04 : 1), glassMat)
      pane.position.set(x, 0.8 + (WALL_H - 1.1) / 2, -y)
      group.add(pane)
    }
    yield
  }

  // ───── 門 ─────
  const frameMat = Mat.metal('#3d454e', 0.7)
  const panelMat = Mat.metal('#7d8892', 0.6)
  const hazardMat = new THREE.MeshStandardMaterial({ map: decalTex('hazard', '#ffc23d'), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const d of l.doors) {
    const g = new THREE.Group()
    const p = W(d.x, d.y)
    g.position.copy(p)
    // horizontal = 門板沿 x
    g.rotation.y = d.horizontal ? 0 : Math.PI / 2
    const wdt = d.width
    const post = rbox(0.22, WALL_H, 0.5, 0.03)
    const lp = new THREE.Mesh(post, frameMat)
    lp.position.set(-wdt / 2 - 0.02, WALL_H / 2, 0)
    const rp = new THREE.Mesh(post, frameMat)
    rp.position.set(wdt / 2 + 0.02, WALL_H / 2, 0)
    const top = new THREE.Mesh(rbox(wdt + 0.4, WALL_H - DOOR_H, 0.5, 0.03), frameMat)
    top.position.set(0, (WALL_H + DOOR_H) / 2, 0)
    const half = wdt / 2
    const pg = rbox(half, DOOR_H, 0.14, 0.03)
    const left = new THREE.Mesh(pg, panelMat)
    const right = new THREE.Mesh(pg, panelMat)
    left.position.set(-half / 2, DOOR_H / 2, 0)
    right.position.set(half / 2, DOOR_H / 2, 0)
    for (const m of [lp, rp, top, left, right]) {
      m.castShadow = true
      m.receiveShadow = true
    }
    const stripeL = new THREE.Mesh(box(0.06, DOOR_H * 0.8, 0.16), Mat.emissive('#ffc23d', 0.6))
    stripeL.position.set(half / 2 - 0.02, 0, 0)
    left.add(stripeL)
    const lamp = new THREE.Mesh(box(0.5, 0.06, 0.52), Mat.emissive('#5cf2a5', 3).clone())
    lamp.position.set(0, DOOR_H + 0.05, 0)
    g.add(lp, rp, top, left, right, lamp)
    // 地面警示斜紋（門兩側）
    for (const side of [-1, 1]) {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(wdt, 0.6), hazardMat)
      dec.rotation.x = -Math.PI / 2
      dec.position.set(0, 0.012, side * 0.8)
      g.add(dec)
    }
    group.add(g)
    doors.push({ index: d.index, group: g, panels: [left, right], lamp, horizontal: d.horizontal, width: wdt, open: 0, target: 0, state: 0 })
    yield
  }

  // ───── 'x' 道具 ─────
  let seed = 1
  for (let row = 0; row < l.h; row++) {
    for (let col = 0; col < l.w; col++) {
      if (cellAt(col, row) !== Cell.Crate) continue
      const { x, y } = cellCenter(l, col, row)
      // 朝向：背對最近的牆
      let rot = 0
      if (isSolidCell(cellAt(col, row - 1))) rot = 0
      else if (isSolidCell(cellAt(col, row + 1))) rot = Math.PI
      else if (isSolidCell(cellAt(col - 1, row))) rot = Math.PI / 2
      else if (isSolidCell(cellAt(col + 1, row))) rot = -Math.PI / 2
      roomProp(props, roomType(col, row), x, -y, rot, seed++, anim, group)
      yield
    }
  }

  // ───── 設施 POI ─────
  for (const p of l.pois) {
    if (['experimentSpawn', 'pacifierSpawn', 'droneSpawn'].includes(p.def.kind)) continue
    const m = poiModel(p.def.kind, p.def.ref, seed++)
    m.root.position.copy(W(p.x, p.y))
    m.root.rotation.y = facingToRotY(p.facing)
    group.add(m.root)
    anim.push(...m.anim)
    const key = `${p.col},${p.row}`
    pois.set(key, m.root)
    // 拾取時由 poiKey 對回這一格的結構實體（gameScene.pick）
    m.root.userData.poiKey = key
    if (m.ring) addPoiRing(m.root, m.ring)
    yield
  }
  // 停機坪
  for (const pad of l.pads) {
    const m = poiModel('pad', undefined, seed++)
    m.root.position.copy(W(pad.x, pad.y))
    group.add(m.root)
    anim.push(...m.anim)
    yield
  }
  yield* props.buildSteps(group)

  // ───── 房間燈與地板標示 ─────
  const labelLang = lang.value
  for (const r of l.rooms) {
    const color = new THREE.Color(r.spec.light ?? th.light)
    const wdt = r.maxX - r.minX
    const hgt = r.maxY - r.minY
    const area = r.cells
    const nx = Math.max(1, Math.round(wdt / 12))
    const ny = Math.max(1, Math.round(hgt / 12))
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const lx = r.minX + (wdt * (i + 0.5)) / nx
        const ly = r.minY + (hgt * (j + 0.5)) / ny
        lights.push({ x: lx, y: 4.2, z: -ly, color, intensity: (12 + Math.min(22, area / (nx * ny) / 5)) * th.lightScale, distance: Math.max(wdt / nx, hgt / ny) * 1.25 + 4, room: r.index })
      }
    }
    if (r.spec.accent) {
      lights.push({ x: r.cx + wdt * 0.3, y: 1.2, z: -(r.cy - hgt * 0.3), color: new THREE.Color(r.spec.accent), intensity: 6, distance: 7, room: r.index })
    }
    // 房名：放在房間中央附近、沒有道具與設施的空地（牆邊會被道具蓋住）
    if (r.cells > 30 && r.spec.type !== 'corridor') {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(LABEL_M[0], LABEL_M[1]),
        new THREE.MeshBasicMaterial({ map: roomLabelTex(r.spec.name, labelLang), transparent: true, opacity: 0.16, depthWrite: false }),
      )
      label.rotation.x = -Math.PI / 2
      const at = labelSpot(l, r)
      label.position.set(at.x, 0.02, -at.y)
      group.add(label)
    }
    if (r.spec.type === 'medbay') {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: decalTex('cross', '#5cf2a5'), transparent: true, opacity: 0.35, depthWrite: false }))
      cross.rotation.x = -Math.PI / 2
      cross.position.set(r.cx, 0.02, -r.cy)
      group.add(cross)
    }
    yield
  }
  // 烘焙補光圖：整間房一層底光＋每盞房間燈一圈光暈（不受燈光池上限影響，所有站內材質都會取樣）
  const fill = th.fill ? yield* bakeFillSteps(l, lights, th, hashId(st.id), diag) : null

  // 走廊箭頭
  const arrowMat = new THREE.MeshBasicMaterial({ map: decalTex('arrow', '#ffc23d'), transparent: true, opacity: 0.4, depthWrite: false })
  for (const r of l.rooms) {
    if (r.spec.type !== 'corridor') continue
    const horizontal = r.maxX - r.minX > r.maxY - r.minY
    const len = horizontal ? r.maxX - r.minX : r.maxY - r.minY
    for (let s = 6; s < len - 4; s += 14) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), arrowMat)
      a.rotation.x = -Math.PI / 2
      a.rotation.z = horizontal ? -Math.PI / 2 : 0
      a.position.set(horizontal ? r.minX + s : r.cx, 0.02, horizontal ? -r.cy : -(r.minY + s))
      group.add(a)
    }
  }

  // 漂浮塵埃（主題有設 dust 才撒；一個 Points、量很少）
  yield
  if (th.dust) buildDust(l, th.dust, group, hashId(st.id))

  return {
    group,
    layout: l,
    theme: th,
    lights,
    doors,
    anim,
    pois,
    fill,
    strips: stripMeshes,
    dispose() {
      fill?.dispose()
      // 幾何＋這座站自己建的材質與貼圖（房間標籤 CanvasTexture、警示條、箭頭、光圈…）；共用的快取不動
      const mats = new Set<THREE.Material>()
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose()
        const mm = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mm)) mm.forEach((x) => mats.add(x))
        else if (mm) mats.add(mm)
      })
      for (const mat of mats) {
        if (isSharedMaterial(mat)) continue
        const rec = mat as unknown as Record<string, unknown>
        for (const key of ['map', 'roughnessMap', 'normalMap', 'emissiveMap', 'alphaMap', 'metalnessMap', 'aoMap']) {
          const tx = rec[key]
          if (tx instanceof THREE.Texture && !isSharedTexture(tx)) tx.dispose()
        }
        mat.dispose()
      }
    },
  }
}

/** 斜牆格：ox／oy = 開口那一側（-1 西／北、+1 東／南；row 向下）*/
interface Diag {
  ox: number
  oy: number
}

/**
 * 找出 45° 階梯牆：牆格的兩個相鄰側（含夾角那格）是地板、另外兩側是牆或虛空，
 * 而且沿著斜線方向至少有一格同樣的牆格（單獨的轉角不切，門框、窗旁也不切）。
 */
function findDiagonals(l: ParsedLayout, cellAt: (col: number, row: number) => Cell): Map<number, Diag> {
  const open = (c: Cell) => c === Cell.Floor || c === Cell.Crate || c === Cell.Hazard || c === Cell.Fixture
  const corner = new Map<number, Diag>()
  for (let row = 0; row < l.h; row++) {
    for (let col = 0; col < l.w; col++) {
      if (cellAt(col, row) !== Cell.Wall) continue
      for (const ox of [-1, 1]) {
        for (const oy of [-1, 1]) {
          if (!open(cellAt(col + ox, row)) || !open(cellAt(col, row + oy)) || !open(cellAt(col + ox, row + oy))) continue
          if (!isSolidCell(cellAt(col - ox, row)) || !isSolidCell(cellAt(col, row - oy))) continue
          corner.set(row * l.w + col, { ox, oy })
        }
      }
    }
  }
  const out = new Map<number, Diag>()
  for (const [i, d] of corner) {
    const col = i % l.w
    const row = (i - col) / l.w
    for (const [dc, dr] of [
      [-d.ox, d.oy],
      [d.ox, -d.oy],
    ]) {
      const j = corner.get((row + dr) * l.w + col + dc)
      if (col + dc >= 0 && col + dc < l.w && j && j.ox === d.ox && j.oy === d.oy) {
        out.set(i, d)
        break
      }
    }
  }
  return out
}

/** 斜牆格的格角（sim 座標，y 向上）：開口角 O、斜線兩端 A（與 O 同 x）、B（與 O 同 y）、封閉角 C */
function diagCorners(l: ParsedLayout, col: number, row: number, d: Diag): { O: [number, number]; A: [number, number]; B: [number, number]; C: [number, number] } {
  const yTop = l.h - row
  const xo = d.ox > 0 ? col + 1 : col
  const xc = d.ox > 0 ? col : col + 1
  const yo = d.oy < 0 ? yTop : yTop - 1
  const yc = d.oy < 0 ? yTop - 1 : yTop
  return { O: [xo, yo], A: [xo, yc], B: [xc, yo], C: [xc, yc] }
}

/** 斜牆面兩端（three 座標 x、z），順序讓 face() 的法線朝開口 */
function diagEnds(l: ParsedLayout, col: number, row: number, d: Diag): [[number, number], [number, number]] {
  const { A, B } = diagCorners(l, col, row, d)
  let a: [number, number] = [A[0], -A[1]]
  let b: [number, number] = [B[0], -B[1]]
  // face 的法線 = (b-a) × 上 = (-(bz-az), bx-ax)；要朝 (ox, oy)
  if (-(b[1] - a[1]) * d.ox + (b[0] - a[0]) * d.oy < 0) [a, b] = [b, a]
  return [a, b]
}

/** 逆時針（y 向上）排列三角形，法線朝上 */
function ccw(t: [number, number][]): [number, number][] {
  const area = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])
  return area >= 0 ? t : [t[0], t[2], t[1]]
}

function diagFloorTri(l: ParsedLayout, col: number, row: number, d: Diag): [number, number][] {
  const { O, A, B } = diagCorners(l, col, row, d)
  return ccw([O, A, B])
}

function diagCapTri(l: ParsedLayout, col: number, row: number, d: Diag): [number, number][] {
  const { C, A, B } = diagCorners(l, col, row, d)
  return ccw([C, A, B])
}

/** 有單位站在那裡的標記（標本、海盜、哨戟、海盜船長、各種生成點）：地貼要離遠一點，不然會被單位蓋住 */
const UNIT_MARK = /Spawn$|^specimen\d$|^pirateCaptain$/

/** 房名地貼實際有字的範圍（半寬、半高，公尺）：避開停機坪時用 */
const LABEL_INK = [2.3, 0.7]
/** 停機坪圓圈（含外圈的燈）半徑 */
const PAD_R = 2.65

/**
 * 房名地貼的位置：房間格裡每個 6×2 格的位置算一個成本，取成本最低、同成本離房間中心最近的。
 * 成本（每格取最大的一項，再整塊加總）：
 * - 道具格（'x'）與設施格本身 10：道具常超出自己的格子（雙層床 1.95 m、倒下的置物櫃 1.7 m、標本籠）；
 * - 道具與設施周圍一格 2；有單位站崗的標記（標本、海盜、哨戟）周圍一格 10、兩格 6、三格 2；危險地面 3；
 * - 醫療室中央的十字地貼 4；
 * - 南邊緊貼牆 12／隔一格 4（每欄）：俯視鏡頭從南往北看，2.4 m 的牆會擋住牆後約 1.6–2 m 的地面（貼牆根等於看不到）；
 *   左右兩端緊貼牆 2（每列）：鏡頭不在正上方時側牆也會擋住一點。
 * 停機坪不能放。整間房都放不下 6×2 才退回房間中心。
 */
export function labelSpot(l: ParsedLayout, r: RoomInstance): { x: number; y: number } {
  const cost = new Float32Array(l.w * l.h)
  const mark = (col: number, row: number, v: number) => {
    if (col < 0 || row < 0 || col >= l.w || row >= l.h) return
    const i = row * l.w + col
    if (cost[i] < v) cost[i] = v
  }
  const around = (col: number, row: number, rad: number, v: number) => {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) mark(col + dc, row + dr, v)
  }
  // 只看房間外接矩形外加兩格（房外的道具與標記也可能貼著門口）
  const c0 = Math.max(0, Math.floor(r.minX) - 3)
  const c1 = Math.min(l.w - 1, Math.ceil(r.maxX) + 2)
  const r0 = Math.max(0, l.h - Math.ceil(r.maxY) - 3)
  const r1 = Math.min(l.h - 1, l.h - 1 - Math.floor(r.minY) + 3)
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const c = l.cells[row * l.w + col] as Cell
      if (c === Cell.Crate || c === Cell.Fixture) around(col, row, 1, 2)
      else if (c === Cell.Hazard) mark(col, row, 3)
    }
  }
  for (const p of l.pois) {
    if (!UNIT_MARK.test(p.def.kind)) around(p.col, p.row, 1, 2)
    else {
      around(p.col, p.row, 3, 2)
      around(p.col, p.row, 2, 6)
      around(p.col, p.row, 1, 10)
    }
  }
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const c = l.cells[row * l.w + col] as Cell
      if (c === Cell.Crate || c === Cell.Fixture) mark(col, row, 10)
    }
  }
  for (const p of l.pois) mark(p.col, p.row, 10)
  // 醫療室中央的十字地貼（2.2 m 見方）：小醫療室放不下時寧可壓到一點十字，也不要被設施擋住
  if (r.spec.type === 'medbay') {
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) if (Math.abs(col + 0.5 - r.cx) < 1.6 && Math.abs(l.h - row - 0.5 - r.cy) < 1.6) mark(col, row, 4)
  }
  const inRoom = (col: number, row: number) => col >= 0 && row >= 0 && col < l.w && row < l.h && l.roomOf[row * l.w + col] === r.index
  // 牆、虛空、窗（窗框和牆一樣高）都會擋住後面的地面
  const solid = (col: number, row: number) => col < 0 || row < 0 || col >= l.w || row >= l.h || isSolidCell(l.cells[row * l.w + col] as Cell) || l.cells[row * l.w + col] === Cell.Window
  let best: { x: number; y: number } | null = null
  let bestS = Infinity
  // 地貼佔 col-3..col+2、row-1..row 這 6×2 格，中心在這格的左上角（sim 座標 x = col、y = l.h - row）
  for (let row = r0 + 1; row <= r1; row++) {
    for (let col = c0 + 3; col <= c1 - 2; col++) {
      const x = col
      const y = l.h - row
      if (l.pads.some((p) => Math.hypot(Math.max(0, Math.abs(p.x - x) - LABEL_INK[0]), Math.max(0, Math.abs(p.y - y) - LABEL_INK[1])) < PAD_R)) continue
      let sum = 0
      let ok = true
      for (let dc = -3; dc <= 2 && ok; dc++) {
        for (let dr = -1; dr <= 0 && ok; dr++) {
          if (!inRoom(col + dc, row + dr)) ok = false
          else sum += cost[(row + dr) * l.w + col + dc]
        }
        if (solid(col + dc, row + 1)) sum += 12
        else if (solid(col + dc, row + 2)) sum += 4
      }
      // 左右兩端緊貼牆：鏡頭不在正上方時，側牆也會擋住一點
      for (let dr = -1; dr <= 0; dr++) {
        if (solid(col - 4, row + dr)) sum += 2
        if (solid(col + 3, row + dr)) sum += 2
      }
      if (!ok) continue
      const s = sum * 4 + Math.hypot(x - r.cx, y - r.cy)
      if (s < bestS) {
        bestS = s
        best = { x, y }
      }
    }
  }
  return best ?? { x: r.cx, y: r.cy }
}

/** 漂浮塵埃：站內地板上方 0.3–2.3 m 隨機撒點，vertex shader 依時間緩慢飄移；加成混合、受戰爭迷霧壓暗 */
function buildDust(l: ParsedLayout, color: string, group: THREE.Group, seed: number): void {
  const floors: number[] = []
  for (let i = 0; i < l.w * l.h; i++) if (l.cells[i] === Cell.Floor || l.cells[i] === Cell.Hazard) floors.push(i)
  const n = Math.min(Math.round(preset().particles * 0.5), Math.round(floors.length * 0.1))
  if (n <= 0) return
  let a = seed * 2654435761 + 1
  const rnd = () => {
    a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x6d2b79f5) | 0
    return ((a ^ (a >>> 13)) >>> 0) / 4294967296
  }
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const ph = new Float32Array(n * 2)
  for (let k = 0; k < n; k++) {
    const i = floors[Math.floor(rnd() * floors.length)]
    const c = i % l.w
    const row = (i - c) / l.w
    pos[k * 3] = c + rnd()
    pos[k * 3 + 1] = 0.3 + rnd() * 2
    pos[k * 3 + 2] = -(l.h - row - rnd())
    const b = 0.35 + rnd() * 0.65
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = b
    ph[k * 2] = rnd()
    ph[k * 2 + 1] = rnd()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aDust', new THREE.BufferAttribute(ph, 2))
  geo.computeBoundingSphere()
  const mat = new THREE.PointsMaterial({ color, size: 0.11, map: decalTex('glow', '#ffffff'), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aDust;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float dT = uTime * (0.12 + aDust.y * 0.1) + aDust.x * 6.2832;
        transformed += vec3(sin(dT) * 0.45, sin(dT * 1.7 + aDust.y * 4.0) * 0.18, cos(dT * 0.8) * 0.45);`,
      )
      .replace('gl_PointSize = size;', 'gl_PointSize = size * (0.6 + aDust.y * 0.9);')
  }
  mat.customProgramCacheKey = () => 'xcdust'
  const pts = new THREE.Points(geo, withFog(mat))
  pts.frustumCulled = false
  pts.matrixAutoUpdate = false
  pts.renderOrder = 2
  group.add(pts)
}

/** 補光圖解析度（texel／m）*/
const FILL_RES = 2
/** 底光（整間房都有）與燈下光暈的比重 */
const FILL_BASE = 2.2
const FILL_POOL = 1.2
/** 牆頂補光相對房間底光的比例：讀得出船殼、和虛空分得開就好（太亮會把視野邊緣的迷霧光暈放大）*/
const FILL_CAP = 0.45

/** 平滑的格點值雜訊（0..1），斷電站的補光用來做出明暗不均的破損感 */
function cellNoise(x: number, y: number, seed: number): number {
  const h = (i: number, j: number) => ((((i * 374761393) ^ (j * 668265263) ^ (seed * 2246822519)) >>> 0) % 1000) / 1000
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx
  const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx
  return a + (b - a) * sy
}

/**
 * 烘焙補光圖：世界 XZ 平面上的線性補光色（materials.ts 的 uFillTex）。
 * 每格只收同一間房的燈（牆擋光、不漏到隔壁）：整間房一層底光（房間燈色混一點環境色）＋每盞燈一圈平方衰減的光暈；
 * 門與窗格取兩側的平均。牆與虛空格為 0，牆頂因此維持暗色。
 */
function* bakeFillSteps(l: ParsedLayout, lights: RoomLight[], th: Theme, seed: number, diag: Map<number, Diag>): Steps<THREE.DataTexture> {
  const W = l.w * FILL_RES
  const H = l.h * FILL_RES
  const out = new Float32Array(W * H * 3)
  const k = th.fill ?? 0
  const sky = new THREE.Color(th.ambientSky)
  const sm = Math.max(sky.r, sky.g, sky.b, 1e-4)
  sky.multiplyScalar(1 / sm)
  const byRoom = new Map<number, RoomLight[]>()
  for (const li of lights) {
    let a = byRoom.get(li.room)
    if (!a) byRoom.set(li.room, (a = []))
    a.push(li)
  }
  // 底光色：房間燈色正規化到同一個亮度（暖色、飽和色的燈不會讓整站暗一半；最多放大 3 倍），再混一點環境色
  const baseColor = (hex: string) => {
    const c = new THREE.Color(hex)
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    c.multiplyScalar(Math.min(3, 0.7 / Math.max(1e-3, lum)))
    return c.multiplyScalar(0.7).add(sky.clone().multiplyScalar(0.3 * Math.max(c.r, c.g, c.b)))
  }
  const baseOf = new Map<number, THREE.Color>()
  for (const r of l.rooms) baseOf.set(r.index, baseColor(r.spec.light ?? th.light))
  const fallback = baseColor(th.light)
  const pass2: number[] = []
  for (let ty = 0; ty < H; ty++) {
    const y = (ty + 0.5) / FILL_RES
    const row = l.h - 1 - Math.floor(y)
    for (let tx = 0; tx < W; tx++) {
      const x = (tx + 0.5) / FILL_RES
      const col = Math.floor(x)
      const ci = row * l.w + col
      const c = l.cells[ci] as Cell
      const o = (ty * W + tx) * 3
      const dg = diag.get(ci)
      // 斜牆格：只有開口那一半（離開口格角 L1 距離 ≤ 1）算地板，房間跟著鄰格
      const dOpen = dg ? Math.abs(x - col - (dg.ox > 0 ? 1 : 0)) + Math.abs(y - Math.floor(y) - (dg.oy < 0 ? 1 : 0)) : 9
      if (c === Cell.Void) continue
      if (c === Cell.Wall && (!dg || dOpen > 1)) {
        // 牆頂：一層很淡的均勻補光，讀得出是暗色船殼板、和站外的虛空分得開
        const wk = k * FILL_BASE * FILL_CAP
        out[o] = fallback.r * wk
        out[o + 1] = fallback.g * wk
        out[o + 2] = fallback.b * wk
        continue
      }
      if (c === Cell.Door || c === Cell.Window) {
        pass2.push(ty * W + tx)
        continue
      }
      const room = dg ? l.roomOf[row * l.w + col + dg.ox] : l.roomOf[ci]
      // 不屬於任何房間的零碎地板：收附近所有燈、底光打折
      const src = room >= 0 ? (byRoom.get(room) ?? []) : lights
      const base = room >= 0 ? baseOf.get(room)! : fallback
      const bk = room >= 0 ? FILL_BASE : FILL_BASE * 0.6
      let r = base.r * bk
      let g = base.g * bk
      let b = base.b * bk
      for (const li of src) {
        const R = Math.min(15, Math.max(5, li.distance * 0.55))
        const t = ((x - li.x) ** 2 + (y + li.z) ** 2) / (R * R)
        if (t >= 1) continue
        const w = (1 - t) * (1 - t) * Math.min(1.4, li.intensity / 30) * FILL_POOL
        r += li.color.r * w
        g += li.color.g * w
        b += li.color.b * w
      }
      const n = th.fillNoise ? 1 - th.fillNoise * cellNoise(x / 5, y / 5, seed) : 1
      out[o] = r * k * n
      out[o + 1] = g * k * n
      out[o + 2] = b * k * n
    }
    if (ty % 8 === 7) yield
  }
  yield
  const isWallTexel = (tx: number, ty: number) => {
    const col = Math.floor(tx / FILL_RES)
    const row = l.h - 1 - Math.floor(ty / FILL_RES)
    const ci = row * l.w + col
    return l.cells[ci] === Cell.Wall && !diag.has(ci)
  }
  // 門、窗：取上下左右已經有值的鄰格平均（2 輪，處理 1 格厚、2 texel 深的門框）
  for (let it = 0; it < 2; it++) {
    for (const i of pass2) {
      const tx = i % W
      const ty = (i - tx) / W
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x2 = tx + dx
        const y2 = ty + dy
        if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue
        const j = (y2 * W + x2) * 3
        if (out[j] + out[j + 1] + out[j + 2] <= 0 || isWallTexel(x2, y2)) continue
        r += out[j]
        g += out[j + 1]
        b += out[j + 2]
        n++
      }
      if (n) {
        out[i * 3] = r / n
        out[i * 3 + 1] = g / n
        out[i * 3 + 2] = b / n
      }
    }
  }
  const data = new Uint8Array(W * H * 4)
  // 上限：補光強度的 4 倍，但不能超過 8-bit 貼圖能存的 FILL_SCALE（Uint8Array 超過 255 會繞回 0：fill > 1 的站會變成一片暗綠）
  const cap = Math.min(FILL_SCALE, k * 4)
  for (let i = 0; i < W * H; i++) {
    for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = Math.round((Math.min(cap, out[i * 3 + ch]) / FILL_SCALE) * 255)
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

/** 門動畫：state 0 關 1 開 2 鎖 3 毀 */
export function updateDoors(sv: StationView, dt: number): void {
  for (const d of sv.doors) {
    d.target = d.state === 1 || d.state === 3 ? 1 : 0
    d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 3.5)
    const half = d.width / 2
    const off = d.open * half * 0.92
    d.panels[0].position.x = -half / 2 - off
    d.panels[1].position.x = half / 2 + off
    const lampMat = d.lamp.material as THREE.MeshStandardMaterial
    lampMat.emissive.set(d.state === 2 ? '#ff3b3b' : d.state === 3 ? '#333333' : d.open > 0.5 ? '#5cf2a5' : '#ffb46b')
  }
}
