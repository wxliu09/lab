# CREDITS

## 致敬

- **Metastasis**（Warcraft III 自訂地圖）— FelFox & Clan Sirs。本作的玩法、規則與世界觀結構致敬自這張地圖。
  本作**沒有使用原作任何素材**：文字、模型、貼圖、圖示、音效、載入畫面全部原創；名稱為致敬改名（對照見 `../docs/design/GDD.md` §12）。
- 翠原星的「灰狐」致敬原作作者 FelFox。

## 美術與音效

- 3D 模型、貼圖、粒子特效：全部在執行期以程式產生（three.js 幾何與 canvas 程序化貼圖），沒有外部素材檔。
- 音效與環境音：全部以 Web Audio 即時合成（`src/audio/sfx.ts`），沒有外部音檔。
- 圖示：手寫 SVG path（`src/ui/icons.tsx`）。

## 字型（SIL Open Font License 1.1）

| 字型 | 套件 | 用途 |
|---|---|---|
| Noto Sans TC | `@fontsource/noto-sans-tc` 5.3.1 | 中文介面 |
| Chakra Petch | `@fontsource/chakra-petch` 5.3.0 | 標題、英文介面 |
| JetBrains Mono | `@fontsource/jetbrains-mono` 5.3.0 | 數字、代碼 |

## 函式庫

| 套件 | 版本 | 授權 |
|---|---|---|
| three | 0.186.0 | MIT |
| postprocessing | 6.39.5 | Zlib |
| n8ao | 2.0.1 | ISC |
| preact | 10.29.8 | MIT |
| @preact/signals | 2.11.4 | MIT |
| msgpackr | 2.1.3 | MIT |
| trystero（含 @trystero-p2p/mqtt、@trystero-p2p/torrent） | 0.26.0 | MIT |

開發工具（不進正式 build）：Vite、TypeScript、Vitest、Playwright、ESLint、Prettier（皆 MIT／Apache-2.0）。

## 連線

- 信令預設使用公共 Nostr relay（可切換 MQTT 公共 broker、BitTorrent tracker），NAT 穿透使用公共 STUN。遊戲資料本身只在玩家之間 WebRTC 點對點傳輸。
