// 介面文字：zh-TW 為主、en 為輔
import { signal } from '@preact/signals'
import type { Loc } from '../shared/content/types'
import { GAME_EN, GAME_ZH } from './strings/game'

export type Lang = 'zh' | 'en'

function initialLang(): Lang {
  try {
    const v = localStorage.getItem('xc.lang')
    if (v === 'en' || v === 'zh') return v
  } catch {
    /* ignore */
  }
  return navigator.language?.startsWith('zh') || !navigator.language ? 'zh' : 'en'
}

export const lang = signal<Lang>(initialLang())

export function setLang(l: Lang): void {
  lang.value = l
  try {
    localStorage.setItem('xc.lang', l)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === 'zh' ? 'zh-Hant-TW' : 'en'
}

export function loc(l: Loc | undefined): string {
  if (!l) return ''
  return lang.value === 'en' ? l.en : l.zh
}

type Dict = Record<string, string>

const zh: Dict = {
  'app.title': 'XENOCYTE｜異胞',
  'app.tagline': '船員裡藏著會偽裝的異形與會進化的變種人。',
  'menu.name': '你的名字',
  'menu.color': '顏色',
  'menu.create': '建立房間',
  'menu.join': '加入房間',
  'menu.code': '房號',
  'menu.practice': '單機練習',
  'menu.settings': '設定',
  'menu.codex': '圖鑑',
  'menu.howto': '怎麼玩',
  'menu.connecting': '連線中…',
  'menu.noHost': '找不到房間（確認房號，或請主機確認分頁仍開著）',
  'menu.netHint': '透過 {strategy} 交換連線資訊，遊戲資料走點對點',
  'lobby.title': '大廳',
  'lobby.code': '房號',
  'lobby.copy': '複製',
  'lobby.copied': '已複製',
  'lobby.ready': '準備',
  'lobby.notReady': '取消準備',
  'lobby.start': '開始遊戲',
  'lobby.leave': '離開',
  'lobby.host': '主機',
  'lobby.bot': 'AI',
  'lobby.offline': '斷線中',
  'lobby.waiting': '等待主機開始…',
  'lobby.settings': '房間設定',
  'lobby.players': '玩家 {n}/12',
  'lobby.chat': '大廳聊天',
  'lobby.set.aliens': '異形',
  'lobby.set.mutants': '變種人',
  'lobby.set.androids': '仿生人',
  'lobby.set.auto': '依人數',
  'lobby.set.off': '無',
  'lobby.set.on': '有',
  'lobby.set.npc': 'NPC 船員',
  'lobby.set.bots': 'AI 玩家',
  'lobby.set.apo': '末日時間（分）',
  'lobby.set.localChat': '全體聊天只限同站',
  'lobby.set.boot': '死亡即退出',
  'lobby.set.ep': 'EP 倍率',
  'lobby.set.events': '事件頻率',
  'lobby.set.spectate': '主機只主持不參戰',
  'lobby.kick': '踢出',
  'lobby.hostConflict': '偵測到另一個 peer 也宣稱是主機，已忽略',
  'settings.title': '設定',
  'settings.lang': '語言',
  'settings.quality': '畫質',
  'settings.net': '連線方式',
  'settings.turn': 'TURN 伺服器（JSON，選填）',
  'settings.turnHelp': '朋友連不上時才需要。格式：[{"urls":"turn:...","username":"...","credential":"..."}]',
  'settings.volume': '音量',
  'settings.save': '儲存',
  'settings.close': '關閉',
  'settings.local': '同一瀏覽器（開發用）',
  'q.low': '低',
  'q.medium': '中',
  'q.high': '高',
  'q.ultra': '極致',
  'reject.version': '版本不符，請重新整理頁面',
  'reject.full': '房間已滿',
  'reject.started': '遊戲已開始',
  'reject.kicked': '你已被主機踢出',
  'reject.invalid': '無效的連線',
  'net.hostLost': '與主機的連線中斷',
  'net.reconnecting': '重新連線中…',
  'net.hostBg': '主機分頁在背景，遊戲可能變慢',
  'sys.left': '{name} 離開了遊戲',
  'sys.notesShared': '{name} 分享了調查筆記給你',
  'chat.noTeam': '你沒有陣營私頻',
  'chat.placeholder': 'Enter 發言，[ 開頭＝陣營私頻，;群組 訊息',
  'chat.dead': '死者',
  'chat.team': '陣營',
  'chat.sys': '系統',
  'game.time': '時間',
  'game.stability': '星區穩定度',
  'role.human': '人類',
  'role.xeno': '異形',
  'role.mutant': '變種人',
  'role.android': '仿生人',
  'role.spectator': '觀戰',
  'hud.ep': 'EP',
  'hud.hp': '生命',
  'hud.mp': '能量',
  'hud.inventory': '背包',
  'hud.dead': '你已死亡：觀戰中，只能和死者聊天',
  'hud.paused': '已暫停',
  'end.title': '結算',
  'end.crew': '人類存活了下來',
  'end.xeno': '異形取得了勝利',
  'end.mutant': '變種人取得了勝利',
  'end.draw': '無人生還',
  'end.aborted': '本局中止',
  'end.back': '回到主選單',
  'vendor.stock': '庫存 {n}',
  'vendor.restock': '{s} 秒後補貨',
  'vendor.take': '取用',
  'vendor.offlineFor': '電磁干擾停機中（{s} 秒）',
  'vendor.tooFar': '離販賣機太遠',
  'vendor.offline': '販賣機停機中',
  'vendor.soldOut': '已售完',
  'item.full': '背包已滿',
  'item.uniqueOnly': '這種裝置每人只能帶一個',
  'item.cantSuit': '這個形態不能穿防護服',
  'cast.stunned': '暈眩中',
  'cast.silenced': '被沉默，無法施放技能',
  'cast.mana': '能量不足',
  'cast.target': '無效的目標',
  'cast.zone': '目標不在同一區域',
  'cast.space': '這裡不能使用',
  'cast.once': '每局只能使用一次',
  'cast.dead': '',
  'death.innocent': '一名無辜者遇害了',
}

const en: Dict = {
  'app.title': 'XENOCYTE',
  'app.tagline': 'Among the crew hide shapeshifting aliens and evolving mutants.',
  'menu.name': 'Your name',
  'menu.color': 'Color',
  'menu.create': 'Create room',
  'menu.join': 'Join room',
  'menu.code': 'Room code',
  'menu.practice': 'Practice',
  'menu.settings': 'Settings',
  'menu.codex': 'Codex',
  'menu.howto': 'How to play',
  'menu.connecting': 'Connecting…',
  'menu.noHost': 'Room not found (check the code, or ask the host to keep the tab open)',
  'menu.netHint': 'Signaling via {strategy}; game data is peer-to-peer',
  'lobby.title': 'Lobby',
  'lobby.code': 'Room',
  'lobby.copy': 'Copy',
  'lobby.copied': 'Copied',
  'lobby.ready': 'Ready',
  'lobby.notReady': 'Unready',
  'lobby.start': 'Start game',
  'lobby.leave': 'Leave',
  'lobby.host': 'Host',
  'lobby.bot': 'AI',
  'lobby.offline': 'Offline',
  'lobby.waiting': 'Waiting for host…',
  'lobby.settings': 'Room settings',
  'lobby.players': 'Players {n}/12',
  'lobby.chat': 'Lobby chat',
  'lobby.set.aliens': 'Alien',
  'lobby.set.mutants': 'Mutant',
  'lobby.set.androids': 'Android',
  'lobby.set.auto': 'Auto',
  'lobby.set.off': 'None',
  'lobby.set.on': 'Yes',
  'lobby.set.npc': 'NPC crew',
  'lobby.set.bots': 'AI players',
  'lobby.set.apo': 'Apocalypse (min)',
  'lobby.set.localChat': 'Local-only public chat',
  'lobby.set.boot': 'Boot on death',
  'lobby.set.ep': 'EP rate',
  'lobby.set.events': 'Event rate',
  'lobby.set.spectate': 'Host spectates',
  'lobby.kick': 'Kick',
  'lobby.hostConflict': 'Another peer also claimed to be host; ignored',
  'settings.title': 'Settings',
  'settings.lang': 'Language',
  'settings.quality': 'Graphics',
  'settings.net': 'Signaling',
  'settings.turn': 'TURN servers (JSON, optional)',
  'settings.turnHelp': 'Only needed if friends cannot connect. Format: [{"urls":"turn:...","username":"...","credential":"..."}]',
  'settings.volume': 'Volume',
  'settings.save': 'Save',
  'settings.close': 'Close',
  'settings.local': 'Same browser (dev)',
  'q.low': 'Low',
  'q.medium': 'Medium',
  'q.high': 'High',
  'q.ultra': 'Ultra',
  'reject.version': 'Version mismatch — please reload',
  'reject.full': 'Room is full',
  'reject.started': 'Game already started',
  'reject.kicked': 'You were kicked by the host',
  'reject.invalid': 'Invalid connection',
  'net.hostLost': 'Lost connection to host',
  'net.reconnecting': 'Reconnecting…',
  'net.hostBg': 'Host tab is in the background; the game may slow down',
  'sys.left': '{name} left the game',
  'sys.notesShared': '{name} shared investigation notes with you',
  'chat.noTeam': 'You have no faction channel',
  'chat.placeholder': 'Enter to chat, [ for faction, ;group msg',
  'chat.dead': 'Dead',
  'chat.team': 'Faction',
  'chat.sys': 'System',
  'game.time': 'Time',
  'game.stability': 'Sector stability',
  'role.human': 'Human',
  'role.xeno': 'Alien',
  'role.mutant': 'Mutant',
  'role.android': 'Android',
  'role.spectator': 'Spectator',
  'hud.ep': 'EP',
  'hud.hp': 'Health',
  'hud.mp': 'Energy',
  'hud.inventory': 'Inventory',
  'hud.dead': 'You are dead: spectating, you can only talk with the dead',
  'hud.paused': 'Paused',
  'end.title': 'Results',
  'end.crew': 'Humanity prevails',
  'end.xeno': 'The alien triumphs',
  'end.mutant': 'The mutant triumphs',
  'end.draw': 'No survivors',
  'end.aborted': 'Game aborted',
  'end.back': 'Back to menu',
  'vendor.stock': 'Stock {n}',
  'vendor.restock': 'restock in {s}s',
  'vendor.take': 'Take',
  'vendor.offlineFor': 'EMP shutdown ({s}s)',
  'vendor.tooFar': 'Too far from the vendor',
  'vendor.offline': 'Vendor is offline',
  'vendor.soldOut': 'Sold out',
  'item.full': 'Inventory full',
  'item.uniqueOnly': 'You may only carry one of these devices',
  'item.cantSuit': 'This form cannot wear rigs',
  'cast.stunned': 'Stunned',
  'cast.silenced': 'Silenced',
  'cast.mana': 'Not enough energy',
  'cast.target': 'Invalid target',
  'cast.zone': 'Target is in another area',
  'cast.space': 'Cannot use that here',
  'cast.once': 'Only once per game',
  'cast.dead': '',
  'death.innocent': 'An innocent has been killed',
}

const dicts: Record<Lang, Dict> = { zh, en }
Object.assign(zh, GAME_ZH)
Object.assign(en, GAME_EN)

/** 其他模組可以補充字典（內容、事件、系統訊息）*/
export function addStrings(z: Dict, e: Dict): void {
  Object.assign(zh, z)
  Object.assign(en, e)
}

export function t(key: string, args?: Record<string, string | number>): string {
  const d = dicts[lang.value]
  let s = d[key] ?? dicts.zh[key] ?? key
  if (args) for (const [k, v] of Object.entries(args)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** 解碼 sim 送來的 `@key|k=v` 系統訊息 */
export function sysText(raw: string): string {
  if (!raw.startsWith('@')) return raw
  const [key, ...pairs] = raw.slice(1).split('|')
  const args: Record<string, string> = {}
  for (const p of pairs) {
    const i = p.indexOf('=')
    if (i > 0) args[p.slice(0, i)] = p.slice(i + 1)
  }
  return t(key, args)
}
