// 第 7 輪（視聽與手感）：受擊反應的純邏輯——HP 下降偵測、閃光／後座／頓幀的時間包絡、特效與 HP 兩條路徑合併、變身彈出曲線
import { describe, expect, it } from 'vitest'
import { HIT, hitExpect, hitStep, hitStop, hitTrigger, hpFlash, hpHit, newHit, newPose, popScale } from '../../src/render/fx/hitReact'

/** 以 1/60 秒逐幀推進，回傳每幀的姿勢快照 */
function run(h: ReturnType<typeof newHit>, secs: number, dt = 1 / 60) {
  const out: ReturnType<typeof newPose>[] = []
  for (let t = 0; t < secs - 1e-9; t += dt) out.push({ ...hitStep(h, dt, newPose()) })
  return out
}

describe('hpHit：快照之間的 HP 下降', () => {
  it('掉血回傳佔最大生命的比例', () => {
    expect(hpHit(100, 100, 80, 100)).toBeCloseTo(0.2)
    expect(hpHit(600, 600, 595, 600)).toBeCloseTo(5 / 600)
  })
  it('第一次看到（沒有前一份）不算', () => {
    expect(hpHit(undefined, undefined, 50, 100)).toBe(0)
    expect(hpHit(100, undefined, 50, 100)).toBe(0)
  })
  it('回血、沒變不算', () => {
    expect(hpHit(50, 100, 60, 100)).toBe(0)
    expect(hpHit(50, 100, 50, 100)).toBe(0)
  })
  it('最大生命改變（穿脫防護服、變身）不算受擊', () => {
    expect(hpHit(100, 100, 300, 600)).toBe(0)
    expect(hpHit(600, 600, 100, 100)).toBe(0)
  })
  it('小於千分之四（且小於 1 點）的跳動不算', () => {
    expect(hpHit(1000, 1000, 999.5, 1000)).toBe(0)
    expect(hpHit(10000, 10000, 9970, 10000)).toBe(0)
    expect(hpHit(10000, 10000, 9950, 10000)).toBeGreaterThan(0)
  })
  it('比例上限 1；重擊偏紅、強度隨傷害變大', () => {
    expect(hpHit(100, 100, -50, 100)).toBe(1)
    expect(hpFlash(0.02).red).toBe(false)
    expect(hpFlash(0.2).red).toBe(true)
    expect(hpFlash(0.2).k).toBeGreaterThan(hpFlash(0.02).k)
    expect(hpFlash(1).k).toBeLessThanOrEqual(1)
  })
})

