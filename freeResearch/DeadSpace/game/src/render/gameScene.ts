// 遊戲場景：一次只渲染玩家所在的 zone；站體快取、迷霧、燈光池、手電筒、單位同步
import * as THREE from 'three'
import { STATION_BY_ID } from '../shared/content/stations/index'
import { parseLayout, cellAt as layoutCell, type ParsedLayout } from '../shared/layout'
import { UNITS } from '../shared/content/registry'
import { EntFlag } from '../shared/protocol/messages'
import type { ClientWorld, CEnt } from '../client/world'
import type { SceneLike } from './engine'
import { RtsCamera } from './camera'
import { buildStation, updateDoors, type StationView } from './stationBuilder'
import { FogMap } from './fog'
import { UnitLayer } from './units'
import { fogUniforms } from './materials'
import { preset } from './quality'
import { Fx } from './fx'
import '../shared/content/index'
import { SHIP_BY_ID } from '../shared/content/ships'
import type { StationDef } from '../shared/content/stations/types'
import { makeSky } from './space/sky'
import './models/ships'

export interface ZoneInfo {
  id: number
  key: string
  station: string
  layout: ParsedLayout
}

/** 站點或船艇內艙的定義 */
export function stationDefOf(id: string): StationDef | undefined {
  if (id.startsWith('ship:')) {
    const sh = SHIP_BY_ID.get(id.slice(5))
    if (!sh) return undefined
    return { id, name: sh.name, theme: 'ship', layout: sh.layout, space: { hp: 1, hpRegen: 0, radius: 1, pos: [0, 0], speed: 0, abilities: [], pilotable: true, model: '' }, enable: 'core' }
  }
  return STATION_BY_ID.get(id)
}

export class GameScene implements SceneLike {
  readonly scene = new THREE.Scene()
  readonly rts = new RtsCamera()
  readonly camera: THREE.PerspectiveCamera
  readonly units = new UnitLayer()
  readonly fx: Fx
  zones = new Map<number, ZoneInfo>()
  private views = new Map<number, StationView>()
  private fogs = new Map<number, FogMap>()
  zone = -1
  private pool: (THREE.SpotLight | THREE.PointLight)[] = []
  private hemi: THREE.HemisphereLight
  private flash: THREE.SpotLight
  private flashTarget = new THREE.Object3D()
  private fogT = 0
  private lightT = 0
  /** 結構實體 id ↔ POI 格 */
  poiEnt = new Map<string, number>()
  grade = { hue: 0, sat: 0.02, bright: 0, contrast: 0.06 }
  onZoneChange: ((z: ZoneInfo) => void) | null = null
  centeredOnce = false
  /** 本幀受到的傷害脈衝（0..1）*/
  damage = 0

  constructor(readonly world: ClientWorld) {
    this.camera = this.rts.cam
    this.scene.background = new THREE.Color('#030507')
    this.hemi = new THREE.HemisphereLight('#1b2633', '#0b0d10', 0.8)
    this.scene.add(this.hemi)
    const q = preset()
    // 前兩盞是投影的頂燈（spot），其餘是不投影的點光，讓牆面也被照亮
    for (let i = 0; i < q.maxLights; i++) {
      if (i < 2) {
        const l = new THREE.SpotLight('#ffffff', 0, 12, Math.PI * 0.42, 0.65, 1.4)
        l.castShadow = q.shadows > 0
        l.shadow.mapSize.set(1024, 1024)
        l.shadow.bias = -0.0008
        l.shadow.normalBias = 0.02
        l.shadow.camera.near = 0.5
        l.shadow.camera.far = 14
        this.scene.add(l, l.target)
        this.pool.push(l)
      } else {
        const l = new THREE.PointLight('#ffffff', 0, 12, 1.6)
        this.scene.add(l)
        this.pool.push(l)
      }
    }
    this.flash = new THREE.SpotLight('#fff2dc', 0, 16, Math.PI * 0.16, 0.5, 1.2)
    this.flash.castShadow = q.shadows > 1
    this.flash.shadow.mapSize.set(1024, 1024)
    this.flash.shadow.bias = -0.0005
    this.scene.add(this.flash, this.flashTarget)
    this.flash.target = this.flashTarget
    this.scene.add(this.units.group)
    this.fx = new Fx(this.scene)
  }

