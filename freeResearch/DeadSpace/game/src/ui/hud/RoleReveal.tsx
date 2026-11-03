// 開局角色揭露：全螢幕、陣營色、背景故事打字機效果（美術聖經 §12）
import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { snapTick, world } from '../../client/session'
import { BIOS, OBJECTIVES, ROLE_TITLES, type Identity } from '../strings/bios'
import { lang, t } from '../i18n'
import { sfx } from '../../audio/sfx'
import { modalChecks } from '../../client/input'
import { phdText } from './Guide'

// [主色（光暈）, 輔色, 文字色]：異形、變種人的主色在深色底上對比不到 4.5:1，文字改用亮色
const COL: Record<Identity, [string, string, string]> = {
  human: ['#9fe7ff', '#ffffff', '#9fe7ff'],
  xeno: ['#7a3cff', '#33ffd1', '#b28cff'],
  mutant: ['#c8323c', '#e8b04a', '#ff6b72'],
  android: ['#ffb000', '#e6e6e6', '#ffb000'],
}

/** 揭露畫面蓋著時，遊戲快捷鍵不處理 */
let revealShown = false
modalChecks.push(() => revealShown)

export function RoleReveal() {
  void snapTick.value
  const [shown, setShown] = useState(false)
  const [open, setOpen] = useState(true)
  const [n, setN] = useState(0)
  const role = world.me.role as Identity | 'spectator' | undefined
  const bio = world.me.bio ? BIOS[world.me.bio] : undefined
  const text = bio ? (lang.value === 'en' ? bio.en : bio.zh) : ''
  useEffect(() => {
    if (!role || shown) return
    setShown(true)
    sfx('ui')
  }, [role])
  useEffect(() => {
    if (!open || !text) return
    if (n >= text.length) return
    const h = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 28)
    return () => clearTimeout(h)
  }, [n, open, text])
  useLayoutEffect(() => {
    if (!open) return
    // capture 階段攔下：不然同一個 Esc／Enter 會再觸發遊戲快捷鍵（打開進化選單、聊天框）
    const close = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', close, true)
    // 30 秒自動關閉：只計算真的在畫面上的時間（每幀最多算 0.1 秒）。
    // 慢機器建場景時主執行緒會卡很久，用 setTimeout 會在玩家還沒看到時就關掉。
    let shownFor = 0
    let prev = performance.now()
    let raf = 0
    const step = (now: number) => {
      shownFor += Math.min(0.1, Math.max(0, (now - prev) / 1000))
      prev = now
      if (shownFor >= 30) return setOpen(false)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      window.removeEventListener('keydown', close, true)
      cancelAnimationFrame(raf)
    }
  }, [open])
  const visible = open && !!role && role !== 'spectator'
  useLayoutEffect(() => {
    revealShown = visible
    return () => {
      revealShown = false
    }
  }, [visible])
  if (!open || !role || role === 'spectator') return null
  const [c1, c2, ct] = COL[role]
  const title = ROLE_TITLES[role]
  const obj = OBJECTIVES[role]
  const L = lang.value === 'en' ? 'en' : 'zh'
  const phd = phdText(world.me, 'play1.reveal.phd')
  return (
    <div class="modal-back" data-testid="reveal" style={{ background: `radial-gradient(ellipse at 50% 40%, ${c1}22, rgba(0,0,0,0.92) 70%)` }} onClick={() => setOpen(false)}>
      <div style={{ width: 'min(760px, 92vw)', textAlign: 'center' }}>
        <div class="dim" style={{ letterSpacing: '0.4em', fontFamily: 'var(--title)' }}>
          {t('class.' + (world.me.classId ?? ''))}
        </div>
        <div style={{ fontFamily: 'var(--title)', fontWeight: 700, fontSize: '54px', letterSpacing: '0.12em', color: ct, textShadow: `0 0 30px ${c1}, 0 0 4px ${c2}`, margin: '6px 0' }}>
          {title[L]}
        </div>
        <div style={{ color: c2, opacity: 0.85, marginBottom: '22px' }}>{title.tagline[L]}</div>
        {/* 研究員：抽到的博士專長（只讀自己的私有狀態）*/}
        {phd && (
          <div data-testid="reveal-phd" style={{ color: c2, opacity: 0.85, margin: '-12px 0 18px', fontSize: '14px' }}>
            {phd}
          </div>
        )}
        <div class="panel solid" style={{ padding: '18px 22px', textAlign: 'left', lineHeight: 1.85, fontSize: '15px', minHeight: '140px' }}>
          {text.slice(0, n)}
          <span style={{ opacity: n < text.length ? 1 : 0, color: c1 }}>▌</span>
        </div>
        <div class="panel solid" style={{ padding: '14px 22px', textAlign: 'left', marginTop: '12px' }}>
          {obj[L].map((o, i) => (
            <div key={i} style={{ padding: '3px 0', color: i === 0 ? ct : undefined }}>
              › {o}
            </div>
          ))}
        </div>
        <div class="dim" style={{ marginTop: '14px', fontSize: '13px' }}>
          {t('reveal.dismiss')}
        </div>
      </div>
    </div>
  )
}
