// 程式放置的雜物箱（sim 開局補放的 struct.rummage，不在版面的 POI 格上）的戰爭迷霧記憶。
// 這些箱子是一般實體：離開視野就從快照與 client 消失；版面上烘焙的家具（含 rummageBox）卻會留在記憶裡，
// 結果已探索的房間裡箱子不見、走近才冒出來。這裡記住最後看到的箱子（位置、朝向；外觀依 id 決定），
// 離開視野後由 gameScene 畫成記憶中的模型（材質一樣經過迷霧 shader，套記憶色）；只有那一格「看得到」而實體不在
// 持續 GONE_AFTER 秒才忘掉（和 poiState.ts 同一套視野規則：sim 的半徑＋nav.los）。
// 不改 sim 的可見性：記憶裡只有快照曾經送來的箱子，視野外被打破的箱子要等看到那一格才會消失（不洩漏視野外發生的事）。
// 純邏輯、不碰 three，單元測試直接驗。
import { GONE_AFTER } from './poiState'

/** 這一幀快照裡看得到的一個箱子 */
export interface CrateSeen {
  x: number
  y: number
  /** 朝向（弧度，同 CEnt.f）*/
  f: number
}

interface Rec extends CrateSeen {
  /** 開始「看得到那一格卻不在」的時間（-1 = 沒有）*/
  missSince: number
  /** 要不要畫成記憶模型（不在快照裡、而且那一格看不到）*/
  ghost: boolean
}

export class CrateMemory {
  private mem = new Map<number, Rec>()

  /**
   * 每幀呼叫（在 units.sync 之後）。present = 這一幀快照裡看得到的箱子（id → 位置）；
   * visibleAt(x, y) = 那一點現在看不看得到（sim 的視野規則）；full = 整個 zone 都看得到（死者、旁觀者）。
   * 看得到那一格、實體卻不在：馬上不畫（在眼前被翻開或打破的箱子不會多留一下），持續 GONE_AFTER 秒才忘掉
   * （短暫的視野誤差不會把記憶清掉，離開視野又會畫回來）。
   */
  update(now: number, present: ReadonlyMap<number, CrateSeen>, visibleAt: (x: number, y: number) => boolean, full = false): void {
    for (const [id, s] of present) {
      const r = this.mem.get(id)
      if (r) {
        r.x = s.x
        r.y = s.y
        r.f = s.f
        r.missSince = -1
        r.ghost = false
      } else this.mem.set(id, { x: s.x, y: s.y, f: s.f, missSince: -1, ghost: false })
    }
    for (const [id, r] of this.mem) {
      if (present.has(id)) continue
      if (full || visibleAt(r.x, r.y)) {
        r.ghost = false
        if (r.missSince < 0) r.missSince = now
        if (now - r.missSince >= GONE_AFTER) this.mem.delete(id)
      } else {
        r.missSince = -1
        r.ghost = true
      }
    }
  }

  /** 這個箱子現在要不要畫成記憶模型 */
  isGhost(id: number): boolean {
    return this.mem.get(id)?.ghost ?? false
  }

  /** 要畫成記憶模型的箱子 */
  *ghosts(): IterableIterator<[number, CrateSeen]> {
    for (const [id, r] of this.mem) if (r.ghost) yield [id, r]
  }

  /** 記憶中的箱子（含目前看得到的；測試與除錯用）*/
  known(): number[] {
    return [...this.mem.keys()]
  }
}