  setZones(list: [number, string, string][]): void {
    for (const [id, key, stationId] of list) {
      const st = stationDefOf(stationId)
      if (!st) continue
      this.zones.set(id, { id, key, station: stationId, layout: parseLayout(st.layout) })
    }
  }

  private space: { group: THREE.Group; update: (t: number) => void; sun: THREE.DirectionalLight } | null = null

  private ensureSpace(): void {
    if (!this.space) {
      const sky = makeSky(260)
      const group = new THREE.Group()
      group.add(sky.group)
      const sun = new THREE.DirectionalLight('#fff1d6', 3.2)
      sun.position.set(6.5, 30, 2.9)
      sun.target.position.set(0, 0, 0)
      group.add(sun, sun.target)
      this.scene.add(group)
      this.space = { group, update: sky.update, sun }
    }
    this.space.group.visible = true
  }

  private ensureZone(id: number): void {
    if (this.zone === id) return
    const old = this.views.get(this.zone)
    if (old) old.group.visible = false
    if (this.space) this.space.group.visible = false
    this.zone = id
    const info = this.zones.get(id)
    if (!info) {
      fogUniforms.uFogOn.value = 0
      if (id === 0) {
        this.ensureSpace()
        this.hemi.color.set('#22304a')
        this.hemi.groundColor.set('#05060a')
        this.hemi.intensity = 0.7
        this.rts.setBounds(-49, -49, 49, 49)
        this.rts.minDist = 22
        this.rts.maxDist = 95
        this.grade = { hue: 0, sat: 0.1, bright: 0, contrast: 0.08 }
        this.units.clear()
        this.onZoneChange?.({ id: 0, key: 'space', station: 'space', layout: null as never })
      }
      return
    }
    this.rts.minDist = 14
    this.rts.maxDist = 60
    let v = this.views.get(id)
    if (!v) {
      v = buildStation(stationDefOf(info.station)!, info.layout)
      this.views.set(id, v)
      this.scene.add(v.group)
      this.fogs.set(id, new FogMap(info.layout))
    }
    v.group.visible = true
    this.fogs.get(id)!.bind()
    const th = v.theme
    this.hemi.color.set(th.ambientSky)
    this.hemi.groundColor.set(th.ambientGround)
    this.hemi.intensity = th.ambient
    this.grade = th.grade
    this.rts.setBounds(0, 0, info.layout.w, info.layout.h)
    this.units.clear()
    this.onZoneChange?.(info)
  }

  /** 自己目前操控的單位 */
  myUnit(): CEnt | undefined {
    const id = this.world.me.control || this.world.me.unit
    return id ? this.world.ents.get(id) : undefined
  }

  viewZone(): number {
    const me = this.world.me
    if (me.alive === false || me.role === 'spectator') return me.specZone ?? 1
    const u = this.myUnit()
    return u?.s.z ?? me.zone ?? 1
  }

  private isStaticStructure(e: CEnt): boolean {
    const def = UNITS.get(e.s.d ?? '')
    if (!def?.tags.includes('structure')) return false
    const info = this.zones.get(e.s.z ?? -1)
    if (!info) return false
    const { col, row } = layoutCell(info.layout, (e.s.x ?? 0) / 100, (e.s.y ?? 0) / 100)
    const key = `${col},${row}`
    if (this.views.get(info.id)?.pois.has(key)) {
      this.poiEnt.set(`${info.id}:${key}`, e.s.i)
      return true
    }
    return false
  }

