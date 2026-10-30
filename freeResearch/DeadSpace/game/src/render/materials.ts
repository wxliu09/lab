// 材質庫：所有場景材質都經過這裡，並注入戰爭迷霧（視野外降飽和、壓暗、細掃描線）
import * as THREE from 'three'
import { fabricSet, floorSet, metalSet, wallSet, type PbrSet } from './tex'

export const fogUniforms = {
  uFogTex: { value: null as THREE.Texture | null },
  uFogRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uFogOn: { value: 0 },
  uTime: { value: 0 },
}

const patched = new WeakSet<THREE.Material>()

/** 把戰爭迷霧注入任何 three 內建材質 */
export function withFog<T extends THREE.Material>(m: T): T {
  if (patched.has(m)) return m
  patched.add(m)
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r)
    Object.assign(shader.uniforms, fogUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vXcWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 xcWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          xcWp = instanceMatrix * xcWp;
        #endif
        vXcWorld = (modelMatrix * xcWp).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vXcWorld;
        uniform sampler2D uFogTex;
        uniform vec4 uFogRect;
        uniform float uFogOn;
        uniform float uTime;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        if (uFogOn > 0.5) {
          vec2 fuv = vec2((vXcWorld.x - uFogRect.x) / uFogRect.z, (-vXcWorld.z - uFogRect.y) / uFogRect.w);
          vec2 fv = texture2D(uFogTex, fuv).rg;
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          float scan = 0.9 + 0.1 * sin(gl_FragCoord.y * 1.7 + uTime * 2.0);
          vec3 mem = mix(vec3(lum) * vec3(0.8, 0.9, 1.05), gl_FragColor.rgb, 0.25) * (0.2 + 0.14 * fv.g) * scan;
          gl_FragColor.rgb = mix(mem, gl_FragColor.rgb, smoothstep(0.05, 0.95, fv.r));
        }`,
      )
  }
  m.customProgramCacheKey = () => 'xcfog'
  return m
}

const cache = new Map<string, THREE.Material>()

function std(key: string, f: () => THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial): THREE.MeshStandardMaterial {
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined
  if (!m) {
    m = withFog(f())
    cache.set(key, m)
  }
  return m
}

function pbr(set: PbrSet, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: set.map,
    roughnessMap: set.roughnessMap,
    normalMap: set.normalMap,
    roughness: 1,
    metalness: 0.6,
    ...extra,
  })
}

/** 角色材質：加上 fresnel 邊光，俯視距離下剪影清楚 */
export function withRim<T extends THREE.MeshStandardMaterial>(m: T, color = '#9fe7ff', strength = 0.35): T {
  const prev = m.onBeforeCompile
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r)
    shader.uniforms.uRimColor = { value: new THREE.Color(color) }
    shader.uniforms.uRimK = { value: strength }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimK;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(dot(normalize(-vViewPosition), normal), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += uRimColor * rimF * uRimK;`,
      )
  }
  const key = m.customProgramCacheKey.bind(m)
  m.customProgramCacheKey = () => key() + ':rim'
  return m
}

export const Mat = {
  floor(variant: 'plate' | 'grate' | 'tile' | 'rubber' | 'concrete', tint: string): THREE.MeshStandardMaterial {
    return std(`floor:${variant}:${tint}`, () => {
      const m = pbr(floorSet(variant, tint), { metalness: variant === 'concrete' || variant === 'rubber' ? 0.05 : 0.55, vertexColors: true })
      m.normalScale.set(0.8, 0.8)
      return m
    })
  },
  wall(tint: string, accent: string): THREE.MeshStandardMaterial {
    return std(`wall:${tint}:${accent}`, () => pbr(wallSet(tint, accent), { metalness: 0.5, vertexColors: true }))
  },
  metal(tint: string, metalness = 0.7, panels = true): THREE.MeshStandardMaterial {
    return std(`metal:${tint}:${metalness}:${panels}`, () => pbr(metalSet(tint, 11, panels), { metalness }))
  },
  paint(tint: string, roughness = 0.5): THREE.MeshStandardMaterial {
    return std(`paint:${tint}:${roughness}`, () => {
      const s = metalSet(tint, 31, false)
      return pbr(s, { metalness: 0.15, roughness: roughness * 1.6 })
    })
  },
  fabric(tint: string): THREE.MeshStandardMaterial {
    return std(`fabric:${tint}`, () => pbr(fabricSet(tint), { metalness: 0 }))
  },
  /** 角色用：布料＋邊光 */
  cloth(tint: string, rim = '#9fe7ff'): THREE.MeshStandardMaterial {
    return std(`cloth:${tint}:${rim}`, () => withRim(pbr(fabricSet(tint), { metalness: 0 }), rim, 0.45))
  },
  armor(tint: string, rim = '#9fe7ff'): THREE.MeshStandardMaterial {
    return std(`armor:${tint}:${rim}`, () => withRim(pbr(metalSet(tint, 51, false), { metalness: 0.55 }), rim, 0.4))
  },
  rubber(tint = '#1d2024'): THREE.MeshStandardMaterial {
    return std(`rubber:${tint}`, () => pbr(metalSet(tint, 41, false), { metalness: 0, roughness: 1.4 }))
  },
  skin(tint: string): THREE.MeshStandardMaterial {
    return std(`skin:${tint}`, () => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.62, metalness: 0 }))
  },
  emissive(color: string, intensity = 3): THREE.MeshStandardMaterial {
    return std(`emi:${color}:${intensity}`, () =>
      new THREE.MeshStandardMaterial({ color: '#000', emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
    )
  },
  screen(tex: THREE.Texture, intensity = 1.6): THREE.MeshStandardMaterial {
    return std(`screen:${tex.uuid}:${intensity}`, () =>
      new THREE.MeshStandardMaterial({ color: '#05080a', emissive: '#fff', emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.15, metalness: 0.2 }),
    )
  },
  glass(tint = '#9fd8ff', opacity = 0.22): THREE.MeshPhysicalMaterial {
    return std(`glass:${tint}:${opacity}`, () =>
      new THREE.MeshPhysicalMaterial({
        color: tint,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ) as THREE.MeshPhysicalMaterial
  },
  liquid(color: string): THREE.MeshPhysicalMaterial {
    return std(`liquid:${color}`, () =>
      new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    ) as THREE.MeshPhysicalMaterial
  },
}
