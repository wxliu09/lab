import type { LayoutSpec } from '../../layout'
import type { Loc, StationSpace } from '../types'

export interface StationDef {
  id: string
  name: Loc
  /** render 主題（色調、材質、燈光；美術聖經 §3.3）*/
  theme: string
  layout: LayoutSpec
  space: StationSpace
  /** 開局停在停機坪上的船：pad = layout 中第幾個 P（列優先順序）*/
  docked?: { ship: string; pad: number }[]
  /** 危險區每秒傷害 */
  hazardDps?: number
  /** 'core' = 永遠啟用；'auto' = 依人數／設定；'event' = 只在事件發生時出現（未識別物體、海盜船）*/
  enable: 'core' | 'auto' | 'event' | 'event'
  /** 被站內掃描所需秒數（Lifeform Scan）*/
  scanTime?: number
  /** 逃生艙落點（layout 的 POI key）*/
  podLanding?: string
  /** 是否可停靠（否則需 Board）*/
  dockable?: boolean
  /** 場景天氣（雨、暴風雪…）*/
  weather?: string
  /** 地表（行星、衛星）：非站體，室外 */
  outdoor?: boolean
  /**
   * 站內主控台（研究 03 §1.2；原作各站控制台 HP 不同）：沒寫就是 struct.console 的 11000。
   * hp／regen 覆寫數值（每秒回復）；invuln 無敵；def 換成別的定義、hostile 屬敵方（海盜船主控台：不可駕駛、打爆後自爆）
   */
  console?: { hp?: number; regen?: number; invuln?: boolean; def?: string; hostile?: boolean }
}