  update(dt: number, t: number): void {
    const w = this.world
    w.interpolate()
    const zid = this.viewZone()
    this.ensureZone(zid)
    const view = this.views.get(zid)
    const fog = this.fogs.get(zid)
    // 第一次進場：鏡頭對準自己
    const mine = this.myUnit()
    if (!this.centeredOnce && mine) {
      this.rts.jump(mine.x, mine.y)
      this.centeredOnce = true
    }
    // 門
    if (view) {
      for (const d of view.doors) {
        const st = w.doors.get(zid * 10000 + d.index)
        if (st !== undefined) d.state = st
      }
      updateDoors(view, dt)
      for (const a of view.anim) a.update(t, dt)
    }
    // 迷霧（10 Hz）
    this.fogT -= dt
    if (fog && this.fogT <= 0) {
      this.fogT = 0.1
      const full = w.me.alive === false || w.me.role === 'spectator'
      const srcs = w.vs.filter((s) => s[0] === zid).map((s) => ({ x: s[1] / 10, y: s[2] / 10, r: s[3] / 10 }))
      fog.update(srcs, (idx) => {
        const st = w.doors.get(zid * 10000 + idx)
        return st === undefined || st === 0 || st === 2
      }, full)
    }
    this.units.sync(w.ents.values(), zid, (e) => this.isStaticStructure(e), dt, t)
    // 燈光池：離鏡頭最近的房間燈
    this.lightT -= dt
    if (view && this.lightT <= 0) {
      this.lightT = 0.25
      const cx = this.rts.tx
      const cy = this.rts.ty
      const sorted = [...view.lights].sort((a, b) => (a.x - cx) ** 2 + (-a.z - cy) ** 2 - ((b.x - cx) ** 2 + (-b.z - cy) ** 2))
      for (let i = 0; i < this.pool.length; i++) {
        const l = this.pool[i]
        const rl = sorted[i]
        if (!rl) {
          l.intensity = 0
          continue
        }
        l.color.copy(rl.color)
        l.distance = rl.distance
        if (l instanceof THREE.SpotLight) {
          l.position.set(rl.x, rl.y, rl.z)
          l.target.position.set(rl.x, 0, rl.z)
          l.intensity = rl.intensity
          l.angle = Math.min(1.2, Math.atan(rl.distance / rl.y) * 0.95)
        } else {
          l.position.set(rl.x, 2.1, rl.z)
          l.intensity = rl.intensity * 0.7
        }
      }
    }
    // 手電筒：只有自己的人形單位
    const me = this.units.views.get(mine?.s.i ?? -1)
    if (me?.rig && mine && (mine.s.fl ?? 0) & EntFlag.Mine) {
      const p = new THREE.Vector3()
      me.rig.lamp.getWorldPosition(p)
      this.flash.position.copy(p)
      this.flashTarget.position.set(p.x + Math.cos(mine.f) * 6, 0, p.z - Math.sin(mine.f) * 6)
      this.flash.intensity = 30
    } else this.flash.intensity = 0
    this.space?.update(t)
    this.fx.update(dt, t, zid)
    this.rts.update(dt, window.innerWidth, window.innerHeight)
  }

  dispose(): void {
    for (const v of this.views.values()) v.dispose()
    this.views.clear()
    this.units.clear()
    fogUniforms.uFogOn.value = 0
  }

  /** 螢幕拾取：回傳實體 id（單位或設施）*/
  pick(ndcX: number, ndcY: number): number {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const targets: THREE.Object3D[] = [this.units.group]
    const view = this.views.get(this.zone)
    if (view) for (const g of view.pois.values()) targets.push(g)
    const hits = ray.intersectObjects(targets, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o) {
        if (o.userData.entId) return o.userData.entId as number
        if (o.parent && view && [...view.pois.entries()].some(([, g]) => g === o)) {
          const key = [...view.pois.entries()].find(([, g]) => g === o)![0]
          const id = this.poiEnt.get(`${this.zone}:${key}`)
          if (id) return id
        }
        o = o.parent
      }
    }
    // 退而求其次：螢幕距離最近的單位
    let best = 0
    let bestD = 0.0016
    const v3 = new THREE.Vector3()
    for (const [id, uv] of this.units.views) {
      v3.copy(uv.root.position)
      v3.y += uv.height * 0.5
      v3.project(this.camera)
      const d = (v3.x - ndcX) ** 2 + (v3.y - ndcY) ** 2
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }
}
