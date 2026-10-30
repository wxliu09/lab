// 販賣機面板：自己的單位走到販賣機旁就出現，顯示庫存與補貨倒數（本作改良：庫存可見）
import { UNITS, itemDef } from '../../shared/content/registry'
import { send, sendCmd, snapTick, world } from '../../client/session'
import { loc, t } from '../i18n'
import { Icon } from '../icons'
import { sfx } from '../../audio/sfx'

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
  if (!vendor) return null
  const def = UNITS.get(vendor.s.d ?? '')
  const off = Number(vendor.s.x2?.off ?? 0)
  const rows = String(vendor.s.x2!.s)
    .split('|')
    .filter(Boolean)
    .map((r) => {
      const [item, count, wait] = r.split(':')
      return { item, count: Number(count), wait: Number(wait) }
    })
  void send
  return (
    <div class="panel" data-testid="vendor" style={{ position: 'absolute', right: '12px', bottom: '210px', width: '300px', padding: '12px' }}>
      <h3>{loc(def?.name)}</h3>
      {off > 0 && <div class="notice">{t('vendor.offlineFor', { s: off })}</div>}
      <div class="col" style={{ gap: '6px' }}>
        {rows.map((r) => {
          const it = itemDef(r.item)
          const can = r.count > 0 && off <= 0
          return (
            <div class="row" key={r.item} style={{ gap: '8px' }}>
              <Icon name={it?.icon ?? 'unknown'} size={22} color={it?.cat === 'suit' ? '#ffc23d' : '#9fe7ff'} />
              <div class="grow" title={loc(it?.desc)}>
                <div style={{ fontSize: '13px' }}>{loc(it?.name) || r.item}</div>
                <div class="dim mono" style={{ fontSize: '11px' }}>
                  {t('vendor.stock', { n: r.count })}
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
