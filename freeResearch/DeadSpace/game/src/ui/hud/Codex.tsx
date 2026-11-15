// 遊戲內圖鑑（GDD §10）：職業、異類型態、防護服、道具、生物、地點、規則。全部從內容登錄表產生，不含任何對局資訊。
import { signal } from '@preact/signals'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { ABILITIES, CLASSES, FORMS, ITEMS, UNITS } from '../../shared/content/registry'
import { ALL_STATIONS, STATION_BY_ID } from '../../shared/content/stations/index'
import { parseLayout } from '../../shared/layout'
import type { UnitDef } from '../../shared/content/types'
import { modalChecks, typingInField } from '../../client/input'
import { hasString, lang, listJoin, loc, t } from '../i18n'
import { Icon } from '../icons'
import '../../shared/content/index'

export const codexOpen = signal(false)
modalChecks.push(() => codexOpen.value)

type Tab = 'rules' | 'classes' | 'xeno' | 'mutant' | 'android' | 'suits' | 'items' | 'creatures' | 'places'
const TABS: Tab[] = ['rules', 'classes', 'xeno', 'mutant', 'android', 'suits', 'items', 'creatures', 'places']

interface Entry {
  id: string
  name: string
  sub?: string
  icon?: string
  body: string[]
  stats?: [string, string][]
  abilities?: { name: string; desc: string; icon: string }[]
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
    .map((a) => ({ name: loc(a.name), desc: loc(a.desc), icon: a.icon }))
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
          return { id: i.id, name: loc(i.name), icon: 'suit', body: [loc(i.desc)], stats: unitStats(u), abilities: abilitiesOf(u?.abilities ?? []) }
        })
    case 'items':
      return [...ITEMS.values()]
        .filter((i) => i.cat !== 'suit' && i.cat !== 'quest')
        .sort((a, b) => a.cat.localeCompare(b.cat))
        .map((i) => ({ id: i.id, name: loc(i.name), sub: t('codex.cat.' + i.cat), icon: i.icon, body: [loc(i.desc)] }))
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
          body,
          stats: unitStats(u),
        }
      })
    case 'places':
      return ALL_STATIONS.map((s) => ({
        id: s.id,
        name: loc(s.name),
        sub: t('codex.enable.' + s.enable),
        icon: s.outdoor ? 'radar' : 'ship',
        body: [t('codex.place.' + s.id)],
        stats: [
          [t('codex.hp'), String(s.space.hp)],
          [t('codex.pads'), String(parseLayout(s.layout).pads.length)],
        ],
      }))
  }
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
              <div key={e.id} class={'codex-item' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
                {e.icon && <Icon name={e.icon} size={16} />}
                <span class="grow">{e.name}</span>
                {e.sub && <span class="dim mono codex-sub">{e.sub}</span>}
              </div>
            ))}
          </div>
          {cur && (
            <div class="codex-detail">
              <h3>{cur.name}</h3>
              {cur.sub && <div class="dim" style={{ marginBottom: '8px' }}>{cur.sub}</div>}
              {cur.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {cur.stats && cur.stats.length > 0 && (
                <div class="codex-stats">
                  {cur.stats.map(([k, v]) => (
                    <div key={k}>
                      <span class="dim">{k}</span> <b class="mono">{v}</b>
                    </div>
                  ))}
                </div>
              )}
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
