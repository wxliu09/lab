// 畫質預設（美術聖經 §14）＋進階畫質的個別項目覆寫（第 7 輪）
import { batch, computed, signal } from '@preact/signals'

export type Quality = 'low' | 'medium' | 'high' | 'ultra'

export interface QualityPreset {
  dpr: number
  shadows: 0 | 1 | 2
  ssao: 0 | 1 | 2
  bloom: number
  particles: number
  maxLights: number
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { dpr: 1, shadows: 0, ssao: 0, bloom: 0.5, particles: 500, maxLights: 4 },
  medium: { dpr: 1.25, shadows: 1, ssao: 1, bloom: 0.8, particles: 1500, maxLights: 6 },
  high: { dpr: 1.5, shadows: 2, ssao: 2, bloom: 1, particles: 3000, maxLights: 8 },
  ultra: { dpr: 2, shadows: 2, ssao: 2, bloom: 1, particles: 6000, maxLights: 8 },
}

function stored(): Quality | null {
  try {
    const v = localStorage.getItem('xc.quality')
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') return v
  } catch {
    /* ignore */
  }
  return null
}

export const quality = signal<Quality>(stored() ?? 'medium')

/** 內顯、行動裝置 GPU、軟體算繪（Intel Arc 是獨顯；Apple M 系列效能足夠跑 medium，不算在內）*/
const WEAK_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|intel(?!.*\barc\b)|radeon\(tm\) graphics|radeon vega|vega \d+ graphics|mali|adreno|powervr|videocore|apple gpu/i

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render/i

function glName(gl: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  try {
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  } catch {
    return ''
  }
}

/** 軟體算繪（沒有可用的 GPU）*/
export function isSoftwareGl(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  return SOFTWARE_GL.test(glName(gl))
}

/**
 * 依裝置推測的預設畫質：GPU 名稱（WEBGL_debug_renderer_info）、邏輯核心數、記憶體（deviceMemory，Chrome 才有）。
 * 低階或內顯 → low，其餘 medium。
 * Safari 不回報實際型號，Apple Silicon 的 Mac 與 iPhone／iPad 都只回 'Apple GPU'：沒有觸控點（maxTouchPoints = 0）的是 Mac（M 系列），
 * 和 Chrome 回報的「Apple M…」一樣給 medium；有觸控點（iPad 的 Safari 也假裝成 Mac，但 maxTouchPoints > 0）維持 low。
 */
export function detectQuality(gl: WebGLRenderingContext | WebGL2RenderingContext | null, nav: { hardwareConcurrency?: number; deviceMemory?: number; maxTouchPoints?: number } = navigator): Quality {
  const cores = nav.hardwareConcurrency ?? 8
  const mem = nav.deviceMemory
  if (cores <= 4 || (mem !== undefined && mem <= 4)) return 'low'
  const name = glName(gl)
  if (/^apple gpu$/i.test(name.trim()) && nav.maxTouchPoints === 0) return 'medium'
  return WEAK_GPU.test(name) ? 'low' : 'medium'
}

type NavInfo = { hardwareConcurrency?: number; deviceMemory?: number; maxTouchPoints?: number; userAgent?: string; userAgentData?: { mobile?: boolean } }

/** 行動裝置的 GPU（Android 的 Mali／Adreno／PowerVR、樹莓派的 VideoCore）*/
const MOBILE_GPU = /mali|adreno|powervr|videocore/i

/**
 * 行動裝置：行動 GPU、UA Client Hints 說是行動裝置、UA 是 Android／iPhone／iPad，
 * 或 Safari 的 'Apple GPU' 有觸控點（iPad 的 Safari 也假裝成 Mac，只能靠 maxTouchPoints 分辨；不知道觸控點時保守當成行動裝置）。
 */
function isMobile(name: string, nav: NavInfo): boolean {
  if (MOBILE_GPU.test(name)) return true
  if (nav.userAgentData?.mobile === true) return true
  if (/android|iphone|ipad|ipod|mobile/i.test(nav.userAgent ?? '')) return true
  return /^apple gpu$/i.test(name.trim()) && nav.maxTouchPoints !== 0
}

/**
 * 能不能在開局後預建本局的其他站點（全部預建多佔約 300 MB GPU 記憶體與 RSS，建一站在軟體算繪要好幾秒）：
 * 只有 ≤ 4 核心、deviceMemory ≤ 4 GB、行動裝置、軟體算繪不預建。
 * 一般內顯筆電（Intel Iris Xe／UHD、AMD APU，> 4 核心且 > 4 GB）要預建——預設畫質仍可能是 low（detectQuality），兩者分開判斷。
 */
