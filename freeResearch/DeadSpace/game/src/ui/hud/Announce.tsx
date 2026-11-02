// 公告：全場系統訊息（事件、末日、身分公告、站點被毀…）在畫面上方中央放大顯示；
// 給自己的私人訊息（互動結果、錯誤）在 HUD 上方中央短暫顯示，不必盯著左下角的聊天紀錄。
import { useEffect, useState } from 'preact/hooks'
import { chatLog, screen, world } from '../../client/session'
import type { ChatLine, FxEvent } from '../../shared/protocol/messages'
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
  const [seen, setSeen] = useState(chatLog.value.length)
  const log = chatLog.value
  useEffect(() => {
    if (log.length < seen) return setSeen(log.length)
    if (log.length === seen) return
    const now = performance.now()
    const add: Item[] = []
    for (const l of log.slice(seen)) {
      const kind = classify(l)
      if (!kind) continue
      const life = kind === 'apoc' ? 10000 : kind === 'event' || kind === 'sys' ? 7000 : 4200
      add.push({ id: ++seq, text: sysText(l.text), kind, until: now + life, life })
    }
    setSeen(log.length)
    if (add.length) setItems((xs) => [...xs, ...add])
  }, [log, seen])
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

/** 自己的詠唱／引導進度條（castStart 特效帶持續時間）：放在 HUD 上方中央 */
export function CastBar() {
  const [cast, setCast] = useState<{ name: string; start: number; dur: number } | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    const tap = (f: FxEvent) => {
      if (f.k !== 'castStart') return
      const me = world.me.control ?? world.me.unit
      if (!me || f.e !== me) return
      const ab = f.s ? abilityDef(f.s) : undefined
      setCast({ name: loc(ab?.name) || '', start: performance.now(), dur: Math.max(0.2, f.v ?? 0.5) * 1000 })
    }
    world.fxTaps.push(tap)
    return () => {
      const i = world.fxTaps.indexOf(tap)
      if (i >= 0) world.fxTaps.splice(i, 1)
    }
  }, [])
  useEffect(() => {
    if (!cast) return
    let raf = 0
    const step = () => {
      if (performance.now() - cast.start >= cast.dur) return setCast(null)
      setTick((x) => x + 1)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [cast])
  if (!cast || screen.value !== 'game') return null
  const k = Math.min(1, (performance.now() - cast.start) / cast.dur)
  return (
    <div class="castbar" data-testid="castbar">
      <div class="castbar-label">
        {t('cast.casting')} {cast.name}
        <span class="mono dim"> {((cast.dur * (1 - k)) / 1000).toFixed(1)}s</span>
      </div>
      <div class="castbar-track">
        <i style={{ transform: `scaleX(${k})` }} />
      </div>
    </div>
  )
}
