// 販賣機面板：自己的單位走到販賣機旁就出現，顯示庫存與補貨倒數（本作改良：庫存可見）
// 範圍內有好幾台（販賣機挨在一起、GIT 檢測儀旁放了 GIT 解析器、設施旁有販賣機）：右鍵點的那台優先，面板上方有分頁可以切換
// （client/interactPanels.ts；設施面板 Facilities.tsx 用同一份清單）
import { itemDef } from '../../shared/content/registry'
import { entDefName, suitColor } from '../names'
import { itemTip } from '../itemTip'
import { lastInteract } from '../../client/input'
import { send, sendCmd, snapTick, world } from '../../client/session'
import { panelEntries, pickPanel, type PanelEntry } from '../../client/interactPanels'
import type { FacilityView } from '../../shared/protocol/messages'
import { loc, t } from '../i18n'
import { Icon } from '../icons'
import { sfx } from '../../audio/sfx'
import { tipProps } from '../tooltip'
import { OpenSound } from './OpenSound'
import '../strings/fix9t'

/** 設施面板的名稱（同 Facilities.tsx 各面板的標題）*/
const FAC_TITLE: Record<FacilityView['k'], string> = { power: 'fac.power.title', factory: 'fac.factory.title', cells: 'fac.cells.title', cage: 'fac.cage.title' }

/** 範圍內所有互動面板（由近到遠）與這一刻要顯示的那一個 */
export function interactPanels(): { list: PanelEntry[]; cur: PanelEntry | null } {
  if (world.me.alive === false) return { list: [], cur: null }
  const me = world.ents.get(world.me.control || world.me.unit || 0)
  const list = panelEntries(me, world.ents, world.me.fac)
  return { list, cur: pickPanel(list, lastInteract.value) }
}

function baseTabName(p: PanelEntry): string {
  if (p.kind === 'fac') {
    const k = world.me.fac?.k
    return k ? t(FAC_TITLE[k]) : loc(entDefName(p.d))
  }
  return loc(entDefName(p.d)) || p.d
}

/**
 * 分頁名稱（第 9 輪：兩台 GIT 解析器的分頁都叫「GIT 解析器」，分不出哪台是誰的）。同名的分頁才加區別，只用快照本來就有的公開資訊：
 * - 自己放的（快照的擁有者 o = 自己）：「GIT 解析器（你的）」
 * - 其他同名的照實體 id 編號「#1」「#2」（id 不隨走動改變，編號不會跳）；同名的只剩一台不是自己的就不編號
 * owner(id) = 那台的擁有者 slot（看不出來 = -1）
 */
export function tabLabels(list: readonly PanelEntry[], base: (p: PanelEntry) => string, owner: (id: number) => number, me: number): Map<number, string> {
  const out = new Map<number, string>()
  const groups = new Map<string, PanelEntry[]>()
  for (const p of list) {
    const b = base(p)
    groups.set(b, [...(groups.get(b) ?? []), p])
  }
  for (const [b, ps] of groups) {
    if (ps.length < 2) {
      for (const p of ps) out.set(p.id, b)
      continue
    }
    const mine = ps.filter((p) => me >= 0 && owner(p.id) === me)
    const rest = ps.filter((p) => !mine.includes(p)).sort((x, y) => x.id - y.id)
    for (const p of mine) out.set(p.id, t('fix9t.panel.mine', { name: b }))
    rest.forEach((p, i) => out.set(p.id, rest.length > 1 || !mine.length ? t('fix9t.panel.nth', { name: b, n: i + 1 }) : b))
  }
  return out
}

/** 目前範圍內每個分頁的名稱 */
function currentLabels(list: readonly PanelEntry[]): Map<number, string> {
  return tabLabels(list, baseTabName, (id) => world.ents.get(id)?.s.o ?? -1, world.me.slot ?? -1)
}

/** 面板上方的小分頁（範圍內 2 台以上才顯示）：點了就切過去，和右鍵那台一樣記在 lastInteract */
export function PanelTabs({ list, cur }: { list: PanelEntry[]; cur: PanelEntry | null }) {
  if (list.length < 2 || !cur) return null
  const names = currentLabels(list)
  const tabName = (p: PanelEntry) => names.get(p.id) ?? baseTabName(p)
  return (
    <div class="ip-tabs" role="tablist" data-testid="ip-tabs">
      {list.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={p.id === cur.id}
          class={'ip-tab' + (p.id === cur.id ? ' on' : '')}
          data-testid={'ip-tab-' + p.id}
          onClick={() => {
            if (p.id === cur.id) return
            sfx('ui')
            lastInteract.value = p.id
          }}
          {...tipProps(() => ({ title: tabName(p), hint: t('r3b.panel.tabHint') }))}
        >
          {tabName(p)}
        </button>
      ))}
    </div>
  )
}

export function VendorPanel() {
  void snapTick.value
  const { list, cur } = interactPanels()
  if (!cur || cur.kind !== 'vendor') return null
  const vendor = world.ents.get(cur.id)
  if (!vendor) return null
  const vname = entDefName(vendor.s.d)
  const off = Number(vendor.s.x2?.off ?? 0)
  const noPow = !!vendor.s.x2?.nopow
  const have = new Set((world.me.inv ?? []).map((x) => x?.item).filter(Boolean) as string[])
  const rows = String(vendor.s.x2!.s)
    .split('|')
    .filter(Boolean)
    .map((r) => {
      const [item, count, wait] = r.split(':')
      return { item, count: Number(count), wait: Number(wait) }
    })
  void send
  return (
    <div class="panel interact-panel" data-testid="vendor" key={vendor.s.i}>
      <OpenSound />
      <PanelTabs list={list} cur={cur} />
      <div class="ip-head">
        <Icon name="vendor" size={26} color="#5cf2a5" />
        <div>
          {/* 標題和分頁同名（兩台同名的解析器時寫「（你的）」「#1」）*/}
          <h3>{(list.length > 1 && currentLabels(list).get(vendor.s.i)) || loc(vname)}</h3>
          <div class="ip-sub">{t('panel.nearby')}</div>
        </div>
      </div>
      {off > 0 && <div class="notice">{t('vendor.offlineFor', { s: off })}</div>}
      {noPow && <div class="notice">{t('vendor.noPower')}</div>}
      <div class="col" style={{ gap: '6px' }}>
        {rows.map((r) => {
          const it = itemDef(r.item)
          const can = r.count > 0 && off <= 0 && !noPow
          return (
            <div
              class="row ip-row"
              key={r.item}
              {...tipProps(() => itemTip(r.item))}
            >
              <Icon name={it?.icon ?? 'unknown'} size={28} color={it?.suit ? suitColor(it.id) : '#9fe7ff'} />
              <div class="grow">
                <div class="ip-name">{loc(it?.name) || r.item}</div>
                <div class="dim mono ip-meta">
                  {t('vendor.stock', { n: r.count })}
                  {have.has(r.item) ? ' · ' + t('vendor.have') : ''}
                  {r.wait > 0 ? ' · ' + t('vendor.restock', { s: r.wait }) : ''}
                </div>
              </div>
              <button
                class="small"
                data-testid={'buy-' + r.item}
                disabled={!can}
                onClick={() => {
                  sfx('ui')
                  sendCmd({ k: 'buy', e: vendor!.s.i, a: r.item })
                }}
              >
                {/* 賣完了：按鈕直接顯示補貨倒數 */}
                {r.count <= 0 && r.wait > 0 ? `${r.wait}s` : t('vendor.take')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
