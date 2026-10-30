# 雲端 session 用 prompt

## A. 啟動／續作 prompt（每次都可以直接貼這份）

````text
你在 GitHub repo wxliu09/lab 的 freeResearch/DeadSpace 目錄工作。這是一款致敬 Warcraft III 自訂地圖 Metastasis 的瀏覽器多人隱藏身分生存遊戲（工作標題 XENOCYTE｜異胞）。研究、設計、美術、技術架構與路線圖都已經寫好，你的任務是把遊戲完整做出來。

開工前依序閱讀：
1. freeResearch/DeadSpace/CLAUDE.md（工作守則，必須遵守）
2. freeResearch/DeadSpace/PROGRESS.md（目前進度：從第一個未完成項目接著做）
3. docs/plan/roadmap.md（里程碑與驗收標準）
4. docs/design/GDD.md、docs/design/content-catalog.md
5. docs/tech/architecture.md、docs/art/art-bible.md
6. 需要原作細節時查 docs/research/（02-core-rules.md、03-world-events.md、extracted/），再不夠就跑 python3 -I tools/extract_all.py 讀解出的 JASS

已確定、不要再改的決策：
- 連線採 B 模式：主機玩家的瀏覽器就是權威 server，模擬跑在 Web Worker（20 Hz）；其他玩家用 Trystero（預設 Nostr，可切 MQTT／BitTorrent）透過 WebRTC P2P 加入；不自架任何 server；預設只用 STUN，TURN 做成可選設定。
- 直接做多人連線版本，內容一次做到完整：10 職業、18 套防護服、全部道具、異形 T1／T2×3／T3×9、變種人全部型態（含 Overlord）、仿生人、GIT 驗血、雙層世界（站內＋太空）、全部地點、全部隨機事件與末日、死亡觀戰聊天系統。
- 美術是高品質、有質感的原創致敬：結構與玩法高仿原作，名稱、文字、模型、圖示、音效全部原創（程序化生成或 CC0），不得使用原作任何素材；依 art-bible 的品質門檻與截圖自評流程。
- 技術：Vite + TypeScript strict、three.js（WebGLRenderer）＋ pmndrs postprocessing ＋ n8ao、Preact HUD、msgpackr、Vitest、Playwright；依賴鎖定版本；build 輸出到 freeResearch/DeadSpace/play/（base './'）並 commit，GitHub Pages 直接提供。
- 使用者與玩家是自己圈子的幾位朋友（3–8 人為主，上限 12）。

工作方式：
- 自主完成，不要停下來問問題。遇到需要使用者決定的事，選合理預設繼續，並記在 PROGRESS.md 的「待決定」。
- 依 roadmap 的里程碑順序推進；每完成一段可驗證的工作就 commit，每個里程碑結束時：跑完全部測試（含隱藏資訊洩漏測試）、截圖自評視覺、更新 PROGRESS.md、build play/、commit、push。完成一個里程碑後直接接著做下一個，直到全部完成或本次 session 資源用盡；結束前一定要讓 PROGRESS.md 清楚寫出下一步。
- 直接在 main 分支 commit 並 push（使用者指定的操作目錄）。如果環境強制你在別的分支工作，就照環境規定，並在 PROGRESS.md 註明分支名稱。
- 只動 freeResearch/DeadSpace/ 底下的檔案，例外是 repo 根目錄 index.html（在 freeResearch 區塊加入口卡片，格式比照 DNTCG）與 .gitignore（本專案規則已加好）。
- 適合平行的工作（例如依類別實作大量內容資料、各地點的 ASCII 版面與美術）可以交給 subagent；網路協定與可見性過濾完成後，請另開一個沒看過實作過程的 subagent 做獨立審查，專找隱藏資訊洩漏與可被 peer 濫用的訊息。
- 雲端容器可能連不到公共 Nostr／MQTT relay：多人流程用 BroadcastChannelTransport 在 Playwright 多分頁測；真實 WebRTC 驗證做不到時，記錄在 PROGRESS.md 並寫好讓使用者手動驗證的步驟。
- 回報與文件用繁體中文，技術術語保留英文。
````

## B. 只想確認進度時

````text
在 wxliu09/lab 的 freeResearch/DeadSpace，讀 PROGRESS.md 與最近的 commit，用繁體中文告訴我：已完成哪些里程碑、目前卡在哪、下一步是什麼、有哪些「待決定」需要我回覆。不要修改任何檔案。
````

## C. 補充說明

- 這是多個 session 的工作量。A 段 prompt 設計成可以重複使用：每次新 session 都貼同一份，它會從 PROGRESS.md 接著做。
- 想調整方向（例如改標題、改美術風格、加減內容），直接改對應的 docs 文件後再貼 A 段 prompt，新 session 會照新文件做。
