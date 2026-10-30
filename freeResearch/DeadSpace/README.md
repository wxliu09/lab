# DeadSpace（代號）— XENOCYTE｜異胞

致敬 Warcraft III 自訂地圖 *Metastasis*（FelFox & Clan Sirs，中文圈俗稱「死亡空間」）的瀏覽器多人隱藏身分生存遊戲。

- **玩法**：船員裡藏著會偽裝的異形與會進化的變種人；人類推理、驗血、合作求生，異類偽裝、感染、進化獵殺所有人；太空站可被擊毀，站內全滅。
- **連線**：主機玩家的瀏覽器就是 server（Web Worker 權威模擬），朋友用房號透過 WebRTC P2P 加入，**不需要自架任何 server**。
- **對象**：自己圈子的朋友，3–8 人為主、最多 12 人。
- **美術**：高品質、有質感的原創致敬（程序化資產＋CC0），不使用原作任何素材。

## 怎麼玩

**入口**：lab 首頁的 DeadSpace 卡片，或直接開 `freeResearch/DeadSpace/play/index.html`。建議用桌機 Chrome／Edge／Firefox。

### 開房（主機）
1. 輸入名字、選顏色 → 「建立房間」。
2. 把大廳上方的 5 字元房號（或「複製邀請連結」）傳給朋友。
3. 大廳可調：異形／變種人／仿生人數量、NPC 船員、AI 填位、末日時間、事件倍率、只限同站聊天、死亡即退出、主機只主持。
4. 大家按「準備」後，主機按「開始」。**主機分頁全程不要關**；切到背景時其他人會看到提示，遊戲會變慢。

### 加入
- 輸入名字與房號 → 「加入」，或直接點朋友給的邀請連結。

### 一個人練習
- 主選單「單機練習」：不連網，和 5 個 AI 玩一局，身分隨機。

### 連不上怎麼辦
1. 等 30 秒；仍停在「連線中」→ 主選單「設定」把信令從 Nostr 改成 MQTT 或 BitTorrent，**主機和所有人要選同一個**，然後重新開房／加入。
2. 公司網路、學校網路、部分手機熱點（對稱 NAT）可能需要 TURN：在「設定」填入 TURN 伺服器網址、帳號、密碼（例如 Cloudflare TURN），所有人都要填。
3. 換個瀏覽器或關掉會擋 WebRTC 的擴充功能（部分隱私擴充、VPN）。
4. 主機重新整理頁面＝房間解散；斷線的玩家 90 秒內重新整理可以回到原本的座位。

### 基本操作（致敬 WC3）
- 左鍵選取、右鍵移動／攻擊；`A` 攻擊移動、`S` 停止、`H` 原地；`Q W E R D F` 技能、`1–6` 道具。
- `Enter` 聊天（開頭 `[` 陣營頻道、`;群組名` 群組）；`Tab` 調查筆記；`-help` 看聊天指令。
- 死亡後可以觀戰與死者聊天；死者輸入 `-slug` 可以附身一隻蛞蝓仔（每人一次）。

## 開發

```bash
cd freeResearch/DeadSpace/game
npm ci
npm run dev          # 開發伺服器
npm run check        # tsc＋eslint＋vitest
npx playwright test  # 多分頁 e2e（BroadcastChannel）；真實 WebRTC：XC_P2P=1 npx playwright test p2p
npm run build        # 輸出到 ../play/
```

## 文件導覽

| 文件 | 內容 |
|---|---|
| [docs/research/01-map-analysis.md](docs/research/01-map-analysis.md) | 原圖總覽、規模、系統清單、植入的作弊後門、授權原則 |
| [docs/research/02-core-rules.md](docs/research/02-core-rules.md) | 從 JASS 逆向的核心規則：身分、職業、異形、變種人、仿生人、EP、GIT、死亡、勝負 |
| [docs/research/03-world-events.md](docs/research/03-world-events.md) | 地點、駕駛／對接、飛船、站點設施、經濟、隨機事件、NPC、時間軸 |
| [docs/research/extracted/](docs/research/extracted/) | 原圖物件資料：單位、道具、技能、升級／buff 資料表，`objects.json`、`placements.json` |
| [docs/design/GDD.md](docs/design/GDD.md) | 遊戲設計（致敬版）與改良清單 |
| [docs/design/content-catalog.md](docs/design/content-catalog.md) | 全部內容的實作清單與數值基準 |
| [docs/art/art-bible.md](docs/art/art-bible.md) | 美術聖經：色彩、光照、材質、角色、特效、UI、音效、畫質 |
| [docs/tech/architecture.md](docs/tech/architecture.md) | 技術架構：Worker 權威模擬、P2P 協定、可見性過濾、站體建構、測試 |
| [docs/plan/roadmap.md](docs/plan/roadmap.md) | 里程碑與驗收標準 |
| [PROGRESS.md](PROGRESS.md) | 開發進度（每個 session 更新）|
| [PROMPT.md](PROMPT.md) | 交給雲端 session 的啟動／續作 prompt |
| [CLAUDE.md](CLAUDE.md) | 在本目錄工作的守則 |

## 重新解析原圖

```bash
cd freeResearch/DeadSpace
python3 -I tools/extract_all.py   # 需要 Pillow；輸出 docs/research/_raw/（不進版控）與 extracted/
```

## 目錄

```
DeadSpace/
├─ Metastasis 1.8.2.w3x   原圖（注意：被植入作弊碼，見研究文件 §6）
├─ docs/                  研究、設計、美術、技術、計畫
├─ tools/                 MPQ／物件資料解析、資料表與地形圖產生
├─ game/                  遊戲原始碼（Vite＋TypeScript＋three.js＋Preact）
└─ play/                  建置輸出，GitHub Pages 直接提供
```
