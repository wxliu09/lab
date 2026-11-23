// 小地圖信號（致敬原作：Alt＋點小地圖，全員看得到）：送出、收到後的顯示。
// 送出：Alt＋左鍵小地圖（Hud.tsx Minimap）或場景地面（input.ts），z = 畫面目前顯示的 zone；本機先節流（pingBoard.ts）。
// 收到：主機轉來的信號（活人的只給活人、死者的只給死者）→ 小地圖閃圈（Minimap 每幀畫 pingBoard.active）、
// 場景地面畫圈（pingTaps，由 Minimap 掛上 render/pingFx.ts）、提示音、聊天紀錄加一行本機訊息（不經網路）。
// 被本機封鎖的人（mute.ts）發的信號整個不顯示。
import type { ChatLine, FxEvent } from '../shared/protocol/messages'
import { PLAYER_COLORS } from '../shared/constants'
import { fm, playSynth, tone } from '../audio/sfx'
import { chatLog, mySlot, onHost, send, startInfo, world } from './session'
import { altClick, localNotice } from './input'
import { PING_LIFE_MS, PingBoard, type MapPing } from './pingBoard'

export const pingBoard = new PingBoard()
/** 有信號要顯示（含自己送出的那一筆）：場景地面的圈由 Minimap 掛上（它手上有場景）*/
export const pingTaps: ((p: MapPing) => void)[] = []
/** 聊天紀錄裡的信號行 → 發送者與地點（Chat 用來把名字上色、寫出是哪一站）*/
export const pingLines = new WeakMap<ChatLine, { name: string; color: number; z: number }>()

/** 信號的顯示顏色（玩家色；沒有玩家色時用介面青）*/
export function pingColor(color: number): string {
  return (color >= 0 ? PLAYER_COLORS[color]?.hex : undefined) ?? '#9fe7ff'
}

/** 自己目前的顯示顏色（別人看到的那個：操控中的單位的玩家色；查不到就用大廳選的顏色）*/
function myColor(): number {
  const s = world.ents.get(world.me.control || world.me.unit || 0)?.s
  if (s && s.c !== undefined) return s.c
  return startInfo.value?.players.find((p) => p.slot === mySlot.value)?.color ?? -1
}

let slowAt = -1e9
const r2 = (v: number) => Math.round(v * 100) / 100
/** 太空層的範圍（同 sim/world.ts 的 SPACE_HALF；主機會丟掉範圍外的信號）*/
const SPACE_PING_HALF = 49

/**
 * 信號座標夾進主機接受的範圍（主機丟掉範圍外的信號，本機先顯示的那一筆就變成只有自己看得到）：
 * 太空層 ±SPACE_PING_HALF；站內 = 版面範圍（bounds = 版面寬高，不知道就不夾）
 */
export function clampPing(z: number, x: number, y: number, bounds: { w: number; h: number } | null | undefined): { x: number; y: number } {
  const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  if (z === 0) return { x: c(x, -SPACE_PING_HALF, SPACE_PING_HALF), y: c(y, -SPACE_PING_HALF, SPACE_PING_HALF) }
  if (!bounds) return { x, y }
  return { x: c(x, 0, bounds.w), y: c(y, 0, bounds.h) }
}

/**
 * Alt＋左鍵：在 zone z 的 (x, y) 發信號（bounds = 站內版面的寬高）。太頻繁就提示稍等、不送。回傳是否送出了。
 * 主機不會轉回給自己：自己的這一筆本機先顯示（不加聊天紀錄）
 */
export function sendMapPing(z: number, x: number, y: number, bounds?: { w: number; h: number } | null, now = performance.now()): boolean {
  // 出局者（死亡即退出）不能和任何人溝通，主機也不會轉送
  if (world.me.booted) return false
  const at = clampPing(z, x, y, bounds)
  const p = pingBoard.local(z, r2(at.x), r2(at.y), myColor(), now)
  if (!p) {
    if (now - slowAt > 1500) {
      slowAt = now
      localNotice.value = { text: 'r4c.ping.slow', at: now }
    }
    return false
  }
  send({ t: 'mapPing', z, x: p.x, y: p.y })
  show(p)
  return true
}

