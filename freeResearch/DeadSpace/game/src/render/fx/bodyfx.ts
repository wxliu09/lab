// 單位身上的覆蓋層：受擊閃光、變身裂紋。
// 手法同 buffFx 的殼層：對身體每個不透明 mesh 掛一個共用 geometry 的子 mesh（additive），跟著骨架與動畫走；
// 材質是這個單位自己的一份（閃光強度、裂紋進度各自獨立），shader program 依原始碼快取共用，不會每隻單位重編
import * as THREE from 'three'

export interface Shells {
  mat: THREE.MeshBasicMaterial | THREE.ShaderMaterial
  meshes: THREE.Mesh[]
  visible: boolean
}

/** 收集可以覆蓋的零件：不透明、非特效、非 instanced；超過 max 個就放棄（站點、船艦這類大模型不做）*/
function parts(body: THREE.Object3D, max: number): THREE.Mesh[] | null {
  const out: THREE.Mesh[] = []
  let over = false
  body.traverse((o) => {
    if (over) return
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.fx || m.userData.overlay || (m as THREE.InstancedMesh).isInstancedMesh) return
    const src = m.material as THREE.Material | THREE.Material[] | undefined
    if (!src || Array.isArray(src) || src.blending === THREE.AdditiveBlending || (src.transparent && src.opacity < 0.95) || !m.geometry?.attributes.position) return
    if (out.length >= max) {
      over = true
      return
    }
    out.push(m)
  })
  return over || !out.length ? null : out
}

/** 對 body 的每個零件掛一層覆蓋（一開始隱藏）；零件太多或沒有零件時回傳 null */
export function buildShells(body: THREE.Object3D, mat: THREE.MeshBasicMaterial | THREE.ShaderMaterial, max = 64, renderOrder = 5): Shells | null {
  const ps = parts(body, max)
  if (!ps) {
    mat.dispose()
    return null
  }
  const meshes: THREE.Mesh[] = []
  for (const p of ps) {
    let s: THREE.Mesh
    const sk = p as unknown as THREE.SkinnedMesh
    if (sk.isSkinnedMesh) {
      const ss = new THREE.SkinnedMesh(p.geometry, mat)
      ss.bind(sk.skeleton, sk.bindMatrix)
      ss.bindMode = sk.bindMode
      s = ss
    } else s = new THREE.Mesh(p.geometry, mat)
    s.userData.fx = true
    s.userData.overlay = true
    s.raycast = () => {}
    s.castShadow = false
    s.receiveShadow = false
    s.renderOrder = renderOrder
    s.frustumCulled = p.frustumCulled
    s.visible = false
    p.add(s)
    meshes.push(s)
  }
  return { mat, meshes, visible: false }
}

export function showShells(s: Shells, on: boolean): void {
  if (s.visible === on) return
  s.visible = on
  for (const m of s.meshes) m.visible = on
}

export function disposeShells(s: Shells): void {
  for (const m of s.meshes) m.removeFromParent()
  s.meshes.length = 0
  s.mat.dispose()
}

// ───────── 受擊閃光 ─────────

const FLASH_WHITE = new THREE.Color(1.2, 1.17, 1.12)
const FLASH_RED = new THREE.Color(1.7, 0.3, 0.2)

/** 受擊閃光材質（每個單位一份）*/
export function flashMat(): THREE.MeshBasicMaterial {
  // polygonOffset：覆蓋層和身體是同一份幾何，往鏡頭拉一點才不會因深度精度被身體自己擋掉
  return new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
}

export function setFlash(s: Shells, k: number, red: boolean): void {
  const m = s.mat as THREE.MeshBasicMaterial
  m.color.copy(red ? FLASH_RED : FLASH_WHITE)
  m.opacity = Math.min(1, k)
  showShells(s, k > 0.01)
}

// ───────── 變身裂紋 ─────────
// 世界座標的 3D Voronoi 邊界＝裂紋；細胞亂數小於進度的邊界才亮，所以裂紋會一條一條長出來、越來越寬。
// 座標減掉單位原點，單位顫抖時裂紋不會在身上滑動

const CRACK_VERT = `
#include <common>
#include <skinning_pars_vertex>
uniform vec3 uOrigin;
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vP = wp.xyz - uOrigin;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const CRACK_FRAG = `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uK;
uniform float uTime;
uniform float uScale;
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
void main() {
  vec3 p = vP * uScale;
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = hash3(ip + g);
        vec3 r = g + o - fp;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = o.x; }
        else if (d < d2) d2 = d;
      }
  float edge = sqrt(d2) - sqrt(d1);
  float on = step(id, uK * 1.2 - 0.05);
  float w = 0.025 + 0.1 * uK;
  float crack = (1.0 - smoothstep(0.0, w, edge)) * on;
  float core = 1.0 - smoothstep(0.0, w * 0.3, edge);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float pulse = 0.7 + 0.3 * sin(uTime * 17.0 + id * 6.2831);
  vec3 col = mix(uColor2, uColor, core) * crack * pulse * (0.5 + 1.6 * uK) + uColor2 * fres * uK * 0.5;
  gl_FragColor = vec4(col, 1.0);
}`

/** 裂紋材質（每個單位一份）；color = 裂縫核心、color2 = 外暈與邊光；scale = 每公尺幾個裂片 */
export function crackMat(color: THREE.ColorRepresentation, color2: THREE.ColorRepresentation, scale = 7): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CRACK_VERT,
    fragmentShader: CRACK_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color).multiplyScalar(2.2) },
      uColor2: { value: new THREE.Color(color2).multiplyScalar(1.4) },
      uK: { value: 0 },
      uTime: { value: 0 },
      uScale: { value: scale },
      uOrigin: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
}

/** 裂紋進度 k（0–1）、顏色、原點（單位腳下的世界座標）*/
export function setCracks(s: Shells, k: number, t: number, origin: THREE.Vector3, color?: THREE.ColorRepresentation, color2?: THREE.ColorRepresentation): void {
  const u = (s.mat as THREE.ShaderMaterial).uniforms
  u.uK.value = k
  u.uTime.value = t
  u.uOrigin.value.copy(origin)
  if (color !== undefined) u.uColor.value.set(color).multiplyScalar(2.2)
  if (color2 !== undefined) u.uColor2.value.set(color2).multiplyScalar(1.4)
  showShells(s, k > 0.005)
}

/** 預熱用：閃光與裂紋材質各一份（常駐，不 dispose）*/
let warm: THREE.Material[] | null = null
export function bodyFxWarmMaterials(): THREE.Material[] {
  if (!warm) {
    const a = flashMat()
    a.opacity = 0.5
    const b = crackMat('#ffffff', '#ffffff')
    b.uniforms.uK.value = 0.5
    a.userData.keep = b.userData.keep = true
    warm = [a, b]
  }
  return warm
}
