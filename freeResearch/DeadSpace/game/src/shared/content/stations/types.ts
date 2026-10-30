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
  /** 'core' = 永遠啟用；'auto' = 依人數／設定 */
  enable: 'core' | 'auto'
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
}
