// 主選單動態太空背景
import * as THREE from 'three'
import type { SceneLike } from './engine'
import { makePlanet, makeSky, makeSun } from './space/sky'
import { buildStationHull } from './space/hulls'

export class MenuScene implements SceneLike {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 1000)
  private sky = makeSky(400)
  private planet: { mesh: THREE.Group; update: (t: number) => void }
  private moon: { mesh: THREE.Group; update: (t: number) => void }
  private station: THREE.Group
  grade = { hue: 0, sat: 0.08, bright: 0, contrast: 0.08 }

  constructor() {
    this.scene.add(this.sky.group)
    const sunDir = new THREE.Vector3(-1, 0.35, -0.6).normalize()
    const sun = makeSun('#fff1d6', 5)
    sun.position.copy(sunDir).multiplyScalar(260)
    this.scene.add(sun)
    this.planet = makePlanet(26, '#3f7a4a', '#7fd8ff', sunDir)
    this.planet.mesh.position.set(38, -14, -70)
    this.scene.add(this.planet.mesh)
    // 衛星沒有大氣：光暈用很暗的色，只留一圈邊緣
    this.moon = makePlanet(4, '#6a625a', '#2b2a33', sunDir)
    this.moon.mesh.position.set(30, 16, -95)
    this.scene.add(this.moon.mesh)
    const key = new THREE.DirectionalLight('#fff1d6', 3)
    key.position.copy(sunDir).multiplyScalar(50)
    // 背光：從站體後方打向鏡頭，讓剪影的邊緣亮起來
    const rim = new THREE.DirectionalLight('#8fd8ff', 2.2)
    rim.position.set(14, 6, -60)
    rim.target.position.set(9, 1, -26)
    this.scene.add(key, rim, rim.target, new THREE.HemisphereLight('#22303f', '#06080b', 0.55))
    // 站體放在畫面右側三分之一（左側是選單面板），稍遠一點、整個輪廓入鏡
    this.station = buildStationHull('nyx', 1)
    this.station.position.set(9, 1.2, -26)
    this.station.rotation.set(0.3, 0.8, 0.1)
    this.scene.add(this.station)
    this.camera.position.set(0, 0, 0)
  }

  update(_dt: number, t: number): void {
    this.sky.update(t)
    this.planet.update(t)
    this.moon.update(t)
    this.station.rotation.y = 0.8 + t * 0.03
    this.camera.position.set(Math.sin(t * 0.03) * 2, Math.sin(t * 0.021) * 1, 0)
    this.camera.lookAt(10, -2, -60)
  }
}
