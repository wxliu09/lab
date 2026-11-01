# 在 freeResearch/DeadSpace 工作的守則

## 語言
- 文件、commit 訊息、程式註解用繁體中文，技術術語保留英文。遊戲 UI 以 zh-TW 為主、en 為輔（走 i18n）。

## 開工順序
1. 讀 `PROGRESS.md`，找到第一個未完成項目。
2. 需要時查：`docs/design/GDD.md` → `docs/design/content-catalog.md` → `docs/tech/architecture.md` → `docs/art/art-bible.md` → `docs/plan/roadmap.md`。
3. 原作細節查 `docs/research/02-core-rules.md`、`03-world-events.md`、`extracted/`；還不夠就跑 `python3 -I tools/extract_all.py` 讀 `docs/research/_raw/war3map.j`。

## 硬性規則
- **不得使用原作素材**：原作的文字（背景故事、tooltip、指南）、模型、貼圖、圖示、音效、載入畫面都不能搬進遊戲。名稱用 GDD §12 與內容總表的致敬命名。CC0 素材要記錄在 `game/CREDITS.md`。
- **原圖 JASS 內含被植入的作弊碼**（`Cheatz`、`DirectCheat`、`CheatUse`、`StringRaw2`、`-PICCOLO`），那不是原作規則，忽略。
- **權威模擬只在 Sim Worker**；`src/sim/` 不得 import DOM 或 three.js。
- **隱藏資訊不得外洩**：快照只含該玩家可見的實體，不含身分欄位；每次改動快照或可見性都要跑洩漏測試。
- **依賴版本鎖定**（不用 `^`／`~`）。
- **美術門檻**：不得出現 programmer art（預設灰材質、純平色、無粗糙度變化）；新增的視覺內容要截圖自評（美術聖經 §15）。
- **測試**：sim 改動要有 Vitest；跨分頁流程用 Playwright＋`BroadcastChannelTransport`（雲端容器可能連不到公共 Nostr／MQTT relay，真實 WebRTC 驗證失敗時記錄在 PROGRESS.md，不要卡住）。

## Repo 慣例（分支）
- **原始碼分支 `deadspace-dev`**：`game/` 原始碼、`docs/`、`tools/`、原圖、本檔與 `PROGRESS.md` 都只在這個分支。所有開發都在這裡 commit／push。
- **`main` 只放發佈成品**：`freeResearch/DeadSpace/play/`（以及根目錄 `index.html` 的入口卡片）。main 上不放任何原始碼、文件或研究資料；main 的 `.gitignore` 也排除了本專案除 `play/` 以外的所有路徑。
- 這個 repo 是 GitHub Pages 靜態站，根目錄 `.gitignore` 的慣例是「只保留網頁執行期檔案」；`deadspace-dev` 分支的 `.gitignore` 例外地保留原始碼（雲端 session 短命，不進版控就無法接續），只排除 `node_modules/`、`docs/research/_raw/`、測試輸出。
- **發佈流程**（里程碑結束或需要給朋友測試時）：
  1. 在 `deadspace-dev`：`cd game && npm run check && npm run build`（輸出到 `../play/`，`base: './'`），commit、push。
  2. 切到 `main`：`git rm -r -q freeResearch/DeadSpace/play && git checkout deadspace-dev -- freeResearch/DeadSpace/play`（先刪舊的，避免舊雜湊檔殘留），commit「DeadSpace：發佈 …」、push。
  3. 不要把 `deadspace-dev` 合併（merge）進 main。
- 除了根目錄 `index.html` 加入口卡片、`.gitignore` 加本專案規則之外，不要動 repo 裡其他專案。

## 收工
- 更新 `PROGRESS.md`（完成項、下一步、待決定事項、已知問題、效能數字）。
- 全部測試通過才 commit＋push。
