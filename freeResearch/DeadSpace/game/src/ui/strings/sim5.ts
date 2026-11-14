// 介面文字（修正輪 S2：sim 端）：門禁紀錄的「未識別」剪影（隱形中的單位經過）、反物質打擊的死因。
// sim 端以 `@key|k=v` 送出；用 addStrings 在載入時註冊，App.tsx 有 `import './strings/sim5'`。
import { addStrings } from '../i18n'

export const SIM5_ZH: Record<string, string> = {
  // 門禁紀錄：隱形中的單位照樣會讓門打開，但看不出是什麼
  'door.sil.unknown': '未識別',
  // 死因：天守的反物質打擊（施放的站在命中前被毀也一樣）
  'death.cause.atm': '死因：所在的站被反物質打擊摧毀',
  'death.hit.atm': '先前受傷：反物質打擊（{dmg} 點）',
}

export const SIM5_EN: Record<string, string> = {
  'door.sil.unknown': 'unidentified',
  'death.cause.atm': 'Cause of death: your station was destroyed by an antimatter strike',
  'death.hit.atm': 'Earlier damage: antimatter strike ({dmg})',
}

addStrings(SIM5_ZH, SIM5_EN)
