# 技術架構

> 決策：**B 模式**：主機玩家的瀏覽器就是 game server（權威模擬跑在 Web Worker），其他玩家透過 WebRTC P2P 連到主機。不自架任何 server。
> 對象：3–8 位朋友（上限 12），以台灣境內連線為主。

## 1. 技術選型

| 層 | 選擇 | 理由 |
|---|---|---|
| 建置 | Vite + TypeScript（strict）| 快、Worker 支援好、輸出純靜態檔 |
| 渲染 | three.js（`WebGLRenderer`，WebGL2）| 生態成熟、資料多。r18x 起官方推薦的 `WebGPURenderer` 留作後期選項，先求穩定 |
| 後處理 | `postprocessing`（pmndrs）＋ `n8ao` | Bloom、SSAO、LUT、vignette、grain 都有現成高品質實作 |
| UI | Preact + `@preact/signals`（DOM overlay）| 中文排版、tooltip、表單用 DOM 遠比 canvas 好做 |
| P2P 配對 | `trystero` | 用公共基礎設施（預設 Nostr relay，可切 MQTT／BitTorrent tracker）交換 WebRTC signaling，**不需要自架 server**，遊戲資料走 P2P 不經過 relay |
| 序列化 | `msgpackr` | 二進位、快、支援 record 結構 |
| 測試 | Vitest（sim 單元測試、headless 對局）＋ Playwright（多分頁端對端、截圖）| 雲端容器已預裝 Chromium／Playwright |
| 字型 | `@fontsource/*` 自帶 | 不依賴外部 CDN |

> 所有套件**鎖定版本**（`package.json` 不用 `^`），升級要有理由。安裝前用 `npm view <pkg> version` 確認最新穩定版。Trystero 的子策略套件名稱（例如 `@trystero-p2p/mqtt`）以 npm 上的實際名稱為準。

## 2. 整體架構

```
┌──────────── 主機分頁（Host） ─────────────┐        ┌──── 其他玩家分頁（Client） ────┐
│  Main thread                               │        │  Main thread                    │
│  ├─ NetHost（Trystero room, 每個 peer 一條 │◄──────►│  ├─ NetClient                   │
│  │   DataChannel）                         │ WebRTC │  ├─ SnapshotBuffer（插值）      │
│  ├─ 轉送：peer input → worker              │        │  ├─ Renderer（three.js）        │
│  │        worker snapshot → 各 peer        │        │  ├─ HUD（Preact）               │
│  └─ 本機 Client（同 client 程式碼）        │        │  └─ Audio                       │
│                                            │        └─────────────────────────────────┘
│        │ postMessage(ArrayBuffer, transfer) │
│  ┌─────▼──────────────────────┐            │
│  │ Sim Worker（權威模擬）     │            │
│  │ fixed tick 20 Hz           │            │
│  │ 每位玩家各自的可見性過濾   │            │
│  └────────────────────────────┘            │
└────────────────────────────────────────────┘
```

- **主機自己也是一個普通 client**：它的 client 程式碼和別人完全一樣，只是傳輸層是 `WorkerTransport`（postMessage）而不是 WebRTC。
- 權威狀態只存在 Sim Worker。主機玩家的畫面也只拿到「自己看得到的」快照，所以主機不會意外看到別人的身分。

## 3. 目錄結構

