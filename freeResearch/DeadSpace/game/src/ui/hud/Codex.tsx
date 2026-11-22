// 遊戲內圖鑑（GDD §10）：職業、異類型態、防護服、道具、生物、地點、規則。全部從內容登錄表產生，不含任何對局資訊。
// 第 7 輪：單位類的項目有 3D 縮圖與慢慢轉的預覽（render/portrait.ts，每種單位一張通用圖）；地點用站點識別色的主題卡
import { signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ABILITIES, CLASSES, FORMS, ITEMS, UNITS } from '../../shared/content/registry'
import { ALL_STATIONS, STATION_BY_ID } from '../../shared/content/stations/index'
import { parseLayout } from '../../shared/layout'
import type { UnitDef } from '../../shared/content/types'
import { modalChecks, typingInField } from '../../client/input'
import { hasString, lang, listJoin, loc, t } from '../i18n'
import { Icon } from '../icons'
import { hitsBystanders } from '../aoe'
import { mountSpin, portraitReady, portraitUrl, type PortraitSpec } from '../../render/portrait'
import { THEMES } from '../../render/themes'
import '../strings/ui6'
import '../strings/set7'
import '../screens7.css'
import '../../shared/content/index'

// ───── 3D 小圖與旋轉預覽（圖鑑、開局揭露、結算畫面共用）─────

/** 小圖算好時重繪（portraitUrl 一開始回 null，算好之後才有圖）*/
export function usePortraitReady(): void {
  // 直接讀 portraitReady 訂閱：讀了其他 signal（例如 t() 的語言）的元件，props 沒變時 hooks 的 setState 會被 @preact/signals 擋掉，
  // 小圖畫好了也不會重繪
  void portraitReady.value
}

function specKey(s: PortraitSpec): string {
  return [s.model, s.cls ?? '', s.color ?? '', s.framing ?? ''].join('|')
}

/**
 * 慢慢轉的 3D 預覽（render/portrait.ts 的 mountSpin 掛在 host 裡）。還沒掛上任何東西時（不支援 WebGL、模型還沒準備好）
 * 顯示 fallback（screens7.css：host 有子元素就把 fallback 藏起來）。glow = 模型邊緣的光暈色（drop-shadow 沿著輪廓）
 */
export function Spin3D({ spec, glow, cls = '', testid, children }: { spec: PortraitSpec; glow?: string; cls?: string; testid?: string; children?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null)
  const key = specKey(spec)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return mountSpin(el, spec)
    // spec 以 key 比較（每次渲染都是新物件）
  }, [key])
  return (
    <div class={'r7-spin ' + cls + (glow ? ' r7-glow' : '')} data-testid={testid} style={glow ? { '--glow': glow } : undefined}>
      <div class="r7-spin-host" ref={ref} />
      {children && <div class="r7-spin-fb">{children}</div>}
    </div>
  )
}

/** 陣營第一階的單位模型（每種單位一張通用圖）：結算畫面的勝方、開局揭露的異類用 */
export function factionSpec(faction: string): PortraitSpec {
  if (faction === 'human' || faction === 'crew') return { model: 'human', framing: 'full' }
  const f = [...FORMS.values()].filter((x) => x.faction === faction).sort((a, b) => a.tier - b.tier || a.ep - b.ep)[0]
  const u = f ? UNITS.get(f.unit) : undefined
  return u ? { model: u.model, def: u.id, framing: 'full' } : { model: 'human', framing: 'full' }
}

/** 縮圖（portraitUrl）；還沒有圖時用線條圖示 */
export function Thumb({ spec, icon, size = 64, px = 28 }: { spec?: PortraitSpec; icon?: string; size?: number; px?: number }) {
  const url = spec ? portraitUrl(spec, size) : null
  return (
    <span class="r7-thumb" style={{ width: px + 'px', height: px + 'px' }}>
      {url ? <img src={url} alt="" draggable={false} /> : icon ? <Icon name={icon} size={Math.round(px * 0.6)} /> : null}
    </span>
  )
}

/** 站點的識別色（render/themes.ts）：船殼、牆、強調色、燈色。室外站的牆是 'rock:#rrggbb' 之類，取色碼 */
export function stationColors(id: string): { hull: string; wall: string; acc: string; light: string } {
  const th = THEMES[STATION_BY_ID.get(id)?.theme ?? ''] ?? THEMES.nyx
  const hex = (c: string) => c.slice(c.lastIndexOf(':') + 1)
  return { hull: hex(th.hull), wall: hex(th.wall), acc: th.wallAccent, light: th.light }
}

