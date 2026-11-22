import { addStrings } from '../i18n'

// 第 7 輪音訊：設定裡的「介面／通知」音量滑桿與單聲道選項
export const SND7_ZH: Record<string, string> = {
  'settings.vol.ui': '介面／通知',
  'snd7.mono': '單聲道',
  'snd7.monoHint': '左右聲道合成一聲：只戴一邊耳機或單耳聽力時，不會漏掉只從某一邊傳來的聲音',
}

export const SND7_EN: Record<string, string> = {
  'settings.vol.ui': 'Interface / alerts',
  'snd7.mono': 'Mono audio',
  'snd7.monoHint': 'Mixes left and right into one channel, so you don’t miss sounds from one side with a single earbud or hearing in one ear',
}

addStrings(SND7_ZH, SND7_EN)
