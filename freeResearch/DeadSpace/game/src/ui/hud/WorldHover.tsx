// 場景物件懸停說明：滑鼠停在單位、設施、地上物品上時，告訴玩家那是什麼、右鍵會做什麼。
// 只用快照裡看得到的欄位（外觀、名稱、血量、旗標），不洩漏任何隱藏資訊。
import { useEffect } from 'preact/hooks'
import { EntFlag } from '../../shared/protocol/messages'
import { UNITS, itemDef } from '../../shared/content/registry'
import { entDefName } from '../names'
import { PLAYER_COLORS } from '../../shared/constants'
import { world } from '../../client/session'
import { cursorScreen, modalOpen, targetMode } from '../../client/input'
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
  // 太空層的站點與行星：名稱、用途介紹、有沒有人在駕駛
  if (d.startsWith('station.')) {
    const sid = d.slice(8)
    const piloted = (s.o ?? -1) >= 0
    const isMine = id === world.me.control
    return {
      title: name,
      sub: t(isMine ? 'hover.station.mine' : piloted ? 'hover.station.piloted' : 'hover.cat.station'),
      body: t('codex.place.' + sid),
      rows: hpRow,
      hint: t('hover.hint.station'),
      color: piloted && s.c !== undefined && s.c >= 0 ? PLAYER_COLORS[s.c]?.hex : '#9fe7ff',
    }
  }
  if (id === (world.me.control ?? world.me.unit)) return { title: name, sub: t('hover.cat.me'), rows: hpRow }
  const tags = def?.tags ?? []
  if (typeof s.x2?.s === 'string') return { title: name, sub: t('hover.cat.vendor'), body: desc(d), hint: t('hover.hint.vendor'), color: '#5cf2a5' }
  if (tags.includes('hazard')) return { title: name, sub: t('hover.cat.hazard'), body: desc(d), hint: t('hover.hint.hazard'), color: '#ff5a4a' }
  if (tags.includes('ship') && tags.includes('structure')) return { title: name, sub: t('hover.cat.ship'), hint: t('hover.hint.board'), color: '#9fe7ff' }
  if (tags.includes('structure')) {
    return { title: name, sub: t(tags.includes('device') ? 'hover.cat.device' : 'hover.cat.structure'), body: desc(d), rows: tags.includes('invuln') ? [] : hpRow, hint: t(PANEL_FAC.has(d) ? 'hover.hint.panel' : d === 'struct.console' ? 'hover.hint.console' : d === 'struct.regen' ? 'hover.hint.passive' : 'hover.hint.interact'), color: '#ffc23d' }
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
    let zone = scene.zone
    const h = setInterval(() => {
      // 換了場景（登船、下船、傳送）而滑鼠沒動：舊場景的懸停卡片收掉
      if (scene.zone !== zone) {
        zone = scene.zone
        cur = 0
        showCursorTip(null, 0, 0)
        return
      }
      // 瞄準中、或有對話框（選單、設定、說明…）開著時不顯示；不在目前場景裡的單位也不顯示
      const hov = cursorScreen.overView && !targetMode.value && !modalOpen() ? scene.units.hovered : 0
      const he = hov ? world.ents.get(hov) : undefined
      const id = he && (he.s.z ?? zone) === zone ? hov : 0
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