/** 地點的主題卡（代替截圖）：船殼色底、燈色光暈、強調色的警示條紋與站名 */
function PlaceCard({ id }: { id: string }) {
  const st = STATION_BY_ID.get(id)
  const c = stationColors(id)
  return (
    <div class="r7c-place" data-testid="codex-place-card" style={{ '--hull': c.hull, '--wall': c.wall, '--acc': c.acc, '--light': c.light }}>
      <div class="r7c-place-grid" />
      <div class="r7c-place-glow" />
      <div class="r7c-place-stripes" />
      <div class="r7c-place-text">
        <div class="r7c-place-tag">
          <Icon name={st?.outdoor ? 'radar' : 'ship'} size={14} color={c.acc} />
          {t(st?.outdoor ? 'set7.codex.outdoor' : 'set7.codex.indoor')}
        </div>
        <div class="r7c-place-name">{loc(st?.name)}</div>
        {lang.value !== 'en' && st && <div class="r7c-place-en">{st.name.en}</div>}
      </div>
    </div>
  )
}

export const codexOpen = signal(false)
modalChecks.push(() => codexOpen.value)

type Tab = 'rules' | 'classes' | 'xeno' | 'mutant' | 'android' | 'suits' | 'items' | 'creatures' | 'places'
const TABS: Tab[] = ['rules', 'classes', 'xeno', 'mutant', 'android', 'suits', 'items', 'creatures', 'places']

interface Entry {
  id: string
  name: string
  sub?: string
  icon?: string
  /** 單位類（職業、異類型態、防護服、生物）：3D 縮圖與旋轉預覽的模型（每種單位一張通用圖）*/
  spec?: PortraitSpec
  /** 地點：站點 id（主題卡）*/
  place?: string
  body: string[]
  stats?: [string, string][]
  abilities?: { name: string; desc: string; icon: string }[]
}

/** 單位 → 全身的 3D 圖（def = 單位 id：防護服是 model 'human'＋def 'suit.*'、同模型的變體也靠它）*/
function unitSpec(u: UnitDef | undefined): PortraitSpec | undefined {
  return u ? { model: u.model, def: u.id, framing: 'full' } : undefined
}

function unitStats(u: UnitDef | undefined): [string, string][] {
  if (!u) return []
  const out: [string, string][] = [[t('codex.hp'), String(u.hp)]]
  if (u.mp) out.push([t('codex.mp'), String(u.mp)])
  out.push([t('codex.speed'), u.speed.toFixed(2) + ' m/s'])
  if (u.attack) out.push([t('codex.attack'), `${u.attack.dmg[0]}–${u.attack.dmg[1]} / ${u.attack.cd}s · ${u.attack.range} m`])
  if (u.armor) out.push([t('codex.armor'), String(u.armor)])
  return out
}

function abilitiesOf(ids: string[]): Entry['abilities'] {
  return ids
    .map((a) => ABILITIES.get(a))
    .filter((a): a is NonNullable<typeof a> => !!a && !a.id.startsWith('suit.drop'))
    // 範圍傷害的技能補一句會波及 NPC 船員（第 6 輪審查；同技能 tooltip）
    .map((a) => ({ name: loc(a.name), desc: loc(a.desc) + (hitsBystanders(a.id) ? t('ui6.codex.aoeCrew') : ''), icon: a.icon }))
}

/**
 * 圖鑑的生物清單：名字（兩種語言）一樣、AI 與數值也一樣的單位合併成一組（例如失敗實驗體與帶羊玩偶的那隻、三種異常體）；
 * 數值不同的同名單位不合併，各自一項。順序照第一次出現的位置
 */
export function creatureGroups(units: readonly UnitDef[]): UnitDef[][] {
  const key = (u: UnitDef) => [u.name.zh, u.name.en, u.ai, u.hp, u.speed, u.armor ?? 0, JSON.stringify(u.attack ?? null)].join('|')
  const groups = new Map<string, UnitDef[]>()
  for (const u of units) {
    const k = key(u)
    const g = groups.get(k)
    if (g) g.push(u)
    else groups.set(k, [u])
  }
  return [...groups.values()]
}

/** 同名生物的一種個體：出現的地方（ui5.codex.where.<id>，沒寫就不列地方）、吞噬 EP、掉落物 */
export function variantLine(u: UnitDef): string {
  const st = (id: string) => loc(STATION_BY_ID.get(id)?.name)
  const whereKey = 'ui5.codex.where.' + u.id
  const where = hasString(lang.value, whereKey) ? t(whereKey, { nyx: st('nyx'), verdance: st('verdance'), vivarium: st('vivarium') }) : loc(u.name)
  const drops = u.drops ?? []
  let drop = ''
  if (drops.length === 1 && drops[0].p >= 1) drop = t('ui5.codex.var.dropAlways', { item: loc(ITEMS.get(drops[0].item)?.name) })
  else if (drops.length) {
    // 機率掉落：列出最常見的兩種
    const top = [...drops].sort((a, b) => b.p - a.p).slice(0, 2)
    drop = t('ui5.codex.var.dropMaybe', { n: drops.length, items: listJoin(top.map((d) => loc(ITEMS.get(d.item)?.name))) })
  }
  return u.devourEp ? t('ui5.codex.var.line', { where, ep: u.devourEp, drop }) : where + drop
}

