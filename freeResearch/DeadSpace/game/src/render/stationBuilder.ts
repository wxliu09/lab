// 站體建構器：ParsedLayout → three.js 場景（architecture §5、美術聖經 §7）
import * as THREE from 'three'
import { Cell, cellCenter, type ParsedLayout } from '../shared/layout'
import type { StationDef } from '../shared/content/stations/types'
import { Batcher, box, rbox } from './batch'
import { Mat } from './materials'
import { decalTex } from './tex'
import { facingToRotY, poiModel, roomProp, type Animated } from './props'
import { theme, type Theme } from './themes'

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
  dispose(): void
}

/** sim 公尺座標 → three 世界座標 */
export const W = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, -y)

function isSolidCell(c: Cell): boolean {
  return c === Cell.Wall || c === Cell.Void
}

function isFloorish(c: Cell): boolean {
  return c === Cell.Floor || c === Cell.Door || c === Cell.Hazard || c === Cell.Crate || c === Cell.Fixture || c === Cell.Window
}

function roomLabelTex(zh: string, en: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const x = c.getContext('2d')!
  x.fillStyle = 'rgba(0,0,0,0)'
  x.fillRect(0, 0, 512, 160)
  x.fillStyle = '#ffffff'
  x.textAlign = 'center'
  x.font = 'bold 76px "Noto Sans TC", sans-serif'
  x.fillText(zh, 256, 84)
  x.font = '600 30px "Chakra Petch", sans-serif'
  x.fillText(en.toUpperCase(), 256, 134)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  // canvas 文字不會觸發 unicode-range 子集下載：先要求字型載入再重畫
  void document.fonts?.load(`bold 76px "Noto Sans TC"`, zh).then(() => {
    x.clearRect(0, 0, 512, 160)
    x.font = 'bold 76px "Noto Sans TC", sans-serif'
    x.fillText(zh, 256, 84)
    x.font = '600 30px "Chakra Petch", sans-serif'
    x.fillText(en.toUpperCase(), 256, 134)
    t.needsUpdate = true
  })
  return t
}

export function buildStation(st: StationDef, l: ParsedLayout): StationView {
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
      if (!isFloorish(c)) continue
      let rt = roomType(col, row)
      if (c === Cell.Door) {
        // 門格跟隨相鄰房間
        rt = 'corridor'
      }
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
      const jitter = 0.94 + (((col * 73856093) ^ (row * 19349663)) >>> 0) % 1000 / 1000 * 0.1
      const tri = [0, 1, 2, 0, 2, 3]
      for (const k of tri) {
        const [x, y] = corners[k]
        g.pos.push(x, 0, -y)
        g.uv.push(x / 2, y / 2)
        g.nrm.push(0, 1, 0)
        const a = ao[k] * jitter * (c === Cell.Hazard ? 0.8 : 1)
        g.col.push(a, a, a)
      }
    }
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
  // 室外（行星、衛星）：岩壁沒有燈條、牆頂不是船殼板
  const outdoor = !!st.outdoor
  const strips = new Map<string, Batcher>()
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
  for (let row = 0; row < l.h; row++) {
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
      for (const [n, ax, az, bx, bz, nx, nz, u] of sides) {
        if (n === Cell.Wall) continue
        face(ax, az, bx, bz, nx, nz, u * 0.5)
        if (n === Cell.Void) continue
        // 燈條：面向房間的牆，每 3 格亮 2 格
        const nc = col + (nx > 0 ? 1 : nx < 0 ? -1 : 0)
        const nr = row + (nz > 0 ? 1 : nz < 0 ? -1 : 0)
        const ri = l.roomOf[nr * l.w + nc]
        if (!outdoor && ri >= 0 && (col + row) % 3 !== 0) {
          const color = l.rooms[ri].spec.light ?? th.light
          let bt = strips.get(color)
          if (!bt) strips.set(color, (bt = new Batcher()))
          const mx = (ax + bx) / 2 + nx * 0.03
          const mz = (az + bz) / 2 + nz * 0.03
          const along = nx !== 0 ? 0 : 0
          bt.add(box(nx !== 0 ? 0.04 : 0.86, 0.06, nz !== 0 ? 0.04 : 0.86), Mat.emissive(color, 2.6), mx, 1.62, mz, along)
        }
      }
      // 牆頂：暗色船殼板＋亮邊（室外岩壁只蓋同材質的頂，不加飾條）
      cap.add(box(1, 0.06, 1), outdoor ? wallMat : capMat, col + 0.5, WALL_H + 0.03, -(l.h - row - 0.5))
      if (outdoor) continue
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
  }
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
  cap.build(group, { cast: false, receive: true })
  for (const bt of strips.values()) bt.build(group, { cast: false, receive: false })

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
    pois.set(`${p.col},${p.row}`, m.root)
    if (m.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 40), new THREE.MeshBasicMaterial({ color: m.ring, transparent: true, opacity: 0.35, depthWrite: false }))
      ring.rotation.x = -Math.PI / 2
      ring.position.set(0, 0.02, 0)
      m.root.add(ring)
    }
  }
  // 停機坪
  for (const pad of l.pads) {
    const m = poiModel('pad', undefined, seed++)
    m.root.position.copy(W(pad.x, pad.y))
    group.add(m.root)
    anim.push(...m.anim)
  }
  props.build(group)

  // ───── 房間燈與地板標示 ─────
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
    // 房名
    if (r.cells > 30 && r.spec.type !== 'corridor') {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 1.6),
        new THREE.MeshBasicMaterial({ map: roomLabelTex(r.spec.name.zh, r.spec.name.en), transparent: true, opacity: 0.16, depthWrite: false }),
      )
      label.rotation.x = -Math.PI / 2
      label.position.set(r.cx, 0.02, -(r.minY + 1.6))
      group.add(label)
    }
    if (r.spec.type === 'medbay') {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: decalTex('cross', '#5cf2a5'), transparent: true, opacity: 0.35, depthWrite: false }))
      cross.rotation.x = -Math.PI / 2
      cross.position.set(r.cx, 0.02, -r.cy)
      group.add(cross)
    }
  }
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

  return {
    group,
    layout: l,
    theme: th,
    lights,
    doors,
    anim,
    pois,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose()
      })
    },
  }
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
