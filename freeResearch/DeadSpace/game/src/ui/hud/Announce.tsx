// 公告：全場系統訊息（事件、末日、身分公告、站點被毀…）在畫面上方中央放大顯示；
// 給自己的私人訊息（互動結果、錯誤）在 HUD 上方、聊天紀錄右側短暫顯示，不必盯著左下角的聊天紀錄。
// 大公告只顯示標題句（字串有 key.title 就用它），對策等完整內容留在聊天紀錄；最多 2 行，整疊不壓到聊天紀錄。
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { effect, signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { chatTaps, cmdTaps, screen, snapTick, world } from '../../client/session'
import { localNotice } from '../../client/input'
import type { ChatLine, Command } from '../../shared/protocol/messages'
import { deathScreenOnly } from '../../client/deathNote'
import { HitWatch, reducedMotion } from '../../client/hitAlert'
import { EXPOSING_ABILITIES, watcherCount } from '../../client/exposure'
import { abilityDef, itemDef } from '../../shared/content/registry'
import { hasString, lang, loc, sysText, t } from '../i18n'
import { fmtSecs, useCountdown } from './CdFace'

interface Item {
  id: number
  text: string
  kind: 'event' | 'apoc' | 'sys' | 'ok' | 'err'
  until: number
  life: number
  /** 只顯示了標題句（完整內容在聊天紀錄）*/
  more?: boolean
  /** 同一則內容在顯示期間又來了幾次（去重後顯示「×N」）*/
  count?: number
}

/** 大公告（上方中央）或小提示（HUD 上方）：去重只在同一區裡比 */
function area(k: Item['kind']): 'big' | 'small' {
  return k === 'ok' || k === 'err' ? 'small' : 'big'
}

/**
 * 加入新的公告／提示：同一區裡已經有一則內容相同、還在顯示的，就拿掉舊的、新的接在最後（重新計時），
 * 並記下重複的次數；同一句話不會疊兩條在畫面上。now = 判斷「還在顯示」的時間。
 */
export function addItems<T extends { text: string; kind: Item['kind']; until: number; count?: number }>(xs: readonly T[], add: readonly T[], now: number, max = 12): T[] {
  let out = [...xs]
  for (const it of add) {
    const old = out.find((x) => x.text === it.text && area(x.kind) === area(it.kind) && x.until > now)
    if (old) out = out.filter((x) => x !== old)
    out.push(old ? { ...it, count: (old.count ?? 1) + 1 } : it)
  }
  return out.slice(-max)
}

/**
 * 大公告要顯示的文字：`@key|…` 的字串有 key.title（目前語言）就只顯示標題句，參數照用；
 * 沒有標題的短訊息照原文。回傳 [文字, 是否省略了內容]。
 */
export function announceText(raw: string): [string, boolean] {
  if (raw.startsWith('@')) {
    const bar = raw.indexOf('|')
    const key = raw.slice(1, bar < 0 ? undefined : bar)
    if (hasString(lang.value, key + '.title')) return [sysText('@' + key + '.title' + (bar < 0 ? '' : raw.slice(bar))), true]
  }
  return [sysText(raw), false]
}

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/

/** 大公告的顯示時間（毫秒）：5 秒＋每字 40 ms（全形字算 2.5 字，中文讀得比較慢），上限 14 秒；末日至少 8 秒 */
export function announceLife(text: string, kind: Item['kind']): number {
  let ms = 5000
  for (const ch of text) ms += CJK.test(ch) ? 100 : 40
  return Math.min(14000, Math.max(kind === 'apoc' ? 8000 : 0, ms))
}

/**
 * 本機提示（右上小提示）的顯示時間（毫秒）：1.5 秒＋每字 50 ms（全形字 130 ms），至少 1.8 秒、上限 8 秒。
 * 「畫面太慢，已自動降低畫質（可在設定改回）」這種長句原本固定 1.8 秒，來不及讀完。
 */
export function noticeLife(text: string): number {
  let ms = 1500
  for (const ch of text) ms += CJK.test(ch) ? 130 : 50
  return Math.min(8000, Math.max(1800, ms))
}

const ERR = /^@(cast\.|vendor\.(soldOut|tooFar|offline|noPower)|item\.(full|giveFull|uniqueOnly|cantSuit|notYet|deployFail)|role\.cant|chat\.(no|nameTaken)|git\.msg\.already|fac\.(tooFar|offline))/

let seq = 0

/** 上方中央堆疊容器裡給其他提示（瞄準、投票）用的插槽：由 Announcements 掛上，其他元件用 TopSlot 放進來 */
const topSlots = signal<HTMLElement | null>(null)
const setTopSlots = (el: HTMLElement | null) => {
  if (topSlots.peek() !== el) topSlots.value = el
}

/**
 * 放進上方中央的堆疊容器（在公告上面，依 order 由上往下排），不必各自用絕對定位互相閃躲。
 * GameScreen 照舊各自渲染這些元件；容器還沒掛上時先不顯示。
 */
export function TopSlot({ order, children }: { order: number; children: ComponentChildren }) {
  const el = topSlots.value
  if (!el) return null
  return createPortal(<div style={{ order }}>{children}</div>, el)
}

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
  const stack = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ key: '', drop: 0, room: 0 })
  useEffect(() => {
    const tap = (lines: ChatLine[]) => {
      const now = performance.now()
      const add: Item[] = []
      for (const l of lines) {
        // 死因與「你死了…」只在死亡橫幅顯示（Hud.tsx 的 Banner、client/deathNote.ts）
        if (deathScreenOnly(l)) continue
        const kind = classify(l)
        if (!kind) continue
        if (kind === 'ok' || kind === 'err') {
          add.push({ id: ++seq, text: sysText(l.text), kind, until: now + 4200, life: 4200 })
          continue
        }
        const [text, more] = announceText(l.text)
        const life = announceLife(text, kind)
        add.push({ id: ++seq, text, kind, until: now + life, life, more })
      }
      if (add.length) setItems((xs) => addItems(xs, add, now))
    }
    chatTaps.push(tap)
    return () => {
      const i = chatTaps.indexOf(tap)
      if (i >= 0) chatTaps.splice(i, 1)
    }
  }, [])
  // 背包多了東西（販賣機取用、撿起來、別人給的）：提示放在哪一格
  void snapTick.value
  const inv = (world.me.inv ?? []).map((x) => x?.item ?? '')
  const invKey = inv.join('|')
  const lastInv = useRef<string[] | null>(null)
  useEffect(() => {
    const prev = lastInv.current
    lastInv.current = inv
    if (!prev || prev.length !== inv.length || screen.value !== 'game') return
    const now = performance.now()
    const add: Item[] = []
    inv.forEach((id, i) => {
      if (id && id !== prev[i] && !prev.includes(id)) add.push({ id: ++seq, text: t('inv.got', { item: loc(itemDef(id)?.name) || id, n: i + 1 }), kind: 'ok', until: now + 3000, life: 3000 })
    })
    if (add.length) setItems((xs) => addItems(xs, add, now))
  }, [invKey])
  // 本機提示（不經網路）
  const ln = localNotice.value
  useEffect(() => {
    if (!ln) return
    const now = performance.now()
    const text = t(ln.text, ln.args)
    const life = ln.life ?? noticeLife(text)
    setItems((xs) => addItems(xs, [{ id: ++seq, text, kind: 'err' as const, until: now + life, life }], now))
  }, [ln])
  // 被攻擊：畫面邊緣紅色暈影閃一下＋「你正受到攻擊」（hitAlert.ts；不顯示方向，攻擊者可能是隱形的）
  const [hitFlash, setHitFlash] = useState(0)
  useEffect(() => {
    const watch = new HitWatch()
    const tap = (c: Command) => watch.command(c, performance.now())
    cmdTaps.push(tap)
    const stop = effect(() => {
      void snapTick.value
      const me = world.me
      const u = world.ents.get(me.unit ?? 0)?.s
      const now = performance.now()
      const r = watch.update({ unit: u ? (me.unit ?? 0) : 0, hp: u?.hp ?? 0, mhp: u?.mhp ?? 0, alive: me.alive !== false }, now)
      if (!r) return
      // 「減少動態效果」：不閃，只提示
      if (r.flash && !reducedMotion()) setHitFlash((n) => n + 1)
      if (r.notice) localNotice.value = { text: 'r3b.hit.notice', at: now }
    })
    return () => {
      stop()
      const i = cmdTaps.indexOf(tap)
      if (i >= 0) cmdTaps.splice(i, 1)
    }
  }, [])
  // 暈影播完就拿掉
  useEffect(() => {
    if (!hitFlash) return
    const h = setTimeout(() => setHitFlash(0), 900)
    return () => clearTimeout(h)
  }, [hitFlash])
  useEffect(() => {
    if (!items.length) return
    const h = setInterval(() => {
      const now = performance.now()
      setItems((xs) => (xs.some((x) => x.until <= now) ? xs.filter((x) => x.until > now) : xs))
    }, 250)
    return () => clearInterval(h)
  }, [items.length])
  // 整疊有最大高度（CSS：底部停在聊天紀錄最高能長到的位置之上）；放不下時從最舊的公告開始藏，至少留最新一則
  const bigAll = items.filter((x) => x.kind === 'event' || x.kind === 'apoc' || x.kind === 'sys').slice(-3)
  const bigKey = bigAll.map((x) => x.id).join(',')
  const drop = fit.key === bigKey ? fit.drop : 0
  useLayoutEffect(() => {
    const el = stack.current
    if (!el || !bigAll.length) return
    // 可用高度：整疊的最大高度（CSS 依聊天紀錄算好）減掉上方插槽（瞄準提示、投票）
    const slots = el.firstElementChild as HTMLElement | null
    const room = parseFloat(getComputedStyle(el).maxHeight) - (slots?.offsetHeight ?? 0)
    // 空間變大（瞄準提示收起、聊天輸入框關掉）：藏起來的公告重新試著放回來
    if (drop > 0 && room > fit.room + 1) setFit({ key: bigKey, drop: 0, room })
    else if (drop < bigAll.length - 1 && el.scrollHeight > el.clientHeight + 1) setFit({ key: bigKey, drop: drop + 1, room })
  })
  if (screen.value !== 'game') return null
  const big = bigAll.slice(drop)
  const small = items.filter((x) => x.kind === 'ok' || x.kind === 'err').slice(-3)
  return (
    <>
      {hitFlash > 0 && <div key={hitFlash} class="hit-vignette" data-testid="hit-vignette" aria-hidden="true" />}
      <div class="top-stack" ref={stack}>
        <div class="top-slots" ref={setTopSlots} />
        {big.length > 0 && (
          <div class="announce" data-testid="announce">
            {big.map((x) => (
              <div key={x.id} class={'announce-line ' + x.kind} style={{ '--life': `${x.life}ms` }}>
                {/* 標籤下方的小字「詳見聊天」：不佔文字的寬度 */}
                <span class="announce-side">
                  <span class="announce-tag">{t(x.kind === 'apoc' ? 'announce.apoc' : x.kind === 'event' ? 'announce.event' : 'announce.sys')}</span>
                  {x.more && <span class="announce-more">{t('f7.announce.more')}</span>}
                </span>
                <span class="announce-text">
                  {x.text}
                  {(x.count ?? 1) > 1 && <span class="dup-count"> ×{x.count}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {small.length > 0 && (
        <div class="action-toast" data-testid="action-toast">
          {small.map((x) => (
            <div key={x.id} class={'toast-line ' + x.kind} style={{ '--life': `${x.life}ms` }}>
              <span class="toast-text">
                {x.text}
                {(x.count ?? 1) > 1 && <span class="dup-count"> ×{x.count}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** 一條等待進度條（剩餘秒數本地平滑倒數）*/
function TimerBar({ label, left, total, tone, id, warn }: { label: string; left: number; total: number; tone: 'cast' | 'evolve' | 'launch'; id: string; warn?: string }) {
  const sm = useCountdown(left)
  const k = total > 0 ? Math.max(0, Math.min(1, 1 - sm / total)) : 0
  return (
    <div class={'castbar ' + tone} data-testid={id}>
      <div class="castbar-label">
        {label}
        {sm > 0 && <span class="mono"> {fmtSecs(sm)}s</span>}
      </div>
      <div class="castbar-track">
        <i style={{ transform: `scaleX(${k})` }} />
      </div>
      {warn && (
        <div class="castbar-warn" data-testid={id + '-warn'}>
          {warn}
        </div>
      )}
    </div>
  )
}

/**
 * 自己正在等的東西，一律在 HUD 上方中央顯示倒數：
 * 詠唱／引導（私有狀態 me.cast，被打斷就消失）、進化（me.evolving）、船艇發射（me.launchIn）。
 */
export function CastBar() {
  void snapTick.value
  const me = world.me
  // 進化的總長：第一次看到的剩餘秒數
  const evoTotal = useRef(0)
  if ((me.evolving ?? 0) > evoTotal.current) evoTotal.current = me.evolving ?? 0
  if (!me.evolving) evoTotal.current = 0
  if (screen.value !== 'game') return null
  const c = me.cast
  const ab = c ? abilityDef(c[0]) : undefined
  const castTotal = ab?.cast ?? 0
  // 變身（褪皮、披皮、千面…）被看到就曝光：視野裡有其他人形單位時警告（exposure.ts）
  const watchers = c && EXPOSING_ABILITIES.has(c[0]) ? watcherCount(world) : 0
  return (
    <div class="timerbars">
      {c && <TimerBar id="castbar" tone="cast" label={`${t('cast.casting')} ${loc(ab?.name)}`} left={castTotal * (1 - Math.max(0, Math.min(1, c[1])))} total={castTotal} warn={watchers > 0 ? t('r3b.expose.cast', { n: watchers }) : undefined} />}
      {(me.evolving ?? 0) > 0 && <TimerBar id="evobar" tone="evolve" label={t('wait.evolving')} left={me.evolving ?? 0} total={evoTotal.current} />}
      {(me.launchIn ?? 0) > 0 && <TimerBar id="launchbar" tone="launch" label={t('wait.launch')} left={me.launchIn ?? 0} total={10} />}
    </div>
  )
}