```
freeResearch/DeadSpace/
├─ game/                      # 原始碼（雲端 session 需要，故例外地進版控）
│  ├─ package.json, vite.config.ts, tsconfig.json, playwright.config.ts
│  ├─ index.html
│  ├─ src/
│  │  ├─ shared/              # client 與 sim 共用：型別、常數、protocol、content 定義
│  │  │  ├─ protocol/         # 訊息型別、msgpackr 編解碼、版本號
│  │  │  └─ content/          # 資料驅動的遊戲內容（見 §4.3）
│  │  ├─ sim/                 # 純 TS 權威模擬：不得 import DOM / three
│  │  │  ├─ worker.ts         # Worker 進入點
│  │  │  ├─ world.ts, entities.ts, systems/*.ts, ai/*.ts, nav/*.ts, vision/*.ts
│  │  ├─ net/                 # Transport 介面與實作、NetHost、NetClient、lobby
│  │  ├─ client/              # 快照緩衝、插值、輸入、選取、指令卡邏輯
│  │  ├─ render/              # three.js：場景、站體建構器、材質生成、角色、特效、後處理
│  │  ├─ ui/                  # Preact HUD、選單、大廳、i18n
│  │  ├─ audio/
│  ├─ assets/                 # CC0 素材（若有），授權寫在 CREDITS.md
│  ├─ tests/                  # vitest（sim）、e2e（playwright）
│  └─ docs/                   # 開發中文件：visual-review.md、balance-notes.md
├─ play/                      # vite build 輸出（GitHub Pages 直接提供），要 commit
├─ docs/                      # 研究、設計、美術、技術、計畫（本目錄）
├─ tools/                     # 原圖解析工具（Python）
├─ PROGRESS.md                # 進度紀錄（每個 session 結束前更新）
└─ Metastasis 1.8.2.w3x
```

## 4. 模擬（Sim Worker）

### 4.1 迴圈

- 固定 tick：20 Hz（50 ms）。用 worker 內的自我校正計時器，不依賴 `requestAnimationFrame`。
- 每 tick 依序執行系統：
  1. 套用指令
  2. NPC／bot AI
  3. 移動（尋路、避讓、碰撞）
  4. 技能與 buff
  5. 投射物與傷害
  6. 死亡與屍體
  7. 感染、EP、進化
  8. 經濟與販賣機
  9. 載具與太空站
  10. 事件導演
  11. 視野
  12. 勝負
  13. 為每位玩家建構快照
- **不需要 deterministic**，主機是唯一真相；但要可重現：所有隨機都走 seedable RNG（測試可固定種子）。

### 4.2 世界與空間

- 世界 = 多個 **zone**：每座站的內部各一個 zone，再加一個太空 zone。單位永遠屬於一個 zone。
- 每個 zone 有：
  - 導航格（0.5 m）：A* 加上 string pulling 平滑路徑。
  - 牆的線段集合：給 LOS 與碰撞用。
  - 門：開關與上鎖。
  - 互動點：控制台、販賣機、GIT、出入口。
- 太空 zone 用連續座標，物件有速度與轉向；太空站的「內部 zone」與太空中的「站體實體」互相連結（站被毀時銷毀內部所有單位）。

### 4.3 資料驅動內容

所有遊戲內容寫成有型別的 TS 資料（`src/shared/content/`）：

- `roles.ts`、`classes.ts`
- `forms/xeno.ts`、`forms/mutant.ts`、`forms/android.ts`
- `suits.ts`、`items.ts`、`abilities.ts`、`vendors.ts`
- `stations/*.ts`：每站一個檔，內含 ASCII 版面、太空座標與設施
- `ships.ts`、`creatures.ts`、`events.ts`、`balance.ts`（全域倍率）

**技能用效果原語組合**，避免 300 個技能各寫一套程式碼。原語包括：

- `projectile`、`instantDamage`、`aoe`、`applyBuff`、`summon`、`teleport`、`morph`、`channel`、`dash`、`knockback`、`createZoneObject`
- `modifyStat`、`stealth`、`reveal`、`silence`、`stun`、`heal`、`shield`

原作數值以 `../research/extracted/` 為基準，換算規則見 `../design/content-catalog.md`。

### 4.4 可見性與隱藏資訊（最重要）

- 每 tick 為每位玩家計算可見實體集合：
  - 同 zone、在視野半徑內、LOS 不被牆擋，用 2D visibility polygon 或格子 raycast。
  - 加上共享視野規則：spawn 共享主人的視野，其他玩家各自獨立。
  - 太空 zone 對所有人可見。
