// 隨機事件用到的 buff（政府強化劑五選一：研究 03 §6.2 #8）
import { regBuffs } from './registry'
import type { Loc } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })

regBuffs([
  { id: 'bf.enh.speed', name: L('強化：移動', 'Enhanced: Mobility'), icon: 'speed', vis: 'self', good: true, moveAdd: 0.3 },
  { id: 'bf.enh.atk', name: L('強化：攻速', 'Enhanced: Reflexes'), icon: 'gun', vis: 'self', good: true, atkSpeed: 1.1 },
  { id: 'bf.androidOff', name: L('停機', 'Shut Down'), icon: 'gear', vis: 'all', good: false, stun: true },
  { id: 'bf.enh.range', name: L('強化：射程', 'Enhanced: Optics'), icon: 'eye', vis: 'self', good: true, rangeAdd: 1.25 },
])
