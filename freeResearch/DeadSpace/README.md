# DeadSpace（代號）— XENOCYTE｜異胞

致敬 Warcraft III 自訂地圖 *Metastasis*（FelFox & Clan Sirs，中文圈俗稱「死亡空間」）的瀏覽器多人隱藏身分生存遊戲。

- **玩法**：船員裡藏著會偽裝的異形與會進化的變種人；人類推理、驗血、合作求生，異類偽裝、感染、進化獵殺所有人；太空站可被擊毀，站內全滅。
- **連線**：主機玩家的瀏覽器就是 server（Web Worker 權威模擬），朋友用房號透過 WebRTC P2P 加入，**不需要自架任何 server**。
- **對象**：自己圈子的朋友，3–8 人為主、最多 12 人。
- **美術**：高品質、有質感的原創致敬（程序化資產＋CC0），不使用原作任何素材。

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
├─ game/                  遊戲原始碼（開發中建立）
└─ play/                  建置輸出，GitHub Pages 直接提供（開發中建立）
```
