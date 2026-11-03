// 場景物件懸停說明：滑鼠停在單位、設施、地上物品上時，告訴玩家那是什麼、右鍵會做什麼。
// 只用快照裡看得到的欄位（外觀、名稱、血量、旗標），不洩漏任何隱藏資訊。
import { useEffect } from 'preact/hooks'
import { EntFlag, type SnapEntity } from '../../shared/protocol/messages'
import { UNITS, itemDef } from '../../shared/content/registry'
import { entDefName, localizeName } from '../names'
import { PLAYER_COLORS } from '../../shared/constants'
import { world } from '../../client/session'
import { cursorScreen, giveRefusalHere, modalOpen, targetMode } from '../../client/input'
import { invDrag } from '../../client/give'
import type { GameScene } from '../../render/gameScene'
import { meCtx, rightClickAction, rummageCheck, showHp, structKind, type StructKind } from '../../client/interactKind'
import { loc, t } from '../i18n'
import { hideTip, showCursorTip, type TipData } from '../tooltip'

function desc(id: string, args?: Record<string, string | number>): string | undefined {
  const k = 'hover.desc.' + id
  const v = t(k, args)
  return v === k ? undefined : v
}

/** 各類建物懸停時的操作提示（interactKind.ts 的分類）*/
const STRUCT_HINT: Record<StructKind, string | null> = {
  console: 'hover.hint.console',
  portal: 'hover.hint.portalOff',
  scenery: null,
  breakable: 'hover.hint.breakable',
  device: null,
  bomb: 'hover.hint.bomb',
  broken: 'hover.hint.repair',
  panel: 'hover.hint.panel',
  passive: 'hover.hint.passive',
  hostile: 'hover.hint.attack',
  // 雜物箱依自己有沒有翻找技能另外處理（crateTip）
  crate: null,
  interact: 'hover.hint.interact',
}

/**
 * 雜物箱：有翻找技能＝說明右鍵翻找（還不能翻時接著說明冷卻／能量）；沒有的人說明誰能翻、自己只能打破
 * （不再寫「右鍵：走過去使用」——右鍵走過去之後什麼都不會發生）。
 */
function crateTip(s: SnapEntity): { body?: string; hint: string } {
  const r = rummageCheck(s, meCtx(world))
  if (!r) return { hint: t('ui4.hover.crate') }
  const hint = t('ui4.hover.rummage')
  return { body: desc(s.d ?? ''), hint: r.k === 'cast' ? hint : `${hint} · ${t(r.key, r.args)}` }
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
  const name = localizeName(s.n) || loc(entDefName(d)) || d
  // 無敵的設施、站點（安裝座、擺渡號控制台、生命再生器…）不顯示血量
  const hpRow: [string, string][] = showHp(s) ? [[t('tip.hp'), `${Math.ceil(s.hp ?? 0)} / ${s.mhp}`]] : []
  if (fl & EntFlag.Corpse) return { title: name, sub: t('hover.cat.corpse'), body: desc('corpse'), hint: t('hover.hint.corpse'), color: '#8b9aa8' }
  // 太空層的站點與行星：名稱、用途介紹、有沒有人在駕駛；自己正在太空中駕駛時右鍵＝飛過去（敵方的海盜船＝攻擊）
  if (d.startsWith('station.')) {
    const sid = d.slice(8)
    const piloted = (s.o ?? -1) >= 0
    const isMine = id === world.me.control
    const hostile = (fl & EntFlag.Hostile) !== 0
    const ctl = world.ents.get(world.me.control ?? 0)
    const flying = !!ctl && ctl.s.z === 0 && (s.z ?? 0) === 0
    const act = rightClickAction(s)
    return {
      title: name,
      sub: t(isMine ? 'hover.station.mine' : hostile ? 'hover.cat.hostile' : piloted ? 'hover.station.piloted' : 'hover.cat.station'),
      body: t('codex.place.' + sid),
      rows: hpRow,
      hint: isMine ? undefined : act === 'attack' ? t('hover.hint.attack') : flying ? t('hover.hint.flyTo') : t('hover.hint.station'),
      color: hostile ? '#ff5a4a' : piloted && s.c !== undefined && s.c >= 0 ? PLAYER_COLORS[s.c]?.hex : '#9fe7ff',
    }
  }
  if (id === (world.me.control ?? world.me.unit)) return { title: name, sub: t('hover.cat.me'), rows: hpRow }
  const tags = def?.tags ?? []
  if (typeof s.x2?.s === 'string') return { title: name, sub: t('hover.cat.vendor'), body: desc(d), rows: hpRow, hint: t('hover.hint.vendor'), color: '#5cf2a5' }
  if (tags.includes('hazard')) return { title: name, sub: t('hover.cat.hazard'), body: desc(d), hint: t('hover.hint.hazard'), color: '#ff5a4a' }
  if (tags.includes('ship') && tags.includes('structure')) return { title: name, sub: t('hover.cat.ship'), rows: hpRow, hint: t('hover.hint.board'), color: '#9fe7ff' }
  // 標本籠：不是 NPC，也沒有「跟隨」可言
  if (tags.includes('cage')) return { title: name, sub: t('hover.cat.cage'), body: desc(d, { n: Number(s.x2?.n ?? 0) }), rows: hpRow, hint: t('hover.hint.cage'), color: '#ffc23d' }
  const sk = structKind(s)
  if (sk) {
    const hintKey = sk === 'portal' && s.x2?.on ? 'hover.hint.portalOn' : STRUCT_HINT[sk]
    const sub = sk === 'hostile' ? 'hover.cat.hostile' : sk === 'bomb' ? 'hover.cat.bomb' : sk === 'device' ? 'hover.cat.device' : sk === 'scenery' ? 'hover.cat.scenery' : 'hover.cat.structure'
    const color = sk === 'hostile' ? '#ff5a4a' : sk === 'bomb' ? '#ff3b3b' : '#ffc23d'
    if (sk === 'crate') return { title: name, sub: t(sub), rows: hpRow, ...crateTip(s), color }
    return { title: name, sub: t(sub), body: desc(d), rows: sk === 'scenery' ? [] : hpRow, hint: hintKey ? t(hintKey) : undefined, hintColor: sk === 'bomb' ? '#ff5a4a' : undefined, color }
  }
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
      const tip = hoverTip(id)
      // 拖著背包格經過：說明放開會怎樣（交給他，或為什麼不行）
      if (tip && he && invDrag.value) {
        const why = giveRefusalHere(he.s)
        tip.hint = why === null ? t('ui4.drop.give') : why ? t(why) : undefined
      }
      showCursorTip(tip, cursorScreen.x, cursorScreen.y)
    }, 100)
    return () => {
      clearInterval(h)
      hideTip()
    }
  }, [scene])
  return null
}
