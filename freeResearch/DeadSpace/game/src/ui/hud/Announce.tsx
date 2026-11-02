// 公告：全場系統訊息（事件、末日、身分公告、站點被毀…）在畫面上方中央放大顯示；
// 給自己的私人訊息（互動結果、錯誤）在 HUD 上方中央短暫顯示，不必盯著左下角的聊天紀錄。
import { useEffect, useState } from 'preact/hooks'
import { chatTaps, screen, snapTick, world } from '../../client/session'
import type { ChatLine } from '../../shared/protocol/messages'
import { abilityDef } from '../../shared/content/registry'
import { loc, sysText, t } from '../i18n'

interface Item {
  id: number
  text: string
  kind: 'event' | 'apoc' | 'sys' | 'ok' | 'err'
  until: number
  life: number
}

const ERR = /^@(cast\.|vendor\.(soldOut|tooFar|offline|noPower)|item\.(full|uniqueOnly|cantSuit|notYet|deployFail)|role\.cant|chat\.(no|nameTaken)|git\.msg\.already|fac\.(tooFar|offline))/

let seq = 0

function classify(l: ChatLine): Item['kind'] | null {
  const raw = l.text ?? ''
  if (l.ch === 'sys') {
    if (raw.startsWith('@news.')) return null
    if (raw.startsWith('@apoc.')) return 'apoc'
    if (raw.startsWith('@event.') || raw.startsWith('@space.destroyed') || raw.startsWith('@git.destroyed') || raw.startsWith('@st.')) return 'event'
    return 'sys'
  }
  if (l.ch === 'private') return ERR.test(raw) ? 'err' : 'ok'
  return null
}

export function Announcements() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    const tap = (lines: ChatLine[]) => {
      const now = performance.now()
      const add: Item[] = []
      for (const l of lines) {
        const kind = classify(l)
        if (!kind) continue
        const life = kind === 'apoc' ? 10000 : kind === 'event' || kind === 'sys' ? 7000 : 4200
        add.push({ id: ++seq, text: sysText(l.text), kind, until: now + life, life })
      }
      if (add.length) setItems((xs) => [...xs, ...add].slice(-12))
    }
    chatTaps.push(tap)
    return () => {
      const i = chatTaps.indexOf(tap)
      if (i >= 0) chatTaps.splice(i, 1)
    }
  }, [])
  useEffect(() => {
    if (!items.length) return
    const h = setInterval(() => {
      const now = performance.now()
      setItems((xs) => (xs.some((x) => x.until <= now) ? xs.filter((x) => x.until > now) : xs))
    }, 250)
    return () => clearInterval(h)
  }, [items.length])
  if (screen.value !== 'game') return null
  const big = items.filter((x) => x.kind === 'event' || x.kind === 'apoc' || x.kind === 'sys').slice(-3)
  const small = items.filter((x) => x.kind === 'ok' || x.kind === 'err').slice(-3)
  return (
    <>
      {big.length > 0 && (
        <div class="announce" data-testid="announce">
          {big.map((x) => (
            <div key={x.id} class={'announce-line ' + x.kind} style={{ '--life': `${x.life}ms` }}>
              <span class="announce-tag">{t(x.kind === 'apoc' ? 'announce.apoc' : x.kind === 'event' ? 'announce.event' : 'announce.sys')}</span>
              <span>{x.text}</span>
            </div>
          ))}
        </div>
      )}
      {small.length > 0 && (
        <div class="action-toast" data-testid="action-toast">
          {small.map((x) => (
            <div key={x.id} class={'toast-line ' + x.kind} style={{ '--life': `${x.life}ms` }}>
              {x.text}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** 自己的詠唱／引導進度條：直接用 sim 送來的私有狀態 me.cast（[技能, 進度 0–1]），被打斷就會消失 */
export function CastBar() {
  void snapTick.value
  const c = world.me.cast
  if (!c || screen.value !== 'game') return null
  const ab = abilityDef(c[0])
  const k = Math.max(0, Math.min(1, c[1]))
  const left = (ab?.cast ?? 0) * (1 - k)
  return (
    <div class="castbar" data-testid="castbar">
      <div class="castbar-label">
        {t('cast.casting')} {loc(ab?.name)}
        {left > 0 && <span class="mono dim"> {left.toFixed(1)}s</span>}
      </div>
      <div class="castbar-track">
        <i style={{ transform: `scaleX(${k})` }} />
      </div>
    </div>
  )
}