describe('受擊包絡', () => {
  it('閃光 60–80 ms 內收掉，強度一開始最大', () => {
    const h = newHit()
    expect(hitTrigger(h, 0, { k: 1 })).toBe(true)
    const f = run(h, 0.2, 0.005)
    const lit = f.filter((p) => p.flash > 0).length * 0.005
    expect(lit).toBeGreaterThanOrEqual(0.06)
    expect(lit).toBeLessThanOrEqual(0.08)
    expect(f[0].flash).toBeGreaterThan(f[5].flash)
  })
  it('有方向：後座約 0.1 m、壓扁到 0.97、往反方向倒，最後回到原位', () => {
    const h = newHit()
    hitTrigger(h, 0, { dx: 3, dy: 4, k: 1 })
    const f = run(h, 0.4, 0.001)
    const peak = f.reduce((a, p) => (p.push > a.push ? p : a))
    expect(peak.push).toBeCloseTo(HIT.push, 2)
    expect(Math.min(...f.map((p) => p.squash))).toBeCloseTo(HIT.squash, 3)
    expect(peak.dx).toBeCloseTo(0.6)
    expect(peak.dy).toBeCloseTo(0.8)
    expect(peak.lean).toBeGreaterThan(0)
    const end = f[f.length - 1]
    expect(end.push).toBe(0)
    expect(end.squash).toBe(1)
    expect(end.active).toBe(false)
  })
  it('沒有方向（HP 下降）：只閃與壓扁，不位移、不後仰', () => {
    const h = newHit()
    hitTrigger(h, 0, { fromHp: true, k: 0.5 })
    const f = run(h, 0.2)
    expect(Math.max(...f.map((p) => p.push))).toBeGreaterThan(0)
    expect(f.every((p) => p.dx === 0 && p.dy === 0 && p.lean === 0)).toBe(true)
    expect(Math.min(...f.map((p) => p.squash))).toBeLessThan(1)
  })
  it('近戰頓幀 40–60 ms：動畫時間倍率接近 0，之後恢復', () => {
    const h = newHit()
    hitTrigger(h, 0, { k: 1, stop: true })
    const f = run(h, 0.15, 0.005)
    const stopped = f.filter((p) => p.timeScale < 0.1).length * 0.005
    expect(stopped).toBeGreaterThanOrEqual(0.04)
    expect(stopped).toBeLessThanOrEqual(0.06)
    expect(f[f.length - 1].timeScale).toBe(1)
    // 攻擊者只頓幀、不閃
    const a = newHit()
    hitStop(a)
    const g = run(a, 0.1, 0.005)
    expect(g[0].timeScale).toBeLessThan(0.1)
    expect(g.every((p) => p.flash === 0)).toBe(true)
  })
  it('0.12 秒內的第二次觸發併入前一次（不會連閃兩次）', () => {
    const h = newHit()
    expect(hitTrigger(h, 0, { k: 0.5 })).toBe(true)
    expect(hitTrigger(h, 0.05, { k: 0.9 })).toBe(false)
    expect(h.flashK).toBe(0.9)
    expect(hitTrigger(h, 0.2, { k: 0.5 })).toBe(true)
  })
  it('先到的 HP 下降沒方向、後到的特效補上後座方向', () => {
    const h = newHit()
    hitTrigger(h, 0, { fromHp: true, k: 0.4 })
    expect(h.dx).toBe(0)
    hitTrigger(h, 0.03, { dx: 1, dy: 0, k: 0.6 })
    expect(h.dx).toBe(1)
    expect(h.recT).toBe(HIT.recoil)
  })
  it('近戰預告期間的 HP 下降不先閃，強度留給命中那一下', () => {
    const h = newHit()
    hitExpect(h, 0, 0.25)
    expect(hitTrigger(h, 0.02, { fromHp: true, k: 0.9, red: true })).toBe(false)
    expect(h.flashT).toBe(0)
    // 命中（特效）：開始閃，併入剛才的強度與紅色
    expect(hitTrigger(h, 0.07, { dx: 1, dy: 1, k: 0.6 })).toBe(true)
    expect(h.flashK).toBe(0.9)
    expect(h.red).toBe(true)
    // 預告過了之後的 HP 下降照常觸發
    expect(hitTrigger(h, 0.5, { fromHp: true, k: 0.4 })).toBe(true)
  })
})

describe('低幀率', () => {
  it('一幀 0.2 秒也至少畫到一幀閃光與頓幀', () => {
    const h = newHit()
    hitTrigger(h, 0, { k: 1, dx: 1, dy: 0, stop: true })
    const p = hitStep(h, 0.2, newPose())
    expect(p.flash).toBeGreaterThan(0.5)
    expect(p.timeScale).toBeLessThan(0.1)
    expect(p.push).toBeGreaterThan(0)
    // 第二幀：閃光已過、頓幀剩下的一小段按比例放慢；第三幀完全恢復
    const q = hitStep(h, 0.2, newPose())
    expect(q.flash).toBe(0)
    expect(q.timeScale).toBeGreaterThan(0.8)
    expect(hitStep(h, 0.2, newPose()).timeScale).toBe(1)
  })
})

describe('變身彈出曲線', () => {
  it('0.7 → 約 1.05 → 1', () => {
    expect(popScale(0)).toBeCloseTo(0.7)
    expect(popScale(-1)).toBeCloseTo(0.7)
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => popScale(i / 100)))
    expect(peak).toBeGreaterThan(1.04)
    expect(peak).toBeLessThanOrEqual(1.05 + 1e-9)
    expect(popScale(1)).toBe(1)
    expect(popScale(2)).toBe(1)
  })
})
