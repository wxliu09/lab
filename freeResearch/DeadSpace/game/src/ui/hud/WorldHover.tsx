// 場景物件懸停說明：滑鼠停在單位、設施、地上物品上時，告訴玩家那是什麼、右鍵會做什麼。
// 只用快照裡看得到的欄位（外觀、名稱、血量、旗標），不洩漏任何隱藏資訊。
import { useEffect } from 'preact/hooks'
import { EntFlag } from '../../shared/protocol/messages'
import { UNITS, itemDef } from '../../shared/content/registry'
import { entDefName } from '../names'
import { PLAYER_COLORS } from '../../shared/constants'
import { world } from '../../client/session'
import { cursorScreen, targetMode } from '../../client/input'
import type { GameScene } from '../../render/gameScene'
import { loc, t } from '../i18n'
import { hideTip, showCursorTip, type TipData } from '../tooltip'

const PANEL_FAC = new Set(['struct.power', 'fac.moduleFactory', 'fac.cellConsole', 'fac.cageConsole'])

function desc(id: string): string | undefined {
  const k = 'hover.desc.' + id
  const v = t(k)
  return v === k ? undefined : v
}

export function hoverTip(id: number): TipData | null {
  const e = world.ents.get(id)
  if (!e) return null
  const s = e.s
  const d = s.d ?? ''
  const fl = s.fl ?? 0
  if (d.startsWith('item:')) {
    const it = itemDef(d.slice(5))
    if (!it) return null
    return { title: loc(it.name), sub: `${t('hover.cat.item')} · ${t('tip.cat.' + it.cat)}`, body: loc(it.desc), hint: t('hover.hint.pickup'), color: it.cat === 'suit' ? '#ffc23d' : '#9fe7ff' }
  }
  const def = UNITS.get(d)
  const name = s.n || loc(entDefName(d)) || d
  const hpRow: [string, string][] = s.mhp && !(fl & EntFlag.Corpse) ? [[t('tip.hp'), `${Math.ceil(s.hp ?? 0)} / ${s.mhp}`]] : []
  if (fl & EntFlag.Corpse) return { title: name, sub: t('hover.cat.corpse'), body: desc('corpse'), hint: t('hover.hint.corpse'), color: '#8b9aa8' }
  if (id === (world.me.control ?? world.me.unit)) return { title: name, sub: t('hover.cat.me'), rows: hpRow }
  const tags = def?.tags ?? []
  if (typeof s.x2?.s === 'string') return { title: name, sub: t('hover.cat.vendor'), body: desc(d), hint: t('hover.hint.vendor'), color: '#5cf2a5' }
  if (tags.includes('hazard')) return { title: name, sub: t('hover.cat.hazard'), body: desc(d), hint: t('hover.hint.hazard'), color: '#ff5a4a' }
  if (tags.includes('ship') && tags.includes('structure')) return { title: name, sub: t('hover.cat.ship'), hint: t('hover.hint.board'), color: '#9fe7ff' }
  if (tags.includes('structure')) {
    return { title: name, sub: t(tags.includes('device') ? 'hover.cat.device' : 'hover.cat.structure'), body: desc(d), rows: tags.includes('invuln') ? [] : hpRow, hint: t(PANEL_FAC.has(d) ? 'hover.hint.panel' : 'hover.hint.interact'), color: '#ffc23d' }
  }
  if (tags.includes('device')) return { title: name, sub: t('hover.cat.device'), body: desc(d), rows: hpRow, color: '#ffc23d' }
  const color = (s.c ?? -1) >= 0 ? PLAYER_COLORS[s.c!]?.hex : undefined
  if (fl & EntFlag.Hostile) return { title: name, sub: t('hover.cat.hostile'), rows: hpRow, hint: t('hover.hint.attack'), color: '#ff5a4a' }
  if ((s.o ?? -1) >= 0) return { title: name, sub: t(fl & EntFlag.Ally ? 'hover.cat.ally' : 'hover.cat.player'), rows: hpRow, hint: t('hover.hint.follow'), color }
  if (tags.includes('creature')) return { title: name, sub: t('hover.cat.creature'), rows: hpRow, hint: t('hover.hint.follow') }
  return { title: name, sub: t('hover.cat.npc'), rows: hpRow, hint: t('hover.hint.follow') }
}

/** 掛在 GameScreen：每 0.1 秒看一次游標下的物件，停留 0.25 秒才顯示 */
export function WorldHover({ scene }: { scene: GameScene }) {
  useEffect(() => {
    let cur = 0
    let since = 0
    const h = setInterval(() => {
      const id = cursorScreen.overView && !targetMode.value ? scene.units.hovered : 0
      const now = performance.now()
      if (id !== cur) {
        cur = id
        since = now
        showCursorTip(null, 0, 0)
        return
      }
      if (!id || now - since < 250) return
      showCursorTip(hoverTip(id), cursorScreen.x, cursorScreen.y)
    }, 100)
    return () => {
      clearInterval(h)
      hideTip()
    }
  }, [scene])
  return null
}