/** 收到主機轉來的信號 */
export function receivePing(m: { z: number; x: number; y: number; name: string; color: number }, now = performance.now()): void {
  const p = pingBoard.receive(m, now)
  if (!p) return
  // 本機訊息：不經 receiveChat（不跳公告、不播聊天音效，提示音下面另外播）。text 給沒有特別處理的地方（大廳聊天）照樣讀得懂
  const line: ChatLine = {
    from: '',
    color: m.color,
    ch: 'sys',
    // 被禁言（Mute-ilate）的人發的信號主機不給名字：寫 ???（同聊天）
    text: '@r4c.ping.chat|name=' + (m.name.replace(/\|/g, ' ') || '???'),
    time: world.serverTime,
  }
  pingLines.set(line, { name: m.name, color: m.color, z: m.z })
  chatLog.value = [...chatLog.value, line].slice(-200)
  show(p)
}

function show(p: MapPing): void {
  pingSound()
  for (const tap of pingTaps) tap(p)
}

/** 信號提示音：短促的雷達「嗶—嗶」（介面音軌，不做空間定位；連點時 0.25 秒內只響一次）*/
function pingSound(): void {
  playSynth(
    'mapPing',
    undefined,
    undefined,
    3,
    (d, now) => {
      tone(d, now, 0.09, 1975.5, 1975.5, 'sine', 0.07)
      tone(d, now, 0.12, 987.8, 987.8, 'triangle', 0.035)
      fm(d, now + 0.14, 0.42, 1480, 2, 0.5, 0.05)
      // 很淡的回音
      tone(d, now + 0.32, 0.3, 1480, 1470, 'sine', 0.015)
    },
    0.25,
    'ui',
  )
}

// ───────── 抽血集合（第 8 輪）─────────

/** 集合期間小地圖每隔多久再閃一次（ms）：一個信號只亮 4 秒，集合有 60 秒 */
export const RALLY_PULSE_MS = 10000
let rallyTimer: ReturnType<typeof setInterval> | null = null

/**
 * 抽血集合（規則：sim/scripts/git.ts gitRally，對地面使用基因檢測器）：主機對活著的人送 ping 特效（s = 'rally'，v = 集合秒數）。
 * 特效本身只在那一區的場景畫圈、響一聲；這裡把集合點加進小地圖的信號（同一區時看得到），集合期間每 RALLY_PULSE_MS 再閃一次。
 * 不加聊天紀錄、不另外響（主機已經送了一行公告，特效也響過了）。回傳是不是集合信號
 */
export function onRallyFx(f: FxEvent, now = performance.now()): boolean {
  if (f.k !== 'ping' || f.s !== 'rally') return false
  const until = now + Math.max(1, Math.min(120, f.v ?? 60)) * 1000
  const mark = (t: number) => pingBoard.receive({ z: f.z, x: f.x, y: f.y, name: '', color: -1 }, t)
  mark(now)
  if (rallyTimer) clearInterval(rallyTimer)
  rallyTimer = null
  if (typeof setInterval !== 'function') return true
  rallyTimer = setInterval(() => {
    const t = performance.now()
    // 閃完這一次就過了集合時間：不再閃
    if (t + PING_LIFE_MS > until) {
      if (rallyTimer) clearInterval(rallyTimer)
      rallyTimer = null
      return
    }
    mark(t)
  }, RALLY_PULSE_MS)
  return true
}

onHost((m) => {
  if (m.t === 'mapPing') receivePing(m)
})
// 特效（快照帶來的）：抽血集合。測試替 session 換上的假模組可能沒有 world，接不上就算了
try {
  world.fxTaps.push((f) => void onRallyFx(f))
} catch {
  /* ignore */
}
// 場景裡 Alt＋左鍵點地面（input.ts）
altClick.ping = (z, x, y, bounds) => sendMapPing(z, x, y, bounds)