- **快照只包含可見實體**。以下資訊永遠不進其他玩家的快照：
  - 身分、陣營。
  - 異形形態單位的擁有者（`ownerId: null`，名稱顯示「未知生物」）。
  - 異形駕駛的飛船名稱。
  - 驗血結果（只給檢測者）。
  - 死者聊天（只給死者）。
  - 群組聊天（只給群組成員）。
- 聊天的路由在 sim 內決定（依存活狀態、所在 zone、頻道）。
- **洩漏測試**是硬性要求（§9）。

### 4.5 測試掛勾

自動化測試需要強制身分、跳過時間、觸發事件。Sim Worker 提供 `testHooks` 介面給 Vitest 與 Playwright 使用。

## 5. 站體建構（ASCII 版面 → 3D）

每座站的版面用 ASCII 描述，同一份資料同時產生導航格、碰撞牆、LOS 遮擋與 3D 場景：

```
legend:
  #  牆        .  地板       D  門（可鎖 L）   C  控制台（駕駛）  V  販賣機（附 id）
  G  GIT       E  出入口拱門  S  出生點        T  傳送點          ~  危險區
  r  房間標記（房間類型與燈光主題寫在 rooms 欄位）
```

- 建構器（`render/stationBuilder.ts` 與 `sim/nav/fromLayout.ts` 共用解析器）：
  - 合併牆面，自動放牆角、門框。
  - 依房間類型撒道具，並保留通道。
  - 放燈具、烘焙頂點 AO。
  - 產生 instanced mesh。
- 原作配置圖 `../research/img/terrain-layout.png` 與 `../research/03-world-events.md` 的座標僅作為空間節奏參考，房間形狀重新設計。

## 6. 渲染（Client）

- 一次只渲染玩家所在的 zone（駕駛時渲染太空 zone，可畫中畫顯示站內）。zone 切換時淡出淡入，資產快取。
- 快照緩衝：插值延遲約 100 ms；自己的單位可做輕量預測（點擊後立即轉向與起步，伺服器修正時平滑拉回）。
- 視覺回饋不等網路：點擊標記、音效、指令確認動畫立即播放。
- 戰爭迷霧：client 用快照中的「自己的視野多邊形」產生遮罩貼圖，交給後處理合成。
- 畫質預設與效能預算見 `../art/art-bible.md` §14。

## 7. 網路（Net）

### 7.1 Transport 抽象

```ts
interface Transport {
  readonly selfId: string
  send(to: PeerId, data: Uint8Array, channel: 'reliable' | 'fast'): void
  broadcast(data: Uint8Array, channel: 'reliable' | 'fast'): void
  onMessage(cb: (from: PeerId, data: Uint8Array) => void): void
  onPeerJoin(cb: (id: PeerId) => void): void
  onPeerLeave(cb: (id: PeerId) => void): void
  close(): void
}
```

| 實作 | 用途 |
|---|---|
| `TrysteroTransport` | 正式連線 |
| `BroadcastChannelTransport` | 同瀏覽器多分頁，開發與 e2e 測試用，**不需外網** |
| `LoopbackTransport` | 單元測試、Node 裡跑 headless 對局 |
| `WorkerTransport` | 主機自己的 client ↔ worker |

### 7.2 連線流程

1. 主機按「建立房間」→ 產生 5 碼房號（排除易混淆字元）→ `joinRoom({appId:'xenocyte-v1', password: 房號}, 房號)`，並啟動 Sim Worker。
2. 朋友輸入房號加入 → 取得連線 → 送 `Hello{name, color, version, sessionToken}`。
3. 主機回 `Welcome{slot}` 與大廳狀態；版本不符直接拒絕並提示重新整理。
4. 大廳中主機調整設定 → 開始 → worker 分配身分 → 每人私下收到自己的身分。

### 7.3 訊息

