// 介面文字（修正輪 J1a：太空、站點、控制台）：只能登艦的站（火口號、擺渡號）、海盜船主控台、
// 翠原星隕擊與輻射、餘燼衛星大氣護盾。sim 端以 `@key|k=v` 送出（nz／ne = 站名的中文／英文）。
// 用 addStrings 在載入時註冊：client 端要有模組 import 這個檔案（例如 ui/hud/Hud.tsx 加 `import '../strings/sim3'`）。
import { addStrings } from '../i18n'

export const SIM3_ZH: Record<string, string> = {
  // ───── 強行登艦：只能登艦的站 ─────
  'space.boardOnly': '{nz}沒有停機坪，不能停靠：請對它施放「強行登艦」，連結期間走到船艙的艙門就會進入它的登艦氣閘。',
  'space.linkedSt': '登艦連結建立（{s} 秒）：走到船艙的艙門就會進入對方站點的登艦氣閘；駕駛者先按 B 離開控制台。',
  'space.linkedAirlock': '登艦連結建立（{s} 秒）：走到登艦氣閘的出入口就會進入對方；駕駛者先按 B 離開控制台。',
  'space.linkEndAirlock': '登艦連結已中斷：登艦氣閘的出入口關閉了。',
  // ───── 翠原星轟炸 ─────
  'st.impactWarn': '軌道殘骸正墜向翠原星地表：{s} 秒後撞擊，快離開紅色警戒圈！撞擊點會留下輻射。',
  'st.bravadoImpact': '大氣擾動正在撕裂豪勇號的船體，建議立刻升空：估計再撞擊 {n} 次船體就會解體。',
  // ───── 餘燼衛星大氣護盾 ─────
  'st.cinderShieldDown': '餘燼衛星的大氣護盾崩潰了：地表陷入暴風雪，待在外面每秒受到 10 點傷害，快離開衛星表面。',
  // ───── 懸停說明 ─────
  'hover.desc.struct.consolePirate': '海盜船主控台：屬於海盜，不能駕駛。打爆它會啟動自毀程序，40 秒後整艘船解體，記得撤離。',
  'hover.desc.hz.radField': '輻射區：隕擊留下的污染，待在裡面每秒受到 20 點輻射傷害。',
}

export const SIM3_EN: Record<string, string> = {
  'space.boardOnly': '{ne} has no landing pads and cannot be docked with. Use Board on it, then walk to your cabin airlock while linked to cross into its boarding airlock.',
  'space.linkedSt': "Boarding link established ({s}s): walk to your cabin airlock to cross into the station's boarding airlock. Pilots, press B to leave the console first.",
  'space.linkedAirlock': 'Boarding link established ({s}s): walk to the boarding airlock exit to cross over. Pilots, press B to leave the console first.',
  'space.linkEndAirlock': 'Boarding link ended: the boarding airlock exit is sealed again.',
  'st.impactWarn': 'Orbital debris is falling toward the surface of Verdance: impact in {s}s. Get out of the red warning circle! The crater will be left irradiated.',
  'st.bravadoImpact': "Atmospheric turbulence is tearing at the Bravado's hull. Lift off now: about {n} more impacts and it breaks apart.",
  'st.bravadoImpact.one': "Atmospheric turbulence is tearing at the Bravado's hull. Lift off now: one more impact and it breaks apart.",
  'st.cinderShieldDown': "Cinder's atmospheric shield has collapsed: a blizzard now rakes the surface, dealing 10 damage per second to anyone out there. Get off the moon.",
  'hover.desc.struct.consolePirate': 'Pirate main console: it belongs to the pirates and cannot be piloted. Destroying it starts the self-destruct sequence; the whole ship breaks apart 40 seconds later, so get out.',
  'hover.desc.hz.radField': 'Fallout zone: contamination left by an impact. Anyone inside takes 20 radiation damage per second.',
}

addStrings(SIM3_ZH, SIM3_EN)
