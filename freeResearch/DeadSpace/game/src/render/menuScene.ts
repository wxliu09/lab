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
    this.moon = makePlanet(5, '#6a625a', '#c9b6ff', sunDir)
    this.moon.mesh.position.set(6, 10, -48)
    this.scene.add(this.moon.mesh)
    const key = new THREE.DirectionalLight('#fff1d6', 3)
    key.position.copy(sunDir).multiplyScalar(50)
    this.scene.add(key, new THREE.HemisphereLight('#1b2633', '#050608', 0.4))
    this.station = buildStationHull('nyx', 1)
    this.station.position.set(-4, -1, -14)
    this.station.rotation.set(0.35, 0.8, 0.12)
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