function entries(tab: Tab): Entry[] {
  switch (tab) {
    case 'rules':
      return ['goal', 'roles', 'infect', 'git', 'evolve', 'space', 'death', 'events'].map((k) => ({
        id: k,
        name: t('codex.rule.' + k),
        body: t('codex.rule.' + k + '.body').split('\n'),
      }))
    case 'classes':
      return [...CLASSES.values()].map((c) => ({
        id: c.id,
        name: loc(c.name),
        icon: 'human',
        spec: { model: 'human', cls: c.id, framing: 'full' },
        body: [loc(c.desc), c.items.length ? t('codex.startItems') + t('sep.colon') + listJoin(c.items.map((i) => loc(ITEMS.get(i)?.name))) : ''].filter(Boolean),
        abilities: abilitiesOf(c.abilities),
      }))
    case 'xeno':
    case 'mutant':
    case 'android':
      return [...FORMS.values()]
        .filter((f) => f.faction === tab)
        .sort((a, b) => a.tier - b.tier || a.ep - b.ep)
        .map((f) => {
          const u = UNITS.get(f.unit)
          return {
            id: f.id,
            name: loc(u?.name) || f.id,
            sub: `T${f.tier}${f.ep ? ` · ${f.ep} EP` : ''}${f.from ? ` · ← ${loc(UNITS.get(FORMS.get(f.from)?.unit ?? '')?.name)}` : ''}`,
            icon: tab === 'android' ? 'gear' : tab === 'xeno' ? 'claw' : 'dna',
            spec: unitSpec(u),
            body: [loc(f.desc)],
            stats: unitStats(u),
            abilities: abilitiesOf(u?.abilities ?? []),
          }
        })
    case 'suits':
      return [...ITEMS.values()]
        .filter((i) => i.cat === 'suit')
        .map((i) => {
          const u = i.suit ? UNITS.get(i.suit) : undefined
          // 普攻會爆炸的防護服（火箭裝）：會波及 NPC 船員
          const body = (u?.attack?.aoe ?? 0) > 0 ? [loc(i.desc), t('ui6.tip.aoeCrew')] : [loc(i.desc)]
          return { id: i.id, name: loc(i.name), icon: 'suit', spec: unitSpec(u), body, stats: unitStats(u), abilities: abilitiesOf(u?.abilities ?? []) }
        })
    case 'items':
      return [...ITEMS.values()]
        .filter((i) => i.cat !== 'suit' && i.cat !== 'quest')
        .sort((a, b) => a.cat.localeCompare(b.cat))
        .map((i) => ({ id: i.id, name: loc(i.name), sub: t('codex.cat.' + i.cat), icon: i.icon, body: i.use && hitsBystanders(i.use) ? [loc(i.desc), t('ui6.tip.aoeCrew')] : [loc(i.desc)] }))
    case 'creatures':
      return creatureGroups([...UNITS.values()].filter((u) => u.tags.includes('creature') && !u.tags.includes('summon') && u.ai)).map((g) => {
        const u = g[0]
        const body = [t('codex.ai.' + u.ai + '.body')]
        if (g.length > 1) {
          // 同名的不同單位（例如三種異常體）：合併成一項，逐一列出出現的地方、吞噬 EP 與掉落物（內容表不動）
          body.push(t('ui5.codex.variants', { n: g.length }), ...g.map((x) => '・' + variantLine(x)))
        } else if (u.devourEp) body.push(t('codex.devour', { n: u.devourEp }))
        return {
          id: u.id,
          name: loc(u.name),
          sub: g.length > 1 ? `${t('codex.ai.' + u.ai)} ×${g.length}` : t('codex.ai.' + u.ai),
          icon: u.tags.includes('mechanical') ? 'gear' : 'claw',
          spec: unitSpec(u),
          body,
          stats: unitStats(u),
        }
      })
    case 'places':
      return ALL_STATIONS.map((s) => ({
        id: s.id,
        name: loc(s.name),
        sub: t(placeWhenKey(s.id, s.enable)),
        icon: s.outdoor ? 'radar' : 'ship',
        place: s.id,
        body: s.id === 'caldera' ? [t('codex.place.' + s.id), t('ui6.codex.place.calderaWhen')] : [t('codex.place.' + s.id)],
        stats: [
          [t('codex.hp'), String(s.space.hp)],
          [t('codex.pads'), String(parseLayout(s.layout).pads.length)],
        ],
      }))
  }
}

