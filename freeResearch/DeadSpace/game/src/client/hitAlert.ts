// 被攻擊警示：自己主單位的生命在一份快照之間掉了一大截（被打、被炸），畫面邊緣紅色暈影閃一下，並提示「你正受到攻擊」。
// 只看自己的生命，不顯示方向：攻擊者可能是隱形的，指出方向等於洩漏位置。
// 排除正常變化：換了主單位（變身、進化、結繭）、生命上限改變（穿脫防護服、變形）、持續傷害（寄生、輻射、酸液每份快照只掉 1～2 點）、
// 自己技能的代價（警衛裝的生命轉移、十秒迴圈回到過去的生命）。
import type { Command } from '../shared/protocol/messages'

/** 一份快照之間至少掉這麼多（點）才算被打；持續傷害每份快照（20 Hz）最多約 2 點 */
export const HIT_MIN = 8
/** 或者生命上限的這個比例（大塊頭的單位，小抓傷不用大驚小怪）*/
export const HIT_MIN_FRAC = 0.025
/** 文字提示的最短間隔（毫秒）：持續被打時不要每一下都跳 */
export const HIT_NOTICE_MS = 6000
/** 暈影的最短間隔（毫秒）*/
export const HIT_FLASH_MS = 350
/** 會扣自己生命當代價、或把生命改回過去的技能：放完之後這段時間（毫秒）內的下降不算被打 */
export const SELF_HP_ABILITIES: ReadonlySet<string> = new Set(['ab.guard.transfer', 'ab.chrono.loop'])
const SELF_HP_GRACE_MS = 1200

export interface HitSample {
  /** 自己的主單位 id（0 = 沒有）*/
  unit: number
  hp: number
  mhp: number
  /** 還活著（死了就不提示）*/
  alive: boolean
}

/** 這次要做什麼：flash = 閃暈影、notice = 跳文字提示（各自有節流）*/
export interface HitResult {
  dmg: number
  flash: boolean
  notice: boolean
}

export class HitWatch {
  private unit = 0
  private hp = 0
  private mhp = 0
  private lastFlash = -1e9
  private lastNotice = -1e9
  private selfCostUntil = -1e9

  /** 自己送出的指令：放了會扣自己生命的技能，接下來一小段時間的下降不算被打 */
  command(c: Command, now: number): void {
    if (c.k === 'cast' && c.a && SELF_HP_ABILITIES.has(c.a)) this.selfCostUntil = now + SELF_HP_GRACE_MS
  }

  /** 每份快照呼叫一次；回傳 null = 沒有被打 */
  update(s: HitSample, now: number): HitResult | null {
    const prev = { unit: this.unit, hp: this.hp, mhp: this.mhp }
    this.unit = s.unit
    this.hp = s.hp
    this.mhp = s.mhp
    // 換了主單位、生命上限變了、剛開始：重新起算
    if (!s.unit || s.unit !== prev.unit || s.mhp !== prev.mhp || prev.mhp <= 0) return null
    const dmg = prev.hp - s.hp
    if (dmg < Math.max(HIT_MIN, s.mhp * HIT_MIN_FRAC)) return null
    if (!s.alive || s.hp <= 0 || now < this.selfCostUntil) return null
    const flash = now - this.lastFlash >= HIT_FLASH_MS
    const notice = now - this.lastNotice >= HIT_NOTICE_MS
    if (flash) this.lastFlash = now
    if (notice) this.lastNotice = now
    return { dmg, flash, notice }
  }
}

/** 使用者有沒有要求減少動態（作業系統的「減少動態效果」）*/
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
