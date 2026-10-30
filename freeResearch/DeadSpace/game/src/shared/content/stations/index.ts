import { NYX } from './nyx'
import { ADJUDICATRIX } from './adjudicatrix'
import { TENSHU } from './tenshu'
import { HULK7 } from './hulk7'
import { BRAVADO } from './bravado'
import { CALDERA } from './caldera'
import { VIVARIUM } from './vivarium'
import { PORTAGE } from './portage'
import { VERDANCE } from './verdance'
import { CINDER } from './cinder'
import { UO } from './uo'
import { PIRATE } from './pirate'
import type { StationDef } from './types'

/** 全部站點（順序 = zone 建立順序；女帝號固定第一個）*/
export const ALL_STATIONS: StationDef[] = [NYX, ADJUDICATRIX, TENSHU, HULK7, BRAVADO, CALDERA, VIVARIUM, PORTAGE, VERDANCE, CINDER, UO, PIRATE]

export const STATION_BY_ID = new Map(ALL_STATIONS.map((s) => [s.id, s]))