/**
 * 地點的出現條件（對照 sim：setup.ts 的 chooseStations、stations.ts 的 addCalderaIfEngineer）。站點資料裡標成 auto 的三座站：
 * 活體庫號、擺渡號照原作其實每局都在（ALWAYS_ON_EXTRA）；火口號只在 7 人以上（QR_MIN_PLAYERS）的局、三分之一機率、
 * 而且有人抽到工程師時才出現。第 6 輪審查：原本一律寫「人多時開放」，6 人局明明就有活體庫號、擺渡號。
 */
export function placeWhenKey(id: string, enable: string): string {
  if (id === 'caldera') return 'ui6.codex.enable.caldera'
  if (id === 'vivarium' || id === 'portage') return 'codex.enable.core'
  return 'codex.enable.' + enable
}

/** 數值表 */
function Stats({ stats }: { stats?: [string, string][] }) {
  if (!stats?.length) return null
  return (
    <div class="codex-stats">
      {stats.map(([k, v]) => (
        <div key={k}>
          <span class="dim">{k}</span> <b class="mono">{v}</b>
        </div>
      ))}
    </div>
  )
}

/** 地點清單上的小色塊（主題卡的縮小版）*/
function PlaceChip({ id }: { id: string }) {
  const c = stationColors(id)
  return <span class="r7c-chip" style={{ '--hull': c.hull, '--acc': c.acc, '--light': c.light }} />
}

export function Codex() {
  const [tab, setTab] = useState<Tab>('rules')
  const [sel, setSel] = useState(0)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'F1' && !typingInField()) {
        e.preventDefault()
        codexOpen.value = !codexOpen.value
      } else if (e.code === 'Escape' && codexOpen.value) {
        // capture 階段攔下，免得同一個 Esc 又打開進化選單
        e.stopImmediatePropagation()
        codexOpen.value = false
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [])
  const list = useMemo(() => (codexOpen.value ? entries(tab) : []), [tab, codexOpen.value, lang.value])
  usePortraitReady()
  if (!codexOpen.value) return null
  const cur = list[Math.min(sel, list.length - 1)]
  return (
    <div class="codex-wrap" onClick={(e) => e.target === e.currentTarget && (codexOpen.value = false)}>
      <div class="panel codex" data-testid="codex">
        <div class="codex-head">
          <h2>{t('codex.title')}</h2>
          <div class="codex-tabs">
            {TABS.map((x) => (
              <button key={x} class={'small' + (x === tab ? ' primary' : ' ghost')} onClick={() => (setTab(x), setSel(0))}>
                {t('codex.tab.' + x)}
              </button>
            ))}
          </div>
          <button class="small ghost" onClick={() => (codexOpen.value = false)}>
            ✕
          </button>
        </div>
        <div class="codex-body">
          <div class="codex-list">
            {list.map((e, i) => (
              <div key={e.id} class={'codex-item' + (i === sel ? ' on' : '') + (e.spec || e.place ? ' r7c-item' : '')} onClick={() => setSel(i)}>
                {e.place ? <PlaceChip id={e.place} /> : e.spec ? <Thumb spec={e.spec} icon={e.icon} /> : e.icon && <Icon name={e.icon} size={16} />}
                <span class="grow">{e.name}</span>
                {e.sub && <span class="dim mono codex-sub">{e.sub}</span>}
              </div>
            ))}
          </div>
          {cur && (
            <div class="codex-detail" key={tab + ':' + cur.id}>
              {cur.place && <PlaceCard id={cur.place} />}
              {/* 單位：左邊慢慢轉的 3D 預覽（沒有 WebGL 時退回縮圖或線條圖示），右邊名稱與數值 */}
              <div class={cur.spec ? 'r7c-hero' : undefined}>
                {cur.spec && (
                  <Spin3D spec={cur.spec} cls="r7c-spin" testid="codex-spin">
                    <Thumb spec={cur.spec} icon={cur.icon} size={256} px={120} />
                  </Spin3D>
                )}
                <div class="r7c-hero-text">
                  <h3>{cur.name}</h3>
                  {cur.sub && <div class="dim" style={{ marginBottom: '8px' }}>{cur.sub}</div>}
                  {cur.spec && <Stats stats={cur.stats} />}
                </div>
              </div>
              {cur.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {!cur.spec && <Stats stats={cur.stats} />}
              {cur.abilities && cur.abilities.length > 0 && (
                <div class="col" style={{ gap: '8px', marginTop: '10px' }}>
                  {cur.abilities.map((a) => (
                    <div key={a.name} class="codex-ab">
                      <Icon name={a.icon} size={20} />
                      <div>
                        <b>{a.name}</b>
                        <div class="dim" style={{ fontSize: '13px' }}>
                          {a.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div class="dim" style={{ fontSize: '13px' }}>
          {t('codex.hint')}
        </div>
      </div>
    </div>
  )
}
