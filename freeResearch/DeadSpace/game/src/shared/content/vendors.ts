// 販賣機（研究 03 §5.2；內容總表「販賣機」）。東西免費取用，靠庫存上限、補貨秒數、開局延遲控制。
// 原作「預」（未修改、沿用基底）的庫存上限本作初版一律 3；補貨秒數為「預」者另行指定並在註解標明。
// 本作改良：哨戟、力場產生器放進前哨補給；急速治療器放進醫療補給（原作 1.8.2 無取得管道）。
import { regVendors } from './registry'
import type { Loc, VendorDef, VendorStock } from './types'

const L = (zh: string, en: string): Loc => ({ zh, en })
const st = (item: string, restock: number, delay?: number, max = 3): VendorStock => (delay ? { item, max, restock, delay } : { item, max, restock })

export const VENDOR_LIST: VendorDef[] = [
  {
    id: 'medical',
    name: L('醫療補給', 'Medical Supplies'),
    model: 'vendor',
    hp: 1600,
    stock: [
      st('traumaKit', 40),
      st('antibodyKit', 10),
      st('regenBeacon', 30),
      st('geneSampler', 5, 420),
      // 本作改良：原作沒有取得管道
      st('rapidRevive', 300),
    ],
  },
  {
    id: 'suitA',
    name: L('防護服販賣機（紅）', 'Suit Vendor (Red)'),
    model: 'vendor',
    hp: 1600,
    stock: [st('suit.cryo', 0), st('suit.pyro', 0), st('suit.tesla', 0)],
  },
  {
    id: 'suitB',
    name: L('防護服販賣機（藍）', 'Suit Vendor (Blue)'),
    model: 'vendor',
    hp: 1600,
    stock: [st('suit.rad', 0), st('suit.photon', 0), st('suit.plasma', 0), st('suit.pulse', 0)],
  },
  {
    id: 'suitC',
    name: L('防護服販賣機（青）', 'Suit Vendor (Cyan)'),
    model: 'vendor',
    hp: 1600,
    stock: [st('suit.rocket', 0), st('suit.service', 0), st('suit.gatling', 0), st('suit.mag', 0)],
  },
  {
    id: 'suitD',
    name: L('防護服販賣機（黃）', 'Suit Vendor (Yellow)'),
    model: 'vendor',
    hp: 1600,
    stock: [st('suit.acid', 0), st('suit.guard', 0), st('suit.force', 0), st('suit.void', 0)],
  },
  {
    id: 'gitTester',
    name: L('基因完整性檢測儀', 'Genetic Integrity Tester'),
    model: 'git',
    hp: 6000,
    stock: [st('geneSampler', 5, 420)],
  },
  {
    id: 'fusion',
    name: L('熱融炸彈工廠', 'Fusion Charge Factory'),
    model: 'vendor',
    hp: 1600,
    stock: [st('fusionCharge', 60, 60)],
  },
  {
    id: 'teleportFactory',
    name: L('實驗傳送裝置工廠', 'Proto-Portal Factory'),
    model: 'vendor',
    hp: 1600,
    // 補貨為「預」：本作定 180 s
    stock: [st('protoPortal', 180)],
  },
  {
    id: 'maintenance',
    name: L('維修站', 'Maintenance Station'),
    model: 'vendor',
    hp: 1600,
    stock: [st('powerCore', 20), st('energyCell', 25), st('debrisClearer', 15), st('solaceShield', 40)],
  },
  {
    id: 'radar',
    name: L('雷達站', 'Radar Station'),
    model: 'vendor',
    hp: 1600,
    stock: [st('radarPing', 90)],
  },
  {
    id: 'outpost',
    name: L('前哨補給', 'Outpost Supplies'),
    model: 'vendor',
    hp: 1600,
    stock: [
      st('tracker', 15),
      st('fragGrenade', 20),
      st('empGrenade', 20),
      st('motionSensor', 40),
      st('phaseCannon', 180),
      st('phaseCloak', 15),
      // 本作改良：原作沒有取得管道；補貨比照力場產生器 180 s
      st('sentryTurret', 180),
      st('forceBarrier', 180),
    ],
  },
  {
    id: 'escapePod',
    name: L('救生艙裝置', 'Escape Pod Device'),
    model: 'vendor',
    hp: 1600,
    stock: [st('escapePass', 4)],
  },
  {
    id: 'gitResolver',
    name: L('GIT 解析器', 'GIT Resolver'),
    model: 'gitResolver',
    hp: 200,
    stock: [st('testResults', 30)],
  },
  {
    id: 'gravity',
    name: L('重力控制裝置', 'Gravitational Control Device'),
    model: 'vendor',
    hp: 12000,
    stock: [st('gravField', 80)],
  },
  {
    id: 'lq',
    name: L('LQ 倉儲', 'LQ Storage'),
    model: 'vendor',
    hp: 1600,
    // 只在動力分配台切到實驗室模式時運作（研究 03 §4.4）
    needsPower: 'lab',
    stock: [st('interfaceKit', 300), st('burstGrenade', 180), st('concStim', 180)],
  },
  {
    id: 'maintenanceB',
    name: L('收容區維修站', 'Containment Maintenance'),
    model: 'vendor',
    hp: 1600,
    invuln: true,
    // 推斥器、吸引器補貨為「預」：本作定 60 s；薰香原作補貨 0（不補）
    stock: [st('gravPusher', 60), st('gravPuller', 60), st('calmingIncense', 0)],
  },
]

regVendors(VENDOR_LIST)
