import { NYX } from './nyx'
import type { StationDef } from './types'

/** 全部站點（順序 = zone 建立順序）*/
export const ALL_STATIONS: StationDef[] = [NYX]

export const STATION_BY_ID = new Map(ALL_STATIONS.map((s) => [s.id, s]))
