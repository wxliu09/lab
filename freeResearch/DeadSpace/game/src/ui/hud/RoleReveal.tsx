// 開局角色揭露：全螢幕、陣營色、背景故事打字機效果（美術聖經 §12）
import { useEffect, useState } from 'preact/hooks'
import { snapTick, world } from '../../client/session'
import { BIOS, OBJECTIVES, ROLE_TITLES, type Identity } from '../strings/bios'
import { lang, t } from '../i18n'
import { sfx } from '../../audio/sfx'

const COL: Record<Identity, [string, string]> = {
  human: ['#9fe7ff', '#ffffff'],
  xeno: ['#7a3cff', '#33ffd1'],
  mutant: ['#c8323c', '#e8b04a'],
  android: ['#ffb000', '#e6e6e6'],
}

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
  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') setOpen(false)
    }
    window.addEventListener('keydown', close)
    const auto = setTimeout(() => setOpen(false), 30000)
    return () => {
      window.removeEventListener('keydown', close)
      clearTimeout(auto)
    }
  }, [open])
  if (!open || !role || role === 'spectator') return null
  const [c1, c2] = COL[role]
  const title = ROLE_TITLES[role]
  const obj = OBJECTIVES[role]
  const L = lang.value === 'en' ? 'en' : 'zh'
  return (
    <div class="modal-back" data-testid="reveal" style={{ background: `radial-gradient(ellipse at 50% 40%, ${c1}22, rgba(0,0,0,0.92) 70%)` }} onClick={() => setOpen(false)}>
      <div style={{ width: 'min(760px, 92vw)', textAlign: 'center' }}>
        <div class="dim" style={{ letterSpacing: '0.4em', fontFamily: 'var(--title)' }}>
          {t('class.' + (world.me.classId ?? ''))}
        </div>
        <div style={{ fontFamily: 'var(--title)', fontWeight: 700, fontSize: '54px', letterSpacing: '0.12em', color: c1, textShadow: `0 0 30px ${c1}, 0 0 4px ${c2}`, margin: '6px 0' }}>
          {title[L]}
        </div>
        <div style={{ color: c2, opacity: 0.85, marginBottom: '22px' }}>{title.tagline[L]}</div>
        <div class="panel" style={{ padding: '18px 22px', textAlign: 'left', lineHeight: 1.85, fontSize: '15px', minHeight: '140px' }}>
          {text.slice(0, n)}
          <span style={{ opacity: n < text.length ? 1 : 0, color: c1 }}>▌</span>
        </div>
        <div class="panel" style={{ padding: '14px 22px', textAlign: 'left', marginTop: '12px' }}>
          {obj[L].map((o, i) => (
            <div key={i} style={{ padding: '3px 0', color: i === 0 ? c1 : undefined }}>
              › {o}
            </div>
          ))}
        </div>
        <div class="dim" style={{ marginTop: '14px', fontSize: '12px' }}>
          {t('reveal.dismiss')}
        </div>
      </div>
    </div>
  )
}
