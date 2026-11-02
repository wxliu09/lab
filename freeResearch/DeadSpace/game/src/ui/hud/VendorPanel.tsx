// 販賣機面板：自己的單位走到販賣機旁就出現，顯示庫存與補貨倒數（本作改良：庫存可見）
import { itemDef } from '../../shared/content/registry'
import { entDefName, suitColor } from '../names'
import { itemTip } from '../itemTip'
import { lastInteract } from '../../client/input'
import { send, sendCmd, snapTick, world } from '../../client/session'
import { loc, t } from '../i18n'
import { Icon } from '../icons'
import { sfx } from '../../audio/sfx'
import { tipProps } from '../tooltip'
import { OpenSound } from './OpenSound'

const RANGE = 2.9

export function VendorPanel() {
  void snapTick.value
  const me = world.ents.get(world.me.control || world.me.unit || 0)
  if (!me || world.me.alive === false) return null
  let vendor = null as null | (typeof me)
  let best = RANGE
  for (const e of world.ents.values()) {
    if (e.s.z !== me.s.z || !e.s.x2 || typeof e.s.x2.s !== 'string') continue
    const d = Math.hypot(e.x - me.x, e.y - me.y)
    if (d < best) {
      best = d
      vendor = e
    }
  }
  // 幾台販賣機挨在一起時，優先顯示玩家剛右鍵的那台
  const picked = lastInteract.value ? world.ents.get(lastInteract.value) : undefined
  if (picked && picked.s.z === me.s.z && typeof picked.s.x2?.s === 'string' && Math.hypot(picked.x - me.x, picked.y - me.y) < RANGE) vendor = picked
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
      <div class="ip-head">
        <Icon name="vendor" size={26} color="#5cf2a5" />
        <div>
          <h3>{loc(vname)}</h3>
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
                {t('vendor.take')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