export function canPrebuild(gl: WebGLRenderingContext | WebGL2RenderingContext | null, nav: NavInfo = navigator): boolean {
  const cores = nav.hardwareConcurrency ?? 8
  const mem = nav.deviceMemory
  if (cores <= 4 || (mem !== undefined && mem <= 4)) return false
  const name = glName(gl)
  if (SOFTWARE_GL.test(name)) return false
  return !isMobile(name, nav)
}

/** 使用者自己在設定裡選過畫質（xc.quality 有值；setQuality 會更新）*/
let chosen = stored() !== null

/** 使用者自己在設定裡選過畫質；自動降畫質只在沒選過時才做（每幀都會問，不讀 localStorage）*/
export function qualityChosen(): boolean {
  return chosen
}

/** 自動降畫質：只改這一次執行的畫質，不寫進設定（之後仍算「沒選過」，使用者改設定就以使用者的為準）*/
export function autoLowerQuality(q: Quality): void {
  if (q !== quality.value) quality.value = q
}

/** 首次啟動（使用者沒選過畫質）：依裝置自動選，不寫入設定；使用者自己選過的設定優先 */
export function autoQuality(gl: WebGLRenderingContext | WebGL2RenderingContext | null): void {
  if (stored()) return
  const q = detectQuality(gl)
  if (q !== quality.value) quality.value = q
}

/** 選一個畫質預設：同時清掉進階畫質的個別覆寫（選預設＝整組照預設；GPU 重置橫幅的「降低畫質」也走這裡）*/
export function setQuality(q: Quality): void {
  // 同一批更新：engine.ts 的後處理重建 effect 只重跑一次
  batch(() => {
    quality.value = q
    resetDetail()
  })
  chosen = true
  try {
    localStorage.setItem('xc.quality', q)
  } catch {
    /* ignore */
  }
}

// ───── 進階畫質：在所選的預設之上個別覆寫（陰影、環境光遮蔽、泛光、粒子密度、解析度）─────

/** 進階畫質可以個別調整的項目；res = 解析度（螢幕原生解析度的比例，換算成 dpr）*/
export type DetailKey = 'shadows' | 'ssao' | 'bloom' | 'particles' | 'res'

/** 個別覆寫（沒有的欄位 = 跟著預設）*/
export interface QualityDetail {
  shadows?: 0 | 1 | 2
  ssao?: 0 | 1 | 2
  bloom?: number
  particles?: number
  /** 0.5–1：螢幕原生解析度的比例 */
  res?: number
}

/** 設定頁下拉選單的選項（陰影、AO：0 關／1 低／2 高；泛光強度；粒子上限＝四個預設的值）*/
export const DETAIL_CHOICES = {
  shadows: [0, 1, 2],
  ssao: [0, 1, 2],
  bloom: [0, 0.5, 0.8, 1],
  particles: [500, 1500, 3000, 6000],
} as const satisfies Record<Exclude<DetailKey, 'res'>, readonly number[]>

/** 解析度比例的範圍 */
export const RES_MIN = 0.5
export const RES_MAX = 1

const DETAIL_STORE = 'xc.qualityDetail'

function oneOf<T extends number>(v: unknown, list: readonly T[]): T | undefined {
  return typeof v === 'number' && (list as readonly number[]).includes(v) ? (v as T) : undefined
}

/** 存檔內容 → 覆寫（格式不對、超出範圍的欄位丟掉）*/
export function sanitizeDetail(v: unknown): QualityDetail {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  const d: QualityDetail = {}
  const sh = oneOf(o.shadows, DETAIL_CHOICES.shadows)
  if (sh !== undefined) d.shadows = sh
  const ao = oneOf(o.ssao, DETAIL_CHOICES.ssao)
  if (ao !== undefined) d.ssao = ao
  const bl = oneOf(o.bloom, DETAIL_CHOICES.bloom)
  if (bl !== undefined) d.bloom = bl
  const pa = oneOf(o.particles, DETAIL_CHOICES.particles)
  if (pa !== undefined) d.particles = pa
  if (typeof o.res === 'number' && Number.isFinite(o.res) && o.res >= RES_MIN && o.res <= RES_MAX) d.res = o.res
  return d
}

