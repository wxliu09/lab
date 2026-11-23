# 平衡量測工具（headless 大量對局）

第 8 輪審查與修改用的工具。把 `game/src` 的 sim 連同 `src/harness.ts` 打包成一個 node 可以直接跑的檔，用固定 seed 跑整局全 AI（或主機不動）的對局，每局輸出一行 JSON，再統計勝方、死因、節奏、驗血推理與 AI 的身分破綻。

打包時只注入兩個觀察用的掛鉤：`bots.ts` 的 `cmd()` 前面和 `game.ts` 的可見性計算之後，遊戲原始碼不用改。樣式變了 `build.mjs` 會直接報錯。

## 用法（在 `freeResearch/DeadSpace` 底下）

```sh
node tools/balance/build.mjs                 # → tools/balance/dist/harness.mjs（XC_NAME=名稱 改輸出檔名）
cd tools/balance
node dist/harness.mjs --n 8 --level normal --host bot --room mp --seed0 0 --count 10 --out data/r9/A_mp_bot_8_normal.jsonl
node run.mjs jobs-example.txt 3              # 一次跑一批，3 個並行；log 在 logs/
node analyze.mjs data/r9                     # 單一資料夾的完整報表
node mycompare.mjs pre r9                    # 同 seed 配對比較（data/pre 對 data/r9）
```

- **參數**：
  - `--n` 人數；`--level easy|normal`。
  - `--host bot|idle`：主機交給 AI，或主機是不動的真人。
  - `--room mp|practice`：多人規則或單機練習。
  - `--hostRole xeno|mutant|human`：練習房指定主機身分。
  - `--perf`：記錄每個 tick 的時間。
- **seed**：第 k 局用 `5000 + k×7919`，`--seed0` 是起始的 k。改動前後用同一批 seed 才能配對比較。
- **環境變數**：
  - `XC_MAXMIN=分鐘`：限制單局長度。
  - `XC_DBG=身分`：印出那個身分的 AI 下的指令和收到的私訊。
  - `XC_VARIANT=a,b`：打包時換掉一段程式，用來量建議改動的效果，寫法見 `build.mjs`。
- **輸出**：`data/`、`dist/`、`logs/` 不進版控。12 人一般難度一局約 10–40 秒，看機器負載。

## 第 8 輪的基準數字

見 `PROGRESS.md` 的「第 8 輪」：每格 10 局，95% 信賴區間很寬。只看到幾個百分點的差別時，要加局數再下結論。
