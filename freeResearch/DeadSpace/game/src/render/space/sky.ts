// 太空背景：多層星空（大小、閃爍、parallax）＋ fbm 星雲（美術聖經 §3.4、§10）
import * as THREE from 'three'

const NEB_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const NEB_FRAG = `
varying vec3 vDir;
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
float hash(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float t = uTime * 0.004;
  float n = fbm(d * 2.2 + vec3(t, 0.0, -t));
  float m = fbm(d * 4.5 - vec3(0.0, t, 0.0) + n);
  float band = smoothstep(0.55, 0.0, abs(d.y + 0.15 * sin(d.x * 3.0)));
  float neb = pow(clamp(n * m * 1.9, 0.0, 1.0), 2.2) * (0.35 + band * 0.9);
  vec3 col = mix(uColA, uColB, smoothstep(0.2, 0.8, m));
  col = mix(col, uColC, smoothstep(0.6, 0.95, n) * 0.6);
  vec3 base = mix(vec3(0.004, 0.007, 0.016), vec3(0.012, 0.02, 0.045), band);
  float dust = smoothstep(0.45, 0.75, fbm(d * 9.0)) * band * 0.25;
  gl_FragColor = vec4(base + col * neb * 0.9 - dust * 0.02, 1.0);
}`

export function makeSky(radius = 300): { group: THREE.Group; update: (t: number) => void } {
  const group = new THREE.Group()
  const neb = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: NEB_VERT,
      fragmentShader: NEB_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color('#2a1a5e') },
        uColB: { value: new THREE.Color('#0e5a6e') },
        uColC: { value: new THREE.Color('#7a3cff') },
      },
    }),
  )
  group.add(neb)
  // 三層星星
  const layers: THREE.Points[] = []
  for (let L = 0; L < 3; L++) {
    const n = [2600, 900, 160][L]
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const phase = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = radius * (0.85 - L * 0.08)
      const s = Math.sqrt(1 - u * u)
      pos[i * 3] = Math.cos(a) * s * r
      pos[i * 3 + 1] = u * r
      pos[i * 3 + 2] = Math.sin(a) * s * r
      const temp = Math.random()
      const c = new THREE.Color().setHSL(temp < 0.7 ? 0.58 + Math.random() * 0.06 : 0.08 + Math.random() * 0.05, 0.5 + Math.random() * 0.3, 0.7 + Math.random() * 0.3)
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
      size[i] = [0.7, 1.5, 3.2][L] * (0.6 + Math.random() * 0.8)
      phase[i] = Math.random() * 100
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBright: { value: [1.4, 2.2, 4.0][L] } },
      vertexShader: `
        attribute float aSize; attribute float aPhase; attribute vec3 color;
        varying vec3 vC; varying float vTw; uniform float uTime;
        void main(){ vC = color; vTw = 0.65 + 0.35 * sin(uTime * (0.6 + fract(aPhase) * 2.0) + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * 1.6; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vTw; uniform float uBright;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.0, r);
          a = a * a; gl_FragColor = vec4(vC * a * vTw * uBright, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const p = new THREE.Points(g, m)
    p.frustumCulled = false
    layers.push(p)
    group.add(p)
  }
  return {
    group,
    update(t: number) {
      ;(neb.material as THREE.ShaderMaterial).uniforms.uTime.value = t
      layers.forEach((p, i) => {
        ;(p.material as THREE.ShaderMaterial).uniforms.uTime.value = t
        p.rotation.y = t * 0.002 * (i + 1)
      })
    },
  }
}

/** 恆星：發光核心＋日冕 sprite */
export function makeSun(color = '#fff1d6', size = 6): THREE.Group {
  const g = new THREE.Group()
  const core = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(6) }))
  g.add(core)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  const grad = x.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,240,210,1)')
  grad.addColorStop(0.18, 'rgba(255,200,140,0.55)')
  grad.addColorStop(0.45, 'rgba(255,140,80,0.12)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = grad
  x.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
  corona.scale.setScalar(size * 9)
  g.add(corona)
  return g
}

/** 行星：大氣邊緣散射＋晝夜分界 */
export function makePlanet(radius: number, base: string, atmo: string, sunDir: THREE.Vector3): { mesh: THREE.Group; update: (t: number) => void } {
  const g = new THREE.Group()
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir.clone().normalize() }, uBase: { value: new THREE.Color(base) }, uAtmo: { value: new THREE.Color(atmo) }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ vN = normalize(normalMatrix * normal); vW = normalize((modelMatrix * vec4(normal,0.0)).xyz); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW; uniform vec3 uSun; uniform vec3 uBase; uniform vec3 uAtmo; uniform float uTime;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){ float l = max(0.0, dot(vW, uSun)); float term = smoothstep(-0.05, 0.25, dot(vW, uSun));
        float land = n3(vW*3.0) * 0.6 + n3(vW*7.0) * 0.3 + n3(vW*15.0)*0.1;
        float cloud = smoothstep(0.55, 0.8, n3(vW*5.0 + vec3(uTime*0.01,0.0,0.0)));
        vec3 surf = mix(uBase * 0.6, uBase * 1.3, smoothstep(0.4, 0.7, land));
        surf = mix(surf, vec3(0.9), cloud * 0.7);
        float rim = pow(1.0 - max(0.0, dot(normalize(-vP), vN)), 3.0);
        vec3 col = surf * (l * 1.4 + 0.02) * term + uAtmo * rim * (0.3 + term * 1.5);
        gl_FragColor = vec4(col, 1.0); }`,
  })
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat)
  g.add(m)
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.08, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uAtmo: { value: new THREE.Color(atmo) }, uSun: { value: sunDir.clone().normalize() } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vN = normalize(normalMatrix*normal); vW = normalize((modelMatrix*vec4(normal,0.0)).xyz); vec4 mv = modelViewMatrix*vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW; uniform vec3 uAtmo; uniform vec3 uSun;
        void main(){ float rim = pow(1.0 - abs(dot(normalize(-vP), vN)), 2.5); float lit = smoothstep(-0.3, 0.5, dot(vW, uSun)); gl_FragColor = vec4(uAtmo * rim * lit * 2.0, rim * lit); }`,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  g.add(halo)
  return { mesh: g, update: (t) => ((mat.uniforms.uTime.value = t), (m.rotation.y = t * 0.01)) }
}