function storedDetail(): QualityDetail {
  try {
    const raw = localStorage.getItem(DETAIL_STORE)
    return raw ? sanitizeDetail(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

/** 目前的個別覆寫（設定頁讀寫；改了就存檔）*/
export const qualityDetail = signal<QualityDetail>(storedDetail())

function screenDpr(): number {
  return (typeof window !== 'undefined' && window.devicePixelRatio) || 1
}

/** 沒有覆寫時的解析度比例：預設的 dpr 上限 ÷ 螢幕 dpr（1x 螢幕上四個預設都是 100%）*/
export function baseRes(q: Quality = quality.value, dpr = screenDpr()): number {
  return Math.min(1, PRESETS[q].dpr / dpr)
}

/** 預設＋覆寫 → 實際的畫質（純函式；dpr = 螢幕的 devicePixelRatio）*/
export function applyDetail(base: QualityPreset, d: QualityDetail, dpr: number): QualityPreset {
  return {
    dpr: d.res !== undefined ? d.res * dpr : base.dpr,
    shadows: d.shadows ?? base.shadows,
    ssao: d.ssao ?? base.ssao,
    bloom: d.bloom ?? base.bloom,
    particles: d.particles ?? base.particles,
    maxLights: base.maxLights,
  }
}

/** 某一項目前實際的值（設定頁顯示用；res 是比例）*/
export function detailValue(k: DetailKey): number {
  const d = qualityDetail.value
  if (k === 'res') return d.res ?? baseRes()
  return d[k] ?? PRESETS[quality.value][k]
}

function saveDetail(d: QualityDetail): void {
  qualityDetail.value = d
  try {
    if (Object.keys(d).length) localStorage.setItem(DETAIL_STORE, JSON.stringify(d))
    else localStorage.removeItem(DETAIL_STORE)
  } catch {
    /* ignore */
  }
}

/**
 * 改一項（null = 回到預設）。和預設一樣的值不留覆寫（才不會一直顯示「自訂」）。
 * 改過就算使用者自己選過畫質：fps 過低時不再自動降畫質；目前的預設也一起存檔（下次開啟以它為基礎）
 */
export function setDetail(k: DetailKey, v: number | null): void {
  const d: QualityDetail = { ...qualityDetail.value }
  const base = k === 'res' ? baseRes() : PRESETS[quality.value][k]
  if (v === null || Math.abs(v - base) < 1e-6) delete d[k]
  else Object.assign(d, sanitizeDetail({ [k]: v }))
  chosen = true
  try {
    localStorage.setItem('xc.quality', quality.value)
  } catch {
    /* ignore */
  }
  saveDetail(d)
}

/** 清掉所有個別覆寫（回到所選預設）*/
export function resetDetail(): void {
  if (Object.keys(qualityDetail.value).length) saveDetail({})
}

/** 有任何一項和所選預設不同（設定頁顯示「自訂」）*/
export function isCustom(): boolean {
  const d = qualityDetail.value
  const p = PRESETS[quality.value]
  return (Object.keys(d) as DetailKey[]).some((k) => (k === 'res' ? Math.abs((d.res ?? 0) - baseRes()) > 1e-6 : d[k] !== p[k]))
}

// 每一項各自一個 computed：只有讀到的項目真的變了才通知（engine.ts 的後處理重建 effect 只讀陰影、AO、泛光、dpr，
// 改粒子密度不會整條後處理重建、重編 shader）
const BASE = computed(() => PRESETS[quality.value])
const SHADOWS = computed(() => qualityDetail.value.shadows ?? BASE.value.shadows)
const SSAO = computed(() => qualityDetail.value.ssao ?? BASE.value.ssao)
const BLOOM = computed(() => qualityDetail.value.bloom ?? BASE.value.bloom)
const PARTICLES = computed(() => qualityDetail.value.particles ?? BASE.value.particles)
const RES = computed(() => qualityDetail.value.res)

/** preset() 回傳的物件：每個欄位都是 getter（讀的當下才算，effect 只訂閱它實際讀到的欄位）*/
const VIEW: QualityPreset = {
  get dpr() {
    const r = RES.value
    return r === undefined ? BASE.value.dpr : r * screenDpr()
  },
  get shadows() {
    return SHADOWS.value
  },
  get ssao() {
    return SSAO.value
  },
  get bloom() {
    return BLOOM.value
  },
  get particles() {
    return PARTICLES.value
  },
  get maxLights() {
    return BASE.value.maxLights
  },
}

/**
 * 目前實際的畫質（預設＋進階畫質覆寫）。欄位是即時的 getter：要固定一份請自己複製（{ ...preset() }）。
 * 在 effect 裡讀到的欄位會被訂閱（engine.ts 的重建 effect 因此會跟著陰影、AO、泛光、解析度的覆寫重建）
 */
export function preset(): QualityPreset {
  return VIEW
}
