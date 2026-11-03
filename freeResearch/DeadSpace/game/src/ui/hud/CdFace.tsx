// 冷卻／等待的顯示：圖示變灰、順時針扇形遮罩、剩餘秒數倒數；冷卻結束時閃一下。
// sim 的冷卻值隨快照更新（四捨五入到 0.1 秒），這裡依「收到這個值的時間」在本地平滑倒數，畫面才不會一格一格跳。
import { useEffect, useRef, useState } from 'preact/hooks'

/** 本地平滑倒數：回傳目前剩餘秒數（快照之間用經過的時間扣掉）*/
export function useCountdown(cd: number): number {
  const ref = useRef({ cd, at: performance.now() })
  if (cd !== ref.current.cd) ref.current = { cd, at: performance.now() }
  const [, tick] = useState(0)
  useEffect(() => {
    if (cd <= 0) return
    // 約 20 fps 重畫就夠順，不必每幀
    const h = setInterval(() => tick((x) => x + 1), 50)
    return () => clearInterval(h)
  }, [cd > 0])
  return Math.max(0, ref.current.cd - (performance.now() - ref.current.at) / 1000)
}

/** 秒數格式：10 秒以上取整數、以下一位小數 */
export function fmtSecs(s: number): string {
  return s >= 10 ? String(Math.ceil(s)) : s.toFixed(1)
}

/**
 * 疊在指令卡／背包格子上的冷卻面板。
 * total = 這次冷卻的總長（決定扇形比例）；不知道時傳 0，會用這次看過的最大值。
 */
export function CdFace({ cd, total }: { cd: number; total: number }) {
  const left = useCountdown(cd)
  const peak = useRef(0)
  if (cd > peak.current) peak.current = cd
  const wasCooling = useRef(false)
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    if (left > 0) wasCooling.current = true
    else if (wasCooling.current) {
      wasCooling.current = false
      peak.current = 0
      setFlash(performance.now())
    }
  })
  useEffect(() => {
    if (!flash) return
    const h = setTimeout(() => setFlash(0), 650)
    return () => clearTimeout(h)
  }, [flash])
  if (left <= 0) return flash ? <div class="cd-ready" /> : null
  const k = Math.min(1, left / Math.max(0.1, total || peak.current, peak.current))
  return (
    <>
      <div class="cd-sweep" style={{ '--k': k.toFixed(3) }} />
      <span class="cd-num">{fmtSecs(left)}</span>
    </>
  )
}
