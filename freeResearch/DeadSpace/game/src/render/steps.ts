// 可分段的工作：generator 每 yield 一次就是一個可以中斷的點（建站、程序化貼圖）。
// 同步呼叫時一路跑完；預建時由 GameScene 依空閒時間一小片一小片推進，主執行緒不會出現好幾秒的長任務。

/** 分段工作：yield 的值 'wait' = 在等非同步的事（shader 連結），這一輪先停；其他值 = 可以繼續 */
export type Steps<T = void> = Generator<void | 'wait', T, void>

/** 一口氣跑完（同步路徑）*/
export function runSteps<T>(it: Steps<T>): T {
  for (;;) {
    const r = it.next()
    if (r.done) return r.value
  }
}

/** 每一片處理的列數：一片約 n 個單位的工作（像素 × 八度數之類），至少 1 列 */
export function rowsPer(width: number, n = 8192): number {
  return Math.max(1, Math.floor(n / Math.max(1, width)))
}
