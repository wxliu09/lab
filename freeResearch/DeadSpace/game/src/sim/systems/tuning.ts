// 除錯與調校指令的執行層（測試掛勾共用）
import type { Game } from '../game'

export interface TuneResult {
  ok: boolean
  msg: string
  data?: unknown
}

export class Tuning {
  constructor(readonly g: Game) {}

  /** 依玩家槽位執行（經過驗證的入口）*/
  run(_slot: number, _op: string, _args: unknown[]): TuneResult {
    return { ok: false, msg: 'unknown op' }
  }

  /** 測試掛勾入口（Playwright／Vitest）*/
  hook(op: string, args: unknown[]): unknown {
    const g = this.g
    switch (op) {
      case 'status':
        return {
          time: g.time,
          players: g.allPlayers().map((p) => ({ slot: p.slot, role: p.role, alive: p.alive, classId: p.classId })),
        }
      case 'skip': {
        const secs = Number(args[0]) || 0
        const n = Math.min(20 * 3600, Math.round(secs * 20))
        for (let i = 0; i < n; i++) g.stepOnce()
        return { time: g.time }
      }
      case 'role': {
        // 強制身分：role(slot, 'xeno' | 'mutant' | 'android' | 'human')
        const p = g.players[Number(args[0])]
        const r = String(args[1])
        if (!p || !['human', 'xeno', 'mutant', 'android'].includes(r)) return { error: 'bad args' }
        g.setRole(p, r as 'human' | 'xeno' | 'mutant' | 'android')
        return { ok: true }
      }
      default:
        return { error: 'unknown hook ' + op }
    }
  }
}