| 方向 | 型別 | 通道 |
|---|---|---|
| C→H | `Hello`、`LobbyUpdate`、`Command{seq, kind, args}`、`Chat{channel, text}`、`Ack{snapshotSeq}`、`Ping` | reliable |
| H→C | `Welcome`、`LobbyState`、`Snapshot{seq, baseSeq, tick, time, delta}`、`Event{kind,…}`（一次性特效、系統訊息）、`ChatMsg`、`Pong`、`Kick` | Snapshot 走 fast，其餘 reliable |

- 指令是 RTS 命令式（移動到、攻擊、施放技能、使用道具、互動），不是逐幀按鍵，頻寬極低。
- 快照：對每位 peer 做 delta（相對於該 peer 最後 ack 的快照），位置量化到公分；預估一般情況 < 4 KB／tick／peer。
- `fast` 通道：先用 Trystero 預設（可靠有序）實作；第二階段在 `getPeers()` 取得的 `RTCPeerConnection` 上建立 `negotiated:true, ordered:false, maxRetransmits:0` 的 DataChannel，專門送快照，避免掉包時的隊頭阻塞。
- Peer 送來的訊息一律做白名單檢查，非法型別或格式錯誤直接丟棄。

### 7.4 連線韌性

- **ICE**：
  - 預設 STUN：Google、Cloudflare。
  - 設定頁可貼上 TURN 設定 JSON（存 localStorage）。朋友網路打不通時再用；Cloudflare TURN 以出站流量計費，需自行申請。
- **Signaling 策略**：預設 Nostr，設定頁可改 MQTT 或 BitTorrent；連不上時 UI 提示換策略。
- **重連**：client 的 `sessionToken` 存 `sessionStorage`；主機保留席位 90 秒，重連後送完整快照。
- **主機背景化**：
  - Sim 在 Worker，不受背景分頁計時器節流影響；主執行緒只做事件驅動的轉送。
  - 主機分頁進背景時，所有人看到「主機分頁在背景」提示。
  - 實際測量背景化後的 tick 穩定度並記錄。
- **主機離開**：本局結束，所有人顯示結算（不做主機遷移）。

## 8. 部署

- `game/` 的 `vite build` 輸出到 `../play/`（`base: './'`，`emptyOutDir: true`），**`play/` 要 commit**。這個 repo 是靜態網站，GitHub Pages 直接提供 `freeResearch/DeadSpace/play/index.html`。
- 在 repo 根目錄 `index.html` 的 freeResearch 區塊新增一張入口卡片，格式比照 DNTCG。
- 根目錄 `.gitignore`：本專案例外保留原始碼與文件；只排除 `node_modules/`、`docs/research/_raw/`、測試輸出。

## 9. 測試與品質門檻

| 層 | 內容 |
|---|---|
| Sim 單元測試 | 每個系統（移動、傷害、感染、EP 公式、GIT、勝負、販賣機庫存、站點毀滅連帶死亡）|
| Headless 對局 | `LoopbackTransport`＋bots 跑 12 人 × 模擬 15 分鐘 × 多個 seed：不可崩潰，最終必須分出勝負或平手 |
| **洩漏測試** | 對每一個送出的快照檢查：沒有不可見實體、沒有 role 欄位、異形形態沒有 ownerId、聊天沒有越權頻道 |
| E2E | Playwright 開 3–4 個分頁，透過 `BroadcastChannelTransport` 建房、加入、開局、移動、聊天 |
| 網路模擬 | Transport 包一層可注入延遲（50–200 ms）、抖動、掉包（5%）的 decorator，跑對局確認插值與重連 |
| 效能 | 12 人＋NPC 時 worker tick < 10 ms；client 在 Medium 畫質 60 fps（記錄於 PROGRESS.md）|
| 視覺 | 依 `../art/art-bible.md` §15 截圖自評 |

CI 不存在（repo 沒有 workflow），所以每個里程碑結束前在本機（雲端容器）跑完全部測試再 commit。
